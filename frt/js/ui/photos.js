/**
 * ARENCON FRT v2 — Photos UI
 * Full photo gallery: site photos + deficiency photos, grouped by source.
 * Upload zone with drag-drop, camera, and import buttons.
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm } from '../shared/dialogs.js';
import { R2 } from '../data/r2.js';
import { IDB } from '../data/idb.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── S114 Push 1.2: gallery state ──
// Filter mode mirrors v1: 'all' | 'site' | 'deficiency' | 'general'
//   site       = top-level proj.photos
//   deficiency = defic photos where defic.priority is not 'general'
//   general    = defic photos where defic.priority is 'general'
var _filterMode = 'all';
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

// Cloud-status icon. r2Status === 'uploaded' is the explicit win;
// having r2Url alone implies success too. dataUrl-only = local cache.
function _cloudIcon(ph) {
  var status, color, glyph = '';
  if (ph.r2Status === 'uploaded' || (ph.r2Url && !ph.r2Status)) {
    status = 'Uploaded'; color = '#1A7A4A';
    glyph = '<path d="M8 12.5l2.5 2.5L16 9.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  } else if (ph.r2Status === 'failed') {
    status = 'Upload failed'; color = '#C0392B';
    glyph = '<path d="M9 9l6 6M15 9l-6 6" stroke="white" stroke-width="2.2" stroke-linecap="round"/>';
  } else if (ph.r2Status === 'uploading' || ph.r2Status === 'pending') {
    status = 'Uploading\u2026'; color = '#FFA726';
  } else {
    status = 'Local only'; color = '#94A3B8';
  }
  return '<span class="ph-cloud" title="' + status + '">'
    + '<svg width="18" height="14" viewBox="0 0 24 18" fill="' + color + '">'
    + '<path d="M19 16H6a4.5 4.5 0 010-9 5.5 5.5 0 0110.5-1A4.5 4.5 0 0119 16z"/>' + glyph
    + '</svg></span>';
}

function _dayKey(ph, parentDefic) {
  // Try addedDate, then parse photo ID timestamp, then fall back to defic notedDate
  var d = ph.addedDate || ph.date;
  if (!d && ph.id) {
    var m = String(ph.id).match(/[a-z]+_(\d{13})/);
    if (m) d = new Date(parseInt(m[1])).toISOString().split('T')[0];
  }
  if (!d && parentDefic) d = parentDefic.notedDate || parentDefic.date;
  if (!d) return { key: 'no-date', label: 'No date' };
  try {
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return { key: 'no-date', label: 'No date' };
    var key = dt.toISOString().split('T')[0];
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

    var sitePhotos = proj.photos || [];
    var allDefics = Model.getAllDeficiencies(proj);

    // ── Build flat list of photo records (one per photo) ──
    var records = [];
    sitePhotos.forEach(function(p, i) {
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
      (defic.observations || []).forEach(function(o, oi) {
        (o.photos || []).forEach(function(ph, phi) {
          var dk = _dayKey(ph, defic);
          records.push({
            type: 'defic',
            deficId: defic.id,
            deficNum: defic.num,
            isGeneralPriority: isGeneral,
            obsIdx: oi,
            photoIdx: phi,
            ph: ph,
            src: ph.r2Url || ph.dataUrl || '',
            badgeText: 'Pin ' + defic.num,
            badgeClass: badgeCls,
            dateKey: dk.key, dateLabel: dk.label,
            sortGroup: [1, defic.num, oi, phi]
          });
        });
      });
    });

    // Stamp UIDs
    records.forEach(function(r) { r.uid = _photoUid(r); });

    // ── Stats: pre-filter totals (for the header counters) ──
    var totalAll = records.length;
    var totalSite = records.filter(function(r) { return r.type === 'site'; }).length;
    var totalDefic = records.filter(function(r) { return r.type === 'defic' && !r.isGeneralPriority; }).length;
    var totalGeneral = records.filter(function(r) { return r.type === 'defic' && r.isGeneralPriority; }).length;

    // ── Apply filter ──
    var filtered = records.filter(function(r) {
      if (_filterMode === 'all') return true;
      if (_filterMode === 'site') return r.type === 'site';
      // S114 P1.3 rename: deficiency→findings, general→notes (label-only; semantics unchanged)
      if (_filterMode === 'findings') return r.type === 'defic' && !r.isGeneralPriority;
      if (_filterMode === 'notes') return r.type === 'defic' && r.isGeneralPriority;
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
      var msg = totalAll === 0 ? 'No photos yet. Upload site photos or add photos to deficiencies.'
        : 'No photos match the current filter.';
      html += '<p class="ph-empty">' + msg + '</p>';
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
        var cardCls = 'ph-card';
        if (sel) cardCls += ' selected';
        html += '<div class="' + cardCls + '" data-uid="' + esc(r.uid) + '">';
        // S114 P1.3: checkbox is hover-only when unselected, always shown when selected
        html += '<input type="checkbox" class="ph-check"' + (sel ? ' checked' : '') + ' data-action="ph-toggle-photo" data-uid="' + esc(r.uid) + '">';
        html += '<span class="ph-badge ' + r.badgeClass + '">' + esc(r.badgeText) + '</span>';
        if (r.src) {
          html += '<img ' + clickAction + ' src="' + esc(r.src) + '" loading="lazy" onerror="this.style.display=\'none\'">';
        } else {
          html += '<div class="ph-noimg">\uD83D\uDCF7</div>';
        }
        html += _cloudIcon(r.ph);
        // S114 P1.3: hover-revealed download button (all photos)
        var dlAction = r.type === 'site'
          ? 'data-action="ph-download-site" data-photo-idx="' + r.siteIdx + '"'
          : 'data-action="ph-download-defic" data-defic-id="' + esc(r.deficId) + '" data-obs-idx="' + r.obsIdx + '" data-photo-idx="' + r.photoIdx + '"';
        html += '<button class="ph-dl-btn" ' + dlAction + ' title="Download photo">'
          + '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
          + '</button>';
        // S114 P1.3: trash button is SITE PHOTOS ONLY. Pin photos must be deleted via pin editor.
        if (r.type === 'site') {
          html += '<button class="ph-del-btn" data-action="delete-site-photo" data-photo-idx="' + r.siteIdx + '" title="Delete site photo">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 7h12v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7zm3-3h6l1 2H8l1-2zM4 6h16v1H4V6z"/></svg>'
            + '</button>';
        }
        html += '</div>';
      });
      html += '</div>';
    });

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
document.addEventListener('click', function(e) {
  // Site photo lightbox
  var el = e.target.closest && e.target.closest('[data-action="open-site-lightbox"]');
  if (el) {
    var idx = parseInt(el.getAttribute('data-photo-idx') || '0');
    var proj = Model.getProject();
    if (proj && (proj.photos || []).length && window._frtLightbox) {
      // S115 fix: pass the live photo records (not a stripped projection),
      // so the markup save handler can find r2Key/id and propagate to siblings.
      // _ctxLabel is also set so the lightbox shows "Site Photo" in the caption.
      (proj.photos || []).forEach(function(p){ p._ctxLabel = 'Site Photo'; });
      window._frtLightbox.open(proj.photos, idx, { contextLabel:'Site Photo' });
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
      var photos = f.defic.observations[obsIdx].photos || [];
      if (photos.length && window._frtLightbox) {
        window._frtLightbox.open(photos, photoIdx, { contextLabel:'Pin #' + (f.defic.num || '?') });
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
      var ph = (f.defic.observations[oi].photos || [])[pi];
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
      var phD = (fD.defic.observations[oi].photos || [])[pi];
      if (phD) _downloadPhoto(phD, 'pin_' + (fD.defic.num || 'x') + '_' + (pi + 1));
    }
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
        (o.photos || []).forEach(function(ph, phi) {
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
      // Selection is entirely pin photos — disallow
      toast('Pin photos can only be deleted from the pin editor (open the pin to delete its photos)');
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

function _compressSitePhoto(file, cb) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxW = 1600;
      var w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      var tw = Math.min(200, w);
      var ts = tw / w;
      var tc = document.createElement('canvas');
      tc.width = tw; tc.height = Math.round(h * ts);
      tc.getContext('2d').drawImage(img, 0, 0, tc.width, tc.height);
      var thumb = tc.toDataURL('image/jpeg', 0.7);
      tc.width = 1; tc.height = 1;
      canvas.width = 1; canvas.height = 1;
      cb(dataUrl, thumb);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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

function _doReassign(destVal, selItems) {
  var proj = Model.getProject();
  if (!proj) return;
  var moved = 0;
  var skipped = 0;

  // Group defic selections to avoid index drift when removing from same obs
  // Sort by descending photoIdx within each (deficId, obsIdx) so splice is safe
  var deficBuckets = {};
  selItems.forEach(function(s) {
    if (s.type === 'defic') {
      var k = s.deficId + '|' + s.obsIdx;
      (deficBuckets[k] = deficBuckets[k] || []).push(s);
    }
  });
  Object.keys(deficBuckets).forEach(function(k){
    deficBuckets[k].sort(function(a,b){ return b.photoIdx - a.photoIdx; });
  });

  // Extract photo records (remove from source)
  var extracted = [];
  // Defic first (sorted per bucket)
  Object.keys(deficBuckets).forEach(function(k) {
    deficBuckets[k].forEach(function(s) {
      var f = Model.findDeficiency(s.deficId);
      if (!f) { skipped++; return; }
      var obs = (f.defic.observations || [])[s.obsIdx];
      if (!obs || !obs.photos || !obs.photos[s.photoIdx]) { skipped++; return; }
      // Prevent no-op move into same pin
      if (destVal === s.deficId) { skipped++; return; }
      var rec = obs.photos.splice(s.photoIdx, 1)[0];
      extracted.push({ rec: rec, fromType: 'defic' });
    });
  });
  // Site (sort descending by idx so splicing doesn't shift)
  var siteItems = selItems.filter(function(s){ return s.type === 'site'; })
    .sort(function(a,b){ return b.idx - a.idx; });
  siteItems.forEach(function(s) {
    if (destVal === '__site__') { skipped++; return; } // no-op
    var src = (proj.photos || [])[s.idx];
    if (!src) { skipped++; return; }
    var rec = proj.photos.splice(s.idx, 1)[0];
    extracted.push({ rec: rec, fromType: 'site' });
  });

  // Place into destination
  extracted.forEach(function(e) {
    var rec = e.rec;
    if (destVal === '__site__') {
      if (!proj.photos) proj.photos = [];
      // Ensure site-shape fields exist
      if (!rec.id) rec.id = 'sp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      if (!rec.caption) rec.caption = '';
      if (!rec.addedDate) rec.addedDate = new Date().toISOString();
      proj.photos.push(rec);
      moved++;
    } else {
      var df = Model.findDeficiency(destVal);
      if (!df) { skipped++; return; }
      if (!df.defic.observations || !df.defic.observations.length) {
        df.defic.observations = [{
          id: 'obs_' + Date.now() + '_' + Math.random().toString(36).substr(2,4),
          text: '', photos: [], addressed: false
        }];
      }
      var obs0 = df.defic.observations[0];
      if (!obs0.photos) obs0.photos = [];
      // Ensure independent identity (S59 footgun guard) — photos keep own r2Key/r2Url;
      // generate an id if missing so it's distinguishable in IDB/UI
      if (!rec.id) rec.id = 'dph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      obs0.photos.push(rec);
      moved++;
    }
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
  var d = e.detail; if (!d || !d.blob || !d.photo) return;
  var photo = d.photo;
  var proj = Model.getProject(); if (!proj) return;
  var pid = proj.id || proj.projectId; if (!pid) return;

  // ── Pre-markup state ──
  var preKey = photo.r2Key || '';
  var preUrl = photo.r2Url || '';
  // _origBlob is captured by lightbox._saveMarkup — it's the photo's
  // original dataUrl (before flatten). Used as a fallback when the
  // original was never uploaded to R2 (defic photos marked up before
  // the background original upload finished).
  var origBlobSrc = photo._origBlob || null;
  console.log('[Markup] save handler — photo.id=', photo.id, 'preKey=', preKey, 'has _origBlob=', !!origBlobSrc);

  // ── Find every photo record sharing the pre-markup r2Key ──
  var siblings = preKey
    ? Model.findPhotosByR2Key(preKey)
    : Model.findPhotosById(photo.id);
  var sawActive = siblings.some(function(s){ return s.photo === photo; });
  if (!sawActive) siblings.push({ photo: photo, location: { type: 'unknown' } });

  // First markup? Any sibling with _origBackupId means no.
  var firstMarkup = !siblings.some(function(s){ return s.photo && s.photo._origBackupId; });
  var existingBackupId = null;
  if (!firstMarkup) {
    siblings.some(function(s){
      if (s.photo && s.photo._origBackupId) { existingBackupId = s.photo._origBackupId; return true; }
      return false;
    });
  }

  // ── Compute deterministic marked R2 key (same across re-saves) ──
  var filename = 'marked_' + (photo.id || Date.now()) + '.jpg';
  var newKey = 'photos/' + pid + '/frt/marked/' + filename;
  var workerUrl = (R2 && R2.WORKER_URL) ? R2.WORKER_URL : 'https://arencon-r2-worker.hezhendong999.workers.dev';
  var newUrl = workerUrl + '/' + newKey;

  // ── Capture the original photo's date BEFORE we mutate anything ──
  // Per Mark's rule: the (original) backup keeps the ORIGINAL date so it
  // stays grouped with the rest of that day's photos. The active marked-up
  // photo gets TODAY's date — unless the original was already added today,
  // in which case it stays with today (no date change).
  var origAddedDate = photo.addedDate || photo.date || '';
  if (!origAddedDate && photo.id) {
    var idMatch = String(photo.id).match(/[a-z]+_(\d{13})/);
    if (idMatch) {
      try { origAddedDate = new Date(parseInt(idMatch[1])).toISOString().split('T')[0]; } catch(_){}
    }
  }
  var todayStr = new Date().toISOString().split('T')[0];

  // ── Helper: create the (original) backup gallery record ──
  // Called either synchronously (when preKey is known) or after we upload
  // the original from _origBlob (when preKey was empty).
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
  // Called once we have a backupId (either synchronously or after async
  // original upload). Mutates siblings in place + persists + renders.
  function _stampSiblings(backupId) {
    siblings.forEach(function(s){
      var sp = s.photo; if (!sp) return;
      sp.r2Key = newKey;
      sp.r2Url = newUrl;
      sp.r2Status = 'uploading';
      sp._annotated = true;
      if (backupId) sp._origBackupId = backupId;
      if (sp.addedDate !== todayStr) sp.addedDate = todayStr;
      delete sp.thumb;
      if (sp !== photo) { delete sp.dataUrl; }
    });
    try { IDB.put('photoBlobs', { id: photo.id, dataBlob: d.blob }).catch(function(){}); } catch(_){}
    Model.saveNow();
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
  }

  // ── Generate fresh thumb of the marked blob (best-effort, async) ──
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
        } catch(_){}
      };
      imgEl.src = ev.target.result;
    };
    fr.readAsDataURL(d.blob);
  } catch(_) { /* thumb gen is best-effort */ }

  // ── Upload marked blob to R2 (background — fire and queue on failure) ──
  R2.upload(pid, 'marked', d.blob, filename).then(function(result) {
    if (result) {
      var live = Model.findPhotosByR2Key(newKey);
      live.forEach(function(rec){ if (rec.photo) rec.photo.r2Status = 'uploaded'; });
      if (photo.r2Key === newKey) photo.r2Status = 'uploaded';
      Model.saveNow();
      if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    } else {
      console.warn('[Markup] R2 upload of marked blob failed — queueing');
      try { R2.queueUpload(photo.id, pid, 'marked', d.blob, filename); } catch(_){}
    }
  }).catch(function(err) {
    console.warn('[Markup] R2 upload of marked blob error, queueing:', err && err.message);
    try { R2.queueUpload(photo.id, pid, 'marked', d.blob, filename); } catch(_){}
  });

  // ── Backup creation: depends on whether we have preKey ──
  var backupId = existingBackupId;

  if (!firstMarkup) {
    // Re-save of an already-marked photo: backup exists, just stamp siblings.
    console.log('[Markup] re-save (existing backup), backupId=', backupId);
    _stampSiblings(backupId);
    return;
  }

  if (preKey) {
    // Original is already in R2 — backup record points at it directly.
    console.log('[Markup] first markup with preKey — creating backup synchronously');
    backupId = _createBackup(preKey, preUrl);
    _stampSiblings(backupId);
    return;
  }

  // No preKey: original was never uploaded (or upload didn't return in time).
  // Upload _origBlob to R2 ourselves, then create backup pointing at it.
  if (!origBlobSrc) {
    console.warn('[Markup] First markup, no preKey AND no _origBlob — cannot create backup. Markup state will be flagged but Revert won\\'t work.');
    _stampSiblings(null); // no backupId — markup persists but unrevertable
    return;
  }

  console.log('[Markup] first markup, no preKey — uploading original from _origBlob first');
  var origFilename = 'orig_' + (photo.id || Date.now()) + '.jpg';
  var origKey = 'photos/' + pid + '/frt/original/' + origFilename;
  var origUrl = workerUrl + '/' + origKey;

  // Convert _origBlob (data URI or Blob) → Blob, then upload.
  function _toBlob(src) {
    if (src instanceof Blob) return Promise.resolve(src);
    if (typeof src === 'string' && src.indexOf('data:') === 0) return fetch(src).then(function(r){ return r.blob(); });
    return Promise.resolve(null);
  }
  _toBlob(origBlobSrc).then(function(origBlob) {
    if (!origBlob) {
      console.warn('[Markup] Could not convert _origBlob to Blob — falling back to no-backup');
      _stampSiblings(null);
      return;
    }
    return R2.upload(pid, 'original', origBlob, origFilename).then(function(uploadResult) {
      // Create backup record EVEN IF upload failed — backup carries r2Key/r2Url
      // pointing at the intended location. If upload retries fix it later,
      // the URL becomes valid retroactively. Without a backup record, Revert
      // is impossible; with one, the flow can recover even on flaky network.
      var actualKey = (uploadResult && uploadResult.r2Key) || origKey;
      var actualUrl = (uploadResult && uploadResult.r2Url) || origUrl;
      console.log('[Markup] original uploaded:', actualKey, 'success=', !!uploadResult);
      var backupId2 = _createBackup(actualKey, actualUrl);
      _stampSiblings(backupId2);
      // Queue a retry if the upload didn't actually succeed.
      if (!uploadResult) {
        try { R2.queueUpload('orig_' + photo.id, pid, 'original', origBlob, origFilename); } catch(_){}
      }
    });
  }).catch(function(err) {
    console.warn('[Markup] original upload error:', err && err.message, '— creating backup with intended URL anyway');
    var backupId2 = _createBackup(origKey, origUrl);
    _stampSiblings(backupId2);
  });
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
  var d = e.detail; if (!d || !d.photo) return;
  var photo = d.photo;
  var proj = Model.getProject(); if (!proj) return;
  console.log('[Markup] revert handler entered — photo.id=', photo.id, '_origBackupId=', photo._origBackupId);

  if (!photo._origBackupId) {
    // No persisted backup — just clear in-memory annotated flag.
    console.log('[Markup] revert: no _origBackupId — nothing persisted to revert');
    delete photo._annotated;
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    return;
  }

  // Find backup in the gallery.
  var backup = (proj.photos || []).find(function(p){ return p && p.id === photo._origBackupId; });
  if (!backup) {
    console.warn('[Markup] Revert: backup record not found in gallery — clearing flags only');
    delete photo._origBackupId;
    delete photo._annotated;
    Model.saveNow();
    if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
    return;
  }
  console.log('[Markup] revert: backup found — origKey=', backup.r2Key);

  var origKey = backup.r2Key || '';
  var origUrl = backup.r2Url || '';
  var origThumb = backup.thumb || '';
  var markedKey = photo.r2Key || '';

  // Find ALL siblings currently pointing at the marked R2 file.
  var siblings = markedKey
    ? Model.findPhotosByR2Key(markedKey)
    : [];
  if (!siblings.some(function(s){ return s.photo === photo; })) {
    siblings.push({ photo: photo, location: { type: 'unknown' } });
  }
  // Also pick up any sibling tagged with this _origBackupId.
  Model.getAllPhotoRecords().forEach(function(rec){
    if (rec.photo && rec.photo._origBackupId === backup.id) {
      if (!siblings.some(function(s){ return s.photo === rec.photo; })) siblings.push(rec);
    }
  });
  console.log('[Markup] revert: restoring', siblings.length, 'sibling(s) to original');

  // Restore on every sibling.
  siblings.forEach(function(s){
    var sp = s.photo; if (!sp) return;
    sp.r2Key = origKey;
    sp.r2Url = origUrl;
    sp.r2Status = 'uploaded'; // S115 fix: gallery checks 'uploaded'
    if (origThumb) sp.thumb = origThumb;
    else delete sp.thumb;
    delete sp._annotated;
    delete sp._origBackupId;
    delete sp.dataUrl;
  });

  // Remove backup record from gallery.
  Model.removeSitePhotoById(backup.id);

  // Delete marked R2 file (background; ignore errors).
  if (markedKey && markedKey !== origKey && R2 && R2.del) {
    try { R2.del(markedKey).catch(function(){}); } catch(_){}
  }
  // Drop stale IDB blob too.
  try { IDB.delete('photoBlobs', photo.id).catch(function(){}); } catch(_){}

  Model.saveNow();
  if (typeof initPhotos !== 'undefined' && initPhotos.render) initPhotos.render();
});
