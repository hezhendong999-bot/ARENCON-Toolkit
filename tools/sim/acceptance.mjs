/* acceptance.mjs — THE MODULE AND THE HOST MUST AGREE (Lane C, S676)
 *
 * UNIFICATION PROGRAM, PHASE 1 — the characterisation proof.
 *
 * An extraction must not change behaviour, and proving that needs a different
 * kind of test from a bug fix. There is no "expected value" to assert here:
 * the CURRENT code IS the specification. So this probe runs both — the live
 * host functions, lifted straight out of diesel-app/js source text, and the
 * extracted lib/calc/pumpAcceptance.js — over the same wide sweep of inputs
 * and demands they agree on every field of every result.
 *
 * WHY LIFT THE SOURCE RATHER THAN BOOT THE APP. The host functions read the
 * screen and the report globals, so a comparison would otherwise need the
 * whole tool running. Lifting the named functions and evaluating them against
 * a controlled context isolates the JUDGEMENT from the screen — which is
 * exactly the separation the extraction is making. It also means the probe
 * keeps working after the host is converted to delegate: at that point the
 * lifted host function calls the module, both sides agree trivially, and the
 * probe becomes a guard that the delegation stayed wired. Before conversion it
 * is a differential; after conversion it is a tripwire. Both are worth having.
 *
 * COVERAGE: every gate percentage including the informational ones, the ±1%
 * curve band walked across its edges, missing and blank and zero and negative
 * readings, RPM present and absent, overrides in every state, PLD setpoints
 * either side of the +3 psi step, and the full overall-verdict rule ladder
 * including the precedence order between a consultant Fail, an outstanding
 * deficiency, a missed gate and NOT CONFIRMED.
 *
 * Run: node tools/sim/acceptance.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

/* ── load the extracted module the way the browser does ─────────────────── */
const modSrc = fs.readFileSync(path.join(REPO, 'lib/calc/pumpAcceptance.js'), 'utf8');
const curveSrc = fs.readFileSync(path.join(REPO, 'lib/calc/pumpCurve.js'), 'utf8');
const root = {};
new Function('window', 'module', curveSrc)(root, undefined);
new Function('window', 'module', modSrc)(root, undefined);
const M = root.PumpAcceptance;
if (!M) { console.error('lib/calc/pumpAcceptance.js did not publish PumpAcceptance'); process.exit(1); }

/* ── lift the live host functions out of the source text ────────────────── */
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

const p06  = fs.readFileSync(path.join(REPO, 'diesel-app/js/part06.js'), 'utf8');
const p06b = fs.readFileSync(path.join(REPO, 'diesel-app/js/part06b.js'), 'utf8');

const HOST_FNS = ['_ratedNetFrom', '_isGatePct', '_nfpa20Gate', '_effVerdict',
                  '_pldDeviceCheck', '_curveDevOver1pct', '_dslAdvisoryText',
                  '_calcFlowPoint', 'updatePldVerdictObj'];
const lifted = {};
for (const n of HOST_FNS) {
  const s = liftFunction(p06, n) || liftFunction(p06b, n);
  if (!s) { console.error('could not lift host function: ' + n); process.exit(1); }
  lifted[n] = s;
}
const liftedVerdict = liftFunction(p06b, '_dslVerdict');
if (!liftedVerdict) { console.error('could not lift _dslVerdict'); process.exit(1); }

/* The host context each lifted function sees. These are the very reads the
   extraction removes from the judgement: the screen (rated RPM, system rating,
   PLD setting) and the report globals (the row arrays, NPSH). */
let CTX = { ratedRpm: null, ratedNet: null, npshPsi: '', sysRating: null,
            pldSetting: null, stdData: [], pldData: [], skipSet: new Set() };

function makeHost() {
  const scope = {
    _ratedRpm: () => CTX.ratedRpm,
    _ratedRpmPld: () => CTX.ratedRpm,
    _sysRating: () => CTX.sysRating,
    _pldSetting: () => CTX.pldSetting,
    get stdData() { return CTX.stdData; },
    get pldData() { return CTX.pldData; },
    get npshPsi() { return CTX.npshPsi; },
    get npshPsiPld() { return CTX.npshPsi; },   /* S722 — 7-point reads its own NPSH global */
    get PLD_NO_SKIP() { return CTX.skipSet; },
    window: root
  };
  const names = Object.keys(scope);
  const body = HOST_FNS.map(n => lifted[n]).join('\n') + '\n' + liftedVerdict + '\n' +
    'return { calcStd: _calcFlowPoint, calcPld: updatePldVerdictObj, gate: _nfpa20Gate,' +
    '         ratedNetFrom: _ratedNetFrom, isGatePct: _isGatePct, effVerdict: _effVerdict,' +
    '         pldDeviceCheck: _pldDeviceCheck, verdict: _dslVerdict };';
  return new Function(...names, '_dslVerdictFacts', body)(...names.map(k => scope[k]), () => CTX.facts);
}

/* ── comparison ─────────────────────────────────────────────────────────── */
let cases = 0, mismatches = [];
const norm = v => JSON.stringify(v, (k, x) => (typeof x === 'number' && !isFinite(x)) ? String(x) : x);
/* S678 — the host now adds its own worded `flags` on top of the module's
   `advisories` codes, so it legitimately carries a key the module does not.
   This probe is about the JUDGEMENT; the wording has its own tripwire in
   tools/sim/advisorytext.mjs, pinned to a golden capture of the pre-move text.
   Only that one presentation key is dropped — everything else must still match
   field for field, so a delegation that quietly stopped being wired still
   shows up red here. */
const judgement = v => {
  if (!v || typeof v !== 'object' || !('flags' in v)) return v;
  const c = { ...v }; delete c.flags; return c;
};
function agree(label, a, b) {
  cases++;
  if (norm(a) !== norm(b) && mismatches.length < 8) {
    mismatches.push(label + '\n      host: ' + norm(a) + '\n      lib : ' + norm(b));
  } else if (norm(a) !== norm(b)) { mismatches.push(label); }
}

const H = makeHost();
const PCTS = ['0%', '25%', '50%', '75%', '100%', '125%', '150%', '', undefined];
const NUMS = ['', '0', '-5', '20', '65', '99', '100', '100.5', '101', '139', '140', '141', '150', 'abc'];
const OVERRIDES = ['', 'auto', 'pass', 'fail', 'flag'];
const RPMS = ['', '0', '1760', '1500', '2000'];

console.log('\n═══ ACCEPTANCE DIFFERENTIAL — host source vs lib/calc/pumpAcceptance.js ═══');
console.log('source: ' + REPO + '\n');

/* 1 — the primitives */
for (const pct of PCTS) {
  for (const adj of [null, NaN, -10, 0, 64.9, 65, 65.1, 99.9, 100, 139.9, 140, 140.1, 200]) {
    for (const rn of [null, NaN, 0, -5, 100]) {
      agree(`gate(${pct},${adj},${rn})`, H.gate(pct, adj, rn), M.nfpa20Gate(pct, adj, rn));
    }
  }
  agree(`isGatePct(${pct})`, H.isGatePct(pct), M.isGatePct(pct));
}
for (const a of ['pass', 'fail', 'na', undefined]) for (const o of OVERRIDES) {
  agree(`effVerdict(${a},${o})`, H.effVerdict(a, o), M.effVerdict(a, o));
}
for (const d of [NaN, -1, 0, 50, 52.9, 53, 53.1, 60]) for (const s of [NaN, 0, -3, 50]) {
  agree(`pldDeviceCheck(${d},${s})`, H.pldDeviceCheck(d, s), M.pldDeviceCheck(d, s));
}
for (const rows of [null, [], [{ pct: '100%' }], [{ pct: '100%', placard: '' }],
                    [{ pct: '100%', placard: '0' }], [{ pct: '50%', placard: '90' }, { pct: '100%', placard: '120' }]]) {
  agree('ratedNetFrom', H.ratedNetFrom(rows), M.ratedNetFrom(rows));
}
console.log('  ' + cases + ' primitive cases compared');

/* 2 — the 3-point flow point, across the full context sweep */
let before = cases;
for (const ratedRpm of [null, 1760]) {
  for (const sysRating of [null, 175]) {
    for (const npsh of ['', '30']) {
      CTX = { ...CTX, ratedRpm, sysRating, npshPsi: npsh,
              stdData: [{ pct: '100%', placard: '100' }] };
      const Hc = makeHost();   // rebuilt per context: the lift binds values, not getters
      for (const pct of PCTS) {
        for (const suction of NUMS) {
          for (const discharge of ['', '0', '50', '120', '165', '200']) {
            for (const rpm of RPMS) {
              for (const over of OVERRIDES) {
                const row = { pct, suction, discharge, rpm, placard: '100', bfUp: '15', overStd: over };
                agree(`std ${pct}/${suction}/${discharge}/${rpm}/${over}`,
                  judgement(Hc.calcStd(row)),
                  M.evalStdPoint(row, { ratedRpm, ratedNet: M.ratedNetFrom(CTX.stdData), npshPsi: npsh, sysRating }));
              }
            }
          }
        }
      }
    }
  }
}
console.log('  ' + (cases - before) + ' three-point cases compared');

/* 3 — the 7-point flow point */
before = cases;
for (const ratedRpm of [null, 1760]) {
  for (const pldSetting of [null, 50]) {
    for (const skip of [false, true]) {
      /* S722 — system rating and NPSH now reach the 7-point evaluator too. */
      for (const sysRating of [null, 150]) {
        for (const npshPsi of ['', '25']) {
          CTX = { ...CTX, ratedRpm, pldSetting, sysRating, npshPsi, pldData: [{ pct: '100%', placard: '100' }],
                  skipSet: skip ? new Set([0]) : new Set() };
          const Hc = makeHost();   // rebuilt per context
          for (const pct of PCTS) {
            for (const dis_no of ['', '0', '120', '165']) {
              for (const suc_no of ['', '0', '20']) {
                for (const dis_w of ['', '45', '50', '53', '54', '80']) {
                  for (const rpm_no of RPMS) {
                    for (const over of OVERRIDES) {
                      for (const bfUp of ['', '15']) {
                        const row = { pct, dis_no, suc_no, dis_w, suc_w: '10', rpm_no, bfUp, placard: '100', overPld: over };
                        agree(`pld ${pct}/${dis_no}/${suc_no}/${dis_w}/${rpm_no}/${over}/bf${bfUp}/sr${sysRating}/npsh${npshPsi}/skip${skip}`,
                          Hc.calcPld(row, 0),
                          M.evalPldPoint(row, { ratedRpm, ratedNet: M.ratedNetFrom(CTX.pldData), pldSetting, skipNoPLD: skip, npshPsi, sysRating }));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
console.log('  ' + (cases - before) + ' seven-point cases compared');

/* 3b — S722: the gap itself. A 7-point churn row over the system rating must
   raise churnOverPressure — through the HOST, worded by _dslAdvisoryText —
   and the same row on the 3-point path must produce the identical sentence.
   Before S722 this was the missing warning; this block is what keeps it from
   going missing again. */
{
  CTX = { ...CTX, ratedRpm: 1760, pldSetting: null, sysRating: 150, npshPsi: '',
          pldData: [{ pct: '100%', placard: '100' }], stdData: [{ pct: '100%', placard: '100' }], skipSet: new Set() };
  const Hc = makeHost();
  const pldRow = { pct: '0%', dis_no: '165', suc_no: '20', dis_w: '80', suc_w: '20', rpm_no: '1760', placard: '100', overPld: '' };
  const stdRow = { pct: '0%', discharge: '165', suction: '20', rpm: '1760', placard: '100', overStd: '' };
  const pv = Hc.calcPld(pldRow, 0);
  const sv = Hc.calcStd(stdRow);
  const pldCodes = (pv.advisories || []).map(a => a.code);
  const stdCodes = (sv.advisories || []).map(a => a.code);
  const word = a => new Function('return (' + lifted._dslAdvisoryText + ')')()(a);
  const pldChurn = (pv.advisories || []).filter(a => a.code === 'churnOverPressure').map(word);
  const stdChurn = (sv.advisories || []).filter(a => a.code === 'churnOverPressure').map(word);
  cases += 3;
  if (!pldCodes.includes('churnOverPressure')) mismatches.push('S722 gap: 7-point churn row over system rating raised NO churnOverPressure — codes: ' + JSON.stringify(pldCodes));
  if (!stdCodes.includes('churnOverPressure')) mismatches.push('S722 gap: 3-point control row lost churnOverPressure — codes: ' + JSON.stringify(stdCodes));
  if (JSON.stringify(pldChurn) !== JSON.stringify(stdChurn)) mismatches.push('S722 gap: 7-point and 3-point churn sentences differ\n      pld: ' + JSON.stringify(pldChurn) + '\n      std: ' + JSON.stringify(stdChurn));
  console.log('  3 seven-point-vs-three-point churn over-pressure cases compared' + (pldChurn.length ? ' — "' + pldChurn[0] + '"' : ''));
}

/* 4 — the overall verdict rule ladder, including precedence */
before = cases;
for (const tcc of ['', 'fail', 'conditional', 'pass']) {
  for (const outstanding of [0, 1, 2]) {
    for (const perfMissed of [0, 1, 3]) {
      for (const perfTotal of [0, 1, 3]) {
        for (const perfRows of [0, 2]) {
          for (const ratedNet of [false, true]) {
            for (const checklistNo of [0, 1, 2]) {
              for (const anyResponse of [false, true]) {
                for (const recs of [0, 1]) {
                  for (const records of [0, 2]) {
                    CTX.facts = { tcc, outstanding, perfMissed, perfTotal, perfRows,
                                  ratedNet, checklistNo, anyResponse, recs, records };
                    agree('verdict ' + JSON.stringify(CTX.facts), makeHost().verdict(), M.overallVerdict(CTX.facts));
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
console.log('  ' + (cases - before) + ' overall-verdict cases compared');

console.log('\n' + cases + ' cases compared, ' + mismatches.length + ' mismatches');
if (mismatches.length) {
  console.log('\nFIRST MISMATCHES:');
  mismatches.slice(0, 8).forEach(m => console.log('  ' + m));
  console.log('\nFAIL — the extraction changed behaviour\n');
  process.exit(1);
}
console.log('PASS — the module and the live host agree on every case\n');
process.exit(0);
