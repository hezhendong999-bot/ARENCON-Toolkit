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

import { Model, TRADE_LIST, SITE_RECORDS_LABEL } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm, showPrompt, showDialog } from '../shared/dialogs.js';
import { R2 } from '../data/r2.js';
import { ImageWorkerHost } from '../workers/imageWorkerHost.js';
import { AIAssist } from '../ai/assistant.js';

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
// S123 P5: New categorical palette — every slot distinct from the
// status reservation (red/amber/forest/pink/purple/blue/burgundy/slate).
// Slot c3 stays forest because Site General is a special semantic slot.
// `surfDark` and `textDark` added for dark-mode support; the CSS reads
// these via the .ctr-c* compound selector, but they're documented here
// so the JS palette and CSS palette stay in lockstep.
var _CTR_PALETTE = {
  'ctr-c0': { accent: '#3D8585', surface: '#E0F0F0', text: '#176987', surfDark: '#102A2A', textDark: '#7AC4C4' }, // teal
  'ctr-c1': { accent: '#7B8838', surface: '#F2F4E0', text: '#5A6829', surfDark: '#1F2410', textDark: '#B8C870' }, // olive
  'ctr-c2': { accent: '#9E6B40', surface: '#F5EBE0', text: '#7A4F2D', surfDark: '#2A1D10', textDark: '#D6A572' }, // bronze
  'ctr-c3': { accent: '#5F8068', surface: '#E8EFE7', text: '#5F8068', surfDark: '#0D2818', textDark: '#80C8A0' }, // forest / Site General (kept)
  'ctr-c4': { accent: '#3D4D88', surface: '#E8ECF8', text: '#2E3F8C', surfDark: '#15192C', textDark: '#8FA0E0' }, // indigo
  'ctr-c5': { accent: '#7A3F65', surface: '#F2E0EA', text: '#5C2A4A', surfDark: '#2A1424', textDark: '#D0A0B8' }, // mulberry
  'ctr-c6': { accent: '#B85A45', surface: '#F8E6E0', text: '#8B3F2D', surfDark: '#2C1810', textDark: '#E89A7E' }, // coral
  'ctr-c7': { accent: '#4A4F5A', surface: '#E8E9EC', text: '#2C3138', surfDark: '#1A1C20', textDark: '#A8AEBE' }  // charcoal
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

var _activeDlcTab = 'active';            // reused by S137 as the lifecycle pivot ('active' | 'closed')
// ── S137 Phase 2: unified Deficiencies tab state ──
var _deficView = 'detailed';             // 'detailed' (live) | 'table' | 'board' (S138)
var _dfxSearch = '';                     // free-text filter (obs.text)
var _dfxCtr = '';                        // contractorId filter ('' = all)
var _dfxPri = '';                        // priority filter ('' = all | 'high' | 'low' | 'general')
var _dfxRecMode = 'def';                  // S140 B2b: 3-state filter (Model 2 §4.2) — 'def' (default; recs hidden → short working list) | 'rec' (recommendations only) | 'both'

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

function _showActivityModal(deficId, label, editActId, preObsRef) {
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

// ── Deficiency Card (interactive) ────────────────────────
function buildDeficCard(d, ctrId) {
  // S121 Push 8: ALL pins (single-obs and multi-obs) now render through
  // _buildPinGroupCard. Mark feedback: Active and Site General tabs
  // looked different — single-obs used the old compact layout while
  // multi-obs used pin-group. Now they're visually identical: minimal
  // strip on top, one obs sub-card per observation, footer at bottom.
  // Spinoff/Remove obs are conditionally hidden when there's only 1 obs.
  return _buildPinGroupCard(d, ctrId);
}
// S122 Push 5 (Piece B) — render a single activity entry to HTML. Used by
// BOTH the pin footer activity log AND per-obs activity threads under each
// obs sub-card. Centralizing avoids drift when entry markup changes.
function _buildActEntryHtml(a, deficId) {
  if (!a || a.autoGenerated) return '';
  var isCtr = (a.label || '').indexOf('Contractor') >= 0;
  var bgColor = isCtr ? '#FEF3E2' : '#EBF4FF';
  var lColor = isCtr ? '#B07F5A' : '#1565C0';
  var actId = a.id || '';
  var h = '<div class="act-entry" style="margin-bottom:3px;padding:4px 6px;background:' + bgColor + ';border-radius:4px;font-size:calc(11px + var(--ts));display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">';
  h += '<div style="flex:1;min-width:0;">';
  h += '<span style="color:' + lColor + ';font-weight:600;">' + esc(a.label || 'Note') + '</span> <span style="color:var(--silver);font-size:calc(10px + var(--ts));">' + esc(a.date || '') + '</span>';
  h += '<div style="margin-top:2px;">' + esc(a.text || '\u2014') + '</div>';
  if (a.photos && a.photos.length) {
    h += '<div class="act-photos" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">';
    a.photos.forEach(function(ph, pi) {
      var psrc = ph.r2Url || ph.dataUrl || ph.thumb || '';
      if (!psrc) return;
      h += '<img class="act-photo-thumb" data-action="open-act-photo" data-defic-id="' + esc(deficId) + '" data-act-id="' + esc(actId) + '" data-photo-idx="' + pi + '" src="' + esc(psrc) + '" alt="" style="width:42px;height:42px;border-radius:4px;object-fit:cover;border:1px solid rgba(0,0,0,.10);cursor:zoom-in;">';
    });
    h += '</div>';
  }
  h += '</div>';
  if (actId) {
    h += '<div style="flex-shrink:0;display:flex;gap:2px;">';
    h += '<button data-action="edit-activity" data-defic-id="' + esc(deficId) + '" data-act-id="' + esc(actId) + '" title="Edit" style="background:none;border:none;cursor:pointer;font-size:calc(11px + var(--ts));color:#1565C0;padding:2px 4px;line-height:1;">\u270F</button>';
    h += '<button data-action="delete-activity" data-defic-id="' + esc(deficId) + '" data-act-id="' + esc(actId) + '" title="Delete" style="background:none;border:none;cursor:pointer;font-size:calc(11px + var(--ts));color:#A85959;padding:2px 4px;line-height:1;">\u2715</button>';
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function _buildPinGroupCard(d, ctrId) {
  var obs = d.observations || [];
  var effStatus = Model.getEffectiveStatus(d);
  var effPri = Model.getEffectivePriority(d);
  var isOpen = effStatus === 'open';
  var isClosed = effStatus === 'closed';
  var circleColor = isClosed ? '#5F8068' : '#A85959';

  // S133 — cross-contractor detection block removed. After the S121 Push 3
  // change to universal suffixing (every obs of a multi-obs pin gets a
  // letter, regardless of contractor span), the cross-contractor distinction
  // is no longer needed here. The `needsSuffix = obs.length > 1` check below
  // is the whole rule. Per-obs effective contractor IS still computed where
  // it's actually consumed (Summary table flatten, PDF `_pushItems`).
  var needsSuffix = obs.length > 1;

  var h = '<div class="defic-pin-group" data-defic-id="' + esc(d.id) + '" data-status="' + esc(effStatus) + '">';

  // ─── pin strip (S122 Push 1: ONLY rendered for multi-obs pins) ───
  // Single-obs pins skip the pin-strip entirely — the obs IS the pin,
  // so the obs card carries the Pin # circle and drawing pill itself.
  // This eliminates the redundant double-circle on single-obs pins
  // (Mark feedback: "do not make two circles when there is only 1
  // observation"). Multi-obs pins keep a minimal strip with Pin # circle
  // + drawing pill on the same row. Pin # circle is status-based (red
  // open / green closed) since per-obs pills carry priority info below.
  // Edge case: 0-obs pin (legacy) → strip still renders so it's recoverable.
  // (S137-polish: `multiObsPin` removed — its only consumer, the pin-footer
  // threaded-activity filter, no longer special-cases single-obs.)
  // S137-polish (Mark): ALL pins render the strip header so single-obs
  // pins are visually identical to multi-obs/active cards. The drawing
  // pill lives in the strip = left-aligned for every pin. Was
  // `obs.length !== 1` (single-obs got the old compact layout).
  var renderPinStrip = true;
  if (renderPinStrip) {
    h += '<div class="defic-pin-strip">';
    h += '<span class="obs-pill is-pin" style="background:' + circleColor + ';">' + (d.num || '?') + '</span>';
    // S123 P5.7: "· Pin" label after the number, matching the single-obs
    // format on line ~551 where it shows "[N] · Pin". Multi-obs was just
    // showing "[N]" + drawing pill — visually inconsistent. Now both
    // single and multi-obs cards read "[N] · Pin" at the pin level.
    h += '<span class="obs-pill-text">\u00B7 Pin</span>';
    if (d.drawingId) {
      var _dwgs = Model.getDrawings();
      var _dwgName = '';
      for (var _di = 0; _di < _dwgs.length; _di++) { if (_dwgs[_di].id === d.drawingId) { _dwgName = _dwgs[_di].name || 'Drawing'; break; } }
      h += '<button data-action="view-pin" data-defic-id="' + esc(d.id) + '" class="defic-dwg-pill" title="' + esc(_dwgName) + '">\uD83D\uDCCC ' + esc(_dwgName) + '</button>';
    } else {
      h += '<button data-action="place-pin" data-defic-id="' + esc(d.id) + '" style="border:1px dashed var(--border);background:transparent;color:var(--silver);border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">\uD83D\uDCCC Pin</button>';
    }
    h += '</div>'; // /defic-pin-strip
  }

  // ─── obs cards (S121 Push 8: label row + single controls row) ───
  // Layout per obs:
  //   Row 1: #N(-A/B) · Observation                 (label only)
  //   Row 2: [Outstanding] [Priority▾] [Trade▾] | [AI Review] [↱ Spinoff] [✕ Remove obs]
  //          (Spinoff/Remove obs hidden when single-obs)
  //   Row 3: textarea | media zone (icon-only Upload/Camera/Gallery)
  obs.forEach(function(o, oi) {
    // S122 Push 1: label uses NO DASH (3A not 3-A). Single-obs uses just N.
    var label = needsSuffix ? (d.num + String.fromCharCode(65 + oi)) : String(d.num || '?');
    var addrCls = o.addressed ? ' addressed' : '';

    h += '<div class="defic-obs-card' + addrCls + '" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">';

    var _aiDot = o.aiReviewed ? '<span class="ai-rev-dot" title="AI reviewed"></span>' : '';
    var obsPriVal = o.priority || d.priority || 'high';
    var obsAddressed = !!o.addressed;
    var multiObs = (obs.length > 1);

    // S122 Push 1: priority-keyed pill class. Same logic as kanban .pkc-num
    // for visual consistency. Override order: addressed (green) > priority
    // (red high / orange low / green general). S134: IAR pink override
    // removed — IAR is silent-degraded (data stays in JSON, no rendering).
    var pillCls = obsPriVal === 'general' ? 'general' : obsPriVal === 'low' ? 'low' : 'high';
    if (o.addressed) pillCls = 'addressed';

    // S122 Push 4 — FRT instance chip (Piece C). Linked findings: when an
    // obs was added on a later review cycle than the parent pin's original
    // instance, show "(FRT #N)" so users see which review introduced the obs.
    var _pinInst = d.notedOnInstance || 1;
    var _obsInst = o.notedOnInstance;
    var _frtChip = (_obsInst && _obsInst !== _pinInst)
      ? '<span class="frt-inst-chip" title="Added in FRT #' + _obsInst + '">FRT #' + _obsInst + '</span>'
      : '';

    // Row 1 — pill + label text. S137-polish (Mark): single-obs no longer
    // special-cased. Every obs renders the same small pill + "· Observation".
    // The drawing pill is carried by the strip above (left-aligned) for ALL
    // pins now, so the old single-obs right-pushed pill block is removed.
    h += '<div class="defic-obs-card-lbl-row">';
    h += '<span class="obs-pill ' + pillCls + '">' + esc(label) + '</span>';
    h += '<span class="obs-pill-text' + (o.addressed ? ' addressed' : '') + '">\u00B7 Observation' + _aiDot + '</span>';
    if (_frtChip) h += _frtChip;
    h += '</div>';

    // Row 2 — controls. Order: Outstanding → Priority → Trade | AI Review → Spinoff → Remove obs
    h += '<div class="defic-obs-card-ctrls">';

    // Outstanding toggle button (NOT a select). Light grey when open,
    // green when addressed. Single click flips state via toggle-addressed.
    h += '<button data-action="toggle-addressed" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="out-toggle ' + (obsAddressed ? 'closed' : 'open') + '">' + (obsAddressed ? '\u2611 Addressed &amp; Closed' : '\u2610 Outstanding') + '</button>';

    // Priority banner — colored pill that opens a native select on click.
    // Uses a wrapper <select> hidden behind the visible pill so the native
    // dropdown still works without us building a custom menu. The pill IS
    // the select element, styled.
    h += '<select data-action="obs-priority" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="pri-banner pri-' + obsPriVal + '" title="Observation priority">';
    ['high', 'low', 'general'].forEach(function(pv) {
      var lbl = pv.charAt(0).toUpperCase() + pv.slice(1);
      // Inline option style — Chrome ignores most CSS for <option>, but
      // honors inline. Forces white bg + dark text in the dropdown list.
      h += '<option value="' + pv + '" style="background:white;color:#2C3E50;font-weight:600;text-transform:none;"' + (obsPriVal === pv ? ' selected' : '') + '>' + lbl + '</option>';
    });
    h += '</select>';

    // S134: per-obs trade dropdown (replaces IAR button). Empty value =
    // "untagged". Source badge retired in S135 — visual differentiation
    // (inherited vs manual) is derived from data in Phase 2 (trade board).
    // Legacy d.iar and obs.tradeSource stay in JSON (silent-degrade).
    var _trade = o.trade || '';
    h += '<span class="trade-banner-wrap">';
    h += '<select data-action="obs-trade" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="trade-banner" title="Trade for this observation">';
    h += '<option value="" style="background:white;color:#2C3E50;font-weight:600;"' + (_trade === '' ? ' selected' : '') + '>\u2014 Trade \u2014</option>';
    // S136 Phase 1c: read from per-project trade list (Phase 1a schema),
    // fall back to TRADE_LIST seed for legacy / pre-migration projects.
    var _projTrades = (Model.getProject() || {}).projectTrades || TRADE_LIST;
    // S135 Phase 1a: if the obs carries a trade value that isn't in the
    // current project trade list (e.g. legacy "Standpipe" / "Fire Pump" /
    // "Extinguishers" from prior S134 sessions, or a custom per-project
    // trade not in the default 4), surface it as an italicized extra
    // option so the dropdown shows the live value. The user can keep it
    // or pick from the canonical list.
    if (_trade && _projTrades.indexOf(_trade) < 0) {
      h += '<option value="' + esc(_trade) + '" style="background:white;color:#2C3E50;font-weight:600;font-style:italic;" selected>' + esc(_trade) + '</option>';
    }
    _projTrades.forEach(function(tv) {
      h += '<option value="' + esc(tv) + '" style="background:white;color:#2C3E50;font-weight:600;"' + (_trade === tv ? ' selected' : '') + '>' + esc(tv) + '</option>';
    });
    h += '</select>';
    h += '</span>';

    // Visual separator between state cluster (Outstanding/Priority/Trade)
    // and action cluster (Spinoff/Remove obs). Per-obs AI Review button
    // retired in S135 — replaced in Phase 6 by global "Polish observations".
    h += '<span class="ctrls-sep" aria-hidden="true"></span>';

    // Spinoff + Remove obs — only show when multi-obs (otherwise no
    // sibling to spinoff against, and "remove obs" is just delete-pin).
    if (multiObs) {
      h += '<button data-action="spinoff-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="spinoff-obs-btn" title="Spin off as new pin (asks for confirmation)">\u21B1 Spinoff</button>';
      h += '<button data-action="remove-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="remove-obs-btn" title="Remove observation">\u2715 Remove obs</button>';
    }
    // S137: reserved trailing slot for the Phase 3.5 inspector chip.
    // Empty by design — designed in now so the card structure isn't
    // reworked a second time when attribution lands.
    h += '<span class="obs-insp-slot" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"></span>';

    h += '</div>'; // /defic-obs-card-ctrls

    // Row 3 — body. textarea | media zone. Push 4 layout, but media buttons
    // are now icon-only per Mark Push 8 feedback (Upload→📎, Camera→📷, Gallery→🖼️).
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
    // Push 8: icon-only photo buttons. Original dusty colors preserved
    // via .is-upload/.is-camera/.is-gallery classes (set elsewhere in CSS).
    h += '<button class="obs-drop-btn is-upload icon-only" data-action="photo-upload" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Upload from device">\uD83D\uDCCE</button>';
    h += '<button class="obs-drop-btn is-camera icon-only" data-action="photo-camera" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Take photo with camera">\uD83D\uDCF7</button>';
    h += '<button class="obs-drop-btn is-gallery icon-only" data-action="photo-gallery-pick" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Pick from project site photos">\uD83D\uDDBC\uFE0F</button>';
    h += '</div>';
    h += '</div></div>';
    h += '</div>'; // /obs-layout-merged

    // AI scratchpad
    h += '<div class="ai-scratchpad" data-sp-defic="' + esc(d.id) + '" data-sp-obs="' + oi + '" style="display:none;"></div>';

    // S122 Push 5 (Piece B) — per-obs activity thread. Show entries whose
    // obsRef matches this obs's letter (A/B/C…). Render them threaded under
    // the obs body so context is right next to the observation. Plus an
    // inline "+ Comment" button so users can add a comment scoped to THIS
    // obs without juggling the modal's "Regarding" select.
    var _obsLetter = String.fromCharCode(65 + oi);
    var _obsActs = (d.activity || []).filter(function(a) {
      return a && !a.autoGenerated && a.obsRef === _obsLetter;
    }).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
    { // S137-polish (Mark): per-obs Thread / +Response / +Comment now
      // renders for ALL pins so single-obs == multi-obs. Was `if (multiObs)`.
      h += '<div class="defic-obs-act-thread" data-obs-letter="' + _obsLetter + '" style="margin-top:8px;padding-top:6px;border-top:1px dashed var(--border);">';
      h += '<div style="font-size:calc(10px + var(--ts));font-weight:700;color:var(--silver);margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:8px;">';
      h += '<span>Thread \u2014 Obs ' + _obsLetter + (_obsActs.length ? ' (' + _obsActs.length + ')' : '') + '</span>';
      h += '<span style="display:flex;gap:4px;">';
      h += '<button class="defic-act-btn act-response" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="Contractor Response" data-obs-ref="' + _obsLetter + '" style="font-size:calc(10px + var(--ts));padding:2px 7px;">+ Response</button>';
      h += '<button class="defic-act-btn act-comment" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="ARENCON" data-obs-ref="' + _obsLetter + '" style="font-size:calc(10px + var(--ts));padding:2px 7px;">+ Comment</button>';
      h += '</span></div>';
      _obsActs.forEach(function(a) { h += _buildActEntryHtml(a, d.id); });
      h += '</div>';
    }

    h += '</div>'; // /defic-obs-card
  });

  // S121 Push 8: + Add Observation row at bottom of last obs card,
  // option 9 (filled olive-grey #7B7461) per Mark.
  h += '<div class="defic-add-obs-row">';
  h += '<button data-action="add-obs" data-defic-id="' + esc(d.id) + '" class="add-obs-btn-prominent">+ Add Observation</button>';
  h += '</div>';

  // ─── pin footer ───
  h += '<div class="defic-pin-footer">';

  // S122 Push 7 (Piece E) — pin mini-map. Small thumbnail of the pin's
  // drawing with the pin marker overlaid at its normalized coordinates,
  // giving spatial context without leaving the deficiency list. Click
  // jumps to the viewer at this pin (same as the drawing pill above).
  // Only renders when the pin has been placed (pinX/Y set) AND the
  // drawing has a thumbnail (drawings.js lazily generates these).
  if (d.drawingId && d.pinX != null && d.pinY != null) {
    var _drawings = Model.getDrawings();
    var _dwgT = null;
    for (var _dt = 0; _dt < _drawings.length; _dt++) {
      if (_drawings[_dt].id === d.drawingId) { _dwgT = _drawings[_dt]; break; }
    }
    if (_dwgT && _dwgT.thumb) {
      var _xPct = (Math.max(0, Math.min(1, d.pinX)) * 100).toFixed(1);
      var _yPct = (Math.max(0, Math.min(1, d.pinY)) * 100).toFixed(1);
      var _miniColor = isClosed ? '#5F8068' : (effPri === 'general' ? '#5F8068' : effPri === 'low' ? '#B07F5A' : '#A85959');
      h += '<div class="defic-pin-minimap" data-action="view-pin" data-defic-id="' + esc(d.id) + '" title="Jump to pin in drawing">';
      h += '<img src="' + esc(_dwgT.thumb) + '" alt="" loading="lazy" decoding="async">';
      h += '<div class="mini-pin-marker" style="left:' + _xPct + '%;top:' + _yPct + '%;background:' + _miniColor + ';"></div>';
      h += '</div>';
    }
  }

  // closed note (only when effective-closed)
  if (isClosed) {
    h += '<div style="margin-bottom:8px;">';
    h += '<div style="font-size:calc(10px + var(--ts));font-weight:700;color:#5F8068;margin-bottom:2px;">Closed Note</div>';
    h += '<textarea data-action="closed-note" data-defic-id="' + esc(d.id) + '" style="width:100%;min-height:36px;border:1.5px solid rgba(26,122,74,.3);border-radius:6px;padding:6px 8px;font-size:calc(12px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:rgba(26,122,74,.03);" placeholder="Closing remarks...">' + esc(d.closedNote || '') + '</textarea>';
    h += '</div>';
  }

  // activity log — pin footer
  // S122 Push 5 (Piece B) — only show entries that aren't threaded under
  // a specific obs sub-card. An entry IS threaded if its obsRef matches an
  // existing obs's letter; everything else (no obsRef, or stale obsRef
  // pointing to a removed obs) renders here at the pin level.
  var activity = d.activity || [];
  var _validObsLetters = {};
  for (var _li = 0; _li < obs.length; _li++) _validObsLetters[String.fromCharCode(65 + _li)] = true;
  var _generalActivity = activity.filter(function(a) {
    if (!a || a.autoGenerated) return false;
    if (a.obsRef && _validObsLetters[a.obsRef]) return false; // threaded (S137-polish: single-obs threads too — was `&& multiObsPin`)
    return true;
  });
  if (_generalActivity.length) {
    h += '<div style="margin-bottom:8px;padding-top:6px;border-top:1px dashed var(--border);">';
    h += '<div style="font-size:calc(10px + var(--ts));font-weight:700;color:var(--silver);margin-bottom:4px;">Activity Log</div>';
    _generalActivity.slice().sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); }).forEach(function(a) {
      h += _buildActEntryHtml(a, d.id);
    });
    h += '</div>';
  }

  // S122 Push 6 (Piece D) — "View all photos" carousel button. Opens lightbox
  // with ALL of the pin's photos (pin pool + activity entries) so you can
  // swipe through them as one collection. Only render when there are 2+
  // photos, since a single photo doesn't need a carousel entry point.
  var _allPhotoCount = (d.photos || []).length;
  (d.activity || []).forEach(function(a) { if (a.photos) _allPhotoCount += a.photos.length; });

  // footer action row (+ Response, + Comment, View all photos, Close all/Reopen all, Remove pin, ⋯ menu)
  h += '<div class="defic-actions">';
  h += '<button class="defic-act-btn act-response" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="Contractor Response">+ Contractor Response</button>';
  h += '<button class="defic-act-btn act-comment" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="ARENCON">+ ARENCON Comment</button>';
  if (_allPhotoCount >= 2) {
    h += '<button class="defic-act-btn act-photos" data-action="view-all-photos" data-defic-id="' + esc(d.id) + '" title="View all photos in lightbox carousel">\uD83D\uDCF7 View all photos (' + _allPhotoCount + ')</button>';
  }
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
  // S136: source the accent from the contractor's Phase-1a color so the
  // group header matches the trade board card EXACTLY (one color per
  // contractor across both surfaces). Falls back to neutral grey for
  // Site General / unknown contractor.
  var accentCol = '#6B7280';
  if (ctrId) {
    var _gp = Model.getProject();
    var _gc = _gp && (_gp.contractors || []).find(function(c) { return c.id === ctrId; });
    if (_gc && _gc.color) accentCol = _gc.color;
  }

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
  h += '<th style="text-align:center;">Closed</th></tr></thead><tbody>';
  var tTotal = 0, tNew = 0, tOut = 0, tClosed = 0;
  Object.keys(ctrGroups).forEach(function(name) {
    var gc = ctrGroups[name];
    var total = gc.length;
    var nw = gc.filter(function(d) { return (d.defic.notedOnInstance || 1) === _curInst; }).length;
    var outstanding = gc.filter(function(d) { return deficIsOpen(d.defic); }).length;
    var closed = gc.filter(function(d) { return deficIsClosed(d.defic); }).length;
    tTotal += total; tNew += nw; tOut += outstanding; tClosed += closed;
    h += '<tr>';
    h += '<td style="font-weight:600;">' + esc(name) + '</td>';
    h += '<td style="text-align:center;">' + total + '</td>';
    h += '<td style="text-align:center;font-weight:700;">' + nw + '</td>';
    h += '<td style="text-align:center;color:#A85959;font-weight:700;">' + outstanding + '</td>';
    h += '<td style="text-align:center;color:#5F8068;font-weight:700;">' + closed + '</td></tr>';
  });
  h += '<tr style="font-weight:700;">';
  h += '<td>TOTAL</td>';
  h += '<td style="text-align:center;">' + tTotal + '</td>';
  h += '<td style="text-align:center;">' + tNew + '</td>';
  h += '<td style="text-align:center;color:#A85959;">' + tOut + '</td>';
  h += '<td style="text-align:center;color:#5F8068;">' + tClosed + '</td></tr>';
  h += '</tbody></table>';
  el.innerHTML = h;
}

// ── Trade Board (S136 Phase 1b — replaces _renderContractorsOnSite) ───
// Kanban-style trade columns. Each column lists contractors that have the
// trade in their .trades[] array. Schema lives in model.js (Phase 1a):
// project.projectTrades, contractor.trades, contractor.color.
function _renderTradeBoard(proj) {
  var el = document.getElementById('contractors-on-site');
  if (!el) return;
  var trades = (proj.projectTrades && proj.projectTrades.length) ? proj.projectTrades : [];
  var ctrs = proj.contractors || [];
  // Default trades (anything in TRADE_LIST) cannot be removed; only "custom" trades show \u00D7 in header
  var defaultSet = {};
  TRADE_LIST.forEach(function(t) { defaultSet[t] = true; });

  var h = '<div class="trade-board">';
  trades.forEach(function(trade) {
    var ctrsInTrade = ctrs.filter(function(c) { return (c.trades || []).indexOf(trade) !== -1; });
    var isCustom = !defaultSet[trade];
    h += '<div class="trade-col" data-trade="' + esc(trade) + '">';
    h += '<div class="trade-col-hdr">';
    h += '<span class="trade-col-name">' + esc(trade) + '</span>';
    h += '<span class="trade-col-hdr-right">';
    h += '<span class="trade-col-count">' + ctrsInTrade.length + '</span>';
    if (isCustom) {
      h += '<button class="trade-col-del" data-action="del-trade-col" data-trade="' + esc(trade) + '" title="Remove trade column">\u00D7</button>';
    }
    h += '</span>';
    h += '</div>';
    h += '<div class="trade-col-body">';
    ctrsInTrade.forEach(function(c) {
      var col = c.color || '#6B7280';
      h += '<div class="ctr-card" data-ctr-id="' + esc(c.id) + '" style="--cc:' + esc(col) + ';">';
      h += '<span class="ctr-name">' + esc(c.name) + '</span>';
      h += '<button class="ctr-x" data-action="ctr-remove-from-trade" data-ctr-id="' + esc(c.id) + '" data-trade="' + esc(trade) + '" title="Unassign from this trade (contractor returns to the staging panel below)">\u00D7</button>';
      h += '</div>';
    });
    h += '<button class="trade-add-slot" data-action="pick-add-ctr-to-trade" data-trade="' + esc(trade) + '">+ Add contractor</button>';
    h += '</div>';
    h += '</div>';
  });
  h += '<button class="trade-add-col" data-action="show-add-trade">+ trade</button>';
  h += '</div>';

  // ── S140 B2d: Unassigned-contractor strip (Model 2 §4.2) ──
  // Contractors added via the pin editor land with an empty trades[] and
  // were previously invisible in the Trade Board (no column lists them).
  // They get an amber strip — SEPARATE from the Trade Board, never a
  // trade column — where they are renamed + assigned to a trade. Renaming
  // is deliberately NOT possible inside a trade column.
  var _unassigned = ctrs.filter(function(c) { return !((c.trades || []).length); });
  if (_unassigned.length) {
    var _assignTrades = (trades && trades.length) ? trades : TRADE_LIST;
    h += '<div class="tb-unassigned">';
    h += '<div class="tb-unassigned-hdr"><span class="tb-warn-dot">\u26A0</span> Unassigned contractors \u2014 added from the pin editor, not yet on a trade</div>';
    h += '<div class="tb-unassigned-list">';
    _unassigned.forEach(function(c) {
      var _n = (c.deficiencies || []).length;
      h += '<div class="tb-uchip" style="--cc:' + esc(c.color || '#6B7280') + ';">';
      h += '<span class="tb-uchip-dot"></span>';
      h += '<span class="tb-uchip-name">' + esc(c.name) + '</span>';
      h += '<span class="tb-uchip-meta">' + _n + ' item' + (_n === 1 ? '' : 's') + '</span>';
      h += '<button class="tb-uchip-rename" data-action="ctr-rename-inline" data-ctr-id="' + esc(c.id) + '" title="Rename this contractor">Rename</button>';
      h += '<button class="tb-uchip-del" data-action="ctr-delete-safe" data-ctr-id="' + esc(c.id) + '" title="Delete this contractor (its items move to Site Records, never deleted)">Delete</button>';
      h += '<select class="tb-uassign" data-action="ctr-assign-trade" data-ctr-id="' + esc(c.id) + '" title="Assign to a trade">';
      h += '<option value="">Assign to trade\u2026</option>';
      _assignTrades.forEach(function(t) { h += '<option value="' + esc(t) + '">' + esc(t) + '</option>'; });
      h += '</select>';
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="tb-unassigned-hint">Rename and assign here \u2014 contractors are never renamed inside a Trade Board column. Assigning a trade moves the contractor into that column.</div>';
    h += '</div>';
  }

  // S138: trade-board-foot "+ General Deficiency" removed — superseded by
  // the single unified "+ deficiency" trigger at the foot of every view.
  el.innerHTML = h;
}

// Smart picker — overlay modal for adding contractor to a trade column
function _openCtrPicker(trade) {
  _closeCtrPicker();
  var proj = Model.getProject();
  if (!proj) return;
  // Existing contractors NOT already in this trade
  var existing = (proj.contractors || []).filter(function(c) {
    return (c.trades || []).indexOf(trade) === -1;
  });
  var ov = document.createElement('div');
  ov.className = 'picker-overlay show';
  ov.id = 'ctr-picker-overlay';
  // Backdrop click closes (only if click hits overlay itself, not picker inner)
  ov.addEventListener('click', function(e) {
    if (e.target === ov) _closeCtrPicker();
  });
  var p = document.createElement('div');
  p.className = 'picker';
  var h = '<div class="picker-title">Add contractor to <em>' + esc(trade) + '</em></div>';
  if (existing.length) {
    h += '<div class="picker-section-lbl">Existing contractors</div>';
    h += '<div class="picker-chips">';
    existing.forEach(function(c) {
      var col = c.color || '#6B7280';
      h += '<button class="picker-chip" data-action="picker-pick-ctr" data-ctr-id="' + esc(c.id) + '" data-trade="' + esc(trade) + '" style="--cc:' + esc(col) + ';">' + esc(c.name) + '</button>';
    });
    h += '</div>';
  }
  h += '<div class="picker-section-lbl">New contractor</div>';
  h += '<div class="picker-input-row">';
  h += '<input type="text" class="picker-input" id="picker-new-ctr-input" placeholder="e.g. ABC Sprinklers" autocomplete="off">';
  h += '<button class="btn btn-sm picker-add-btn" data-action="picker-add-new-ctr" data-trade="' + esc(trade) + '">Add</button>';
  h += '</div>';
  h += '<div class="picker-foot">';
  h += '<button class="btn btn-sm picker-cancel-btn" data-action="picker-close">Cancel</button>';
  h += '</div>';
  p.innerHTML = h;
  ov.appendChild(p);
  document.body.appendChild(ov);
  setTimeout(function() {
    var inp = document.getElementById('picker-new-ctr-input');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          var b = ov.querySelector('[data-action="picker-add-new-ctr"]');
          if (b) b.click();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          _closeCtrPicker();
        }
      });
    }
  }, 0);
}

function _closeCtrPicker() {
  var ov = document.getElementById('ctr-picker-overlay');
  if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
}

// 3-button contractor edit dialog (Rename / Delete entire / Cancel)
function _showCtrEditDialog(ctr) {
  showDialog({
    title: 'Edit Contractor',
    message: '"' + ctr.name + '" \u2014 choose an action:',
    buttons: [
      { label: 'Cancel', outline: true, color: '#8A94B0' },
      { label: '\u270F Rename', color: '#9C2742', action: function() {
          showPrompt('Rename Contractor', 'New name:', ctr.name).then(function(newName) {
            if (newName && newName.trim() && newName.trim() !== ctr.name) {
              ctr.name = newName.trim();
              Model.saveNow();
              initDeficiencies.render();
              toast('Renamed to: ' + ctr.name);
            }
          });
        }
      },
      { label: '\uD83D\uDDD1 Delete contractor', color: '#9C2742', action: function() {
          var deficCount = (ctr.deficiencies || []).length;
          var msg = deficCount > 0
            ? 'Delete "' + ctr.name + '"? Its ' + deficCount + ' item' + (deficCount === 1 ? '' : 's') + ' will be MOVED to Site Records (not deleted). The contractor record will be removed.'
            : 'Delete "' + ctr.name + '" entirely?';
          showConfirm('Delete Contractor', msg).then(function(yes) {
            if (yes) { var _mv = Model.deleteContractorAndReassign(ctr.id); initDeficiencies.render(); toast('Deleted ' + ctr.name + (_mv > 0 ? ' \u2014 ' + _mv + ' item' + (_mv === 1 ? '' : 's') + ' moved to Site Records' : '')); }
          });
        }
      }
    ]
  });
}

// ── Render ───────────────────────────────────────────────
export var initDeficiencies = {

  render: function() {
    var proj = Model.getProject();
    var container = document.getElementById('deficiencies-container');
    if (!container) return;
    if (!proj) { container.innerHTML = ''; return; }

    var ctrlBar = document.getElementById('defic-control-bar');
    if (ctrlBar) ctrlBar.style.display = 'flex';

    var allDefics = Model.getAllDeficiencies(proj);

    // Render Deficiency Log summary table
    _renderDeficLog(proj, allDefics);

    // Render Trade Board (S136 Phase 1b)
    _renderTradeBoard(proj);

    // S137: per-observation lifecycle counts drive the Active/Closed pivot.
    var pcActive = 0, pcClosed = 0;
    allDefics.forEach(function(rec) {
      (rec.defic.observations || []).forEach(function(o) {
        if (o.addressed) pcClosed++; else pcActive++;
      });
    });
    _syncDfxControls(pcActive, pcClosed, proj);

    // S137/S138: view dispatch — all three views live.
    if (_deficView === 'table') {
      _renderTableView(proj, container);
    } else if (_deficView === 'board') {
      _renderBoardView(proj, container);
    } else {
      _renderDetailedView(proj, container);
    }
    // S138: single unified "+ deficiency" trigger at the foot of every view.
    // Replaces the per-contractor "+ Add Deficiency" rows (Detailed) and the
    // trade-board-foot "+ General Deficiency" button. Contractor / trade /
    // pin / recommendation are all chosen inside the modal.
    container.insertAdjacentHTML('beforeend', _addDeficTriggerHTML());
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

  // S135: Site General items now render as a bottom section (Site General
  // tab was retired in S135). Phase 2 will replace this with a
  // recommendation-aware grey "Site General · Recommendations" section.
  var genActive = (proj.generalDeficiencies || []).filter(deficIsOpen);
  var genTotal = (proj.generalDeficiencies || []).length;
  if (genActive.length || genTotal) {
    html += buildGroup(null, 'Site General', genActive, genTotal);
  }

  if (!(proj.contractors || []).length && !genTotal) {
    html += '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:16px;text-align:center;">No contractors yet. Click "+ Add Contractor" to start.</p>';
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

// ── S137 Phase 2: unified filter engine + Detailed view ──────────
// Flatten (defic, obs) pairs after applying the lifecycle pivot
// (_activeDlcTab) + contractor / priority / search filters. Mirrors the
// unified_defic_demo flatRows() but reads the live model.
function _flatRows(proj, ignorePivot) {
  var all = Model.getAllDeficiencies(proj);
  var q = (_dfxSearch || '').trim().toLowerCase();
  var rows = [];
  all.forEach(function(rec) {
    var d = rec.defic;
    var obs = d.observations || [];
    if (!obs.length) {
      // Legacy 0-obs pin (recoverable edge case — see _buildPinGroupCard).
      // Honor the pivot via effective status so it stays reachable/editable
      // exactly as it was in the pre-S137 contractor-grouped view.
      var closed = deficIsClosed(d);
      if (!ignorePivot && _activeDlcTab === 'active' && closed) return;
      if (!ignorePivot && _activeDlcTab === 'closed' && !closed) return;
      if (_dfxCtr && (rec.contractorId || '') !== _dfxCtr) return;
      if (_dfxPri) return;            // no obs → no priority to match
      if ((_dfxRecMode === 'def' && d.isRecommendation) ||
          (_dfxRecMode === 'rec' && !d.isRecommendation)) return;  // S140 B2b 3-state filter
      if (q && (deficDesc(d) || '').toLowerCase().indexOf(q) < 0) return;
      rows.push({ d: d, o: null, oi: -1, ctrId: rec.contractorId || null, ctrName: rec.contractorName || SITE_RECORDS_LABEL });
      return;
    }
    obs.forEach(function(o, oi) {
      var addressed = !!o.addressed;
      if (!ignorePivot && _activeDlcTab === 'active' && addressed) return;
      if (!ignorePivot && _activeDlcTab === 'closed' && !addressed) return;
      if (_dfxCtr && (rec.contractorId || '') !== _dfxCtr) return;
      if (_dfxPri && (o.priority || 'high') !== _dfxPri) return;
      if ((_dfxRecMode === 'def' && d.isRecommendation) ||
          (_dfxRecMode === 'rec' && !d.isRecommendation)) return;  // S140 B2b 3-state filter
      if (q && (o.text || '').toLowerCase().indexOf(q) < 0) return;
      rows.push({ d: d, o: o, oi: oi, ctrId: rec.contractorId || null, ctrName: rec.contractorName || SITE_RECORDS_LABEL });
    });
  });
  return rows;
}

// Detailed view (Model 2 — S140 B2c). Three disjoint sections, in order:
//   1. Deficiencies — Trade -> Contractor spine (navy trade band, taupe
//      contractor sub-band, the protected _buildPinGroupCard pins).
//      No-trade deficiencies fall to a distinct steel "Other Trade
//      Items" band (the word "Untagged" is gone). Trade is derived via
//      Model.derivePinTrade (B2a root-cause fallback).
//   2. Recommendations — every isRecommendation pin is PULLED OUT of
//      the trade->contractor spine into ONE pooled section (disjoint:
//      each rec appears exactly once). Internal layout = trade
//      SUBHEADINGS only ("No trade assigned" last, §5 Q2 demo default);
//      the contractor is an inline chip on the pin ONLY when one exists
//      — never a contractor sub-band. Header reads "Recommendations
//      (Closed)" under the Closed pivot.
//   3. Site Records — the reserved no-contractor informational bucket
//      (proj.generalDeficiencies, renamed from "Site General"; NEVER a
//      recommendation). Muted-slate band + persistent INTERNAL pill +
//      dimmed cards so it visibly recedes and can't be mistaken for an
//      actionable item. Excluded from external reports by default
//      (Mark-approved treatment, S140).
//
// ⚑ MODEL INTERPRETATION (flagged for Mark — deliberately not silent):
//   The schema has NO separate "is a Site Record" flag. Per S139
//   handoff §4.1/§4.6 ("Site Records = RENAME of Site General; no new
//   flag; no migration"), a NON-recommendation pin with NO contractor
//   (i.e. it lives in proj.generalDeficiencies) IS a Site Record,
//   regardless of any trade on it. A pin with a contractor is a
//   Deficiency; any pin flagged isRecommendation is a Recommendation
//   wherever it lives. This reproduces the approved demo's exact
//   visible output. If Mark wants no-contractor *deficiencies* to be
//   distinct from Site Records, that requires a new schema flag —
//   surface it, do not silently assume.
//
// Rows arrive already filtered by _flatRows (lifecycle pivot + the B2b
// 3-state rec filter + contractor/priority/search), so this function
// only partitions + lays out whatever rows it is given. The filter
// behaves identically in Active and Closed (Behavior B, Mark-approved
// S140) — no special-casing here.
function _renderDetailedView(proj, container) {
  var rows = _flatRows(proj);
  var closedPivot = (_activeDlcTab === 'closed');

  var pinOrder = [];
  var pinAgg = {};
  rows.forEach(function(r) {
    var id = r.d.id;
    if (!pinAgg[id]) { pinAgg[id] = { d: r.d, ctrId: r.ctrId, ctrName: r.ctrName, count: 0 }; pinOrder.push(id); }
    pinAgg[id].count++;
  });

  function ctrOf(ctrId) {
    if (!ctrId) return null;
    return (proj.contractors || []).find(function(x) { return x.id === ctrId; }) || null;
  }
  function pinTrade(e) {
    return Model.derivePinTrade(e.d, ctrOf(e.ctrId));
  }
  function ctrColor(ctrId) {
    if (!ctrId) return '#6B7280';
    var c = (proj.contractors || []).find(function(x) { return x.id === ctrId; });
    return (c && c.color) ? c.color : '#6B7280';
  }

  var OTHER = 'Other Trade Items';
  var NOTRADE = '(No trade assigned)';

  // Partition (disjoint): Recommendations | Site Records | Deficiencies.
  var tradeMap = {};
  var tradeSeen = [];
  var recTrades = {};
  var recTradeSeen = [];
  var recCount = 0;
  var siteRecords = { pins: [], count: 0 };

  pinOrder.forEach(function(id) {
    var e = pinAgg[id];
    if (e.d.isRecommendation) {
      var rt = pinTrade(e) || NOTRADE;
      if (!recTrades[rt]) { recTrades[rt] = { pins: [], count: 0 }; recTradeSeen.push(rt); }
      recTrades[rt].pins.push(e);
      recTrades[rt].count += e.count;
      recCount += e.count;
      return;
    }
    if (!e.ctrId) {
      siteRecords.pins.push(e);
      siteRecords.count += e.count;
      return;
    }
    var t = pinTrade(e);
    var tk = t || OTHER;
    if (!tradeMap[tk]) { tradeMap[tk] = { name: tk, count: 0, ctrKeys: [], ctrs: {} }; tradeSeen.push(tk); }
    var T = tradeMap[tk];
    var ck = e.ctrId;
    if (!T.ctrs[ck]) { T.ctrs[ck] = { ctrId: e.ctrId, name: e.ctrName, pins: [], count: 0 }; T.ctrKeys.push(ck); }
    T.ctrs[ck].pins.push(e);
    T.ctrs[ck].count += e.count;
    T.count += e.count;
  });

  // Trade order: declared projectTrades first, then extras seen, OTHER/
  // NOTRADE appended by the caller.
  function orderTrades(seen, has) {
    var ordered = [];
    (proj.projectTrades || []).forEach(function(t) { if (has(t)) ordered.push(t); });
    seen.forEach(function(t) { if (ordered.indexOf(t) < 0 && t !== OTHER && t !== NOTRADE) ordered.push(t); });
    return ordered;
  }
  var orderedTrades = orderTrades(tradeSeen, function(t) { return !!tradeMap[t]; });
  if (tradeMap[OTHER]) orderedTrades.push(OTHER);

  var ctrIndex = {};
  (proj.contractors || []).forEach(function(c, i) { ctrIndex[c.id] = i; });
  function orderCtrKeys(T) {
    return T.ctrKeys.slice().sort(function(a, b) {
      var ia = (ctrIndex[a] == null) ? 1e9 : ctrIndex[a];
      var ib = (ctrIndex[b] == null) ? 1e9 : ctrIndex[b];
      return ia - ib;
    });
  }

  var h = '';

  // 1. Deficiencies — Trade -> Contractor.
  orderedTrades.forEach(function(tk) {
    var T = tradeMap[tk];
    var isOther = (tk === OTHER);
    h += '<div class="dfx-trade-section">';
    h += '<div class="dfx-trade-banner' + (isOther ? ' other' : '') + '"><span>' + esc(T.name) + '</span><span class="dfx-trade-count">' + T.count + '</span></div>';
    orderCtrKeys(T).forEach(function(ck) {
      var C = T.ctrs[ck];
      h += '<div class="dfx-ctr-banner" style="--cc:' + esc(ctrColor(C.ctrId)) + ';"><span class="dfx-ctr-dot"></span><span>' + esc(C.name) + '</span><span class="dfx-ctr-count">' + C.count + '</span></div>';
      h += '<div class="dfx-pingrp">';
      C.pins.forEach(function(e) { h += _buildPinGroupCard(e.d, C.ctrId); });
      h += '</div>';
    });
    h += '</div>';
  });

  // 2. Recommendations — pooled, pulled out, trade subheadings only.
  if (recCount) {
    var recOrdered = orderTrades(recTradeSeen, function(t) { return !!recTrades[t]; });
    if (recTrades[NOTRADE]) recOrdered.push(NOTRADE);
    h += '<div class="dfx-trade-section">';
    h += '<div class="dfx-trade-banner recs"><span>Recommendations' + (closedPivot ? ' (Closed)' : '') + '</span><span class="dfx-trade-count">' + recCount + '</span></div>';
    h += '<div class="dfx-rec-note">Advisory items outside the contracted scope of work \u2014 issued to document professional recommendations and potential additional work. Each appears once; the PDF carries them as their own section.</div>';
    recOrdered.forEach(function(rt) {
      var R = recTrades[rt];
      h += '<div class="dfx-rec-sub"><span>' + esc(rt) + '</span><span class="dfx-ctr-count">' + R.count + '</span></div>';
      h += '<div class="dfx-pingrp">';
      R.pins.forEach(function(e) {
        var card = _buildPinGroupCard(e.d, e.ctrId);
        h += e.ctrId
          ? ('<div class="dfx-rec-pin"><span class="dfx-rec-ctrchip">' + esc(e.ctrName) + '</span>' + card + '</div>')
          : card;
      });
      h += '</div>';
    });
    h += '</div>';
  }

  // 3. Site Records — reserved internal scope (muted slate, dimmed).
  if (siteRecords.pins.length) {
    h += '<div class="dfx-trade-section dfx-sr-section">';
    h += '<div class="dfx-trade-banner records"><span>Site Records<span class="dfx-sr-pill">Internal \u2014 excluded from client report</span></span><span class="dfx-trade-count">' + siteRecords.count + '</span></div>';
    h += '<div class="dfx-sr-note">Site documentation only (photos / notes). Not a recommendation; not in an external report by default.</div>';
    h += '<div class="dfx-pingrp">';
    siteRecords.pins.forEach(function(e) {
      h += '<div class="dfx-sr-pin">' + _buildPinGroupCard(e.d, null) + '</div>';
    });
    h += '</div></div>';
  }

  if (!h) {
    var lbl = closedPivot ? 'Closed' : 'Active';
    var hasAny = Model.getAllDeficiencies(proj).length > 0;
    h = '<div class="dfx-empty">' + (hasAny
      ? 'No items match the current ' + lbl + ' filters.'
      : 'No deficiencies yet. Add a contractor in the Trade Board, then add deficiencies here.') + '</div>';
  }
  container.innerHTML = h;
}

// ── S138 (in S137): shared helpers for Table + Board ─────────────
function _dfxObsLabel(d, oi) {
  var n = d.num != null ? d.num : '?';
  var multi = (d.observations || []).length > 1;
  return (multi && oi >= 0) ? (n + String.fromCharCode(65 + oi)) : ('' + n);
}
function _dfxThumb(d, oi, cls) {
  var src = '';
  if (oi >= 0) {
    var ph = (Model.getEffectivePhotos ? Model.getEffectivePhotos(d, oi) : ((d.observations && d.observations[oi] && d.observations[oi].photos) || []));
    if (ph && ph.length) src = ph[0].thumb || ph[0].dataUrl || ph[0].r2Url || '';
  }
  if (src) return '<img class="' + cls + '" src="' + esc(src) + '" loading="lazy" alt="">';
  return '<div class="' + cls + '"></div>';
}
function _dfxCtrColor(proj, ctrId) {
  if (!ctrId) return '#6B7280';
  var c = (proj.contractors || []).find(function(x) { return x.id === ctrId; });
  return (c && c.color) ? c.color : '#6B7280';
}
// Table/Board entries navigate to the live interactive card in Detailed.
function _dfxGotoPin(deficId) {
  _deficView = 'detailed';
  initDeficiencies.render();
  setTimeout(function() {
    var el = document.querySelector('#deficiencies-container [data-defic-id="' + (window.CSS && CSS.escape ? CSS.escape(deficId) : deficId) + '"]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('dfx-flash');
      setTimeout(function() { el.classList.remove('dfx-flash'); }, 1400);
    }
  }, 60);
}

// ── Table view — row per (defic, obs) ────────────────────────────
function _renderTableView(proj, container) {
  var rows = _flatRows(proj);
  if (!rows.length) {
    var hasAny = Model.getAllDeficiencies(proj).length > 0;
    container.innerHTML = '<div class="dfx-empty">' + (hasAny
      ? 'No items match the current ' + (_activeDlcTab === 'closed' ? 'Closed' : 'Active') + ' filters.'
      : 'No deficiencies yet.') + '</div>';
    return;
  }
  var h = '<table class="dfx-tbl"><thead><tr>'
    + '<th>#</th><th>Trade</th><th>Contractor</th><th>Description</th>'
    + '<th>Priority</th><th>Status</th><th>Photo</th>'
    + '</tr></thead><tbody>';
  rows.forEach(function(r) {
    var d = r.d, o = r.o, oi = r.oi;
    var closed = (oi >= 0) ? !!o.addressed : deficIsClosed(d);
    var pri = (oi >= 0) ? (o.priority || 'high') : (Model.getEffectivePriority(d) || 'high');
    var trade = (oi >= 0 ? (o.trade || '') : ((d.observations && d.observations[0] && d.observations[0].trade) || ''));
    var cName = r.ctrId ? r.ctrName : SITE_RECORDS_LABEL;
    var desc = (oi >= 0) ? (o.text || '') : deficDesc(d);
    var numCls = closed ? 'closed' : (pri === 'low' ? 'low' : pri === 'general' ? 'general' : '');
    h += '<tr class="' + (closed ? 'dfx-closed' : '') + '" data-action="dfx-goto" data-defic-id="' + esc(d.id) + '">'
      + '<td><span class="dfx-tbl-num ' + numCls + '">#' + esc(_dfxObsLabel(d, oi)) + '</span></td>'
      + '<td>' + (trade ? esc(trade) : '<em style="color:var(--silver);">none</em>') + (d.isRecommendation ? ' <span class="rec-badge">REC</span>' : '') + '</td>'
      + '<td>' + (r.ctrId ? '<span class="dfx-tbl-ctr" style="--cc:' + esc(_dfxCtrColor(proj, r.ctrId)) + ';"></span>' : '') + esc(cName) + '</td>'
      + '<td>' + esc(desc) + '</td>'
      + '<td><span class="dfx-status-mini ' + (pri === 'low' ? 'low' : pri === 'general' ? 'general' : 'high') + '">' + esc(pri.toUpperCase()) + '</span></td>'
      + '<td><span class="dfx-status-mini ' + (closed ? 'closed' : (pri === 'low' ? 'low' : pri === 'general' ? 'general' : 'high')) + '">' + (closed ? 'CLOSED' : 'OUTSTANDING') + '</span></td>'
      + '<td>' + _dfxThumb(d, oi, 'dfx-tbl-thumb') + '</td>'
      + '</tr>';
  });
  h += '</tbody></table>';
  container.innerHTML = h;
}

// ── Board view — priority kanban + always-visible Closed column ──
// Pivot-independent (ignorePivot=true): the board carries its own
// Closed column, so Active/Closed pivot does not scope it.
function _renderBoardView(proj, container) {
  var rows = _flatRows(proj, true);
  var buckets = { high: [], low: [], general: [], closed: [] };
  rows.forEach(function(r) {
    var d = r.d, o = r.o, oi = r.oi;
    var closed = (oi >= 0) ? !!o.addressed : deficIsClosed(d);
    if (closed) { buckets.closed.push(r); return; }
    var pri = (oi >= 0) ? (o.priority || 'high') : (Model.getEffectivePriority(d) || 'high');
    if (pri === 'low') buckets.low.push(r);
    else if (pri === 'general') buckets.general.push(r);
    else buckets.high.push(r);
  });

  function card(r) {
    var d = r.d, o = r.o, oi = r.oi;
    var cName = r.ctrId ? r.ctrName : SITE_RECORDS_LABEL;
    var cColor = _dfxCtrColor(proj, r.ctrId);
    var trade = (oi >= 0 ? (o.trade || '') : ((d.observations && d.observations[0] && d.observations[0].trade) || ''));
    var desc = (oi >= 0) ? (o.text || '') : deficDesc(d);
    return '<div class="dfx-bv-card" data-action="dfx-goto" data-defic-id="' + esc(d.id) + '">'
      + '<div class="dfx-bv-card-top">'
      + '<span class="dfx-bv-card-num">#' + esc(_dfxObsLabel(d, oi)) + '</span>'
      + '<span class="dfx-bv-card-ctr" style="--cc:' + esc(cColor) + ';">' + esc(cName) + '</span>'
      + '</div>'
      + '<div class="dfx-bv-card-text">' + esc(desc) + '</div>'
      + '<div class="dfx-bv-card-bottom">'
      + _dfxThumb(d, oi, 'dfx-bv-card-thumb')
      + (d.isRecommendation ? '<span class="dfx-bv-rec">REC</span>' : '')
      + '<span class="dfx-bv-card-trade">' + esc(trade || 'untagged') + '</span>'
      + '</div></div>';
  }
  function col(cls, label, arr) {
    var body = arr.length ? arr.map(card).join('') : '<div class="dfx-bv-empty">none</div>';
    return '<div class="dfx-bv-col">'
      + '<div class="dfx-bv-col-hdr ' + cls + '"><span>' + label + '</span><span class="dfx-bv-col-count">' + arr.length + '</span></div>'
      + '<div class="dfx-bv-col-body">' + body + '</div></div>';
  }
  container.innerHTML = '<div class="dfx-board">'
    + col('h', 'High Priority', buckets.high)
    + col('l', 'Low Priority', buckets.low)
    + col('g', 'General', buckets.general)
    + col('c', 'Closed', buckets.closed)
    + '</div>';
}

// ── S138: unified "+ deficiency" trigger + modal ─────────────────
// One trigger card at the foot of every view. The modal collects
// description / priority / contractor / trade / pin / recommendation,
// then creates through existing Model methods (addDeficiency +
// updateObservation/updateObsPriority/updateObsTrade); the additive
// isRecommendation / drawingId are set on the returned defic (the
// same object-mutation precedent used by spin-off). Persists via
// Model.saveNow() (the established UI create path).
function _addDeficTriggerHTML() {
  return '<div class="add-deficiency-card" data-action="open-add-defic" role="button" tabindex="0">'
    + '+ deficiency &nbsp;\u00B7&nbsp; '
    + '<span style="font-weight:400;">creates an item \u2014 assign contractor / trade / pin in the dialog, or skip &amp; add later</span>'
    + '</div>';
}

function _closeAddDeficModal() {
  var ov = document.getElementById('add-defic-overlay');
  if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
}

function _openAddDeficModal() {
  _closeAddDeficModal();
  var proj = Model.getProject();
  if (!proj) return;

  var ctrOpts = '<option value="">\u2014 None (' + SITE_RECORDS_LABEL + ' \u00B7 internal) \u2014</option>';
  (proj.contractors || []).forEach(function(c) {
    ctrOpts += '<option value="' + esc(c.id) + '">' + esc(c.name || 'Unnamed') + '</option>';
  });
  var trOpts = '<option value="">\u2014 None \u2014</option>';
  (proj.projectTrades || []).forEach(function(t) {
    trOpts += '<option value="' + esc(t) + '">' + esc(t) + '</option>';
  });
  var pinOpts = '<option value="">\u2014 Add later from drawing \u2014</option>';
  (proj.drawings || []).forEach(function(dw) {
    if (!dw || !dw.id) return;
    pinOpts += '<option value="' + esc(dw.id) + '">' + esc(dw.name || dw.fileName || 'Drawing') + '</option>';
  });

  var ov = document.createElement('div');
  ov.id = 'add-defic-overlay';
  ov.className = 'pin-modal-overlay open';
  var h = '<div class="pin-modal" role="dialog" aria-label="New deficiency">';
  h += '<div class="pin-panel-header"><h3>+ New deficiency</h3></div>';
  h += '<div class="pin-panel-body">';
  h += '<div class="field-group"><label for="adf-text">Description</label>'
     + '<textarea id="adf-text" placeholder="Describe the observation\u2026"></textarea></div>';
  h += '<div class="field-group"><label for="adf-pri">Priority</label>'
     + '<select id="adf-pri"><option value="high">High</option>'
     + '<option value="low">Low</option><option value="general">General</option></select></div>';
  h += '<div class="field-group"><label for="adf-ctr">Contractor</label>'
     + '<select id="adf-ctr">' + ctrOpts + '</select></div>';
  h += '<div class="field-group"><label for="adf-trade">Trade</label>'
     + '<select id="adf-trade">' + trOpts + '</select></div>';
  h += '<div class="field-group"><label for="adf-pin">Pin location</label>'
     + '<select id="adf-pin">' + pinOpts + '</select></div>';
  h += '<div class="modal-checkbox-row" id="adf-recrow">'
     + '<input type="checkbox" id="adf-rec">'
     + '<label>This is a <strong>recommendation</strong> \u2014 a note for owner/client consideration; doesn\u2019t block sign-off</label>'
     + '</div>';
  h += '</div>';   // pin-panel-body
  h += '<div class="pin-panel-footer">'
     + '<button class="btn btn-outline" id="adf-cancel">Cancel</button>'
     + '<button class="btn btn-primary" id="adf-add">Add</button>'
     + '</div>';
  h += '</div>';   // pin-modal
  ov.innerHTML = h;
  document.body.appendChild(ov);

  var txt = ov.querySelector('#adf-text');
  setTimeout(function() { if (txt) txt.focus(); }, 50);

  function doCreate() {
    var text = (txt && txt.value || '').trim();
    if (!text) { toast('Enter a description first'); if (txt) txt.focus(); return; }
    var ctrId = (ov.querySelector('#adf-ctr').value) || null;
    var d = Model.addDeficiency(ctrId);
    if (!d) { toast('\u26A0 Could not create deficiency'); return; }
    Model.updateObservation(d.id, 0, text);
    Model.updateObsPriority(d.id, 0, ov.querySelector('#adf-pri').value || 'high');
    var tr = ov.querySelector('#adf-trade').value || '';
    Model.updateObsTrade(d.id, 0, tr, 'manual');
    // Additive fields — set on the returned live defic (spin-off precedent).
    d.isRecommendation = !!ov.querySelector('#adf-rec').checked;
    var pin = ov.querySelector('#adf-pin').value;
    if (pin) d.drawingId = pin;   // pinX/pinY stay null — placed later on the drawing
    Model.saveNow();
    _closeAddDeficModal();
    // A freshly created obs is unaddressed → ensure it is visible under the
    // Active pivot (it would be hidden if the user was viewing Closed).
    _activeDlcTab = 'active';
    initDeficiencies.render();
    toast('Added #' + d.num);
  }

  ov.addEventListener('click', function(e) {
    if (e.target === ov || e.target.id === 'adf-cancel') { _closeAddDeficModal(); return; }
    if (e.target.id === 'adf-add') { doCreate(); return; }
    var recRow = e.target.closest && e.target.closest('#adf-recrow');
    if (recRow && e.target.id !== 'adf-rec') {
      var cb = ov.querySelector('#adf-rec'); if (cb) cb.checked = !cb.checked; return;
    }
  });
}

// Sync the control bar to current state: pivot counts, active classes,
// contractor dropdown options, filter input values.
function _syncDfxControls(pcActive, pcClosed, proj) {
  var ea = document.getElementById('dfx-pc-active');
  var ec = document.getElementById('dfx-pc-closed');
  if (ea) ea.textContent = pcActive;
  if (ec) ec.textContent = pcClosed;

  document.querySelectorAll('.defic-pivot-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-pivot') === _activeDlcTab);
  });
  document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-view') === _deficView);
  });

  var sel = document.getElementById('dfx-ctr');
  if (sel) {
    var ctrs = (proj.contractors || []);
    var stillValid = !_dfxCtr || ctrs.some(function(c) { return c.id === _dfxCtr; });
    if (!stillValid) _dfxCtr = '';
    var opt = '<option value="">All contractors</option>';
    ctrs.forEach(function(c) {
      opt += '<option value="' + esc(c.id) + '"' + (c.id === _dfxCtr ? ' selected' : '') + '>' + esc(c.name || 'Unnamed') + '</option>';
    });
    sel.innerHTML = opt;
    sel.value = _dfxCtr;
  }
  var pri = document.getElementById('dfx-pri');
  if (pri && document.activeElement !== pri) pri.value = _dfxPri;
  var sb = document.getElementById('dfx-search');
  if (sb && document.activeElement !== sb) sb.value = _dfxSearch;
  // S140 B2b: 3-state rec-mode segmented control (replaces #dfx-reconly).
  document.querySelectorAll('.dfx-recmode-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-recmode') === _dfxRecMode);
  });
}

// ── S137 Phase 2: control-bar interactions ───────────────
document.addEventListener('click', function(e) {
  var gt = e.target.closest && e.target.closest('[data-action="dfx-goto"]');
  if (gt) { _dfxGotoPin(gt.getAttribute('data-defic-id')); return; }
  var pb = e.target.closest && e.target.closest('.defic-pivot-btn');
  if (pb) {
    var p = pb.getAttribute('data-pivot');
    if (p && p !== _activeDlcTab) { _activeDlcTab = p; initDeficiencies.render(); }
    return;
  }
  var vb = e.target.closest && e.target.closest('.view-toggle-btn');
  if (vb) {
    var v = vb.getAttribute('data-view');
    if (v && v !== _deficView) { _deficView = v; initDeficiencies.render(); }
    return;
  }
  var rm = e.target.closest && e.target.closest('.dfx-recmode-btn');
  if (rm) {
    var m = rm.getAttribute('data-recmode');
    if (m && m !== _dfxRecMode) { _dfxRecMode = m; initDeficiencies.render(); }
    return;
  }
});
document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'dfx-search') {
    _dfxSearch = e.target.value || '';
    clearTimeout(window._dfxSearchT);
    window._dfxSearchT = setTimeout(function() { initDeficiencies.render(); }, 180);
  }
});
document.addEventListener('change', function(e) {
  if (!e.target) return;
  if (e.target.id === 'dfx-ctr') { _dfxCtr = e.target.value || ''; initDeficiencies.render(); }
  else if (e.target.id === 'dfx-pri') { _dfxPri = e.target.value || ''; initDeficiencies.render(); }
});

function _updateDlcCounts(activeCount, closedCount) {
  document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(tab) {
    var type = tab.getAttribute('data-dlc');
    var count = type === 'active' ? activeCount : closedCount;
    var label = type === 'active' ? 'Active' : 'Closed';
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
        ? 'Delete "' + ctrName + '"? Its ' + deficCount + ' item' + (deficCount === 1 ? '' : 's') + ' will be MOVED to Site Records (not deleted). The contractor record will be removed.'
        : 'Delete "' + ctrName + '"?';
      showConfirm('Delete Contractor', msg).then(function(yes) {
        if (yes) { var _mv2 = Model.deleteContractorAndReassign(ctrId); initDeficiencies.render(); toast('Deleted ' + ctrName + (_mv2 > 0 ? ' \u2014 ' + _mv2 + ' item' + (_mv2 === 1 ? '' : 's') + ' moved to Site Records' : '')); }
      });
    }
  }

  if (action === 'open-add-defic') {
    _openAddDeficModal();
    return;
  }

  if (action === 'add-defic') {
    var ctrId = el.getAttribute('data-ctr-id') || null;
    var defic = Model.addDeficiency(ctrId || null);
    if (defic) {
      initDeficiencies.render();
      toast('Deficiency #' + defic.num + ' added');
    }
  }

  // ── Trade Board (S136 Phase 1b) ─────────────────────────────
  if (action === 'pick-add-ctr-to-trade') {
    var tradeA = el.getAttribute('data-trade');
    if (tradeA) _openCtrPicker(tradeA);
    return;
  }

  if (action === 'picker-close') {
    _closeCtrPicker();
    return;
  }

  if (action === 'picker-pick-ctr') {
    var ctrIdP = el.getAttribute('data-ctr-id');
    var tradeP = el.getAttribute('data-trade');
    if (ctrIdP && tradeP) {
      Model.addContractorToTrade(ctrIdP, tradeP);
      _closeCtrPicker();
      initDeficiencies.render();
      toast('Added to ' + tradeP);
    }
    return;
  }

  if (action === 'picker-add-new-ctr') {
    var tradeN = el.getAttribute('data-trade');
    var inpN = document.getElementById('picker-new-ctr-input');
    var nameN = inpN ? inpN.value.trim() : '';
    if (!nameN) { if (inpN) inpN.focus(); return; }
    var newCtr = Model.addContractor(nameN);
    if (newCtr && tradeN) {
      Model.addContractorToTrade(newCtr.id, tradeN);
    }
    _closeCtrPicker();
    initDeficiencies.render();
    toast('Added: ' + nameN + (tradeN ? ' to ' + tradeN : ''));
    return;
  }

  if (action === 'ctr-remove-from-trade') {
    var ctrIdR = el.getAttribute('data-ctr-id');
    var tradeR = el.getAttribute('data-trade');
    if (ctrIdR && tradeR) {
      Model.removeContractorFromTrade(ctrIdR, tradeR);
      initDeficiencies.render();
      toast('Removed from ' + tradeR);
    }
    return;
  }

  if (action === 'ctr-edit') {
    var ctrIdE = el.getAttribute('data-ctr-id');
    if (!ctrIdE) { var elE = el.closest('[data-ctr-id]'); if (elE) ctrIdE = elE.getAttribute('data-ctr-id'); }
    if (ctrIdE) {
      var projE = Model.getProject();
      var ctrE = (projE.contractors || []).find(function(c) { return c.id === ctrIdE; });
      if (ctrE) _showCtrEditDialog(ctrE);
    }
    return;
  }

  if (action === 'show-add-trade') {
    // Replace the + trade button with an inline input
    var btnT = el;
    var inputT = document.createElement('input');
    inputT.type = 'text';
    inputT.placeholder = 'e.g. Standpipe';
    inputT.className = 'trade-add-col-input';
    inputT.autocomplete = 'off';
    btnT.parentNode.replaceChild(inputT, btnT);
    inputT.focus();
    var cancelled = false;
    var commit = function() {
      if (cancelled) return;
      var v = inputT.value.trim();
      if (v) {
        Model.addProjectTrade(v);
        initDeficiencies.render();
      } else {
        initDeficiencies.render(); // restore + trade button
      }
    };
    inputT.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancelled = true; initDeficiencies.render(); }
    });
    inputT.addEventListener('blur', function() {
      setTimeout(commit, 100);
    });
    return;
  }

  if (action === 'del-trade-col') {
    var tradeD = el.getAttribute('data-trade');
    if (!tradeD) return;
    var projD = Model.getProject();
    var ctrsIn = (projD.contractors || []).filter(function(c) { return (c.trades || []).indexOf(tradeD) !== -1; });
    if (ctrsIn.length) {
      showConfirm('Remove trade column', 'Remove the "' + tradeD + '" column? ' + ctrsIn.length + ' contractor' + (ctrsIn.length === 1 ? '' : 's') + ' will be unassigned from this trade (contractor records and deficiencies are preserved).').then(function(yes) {
        if (yes) { Model.removeProjectTrade(tradeD); initDeficiencies.render(); toast('Removed trade: ' + tradeD); }
      });
    } else {
      Model.removeProjectTrade(tradeD);
      initDeficiencies.render();
      toast('Removed trade: ' + tradeD);
    }
    return;
  }
  if (action === 'ctr-rename-inline') {
    var _crId = el.getAttribute('data-ctr-id');
    if (!_crId) { var _crE = el.closest('[data-ctr-id]'); if (_crE) _crId = _crE.getAttribute('data-ctr-id'); }
    if (_crId) {
      var _crP = Model.getProject();
      var _crC = ((_crP && _crP.contractors) || []).find(function(c) { return c.id === _crId; });
      if (_crC) {
        showPrompt('Rename Contractor', 'New name:', _crC.name).then(function(nm) {
          var _nm = (nm || '').trim();
          if (_nm && _nm !== _crC.name) {
            Model.renameContractor(_crId, _nm);
            initDeficiencies.render();
            toast('Renamed to ' + _nm);
          }
        });
      }
    }
    return;
  }

  // S140 B2e: the ONLY contractor-delete path, and it is non-destructive.
  // deleteContractorAndReassign moves the contractor's deficiencies into
  // generalDeficiencies (Site Records) BEFORE removing the contractor —
  // pins/observations/photos are preserved, just reparented. The
  // destructive Model.removeContractor is no longer called from any UI
  // path (kept in model.js, unused — S137 discipline). No Undo yet
  // (Phase 4), so "can't lose data in the first place" is the safety net.
  if (action === 'ctr-delete-safe') {
    var _cdId = el.getAttribute('data-ctr-id');
    if (!_cdId) { var _cdE = el.closest('[data-ctr-id]'); if (_cdE) _cdId = _cdE.getAttribute('data-ctr-id'); }
    if (_cdId) {
      var _cdP = Model.getProject();
      var _cdC = ((_cdP && _cdP.contractors) || []).find(function(c) { return c.id === _cdId; });
      if (_cdC) {
        var _cdN = (_cdC.deficiencies || []).length;
        var _cdMsg = _cdN > 0
          ? 'Delete "' + _cdC.name + '"? Its ' + _cdN + ' item' + (_cdN === 1 ? '' : 's') + ' will be MOVED to Site Records (not deleted) and can be reassigned. The contractor record will be removed.'
          : 'Delete "' + _cdC.name + '"? (No items — nothing to move.)';
        showConfirm('Delete Contractor', _cdMsg).then(function(yes) {
          if (yes) {
            var _moved = Model.deleteContractorAndReassign(_cdId);
            initDeficiencies.render();
            toast('Deleted ' + _cdC.name + (_moved > 0 ? ' \u2014 ' + _moved + ' item' + (_moved === 1 ? '' : 's') + ' moved to Site Records' : ''));
          }
        });
      }
    }
    return;
  }
  // ── End Trade Board handlers ────────────────────────────────

  if (action === 'add-general') {
    var defic = Model.addDeficiency(null);
    if (defic) {
      _activeDlcTab = 'active';
      document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-dlc') === 'active');
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
    var ctrName = f.contractor ? (f.contractor.name || 'this contractor') : SITE_RECORDS_LABEL;
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
    // S135: IAR confirm flow retired. When toggling addressed → closed
    // on an IAR pin, the silent-degrade write (defic.iar = false on
    // status-mirror) is preserved via Model.updateDeficStatus. No prompt.
    var _ta = Model.findDeficiency(deficId);
    if (_ta && _ta.defic && _ta.defic.iar) _ta.defic.iar = false;
    Model.toggleObsAddressed(deficId, obsIdx);
    initDeficiencies.render();
    if (window._frtRenderTasks) window._frtRenderTasks();
  }

  // S121 Push 7: per-obs status select (multi-obs path). Reuses the same
  // toggleObsAddressed model call as the toggle-addressed button — only
  // fires when the new value actually differs from current addressed state.
  // Triggered on 'change' (not click), so this handler is in the change
  // dispatcher above, not the click dispatcher.
  // The select value 'open' = addressed:false, 'closed' = addressed:true.

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

  // S122 Push 6 (Piece D) — view all photos carousel. Collects pin pool
  // (defic.photos[]) + activity entry photos into one array for the lightbox
  // so users can swipe through everything in one session.
  if (action === 'view-all-photos') {
    var deficId = el.getAttribute('data-defic-id');
    var f = Model.findDeficiency(deficId);
    if (!f) return;
    var dd = f.defic;
    var allPhotos = (dd.photos || []).slice();
    (dd.activity || []).forEach(function(a) {
      if (a.photos) a.photos.forEach(function(ph) { allPhotos.push(ph); });
    });
    if (allPhotos.length && window._frtLightbox && window._frtLightbox.open) {
      window._frtLightbox.open(allPhotos, 0);
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
    var opts = '<option value="">' + SITE_RECORDS_LABEL + ' (internal)</option>';
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
  // option click triggers the appropriate mode and populates the scratchpad
  // S135: per-obs AI Review menu retired. The popup trigger and option
  // handlers (ai-review-pin-photos / ai-review-pin-text / ai-review-pin-quick)
  // are removed. Phase 6 will reintroduce as a global "Polish observations"
  // toolbar action. window.AIAssist.aiReviewObs / aiReviewPin remain
  // available in assistant.js for that future re-wiring.

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
    // S122 Push 5 (Piece B) — when invoked from a per-obs thread's
    // +Response/+Comment, the data-obs-ref attribute carries the obs letter.
    // Pass it as a 4th arg to pre-select "Regarding" in the modal.
    var preObsRef = el.getAttribute('data-obs-ref') || null;
    _showActivityModal(deficId, label, null, preObsRef);
  }

  // S122 Push 5 — edit existing activity entry (reuses _showActivityModal in edit mode).
  if (action === 'edit-activity') {
    var deficId = el.getAttribute('data-defic-id');
    var actId = el.getAttribute('data-act-id');
    if (deficId && actId) _showActivityModal(deficId, '', actId);
  }

  // S122 Push 5 — delete activity entry with confirmation.
  if (action === 'delete-activity') {
    var deficId = el.getAttribute('data-defic-id');
    var actId = el.getAttribute('data-act-id');
    if (!deficId || !actId) return;
    showConfirm('Delete activity entry?', 'This cannot be undone.').then(function(ok) {
      if (!ok) return;
      Model.removeActivityEntry(deficId, actId);
      Model.saveNow();
      initDeficiencies.render();
      toast('Activity entry deleted');
    });
  }

  // S122 Push 6 — click activity entry photo → open lightbox with all photos
  // from this entry, starting at the clicked one.
  if (action === 'open-act-photo') {
    var deficId = el.getAttribute('data-defic-id');
    var actId = el.getAttribute('data-act-id');
    var pi = parseInt(el.getAttribute('data-photo-idx') || '0', 10);
    var f = Model.findDeficiency(deficId);
    if (!f || !f.defic.activity) return;
    var actEntry = null;
    for (var _ai = 0; _ai < f.defic.activity.length; _ai++) {
      if (f.defic.activity[_ai].id === actId) { actEntry = f.defic.activity[_ai]; break; }
    }
    if (!actEntry || !actEntry.photos || !actEntry.photos.length) return;
    if (window._frtLightbox && window._frtLightbox.open) {
      window._frtLightbox.open(actEntry.photos, pi || 0);
    }
  }

  if (action === 'close-defic') {
    var deficId = el.getAttribute('data-defic-id');
    var _cd = Model.findDeficiency(deficId);
    var _cnum = _cd ? _cd.defic.num || '?' : '?';
    // S135: IAR confirm gate retired. Silent-degrade write of iar=false
    // still happens inside the close handler below.
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
  }

  if (action === 'reopen-defic') {
    var deficId = el.getAttribute('data-defic-id');
    var _rf = Model.findDeficiency(deficId);
    Model.updateDeficStatus(deficId, 'open');
    // S135: Site General tab retired — always route to active view, which
    // renders both contractor groups AND the Site General bottom section.
    _activeDlcTab = 'active';
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

  // S140 B2d: assign an unassigned contractor to a trade from the strip.
  // addProjectTrade is idempotent — guarantees the destination column
  // exists so the contractor visibly moves out of the strip into it.
  if (action === 'ctr-assign-trade') {
    var _atId = e.target.getAttribute('data-ctr-id');
    var _atT = e.target.value;
    if (_atId && _atT) {
      Model.addProjectTrade(_atT);
      Model.setContractorTrades(_atId, [_atT]);
      initDeficiencies.render();
      toast('Assigned to ' + _atT);
    }
    return;
  }
  // toggleObsAddressed when the new state differs from the current. IAR
  // confirmation flows through the same path as toggle-addressed.
  if (action === 'obs-status') {
    var deficId = e.target.getAttribute('data-defic-id');
    var obsIdx = parseInt(e.target.getAttribute('data-obs-idx') || '0', 10);
    var newStatus = e.target.value; // 'open' or 'closed'
    var newAddressed = (newStatus === 'closed');
    var _ssf = Model.findDeficiency(deficId);
    if (!_ssf || !_ssf.defic || !_ssf.defic.observations) return;
    var curAddressed = !!(_ssf.defic.observations[obsIdx] || {}).addressed;
    if (curAddressed === newAddressed) return; // no-op
    // S135: IAR confirm gate retired. Silent-degrade write only.
    if (_ssf.defic.iar && newAddressed) _ssf.defic.iar = false;
    Model.toggleObsAddressed(deficId, obsIdx);
    initDeficiencies.render();
    if (window._frtRenderTasks) window._frtRenderTasks();
    return;
  }

  if (action === 'status') {
    var deficId = e.target.getAttribute('data-defic-id');
    var newStatus = e.target.value;
    var _sf = Model.findDeficiency(deficId);
    // S135: IAR confirm gate retired. Silent-degrade write of iar=false
    // happens via Model.updateDeficStatus's status mirror.
    if (newStatus === 'closed' && _sf && _sf.defic && _sf.defic.iar) _sf.defic.iar = false;
    Model.updateDeficStatus(deficId, newStatus);
    // S135: Site General tab retired — non-closed routes to active view
    // (which renders the Site General bottom section).
    _activeDlcTab = (newStatus === 'closed') ? 'closed' : 'active';
    document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-dlc') === _activeDlcTab);
    });
    initDeficiencies.render();
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
        var moveMsg = 'Setting this pin\u2019s priority to General will MOVE pin #' + dnum + ' out of "' + ctrName + '" and into ' + SITE_RECORDS_LABEL + ' (the reserved no-contractor scope). The pin will no longer appear under any contractor. Continue?';
        showConfirm('Move pin to ' + SITE_RECORDS_LABEL + '?', moveMsg).then(function(yes) {
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
          _activeDlcTab = 'active';
          document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
            t.classList.toggle('active', t.getAttribute('data-dlc') === 'active');
          });
          initDeficiencies.render();
          toast('#' + dnum + ' moved to ' + SITE_RECORDS_LABEL);
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

  // S134/S135: per-obs trade dropdown. Manual override is recorded so
  // future AI/auto-tagging logic won't overwrite a deliberate user choice.
  // The AI/MAN source badge was retired in S135 — visual differentiation
  // returns in Phase 2 (Detailed view) as derived data from the trade board.
  if (action === 'obs-trade') {
    var _tdid = e.target.getAttribute('data-defic-id');
    var _toi = parseInt(e.target.getAttribute('data-obs-idx') || '0', 10);
    var _tval = e.target.value || '';
    Model.updateObsTrade(_tdid, _toi, _tval, 'manual');
    Model.saveNow();
    initDeficiencies.render();
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
  // S130 5.4: compression in worker (OffscreenCanvas). The R2 upload that
  // follows is unchanged — still routed through R2.uploadPhoto which now
  // also goes through UploadQueue (S130 5.1) for concurrency control.
  ImageWorkerHost.compressFile(file, { maxW: 1600, quality: 0.8 })
    .then(function(r) {
      var photo = Model.addObservationPhoto(deficId, obsIdx, r.dataUrl);
      initDeficiencies.render();
      toast('Photo added');
      var pid = new URLSearchParams(window.location.search).get('project');
      if (pid && photo) {
        R2.uploadPhoto(pid, photo, 'original').then(function() {
          Model.saveNow(); // Save updated r2Key/r2Url
        });
      }
    })
    .catch(function(err) {
      console.warn('[Deficiencies] photo compression failed:', err && err.message);
    });
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
      show = deficIsOpen(d);
    }
    // Search filter
    if (show && _searchQuery) {
      var text = (deficDesc(d) + ' ' + (d.num || '')).toLowerCase();
      show = text.indexOf(_searchQuery) >= 0;
    }
    item.style.display = show ? '' : 'none';
  });
}

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

// S135 — S130 AI Group Deficiencies feature retired (AI Group toolbar
// trigger, obs group picker, section catalog editor). Replaced in Phase 2+
// by contractor-scoped trade board. obs.aiGroup field stays in JSON one
// session as silent-degrade write-only, then removed entirely.

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
      + '<button data-defic-filter="high">High priority only</button>';
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
            var show = mode === 'all'
              || (mode === 'outstanding' && st === 'outstanding')
              || (mode === 'in-progress' && (st === 'in-progress' || st === 'in progress'))
              || (mode === 'closed' && st === 'closed')
              || (mode === 'high' && pr === 'high');
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
});

// S135 — S78 Bulk Select feature retired. The toolbar Select button,
// per-card checkbox injection, bulk action bar (close/reopen/IAR/delete/
// all/none/cancel), and the _deficSelectMode state are gone. Phase 4
// undo/redo system replaces bulk operations as the safety net.

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

