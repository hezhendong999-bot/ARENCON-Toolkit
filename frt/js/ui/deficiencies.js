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
import { showConfirm, showPrompt, confirmIARDeactivate } from '../shared/dialogs.js';
import { R2 } from '../data/r2.js';

// ── Helpers ──────────────────────────────────────────────
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function deficDesc(d) {
  if (d.observations && d.observations.length && d.observations[0].text) return d.observations[0].text;
  if (d.entries && d.entries.length && d.entries[0].description) return d.entries[0].description;
  return d.description || '';
}
function deficIsOpen(d) {
  // S119: effective status (open if ANY obs is unaddressed). Falls back to
  // pin-level d.status when no observations array exists. Model helper
  // handles both cases.
  return Model.getEffectiveStatus(d) === 'open';
}

// S114 P1.10: contractor color = SEQUENTIAL assignment based on order in proj.contractors[].
// Skips slot 3 (reserved for "Site General") so a regular contractor never collides with it.
// Hash-based assignment is gone — that allowed two unrelated contractors to land on the
// same slot. Now slot N maps to the Nth non-general contractor in array order.
// (After 7 unique contractors the palette wraps; rare in practice.)
export function ctrColorClass(name) {
  if (!name) return 'ctr-c3';
  if (name === 'Site General') return 'ctr-c3';
  var proj = Model.getProject();
  if (!proj || !Array.isArray(proj.contractors)) return 'ctr-c0';
  var nonGeneralIdx = 0;
  for (var i = 0; i < proj.contractors.length; i++) {
    var c = proj.contractors[i];
    if (!c || c.name === 'Site General') continue;
    if (c.name === name) {
      // Skip slot 3 so we never collide with Site General
      var slot = nonGeneralIdx;
      if (slot >= 3) slot += 1;
      return 'ctr-c' + (slot % 8);
    }
    nonGeneralIdx++;
  }
  return 'ctr-c0';
}

// S117-C: SINGLE SOURCE OF TRUTH for the muted contractor palette.
// Both the in-app group header (deficiencies tab) and the PDF report's
// contractor section header consume this helper. Pre-S117 the PDF computed
// its own palette by hashing names independently, so on-screen blue could
// land on PDF green for the same contractor. Now both call this and stay
// in lockstep.
//
// Saturation/lightness toned down to harmonize with the rest of the UI;
// hue preserved per slot (S114 P1.9 muted palette).
//
// Returns { cls, accent, surface, text } — caller picks what it needs.
//   cls     — CSS class (`ctr-c0` … `ctr-c7`) for chip styling
//   accent  — solid color for left-border accent + tinted name label
//   surface — tinted bg for chip / tag (light mode)
//   text    — readable on `surface` (light mode)
var _CTR_PALETTE = {
  'ctr-c0': { accent: '#A85959', surface: '#FDEDEC', text: '#C0392B' }, // red
  'ctr-c1': { accent: '#B07F5A', surface: '#FEF5E7', text: '#E67E22' }, // orange
  'ctr-c2': { accent: '#A09354', surface: '#FEF9E7', text: '#B7950B' }, // yellow
  'ctr-c3': { accent: '#5F8068', surface: '#EAFAF1', text: '#1A7A4A' }, // green / Site General
  'ctr-c4': { accent: '#5078A0', surface: '#EBF4FF', text: '#1565C0' }, // blue
  'ctr-c5': { accent: '#7A5BA0', surface: '#F4ECF7', text: '#7E22CE' }, // purple
  'ctr-c6': { accent: '#A85B8A', surface: '#FCE4EC', text: '#E91E8C' }, // pink
  'ctr-c7': { accent: '#4F8088', surface: '#E0F7FA', text: '#00838F' }  // teal
};
export function getContractorColor(name) {
  var cls = ctrColorClass(name);
  var pal = _CTR_PALETTE[cls] || _CTR_PALETTE['ctr-c0'];
  return { cls: cls, accent: pal.accent, surface: pal.surface, text: pal.text };
}

function deficIsClosed(d) {
  // S119: effective status (closed iff ALL obs are addressed). See note above.
  return Model.getEffectiveStatus(d) === 'closed';
}

var _activeDlcTab = 'active';

// S114 P1.8: Gallery picker — modal lets user select project site photos to attach
// to a deficiency observation. Selected photos are appended to obs.photos with
// their existing R2 metadata preserved (no re-upload, no duplication on R2).
function _showGalleryPicker(deficId, obsIdx) {
  var proj = Model.getProject();
  if (!proj) return;
  var sitePhotos = proj.photos || [];
  if (!sitePhotos.length) {
    toast('\u26A0 No site photos in this project. Upload site photos via the Photos tab first.');
    return;
  }
  var f = Model.findDeficiency(deficId);
  if (!f) { toast('\u26A0 Deficiency not found'); return; }
  var obs = f.defic.observations && f.defic.observations[obsIdx];
  if (!obs) { toast('\u26A0 Observation not found'); return; }
  // Build set of photo IDs already attached so we can mark them as already-used
  var attachedIds = {};
  (obs.photos || []).forEach(function(ph) { if (ph && ph.id) attachedIds[ph.id] = true; });

  var existing = document.getElementById('gp-overlay');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'gp-overlay';
  ov.className = 'gp-overlay';

  var html = '<div class="gp-modal">';
  html += '<div class="gp-header">';
  html += '<h3>\uD83D\uDDBC\uFE0F Pick from Site Photos</h3>';
  html += '<button class="gp-x" data-gp-x>\u2715</button>';
  html += '</div>';
  html += '<div class="gp-body">';
  html += '<p class="gp-help">Select site photos to attach to this pin. Photos stay in the site gallery as well.</p>';
  html += '<div class="gp-grid">';
  sitePhotos.forEach(function(p, i) {
    var src = p.thumb || p.r2Url || p.dataUrl || '';
    var taken = !!attachedIds[p.id];
    html += '<label class="gp-thumb' + (taken ? ' taken' : '') + '" data-gp-idx="' + i + '">';
    html += '<input type="checkbox" class="gp-check" data-gp-idx="' + i + '"' + (taken ? ' disabled' : '') + '>';
    if (src) html += '<img src="' + esc(src) + '" loading="lazy">';
    if (taken) html += '<span class="gp-taken-tag">already attached</span>';
    html += '</label>';
  });
  html += '</div>';
  html += '</div>';
  html += '<div class="gp-footer">';
  html += '<span class="gp-count" id="gp-count">0 selected</span>';
  html += '<button class="gp-cancel" data-gp-x>Cancel</button>';
  html += '<button class="gp-attach" id="gp-attach" disabled>Attach 0</button>';
  html += '</div>';
  html += '</div>';
  ov.innerHTML = html;
  document.body.appendChild(ov);

  function close() { ov.remove(); }
  function updateCount() {
    var checked = ov.querySelectorAll('.gp-check:checked');
    var n = checked.length;
    var c = document.getElementById('gp-count'); if (c) c.textContent = n + ' selected';
    var a = document.getElementById('gp-attach');
    if (a) { a.disabled = n === 0; a.textContent = 'Attach ' + n; }
  }

  ov.addEventListener('click', function(e) {
    if (e.target.matches('[data-gp-x]') || e.target === ov) { close(); return; }
    if (e.target.matches('.gp-check')) { updateCount(); return; }
    if (e.target.id === 'gp-attach') {
      var checks = ov.querySelectorAll('.gp-check:checked');
      if (!checks.length) return;
      // Re-fetch obs so we attach to live model
      var f2 = Model.findDeficiency(deficId);
      if (!f2 || !f2.defic.observations || !f2.defic.observations[obsIdx]) {
        toast('\u26A0 Observation no longer exists'); close(); return;
      }
      var liveObs = f2.defic.observations[obsIdx];
      if (!liveObs.photos) liveObs.photos = [];
      var addedCount = 0;
      checks.forEach(function(cb) {
        var idx = parseInt(cb.getAttribute('data-gp-idx'));
        var src = sitePhotos[idx];
        if (!src) return;
        // Copy reference: keep R2 metadata, generate a NEW photo id so it's
        // distinguishable from the site copy. R2 has one file; two records point at it.
        // S115: Also copy _origBackupId and _annotated so picked copies of an
        // already-marked-up photo stay linked to the same backup record. This
        // is what lets a later revert in this defic propagate back to the
        // gallery copy and the original site photo.
        var newPh = {
          id: 'ph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          r2Key: src.r2Key || '',
          r2Url: src.r2Url || '',
          r2Status: src.r2Status || 'uploaded',
          dataUrl: null,
          filename: src.filename || ('site_pick_' + (idx + 1) + '.jpg'),
          addedDate: new Date().toISOString().split('T')[0],
          fromSiteIdx: idx  // breadcrumb
        };
        if (src._origBackupId) newPh._origBackupId = src._origBackupId;
        if (src._annotated)    newPh._annotated    = true;
        liveObs.photos.push(newPh);
        addedCount++;
      });
      Model.saveNow();
      // S120 Push 24: notify Model listeners so any open pin editor (and
      // anything else subscribed to 'photo' events) re-renders. Push 23
      // added the listener but this code path mutated obs.photos[]
      // directly without notifying, so attaching a photo from "+ Gallery"
      // didn't surface in the open editor until close+reopen.
      if (typeof Model._notify === 'function') {
        Model._notify('photo', { action: 'gallery-attach', deficId: deficId, obsIdx: obsIdx, count: addedCount });
      }
      initDeficiencies.render();
      toast('\u2714 Attached ' + addedCount + ' photo' + (addedCount === 1 ? '' : 's'));
      close();
    }
  });
}

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
  h += '<button id="am-save" class="btn-muted-ok">Add Entry</button>';
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
function buildDeficCard(d, ctrId) {
  var obs = d.observations || [];
  // S121 Phase C-2: pin-group rendering for multi-obs pins. Single-obs pins
  // (length 0 or 1) continue rendering today's compact card path below
  // unchanged. Multi-obs pins (length >= 2) route through _buildPinGroupCard
  // which produces a strip + per-obs cards + pin-level footer structure.
  // Click handlers all key off data-defic-id + data-obs-idx and don't change.
  if (obs.length >= 2) {
    return _buildPinGroupCard(d, ctrId);
  }
  // S119: status + priority shown in the card header reflect EFFECTIVE values
  // (max priority across obs / all-addressed → closed). Per-obs priority lives
  // on each observation row below; per-obs addressed lives on the toggle there.
  var effStatus = Model.getEffectiveStatus(d);
  var effPri = Model.getEffectivePriority(d);
  var isOpen = effStatus === 'open';
  var isClosed = effStatus === 'closed';
  var circleColor = isClosed ? '#1A7A4A' : '#C0392B';

  var h = '<div class="defic-item" data-defic-id="' + esc(d.id) + '" data-status="' + esc(effStatus) + '">';
  h += '<div class="defic-item-row">';
  h += '<div class="defic-num-circle" style="background:' + circleColor + ';">' + (d.num || '?') + '</div>';
  h += '<div class="defic-item-content">';

  // Status row — S119: status select is a "bulk" control (writes to all obs).
  // Per-obs priority dropdown moved from this row down into each observation.
  // Effective priority shown as a read-only badge so scanning by priority
  // still works at the card-level glance.
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">';
  h += '<select class="pin-status-sel" data-action="status" data-defic-id="' + esc(d.id) + '" style="width:auto;padding:3px 8px;font-size:calc(11px + var(--ts));">';
  h += '<option value="open"' + (isOpen ? ' selected' : '') + '>Outstanding</option>';
  h += '<option value="closed"' + (isClosed ? ' selected' : '') + '>Addressed &amp; Closed</option>';
  h += '</select>';
  // S120 Push 4: priority control inline next to status. Single-obs pins
  // get an EDITABLE dropdown here (the per-obs dropdown was floating alone
  // on the right of the obs box and looked disconnected). Multi-obs pins
  // keep the read-only effective-priority badge — each obs has its own
  // editable dropdown inside its row, so a pin-level editor would be
  // ambiguous about which obs it writes to.
  var _multi = ((d.observations || []).length > 1);
  var effPriColor = effPri === 'general' ? '#1A7A4A' : effPri === 'low' ? '#E67E22' : '#C0392B';
  var effPriLabel = effPri.charAt(0).toUpperCase() + effPri.slice(1);
  if (_multi) {
    h += '<span title="Effective priority (max across observations)" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:calc(11px + var(--ts));font-family:Calibri,sans-serif;font-weight:700;color:white;background:' + effPriColor + ';">' + esc(effPriLabel) + '</span>';
  } else {
    var pinPriVal = ((d.observations && d.observations[0] && d.observations[0].priority) || d.priority || 'high');
    h += '<select data-action="obs-priority" data-defic-id="' + esc(d.id) + '" data-obs-idx="0" title="Priority" class="pin-pri-sel" style="width:auto;padding:3px 8px;border:1.5px solid var(--border);border-radius:4px;font-size:calc(11px + var(--ts));font-family:Calibri,sans-serif;font-weight:600;background:var(--smoke);color:' + effPriColor + ';">';
    ['high', 'low', 'general'].forEach(function(p) {
      pinPriVal = pinPriVal || 'high';
      h += '<option value="' + p + '"' + (pinPriVal === p ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
    });
    h += '</select>';
  }
  // IAR toggle — inactive: subtle outline (was low-contrast grey-on-white). Active: pink fill.
  var iarStyle = d.iar
    ? 'border:none;background:#E91E8C;color:white;'
    : 'background:transparent;color:#9AA5B5;border:1.5px solid rgba(154,165,181,.4);';
  h += '<button data-action="toggle-iar" data-defic-id="' + esc(d.id) + '" style="' + iarStyle + 'border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;font-weight:600;cursor:pointer;">' + (d.iar ? '\u26A1 IAR' : 'IAR') + '</button>';
  if (d.drawingId) {
    var _dwgs = Model.getDrawings();
    var _dwgName = '';
    for (var _di = 0; _di < _dwgs.length; _di++) { if (_dwgs[_di].id === d.drawingId) { _dwgName = _dwgs[_di].name || 'Drawing'; break; } }
    h += '<button data-action="view-pin" data-defic-id="' + esc(d.id) + '" class="defic-dwg-pill" title="' + esc(_dwgName) + '">\uD83D\uDCCC ' + esc(_dwgName) + '</button>';
  } else {
    h += '<button data-action="place-pin" data-defic-id="' + esc(d.id) + '" style="border:1px dashed var(--border);background:transparent;color:var(--silver);border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">\uD83D\uDCCC Pin</button>';
  }
  // S114 P1.8: AI Review button per pin. Opens a 3-option menu.
  h += '<button data-action="ai-review-menu" data-defic-id="' + esc(d.id) + '" class="defic-ai-btn" title="AI Review">\u2728 AI Review</button>';
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
      // S119: per-observation priority dropdown — small select, top-right of
      // the obs box. Multi-obs only — single-obs shows the priority dropdown
      // in the pin-level header instead (see _multi branch above) so the
      // dropdown isn't floating alone on the right of an otherwise-empty row.
      var obsPriVal = o.priority || d.priority || 'high';
      var obsPriSelHtml = '';
      if (hasMulti) {
        obsPriSelHtml = '<select data-action="obs-priority" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Observation priority" style="padding:2px 6px;border:1.5px solid var(--border);border-radius:4px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;font-weight:600;background:var(--smoke);">';
        ['general', 'high', 'low'].forEach(function(p) {
          obsPriSelHtml += '<option value="' + p + '"' + (obsPriVal === p ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
        });
        obsPriSelHtml += '</select>';
      }
      // S120 Push 4: obs header row only renders for multi-obs. Single-obs
      // pins skip it entirely — priority moved to pin header, no other
      // obs-level chrome (label, addressed toggle, spinoff, remove) applies
      // when there's just one observation.
      var _aiDotHdr = o.aiReviewed ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#1A7A4A;margin-left:6px;vertical-align:middle;" title="AI reviewed"></span>' : '';
      if (hasMulti) {
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:6px;">';
        h += '<span style="font-size:calc(11px + var(--ts));font-weight:700;color:' + (o.addressed ? '#1A7A4A' : 'var(--ink)') + ';">' + lbl + 'Observation' + _aiDotHdr + '</span>';
        h += '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">';
        h += obsPriSelHtml;
        h += '<button data-action="toggle-addressed" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:' + (o.addressed ? '#1A7A4A' : '#CBD5E0') + ';color:white;border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">' + (o.addressed ? '\u2611 Addressed' : '\u2610 Open') + '</button>';
        h += '<button data-action="spinoff-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:#2196F3;color:white;border-radius:4px;padding:2px 6px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;" title="Spin off as new pin (asks for confirmation)">\u21B1</button>';
        h += '<button data-action="remove-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:#E53E3E;color:white;border-radius:4px;padding:2px 6px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;" title="Remove observation">\u2715</button>';
        h += '</div></div>';
      }
      // Textarea
      var _aiDot = o.aiReviewed ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#1A7A4A;margin-left:6px;vertical-align:middle;" title="AI reviewed"></span>' : '';
      // S114 P1.7: 3-column layout (comment | photos | drop zone) on desktop;
      // stacks vertically on mobile (<900px) via the .obs-layout grid CSS.
      // S120 Push 1: read effective photos from the pool model. Soft-deleted
      // pool entries are filtered upstream; per-(obs, photo) markup overlays
      // are surfaced via Model.getObsPhotoMarkup so the marked variant shows
      // in the card for THIS obs even if a sibling obs sees the same source
      // unmarked.
      var obsPhotos = (Model.getEffectivePhotos ? Model.getEffectivePhotos(d, oi) : (o.photos || []));
      h += '<div class="obs-layout">';
      // ── Column 1: comment textarea (no Shorten/Undo — AI Review handles that) ──
      h += '<div class="obs-comment-col">';
      h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="obs-text-input" placeholder="Describe the observation...">' + esc(o.text || '') + '</textarea>';
      h += '</div>';
      // ── Column 2: photo thumbnails grid (100×100 — matches v1) ──
      h += '<div class="obs-photos-col">';
      h += '<div class="obs-photos-grid">';
      obsPhotos.forEach(function(ph, phi) {
        // S115 P11: fallback chain — thumb (cached data URI) → dataUrl
        // (in-memory blob URL, e.g. lightbox-shared marked image) → r2Url
        // (R2-hosted; may 404 mid-upload). dataUrl beats r2Url so a freshly
        // marked photo shows the marked image instantly even before the
        // marked R2 file finishes uploading. Once async thumb-gen runs and
        // notifies, thumb takes over and dataUrl is no longer needed.
        // S120: per-(obs, photo) marked overlay wins over the source thumb
        // for THIS obs's view (other obs may show the same source unmarked).
        var mk = (Model.getObsPhotoMarkup ? Model.getObsPhotoMarkup(d, oi, ph.id) : null);
        var src = (mk && mk.markedR2Key) ? mk.markedR2Key : (ph.thumb || ph.dataUrl || ph.r2Url || '');
        if (!src) return;
        var pid = ph.id || '';
        h += '<div class="obs-photo-wrap">';
        h += '<img data-action="open-lightbox" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" src="' + esc(src) + '" loading="lazy">';
        h += '<button data-action="ai-suggest-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" class="photo-ai-btn" title="AI Suggest from this photo">\u2728</button>';
        h += '<button data-action="delete-obs-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" class="obs-photo-del" title="Remove from this observation">\u2715</button>';
        h += '</div>';
      });
      if (!obsPhotos.length) {
        h += '<div class="obs-photos-empty">No photos yet.</div>';
      }
      h += '</div>';
      h += '</div>';
      // ── Column 3: drop zone — Upload, Camera, +Gallery (no AI; AI lives in pin header now) ──
      h += '<div class="obs-drop-col" data-action="photo-drop" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"';
      h += ' ondragover="event.preventDefault();this.classList.add(\'drag-over\')"';
      h += ' ondragleave="this.classList.remove(\'drag-over\')">';
      h += '<div class="obs-drop-zone">';
      h += '<div class="obs-drop-msg">Drop photos here<br><span class="obs-drop-msg-sub">or use buttons below</span></div>';
      h += '<div class="obs-drop-btns">';
      h += '<button class="obs-drop-btn is-upload" data-action="photo-upload" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">\uD83D\uDCCE Upload</button>';
      h += '<button class="obs-drop-btn is-camera" data-action="photo-camera" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">\uD83D\uDCF7 Camera</button>';
      h += '<button class="obs-drop-btn is-gallery" data-action="photo-gallery-pick" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Pick from project site photos">\uD83D\uDDBC\uFE0F + Gallery</button>';
      h += '</div>';
      h += '</div>';
      h += '</div>';
      h += '</div>'; // end obs-layout
      // S114 P1.6: per-observation AI scratchpad (full width, below the 3-column row)
      h += '<div class="ai-scratchpad" data-sp-defic="' + esc(d.id) + '" data-sp-obs="' + oi + '" style="display:none;"></div>';
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

// ── S121 Phase C-2: pin-group renderer for multi-obs pins ──
// Called by buildDeficCard when d.observations.length >= 2. Produces a
// pin-group container with three regions:
//   - Pin strip (top): pin-num circle, effective-priority badge, bulk
//     status select, IAR, drawing pill, AI Review, + Add Obs, ⋯ menu
//   - Obs cards (middle, one per observation): per-obs label with
//     cross-contractor suffix when applicable, priority dropdown,
//     addressed toggle, spinoff, remove-obs, then 3-col body
//     (textarea | photos grid | drop zone) and AI scratchpad
//   - Pin footer (bottom): closed-note (when effective-closed),
//     activity log, action row (+ Response, + Comment, Close all /
//     Reopen all, ✕ Remove pin), noted date
//
// All click handlers use the same data-action + data-defic-id +
// data-obs-idx contract as the single-obs path. The DOM is different
// but the event delegation in handleDeficClick treats both paths
// identically.
function _buildPinGroupCard(d, ctrId) {
  var obs = d.observations || [];
  var p = (typeof Model !== 'undefined' && Model.getProject) ? Model.getProject() : null;
  var effStatus = Model.getEffectiveStatus(d);
  var effPri = Model.getEffectivePriority(d);
  var isOpen = effStatus === 'open';
  var isClosed = effStatus === 'closed';
  var circleColor = isClosed ? '#1A7A4A' : '#C0392B';

  // Cross-contractor suffix detection (mirrors flattenForTabs / _pushItems).
  // When a pin's obs span more than one effective contractor, every obs
  // gets a letter suffix on its label (#4-A, #4-B, ...). Same-contractor
  // multi-obs pins keep plain #N labels.
  var parentCtrName;
  if (!ctrId || ctrId === '__general__') {
    parentCtrName = 'Site General';
  } else {
    var fc = (p && p.contractors || []).find(function(c) { return c.id === ctrId; });
    parentCtrName = fc ? fc.name : '';
  }
  var obsEffCtrs = obs.map(function(o) {
    if (o && o.contractorId && p) {
      var c = (p.contractors || []).find(function(c) { return c.id === o.contractorId; });
      if (c) return c.name;
    }
    return parentCtrName;
  });
  var distinctCtrs = obsEffCtrs.filter(function(v, i, a) { return a.indexOf(v) === i; });
  // S121 Push 3: universal suffixing — every obs of a multi-obs pin gets
  // a letter suffix (#3-A, #3-B), regardless of whether obs span multiple
  // contractors. Same-contractor multi-obs pins were getting duplicate
  // labels (#3 / #3) which Mark flagged as confusing. Cross-contractor
  // pins still produce the same -A/-B labels they did before.
  var needsSuffix = obs.length > 1;

  var effPriColor = effPri === 'general' ? '#1A7A4A' : effPri === 'low' ? '#E67E22' : '#C0392B';
  var effPriLabel = effPri.charAt(0).toUpperCase() + effPri.slice(1);

  var h = '<div class="defic-pin-group" data-defic-id="' + esc(d.id) + '" data-status="' + esc(effStatus) + '">';

  // ─── pin strip ───
  h += '<div class="defic-pin-strip">';
  h += '<div class="defic-num-circle" style="background:' + circleColor + ';">' + (d.num || '?') + '</div>';
  h += '<span class="pri-eff-badge" title="Effective priority (max across observations)" style="background:' + effPriColor + ';">' + esc(effPriLabel) + '</span>';
  h += '<select class="pin-status-sel" data-action="status" data-defic-id="' + esc(d.id) + '" style="width:auto;padding:3px 8px;font-size:calc(11px + var(--ts));">';
  h += '<option value="open"' + (isOpen ? ' selected' : '') + '>Outstanding</option>';
  h += '<option value="closed"' + (isClosed ? ' selected' : '') + '>Addressed &amp; Closed</option>';
  h += '</select>';
  var iarStyle = d.iar
    ? 'border:none;background:#E91E8C;color:white;'
    : 'background:transparent;color:#9AA5B5;border:1.5px solid rgba(154,165,181,.4);';
  h += '<button data-action="toggle-iar" data-defic-id="' + esc(d.id) + '" style="' + iarStyle + 'border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;font-weight:600;cursor:pointer;">' + (d.iar ? '\u26A1 IAR' : 'IAR') + '</button>';
  if (d.drawingId) {
    var _dwgs = Model.getDrawings();
    var _dwgName = '';
    for (var _di = 0; _di < _dwgs.length; _di++) { if (_dwgs[_di].id === d.drawingId) { _dwgName = _dwgs[_di].name || 'Drawing'; break; } }
    h += '<button data-action="view-pin" data-defic-id="' + esc(d.id) + '" class="defic-dwg-pill" title="' + esc(_dwgName) + '">\uD83D\uDCCC ' + esc(_dwgName) + '</button>';
  } else {
    h += '<button data-action="place-pin" data-defic-id="' + esc(d.id) + '" style="border:1px dashed var(--border);background:transparent;color:var(--silver);border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">\uD83D\uDCCC Pin</button>';
  }
  h += '<button data-action="ai-review-menu" data-defic-id="' + esc(d.id) + '" class="defic-ai-btn" title="AI Review">\u2728 AI Review</button>';
  h += '<button data-action="add-obs" data-defic-id="' + esc(d.id) + '" style="border:1px dashed var(--border);background:transparent;color:var(--silver);border-radius:4px;padding:2px 10px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">+ Add Obs</button>';
  h += '</div>'; // /defic-pin-strip

  // ─── obs cards ───
  obs.forEach(function(o, oi) {
    var label = needsSuffix ? (d.num + '-' + String.fromCharCode(65 + oi)) : String(d.num || '?');
    var addrCls = o.addressed ? ' addressed' : '';

    h += '<div class="defic-obs-card' + addrCls + '" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">';

    // S121 Push 3: Option B layout — label on its own row, controls below
    // as a flex row with full-text labels. Priority dropdown carries a
    // colored background (high=#C0392B, low=#E67E22, general=#1A7A4A) so
    // priority is scannable without reading text.
    var _aiDot = o.aiReviewed ? '<span class="ai-rev-dot" title="AI reviewed"></span>' : '';
    var obsPriVal = o.priority || d.priority || 'high';
    var obsPriColor = obsPriVal === 'general' ? '#1A7A4A' : obsPriVal === 'low' ? '#E67E22' : '#C0392B';

    // Row 1 — label
    h += '<div class="defic-obs-card-lbl-row">';
    h += '<span class="defic-obs-card-lbl' + (o.addressed ? ' addressed' : '') + '">#' + esc(label) + ' \u00B7 Observation' + _aiDot + '</span>';
    h += '</div>';

    // Row 2 — controls (priority, addressed, spinoff, remove obs)
    h += '<div class="defic-obs-card-ctrls">';
    h += '<select data-action="obs-priority" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Observation priority" class="obs-pri-mini" style="background:' + obsPriColor + ';color:white;border-color:' + obsPriColor + ';font-weight:700;">';
    ['general', 'high', 'low'].forEach(function(pv) {
      h += '<option value="' + pv + '" style="background:white;color:#2C3E50;font-weight:600;"' + (obsPriVal === pv ? ' selected' : '') + '>' + pv.charAt(0).toUpperCase() + pv.slice(1) + '</option>';
    });
    h += '</select>';
    h += '<button data-action="toggle-addressed" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="addr-toggle ' + (o.addressed ? 'closed' : 'open') + '">' + (o.addressed ? '\u2611 Addressed' : '\u2610 Open') + '</button>';
    h += '<button data-action="spinoff-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="spinoff-obs-btn" title="Spin off as new pin (asks for confirmation)">\u21B1 Spinoff</button>';
    h += '<button data-action="remove-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="remove-obs-btn" title="Remove observation">\u2715 Remove obs</button>';
    h += '</div>';

    // S121 Push 4: obs body — 2-col layout (textarea | combined media zone).
    // Photos thumbnails and drop zone merged into one container so empty
    // pins don't show an awkward "No photos yet" gap, and the inspector
    // can drag onto the same area whether photos already exist or not.
    h += '<div class="obs-layout-merged">';
    h += '<div class="obs-text">';
    h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="obs-text-input" placeholder="Describe the observation...">' + esc(o.text || '') + '</textarea>';
    h += '</div>';
    var obsPhotos = (Model.getEffectivePhotos ? Model.getEffectivePhotos(d, oi) : (o.photos || []));
    h += '<div class="obs-media-col" data-action="photo-drop" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"';
    h += ' ondragover="event.preventDefault();this.classList.add(\'drag-over\')"';
    h += ' ondragleave="this.classList.remove(\'drag-over\')">';
    h += '<div class="obs-media-zone">';
    if (obsPhotos.length) {
      h += '<div class="obs-media-photos">';
      obsPhotos.forEach(function(ph, phi) {
        var mk = (Model.getObsPhotoMarkup ? Model.getObsPhotoMarkup(d, oi, ph.id) : null);
        var src = (mk && mk.markedR2Key) ? mk.markedR2Key : (ph.thumb || ph.dataUrl || ph.r2Url || '');
        if (!src) return;
        var pid = ph.id || '';
        h += '<div class="obs-photo-wrap">';
        h += '<img data-action="open-lightbox" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" src="' + esc(src) + '" loading="lazy">';
        h += '<button data-action="ai-suggest-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" class="photo-ai-btn" title="AI Suggest from this photo">\u2728</button>';
        h += '<button data-action="delete-obs-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" class="obs-photo-del" title="Remove from this observation">\u2715</button>';
        h += '</div>';
      });
      h += '</div>';
      h += '<div class="obs-media-divider"></div>';
    }
    h += '<div class="obs-media-hint">' + (obsPhotos.length ? 'Drop photos to add' : 'Drop photos here') + '</div>';
    h += '<div class="obs-media-btns">';
    h += '<button class="obs-drop-btn is-upload" data-action="photo-upload" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">\uD83D\uDCCE Upload</button>';
    h += '<button class="obs-drop-btn is-camera" data-action="photo-camera" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">\uD83D\uDCF7 Camera</button>';
    h += '<button class="obs-drop-btn is-gallery" data-action="photo-gallery-pick" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Pick from project site photos">\uD83D\uDDBC\uFE0F + Gallery</button>';
    h += '</div>';
    h += '</div></div>';
    h += '</div>'; // /obs-layout-merged

    // AI scratchpad
    h += '<div class="ai-scratchpad" data-sp-defic="' + esc(d.id) + '" data-sp-obs="' + oi + '" style="display:none;"></div>';

    h += '</div>'; // /defic-obs-card
  });

  // ─── pin footer ───
  h += '<div class="defic-pin-footer">';

  // closed note (only when effective-closed)
  if (isClosed) {
    h += '<div style="margin-bottom:8px;">';
    h += '<div style="font-size:calc(10px + var(--ts));font-weight:700;color:#1A7A4A;margin-bottom:2px;">Closed Note</div>';
    h += '<textarea data-action="closed-note" data-defic-id="' + esc(d.id) + '" style="width:100%;min-height:36px;border:1.5px solid rgba(26,122,74,.3);border-radius:6px;padding:6px 8px;font-size:calc(12px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:rgba(26,122,74,.03);" placeholder="Closing remarks...">' + esc(d.closedNote || '') + '</textarea>';
    h += '</div>';
  }

  // activity log
  var activity = d.activity || [];
  if (activity.length) {
    h += '<div style="margin-bottom:8px;padding-top:6px;border-top:1px dashed var(--border);">';
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

  // footer action row (+ Response, + Comment, Close all/Reopen all, Remove pin, ⋯ menu)
  h += '<div class="defic-actions">';
  h += '<button class="defic-act-btn act-response" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="Contractor Response">+ Contractor Response</button>';
  h += '<button class="defic-act-btn act-comment" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="ARENCON">+ ARENCON Comment</button>';
  if (isOpen) {
    h += '<button class="defic-act-btn act-close" data-action="close-defic" data-defic-id="' + esc(d.id) + '">\u2714 Close all</button>';
  } else {
    h += '<button class="defic-act-btn act-reopen" data-action="reopen-defic" data-defic-id="' + esc(d.id) + '">\u21A9 Reopen all</button>';
  }
  h += '<button class="defic-act-btn act-remove" data-action="delete-defic" data-defic-id="' + esc(d.id) + '">\u2715 Remove pin</button>';
  h += '<div style="position:relative;">';
  h += '<button class="defic-act-btn act-more" data-action="toggle-more" data-defic-id="' + esc(d.id) + '">\u22EF</button>';
  h += '<div class="defic-more-popup" id="more-' + esc(d.id) + '">';
  h += '<button data-action="dup-defic" data-defic-id="' + esc(d.id) + '">\u29C9 Duplicate</button>';
  h += '<button data-action="reassign-defic" data-defic-id="' + esc(d.id) + '">\u21D7 Move to\u2026</button>';
  if (d.drawingId) {
    h += '<button data-action="remove-pin" data-defic-id="' + esc(d.id) + '">\uD83D\uDCCC Remove Pin Only</button>';
  }
  h += '</div></div>';
  h += '</div>'; // /defic-actions

  // noted date
  if (d.notedDate || d.date) {
    h += '<div class="defic-noted" style="margin-top:6px;font-size:calc(10px + var(--ts));color:var(--silver);">' + esc(d.notedDate || d.date) + '</div>';
  }

  h += '</div>'; // /defic-pin-footer
  h += '</div>'; // /defic-pin-group
  return h;
}

var _foldedGroups = {};

// ── Group Builder ────────────────────────────────────────
function buildGroup(ctrId, name, items, totalCount) {
  var countLabel = items.length + ' active';
  if (totalCount && totalCount > items.length) countLabel += ' / ' + totalCount + ' total';
  var isFolded = _foldedGroups[ctrId || '__general__'];
  var arrow = isFolded ? '\u25B6' : '\u25BC';
  // S113 Push 19: pull the contractor's color from the same palette used
  // for chips + table cells. The group header keeps its navy background;
  // the color shows as a 4-px left accent + a tinted name label.
  // S117-C: now sourced from getContractorColor() — same helper the PDF
  // export uses for its contractor section headers, so on-screen and
  // printed colors match exactly.
  var ctrCol = getContractorColor(name);
  var ctrCls = ctrCol.cls;
  var accentCol = ctrCol.accent;

  var h = '<div class="defic-group" data-ctr-id="' + esc(ctrId || '__general__') + '">';
  h += '<div class="defic-group-header" data-action="toggle-fold" data-ctr-id="' + esc(ctrId || '__general__') + '" style="background:#1C2333;color:white;padding:10px 16px;cursor:pointer;user-select:none;border-left:4px solid ' + accentCol + ';">';
  h += '<span style="display:flex;align-items:center;gap:8px;"><span class="ctr-fold-arrow" style="font-size:12px;width:14px;display:inline-block;">' + arrow + '</span> \uD83D\uDC77 <span style="color:' + accentCol + ';font-weight:700;">' + esc(name) + '</span></span>';
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
    var colorCls = ctrColorClass(c.name);
    h += '<div class="contractor-chip ctr-tagged ctr-tag ' + colorCls + '"><span>' + esc(c.name) + '</span>';
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
    // S114 P1.6: re-render any open AI scratchpads now that the DOM is fresh
    if (window.AIAssist && window.AIAssist.repopulateAllScratchpads) {
      window.AIAssist.repopulateAllScratchpads();
    }
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
    // S120 Push 4: confirm before splitting. The icon (↱) is small and lives
    // next to the toggle-addressed and remove buttons — accidental clicks
    // were silently moving observations to brand-new pins, with no toast
    // breadcrumb pointing back to where the obs went. Now we confirm.
    var srcObs = obs[obsIdx];
    var ctrName = f.contractor ? (f.contractor.name || 'this contractor') : 'Site General';
    var obsLetter = String.fromCharCode(65 + obsIdx);
    var preview = (srcObs.text || '').trim();
    if (preview.length > 80) preview = preview.slice(0, 80) + '\u2026';
    var msg = 'Move observation ' + obsLetter + ' (' + (preview || 'no text') + ') out of #' + (f.defic.num || '?') + ' and into a brand-new pin in ' + ctrName + '? The new pin will share the same drawing location. The observation will be REMOVED from #' + (f.defic.num || '?') + '.';
    showConfirm('Spin off as new pin', msg).then(function(yes) {
      if (!yes) return;
      var ctrId = f.contractor ? f.contractor.id : null;
      var newDefic = Model.addDeficiency(ctrId);
      if (!newDefic) return;
      // Copy observation text and photos
      if (newDefic.observations && newDefic.observations[0]) {
        newDefic.observations[0].text = srcObs.text || '';
        newDefic.observations[0].photos = JSON.parse(JSON.stringify(srcObs.photos || []));
      }
      // Inherit drawing pin location so the inspector finds it on the same drawing
      if (f.defic.drawingId) {
        newDefic.drawingId = f.defic.drawingId;
        if (typeof f.defic.pinX === 'number') newDefic.pinX = f.defic.pinX;
        if (typeof f.defic.pinY === 'number') newDefic.pinY = f.defic.pinY;
      }
      Model.removeObservation(deficId, obsIdx);
      Model.saveNow();
      initDeficiencies.render();
      toast('Spun off as #' + newDefic.num);
    });
  }

  if (action === 'toggle-addressed') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    // S120 Push 6: if this flip will close the pin (last unaddressed obs
    // becomes addressed) AND the pin is IAR, confirm IAR deactivation
    // before flipping. Without this gate, ticking the last obs as
    // addressed silently set iar=false via Model.updateDeficStatus's
    // status mirror — surprising for IAR pins.
    var _ta = Model.findDeficiency(deficId);
    var _willClose = false;
    if (_ta && _ta.defic && _ta.defic.iar && _ta.defic.observations) {
      var unaddrCount = 0;
      var thisIsAddressed = !!(_ta.defic.observations[obsIdx] || {}).addressed;
      _ta.defic.observations.forEach(function(o, i) {
        if (i === obsIdx) {
          // After flip, this obs's addressed state inverts
          if (thisIsAddressed) unaddrCount++; // flipping addressed→open
        } else if (!o.addressed) unaddrCount++;
      });
      _willClose = !thisIsAddressed && unaddrCount === 0;
    }
    var _doToggle = function() {
      Model.toggleObsAddressed(deficId, obsIdx);
      initDeficiencies.render();
      if (window._frtRenderTasks) window._frtRenderTasks();
    };
    if (_willClose) {
      confirmIARDeactivate(_ta.defic).then(function(ok) {
        if (ok === false) return;
        if (_ta && _ta.defic) _ta.defic.iar = false;
        _doToggle();
      });
    } else {
      _doToggle();
    }
  }

  // S116 Push 3: split view-pin from place-pin.
  // - place-pin = pin doesn't have coords yet, user needs to tap to place.
  //   Still routes through _frtStartPinPlace which enters place-pin mode.
  // - view-pin = pin already exists, user wants to see it on the drawing.
  //   Now routes through _frtNavigateToPin which navigates + pulses the
  //   target pin, but does NOT enter place-pin mode. Tapping the drawing
  //   afterwards opens the editor like normal — does NOT move the pin.
  //   This eliminates the "I just wanted to look at it but accidentally
  //   moved it" failure mode that was the source of the duplicate-pin bug.
  if (action === 'view-pin') {
    var deficId = el.getAttribute('data-defic-id');
    if (window._frtNavigateToPin) {
      var ok = window._frtNavigateToPin(deficId);
      if (!ok) toast('This pin is not placed on a drawing yet');
    } else {
      toast('Open the Drawings tab first');
    }
  }

  if (action === 'place-pin') {
    var deficId = el.getAttribute('data-defic-id');
    if (window._frtStartPinPlace) {
      window._frtStartPinPlace(deficId);
      toast('Tap on the drawing to place pin');
    } else {
      toast('Open the Drawings tab first');
    }
  }

  if (action === 'remove-pin') {
    var deficId = el.getAttribute('data-defic-id');
    if (!deficId) { var btn3 = el.closest('[data-defic-id]'); if (btn3) deficId = btn3.getAttribute('data-defic-id'); }
    if (!deficId) return;
    var fRp = Model.findDeficiency(deficId);
    if (!fRp) return;
    var rpNum = fRp.defic.num || '?';
    // S119 Push H: Mark misclicked the floating Remove Pin button last
    // session and the pin disappeared with no confirmation. The same button
    // exists on the deficiency card. Match the pin-editor's #pe-unpin
    // confirmation copy (deficiency stays in project, only the drawing
    // location is removed).
    showConfirm('Remove Pin from Drawing', 'Remove pin #' + rpNum + ' from the drawing? The deficiency stays in the project.').then(function(yes) {
      if (!yes) return;
      var f = Model.findDeficiency(deficId);
      if (!f) return;
      f.defic.drawingId = null;
      f.defic.pinX = null;
      f.defic.pinY = null;
      Model._notify('deficiency', { action: 'pin-remove', deficId: deficId });
      Model.saveNow();
      initDeficiencies.render();
      toast('Pin removed');
    });
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
    h2 += '<button id="reassign-ok" class="btn-muted-ok">Move</button>';
    h2 += '<button id="reassign-cancel" class="btn-muted-cancel">Cancel</button>';
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
    var photoId = el.getAttribute('data-photo-id') || '';
    // S120 Push 4: per-obs narrow via Model.removePhotoFromObs. The photo
    // stays in the pool — any other obs that references it keeps showing
    // it. To delete from the pool entirely, the inspector enters Manage
    // photos in the pin editor and uses Delete from pool.
    showConfirm('Remove from this observation', 'Remove this photo from this observation only? It will stay in the pin\u2019s pool and any other observations that include it will keep showing it.').then(function(yes) {
      if (!yes) return;
      var ok = false;
      if (photoId && Model.removePhotoFromObs) {
        ok = Model.removePhotoFromObs(deficId, obsIdx, photoId);
      }
      if (!ok) {
        Model.removeObservationPhoto(deficId, obsIdx, photoIdx);
      }
      initDeficiencies.render();
      toast('Photo removed from observation');
    });
  }

  if (action === 'ai-suggest-photo') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    var photoIdx = parseInt(el.getAttribute('data-photo-idx') || '0');
    if (!window.AIAssist || !window.AIAssist.openScratchpadFromPhoto) {
      toast('\u26A0 AI Assistant not loaded'); return;
    }
    window.AIAssist.openScratchpadFromPhoto(deficId, obsIdx, photoIdx);
  }

  // S114 P1.8 — Per-pin AI Review menu (3 modes). Click opens floating menu;
  // option click triggers the appropriate mode and populates the scratchpad of obs 0.
  if (action === 'ai-review-menu') {
    e.stopPropagation();
    var deficId = el.getAttribute('data-defic-id');
    // Toggle: if a menu is already open for this pin, close it
    var existing = document.getElementById('ai-review-pop');
    if (existing) { existing.remove(); if (existing.getAttribute('data-defic-id') === deficId) return; }
    var f = Model.findDeficiency(deficId);
    if (!f) return;
    var hasPhotos = !!(f.defic.observations && f.defic.observations[0] && (f.defic.observations[0].photos || []).length);
    var hasText = !!(f.defic.observations && f.defic.observations[0] && (f.defic.observations[0].text || '').trim());
    var pop = document.createElement('div');
    pop.id = 'ai-review-pop';
    pop.className = 'ai-review-pop';
    pop.setAttribute('data-defic-id', deficId);
    var btn1 = '<button class="ai-rv-opt" data-action="ai-review-pin-photos" data-defic-id="' + esc(deficId) + '"' + (hasPhotos ? '' : ' disabled') + '>\uD83D\uDCF7 Full review (photos + text)' + (hasPhotos ? '' : '<span class="ai-rv-disabled">no photos</span>') + '</button>';
    var btn2 = '<button class="ai-rv-opt" data-action="ai-review-pin-text" data-defic-id="' + esc(deficId) + '"' + (hasText ? '' : ' disabled') + '>\uD83D\uDCDD Full review (text only)' + (hasText ? '' : '<span class="ai-rv-disabled">no text</span>') + '</button>';
    var btn3 = '<button class="ai-rv-opt" data-action="ai-review-pin-quick" data-defic-id="' + esc(deficId) + '"' + (hasText ? '' : ' disabled') + '>\u26A1 Quick review (grammar / flow)' + (hasText ? '' : '<span class="ai-rv-disabled">no text</span>') + '</button>';
    pop.innerHTML = btn1 + btn2 + btn3;
    document.body.appendChild(pop);
    var r = el.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.top = (r.bottom + 4) + 'px';
    pop.style.left = Math.min(r.left, window.innerWidth - 320) + 'px';
    pop.style.zIndex = '9000';
    setTimeout(function() {
      document.addEventListener('click', function close(ev) {
        if (ev.target.closest && ev.target.closest('#ai-review-pop')) return;
        var p = document.getElementById('ai-review-pop');
        if (p) p.remove();
        document.removeEventListener('click', close);
      });
    }, 10);
    return;
  }
  if (action === 'ai-review-pin-photos' || action === 'ai-review-pin-text' || action === 'ai-review-pin-quick') {
    var deficId = el.getAttribute('data-defic-id');
    var pop = document.getElementById('ai-review-pop'); if (pop) pop.remove();
    if (!window.AIAssist || !window.AIAssist.aiReviewPin) { toast('\u26A0 AI Assistant not loaded'); return; }
    var aiMode = action === 'ai-review-pin-photos' ? 'photos'
               : action === 'ai-review-pin-text' ? 'rewrite' : 'quickfix';
    window.AIAssist.aiReviewPin(deficId, aiMode);
    return;
  }

  // S114 P1.8 — Pick photos from the project site gallery to attach to this observation
  if (action === 'photo-gallery-pick') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    _showGalleryPicker(deficId, obsIdx);
    return;
  }
  // S114 P1.6 — scratchpad merge actions
  if (action === 'ai-sp-insert' || action === 'ai-sp-append' || action === 'ai-sp-replace') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    var mode = action === 'ai-sp-insert' ? 'insert'
             : action === 'ai-sp-append' ? 'append' : 'replace';
    if (window.AIAssist && window.AIAssist.mergeScratchpad) {
      window.AIAssist.mergeScratchpad(deficId, obsIdx, mode);
    }
  }
  if (action === 'ai-sp-discard') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    if (window.AIAssist && window.AIAssist.discardScratchpad) {
      window.AIAssist.discardScratchpad(deficId, obsIdx);
    }
  }
  if (action === 'ai-sp-shorten') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    if (window.AIAssist && window.AIAssist.shortenScratchpad) {
      window.AIAssist.shortenScratchpad(deficId, obsIdx);
    }
  }
  // Note: shorten-user-text + undo-user-text were removed in P1.8;
  // AI Review menu (in pin header) covers those cases now.

  if (action === 'show-add-activity') {
    var deficId = el.getAttribute('data-defic-id');
    var label = el.getAttribute('data-label') || 'ARENCON';
    _showActivityModal(deficId, label);
  }

  if (action === 'close-defic') {
    var deficId = el.getAttribute('data-defic-id');
    var _cd = Model.findDeficiency(deficId);
    var _cnum = _cd ? _cd.defic.num || '?' : '?';
    // S120 Push 6: closing an IAR pin via "+ Close" — confirm IAR
    // deactivation FIRST, then the closing-note prompt. If the IAR confirm
    // is cancelled, abort the whole close flow (don't show the note prompt).
    var _continueClose = function() {
      showPrompt('\u2714 Close Deficiency #' + _cnum, 'Closing note (optional):').then(function(note) {
        if (note === null) return; // cancelled at note prompt
        if (_cd && _cd.defic && _cd.defic.iar) _cd.defic.iar = false;
        Model.updateDeficStatus(deficId, 'closed');
        if (note) Model.updateClosedNote(deficId, note);
        _activeDlcTab = 'closed';
        document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
          t.classList.toggle('active', t.getAttribute('data-dlc') === 'closed');
        });
        initDeficiencies.render();
        toast('Deficiency #' + _cnum + ' closed');
      });
    };
    if (_cd && _cd.defic && _cd.defic.iar) {
      confirmIARDeactivate(_cd.defic).then(function(ok) {
        if (ok === false) return; // IAR cancel — abort
        _continueClose();
      });
    } else {
      _continueClose();
    }
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
    var _selEl = e.target;
    // S120 Push 6: closing an IAR pin via the status dropdown — confirm
    // first and auto-deactivate IAR. On cancel, revert the dropdown.
    var _proceed = function() {
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
    };
    if (newStatus === 'closed' && _sf && _sf.defic && _sf.defic.iar) {
      confirmIARDeactivate(_sf.defic).then(function(ok) {
        if (ok === false) {
          // Revert dropdown
          _selEl.value = 'open';
          return;
        }
        // ok === true (confirmed) or null (not IAR) — clear IAR + proceed
        if (_sf && _sf.defic) _sf.defic.iar = false;
        _proceed();
      });
    } else {
      _proceed();
    }
  }

  if (action === 'priority' || action === 'obs-priority') {
    (function() {
      var did = e.target.getAttribute('data-defic-id');
      var newPri = e.target.value;
      var f = Model.findDeficiency(did);
      if (!f) return;
      // S119: capture effective priority BEFORE the change so we can detect
      // boundary crossings (general ↔ non-general) for reassignment business
      // logic. The legacy 'priority' action still exists for any code path
      // that hasn't migrated; it's treated as a bulk write to all obs.
      var oldEffective = Model.getEffectivePriority(f.defic) || 'high';
      var hasCtr = !!(f.contractor);
      var dnum = f.defic.num || '?';

      // Apply the change to the right scope.
      function _applyChange() {
        if (action === 'obs-priority') {
          var oi = parseInt(e.target.getAttribute('data-obs-idx') || '0', 10);
          Model.updateObsPriority(did, oi, newPri);
        } else {
          // Legacy bulk write — keeps old call sites working
          Model.updateDeficPriority(did, newPri);
          if (f.defic.observations) {
            f.defic.observations.forEach(function(o) { o.priority = newPri; });
          }
        }
      }

      // Compute what the effective priority WILL be after this change.
      var newEffective;
      if (action === 'obs-priority') {
        var oi2 = parseInt(e.target.getAttribute('data-obs-idx') || '0', 10);
        var hasHigh = false, hasLow = false, hasGen = false;
        var obsArr = f.defic.observations || [];
        for (var i = 0; i < obsArr.length; i++) {
          var p = (i === oi2) ? newPri : (obsArr[i].priority || f.defic.priority || 'high');
          if (p === 'high') hasHigh = true;
          else if (p === 'low') hasLow = true;
          else if (p === 'general') hasGen = true;
        }
        newEffective = hasHigh ? 'high' : (hasLow ? 'low' : (hasGen ? 'general' : 'high'));
      } else {
        newEffective = newPri;
      }

      // Effective priority went non-general → general AND has contractor →
      // move pin to Site General (matches v1 behavior for the "this entire
      // pin is now informational only" case).
      // S120 Push 4: previously this happened silently with just a toast,
      // which produced "where did my pin go" failure modes — the pin
      // vanished from the contractor section without warning. Now confirm
      // first; on cancel, revert the dropdown.
      if (newEffective === 'general' && oldEffective !== 'general' && hasCtr) {
        var ctrName = f.contractor.name || 'this contractor';
        var moveMsg = 'Setting this pin\u2019s priority to General will MOVE pin #' + dnum + ' out of "' + ctrName + '" and into Site General. The pin will no longer appear under any contractor. Continue?';
        showConfirm('Move pin to Site General?', moveMsg).then(function(yes) {
          if (!yes) {
            // Revert the dropdown — apply nothing
            e.target.value = (action === 'obs-priority')
              ? ((f.defic.observations[parseInt(e.target.getAttribute('data-obs-idx') || '0', 10)] || {}).priority || f.defic.priority || 'high')
              : (f.defic.priority || 'high');
            return;
          }
          _applyChange();
          Model.reassignDeficiency(did, null);
          Model.saveNow();
          _activeDlcTab = 'general';
          document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
            t.classList.toggle('active', t.getAttribute('data-dlc') === 'general');
          });
          initDeficiencies.render();
          toast('#' + dnum + ' moved to Site General');
        });
        return;
      }

      // Effective priority went general → non-general AND no contractor →
      // prompt for assignment.
      if (newEffective !== 'general' && oldEffective === 'general' && !hasCtr) {
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
          h2 += '<button id="reassign-ok" class="btn-muted-ok">Assign</button>';
          h2 += '<button id="reassign-cancel" class="btn-muted-cancel">Cancel</button>';
          h2 += '</div></div></div>';
          var d2 = document.createElement('div'); d2.innerHTML = h2;
          var ov2 = d2.firstChild; document.body.appendChild(ov2);
          ov2.querySelector('#reassign-ok').addEventListener('click', function() {
            var newCtrId = ov2.querySelector('#reassign-sel').value || null;
            if (newCtrId) {
              _applyChange();
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
            // Revert dropdown without committing the change
            e.target.value = (action === 'obs-priority')
              ? ((f.defic.observations[parseInt(e.target.getAttribute('data-obs-idx') || '0', 10)] || {}).priority || f.defic.priority || 'high')
              : (f.defic.priority || 'general');
            ov2.remove();
          });
          // DON'T change priority yet — wait for user to confirm
          return;
        }
      }

      // Simple priority change (no tab move needed)
      _applyChange();
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
    // S121 Push 4: removed S114 P1.9 auto-bullet (typing "<digits> " at start
    // of a line auto-converted to "<digits>. "). The execCommand('insertText')
    // call caused a focus-flash bug — bullet appeared on focus loss instead
    // of mid-typing. Per Mark, removed entirely rather than fixed.
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

  // S114 P1.6 — user editing the AI scratchpad textarea
  if (action === 'ai-sp-edit') {
    var deficId = e.target.getAttribute('data-defic-id');
    var obsIdx = parseInt(e.target.getAttribute('data-obs-idx') || '0');
    if (window.AIAssist && window.AIAssist.scratchpadEdit) {
      window.AIAssist.scratchpadEdit(deficId, obsIdx, e.target.value);
    }
  }
});

// Re-render when project loads
Model.onChange('project', function() { initDeficiencies.render(); });
// S115 P9: also re-render when photos change (e.g., markup save/revert mutates
// r2Key/r2Url on defic photos — without this hook the defic tab keeps showing
// the old image because the DOM never refreshes).
// S119 Bug 1: same focus guard as the 'saved' listener below — don't yank
// the textarea out from under a typing user just because a photo finished
// uploading in some other card.
Model.onChange('photo', function() {
  var ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) {
    if (ae.closest('#tab-deficiencies, .defic-item, .defic-list')) return;
  }
  initDeficiencies.render();
});

// S117 hotfix: same as pins.js — pin editor mutates priority/IAR/status
// in-place and only fires 'saved' notify. Without this the Deficiency
// tab cards show stale priority badges and IAR chips until project reload.
// S119 Bug 1 fix: skip the re-render when the user is actively typing in
// an obs textarea (or any editable field inside the deficiency tab). The
// 500ms obs-text debounce → updateObservation → _queueSave → 'saved' chain
// otherwise destroys the textarea node mid-typing, kicking focus out.
// S121 Push 5: extended the guard to SELECT elements as well — the priority
// dropdown was sometimes auto-closing because the `change` event from a
// transient mouse-up triggered a 'saved' notify mid-interaction, destroying
// the open <select> node before the user finished picking a value.
// The mutation is already applied to the Model and the textarea's value
// already shows what the user typed, so a sync DOM rebuild adds nothing —
// the next normal render (tab switch, pin change, etc.) catches up.
var _deficSavedDebounce = null;
Model.onChange('saved', function() {
  if (_deficSavedDebounce) clearTimeout(_deficSavedDebounce);
  _deficSavedDebounce = setTimeout(function() {
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) {
      var inDefic = !!ae.closest('#tab-deficiencies, .defic-item, .defic-list, .defic-pin-group');
      if (inDefic) return;
    }
    initDeficiencies.render();
  }, 300);
});

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
    pop.style.cssText += ';position:fixed!important;bottom:auto!important;right:auto!important;height:auto!important;max-height:none!important;';
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
      bar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 14px;background:var(--smoke,rgba(156,39,66,0.04));border:1px solid rgba(156,39,66,0.35);border-radius:8px;margin:8px 14px;';
      bar.innerHTML =
        '<span id="defic-bulk-count" style="font-weight:700;color:var(--arencon,#9C2742);font-size:12px;padding:0 4px;">0 selected</span>'
        + '<button class="btn btn-sm" data-defic-bulk="close" style="background:#1A7A4A;color:white;border:none;padding:4px 10px;font-size:12px;">\u2713 Close Selected</button>'
        + '<button class="btn btn-sm" data-defic-bulk="reopen" style="background:#C0392B;color:white;border:none;padding:4px 10px;font-size:12px;">\u25CF Reopen Selected</button>'
        + '<button class="btn btn-sm" data-defic-bulk="iar-on" style="background:#FF69B4;color:white;border:none;padding:4px 10px;font-size:12px;">\u26A1 Set IAR</button>'
        + '<button class="btn btn-sm" data-defic-bulk="iar-off" style="background:#888;color:white;border:none;padding:4px 10px;font-size:12px;">Clear IAR</button>'
        + '<div style="flex:1;"></div>'
        + '<button class="btn btn-sm" data-defic-bulk="delete" style="background:#C0392B;color:white;border:none;padding:4px 10px;font-size:12px;">\uD83D\uDDD1 Delete Selected</button>'
        + '<div style="flex:1;"></div>'
        + '<button class="btn btn-outline btn-sm" data-defic-bulk="all" style="padding:4px 10px;font-size:12px;">Select All</button>'
        + '<button class="btn btn-outline btn-sm" data-defic-bulk="none" style="padding:4px 10px;font-size:12px;">Deselect All</button>'
        + '<button class="btn btn-outline btn-sm" data-defic-bulk="cancel" style="padding:4px 10px;font-size:12px;">\u2715 Cancel</button>';
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
    // S120 Push 6: surface IAR-active pins in the confirm message so the
    // inspector knows IAR will be auto-deactivated. Previously the bulk
    // close path silently set iar=false with no acknowledgement.
    var iarNums = isClose
      ? ids.map(function(id) { var f = Model.findDeficiency(id); return (f && f.defic && f.defic.iar) ? ('#' + f.defic.num) : null; }).filter(Boolean)
      : [];
    var msg = '';
    if (iarNums.length === 1) {
      msg = iarNums[0] + ' is currently IAR. Closing will automatically deactivate IAR.';
    } else if (iarNums.length > 1) {
      var preview = iarNums.length > 4 ? (iarNums.slice(0, 4).join(', ') + ' \u2026 (+' + (iarNums.length - 4) + ' more)') : iarNums.join(', ');
      msg = iarNums.length + ' selected pins are IAR (' + preview + '). Closing will automatically deactivate IAR on all of them.';
    }
    showConfirm((isClose ? 'Close ' : 'Reopen ') + ids.length + ' deficienc' + (ids.length>1?'ies':'y') + '?', msg).then(function(yes) {
      if (!yes) return;
      ids.forEach(function(id) {
        var f = Model.findDeficiency(id);
        if (!f) return;
        if (isClose) {
          f.defic.status = 'closed';
          f.defic.iar = false;
          f.defic.closedOnInstance = inst;
          f.defic.closedDate = new Date().toISOString().split('T')[0];
          // S119: per-obs addressed metadata so per-obs PDF filter sees them
          // as closed-in-current-instance (matches pin-level closedDate).
          if (f.defic.observations) {
            f.defic.observations.forEach(function(o) {
              o.addressed = true;
              o.addressedDate = f.defic.closedDate;
              o.addressedOnInstance = inst;
            });
          }
        } else {
          f.defic.status = 'open';
          f.defic.closedOnInstance = null;
          f.defic.closedDate = null;
          f.defic.closedNote = '';
          if (f.defic.observations) {
            f.defic.observations.forEach(function(o) {
              o.addressed = false;
              o.addressedDate = null;
              o.addressedOnInstance = null;
            });
          }
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

// S116 Push 1: expose photo helpers for the pin editor (viewer.js).
// Same pipeline as deficiencies tab so photo records, R2 upload, and Model
// notifications all behave identically regardless of where the upload was
// initiated. Pin editor wires its Upload/Camera/+Gallery buttons + drop zone
// to these.
window._frtPhotoAdd = _compressAndAdd;
window._frtGalleryPick = _showGalleryPicker;

// S116 Push 9: cross-module re-render hook used by viewer.js Delete/
// Remove-pin handlers so the Deficiencies tab refreshes when the pin
// editor mutates the project from outside the defic tab.
window._frtRenderDefic = function() { initDeficiencies.render(); };
