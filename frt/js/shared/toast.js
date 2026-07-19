/**
 * ARENCON FRT v2 — Toast Notifications  →  SHIM
 * ══════════════════════════════════════════════
 * S490d (library audit step 1): FRT no longer implements toasts. This file is
 * a thin re-export of the shared engine at lib/shared/toast.js, exactly the
 * pattern already proven by frt/js/ui/cameraBurst.js.
 *
 * The shim exists so FRT's ~200 existing `import { toast } from '.../toast.js'`
 * call sites keep working unchanged — the import path is unchanged, only the
 * implementation moved. Do NOT re-add a local implementation here: if this file
 * ever grows a function body again, the fork is back.
 *
 * The shared version is a true merge of both former forks — it keeps FRT's
 * field-tuned appearance and motion, and gains the self-creating container
 * (so it no longer silently no-ops when #toast-container is absent).
 */

export { toast } from '../../../lib/shared/toast.js';
