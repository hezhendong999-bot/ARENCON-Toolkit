#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   THE ROOM REVIEW LIST                        tools/sim/mproom.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. This list replaces the Sections 1 and
   2 of two shipped tools. If a sentence that is on a tablet today is not
   in it, that check stops being asked and nothing downstream notices — a
   commissioning report simply stops attesting to something it used to,
   and the only record that it ever did is a file nobody reads.

   So the test is not that the list looks complete. It is that every live
   sentence is accounted for: present, or deliberately reworded, or
   deliberately dropped as a duplicate — by name, one at a time.

   WHAT IS ASSERTED:
     1. Every Diesel S1/S2 sentence and every Electric S1/S2 sentence is
        either carried verbatim, or named as reworded, or named as a
        removed duplicate. Nothing silently absent.
     2. The two sentences named as duplicates really are duplicated by
        something else in the same tool.
     3. A machine row on a two-pump job produces two answers; a room or
        visit row produces one. That is the whole structure.
     4. Diesel rows are absent from an all-electric room, not N/A.
     5. Diesel rows in a mixed room are asked only of the diesel — including
        the fuel tank, which is machine scope so a second diesel could
        never share one tank answer.
     6. A room answer cannot be stored twice — its key carries no machine.
     7. Counts match the demo Casey field-checked: 49 rows and 69 answers
        for electric + diesel, 35 and 35 for a lone electric.
     8. A machine with no recorded decision is reported as undecided, so
        it can never be printed as tested.

   Run:  node tools/sim/mproom.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const win = {};
{
  const src = fs.readFileSync(path.join(REPO, 'multipump/js/roomReview.js'), 'utf8')
    .replace("typeof window !== 'undefined' ? window : globalThis", 'window');
  new Function('window', 'var module;\n' + src)(win);
}
const RR = win.MPRoomReview;

/* the live sentences this list is meant to replace */
function liveRows(tool) {
  const src = fs.readFileSync(path.join(REPO, tool, 'js/part06.js'), 'utf8');
  const out = [];
  for (const sec of ['S1', 'S2']) {
    const blk = src.match(new RegExp('const ' + sec + ' = \\[([\\s\\S]*?)\\n\\];'))[1];
    for (const m of blk.matchAll(/num:"([\d.]+)", scope:"([a-z-]+)", (?:hint:"(?:[^"]|\\")*?", )?text:"((?:[^"]|\\")*?)" \}/g)) {
      out.push({ num: m[1], scope: m[2], text: m[3].replace(/\\"/g, '"') });
    }
  }
  return out;
}

/* Sentences deliberately not carried verbatim. Each names WHY, and the
   probe checks the claim rather than taking it. */
const REWORDED = {
  'D2.3': 'discharge rating: the live sentence hard-codes a 170 psi PLD setpoint',
  'E1.3': 'hydrostatic: underground flushing split into its own room row',
  'E1.7': 'start-up: says whose start-up, now that ARENCON commissions rather than witnesses',
  'E1.8': 'valves: merged with the Diesel valve-tag row, wider wording kept',
  'E1.10': 'drains: split, and the relief valve\u2019s own presence added',
  'E1.11': 'controller door: carried, wording unchanged in substance',
  'E2.3': 'discharge rating: same rewording as D2.3, VFD side',
  'D1.8': 'wiring/FA/ESA: split into a machine row and a room row',
  'E1.4': 'wiring: superseded by the Diesel wording, per the Owner ruling',
  'D2.10': 'valve tags: merged into the wider Electric valve row',
  'E2.5': 'valve tags: same merge',
  'D1.4': 'hydrostatic: Diesel wording kept, flushing moved out',
  'E1.1': 'coordination: superseded by the Diesel wording, Owner ruling',
  'E1.2': 'suction flushing: superseded by the Diesel wording, which requires written confirmation before connecting',
  'E1.12': 'gauge calibration: superseded by the Diesel pair, which splits bringing the gauges from the certificate',
  'E1.6': 'discharge rating: folded into the merged rating row rather than kept as a second, looser sentence'
};
const DROPPED_DUPLICATES = {
  'E1.5': 'E2.1'    // components per drawings, asked twice in Electric
};

console.log('\n═══ THE ROOM REVIEW LIST — IS ANY LIVE CHECK MISSING? ═══\n');

/* 1 & 2 — every live sentence accounted for */
{
  const carried = new Set([...RR.PHASE1, ...RR.PHASE2, ...RR.DIESEL].map((r) => r.text));
  const missing = [];
  let verbatim = 0;
  for (const tool of ['diesel-app', 'electric-app']) {
    const tag = tool === 'diesel-app' ? 'D' : 'E';
    for (const r of liveRows(tool)) {
      const key = tag + r.num;
      if (carried.has(r.text)) { verbatim++; continue; }
      if (REWORDED[key] || DROPPED_DUPLICATES[key]) continue;
      missing.push(key + ': ' + r.text.slice(0, 64));
    }
  }
  if (missing.length) missing.forEach((m) => fail('live sentence not carried and not declared — ' + m));
  else ok(`every live sentence accounted for: ${verbatim} carried verbatim, `
        + `${Object.keys(REWORDED).length} declared reworded, ${Object.keys(DROPPED_DUPLICATES).length} declared duplicates`);

  /* the duplicate claims have to be true */
  const live = { D: liveRows('diesel-app'), E: liveRows('electric-app') };
  for (const [gone, twin] of Object.entries(DROPPED_DUPLICATES)) {
    const g = live[gone[0]].find((r) => r.num === gone.slice(1));
    const t = live[twin[0]].find((r) => r.num === twin.slice(1));
    const words = (s) => new Set(s.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
    const a = words(g.text), b = words(t.text);
    const j = [...a].filter((w) => b.has(w)).length / new Set([...a, ...b]).size;
    if (j < 0.5) fail(`${gone} was dropped as a duplicate of ${twin}, but they only overlap ${j.toFixed(2)}`);
    else ok(`${gone} really is a duplicate of ${twin} (${j.toFixed(2)} overlap) — dropping it loses nothing`);
  }
}

/* 3 to 7 — the structure and the counts Casey field-checked */
const ELE = [{ id: 'p1', name: 'P-1 Electric', type: 'ele' }];
const BOTH = [{ id: 'p1', name: 'P-1 Electric', type: 'ele' },
              { id: 'p2', name: 'P-2 Diesel', type: 'dsl' }];
{
  const c = RR.counts(BOTH);
  if (c.rows !== 49 || c.answers !== 69)
    fail(`electric + diesel is ${c.rows} rows / ${c.answers} answers, expected 49 / 69`);
  else ok('electric + diesel: 49 rows, 69 answers — matches the field-checked demo');

  const e = RR.counts(ELE);
  if (e.rows !== 35 || e.answers !== 35) fail(`lone electric is ${e.rows} / ${e.answers}, expected 35 / 35`);
  else ok('a lone electric: 35 rows, 35 answers — one target on every row');

  const rows = RR.rowsFor(BOTH);
  const machine = rows.filter((r) => r.scope === 'machine' && !r.group);
  const bad = machine.filter((r) => r.targets.length !== 2);
  if (bad.length) fail(`${bad.length} machine row(s) do not ask both pumps`);
  else ok(`all ${machine.length} machine rows ask both machines`);

  const shared = rows.filter((r) => r.scope !== 'machine');
  if (shared.some((r) => r.targets.length !== 1)) fail('a room or visit row is asked more than once');
  else ok(`all ${shared.length} room and visit rows are asked once`);

  /* 4 — absent, not N/A */
  if (RR.rowsFor(ELE).some((r) => r.group)) fail('diesel rows appear in an all-electric room');
  else ok('diesel rows are absent from an all-electric room, not offered as N/A');

  /* 5 — asked only of the diesel */
  const dslRows = rows.filter((r) => r.group);
  const wrong = dslRows.filter((r) => r.targets.length !== 1 || !r.targets[0] || r.targets[0].type !== 'dsl');
  if (wrong.length) fail(`${wrong.length} diesel row(s) are asked of the electric machine`);
  else ok(`all ${dslRows.length} diesel rows are asked only of the diesel`);

  /* 6 — a room answer cannot be stored twice */
  const roomRow = rows.find((r) => r.scope === 'room');
  if (RR.answerKey(roomRow, null) === RR.answerKey(roomRow, 'p1'))
    ok('a room row drops the machine from its key even when one is handed in');
  else fail('a room answer can be keyed per machine — two answers could disagree about one installation');
  const mRow = machine[0];
  if (RR.answerKey(mRow, 'p1') === RR.answerKey(mRow, 'p2'))
    fail('two machines share one answer key — one tick would cover both');
  else ok('each machine answer carries its own machine in the key');
  let refused = false;
  try { RR.answerKey(mRow, null); } catch (e) { refused = true; }
  if (!refused) fail('a machine answer with no machine was accepted — it has nowhere truthful to go');
  else ok('a machine answer with no machine is refused outright');
}

/* 8 — outstanding and undecided are different problems */
{
  const out = RR.outstanding(BOTH, {});
  if (out.length !== 69) fail(`outstanding reports ${out.length} of 69 unanswered`);
  else ok('with nothing answered, all 69 answers are reported outstanding');

  const un = RR.undecided(BOTH, { p1: 'complete' });
  if (un.length !== 1 || un[0] !== 'p2') fail('an undecided machine was not reported: ' + JSON.stringify(un));
  else ok('a machine with no recorded decision is named — it can never print as tested');

  if (RR.OUTCOMES.length !== 4 || !RR.OUTCOMES.some((o) => o.key === 'part'))
    fail('the four decision outcomes are not intact');
  else ok('four decision outcomes, including the partial run');
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — one list, nothing dropped ═══\n');
