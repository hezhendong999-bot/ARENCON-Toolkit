#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   ENGINE SURFACE PROBE                          tools/sim/enginesurface.mjs
   ───────────────────────────────────────────────────────────────────────
   THE BUG THIS EXISTS TO CATCH (S723, found on Owner's device at 1:35am):

   The Summary checklist donut read "0 CHECKLIST" on a fully answered
   report — 0 Pass, 0 Fail, 0 N/A, 0 I/C — while 61 real answers sat in
   clState and the section rows underneath showed 9/9, 23/23, 8/8.

   Cause: the shared checklist engine takes cfg.sectionItems, uses it
   internally for itemNum, and NEVER RETURNED IT on its public object.
   Two Diesel call sites ask for it defensively:

       (typeof _CLENG!=='undefined' && _CLENG.sectionItems)
           ? (_CLENG.sectionItems(sec)||[])
           : []                                   // <- silently taken

   So the checklist walk found zero items and every counter agreed on
   zero. No error. No warning. A missing door looked like an empty room.

   WHY NOTHING CAUGHT IT: every existing probe tests the checklist
   DEFINITIONS (are the items right, do the counters agree) or lifts host
   functions and compares them to a module. None of them ever asked the
   only question that mattered: DOES THE ENGINE ACTUALLY OFFER THE DOORS
   THE HOSTS KNOCK ON? That question is what this file asks.

   HOW IT WORKS: loads each shared engine the way a browser does — real
   source, real execution, real returned object — then greps every host
   for `HANDLE.member` and asserts every member called is a member that
   exists. Runtime truth on both sides; no regex parsing of the engine,
   because a regex would have happily "found" sectionItems in the config
   where it was never exported from.

   EXTENDING IT: add a row to ENGINES. Every shared engine that hands
   back an API object belongs here. Nine more exist today (lightbox,
   markupTools, markupSelection, markupText, markupEraser,
   markupPolyline, signaturePad, photoMint) and are not yet covered —
   see UNCOVERED at the bottom, which fails the run if that list grows.

   Run:  node tools/sim/enginesurface.mjs
   Red-arm:  BASE_ROOT=/path/to/pre-fix/checkout node tools/sim/enginesurface.mjs
   ═══════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

const failures = [];
const notes = [];
let checked = 0;

/* ── load a classic-script engine the way a browser does ───────────────
   The engines end with:
       })(typeof window !== 'undefined' ? window : this);
   Under Node's module scope `this` is module.exports, which is replaced
   before the assignment lands — which is why a plain import returns an
   empty object and why this probe supplies a real `window` instead. */
function loadEngine(relFile, globalName) {
  const src = fs.readFileSync(path.join(REPO, relFile), 'utf8');
  const win = {};
  new Function('window', 'document', 'module', src)(win, undefined, undefined);
  const g = win[globalName];
  if (!g) throw new Error(`${relFile} did not define window.${globalName}`);
  return g;
}

/* ── the registry ─────────────────────────────────────────────────────
   file      : the shared engine
   global    : what it assigns onto window
   surface   : how to get the object the hosts actually hold
   handles   : identifiers the hosts use for that object
   hosts     : files to search for calls
   stubCfg   : minimal config for factories, so create() runs headlessly */
const ENGINES = [
  {
    name: 'checklist engine',
    file: 'lib/ui/checklist.js',
    global: 'ArcChecklist',
    surface: (g) => g.create({ schemaVer: 1, sectionItems: () => [] }),
    handles: ['_CLENG'],
    hosts: [
      'diesel-app/js/part06.js',
      'diesel-app/js/part06b.js',
      'diesel-app/js/part06c.js',
      'diesel-app/js/part06d.js',
      'diesel-app/js/part03.js',
      'ARENCON_Electric_Fire_Pump_Commissioning.html',
    ],
  },
  {
    name: 'pump acceptance engine',
    file: 'lib/calc/pumpAcceptance.js',
    global: 'PumpAcceptance',
    surface: (g) => g,
    handles: ['PumpAcceptance', 'window.PumpAcceptance'],
    hosts: [
      'diesel-app/js/part06.js',
      'diesel-app/js/part06b.js',
      'diesel-app/js/pdfExport.js',
      'ARENCON_Electric_Fire_Pump_Commissioning.html',
    ],
  },
];

/* The remaining shared engines are plain API objects (no factory), so the
   surface is the object itself and the handle is the global name. Diesel,
   Electric and the exporter are the hosts. Listed compactly because the
   shape is identical for all of them — the point is that NONE of them
   escape the check. */
const DIESEL_HOSTS = [
  'diesel-app/js/part01.js', 'diesel-app/js/part02.js', 'diesel-app/js/part03.js',
  'diesel-app/js/part04.js', 'diesel-app/js/part05.js', 'diesel-app/js/part06.js',
  'diesel-app/js/part06b.js', 'diesel-app/js/part06c.js', 'diesel-app/js/part06d.js',
  'diesel-app/js/part07.js', 'diesel-app/js/part08.js', 'diesel-app/js/part09.js',
  'diesel-app/js/part10.js', 'diesel-app/js/part11.js', 'diesel-app/js/part12.js',
  'diesel-app/js/part13.js', 'diesel-app/js/part14.js', 'diesel-app/js/part15.js',
  'diesel-app/js/part16.js', 'diesel-app/js/pdfExport.js', 'diesel-app/js/reportManifest.js',
  'diesel-app/js/reportBindings.js', 'diesel-sync.js',
  'ARENCON_Electric_Fire_Pump_Commissioning.html',
];

for (const [global, file] of [
  ['CurveData',      'lib/calc/curveData.js'],
  ['PumpCurve',      'lib/calc/pumpCurve.js'],
  ['PhotoDate',      'lib/data/photoDate.js'],
  ['PhotoInventory', 'lib/data/photoInventory.js'],
  ['PhotoLifecycle', 'lib/data/photoLifecycle.js'],
  ['PhotoRetention', 'lib/data/photoRetention.js'],
  ['ReportState',    'lib/data/reportState.js'],
  ['VisionPrep',     'lib/data/visionPrep.js'],
  ['ReportPdf',      'lib/export/reportPdf.js'],
]) {
  ENGINES.push({
    name: global,
    file,
    global,
    surface: (g) => g,
    handles: [global, 'window.' + global],
    hosts: DIESEL_HOSTS,
  });
}

console.log('\n═══ ENGINE SURFACE — do the hosts and the shared engines agree? ═══');
console.log('source:', REPO, '\n');

for (const eng of ENGINES) {
  let surface;
  try {
    surface = eng.surface(loadEngine(eng.file, eng.global));
  } catch (err) {
    failures.push(`${eng.name}: could not load — ${err.message}`);
    continue;
  }
  const offered = new Set(Object.keys(surface));

  /* every member every host calls on this engine */
  const called = new Map();               // member -> [where]
  for (const host of eng.hosts) {
    const p = path.join(REPO, host);
    if (!fs.existsSync(p)) continue;      // Electric may be absent in a slice
    const src = fs.readFileSync(p, 'utf8');
    for (const handle of eng.handles) {
      const re = new RegExp(
        handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '\\.([A-Za-z_$][A-Za-z0-9_$]*)', 'g');
      let m;
      while ((m = re.exec(src)) !== null) {
        if (!called.has(m[1])) called.set(m[1], new Set());
        called.get(m[1]).add(host);
      }
    }
  }

  const missing = [...called.keys()].filter((k) => !offered.has(k)).sort();
  const unused = [...offered].filter((k) => !called.has(k)).sort();
  checked += called.size;

  console.log(`── ${eng.name}  (${eng.file})`);
  console.log(`   offers ${offered.size} · hosts call ${called.size}`);

  for (const k of missing) {
    failures.push(
      `${eng.name}: hosts call .${k}() but the engine NEVER RETURNS IT — ` +
      `every guarded call site silently takes its empty branch.\n` +
      `      called in: ${[...called.get(k)].join(', ')}\n` +
      `      engine offers: ${[...offered].sort().join(', ')}`
    );
  }
  if (!missing.length) console.log('   ✓ every member the hosts call exists on the engine');

  /* Offering more than is called is fine — an engine may serve a host
     that does not use every part. Reported, never failed. */
  if (unused.length) notes.push(`${eng.name}: offered but uncalled — ${unused.join(', ')}`);
}

/* ── guard: a new shared engine must not quietly escape this probe ──── */
const libDir = path.join(REPO, 'lib');
const withApi = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      const s = fs.readFileSync(p, 'utf8');
      if (/\broot\.[A-Za-z_$][\w$]*\s*=\s*(API|api)\b/.test(s)) {
        withApi.push(path.relative(REPO, p).replace(/\\/g, '/'));
      }
    }
  }
})(libDir);

const covered = new Set(ENGINES.map((e) => e.file));
const UNCOVERED_KNOWN = [
  /* Markup, lightbox and photo-mint engines are FACTORY engines whose
     hosts live in Lane A (frt/**), which this Lane C probe does not own.
     They need their own rows with the right hosts and stub configs —
     tracked, not excused indefinitely. */
  'lib/data/photoMint.js', 'lib/ui/lightbox.js', 'lib/ui/markupEraser.js',
  'lib/ui/markupPolyline.js', 'lib/ui/markupSelection.js',
  'lib/ui/markupText.js', 'lib/ui/markupTools.js', 'lib/ui/signaturePad.js',
];
const newlyUncovered = withApi
  .filter((f) => !covered.has(f) && !UNCOVERED_KNOWN.includes(f)).sort();

console.log(`\n── coverage: ${covered.size} of ${withApi.length} shared engines checked`);
if (newlyUncovered.length) {
  failures.push(
    `NEW shared engine(s) not covered by this probe:\n      ` +
    newlyUncovered.join('\n      ') +
    `\n      Add a row to ENGINES, or add to UNCOVERED_KNOWN with a reason.`
  );
} else if (UNCOVERED_KNOWN.length) {
  console.log(`   ${UNCOVERED_KNOWN.length} known-uncovered (markup/lightbox/photo engines) — backlog, not new`);
}

/* ── report ───────────────────────────────────────────────────────────── */
console.log('');
for (const n of notes) console.log('   note: ' + n);
console.log(`\n${checked} host→engine call(s) checked, ${failures.length} problem(s)`);
if (failures.length) {
  console.log('\nPROBLEMS:');
  for (const f of failures) console.log('  ✗ ' + f);
  console.log('\nFAIL — a host is calling something its engine does not offer.');
  console.log('This is the S723 zero-donut failure mode: guarded call sites turn');
  console.log('a missing engine member into a silent zero, not an error.\n');
  process.exit(1);
}
console.log('PASS — every host call has a real door on the engine behind it\n');
