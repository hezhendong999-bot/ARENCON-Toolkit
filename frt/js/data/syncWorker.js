/**
 * ARENCON FRT — Sync Worker (SHIM, S491)
 * ══════════════════════════════════════
 * Implementation: lib/data/syncWorker.js (S446 extraction — verbatim except
 * header; its sibling import './merge.js' now resolves to the RECONCILED lib
 * merge carrying the full S481 pointer-protection, which is what made this
 * trio shippable). The actual Worker boot uses lib's copy directly via the
 * lib host's self-locating URL; this shim exists for the module-import
 * consumers (frt/tests/unit/syncWorker.test.js and the host's inline
 * fallback re-exports).
 */
export { stripBinaries, serializePush, merge3InWorker, parseLarge } from '../../../lib/data/syncWorker.js';
