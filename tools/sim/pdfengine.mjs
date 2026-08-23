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

/* ── 3: THE APPENDIX ASSEMBLY — BYTE IDENTITY (S685b) ────────────────────
   The phase's acceptance is a page-for-page identical Diesel PDF. For an HTML
   assembly the strongest proof available is byte identity: the same entries
   must produce the same string, character for character, out of the engine as
   out of the pre-extraction exporter. One changed byte here is a changed
   client deliverable. */
before = cases;
{
  const preApx = liftFunction(preSrc, '_appendixHTML');
  const entries = [];
  const mkE = (type, kind, n, extra) => ({
    type, cat: 'x', badge: 'B', label: 'L ' + n, section: 's_' + n, idx: entries.length,
    src: 'data:image/jpeg;base64,SRC' + n,
    photo: Object.assign({ id: 'ph_17558000000' + n + '_x', n: 'photo' + n + '.jpg', kind }, extra || {})
  });
  entries.push(
    mkE('flowtest', undefined, 1), mkE('flowtest-pld', undefined, 2),
    mkE('record', 'pump', 3), mkE('record', 'pump-pld', 4),
    mkE('record', 'placard', 5), mkE('record', 'placard-pld', 6),
    mkE('gauge', undefined, 7, { tag: 'suction' }), mkE('gauge', undefined, 8, { tag: 'discharge' }),
    mkE('gauge-pld', undefined, 9, { tag: 'suction', mode: 'pld' }),
    mkE('gauge', undefined, 10, {}), mkE('record', 'site', 11),
    mkE('checklist', undefined, 12), mkE('deficiency', undefined, 13)
  );
  const GR = ['suction', 'discharge', 'rpm'];
  const EXCLUDE = new Set(['s_5|0']);   // one user exclusion, arbitrary but fixed
  const hostKey = (it) => it.section + '|0';

  const runPre = (list) => {
    let emitted = false;
    const scope = {
      _collectAllPhotos: () => list,
      _appendixEligible: (it) => E.appendixEligible(it, DIESEL_SCOPE),
      _appendixExcl: EXCLUDE,
      _ppxKey: hostKey,
      _GAUGE_READINGS: GR,
      _lnk: (p, cell) => '<a x="' + (p && p.id) + '">' + cell + '</a>',
      window: { get _apxBandEmitted() { return emitted; }, set _apxBandEmitted(v) { emitted = v; } },
      Math, Object, Array, String
    };
    const out = new Function(...Object.keys(scope), preApx + '\nreturn _appendixHTML();')(...Object.values(scope));
    return { out, emitted };
  };
  const runEngine = (list) => {
    let emitted = false;
    const out = E.appendixHTML({
      collect: () => list,
      eligible: (it) => E.appendixEligible(it, DIESEL_SCOPE),
      isExcluded: (k) => EXCLUDE.has(k),
      key: hostKey,
      gaugeReadings: GR,
      link: (p, cell) => '<a x="' + (p && p.id) + '">' + cell + '</a>',
      onEmitted: () => { emitted = true; }
    });
    return { out, emitted };
  };

  for (const [label, list] of [
    ['a full mixed report', entries],
    ['gauges only', entries.filter(e => e.type.indexOf('gauge') === 0)],
    ['nothing eligible', entries.filter(e => e.type === 'checklist')],
    ['empty report', []]
  ]) {
    const h = runPre(list), m = runEngine(list);
    cases++;
    if (h.out !== m.out) {
      let at = 0; while (at < h.out.length && h.out[at] === m.out[at]) at++;
      bad.push('appendix byte identity: ' + label + ' — first differing byte at ' + at +
               '\n      pre : …' + h.out.slice(Math.max(0, at - 40), at + 40) +
               '\n      eng : …' + m.out.slice(Math.max(0, at - 40), at + 40));
    }
    agree('the band-emitted signal agrees: ' + label, h.emitted, m.emitted);
  }
  const h = runPre(entries), m = runEngine(entries);
  agree('the excluded photo is genuinely absent', false, m.out.indexOf('SRC5') !== -1);
  agree('an ineligible type is genuinely absent', false, m.out.indexOf('SRC12') !== -1);
  agree('an eligible one is genuinely present', true, m.out.indexOf('SRC3') !== -1);
}
console.log('  ' + (cases - before) + ' appendix byte-identity + presence assertions');

/* ── 4: PAGINATION — WHERE THE PAGES BREAK (S686) ────────────────────────
   The pre-extraction paginator lives in the fixture as a `setTimeout` body
   inside `_realExportPDF`, so it cannot be lifted by name. It is lifted as a
   TEXT BLOCK and run with a synchronous `setTimeout` stub, against a jsdom
   document given a FAKE LAYOUT — jsdom has no layout engine and reports every
   offsetHeight as 0, which would make every page fit forever and prove
   nothing. Heights are declared per element with data-h and summed up the
   tree, which is exactly the measurement the paginator makes.

   Proof is BYTE IDENTITY of the finished document — same content in, same
   pages out, character for character — PLUS presence assertions, because two
   identical failures (both sides producing nothing) would pass identity alone.
   That is the S685b lesson, applied. */
before = cases;
{
  const { JSDOM } = await import('jsdom');

  const PAGE_HTML = `
  <div id="wrap">
    <div class="page" style="padding:0.5in;">
      <div class="cover" data-h="420">COVER</div>
      <div class="dash" data-h="180">DASHBOARD</div>

      <div class="sh" data-h="38">1. Pre-Commissioning</div>
      <div class="sb flush">
        <table>
          <thead><tr data-h="34"><th>Item</th><th>Result</th></tr></thead>
          <tbody>
            ${Array.from({ length: 14 }, (_, n) => `
              <tr data-h="58"><td>Item ${n + 1}</td><td>Yes</td></tr>
              ${n % 4 === 0 ? `<tr class="ph-keep" data-h="150"><td colspan="2">photo for item ${n + 1}</td></tr>` : ''}`).join('')}
          </tbody>
        </table>
      </div>

      <div class="sh" data-h="38">2. Visual Inspection</div>
      <div class="sb">
        <div class="chartbox" data-h="620">CHART IMAGE</div>
        <table>
          <thead><tr data-h="34"><th>Check</th></tr></thead>
          <tbody>${Array.from({ length: 9 }, (_, n) => `<tr data-h="66"><td>Visual ${n + 1}</td></tr>`).join('')}</tbody>
        </table>
      </div>

      <div class="sh" data-h="38">6. Deficiencies</div>
      <div class="sb" data-h="360">Deficiency summary</div>
      <div class="nosplit keep-prev" data-h="420">VERDICT BOX</div>

      <div class="sh" data-h="38">Photo Appendix</div>
      <div class="apx-band" data-h="26">band</div>
      <div class="apx-subhead" data-subhead="Gauge &amp; RPM Photos" data-h="44">Gauge &amp; RPM Photos</div>
      ${Array.from({ length: 7 }, (_, n) => `<div class="apx-keep" data-h="300"><img src="p${n}.jpg"></div>`).join('')}

      <!-- built the way the exporter builds them: the sub-header is glued to its
           first card inside one apx-keep block; the sketches wrapper carries the
           S372.5 band, which is the nested-.sh case S372.4's unwrap exists for. -->
      <div id="flow-test-photos-print">
        <div class="apx-keep" data-h="360"><div class="apx-subhead" data-subhead="Flow Test Charts">Flow Test Charts</div><div><img src="ft0.jpg"></div></div>
        <div data-h="250"><img src="ft1.jpg"></div>
      </div>
      <div id="sketches-print">
        <div class="sh apx-band" data-h="38">Photo Appendix</div>
        <div class="apx-subhead" data-subhead="Site Sketches &amp; Photo Markups" data-h="44">Site Sketches &amp; Photo Markups</div>
        <div data-h="400"><img src="sk.jpg"></div>
      </div>
    </div>
    <div id="mobile-page-nav">nav</div>
  </div>`;

  /* A layout model: declared height, or the sum of the children's. This is the
     only quantity the paginator reads, so modelling it is modelling the page. */
  function makeDoc() {
    const dom = new JSDOM(`<!doctype html><html><body>${PAGE_HTML}</body></html>`);
    const win = dom.window;
    Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        const d = this.getAttribute && this.getAttribute('data-h');
        if (d) return Number(d);
        let sum = 0;
        for (const k of this.children) sum += k.offsetHeight;
        return sum;
      }
    });
    return win;
  }

  const PROJ = { client: 'Sprucewood Holdings', addr: '1490 Sprucewood Rd, Mississauga',
                 projname: 'Sprucewood Tower B', projno: '1490.04', revision: 'Rev 2' };
  const INST = 3, FORMREV = 'Rev 1';
  const DATESTR = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  /* The pre-extraction paginator, lifted as text and run synchronously. */
  const preBlockStart = preSrc.indexOf('// \u2500\u2500 PAGINATION ENGINE (Session 53) \u2500\u2500');
  const preBlock = preBlockStart < 0 ? null
    : preSrc.slice(preBlockStart, preSrc.indexOf('}, 1200);', preBlockStart) + '}, 1200);'.length);
  if (!preBlock) { bad.push('could not lift the pre-extraction pagination block from the fixture'); cases++; }

  const preWarnings = [];
  function runPre(win) {
    const scope = {
      w: { document: win.document },
      proj: PROJ, _pdfInstNum: INST, formRevision: FORMREV,
      setTimeout: (fn) => fn(),          // run it here, not in 1.2 seconds
      /* The pre code swallows its own failures into console.warn. Capture them:
         a silently-broken baseline would compare equal to a silently-broken
         engine and prove nothing. */
      console: { warn: (...a) => preWarnings.push(a.join(' ')), error: (...a) => preWarnings.push(a.join(' ')), log: () => {} },
      Array, Date, Math
    };
    new Function(...Object.keys(scope), preBlock)(...Object.values(scope));
  }

  function runEngine(win) {
    const wd = win.document;
    const origPage = wd.querySelector('.page');
    const projName = (PROJ.projname || '').replace(/</g, '&lt;');
    E.paginate({
      doc: wd,
      page: origPage,
      unwrap: ['flow-test-photos-print', 'sketches-print'],
      header: {
        client: (PROJ.client || '').replace(/</g, '&lt;'),
        addr: (PROJ.addr || '').replace(/</g, '&lt;'),
        title: 'Diesel Fire Pump Commissioning Report #' + INST + (projName ? ' - ' + projName : ''),
        projNo: PROJ.projno || '',
        rev: (PROJ.revision || FORMREV || ''),
        date: DATESTR
      },
      anchorId: 'mobile-page-nav'
    });
  }

  const hostWin = makeDoc(); runPre(hostWin);
  const engWin = makeDoc(); runEngine(engWin);
  const hostOut = hostWin.document.getElementById('wrap').innerHTML;
  const engOut = engWin.document.getElementById('wrap').innerHTML;

  agree('the pre-extraction baseline ran without swallowing an error', [], preWarnings);
  cases++;
  if (hostOut !== engOut) {
    let at = 0; while (at < hostOut.length && hostOut[at] === engOut[at]) at++;
    bad.push('pagination byte identity \u2014 first differing byte at ' + at +
             '\n      pre : \u2026' + hostOut.slice(Math.max(0, at - 60), at + 60) +
             '\n      eng : \u2026' + engOut.slice(Math.max(0, at - 60), at + 60));
  }

  /* Presence \u2014 identity is worthless if both sides did nothing. */
  const pages = Array.from(engWin.document.querySelectorAll('#wrap .page'));
  const hostPages = Array.from(hostWin.document.querySelectorAll('#wrap .page'));
  agree('the report actually paginated (more than one sheet)', true, pages.length > 1);
  agree('both sides produced the same number of sheets', hostPages.length, pages.length);
  agree('every sheet is locked to letter height', true,
        pages.every(p => p.style.height === '11in' && p.style.minHeight === '11in'));
  agree('continuation pages carry the running header', true,
        pages.slice(1).every(p => !!p.querySelector('.compact-header')));
  agree('the running header carries the project number and page number', true,
        /1490\.04 Rev 2&nbsp;&nbsp;Page 2/.test(pages[1].innerHTML));

  /* The Owner-locked rules, asserted on the finished document rather than
     inferred from the code. */
  /* Band-at-the-foot-of-a-sheet is CHARACTERISED, not asserted away. The
     keep-with-next rule holds everywhere except one path: a `nosplit keep-prev`
     block (the verdict box) that pulls its predecessor onto a fresh page can
     leave the section band behind on the old one. That is the pre-extraction
     behaviour, reproduced exactly — a question for the Owner, never a fix
     smuggled inside an extraction. */
  const bandTail = (doc) => Array.from(doc.querySelectorAll('#wrap .page'))
    .map((p, i) => (p.lastElementChild && p.lastElementChild.classList
                    && p.lastElementChild.classList.contains('sh')) ? i + 1 : 0).filter(Boolean);
  agree('bands left at a page foot are the same on both sides',
        bandTail(hostWin.document), bandTail(engWin.document));
  agree('a split section re-stamps its band as (cont.)', true,
        pages.some(p => /\(cont\.\)/.test(p.textContent)));
  agree('a split table re-stamps its own header row on the new sheet', true,
        pages.filter(p => p.querySelector('table')).every(p => !!p.querySelector('thead')));
  agree('a checklist row is never separated from its photo row', true,
        pages.every(p => {
          const rows = Array.from(p.querySelectorAll('tr'));
          const first = rows.find(r => !r.querySelector('th'));
          return !(first && first.classList.contains('ph-keep'));
        }));
  agree('the verdict box rides one sheet whole', 1,
        pages.filter(p => /VERDICT BOX/.test(p.textContent)).length);
  agree('the chart image rides one sheet whole', 1,
        pages.filter(p => /CHART IMAGE/.test(p.textContent)).length);
  /* S372.4: a band nested inside a print wrapper is invisible to the unit
     grouper, so its photos print under the PREVIOUS section's heading. The
     unwrap promotes the wrapper's children, and the proof is that the band is
     now a DIRECT child of a finished page. */
  agree('a band nested in a print wrapper was promoted to a direct page child', true,
        pages.some(p => Array.from(p.children).some(c => c.classList && c.classList.contains('apx-band'))));
  agree('no wrapper div survived into the finished report', false,
        !!engWin.document.getElementById('flow-test-photos-print'));
  agree('an appendix sub-section continued across a break gets its own (cont.) header', true,
        pages.some(p => {
          const s = p.querySelector('.apx-subhead');
          return !!s && /\(cont\.\)/.test(s.textContent);
        }));
  agree('the offscreen measuring stage is cleaned up', 0,
        engWin.document.body.querySelectorAll('div[style*="-99999px"]').length);
  agree('no sheet exceeds the page budget', true,
        pages.every(p => {
          /* height is locked to 11in for display; measure the content instead */
          let sum = 0; for (const k of p.children) sum += k.offsetHeight;
          return sum <= (11 * 96) - 16;
        }));
}
console.log('  ' + (cases - before) + ' pagination identity + page-rule assertions');

/* ── 5: THE EXPORT PANEL — WHO THE REPORT GOES TO (S686b) ────────────────
   The distribution list is printed on the cover and saved with the report, so
   a rule that drifts here quietly changes who a commissioning report says it
   was issued to. Proof is again byte identity of the emitted panel body
   against the pre-extraction builder, across the cases that actually differ —
   nothing saved, a saved subset, a manually-pooled recipient, no photos, some
   photos excluded — plus the live-DOM behaviours run on both sides. */
before = cases;
{
  const { JSDOM } = await import('jsdom');

  /* The pre-extraction builder is the body of _exportModalOpen, which cannot be
     lifted whole (it calls the dialog engine). Its MARKUP half is lifted as
     text: the three group strings, then the innerHTML assembly. */
  const cut = (a, b) => preSrc.slice(preSrc.indexOf(a), preSrc.indexOf(b, preSrc.indexOf(a)));
  const preGroups = cut('  var ownerHtml = owner', '\n  D.panel({');
  const preInner = cut('      w.innerHTML=\n', '      bd.appendChild(w);')
    .replace('      w.innerHTML=\n         ', '  return ');
  const preChip = liftFunction(preSrc, '_exmChip');
  const preColor = liftFunction(preSrc, '_exmColorFor');
  /* _exmEsc is lifted by line, not by liftFunction: it contains the regex
     literal /"/g, and the brace-matcher reads that quote as the start of a
     string and runs on past the function's end. */
  const preEsc = preSrc.slice(preSrc.indexOf('function _exmEsc(s){'),
                              preSrc.indexOf('\n', preSrc.indexOf('function _exmEsc(s){')));

  const preBody = new Function('owner', 'ctrs', 'distribution', 'incl', 'ptot', `
    var _EXM_OWNER_C = '#3E4C66', _EXM_OTHER_C = '#8A7689';
    var _EXM_CTR_PALETTE = ['#2C6E8F','#5B7A52','#8A5A7A','#9C6B3E','#4A6B8A','#6E5A8A','#5A7D6E','#8A6B4A','#436B6B','#7A5A5A'];
    ${preColor}
    ${preEsc}
    ${preChip}
    var saved=(distribution&&distribution.length)?distribution.slice():null;
    function on(n){ return saved ? (saved.indexOf(n)>=0) : true; }
    var roleSet={}; if(owner) roleSet[owner.toLowerCase()]=1; ctrs.forEach(function(c){roleSet[c.toLowerCase()]=1;});
    var others=(saved||[]).filter(function(n){ return !roleSet[(n||'').toLowerCase()]; });
    ${preGroups}
    ${preInner}
  `);

  const OWNER = 'Sprucewood Holdings Ltd.';
  const CTRS = ['Vipond Fire Protection', 'ABC Fire & Safety', 'Metro Sprinkler Co.'];
  const SCENARIOS = [
    ['nothing saved — everyone ticked', OWNER, CTRS, [], 12, 12],
    ['a saved subset comes back exactly', OWNER, CTRS, [OWNER, 'Metro Sprinkler Co.'], 9, 12],
    ['a manually-pooled recipient survives', OWNER, CTRS, [OWNER, 'Base-building PM'], 12, 12],
    ['no owner on the project yet', '', CTRS, [], 3, 3],
    ['no contractors yet', OWNER, [], [], 1, 1],
    ['no photos at all', OWNER, CTRS, [], 0, 0],
    ['a single photo reads in the singular', OWNER, CTRS, [], 1, 1],
    ['a name with an ampersand and a quote', 'O\'Brien & Sons <Ltd>', CTRS, [], 5, 12],
    ['nobody selected at all', OWNER, CTRS, ['nobody-by-this-name'], 12, 12]
  ];
  for (const [label, owner, ctrs, saved, incl, ptot] of SCENARIOS) {
    const h = preBody(owner, ctrs, saved, incl, ptot);
    const m = E.exportPanelBodyHTML({ owner, contractors: ctrs, saved, photosIncluded: incl, photosTotal: ptot });
    cases++;
    if (h !== m) {
      let at = 0; while (at < h.length && h[at] === m[at]) at++;
      bad.push('export panel byte identity: ' + label + ' — first differing byte at ' + at +
               '\n      pre : …' + h.slice(Math.max(0, at - 50), at + 50) +
               '\n      eng : …' + m.slice(Math.max(0, at - 50), at + 50));
    }
  }

  /* Presence — identity across nine empty strings would also be identity. */
  const full = E.exportPanelBodyHTML({ owner: OWNER, contractors: CTRS, saved: [OWNER, 'Base-building PM'],
                                       photosIncluded: 9, photosTotal: 12 });
  agree('the owner is on the panel', true, full.indexOf(OWNER) !== -1);
  agree('every contractor is on the panel', true,
        CTRS.every(c => full.indexOf(c.replace(/&/g, '&amp;')) !== -1));
  agree('a pooled recipient is on the panel and removable', true,
        full.indexOf('Base-building PM') !== -1 && /exm-rm/.test(full));
  agree('the photo sentence states the subset plainly', true, /9 of 12 photos will print/.test(full));
  agree('one photo reads in the singular', true,
        /All 1 photo will print/.test(E.exportPanelBodyHTML({ owner: OWNER, contractors: [], photosIncluded: 1, photosTotal: 1 })));
  agree('a name carrying markup is escaped, not injected', true,
        E.exportPanelBodyHTML({ owner: '<img onerror=x>', contractors: [] }).indexOf('<img onerror') === -1);

  /* The selection rule, stated outright — this is the one that silently drops a
     recipient from the next issue if it inverts. */
  const ticked = (html) => Array.from(html.matchAll(/data-name="([^"]*)"/g))
    .map(m => m[1]).filter(n => html.indexOf('exm-chip on" data-name="' + n) !== -1);
  agree('with nothing saved, everyone is ticked', 4,
        ticked(E.exportPanelBodyHTML({ owner: OWNER, contractors: CTRS, saved: [] })).length);
  agree('with a subset saved, only the saved names are ticked',
        [OWNER, 'Metro Sprinkler Co.'].sort(),
        ticked(E.exportPanelBodyHTML({ owner: OWNER, contractors: CTRS, saved: [OWNER, 'Metro Sprinkler Co.'] })).sort());

  agree('the same recipient is the same colour every time', true,
        E.exportPanelBodyHTML({ owner: '', contractors: ['Vipond Fire Protection'] }) ===
        E.exportPanelBodyHTML({ owner: '', contractors: ['Vipond Fire Protection'] }));
  agree('different recipients are told apart by colour', true,
        new Set(CTRS.map(c => (E.exportPanelBodyHTML({ owner: '', contractors: [c] })
                                .match(/--c:(#[0-9A-Fa-f]{6})/) || [])[1])).size > 1);

  /* Live-DOM behaviours: toggle, the distribution line, add, de-dupe. */
  const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>');
  const root = dom.window.document.getElementById('r');
  root.innerHTML = full;
  E.exportLine(root);
  agree('the distribution line lists exactly the ticked names — and only those',
        [OWNER, 'Base-building PM'].join(', '), root.querySelector('#exm-dl').textContent);
  const chip = root.querySelector('.exm-chip.on');
  E.exportToggle(chip, root);
  agree('un-ticking a recipient drops them from the line', false,
        root.querySelector('#exm-dl').textContent.indexOf(OWNER) === 0);
  agree('un-ticking clears the tick mark', '', chip.querySelector('.exm-dot').textContent);
  E.exportToggle(chip, root);
  agree('re-ticking puts them back', true,
        root.querySelector('#exm-dl').textContent.indexOf(OWNER) === 0);

  const inp = root.querySelector('#exm-newrec');
  inp.value = '  Trane Canada  ';
  E.exportAddRecipient(root);
  agree('a new recipient is added, trimmed', true,
        root.querySelector('#exm-dl').textContent.indexOf('Trane Canada') !== -1);
  agree('the input is cleared after adding', '', inp.value);
  const n1 = E.exportSelected(root).length;
  inp.value = 'trane canada';
  E.exportAddRecipient(root);
  agree('the same name in lower case is not added twice', n1, E.exportSelected(root).length);
  inp.value = 'TRANE CANADA';
  E.exportAddRecipient(root);
  agree('the same name in upper case is not added twice either', n1, E.exportSelected(root).length);
  inp.value = '   ';
  E.exportAddRecipient(root);
  agree('blank input adds nothing', n1, E.exportSelected(root).length);

  /* A pooled recipient added to a panel that started with none must reveal the
     group it lives in, or it is invisible until reopen. */
  const dom2 = new JSDOM('<!doctype html><html><body><div id="r2"></div></body></html>');
  const root2 = dom2.window.document.getElementById('r2');
  root2.innerHTML = E.exportPanelBodyHTML({ owner: OWNER, contractors: CTRS, saved: [] });
  agree('with no pooled recipients the group starts hidden', 'none',
        root2.querySelector('#exm-other-grp').style.display);
  root2.querySelector('#exm-newrec').value = 'Construction PM';
  E.exportAddRecipient(root2);
  agree('adding the first pooled recipient reveals the group', '',
        root2.querySelector('#exm-other-grp').style.display);
}
console.log('  ' + (cases - before) + ' export-panel identity + rule assertions');

/* ── 6: delegation wired, knowledge gone from the host ──────────────────── */
before = cases;
{
  agree('eligibility delegates', true, /ReportPdf\.appendixEligible/.test(liveSrc));
  agree('sizing delegates', true, /ReportPdf\.sizeChartsForPrint/.test(liveSrc));
  agree('the print constants are not re-written in the host', false, /PRINT_STAGE_W/.test(liveSrc));
  agree('the Owner scope stays with Diesel, as data', true, /'placard'/.test(liftFunction(liveSrc, '_appendixEligible') || ''));
  agree('the appendix assembly delegates', true, /ReportPdf\.appendixHTML/.test(liveSrc));
  agree('the assembly markup is not re-written in the host appendix fn', false,
        /apx-subhead/.test(liftFunction(liveSrc, '_appendixHTML') || ''));
  agree('pagination delegates', true, /window\.ReportPdf\.paginate\(/.test(liveSrc));
  agree('the export panel body delegates', true, /window\.ReportPdf\.exportPanelBodyHTML\(/.test(liveSrc));
  agree('the panel content styles are not re-declared in the host', false, /exm-chip\{|_EXM_BODY_CSS/.test(liveSrc));
  agree('the chip markup and the recipient palette are gone from the host', false,
        /_exmChip|_exmColorFor|_EXM_CTR_PALETTE/.test(liveSrc));
  agree('the page-break rules are gone from the host', false,
        /_splitTable|_splitGeneric|_bandClone|PAGE_LIMIT|_makeCompactHeader/.test(liveSrc));
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
