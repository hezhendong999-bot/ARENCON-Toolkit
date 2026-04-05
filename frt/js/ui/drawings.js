/**
 * ARENCON FRT v2 — Drawings UI
 * ═════════════════════════════
 * 
 * Renders and manages the Drawings tab:
 *   - Drawing card gallery (grid layout)
 *   - Folder management (create, rename, delete)
 *   - Drawing upload (image + PDF with pdf.js)
 *   - Card thumbnails from IDB or R2
 *   - Pin badges on cards
 *   - Drag & drop upload
 *   - Multi-select for batch operations
 *   - Compact mode toggle
 *   - Search/filter
 * 
 * PDF upload handler uses the sacred recursive go(pg) pattern.
 * NEVER rewrite the upload handler — surgical changes only.
 */

import { Model } from '../data/model.js';

export const initDrawings = {

  render() {
    console.log('[Drawings] render() — stub');
  }
};
