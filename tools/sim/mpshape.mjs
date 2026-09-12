#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   PROJECT BLOCK SPLIT                            tools/sim/mpshape.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURES THIS EXISTS TO CATCH. `proj` is one flat object of 86 ids
   on Diesel and 92 on Electric, spanning both scopes. Three ways that goes
   wrong, all silent:

     A. A ROOM value written onto a pump. The project number now lives on
        FP-1. Harmless until FP-2 disagrees with it.
     B. A PUMP value written to the room. Worse: the nameplate of the pump
        that happened to be filled last is then read back onto EVERY pump,
        so a two-pump report shows one machine twice.
     C. A field DROPPED. An id the model has not heard of vanishes on the
        first save. No error, no empty box — the value an inspector typed
        is simply not in the report.

   None of these raise anything. Every syntax check, brace count and
   byte-size guard passes with a field missing, because they are presence
   checks on new work and never absence checks on old.

   WHAT IT ASSERTS — against the REAL field lists of both shipped tools:
     1. Round trip is lossless: split then merge returns the original,
        key for key and value for value, for a full Diesel report and a
        full Electric report.
     2. No id is claimed by both scopes.
     3. Two pumps hold DIFFERENT values for the same pump-scope id, and
        neither leaks into the other.
     4. A room-scope id edited on pump 2 updates the room once — and pump 1
        reads the new value, because there is only one of it.
     5. An unknown id is parked and reported, never dropped.
     6. A legacy single-pump report becomes a one-pump report with nothing
        lost, and its checklist is carried WHOLE rather than half-read.

   Run:  node tools/sim/mpshape.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok   = (m) => console.log('  ✓ ' + m);

/* load the two browser IIFEs into one fake window, in order */
const win = {};
for (const f of ['multipump/js/sectionScope.js', 'multipump/js/reportShape.js']) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    .replace("typeof window !== 'undefined' ? window : globalThis", 'window');
  new Function('window', 'var module;\n' + src)(win);
}
const Scope = win.MPScope, Shape = win.MPShape;

/* the real id lists, read from the shipped manifests */
function liveProjIds(tool) {
  const src = fs.readFileSync(path.join(REPO, tool, 'js/reportManifest.js'), 'utf8');
  const m = src.match(/var PROJ_FIELD_IDS = \[([\s\S]*?)\];/);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
/* every id given a distinct, recognisable value so a swap is visible */
const fill = (ids, mark) => Object.fromEntries(ids.map((id, i) => [id, mark + ':' + i]));

console.log('\n═══ PROJECT BLOCK — does the scope line hold? ═══');

/* 2 */
const both = Scope.PROJ_ROOM.filter((id) => Scope.PROJ_PUMP.includes(id));
both.length ? fail('id claimed by both scopes: ' + both.join(', ')) : ok('no id is claimed by both scopes');

/* 1 — lossless round trip on both tools' real field lists */
for (const tool of ['diesel-app', 'electric-app']) {
  const ids = liveProjIds(tool);
  const flat = fill(ids, tool);
  const s = Shape.splitProj(flat);
  const back = Shape.mergeProj(s.room, s.pump, s.unscoped);
  const lost = ids.filter((id) => back[id] !== flat[id]);
  const extra = Object.keys(back).filter((id) => !(id in flat));
  if (lost.length)  fail(`${tool}: ${lost.length} field(s) lost or altered — ` + lost.slice(0, 6).join(', '));
  if (extra.length) fail(`${tool}: round trip invented ` + extra.join(', '));
  if (!lost.length && !extra.length)
    ok(`${tool}: all ${ids.length} fields survive split→merge unchanged (${Object.keys(s.room).length} room, ${Object.keys(s.pump).length} pump, ${Object.keys(s.unscoped).length} unscoped)`);
}

/* 3 & 4 — two pumps on one report */
const rep = Shape.blank();
Shape.addPump(rep, { id: 'p1', tag: 'FP-1', type: 'ele', duty: 'primary' });
Shape.addPump(rep, { id: 'p2', tag: 'FP-2', type: 'dsl', duty: 'standby' });
const ids = liveProjIds('electric-app');
Shape.applyFlatProj(rep, 'p1', fill(ids, 'PUMP1'));
Shape.applyFlatProj(rep, 'p2', fill(ids, 'PUMP2'));

const f1 = Shape.flatProjFor(rep, 'p1'), f2 = Shape.flatProjFor(rep, 'p2');
const pumpIds = Scope.PROJ_PUMP.filter((id) => ids.includes(id));
const roomIds = Scope.PROJ_ROOM.filter((id) => ids.includes(id));

const bled = pumpIds.filter((id) => f1[id] === f2[id]);
bled.length
  ? fail(`${bled.length} pump field(s) identical across two pumps — one machine's data is showing on both: ` + bled.slice(0, 5).join(', '))
  : ok(`all ${pumpIds.length} pump fields differ between FP-1 and FP-2`);

const p1Kept = pumpIds.every((id) => f1[id].startsWith('PUMP1'));
p1Kept ? ok('FP-1 kept its own pump values after FP-2 was filled in')
       : fail('FP-2 overwrote FP-1 pump values');

const roomShared = roomIds.every((id) => f1[id] === f2[id] && f1[id].startsWith('PUMP2'));
roomShared ? ok(`all ${roomIds.length} room fields are shared — last edit wins, both pumps read it`)
           : fail('room fields are not shared between pumps');

const leakToRoom = Object.keys(rep.room.proj).filter((id) => Scope.PROJ_PUMP.includes(id));
leakToRoom.length ? fail('pump field(s) written into the room block: ' + leakToRoom.join(', '))
                  : ok('no pump field reached the room block');
const leakToPump = Object.keys(Shape.findPump(rep, 'p1').data.proj).filter((id) => Scope.PROJ_ROOM.includes(id));
leakToPump.length ? fail('room field(s) written into a pump block: ' + leakToPump.join(', '))
                  : ok('no room field reached a pump block');

/* 5 — an unknown id must survive */
const warned = [];
const realWarn = console.warn; console.warn = (m) => warned.push(m);
Shape.applyFlatProj(rep, 'p1', { 'pi-projno': 'X', 'zz-field-from-a-newer-build': 'KEEP' });
console.warn = realWarn;
const rt = Shape.flatProjFor(rep, 'p1');
rt['zz-field-from-a-newer-build'] === 'KEEP'
  ? ok('an id the model has never seen is parked and round-trips' + (warned.length ? ' (and is reported)' : ' BUT WAS NOT REPORTED'))
  : fail('an unknown id was DROPPED on save — the silent failure this whole probe exists for');
if (!warned.length) fail('unknown id was not reported to the console');

/* 6 — legacy read */
const legacy = {
  proj: fill(liveProjIds('diesel-app'), 'LEG'),
  stdData: [{ q: 1 }], batData: { b1: [12.1] }, contractors: ['Acme'],
  sketchEntries: [{ s: 1 }], clState: { '2.1': 'Y' }, deficiencies: [{ t: 'x' }]
};
const mig = Shape.fromLegacy(legacy, { id: 'p9', tag: 'FP-1', type: 'dsl', duty: 'primary' });
const mp = Shape.findPump(mig, 'p9');
const checks = [
  [mig.pumps.length === 1, 'one pump'],
  [mp.data.stdData === legacy.stdData, 'flow data rode onto the pump'],
  [mp.data.batData === legacy.batData, 'battery data rode onto the pump'],
  [mig.room.contractors === legacy.contractors, 'contractors stayed in the room'],
  [mig.room.sketchEntries === legacy.sketchEntries, 'sketches stayed in the room'],
  [mig.room._legacy_clState === legacy.clState, 'checklist carried WHOLE, not half-read'],
  [Object.keys(Shape.flatProjFor(mig, 'p9')).length === liveProjIds('diesel-app').length, 'every project field readable back']
];
const bad = checks.filter((c) => !c[0]);
bad.length ? bad.forEach((c) => fail('legacy read: ' + c[1] + ' — FAILED'))
           : ok('a legacy single-pump report migrates with nothing lost (' + checks.length + ' checks)');

console.log('\n' + (fails ? 'RED — ' + fails + ' failure(s)' : 'GREEN — the scope line holds in both directions, and nothing is dropped'));
process.exit(fails ? 1 : 0);
