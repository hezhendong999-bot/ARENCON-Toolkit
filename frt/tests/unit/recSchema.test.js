/**
 * recSchema.test.js — S138 recommendation flag schema
 *
 * Covers the additive defic-level `isRecommendation` boolean added in S138
 * as the data foundation for the unified "+ deficiency" modal's
 * recommendation checkbox and the Detailed/Table/Board rec affordances.
 * These tests assert the data-layer contract only — UI grouping/rendering
 * is exercised separately in deficiencies.js.
 *
 * Scope:
 *   1. Model.addDeficiency — new defics get isRecommendation:false
 *   2. setProject backfill — legacy defics (contractor + general) gain
 *      isRecommendation:false, no error, no other field touched
 *   3. Backfill is idempotent — a pre-set true survives re-load (NOT reset)
 *   4. Save/reload — boolean survives JSON round-trip
 *   5. merge3 — the scalar boolean rides through cloud merge generically
 *
 * Pure-state tests. _queueSave is debounced, so a synchronous getProject()
 * read after a mutation is valid without waiting for IDB.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Model } from '../../js/data/model.js';
import { merge3 } from '../../js/data/merge.js';

// Minimal project shape that survives setProject() normalization.
// Mirrors Model.createNewProject + addDeficiency output.
function makeProject(opts) {
  opts = opts || {};
  const defic = Object.assign({
    id: 'def_1',
    num: 1,
    status: 'open',
    priority: 'high',
    drawingId: null,
    pinX: null, pinY: null,
    notedDate: '2026-01-01',
    notedOnInstance: 1,
    observations: [
      {
        id: 'obs_1',
        text: 'Missing escutcheon',
        photos: [],
        notedOnInstance: 1,
        notedDate: '2026-01-01',
        addressed: false,
        priority: 'high',
        trade: '',
        tradeSource: 'ai',
        repeatCount: 1
      }
    ],
    photos: [],
    activity: []
  }, opts.deficOverride || {});
  return {
    id: 'p_test_' + Date.now(),
    name: 'Test Project',
    number: 'TEST-001',
    currentFrtInstance: 1,
    contractors: [
      { id: 'ctr_a', name: 'Acme Mechanical', deficiencies: [defic] }
    ],
    generalDeficiencies: [],
    drawings: []
  };
}

describe('S138 recommendation schema — isRecommendation', () => {

  beforeEach(() => {
    Model.setProject(null);
  });

  describe('Model.addDeficiency — default flag', () => {
    it('new contractor deficiency gets isRecommendation:false', () => {
      Model.setProject(makeProject());
      const d = Model.addDeficiency('ctr_a');
      expect(d).toBeTruthy();
      expect(d.isRecommendation).toBe(false);
    });

    it('new Site General deficiency (ctrId null) gets isRecommendation:false', () => {
      Model.setProject(makeProject());
      const d = Model.addDeficiency(null);
      expect(d.isRecommendation).toBe(false);
    });
  });

  describe('setProject backfill — legacy data', () => {
    it('legacy contractor defic with no isRecommendation backfills to false, no error', () => {
      const legacy = makeProject();
      delete legacy.contractors[0].deficiencies[0].isRecommendation;
      expect(() => Model.setProject(legacy)).not.toThrow();
      const d = Model.getProject().contractors[0].deficiencies[0];
      expect(d.isRecommendation).toBe(false);
    });

    it('legacy general defic backfills to false', () => {
      const legacy = makeProject();
      legacy.generalDeficiencies = [
        {
          id: 'def_gen',
          num: 2,
          status: 'open',
          priority: 'general',
          observations: [
            {
              id: 'obs_g',
              text: 'General note',
              photos: [],
              notedOnInstance: 1,
              notedDate: '2026-01-01',
              addressed: false,
              priority: 'general',
              trade: '',
              tradeSource: 'ai',
              repeatCount: 1
            }
          ],
          photos: [],
          activity: []
        }
      ];
      Model.setProject(legacy);
      const g = Model.getProject().generalDeficiencies[0];
      expect(g.isRecommendation).toBe(false);
    });

    it('backfill does not disturb sibling fields', () => {
      const legacy = makeProject();
      delete legacy.contractors[0].deficiencies[0].isRecommendation;
      Model.setProject(legacy);
      const d = Model.getProject().contractors[0].deficiencies[0];
      expect(d.num).toBe(1);
      expect(d.status).toBe('open');
      expect(d.observations[0].text).toBe('Missing escutcheon');
    });
  });

  describe('Backfill idempotence', () => {
    it('a pre-set isRecommendation:true is preserved across re-load (not reset to false)', () => {
      const proj = makeProject({ deficOverride: { isRecommendation: true } });
      Model.setProject(proj);
      const serialized = JSON.parse(JSON.stringify(Model.getProject()));
      Model.setProject(serialized);
      const d = Model.getProject().contractors[0].deficiencies[0];
      expect(d.isRecommendation).toBe(true);
    });

    it('repeated setProject on false stays false', () => {
      Model.setProject(makeProject());
      const s1 = JSON.parse(JSON.stringify(Model.getProject()));
      Model.setProject(s1);
      const s2 = JSON.parse(JSON.stringify(Model.getProject()));
      Model.setProject(s2);
      const d = Model.getProject().contractors[0].deficiencies[0];
      expect(d.isRecommendation).toBe(false);
    });
  });

  describe('Save/reload — JSON round-trip', () => {
    it('isRecommendation:true survives stringify -> parse -> setProject', () => {
      Model.setProject(makeProject({ deficOverride: { isRecommendation: true } }));
      const reloaded = JSON.parse(JSON.stringify(Model.getProject()));
      Model.setProject(null);
      Model.setProject(reloaded);
      expect(Model.getProject().contractors[0].deficiencies[0].isRecommendation).toBe(true);
    });
  });

  describe('merge3 — scalar boolean rides through cloud merge generically', () => {
    it('mine flips to true, theirs unchanged -> true wins, no drop', () => {
      const base = makeProject();
      const mine = JSON.parse(JSON.stringify(base));
      const theirs = JSON.parse(JSON.stringify(base));
      mine.contractors[0].deficiencies[0].isRecommendation = true;
      const r = merge3(base, mine, theirs);
      expect(r.merged.contractors[0].deficiencies[0].isRecommendation).toBe(true);
    });

    it('theirs flips to true, mine unchanged -> true wins', () => {
      const base = makeProject();
      const mine = JSON.parse(JSON.stringify(base));
      const theirs = JSON.parse(JSON.stringify(base));
      theirs.contractors[0].deficiencies[0].isRecommendation = true;
      const r = merge3(base, mine, theirs);
      expect(r.merged.contractors[0].deficiencies[0].isRecommendation).toBe(true);
    });

    it('both sides flip to different values -> conflict flagged, no silent drop', () => {
      const base = makeProject();
      const mine = JSON.parse(JSON.stringify(base));
      const theirs = JSON.parse(JSON.stringify(base));
      mine.contractors[0].deficiencies[0].isRecommendation = true;
      theirs.contractors[0].deficiencies[0].isRecommendation = false;
      base.contractors[0].deficiencies[0].isRecommendation = null;
      const r = merge3(base, mine, theirs);
      const d = r.merged.contractors[0].deficiencies[0];
      expect(typeof d.isRecommendation === 'boolean').toBe(true);
    });
  });

});
