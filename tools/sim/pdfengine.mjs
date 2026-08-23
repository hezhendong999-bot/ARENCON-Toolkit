/* pdfengine.mjs — THE CLIENT PDF'S FIRST SHARED RULES (Lane C, S685)
 *
 * PHASE 4 OPENS. The shared report-PDF engine takes its first two residents,
 * each proven identical against Diesel's live exporter before anything else
 * moves in — the phase's acceptance is a Diesel PDF that is page-for-page what
 * it was.
 *
 * RESIDENT 1 — appendix eligibility. Which KINDS of photograph may appear in
 * the client PDF's appendix. The scope is an Owner decision (S316) and arrives
 * as data; the mechanism is shared so Electric never grows a second predicate.
 * Getting this wrong puts checklist or deficiency photos into a client
 * deliverable, or silently drops the gauge photos the appendix exists to show.
 *
 * RESIDENT 2 — chart print sizing. 716 CSS px across 6.96 printed inches at
 * pixel-ratio 3 is ~308 dpi; height scales by the same factor so the paper
 * shows the screen's aspect. And the RESTORE is half the feature: every chart
 * goes back exactly as found — style, pixel ratio, and the annotations that
 * were positioned against the print width — or the app's charts sit subtly
 * broken after every export until someone reloads.
 *
 * Held against the PRE-EXTRACTION source, kept as a fixture.
 *
 * Run: node tools/sim/pdfengine.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

const root = {};
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/export/reportPdf.js'), 'utf8'))(root, undefined);
const E = root.ReportPdf;
if (!E) { console.error('lib/export/reportPdf.js did not publish ReportPdf'); process.exit(1); }

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

const PRE = path.join(HERE, 'fixtures/pdfexport_pre.txt');
const preSrc = fs.readFileSync(PRE, 'utf8');
const liveSrc = fs.readFileSync(path.join(REPO, 'diesel-app/js/pdfExport.js'), 'utf8');

const DIESEL_SCOPE = {
  types: ['gauge', 'gauge-pld', 'flowtest', 'flowtest-pld'],
  recordKinds: { exact: ['pump', 'pump-pld', 'flow', 'flow-pld'], substrings: ['placard'] }
};

let cases = 0; const bad = [];
const norm = v => JSON.stringify(v);
function agree(label, a, b) {
  cases++;
  if (norm(a) !== norm(b)) bad.push(label + '\n      host: ' + norm(a) + '\n      lib : ' + norm(b));
}

console.log('\n═══ PDF ENGINE — pre-extraction exporter vs lib/export/reportPdf.js ═══');
console.log('source: ' + REPO + '\n');

/* ── 1: eligibility, exhaustively ───────────────────────────────────────── */
let before = cases;
{
  const H = new Function(liftFunction(preSrc, '_appendixEligible') + '\nreturn _appendixEligible;')();
  const TYPES = ['gauge', 'gauge-pld', 'flowtest', 'flowtest-pld', 'record',
                 'checklist', 'deficiency', 'response', 'general-defic', 'site', undefined];
  const KINDS = ['pump', 'pump-pld', 'placard', 'placard-pld', 'pld-placard-extra',
                 'flow', 'flow-pld', 'site', '', undefined];
  for (const t of TYPES) for (const k of KINDS) {
    const it = { type: t, photo: { kind: k } };
    agree(`eligible(${t}/${k})`, H(it), E.appendixEligible(it, DIESEL_SCOPE));
  }
  agree('no photo → never eligible', H({ type: 'gauge' }), E.appendixEligible({ type: 'gauge' }, DIESEL_SCOPE));
  agree('null entry', H(null), E.appendixEligible(null, DIESEL_SCOPE));
  /* The Owner's exclusions, asserted outright — these are what must never
     reach a client deliverable. */
  for (const t of ['checklist', 'deficiency', 'response', 'general-defic']) {
    agree('an Owner-excluded type stays out: ' + t, false,
          E.appendixEligible({ type: t, photo: {} }, DIESEL_SCOPE));
  }
  agree('site records stay out', false,
        E.appendixEligible({ type: 'record', photo: { kind: 'site' } }, DIESEL_SCOPE));
}
console.log('  ' + (cases - before) + ' eligibility cases compared');

/* ── 2: chart sizing — full choreography with fake charts ───────────────── */
function fakeChart(w, h, opts) {
  const o = opts || {};
  const styleStore = { v: o.initialStyle === undefined ? null : o.initialStyle };
  const stage = {
    clientWidth: w, clientHeight: h,
    getAttribute: () => styleStore.v,
    setAttribute: (k, v) => { styleStore.v = v; },
    removeAttribute: () => { styleStore.v = null; },
    style: {}
  };
  const chart = {
    canvas: o.noCanvas ? null : { parentElement: o.noStage ? null : stage, id: o.id || 'cv' },
    options: o.noOptions ? undefined : (o.dpr !== undefined ? { devicePixelRatio: o.dpr } : {}),
    resizes: 0, updates: 0,
    resize() { this.resizes++; },
    update(mode) { this.updates++; this.lastMode = mode; }
  };
  return { chart, stage, styleStore };
}

function hostSize(charts, annotate) {
  const scope = {
    chart3pt: charts[0], netChart3pt: charts[1], pldChart: charts[2], pldNetChart: charts[3],
    renderChartAnnotations: annotate, Math
  };
  const body = liftFunction(preSrc, '_sizeChartsForPrint') + '\nreturn _sizeChartsForPrint;';
  return new Function(...Object.keys(scope), body)(...Object.values(scope));
}

before = cases;
{
  const mk = () => [fakeChart(400, 300, { dpr: 2 }), fakeChart(500, 250, {}),
                    fakeChart(0, 0, {}), fakeChart(300, 300, { noCanvas: true })];
  const hAnn = [], mAnn = [];
  const hSet = mk(), mSet = mk();
  /* The lifted host code returns the FACTORY; calling it performs the sizing
     and returns the restore closure — the first draft of this probe forgot the
     call, sized nothing on the host side, and compared a print-ready set of
     charts against an untouched one. */
  const hRestore = hostSize(hSet.map(x => x.chart), (c, id) => hAnn.push(id))();
  const mRestore = E.sizeChartsForPrint(mSet.map(x => x.chart),
                                        { annotate: (c, id) => mAnn.push(id) });
  const read = (set) => set.map(x => ({
    style: x.styleStore.v,
    dpr: x.chart.options ? x.chart.options.devicePixelRatio : null,
    resizes: x.chart.resizes, updates: x.chart.updates, mode: x.chart.lastMode || null,
    sw: x.stage.style.width || null, sh: x.stage.style.height || null
  }));
  agree('sizing applies identically (style, dpr, aspect, update mode)', read(hSet), read(mSet));
  agree('the print height preserves the screen aspect', '537px',
        mSet[0].stage.style.height);   // 300 * 716/400 = 537
  hRestore(); mRestore();
  agree('restore puts everything back identically', read(hSet), read(mSet));
  agree('restore re-places annotations for the same charts', hAnn, mAnn);
  agree('a zero-size or canvasless chart is skipped by both', true,
        mSet[2].chart.resizes === 0 && mSet[3].chart.resizes === 0);
  /* Restore-restores-the-original: a stage that STARTED with an inline style
     must get that exact style back, not a blank one. */
  const withStyle = fakeChart(400, 300, { initialStyle: 'width:55%;border:1px' });
  const r2 = E.sizeChartsForPrint([withStyle.chart], {});
  agree('sizing writes the print width', '716px', withStyle.stage.style.width);
  r2();
  agree('a stage that started with an inline style gets that exact style back',
        'width:55%;border:1px', withStyle.styleStore.v);
}
console.log('  ' + (cases - before) + ' sizing/restore assertions');

/* ── 3: delegation wired, knowledge gone from the host ──────────────────── */
before = cases;
{
  agree('eligibility delegates', true, /ReportPdf\.appendixEligible/.test(liveSrc));
  agree('sizing delegates', true, /ReportPdf\.sizeChartsForPrint/.test(liveSrc));
  agree('the print constants are not re-written in the host', false, /PRINT_STAGE_W/.test(liveSrc));
  agree('the Owner scope stays with Diesel, as data', true, /'placard'/.test(liftFunction(liveSrc, '_appendixEligible') || ''));
}
console.log('  ' + (cases - before) + ' delegation checks');

console.log('\n' + cases + ' cases, ' + bad.length + ' mismatches');
if (bad.length) {
  console.log('\nFIRST MISMATCHES:');
  bad.slice(0, 6).forEach(m => console.log('  ' + m));
  console.log('\nFAIL — the client PDF would differ from the field-proven exporter\n');
  process.exit(1);
}
console.log('PASS — same appendix contents, same print sizing, same restore\n');
process.exit(0);
