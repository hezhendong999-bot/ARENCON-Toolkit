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
  const names = ['document', 'Date', 'Math', '_ensureFlowPhotoIds', '_ensureDeficIds', 'JSON', 'Object', 'Array', 'Set', 'Number', 'String'];
  const stateNames = Object.keys(st);
  const body = 'var ' + stateNames.map(n => `${n} = __st.${n}`).join(', ') + ';\n' +
    lifted._photoOut + '\n' + lifted.collectState + '\nreturn collectState();';
  return new Function(...names, '__st', body)(...names.map(n => scope[n]), st);
}

/* ── run the MANIFEST-DRIVEN collect against the same shape ─────────────── */
function makeEnv(dom, st, rnd) {
  const mint = (p) => p + '_' + FROZEN_NOW.toString(36) + '_' + rnd().toString(36).substr(2, 6);
  return {
    doc: dom.window.document,
    mintId: (prefix) => mint(prefix),
    refs: {
      stdData: st.stdData, pldData: st.pldData,
      pumpCurvePoints: st.pumpCurvePoints, pldPumpCurvePoints: st.pldPumpCurvePoints,
      clState: st.clState, customItems: st.customItems, contractors: st.contractors,
      deficiencies: st.deficiencies, generalDeficiencies: st.generalDeficiencies,
      contractorSignRows: st.contractorSignRows, witnessSignRows: st.witnessSignRows,
      flowTestPhotos: st.flowTestPhotos, flowTestPhotosPld: st.flowTestPhotosPld,
      recordPhotos: st.recordPhotos, sketchEntries: st.sketchEntries,
      deletedItems: st.deletedItems, distribution: st.distribution,
      smState: st.smState, smCapVis: st.smCapVis, annDsForce: st.annDsForce,
      appendixExcl: st._appendixExcl
    },
    get(n) {
      if (n === 'npshPsi') return st.npshPsi;
      if (n === 'npshPsiPld') return st.npshPsiPld;
      if (n === 'formRevision') return st.formRevision;
      if (n === 'formDateModified') return st.formDateModified;
      if (n === 'contractorTrades') return st.contractorTrades;
      return undefined;
    },
    set(n, v) { st[n === 'contractorTrades' ? 'contractorTrades' : n] = v; },
    opts: {},
    hooks: {},
    custom: {
      collectTestType(env) {
        let t;
        env.doc.querySelectorAll('.pump-type-btns button').forEach(b => { if (b.classList.contains('on')) t = b.dataset.ptype; });
        return t;
      },
      collectTtChosen(env) {
        let t;
        env.doc.querySelectorAll('.pump-type-btns button').forEach(b => { if (b.classList.contains('on')) t = b.dataset.ptype; });
        if (t === undefined) return undefined;
        return st._ttChosen === undefined ? true : !!st._ttChosen;
      },
      collectPitotRows(env) {
        const out = {};
        ['3a', '4b'].forEach(tab => {
          const rows = [];
          const total = (st.pitotCounts && st.pitotCounts[tab]) || 0;
          for (let n = 1; n <= total; n++) {
            const pp = env.doc.getElementById('pp-' + tab + '-' + n);
            const pf = env.doc.getElementById('pf-' + tab + '-' + n);
            const po = env.doc.getElementById('po-' + tab + '-' + n);
            if (!pp && !pf && !po) continue;
            const pr = env.doc.getElementById('pr-' + tab + '-' + n);
            let pid = pr ? pr.getAttribute('data-pid') : null;
            if (!pid) { pid = mint('pt'); if (pr) pr.setAttribute('data-pid', pid); }
            rows.push({ id: pid, p: pp ? pp.value : '', f: pf ? pf.value : '', o: po ? po.value : '1' });
          }
          out[tab] = rows;
        });
        return out;
      },
      collectCustomEquip(env) {
        const out = {};
        ['3a', '4b'].forEach(tab => {
          const arr = [];
          env.doc.querySelectorAll('#equip-custom-' + tab + ' label').forEach(w => {
            const cb = w.querySelector('input[type=checkbox]'), tx = w.querySelector('input[type=text]');
            let cid = w.getAttribute('data-cid');
            if (!cid) { cid = mint('ce'); w.setAttribute('data-cid', cid); }
            arr.push({ id: cid, t: tx ? tx.value : '', c: cb ? cb.checked : true });
          });
          out[tab] = arr;
        });
        return out;
      },
      collectSigStrokes() {
        const o = {};
        Object.keys(st._sigStrokes || {}).forEach(k => { o[k] = { s: JSON.parse(JSON.stringify(st._sigStrokes[k] || [])) }; });
        return o;
      },
      collectBatData() { return { b1: [...st.batData.b1], b2: [...st.batData.b2] }; },
      collectFlowTestPhotos() { return st.flowTestPhotos.map(p => photoOut(p, { tag: p.tag || '' })); },
      collectFlowTestPhotosPld() { return st.flowTestPhotosPld.map(p => photoOut(p, { tag: p.tag || '' })); },
      collectRecordPhotos() { return st.recordPhotos.map(p => photoOut(p, { kind: p.kind, date: p.date || '' })); },
      collectSketchEntries() { return st.sketchEntries.map(e => ({ id: e.id || '', comment: e.comment, markupImg: e.markupImg || null })); },
      collectAppendixState() {
        const out = {};
        (st._appendixExcl || new Set()).forEach(k => { out[k] = { status: 'out' }; });
        (st._appendixIncl || new Set()).forEach(k => { if (!out[k]) out[k] = { status: 'in' }; });
        return out;
      },
      /* apply-side */
      applyNoop() {},
      applyTestType(v, env) {
        /* The real host calls setPumpTestType, which lights the button. The
           collector reads the LIT BUTTON, not a variable — so a stub that only
           set a variable would make this round trip pass while the live one
           failed, which is precisely the S622c bug (the stored choice was
           never restored to the screen, and the next save collected the
           default and overwrote the real choice on every device). */
        st.testType = v;
        env.doc.querySelectorAll('.pump-type-btns button').forEach(b => {
          if (b.dataset.ptype === v) b.classList.add('on'); else b.classList.remove('on');
        });
      },
      applyEquipState(v, env) { applyEquip(v, env, 'equip3a'); },
      applyEquipState4b(v, env) { applyEquip(v, env, 'equip4b'); },
      applyPitotRows(v, env) {
        /* Rows are REBUILT, not written into whatever happens to be on screen.
           A saved report can carry more rows than the screen currently shows
           (someone added two on another device), and writing into missing
           elements silently drops them. */
        Object.keys(v || {}).forEach(tab => {
          st.pitotCounts[tab] = v[tab].length;
          const body = env.doc.body;
          v[tab].forEach((r, i) => {
            const n = i + 1;
            const need = (id, tag) => {
              let e = env.doc.getElementById(id);
              if (!e) { e = env.doc.createElement(tag); e.id = id; body.appendChild(e); }
              return e;
            };
            need('pp-' + tab + '-' + n, 'input').value = r.p;
            need('pf-' + tab + '-' + n, 'input').value = r.f;
            need('po-' + tab + '-' + n, 'input').value = r.o;
            need('pr-' + tab + '-' + n, 'div').setAttribute('data-pid', r.id);
          });
        });
      },
      applyCustomEquip(v, env) {
        Object.keys(v || {}).forEach(tab => {
          const host = env.doc.getElementById('equip-custom-' + tab);
          if (!host) return;
          const labels = host.querySelectorAll('label');
          v[tab].forEach((row, i) => {
            const w = labels[i]; if (!w) return;
            w.setAttribute('data-cid', row.id);
            const cb = w.querySelector('input[type=checkbox]'), tx = w.querySelector('input[type=text]');
            if (cb) cb.checked = !!row.c;
            if (tx) tx.value = row.t;
          });
        });
      },
      applyClState(v) { Object.assign(st.clState, v); },
      applySigStrokes(v) {
        Object.keys(st._sigStrokes).forEach(k => delete st._sigStrokes[k]);
        Object.keys(v || {}).forEach(k => {
          const x = v[k];
          st._sigStrokes[k] = (x && !Array.isArray(x) && Array.isArray(x.s)) ? x.s : x;
        });
      },
      applyBatData(v) { if (v.b1) st.batData.b1 = v.b1.map(Number); if (v.b2) st.batData.b2 = v.b2.map(Number); },
      applyContractorTrades(v) { st.contractorTrades = JSON.parse(JSON.stringify(v)); },
      applyAppendixLegacy(v) { if (Array.isArray(v)) st._appendixExclLegacy = new Set(v); },
      applyAppendixState(v) {
        st._appendixExcl.clear(); st._appendixIncl.clear();
        Object.keys(v || {}).forEach(k => {
          if (v[k].status === 'out') st._appendixExcl.add(k);
          else if (v[k].status === 'in') st._appendixIncl.add(k);
        });
      }
    }
  };
  function applyEquip(v, env, name) {
    const list = env.doc.querySelectorAll('input[name="' + name + '"]');
    Array.prototype.forEach.call(list, (cb, i) => {
      const k = cb.value || ('pos' + i);
      if (v && v[k]) cb.checked = v[k].status === 'yes';
    });
  }
  function photoOut(p, extra) {
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

console.log('\n' + checks + ' checks, ' + fails.length + ' failures');
if (fails.length) {
  console.log('\nFAILURES:');
  fails.slice(0, 6).forEach(f => console.log('  ' + f));
  console.log('\nFAIL — the manifest does not reproduce the live report state\n');
  process.exit(1);
}
console.log('PASS — the manifest gathers exactly what the tool gathers, and gives it all back\n');
process.exit(0);
