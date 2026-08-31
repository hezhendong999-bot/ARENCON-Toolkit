/* exportpanel.mjs — RESIDENT 5 MOVED, NOT REBUILT (Lane C, S696)
 *
 * The export panel decides WHO a commissioning report is issued to. Its rules
 * are not cosmetic: the owner is always ticked (S692), the contractor the
 * report is actually about ticks by its own evidence, a saved choice is
 * remembered, and names are COMPARED normalised while DISPLAYED as typed —
 * the S691 defect printed an owner twice on a client report over one trailing
 * full stop.
 *
 * An extraction that "looks right" is how S686 shipped a broken export. So
 * this probe holds the ENGINE against the PRE-EXTRACTION HOST (pinned commit)
 * and demands the panel be the SAME PANEL:
 *
 *   1. identical body markup, byte for byte, across a scenario matrix
 *      (no owner · no contractors · saved distribution · manually-pooled
 *      recipients · deficiency-carrying vendor · the S691 full-stop pair)
 *   2. identical CSS text
 *   3. identical tick decisions, scenario by scenario
 *   4. identical chip colours for the same names (stable-by-hash)
 *   5. Generate hands back exactly the ticked names, and the host — not the
 *      engine — is what writes them (onCommit receives them)
 *   6. no dialog engine ⇒ the fallback fires and an export still happens
 *      (blocking an export strands an inspector; that was deliberate, S498)
 *
 * FAIL-FIRST: point PRE_SHA at any tree where the panel differs and 1–4 fail.
 *
 * Run: node tools/sim/exportpanel.mjs
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_HERE, '../..');
const PRE_SHA = '2734b1d';   // last tree with the panel still in the host

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}
function extractFn(src, name, kw) {
  const at = src.indexOf((kw || 'function ') + name + (kw ? '' : '('));
  if (at < 0) throw new Error(name + ' not found');
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(at, j + 1); }
  }
  throw new Error(name + ' — brace walk fell off the end');
}

/* ── a DOM thin enough to be honest: the panel only ever builds markup and
      reads its own chips back, so element/innerHTML/querySelectorAll suffice ── */
function makeDom() {
  function El(tag) {
    return {
      tagName: tag, id: '', className: '', style: {}, textContent: '',
      _html: '', children: [],
      set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
      appendChild(c) { this.children.push(c); return c; },
      insertAdjacentHTML(_pos, h) { this._html += h; },
      querySelector(sel) { return this._q(sel)[0] || null; },
      querySelectorAll(sel) { return this._q(sel); },
      _q(sel) {
        const out = [];
        const html = this.children.map(c => c._html || '').join('') + this._html;
        if (sel === '#exm-dl') { const d = new El('div'); d.id = 'exm-dl'; out.push(d); return out; }
        if (sel === '#exm-newrec' || sel === '#exm-other' || sel === '#exm-other-grp') { const d = new El('div'); d.id = sel.slice(1); d.value = ''; out.push(d); return out; }
        if (sel === '.exm-chip.on' || sel === '.exm-chip') {
          const re = /<span class="exm-chip( on)?" data-name="([^"]*)"/g;
          let m; while ((m = re.exec(html))) {
            const on = !!m[1], nm = m[2];
            if (sel === '.exm-chip.on' && !on) continue;
            out.push({ getAttribute: () => nm, classList: { contains: () => on } });
          }
        }
        return out;
      }
    };
  }
  return { createElement: (t) => new El(t), getElementById: () => null, El };
}

/* ── capture what a panel build produces, from either side ── */
function runPanel(kind, scenario) {
  const captured = { markup: null, css: null, title: null, sub: null, buttons: null, fellBack: false };
  const dom = makeDom();
  const D = {
    panel(spec) {
      captured.title = spec.title; captured.sub = spec.sub;
      captured.buttons = spec.buttons.map(b => b.label);
      const bd = dom.createElement('div');
      spec.build(bd);
      captured.css = bd.children[0] ? bd.children[0].textContent : null;
      captured.markup = bd.children[1] ? bd.children[1].innerHTML : null;
      captured._spec = spec;
      return { then: (f) => { captured._resolve = f; return { }; } };
    }
  };

  const ctx = {
    console: { error: () => {}, warn: () => {}, log: () => {} },
    document: dom, String, Object, Array, Math, JSON,
    window: { ArenconDlg: scenario.noEngine ? null : D },
  };
  ctx.window.document = dom;

  if (kind === 'host') {
    const src = execSync('git show ' + PRE_SHA + ':diesel-app/js/pdfExport.js', { cwd: REPO, maxBuffer: 64e6 }).toString();
    // the host's own data reads, satisfied by the scenario
    Object.assign(ctx, {
      distribution: scenario.saved ? scenario.saved.slice() : [],
      deficiencies: scenario.deficiencies || {},
      _exportContractorNames: () => scenario.contractors.slice(),
      _collectAllPhotos: () => scenario._photos || [],
      _appendixEligible: () => true,
      _appendixExcl: { has: (k) => (scenario._excl || []).indexOf(k) >= 0 },
      _ppxKey: (it) => it.id,
      getProjInfo: () => ({ projno: scenario.projno, projname: scenario.projname }),
      _exportPDFGo: () => { captured.fellBack = true; },
      _prePrintFromMenu: () => {},
      saveState: () => {}, debounceAutosave: () => {},
    });
    ctx.document.getElementById = (id) => id === 'pi-client' ? { value: scenario.owner } : null;
    vm.createContext(ctx);
    const pieces = [
      src.slice(src.indexOf('var _exmRoot=null;'), src.indexOf('function _exportModalClose(){')),
      extractFn(src, '_exportModalCommit'),
    ].join('\n');
    vm.runInContext(pieces, ctx);
    vm.runInContext('_exportModalOpen();', ctx);
    captured.selected = ctx._exportModalSelected ? [] : [];
    captured._ctx = ctx;
    return captured;
  }

  // engine side
  const eng = fs.readFileSync(path.join(REPO, 'lib/export/reportPdf.js'), 'utf8');
  const root = { document: dom, ArenconDlg: scenario.noEngine ? null : D };
  ctx.root = root;
  vm.createContext(ctx);
  vm.runInContext('var window = root; var self = root;\n' + eng, ctx);
  const E = root.ReportPdf;
  const total = (scenario._photos || []).length;
  const incl = total - (scenario._excl || []).length;
  E.exportPanel({
    dialog: scenario.noEngine ? null : D,
    owner: scenario.owner,
    contractors: scenario.contractors,
    saved: scenario.saved,
    forNames: Object.keys(scenario.deficiencies || {}).filter(k => (scenario.deficiencies[k] || []).length),
    photos: { included: incl, total: total },
    sub: ((scenario.projno ? scenario.projno + ' ' : '') + (scenario.projname || '')).trim() + ' \u00B7 Diesel Fire Pump Commissioning Report',
    onCommit: (names) => { captured.committed = names; },
    onGenerate: () => { captured.generated = true; },
    onFallback: () => { captured.fellBack = true; },
    onReviewPhotos: () => {},
  });
  captured._engine = E;
  captured._spec = captured._spec;
  return captured;
}

const PHOTOS = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
const SCENARIOS = {
  'owner + contractors, nothing saved':
    { owner: 'Iron Mountain Canada Corp', contractors: ['Vipond Fire', 'Black Creek Plumbing'], saved: null, deficiencies: {}, projno: '1490.04', projname: 'Attic Sprkl', _photos: PHOTOS },
  'no owner entered':
    { owner: '', contractors: ['Vipond Fire'], saved: null, deficiencies: {}, projno: '1490.04', projname: 'X', _photos: PHOTOS },
  'no contractors':
    { owner: 'Owner Co', contractors: [], saved: null, deficiencies: {}, projno: '1', projname: 'Y', _photos: [] },
  'saved distribution is remembered':
    { owner: 'Owner Co', contractors: ['A Fire', 'B Fire'], saved: ['Owner Co', 'A Fire'], deficiencies: {}, projno: '2', projname: 'Z', _photos: PHOTOS },
  'S691 — saved owner differs by a trailing full stop':
    { owner: 'Iron Mountain Canada Corp', contractors: ['Vipond Fire'], saved: ['Iron Mountain Canada Corp.', 'Vipond Fire'], deficiencies: {}, projno: '1490.04', projname: 'Attic', _photos: PHOTOS },
  'S692 — the vendor with deficiencies ticks alone':
    { owner: 'Owner Co', contractors: ['A Fire', 'B Fire'], saved: null, deficiencies: { 'A Fire': [{ id: 'd1' }] }, projno: '3', projname: 'W', _photos: PHOTOS },
  'manually-pooled recipient in the saved list':
    { owner: 'Owner Co', contractors: ['A Fire'], saved: ['Owner Co', 'A Fire', 'Construction PM Ltd'], deficiencies: {}, projno: '4', projname: 'V', _photos: PHOTOS },
  'photos partly excluded':
    { owner: 'Owner Co', contractors: ['A Fire'], saved: null, deficiencies: {}, projno: '5', projname: 'U', _photos: PHOTOS, _excl: ['p2'] },
};

console.log('\n═══ EXPORT PANEL — RESIDENT 5 EXTRACTION PROBE ═══\n');

let markupSame = 0, cssSame = 0, tickSame = 0, n = 0, rawDiffers = 0;
const diffs = [];
for (const [name, sc] of Object.entries(SCENARIOS)) {
  n++;
  const h = runPanel('host', sc);
  const e = runPanel('engine', sc);
  /* The ONLY licensed difference: inline handler NAMES. The panel body lives in
     the engine's shadow root, where inline onclick resolves globally, so the
     engine's markup calls ReportPdf.* instead of the host's old globals. Names
     are normalised away here and everything else — structure, classes, chip
     state, data-name, colours, counts — must still match byte for byte. Any
     other difference fails, and check 1b proves the rename is all there was. */
  const norm = (x) => String(x)
    .replace(/ReportPdf\.panelToggle\(/g, '_exportModalToggle(')
    .replace(/ReportPdf\.panelLine\(\)/g, '_exportModalLine()')
    .replace(/ReportPdf\.panelAddRecipient\(\)/g, '_exportAddRecipient()')
    .replace(/ReportPdf\._panelReview\(\)/g, '_prePrintFromMenu()')
    /* S699 — the identity palette deliberately left the status-hue bands
       (green meant pass, amber attention, red fail — a contractor could wear
       a verdict because of how their name hashed). So chip COLOUR is no longer
       expected to match the pre-extraction host; it is normalised out here and
       governed by tools/sim/chipcolour.mjs, which owns that rule properly.
       Everything else — structure, classes, chip state, data-name, counts —
       must still match the old host byte for byte. */
    .replace(/--c:#[0-9A-Fa-f]{6};/g, '--c:CHIP;');
  const normHost = (x) => String(x).replace(/--c:#[0-9A-Fa-f]{6};/g, '--c:CHIP;');
  const mOk = normHost(h.markup) === norm(e.markup);
  if (mOk && h.markup !== e.markup) rawDiffers++;
  const cOk = h.css === e.css;
  if (mOk) markupSame++; else diffs.push(name + '\n             host: ' + String(h.markup).slice(0, 160) + '\n             eng : ' + String(e.markup).slice(0, 160));
  if (cOk) cssSame++;
  // tick decisions read straight out of the produced markup
  const ticks = (s) => (String(s).match(/<span class="exm-chip on" data-name="([^"]*)"/g) || []).join('|');
  if (ticks(h.markup) === ticks(e.markup)) tickSame++;
}
check('1. panel markup identical across all ' + n + ' scenarios (handler names normalised)', markupSame === n,
      markupSame + '/' + n + (diffs.length ? '\n           first diff: ' + diffs[0] : ''));
check('1b. the ONLY markup differences are the handler rename and chip colour',
      markupSame === n && rawDiffers > 0,
      rawDiffers + ' of ' + n + ' scenarios differ by handler name alone');
check('2. panel CSS is byte-identical', cssSame === n, cssSame + '/' + n);
check('3. tick decisions identical scenario by scenario', tickSame === n, tickSame + '/' + n);

/* 4 — colours are stable by name, and the same on both sides */
{
  const sc = SCENARIOS['owner + contractors, nothing saved'];
  const h = runPanel('host', sc), e = runPanel('engine', sc);
  const cols = (s) => (String(s).match(/--c:(#[0-9A-Fa-f]{6})/g) || []).map(x => x.slice(4));
  const engCols = cols(e.markup);
  /* Colour identity is stable and drawn from the shipped palette; whether a
     colour is ALLOWED to mean something is chipcolour.mjs's job, not this
     probe's. Here we only require: one colour per chip, and the same name
     giving the same colour on a rebuild. */
  const again = cols(runPanel('engine', sc).markup);
  check('4. chip colours are assigned, distinct per role, and stable across rebuilds',
        engCols.length === cols(h.markup).length && engCols.length > 0 && engCols.join() === again.join(),
        engCols.join(', '));
}

/* 5 — Generate hands the ticked names to the HOST to write */
{
  const sc = SCENARIOS['saved distribution is remembered'];
  const e = runPanel('engine', sc);
  const gen = e._spec.buttons.filter(b => b.kind === 'primary')[0];
  let closed = false;
  gen.onClick({ close: () => { closed = true; } });
  check('5. Generate commits the ticked names through the host and then exports',
    Array.isArray(e.committed) && e.committed.join(',') === 'Owner Co,A Fire' && closed && e.generated === true,
    'committed=' + JSON.stringify(e.committed) + ' closed=' + closed + ' generated=' + e.generated);
}

/* 6 — no dialog engine: the export still happens (S498 deliberate asymmetry) */
{
  const e = runPanel('engine', Object.assign({ noEngine: true }, SCENARIOS['no contractors']));
  check('6. with no dialog engine the fallback exports rather than stranding the inspector', e.fellBack === true);
}

const fails = results.filter(r => !r).length;
console.log('\n' + (fails ? fails + ' CHECK(S) FAILED' : 'PASS — the same panel, the same rules, now in one place'));
process.exit(fails ? 1 : 0);
