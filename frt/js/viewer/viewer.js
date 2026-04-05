/**
 * ARENCON FRT v2 — Drawing Viewer
 * ════════════════════════════════
 * 
 * Full-screen drawing viewer with pan/zoom:
 *   - Image display with CSS transform-based pan/zoom
 *   - Touch: pinch-to-zoom, single-finger pan
 *   - Mouse: wheel zoom (cursor-centered), drag pan
 *   - Keyboard: +/- zoom, 0 reset
 *   - Navigation: prev/next drawing
 *   - Pin markers overlay
 *   - Markup canvas overlay (via markup.js)
 * 
 * Phase 4 will replace single-image with tile-based viewer.
 * Phase 5 will replace Canvas 2D markup with WebGL (Pixi.js).
 * 
 * Key constraints:
 *   - Overlay canvas capped at 3M pixels (Samsung Tab A)
 *   - Never use OffscreenCanvas (no Safari/iOS support)
 *   - Escape cancels tool/copy mode only — never closes viewer
 */

export const initViewer = {

  /**
   * Open the drawing viewer for a specific drawing.
   */
  open(drawingId) {
    console.log('[Viewer] open() — stub — drawing:', drawingId);
  },

  /**
   * Close the drawing viewer.
   */
  close() {
    var overlay = document.getElementById('drawing-viewer-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('dv-open');
    console.log('[Viewer] close()');
  }
};
