/* ============================================================================
 * bootstall.mjs — the Android failure: CloudSync.init() contains network
 * awaits with no timeout. If one HANGS (not fails), init never resolves, the
 * .then chain never runs, no autosave/heartbeat is ever scheduled, and the
 * device runs local-only forever while looking normal.
 *
 * RULE: must FAIL on S602 live code, PASS on the S603 fix.
 *   SIM_TARGET=live → $SIM_LIVE   SIM_TARGET=fix → this repo
 * ==========================================================================*/
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const TARGET = process.env.SIM_TARGET === 'fix' ? 'fix' : 'live';

/* S614 — PORTABLE ROOTS (Lane A finding: these harnesses carried absolute
   paths from the machine that wrote them and could not run anywhere else).
     SIM_TARGET=fix  → the tree this file lives in (repo root, resolved)
     SIM_TARGET=live → $SIM_LIVE, a checkout of the build you are comparing
                       against; defaults to <repo>/../live for convenience. */
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const LIVE  = process.env.SIM_LIVE || path.resolve(REPO, '../live');
const ROOT = TARGET === 'fix' ? REPO : LIVE;
const HANG_STEP = process.env.HANG || 'auth';   // auth | project | instance

function jsonRes(body) {
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
    json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
}
const NEVER = () => new Promise(() => {});

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/' });
const w = dom.window;
global.window = w; global.document = w.document;
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w; global.CustomEvent = w.CustomEvent;
global.Event = w.Event; global.Blob = w.Blob; global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory();
global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;
global.fetch = w.fetch = function (url) {
  url = String(url);
  if (url.includes('/auth/v1/user'))   return HANG_STEP === 'auth'     ? NEVER() : jsonRes({ id: 'u-mark' });
  if (url.includes('/rest/v1/projects')) return HANG_STEP === 'project' ? NEVER() : jsonRes([{ id: 'p1', project_number: '1490.04' }]);
  if (url.includes('/rest/v1/tool_data')) return HANG_STEP === 'instance' ? NEVER() : jsonRes([]);
  return jsonRes([]);
};
w.localStorage.setItem('sb-access-token', 'tok');
w.localStorage.setItem('sb-refresh-token', 'ref');
global.DIESEL_BUILD = w.DIESEL_BUILD = 'SIM';

console.log(`\n=== BOOT STALL (${TARGET.toUpperCase()} code, hang=${HANG_STEP}) ===\n`);
await import(pathToFileURL(path.join(ROOT, 'diesel-sync.js')).href);
const CS = w.CloudSync;

/* init() must resolve within 30s even though one network step hangs forever.
   Live S602: it never resolves — the Android phone in one screenshot. */
const CEILING = 30000;
const settled = await Promise.race([
  CS.init({ toolKey: 'diesel', projectId: 'p1', instanceId: null }).then(() => 'resolved'),
  new Promise(r => setTimeout(() => r('hung'), CEILING))
]);
const initOk = settled === 'resolved' && CS.isInitialized;
console.log(`  ${initOk ? 'PASS' : 'FAIL'}  init() completes despite a hanging '${HANG_STEP}' step  — ${settled}, isInitialized=${!!CS.isInitialized}`);

let traceOk = false;
if (initOk && CS.getSyncDiag) {
  const d = CS.getSyncDiag();
  traceOk = !!(d.bootTrace && /timed out/.test(String(d.bootTrace)));
  console.log(`  ${traceOk ? 'PASS' : 'FAIL'}  panel breadcrumb names the step that stalled  — "${d.bootTrace || 'absent'}"`);
} else {
  console.log('  FAIL  panel breadcrumb names the step that stalled  — init never completed');
}

const pass = initOk && traceOk;
console.log(`\n${pass ? 2 : (initOk ? 1 : 0)}/2 passed on ${TARGET.toUpperCase()} code\n`);
process.exit(TARGET === 'live' ? (pass ? 9 : 0) : (pass ? 0 : 1));
