/**
 * lib/calc/pumpCurve.js — pump curve maths
 *
 * FIRST DIESEL TEST (S499). These functions decide what a commissioning report
 * says about pump performance. They cannot crash visibly — they just print a
 * wrong number on a sealed report. So the contract is pinned here, including
 * the edge cases, so that a future refactor of part06 cannot quietly change
 * what a report asserts.
 *
 * Every expectation below was derived from the behaviour of the LIVE monolith
 * code at extraction time, not from what the maths "should" be. Where the
 * original has a quirk, the test pins the quirk and says so.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* The module loads as a classic <script> in the tools (house pattern for
   lib/**), so it has no ES exports to import. Load it the same way the browser
   does — evaluate it against a window-like root — which also proves the
   classic loading path itself works, not just the maths. */
const src = fs.readFileSync(
  path.resolve(__dirname, '../../lib/calc/pumpCurve.js'), 'utf8');
const root = {};
new Function('window', 'module', src)(root, undefined);
const { interpCurve, curveDevOver1pct } = root.PumpCurve;

describe('module loading (classic <script> path)', () => {
  it('publishes window.PumpCurve with both functions and a version', () => {
    expect(typeof root.PumpCurve).toBe('object');
    expect(typeof interpCurve).toBe('function');
    expect(typeof curveDevOver1pct).toBe('function');
    expect(root.PumpCurve.VERSION).toBe('1.0.0');
  });
});

describe('interpCurve — linear interpolation along a measured curve', () => {
  const curve = [
    { x: 0,    y: 150 },   // churn
    { x: 1000, y: 140 },   // rated
    { x: 1500, y: 105 }    // 150% / overload
  ];

  it('returns an exact point value when the flow lands on a measured point', () => {
    expect(interpCurve(curve, 0)).toBe(150);
    expect(interpCurve(curve, 1000)).toBe(140);
    expect(interpCurve(curve, 1500)).toBe(105);
  });

  it('interpolates linearly between two measured points', () => {
    // halfway between 0 and 1000 → halfway between 150 and 140
    expect(interpCurve(curve, 500)).toBeCloseTo(145, 10);
    // halfway between 1000 and 1500 → halfway between 140 and 105
    expect(interpCurve(curve, 1250)).toBeCloseTo(122.5, 10);
  });

  it('interpolates correctly at an arbitrary non-midpoint flow', () => {
    // 250/1000 of the way from 150 → 140  ==  150 - 2.5
    expect(interpCurve(curve, 250)).toBeCloseTo(147.5, 10);
  });

  // ── Clamping: the original deliberately does NOT extrapolate. A fire pump
  //    curve outside the measured range is not evidence, so the report must
  //    not invent one.
  it('clamps below the first point instead of extrapolating', () => {
    expect(interpCurve(curve, -500)).toBe(150);
  });

  it('clamps above the last point instead of extrapolating', () => {
    expect(interpCurve(curve, 99999)).toBe(105);
  });

  // ── Missing data must read as "no answer", never as zero.
  it('returns null (not 0) for an empty curve', () => {
    expect(interpCurve([], 500)).toBeNull();
  });

  it('returns null for a missing/undefined curve', () => {
    expect(interpCurve(null, 500)).toBeNull();
    expect(interpCurve(undefined, 500)).toBeNull();
  });

  it('handles a single-point curve by clamping to that point', () => {
    expect(interpCurve([{ x: 700, y: 133 }], 0)).toBe(133);
    expect(interpCurve([{ x: 700, y: 133 }], 700)).toBe(133);
    expect(interpCurve([{ x: 700, y: 133 }], 5000)).toBe(133);
  });

  // ── Quirk pinned deliberately: duplicate x values would divide by zero.
  //    The original guards with t = 0, taking the EARLIER point's y.
  it('does not divide by zero when two points share an x (takes earlier y)', () => {
    const dup = [{ x: 0, y: 150 }, { x: 800, y: 140 }, { x: 800, y: 120 }, { x: 1200, y: 100 }];
    const v = interpCurve(dup, 800);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(140);
  });

  it('never returns NaN for any flow across the curve range', () => {
    for (let f = -100; f <= 1600; f += 37) {
      expect(Number.isNaN(interpCurve(curve, f))).toBe(false);
    }
  });

  it('is monotonically non-increasing for a non-increasing curve', () => {
    // A real pump curve falls as flow rises; interpolation must not introduce
    // a rise, which would show as an impossible performance bump on a report.
    let prev = Infinity;
    for (let f = 0; f <= 1500; f += 50) {
      const v = interpCurve(curve, f);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });
});

describe('curveDevOver1pct — 1% deviation vs placard', () => {
  it('is false when the reading matches the placard exactly', () => {
    expect(curveDevOver1pct(100, 100)).toBe(false);
  });

  it('is false just under 1% deviation, either direction', () => {
    expect(curveDevOver1pct(100.9, 100)).toBe(false);
    expect(curveDevOver1pct(99.1, 100)).toBe(false);
  });

  // Strict > in the original: exactly 1.00% is NOT a deviation.
  it('is false at EXACTLY 1% (boundary is exclusive)', () => {
    expect(curveDevOver1pct(101, 100)).toBe(false);
    expect(curveDevOver1pct(99, 100)).toBe(false);
  });

  it('is true just over 1% deviation, either direction', () => {
    expect(curveDevOver1pct(101.5, 100)).toBe(true);
    expect(curveDevOver1pct(98.5, 100)).toBe(true);
  });

  it('is symmetric — over and under read the same', () => {
    expect(curveDevOver1pct(105, 100)).toBe(curveDevOver1pct(95, 100));
  });

  // ── Unknown is NOT a deviation. Flagging unknown as a failure would put
  //    false deficiencies on a report that goes to an owner and an AHJ.
  it('is false for a null reading', () => {
    expect(curveDevOver1pct(null, 100)).toBe(false);
  });

  it('is false for NaN inputs', () => {
    expect(curveDevOver1pct(NaN, 100)).toBe(false);
    expect(curveDevOver1pct(100, NaN)).toBe(false);
  });

  it('is false for a zero or negative placard (no meaningful percentage)', () => {
    expect(curveDevOver1pct(50, 0)).toBe(false);
    expect(curveDevOver1pct(50, -10)).toBe(false);
  });

  it('scales the threshold with the placard, not a fixed absolute', () => {
    // 5 psi off a 1000 psi placard is 0.5% → not a deviation
    expect(curveDevOver1pct(1005, 1000)).toBe(false);
    // the same 5 psi off a 100 psi placard is 5% → a deviation
    expect(curveDevOver1pct(105, 100)).toBe(true);
  });

  it('is false for undefined (treated as unknown, via == null)', () => {
    expect(curveDevOver1pct(undefined, 100)).toBe(false);
  });
});
