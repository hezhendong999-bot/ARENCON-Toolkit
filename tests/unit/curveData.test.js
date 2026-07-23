/**
 * lib/calc/curveData.js — the maths that decides where the performance curve goes.
 *
 * A wrong point here does not crash anything. It draws a pump curve that
 * misstates what the pump actually did, on a sealed commissioning report.
 * These tests pin the contract, including the edge cases the original handles
 * deliberately (dropped unreadable readings, cap-crossing interpolation).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../../lib/calc/curveData.js'), 'utf8');
const root = {};
new Function('window', 'module', src)(root, undefined);
const { measuredDischargePts, goldenCurve } = root.CurveData;

describe('module loading (classic <script> path)', () => {
  it('publishes window.CurveData', () => {
    expect(typeof root.CurveData).toBe('object');
    expect(root.CurveData.VERSION).toBe('1.0.0');
  });
});

describe('measuredDischargePts — rows to plotted points', () => {
  it('maps flow/discharge into {x,y} points', () => {
    const rows = [{ flow: 0, discharge: 150 }, { flow: 1000, discharge: 140 }];
    expect(measuredDischargePts(rows, false)).toEqual([
      { x: 0, y: 150 }, { x: 1000, y: 140 }
    ]);
  });

  it('sorts by flow ascending even when rows are entered out of order', () => {
    const rows = [{ flow: 1500, discharge: 105 }, { flow: 0, discharge: 150 },
                  { flow: 1000, discharge: 140 }];
    expect(measuredDischargePts(rows, false).map(p => p.x)).toEqual([0, 1000, 1500]);
  });

  // ── A missing reading must NEVER become a plotted zero. That would draw a
  //    pump collapsing to no pressure — a false failure on a real report.
  it('DROPS rows with an unreadable discharge (never plots them as 0)', () => {
    const rows = [{ flow: 0, discharge: 150 }, { flow: 1000, discharge: '' },
                  { flow: 1500, discharge: 105 }];
    const pts = measuredDischargePts(rows, false);
    expect(pts.length).toBe(2);
    expect(pts.every(p => p.y !== 0)).toBe(true);
  });

  it('DROPS rows with an unreadable flow', () => {
    const rows = [{ flow: '', discharge: 150 }, { flow: 1000, discharge: 140 }];
    expect(measuredDischargePts(rows, false)).toEqual([{ x: 1000, y: 140 }]);
  });

  it('handles empty / missing / null row sets without throwing', () => {
    expect(measuredDischargePts([], false)).toEqual([]);
    expect(measuredDischargePts(null, false)).toEqual([]);
    expect(measuredDischargePts(undefined, false)).toEqual([]);
    expect(measuredDischargePts([null, undefined], false)).toEqual([]);
  });

  it('pld tab prefers the witnessed value (dis_w) over discharge', () => {
    const rows = [{ flow: 500, discharge: 120, dis_w: 118 }];
    expect(measuredDischargePts(rows, true)).toEqual([{ x: 500, y: 118 }]);
  });

  it('pld tab falls back to discharge when dis_w is absent', () => {
    const rows = [{ flow: 500, discharge: 120 }];
    expect(measuredDischargePts(rows, true)).toEqual([{ x: 500, y: 120 }]);
  });

  it('pld tab treats dis_w of 0 as a real reading, not a missing one', () => {
    // `dis_w != null` in the original — 0 is a value, not an absence.
    const rows = [{ flow: 500, discharge: 120, dis_w: 0 }];
    expect(measuredDischargePts(rows, true)).toEqual([{ x: 500, y: 0 }]);
  });

  it('uses the host rowFlow accessor when supplied', () => {
    const rows = [{ computedFlow: 750, discharge: 130 }];
    const pts = measuredDischargePts(rows, false, r => r.computedFlow);
    expect(pts).toEqual([{ x: 750, y: 130 }]);
  });

  it('parses numeric strings the way the DOM supplies them', () => {
    const rows = [{ flow: '1000', discharge: '140.5' }];
    expect(measuredDischargePts(rows, false)).toEqual([{ x: 1000, y: 140.5 }]);
  });
});

describe('goldenCurve — clipping at the lowest active cap', () => {
  const curve = [{ x: 0, y: 150 }, { x: 1000, y: 140 }, { x: 1500, y: 105 }];

  it('passes the curve through untouched when there is no cap', () => {
    expect(goldenCurve(curve, null)).toEqual(curve);
  });

  it('clips every point above the cap down to the cap', () => {
    const out = goldenCurve(curve, 120);
    expect(out.every(p => p.y <= 120)).toBe(true);
  });

  it('leaves points below the cap untouched', () => {
    const out = goldenCurve(curve, 120);
    const last = out.find(p => p.x === 1500);
    expect(last.y).toBe(105);
  });

  // ── The crossing point is the whole reason this function exists: without it
  //    the plotted line cuts the corner and shows the pump leaving the cap at
  //    the wrong flow.
  it('inserts an interpolated point exactly where the curve crosses the cap', () => {
    const out = goldenCurve(curve, 120);
    const crossing = out.find(p => p.y === 120 && p.x !== 0 && p.x !== 1000);
    expect(crossing).toBeDefined();
    // between 1000 (y=140) and 1500 (y=105): t = (120-140)/(105-140) = 0.5714…
    expect(crossing.x).toBeCloseTo(1000 + ((120 - 140) / (105 - 140)) * 500, 6);
  });

  it('returns points still sorted by flow after inserting a crossing', () => {
    const out = goldenCurve(curve, 120);
    const xs = out.map(p => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('does not insert a crossing when no crossing occurs', () => {
    // cap above every measured point — nothing is clipped, nothing inserted
    expect(goldenCurve(curve, 999)).toEqual(curve);
    // cap below every measured point — all clipped, but no crossing between them
    const below = goldenCurve(curve, 50);
    expect(below.length).toBe(curve.length);
    expect(below.every(p => p.y === 50)).toBe(true);
  });

  it('does not divide by zero when two adjacent points share a y', () => {
    const flat = [{ x: 0, y: 130 }, { x: 500, y: 130 }, { x: 1000, y: 100 }];
    const out = goldenCurve(flat, 130);
    expect(out.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('handles empty and missing inputs', () => {
    expect(goldenCurve([], 100)).toEqual([]);
    expect(goldenCurve(null, 100)).toEqual([]);
    expect(goldenCurve(undefined, null)).toEqual([]);
  });

  it('never produces NaN for any cap across the curve range', () => {
    for (let cap = 0; cap <= 200; cap += 7) {
      const out = goldenCurve(curve, cap);
      expect(out.every(p => !Number.isNaN(p.x) && !Number.isNaN(p.y))).toBe(true);
    }
  });

  it('does not mutate the input points', () => {
    const input = [{ x: 0, y: 150 }, { x: 1000, y: 140 }];
    const snapshot = JSON.stringify(input);
    goldenCurve(input, 100);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
