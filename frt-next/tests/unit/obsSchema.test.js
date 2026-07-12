/**
 * obsSchema.test.js — S134 trade-based grouping schema
 *
 * Covers the new per-observation fields (`trade`, `tradeSource`, `repeatCount`)
 * added in S134 as the foundation for trade-based grouping (S135) and AI
 * trade tagging (S136). These tests assert the data layer contract only —
 * UI dropdown rendering is tested separately once it lands in deficiencies.js.
 *
 * Scope:
 *   1. Model.updateObsTrade — writes both trade + tradeSource, defaults to manual
 *   2. Save/reload via setProject — trade fields survive JSON round-trip
 *   3. merge3 — trade fields ride through cloud merge (last-writer-wins, no drop)
 *   4. Legacy iar:true projects — setProject() backfills trade fields, no error
 *
 * These are pure-state tests. _queueSave is debounced 800ms via setTimeout,
 * so calling updateObsTrade then synchronously reading getProject() works
 * without waiting for IDB.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Model, TRADE_LIST } from '../../js/data/model.js';
import { merge3 } from '../../js/data/merge.js';

// Build a minimal project shape that survives setProject() normalization.
// Mirrors the structure created by Model.createNewProject + addDeficiency.
function makeProject(opts) {
  opts = opts || {};
  return {
    id: 'p_test_' + Date.now(),
    name: 'Test Project',
    number: 'TEST-001',
    currentFrtInstance: 1,
    contractors: [
      {
        id: 'ctr_a',
        name: 'Acme Mechanical',
        deficiencies: [
          {
            id: 'def_1',
            num: 1,
            status: 'open',
            priority: 'high',
            drawingId: null,
            pinX: null, pinY: null,
            notedDate: '2026-01-01',
            notedOnInstance: 1,
            observations: [
              Object.assign({
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
              }, opts.obsOverride || {})
            ],
            photos: [],
            activity: []
          }
        ]
      }
    ],
    generalDeficiencies: [],
    drawings: []
  };
}

describe('S134 obs schema — trade / tradeSource / repeatCount', () => {

  beforeEach(() => {
    Model.setProject(null);
  });

  describe('TRADE_LIST export', () => {
    it('exports the 4 S135-default trades (Sprinkler / Fire Alarm / General Contracting / Building Conditions)', () => {
      expect(TRADE_LIST).toEqual([
        'Sprinkler',
        'Fire Alarm',
        'General Contracting',
        'Building Conditions'
      ]);
    });
  });

  describe('Model.updateObsTrade — getter/setter', () => {
    it('sets trade and defaults tradeSource to manual', () => {
      Model.setProject(makeProject());
      Model.updateObsTrade('def_1', 0, 'Sprinkler');
      const obs = Model.getProject().contractors[0].deficiencies[0].observations[0];
      expect(obs.trade).toBe('Sprinkler');
      expect(obs.tradeSource).toBe('manual');
    });

    it('honors explicit AI source when passed', () => {
      Model.setProject(makeProject());
      Model.updateObsTrade('def_1', 0, 'Fire Alarm', 'ai');
      const obs = Model.getProject().contractors[0].deficiencies[0].observations[0];
      expect(obs.trade).toBe('Fire Alarm');
      expect(obs.tradeSource).toBe('ai');
    });

    it('clearing trade with empty string keeps the manual flag', () => {
      Model.setProject(makeProject({ obsOverride: { trade: 'Sprinkler', tradeSource: 'ai' } }));
      Model.updateObsTrade('def_1', 0, '');
      const obs = Model.getProject().contractors[0].deficiencies[0].observations[0];
      expect(obs.trade).toBe('');
      // Manual source so AI tagger won't re-apply a guess to a user-cleared obs
      expect(obs.tradeSource).toBe('manual');
    });

    it('no-op for missing deficiency id or invalid obs index', () => {
      Model.setProject(makeProject());
      Model.updateObsTrade('nonexistent', 0, 'Sprinkler');
      Model.updateObsTrade('def_1', 99, 'Sprinkler');
      const obs = Model.getProject().contractors[0].deficiencies[0].observations[0];
      expect(obs.trade).toBe('');
    });
  });

  describe('Save/reload — JSON round-trip preserves trade fields', () => {
    it('trade survives JSON.stringify → JSON.parse → setProject', () => {
      Model.setProject(makeProject());
      Model.updateObsTrade('def_1', 0, 'Standpipe', 'manual');

      // Serialize as if pushed to cloud / saved to IDB
      const serialized = JSON.stringify(Model.getProject());
      const reloaded = JSON.parse(serialized);

      // Clear and reload
      Model.setProject(null);
      Model.setProject(reloaded);

      const obs = Model.getProject().contractors[0].deficiencies[0].observations[0];
      expect(obs.trade).toBe('Standpipe');
      expect(obs.tradeSource).toBe('manual');
      expect(obs.repeatCount).toBe(1);
    });

    it('addObservation creates obs with default trade fields', () => {
      Model.setProject(makeProject());
      Model.addObservation('def_1');
      const observations = Model.getProject().contractors[0].deficiencies[0].observations;
      expect(observations.length).toBe(2);
      const newObs = observations[1];
      expect(newObs.trade).toBe('');
      expect(newObs.tradeSource).toBe('ai');
      expect(newObs.repeatCount).toBe(1);
    });
  });

  describe('merge3 — cloud merge preserves trade field on both sides', () => {
    it('mine sets trade, theirs unchanged → mine wins (no drop)', () => {
      const base = makeProject();
      const mine = JSON.parse(JSON.stringify(base));
      mine.contractors[0].deficiencies[0].observations[0].trade = 'Sprinkler';
      mine.contractors[0].deficiencies[0].observations[0].tradeSource = 'manual';
      const theirs = JSON.parse(JSON.stringify(base));

      const { merged, conflicts } = merge3(base, mine, theirs);
      expect(conflicts).toEqual([]);
      const mergedObs = merged.contractors[0].deficiencies[0].observations[0];
      expect(mergedObs.trade).toBe('Sprinkler');
      expect(mergedObs.tradeSource).toBe('manual');
    });

    it('theirs sets trade, mine unchanged → theirs wins', () => {
      const base = makeProject();
      const mine = JSON.parse(JSON.stringify(base));
      const theirs = JSON.parse(JSON.stringify(base));
      theirs.contractors[0].deficiencies[0].observations[0].trade = 'Fire Alarm';
      theirs.contractors[0].deficiencies[0].observations[0].tradeSource = 'ai';

      const { merged, conflicts } = merge3(base, mine, theirs);
      expect(conflicts).toEqual([]);
      const mergedObs = merged.contractors[0].deficiencies[0].observations[0];
      expect(mergedObs.trade).toBe('Fire Alarm');
      expect(mergedObs.tradeSource).toBe('ai');
    });

    it('both sides set trade to different values → conflict flagged, no silent drop', () => {
      const base = makeProject();
      const mine = JSON.parse(JSON.stringify(base));
      const theirs = JSON.parse(JSON.stringify(base));
      mine.contractors[0].deficiencies[0].observations[0].trade = 'Sprinkler';
      theirs.contractors[0].deficiencies[0].observations[0].trade = 'Fire Alarm';

      const { merged, conflicts } = merge3(base, mine, theirs);
      // Conflict must be visible to the user — never silently dropped.
      const tradeConflict = conflicts.find(c => c.path.endsWith('.trade'));
      expect(tradeConflict).toBeDefined();
      expect(tradeConflict.mine).toBe('Sprinkler');
      expect(tradeConflict.theirs).toBe('Fire Alarm');
      // Merged object still has SOME value for trade — never dropped to undefined
      expect(merged.contractors[0].deficiencies[0].observations[0].trade).toBeDefined();
    });
  });

  describe('Legacy iar:true projects — silent degrade', () => {
    it('loading a project with iar:true does not error and backfills trade fields', () => {
      // Pre-S134 project shape: obs has iar:true, no trade fields
      const legacyProject = {
        id: 'p_legacy',
        name: 'Legacy Project',
        currentFrtInstance: 1,
        contractors: [
          {
            id: 'ctr_a',
            name: 'Legacy Contractor',
            deficiencies: [
              {
                id: 'def_legacy',
                num: 1,
                status: 'open',
                priority: 'high',
                observations: [
                  {
                    id: 'obs_legacy',
                    text: 'Pre-S134 observation',
                    photos: [],
                    notedOnInstance: 1,
                    notedDate: '2025-12-01',
                    addressed: false,
                    priority: 'high',
                    iar: true  // legacy IAR flag — should silently stay in JSON, UI ignores
                    // no trade, no tradeSource, no repeatCount
                  }
                ],
                photos: [],
                activity: []
              }
            ]
          }
        ],
        generalDeficiencies: [],
        drawings: []
      };

      // Must not throw
      expect(() => Model.setProject(legacyProject)).not.toThrow();

      const obs = Model.getProject().contractors[0].deficiencies[0].observations[0];

      // Trade fields backfilled with safe defaults
      expect(obs.trade).toBe('');
      expect(obs.tradeSource).toBe('ai');
      expect(obs.repeatCount).toBe(1);

      // Legacy iar flag still present — data preserved, UI silently degrades
      expect(obs.iar).toBe(true);
    });

    it('backfill is idempotent — repeated setProject does not overwrite existing trade values', () => {
      const proj = makeProject({ obsOverride: { trade: 'Sprinkler', tradeSource: 'manual', repeatCount: 3 } });
      Model.setProject(proj);
      // Round-trip through setProject again
      const serialized = JSON.parse(JSON.stringify(Model.getProject()));
      Model.setProject(serialized);
      const obs = Model.getProject().contractors[0].deficiencies[0].observations[0];
      expect(obs.trade).toBe('Sprinkler');
      expect(obs.tradeSource).toBe('manual');
      expect(obs.repeatCount).toBe(3);
    });
  });
});
