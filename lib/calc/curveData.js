/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — PUMP CURVE DATA        lib/calc/curveData.js      v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   The PURE core of Diesel's performance-curve charting: turning measured test
   rows into the plotted curve, and applying the relief/pressure-reducing caps
   that clip it. No DOM, no Chart.js, no globals — data in, points out.

   WHY ONLY THIS MUCH
   Of the ~35 chart functions in the Diesel monolith, most are Chart.js
   instance wiring and dark-mode restyling: they read the DOM, mutate live
   chart objects, and are meaningless outside a browser. Extracting those would
   move code without making it testable or sharable. What IS worth extracting
   is the maths that decides WHERE THE CURVE GOES — because that is what a
   commissioning report asserts about pump performance, and it is invisible
   when wrong.

   EXTRACTED (S499) from ARENCON_Diesel_Fire_Pump_Commissioning.html:
     • _measuredDischargePts  — rows -> sorted {x:flow, y:discharge} points
     • _goldenCurve           — the same points, clipped at the lowest cap,
                                with an interpolated crossing point inserted
                                where the curve crosses the cap

   The host versions read globals (stdData/pldData) and the DOM (cap inputs).
   Those reads STAY in the host; this module takes the values as arguments.
   That is the whole reason it can be tested at all.

   Behaviour is identical to the monolith, bug-for-bug. This is a MOVE.

   ── HOST CONTRACT ─────────────────────────────────────────────────────────
   Classic <script> (house pattern for lib/**), publishes window.CurveData.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/**
 * Build the measured discharge curve from test rows.
 *
 * @param {Array<Object>} rows     stdData or pldData
 * @param {boolean} isPld          true for the 7-pt (pld) tab
 * @param {Function} [rowFlow]     host's flow accessor; falls back to r.flow
 * @returns {Array<{x:number,y:number}>} sorted ascending by flow
 *
 * Rows with an unreadable flow OR discharge are DROPPED, not zeroed — a
 * missing reading must never plot as a real 0 on a commissioning report.
 * The pld tab prefers r.dis_w (witnessed) and falls back to r.discharge.
 */
function measuredDischargePts(rows, isPld, rowFlow) {
  var src = Array.isArray(rows) ? rows : [];
  return src.map(function (r) {
    if (!r) return null;
    var f = (typeof rowFlow === 'function') ? rowFlow(r) : parseFloat(r.flow);
    var d = parseFloat(isPld ? (r.dis_w != null ? r.dis_w : r.discharge) : r.discharge);
    if (isNaN(f) || isNaN(d)) return null;
    return { x: f, y: d };
  }).filter(Boolean).sort(function (a, b) { return a.x - b.x; });
}

/**
 * Clip a measured curve at the lowest active cap (relief / pressure-reducing).
 *
 * @param {Array<{x:number,y:number}>} pts   measured points, sorted by x
 * @param {number|null} cap                  lowest active cap, or null for none
 * @returns {Array<{x:number,y:number}>}     capped curve, sorted by x
 *
 * Where the curve crosses the cap between two measured points, an interpolated
 * point is inserted AT the crossing so the plotted line bends at the cap rather
 * than cutting the corner. Without it the chart would show the curve leaving
 * the cap at the wrong flow — a visible misstatement of where the pump was
 * actually limited.
 *
 * Preserved edge cases from the original:
 *   • no points        → []
 *   • cap == null      → points passed through uncapped
 *   • y === y2         → no crossing inserted (would divide by zero)
 */
function goldenCurve(pts, cap) {
  var dis = Array.isArray(pts) ? pts : [];
  if (!dis.length) return [];
  var out = [];
  for (var i = 0; i < dis.length; i++) {
    var x = dis[i].x, y = dis[i].y;
    out.push({ x: x, y: (cap != null) ? Math.min(y, cap) : y });
    if (cap != null && i < dis.length - 1) {
      var x2 = dis[i + 1].x, y2 = dis[i + 1].y;
      if ((y > cap) !== (y2 > cap) && y !== y2) {
        var t = (cap - y) / (y2 - y);
        var xc = x + t * (x2 - x);
        out.push({ x: xc, y: cap });
      }
    }
  }
  return out.sort(function (a, b) { return a.x - b.x; });
}

var api = {
  measuredDischargePts: measuredDischargePts,
  goldenCurve: goldenCurve,
  VERSION: '1.0.0'
};

if (root) root.CurveData = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
