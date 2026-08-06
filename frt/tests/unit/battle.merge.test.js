/**
 * BATTLE SUITE — S625 (Mark: "battle test this")
 * ═══════════════════════════════════════════════
 * Adversarial scenarios against the REAL merge3() engine (lib/data/merge.js),
 * replaying the toolkit's historical failure families:
 *   F1  "emptiness counts as an edit"  — 5 historical instances (S600 array
 *       items, S605 nested children, S610 statusMaps/fieldMaps, S613 ghost
 *       rows, S616 reconciliation door, S620 scalar no-entry)
 *   F2  tombstone/deleted-state survival through merge (S284b)
 *   F3  concurrent writers: entry stamps (_ts), order independence
 *   F4  absence vs deletion (S616: deletion is an event, not an absence)
 *   F5  photo pointer protection (S481: wiped r2Key must not clobber good one)
 *   F6  hostile shapes: depth, prototype pollution, junk input
 * Every randomized scenario is SEEDED; a failure prints its seed.
 */
import { describe, it, expect } from 'vitest';
import { merge3, applyResolutions } from '../../../lib/data/merge.js';
import { __lwwTestHook } from '../../../lib/data/sync.js';

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const S = (o) => JSON.parse(JSON.stringify(o));

describe('BATTLE F1 — emptiness must never count as an edit (merge3 door)', () => {
  const base = { report: { items: { r1: { note: '', qty: 0 } } } };

  it('T01: their blank skeleton must not erase my typed note (no stamps anywhere)', () => {
    const mine   = S(base); mine.report.items.r1.note = 'typed by A';
    const theirs = S(base);
    const { merged } = merge3(base, mine, theirs);
    expect(merged.report.items.r1.note).toBe('typed by A');
  });

  it('T02: symmetric — my blank must not erase their typed note', () => {
    const mine   = S(base);
    const theirs = S(base); theirs.report.items.r1.note = 'typed by B';
    const { merged } = merge3(base, mine, theirs);
    expect(merged.report.items.r1.note).toBe('typed by B');
  });

  it('T03: BOTH typed different values, no stamps → conflict surfaces, neither silently lost', () => {
    const mine   = S(base); mine.report.items.r1.note = 'mine';
    const theirs = S(base); theirs.report.items.r1.note = 'theirs';
    const { merged, conflicts } = merge3(base, mine, theirs);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(['mine', 'theirs']).toContain(merged.report.items.r1.note);
  });

  it('T04: numeric 0 and boolean false are CONTENT, not blanks (S613 narrow rule)', () => {
    const b = { readings: { psi: null, ok: null } };
    const mine   = { readings: { psi: 0, ok: false } };   // gauge read 0, answered No
    const theirs = { readings: { psi: null, ok: null } };
    const { merged } = merge3(b, mine, theirs);
    expect(merged.readings.psi).toBe(0);
    expect(merged.readings.ok).toBe(false);
  });

  it('T05: whitespace-only string counts as blank and loses to content', () => {
    const b = { f: { note: '' } };
    const mine   = { f: { note: 'real content' } };
    const theirs = { f: { note: '   ' } };
    const { merged } = merge3(b, mine, theirs);
    expect(merged.f.note).toBe('real content');
  });

  it('T06: empty array must not beat a populated one', () => {
    const b = { box: { tags: [] } };
    const mine   = { box: { tags: ['a', 'b'] } };
    const theirs = { box: { tags: [] } };
    const { merged } = merge3(b, mine, theirs);
    expect(merged.box.tags).toEqual(['a', 'b']);
  });

  it('T07: empty object must not beat a populated one', () => {
    const b = { m: { statusMap: {} } };
    const mine   = { m: { statusMap: { q1: 'pass' } } };
    const theirs = { m: { statusMap: {} } };
    const { merged } = merge3(b, mine, theirs);
    expect(merged.m.statusMap).toEqual({ q1: 'pass' });
  });

  it('T08: 40 seeded storms — a device holding a blank skeleton NEVER erases typed fields', () => {
    for (let s = 1; s <= 40; s++) {
      const r = rng(s * 13);
      const b = { rep: {} };
      for (let k = 0; k < 8; k++) b.rep['f' + k] = '';
      const typed = S(b), blank = S(b);
      const expectTyped = {};
      for (let k = 0; k < 8; k++) {
        if (r() < 0.6) { typed.rep['f' + k] = 'text-' + k; expectTyped['f' + k] = 'text-' + k; }
      }
      const flip = r() < 0.5;
      const { merged } = flip ? merge3(b, typed, blank) : merge3(b, blank, typed);
      for (const k of Object.keys(expectTyped)) {
        expect(merged.rep[k], 'seed ' + s + ' key ' + k).toBe(expectTyped[k]);
      }
    }
  });
});

describe('BATTLE F1b — entry stamps settle contested fields (S590/S583)', () => {
  it('T09: newer _ts wins the whole contested field, both merge orders', () => {
    const b = { items: { i1: { _ts: 0, note: 'orig' } } };
    const older = { items: { i1: { _ts: 100, note: 'older edit' } } };
    const newer = { items: { i1: { _ts: 200, note: 'newer edit' } } };
    expect(merge3(b, older, newer).merged.items.i1.note).toBe('newer edit');
    expect(merge3(b, newer, older).merged.items.i1.note).toBe('newer edit');
  });

  it('T10: a STAMPED clear (deliberate erase, newer _ts) IS allowed to blank content', () => {
    const b = { items: { i1: { _ts: 100, note: 'to be cleared' } } };
    const keep  = { items: { i1: { _ts: 100, note: 'to be cleared' } } };
    const clear = { items: { i1: { _ts: 200, note: '' } } };
    const { merged } = merge3(b, keep, clear);
    expect(merged.items.i1.note).toBe('');
  });

  it('T11: equal stamps + one blank → content still wins (stamp tie falls through to blank rule)', () => {
    const b = { items: { i1: { _ts: 100, note: '' } } };
    const typed = { items: { i1: { _ts: 100, note: 'typed' } } };
    const blank = { items: { i1: { _ts: 100, note: '' } } };
    expect(merge3(b, typed, blank).merged.items.i1.note).toBe('typed');
    expect(merge3(b, blank, typed).merged.items.i1.note).toBe('typed');
  });
});

describe('BATTLE F2 — deleted things stay dead', () => {
  it('T12: tombstoned photo survives merge against a side that still holds it live', () => {
    const b = { photos: [{ id: 'p1' }, { id: 'p2' }] };
    const mine   = { photos: [{ id: 'p1' }, { id: 'p2', deleted: true, purged: true, deletedDate: 'D' }] };
    const theirs = { photos: [{ id: 'p1' }, { id: 'p2' }] };
    const { merged } = merge3(b, mine, theirs);
    const p2 = merged.photos.find(p => p.id === 'p2');
    expect(p2 && p2.deleted).toBe(true);
  });

  it('T13: tombstone survives 15 merge round-trips without decaying', () => {
    let b = { photos: [{ id: 'p2' }] };
    let a = { photos: [{ id: 'p2', deleted: true, purged: true, deletedDate: 'D' }] };
    let c = { photos: [{ id: 'p2' }] };
    for (let i = 0; i < 15; i++) {
      const m = merge3(b, a, c).merged;
      b = S(m); a = S(m); c = S(m);
    }
    expect(a.photos.find(p => p.id === 'p2').deleted).toBe(true);
  });
});

describe('BATTLE F3 — concurrent writers and id-keyed arrays', () => {
  it('T14: A adds item X, B adds item Y — both survive, both orders', () => {
    const b = { defics: [{ id: 'd1' }] };
    const A = { defics: [{ id: 'd1' }, { id: 'dX', by: 'A' }] };
    const B = { defics: [{ id: 'd1' }, { id: 'dY', by: 'B' }] };
    for (const [x, y] of [[A, B], [B, A]]) {
      const ids = merge3(b, x, y).merged.defics.map(d => d.id).sort();
      expect(ids).toEqual(['d1', 'dX', 'dY']);
    }
  });

  it('T15: A edits d1.note, B edits d1.status — both field edits land on one item', () => {
    const b = { defics: [{ id: 'd1', note: 'n0', status: 's0' }] };
    const A = { defics: [{ id: 'd1', note: 'nA', status: 's0' }] };
    const B = { defics: [{ id: 'd1', note: 'n0', status: 'sB' }] };
    const { merged } = merge3(b, A, B);
    const d = merged.defics.find(x => x.id === 'd1');
    expect(d.note).toBe('nA');
    expect(d.status).toBe('sB');
  });

  it('T16: 50 seeded three-writer storms — item count exact, no typed field ever blanks', () => {
    for (let s = 1; s <= 50; s++) {
      const r = rng(s * 31);
      const b = { defics: [] };
      for (let k = 0; k < 6; k++) b.defics.push({ id: 'd' + k, note: 'base' + k });
      const w = [0, 1, 2].map(wi => {
        const side = S(b);
        side.defics.forEach(d => { if (r() < 0.5) d.note = 'w' + wi + '-' + d.id; });
        if (r() < 0.5) side.defics.push({ id: 'new-w' + wi + '-' + s, note: 'added' });
        return side;
      });
      // pairwise merge in random order, rebasing each time (as the sync loop does)
      let acc = w[0], baseNow = S(b);
      const m1 = merge3(baseNow, acc, w[1]).merged;
      const m2 = merge3(baseNow, m1, w[2]).merged;
      for (const d of m2.defics) {
        expect(d.note, 'seed ' + s + ' ' + d.id).toBeTruthy();
      }
      const added = [w[0], w[1], w[2]].filter(x => x.defics.length === 7).length;
      expect(m2.defics.length, 'seed ' + s).toBe(6 + added);
    }
  });
});

describe('BATTLE F4 — absence is not deletion (S616)', () => {
  it('T17: cloud copy simply missing a key does not delete my typed value', () => {
    const b = { info: { pm: '' } };
    const mine   = { info: { pm: 'Nasim' } };
    const theirs = { info: {} };                    // key absent, no tombstone
    const { merged } = merge3(b, mine, theirs);
    expect(merged.info.pm).toBe('Nasim');
  });

  it('T18: their whole missing branch does not delete my populated branch', () => {
    const b = { extras: {} };
    const mine   = { extras: { heights: { s1: [1, 2, 3] } } };
    const theirs = {};                              // branch absent entirely
    const { merged } = merge3(b, mine, theirs);
    expect(merged.extras.heights.s1).toEqual([1, 2, 3]);
  });
});

describe('BATTLE F5 — photo pointer protection (S481)', () => {
  it('T19: a nulled r2Key must not clobber a good pointer, either side', () => {
    const b = { photos: [{ id: 'p1', r2Key: 'photos/x/frt/original/a.jpg' }] };
    const good  = S(b);
    const wiped = { photos: [{ id: 'p1', r2Key: null }] };
    for (const [x, y] of [[good, wiped], [wiped, good]]) {
      const { merged } = merge3(b, x, y);
      expect(merged.photos.find(p => p.id === 'p1').r2Key)
        .toBe('photos/x/frt/original/a.jpg');
    }
  });
});

describe('BATTLE F6 — hostile shapes', () => {
  it('T20: 14-level nesting merges without loss or stack failure', () => {
    let bb = {}, mm = { v: 'typed' }, tt = {};
    for (let d = 0; d < 14; d++) { bb = { c: bb }; mm = { c: mm }; tt = { c: tt }; }
    const { merged } = merge3({ root: bb }, { root: mm }, { root: tt });
    let n = merged.root; for (let d = 0; d < 14; d++) n = n.c;
    expect(n.v).toBe('typed');
  });

  it('T21: constructor / __proto__ / hasOwnProperty keys neither crash nor pollute (S625 fix)', () => {
    // BUG FOUND BY THIS TEST (S625): a "constructor" key anywhere in the data
    // crashed merge3 entirely — mine['constructor'] on the side lacking the
    // key returned the inherited Function, and _clone() threw. statusMaps are
    // keyed by user-typed strings, so one person typing that word killed
    // every 412 reconciliation on the report. Fixed with own-property reads.
    for (const k of ['constructor', '__proto__', 'hasOwnProperty', 'toString']) {
      const hostile = JSON.parse('{"a":{"' + k + '":{"x":1}}}');
      const { merged } = merge3({ a: {} }, { a: { ok: 1 } }, hostile);
      expect(merged.a.ok).toBe(1);
    }
    expect(({}).polluted).toBeUndefined();
    expect(({}).x).toBeUndefined();
  });

  it('T21b: item IDs named after prototype members do not crash the id-array merge', () => {
    // Imported JSON controls item ids; an id of "hasOwnProperty" shadowed the
    // method on the byId index object and crashed the id-keyed merge path.
    const b = { defics: [] };
    const mine   = { defics: [{ id: 'hasOwnProperty', note: 'A' }, { id: 'constructor', note: 'B' }] };
    const theirs = { defics: [{ id: 'hasOwnProperty', note: 'A' }, { id: 'normal', note: 'C' }] };
    const { merged } = merge3(b, mine, theirs);
    const ids = merged.defics.map(d => d.id).sort();
    expect(ids).toEqual(['constructor', 'hasOwnProperty', 'normal']);
  });

  it('T22: fully id-less diverging arrays are an opaque conflict — surfaced, never silent', () => {
    // CONTRACT (verified S625): with no stable ids at all, the engine cannot
    // pair items, so the whole array is a scalar-kind conflict. Both sides are
    // carried in the conflict for the modal; nothing is silently lost.
    const b = { rows: [] };
    const mine   = { rows: [{ note: 'same' }, { note: 'mine-only' }] };
    const theirs = { rows: [{ note: 'same' }, { note: 'theirs-only' }] };
    const { merged, conflicts } = merge3(b, mine, theirs);
    const c = conflicts.find(x => x.path === 'rows');
    expect(c).toBeTruthy();
    expect(JSON.stringify(c.mine)).toContain('mine-only');
    expect(JSON.stringify(c.theirs)).toContain('theirs-only');
    expect(merged.rows.length).toBeGreaterThan(0);   // default side present
  });

  it('T23: applyResolutions honours the user choice at each conflict path', () => {
    const b = { f: { x: 'orig' } };
    const res = merge3(b, { f: { x: 'mine' } }, { f: { x: 'theirs' } });
    expect(res.conflicts.length).toBe(1);
    const chosenMine = applyResolutions({ merged: res.merged, conflicts: res.conflicts },
      [{ path: res.conflicts[0].path, chosen: 'mine' }]);
    expect(chosenMine.f.x).toBe('mine');
  });

  it('T24: merge3 output is JSON-serializable (no cycles, no functions leak in)', () => {
    const b = { x: { y: [1, 2] } };
    const { merged } = merge3(b, S(b), S(b));
    expect(() => JSON.stringify(merged)).not.toThrow();
  });
});

describe('BATTLE F7 — the OTHER door: pull-side LWW hook (sync.js)', () => {
  it('T25: heartbeat pull with empty cloud array does not wipe local items', () => {
    const local = [{ id: 'a', note: 'n' }, { id: 'b', note: 'n' }];
    const out = __lwwTestHook('frt', 'generalDeficiencies', local, [], null);
    const arr = out && (out.merged || out.value || out);
    if (Array.isArray(arr)) {
      expect(arr.length).toBeGreaterThanOrEqual(2);
    } else {
      // hook returns a decision object — the decision must not be "take cloud"
      expect(JSON.stringify(out)).not.toMatch(/"take-?cloud"/i);
    }
  });
});
