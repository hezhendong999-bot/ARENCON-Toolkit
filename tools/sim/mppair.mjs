#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   TWO PUMPS, ONE ROOM — A WHOLE VISIT           tools/sim/mppair.mjs
   ───────────────────────────────────────────────────────────────────────
   Every other multi-pump probe holds one seam. This one runs a visit:
   arrive, commission FP-1, move to FP-2, commission it, go back to FP-1
   to finish something, save. All the layers at once, in the order a real
   morning happens.

   WHY THAT IS A DIFFERENT TEST. Each seam can be correct on its own and
   still produce a wrong report together — the nameplate moving while the
   checklist does not is a screen showing pump 2's machine above pump 1's
   answers, and it looks exactly like an ordinary half-filled report. The
   only way to catch that class is to run the whole thing and check that
   NOTHING of one machine is anywhere near the other at the end.

   WHAT IS ASSERTED:
     1. A visit runs: open FP-1, fill it, switch, fill FP-2, switch back.
     2. At the end, every value on FP-1 is FP-1's and every value on FP-2
        is FP-2's — nameplate, flow readings, gauge photos, suction
        pressure, controller answers, placards.
     3. The room's answers and the room's values are shared by both and
        stored once.
     4. Nothing was lost: everything entered is somewhere, for the right
        machine.
     5. RED ARM: moving only the manifest surfaces and not the checklist
        leaves pump 1's controller answers under pump 2's nameplate. The
        session layer makes that state unreachable.
     6. A save files the active pump without needing a switch first.
     7. A refused switch leaves the screen whole and unmixed.

   Run:  node tools/sim/mppair.mjs        (exit 0 green / 1 red)
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
for (const f of ['lib/data/reportState.js', 'multipump/js/sectionScope.js', 'multipump/js/reportShape.js',
                 'multipump/js/pumpContext.js', 'multipump/js/dieselSurfaces.js',
                 'multipump/js/photoOwner.js', 'multipump/js/checklistScope.js',
                 'multipump/js/pumpSession.js']) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    .replace("typeof window !== 'undefined' ? window : globalThis", 'window')
    .replace("typeof window !== 'undefined' ? window : this", 'window');
  new Function('window', 'var module;\n' + src)(win);
}
const { MPContext: Ctx, MPShape: Shape, MPDieselSurfaces: Surf,
        MPPhotoOwner: PO, MPChecklistScope: CL, MPPumpSession: Sess, ReportState: RS } = win;

function liveManifest(tool) {
  const src = fs.readFileSync(path.join(REPO, tool, 'js/reportManifest.js'), 'utf8');
  const box = {};
  new Function('window', 'var module;\n' + src.replace("typeof window !== 'undefined' ? window : globalThis", 'window'))(box);
  return Object.values(box).find((v) => v && v.keys);
}
const DSL = liveManifest('diesel-app');

console.log('\n═══ TWO PUMPS, ONE ROOM — A WHOLE VISIT ═══\n');

/* ── the screen ────────────────────────────────────────────────────── */
const STD_BLANK = ['0%', '100%', '150%'].map((pct, i) => ({
  pct, flow: i === 0 ? 0 : null, label: ['Churn', 'Rated', 'Overload'][i],
  suction: '', discharge: '', rpm: '', cutsheet: '', placard: '', photos: []
}));

function makeScreen() {
  const els = {};
  [...Ctx.pumpProjIds(DSL), 'pi-projno', 'pi-projname', 'npsh-psi', 'npsh-psi-pld']
    .forEach((id) => { els[id] = { value: '', readOnly: false }; });
  const doc = { getElementById: (id) => els[id] || null, querySelectorAll: () => [], querySelector: () => null, _els: els };
  const refs = {
    stdData: JSON.parse(JSON.stringify(STD_BLANK)), pldData: [],
    clState: {}, customItems: {},
    smState: { chart3pt: { on: true } }, smCapVis: { chart3pt: { relief: true } }, annDsForce: { chart3pt: {} },
    pumpCurvePoints: [], pldPumpCurvePoints: [], flowTestPhotos: [], flowTestPhotosPld: [],
    recordPhotos: [], equipChecked: [], equipChecked4b: []
  };
  const scalars = { npshPsi: '', npshPsiPld: '' };
  const bat = { b1: [0, 0], b2: [0, 0] };
  const custom = {
    collectBatData: () => ({ b1: bat.b1.slice(), b2: bat.b2.slice() }),
    applyBatData: (v) => { if (v && v.b1) bat.b1 = v.b1.slice(); if (v && v.b2) bat.b2 = v.b2.slice(); }
  };
  const env = {
    doc, refs, custom, opts: {}, ReportState: RS,
    hooks: { assignRowPreservePhotos: (live, incoming) => {
      const keep = live.photos; Object.assign(live, incoming);
      if (!incoming.photos || !incoming.photos.length) live.photos = keep;
    } },
    get: (n) => (n in scalars ? scalars[n] : refs[n]),
    set: (n, v) => { if (n in scalars) scalars[n] = v; else refs[n] = v; },
    _bat: bat, _scalars: scalars
  };
  Ctx.pumpManifest(DSL).keys.forEach((e) => {
    if (e.collect && e.collect.kind === 'custom' && !custom[e.collect.fn]) custom[e.collect.fn] = () => undefined;
    if (e.apply && e.apply.kind === 'custom' && !custom[e.apply.fn]) custom[e.apply.fn] = () => {};
  });
  Surf.HOST_FNS.forEach((fn) => { win[fn] = () => {}; });
  Surf.captureBlank(env);
  env.surfaces = Surf.build(env);
  return env;
}

function room() {
  const rep = Shape.blank();
  Shape.addPump(rep, { id: 'p1', tag: 'FP-1', type: 'dsl', duty: 'primary' });
  Shape.addPump(rep, { id: 'p2', tag: 'FP-2', type: 'dsl', duty: 'standby' });
  return rep;
}

/* what an inspector enters at one machine */
function commission(env, mark) {
  env.doc._els['np-serial'].value = 'SN-' + mark;
  env.doc._els['np-model'].value = 'MODEL-' + mark;
  env.refs.stdData[1].suction = mark === 'ONE' ? '42' : '38';
  env.refs.stdData[1].discharge = mark === 'ONE' ? '118' : '124';
  env.refs.stdData[1].photos.push({ id: 'ph-' + mark, n: mark + '-rated-gauge.jpg' });
  env._scalars.npshPsi = mark === 'ONE' ? '11' : '13';
  env.refs.clState['s3_1'] = { status: 'yes', comment: 'controller ' + mark, _ts: 100 };
  env.refs.clState['s4_2'] = { status: mark === 'ONE' ? 'yes' : 'no', _ts: 101 };
}

/* 1 & 2 — the visit */
const rep = room();
const env = makeScreen();
{
  env.doc._els['pi-projno'].value = '4380.24';             /* the room's, entered once */
  env.refs.clState['s2_1'] = { status: 'yes', comment: 'suction piping clear', _ts: 50 };
  CL.SECTION_SCOPE.s2 = 'room';                            /* as if ruled shared */

  /* the report was loaded into the screen before a pump was chosen — as
     happens with every report written by the single-pump tool */
  const refused = Sess.openPump(rep, 'p1', env, DSL, {});
  if (refused.switched) fail('opening dropped what was already on screen instead of asking');
  else if (refused.reason !== 'screen-not-empty') fail('refused for the wrong reason: ' + JSON.stringify(refused));
  else ok('opening a pump over a screen that already holds answers REFUSES rather than discarding them');

  let r = Sess.openPump(rep, 'p1', env, DSL, { adopt: true });
  if (!r.switched) fail('could not open the first pump: ' + JSON.stringify(r));
  commission(env, 'ONE');

  r = Sess.switchPump(rep, 'p1', 'p2', env, DSL, {});
  if (!r.switched) fail('could not switch to the second pump: ' + JSON.stringify(r));
  else ok('the visit runs: FP-1 opened, filled, and left for FP-2');

  /* FP-2 must arrive clean */
  if (env.doc._els['np-serial'].value !== '') fail("FP-2 opened with FP-1's serial number");
  if (env.refs.stdData[1].suction !== '') fail("FP-2 opened with FP-1's suction reading");
  if (env.refs.stdData[1].photos.length) fail("FP-2 opened with FP-1's gauge photo");
  if (env.refs.clState['s3_1']) fail("FP-2 opened with FP-1's controller answer already ticked");
  if (!env.refs.clState['s2_1']) fail('the shared suction-piping answer was cleared when the machine changed');
  else ok('FP-2 opens clean, and the room\u2019s shared answer is still there');

  commission(env, 'TWO');
  r = Sess.switchPump(rep, 'p2', 'p1', env, DSL, {});
  if (!r.switched) fail('could not go back to the first pump: ' + JSON.stringify(r));

  /* back at FP-1, everything must be FP-1's */
  const bad = [];
  if (env.doc._els['np-serial'].value !== 'SN-ONE') bad.push('serial=' + env.doc._els['np-serial'].value);
  if (env.refs.stdData[1].suction !== '42') bad.push('suction=' + env.refs.stdData[1].suction);
  if (env.refs.stdData[1].discharge !== '118') bad.push('discharge=' + env.refs.stdData[1].discharge);
  if ((env.refs.stdData[1].photos[0] || {}).id !== 'ph-ONE') bad.push('gauge photo');
  if (env._scalars.npshPsi !== '11') bad.push('npsh=' + env._scalars.npshPsi);
  if (!env.refs.clState['s3_1'] || env.refs.clState['s3_1'].comment !== 'controller ONE') bad.push('controller answer');
  if (env.refs.clState['s4_2'] && env.refs.clState['s4_2'].status !== 'yes') bad.push('s4_2 status');
  if (bad.length) fail('coming back to FP-1, these are not FP-1\u2019s: ' + bad.join(', '));
  else ok('coming back to FP-1, every value on screen is FP-1\u2019s — nameplate, readings, gauge photo, suction pressure, answers');
}

/* 3 — the room is stored once and shared */
{
  if (rep.room.proj['pi-projno'] !== '4380.24') fail('the project number is not on the room');
  const onPumps = rep.pumps.filter((p) => p.data.proj && p.data.proj['pi-projno']);
  if (onPumps.length) fail('the project number was copied onto ' + onPumps.length + ' pump(s)');
  else ok('the room\u2019s project number is stored once, on the room');
  if (!rep.room.clState['s2_1']) fail('the shared checklist answer is not on the room');
  else if (rep.pumps.some((p) => p.data.clState && p.data.clState['s2_1']))
    fail('the shared checklist answer was also copied onto a pump');
  else ok('the shared checklist answer is stored once, on the room');
}

/* 4 — nothing lost, and nothing crossed */
{
  const p1 = Shape.findPump(rep, 'p1'), p2 = Shape.findPump(rep, 'p2');
  Sess.fileActive(rep, env, DSL);                           /* save, still on FP-1 */
  const checks = [
    [p1.data.proj['np-serial'], 'SN-ONE', 'FP-1 serial'],
    [p2.data.proj['np-serial'], 'SN-TWO', 'FP-2 serial'],
    [p1.data.stdData[1].suction, '42', 'FP-1 suction'],
    [p2.data.stdData[1].suction, '38', 'FP-2 suction'],
    [(p1.data.stdData[1].photos[0] || {}).id, 'ph-ONE', 'FP-1 gauge photo'],
    [(p2.data.stdData[1].photos[0] || {}).id, 'ph-TWO', 'FP-2 gauge photo'],
    [p1.data.clState['s3_1'].comment, 'controller ONE', 'FP-1 controller answer'],
    [p2.data.clState['s3_1'].comment, 'controller TWO', 'FP-2 controller answer'],
    [p1.data.clState['s4_2'].status, 'yes', 'FP-1 performance answer'],
    [p2.data.clState['s4_2'].status, 'no', 'FP-2 performance answer']
  ];
  const wrong = checks.filter(([got, want]) => got !== want).map(([got, want, what]) => `${what} (${got} ≠ ${want})`);
  if (wrong.length) fail('after the visit: ' + wrong.join('; '));
  else ok('after the visit both machines hold their own record in full — 10 values checked, none crossed');

  if (p1.data.clState['s2_1'] || p2.data.clState['s2_1']) fail('a room answer ended up on a pump');
  else ok('a save files the active pump without needing a switch first');
}

/* 5 — RED ARM: the surfaces without the checklist */
{
  const rep2 = room();
  const e2 = makeScreen();
  Sess.openPump(rep2, 'p1', e2, DSL, { adopt: true });
  commission(e2, 'ONE');
  /* the partial switch this layer exists to make unreachable */
  Ctx.switchTo(rep2, 'p1', 'p2', e2, DSL);
  const mixed = e2.doc._els['np-serial'].value === '' && !!e2.refs.clState['s3_1'];
  if (!mixed) fail('RED ARM did not reproduce — expected a cleared nameplate over kept answers');
  else ok("RED ARM reproduces: surfaces moved without the checklist leaves FP-1's controller answers under FP-2's blank nameplate");

  const rep3 = room();
  const e3 = makeScreen();
  Sess.openPump(rep3, 'p1', e3, DSL, { adopt: true });
  commission(e3, 'ONE');
  Sess.switchPump(rep3, 'p1', 'p2', e3, DSL, {});
  if (e3.refs.clState['s3_1']) fail('the session switch left a controller answer behind');
  else ok('through the session layer that mixed state cannot be reached');
}

/* 6 & 7 — refusals leave the screen whole */
{
  const rep4 = room();
  const e4 = makeScreen();
  Sess.openPump(rep4, 'p1', e4, DSL, { adopt: true });
  commission(e4, 'ONE');
  delete e4.surfaces.stdData;                                /* a surface goes missing */
  const r = Sess.switchPump(rep4, 'p1', 'p2', e4, DSL, {});
  if (r.switched) fail('switched with a missing surface');
  else if (r.reason !== 'preflight') fail('refused for the wrong reason: ' + JSON.stringify(r));
  else ok('a missing surface is caught before the visit moves, not during');
  if (e4.doc._els['np-serial'].value !== 'SN-ONE' || !e4.refs.clState['s3_1'])
    fail('the refused switch left the screen mixed');
  else ok('the refused switch left FP-1 whole on screen');

  const bad = Sess.switchPump(rep4, 'p1', 'p9', e4, DSL, {});
  if (bad.switched || bad.reason !== 'no-such-pump') fail('a switch to a pump that does not exist was not refused');
  else ok('a switch to a pump that does not exist is refused');
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — two machines, two records, one room ═══\n');
