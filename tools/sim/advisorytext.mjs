/* advisorytext.mjs — THE WORDING MUST NOT DRIFT (Lane C, S678)
 *
 * S678 moved the advisory sentences a flow-point card prints ("Curve match…",
 * "Suction < NPSH…", "Backflow upstream…", "Churn over-pressure…") OUT of the
 * shared acceptance module and INTO the Diesel host. The module now decides
 * only WHETHER a point earns an advisory and hands back a code plus the
 * numbers; the host owns the words.
 *
 * A move like that has exactly one way to go wrong quietly: the sentence comes
 * out slightly different — a rounded number, a missing section reference, an
 * entity that stops being escaped — and nothing crashes. It just prints a
 * subtly different note on a report that goes to an owner and an AHJ.
 *
 * So the text is pinned to a GOLDEN CAPTURE taken from the pre-move module
 * before a single character was changed (fixtures/advisory_golden.json, 395
 * distinct advisory sets across the full three-point sweep — every code, every
 * combination, and the numeric formatting in each). This probe lifts the live
 * host functions out of source text, re-runs those exact inputs, and demands
 * byte-identical sentences.
 *
 * THE GOLDEN FILE IS A HISTORICAL RECORD, NOT AN OUTPUT. It was produced by
 * the code as it stood on 2026-08-22 and must never be regenerated to make a
 * failure go away. If a sentence is deliberately re-worded, that is a Mark
 * decision, and the fixture is re-cut in the same session with the change
 * stated on the record.
 *
 * Run: node tools/sim/advisorytext.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

/* ── the shared module, loaded the way the browser loads it ─────────────── */
const root = {};
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/calc/pumpCurve.js'), 'utf8'))(root, undefined);
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/calc/pumpAcceptance.js'), 'utf8'))(root, undefined);
if (!root.PumpAcceptance) { console.error('lib/calc/pumpAcceptance.js did not publish PumpAcceptance'); process.exit(1); }

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

const p06 = fs.readFileSync(path.join(REPO, 'diesel-app/js/part06.js'), 'utf8');
const HOST_FNS = ['_ratedNetFrom', '_dslAdvisoryText', '_calcFlowPoint'];
const lifted = {};
for (const n of HOST_FNS) {
  const s = liftFunction(p06, n);
  if (!s) { console.error('could not lift host function: ' + n); process.exit(1); }
  lifted[n] = s;
}

let CTX = { ratedRpm: null, npshPsi: '', sysRating: null, stdData: [] };
function makeHost() {
  const scope = {
    _ratedRpm: () => CTX.ratedRpm,
    _sysRating: () => CTX.sysRating,
    get stdData() { return CTX.stdData; },
    get npshPsi() { return CTX.npshPsi; },
    window: root
  };
  const names = Object.keys(scope);
  const body = HOST_FNS.map(n => lifted[n]).join('\n') +
    '\nreturn { calcStd: _calcFlowPoint, text: _dslAdvisoryText };';
  return new Function(...names, body)(...names.map(k => scope[k]));
}

/* ── the golden capture ─────────────────────────────────────────────────── */
const GOLDEN = path.join(HERE, 'fixtures/advisory_golden.json');
if (!fs.existsSync(GOLDEN)) { console.error('missing golden capture: ' + GOLDEN); process.exit(1); }
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

console.log('\n═══ ADVISORY WORDING — live host vs pre-move golden capture ═══');
console.log('source: ' + REPO);
console.log('golden: ' + golden.length + ' distinct advisory sets\n');

let checked = 0;
const bad = [];

/* 1 — every captured case must re-word identically */
for (const g of golden) {
  CTX = { ratedRpm: g.ctx.ratedRpm, npshPsi: g.ctx.npshPsi, sysRating: g.ctx.sysRating,
          stdData: [{ pct: '100%', placard: '100' }] };
  const got = makeHost().calcStd(g.row).flags;
  checked++;
  if (JSON.stringify(got) !== JSON.stringify(g.flags)) {
    if (bad.length < 8) {
      bad.push(JSON.stringify(g.row) + '\n      golden: ' + JSON.stringify(g.flags) +
                                       '\n      host  : ' + JSON.stringify(got));
    } else bad.push('(more)');
  }
}
console.log('  ' + checked + ' captured cases re-worded — ' + bad.length + ' differences');

/* 2 — every code the module can emit must have a sentence. A code that falls
       through the host's table would silently drop a real advisory off a
       report, which is worse than a wrong sentence because nothing appears. */
const CODES = ['curveBand', 'suctionBelowNpsh', 'backflowLow', 'churnOverPressure'];
const H = makeHost();
const unworded = CODES.filter(c => !H.text({
  code: c, adj: 90, placard: 100, npsh: 30, bfUp: 15, total: 200, sysRating: 175
}));
console.log('  ' + CODES.length + ' module codes checked for wording — ' + unworded.length + ' unworded');

/* 3 — an unknown code must produce nothing at all, not an empty warning row */
const unknownText = H.text({ code: 'somethingNewLater' });
const unknownRow = makeHost().calcStd({ pct: '0%', suction: '', discharge: '', rpm: '', placard: '100', bfUp: '' });
const unknownOk = unknownText === '' && Array.isArray(unknownRow.flags);
console.log('  unknown code drops silently — ' + (unknownOk ? 'yes' : 'NO'));

/* 4 — the module must no longer contain sentence text of its own */
const modSrc = fs.readFileSync(path.join(REPO, 'lib/calc/pumpAcceptance.js'), 'utf8');
const leftovers = ['Curve match:', 'Suction &lt; NPSH', 'Backflow upstream', 'Churn over-pressure']
  .filter(s => modSrc.split('*/').join('').includes(s) || new RegExp("['\"][^'\"\\n]*" + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(modSrc));
console.log('  advisory sentences left inside the shared module — ' + leftovers.length);

const failed = bad.length || unworded.length || !unknownOk || leftovers.length;
if (failed) {
  console.log('\nFAILURES:');
  bad.slice(0, 8).forEach(b => console.log('  ' + b));
  if (unworded.length) console.log('  codes with no sentence: ' + unworded.join(', '));
  if (!unknownOk) console.log('  an unknown advisory code did not drop silently');
  if (leftovers.length) console.log('  sentence text still in the module: ' + leftovers.join(', '));
  console.log('\nFAIL — the advisory wording drifted\n');
  process.exit(1);
}
console.log('\n4/4 — wording identical to the pre-move capture, every code worded, unknowns dropped, module text-free\n');
process.exit(0);
