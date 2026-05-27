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
 *   • AbortController wiring for cancel-during-pending (S176 — SHIPPED)
 *   • Detail modal UI (S175 — SHIPPED)
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
// Runtime activation flag (per D6 — flipped on in S173 promote)
// ─────────────────────────────────────────────────────────────
// S173 promote: Mark elected to skip staging burn-in and run Fix A
// directly in PROD with code-level rollback as the safety net. The
// flag now defaults to `true` for all users; ?staging=0 in the URL
// is the emergency opt-out for revert without re-deploy.
//
// History:
//   S168 design — gate decision D6: ship dormant, ?staging=1 to enable.
//   S169–S172  — code shipped with default false, ?staging=1 to enable.
//   S173 (this commit) — flipped default to true.
//
// To roll back: change `var _FIX_A_ENABLED = true;` back to `false`
// and push. The activation logic below preserves the ?staging=0
// escape hatch in case the device-specific opt-out is needed.
// ─────────────────────────────────────────────────────────────
var _FIX_A_ENABLED = true;
try {
  var _params = new URLSearchParams(window.location.search);
  // Emergency device-level opt-out: ?staging=0 disables Fix A on
  // this URL only. No code push required. Useful if a specific
  // tablet is misbehaving with Fix A on while others are fine.
  if (_params.get('staging') === '0') {
    _FIX_A_ENABLED = false;
  }
} catch (_) {
  // Non-browser context (unlikely)
}

// S199 (SYNC-02 Phase A, G1) — post-PUT verify after R2 upload.
// Closes the 4380.24 class: R2 reports PUT success but the object isn't
// actually retrievable. After the PUT resolves, we issue a tiny verify
// request against the same URL; only a 2xx promotes the row to
// r2_confirmed. Verify failure is treated as a transient R2 fault and
// routes through _handleR2Failure for retry policy.
//
// S201a re-ship (2026-05-27): Verify mechanism is now `GET` with
// `Range: bytes=0-0` instead of `HEAD`. S200 field-verify showed the R2
// Cloudflare Worker has no HEAD handler — it returned 404 for every HEAD
// regardless of object existence, which made S199 break every upload.
// Worker supports GET on existing objects, so a 1-byte ranged GET gives
// the same exists/missing signal as HEAD with ~50ms latency. A real
// object returns 206 Partial Content (or 200 if range is ignored —
// either way `resp.ok` is true); a missing object returns 404.
//
// Cost: one tiny ranged GET per upload (~50ms on R2). Default on.
// URL overrides:
//   ?verify=0  — force-disable on a single tablet for field debug.
//   ?verify=1  — force-enable (kept for parity with S200 hotfix mechanic).
var _VERIFY_ENABLED = true;
try {
  var _verifyParams = new URLSearchParams(window.location.search);
  if (_verifyParams.get('verify') === '0') {
    _VERIFY_ENABLED = false;
  } else if (_verifyParams.get('verify') === '1') {
    _VERIFY_ENABLED = true;
  }
} catch (_) {
  // Non-browser context (unlikely)
}

// ─────────────────────────────────────────────────────────────
// Status constants — exported for use by future UI/sync code.
// ─────────────────────────────────────────────────────────────
export var OUTBOX_STATUS = {
  PENDING:         'pending',
  UPLOADING:       'uploading',
  VERIFYING:       'verifying',         // S199 + S201a — post-PUT verify via GET Range:0-0
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
// Populated in _processRow (S176), consumed by cancelByPhotoId. Empty
// in non-browser contexts or browsers lacking AbortController.
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
      console.warn('[BinaryOutbox] Listener error on ' + event + ':', e);
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
// Retry scheduling state (S172)
// ─────────────────────────────────────────────────────────────
// Map from outbox row id → setTimeout handle for that row's pending
// retry. Cleared when the row transitions out of retrying (success,
// failed, cancelled, or online/focus-triggered immediate retry).
var _retryTimers = {};

// ─────────────────────────────────────────────────────────────
// Batched failure toast (S172, per D1)
// ─────────────────────────────────────────────────────────────
// Per D1: surface failures via one debounced batch toast per 3s
// window. _failedSinceLastToast collects photoIds that entered the
// failed state during the window; the timer fires once and shows a
// summary toast. Avoids spam under burst failure (e.g. R2 worker
// degraded with 20 photos queued).
var _failedSinceLastToast = [];
var _failedToastTimer = null;
var FAILED_TOAST_DEBOUNCE_MS = 3000;

function _scheduleFailedToast(photoId) {
  _failedSinceLastToast.push(photoId);
  if (_failedToastTimer) return;
  _failedToastTimer = setTimeout(function() {
    var n = _failedSinceLastToast.length;
    _failedSinceLastToast = [];
    _failedToastTimer = null;
    if (n === 1) {
      toast('\u26A0 Photo upload failed after ' + MAX_RETRIES +
            ' retries \u2014 tap the badge to retry', 8000);
    } else if (n > 1) {
      toast('\u26A0 ' + n + ' photo uploads failed after retries \u2014 ' +
            'tap the badge to retry', 8000);
    }
  }, FAILED_TOAST_DEBOUNCE_MS);
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

// S199 (SYNC-02 Phase A, G1) — post-PUT verify helper. Called after
// R2.upload resolves with {r2Key, r2Url} but before the row transitions
// to R2_CONFIRMED. Throws on non-2xx so the outer .catch in _processRow
// routes through _handleR2Failure for the S172 retry policy. AbortSignal
// threads through so a cancel during VERIFYING aborts the verify as well
// as any still-in-flight PUT, mirroring the S176 abort plumbing.
//
// S201a (re-ship): Mechanism is `GET` with `Range: bytes=0-0` instead of
// HEAD — the R2 Cloudflare Worker has no HEAD handler (it returned 404
// for every HEAD request regardless of object existence; this broke S199
// in field-verify and forced the S200 disable). A real object returns
// 206 Partial Content (or 200 if the worker doesn't honor the Range —
// either is `resp.ok`); a missing object returns 404.
function _verifyR2Object(r2Url, signal) {
  var opts = {
    method: 'GET',
    headers: { 'Range': 'bytes=0-0' }
  };
  if (signal) opts.signal = signal;
  return fetch(r2Url, opts).then(function(resp) {
    if (!resp.ok) {
      var err = new Error('R2 verify failed: ' + resp.status);
      err.status = resp.status;
      err.isVerifyFailure = true;
      throw err;
    }
    return true;
  });
}

function _processRow(row) {
  _activeUploadCount++;
  row.status = OUTBOX_STATUS.UPLOADING;
  row.lastAttemptAt = new Date().toISOString();
  _persistRow(row).catch(function() {}); // fire-and-forget; in-mem mirror is what we read
  _notify('uploading', { rowId: row.id, photoId: row.photoId });

  // S176 (Enhancement 8): bind an AbortController so cancelByPhotoId can
  // interrupt the in-flight R2 PUT. Without this wiring, cancel deleted
  // the outbox row but the upload continued to completion in the
  // background, orphaning a binary on R2 and contradicting the cancel
  // affordance shown in the S175 detail modal. The cancelByPhotoId path
  // already calls _abortControllers[rowId].abort() and deletes the entry;
  // here we just populate the map. Browsers without AbortController
  // (none of Mark's fleet, but defensive) fall back to today's behavior.
  var controller = null;
  try {
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      _abortControllers[row.id] = controller;
    }
  } catch (_) {}
  var rowIdForCleanup = row.id;

  // The photo record lives in model state (added by the caller via
  // Model.addObservationPhoto before enqueue). We need the blob from
  // photoBlobs (already saved there by enqueue() itself — see below).
  IDB.get('photoBlobs', row.photoId).then(function(blobRec) {
    if (!blobRec || !blobRec.dataBlob) {
      throw new Error('No blob in photoBlobs for photo ' + row.photoId);
    }
    // Deterministic R2 key (Enhancement 1). Filename derived from photo id.
    // S176: pass AbortSignal as 6th param. R2.upload propagates it to fetch
    // and treats AbortError as non-retriable.
    return R2.upload(
      row.projectId,
      row.type || 'original',
      blobRec.dataBlob,
      'defic_' + row.photoId + '.jpg',
      null,
      controller ? controller.signal : undefined
    );
  }).then(function(result) {
    delete _abortControllers[rowIdForCleanup];
    _activeUploadCount = Math.max(0, _activeUploadCount - 1);
    if (!result || !result.r2Key) {
      // R2.upload swallows non-2xx and network errors as null (r2.js:120).
      // S172 fix: route through _handleR2Failure so the retry policy
      // engages. Previous direct _markFailed call meant every transient
      // R2 hiccup went immediately to the terminal failed state with
      // no backoff cycle — the opposite of what D2/D3 specifies.
      // S176: aborted uploads also return null here, but the cancel path
      // synchronously deleted the row from _rowsById before the abort
      // propagated, so _handleR2Failure short-circuits cleanly.
      _handleR2Failure(row, new Error('R2 upload returned null (transient)'));
      _kickProcessor();
      return;
    }
    // S199 (SYNC-02 Phase A, G1) — VERIFYING state inserted before R2_CONFIRMED.
    // R2 PUT 200 alone is NOT proof the object is retrievable (the 4380.24
    // class). We HEAD-verify against the same r2Url before promoting the row
    // to r2_confirmed. Verify failure throws and is caught by the outer
    // .catch below, which routes through _handleR2Failure for retry policy.
    // r2Key/r2Url are written to the row immediately so a crash during HEAD
    // doesn't lose the destination; resume() handles VERIFYING rows by
    // re-PUTting (R2 dedupes by key, so re-PUT of same content is idempotent).
    row.status = OUTBOX_STATUS.VERIFYING;
    row.r2Key = result.r2Key;
    row.r2Url = result.r2Url;
    _persistRow(row).catch(function() {});
    _notify('verifying', { rowId: row.id, photoId: row.photoId });

    var _verifyPromise = _VERIFY_ENABLED
      ? _verifyR2Object(result.r2Url, controller ? controller.signal : undefined)
      : Promise.resolve(true);

    return _verifyPromise.then(function() {
      // ── R2 confirmed (post-verify) ──
      row.status = OUTBOX_STATUS.R2_CONFIRMED;
      row.r2ConfirmedAt = new Date().toISOString();
      row.verifyConfirmedAt = new Date().toISOString();
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
        console.warn('[BinaryOutbox] Could not write r2Key to model photo:', e);
      }

      _notify('r2_confirmed', { rowId: row.id, photoId: row.photoId,
        r2Key: result.r2Key, r2Url: result.r2Url });

      // S171: row STAYS in r2_confirmed until sync.js push captures the
      // photo in cloud and calls BinaryOutbox.markCloudConfirmed. This is
      // what makes Enhancement 2 (atomicity through cloud push) work —
      // if a cloud pull wipes the photo before the next push runs,
      // BinaryOutbox.reconcileWithModel re-injects it from the outbox.

      _kickProcessor();
    });
  }).catch(function(err) {
    delete _abortControllers[rowIdForCleanup];
    _activeUploadCount = Math.max(0, _activeUploadCount - 1);
    // S172: route through the retry-aware handler instead of going
    // straight to failed. Transient R2 errors (network blip, 5xx, R2
    // worker hiccup) get a backoff cycle; only after MAX_RETRIES does
    // the row go terminal. The handler also gracefully handles the
    // case where the row was cancelled mid-flight (row no longer in
    // _rowsById).
    _handleR2Failure(row, err);
    _kickProcessor();
  });
}

// ─────────────────────────────────────────────────────────────
// Retry-or-fail decision (S172)
// ─────────────────────────────────────────────────────────────

function _handleR2Failure(row, err) {
  // Row may have been cancelled while we were waiting for the R2
  // response. If it's gone from the in-memory mirror, discard quietly.
  if (!_rowsById[row.id]) return;

  // S172: simple policy — every failure is treated as transient until
  // MAX_RETRIES is exhausted. R2.upload swallows HTTP status to null,
  // so we can't classify auth/4xx vs 5xx at this layer without
  // changing r2.js (out of scope for this session). The cost of
  // retrying a permanent error is ~8 minutes total backoff before the
  // user sees the failed toast — acceptable, and prefers a transient
  // recovery over an aggressive early give-up.

  if (row.retryCount >= MAX_RETRIES) {
    _markFailed(row, err);
    return;
  }
  _scheduleRetry(row, err);
}

function _scheduleRetry(row, err) {
  var delayMs = RETRY_DELAYS_MS[row.retryCount];
  row.retryCount++;
  row.status = OUTBOX_STATUS.RETRYING;
  row.lastError = (err && err.message) || String(err);
  row.lastAttemptAt = new Date().toISOString();
  row.nextRetryAt = Date.now() + delayMs;
  _persistRow(row).catch(function() {});

  if (_FIX_A_ENABLED) {
    console.log('[BinaryOutbox] Retry ' + row.retryCount + '/' + MAX_RETRIES +
                ' for photo ' + row.photoId + ' in ' + (delayMs / 1000) + 's' +
                ' (last error: ' + row.lastError + ')');
  }

  _clearRetryTimer(row.id);
  _retryTimers[row.id] = setTimeout(function() {
    delete _retryTimers[row.id];
    // Re-check row existence (cancel may have fired during the wait)
    var current = _rowsById[row.id];
    if (!current) return;
    current.status = OUTBOX_STATUS.PENDING;
    current.nextRetryAt = null;
    _persistRow(current).catch(function() {});
    _kickProcessor();
  }, delayMs);

  _notify('retrying', { rowId: row.id, photoId: row.photoId,
    retryCount: row.retryCount, nextRetryAt: row.nextRetryAt });
}

function _clearRetryTimer(rowId) {
  if (_retryTimers[rowId]) {
    clearTimeout(_retryTimers[rowId]);
    delete _retryTimers[rowId];
  }
}

function _markFailed(row, err) {
  // Terminal failure — MAX_RETRIES has been exhausted. Per D3, this is
  // the only state from which the row never auto-retries; user action
  // (BinaryOutbox.retryEntry or retryAllFailed) is required to revive.

  _clearRetryTimer(row.id);  // belt-and-suspenders if called via retry path

  row.status = OUTBOX_STATUS.FAILED;
  row.lastError = (err && err.message) || String(err);
  row.lastAttemptAt = new Date().toISOString();
  row.nextRetryAt = null;
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
    console.warn('[BinaryOutbox] Could not write failure flag to model photo:', e);
  }

  // Diagnostic ring buffer parity with Fix D.
  try {
    var buf = (window._frt_r2Failures = window._frt_r2Failures || []);
    buf.push({
      photoId: row.photoId,
      pid: row.projectId,
      when: row.lastAttemptAt,
      error: row.lastError,
      retryCount: row.retryCount,
      source: 'BinaryOutbox'
    });
    while (buf.length > 50) buf.shift();
  } catch (_) {}

  // S172 / D1: batched toast instead of one-per-photo. _scheduleFailedToast
  // collects failures for 3s and fires a single summary toast.
  _scheduleFailedToast(row.photoId);

  _notify('failed', { rowId: row.id, photoId: row.photoId,
    error: row.lastError, retryCount: row.retryCount });
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

function _findDeficInProject(proj, deficId) {
  // Walk both contractor and general deficiency trees by id. S171
  // reconcileWithModel needs this to know where to re-inject a
  // photo whose pool got wiped by a cloud pull.
  if (!proj || !deficId) return null;
  var contractors = proj.contractors || [];
  for (var i = 0; i < contractors.length; i++) {
    var defs = contractors[i].deficiencies || [];
    for (var j = 0; j < defs.length; j++) {
      if (defs[j] && defs[j].id === deficId) return defs[j];
    }
  }
  var general = proj.generalDeficiencies || [];
  for (var k = 0; k < general.length; k++) {
    if (general[k] && general[k].id === deficId) return general[k];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Online / visibility retry triggers (S172, per D2)
// ─────────────────────────────────────────────────────────────
// When connectivity returns or the tab returns to foreground, any row
// currently in `retrying` state has its backoff timer cleared and is
// re-added to the processor queue immediately. retryCount is NOT
// reset — the MAX_RETRIES ceiling still applies, so a row that's
// failed 4 times and gets one online-triggered retry will still go
// failed on the 5th attempt if it doesn't succeed.
//
// Listeners are wired exactly once per session by _wireRetryTriggers.
var _retryTriggersWired = false;

function _wireRetryTriggers() {
  if (_retryTriggersWired) return;
  _retryTriggersWired = true;
  try {
    window.addEventListener('online', function() {
      if (_FIX_A_ENABLED) {
        console.log('[BinaryOutbox] online event — flushing retry timers');
      }
      _retryAllRetrying('online');
    });
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        if (_FIX_A_ENABLED) {
          console.log('[BinaryOutbox] visibilitychange (visible) — flushing retry timers');
        }
        _retryAllRetrying('visible');
      }
    });
  } catch (e) {
    console.warn('[BinaryOutbox] _wireRetryTriggers failed (non-fatal):', e);
  }
}

function _retryAllRetrying(reason) {
  var triggered = 0;
  for (var rowId in _rowsById) {
    var r = _rowsById[rowId];
    if (!r || r.status !== OUTBOX_STATUS.RETRYING) continue;
    _clearRetryTimer(rowId);
    r.status = OUTBOX_STATUS.PENDING;
    r.nextRetryAt = null;
    _persistRow(r).catch(function() {});
    triggered++;
  }
  if (triggered > 0) {
    if (_FIX_A_ENABLED) {
      console.log('[BinaryOutbox] ' + triggered + ' retry timer(s) flushed via ' + reason);
    }
    _kickProcessor();
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// BinaryOutbox public API (S200a).
//
// Renamed from BinaryOutbox to reflect Phase A scope: this module will
// generalize to handle drawings + markup in S201. For S200a, behavior is
// identical to the previous BinaryOutbox — only the canonical name changes.
// The S200a `BinaryOutbox = BinaryOutbox` alias was removed in S201g
// modules (app.js, sync.js, deficiencies.js) continue to work unchanged.
// New rows are stamped with `kind: 'photo'` for future-proofing; rows
// loaded from IDB without `kind` are normalized to `'photo'` in memory
// at init() time. No IDB schema or version change.
// ─────────────────────────────────────────────────────────────
export var BinaryOutbox = {

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
        // S200a: lazy kind normalization. Rows persisted before S200a have
        // no `kind` field. Treat them as photos in memory. Not written
        // back to IDB here (kept idempotent + no-side-effects on init);
        // any subsequent _persistRow call will incidentally persist the
        // normalized field. Old code reading these rows tolerates the
        // extra field gracefully.
        if (!row.kind) row.kind = 'photo';
        _rowsById[row.id] = row;
        if (row.photoId) _rowsByPhotoId[row.photoId] = row;
      });
      _initialized = true;
      if (_FIX_A_ENABLED) {
        console.log('[BinaryOutbox] Initialized — ' + (rows || []).length +
                    ' row(s) restored from IDB');
      }
      // S172 / D2: wire online + visibilitychange handlers ONCE so any
      // retrying rows pick up immediately when connectivity returns
      // or the tab returns to foreground. These complement the
      // per-row backoff timers; either path can fire first.
      _wireRetryTriggers();
    }).catch(function(e) {
      console.warn('[BinaryOutbox] init failed (non-fatal):', e && e.message);
      _initialized = true;  // proceed — empty mirror
    });
  },

  /** Re-pick-up pending / uploading / retrying rows after a reload.
   *  - `uploading` rows are reset to pending (the in-flight fetch is
   *    gone; treat as a fresh attempt).
   *  - S172: `retrying` rows are also reset to pending. The setTimeout
   *    that was waiting for the backoff window is gone (in-memory only).
   *    Without this, a reload during backoff would leave the row
   *    permanently stuck in retrying state. retryCount is preserved so
   *    the MAX_RETRIES ceiling still applies.
   *
   *  Resume always runs at init-after-IDB-restore time. */
  resume: function() {
    if (!_initialized) {
      return this.init().then(this.resume.bind(this));
    }
    var resetUploading = 0, resetRetrying = 0;
    for (var id in _rowsById) {
      var r = _rowsById[id];
      if (!r) continue;
      if (r.status === OUTBOX_STATUS.UPLOADING ||
          r.status === OUTBOX_STATUS.VERIFYING) {
        // S199/S201a: VERIFYING reset same as UPLOADING — the in-flight
        // verify GET is gone after reload. Re-PUT is idempotent (R2 dedupes
        // by key) so resetting to pending and re-running the full PUT+verify
        // cycle is safe whether the original PUT actually landed or not.
        r.status = OUTBOX_STATUS.PENDING;
        _persistRow(r).catch(function() {});
        resetUploading++;
      } else if (r.status === OUTBOX_STATUS.RETRYING) {
        r.status = OUTBOX_STATUS.PENDING;
        r.nextRetryAt = null;
        _persistRow(r).catch(function() {});
        resetRetrying++;
      }
    }
    if (_FIX_A_ENABLED && (resetUploading > 0 || resetRetrying > 0)) {
      console.log('[BinaryOutbox] Resume reset ' + resetUploading +
                  ' uploading + ' + resetRetrying + ' retrying row(s) to pending');
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
      return Promise.reject(new Error('BinaryOutbox.enqueue: missing photo or projectId'));
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
      kind: 'photo',  // S200a: explicit kind tag, future-proofing for drawings/markup
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

  /** Cancel by photo id (Enhancement 8 — fully wired in S176). Aborts
   *  any in-flight R2 PUT, clears retry timers, deletes the outbox row,
   *  and removes the photo flag. After S176 the abort actually fires:
   *  pre-S176 the controller map was empty and cancel only deleted the
   *  row while the upload completed in the background.  */
  cancelByPhotoId: function(photoId) {
    if (!_initialized) {
      return this.init().then(this.cancelByPhotoId.bind(this, photoId));
    }
    var row = _rowsByPhotoId[photoId];
    if (!row) return Promise.resolve(false);
    var rowId = row.id;
    // S176: abort any in-flight R2 PUT bound to this row. _processRow
    // populates _abortControllers[rowId] before starting the upload and
    // clears it on completion. Aborting fires fetch's AbortError, which
    // r2.js maps to a null return, which the processor maps via
    // _handleR2Failure → no-op short-circuit (row already gone here).
    try {
      var ac = _abortControllers[rowId];
      if (ac && ac.abort) ac.abort();
      delete _abortControllers[rowId];
    } catch (_) {}
    // S172: clear any pending retry timer too — a cancelled row
    // must not silently re-enter the queue when its backoff expires.
    _clearRetryTimer(rowId);
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
    // S172: defensive — clear any leftover timer (shouldn't exist on a
    // failed row, but cheap to be idempotent). retryCount resets to 0
    // so the user gets a fresh MAX_RETRIES budget. Per D3, the user
    // tapping retry is the ONLY path out of failed state.
    _clearRetryTimer(rowId);
    row.status = OUTBOX_STATUS.PENDING;
    row.retryCount = 0;
    row.lastError = null;
    row.nextRetryAt = null;
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

  /** Mark a set of photoIds as cloud-confirmed. Called by sync.js after
   *  a successful push. For each photoId, finds the matching outbox row
   *  (must be in r2_confirmed status) and deletes it. Idempotent —
   *  re-confirming a photo whose row is already gone is a no-op.
   *
   *  Per the S171 design: this is the ONLY path that transitions an
   *  outbox row out of r2_confirmed into deletion. The processor's
   *  success path no longer auto-deletes after a delay (S170 had a 2s
   *  timeout; that was the gap that left the bug open). */
  markCloudConfirmed: function(photoIds) {
    if (!_FIX_A_ENABLED) return Promise.resolve();
    if (!_initialized) {
      return this.init().then(this.markCloudConfirmed.bind(this, photoIds));
    }
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return Promise.resolve();
    }
    var deletions = [];
    photoIds.forEach(function(pid) {
      var row = _rowsByPhotoId[pid];
      if (!row) return;
      // Only delete rows that the push actually carried — pending /
      // uploading rows are not "confirmed by this push" even if their
      // photoId showed up in the input (shouldn't happen since strip
      // removes them, but defensive).
      if (row.status !== OUTBOX_STATUS.R2_CONFIRMED) return;
      var rowId = row.id;
      row.cloudConfirmedAt = new Date().toISOString();
      deletions.push(
        _deleteRow(rowId).then(function() {
          _notify('cloud_confirmed', { rowId: rowId, photoId: pid });
        })
      );
    });
    return Promise.all(deletions).then(function() {
      if (deletions.length > 0) {
        console.log('[BinaryOutbox] markCloudConfirmed deleted ' +
                    deletions.length + ' row(s)');
      }
    });
  },

  /** Re-inject photos from outbox into model state. Called after every
   *  cloud pull (and after applyMerged on conflict paths). Walks every
   *  outbox row in r2_confirmed status for this project; for any row
   *  whose photoId is NOT currently in model state, re-injects the
   *  photo record into the appropriate defic.photos[] pool.
   *
   *  This is the operative half of Enhancement 2 — the outbox survives
   *  cloud pulls (because Model.setProject doesn't touch this store),
   *  and this method repairs model state when a pull wiped a photo
   *  that R2 had confirmed but cloud hadn't yet captured.
   *
   *  Idempotent — re-running with no missing photos is a fast no-op. */
  reconcileWithModel: function(proj) {
    if (!_FIX_A_ENABLED) return Promise.resolve(0);
    if (!_initialized) {
      return this.init().then(this.reconcileWithModel.bind(this, proj));
    }
    if (!proj || !proj.id) return Promise.resolve(0);

    var reinjected = 0;
    var orphaned = 0;
    for (var id in _rowsById) {
      var row = _rowsById[id];
      if (!row) continue;
      if (row.status !== OUTBOX_STATUS.R2_CONFIRMED) continue;
      if (row.projectId !== proj.id) continue;

      // Already in model? Nothing to do.
      if (_findPhotoInProject(proj, row.photoId)) continue;

      // Pull wiped it. Re-inject. Need the defic to add it back to.
      var defic = _findDeficInProject(proj, row.deficId);
      if (!defic) {
        // The pin itself got wiped (rare — pin deletes are very
        // intentional). Outbox row is now orphaned; mark it cancelled
        // so the processor stops tracking it. The R2 binary stays
        // (R2 cleanup is a separate concern; see non-goals §11).
        console.warn('[BinaryOutbox] reconcile: defic ' + row.deficId +
                     ' not in pull; orphaning outbox row ' + row.id);
        row.status = OUTBOX_STATUS.CANCELLED;
        row.lastError = 'Defic ' + row.deficId + ' not present in pulled project';
        _persistRow(row).catch(function() {});
        orphaned++;
        continue;
      }

      // Defensive: if defic.photos is missing, initialize. Same
      // pattern as Model.addPoolPhoto (model.js:1559).
      if (!Array.isArray(defic.photos)) defic.photos = [];

      // Build the photo record from outbox row state. We don't have
      // dataUrl any more (the pull wiped it), but r2Url is set so
      // rendering picks up from R2. The photoBlobs store still has
      // the bytes from enqueue() if r2Url ever fails.
      var addedDate = (row.enqueuedAt || new Date().toISOString())
        .split('T')[0];
      defic.photos.push({
        id: row.photoId,
        r2Key: row.r2Key || null,
        r2Url: row.r2Url || null,
        sourceR2Key: row.r2Key || null,
        dataUrl: null,
        thumb: null,
        filename: row.filename || ('photo_' + Date.now() + '.jpg'),
        addedDate: addedDate,
        createdBy: row.userId !== 'local' ? row.userId : null,
        uploadStatus: OUTBOX_STATUS.R2_CONFIRMED
      });

      // If the originating obs had a custom photoSelection (i.e. it
      // explicitly listed which photos to show), the re-injection
      // needs to add this photoId to that list — otherwise the obs
      // will keep its old list and the new photo would be invisible.
      // Default-state obs (photoSelection null) auto-show all pool
      // entries, so no change needed.
      if (typeof row.obsIdx === 'number' &&
          defic.observations &&
          defic.observations[row.obsIdx]) {
        var obs = defic.observations[row.obsIdx];
        if (Array.isArray(obs.photoSelection) &&
            obs.photoSelection.indexOf(row.photoId) === -1) {
          obs.photoSelection.push(row.photoId);
        }
      }

      reinjected++;
    }

    if (reinjected > 0) {
      // Persist the re-injected photos. Model has its own debounced
      // save, but reconcile is a critical-path repair — flush
      // immediately so a reload right after pull keeps the photos.
      try { if (Model.saveNow) Model.saveNow(); } catch (_) {}
      console.log('[BinaryOutbox] reconcileWithModel re-injected ' +
                  reinjected + ' photo(s) wiped by pull');
      _notify('reconcile', { reinjected: reinjected, orphaned: orphaned });
    }
    return Promise.resolve(reinjected);
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
      retryDelaysMs: RETRY_DELAYS_MS,
      maxRetries: MAX_RETRIES,
      retryTimers: Object.keys(_retryTimers).length,
      retryTriggersWired: _retryTriggersWired,
      failedToastQueue: _failedSinceLastToast.length,
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
      console.warn('[BinaryOutbox] _toBlobFromDataUrl failed:', e);
      resolve(null);
    }
  });
}

// Expose to window for DevTools diagnostic access. Same pattern as
// window._frt_r2Failures from Fix D. The S200a `window.BinaryOutbox`
// alias was dropped in S201g — DevTools must now use BinaryOutbox.
try { window.BinaryOutbox = BinaryOutbox; } catch (_) {}
