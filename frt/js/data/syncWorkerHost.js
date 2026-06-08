/**
 * ARENCON FRT — Sync Worker Host (main thread proxy, P-6 minimal scope, S128)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Lives on the main thread. Manages the lifecycle of a single shared Worker
 * instance, dispatches RPCs to it, and falls back to running the same work
 * inline on the main thread if the Worker can't be created (very old browsers,
 * restrictive CSP, file:// origins, etc.).
 *
 * From the caller's perspective the API is symmetric whether or not a real
 * Worker is in use — the only difference is whether the work blocked the UI
 * thread or not.
 *
 * Public API:
 *   SyncWorkerHost.serializePush(proj)
 *     → Promise<{ strippedData, jsonBody }>
 *
 *   SyncWorkerHost.merge3Worker(base, mine, theirs)
 *     → Promise<{ merged, conflicts }>
 *
 *   SyncWorkerHost.ping()
 *     → Promise<{ pong, t }>
 *
 *   SyncWorkerHost.isWorkerAvailable()
 *     → boolean (synchronous probe — false if fallback is in use)
 *
 *   SyncWorkerHost._diag
 *     → { workerOK, lastError, callCount, fallbackCount } (for debugging)
 *
 * Falls back to inline execution under any of these conditions:
 *   - typeof Worker === 'undefined'
 *   - Worker constructor throws
 *   - Worker fires an `error` event during boot
 *   - An RPC times out (configurable, default 30s)
 *
 * Once fallback is engaged, all subsequent calls use the inline path until
 * the page reloads. We don't retry worker creation — flaky workers are
 * worse than a consistent fallback.
 */

import { serializePush as inlineSerializePush, merge3InWorker as inlineMerge3, parseLarge as inlineParseLarge } from './syncWorker.js';

var _worker = null;          // Worker instance, or null if fallback engaged
var _bootAttempted = false;  // whether we've tried to create the worker yet
var _pending = {};           // { rpcId: { resolve, reject, timer } }
var _rpcCounter = 0;
var _diag = {
  workerOK: false,
  lastError: null,
  callCount: 0,
  fallbackCount: 0,
  // S265 passive payload-size telemetry. High-water marks per op, in bytes.
  // Readable any time from DevTools (window._frt_syncWorker._diag) — silent
  // unless a payload crosses PAYLOAD_LOG_THRESHOLD_BYTES (then one warn).
  lastSerializeBytes: 0,
  maxSerializeBytes: 0,
  lastParseBytes: 0,
  maxParseBytes: 0
};

var RPC_TIMEOUT_MS = 30000;  // generous; serialize on huge projects can take seconds

// S265 — only log loud when a payload is big enough to be a plausible cause of
// the 30s RPC timeout. Below this, sizes are recorded in _diag but stay quiet
// (background-operation logging discipline — no console spam on every save).
var PAYLOAD_LOG_THRESHOLD_BYTES = 2 * 1024 * 1024;  // ~2MB

/**
 * Record a payload size against _diag and warn ONCE-LOUD only when it crosses
 * the threshold. Passive — never throws, never affects the RPC outcome.
 */
function _logPayloadSize(op, bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return;
  var mb = (bytes / (1024 * 1024)).toFixed(2);
  if (op === 'parseLarge') {
    _diag.lastParseBytes = bytes;
    if (bytes > _diag.maxParseBytes) _diag.maxParseBytes = bytes;
  } else if (op === 'serializePush') {
    _diag.lastSerializeBytes = bytes;
    if (bytes > _diag.maxSerializeBytes) _diag.maxSerializeBytes = bytes;
  }
  if (bytes > PAYLOAD_LOG_THRESHOLD_BYTES) {
    console.warn('[SyncWorker] large ' + op + ' payload: ' + mb + ' MB (' +
      bytes + ' bytes) — RPC timeout is ' + RPC_TIMEOUT_MS + 'ms; watch for timeouts on this push.');
  }
}

/**
 * Lazy-boot the worker on first use. Idempotent. Sets _worker to either a
 * live Worker or `false` (sentinel meaning "fallback engaged, don't retry").
 */
function _bootWorker() {
  if (_bootAttempted) return;
  _bootAttempted = true;

  if (typeof Worker === 'undefined') {
    _diag.lastError = 'Worker constructor not available';
    _worker = false;
    return;
  }

  try {
    // Module workers — required so the worker can `import { merge3 }` etc.
    // Path is RELATIVE to the page that loads index.html (frt/index.html),
    // matching the pattern used by app.js for ES6 module imports.
    _worker = new Worker('js/data/syncWorker.js', { type: 'module' });
    _diag.workerOK = true;

    _worker.addEventListener('message', function(e) {
      var msg = e.data || {};
      var pending = _pending[msg.id];
      if (!pending) return;
      clearTimeout(pending.timer);
      delete _pending[msg.id];
      if (msg.ok) pending.resolve(msg.result);
      else        pending.reject(new Error(msg.error || 'Worker RPC failed'));
    });

    _worker.addEventListener('error', function(e) {
      // Worker crashed — don't try to use it again. Reject all pending.
      _diag.lastError = 'Worker error: ' + ((e && e.message) || 'unknown');
      _diag.workerOK = false;
      console.warn('[SyncWorker] ' + _diag.lastError);
      _failAllPending(_diag.lastError);
      _worker = false;
    });
  } catch (err) {
    _diag.lastError = 'Worker boot failed: ' + (err.message || err);
    _diag.workerOK = false;
    console.warn('[SyncWorker] ' + _diag.lastError + ' — using inline fallback');
    _worker = false;
  }
}

function _failAllPending(errMsg) {
  Object.keys(_pending).forEach(function(id) {
    var p = _pending[id];
    clearTimeout(p.timer);
    p.reject(new Error(errMsg));
    delete _pending[id];
  });
}

/**
 * Send an RPC to the worker and return a Promise for its response.
 * If the worker isn't available, the caller falls back to inline.
 */
function _rpc(op, payload) {
  _bootWorker();
  if (!_worker) {
    return Promise.reject(new Error('worker-unavailable'));
  }
  var id = 'rpc-' + (++_rpcCounter);
  return new Promise(function(resolve, reject) {
    _pending[id] = {
      resolve: resolve,
      reject: reject,
      timer: setTimeout(function() {
        delete _pending[id];
        reject(new Error('RPC ' + op + ' timeout after ' + RPC_TIMEOUT_MS + 'ms'));
      }, RPC_TIMEOUT_MS)
    };
    try {
      _worker.postMessage({ id: id, op: op, payload: payload });
    } catch (postErr) {
      // Cloning failed (e.g. proj contains non-cloneable values). Reject so
      // the caller can fall back to inline (which handles JSON.stringify
      // semantics correctly).
      clearTimeout(_pending[id].timer);
      delete _pending[id];
      reject(postErr);
    }
  });
}

export var SyncWorkerHost = {

  isWorkerAvailable: function() {
    _bootWorker();
    return !!_worker;
  },

  /**
   * Serialize a project for cloud push. Background-thread when possible,
   * inline fallback when not. Returns { strippedData, jsonBody }.
   */
  serializePush: function(proj) {
    _diag.callCount++;
    return _rpc('serializePush', { proj: proj })
      .catch(function(err) {
        // Any failure → silent inline fallback. Counted in _diag.fallbackCount.
        // We log once per fallback class but don't spam the console on every save.
        _diag.fallbackCount++;
        if (_diag.lastError !== err.message) {
          _diag.lastError = err.message;
          console.warn('[SyncWorker] serializePush falling back to inline:', err.message);
        }
        // Inline path runs synchronously but we keep the Promise interface
        // so callers see the same shape.
        return Promise.resolve(inlineSerializePush(proj));
      })
      .then(function(res) {
        // S265 passive telemetry: size of the serialized push body (worker OR
        // inline path — both resolve { strippedData, jsonBody }). Pass-through.
        if (res && typeof res.jsonBody === 'string') {
          _logPayloadSize('serializePush', res.jsonBody.length);
        }
        return res;
      });
  },

  /**
   * Run 3-way merge in the worker (or inline fallback).
   * Returns { merged, conflicts } same as merge.js merge3().
   */
  merge3Worker: function(base, mine, theirs) {
    _diag.callCount++;
    return _rpc('merge3', { base: base, mine: mine, theirs: theirs })
      .catch(function(err) {
        _diag.fallbackCount++;
        if (_diag.lastError !== err.message) {
          _diag.lastError = err.message;
          console.warn('[SyncWorker] merge3 falling back to inline:', err.message);
        }
        return Promise.resolve(inlineMerge3(base, mine, theirs));
      });
  },

  /**
   * S130 Item 5.3 — Parse a large JSON response body off the main thread.
   * Used by sync.js pull() for 10MB+ cloud responses. Falls back to inline
   * JSON.parse if the worker is unavailable so callers don't have to branch.
   *
   * Returns null for empty/falsy text (matches Auth.request legacy behavior
   * for empty response bodies). Throws SyntaxError on malformed JSON.
   */
  parseLarge: function(text) {
    _diag.callCount++;
    // S265 passive telemetry: size of the response body we're about to parse.
    // This is the op that produced 'parseLarge timeout after 30000ms' — record
    // how big it was so the next timeout names its own cause.
    _logPayloadSize('parseLarge', (typeof text === 'string') ? text.length : 0);
    return _rpc('parseLarge', { text: text })
      .catch(function(err) {
        _diag.fallbackCount++;
        if (_diag.lastError !== err.message) {
          _diag.lastError = err.message;
          console.warn('[SyncWorker] parseLarge falling back to inline:', err.message);
        }
        return Promise.resolve(inlineParseLarge(text));
      });
  },

  ping: function() {
    return _rpc('ping', {}).catch(function(err) {
      return Promise.resolve({ pong: false, error: err.message });
    });
  },

  // Read-only diagnostic snapshot
  get _diag() { return Object.assign({}, _diag); }
};

// Expose for DevTools diagnostics during demos / debugging.
if (typeof window !== 'undefined') {
  window._frt_syncWorker = SyncWorkerHost;
}
