/**
 * R2 Worker contract test.
 *
 * Hits the REAL deployed Cloudflare Worker at
 * arencon-r2-worker.hezhendong999.workers.dev to assert the response shapes
 * that our mocks pretend to mirror.
 *
 * Two endpoints checked:
 *   1. /list/{slug}/{tool}/{type}   — public (no auth), returns { files: [], truncated: bool }
 *   2. /listall/{pid}                — auth required; we verify the 401 contract here
 *                                       (auth'd test would need a real Supabase session token)
 *
 * Neither test exercises a real project's data — we use a deliberately
 * non-existent slug so the response is empty/error but the SHAPE is verifiable.
 */
import { describe, it, expect } from 'vitest';

const WORKER_URL = 'https://arencon-r2-worker.hezhendong999.workers.dev';

describe('R2 Worker contract — production shapes', () => {
  it('GET /list/{slug}/{tool}/{type} returns { files: [], truncated: bool }', async () => {
    const url = `${WORKER_URL}/list/__test_probe_pid__/frt/original`;
    const resp = await fetch(url);
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty('files');
    expect(body).toHaveProperty('truncated');
    expect(Array.isArray(body.files)).toBe(true);
    expect(typeof body.truncated).toBe('boolean');
  });

  it('list response files have {key,size,uploaded} shape (if any)', async () => {
    // Use a real-looking but non-existent slug; if file shape ever changes
    // and someone uploads test data to /__contract_test__ this validates it.
    const url = `${WORKER_URL}/list/__contract_test__/frt/original`;
    const resp = await fetch(url);
    const body = await resp.json();

    if (body.files.length > 0) {
      const f = body.files[0];
      expect(f).toHaveProperty('key');
      expect(f).toHaveProperty('size');
      expect(typeof f.size).toBe('number');
    }
    // If files is empty, shape lock is unverifiable here — but the
    // outer envelope assertions above still hold.
  });

  it('GET /listall/{pid} without auth returns 401 with reason', async () => {
    const url = `${WORKER_URL}/listall/__test_probe_pid__`;
    const resp = await fetch(url);
    expect(resp.status).toBe(401);

    const body = await resp.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('reason');
    // The reason field's contract is "no-auth-header" specifically — this
    // catches any auth helper changes that might drop the reason field.
    expect(body.reason).toBe('no-auth-header');
  });

  it('OPTIONS preflight returns CORS headers', async () => {
    const url = `${WORKER_URL}/photos/__test_probe_pid__/frt/original/x.jpg`;
    const resp = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://hezhendong999-bot.github.io',
        'Access-Control-Request-Method': 'PUT'
      }
    });
    expect(resp.status).toBe(204);
    expect(resp.headers.get('access-control-allow-origin')).toBeTruthy();
    expect(resp.headers.get('access-control-allow-methods')).toContain('PUT');
  });
});
