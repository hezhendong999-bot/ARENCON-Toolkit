/* ═══ frt/js/data/versionSeq.js ═══════════════════════════════════════════════
   THE ENGINE MOVED. The numbering engine now lives at lib/data/versionSeq.js
   so that the pump tools can run the same grammar (S732 — versioning port).
   This file is a re-export and nothing else: there is ONE implementation.
   Existing FRT imports of this path keep working unchanged. Lane A may
   repoint them to lib/ directly at any convenient moment and delete this. */
export * from '../../../lib/data/versionSeq.js';
