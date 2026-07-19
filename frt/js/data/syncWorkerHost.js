/**
 * ARENCON FRT — Sync Worker Host (SHIM, S491)
 * ═══════════════════════════════════════════
 * Implementation: lib/data/syncWorkerHost.js — strictly AHEAD of the FRT
 * copy (self-locating worker URL via new URL('./syncWorker.js',
 * import.meta.url) instead of FRT's page-relative string; same pattern as
 * imageWorkerHost S490d). The worker it boots is lib/data/syncWorker.js,
 * whose sibling merge import is the RECONCILED S481-guarded lib merge.
 * Inline main-thread fallback rides along unchanged.
 *
 * S490d rule: lib targets (host + worker + merge) MUST be in the SW
 * precache list in the same push.
 */
export { SyncWorkerHost } from '../../../lib/data/syncWorkerHost.js';
