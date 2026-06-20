/**
 * ARENCON FRT v2 — Deficiencies UI
 * ═════════════════════════════════
 * 
 * Interactive deficiency management:
 *   - Add/remove contractors
 *   - Add deficiencies per contractor or general
 *   - Edit observation text (two-way binding)
 *   - Change status/priority
 *   - Lifecycle tabs (Active / Site Records / Closed)
 */

import { Model, TRADE_LIST, SITE_RECORDS_LABEL, isSiteRecordsName } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm, showPrompt, showDialog } from '../shared/dialogs.js';
import { FrtPhotoPicker } from './photoPicker.js'; // S215: shared photo-selection picker (B + C)
import { openCameraBurst } from './cameraBurst.js'; // S284: continuous in-app camera (Mark)
import { R2 } from '../data/r2.js';
import { BinaryOutbox } from '../data/photoOutbox.js';
import { ImageWorkerHost } from '../workers/imageWorkerHost.js';
import { AIAssist } from '../ai/assistant.js';

// ── Helpers ──────────────────────────────────────────────
// S151 Bug C fix: coerce non-strings before .replace. Latent since esc()
// existed — callers like esc(d.num) (d.num is a Number) only began reaching
// it once the Table/Board rows started opening the focused pin. String(...)
// makes every caller safe; '' guard preserves the old falsy→'' behaviour.
function esc(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// S161 P2: Sync state badge for obs-photo cards in the pin editor. Composes
// the R2 binary state (already tracked via ph.r2Status / ph.r2Url) with the
// cloud-metadata state (derived from SyncEngine.diag.lastSeenUpdatedAt vs
// the photo id's embedded creation timestamp). Five resulting states:
//   ☁ gray   "Local only"            — no R2 upload attempted yet
//   ⏳ orange "Uploading to R2…"     — R2 PUT in flight
//   ❌ red    "R2 upload failed"      — R2 PUT errored
//   ⏳ orange "Awaiting cloud sync"  — R2 done, but added since last push
//   ✓ green  "Fully synced"          — R2 done AND included in last cloud push
// The lastSeenUpdatedAt value persists across reloads (sync.js _persistSyncMeta).
// Photo id format: prefix_<ms-epoch>_<counter>_<rand>. We parse the ms-epoch.
// Mirrored in photos.js _cloudIcon (gallery card). KEEP IN SYNC.
function _obsPhotoSyncBadge(ph) {
  if (!ph) return '';
  var status, color, glyph = '';
  // R2 state wins when it's explicitly failed
  if (ph.r2Status === 'failed') {
    status = 'R2 upload failed'; color = '#A85959';
    glyph = '<path d="M9 9l6 6M15 9l-6 6" stroke="white" stroke-width="2.2" stroke-linecap="round"/>';
  } else if (ph.r2Status === 'uploading' || ph.r2Status === 'pending') {
    status = 'Uploading to R2\u2026'; color = '#FFA726';
  } else if (ph.r2Status === 'uploaded' || (ph.r2Url && !ph.r2Status)) {
    // R2 confirmed. Now check cloud-metadata sync.
    var lastSync = null;
    try {
      if (typeof window !== 'undefined' && window.SyncEngine && window.SyncEngine.diag) {
        lastSync = window.SyncEngine.diag.lastSeenUpdatedAt;
      }
    } catch (e) { /* defensive */ }
    var photoTs = 0;
    var m = String(ph.id || '').match(/^[a-z]+_(\d{13})/i);
    if (m) photoTs = parseInt(m[1], 10);
    var syncTs = lastSync ? new Date(lastSync).getTime() : 0;
    if (photoTs && syncTs && photoTs <= syncTs) {
      status = 'Synced'; color = '#5F8068';
      glyph = '<path d="M8 12.5l2.5 2.5L16 9.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
    } else {
      status = 'R2 done \u2014 awaiting cloud sync'; color = '#FFA726';
      glyph = '<circle cx="12" cy="12" r="1.5" fill="white"/>';
    }
  } else {
    status = 'Local only \u2014 not uploaded yet'; color = '#94A3B8';
  }
  return '<span class="obs-photo-sync" title="' + status + '">'
    + '<svg width="16" height="12" viewBox="0 0 24 18" fill="' + color + '">'
    + '<path d="M19 16H6a4.5 4.5 0 010-9 5.5 5.5 0 0110.5-1A4.5 4.5 0 0119 16z"/>' + glyph
    + '</svg></span>';
}

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
// S150 (Mark): display-time relabel. The S146 B2 rename converted all FIXED
// UI strings, but anywhere the app prints a contractor's SAVED name verbatim
// an old project that still carries the pre-rename legacy contractor name
// shows the stale label. Per the canon "never migrate stored data" rule we
// do NOT rewrite the data — every contractor-name display site funnels
// through this so the user always sees the canonical SITE_RECORDS_LABEL.
// isSiteRecordsName() already matches both the new label and the pre-rename
// legacy name (the predicate is defined in model.js, permanent back-compat).
function ctrLabel(name) {
  return isSiteRecordsName(name) ? SITE_RECORDS_LABEL : (name || '');
}
// S150 (Mark, screenshot follow-up): the Site Records placeholder is NOT a
// real contractor — Site Records is the NO-contractor bucket. It must never
// appear in a CONTRACTOR surface (roster, contractor filter dropdown,
// trade-assign / reassign menus) where it would show a meaningless
// "Unassigned / needs a trade" golden state. The correct path into Site
// Records is the hardcoded "None (Site Records · internal)" option (value=""
// = no contractor) + the dedicated Site Records filter segment — both
// preserved. This filters the placeholder out of contractor-entity lists
// ONLY; stored data is untouched (canon "never migrate" rule), so any items
// historically stuck on it still exist and still render in the deficiency list.
function realCtrs(arr) {
  return (arr || []).filter(function(c) { return c && !isSiteRecordsName(c.name); });
}

// S114 P1.10: contractor color = SEQUENTIAL assignment based on order in proj.contractors[].
// Skips slot 3 (reserved for Site Records) so a regular contractor never collides with it.
// Hash-based assignment is gone — that allowed two unrelated contractors to land on the
// same slot. Now slot N maps to the Nth non-general contractor in array order.
// (After 7 unique contractors the palette wraps; rare in practice.)
export function ctrColorClass(name) {
  if (!name) return 'ctr-c3';
  if (isSiteRecordsName(name)) return 'ctr-c3';
  var proj = Model.getProject();
  if (!proj || !Array.isArray(proj.contractors)) return 'ctr-c0';
  var nonGeneralIdx = 0;
  for (var i = 0; i < proj.contractors.length; i++) {
    var c = proj.contractors[i];
    if (!c || isSiteRecordsName(c.name)) continue;
    if (c.name === name) {
      // Skip slot 3 so we never collide with the Site Records slot
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
// Slot c3 stays forest because Site Records is a special semantic slot.
// `surfDark` and `textDark` added for dark-mode support; the CSS reads
// these via the .ctr-c* compound selector, but they're documented here
// so the JS palette and CSS palette stay in lockstep.
var _CTR_PALETTE = {
  'ctr-c0': { accent: '#3D8585', surface: '#E0F0F0', text: '#176987', surfDark: '#102A2A', textDark: '#7AC4C4' }, // teal
  'ctr-c1': { accent: '#7B8838', surface: '#F2F4E0', text: '#5A6829', surfDark: '#1F2410', textDark: '#B8C870' }, // olive
  'ctr-c2': { accent: '#9E6B40', surface: '#F5EBE0', text: '#7A4F2D', surfDark: '#2A1D10', textDark: '#D6A572' }, // bronze
  'ctr-c3': { accent: '#5F8068', surface: '#E8EFE7', text: '#5F8068', surfDark: '#0D2818', textDark: '#80C8A0' }, // forest / Site Records (kept)
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
var _dfxRecMode = 'def';                  // S150 (was S140 B2b 3-state): 4-state segmented filter — 'def' (default; deficiencies WITH a contractor only — recs AND Site Records both hidden → short working list) | 'rec' (recommendations only) | 'siterec' (Site Records only — non-rec, no contractor) | 'all' (everything; renamed from legacy 'both'). Transient module state, defaults 'def' every load, never persisted.
var _catFilter = 'outstanding';           // S250 §4: active segment of the single 4-segment category filter row ('outstanding' | 'rec' | 'siterec' | 'closed'). Drives _activeDlcTab + _dfxRecMode via _setCatFilter; default 'outstanding' every load, never persisted. (No 'all' segment — four divides evenly 2x2 on portrait.)
var _recHoldUntilNav = false;             // S150g (Mark): set true when a rec star is toggled in a list view; suppresses the auto re-render the queued save would otherwise trigger (via the 'saved' listener) so the card stays put / mis-tap is one tap from undo. Cleared at the top of render() — i.e. by the next deliberate view/pivot/filter change, leaving & returning, or a project/photo load. Transient, never persisted.
// S146 (Mark): Detailed-view independent fold. Persisted at module scope
// so it survives the frequent initDeficiencies.render() re-renders.
var _dfxFoldTrade = {};                    // {tradeName | '__recs__' | '__siterec__'}: true = collapsed
var _dfxFoldCtr = {};                      // {tradeName '::' ctrId}: true = collapsed (per-contractor, per its trade section — B1 fan-out aware)
var _dfxSectionKeys = [];                  // section keys present in the last Detailed render (drives Collapse all / Expand all)
var _pickCtrId = null;                     // S142 §2: contractor awaiting a trade click (pick-mode); null = not picking
// S153 Batch 2: Board dual-input move state. Transient, never persisted.
//   _bvSel  = { id, oi } the currently tap-selected Board card (tablet
//             tap-to-move); null = nothing selected.
//   _bvDrag = { id, oi } the card under an in-flight desktop drag; null
//             = no drag. Cleared on drop / dragend / Escape / render.
var _bvSel = null;
var _bvDrag = null;
// S143 (Phase 3 G/3.5): show/hide the per-observation inspector initials chip.
// Persisted; default ON. '0' = hidden.
var _showInspChip = (function () {
  try { return localStorage.getItem('arencon-frt-insp-chip') !== '0'; } catch (e) { return true; }
})();
// S154 §2.1 (Option A): persisted collapsed state for the Deficiency Log.
// Default = collapsed (set in HTML as data-collapsed="1"); localStorage
// overrides on subsequent loads via _restoreLogCollapse() called from
// initDeficiencies.render().
function _restoreLogCollapse() {
  try {
    var v = localStorage.getItem('arencon-frt-log-collapsed');
    if (v == null) return;
    var card = document.getElementById('defic-log-card');
    if (card) card.setAttribute('data-collapsed', v === '0' ? '0' : '1');
  } catch (e) {}
}
var _inspChipSubscribed = false;           // guard: subscribe to Model 'inspectors' once

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
  // S161: read via pool-aware lookup so post-photo-pool-migration pins also
  // mark their attached photos. Without this the picker offers pool photos
  // for re-attach, letting a user pick the same photo twice.
  var attachedIds = {};
  var attachedList = (Model.getEffectivePhotos)
    ? Model.getEffectivePhotos(f.defic, obsIdx)
    : (obs.photos || []);
  attachedList.forEach(function(ph) { if (ph && ph.id) attachedIds[ph.id] = true; });

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
    if (e.target.matches('[data-gp-x]')) { close(); return; } /* backdrop close disabled */
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
      var addedCount = 0;
      checks.forEach(function(cb) {
        var idx = parseInt(cb.getAttribute('data-gp-idx'));
        var src = sitePhotos[idx];
        if (!src) return;
        // S251 FIX: route the picked site photo through the POOL model
        // (Model.addPoolPhoto), the single source of truth that
        // getEffectivePhotos reads. The previous code pushed a record into
        // obs.photos[] directly — but a modern obs has photoSelection:[] (a
        // custom-selection Array), so getEffectivePhotos returned only pool
        // ids in that selection and the pushed photo was invisible ("says
        // attached, nothing happens"). We keep the shared binary: same
        // r2Key/thumb, a NEW per-pool id, no R2 re-upload.
        var poolPh = Model.addPoolPhoto(deficId, (src.dataUrl || null), {
          r2Key:    src.r2Key || null,
          sourceR2Key: src.r2Key || src.sourceR2Key || null,
          thumb:    src.thumb || src.r2Url || null,
          filename: src.filename || ('site_pick_' + (idx + 1) + '.jpg')
        });
        if (!poolPh) return;
        // Preserve any R2 url + markup linkage the pool factory doesn't set.
        if (src.r2Url) poolPh.r2Url = src.r2Url;
        poolPh.r2Status = src.r2Status || 'uploaded';
        poolPh.fromSiteIdx = idx; // breadcrumb
        // S115: keep picked copies of an already-marked-up photo linked to the
        // same backup record so a later revert propagates back to the gallery.
        if (src._origBackupId) poolPh._origBackupId = src._origBackupId;
        if (src._annotated)    poolPh._annotated    = true;
        // If this obs is in CUSTOM selection mode, add the new pool id to its
        // selection so it shows in THIS obs. Default-mode (photoSelection null)
        // already shows every pool photo, so nothing to do there.
        if (Array.isArray(liveObs.photoSelection)) {
          if (liveObs.photoSelection.indexOf(poolPh.id) === -1) {
            liveObs.photoSelection.push(poolPh.id);
          }
        }
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
  // S331 #photo-buttons — expose Camera alongside Upload (capture=environment).
  var _amCam = ov.querySelector('#am-camera-btn');
  if (_amCam) _amCam.addEventListener('click', function(ev) { ev.stopPropagation(); _amFileInput(true); });

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
  // _buildPinGroupCard. Mark feedback: Active and Site Records tabs
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
  // Theme-aware: background/label/text colours come from CSS classes
  // (.act-entry.act-ctr / .act-entry.act-con + .act-ent-lbl/.act-ent-txt)
  // so dark mode can recolour them. Previously these were baked inline
  // (light-only) → dark mode left a light box with invisible body text.
  var clsMod = isCtr ? 'act-ctr' : 'act-con';
  var actId = a.id || '';
  var h = '<div class="act-entry ' + clsMod + '" data-act-entry-id="' + esc(actId) + '" data-act-entry-defic="' + esc(deficId) + '" style="margin-bottom:3px;padding:4px 6px;border-radius:4px;font-size:calc(11px + var(--ts));display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">';
  h += '<div style="flex:1;min-width:0;">';
  h += '<span class="act-ent-lbl" style="font-weight:600;">' + esc(a.label || 'Note') + '</span> <span style="color:var(--silver);font-size:calc(10px + var(--ts));">' + esc(a.date || '') + '</span>';
  h += '<div class="act-ent-txt" style="margin-top:2px;">' + esc(a.text || '\u2014') + '</div>';
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
    // N+1 carry-forward marker (V1 parity, V1 ~L9303): a pin noted on a
    // PRIOR instance shows "Noted FRT #N" so the inspector sees it's a
    // carried-over item, not new this report. Distinct from the per-obs
    // .frt-inst-chip below (S122: obs added LATER than its pin) — same CSS
    // class, different condition. Strict < so a fresh pin never chips.
    var _cfProj = Model.getProject();
    var _cfCur = (_cfProj && _cfProj.currentFrtInstance) || 1;
    var _cfNoted = d.notedOnInstance || 1;
    if (_cfNoted < _cfCur) {
      // S337: rounds-escalation chip (Mark-locked). The carried-forward chip now
      // shows WHICH round the item is on (ordinal), not just "Noted FRT #N", and
      // escalates colour as it ages. _rounds = how many reports it has appeared
      // in = (current - noted) + 1: an item noted FRT#1 seen again in FRT#2 is on
      // its 2nd round. Tiers: 2nd = grey (.r-g), 3rd+ = maroon + flag (.r-r).
      var _rounds = (_cfCur - _cfNoted) + 1;
      var _rOrd = _rounds + (_rounds === 1 ? 'st' : _rounds === 2 ? 'nd' : _rounds === 3 ? 'rd' : 'th');
      var _rCls = (_rounds >= 3) ? 'r-r' : 'r-g';
      var _rFlag = (_rounds >= 3)
        ? '<svg class="frt-rd-flag" width="9" height="11" viewBox="0 0 11 13" fill="none" aria-hidden="true"><path d="M2 12V1.5M2 2h7.5l-1.8 2.4L9.5 7H2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '';
      h += '<span class="frt-inst-chip frt-rd-chip ' + _rCls + '" title="Outstanding for ' + _rounds + ' report' + (_rounds === 1 ? '' : 's') + ' \u2014 first noted FRT #' + _cfNoted + (d.notedDate ? ' on ' + esc(d.notedDate) : '') + '">' + _rFlag + _rOrd + ' rd</span>';
    }
    if (d.drawingId) {
      var _dwgs = Model.getDrawings();
      var _dwgName = '';
      for (var _di = 0; _di < _dwgs.length; _di++) { if (_dwgs[_di].id === d.drawingId) { _dwgName = _dwgs[_di].name || 'Drawing'; break; } }
      h += '<button data-action="view-pin" data-defic-id="' + esc(d.id) + '" class="defic-dwg-pill" title="' + esc(_dwgName) + '">\uD83D\uDCCC ' + esc(_dwgName) + '</button>';
    } else {
      h += '<button data-action="place-pin" data-defic-id="' + esc(d.id) + '" style="border:1px dashed var(--border);background:transparent;color:var(--silver);border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">\uD83D\uDCCC Pin</button>';
    }
    // S151 (Mark): the Recommendation star is now PER-OBSERVATION and is
    // rendered on each obs card's control row (above). It no longer lives
    // on the pin strip. setObsRecommendation keeps the pin-level rollup in
    // sync so legacy readers / the report stay valid until step 3 splits
    // the on-screen layout per observation.
    h += '</div>'; // /defic-pin-strip
  }

  // ─── obs cards (S121 Push 8: label row + single controls row) ───
  // Layout per obs:
  //   Row 1: #N(-A/B) · Observation                 (label only)
  //   Row 2: [Outstanding] [Priority▾] [Trade▾] | [AI Review] [↱ Spinoff] [✕ Remove obs]
  //          (Spinoff/Remove obs hidden when single-obs)
  //   Row 3: textarea | media zone (icon-only Upload/Camera/Gallery)
  obs.forEach(function(o, oi) {
    // S122 Push 1: label uses NO DASH (3A not 3-A).
    // S324 (Mark): always suffix the obs letter, even single-obs ("1A","2A"),
    // for consistency with the photo badges and a uniform round-badge.
    var label = (d.num != null ? d.num : '?') + String.fromCharCode(65 + oi);
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

    // Row 2 — controls. Order: Recommendation → Outstanding → Priority → Contractor → Trade | Spinoff → Remove obs (S151: per-obs rec star leads)
    h += '<div class="defic-obs-card-ctrls">';

    // S151 (Mark): per-OBSERVATION Recommendation toggle. Reuses the
    // existing .pin-rec-toggle pill (incl. S150 amber styling) but is now
    // emitted once per obs with data-obs-idx so #1A / #1B flip
    // independently (setObsRecommendation keeps the pin-level rollup in
    // sync). Layout — which section a pin renders in — still uses the pin
    // rollup until step 3; step 2 only makes the stars per-obs.
    var _oIsRec = !!o.isRecommendation;
    h += '<button data-action="toggle-rec" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="pin-rec-toggle' + (_oIsRec ? ' is-rec' : '') + '" aria-pressed="' + (_oIsRec ? 'true' : 'false') + '" title="' + (_oIsRec ? 'This observation is a Recommendation — click to revert it' : 'Mark this observation as a Recommendation') + '">' + (_oIsRec ? '★ Recommendation' : '☆ Mark as recommendation') + '</button>';

    // Outstanding toggle button (NOT a select). Light grey when open,
    // green when addressed. Single click flips state via toggle-addressed.
    h += '<button data-action="toggle-addressed" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="out-toggle ' + (obsAddressed ? 'closed' : 'open') + '">' + (obsAddressed ? '\u2611 Addressed &amp; Closed' : '\u2610 Outstanding') + '</button>';

    // Priority banner — colored pill that opens a native select on click.
    // Uses a wrapper <select> hidden behind the visible pill so the native
    // dropdown still works without us building a custom menu. The pill IS
    // the select element, styled.
    // S217: 'general' priority retired. An un-migrated obs may still hold
    // 'general' in the data (migration ships dormant) — display it as Low
    // here so the pill never renders blank/mismatched. Pure render
    // normalization; the stored value is left alone until migration runs.
    var _priShown = (obsPriVal === 'high') ? 'high' : 'low';
    h += '<select data-action="obs-priority" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="pri-banner pri-' + _priShown + '" title="Observation priority">';
    ['high', 'low'].forEach(function(pv) {  // S217: 'general' priority retired
      var lbl = pv.charAt(0).toUpperCase() + pv.slice(1);
      // Inline option style — Chrome ignores most CSS for <option>, but
      // honors inline. Forces white bg + dark text in the dropdown list.
      h += '<option value="' + pv + '" style="background:white;color:#2C3E50;font-weight:600;text-transform:none;"' + (_priShown === pv ? ' selected' : '') + '>' + lbl + '</option>';
    });
    h += '</select>';

    // S150 (Mark): contractor BEFORE trade — pick who owns it first, then
    // the trade (matches the data hierarchy: trade is derived from the
    // contractor). Previously trade preceded contractor, which read
    // backwards and made the "Site Records" no-contractor label look like
    // a trade. Both are independent self-contained spans; reorder is
    // purely visual (handlers are delegated by data-action).
    h += '<span class="ctr-banner-wrap">';
    // S234: tint the contractor pill with its assigned ctr-cN colour so it
    // matches the contractor cards/tags elsewhere in FRT (was neutral steel).
    var _ctrNm = '';
    if (ctrId) { var _cf = realCtrs((Model.getProject() || {}).contractors).filter(function(c){return c.id===ctrId;})[0]; _ctrNm = _cf ? _cf.name : ''; }
    var _ctrCls = ctrColorClass(_ctrNm);
    h += '<select data-action="obs-contractor" data-defic-id="' + esc(d.id) + '" class="ctr-banner ' + _ctrCls + '" title="Contractor for this pin">';
    h += '<option value="" style="background:white;color:#2C3E50;font-weight:600;"' + (!ctrId ? ' selected' : '') + '>\u2014 ' + esc(SITE_RECORDS_LABEL) + ' \u2014</option>';
    realCtrs((Model.getProject() || {}).contractors).forEach(function(_cc) {
      h += '<option value="' + esc(_cc.id) + '" style="background:white;color:#2C3E50;font-weight:600;"' + (ctrId === _cc.id ? ' selected' : '') + '>' + esc(ctrLabel(_cc.name) || 'Unnamed') + '</option>';
    });
    h += '</select>';
    h += '</span>';

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
    // S143 (Phase 3 G/3.5): inspector-attribution chip. Slot designed in
    // S137; now populated from this observation's createdBy. Hidden when
    // the control-bar toggle is off, or when createdBy is null/legacy
    // (empty slot — keeps existing projects visually unchanged).
    var _inspHtml = '';
    if (_showInspChip && o.createdBy && Model.resolveInspector) {
      var _ins = Model.resolveInspector(o.createdBy);
      if (_ins && _ins.initials && _ins.initials !== '\u2014') {
        var _insTitle = _ins.name ? ('Logged by ' + _ins.name) : 'Logged by another inspector';
        var _insStyle = _ins.color ? (' style="--ic:' + esc(_ins.color) + '"') : '';
        _inspHtml = '<span class="obs-insp-chip"' + _insStyle + ' title="' + esc(_insTitle) + '">' + esc(_ins.initials) + '</span>';
      } else {
        // S154 Bug #2: chip slot stays VISIBLE for traceability when createdBy
        // is set but the inspector profile isn't resolved yet (unfetched
        // full_name, or a legacy createdBy that no longer maps). Muted "?" chip.
        var _insStyleU = (_ins && _ins.color) ? (' style="--ic:' + esc(_ins.color) + '"') : '';
        _inspHtml = '<span class="obs-insp-chip obs-insp-unknown"' + _insStyleU + ' title="Logged by another inspector">?</span>';
      }
    }
    h += '<span class="obs-insp-slot" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">' + _inspHtml + '</span>';

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
        // S161 P2: render placeholder card when src is empty rather than
        // silently skipping. Empty src means the photo was just added and
        // either R2 hasn't completed or no thumbnail exists yet. Old code
        // dropped the entire card here, producing "+1 photo but no
        // thumbnail" — the inspector had no way to know whether the
        // photo had actually been recorded. Now the card renders with a
        // camera-glyph placeholder and the sync icon shows live state.
        var pid = ph.id || '';
        h += '<div class="obs-photo-wrap' + (src ? '' : ' obs-photo-noimg') + '">';
        if (src) {
          h += '<img data-action="open-lightbox" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" src="' + esc(src) + '" loading="lazy">';
        } else {
          h += '<div class="obs-photo-placeholder" data-action="open-lightbox" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" title="Photo data not yet loaded">\uD83D\uDCF7</div>';
        }
        h += _obsPhotoSyncBadge(ph);
        h += '<button data-action="ai-suggest-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" class="photo-ai-btn" title="AI Suggest from this photo">\u2728</button>';
        h += '<button data-action="delete-obs-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" class="obs-photo-del" title="Remove from this observation">\u2715</button>';
        // S205 — Move/Copy this photo to another pin (shared-binary; gallery
        // shows a pill per referencing pin).
        h += '<button data-action="photo-assign-pin" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-id="' + esc(pid) + '" class="obs-photo-pin" title="Move or copy to another pin">\u2934</button>';
        h += '</div>';
      });
      h += '</div>';
      h += '<div class="obs-media-divider"></div>';
    }
    h += '<div class="obs-media-hint">' + (obsPhotos.length ? 'Drop photos to add' : 'Drop photos here') + '</div>';
    h += '<div class="obs-media-btns">';
    // S331 #photo-buttons — Upload/Camera/Gallery exposed as labeled buttons
    // (was icon-only; team found the camera affordance unclear). Same actions,
    // dusty .is-* colors preserved.
    h += '<button class="obs-drop-btn is-upload" data-action="photo-upload" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Upload from device">\uD83D\uDCCE Upload</button>';
    h += '<button class="obs-drop-btn is-camera" data-action="photo-camera" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Take photo with camera">\uD83D\uDCF7 Camera</button>';
    h += '<button class="obs-drop-btn is-gallery" data-action="photo-gallery-pick" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Pick from project site photos">\uD83D\uDDBC\uFE0F Gallery</button>';
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

  // S210 (Mark): "View all photos" removed from both surfaces. Tapping any
  // photo opens the lightbox scoped to that deficiency's photos with swipe
  // (open-lightbox), so the dedicated carousel button is redundant.

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
  // S136: source the accent from the contractor's Phase-1a color so the
  // group header matches the trade board card EXACTLY (one color per
  // contractor across both surfaces). Falls back to neutral grey for
  // Site Records / unknown contractor.
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

// ── S264: Resolution Dashboard (Bold) — donut + bar + by-contractor ──────
// Pure presentation. Fed entirely by totals the log already computes; no new
// data, no model touch. Sits at the top of the Deficiency Log card body.
// Colours come from live Bold tokens (--arencon/--no/--yes/--b-info/--warn)
// so both skins are handled by the existing theme — see frt.css PART Bold.
// S264b: contractor colours now come from each contractor's stored c.color
// (resolved in _renderDeficLog), matching the Contractor Roster dots.
function _renderDeficDashboard(total, outHigh, outLow, closed, rows, newCount, newHigh, newLow) {
  if (!total) return '';
  var outstanding = outHigh + outLow;
  var pct = Math.round((closed / total) * 100);
  // donut geometry: r=57 → circumference ≈ 358.14
  var C = 358.14;
  // S284 A3 (Mark-locked): inner "new this report" arcs — r=40 → circ ≈ 251.33.
  // Each blue arc is ALIGNED under its outer status segment and sized to the
  // NEW count within that status: new-high anchored at the start of the red
  // segment, new-low at the start of the amber. Butt caps, NO splitter — the
  // carried-over remainder of each segment is the separation; when every high
  // is new the arcs touch and the red/amber boundary above marks the divide.
  // One visit per report ⇒ new items are never closed, so no arc under green.
  // Ring hidden entirely when ALL items are new (report #1 — a full circle
  // says nothing) and when nothing is new; the legend count always shows.
  var C2 = 251.33;
  var _nH = newHigh || 0, _nL = newLow || 0;
  // S283: three semantic arcs — high-Outstanding (red --no), low-Outstanding
  // (amber --warn), Closed (green --yes). Same three colours the status pills,
  // photo badges, and table now share (one red, one amber, one green canon).
  var highLen = total ? (outHigh / total) * C : 0;
  var lowLen = total ? (outLow / total) * C : 0;
  var closedLen = total ? (closed / total) * C : 0;
  var d = '';
  d += '<div class="dlc-dash">';
  d += '<div class="dlc-dash-top">';
  d += '<div class="dlc-donut"><svg width="132" height="132" viewBox="0 0 150 150" aria-hidden="true">';
  d += '<circle cx="75" cy="75" r="57" fill="none" stroke="var(--border)" stroke-width="20"/>';
  var _off = 0;
  if (highLen > 0)   { d += '<circle cx="75" cy="75" r="57" fill="none" stroke="var(--no)" stroke-width="20" stroke-dasharray="' + highLen.toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-_off).toFixed(1) + '"/>'; _off += highLen; }
  if (lowLen > 0)    { d += '<circle cx="75" cy="75" r="57" fill="none" stroke="var(--warn)" stroke-width="20" stroke-dasharray="' + lowLen.toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-_off).toFixed(1) + '"/>'; _off += lowLen; }
  if (closedLen > 0) { d += '<circle cx="75" cy="75" r="57" fill="none" stroke="var(--yes)" stroke-width="20" stroke-dasharray="' + closedLen.toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-_off).toFixed(1) + '"/>'; }
  // S284 A3 / S336: thin inner ring — drawn when there is at least one new
  // OUTSTANDING item. The old "(newCount < total)" clause hid the ring on
  // report #1 (all new), but the arcs sit under the high/low segments — on a
  // first report they correctly show every outstanding item is a new find — so
  // that suppression was removed. Still hidden when no new outstanding items.
  if ((_nH + _nL) > 0) {
    d += '<circle cx="75" cy="75" r="40" fill="none" stroke="var(--border)" stroke-width="6"/>';
    var _segStart = 0;
    if (_nH > 0) { d += '<circle cx="75" cy="75" r="40" fill="none" stroke="var(--dv-blue)" stroke-width="6" stroke-dasharray="' + ((_nH / total) * C2).toFixed(1) + ' ' + C2.toFixed(1) + '"/>'; }
    _segStart = (outHigh / total) * C2;
    if (_nL > 0) { d += '<circle cx="75" cy="75" r="40" fill="none" stroke="var(--dv-blue)" stroke-width="6" stroke-dasharray="' + ((_nL / total) * C2).toFixed(1) + ' ' + C2.toFixed(1) + '" stroke-dashoffset="' + (-_segStart).toFixed(1) + '"/>'; }
  }
  d += '</svg><div class="dlc-donut-ctr"><div class="v">' + total + '</div><div class="l">total</div></div></div>';
  d += '<div class="dlc-dash-right">';
  d += '<div class="dlc-bar-row"><span class="lbl">Resolved</span><span class="pct">' + pct + '%</span></div>';
  // S283: resolved bar is a fixed red→amber→green gradient (bad→good). The
  // FILL width tracks % closed, so as items resolve the visible bar grows
  // rightward into the green end — the colour "moves toward green" as you
  // resolve, exactly the bad-to-good read. (The gradient is on the fill,
  // sized to the full track so the stops stay anchored to 0/50/100%.)
  d += '<div class="dlc-track"><div class="dlc-fill" style="left:' + pct + '%"></div></div>';
  d += '<div class="dlc-legend">';
  d += '<div class="dlc-leg"><span class="dlc-dot" style="background:var(--no)"></span><span class="nm">Outstanding \u2014 high</span><span class="val">' + outHigh + '</span></div>';
  d += '<div class="dlc-leg"><span class="dlc-dot" style="background:var(--warn)"></span><span class="nm">Outstanding \u2014 low</span><span class="val">' + outLow + '</span></div>';
  d += '<div class="dlc-leg"><span class="dlc-dot" style="background:var(--yes)"></span><span class="nm">Closed</span><span class="val">' + closed + '</span></div>';
  // S284: matching legend row for the inner ring — hollow ring swatch so it
  // reads as the ring, not a 4th slice.
  d += '<div class="dlc-leg"><span class="dlc-dot" style="background:transparent;border:3px solid var(--dv-blue);box-sizing:border-box;"></span><span class="nm">New this report</span><span class="val">' + (newCount || 0) + '</span></div>';
  d += '</div></div></div>';
  // ---- by contractor: PIE (left) + full-width share bars as the legend (right) ----
  // S265: single row, numbers shown ONCE. The pie carries the visual share; the
  // share bars beside it ARE the legend (dot · name · count · %, with a full-width
  // proportional bar under each). The old separate compact legend + separate
  // "Share of deficiencies" section duplicated the same count/% — removed.
  if (rows && rows.length) {
    d += '<div class="dlc-bc"><div class="dlc-bc-h">By contractor</div>';
    d += '<div class="dlc-pie-wrap">';
    d += '<div class="dlc-pie"><svg width="132" height="132" viewBox="0 0 150 150" aria-hidden="true">';
    // pie circle r=37, stroke-width=74 → solid disc, outer radius 74.
    var pieC = 232.48;   // 2*pi*37
    var acc = 0;
    rows.forEach(function(r) {
      var col = r.color || '#6B7280';
      var segLen = total ? (r.total / total) * pieC : 0;
      if (segLen > 0) {
        d += '<circle cx="75" cy="75" r="37" fill="none" stroke="' + col + '" stroke-width="74" stroke-dasharray="' + segLen.toFixed(2) + ' ' + pieC.toFixed(2) + '" stroke-dashoffset="' + (-acc).toFixed(2) + '"/>';
      }
      acc += segLen;
    });
    d += '</svg></div>';
    // --- share bars (right column) = the legend. Numbers appear here only. ---
    d += '<div class="dlc-share">';
    rows.forEach(function(r) {
      var col = r.color || '#6B7280';
      var share = total ? Math.round((r.total / total) * 100) : 0;
      d += '<div class="dlc-sb-row">';
      d += '<div class="dlc-sb-top"><span class="dlc-dot" style="background:' + col + '"></span>';
      d += '<span class="nm">' + esc(r.name) + '</span>';
      d += '<span class="ct">' + r.total + ' total</span>';
      d += '<span class="sh">' + share + '%</span></div>';
      d += '<div class="dlc-sb-track"><i style="width:' + share + '%;background:' + col + '"></i></div>';
      d += '</div>';
    });
    d += '</div>';      // /dlc-share
    d += '</div>';      // /dlc-pie-wrap
    d += '</div>';      // /dlc-bc
  }
  d += '</div>';
  return d;
}

// ── Deficiency Log Summary Table ─────────────────────────
function _renderDeficLog(proj, allDefics) {
  var el = document.getElementById('defic-log-container');
  if (!el) return;
  if (!allDefics.length) { el.innerHTML = '<p style="color:var(--silver);font-size:calc(12px + var(--ts));padding:8px;">No deficiencies recorded yet.</p>'; return; }
  var _curInst = proj.currentFrtInstance || 1;
  var ctrGroups = {};
  allDefics.forEach(function(d) {
    var name = ctrLabel(d.contractorName) || SITE_RECORDS_LABEL;
    if (!ctrGroups[name]) ctrGroups[name] = [];
    ctrGroups[name].push(d);
  });
  var h = '<table class="defic-summary-table">';
  h += '<thead><tr><th style="text-align:left;">Contractor</th>';
  h += '<th style="text-align:center;">Total</th>';
  h += '<th style="text-align:center;">New This Report</th>';
  h += '<th style="text-align:center;">Outstanding</th>';
  h += '<th style="text-align:center;">Closed</th></tr></thead><tbody>';
  var tTotal = 0, tNew = 0, tOut = 0, tClosed = 0, tOutHigh = 0, tOutLow = 0, tNewHigh = 0, tNewLow = 0;
  var _dashRows = [];  // S264: per-contractor {name,total,outstanding,color} for the Bold dashboard
  // S264b: resolve each contractor's STORED colour (c.color) — same hex the
  // roster dot uses — so dashboard + table match the Contractor Roster.
  var _ctrColorByName = {};
  (proj.contractors || []).forEach(function(c) {
    if (c && c.name) _ctrColorByName[ctrLabel(c.name) || c.name] = c.color || '#6B7280';
  });
  Object.keys(ctrGroups).forEach(function(name) {
    var gc = ctrGroups[name];
    var total = gc.length;
    var nw = gc.filter(function(d) { return (d.defic.notedOnInstance || 1) === _curInst; }).length;
    var outstanding = gc.filter(function(d) { return deficIsOpen(d.defic); }).length;
    var closed = gc.filter(function(d) { return deficIsClosed(d.defic); }).length;
    // S283: split outstanding by priority for the 3-slice dashboard. low =
    // priority 'low'; everything else open (high/general/unset) reads high.
    var outHigh = gc.filter(function(d) { return deficIsOpen(d.defic) && (d.defic.priority || 'high') !== 'low'; }).length;
    var outLow = gc.filter(function(d) { return deficIsOpen(d.defic) && (d.defic.priority || 'high') === 'low'; }).length;
    // S284 A3: new-this-report split by priority, OPEN only (one visit per
    // report ⇒ a new item is never closed on the report where it's new — a
    // same-instance closure would be user error and simply draws no arc).
    var newHigh = gc.filter(function(d) { return (d.defic.notedOnInstance || 1) === _curInst && deficIsOpen(d.defic) && (d.defic.priority || 'high') !== 'low'; }).length;
    var newLow = gc.filter(function(d) { return (d.defic.notedOnInstance || 1) === _curInst && deficIsOpen(d.defic) && (d.defic.priority || 'high') === 'low'; }).length;
    var _col = _ctrColorByName[name] || '#6B7280';
    tTotal += total; tNew += nw; tOut += outstanding; tClosed += closed;
    tOutHigh += outHigh; tOutLow += outLow; tNewHigh += newHigh; tNewLow += newLow;
    _dashRows.push({ name: name, total: total, outstanding: outstanding, color: _col });
    h += '<tr>';
    h += '<td style="font-weight:600;"><span class="dlc-tbl-dot" style="background:' + _col + '"></span>' + esc(name) + '</td>';
    h += '<td style="text-align:center;">' + total + '</td>';
    h += '<td style="text-align:center;font-weight:700;">' + nw + '</td>';
    h += '<td style="text-align:center;color:var(--no);font-weight:700;">' + outstanding + '</td>';
    h += '<td style="text-align:center;color:var(--yes);font-weight:700;">' + closed + '</td></tr>';
  });
  h += '<tr style="font-weight:700;">';
  h += '<td>TOTAL</td>';
  h += '<td style="text-align:center;">' + tTotal + '</td>';
  h += '<td style="text-align:center;">' + tNew + '</td>';
  h += '<td style="text-align:center;color:var(--no);">' + tOut + '</td>';
  h += '<td style="text-align:center;color:var(--yes);">' + tClosed + '</td></tr>';
  h += '</tbody></table>';
  el.innerHTML = _renderDeficDashboard(tTotal, tOutHigh, tOutLow, tClosed, _dashRows, tNew, tNewHigh, tNewLow) + h;

  // S154 §2.1 (Option A): keep the collapsed-state summary in sync with
  // the table. Single source of truth — tTotal/tOut/tClosed are already
  // computed above. The summary span lives in #defic-log-header (HTML)
  // and is what users see when the card is collapsed.
  var sumEl = document.getElementById('defic-log-summary');
  if (sumEl) {
    var parts = [tTotal + ' total'];
    if (tNew > 0) parts.push(tNew + ' new');
    parts.push(tOut + ' outstanding');
    parts.push(tClosed + ' closed');
    sumEl.textContent = '— ' + parts.join(' \u00b7 ');
  }
}

// ── Contractor Roster · Click-to-Assign (S142 §2) ────────────────────
// Replaces the S136 kanban Trade Board AND the S141 B2f roster (both
// superseded; their handlers are kept defined-but-inert per S137 — this
// render fn simply stops emitting their data-actions). The whole
// contractor surface is now ONE card: a colour-coded, deletable trade
// pill strip with a prebuilt `+ trade ▾` dropdown, then a 2-up roster of
// compact one-line cards. Assign = click the per-card ⊕ (enter pick
// mode), then click a glowing trade pill. Schema unchanged
// (project.projectTrades, contractor.trades, contractor.color); trade
// colour is NAME-DERIVED only — no schema field, no migration.
// Visual contract: ARENCON_ClickAssign_Demo.html (Mark approved
// verbatim). CSS: frt.css "S142 §2" block (crx- namespace).

// Fixed muted, on-brand palette mapped per prebuilt trade (bg/fg/bd).
// Custom trades hash deterministically into the two muted EXTRA slots so
// a trade keeps its colour across delete/re-add AND across render order
// (the demo cycled by call-order; a name-hash is the deterministic
// realization Mark's spec requires — still only the 2 EXTRA colours, no
// picker). Honours the muted-palette rule (no neon).
var _TRADE_PAL = {
  'Sprinkler':          { bg: '#E4ECF4', fg: '#345A82', bd: '#9DB6CF' },
  'Fire Alarm':         { bg: '#F3E6E3', fg: '#8A4A3C', bd: '#CDA79B' },
  'General Contracting':{ bg: '#E7EFE5', fg: '#4C6B41', bd: '#A9C09C' },
  'Electrical':         { bg: '#F4ECDD', fg: '#876026', bd: '#CFB68A' },
  'Mechanical':         { bg: '#E6E9F1', fg: '#46557A', bd: '#A3AECB' },
  'Civil':              { bg: '#ECE7F2', fg: '#5C4A7C', bd: '#B7A9CE' }
};
var _TRADE_EXTRA = [
  { bg: '#E7F0EF', fg: '#3D6B66', bd: '#9CC3BE' },
  { bg: '#F1E9EC', fg: '#7C4A60', bd: '#CCA7B8' }
];
function _tradeColor(t) {
  if (_TRADE_PAL[t]) return _TRADE_PAL[t];
  var s = String(t || ''), n = 0, i;
  for (i = 0; i < s.length; i++) n = (n + s.charCodeAt(i)) % 100000;
  return _TRADE_EXTRA[n % _TRADE_EXTRA.length];
}
function _tradeVars(t) {
  var c = _tradeColor(t);
  return '--tc-bg:' + c.bg + ';--tc-fg:' + c.fg + ';--tc-bd:' + c.bd + ';';
}

// S229: the fixed compact roster bar (#dfx-compact-bar) was REMOVED. It
// duplicated the full Contractor Roster card as a position:fixed overlay that
// bled onto other tabs and only ever worked in Board view. The full roster
// card (_renderTradeBoard) is the single source of truth now; it scrolls
// naturally with the page. All sticky/scroll machinery and the dfx-view-board /
// dfx-show-compact body classes are gone.



function _renderTradeBoard(proj) {
  var el = document.getElementById('contractors-on-site');
  if (!el) return;
  var trades = (proj.projectTrades && proj.projectTrades.length) ? proj.projectTrades : [];
  var ctrs = proj.contractors || [];

  // Pick-mode target (module var _pickCtrId). Clear it if it points at a
  // contractor that no longer exists (deleted while picking).
  if (_pickCtrId && !ctrs.some(function(c) { return c.id === _pickCtrId; })) _pickCtrId = null;
  var pickCtr = _pickCtrId ? ctrs.filter(function(c) { return c.id === _pickCtrId; })[0] : null;
  var pickHas = pickCtr ? (pickCtr.trades || []) : [];

  var h = '';

  // ── trade pill strip ──
  h += '<div class="crx-trades-row">';
  h += '<span class="crx-trades-lbl">Trades</span>';
  h += '<div class="crx-trades">';
  trades.forEach(function(t) {
    var taken = !!pickCtr && pickHas.indexOf(t) !== -1;
    h += '<span class="crx-tpill' + (taken ? ' crx-taken' : '') + '" data-action="crx-pill" data-trade="' + esc(t) + '" style="' + _tradeVars(t) + '">';
    h += esc(t);
    h += '<button class="crx-px" data-action="crx-del-trade" data-trade="' + esc(t) + '" title="Delete trade everywhere">\u00D7</button>';
    h += '</span>';
  });
  h += '</div>';
  // + trade ▾ — prebuilt trades not yet added + "+ new trade…"
  h += '<span class="crx-addtrade-wrap">';
  h += '<button class="crx-addtrade" data-action="crx-trade-menu-toggle" title="Add a trade to the strip">+ trade \u25BE</button>';
  h += '<div class="crx-trade-menu" id="crx-trade-menu">';
  var _avail = TRADE_LIST.filter(function(t) { return trades.indexOf(t) === -1; });
  _avail.forEach(function(t) {
    h += '<button class="crx-trade-menu-item" data-action="crx-add-prebuilt" data-trade="' + esc(t) + '">' + esc(t) + '</button>';
  });
  h += '<button class="crx-trade-menu-item crx-trade-menu-new" data-action="crx-add-new-trade">+ new trade\u2026</button>';
  h += '</div></span>';
  h += '</div>';

  // ── pick bar (CSS shows it only under body.crx-picking) ──
  h += '<div class="crx-pickbar">';
  h += '<span>Pick a trade above to assign to <b>' + esc(pickCtr ? pickCtr.name : '') + '</b></span>';
  h += '<button class="crx-cancel" data-action="crx-pick-cancel">Cancel (Esc)</button>';
  h += '</div>';

  // ── roster header ──
  h += '<div class="crx-roster-h">';
  h += '<span class="crx-ttl">Contractors</span>';
  h += '<button class="crx-roster-add" data-action="crx-add-ctr" title="Add a new contractor">+ Add contractor</button>';
  h += '</div>';

  // ── 2-up roster grid (S205c: CREATION order, never reorder by assignment) ──
  var _roster = realCtrs(ctrs);
  if (_roster.length) {
    h += '<div class="crx-grid">';
    _roster.forEach(function(c) {
      var _ct = (c.trades || []);
      var _un = !_ct.length;
      var _n = (c.deficiencies || []).length;
      var _tgt = (_pickCtrId === c.id);
      h += '<div class="crx-cc' + (_un ? ' crx-unassigned' : '') + (_tgt ? ' crx-target' : '') + (_bvSel ? ' crx-assign-target' : '') + '" data-crx-ctr="' + esc(c.id) + '" style="--cc:' + esc(c.color || '#6B7280') + ';">';
      h += '<span class="crx-dot"></span>';
      h += '<span class="crx-nm">' + esc(ctrLabel(c.name)) + '</span>';
      if (_un) h += '<span class="crx-unflag">Unassigned</span>';
      h += '<span class="crx-tagwrap">';
      _ct.forEach(function(t) {
        h += '<span class="crx-tag" style="' + _tradeVars(t) + '">' + esc(t);
        h += '<button class="crx-tx" data-action="crx-untag" data-ctr-id="' + esc(c.id) + '" data-trade="' + esc(t) + '" title="Un-assign ' + esc(ctrLabel(c.name)) + ' from ' + esc(t) + '">\u00D7</button>';
        h += '</span>';
      });
      // S153 B3 (Mark): the tiny ⊕ is removed — too small on a field
      // tablet. The WHOLE contractor card is now the target: with a
      // Board card selected, tapping it assigns the contractor; with
      // nothing selected, tapping it arms the contractor so the next
      // trade-pill tap adds that trade (replaces ⊕'s job). The
      // crx-pick-start document handler is left defined-but-inert
      // (S137 dead-handler discipline) — no markup emits it now.
      h += '</span>';
      h += '<span class="crx-spacer"></span>';
      h += '<span class="crx-meta">' + _n + ' item' + (_n === 1 ? '' : 's') + '</span>';
      h += '<button class="crx-ic" data-action="crx-rename" data-ctr-id="' + esc(c.id) + '" title="Rename contractor">\u270E</button>';
      h += '<button class="crx-ic crx-del" data-action="crx-del-ctr" data-ctr-id="' + esc(c.id) + '" title="Delete contractor (items move to Site Records, never deleted)">\uD83D\uDDD1</button>';
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<div class="crx-empty">No contractors yet \u2014 use <strong>+ Add contractor</strong> to start, then tap a contractor card to arm it and tap a trade pill to assign.</div>';
  }
  h += '<div class="crx-hint">On the Board: tap a card, then tap a contractor here to assign it (or tap a trade pill to set that observation\u2019s trade). With nothing selected, tap a contractor to arm it, then tap a trade pill to add that trade to its roster. \u00D7 on a tag un-assigns just that contractor; \u00D7 on a strip pill deletes the trade everywhere. A golden border means the contractor is on no trade yet.</div>';

  el.innerHTML = h;
  document.body.classList.toggle('crx-picking', !!_pickCtrId);
}

// Smart picker — overlay modal for adding contractor to a trade column
function _openCtrPicker(trade) {
  _closeCtrPicker();
  var proj = Model.getProject();
  if (!proj) return;
  // Existing contractors NOT already in this trade
  var existing = realCtrs(proj.contractors).filter(function(c) {
    return (c.trades || []).indexOf(trade) === -1;
  });
  var ov = document.createElement('div');
  ov.className = 'picker-overlay show';
  ov.id = 'ctr-picker-overlay';
  // Backdrop click closes (only if click hits overlay itself, not picker inner)
  ov.addEventListener('click', function(e) {
    /* backdrop close disabled */ if(false){ _closeCtrPicker() }
  });
  var p = document.createElement('div');
  p.className = 'picker';
  var h = '<div class="picker-title">Add contractor to <em>' + esc(trade) + '</em></div>';
  if (existing.length) {
    h += '<div class="picker-section-lbl">Existing contractors</div>';
    h += '<div class="picker-chips">';
    existing.forEach(function(c) {
      var col = c.color || '#6B7280';
      h += '<button class="picker-chip" data-action="picker-pick-ctr" data-ctr-id="' + esc(c.id) + '" data-trade="' + esc(trade) + '" style="--cc:' + esc(col) + ';">' + esc(ctrLabel(c.name)) + '</button>';
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

// ── S205 — Move/Copy a pin photo to another pin ───────────────────────────
// Shared-binary semantics: the photo keeps its r2Key. Copy adds a reference
// to the chosen pin (photo stays on the source pin too — gallery shows a pill
// for each). Move shifts the reference off the source onto the chosen pin.
// Binary is never re-uploaded or deleted. Touch-first: a tap-list, no
// hover-reveal, default mode = Copy (non-destructive).
function _openPinPhotoPicker(srcDeficId, srcObsIdx, photoId, opts) {
  _closePinPhotoPicker();
  var proj = Model.getProject();
  if (!proj) return;
  // S224: site-source mode. opts.siteIdx != null => source is a gallery photo;
  // srcDeficId is null and destinations are pins (Site button is hidden).
  var siteSrc = (opts && opts.siteIdx != null) ? opts.siteIdx : null;
  if (siteSrc == null && !Model.findDeficiency(srcDeficId)) return;
  var pins = Model.getAllDeficiencies(proj).filter(function(d) {
    return d.defic && d.defic.id !== srcDeficId;
  });

  var R2W = 'https://arencon-r2-worker.hezhendong999.workers.dev';
  var PR_COL = { high: '#A85959', low: '#B07F5A', gen: '#5F8068' };
  function prKey(defic) { return defic.priority === 'general' ? 'gen' : (defic.priority === 'low' ? 'low' : 'high'); }
  function leadThumb(defic) {
    var ph = (defic.photos || []).filter(function(p) { return p && !p.deleted; })[0];
    return ph ? (ph.thumb || ph.r2Url || ph.dataUrl || '') : '';
  }
  function photoCount(defic) { return (defic.photos || []).filter(function(p) { return p && !p.deleted; }).length; }
  function obsText(defic) { var o = (defic.observations || [])[0]; return (o && o.text) ? o.text : ''; }

  var mode = 'move';
  var view = 'rows';

  var ov = document.createElement('div');
  ov.className = 'picker-overlay show';
  ov.id = 'pinphoto-picker-overlay';
  ov.addEventListener('click', function(e) { /* backdrop close disabled */ if(false){ _closePinPhotoPicker() } });

  var p = document.createElement('div');
  p.className = 'picker pinphoto-picker';
  p.innerHTML =
    '<div class="picker-title">' + (siteSrc != null ? 'Send gallery photo to a pin' : 'Move or copy photo') + '</div>' +
    '<div class="pinphoto-mode">' +
      '<button class="pinphoto-mode-btn active" data-mode="move">Move</button>' +
      '<button class="pinphoto-mode-btn" data-mode="copy">Copy</button>' +
    '</div>' +
    '<div class="pinphoto-views">' +
      '<button class="pinphoto-view-btn active" data-view="rows">List</button>' +
      '<button class="pinphoto-view-btn" data-view="plan">Plan</button>' +
      '<button class="pinphoto-view-btn" data-view="grid">Grid</button>' +
    '</div>' +
    // S223: send to the Photo Gallery (site) — honors the Copy/Move toggle.
    // Hidden in site-source mode (no site→site).
    (siteSrc != null ? '' :
      '<button class="pinphoto-site-btn" id="pinphoto-site-btn" data-action="pinphoto-site">\uD83D\uDCF7 Send to Photo Gallery (site)</button>') +
    '<div class="pinphoto-hint" id="pinphoto-hint">Move takes the photo off here and puts it on the chosen pin (or observation). The original turns faded with an Undo button until you reload.</div>' +
    '<div id="pinphoto-stage"></div>' +
    '<div class="picker-foot"><button class="btn btn-sm picker-cancel-btn" data-action="pinphoto-close">Cancel</button></div>';
  ov.appendChild(p);
  document.body.appendChild(ov);

  var cancelBtn = p.querySelector('[data-action="pinphoto-close"]');
  if (cancelBtn) cancelBtn.addEventListener('click', _closePinPhotoPicker);

  // toObsIdx (optional): when set, the photo is narrowed to that specific
  // observation on the destination pin (point 2 — target an obs, not just a pin).
  function doPick(toId, toObsIdx) {
    if (!toId) return;
    var destF = Model.findDeficiency(toId);
    if (!destF) { toast('\u26A0 Could not find that pin'); return; }
    var destNum = destF.defic ? destF.defic.num : '?';
    // S227: a pin destination ALWAYS resolves to a specific observation, so the
    // landed photo is always referenced (orphans structurally impossible). List
    // view passes the chosen obs; Plan/Grid (pin-level) default to Obs A (0).
    if (toObsIdx == null) toObsIdx = 0;

    // Snapshot the ORIGIN photo record BEFORE the op (deep clone). For a MOVE,
    // used to restore the photo at its origin on Undo. For a COPY, used to find
    // the live origin photo so we can show the "Copied — Undo" chip there.
    var originSnap = null, origin = null;
    if (siteSrc != null) {
      var sp = (Model.getProject().photos || [])[siteSrc];
      if (sp) { originSnap = JSON.parse(JSON.stringify(sp)); origin = { type: 'site', siteIdx: siteSrc, photoId: sp.id }; }
    } else {
      var sf = Model.findDeficiency(srcDeficId);
      if (sf) {
        var pool = (sf.defic.photos || []).filter(function(p2) { return p2 && !p2.deleted; });
        var rec = null; for (var i = 0; i < pool.length; i++) { if (pool[i].id === photoId) { rec = pool[i]; break; } }
        if (rec) { originSnap = JSON.parse(JSON.stringify(rec)); origin = { type: 'pin', deficId: srcDeficId, obsIdx: srcObsIdx, photoId: rec.id }; }
      }
    }

    var res;
    if (siteSrc != null) {
      res = (mode === 'move') ? (Model.moveSitePhotoToPin(siteSrc, toId) || {}).copy
                              : Model.copySitePhotoToPin(siteSrc, toId);
    } else {
      res = (mode === 'move') ? Model.movePhotoToPin(srcDeficId, photoId, toId)
                              : Model.copyPhotoToPin(srcDeficId, photoId, toId);
    }
    // Reference the landed photo from the chosen obs (orphan-proof) ONLY when
    // that obs is in custom-selection mode. addPhotoToObs returns false for a
    // default-mode obs (photoSelection == null), which already shows the WHOLE
    // pin pool — so the photo is visible there without an explicit reference.
    // We capture the result so the chip/toast tell the truth: "Obs A
    // specifically" only when it was actually pinned to that obs; otherwise
    // "added to Pin N's photos" (it shows on every default-mode observation).
    var attachedToObs = res ? Model.addPhotoToObs(toId, toObsIdx, res.id) : false;

    var desc = null;
    if (res) {
      // Record the specific obsIdx only when the photo was actually pinned to
      // that obs (custom mode). For a default-mode landing the photo lives in
      // the pin pool and shows on ALL default observations, so obsIdx:null lets
      // the "Just added" chip appear wherever it shows (justAddedTokenForObsPhoto
      // treats null as match-any-obs).
      var destObsIdx = attachedToObs ? toObsIdx : null;
      desc = (mode === 'move')
        ? { mode: 'move', origin: origin, snapshot: originSnap,
            dest: { type: 'pin', deficId: toId, photoId: res.id, obsIdx: destObsIdx } }
        : { mode: 'copy', origin: origin,
            dest: { type: 'pin', deficId: toId, photoId: res.id, obsIdx: destObsIdx } };
    }

    _closePinPhotoPicker();
    if (res) {
      if (desc) Model.registerMove(desc);
      if (window.initPhotos && initPhotos.render) initPhotos.render();
      initDeficiencies.render();
      var landed = attachedToObs
        ? ('Obs ' + String.fromCharCode(65 + toObsIdx) + ' on Pin ' + destNum)
        : ("Pin " + destNum + "'s photos");
      toast((mode === 'move' ? 'Moved to ' : 'Copied to ') + landed +
        ' \u2014 it shows there with an Undo chip; the original ' +
        (mode === 'move' ? 'is faded with Undo' : 'has an Undo chip') + ' until you reload');
    } else {
      toast('\u26A0 Could not ' + mode + ' photo');
    }
  }

  // S223: send the photo to the Photo Gallery (site), honoring the Copy/Move
  // toggle. Uses the same per-observation primitives the gallery select-mode
  // path (_doReassign __site__ branch) proved in S222 — never removePoolPhoto,
  // which would cascade the removal to sibling observations.
  //   MOVE → drop only this obs's reference (siblings keep it), then release
  //          the binary to proj.photos (deduped against an existing site photo
  //          for the same binary). A shared photo legitimately appears in BOTH
  //          the pin and the gallery (one R2 binary, two references).
  //   COPY → leave the obs untouched; just release a site reference (deduped).
  function doSite() {
    var proj = Model.getProject();
    if (!proj) return;
    var f = Model.findDeficiency(srcDeficId);
    if (!f) { toast('\u26A0 Could not send photo to gallery'); return; }
    // Resolve the live pool record for this photo id.
    var pool = (f.defic.photos || []).filter(function(p2) { return p2 && !p2.deleted; });
    var srcRec = null;
    for (var i = 0; i < pool.length; i++) { if (pool[i].id === photoId) { srcRec = pool[i]; break; } }
    if (!srcRec) {
      // Legacy fallback: obs-level photos[] (never-migrated). Resolve via effective.
      var eff = (Model.getEffectivePhotos) ? Model.getEffectivePhotos(f.defic, srcObsIdx) : [];
      for (var j = 0; j < eff.length; j++) { if (eff[j] && eff[j].id === photoId) { srcRec = eff[j]; break; } }
    }
    if (!srcRec) { toast('\u26A0 Could not send photo to gallery'); return; }

    // Clone defensively before any narrowing (removePhotoFromObs never touches
    // the pool entry, but the binary fields are what we release).
    var rec = Object.assign({}, srcRec);
    delete rec.deleted; delete rec.deletedDate;

    // S225: snapshot the origin pool record BEFORE narrowing, so a MOVE can
    // restore it at the pin origin on Undo (origin-ghost model).
    var originSnap = JSON.parse(JSON.stringify(srcRec));

    if (mode === 'move') {
      if (Model.removePhotoFromObs) {
        Model.removePhotoFromObs(srcDeficId, srcObsIdx, srcRec.id);
      } else {
        var obs0 = (f.defic.observations || [])[srcObsIdx];
        if (obs0 && Array.isArray(obs0.photoSelection)) {
          obs0.photoSelection = obs0.photoSelection.filter(function(id) { return id !== srcRec.id; });
        }
      }
    }

    // Release the binary to Site, deduped against any live site photo already
    // pointing at the same binary (mirrors removeDeficiency release guard).
    if (!proj.photos) proj.photos = [];
    var key = rec.r2Key || rec.sourceR2Key || null;
    var existingSite = key && proj.photos.filter(function(sp) {
      return sp && !sp.deleted && (sp.r2Key || sp.sourceR2Key) === key;
    })[0];
    var destSiteId, createdNewSite;
    if (!existingSite) {
      rec.id = 'sp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      if (!rec.caption) rec.caption = '';
      if (!rec.sourceR2Key) rec.sourceR2Key = rec.r2Key || null;
      rec.addedDate = new Date().toISOString();
      proj.photos.push(rec);
      destSiteId = rec.id; createdNewSite = true;
    } else {
      destSiteId = existingSite.id; createdNewSite = false;
    }

    // S225/S226 marker:
    //   MOVE → ghost renders at the PIN origin (snapshot). Undo restores the pin
    //          photo AND, only if we created the site reference here, removes it.
    //   COPY → origin photo stays on the pin; show a "Copied — Undo" chip at the
    //          PIN origin (S226). Undo removes the new site reference. A copy
    //          whose binary was already in the gallery is a no-op (skip).
    var udesc = null;
    if (mode === 'move') {
      udesc = {
        mode: 'move',
        origin: { type: 'pin', deficId: srcDeficId, obsIdx: srcObsIdx, photoId: srcRec.id },
        snapshot: originSnap,
        dest: createdNewSite ? { type: 'site', photoId: destSiteId } : null
      };
    } else if (createdNewSite) {
      udesc = {
        mode: 'copy',
        origin: { type: 'pin', deficId: srcDeficId, obsIdx: srcObsIdx, photoId: srcRec.id },
        dest: { type: 'site', photoId: destSiteId }
      };
    }
    if (udesc) Model.registerMove(udesc);
    Model.saveNow();
    _closePinPhotoPicker();
    if (window.initPhotos && initPhotos.render) initPhotos.render();
    initDeficiencies.render();
    toast((mode === 'move' ? 'Moved to Photo Gallery \u2014 the original is faded with Undo'
                           : 'Copied to Photo Gallery \u2014 tap Undo on the copy to reverse'));
  }

  var siteBtn = p.querySelector('[data-action="pinphoto-site"]');
  if (siteBtn) siteBtn.addEventListener('click', doSite);

  var stage = p.querySelector('#pinphoto-stage');

  function renderRows() {
    if (!pins.length) { stage.innerHTML = '<div class="pinphoto-empty">No other pins in this project.</div>'; return; }
    var h = '<input type="text" class="picker-input" id="pinphoto-search" placeholder="Search pin # / contractor / text" autocomplete="off">';
    h += '<div class="pinphoto-list">';
    pins.forEach(function(d) {
      var defic = d.defic, ctr = d.contractorName || '', txt = obsText(defic);
      var col = PR_COL[prKey(defic)], th = leadThumb(defic), pc = photoCount(defic);
      var hay = ('pin ' + defic.num + ' ' + ctr + ' ' + txt).toLowerCase();
      var obsArr = defic.observations || [];
      var multi = obsArr.length > 1;
      h += '<div class="pinphoto-rowwrap" data-search="' + esc(hay) + '">';
      // S227: single-obs pin → the row completes the move (targets Obs A, so the
      // photo is always referenced; no orphan possible). Multi-obs pin → the row
      // EXPANDS to obs rows (which obs is a real decision); it does not complete.
      h += '<button class="pinphoto-row' + (multi ? ' pinphoto-row-expand' : '') + '" data-pin-id="' + esc(defic.id) + '" data-multi="' + (multi ? '1' : '0') + '">';
      h += th
        ? '<span class="pinphoto-thumb" style="background-image:url(\'' + esc(th) + '\')"></span>'
        : '<span class="pinphoto-thumb pinphoto-thumb-empty" style="background:' + col + '">\uD83D\uDCCD</span>';
      h += '<span class="pinphoto-pill" style="background:' + col + '">Pin ' + esc(defic.num) + '</span>';
      h += '<span class="pinphoto-meta"><span class="pinphoto-ctr">' + esc(ctr) + '</span>';
      h += '<span class="pinphoto-txt' + (txt ? '' : ' none') + '">' + (txt ? esc(txt) : 'no observation text') + '</span></span>';
      if (multi) {
        h += '<span class="pinphoto-multi-hint">' + obsArr.length + ' obs \u25BE</span>';
      } else {
        h += '<span class="pinphoto-count">' + pc + ' \uD83D\uDDBC</span>';
      }
      h += '</button>';
      if (multi) {
        h += '<div class="pinphoto-obslist" id="obslist-' + esc(defic.id) + '" hidden>';
        obsArr.forEach(function(o, oi) {
          var ot = (o && o.text) ? o.text : '';
          h += '<button class="pinphoto-obsrow" data-pin-id="' + esc(defic.id) + '" data-obs-idx="' + oi + '">';
          h += '<span class="pinphoto-obspill">Obs ' + String.fromCharCode(65 + oi) + '</span>';
          h += '<span class="pinphoto-obstxt' + (ot ? '' : ' none') + '">' + (ot ? esc(ot) : 'no text') + '</span>';
          h += '</button>';
        });
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
    stage.innerHTML = h;
    stage.querySelectorAll('.pinphoto-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var pid = row.getAttribute('data-pin-id');
        if (row.getAttribute('data-multi') === '1') {
          // Expand to obs rows — do NOT complete.
          var list = stage.querySelector('#obslist-' + (window.CSS && CSS.escape ? CSS.escape(pid) : pid));
          if (list) { list.hidden = !list.hidden; row.classList.toggle('open', !list.hidden); }
        } else {
          // Single-obs pin → target its only observation (Obs A).
          doPick(pid, 0);
        }
      });
    });
    stage.querySelectorAll('.pinphoto-obsrow').forEach(function(row) {
      row.addEventListener('click', function() {
        doPick(row.getAttribute('data-pin-id'), parseInt(row.getAttribute('data-obs-idx'), 10));
      });
    });
    var s = stage.querySelector('#pinphoto-search');
    if (s) {
      s.addEventListener('input', function() {
        var q = s.value.trim().toLowerCase();
        stage.querySelectorAll('.pinphoto-rowwrap').forEach(function(row) {
          var hay = row.getAttribute('data-search') || '';
          row.style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
        });
      });
      setTimeout(function() { s.focus(); }, 0);
    }
  }

  function renderGrid() {
    if (!pins.length) { stage.innerHTML = '<div class="pinphoto-empty">No other pins in this project.</div>'; return; }
    var h = '<input type="text" class="picker-input" id="pinphoto-search" placeholder="Search pin # / contractor / text" autocomplete="off">';
    h += '<div class="pinphoto-grid">';
    pins.forEach(function(d) {
      var defic = d.defic, ctr = d.contractorName || '', txt = obsText(defic);
      var col = PR_COL[prKey(defic)], th = leadThumb(defic), pc = photoCount(defic);
      var hay = ('pin ' + defic.num + ' ' + ctr + ' ' + txt).toLowerCase();
      h += '<button class="pinphoto-gcard" data-pin-id="' + esc(defic.id) + '" data-search="' + esc(hay) + '" title="Pin ' + esc(defic.num) + ' \u2014 ' + esc(ctr) + '">';
      h += th
        ? '<span class="pinphoto-gimg" style="background-image:url(\'' + esc(th) + '\')"></span>'
        : '<span class="pinphoto-gimg pinphoto-gimg-empty" style="background:' + col + '">\uD83D\uDCCD</span>';
      h += '<span class="pinphoto-gbadge" style="background:' + col + '">Pin ' + esc(defic.num) + '</span>';
      if (pc) h += '<span class="pinphoto-gcount">' + pc + '</span>';
      h += '</button>';
    });
    h += '</div>';
    stage.innerHTML = h;
    stage.querySelectorAll('.pinphoto-gcard').forEach(function(c) {
      c.addEventListener('click', function() { doPick(c.getAttribute('data-pin-id')); });
    });
    var s = stage.querySelector('#pinphoto-search');
    if (s) s.addEventListener('input', function() {
      var q = s.value.trim().toLowerCase();
      stage.querySelectorAll('.pinphoto-gcard').forEach(function(c) {
        var hay = c.getAttribute('data-search') || '';
        c.style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
      });
    });
  }

  function renderPlan() {
    var placed = pins.filter(function(d) { return d.defic.drawingId && d.defic.pinX != null && d.defic.pinY != null; });
    var unplaced = pins.length - placed.length;
    var drawings = (proj.drawings || []).filter(function(dw) {
      return placed.some(function(d) { return d.defic.drawingId === dw.id; });
    });
    if (!drawings.length) {
      stage.innerHTML = '<div class="pinphoto-empty">No pins are placed on a drawing yet. Use List or Grid, or place pins on a drawing first.</div>';
      return;
    }
    var pid = (new URLSearchParams(window.location.search)).get('project') || '';
    var curDwg = drawings[0].id;

    function cands(dw) {
      var c = [];
      if (dw.dataUrl) c.push(dw.dataUrl);
      if (dw.r2Url) c.push(dw.r2Url);
      if (pid) c.push(R2W + '/' + encodeURIComponent(pid) + '/tiles/' + encodeURIComponent(dw.id) + '/L0/0_0.webp');
      return c;
    }

    function paint() {
      var dw = drawings.filter(function(x) { return x.id === curDwg; })[0] || drawings[0];
      var dwgPins = placed.filter(function(d) { return d.defic.drawingId === dw.id; });
      var h = '';
      if (drawings.length > 1) {
        h += '<div class="pinphoto-dwgtabs">';
        drawings.forEach(function(x) {
          h += '<button class="pinphoto-dwgtab' + (x.id === curDwg ? ' active' : '') + '" data-dwg="' + esc(x.id) + '">' + esc(x.name || x.title || 'Sheet') + '</button>';
        });
        h += '</div>';
      }
      h += '<div class="pinphoto-plan"><img class="pinphoto-plan-img" alt="">';
      dwgPins.forEach(function(d) {
        var defic = d.defic, col = PR_COL[prKey(defic)];
        h += '<button class="pinphoto-planpin" data-pin-id="' + esc(defic.id) + '" title="Pin ' + esc(defic.num) + ' \u2014 ' + esc(d.contractorName || '') + '" '
          + 'style="left:' + (defic.pinX * 100) + '%;top:' + (defic.pinY * 100) + '%;background:' + col + '">' + esc(defic.num) + '</button>';
      });
      h += '</div>';
      if (unplaced > 0) {
        h += '<div class="pinphoto-unplaced-note">' + unplaced + ' pin' + (unplaced === 1 ? '' : 's') + ' not on a drawing \u2014 use List or Grid to reach those.</div>';
      }
      stage.innerHTML = h;

      var imgEl = stage.querySelector('.pinphoto-plan-img');
      var list = cands(dw), ci = 0;
      function tryImg() {
        if (ci >= list.length) { if (imgEl) imgEl.alt = 'Drawing image unavailable'; return; }
        imgEl.onerror = function() { ci++; tryImg(); };
        imgEl.src = list[ci];
      }
      if (imgEl) tryImg();

      stage.querySelectorAll('.pinphoto-planpin').forEach(function(b) {
        b.addEventListener('click', function() { doPick(b.getAttribute('data-pin-id')); });
      });
      stage.querySelectorAll('.pinphoto-dwgtab').forEach(function(t) {
        t.addEventListener('click', function() { curDwg = t.getAttribute('data-dwg'); paint(); });
      });
    }
    paint();
  }

  function renderView() {
    if (view === 'rows') renderRows();
    else if (view === 'plan') renderPlan();
    else renderGrid();
  }

  p.querySelectorAll('.pinphoto-mode-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      mode = btn.getAttribute('data-mode') || 'move';
      p.querySelectorAll('.pinphoto-mode-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
      var hint = p.querySelector('#pinphoto-hint');
      if (hint) hint.textContent = (mode === 'move')
        ? 'Move takes the photo off here and puts it on the chosen pin (or observation), or sends it to the gallery. The original turns faded with an Undo button until you reload.'
        : 'Copy keeps the photo here and also adds it to the chosen pin (or observation), or the gallery. The copy turns faded with an Undo button until you reload.';
    });
  });
  p.querySelectorAll('.pinphoto-view-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      view = btn.getAttribute('data-view') || 'rows';
      p.querySelectorAll('.pinphoto-view-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
      renderView();
    });
  });

  renderView();
}

function _closePinPhotoPicker() {
  var ov = document.getElementById('pinphoto-picker-overlay');
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
    // S263 (portal fix): close any open status popover before re-rendering. The
    // open menu may be portaled onto document.body; a render rebuilds the list
    // and would orphan it. Closing returns it home / clears refs first.
    if (typeof _cvCloseStatusMenus === 'function') _cvCloseStatusMenus();
    _recHoldUntilNav = false;  // S150g: any deliberate render resettles the list
    _cvPinDragHold = false;    // S328: a deliberate render already resettled the
                               // card; drop any pending pin-drag hold so it can't
                               // wedge and suppress a later legitimate render.
    _cvDeferredBgRender = false; // S328 (#19): this deliberate render reconciles
                                 // any background merge we skipped while a card
                                 // was open — clear the deferred flag.
    // S248: combined-view delayed re-sort. A deliberate render (tab switch,
    // filter, project/photo load) resettles the list, so a stale ordering
    // never persists across navigation. The ONE exception is the re-lock
    // render and the manual Re-sort render, which manage the pending set
    // themselves — they set _cvSuppressFlush for exactly one render so
    // locking does NOT silently resettle (the whole point of decoupling).
    if (_cvSuppressFlush) { _cvSuppressFlush = false; }
    else { _cvPendingKeys = {}; }
    var proj = Model.getProject();
    var container = document.getElementById('deficiencies-container');
    if (!container) return;
    if (!proj) { container.innerHTML = ''; return; }

    var ctrlBar = document.getElementById('defic-control-bar');
    if (ctrlBar) ctrlBar.style.display = 'flex';

    // S143: repaint when async inspector name/color resolution lands.
    // Subscribe once; the render() re-entry from _notify is cheap and
    // already debounced by the resolver's _inspectorPending guard.
    if (!_inspChipSubscribed && Model.onChange) {
      _inspChipSubscribed = true;
      Model.onChange('inspectors', function () {
        // S284c: same typing guard as 'project' — inspector-profile fetches
        // resolve in the background and must not rebuild the list mid-typing.
        var ae = document.activeElement;
        if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) {
          if (ae.classList && ae.classList.contains('obs-text-input')) return;
          if (ae.closest('#tab-deficiencies, #deficiencies-container, .defic-item, .defic-list, .defic-pin-group, .cv-row, .cv-ed-left')) return;
        }
        initDeficiencies.render();
      });
    }

    var allDefics = Model.getAllDeficiencies(proj);

    // Render Deficiency Log summary table
    _renderDeficLog(proj, allDefics);
    // S154 §2.1: restore the saved collapsed/expanded state after the
    // table renders. HTML defaults to collapsed; localStorage overrides.
    _restoreLogCollapse();

    // Render Trade Board (S136 Phase 1b)
    _renderTradeBoard(proj);

    // S137: per-observation lifecycle counts drive the legacy pivot.
    // S250 §4: compute the four category-segment counts so each badge equals
    // exactly what that segment's filter would SHOW. Per the locked decision,
    // Recommendations and Site Records are WHOLE-category (open + closed):
    //   outstanding → non-rec, has contractor, NOT addressed (open deficiencies)
    //   rec         → defic.isRecommendation (any status)
    //   siterec     → non-rec AND no contractor (any status)
    //   closed      → addressed (any class)
    // An addressed rec/site-record legitimately counts under BOTH its category
    // segment AND Closed — they are different filters.
    var pcActive = 0, pcClosed = 0;
    var ccOutstanding = 0, ccRec = 0, ccSite = 0, ccClosed = 0, ccAll = 0;
    allDefics.forEach(function(rec) {
      var d = rec.defic;
      var hasCtr = !!rec.contractorId;
      (d.observations || []).forEach(function(o) {
        // S336: the 'All' segment count = every observation, once, regardless
        // of category or status (it's the "show everything" view Mark wanted
        // back). Counted here so it tracks the same per-obs basis as the rest.
        ccAll++;
        // S262: count PER-OBSERVATION (mirrors the per-obs filter) so each
        // segment badge equals exactly what that segment will SHOW. A split
        // pin with a rec obs + a non-rec obs now contributes to BOTH the rec
        // and outstanding/site counts independently, not the whole pin to rec.
        var oIsRec = !!o.isRecommendation;
        var oIsSite = !oIsRec && !hasCtr;
        if (o.addressed) { pcClosed++; ccClosed++; }
        else { pcActive++; }
        if (oIsRec) ccRec++;
        else if (oIsSite) ccSite++;
        else if (!o.addressed) ccOutstanding++;
      });
    });
    _syncDfxControls(pcActive, pcClosed, proj, {all: ccAll, outstanding: ccOutstanding, rec: ccRec, siterec: ccSite, closed: ccClosed});

    // S232 FRT-CV: Detailed + Board MERGE into the single Combined view.
    // The view toggle is gone; _renderDetailedView / _renderBoardView are
    // left defined-but-inert (S137 discipline) for one-commit revertability.
    _renderCombinedView(proj, container);
    // S138: single unified "+ deficiency" trigger at the foot of every view.
    // Replaces the per-contractor "+ Add Deficiency" rows (Detailed) and the
    // trade-board-foot "+ General Deficiency" button. Contractor / trade /
    // pin / recommendation are all chosen inside the modal.
    container.insertAdjacentHTML('beforeend', _addDeficTriggerHTML());
    // S114 P1.6: re-render any open AI scratchpads now that the DOM is fresh
    if (window.AIAssist && window.AIAssist.repopulateAllScratchpads) {
      window.AIAssist.repopulateAllScratchpads();
    }
    // S142 Batch 4-4: keep an open focused single-pin panel in sync after
    // any model edit (priority/trade/contractor/status). _refreshPinFocus
    // is a no-op when no panel is open and skips rebuilds while a textarea
    // inside the panel has focus.
    _refreshPinFocus();
  }
};

// S247: _renderActiveTab removed — dead orphan from the pre-S216 lifecycle-tab
// system (the per-contractor Active view), superseded by the always-visible
// Board columns + combined renderer. Siblings _renderClosedTab (S220) and
// _updateDlcCounts (S221) were already removed; this is the last of the three.
// Zero references across deficiencies.js / viewer.js / index.html (model.js
// mention is a comment only). buildGroup remains live elsewhere.

// S220: _renderClosedTab removed — dead orphan from the pre-S216 lifecycle-tab
// closed view, superseded by the always-visible Closed board column. Zero
// callers corpus-wide (not an IIFE, no dynamic dispatch); its only dependency
// buildDeficCard remains live.

// ── S137 Phase 2: unified filter engine + Detailed view ──────────
// Flatten (defic, obs) pairs after applying the lifecycle pivot
// (_activeDlcTab) + contractor / priority / search filters. Mirrors the
// unified_defic_demo flatRows() but reads the live model.
function _flatRows(proj, ignorePivot, ignoreRecMode) {
  var all = Model.getAllDeficiencies(proj);
  var q = (_dfxSearch || '').trim().toLowerCase();
  var rows = [];
  // S150: 4-state rec-mode classification (replaces the S140 B2b 2-class
  // rec/non-rec test). A row's class is exactly one of:
  //   recommendation → d.isRecommendation
  //   site record    → non-rec AND no contractor (lives in generalDeficiencies)
  //   deficiency     → non-rec AND has a contractor
  // 'def' now means deficiencies-WITH-a-contractor only (Site Records gets
  // its own segment, mirroring how 'def' already hides Recommendations).
  // S262: PER-OBSERVATION rec-mode filter. The previous version read
  // PIN-LEVEL d.isRecommendation, which dragged an ENTIRE split pin into the
  // Recommendations segment whenever ANY observation on it was a rec — so a
  // non-rec observation (e.g. 2B) appeared under Recommendations carrying its
  // own correct "Outstanding" pill (the S261-confirmed 2B contradiction).
  // The filter now classifies the SAME per-observation nature the render path
  // and the pill already use, so filter = grouping = pill, one source of
  // truth (_deriveCategory). The pivot (_activeDlcTab) still owns the
  // open/closed axis; here we test only the rec/site/def NATURE, so we read
  // the obs's underlying category with addressed ignored.
  //   o === null → legacy 0-obs pin: there is no per-obs flag, so fall back
  //   to the pin-level rec flag for that single recoverable edge case.
  function _recModeDrops(d, hasCtr, o) {
    var isRec = (o && typeof o === 'object') ? !!o.isRecommendation : !!d.isRecommendation;
    var isSiteRec = !isRec && !hasCtr;
    var isDef = !isRec && hasCtr;
    if (_dfxRecMode === 'def') return !isDef;
    if (_dfxRecMode === 'rec') return !isRec;
    if (_dfxRecMode === 'siterec') return !isSiteRec;
    return false; // 'all' (and any unknown value) → keep everything
  }
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
      if (!ignoreRecMode && _recModeDrops(d, !!(rec.contractorId), null)) return;  // S262: per-obs filter; 0-obs pin falls back to pin-level rec flag
      if (q && (deficDesc(d) || '').toLowerCase().indexOf(q) < 0) return;
      rows.push({ d: d, o: null, oi: -1, ctrId: rec.contractorId || null, ctrName: ctrLabel(rec.contractorName) || SITE_RECORDS_LABEL });
      return;
    }
    obs.forEach(function(o, oi) {
      var addressed = !!o.addressed;
      if (!ignorePivot && _activeDlcTab === 'active' && addressed) return;
      if (!ignorePivot && _activeDlcTab === 'closed' && !addressed) return;
      if (_dfxCtr && (rec.contractorId || '') !== _dfxCtr) return;
      if (_dfxPri && (o.priority || 'high') !== _dfxPri) return;
      if (!ignoreRecMode && _recModeDrops(d, !!(rec.contractorId), o)) return;  // S262: per-obs filter — each obs lands in its own segment
      if (q && (o.text || '').toLowerCase().indexOf(q) < 0) return;
      rows.push({ d: d, o: o, oi: oi, ctrId: rec.contractorId || null, ctrName: ctrLabel(rec.contractorName) || SITE_RECORDS_LABEL });
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
//      (proj.generalDeficiencies = the Site Records bucket; NEVER a
//      recommendation). Muted-slate band + persistent INTERNAL pill +
//      dimmed cards so it visibly recedes and can't be mistaken for an
//      actionable item. Excluded from external reports by default
//      (Mark-approved treatment, S140).
//
// ⚑ MODEL INTERPRETATION (flagged for Mark — deliberately not silent):
//   The schema has NO separate "is a Site Record" flag. Per S139
//   handoff §4.1/§4.6 ("Site Records bucket; no new
//   flag; no migration"), a NON-recommendation pin with NO contractor
//   (i.e. it lives in proj.generalDeficiencies) IS a Site Record,
//   regardless of any trade on it. A pin with a contractor is a
//   Deficiency; any pin flagged isRecommendation is a Recommendation
//   wherever it lives. This reproduces the approved demo's exact
//   visible output. If Mark wants no-contractor *deficiencies* to be
//   distinct from Site Records, that requires a new schema flag —
//   surface it, do not silently assume.
//
// Rows arrive already filtered by _flatRows (lifecycle pivot + the S150
// 4-state rec/site-records filter + contractor/priority/search), so this
// function only partitions + lays out whatever rows it is given. The filter
// behaves identically in Active and Closed (Behavior B, Mark-approved
// S140) — no special-casing here.
// ── S209 Slice 1b — row-per-OBSERVATION (Detailed view) ──────────
// The Detailed view renders ONE collapsed row per observation (option 2:
// independent rows), expand-one-at-a-time into the real per-obs editor.
// _buildPinGroupCard is UNCHANGED and still serves the Active-tab /
// focused-pin path (step-5 convergence deferred). The row anatomy + bands
// match the locked mockup FRT_list_options_demo.html; the combined
// priority/status chip mirrors the PDF report pills exactly (pdf.js S154):
//   Outstanding/high  bg #F4D6D6 / fg #8E4444
//   Outstanding/low   bg #F5E2C8 / fg #8E6240
//   Closed            bg #D2EBDC / fg #426B4F
//   Site Record       bg #DCDEF0 / fg #3F4470  (site-record rows only)
// Star is the ONLY recommendation control — there is no "Mark as
// recommendation" button anywhere in the obs editor (locked, do not
// re-add). ⇄ Move lives in the editor, never on the collapsed row.

// Transient expand-one state: "deficId:obsIdx" or null. Not persisted.
var _openObsKey = null;
function _obsKey(deficId, oi) { return String(deficId) + ':' + oi; }

// S213: format an auto-stamped observed date for the quiet "Noted" line.
// EXPLICIT parse — never new Date("YYYY-MM-DD") (UTC-parse off-by-one). Accepts
// "YYYY-MM-DD" (date input value) or a full ISO string; returns "M/D/YYYY".
// Empty/invalid → '' (caller renders "edit"-only affordance).
function _fmtNotedDate(v) {
  if (!v) return '';
  var s = String(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    var mo = parseInt(m[2], 10), da = parseInt(m[3], 10), yr = parseInt(m[1], 10);
    if (mo && da && yr) return mo + '/' + da + '/' + yr;
  }
  return '';
}
// S213: resolve the per-obs observed date (falls back to pin-level d.date).
function _obsNotedDate(d, o) {
  return (o && o.notedDate) || (d && d.date) || '';
}

// ── Combined-view canonical category classifier ────────────────────
// S231 Slice 1: the single source of truth for the four-category model
// (Active · Recommendation · Site Record · Closed). NOT yet wired to any
// render path — introduced dead so it can be proven against real data
// before the combined-view fold consumes it. Per-observation by design
// (each obs is independent; a pin's obs may differ in category — verified
// on real pin 7, SP-114). hasCtr = does this pin have a contractor.
// Precedence (first match wins): addressed → Closed; else per-obs
// isRecommendation → Recommendation; else no contractor → Site Record;
// else Active. Closed preserves underlying nature for lossless reopen:
// `under` reports what it re-derives to when reopened (rec | site | active).
function _deriveCategory(d, o, hasCtr) {
  var isRec = !!(o && o.isRecommendation);
  if (o && o.addressed) {
    var under = isRec ? 'rec' : (!hasCtr ? 'site' : 'active');
    return { cat: 'closed', under: under };
  }
  if (isRec) return { cat: 'rec', under: 'rec' };
  if (!hasCtr) return { cat: 'site', under: 'site' };
  return { cat: 'active', under: 'active' };
}

// Combined status descriptor for an observation. site=true forces the
// Site Record treatment regardless of addressed/priority. USED BY THE EDITOR
// status-cycle button — must keep returning Outstanding/Closed only, so the
// high→low→closed cycle works. The collapsed-row FAR-RIGHT pill uses
// _obsFarPill instead (which adds Recommendation/Site Record states).
function _obsStatusInfo(o, site, d) {
  if (site) return { val: 'site', txt: 'Site Record', cls: 'dfx-cs-site' };
  if (o && o.addressed) return { val: 'closed', txt: 'Closed', cls: 'dfx-cs-closed' };
  var pri = (o && o.priority) || (d && d.priority) || 'high';
  if (pri === 'low') return { val: 'low', txt: 'Outstanding', cls: 'dfx-cs-low' };
  if (pri === 'general') return { val: 'low', txt: 'Outstanding', cls: 'dfx-cs-low' };
  return { val: 'high', txt: 'Outstanding', cls: 'dfx-cs-high' };
}

// S248: the single FAR-RIGHT collapsed-row pill. Precedence matches
// _deriveCategory: addressed → Closed (green); else recommendation →
// Recommendation (yellow, distinct from amber low); else no contractor →
// Site Record (purple); else Outstanding (red high / amber low). "Active"
// is never shown — outstanding is self-evidently active. This replaces the
// old behaviour of showing BOTH an under-text category pill AND an
// Outstanding chip; now there is exactly one pill per row.
function _obsFarPill(o, isSite, d) {
  if (o && o.addressed) return { txt: 'Closed', cls: 'dfx-cs-closed' };
  if (o && o.isRecommendation) return { txt: 'Recommendation', cls: 'dfx-cs-rec' };
  if (isSite) return { txt: 'Site Record', cls: 'dfx-cs-site' };
  var pri = (o && o.priority) || (d && d.priority) || 'high';
  if (pri === 'low' || pri === 'general') return { txt: 'Outstanding', cls: 'dfx-cs-low' };
  return { txt: 'Outstanding', cls: 'dfx-cs-high' };
}

// S263: the collapsed-row status pill is now TAPPABLE → opens a custom
// colored popover (NOT native <select> — Android TWA can't colour <option>s).
// One choice maps to one "choice" token below; the row pill shows the SAME
// colour as the chosen menu item. Outstanding is COLOUR-coded high(red)/
// low(amber) but the pill TEXT is always just "Outstanding" (Mark-locked).
// The five choices, two groups (Outstanding · Other). cls = the dfx-cs-* class
// shared by the row pill, the menu item, and the PDF report pill.
var _CV_STATUS_CHOICES = [
  { group: 'Outstanding', choice: 'high',   cls: 'dfx-cs-high',   menu: 'High priority',   pill: 'Outstanding' },
  { group: 'Outstanding', choice: 'low',    cls: 'dfx-cs-low',    menu: 'Low priority',    pill: 'Outstanding' },
  { group: 'Other',       choice: 'rec',    cls: 'dfx-cs-rec',    menu: 'Recommendation',  pill: 'Recommendation' },
  { group: 'Other',       choice: 'site',   cls: 'dfx-cs-site',   menu: 'Site Record',     pill: 'Site Record' },
  { group: 'Other',       choice: 'closed', cls: 'dfx-cs-closed', menu: 'Closed',          pill: 'Closed' }
];

// Which choice is the obs currently in? (drives the menu's selected highlight)
function _obsCurrentChoice(o, isSite, d) {
  if (o && o.addressed) return 'closed';
  if (o && o.isRecommendation) return 'rec';
  if (isSite) return 'site';
  var pri = (o && o.priority) || (d && d.priority) || 'high';
  return (pri === 'low' || pri === 'general') ? 'low' : 'high';
}

// Build the custom colored popover for one obs row. Hidden by default; the
// pill toggles .open. Each item IS a pill in its own status colour (pick by
// colour, not by reading). Tap-outside closes (document handler).
function _cvStatusMenu(d, oi, cur) {
  var h = '<div class="cv-statusmenu" data-menu role="menu" aria-label="Change status">';
  var lastGroup = '';
  _CV_STATUS_CHOICES.forEach(function(c) {
    if (c.group !== lastGroup) {
      h += '<div class="cv-statusmenu-label">' + esc(c.group) + '</div>';
      lastGroup = c.group;
    }
    var on = (c.choice === cur);
    h += '<button type="button" class="cv-statusmenu-item ' + c.cls + (on ? ' sel' : '') + '"'
      + ' data-action="cv-setstatus" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-choice="' + c.choice + '"'
      + ' role="menuitemradio" aria-checked="' + (on ? 'true' : 'false') + '">'
      + '<span class="cv-statusmenu-dot"></span>' + esc(c.menu) + '</button>';
  });
  h += '</div>';
  return h;
}

// The combined priority+status control (editor). One <select> replacing
// the old separate priority select + Outstanding toggle. Writes both
// obs.priority and obs.addressed via the obs-status change handler.
function _obsStatusSelect(d, oi, o) {
  var info = _obsStatusInfo(o, false, d);
  // S234: click-to-cycle button (was a <select>). One tap advances
  // high -> low -> closed -> high. Face shows just "Outstanding" (red=high,
  // amber=low, per the locked PDF palette) or "Closed" (green). data-cur
  // carries the current value for the cycle handler.
  var h = '<button type="button" data-action="obs-status-cycle" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-cur="' + esc(info.val) + '" class="dfx-status-sel ' + info.cls + '" title="Tap to change status">' + info.txt + '</button>';
  return h;
}

// One collapsed observation row. ctrId may be null (Site Records). The
// row carries star (rec) · accent ID badge · 2-line title · ctr dot+name
// (no trade) · combined chip · photo thumb+count · caret. Tap → expand.
function _buildObsRow(d, oi, ctrId, opts) {
  opts = opts || {};
  var obs = d.observations || [];
  var o = obs[oi] || {};
  var multi = obs.length > 1;
  // S324 (Mark): always suffix the obs letter ("1A","2A") for badge consistency.
  var label = (d.num != null ? d.num : '?') + String.fromCharCode(65 + oi);
  var ctrName = opts.ctrName || '';
  var isSite = !ctrId;

  // Contractor colours from the live sequential palette (getContractorColor),
  // NOT a stored per-contractor color — keeps the list in lockstep with the
  // PDF contractor section + the group headers. Site Records use slate.
  var pal = (!isSite && ctrName) ? getContractorColor(ctrName) : null;
  // S248: Site Record identity colour = the demo purple (#6E6AA8), matching
  // the Site Record pill and the demo's 7B/2 pins. Was slate #6B7280.
  var accent = pal ? pal.accent : '#6E6AA8';

  var key = _obsKey(d.id, oi);
  var open = (_openObsKey === key);

  // first-photo thumb + count (pool-aware)
  var effPhotos = (Model.getEffectivePhotos ? Model.getEffectivePhotos(d, oi) : (o.photos || [])) || [];
  var pcount = effPhotos.length;
  var thumbSrc = '';
  if (pcount) {
    var p0 = effPhotos[0];
    thumbSrc = p0.thumb || p0.dataUrl || p0.r2Url || '';
  }

  // S248 §4: the redundant contractor colour DOT is removed. The card already
  // sits under its contractor's COLOURED band (dfx-ctr-tinted, in the
  // contractor's own colour) and the pin badge (.dfx-or-id) carries the same
  // accent — so the under-title dot only repeated that identity. Site Records
  // sit under the Site Records band, equally self-evident. The now-empty
  // .dfx-or-meta span is dropped with it (contractor NAME went in S209d, the
  // under-text category pill in S248, so nothing else lived there).

  var h = '<div class="dfx-obsrow' + (open ? ' open' : '') + '" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">';
  h += '<div class="dfx-obsrow-head" data-action="dfx-toggle-obsrow" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">';
  // S248: star REMOVED to match the locked combined-view demo — Recommendation
  // is now a category in the segmented pill, so the star is redundant. The
  // toggle-rec action is still reachable via the pill's "Recommendation"
  // segment (per-obs, preserving _recHoldUntilNav mis-tap-undo).
  h += '<span class="dfx-or-id" style="background:' + esc(accent) + '">' + esc(label) + '</span>';
  h += '<span class="dfx-or-thumb">' + (thumbSrc ? ('<img src="' + esc(thumbSrc) + '" loading="lazy" alt="">') : '\uD83D\uDCF7') + (pcount ? ('<span class="dfx-or-pc">' + pcount + '</span>') : '') + '</span>';
  // S263: collapsed-row title shows THIS observation's own text, in FULL. The
  // CSS 2-line clamp (.dfx-or-title, -webkit-line-clamp:2) truncates with an
  // ellipsis only when it's genuinely too long — so short/medium comments show
  // completely and long paragraphs cut off gracefully. (Reverted the first-line
  // -only preview, which was too short.) For a SINGLE-obs pin, fall back to the
  // pin description when empty; for a MULTI-obs pin, deficDesc returns obs[0]'s
  // text, so an empty obs B/C/… would borrow obs A's text — multi-obs rows use
  // a neutral placeholder when empty instead.
  var _titleTxt = o.text || (multi ? '' : deficDesc(d)) || '\u2014';
  h += '<span class="dfx-or-mid"><span class="dfx-or-title' + (o.text ? '' : ' dfx-or-title-empty') + '">' + esc(_titleTxt) + '</span>';
  // S248: under-text category pill REMOVED — it duplicated the far-right pill.
  // S248 §4: the contractor colour dot here is ALSO removed (band + pin badge
  // already carry the identity). The .dfx-or-meta span held only those two and
  // is now gone; the single status pill lives on the far right (below).
  h += '</span>';
  // Single far-right pill: Outstanding(red/amber) · Recommendation(teal) ·
  // Site Record(lavender) · Closed(green). No "Active" — outstanding implies it.
  // S263: the pill is now TAPPABLE → opens _cvStatusMenu to change the status in
  // place. Picking writes through the Model setters and marks the row PENDING
  // (Option-D: target-colour corner dot + "↻ moved" tag); the card holds its
  // position until the manual "↻ Re-sort" button fires (mis-pick safety). The
  // pill's own data-action takes precedence over the head's row-toggle (the
  // dispatcher resolves via closest('[data-action]')), so a tap opens the menu
  // without expanding the card.
  var _far = _obsFarPill(o, isSite, d);
  var _cur = _obsCurrentChoice(o, isSite, d);
  var _pendObs = !!_cvPendingKeys[_obsKey(d.id, oi)];
  h += '<span class="cv-pill-anchor">';
  if (_pendObs) h += '<span class="cv-moved-tag">\u21BB moved</span>';
  h += '<button type="button" class="dfx-or-chip cv-pill ' + _far.cls + (_pendObs ? ' cv-pill-pending' : '') + '"'
    + ' data-action="cv-statuspill" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"'
    + ' aria-haspopup="true" aria-expanded="false" title="Tap to change status">'
    + _far.txt + ' <span class="cv-pill-caret">\u25BC</span></button>';
  h += _cvStatusMenu(d, oi, _cur);
  h += '</span>';
  h += '<span class="dfx-or-caret">\u25BC</span>';
  h += '</div>'; // /head
  if (open) h += _buildObsEditor(d, oi, ctrId, opts);
  h += '</div>'; // /dfx-obsrow
  return h;
}

// The expanded per-obs editor. Faithful extraction of the _buildPinGroupCard
// per-obs body (controls + textarea + media + per-obs thread) with three
// deltas: (1) combined obs-status select replaces the separate priority
// select + Outstanding toggle; (2) NO "Mark as recommendation" button — the
// row star is the only rec control; (3) a per-row action bar (drawing pin,
// +Response/+Comment/View all/⇄ Move/+Add obs/Close/Remove/⋯). The row's
// Remove routes through dfx-remove-obsrow (this obs only; whole pin only on
// the last obs).
function _buildObsEditor(d, oi, ctrId, opts) {
  opts = opts || {};
  var obs = d.observations || [];
  var o = obs[oi] || {};
  var multi = obs.length > 1;
  var isSite = !ctrId;

  var h = '<div class="dfx-or-editor' + (opts.withHeader ? ' dfx-ed-mode' : '') + '" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">';

  // ── S213: optional header (Editor B/C). withHeader off => A (Detailed
  // card) renders exactly as before, just the controls row down. ──
  if (opts.withHeader) {
    var _isRecH = !!o.isRecommendation;
    var _pinNum = (opts.pinNum != null) ? opts.pinNum : (d.num != null ? d.num : '?');
    h += '<div class="dfx-ed-header">';
    // star-only recommendation (reuses toggle-rec, per-obs)
    h += '<button type="button" data-action="toggle-rec" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="dfx-ed-star' + (_isRecH ? ' on' : '') + '" aria-pressed="' + (_isRecH ? 'true' : 'false') + '" title="' + (_isRecH ? 'Recommendation \u2014 click to revert' : 'Mark as recommendation') + '">' + (_isRecH ? '\u2605' : '\u2606') + '</button>';
    h += '<span class="dfx-ed-pinlabel">Pin #' + esc(_pinNum) + '</span>';
    // reserved on-drawing link slot (C passes opts.onDrawingLink; B does not)
    if (opts.onDrawingLink && opts.onDrawingLink.label) {
      h += '<button type="button" class="dfx-ed-dlink" data-action="view-pin" data-defic-id="' + esc(d.id) + '" title="Open on drawing">on ' + esc(opts.onDrawingLink.label) + ' \u2197</button>';
    }
    // S284c (Mark): the modal hosts (drawing-viewer pin editor + focused
    // modal) carry the SAME tappable status pill as the deficiency card.
    // data-instant on the menu items makes picks FINAL — no pending dot, no
    // Re-sort button needed; the list re-renders sorted immediately (the
    // list isn't under the user's finger in a modal). Locked colours/menu
    // reused verbatim from the S263 component.
    // S317 (Mark): the status pill is RELOCATED out of the header into the
    // controls row, sitting immediately beside the trade pill (they group as a
    // pair). The header row is now just star · Pin # · on-drawing link.
    h += '</div>'; // /dfx-ed-header

    // observation tab strip [Obs A ⋮ ✕][Obs B][+ Add observation]
    // (S213e reverted per Mark — keep inline ⋮/✕ on the active tab.)
    h += '<div class="dfx-ed-tabs" role="tablist">';
    obs.forEach(function(_to, _ti) {
      var _tletter = String.fromCharCode(65 + _ti);
      var _tactive = (_ti === oi);
      var _tcustom = Array.isArray(_to.photoSelection);
      h += '<span class="dfx-ed-tab' + (_tactive ? ' active' : '') + '">';
      h += '<button type="button" class="dfx-ed-tab-btn" data-action="dfx-ed-tab" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + _ti + '">Obs ' + _tletter + (_tcustom ? ' <span class="dfx-ed-tab-cust" title="Custom photo selection">\u2022</span>' : '') + '</button>';
      if (_tactive) {
        // S328 (#6): the "\u22EE" three-dot (Split to its own pin) is removed from
        // the obs tab — the action now lives in the \u22EF More menu with a clear
        // label. S328 (#9): the "\u2715" delete beside the title was already removed;
        // delete is the footer Delete button. The active tab is now just its label.
      }
      h += '</span>';
    });
    h += '<button type="button" class="dfx-ed-tab-add" data-action="add-obs" data-defic-id="' + esc(d.id) + '" title="Add another observation to this pin">\uFF0B Add observation</button>';
    h += '</div>'; // /dfx-ed-tabs
  }

  // ── controls row: contractor · trade ──
  // S250 §8: the status-cycle button (_obsStatusSelect) is REMOVED from this
  // row — the collapsed row's far-right pill already shows status, so it was a
  // duplicate. Contractor + trade now lead the row. (Status is changed via the
  // far-right pill path; this row is identity-only.)
  h += '<div class="dfx-ed-ctrls">';

  // contractor select (pin-level — same as _buildPinGroupCard obs-contractor)
  h += '<span class="ctr-banner-wrap">';
  // S242: tint the contractor pill with its assigned ctr-cN colour (on-drawing
  // / focused editor path — the OTHER render site at ~L720 was already done).
  var _ctrNm2 = '';
  if (ctrId) { var _cf2 = realCtrs((Model.getProject() || {}).contractors).filter(function(c){return c.id===ctrId;})[0]; _ctrNm2 = _cf2 ? _cf2.name : ''; }
  // S246: pill colour = the contractor's STORED colour (c.color) — identical to
  // the roster dot (which uses --cc:c.color). Tinted via color-mix, same as picker-chip.
  var _ctrObj2 = ctrId ? realCtrs((Model.getProject() || {}).contractors).filter(function(c){return c.id===ctrId;})[0] : null;
  var _ccHex2 = (_ctrObj2 && _ctrObj2.color) ? _ctrObj2.color : '#6B7280';
  h += '<select data-action="obs-contractor" data-defic-id="' + esc(d.id) + '" class="ctr-banner ctr-cc-tinted" style="--cc:' + esc(_ccHex2) + '" title="Contractor for this pin">';
  h += '<option value="" style="background:white;color:#2C3E50;font-weight:600;"' + (!ctrId ? ' selected' : '') + '>\u2014 ' + esc(SITE_RECORDS_LABEL) + ' \u2014</option>';
  realCtrs((Model.getProject() || {}).contractors).forEach(function(_cc) {
    h += '<option value="' + esc(_cc.id) + '" style="background:white;color:#2C3E50;font-weight:600;"' + (ctrId === _cc.id ? ' selected' : '') + '>' + esc(ctrLabel(_cc.name) || 'Unnamed') + '</option>';
  });
  h += '<option value="__new__" style="background:white;color:#9C2742;font-weight:600;">\uFF0B New contractor\u2026</option>';
  h += '</select></span>';

  // trade select (per-obs)
  var _trade = o.trade || '';
  h += '<span class="trade-banner-wrap">';
  // S242: per-trade colour via the built _tradeVars palette (--tc-bg/fg/bd),
  // matching the trade pills on the board. Empty trade -> neutral (no vars).
  // S246: trade pill colour = the trade hue, tinted via color-mix (light+dark correct).
  var _trHue = _trade ? _tradeColor(_trade).fg : '';
  h += '<select data-action="obs-trade" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"' + (_trHue ? ' style="--tc:' + esc(_trHue) + '"' : '') + ' class="trade-banner' + (_trade ? ' trade-cc-tinted' : '') + '" title="Trade for this observation">';
  h += '<option value="" style="background:white;color:#2C3E50;font-weight:600;"' + (_trade === '' ? ' selected' : '') + '>\u2014 Trade \u2014</option>';
  var _projTrades = (Model.getProject() || {}).projectTrades || TRADE_LIST;
  if (_trade && _projTrades.indexOf(_trade) < 0) {
    h += '<option value="' + esc(_trade) + '" style="background:white;color:#2C3E50;font-weight:600;font-style:italic;" selected>' + esc(_trade) + '</option>';
  }
  _projTrades.forEach(function(tv) {
    h += '<option value="' + esc(tv) + '" style="background:white;color:#2C3E50;font-weight:600;"' + (_trade === tv ? ' selected' : '') + '>' + esc(tv) + '</option>';
  });
  h += '</select></span>';
  // S250 §8: Location-on-drawing label + Open button move UP onto the controls
  // row (right-aligned), so the drawing box top lines up with the description
  // box top. Only for the combined-view card editor (no withHeader); the
  // on-drawing editor keeps its own layout.
  if (!opts.withHeader) {
    h += '<span class="dfx-ed-loc-head">';
    h += '<span class="cv-loc-lbl">Location on drawing</span>';
    if (d.drawingId) {
      h += '<button type="button" class="cv-loc-open" data-action="view-pin" data-defic-id="' + esc(d.id) + '" title="Open this pin in the drawing viewer">Open in drawing viewer \u2197</button>';
    } else {
      h += '<button type="button" class="cv-loc-open" data-action="place-pin" data-defic-id="' + esc(d.id) + '" title="Place this pin on a drawing">Place on a drawing</button>';
    }
    h += '</span>';
  }
  // S317 (Mark): relocated status pill — sits immediately AFTER the trade pill
  // (side by side, no spacer) in the withHeader editors (on-drawing pin editor +
  // focused modal). Moved here from the header row. data-instant makes picks final
  // (modal context — no pending dot / Re-sort needed). Combined-view card (no
  // withHeader) is unchanged: its status pill lives on the collapsed row.
  if (opts.withHeader) {
    var _cFar = _obsFarPill(o, isSite, d);
    var _cCur = _obsCurrentChoice(o, isSite, d);
    h += '<span class="cv-pill-anchor dfx-ed-statuspill">';
    h += '<button type="button" class="dfx-or-chip cv-pill ' + _cFar.cls + '"'
      + ' data-action="cv-statuspill" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"'
      + ' aria-haspopup="true" aria-expanded="false" title="Tap to change status">'
      + _cFar.txt + ' <span class="cv-pill-caret">\u25BC</span></button>';
    h += _cvStatusMenu(d, oi, _cCur).replace(/data-action="cv-setstatus"/g, 'data-action="cv-setstatus" data-instant="1"');
    h += '</span>';
  }
  h += '</div>'; // /dfx-ed-ctrls

  // ── S213: quiet auto-stamped observed-date line (Editor B/C only) ──
  if (opts.withHeader) {
    var _nd = _obsNotedDate(d, o);
    var _ndTxt = _fmtNotedDate(_nd);
    // "auto-stamped" flag shows when this obs has its own notedDate that was
    // set automatically on creation and not yet hand-corrected (we only have
    // the value, so: present + no explicit user-edit marker → auto-stamped).
    var _autoStamp = !!(o && o.notedDate && !o.notedDateEdited);
    h += '<div class="dfx-ed-noted" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">';
    h += '<span class="dfx-ed-noted-lbl">\uD83D\uDCC5 ' + (_ndTxt ? ('Noted ' + esc(_ndTxt)) : 'No observed date') + '</span>';
    h += '<button type="button" class="dfx-ed-noted-edit" data-action="dfx-ed-edit-noted" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-cur="' + esc((_nd && String(_nd).slice(0, 10)) || '') + '">edit</button>';
    if (_autoStamp && _ndTxt) h += '<span class="dfx-ed-noted-flag" title="Date stamped automatically when the pin was created">auto-stamped</span>';
    h += '</div>';
  }

  // ── S248 card-expand body (LOCKED layout, FRT_CARD_EXPAND_FINAL_demo +
  // Mark's PC correction): 2-col on PC — LEFT column = comment text on top,
  // photos below it; RIGHT column = the drawing mini-map (full height). Phone
  // (<680px) collapses to a single stacked column: text → photos → drawing.
  // Only the combined-view card editor (no withHeader) uses this grid; the
  // on-drawing editor (withHeader) keeps its own obs-layout-merged. ──
  var _cvCard = !opts.withHeader;
  if (_cvCard) {
    h += '<div class="cv-ed-body">';
    h += '<div class="cv-ed-left">';
  } else {
    h += '<div class="obs-layout-merged">';
  }
  h += '<div class="obs-text">';
  h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" class="obs-text-input" placeholder="Describe the observation...">' + esc(o.text || '') + '</textarea>';
  h += '</div>';
  var obsPhotos = (Model.getEffectivePhotos ? Model.getEffectivePhotos(d, oi) : (o.photos || [])) || [];
  // S213b: Editor B/C — Photos heading line (Choose + "N attached" count)
  // above the drop box, matching pin_editor_balanced.html. A (no withHeader)
  // keeps the plain inline layout with no heading.
  if (opts.withHeader) {
    // S214: the ⊞ Choose selection picker is wired only for the on-drawing pin
    // editor (B, in viewer.js). For C (focused-pin modal) it is rendered but
    // inert until the picker is lifted to a shared helper in its own verified
    // session — opts.chooseDisabled keeps the button visible (parity of layout)
    // without a live data-action that would no-op. B never sets this flag, so
    // its markup is unchanged.
    var _chooseBtn = opts.chooseDisabled
      ? '<button type="button" class="dfx-ed-choose dfx-ed-choose-soon" disabled aria-disabled="true" title="Photo selection \u2014 coming soon">\u229E Choose for this obs</button>'
      : '<button type="button" class="dfx-ed-choose" data-action="choose-obs-photos" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Choose which of this pin\'s photos belong to this observation">\u229E Choose for this obs</button>';
    h += '<div class="dfx-ed-photos-head"><span>Photos ' + _chooseBtn + '</span><span class="dfx-ed-pcount">' + obsPhotos.length + ' attached</span></div>';
  }
  h += '<div class="obs-media-col" data-action="photo-drop" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"';
  h += ' ondragover="event.preventDefault();this.classList.add(\'drag-over\')"';
  h += ' ondragleave="this.classList.remove(\'drag-over\')">';
  h += '<div class="obs-media-zone">';
  // S225: pin-origin move ghosts for THIS pin+obs (faded snapshot + Undo).
  var _obsGhosts = (Model.pinOriginGhosts) ? Model.pinOriginGhosts(d.id, oi) : [];
  if (obsPhotos.length || _obsGhosts.length) {
    h += '<div class="obs-media-photos">';
    obsPhotos.forEach(function(ph, phi) {
      var mk = (Model.getObsPhotoMarkup ? Model.getObsPhotoMarkup(d, oi, ph.id) : null);
      var src = (mk && mk.markedR2Key) ? mk.markedR2Key : (ph.thumb || ph.dataUrl || ph.r2Url || '');
      var pid = ph.id || '';
      h += '<div class="obs-photo-wrap' + (src ? '' : ' obs-photo-noimg') + '">';
      if (src) {
        h += '<img data-action="open-lightbox" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" src="' + esc(src) + '" loading="lazy">';
      } else {
        h += '<div class="obs-photo-placeholder" data-action="open-lightbox" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" title="Photo data not yet loaded">\uD83D\uDCF7</div>';
      }
      h += _obsPhotoSyncBadge(ph);
      // S213b: optional label badge (Editor B/C) — only when the photo carries
      // a real label/caption. Never fabricated; absent on unlabeled photos.
      if (opts.withHeader) {
        var _plab = ph.label || ph.caption || '';
        if (_plab) h += '<span class="obs-photo-label" title="' + esc(_plab) + '">' + esc(_plab) + '</span>';
      }
      h += '<button data-action="ai-suggest-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" class="photo-ai-btn" title="AI Suggest from this photo">\u2728</button>';
      h += '<button data-action="delete-obs-photo" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-idx="' + phi + '" data-photo-id="' + esc(pid) + '" class="obs-photo-del" title="Remove from this observation">\u2715</button>';
      h += '<button data-action="photo-assign-pin" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" data-photo-id="' + esc(pid) + '" class="obs-photo-pin" title="Move or copy to another pin">\u2934</button>';
      // S226: copy chip on the ORIGIN photo (a copy left the original here).
      var _copyTok = (Model.copyOriginTokenForPhoto) ? Model.copyOriginTokenForPhoto(pid) : null;
      if (_copyTok) {
        h += '<button data-action="ph-undo-move" data-token="' + esc(_copyTok) + '" class="obs-photo-copychip" title="Undo this copy">Copied \u00b7 \u21A9</button>';
      }
      // S227: "Just added" chip on the DESTINATION photo (move/copy just landed
      // it under THIS obs) — lets a mis-clicked obs be reversed right here.
      var _addTok = (Model.justAddedTokenForObsPhoto) ? Model.justAddedTokenForObsPhoto(d.id, oi, pid) : null;
      if (_addTok && _addTok !== _copyTok) {
        h += '<button data-action="ph-undo-move" data-token="' + esc(_addTok) + '" class="obs-photo-addchip" title="Undo \u2014 just added here">Just added \u00b7 \u21A9</button>';
      }
      h += '</div>';
    });
    // S225: faded ghost tiles for photos just MOVED OUT of this obs.
    _obsGhosts.forEach(function(g) {
      var s = g.snapshot || {};
      var gsrc = s.thumb || s.dataUrl || s.r2Url || '';
      h += '<div class="obs-photo-wrap obs-photo-ghost">';
      if (gsrc) h += '<img src="' + esc(gsrc) + '" loading="lazy">';
      else h += '<div class="obs-photo-placeholder">\uD83D\uDCF7</div>';
      h += '<button data-action="ph-undo-move" data-token="' + esc(g.token) + '" class="obs-photo-undo" title="Undo this move">\u21A9 Undo</button>';
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="obs-media-divider"></div>';
  }
  h += '<div class="obs-media-hint">' + (obsPhotos.length ? 'Drop photos to add' : 'Drop photos here') + (opts.withHeader ? '' : '') + '</div>';
  h += '<div class="obs-media-btns">';
  // S328 (#17): the combined-view card editor (withHeader false) previously
  // rendered these as cramped icon-only buttons to save space. Mark wants them
  // to MATCH every other Add Photos / Gallery button (full icon + label, same
  // shape/size) for consistency. Force the labelled, non-icon-only variant on
  // all surfaces — the space-saving branch is retired.
  var _icl = '';
  var _al = ' Add Photos';
  var _gl = ' Gallery';
  // S317 (Mark): Upload + Camera consolidated into ONE "Add Photos" button
  // (matches the Photo Gallery). Burst camera primary, file-picker fallback —
  // see the photo-add handler. Gallery (pick from existing pool) stays separate.
  h += '<button class="obs-drop-btn is-addphotos' + _icl + '" data-action="photo-add" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Add photos — camera or upload">\uD83D\uDCF7' + _al + '</button>';
  h += '<button class="obs-drop-btn is-gallery' + _icl + '" data-action="photo-gallery-pick" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Pick from project site photos">\uD83D\uDDBC\uFE0F' + _gl + '</button>';
  h += '</div>';
  h += '</div></div>'; // /obs-media-zone /obs-media-col
  if (_cvCard) {
    h += '</div>'; // /cv-ed-left  (text + photos stacked, LEFT column)
    // RIGHT column = the drawing mini-map, full height. DESKTOP panel
    // (cv-pe-location-thumb) is interactive via the cross-module
    // window._frtRenderPinMiniMap hook (identical _PinPan path as the
    // on-drawing editor — no NEW drag risk); the NARROW panel
    // (cv-pe-location-thumb-mobile) is a static crop. CSS shows exactly one
    // per breakpoint. Single-expand accordion → ids exist once. "Open in
    // drawing viewer" reuses the EXISTING viewer (view-pin); never a 2nd
    // tiled instance.
    h += '<div class="cv-ed-right">';
    // S250 §8: loc-head (label + Open button) moved up to the controls row;
    // the right column now starts directly with the drawing thumb so its top
    // aligns with the description box top.
    h += '<div id="cv-pe-location-thumb" class="cv-loc-thumb cv-loc-desktop"></div>';
    h += '<div id="cv-pe-location-thumb-mobile" class="cv-loc-thumb cv-loc-mobile"></div>';
    if (d.drawingId) {
      h += '<div class="cv-loc-hint">Drag the pin to reposition \u00b7 \uFF0B/\u2212 to zoom \u00b7 tap \u2197 above to open the full drawing</div>';
    }
    h += '</div>'; // /cv-ed-right
    h += '</div>'; // /cv-ed-body
  } else {
    h += '</div>'; // /obs-layout-merged
  }

  // AI scratchpad (per-obs)
  h += '<div class="ai-scratchpad" data-sp-defic="' + esc(d.id) + '" data-sp-obs="' + oi + '" style="display:none;"></div>';

  // ── per-obs activity thread (extracted from _buildPinGroupCard) ──
  var _obsLetter = String.fromCharCode(65 + oi);
  var _obsActs = (d.activity || []).filter(function(a) {
    return a && !a.autoGenerated && a.obsRef === _obsLetter;
  }).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  h += '<div class="defic-obs-act-thread" data-obs-letter="' + _obsLetter + '" style="margin-top:8px;padding-top:6px;border-top:1px dashed var(--border);">';
  h += '<div style="font-size:calc(10px + var(--ts));font-weight:700;color:var(--silver);margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:8px;">';
  h += '<span>Thread \u2014 Obs ' + _obsLetter + (_obsActs.length ? ' (' + _obsActs.length + ')' : '') + '</span></div>';
  _obsActs.forEach(function(a) { h += _buildActEntryHtml(a, d.id); });
  h += '</div>';

  // ── per-row action bar ──
  var effStatus = Model.getEffectiveStatus(d);
  var thisClosed = !!o.addressed;
  var last = obs.length <= 1;
  if (opts.withHeader) {
    // S213 — slim Editor B/C bar. Obs add/remove/split live on the tab strip;
    // status star lives in the header. Auto-save (no Save button). More holds
    // Move pin · Move pin to drawing · Duplicate · Remove pin.
    h += '<div class="dfx-or-actions dfx-ed-actions">';
    h += '<button class="dfx-or-act" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="Contractor Response" data-obs-ref="' + _obsLetter + '">+ Response</button>';
    h += '<button class="dfx-or-act" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="ARENCON" data-obs-ref="' + _obsLetter + '">+ Comment</button>';
    h += '<div class="dfx-or-more-wrap" style="position:relative;margin-left:auto;">';
    h += '<button class="dfx-or-act" data-action="toggle-more" data-defic-id="' + esc(d.id) + '" title="More">\u22EF More</button>';
    h += '<div class="defic-more-popup" id="more-' + esc(d.id) + '">';
    // S328 (#6): "Split to its own pin" moved here from the obs-tab \u22EE three-dot
    // (clearer location; the cryptic dot is gone). Multi-obs only — a single-obs
    // pin has nothing to split off.
    if (!last) h += '<button data-action="dfx-ed-tab-split" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">\u2702 Split to its own pin</button>';
    // S328 (#7): the standalone "\u21C4 Move pin" (reassign-defic = move to another
    // section/contractor) is removed here — redundant in this editor because the
    // contractor + status pills directly above already reassign inline.
    // S328 (#10): with that clash gone, "Move pin to another drawing" is renamed
    // to simply "\uD83D\uDCD0 Move pin".
    if (d.drawingId) h += '<button data-action="dfx-ed-move-drawing" data-defic-id="' + esc(d.id) + '">\uD83D\uDCD0 Move pin</button>';
    h += '<button data-action="dup-defic" data-defic-id="' + esc(d.id) + '">\u29C9 Duplicate</button>';
    // S328 (Mark): the duplicate "Remove obs/pin" item is removed from More — the
    // pin-editor FOOTER Delete button is now the single delete control (deletes
    // the current obs, or the whole pin when it's the last obs, with the
    // photo-fate modal). One delete, not two.
    h += '</div></div>';
    h += '</div>'; // /dfx-or-actions
    h += '</div>'; // /dfx-or-editor
    return h;
  }
  h += '<div class="dfx-or-actions">';
  // drawing pin link (repeats per row — harmless, jumps to same spot)
  if (d.drawingId) {
    h += '<button class="dfx-or-act" data-action="view-pin" data-defic-id="' + esc(d.id) + '" title="Jump to pin in drawing">\uD83D\uDCCC Pin</button>';
  } else {
    h += '<button class="dfx-or-act" data-action="place-pin" data-defic-id="' + esc(d.id) + '" title="Place this pin on a drawing">\uD83D\uDCCC Place pin</button>';
  }
  h += '<button class="dfx-or-act" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="Contractor Response" data-obs-ref="' + _obsLetter + '">+ Response</button>';
  h += '<button class="dfx-or-act" data-action="show-add-activity" data-defic-id="' + esc(d.id) + '" data-label="ARENCON" data-obs-ref="' + _obsLetter + '">+ Comment</button>';
  // S210 (Mark): "View all" removed — tapping a photo already opens the
  // lightbox scoped to this deficiency's photos with swipe (open-lightbox).
  h += '<button class="dfx-or-act" data-action="reassign-defic" data-defic-id="' + esc(d.id) + '" title="Move to another section / contractor">\u21C4 Move</button>';
  if (multi) {
    h += '<button class="dfx-or-act" data-action="spinoff-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="Spin this observation off as its own pin">\u21B1 Spinoff</button>';
  }
  h += '<button class="dfx-or-act" data-action="add-obs" data-defic-id="' + esc(d.id) + '" title="Add another observation to this pin">+ Add observation</button>';
  // Remove — this obs only; whole pin only on the last obs (auto-routed).
  h += '<button class="dfx-or-act danger" data-action="dfx-remove-obsrow" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" title="' + (last ? 'Remove pin (last observation)' : 'Remove this observation') + '">\u2715 ' + (last ? 'Remove pin' : 'Remove obs') + '</button>';
  h += '<div class="dfx-or-more-wrap" style="position:relative;margin-left:auto;">';
  h += '<button class="dfx-or-act" data-action="toggle-more" data-defic-id="' + esc(d.id) + '" title="More">\u22EF</button>';
  h += '<div class="defic-more-popup" id="more-' + esc(d.id) + '">';
  h += '<button data-action="dup-defic" data-defic-id="' + esc(d.id) + '">\u29C9 Duplicate</button>';
  if (d.drawingId) h += '<button data-action="remove-pin" data-defic-id="' + esc(d.id) + '">\uD83D\uDCCC Remove Pin Only</button>';
  h += '</div></div>';
  h += '</div>'; // /dfx-or-actions

  h += '</div>'; // /dfx-or-editor
  return h;
}

function _renderDetailedView(proj, container) {
  // S311 dead-code: retired view. The view-toggle was removed (Combined View
  // is the sole live renderer, _renderCombinedView). Kept defined-but-inert
  // per S137 discipline so any stray reference resolves. Body removed (was
  // ~250 lines). Do NOT call — _renderCombinedView supersedes it.
  return;
}


// ════════════════════════════════════════════════════════════════════
// COMBINED DEFICIENCY VIEW (FRT-CV) — S232 render fold.
// Merges the Detailed + Board views into ONE view (the toggle is gone).
// Consumes the S231 _deriveCategory classifier. Reuses every protected
// building block: _flatRows (ALL rows: ignorePivot + ignoreRecMode),
// getContractorColor, the Trade->Contractor nest helpers, and the
// _buildObsRow / _buildObsEditor pair (which already wire toggle-rec,
// obs-pristatus, reassignDeficiency). The ONLY new behavior here is:
//   (1) per-obs partition by _deriveCategory (not the pin-level rec/site
//       split _renderDetailedView used);
//   (2) the four-category segmented PILL per row + its handler, writing
//       back through EXISTING Model setters only;
//   (3) the global "Edit categories" lock + DELAYED re-sort.
// No new stored field. No data migration. Site Records still excluded
// from the client report (the PDF filter keys off the same flags, which
// this view never changes structurally).
// ════════════════════════════════════════════════════════════════════

// S263: _cvUnlocked + _cvDirty REMOVED — the global Edit-categories lock is
// gone. Status picks go straight to _cvPendingKeys (below). The list re-sorts
// only on the manual Re-sort button or a deliberate navigation re-render.

// Committed-but-not-yet-resorted set. A status pick marks its obsKey here and
// patches the pill in place (no re-group), so the card keeps its position until
// the manual Re-sort button fires (mis-pick safety). Keyed per obsKey so a
// multi-obs pin whose observations land in DIFFERENT categories (verified on
// real Sprucewood data — pin 5: obsA=rec, obsB=active) tracks each obs
// independently. Cleared by _cvResort() (manual button) or a deliberate
// navigation re-render. Purely a render marker — the model is already mutated.
var _cvPendingKeys = {};
// One-shot guard — when true, the next render() does NOT flush the pending set.
// (Reserved; a pick patches in place without a render, so navigation/Re-sort
// own the resettle. Kept for the render() flush contract.)
var _cvSuppressFlush = false;

// S328 (card-flash): set true by the card-editor pin-drag onUp (via the
// window._frtHoldCardRenderOnce hook in viewer.js) to suppress exactly ONE
// post-save debounced render — otherwise dragging the pin in the expanded
// card's minimap fires 'saved' → render() → the card collapses and reopens
// (the flash). Same lifecycle as _recHoldUntilNav: consumed by the 'saved'
// listener and cleared at the top of render() so the next deliberate
// navigation resettles the list. Transient, never persisted.
var _cvPinDragHold = false;
window._frtHoldCardRenderOnce = function() { _cvPinDragHold = true; };

// S328 (#19): set true when a BACKGROUND event (cloud heartbeat merge → 'project',
// or a deferred 'photo' load tick) wanted to rebuild the list while a card was
// expanded and idle (no editable field focused). We skip that destructive full
// re-render — it was tearing down + reopening the card the user is simply reading
// (the intermittent "flash with no input"). The model is already updated; the
// next DELIBERATE render (card toggle / nav / filter, which clears this at
// render() top) reconciles the merged data. Never set for 'saved' (user-driven).
var _cvDeferredBgRender = false;

// S263: _cvCatMeta + _cvCategoryPill (the four-segment category bar) are
// RETIRED. Status is now changed via the always-tappable row pill + colored
// popover (_cvStatusMenu / _cvSetStatus). The segment bar and its global
// Edit-categories lock are gone. Removed rather than kept inert — small,
// single-purpose, no other callers.

// One collapsed observation row for the combined view. Wraps the existing
// _buildObsRow (which now carries the TAPPABLE status pill + its popover) and
// flags the wrapper pending so the Option-D markers + delayed-resort machinery
// work. S263: the old four-segment category bar + global Edit-categories lock
// are GONE — the row pill is the single, always-tappable status control.
function _cvObsRow(d, oi, ctrId, opts, cat) {
  var pend = _cvPendingKeys[_obsKey(d.id, oi)] ? ' cv-pending' : '';
  return '<div class="cv-row' + pend + '" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">'
    + _buildObsRow(d, oi, ctrId, opts) + '</div>';
}

function _renderCombinedView(proj, container) {
  // S250 §5: the combined view now HONORS the single category filter
  // (_catFilter → _activeDlcTab + _dfxRecMode) plus the search / contractor /
  // priority filters, via _flatRows(proj,false,false). Previously it passed
  // (true,true) and showed everything regardless of the pills — that's why
  // the four segments appeared inert. The trade→contractor band grouping is
  // preserved (Mark: keep bands); empty bands simply don't render.
  var rows = _flatRows(proj, false, false);

  function ctrOf(ctrId) {
    if (!ctrId) return null;
    return (proj.contractors || []).find(function(x) { return x.id === ctrId; }) || null;
  }

  var OTHER = 'Other Trade Items';
  var NOTRADE = '(No trade assigned)';

  // Aggregate per pin (for ordering + count) but classify per OBSERVATION.
  // Each row already carries {d, o, oi, ctrId, ctrName}; hasCtr = !!ctrId.
  // We build a Trade -> Contractor nest exactly like the Detailed view, but
  // the per-row category drives which rows are emitted/labelled — the nest
  // structure (trade band -> contractor sub-band) is preserved (Mark's call).

  // Group rows by pin so a pin's obs stay together under one trade/ctr.
  var pinOrder = [];
  var pinAgg = {};
  rows.forEach(function(r) {
    var id = r.d.id;
    if (!pinAgg[id]) { pinAgg[id] = { d: r.d, ctrId: r.ctrId, ctrName: r.ctrName, rows: [] }; pinOrder.push(id); }
    pinAgg[id].rows.push(r);
  });

  function _sortPins(arr) {
    if (!Array.isArray(arr)) return arr;
    arr.sort(function(a, b) {
      var na = parseInt(a && a.d && a.d.num, 10);
      var nb = parseInt(b && b.d && b.d.num, 10);
      var aok = !isNaN(na), bok = !isNaN(nb);
      if (aok && bok && na !== nb) return na - nb;
      if (aok !== bok) return aok ? -1 : 1;
      var ia = (a && a.d && a.d.id != null) ? String(a.d.id) : '';
      var ib = (b && b.d && b.d.id != null) ? String(b.d.id) : '';
      return ia < ib ? -1 : (ia > ib ? 1 : 0);
    });
    return arr;
  }

  // Trade -> Contractor nest. A pin lands under its single derived trade
  // (Model.derivePinTradeSingle) and its contractor. Unassigned (no ctr)
  // is pinned to the TOP of its trade so new/unassigned items never hide.
  var tradeMap = {};
  var tradeSeen = [];

  pinOrder.forEach(function(id) {
    var e = pinAgg[id];
    var tks = [Model.derivePinTradeSingle(e.d, ctrOf(e.ctrId))].filter(Boolean);
    if (!tks.length) tks = e.ctrId ? [OTHER] : [NOTRADE];
    var tk = tks[0];
    if (!tradeMap[tk]) { tradeMap[tk] = { name: tk, count: 0, ctrKeys: [], ctrs: {} }; tradeSeen.push(tk); }
    var T = tradeMap[tk];
    var ck = e.ctrId || '__unassigned__';
    if (!T.ctrs[ck]) { T.ctrs[ck] = { ctrId: e.ctrId, name: e.ctrName, pins: [], count: 0, unassigned: !e.ctrId }; T.ctrKeys.push(ck); }
    T.ctrs[ck].pins.push(e);
    T.ctrs[ck].count += e.rows.length;
    T.count += e.rows.length;
  });

  function orderTrades(seen, has) {
    var ordered = [];
    (proj.projectTrades || []).forEach(function(t) { if (has(t)) ordered.push(t); });
    seen.forEach(function(t) { if (ordered.indexOf(t) < 0 && t !== OTHER && t !== NOTRADE) ordered.push(t); });
    return ordered;
  }
  var orderedTrades = orderTrades(tradeSeen, function(t) { return !!tradeMap[t]; });
  if (tradeMap[OTHER]) orderedTrades.push(OTHER);
  if (tradeMap[NOTRADE]) orderedTrades.push(NOTRADE);

  var ctrIndex = {};
  (proj.contractors || []).forEach(function(c, i) { ctrIndex[c.id] = i; });
  function orderCtrKeys(T) {
    return T.ctrKeys.slice().sort(function(a, b) {
      // Unassigned pinned to TOP (load-bearing — a records-heavy project is
      // mostly unassigned; without this its content hides).
      if (a === '__unassigned__') return -1;
      if (b === '__unassigned__') return 1;
      var ia = (ctrIndex[a] == null) ? 1e9 : ctrIndex[a];
      var ib = (ctrIndex[b] == null) ? 1e9 : ctrIndex[b];
      return ia - ib;
    });
  }

  _dfxSectionKeys = [];
  function _arrow(collapsed) {
    return '<span class="dfx-fold-arrow">' + (collapsed ? '\u25B6' : '\u25BC') + '</span>';
  }

  var h = '';

  // S250 §6 (Option A): Re-sort + Collapse all are no longer rendered ABOVE the
  // list. They are built here as a right-aligned cluster and injected into
  // #dfx-list-actions on the filter row after the list renders. S263: the
  // "Edit categories" lock button is GONE — status is changed by tapping the
  // row pill directly (always-tappable; pending + Re-sort is the mis-pick
  // safety, not a lock).
  var _pend = _cvPendingCount();
  var _actionsHTML = ''
    + '<button type="button" class="cv-resort-btn' + (_pend ? ' has-pending' : '') + '" data-action="cv-resort"' + (_pend ? '' : ' disabled aria-disabled="true"') + ' title="Re-sort cards into their categories">'
    + '\u21BB Re-sort' + (_pend ? ' (' + _pend + ')' : '')
    + '</button>';

  orderedTrades.forEach(function(tk) {
    var T = tradeMap[tk];
    var isOther = (tk === OTHER || tk === NOTRADE);
    _dfxSectionKeys.push(tk);
    var tCol = !!_dfxFoldTrade[tk];
    h += '<div class="dfx-trade-section' + (tCol ? ' dfx-collapsed' : '') + '">';
    h += '<div class="dfx-trade-banner' + (isOther ? ' other' : '') + '" data-action="dfx-fold-trade" data-trade="' + esc(tk) + '"><span>' + _arrow(tCol) + esc(T.name) + '</span><span class="dfx-trade-count">' + T.count + '</span></div>';
    orderCtrKeys(T).forEach(function(ck) {
      var C = T.ctrs[ck];
      var cKey = tk + '::' + ck;
      var cCol = !!_dfxFoldCtr[cKey];
      h += '<div class="dfx-ctr-block' + (cCol ? ' dfx-collapsed' : '') + (C.unassigned ? ' cv-unassigned' : '') + '">';
      var _cpal = C.unassigned ? { accent: '#6E6AA8', surface: '#DEDDEF', text: '#3F4470' } : getContractorColor(C.name);
      var _cname = C.unassigned ? 'Unassigned' : C.name;
      h += '<div class="dfx-ctr-banner dfx-ctr-tinted" style="--cc:' + esc(_cpal.accent) + ';--csurf:' + esc(_cpal.surface) + ';--ctext:' + esc(_cpal.text) + ';" data-action="dfx-fold-ctr" data-ctr-key="' + esc(cKey) + '"><span class="dfx-ctr-dot"></span><span>' + _arrow(cCol) + esc(_cname) + '</span><span class="dfx-ctr-count">' + C.count + '</span></div>';
      h += '<div class="dfx-pingrp">';
      // S337: emit one pin's surviving observation rows.
      var _emitPin = function(e) {
        var hasCtr = !!C.ctrId;
        // S262: emit ONLY the observations that SURVIVED the filter (e.rows),
        // not every observation on the pin. Previously this looped over
        // e.d.observations directly, so a split pin with one surviving obs
        // (e.g. 2A=Recommendation) dragged its NON-surviving siblings (2B=
        // Outstanding) back into view under the wrong tab — the count was
        // right (filter dropped 2B) but the render re-added it. Each e.rows
        // entry carries {o, oi}; a legacy 0-obs row carries oi:-1.
        var survivors = e.rows || [];
        if (!survivors.length) return;
        survivors.forEach(function(r) {
          if (r.oi < 0 || !r.o) {
            var cat0 = _deriveCategory(e.d, null, hasCtr).cat;
            h += _cvObsRow(e.d, 0, C.ctrId, { ctrName: C.name }, cat0);
            return;
          }
          var cat = _deriveCategory(e.d, r.o, hasCtr).cat;
          h += _cvObsRow(e.d, r.oi, C.ctrId, { ctrName: C.name }, cat);
        });
      };
      var _sortedPins = _sortPins(C.pins);
      // S337 closed-split (Mark-locked, Approach A): when viewing the Closed
      // filter, separate items CLOSED THIS REPORT from those closed in an
      // EARLIER report, each under its own sub-header. Read-only partition by
      // closedOnInstance vs currentFrtInstance; empty groups render nothing.
      if (_deriveCatFilter() === 'closed') {
        var _csCur = (Model.getProject() && Model.getProject().currentFrtInstance) || 1;
        var _thisRep = [], _prevRep = [];
        _sortedPins.forEach(function(e) {
          var _ci = e.d.closedOnInstance;
          if (_ci != null && _ci >= _csCur) _thisRep.push(e); else _prevRep.push(e);
        });
        if (_thisRep.length) {
          h += '<div class="dfx-closed-subsec"><span>Closed this report</span><span class="dfx-closed-subcount">' + _thisRep.length + '</span></div>';
          _thisRep.forEach(_emitPin);
        }
        if (_prevRep.length) {
          h += '<div class="dfx-closed-subsec prev"><span>Previously closed</span><span class="dfx-closed-subcount">' + _prevRep.length + '</span></div>';
          _prevRep.forEach(_emitPin);
        }
      } else {
        _sortedPins.forEach(_emitPin);
      }
      if (!C.unassigned) {
        h += _addDeficTriggerHTML({ scoped: true, ctrId: C.ctrId, ctrName: C.name, trade: (isOther ? '' : T.name) });
      }
      h += '</div></div>';
    });
    h += '</div>';
  });

  if (_dfxSectionKeys.length) {
    var allCol = _dfxSectionKeys.every(function(k) { return !!_dfxFoldTrade[k]; });
    // S250 §6: Collapse all joins the action cluster (was its own bar above list)
    _actionsHTML = '<button class="dfx-foldall-btn" data-action="dfx-fold-all" data-all="'
      + (allCol ? '0' : '1') + '">' + (allCol ? '\u25BC Expand all' : '\u25B6 Collapse all') + '</button>' + _actionsHTML;
  }
  // S263: the unlocked edit-hint line is removed with the lock. The tappable
  // pill ("Tap to change status") is self-explanatory; Re-sort carries the
  // pending count.

  if (!orderedTrades.length) {
    var hasAny = Model.getAllDeficiencies(proj).length > 0;
    var _catLbl = { all: '', outstanding: 'Outstanding', rec: 'Recommendations', siterec: 'Site Records', closed: 'Closed' }[_deriveCatFilter()];
    if (_catLbl == null) _catLbl = '';
    var _emptyMsg = _catLbl
      ? ('No ' + _catLbl + ' items match the current filters.')
      : 'No items match the current filters.';
    h += '<div class="dfx-empty">' + (hasAny
      ? _emptyMsg
      : 'No deficiencies yet. Add a contractor in the Trade Board, then add deficiencies here.') + '</div>';
  }

  container.innerHTML = h;

  // S250 §6 (Option A): inject the list-action cluster (Collapse all · Re-sort)
  // into the filter-row placeholder. Falls back to prepending into the
  // container if the placeholder isn't present (e.g. a context where the
  // static control bar isn't mounted).
  var _actEl = document.getElementById('dfx-list-actions');
  if (_actEl) { _actEl.innerHTML = _actionsHTML; }
  else if (_actionsHTML) { container.insertAdjacentHTML('afterbegin', '<div class="dfx-foldall-bar">' + _actionsHTML + '</div>'); }
  // Single-expand accordion → the cv-pe-location-thumb ids exist at most once.
  // rAF so the canvas is in the DOM. Guarded: only when a row is open, it has
  // a drawingId, and the cross-module hook is present (viewer.js loaded).
  if (_openObsKey && window._frtRenderPinMiniMap) {
    try {
      var _ci = _openObsKey.lastIndexOf(':');
      var _odid = _ci >= 0 ? _openObsKey.slice(0, _ci) : _openObsKey;
      var _of = Model.findDeficiency(_odid);
      if (_of && _of.defic && _of.defic.drawingId) {
        var _od = _of.defic;
        requestAnimationFrame(function() {
          window._frtRenderPinMiniMap(_od, 'cv-pe-location-thumb');
          window._frtRenderPinMiniMap(_od, 'cv-pe-location-thumb-mobile');
          // S263: seed the re-fit baseline with the box's open-time height so
          // the first typing-driven re-fit compares against the right value.
          var _b0 = document.getElementById('cv-pe-location-thumb');
          _cvLastDrawBoxH = _b0 ? _b0.clientHeight : 0;
        });
      }
    } catch (e) {}
  }
  // S263: size any open comment box to its pre-filled content so a long note
  // opens at full height (no scrolled fixed box). rAF so layout is settled.
  if (_openObsKey) requestAnimationFrame(function() { _cvAutosizeAll(container); });
}

// S263: a ResizeObserver-based drawing re-fit was tried here and REVERTED — it
// caused a feedback loop (renderer sets a dpr-scaled canvas → nudges the box's
// measured size → observer re-fires → constant flashing, drawing never
// settles). The drawing now fits ONCE at open via the rAF render above. If the
// box later grows (comment/photos), the canvas keeps its open-time size and
// object-fit:contain letterboxes it — no loop, no flash.

// S248: manual re-sort. Clears the pending set and re-renders, which lets the
// existing pin/category ordering resettle the whole list. Flash + scroll the
// first moved card into view so the motion is legible (not silent — a silent
// resort is the one variant the lock doc says to avoid).
function _cvResort() {
  var keys = Object.keys(_cvPendingKeys);
  if (!keys.length) return;
  _cvPendingKeys = {};
  initDeficiencies.render();
  // Post-render: flash every row that was pending; scroll the first into view.
  try {
    function rowFor(k) {
      var ci = k.lastIndexOf(':');
      if (ci < 0) return null;
      var did = k.slice(0, ci), oi = k.slice(ci + 1);
      var dsel = (window.CSS && CSS.escape) ? CSS.escape(did) : did;
      return document.querySelector('.cv-row[data-defic-id="' + dsel + '"][data-obs-idx="' + oi + '"]');
    }
    var firstEl = rowFor(keys[0]);
    if (firstEl && firstEl.scrollIntoView) firstEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    keys.forEach(function(k) {
      var r = rowFor(k);
      if (!r) return;
      r.classList.remove('cv-just-moved'); void r.offsetWidth; r.classList.add('cv-just-moved');
      setTimeout(function() { r.classList.remove('cv-just-moved'); }, 1400);
    });
  } catch (e) {}
}

// S248: count obs-rows whose committed category no longer matches the order
// they were rendered in (i.e. waiting to be filed). Drives the button badge
// and the calm/disabled state. Per-obs keyed (mixed-category pins).
function _cvPendingCount() {
  return Object.keys(_cvPendingKeys).length;
}

// S263: _cvAutoRelock RETIRED with the lock. Navigation resettle is handled
// by render() clearing _cvPendingKeys (the _cvSuppressFlush contract).

// S263: apply a STATUS change for one observation from the tappable pill's
// popover. `choice` is one of high|low|rec|site|closed (Outstanding splits into
// high/low; the row pill text stays "Outstanding", colour carries high/low).
// Writes ONLY through existing Model setters (no new model code; re-derives on
// next render). Site Record auto-unassigns the contractor REVERSIBLY
// (d._cvPriorCtr remembers it). NO lock guard — always applies. The card does
// NOT re-group on pick (delayed re-sort): we mark it PENDING and patch the pill
// + Option-D markers in place. The list resettles only on the manual Re-sort
// button or a deliberate navigation re-render (mis-pick safety).
// S269 — moving a Site Record to Outstanding requires a contractor (in this
// model a no-contractor non-rec item IS a Site Record). Prompt for one; the
// chosen contractor reassigns the pin and the priority is applied, landing it
// in the Outstanding tab. Cancel leaves it a Site Record (no silent no-op).
// Reuses showDialog's button list: one per real contractor + New + Cancel.
function _promptContractorThenOutstanding(deficId, obsIdx, choice) {
  var proj = Model.getProject();
  var ctrs = realCtrs(proj && proj.contractors);
  function _finish(ctrId) {
    if (!ctrId) return; // cancel — stays a Site Record
    Model.reassignDeficiency(deficId, ctrId);
    if (typeof Model.updateObsPriority === 'function') Model.updateObsPriority(deficId, obsIdx, choice);
    if (typeof Model.saveNow === 'function') Model.saveNow();
    // Full render: the item changes category (Site Records → Outstanding), so a
    // group resettle is required — the in-place pill patch isn't enough here.
    initDeficiencies.render();
    if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
    _frtRefreshPinFocusIf(deficId);
    toast('Moved to Outstanding');
  }
  // S269: roster-style contractor cards (colored dot · name · trades) instead of
  // the stretched generic dialog buttons. One card per real contractor + a
  // "New contractor" card; Cancel / backdrop / Esc keeps it a Site Record.
  var rows = '';
  ctrs.forEach(function(c, i) {
    var cls = (typeof ctrColorClass === 'function') ? ctrColorClass(c.name) : 'ctr-c0';
    var trades = (c.trades && c.trades.length) ? c.trades.join(' \u00b7 ') : 'No trade yet';
    rows += '<button class="ctrpick-card ' + cls + '" data-ctrpick="' + i + '">'
      + '<span class="ctrpick-dot"></span>'
      + '<span class="ctrpick-body"><span class="ctrpick-name">' + esc(c.name) + '</span>'
      + '<span class="ctrpick-trades">' + esc(trades) + '</span></span>'
      + '</button>';
  });
  rows += '<button class="ctrpick-card ctrpick-new" data-ctrpick="new">'
    + '<span class="ctrpick-dot ctrpick-dot-new">+</span>'
    + '<span class="ctrpick-body"><span class="ctrpick-name">New contractor\u2026</span>'
    + '<span class="ctrpick-trades">Create and assign</span></span>'
    + '</button>';
  var overlay = document.createElement('div');
  overlay.className = 'ph-reassign-overlay';
  overlay.id = 'ctrpick-overlay';
  overlay.innerHTML =
    '<div class="ph-reassign-card ctrpick-modal">'
      + '<h3>Assign a contractor</h3>'
      + '<p class="ctrpick-sub">To make this an Outstanding item it needs a contractor. Pick one, or it stays a Site Record.</p>'
      + '<div class="ctrpick-list">' + rows + '</div>'
      + '<div class="btn-row"><button class="btn btn-outline btn-sm" data-ph-modal="cancel">Cancel</button></div>'
    + '</div>';
  document.body.appendChild(overlay);
  function _close() { overlay.remove(); document.removeEventListener('keydown', _esc); }
  function _esc(ev) { if (ev.key === 'Escape') _close(); }
  document.addEventListener('keydown', _esc);
  overlay.addEventListener('click', function(ev) {
    /* backdrop close disabled */ if(false){ _close(); return; }
    if (ev.target.closest && ev.target.closest('[data-ph-modal="cancel"]')) { _close(); return; }
    var card = ev.target.closest && ev.target.closest('[data-ctrpick]');
    if (!card) return;
    var which = card.getAttribute('data-ctrpick');
    if (which === 'new') {
      _close();
      showPrompt('New Contractor', 'Contractor name').then(function(nm) {
        var name = nm && nm.trim();
        if (!name) return; // cancel — stays a Site Record
        var ctr = Model.addContractor(name);
        if (ctr) _finish(ctr.id);
      });
      return;
    }
    var idx = parseInt(which, 10);
    var c = ctrs[idx];
    _close();
    if (c) _finish(c.id);
  });
}

function _cvSetStatus(deficId, obsIdx, choice, instant) {
  var find = Model.findDeficiency(deficId);
  if (!find) return;
  var d = find.defic;
  var o = (d.observations || [])[obsIdx] || null;
  var hasCtr = !!find.contractor;
  var curChoice = _obsCurrentChoice(o, hasCtr ? false : true, d);
  if (curChoice === choice) { _cvCloseStatusMenus(); return; }  // no-op pick

  switch (choice) {
    case 'high':
    case 'low':
      // Outstanding (active): clear rec/closed, then set priority. The item must
      // have a contractor to live in the Outstanding tab — in this model a
      // no-contractor non-rec item IS a Site Record, so "Outstanding with no
      // contractor" cannot exist. If we're leaving Site Records and have no
      // contractor to return to, prompt for one (S269 fix: the old code silently
      // no-opped when _cvPriorCtr was absent — e.g. an item born a Site Record or
      // reloaded from cloud — leaving it stuck in Site Records after Re-sort).
      if (o && o.isRecommendation) Model.setObsRecommendation(deficId, obsIdx, false);
      if (o && o.addressed) Model.toggleObsAddressed(deficId, obsIdx);
      if (!hasCtr) {
        if (d._cvPriorCtr) {
          // Reversible round-trip: returning to the contractor it came from.
          Model.reassignDeficiency(deficId, d._cvPriorCtr); d._cvPriorCtr = null;
          if (typeof Model.updateObsPriority === 'function') Model.updateObsPriority(deficId, obsIdx, choice);
        } else {
          // No contractor to return to — prompt for one. Cancel leaves it a Site
          // Record (honest: nowhere else for a no-contractor item to go yet).
          _cvCloseStatusMenus();
          _promptContractorThenOutstanding(deficId, obsIdx, choice);
          return; // chooser callback finishes the apply + repaint
        }
      } else {
        if (typeof Model.updateObsPriority === 'function') Model.updateObsPriority(deficId, obsIdx, choice);
      }
      break;
    case 'rec':
      if (o && o.addressed) Model.toggleObsAddressed(deficId, obsIdx);
      Model.setObsRecommendation(deficId, obsIdx, true);   // KEEP contractor
      break;
    case 'site':
      if (o && o.addressed) Model.toggleObsAddressed(deficId, obsIdx);
      if (o && o.isRecommendation) Model.setObsRecommendation(deficId, obsIdx, false);
      if (hasCtr) { d._cvPriorCtr = find.contractor.id; Model.reassignDeficiency(deficId, null); }  // reversible
      break;
    case 'closed':
      if (o && !o.addressed) Model.toggleObsAddressed(deficId, obsIdx);
      break;
  }

  if (typeof Model.saveNow === 'function') Model.saveNow();

  // S284c (Mark): INSTANT mode — picks made from a modal host (drawing-viewer
  // pin editor / focused modal) are FINAL. The list isn't under the user's
  // finger there, so the mis-pick-safety pending/Re-sort machinery doesn't
  // apply: close the menu and re-render the list fully (sorted) right away.
  // The modal itself refreshes via its own Model.onChange subscription.
  if (instant) {
    _cvCloseStatusMenus();
    initDeficiencies.render();
    return;
  }

  // Mark PENDING (Option D). Close FIRST so the portaled menu is cleaned up,
  // THEN patch the pill in place (rebuilds the anchor with a fresh closed menu).
  // Order matters: patching first would replace the anchor while the old menu
  // is still portaled on body, leaving it orphaned. No re-group — the full
  // resettle happens on the manual Re-sort button.
  // S265 FIX: saveNow() above fires 'saved', whose 300ms-debounced listener
  // calls render() — which flushes _cvPendingKeys and resettles the list,
  // defeating the manual Re-sort button. Hold that auto-render the same way a
  // rec-star toggle does: the pill is already patched in place, so the card
  // stays put until the user taps Re-sort or navigates (a deliberate render
  // clears this flag at render() top, line ~1849).
  _recHoldUntilNav = true;
  _cvPendingKeys[_obsKey(deficId, obsIdx)] = true;
  _cvCloseStatusMenus();
  _cvPatchRowPill(deficId, obsIdx);
  _cvSyncResortBtn();
}

// Re-render just one row's pill cluster (chip colour/text, Option-D dot +
// "moved" tag, the popover's selected highlight) after a pick, without
// re-rendering or re-grouping the whole list.
function _cvPatchRowPill(deficId, obsIdx) {
  var dsel = (window.CSS && CSS.escape) ? CSS.escape(String(deficId)) : String(deficId);
  var rowEl = document.querySelector('.cv-row[data-defic-id="' + dsel + '"][data-obs-idx="' + obsIdx + '"]');
  if (!rowEl) return;
  var find = Model.findDeficiency(deficId);
  if (!find) return;
  var d = find.defic;
  var o = (d.observations || [])[obsIdx] || null;
  var hasCtr = !!find.contractor;
  var isSite = !hasCtr;
  var far = _obsFarPill(o, isSite, d);
  var cur = _obsCurrentChoice(o, isSite, d);
  var anchor = rowEl.querySelector('.cv-pill-anchor');
  if (!anchor) return;
  var pend = !!_cvPendingKeys[_obsKey(deficId, obsIdx)];
  var html = '';
  if (pend) html += '<span class="cv-moved-tag">\u21BB moved</span>';
  html += '<button type="button" class="dfx-or-chip cv-pill ' + far.cls + (pend ? ' cv-pill-pending' : '') + '"'
    + ' data-action="cv-statuspill" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + obsIdx + '"'
    + ' aria-haspopup="true" aria-expanded="false" title="Tap to change status">'
    + far.txt + ' <span class="cv-pill-caret">\u25BC</span></button>';
  html += _cvStatusMenu(d, obsIdx, cur);
  anchor.innerHTML = html;
}

// Close any open status popover + reset the pills' aria-expanded + active cue.
// S263 (portal fix): the open menu was MOVED to document.body to escape the
// card's overflow:hidden clip. On close, return it to its home anchor so the
// next render finds it where it expects (and so DOM stays tidy).
function _cvCloseStatusMenus() {
  if (_cvOpenMenu && _cvOpenMenuHome && _cvOpenMenu.parentElement === document.body) {
    try { _cvOpenMenuHome.appendChild(_cvOpenMenu); } catch (e) {}
    _cvOpenMenu.style.left = ''; _cvOpenMenu.style.top = '';
  }
  document.querySelectorAll('.cv-statusmenu.open').forEach(function(m) { m.classList.remove('open'); });
  document.querySelectorAll('.cv-pill.cv-pill-active').forEach(function(p) { p.classList.remove('cv-pill-active'); });
  document.querySelectorAll('.cv-pill[aria-expanded="true"]').forEach(function(p) { p.setAttribute('aria-expanded', 'false'); });
  _cvOpenPill = null;
  _cvOpenMenu = null;
  _cvOpenMenuHome = null;
}

// S263 (fix): the open pill + its menu, tracked module-side so scroll/resize
// can REPOSITION (not close) — a fixed menu must follow its pill when the
// layout reflows. _cvOpenMenuHome remembers the anchor the menu was lifted
// FROM (it lives on document.body while open) so close can put it back.
var _cvOpenPill = null;
var _cvOpenMenu = null;
var _cvOpenMenuHome = null;

// Position a fixed popover from its pill's LIVE rect, with flips so it never
// runs off the right edge or below the fold. Called on open and on every
// scroll/resize while open. Keeps the menu visually anchored to the pill.
function _cvPositionMenu(menu, pill) {
  if (!menu || !pill) return;
  var pr = pill.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  var mw = menu.offsetWidth || 200, mh = menu.offsetHeight || 240;
  var pad = 8;
  // Horizontal: right-align the menu's right edge to the pill's right edge so
  // it reads as hanging off the pill. Clamp into the viewport on both sides.
  var left = pr.right - mw;
  if (left + mw > vw - pad) left = vw - pad - mw;
  if (left < pad) left = pad;
  // Vertical: prefer just below the pill; flip above if it would overflow.
  var top = pr.bottom + 5;
  if (top + mh > vh - pad) {
    var above = pr.top - 5 - mh;
    top = (above >= pad) ? above : Math.max(pad, vh - pad - mh);
  }
  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
}

// Toggle one row's popover open/closed. Tapping a pill opens its menu; tapping
// the SAME pill again closes it; tapping a different pill closes the first and
// opens the new one. S263 (portal fix): while open the menu lives on
// document.body (escapes the card's overflow:hidden clip), so we can't detect
// "is this pill's menu open?" by querying the anchor — the menu isn't a child
// of it anymore. We use the tracked _cvOpenPill reference instead.
function _cvToggleStatusMenu(pillEl) {
  // Re-tap on the already-open pill → close. (Checked BEFORE closing, via the
  // tracked ref, because the open menu is portaled away from the anchor.)
  var reTapSamePill = (_cvOpenPill === pillEl);
  _cvCloseStatusMenus();
  if (reTapSamePill) return;

  var anchor = pillEl.closest('.cv-pill-anchor');
  if (!anchor) return;
  var menu = anchor.querySelector('.cv-statusmenu');
  if (!menu) return;

  // Portal: lift the menu out of the clipping card and onto document.body.
  // Remember its home so close can return it.
  _cvOpenMenuHome = menu.parentElement;
  document.body.appendChild(menu);

  // Open + measure off-screen so offsetWidth/Height are real, then position.
  menu.style.visibility = 'hidden';
  menu.classList.add('open');
  pillEl.classList.add('cv-pill-active');
  pillEl.setAttribute('aria-expanded', 'true');
  _cvOpenPill = pillEl;
  _cvOpenMenu = menu;
  _cvPositionMenu(menu, pillEl);
  menu.style.visibility = '';
}

// Update the Re-sort button's badge + enabled state in place (a pick patches
// the pill without a full render, so the button must be synced separately).
function _cvSyncResortBtn() {
  var btn = document.querySelector('.cv-resort-btn');
  if (!btn) return;
  var n = _cvPendingCount();
  btn.classList.toggle('has-pending', n > 0);
  if (n > 0) { btn.removeAttribute('disabled'); btn.removeAttribute('aria-disabled'); }
  else { btn.setAttribute('disabled', ''); btn.setAttribute('aria-disabled', 'true'); }
  btn.innerHTML = '\u21BB Re-sort' + (n ? ' (' + n + ')' : '');
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

// ── S142 Batch 4-3/4-4: focused single-pin panel ─────────────────
// Clicking a Table row or Board card opens THIS overlay: the exact same
// isolated obs card the Detailed view builds (buildDeficCard, so every
// inline control AND the built-in View-on-drawing / Place-pin affordance
// ride along), plus a prominent top "View on drawing" CTA. It is NOT a
// jump to the Detailed list and NOT the heavy drawing-canvas pin editor.
// Edits flow through the existing document-delegated handlers; render()
// calls _refreshPinFocus() so the panel stays current, while never
// clobbering an in-progress textarea inside it. _dfxGotoPin is kept
// defined-but-inert (S137 dead-handler discipline) — dfx-goto now routes
// here instead.
var _pinFocusKeyH = null;
function _pinFocusCtrIdOf(deficId) {
  var proj = Model.getProject();
  if (!proj) return null;
  var ctrs = proj.contractors || [];
  for (var i = 0; i < ctrs.length; i++) {
    var ds = ctrs[i].deficiencies || [];
    for (var j = 0; j < ds.length; j++) { if (ds[j].id === deficId) return ctrs[i].id; }
  }
  return null; // not under any contractor => Site Records (generalDeficiencies)
}
// S214: C active observation index. Mirrors B's _peObsIdx (viewer.js).
var _pfObsIdx = 0;

// S214: synchronous close/switch flush for C's unified textarea — mirrors
// viewer.js _peFlushUnifiedTextarea (B). The obs-text textarea persists on a
// 500ms debounce; before a tab switch / close we read the live value and write
// it through Model.updateObservation so sub-debounce keystrokes aren't lost.
function _pfFlushTextarea() {
  var ov = document.getElementById('pinfocus-overlay');
  if (!ov) return;
  var ta = ov.querySelector('textarea[data-action="obs-text"]');
  if (!ta) return;
  var did = ta.getAttribute('data-defic-id');
  var idx = parseInt(ta.getAttribute('data-obs-idx') || String(_pfObsIdx) || '0', 10);
  if (isNaN(idx)) idx = _pfObsIdx || 0;
  if (!did) return;
  var f = Model.findDeficiency(did);
  if (!f) return;
  var cur = (f.defic.observations || [])[idx];
  if (cur && cur.text !== ta.value) {
    Model.updateObservation(did, idx, { text: ta.value });
  }
}

// S214: refresh C if it's open on deficId (parallel to B's _frtRefreshPinEditor
// / _frtPinEditorAddedObs / _frtPinEditorRemovedObs). idxHint: 'added' lands on
// the new last obs; a number clamps to it; undefined keeps _pfObsIdx. Closes C
// if the whole pin is gone.
function _frtRefreshPinFocusIf(deficId, idxHint) {
  var ov = document.getElementById('pinfocus-overlay');
  if (!ov) return;
  if (ov.getAttribute('data-defic-id') !== deficId) return;
  var f = Model.findDeficiency(deficId);
  if (!f) { _closePinFocus(); return; }
  var n = (f.defic.observations || []).length;
  if (idxHint === 'added') { _pfObsIdx = n > 0 ? n - 1 : 0; }
  else if (typeof idxHint === 'number') { var i = idxHint; if (i >= n) i = n - 1; if (i < 0) i = 0; _pfObsIdx = i; }
  if (_pfObsIdx < 0 || _pfObsIdx >= n) _pfObsIdx = 0;
  _refreshPinFocus();
}

function _buildPinFocusBody(deficId) {
  var f = Model.findDeficiency(deficId);
  if (!f) return '';
  var d = f.defic;
  var ctrId = _pinFocusCtrIdOf(deficId);
  // navBtn stays as C's own modal chrome (Mark, S214): View on drawing when
  // placed, Place pin when not. It is NOT folded into the editor's reserved
  // onDrawingLink slot — C passes no onDrawingLink, so its body is the SAME
  // headered editor as B.
  var navBtn = d.drawingId
    ? '<button data-action="view-pin" data-defic-id="' + esc(d.id) + '" class="btn-muted-ok" style="width:100%;text-align:center;padding:10px 14px;font-size:calc(14px + var(--ts));margin-bottom:14px;cursor:pointer;">\uD83D\uDCCC View on drawing</button>'
    : '<button data-action="place-pin" data-defic-id="' + esc(d.id) + '" class="btn-muted-warn" style="width:100%;text-align:center;padding:10px 14px;font-size:calc(14px + var(--ts));margin-bottom:14px;cursor:pointer;">\uD83D\uDCCC Place pin on a drawing</button>';
  // S214 convergence: C renders the SAME unified editor as B (withHeader →
  // star + Pin #N header + obs tab strip + noted line + photos head + action
  // bar). S215: the ⊞ Choose picker is now shared (FrtPhotoPicker), so C drops
  // chooseDisabled and renders the live button; its click is wired in C's
  // dispatcher below to open the picker into #pf-obs-content.
  var obs = d.observations || [];
  if (_pfObsIdx < 0 || _pfObsIdx >= obs.length) _pfObsIdx = 0;
  var editor = (typeof window !== 'undefined' && window._frtBuildObsEditor)
    ? window._frtBuildObsEditor(d, _pfObsIdx, ctrId, { withHeader: true, pinNum: (d.num != null ? d.num : '?') })
    : '<div style="padding:12px;color:var(--silver);font-family:Calibri,sans-serif;">Editor unavailable \u2014 reload the page.</div>';
  return navBtn + '<div class="dfx-or-editor-host" id="pf-obs-content">' + editor + '</div>';
}
function _closePinFocus() {
  var ov = document.getElementById('pinfocus-overlay');
  if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  if (_pinFocusKeyH) { document.removeEventListener('keydown', _pinFocusKeyH); _pinFocusKeyH = null; }
}
// S266 — shared obs-deletion flow used by both the Active-tab "Remove obs"
// button and the Detailed-view row delete. If the observation has photos that
// NO sibling obs on the same pin shows ("unique" photos), offer three choices:
//   Delete all          → soft-delete those unique photos, then remove the obs
//   Move to Site Records → release those unique photos to the gallery, then
//                          remove the obs
//   Cancel
// Photos that a sibling obs also shows are LEFT ALONE (Mark's rule). When the
// obs has no unique photos, falls back to a plain confirm (nothing to decide).
// afterFn runs after a successful removal (caller does render + editor refresh).
function _confirmRemoveObsWithPhotos(deficId, obsIdx, afterFn) {
  // Guard: removeObservation refuses to delete the last observation on a pin
  // (returns without acting). If we proceeded we'd soft-delete photos for an
  // obs that never gets removed. Callers that handle the last-obs case route to
  // removeDeficiency instead (which releases photos to Site Records itself); a
  // bare remove-obs on a single-obs pin simply does nothing here.
  var _gf = Model.findDeficiency(deficId);
  if (_gf && (_gf.defic.observations || []).length <= 1) {
    toast('A pin must keep at least one observation');
    return;
  }
  var unique = (Model.getPhotosUniqueToObs)
    ? Model.getPhotosUniqueToObs(deficId, obsIdx) : [];
  function _removeNow() {
    Model.removeObservation(deficId, obsIdx);
    if (typeof afterFn === 'function') afterFn();
  }
  if (!unique.length) {
    showConfirm('Remove Observation', 'Remove this observation? This cannot be undone.').then(function(yes) {
      if (yes) { _removeNow(); toast('Observation removed'); }
    });
    return;
  }
  var n = unique.length;
  var noun = n === 1 ? 'photo' : 'photos';
  showDialog({
    title: 'Remove Observation',
    message: 'This observation has ' + n + ' ' + noun + ' not used by any other observation on this pin. What should happen to ' + (n === 1 ? 'it' : 'them') + '?',
    buttons: [
      {
        label: 'Move ' + noun + ' to Site Records', color: '#9C2742',
        action: function() {
          unique.forEach(function(p) {
            if (p && p.id && Model.releasePoolPhotoToSite) Model.releasePoolPhotoToSite(deficId, p.id);
          });
          _removeNow();
          toast('Observation removed \u00b7 ' + n + ' ' + noun + ' moved to Site Records');
        }
      },
      {
        label: 'Delete all', color: '#C0392B',
        action: function() {
          unique.forEach(function(p) {
            if (p && p.id && Model.removePoolPhoto) Model.removePoolPhoto(deficId, p.id);
          });
          _removeNow();
          toast('Observation removed \u00b7 ' + n + ' ' + noun + ' moved to Recently Deleted');
        }
      },
      { label: 'Cancel', color: '#9C2742', outline: true, action: function() {} }
    ]
  });
}

// S328 (Mark): unified delete used by the pin-editor FOOTER Delete button.
// Deletes ONLY the current observation — unless it's the pin's LAST observation,
// in which case the whole pin is deleted. In BOTH cases the inspector chooses
// what happens to the photos unique to that observation: move them to Site
// Records (independent binary via releasePoolPhotoToSite), delete them (→
// Recently Deleted via removePoolPhoto), or cancel. afterFn runs after a real
// deletion (never on cancel) so the caller can refresh / close the editor.
function _confirmDeleteObsOrPin(deficId, obsIdx, afterFn, afterPinDeleteFn) {
  var f = Model.findDeficiency(deficId);
  if (!f) { toast('Item not found'); return; }
  var obsArr = f.defic.observations || [];
  var isLast = obsArr.length <= 1;
  var pinNum = f.defic.num != null ? f.defic.num : '?';
  // Photos unique to THIS obs (multi-obs) or, for the last obs, the whole pin's
  // pool (since deleting the pin removes every photo on it).
  var unique;
  if (isLast) {
    var pool = (Model.getEffectivePhotos ? Model.getEffectivePhotos(f.defic, obsIdx) : (obsArr[0] && obsArr[0].photos) || []) || [];
    unique = pool.slice();
  } else {
    unique = (Model.getPhotosUniqueToObs) ? Model.getPhotosUniqueToObs(deficId, obsIdx) : [];
  }
  function _doDelete() {
    if (isLast) {
      Model.removeDeficiency(deficId);
      if (Model.renumberDeficiencies) Model.renumberDeficiencies();
      if (typeof afterPinDeleteFn === 'function') afterPinDeleteFn();
    } else {
      Model.removeObservation(deficId, obsIdx);
      if (typeof afterFn === 'function') afterFn();
    }
  }
  var titleWord = isLast ? ('Delete Pin #' + pinNum) : 'Remove Observation';
  // No unique photos → a single plain confirm (no photo choice needed).
  if (!unique.length) {
    var msg = isLast
      ? 'This is the only observation, so the whole pin will be deleted. This cannot be undone.'
      : 'Remove this observation? This cannot be undone.';
    showConfirm(titleWord, msg).then(function(yes) {
      if (yes) { _doDelete(); toast(isLast ? ('Pin #' + pinNum + ' deleted') : 'Observation removed'); }
    });
    return;
  }
  var n = unique.length;
  var noun = n === 1 ? 'photo' : 'photos';
  var lead = isLast
    ? 'This is the only observation, so deleting it removes the whole pin. It has '
    : 'This observation has ';
  var tail = isLast
    ? (n === 1 ? ' photo' : ' photos') + '. What should happen to ' + (n === 1 ? 'it' : 'them') + '?'
    : ' ' + noun + ' not used by any other observation on this pin. What should happen to ' + (n === 1 ? 'it' : 'them') + '?';
  showDialog({
    title: titleWord,
    message: lead + n + tail,
    vertical: true,
    buttons: [
      {
        label: 'Move to Site Records', color: '#9C2742',
        action: function() {
          unique.forEach(function(p) {
            if (p && p.id && Model.releasePoolPhotoToSite) Model.releasePoolPhotoToSite(deficId, p.id);
          });
          _doDelete();
          toast((isLast ? ('Pin #' + pinNum + ' deleted') : 'Observation removed') + ' \u00b7 ' + n + ' ' + noun + ' moved to Site Records');
        }
      },
      {
        label: n === 1 ? 'Delete photo' : 'Delete photos', color: '#C0392B',
        action: function() {
          unique.forEach(function(p) {
            if (p && p.id && Model.removePoolPhoto) Model.removePoolPhoto(deficId, p.id);
          });
          _doDelete();
          toast((isLast ? ('Pin #' + pinNum + ' deleted') : 'Observation removed') + ' \u00b7 ' + n + ' ' + noun + ' moved to Recently Deleted');
        }
      },
      { label: 'Cancel', color: '#9C2742', outline: true, action: function() {} }
    ]
  });
}

function _openPinFocus(deficId, focusOi) {
  if (!deficId) return;
  var f = Model.findDeficiency(deficId);
  if (!f) { toast('Item not found'); return; }
  _closePinFocus();
  var d = f.defic;
  var ov = document.createElement('div');
  ov.id = 'pinfocus-overlay';
  ov.setAttribute('data-defic-id', deficId);
  // S153 B3 (Mark): opening from a Board card focuses ONLY that
  // observation; siblings collapse behind a one-tap reveal so pin
  // context isn't lost. Table rows / external entry pass no oi → whole
  // pin (unchanged).
  // S214: focusOi (Board card → one observation) becomes the editor's
  // starting tab index. Whole-pin entry (table rows / external) passes no oi →
  // index 0, all tabs available. Replaces the old data-focus-oi CSS-scoping.
  _pfObsIdx = (focusOi != null && focusOi >= 0) ? focusOi : 0;
  if (focusOi != null && focusOi >= 0) ov.setAttribute('data-focus-oi', String(focusOi));
  ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:32px 16px;font-family:Calibri,sans-serif;';
  var panel = document.createElement('div');
  panel.style.cssText = 'background:var(--bg,white);color:var(--fg,#1B2438);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.3);max-width:760px;width:100%;padding:18px 20px;';
  panel.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div style="font-size:calc(16px + var(--ts));font-weight:700;">Pin #' + esc(d.num || '?') + ' \u00B7 focused</div>'
    + '<button id="pinfocus-close" class="btn-muted-cancel" style="padding:6px 12px;font-size:calc(13px + var(--ts));cursor:pointer;">\u2715 Close</button>'
    + '</div>'
    + '<div id="pinfocus-body">' + _buildPinFocusBody(deficId) + '</div>';
  ov.appendChild(panel);
  ov.addEventListener('click', function(e) {
    if (e.target === ov) {
      // Backdrop-click close disabled (accidental dismiss / data loss). The
      // picker-exit-on-backdrop is kept so a misfire inside the picker still
      // backs out of the picker, but the modal itself only closes via × / Escape.
      if (FrtPhotoPicker.isActive()) { FrtPhotoPicker.exit(); return; }
      /* modal close on backdrop disabled */
    }
  });
  panel.querySelector('#pinfocus-close').addEventListener('click', function() {
    if (FrtPhotoPicker.isActive()) { FrtPhotoPicker.exit(); return; }
    _pfFlushTextarea(); _closePinFocus();
  });
  document.body.appendChild(ov);
  _pinFocusKeyH = function(ev) {
    if (ev.key === 'Escape') {
      if (FrtPhotoPicker.isActive()) { FrtPhotoPicker.exit(); return; }
      _pfFlushTextarea(); _closePinFocus();
    }
  };
  document.addEventListener('keydown', _pinFocusKeyH);
}
function _refreshPinFocus() {
  var ov = document.getElementById('pinfocus-overlay');
  if (!ov) return;
  var deficId = ov.getAttribute('data-defic-id');
  if (!deficId) return;
  if (!Model.findDeficiency(deficId)) { _closePinFocus(); return; }
  // S214: never rebuild while the user is mid-edit in the unified editor — the
  // editor now carries selects/inputs as well as the textarea, so guard all
  // three (mirrors viewer.js _peTypingInMount for B).
  var ae = document.activeElement;
  if (ae && ov.contains(ae) && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) return;
  var body = ov.querySelector('#pinfocus-body');
  if (body) body.innerHTML = _buildPinFocusBody(deficId);
}

// S214: DEFINED-BUT-INERT (S137 dead-handler discipline). No longer called —
// C now renders the unified editor whose header tab strip handles observation
// switching, replacing the old "render the whole buildDeficCard, CSS-hide
// siblings" approach. Retained (not deleted) so the prior behaviour is
// recoverable and the removal is bisectable.
// ── (original S153 doc follows) ──
// S153 B3 (Mark): scope the focused panel to a single observation.
// buildDeficCard emits every observation as
// `.defic-obs-card[data-obs-idx]`; this hides the non-target ones and
// injects a one-tap reveal toggle — NO buildDeficCard / _buildPinGroupCard
// rewrite (their structure is only read, never changed). The show-all
// state lives on the overlay so it survives _refreshPinFocus rebuilds.
function _scopePinFocusObs(ov) {
  if (!ov) return;
  var foi = ov.getAttribute('data-focus-oi');
  if (foi == null || foi === '') return;            // whole-pin open → show all
  var body = ov.querySelector('#pinfocus-body');
  if (!body) return;
  var cards = body.querySelectorAll('.defic-obs-card[data-obs-idx]');
  if (cards.length <= 1) return;                     // single-obs pin → nothing to scope
  var showAll = ov.getAttribute('data-focus-showall') === '1';
  var hidden = 0;
  cards.forEach(function(c) {
    var match = c.getAttribute('data-obs-idx') === String(foi);
    if (showAll || match) { c.style.display = ''; }
    else { c.style.display = 'none'; hidden++; }
  });
  var did = ov.getAttribute('data-defic-id');
  var f = did ? Model.findDeficiency(did) : null;
  var lbl = (f && f.defic) ? _dfxObsLabel(f.defic, parseInt(foi, 10)) : ('' + foi);
  var bar = body.querySelector('.dfx-obs-scope-bar');
  if (!bar) {
    bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'dfx-obs-scope-bar';
    var first = cards[0];
    if (first && first.parentNode) first.parentNode.insertBefore(bar, first);
    bar.addEventListener('click', function() {
      ov.setAttribute('data-focus-showall', ov.getAttribute('data-focus-showall') === '1' ? '0' : '1');
      _scopePinFocusObs(ov);
    });
  }
  bar.textContent = showAll
    ? ('\u25BE Showing all observations on this pin \u2014 tap to focus only #' + lbl)
    : ('\u25B8 ' + hidden + ' other observation' + (hidden === 1 ? '' : 's') + ' on this pin \u2014 tap to show');
}

// ── Board view — priority kanban + always-visible Closed column ──
// Pivot-independent (ignorePivot=true): the board carries its own
// Closed column, so Active/Closed pivot does not scope it.
// ── S153 Board Rework ────────────────────────────────────────────────
// ONE board, three lanes stacked as ROWS: Deficiencies →
// Recommendations → Site Records. Classification is DERIVED per
// observation, NEVER a manual toggle:
//   per-obs recommendation flag → REC;
//   else contractor present     → DEFIC;
//   else                        → SITEREC.
// Each lane renders the existing 4-column board (High / Low / General /
// Closed) over only its own rows. The lane banner reuses the existing
// .dfx-trade-banner idiom with a dedicated .dfx-lane modifier (so it
// never collides with the Detailed-view semantic banner classes
// .recs/.records/.other/.grey); colours per build spec §4 — def=navy,
// rec=amber, sr=grey. _flatRows is called with ignoreRecMode=true so
// all three classes coexist (the segmented Defic/Rec/Site filter
// becomes jump-nav in a later batch — it must NOT hide a whole lane
// here). Visual + interaction target: ARENCON_Board_Rework_Demo.html
// (rev 2, Mark approved verbatim S152). card()/col() reuse the shipped
// .dfx-bv-* DOM verbatim — dfx-goto / toggle-rec delegation unchanged.
function _renderBoardView(proj, container) {
  // S311 dead-code: retired Board/kanban view. No live caller (the view-toggle
  // was removed). Inert per S137. Body removed (was ~136 lines). The shared
  // _dfx* helpers it used remain — they are still referenced by live pin-focus
  // code (_scopePinFocusObs). Do NOT call.
  return;
}

// ── S138: unified "+ deficiency" trigger + modal ─────────────────
// One trigger card at the foot of every view. The modal collects
// description / priority / contractor / trade / pin / recommendation,
// then creates through existing Model methods (addDeficiency +
// updateObservation/updateObsPriority/updateObsTrade); the additive
// isRecommendation / drawingId are set on the returned defic (the
// same object-mutation precedent used by spin-off). Persists via
// Model.saveNow() (the established UI create path).
function _addDeficTriggerHTML(opts) {
  opts = opts || {};
  if (opts.scoped) {
    // S146 (Mark): section-scoped trigger at the foot of each
    // trade->contractor group. Pre-targets the contractor (+ trade) so
    // an empty section is one click from its first deficiency.
    var lbl = opts.ctrName ? esc(opts.ctrName) : '';
    var tl = opts.trade ? (' \u00B7 ' + esc(opts.trade)) : '';
    return '<div class="add-deficiency-card scoped" data-action="open-add-defic"'
      + (opts.ctrId ? ' data-ctr-id="' + esc(opts.ctrId) + '"' : '')
      + (opts.trade ? ' data-trade="' + esc(opts.trade) + '"' : '')
      + ' role="button" tabindex="0">'
      + '<span class="adc-plus">+</span> Add deficiency'
      + (lbl ? '<span class="adc-tgt">to ' + lbl + tl + '</span>' : '')
      + '</div>';
  }
  return '<div class="add-deficiency-card" data-action="open-add-defic" role="button" tabindex="0">'
    + '<span class="adc-plus">+</span> Add deficiency'
    + '<span class="adc-sub">creates an item \u2014 assign contractor / trade / pin in the dialog, or skip &amp; add later</span>'
    + '</div>';
}

function _closeAddDeficModal() {
  var ov = document.getElementById('add-defic-overlay');
  if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
}

function _openAddDeficModal(prefillCtrId, prefillTrade) {
  _closeAddDeficModal();
  var proj = Model.getProject();
  if (!proj) return;

  var ctrOpts = '<option value="">\u2014 None (' + SITE_RECORDS_LABEL + ' \u00B7 internal) \u2014</option>';
  realCtrs(proj.contractors).forEach(function(c) {
    ctrOpts += '<option value="' + esc(c.id) + '">' + esc(ctrLabel(c.name) || 'Unnamed') + '</option>';
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
     + '<option value="low">Low</option></select></div>';  // S217: 'general' priority retired
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

  // S146: section-scoped prefill (the per-section "+ Add deficiency"
  // button passes data-ctr-id / data-trade). Set only when the value
  // exists as an option, so an unknown trade/contractor degrades to the
  // normal blank modal instead of a broken select.
  if (prefillCtrId) {
    var _pc = ov.querySelector('#adf-ctr');
    if (_pc && [].some.call(_pc.options, function(o) { return o.value === String(prefillCtrId); })) _pc.value = String(prefillCtrId);
  }
  if (prefillTrade) {
    var _pt = ov.querySelector('#adf-trade');
    if (_pt && [].some.call(_pt.options, function(o) { return o.value === String(prefillTrade); })) _pt.value = String(prefillTrade);
  }

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
    // S327 (B1 root cause): route rec through setRecommendation so obs[0] AND the
    // pin-level rollup are both written. Setting d.isRecommendation directly left
    // obs[0].isRecommendation=false, so the card filter (obs-level) and the minimap
    // teardrop (rollup) disagreed on whether the new pin was a recommendation.
    if (ov.querySelector('#adf-rec').checked) Model.setRecommendation(d.id, true);
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
    if (e.target.id === 'adf-cancel') { _closeAddDeficModal(); return; } /* backdrop close disabled */
    if (e.target.id === 'adf-add') { doCreate(); return; }
    var recRow = e.target.closest && e.target.closest('#adf-recrow');
    if (recRow && e.target.id !== 'adf-rec') {
      var cb = ov.querySelector('#adf-rec'); if (cb) cb.checked = !cb.checked; return;
    }
  });
}

// S250 §4: map a single category-filter segment onto the two underlying
// filter axes (_activeDlcTab pivot + _dfxRecMode), then re-render. The
// row-filter predicate itself (_recModeDrops + pivot test) is unchanged —
// this only drives it from one control instead of two.
//   outstanding → active pivot + 'def'  → open deficiencies-with-contractor
//   rec         → 'any' pivot + 'rec'    → ALL recommendations (open + closed)
//   siterec     → 'any' pivot + 'siterec'→ ALL Site Records (open + closed)
//   closed      → closed pivot + 'all'   → every addressed item
// Rec/Site use the neutral 'any' pivot so the whole category shows regardless
// of status (locked decision). The predicate only filters on 'active'/'closed';
// any other pivot value (incl. 'any') passes both — no predicate change needed.
function _setCatFilter(cat) {
  if (!cat || cat === _deriveCatFilter()) { _catFilter = cat || _catFilter; return; }
  _catFilter = cat;
  if (cat === 'all') { _activeDlcTab = 'any'; _dfxRecMode = 'all'; }
  else if (cat === 'closed') { _activeDlcTab = 'closed'; _dfxRecMode = 'all'; }
  else if (cat === 'outstanding') { _activeDlcTab = 'active'; _dfxRecMode = 'def'; }
  else if (cat === 'rec') { _activeDlcTab = 'any'; _dfxRecMode = 'rec'; }
  else if (cat === 'siterec') { _activeDlcTab = 'any'; _dfxRecMode = 'siterec'; }
  initDeficiencies.render();
}

// S250 §4: reverse-map the current (pivot + recmode) axes to the single
// active segment, so the highlighted pill always reflects true filter state
// — even when other code paths flip _activeDlcTab directly (close/reopen/add/
// reassign). Closed pivot → 'closed'; recmode 'rec'/'siterec' → that category;
// everything else (incl. 'def' on active) → 'outstanding'.
function _deriveCatFilter() {
  if (_activeDlcTab === 'closed') return 'closed';
  // S336: 'All' = neutral pivot + 'all' recmode. Must be tested before the
  // rec/siterec checks (those set specific recmodes) and after 'closed'
  // (which also uses 'all' recmode but is pinned by the 'closed' pivot above).
  if (_activeDlcTab === 'any' && _dfxRecMode === 'all') return 'all';
  if (_dfxRecMode === 'rec') return 'rec';
  if (_dfxRecMode === 'siterec') return 'siterec';
  return 'outstanding';
}

// Sync the control bar to current state: pivot counts, active classes,
// contractor dropdown options, filter input values.
function _syncDfxControls(pcActive, pcClosed, proj, catCounts) {
  var ea = document.getElementById('dfx-pc-active');
  var ec = document.getElementById('dfx-pc-closed');
  if (ea) ea.textContent = pcActive;
  if (ec) ec.textContent = pcClosed;

  // S250 §4: populate the four category-segment counts + active state.
  if (catCounts) {
    var _cc = {
      all: document.getElementById('dfx-cc-all'),
      outstanding: document.getElementById('dfx-cc-outstanding'),
      rec: document.getElementById('dfx-cc-rec'),
      siterec: document.getElementById('dfx-cc-siterec'),
      closed: document.getElementById('dfx-cc-closed')
    };
    if (_cc.all) _cc.all.textContent = catCounts.all;
    if (_cc.outstanding) _cc.outstanding.textContent = catCounts.outstanding;
    if (_cc.rec) _cc.rec.textContent = catCounts.rec;
    if (_cc.siterec) _cc.siterec.textContent = catCounts.siterec;
    if (_cc.closed) _cc.closed.textContent = catCounts.closed;
  }
  document.querySelectorAll('.dfx-cat-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-catfilter') === _deriveCatFilter());
  });

  document.querySelectorAll('.defic-pivot-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-pivot') === _activeDlcTab);
  });
  document.querySelectorAll('.view-toggle-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-view') === _deficView);
  });

  var sel = document.getElementById('dfx-ctr');
  if (sel) {
    var ctrs = realCtrs(proj.contractors);
    var stillValid = !_dfxCtr || ctrs.some(function(c) { return c.id === _dfxCtr; });
    if (!stillValid) _dfxCtr = '';
    var opt = '<option value="">All contractors</option>';
    ctrs.forEach(function(c) {
      opt += '<option value="' + esc(c.id) + '"' + (c.id === _dfxCtr ? ' selected' : '') + '>' + esc(ctrLabel(c.name) || 'Unnamed') + '</option>';
    });
    sel.innerHTML = opt;
    sel.value = _dfxCtr;
  }
  var pri = document.getElementById('dfx-pri');
  if (pri) {
    // S262: priority (High/Low) only partitions the Outstanding working list.
    // Under Recommendations / Site Records / Closed it is meaningless, so the
    // control is FROZEN (disabled + dimmed) and any stale selection is cleared
    // so it can't silently filter those segments. Re-enabled on Outstanding.
    var _priLive = (_deriveCatFilter() === 'outstanding');
    if (!_priLive && _dfxPri) _dfxPri = '';
    pri.disabled = !_priLive;
    pri.classList.toggle('dfx-pri-frozen', !_priLive);
    pri.title = _priLive ? '' : 'Priority applies to Outstanding items only';
    if (document.activeElement !== pri) pri.value = _dfxPri;
  }
  var sb = document.getElementById('dfx-search');
  if (sb && document.activeElement !== sb) sb.value = _dfxSearch;
  // S150 (was S140 B2b): 4-state rec-mode segmented control (def / rec /
  // siterec / all). Active-state sync is generic over data-recmode.
  document.querySelectorAll('.dfx-recmode-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-recmode') === _dfxRecMode);
  });
}

// ── S263: keep an open status popover GLUED to its pill on scroll / resize.
// The menu is position:fixed, so on any reflow (page scroll, window resize,
// F12 open, fullscreen) we recompute its coordinates from the pill's live rect
// rather than letting it float detached. If the pill has scrolled out of view
// entirely, close instead. Capture-phase catches the inner container's scroll
// too. Registered once at module load.
(function _cvBindMenuTracking() {
  var track = function() {
    if (!_cvOpenMenu || !_cvOpenPill) return;
    var pr = _cvOpenPill.getBoundingClientRect();
    // pill fully off-screen (scrolled past) → close; else re-anchor.
    if (pr.bottom < 0 || pr.top > window.innerHeight || pr.right < 0 || pr.left > window.innerWidth) {
      _cvCloseStatusMenus();
    } else {
      _cvPositionMenu(_cvOpenMenu, _cvOpenPill);
    }
  };
  window.addEventListener('scroll', track, true);
  window.addEventListener('resize', track);
})();

// ── S137 Phase 2: control-bar interactions ───────────────
document.addEventListener('click', function(e) {
  // S263: tap-outside dismisses an open status popover. If the click is NOT on
  // a status pill and NOT inside a menu, close any open menu. (A click ON a pill
  // or menu item falls through to the cv-statuspill/cv-setstatus dispatch, which
  // toggles/applies and manages its own open state.)
  if (document.querySelector('.cv-statusmenu.open')) {
    var _inPill = e.target.closest && (e.target.closest('[data-action="cv-statuspill"]') || e.target.closest('.cv-statusmenu'));
    if (!_inPill) _cvCloseStatusMenus();
  }
  // S150 (Mark): the Table/Board rows carry data-action="dfx-goto" to open
  // the pin on row click. The per-row Recommendation star (toggle-rec) is
  // nested INSIDE that row, so closest('[data-action="dfx-goto"]') would
  // also match the ancestor row and open the pin on a star tap. Bail here
  // when the click originated inside a toggle-rec control — the separate
  // toggle-rec dispatcher (below) still runs and performs the flip.
  if (e.target.closest && e.target.closest('[data-action="toggle-rec"]')) return;
  var gt = e.target.closest && e.target.closest('[data-action="dfx-goto"]');
  if (gt) {
    // S153 B3: the Board ↗ carries data-obs-idx → open focused to just
    // that observation. Table rows carry no obs-idx → whole pin (as before).
    var _goi = gt.getAttribute('data-obs-idx');
    _openPinFocus(gt.getAttribute('data-defic-id'), (_goi != null && _goi !== '') ? parseInt(_goi, 10) : undefined);
    return;
  }
  // S250 §4: single 5-segment category filter. Maps each segment to the
  // existing (pivot + recmode) axes via _setCatFilter — no change to the
  // underlying filter predicate (_recModeDrops / pivot test).
  var cb = e.target.closest && e.target.closest('.dfx-cat-btn');
  if (cb) {
    _setCatFilter(cb.getAttribute('data-catfilter'));
    return;
  }
  // S137 legacy pivot handler — markup removed S250, left inert for
  // one-commit revertability (S137 dead-handler discipline).
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
  var it = e.target.closest && e.target.closest('#dfx-insp-toggle');
  if (it) {
    _showInspChip = !_showInspChip;
    try { localStorage.setItem('arencon-frt-insp-chip', _showInspChip ? '1' : '0'); } catch (err) {}
    it.classList.toggle('active', _showInspChip);
    it.setAttribute('aria-pressed', _showInspChip ? 'true' : 'false');
    initDeficiencies.render();
    return;
  }
  // S154 §2.1 (Option A): Deficiency Log collapse toggle. Header carries
  // the inline summary so collapsed reads like one bar; expansion reveals
  // the contractor-grouped table. State persisted; default = collapsed
  // (set on the card via data-collapsed="1" in HTML).
  var lh = e.target.closest && e.target.closest('#defic-log-header');
  if (lh) {
    var card = document.getElementById('defic-log-card');
    if (card) {
      var willCollapse = card.getAttribute('data-collapsed') !== '1';
      card.setAttribute('data-collapsed', willCollapse ? '1' : '0');
      try { localStorage.setItem('arencon-frt-log-collapsed', willCollapse ? '1' : '0'); } catch (err) {}
    }
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

// S221: _updateDlcCounts removed — dead orphan from the pre-S216 lifecycle-tab
// era. Zero call sites tree-wide; its DOM target (#defic-lifecycle-tabs .dlc-tab)
// was removed from markup in the S216 board redesign, so it was inert twice over.

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

  // ── S214: C (focused-pin modal) unified-editor actions ──────────────
  // Parallel to viewer.js's pin-editor dispatcher (which is gated to
  // #pin-editor-overlay and won't fire here). These handle the editor's tab
  // strip inside #pinfocus-overlay using C's own _pfObsIdx + _refreshPinFocus.
  // add-obs / dfx-remove-obsrow / obs-* persistence all fall through to the
  // shared document-level handlers below; only tab-switch and split need C's
  // render path, so only those are intercepted here.
  if (el && el.closest && el.closest('#pinfocus-overlay')) {
    var _pfOv = document.getElementById('pinfocus-overlay');
    var _pfDid = _pfOv ? _pfOv.getAttribute('data-defic-id') : null;
    // ── S215: shared photo-picker actions (data-pp-action) ──
    // When the picker is open inside C it owns these clicks. handleClick
    // returns true if it consumed the click.
    if (FrtPhotoPicker.handleClick(e)) return;
    // ── S215: ⊞ Choose → open the shared picker into C's mount. Parallel to
    // B's choose-obs-photos handler, but targets #pf-obs-content and uses C's
    // _pfObsIdx + _refreshPinFocus (via onExit). flush any pending textarea
    // first so a mid-edit obs text isn't lost when the mount is taken over.
    if (action === 'choose-obs-photos') {
      var _cDid = el.getAttribute('data-defic-id');
      var _cIdx = parseInt(el.getAttribute('data-obs-idx') || String(_pfObsIdx) || '0', 10);
      if (_cDid !== _pfDid) return;
      if (isNaN(_cIdx)) _cIdx = _pfObsIdx || 0;
      _pfFlushTextarea();
      _pfObsIdx = _cIdx;
      var _cMount = document.getElementById('pf-obs-content');
      if (!_cMount) return;
      FrtPhotoPicker.open({
        mount: _cMount,
        deficId: _pfDid,
        obsIdx: _pfObsIdx,
        onExit: function() { _refreshPinFocus(); }
      });
      return;
    }
    if (action === 'dfx-ed-tab') {
      var _ptd = el.getAttribute('data-defic-id');
      var _pti = parseInt(el.getAttribute('data-obs-idx') || '0', 10);
      if (_ptd === _pfDid) {
        _pfFlushTextarea();
        _pfObsIdx = isNaN(_pti) ? 0 : _pti;
        _refreshPinFocus();
      }
      return;
    }
    if (action === 'dfx-ed-tab-split') {
      var _psd = el.getAttribute('data-defic-id');
      var _psi = parseInt(el.getAttribute('data-obs-idx') || '0', 10);
      if (_psd !== _pfDid) return;
      var _psf = Model.findDeficiency(_pfDid);
      if (!_psf) return;
      var _psObs = _psf.defic.observations || [];
      if (_psi < 0 || _psi >= _psObs.length) return;
      if (_psObs.length <= 1) { if (typeof toast === 'function') toast('Only observation \u2014 nothing to split'); return; }
      var _psLetter = String.fromCharCode(65 + _psi);
      var _psPrev = (_psObs[_psi].text || '').trim();
      if (_psPrev.length > 80) _psPrev = _psPrev.slice(0, 80) + '\u2026';
      showConfirm('Split to its own pin', 'Move observation ' + _psLetter + ' (' + (_psPrev || 'no text') + ') into a brand-new pin at the same drawing location? It will be removed from this pin.').then(function(yes) {
        if (!yes) return;
        var _pNewDef = Model.splitObservationToPin(_pfDid, _psi);
        if (window._frtRenderDefic) window._frtRenderDefic();
        if (_pNewDef && _pNewDef.id) {
          _pfObsIdx = 0;
          _openPinFocus(_pNewDef.id);
          if (typeof toast === 'function') toast('Split to pin #' + (_pNewDef.num != null ? _pNewDef.num : '?'));
        } else {
          _pfObsIdx = 0;
          _refreshPinFocus();
        }
      });
      return;
    }
    // S214: inline noted-date edit (parallel to viewer.js _peEditNotedDate for
    // B). Swaps the "Noted …" line for a date input; on change writes per-obs
    // notedDate + saves, then rebuilds C via _refreshPinFocus.
    if (action === 'dfx-ed-edit-noted') {
      var _nLine = el.closest('.dfx-ed-noted');
      if (!_nLine) return;
      var _nDid = el.getAttribute('data-defic-id');
      var _nIdx = parseInt(el.getAttribute('data-obs-idx') || String(_pfObsIdx) || '0', 10);
      if (isNaN(_nIdx)) _nIdx = _pfObsIdx || 0;
      if (_nDid !== _pfDid) return;
      var _nCur = el.getAttribute('data-cur') || '';
      _nLine.innerHTML = '<input type="date" class="dfx-ed-noted-input" value="' + _nCur + '" style="font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));padding:2px 6px;border:1.5px solid var(--border);border-radius:5px;">';
      var _nInp = _nLine.querySelector('.dfx-ed-noted-input');
      if (!_nInp) return;
      setTimeout(function() { try { _nInp.focus(); } catch (_e) {} }, 20);
      var _nCommit = function() {
        var _nf = Model.findDeficiency(_pfDid);
        if (!_nf) return;
        var _nObs = (_nf.defic.observations || [])[_nIdx];
        if (_nObs) {
          var _nv = _nInp.value || '';
          if (_nv) { _nObs.notedDate = _nv; _nObs.notedDateEdited = true; }
          else { delete _nObs.notedDate; delete _nObs.notedDateEdited; }
          Model.saveNow();
        }
        _refreshPinFocus();
      };
      _nInp.addEventListener('change', _nCommit);
      _nInp.addEventListener('blur', _nCommit);
      return;
    }
  }

  if (action === 'dfx-fold-trade') {
    var ftk = el.getAttribute('data-trade');
    if (ftk != null) {
      _dfxFoldTrade[ftk] = !_dfxFoldTrade[ftk];
      var sec = el.closest('.dfx-trade-section');
      if (sec) {
        sec.classList.toggle('dfx-collapsed', !!_dfxFoldTrade[ftk]);
        var ar = el.querySelector('.dfx-fold-arrow');
        if (ar) ar.textContent = _dfxFoldTrade[ftk] ? '\u25B6' : '\u25BC';
      }
    }
    return;
  }

  if (action === 'dfx-fold-ctr') {
    var fck = el.getAttribute('data-ctr-key');
    if (fck != null) {
      _dfxFoldCtr[fck] = !_dfxFoldCtr[fck];
      var blk = el.closest('.dfx-ctr-block');
      if (blk) {
        blk.classList.toggle('dfx-collapsed', !!_dfxFoldCtr[fck]);
        var ar2 = el.querySelector('.dfx-fold-arrow');
        if (ar2) ar2.textContent = _dfxFoldCtr[fck] ? '\u25B6' : '\u25BC';
      }
    }
    return;
  }

  if (action === 'dfx-fold-all') {
    var collapse = (el.getAttribute('data-all') === '1');
    if (collapse) {
      _dfxSectionKeys.forEach(function(k) { _dfxFoldTrade[k] = true; });
    } else {
      _dfxFoldTrade = {};
      _dfxFoldCtr = {};
    }
    initDeficiencies.render();
    return;
  }

  // ── S263 FRT-CV: tappable status pill → colored popover ──
  if (action === 'cv-statuspill') {
    _cvToggleStatusMenu(el);
    return;
  }
  if (action === 'cv-resort') {
    _cvResort();
    return;
  }
  if (action === 'cv-setstatus') {
    var _cvDid = el.getAttribute('data-defic-id');
    var _cvOi = parseInt(el.getAttribute('data-obs-idx'), 10);
    var _cvChoice = el.getAttribute('data-choice');
    if (_cvDid != null && !isNaN(_cvOi) && _cvChoice) _cvSetStatus(_cvDid, _cvOi, _cvChoice, el.getAttribute('data-instant') === '1');
    return;
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
    _openAddDeficModal(
      (el && el.getAttribute('data-ctr-id')) || null,
      (el && el.getAttribute('data-trade')) || ''
    );
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

  // S141 B2f: "+ Add contractor" in the persistent roster header.
  // Deliberately NOT the generic 'add-contractor' handler — that one
  // force-adds a deficiency (Model.addDeficiency). The roster needs a
  // BARE contractor: Model.addContractor only ({trades:[],
  // deficiencies:[]}), which lands in the roster with a golden border
  // ready to assign to a trade.
  if (action === 'roster-add-ctr') {
    showPrompt('Add Contractor', 'Contractor name:').then(function(n) {
      var _rn = (n || '').trim();
      if (_rn) {
        var _rc = Model.addContractor(_rn);
        initDeficiencies.render();
        if (_rc) toast('Added ' + _rc.name + ' \u2014 assign it to a trade');
      }
    });
    return;
  }
  // ── S142 §2: Contractor Roster · Click-to-Assign handlers ──
  // The S136/B2f handlers above are kept defined but are no longer
  // emitted by _renderTradeBoard (S137 discipline). These replace them.

  if (action === 'crx-trade-menu-toggle') {
    var _menu = document.getElementById('crx-trade-menu');
    if (_menu) _menu.classList.toggle('crx-open');
    return;
  }

  if (action === 'crx-add-prebuilt') {
    var _apt = el.getAttribute('data-trade');
    if (_apt) { Model.addProjectTrade(_apt); initDeficiencies.render(); toast('Added trade: ' + _apt); }
    return;
  }

  if (action === 'crx-add-new-trade') {
    showPrompt('Add Trade', 'New trade name:').then(function(nm) {
      var _nt = (nm || '').trim();
      if (_nt) { Model.addProjectTrade(_nt); initDeficiencies.render(); toast('Added trade: ' + _nt); }
    });
    return;
  }

  if (action === 'crx-add-ctr') {
    // Bare contractor (Model.addContractor — NO auto-deficiency). Lands
    // in the roster with a golden border, ready for ⊕ → pick a trade.
    showPrompt('Add Contractor', 'Contractor name:').then(function(n) {
      var _cn = (n || '').trim();
      if (_cn) {
        var _cc = Model.addContractor(_cn);
        initDeficiencies.render();
        // S154 Bug #1: ⊕ was removed in S153 B3; whole contractor card is the tap target now.
        if (_cc) toast('Added ' + _cc.name + ' \u2014 tap the card to arm it, then tap a trade pill');
      }
    });
    return;
  }

  if (action === 'crx-pick-start') {
    var _psId = el.getAttribute('data-ctr-id');
    if (_psId) { _pickCtrId = _psId; initDeficiencies.render(); }
    return;
  }

  if (action === 'crx-pick-cancel') {
    if (_pickCtrId) { _pickCtrId = null; initDeficiencies.render(); }
    return;
  }

  if (action === 'crx-pill') {
    // Only meaningful in pick-mode. Assign the clicked trade to the
    // pick-target (additive/idempotent; auto-creates the column). The ×
    // on the pill has its own data-action (crx-del-trade) and is
    // display:none under body.crx-picking — no double-assign path.
    if (!_pickCtrId) return;
    var _plT = el.getAttribute('data-trade');
    var _plP = Model.getProject();
    var _plC = ((_plP && _plP.contractors) || []).filter(function(c) { return c.id === _pickCtrId; })[0];
    if (_plT && _plC && (_plC.trades || []).indexOf(_plT) === -1) {
      Model.addContractorToTrade(_pickCtrId, _plT);
      var _plN = _plC.name;
      _pickCtrId = null;
      initDeficiencies.render();
      toast(_plN + ' \u2192 ' + _plT);
    }
    return;
  }

  if (action === 'crx-untag') {
    var _utId = el.getAttribute('data-ctr-id');
    var _utT = el.getAttribute('data-trade');
    if (_utId && _utT) {
      Model.removeContractorFromTrade(_utId, _utT);
      initDeficiencies.render();
      toast('Un-assigned from ' + _utT);
    }
    return;
  }

  if (action === 'crx-del-trade') {
    // × on a strip pill = delete the trade everywhere. Hidden during
    // pick-mode (CSS), so this only fires when NOT picking. Confirm with
    // an un-tag count (handoff §2.7 Q3).
    if (_pickCtrId) return;
    var _dtT = el.getAttribute('data-trade');
    if (!_dtT) return;
    var _dtP = Model.getProject();
    var _dtN = ((_dtP && _dtP.contractors) || []).filter(function(c) { return (c.trades || []).indexOf(_dtT) !== -1; }).length;
    var _dtMsg = _dtN > 0
      ? 'Delete the "' + _dtT + '" trade everywhere? ' + _dtN + ' contractor' + (_dtN === 1 ? '' : 's') + ' will be un-tagged from it (contractor records and their deficiencies are preserved).'
      : 'Delete the "' + _dtT + '" trade? (No contractors are on it.)';
    showConfirm('Delete Trade', _dtMsg).then(function(yes) {
      if (yes) { Model.removeProjectTrade(_dtT); initDeficiencies.render(); toast('Deleted trade: ' + _dtT); }
    });
    return;
  }

  if (action === 'crx-rename') {
    var _rnId = el.getAttribute('data-ctr-id');
    if (_rnId) {
      var _rnP = Model.getProject();
      var _rnC = ((_rnP && _rnP.contractors) || []).filter(function(c) { return c.id === _rnId; })[0];
      if (_rnC) {
        showPrompt('Rename Contractor', 'New name:', _rnC.name).then(function(nm) {
          var _rnn = (nm || '').trim();
          if (_rnn && _rnn !== _rnC.name) {
            Model.renameContractor(_rnId, _rnn);
            initDeficiencies.render();
            toast('Renamed to ' + _rnn);
          }
        });
      }
    }
    return;
  }

  if (action === 'crx-del-ctr') {
    // Non-destructive (Model.deleteContractorAndReassign): items move to
    // Site Records, never deleted. Same safety contract as B2f.
    var _dcId = el.getAttribute('data-ctr-id');
    if (_dcId) {
      var _dcP = Model.getProject();
      var _dcC = ((_dcP && _dcP.contractors) || []).filter(function(c) { return c.id === _dcId; })[0];
      if (_dcC) {
        var _dcN = (_dcC.deficiencies || []).length;
        var _dcMsg = _dcN > 0
          ? 'Delete "' + _dcC.name + '"? Its ' + _dcN + ' item' + (_dcN === 1 ? '' : 's') + ' will be MOVED to Site Records (not deleted) and can be reassigned. The contractor record will be removed.'
          : 'Delete "' + _dcC.name + '"? (No items \u2014 nothing to move.)';
        showConfirm('Delete Contractor', _dcMsg).then(function(yes) {
          if (yes) {
            var _dcMoved = Model.deleteContractorAndReassign(_dcId);
            if (_pickCtrId === _dcId) _pickCtrId = null;
            initDeficiencies.render();
            toast('Deleted ' + _dcC.name + (_dcMoved > 0 ? ' \u2014 ' + _dcMoved + ' item' + (_dcMoved === 1 ? '' : 's') + ' moved to Site Records' : ''));
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
      // S213: if fired from inside the pin editor, move to + show the new obs.
      if (window._frtPinEditorAddedObs) window._frtPinEditorAddedObs(deficId);
      else if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
      // S214: same for C (focused-pin modal), if open on this pin.
      _frtRefreshPinFocusIf(deficId, 'added');
      toast('Observation added');
    }
  }

  if (action === 'remove-obs') {
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    _confirmRemoveObsWithPhotos(deficId, obsIdx, function() {
      initDeficiencies.render();
    });
  }

  // S209 Slice 1b — expand-one-at-a-time. Clicking a collapsed obs row's
  // head flips _openObsKey (closing any other open row) and re-renders.
  // Star/editor controls carry their own data-action so they never reach
  // here (dispatcher resolves the nearest [data-action]).
  if (action === 'dfx-toggle-obsrow') {
    var _td = el.getAttribute('data-defic-id');
    var _to = parseInt(el.getAttribute('data-obs-idx') || '0', 10);
    var _tk = _obsKey(_td, _to);
    _openObsKey = (_openObsKey === _tk) ? null : _tk;
    initDeficiencies.render();
  }

  // S209 Slice 1b — row delete. Removes THIS observation only; when it's
  // the pin's LAST observation the whole pin is deleted. Confirm wording
  // auto-switches (Mark-locked S209). Existing remove-obs / delete-defic
  // handlers are untouched (still serve the Active-tab card editor).
  if (action === 'dfx-remove-obsrow') {
    var _rd = el.getAttribute('data-defic-id');
    var _ro = parseInt(el.getAttribute('data-obs-idx') || '0', 10);
    var _rf = Model.findDeficiency(_rd);
    if (!_rf) return;
    var _rObs = _rf.defic.observations || [];
    var _rNum = _rf.defic.num != null ? _rf.defic.num : '?';
    if (_rObs.length <= 1) {
      showConfirm('Remove Pin', 'Remove pin #' + _rNum + '? This is its last observation, so the whole pin is deleted. This cannot be undone.').then(function(yes) {
        if (yes) {
          Model.removeDeficiency(_rd);
          if (_openObsKey && _openObsKey.indexOf(String(_rd) + ':') === 0) _openObsKey = null;
          initDeficiencies.render();
          // S213: whole pin gone — close the pin editor if it's showing this pin.
          if (window._frtClosePinEditorIf) window._frtClosePinEditorIf(_rd);
          // S214: close C too if open on this (now-deleted) pin.
          _frtRefreshPinFocusIf(_rd);
          toast('Pin #' + _rNum + ' deleted');
        }
      });
    } else {
      _confirmRemoveObsWithPhotos(_rd, _ro, function() {
        if (_openObsKey === _obsKey(_rd, _ro)) _openObsKey = null;
        initDeficiencies.render();
        // S213: refresh the open pin editor onto a valid obs index.
        if (window._frtPinEditorRemovedObs) window._frtPinEditorRemovedObs(_rd, _ro);
        else if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
        // S214: same for C (focused-pin modal), clamp toward removed slot.
        _frtRefreshPinFocusIf(_rd, _ro);
      });
    }
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
        // S161: read source photos via pool-aware lookup. Direct read of
        // srcObs.photos is empty for post-photo-pool-migration pins, which
        // silently created empty spin-offs. New defic keeps legacy obs.photos
        // shape (getEffectivePhotos legacy-fallback handles display).
        var srcEffective = (Model.getEffectivePhotos)
          ? Model.getEffectivePhotos(f.defic, obsIdx)
          : (srcObs.photos || []);
        newDefic.observations[0].photos = JSON.parse(JSON.stringify(srcEffective));
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

  // S151 (Mark): Recommendation toggle is now PER-OBSERVATION. The clicked
  // star carries data-obs-idx → flip just that observation
  // (setObsRecommendation, which also re-derives the pin-level rollup) and
  // flip ONLY that (defic,obs)'s stars in place, so #1A toggles without
  // touching #1B. A star with no data-obs-idx (a pin-summary row) keeps the
  // whole-pin path (setRecommendation sets every obs) and flips all of the
  // pin's stars. S150g hold-until-nav behaviour is unchanged: the card stays
  // put, the list only resettles on the next deliberate render. Layout still
  // groups by the pin rollup until step 3 splits it per observation.
  if (action === 'toggle-rec') {
    var _rdid = el.getAttribute('data-defic-id');
    if (_rdid) {
      var _rf = Model.findDeficiency(_rdid);
      if (_rf && _rf.defic) {
        var _roAttr = el.getAttribute('data-obs-idx');
        var _perObs = (_roAttr !== null && _roAttr !== '');
        var _roidx = _perObs ? parseInt(_roAttr, 10) : -1;
        var _obs = _perObs ? ((_rf.defic.observations || [])[_roidx]) : null;
        if (_perObs && !_obs) return;  // stale index — bail rather than guess
        var _newRec = _perObs ? !_obs.isRecommendation : !_rf.defic.isRecommendation;
        if (_perObs) {
          Model.setObsRecommendation(_rdid, _roidx, _newRec);  // saves (queued); re-derives rollup
        } else {
          Model.setRecommendation(_rdid, _newRec);             // whole pin (every obs)
        }
        // S150g: do NOT re-render; hold off the auto re-render the queued
        // save would trigger (via 'saved'). The card stays exactly where it
        // is so a mis-tap is one tap from undo. The list resettles on the
        // next deliberate render (view/pivot/filter change, leave & return,
        // project/photo load) — that render clears _recHoldUntilNav.
        _recHoldUntilNav = true;
        var _sel = (window.CSS && CSS.escape) ? CSS.escape(_rdid) : _rdid;
        // Per-obs: scope the in-place flip to THIS (defic,obs) so siblings
        // are untouched. Whole-pin: every star for the pin (all obs were set).
        var _q = '[data-action="toggle-rec"][data-defic-id="' + _sel + '"]'
               + (_perObs ? '[data-obs-idx="' + _roidx + '"]' : '');
        var _stars = document.querySelectorAll(_q);
        Array.prototype.forEach.call(_stars, function(b) {
          var isPill = b.classList.contains('pin-rec-toggle');
          b.classList.toggle('is-rec', _newRec);
          b.setAttribute('aria-pressed', _newRec ? 'true' : 'false');
          if (isPill) {
            b.textContent = _newRec ? '★ Recommendation' : '☆ Mark as recommendation';
            b.setAttribute('title', _newRec
              ? 'This observation is a Recommendation — click to revert it'
              : 'Mark this observation as a Recommendation');
          } else {
            b.textContent = _newRec ? '★' : '☆';
            b.setAttribute('title', _newRec
              ? 'This is a Recommendation — click to revert it to a normal item'
              : 'Mark this as a Recommendation');
          }
          // Subtle "changed — tap star to revert; resettles on refresh" cue
          // on the enclosing card. Skipped in the single-pin editor
          // (#pinfocus-body never relocates). Cleared on the next full
          // re-render when the card is rebuilt fresh.
          if (!b.closest('#pinfocus-body')) {
            var _cardEl = b.closest('tr, .dfx-bv-card, .defic-pin-group');
            if (_cardEl) _cardEl.classList.add('dfx-rec-changed');
          }
        });
      }
    }
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
    // S151 (Mark): remember we came FROM the focused-pin modal so the drawing
    // viewer can offer a "← Back to pin #N" return. S210 (Mark) extends this:
    // also arm the return when the jump starts from the Detailed list row, and
    // remember WHICH observation row, so "← Back" lands on the exact row the
    // user launched from — not just the tab, and not a modal popping over it.
    // Cleared by the viewer when it closes any other way so it never goes
    // stale. Single remembered origin, no nav-stack.
    var _wasFocused = !!document.getElementById('pinfocus-overlay');
    var _origTabEl = document.querySelector('.nav-tab.active');
    var _origTab = _origTabEl ? _origTabEl.getAttribute('data-tab') : null;
    // obs index is only meaningful on the Detailed obs-row button; other
    // view-pin entry points (pill, minimap, focus modal) omit it → default 0.
    var _origObsAttr = el.getAttribute('data-obs-idx');
    var _origObsIdx = (_origObsAttr != null && _origObsAttr !== '') ? parseInt(_origObsAttr, 10) : null;
    // Launched from the Detailed list (not the focus modal) when the focus
    // overlay is closed AND we're on the Deficiencies tab in Detailed view.
    var _fromDetailed = !_wasFocused && _origTab === 'deficiencies' && _deficView === 'detailed';
    if ((_wasFocused || _fromDetailed) && window._frtSetReturnPin) {
      window._frtSetReturnPin(deficId, _origTab, {
        obsIdx: _origObsIdx,
        toRow: _fromDetailed   // true → return to the Detailed row; false → reopen focus modal
      });
    }
    _closePinFocus(); // S142 B4-3: drop the focus panel when jumping to the drawing
    if (window._frtNavigateToPin) {
      var ok = window._frtNavigateToPin(deficId);
      if (!ok) toast('This pin is not placed on a drawing yet');
    } else {
      toast('Open the Drawings tab first');
    }
  }

  if (action === 'place-pin') {
    var deficId = el.getAttribute('data-defic-id');
    _closePinFocus(); // S142 B4-3: drop the focus panel when going to place the pin
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

  // S210 (Mark): "View all photos" button removed from both surfaces. Handler
  // kept defined-but-inert (S137 discipline) so a stray cached data-action never
  // dispatches into nothing. Per-photo open-lightbox is the only entry point now.
  if (action === 'view-all-photos') {
    return;
  }

  if (action === 'open-lightbox') {
    var el = el.closest('[data-action="open-lightbox"]');
    if (!el) return;
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    var photoIdx = parseInt(el.getAttribute('data-photo-idx') || '0');
    var f = Model.findDeficiency(deficId);
    if (f && f.defic.observations && f.defic.observations[obsIdx]) {
      // S161: pool-aware lookup matches obs-photo render (~L727).
      // Without this, post-photo-pool-migration pins show thumbnails
      // (render uses Model.getEffectivePhotos) but lightbox can't open
      // because handler reads empty obs.photos[] directly. Mirrors the
      // S160 fix in ui/photos.js for the gallery card lightbox.
      var photos = (Model.getEffectivePhotos)
        ? Model.getEffectivePhotos(f.defic, obsIdx)
        : (f.defic.observations[obsIdx].photos || []);
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
    realCtrs(proj.contractors).forEach(function(c) {
      if (c.id !== curCtrId) {
        opts += '<option value="' + esc(c.id) + '">' + esc(ctrLabel(c.name)) + '</option>';
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
    // S266: ✕ now offers three choices instead of an obs-only de-select.
    //   Delete photo         → soft-delete from the pin's pool (Recently Deleted)
    //   Move to Site Records  → release to the gallery as a site photo, then
    //                           soft-delete the pool entry
    //   Cancel
    // S266c (Mark's rule): a photo shared by 2+ observations on this pin is
    // NEVER pool-deleted or sent to Site Records from the ✕ — it's only
    // de-selected from THIS observation (brief confirm first). The other obs
    // keeps it. Only when this obs is the photo's last home does the user get
    // the 3-button choice (Delete / Move to Site Records / Cancel).
    var shared = (photoId && Model.isPoolPhotoSharedAcrossObs)
      ? Model.isPoolPhotoSharedAcrossObs(deficId, photoId) : false;
    if (shared) {
      showConfirm('Remove from this observation', 'Remove this photo from this observation? Other observations that use it will keep it.').then(function(yes) {
        if (!yes) return;
        var ok = false;
        if (photoId && Model.removePhotoFromObs) {
          ok = Model.removePhotoFromObs(deficId, obsIdx, photoId);
        }
        initDeficiencies.render();
        if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
        _frtRefreshPinFocusIf(deficId);
        toast(ok ? 'Removed from this observation' : 'Could not remove photo');
      });
      return;
    }
    showDialog({
      title: 'Photo',
      message: 'What would you like to do with this photo?',
      buttons: [
        {
          label: 'Move to Site Records', color: '#9C2742',
          action: function() {
            var ok = false;
            if (photoId && Model.releasePoolPhotoToSite) {
              var r = Model.releasePoolPhotoToSite(deficId, photoId);
              ok = r && r.ok;
            }
            initDeficiencies.render();
            if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
            _frtRefreshPinFocusIf(deficId);
            toast(ok ? 'Photo moved to Site Records' : 'Could not move photo');
          }
        },
        {
          label: 'Delete photo', color: '#C0392B',
          action: function() {
            var ok = false;
            if (photoId && Model.removePoolPhoto) {
              ok = Model.removePoolPhoto(deficId, photoId);
            }
            if (!ok && Model.removeObservationPhoto) {
              // legacy fallback (never-migrated obs.photos)
              Model.removeObservationPhoto(deficId, obsIdx, photoIdx);
              ok = true;
            }
            initDeficiencies.render();
            if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
            _frtRefreshPinFocusIf(deficId);
            toast(ok ? 'Photo moved to Recently Deleted' : 'Could not delete photo');
          }
        },
        { label: 'Cancel', color: '#9C2742', outline: true, action: function() {} }
      ]
    });
  }

  if (action === 'photo-assign-pin') {
    var el = el.closest('[data-action="photo-assign-pin"]');
    if (!el) return;
    var deficId = el.getAttribute('data-defic-id');
    var obsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    var photoId = el.getAttribute('data-photo-id') || '';
    if (photoId) _openPinPhotoPicker(deficId, obsIdx, photoId);
  }

  // S225: undo a faded move from a pin-editor origin ghost.
  if (action === 'ph-undo-move') {
    var uel = el.closest('[data-action="ph-undo-move"]');
    if (!uel) return;
    var utok = uel.getAttribute('data-token');
    if (utok && window._frtUndoPhotoMove) window._frtUndoPhotoMove(utok);
    return;
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
  // S328 (#15): deleting a comment used to call initDeficiencies.render(), which
  // swaps the entire list innerHTML and visibly tears down + rebuilds the open
  // card (the collapse→reopen flash). Now we remove ONLY that entry's DOM node
  // and fix the thread's "(n)" count in place — no full render, no flash. The
  // model is the source of truth; the next deliberate render reconciles anything
  // derived elsewhere.
  if (action === 'delete-activity') {
    var deficId = el.getAttribute('data-defic-id');
    var actId = el.getAttribute('data-act-id');
    if (!deficId || !actId) return;
    showConfirm('Delete activity entry?', 'This cannot be undone.').then(function(ok) {
      if (!ok) return;
      Model.removeActivityEntry(deficId, actId);
      // S328 (#15): saveNow() fires 'saved', whose 300ms-debounced listener calls
      // render() — which would re-flash the card we just surgically updated. Hold
      // that one render (same one-shot contract as the pin-drag fix).
      _cvPinDragHold = true;
      Model.saveNow();
      // Surgical DOM removal of the deleted entry + count fix-up.
      var _node = document.querySelector('.act-entry[data-act-entry-id="' + (window.CSS && CSS.escape ? CSS.escape(actId) : actId) + '"]');
      var _didSurgical = false;
      if (_node) {
        var _thread = _node.closest('.defic-obs-act-thread');
        _node.parentNode.removeChild(_node);
        if (_thread) {
          // Recount remaining real entries in this thread and update the "(n)".
          var _remaining = _thread.querySelectorAll('.act-entry').length;
          // Header is the thread's first child div; its first <span> holds the count.
          var _hdr = _thread.querySelector(':scope > div');
          var _hdrSpan = _hdr ? _hdr.querySelector(':scope > span') : null;
          if (_hdrSpan) {
            var _base = (_hdrSpan.textContent || '').replace(/\s*\(\d+\)\s*$/, '');
            _hdrSpan.textContent = _base + (_remaining ? ' (' + _remaining + ')' : '');
          }
        }
        _didSurgical = true;
      }
      if (!_didSurgical) initDeficiencies.render(); // fallback if node not found
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
      _activeDlcTab = 'closed'; _dfxRecMode = 'all'; _catFilter = 'closed';  // S250 §4: Closed segment = all closed
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
    // S135: Site Records tab retired — always route to active view, which
    // renders both contractor groups AND the Site Records bottom section.
    _activeDlcTab = 'active';
    document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-dlc') === _activeDlcTab);
    });
    initDeficiencies.render();
    toast('Deficiency reopened');
  }

  if (action === 'toggle-more') {
    // S192: was getElementById('more-' + deficId) which collides when the
    // same pin is rendered twice (Board card + focused pin editor → first
    // match wins, often the off-screen one). Sibling lookup uses the
    // clicked button's wrapper, so the right popup opens every time.
    // Also switches to position:fixed so the popup escapes
    // `.defic-pin-group { overflow: hidden }` on short pins.
    var popup = el.parentNode && el.parentNode.querySelector('.defic-more-popup');
    if (popup) {
      var wasOpen = popup.classList.contains('open');
      // Close all open popups; clear any inline coords so a future open
      // doesn't reuse stale positioning.
      document.querySelectorAll('.defic-more-popup.open').forEach(function(p) {
        p.classList.remove('open');
        p.style.position = ''; p.style.top = ''; p.style.left = '';
        p.style.right = ''; p.style.bottom = ''; p.style.zIndex = '';
      });
      if (!wasOpen) {
        var r = el.getBoundingClientRect();
        // Estimate height before measuring (popup is display:none); we'll
        // re-measure after open and re-clamp if needed.
        var estH = 120;
        var popupW = 180;
        var spaceAbove = r.top;
        var spaceBelow = window.innerHeight - r.bottom;
        popup.style.position = 'fixed';
        // S193: must use 'auto' here, NOT ''.  '' lets CSS rules
        // (.defic-more-popup { right:0; bottom:100% }) re-apply, which
        // combined with inline left+top stretches the popup to full
        // viewport width (the S192 horizontal-stripe bug).
        popup.style.bottom = 'auto'; popup.style.right = 'auto';
        if (spaceAbove >= estH + 8 && spaceAbove >= spaceBelow) {
          popup.style.top = (r.top - estH - 4) + 'px';
        } else {
          popup.style.top = (r.bottom + 4) + 'px';
        }
        popup.style.left = Math.max(8, Math.min(window.innerWidth - popupW - 8, r.right - popupW)) + 'px';
        popup.style.zIndex = '10001';                                       // above dialogs (10000) and pinfocus overlay (9998)
        popup.classList.add('open');
        // Re-clamp once visible (now that offsetHeight is accurate).
        var realH = popup.offsetHeight;
        if (realH && realH !== estH) {
          if (spaceAbove >= realH + 8 && spaceAbove >= spaceBelow) {
            popup.style.top = (r.top - realH - 4) + 'px';
          } else {
            popup.style.top = (r.bottom + 4) + 'px';
          }
        }
      }
    }
  }
});

// Close more popups on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('[data-action="toggle-more"]') && !e.target.closest('.defic-more-popup')) {
    document.querySelectorAll('.defic-more-popup.open').forEach(function(p) {
      p.classList.remove('open');
      p.style.position = ''; p.style.top = ''; p.style.left = '';
      p.style.right = ''; p.style.bottom = ''; p.style.zIndex = '';
    });
  }
});

// S235 fix: status chip is now a click-to-cycle BUTTON (not a select), so it
// fires 'click', never 'change'. Global click listener so it works in BOTH the
// on-drawing editor (#pin-editor-overlay, dispatched by viewer.js) and the
// focused modal (#pinfocus-overlay). high -> low -> closed -> high.
document.addEventListener('click', function(e) {
  var cb = e.target.closest && e.target.closest('[data-action="obs-status-cycle"]');
  if (!cb) return;
  var did = cb.getAttribute('data-defic-id');
  var oi = parseInt(cb.getAttribute('data-obs-idx') || '0', 10);
  var cur = cb.getAttribute('data-cur') || 'high';
  var f = Model.findDeficiency(did);
  if (!f) return;
  var o = (f.defic.observations || [])[oi];
  if (!o) return;
  var next = cur === 'high' ? 'low' : (cur === 'low' ? 'closed' : 'high');
  if (next === 'closed') {
    if (!o.addressed) Model.toggleObsAddressed(did, oi);
  } else {
    if (o.addressed) Model.toggleObsAddressed(did, oi);
    Model.updateObsPriority(did, oi, next);
  }
  initDeficiencies.render();
  if (window._frtRenderTasks) window._frtRenderTasks();
  if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
  _frtRefreshPinFocusIf(did);
});

// Status and priority changes via select
document.addEventListener('change', function(e) {
  var action = e.target.getAttribute && e.target.getAttribute('data-action');
  if (!action) return;

  // S141 B2f: assign a contractor to a trade from the persistent roster.
  // ADDITIVE: addContractorToTrade is idempotent, ensures the destination
  // trade column exists (adds it if missing), and PRESERVES any trades the
  // contractor is already on (no longer replaces with [t] — the roster
  // shows assigned contractors too, so "Add another trade" must accrue).
  if (action === 'ctr-assign-trade') {
    var _atId = e.target.getAttribute('data-ctr-id');
    var _atT = e.target.value;
    if (_atId && _atT) {
      Model.addContractorToTrade(_atId, _atT);
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
    // S135: Site Records tab retired — non-closed routes to active view
    // (which renders the Site Records bottom section).
    _activeDlcTab = (newStatus === 'closed') ? 'closed' : 'active';
    document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-dlc') === _activeDlcTab);
    });
    initDeficiencies.render();
  }

  // S209 Slice 1b — combined priority+status select (Detailed obs rows).
  // One control sets BOTH obs.priority and obs.addressed via the existing
  // model setters (no new model code). Values: 'high'/'low' = Outstanding
  // at that priority (addressed=false); 'closed' = addressed (priority
  // preserved). Mirrors the PDF report pills (red/amber Outstanding, green
  // Closed). Re-renders so the row chip + status update; keeps the row open.
  // NOTE action name is obs-PRIstatus — distinct from the LEGACY obs-status
  // open/closed toggle above (which would no-op on 'high'/'low' and swallow
  // the event). Do not rename back to obs-status (S209b collision bug).
  if (action === 'obs-pristatus') {
    (function() {
      var did = e.target.getAttribute('data-defic-id');
      var oi = parseInt(e.target.getAttribute('data-obs-idx') || '0', 10);
      var val = e.target.value;
      var f = Model.findDeficiency(did);
      if (!f) return;
      var o = (f.defic.observations || [])[oi];
      if (!o) return;
      if (val === 'closed') {
        if (!o.addressed) Model.toggleObsAddressed(did, oi);  // open → closed
      } else {
        if (o.addressed) Model.toggleObsAddressed(did, oi);   // closed → open
        Model.updateObsPriority(did, oi, val);                // high | low
      }
      initDeficiencies.render();
      if (window._frtRenderTasks) window._frtRenderTasks();
      if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
      _frtRefreshPinFocusIf(did);
    })();
    return;
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
      // move pin to Site Records (matches v1 behavior for the "this entire
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
        var ctrs = realCtrs(proj.contractors);
        if (ctrs.length) {
          var opts = '';
          ctrs.forEach(function(c) { opts += '<option value="' + esc(c.id) + '">' + esc(ctrLabel(c.name)) + '</option>'; });
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
  if (action === 'obs-contractor') {
    // S142 Batch 4-2: defic-level contractor reassignment from the
    // Detailed list. '' value => Site Records (generalDeficiencies);
    // any contractor id => that contractor. Model.reassignDeficiency is
    // dedup-safe and queues a save; saveNow() + render() mirror the
    // obs-trade path for immediate persistence + regrouping.
    var _cdid = e.target.getAttribute('data-defic-id');
    var _cval = e.target.value || '';
    // S213: shared "+ New contractor…" sentinel (A/B/C). Create-only —
    // rename/delete stay on the roster / Trade Board. After create, assign
    // the new contractor to this pin, then refresh whichever host is open.
    if (_cval === '__new__') {
      var _selEl = e.target;
      showPrompt('New Contractor', 'Contractor name').then(function(_nm) {
        var _name = _nm && _nm.trim();
        if (!_name) {
          // user cancelled — revert the select to the live value
          if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
          if (_cdid) _frtRefreshPinFocusIf(_cdid);
          initDeficiencies.render();
          return;
        }
        var _ctr = Model.addContractor(_name);
        if (_ctr && _cdid) Model.reassignDeficiency(_cdid, _ctr.id);
        Model.saveNow();
        // refresh the open pin editor (B/C) if present, plus the Detailed list
        if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
        if (_cdid) _frtRefreshPinFocusIf(_cdid);
        initDeficiencies.render();
      });
      return;
    }
    if (_cdid) {
      Model.reassignDeficiency(_cdid, _cval || null);
      Model.saveNow();
      if (window._frtRefreshPinEditor) window._frtRefreshPinEditor();
      _frtRefreshPinFocusIf(_cdid);
      initDeficiencies.render();
    }
  }
  if (action === 'obs-trade') {
    var _tdid = e.target.getAttribute('data-defic-id');
    var _toi = parseInt(e.target.getAttribute('data-obs-idx') || '0', 10);
    var _tval = e.target.value || '';
    Model.updateObsTrade(_tdid, _toi, _tval, 'manual');
    Model.saveNow();
    // S247: removed redundant initDeficiencies.render() here. The trade is
    // saved above (updateObsTrade + saveNow). The full-list re-render was
    // pointless while the on-drawing pin editor is open and raced with the
    // viewer's own _peOnModelChange refresh, freezing the photo grid after
    // the first trade change. The Deficiencies list re-renders on next open,
    // so trade grouping stays correct. Pure render-dedup; no data change.
  }
});

// S263: grow a textarea to fit its content (no internal scrollbar). Set height
// to auto first so shrinking works too, then to the content's scrollHeight.
function _cvAutosizeTextarea(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// S263: size all visible auto-grow textareas to their pre-filled content. Call
// after an editor renders so an obs that already has a long note opens at full
// height instead of a scrolled fixed box.
function _cvAutosizeAll(root) {
  var scope = root || document;
  scope.querySelectorAll('textarea.obs-text-input').forEach(_cvAutosizeTextarea);
}

// S263: re-fit the open row's drawing to its (possibly grown) box. Called on a
// DEBOUNCED one-shot timer after typing pauses — NOT a continuous observer
// (that looped and flashed). Re-fits ONLY when the box height actually changed
// since the last fit, so typing that doesn't grow the box (same line count)
// causes NO re-render and NO flash.
var _cvRefitTimer = 0;
var _cvLastDrawBoxH = 0;
function _cvRefitDrawing(deficId) {
  if (!window._frtRenderPinMiniMap) return;
  var f = Model.findDeficiency(deficId);
  if (!f || !f.defic || !f.defic.drawingId) return;
  var d = f.defic;
  var box = document.getElementById('cv-pe-location-thumb');
  if (!box) return;
  // Only re-fit if the box height changed since the last fit — avoids a
  // needless re-render (visible flash) on keystrokes that don't grow the box.
  var h = box.clientHeight;
  if (h === _cvLastDrawBoxH) return;
  _cvLastDrawBoxH = h;
  // rAF so the render reads the box's SETTLED height after the auto-grown
  // textarea reflowed the column.
  requestAnimationFrame(function() {
    if (!document.getElementById('cv-pe-location-thumb')) return;
    try {
      // S328 (#16): fast path — ask the live _PinPan instance to resize in place
      // using its already-decoded image (synchronous canvas redraw, no reload).
      // Only fall back to the full re-decode render if the fast path declines
      // (not mounted / different drawing). The mobile thumb is a static crop, so
      // it always takes the full path — but only one thumb is visible per
      // breakpoint, so the user never sees the slow one.
      var _fast = window._frtResizePinMiniMap && window._frtResizePinMiniMap(d, 'cv-pe-location-thumb');
      if (!_fast) window._frtRenderPinMiniMap(d, 'cv-pe-location-thumb');
      window._frtRenderPinMiniMap(d, 'cv-pe-location-thumb-mobile');
    } catch (e) {}
  });
}
// Debounced wrapper: fires ~350ms after the last keystroke so the box has
// settled at its new height, then re-fits once (if the height changed).
function _cvRefitDrawingDebounced(deficId) {
  if (_cvRefitTimer) clearTimeout(_cvRefitTimer);
  _cvRefitTimer = setTimeout(function() { _cvRefitDrawing(deficId); }, 350);
}

// Observation text editing with debounce
var _noteDebounce = {};
document.addEventListener('input', function(e) {
  var action = e.target.getAttribute && e.target.getAttribute('data-action');

  if (action === 'obs-text') {
    // S263: auto-grow the comment box to fit its content — no internal scroll,
    // no fixed height. The whole left column gets taller as you type, like the
    // photo box growing when photos are added.
    _cvAutosizeTextarea(e.target);
    var deficId = e.target.getAttribute('data-defic-id');
    // S328 (#16): smoothly track the drawing to the box as the comment box grows
    // or shrinks. _cvAutosizeTextarea just reflowed the column, so the drawing box
    // has a new height THIS frame. Ask _PinPan to resize in place (synchronous,
    // no image reload) on the next animation frame — this makes expand/contract
    // butter-smooth instead of waiting ~350ms for the debounced full refit. The
    // resizeInPlace short-circuits when the box didn't actually change, so this is
    // free on keystrokes that don't grow the box. The debounced _cvRefitDrawing
    // below still runs once on settle as the authoritative fit / static-thumb path.
    if (window._frtResizePinMiniMap) {
      var _rfd = Model.findDeficiency(deficId);
      if (_rfd && _rfd.defic) {
        var _rfDefic = _rfd.defic;
        requestAnimationFrame(function() {
          try { window._frtResizePinMiniMap(_rfDefic, 'cv-pe-location-thumb'); } catch (_) {}
        });
      }
    }
    // S263: the box grows with the comment, so re-fit the drawing once typing
    // pauses (debounced one-shot — never a continuous observer, which looped).
    _cvRefitDrawingDebounced(deficId);
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
    // S328 (#18): live-update the collapsed-row title for THIS obs as the user
    // types — previously it only refreshed on the next full render (blur / click
    // outside), so the card summary visibly lagged. Targeted in-place text swap,
    // no render, no save (the 500ms debounce above still persists to the model).
    try {
      var _row = document.querySelector('.dfx-obsrow[data-defic-id="' +
        (window.CSS && CSS.escape ? CSS.escape(deficId) : deficId) +
        '"][data-obs-idx="' + obsIdx + '"]');
      if (_row) {
        var _title = _row.querySelector('.dfx-or-title');
        if (_title) {
          if (text) {
            _title.textContent = text;
            _title.classList.remove('dfx-or-title-empty');
          } else {
            _title.textContent = '\u2014';
            _title.classList.add('dfx-or-title-empty');
          }
        }
      }
    } catch (_e) { /* cosmetic only — never block typing */ }
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
// S284c (Mark): the returned typing-flash root cause. The S263 fix guarded
// 'saved' and 'photo', but THIS listener stayed unguarded — and 'project'
// now fires from background merge-applies (heartbeat pulls, multi-tab 412
// merges), which land mid-keystroke and rebuild the list: flash + focus
// loss + drawing redraw. Same guard as the listeners below; the dropped
// render is recovered by the next 'saved' tick.
Model.onChange('project', function() {
  var ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) {
    if (ae.classList && ae.classList.contains('obs-text-input')) return;
    if (ae.closest('#tab-deficiencies, #deficiencies-container, .defic-item, .defic-list, .defic-pin-group, .cv-row, .cv-ed-left')) return;
  }
  // S328 (#19): a background cloud-heartbeat merge fires 'project'. If the user
  // has a card expanded and isn't editing, don't tear the list down + rebuild it
  // (the "flash with no input"). Defer; the next deliberate render reconciles.
  if (_openObsKey) { _cvDeferredBgRender = true; return; }
  initDeficiencies.render();
});
// S115 P9: also re-render when photos change (e.g., markup save/revert mutates
// r2Key/r2Url on defic photos — without this hook the defic tab keeps showing
// the old image because the DOM never refreshes).
// S119 Bug 1: same focus guard as the 'saved' listener below — don't yank
// the textarea out from under a typing user just because a photo finished
// uploading in some other card.
Model.onChange('photo', function() {
  var ae = document.activeElement;
  // S327: guard brought to PARITY with the project/saved/inspectors guards.
  // Previously this omitted SELECT and the .defic-pin-group container, so a
  // photo event landing while the user typed a comment inside a pin-group card
  // (or had a priority/contractor SELECT open) rebuilt the list mid-interaction
  // → flash + focus loss. Same drop-and-recover policy as the others.
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) {
    // S263 FIX: include the combined-view DOM (see the 'saved' guard below) so
    // a photo finishing upload elsewhere doesn't rebuild the list out from
    // under a user typing a comment in the combined view.
    if (ae.classList && ae.classList.contains('obs-text-input')) return;
    if (ae.closest('#tab-deficiencies, #deficiencies-container, .defic-item, .defic-list, .defic-pin-group, .cv-row, .cv-ed-left')) return;
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
    if (_recHoldUntilNav) return;  // S150g: a rec star was just toggled — keep the
                                   // card put; the next deliberate render resettles it
    if (_cvPinDragHold) {          // S328: a card-editor pin drag just saved — skip
      _cvPinDragHold = false;      // this one render so the expanded card doesn't
      return;                      // flash (collapse→reopen). One-shot.
    }
    // S263 FIX: the focus guard must cover the COMBINED-VIEW DOM. The combined
    // view renders into #deficiencies-container with .cv-row / .cv-ed-left /
    // .obs-text-input — NONE of which matched the old selector list
    // (.defic-item/.defic-list/.defic-pin-group from the legacy detailed view).
    // So when a user typed in a combined-view comment box, closest() returned
    // null, the guard did NOT fire, and this 300ms-debounced render rebuilt the
    // list mid-typing — destroying the textarea (focus loss → retype), re-
    // rendering the drawing (flash), and occasionally restoring a just-deleted
    // character (stale rebuild). Guarding on the editable element itself (plus
    // the live container) is robust against container-class drift.
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) {
      if (ae.classList && ae.classList.contains('obs-text-input')) return;  // typing a comment
      var inDefic = !!ae.closest('#tab-deficiencies, #deficiencies-container, .defic-item, .defic-list, .defic-pin-group, .cv-row, .cv-ed-left');
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
  // follows is unchanged in PROD — still routed through R2.uploadPhoto which
  // goes through UploadQueue (S130 5.1) for concurrency control.
  //
  // S170 (Fix A): under ?staging=1 the upload is routed through BinaryOutbox
  // instead. PROD behavior is byte-for-byte unchanged. The two branches
  // share the same compression + addObservationPhoto preamble; only the
  // R2-side enqueue differs.
  ImageWorkerHost.compressFile(file, { maxW: 1600, quality: 0.8 })
    .then(function(r) {
      var photo = Model.addObservationPhoto(deficId, obsIdx, r.dataUrl);
      initDeficiencies.render();
      toast('Photo added');
      var pid = new URLSearchParams(window.location.search).get('project');
      if (!(pid && photo)) return;

      // ── S170 Fix A branch: outbox path (staging only) ──
      if (BinaryOutbox && BinaryOutbox.isEnabled && BinaryOutbox.isEnabled()) {
        BinaryOutbox.enqueue({
          photo: photo,
          projectId: pid,
          deficId: deficId,
          obsIdx: obsIdx,
          type: 'original'
        }).then(function(rowId) {
          // No toast here — the outbox processor will toast on R2
          // confirm or failure. Logging only.
          console.log('[Deficiencies] Enqueued to BinaryOutbox:', rowId,
                      'photo:', photo && photo.id);
        }).catch(function(err) {
          // Enqueue itself failed (IDB write error, blob conversion
          // failed). Fall back to Fix D's flag set so the photo is
          // marked failed and the user is alerted.
          console.warn('[Deficiencies] BinaryOutbox.enqueue failed:', err);
          try {
            photo._r2UploadFailed = true;
            photo._r2UploadError = (err && err.message) || String(err);
            photo._r2UploadFailedAt = new Date().toISOString();
            Model.saveNow();
          } catch (_) {}
          var em3 = (err && err.message) || 'unknown error';
          if (em3.length > 60) em3 = em3.slice(0, 57) + '\u2026';
          toast('\u26A0 Photo enqueue failed: ' + em3, 8000);
        });
        return;
      }

      // ── PROD path: current behavior, unchanged from Fix D ──
      R2.uploadPhoto(pid, photo, 'original').then(function() {
        Model.saveNow(); // Save updated r2Key/r2Url
      }).catch(function(r2err) {
        // S164 Fix D (V-7): R2 PUT failure was previously an unhandled
        // promise rejection — photo lived locally with r2Key:null
        // indefinitely, inspector had no signal, next cloud pull (which
        // wholesale replaces state) could silently erase it. Now we
        // mark the photo, persist the flag across reload, and surface
        // the failure. This is belt-and-suspenders for Fix A (S166+);
        // the model field `_r2UploadFailed` becomes the input signal
        // for the future outbox retry logic.
        try {
          photo._r2UploadFailed = true;
          photo._r2UploadError = (r2err && r2err.message) || String(r2err);
          photo._r2UploadFailedAt = new Date().toISOString();
        } catch(_) {}

        // Diagnostic ring buffer — outbox-precursor. Mark can read via
        //   window._frt_r2Failures
        // in DevTools console. Cap at 50 to bound memory under burst
        // failure (offline burst, R2 worker down, etc.).
        try {
          var buf = (window._frt_r2Failures = window._frt_r2Failures || []);
          buf.push({
            photoId: photo && photo.id,
            pid: pid,
            when: photo && photo._r2UploadFailedAt,
            error: photo && photo._r2UploadError
          });
          while (buf.length > 50) buf.shift();
        } catch(_) {}

        console.warn('[Deficiencies] R2 upload failed:', r2err, 'photo:', photo && photo.id);

        var em2 = (photo && photo._r2UploadError) || 'unknown error';
        if (em2.length > 60) em2 = em2.slice(0, 57) + '\u2026';
        toast('\u26A0 Photo cloud upload failed: ' + em2, 8000);

        // Force-persist the failure flag — the upstream Model.addObservationPhoto
        // already scheduled a debounced save, but if reload/navigation
        // intervenes before debounce fires, the _r2UploadFailed flag
        // would not reach IDB. saveNow() guarantees persistence so
        // future Fix A retry logic can pick this photo up after reload.
        try { Model.saveNow(); } catch(_) {}
      });
    })
    .catch(function(err) {
      // S161 P3: replace silent console.warn with a long-duration toast
      // that surfaces the failure to the inspector in the field. Embeds
      // image-worker diagnostic state inline so a screenshot of the
      // toast tells us why compression failed (worker died, fell back to
      // main thread, browser ran low on memory, etc.) without needing
      // dev console access on the tablet. Error message capped at 60
      // chars because toast.js uses white-space:nowrap and we don't
      // want the toast to overflow off-screen.
      var em = (err && err.message) || 'unknown error';
      if (em.length > 60) em = em.slice(0, 57) + '\u2026';
      var d = (window._frt_imageWorker && window._frt_imageWorker._diag) || {};
      var bits = ['worker:' + (d.workerOK ? 'OK' : 'down')];
      if (typeof d.fallbackCount === 'number') bits.push('fb:' + d.fallbackCount);
      if (typeof performance !== 'undefined' && performance.memory) {
        var used = Math.round(performance.memory.usedJSHeapSize / 1048576);
        var lim = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
        bits.push('mem:' + used + '/' + lim + 'MB');
      }
      console.warn('[Deficiencies] photo compression failed:', err, d);
      toast('\u26A0 Photo failed: ' + em + ' \u00B7 ' + bits.join(' \u00B7 '), 8000);
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

  // S317 (Mark): merged "Add Photos" button — one button for both upload AND
  // camera, matching the Photo Gallery's single Add Photos. Burst camera is the
  // primary path; if unsupported/denied (desktop), fall back to the file picker so
  // the single button always lets you add photos. Mirrors photos.js site-photo-add-btn.
  if (action === 'photo-add') {
    var addDeficId = el.getAttribute('data-defic-id');
    if (!addDeficId) return;
    _photoTargetDeficId = addDeficId;
    _photoTargetObsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');
    (function(tgtDefic, tgtObs) {
      function _filePick() {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.onchange = function() {
          if (!inp.files || !inp.files.length) return;
          for (var i = 0; i < inp.files.length; i++) _compressAndAdd(inp.files[i], tgtDefic, tgtObs);
        };
        inp.click();
      }
      openCameraBurst().then(function(files) {
        if (files === null) { _filePick(); return; } // unsupported/denied → upload fallback
        for (var i = 0; i < files.length; i++) _compressAndAdd(files[i], tgtDefic, tgtObs);
      }).catch(function(){ _filePick(); });
    })(_photoTargetDeficId, _photoTargetObsIdx);
    return;
  }
  if (action === 'photo-upload' || action === 'photo-camera') {
    var deficId = el.getAttribute('data-defic-id');
    if (!deficId) return;
    _photoTargetDeficId = deficId;
    _photoTargetObsIdx = parseInt(el.getAttribute('data-obs-idx') || '0');

    // S284 (Mark): the Camera button now opens the continuous in-app burst
    // camera — shoot any number of photos, Done adds them all at once. This
    // replaces the single-shot capture-input round-trip documented as the
    // S159 limitation below. Because the pin editor and the focused modal
    // host the SAME _buildObsEditor markup handled by this delegate (S213),
    // every camera button in the app gets burst capture from this one hook.
    // Contract: File[] → feed the normal pipeline; [] → user cancelled,
    // no-op; null → camera unsupported/denied → tell the user (we must NOT
    // auto-click a capture input here: the user gesture is gone by then and
    // gesture-gated capture clicks are silently blocked — S159 V-7 lesson).
    if (action === 'photo-camera') {
      (function(tgtDefic, tgtObs) {
        openCameraBurst().then(function(files) {
          if (files === null) { toast('Camera unavailable \u2014 use the Upload button instead'); return; }
          for (var i = 0; i < files.length; i++) {
            _compressAndAdd(files[i], tgtDefic, tgtObs);
          }
        });
      })(_photoTargetDeficId, _photoTargetObsIdx);
      return;
    }

    // S159: native HTML5 <input type=file capture> is single-shot by design.
    // The S159 V-7 attempt to re-fire via setTimeout was blocked by browser
    // user-gesture security policies (Android Chrome / iOS Safari both
    // require input.click() to happen during a real user-gesture event).
    // True multi-shot needs a custom getUserMedia + <video> camera — which
    // is now cameraBurst.js (S284) on the photo-camera branch above; this
    // input path remains for photo-upload (file picker).
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
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

// ── S142 §2: pick-mode click-away + trade-menu outside-close ──
// Capture phase so it runs BEFORE the bubble action dispatch. In
// pick-mode, a click that is NOT on a trade pill / ⊕ / the pick bar
// cancels the pick (faithful to the approved demo). Independently, any
// click outside the open "+ trade ▾" menu closes it. Guarded to no-op
// when neither is active, so it never interferes with other views.
document.addEventListener('click', function(e) {
  var _cm = document.getElementById('crx-trade-menu');
  if (_cm && _cm.classList.contains('crx-open')
      && !(e.target.closest && e.target.closest('.crx-addtrade-wrap'))) {
    _cm.classList.remove('crx-open');
  }
  if (!_pickCtrId) return;
  if (e.target.closest && (e.target.closest('.crx-tpill')
      || e.target.closest('.crx-addbtn') || e.target.closest('.crx-pickbar')
      || e.target.closest('.crx-cc')
      || e.target.closest('[data-bv="card"]'))) return;  // S153 B2/B3: trade pills, the whole contractor card, and Board cards are all valid pick-mode surfaces — don't auto-cancel
  _pickCtrId = null;
  initDeficiencies.render();
}, true);

// S142 §2: Esc cancels pick-mode. Only acts when _pickCtrId is set
// (Contractor Roster pick-mode) — never active in the drawing viewer,
// so it cannot conflict with the viewer's tool/copy Escape rule. Bubble
// phase + no stopPropagation so other Esc handlers still receive it.
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && _pickCtrId) {
    _pickCtrId = null;
    initDeficiencies.render();
  }
});

// ════════════════════════════════════════════════════════════════════
// S153 Batch 2 — Board dual-input move (drag + tap-to-move + armed-assign)
// ════════════════════════════════════════════════════════════════════
// Locked spec §1: every move works BOTH by desktop drag-and-drop AND by
// tablet tap-to-move. Tap a card → it's selected (_bvSel) → tap a
// priority column (lane + priority) or a lane banner / empty lane area
// (lane only, priority kept) to move it. Drag does the same via column
// drop targets. Trades stay tap-only (their own pill/menu, never drag).
// Contractor reassign = the existing roster ClickAssign: arm a
// contractor's ⊕ then click a Board card → that pin reassigns to the
// contractor (the §1 "click a card" path; the trade-pill-while-armed
// path is unchanged and handled elsewhere). Lane moves RE-DERIVE
// classification through the real Model APIs (class is never stored):
//   → REC     : setObsRecommendation(true)
//   → DEFIC   : setObsRecommendation(false)  (no contractor ⇒ still a
//               Site Record by derivation — the toast says so)
//   → SITEREC : setObsRecommendation(false) + reassignDeficiency(null)
// Priority/closed (column targets only), per observation:
//   closed column   : toggleObsAddressed → addressed
//   priority column : if addressed, toggleObsAddressed (reopen) then
//                     updateObsPriority(targetPriority)
// Every op is a real Model method (queue-save + notify); one
// initDeficiencies.render() repaints. oi<0 legacy 0-obs pins are not
// moveable — open them via ↗ to edit. All listeners are document-level
// delegates, so they survive every re-render with no per-element
// rebinding (FRT pattern), and bail unless the Board view is active.
var _bvDragOverEl = null;
function _bvHasCtr(id) {
  var f = Model.findDeficiency(id);
  return !!(f && f.contractor);
}
function _bvObsAt(id, oi) {
  var f = Model.findDeficiency(id);
  if (!f || !f.defic) return null;
  var obs = f.defic.observations || [];
  return (oi >= 0 && obs[oi]) ? obs[oi] : null;
}
function _bvClearDrag() {
  _bvDrag = null;
  if (_bvDragOverEl) { _bvDragOverEl.classList.remove('dfx-bv-dragover'); _bvDragOverEl = null; }
  document.querySelectorAll('.dfx-bv-dragging').forEach(function(n) { n.classList.remove('dfx-bv-dragging'); });
  document.querySelectorAll('.dfx-bv-dragover').forEach(function(n) { n.classList.remove('dfx-bv-dragover'); });
}
function _bvApplyMove(id, oi, toLane, toPri) {
  if (!(oi >= 0)) { toast('\u26A0 This legacy pin has no observation to move \u2014 open it (\u2197) to edit.'); return; }
  var ob = _bvObsAt(id, oi);
  if (!ob) { toast('\u26A0 Observation no longer exists'); _bvSel = null; initDeficiencies.render(); return; }
  var msg = [];
  // ── lane (classification is derived; we set the real flags) ──
  if (toLane === 'REC') {
    if (!ob.isRecommendation) { Model.setObsRecommendation(id, oi, true); msg.push('\u2192 Recommendation'); }
  } else if (toLane === 'DEFIC') {
    if (ob.isRecommendation) { Model.setObsRecommendation(id, oi, false); msg.push('\u2192 Deficiency'); }
    if (!_bvHasCtr(id)) msg.push('no contractor \u2014 still a Site Record (use the roster \u2295 to assign one)');
  } else if (toLane === 'SITEREC') {
    if (ob.isRecommendation) Model.setObsRecommendation(id, oi, false);
    if (_bvHasCtr(id)) { Model.reassignDeficiency(id, null); msg.push('\u2192 Site Record (contractor cleared for this pin)'); }
    else msg.push('\u2192 Site Record');
  }
  // ── priority / closed (column targets only) ──
  if (toPri) {
    var ob2 = _bvObsAt(id, oi);   // re-read: a rec/contractor move may have re-homed the defic
    if (ob2) {
      if (toPri === 'closed') {
        if (!ob2.addressed) { Model.toggleObsAddressed(id, oi); msg.push('\u2192 Closed'); }
      } else {
        if (ob2.addressed) Model.toggleObsAddressed(id, oi);
        if ((ob2.priority || 'high') !== toPri || ob2.addressed) {
          Model.updateObsPriority(id, oi, toPri); msg.push('priority \u2192 ' + toPri);
        }
      }
    }
  }
  _bvSel = null;
  initDeficiencies.render();
  toast(msg.length ? ('\u2714 ' + msg.join(' \u00B7 ')) : '\u2714 No change');
}

document.addEventListener('click', function(e) {
  // S191: the early Board-view bail was blocking the roster ClickAssign
  // arming path in Detailed and Table views (the roster strip renders in
  // ALL views — `_renderTradeBoard` is called before the view dispatch).
  // Each downstream path is self-gated:
  //   - Board card click  → `card` is null outside Board view (no [data-bv="card"])
  //   - Reassign-with-sel → `_bvSel` is only ever set by a Board card click
  //   - Trade-pill-with-sel → same `_bvSel` guard
  //   - Arming on .crx-cc  → the only path we WANT active in every view
  var card = e.target.closest && e.target.closest('[data-bv="card"]');
  // S205c (Mark): board card interaction model —
  //   tap card body → OPEN the pin editor (was: arm _bvSel)
  //   ↗ (bv-arm)    → arm assign mode; tap a contractor/trade next, auto-off
  //   photo         → open-lightbox (handled by its own dispatch; excluded here)
  //   ★ / trade pill→ their own handlers
  // Desktop drag (dragstart/drop) still moves lanes; on touch, ↗-arm + tap a
  // column moves it (the armed-card column path below is unchanged).
  if (card) {
    var id = card.getAttribute('data-bv-id');
    var oi = parseInt(card.getAttribute('data-bv-oi'), 10);
    if (e.target.closest('[data-action="toggle-rec"]')
      || e.target.closest('.dfx-bv-card-trade')
      || e.target.closest('[data-action="bv-swap"]')
      || e.target.closest('[data-action="open-lightbox"]')) {
      // ⇄ swap: Deficiency ↔ Recommendation (the rarer move; no long drag).
      // A Site-Record card has no contractor → switching to "Deficiency"
      // leaves it a Site Record (the move handler explains), so the chooser
      // only shows on DEFIC/REC cards (see card render guard).
      var swapBtn = e.target.closest('[data-action="bv-swap"]');
      if (swapBtn) {
        if (!(oi >= 0)) { toast('\u26A0 Open this pin to edit \u2014 it has no observation.'); return; }
        var curLane = swapBtn.getAttribute('data-cur-lane');
        _bvApplyMove(id, oi, curLane === 'REC' ? 'DEFIC' : 'REC', null);
      }
      return;   // own handlers
    }
    if (e.target.closest('[data-action="bv-arm"]')) {                 // ↗ → arm assign (toggle)
      if (!(oi >= 0)) { toast('\u26A0 Open this pin to edit \u2014 it has no observation to assign.'); return; }
      _pickCtrId = null;
      if (_bvSel && _bvSel.id === id && _bvSel.oi === oi) _bvSel = null;
      else _bvSel = { id: id, oi: oi };
      initDeficiencies.render();
      return;
    }
    if (_pickCtrId) {                         // §1: armed roster ⊕ + click card → reassign the pin
      Model.reassignDeficiency(id, _pickCtrId);
      _pickCtrId = null; _bvSel = null;
      initDeficiencies.render();
      var _c = Model.findDeficiency(id);
      toast('\u2714 Assigned to ' + ((_c && _c.contractor && _c.contractor.name) || 'contractor'));
      return;
    }
    _openPinFocus(id, (oi >= 0) ? oi : undefined);   // plain card-body tap → OPEN pin editor
    return;
  }
  // S153 B3 (Mark): with NO Board card selected, tapping a contractor
  // card body arms it (replaces the removed ⊕); tapping the armed one
  // again disarms. The next trade-pill tap then adds that trade via the
  // existing crx-pill handler. Inner controls keep their own handlers.
  if (!_bvSel) {
    var armCc = e.target.closest && e.target.closest('.crx-cc[data-crx-ctr]');
    if (armCc && !(e.target.closest('[data-action]') || e.target.closest('button'))) {
      var _aid = armCc.getAttribute('data-crx-ctr');
      _pickCtrId = (_pickCtrId === _aid) ? null : _aid;
      initDeficiencies.render();
      return;
    }
    return;                                   // nothing selected & not arming → nothing to place
  }
  // S153 B2.1 (Mark): inverted contractor-assign. With a card selected,
  // tapping the WHOLE contractor roster card (its body — not its inner
  // ⊕ / rename / delete / × controls, which keep their own handlers)
  // reassigns the selected card's pin to that contractor. Easier than
  // the tiny ⊕ on a field tablet; the §1 ⊕-arm-then-click-card path is
  // unchanged and still works.
  var ccEl = e.target.closest && e.target.closest('.crx-cc[data-crx-ctr]');
  if (ccEl && !(e.target.closest('[data-action]') || e.target.closest('button'))) {
    var _cid = ccEl.getAttribute('data-crx-ctr');
    var _sid = _bvSel.id;
    Model.reassignDeficiency(_sid, _cid);
    _bvSel = null;
    initDeficiencies.render();
    var _ac = Model.findDeficiency(_sid);
    toast('\u2714 Assigned to ' + ((_ac && _ac.contractor && _ac.contractor.name) || 'contractor'));
    return;
  }
  // S153 B3 (Mark): with a Board card selected, tapping a roster trade
  // pill sets THAT observation's trade. DECOUPLED — never silently
  // mutates the contractor's roster (fat-finger guard, Mark's call). If
  // the trade is new to the card's contractor, offer a one-tap add. The
  // legacy armed-contractor + trade-pill path still wins when a
  // contractor is armed (_pickCtrId).
  var tpEl = e.target.closest && e.target.closest('.crx-tpill[data-trade]');
  if (tpEl && !_pickCtrId && !(e.target.closest && e.target.closest('.crx-px'))) {
    var _tr = tpEl.getAttribute('data-trade');
    var _tsid = _bvSel.id, _tsoi = _bvSel.oi;
    if (!(_tsoi >= 0)) { toast('\u26A0 Open this pin (\u2197) to edit \u2014 no observation to set a trade on.'); return; }
    Model.updateObsTrade(_tsid, _tsoi, _tr);
    var _tf = Model.findDeficiency(_tsid);
    var _tc = _tf && _tf.contractor;
    _bvSel = null;
    initDeficiencies.render();
    if (_tc && (_tc.trades || []).indexOf(_tr) < 0) {
      showConfirm('Add to contractor roster?',
        'Set this observation\u2019s trade to \u201c' + _tr + '\u201d. ' + (ctrLabel(_tc.name) || 'This contractor') +
        ' isn\u2019t listed for \u201c' + _tr + '\u201d yet \u2014 add it to their roster too? (No keeps the observation\u2019s trade and leaves the roster unchanged.)')
        .then(function(yes) {
          if (yes) { Model.addContractorToTrade(_tc.id, _tr); initDeficiencies.render(); toast('\u2714 Trade \u2192 ' + _tr + ' \u00B7 ' + ctrLabel(_tc.name) + ' added to ' + _tr); }
          else toast('\u2714 Observation trade \u2192 ' + _tr);
        });
    } else {
      toast('\u2714 Observation trade \u2192 ' + _tr);
    }
    return;
  }
  var colEl = e.target.closest && e.target.closest('.dfx-bv-col');
  if (colEl) {
    var laneEl = colEl.closest('.dfx-lane-sec');
    _bvApplyMove(_bvSel.id, _bvSel.oi,
      laneEl ? laneEl.getAttribute('data-cls') : null,
      colEl.getAttribute('data-bv-pri'));
    return;
  }
  // S217: tap into the Site Records rail = archive (clears contractor).
  var railEl = e.target.closest && e.target.closest('.dfx-rail-sec');
  if (railEl) {
    _bvApplyMove(_bvSel.id, _bvSel.oi, 'SITEREC', null);
    return;
  }
  var laneOnly = e.target.closest && e.target.closest('.dfx-lane-sec');
  if (laneOnly) {                             // lane banner / empty lane area = lane change only
    _bvApplyMove(_bvSel.id, _bvSel.oi, laneOnly.getAttribute('data-cls'), null);
  }
});

document.addEventListener('dragstart', function(e) {
  if (_deficView !== 'board') return;
  var card = e.target.closest && e.target.closest('[data-bv="card"][draggable="true"]');
  if (!card) return;
  var oi = parseInt(card.getAttribute('data-bv-oi'), 10);
  if (!(oi >= 0)) return;
  _bvDrag = { id: card.getAttribute('data-bv-id'), oi: oi };
  card.classList.add('dfx-bv-dragging');
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', _bvDrag.id); } catch (e2) {}
});
document.addEventListener('dragover', function(e) {
  if (!_bvDrag) return;
  // S217: a board column OR the Site Records rail are both valid drop zones.
  var col = e.target.closest && e.target.closest('.dfx-bv-col');
  var rail = col ? null : (e.target.closest && e.target.closest('.dfx-rail-drop, .dfx-rail-sec'));
  var zone = col || rail;
  if (!zone) return;
  e.preventDefault();
  try { e.dataTransfer.dropEffect = 'move'; } catch (e3) {}
  if (_bvDragOverEl && _bvDragOverEl !== zone) _bvDragOverEl.classList.remove('dfx-bv-dragover');
  zone.classList.add('dfx-bv-dragover');
  _bvDragOverEl = zone;
});
document.addEventListener('drop', function(e) {
  if (!_bvDrag) return;
  var col = e.target.closest && e.target.closest('.dfx-bv-col');
  var rail = col ? null : (e.target.closest && e.target.closest('.dfx-rail-drop, .dfx-rail-sec'));
  if (!col && !rail) { _bvClearDrag(); return; }
  e.preventDefault();
  var d = _bvDrag;
  _bvClearDrag();
  if (rail) {                                  // drop into the rail = archive to Site Records
    _bvApplyMove(d.id, d.oi, 'SITEREC', null);
    return;
  }
  var laneEl = col.closest('.dfx-lane-sec');
  _bvApplyMove(d.id, d.oi, laneEl ? laneEl.getAttribute('data-cls') : null, col.getAttribute('data-bv-pri'));
});
document.addEventListener('dragend', function() { _bvClearDrag(); });

// Esc clears a pending Board selection / in-flight drag (bubble phase, no
// stopPropagation — consistent with the S142 pick-mode Esc rule).
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && (_bvSel || _bvDrag)) {
    _bvSel = null; _bvClearDrag();
    initDeficiencies.render();
  }
});
// End S153 Batch 2 ───────────────────────────────────────────────────

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

// S213: the shared unified observation editor renderer, exported so the
// drawing-pin editor (viewer.js _openPinEditor) and the focused-pin modal
// can host the SAME editor as A's Detailed card. Pass {withHeader:true,
// pinNum, onDrawingLink} for B/C. All dfx-*/obs-* markup it emits is handled
// by the document-level data-action delegates in this file, so the editor
// persists identically wherever it is mounted (no per-host re-binding).
window._frtBuildObsEditor = function(d, oi, ctrId, opts) {
  return _buildObsEditor(d, oi, ctrId, opts || {});
};

// S328 (Mark): the pin-editor FOOTER Delete button (viewer.js #pe-delete) routes
// here. Deletes only the current obs (or the whole pin if it's the last obs),
// always letting the inspector choose the fate of that obs's unique photos
// (move to Site Records / delete / cancel). afterFn = refresh editor onto a
// valid obs after an obs removal; afterPinDeleteFn = close the editor + repaint
// pins/tasks after a whole-pin delete.
window._frtConfirmDeleteObsOrPin = function(deficId, obsIdx, afterFn, afterPinDeleteFn) {
  _confirmDeleteObsOrPin(deficId, obsIdx, afterFn, afterPinDeleteFn);
};

// S151 (Mark): lets the drawing viewer's single-route "← Back to pin #N"
// chip reopen the focused-pin modal the user jumped FROM. Pairs with
// _frtSetReturnPin / _frtClearReturnPin in viewer.js. Not a nav-stack.
// S266: optional obsIdx — the gallery jump focuses a specific observation.
// Existing single-arg callers (viewer.js) pass no obsIdx → whole pin (unchanged).
window._frtOpenPinFocus = function(deficId, obsIdx) {
  _openPinFocus(deficId, (obsIdx != null && !isNaN(obsIdx)) ? obsIdx : undefined);
};
// S216: expose the proven pin-to-pin photo mover so the gallery (photos.js) can
// reuse it for defic photos. Same binary-sharing path (_createDeficPhotoFromSource);
// no R2 re-upload, no URL copying.
window._frtOpenPinPhotoPicker = function(deficId, obsIdx, photoId) { _openPinPhotoPicker(deficId, obsIdx, photoId); };
// S224: open the picker for a SITE (gallery) photo source → choose a pin.
window._frtOpenSitePhotoPicker = function(siteIdx) { _openPinPhotoPicker(null, null, null, { siteIdx: siteIdx }); };
// S224: undo a faded move/copy by token, then repaint the gallery.
window._frtUndoPhotoMove = function(token) { if (Model.undoPhotoMove(token)) { if (window.initPhotos && initPhotos.render) initPhotos.render(); if (window.initDeficiencies && initDeficiencies.render) initDeficiencies.render(); toast('Move undone'); } };

// S210 (Mark): exact-row return for the drawing viewer's "← Back to pin #N"
// chip when the jump began on the Detailed list. Lands the user back on the
// EXACT observation row they launched from — Detailed view, that obs row
// expanded and scrolled into view — rather than a focus modal popping over
// the list. obsIdx null/absent → just scroll to the pin's card (no specific
// row expanded). Mirrors _dfxGotoPin's render+scroll pattern.
window._frtOpenDetailedRow = function(deficId, obsIdx) {
  if (!deficId) return;
  _deficView = 'detailed';
  // Expand the target observation row BEFORE rendering so it paints open
  // (expand-one-at-a-time state). Only when an obs index was captured.
  if (obsIdx != null && !isNaN(obsIdx) && typeof _obsKey === 'function') {
    _openObsKey = _obsKey(deficId, obsIdx);
  }
  initDeficiencies.render();
  setTimeout(function() {
    var escId = (window.CSS && CSS.escape) ? CSS.escape(deficId) : deficId;
    var row = (obsIdx != null && !isNaN(obsIdx))
      ? document.querySelector('#deficiencies-container .dfx-obsrow[data-defic-id="' + escId + '"][data-obs-idx="' + obsIdx + '"]')
      : null;
    var target = row || document.querySelector('#deficiencies-container [data-defic-id="' + escId + '"]');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('dfx-flash');
      setTimeout(function() { target.classList.remove('dfx-flash'); }, 1400);
    }
  }, 60);
};

