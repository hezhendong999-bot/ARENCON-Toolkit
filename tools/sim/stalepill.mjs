/* stalepill.mjs — DOES THE STALENESS WARNING ACTUALLY APPEAR? (Lane C, S628)
 *
 * MARK, after three minutes in airplane mode: "I don't think this feature
 * exists. It only says working offline or saved locally."
 *
 * He was right, twice over. The staleness logic ran correctly and wrote its
 * text with document.getElementById('last-sync-text') — an id that lives
 * inside the shared header engine's SHADOW ROOT. The lookup returned null, so
 * two builds of "visible staleness" wrote to nothing, and the host stylesheet
 * rule could not cross the boundary either. Nothing was on screen to see.
 *
 * The lesson this file enforces: a UI claim is only true if something asserts
 * the PIXELS/DOM the person would actually look at. The previous checks
 * asserted the threshold arithmetic — which was right all along — and never
 * asked whether the text reached a node.
 *
 * Run: node tools/sim/stalepill.mjs
 */
import fs from 'fs';
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const dom = new JSDOM('<!doctype html><body><div id="hdr"></div></body>', { url: 'https://arencon.app/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.customElements = dom.window.customElements;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch (_) {}
globalThis.localStorage = dom.window.localStorage;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

console.log('\n═══ STALE PILL PROBE ═══\n');

const eng = await import(pathToFileURL(path.join(REPO, 'lib/ui/headerEngine2.js')).href);

/* Mount the real header, then ask the questions a person would ask of the
   screen: is the text there, and does it look like a warning? */
let ctl = null;
try {
  const mounted = eng.buildHeader2(document.getElementById('hdr'), { title: 'Diesel', actions: [] });
  ctl = (mounted && (mounted.ctl || mounted)) || (window.ArenconHeader && window.ArenconHeader.ctl);
} catch (e) {
  console.log('(mount: ' + (e && e.message) + ')');
  ctl = window.ArenconHeader && window.ArenconHeader.ctl;
}

check('the header mounts and exposes a cloud-status controller',
      !!(ctl && typeof ctl.setCloud === 'function'),
      ctl ? 'controller present' : 'no controller — cannot render anything');

if (ctl && typeof ctl.setCloud === 'function') {
  const root = document.getElementById('hdr').shadowRoot;
  check('the readout element is inside the shadow root (why getElementById failed)',
        !!(root && root.querySelector('.csync')) && !document.getElementById('last-sync-text'),
        'shadow .csync=' + !!(root && root.querySelector('.csync')) +
        ', light-DOM #last-sync-text=' + !!document.getElementById('last-sync-text'));

  ctl.setCloud({ lastSync: 'last sync: 1m ago', stale: false });
  const healthy = root.querySelector('.csync').textContent;
  const healthyStale = root.querySelector('.cloud').classList.contains('is-stale');
  check('a healthy readout renders and is not marked stale',
        healthy.indexOf('last sync') === 0 && !healthyStale,
        'text="' + healthy + '" stale=' + healthyStale);

  ctl.setCloud({ lastSync: '\u26A0 not synced for 3m', stale: true });
  const warn = root.querySelector('.csync').textContent;
  const isStale = root.querySelector('.cloud').classList.contains('is-stale');
  check('the staleness warning reaches the screen',
        warn.indexOf('\u26A0') === 0 && warn.indexOf('not synced') > 0,
        'text="' + warn + '"');
  check('it is visually marked as a warning, not a quiet aside',
        isStale, 'is-stale class on the cloud pill = ' + isStale);

  const css = fs.readFileSync(path.join(REPO, 'lib/ui/headerEngine2.js'), 'utf8');
  check('the warning is amber and overrides the faded default',
        /\.cloud\.is-stale \.csync\{[^}]*opacity:1/.test(css) && /#C98A4A/.test(css),
        'amber + opacity override present in the engine stylesheet');

  ctl.setCloud({ lastSync: 'last sync: just now', stale: false });
  check('it clears when the device syncs again',
        !root.querySelector('.cloud').classList.contains('is-stale'),
        'stale class cleared');

  /* S629b — the realtime status hook fires setCloud on every socket
     transition. A partial update must not silently repaint anything it did
     not mention: a flapping socket showing a healthy green dot while a save
     is failing is the same false reassurance as the offline pill that
     reported itself synced. */
  ctl.setCloud({ state: 'err', text: 'Save failed' });
  ctl.setCloud({ live: false });
  const dotAfter = root.querySelector('.dot').getAttribute('data-s');
  check('a socket status update does not repaint the sync dot',
        dotAfter === 'err', 'dot after a live-only update = ' + dotAfter + ' (must stay err)');

  ctl.setCloud({ live: true });
  check('the live-socket indicator appears when the socket is joined',
        root.querySelector('.cloud').classList.contains('is-live'), '');
  ctl.setCloud({ live: false });
  check('and disappears when it is not — absent is the honest default',
        !root.querySelector('.cloud').classList.contains('is-live'), '');
}

/* ── THE HALF THAT WAS MISSING ────────────────────────────────────────────
   The engine could always render this; the HOST never asked it to. Drive the
   shipped _renderLastSync verbatim and assert it routes through the
   controller — that is the wiring whose absence made the feature invisible. */
{
  const vm = await import('vm');
  const src = fs.readFileSync(path.join(REPO, 'diesel-app/js/part03.js'), 'utf8');
  const at = src.indexOf('function _renderLastSync(){');
  let i = src.indexOf('{', at), d = 0, end = i;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { end = i + 1; break; } } }
  const calls = [];
  const fakeWin = { __dslHeaderCtl: { setCloud: o => calls.push(o) } };
  const ctx = vm.createContext({
    window: fakeWin, document: { getElementById: () => null },
    console, Date, Math, String,
    _lastSyncTs: Date.now() - 180000,
    _fmtSyncAgo: () => '3m ago',
    _hbIsStale: () => true
  });
  vm.runInContext(src.slice(at, end) + '\n_renderLastSync();', ctx);
  const sent = calls[0] || {};
  check('the HOST routes the readout through the header controller',
        calls.length === 1, 'setCloud called ' + calls.length + ' time(s)');
  check('the host sends the warning text AND the stale flag',
        typeof sent.lastSync === 'string' && sent.lastSync.indexOf('not synced') > 0 && sent.stale === true,
        'sent ' + JSON.stringify(sent));
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed\n');
process.exit(failed.length ? 1 : 0);
