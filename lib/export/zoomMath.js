/* ARENCON shared chrome — pure zoom math (S460 contract).
 * Single source of truth for export-chrome counter-scaling.
 * Field-derived rules:
 *  • pz = outerWidth/innerWidth captures BOTH desktop page-zoom and iOS
 *    pinch (iOS innerWidth tracks the visual viewport).
 *  • visualViewport.scale is multiplied in ONLY when the visual viewport
 *    is genuinely narrower than the layout viewport (desktop pinch on
 *    touch screens); multiplying it on iOS double-counts the zoom
 *    (S460 field bug: pill blown to ~3x at page-fit).
 * Harness-covered in lib/tests/engine2.test.mjs. */
export function zoomFrom(m){
  var pz = 1;
  if (m.outerWidth && m.innerWidth) pz = m.outerWidth / m.innerWidth;
  if (!isFinite(pz) || pz <= 0) pz = 1;
  var z = pz;
  if (m.vvWidth && m.vvScale && m.vvWidth < m.innerWidth - 2) z = pz * m.vvScale;
  if (z < 0.3) z = 0.3; if (z > 6) z = 6;
  return Math.round(z * 20) / 20;
}
