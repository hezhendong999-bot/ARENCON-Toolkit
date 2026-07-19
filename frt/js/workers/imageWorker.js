/**
 * ARENCON FRT v2 — Image Compression Worker  →  SHIM
 * ═══════════════════════════════════════════════════
 * S490d (library audit step 1): the real worker is lib/workers/imageWorker.js
 * (byte-identical to the former FRT copy minus a header comment — verified by
 * diff). The shared ImageWorkerHost now spawns the LIB worker directly, so at
 * runtime nothing constructs this file any more.
 *
 * This file survives as a re-export ONLY because
 * frt/tests/unit/imageWorker.test.js imports { calcResize } from this path.
 * If that test is ever repointed at lib/, this file can be deleted.
 */

export * from '../../../lib/workers/imageWorker.js';
