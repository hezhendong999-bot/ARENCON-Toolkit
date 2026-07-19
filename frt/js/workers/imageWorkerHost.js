/**
 * ARENCON FRT v2 — Image Worker Host  →  SHIM
 * ════════════════════════════════════════════
 * S490d (library audit step 1): the lib copy (S446 extraction) is STRICTLY
 * AHEAD of the FRT fork — it self-locates its worker via
 * new URL('./imageWorker.js', import.meta.url), where FRT's used a
 * page-relative path that only resolved from FRT's own directory. Everything
 * else was identical (verified by diff). FRT adopts the lib host; the worker
 * it spawns is lib/workers/imageWorker.js.
 *
 * Main-thread fallback (for environments without OffscreenCanvas) is inside
 * the shared host, unchanged.
 */

export { ImageWorkerHost } from '../../../lib/workers/imageWorkerHost.js';
