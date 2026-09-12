#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   PUMP SWITCH — DOES ANYTHING CROSS?            tools/sim/mpcontext.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. On a two-pump report the screen is
   already full of the last pump when the next one opens. Putting a saved
   value back does not make the screen say ONLY that value, and the gap
   between those two things is a reading filed against the wrong machine
   on a signed document.

   Two ways it happens, both silent, both reproduced below:

     A. NAMEPLATE CARRY. The field applier writes the ids it is given.
        Pump 2 has no serial number yet, so nothing is written and pump
        1's serial is still in the box — and is collected onto pump 2 on
        the next save. The report then shows one machine's nameplate on
        two machines.

     B. TAIL ROWS. The flow-table applier assigns row for row and stops
        at the shorter array. Pump 1 ran 7-point, pump 2 runs 3-point:
        rows 4 to 7 still hold pump 1's readings, on screen and in the
        next save. The test path is chosen per machine, so unequal row
        counts are the ordinary case, not an edge one.

   Nothing raises on either. The file parses, the boxes are full, the
   numbers look plausible, and the only way to know is to have measured
   the pump yourself.

   WHAT IS ASSERTED — against the REAL manifests of both shipped tools:
     1. Every pump-scope key in both manifests is classified: the engine
        can blank it, or the host must reset it. Nothing unclassified.
     2. The pump manifest cannot reach a room key. Not by care — the keys
        are not in it.
     3. RED ARM A: without the blank payload, pump 1's nameplate lands on
        pump 2. With it, pump 2 reads empty.
     4. RED ARM B: without a reset, pump 1's rows 4–7 survive onto pump 2.
        With the reset, they do not.
     5. A missing reset REFUSES the switch, and the screen still holds the
        pump it was holding. A refusal that half-switched would be worse
        than no refusal at all.
     6. Room values are untouched by a pump switch, and no pump id ever
        reaches the room block.
     7. Round trip: fill pump 1, switch, fill pump 2, switch back — every
        one of pump 1's values returns exactly.
     8. A key belonging to the other drive type is filed and named, never
        dropped.

   Run:  node tools/sim/mpcontext.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

/* ── load the browser IIFEs into one fake window, in order ─────────── */
const win = {};
for (const f of ['lib/data/reportState.js', 'multipump/js/sectionScope.js',
                 'multipump/js/reportShape.js', 'multipump/js/pumpContext.js']) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    .replace("typeof window !== 'undefined' ? window : globalThis", 'window')
    .replace("typeof window !== 'undefined' ? window : this", 'window');
  new Function('window', 'var module;\n' + src)(win);
}
const Shape = win.MPShape, Ctx = win.MPContext, RS = win.ReportState;

/* the shipped manifests, read as source — the same lists the field runs */
function liveManifest(tool) {
  const src = fs.readFileSync(path.join(REPO, tool, 'js/reportManifest.js'), 'utf8');
  const box = { window: {} };
  new Function('window', 'var module;\n' + src.replace("typeof window !== 'undefined' ? window : globalThis", 'window'))(box.window);
  const m = box.window.DieselReportManifest || box.window.ElectricReportManifest ||
            Object.values(box.window).find((v) => v && v.keys);
  if (!m) throw new Error('could not read the ' + tool + ' manifest');
  return m;
}

/* ── a screen: getElementById over a plain map, which is all the engine
      ever asks a document for ───────────────────────────────────────── */
function screen(ids) {
  const els = {};
  ids.forEach((id) => { els[id] = { value: '', readOnly: false }; });
  return {
    getElementById: (id) => els[id] || null,
    /* the engine's checkbox collector asks for these; no equipment boxes
       are on this stub screen, and an empty list is the honest answer */
    querySelectorAll: () => [],
    _els: els
  };
}

const DSL = liveManifest('diesel-app');
const ELE = liveManifest('electric-app');

console.log('\n═══ PUMP SWITCH — CAN ANYTHING CROSS FROM ONE MACHINE TO ANOTHER? ═══\n');

/* 1 — every pump key classified, on both tools */
for (const [name, man] of [['diesel', DSL], ['electric', ELE]]) {
  const p = Ctx.plan(man, {});
  const unclassified = p.missing.filter((m) => /unknown applier|no apply rule/.test(m));
  if (unclassified.length) fail(`${name}: unclassified pump key(s) — ${unclassified.join(', ')}`);
  else ok(`${name}: all ${p.auto.length + p.needsClear.length + p.nothing.length} pump keys classified `
        + `(${p.auto.length} blanked by the engine, ${p.needsClear.length} need a host clear — `
        + `${p.needsRebuild.length} of those also a rebuild, ${p.nothing.length} never read back)`);
}

/* 2 — the pump manifest cannot reach a room key */
for (const [name, man] of [['diesel', DSL], ['electric', ELE]]) {
  const pumpKeys = Ctx.pumpManifest(man).keys.map((k) => k.key);
  const roomish = pumpKeys.filter((k) => k !== 'proj' && win.MPScope.scopeOf(k) !== 'pump');
  const projIds = Ctx.pumpProjIds(man);
  const roomIds = projIds.filter((id) => win.MPScope.PROJ_ROOM.includes(id));
  if (roomish.length) fail(`${name}: room key reachable through the pump manifest — ${roomish.join(', ')}`);
  else if (roomIds.length) fail(`${name}: room project id in the pump surface — ${roomIds.join(', ')}`);
  else ok(`${name}: pump manifest holds ${pumpKeys.length} keys and ${projIds.length} project ids, none of them the room's`);
}

/* ── a two-pump report, and a host that behaves like the shipped one ── */
const NAMEPLATE = ['np-mfr', 'np-model', 'np-serial', 'np-bhp'];
const ROOMFIELD = ['pi-projno', 'ws-static-psi'];

function build() {
  const rep = Shape.blank();
  Shape.addPump(rep, { id: 'p1', tag: 'FP-1', type: 'dsl', duty: 'primary' });
  Shape.addPump(rep, { id: 'p2', tag: 'FP-2', type: 'dsl', duty: 'standby' });
  const doc = screen([...Ctx.pumpProjIds(DSL), ...ROOMFIELD, 'npsh-psi', 'npsh-psi-pld']);
  const live = { stdData: [], pldData: [], pumpCurvePoints: [], pldPumpCurvePoints: [],
                 flowTestPhotos: [], flowTestPhotosPld: [], smState: {}, smCapVis: {}, annDsForce: {},
                 equipChecked: [], equipChecked4b: [] };
  const scalars = { npshPsi: '', npshPsiPld: '' };
  const custom = {
    collectTestType: () => live._testType, applyTestType: (v) => { live._testType = v; },
    collectTtChosen: () => live._ttChosen, applyNoop: () => {},
    collectPitotRows: () => live._pitot || [], applyPitotRows: (v) => { live._pitot = v; },
    collectCustomEquip: () => live._customEquip || '', applyCustomEquip: (v) => { live._customEquip = v; },
    applyEquipState: (v) => { live._equipState = v; }, applyEquipState4b: (v) => { live._equipState4b = v; },
    collectBatData: () => live._bat || {}, applyBatData: (v) => { live._bat = v; },
    collectFlowPhotos: () => live.flowTestPhotos, collectFlowPhotosPld: () => live.flowTestPhotosPld,
    collectVaStd: () => live._vaStd || [], collectVaPld: () => live._vaPld || [],
    applyVaStd: (v) => { live._vaStd = v; }, applyVaPld: (v) => { live._vaPld = v; },
    collectAutoTransfer: () => live._at || {}, applyAutoTransfer: (v) => { live._at = v; },
    collectBatPower: () => live._batPower || {}, applyBatPower: (v) => { live._batPower = v; }
  };
  const env = {
    doc, refs: live, custom, hooks: {}, opts: {},
    get: (n) => (n in scalars ? scalars[n] : live[n]),
    set: (n, v) => { if (n in scalars) scalars[n] = v; else live[n] = v; },
    ReportState: RS,
    /* the host's surfaces — clear() empties one, rebuild() puts back the
       structure the incoming pump's values need to land in. The flow
       table is rebuilt for that pump's chosen test path, exactly as the
       shipped tool does when a report is opened. */
    surfaces: {
      stdData: { clear: () => { live.stdData.length = 0; },
                 rebuild: (e, v) => { (v || []).forEach((r) => live.stdData.push({ pct: r.pct })); } },
      pldData: { clear: () => { live.pldData.length = 0; },
                 rebuild: (e, v) => { (v || []).forEach((r) => live.pldData.push({ pct: r.pct })); } },
      smState:  { clear: () => { Object.keys(live.smState).forEach((k) => delete live.smState[k]); },
                  rebuild: (e, v) => { Object.keys(v || {}).forEach((k) => { live.smState[k] = {}; }); } },
      smCapVis: { clear: () => { Object.keys(live.smCapVis).forEach((k) => delete live.smCapVis[k]); },
                  rebuild: (e, v) => { Object.keys(v || {}).forEach((k) => { live.smCapVis[k] = {}; }); } },
      annDsForce: { clear: () => { Object.keys(live.annDsForce).forEach((k) => delete live.annDsForce[k]); },
                    rebuild: (e, v) => { Object.keys(v || {}).forEach((k) => { live.annDsForce[k] = {}; }); } },
      testType: { clear: () => { live._testType = undefined; } },
      ttChosen: { clear: () => { live._ttChosen = undefined; } },
      equipState: { clear: () => { live._equipState = {}; } },
      equipState4b: { clear: () => { live._equipState4b = {}; } },
      pitotRows: { clear: () => { live._pitot = []; } },
      customEquip: { clear: () => { live._customEquip = ''; } },
      batData: { clear: () => { live._bat = {}; } }
    }
  };
  /* the manifest's own collectors for anything declared custom */
  Ctx.pumpManifest(DSL).keys.forEach((e) => {
    if (e.collect && e.collect.kind === 'custom' && !custom[e.collect.fn]) custom[e.collect.fn] = () => live['_' + e.collect.fn];
    if (e.apply && e.apply.kind === 'custom' && !custom[e.apply.fn]) custom[e.apply.fn] = (v) => { live['_' + e.apply.fn] = v; };
    if (e.apply && e.apply.kind === 'custom' && !env.surfaces[e.key])
      env.surfaces[e.key] = { clear: () => { live['_' + e.apply.fn] = undefined; } };
  });
  return { rep, env, doc, live, scalars };
}

/* pump 1: a 7-point test, a full nameplate, a room value */
function fillPump1(t) {
  NAMEPLATE.forEach((id, i) => { t.doc._els[id].value = 'P1-' + i; });
  ROOMFIELD.forEach((id) => { if (t.doc._els[id]) t.doc._els[id].value = 'ROOM'; });
  for (let i = 0; i < 7; i++) t.live.stdData.push({ pct: i * 25, suction: 'S1-' + i, discharge: 'D1-' + i });
  t.scalars.npshPsi = '11';
  t.live._testType = '7pt';
}

console.log('');
/* 3 — RED ARM A: nameplate carry */
{
  const t = build();
  fillPump1(t);
  /* the naive switch: file pump 1, then apply pump 2 with only what pump
     2 has — which is nothing. This is what a switch looks like without
     this file. */
  const flat = RS.collect(Ctx.pumpManifest(DSL), t.env);
  Ctx.fileInto(t.rep, 'p1', flat, DSL);
  RS.apply({}, Ctx.pumpManifest(DSL), t.env);
  const carried = NAMEPLATE.filter((id) => t.doc._els[id].value !== '');
  if (!carried.length) fail('RED ARM A did not reproduce — the defect must be shown before the fix can be believed');
  else ok(`RED ARM A reproduces: without the blank payload, ${carried.length} of pump 1's nameplate fields are still on screen for pump 2`);

  /* and the fix */
  const t2 = build();
  fillPump1(t2);
  const r = Ctx.switchTo(t2.rep, 'p1', 'p2', t2.env, DSL);
  if (!r.switched) fail('switchTo refused a switch it should have made: ' + JSON.stringify(r));
  const still = NAMEPLATE.filter((id) => t2.doc._els[id].value !== '');
  if (still.length) fail(`nameplate carried onto pump 2: ${still.join(', ')}`);
  else ok('pump 2 opens with an empty nameplate, and pump 1 keeps its own');
  const p1 = Shape.findPump(t2.rep, 'p1');
  if (p1.data.proj['np-serial'] !== 'P1-2') fail("pump 1's serial was not filed before the switch");
  else ok("pump 1's nameplate is filed on pump 1");
}

/* 4 — RED ARM B: tail rows */
{
  const t = build();
  fillPump1(t);
  const flat = RS.collect(Ctx.pumpManifest(DSL), t.env);
  Ctx.fileInto(t.rep, 'p1', flat, DSL);
  /* pump 2 ran 3-point: three rows arrive, four remain */
  RS.apply({ stdData: [{ pct: 0, suction: 'S2-0' }, { pct: 100, suction: 'S2-1' }, { pct: 150, suction: 'S2-2' }] },
           Ctx.pumpManifest(DSL), t.env);
  const tail = t.live.stdData.filter((r) => String(r.suction || '').startsWith('S1-'));
  if (t.live.stdData.length !== 7 || !tail.length)
    fail('RED ARM B did not reproduce — expected pump 1 rows to survive a shorter table');
  else ok(`RED ARM B reproduces: ${tail.length} of pump 1's flow rows survive onto pump 2's 3-point table`);

  const t2 = build();
  fillPump1(t2);
  Ctx.switchTo(t2.rep, 'p1', 'p2', t2.env, DSL);
  if (t2.live.stdData.length !== 0) fail(`pump 2 opened with ${t2.live.stdData.length} of pump 1's flow rows`);
  else ok('pump 2 opens with an empty flow table');
  if ((Shape.findPump(t2.rep, 'p1').data.stdData || []).length !== 7) fail("pump 1's 7 rows were not filed");
  else ok("pump 1's 7 rows are filed on pump 1");
}

/* 5 — a missing reset refuses, and refuses cleanly */
{
  const t = build();
  fillPump1(t);
  delete t.env.surfaces.stdData;
  const r = Ctx.switchTo(t.rep, 'p1', 'p2', t.env, DSL);
  if (r.switched) fail('switched with no way to clear the flow table');
  else if (!/stdData/.test(String(r.missing))) fail('refused for the wrong reason: ' + JSON.stringify(r.missing));
  else ok('a pump key with no surface REFUSES the switch, and names the key');
  if (t.doc._els['np-serial'].value !== 'P1-2' || t.live.stdData.length !== 7)
    fail('the refused switch still changed the screen — a half switch is worse than none');
  else ok('the refused switch left the screen exactly as it was');
}

/* 5b — RED ARM C: the defect this probe found in the first version of
   pumpContext.js. Clearing a table and then handing back seven saved rows
   loses all seven, because the applier writes into rows and there are
   none. Switch away and back, and a completed 7-point test returns EMPTY
   with nothing raised anywhere. */
{
  const t = build();
  fillPump1(t);
  const flat = RS.collect(Ctx.pumpManifest(DSL), t.env);
  Ctx.fileInto(t.rep, 'p1', flat, DSL);
  t.env.surfaces.stdData.clear(t.env);                    /* cleared, not rebuilt */
  RS.apply(Ctx.flatFor(t.rep, 'p1', DSL), Ctx.pumpManifest(DSL), t.env);
  if (t.live.stdData.length !== 0)
    fail('RED ARM C did not reproduce — clearing without rebuilding was expected to lose the rows');
  else ok("RED ARM C reproduces: cleared and not rebuilt, all 7 of pump 1's saved rows are silently discarded");

  /* and a surface that can clear but not rebuild must not be accepted */
  const t2 = build();
  fillPump1(t2);
  t2.env.surfaces.stdData = { clear: () => { t2.live.stdData.length = 0; } };
  const r2 = Ctx.switchTo(t2.rep, 'p1', 'p2', t2.env, DSL);
  if (r2.switched) fail('switched with a surface that can clear the flow table but not rebuild it');
  else if (!/rebuild/.test(String(r2.missing))) fail('refused for the wrong reason: ' + JSON.stringify(r2.missing));
  else ok('a surface that can clear but not rebuild REFUSES the switch');
}

/* 6 — the room is not touched */
{
  const t = build();
  fillPump1(t);
  Ctx.switchTo(t.rep, 'p1', 'p2', t.env, DSL);
  const roomChanged = ROOMFIELD.filter((id) => t.doc._els[id] && t.doc._els[id].value !== 'ROOM');
  if (roomChanged.length) fail('a pump switch cleared room field(s): ' + roomChanged.join(', '));
  else ok('room fields are untouched by a pump switch');
  const stray = Object.keys(t.rep.room.proj).filter((id) => win.MPScope.PROJ_PUMP.includes(id));
  if (stray.length) fail('pump id reached the room block: ' + stray.join(', '));
  else ok('no pump id reached the room block');
}

/* 7 — round trip: p1 → p2 → p1 */
{
  const t = build();
  fillPump1(t);
  Ctx.switchTo(t.rep, 'p1', 'p2', t.env, DSL);
  NAMEPLATE.forEach((id, i) => { t.doc._els[id].value = 'P2-' + i; });
  t.live.stdData.push({ pct: 0, suction: 'S2-0' }, { pct: 100, suction: 'S2-1' }, { pct: 150, suction: 'S2-2' });
  t.scalars.npshPsi = '22';
  Ctx.switchTo(t.rep, 'p2', 'p1', t.env, DSL);

  const badField = NAMEPLATE.filter((id, i) => t.doc._els[id].value !== 'P1-' + i);
  const rows = t.live.stdData;
  const badRows = rows.length !== 7 || rows.some((r, i) => r.suction !== 'S1-' + i);
  if (badField.length) fail('coming back to pump 1, wrong values in: ' + badField.join(', '));
  else ok("coming back to pump 1, every nameplate value is pump 1's own");
  if (badRows) fail(`coming back to pump 1, the flow table is wrong (${rows.length} rows)`);
  else ok("coming back to pump 1, all 7 of its flow rows return in order");
  if (t.scalars.npshPsi !== '11') fail('suction pressure came back as ' + t.scalars.npshPsi + ', not pump 1\'s 11');
  else ok("suction pressure returns as pump 1's own");
  const p2 = Shape.findPump(t.rep, 'p2');
  if (p2.data.proj['np-serial'] !== 'P2-2' || (p2.data.stdData || []).length !== 3)
    fail("pump 2's own readings were not filed on pump 2");
  else ok("pump 2's readings stayed on pump 2");
}

/* 8 — an off-type key is filed and named, never dropped */
{
  const t = build();
  const filed = Ctx.fileInto(t.rep, 'p1', { proj: {}, batData: { v: 12.6 }, vaStdData: [{ volts: 480 }] }, ELE);
  const p1 = Shape.findPump(t.rep, 'p1');   /* a diesel pump */
  if (!p1.data.vaStdData) fail('an electric-only key was DROPPED when filed onto a diesel pump');
  else if (!filed.offType.includes('vaStdData')) fail('an off-type key was filed silently, with nothing to notice it');
  else ok('an electric-only key on a diesel pump is filed and reported, never dropped');
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — nothing crosses between machines ═══\n');
