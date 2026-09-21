/* ═══ frt/js/ui/versionNav.js ══════════════════════════════════════════════════
   THE NAVIGATOR MOVED. It lives at lib/ui/versionNav.js so the pump tools can
   mount the same strip (S732 — versioning port, step 5). This file is a
   re-export and nothing else: ONE implementation. Existing FRT imports of this
   path keep working; Lane A may repoint and delete this at leisure. */
export * from '../../../lib/ui/versionNav.js';
