/* battle_device.mjs — ONE REAL DEVICE for the S622 battle harness.
 * Runs the actual shipped facade+engine (DEV_ROOT selects the build — the
 * live S622 tree or the S621 baseline for mixed-build tests) inside its own
 * process: own JSDOM window, own localStorage, own in-memory IndexedDB, own
 * device id. All cloud traffic is forwarded to the parent's mock Supabase
 * over local HTTP, so three devices genuinely collide on If-Match the way
 * three tablets collide on the real cloud.
 * Protocol: JSON lines on stdin → JSON lines on stdout. */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path'; import { pathToFileURL } from 'url';
import readline from 'readline';

const ROOT = process.env.DEV_ROOT;
const BASE = process.env.CLOUD_BASE;            // http://127.0.0.1:PORT
const DEV  = process.env.DEVICE_ID || 'dev-x';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/' });
const w = dom.window; global.window = w; global.document = w.document;
let online = true;
Object.defineProperty(w.navigator, 'onLine', { get: () => online, configurable: true });
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w; global.CustomEvent = w.CustomEvent; global.Event = w.Event;
global.Blob = w.Blob; global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory(); global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;

const realFetch = global.fetch.bind(global);
global.fetch = w.fetch = function (url, opts) {
  if (!online) return Promise.reject(new Error('Failed to fetch'));
  const u = new URL(String(url), 'https://x.supabase.co');
  return realFetch(BASE + u.pathname + u.search, opts);
};
w.localStorage.setItem('sb-access-token', 'tok');
w.localStorage.setItem('sb-refresh-token', 'ref');
w.localStorage.setItem('arencon-device-id', DEV);
global.DIESEL_BUILD = w.DIESEL_BUILD = process.env.DEV_BUILD || 'SIM';

let screen = {};
w._collectCloudState = () => JSON.parse(JSON.stringify(screen));
w._applyLoadedState = j => { screen = JSON.parse(j); };
w._mergeCloudLocal = c => c; w._stateHasContent = () => true;

await import(pathToFileURL(path.join(ROOT, 'diesel-sync.js')).href);
const CS = w.CloudSync;

const rl = readline.createInterface({ input: process.stdin });
const send = o => process.stdout.write(JSON.stringify(o) + '\n');

function deepSet(obj, pathArr, value) {
  let o = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    if (o[pathArr[i]] == null || typeof o[pathArr[i]] !== 'object') o[pathArr[i]] = {};
    o = o[pathArr[i]];
  }
  if (value === undefined) delete o[pathArr[pathArr.length - 1]];
  else o[pathArr[pathArr.length - 1]] = value;
}

for await (const line of rl) {
  let m; try { m = JSON.parse(line); } catch (_) { continue; }
  try {
    if (m.cmd === 'init') {
      await CS.init({ toolKey: 'diesel', projectId: 'p1', instanceId: m.row });
      CS.startAutoSave(w._collectCloudState, 1e9);
      await new Promise(r => setTimeout(r, 50));
      send({ id: m.id, ok: true });
    } else if (m.cmd === 'set') {
      deepSet(screen, m.path, m.value);
      send({ id: m.id, ok: true });
    } else if (m.cmd === 'save') {
      await CS.save(JSON.stringify(w._collectCloudState()));
      await new Promise(r => setTimeout(r, 80));
      send({ id: m.id, ok: true });
    } else if (m.cmd === 'beat') {
      await CS.heartbeatTick();
      await new Promise(r => setTimeout(r, m.settle || 130));
      send({ id: m.id, ok: true });
    } else if (m.cmd === 'offline') { online = false; send({ id: m.id, ok: true }); }
    else if (m.cmd === 'online')  { online = true;  send({ id: m.id, ok: true }); }
    else if (m.cmd === 'get')     { send({ id: m.id, ok: true, screen: screen }); }
    else if (m.cmd === 'exit')    { send({ id: m.id, ok: true }); process.exit(0); }
    else send({ id: m.id, ok: false, err: 'unknown cmd' });
  } catch (e) {
    send({ id: m.id, ok: false, err: String(e && e.message || e) });
  }
}
