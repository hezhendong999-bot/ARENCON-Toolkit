/**
 * ARENCON FRT — Sync Engine (SHIM, S491)
 * ══════════════════════════════════════
 * The implementation lives in lib/data/sync.js (parameterized factory,
 * S446 extraction + S491 reconcile: stale-overwrite guard fixed — it was
 * dead in the lib copy due to a leftover `typeof Model` check — and the
 * S462 sourceless-photo attention hook ported as config.onPhotoAttention).
 *
 * ⚠ IMPORT-GRAPH NOTE (§4.3 discipline): SyncWorkerHost is INJECTED —
 * this shim passes FRT's OWN host, whose worker chain imports FRT's
 * merge.js (carrying `_protectPhotoPointer`, S481). The stale
 * lib/data/merge.js never enters FRT's graph through this shim. Do not
 * "simplify" this to lib's host until the merge trio is reconciled.
 *
 * All FRT call sites (`import { SyncEngine }`) unchanged; the lib factory
 * sets window.SyncEngine itself (S123 P6B diagnostics), so the global is
 * preserved.
 *
 * S490d rule: this shim's lib target MUST be in the SW precache list
 * (sw.js) in the same push, or it 404s offline.
 */
import { Auth } from '../shared/auth.js';
import { Model } from './model.js';
import { IDB } from './idb.js';
import { SyncWorkerHost } from './syncWorkerHost.js';
import { BinaryOutbox } from './photoOutbox.js';
import { createSync } from '../../../lib/data/sync.js';

export var SyncEngine = createSync({
  toolKey: 'frt',
  Auth: Auth,
  IDB: IDB,
  model: Model,
  BinaryOutbox: BinaryOutbox,
  SyncWorkerHost: SyncWorkerHost,
  // S462 personality: FRT's zero-source photo banner.
  onPhotoAttention: function (remaining) {
    try { if (window._frtPhotoAttention) window._frtPhotoAttention(remaining); } catch (_) {}
  },
  /* S566 (Lane C, on Mark's explicit authorization — "all tools do the
     same"): change-scoped saves ON for FRT. The engine sends only the
     top-level sections that differ from the pinned ancestor; any doubt at
     any step = the full-document push, byte for byte as before. Outcomes go
     to the console until FRT grows its own on-screen record. */
  partialSave: {
    onPartialPush: function (info) {
      try {
        if (info && info.mode === 'partial') {
          console.info('[FRT sync] change-scoped save: ' + (info.sent || []).join(', ') +
                       ' (' + (info.sentKB || 0) + ' KB of ' + (info.fullKB || 0) + ' KB)');
        } else if (info) {
          console.info('[FRT sync] full save' + (info.reason ? ' (' + info.reason + ')' : ''));
        }
      } catch (_) {}
    }
  }
});

/* S672 — the engine's telemetry hook was never wired in FRT. Diesel connects
   engine.onDiag to its sync_diag writer (S599); FRT built the same writer
   (_frtSyncDiag, in app.js) and then never handed it to the engine, so every
   FRT pull decision, push conflict and — as of S672 — save-mode report went
   nowhere. One line closes the gap. Late-bound through window because app.js
   loads after this shim; absent writer = silent no-op, never a failed save. */
SyncEngine.onDiag = function (event, detail) {
  try {
    if (typeof window._frtSyncDiag === 'function') {
      window._frtSyncDiag(event, Object.assign(
        { build: (window.FRT_BUILD || '?') }, detail || {}));
    }
  } catch (_) {}
};

/* ═══ S676 — THE BOOT BARRIER (Lane C work order, from Diesel S673).
   Until the host announces its boot apply (bootApplyComplete), the screen is
   not the report: a stamp minted against the boot-window state certifies
   values nobody typed (Diesel's 17 Aug NPSH wipe). holdEditStamps makes the
   engine's edit stamper inert during that window; the outbound doors in
   app.js ask bootApplied() before acting. The host lifts the barrier in every
   terminal boot path; a 20s fallback guarantees it can never stay up. */
var _bootApplied = false;
var _bootHoldTimer = null;
var _bootAppliedState = null;
var BOOT_HOLD_MAX_MS = 20000;

function _liftBootHold(why) {
  if (_bootApplied) return;
  _bootApplied = true;
  if (_bootHoldTimer) { clearTimeout(_bootHoldTimer); _bootHoldTimer = null; }
  try { SyncEngine.holdEditStamps = false; } catch (_) {}
  /* Engine-side no-op for FRT (gated on getProjectReadsScreen, which FRT
     deliberately does not set — S643b) — called for parity with the Diesel
     facade so the engine owns the decision, not this file. */
  try { if (SyncEngine.anchorBoot) SyncEngine.anchorBoot(_bootAppliedState); } catch (e) {
    console.warn('[FRT sync S676] boot anchor skipped:', e && e.message);
  }
  /* Flush once: anything entered while the barrier was up re-diffs now and
     goes durable with its honest keystroke stamps (S646 item stamps were
     minted in the model at input time; nothing here invents a time). */
  try { SyncEngine.stampSoon(); } catch (_) {}
  if (why !== 'host') console.warn('[FRT sync S676] boot barrier lifted by ' + why);
}

try { SyncEngine.holdEditStamps = true; } catch (_) {}
_bootHoldTimer = setTimeout(function () { _liftBootHold('timeout'); }, BOOT_HOLD_MAX_MS);

/* The host (frt/js/app.js) calls this after its boot paint, in every terminal
   boot path. Idempotent; appliedState is optional evidence for the engine. */
SyncEngine.bootApplyComplete = function (appliedState) {
  if (appliedState) _bootAppliedState = appliedState;
  _liftBootHold('host');
};
SyncEngine.bootApplied = function () { return _bootApplied; };

/* ═══ S676 — THE DURABILITY DOOR (from Diesel S674: the value rides with its
   claim). The engine's keystroke stamper makes the CLAIM durable at 500ms
   (stampLocal → the syncMeta ledger). FRT's VALUE save is the model's own
   800ms debounce — kill in between and the ledger holds a timed claim about
   a value nothing on disk has. The door closes the gap by flushing the
   model's OWN field-proven save at the same trigger: saveNow() cancels the
   pending debounce and writes now, so claim and value become durable
   together. Diff gate: Model.isDirty() — not dirty means the debounced save
   already holds everything, so an idle sweep or a changed-nothing tap costs
   one boolean read. Local only; no network; the push cadence is untouched
   (storage rule, S496 — FRT keeps its own save path, never Diesel's cache). */
function _persistAtStamp() {
  if (!_bootApplied) return;                    // S676 — the screen is not the report yet
  try {
    if (Model.isDirty && !Model.isDirty()) return;   // nothing newer than the last save
    if (Model.saveNow) Model.saveNow();
  } catch (_) { /* durability must never break typing */ }
}
try { SyncEngine.onStampPersist = _persistAtStamp; } catch (_) {}

/* ═══ S676 — ANY EDIT IS AN EDIT (from S675), last and one line: taps, pen
   strokes and silent arrivals now feed the same diff-gated stamp pipeline
   typing already uses. Raised only after the barrier and the door above
   exist — the flag alone would stamp more while saving nothing extra. */
try { SyncEngine.wideEditTriggers = true; } catch (_) {}
