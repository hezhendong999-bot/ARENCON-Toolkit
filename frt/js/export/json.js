/**
 * ARENCON FRT v2 — JSON Import/Export
 * ════════════════════════════════════
 * 
 * JSON save/load for offline backup and data portability.
 * 
 * Export: Model state → JSON file download
 * Import: JSON file → validate → Model.setProject()
 * 
 * Phase 1 will implement:
 *   - exportJSON() → downloads .json file
 *   - importJSON(file) → validates and loads project
 *   - exportAllProjects() → downloads all projects as single file
 *   - Format backward-compatible with v1 JSON files
 */

import { Model } from '../data/model.js';

export const initJSONExport = {

  /**
   * Export current project as JSON file download.
   */
  exportJSON() {
    console.log('[JSON] exportJSON() — stub');
  },

  /**
   * Import a project from a JSON file.
   * @param {File} file
   */
  async importJSON(file) {
    console.log('[JSON] importJSON() — stub');
  }
};
