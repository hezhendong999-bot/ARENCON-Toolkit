/**
 * ARENCON FRT — IndexedDB (SHIM, S491)
 * ════════════════════════════════════
 * The implementation lives in lib/data/idb.js (parameterized factory,
 * S445 extraction + S491 reconcile: read-before-write blob guard restored,
 * isReady/getStoreNames parity added). This file instantiates it with
 * FRT's own database identity and re-exports the singleton — all 6 FRT
 * call sites (`import { IDB }`) are unchanged.
 *
 * DB identity is FRT's verbatim: name ARENCON_FRT_V2, version 5
 * (S169 outbox bump → S201b markupBlobs bump — never goes backwards),
 * 15 stores in original declaration order. Upgrades stay additive-only.
 *
 * S490d rule: this shim's lib target MUST be in the SW precache list
 * (sw.js) in the same push, or it 404s offline.
 */
import { createIDB } from '../../../lib/data/idb.js';

export const IDB = createIDB({
  dbName: 'ARENCON_FRT_V2',
  version: 5,
  stores: [
    'projects',
    'contractors',
    'deficiencies',
    'observations',
    'drawings',
    'drawingBlobs',
    'pdfBufs',
    'markupObjects',
    'photos',
    'photoBlobs',
    'activityLog',
    'syncQueue',
    'syncMeta',
    'photoOutbox',
    'markupBlobs'
  ]
});
