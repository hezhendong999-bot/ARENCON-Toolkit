/**
 * ARENCON FRT — R2 Upload Queue (S130 Item 5.1)
 * ══════════════════════════════════════════════
 *
 * Coordinates concurrent R2 PUT operations to reduce request burst pressure
 * during bulk saves (e.g., 20 photo uploads when a deficiency batch is added).
 *
 * What it provides (and what it does NOT):
 *
 *   Provides:
 *     - Global concurrency cap (default 4 — half of Chrome's 6/origin limit
 *       so other XHRs can still run while uploads are draining).
 *     - Per-lane FIFO ordering. Lane = arbitrary string (commonly
 *       `<pid>:<type>`). Tasks within a lane run sequentially regardless of
 *       global concurrency, which gives caller-visible ordering for related
 *       writes (drawing edit, then markup save, then thumbnail).
 *     - Transient-error retry with exponential backoff (default 2 retries).
 *       Transient = HTTP 429/503 or a thrown TypeError (network failure).
 *     - Stateless w.r.t. the project — no IDB, no Auth, just task scheduling.
 *
 *   Does NOT provide:
 *     - Content-hash dedup. Generated UUID filenames make true-dup rare and
 *       the false-positive risk (different content, accidental dedup) is high.
 *     - Auth retry. UploadQueue runs the taskFn as-given; auth refresh stays
 *       in the caller (Auth.request handles 401 transparently for Supabase;
 *       R2 uses the same token).
 *     - Persistence across page reload. In-memory only.
 *
 * Public API:
 *
 *   UploadQueue.enqueue(taskFn, opts)
 *     taskFn  : () => Promise<any>     // does the actual PUT
 *     opts.lane?       : string         // FIFO grouping key
 *     opts.maxRetries? : number = 2     // transient retry budget
 *     → Promise<result of taskFn>
 *
 *   UploadQueue.setConcurrency(n)       // 1..16; default 4
 *
 *   UploadQueue.diag                    // { enqueued, completed, failed,
 *                                          retried, running, queueDepth,
 *                                          activeLanes, maxObservedDepth }
 *
 * Why on the main thread (not in syncWorker.js):
 *   Transferring Blobs to the Web Worker costs structured clone time that
 *   negates the win, and the queue itself is microscopic CPU (just timer +
 *   array manipulation). The actual fetch() is async network anyway —
 *   nothing blocks the UI thread during transfer. The benefit here is request
 *   serialization, not CPU offload.
 *
 * History: created S130. Replaces ad-hoc fire-and-forget pattern in R2.upload
 * that produced unordered uploads and no retry on transient failures.
 */

var _maxConcurrent = 4;
var _running = 0;
var _globalQueue = [];        // [{ taskFn, opts, resolve, reject }]
var _laneQueues = {};         // { laneKey: [task records] }
var _laneActive = {};         // { laneKey: true }   one task per lane at a time

var _diag = {
  enqueued: 0,
  completed: 0,
  failed: 0,
  retried: 0,
  maxObservedDepth: 0
};

function _isTransient(err) {
  if (!err) return false;
  // Network failure → fetch() rejects with TypeError
  if (err.name === 'TypeError') return true;
  // HTTP status: 429 Too Many Requests, 503 Service Unavailable
  if (err.status === 429 || err.status === 503) return true;
  return false;
}

function _runWithRetry(taskFn, retriesLeft, attempt) {
  return Promise.resolve()
    .then(taskFn)
    .catch(function(err) {
      if (retriesLeft <= 0 || !_isTransient(err)) throw err;
      _diag.retried++;
      // Exponential backoff with jitter: 250ms, 500ms, 1000ms, ... + 0-200ms jitter
      var delay = 250 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      return new Promise(function(r) { setTimeout(r, delay); })
        .then(function() { return _runWithRetry(taskFn, retriesLeft - 1, attempt + 1); });
    });
}

function _drain() {
  // Pull from lanes first (round-robin) to keep lane progress even
  var laneKeys = Object.keys(_laneQueues);
  for (var i = 0; i < laneKeys.length && _running < _maxConcurrent; i++) {
    var lk = laneKeys[i];
    if (_laneActive[lk]) continue;
    var q = _laneQueues[lk];
    if (!q || !q.length) continue;
    var rec = q.shift();
    _laneActive[lk] = true;
    _execute(rec, lk);
    if (!q.length) delete _laneQueues[lk];
  }
  // Then drain the global (no-lane) queue
  while (_running < _maxConcurrent && _globalQueue.length) {
    var grec = _globalQueue.shift();
    _execute(grec, null);
  }
}

function _execute(rec, laneKey) {
  _running++;
  var maxRetries = (typeof rec.opts.maxRetries === 'number') ? rec.opts.maxRetries : 2;
  _runWithRetry(rec.taskFn, maxRetries, 0)
    .then(function(result) {
      _diag.completed++;
      rec.resolve(result);
    })
    .catch(function(err) {
      _diag.failed++;
      rec.reject(err);
    })
    .then(function() {
      _running--;
      if (laneKey) _laneActive[laneKey] = false;
      _drain();
    });
}

function _recordDepth() {
  var laneTotal = 0;
  var keys = Object.keys(_laneQueues);
  for (var i = 0; i < keys.length; i++) laneTotal += _laneQueues[keys[i]].length;
  var depth = _globalQueue.length + laneTotal;
  if (depth > _diag.maxObservedDepth) _diag.maxObservedDepth = depth;
}

export var UploadQueue = {

  enqueue: function(taskFn, opts) {
    opts = opts || {};
    _diag.enqueued++;
    return new Promise(function(resolve, reject) {
      var rec = { taskFn: taskFn, opts: opts, resolve: resolve, reject: reject };
      if (opts.lane) {
        if (!_laneQueues[opts.lane]) _laneQueues[opts.lane] = [];
        _laneQueues[opts.lane].push(rec);
      } else {
        _globalQueue.push(rec);
      }
      _recordDepth();
      _drain();
    });
  },

  setConcurrency: function(n) {
    n = parseInt(n, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > 16) n = 16;
    _maxConcurrent = n;
    _drain();
  },

  get diag() {
    var laneTotal = 0;
    var keys = Object.keys(_laneQueues);
    for (var i = 0; i < keys.length; i++) laneTotal += _laneQueues[keys[i]].length;
    return {
      enqueued: _diag.enqueued,
      completed: _diag.completed,
      failed: _diag.failed,
      retried: _diag.retried,
      maxObservedDepth: _diag.maxObservedDepth,
      running: _running,
      queueDepth: _globalQueue.length + laneTotal,
      activeLanes: Object.keys(_laneActive).filter(function(k) { return _laneActive[k]; }).length
    };
  },

  // Test-only: reset all state. Not used in production.
  _reset: function() {
    _maxConcurrent = 4;
    _running = 0;
    _globalQueue = [];
    _laneQueues = {};
    _laneActive = {};
    _diag = { enqueued: 0, completed: 0, failed: 0, retried: 0, maxObservedDepth: 0 };
  }
};

// DevTools diagnostics
if (typeof window !== 'undefined') {
  window._frt_uploadQueue = UploadQueue;
}
