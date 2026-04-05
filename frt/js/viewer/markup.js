/**
 * ARENCON FRT v2 — Markup Engine
 * ═══════════════════════════════
 * 
 * Drawing markup tools (Canvas 2D, future WebGL):
 *   - Pen (lineTo only — NEVER quadraticCurveTo)
 *   - Highlighter (offscreen composite at 0.35 opacity — never stack)
 *   - Eraser
 *   - Shapes: rect, circle, arrow, line, triangle, cloud, polyline
 *   - Fill variants: fillrect, fillcircle
 *   - Text tool
 *   - Selection + move + resize
 *   - Copy/paste
 *   - Undo/redo stack
 * 
 * Key constraints:
 *   - Canvas buffer capped at 3M pixels (Samsung), 16M (iOS), 25M (desktop)
 *   - NEVER auto-select a shape after drawing — tool stays active
 *   - Shape preview uses setTransform(1,0,0,1,0,0) identity only
 *   - loadMarkupData() only on FIRST canvas allocation (canvas._markupLoaded flag)
 */

export const initMarkup = {

  /**
   * Initialize markup on a canvas element.
   */
  init(canvas, drawingId) {
    console.log('[Markup] init() — stub — drawing:', drawingId);
  }
};
