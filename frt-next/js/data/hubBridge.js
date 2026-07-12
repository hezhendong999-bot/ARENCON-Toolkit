/**
 * ARENCON FRT v2 — Normalized Schema Bridge
 * ═════════════════════════════════════════════════════════════════════════
 *
 * S126 Phase E pre-flight (skeleton — bodies filled in Phase 7-A and 7-B).
 *
 * This module is the bridge between the legacy tool_data blob and the
 * normalized frt_* tables (created by migrations/001_normalized_frt.sql).
 * Every function here is stubbed and throws if called — the goal of the
 * skeleton is to LOCK IN the API surface so that future 7-A and 7-B
 * sessions agree on names, parameters, return shapes, and data flow.
 *
 * ─── Data flow shape ──────────────────────────────────────────────────
 *
 * Phase 7-A (Hub side, read):
 *   readNormalizedProject(projectId)    → decomposed rows from frt_* tables
 *   reassembleProjectBlob(rows)         → legacy-shaped project blob
 *   hasNormalizedRows(projectId)        → boolean (drives fallback decision)
 *
 * Phase 7-B (FRT side, write-through):
 *   decomposeProjectBlob(blob)          → array of rows for each frt_* table
 *   writeNormalizedProject(blob, opts)  → upserts decomposed rows in tx
 *   readMergedProject(projectId)        → reads normalized; falls back to tool_data
 *
 * Phase 7-C (cutover):
 *   isLegacyToolDataWriteEnabled()      → reads runtime flag
 *   setLegacyToolDataWriteEnabled(bool) → flips runtime flag
 *
 * ─── Important architectural notes (locked tonight) ───────────────────
 *
 * 1. drawing.id stays as text ("dwg_..._pgN_xxxx"), NOT uuid. The
 *    pre-existing string id is referenced from markupR2 keys, pin
 *    metadata, photo.drawing_id pointers, and exported JSON. Changing it
 *    would break every existing reference.
 *
 * 2. photo.id and contractor.id are also text for the same reason.
 *
 * 3. frt_projects.id IS a fresh uuid — the legacy tool_data row id
 *    (also uuid) is NOT reused. The frt_projects row references
 *    projects.id via project_id + carries an instance_number, mirroring
 *    the existing tool_data shape.
 *
 * 4. Deficiencies stay INLINE inside frt_contractors.deficiencies JSONB.
 *    Same for observations inside each deficiency. Reasoning: nearly
 *    every read of a contractor reads its deficiencies too; breaking
 *    them out adds joins for every defic render with no query benefit.
 *
 * 5. Photos get a dedicated table with hoisted taken_at column for
 *    cross-project date-range queries. meta JSONB holds EXIF + dimensions
 *    + filename catchall.
 *
 * 6. markupR2 reference fields are hoisted as columns on frt_drawings
 *    (markup_r2_key, markup_r2_url, markup_count, markup_bytes,
 *    markup_updated_at, markup_inspector_id) so cross-project queries
 *    like "total markup size across all my projects" don't require JSONB
 *    drilling.
 *
 * 7. The conflict-detection mechanism (If-Match: updated_at) MUST work
 *    on frt_projects too. The trigger frt_touch_updated_at handles this
 *    server-side; the bridge just needs to read updated_at on every
 *    read and send If-Match on every write.
 *
 * 8. Atomic multi-row writes: Phase 7-B will use a SECURITY DEFINER RPC
 *    (not yet created) to wrap the multi-table insert in a single
 *    transaction. Bridge functions return promises that resolve only
 *    after the RPC commits. Until the RPC exists, writes throw.
 */

import { Auth } from '../shared/auth.js';

// ═════════════════════════════════════════════════════════════════════════
// Module state — runtime feature flags
// ═════════════════════════════════════════════════════════════════════════

/**
 * S126 Phase E + future Phase 7-C — runtime toggle. While true, FRT
 * pushes BOTH to tool_data (legacy) AND to frt_* tables (normalized).
 * 7-C will flip this to false after burn-in.
 *
 * Default true so that any FRT version with 7-B applied stays
 * back-compat with unmigrated Hub clients.
 */
var _legacyToolDataWriteEnabled = true;

/**
 * Whether normalized reads are even attempted. False during early
 * rollout when the tables exist but Phase 7-A hasn't shipped yet —
 * reading would just fall through to tool_data anyway, so skipping the
 * RTT saves latency.
 */
var _normalizedReadsEnabled = false;

// ═════════════════════════════════════════════════════════════════════════
// Phase 7-A — Hub-side reads
// ═════════════════════════════════════════════════════════════════════════

/**
 * Read normalized rows for one project + reassemble into legacy blob shape.
 * Resolves null if no normalized rows exist for this project.
 *
 * @param {string} projectId   uuid of the parent project
 * @returns {Promise<Object|null>}  legacy-shaped project blob, or null
 */
export function readNormalizedProject(projectId) {
  throw new Error('hubBridge.readNormalizedProject: NOT YET IMPLEMENTED (Phase 7-A)');
}

/**
 * Cheap existence check — does this project have any rows in frt_projects?
 * Used by Hub to decide between normalized and tool_data fallback without
 * paying the cost of a full read first.
 *
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
export function hasNormalizedRows(projectId) {
  throw new Error('hubBridge.hasNormalizedRows: NOT YET IMPLEMENTED (Phase 7-A)');
}

/**
 * Convert query results from the five frt_* tables back into the legacy
 * blob shape that the existing client code expects internally. This is
 * the inverse of decomposeProjectBlob().
 *
 * Input shape: { project: <row>, drawings: [<rows>], photos: [<rows>],
 *                contractors: [<rows>], generalDeficiencies: [<rows>] }
 *
 * Returns the legacy { projectInfo, drawings, photos, contractors, ... }
 * shape that Model.setProject(blob) accepts.
 *
 * Round-trip property: decompose(reassemble(rows)) === rows (modulo
 * insertion order and computed fields). Future 7-A and 7-B sessions
 * must preserve this invariant or sync breaks.
 *
 * @param {Object} rows
 * @returns {Object}  legacy project blob
 */
export function reassembleProjectBlob(rows) {
  throw new Error('hubBridge.reassembleProjectBlob: NOT YET IMPLEMENTED (Phase 7-A)');
}

// ═════════════════════════════════════════════════════════════════════════
// Phase 7-B — FRT-side writes
// ═════════════════════════════════════════════════════════════════════════

/**
 * Decompose a legacy project blob into per-table row payloads ready for
 * upsert. Inverse of reassembleProjectBlob.
 *
 * Output shape:
 *   {
 *     project:               { id, project_id, instance_number, status, ... },
 *     drawings:              [{ id, frt_project_id, name, ... }, ...],
 *     photos:                [{ id, frt_project_id, scope, ... }, ...],
 *     contractors:           [{ id, frt_project_id, name, deficiencies, ... }, ...],
 *     generalDeficiencies:   [{ id, frt_project_id, observations, ... }, ...]
 *   }
 *
 * @param {Object} blob   legacy project blob (Model.getProject() result)
 * @returns {Object}      decomposed row payloads
 */
export function decomposeProjectBlob(blob) {
  throw new Error('hubBridge.decomposeProjectBlob: NOT YET IMPLEMENTED (Phase 7-B)');
}

/**
 * Upsert all decomposed rows for a project in a single transaction.
 * Uses a SECURITY DEFINER RPC named `frt_upsert_project` (not yet
 * created — Phase 7-B adds it as a follow-up migration).
 *
 * Options:
 *   - ifMatch: string  → updated_at value for optimistic concurrency
 *                        (mirrors tool_data's If-Match header pattern)
 *
 * Returns the new updated_at for the next conflict check.
 *
 * @param {Object} blob   legacy project blob
 * @param {Object} opts   { ifMatch?: string }
 * @returns {Promise<{updated_at: string}>}
 */
export function writeNormalizedProject(blob, opts) {
  throw new Error('hubBridge.writeNormalizedProject: NOT YET IMPLEMENTED (Phase 7-B). ' +
                  'Requires the frt_upsert_project RPC, not yet created.');
}

/**
 * Read with fallback: try normalized first; if no rows, fall back to
 * legacy tool_data. Used by FRT pull during the cutover window so an
 * FRT instance never fails to load a project just because Hub/another
 * FRT hasn't write-through'd to normalized yet.
 *
 * @param {string} projectId
 * @returns {Promise<{blob: Object, source: 'normalized' | 'tool_data' | null}>}
 */
export function readMergedProject(projectId) {
  throw new Error('hubBridge.readMergedProject: NOT YET IMPLEMENTED (Phase 7-A + 7-B)');
}

// ═════════════════════════════════════════════════════════════════════════
// Phase 7-C — Cutover toggles
// ═════════════════════════════════════════════════════════════════════════

/**
 * Whether the FRT push should ALSO write to legacy tool_data. True
 * during the cutover window for back-compat. Phase 7-C will flip this
 * to false once the wild population has migrated.
 */
export function isLegacyToolDataWriteEnabled() {
  return _legacyToolDataWriteEnabled;
}

/**
 * Flip the legacy-write flag. Persistence is intentionally NOT included
 * in this skeleton — Phase 7-C will decide whether the toggle is a
 * client-local setting (localStorage) or a server-side feature flag
 * (Supabase app_settings table).
 */
export function setLegacyToolDataWriteEnabled(enabled) {
  _legacyToolDataWriteEnabled = !!enabled;
  console.log('[hubBridge] legacy tool_data write:', _legacyToolDataWriteEnabled ? 'ENABLED' : 'DISABLED');
}

/**
 * Whether normalized reads should even be attempted by Hub / FRT.
 * False during initial rollout to avoid wasted RTTs when the tables
 * exist but no rows have been written yet.
 */
export function isNormalizedReadsEnabled() {
  return _normalizedReadsEnabled;
}

export function setNormalizedReadsEnabled(enabled) {
  _normalizedReadsEnabled = !!enabled;
  console.log('[hubBridge] normalized reads:', _normalizedReadsEnabled ? 'ENABLED' : 'DISABLED');
}

// ═════════════════════════════════════════════════════════════════════════
// Diagnostic surface
// ═════════════════════════════════════════════════════════════════════════

/**
 * Diagnostic snapshot for the Phase D diagnostics module. Exposes the
 * runtime flag state so Mark can see in console whether the bridge is
 * active or dormant on his current build.
 */
export function getBridgeState() {
  return {
    skeletonOnly: true,            // flip to false in 7-A/7-B
    legacyToolDataWriteEnabled: _legacyToolDataWriteEnabled,
    normalizedReadsEnabled: _normalizedReadsEnabled,
    workerEndpoint: Auth && Auth.SUPABASE_URL || null,
    schemaVersion: '001_normalized_frt'
  };
}

// Expose for console diagnostics
if (typeof window !== 'undefined') {
  window._frtHubBridge = {
    getBridgeState: getBridgeState,
    isLegacyToolDataWriteEnabled: isLegacyToolDataWriteEnabled,
    setLegacyToolDataWriteEnabled: setLegacyToolDataWriteEnabled,
    isNormalizedReadsEnabled: isNormalizedReadsEnabled,
    setNormalizedReadsEnabled: setNormalizedReadsEnabled
  };
}
