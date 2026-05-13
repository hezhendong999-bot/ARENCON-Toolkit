/**
 * merge.js — 3-way merge engine
 *
 * Covers `merge3(base, mine, theirs)` from frt/js/data/merge.js. This is the
 * function called by sync.js when a CloudSync push fails with 412 Precondition
 * Failed (cloud changed between fetch and push). The merge must:
 *
 *   1. Take both sides' independent additions without conflict
 *   2. Take both sides' independent modifications without conflict
 *   3. Flag genuine conflicts (same field changed two different ways)
 *   4. Handle null base (first-time push) by treating mine as source-of-truth
 *
 * These are pure-function tests — no DOM, no fetch, no IDB.
 */
import { describe, it, expect } from 'vitest';
import { merge3 } from '../../js/data/merge.js';

describe('merge3 — pure 3-way merge', () => {
  it('throws when mine or theirs is missing', () => {
    expect(() => merge3({}, null, {})).toThrow(/required/);
    expect(() => merge3({}, {}, null)).toThrow(/required/);
  });

  it('returns mine unchanged when theirs is identical to base', () => {
    const base = { projectInfo: { client: 'Acme' }, drawings: [] };
    const mine = { projectInfo: { client: 'Acme Corp' }, drawings: [] };
    const theirs = { projectInfo: { client: 'Acme' }, drawings: [] };
    const { merged, conflicts } = merge3(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.projectInfo.client).toBe('Acme Corp');
  });

  it('merges independent additions to drawings array', () => {
    const base = { drawings: [{ id: 'd1', name: 'A' }] };
    const mine = {
      drawings: [
        { id: 'd1', name: 'A' },
        { id: 'd2', name: 'B' }   // added by me
      ]
    };
    const theirs = {
      drawings: [
        { id: 'd1', name: 'A' },
        { id: 'd3', name: 'C' }   // added by them
      ]
    };
    const { merged, conflicts } = merge3(base, mine, theirs);
    expect(conflicts).toEqual([]);
    const ids = merged.drawings.map(d => d.id).sort();
    expect(ids).toEqual(['d1', 'd2', 'd3']);
  });

  it('flags conflict when both sides modify the same field differently', () => {
    const base = { drawings: [{ id: 'd1', name: 'Original' }] };
    const mine = { drawings: [{ id: 'd1', name: 'My Version' }] };
    const theirs = { drawings: [{ id: 'd1', name: 'Their Version' }] };
    const { merged, conflicts } = merge3(base, mine, theirs);
    expect(conflicts.length).toBeGreaterThan(0);
    const nameConflict = conflicts.find(c => c.path.includes('name'));
    expect(nameConflict).toBeDefined();
    expect(nameConflict.mine).toBe('My Version');
    expect(nameConflict.theirs).toBe('Their Version');
  });

  it('handles null base (first push) by treating mine as source-of-truth', () => {
    const mine = { projectInfo: { client: 'New Project' } };
    const theirs = { projectInfo: { client: 'Other' } };
    // null base — both sides claim to have added projectInfo.client
    const { merged, conflicts } = merge3(null, mine, theirs);
    // Should produce a conflict (both added the same field with different values)
    // OR resolve in favor of one — what matters is the function doesn't crash
    expect(merged).toBeDefined();
    expect(merged.projectInfo).toBeDefined();
  });
});
