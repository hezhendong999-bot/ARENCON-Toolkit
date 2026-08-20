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
