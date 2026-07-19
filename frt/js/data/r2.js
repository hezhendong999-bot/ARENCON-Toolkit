/**
 * ARENCON FRT — R2 Storage (SHIM, S491)
 * ═════════════════════════════════════
 * The implementation lives in lib/data/r2.js (parameterized factory, S446
 * extraction + S491 reconcile: the S481 no-orphan-delete invariant
 * `delPhotoGuarded` is now IN the lib copy, toolKey-parameterized — every
 * consumer including Electric gets the guard). This file instantiates the
 * factory with FRT's toolKey and FRT's OWN dependency instances (its Auth,
 * its IDB singleton, its UploadQueue — all themselves lib-backed shims as
 * of S490d/S491c) and re-exports the singleton. All FRT call sites
 * (`import { R2 }`) are unchanged.
 *
 * Key format stays photos/{pid}/frt/{type}/{fname} — toolKey 'frt'
 * reproduces FRT's paths byte-for-byte. No storage migration.
 *
 * S490d rule: this shim's lib target MUST be in the SW precache list
 * (sw.js) in the same push, or it 404s offline.
 */
import { Auth } from '../shared/auth.js';
import { IDB } from './idb.js';
import { UploadQueue } from './uploadQueue.js';
import { createR2 } from '../../../lib/data/r2.js';

export const R2 = createR2({
  toolKey: 'frt',
  workerHost: 'https://files.arencon.app',
  Auth: Auth,
  IDB: IDB,
  UploadQueue: UploadQueue
});
