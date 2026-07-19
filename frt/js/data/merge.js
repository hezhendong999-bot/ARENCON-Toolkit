/**
 * ARENCON FRT — 3-Way Merge Engine (SHIM, S491)
 * ═════════════════════════════════════════════
 * The implementation lives in lib/data/merge.js (S446 extraction + S491
 * reconcile: the COMPLETE S481 photo pointer-protection system is now in the
 * lib copy — guard function, both short-circuit call sites, the both-changed
 * call site, and self-tests 15–17). Proven: 32/32 assertions pass on the lib
 * copy; the pre-reconcile lib copy demonstrably wiped a good r2Key on the
 * one-side-changed path (verified in Node before this shim shipped).
 *
 * Pure functions, zero deps — a straight re-export. The window._frt_mergeDiag
 * console hook attaches from the lib module itself.
 * Consumers: app.js (applyResolutions), syncWorker (merge3), 4 unit tests.
 */
export { merge3, applyResolutions, summarizeConflict } from '../../../lib/data/merge.js';
