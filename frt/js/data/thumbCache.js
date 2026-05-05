/**
 * ARENCON FRT v2 — Drawing Thumbnail Cache (S117-B)
 * ═══════════════════════════════════════════════════
 *
 * Caches L0 (256px) WebP tiles from R2 so repeated pin-editor opens don't
 * re-fetch the same thumbnail across:
 *   - same project, same drawing, opened many times in one session
 *   - same drawing, opened across browser sessions (offline-resilient)
 *
 * Storage: piggybacks on the existing `drawingBlobs` IDB store using a
 * prefixed id `thumb-L0:{drawingId}` so no schema migration is needed.
 *
 * Two-tier cache:
 *   Tier 1 — in-memory `Map<drawingId, dataUrl>` (instant on second open)
 *   Tier 2 — IDB `drawingBlobs` (persists across sessions)
 *
 * On miss: fetch from R2 worker, store blob in IDB, decode to dataURL,
 * memoize. All errors fall through silently — caller falls back to next
 * candidate (dataUrl → r2Url → L0 → friendly placeholder).
 */

import { IDB } from './idb.js';

var WORKER_BASE = 'https://arencon-r2-worker.hezhendong999.workers.dev';

// In-memory tier — wiped on page reload
var _memCache = Object.create(null);

function _idbKey(drawingId) {
  return 'thumb-L0:' + drawingId;
}

function _l0Url(pid, drawingId) {
  return WORKER_BASE + '/' + encodeURIComponent(pid)
       + '/tiles/' + encodeURIComponent(drawingId) + '/L0/0_0.webp';
}

// Convert Blob → dataURL via FileReader. Resolves to '' on error.
function _blobToDataUrl(blob) {
  return new Promise(function(resolve) {
    if (!blob) { resolve(''); return; }
    try {
      var fr = new FileReader();
      fr.onload = function() { resolve(fr.result || ''); };
      fr.onerror = function() { resolve(''); };
      fr.readAsDataURL(blob);
    } catch (_) { resolve(''); }
  });
}

/**
 * Get a cached L0 thumbnail dataURL, or fetch + cache it.
 * Returns Promise<string> — empty string on any failure.
 *
 * @param {string} pid — project UUID
 * @param {string} drawingId — drawing id (NOT pdfBufKey — uses drawingId path)
 */
export function getL0Thumb(pid, drawingId) {
  if (!pid || !drawingId) return Promise.resolve('');

  // Tier 1 — memory
  if (_memCache[drawingId]) return Promise.resolve(_memCache[drawingId]);

  // Tier 2 — IDB
  return IDB.get('drawingBlobs', _idbKey(drawingId)).then(function(rec) {
    if (rec && rec.dataBlob) {
      return _blobToDataUrl(rec.dataBlob).then(function(durl) {
        if (durl) _memCache[drawingId] = durl;
        return durl;
      });
    }
    // Tier 3 — network, then store
    return fetch(_l0Url(pid, drawingId)).then(function(resp) {
      if (!resp || !resp.ok) return '';
      return resp.blob().then(function(blob) {
        if (!blob || blob.size < 32) return ''; // sanity check; sentinel responses
        // Fire-and-forget IDB store — don't block on it
        IDB.put('drawingBlobs', { id: _idbKey(drawingId), dataBlob: blob });
        return _blobToDataUrl(blob).then(function(durl) {
          if (durl) _memCache[drawingId] = durl;
          return durl;
        });
      });
    }).catch(function() { return ''; });
  }).catch(function() { return ''; });
}

/**
 * Clear the in-memory tier for a specific drawing — call when the drawing
 * content has been swapped/replaced so next render fetches fresh L0.
 */
export function invalidate(drawingId) {
  if (!drawingId) return;
  delete _memCache[drawingId];
  IDB.del('drawingBlobs', _idbKey(drawingId));
}

/**
 * Clear ALL cached thumbnails. Used by Reset/cleanup paths.
 */
export function clearAll() {
  _memCache = Object.create(null);
}

export var ThumbCache = {
  getL0Thumb: getL0Thumb,
  invalidate: invalidate,
  clearAll: clearAll
};
