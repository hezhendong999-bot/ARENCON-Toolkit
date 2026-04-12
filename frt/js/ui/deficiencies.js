/**
 * ARENCON FRT v2 — Deficiencies UI
 * ═════════════════════════════════
 * 
 * Interactive deficiency management:
 *   - Add/remove contractors
 *   - Add deficiencies per contractor or general
 *   - Edit observation text (two-way binding)
 *   - Change status/priority
 *   - Lifecycle tabs (Active / Site General / Closed)
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm, showPrompt } from '../shared/dialogs.js';
import { R2 } from '../data/r2.js';

// ── Helpers ──────────────────────────────────────────────
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function deficDesc(d) {
  if (d.observations && d.observations.length && d.observations[0].text) return d.observations[0].text;
  if (d.entries && d.entries.length && d.entries[0].description) return d.entries[0].description;
  return d.description || '';
}
function deficIsOpen(d) { return d.status === 'open' || d.status === 'Outstanding'; }
function deficIsClosed(d) { return d.status === 'closed' || d.status === 'Addressed & Closed'; }

var _activeDlcTab = 'active';

// ── Activity Modal (v1-style) ────────────────────────────
var _activityModalPhotos = [];

function _showActivityModal(deficId, label) {
  var f = Model.findDeficiency(deficId);
  if (!f) return;
  var d = f.defic;
  var isCtr = (label || '').indexOf('Contractor') >= 0;
  var titleText = isCtr ? 'Contractor Response' : 'ARENCON Comment';
  titleText += ' \u2014 Pin #' + (d.num || '?');
  _activityModalPhotos = [];

  var ov = document.createElement('div');
  ov.id = 'activity-modal-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';

  var obs = d.observations || [];
  var hasMulti = obs.length > 1;

  var h = '<div style="background:var(--bg,white);border-radius:12px;padding:24px;width:90%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.3);color:var(--fg,#1B2438);">';
  // Title
  h += '<div style="font-weight:700;font-size:calc(16px + var(--ts));margin-bottom:16px;">' + titleText + '</div>';
  // Observation ref dropdown (if multiple)
  if (hasMulti) {
    h += '<div style="margin-bottom:12px;"><label class="defic-label" style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Regarding</label>';
    h += '<select id="am-obs-ref" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));background:var(--bg,white);color:var(--fg);box-sizing:border-box;">';
    h += '<option value="">All observations</option>';
    obs.forEach(function(o, i) {
      var lbl = String.fromCharCode(65 + i) + ') ' + ((o.text || '').substring(0, 50) || 'Observation ' + (i + 1));
      h += '<option value="' + String.fromCharCode(65 + i) + '">' + esc(lbl) + '</option>';
    });
    h += '</select></div>';
  }
  // Date
  h += '<div style="margin-bottom:12px;"><label class="defic-label" style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Date</label>';
  h += '<input type="date" id="am-date" value="' + new Date().toISOString().split('T')[0] + '" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));background:var(--bg,white);color:var(--fg);box-sizing:border-box;"></div>';
  // Comment
  h += '<div style="margin-bottom:12px;"><label class="defic-label" style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Comment</label>';
  h += '<textarea id="am-text" rows="4" placeholder="Enter response or comment..." style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));resize:vertical;box-sizing:border-box;background:var(--bg,white);color:var(--fg);outline:none;line-height:1.5;"></textarea></div>';
  // Photos
  h += '<div style="margin-bottom:12px;"><label class="defic-label" style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Photos (optional)</label>';
  h += '<div id="am-photo-thumbs" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;"></div>';
  h += '<div id="am-photo-zone" class="photo-zone-compact" ondragover="event.preventDefault();this.classList.add(\'drag-over\')" ondragleave="this.classList.remove(\'drag-over\')">';
  h += '<span style="font-size:calc(11px + var(--ts));color:var(--silver);">Drop photos or</span>';
  h += '<button class="pz-upload" id="am-upload-btn">\uD83D\uDCCE Upload</button>';
  h += '</div></div>';
  // Footer buttons (v1 style: right-aligned, Cancel + Add Entry)
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">';
  h += '<button id="am-cancel" style="padding:8px 20px;border:1.5px solid var(--border);border-radius:6px;background:var(--bg,white);color:var(--fg);cursor:pointer;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));">Cancel</button>';
  h += '<button id="am-save" style="padding:8px 20px;border:none;border-radius:6px;background:#9C2742;color:white;cursor:pointer;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));font-weight:700;">Add Entry</button>';
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

  ov.querySelector('#am-cancel').addEventListener('click', function() { _activityModalPhotos = []; ov.remove(); });

  ov.querySelector('#am-save').addEventListener('click', function() {
    var textEl = ov.querySelector('#am-text');
    var text = textEl ? (textEl.value || '').trim() : '';
    var date = ov.querySelector('#am-date').value || new Date().toISOString().split('T')[0];
    var obsRefEl = ov.querySelector('#am-obs-ref');
    var obsRef = obsRefEl ? obsRefEl.value || null : null;
    if (!text && !_activityModalPhotos.length) { toast('Enter a comment or add photos'); return;  }

    var entry = Model.addActivityEntry(deficId, label, text || '\u2014', obsRef);
    if (entry) {
      entry.date = date;
      if (_activityModalPhotos.length) {
        entry.photos = _activityModalPhotos.map(function(p) { return { id: p.id, dataUrl: p.dataUrl, filename: p.filename }; });
      }
      Model.saveNow();
    }
    _activityModalPhotos = [];
    ov.remove();
    initDeficiencies.render();
    toast('Activity entry added');
  });

  setTimeout(function() { var ed = ov.querySelector('#am-text'); if (ed) ed.focus(); }, 100);
}

function _amAddPhoto(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxW = 1200, w = img.width, h2 = img.height;
      if (w > maxW) { h2 = Math.round(h2 * maxW / w); w = maxW; }
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h2;
      cv.getContext('2d').drawImage(img, 0, 0, w, h2);
      var dataUrl = cv.toDataURL('image/jpeg', 0.8);
      var photo = { id: 'aph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), dataUrl: dataUrl, filename: file.name || 'photo.jpg' };
      _activityModalPhotos.push(photo);
      _amRenderThumbs();
      cv.width = 1; cv.height = 1;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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

// ── Deficiency Card (interactive) ────────────────────────
export function buildDeficCard(d, ctrId) {
  var obs = d.observations || [];
  var isOpen = deficIsOpen(d);
  var isClosed = deficIsClosed(d);
  var circleColor = isClosed ? '#1A7A4A' : '#C0392B';

  var h = '<div class="defic-item" data-defic-id="' + esc(d.id) + '" data-status="' + esc(d.status || 'open') + '">';
  h += '<div class="defic-item-row">';
  h += '<div class="defic-num-circle" style="background:' + circleColor + ';">' + (d.num || '?') + '</div>';
  h += '<div class="defic-item-content">';

  // Status + priority row
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">';
  h += '<select class="pin-status-sel" data-action="status" data-defic-id="' + esc(d.id) + '" style="width:auto;padding:3px 8px;font-size:calc(11px + var(--ts));">';
  h += '<option value="open"' + (isOpen ? ' selected' : '') + '>Outstanding</option>';
  h += '<option value="closed"' + (isClosed ? ' selected' : '') + '>Addressed &amp; Closed</option>';
  h += '</select>';
  h += '<select data-action="priority" data-defic-id="' + esc(d.id) + '" style="padding:3px 8px;border:1.5px solid var(--border);border-radius:4px;font-size:calc(11px + var(--ts));font-family:Calibri,sans-serif;font-weight:600;background:var(--smoke);">';
  var pris = ['general', 'high', 'low'];
  pris.forEach(function(p) {
    h += '<option value="' + p + '"' + (d.priority === p ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
  });
  h += '</select>';
  // IAR toggle
  h += '<button data-action="toggle-iar" data-defic-id="' + esc(d.id) + '" style="border:none;background:' + (d.iar ? '#E91E8C' : '#CBD5E0') + ';color:white;border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;font-weight:600;cursor:pointer;">' + (d.iar ? '\u26A1 IAR' : 'IAR') + '</button>';
  if (d.drawingId) {
    var _dwgs = Model.getDrawings();
    var _dwgName = '';
    for (var _di = 0; _di < _dwgs.length; _di++) { if (_dwgs[_di].id === d.drawingId) { _dwgName = _dwgs[_di].name || 'Drawing'; break; } }
    h += '<button data-action="view-pin" data-defic-id="' + esc(d.id) + '" style="border:none;background:#2196F3;color:white;border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;font-weight:600;cursor:pointer;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(_dwgName) + '">\uD83D\uDCCC ' + esc(_dwgName) + '</button>';
  } else {
    h += '<button data-action="place-pin" data-defic-id="' + esc(d.id) + '" style="border:1px dashed var(--border);background:transparent;color:var(--silver);border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">\uD83D\uDCCC Pin</button>';
  }
  h += '</div>';

  // Closed note (only when status is closed)
  if (isClosed) {
    h += '<div style="margin-bottom:6px;">';
    h += '<div style="font-size:calc(10px + var(--ts));font-weight:700;color:#1A7A4A;margin-bottom:2px;">Closed Note</div>';
    h += '<textarea data-action="closed-note" data-defic-id="' + esc(d.id) + '" style="width:100%;min-height:36px;border:1.5px solid rgba(26,122,74,.3);border-radius:6px;padding:6px 8px;font-size:calc(12px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:rgba(26,122,74,.03);" placeholder="Closing remarks...">' + esc(d.closedNote || '') + '</textarea>';
    h += '</div>';
  }

  // Multiple observations
  var hasMulti = obs.length > 1;
  if (obs.length) {
    obs.forEach(function(o, oi) {
      var lbl = hasMulti ? String.fromCharCode(65 + oi) + ') ' : '';
      var addrCls = o.addressed ? 'border-left:3px solid #1A7A4A;background:rgba(26,122,74,.05);' : '';
      h += '<div style="margin-bottom:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;' + addrCls + '">';
      // Observation header row
      if (hasMulti) {
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
        h += '<span style="font-size:calc(11px + var(--ts));font-weight:700;color:' + (o.addressed ? '#1A7A4A' : 'var(--ink)') + ';">' + lbl + 'Observation' + _aiDot + '</span>';
        h += '<div style="display:flex;gap:4px;align-items:center;">';
        h += '<button data-action="toggle-addressed" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:' + (o.addressed ? '#1A7A4A' : '#CBD5E0') + ';color:white;border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">' + (o.addressed ? '\u2611 Addressed' : '\u2610 Open') + '</button>';
        if (obs.length > 1) h += '<button data-action="spinoff-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:#2196F3;color:white;border-radius:4px;padding:2px 6px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;" title="Spin off as new deficiency">\u21B1</button>';
        if (obs.length > 1) h += '<button data-action="remove-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:#E53E3E;color:white;border-radius:4px;padding:2px 6px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;" title="Remove observation">\u2715</button>';
        h += '</div></div>';
      }
      // Textarea
      var _aiDot = o.aiReviewed ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#1A7A4A;margin-left:6px;vertical-align:middle;" title="AI reviewed"></span>' : '';
      h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" ';
      h += 'style="width:100%;min-height:56px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:var(--smoke);"';
      h += ' placeholder="Describe the observation...">' + esc(o.text || '') + '</textarea>';
      // Observation photos
      var obsPhotos = o.photos || [];
      if (obsPhotos.length) {
        h += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0;">';
        obsPhotos.forEach(function(ph, phi) {
          var src = ph.r2Url || ph.dataUrl || '';
          if (src) {
            h += '<div class="obs-photo-wrap" style="position:relative;width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border);">';
            h += '<img data-action="open-lightbox" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" src="' + esc(src) + '" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" loading="lazy">';
            h += '<button data-action="ai-suggest-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" class="photo-ai-btn" title="AI Suggest from this photo">\u2728</button>';
            h += '<button data-action="delete-obs-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" style="position:absolute;top:1px;right:1px;background:rgba(0,0,0,.6);color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;line-height:18px;text-align:center;cursor:pointer;padding:0;" title="Remove photo">\u2715</button>';
            h += '</div>';
          }
        });
        h += '</div>';
      }
      // Photo zone per observation
      h += '<div class="photo-zone-compact" data-action="photo-drop" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"';
      h += ' ondragover="event.preventDefault();this.classList.add(\'drag-over\')"';
      h += ' ondragleave="this.classList.remove(\'drag-over\')">';
      h += '<button class="pz-upload" data-action="photo-upload" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">\uD83D\uDCCE Upload</button>';
      h += '<button class="pz-camera" data-action="photo-camera" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:#37474F;color:white;border-radius:5px;padding:4px 10px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));font-weight:600;cursor:pointer;">\uD83D\uDCF7 Camera</button>';
      if (obsPhotos.length) {
        h += '<button data-action="ai-suggest-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="pz-ai-suggest" title="AI Suggest description from all photos">\u2728 AI Suggest</button>';
      }
      h += '</div>';
      h += '</div>';
    });
    // Add observation button
    h += '<button data-action="add-obs" data-defic-id="' + esc(d.id) + '" style="border:1px dashed var(--border);background:transparent;color:var(--silver);border-radius:4px;padding:4px 10px;font-size:calc(11px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;margin-bottom:6px;">+ Add Observation</button>';
  } else {
    h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="0" ';
    h += 'style="width:100%;min-height:56px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:var(--smoke);"';
    h += ' placeholder="Describe the deficiency..."></textarea>';
  }

  // Activity log
  var activity = d.activity || [];
  if (activity.length) {
    h += '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);">';
    h += '<div style="font-size:calc(10px + var(--ts));font-weight:700;color:var(--silver);margin-bottom:4px;">Activity Log</div>';
    activity.slice().sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); }).forEach(function(a) {
      if (a.autoGenerated) return;
      var isCtr = (a.label || '').indexOf('Contractor') >= 0;
      var bgColor = isCtr ? '#FEF3E2' : '#EBF4FF';
      var lColor = isCtr ? '#E67E22' : '#1565C0';
      h += '<div style="margin-bottom:3px;padding:4px 6px;background:' + bgColor + ';border-radius:4px;font-size:calc(11px + var(--ts));">';
      h += '<span style="color:' + lColor + ';font-weight:600;">' + esc(a.label || 'Note') + '</span> <span style="color:var(--silver);font-size:calc(10px + var(--ts));">' + esc(a.date || '') + '</span>';
      h += '<div style="margin-top:2px;">' + esc(a.text || '\u2014') + '</div>';
      h += '</div>';
    });
    h += '</div>';
  }

  // Activity add buttons + card action footer
  h += '<div class="defic-actions">';
  h += '<button class="defic-act-btn act-response" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="Contractor Response">+ Contractor Response</button>';
  h += '<button class="defic-act-btn act-comment" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="ARENCON">+ ARENCON Comment</button>';
  if (isOpen) {
    h += '<button class="defic-act-btn act-close" data-action="close-defic" data-defic-id="' + esc(d.id) + '">\u2714 Close</button>';
  } else {
    h += '<button class="defic-act-btn act-reopen" data-action="reopen-defic" data-defic-id="' + esc(d.id) + '">\u21A9 Reopen</button>';
  }
  h += '<button class="defic-act-btn act-remove" data-action="delete-defic" data-defic-id="' + esc(d.id) + '">\u2715 Remove</button>';
  h += '<div style="position:relative;">';
  h += '<button class="defic-act-btn act-more" data-action="toggle-more" data-defic-id="' + esc(d.id) + '">\u22EF</button>';
  h += '<div class="defic-more-popup" id="more-' + esc(d.id) + '">';
  h += '<button data-action="dup-defic" data-defic-id="' + esc(d.id) + '">\u29C9 Duplicate</button>';
  h += '<button data-action="reassign-defic" data-defic-id="' + esc(d.id) + '">\u21D7 Move to\u2026</button>';
  if (d.drawingId) {
    h += '<button data-action="remove-pin" data-defic-id="' + esc(d.id) + '">\uD83D\uDCCC Remove Pin</button>';
  }
  h += '</div></div>';
  h += '</div>';

  // Noted date
  if (d.notedDate || d.date) {
    h += '<div class="defic-noted">' + esc(d.notedDate || d.date) + '</div>';
  }

  h += '</div></div></div>';
  return h;
}

var _foldedGroups = {};

// ── Group Builder ────────────────────────────────────────
function buildGroup(ctrId, name, items, totalCount) {
  var countLabel = items.length + ' active';
  if (totalCount && totalCount > items.length) countLabel += ' / ' + totalCount + ' total';
  var isFolded = _foldedGroups[ctrId || '__general__'];
  var arrow = isFolded ? '\u25B6' : '\u25BC';

  var h = '<div class="defic-group" data-ctr-id="' + esc(ctrId || '__general__') + '">';
  h += '<div class="defic-group-header" data-action="toggle-fold" data-ctr-id="' + esc(ctrId || '__general__') + '" style="background:#1C2333;color:white;padding:10px 16px;cursor:pointer;user-select:none;">';
  h += '<span style="display:flex;align-items:center;gap:8px;"><span class="ctr-fold-arrow" style="font-size:12px;width:14px;display:inline-block;">' + arrow + '</span> \uD83D\uDC77 ' + esc(name) + '</span>';
  h += '<span style="font-size:calc(12px + var(--ts));opacity:.7;">' + countLabel + '</span>';
  h += '</div>';

  h += '<div class="defic-group-body" style="' + (isFolded ? 'display:none;' : '') + '">';
  if (!items.length) {
    h += '<div class="defic-group-empty">No active deficiencies for this contractor.</div>';
  }
  items.forEach(function(d) { h += buildDeficCard(d, ctrId); });

  h += '<div class="add-defic-btn-wrap">';
  h += '<button class="btn btn-outline btn-sm" data-action="add-defic" data-ctr-id="' + esc(ctrId || '') + '">+ Add Deficiency</button>';
  h += '</div></div></div>';
  return h;
}

// ── Deficiency Log Summary Table ─────────────────────────
function _renderDeficLog(proj, allDefics) {
  var el = document.getElementById('defic-log-container');
  if (!el) return;
  if (!allDefics.length) { el.innerHTML = '<p style="color:var(--silver);font-size:calc(12px + var(--ts));padding:8px;">No deficiencies recorded yet.</p>'; return; }
  var _curInst = proj.currentFrtInstance || 1;
  var ctrGroups = {};
  allDefics.forEach(function(d) {
    var name = d.contractorName || 'Site General';
    if (!ctrGroups[name]) ctrGroups[name] = [];
    ctrGroups[name].push(d);
  });
  var h = '<table class="defic-summary-table">';
  h += '<thead><tr><th style="text-align:left;">Contractor</th>';
  h += '<th style="text-align:center;">Total</th>';
  h += '<th style="text-align:center;">New This Report</th>';
  h += '<th style="text-align:center;">Outstanding</th>';
  h += '<th style="text-align:center;">IAR</th>';
  h += '<th style="text-align:center;">Closed</th></tr></thead><tbody>';
  var tTotal = 0, tNew = 0, tOut = 0, tIar = 0, tClosed = 0;
  Object.keys(ctrGroups).forEach(function(name) {
    var gc = ctrGroups[name];
    var total = gc.length;
    var nw = gc.filter(function(d) { return (d.defic.notedOnInstance || 1) === _curInst; }).length;
    var outstanding = gc.filter(function(d) { return deficIsOpen(d.defic); }).length;
    var iar = gc.filter(function(d) { return d.defic.iar; }).length;
    var closed = gc.filter(function(d) { return deficIsClosed(d.defic); }).length;
    tTotal += total; tNew += nw; tOut += outstanding; tIar += iar; tClosed += closed;
    h += '<tr>';
    h += '<td style="font-weight:600;">' + esc(name) + '</td>';
    h += '<td style="text-align:center;">' + total + '</td>';
    h += '<td style="text-align:center;font-weight:700;">' + nw + '</td>';
    h += '<td style="text-align:center;color:#C0392B;font-weight:700;">' + outstanding + '</td>';
    h += '<td style="text-align:center;color:#FF69B4;font-weight:700;">' + iar + '</td>';
    h += '<td style="text-align:center;color:#1A7A4A;font-weight:700;">' + closed + '</td></tr>';
  });
  h += '<tr style="font-weight:700;">';
  h += '<td>TOTAL</td>';
  h += '<td style="text-align:center;">' + tTotal + '</td>';
  h += '<td style="text-align:center;">' + tNew + '</td>';
  h += '<td style="text-align:center;color:#C0392B;">' + tOut + '</td>';
  h += '<td style="text-align:center;color:#FF69B4;">' + tIar + '</td>';
  h += '<td style="text-align:center;color:#1A7A4A;">' + tClosed + '</td></tr>';
  h += '</tbody></table>';
  el.innerHTML = h;
}

// ── Contractors on Site Chips ────────────────────────────
function _renderContractorsOnSite(proj) {
  var el = document.getElementById('contractors-on-site');
  if (!el) return;
  var ctrs = proj.contractors || [];
  var h = '<div style="padding:12px 0;margin-bottom:8px;">';
  h += '<div style="font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel);margin-bottom:8px;">Contractors on Site</div>';
  h += '<div class="contractor-chips" style="display:flex;flex-wrap:wrap;gap:8px;min-height:28px;margin-bottom:10px;">';
  ctrs.forEach(function(c) {
    h += '<div class="contractor-chip"><span>' + esc(c.name) + '</span>';
    h += '<button data-action="edit-contractor" data-ctr-id="' + esc(c.id) + '" title="Rename" style="background:none;border:none;cursor:pointer;font-size:calc(11px + var(--ts));padding:0 2px;opacity:.7;color:inherit;">\u270F</button>';
    h += '<button data-action="remove-contractor" data-ctr-id="' + esc(c.id) + '" title="Remove">\u2715</button>';
    h += '</div>';
  });
  h += '</div>';
  h += '<div class="contractor-add" style="display:flex;gap:8px;align-items:center;">';
  h += '<input type="text" id="new-contractor-input" placeholder="e.g. ABC Sprinklers" style="flex:1;max-width:240px;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));background:var(--smoke);color:var(--fg);">';
  h += '<button class="btn btn-outline btn-sm" data-action="add-contractor" style="color:var(--steel);border-color:var(--border);">+ Add Contractor</button>';
  h += '<button class="btn btn-sm" data-action="add-general" style="background:none;border:1.5px solid #9C2742;color:#9C2742;border-radius:6px;padding:5px 12px;font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));font-weight:600;cursor:pointer;">+ General Deficiency</button>';
  h += '</div></div>';
  el.innerHTML = h;
}

// ── Render ───────────────────────────────────────────────
export var initDeficiencies = {

  render: function() {
    var proj = Model.getProject();
    var container = document.getElementById('deficiencies-container');
    if (!container) return;
    if (!proj) { container.innerHTML = ''; return; }

    var dlcTabs = document.getElementById('defic-lifecycle-tabs');
    if (dlcTabs) dlcTabs.style.display = 'flex';

    var allDefics = Model.getAllDeficiencies(proj);

    // Render Deficiency Log summary table
    _renderDeficLog(proj, allDefics);

    // Render Contractors on Site chips
    _renderContractorsOnSite(proj);

    var activeCount = 0, generalCount = 0, closedCount = 0;
    allDefics.forEach(function(d) {
      if (deficIsClosed(d.defic)) closedCount++;
      else if (deficIsOpen(d.defic) && !d.contractorId) generalCount++;
      else if (deficIsOpen(d.defic) && d.contractorId) activeCount++;
      // Items with unrecognized status are not counted in any tab
    });

    if (_activeDlcTab === 'active') {
      _renderActiveTab(proj, container);
    } else if (_activeDlcTab === 'general') {
      _renderGeneralTab(proj, container);
    } else if (_activeDlcTab === 'closed') {
      _renderClosedTab(allDefics.filter(function(d) { return deficIsClosed(d.defic); }), container);
    }

    _updateDlcCounts(activeCount, generalCount, closedCount);
  }
};

function _renderActiveTab(proj, container) {
  var html = '';

  (proj.contractors || []).forEach(function(c) {
    var active = (c.deficiencies || []).filter(deficIsOpen);
    var total = (c.deficiencies || []).length;
    html += buildGroup(c.id, c.name || 'Unnamed Contractor', active, total);
  });

  if (!(proj.contractors || []).length) {
    html += '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:16px;text-align:center;">No contractors yet. Click "+ Add Contractor" to start.</p>';
  }
  container.innerHTML = html;
}

function _renderGeneralTab(proj, container) {
  var gen = (proj.generalDeficiencies || []).filter(deficIsOpen);
  var html = '';
  if (!gen.length) {
    html += '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:16px;text-align:center;">No site general deficiencies.</p>';
  } else {
    html += buildGroup(null, 'Site General', gen, (proj.generalDeficiencies || []).length);
  }
  container.innerHTML = html;
}

function _renderClosedTab(closedDefics, container) {
  if (!closedDefics.length) {
    container.innerHTML = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:24px 0;text-align:center;">No closed deficiencies yet.</p>';
    return;
  }
  var html = '';
  closedDefics.forEach(function(d) { html += buildDeficCard(d.defic, d.contractorId); });
  container.innerHTML = '<div class="defic-group"><div class="defic-group-header" style="background:#1C2333;color:white;padding:10px 16px;"><span>\u2705 Closed Items</span><span style="font-size:calc(12px + var(--ts));opacity:.7;">' + closedDefics.length + '</span></div>' + html + '</div>';
}

function _updateDlcCounts(activeCount, generalCount, closedCount) {
  document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(tab) {
    var type = tab.getAttribute('data-dlc');
    var count = type === 'active' ? activeCount : type === 'general' ? generalCount : closedCount;
    var label = type === 'active' ? 'Active' : type === 'general' ? 'Site General' : 'Closed';
    tab.textContent = label + (count > 0 ? ' (' + count + ')' : '');
  });
}

// ── Event Delegation ─────────────────────────────────────
var _obsDebounce = {};

document.addEventListener('click', function(e) {
  // DLC tab switching
  var dlcTab = e.target.closest && e.target.closest('.dlc-tab');
  if (dlcTab) {
    var type = dlcTab.getAttribute('data-dlc');
    if (type) {
      _activeDlcTab = type;
      document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-dlc') === type);
      });
      initDeficiencies.render();
    }
    return;
  }

  var action = e.target.getAttribute && e.target.getAttribute('data-action');
  var el = e.target;
  if (!action) {
    el = e.target.closest && e.target.closest('[data-action]');
    if (el) action = el.getAttribute('data-action');
    else return;
  }

  if (action === 'toggle-fold') {
    var ctrId = el.getAttribute('data-ctr-id');
    if (!ctrId) { var el2 = el.closest('[data-ctr-id]'); if (el2) ctrId = el2.getAttribute('data-ctr-id'); }
    if (ctrId) {
      _foldedGroups[ctrId] = !_foldedGroups[ctrId];
      var group = document.querySelector('.defic-group[data-ctr-id="' + ctrId + '"]');
      if (group) {
        var body = group.querySelector('.defic-group-body');
        var arrow = group.querySelector('.ctr-fold-arrow');
        if (body) body.style.display = _foldedGroups[ctrId] ? 'none' : '';
        if (arrow) arrow.textContent = _foldedGroups[ctrId] ? '\u25B6' : '\u25BC';
      }
    }
    return;
  }

  if (action === 'add-contractor') {
    var inp = document.getElementById('new-contractor-input');
    var name = inp ? inp.value.trim() : '';
    if (!name) {
      showPrompt('Add Contractor', 'Contractor name').then(function(n) {
        if (n) {
          var ctr = Model.addContractor(n);
          if (ctr) { var d = Model.addDeficiency(ctr.id); }
          initDeficiencies.render();
          toast('Added: ' + n + (d ? ' with deficiency #' + d.num : ''));
        }
      });
    } else {
      var ctr = Model.addContractor(name);
      if (ctr) { var d = Model.addDeficiency(ctr.id); }
      if (inp) inp.value = '';
      initDeficiencies.render();
      toast('Added: ' + name + (d ? ' with deficiency #' + d.num : ''));
    }
  }

  if (action === 'edit-contractor') {
    var ctrId = el.getAttribute('data-ctr-id');
    if (!ctrId) { var btn2 = el.closest('[data-ctr-id]'); if (btn2) ctrId = btn2.getAttribute('data-ctr-id'); }
    if (ctrId) {
      var proj = Model.getProject();
      var ctr = (proj.contractors || []).find(function(c) { return c.id === ctrId; });
      if (ctr) {
        showPrompt('Rename Contractor', 'New name:', ctr.name).then(function(newName) {
          if (newName && newName.trim() && newName.trim() !== ctr.name) {
            ctr.name = newName.trim();
            Model.saveNow();
            initDeficiencies.render();
            toast('Renamed to: ' + ctr.name);
          }
        });
      }
    }
  }

  if (action === 'remove-contractor') {
    var ctrId = el.getAttribute('data-ctr-id');
    if (!ctrId) { var btn2 = el.closest('[data-ctr-id]'); if (btn2) ctrId = btn2.getAttribute('data-ctr-id'); }
    if (ctrId) {
      var proj = Model.getProject();
      var ctr = (proj.contractors || []).find(function(c) { return c.id === ctrId; });
      var ctrName = ctr ? (ctr.name || 'Contractor') : 'Contractor';
      var deficCount = ctr ? (ctr.deficiencies || []).length : 0;
      var msg = deficCount > 0
        ? 'Remove "' + ctrName + '"? This contractor has ' + deficCount + ' deficienc' + (deficCount === 1 ? 'y' : 'ies') + ' that will be deleted.'
        : 'Remove "' + ctrName + '"?';
      showConfirm('Remove Contractor', msg).then(function(yes) {
        if (yes) { Model.removeContractor(ctrId); initDeficiencies.render(); toast('Removed: ' + ctrName); }
      });
    }
  }

  if (action === 'add-defic') {
    var ctrId = el.getAttribute('data-ctr-id') || null;
    var defic = Model.addDeficiency(ctrId || null);
    if (defic) {
      initDeficiencies.render();
      toast('Deficiency #' + defic.num + ' added');
    }
  }

  if (action === 'add-general') {
    var defic = Model.addDeficiency(null);
    if (defic) {
      _activeDlcTab = 'general';
      document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-dlc') === 'general');
      });
      initDeficiencies.render();
      toast('General deficiency #' + defic.num + ' added');
    }
  }

  if (action === 'add-obs') {
    var deficId = el.getAttribute('data-defic-id');
    var obs = Model.addObservation(deficId);
    if (obs) {
      initDeficiencies.render();
      toast('Observation added');
    }
  }

  if (action === 'remove-obs') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    showConfirm('Remove Observation', 'Remove this observation? This cannot be undone.').then(function(yes) {
      if (yes) {
        Model.removeObservation(deficId, obsIdx);
        initDeficiencies.render();
        toast('Observation removed');
      }
    });
  }

  if (action === 'spinoff-obs') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    var f = Model.findDeficiency(deficId);
    if (!f) return;
    var obs = f.defic.observations || [];
    if (!obs[obsIdx]) return;
    var srcObs = obs[obsIdx];
    // Create new deficiency in same contractor
    var ctrId = f.contractor ? f.contractor.id : null;
    var newDefic = Model.addDeficiency(ctrId);
    if (newDefic) {
      // Copy observation text and photos
      if (newDefic.observations && newDefic.observations[0]) {
        newDefic.observations[0].text = srcObs.text || '';
        newDefic.observations[0].photos = JSON.parse(JSON.stringify(srcObs.photos || []));
      }
      // Remove from source
      Model.removeObservation(deficId, obsIdx);
      Model.saveNow();
      initDeficiencies.render();
      toast('Spun off as #' + newDefic.num);
    }
  }

  if (action === 'toggle-addressed') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    Model.toggleObsAddressed(deficId, obsIdx);
    initDeficiencies.render();
  }

  if (action === 'place-pin' || action === 'view-pin') {
    var deficId = el.getAttribute('data-defic-id');
    if (window._frtStartPinPlace) {
      window._frtStartPinPlace(deficId);
      if (action === 'place-pin') toast('Tap on the drawing to place pin');
    } else {
      toast('Open the Drawings tab first');
    }
  }

  if (action === 'remove-pin') {
    var deficId = el.getAttribute('data-defic-id');
    if (!deficId) { var btn3 = el.closest('[data-defic-id]'); if (btn3) deficId = btn3.getAttribute('data-defic-id'); }
    if (deficId) {
      var f = Model.findDeficiency(deficId);
      if (f) {
        f.defic.drawingId = null;
        f.defic.pinX = null;
        f.defic.pinY = null;
        Model._notify('deficiency', { action: 'pin-remove', deficId: deficId });
        Model.saveNow();
        initDeficiencies.render();
        toast('Pin removed');
      }
    }
  }

  if (action === 'open-lightbox') {
    var el = el.closest('[data-action="open-lightbox"]');
    if (!el) return;
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    var photoIdx = parseInt(el.getAttribute('data-photo-idx') || '0');
    var f = Model.findDeficiency(deficId);
    if (f && f.defic.observations && f.defic.observations[obsIdx]) {
      var photos = f.defic.observations[obsIdx].photos || [];
      if (photos.length && window._frtLightbox) {
        window._frtLightbox.open(photos, photoIdx);
      }
    }
  }

  if (action === 'delete-defic') {
    var deficId = el.getAttribute('data-defic-id');
    if (!deficId) { var btn4 = el.closest('[data-defic-id]'); if (btn4) deficId = btn4.getAttribute('data-defic-id'); }
    if (deficId) {
      var f = Model.findDeficiency(deficId);
      var num = f ? f.defic.num : '?';
      showConfirm('Delete Deficiency', 'Delete deficiency #' + num + '? This cannot be undone.').then(function(yes) {
        if (yes) {
          Model.removeDeficiency(deficId);
          initDeficiencies.render();
          toast('Deficiency #' + num + ' deleted');
        }
      });
    }
  }

  if (action === 'reassign-defic') {
    var deficId = el.getAttribute('data-defic-id');
    if (!deficId) { var btn6 = el.closest('[data-defic-id]'); if (btn6) deficId = btn6.getAttribute('data-defic-id'); }
    if (!deficId) return;
    var proj = Model.getProject();
    if (!proj) return;
    var f = Model.findDeficiency(deficId);
    if (!f) return;
    var curCtrId = f.contractor ? f.contractor.id : null;
    // Build contractor picker
    var opts = '<option value="">Site General</option>';
    (proj.contractors || []).forEach(function(c) {
      if (c.id !== curCtrId) {
        opts += '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      }
    });
    // Build custom overlay (theme-aware)
    var h2 = '<div id="reassign-overlay" style="position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;">';
    h2 += '<div style="background:var(--bg,white);border-radius:12px;padding:24px 28px;box-shadow:0 8px 32px rgba(0,0,0,.3);min-width:280px;max-width:380px;color:var(--fg,#1B2438);">';
    h2 += '<div style="font-size:16px;font-weight:700;margin-bottom:12px;">Move #' + f.defic.num + ' to:</div>';
    h2 += '<select id="reassign-sel" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-family:Calibri,sans-serif;margin-bottom:12px;background:var(--bg,white);color:var(--fg);">' + opts + '</select>';
    h2 += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
    h2 += '<button id="reassign-cancel" style="padding:8px 16px;background:var(--bg,white);color:var(--fg);border:1.5px solid var(--border);border-radius:6px;font-size:14px;cursor:pointer;font-family:Calibri,sans-serif;">Cancel</button>';
    h2 += '<button id="reassign-ok" style="padding:8px 20px;background:#9C2742;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;">Move</button>';
    h2 += '</div></div></div>';
    var d2 = document.createElement('div'); d2.innerHTML = h2;
    var ov2 = d2.firstChild; document.body.appendChild(ov2);

    ov2.querySelector('#reassign-ok').addEventListener('click', function() {
      var newCtrId = ov2.querySelector('#reassign-sel').value || null;
      Model.reassignDeficiency(deficId, newCtrId);
      ov2.remove();
      initDeficiencies.render();
      toast('Deficiency moved');
    });
    ov2.querySelector('#reassign-cancel').addEventListener('click', function() { ov2.remove(); });
  }

  if (action === 'toggle-iar') {
    var deficId = el.getAttribute('data-defic-id');
    if (!deficId) { var btn5 = el.closest('[data-defic-id]'); if (btn5) deficId = btn5.getAttribute('data-defic-id'); }
    if (deficId) {
      Model.toggleIAR(deficId);
      initDeficiencies.render();
    }
  }

  if (action === 'dup-defic') {
    var deficId = el.getAttribute('data-defic-id');
    if (!deficId) { var btn7 = el.closest('[data-defic-id]'); if (btn7) deficId = btn7.getAttribute('data-defic-id'); }
    if (deficId) {
      var newDefic = Model.duplicateDeficiency(deficId);
      if (newDefic) {
        initDeficiencies.render();
        toast('Duplicated as #' + newDefic.num);
      }
    }
  }

  if (action === 'delete-obs-photo') {
    var el = el.closest('[data-action="delete-obs-photo"]');
    if (!el) return;
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    var photoIdx = parseInt(el.getAttribute('data-photo-idx') || '0');
    showConfirm('Remove Photo', 'Remove this photo?').then(function(yes) {
      if (yes) {
        Model.removeObservationPhoto(deficId, obsIdx, photoIdx);
        initDeficiencies.render();
        toast('Photo removed');
      }
    });
  }

  if (action === 'ai-suggest-photo' || action === 'ai-suggest-obs') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    var f = Model.findDeficiency(deficId);
    if (!f || !f.defic.observations || !f.defic.observations[obsIdx]) {
      toast('\u26A0 Observation not found');
      return;
    }
    var obs = f.defic.observations[obsIdx];
    var photos = obs.photos || [];
    if (!photos.length) { toast('\u26A0 No photos on this observation'); return; }
    var selectedPhotos = photos;
    if (action === 'ai-suggest-photo') {
      var photoIdx = parseInt(el.getAttribute('data-photo-idx') || '0');
      if (photos[photoIdx]) selectedPhotos = [photos[photoIdx]];
    }
    if (!window.AIAssist || !window.AIAssist.suggestFromPhotos) {
      toast('\u26A0 AI Assistant not loaded');
      return;
    }
    window.AIAssist.suggestFromPhotos({
      photos: selectedPhotos,
      existingText: obs.text || '',
      onAccept: function(text) {
        obs.text = text;
        obs.aiReviewed = true;
        Model.saveNow();
        initDeficiencies.render();
        toast('\u2728 AI suggestion applied');
      }
    });
  }

  if (action === 'show-add-activity') {
    var deficId = el.getAttribute('data-defic-id');
    var label = el.getAttribute('data-label') || 'ARENCON';
    _showActivityModal(deficId, label);
  }

  if (action === 'close-defic') {
    var deficId = el.getAttribute('data-defic-id');
    var _cd = Model.findDeficiency(deficId);
    var _cnum = _cd ? _cd.defic.num || '?' : '?';
    showPrompt('\u2714 Close Deficiency #' + _cnum, 'Closing note (optional):').then(function(note) {
      if (note === null) return; // cancelled
      Model.updateDeficStatus(deficId, 'closed');
      if (note) Model.updateClosedNote(deficId, note);
      // Auto-switch to Closed tab
      _activeDlcTab = 'closed';
      document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-dlc') === 'closed');
      });
      initDeficiencies.render();
      toast('Deficiency #' + _cnum + ' closed');
    });
  }

  if (action === 'reopen-defic') {
    var deficId = el.getAttribute('data-defic-id');
    var _rf = Model.findDeficiency(deficId);
    Model.updateDeficStatus(deficId, 'open');
    // Auto-switch to the tab where item will appear
    var hasCtr = _rf && _rf.contractor;
    _activeDlcTab = hasCtr ? 'active' : 'general';
    document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-dlc') === _activeDlcTab);
    });
    initDeficiencies.render();
    toast('Deficiency reopened');
  }

  if (action === 'toggle-more') {
    var deficId = el.getAttribute('data-defic-id');
    var popup = document.getElementById('more-' + deficId);
    if (popup) {
      var wasOpen = popup.classList.contains('open');
      // Close all open popups first
      document.querySelectorAll('.defic-more-popup.open').forEach(function(p) { p.classList.remove('open'); });
      if (!wasOpen) popup.classList.add('open');
    }
  }
});

// Close more popups on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('[data-action="toggle-more"]') && !e.target.closest('.defic-more-popup')) {
    document.querySelectorAll('.defic-more-popup.open').forEach(function(p) { p.classList.remove('open'); });
  }
});

// Status and priority changes via select
document.addEventListener('change', function(e) {
  var action = e.target.getAttribute && e.target.getAttribute('data-action');
  if (!action) return;

  if (action === 'status') {
    var deficId = e.target.getAttribute('data-defic-id');
    var newStatus = e.target.value;
    var _sf = Model.findDeficiency(deficId);
    Model.updateDeficStatus(deficId, newStatus);
    // Auto-switch to correct tab
    if (newStatus === 'closed') {
      _activeDlcTab = 'closed';
    } else {
      var hasCtr = _sf && _sf.contractor;
      _activeDlcTab = hasCtr ? 'active' : 'general';
    }
    document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-dlc') === _activeDlcTab);
    });
    initDeficiencies.render();
  }

  if (action === 'priority') {
    (function() {
      var did = e.target.getAttribute('data-defic-id');
      var newPri = e.target.value;
      var f = Model.findDeficiency(did);
      if (!f) return;
      var oldPri = f.defic.priority || 'general';
      var hasCtr = !!(f.contractor);
      var dnum = f.defic.num || '?';

      // Priority "general" + has contractor → move to Site General immediately
      if (newPri === 'general' && hasCtr) {
        Model.updateDeficPriority(did, newPri);
        Model.reassignDeficiency(did, null);
        Model.saveNow();
        _activeDlcTab = 'general';
        document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
          t.classList.toggle('active', t.getAttribute('data-dlc') === 'general');
        });
        initDeficiencies.render();
        toast('#' + dnum + ' moved to Site General');
        return;
      }

      // Priority "high"/"low" + no contractor → prompt to assign
      if (newPri !== 'general' && !hasCtr) {
        var proj = Model.getProject();
        var ctrs = proj.contractors || [];
        if (ctrs.length) {
          var opts = '';
          ctrs.forEach(function(c) { opts += '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; });
          var h2 = '<div id="reassign-overlay" style="position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;">';
          h2 += '<div style="background:var(--bg,white);border-radius:12px;padding:24px 28px;box-shadow:0 8px 32px rgba(0,0,0,.3);min-width:280px;max-width:380px;color:var(--fg,#1B2438);">';
          h2 += '<div style="font-size:16px;font-weight:700;margin-bottom:12px;">Assign #' + dnum + ' to contractor:</div>';
          h2 += '<select id="reassign-sel" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-family:Calibri,sans-serif;margin-bottom:12px;background:var(--bg,white);color:var(--fg);">' + opts + '</select>';
          h2 += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
          h2 += '<button id="reassign-cancel" style="padding:8px 16px;background:var(--bg,white);color:var(--fg);border:1.5px solid var(--border);border-radius:6px;font-size:14px;cursor:pointer;font-family:Calibri,sans-serif;">Cancel</button>';
          h2 += '<button id="reassign-ok" style="padding:8px 20px;background:#9C2742;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;">Assign</button>';
          h2 += '</div></div></div>';
          var d2 = document.createElement('div'); d2.innerHTML = h2;
          var ov2 = d2.firstChild; document.body.appendChild(ov2);
          ov2.querySelector('#reassign-ok').addEventListener('click', function() {
            var newCtrId = ov2.querySelector('#reassign-sel').value || null;
            if (newCtrId) {
              // Change priority AND reassign together
              Model.updateDeficPriority(did, newPri);
              Model.reassignDeficiency(did, newCtrId);
              Model.saveNow();
              _activeDlcTab = 'active';
              document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
                t.classList.toggle('active', t.getAttribute('data-dlc') === 'active');
              });
              ov2.remove();
              initDeficiencies.render();
              toast('#' + dnum + ' assigned to contractor');
            } else {
              ov2.remove();
              initDeficiencies.render();
            }
          });
          ov2.querySelector('#reassign-cancel').addEventListener('click', function() {
            // Revert the select dropdown to old priority
            e.target.value = oldPri;
            ov2.remove();
          });
          // DON'T change priority yet — wait for user to confirm
          return;
        }
      }

      // Simple priority change (no tab move needed)
      Model.updateDeficPriority(did, newPri);
      initDeficiencies.render();
    })();
  }
});

// Observation text editing with debounce
var _noteDebounce = {};
document.addEventListener('input', function(e) {
  var action = e.target.getAttribute && e.target.getAttribute('data-action');

  if (action === 'obs-text') {
    var deficId = e.target.getAttribute('data-defic-id');
    var obsIdx = parseInt(e.target.getAttribute('data-obs-idx') || '0');
    var text = e.target.value;
    // Clear AI review indicator on manual edit
    var _ef = Model.findDeficiency(deficId);
    if (_ef && _ef.defic.observations && _ef.defic.observations[obsIdx]) {
      _ef.defic.observations[obsIdx].aiReviewed = false;
    }
    if (_obsDebounce[deficId]) clearTimeout(_obsDebounce[deficId]);
    _obsDebounce[deficId] = setTimeout(function() {
      Model.updateObservation(deficId, obsIdx, text);
    }, 500);
  }

  if (action === 'closed-note') {
    var deficId = e.target.getAttribute('data-defic-id');
    var text = e.target.value;
    var key = 'cn_' + deficId;
    if (_noteDebounce[key]) clearTimeout(_noteDebounce[key]);
    _noteDebounce[key] = setTimeout(function() {
      Model.updateClosedNote(deficId, text);
    }, 500);
  }
});

// Re-render when project loads
Model.onChange('project', function() { initDeficiencies.render(); });

// ── Photo Upload Handling ────────────────────────────────
var _photoTargetDeficId = null;
var _photoTargetObsIdx = 0;

function _compressAndAdd(file, deficId, obsIdx) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxW = 1600;
      var w = img.width;
      var h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      var photo = Model.addObservationPhoto(deficId, obsIdx, dataUrl);
      initDeficiencies.render();
      toast('Photo added');
      // R2 upload in Hub mode (fire-and-forget)
      var pid = new URLSearchParams(window.location.search).get('project');
      if (pid && photo) {
        R2.uploadPhoto(pid, photo, 'original').then(function() {
          Model.saveNow(); // Save updated r2Key/r2Url
        });
      }
      canvas.width = 1; canvas.height = 1;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

document.addEventListener('click', function(e) {
  var action = e.target.getAttribute && e.target.getAttribute('data-action');
  var el = e.target;
  if (!action) {
    el = e.target.closest && e.target.closest('[data-action]');
    if (el) action = el.getAttribute('data-action');
    if (!action) return;
  }

  if (action === 'photo-upload' || action === 'photo-camera') {
    var deficId = el.getAttribute('data-defic-id');
    if (!deficId) return;
    _photoTargetDeficId = deficId;
    _photoTargetObsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');

    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    if (action === 'photo-camera') inp.capture = 'environment';
    inp.onchange = function() {
      if (!inp.files || !inp.files.length) return;
      for (var i = 0; i < inp.files.length; i++) {
        _compressAndAdd(inp.files[i], _photoTargetDeficId, _photoTargetObsIdx);
      }
    };
    inp.click();
  }
});

// Drag & drop on photo zones
document.addEventListener('drop', function(e) {
  var zone = e.target.closest && e.target.closest('[data-action="photo-drop"]');
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove('drag-over');
  var deficId = zone.getAttribute('data-defic-id');
  var obsIdx = parseInt(zone.getAttribute('data-obs-idx') || '0');
  if (!deficId || !e.dataTransfer || !e.dataTransfer.files) return;
  for (var i = 0; i < e.dataTransfer.files.length; i++) {
    if (e.dataTransfer.files[i].type.startsWith('image/')) {
      _compressAndAdd(e.dataTransfer.files[i], deficId, obsIdx);
    }
  }
});

// Enter key on contractor name input
document.addEventListener('keydown', function(e) {
  if (e.target.id === 'new-contractor-input' && e.key === 'Enter') {
    e.preventDefault();
    var name = e.target.value.trim();
    if (name) {
      Model.addContractor(name);
      e.target.value = '';
      initDeficiencies.render();
      toast('Added: ' + name);
    }
  }
});

// ── Deficiency Search ────────────────────────────────────
var _searchQuery = '';
var _statusFilter = 'all';

document.addEventListener('input', function(e) {
  if (e.target.id === 'defic-search') {
    _searchQuery = (e.target.value || '').trim().toLowerCase();
    _applySearchFilter();
  }
});

document.addEventListener('change', function(e) {
  if (e.target.id === 'defic-filter-sel') {
    _statusFilter = e.target.value;
    _applySearchFilter();
  }
});

function _applySearchFilter() {
  var container = document.getElementById('deficiencies-container');
  if (!container) return;
  var items = container.querySelectorAll('.defic-item');
  items.forEach(function(item) {
    var deficId = item.getAttribute('data-defic-id');
    var f = Model.findDeficiency(deficId);
    if (!f) { item.style.display = ''; return; }
    var d = f.defic;
    var show = true;
    // Status filter
    if (_statusFilter === 'outstanding') {
      show = deficIsOpen(d) && !d.iar;
    } else if (_statusFilter === 'iar') {
      show = !!d.iar;
    }
    // Search filter
    if (show && _searchQuery) {
      var text = (deficDesc(d) + ' ' + (d.num || '')).toLowerCase();
      show = text.indexOf(_searchQuery) >= 0;
    }
    item.style.display = show ? '' : 'none';
  });
}

// ── Fold All Toggle ──────────────────────────────────────
var _allFolded = false;
document.addEventListener('click', function(e) {
  if (e.target.id === 'defic-fold-all-btn' || (e.target.closest && e.target.closest('#defic-fold-all-btn'))) {
    _allFolded = !_allFolded;
    var container = document.getElementById('deficiencies-container');
    if (!container) return;
    container.querySelectorAll('.defic-group').forEach(function(g) {
      var ctrId = g.getAttribute('data-ctr-id');
      var body = g.querySelector('.defic-group-body');
      var arrow = g.querySelector('.ctr-fold-arrow');
      if (ctrId) _foldedGroups[ctrId] = _allFolded;
      if (body) body.style.display = _allFolded ? 'none' : '';
      if (arrow) arrow.textContent = _allFolded ? '\u25B6' : '\u25BC';
    });
    var btn = document.getElementById('defic-fold-all-btn');
    if (btn) btn.textContent = _allFolded ? '\u25B6 Unfold All' : '\u25BC Fold All';
  }
});

// ── Renumber Deficiencies ───────────────────────────────
document.addEventListener('click', function(e) {
  if (e.target.id === 'defic-renumber-btn' || (e.target.closest && e.target.closest('#defic-renumber-btn'))) {
    var count = Model.renumberDeficiencies();
    if (count > 0) {
      initDeficiencies.render();
      if (window._frtRenderTasks) window._frtRenderTasks();
      toast('\u2714 Renumbered ' + count + ' deficiencies (1\u2013' + count + ')');
    } else {
      toast('No deficiencies to renumber');
    }
  }
});

// ── S78: Defic Filters + Select buttons (delegated) ─────────────
document.addEventListener('click', function(e) {
  var fb = e.target.closest && e.target.closest('#defic-filters-btn');
  if (fb) {
    // Toggle filter dropdown — quick filter by status
    var existing = document.getElementById('defic-filters-pop');
    if (existing) { existing.remove(); return; }
    var pop = document.createElement('div');
    pop.id = 'defic-filters-pop';
    pop.className = 'card-context-menu';
    pop.style.cssText = 'display:block;position:fixed;z-index:9000;';
    pop.innerHTML =
      '<button data-defic-filter="all">All</button>'
      + '<button data-defic-filter="outstanding">Outstanding only</button>'
      + '<button data-defic-filter="in-progress">In progress only</button>'
      + '<button data-defic-filter="closed">Closed only</button>'
      + '<div class="separator"></div>'
      + '<button data-defic-filter="high">High priority only</button>'
      + '<button data-defic-filter="iar">IAR only</button>';
    document.body.appendChild(pop);
    var r = fb.getBoundingClientRect();
    pop.style.top = (r.bottom + 4) + 'px';
    pop.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
    setTimeout(function(){ document.addEventListener('click', function close(ev){
      if (ev.target.closest && ev.target.closest('#defic-filters-pop')) {
        var f = ev.target.closest('[data-defic-filter]');
        if (f) {
          var mode = f.getAttribute('data-defic-filter');
          var cards = document.querySelectorAll('.deficiency-card, [data-deficiency-id]');
          cards.forEach(function(c){
            var st = (c.getAttribute('data-status')||'').toLowerCase();
            var pr = (c.getAttribute('data-priority')||'').toLowerCase();
            var iar = c.getAttribute('data-iar') === '1';
            var show = mode === 'all'
              || (mode === 'outstanding' && st === 'outstanding')
              || (mode === 'in-progress' && (st === 'in-progress' || st === 'in progress'))
              || (mode === 'closed' && st === 'closed')
              || (mode === 'high' && pr === 'high')
              || (mode === 'iar' && iar);
            c.style.display = show ? '' : 'none';
          });
          toast('Filter: ' + mode);
        }
        pop.remove();
      } else {
        pop.remove();
      }
      document.removeEventListener('click', close);
    }); }, 10);
    return;
  }
  var sb = e.target.closest && e.target.closest('#defic-select-btn');
  if (sb) {
    _toggleDeficSelectMode();
    return;
  }
  // Action bar handlers (delegated)
  var act = e.target.closest && e.target.closest('[data-defic-bulk]');
  if (act) {
    var op = act.getAttribute('data-defic-bulk');
    _runDeficBulk(op);
    return;
  }
});

// ── S78: Defic Select Mode (v1-style bulk action bar) ───────────
var _deficSelectMode = false;

function _getSelectedDeficIds() {
  var ids = [];
  document.querySelectorAll('.bulk-defic-checkbox:checked').forEach(function(cb) {
    var id = cb.getAttribute('data-defic-id');
    if (id) ids.push(id);
  });
  return ids;
}

function _updateDeficBulkCount() {
  var cnt = _getSelectedDeficIds().length;
  var el = document.getElementById('defic-bulk-count');
  if (el) el.textContent = cnt + ' selected';
}

function _toggleDeficSelectMode() {
  _deficSelectMode = !_deficSelectMode;
  document.body.classList.toggle('defic-select-mode', _deficSelectMode);
  var btn = document.getElementById('defic-select-btn');
  if (btn) btn.textContent = _deficSelectMode ? '\u2713 Selecting' : '\u2610 Select';
  var bar = document.getElementById('defic-bulk-action-bar');
  if (_deficSelectMode) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'defic-bulk-action-bar';
      bar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:rgba(156,39,66,0.08);border:1.5px solid var(--arencon,#9C2742);border-radius:8px;margin:8px 0;';
      bar.innerHTML =
        '<span id="defic-bulk-count" style="font-weight:700;color:var(--arencon,#9C2742);font-size:13px;">0 selected</span>'
        + '<button class="btn btn-sm" data-defic-bulk="close" style="background:#1A7A4A;color:white;border:none;">\u2713 Close Selected</button>'
        + '<button class="btn btn-sm" data-defic-bulk="reopen" style="background:#C0392B;color:white;border:none;">\u25CF Reopen Selected</button>'
        + '<button class="btn btn-sm" data-defic-bulk="iar-on" style="background:#FF69B4;color:white;border:none;">\u26A1 Set IAR</button>'
        + '<button class="btn btn-sm" data-defic-bulk="iar-off" style="background:#888;color:white;border:none;">Clear IAR</button>'
        + '<div style="flex:1;"></div>'
        + '<button class="btn btn-sm" data-defic-bulk="delete" style="background:#C0392B;color:white;border:none;">\uD83D\uDDD1 Delete Selected</button>'
        + '<div style="flex:1;"></div>'
        + '<button class="btn btn-outline btn-sm" data-defic-bulk="all">Select All</button>'
        + '<button class="btn btn-outline btn-sm" data-defic-bulk="none">Deselect All</button>'
        + '<button class="btn btn-outline btn-sm" data-defic-bulk="cancel">\u2715 Cancel</button>';
    }
    var toolbar = document.getElementById('defic-toolbar');
    var container = document.getElementById('deficiencies-container');
    if (toolbar && toolbar.parentNode && bar.parentNode !== toolbar.parentNode) {
      toolbar.parentNode.insertBefore(bar, container || toolbar.nextSibling);
    }
    bar.style.display = 'flex';
    // Inject checkboxes onto each card
    document.querySelectorAll('[data-deficiency-id]').forEach(function(card) {
      var id = card.getAttribute('data-deficiency-id');
      if (card.querySelector('.bulk-defic-checkbox')) return;
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'bulk-defic-checkbox';
      cb.setAttribute('data-defic-id', id);
      cb.style.cssText = 'margin-right:8px;width:18px;height:18px;cursor:pointer;vertical-align:middle;';
      cb.addEventListener('change', _updateDeficBulkCount);
      card.insertBefore(cb, card.firstChild);
    });
    _updateDeficBulkCount();
  } else {
    if (bar) bar.style.display = 'none';
    document.querySelectorAll('.bulk-defic-checkbox').forEach(function(cb) { cb.remove(); });
  }
}

function _runDeficBulk(op) {
  if (op === 'cancel') { _toggleDeficSelectMode(); return; }
  if (op === 'all') {
    document.querySelectorAll('.bulk-defic-checkbox').forEach(function(cb) { cb.checked = true; });
    _updateDeficBulkCount();
    return;
  }
  if (op === 'none') {
    document.querySelectorAll('.bulk-defic-checkbox').forEach(function(cb) { cb.checked = false; });
    _updateDeficBulkCount();
    return;
  }
  var ids = _getSelectedDeficIds();
  if (!ids.length) { toast('No deficiencies selected'); return; }
  var proj = Model.getProject();
  var inst = (proj && proj.currentFrtInstance) || 1;
  if (op === 'close' || op === 'reopen') {
    var isClose = op === 'close';
    showConfirm((isClose ? 'Close ' : 'Reopen ') + ids.length + ' deficienc' + (ids.length>1?'ies':'y') + '?', '').then(function(yes) {
      if (!yes) return;
      ids.forEach(function(id) {
        var f = Model.findDeficiency(id);
        if (!f) return;
        if (isClose) {
          f.defic.status = 'closed';
          f.defic.iar = false;
          f.defic.closedOnInstance = inst;
          f.defic.closedDate = new Date().toISOString().split('T')[0];
          if (f.defic.observations) f.defic.observations.forEach(function(o) { o.addressed = true; });
        } else {
          f.defic.status = 'open';
          f.defic.closedOnInstance = null;
          f.defic.closedDate = null;
          f.defic.closedNote = '';
          if (f.defic.observations) f.defic.observations.forEach(function(o) { o.addressed = false; });
        }
      });
      Model.saveNow();
      initDeficiencies.render();
      if (window._frtRenderTasks) window._frtRenderTasks();
      toast((isClose ? 'Closed ' : 'Reopened ') + ids.length);
      setTimeout(function() { document.querySelectorAll('.bulk-defic-checkbox').forEach(function(cb) { cb.checked = false; }); _updateDeficBulkCount(); }, 50);
    });
  } else if (op === 'iar-on' || op === 'iar-off') {
    var on = op === 'iar-on';
    ids.forEach(function(id) { var f = Model.findDeficiency(id); if (f) f.defic.iar = on; });
    Model.saveNow();
    initDeficiencies.render();
    if (window._frtRenderTasks) window._frtRenderTasks();
    toast((on ? 'Set' : 'Cleared') + ' IAR on ' + ids.length);
    setTimeout(function() { document.querySelectorAll('.bulk-defic-checkbox').forEach(function(cb) { cb.checked = false; }); _updateDeficBulkCount(); }, 50);
  } else if (op === 'delete') {
    showConfirm('Delete ' + ids.length + ' Deficienc' + (ids.length>1?'ies':'y'), 'This cannot be undone.').then(function(yes) {
      if (!yes) return;
      ids.forEach(function(id) { Model.removeDeficiency(id); });
      if (Model.renumberDeficiencies) Model.renumberDeficiencies();
      Model.saveNow();
      initDeficiencies.render();
      if (window._frtRenderTasks) window._frtRenderTasks();
      toast('Deleted ' + ids.length);
      _toggleDeficSelectMode();
    });
  }
}
