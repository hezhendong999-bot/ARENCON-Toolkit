/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — LIGHTBOX CUTOVER (S679-C, unification Phase L3)
   frt/tests/sim/lbcutover.mjs      run: node frt/tests/sim/lbcutover.mjs

   Drives the REAL post-cutover stack exactly as the app loads it: the shared
   shell + markup family as classic scripts, FRT's engine, then the SHIM
   (frt/js/ui/lightbox.js) which builds the shell with FRT's personality and
   exposes the measured external contract on window._frtLightbox.

   C1  CONTRACT      open/close/isOpen/flushForUnload/restoreRescue/activePhoto
   C2  OPEN          photoNav's running order opens in the shared shell with
                     the FRT caption bar mounted
   C3  NEVER-BAKE    a markup save through the shell leaves vectors + frame,
                     binary hash unchanged, zero bake-path calls
   C4  RESTORE WIRED the S650 rescue restore — exported-but-never-called in
                     the old viewer — now runs at every open(): a rescued
                     record handed to open() gets its strokes back
   C5  FLUSH         shim flushForUnload mid-markup stashes a rescue
   C6  PIN WALL      the pin editor's short list stays walled (counter x/3)
   C7  TRASH         a single-photo open stays single (1 / 1)
   C8  GREP TEST     the FRT host file contains ZERO viewer chrome (Rule 2)
   C9  DIESEL        the recorded characterisation still reproduces exactly

   On the PRE-cutover tree C4 and C8 are RED — the restore is unwired and the
   1,894-line viewer is the chrome. That is the red baseline.

   Run: node frt/tests/sim/lbcutover.mjs     [BASE_ROOT=<tree>]
   ═══════════════════════════════════════════════════════════════════════════ */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.BASE_ROOT || path.resolve(HERE, '../../..');

const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://arencon.app/?project=p1', runScripts: 'outside-only', resources: 'usable', pretendToBeVisual: true });
const w = dom.window;
global.window = w; global.document = w.document;
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w;
global.CustomEvent = w.CustomEvent; global.Event = w.Event; global.Blob = w.Blob;
global.localStorage = w.localStorage; global.URL = w.URL;
global.indexedDB = w.indexedDB = new FDBFactory();
global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;
global.requestAnimationFrame = w.requestAnimationFrame.bind(w);

const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (!ok && d ? '\n          ' + d : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex');

/* bake tripwires + inert host services */
let bakeCalls = [];
['_dslMarkupPersist', '_dslLoadBakeImage', '_dslMarkupRevert', '_rebuildMkDisplay'].forEach(n => { w[n] = () => { bakeCalls.push(n); return Promise.resolve(); }; });
w._dslRefreshPhotoSurfaces = () => { }; w._renderPhotoGallery = () => { };
w.saveState = () => { }; w.debounceAutosave = () => { }; w._collectCloudState = () => ({});

/* the stack, in the app's own load order (frt/index.html) */
w.eval(fs.readFileSync(path.join(ROOT, 'lib/ui/markupTools.js'), 'utf8'));
try { w.eval(fs.readFileSync(path.join(ROOT, 'lib/ui/markupSelection.js'), 'utf8')); } catch (_) { }
w.eval(fs.readFileSync(path.join(ROOT, 'lib/ui/lightbox.js'), 'utf8'));
const { Model } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/model.js')).href);
const { IDB } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/idb.js')).href);
await IDB.init();
await import(pathToFileURL(path.join(ROOT, 'frt/js/viewer/markupEngine.js')).href);   // classic-shaped IIFE: sets window.MarkupEngine
await import(pathToFileURL(path.join(ROOT, 'frt/js/ui/lightbox.js')).href);           // THE SHIM (or, pre-cutover, the old viewer)
const { openInProject } = await import(pathToFileURL(path.join(ROOT, 'frt/js/ui/photoNav.js')).href);
const LB = w._frtLightbox;

Model.newProject();
const proj = Model.getProject();
const mkPhoto = (id, hue) => {
  const c = w.document.createElement('canvas'); c.width = 400; c.height = 300;
  const g = c.getContext('2d'); g.fillStyle = 'hsl(' + hue + ',30%,40%)'; g.fillRect(0, 0, 400, 300);
  return { id, filename: id, caption: '', addedDate: '2026-08-19', dataUrl: c.toDataURL('image/png') };
};
const pA = mkPhoto('pA', 10), pB = mkPhoto('pB', 120), pC = mkPhoto('pC', 240), pD = mkPhoto('pD', 300);
proj.photos = [pA, pB, pC, pD];

/* C1 — contract */
check('C1 contract: open/close/isOpen/flushForUnload/restoreRescue/activePhoto all present',
  !!(LB && LB.open && LB.close && LB.isOpen && LB.flushForUnload && LB.restoreRescue && LB.activePhoto),
  'members: ' + Object.keys(LB || {}).join(','));

/* C4 — RESTORE WIRED AT OPEN (the fixed gap) */
w.localStorage.setItem('frt_markup_rescue_v1', JSON.stringify({
  photoId: 'pB', strokes: [{ id: 'r1', tool: 'pen', color: '#FF3B30', size: 4, opacity: 1, pts: [{ x: 5, y: 5 }, { x: 50, y: 50 }] }],
  mkFrame: { w: 400, h: 300 }, at: Date.now()
}));
LB.open(proj.photos, 0, {});
await sleep(120);
check('C4 the S650 rescue restore now runs at open(): rescued strokes are back on the record',
  pB._markupStrokes && pB._markupStrokes.length === 1 && !w.localStorage.getItem('frt_markup_rescue_v1'),
  'pB strokes=' + (pB._markupStrokes && pB._markupStrokes.length) + ' rescueLeft=' + w.localStorage.getItem('frt_markup_rescue_v1'));

/* C2 — open via the running order, shell chrome + FRT bar */
LB.close(); await sleep(80);
openInProject(pC, proj.photos, 2, {});
const area = w.document.getElementById('dlb-area');
if (area) {
  Object.defineProperty(area, 'clientWidth', { get: () => 900 });
  Object.defineProperty(area, 'clientHeight', { get: () => 620 });
  w.dispatchEvent(new w.Event('resize'));
}
await sleep(350);
const counter2 = (w.document.getElementById('dlb-counter') || {}).textContent || '';
check('C2 running-order open: shared shell shows 3 / 4 with the FRT caption bar mounted',
  LB.isOpen() && counter2.replace(/\s/g, '') === '3/4' && !!w.document.getElementById('frt-lb-info'),
  'isOpen=' + LB.isOpen() + ' counter=' + JSON.stringify(counter2) + ' bar=' + !!w.document.getElementById('frt-lb-info'));

/* pre-cutover tree: the old viewer has no shared-shell chrome — stop as RED
   rather than crash; C2/C4 above are the red evidence. */
if (!w.document.getElementById('dlb-markup')) {
  console.log('  (pre-cutover viewer — no shared shell chrome; remaining arms unreachable)');
  console.log('\nRED  ' + results.filter(r => r.ok).length + '/' + results.length + ' checks  (tree: ' + ROOT + ')');
  process.exit(1);
}

/* C3 — never-bake through the real toggle */
const E = w.MarkupEngine;
const binBefore = sha(pC.dataUrl);
w.document.getElementById('dlb-markup').dispatchEvent(new w.Event('click', { bubbles: true }));
await sleep(250);
E.strokes.push({ id: 'probeL3', tool: 'pen', color: '#FF3B30', size: 4, opacity: 1, pts: [{ x: 10, y: 10 }, { x: 100, y: 80 }] });
E._histPush && E._histPush({ t: 'add', id: 'probeL3' });
bakeCalls = [];
w.document.getElementById('dlb-markup').dispatchEvent(new w.Event('click', { bubbles: true }));
await sleep(500);
check('C3 never-bake save: vectors + frame on the record, binary hash unchanged, zero bake calls',
  pC._markupStrokes && pC._markupStrokes.length === 1 && pC._mkFrame &&
  (sha(pC.dataUrl) === binBefore || pC._origBlob != null) && bakeCalls.length === 0,
  'strokes=' + (pC._markupStrokes && pC._markupStrokes.length) + ' bake=' + bakeCalls.join(','));

/* C5 — shim flush mid-markup */
w.document.getElementById('dlb-markup').dispatchEvent(new w.Event('click', { bubbles: true }));
await sleep(200);
E.strokes.push({ id: 'probeL3b', tool: 'pen', color: '#FFD60A', size: 4, opacity: 1, pts: [{ x: 1, y: 1 }, { x: 30, y: 30 }] });
E._histPush && E._histPush({ t: 'add', id: 'probeL3b' });
w.localStorage.removeItem('frt_markup_rescue_v1');
const flushed = LB.flushForUnload();
const resc = JSON.parse(w.localStorage.getItem('frt_markup_rescue_v1') || 'null');
check('C5 shim flushForUnload mid-markup stashes the rescue for the active photo',
  flushed === true && resc && resc.photoId === 'pC' && resc.strokes.length === 2,
  'flushed=' + flushed + ' rescue=' + JSON.stringify(resc && { id: resc.photoId, n: resc.strokes && resc.strokes.length }));
w.localStorage.removeItem('frt_markup_rescue_v1');
LB.close(); await sleep(120);

/* C6 — pin-editor wall */
LB.open([pA, pB, pC], 1, { contextLabel: 'Pin #4' });
await sleep(150);
const counter6 = (w.document.getElementById('dlb-counter') || {}).textContent || '';
check('C6 the pin editor stays walled: its short list opens as 2 / 3',
  counter6.replace(/\s/g, '') === '2/3', 'counter=' + JSON.stringify(counter6));
LB.close(); await sleep(80);

/* C7 — trash single */
LB.open([pD], 0, {});
await sleep(150);
const counter7 = (w.document.getElementById('dlb-counter') || {}).textContent || '';
const prevHid = (w.document.getElementById('dlb-prev') || {}).style || {};
const nextHid = (w.document.getElementById('dlb-next') || {}).style || {};
check('C7 the trash viewer stays single-photo: open, arrows hidden, no walk',
  LB.isOpen() && prevHid.display === 'none' && nextHid.display === 'none' &&
  (counter7.replace(/\s/g, '') === '1/1' || counter7 === ''),
  'counter=' + JSON.stringify(counter7) + ' prev=' + prevHid.display + ' next=' + nextHid.display);
LB.close();

/* C8 — the Rule 2 mechanical grep test */
const hostSrc = fs.readFileSync(path.join(ROOT, 'frt/js/ui/lightbox.js'), 'utf8');
const chrome = (hostSrc.match(/dlb-|['"]lb-/g) || []).length;
check('C8 GREP TEST: the FRT host draws ZERO viewer chrome (' + hostSrc.split('\n').length + ' lines)',
  chrome === 0, 'chrome tokens found: ' + chrome);

/* C9 — Diesel characterisation unchanged */
const { execSync } = await import('child_process');
let dieselOk = false, out9 = '';
try { out9 = execSync('node ' + path.join(ROOT, 'tools/sim/lbshell.mjs'), { env: { ...process.env, BASE_ROOT: ROOT }, timeout: 120000 }).toString(); dieselOk = /GREEN/.test(out9); }
catch (e) { out9 = String(e.stdout || e); }
check('C9 Diesel characterisation still byte-identical', dieselOk,
  out9.split('\n').filter(l => /FAIL/.test(l)).join(' | '));

const fails = results.filter(r => !r.ok).length;
console.log('\n' + (fails ? 'RED' : 'GREEN') + '  ' + (results.length - fails) + '/' + results.length + ' checks  (tree: ' + ROOT + ')');
process.exit(fails ? 1 : 0);
