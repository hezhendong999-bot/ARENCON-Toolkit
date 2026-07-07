/* ARENCON /lib/ — Image Worker Host (S446 Step-4 extraction)
   From FRT frt/js/workers/imageWorkerHost.js. ONE change: worker located via
   new URL('./imageWorker.js', import.meta.url) so it resolves from any tool.
   Main-thread fallback preserved (works where OffscreenCanvas is absent). */
/**
 * ARENCON FRT — Image Compression Host (S130 Item 5.4)
 * ════════════════════════════════════════════════════
 *
 * Main-thread proxy for imageWorker.js. Sends a Blob to the worker, gets back
 * { dataUrl, thumb, w, h }. Falls back to a main-thread Image+Canvas chain
 * when:
 *   - Worker constructor unavailable (very old browsers, restrictive CSP)
 *   - OffscreenCanvas / createImageBitmap unavailable in the worker scope
 *   - Worker creation throws
 *
 * Public API:
 *
 *   ImageWorkerHost.compressFile(file, opts) → Promise<{dataUrl, thumb, w, h}>
 *     opts.maxW         (default 1600)
 *     opts.quality      (default 0.8)
 *     opts.thumbMaxW    (default 0 — no thumb generated)
 *     opts.thumbQuality (default 0.7)
 *
 *   ImageWorkerHost.isWorkerAvailable() → boolean
 *
 *   ImageWorkerHost._diag → { workerOK, callCount, fallbackCount, lastError }
 *
 * Match between worker and fallback contracts: the dataUrl values may differ
 * by a few bytes (different JPEG encoders) but dimensions and quality
 * characteristics are equivalent.
 */

import { calcResize } from './imageWorker.js';

var _worker = null;
var _bootAttempted = false;
var _pending = {};
var _rpcCounter = 0;
var _diag = {
  workerOK: false,
  lastError: null,
  callCount: 0,
  fallbackCount: 0
};

var RPC_TIMEOUT_MS = 30000;

function _bootWorker() {
  if (_bootAttempted) return;
  _bootAttempted = true;

  if (typeof Worker === 'undefined') {
    _diag.lastError = 'Worker constructor not available';
    _worker = false;
    return;
  }
  // OffscreenCanvas is the load-bearing API. If main-thread has no
  // OffscreenCanvas, the worker probably doesn't either. Skip boot.
  if (typeof OffscreenCanvas === 'undefined') {
    _diag.lastError = 'OffscreenCanvas not available';
    _worker = false;
    return;
  }

  try {
    // Path relative to frt/index.html (matches syncWorker pattern).
    // (lib) self-locating worker URL — resolves relative to THIS module so it
    // works from any tool/page (was FRT page-relative 'js/workers/imageWorker.js').
    _worker = new Worker(new URL('./imageWorker.js', import.meta.url), { type: 'module' });
    _diag.workerOK = true;

    _worker.addEventListener('message', function(e) {
      var msg = e.data || {};
      var pending = _pending[msg.id];
      if (!pending) return;
      clearTimeout(pending.timer);
      delete _pending[msg.id];
      if (msg.ok) pending.resolve(msg.result);
      else        pending.reject(new Error(msg.error || 'imageWorker RPC failed'));
    });

    _worker.addEventListener('error', function(e) {
      _diag.lastError = 'Worker error: ' + ((e && e.message) || 'unknown');
      _diag.workerOK = false;
      console.warn('[ImageWorker] ' + _diag.lastError);
      Object.keys(_pending).forEach(function(id) {
        var p = _pending[id];
        clearTimeout(p.timer);
        p.reject(new Error(_diag.lastError));
        delete _pending[id];
      });
      _worker = false;
    });
  } catch (err) {
    _diag.lastError = 'Worker boot failed: ' + (err.message || err);
    _diag.workerOK = false;
    console.warn('[ImageWorker] ' + _diag.lastError + ' — using inline fallback');
    _worker = false;
  }
}

function _rpc(op, payload) {
  _bootWorker();
  if (!_worker) {
    return Promise.reject(new Error('image-worker-unavailable'));
  }
  var id = 'img-' + (++_rpcCounter);
  return new Promise(function(resolve, reject) {
    _pending[id] = {
      resolve: resolve,
      reject: reject,
      timer: setTimeout(function() {
        delete _pending[id];
        reject(new Error('imageWorker RPC ' + op + ' timeout after ' + RPC_TIMEOUT_MS + 'ms'));
      }, RPC_TIMEOUT_MS)
    };
    try {
      _worker.postMessage({ id: id, op: op, payload: payload });
    } catch (postErr) {
      clearTimeout(_pending[id].timer);
      delete _pending[id];
      reject(postErr);
    }
  });
}

/**
 * Main-thread fallback. Uses FileReader → Image → <canvas> → toDataURL.
 * Same shape as the worker output. Slower (blocks UI) but works everywhere.
 */
function _fallbackCompress(file, opts) {
  var maxW = opts.maxW || 1600;
  var quality = (typeof opts.quality === 'number') ? opts.quality : 0.8;
  var thumbMaxW = opts.thumbMaxW || 0;
  var thumbQuality = (typeof opts.thumbQuality === 'number') ? opts.thumbQuality : 0.7;

  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var dims = calcResize(img.width, img.height, maxW);
        var cv = document.createElement('canvas');
        cv.width = dims.w; cv.height = dims.h;
        cv.getContext('2d').drawImage(img, 0, 0, dims.w, dims.h);
        var dataUrl = cv.toDataURL('image/jpeg', quality);

        var thumb = null;
        if (thumbMaxW > 0) {
          var tdims = calcResize(img.width, img.height, thumbMaxW);
          var tcv = document.createElement('canvas');
          tcv.width = tdims.w; tcv.height = tdims.h;
          tcv.getContext('2d').drawImage(img, 0, 0, tdims.w, tdims.h);
          thumb = tcv.toDataURL('image/jpeg', thumbQuality);
          tcv.width = 1; tcv.height = 1;
        }

        cv.width = 1; cv.height = 1;
        resolve({ dataUrl: dataUrl, thumb: thumb, w: dims.w, h: dims.h });
      };
      img.onerror = function() { reject(new Error('Image decode failed')); };
      img.src = e.target.result;
    };
    reader.onerror = function() { reject(new Error('FileReader failed')); };
    reader.readAsDataURL(file);
  });
}

export var ImageWorkerHost = {

  isWorkerAvailable: function() {
    _bootWorker();
    return !!_worker;
  },

  /**
   * Compress a File or Blob. Returns { dataUrl, thumb, w, h }.
   * Worker path when available, main-thread fallback otherwise.
   * Either path returns the same shape so callers don't have to branch.
   */
  compressFile: function(file, opts) {
    opts = opts || {};
    _diag.callCount++;

    // Try worker path first
    return _rpc('compress', {
      blob: file,
      maxW: opts.maxW,
      quality: opts.quality,
      thumbMaxW: opts.thumbMaxW,
      thumbQuality: opts.thumbQuality
    }).catch(function(err) {
      _diag.fallbackCount++;
      if (_diag.lastError !== err.message) {
        _diag.lastError = err.message;
        // Only warn once per error class — avoids console spam on every photo.
        console.warn('[ImageWorker] compress fallback to main thread:', err.message);
      }
      return _fallbackCompress(file, opts);
    });
  },

  get _diag() { return Object.assign({}, _diag); }
};

if (typeof window !== 'undefined') {
  window._frt_imageWorker = ImageWorkerHost;
}
