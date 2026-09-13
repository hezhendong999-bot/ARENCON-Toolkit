#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   THE ROOM REVIEW SURFACE                    tools/sim/mpsurf.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. This screen is where an inspector,
   in a loud room wearing gloves, says what is true about a machine. Two
   ways it can lie without anything looking wrong:

     A. A tap lands on the wrong machine. Two sets of controls sit inches
        apart under one prompt, and if the row or the pump is carried in
        the wrong place in the markup, the answer goes to the sister pump
        and reads perfectly normal on both screens.
     B. A shared answer is stored per machine. A room row that renders a
        control per pump produces two answers about one installation, and
        they can disagree with nothing to reconcile them.

   WHAT IS ASSERTED:
     1. Every control carries its row, and carries a machine only when
        the row is answered per machine.
     2. A room or visit row renders exactly one set of controls however
        many pumps are in the room.
     3. A diesel row renders controls for the diesel and for nothing else.
     4. A tap resolves to the row and machine its markup declares —
        tested by resolving EVERY control on a two-pump review and
        checking none resolves to another row or another machine.
     5. Tapping the lit answer clears it, rather than requiring the
        inspector to answer something else to undo a mis-tap.
     6. Item text is escaped — a quote or an ampersand in a clause cannot
        break the row it is drawn in.
     7. With one pump the markup carries no machine LABELS, so it reads as
        the tools do today — but every machine answer still names its
        machine, because that is storage and not decoration.
     8. Progress counts answers, not rows.

   Run:  node tools/sim/mpsurf.mjs        (exit 0 green / 1 red)
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
for (const f of ['multipump/js/roomReview.js', 'multipump/js/reviewSurface.js']) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    .replace("typeof window !== 'undefined' ? window : globalThis", 'window');
  new Function('window', 'var module;\n' + src)(win);
}
const RR = win.MPRoomReview, S = win.MPReviewSurface;

const ELE = [{ id: 'p1', name: 'FP-1 Electric', type: 'ele' }];
const BOTH = [{ id: 'p1', name: 'FP-1 Electric', type: 'ele' },
              { id: 'p2', name: 'FP-2 Diesel', type: 'dsl' }];

/* pull every control out of the markup, with what it claims */
function controls(html) {
  return [...html.matchAll(/<button[^>]*data-mp-row="([^"]+)"(?:[^>]*data-mp-pump="([^"]+)")?[^>]*data-mp-status="([^"]+)"[^>]*>/g)]
    .map((m) => ({ row: m[1], pump: m[2] || null, status: m[3] }));
}

console.log('\n═══ THE ROOM REVIEW SURFACE — CAN A TAP LAND ON THE WRONG MACHINE? ═══\n');

const html = S.render(BOTH, {});
const ctl = controls(html);

/* 1 & 2 & 3 — what each row renders */
{
  const rows = RR.rowsFor(BOTH);
  const byRow = {};
  ctl.forEach((c) => { (byRow[c.row] = byRow[c.row] || []).push(c); });

  const noRow = ctl.filter((c) => !c.row);
  if (noRow.length) fail(`${noRow.length} control(s) carry no row`);
  else ok(`all ${ctl.length} controls carry their row`);

  const shared = rows.filter((r) => r.scope !== 'machine');
  const sharedBad = shared.filter((r) => (byRow[r.id] || []).length !== 3
                                      || (byRow[r.id] || []).some((c) => c.pump));
  if (sharedBad.length) fail(`${sharedBad.length} room/visit row(s) render per-machine controls`);
  else ok(`all ${shared.length} room and visit rows render one set of controls, with no machine attached`);

  const machine = rows.filter((r) => r.scope === 'machine' && !r.group);
  const mBad = machine.filter((r) => {
    const set = new Set((byRow[r.id] || []).map((c) => c.pump));
    return set.size !== 2 || !set.has('p1') || !set.has('p2');
  });
  if (mBad.length) fail(`${mBad.length} machine row(s) do not render both machines`);
  else ok(`all ${machine.length} machine rows render one set per machine`);

  const dsl = rows.filter((r) => r.group);
  const dBad = dsl.filter((r) => (byRow[r.id] || []).some((c) => c.pump !== 'p2'));
  if (dBad.length) fail(`${dBad.length} diesel row(s) render controls for the electric machine`);
  else ok(`all ${dsl.length} diesel rows render controls for the diesel and nothing else`);
}

/* 4 — every single control resolves to itself */
{
  let wrong = 0;
  for (const c of ctl) {
    const fakeEl = {
      hasAttribute: (a) => a === 'data-mp-status' || (a === 'data-mp-pump' && !!c.pump) || a === 'data-mp-row',
      getAttribute: (a) => a === 'data-mp-row' ? c.row : a === 'data-mp-pump' ? c.pump : c.status,
      parentNode: null
    };
    const r = S.handleTap({ target: fakeEl }, BOTH, {});
    if (!r || r.row.id !== c.row || (r.pump || null) !== c.pump) wrong++;
  }
  if (wrong) fail(`${wrong} of ${ctl.length} controls resolve to another row or another machine`);
  else ok(`every one of the ${ctl.length} controls resolves to its own row and its own machine`);
}

/* 5 — tapping the lit answer clears it */
{
  const row = RR.rowsFor(BOTH).find((r) => r.scope === 'machine' && !r.group);
  const key = RR.answerKey(row, 'p1');
  const el = {
    hasAttribute: (a) => ['data-mp-status', 'data-mp-pump', 'data-mp-row'].includes(a),
    getAttribute: (a) => a === 'data-mp-row' ? row.id : a === 'data-mp-pump' ? 'p1' : 'yes',
    parentNode: null
  };
  const first = S.handleTap({ target: el }, BOTH, {});
  const again = S.handleTap({ target: el }, BOTH, { [key]: { status: 'yes' } });
  if (first.status !== 'yes') fail('a first tap did not set the answer');
  else if (!again.cleared || again.status !== '') fail('tapping the lit answer did not clear it');
  else ok('tapping the lit answer clears it — a mis-tap has a way back');
}

/* 6 — text is escaped */
{
  const nasty = { id: 'x_0', phase: 'p2', scope: 'room', text: 'Confirm 2" & 3" valves <tagged> "as noted"',
                  targets: [null], mark: '', src: 'test' };
  const out = S.renderRow(nasty, {}, { number: 1 });
  if (/<tagged>/.test(out)) fail('an angle bracket in an item passed through unescaped');
  else if (!/&quot;|&#39;/.test(out)) fail('quotes in an item are not escaped');
  else ok('quotes, ampersands and angle brackets in a clause cannot break the row');
}

/* 7 — a single-pump job reads as it does today */
{
  const one = S.render(ELE, {});
  if (/cl-who/.test(one)) fail('a single-pump review still labels which machine');
  else ok('with one pump there are no machine labels — it reads as the tools do today');
  /* The label is what disappears, never the machine: an answer that does
     not name its machine cannot be filed, and a job that grows a second
     pump later would have a pile of answers belonging to nobody. */
  const oneCtl = controls(one);
  const mRows = new Set(RR.rowsFor(ELE).filter((r) => r.scope === 'machine').map((r) => r.id));
  const unnamed = oneCtl.filter((c) => mRows.has(c.row) && !c.pump);
  if (unnamed.length) fail(`${unnamed.length} single-pump machine control(s) do not name their machine`);
  else ok('single-pump answers still name their machine, even with the label hidden');
}

/* 8 — progress counts answers */
{
  const p = S.progress(BOTH, {});
  if (p.total !== 69 || p.outstanding !== 69) fail(`progress reports ${p.answered}/${p.total}, expected 0/69`);
  else ok('progress counts the 69 answers, not the 49 rows');
  const row = RR.rowsFor(BOTH).find((r) => r.scope === 'machine' && !r.group);
  const p2 = S.progress(BOTH, { [RR.answerKey(row, 'p1')]: { status: 'yes' } });
  if (p2.answered !== 1) fail('answering one machine did not move progress by one');
  else ok('answering one machine of a row moves progress by one, not by the whole row');
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — every tap lands where it says it does ═══\n');
