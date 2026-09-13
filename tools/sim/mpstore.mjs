#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   THE MULTI-PUMP STORE                       tools/sim/mpstore.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. A machine answer carries the machine
   in its key. Three ways that becomes a lie on disk:

     A. A pump is removed from the report — by a mis-tap, or because the
        job changed — and its answers stay behind under a key naming a
        machine that no longer exists. They are in the file, counted by
        nothing, printed by nothing, and invisible on screen. A morning's
        readings, present and unreachable.
     B. A merge arrives from a device that knew a different pump set, and
        writes answers for a machine this report does not have.
     C. A pump is removed and its answers are deleted with it. That is the
        version people prefer until the day it happens to real readings.

   The rule: removing a pump HANDS BACK its answers rather than destroying
   them, and any document containing an answer for an absent machine is
   refused rather than written.

   WHAT IS ASSERTED:
     1. A blank report is sound, and a report with an orphaned answer is
        named as unsound.
     2. Saving an unsound report is refused.
     3. Removing a pump returns its answers and its decision, and leaves
        the other machine's untouched.
     4. Those answers can be put back exactly.
     5. A merge carrying answers for an unknown machine is refused, and
        the local document survives intact.
     6. A merge that is sound is applied.
     7. Shared answers — room and visit — survive a pump being removed,
        because they were never that machine's.
     8. A duplicate pump id is refused; two machines with one id would
        share every answer between them.

   Run:  node tools/sim/mpstore.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const mod = await import(pathToFileURL(path.join(REPO, 'multipump/js/store.js')).href);

/* a stand-in for the device database — the store only ever asks it to
   get and put, which is the whole of the contract it depends on */
function fakeIDB() {
  const rows = {};
  return {
    get: (store, k) => Promise.resolve(rows[store + '|' + k] || null),
    put: (store, rec) => { rows[store + '|' + rec.k] = rec; return Promise.resolve(rec); },
    _rows: rows
  };
}

function seeded() {
  const s = mod.createStore({ IDB: fakeIDB() });
  return s.open('4380.24').then(() => {
    s.addPump({ id: 'p1', name: 'FP-1 Electric', type: 'ele' });
    s.addPump({ id: 'p2', name: 'FP-2 Diesel', type: 'dsl' });
    const r = s.get();
    r.answers['p2_4@p1'] = { status: 'yes', _ts: 1 };
    r.answers['p2_4@p2'] = { status: 'no', _ts: 2 };
    r.answers['p2_18'] = { status: 'yes', _ts: 3 };      /* a room answer */
    r.decisions.p1 = 'complete';
    r.decisions.p2 = 'open';
    return s;
  });
}

console.log('\n═══ THE MULTI-PUMP STORE — CAN AN ANSWER BELONG TO NOBODY? ═══\n');

/* 1 & 2 */
{
  const s = await seeded();
  if (s.orphanAnswers(s.get()).length) fail('a sound report was reported as having orphans');
  else ok('a report whose answers all name a machine in it is sound');

  s.get().answers['p2_4@p9'] = { status: 'yes', _ts: 9 };
  const orphans = s.orphanAnswers(s.get());
  if (!orphans.includes('p2_4@p9')) fail('an answer for an absent machine was not named');
  else ok('an answer naming a machine that is not in the report is named as an orphan');

  let refused = false;
  try { await s.save(); } catch (e) { refused = /not in this report/.test(e.message); }
  if (!refused) fail('an unsound report was saved — the answer would sit on disk unreachable');
  else ok('saving a report with an orphaned answer is refused');
}

/* 3, 4, 7 */
{
  const s = await seeded();
  const held = s.removePump('p2');
  if (held.count !== 1 || !held.answers['p2_4@p2']) fail("removing a pump did not hand back its answers");
  else ok("removing a pump hands back its answers rather than destroying them");
  if (held.decision !== 'open') fail('the removed machine\u2019s decision was not handed back');
  else ok("the removed machine's decision comes back with it");
  if (!s.get().answers['p2_4@p1']) fail("the other machine's answer was taken too");
  else ok("the other machine's answers are untouched");
  if (!s.get().answers['p2_18']) fail('a room answer was removed with a machine');
  else ok('room answers survive — they were never that machine\u2019s');
  if (s.orphanAnswers(s.get()).length) fail('removing a pump left orphans behind');
  else ok('nothing is left behind pointing at the removed machine');

  s.restorePump({ id: 'p2', name: 'FP-2 Diesel', type: 'dsl' }, held);
  const back = s.get();
  if (!back.answers['p2_4@p2'] || back.answers['p2_4@p2'].status !== 'no')
    fail('the held answers did not come back exactly');
  else ok('the held answers go back exactly as they were');
  if (back.decisions.p2 !== 'open') fail('the decision did not come back');
  else ok('the decision comes back with the machine');
}

/* 5 & 6 */
{
  const s = await seeded();
  const before = JSON.stringify(s.get());
  const bad = JSON.parse(before);
  bad.answers['p2_9@p7'] = { status: 'yes', _ts: 5 };
  const after = s.model.applyMerged(bad);
  if (JSON.stringify(after) !== before) fail('a merge carrying an unknown machine was applied');
  else ok('a merge carrying answers for a machine not in this report is refused');

  const good = JSON.parse(before);
  good.answers['p2_9@p1'] = { status: 'yes', _ts: 6 };
  const applied = s.model.applyMerged(good);
  if (!applied.answers['p2_9@p1']) fail('a sound merge was refused');
  else ok('a sound merge is applied');
}

/* 8 */
{
  const s = await seeded();
  let refused = false;
  try { s.addPump({ id: 'p1', name: 'Another', type: 'dsl' }); } catch (e) { refused = true; }
  if (!refused) fail('a duplicate pump id was accepted — two machines would share every answer');
  else ok('a duplicate pump id is refused');
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — every answer belongs to a machine that exists ═══\n');
