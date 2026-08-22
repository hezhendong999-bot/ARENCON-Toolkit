/* ═══════════════════════════════════════════════════════════════════════════
   SHARED SHELL SIM — LIGHTBOX HOOK CONTRACT (S679-A / Lane A, Phase L1)
   tools/sim/lbshell.mjs        run: node tools/sim/lbshell.mjs [--trace out.json]

   Phase L1 of the lightbox unification teaches lib/ui/lightbox.js to accept a
   per-host personality (build(hooks)) while a host that passes nothing gets
   today's behaviour EXACTLY. This probe is both halves of that proof:

   MODE A — CHARACTERISATION (Rule 5 of the work order): drive the shell
   headless through a Diesel-shaped session — build with NO hooks, open three
   photos, navigate, rotate, enter markup, attempt save, delete-confirm path,
   close — against recording stubs for every late-bound host global. The
   ordered call trace (consecutive duplicates collapsed — paint cadence is
   timing-dependent, the SEQUENCE is not) is written out. Recorded on the
   PRE-EDIT tree it is the specification; the edited tree must reproduce it
   byte-for-byte. Any diff is a behaviour change and fails the phase.

   MODE B — HOOKS: build WITH a personality (showToast + markupEngine +
   renderOverlay + onPhotoShown) and assert precedence: the hook is called,
   the window global is NOT, the stage paint invokes the host overlay, and
   every shown photo notifies the host. On a pre-L1 tree this mode FAILS —
   that is the red baseline.

   Run: node tools/sim/lbshell.mjs          [BASE_ROOT=<tree>]
   Deps: npm i jsdom canvas
   ═══════════════════════════════════════════════════════════════════════════ */
import { JSDOM } from 'jsdom';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.BASE_ROOT || path.resolve(HERE, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'lib/ui/lightbox.js'), 'utf8');

const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (!ok && d ? '\n          ' + d : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeWorld() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://arencon.app/', runScripts: 'outside-only', resources: 'usable', pretendToBeVisual: true });
  const w = dom.window;
  const trace = [];
  const rec = (name, brief) => {
    const e = name + (brief !== undefined ? '(' + brief + ')' : '');
    if (trace[trace.length - 1] !== e) trace.push(e);           // collapse paint-cadence repeats
  };
  /* recording stubs — the full late-bound contract the shell documents */
  w.showToast = m => rec('showToast', m);
  w._aConfirm = (m, fn, ok) => { rec('_aConfirm', ok); fn && fn(); };
  w._photoSrc = p => { rec('_photoSrc'); return (p && (p.d || p.dataUrl)) || ''; };
  w._isPhotoDeleted = () => false;
  w._isRealImageBlob = () => { rec('_isRealImageBlob'); return Promise.resolve(true); };
  w._r2Fname = p => (p && p.id) + '.jpg';
  w.saveState = () => rec('saveState');
  w.debounceAutosave = () => rec('debounceAutosave');
  w._collectCloudState = () => { rec('_collectCloudState'); return {}; };
  w._dslRefreshPhotoSurfaces = () => rec('_dslRefreshPhotoSurfaces');
  w._renderPhotoGallery = () => rec('_renderPhotoGallery');
  w._rebuildMkDisplay = (p) => { rec('_rebuildMkDisplay'); return Promise.resolve(); };   // Diesel's returns a promise
  w._dslMarkupRevert = () => rec('_dslMarkupRevert');
  w._dslMarkupPersist = () => rec('_dslMarkupPersist');
  w._dslLoadBakeImage = (p, cb) => { rec('_dslLoadBakeImage'); cb && cb(null); };
  w._dslStampSiblings = () => rec('_dslStampSiblings');
  w.deletePhotoEverywhere = (p, after) => { rec('deletePhotoEverywhere', p && p.id); after && after(); };
  const engine = mkEngine(rec);
  w.DieselMarkup = engine;
  w.eval(SRC);
  return { w, trace, rec, engine };
}

function mkEngine(rec) {
  /* Diesel-shaped stub of the full method surface the shell drives */
  const E = {};
  const fns = ['cancelSelect', 'setSelectSub', 'applySel', 'deselect', 'clear', 'ungroupActive',
    'undo', 'snapSel', 'redoOp', 'confirmPick', 'commitSel', '_repositionTextBox', 'render',
    'detach', 'deleteSelected', '_onTextStart', '_onTextEnd'];
  fns.forEach(n => { E[n] = (...a) => rec('ENG.' + n); });
  E.attach = () => rec('ENG.attach');
  E.composite = () => rec('ENG.composite');
  E.hasSel = () => false;
  E.isDirty = () => false;
  E.strokes = [];
  E.toMk = () => ({ strokes: [] });
  E.getSelectSub = () => 'rubber';
  E.onSelChange = () => {};
  E.opaqueBase = () => null;
  E._textController = null;
  E.canvas = null;
  return E;
}

function photos(w) {
  /* three deterministic canvas photos */
  const mk = (id, hue) => {
    const c = w.document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = 'hsl(' + hue + ',30%,40%)'; g.fillRect(0, 0, 400, 300);
    return { id, d: c.toDataURL('image/png'), rotation: 0 };
  };
  return [mk('pA', 10), mk('pB', 120), mk('pC', 240)];
}

async function driveSession(w, api) {
  const ph = photos(w);
  api.open(ph, 0, {});
  /* JSDOM has no layout: give the viewer area dimensions, then the shell's own
     resize refit signal — nothing in the paint path is stubbed */
  const area = w.document.getElementById('dlb-area');
  Object.defineProperty(area, 'clientWidth', { get: () => 900 });
  Object.defineProperty(area, 'clientHeight', { get: () => 620 });
  w.dispatchEvent(new w.Event('resize'));
  await sleep(350);
  const cp = [];
  const counter = () => (w.document.getElementById('dlb-counter') || {}).textContent;
  cp.push('counter=' + counter());
  w.document.getElementById('dlb-next').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(250); cp.push('counter=' + counter());
  w.document.getElementById('dlb-rotate').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(250);
  w.document.getElementById('dlb-markup').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(250);
  cp.push('markupbar=' + ((w.document.getElementById('dlb-markupbar') || {}).style || {}).display);
  w.document.getElementById('dlb-markup').dispatchEvent(new w.Event('click', { bubbles: true }));   // toggle again → save path (not dirty)
  await sleep(250);
  w.document.getElementById('dlb-prev').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(250); cp.push('counter=' + counter());
  w.document.getElementById('dlb-delete').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(250);
  w.document.getElementById('dlb-close').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(150);
  cp.push('isOpen=' + api.isOpen());
  return cp;
}

/* ── MODE A: characterisation, no hooks ────────────────────────────────── */
const A = makeWorld();
const apiA = A.w.LightboxShell.build();
const cpA = await driveSession(A.w, apiA);
const traceA = { trace: A.trace, checkpoints: cpA };
const spec = path.join(HERE, 'fixtures', 'lbshell_trace.json');
const argTrace = process.argv.indexOf('--record');
if (argTrace >= 0) {
  fs.mkdirSync(path.dirname(spec), { recursive: true });
  fs.writeFileSync(spec, JSON.stringify(traceA, null, 1));
  console.log('  RECORDED specification: ' + spec + '  (' + A.trace.length + ' trace entries, ' + cpA.length + ' checkpoints)');
} else if (fs.existsSync(spec)) {
  const want = JSON.parse(fs.readFileSync(spec, 'utf8'));
  const same = JSON.stringify(want) === JSON.stringify(traceA);
  check('A  characterisation — the session reproduces the recorded specification exactly',
    same, !same ? ('first diff: ' + firstDiff(want, traceA)) : '');
} else {
  console.log('  (no recorded specification yet — run with --record on the PRE-EDIT tree first)');
}
function firstDiff(a, b) {
  const x = a.trace.concat(a.checkpoints), y = b.trace.concat(b.checkpoints);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return 'entry ' + i + ': spec=' + JSON.stringify(x[i]) + ' got=' + JSON.stringify(y[i]);
  return 'lengths ' + x.length + ' vs ' + y.length;
}

/* ── MODE B: hooks precedence (red on a pre-L1 tree) ───────────────────── */
const B = makeWorld();
let hookToasts = 0, hookOverlay = 0, hookShown = 0, hookEngineHits = 0;
const hookEngine = mkEngine(() => { hookEngineHits++; });
const apiB = B.w.LightboxShell.build({
  showToast: m => { hookToasts++; },
  markupEngine: hookEngine,
  renderOverlay: (ctx, p, nw, nh) => { hookOverlay++; },
  onPhotoShown: (p, i, n) => { hookShown++; }
});
let windowToastsDuringB = 0;
const origToast = B.w.showToast; B.w.showToast = m => { windowToastsDuringB++; origToast(m); };
B.w.DieselMarkup = mkEngine(() => { check('B  hooks — window engine must NOT be driven when hooks.markupEngine is supplied', false, 'window.DieselMarkup was called'); });
await driveSession(B.w, apiB);
/* provoke a toast deliberately — the shared session exits markup clean and
   never fires one: delete on an id-less photo always toasts 'Photo not found' */
apiB.open([{ d: 'data:,x' }], 0, {});
await sleep(150);
B.w.document.getElementById('dlb-delete').dispatchEvent(new B.w.Event('click', { bubbles: true }));
await sleep(100);
apiB.close();
check('B1 hooks — every shown photo notifies the host (onPhotoShown)', hookShown >= 3, 'shown=' + hookShown);
check('B2 hooks — the stage paint invokes the host overlay (renderOverlay)', hookOverlay >= 1, 'overlay=' + hookOverlay);
check('B3 hooks — hook engine drives markup; hits=' + hookEngineHits, hookEngineHits >= 1, 'engine never consulted');
check('B4 hooks — hook toast wins over the window global', hookToasts >= 1 && windowToastsDuringB === 0,
  'hookToasts=' + hookToasts + ' windowToasts=' + windowToastsDuringB);

const fails = results.filter(r => !r.ok).length;
console.log('\n' + (fails ? 'RED' : 'GREEN') + '  ' + (results.length - fails) + '/' + results.length + ' checks  (tree: ' + ROOT + ')');
process.exit(fails ? 1 : 0);
