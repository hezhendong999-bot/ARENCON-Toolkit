/**
 * ARENCON FRT — Activity Modal
 * ═══════════════════════════════════════════════════════════════════════
 * MOVED VERBATIM out of frt/js/ui/deficiencies.js (S566, stage 1 of the
 * split plan). Not one line of the block below was retyped or reworded —
 * it is the live bytes, lifted whole, and the push that carried it proved
 * that block + remainder reassemble into the original file exactly.
 *
 * WHY: deficiencies.js is 8,397 lines across four subsystems. This is the
 * first cut, chosen because it is the smallest genuinely self-contained
 * one: it owns its own state, needs nothing back from the host, and — the
 * reason it was picked ahead of the photo move/copy block — it touches no
 * photo data path.
 *
 * The host imports _showActivityModal back; nothing else here is public.
 */
import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { ImageWorkerHost } from '../workers/imageWorkerHost.js';
import { esc } from '../lib/esc.js';
import { openCameraBurst } from './cameraBurst.js';   // S693: the ONE camera — re-export of the shared burst engine, never a fork

// ── Activity Modal (v1-style) ────────────────────────────
var _activityModalPhotos = [];

export function _showActivityModal(deficId, label, editActId, preObsRef) {
  var f = Model.findDeficiency(deficId);
  if (!f) return;
  var d = f.defic;
  // S122 Push 5 — edit mode: when editActId is set, pre-fill values from
  // the existing entry and UPDATE on save instead of inserting a new one.
  var editEntry = null;
  if (editActId && d.activity) {
    for (var _ei = 0; _ei < d.activity.length; _ei++) {
      if (d.activity[_ei].id === editActId) { editEntry = d.activity[_ei]; break; }
    }
    if (editEntry && !label) label = editEntry.label;
  }
  var isCtr = (label || '').indexOf('Contractor') >= 0;
  var titleText = isCtr ? 'Contractor Response' : 'ARENCON Comment';
  titleText += ' \u2014 Pin #' + (d.num || '?');
  if (editEntry) titleText = 'Edit ' + titleText;
  // Initialize photo picker state from existing entry's photos when editing.
  _activityModalPhotos = editEntry && editEntry.photos
    ? editEntry.photos.slice().map(function(p, i) {
        return {
          id: p.id || ('act-photo-' + Date.now() + '-' + i),
          dataUrl: p.dataUrl || p.r2Url || p.thumb || '',
          filename: p.filename || ''
        };
      })
    : [];

  var ov = document.createElement('div');
  ov.id = 'activity-modal-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';

  var obs = d.observations || [];
  var hasMulti = obs.length > 1;

  var h = '<div style="background:var(--bg,white);border-radius:12px;padding:24px;width:90%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.3);color:var(--fg,#1B2438);">';
  // Title
  h += '<div style="font-weight:700;font-size:calc(16px + var(--ts));margin-bottom:16px;">' + titleText + '</div>';
  // Observation ref dropdown (if multiple) — prefill from edit entry or preObsRef hint
  if (hasMulti) {
    var _editObsRef = editEntry && editEntry.obsRef ? editEntry.obsRef : (preObsRef || '');
    h += '<div style="margin-bottom:12px;"><label class="defic-label" style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Regarding</label>';
    h += '<select id="am-obs-ref" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));background:var(--bg,white);color:var(--fg);box-sizing:border-box;">';
    h += '<option value=""' + (_editObsRef === '' ? ' selected' : '') + '>All observations</option>';
    obs.forEach(function(o, i) {
      var lbl = String.fromCharCode(65 + i) + ') ' + ((o.text || '').substring(0, 50) || 'Observation ' + (i + 1));
      var v = String.fromCharCode(65 + i);
      h += '<option value="' + v + '"' + (_editObsRef === v ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    });
    h += '</select></div>';
  }
  // Date — prefill from edit entry if present
  var _dateInit = (editEntry && editEntry.date) ? editEntry.date : new Date().toISOString().split('T')[0];
  h += '<div style="margin-bottom:12px;"><label class="defic-label" style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Date</label>';
  h += '<input type="date" id="am-date" value="' + _dateInit + '" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));background:var(--bg,white);color:var(--fg);box-sizing:border-box;"></div>';
  // Comment — prefill from edit entry if present
  var _textInit = editEntry && editEntry.text ? esc(editEntry.text) : '';
  h += '<div style="margin-bottom:12px;"><label class="defic-label" style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Comment</label>';
  h += '<textarea id="am-text" rows="4" placeholder="Enter response or comment..." style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));resize:vertical;box-sizing:border-box;background:var(--bg,white);color:var(--fg);outline:none;line-height:1.5;">' + _textInit + '</textarea></div>';
  // Photos
  h += '<div style="margin-bottom:12px;"><label class="defic-label" style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Photos (optional)</label>';
  h += '<div id="am-photo-thumbs" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;"></div>';
  h += '<div id="am-photo-zone" class="photo-zone-compact" ondragover="event.preventDefault();this.classList.add(\'drag-over\')" ondragleave="this.classList.remove(\'drag-over\')">';
  h += '<span style="font-size:calc(11px + var(--ts));color:var(--silver);">Drop photos or</span>';
  h += '<button class="pz-upload" id="am-upload-btn">\uD83D\uDCCE Upload</button>';
  h += '<button class="pz-camera" id="am-camera-btn">\uD83D\uDCF7 Camera</button>';
  h += '</div></div>';
  // Footer buttons (v1 style: right-aligned, Cancel + Add Entry)
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">';
  h += '<button id="am-save" class="btn-muted-ok">' + (editEntry ? 'Save Changes' : 'Add Entry') + '</button>';
  h += '<button id="am-cancel" class="btn-muted-cancel">Cancel</button>';
  h += '</div></div>';

  ov.innerHTML = h;
  document.body.appendChild(ov);

  // Wire photo zone drop
  var zone = ov.querySelector('#am-photo-zone');
  zone.addEventListener('drop', function(ev) {
    ev.preventDefault(); zone.classList.remove('drag-over');
    if (ev.dataTransfer && ev.dataTransfer.files) {
      for (var i = 0; i < ev.dataTransfer.files.length; i++) {
        if (ev.dataTransfer.files[i].type.startsWith('image/')) _amAddPhoto(ev.dataTransfer.files[i]);
      }
    }
  });

  function _amFileInput(capture) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    if (capture) inp.capture = 'environment';
    inp.onchange = function() {
      if (inp.files) for (var i = 0; i < inp.files.length; i++) _amAddPhoto(inp.files[i]);
    };
    inp.click();
  }

  ov.querySelector('#am-upload-btn').addEventListener('click', function(ev) { ev.stopPropagation(); _amFileInput(false); });
  /* S693 — Camera routes through the ONE burst camera (S284 engine). This was
     the last live single-shot capture input in FRT: S331 wired it before the
     burst engine existed, and it silently lost every S544/S545/S546 protection
     (disk-write-on-shutter, cancel-confirm, mid-burst recovery). Contract:
       File[] → feed the modal's existing photo pipeline (_amAddPhoto)
       []     → cancelled / Done with zero shots — no-op
       null   → unsupported or denied — TELL the user; never auto-click a
                capture input (the user gesture is gone by then and Android
                Chrome blocks it, S159). Upload stays the plain picker.
     Called directly in the tap handler so getUserMedia keeps the gesture. */
  var _amCam = ov.querySelector('#am-camera-btn');
  if (_amCam) _amCam.addEventListener('click', function(ev) {
    ev.stopPropagation();
    var _pid = null;
    try { _pid = new URLSearchParams(window.location.search).get('project'); } catch (_) {}
    var _lbl = 'Activity \u2014 Deficiency #' + (d && d.num != null ? d.num : '?');
    openCameraBurst({ projectId: _pid, tool: 'frt', label: _lbl }).then(function(files) {
      if (files === null) { toast('Camera unavailable or permission denied \u2014 use \uD83D\uDCCE Upload'); return; }
      if (files && files.length) { for (var i = 0; i < files.length; i++) _amAddPhoto(files[i]); }
    });
  });

  ov.querySelector('#am-cancel').addEventListener('click', function() { _activityModalPhotos = []; ov.remove(); });

  ov.querySelector('#am-save').addEventListener('click', function() {
    var textEl = ov.querySelector('#am-text');
    var text = textEl ? (textEl.value || '').trim() : '';
    var date = ov.querySelector('#am-date').value || new Date().toISOString().split('T')[0];
    var obsRefEl = ov.querySelector('#am-obs-ref');
    var obsRef = obsRefEl ? obsRefEl.value || null : null;
    if (!text && !_activityModalPhotos.length) { toast('Enter a comment or add photos'); return;  }

    if (editEntry) {
      // S122 Push 5 — update existing entry
      var updatedPhotos = _activityModalPhotos.length
        ? _activityModalPhotos.map(function(p) { return { id: p.id, dataUrl: p.dataUrl, filename: p.filename }; })
        : [];
      Model.updateActivityEntry(deficId, editEntry.id, {
        text: text || '\u2014',
        date: date,
        obsRef: obsRef,
        photos: updatedPhotos
      });
      Model.saveNow();
    } else {
      var entry = Model.addActivityEntry(deficId, label, text || '\u2014', obsRef);
      if (entry) {
        entry.date = date;
        if (_activityModalPhotos.length) {
          entry.photos = _activityModalPhotos.map(function(p) { return { id: p.id, dataUrl: p.dataUrl, filename: p.filename }; });
        }
        Model.saveNow();
      }
    }
    _activityModalPhotos = [];
    ov.remove();
    initDeficiencies.render();
    toast(editEntry ? 'Activity entry updated' : 'Activity entry added');
  });

  // S122 Push 5 — when editing, render the existing photos as thumbs immediately.
  if (editEntry && _activityModalPhotos.length) _amRenderThumbs();
  setTimeout(function() { var ed = ov.querySelector('#am-text'); if (ed) ed.focus(); }, 100);
}

function _amAddPhoto(file) {
  // S130 5.4: compression in worker (OffscreenCanvas).
  ImageWorkerHost.compressFile(file, { maxW: 1200, quality: 0.8 })
    .then(function(r) {
      var photo = {
        id: 'aph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        dataUrl: r.dataUrl,
        filename: file.name || 'photo.jpg'
      };
      _activityModalPhotos.push(photo);
      _amRenderThumbs();
    })
    .catch(function(err) {
      console.warn('[Deficiencies] activity photo compression failed:', err && err.message);
    });
}

function _amRenderThumbs() {
  var container = document.getElementById('am-photo-thumbs');
  if (!container) return;
  var html = '';
  _activityModalPhotos.forEach(function(p, i) {
    html += '<div style="position:relative;width:56px;height:56px;border-radius:6px;overflow:hidden;border:1px solid var(--border,#DDE1E7);">';
    html += '<img src="' + p.dataUrl + '" style="width:100%;height:100%;object-fit:cover;">';
    html += '<button data-am-remove="' + i + '" style="position:absolute;top:1px;right:1px;background:rgba(0,0,0,.65);color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;line-height:18px;text-align:center;cursor:pointer;padding:0;">\u2715</button>';
    html += '</div>';
  });
  container.innerHTML = html;
  container.querySelectorAll('[data-am-remove]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.getAttribute('data-am-remove'));
      _activityModalPhotos.splice(idx, 1);
      _amRenderThumbs();
    });
  });
}

