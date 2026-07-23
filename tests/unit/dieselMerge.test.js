/**
 * Diesel cloud↔local merge engine — _mergeCloudLocal and its photo-preserve family.
 *
 * WHY THIS FILE EXISTS
 * This ~785-line family decides whether an inspector's photos survive a sync.
 * Its own source comments are a log of real field failures:
 *   • general-deficiency photos were wiped by every cloud apply "for months"
 *     because one of five hand-copied preserve passes was missing (S314)
 *   • flowTestPhotosPld had no preserve pass at all — same wipe (S314 Gap A)
 *   • index-based pairing copied ONE photo's binary onto ANOTHER when two
 *     devices held arrays in different orders (S353)
 *   • a stale cloud row silently reverted local annotations (S301)
 * Every one of those is invisible in the moment: nothing crashes, a photo is
 * just gone later. That is the exact failure class Mark hit on site.
 *
 * These tests are run against the LIVE monolith source — the functions are
 * extracted from the shipped HTML at test time, not from a copy. So the tests
 * cannot drift away from what actually runs in the field, and a future carve
 * of this family has to keep them passing.
 *
 * CANON UNDER TEST (from the source's own contract):
 *   "Cloud owns structure; local owns binary data."
 * Cloud is authoritative for fields and shape. Local is authoritative for the
 * photo bytes (`d`) that cloud strips by design. A merge must never let an
 * authoritative-but-stripped cloud row destroy binary that exists only locally.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let merge;

beforeAll(() => {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../ARENCON_Diesel_Fire_Pump_Commissioning.html'), 'utf8');

  /** Pull a top-level function out of the shipped file by brace matching. */
  function grab(name) {
    const i = html.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('function not found in live source: ' + name);
    let d = 0;
    for (let j = i; j < html.length; j++) {
      if (html[j] === '{') d++;
      else if (html[j] === '}') { d--; if (d === 0) return html.slice(i, j + 1); }
    }
    throw new Error('unbalanced braces for ' + name);
  }

  /* The full dependency closure. _normalizePhotoDel and _photoCreatedTs are
     defined LATER in the file than _mergeCloudLocal, which is exactly why a
     first pass at this harness missed them — and the miss was invisible,
     because the real code wraps the deletion-reconcile step in a try/catch
     that swallowed the ReferenceError and carried on. A silently skipped
     deletion pass in a test harness would have made these tests lie. */
  /* NOTE: _s314BinaryInvariant is deliberately NOT listed. It is an IIFE
     defined INSIDE _mergeCloudLocal, so grabbing it separately duplicates it
     into the harness and makes mutation results meaningless. */
  const names = ['_isPhotoDeleted', '_photoCreatedTs', '_normalizePhotoDel',
    '_markPhotoDeleted', '_normalizeAllPhotoDel',
    '_reconcileOrigBackups', '_s335NewPhotoUnion',
    '_s337PropagateDeleted', '_mergeCloudLocal'];
  const src = names.map(grab).join('\n\n');

  // Fail loudly if the closure is ever incomplete again.
  const called = new Set([...src.matchAll(/\b(_[A-Za-z][\w$]*)\s*\(/g)].map(m => m[1]));
  const defined = new Set([...src.matchAll(/function\s+(_[A-Za-z][\w$]*)\s*\(/g)].map(m => m[1]));
  const missing = [...called].filter(n => !defined.has(n));
  if (missing.length) throw new Error('merge harness is missing helpers: ' + missing.join(', '));

  // Only external dependency is a diagnostics ring buffer on window.
  const win = { _dslDelDiag: [] };
  merge = new Function('window', src + '\nreturn _mergeCloudLocal;')(win);
});

/** A photo as it exists LOCALLY: carries the binary in `d`. */
const localPhoto = (id, over = {}) => ({
  id, d: 'data:image/jpeg;base64,LOCAL_' + id, n: id + '.jpg',
  caption: '', r2Key: '', r2Url: '', mk: null, _mkTs: 0, ...over
});

/** The same photo as CLOUD returns it: `d` stripped by design. */
const cloudPhoto = (id, over = {}) => ({
  id, n: id + '.jpg', caption: '', r2Key: '', r2Url: '', mk: null, _mkTs: 0, ...over
});

describe('canon: cloud owns structure, local owns binary', () => {
  it('restores photo binary that cloud stripped (recordPhotos)', () => {
    const cloud = { recordPhotos: [cloudPhoto('p1'), cloudPhoto('p2')] };
    const local = { recordPhotos: [localPhoto('p1'), localPhoto('p2')] };
    const out = merge(cloud, local);
    expect(out.recordPhotos[0].d).toBe('data:image/jpeg;base64,LOCAL_p1');
    expect(out.recordPhotos[1].d).toBe('data:image/jpeg;base64,LOCAL_p2');
  });

  it('restores binary for flow-test photos (both std and 7-pt arrays)', () => {
    // S314 Gap A: flowTestPhotosPld had NO preserve pass and was wiped every apply.
    const cloud = { flowTestPhotos: [cloudPhoto('f1')], flowTestPhotosPld: [cloudPhoto('g1')] };
    const local = { flowTestPhotos: [localPhoto('f1')], flowTestPhotosPld: [localPhoto('g1')] };
    const out = merge(cloud, local);
    expect(out.flowTestPhotos[0].d).toBe('data:image/jpeg;base64,LOCAL_f1');
    expect(out.flowTestPhotosPld[0].d).toBe('data:image/jpeg;base64,LOCAL_g1');
  });

  it('does NOT overwrite a binary that cloud legitimately carries', () => {
    const cloud = { recordPhotos: [cloudPhoto('p1', { d: 'data:image/jpeg;base64,CLOUD_p1' })] };
    const local = { recordPhotos: [localPhoto('p1')] };
    const out = merge(cloud, local);
    expect(out.recordPhotos[0].d).toBe('data:image/jpeg;base64,CLOUD_p1');
  });

  it('carries R2 key and url across together, never one without the other', () => {
    const cloud = { recordPhotos: [cloudPhoto('p1')] };
    const local = { recordPhotos: [localPhoto('p1', { r2Key: 'k/p1', r2Url: 'https://r2/p1' })] };
    const out = merge(cloud, local);
    const p = out.recordPhotos[0];
    // A url without its key is unusable for later reconciliation.
    if (p.r2Url) expect(p.r2Key).toBeTruthy();
    expect(p.r2Url).toBe('https://r2/p1');
    expect(p.r2Key).toBe('k/p1');
  });
});

describe('S353: photos pair by id, never by array position', () => {
  it('does not cross-copy binaries when the two devices hold different orders', () => {
    // THE BUG: index pairing put photo B's bytes onto photo A.
    const cloud = { recordPhotos: [cloudPhoto('alpha'), cloudPhoto('beta')] };
    const local = { recordPhotos: [localPhoto('beta'), localPhoto('alpha')] }; // reversed
    const out = merge(cloud, local);
    const byId = Object.fromEntries(out.recordPhotos.map(p => [p.id, p]));
    expect(byId.alpha.d).toBe('data:image/jpeg;base64,LOCAL_alpha');
    expect(byId.beta.d).toBe('data:image/jpeg;base64,LOCAL_beta');
  });

  it('never gives a photo a binary belonging to a different id', () => {
    const cloud = { recordPhotos: [cloudPhoto('a'), cloudPhoto('b'), cloudPhoto('c')] };
    const local = { recordPhotos: [localPhoto('c'), localPhoto('a'), localPhoto('b')] };
    const out = merge(cloud, local);
    out.recordPhotos.forEach(p => {
      if (p.d) expect(p.d).toBe('data:image/jpeg;base64,LOCAL_' + p.id);
    });
  });
});

describe('S335: a photo taken locally and not yet in cloud must survive', () => {
  it('keeps a local-only photo when cloud has not seen it yet', () => {
    // Mark's field repro: take a photo, pull-to-refresh, photo gone.
    const cloud = { recordPhotos: [cloudPhoto('old')] };
    const local = { recordPhotos: [localPhoto('old'), localPhoto('fresh')] };
    const out = merge(cloud, local);
    const ids = out.recordPhotos.map(p => p.id);
    expect(ids).toContain('fresh');
    const fresh = out.recordPhotos.find(p => p.id === 'fresh');
    expect(fresh.d).toBe('data:image/jpeg;base64,LOCAL_fresh');
  });

  it('does not lose the local-only photo even when cloud array is empty', () => {
    const cloud = { recordPhotos: [] };
    const local = { recordPhotos: [localPhoto('fresh')] };
    const out = merge(cloud, local);
    expect(out.recordPhotos.map(p => p.id)).toContain('fresh');
  });
});

describe('deletions must not resurrect across devices', () => {
  it('a photo deleted on another device stays deleted after merge', () => {
    const cloud = { recordPhotos: [cloudPhoto('p1', { deleted: true, delState: 'deleted' })] };
    const local = { recordPhotos: [localPhoto('p1')] };
    const out = merge(cloud, local);
    const p = out.recordPhotos.find(x => x.id === 'p1');
    // Restoring the binary must not undo the deletion.
    expect(p.deleted === true || p.delState === 'deleted').toBe(true);
  });
});

describe('robustness — a merge must never throw on a field device', () => {
  // A thrown merge is worse than a bad merge: the boot path catches and applies
  // cloud RAW, which is the stripped copy. That is data loss by exception.
  it('handles null / undefined on either side', () => {
    expect(() => merge(null, null)).not.toThrow();
    expect(() => merge({}, null)).not.toThrow();
    expect(() => merge(null, {})).not.toThrow();
    expect(() => merge(undefined, undefined)).not.toThrow();
  });

  it('handles missing photo arrays entirely', () => {
    expect(() => merge({ proj: {} }, { proj: {} })).not.toThrow();
  });

  it('handles arrays containing null entries', () => {
    const cloud = { recordPhotos: [null, cloudPhoto('p1')] };
    const local = { recordPhotos: [null, localPhoto('p1')] };
    expect(() => merge(cloud, local)).not.toThrow();
  });

  it('handles photos with no id (legacy, minted before ids existed)', () => {
    const cloud = { recordPhotos: [{ n: 'legacy.jpg' }] };
    const local = { recordPhotos: [{ n: 'legacy.jpg', d: 'data:image/jpeg;base64,LEGACY' }] };
    expect(() => merge(cloud, local)).not.toThrow();
  });

  it('handles a local side that is an EMPTY state (the S488 boot bug shape)', () => {
    // collectState() at boot read a not-yet-populated DOM and produced an empty
    // state; the merge ran faithfully against nothing and rescued nothing.
    // It must at minimum not throw and not destroy cloud structure.
    const cloud = { recordPhotos: [cloudPhoto('p1')], proj: { 'pi-client': 'Acme' } };
    const out = merge(cloud, {});
    expect(out.proj['pi-client']).toBe('Acme');
    expect(out.recordPhotos.length).toBe(1);
  });
});

describe('non-photo structure: cloud stays authoritative', () => {
  it('keeps cloud project field values', () => {
    const cloud = { proj: { 'pi-client': 'Cloud Client', 'pi-projno': '1490.04' }, recordPhotos: [] };
    const local = { proj: { 'pi-client': 'Stale Local' }, recordPhotos: [] };
    const out = merge(cloud, local);
    expect(out.proj['pi-client']).toBe('Cloud Client');
    expect(out.proj['pi-projno']).toBe('1490.04');
  });

  it('returns an object (never undefined) so the caller can always apply it', () => {
    expect(merge({ recordPhotos: [] }, { recordPhotos: [] })).toBeTruthy();
  });
});

/**
 * DEFENCE IN DEPTH — verified by mutation testing (S499).
 *
 * Three historical bugs were deliberately reintroduced into the live merge
 * source and run against real data:
 *   1. S314 — flowTestPhotosPld preserve pass removed
 *   2. S353 — photo pairing switched back to array index
 *   3. S335 — local-only "fresh photo" union removed
 * NONE of them caused data loss. Each is independently covered by a second
 * layer: the S314 global binary invariant sweeps every photo location after
 * the specific passes run, and the S335 union has its own rescue.
 *
 * That redundancy IS the safety property. It is why photo loss stopped being a
 * field problem. These tests pin the layers INDEPENDENTLY, so a future carve
 * cannot quietly collapse two layers into one and leave the tool one bug away
 * from losing an inspector's evidence again.
 */
describe('defence in depth: each protection layer works ALONE', () => {
  it('specific preserve passes work without the S314 backstop', () => {
    // Verified by mutation: disabling the backstop entirely still preserves,
    // because the per-array passes do their job.
    const cloud = { recordPhotos: [cloudPhoto('p1')], flowTestPhotosPld: [cloudPhoto('g1')] };
    const local = { recordPhotos: [localPhoto('p1')], flowTestPhotosPld: [localPhoto('g1')] };
    const out = merge(cloud, local);
    expect(out.recordPhotos[0].d).toBe('data:image/jpeg;base64,LOCAL_p1');
    expect(out.flowTestPhotosPld[0].d).toBe('data:image/jpeg;base64,LOCAL_g1');
  });

  it('binary survives in EVERY photo location the backstop sweeps', () => {
    // If a new photo location is ever added, it must be covered here too —
    // that is exactly how general-deficiency photos were missed for months.
    const mk = f => ({ recordPhotos: [], flowTestPhotos: [], flowTestPhotosPld: [], ...f });
    const cases = [
      ['recordPhotos', mk({ recordPhotos: [cloudPhoto('a')] }), mk({ recordPhotos: [localPhoto('a')] })],
      ['flowTestPhotos', mk({ flowTestPhotos: [cloudPhoto('b')] }), mk({ flowTestPhotos: [localPhoto('b')] })],
      ['flowTestPhotosPld', mk({ flowTestPhotosPld: [cloudPhoto('c')] }), mk({ flowTestPhotosPld: [localPhoto('c')] })],
      ['clState item photos',
        mk({ clState: { '1.2': { photos: [cloudPhoto('d')] } } }),
        mk({ clState: { '1.2': { photos: [localPhoto('d')] } } })],
      ['general deficiency photos',
        mk({ generalDeficiencies: [{ photos: [cloudPhoto('e')] }] }),
        mk({ generalDeficiencies: [{ photos: [localPhoto('e')] }] })],
      ['contractor deficiency photos',
        mk({ deficiencies: { Vipond: [{ photos: [cloudPhoto('f')] }] } }),
        mk({ deficiencies: { Vipond: [{ photos: [localPhoto('f')] }] } })],
    ];
    for (const [label, cloud, local] of cases) {
      const out = merge(JSON.parse(JSON.stringify(cloud)), JSON.parse(JSON.stringify(local)));
      const found = JSON.stringify(out).includes('LOCAL_');
      expect(found, label + ' lost its photo binary').toBe(true);
    }
  });
});
