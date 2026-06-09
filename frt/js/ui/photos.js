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
import { IDB } from '../data/idb.js';
import { ImageWorkerHost } from '../workers/imageWorkerHost.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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
var _TRASH_RETENTION_DAYS = 30;
// S265 stage 2: project id this session has already auto-purged (run-once guard).
var _purgedForProjectId = null;
var _selectedUids = new Set();
var _filterPanelOpen = false;
// S114 P1.3: anchor for shift-click range select. Stores the last toggled UID
// in render order, so a shift-click can compute a range from anchor → target.
var _lastSelectedUid = null;
var _renderOrderUids = []; // refreshed every render() in display order

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
function _gatherDeletedRecords() {
  var proj = Model.getProject();
  if (!proj) return [];
  var out = [];
  // site photos (stage 2)
  (proj.photos || []).forEach(function(ph, i) {
    if (ph && ph.deleted) {
      out.push({
        kind: 'site',
        siteIdx: i,
        photoId: ph.id,
        ph: ph,
        src: ph.thumb || ph.r2Url || ph.dataUrl || '',
        deletedDate: ph.deletedDate || null,
        label: 'Site photo'
      });
    }
  });
  // defic pool photos (stage 1)
  var allDefics = Model.getAllDeficiencies(proj);
  allDefics.forEach(function(d) {
    var defic = d.defic;
    (defic.photos || []).forEach(function(ph) {
      if (ph && ph.deleted) {
        out.push({
          kind: 'defic',
          deficId: defic.id,
          deficNum: defic.num,
          photoId: ph.id,
          ph: ph,
          src: ph.thumb || ph.r2Url || ph.dataUrl || '',
          deletedDate: ph.deletedDate || null,
          label: 'Pin ' + defic.num
        });
      }
    });
  });
  out.sort(function(a, b) {
    var ta = a.deletedDate ? new Date(a.deletedDate).getTime() : 0;
    var tb = b.deletedDate ? new Date(b.deletedDate).getTime() : 0;
    return tb - ta; // newest deleted first
  });
  return out;
}

// Days remaining before 30-day auto-purge (display-only this stage). Returns
// a whole number of days >= 0. No deletedDate → full retention (defensive).
function _trashDaysRemaining(deletedDateIso) {
  if (!deletedDateIso) return _TRASH_RETENTION_DAYS;
  var deleted = new Date(deletedDateIso).getTime();
  if (!deleted) return _TRASH_RETENTION_DAYS;
  var elapsedMs = Date.now() - deleted;
  var elapsedDays = Math.floor(elapsedMs / 86400000);
  return Math.max(0, _TRASH_RETENTION_DAYS - elapsedDays);
}

// S265 Photo-Trash: build the Recently Deleted list HTML. Each item: thumbnail,
// label, deleted-date, days-remaining (amber, red when ≤5), Restore. stage 2:
// covers SITE + DEFIC photos (routed by r.kind) and adds an admin-gated
// "Delete forever" button (inspectors see it disabled; principals/admins enabled).
function _renderTrashHtml(deletedRecords) {
  var h = '';
  if (!deletedRecords.length) {
    h += '<p class="ph-empty">Nothing in Recently Deleted. Photos you delete from the gallery appear here and can be restored for ' + _TRASH_RETENTION_DAYS + ' days.</p>';
    return h;
  }
  var isAdmin = false;
  try { isAdmin = !!(Auth && Auth.isAdmin && Auth.isAdmin()); } catch (e) { isAdmin = false; }
  h += '<p class="ph-trash-note">Deleted photos are kept for ' + _TRASH_RETENTION_DAYS + ' days, then removed automatically. Restore brings a photo back where it was.'
    + (isAdmin ? '' : ' Only a principal can delete a photo permanently.') + '</p>';
  h += '<div class="ph-trash-list">';
  deletedRecords.forEach(function(r) {
    var days = _trashDaysRemaining(r.deletedDate);
    var dateLabel = '';
    if (r.deletedDate) {
      var dt = new Date(r.deletedDate);
      if (dt.getTime()) {
        dateLabel = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          + ' ' + dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      }
    }
    var daysCls = days <= 5 ? 'ph-trash-days urgent' : 'ph-trash-days';
    // route attributes by kind
    var routeAttrs = (r.kind === 'site')
      ? ' data-kind="site" data-site-idx="' + r.siteIdx + '"'
      : ' data-kind="defic" data-defic-id="' + esc(r.deficId) + '" data-photo-id="' + esc(r.photoId) + '"';
    h += '<div class="ph-trash-item">';
    // S266: thumbnail opens the photo in the lightbox (was static). Routed by
    // kind so the click handler can re-find the live photo object to display.
    if (r.src) {
      h += '<div class="ph-trash-thumb ph-trash-zoom" data-action="ph-trash-lightbox"' + routeAttrs + ' title="View photo"><img src="' + esc(r.src) + '" loading="lazy" onerror="this.style.display=\'none\'"></div>';
    } else {
      h += '<div class="ph-trash-thumb ph-trash-noimg">\uD83D\uDCF7</div>';
    }
    h += '<div class="ph-trash-meta">';
    h += '<div class="ph-trash-label">' + esc(r.label) + '</div>';
    if (dateLabel) h += '<div class="ph-trash-date">Deleted ' + esc(dateLabel) + '</div>';
    h += '<div class="' + daysCls + '">' + days + ' day' + (days === 1 ? '' : 's') + ' left</div>';
    h += '</div>';
    h += '<div class="ph-trash-actions">';
    h += '<button class="ph-trash-restore" data-action="ph-restore-photo"' + routeAttrs + '>Restore</button>';
    if (isAdmin) {
      h += '<button class="ph-trash-purge" data-action="ph-purge-photo"' + routeAttrs + '>Delete forever</button>';
    } else {
      h += '<button class="ph-trash-purge disabled" disabled title="Only a principal can delete permanently">Delete forever</button>';
    }
    h += '</div>';
    h += '</div>';
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
    var src = s.thumb || s.r2Url || s.dataUrl || '';
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
        src: p.thumb || p.r2Url || p.dataUrl || '',
        badgeText: 'Site',
        // P1.5: green "Site" badge (matches v1; not red)
        badgeClass: 'ph-badge-site',
        dateKey: dk.key, dateLabel: dk.label,
        sortGroup: [0, i] // site photos come first within a date
      });
    });
    allDefics.forEach(function(d) {
      var defic = d.defic;
      var isGeneral = defic.priority === 'general';
      // S114 P1.5: badge color signals priority (per Mark — frames don't, badges do).
      // high=red, low=orange, general=green. Same as v1 priority palette.
      var badgeCls = 'ph-badge-pin-high';
      if (isGeneral) badgeCls = 'ph-badge-pin-gen';
      else if (defic.priority === 'low') badgeCls = 'ph-badge-pin-low';
      // S120 Push 1: pool-aware enumeration — for each obs, walk the
      // EFFECTIVE photo list (pool ∩ obs.photoSelection, with markup overlays).
      // A photo shared by Obs A + Obs B emits two records, each tagged with
      // the parent obs (matches V1 corner-badge pattern Mark requested).
      // Legacy fallback inside getEffectivePhotos handles never-migrated edge cases.
      var multiObs = (defic.observations || []).length > 1;
      (defic.observations || []).forEach(function(o, oi) {
        var effective = (typeof Model !== 'undefined' && Model.getEffectivePhotos)
          ? Model.getEffectivePhotos(defic, oi) : (o.photos || []);
        effective.forEach(function(ph, phi) {
          var mk = (Model.getObsPhotoMarkup) ? Model.getObsPhotoMarkup(defic, oi, ph.id) : null;
          var dk = _dayKey(ph, defic);
          // S210 (Mark): compact gallery badge — a photo on several pins stacked
          // the full "Pin N · Obs X" pills top-right and covered the image. Drop
          // the words: number + thin-dot + obs letter (e.g. "12·A"); single-obs
          // pins show just the number ("12"). Keeps every reference visible while
          // the pills stay tiny. Site photos keep their "Site" text (set above).
          var obsLetter = multiObs ? '\u00b7' + String.fromCharCode(65 + oi) : '';
          records.push({
            type: 'defic',
            deficId: defic.id,
            deficNum: defic.num,
            isGeneralPriority: isGeneral,
            obsIdx: oi,
            photoIdx: phi,
            ph: ph,
            src: (mk && mk.markedR2Key) || ph.r2Url || ph.dataUrl || '',
            badgeText: '' + defic.num + obsLetter,
            badgeClass: badgeCls,
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
      return ph.r2Key || ph.sourceR2Key || ph.id || r.uid;
    }
    var _phById = {};
    var _phRepOrder = [];
    records.forEach(function(r) {
      var k = _phIdKey(r);
      var isFinding = (r.type === 'defic' && !r.isGeneralPriority);
      var isNote = (r.type === 'defic' && r.isGeneralPriority);
      var rep = _phById[k];
      if (!rep) {
        r.badges = [{ text: r.badgeText, cls: r.badgeClass }];
        r.refSite = (r.type === 'site');
        r.refFinding = isFinding;
        r.refNote = isNote;
        _phById[k] = r;
        _phRepOrder.push(r);
        return;
      }
      var dup = rep.badges.some(function(b) { return b.text === r.badgeText && b.cls === r.badgeClass; });
      if (!dup) rep.badges.push({ text: r.badgeText, cls: r.badgeClass });
      rep.refSite = rep.refSite || (r.type === 'site');
      rep.refFinding = rep.refFinding || isFinding;
      rep.refNote = rep.refNote || isNote;
      // Promote a SITE reference to representative so the trash button (site
      // only) stays reachable; adopt its site context for card actions.
      if (r.type === 'site' && rep.type !== 'site') {
        rep.type = 'site';
        rep.siteIdx = r.siteIdx;
        rep.src = rep.src || r.src;
      }
    });
    records = _phRepOrder;

    // ── Stats: distinct-photo totals (reference union per photo) ──
    var totalAll = records.length;
    var totalSite = records.filter(function(r) { return r.refSite; }).length;
    var totalDefic = records.filter(function(r) { return r.refFinding; }).length;
    var totalGeneral = records.filter(function(r) { return r.refNote; }).length;

    // ── Apply filter (a photo matches if ANY of its references match) ──
    var filtered = records.filter(function(r) {
      if (_filterMode === 'all') return true;
      if (_filterMode === 'site') return r.refSite;
      // S114 P1.3 rename: deficiency→findings, general→notes (label-only; semantics unchanged)
      if (_filterMode === 'findings') return r.refFinding;
      if (_filterMode === 'notes') return r.refNote;
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
    var filterLabel = _filterMode === 'all' ? 'All photos'
      : _filterMode === 'site' ? 'Site only'
      : _filterMode === 'findings' ? 'Findings'
      : 'Notes';
    html += '<div class="ph-toolbar">';
    html += '<div class="ph-toolbar-left">';
    html += '<div class="ph-stat"><div class="ph-stat-num">' + totalAll + '</div><div class="ph-stat-lbl">Total</div></div>';
    html += '<div class="ph-stat"><div class="ph-stat-num">' + totalSite + '</div><div class="ph-stat-lbl">Site</div></div>';
    html += '<div class="ph-stat"><div class="ph-stat-num">' + totalDefic + '</div><div class="ph-stat-lbl">Findings</div></div>';
    html += '<div class="ph-stat"><div class="ph-stat-num">' + totalGeneral + '</div><div class="ph-stat-lbl">Notes</div></div>';
    html += '</div>';
    html += '<div class="ph-toolbar-right">';
    if (nSel > 0) {
      html += '<span class="ph-sel-count">' + nSel + ' selected</span>';
      html += '<button class="ph-btn ph-btn-danger" data-action="ph-delete-selected">Delete ' + nSel + '</button>';
      html += '<button class="ph-btn" data-action="ph-clear-selection">Clear</button>';
    }
    html += '<div class="ph-filter-wrap">';
    html += '<button class="ph-btn ph-filter-btn" data-action="ph-toggle-filter">\u2699 ' + esc(filterLabel) + '</button>';
    if (_filterPanelOpen) {
      html += '<div class="ph-filter-menu">';
      [
        ['all', 'All photos'],
        ['site', 'Site only'],
        ['findings', 'Findings'],
        ['notes', 'Notes']
      ].forEach(function(pair) {
        var cls = pair[0] === _filterMode ? 'active' : '';
        html += '<button class="' + cls + '" data-action="ph-set-filter" data-mode="' + pair[0] + '">' + pair[1] + '</button>';
      });
      html += '</div>';
    }
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
        html += '<span class="ph-badges">';
        (r.badges || [{ text: r.badgeText, cls: r.badgeClass }]).forEach(function(b) {
          html += '<span class="ph-badge ' + b.cls + '">' + esc(b.text) + '</span>';
        });
        html += '</span>';
        if (r.src) {
          html += '<img ' + clickAction + ' src="' + esc(r.src) + '" loading="lazy" onerror="this.style.display=\'none\'">';
        } else {
          html += '<div class="ph-noimg">\uD83D\uDCF7</div>';
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
      (proj.photos || []).forEach(function(p) { p._ctxLabel = _phPinLabel(p, 'Site Photo'); });
      window._frtLightbox.open(proj.photos, idx, {});
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
        window._frtLightbox.open(photos, photoIdx, {});
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
      ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
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
  var src = ph.r2Url || ph.dataUrl || '';
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
function _compressSitePhoto(file, cb) {
  ImageWorkerHost.compressFile(file, {
    maxW: 1600,
    quality: 0.8,
    thumbMaxW: 200,
    thumbQuality: 0.7
  }).then(function(r) {
    cb(r.dataUrl, r.thumb);
  }).catch(function(err) {
    console.warn('[Photos] Compression failed:', err && err.message);
  });
}

function _addSitePhoto(file) {
  _compressSitePhoto(file, function(dataUrl, thumb) {
    var proj = Model.getProject();
    if (!proj) return;
    if (!proj.photos) proj.photos = [];
    var photo = {
      id: 'sph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      filename: file.name,
      dataUrl: dataUrl,
      thumb: thumb,
      caption: '',
      addedDate: new Date().toISOString().split('T')[0]
    };
    proj.photos.push(photo);
    Model.saveNow();
    initPhotos.render();
    toast('Site photo added');
    var pid = new URLSearchParams(window.location.search).get('project');
    if (pid) {
      R2.uploadPhoto(pid, photo, 'original').then(function() { Model.saveNow(); });
    }
  });
}

function _handleSitePhotoFiles(files) {
  Array.from(files).forEach(function(f) {
    if (f.type.startsWith('image/')) _addSitePhoto(f);
  });
}

// Expose for drag-drop
window._handleSitePhotoDrop = _handleSitePhotoFiles;

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
  document.querySelectorAll('#panel-photos .ph-card.selected').forEach(function(c) {
    c.classList.remove('selected');
  });
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
      if (d.r2Key) R2.del(d.r2Key).catch(function(){});
      if (d.id) IDB.del('photoBlobs', d.id).catch(function(){});
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
    var pr = r.defic.priority === 'general' ? ' [General]' : r.defic.priority === 'low' ? ' [Low]' : '';
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
    if (ev.target === overlay) overlay.remove();
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
    if (ev.target === overlay) { overlay.remove(); return; }
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
      delete rec.deleted; delete rec.deletedDate;
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
  // Sort descending by idx so splices don't shift earlier indices.
  var siteItems = selItems.filter(function(s){ return s.type === 'site'; })
    .sort(function(a,b){ return b.idx - a.idx; });
  siteItems.forEach(function(s) {
    if (destVal === '__site__') { skipped++; return; } // no-op
    var src = (proj.photos || [])[s.idx];
    if (!src) { skipped++; return; }
    var df = Model.findDeficiency(destVal);
    if (!df) { skipped++; return; }
    var rec = proj.photos.splice(s.idx, 1)[0];
    _dedupPushToPool(df.defic, rec);
    moved++;
  });

  Model.saveNow();
  _toggleSelectMode(false);
  initPhotos.render();
  toast(moved + ' photo' + (moved!==1?'s':'') + ' moved' + (skipped ? ' (' + skipped + ' skipped)' : ''));
}

function _phEsc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Click delegation: toggle .selected on ph-card while in photos-select-mode.
// Capture phase + return before lightbox handlers so click selects instead of opening.
document.addEventListener('click', function(e) {
  if (!document.body.classList.contains('photos-select-mode')) return;
  var card = e.target.closest && e.target.closest('#panel-photos .ph-card');
  if (!card) return;
  // Ignore clicks on hover buttons (they're display:none in select mode but defensive)
  if (e.target.closest('.ph-hover-btn')) return;
  // S224: never swallow the Undo button — it must work regardless of select mode.
  if (e.target.closest('.ph-undo-btn')) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  card.classList.toggle('selected');
}, true);

// Wire upload buttons
// Photo Gallery toolbar — delegated wiring (S78 fix: top-level getElementById ran before DOM existed)
document.addEventListener('click', function(e) {
  var t = e.target.closest && e.target.closest('button');
  if (!t || !t.id) return;
  if (t.id === 'site-photo-upload-btn') {
    var fi = document.getElementById('site-photo-input');
    if (fi) fi.click();
  } else if (t.id === 'site-photo-camera-btn') {
    var ci = document.getElementById('site-photo-camera');
    if (ci) ci.click();
  } else if (t.id === 'photo-actions-btn') {
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
          document.querySelectorAll('#panel-photos .ph-card').forEach(function(c){ c.classList.add('selected'); });
          var n = document.querySelectorAll('#panel-photos .ph-card.selected').length;
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

// Legacy file/camera input change handlers (kept top-level — inputs exist at module load via index.html)
var fileInput = document.getElementById('site-photo-input');
var cameraInput = document.getElementById('site-photo-camera');
if (fileInput) fileInput.addEventListener('change', function(e) {
  if (e.target.files) _handleSitePhotoFiles(e.target.files);
  e.target.value = '';
});
if (cameraInput) cameraInput.addEventListener('change', function(e) {
  if (e.target.files) _handleSitePhotoFiles(e.target.files);
  e.target.value = '';
});

// ────────────────────────────────────────────────────────────────────────
// S115: R2 wiring for markup save events (port of v1's _origBackupId flow).
//
// Flow on save (all SYNCHRONOUS local mutations first, R2 upload in bg):
//   1. Capture pre-markup r2Key/r2Url.
//   2. Compute the new marked r2Key/r2Url (deterministic — based on photo id).
//   3. Find every sibling sharing the pre-markup r2Key (gallery, defic, obs).
//   4. If first markup, create the "(original)" backup gallery record
//      pointing at the PRE-markup R2 file (no re-upload of the original).
//   5. Propagate r2Key/r2Url/_origBackupId/_annotated to every sibling.
//   6. Persist (Model.saveNow) + render — instant UI feedback.
//   7. Kick off R2 upload of the marked blob in the background. If it fails,
//      flag r2Status='pending' and queue for retry. Records still display
//      correctly — they point at the new key, the file just isn't there yet.
//
// Flow on subsequent saves (markup edited again):
//   _origBackupId already set on the active record. Skip backup creation.
//   r2Key already points at marked file (deterministic key). Just re-upload.
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

  // ── Compute deterministic marked R2 key (stable across re-saves) ──
  var filename = 'marked_' + (photo.id || Date.now()) + '.jpg';
  var newKey = 'photos/' + pid + '/frt/marked/' + filename;
  var workerUrl = (R2 && R2.WORKER_URL) ? R2.WORKER_URL : 'https://arencon-r2-worker.hezhendong999.workers.dev';
  var newUrl = workerUrl + '/' + newKey;

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
    console.log('[Markup save] backup created', { id: backup.id, r2Key: backupKey, addedDate: backup.addedDate });
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
    console.log('[Markup save] stamping', siblings.length, 'sibling(s)', { backupId: backupId });
    // S115 P11: For instant visual feedback in defic tab + pin editor, share
    // the lightbox's blob URL of the marked image across every sibling. Blob
    // URLs are document-scoped — any <img src=...> in the page can use them.
    // This means the marked thumbnail shows immediately after save, before
    // the marked R2 file is uploaded (which takes 1-2 seconds).
    var markedBlobUrl = (photo.dataUrl && typeof photo.dataUrl === 'string' && photo.dataUrl.indexOf('blob:') === 0)
      ? photo.dataUrl
      : null;
    siblings.forEach(function(s){
      var sp = s.photo; if (!sp) return;
      sp.r2Key = newKey;
      sp.r2Url = newUrl;
      sp.r2Status = 'uploading';
      sp._annotated = true;
      if (backupId) sp._origBackupId = backupId;
      if (sp.addedDate !== todayStr) sp.addedDate = todayStr;
      // S115 P11: keep stale thumb until async thumb-gen replaces it. Briefly
      // showing the original thumb is better than a 404 from the marked R2
      // path that doesn't exist yet. Once thumb-gen completes the thumb
      // becomes the marked image (handled below).
      // (Earlier code used: delete sp.thumb)
      // Share marked blob URL so defic/pin renders pick it up immediately.
      if (markedBlobUrl) sp.dataUrl = markedBlobUrl;
    });
    try { IDB.put('photoBlobs', { id: photo.id, dataBlob: d.blob }).catch(function(){}); } catch(_){}
    Model.saveNow();
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    // S115 P11: notify so defic tab + pin editor re-render with the new
    // r2Key/r2Url + shared blob URL. Photos showing the OLD thumb get the
    // freshly-shared blob URL (which fronts the marked image instantly).
    Model._notify && Model._notify('photo', { action: 'markup-stamped', photoId: photo.id });
  }

  // ── Generate fresh thumb of marked blob (best-effort, async) ──
  try {
    var fr = new FileReader();
    fr.onload = function(ev) {
      var imgEl = new Image();
      imgEl.onload = function() {
        try {
          var tw = 200, th = 200;
          var sc = Math.min(tw / imgEl.naturalWidth, th / imgEl.naturalHeight, 1);
          var canv = document.createElement('canvas');
          canv.width = Math.max(1, Math.round(imgEl.naturalWidth * sc));
          canv.height = Math.max(1, Math.round(imgEl.naturalHeight * sc));
          canv.getContext('2d').drawImage(imgEl, 0, 0, canv.width, canv.height);
          var markedThumbDataUrl = canv.toDataURL('image/jpeg', 0.7);
          var live = Model.findPhotosByR2Key(newKey);
          live.forEach(function(rec){ if (rec.photo) rec.photo.thumb = markedThumbDataUrl; });
          if (photo.r2Key === newKey) photo.thumb = markedThumbDataUrl;
          Model.saveNow();
          if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
          // S115 P11: notify so defic tab + pin editor re-render their thumbs.
          // (Without this, the thumbs stay on the OLD r2Url until next render is
          // triggered some other way — e.g. user switches tabs.)
          Model._notify && Model._notify('photo', { action: 'markup-thumb-ready', photoId: photo.id });
        } catch(_){}
      };
      imgEl.src = ev.target.result;
    };
    fr.readAsDataURL(d.blob);
  } catch(_) {}

  // ── Upload marked blob to R2 (background) ──
  R2.upload(pid, 'marked', d.blob, filename).then(function(result) {
    if (result) {
      var live = Model.findPhotosByR2Key(newKey);
      live.forEach(function(rec){ if (rec.photo && !rec.photo._isOrigBackup) rec.photo.r2Status = 'uploaded'; });
      if (photo.r2Key === newKey) photo.r2Status = 'uploaded';
      Model.saveNow();
      if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
      // S115 P11: notify on upload-complete too so cloud-status indicators refresh.
      Model._notify && Model._notify('photo', { action: 'markup-uploaded', photoId: photo.id });
      console.log('[Markup save] marked blob uploaded successfully');
    } else {
      console.warn('[Markup save] marked blob upload returned null — queueing for retry');
      try { R2.queueUpload(photo.id, pid, 'marked', d.blob, filename); } catch(_){}
    }
  }).catch(function(err) {
    console.warn('[Markup save] marked blob upload error, queueing:', err && err.message);
    try { R2.queueUpload(photo.id, pid, 'marked', d.blob, filename); } catch(_){}
  });

  // ── Backup creation: branch on state ──

  // CASE 1: re-save (existing backup) — just stamp siblings, no new backup
  if (existingBackupId) {
    console.log('[Markup save] CASE 1: re-save with existing backup');
    _stampSiblings(existingBackupId);
    return;
  }

  // CASE 2: first markup, original is in R2 (preKey set) — backup synchronously
  if (preKey) {
    console.log('[Markup save] CASE 2: first markup with preKey — sync backup');
    var bid2 = _createBackup(preKey, preUrl);
    _stampSiblings(bid2);
    return;
  }

  // CASE 3: first markup, no preKey, but we have _origBlob — upload original first
  if (origBlobSrc) {
    console.log('[Markup save] CASE 3: first markup, no preKey — uploading original from _origBlob');
    var origFilename = 'orig_' + (photo.id || Date.now()) + '.jpg';
    var origKey = 'photos/' + pid + '/frt/original/' + origFilename;
    var origUrl = workerUrl + '/' + origKey;
    function _toBlobLocal(src) {
      if (src instanceof Blob) return Promise.resolve(src);
      if (typeof src === 'string' && src.indexOf('data:') === 0) return fetch(src).then(function(r){ return r.blob(); });
      return Promise.resolve(null);
    }
    _toBlobLocal(origBlobSrc).then(function(origBlob) {
      if (!origBlob) {
        console.warn('[Markup save] CASE 3: could not convert _origBlob to Blob — falling back to no-backup');
        _stampSiblings(null);
        return;
      }
      return R2.upload(pid, 'original', origBlob, origFilename).then(function(uploadResult) {
        var actualKey = (uploadResult && uploadResult.r2Key) || origKey;
        var actualUrl = (uploadResult && uploadResult.r2Url) || origUrl;
        console.log('[Markup save] CASE 3: original upload complete', { success: !!uploadResult, key: actualKey });
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

  // CASE 4: no preKey, no _origBlob — markup persists but cannot be reverted
  console.warn('[Markup save] CASE 4: no preKey, no _origBlob — markup persists but Revert will not work');
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
document.addEventListener('frt-markup-reverted', function(e) {
  var d = e.detail; if (!d || !d.photo) { console.warn('[Markup revert] missing detail/photo'); return; }
  var photo = d.photo;
  var proj = Model.getProject(); if (!proj) { console.warn('[Markup revert] no project'); return; }
  console.log('[Markup revert] start', { photoId: photo.id, origBackupId: photo._origBackupId, r2Key: photo.r2Key });

  if (!photo._origBackupId) {
    console.log('[Markup revert] no _origBackupId on photo — clearing _annotated only');
    delete photo._annotated;
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
  console.log('[Markup revert] backup found', { backupId: backup.id, origKey: backup.r2Key });

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
  // S115 P8: Sanity check — if photo and backup share the same r2Key, restoring
  // is a no-op AND would delete the only copy of the image. Bail.
  if (markedKey && markedKey === origKey) {
    console.error('[Markup revert] CORRUPTED STATE: photo and backup share r2Key — refusing to revert');
    // S120 Push 14: native alert → showAlert.
    showAlert('Cannot revert this photo', 'The photo and its backup point at the same R2 file (a corrupted state from an earlier session). To clear the corruption, re-take this photo.');
    delete photo._origBackupId;
    delete photo._annotated;
    Model.removeSitePhotoById(backup.id);
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
  console.log('[Markup revert] restoring', siblings.length, 'sibling(s) to original');

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
    delete sp.dataUrl;
  });

  Model.removeSitePhotoById(backup.id);
  console.log('[Markup revert] backup record removed from gallery');

  if (markedKey && markedKey !== origKey && R2 && R2.del) {
    try { R2.del(markedKey).catch(function(){}); } catch(_){}
  }
  try { IDB.delete('photoBlobs', photo.id).catch(function(){}); } catch(_){}

  Model.saveNow();
  if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
  console.log('[Markup revert] complete');
});
