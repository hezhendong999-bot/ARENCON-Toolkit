/* reportstate.mjs — THE MANIFEST MUST GATHER EXACTLY WHAT THE TOOL GATHERS
 *                                                        (Lane C, S679, Phase 2 Part A)
 *
 * Phase 2 replaces two hand-written lists — one that gathers a report off the
 * screen, one that puts it back — with a single declared manifest read by
 * lib/data/reportState.js. Nothing is wired into the live tool yet; this probe
 * is the evidence that it CAN be, safely.
 *
 * THE RISK BEING TESTED. A wrong verdict is visible on screen the moment it is
 * wrong. A wrong collect is invisible: the report looks right, saves without
 * error, and a value goes missing on somebody's tablet three days later, on a
 * device nobody is holding a laptop next to. So the standard here is not
 * "works" — it is BYTE-IDENTICAL to what the live code produces today, across
 * every shape of report the tool can be in.
 *
 * HOW. The live collectState() is lifted straight out of diesel-app source
 * text and run against a jsdom screen and a controlled set of report globals.
 * The manifest-driven collect is run against an IDENTICAL, independently built
 * screen and state. The two results must serialise identically, key for key.
 *
 * DETERMINISM. Both paths mint permanent ids for pitot rows, custom equipment
 * and pump-curve points using Date.now and Math.random. Each run is given a
 * frozen clock and a seeded generator, reset before each side, so a minted id
 * is reproducible and a difference in ids is a real difference rather than
 * noise. That is deliberate: id minting is part of what the manifest has to
 * reproduce, not something to paper over.
 *
 * ROUND TRIP. Collect alone is half the contract. The last arm applies a
 * collected report into a SECOND, empty tool state through the manifest, then
 * collects again — the second collect must equal the first. That is the
 * property the live paths do not have and cannot be given by inspection: it is
 * what witnessSignRows failed for a year (collected every save, applied
 * nowhere, so a witness signature round-tripped to empty and the next save
 * pushed the emptiness to the cloud).
 *
 * Run: node tools/sim/reportstate.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

/* ── the shared engine and the tool's manifest ──────────────────────────── */
const shared = {};
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/data/reportState.js'), 'utf8'))(shared, undefined);
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'diesel-app/js/reportManifest.js'), 'utf8'))(shared, undefined);
const RS = shared.ReportState, MAN = shared.DieselReportManifest;
if (!RS || !MAN) { console.error('engine or manifest did not publish'); process.exit(1); }

/* ── lift the live host functions out of source text ────────────────────── */
function liftFunction(src, name) {
  const start = src.indexOf('\nfunction ' + name + '(');
  if (start < 0) return null;
  let i = src.indexOf('{', start), depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '/' && p === '*') inBlock = false; continue; }
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === '/' && src[j + 1] === '/') { inLine = true; continue; }
    if (c === '/' && src[j + 1] === '*') { inBlock = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start + 1, j + 1); }
  }
  return null;
}
const p06c = fs.readFileSync(path.join(REPO, 'diesel-app/js/part06c.js'), 'utf8');
const HOST_FNS = ['_photoOut', 'collectState'];
const lifted = {};
for (const n of HOST_FNS) {
  const s = liftFunction(p06c, n);
  if (!s) { console.error('could not lift host function: ' + n); process.exit(1); }
  lifted[n] = s;
}

/* ── deterministic minting ──────────────────────────────────────────────── */
const FROZEN_NOW = 1755800000000;
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ── one report state, built the same way for both sides ────────────────── */
function buildScreen(shape) {
  const ids = MAN.projFieldIds;
  let html = '<body>';
  ids.forEach((id, i) => {
    if (shape.missingFields && shape.missingFields.includes(id)) return;   // field not on this screen
    html += `<input id="${id}" value="${shape.fieldValues ? (shape.fieldValues[i % shape.fieldValues.length]) : ''}">`;
  });
  html += '<input id="npsh-psi"><input id="npsh-psi-pld">';
  html += '<div class="pump-type-btns">';
  html += `<button data-ptype="std" class="${shape.testType === 'std' ? 'on' : ''}"></button>`;
  html += `<button data-ptype="pld" class="${shape.testType === 'pld' ? 'on' : ''}"></button>`;
  html += '</div>';
  (shape.equip3a || []).forEach((on, i) => {
    html += `<input type="checkbox" name="equip3a" value="eq${i}" ${on ? 'checked' : ''}>`;
  });
  (shape.equip4b || []).forEach((on, i) => {
    html += `<input type="checkbox" name="equip4b" value="e4${i}" ${on ? 'checked' : ''}>`;
  });
  ['3a', '4b'].forEach(tab => {
    const n = (shape.pitotCounts && shape.pitotCounts[tab]) || 0;
    for (let i = 1; i <= n; i++) {
      if (shape.removedPitot && shape.removedPitot.includes(tab + '-' + i)) continue;   // removed row
      const pid = (shape.presetPid && i === 1) ? ` data-pid="pt_preset_${tab}"` : '';
      html += `<div id="pr-${tab}-${i}"${pid}></div>`;
      html += `<input id="pp-${tab}-${i}" value="${20 + i}"><input id="pf-${tab}-${i}" value="${300 + i}"><input id="po-${tab}-${i}" value="1">`;
    }
    html += `<div id="pitot-${tab}"></div>`;
    html += `<div id="equip-custom-${tab}">`;
    (shape.customEquip && shape.customEquip[tab] || []).forEach((row, i) => {
      const cid = (shape.presetCid && i === 0) ? ` data-cid="ce_preset_${tab}"` : '';
      html += `<label${cid}><input type="checkbox" ${row.c ? 'checked' : ''}><input type="text" value="${row.t}"></label>`;
    });
    html += '</div>';
  });
  html += '</body>';
  return new JSDOM(html);
}

function buildState(shape) {
  const photo = (i, extra) => Object.assign({
    d: 'data:' + i, n: 'p' + i + '.jpg', id: 'ph' + i, caption: 'c' + i,
    r2Key: 'k' + i, r2Status: i % 2 ? 'uploaded' : '', r2Url: 'u' + i,
    mk: null, _annotated: false, _origBackupId: '', _isOrigBackup: false, _mkTs: 0,
    rotation: 0, deleted: false, deletedDate: '', deletedBy: '', delState: '', delAt: ''
  }, extra || {});
  return {
    npshPsi: shape.npsh === undefined ? '' : shape.npsh,
    npshPsiPld: shape.npshPld === undefined ? '' : shape.npshPld,
    stdData: [{ pct: '0%', suction: '10', discharge: '150', photos: [photo(1)] },
              { pct: '100%', suction: '8', discharge: '120', photos: [] }],
    pldData: [{ pct: '0%', dis_no: '150', suc_no: '10', photos: [] }],
    pumpCurvePoints: shape.curveIds ? [{ id: 'cv_preset', flow: '0', psi: '100' }] : [{ flow: '0', psi: '100' }],
    pldPumpCurvePoints: [{ flow: '0', psi: '90' }],
    clState: { 's1-1': { status: 'yes', comment: 'ok', photos: [photo(2)] } },
    customItems: { s1: [{ num: '1.9', text: 'custom', ref: '' }] },
    contractors: shape.contractors || ['ACME'],
    contractorTrades: { ACME: 'sprinkler' },
    deficiencies: { ACME: [{ id: 'd1', text: 'x', photos: [photo(3)] }] },
    generalDeficiencies: [{ id: 'g1', text: 'gen' }],
    contractorSignRows: [{ name: 'A', sig: '' }],
    witnessSignRows: shape.witness ? [{ name: 'W', sig: '' }] : [],
    _sigStrokes: { 'c-1': [[{ x: 1, y: 2 }]] },
    batData: { b1: [1, 2, 3], b2: [4, 5, 6] },
    flowTestPhotos: [photo(4, { tag: 't1' })],
    flowTestPhotosPld: [photo(5, { tag: 't2' })],
    recordPhotos: [photo(6, { kind: 'pump', date: '2026-08-01' })],
    sketchEntries: [{ id: 's1', comment: 'sk', markupImg: null }],
    deletedItems: { s1: new Set([1, 2]), s2: new Set() },
    distribution: ['owner@x.com'],
    smState: { chart3pt: { on: true, dx: 4 } },
    smCapVis: { chart3pt: { cap: false } },
    annDsForce: { chart3pt: { a: 1 }, pldChart: {} },
    formRevision: shape.rev || 'R01',
    formDateModified: '2026-08-20',
    _appendixExcl: new Set(shape.excl || ['ph1']),
    _appendixIncl: new Set(shape.incl || ['ph4']),
    _ttChosen: shape.ttChosen !== false,
    pitotCounts: shape.pitotCounts || { '3a': 0, '4b': 0 }
  };
}

/* ── run the LIVE collectState against a screen + state ─────────────────── */
function runHost(shape, seed) {
  const dom = buildScreen(shape), st = buildState(shape);
  const rnd = seededRandom(seed);
  const scope = {
    document: dom.window.document,
    Date: Object.assign(function () {}, { now: () => FROZEN_NOW }),
    Math: Object.assign(Object.create(Math), { random: rnd }),
    _ensureFlowPhotoIds: () => {}, _ensureDeficIds: () => {},
    JSON, Object, Array, Set, Number, String
  };
  /* After conversion collectState delegates, so it needs what the browser
     gives it: the engine, the manifest and this tool's bindings. Before
     conversion these are simply unused. The same probe therefore runs on both
     sides of the switch, which is the point. */
  const env = makeEnv(dom, st, seededRandom(seed));
  scope.dieselCollectViaManifest = () => RS.collect(MAN, env);
  const names = ['document', 'Date', 'Math', '_ensureFlowPhotoIds', '_ensureDeficIds',
                 'dieselCollectViaManifest', 'JSON', 'Object', 'Array', 'Set', 'Number', 'String'];
  const stateNames = Object.keys(st);
  const body = 'var ' + stateNames.map(n => `${n} = __st.${n}`).join(', ') + ';\n' +
    lifted._photoOut + '\n' + lifted.collectState + '\nreturn collectState();';
  return new Function(...names, '__st', body)(...names.map(n => scope[n]), st);
}

/* ── run the MANIFEST-DRIVEN collect against the same shape ───────────────
   The bindings under test are the REAL ones from diesel-app/js/reportBindings.js,
   evaluated against the same jsdom screen and the same report globals the live
   collectState sees. An earlier draft of this probe used hand-written stubs and
   was replaced: a stub proves that the ENGINE works, which was never the thing
   in doubt. What has to be proven is that DIESEL'S OWN collectors and appliers
   produce what Diesel produces today, and a stub cannot say anything about
   that — it can only agree with itself. */
const bindingsSrc = fs.readFileSync(path.join(REPO, 'diesel-app/js/reportBindings.js'), 'utf8');

function makeEnv(dom, st, rnd) {
  const doc = dom.window.document;
  const holder = { ReportState: RS, DieselReportManifest: MAN };
  /* Frozen clock + seeded generator so a minted id is reproducible. Id minting
     is part of what has to be reproduced, not noise to paper over. */
  const FakeDate = function () {};
  FakeDate.now = () => FROZEN_NOW;
  const FakeMath = Object.create(Math);
  FakeMath.random = rnd;

  /* The host's report globals, named exactly as the tool names them. This list
     IS the contract: the engine can touch these and nothing else. */
  const names = ['window', 'document', 'Date', 'Math',
    'stdData', 'pldData', 'pumpCurvePoints', 'pldPumpCurvePoints', 'clState', 'customItems',
    'contractors', 'deficiencies', 'generalDeficiencies', 'contractorSignRows', 'witnessSignRows',
    'flowTestPhotos', 'flowTestPhotosPld', 'recordPhotos', 'sketchEntries', 'deletedItems',
    'distribution', 'smState', 'smCapVis', 'annDsForce', 'batData', 'contractorTrades',
    'npshPsi', 'npshPsiPld', 'formRevision', 'formDateModified',
    '_appendixExcl', '_appendixIncl', '_sigStrokes', '_ttChosen', '_csHubMode',
    'pitotCounts', '_photoOut', '_assignRowPreservePhotos', '_migrateClState',
    'setPumpTestType', '_ttApplyGate', 'addPitotRow', 'calcPitotTotal'];
  const values = [holder, doc, FakeDate, FakeMath,
    st.stdData, st.pldData, st.pumpCurvePoints, st.pldPumpCurvePoints, st.clState, st.customItems,
    st.contractors, st.deficiencies, st.generalDeficiencies, st.contractorSignRows, st.witnessSignRows,
    st.flowTestPhotos, st.flowTestPhotosPld, st.recordPhotos, st.sketchEntries, st.deletedItems,
    st.distribution, st.smState, st.smCapVis, st.annDsForce, st.batData, st.contractorTrades,
    st.npshPsi, st.npshPsiPld, st.formRevision, st.formDateModified,
    st._appendixExcl, st._appendixIncl, st._sigStrokes, st._ttChosen, false,
    st.pitotCounts, hostPhotoOut, hostAssignRow, hostMigrateCl,
    (v) => { st.testType = v; lightButton(doc, v); }, () => {},
    makeAddPitotRow(doc, st), () => {}];

  const env = new Function(...names, bindingsSrc + '\nreturn window.dieselStateEnv();')(...values);

  /* The bindings write reassigned scalars back through set(); in the tool those
     land on real globals, here they land on the shape's state so the probe can
     read them back on the next collect. */
  const innerSet = env.set;
  env.set = (n, v) => { st[n] = v; innerSet(n, v); };
  const innerGet = env.get;
  env.get = (n) => (Object.prototype.hasOwnProperty.call(st, n) ? st[n] : innerGet(n));
  return env;
}

/* A faithful stand-in for the tool's own addPitotRow: it APPENDS a numbered
   row and bumps the count, which is what makes rebuilding-from-saved able to
   restore more rows than the screen currently shows. */
function makeAddPitotRow(doc, st) {
  return function (tab, id) {
    st.pitotCounts[tab] = (st.pitotCounts[tab] || 0) + 1;
    const n = st.pitotCounts[tab];
    const host = doc.getElementById('pitot-' + tab) || doc.body;
    const mk = (elId, tag) => {
      let e = doc.getElementById(elId);
      if (!e) { e = doc.createElement(tag); e.id = elId; host.appendChild(e); }
      return e;
    };
    mk('pr-' + tab + '-' + n, 'div').setAttribute('data-pid', id || '');
    mk('pp-' + tab + '-' + n, 'input');
    mk('pf-' + tab + '-' + n, 'input');
    mk('po-' + tab + '-' + n, 'input');
  };
}

function lightButton(doc, v) {
  doc.querySelectorAll('.pump-type-btns button').forEach(b => {
    if (b.dataset.ptype === v) b.classList.add('on'); else b.classList.remove('on');
  });
}
function hostAssignRow(live, incoming) { Object.assign(live, incoming); }
function hostMigrateCl(loaded) { return loaded; }
function hostPhotoOut(p, extra) {
  const o = {
    d: p.d, n: p.n, id: p.id || '', caption: p.caption || '',
    r2Key: p.r2Key || '', r2Status: p.r2Status || '', r2Url: p.r2Url || '',
    mk: p.mk || null, _annotated: p._annotated || false,
    _origBackupId: p._origBackupId || '', _isOrigBackup: p._isOrigBackup || false,
    _mkTs: p._mkTs || 0, rotation: p.rotation || 0, deleted: p.deleted || false,
    deletedDate: p.deletedDate || '', deletedBy: p.deletedBy || '',
    delState: p.delState || '', delAt: p.delAt || ''
  };
  if (extra) Object.keys(extra).forEach(k => { o[k] = extra[k]; });
  return o;
}

function runManifest(shape, seed) {
  const dom = buildScreen(shape), st = buildState(shape);
  const env = makeEnv(dom, st, seededRandom(seed));
  return { state: RS.collect(MAN, env), env, st, dom };
}

/* ── the shapes a report can be in ──────────────────────────────────────── */
const SHAPES = [
  { name: 'empty report, nothing chosen', testType: undefined, pitotCounts: { '3a': 0, '4b': 0 } },
  { name: '3-point chosen', testType: 'std', pitotCounts: { '3a': 2, '4b': 0 }, equip3a: [true, false, true] },
  { name: '7-point chosen', testType: 'pld', pitotCounts: { '3a': 0, '4b': 3 }, equip4b: [false, true] },
  { name: 'both tabs populated', testType: 'std', pitotCounts: { '3a': 2, '4b': 2 },
    equip3a: [true, true], equip4b: [true, false],
    customEquip: { '3a': [{ t: 'ladder', c: true }], '4b': [{ t: 'gauge', c: false }] } },
  { name: 'pitot row removed mid-list', testType: 'std', pitotCounts: { '3a': 3, '4b': 0 }, removedPitot: ['3a-2'] },
  { name: 'ids already minted', testType: 'std', pitotCounts: { '3a': 2, '4b': 0 },
    presetPid: true, presetCid: true, curveIds: true,
    customEquip: { '3a': [{ t: 'preset', c: true }, { t: 'fresh', c: false }], '4b': [] } },
  { name: 'fields missing from screen', testType: 'std', missingFields: ['pi-client', 'np-mfr', 'so-name'], pitotCounts: { '3a': 1, '4b': 0 } },
  { name: 'values in every field', testType: 'pld', fieldValues: ['12', 'ACME', '', '0', 'x'], pitotCounts: { '3a': 1, '4b': 1 } },
  { name: 'test type unchosen but data present', testType: undefined, ttChosen: false, pitotCounts: { '3a': 1, '4b': 0 }, equip3a: [true] },
  { name: 'witness signatures present', testType: 'std', witness: true, pitotCounts: { '3a': 0, '4b': 0 } },
  { name: 'appendix decisions both ways', testType: 'std', excl: ['ph1', 'ph3'], incl: ['ph4', 'ph6'], pitotCounts: { '3a': 0, '4b': 0 } },
  { name: 'no contractors', testType: 'std', contractors: [], pitotCounts: { '3a': 0, '4b': 0 } }
];

const norm = v => JSON.stringify(v, (k, x) => (x instanceof Set ? Array.from(x) : x));

/* A minted id is a random draw by design. Demanding that two implementations
   produce the SAME random draw in the same order tests the order of a random
   number generator, not the report. So freshly minted ids are compared as
   "an id is present here", and their real properties — presence, uniqueness,
   and above all that an EXISTING id is never overwritten — are asserted
   separately below. Ids that were already on the row (the 'ids already
   minted' shape) are compared verbatim, because preserving them is the whole
   point of having them. */
const MINTED = /^(pt|ce|cv)_[a-z0-9]+_[a-z0-9]+$/;
const normIds = v => JSON.stringify(v, (k, x) => {
  if (x instanceof Set) return Array.from(x);
  if (k === 'id' && typeof x === 'string' && MINTED.test(x)) return '<minted>';
  return x;
});

console.log('\n═══ REPORT STATE — manifest-driven collect vs the live collectState ═══');
console.log('source: ' + REPO);
console.log('manifest: ' + MAN.keys.length + ' declared keys, ' + MAN.projFieldIds.length + ' project fields\n');

let checks = 0, fails = [];
function check(label, cond, detail) {
  checks++;
  if (!cond) fails.push(label + (detail ? '\n      ' + detail : ''));
}

/* 1 — the manifest is structurally sound */
const aud = RS.audit(MAN);
check('manifest audit', aud.ok, JSON.stringify(aud));
console.log('  manifest audit — ' + aud.total + ' keys, no duplicates, no one-sided keys: ' + (aud.ok ? 'ok' : 'FAIL'));

/* 2 — every key the live collect produces is declared, and vice versa */
const liveKeys = Object.keys(runHost(SHAPES[3], 7)).sort();
const manKeys = Object.keys(runManifest(SHAPES[3], 7).state).sort();
const missing = liveKeys.filter(k => !manKeys.includes(k));
const extra = manKeys.filter(k => !liveKeys.includes(k));
check('no key the tool saves is missing from the manifest', !missing.length, 'missing: ' + missing.join(', '));
check('the manifest invents no key the tool does not save', !extra.length, 'extra: ' + extra.join(', '));
console.log('  key coverage — live ' + liveKeys.length + ' / manifest ' + manKeys.length +
            ' · missing ' + missing.length + ' · invented ' + extra.length);

/* 3 — byte-identical collect across every shape */
let shapeFails = 0;
for (const shape of SHAPES) {
  const a = runHost(shape, 11);
  const b = runManifest(shape, 11).state;
  let diffs = [];
  const allKeys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of allKeys) {
    if (normIds(a[k]) !== normIds(b[k])) diffs.push(k);
  }
  if (diffs.length) {
    shapeFails++;
    fails.push('shape "' + shape.name + '" differs on: ' + diffs.join(', ') +
      '\n      live: ' + String(normIds(a[diffs[0]])).slice(0, 160) +
      '\n      man : ' + String(normIds(b[diffs[0]])).slice(0, 160));
  }
  checks++;
}
console.log('  ' + SHAPES.length + ' report shapes collected both ways — ' + shapeFails + ' differ');

/* 4 — round trip: collect -> apply into a fresh tool -> collect again */
let rtFails = 0;
for (const shape of SHAPES) {
  const first = runManifest(shape, 3).state;
  const fresh = runManifest({ name: 'blank', testType: undefined, pitotCounts: shape.pitotCounts,
                              customEquip: shape.customEquip, equip3a: (shape.equip3a || []).map(() => false),
                              equip4b: (shape.equip4b || []).map(() => false),
                              missingFields: shape.missingFields, removedPitot: shape.removedPitot }, 3);
  RS.apply(first, MAN, fresh.env);
  const second = RS.collect(MAN, fresh.env);
  const diffs = Object.keys(first).filter(k => norm(first[k]) !== norm(second[k]));
  if (diffs.length) {
    rtFails++;
    fails.push('round trip "' + shape.name + '" lost or changed: ' + diffs.join(', ') +
      '\n      saved   : ' + String(norm(first[diffs[0]])).slice(0, 160) +
      '\n      reloaded: ' + String(norm(second[diffs[0]])).slice(0, 160));
  }
  checks++;
}
console.log('  ' + SHAPES.length + ' round trips (save -> reopen -> save) — ' + rtFails + ' lost data');

/* 5 — an absent key must never blank live state. This is the rule that makes a
       partial payload safe, and the one a hand-written apply path forgets. */
{
  const t = runManifest(SHAPES[3], 5);
  const before = norm(RS.collect(MAN, t.env));
  RS.apply({}, MAN, t.env);
  const after = norm(RS.collect(MAN, t.env));
  check('an empty payload changes nothing', before === after);
  const partial = { formRevision: 'R09' };
  RS.apply(partial, MAN, t.env);
  const afterPartial = RS.collect(MAN, t.env);
  check('a partial payload changes only what it names',
    afterPartial.formRevision === 'R09' && norm(afterPartial.stdData) === norm(JSON.parse(after).stdData));
  console.log('  absent keys never blank live state — ' +
    (before === after ? 'ok' : 'FAIL'));
}

/* 6 — one bad key must not abandon the other thirty-eight (the S643 lesson:
       the live path wraps every line in ONE try). */
{
  const t = runManifest(SHAPES[1], 9);
  const broken = JSON.parse(JSON.stringify(RS.collect(MAN, t.env)));
  broken.stdData = 'not-an-array-at-all';
  broken.formRevision = 'R44';
  const res = RS.apply(broken, MAN, t.env);
  const after = RS.collect(MAN, t.env);
  check('a bad key does not abandon the restore', after.formRevision === 'R44',
        'applied ' + res.applied.length + ' failed ' + JSON.stringify(res.failed));
  console.log('  one bad key does not abandon the restore — ' +
    (after.formRevision === 'R44' ? 'ok (' + res.applied.length + ' keys still landed)' : 'FAIL'));
}

/* 7 — IDENTITY. Arm 3 compares freshly minted ids as "<minted>", so the real
       properties of an id are asserted here instead. The one that matters most
       is the last: a row that already HAS a name must never be given a new
       one. Re-minting is indistinguishable from a new row to the merge engine,
       so it does not corrupt a value — it duplicates the row on the other
       device, which is worse, because nothing looks wrong on either screen. */
{
  const t = runManifest(SHAPES[5], 21);   // the 'ids already minted' shape
  const s = t.state;
  const allIded = [].concat(s.pumpCurvePoints || [], s.pldPumpCurvePoints || [],
                            (s.pitotRows && s.pitotRows['3a']) || [], (s.pitotRows && s.pitotRows['4b']) || [],
                            (s.customEquip && s.customEquip['3a']) || [], (s.customEquip && s.customEquip['4b']) || []);
  const everyHasId = allIded.every(r => r && typeof r.id === 'string' && r.id.length > 0);
  const ids = allIded.map(r => r.id);
  const unique = new Set(ids).size === ids.length;
  const preserved = (s.pumpCurvePoints || []).some(r => r.id === 'cv_preset') &&
                    ((s.pitotRows && s.pitotRows['3a']) || []).some(r => r.id === 'pt_preset_3a') &&
                    ((s.customEquip && s.customEquip['3a']) || []).some(r => r.id === 'ce_preset_3a');
  check('every identity-bearing row carries an id', everyHasId, JSON.stringify(ids));
  check('minted ids are unique', unique, JSON.stringify(ids));
  check('an existing id is never re-minted over', preserved, JSON.stringify(ids));
  console.log('  identities — ' + ids.length + ' rows, all named: ' + (everyHasId ? 'yes' : 'NO') +
              ' · unique: ' + (unique ? 'yes' : 'NO') + ' · existing preserved: ' + (preserved ? 'yes' : 'NO'));
}

/* 8 — THE PRE-CONVERSION GOLDEN.
       Arm 3 compares the live collectState against the manifest. The moment
       Part B converts collectState INTO a call to the manifest, that
       comparison becomes two ways of saying the same thing and quietly stops
       testing anything — the same trap the acceptance differential hit in
       Phase 1. So what the tool produced BEFORE conversion is captured once,
       from the old code, and checked in. From here on the question is not
       "do the two agree" but "does the tool still produce exactly what it
       produced on 22 Aug 2026, before any of this started".

       THE GOLDEN FILE IS A HISTORICAL RECORD, NOT AN OUTPUT. Never regenerate
       it to clear a failure. A deliberate change to what a report carries is a
       Mark decision, re-cut in the same session, stated on the record. */
{
  const GOLDEN = path.join(HERE, 'fixtures/reportstate_golden.json');
  if (process.env.CUT_GOLDEN === '1') {
    const cut = SHAPES.map(s => ({ shape: s.name, state: JSON.parse(normIds(runHost(s, 11))) }));
    fs.writeFileSync(GOLDEN, JSON.stringify(cut));
    console.log('  GOLDEN RE-CUT — ' + cut.length + ' shapes written. This must be a deliberate, stated decision.');
  } else if (!fs.existsSync(GOLDEN)) {
    check('pre-conversion golden exists', false, 'missing ' + GOLDEN);
  } else {
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    let gFails = 0;
    golden.forEach(g => {
      const shape = SHAPES.find(s => s.name === g.shape);
      if (!shape) { gFails++; fails.push('golden shape no longer exists: ' + g.shape); return; }
      const now = JSON.parse(normIds(runHost(shape, 11)));
      const diffs = [...new Set([...Object.keys(g.state), ...Object.keys(now)])]
        .filter(k => JSON.stringify(g.state[k]) !== JSON.stringify(now[k]));
      if (diffs.length) {
        gFails++;
        fails.push('the tool no longer produces what it produced pre-conversion — shape "' + g.shape +
          '" differs on: ' + diffs.join(', ') +
          '\n      then: ' + String(JSON.stringify(g.state[diffs[0]])).slice(0, 160) +
          '\n      now : ' + String(JSON.stringify(now[diffs[0]])).slice(0, 160));
      }
      checks++;
    });
    console.log('  ' + golden.length + ' shapes vs the pre-conversion capture — ' + gFails + ' differ');
  }
}

console.log('\n' + checks + ' checks, ' + fails.length + ' failures');
if (fails.length) {
  console.log('\nFAILURES:');
  fails.slice(0, 6).forEach(f => console.log('  ' + f));
  console.log('\nFAIL — the manifest does not reproduce the live report state\n');
  process.exit(1);
}
console.log('PASS — the manifest gathers exactly what the tool gathers, and gives it all back\n');
process.exit(0);
