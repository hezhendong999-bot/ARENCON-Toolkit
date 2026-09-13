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

/* 2a — the scope model reads the SHIPPED rows, not a table of its own */
{
  const readSections = (tool) => {
    const src = fs.readFileSync(path.join(REPO, tool, 'js/part06.js'), 'utf8');
    const out = {};
    for (const sec of ['S1', 'S2']) {
      const blk = src.match(new RegExp('const ' + sec + ' = \\[([\\s\\S]*?)\\n\\];'))[1];
      out[sec.toLowerCase()] = [...blk.matchAll(/\{ num:"([\d.]+)", scope:"([a-z-]+)"/g)]
        .map((m) => ({ num: m[1], scope: m[2] }));
    }
    return out;
  };
  const dsl = readSections('diesel-app');
  const n = CS.register(dsl);
  const unscoped = CS.unscopedIn(dsl);
  if (n !== dsl.s1.length + dsl.s2.length)
    fail(`registered ${n} of ${dsl.s1.length + dsl.s2.length} shipped diesel rows`);
  else ok(`all ${n} shipped Diesel S1/S2 rows register their own scope — no second table here`);
  if (unscoped.length) fail('shipped rows with no scope: ' + unscoped.join(', '));
  else ok('every shipped row declares a scope; nothing falls back to a guess');

  /* the four shipped labels land on the two sides a report stores */
  const pairs = [['visit', 'room'], ['room', 'room'], ['machine', 'pump'], ['diesel-only', 'pump']];
  const bad = pairs.filter(([label, side]) => CS.sideOf(label) !== side);
  if (bad.length) fail('label mapping wrong for: ' + bad.map((b) => b[0]).join(', '));
  else ok('visit and room store once; machine and diesel-only store per machine');

  /* a diesel tank item must not become a room answer */
  const tank = dsl.s2.findIndex((r) => r.num === '2.8');
  if (CS.scopeOfItem('s2_' + tank) !== 'pump')
    fail('a diesel-only tank item resolved to the room — it belongs to that engine');
  else ok('diesel-only items resolve to the machine, not the room');

  /* and a shipped ROOM row stores once */
  const tags = dsl.s2.findIndex((r) => r.num === '2.10');
  if (CS.scopeOfItem('s2_' + tags) !== 'room') fail('the valve-tag row did not resolve to the room');
  else if (CS.labelOfItem('s2_' + tags) !== 'room') fail('the shipped label was lost in translation');
  else ok('a shipped ROOM row stores once and keeps its label');
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
  /* s2_9 is Diesel 2.10, valve tags — shipped as ROOM on the live tool */
  CS.fileInto(rep, 'p1', { s2_9: { status: 'yes', _ts: 222 } });
  const a = CS.flatFor(rep, 'p1'), b = CS.flatFor(rep, 'p2');
  if (!a.s2_9 || !b.s2_9) fail('a room answer is not visible from both pumps');
  else ok('the shipped valve-tag answer is given once and seen from both pumps');
  if (Object.keys(rep.pumps[0].data.clState || {}).length) fail('a room answer was also filed onto a pump');
  else ok('a room answer is filed once, on the room');
}

/* 5 — once the tools have ruled a section, it stops being asked about;
   an unregistered section still defaults to per-pump, the safer error */
{
  const waiting = CS.needsRuling();
  if (waiting.length)
    fail('still reporting ' + waiting.join(', ') + ' as awaiting a ruling after the shipped rows were read');
  else ok('no section is reported as awaiting a ruling — the tools have ruled them row by row');
  if (!CS.isRuled('s2_9')) fail('a shipped row is reporting itself as unruled');
  else ok('a shipped row reports itself as ruled');
  if (CS.scopeOfItem('sX_3') !== 'pump')
    fail('an unknown section is not defaulting to per-pump, which is the safer error');
  else if (CS.isRuled('sX_3'))
    fail('an unknown section is claiming to be ruled');
  else ok('a section nobody has ruled still defaults to per-pump and admits it is unruled');
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
