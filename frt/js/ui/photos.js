/**
 * ARENCON FRT v2 — Photos UI
 * Full photo gallery: site photos + deficiency photos, grouped by source.
 * Upload zone with drag-drop, camera, and import buttons.
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm, showAlert } from '../shared/dialogs.js';
import { Auth } from '../shared/auth.js';
import { R2 } from '../data/r2.js';
import { proveBurstShot, runSerial, uploadFromStore } from '../data/photoIngest.js'; // S716: ONE intake shared with deficiencies
import { IDB } from '../data/idb.js';
import { ImageWorkerHost } from '../workers/imageWorkerHost.js';
import { openCameraBurst } from './cameraBurst.js'; // S284: continuous in-app camera (Mark) — also sets window.openCameraBurst for the engine (S479e)
import { PhotoInput } from '../../../lib/ui/photoInput.js'; // S479e: THE shared photo surface — gallery renders this one, not its own
import { openInProject } from './photoNav.js'; // S677: ONE project-wide photo running order, shared by every surface

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// S431: display-layer host rewrite (same as lightbox's _r2Host). Local model
// layers still hold r2Urls on the retired worker host; the live host is
// files.arencon.app (S391). Rewrites ONLY the string used to paint a tile —
// never mutates the stored model. No-op on data:/blob:/current-host strings.
function _r2h(u) {
  if (!u || typeof u !== 'string') return u;
  if (u.indexOf('arencon-r2-worker.hezhendong999.workers.dev') === -1) return u;
  return u.replace('arencon-r2-worker.hezhendong999.workers.dev', 'files.arencon.app');
}

// ── S114 Push 1.2: gallery state ──
// Filter mode mirrors v1: 'all' | 'site' | 'deficiency' | 'general'
//   site       = top-level proj.photos
//   deficiency = defic photos where defic.priority is not 'general'
//   general    = defic photos where defic.priority is 'general'
var _filterMode = 'all';
// S265 Photo-Trash Phase 1 (stage 1): top-level sub-tab within the Photos panel.
//   'all'   = the live gallery (existing behaviour)
//   'trash' = Recently Deleted — soft-deleted DEFIC pool photos (site photos
//             join in stage 2). Display-only countdown; restore via restorePoolPhoto.
var _photoTab = 'all';
// S687: ONE retention number for the whole toolkit, read from the shared law
// rather than typed here a second time. FRT and the shared law both said 90;
// two copies of a number that must agree is how they stop agreeing. Falls back
// to 90 only so the panel still renders a sensible countdown if the script has
// not arrived — the destructive sweep itself refuses outright without it.
var _TRASH_RETENTION_DAYS = (typeof window !== 'undefined' && window.PhotoRetention)
  ? window.PhotoRetention.DEFAULT_RETENTION_DAYS : 90;
// S265 stage 2: project id this session has already auto-purged (run-once guard).
var _purgedForProjectId = null;
var _selectedUids = new Set();
var _filterPanelOpen = false;
// S114 P1.3: anchor for shift-click range select. Stores the last toggled UID
// in render order, so a shift-click can compute a range from anchor → target.
var _lastSelectedUid = null;
var _renderOrderUids = []; // refreshed every render() in display order

// S439: Recently-Deleted grid multi-select (mirrors the S114 gallery pattern).
var _trashSelected = new Set();
var _trashLastSel = null;
var _trashOrder = []; // uid render order for shift-click ranges
function _trashUid(r) { return r.kind === 'site' ? ('s:' + r.siteIdx) : ('d:' + r.deficId + ':' + r.photoId); }
// S43x: on-photo action icons for Recently Deleted tiles (restore = green, delete = red via CSS).
var IC_RESTORE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/></svg>';
var IC_TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';

// S114 P1.4: render debounce. Cloud pull every 30s fires a 'project' notify,
// which would otherwise rebuild the entire gallery DOM on every poll, causing
// visible flashes during scroll. RAF-coalesce + skip if panel not visible.
var _renderRafId = 0;
function _scheduleRender() {
  if (_renderRafId) return;
  _renderRafId = requestAnimationFrame(function() {
    _renderRafId = 0;
    var panel = document.getElementById('panel-photos');
    // offsetParent is null when an ancestor is display:none — cheap visibility test
    if (panel && panel.offsetParent !== null) {
      initPhotos.render();
    }
  });
}

// Photo UID — stable across re-renders so selection survives.
//   site:<idx>                         for site photos
//   defic:<deficId>:<obsIdx>:<phIdx>   for observation photos
function _photoUid(rec) {
  if (rec.type === 'site') return 'site:' + rec.siteIdx;
  return 'defic:' + rec.deficId + ':' + rec.obsIdx + ':' + rec.photoIdx;
}

// S265 Photo-Trash: gather soft-deleted photos for the Recently Deleted view.
// stage 1: DEFIC pool photos. stage 2: also SITE photos (proj.photos with the
// deleted flag). Walks pools directly (NOT the effective/obs lists, which already
// exclude deleted photos). Each record is tagged kind:'defic'|'site' so restore
// and permanent-delete route to the right model call. Returns newest-deleted first.
// S43x: capture the gallery badge onto a DEFIC photo at soft-delete time.
// removePoolPhoto cascades the photo out of its observation selections, so the
// obs letter/closed/rec state is only knowable BEFORE deletion. We freeze it as
// ph._trashBadge so Recently Deleted shows the exact same pill as the gallery.
function _stampTrashBadge(deficId, photoId) {
  try {
    var wrap=null, defic=null;
    (Model.getAllDeficiencies(Model.getProject())||[]).forEach(function(d){ if(d.defic && d.defic.id===deficId){ wrap=d; defic=d.defic; } });
    if(!defic) return;
    var ph=(defic.photos||[]).filter(function(x){return x.id===photoId;})[0];
    if(!ph) return;
    var isSite=(wrap.contractorId==null);
    var chosenOi=0, chosenO=null;
    (defic.observations||[]).forEach(function(o,oi){
      if(chosenO) return;
      var eff=(Model.getEffectivePhotos)?Model.getEffectivePhotos(defic,oi):(o.photos||[]);
      if(eff && eff.some(function(x){return x.id===photoId;})){ chosenOi=oi; chosenO=o; }
    });
    var o=chosenO||(defic.observations||[])[0]||{};
    var pri=(o.priority)||defic.priority||'high', low=(pri==='low'||pri==='general');
    var cls = o.addressed?'ph-badge-pin-closed' : (o.isRecommendation?'ph-badge-pin-rec' : (isSite?'ph-badge-site' : (low?'ph-badge-pin-low':'ph-badge-pin-high')));
    var text=(isSite?'Site ':'Obs ')+defic.num+String.fromCharCode(65+chosenOi);
    ph._trashBadge={text:text, cls:cls};
  } catch(e){}
}

function _gatherDeletedRecords() {
  var proj = Model.getProject();
  if (!proj) return [];
  var out = [];
  // site photos (stage 2)
  (proj.photos || []).forEach(function(ph, i) {
    if (ph && ph.deleted && !ph.purged) {
      out.push({
        kind: 'site',
        siteIdx: i,
        photoId: ph.id,
        ph: ph,
        src: _r2h(ph.thumb || ph.r2Url || ph.dataUrl || ''),
        deletedDate: ph.deletedDate || null,
        label: 'Site photo',
        badgeText: 'Site',
        badgeClass: 'ph-badge-site'
      });
    }
  });
  // defic pool photos (stage 1)
  var allDefics = Model.getAllDeficiencies(proj);
  allDefics.forEach(function(d) {
    var defic = d.defic;
    (defic.photos || []).forEach(function(ph) {
      if (ph && ph.deleted && !ph.purged) {
        var _isSiteD = (d.contractorId == null);
        var _tb = ph._trashBadge || null;
        out.push({
          kind: 'defic',
          deficId: defic.id,
          deficNum: defic.num,
          photoId: ph.id,
          ph: ph,
          src: _r2h(ph.thumb || ph.r2Url || ph.dataUrl || ''),
          deletedDate: ph.deletedDate || null,
          label: 'Pin ' + defic.num,
          badgeText: _tb ? _tb.text : ((_isSiteD ? 'Site ' : 'Obs ') + defic.num),
          badgeClass: _tb ? _tb.cls : (_isSiteD ? 'ph-badge-site' : ((defic.priority === 'low' || defic.priority === 'general') ? 'ph-badge-pin-low' : 'ph-badge-pin-high'))
        });
      }
    });
  });
  // S687: newest deletion first, ordered by the shared law's reading of WHEN
  // the delete happened. Same rule Diesel's trash uses, and it reads the
  // canonical time with the legacy spelling as fallback — sorting on the
  // legacy field alone put anything written without it at the bottom forever.
  out.sort(function(a, b) {
    var pr = (typeof window !== 'undefined') && window.PhotoRetention;
    var ta = pr ? pr.deletedAt(a.ph) : (a.deletedDate ? new Date(a.deletedDate).getTime() : 0);
    var tb = pr ? pr.deletedAt(b.ph) : (b.deletedDate ? new Date(b.deletedDate).getTime() : 0);
    return tb - ta; // newest deleted first
  });
  return out;
}

// S687: days remaining before the sweep destroys it. The arithmetic moved to
// lib/data/photoRetention.js so the number the inspector reads and the number
// the sweep acts on can never drift apart. Takes the PHOTO now, not an ISO
// string, because the shared law reads the canonical deletion time with the
// legacy spelling as fallback — a string caller can only hand over one of them.
function _trashDaysRemaining(photo) {
  var pr = (typeof window !== 'undefined') && window.PhotoRetention;
  if (!pr) return _TRASH_RETENTION_DAYS;
  return pr.daysLeft(photo, { retentionDays: _TRASH_RETENTION_DAYS });
}

// S265 Photo-Trash: build the Recently Deleted list HTML. Each item: thumbnail,
// label, deleted-date, days-remaining (amber, red when ≤5), Restore. stage 2:
// covers SITE + DEFIC photos (routed by r.kind) and adds an admin-gated
// "Delete forever" button (inspectors see it disabled; principals/admins enabled).
function _renderTrashHtml(deletedRecords) {
  // S439: grid + multi-select rewrite (was a vertical list). Mirrors the S114
  // gallery selection UX: hover checkbox (always visible on touch), shift-click
  // range select, admin-gated bulk "Delete selected" / "Delete all".
  var h = '';
  if (!deletedRecords.length) {
    _trashOrder = []; _trashSelected.clear(); _trashLastSel = null;
    h += '<p class="ph-empty">Nothing in Recently Deleted. Photos you delete from the gallery appear here and can be restored for ' + _TRASH_RETENTION_DAYS + ' days.</p>';
    return h;
  }
  var isAdmin = false;
  try { isAdmin = !!(Auth && Auth.isAdmin && Auth.isAdmin()); } catch (e) { isAdmin = false; }
  _trashOrder = deletedRecords.map(_trashUid);
  _trashSelected.forEach(function(u) { if (_trashOrder.indexOf(u) < 0) _trashSelected.delete(u); });
  var nSel = _trashSelected.size;
  h += '<p class="ph-trash-note">Deleted photos are kept for ' + _TRASH_RETENTION_DAYS + ' days, then removed automatically. Restore brings a photo back where it was.'
    + (isAdmin ? '' : ' Only a principal can delete a photo permanently.') + '</p>';
  if (isAdmin) {
    h += '<div class="ph-trash-bulkbar">';
    h += '<button class="ph-trash-purge" data-action="ph-trash-purge-selected"' + (nSel ? '' : ' disabled') + '>Delete selected' + (nSel ? ' (' + nSel + ')' : '') + '</button>';
    h += '<button class="ph-trash-purge ph-trash-purge-all" data-action="ph-trash-purge-all">Delete all (' + deletedRecords.length + ')</button>';
    if (nSel) h += '<button class="ph-trash-restore" data-action="ph-trash-clear-sel">Clear selection</button>';
    h += '</div>';
  }
  h += '<div class="ph-trash-grid">';
  deletedRecords.forEach(function(r) {
    var uid = _trashUid(r);
    var days = _trashDaysRemaining(r.ph);
    var daysCls = days <= 5 ? 'ph-trash-days urgent' : 'ph-trash-days';
    var selected = _trashSelected.has(uid);
    var routeAttrs = (r.kind === 'site')
      ? ' data-kind="site" data-site-idx="' + r.siteIdx + '"'
      : ' data-kind="defic" data-defic-id="' + esc(r.deficId) + '" data-photo-id="' + esc(r.photoId) + '"';
    h += '<div class="ph-trash-tile' + (selected ? ' selected' : '') + '" data-trash-uid="' + esc(uid) + '">';
    if (r.src) {
      h += '<img class="tphoto" src="' + esc(r.src) + '" loading="lazy" data-action="ph-trash-lightbox"' + routeAttrs + ' title="View photo" onerror="this.style.display=\'none\'">';
    } else {
      h += '<div class="tphoto tnoimg">\uD83D\uDCF7</div>';
    }
    if (r.badgeText) h += '<span class="ph-badges"><span class="ph-badge ' + esc(r.badgeClass || 'ph-badge-site') + '">' + esc(r.badgeText) + '</span></span>';
    if (isAdmin) {
      h += '<span class="ph-trash-check" data-action="ph-trash-toggle" data-uid="' + esc(uid) + '" title="Select">' + (selected ? '\u2713' : '') + '</span>';
    }
    h += '<div class="' + daysCls + '" title="' + days + ' day' + (days === 1 ? '' : 's') + ' left">' + days + 'd</div>';
    h += '<div class="ph-trash-actions">';
    h += '<button class="ph-trash-restore" data-action="ph-restore-photo"' + routeAttrs + ' title="Restore">' + IC_RESTORE_SVG + '</button>';
    if (isAdmin) h += '<button class="ph-trash-purge" data-action="ph-purge-photo"' + routeAttrs + ' title="Delete forever">' + IC_TRASH_SVG + '</button>';
    h += '</div></div>';
  });
  h += '</div>';
  return h;
}

// Cloud-status icon. r2Status === 'uploaded' is the explicit win;
// having r2Url alone implies success too. dataUrl-only = local cache.
function _cloudIcon(ph) {
  // S161 P2: composes R2 binary state with cloud-metadata sync state.
  // R2 state lives on ph.r2Status / ph.r2Url (existing). Cloud-metadata
  // sync is derived from SyncEngine.diag.lastSeenUpdatedAt vs the photo
  // id's embedded ms-epoch timestamp. If photo was created AFTER the
  // last successful cloud push, its metadata isn't confirmed yet — we
  // show "awaiting cloud sync" even though the R2 binary is up. This
  // is what makes the silent-sync-failure pattern visible: the gallery
  // used to show green ✓ as soon as R2 succeeded, lying about whether
  // the metadata row actually made it to Supabase. KEEP IN SYNC with
  // _obsPhotoSyncBadge in deficiencies.js (same logic, different markup).
  var status, color, glyph = '';
  if (ph.r2Status === 'failed') {
    status = 'Upload failed'; color = '#A85959';
    glyph = '<path d="M9 9l6 6M15 9l-6 6" stroke="white" stroke-width="2.2" stroke-linecap="round"/>';
  } else if (ph.r2Status === 'uploading' || ph.r2Status === 'pending') {
    status = 'Uploading\u2026'; color = '#FFA726';
  } else if (ph.r2Status === 'uploaded' || (ph.r2Url && !ph.r2Status)) {
    // R2 confirmed. Now check cloud-metadata sync state.
    var lastSync = null;
    try {
      if (typeof window !== 'undefined' && window.SyncEngine && window.SyncEngine.diag) {
        lastSync = window.SyncEngine.diag.lastSeenUpdatedAt;
      }
    } catch (e) { /* defensive */ }
    var photoTs = 0;
    // S482: was /^[a-z]+_(\d{13})/ — anchored single-segment prefix. Backup
    // records (sph_orig_<ts>_) never matched, so photoTs stayed 0 and the else
    // branch below painted them "awaiting cloud sync" FOREVER (Mark's stuck
    // yellow, 1490.04). Match the first 13-digit run after any underscore.
    var m = String(ph.id || '').match(/_(\d{13})(?:_|$)/);
    if (m) photoTs = parseInt(m[1], 10);
    var syncTs = lastSync ? new Date(lastSync).getTime() : 0;
    // A null/zero watermark means we simply haven't heard back from the cloud
    // yet this session (gallery painted before the first pull/IDB-restore set
    // it). That is "unknown", NOT "failed" — do NOT downgrade a confirmed-up
    // R2 photo to orange in that case (caused the false "awaiting" badge on
    // load). Only show pending when we HAVE a watermark and the photo is newer
    // than it (the genuine silent-sync-failure signal is preserved).
    // S482: same unknown-rule for an UNPARSEABLE id (photoTs 0) — we cannot
    // prove it pending, and its binary is already confirmed up in this branch.
    if ((!photoTs) || (!syncTs) || (photoTs <= syncTs)) {
      status = 'Synced'; color = '#5F8068';
      glyph = '<path d="M8 12.5l2.5 2.5L16 9.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
    } else {
      status = 'R2 done \u2014 awaiting cloud sync'; color = '#FFA726';
      glyph = '<circle cx="12" cy="12" r="1.5" fill="white"/>';
    }
  } else {
    status = 'Local only'; color = '#94A3B8';
  }
  return '<span class="ph-cloud" title="' + status + '">'
    + '<svg width="18" height="14" viewBox="0 0 24 18" fill="' + color + '">'
    + '<path d="M19 16H6a4.5 4.5 0 010-9 5.5 5.5 0 0110.5-1A4.5 4.5 0 0119 16z"/>' + glyph
    + '</svg></span>';
}

// S225: build the faded site-origin ghost strip. A photo MOVED OUT of the
// gallery this session leaves a faded ghost here (synthesized from the
// in-memory snapshot) with an Undo button. Pure visual; gone on reload.
function _ghostStripHtml() {
  if (!Model.siteOriginGhosts) return '';
  var ghosts = Model.siteOriginGhosts();
  if (!ghosts.length) return '';
  var h = '<div class="ph-ghost-strip">';
  h += '<div class="ph-ghost-strip-label">Recently moved out of the gallery</div>';
  h += '<div class="ph-grid">';
  ghosts.forEach(function(g) {
    var s = g.snapshot || {};
    var src = _r2h(s.thumb || s.r2Url || s.dataUrl || '');
    h += '<div class="ph-card ph-just-moved ph-ghost">';
    if (src) {
      h += '<img src="' + esc(src) + '" loading="lazy" onerror="this.style.display=\'none\'">';
    } else {
      h += '<div class="ph-noimg">\uD83D\uDCF7</div>';
    }
    h += '<button class="ph-undo-btn" data-action="ph-undo-move" data-token="' + esc(g.token) + '" title="Undo this move">\u21A9 Undo</button>';
    h += '</div>';
  });
  h += '</div></div>';
  return h;
}

function _dayKey(ph, parentDefic) {
  // S115 P12: priority order (matches v1):
  //   1. ph.addedDate || ph.date  (explicit per-photo date)
  //   2. parentDefic.notedDate || parentDefic.date  (defic photos inherit
  //      from their parent — a photo attached to a March 17 defic stays on
  //      March 17 even if the photo was technically uploaded on a later
  //      day, which matches how field inspectors think about evidence)
  //   3. id timestamp  (last resort — only fires for orphan photos with no
  //      addedDate and no parent context, e.g. site photos in proj.photos)
  var d = ph.addedDate || ph.date;
  if (!d && parentDefic) d = parentDefic.notedDate || parentDefic.date;
  if (!d && ph.id) {
    var m = String(ph.id).match(/[a-z]+_(\d{13})/);
    if (m) d = new Date(parseInt(m[1])).toISOString().split('T')[0];
  }
  if (!d) return { key: 'no-date', label: 'No date' };
  try {
    // S160: when d is an ISO date-only string (YYYY-MM-DD), parse via component
    // constructor so the Date lands at midnight LOCAL — not UTC. Otherwise
    // EDT tablets see "2026-05-20" labeled "May 19" because new Date("2026-05-20")
    // parses as UTC midnight, then toLocaleDateString shifts back into local tz.
    var dt;
    var dateOnly = (typeof d === 'string') && d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      dt = new Date(parseInt(dateOnly[1],10), parseInt(dateOnly[2],10)-1, parseInt(dateOnly[3],10));
    } else {
      dt = new Date(d);
    }
    if (isNaN(dt.getTime())) return { key: 'no-date', label: 'No date' };
    // Build key in local-date form so it matches the displayed label
    var yy = dt.getFullYear();
    var mm = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    var key = yy + '-' + mm + '-' + dd;
    var label = dt.toLocaleDateString('en-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    return { key: key, label: label };
  } catch(e) { return { key: 'no-date', label: 'No date' }; }
}

export var initPhotos = {
  render: function() {
    var container = document.getElementById('photos-container');
    if (!container) return;
    // S479e: the upload zone is THE shared engine — rendered once, mounted
    // once (delegated handlers survive re-renders). gallery:false — this IS
    // the gallery. onFiles routes into the SAME _handleSitePhotoFiles path
    // every photo has always taken; the engine owns the surface, never storage.
    var zoneEl = document.getElementById('site-photo-upload');
    if (zoneEl && !zoneEl.firstChild && window.PhotoInput) {
      zoneEl.innerHTML = PhotoInput.html({ ns: 'gal', gallery: false, hint: 'Drop photos to add' });
      PhotoInput.mount({ ns: 'gal', onFiles: function(files) { _handleSitePhotoFiles(files); } });
    }
    var proj = Model.getProject();
    if (!proj) { container.innerHTML = ''; return; }

    // S265 stage 2: 30-day auto-purge of expired soft-deleted photos. Runs once
    // per loaded project (guarded by id) the first time the Photos panel renders,
    // so housekeeping happens without re-sequencing the project loader.
    if (Model.purgeExpiredPhotos && _purgedForProjectId !== (proj.id || proj.projectId)) {
      _purgedForProjectId = (proj.id || proj.projectId);
      try { Model.purgeExpiredPhotos(_TRASH_RETENTION_DAYS); } catch (e) { /* defensive */ }
    }

    var sitePhotos = proj.photos || [];
    var allDefics = Model.getAllDeficiencies(proj);

    // ── Build flat list of photo records (one per photo) ──
    var records = [];
    sitePhotos.forEach(function(p, i) {
      // S265 stage 2: soft-deleted site photos live in Recently Deleted, not the
      // gallery. Skip them here; siteIdx stays the true array index for actions.
      if (p && p.deleted) return;
      var dk = _dayKey(p, null);
      records.push({
        type: 'site',
        siteIdx: i,
        ph: p,
        src: _r2h(p.thumb || p.r2Url || p.dataUrl || ''),
        badgeText: 'Site',
        // P1.5: green "Site" badge (matches v1; not red)
        badgeClass: 'ph-badge-site',
        dateKey: dk.key, dateLabel: dk.label,
        sortGroup: [0, i] // site photos come first within a date
      });
    });
    allDefics.forEach(function(d) {
      var defic = d.defic;
      // S317: "general" priority is RETIRED (legacy data only). The tool-wide rule
      // (model.js S217) migrates general → LOW, so a legacy general obs READS as Low
      // here (amber), NOT Site. Green is Closed-only.
      // SITE RECORD is determined by NO CONTRACTOR (d.contractorId == null — the
      // generalDeficiencies pool), NEVER by priority. A pin under a real contractor
      // (e.g. Vipond) is an Observation regardless of its priority. (The S317 bug
      // routed general→site and ignored the contractor, so a Low Vipond pin showed
      // purple Site.)
      var _isSiteRecordPin = (d.contractorId == null);
      // Badge colour signals priority: high=red, low=amber. (Closed/rec/site handled
      // per-obs below.)
      var badgeCls = 'ph-badge-pin-high';
      if (defic.priority === 'low' || defic.priority === 'general') badgeCls = 'ph-badge-pin-low';
      // S120 Push 1: pool-aware enumeration — for each obs, walk the
      // EFFECTIVE photo list (pool ∩ obs.photoSelection, with markup overlays).
      // A photo shared by Obs A + Obs B emits two records, each tagged with
      // the parent obs (matches V1 corner-badge pattern Mark requested).
      // Legacy fallback inside getEffectivePhotos handles never-migrated edge cases.
      var multiObs = (defic.observations || []).length > 1;
      (defic.observations || []).forEach(function(o, oi) {
        // S317 badge precedence (matches the card-pill terminal-state rule):
        //   closed (terminal) > recommendation > priority(high/low) > general→site.
        // A CLOSED obs photo gets the green Closed badge (not its priority colour),
        // so it stops leaking into High/Low. badgeCat drives filter-aware rendering
        // (a card in the High view shows ONLY its high badge, not its other badges).
        var _obsClosed = !!(o && o.addressed);
        var _obsRec = !!(o && o.isRecommendation);
        // Priority is PER-OBSERVATION (o.priority), not pin-level. Legacy 'general'
        // reads as Low (retirement rule). Site is by NO-CONTRACTOR, not priority.
        var _obsPri = (o && o.priority) || defic.priority || 'high';
        var _obsLow = (_obsPri === 'low' || _obsPri === 'general');
        var obsBadgeCls, _badgeCat;
        if (_obsClosed)            { obsBadgeCls = 'ph-badge-pin-closed'; _badgeCat = 'closed'; }
        else if (_obsRec)          { obsBadgeCls = 'ph-badge-pin-rec';    _badgeCat = 'recommendations'; }
        else if (_isSiteRecordPin) { obsBadgeCls = 'ph-badge-site';       _badgeCat = 'site'; }
        else if (_obsLow)          { obsBadgeCls = 'ph-badge-pin-low';    _badgeCat = 'low'; }
        else                       { obsBadgeCls = 'ph-badge-pin-high';   _badgeCat = 'high'; }
        var effective = (typeof Model !== 'undefined' && Model.getEffectivePhotos)
          ? Model.getEffectivePhotos(defic, oi) : (o.photos || []);
        effective.forEach(function(ph, phi) {
          var mk = (Model.getObsPhotoMarkup) ? Model.getObsPhotoMarkup(defic, oi, ph.id) : null;
          var dk = _dayKey(ph, defic);
          // S269: photo badge = number + obs letter, no separator (e.g. "2A"),
          // aligning with the card round-badge ("2A") and PDF item number ("#2B").
          // Single-obs pins show just the number. Site photos keep "Site".
          // S324 (Mark): always show the obs letter, even on single-obs pins,
          // so every badge is two chars ("1A","2A") and the grid reads uniform
          // (was: letter dropped for single-obs → ragged mix of "2" and "2A").
          // S339 (Mark): prefix "Obs " so the badge reads "Obs 3A" / "Obs 1B"
          // rather than a bare "3A". Site badge ("Site") is unchanged; this only
          // relabels deficiency/observation photos.
          // S346 (#19, Mark): a TRUE site record (no contractor) must read
          // "Site 17A", not "Obs 17A" — "Obs" implies a contractor deficiency.
          // Reuse the same _isSiteRecordPin flag that drives the badge class.
          var obsLetter = String.fromCharCode(65 + oi);
          var _badgePrefix = _isSiteRecordPin ? 'Site ' : 'Obs ';
          records.push({
            type: 'defic',
            deficId: defic.id,
            deficNum: defic.num,
            isGeneralPriority: (defic.priority === 'general'),
            isRec: !!(o && o.isRecommendation),
            obsClosed: !!(o && o.addressed),   // S284c (Mark): Closed photo tracker
            obsPriority: (o && o.priority) || defic.priority || 'high',
            obsIdx: oi,
            photoIdx: phi,
            ph: ph,
            src: _r2h((mk && mk.markedR2Key) || ph.r2Url || ph.dataUrl || ''),
            badgeText: _badgePrefix + defic.num + obsLetter,
            badgeClass: obsBadgeCls,
            badgeCat: _badgeCat,
            dateKey: dk.key, dateLabel: dk.label,
            sortGroup: [1, defic.num, oi, phi]
          });
        });
      });
    });

    // Stamp UIDs
    records.forEach(function(r) { r.uid = _photoUid(r); });

    // ── S205: collapse references → one card per photo, aggregate pin pills ──
    // A photo assigned/copied to multiple pins (or present as both a site
    // photo and a pin photo) shares one binary (r2Key). Show it ONCE with a
    // pill per reference rather than one card per reference. The first record
    // seen is the representative; if a SITE reference exists for the same
    // binary it is promoted to representative so the gallery trash-delete stays
    // available. ref* flags drive the (now reference-union) stats + filter.
    function _phIdKey(r) {
      var ph = r.ph || {};
      // S269 PERMANENT FIX: group by the model's binary-identity key, not raw
      // r2Key. The same physical photo assigned/copied across pins gets its OWN
      // r2Key per pin (hard rule: assign-to-pin uploads under the new defic's own
      // key, never borrows URLs). So grouping by r2Key alone made one image render
      // as MULTIPLE cards — each with a single pin/obs badge — which looked like
      // badge "spam" (it was actually duplicate cards). Model._photoIdentityKey
      // falls back to image bytes (dataUrl/thumb) when r2Keys differ, collapsing
      // them to one card with one badge per real reference. This is the same
      // identity used by the dedup guard, orphan checker, and move/copy paths —
      // the gallery now shares that single source of truth so it can't drift
      // back (the reason this regressed before: the gallery had its OWN key).
      var idk = (Model && Model._photoIdentityKey) ? Model._photoIdentityKey(ph) : null;
      // S429 (Mark's design decision): a photo that exists as BOTH a site
      // photo and a pin photo shows as TWO entries — the site copy and the
      // pin copy — instead of collapsing to one. The key is partitioned by
      // record origin, so cross-kind merging never happens. Within-kind
      // behavior is unchanged: a pool photo referenced by multiple pins/obs
      // still collapses to one card with a pill per reference (S205/S269 —
      // the badge-spam fix stays).
      return ((r.type === 'site') ? 'S|' : 'D|') + (idk || ph.r2Key || ph.sourceR2Key || ph.id || r.uid);
    }
    var _phById = {};
    var _phRepOrder = [];
    records.forEach(function(r) {
      var k = _phIdKey(r);
      // S283 gallery buckets: Observations | Recommendations | Site.
      // A defic photo is a Recommendation if its obs is flagged rec, else an
      // Observation. "Notes" (general-priority) folds into Observations — the
      // general/note distinction is retired from the gallery (Mark). A photo
      // can carry multiple references (e.g. obs on two pins), so flags union.
      // S317: badgeCat (stamped per-obs above) is the single source of truth for
      // bucketing. closed > rec > high/low > site (general folds to site). A site-
      // type record has no badgeCat → treated as site. A photo with multiple refs
      // unions its categories (so it appears under each matching filter, with the
      // matching badge only — see the filter-aware badge render below).
      var _cat = (r.type === 'defic') ? r.badgeCat : 'site';
      var isRecRef   = (_cat === 'recommendations');
      var isObsClosed = (_cat === 'closed');
      var isObsLow   = (_cat === 'low');
      var isObsHigh  = (_cat === 'high');
      // "Observation photos" bucket = any non-rec, non-site defic reference
      // (high/low/closed). Kept for the legacy 'observations' filter mode.
      var isObsRef = (r.type === 'defic') && (_cat === 'high' || _cat === 'low' || _cat === 'closed');
      // general (now 'site') and explicit site both count toward Site Records.
      var isSiteRef = (r.type === 'site') || (_cat === 'site');
      var rep = _phById[k];
      if (!rep) {
        r.badges = [{ text: r.badgeText, cls: r.badgeClass, cat: _cat }];
        r.refSite = isSiteRef;
        r.refObs = isObsRef;
        r.refRec = isRecRef;
        r.refObsHigh = isObsHigh;
        r.refObsLow = isObsLow;
        r.refClosed = isObsClosed;
        // S284 (mutual exclusivity): remember the first DEFIC reference seen for
        // this binary so the exclusivity post-pass below can re-point a
        // site-typed representative at real defic context (deficId/obsIdx/...)
        // when obs references exist. In-memory only, never persisted.
        if (r.type === 'defic') r._firstDefic = r;
        _phById[k] = r;
        _phRepOrder.push(r);
        return;
      }
      if (r.type === 'defic' && !rep._firstDefic) rep._firstDefic = r;
      var dup = rep.badges.some(function(b) { return b.text === r.badgeText && b.cls === r.badgeClass; });
      if (!dup) rep.badges.push({ text: r.badgeText, cls: r.badgeClass, cat: _cat });
      rep.refSite = rep.refSite || isSiteRef;
      rep.refObs = rep.refObs || isObsRef;
      rep.refRec = rep.refRec || isRecRef;
      rep.refObsHigh = rep.refObsHigh || isObsHigh;
      rep.refObsLow = rep.refObsLow || isObsLow;
      rep.refClosed = rep.refClosed || isObsClosed;
      // Promote a SITE reference to representative so the trash button (site
      // only) stays reachable; adopt its site context for card actions.
      if (r.type === 'site' && rep.type !== 'site') {
        rep.type = 'site';
        rep.siteIdx = r.siteIdx;
        rep.src = rep.src || r.src;
      }
    });
    records = _phRepOrder;

    // ── S284: SITE/OBS MUTUAL EXCLUSIVITY (Mark's locked rule, S265) ──
    // A photo is EITHER a Site Record OR an obs/finding photo — never both.
    // Derivation-only: any live obs/rec reference suppresses the Site identity
    // (badge, stats bucket, filter). The site pool entry in proj.photos is NEVER
    // touched, so when the last obs reference disappears (de-select, obs delete,
    // pool soft-delete) the photo automatically falls back to Site on the next
    // render. No data mutation, no migration, fully reversible.
    // If the representative record was the SITE reference (site records are
    // built first / promoted), re-point it at the stashed first DEFIC reference
    // so the card's actions (lightbox, ⤴ move, ↗ open-in-editor, recoverable
    // soft-delete) are the obs actions, not the site hard-delete.
    records.forEach(function(rep) {
      if (!(rep.refObs || rep.refRec)) return; // pure Site (or no refs) — unchanged
      if (rep.refSite) {
        rep.refSite = false;
        rep.badges = (rep.badges || []).filter(function(b) { return b.cls !== 'ph-badge-site'; });
      }
      if (rep.type === 'site' && rep._firstDefic) {
        var fd = rep._firstDefic;
        rep.type = 'defic';
        rep.deficId = fd.deficId;
        rep.deficNum = fd.deficNum;
        rep.isGeneralPriority = fd.isGeneralPriority;
        rep.isRec = fd.isRec;
        rep.obsPriority = fd.obsPriority;
        rep.obsIdx = fd.obsIdx;
        rep.photoIdx = fd.photoIdx;
        rep.ph = fd.ph;
        rep.src = fd.src || rep.src;
        rep.sortGroup = fd.sortGroup;
        // Re-stamp the uid from the new defic context — the uid was stamped
        // pre-collapse from the site record, and bulk select/delete parses the
        // 'site:'/'defic:' prefix to route the action. A stale 'site:' uid here
        // would hard-delete the hidden site entry from a card presenting as an
        // obs photo.
        rep.uid = _photoUid(rep);
      }
    });

    // ── Stats: distinct-photo totals (S284: Site is now EXCLUSIVE — a photo
    // with any obs/rec reference never counts as a Site Record) ──
    var totalAll = records.length;
    var totalSite = records.filter(function(r) { return r.refSite; }).length;
    var totalObs = records.filter(function(r) { return r.refObs; }).length;
    var totalObsHigh = records.filter(function(r) { return r.refObsHigh; }).length;
    var totalObsLow = records.filter(function(r) { return r.refObsLow; }).length;
    var totalRec = records.filter(function(r) { return r.refRec; }).length;
    var totalClosed = records.filter(function(r) { return r.refClosed; }).length;  // S284c

    // ── Apply filter (a photo matches if ANY of its references match) ──
    var filtered = records.filter(function(r) {
      if (_filterMode === 'all') return true;
      if (_filterMode === 'site') return r.refSite;
      if (_filterMode === 'observations') return r.refObs;
      if (_filterMode === 'recommendations') return r.refRec;
      if (_filterMode === 'high') return r.refObsHigh;
      if (_filterMode === 'low') return r.refObsLow;
      if (_filterMode === 'closed') return r.refClosed;
      return true;
    });

    // ── Group by date (descending), sort within group ──
    var groups = {};
    var orderedKeys = [];
    filtered.forEach(function(r) {
      if (!groups[r.dateKey]) {
        groups[r.dateKey] = { label: r.dateLabel, items: [] };
        orderedKeys.push(r.dateKey);
      }
      groups[r.dateKey].items.push(r);
    });
    // Sort dates descending (newest first); 'no-date' last
    orderedKeys.sort(function(a, b) {
      if (a === 'no-date') return 1;
      if (b === 'no-date') return -1;
      return b.localeCompare(a);
    });
    Object.keys(groups).forEach(function(k) {
      groups[k].items.sort(function(a, b) {
        for (var i = 0; i < Math.max(a.sortGroup.length, b.sortGroup.length); i++) {
          var av = a.sortGroup[i] || 0, bv = b.sortGroup[i] || 0;
          if (av !== bv) return av - bv;
        }
        return 0;
      });
    });

    // ── Build HTML ──
    var html = '';

    // S265 Photo-Trash Phase 1: sub-tab row — All Photos (n) | Recently Deleted (n).
    // A separate sub-tab (NOT a stacked section) keeps the page short. The trash
    // count badge is always computed so the tab shows it even from the gallery.
    var deletedRecords = _gatherDeletedRecords();
    var trashCount = deletedRecords.length;
    html += '<div class="ph-subtabs">';
    html += '<button class="ph-subtab' + (_photoTab === 'all' ? ' active' : '') + '" data-action="ph-subtab" data-tab="all">All Photos <span class="ph-subtab-n">' + totalAll + '</span></button>';
    html += '<button class="ph-subtab' + (_photoTab === 'trash' ? ' active' : '') + '" data-action="ph-subtab" data-tab="trash">\uD83D\uDDD1 Recently Deleted <span class="ph-subtab-n">' + trashCount + '</span></button>';
    html += '</div>';

    // ── Recently Deleted view (branches before the gallery toolbar) ──
    if (_photoTab === 'trash') {
      html += _renderTrashHtml(deletedRecords);
      container.innerHTML = html;
      return;
    }

    // Toolbar
    var nSel = _selectedUids.size;
    html += '<div class="ph-toolbar">';
    html += '<div class="ph-toolbar-left">';
    // Stat tiles are now CLICKABLE filters (Diesel parity) — each filters the
    // gallery; colour per category preserved. Active tile highlighted.
    function _statTile(mode, num, color, lbl){
      var act = (_filterMode === mode) ? ' ph-stat-active' : '';
      var col = color ? (' style="color:' + color + '"') : '';
      return '<div class="ph-stat ph-stat-clickable' + act + '" data-action="ph-set-filter" data-mode="' + mode + '">'
        + '<div class="ph-stat-num"' + col + '>' + num + '</div>'
        + '<div class="ph-stat-lbl">' + lbl + '</div></div>';
    }
    html += _statTile('all', totalAll, '', 'Total');
    html += _statTile('high', totalObsHigh, 'var(--no)', 'Outstanding \u2014 High');
    html += _statTile('low', totalObsLow, 'var(--warn)', 'Outstanding \u2014 Low');
    html += _statTile('recommendations', totalRec, '#5E5440', 'Recommendations');
    html += _statTile('closed', totalClosed, 'var(--yes)', 'Closed');
    html += _statTile('site', totalSite, '#6E6AA8', 'Site Records');
    html += '</div>';
    html += '<div class="ph-toolbar-right">';
    if (nSel > 0) {
      html += '<span class="ph-sel-count">' + nSel + ' selected</span>';
      html += '<button class="ph-btn ph-btn-danger" data-action="ph-delete-selected">Delete ' + nSel + '</button>';
      html += '<button class="ph-btn" data-action="ph-clear-selection">Clear</button>';
    }
    // Select all (Diesel parity) — selects all photos currently in view (filtered)
    html += '<button class="ph-btn" data-action="ph-select-all-visible">Select all</button>';
    // S328 (#34): the gear "All photos" filter button + its dropdown menu are
    // removed. The clickable stat tiles above (Total / High / Low / Recommendations
    // / Closed / Site Records) already perform every filter the menu offered, so
    // the gear control was redundant. _filterMode is still driven entirely by the
    // tiles; _filterPanelOpen / ph-toggle-filter are now unused (left harmless).
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Empty state
    if (!filtered.length) {
      var ghostsOnly = _ghostStripHtml();
      var msg = totalAll === 0 ? 'No photos yet. Upload site photos or add photos to deficiencies.'
        : 'No photos match the current filter.';
      html += '<p class="ph-empty">' + msg + '</p>';
      html += ghostsOnly;
      container.innerHTML = html;
      return;
    }

    // Date groups
    _renderOrderUids = []; // rebuild for shift-click range computation
    orderedKeys.forEach(function(k) {
      var g = groups[k];
      // Are all in this group selected?
      var allSel = g.items.every(function(it) { return _selectedUids.has(it.uid); });
      var someSel = !allSel && g.items.some(function(it) { return _selectedUids.has(it.uid); });
      html += '<div class="ph-date-header">';
      html += '<input type="checkbox" class="ph-date-check"' + (allSel ? ' checked' : '') + (someSel ? ' data-indet="1"' : '')
        + ' data-action="ph-toggle-date" data-date-key="' + esc(k) + '">';
      html += '<span class="ph-date-label">' + esc(g.label) + '</span>';
      html += '<span class="ph-date-count">\u00B7 ' + g.items.length + ' photo' + (g.items.length === 1 ? '' : 's') + '</span>';
      html += '</div>';
      html += '<div class="ph-grid">';
      g.items.forEach(function(r) {
        _renderOrderUids.push(r.uid);
        var sel = _selectedUids.has(r.uid);
        var clickAction = r.type === 'site'
          ? 'data-action="open-site-lightbox" data-photo-idx="' + r.siteIdx + '"'
          : 'data-action="open-defic-lightbox" data-defic-id="' + esc(r.deficId) + '" data-obs-idx="' + r.obsIdx + '" data-photo-idx="' + r.photoIdx + '"';
        // S226: a COPY shows a small "Copied — Undo" CHIP on its ORIGIN photo
        // (the original is unchanged and still here), so Undo lives at the origin
        // for copies too — never at the destination. MOVES render a faded GHOST
        // at the origin (injected below / in the ghost strip). No live card is
        // ever faded as a "destination" anymore.
        var copyTok = (r.ph && r.ph.id && Model.copyOriginTokenForPhoto)
          ? Model.copyOriginTokenForPhoto(r.ph.id) : null;
        // S227: destination "Just added" chip for a defic card whose photo a
        // move/copy just landed under this obs (lets a mis-clicked obs be undone
        // from the gallery too). Site cards have no obs, so defic-only.
        var addTok = (r.type !== 'site' && r.ph && r.ph.id && Model.justAddedTokenForObsPhoto)
          ? Model.justAddedTokenForObsPhoto(r.deficId, r.obsIdx, r.ph.id) : null;
        var cardCls = 'ph-card';
        if (sel) cardCls += ' selected';
        html += '<div class="' + cardCls + '" data-uid="' + esc(r.uid) + '">';
        // S114 P1.3: checkbox is hover-only when unselected, always shown when selected
        html += '<input type="checkbox" class="ph-check"' + (sel ? ' checked' : '') + ' data-action="ph-toggle-photo" data-uid="' + esc(r.uid) + '">';
        // S205: render a pill per reference (Site / Pin N / Pin N · Obs X).
        // A photo on multiple pins shows multiple pills, top-right, wrapping.
        // S317: in a CATEGORY view (any filter other than 'all'/'observations'),
        // show ONLY the badge(s) for that category — a photo shared between an
        // open-high obs and a closed obs shows just its red badge under High and
        // just its green badge under Closed (no more red+green mixing). The 'all'
        // and legacy 'observations' views still show every badge.
        var _allBadges = (r.badges || [{ text: r.badgeText, cls: r.badgeClass, cat: r.badgeCat }]);
        var _showBadges = _allBadges;
        if (_filterMode !== 'all' && _filterMode !== 'observations') {
          var _m = _allBadges.filter(function(b) { return b.cat === _filterMode; });
          if (_m.length) _showBadges = _m; // fall back to all if none tagged (legacy safety)
        }
        html += '<span class="ph-badges">';
        _showBadges.forEach(function(b) {
          html += '<span class="ph-badge ' + b.cls + '">' + esc(b.text) + '</span>';
        });
        html += '</span>';
        if (r.src) {
          var _rot = (r.ph && typeof r.ph.rotation==='number') ? (((r.ph.rotation%360)+360)%360) : 0;
          var _rotStyle = _rot ? (' style="transform:rotate('+_rot+'deg)"') : '';
          // S362: tag every thumbnail with its EXACT photo id (data-thumb-pid) and,
          // when it carries vector markup, a marker the post-render compositor reads.
          // The compositor swaps src to a pre-rotated marked composite and clears the
          // CSS rotate. NEVER match by URL prefix (all photos share the R2 worker URL
          // prefix - that stamped one composite onto every thumb in S355).
          var _pid = (r.ph && r.ph.id) ? r.ph.id : '';
          var _hasMk = (r.ph && r.ph._markupStrokes && r.ph._markupStrokes.length) ? '1' : '';
          var _thumbAttrs = (_pid ? (' data-thumb-pid="' + esc(_pid) + '"') : '') + (_hasMk ? ' data-thumb-mk="1"' : '');
          // S430 Fix-1: relinked photos may have only r2Url (no local bytes). If the
          // primary src fails to load, fall back to r2Url ONCE (self-healing, guarded
          // by data-fb), then to a clickable placeholder — never a dead black tile.
          // The clickAction stays on the <img>, so even a placeholder image opens the
          // lightbox by index (which fetches r2Url on its own).
          var _r2fb = (r.ph && r.ph.r2Url) ? _r2h(r.ph.r2Url) : '';
          var _fbAttr = (_r2fb && _r2fb !== r.src)
            ? (' data-r2fb="' + esc(_r2fb) + '"')
            : '';
          var _onerr = "if(this.dataset.fb!=='1'&&this.dataset.r2fb&&this.src!==this.dataset.r2fb){this.dataset.fb='1';this.src=this.dataset.r2fb;}else{this.classList.add('ph-img-broken');}";
          html += '<img ' + clickAction + _thumbAttrs + _fbAttr + ' src="' + esc(r.src) + '"' + _rotStyle + ' loading="lazy" onerror="' + esc(_onerr) + '">';
        } else {
          // S430 Fix-1: source-less tile stays clickable — the lightbox fetches r2Url
          // by index on open, so a relinked photo with no thumb still viewable.
          html += '<div class="ph-noimg" ' + clickAction + '>\uD83D\uDCF7</div>';
        }
        html += _cloudIcon(r.ph);
        // S226: copy chip on the origin photo.
        if (copyTok) {
          html += '<button class="ph-copy-chip" data-action="ph-undo-move" data-token="' + esc(copyTok) + '" title="Undo this copy">Copied \u00b7 \u21A9 Undo</button>';
        }
        // S227: destination just-added chip (move/copy just landed it here).
        if (addTok && addTok !== copyTok) {
          html += '<button class="ph-add-chip" data-action="ph-undo-move" data-token="' + esc(addTok) + '" title="Undo — just added here">Just added \u00b7 \u21A9</button>';
        }
        // S114 P1.3: hover-revealed download button (all photos)
        var dlAction = r.type === 'site'
          ? 'data-action="ph-download-site" data-photo-idx="' + r.siteIdx + '"'
          : 'data-action="ph-download-defic" data-defic-id="' + esc(r.deficId) + '" data-obs-idx="' + r.obsIdx + '" data-photo-idx="' + r.photoIdx + '"';
        html += '<button class="ph-dl-btn" ' + dlAction + ' title="Download photo">'
          + '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
          + '</button>';
        // S216: Move/copy to another pin — DEFIC photos.
        // S224: SITE photos now get a send-to-pin button too (the inverse path).
        if (r.type !== 'site') {
          html += '<button class="ph-move-btn" data-action="ph-move-defic" data-defic-id="' + esc(r.deficId) + '" data-obs-idx="' + r.obsIdx + '" data-photo-idx="' + r.photoIdx + '" title="Move or copy to another pin">\u2934</button>';
          // S266: open this photo in the pin editor. Lists every obs (across all
          // pins) that references the photo; if one, opens that obs directly.
          html += '<button class="ph-goto-obs-btn" data-action="ph-goto-obs" data-defic-id="' + esc(r.deficId) + '" data-obs-idx="' + r.obsIdx + '" data-photo-id="' + esc((r.ph && r.ph.id) || '') + '" title="Open in pin editor">\u2197</button>';
        } else {
          html += '<button class="ph-move-btn" data-action="ph-move-site" data-photo-idx="' + r.siteIdx + '" title="Send to a pin">\u2934</button>';
        }
        // S114 P1.3 / S265: trash button. Site photos delete via removeSitePhoto
        // (hard, unchanged). DEFIC photos now soft-delete via removePoolPhoto —
        // recoverable from the Recently Deleted sub-tab (Photo-Trash Phase 1).
        if (r.type === 'site') {
          html += '<button class="ph-del-btn" data-action="delete-site-photo" data-photo-idx="' + r.siteIdx + '" title="Delete site photo">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 7h12v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7zm3-3h6l1 2H8l1-2zM4 6h16v1H4V6z"/></svg>'
            + '</button>';
        } else {
          html += '<button class="ph-del-btn" data-action="delete-defic-photo" data-defic-id="' + esc(r.deficId) + '" data-photo-id="' + esc((r.ph && r.ph.id) || '') + '" title="Delete photo (recoverable)">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 7h12v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7zm3-3h6l1 2H8l1-2zM4 6h16v1H4V6z"/></svg>'
            + '</button>';
        }
        html += '</div>';
      });
      html += '</div>';
    });

    // S225: site-origin ghost strip — photos MOVED OUT of the gallery this
    // session render as faded ghosts (synthesized from the in-memory snapshot,
    // NOT live data) with an Undo button, so the undo lives where the user is
    // still looking (the origin). Gone on reload.
    html += _ghostStripHtml();

    container.innerHTML = html;

    // Apply indeterminate state on date checkboxes (can only be set via JS prop)
    container.querySelectorAll('.ph-date-check[data-indet="1"]').forEach(function(cb) {
      cb.indeterminate = true;
    });

    // S362: thumbnail markup compositor (demo-proven never-bake path). For each
    // thumbnail flagged data-thumb-mk, composite the photo's vector strokes (+
    // rotation) onto a small canvas and swap the <img> src to that pre-rotated
    // marked image, then CLEAR the inline CSS rotate (the composite is already
    // rotated — double-rotation otherwise). Targeting is by EXACT data-thumb-pid;
    // never URL prefix. Async + per-photo guarded so one failure can't stamp the
    // wrong image onto another thumb (the S355 regression).
    try { _compositeThumbnails(container, proj); } catch(_){}
  }
};

Model.onChange('project', _scheduleRender);
// S114 P1.4: also catch photo/deficiency mutations so the gallery stays fresh
// without needing a full project re-load. Also debounced.
Model.onChange('photo', _scheduleRender);
Model.onChange('deficiency', _scheduleRender);

// Click handlers
// S205 — build the lightbox caption label listing every pin that references
// this photo's binary (r2Key). Optional prefix (e.g. "Site Photo") leads.
/* S677 — LABEL THE WHOLE RUNNING ORDER, NOT JUST THE TAPPED SET.
   Each surface used to label only the handful of photos it passed. Now that
   the arrows cross into photos the caller never listed, those photos would
   arrive at the viewer wearing a stale label from a previous open (or none).
   One pass, the same S205 precedence the site gallery and pin cards already
   use: a site photo reads "Site Photo · Pin 3" if a pin references the same
   binary; a pin photo reads its pin references, falling back to its own pin
   number. Exported through the module's own click handlers only — nothing
   outside photos.js needs to compute a label. */
function _frtLabelProjectPhotos() {
  try {
    var proj = Model.getProject();
    if (!proj) return;
    (proj.photos || []).forEach(function (p) { p._ctxLabel = _phPinLabel(p, 'Site Photo'); });
    var all = (Model.getAllDeficiencies) ? Model.getAllDeficiencies(proj) : [];
    all.forEach(function (d) {
      var defic = d && d.defic;
      if (!defic) return;
      var own = 'Pin #' + (defic.num || '?');
      function lab(p) { if (p) p._ctxLabel = _phPinLabel(p, '') || own; }
      (defic.photos || []).forEach(lab);
      (defic.observations || []).forEach(function (o) {
        (o.photos || []).forEach(lab);
        (o.responses || []).forEach(function (e) { (e.rectPhotos || []).forEach(lab); });
        (o.arenconReviews || []).forEach(function (e) { (e.followupPhotos || []).forEach(lab); });
      });
      (defic.activity || []).forEach(function (a) { (a.photos || []).forEach(lab); });
    });
  } catch (_) { /* a missing label must never block opening a photo */ }
}
try { window._frtLabelProjectPhotos = _frtLabelProjectPhotos; } catch (_) {}

function _phPinLabel(p, prefix) {
  var parts = [];
  if (prefix) parts.push(prefix);
  var refs = (p && Model.getPinReferencesForR2Key)
    ? Model.getPinReferencesForR2Key(p.r2Key || p.sourceR2Key || null)
    : [];
  refs.forEach(function(r) {
    var n = 'Pin ' + r.num;
    if (parts.indexOf(n) === -1) parts.push(n);
  });
  return parts.join(' \u00b7 ');
}

document.addEventListener('click', function(e) {
  // Site photo lightbox
  var el = e.target.closest && e.target.closest('[data-action="open-site-lightbox"]');
  if (el) {
    var idx = parseInt(el.getAttribute('data-photo-idx') || '0');
    var proj = Model.getProject();
    if (proj && (proj.photos || []).length && window._frtLightbox) {
      // S115 fix: pass the live photo records (not a stripped projection),
      // so the markup save handler can find r2Key/id and propagate to siblings.
      // S205: per-photo caption shows "Site Photo" plus any pins referencing
      // the same binary. No global contextLabel so the per-photo label wins.
      /* S677 — one labeller, one running order. The site gallery already
         walked every site photo; it now continues into the pin photos rather
         than stopping at the last site one. */
      _frtLabelProjectPhotos();
      openInProject((proj.photos || [])[idx], proj.photos, idx, {});
    }
    return;
  }

  // Deficiency photo lightbox from gallery
  var dp = e.target.closest && e.target.closest('[data-action="open-defic-lightbox"]');
  if (dp) {
    var deficId = dp.getAttribute('data-defic-id');
    var obsIdx = parseInt(dp.getAttribute('data-obs-idx') || '0');
    var photoIdx = parseInt(dp.getAttribute('data-photo-idx') || '0');
    var f = Model.findDeficiency(deficId);
    if (f && f.defic.observations && f.defic.observations[obsIdx]) {
      // S160: gallery cards are built via Model.getEffectivePhotos() (pool-aware).
      // Handler must use the same lookup or post-photo-pool-migration photos won't open.
      var photos = (Model.getEffectivePhotos)
        ? Model.getEffectivePhotos(f.defic, obsIdx)
        : (f.defic.observations[obsIdx].photos || []);
      if (photos.length && window._frtLightbox) {
        // S205: caption lists every pin referencing this binary (its own pin
        // plus any copies). Per-photo label, no global contextLabel.
        photos.forEach(function(p) {
          p._ctxLabel = _phPinLabel(p, '') || ('Pin #' + (f.defic.num || '?'));
        });
        /* S677 — the arrows walk the whole report, not this one observation.
           The tapped photo is still the one that opens; only what lies either
           side of it changes. Falls back to this short list if the record is
           not in the running order. */
        _frtLabelProjectPhotos();
        openInProject(photos[photoIdx] || photos[0], photos, photoIdx, {});
      }
    }
    return;
  }

  // Download site photo
  var dlS = e.target.closest && e.target.closest('[data-action="download-site-photo"]');
  if (dlS) {
    e.stopPropagation();
    var idx = parseInt(dlS.getAttribute('data-photo-idx') || '0');
    var proj = Model.getProject();
    var p = proj && proj.photos && proj.photos[idx];
    if (p) _downloadPhoto(p, 'site_photo_' + (idx+1));
    return;
  }
  // Download defic photo
  var dlD = e.target.closest && e.target.closest('[data-action="download-defic-photo"]');
  if (dlD) {
    e.stopPropagation();
    var did = dlD.getAttribute('data-defic-id');
    var oi = parseInt(dlD.getAttribute('data-obs-idx') || '0');
    var pi = parseInt(dlD.getAttribute('data-photo-idx') || '0');
    var f = Model.findDeficiency(did);
    if (f && f.defic.observations && f.defic.observations[oi]) {
      // S160: pool-aware lookup matches gallery render
      var photosD = (Model.getEffectivePhotos)
        ? Model.getEffectivePhotos(f.defic, oi)
        : (f.defic.observations[oi].photos || []);
      var ph = photosD[pi];
      if (ph) _downloadPhoto(ph, 'defic_' + (f.defic.num || 'x') + '_' + (pi+1));
    }
    return;
  }
  // Delete site photo
  var del = e.target.closest && e.target.closest('[data-action="delete-site-photo"]');
  if (del) {
    e.stopPropagation();
    var idx = parseInt(del.getAttribute('data-photo-idx') || '0');
    showConfirm('Remove Photo', 'Remove this site photo?').then(function(yes) {
      if (yes) {
        Model.removeSitePhoto(idx);
        // Site indices shift after removal — clear selection to be safe
        _selectedUids.clear();
        initPhotos.render();
        toast('Site photo removed');
      }
    });
    return;
  }

  // S265 Photo-Trash Phase 1: soft-delete a DEFIC pool photo. Recoverable from
  // Recently Deleted. Uses removePoolPhoto (sets deleted flag, keeps R2,
  // cascades out of selections). The card vanishes from the live gallery.
  var delD = e.target.closest && e.target.closest('[data-action="delete-defic-photo"]');
  if (delD) {
    e.stopPropagation();
    var ddId = delD.getAttribute('data-defic-id');
    var dpId = delD.getAttribute('data-photo-id');
    showConfirm('Delete Photo', 'Delete this photo? You can restore it from Recently Deleted for ' + _TRASH_RETENTION_DAYS + ' days.').then(function(yes) {
      if (yes && ddId && dpId) {
        try { _stampTrashBadge(ddId, dpId); } catch (e) {}
        var ok = Model.removePoolPhoto(ddId, dpId);
        _selectedUids.delete('defic:' + ddId); // defensive; uid prefix match not needed
        initPhotos.render();
        toast(ok ? 'Photo moved to Recently Deleted' : 'Could not delete photo');
      }
    });
    return;
  }

  // S266: open this gallery photo in the pin editor. Lists every observation
  // (across ALL pins) that references the photo; one match opens that obs
  // directly, multiple shows a picker first. Opens the same focused pin editor
  // the drawing viewer uses (window._frtOpenPinFocus). Defic photos only.
  var goObs = e.target.closest && e.target.closest('[data-action="ph-goto-obs"]');
  if (goObs) {
    e.stopPropagation();
    var goDefId = goObs.getAttribute('data-defic-id');
    var goPhotoId = goObs.getAttribute('data-photo-id');
    var refs = (goDefId && goPhotoId && Model.getAllObsReferencesForPhoto)
      ? Model.getAllObsReferencesForPhoto(goDefId, goPhotoId)
      : [];
    if (!refs.length) {
      // Defensive fallback: open the card's own pin+obs even if reference
      // enumeration came back empty (e.g. a transient model state).
      var fbIdx = parseInt(goObs.getAttribute('data-obs-idx') || '0', 10);
      if (goDefId && typeof window._frtOpenPinFocus === 'function') {
        window._frtOpenPinFocus(goDefId, isNaN(fbIdx) ? undefined : fbIdx);
      }
      return;
    }
    if (refs.length === 1) {
      if (typeof window._frtOpenPinFocus === 'function') {
        window._frtOpenPinFocus(refs[0].deficId, refs[0].obsIdx);
      }
      return;
    }
    _openObsPickerForPhoto(refs);
    return;
  }

  // S266 Photo-Trash: open a Recently-Deleted photo in the lightbox. Re-finds
  // the LIVE photo object (so markup/r2Key are intact) and opens a single-photo
  // viewer. Read-only intent — the photo is still soft-deleted; viewing it does
  // not restore it. Routed by kind.
  var tlb = e.target.closest && e.target.closest('[data-action="ph-trash-lightbox"]');
  if (tlb) {
    e.stopPropagation();
    var tKind = tlb.getAttribute('data-kind');
    var tPhoto = null, tLabel = '';
    if (tKind === 'site') {
      var tSiteIdx = parseInt(tlb.getAttribute('data-site-idx') || '-1', 10);
      var tProj = Model.getProject();
      tPhoto = tProj && tProj.photos && tProj.photos[tSiteIdx];
      tLabel = 'Site Photo \u00b7 deleted';
    } else {
      var tdId = tlb.getAttribute('data-defic-id');
      var tpId = tlb.getAttribute('data-photo-id');
      var tf = tdId && Model.findDeficiency(tdId);
      if (tf && tf.defic && Array.isArray(tf.defic.photos)) {
        tPhoto = tf.defic.photos.filter(function(p) { return p && p.id === tpId; })[0];
      }
      tLabel = (tf && tf.defic ? 'Pin #' + (tf.defic.num || '?') : 'Pin') + ' \u00b7 deleted';
    }
    if (tPhoto && window._frtLightbox) {
      tPhoto._ctxLabel = tLabel;
      window._frtLightbox.open([tPhoto], 0, {});
    } else {
      toast('Photo data not available');
    }
    return;
  }

  // S265 Photo-Trash Phase 1: switch sub-tab (All Photos <-> Recently Deleted).
  var sub = e.target.closest && e.target.closest('[data-action="ph-subtab"]');
  if (sub) {
    e.stopPropagation();
    var tab = sub.getAttribute('data-tab');
    if (tab && tab !== _photoTab) {
      _photoTab = tab;
      initPhotos.render();
    }
    return;
  }

  // S265 Photo-Trash Phase 1: restore a soft-deleted defic photo back into its
  // pin's pool (visible to default-state obs; does NOT force back into a custom
  // selection it was removed from — restorePoolPhoto handles that policy).
  var res = e.target.closest && e.target.closest('[data-action="ph-restore-photo"]');
  if (res) {
    e.stopPropagation();
    var rKind = res.getAttribute('data-kind');
    if (rKind === 'site') {
      var rSiteIdx = parseInt(res.getAttribute('data-site-idx') || '-1', 10);
      var okS = Model.restoreSitePhoto(rSiteIdx);
      initPhotos.render();
      toast(okS ? 'Photo restored to Site Records' : 'Could not restore photo');
    } else {
      var rdId = res.getAttribute('data-defic-id');
      var rpId = res.getAttribute('data-photo-id');
      if (rdId && rpId) {
        // Site-Records fallback: if the parent pin is gone, lands in Site Records.
        var r = Model.restorePoolPhotoOrSiteFallback(rdId, rpId);
        initPhotos.render();
        toast(r && r.ok ? (r.fallback ? 'Pin no longer exists — restored to Site Records' : 'Photo restored') : 'Could not restore photo');
      }
    }
    return;
  }

  // S265 stage 2: PERMANENT delete from Recently Deleted. Admin-only (the button
  // is disabled for inspectors, but re-check here so it can't be forced). A
  // distinct confirm makes clear this can't be undone. R2 object left in place.
  var purge = e.target.closest && e.target.closest('[data-action="ph-purge-photo"]');
  if (purge) {
    e.stopPropagation();
    var canPurge = false;
    try { canPurge = !!(Auth && Auth.isAdmin && Auth.isAdmin()); } catch (ex) { canPurge = false; }
    if (!canPurge) { toast('Only a principal can delete a photo permanently'); return; }
    var pKind = purge.getAttribute('data-kind');
    showConfirm('Delete Permanently', 'Permanently delete this photo? This cannot be undone — it will no longer be recoverable.').then(function(yes) {
      if (!yes) return;
      var done;
      if (pKind === 'site') {
        done = Model.purgeSitePhoto(parseInt(purge.getAttribute('data-site-idx') || '-1', 10));
      } else {
        done = Model.purgePoolPhoto(purge.getAttribute('data-defic-id'), purge.getAttribute('data-photo-id'));
      }
      initPhotos.render();
      toast(done ? 'Photo permanently deleted' : 'Could not delete photo');
    });
    return;
  }

  // S439 — trash grid: toggle selection with shift-click range (mirrors S114)
  var tsel = e.target.closest && e.target.closest('[data-action="ph-trash-toggle"]');
  if (tsel) {
    e.stopPropagation();
    var tuid = tsel.getAttribute('data-uid');
    if (e.shiftKey && _trashLastSel && _trashLastSel !== tuid && _trashOrder.length) {
      var ta = _trashOrder.indexOf(_trashLastSel), tt = _trashOrder.indexOf(tuid);
      if (ta >= 0 && tt >= 0) {
        var tlo = Math.min(ta, tt), thi = Math.max(ta, tt);
        var tOn = !_trashSelected.has(tuid);
        for (var tri = tlo; tri <= thi; tri++) {
          if (tOn) _trashSelected.add(_trashOrder[tri]); else _trashSelected.delete(_trashOrder[tri]);
        }
        _trashLastSel = tuid;
        initPhotos.render();
        return;
      }
    }
    if (_trashSelected.has(tuid)) _trashSelected.delete(tuid); else _trashSelected.add(tuid);
    _trashLastSel = tuid;
    initPhotos.render();
    return;
  }
  var tclr = e.target.closest && e.target.closest('[data-action="ph-trash-clear-sel"]');
  if (tclr) { e.stopPropagation(); _trashSelected.clear(); _trashLastSel = null; initPhotos.render(); return; }

  // S439 — bulk permanent delete (selected / all). Buttons are admin-only in the
  // markup AND the gate is re-verified here so it can't be forced. Site-photo
  // purges run in DESCENDING index order — indices shift as entries are removed.
  function _bulkPurge(uids, title, msg) {
    var can = false;
    try { can = !!(Auth && Auth.isAdmin && Auth.isAdmin()); } catch (ex) { can = false; }
    if (!can) { toast('Only a principal can delete photos permanently'); return; }
    showConfirm(title, msg).then(function(yes) {
      if (!yes) return;
      var recs = _gatherDeletedRecords();
      var map = {}; recs.forEach(function(r) { map[_trashUid(r)] = r; });
      var siteIdxs = [], defics = [];
      uids.forEach(function(u) {
        var r = map[u]; if (!r) return;
        if (r.kind === 'site') siteIdxs.push(r.siteIdx); else defics.push(r);
      });
      var n = 0;
      defics.forEach(function(r) { if (Model.purgePoolPhoto(r.deficId, r.photoId)) n++; });
      siteIdxs.sort(function(a, b) { return b - a; });
      siteIdxs.forEach(function(idx) { if (Model.purgeSitePhoto(idx)) n++; });
      _trashSelected.clear(); _trashLastSel = null;
      initPhotos.render();
      toast(n ? (n + ' photo' + (n === 1 ? '' : 's') + ' permanently deleted') : 'Could not delete photos');
    });
  }
  var tpsel = e.target.closest && e.target.closest('[data-action="ph-trash-purge-selected"]');
  if (tpsel) {
    e.stopPropagation();
    var chosen = Array.prototype.slice.call(_trashSelected);
    if (!chosen.length) return;
    _bulkPurge(chosen, 'Delete Permanently', 'Permanently delete ' + chosen.length + ' selected photo' + (chosen.length === 1 ? '' : 's') + '? This cannot be undone.');
    return;
  }
  var tpall = e.target.closest && e.target.closest('[data-action="ph-trash-purge-all"]');
  if (tpall) {
    e.stopPropagation();
    var allUids = _trashOrder.slice();
    if (!allUids.length) return;
    _bulkPurge(allUids, 'Delete ALL Permanently', 'Permanently delete ALL ' + allUids.length + ' photos in Recently Deleted? This cannot be undone \u2014 none will be recoverable.');
    return;
  }

  // S114 — toggle single photo selection (with shift-click range support)
  var sel = e.target.closest && e.target.closest('[data-action="ph-toggle-photo"]');
  if (sel) {
    e.stopPropagation();
    var uid = sel.getAttribute('data-uid');

    // Shift-click range: select every photo from _lastSelectedUid → uid in render order.
    // Mode of the range matches the new state of the click target (select if checking, deselect if unchecking).
    if (e.shiftKey && _lastSelectedUid && _lastSelectedUid !== uid && _renderOrderUids.length) {
      var anchor = _renderOrderUids.indexOf(_lastSelectedUid);
      var target = _renderOrderUids.indexOf(uid);
      if (anchor >= 0 && target >= 0) {
        var lo = Math.min(anchor, target), hi = Math.max(anchor, target);
        // Direction of toggle = whatever the target is becoming
        var becomingSelected = !_selectedUids.has(uid);
        for (var ri = lo; ri <= hi; ri++) {
          if (becomingSelected) _selectedUids.add(_renderOrderUids[ri]);
          else _selectedUids.delete(_renderOrderUids[ri]);
        }
        _lastSelectedUid = uid;
        initPhotos.render();
        return;
      }
    }

    // Plain click: toggle just this one
    if (_selectedUids.has(uid)) _selectedUids.delete(uid);
    else _selectedUids.add(uid);
    _lastSelectedUid = uid;
    initPhotos.render();
    return;
  }

  // S114 P1.3 — download a site photo
  var dlS = e.target.closest && e.target.closest('[data-action="ph-download-site"]');
  if (dlS) {
    e.stopPropagation();
    var idxS = parseInt(dlS.getAttribute('data-photo-idx') || '0');
    var pjS = Model.getProject();
    var pS = pjS && pjS.photos && pjS.photos[idxS];
    if (pS) _downloadPhoto(pS, 'site_photo_' + (idxS + 1));
    return;
  }
  // S114 P1.3 — download a deficiency photo
  var dlD = e.target.closest && e.target.closest('[data-action="ph-download-defic"]');
  if (dlD) {
    e.stopPropagation();
    var did = dlD.getAttribute('data-defic-id');
    var oi = parseInt(dlD.getAttribute('data-obs-idx') || '0');
    var pi = parseInt(dlD.getAttribute('data-photo-idx') || '0');
    var fD = Model.findDeficiency(did);
    if (fD && fD.defic.observations && fD.defic.observations[oi]) {
      // S160: pool-aware lookup matches gallery render
      var poolD = (Model.getEffectivePhotos)
        ? Model.getEffectivePhotos(fD.defic, oi)
        : (fD.defic.observations[oi].photos || []);
      var phD = poolD[pi];
      if (phD) _downloadPhoto(phD, 'pin_' + (fD.defic.num || 'x') + '_' + (pi + 1));
    }
    return;
  }

  // S216: Move/copy a DEFIC photo to another pin from the gallery. Resolves the
  // gallery's pool-aware photoIdx to the photo's id, then hands off to the proven
  // pin-to-pin mover (shared binary, no R2 re-upload). Site photos are excluded
  // (no source pin) and never render this button.
  var mvD = e.target.closest && e.target.closest('[data-action="ph-move-defic"]');
  if (mvD) {
    e.stopPropagation();
    var mvDid = mvD.getAttribute('data-defic-id');
    var mvOi = parseInt(mvD.getAttribute('data-obs-idx') || '0');
    var mvPi = parseInt(mvD.getAttribute('data-photo-idx') || '0');
    var fMv = Model.findDeficiency(mvDid);
    if (fMv && fMv.defic.observations && fMv.defic.observations[mvOi]) {
      var poolMv = (Model.getEffectivePhotos)
        ? Model.getEffectivePhotos(fMv.defic, mvOi)
        : (fMv.defic.observations[mvOi].photos || []);
      var phMv = poolMv[mvPi];
      if (phMv && phMv.id && window._frtOpenPinPhotoPicker) {
        window._frtOpenPinPhotoPicker(mvDid, mvOi, phMv.id);
      }
    }
    return;
  }

  // S224: send a SITE photo to a pin (opens picker in site-source mode).
  var mvS = e.target.closest && e.target.closest('[data-action="ph-move-site"]');
  if (mvS) {
    e.stopPropagation();
    var mvSi = parseInt(mvS.getAttribute('data-photo-idx') || '0');
    if (window._frtOpenSitePhotoPicker) window._frtOpenSitePhotoPicker(mvSi);
    return;
  }

  // S224: undo a faded move/copy.
  var undoMv = e.target.closest && e.target.closest('[data-action="ph-undo-move"]');
  if (undoMv) {
    e.preventDefault();
    e.stopPropagation();
    var tok = undoMv.getAttribute('data-token');
    if (tok && window._frtUndoPhotoMove) window._frtUndoPhotoMove(tok);
    return;
  }

  // S114 — toggle all photos in a date group
  var dToggle = e.target.closest && e.target.closest('[data-action="ph-toggle-date"]');
  if (dToggle) {
    e.stopPropagation();
    var dateKey = dToggle.getAttribute('data-date-key');
    // Re-derive UIDs in this date group from current model state
    var proj = Model.getProject();
    if (!proj) return;
    var groupUids = [];
    (proj.photos || []).forEach(function(p, i) {
      var dk = _dayKey(p, null);
      if (dk.key === dateKey) groupUids.push('site:' + i);
    });
    Model.getAllDeficiencies(proj).forEach(function(d) {
      var defic = d.defic;
      (defic.observations || []).forEach(function(o, oi) {
        // S120: must mirror the render-time enumeration (pool-aware) so the
        // UIDs the toggle generates match the UIDs the render emitted.
        var eff = (Model.getEffectivePhotos) ? Model.getEffectivePhotos(defic, oi) : (o.photos || []);
        eff.forEach(function(ph, phi) {
          var dk = _dayKey(ph, defic);
          if (dk.key === dateKey) groupUids.push('defic:' + defic.id + ':' + oi + ':' + phi);
        });
      });
    });
    var allSel = groupUids.every(function(u) { return _selectedUids.has(u); });
    if (allSel) groupUids.forEach(function(u) { _selectedUids.delete(u); });
    else groupUids.forEach(function(u) { _selectedUids.add(u); });
    initPhotos.render();
    return;
  }

  // S114 — clear selection
  var clr = e.target.closest && e.target.closest('[data-action="ph-clear-selection"]');
  if (clr) {
    e.stopPropagation();
    _selectedUids.clear();
    initPhotos.render();
    return;
  }

  // Select all currently-visible (filtered) photos — Diesel parity
  var sav = e.target.closest && e.target.closest('[data-action="ph-select-all-visible"]');
  if (sav) {
    e.stopPropagation();
    // _renderOrderUids holds the in-view photo uids in display order. If every
    // visible photo is already selected, toggle to clear (acts as Select all / none).
    var allSelectedNow = _renderOrderUids.length > 0 && _renderOrderUids.every(function(u){ return _selectedUids.has(u); });
    if (allSelectedNow) {
      _renderOrderUids.forEach(function(u){ _selectedUids.delete(u); });
    } else {
      _renderOrderUids.forEach(function(u){ _selectedUids.add(u); });
    }
    initPhotos.render();
    return;
  }

  // S114 — bulk delete selected (SITE PHOTOS ONLY per P1.3 — pin photos must be deleted via pin editor)
  var bd = e.target.closest && e.target.closest('[data-action="ph-delete-selected"]');
  if (bd) {
    e.stopPropagation();
    if (!_selectedUids.size) return;

    // Partition: count site vs pin in current selection
    var siteIdxs = [];
    var pinCount = 0;
    _selectedUids.forEach(function(uid) {
      if (uid.indexOf('site:') === 0) siteIdxs.push(parseInt(uid.slice(5)));
      else if (uid.indexOf('defic:') === 0) pinCount++;
    });

    if (!siteIdxs.length) {
      // S162-2: instead of a dead-end toast, surface a modal that lets the
      // user jump to the relevant pin editor where the existing per-photo
      // delete flow lives. Photos are still not deletable from the gallery
      // (the in-context safety remains), but the path forward is one tap
      // instead of "figure out which pin, navigate yourself."
      var pinMap = {}; // deficId -> { num, count, deficId }
      _selectedUids.forEach(function(uid) {
        if (uid.indexOf('defic:') !== 0) return;
        var did = uid.split(':')[1];
        if (!pinMap[did]) {
          var f = Model.findDeficiency(did);
          var num = (f && f.defic) ? (f.defic.num != null ? f.defic.num : '?') : '?';
          pinMap[did] = { num: num, count: 0, deficId: did };
        }
        pinMap[did].count++;
      });
      var pinList = Object.keys(pinMap).map(function(k) { return pinMap[k]; });
      // Sort by pin number ascending for a stable order
      pinList.sort(function(a, b) {
        var na = parseInt(a.num, 10); var nb = parseInt(b.num, 10);
        if (isNaN(na) && isNaN(nb)) return String(a.num).localeCompare(String(b.num));
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return na - nb;
      });

      var ov = document.createElement('div');
      ov.id = 'gallery-lockout-overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Calibri,sans-serif;';
      var modal = document.createElement('div');
      modal.style.cssText = 'background:var(--bg,#fff);color:var(--fg,#1B2438);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.3);max-width:480px;width:100%;max-height:80vh;overflow-y:auto;padding:20px;';
      var title = (pinList.length === 1)
        ? 'Open Pin ' + esc(String(pinList[0].num)) + ' to delete'
        : 'Pick a pin to open';
      var msg = (pinList.length === 1)
        ? 'Pin photos are deleted from the pin editor, where each photo appears with its observation context. One tap below opens the pin so you can review and delete from there.'
        : 'Your selection includes photos from ' + pinList.length + ' different pins. Pin photos are deleted from the pin editor (each photo appears with its observation context). Pick a pin to open:';
      var btnsHtml = '';
      pinList.forEach(function(p) {
        btnsHtml += '<button class="lockout-jump-btn" data-defic-id="' + esc(p.deficId) + '" '
          + 'style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;margin:6px 0;padding:10px 14px;background:#9C2742;color:#fff;border:none;border-radius:6px;'
          + 'font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));font-weight:600;cursor:pointer;text-align:left;">'
          + '<span>\u2192 Open Pin ' + esc(String(p.num)) + '</span>'
          + '<span style="font-weight:500;font-size:calc(12px + var(--ts));opacity:.85;">' + p.count + ' photo' + (p.count === 1 ? '' : 's') + '</span>'
          + '</button>';
      });
      modal.innerHTML =
        '<div style="font-size:calc(15px + var(--ts));font-weight:700;margin-bottom:10px;">' + esc(title) + '</div>'
        + '<div style="font-size:calc(13px + var(--ts));margin-bottom:14px;color:var(--steel,#455A64);line-height:1.4;">' + esc(msg) + '</div>'
        + btnsHtml
        + '<button id="lockout-cancel" '
        + 'style="display:block;width:100%;margin-top:10px;padding:8px 14px;background:transparent;color:var(--steel,#455A64);'
        + 'border:1.5px solid var(--border,#ccc);border-radius:6px;font-family:Calibri,sans-serif;'
        + 'font-size:calc(13px + var(--ts));cursor:pointer;">Cancel</button>';
      ov.appendChild(modal);
      modal.querySelectorAll('.lockout-jump-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var did = btn.getAttribute('data-defic-id');
          ov.remove();
          if (typeof window._frtOpenPinFocus === 'function') {
            window._frtOpenPinFocus(did);
          } else {
            // Fallback: switch to Deficiencies tab so the user can find the pin manually.
            var tab = document.querySelector('.nav-tab[data-tab="defic"]');
            if (tab) tab.click();
          }
        });
      });
      modal.querySelector('#lockout-cancel').addEventListener('click', function() { ov.remove(); });
      ov.addEventListener('click', function(e) { /* backdrop-click close disabled (accidental dismiss) */ if(false){} });
      document.body.appendChild(ov);
      return;
    }

    var msg = 'Delete ' + siteIdxs.length + ' site photo' + (siteIdxs.length === 1 ? '' : 's') + '?';
    if (pinCount > 0) {
      msg += '\n\n(' + pinCount + ' pin photo' + (pinCount === 1 ? '' : 's')
        + ' in your selection will be skipped — pin photos can only be deleted from the pin editor.)';
    }
    msg += '\n\nThis cannot be undone.';
    showConfirm('Delete site photos?', msg).then(function(yes) {
      if (!yes) return;
      siteIdxs.sort(function(a, b) { return b - a; }); // descending so splices don't shift
      siteIdxs.forEach(function(i) { Model.removeSitePhoto(i); });
      _selectedUids.clear();
      _lastSelectedUid = null;
      initPhotos.render();
      var done = siteIdxs.length + ' site photo' + (siteIdxs.length === 1 ? '' : 's') + ' removed';
      toast(pinCount ? done + ' (' + pinCount + ' pin photo' + (pinCount === 1 ? '' : 's') + ' skipped)' : done);
    });
    return;
  }

  // S114 — toggle filter panel
  var ft = e.target.closest && e.target.closest('[data-action="ph-toggle-filter"]');
  if (ft) {
    e.stopPropagation();
    _filterPanelOpen = !_filterPanelOpen;
    initPhotos.render();
    return;
  }

  // S114 — set filter mode
  var fs = e.target.closest && e.target.closest('[data-action="ph-set-filter"]');
  if (fs) {
    e.stopPropagation();
    _filterMode = fs.getAttribute('data-mode') || 'all';
    _filterPanelOpen = false;
    initPhotos.render();
    return;
  }
});

// S114 — close filter panel on outside click
document.addEventListener('click', function(e) {
  if (!_filterPanelOpen) return;
  if (e.target.closest && e.target.closest('.ph-filter-wrap')) return;
  _filterPanelOpen = false;
  initPhotos.render();
});

// ── Site Photo Upload ───────────────────────────────────
function _downloadPhoto(ph, fallbackName) {
  var src = _r2h(ph.r2Url || ph.dataUrl || '');
  if (!src) { toast('No image source'); return; }
  var fname = ph.filename || (fallbackName + '.jpg');
  if (!/\.(jpe?g|png|webp|gif)$/i.test(fname)) fname += '.jpg';
  fetch(src).then(function(r){return r.blob();}).then(function(blob){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    toast('Downloaded ' + fname);
  }).catch(function(){ window.open(src, '_blank'); });
}

// S130 5.4: image compression moved off the main thread via OffscreenCanvas
// worker. ImageWorkerHost falls back to the legacy main-thread path if the
// worker is unavailable, so behavior is preserved on browsers without
// OffscreenCanvas support.
function _compressSitePhoto(file, cb, onFail) {
  ImageWorkerHost.compressFile(file, {
    /* S702d — raised with every other photo site in the tool (see the note in
       deficiencies.js). Thumbnails are unchanged: they are for the grid, not
       for evidence. */
    /* S709 — raised with every other photo site in the tool. See the note in
       deficiencies.js: 2048/0.85 was undoing the S702j full-resolution still
       immediately after capture. Thumbnails are unchanged: they are for the
       grid, not for evidence. */
    maxW: 4096,
    quality: 0.95,
    thumbMaxW: 200,
    thumbQuality: 0.7
  }).then(function(r) {
    cb(r.dataUrl, r.thumb);
  }).catch(function(err) {
    console.warn('[Photos] Compression failed:', err && err.message);
    if (typeof onFail === 'function') { try { onFail(err); } catch (_) {} }   // S716: serial batch must move on
  });
}

// S367 — minimal EXIF capture-date reader. Photos are dated by when they were
// TAKEN (EXIF DateTimeOriginal), not when uploaded into the app — fixes photos
// shot on the field day but imported later showing the import date. Reads only the
// date tag from the JPEG APP1/EXIF segment; no dependency, no full EXIF parse.
// Returns 'YYYY-MM-DD' or null (caller falls back to upload date).
function _readExifCaptureDate(file) {
  return new Promise(function(resolve){
    try {
      if (!file || !/^image\/jpe?g$/i.test(file.type || '')) { resolve(null); return; }
      var reader = new FileReader();
      reader.onerror = function(){ resolve(null); };
      reader.onload = function(e){
        try {
          var view = new DataView(e.target.result);
          if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) { resolve(null); return; } // not JPEG
          var offset = 2, len = view.byteLength;
          while (offset < len) {
            if (view.getUint16(offset) !== 0xFFE1) {            // not APP1 — skip this marker
              if ((view.getUint16(offset) & 0xFF00) !== 0xFF00) { resolve(null); return; }
              offset += 2 + view.getUint16(offset + 2);
              continue;
            }
            // APP1 (EXIF) segment
            var app1 = offset + 4;
            if (view.getUint32(app1) !== 0x45786966) { resolve(null); return; } // "Exif"
            var tiff = app1 + 6;
            var little = (view.getUint16(tiff) === 0x4949);    // II = little-endian
            function u16(o){ return view.getUint16(o, little); }
            function u32(o){ return view.getUint32(o, little); }
            if (u16(tiff + 2) !== 0x002A) { resolve(null); return; }
            var ifd0 = tiff + u32(tiff + 4);
            // Walk IFD0 to find the EXIF sub-IFD pointer (tag 0x8769).
            var n0 = u16(ifd0), exifIfd = 0;
            for (var i = 0; i < n0; i++) {
              var e0 = ifd0 + 2 + i * 12;
              if (u16(e0) === 0x8769) { exifIfd = tiff + u32(e0 + 8); break; }
            }
            function readDateTag(ifd, tag) {
              if (!ifd) return null;
              var n = u16(ifd);
              for (var j = 0; j < n; j++) {
                var ent = ifd + 2 + j * 12;
                if (u16(ent) === tag) {
                  var cnt = u32(ent + 4);              // ASCII "YYYY:MM:DD HH:MM:SS\0" = 20
                  var valOff = (cnt > 4) ? tiff + u32(ent + 8) : (ent + 8);
                  var s = '';
                  for (var k = 0; k < Math.min(cnt, 19); k++) {
                    var c = view.getUint8(valOff + k); if (!c) break; s += String.fromCharCode(c);
                  }
                  return s;
                }
              }
              return null;
            }
            // Prefer DateTimeOriginal (0x9003); fall back to DateTimeDigitized (0x9004).
            var raw = readDateTag(exifIfd, 0x9003) || readDateTag(exifIfd, 0x9004);
            if (raw) {
              var m = raw.match(/^(\d{4}):(\d{2}):(\d{2})/);   // "YYYY:MM:DD ..."
              if (m) { resolve(m[1] + '-' + m[2] + '-' + m[3]); return; }
            }
            resolve(null); return;
          }
          resolve(null);
        } catch(err){ resolve(null); }
      };
      // Header is enough — EXIF lives in the first APP1 segment near the top.
      reader.readAsArrayBuffer(file.slice(0, 131072));
    } catch(err){ resolve(null); }
  });
}

/* S716: _addSitePhoto retired — its body lives in _addSitePhotoSerial, which
   the shared serial batch drives. See _handleSitePhotoFiles. */

/* ═══ S716 — THE GALLERY USES THE SAME INTAKE AS A DEFICIENCY. ═══════════════
   Until now this fanned every file out to _addSitePhoto at once: 140 shots
   decoded together, 140 photographs written into the report as text, and a
   whole-report save plus a gallery redraw per photo. That was the field
   crash after S715 — S713/S714/S715 had fixed the deficiency copy of this
   code and this copy had received none of it.

   Now: strictly one at a time; saves held for the batch and written ONCE at
   the close; burst shots proven into photoBlobs by the shared step and born
   with the shutter's thumb and no inline image; uploads read from the store
   afterwards, one blob at a time. Foreign files (picker, drag-drop) still go
   through _addSitePhoto, just serially. */
function _handleSitePhotoFiles(files) {
  var list = Array.from(files || []).filter(function (f) {
    return f && ((f._burstK) || (f.type && f.type.startsWith('image/')));
  });
  if (!list.length) return;
  var pid = new URLSearchParams(window.location.search).get('project');
  var uploadRecs = [], added = 0;
  try { Model.holdSaves(true); } catch (_) {}
  toast('Adding ' + list.length + ' photo' + (list.length === 1 ? '' : 's') + '\u2026', 2500);
  runSerial(list, function (f) {
    if (!f._burstK) { return _addSitePhotoSerial(f); }
    return proveBurstShot(f, 'sph').then(function (p) {
      var photo = {
        id: p.id,
        filename: p.filename,
        dataUrl: null,                       // S715/S716: the photograph is in photoBlobs
        thumb: p.thumb,
        caption: '',
        addedDate: new Date().toISOString().split('T')[0]
      };
      var rec = Model.addSitePhoto(photo);
      if (!rec) throw new Error('model refused site photo');
      added++;
      uploadRecs.push(rec);
      // handedOff is EARNED here — after the bytes are proven and the record
      // exists — never at Done.
      if (window._arcBurstMarkHandedOff) { try { window._arcBurstMarkHandedOff([f._burstK]); } catch (_) {} }
    });
  }, function (ok) {
    try { Model.holdSaves(true); } catch (_) {}   // progress re-arms the expiry
  }).then(function () {
    try { Model.holdSaves(false); } catch (_) {}
    try { Model.saveNow(); } catch (_) {}
    initPhotos.render();
    toast(added + ' site photo' + (added === 1 ? '' : 's') + ' added');
    if (pid && uploadRecs.length) {
      uploadFromStore(pid, uploadRecs, function () { try { Model.saveNow(); } catch (_) {} });
    }
  });
}

/* S716: a foreign file (picker / drag-drop) through the original path, but as
   a promise so runSerial can wait for it. The body is _addSitePhoto's,
   unchanged, minus the per-photo save and redraw the batch now owns. */
function _addSitePhotoSerial(file) {
  return new Promise(function (resolve) {
    _readExifCaptureDate(file).then(function (captureDate) {
      _compressSitePhoto(file, function (dataUrl, thumb) {
        var proj = Model.getProject();
        if (!proj) { resolve(); return; }
        if (!proj.photos) proj.photos = [];
        var photo = {
          id: 'sph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          filename: file.name,
          dataUrl: dataUrl,
          thumb: thumb,
          caption: '',
          addedDate: captureDate || new Date().toISOString().split('T')[0]
        };
        proj.photos.push(photo);
        var pid = new URLSearchParams(window.location.search).get('project');
        if (pid) {
          R2.uploadPhotoOriginal(pid, photo, file).then(function () { Model.saveNow(); })
            .catch(function (err) {
              photo.r2UploadFailed = true;
              Model.saveNow();
              console.warn('[R2] site photo original upload failed:', err && err.message);
            });
        }
        resolve();
      }, function () { resolve(); });            // S716: compression failed → skip, keep going
    }).catch(function () { resolve(); });
  });
}

// S479e: window._handleSitePhotoDrop exposure retired — the inline ondrop that
// called it died with the hand-built zone; the engine's delegated drop feeds
// _handleSitePhotoFiles directly via onFiles.

// ── S79: Photo bulk-action helpers ──────────────────────
function _collectSelected() {
  // Returns [{type:'site', idx, card} | {type:'defic', deficId, obsIdx, photoIdx, card}]
  var out = [];
  document.querySelectorAll('#panel-photos .ph-card.selected').forEach(function(c) {
    if (c.classList.contains('ph-card-site')) {
      var img = c.querySelector('img[data-action="open-site-lightbox"]');
      var idx = img ? parseInt(img.getAttribute('data-photo-idx') || '-1') : -1;
      if (idx >= 0) out.push({ type:'site', idx: idx, card: c });
    } else if (c.classList.contains('ph-card-defic')) {
      var deficId = c.getAttribute('data-defic-id');
      var obsIdx = parseInt(c.getAttribute('data-obs-idx') || '0');
      var photoIdx = parseInt(c.getAttribute('data-photo-idx') || '0');
      if (deficId) out.push({ type:'defic', deficId: deficId, obsIdx: obsIdx, photoIdx: photoIdx, card: c });
    }
  });
  return out;
}

function _clearSelection() {
  // S327: clear the SELECTION SET (source of truth for count, Delete-N, reassign),
  // not just the .selected CSS class. Previously this cleared only the class, so
  // after "Clear" / exiting select mode the Set still held stale uids — the toolbar
  // kept showing "N selected" and a subsequent Delete targeted the supposedly-cleared
  // photos. Re-render so the cleared state is reflected.
  _selectedUids.clear();
  _lastSelectedUid = null;
  document.querySelectorAll('#panel-photos .ph-card.selected').forEach(function(c) {
    c.classList.remove('selected');
  });
  if (initPhotos && initPhotos.render) initPhotos.render();
}

function _toggleSelectMode(on) {
  if (on === undefined) on = !document.body.classList.contains('photos-select-mode');
  document.body.classList.toggle('photos-select-mode', on);
  if (!on) _clearSelection();
  var btn = document.getElementById('photo-actions-btn');
  if (btn) btn.textContent = on ? 'Actions \u25BE \u2022 Select mode' : 'Actions \u25BE';
  return on;
}

function _doBulkDelete() {
  var sel = _collectSelected();
  if (!sel.length) { toast('No photos selected'); return; }
  var siteItems = sel.filter(function(s){ return s.type === 'site'; });
  var deficItems = sel.filter(function(s){ return s.type === 'defic'; });
  if (!siteItems.length) {
    toast('Deficiency photos can only be removed from the pin editor');
    return;
  }
  var msg = 'Delete ' + siteItems.length + ' site photo' + (siteItems.length!==1?'s':'') + '?';
  if (deficItems.length) msg += '\n(' + deficItems.length + ' deficiency photo' + (deficItems.length!==1?'s':'') + ' will be skipped — remove from pin editor)';
  showConfirm('Delete photos', msg).then(function(ok) {
    if (!ok) return;
    var proj = Model.getProject();
    if (!proj) return;
    // Collect r2Keys before splicing (indices shift after each remove)
    var toDelete = siteItems.map(function(s){
      var p = (proj.photos || [])[s.idx];
      return { idx: s.idx, r2Key: (p && p.r2Key) || null, id: (p && p.id) || null };
    });
    // Sort descending so splicing doesn't shift earlier indices
    toDelete.sort(function(a,b){ return b.idx - a.idx; });
    toDelete.forEach(function(d){
      Model.removeSitePhoto(d.idx);
      // S481: route through the no-orphan-delete guard. User trash IS a
      // deliberate delete (force:true), but still compute remaining refs so
      // we never yank a key another live photo still shares, and only drop
      // local bytes when nothing else references the image.
      var _refs = (d.r2Key && Model.findPhotosByR2Key) ? Model.findPhotosByR2Key(d.r2Key).filter(function(s){ return s && s.photo; }).length : 0;
      if (d.r2Key && R2 && R2.delPhotoGuarded) {
        R2.delPhotoGuarded(d.r2Key, { force: (_refs === 0), refCount: _refs, photoId: d.id }).catch(function(){});
      } else if (d.r2Key && R2 && R2.del && _refs === 0) {
        R2.del(d.r2Key).catch(function(){});
      }
      if (d.id && _refs === 0) IDB.del('photoBlobs', d.id).catch(function(){});
    });
    _toggleSelectMode(false);
    initPhotos.render();
    toast(siteItems.length + ' photo' + (siteItems.length!==1?'s':'') + ' deleted' + (deficItems.length ? ' (' + deficItems.length + ' defic skipped)' : ''));
  });
}

function _openReassignModal(presetPinOnly) {
  var sel = _collectSelected();
  if (!sel.length) { toast('No photos selected'); return; }
  var proj = Model.getProject();
  if (!proj) return;
  var allDefics = Model.getAllDeficiencies(proj);

  var opts = '<option value="">\u2014 Choose destination \u2014</option>';
  if (!presetPinOnly) opts += '<option value="__site__">\uD83D\uDCF7 Photo Gallery (site)</option>';
  opts += '<optgroup label="Pins">';
  allDefics.forEach(function(r) {
    var desc = ((r.defic.observations && r.defic.observations[0] && r.defic.observations[0].text) || r.defic.description || '(no description)');
    if (desc.length > 40) desc = desc.substring(0,37) + '...';
    var pr = r.defic.priority === 'general' ? ' [Site]' : r.defic.priority === 'low' ? ' [Low]' : '';
    opts += '<option value="' + r.defic.id + '">Pin #' + r.defic.num + pr + ' \u2014 ' + _phEsc(desc) + '</option>';
  });
  opts += '</optgroup>';

  var overlay = document.createElement('div');
  overlay.className = 'ph-reassign-overlay';
  overlay.id = 'ph-reassign-overlay';
  overlay.innerHTML =
    '<div class="ph-reassign-card">'
      + '<h3>' + (presetPinOnly ? 'Assign' : 'Reassign') + ' ' + sel.length + ' Photo' + (sel.length!==1?'s':'') + '</h3>'
      + '<p style="font-size:calc(12px + var(--ts));color:var(--steel);margin:0 0 12px;">Move selected photos to a different pin' + (presetPinOnly ? '' : ' or to site photos') + '.</p>'
      + '<select id="ph-reassign-dest">' + opts + '</select>'
      + '<div class="btn-row">'
        + '<button class="btn btn-outline btn-sm" data-ph-modal="cancel">Cancel</button>'
        + '<button class="btn btn-primary btn-sm" data-ph-modal="confirm">Move</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(ev){
    /* backdrop close disabled */ if(false){}
    var act = ev.target.closest && ev.target.closest('[data-ph-modal]');
    if (!act) return;
    if (act.getAttribute('data-ph-modal') === 'cancel') { overlay.remove(); return; }
    var d = document.getElementById('ph-reassign-dest');
    if (!d || !d.value) { toast('Select a destination'); return; }
    _doReassign(d.value, sel);
    overlay.remove();
  });
}

// S266: when a gallery photo is referenced by more than one observation, the
// "open in pin editor" button shows this picker first. Lists every reference
// (Pin N · Obs A) across all pins; choosing one opens the same focused pin
// editor the drawing viewer uses, on that observation. Mirrors the
// ph-reassign-overlay modal pattern (backdrop-click + data-ph-modal cancel).
function _openObsPickerForPhoto(refs) {
  if (!refs || !refs.length) return;
  var rows = '';
  refs.forEach(function(r, i) {
    rows += '<button class="ph-obspick-row" data-ph-obspick="' + i + '">'
      + '<span class="ph-obspick-dot"></span>'
      + '<span class="ph-obspick-label">' + _phEsc(r.label) + '</span>'
      + '<span class="ph-obspick-arrow">\u2197</span>'
      + '</button>';
  });
  var overlay = document.createElement('div');
  overlay.className = 'ph-reassign-overlay';
  overlay.id = 'ph-obspick-overlay';
  overlay.innerHTML =
    '<div class="ph-reassign-card">'
      + '<h3>Open in pin editor</h3>'
      + '<p style="font-size:calc(12px + var(--ts));color:var(--steel);margin:0 0 12px;">This photo is used by ' + refs.length + ' observations. Choose which one to open.</p>'
      + '<div class="ph-obspick-list">' + rows + '</div>'
      + '<div class="btn-row">'
        + '<button class="btn btn-outline btn-sm" data-ph-modal="cancel">Cancel</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(ev) {
    /* backdrop close disabled */ if(false){ overlay.remove(); return; }
    var cancel = ev.target.closest && ev.target.closest('[data-ph-modal="cancel"]');
    if (cancel) { overlay.remove(); return; }
    var pick = ev.target.closest && ev.target.closest('[data-ph-obspick]');
    if (pick) {
      var idx = parseInt(pick.getAttribute('data-ph-obspick'), 10);
      var ref = refs[idx];
      overlay.remove();
      if (ref && typeof window._frtOpenPinFocus === 'function') {
        window._frtOpenPinFocus(ref.deficId, ref.obsIdx);
      }
    }
  });
}

function _doReassign(destVal, selItems) {
  var proj = Model.getProject();
  if (!proj) return;
  var moved = 0;
  var skipped = 0;

  // Dedup-aware push into a destination pin's S120 photo pool. Mirrors
  // Model.copyPhotoToPin's identity check (r2Key||sourceR2Key) so site-sourced
  // photos don't create duplicate pool entries. Used by the SITE-source paths
  // only; defic-source moves delegate to Model.movePhotoToPin (which dedups +
  // carries marked-photo linkage on its own).
  function _dedupPushToPool(defic, rec) {
    if (!Array.isArray(defic.photos)) defic.photos = [];
    var key = rec.r2Key || rec.sourceR2Key || null;
    if (key) {
      for (var i = 0; i < defic.photos.length; i++) {
        var ex = defic.photos[i];
        if (ex && !ex.deleted && (ex.r2Key || ex.sourceR2Key) === key) return ex;
      }
    }
    if (!rec.id) rec.id = 'ph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    if (!rec.sourceR2Key) rec.sourceR2Key = rec.r2Key || null;
    if (!rec.addedDate) rec.addedDate = new Date().toISOString().split('T')[0];
    defic.photos.push(rec);
    defic._photoPoolMigrated = true;
    (defic.observations || []).forEach(function(o) {
      if (o && Array.isArray(o.photoSelection)) o.photoSelection.push(rec.id);
    });
    return rec;
  }

  // ---- DEFIC SOURCES: delegate to Model.movePhotoToPin -----------------------
  // Each (deficId, photoId) pair is resolved, deduped, marked-linked, removed
  // from source, and notified by the Model. We only collect ids here; we never
  // touch obs.photos / pools / photoSelection by hand (that was the S218 bug).
  // Skip no-op moves (same pin) and any non-pin destination (site handled below).
  if (destVal !== '__site__') {
    selItems.forEach(function(s) {
      if (s.type !== 'defic') return;
      if (destVal === s.deficId) { skipped++; return; }
      var f = Model.findDeficiency(s.deficId);
      if (!f) { skipped++; return; }
      var effective = (Model.getEffectivePhotos)
        ? Model.getEffectivePhotos(f.defic, s.obsIdx)
        : ((f.defic.observations || [])[s.obsIdx] || {}).photos || [];
      var srcRec = effective[s.photoIdx];
      if (!srcRec || !srcRec.id) { skipped++; return; }
      var res = Model.movePhotoToPin(s.deficId, srcRec.id, destVal);
      if (res) moved++; else skipped++;
    });
  } else {
    // Defic -> Site (S222, Option A): per-OBSERVATION scope. Moving a photo to
    // Site removes it from THIS observation's view only — never pin-wide. The
    // earlier code called removePoolPhoto, which soft-deletes at the pool level
    // and cascades the removal to every sibling obs showing the same photo
    // (default-state obs implicitly show the whole pool). That was the S221
    // confirmed bug. Correct behavior (Mark, S222): the photo leaves this obs
    // and lands in Site immediately; any sibling obs still referencing the same
    // binary keeps it, so a shared photo legitimately appears in BOTH the pin
    // and Site (same R2 binary, two references — no re-upload, no duplication
    // of the file itself).
    selItems.forEach(function(s) {
      if (s.type !== 'defic') return;
      var f = Model.findDeficiency(s.deficId);
      if (!f) { skipped++; return; }
      var effective = (Model.getEffectivePhotos)
        ? Model.getEffectivePhotos(f.defic, s.obsIdx)
        : ((f.defic.observations || [])[s.obsIdx] || {}).photos || [];
      var srcRec = effective[s.photoIdx];
      if (!srcRec || !srcRec.id) { skipped++; return; }
      // Snapshot the binary BEFORE we narrow the obs (removePhotoFromObs never
      // touches the pool entry, so srcRec stays live — but clone defensively).
      var rec = Object.assign({}, srcRec);
      // S687: the copy starts life LIVE, said through the shared law. This
      // hand-cleared two of the four fields a delete writes; the canonical two
      // rode along on the clone. Not reachable today (the gallery never offers
      // a deleted photo to move), but a record that says deleted canonically
      // and live legacily shows up in neither the gallery nor the trash.
      try {
        if (window.PhotoLifecycle) window.PhotoLifecycle.markLive(rec);
        else { delete rec.deleted; delete rec.deletedDate; }
      } catch (e) { delete rec.deleted; delete rec.deletedDate; }
      // Drop ONLY this obs's reference. removePhotoFromObs handles both
      // custom-state (filter the ID out of photoSelection) and default-state
      // (narrow to "all pool except this") obs, and deliberately leaves the
      // pool + every sibling obs untouched.
      if (Model.removePhotoFromObs) {
        Model.removePhotoFromObs(s.deficId, s.obsIdx, srcRec.id);
      } else {
        // Defensive fallback (older Model without the helper): narrow custom-
        // state only. Never call removePoolPhoto here — that is the bug.
        var obs0 = (f.defic.observations || [])[s.obsIdx];
        if (obs0 && Array.isArray(obs0.photoSelection)) {
          obs0.photoSelection = obs0.photoSelection.filter(function(id){ return id !== srcRec.id; });
        }
      }
      // Always release the binary to Site, deduping against any live Site photo
      // already pointing at the same binary (mirrors the removeDeficiency
      // release guard, model.js ~2031) so the same R2 object never lands in
      // proj.photos twice.
      if (!proj.photos) proj.photos = [];
      var key = rec.r2Key || rec.sourceR2Key || null;
      var already = key && proj.photos.some(function(sp) {
        return sp && !sp.deleted && (sp.r2Key || sp.sourceR2Key) === key;
      });
      if (already) { moved++; return; } // binary already in Site; obs narrowed
      rec.id = 'sp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      if (!rec.caption) rec.caption = '';
      if (!rec.sourceR2Key) rec.sourceR2Key = rec.r2Key || null;
      rec.addedDate = new Date().toISOString();
      proj.photos.push(rec);
      moved++;
    });
  }

  // ---- SITE SOURCES ----------------------------------------------------------
  // Delegate to the canonical Model.moveSitePhotoToPin (S224): copies to the pin
  // sharing the binary via _photoIdentityKey dedup, mints a new pool ref with its
  // own id, then removes the site entry by re-resolving its index defensively
  // (indexOf, NOT the captured s.idx). The previous hand-rolled path spliced by
  // the stale s.idx and deduped on r2Key||sourceR2Key instead of the byte-aware
  // _photoIdentityKey — the "misaligned pool write" (site→pin) bug.
  // Resolve to live photo references FIRST (so batch removals can't shift indices
  // out from under us), then move each.
  var siteRefs = selItems.filter(function(s){ return s.type === 'site'; })
    .map(function(s){ return (proj.photos || [])[s.idx]; })
    .filter(function(p){ return p && !p.deleted; });
  siteRefs.forEach(function(src) {
    if (destVal === '__site__') { skipped++; return; } // no-op
    var idx = (proj.photos || []).indexOf(src);
    if (idx < 0) { skipped++; return; }
    var res = Model.moveSitePhotoToPin(idx, destVal);
    if (res && res.copy) moved++; else skipped++;
  });

  Model.saveNow();
  _toggleSelectMode(false);
  initPhotos.render();
  toast(moved + ' photo' + (moved!==1?'s':'') + ' moved' + (skipped ? ' (' + skipped + ' skipped)' : ''));
}

function _phEsc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Click delegation: in photos-select-mode, a click anywhere on a ph-card toggles
// that photo's REAL selection state (_selectedUids), with shift-click range parity
// to the checkbox path. Capture phase + stop so it pre-empts the lightbox open.
// S327 (B5): previously this only toggled the .selected CSS class and never touched
// _selectedUids — so the count, Delete-N, Select-all and Clear all read empty in
// select mode. Now it drives the same selection set the checkboxes do.
document.addEventListener('click', function(e) {
  if (!document.body.classList.contains('photos-select-mode')) return;
  var card = e.target.closest && e.target.closest('#panel-photos .ph-card');
  if (!card) return;
  // Ignore clicks on hover buttons (they're display:none in select mode but defensive)
  if (e.target.closest('.ph-hover-btn')) return;
  // S224: never swallow the Undo button — it must work regardless of select mode.
  if (e.target.closest('.ph-undo-btn')) return;
  // Let a direct checkbox click fall through to the normal ph-toggle-photo handler
  // (otherwise we'd toggle twice and cancel out).
  if (e.target.closest('[data-action="ph-toggle-photo"]')) return;
  var cb = card.querySelector('.ph-check[data-uid]');
  if (!cb) return;
  var uid = cb.getAttribute('data-uid');
  if (!uid) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  // Shift-click range — mirrors the checkbox handler (S114 P1.3).
  if (e.shiftKey && _lastSelectedUid && _lastSelectedUid !== uid && _renderOrderUids.length) {
    var anchor = _renderOrderUids.indexOf(_lastSelectedUid);
    var target = _renderOrderUids.indexOf(uid);
    if (anchor >= 0 && target >= 0) {
      var lo = Math.min(anchor, target), hi = Math.max(anchor, target);
      var becomingSelected = !_selectedUids.has(uid);
      for (var ri = lo; ri <= hi; ri++) {
        if (becomingSelected) _selectedUids.add(_renderOrderUids[ri]);
        else _selectedUids.delete(_renderOrderUids[ri]);
      }
      _lastSelectedUid = uid;
      initPhotos.render();
      return;
    }
  }
  if (_selectedUids.has(uid)) _selectedUids.delete(uid);
  else _selectedUids.add(uid);
  _lastSelectedUid = uid;
  initPhotos.render();
}, true);

// Wire upload buttons
// Photo Gallery toolbar — delegated wiring (S78 fix: top-level getElementById ran before DOM existed)
// S479e: the upload-link / Upload / Camera branches are RETIRED — the shared
// engine (data-action="gal-pi-*") owns every way a photo enters this page.
document.addEventListener('click', function(e) {
  var t = e.target.closest && e.target.closest('button');
  if (!t || !t.id) return;
  if (t.id === 'photo-actions-btn') {
    var ex = document.getElementById('photo-actions-pop');
    if (ex) { ex.remove(); return; }
    var pop = document.createElement('div');
    pop.id = 'photo-actions-pop'; pop.className = 'card-context-menu';
    pop.style.cssText = 'display:block;position:fixed;z-index:9000;';
    var selMode = document.body.classList.contains('photos-select-mode');
    pop.innerHTML =
      '<button data-ph-act="toggle-sel">' + (selMode ? '\u2715 Exit select mode' : '\u2610 Enter select mode') + '</button>'
      + '<div class="separator"></div>'
      + '<button data-ph-act="sel-all">Select all</button>'
      + '<button data-ph-act="desel-all">Deselect all</button>'
      + '<div class="separator"></div>'
      + '<button data-ph-act="export">\u2B07 Export selected</button>'
      + '<button data-ph-act="reassign">\u2197 Reassign selected</button>'
      + '<button data-ph-act="pin">\uD83D\uDCCC Assign to Pin</button>'
      + '<div class="separator"></div>'
      + '<button data-ph-act="delete" class="danger">\uD83D\uDDD1\uFE0F Delete selected</button>';
    document.body.appendChild(pop);
    var rA = t.getBoundingClientRect();
    pop.style.cssText += ';position:fixed!important;bottom:auto!important;right:auto!important;height:auto!important;max-height:none!important;';
    pop.style.top = (rA.bottom + 4) + 'px';
    pop.style.left = Math.min(rA.left, window.innerWidth - 240) + 'px';
    setTimeout(function(){ document.addEventListener('click', function close(ev){
      var act = ev.target.closest && ev.target.closest('[data-ph-act]');
      if (act) {
        var a = act.getAttribute('data-ph-act');
        if (a === 'toggle-sel') {
          _toggleSelectMode();
        } else if (a === 'sel-all') {
          if (!document.body.classList.contains('photos-select-mode')) _toggleSelectMode(true);
          // S327: select all VISIBLE photos into the selection SET (source of
          // truth), not just the CSS class — otherwise Delete/Reassign (which
          // read _selectedUids) saw nothing selected. Mirrors the toolbar's
          // ph-select-all-visible path.
          _renderOrderUids.forEach(function(u){ _selectedUids.add(u); });
          var n = _selectedUids.size;
          if (initPhotos && initPhotos.render) initPhotos.render();
          toast(n + ' photo' + (n!==1?'s':'') + ' selected');
        } else if (a === 'desel-all') {
          _clearSelection();
          toast('Cleared selection');
        } else if (a === 'export') {
          var sel = document.querySelectorAll('#panel-photos .ph-card.selected');
          if (!sel.length) { toast('No photos selected'); }
          else {
            toast('Exporting ' + sel.length + ' photo' + (sel.length>1?'s':'') + '...');
            sel.forEach(function(c, i){ setTimeout(function(){
              var img = c.querySelector('img'); if (!img || !img.src) return;
              var a2 = document.createElement('a'); a2.href = img.src; a2.download = 'ARENCON_photo_' + (i+1) + '.jpg';
              document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
            }, i * 400); });
          }
        } else if (a === 'reassign') {
          _openReassignModal(false);
        } else if (a === 'pin') {
          _openReassignModal(true);
        } else if (a === 'delete') {
          _doBulkDelete();
        }
        pop.remove();
      } else if (!ev.target.closest('#photo-actions-pop')) {
        pop.remove();
      }
      document.removeEventListener('click', close);
    }); }, 10);
  } else if (t.id === 'photo-filters-btn') {
    var ex2 = document.getElementById('photo-filter-pop');
    if (ex2) { ex2.remove(); return; }
    var pop2 = document.createElement('div');
    pop2.id = 'photo-filter-pop'; pop2.className = 'card-context-menu';
    pop2.style.cssText = 'display:block;position:fixed;z-index:9000;';
    pop2.innerHTML =
      '<button data-ph-filt="all">All photos</button>'
      + '<button data-ph-filt="deficiency">Deficiency photos</button>'
      + '<button data-ph-filt="general">General photos</button>'
      + '<button data-ph-filt="site">Site photos</button>';
    document.body.appendChild(pop2);
    var rF = t.getBoundingClientRect();
    pop2.style.cssText += ';position:fixed!important;bottom:auto!important;right:auto!important;height:auto!important;max-height:none!important;';
    pop2.style.top = (rF.bottom + 4) + 'px';
    pop2.style.left = Math.min(rF.left - 100, window.innerWidth - 200) + 'px';
    setTimeout(function(){ document.addEventListener('click', function close2(ev){
      var f = ev.target.closest && ev.target.closest('[data-ph-filt]');
      if (f) {
        var mode = f.getAttribute('data-ph-filt');
        document.querySelectorAll('#panel-photos .photo-card, #panel-photos [data-photo-type]').forEach(function(c){
          var type = (c.getAttribute('data-photo-type') || '').toLowerCase();
          var show = mode === 'all' || type === mode;
          c.style.display = show ? '' : 'none';
        });
        toast('Showing: ' + mode);
        pop2.remove();
      } else if (!ev.target.closest('#photo-filter-pop')) {
        pop2.remove();
      }
      document.removeEventListener('click', close2);
    }); }, 10);
  }
});

// S479e: the legacy hidden-input change handlers and the window drop hook are
// RETIRED with the hand-built zone — the shared engine owns file pick, camera,
// and drag & drop on its own .obs-media-col. _handleSitePhotoFiles remains the
// single storage entry the engine feeds.

// ────────────────────────────────────────────────────────────────────────
// Markup SAVE handler (frt-markup-saved) — NEVER-BAKE model (S351+).
//
// Vector strokes are the ONLY markup persistence. The photo's stored binary is
// always the CLEAN original; strokes + rotation composite at render time
// (lightbox overlay, gallery thumb, PDF). No marked binary is ever uploaded.
//
// Flow on FIRST markup:
//   1. Capture pre-markup r2Key/r2Url + any clean blob the engine handed us.
//   2. Create a visible "(original)" backup Site Record. Give it its OWN
//      /original/ R2 key (a distinct clean copy) so the gallery renders it as a
//      separate tile instead of collapsing it onto the working photo (S363).
//   3. Stamp the working photo (+ every sibling sharing the binary) with the
//      vector strokes, the authoring frame (_mkFrame), _annotated, _origBackupId.
//   4. Move the MARKED photo's date to TODAY; the backup keeps the ORIGINAL
//      capture date (S365).
//   5. Persist + render.
//
// Flow on RE-SAVE (existing backup): just re-stamp strokes. If all strokes were
// erased, auto-delete the backup + roll the date back (symmetric lifecycle).
//
// Cases: 1 = existing backup (re-save / erase-all). 2 = first markup, photo has
// an R2 key (upload distinct /original/ copy). 3 = first markup, no R2 key
// (upload the clean original, then back it up). 4 = no original source at all
// (markup persists but Revert won't work — should be unreachable in normal flow).
// ────────────────────────────────────────────────────────────────────────
document.addEventListener('frt-markup-saved', function(e) {
  var d = e.detail; if (!d || !d.blob || !d.photo) { console.warn('[Markup save] missing detail/blob/photo'); return; }
  var photo = d.photo;
  var proj = Model.getProject(); if (!proj) { console.warn('[Markup save] no project'); return; }
  var pid = proj.id || proj.projectId; if (!pid) { console.warn('[Markup save] no project id'); return; }

  var preKey = photo.r2Key || '';
  var preUrl = photo.r2Url || '';
  var origBlobSrc = photo._origBlob || null;
  var existingBackupId = photo._origBackupId || null;

  // S115 P8: detect corrupted state — preKey points at the /marked/ folder.
  // This means the photo was previously marked up but its _origBackupId got
  // cleared (e.g. by a bad earlier revert that restored to a marked-path
  // backup). Treat as if preKey were empty so we fall to CASE 3 (upload
  // _origBlob) or CASE 4 (no backup).
  var preKeyIsMarked = preKey && preKey.indexOf('/marked/') >= 0;
  if (preKeyIsMarked) {
    console.warn('[Markup save] preKey points at /marked/ folder — treating as no preKey (corrupted state recovery):', preKey);
    preKey = '';
    preUrl = '';
  }

  console.log('[Markup save] start', {
    photoId: photo.id,
    preKey: preKey,
    preKeyWasMarked: preKeyIsMarked,
    hasOrigBlob: !!origBlobSrc,
    existingBackupId: existingBackupId,
    isReSave: !!existingBackupId
  });

  // S367 cleanup: the old baked model computed a /marked/ R2 key here and uploaded
  // a flattened marked JPEG. Never-bake (S351+) stores only vector strokes, so the
  // marked key/upload is gone. Only workerUrl is still needed (for /original/ backup URLs).
  var workerUrl = (R2 && R2.WORKER_URL) ? R2.WORKER_URL : 'https://arencon-r2-worker.hezhendong999.workers.dev';

  // ── Date logic ──
  var origAddedDate = photo.addedDate || photo.date || '';
  if (!origAddedDate && photo.id) {
    var idMatch = String(photo.id).match(/[a-z]+_(\d{13})/);
    if (idMatch) {
      try { origAddedDate = new Date(parseInt(idMatch[1])).toISOString().split('T')[0]; } catch(_){}
    }
  }
  var todayStr = new Date().toISOString().split('T')[0];

  // ── Helper: create the (original) backup record in the gallery ──
  function _createBackup(backupKey, backupUrl) {
    var origCaption = photo.caption ? (photo.caption + ' (original)') : 'Original';
    var backup = {
      id: 'sph_orig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      filename: photo.filename || ('photo_orig.jpg'),
      dataUrl: null,
      thumb: photo.thumb || '',
      caption: origCaption,
      addedDate: origAddedDate || todayStr,
      r2Key: backupKey,
      r2Url: backupUrl,
      r2Status: 'uploaded',
      _isOrigBackup: true
    };
    Model.addSitePhoto(backup);
    return backup.id;
  }

  // ── Helper: stamp marked R2 location + flags on every sibling ──
  function _stampSiblings(backupId) {
    // Find siblings AT THIS MOMENT (after backup creation, so we can exclude it).
    var siblings = preKey
      ? Model.findPhotosByR2Key(preKey).filter(function(s){ return !s.photo._isOrigBackup; })
      : Model.findPhotosById(photo.id).filter(function(s){ return !s.photo._isOrigBackup; });
    if (!siblings.some(function(s){ return s.photo === photo; })) {
      siblings.push({ photo: photo, location: { type: 'unknown' } });
    }
    // S351c NEVER-BAKE: do NOT repoint r2Key/r2Url/dataUrl/thumb to a marked
    // binary. The photo's display source stays the CLEAN image; rotation +
    // vector strokes composite at render time (lightbox overlay, gallery thumb,
    // PDF). Stamping a marked URL here is what made the gallery show a baked
    // image (so rotation/strokes looked frozen). We only persist the vector
    // strokes, the authoring frame, the annotated flag, and the backup link.
    siblings.forEach(function(s){
      var sp = s.photo; if (!sp) return;
      sp._annotated = (d.strokes && d.strokes.length) > 0;
      if (backupId) sp._origBackupId = backupId;
      if (d.strokes) sp._markupStrokes = d.strokes;     // re-editable vector markup
      if (d.mkFrame) sp._mkFrame = d.mkFrame;           // authoring frame (deterministic compositing)
      // S365: the MARKED photo moves to TODAY (you marked it up today); the clean
      // backup keeps the ORIGINAL capture date (set in _createBackup). Only stamp
      // photos that actually carry strokes — never the backup record.
      if (d.strokes && d.strokes.length && !sp._isOrigBackup && sp.addedDate !== todayStr) {
        sp.addedDate = todayStr;
      }
    });
    Model.saveNow();
    try { if (typeof Model !== 'undefined' && Model.touch) Model.touch(); } catch(_){}
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    Model._notify && Model._notify('photo', { action: 'markup-stamped', photoId: photo.id });
  }

  // ── Backup creation: branch on state ──

  // CASE 1: re-save (existing backup) — stamp siblings, no new backup.
  // S363: if the user erased ALL strokes, an empty save means "no markup left" —
  // auto-delete the redundant backup Site Record and clear the markup flags, the
  // same cleanup the explicit Revert does. Keeps the redundant-copy lifecycle
  // symmetric: marks present => backup exists; marks gone => backup gone.
  if (existingBackupId) {
    // S364: verify the referenced backup RECORD actually exists in the gallery.
    // An obs photo can carry a stale _origBackupId (e.g. carried forward by a copy)
    // whose backup record was never created or was removed — CASE 1 would then skip
    // creating a visible backup and silently mark up the original. If the record is
    // missing, drop the stale id and fall through to first-markup handling below.
    var _bkExists = Model.getAllPhotoRecords().some(function(rec){
      return rec.photo && rec.photo.id === existingBackupId;
    });
    if (!_bkExists) {
      console.warn('[Markup save] CASE 1: _origBackupId', existingBackupId, 'has no gallery record — treating as first markup');
      delete photo._origBackupId;
      existingBackupId = null;
    }
  }
  if (existingBackupId) {
    var _emptyNow = !(d.strokes && d.strokes.length);
    if (_emptyNow) {
      var _bkRec = Model.getAllPhotoRecords().filter(function(rec){ return rec.photo && rec.photo.id === existingBackupId; })[0];
      var _bkDate = (_bkRec && _bkRec.photo && _bkRec.photo.addedDate) || '';
      var _sibs = Model.getAllPhotoRecords().filter(function(rec){
        return rec.photo && !rec.photo._isOrigBackup &&
               (rec.photo._origBackupId === existingBackupId || rec.photo === photo);
      });
      _sibs.forEach(function(s){
        var sp=s.photo; if(!sp) return;
        delete sp._annotated; delete sp._origBackupId; delete sp._markupStrokes; delete sp._mkFrame;
        // S365: marks gone -> roll the date back to the original (markup had moved it to today).
        if (_bkDate) sp.addedDate = _bkDate;
      });
      Model.removeSitePhotoById(existingBackupId);
      Model.saveNow();
      try { if (Model.touch) Model.touch(); } catch(_){}
      if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
      Model._notify && Model._notify('photo', { action: 'markup-cleared', photoId: photo.id });
      return;
    }
    _stampSiblings(existingBackupId);
    return;
  }

  // CASE 2: first markup, original is in R2 (preKey set). Upload a DISTINCT clean
  // copy to /original/ so the backup has its OWN r2Key — otherwise it shares the
  // working photo's key + identity and the gallery collapses both into one tile
  // (the redundant copy would be invisible). Under never-bake the working photo
  // keeps preKey + strokes; the backup is a separate clean Site Record. S363.
  if (preKey) {
    var c2Filename = 'orig_' + (photo.id || Date.now()) + '.jpg';
    var c2Key = 'photos/' + pid + '/frt/original/' + c2Filename;
    var c2Url = workerUrl + '/' + c2Key;
    var c2Clean = d.cleanBlob || null;
    function _c2ToBlob(src){
      if (src instanceof Blob) return Promise.resolve(src);
      if (typeof src === 'string' && src.indexOf('data:') === 0) return fetch(src).then(function(r){ return r.blob(); });
      return Promise.resolve(null);
    }
    // Prefer captured clean Blob; else fetch the clean original from its R2 URL.
    var c2Promise = c2Clean ? Promise.resolve(c2Clean)
                  : (origBlobSrc ? _c2ToBlob(origBlobSrc)
                  : (preUrl ? fetch(preUrl).then(function(r){ return r.ok ? r.blob() : null; }).catch(function(){ return null; }) : Promise.resolve(null)));
    c2Promise.then(function(c2Blob){
      if (!c2Blob) {
        // Couldn't obtain a distinct copy — fall back to the original behavior
        // (backup shares preKey). Revert still works; the tile may merge.
        console.warn('[Markup save] CASE 2: no distinct clean blob — backup shares preKey (may merge in gallery)');
        var bidF = _createBackup(preKey, preUrl);
        _stampSiblings(bidF);
        return;
      }
      return R2.upload(pid, 'original', c2Blob, c2Filename).then(function(up){
        var ak = (up && up.r2Key) || c2Key;
        var au = (up && up.r2Url) || c2Url;
        var bid2 = _createBackup(ak, au);
        _stampSiblings(bid2);
        if (!up) { try { R2.queueUpload('orig_' + photo.id, pid, 'original', c2Blob, c2Filename); } catch(_){} }
      });
    }).catch(function(err){
      console.warn('[Markup save] CASE 2: distinct original error:', err && err.message, '— backup with intended URL');
      var bid2e = _createBackup(c2Key, c2Url);
      _stampSiblings(bid2e);
    });
    return;
  }

  // CASE 3: first markup, no preKey — upload a clean original, then back it up.
  // S347d: prefer the captured clean Blob (d.cleanBlob, a real Blob from the
  // engine's source image) over the fragile _origBlob string. This guarantees a
  // backup is created even when _origBlob is a dead blob: URL — closing the
  // silent-overwrite hole.
  var cleanCapture = d.cleanBlob || null;
  if (origBlobSrc || cleanCapture) {
    var origFilename = 'orig_' + (photo.id || Date.now()) + '.jpg';
    var origKey = 'photos/' + pid + '/frt/original/' + origFilename;
    var origUrl = workerUrl + '/' + origKey;
    function _toBlobLocal(src) {
      if (src instanceof Blob) return Promise.resolve(src);
      if (typeof src === 'string' && src.indexOf('data:') === 0) return fetch(src).then(function(r){ return r.blob(); });
      return Promise.resolve(null);
    }
    // Prefer the captured clean Blob; fall back to converting _origBlob.
    var origPromise = cleanCapture ? Promise.resolve(cleanCapture) : _toBlobLocal(origBlobSrc);
    origPromise.then(function(origBlob) {
      if (!origBlob) {
        console.warn('[Markup save] CASE 3: no convertible original — backup NOT created (revert disabled)');
        _stampSiblings(null);
        return;
      }
      return R2.upload(pid, 'original', origBlob, origFilename).then(function(uploadResult) {
        var actualKey = (uploadResult && uploadResult.r2Key) || origKey;
        var actualUrl = (uploadResult && uploadResult.r2Url) || origUrl;
        var bid3 = _createBackup(actualKey, actualUrl);
        _stampSiblings(bid3);
        if (!uploadResult) {
          try { R2.queueUpload('orig_' + photo.id, pid, 'original', origBlob, origFilename); } catch(_){}
        }
      });
    }).catch(function(err) {
      console.warn('[Markup save] CASE 3: original upload error:', err && err.message, '— creating backup with intended URL anyway');
      var bid3b = _createBackup(origKey, origUrl);
      _stampSiblings(bid3b);
    });
    return;
  }

  // CASE 4: no preKey, no _origBlob, no clean capture — markup persists but cannot
  // be reverted. With S347d this should be unreachable in normal flow (cleanBlob
  // is always captured when the engine has a source image).
  console.warn('[Markup save] CASE 4: no original source at all — markup persists but Revert will not work');
  _stampSiblings(null);
});

// ────────────────────────────────────────────────────────────────────────
// S115: Markup REVERT handler (counterpart to frt-markup-saved).
//
// Fired by lightbox._revertMarkup when the user confirms revert. Detail:
//   { photo: <active record>, index: <lightbox idx> }
//
// Flow:
//   1. Find the active photo's _origBackupId. If none, nothing to do
//      (wasn't actually persisted as a markup yet).
//   2. Resolve the backup record from the gallery and capture its r2Key
//      (= the original, pre-markup R2 file).
//   3. Identify the "marked" R2 file (the current r2Key on the active
//      record before restoration).
//   4. Restore r2Key/r2Url back to the original on the active record AND
//      every sibling sharing the marked r2Key.
//   5. Remove the backup record from the gallery.
//   6. Delete the marked R2 file (background; orphan-safe if it fails).
//   7. Clear _annotated, _origBackupId, dataUrl on all siblings.
// ────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────

// S362 — Gallery thumbnail markup compositor. Renders each marked photo's
// vector strokes (+ rotation) onto a small canvas and swaps the thumbnail <img>
// to that pre-rotated marked image. Reuses MarkupEngine.renderStrokesToContext
// (the same compositing the PDF + lightbox use). Targets imgs by EXACT
// data-thumb-pid; clears the inline CSS rotate on composited thumbs.
function _compositeThumbnailURL(src, rot, strokes, mkFrame){
  return new Promise(function(resolve){
    try{
      var ME=(typeof window!=='undefined')?window.MarkupEngine:null;
      var img=new Image(); img.crossOrigin='anonymous';
      img.onload=function(){
        try{
          var nw=img.naturalWidth, nh=img.naturalHeight;
          if(!nw||!nh){ resolve(''); return; }
          // Downscale to a thumbnail-sized canvas (longest edge ~240px) for speed.
          var maxEdge=240, scale=Math.min(1, maxEdge/Math.max(nw,nh));
          var dw=Math.max(1,Math.round(nw*scale)), dh=Math.max(1,Math.round(nh*scale));
          var sideways=(rot===90||rot===270);
          var ow=sideways?dh:dw, oh=sideways?dw:dh;
          var cv=document.createElement('canvas'); cv.width=ow; cv.height=oh;
          var ctx=cv.getContext('2d');
          function applyRot(){
            if(rot===90){ ctx.translate(ow,0); ctx.rotate(Math.PI/2); }
            else if(rot===180){ ctx.translate(ow,oh); ctx.rotate(Math.PI); }
            else if(rot===270){ ctx.translate(0,oh); ctx.rotate(3*Math.PI/2); }
          }
          ctx.save(); applyRot(); ctx.drawImage(img,0,0,dw,dh); ctx.restore();
          if(strokes&&strokes.length&&ME&&ME.renderStrokesToContext){
            var fw=(mkFrame&&mkFrame.w)?mkFrame.w:nw, fh=(mkFrame&&mkFrame.h)?mkFrame.h:nh;
            ctx.save(); applyRot(); ctx.scale(dw/fw, dh/fh);
            try{ ME.renderStrokesToContext(ctx, strokes, fw, fh); }catch(_){}
            ctx.restore();
          }
          var out=cv.toDataURL('image/jpeg',0.82); cv.width=0; cv.height=0;
          resolve(out||'');
        }catch(e){ resolve(''); }
      };
      img.onerror=function(){ resolve(''); };
      img.src=src;
    }catch(e){ resolve(''); }
  });
}
function _findPhotoByIdAnywhere(proj, pid){
  if(!proj||!pid) return null;
  var hit=null;
  function scan(arr){ if(hit||!arr) return; for(var i=0;i<arr.length;i++){ if(arr[i]&&arr[i].id===pid){ hit=arr[i]; return; } } }
  scan(proj.photos);
  function walk(defics){ (defics||[]).forEach(function(d){
    if(hit) return;
    scan(d.photos);
    if(d.observations) d.observations.forEach(function(o){scan(o.photos);});
    if(d.entries) d.entries.forEach(function(e){scan(e.photos);});
    (d.activity||[]).forEach(function(a){scan(a.photos);});
  });}
  (proj.contractors||[]).forEach(function(c){walk(c.deficiencies);});
  walk(proj.generalDeficiencies);
  return hit;
}
function _compositeThumbnails(container, proj){
  if(!container||!proj) return;
  var imgs=container.querySelectorAll('img[data-thumb-mk="1"][data-thumb-pid]');
  [].forEach.call(imgs, function(imgEl){
    var pid=imgEl.getAttribute('data-thumb-pid'); if(!pid) return;
    // S491: idempotence guard. The compositor rewrites src, which itself is a
    // DOM mutation — without this, a MutationObserver-driven caller (the
    // deficiency strips) would re-composite the composite forever, drawing
    // strokes on top of strokes and pinning the CPU. The stamp records WHICH
    // stroke set was baked, so a later edit (different count) re-composites.
    var _sig = pid + ':' + ((_findPhotoByIdAnywhere(proj, pid) || {})._markupStrokes || []).length;
    if (imgEl.getAttribute('data-thumb-done') === _sig) return;
    var ph=_findPhotoByIdAnywhere(proj, pid); if(!ph) return;
    var strokes=(ph._markupStrokes&&ph._markupStrokes.length)?ph._markupStrokes:null;
    if(!strokes) return;
    var rot=(typeof ph.rotation==='number')?(((ph.rotation%360)+360)%360):0;
    // Source for compositing: the clean displayed thumbnail src (already loaded).
    var src=imgEl.getAttribute('src')||ph.thumb||_r2h(ph.r2Url)||ph.dataUrl||'';
    if(!src) return;
    _compositeThumbnailURL(src, rot, strokes, ph._mkFrame||null).then(function(durl){
      if(!durl) return;
      // EXACT-ID re-resolve: the gallery may have re-rendered while we composited.
      // Only swap if THIS element is still in the DOM and still bound to THIS pid.
      if(imgEl.getAttribute('data-thumb-pid')!==pid) return;
      if(!imgEl.isConnected) return;
      imgEl.src=durl;
      imgEl.setAttribute('data-thumb-done', _sig);   // S491 idempotence stamp
      imgEl.style.transform='';   // composite is pre-rotated — drop the CSS rotate
    }).catch(function(){});
  });
}

// S491 — the deficiency/observation photo strip needs the SAME stroke
// compositing the gallery already does. Under never-bake (S347d/S351) markup
// lives as vector strokes on the photo record (_markupStrokes + _mkFrame),
// NOT as a baked marked image. The strip was still asking the dead
// getObsPhotoMarkup/photoMarkups question (nothing writes it — verified live:
// every photo returned markup 'none'), so it always fell back to the clean
// original and markup never appeared on deficiency thumbnails while the
// gallery showed it correctly.
//
// Exported rather than duplicated: ONE implementation, per shared-engine
// discipline. Callers tag their <img> with data-thumb-pid + data-thumb-mk="1"
// (same contract as the gallery) and call this after render.
export function compositeMarkupThumbs(container, proj){
  return _compositeThumbnails(container, proj);
}

document.addEventListener('frt-markup-reverted', function(e) {
  var d = e.detail; if (!d || !d.photo) { console.warn('[Markup revert] missing detail/photo'); return; }
  var photo = d.photo;
  var proj = Model.getProject(); if (!proj) { console.warn('[Markup revert] no project'); return; }
  console.log('[Markup revert] start', { photoId: photo.id, origBackupId: photo._origBackupId, r2Key: photo.r2Key });

  if (!photo._origBackupId) {
    delete photo._annotated;
    delete photo._markupStrokes;   // S340
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    return;
  }

  var backup = (proj.photos || []).find(function(p){ return p && p.id === photo._origBackupId; });
  if (!backup) {
    console.warn('[Markup revert] backup record NOT FOUND in gallery — clearing flags');
    delete photo._origBackupId;
    delete photo._annotated;
    Model.saveNow();
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    return;
  }

  var origKey = backup.r2Key || '';
  var origUrl = backup.r2Url || '';
  var origThumb = backup.thumb || '';
  var markedKey = photo.r2Key || '';

  // S115 P8: Corrupted-state detection. If the backup's r2Key is itself a
  // /marked/ path, the backup was created in a buggy state where the photo's
  // r2Key was already pointing at a marked file. Restoring would just put
  // the photo back at the same marked path (no actual change). Worse, we'd
  // delete the marked file (the only remaining copy of the image) leaving
  // the photo pointing at a 404. Abort and tell the user what's going on.
  if (origKey.indexOf('/marked/') >= 0) {
    console.error('[Markup revert] CORRUPTED BACKUP: backup r2Key is itself /marked/ — original is lost. Aborting revert to avoid deleting the marked file.');
    // S120 Push 14: native alert → showAlert. Still informational + multi-line.
    showAlert('Cannot revert this photo', 'The original backup record is corrupted (points at a marked file, not an original). The original image was lost in an earlier session. The current marked-up version will be kept as-is. To clear the corruption, re-take this photo.\n\nKey: ' + origKey);
    // Clear corruption flags so subsequent markups don't try to use this bad backup.
    delete photo._origBackupId;
    delete photo._annotated;
    // Remove the bad backup record from the gallery so it stops appearing as a duplicate.
    Model.removeSitePhotoById(backup.id);
    Model.saveNow();
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    return;
  }
  // S362: NEVER-BAKE revert. Under the never-bake model (S351+) the photo's
  // stored image IS the clean original — there is no separate /marked/ binary —
  // so the photo's r2Key legitimately EQUALS the backup's r2Key. The old guard
  // below treated that equality as "corruption" and refused to revert, throwing a
  // false "Cannot revert this photo" AFTER the markup had already been cleared by
  // lightbox._revertMarkup. That's the bug (obs photos with rotation hit it most).
  // When the keys match AND neither is a /marked/ path, this is the normal
  // never-bake case: the strokes are already gone; just drop the markup flags from
  // every sibling and remove the now-unneeded backup record. No R2 delete (the
  // shared key is the only/clean copy — deleting it would 404 the photo).
  if (markedKey && markedKey === origKey) {
    var nbSibs = markedKey ? Model.findPhotosByR2Key(markedKey) : [];
    nbSibs = nbSibs.filter(function(s){ return s && s.photo && !s.photo._isOrigBackup; });
    if (!nbSibs.some(function(s){ return s.photo === photo; })) nbSibs.push({ photo: photo });
    Model.getAllPhotoRecords().forEach(function(rec){
      if (rec.photo && !rec.photo._isOrigBackup && rec.photo._origBackupId === backup.id) {
        if (!nbSibs.some(function(s){ return s.photo === rec.photo; })) nbSibs.push(rec);
      }
    });
    var _nbOrigDate = backup.addedDate || '';
    nbSibs.forEach(function(s){
      var sp = s.photo; if (!sp) return;
      delete sp._annotated;
      delete sp._origBackupId;
      delete sp._markupStrokes;
      // S365: revert rolls the date back to the original (markup had moved the
      // marked photo to today; undoing the markup undoes the date move too).
      if (_nbOrigDate) sp.addedDate = _nbOrigDate;
      // rotation is a separate display property; revert leaves it as-is unless the
      // user also reset it. (Markup revert removes MARKS, not rotation.)
    });
    Model.removeSitePhotoById(backup.id);
    // S481 DATA-LOSS FIX: do NOT delete local original bytes on revert (see
    // the sibling note in the legacy branch below). The local copy is the
    // parachute; keep it. (Removed: IDB.del('photoBlobs', photo.id))
    Model.saveNow();
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    return;
  }

  var siblings = markedKey ? Model.findPhotosByR2Key(markedKey) : [];
  // Filter out the backup itself (defensive — it shouldn't share the marked key, but just in case)
  siblings = siblings.filter(function(s){ return !s.photo._isOrigBackup; });
  if (!siblings.some(function(s){ return s.photo === photo; })) {
    siblings.push({ photo: photo, location: { type: 'unknown' } });
  }
  Model.getAllPhotoRecords().forEach(function(rec){
    if (rec.photo && !rec.photo._isOrigBackup && rec.photo._origBackupId === backup.id) {
      if (!siblings.some(function(s){ return s.photo === rec.photo; })) siblings.push(rec);
    }
  });

  // S115 P9: also restore the original addedDate from the backup. Save bumped
  // sibling addedDate to today; revert must roll it back so reverted photos
  // don't appear under today's date in the gallery.
  var origAddedDate = backup.addedDate || '';

  siblings.forEach(function(s){
    var sp = s.photo; if (!sp) return;
    sp.r2Key = origKey;
    sp.r2Url = origUrl;
    sp.r2Status = 'uploaded';
    if (origThumb) sp.thumb = origThumb;
    else delete sp.thumb;
    if (origAddedDate) sp.addedDate = origAddedDate;
    delete sp._annotated;
    delete sp._origBackupId;
    delete sp._markupStrokes;   // S340: reverted photo has no saved markup to re-edit
    delete sp.dataUrl;
  });

  Model.removeSitePhotoById(backup.id);

  // S481 DATA-LOSS FIX (Mark, 1490.04 Obs 4A): revert must NOT delete the
  // cloud file merely because the working key differs from the backup key.
  // Under the never-bake model (S351+) the working key is usually the ONLY
  // original — there is no disposable /marked/ copy. Deleting it here 404s
  // the photo, then a bytes-less device nulls the pointer on next open =
  // permanent loss. ONLY delete a file whose own key proves it is a
  // disposable marked copy (a real /marked/ path). Address inequality alone
  // is NOT proof of disposability.
  if (markedKey && markedKey !== origKey && markedKey.indexOf('/marked/') >= 0 && R2 && R2.delPhotoGuarded) {
    // /marked/ path = a genuine disposable marked copy, and the original is
    // restored above — so this is a deliberate delete. Guard still verifies a
    // survivor before removing (belt and suspenders).
    var _rmRefs = (Model.findPhotosByR2Key ? Model.findPhotosByR2Key(markedKey).filter(function(s){ return s && s.photo; }).length : 0);
    try { R2.delPhotoGuarded(markedKey, { force: true, refCount: _rmRefs, photoId: photo.id }).catch(function(){}); } catch(_){}
  }
  // S481 DATA-LOSS FIX: NEVER delete this device's local original bytes on
  // revert. That local copy is the parachute every rescue/self-heal path
  // depends on (it is what recovered 6360.08 and produced the Obs 4A rescue
  // upload). Locked rule: local store is a permanent backup, not a cache.
  // (IDB.del removed — was: IDB.del('photoBlobs', photo.id))

  Model.saveNow();
  if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
});
