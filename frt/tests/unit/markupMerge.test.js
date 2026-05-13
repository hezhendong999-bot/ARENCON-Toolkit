/**
 * R2._mergeMarkupObjects — CRDT-lite union by id (S129 Item 2, tight scope)
 *
 * Locks in the union semantics that fix the two-inspector concurrent-draw
 * clobber bug. Every stroke object has a unique id (mk_<base36>_<rand> from
 * markup.js _newId()), so two inspectors adding strokes on the same drawing
 * can now both have their work preserved.
 *
 * KNOWN LIMITATION (tight scope, deferred): no tombstones. If Inspector A
 * erases stroke S1 locally while Inspector B has S1, B's next save will
 * resurrect S1 via this union. Medium-scope follow-up handles deletedIds.
 * That's the remaining 20% to reach 100% on this item. See handoff.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Auth + IDB mocked away — these tests only exercise the pure merge helper.
vi.mock('../../js/shared/auth.js', () => ({
  Auth: { getUser: () => ({ access_token: 'mock' }) }
}));
vi.mock('../../js/data/idb.js', () => ({
  IDB: { savePhoto: vi.fn(async () => true), getPhoto: vi.fn(async () => null) }
}));

beforeEach(() => {
  localStorage.setItem('sb-access-token', 'mock');
});

describe('R2._mergeMarkupObjects — union by id', () => {
  it('disjoint cloud + local: returns all objects, cloud first then local', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1', type: 'pen' }, { id: 'c2', type: 'rect' }];
    const local = [{ id: 'l1', type: 'highlight' }];
    const result = R2._mergeMarkupObjects(cloud, local);
    expect(result.length).toBe(3);
    expect(result.map(o => o.id)).toEqual(['c1', 'c2', 'l1']);
  });

  it('preserves cloud-only objects (the clobber fix — Inspector B sees Inspector A’s strokes)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    // Inspector A drew c1, c2 (already in cloud).
    // Inspector B drew l1 locally, never saw A's work.
    // B's save MUST keep A's strokes.
    const cloud = [{ id: 'c1' }, { id: 'c2' }];
    const local = [{ id: 'l1' }];
    const result = R2._mergeMarkupObjects(cloud, local);
    expect(result.find(o => o.id === 'c1')).toBeDefined();
    expect(result.find(o => o.id === 'c2')).toBeDefined();
    expect(result.find(o => o.id === 'l1')).toBeDefined();
  });

  it('id collision: local wins (active editor’s version)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'x1', color: 'red',  size: 3 }];
    const local = [{ id: 'x1', color: 'blue', size: 5 }];
    const result = R2._mergeMarkupObjects(cloud, local);
    expect(result.length).toBe(1);
    expect(result[0].color).toBe('blue');
    expect(result[0].size).toBe(5);
  });

  it('null/undefined inputs: treats as empty array, no crash', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    expect(R2._mergeMarkupObjects(null, null)).toEqual([]);
    expect(R2._mergeMarkupObjects(undefined, undefined)).toEqual([]);
    expect(R2._mergeMarkupObjects([{ id: 'a' }], null)).toEqual([{ id: 'a' }]);
    expect(R2._mergeMarkupObjects(null, [{ id: 'b' }])).toEqual([{ id: 'b' }]);
  });

  it('non-array inputs (string, object, number): treats as empty', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    expect(R2._mergeMarkupObjects('not an array', [{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(R2._mergeMarkupObjects([{ id: 'a' }], 42)).toEqual([{ id: 'a' }]);
    expect(R2._mergeMarkupObjects({}, {})).toEqual([]);
  });

  it('objects without id are silently dropped (defensive — every real stroke has _newId)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1' }, { type: 'pen' /* no id */ }];
    const local = [{ id: 'l1' }, null, undefined];
    const result = R2._mergeMarkupObjects(cloud, local);
    expect(result.map(o => o.id)).toEqual(['c1', 'l1']);
  });

  it('duplicates within cloud array are deduplicated (defensive)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1' }, { id: 'c1', stale: true }, { id: 'c2' }];
    const result = R2._mergeMarkupObjects(cloud, []);
    expect(result.length).toBe(2);
    expect(result.map(o => o.id)).toEqual(['c1', 'c2']);
    // First occurrence wins
    expect(result[0].stale).toBeUndefined();
  });

  it('duplicates within local array are deduplicated (defensive)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const local = [{ id: 'l1', v: 1 }, { id: 'l1', v: 2 }];
    const result = R2._mergeMarkupObjects([], local);
    expect(result.length).toBe(1);
    // First occurrence wins
    expect(result[0].v).toBe(1);
  });

  it('empty inputs both sides: returns empty array', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    expect(R2._mergeMarkupObjects([], [])).toEqual([]);
  });

  it('input arrays are NOT mutated (pure function contract)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1' }];
    const local = [{ id: 'l1' }];
    const cloudSnapshot = JSON.stringify(cloud);
    const localSnapshot = JSON.stringify(local);
    R2._mergeMarkupObjects(cloud, local);
    expect(JSON.stringify(cloud)).toBe(cloudSnapshot);
    expect(JSON.stringify(local)).toBe(localSnapshot);
  });

  it('two-inspector scenario: A draws 2 strokes, B draws 2 strokes, neither sees the other — both saves union correctly', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    // Inspector A first save: cloud empty, A's local = [a1, a2]
    const aSaveResult = R2._mergeMarkupObjects([], [{ id: 'a1' }, { id: 'a2' }]);
    expect(aSaveResult.map(o => o.id)).toEqual(['a1', 'a2']);
    // Cloud now = [a1, a2]. Inspector B saves with B's local = [b1, b2]
    // (B never downloaded since their session started; this is the bug fix).
    const bSaveResult = R2._mergeMarkupObjects(aSaveResult, [{ id: 'b1' }, { id: 'b2' }]);
    expect(bSaveResult.map(o => o.id).sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
    // A's strokes survive — that's the whole point.
  });
});
