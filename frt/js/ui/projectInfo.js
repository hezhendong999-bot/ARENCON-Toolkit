/**
 * ARENCON FRT v2 — Project Info UI
 * ═════════════════════════════════
 * 
 * Renders and manages the Project Info tab:
 *   - Project fields (number, client, scope, address, dates)
 *   - Auto-format project number
 *   - Smart filename generation
 *   - Header name updates
 *   - Field change handlers → Model mutations
 * 
 * Phase 1 will implement:
 *   - Two-way data binding (fixes P2: AI text not saved to data model)
 *   - Field change → Model.updateProject() → IDB + sync
 *   - Populate fields from Model on render
 */

import { Model } from '../data/model.js';

export const initProjectInfo = {

  /**
   * Render the Project Info panel.
   * Called on tab switch and on data change.
   */
  render() {
    var proj = Model.getProject();
    if (!proj) {
      console.log('[ProjectInfo] No project loaded — showing empty form');
      return;
    }

    // TODO Phase 1: populate all fields from Model
    console.log('[ProjectInfo] render() — stub');
  },

  /**
   * Wire input change handlers for all fields in the panel.
   */
  wireInputs() {
    // TODO Phase 1: addEventListener('input', ...) on all data-field inputs
    // Each handler: read value → Model.updateProject(field, value)
    console.log('[ProjectInfo] wireInputs() — stub');
  }
};
