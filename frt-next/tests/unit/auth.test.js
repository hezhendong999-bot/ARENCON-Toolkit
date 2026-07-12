/**
 * Auth — preemptive token refresh (S129 Item 1)
 *
 * Before S129, restoreSession() always called /auth/v1/user first, then on
 * 401 dropped through to refresh + retry. On expired tokens this cost
 * 3 sequential Supabase RTTs (~3000ms on slow links).
 *
 * After S129, restoreSession() parses the cached JWT's exp claim first.
 * If <5min remaining (or already past expiry), it skips the doomed
 * /auth/v1/user call and goes straight to _refreshTokenShared().
 *
 * Pattern lifted from the visibilitychange handler (lines 220-232 of auth.js)
 * which has used this idiom in production since S91 — proven safe.
 *
 * These tests lock the behavior so future "simplifications" don't regress it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a synthetic JWT with a specific exp (seconds-since-epoch).
 * Header + payload base64url-encoded; signature is a placeholder — auth.js
 * only base64-decodes the payload to read exp, it never validates the sig.
 */
function makeJwt(expSec) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({ sub: 'test-user', exp: expSec }))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return header + '.' + payload + '.signature-placeholder';
}

/** Build a JWT that expires `secondsFromNow` seconds from now. */
function jwtExpiringIn(secondsFromNow) {
  return makeJwt(Math.floor(Date.now() / 1000) + secondsFromNow);
}

/** Categorize a fetch call by URL — for asserting which Supabase endpoint was hit. */
function categorize(url) {
  if (url.indexOf('/auth/v1/token') >= 0) return 'refresh';
  if (url.indexOf('/auth/v1/user') >= 0) return 'user';
  if (url.indexOf('/rest/v1/profiles') >= 0) return 'profile';
  return 'other:' + url;
}

// ── Setup ────────────────────────────────────────────────────────────────

let fetchMock;
let AuthModule;

beforeEach(async () => {
  // Reset modules each test — auth.js holds module-level state (_user, _role,
  // _autoRefreshTimer, _refreshPromise). Without a fresh import per test,
  // singleton state from one test leaks into the next.
  vi.resetModules();

  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;

  // Default: success responses for everything. Individual tests override.
  fetchMock.mockImplementation((url) => {
    const cat = categorize(url);
    if (cat === 'user') {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: 'uid', email: 'x@y.z' })),
        json: () => Promise.resolve({ id: 'uid', email: 'x@y.z' })
      });
    }
    if (cat === 'refresh') {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          access_token: jwtExpiringIn(3600),
          refresh_token: 'new-refresh-token'
        })),
        json: () => Promise.resolve({
          access_token: jwtExpiringIn(3600),
          refresh_token: 'new-refresh-token'
        })
      });
    }
    if (cat === 'profile') {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify([{ role: 'inspector' }])),
        json: () => Promise.resolve([{ role: 'inspector' }])
      });
    }
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve('null'),
      json: () => Promise.resolve(null)
    });
  });

  AuthModule = await import('../../js/shared/auth.js');
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('Auth.restoreSession — preemptive refresh on near-expiry (S129 Item 1)', () => {

  it('healthy token (>5min from expiry): uses /auth/v1/user, does NOT preemptively refresh', async () => {
    localStorage.setItem('sb-access-token', jwtExpiringIn(3600)); // 1 hour out
    localStorage.setItem('sb-refresh-token', 'rt-healthy');

    const user = await AuthModule.Auth.restoreSession();

    expect(user).toBeTruthy();
    expect(user.email).toBe('x@y.z');

    const cats = fetchMock.mock.calls.map(c => categorize(c[0]));
    expect(cats).toContain('user');         // current path: validate via /auth/v1/user
    expect(cats).not.toContain('refresh');  // healthy token → no refresh
  });

  it('near-expiry token (<5min remaining): skips /auth/v1/user, goes straight to refresh', async () => {
    localStorage.setItem('sb-access-token', jwtExpiringIn(60));  // 1 min out
    localStorage.setItem('sb-refresh-token', 'rt-near-expiry');

    const user = await AuthModule.Auth.restoreSession();

    expect(user).toBeTruthy();

    const cats = fetchMock.mock.calls.map(c => categorize(c[0]));
    // CRITICAL: this is the boot-perf win. Doomed /auth/v1/user is skipped.
    // (The refresh path internally fetches /auth/v1/user with the NEW token
    // to load user data, which is expected. What we forbid is calling
    // /auth/v1/user with the OLD near-expired token first.)
    expect(cats).toContain('refresh');
    // Count old-token /auth/v1/user calls: there must be at most 1, and it
    // must be the post-refresh validation call (not the pre-refresh doomed one).
    // Easiest check: refresh must come BEFORE any /auth/v1/user call.
    const firstRefreshIdx = cats.indexOf('refresh');
    const firstUserIdx = cats.indexOf('user');
    if (firstUserIdx >= 0) {
      expect(firstRefreshIdx).toBeLessThan(firstUserIdx);
    }
  });

  it('past-expiry token: skips /auth/v1/user, goes straight to refresh', async () => {
    localStorage.setItem('sb-access-token', jwtExpiringIn(-300)); // 5 min ago
    localStorage.setItem('sb-refresh-token', 'rt-past-expiry');

    const user = await AuthModule.Auth.restoreSession();

    expect(user).toBeTruthy();

    const cats = fetchMock.mock.calls.map(c => categorize(c[0]));
    expect(cats).toContain('refresh');
    const firstRefreshIdx = cats.indexOf('refresh');
    const firstUserIdx = cats.indexOf('user');
    if (firstUserIdx >= 0) {
      expect(firstRefreshIdx).toBeLessThan(firstUserIdx);
    }
  });

  it('no token: returns null without any network call', async () => {
    // localStorage is cleared by setup.js beforeEach — no token to find

    const user = await AuthModule.Auth.restoreSession();

    expect(user).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(0);
  });

  it('unparseable JWT (no exp claim): falls through to existing /auth/v1/user path', async () => {
    // Token with malformed payload — _parseJwtExp returns null, so the
    // preemptive check is skipped and we use the legacy path.
    localStorage.setItem('sb-access-token', 'not.a.real.jwt');
    localStorage.setItem('sb-refresh-token', 'rt-malformed');

    await AuthModule.Auth.restoreSession();

    const cats = fetchMock.mock.calls.map(c => categorize(c[0]));
    // Legacy path: /auth/v1/user fires first.
    expect(cats[0]).toBe('user');
  });

  it('singleton respected: concurrent restoreSession calls on near-expiry token fire ONE refresh, not two', async () => {
    localStorage.setItem('sb-access-token', jwtExpiringIn(60));
    localStorage.setItem('sb-refresh-token', 'rt-singleton');

    // Fire two restores back-to-back without awaiting between them.
    const p1 = AuthModule.Auth.restoreSession();
    const p2 = AuthModule.Auth.restoreSession();

    const [u1, u2] = await Promise.all([p1, p2]);
    expect(u1).toBeTruthy();
    expect(u2).toBeTruthy();

    const refreshCalls = fetchMock.mock.calls.filter(c => categorize(c[0]) === 'refresh');
    // _refreshTokenShared singleton must coalesce — both restoreSession
    // calls share ONE in-flight refresh promise.
    expect(refreshCalls.length).toBe(1);
  });
});
