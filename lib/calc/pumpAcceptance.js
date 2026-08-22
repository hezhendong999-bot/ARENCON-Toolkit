/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — NFPA 20 ACCEPTANCE      lib/calc/pumpAcceptance.js  v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 1. Pure functions deciding what a commissioning
   report SAYS ABOUT PUMP PERFORMANCE: the NFPA 20 acceptance gates, the
   per-point verdicts for both the 3-point and 7-point tests, the PLD device
   check, and the overall report verdict. Readings in, verdicts out — no DOM,
   no globals, no host state.

   WHY THIS IS THE FIRST EXTRACTION. It is the actual engineering content of
   the tool; it is IDENTICAL for a diesel and an electric pump (the pump does
   not care what spins it); it depends on nothing, so it cannot be blocked by
   the host's ~164 shared globals; and until now it was UNTESTABLE — you could
   not evaluate a pump curve without booting a browser. A silent change here
   does not crash anything: it prints a wrong verdict on a sealed report that
   goes to an owner and an AHJ.

   EXTRACTED VERBATIM from the live Diesel build (part06.js, part06b.js):
     _ratedNetFrom · _isGatePct · _nfpa20Gate · _effVerdict · _pldDeviceCheck
     _calcFlowPoint (→ evalStdPoint) · updatePldVerdictObj (→ evalPldPoint)
     _dslVerdict (→ overallVerdict)

   BEHAVIOUR IS IDENTICAL, BUG FOR BUG. This is a MOVE, not a rewrite. Every
   edge case below is preserved deliberately, including the ones that look
   like mistakes — `parseFloat(x)||0` reading a blank as zero, the strict `>`
   in the 1% band, the 7-point net computed from `||0` rather than NaN-guarded.
   Any behavioural change belongs in its own Mark-approved session with its own
   evidence. The differential probe (tools/sim/acceptance.mjs) pins this module
   against the live host source across ~13,000 cases; if the two ever disagree
   the probe goes red, which is what makes "identical" a fact rather than a
   claim.

   ── WHAT STAYS WITH THE HOST ──────────────────────────────────────────────
   Reading the screen and the report state. The host gathers rated RPM, the
   system rating, the PLD setting, NPSH and the row arrays, hands them in as a
   context object, and renders whatever comes back. That division is the whole
   point: the host owns the screen, this module owns the judgement.

   ── HOST CONTRACT ─────────────────────────────────────────────────────────
   Classic <script> (both pump tools are classic-script throughout), also
   importable by the test runner. Publishes window.PumpAcceptance. NO bare
   `export` statements — those throw the instant a classic script parses them,
   which is how a shared module takes a whole tool down.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* The rated net for a test: the placard pressure recorded at the 100% row.
   Returns null when that row is absent or blank — never 0, because a missing
   placard must not read as a real zero-pressure rating. */
function ratedNetFrom(rows) {
  if (!Array.isArray(rows)) return null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].pct === '100%') {
      var p = parseFloat(rows[i].placard);
      return (!isNaN(p)) ? p : null;
    }
  }
  return null;
}

/* Which flow points are NFPA 20 acceptance gates. 25/50/75/125% are
   informational and are never scored. */
function isGatePct(pct) { return pct === '0%' || pct === '100%' || pct === '150%'; }

/* The three NFPA 20 numeric gates, evaluated on the ADJUSTED (rated-speed) net
   against the rated net. 'na' means "not a gate point, or not enough data" —
   it is not a failure and never counts toward one. */
function nfpa20Gate(pct, adjNet, ratedNet) {
  if (!isGatePct(pct)) return 'na';
  if (adjNet == null || isNaN(adjNet) || ratedNet == null || isNaN(ratedNet) || ratedNet <= 0) return 'na';
  if (pct === '0%')   return (adjNet <= ratedNet * 1.40) ? 'pass' : 'fail';   // churn ≤ 140% rated
  if (pct === '100%') return (adjNet >= ratedNet * 1.00) ? 'pass' : 'fail';   // rated ≥ 100% rated
  if (pct === '150%') return (adjNet >= ratedNet * 0.65) ? 'pass' : 'fail';   // peak  ≥  65% rated
  return 'na';
}

/* Effective verdict = the inspector's manual override if they set one, else the
   computed verdict. For rollup, a manual 'flag' is NOT a fail. */
function effVerdict(autoV, override) {
  if (override === 'pass') return 'pass';
  if (override === 'fail') return 'fail';
  if (override === 'flag') return 'flag';
  return autoV;
}

/* PLD device check: the w/PLD discharge against the PLD setting.
   at or below setpoint → ok · within +3 psi → flag · beyond +3 → fail. */
function pldDeviceCheck(disW, setpoint) {
  if (isNaN(disW) || isNaN(setpoint) || setpoint <= 0) return { state: 'ok', over: 0 };
  var over = disW - setpoint;
  if (over <= 0) return { state: 'ok',   over: over };
  if (over <= 3) return { state: 'flag', over: over };
  return { state: 'fail', over: over };
}

/* §14.2.4.2 — the ±1% calibrated-gauge band against the point's OWN placard.
   Advisory flag only; it never drives a verdict. Delegates to PumpCurve where
   that module is present (it has owned this since S499 and is pinned by its
   own 9,800-case differential); the inline copy is the identical fallback for
   a context where only this module is loaded. */
function curveDevOver1pct(adjNet, pointPlacard) {
  if (root && root.PumpCurve && root.PumpCurve.curveDevOver1pct) {
    return root.PumpCurve.curveDevOver1pct(adjNet, pointPlacard);
  }
  if (adjNet == null || isNaN(adjNet) || isNaN(pointPlacard) || pointPlacard <= 0) return false;
  return Math.abs(adjNet - pointPlacard) > pointPlacard * 0.01;
}

/* Speed correction (NFPA affinity): adjusted net = net × (rated ÷ recorded)².
   With no usable RPM pair the adjusted net falls back to the recorded net —
   preserved from the host, and the reason a report with no RPM still scores. */
function adjustToRatedSpeed(net, recordedRpm, ratedRpm) {
  if (net == null) return net;
  return (!isNaN(recordedRpm) && recordedRpm > 0 && ratedRpm) ? net * Math.pow(ratedRpm / recordedRpm, 2) : net;
}

/* ── 3-POINT (standard) TEST — one flow point ──────────────────────────────
   ctx: { ratedRpm, ratedNet, npshPsi, sysRating }
   The advisory flag strings are produced here rather than in the host because
   both pump tools print the same sentences; they are report language, not
   screen decoration. */
function evalStdPoint(row, ctx) {
  ctx = ctx || {};
  var suc = parseFloat(row.suction), dis = parseFloat(row.discharge), rpm = parseFloat(row.rpm);
  var plac = parseFloat(row.placard), bf = parseFloat(row.bfUp);
  var rated = ctx.ratedRpm;
  var net = (!isNaN(suc) && !isNaN(dis)) ? (dis - suc) : null;
  var adj = adjustToRatedSpeed(net, rpm, rated);
  var ratedNet = (ctx.ratedNet == null) ? null : ctx.ratedNet;
  var gate = nfpa20Gate(row.pct, adj, ratedNet);
  var autoVerdict = gate;
  var eff = effVerdict(autoVerdict, row.overStd);
  var curveFlag = curveDevOver1pct(adj, plac);

  var flags = [];
  if (curveFlag && adj != null && !isNaN(plac)) {
    flags.push('Curve match: adj net ' + adj.toFixed(0) + ' psi vs placard ' + plac.toFixed(0) +
               ' psi \u2014 outside \u00B11% gauge accuracy (NFPA 20 \u00A714.2.4.2)');
  }
  var npsh = parseFloat(ctx.npshPsi);
  if (!isNaN(suc) && !isNaN(npsh) && npsh > 0 && suc < npsh) {
    flags.push('Suction &lt; NPSH (' + npsh + ' psi) \u2014 supply/cavitation concern');
  }
  if (!isNaN(bf) && bf < 20) flags.push('Backflow upstream &lt; 20 psi');
  var sr = ctx.sysRating;
  if ((row.pct === '0%') && net != null && !isNaN(suc) && sr && (net + suc) > sr) {
    flags.push('Churn over-pressure: net churn + suction (' + (net + suc).toFixed(0) +
               ' psi) &gt; system rating (' + sr + ' psi) \u2014 NFPA 20 \u00A74.7.7.1');
  }

  return { net: net, adj: adj, ratedNet: ratedNet, gate: gate, curveFlag: curveFlag,
           flags: flags, override: row.overStd || '', autoVerdict: autoVerdict, verdict: eff };
}

/* ── 7-POINT (PLD) TEST — one flow point ───────────────────────────────────
   ctx: { ratedRpm, ratedNet, pldSetting, skipNoPLD }
   The SCORED net is the w/o-PLD reading (true pump capability); the held
   w/PLD net is recorded but never scored. Rows the host marks skipNoPLD
   (25/50/75/125%) have no w/o-PLD reading and are informational anyway. */
function evalPldPoint(row, ctx) {
  ctx = ctx || {};
  var skipNoPLD = !!ctx.skipNoPLD;
  var netNo = skipNoPLD ? null : (parseFloat(row.dis_no) || 0) - (parseFloat(row.suc_no) || 0);
  var netW  = (parseFloat(row.dis_w) || 0) - (parseFloat(row.suc_w) || 0);
  var placard = parseFloat(row.placard);
  var rated = ctx.ratedRpm;
  var checkNet = skipNoPLD ? null : netNo;
  var checkRpm = parseFloat(row.rpm_no);
  /* Preserved verbatim: the truthiness test on checkNet means a net of exactly
     0 falls through to the unadjusted value. */
  var adjNet = (checkNet != null && checkNet && !isNaN(checkRpm) && checkRpm > 0 && rated)
    ? checkNet * Math.pow(rated / checkRpm, 2) : checkNet;
  var ratedNet = (ctx.ratedNet == null) ? null : ctx.ratedNet;
  var gate = nfpa20Gate(row.pct, adjNet, ratedNet);

  var disW = parseFloat(row.dis_w);
  var pldSet = (ctx.pldSetting == null) ? null : ctx.pldSetting;
  var pldDev = (!isNaN(disW) && pldSet != null) ? pldDeviceCheck(disW, pldSet) : { state: 'ok', over: 0 };
  var curveFlag = curveDevOver1pct(adjNet, placard);

  var autoVerdict = 'na';
  if (pldDev.state === 'fail') autoVerdict = 'fail';
  else if (gate === 'fail') autoVerdict = 'fail';
  else if (gate === 'pass') autoVerdict = 'pass';
  var verdict = effVerdict(autoVerdict, row.overPld);

  return { netNo: netNo, netW: netW, adjNet: adjNet, ratedNet: ratedNet, gate: gate,
           pldDev: pldDev, curveFlag: curveFlag, override: row.overPld || '',
           autoVerdict: autoVerdict, verdict: verdict };
}

/* ── THE OVERALL REPORT VERDICT ────────────────────────────────────────────
   facts: { outstanding, recs, records, perfTotal, perfMissed, perfRows,
            ratedNet, checklistNo, anyResponse, tcc }
   Gathering those facts stays with the host (it walks contractors,
   deficiencies and the checklist); the DECISION lives here.

   Rule order is deliberate and locked: a consultant Fail, an outstanding
   deficiency and a missed gate are all conclusions the recorded data DOES
   support, so they fail the report. NOT CONFIRMED sits below them: a report
   may never assert a result the pump was never tested for (S509b). */
function overallVerdict(f) {
  f = f || {};
  var plural = function (c, one, many) { return c + ' ' + (c === 1 ? one : many); };
  var aside = '';
  var bits = [];
  if (f.recs) bits.push(plural(f.recs, 'recommendation', 'recommendations'));
  if (f.records) bits.push(plural(f.records, 'site record', 'site records'));
  if (bits.length) aside = ' Also recorded for information (no effect on the result): ' + bits.join(', ') + '.';

  var perfLine = !f.perfTotal ? 'No pump performance points have been scored.'
    : f.perfTotal === 1 ? 'The pump performance point met the NFPA 20 acceptance criteria.'
    : 'All ' + f.perfTotal + ' pump performance points met the NFPA 20 acceptance criteria.';

  if (!f.anyResponse && !f.perfTotal && !f.outstanding && !f.recs && !f.records) {
    return { status: 'none', label: '', desc: '', banner: '', icon: '' };
  }
  if (f.tcc === 'fail') {
    return { status: 'fail', icon: '\u2717', label: 'FAIL',
      banner: 'OVERALL: FAIL \u2014 Consultant recorded the test result as Fail',
      desc: 'The consultant recorded the test result as Fail.' + aside };
  }
  if (f.outstanding) {
    return { status: 'fail', icon: '\u2717', label: 'FAIL',
      banner: 'OVERALL: FAIL \u2014 ' + plural(f.outstanding, 'outstanding deficiency', 'outstanding deficiencies'),
      desc: plural(f.outstanding, 'outstanding deficiency remains', 'outstanding deficiencies remain') +
            ' open. All deficiencies must be addressed and closed before this report can pass.' + aside };
  }
  if (f.perfMissed) {
    return { status: 'fail', icon: '\u2717', label: 'FAIL',
      banner: 'OVERALL: FAIL \u2014 ' + f.perfMissed + ' of ' + f.perfTotal + ' performance points did not meet the NFPA 20 criteria',
      desc: f.perfMissed + ' of ' + f.perfTotal + ' pump performance points did not meet the NFPA 20 acceptance criteria (churn \u2264 140%, rated \u2265 100%, 150% \u2265 65% of rated net).' + aside };
  }
  if (!f.perfTotal) {
    return { status: 'review', icon: '\u26A0', label: 'NOT CONFIRMED',
      banner: 'Not confirmed \u2014 no pump performance points have been scored',
      desc: (!f.perfRows
              ? 'No pump performance readings have been recorded, so the pump\'s performance has not been assessed.'
              : !f.ratedNet
                ? 'Pump readings are recorded, but the rated pressure has not been entered from the pump placard at the 100% flow point. Without it the NFPA 20 acceptance criteria cannot be evaluated.'
                : 'Pump readings are recorded, but none of them fall on a scored flow point (0%, 100% or 150% of rated flow), so the NFPA 20 acceptance criteria cannot be evaluated.')
            + ' The overall result cannot be confirmed until that is corrected.' + aside };
  }
  if (f.checklistNo) {
    return { status: 'cond', icon: '\u26A0', label: 'CONDITIONAL',
      banner: 'OVERALL: CONDITIONAL \u2014 ' + plural(f.checklistNo, 'checklist item', 'checklist items') + ' answered No',
      desc: plural(f.checklistNo, 'checklist item was', 'checklist items were') + ' answered No. ' + perfLine + ' All deficiencies are closed.' + aside };
  }
  if (f.tcc === 'conditional') {
    return { status: 'cond', icon: '\u26A0', label: 'CONDITIONAL',
      banner: 'OVERALL: CONDITIONAL \u2014 Consultant recorded the test result as Conditional',
      desc: 'The consultant recorded the test result as Conditional. ' + perfLine + ' All deficiencies are closed.' + aside };
  }
  return { status: 'pass', icon: '\u2713', label: 'PASS',
    banner: 'OVERALL: PASS \u2014 ' + (f.perfTotal ? 'All performance points met the NFPA 20 criteria, all deficiencies closed' : 'All recorded items complete, all deficiencies closed'),
    desc: perfLine + ' All recorded deficiencies are closed.' + aside };
}

/* The gate target a report DISPLAYS next to a reading ("≥ 65 (65%)"). The
   host used to re-derive these thresholds inline, which meant the acceptance
   numbers existed twice: once as the rule, once as the label. Two copies of
   1.40 / 1.00 / 0.65 is exactly how a report comes to show one threshold and
   score against another. Returns null for a non-gate point or an unusable
   rated net, so the host simply prints nothing. */
function gateTarget(pct, ratedNet, adjNet) {
  if (!isGatePct(pct)) return null;
  if (ratedNet == null || isNaN(ratedNet)) return null;
  var spec = (pct === '0%')   ? { mult: 1.40, cmp: '\u2264', pctLabel: '140%' }
           : (pct === '100%') ? { mult: 1.00, cmp: '\u2265', pctLabel: '100%' }
           : (pct === '150%') ? { mult: 0.65, cmp: '\u2265', pctLabel: '65%' }
           : null;
  if (!spec) return null;
  var value = ratedNet * spec.mult;
  var met = (pct === '0%') ? (adjNet != null && adjNet <= value)
                           : (adjNet != null && adjNet >= value);
  return { value: value, cmp: spec.cmp, pctLabel: spec.pctLabel, met: met,
           label: spec.cmp + ' ' + value.toFixed(0) + ' (' + spec.pctLabel + ')' };
}

var api = {
  ratedNetFrom: ratedNetFrom,
  isGatePct: isGatePct,
  nfpa20Gate: nfpa20Gate,
  effVerdict: effVerdict,
  pldDeviceCheck: pldDeviceCheck,
  curveDevOver1pct: curveDevOver1pct,
  adjustToRatedSpeed: adjustToRatedSpeed,
  evalStdPoint: evalStdPoint,
  evalPldPoint: evalPldPoint,
  overallVerdict: overallVerdict,
  gateTarget: gateTarget,
  VERSION: '1.0.0'
};

if (root) root.PumpAcceptance = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
