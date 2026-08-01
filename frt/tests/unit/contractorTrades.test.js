/**
 * contractorTrades.test.js — S135 Phase 1a contractor-scoped trade schema
 *
 * Covers the contractor-level trade declaration model that replaces the
 * S133/S134 per-obs AI tagging approach. Each contractor carries a
 * `trades: string[]` field naming which trade columns they appear under
 * in the trade board, and an auto-assigned `color: string` from a fixed
 * 8-color palette. The project carries its own `projectTrades: string[]`
 * (defaults to 4 trades; user adds custom ones via `+ trade`).
 *
 * Scope (data layer only — trade board UI is Phase 1b, S136):
 *   1. CONTRACTOR_COLOR_PALETTE: 8 unique hex strings
 *   2. nextContractorColor: picks first unused, cycles after 8
 *   3. setProject migration: idempotent default seeding
 *   4. addContractor: auto-color + trades:[]
 *   5. addDeficiency: auto-inherits trade from single-trade contractor
 *   6. addObservation: auto-inherits trade from sibling obs or contractor
 *   7. setContractorTrades: replaces array
 *   8. addProjectTrade / removeProjectTrade: idempotent, cascade cleanup
 *   9. addContractorToTrade: case-insensitive dedup, atomic add-trade-and-contractor
 *  10. removeContractorFromTrade: narrow remove
 *  11. merge3: contractor.trades + .color + project.projectTrades ride through
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  Model,
  TRADE_LIST,
  CONTRACTOR_COLOR_PALETTE,
  nextContractorColor
} from '../../js/data/model.js';
import { merge3 } from '../../js/data/merge.js';

function makeProject(opts) {
  opts = opts || {};
  return {
    id: 'p_test_' + Date.now(),
    name: 'Test Project',
    number: 'TEST-001',
    currentFrtInstance: 1,
    contractors: opts.contractors || [],
    generalDeficiencies: [],
    drawings: []
  };
}

describe('S135 Phase 1a — contractor-scoped trade schema', () => {

  beforeEach(() => {
    Model.setProject(null);
  });

  describe('CONTRACTOR_COLOR_PALETTE', () => {
    it('exports exactly 8 unique hex strings', () => {
      expect(CONTRACTOR_COLOR_PALETTE).toHaveLength(8);
      const unique = new Set(CONTRACTOR_COLOR_PALETTE);
      expect(unique.size).toBe(8);
      // Every entry is a 7-char hex string
      CONTRACTOR_COLOR_PALETTE.forEach(c => {
        expect(c).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });
  });

  describe('nextContractorColor', () => {
    it('returns the first palette color when none are used', () => {
      expect(nextContractorColor([])).toBe(CONTRACTOR_COLOR_PALETTE[0]);
    });

    it('skips used colors and returns the next unused', () => {
      const used = [CONTRACTOR_COLOR_PALETTE[0], CONTRACTOR_COLOR_PALETTE[1]];
      expect(nextContractorColor(used)).toBe(CONTRACTOR_COLOR_PALETTE[2]);
    });

    it('cycles when all 8 palette colors are used', () => {
      const allUsed = CONTRACTOR_COLOR_PALETTE.slice();
      // 9th contractor enters with 8 colors used → 8 % 8 = 0 → cycles to palette[0]
      expect(nextContractorColor(allUsed)).toBe(CONTRACTOR_COLOR_PALETTE[0]);
    });

    it('handles undefined input as empty', () => {
      expect(nextContractorColor(undefined)).toBe(CONTRACTOR_COLOR_PALETTE[0]);
    });
  });

  describe('setProject migration — idempotent seeding', () => {
    it('seeds projectTrades from TRADE_LIST when missing', () => {
      Model.setProject(makeProject());
      const p = Model.getProject();
      expect(p.projectTrades).toEqual(TRADE_LIST);
    });

    it('preserves an existing projectTrades array on reload', () => {
      const custom = ['Sprinkler', 'Custom Trade X'];
      const proj = makeProject();
      proj.projectTrades = custom;
      Model.setProject(proj);
      expect(Model.getProject().projectTrades).toEqual(custom);
    });

    it('initializes contractor.trades to [] and assigns unique colors', () => {
      const proj = makeProject({
        contractors: [
          { id: 'ctr_a', name: 'Acme', deficiencies: [] },
          { id: 'ctr_b', name: 'Beta', deficiencies: [] }
        ]
      });
      Model.setProject(proj);
      const ctrs = Model.getProject().contractors;
      expect(ctrs[0].trades).toEqual([]);
      expect(ctrs[1].trades).toEqual([]);
      expect(ctrs[0].color).toBe(CONTRACTOR_COLOR_PALETTE[0]);
      expect(ctrs[1].color).toBe(CONTRACTOR_COLOR_PALETTE[1]);
    });

    it('is idempotent — running setProject twice produces the same result', () => {
      const proj = makeProject({
        contractors: [{ id: 'ctr_a', name: 'Acme', deficiencies: [] }]
      });
      Model.setProject(proj);
      const colorAfterFirst = Model.getProject().contractors[0].color;
      const tradesAfterFirst = Model.getProject().contractors[0].trades;

      // Reload the same project shape — should not re-assign colors or wipe trades
      Model.setProject(Model.getProject());
      expect(Model.getProject().contractors[0].color).toBe(colorAfterFirst);
      expect(Model.getProject().contractors[0].trades).toBe(tradesAfterFirst);
      expect(Model.getProject().projectTrades).toEqual(TRADE_LIST);
    });

    it('preserves existing contractor.trades + .color on reload', () => {
      // S560b — FIXTURE FIX (Lane A ruling: the code is correct, the harness was
      // not). The fixture used '#ABCDEF', an arbitrary hex that is not a member
      // of CONTRACTOR_COLOR_PALETTE — and S284 deliberately migrates exactly
      // those to the locked palette at load ("remap them all", Mark). So the old
      // assertion was demanding the opposite of a shipped, intended behaviour,
      // and would have gone on failing however long anyone stared at model.js.
      // Two rules are both live and both right: the auto-assign only fills a
      // MISSING colour, and S284 remaps any NON-PALETTE colour. A hand-set
      // colour therefore survives only when it is a palette member — which is
      // what "hand-set colour survives reload" can mean now that the palette is
      // locked. Verified against live logic: '#D2415C' in, '#D2415C' out;
      // '#ABCDEF' in, '#5B5FD6' out.
      const proj = makeProject({
        contractors: [
          { id: 'ctr_a', name: 'Acme', trades: ['Sprinkler', 'Fire Alarm'], color: '#D2415C', deficiencies: [] }
        ]
      });
      Model.setProject(proj);
      const ctr = Model.getProject().contractors[0];
      expect(ctr.trades).toEqual(['Sprinkler', 'Fire Alarm']);
      expect(ctr.color).toBe('#D2415C');
    });
  });

  describe('addContractor', () => {
    it('initializes trades:[] and auto-assigns a palette color', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('First Co');
      expect(c.trades).toEqual([]);
      expect(c.color).toBe(CONTRACTOR_COLOR_PALETTE[0]);
    });

    it('assigns sequential palette colors for new contractors', () => {
      Model.setProject(makeProject());
      const c1 = Model.addContractor('First');
      const c2 = Model.addContractor('Second');
      const c3 = Model.addContractor('Third');
      expect(c1.color).toBe(CONTRACTOR_COLOR_PALETTE[0]);
      expect(c2.color).toBe(CONTRACTOR_COLOR_PALETTE[1]);
      expect(c3.color).toBe(CONTRACTOR_COLOR_PALETTE[2]);
    });
  });

  describe('addDeficiency — auto-inherit trade from single-trade contractor', () => {
    it('inherits obs.trade when contractor has exactly 1 trade', () => {
      Model.setProject(makeProject());
      const ctr = Model.addContractor('Sprinkler Pros');
      Model.setContractorTrades(ctr.id, ['Sprinkler']);
      const def = Model.addDeficiency(ctr.id);
      expect(def.observations[0].trade).toBe('Sprinkler');
    });

    it('leaves obs.trade blank when contractor has 0 trades', () => {
      Model.setProject(makeProject());
      const ctr = Model.addContractor('Untriaged');
      const def = Model.addDeficiency(ctr.id);
      expect(def.observations[0].trade).toBe('');
    });

    it('leaves obs.trade blank when contractor has multiple trades (ambiguous)', () => {
      Model.setProject(makeProject());
      const ctr = Model.addContractor('Multi');
      Model.setContractorTrades(ctr.id, ['Sprinkler', 'Fire Alarm']);
      const def = Model.addDeficiency(ctr.id);
      expect(def.observations[0].trade).toBe('');
    });

    it('leaves obs.trade blank for Site General deficiencies (no contractor)', () => {
      Model.setProject(makeProject());
      const def = Model.addDeficiency(null);
      expect(def.observations[0].trade).toBe('');
    });
  });

  describe('addObservation — auto-inherit from sibling obs or single-trade contractor', () => {
    it('inherits trade from the most recent sibling obs that has one set', () => {
      Model.setProject(makeProject());
      const ctr = Model.addContractor('Multi');
      Model.setContractorTrades(ctr.id, ['Sprinkler', 'Fire Alarm']);
      const def = Model.addDeficiency(ctr.id);
      Model.updateObsTrade(def.id, 0, 'Fire Alarm', 'manual');
      const obs2 = Model.addObservation(def.id);
      expect(obs2.trade).toBe('Fire Alarm');
    });

    it('falls back to single-trade contractor when no sibling carries a trade', () => {
      Model.setProject(makeProject());
      const ctr = Model.addContractor('Solo');
      Model.setContractorTrades(ctr.id, ['Sprinkler']);
      const def = Model.addDeficiency(ctr.id);
      // First obs already inherits 'Sprinkler' from addDeficiency.
      // Second obs path: there IS a sibling with a trade, so it follows
      // the sibling-trace path — verify it picks up that value too.
      const obs2 = Model.addObservation(def.id);
      expect(obs2.trade).toBe('Sprinkler');
    });
  });

  describe('setContractorTrades', () => {
    it('replaces the trades array', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      expect(Model.setContractorTrades(c.id, ['Sprinkler', 'Fire Alarm'])).toBe(true);
      const after = Model.getProject().contractors[0];
      expect(after.trades).toEqual(['Sprinkler', 'Fire Alarm']);
    });

    it('accepts [] to clear', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      Model.setContractorTrades(c.id, ['Sprinkler']);
      Model.setContractorTrades(c.id, []);
      expect(Model.getProject().contractors[0].trades).toEqual([]);
    });

    it('returns false for unknown contractor id', () => {
      Model.setProject(makeProject());
      expect(Model.setContractorTrades('nope', ['Sprinkler'])).toBe(false);
    });

    it('does not mutate caller-supplied array reference', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      const arr = ['Sprinkler'];
      Model.setContractorTrades(c.id, arr);
      arr.push('Mutated');
      expect(Model.getProject().contractors[0].trades).toEqual(['Sprinkler']);
    });
  });

  describe('addProjectTrade / removeProjectTrade', () => {
    it('addProjectTrade appends a new trade', () => {
      Model.setProject(makeProject());
      expect(Model.addProjectTrade('Smoke Control')).toBe(true);
      expect(Model.getProject().projectTrades).toContain('Smoke Control');
    });

    it('addProjectTrade is idempotent (case-insensitive)', () => {
      Model.setProject(makeProject());
      expect(Model.addProjectTrade('sprinkler')).toBe(false); // already in defaults as 'Sprinkler'
      const trades = Model.getProject().projectTrades;
      // Default order preserved, no duplicate added
      expect(trades.filter(t => t.toLowerCase() === 'sprinkler')).toHaveLength(1);
    });

    it('addProjectTrade rejects empty/whitespace input', () => {
      Model.setProject(makeProject());
      expect(Model.addProjectTrade('')).toBe(false);
      expect(Model.addProjectTrade('   ')).toBe(false);
    });

    it('removeProjectTrade strips the trade from project AND all contractors', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      Model.setContractorTrades(c.id, ['Sprinkler', 'Fire Alarm']);
      expect(Model.removeProjectTrade('Sprinkler')).toBe(true);
      expect(Model.getProject().projectTrades).not.toContain('Sprinkler');
      expect(Model.getProject().contractors[0].trades).toEqual(['Fire Alarm']);
    });

    it('removeProjectTrade returns false for missing trade', () => {
      Model.setProject(makeProject());
      expect(Model.removeProjectTrade('Nonexistent Trade')).toBe(false);
    });
  });

  describe('addContractorToTrade / removeContractorFromTrade', () => {
    it('addContractorToTrade adds trade to contractor and ensures trade is in projectTrades', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      expect(Model.addContractorToTrade(c.id, 'Sprinkler')).toBe(true);
      expect(Model.getProject().contractors[0].trades).toEqual(['Sprinkler']);
    });

    it('addContractorToTrade is idempotent (no duplicate trade on contractor)', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      Model.addContractorToTrade(c.id, 'Sprinkler');
      Model.addContractorToTrade(c.id, 'Sprinkler');
      expect(Model.getProject().contractors[0].trades).toEqual(['Sprinkler']);
    });

    it('addContractorToTrade adds custom trade to projectTrades atomically', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      expect(Model.addContractorToTrade(c.id, 'Specialty Trade')).toBe(true);
      expect(Model.getProject().projectTrades).toContain('Specialty Trade');
      expect(Model.getProject().contractors[0].trades).toContain('Specialty Trade');
    });

    it('addContractorToTrade is case-insensitive when matching existing projectTrades', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      Model.addContractorToTrade(c.id, 'sprinkler'); // lowercase
      // Should match 'Sprinkler' from defaults, not add a duplicate
      const trades = Model.getProject().projectTrades;
      expect(trades.filter(t => t.toLowerCase() === 'sprinkler')).toHaveLength(1);
      // And the contractor should store the canonical (default) casing
      expect(Model.getProject().contractors[0].trades).toEqual(['Sprinkler']);
    });

    it('addContractorToTrade handles multi-trade contractor (Vipond in 2 columns)', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('Vipond');
      Model.addContractorToTrade(c.id, 'Sprinkler');
      Model.addContractorToTrade(c.id, 'Fire Alarm');
      expect(Model.getProject().contractors[0].trades).toEqual(['Sprinkler', 'Fire Alarm']);
    });

    it('removeContractorFromTrade removes only from contractor, leaves projectTrades intact', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      Model.setContractorTrades(c.id, ['Sprinkler', 'Fire Alarm']);
      expect(Model.removeContractorFromTrade(c.id, 'Sprinkler')).toBe(true);
      expect(Model.getProject().contractors[0].trades).toEqual(['Fire Alarm']);
      expect(Model.getProject().projectTrades).toContain('Sprinkler');
    });

    it('removeContractorFromTrade returns false when trade not on contractor', () => {
      Model.setProject(makeProject());
      const c = Model.addContractor('X');
      expect(Model.removeContractorFromTrade(c.id, 'Sprinkler')).toBe(false);
    });
  });

  describe('merge3 — new schema fields ride through cloud merge', () => {
    function build(state) {
      return Object.assign({
        id: 'p1',
        contractors: [],
        projectTrades: TRADE_LIST.slice()
      }, state);
    }

    it('preserves contractor.trades when only one side edits', () => {
      const base = build({
        contractors: [{ id: 'c1', name: 'X', trades: [], color: '#5C7A6E', deficiencies: [] }]
      });
      const mine = build({
        contractors: [{ id: 'c1', name: 'X', trades: ['Sprinkler'], color: '#5C7A6E', deficiencies: [] }]
      });
      const theirs = JSON.parse(JSON.stringify(base));
      const r = merge3(base, mine, theirs);
      expect(r.conflicts).toEqual([]);
      expect(r.merged.contractors[0].trades).toEqual(['Sprinkler']);
    });

    it('preserves contractor.color when only one side edits', () => {
      const base = build({
        contractors: [{ id: 'c1', name: 'X', trades: [], color: null, deficiencies: [] }]
      });
      const mine = build({
        contractors: [{ id: 'c1', name: 'X', trades: [], color: '#9C5070', deficiencies: [] }]
      });
      const theirs = JSON.parse(JSON.stringify(base));
      const r = merge3(base, mine, theirs);
      expect(r.conflicts).toEqual([]);
      expect(r.merged.contractors[0].color).toBe('#9C5070');
    });

    it('preserves project.projectTrades when only one side edits', () => {
      const base = build({ projectTrades: TRADE_LIST.slice() });
      const mine = build({ projectTrades: TRADE_LIST.concat(['Smoke Control']) });
      const theirs = JSON.parse(JSON.stringify(base));
      const r = merge3(base, mine, theirs);
      expect(r.conflicts).toEqual([]);
      expect(r.merged.projectTrades).toContain('Smoke Control');
    });

    it('flags a conflict when both sides change contractor.trades to different values', () => {
      const base = build({
        contractors: [{ id: 'c1', name: 'X', trades: [], color: '#5C7A6E', deficiencies: [] }]
      });
      const mine = build({
        contractors: [{ id: 'c1', name: 'X', trades: ['Sprinkler'], color: '#5C7A6E', deficiencies: [] }]
      });
      const theirs = build({
        contractors: [{ id: 'c1', name: 'X', trades: ['Fire Alarm'], color: '#5C7A6E', deficiencies: [] }]
      });
      const r = merge3(base, mine, theirs);
      // Conflict on the trades array
      expect(r.conflicts.length).toBeGreaterThan(0);
      expect(r.conflicts.some(c => c.path.indexOf('trades') >= 0)).toBe(true);
    });
  });
});
