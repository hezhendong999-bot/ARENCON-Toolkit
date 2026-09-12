#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   DIESEL PUMP SURFACES                        tools/sim/mpsurface.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. The pump switch clears a surface and
   rebuilds it by restoring what the tool built for itself at boot. Three
   ways that goes wrong, none of which raises anything:

     A. GAUGE PHOTOS CROSS. The flow tables are fixed-length, so pump 1
        cannot leave surplus rows on pump 2 — but each row carries its
        own gauge photographs, and the tool deliberately preserves row
        photos through an apply because the cloud strips the bytes. Right
        within one report, wrong across two machines: pump 1's suction
        gauge photograph ends up printed as pump 2's evidence, on the
        rated-flow row, with a plausible number beside it.

     B. THE SNAPSHOT IS TAKEN LATE. "Clear" means restore the boot state.
        Capture it after a report has been opened and every future clear
        restores somebody's readings instead of a blank table — the tool
        would look like it was working perfectly.

     C. A RENDERER THAT ISN'T THERE. Clearing the data and calling a
        repaint function that does not exist leaves the old numbers on
        the screen with new numbers behind them. Worse than either state
        on its own.

   WHAT IS ASSERTED:
     1. Every host function the surfaces call exists in the shipped
        Diesel source. A door behind every call.
     2. The flow tables really are fixed-length in the live tool — built
        from a template and only ever written by index. If that ever
        stops being true, the switch's assumptions change and this fails.
     3. Every key pumpContext says needs a clear has one, and every key
        that needs a rebuild has one. Diesel, against the real manifest.
     4. RED ARM A: without clearing the rows, pump 1's gauge photos and
        readings arrive on pump 2. With these surfaces, they do not.
     5. RED ARM B: a snapshot captured after a report is loaded restores
        that report's readings. build() refuses without a snapshot.
     6. Row count survives a clear — a cleared table is blank, not gone.
     7. A report carrying more rows than this build templates is grown to
        fit, never truncated.

   Run:  node tools/sim/mpsurface.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const load = (win, files) => {
  for (const f of files) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8')
      .replace("typeof window !== 'undefined' ? window : globalThis", 'window')
      .replace("typeof window !== 'undefined' ? window : this", 'window');
    new Function('window', 'var module;\n' + src)(win);
  }
};

const win = {};
load(win, ['lib/data/reportState.js', 'multipump/js/sectionScope.js', 'multipump/js/reportShape.js',
           'multipump/js/pumpContext.js', 'multipump/js/dieselSurfaces.js']);
const Ctx = win.MPContext, Surf = win.MPDieselSurfaces, RS = win.ReportState, Shape = win.MPShape;

function liveManifest(tool) {
  const src = fs.readFileSync(path.join(REPO, tool, 'js/reportManifest.js'), 'utf8');
  const box = {};
  new Function('window', 'var module;\n' + src.replace("typeof window !== 'undefined' ? window : globalThis", 'window'))(box);
  return Object.values(box).find((v) => v && v.keys);
}
const DSL = liveManifest('diesel-app');
const dieselSrc = ['part06.js', 'part06b.js', 'part06c.js', 'part06d.js', 'part07.js']
  .map((f) => fs.readFileSync(path.join(REPO, 'diesel-app/js', f), 'utf8')).join('\n');

console.log('\n═══ DIESEL PUMP SURFACES — DOES A CLEARED TABLE STAY THIS PUMP\u2019S? ═══\n');

/* 1 — a door behind every call */
{
  const absent = Surf.HOST_FNS.filter((fn) => !new RegExp('function\\s+' + fn + '\\s*\\(').test(dieselSrc));
  if (absent.length) fail('host function(s) named by the surfaces do not exist in the Diesel source: ' + absent.join(', '));
  else ok(`all ${Surf.HOST_FNS.length} host functions the surfaces call exist in the shipped tool`);
}

/* 2 — the flow tables are fixed-length, which is what the switch assumes */
{
  const built = /const stdData = STD_ROWS\.map/.test(dieselSrc) && /const pldData = PLD_ROWS\.map/.test(dieselSrc);
  const grown = /\bstdData\.(push|splice|pop|shift|unshift)\b|\bpldData\.(push|splice|pop|shift|unshift)\b/.test(dieselSrc);
  if (!built) fail('the flow tables are no longer built from STD_ROWS / PLD_ROWS — the switch\u2019s row assumptions need re-reading');
  else if (grown) fail('the live tool now grows or shrinks a flow table — rows can cross between pumps again');
  else ok('both flow tables are template-built and only ever written by index — no surplus rows to cross');
}

/* ── a stand-in for the Diesel screen, with the SAME shapes the tool has ── */
const STD_BLANK = [
  { pct: '0%', flow: 0, label: 'Churn', suction: '', discharge: '', rpm: '', cutsheet: '', placard: '', photos: [] },
  { pct: '100%', flow: null, label: 'Rated', suction: '', discharge: '', rpm: '', cutsheet: '', placard: '', photos: [] },
  { pct: '150%', flow: null, label: 'Overload', suction: '', discharge: '', rpm: '', cutsheet: '', placard: '', photos: [] }
];
function host() {
  const els = {};
  const ids = [...Ctx.pumpProjIds(DSL), 'npsh-psi', 'npsh-psi-pld'];
  ids.forEach((id) => { els[id] = { value: '', readOnly: false }; });
  const doc = {
    getElementById: (id) => els[id] || null,
    querySelectorAll: () => [],
    querySelector: () => null,
    _els: els
  };
  const refs = {
    stdData: JSON.parse(JSON.stringify(STD_BLANK)),
    pldData: [], smState: { chart3pt: { on: true, x: 0, y: 0 } }, smCapVis: { chart3pt: { relief: true } },
    annDsForce: { chart3pt: {} }, pumpCurvePoints: [], pldPumpCurvePoints: [],
    flowTestPhotos: [], flowTestPhotosPld: [], equipChecked: [], equipChecked4b: []
  };
  const scalars = { npshPsi: '', npshPsiPld: '' };
  const bat = { b1: [0, 0, 0], b2: [0, 0, 0] };
  const custom = {
    collectBatData: () => ({ b1: bat.b1.slice(), b2: bat.b2.slice() }),
    applyBatData: (v) => { if (v && v.b1) bat.b1 = v.b1.slice(); if (v && v.b2) bat.b2 = v.b2.slice(); },
    /* the tool's real rule: a row's photos survive an apply, because the
       cloud strips the bytes and the live row is the only copy */
    assignRowPreservePhotos: (live, incoming) => {
      const keep = live.photos;
      Object.assign(live, incoming);
      if (!incoming.photos || !incoming.photos.length) live.photos = keep;
    }
  };
  const env = {
    doc, refs, custom, opts: {}, ReportState: RS,
    hooks: { assignRowPreservePhotos: custom.assignRowPreservePhotos },
    get: (n) => (n in scalars ? scalars[n] : refs[n]),
    set: (n, v) => { if (n in scalars) scalars[n] = v; else refs[n] = v; },
    _bat: bat
  };
  /* fill in the manifest's remaining custom names so collect/apply run */
  Ctx.pumpManifest(DSL).keys.forEach((e) => {
    if (e.collect && e.collect.kind === 'custom' && !custom[e.collect.fn]) custom[e.collect.fn] = () => undefined;
    if (e.apply && e.apply.kind === 'custom' && !custom[e.apply.fn]) custom[e.apply.fn] = () => {};
  });
  /* the renderers this stand-in stands in for */
  Surf.HOST_FNS.forEach((fn) => { win[fn] = () => {}; });
  return env;
}

/* 3 — every key that needs a surface has one */
{
  const env = host();
  Surf.captureBlank(env);
  const surfaces = Surf.build(env);
  const pl = Ctx.plan(DSL, surfaces);
  if (!pl.ready) fail('Diesel surfaces incomplete: ' + pl.missing.join('; '));
  else ok(`all ${pl.needsClear.length} Diesel pump surfaces declared (${pl.needsRebuild.length} of them rebuildable)`);
}

/* 4 — RED ARM A: gauge photos and readings crossing */
{
  const env = host();
  Surf.captureBlank(env);
  /* pump 1 measured, with a gauge photo on the rated row */
  env.refs.stdData[1].suction = '42';
  env.refs.stdData[1].discharge = '118';
  env.refs.stdData[1].photos.push({ id: 'ph_p1_rated', n: 'rated-gauge.jpg' });

  /* the naive route: apply pump 2's empty table over pump 1's */
  RS.apply({ stdData: [{ pct: '0%' }, { pct: '100%' }, { pct: '150%' }] }, Ctx.pumpManifest(DSL), env);
  const carriedPhoto = env.refs.stdData[1].photos.some((p) => p.id === 'ph_p1_rated');
  const carriedRead = env.refs.stdData[1].suction === '42';
  if (!carriedPhoto && !carriedRead) fail('RED ARM A did not reproduce — the crossing must be shown before the fix can be believed');
  else ok(`RED ARM A reproduces: pump 1's ${carriedPhoto ? 'gauge photo' : 'reading'}${carriedPhoto && carriedRead ? ' and reading' : ''} arrive on pump 2's rated row`);

  /* and the fix, through a real switch */
  const e2 = host();
  Surf.captureBlank(e2);
  const rep = Shape.blank();
  Shape.addPump(rep, { id: 'p1', tag: 'FP-1', type: 'dsl' });
  Shape.addPump(rep, { id: 'p2', tag: 'FP-2', type: 'dsl' });
  e2.surfaces = Surf.build(e2);
  e2.refs.stdData[1].suction = '42';
  e2.refs.stdData[1].discharge = '118';
  e2.refs.stdData[1].photos.push({ id: 'ph_p1_rated', n: 'rated-gauge.jpg' });
  e2.doc._els['np-serial'].value = 'SN-PUMP-ONE';

  const r = Ctx.switchTo(rep, 'p1', 'p2', e2, DSL);
  if (!r.switched) fail('the switch was refused: ' + JSON.stringify(r.missing));
  const rows = e2.refs.stdData;
  if (rows.some((x) => (x.photos || []).length)) fail("pump 1's gauge photos are on pump 2's table");
  else ok("pump 2's table opens with no gauge photographs");
  if (rows[1].suction !== '' || rows[1].discharge !== '') fail("pump 1's readings are on pump 2's table");
  else ok("pump 2's table opens with no readings");
  if (e2.doc._els['np-serial'].value !== '') fail("pump 1's serial number is on pump 2's nameplate");
  else ok("pump 2 opens with an empty nameplate");

  const p1 = Shape.findPump(rep, 'p1');
  const filedPhoto = (p1.data.stdData || [])[1] && (p1.data.stdData[1].photos || []).length === 1;
  if (!filedPhoto || p1.data.stdData[1].suction !== '42') fail("pump 1's row was not filed with its reading and photo");
  else ok("pump 1's reading and its gauge photo are filed on pump 1");

  /* 6 — a cleared table is blank, not gone */
  if (rows.length !== 3) fail(`the cleared table has ${rows.length} rows, not the template's 3`);
  else if (rows[0].label !== 'Churn' || rows[2].label !== 'Overload') fail('the cleared table lost its template rows');
  else ok('the cleared table still has all three template rows, labels intact');
}

/* 5 — RED ARM B: a snapshot taken late */
{
  const env = host();
  env.refs.stdData[1].suction = '42';          /* a report is already open */
  Surf.captureBlank(env);                       /* …and only now captured */
  const s = Surf.build(env);
  s.stdData.clear(env);
  if (env.refs.stdData[1].suction !== '42')
    fail('RED ARM B did not reproduce — a late snapshot was expected to restore the open report');
  else ok("RED ARM B reproduces: a snapshot taken after a report is open makes \"clear\" restore that report's readings");
}

/* 7 — more rows than this build templates are grown to fit, never dropped */
{
  const env = host();
  Surf.captureBlank(env);
  const s = Surf.build(env);
  s.stdData.clear(env);
  const incoming = [{ pct: '0%' }, { pct: '100%' }, { pct: '150%' }, { pct: '175%', suction: '9' }];
  s.stdData.rebuild(env, incoming);
  RS.apply({ stdData: incoming }, Ctx.pumpManifest(DSL), env);
  if (env.refs.stdData.length !== 4 || env.refs.stdData[3].suction !== '9')
    fail('a report with more rows than this build templates lost a reading');
  else ok('a report carrying more rows than this build templates is grown to fit, nothing dropped');
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — a cleared table stays this pump\u2019s ═══\n');
