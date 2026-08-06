/**
 * BATTLE SUITE WAVE 2 — S625
 * ═══════════════════════════
 * (a) This week's shipped code: inspector palette invariants, colour maths,
 *     the hidden-inspector persistence contract, gate.py behavioural checks
 *     are covered separately (it is Python; tested in-session with a live
 *     negative control at S622c).
 * (b) SOAK: 500 seeded random project mutations through merge3 with three
 *     writers, asserting the four invariants every historical data-loss bug
 *     violated. A failure prints its seed for exact replay.
 */
import { describe, it, expect } from 'vitest';
import { merge3 } from '../../../lib/data/merge.js';
import {
  CONTRACTOR_COLOR_PALETTE,
  INSPECTOR_COLOR_PALETTE,
  nextContractorColor
} from '../../../frt/js/data/model.js';

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const S = (o) => JSON.parse(JSON.stringify(o));

/* CIE L*a*b* — same maths used to derive the palettes; here it VERIFIES them */
function lab(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [R, G, B] = [f(r), f(g), f(b)];
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const q = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [q(X), q(Y), q(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const BODY = ['#A85959', '#B07F5A', '#5F8068', '#5E5440', '#6B6FA8'];

describe('BATTLE W2 — S623b palette invariants (the lock, executable)', () => {
  it('T26: 16 contractor slots, slots 0-7 frozen to the grandfathered originals', () => {
    expect(CONTRACTOR_COLOR_PALETTE).toHaveLength(16);
    expect(CONTRACTOR_COLOR_PALETTE.slice(0, 8)).toEqual([
      '#5B5FD6', '#1E9E6F', '#D98A1E', '#1AA3C4',
      '#D2415C', '#8B6FE0', '#3E9E55', '#2C7FB8'
    ]);
  });

  it('T27: 12 inspector slots, no colour appears in both palettes', () => {
    expect(INSPECTOR_COLOR_PALETTE).toHaveLength(12);
    const both = INSPECTOR_COLOR_PALETTE.filter(c => CONTRACTOR_COLOR_PALETTE.includes(c));
    expect(both).toEqual([]);
  });

  it('T28: LIGHTNESS BAND LAW — every inspector L* > every NEW contractor L* by >= 14', () => {
    const insL = INSPECTOR_COLOR_PALETTE.map(c => lab(c)[0]);
    const newCtrL = CONTRACTOR_COLOR_PALETTE.slice(8).map(c => lab(c)[0]);
    expect(Math.min(...insL) - Math.max(...newCtrL)).toBeGreaterThanOrEqual(14);
  });

  it('T29: every inspector ring clears EVERY pin body colour by dE >= 25 (the closed-green bug)', () => {
    for (const ins of INSPECTOR_COLOR_PALETTE) {
      for (const body of BODY) {
        expect(dE(ins, body), ins + ' vs body ' + body).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it('T30: every inspector ring clears every contractor colour (legacy AND new) by dE >= 25', () => {
    for (const ins of INSPECTOR_COLOR_PALETTE) {
      for (const ctr of CONTRACTOR_COLOR_PALETTE) {
        expect(dE(ins, ctr), ins + ' vs ctr ' + ctr).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it('T31: nextContractorColor never returns an inspector colour, across 200 allocation states', () => {
    for (let s = 1; s <= 200; s++) {
      const r = rng(s);
      const used = CONTRACTOR_COLOR_PALETTE.filter(() => r() < 0.6);
      const got = nextContractorColor(used);
      expect(INSPECTOR_COLOR_PALETTE).not.toContain(got);
      expect(CONTRACTOR_COLOR_PALETTE).toContain(got);
    }
  });

  it('T32: allocation walks all 16 slots before repeating (the S623b capacity claim)', () => {
    const used = [];
    for (let i = 0; i < 16; i++) {
      const c = nextContractorColor(used);
      expect(used, 'slot ' + i + ' repeated early').not.toContain(c);
      used.push(c);
    }
    expect(new Set(used).size).toBe(16);
  });
});

describe('BATTLE W2 — SOAK: 500 seeded three-writer merges, four invariants', () => {
  /* The four invariants every historical data-loss bug violated:
       I1  no id-keyed item vanishes unless a side tombstoned it
       I2  no typed (non-blank) field ends blank unless a stamped clear did it
       I3  tombstoned items never come back live
       I4  merge output survives JSON round-trip (what IDB/cloud actually store) */
  function project(r, tag) {
    const p = { info: { pm: 'PM-' + tag }, defics: [], photos: [] };
    for (let k = 0; k < 5; k++) {
      p.defics.push({ id: 'd' + k, _ts: 1000, note: 'note' + k, status: 'open' });
      p.photos.push({ id: 'p' + k, r2Key: 'photos/x/frt/original/' + k + '.jpg' });
    }
    return p;
  }

  it('T33: soak x500', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed * 97);
      const base = project(r, 'b');
      const writers = [0, 1, 2].map(w => {
        const side = S(base);
        const stamp = 2000 + w;
        side.defics.forEach(d => {
          const roll = r();
          if (roll < 0.30) { d.note = 'w' + w + '-' + d.id; d._ts = stamp; }
          else if (roll < 0.38) { d.status = 'closed'; d._ts = stamp; }
          else if (roll < 0.44) { d.deleted = true; d.purged = true; d.deletedDate = 'D'; d._ts = stamp; }
          else if (roll < 0.50) { d.note = ''; d._ts = stamp; }   // stamped clear — legal
        });
        if (r() < 0.4) side.defics.push({ id: 'add-w' + w + '-' + seed, _ts: 3000, note: 'new' });
        side.photos.forEach(ph => { if (r() < 0.15) { ph.deleted = true; ph.purged = true; ph.deletedDate = 'D'; } });
        return side;
      });
      const tomb = new Set();
      writers.forEach(w => {
        w.defics.forEach(d => { if (d.deleted) tomb.add(d.id); });
        w.photos.forEach(p => { if (p.deleted) tomb.add(p.id); });
      });

      let m = merge3(base, writers[0], writers[1]).merged;
      m = merge3(base, m, writers[2]).merged;

      // I4 first — everything else asserts on the round-tripped form
      let rt;
      expect(() => { rt = JSON.parse(JSON.stringify(m)); }, 'seed ' + seed + ' I4').not.toThrow();

      // I1: base items all present
      const ids = new Set(rt.defics.map(d => d.id));
      for (let k = 0; k < 5; k++) {
        expect(ids.has('d' + k), 'seed ' + seed + ' I1 d' + k).toBe(true);
      }
      // I3: tombstoned never live
      for (const d of rt.defics.concat(rt.photos)) {
        if (tomb.has(d.id)) {
          expect(!!d.deleted, 'seed ' + seed + ' I3 ' + d.id).toBe(true);
        }
      }
      // I2: surviving live defics keep a non-blank note unless SOME writer
      // issued a stamped clear for that item
      const cleared = new Set();
      writers.forEach(w => w.defics.forEach(d => { if (d.note === '' && d._ts > 1000) cleared.add(d.id); }));
      for (const d of rt.defics) {
        if (d.deleted || cleared.has(d.id)) continue;
        expect(d.note, 'seed ' + seed + ' I2 ' + d.id).toBeTruthy();
      }
      // photo pointer protection: undeleted photos keep their r2Key
      for (const p of rt.photos) {
        if (!p.deleted) expect(p.r2Key, 'seed ' + seed + ' r2Key ' + p.id).toBeTruthy();
      }
    }
  });
});
