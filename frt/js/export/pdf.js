/**
 * ARENCON FRT v2 — PDF Export
 * ════════════════════════════
 * 
 * PDF report generation — same output as current FRT.
 * 
 * Report types:
 *   - Deficiency Report: deficiencies, photos, comments
 *   - Field Review Report: mini-maps + drawing appendix
 * 
 * PDF standard (Style Guide §29-30):
 *   - Paper-like preview: white 8.5×11" pages on #525659 gray background
 *   - Paginated via JS measure + bin-pack (PAGE_H=912, CONT_H=85)
 *   - Export bar: fixed #2C4770 bar with Export PDF, hint, Close
 *   - @media print collapses wrappers, hides UI
 * 
 * Canvas caps for mobile:
 *   - _renderDrawingWithSinglePin: 3M pixels max
 *   - _renderDrawingWithPins: 5M pixels max
 * 
 * Phase 3 will copy current PDF rendering logic with zero changes.
 * Same fonts, same layout, same output — pixel-identical.
 */

export const initPDFExport = {

  /**
   * Generate and show PDF report.
   * @param {string} type - 'plain' (deficiency) or 'field' (field review)
   * @param {object} options - { contractorFilter, showClosed, finalComm }
   */
  generate(type, options) {
    console.log('[PDF] generate() — stub — type:', type);
  }
};
