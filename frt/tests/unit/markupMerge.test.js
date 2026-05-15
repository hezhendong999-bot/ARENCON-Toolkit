/**
 * R2._mergeMarkupObjects + R2.uploadMarkup — CRDT-lite (S129 Item 2)
 * with tombstone medium scope (S129 Item 1.1) and If-Match conditional
 * PUT race protection (S129 Item 1.2).
 *
 * Locks in:
 *   - Union semantics fix the two-inspector concurrent-draw clobber bug.
 *   - Tombstones (deletedIds) prevent the erase-while-concurrent
 *     resurrection bug. Every stroke object has a unique id; tombstone is
 *     final and propagates via union.
 *   - If-Match retry: PUT carries the ETag from the prior GET. R2 returns
 *     412 on concurrent write between our GET and PUT; client re-reads,
 *     re-merges, re-PUTs. Closes the read-merge-write race window.
 *
 * Storage format: `{ objects: [...], deletedIds: [...] }`.
 * Back-compat: a plain-array body is treated as
 * `{ objects: arr, deletedIds: [] }`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Auth + IDB mocked away — these tests only exercise pure merge + upload.
vi.mock('../../js/shared/auth.js', () => ({
  Auth: { getUser: () => ({ access_token: 'mock' }) }
}));
vi.mock('../../js/data/idb.js', () => ({
  IDB: { savePhoto: vi.fn(async () => true), getPhoto: vi.fn(async () => null) }
}));

beforeEach(() => {
  localStorage.setItem('sb-access-token', 'mock');
});

// ────────────────────────────────────────────────────────────────────
// Pure merge function tests
// ────────────────────────────────────────────────────────────────────
describe('R2._mergeMarkupObjects — union by id', () => {
  it('disjoint cloud + local: returns all objects, cloud first then local', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1', type: 'pen' }, { id: 'c2', type: 'rect' }];
    const local = [{ id: 'l1', type: 'highlight' }];
    const result = R2._mergeMarkupObjects(cloud, local);
    expect(result.objects.length).toBe(3);
    expect(result.objects.map(o => o.id)).toEqual(['c1', 'c2', 'l1']);
    expect(result.deletedIds).toEqual([]);
  });

  it('preserves cloud-only objects (the clobber fix — Inspector B sees Inspector A’s strokes)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1' }, { id: 'c2' }];
    const local = [{ id: 'l1' }];
    const result = R2._mergeMarkupObjects(cloud, local);
    expect(result.objects.find(o => o.id === 'c1')).toBeDefined();
    expect(result.objects.find(o => o.id === 'c2')).toBeDefined();
    expect(result.objects.find(o => o.id === 'l1')).toBeDefined();
  });

  it('id collision: local wins (active editor’s version)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'x1', color: 'red',  size: 3 }];
    const local = [{ id: 'x1', color: 'blue', size: 5 }];
    const result = R2._mergeMarkupObjects(cloud, local);
    expect(result.objects.length).toBe(1);
    expect(result.objects[0].color).toBe('blue');
    expect(result.objects[0].size).toBe(5);
  });

  it('null/undefined inputs: treats as empty array, no crash', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    expect(R2._mergeMarkupObjects(null, null).objects).toEqual([]);
    expect(R2._mergeMarkupObjects(undefined, undefined).objects).toEqual([]);
    expect(R2._mergeMarkupObjects([{ id: 'a' }], null).objects).toEqual([{ id: 'a' }]);
    expect(R2._mergeMarkupObjects(null, [{ id: 'b' }]).objects).toEqual([{ id: 'b' }]);
  });

  it('non-array inputs (string, object, number): treats as empty', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    expect(R2._mergeMarkupObjects('not an array', [{ id: 'a' }]).objects).toEqual([{ id: 'a' }]);
    expect(R2._mergeMarkupObjects([{ id: 'a' }], 42).objects).toEqual([{ id: 'a' }]);
    expect(R2._mergeMarkupObjects({}, {}).objects).toEqual([]);
  });

  it('objects without id are silently dropped (defensive)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1' }, { type: 'pen' /* no id */ }];
    const local = [{ id: 'l1' }, null, undefined];
    const result = R2._mergeMarkupObjects(cloud, local);
    expect(result.objects.map(o => o.id)).toEqual(['c1', 'l1']);
  });

  it('duplicates within cloud array are deduplicated (defensive)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1' }, { id: 'c1', stale: true }, { id: 'c2' }];
    const result = R2._mergeMarkupObjects(cloud, []);
    expect(result.objects.length).toBe(2);
    expect(result.objects.map(o => o.id)).toEqual(['c1', 'c2']);
    expect(result.objects[0].stale).toBeUndefined();
  });

  it('duplicates within local array are deduplicated (defensive)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const local = [{ id: 'l1', v: 1 }, { id: 'l1', v: 2 }];
    const result = R2._mergeMarkupObjects([], local);
    expect(result.objects.length).toBe(1);
    expect(result.objects[0].v).toBe(1);
  });

  it('empty inputs both sides: returns empty objects + empty deletedIds', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const result = R2._mergeMarkupObjects([], []);
    expect(result.objects).toEqual([]);
    expect(result.deletedIds).toEqual([]);
  });

  it('input arrays are NOT mutated (pure function contract)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const cloud = [{ id: 'c1' }];
    const local = [{ id: 'l1' }];
    const localTomb = ['t1'];
    const cloudTomb = ['t2'];
    const cloudSnap = JSON.stringify(cloud);
    const localSnap = JSON.stringify(local);
    const ltSnap = JSON.stringify(localTomb);
    const ctSnap = JSON.stringify(cloudTomb);
    R2._mergeMarkupObjects(cloud, local, localTomb, cloudTomb);
    expect(JSON.stringify(cloud)).toBe(cloudSnap);
    expect(JSON.stringify(local)).toBe(localSnap);
    expect(JSON.stringify(localTomb)).toBe(ltSnap);
    expect(JSON.stringify(cloudTomb)).toBe(ctSnap);
  });

  it('two-inspector scenario: A draws 2 strokes, B draws 2 strokes, neither sees the other — both saves union correctly', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const aSave = R2._mergeMarkupObjects([], [{ id: 'a1' }, { id: 'a2' }]);
    expect(aSave.objects.map(o => o.id)).toEqual(['a1', 'a2']);
    const bSave = R2._mergeMarkupObjects(aSave.objects, [{ id: 'b1' }, { id: 'b2' }]);
    expect(bSave.objects.map(o => o.id).sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
  });
});

// ────────────────────────────────────────────────────────────────────
// S129 1.1 — Tombstone semantics
// S133 — Updated: deletedIds is now Array<{id, t}>. Inputs accept legacy
// plain strings (upgraded to {id, t: Date.now()}) and current-shape objects.
// ────────────────────────────────────────────────────────────────────
describe('R2._mergeMarkupObjects — tombstones (S129 1.1 / S133)', () => {
  it('local tombstone excludes cloud-only object from merge (the erase-resurrection fix)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const result = R2._mergeMarkupObjects(
      [{ id: 'S1' }, { id: 'S2' }],
      [{ id: 'S2' }],
      ['S1'],
      []
    );
    expect(result.objects.map(o => o.id)).toEqual(['S2']);
    expect(result.deletedIds.map(t => t.id)).toEqual(['S1']);
    expect(typeof result.deletedIds[0].t).toBe('number');
  });

  it('cloud tombstone excludes local-only object (propagation: B sees A’s erase)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const result = R2._mergeMarkupObjects([], [{ id: 'S1' }], [], ['S1']);
    expect(result.objects).toEqual([]);
    expect(result.deletedIds.map(t => t.id)).toEqual(['S1']);
  });

  it('tombstones from both sides are unioned (no duplicates)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const result = R2._mergeMarkupObjects([], [], ['T1', 'T2'], ['T2', 'T3']);
    expect(result.deletedIds.map(t => t.id).sort()).toEqual(['T1', 'T2', 'T3']);
  });

  it('tombstoned id wins over a fresh local object with same id (delete is final)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const result = R2._mergeMarkupObjects([], [{ id: 'X' }], ['X'], []);
    expect(result.objects).toEqual([]);
    expect(result.deletedIds.map(t => t.id)).toEqual(['X']);
  });

  it('tombstone with no matching object: harmless, still propagates', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const result = R2._mergeMarkupObjects([{ id: 'A' }], [{ id: 'A' }], ['Z'], []);
    expect(result.objects.map(o => o.id)).toEqual(['A']);
    expect(result.deletedIds.map(t => t.id)).toEqual(['Z']);
  });

  it('truly-invalid tombstone entries are filtered (null/undefined/primitives)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    // S133: strings AND objects-with-an-id are BOTH valid tombstone shapes;
    // only entries with neither are dropped.
    const result = R2._mergeMarkupObjects(
      [{ id: 'A' }], [], [null, undefined, 42, 'realTomb', { id: 'objTomb', t: Date.now() }], []
    );
    expect(result.deletedIds.map(t => t.id).sort()).toEqual(['objTomb', 'realTomb']);
  });

  it('non-array tombstone params: treated as empty, no crash', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const result = R2._mergeMarkupObjects([{ id: 'A' }], [{ id: 'B' }], 'nope', null);
    expect(result.objects.map(o => o.id).sort()).toEqual(['A', 'B']);
    expect(result.deletedIds).toEqual([]);
  });

  it('S133 — legacy string tombstone is upgraded to {id, t} with a fresh timestamp', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const before = Date.now();
    const result = R2._mergeMarkupObjects([], [], ['legacy'], []);
    const after = Date.now();
    expect(result.deletedIds.length).toBe(1);
    expect(result.deletedIds[0].id).toBe('legacy');
    expect(result.deletedIds[0].t).toBeGreaterThanOrEqual(before);
    expect(result.deletedIds[0].t).toBeLessThanOrEqual(after);
  });

  it('S133 — tombstones older than TTL are pruned during merge', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000; // > 180-day TTL
    const recent = Date.now() - 10 * 24 * 60 * 60 * 1000;       // 10 days ago
    const result = R2._mergeMarkupObjects(
      [], [],
      [{ id: 'old', t: oneYearAgo }, { id: 'fresh', t: recent }],
      []
    );
    // 'old' pruned, 'fresh' retained.
    expect(result.deletedIds.map(t => t.id)).toEqual(['fresh']);
  });

  it('S133 — on id collision the earlier timestamp wins (deletion origin)', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const earlier = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const later   = Date.now() - 1  * 24 * 60 * 60 * 1000;
    // local has the newer copy, cloud has the older — earlier wins.
    const r1 = R2._mergeMarkupObjects(
      [], [],
      [{ id: 'X', t: later }],
      [{ id: 'X', t: earlier }]
    );
    expect(r1.deletedIds.length).toBe(1);
    expect(r1.deletedIds[0].t).toBe(earlier);
    // And the reverse — same result.
    const r2 = R2._mergeMarkupObjects(
      [], [],
      [{ id: 'X', t: earlier }],
      [{ id: 'X', t: later }]
    );
    expect(r2.deletedIds[0].t).toBe(earlier);
  });

  it('end-to-end scenario: A erases S1, B has S1 locally, B saves — S1 stays gone', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const aSave = R2._mergeMarkupObjects(
      [{ id: 'S1' }, { id: 'S2' }], [{ id: 'S2' }], ['S1'], []
    );
    expect(aSave.objects.map(o => o.id)).toEqual(['S2']);
    expect(aSave.deletedIds.map(t => t.id)).toEqual(['S1']);

    const bSave = R2._mergeMarkupObjects(
      aSave.objects, [{ id: 'S1' }, { id: 'S3' }], [], aSave.deletedIds
    );
    expect(bSave.objects.map(o => o.id).sort()).toEqual(['S2', 'S3']);
    expect(bSave.deletedIds.map(t => t.id)).toEqual(['S1']);
  });
});

// ────────────────────────────────────────────────────────────────────
// S129 1.2 — If-Match retry on 412 (uploadMarkup integration)
// ────────────────────────────────────────────────────────────────────
describe('R2.uploadMarkup — If-Match conditional PUT (S129 1.2)', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const mkResp = (status, body, headers = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (h) => {
        if (!h) return null;
        const k = Object.keys(headers).find(x => x.toLowerCase() === h.toLowerCase());
        return k ? headers[k] : null;
      }
    },
    json: async () => body,
    text: async () => JSON.stringify(body)
  });

  it('first write (404 on GET): sends If-None-Match: * and succeeds on PUT', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const calls = [];
    global.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, method: (opts && opts.method) || 'GET', headers: (opts && opts.headers) || {} });
      if (!opts || opts.method !== 'PUT') return mkResp(404, null);
      return mkResp(200, { success: true });
    });
    const result = await R2.uploadMarkup('pid1', 'd1', [{ id: 'a' }], []);
    expect(result).not.toBeNull();
    expect(result.count).toBe(1);
    const put = calls.find(c => c.method === 'PUT');
    expect(put.headers['If-None-Match']).toBe('*');
    expect(put.headers['If-Match']).toBeUndefined();
  });

  it('cloud exists with ETag: sends If-Match: <etag> on PUT', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const calls = [];
    global.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, method: (opts && opts.method) || 'GET', headers: (opts && opts.headers) || {} });
      if (!opts || opts.method !== 'PUT') return mkResp(200, { objects: [{ id: 'c1' }], deletedIds: [] }, { ETag: '"abc123"' });
      return mkResp(200, { success: true });
    });
    const result = await R2.uploadMarkup('pid1', 'd1', [{ id: 'a' }], []);
    expect(result).not.toBeNull();
    const put = calls.find(c => c.method === 'PUT');
    expect(put.headers['If-Match']).toBe('"abc123"');
    expect(put.headers['If-None-Match']).toBeUndefined();
  });

  it('412 on PUT triggers retry: re-GET, re-merge, re-PUT with new ETag', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    let getCount = 0, putCount = 0;
    const seenIfMatch = [];
    global.fetch = vi.fn(async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') {
        getCount++;
        if (getCount === 1) {
          return mkResp(200, { objects: [{ id: 'c1' }], deletedIds: [] }, { ETag: '"v1"' });
        }
        return mkResp(200, { objects: [{ id: 'c1' }, { id: 'c2' }], deletedIds: [] }, { ETag: '"v2"' });
      }
      putCount++;
      seenIfMatch.push((opts.headers || {})['If-Match']);
      if (putCount === 1) return mkResp(412, { error: 'Precondition Failed' });
      return mkResp(200, { success: true });
    });
    const result = await R2.uploadMarkup('pid1', 'd1', [{ id: 'a' }], []);
    expect(result).not.toBeNull();
    expect(getCount).toBe(2);
    expect(putCount).toBe(2);
    expect(seenIfMatch).toEqual(['"v1"', '"v2"']);
  });

  it('412 retry budget: 4 conditional PUTs, then 1 unconditional last-resort PUT (5 total)', async () => {
    // S130 — after the conditional retries are exhausted, uploadMarkup makes
    // ONE final unconditional PUT (no If-Match) as a last resort so the write
    // actually persists. If even that 412s (bizarre — unconditional PUTs
    // shouldn't 412), the result is null. This test forces every PUT to 412
    // including the unconditional one, so we see all 5 attempts and a null.
    const { R2 } = await import('../../js/data/r2.js');
    let putCount = 0;
    let lastPutHadIfMatch = null;
    global.fetch = vi.fn(async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return mkResp(200, { objects: [], deletedIds: [] }, { ETag: '"x"' });
      putCount++;
      lastPutHadIfMatch = !!((opts.headers || {})['If-Match']);
      return mkResp(412, { error: 'Precondition Failed' });
    });
    const result = await R2.uploadMarkup('pid1', 'd1', [{ id: 'a' }], []);
    expect(result).toBeNull();
    // 1 initial + 3 conditional retries + 1 unconditional last-resort = 5
    expect(putCount).toBe(5);
    // The final PUT must have been unconditional (no If-Match header)
    expect(lastPutHadIfMatch).toBe(false);
  });

  it('412 on all conditional PUTs, but unconditional last-resort PUT succeeds', async () => {
    // The realistic case: conditional PUT keeps 412ing (e.g. an undeployed or
    // buggy worker), but the unconditional fallback persists the data. This is
    // the fix for "deleted markup came back on reopen" — the delete now
    // actually reaches R2 instead of silently failing.
    const { R2 } = await import('../../js/data/r2.js');
    let putCount = 0;
    const ifMatchSeen = [];
    global.fetch = vi.fn(async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return mkResp(200, { objects: [], deletedIds: [] }, { ETag: '"x"' });
      putCount++;
      ifMatchSeen.push(!!((opts.headers || {})['If-Match']));
      // First 4 (conditional) PUTs 412; the 5th (unconditional) succeeds.
      if (putCount <= 4) return mkResp(412, { error: 'Precondition Failed' });
      return mkResp(200, { success: true });
    });
    const result = await R2.uploadMarkup('pid1', 'd1', [{ id: 'a' }], ['deleted-1']);
    expect(result).not.toBeNull();
    expect(putCount).toBe(5);
    // First 4 had If-Match, the 5th (the one that succeeded) did not.
    expect(ifMatchSeen).toEqual([true, true, true, true, false]);
  });

  it('old-format cloud body (plain array) is accepted and merged correctly', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    let putBody = null;
    global.fetch = vi.fn(async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') {
        return mkResp(200, [{ id: 'oldA' }, { id: 'oldB' }], { ETag: '"legacy"' });
      }
      putBody = JSON.parse(opts.body);
      return mkResp(200, { success: true });
    });
    const result = await R2.uploadMarkup('pid1', 'd1', [{ id: 'new' }], ['oldA']);
    expect(result).not.toBeNull();
    // S133: deletedIds is now Array<{id, t}>.
    expect(putBody.objects).toEqual([{ id: 'oldB' }, { id: 'new' }]);
    expect(putBody.deletedIds.map(t => t.id)).toEqual(['oldA']);
  });

  it('tombstones are written to the PUT body', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    let putBody = null;
    global.fetch = vi.fn(async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return mkResp(404, null);
      putBody = JSON.parse(opts.body);
      return mkResp(200, { success: true });
    });
    await R2.uploadMarkup('pid1', 'd1', [{ id: 'A' }], ['T1', 'T2']);
    // S133: deletedIds is now Array<{id, t}>.
    expect(putBody.deletedIds.map(t => t.id).sort()).toEqual(['T1', 'T2']);
    expect(putBody.objects.map(o => o.id)).toEqual(['A']);
  });

  it('GET without ETag (worker not yet deployed) falls back to unconditional PUT', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    let putHeaders = null;
    global.fetch = vi.fn(async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return mkResp(200, [{ id: 'c1' }], {});
      putHeaders = opts.headers || {};
      return mkResp(200, { success: true });
    });
    const result = await R2.uploadMarkup('pid1', 'd1', [{ id: 'a' }], []);
    expect(result).not.toBeNull();
    expect(putHeaders['If-Match']).toBeUndefined();
    expect(putHeaders['If-None-Match']).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// S129 1.1 — downloadMarkup back-compat
// ────────────────────────────────────────────────────────────────────
describe('R2.downloadMarkup — format normalization (S129 1.1)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  const mkResp = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => body
  });

  it('new format: returns {objects, deletedIds} as-is', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    global.fetch = vi.fn(async () => mkResp(200, { objects: [{ id: 'a' }], deletedIds: ['t1'] }));
    const result = await R2.downloadMarkup('https://x/y');
    expect(result).toEqual({ objects: [{ id: 'a' }], deletedIds: ['t1'] });
  });

  it('old format (plain array): normalizes to {objects: arr, deletedIds: []}', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    global.fetch = vi.fn(async () => mkResp(200, [{ id: 'legacy' }]));
    const result = await R2.downloadMarkup('https://x/y');
    expect(result).toEqual({ objects: [{ id: 'legacy' }], deletedIds: [] });
  });

  it('404: returns null', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    global.fetch = vi.fn(async () => mkResp(404, null));
    const result = await R2.downloadMarkup('https://x/y');
    expect(result).toBeNull();
  });

  it('partial new format (missing deletedIds): fills with empty array', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    global.fetch = vi.fn(async () => mkResp(200, { objects: [{ id: 'a' }] }));
    const result = await R2.downloadMarkup('https://x/y');
    expect(result).toEqual({ objects: [{ id: 'a' }], deletedIds: [] });
  });
});
