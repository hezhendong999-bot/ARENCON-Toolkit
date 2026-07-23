/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — PUMP CURVE MATH            lib/calc/pumpCurve.js   v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   Pure functions for fire-pump performance curves. No DOM, no globals, no
   Chart.js, no host state — inputs in, numbers out. That is what makes this
   the right first extraction from the Diesel monolith: it can be tested
   exhaustively without booting the app.

   EXTRACTED VERBATIM (S499) from the live Diesel build, part06.js:
     • _interpCurve       — linear interpolation along a measured curve
     • _curveDevOver1pct  — NFPA-style 1% deviation check vs the placard

   These decide what a commissioning report SAYS ABOUT PUMP PERFORMANCE. A
   silent change here does not crash anything — it prints a wrong number on a
   sealed report that goes to an owner and an AHJ. That is precisely the class
   of failure that is invisible in the field until it matters, so the maths is
   pinned by tests (tests/unit/pumpCurve.test.js) rather than by care.

   Behaviour is intentionally IDENTICAL to the monolith, bug-for-bug, including
   the edge cases documented below. This module is a MOVE, not a rewrite; any
   behavioural change belongs in a separate, Mark-approved session.

   ── HOST CONTRACT ─────────────────────────────────────────────────────────
   Loaded as a classic script (Diesel is classic-script throughout) and also
   importable as an ES module for the test runner. Publishes window.PumpCurve.
   The host keeps calling _interpCurve / _curveDevOver1pct by their existing
   names; thin delegates in part06 forward to here, so the ~20 existing call
   sites are untouched.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';


/**
 * Linear interpolation of head (y) at a given flow (x) along a measured curve.
 *
 * @param {Array<{x:number,y:number}>} curve  points, ASSUMED SORTED BY x ASC
 *        (the host builds them that way; this function does not sort)
 * @param {number} flow  the flow to evaluate at
 * @returns {number|null} interpolated y, or null when there is no curve
 *
 * Edge cases, preserved from the original:
 *   • empty / missing curve  → null (NOT 0 — a missing curve must not read as
 *     a real zero-head measurement)
 *   • flow below the first point → clamps to the first y (no extrapolation)
 *   • flow above the last point  → clamps to the last y  (no extrapolation)
 *   • duplicate x values (b.x === a.x) → t = 0, takes the earlier point's y
 *     rather than dividing by zero
 */
function interpCurve(curve, flow) {
  if (!curve || !curve.length) return null;
  if (flow <= curve[0].x) return curve[0].y;
  if (flow >= curve[curve.length - 1].x) return curve[curve.length - 1].y;
  for (var i = 0; i < curve.length - 1; i++) {
    var a = curve[i], b = curve[i + 1];
    if (flow >= a.x && flow <= b.x) {
      var t = (b.x === a.x) ? 0 : (flow - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return curve[curve.length - 1].y;
}

/**
 * Does the adjusted net reading deviate from the placard by more than 1%?
 *
 * @param {number|null} adjNet         adjusted net reading
 * @param {number} pointPlacard        the placard (rated) value at this point
 * @returns {boolean} true only when a real, meaningful deviation exists
 *
 * Deliberately FALSE (not true, not throwing) for null/NaN/non-positive
 * placard: an unknown reading is not a deviation. Flagging "unknown" as a
 * deviation would put false failures on a commissioning report; the report
 * must only assert a deviation it can actually substantiate.
 *
 * Note the comparison is strict (>), so exactly 1.00% is NOT a deviation.
 */
function curveDevOver1pct(adjNet, pointPlacard) {
  if (adjNet == null || isNaN(adjNet) || isNaN(pointPlacard) || pointPlacard <= 0) return false;
  return Math.abs(adjNet - pointPlacard) > pointPlacard * 0.01;
}

var api = {
  interpCurve: interpCurve,
  curveDevOver1pct: curveDevOver1pct,
  VERSION: '1.0.0'
};

/* Loading model matches the rest of lib/**: a classic <script> in the tools
   (Diesel is classic-script throughout), with a guarded CommonJS export so a
   module context can also consume it. NO bare `export` statements — those
   would throw the moment a classic <script> parsed this file, which is exactly
   how a shared module takes a whole tool down. */
if (root) root.PumpCurve = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
