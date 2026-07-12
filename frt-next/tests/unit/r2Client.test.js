/**
 * r2.js — R2 client URL construction & basic operations
 *
 * Covers the parts of frt/js/data/r2.js that don't require real network:
 *   - generateFilename() — pure function
 *   - upload() — verify outgoing URL has correct key shape
 *   - listAll() — verify outgoing URL and auth header
 *
 * Uses the fake R2 Worker mock from __mocks__/r2Worker.mock.js so we can
 * inspect every fetch call without hitting Cloudflare.
 *
 * The auth.js dependency is mocked because the real one reads from
 * localStorage; we set the token directly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installR2Mock } from '../__mocks__/r2Worker.mock.js';

// Mock auth.js to avoid pulling in unrelated DOM dependencies.
vi.mock('../../js/shared/auth.js', () => ({
  Auth: {
    getUser: () => ({ access_token: 'mock-token-abc' })
  }
}));

// IDB is touched by r2.js for its photo-rebuild path; fake-indexeddb is
// already installed by setup.js. r2.js imports IDB at the top so we mock
// the module export to avoid IDB side effects in these focused tests.
vi.mock('../../js/data/idb.js', () => ({
  IDB: {
    savePhoto: vi.fn(async () => true),
    getPhoto: vi.fn(async () => null)
  }
}));

// localStorage has the token (sb-access-token) — preferred by _getToken().
beforeEach(() => {
  localStorage.setItem('sb-access-token', 'mock-token-from-storage');
});

describe('R2.generateFilename', () => {
  it('produces a UUID-with-extension filename', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const fname = R2.generateFilename('jpg');
    expect(fname).toMatch(/^[0-9a-f-]{36}\.jpg$/i);
  });

  it('defaults to .jpg extension when omitted', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const fname = R2.generateFilename();
    expect(fname.endsWith('.jpg')).toBe(true);
  });
});

describe('R2.upload — URL construction', () => {
  let mock;
  beforeEach(() => { mock = installR2Mock(); });

  it('PUTs to photos/{pid}/frt/{type}/{filename}', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const blob = new Blob(['mock-image-data'], { type: 'image/jpeg' });
    const result = await R2.upload('proj-abc-123', 'original', blob, 'test.jpg');

    expect(result).not.toBeNull();
    expect(result.r2Key).toBe('photos/proj-abc-123/frt/original/test.jpg');
    expect(result.r2Url).toContain('/photos/proj-abc-123/frt/original/test.jpg');

    // Verify fetch was called with correct method + auth header
    const calls = mock.fetchMock.mock.calls;
    const putCall = calls.find(c => (c[1] || {}).method === 'PUT');
    expect(putCall).toBeDefined();
    expect(putCall[1].headers.Authorization).toBe('Bearer mock-token-from-storage');
  });
});

describe('R2.listAll — URL & auth', () => {
  let mock;
  beforeEach(() => {
    mock = installR2Mock();
    // Seed the bucket with two objects under prefix 'pid-X/'
    mock.seed('pid-X/photos/frt/original/a.jpg', 'aaa', 'image/jpeg');
    mock.seed('pid-X/tiles/dw_1/L0/0_0.webp', 'tile', 'image/webp');
  });

  it('hits /listall/{pid} and includes Bearer token', async () => {
    const { R2 } = await import('../../js/data/r2.js');
    const result = await R2.listAll('pid-X');

    expect(result).not.toBeNull();
    expect(result.count).toBe(2);
    expect(result.objects.map(o => o.key).sort()).toEqual([
      'pid-X/photos/frt/original/a.jpg',
      'pid-X/tiles/dw_1/L0/0_0.webp'
    ]);

    const calls = mock.fetchMock.mock.calls;
    const listCall = calls.find(c => (c[0] || '').includes('/listall/'));
    expect(listCall).toBeDefined();
    expect(listCall[1].headers.Authorization).toBe('Bearer mock-token-from-storage');
  });

  it('returns null when no auth token is present', async () => {
    localStorage.removeItem('sb-access-token');
    // Also clear the Auth mock fallback
    vi.doMock('../../js/shared/auth.js', () => ({
      Auth: { getUser: () => null }
    }));
    vi.resetModules();
    const { R2 } = await import('../../js/data/r2.js');
    const result = await R2.listAll('pid-X');
    expect(result).toBeNull();
  });
});
