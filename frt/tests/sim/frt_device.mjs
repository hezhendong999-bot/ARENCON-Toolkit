/* frt_device.mjs — ONE REAL FRT DEVICE, in its own process.
 *
 * Why this file exists (S646): every FRT sim so far has driven ONE engine and
 * called it two devices. That shares _lastSeenUpdatedAt, the ledger, the
 * snapshot and IndexedDB between the two "tablets", so the collision a real
 * second device causes is never produced — the 412 door, where FRT's
 * arbitration actually happens, goes untested. Two of the first three results
 * off the single-process harness were artifacts, one of which read as a clean
 * pass. Lane C solved this for Diesel with battle_device.mjs; this is the same
 * pattern for FRT: own JSDOM window, own localStorage, own in-memory IDB, own
 * device id, all cloud traffic forwarded to the parent's mock Supabase over
 * local HTTP, so two devices genuinely collide on If-Match.
 *
 * Protocol: JSON lines on stdin → JSON lines on stdout. */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path'; import { pathToFileURL } from 'url';
import readline from 'readline';

const ROOT = process.env.DEV_ROOT;
const BASE = process.env.CLOUD_BASE;
const DEV  = process.env.DEVICE_ID || 'frt-dev-x';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/?project=p1' });
const w = dom.window;
global.window = w; global.document = w.document;
let online = true;
Object.defineProperty(w.navigator, 'onLine', { get: () => online, configurable: true });
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w;
global.CustomEvent = w.CustomEvent; global.Event = w.Event; global.Blob = w.Blob;
global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory();
global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;

const realFetch = global.fetch.bind(global);
global.fetch = w.fetch = function (url, opts) {
  if (!online) return Promise.reject(new Error('Failed to fetch'));
  const u = new URL(String(url), 'https://x.supabase.co');
  return realFetch(BASE + u.pathname + u.search, opts);
};
w.localStorage.setItem('sb-access-token', 'tok');
w.localStorage.setItem('sb-refresh-token', 'ref');
w.localStorage.setItem('arencon-device-id', DEV);

const { Model } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/model.js')).href);
const { IDB } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/idb.js')).href);
const { SyncEngine } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/sync.js')).href);
await IDB.init();

const rl = readline.createInterface({ input: process.stdin });
const send = o => process.stdout.write(JSON.stringify(o) + '\n');
const ROW = process.env.ROW_ID;

for await (const line of rl) {
  let m; try { m = JSON.parse(line); } catch (_) { continue; }
  try {
    if (m.cmd === 'newproject') {
      Model.newProject();
      const ctr = Model.addContractor(m.contractor || 'Acme Sprinkler');
      const def = Model.addDeficiency(ctr.id);
      Model.addObservation(def.id || def);
      send({ id: m.id, ok: true, ctrId: ctr.id, deficId: (def.id || def) });
    } else if (m.cmd === 'call') {
      /* Drive the tool's OWN mutators — the same functions the deficiency UI
         calls. Nothing about the edit path is stubbed. */
      const fn = Model[m.fn];
      if (typeof fn !== 'function') { send({ id: m.id, ok: false, err: 'no such mutator: ' + m.fn }); continue; }
      const r = fn.apply(Model, m.args || []);
      send({ id: m.id, ok: true, ret: (r && r.id) ? r.id : (typeof r === 'object' ? null : r) });
    } else if (m.cmd === 'pull') {
      await SyncEngine.pull('p1', ROW);
      await new Promise(r => setTimeout(r, 60));
      send({ id: m.id, ok: true });
    } else if (m.cmd === 'push') {
      const p = Model.getProject();
      /* A real edit bumps `modified`; without it the S491 stale-overwrite
         guard short-circuits and the push is never contested. */
      if (p) p.modified = new Date().toISOString();
      await SyncEngine.push('p1');
      await new Promise(r => setTimeout(r, 80));
      send({ id: m.id, ok: true });
    } else if (m.cmd === 'get') {
      send({ id: m.id, ok: true, proj: JSON.parse(JSON.stringify(Model.getProject() || {})) });
    } else if (m.cmd === 'offline') { online = false; send({ id: m.id, ok: true }); }
    else if (m.cmd === 'online')  { online = true;  send({ id: m.id, ok: true }); }
    else if (m.cmd === 'exit')    { send({ id: m.id, ok: true }); process.exit(0); }
    else send({ id: m.id, ok: false, err: 'unknown cmd' });
  } catch (e) {
    send({ id: m.id, ok: false, err: String((e && e.message) || e) });
  }
}
