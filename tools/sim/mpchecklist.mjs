#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   CHECKLIST SCOPE — DOES ONE ANSWER COVER TWO MACHINES?
                                             tools/sim/mpchecklist.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. A checklist is a record that somebody
   looked. On a two-pump job, an answer kept whole says a controller was
   tested when only the other pump's was — and it says it on the page an
   AHJ reads first, in the same tick that means "I checked this".

   The opposite error is quieter and still real: asking for the same
   shared suction pipe twice produces a checklist that gets clicked
   through, which is the same false record arrived at more slowly.

   And a third, worse than both because nothing on screen shows it: the
   checklist files answers by an item's POSITION in its section. Insert
   one item and every later answer shifts onto the wrong question. If
   custom items could be added per pump, one machine's list would shift
   and the other's would not, and two pumps' answers would stop
   describing the same questions — unrecoverably, because nothing records
   what the answer used to be against.

   WHAT IS ASSERTED:
     1. The scope table's schema version matches the shipped tool's. If
        the tool's version moves, this fails — item positions may have
        moved with it.
     2. Every section the shipped tool actually has is in the table. A
        section added later cannot default into silence.
     3. RED ARM: kept whole, pump 1's controller pass is still on screen
        for pump 2 and is filed as pump 2's. Split, it is not.
     4. Room answers are shared — answered once, seen from both pumps.
     5. An unruled section behaves as per-pump, and is reported as
        awaiting a ruling rather than passing as decided.
     6. Edit stamps survive the split — they are how two tablets decide
        who answered last.
     7. Custom item definitions on a pump are refused, with the id-shift
        reason.
     8. Answers filed on the wrong side by an earlier ruling are
        reported, never silently rehomed.

   Run:  node tools/sim/mpchecklist.mjs        (exit 0 green / 1 red)
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
for (const f of ['multipump/js/sectionScope.js', 'multipump/js/reportShape.js', 'multipump/js/checklistScope.js']) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    .replace("typeof window !== 'undefined' ? window : globalThis", 'window');
  new Function('window', 'var module;\n' + src)(win);
}
const CS = win.MPChecklistScope, Shape = win.MPShape;
const part06 = fs.readFileSync(path.join(REPO, 'diesel-app/js/part06.js'), 'utf8');

console.log('\n═══ CHECKLIST SCOPE — DOES ONE ANSWER COVER TWO MACHINES? ═══\n');

/* 1 — the schema gate, read from the shipped tool */
{
  const m = part06.match(/schemaVer:\s*(\d+)/);
  const live = m ? parseInt(m[1], 10) : null;
  if (live === null) fail('could not read the checklist schema version from the shipped tool');
  else {
    const r = CS.check(live);
    if (!r.ok) fail(`schema moved: the tool is at ${live}, the scope table was written for ${r.writtenFor}. `
                  + 'Item positions may have moved — re-read which answers are shared before trusting a two-pump report.');
    else ok(`the scope table matches the shipped checklist schema (version ${live})`);
  }
}

/* 2 — every live section is accounted for */
{
  const secs = [...part06.matchAll(/secs:\s*\[([^\]]+)\]/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')))
    .filter(Boolean);
  const unknown = secs.filter((s) => !(s in CS.SECTION_SCOPE));
  if (!secs.length) fail('could not read the checklist sections from the shipped tool');
  else if (unknown.length) fail('section(s) in the live tool with no scope declared: ' + unknown.join(', '));
  else ok(`all ${secs.length} checklist sections in the shipped tool have a declared scope`);
}

function twoPumps() {
  const rep = Shape.blank();
  Shape.addPump(rep, { id: 'p1', tag: 'FP-1', type: 'dsl' });
  Shape.addPump(rep, { id: 'p2', tag: 'FP-2', type: 'dsl' });
  return rep;
}

/* 3 — RED ARM: a controller pass covering both machines */
{
  const kept = { s3_4: { status: 'yes', comment: 'controller starts on pressure drop', _ts: 111 } };
  /* whole-checklist behaviour: whatever is on screen is the answer for
     whichever pump is open */
  const asPump2 = Object.assign({}, kept);
  if (asPump2.s3_4.status !== 'yes')
    fail('RED ARM did not reproduce');
  else ok("RED ARM reproduces: kept whole, pump 1's controller pass is on screen as pump 2's answer");

  const rep = twoPumps();
  CS.fileInto(rep, 'p1', kept);
  const forP2 = CS.flatFor(rep, 'p2');
  if (forP2.s3_4) fail("pump 1's controller answer is showing on pump 2");
  else ok("pump 2's controller item comes up unanswered — the question gets asked again");
  const p1 = rep.pumps.find((p) => p.id === 'p1');
  if (!p1.data.clState.s3_4 || p1.data.clState.s3_4.status !== 'yes') fail("pump 1's answer was not filed on pump 1");
  else ok("pump 1's controller answer stays pump 1's");
}

/* 4 — room answers shared */
{
  const rep = twoPumps();
  CS.SECTION_SCOPE.s2 = 'room';                       /* as if Owner ruled section 2 shared */
  CS.fileInto(rep, 'p1', { s2_1: { status: 'yes', _ts: 222 } });
  const a = CS.flatFor(rep, 'p1'), b = CS.flatFor(rep, 'p2');
  if (!a.s2_1 || !b.s2_1) fail('a room answer is not visible from both pumps');
  else ok('a room answer is answered once and seen from both pumps');
  if (Object.keys(rep.pumps[0].data.clState || {}).length) fail('a room answer was also filed onto a pump');
  else ok('a room answer is filed once, on the room');
  CS.SECTION_SCOPE.s2 = 'unruled';                    /* put it back */
}

/* 5 — unruled behaves as per-pump and is reported */
{
  const waiting = CS.needsRuling();
  if (!waiting.length) fail('nothing is reported as awaiting a ruling — unruled sections must stay visible');
  else if (CS.scopeOfItem(waiting[0] + '_1') !== 'pump')
    fail('an unruled item is not defaulting to per-pump, which is the safer error');
  else if (CS.isRuled(waiting[0] + '_1'))
    fail('an unruled item is reporting itself as ruled');
  else ok(`${waiting.length} section(s) awaiting a ruling (${waiting.join(', ')}) — treated as per-pump and listed, not passed as decided`);
}

/* 6 — edit stamps survive */
{
  const rep = twoPumps();
  CS.fileInto(rep, 'p1', { s3_1: { status: 'no', _ts: 987654321 } });
  const back = CS.flatFor(rep, 'p1');
  if (!back.s3_1 || back.s3_1._ts !== 987654321)
    fail('the edit stamp was lost in the split — two tablets could no longer tell who answered last');
  else ok('edit stamps survive the split intact');
}

/* 7 — custom item definitions cannot live on a pump */
{
  const rep = twoPumps();
  let r = CS.customItemsAreShared(rep);
  if (!r.ok) fail('a clean report is being reported as having per-pump custom items');
  rep.pumps[0].data.customItems = { s2: [{ text: 'extra check' }] };
  r = CS.customItemsAreShared(rep);
  if (r.ok) fail('custom item definitions on a pump were accepted — one machine\u2019s later answers would shift and the other\u2019s would not');
  else if (!/positions/.test(r.why)) fail('the refusal does not give the id-shift reason');
  else ok('custom item definitions on a pump are refused, with the id-shift reason');
}

/* 8 — misfiled answers are reported, not rehomed */
{
  const rep = twoPumps();
  rep.room.clState = { s3_9: { status: 'yes', _ts: 1 } };      /* a pump item sitting on the room */
  const m = CS.misfiled(rep);
  if (!m.roomHoldingPumpAnswers.includes('s3_9')) fail('a pump answer sitting on the room was not reported');
  else if (rep.room.clState.s3_9 === undefined) fail('a misfiled answer was moved rather than reported');
  else ok('an answer on the wrong side is reported and left where it is — rehoming an answer is answering it');
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — each machine answers for itself ═══\n');
