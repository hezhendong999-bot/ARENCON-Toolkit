/**
 * Supabase mock shape lock.
 *
 * This test exists for ONE reason: to lock in the fact that our Supabase
 * mock returns rows as a FLAT ARRAY, not as { data: [...] }.
 *
 * S127 PUSH E was caused by code calling `rows.data` on a flat-array return.
 * Every future test that uses the mock will get the same shape. If anyone
 * (Claude or human) ever "fixes" the mock to wrap results in { data: ... }
 * to match a different library's convention, THIS test fails first and
 * stops the drift before it propagates into other tests.
 *
 * The actual production shape is verified separately in
 * frt/tests/contracts/supabase.contract.test.js, which hits real Supabase
 * and asserts the same flat-array shape.
 */
import { describe, it, expect } from 'vitest';
import { createMockSupabase } from '../__mocks__/supabase.mock.js';

describe('Supabase mock — shape contract', () => {
  it('execute() returns a flat array, NOT { data: [...] }', async () => {
    const sb = createMockSupabase({
      tool_data: [
        { id: 'r1', user_id: 'u1', tool: 'frt' },
        { id: 'r2', user_id: 'u2', tool: 'frt' }
      ]
    });
    const rows = await sb.from('tool_data').select('*').execute();

    // The critical assertion: rows is the array itself.
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);

    // If anyone changes the mock to wrap in { data: ... }, this fails.
    expect(rows.data).toBeUndefined();
  });

  it('reproduces the S127 PUSH E bug pattern when consumer reads .data', async () => {
    // This test documents WHAT the bug looked like. Don't fix this consumer
    // pattern — it IS the bug. The fix lives in production code.
    const sb = createMockSupabase({
      tool_data: [{ id: 'r1', tool: 'frt' }]
    });
    const rows = await sb.from('tool_data').select('id').execute();

    // The S127 bug pattern:
    const buggyResult = (rows && rows.data) ? rows.data : [];
    expect(buggyResult).toEqual([]);  // ← the silent empty export

    // The S127 PUSH E fix:
    const fixedResult = Array.isArray(rows) ? rows : [];
    expect(fixedResult.length).toBe(1);
    expect(fixedResult[0].id).toBe('r1');
  });

  it('filters work as expected (eq)', async () => {
    const sb = createMockSupabase({
      tool_data: [
        { id: 'r1', user_id: 'u1' },
        { id: 'r2', user_id: 'u2' },
        { id: 'r3', user_id: 'u1' }
      ]
    });
    const rows = await sb.from('tool_data').select('*').eq('user_id', 'u1').execute();
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.id).sort()).toEqual(['r1', 'r3']);
  });

  it('order + limit chain works (matches CloudSync._cloudLoad pattern)', async () => {
    const sb = createMockSupabase({
      tool_data: [
        { id: 'r1', updated_at: '2026-01-01' },
        { id: 'r2', updated_at: '2026-03-01' },
        { id: 'r3', updated_at: '2026-02-01' }
      ]
    });
    const rows = await sb
      .from('tool_data')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(2)
      .execute();
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe('r2');  // most recent
  });
});
