/**
 * ARENCON FRT v2 — Sync Engine
 * ════════════════════════════
 * 
 * Incremental sync to Supabase. Replaces the monolithic
 * _collectFullState() → tool_data blob approach.
 * 
 * Phase 1 will implement:
 *   - syncQueue: tracks pending changes per entity
 *   - flush(): batches and pushes pending changes (every 2s or on demand)
 *   - pull(projectId): fetches changes since lastSync timestamp
 *   - poll(): lightweight heartbeat (every 15s)
 *   - Conflict resolution: newer timestamp wins per-field
 *   - Auth token auto-refresh before expiry (fixes P1)
 * 
 * Supabase tables (new, per-entity):
 *   frt_deficiencies, frt_drawings, frt_markup, frt_photos
 *   (existing tool_data retained for backward compat during migration)
 */

const SUPABASE_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';

export const SyncEngine = {

  /**
   * Pull all data for a project from Supabase.
   * Used on initial load and after reconnect.
   */
  async pull(projectId) {
    // TODO Phase 1: fetch from new per-entity tables
    // Fallback: fetch from tool_data blob (backward compat)
    console.log('[Sync] pull() — stub — projectId:', projectId);
  },

  /**
   * Flush pending changes to Supabase.
   * Reads syncQueue from IDB, batches by entity type, pushes via UPSERT.
   */
  async flush() {
    // TODO Phase 1
    console.log('[Sync] flush() — stub');
  },

  /**
   * Lightweight poll for remote changes.
   * Only fetches records with updated_at > lastPoll.
   */
  async poll() {
    // TODO Phase 1
    console.log('[Sync] poll() — stub');
  },

  /**
   * Start the sync heartbeat timer.
   */
  startHeartbeat(intervalMs) {
    // TODO Phase 1
    console.log('[Sync] startHeartbeat() — stub — interval:', intervalMs);
  },

  /**
   * Stop the sync heartbeat.
   */
  stopHeartbeat() {
    // TODO Phase 1
    console.log('[Sync] stopHeartbeat() — stub');
  }
};
