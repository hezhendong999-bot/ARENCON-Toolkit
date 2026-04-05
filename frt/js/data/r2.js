/**
 * ARENCON FRT v2 — R2 Storage
 * ════════════════════════════
 * 
 * Cloudflare R2 via Worker proxy for photos and drawings.
 * 
 * Key rules (from Project Knowledge):
 *   - GET requests: NEVER require auth (public read)
 *   - PUT/DELETE: require valid Supabase auth token via Worker
 *   - R2 key format: photos/{projectId}/frt/{type}/{filename}
 *   - List API path: /list/{projectId}/{tool}/{type}/
 *   - Content-hash or UUID filenames (v2 eliminates filename mismatch)
 * 
 * Phase 1 will implement:
 *   - upload(projectId, type, blob, filename) → r2Key, r2Url
 *   - download(r2Url) → blob
 *   - list(projectId, type) → [{ key, url, size }]
 *   - delete(r2Key, authToken)
 *   - Auth token refresh before upload (fixes P1)
 */

const R2_WORKER = 'https://arencon-r2-worker.hezhendong999.workers.dev';

export const R2 = {

  /**
   * Upload a blob to R2.
   * Returns { r2Key, r2Url } on success, null on failure.
   */
  async upload(projectId, type, blob, filename, authToken) {
    // TODO Phase 1
    console.log('[R2] upload() — stub');
    return null;
  },

  /**
   * Download a file from R2 by URL.
   * GET requests don't require auth.
   */
  async download(r2Url) {
    // TODO Phase 1
    console.log('[R2] download() — stub');
    return null;
  },

  /**
   * List files in R2 for a project and type.
   */
  async list(projectId, type) {
    // TODO Phase 1
    console.log('[R2] list() — stub');
    return [];
  },

  /**
   * Delete a file from R2.
   * Requires auth token.
   */
  async del(r2Key, authToken) {
    // TODO Phase 1
    console.log('[R2] del() — stub');
    return false;
  },

  /**
   * Generate a UUID-based filename (eliminates mismatch bug).
   */
  generateFilename(extension) {
    var uuid = crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    return uuid + '.' + (extension || 'jpg');
  }
};
