/**
 * ARENCON FRT v2 — Photo Outbox (Fix A)
 * ═══════════════════════════════════════
 *
 * **STATUS:** S169 FOUNDATION STUB — no behavior yet.
 *
 * This module is the durable in-flight tracker for photo uploads, the
 * core of Fix A's atomic photo lifecycle. It separates "photo in flight"
 * from "photo settled" so that cloud pulls cannot wipe a photo that R2
 * has confirmed but cloud hasn't yet captured.
 *
 * Full architecture: FIX_A_ARCHITECTURE.md (S168 design pass).
 *
 * ── What S169 ships ──
 *   • This file as a stub: every method on the documented API surface
 *     exists and returns a safe default. NONE of them do any work.
 *   • IDB store `photoOutbox` created on DB_VERSION 3 → 4 upgrade.
 *   • Module is imported by app.js so it loads, but no callers invoke
 *     it anywhere in the codebase yet.
 *   • `_FIX_A_ENABLED` runtime flag (D6) defaults to false. Set to true
 *     ONLY when ?staging=1 is in the URL. PROD users see zero change.
 *
 * ── What S169 does NOT ship ──
 *   • Real enqueue / dequeue / retry / abort logic
 *   • _compressAndAdd integration
 *   • sync.js push-strip rule
 *   • Migration scan
 *   • Header badge UI
 *   • Reconciliation with model state
 *
 * Each subsequent session (S170+) replaces stubs with real implementations
 * per the roadmap in FIX_A_ARCHITECTURE.md §13.
 *
 * ── Cold-start sanity check ──
 * On boot, every public method should be callable and return successfully
 * even though no work happens. Specifically:
 *   PhotoOutbox.init()              → resolves
 *   PhotoOutbox.resume()            → resolves
 *   PhotoOutbox.getStatusCounts()   → { pending:0, uploading:0, retrying:0, failed:0 }
 *   PhotoOutbox.enqueue({...})      → resolves with stub-row-id string, no IDB write
 *   PhotoOutbox.cancelByPhotoId(id) → resolves false (nothing to cancel)
 * No console errors. The new IDB store exists but is empty.
 */

import { IDB } from './idb.js';

// ─────────────────────────────────────────────────────────────
// Runtime activation flag (per D6: shipped dormant)
// ─────────────────────────────────────────────────────────────
// Code lives in the PROD bundle. Behavior only activates when
// ?staging=1 is in the URL. Production users see zero change.
// To promote in a later session: flip the default to `true` in
// a single one-line commit.
//
// Even when _FIX_A_ENABLED is true in S169, every method below is
// still a stub. The flag exists so later sessions can gate real
// behavior on it without re-wiring the activation logic.
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
  PENDING:        'pending',
  UPLOADING:      'uploading',
  R2_CONFIRMED:   'r2_confirmed',
  CLOUD_CONFIRMED:'cloud_confirmed',
  RETRYING:       'retrying',
  FAILED:         'failed',
  CANCELLED:      'cancelled'
};

// IDB store name — must match the entry added to STORES in idb.js.
var STORE_NAME = 'photoOutbox';

// In-memory mirror of the outbox for fast UI queries. Rebuilt on init()
// from IDB. Empty in S169 (stub).
var _rowsByPhotoId = {};         // photoId → row (or null)
var _rowsById = {};              // outbox row id → row

// In-memory map of AbortController instances, keyed by outbox row id.
// Lost on reload (deliberate — retries get fresh controllers). Empty
// in S169 (stub).
var _abortControllers = {};

// Concurrency cap (per D6 / Enhancement 7). Soft cap on outbox-managed
// concurrent uploads. UploadQueue (S130 5.1) provides the hard cap at
// the R2 layer. Not used in S169 stub.
var MAX_CONCURRENT = 2;

// Retry policy (per D3 / Enhancement 3). Backoff schedule in ms.
// Not used in S169 stub.
var RETRY_DELAYS_MS = [
  5 * 1000,        //  5s
  15 * 1000,       // 15s
  45 * 1000,       // 45s
  2 * 60 * 1000,   //  2min
  5 * 60 * 1000    //  5min
];
var MAX_RETRIES = RETRY_DELAYS_MS.length;

// Event-listener registry — Model-style notify channel. Not wired
// to anything in S169 stub, but the API exists so consumers can
// register listeners safely.
var _listeners = {};

function _stubLog(method) {
  // Dev-time diagnostic — every stub call gets logged so we can see
  // if anything accidentally invokes the outbox before S170. Quiet
  // in production via the flag check.
  if (_FIX_A_ENABLED) {
    console.log('[PhotoOutbox][stub] ' + method + ' called (no-op in S169)');
  }
}

export var PhotoOutbox = {

  // ─────────────────────────────────────────────────────────
  // Flag introspection (read-only — flip via code change only)
  // ─────────────────────────────────────────────────────────
  isEnabled: function() {
    return _FIX_A_ENABLED;
  },

  // ─────────────────────────────────────────────────────────
  // Lifecycle (called by app.js boot sequence in S170+)
  // ─────────────────────────────────────────────────────────

  /** Initialize: open IDB connection, restore in-memory mirror.
   *  S169 stub — resolves immediately with no IDB work. */
  init: function() {
    _stubLog('init');
    return Promise.resolve();
  },

  /** Resume pending/retrying rows after a reload.
   *  S169 stub — resolves immediately. */
  resume: function() {
    _stubLog('resume');
    return Promise.resolve();
  },

  /** One-time migration scan for legacy fragile photos (Enhancement 4).
   *  Gated by syncMeta:'migrationDone:fixA' so it only runs once per device.
   *  S169 stub — resolves immediately, scan logic deferred to S175. */
  migrationScan: function() {
    _stubLog('migrationScan');
    return Promise.resolve({ B: 0, C: 0, skipped: true });
  },

  // ─────────────────────────────────────────────────────────
  // Enqueue / cancel (called by deficiencies.js in S170+)
  // ─────────────────────────────────────────────────────────

  /** Enqueue a photo for R2 upload + cloud confirmation.
   *  S169 stub — returns a synthetic row id, writes nothing to IDB. */
  enqueue: function(opts) {
    _stubLog('enqueue');
    var stubId = 'outbox_stub_' + Date.now();
    return Promise.resolve(stubId);
  },

  /** Enqueue a photo that already exists in model state (migration path).
   *  Same flow as enqueue() but without the model.addPoolPhoto step.
   *  S169 stub. */
  enqueueExisting: function(opts) {
    _stubLog('enqueueExisting');
    var stubId = 'outbox_stub_' + Date.now();
    return Promise.resolve(stubId);
  },

  /** Cancel by photo id (called when user deletes a photo while pending,
   *  per Enhancement 8). Aborts in-flight PUT, deletes outbox row.
   *  S169 stub — returns false. */
  cancelByPhotoId: function(photoId) {
    _stubLog('cancelByPhotoId');
    return Promise.resolve(false);
  },

  // ─────────────────────────────────────────────────────────
  // Query (called by header badge + pin editor in S170+)
  // ─────────────────────────────────────────────────────────

  /** Counts by status for the header badge.
   *  Per D8: r2_confirmed and cloud_confirmed are NOT in the user-facing
   *  badge count — they are "safe" states. */
  getStatusCounts: function() {
    return {
      pending: 0,
      uploading: 0,
      retrying: 0,
      failed: 0
    };
  },

  /** All outbox rows for a given project (current user only, per D-spec
   *  Enhancement 5). S169 stub — empty array. */
  getEntriesForProject: function(projectId) {
    return [];
  },

  /** Lookup row by the photo id it tracks. S169 stub — null. */
  getEntryByPhotoId: function(photoId) {
    return null;
  },

  /** All rows currently in `failed` state (for the detail modal).
   *  S169 stub — empty array. */
  getFailedEntries: function() {
    return [];
  },

  // ─────────────────────────────────────────────────────────
  // User actions (called by detail modal in S172+)
  // ─────────────────────────────────────────────────────────

  /** Manually retry a failed row. Resets retryCount, schedules a fresh
   *  attempt immediately. Per D3 — only path back from `failed` state.
   *  S169 stub. */
  retryEntry: function(rowId) {
    _stubLog('retryEntry');
    return Promise.resolve(false);
  },

  /** Bulk retry — every failed row for the current project.
   *  S169 stub. */
  retryAllFailed: function() {
    _stubLog('retryAllFailed');
    return Promise.resolve(0);
  },

  // ─────────────────────────────────────────────────────────
  // Cloud-push reconciliation (called by sync.js in S171+)
  // ─────────────────────────────────────────────────────────

  /** Mark a set of photoIds as cloud-confirmed (their r2_confirmed
   *  outbox rows can be deleted). Called by sync.js after a successful
   *  push. Idempotent. S169 stub. */
  markCloudConfirmed: function(photoIds) {
    _stubLog('markCloudConfirmed');
    return Promise.resolve();
  },

  /** Re-inject photos from outbox into model state if they aren't
   *  there (the Enhancement 2 atomicity guarantee — a cloud pull that
   *  wiped them is repaired here). Called after every pull.
   *  S169 stub. */
  reconcileWithModel: function(proj) {
    _stubLog('reconcileWithModel');
    return Promise.resolve(0);
  },

  // ─────────────────────────────────────────────────────────
  // Events (Model-style notify channel)
  // ─────────────────────────────────────────────────────────

  /** Register a listener. Events: 'enqueue', 'progress',
   *  'r2_confirmed', 'failed', 'cancelled', 'cloud_confirmed'. */
  onChange: function(event, handler) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(handler);
  },

  /** Unregister a previously-added listener. */
  offChange: function(event, handler) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function(h) {
      return h !== handler;
    });
  },

  // ─────────────────────────────────────────────────────────
  // Diagnostic (read by Mark in DevTools console)
  // ─────────────────────────────────────────────────────────

  /** Full state dump for debugging. Safe to call at any time. */
  dumpState: function() {
    return {
      enabled: _FIX_A_ENABLED,
      stub: true,                       // S169 marker — remove in S170
      storeName: STORE_NAME,
      rowsByPhotoId: _rowsByPhotoId,
      rowsById: _rowsById,
      abortControllers: Object.keys(_abortControllers),
      maxConcurrent: MAX_CONCURRENT,
      retryDelaysMs: RETRY_DELAYS_MS,
      listeners: Object.keys(_listeners).reduce(function(acc, ev) {
        acc[ev] = (_listeners[ev] || []).length;
        return acc;
      }, {})
    };
  }
};

// Expose to window for DevTools diagnostic access. Same pattern as
// window._frt_r2Failures from Fix D.
try { window.PhotoOutbox = PhotoOutbox; } catch (_) {}
