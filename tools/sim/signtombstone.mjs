/* signtombstone.mjs — DELETION IS AN EVENT, NOT AN ABSENCE (Lane C, S695)
 *
 * MARK, AUG: 1490.04 carries 698 blank contractor sign rows from an append
 * bug, cleaned twice from both ends — and every cleaning undone by the next
 * sync. A deleted flow-test photo likewise returned after its ✕.
 *
 * THE MECHANISM. removeSignRow and the flow-test ✕ deleted by SPLICE. A splice
 * is absence, and absence never deletes (doctrine I-2): the merge saw the row
 * on the other side, saw nothing locally, and unioned it straight back. The
 * deletion had no vehicle to travel in.
 *
 * WHAT THIS PROBE ENFORCES, against the REAL _mergeLWW lifted from
 * lib/data/sync.js (not a model of it):
 *   RED  1. pre-fix removeSignRow (pinned @ d049507) splices — the row leaves
 *           the array entirely.
 *        2. feeding that absence through the shipped merge RESURRECTS the row
 *           (tookCloudNew) — the bug, reproduced on the real engine.
 *   GREEN
 *        3. fixed removeSignRow tombstones (deleted + delAt), row keeps its slot.
 *        4. a local tombstone with a newer stamp BEATS the cloud's stale live
 *           copy — the deletion wins where the splice lost.
 *        5. a cloud tombstone REACHES a device still holding the live row —
 *           the deletion propagates.
 *        6. a local-only tombstoned row is NOT dropped as an empty — the
 *           tombstone itself survives union (delete evidence).
 *        7. cleanupEmptySignRows tombstones ONLY rows blank in data and ink;
 *           one typed character keeps a row; already-deleted rows are skipped.
 *        8. buildSignRowHtml with a tombstoned middle row: bindings keep the
 *           ORIGINAL indexes ([0],[2]) and canvas ids (c-2,c-4) while the
 *           visible labels renumber (1,2) — no signature can shift rows.
 *
 * A fix that passes 4 by weakening 6 deletes data; a fix that passes 6 by
 * weakening 4 resurrects it. Both directions are held at once.
 *
 * FAIL-FIRST: checks 1–2 document the defect at d049507 (SIM_TARGET=live).
 *
 * Run: node tools/sim/signtombstone.mjs           (fix arm, repo tree)
 *      SIM_TARGET=live node tools/sim/signtombstone.mjs   (red arm)
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const TARGET = process.env.SIM_TARGET === 'live' ? 'live' : 'fix';
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const PRE_FIX_SHA = 'd04950787b22a5bfa61bfa628d9057a569559fc4';   // S694 — the last pre-tombstone tree

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}
function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error(name + ' not found — did it move?');
  let i = src.indexOf('{', at), depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '/' && p === '*') inBlock = false; continue; }
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === '/' && src[j + 1] === '/') { inLine = true; continue; }
    if (c === '/' && src[j + 1] === '*') { inBlock = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, j + 1); }
  }
  throw new Error(name + ' — brace walk fell off the end');
}
function extractVar(src, name) {
  const at = src.indexOf('var ' + name + ' = {');
  if (at < 0) throw new Error(name + ' not found');
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(at, j + 2); }
  }
  throw new Error(name + ' — brace walk fell off the end');
}

console.log('\n═══ SIGN-ROW / FLOW-PHOTO TOMBSTONE PROBE (' + TARGET + ' arm) ═══\n');

/* ── The REAL merge, lifted whole from the shipped sync engine ── */
const syncSrc = fs.readFileSync(path.join(REPO, 'lib/data/sync.js'), 'utf8');
const lifted = [
  extractVar(syncSrc, '_LWW_SPECS'),
  '_LWW_SPECS.electric = _LWW_SPECS.diesel;',
  extractFn(syncSrc, 'stableKey'),
  extractFn(syncSrc, '_lwwKey'),
  extractFn(syncSrc, '_lwwKeyable'),
  extractFn(syncSrc, '_lwwPairable'),
  extractFn(syncSrc, '_lwwItemEmpty'),
  extractFn(syncSrc, '_lwwHasDeleteEvidence'),
  extractFn(syncSrc, '_lwwStrip'),
  extractFn(syncSrc, '_lwwStripFields'),
  extractFn(syncSrc, '_lwwStripNested'),
  extractFn(syncSrc, '_lwwMergeNestedChildren'),
  extractFn(syncSrc, '_lwwMergeValueSet'),
  extractFn(syncSrc, '_mergeLWW'),
].join('\n');

const ctx = {
  _toolKey: 'diesel',
  _nowSync: () => 1000000,
  console, JSON, Object, Array, Date, Math,
};
vm.createContext(ctx);
try { vm.runInContext(lifted, ctx); }
catch (e) { console.error('LIFT FAILED: ' + e.message); process.exit(2); }
const mergeLWW = ctx._mergeLWW;

const ROW = (id, name, ts, extra) => Object.assign({ id, name: name||'', title:'', company:'', date:'', type:'contractor', _ts: ts||0 }, extra||{});

/* ── the host functions under test ── */
const hostSrc = TARGET === 'fix'
  ? fs.readFileSync(path.join(REPO, 'diesel-app/js/part06b.js'), 'utf8')
  : execSync('git show ' + PRE_FIX_SHA + ':diesel-app/js/part06b.js', { cwd: REPO, maxBuffer: 64e6 }).toString();

const hctx = {
  contractorSignRows: [ROW('a','Alice',10), ROW('b','',10), ROW('c','Carl',10)],
  witnessSignRows: [],
  _sigStrokes: {},
  _renderSignSection: () => {}, renderAllSignRows: () => {},
  showToast: () => {}, debounceAutosave: () => {},
  _aConfirm: (msg, cb) => cb(),        // auto-confirm: the probe is past the modal
  document: { getElementById: () => null },
  console, JSON, Object, Array, Date, Math, setTimeout: (f)=>f(),
};
vm.createContext(hctx);
const hostFns = ['removeSignRow'];
if (TARGET === 'fix') hostFns.push('_signVisible', 'cleanupEmptySignRows', 'buildSignRowHtml');
try { vm.runInContext(hostFns.map(n => extractFn(hostSrc, n)).join('\n'), hctx); }
catch (e) { console.error('HOST LIFT FAILED: ' + e.message); process.exit(2); }

/* 1/3 — what does a remove WRITE? */
vm.runInContext("removeSignRow('contractor', 1)", hctx);
const arr = hctx.contractorSignRows;
if (TARGET === 'live') {
  check('1. pre-fix remove splices — the row leaves the array (the defect)',
    arr.length === 2 && !arr.some(r => r.id === 'b'),
    'rows after remove: ' + arr.map(r => r.id).join(','));
} else {
  check('3. fixed remove tombstones — row keeps its slot, deleted + delAt written',
    arr.length === 3 && arr[1].deleted === true && !!arr[1].delAt,
    'row b: deleted=' + arr[1].deleted + ' delAt=' + arr[1].delAt);
}

/* 2 — absence resurrects, through the REAL merge */
const cloudLive = { contractorSignRows: [ROW('a','Alice',10), ROW('b','',10), ROW('c','Carl',10)] };
if (TARGET === 'live') {
  const localAfterSplice = { contractorSignRows: arr.map(r => ({...r})) };  // b is gone
  const snap = { contractorSignRows: [ROW('a','Alice',10), ROW('b','',10), ROW('c','Carl',10)] };
  const merged = mergeLWW(localAfterSplice, JSON.parse(JSON.stringify(cloudLive)), snap);
  check('2. the shipped merge resurrects the spliced row (absence never deletes)',
    merged.contractorSignRows.some(r => r.id === 'b'),
    'merged ids: ' + merged.contractorSignRows.map(r => r.id).join(','));
} else {
  /* 4 — local tombstone (newer stamp) beats cloud stale live copy */
  const localTomb = { contractorSignRows: [ROW('a','Alice',10), ROW('b','',500,{deleted:true,delAt:'2026-08-29T07:00:00Z'}), ROW('c','Carl',10)] };
  let merged = mergeLWW(JSON.parse(JSON.stringify(localTomb)), JSON.parse(JSON.stringify(cloudLive)), {});
  let b = merged.contractorSignRows.filter(r => r.id === 'b')[0];
  check('4. local tombstone with newer stamp beats the cloud\'s stale live copy',
    !!b && b.deleted === true, 'merged b: ' + JSON.stringify(b));

  /* 5 — cloud tombstone reaches a device still holding the live row */
  const cloudTomb = { contractorSignRows: [ROW('a','Alice',10), ROW('b','',500,{deleted:true,delAt:'2026-08-29T07:00:00Z'}), ROW('c','Carl',10)] };
  const localStale = { contractorSignRows: [ROW('a','Alice',10), ROW('b','',10), ROW('c','Carl',10)] };
  merged = mergeLWW(JSON.parse(JSON.stringify(localStale)), JSON.parse(JSON.stringify(cloudTomb)), { contractorSignRows: [ROW('a','Alice',10), ROW('b','',10), ROW('c','Carl',10)] });
  b = merged.contractorSignRows.filter(r => r.id === 'b')[0];
  check('5. cloud tombstone propagates to a device still holding the live row',
    !!b && b.deleted === true, 'merged b: ' + JSON.stringify(b));

  /* 6 — a local-only tombstoned BLANK row survives union (delete evidence ≠ empty) */
  const localOnlyTomb = { contractorSignRows: [ROW('a','Alice',10), ROW('z','',500,{deleted:true,delAt:'2026-08-29T07:00:00Z'})] };
  merged = mergeLWW(JSON.parse(JSON.stringify(localOnlyTomb)), { contractorSignRows: [ROW('a','Alice',10)] }, {});
  check('6. a local-only tombstone is kept through union — the deletion itself syncs',
    merged.contractorSignRows.some(r => r.id === 'z' && r.deleted === true),
    'merged ids: ' + merged.contractorSignRows.map(r => r.id).join(','));

  /* 7 — cleanup tombstones only truly blank rows */
  hctx.contractorSignRows.length = 0;
  [ROW('p','',0), ROW('q','Quinn',0), ROW('r','',0), ROW('s','',0,{deleted:true,delAt:'x'})].forEach(r => hctx.contractorSignRows.push(r));
  hctx._sigStrokes['sig-canvas-c-4'] = [{x:1,y:1}];   // row index 2 → idx 4: has INK
  vm.runInContext('cleanupEmptySignRows()', hctx);
  const c = hctx.contractorSignRows;
  check('7. cleanup: blank row goes; typed row and inked row stay; deleted row untouched',
    c[0].deleted === true && !c[1].deleted && !c[2].deleted && c[3].deleted === true,
    c.map(r => r.id + ':' + (r.deleted ? 'DEL' : 'live')).join(' '));

  /* 8 — render keeps original index bindings under a tombstoned middle row */
  hctx.contractorSignRows.length = 0;
  [ROW('a','Alice',0), ROW('b','',0,{deleted:true,delAt:'x'}), ROW('c','Carl',0)].forEach(r => hctx.contractorSignRows.push(r));
  const html = vm.runInContext("buildSignRowHtml(contractorSignRows,'contractor','contractor-sign-rows')", hctx);
  check('8. bindings keep ORIGINAL indexes; labels renumber; deleted row absent',
    html.includes('contractorSignRows[0]') && html.includes('contractorSignRows[2]') &&
    !html.includes('contractorSignRows[1]') &&
    html.includes('sig-canvas-c-2') && html.includes('sig-canvas-c-4') && !html.includes('sig-canvas-c-3') &&
    html.includes('Contractor 1') && html.includes('Contractor 2') && !html.includes('Contractor 3'),
    'len=' + html.length);
}

const fails = results.filter(r => !r.pass).length;
console.log('\n' + (fails ? fails + ' CHECK(S) FAILED' : 'PASS — deletions travel as events; nothing resurrects, nothing over-deletes'));
process.exit(fails ? 1 : 0);
