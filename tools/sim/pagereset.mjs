/* pagereset.mjs — A RESET SAYS WHAT IT TAKES, AND WHAT IT TAKES STAYS GONE (S699)
 *
 * Defect 6 as filed: "the bulk-delete guard names only site photos — other
 * arrays shrink unmentioned; a guard whose job is to say what disappears."
 * Reading the live code, the wording was worse than filed AND the disappearing
 * did not stick:
 *
 *   · the confirmation said only "permanently clears all data entered on this
 *     page" — it named nothing, and quietly included PHOTOGRAPHS under the
 *     word "data", while promising "cannot be undone" about the one class of
 *     thing that IS recoverable;
 *   · the Performance Test branch did `flowTestPhotos.length = 0` and the
 *     Deficiencies branch deleted its keys outright. Truncation is ABSENCE,
 *     and absence never deletes (doctrine I-2) — the cloud still held every
 *     item, so the next sync put them all back and the reset undid itself.
 *     Same machine as the 698 undeletable sign rows.
 *   · tombstoned deficiencies still RENDERED: S605 made the delete an event
 *     and said "renders and counts skip it", but only the counts did.
 *
 * WHAT THIS ENFORCES against the shipped source:
 *   1. no reset branch clears a synced array by truncation
 *   2. photographs are removed through the lifecycle soft-delete, not dropped
 *   3. the guard names what goes, built from live state, not a fixed sentence
 *   4. the guard stops claiming photographs cannot be undone (they restore)
 *   5. the inventory counts what the branch actually clears — and counts only
 *      LIVE items, so an already-tombstoned row is not promised twice
 *   6. a tombstoned deficiency neither renders nor counts in its group header
 *
 * FAIL-FIRST: 1–4 and 6 fail against the pre-fix tree (PR_PRE=1).
 *
 * Run: node tools/sim/pagereset.mjs
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_HERE, '../..');
const PRE_SHA = '0bc2247';   // last tree before the reset became event-based

const PRE = process.env.PR_PRE === '1';
const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}
function grab(file) {
  return PRE
    ? execSync('git show ' + PRE_SHA + ':' + file, { cwd: REPO, maxBuffer: 64e6 }).toString()
    : fs.readFileSync(path.join(REPO, file), 'utf8');
}
/* A probe that matches its own documentation is not evidence. Comments are
   stripped before any code is scanned — the S699 note explaining what the
   truncation USED to be would otherwise register as the truncation itself. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function fnSrc(src, name) {
  const a = src.indexOf('function ' + name + '(');
  if (a < 0) return '';
  let d = 0;
  for (let j = src.indexOf('{', a); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(a, j + 1); }
  }
  return '';
}

console.log('\n═══ PAGE RESET GUARD PROBE ' + (PRE ? '(pre-fix arm)' : '') + ' ═══\n');

const p06d = grab('diesel-app/js/part06d.js');
const defs = grab('lib/ui/deficiencies.js');
const reset = fnSrc(p06d, 'resetCurrentPage');

/* 1 — no truncation of synced arrays inside the reset */
{
  const code = stripComments(reset);
  const truncs = (code.match(/(flowTestPhotos|flowTestPhotosPld|generalDeficiencies)\.length\s*=\s*0/g) || [])
    .concat(code.match(/Object\.keys\(deficiencies\)\.forEach\(k => delete deficiencies\[k\]\)/g) || []);
  check('1. no synced array is cleared by truncation', truncs.length === 0,
    truncs.length ? 'still truncating: ' + truncs.join(' · ') : 'none');
}

/* 2 — photos go through the lifecycle soft-delete */
{
  const usesHelper = /_resetSoftDeletePhotos\(flowTestPhotos\)/.test(reset) &&
                     /_resetSoftDeletePhotos\(flowTestPhotosPld\)/.test(reset);
  const helper = fnSrc(p06d, '_resetSoftDeletePhotos');
  const usesLifecycle = /PhotoLifecycle/.test(helper) && /markDeleted/.test(helper);
  check('2. photographs are soft-deleted through the lifecycle, not dropped',
    usesHelper && usesLifecycle,
    'helperCalled=' + usesHelper + ' usesLifecycle=' + usesLifecycle);
}

/* 3 — the guard names what goes, derived from live state */
{
  const builds = /_resetInventory\(active\)/.test(reset) && /This removes \$\{_inv\.join/.test(reset);
  const fixedSentence = /permanently clears all data entered on this page/.test(reset);
  check('3. the guard names what disappears, built from live state',
    builds && !fixedSentence,
    'derived=' + builds + ' fixedSentence=' + fixedSentence);
}

/* 4 — it no longer claims photographs are unrecoverable */
{
  const honest = /Photographs move to Recently Deleted and can be restored/.test(reset);
  check('4. the guard stops calling recoverable photographs permanent', honest,
    honest ? '' : 'still promising "cannot be undone" over soft-deleted photos');
}

/* 5 — the inventory counts live items only */
{
  const inv = fnSrc(p06d, '_resetInventory');
  if (!inv) { check('5. the inventory counts only live items', false, 'no _resetInventory on this tree'); }
  else {
    const ctx = {
      console, Array, Object, Math, String,
      window: {},
      stdData: [{ suction:'10', discharge:'150', rpm:'1760', photos:[{id:'a'},{id:'b',deleted:true}] }, { suction:'', discharge:'', rpm:'', photos:[] }],
      pldData: [],
      pumpCurvePoints: [{ flow:'100', psi:'150' }, { flow:'', psi:'' }],
      pldPumpCurvePoints: [],
      flowTestPhotos: [{ id:'f1' }, { id:'f2', delState:'deleted' }],
      flowTestPhotosPld: [],
      contractors: [], deficiencies: {}, generalDeficiencies: [],
      contractorSignRows: [], witnessSignRows: []
    };
    ctx.window.PhotoLifecycle = { isDeleted: (p) => p.delState === 'deleted' || !!p.deleted };
    vm.createContext(ctx);
    vm.runInContext(inv, ctx);
    const out = vm.runInContext("_resetInventory('s4')", ctx);
    const joined = out.join(' | ');
    // 1 live std row · 1 live curve point · photos: 1 row photo + 1 flow photo = 2
    const ok = /1 entered 3-point test row/.test(joined) &&
               /1 pump curve point/.test(joined) &&
               /2 photographs/.test(joined);
    check('5. the inventory counts only live items (tombstoned ones excluded)', ok, joined || '(empty)');
  }
}

/* 6 — a tombstoned deficiency neither renders nor counts */
{
  const rg = fnSrc(defs, 'renderDeficGroup');
  const filtersList = /filter\(function\(o\)\{ return o\.d && !o\.d\.deleted; \}\)/.test(rg);
  const keepsIndex = /buildDeficItem\(name, safe, o\.d, o\.i\)/.test(rg);
  check('6. tombstoned deficiencies do not render, and bindings keep their index',
    filtersList && keepsIndex,
    'filtered=' + filtersList + ' originalIndex=' + keepsIndex);
}

const fails = results.filter(r => !r).length;
console.log('\n' + (fails ? fails + ' CHECK(S) FAILED' : 'PASS — the guard tells the truth, and the clearing survives a sync'));
process.exit(fails ? 1 : 0);
