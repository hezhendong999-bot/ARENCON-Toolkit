/**
 * ARENCON FRT v2 — Authentication  →  SHIM
 * ═════════════════════════════════════════
 * S490d (library audit step 1): FRT no longer implements auth. The shared
 * engine at lib/shared/auth.js was extracted from THIS file at S445 and the
 * two had not diverged (header comment only — verified by diff before this
 * conversion). Behaviour is identical, including the S91/S395
 * 401→silent-refresh→retry path.
 *
 * 11 FRT call sites import { Auth } from this path; the path is unchanged,
 * only the implementation moved. Do NOT re-add a function body here.
 */

export { Auth } from '../../../lib/shared/auth.js';
