// frt/js/diag/r2cleanup.js
// S124 A4 — R2 Orphan Cleanup (console-driven).
//
// PURPOSE
// ───────
// Finds and removes R2 objects that no longer have a live referent in the
// current project. Covers three categories the existing exclusive-asset
// cleanup (R2.deleteDrawingAssets, S120 P25) intentionally left open:
//   - tiles    (S120 P25 deferred this — no list-by-prefix on /tiles/)
//   - photos   (any photo binary dropped during 3-way merges, S123 P6B residue)
//   - pdfbufs  (any PDF buffer that lost its drawing ref via crash / cancel)
//
// USAGE (in DevTools console, after the project loads in Hub mode)
// ────────────────────────────────────────────────────────────────
//   _r2cleanup.scan()                       // build orphan inventory + print summary
//   _r2cleanup.inventory()                  // returns last scan for inspection
//   _r2cleanup.deleteOrphans()              // first call arms confirm, second deletes
//   _r2cleanup.deleteOrphans('tiles')       // scope to one category
//   _r2cleanup.cancel()                     // disarm a pending delete
//
// SAFETY
// ──────
// Two-step delete (same pattern as _drawingMigrate.deleteHidden):
//   1. First call lists targets + arms a 30-second confirm window.
//   2. Second call within the window actually issues DELETE requests.
// Categories: photos | pdfbufs | tiles | other.
//
// LIVENESS RULES
// ──────────────
//   photos     → key matches a live photo r2Key in Model
//   pdfbufs    → pdfBufKey is referenced by some live, non-tombstoned drawing
//   tiles      → drawingId segment matches some live, non-tombstoned drawing
//   other      → anything else under {pid}/ — surfaced but never auto-classified live
//
// Exposes window._r2cleanup. Does NOT auto-run anything.

(function () {
  'use strict';

  function _getFrt() {
    return (typeof window !== 'undefined' && window._frt) || null;
  }
  function _getModel() {
    var f = _getFrt();
    return f ? f.Model : null;
  }
  function _getR2() {
    var f = _getFrt();
    return f ? f.R2 : null;
  }

  var _inventory = null;
  var _deleteArmed = 0; // timestamp; 0 = disarmed

  // S132 — Resolve the canonical R2 project id.
  //
  // BUG (S130 observation, root-caused S132): R2 uploads are split across
  // two id spaces — drawings/tiles/photos/pdfbufs use the Hub ?project=
  // UUID, while markup uploads used the FRT internal proj.id (proj_*).
  // This tool previously preferred proj.id, so listAll(proj.id) only saw
  // the markup folder ("1 object" when the project had 200+) and the
  // classifier mis-bucketed everything stored under the UUID.
  //
  // The ?project= UUID is the canonical pid — it's what the Hub, the tile
  // renderer and the worker all key on. Prefer it. proj.id is only the
  // fallback for standalone mode (no ?project= param), where it is the
  // pid actually used for uploads.
  function _getProjectId() {
    try {
      var p = new URLSearchParams(window.location.search);
      var fromUrl = p.get('project');
      if (fromUrl) return fromUrl;
    } catch (e) { /* fall through */ }
    var Model = _getModel();
    if (Model) {
      var proj = Model.getProject && Model.getProject();
      if (proj && proj.id) return proj.id;
    }
    return null;
  }

  function _fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  /**
   * Walk project state and build sets of live R2 references.
   */
  function _collectLiveRefs(proj) {
    var photoKeys = new Set();
    var pdfBufKeys = new Set();
    var drawingIds = new Set();

    // S479f ROOT CAUSE FIX (the 6360.08 Obs 1A deletion, twice-broken photo).
    // Records store keys as  photos/{pid}/frt/...  while the bucket (and the
    // /list/ endpoint) use    {pid}/photos/frt/... — the documented format
    // asymmetry. _classify compared raw BUCKET keys against a set of raw
    // RECORD keys: the two can never be equal, so EVERY live photo in EVERY
    // project scanned as "orphan — no live photo references this r2Key", and
    // deleteOrphans('photos') would delete the whole gallery. Both forms of
    // every reference now enter the set, so a referenced object matches no
    // matter which format either side speaks.
    function _bothForms(k) {
      photoKeys.add(k);
      var m = /^photos\/([^/]+)\/(.+)$/.exec(k);        // record → bucket
      if (m) photoKeys.add(m[1] + '/photos/' + m[2]);
      var b = /^([^/]+)\/photos\/(.+)$/.exec(k);        // bucket → record
      if (b) photoKeys.add('photos/' + b[1] + '/' + b[2]);
    }

    function addPhoto(ph) {
      if (ph && ph.r2Key && !ph.deleted) _bothForms(ph.r2Key);
    }

    (proj.photos || []).forEach(addPhoto);
    (proj.sitePhotos || []).forEach(addPhoto);

    (proj.contractors || []).forEach(function (c) {
      (c.deficiencies || []).forEach(function (d) {
        (d.photos || []).forEach(addPhoto);
        (d.observations || []).forEach(function (o) {
          (o.photos || []).forEach(addPhoto);
        });
      });
    });
    (proj.generalDeficiencies || []).forEach(function (d) {
      (d.photos || []).forEach(addPhoto);
      (d.observations || []).forEach(function (o) {
        (o.photos || []).forEach(addPhoto);
      });
    });

    (proj.drawings || []).forEach(function (d) {
      if (!d || d._migratedAwayTo) return;
      if (d.id) drawingIds.add(d.id);
      if (d.pdfBufKey) pdfBufKeys.add(d.pdfBufKey);
      if (d.r2Key) _bothForms(d.r2Key);   // S479f: same dual-form treatment
    });

    return { photoKeys: photoKeys, pdfBufKeys: pdfBufKeys, drawingIds: drawingIds };
  }

  /**
   * Classify an R2 object key. Returns {category, isOrphan, reason, ...meta}.
   */
  function _classify(key, live, pid) {
    var rest = key.indexOf(pid + '/') === 0 ? key.substring(pid.length + 1) : key;

    if (rest.indexOf('tiles/') === 0) {
      var afterTiles = rest.substring(6);
      var slashIdx = afterTiles.indexOf('/');
      var drawingId = slashIdx >= 0 ? afterTiles.substring(0, slashIdx) : afterTiles;
      var isOrphan = !live.drawingIds.has(drawingId);
      return {
        category: 'tiles',
        isOrphan: isOrphan,
        drawingId: drawingId,
        reason: isOrphan ? 'drawingId not in project' : null
      };
    }

    if (rest.indexOf('photos/pdfbufs/') === 0) {
      var pdfFname = rest.substring('photos/pdfbufs/'.length);
      var bufKey = pdfFname.replace(/\.pdf$/i, '');
      var isOrphanPdf = !live.pdfBufKeys.has(bufKey);
      return {
        category: 'pdfbufs',
        isOrphan: isOrphanPdf,
        bufKey: bufKey,
        reason: isOrphanPdf ? 'pdfBufKey not referenced by any drawing' : null
      };
    }

    if (rest.indexOf('photos/frt/') === 0) {
      var isOrphanPhoto = !live.photoKeys.has(key);
      return {
        category: 'photos',
        isOrphan: isOrphanPhoto,
        reason: isOrphanPhoto ? 'no live photo references this r2Key' : null
      };
    }

    // S132 — an unrecognized key shape must NEVER be auto-classified as a
    // deletable orphan. Previously this returned isOrphan:true, so any key
    // the classifier didn't understand (e.g. a future asset type, or — until
    // the markup-pid split is fixed — markup stored under a different id
    // prefix) became a deletion candidate. isOrphan:false here means scan()
    // excludes it from the orphan inventory entirely: it is never flagged
    // and can never be deleted by deleteOrphans(). (A future change could
    // surface these in a separate review-only list; not deleting them is
    // the safety-critical part.)
    return { category: 'other', isOrphan: false, reason: 'unrecognized key shape — excluded from cleanup' };
  }

  function scan() {
    var pid = _getProjectId();
    if (!pid) {
      console.warn('%c[r2cleanup] No project context. Open a project first.', 'color:#A85959');
      return Promise.resolve(null);
    }
    var Model = _getModel();
    var R2 = _getR2();
    if (!Model || !R2) {
      console.warn('%c[r2cleanup] Model/R2 not available — load app first.', 'color:#A85959');
      return Promise.resolve(null);
    }
    var proj = Model.getProject && Model.getProject();
    if (!proj) {
      console.warn('%c[r2cleanup] No project loaded yet.', 'color:#A85959');
      return Promise.resolve(null);
    }
    if (typeof R2.listAll !== 'function') {
      console.warn('%c[r2cleanup] R2.listAll not available. Worker may not have the /listall endpoint deployed.', 'color:#A85959');
      return Promise.resolve(null);
    }
    console.log('[r2cleanup] Scanning project ' + String(pid).slice(0, 8) + '... — this may take a few seconds');

    var live = _collectLiveRefs(proj);
    console.log('[r2cleanup] Live refs:',
      live.photoKeys.size, 'photos,',
      live.pdfBufKeys.size, 'pdfBufKeys,',
      live.drawingIds.size, 'drawings');

    return R2.listAll(pid).then(function (result) {
      if (!result) {
        console.warn('[r2cleanup] listAll returned null — auth or network failed.');
        return null;
      }
      var inv = {
        pid: pid,
        scannedAt: new Date().toISOString(),
        totalR2Objects: result.count,
        totalR2Bytes: result.totalBytes,
        truncated: result.truncated,
        live: { photos: live.photoKeys.size, pdfBufs: live.pdfBufKeys.size, drawings: live.drawingIds.size },
        orphans: { photos: [], pdfbufs: [], tiles: [], other: [] },
        orphanBytes: { photos: 0, pdfbufs: 0, tiles: 0, other: 0 }
      };
      (result.objects || []).forEach(function (o) {
        var c = _classify(o.key, live, pid);
        if (c.isOrphan) {
          inv.orphans[c.category].push({
            key: o.key,
            size: o.size || 0,
            uploaded: o.uploaded,
            reason: c.reason,
            drawingId: c.drawingId,
            bufKey: c.bufKey
          });
          inv.orphanBytes[c.category] += (o.size || 0);
        }
      });
      var totalOrphans =
        inv.orphans.photos.length + inv.orphans.pdfbufs.length +
        inv.orphans.tiles.length + inv.orphans.other.length;
      var totalOrphanBytes =
        inv.orphanBytes.photos + inv.orphanBytes.pdfbufs +
        inv.orphanBytes.tiles + inv.orphanBytes.other;
      console.log('%c[r2cleanup] Inventory built:', 'font-weight:bold');
      console.table({
        photos:  { count: inv.orphans.photos.length,  size: _fmtBytes(inv.orphanBytes.photos) },
        pdfbufs: { count: inv.orphans.pdfbufs.length, size: _fmtBytes(inv.orphanBytes.pdfbufs) },
        tiles:   { count: inv.orphans.tiles.length,   size: _fmtBytes(inv.orphanBytes.tiles) },
        other:   { count: inv.orphans.other.length,   size: _fmtBytes(inv.orphanBytes.other) }
      });
      console.log('  Total orphans:', totalOrphans, '(' + _fmtBytes(totalOrphanBytes) + ')');
      console.log('  Total R2 objects:', result.count, '(' + _fmtBytes(result.totalBytes) + ')');
      if (result.truncated) {
        console.warn('%c[r2cleanup] Result is TRUNCATED (>20k objects). Re-run after deleting a batch.', 'color:#B07F5A');
      }
      if (totalOrphans > 0) {
        console.log('%c  Run _r2cleanup.deleteOrphans() to remove them (2-step confirm).', 'color:#B07F5A');
      }
      // S479f SANITY BREAKER (independent of the format fix above): if MOST
      // photos in the bucket classify as orphans, the overwhelmingly likely
      // truth is that the COMPARISON is broken (format drift, stale project
      // state), not that the bucket is full of garbage. A lying inventory
      // behind a confirm dialog is how the 6360.08 photo died. Poison the
      // photos scope: report it, refuse to let deleteOrphans arm on it.
      var _phTotal = 0;
      (result.objects || []).forEach(function (o) {
        if (o && o.key && o.key.indexOf('/photos/frt/') >= 0) _phTotal++;
      });
      if (inv.orphans.photos.length > 5 && _phTotal > 0 &&
          inv.orphans.photos.length > _phTotal * 0.5) {
        console.error('%c[r2cleanup] SCAN INVALID for photos: ' +
          inv.orphans.photos.length + ' of ' + _phTotal +
          ' photo objects classified orphan (>50%). That pattern means the ' +
          'reference comparison is broken, NOT that the photos are orphans. ' +
          'Photos scope is DISABLED for this inventory.', 'color:#A85959;font-weight:bold');
        inv.orphansInvalid = inv.orphansInvalid || {};
        inv.orphansInvalid.photos = inv.orphans.photos;
        inv.orphans.photos = [];
        inv.orphanBytes.photos = 0;
      }
      _inventory = inv;
      return inv;
    });
  }

  function inventory() {
    return _inventory;
  }

  function deleteOrphans(scope) {
    if (!_inventory) {
      console.warn('%c[r2cleanup] No inventory. Run _r2cleanup.scan() first.', 'color:#A85959');
      return null;
    }
    var R2 = _getR2();
    if (!R2 || typeof R2.del !== 'function') {
      console.warn('%c[r2cleanup] R2.del not available.', 'color:#A85959');
      return null;
    }
    var validScopes = ['photos', 'pdfbufs', 'tiles', 'other'];
    if (scope && validScopes.indexOf(scope) < 0) {
      console.warn('[r2cleanup] Bad scope: ' + scope + '. Valid: ' + validScopes.join(', '));
      return null;
    }
    var targets = [];
    var scopes = scope ? [scope] : validScopes;
    scopes.forEach(function (s) {
      (_inventory.orphans[s] || []).forEach(function (o) {
        targets.push({ key: o.key, size: o.size, scope: s });
      });
    });
    if (!targets.length) {
      console.log('[r2cleanup] Nothing to delete' + (scope ? ' in scope "' + scope + '"' : '') + '.');
      return 0;
    }
    var totalBytes = targets.reduce(function (s, t) { return s + (t.size || 0); }, 0);
    console.warn('[r2cleanup] About to delete ' + targets.length + ' object(s) (' + _fmtBytes(totalBytes) + ')' +
      (scope ? ' from scope "' + scope + '"' : '') + ':');
    console.table(targets.slice(0, 50).map(function (t) {
      return { scope: t.scope, key: t.key, size: _fmtBytes(t.size) };
    }));
    if (targets.length > 50) console.log('  ... and ' + (targets.length - 50) + ' more (truncated for display)');

    var now = Date.now();
    if (!_deleteArmed || (now - _deleteArmed) > 30000) {
      _deleteArmed = now;
      console.warn('%c[r2cleanup] Run _r2cleanup.deleteOrphans(' +
        (scope ? '\'' + scope + '\'' : '') +
        ') AGAIN within 30 seconds to confirm deletion.', 'color:#A85959;font-weight:bold');
      return null;
    }
    _deleteArmed = 0;

    console.log('%c[r2cleanup] Deleting...', 'color:#A85959');
    var deleted = 0;
    var failed = 0;
    var chain = Promise.resolve();
    targets.forEach(function (t) {
      chain = chain.then(function () {
        // S481: route through the guard. The cleaner has already proven these
        // are orphans (S461 both-format check + >50% sanity brake upstream),
        // so force:true is correct — but the guard remains the single audited
        // photo-delete verb across the whole app.
        var _del = (R2.delPhotoGuarded ? R2.delPhotoGuarded(t.key, { force: true }) : R2.del(t.key));
        return _del.then(function (ok) {
          if (ok) deleted++; else failed++;
        });
      });
    });
    return chain.then(function () {
      console.log('%c[r2cleanup] Done. Deleted ' + deleted + '/' + targets.length +
        ' (failed: ' + failed + ', freed ' + _fmtBytes(totalBytes) + ').',
        'color:#5C7A65;font-weight:bold');
      _inventory = null;
      return { deleted: deleted, failed: failed, freedBytes: totalBytes };
    });
  }

  function cancel() {
    if (_deleteArmed) {
      _deleteArmed = 0;
      console.log('[r2cleanup] Pending delete disarmed.');
    } else {
      console.log('[r2cleanup] Nothing armed.');
    }
  }

  if (typeof window !== 'undefined') {
    window._r2cleanup = {
      scan: scan,
      inventory: inventory,
      deleteOrphans: deleteOrphans,
      cancel: cancel
    };
  }
})();
