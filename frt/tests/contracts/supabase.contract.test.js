/**
 * Supabase contract test.
 *
 * Hits REAL production Supabase to assert the return shape that our mocks
 * pretend to mirror. If real Supabase ever changes (library upgrade, REST
 * API change, etc.) this test fails BEFORE the change can silently propagate
 * into production via mock-based unit tests that keep passing.
 *
 * Requires:
 *   - SUPABASE_ANON_KEY env var (in CI: repo secret; locally: .env or shell)
 *
 * If SUPABASE_ANON_KEY is missing, tests skip rather than fail — local dev
 * shouldn't be blocked by missing prod credentials. CI always has the secret.
 */
import { describe, it, expect } from 'vitest';

const SUPABASE_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

const skip = !ANON_KEY;
const describeIf = skip ? describe.skip : describe;

if (skip) {
  console.warn('[contract] SUPABASE_ANON_KEY missing — Supabase contract tests skipped.');
}

describeIf('Supabase contract — production shape', () => {
  it('GET /rest/v1/tool_data?select=id&limit=1 returns a flat array', async () => {
    const url = `${SUPABASE_URL}/rest/v1/tool_data?select=id&limit=1`;
    const resp = await fetch(url, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });
    expect(resp.status).toBe(200);

    const body = await resp.json();
    // THE assertion that protects against PUSH-E-class drift:
    expect(Array.isArray(body)).toBe(true);
    expect(body.data).toBeUndefined();

    // Don't assert on row count — that's data-dependent and brittle.
    // Shape is what matters.
  });

  it('returns valid JSON content-type', async () => {
    const url = `${SUPABASE_URL}/rest/v1/tool_data?select=id&limit=1`;
    const resp = await fetch(url, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });
    expect(resp.headers.get('content-type')).toMatch(/application\/json/);
  });
});
