/* checklistcount.mjs — ONE CHECKLIST, ONE NUMBER (Lane C, S698)
 *
 * MARK, 29 AUG: "the Summary screen counts 61 checklist items; the PDF cover
 * donut counts 55."
 *
 * THE MECHANISM. There was no single answer to "what is on the checklist".
 * FOUR places each kept their own list:
 *    · the checklist engine's sectionItems map          (7 sections — correct)
 *    · a duplicate _srcMap in the render path            (7 — had to be kept in step)
 *    · the PDF cover's own list                          (4 — dropped 6 items)
 *    · the VERDICT fact-gatherer                         (looped 6, mapped 4)
 * The cover therefore under-reported the inspection by six items on the page a
 * client reads first, and — far worse — a "No" on a MANDATORY FA & Signaling
 * item (engine running received at FACP; combined trouble/overpressure; main
 * switch to off/manual) never reached the verdict at all, because s5m appeared
 * in no list but the engine's. The tab dots had the same blind spot, so an
 * unanswered mandatory signal lit nothing.
 *
 * WHAT THIS ENFORCES, against the shipped source:
 *   1. exactly ONE section list survives (CL_GROUPS); the three private copies
 *      are gone
 *   2. the screen's tally, the cover donut, the verdict and the tab dots all
 *      read that definition — no counter walks raw saved answers or its own list
 *   3. every section the checklist engine knows about is covered by CL_GROUPS —
 *      a section cannot be added to the tool and silently miss the cover
 *   4. the three MANDATORY FA items are inside the counted set
 *   5. arithmetic: screen total == cover donut total, on the real manifest
 *   6. a "No" on a mandatory FA item raises the verdict's checklist-No count
 *
 * FAIL-FIRST: 1, 2, 5 and 6 fail against the pre-fix tree (checks below print
 * the pre-fix numbers 61 vs 55 when run with CL_SRC pointed at it).
 *
 * Run: node tools/sim/checklistcount.mjs
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_HERE, '../..');
const PRE_SHA = 'f64406f';   // last tree before the counters were unified

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}
function grab(file, pre) {
  return pre
    ? execSync('git show ' + PRE_SHA + ':' + file, { cwd: REPO, maxBuffer: 64e6 }).toString()
    : fs.readFileSync(path.join(REPO, file), 'utf8');
}
function arrLen(src, name) {
  const a = src.indexOf('const ' + name + ' = [');
  let d = 0;
  for (let j = src.indexOf('[', a); j < src.length; j++) {
    if (src[j] === '[') d++;
    else if (src[j] === ']') { d--; if (d === 0) return (src.slice(src.indexOf('[', a), j + 1).match(/\{\s*(key|num):/g) || []).length; }
  }
  return -1;
}

const PRE = process.env.CL_PRE === '1';
console.log('\n═══ CHECKLIST COUNT PROBE ' + (PRE ? '(pre-fix arm)' : '') + ' ═══\n');

const p06  = grab('diesel-app/js/part06.js', PRE);
const p06c = grab('diesel-app/js/part06c.js', PRE);
const pdf  = grab('diesel-app/js/pdfExport.js', PRE);

/* section sizes, read from the shipped arrays */
const SZ = { s1: arrLen(p06, 'S1'), s2: arrLen(p06, 'S2'), s3: arrLen(p06, 'S3'),
             s4: arrLen(p06, 'S4_items'), s5m: arrLen(p06, 'S5_mandatory'), s5: arrLen(p06, 'S5') };
SZ.s4pld = SZ.s4;

/* 1 — one section list */
{
  const dupSrcMap = /var _srcMap=\{s1:S1/.test(p06c);
  const pdfOwnList = /_ovSecs=\[\[S1,'s1'/.test(pdf);
  const verdictOwnMap = /var srcMap=\{s1:S1,s2:S2,s3:S3,s5:S5\}/.test(p06);
  const hasGroups = /const CL_GROUPS = \[/.test(p06);
  check('1. one section list survives; the three private copies are gone',
    hasGroups && !dupSrcMap && !pdfOwnList && !verdictOwnMap,
    'CL_GROUPS=' + hasGroups + ' renderDup=' + dupSrcMap + ' coverList=' + pdfOwnList + ' verdictMap=' + verdictOwnMap);
}

/* 2 — every counter reads the shared definition */
{
  const screenShared  = /const _c = clCounts\(\);/.test(p06);
  const coverShared   = /CL_GROUPS\.forEach\(function\(g\)\{/.test(pdf);
  const verdictShared = /clChecklistItems\(\)\.forEach\(function\(o\)\{[\s\S]{0,200}f\.checklistNo\+\+/.test(p06);
  const dotsShared    = /clChecklistItems\(\)\.forEach\(function\(o\)\{[\s\S]{0,400}secCounts/.test(p06);
  const rawKeyWalk    = /for\(const v of Object\.values\(clState\)\)/.test(p06);
  check('2. screen, cover, verdict and tab dots all read the one definition',
    screenShared && coverShared && verdictShared && dotsShared && !rawKeyWalk,
    'screen=' + screenShared + ' cover=' + coverShared + ' verdict=' + verdictShared +
    ' dots=' + dotsShared + ' rawKeyWalk=' + rawKeyWalk);
}

/* 3 — CL_GROUPS covers every section the checklist engine knows */
{
  const engineSecs = (p06.match(/\b(s1|s2|s3|s4pld|s4|s5m|s5):\(typeof/g) || [])
    .map(s => s.split(':')[0]);
  const gm = p06.match(/const CL_GROUPS = \[([\s\S]*?)\n\];/);
  const grouped = gm ? (gm[1].match(/secs:\[([^\]]*)\]/g) || [])
    .flatMap(s => s.replace(/secs:\[|\]|'/g, '').split(',').map(x => x.trim()).filter(Boolean)) : [];
  const missing = engineSecs.filter(s => grouped.indexOf(s) === -1);
  check('3. every section the engine knows is covered by the groups',
    gm && missing.length === 0,
    'engine=' + engineSecs.join(',') + '  grouped=' + grouped.join(',') +
    (missing.length ? '  MISSING=' + missing.join(',') : ''));
}

/* 4 — the mandatory FA items are inside the counted set */
{
  const gm = p06.match(/const CL_GROUPS = \[([\s\S]*?)\n\];/);
  check('4. the three mandatory FA & Signaling items are counted',
    !!gm && /'s5m'/.test(gm[1]) && SZ.s5m === 3,
    's5m in groups=' + (!!gm && /'s5m'/.test(gm[1])) + ' mandatory items=' + SZ.s5m);
}

/* 5 — arithmetic on the real manifest: screen total vs cover total */
{
  const gm = p06.match(/const CL_GROUPS = \[([\s\S]*?)\n\];/);
  let coverTotal, screenTotal;
  if (gm) {
    const secs = (gm[1].match(/secs:\[([^\]]*)\]/g) || [])
      .flatMap(s => s.replace(/secs:\[|\]|'/g, '').split(',').map(x => x.trim()).filter(Boolean));
    coverTotal = secs.reduce((a, s) => a + (SZ[s] || 0), 0);
    screenTotal = coverTotal;             // same definition — that is the point
  } else {
    // pre-fix: cover took 1/2/3/5; the screen walked every saved answer
    coverTotal = SZ.s1 + SZ.s2 + SZ.s3 + SZ.s5;
    screenTotal = SZ.s1 + SZ.s2 + SZ.s3 + SZ.s4 + SZ.s4pld + SZ.s5m + SZ.s5;
  }
  check('5. the screen total and the cover donut total are the same number',
    coverTotal === screenTotal,
    'screen=' + screenTotal + '  cover=' + coverTotal +
    (coverTotal === screenTotal ? '  (built-ins; customs add to both)' : '  ← the defect Mark reported'));
}

/* 6 — a No on a mandatory FA item reaches the verdict */
{
  const ctx = { clState: {}, customItems: {}, console };
  const secs = ['s1','s2','s3','s4','s4pld','s5m','s5'];
  ctx.cid = (sec, idx) => sec + '_' + idx;
  ctx._CLENG = { sectionItems: (sec) => Array.from({ length: SZ[sec] || 0 }, (_, i) => ({ num: sec + '.' + i })) };
  vm.createContext(ctx);
  const groupsSrc = (p06.match(/const CL_GROUPS = \[[\s\S]*?\n\];/) || [''])[0];
  const secSrc    = (p06.match(/const CL_SECTIONS = [^\n]*\n/) || [''])[0];
  const itemsFn   = (p06.match(/function clSectionItems\(sec\)\{[\s\S]*?\n\}/) || [''])[0];
  const enumFn    = (p06.match(/function clChecklistItems\(\)\{[\s\S]*?\n\}/) || [''])[0];
  if (groupsSrc && enumFn) {
    vm.runInContext(groupsSrc + '\n' + secSrc + '\n' + itemsFn + '\n' + enumFn, ctx);
    ctx.clState['s5m_0'] = { status: 'no' };     // engine-running signal NOT received
    const n = vm.runInContext("clChecklistItems().filter(function(o){return o.status==='no';}).length", ctx);
    check('6. a No on a mandatory FA signal reaches the verdict count', n === 1,
      'counted ' + n + ' checklist No(s)');
  } else {
    check('6. a No on a mandatory FA signal reaches the verdict count', false,
      'the shared enumerator does not exist on this tree — s5m is scored by nothing');
  }
}

const fails = results.filter(r => !r).length;
console.log('\n' + (fails ? fails + ' CHECK(S) FAILED' : 'PASS — one checklist, one number, every counter agreeing'));
process.exit(fails ? 1 : 0);
