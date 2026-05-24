/**
 * ARENCON FRT v2 — Photo Outbox (Fix A)
 * ═══════════════════════════════════════
 *
 * **STATUS:** S170 first real behavior, gated by ?staging=1.
 *
 * This module is the durable in-flight tracker for photo uploads, the
 * core of Fix A's atomic photo lifecycle. It separates "photo in flight"
 * from "photo settled" so that cloud pulls cannot wipe a photo that R2
 * has confirmed but cloud hasn't yet captured.
 *
 * Full architecture: FIX_A_ARCHITECTURE.md (S168 design pass).
 *
 * ── What S170 ships ──
 *   • Real `init()` / `resume()` / `enqueue()` / `cancelByPhotoId()`
 *   • Real processor: pending → uploading → r2_confirmed
 *   • Concurrency cap of 2 (soft cap on top of UploadQueue's lane policy)
 *   • Deterministic R2 keys (Enhancement 1): filename = `defic_<photoId>.jpg`
 *   • IDB persistence so rows survive reload
 *   • Failure path writes status=failed AND mirrors Fix D's photo flags
 *     for parity (no behavior regression vs. current PROD when staging
 *     mode is on)
 *
 * ── What S170 does NOT ship ──
 *   • Retry policy with exponential backoff (S172)
 *   • Cloud-push strip rule (S171)
 *   • Reconciliation after pull (S171)
 *   • Migration scan (S175)
 *   • AbortController wiring for cancel-during-pending (S173)
 *   • Detail modal UI (S172)
 *
 * Until those land, the outbox in staging is a foundation that records
 * upload state but does NOT yet protect against the pull-replace bug.
 * The protective behavior arrives in S171.
 */

import { IDB } from './idb.js';
import { R2 } from './r2.js';
import { Model } from './model.js';
import { Auth } from '../shared/auth.js';
import { toast } from '../shared/toast.js';

// ─────────────────────────────────────────────────────────────
// Runtime activation flag (per D6: shipped dormant)
// ─────────────────────────────────────────────────────────────
// Code lives in the PROD bundle. Behavior only activates when
// ?staging=1 is in the URL. To promote in a later session: flip
// the default to `true` in a single one-line commit.
// ─────────────────────────────────────────────────────────────
var _FIX_A_ENABLED = false;
try {
  var _params = new URLSearchParams(window.location.search);
  if (_params.get('staging') === '1') {
    _FIX_A_ENABLED = true;
  }
} catch (_) {
  // Non-browser context (unlikely) — default false
}

// ─────────────────────────────────────────────────────────────
// Status constants — exported for use by future UI/sync code.
// ─────────────────────────────────────────────────────────────
export var OUTBOX_STATUS = {
  PENDING:         'pending',
  UPLOADING:       'uploading',
  R2_CONFIRMED:    'r2_confirmed',
  CLOUD_CONFIRMED: 'cloud_confirmed',
  RETRYING:        'retrying',
  FAILED:          'failed',
  CANCELLED:       'cancelled'
};

// IDB store name — must match the entry added to STORES in idb.js.
var STORE_NAME = 'photoOutbox';

// In-memory mirror of the outbox for fast UI queries. Rebuilt on init()
// from IDB. Authoritative on writes (every write updates both the
// in-memory mirror AND IDB).
var _rowsByPhotoId = {};         // photoId → outbox row
var _rowsById = {};              // outbox row id → outbox row

// In-memory map of AbortController instances, keyed by outbox row id.
// Wired in S173. Empty in S170.
var _abortControllers = {};

// Concurrency cap (Enhancement 7). Soft cap on outbox-managed concurrent
// uploads. UploadQueue (S130 5.1) provides the hard cap at the R2 layer.
var MAX_CONCURRENT = 2;
var _activeUploadCount = 0;

// Retry policy constants (Enhancement 3). Not exercised in S170 — the
// processor goes pending → uploading → r2_confirmed | failed with no
// intermediate retries. Real retry logic lands in S172.
var RETRY_DELAYS_MS = [
  5 * 1000,        //  5s
  15 * 1000,       // 15s
  45 * 1000,       // 45s
  2 * 60 * 1000,   //  2min
  5 * 60 * 1000    //  5min
];
var MAX_RETRIES = RETRY_DELAYS_MS.length;

// Event-listener registry — Model-style notify channel.
var _listeners = {};

// Set to true once init() has resolved successfully. Guards processor
// kicks before the in-memory mirror is built.
var _initialized = false;

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function _uid() {
  // Outbox row IDs — separate namespace from photo IDs.
  return 'outbox_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function _currentUserId() {
  // Per Enhancement 5: rows are keyed by (projectId, userId). For
  // standalone mode or pre-auth boot, fall back to 'local'.
  try {
    if (Auth && Auth.getUser) {
      var u = Auth.getUser();
      if (u && u.id) return u.id;
    }
  } catch (_) {}
  return 'local';
}

function _notify(event, payload) {
  var handlers = _listeners[event] || [];
  for (var i = 0; i < handlers.length; i++) {
    try { handlers[i](payload); } catch (e) {
      console.warn('[PhotoOutbox] Listener error on ' + event + ':', e);
    }
  }
}

function _persistRow(row) {
  // Single source of truth: in-memory mirror + IDB updated atomically
  // from the caller's perspective. IDB.put returns a promise; in-memory
  // mirror updates synchronously so subsequent reads see the new state
  // even if the IDB write is still in flight.
  _rowsById[row.id] = row;
  _rowsByPhotoId[row.photoId] = row;
  return IDB.put(STORE_NAME, row);
}

function _deleteRow(rowId) {
  var row = _rowsById[rowId];
  if (row) {
    delete _rowsById[rowId];
    if (row.photoId) delete _rowsByPhotoId[row.photoId];
  }
  return IDB.del(STORE_NAME, rowId);
}

// ─────────────────────────────────────────────────────────────
// Processor — picks up pending rows and uploads them
// ─────────────────────────────────────────────────────────────

function _kickProcessor() {
  if (!_initialized) return;
  if (_activeUploadCount >= MAX_CONCURRENT) return;
  // Pick up to (MAX_CONCURRENT - _activeUploadCount) pending rows.
  // Sort by enqueuedAt so FIFO ordering is preserved on bursts.
  var pending = [];
  for (var id in _rowsById) {
    var r = _rowsById[id];
    if (r && r.status === OUTBOX_STATUS.PENDING) pending.push(r);
  }
  pending.sort(function(a, b) {
    return (a.enqueuedAt || '').localeCompare(b.enqueuedAt || '');
  });
  var slots = MAX_CONCURRENT - _activeUploadCount;
  for (var i = 0; i < pending.length && i < slots; i++) {
    _processRow(pending[i]);
  }
}

function _processRow(row) {
  _activeUploadCount++;
  row.status = OUTBOX_STATUS.UPLOADING;
  row.lastAttemptAt = new Date().toISOString();
  _persistRow(row).catch(function() {}); // fire-and-forget; in-mem mirror is what we read
  _notify('uploading', { rowId: row.id, photoId: row.photoId });

  // The photo record lives in model state (added by the caller via
  // Model.addObservationPhoto before enqueue). We need the blob from
  // photoBlobs (already saved there by enqueue() itself — see below).
  IDB.get('photoBlobs', row.photoId).then(function(blobRec) {
    if (!blobRec || !blobRec.dataBlob) {
      throw new Error('No blob in photoBlobs for photo ' + row.photoId);
    }
    // Deterministic R2 key (Enhancement 1). Filename derived from photo id.
    return R2.upload(
      row.projectId,
      row.type || 'original',
      blobRec.dataBlob,
      'defic_' + row.photoId + '.jpg'
    );
  }).then(function(result) {
    _activeUploadCount = Math.max(0, _activeUploadCount - 1);
    if (!result || !result.r2Key) {
      // R2.upload swallows non-2xx as null. Treat as failure.
      return _markFailed(row, new Error('R2 upload returned null'));
    }
    // ── R2 confirmed ──
    row.status = OUTBOX_STATUS.R2_CONFIRMED;
    row.r2ConfirmedAt = new Date().toISOString();
    row.r2Key = result.r2Key;
    row.r2Url = result.r2Url;
    _persistRow(row).catch(function() {});

    // Update the photo record in model state with the r2Key/r2Url so
    // it renders from R2 going forward (and the next cloud push picks
    // it up). Model is imported at the top of this module.
    try {
      var proj = Model.getProject();
      if (proj) {
        var photo = _findPhotoInProject(proj, row.photoId);
        if (photo) {
          photo.r2Key = result.r2Key;
          photo.r2Url = result.r2Url;
          photo.uploadStatus = OUTBOX_STATUS.R2_CONFIRMED;
          if (Model.saveNow) Model.saveNow();
        }
      }
    } catch (e) {
      console.warn('[PhotoOutbox] Could not write r2Key to model photo:', e);
    }

    _notify('r2_confirmed', { rowId: row.id, photoId: row.photoId,
      r2Key: result.r2Key, r2Url: result.r2Url });

    // S170 simplification: no cloud-confirmation tracking yet. The row
    // stays in r2_confirmed status until S171 wires the markCloudConfirmed
    // path. For now we delete the row after a short delay so the count
    // returns to zero — accepting that S170 outbox does NOT yet protect
    // against the pull-replace bug.
    setTimeout(function() {
      _deleteRow(row.id).catch(function() {});
      _notify('cloud_confirmed', { rowId: row.id, photoId: row.photoId });
    }, 2000);

    _kickProcessor();
  }).catch(function(err) {
    _activeUploadCount = Math.max(0, _activeUploadCount - 1);
    _markFailed(row, err);
    _kickProcessor();
  });
}

function _markFailed(row, err) {
  // S170: no retries. Straight to failed. Mirror Fix D's diagnostic
  // flags onto the photo record so behavior is at-parity with current
  // PROD when staging mode is on.
  row.status = OUTBOX_STATUS.FAILED;
  row.lastError = (err && err.message) || String(err);
  row.lastAttemptAt = new Date().toISOString();
  _persistRow(row).catch(function() {});

  try {
    var proj2 = Model.getProject();
    if (proj2) {
      var photo2 = _findPhotoInProject(proj2, row.photoId);
      if (photo2) {
        photo2._r2UploadFailed = true;
        photo2._r2UploadError = row.lastError;
        photo2._r2UploadFailedAt = row.lastAttemptAt;
        photo2.uploadStatus = OUTBOX_STATUS.FAILED;
        if (Model.saveNow) Model.saveNow();
      }
    }
  } catch (e) {
    console.warn('[PhotoOutbox] Could not write failure flag to model photo:', e);
  }

  // Diagnostic ring buffer parity with Fix D.
  try {
    var buf = (window._frt_r2Failures = window._frt_r2Failures || []);
    buf.push({
      photoId: row.photoId,
      pid: row.projectId,
      when: row.lastAttemptAt,
      error: row.lastError,
      source: 'PhotoOutbox'
    });
    while (buf.length > 50) buf.shift();
  } catch (_) {}

  var em = row.lastError || 'unknown error';
  if (em.length > 60) em = em.slice(0, 57) + '\u2026';
  toast('\u26A0 Photo cloud upload failed: ' + em, 8000);

  _notify('failed', { rowId: row.id, photoId: row.photoId, error: row.lastError });
}

function _findPhotoInProject(proj, photoId) {
  // Walk the project tree to find a photo by id. Defic-level pool is
  // the canonical home.
  var found = null;
  function _walkDefic(d) {
    if (found || !d) return;
    var pool = d.photos || [];
    for (var i = 0; i < pool.length; i++) {
      if (pool[i] && pool[i].id === photoId) { found = pool[i]; return; }
    }
  }
  (proj.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(_walkDefic);
  });
  (proj.generalDeficiencies || []).forEach(_walkDefic);
  return found;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export var PhotoOutbox = {

  isEnabled: function() {
    return _FIX_A_ENABLED;
  },

  /** Open IDB connection (idempotent — IDB.init handles repeat calls)
   *  and rebuild the in-memory mirror from the photoOutbox store. */
  init: function() {
    if (_initialized) return Promise.resolve();
    return IDB.getAll(STORE_NAME).then(function(rows) {
      _rowsByPhotoId = {};
      _rowsById = {};
      (rows || []).forEach(function(row) {
        if (!row || !row.id) return;
        _rowsById[row.id] = row;
        if (row.photoId) _rowsByPhotoId[row.photoId] = row;
      });
      _initialized = true;
      if (_FIX_A_ENABLED) {
        console.log('[PhotoOutbox] Initialized — ' + (rows || []).length +
                    ' row(s) restored from IDB');
      }
    }).catch(function(e) {
      console.warn('[PhotoOutbox] init failed (non-fatal):', e && e.message);
      _initialized = true;  // proceed — empty mirror
    });
  },

  /** Re-pick-up pending and uploading rows after a reload. Rows in
   *  `uploading` state when the tab was killed get reset to `pending`
   *  so the processor picks them up cleanly. */
  resume: function() {
    if (!_initialized) {
      return this.init().then(this.resume.bind(this));
    }
    var resetCount = 0;
    for (var id in _rowsById) {
      var r = _rowsById[id];
      if (r && r.status === OUTBOX_STATUS.UPLOADING) {
        // Reload happened mid-upload. The AbortController is gone;
        // the in-flight fetch (if any) is detached and harmless.
        // Reset to pending so the processor handles it as a fresh
        // attempt.
        r.status = OUTBOX_STATUS.PENDING;
        _persistRow(r).catch(function() {});
        resetCount++;
      }
    }
    if (_FIX_A_ENABLED && resetCount > 0) {
      console.log('[PhotoOutbox] Resume reset ' + resetCount +
                  ' uploading row(s) to pending');
    }
    _kickProcessor();
    return Promise.resolve();
  },

  /** One-time migration scan (Enhancement 4) — S175 work, stub here. */
  migrationScan: function() {
    return Promise.resolve({ B: 0, C: 0, skipped: true });
  },

  /** Enqueue a photo for R2 upload. Caller is responsible for having
   *  already added the photo to model state via Model.addObservationPhoto
   *  (so it renders) and stored the blob bytes in photoBlobs (so the
   *  processor can read it back). This split mirrors the existing
   *  R2.uploadPhoto contract.
   *
   *  opts = {
   *    photo:     <model photo record, must have .id and .dataUrl>,
   *    projectId: <project uuid>,
   *    deficId:   <defic id>,
   *    obsIdx:    <observation index>,
   *    type:      'original' (default)
   *  }
   *
   *  Returns Promise<outboxRowId>.
   */
  enqueue: function(opts) {
    if (!_FIX_A_ENABLED) {
      // Defensive — the gate is normally upstream in deficiencies.js
      // but we double-check here so a misrouted call in PROD is a no-op.
      return Promise.resolve(null);
    }
    if (!_initialized) {
      return this.init().then(this.enqueue.bind(this, opts));
    }
    var photo = opts && opts.photo;
    var projectId = opts && opts.projectId;
    if (!photo || !photo.id || !projectId) {
      return Promise.reject(new Error('PhotoOutbox.enqueue: missing photo or projectId'));
    }
    // Idempotency: if a row already exists for this photoId in a non-
    // terminal state, return it instead of creating a duplicate.
    var existing = _rowsByPhotoId[photo.id];
    if (existing && existing.status !== OUTBOX_STATUS.FAILED
                 && existing.status !== OUTBOX_STATUS.CANCELLED) {
      return Promise.resolve(existing.id);
    }
    var row = {
      id: _uid(),
      photoId: photo.id,
      projectId: projectId,
      userId: _currentUserId(),
      deficId: opts.deficId || null,
      obsIdx: typeof opts.obsIdx === 'number' ? opts.obsIdx : null,
      type: opts.type || 'original',
      filename: 'defic_' + photo.id + '.jpg',
      blobInPhotoBlobs: true,
      status: OUTBOX_STATUS.PENDING,
      retryCount: 0,
      nextRetryAt: null,
      lastAttemptAt: null,
      lastError: null,
      enqueuedAt: new Date().toISOString(),
      r2ConfirmedAt: null,
      cloudConfirmedAt: null
    };

    // Save blob bytes to photoBlobs under photo.id (same store the
    // existing R2.uploadPhoto path uses). The processor reads it back
    // from there to do the R2 PUT.
    var blobSavePromise;
    if (photo.dataUrl) {
      blobSavePromise = _toBlobFromDataUrl(photo.dataUrl).then(function(blob) {
        if (!blob) return null;
        return IDB.put('photoBlobs', { id: photo.id, dataBlob: blob });
      });
    } else {
      // Caller already put the blob; nothing to do.
      blobSavePromise = Promise.resolve(null);
    }

    return blobSavePromise.then(function() {
      return _persistRow(row);
    }).then(function() {
      // Tag the photo record so UI can render an "uploading" badge if
      // it wants. S170 does not render this; later sessions do.
      try { photo.uploadStatus = OUTBOX_STATUS.PENDING; } catch (_) {}
      _notify('enqueue', { rowId: row.id, photoId: photo.id });
      _kickProcessor();
      return row.id;
    });
  },

  /** Cancel by photo id (Enhancement 8 — fully wired in S173). S170
   *  version: simply deletes the row + photo flag. AbortController
   *  wiring lands in S173.  */
  cancelByPhotoId: function(photoId) {
    if (!_initialized) {
      return this.init().then(this.cancelByPhotoId.bind(this, photoId));
    }
    var row = _rowsByPhotoId[photoId];
    if (!row) return Promise.resolve(false);
    var rowId = row.id;
    // Best-effort abort if a controller is bound (S173 will populate this).
    try {
      var ac = _abortControllers[rowId];
      if (ac && ac.abort) ac.abort();
      delete _abortControllers[rowId];
    } catch (_) {}
    return _deleteRow(rowId).then(function() {
      _notify('cancelled', { rowId: rowId, photoId: photoId });
      return true;
    });
  },

  // ── Query API (used by the header badge in app.js) ──

  getStatusCounts: function() {
    var counts = { pending: 0, uploading: 0, retrying: 0, failed: 0 };
    for (var id in _rowsById) {
      var r = _rowsById[id];
      if (!r) continue;
      // Per D8: r2_confirmed and cloud_confirmed are NOT counted —
      // they're "safe" states.
      if (r.status === OUTBOX_STATUS.PENDING)   counts.pending++;
      else if (r.status === OUTBOX_STATUS.UPLOADING) counts.uploading++;
      else if (r.status === OUTBOX_STATUS.RETRYING)  counts.retrying++;
      else if (r.status === OUTBOX_STATUS.FAILED)    counts.failed++;
    }
    return counts;
  },

  getEntriesForProject: function(projectId) {
    var userId = _currentUserId();
    var out = [];
    for (var id in _rowsById) {
      var r = _rowsById[id];
      if (!r) continue;
      if (r.projectId === projectId && r.userId === userId) out.push(r);
    }
    return out;
  },

  getEntryByPhotoId: function(photoId) {
    return _rowsByPhotoId[photoId] || null;
  },

  getFailedEntries: function() {
    var out = [];
    for (var id in _rowsById) {
      var r = _rowsById[id];
      if (r && r.status === OUTBOX_STATUS.FAILED) out.push(r);
    }
    return out;
  },

  // ── User actions — S172 work, stubs here ──

  retryEntry: function(rowId) {
    if (!_initialized) {
      return this.init().then(this.retryEntry.bind(this, rowId));
    }
    var row = _rowsById[rowId];
    if (!row) return Promise.resolve(false);
    if (row.status !== OUTBOX_STATUS.FAILED) return Promise.resolve(false);
    row.status = OUTBOX_STATUS.PENDING;
    row.retryCount = 0;     // S172 will gate this differently
    row.lastError = null;
    return _persistRow(row).then(function() {
      _notify('enqueue', { rowId: row.id, photoId: row.photoId, manualRetry: true });
      _kickProcessor();
      return true;
    });
  },

  retryAllFailed: function() {
    var failed = this.getFailedEntries();
    var self = this;
    return Promise.all(failed.map(function(r) {
      return self.retryEntry(r.id);
    })).then(function(results) {
      return results.filter(Boolean).length;
    });
  },

  // ── Cloud-push reconciliation (S171) ──

  markCloudConfirmed: function(photoIds) {
    // S171 wires this from sync.js push. S170 stub returns immediately.
    return Promise.resolve();
  },

  reconcileWithModel: function(proj) {
    // S171 wires this from sync.js post-pull. S170 stub returns 0.
    return Promise.resolve(0);
  },

  // ── Events ──

  onChange: function(event, handler) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(handler);
  },

  offChange: function(event, handler) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function(h) {
      return h !== handler;
    });
  },

  // ── Diagnostic ──

  dumpState: function() {
    return {
      enabled: _FIX_A_ENABLED,
      initialized: _initialized,
      storeName: STORE_NAME,
      rowCount: Object.keys(_rowsById).length,
      activeUploadCount: _activeUploadCount,
      maxConcurrent: MAX_CONCURRENT,
      rowsByStatus: (function() {
        var byStatus = {};
        for (var id in _rowsById) {
          var r = _rowsById[id];
          if (!r) continue;
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        }
        return byStatus;
      })(),
      rows: Object.values(_rowsById),
      listeners: Object.keys(_listeners).reduce(function(acc, ev) {
        acc[ev] = (_listeners[ev] || []).length;
        return acc;
      }, {})
    };
  }
};

// ─────────────────────────────────────────────────────────────
// Helpers: dataUrl → Blob (mirrors r2.js's _toBlob, kept local to
// avoid an import cycle and keep this module self-contained).
// ─────────────────────────────────────────────────────────────

function _toBlobFromDataUrl(dataUrl) {
  return new Promise(function(resolve) {
    if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
      resolve(null);
      return;
    }
    try {
      var commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) { resolve(null); return; }
      var meta = dataUrl.slice(5, commaIdx);
      var b64 = dataUrl.slice(commaIdx + 1);
      var mimeMatch = meta.split(';')[0];
      var mime = mimeMatch || 'image/jpeg';
      var bin = atob(b64);
      var len = bin.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type: mime }));
    } catch (e) {
      console.warn('[PhotoOutbox] _toBlobFromDataUrl failed:', e);
      resolve(null);
    }
  });
}

// Expose to window for DevTools diagnostic access. Same pattern as
// window._frt_r2Failures from Fix D.
try { window.PhotoOutbox = PhotoOutbox; } catch (_) {}
