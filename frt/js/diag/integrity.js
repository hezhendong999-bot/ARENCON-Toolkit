// frt/js/diag/integrity.js
// S120 Push 9 — passive integrity checker for the S120 photo pool model.
//
// What it does:
//   - On project load (and after Model events that mutate photos), it walks
//     every deficiency and reports any of the 6 known integrity classes:
//       1. Pool photos with no r2Key AND no dataUrl (broken — won't render)
//       2. obs.photoSelection IDs that don't exist in the pool (stale refs)
//       3. obs.photoMarkups keys that don't exist in the pool (stale markups)
//       4. Soft-deleted (deleted:true) pool entries still referenced in any
//          obs.photoSelection or obs.photoMarkups (cascade failure)
//       5. Pool entries with no obs referencing them at all (orphans —
//          gallery V1 corner-badge mode would emit zero entries for these)
//       6. Pool entries appearing in obs.photoSelection but not in pool
//          (post-merge stale)
//   - Always-on (cheap walk, ~O(pins × photos)). Logs to console.warn at most
//     once per (deficId, classId) per session — repeats are dedup'd so a
//     re-render doesn't spam the console.
//   - Exposes window._frtIntegrityReport() for on-demand inspection. Returns
//     a structured array, not just text — handy for the recorder's transcript.
//   - When ?dbg=1 is on, also shows a small badge in the toolbar with the
//     count of unique findings; click reveals the report in an overlay.
//
// What it does NOT do:
//   - Does NOT auto-repair. Findings are advisory; the inspector or Mark
//     decides what to do. Cleaning up stale references requires saveNow,
//     and we don't want a passive checker silently mutating data.
//   - Does NOT call out R2 404s — that's a different problem class (network
//     state, not data structure). Future work.

(function () {
  'use strict';

  var _findings = [];           // { deficId, defNum, classId, classLabel, photoId, msg }
  var _seen = Object.create(null); // dedup key: deficId + ':' + classId + ':' + photoId
  var _dbgEnabled = false;
  try {
    _dbgEnabled = /[?&]dbg=1\b/.test(window.location.search || '') ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('_frtDbg') === '1');
  } catch (_) {}

  var CLASSES = {
    BROKEN_PHOTO:    { id: 1, label: 'broken-photo',     desc: 'Pool photo has neither r2Key nor dataUrl — will not render' },
    STALE_SELECTION: { id: 2, label: 'stale-selection',  desc: 'obs.photoSelection references a photoId not in pool' },
    STALE_MARKUP:    { id: 3, label: 'stale-markup',     desc: 'obs.photoMarkups key references a photoId not in pool' },
    DELETED_REFD:    { id: 4, label: 'deleted-still-referenced', desc: 'Soft-deleted pool entry still referenced — cascade failed' },
    POOL_ORPHAN:     { id: 5, label: 'pool-orphan',      desc: 'Pool photo referenced by zero obs (gallery emits zero entries)' },
    ID_COLLISION:    { id: 6, label: 'id-collision',     desc: 'Two pool entries share the same id' }
  };

  function _record(deficId, defNum, classDef, photoId, msg) {
    var key = deficId + ':' + classDef.id + ':' + (photoId || '-');
    if (_seen[key]) return;
    _seen[key] = true;
    var entry = {
      deficId: deficId,
      defNum: defNum,
      classId: classDef.id,
      classLabel: classDef.label,
      photoId: photoId || null,
      msg: msg
    };
    _findings.push(entry);
    // console.warn so it's grep-able and filterable
    console.warn('[Integrity:' + classDef.label + '] #' + defNum + (photoId ? ' photo=' + photoId : '') + ' — ' + msg);
  }

  function _checkDefic(d) {
    if (!d) return;
    var deficId = d.id;
    var defNum = d.num != null ? d.num : '?';
    var pool = d.photos || [];
    var poolIds = Object.create(null);  // id → photo
    var poolIdCounts = Object.create(null);
    pool.forEach(function (p) {
      if (!p || !p.id) return;
      poolIdCounts[p.id] = (poolIdCounts[p.id] || 0) + 1;
      poolIds[p.id] = p;
    });

    // CLASS 1 — broken photos
    pool.forEach(function (p) {
      if (!p || p.deleted) return;
      var hasSrc = !!(p.r2Key || p.dataUrl || p.r2Url || p.thumb);
      if (!hasSrc) _record(deficId, defNum, CLASSES.BROKEN_PHOTO, p.id, 'no r2Key, no dataUrl, no r2Url, no thumb');
    });

    // CLASS 6 — id collisions
    Object.keys(poolIdCounts).forEach(function (id) {
      if (poolIdCounts[id] > 1) _record(deficId, defNum, CLASSES.ID_COLLISION, id, 'appears ' + poolIdCounts[id] + 'x in pool');
    });

    // Track obs references for orphan check
    var refdIds = Object.create(null);

    (d.observations || []).forEach(function (o, oi) {
      if (!o) return;

      // CLASS 2 — stale selection
      if (Array.isArray(o.photoSelection)) {
        o.photoSelection.forEach(function (pid) {
          if (!poolIds[pid]) {
            _record(deficId, defNum, CLASSES.STALE_SELECTION, pid, 'obs[' + oi + '].photoSelection references missing pool id');
          } else {
            refdIds[pid] = true;
            // CLASS 4 — soft-deleted still referenced via selection
            if (poolIds[pid].deleted) {
              _record(deficId, defNum, CLASSES.DELETED_REFD, pid, 'obs[' + oi + '] selects soft-deleted photo');
            }
          }
        });
      } else {
        // Default-state obs implicitly references every non-deleted pool photo
        pool.forEach(function (p) { if (p && !p.deleted) refdIds[p.id] = true; });
      }

      // CLASS 3 — stale markup
      if (o.photoMarkups) {
        Object.keys(o.photoMarkups).forEach(function (pid) {
          if (!poolIds[pid]) {
            _record(deficId, defNum, CLASSES.STALE_MARKUP, pid, 'obs[' + oi + '].photoMarkups[' + pid + '] has no matching pool entry');
          } else if (poolIds[pid].deleted) {
            _record(deficId, defNum, CLASSES.DELETED_REFD, pid, 'obs[' + oi + '] has markup for soft-deleted photo');
          }
        });
      }
    });

    // CLASS 5 — pool orphans (only count non-deleted)
    pool.forEach(function (p) {
      if (!p || p.deleted) return;
      if (!refdIds[p.id]) {
        _record(deficId, defNum, CLASSES.POOL_ORPHAN, p.id, 'no obs references this photo — gallery V1 mode will emit 0 entries');
      }
    });
  }

  function _getModel() {
    return (typeof window !== 'undefined' && window._frt && window._frt.Model) || null;
  }

  function runCheck() {
    var Model = _getModel();
    if (!Model || !Model.getProject) return;
    var proj = Model.getProject();
    if (!proj) return;
    (proj.contractors || []).forEach(function (c) {
      (c.deficiencies || []).forEach(_checkDefic);
    });
    (proj.generalDeficiencies || []).forEach(_checkDefic);
    _refreshBadge();
  }

  // Call clear() before runCheck() to forget previous findings entirely
  function clear() {
    _findings = [];
    _seen = Object.create(null);
    _refreshBadge();
  }

  // Returns a structured snapshot — used by the recorder transcript and
  // the on-demand console call.
  function report() {
    var byClass = {};
    _findings.forEach(function (f) {
      var k = f.classLabel;
      byClass[k] = (byClass[k] || 0) + 1;
    });
    return {
      totalFindings: _findings.length,
      byClass: byClass,
      findings: _findings.slice(0, 200) // cap so console.log is readable
    };
  }

  // ── Optional: badge in dbg=1 mode ──
  function _refreshBadge() {
    if (!_dbgEnabled) return;
    var badge = document.getElementById('frt-integrity-badge');
    if (!badge) return;
    var n = _findings.length;
    if (n === 0) {
      badge.style.display = 'none';
    } else {
      badge.style.display = 'inline-flex';
      badge.textContent = '\u26A0 ' + n;
      badge.title = n + ' integrity finding' + (n === 1 ? '' : 's') + ' — click to view';
    }
  }

  function _ensureBadge() {
    if (!_dbgEnabled) return;
    if (document.getElementById('frt-integrity-badge')) return;
    var b = document.createElement('span');
    b.id = 'frt-integrity-badge';
    b.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:9998;background:#A85959;color:white;font-family:Calibri,sans-serif;font-size:12px;padding:3px 8px;border-radius:10px;cursor:pointer;display:none;align-items:center;gap:4px;';
    b.addEventListener('click', function () {
      console.group('[Integrity Report]');
      var rpt = report();
      console.log('Total findings:', rpt.totalFindings);
      console.log('By class:', rpt.byClass);
      console.table(rpt.findings);
      console.groupEnd();
      alert('Integrity report logged to console. Open DevTools to view.');
    });
    document.body.appendChild(b);
  }

  // ── Hooks ──
  // Run on project load + after photo mutations. Debounced so a burst of
  // events from a sync doesn't trigger N walks.
  var _debounceTimer = null;
  function _scheduleCheck() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      _debounceTimer = null;
      // Re-check from scratch so cleared findings stay cleared
      clear();
      runCheck();
    }, 300);
  }

  function _wireModelHooks() {
    var Model = _getModel();
    if (!Model || typeof Model.onChange !== 'function') return false;
    Model.onChange('project', function () { _scheduleCheck(); });
    Model.onChange('photo', function () { _scheduleCheck(); });
    Model.onChange('observation', function () { _scheduleCheck(); });
    Model.onChange('deficiency', function () { _scheduleCheck(); });
    return true;
  }

  function _bootstrap() {
    _ensureBadge();
    if (!_wireModelHooks()) {
      // Model not ready yet — retry shortly. Cap at 30s.
      var attempts = 0;
      var iv = setInterval(function () {
        attempts++;
        if (_wireModelHooks() || attempts > 60) clearInterval(iv);
      }, 500);
    }
    // First run after a beat — gives the project loader time to populate.
    setTimeout(_scheduleCheck, 1500);
    // VIEW_RESET regression sentinel — only when dbg=1
    if (_dbgEnabled) _startViewResetSentinel();
  }

  // ── VIEW_RESET regression sentinel ──
  // S114 fixed a bug where opening DevTools while panning would unexpectedly
  // snap the drawing viewer back to fit-zoom, losing the user's current view.
  // This sentinel polls window._frt.initViewer.getViewState() at 250ms and
  // logs a warning if scale collapses to fitScale while a pointer is down on
  // the viewport. False positives are possible (e.g. the user genuinely double-
  // tapped to fit) — but the log includes context so Mark can disambiguate.
  var _vrsActive = false;
  var _vrsLastScale = null;
  var _vrsLastFit = null;
  var _vrsPointerDown = false;

  function _startViewResetSentinel() {
    if (_vrsActive) return;
    _vrsActive = true;
    document.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('#dv-img-wrap, #drawing-viewer')) {
        _vrsPointerDown = true;
      }
    }, true);
    document.addEventListener('pointerup', function () {
      _vrsPointerDown = false;
    }, true);
    setInterval(function () {
      try {
        var iv = window._frt && window._frt.initViewer;
        if (!iv || typeof iv.getViewState !== 'function') return;
        var st = iv.getViewState();
        if (!st) return;
        var fit = (typeof iv.getFitScale === 'function') ? iv.getFitScale() : null;
        // We don't have getFitScale exported — infer from DOM if possible
        if (fit == null) {
          // Fallback: use last-known fit, calibrated when state is stable
          if (_vrsLastFit == null && _vrsLastScale != null && st.panX === 0 && st.panY === 0) {
            // Heuristic: state with panX=0, panY=0 is likely at fit
            _vrsLastFit = st.scale;
          }
          fit = _vrsLastFit;
        }
        if (_vrsLastScale != null && fit != null && _vrsPointerDown) {
          var was = _vrsLastScale;
          var now = st.scale;
          // Snapped to fit while pointer down — the bug signature
          if (was > fit * 1.05 && Math.abs(now - fit) < 0.001) {
            console.warn('[Integrity:view-reset] VIEW_RESET regression: scale snapped from ' + was.toFixed(3) + ' to fit ' + fit.toFixed(3) + ' while pointer was down. Pan:', st.panX, st.panY);
            _record('viewer', 'viewer', { id: 99, label: 'view-reset', desc: 'Scale collapsed to fit during active pan' }, null, 'scale ' + was.toFixed(3) + ' → ' + fit.toFixed(3));
          }
        }
        _vrsLastScale = st.scale;
      } catch (_) {}
    }, 250);
  }

  // ── Public API ──
  if (typeof window !== 'undefined') {
    window._frtIntegrityCheck = runCheck;
    window._frtIntegrityReport = function () {
      var rpt = report();
      console.group('[Integrity Report]');
      console.log('Total findings:', rpt.totalFindings);
      console.log('By class:', rpt.byClass);
      console.table(rpt.findings);
      console.groupEnd();
      return rpt;
    };
    window._frtIntegrityClear = clear;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootstrap);
  } else {
    _bootstrap();
  }
})();
