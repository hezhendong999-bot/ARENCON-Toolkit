/**
 * ARENCON FRT v2 — Tile Cache (S96 Fix #3)
 * ════════════════════════════════════════
 *
 * Helpers for offline-tile workflows. The actual cache is populated and read
 * by the service worker (sw.js) using the Cache API under the name
 * 'arencon-frt-tiles-v1'. This module is the page-side coordination layer
 * that:
 *
 *   - fetches manifests
 *   - enumerates tile URLs at requested levels
 *   - issues GET requests for each tile (the SW intercepts and caches)
 *   - reports progress to a callback so UI can show a counter
 *
 * Design notes:
 *   - Auto-prefetch on project open should request ONLY L0+L1+L2 (cheap,
 *     ~30-60 MB for a typical 10-drawing project, gives readable-zoom offline)
 *   - Hub "Download for Offline" button requests ALL levels (L0..LMax),
 *     covers deep-zoom inspection at no-signal sites. Larger payload
 *     (250 MB - 1 GB), needs explicit user intent + foreground app
 *     (iOS Safari kills background JS).
 *   - Concurrency capped at 6 parallel requests — browsers throttle beyond
 *     that anyway, and we want the network to absorb other app traffic.
 *
 * iOS Safari background limitation:
 *   When the app is backgrounded or the tab is closed, JS execution stops.
 *   Bulk downloads must complete while the app is in the foreground. The
 *   UI should make this clear to the user (e.g. "Keep app open while caching").
 */

var WORKER_BASE = 'https://arencon-r2-worker.hezhendong999.workers.dev';

// ── Manifest URL builders ─────────────────────────────────────────────────
function manifestUrl(pid, drawingId) {
  return WORKER_BASE + '/' + encodeURIComponent(pid) + '/tiles/' + encodeURIComponent(drawingId) + '/manifest.json';
}
function tileUrl(pid, drawingId, page, level, x, y) {
  // Per S94 audit: .webp is the source of truth (fresh renders). .jpg may
  // exist at the same key from pre-S90 renders but is never served by viewer.
  return WORKER_BASE + '/' + encodeURIComponent(pid)
    + '/tiles/' + encodeURIComponent(drawingId)
    + '/page-' + page + '/level-' + level
    + '/' + x + '-' + y + '.webp';
}

// ── Manifest fetch (network-first via SW) ─────────────────────────────────
function fetchManifest(pid, drawingId) {
  return fetch(manifestUrl(pid, drawingId), { cache: 'reload' })
    .then(function(r) {
      if (!r || !r.ok) return null;
      return r.json().catch(function() { return null; });
    })
    .catch(function() { return null; });
}

// ── Enumerate tile URLs from manifest at given level set ──────────────────
// levels: array of level indices, e.g. [0,1,2] for auto-prefetch tiers
//         or null for ALL levels (full download)
function enumerateTileUrls(pid, drawingId, manifest, levels) {
  var urls = [];
  if (!manifest || !manifest.pages) return urls;
  for (var pi = 0; pi < manifest.pages.length; pi++) {
    var page = manifest.pages[pi];
    if (!page.levels) continue;
    var pn = page.pageNumber || (pi + 1);
    for (var li = 0; li < page.levels.length; li++) {
      var lv = page.levels[li];
      if (levels && levels.indexOf(lv.level) < 0) continue;
      for (var y = 0; y < lv.rows; y++) {
        for (var x = 0; x < lv.cols; x++) {
          urls.push(tileUrl(pid, drawingId, pn, lv.level, x, y));
        }
      }
    }
  }
  return urls;
}

// ── Bounded-concurrency fetcher ───────────────────────────────────────────
// SW intercepts each fetch; if not in TILE_CACHE it goes network → cache → response.
// We don't care about the response body — just that it lands in cache.
function _fetchAll(urls, concurrency, onProgress, abortSignal) {
  return new Promise(function(resolve) {
    var i = 0, done = 0, fail = 0, total = urls.length;
    if (total === 0) { resolve({ done: 0, fail: 0, total: 0 }); return; }

    function next() {
      if (abortSignal && abortSignal.aborted) {
        resolve({ done: done, fail: fail, total: total, aborted: true });
        return;
      }
      if (i >= total) {
        if (done + fail >= total) resolve({ done: done, fail: fail, total: total });
        return;
      }
      var url = urls[i++];
      // HEAD would be cheaper but Cache API stores by GET method only — so we GET.
      // Browser/SW will short-circuit if already cached (no actual network).
      fetch(url).then(function(r) {
        if (r && (r.ok || r.status === 504)) done++; else fail++;
        if (onProgress) try { onProgress({ done: done, fail: fail, total: total }); } catch(_){}
        next();
      }).catch(function() {
        fail++;
        if (onProgress) try { onProgress({ done: done, fail: fail, total: total }); } catch(_){}
        next();
      });
    }

    var n = Math.max(1, Math.min(concurrency || 6, total));
    for (var s = 0; s < n; s++) next();
  });
}

// ── Public API ────────────────────────────────────────────────────────────

// Prefetch a specific set of levels for a single drawing.
// Used by FRT auto-prefetch on project open (levels = [0,1,2]).
// Returns Promise<{done, fail, total}>.
export function prefetchDrawingLevels(pid, drawingId, levels, onProgress, abortSignal) {
  return fetchManifest(pid, drawingId).then(function(manifest) {
    if (!manifest) return { done: 0, fail: 0, total: 0, noManifest: true };
    var urls = enumerateTileUrls(pid, drawingId, manifest, levels);
    return _fetchAll(urls, 6, onProgress, abortSignal);
  });
}

// Prefetch L0+L1+L2 for ALL drawings in a project.
// Sequential per drawing so progress is meaningful; parallel within drawing.
// onProgress receives { drawingIndex, drawingCount, drawingId, done, fail, total }.
export function autoPrefetchProject(pid, drawings, onProgress, abortSignal) {
  var levels = [0, 1, 2]; // S96 hybrid plan: readable zoom only
  var i = 0, totalDrawings = drawings.length;
  function step() {
    if (abortSignal && abortSignal.aborted) return Promise.resolve({ aborted: true });
    if (i >= totalDrawings) return Promise.resolve({ done: true, count: totalDrawings });
    var d = drawings[i++];
    if (!d || !d.id) return step();
    return prefetchDrawingLevels(pid, d.id, levels, function(p) {
      if (onProgress) try {
        onProgress({ drawingIndex: i, drawingCount: totalDrawings, drawingId: d.id, name: d.name, done: p.done, fail: p.fail, total: p.total });
      } catch(_){}
    }, abortSignal).then(step);
  }
  return step();
}

// Full download — every level of every drawing in a project. Used by Hub
// "Download for Offline" button. Caller must keep the app foreground on iOS.
export function downloadProjectAllTiles(pid, drawings, onProgress, abortSignal) {
  var i = 0, totalDrawings = drawings.length;
  function step() {
    if (abortSignal && abortSignal.aborted) return Promise.resolve({ aborted: true });
    if (i >= totalDrawings) return Promise.resolve({ done: true, count: totalDrawings });
    var d = drawings[i++];
    if (!d || !d.id) return step();
    return prefetchDrawingLevels(pid, d.id, null /* all levels */, function(p) {
      if (onProgress) try {
        onProgress({ drawingIndex: i, drawingCount: totalDrawings, drawingId: d.id, name: d.name, done: p.done, fail: p.fail, total: p.total });
      } catch(_){}
    }, abortSignal).then(step);
  }
  return step();
}

// Ask the service worker how many tiles are cached for a project.
export function getProjectCacheStats(pid) {
  return new Promise(function(resolve) {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      resolve({ count: 0, swMissing: true }); return;
    }
    var ch = new MessageChannel();
    var t = setTimeout(function() { resolve({ count: 0, timeout: true }); }, 3000);
    ch.port1.onmessage = function(e) {
      clearTimeout(t);
      resolve({ count: (e.data && e.data.count) || 0 });
    };
    navigator.serviceWorker.controller.postMessage({ type: 'TILE_CACHE_STATS', pid: pid }, [ch.port2]);
  });
}

// Purge cached tiles for a single project (used by Hub "Clear offline cache").
export function purgeProjectCache(pid) {
  return new Promise(function(resolve) {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      resolve({ count: 0, swMissing: true }); return;
    }
    var ch = new MessageChannel();
    var t = setTimeout(function() { resolve({ count: 0, timeout: true }); }, 30000);
    ch.port1.onmessage = function(e) {
      clearTimeout(t);
      resolve({ count: (e.data && e.data.count) || 0 });
    };
    navigator.serviceWorker.controller.postMessage({ type: 'TILE_CACHE_PURGE_PROJECT', pid: pid }, [ch.port2]);
  });
}

// Convenience: detect if a sentinel offline-tile response came back (1x1 PNG).
// Pass an HTMLImageElement onerror or a fetch Response. The SW marks these
// with header 'X-Offline-Sentinel: 1'.
export function isOfflineSentinelResponse(resp) {
  return !!(resp && resp.headers && resp.headers.get('X-Offline-Sentinel') === '1');
}

export var TileCache = {
  prefetchDrawingLevels: prefetchDrawingLevels,
  autoPrefetchProject: autoPrefetchProject,
  downloadProjectAllTiles: downloadProjectAllTiles,
  getProjectCacheStats: getProjectCacheStats,
  purgeProjectCache: purgeProjectCache,
  isOfflineSentinelResponse: isOfflineSentinelResponse,
  _manifestUrl: manifestUrl,
  _tileUrl: tileUrl
};
