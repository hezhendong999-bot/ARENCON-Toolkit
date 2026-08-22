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
const w = dom.window;
/* S622i skew probe: CLOCK_SKEW_MS biases THIS device's Date.now, exactly like
   a tablet whose wall clock runs ahead. The engine under test must neutralize
   it via server-anchored minting. */
const _SKEW = parseInt(process.env.CLOCK_SKEW_MS || '0', 10) || 0;
if (_SKEW) {
  const _realNow = Date.now.bind(Date);
  const _biased = () => _realNow() + _SKEW;
  Date.now = _biased;
  try { w.Date.now = _biased; } catch (_) {}
} global.window = w; global.document = w.document;
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
/* S643 — A DEVICE WHOSE SCREEN REFUSES THE UPDATE. Until now every simulated
   device painted perfectly, so the estate could not express the one thing
   Mark hit: the cloud value arrives, the engine records it as held, and the
   restore dies before the screen shows it. paintfail models exactly that —
   the real _applyLoadedState throws and the facade swallows it, which is the
   shipped behaviour, not an invention of this harness. */
let paintOk = true;
/* S673 — OPEN 2, expressible: the apply SUCCEEDS but individual fields do not
   repaint (Mark: performance values never repaint when a colleague's edit
   arrives). paintfail models a throw; paintSkip models the quieter, field-
   verified shape — everything paints except the named fields. */
let paintSkip = [];
/* S673 — FAITHFUL COLLECT. The real host's _collectCloudState() reads its own
   JS variables: `_fts` and the push-clone receipts (_dev/_tab/_via/_wroteAt)
   do not occur anywhere in diesel-app/js and are never collected. This
   harness screen is set from full applied documents, so without stripping,
   a collected value rides out wearing a STALE stamp from a previous apply —
   an arrangement the product cannot produce, which mis-arbitrates every
   boot merge the probe runs. */
const ENGINE_KEYS = ['_fts', '_dev', '_tab', '_via', '_wroteAt'];
w._collectCloudState = () => {
  const c = JSON.parse(JSON.stringify(screen));
  ENGINE_KEYS.forEach(k => { delete c[k]; });
  return c;
};
w._applyLoadedState = j => {
  if (!paintOk) throw new Error('SIM: restore threw before it reached the screen');
  const next = JSON.parse(j);
  paintSkip.forEach(f => { if (f in screen) next[f] = screen[f]; else delete next[f]; });
  screen = next;
};
w._mergeCloudLocal = c => c; w._stateHasContent = () => true;

await import(pathToFileURL(path.join(ROOT, 'diesel-sync.js')).href);
const CS = w.CloudSync;


/* ── persisted-world marshalling (S625) ───────────────────────────────────
 * Reads and writes the real IndexedDB through the real API. The harness only
 * carries the bytes across a process boundary; nothing in the tool's storage
 * layer is stubbed or bypassed. */
const IDB_NAME = 'ARENCON_DIESEL_SYNC';
const IDB_VER = 3;
const IDB_STORES = ['syncMeta', 'syncQueue', 'photoOutbox', 'changeJournal'];

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = w.indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      IDB_STORES.forEach(n => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' }); });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dumpIDB() {
  const out = {};
  let db; try { db = await openIDB(); } catch (_) { return out; }
  for (const n of IDB_STORES) {
    if (!db.objectStoreNames.contains(n)) continue;
    out[n] = await new Promise(res => {
      const r = db.transaction(n, 'readonly').objectStore(n).getAll();
      r.onsuccess = () => res(r.result || []); r.onerror = () => res([]);
    });
  }
  db.close();
  return out;
}
/* S673 — the OTHER database. The facade's offline report cache lives in
 * arencon_cloud_cache/tool_state (out-of-line keys), not in the engine's
 * ARENCON_DIESEL_SYNC. Every kill-and-relaunch probe before this one silently
 * relaunched WITHOUT the dead session's unsent work on disk — which is why
 * the estate could not express Mark's field test 3. Additive: probes that
 * never wrote the cache round-trip an empty list. */
const CACHE_DB_NAME = 'arencon_cloud_cache';
function openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = w.indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tool_state')) db.createObjectStore('tool_state');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dumpCacheDB() {
  let db; try { db = await openCacheDB(); } catch (_) { return []; }
  const out = await new Promise(res => {
    try {
      const st = db.transaction('tool_state', 'readonly').objectStore('tool_state');
      const rk = st.getAllKeys(); const rv = st.getAll();
      let keys = null, vals = null;
      const fin = () => { if (keys && vals) res(keys.map((k, i) => ({ k, v: vals[i] }))); };
      rk.onsuccess = () => { keys = rk.result || []; fin(); };
      rv.onsuccess = () => { vals = rv.result || []; fin(); };
      rk.onerror = rv.onerror = () => res([]);
    } catch (_) { res([]); }
  });
  db.close();
  return out;
}
async function loadCacheDB(pairs) {
  if (!pairs || !pairs.length) return;
  const db = await openCacheDB();
  await new Promise((res, rej) => {
    const tx = db.transaction('tool_state', 'readwrite');
    const st = tx.objectStore('tool_state');
    pairs.forEach(p => { try { st.put(p.v, p.k); } catch (_) {} });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function loadIDB(data) {
  const db = await openIDB();
  for (const n of Object.keys(data || {})) {
    if (!db.objectStoreNames.contains(n)) continue;
    await new Promise((res, rej) => {
      const tx = db.transaction(n, 'readwrite');
      const st = tx.objectStore(n);
      (data[n] || []).forEach(rec => { try { st.put(rec); } catch (_) {} });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  db.close();
}

/* S673 — the engine narrates its decisions via console.log/info, which lands
   on stdout and is silently discarded by the JSON line protocol. Three probe
   iterations were spent theorising about silent null returns the engine was
   loudly explaining the whole time. Route narration to stderr, where VERBOSE
   already listens. */
console.log = (...a) => process.stderr.write('[log] ' + a.map(String).join(' ') + '\n');
console.info = (...a) => process.stderr.write('[info] ' + a.map(String).join(' ') + '\n');

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
    } else if (m.cmd === 'snapshot') {
      /* S625 — STORAGE THAT SURVIVES THE PROCESS. The estate could never test
         "an offline edit survives the app closing" because a simulated
         device's storage died with its process, which is precisely NOT what a
         tablet does. The device now hands its whole persisted world back, and
         a fresh process can be seeded with it. Only the STORAGE crosses the
         boundary — the engine is re-imported clean, exactly as a relaunched
         app re-executes its code with the disk intact. */
      const ls = {};
      for (let i = 0; i < w.localStorage.length; i++) {
        const k = w.localStorage.key(i);
        ls[k] = w.localStorage.getItem(k);
      }
      const idb = await dumpIDB();
      const cacheDb = await dumpCacheDB();   // S673
      /* The REPORT ITSELF must cross too. A real app saves its report locally
         and restores it on relaunch; a simulated device that forgot the report
         would prove only that the harness has amnesia, not that the tool loses
         an edit. Carrying it makes the question the right one: does a restored
         value with no surviving entry stamp still hold its ground? */
      send({ id: m.id, ok: true, store: { localStorage: ls, idb, cacheDb, screen: JSON.parse(JSON.stringify(screen)) } });
    } else if (m.cmd === 'restore') {
      try {
        Object.keys((m.store && m.store.localStorage) || {}).forEach(k => {
          w.localStorage.setItem(k, m.store.localStorage[k]);
        });
        await loadIDB((m.store && m.store.idb) || {});
        await loadCacheDB((m.store && m.store.cacheDb) || []);   // S673
        if (m.store && m.store.screen) screen = JSON.parse(JSON.stringify(m.store.screen));
        send({ id: m.id, ok: true });
      } catch (e) { send({ id: m.id, ok: false, err: String(e && e.message || e) }); }
    } else if (m.cmd === 'pushnow') {
      /* S673 forensics — call the engine push door directly and report whether
         it resolves, and with what, inside 3s. A hang names the single-flight. */
      try {
        const race = await Promise.race([
          w.SyncEngine.push('p1').then(r => ({ done: true, row: !!r })),
          new Promise(res => setTimeout(() => res({ done: false }), 3000))
        ]);
        send({ id: m.id, ok: true, ...race });
      } catch (e) { send({ id: m.id, ok: true, done: true, threw: String(e && e.message || e) }); }
    } else if (m.cmd === 'diag') {
      /* S673 — the facade's own on-device panel data, for probe forensics. */
      try { send({ id: m.id, ok: true, diag: CS.getSyncDiag ? CS.getSyncDiag() : null }); }
      catch (e) { send({ id: m.id, ok: false, err: String(e && e.message || e) }); }
    } else if (m.cmd === 'bootload') {
      /* S673 — the boot race, expressible. A real relaunch runs CS.load() and
         the HOST applies the result later, on its own schedule; every loop
         started by S602 is already alive in between. This returns the loaded
         state WITHOUT painting it, so a probe can hold the app in exactly
         that window. Additive: probes that do not send it are unaffected. */
      const r = await CS.load();
      await new Promise(res => setTimeout(res, 80));
      send({ id: m.id, ok: true, state: (r && r.state) || null });
    } else if (m.cmd === 'apply') {
      /* S673 — the host's boot apply, arriving late. */
      try { if (m.state) w._applyLoadedState(JSON.stringify(m.state)); send({ id: m.id, ok: true }); }
      catch (e) { send({ id: m.id, ok: false, err: String(e && e.message || e) }); }
    } else if (m.cmd === 'bootdone') {
      /* S673 — the host announces its boot apply is complete. No-op on builds
         that predate the barrier, so the same probe runs red on live. */
      try { if (CS.bootApplyComplete) CS.bootApplyComplete(m.state || null); } catch (_) {}
      await new Promise(res => setTimeout(res, 150));
      send({ id: m.id, ok: true });
    } else if (m.cmd === 'focus') {
      /* S673 — the OS foregrounds the app: fires the real lifecycle kick. */
      try { w.dispatchEvent(new w.Event('focus')); } catch (_) {}
      await new Promise(res => setTimeout(res, m.settle || 400));
      send({ id: m.id, ok: true });
    } else if (m.cmd === 'load') {
      /* S623 — a real session ALWAYS opens with a cloud load, and that pull is
         the first round trip a device makes. Without it a simulated device
         types its first value having never heard from the server, which no
         inspector ever does. Additive command: existing harnesses that do not
         send it behave exactly as before. */
      /* S673 — the shipped host now announces its boot apply, which lifts the
         facade's boot barrier. This command models that host: without the
         announcement every legacy probe's saves would sit held for the 20s
         fallback — a harness stall the product does not have. Probes that
         need the RAW un-announced window use bootload/apply/bootdone. */
      const _lr = await CS.load();
      try { if (CS.bootApplyComplete) CS.bootApplyComplete((_lr && _lr.state) || null); } catch (_) {}
      await new Promise(r => setTimeout(r, 80));
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
    } else if (m.cmd === 'dbg') { send({ id: m.id, ok: true, offset: (typeof w.__arcSvrOffset === 'undefined' ? 'never-learned' : w.__arcSvrOffset), skew: _SKEW, ledger: (w.__arcLedgerPeek ? w.__arcLedgerPeek() : null) });
    } else if (m.cmd === 'offline') { online = false; try { w.dispatchEvent(new w.Event('offline')); } catch (_) {} send({ id: m.id, ok: true }); }
    else if (m.cmd === 'online')  { online = true;  try { w.dispatchEvent(new w.Event('online')); } catch (_) {} await new Promise(r => setTimeout(r, 250)); send({ id: m.id, ok: true }); }
    else if (m.cmd === 'paintskip') { paintSkip = m.fields || []; send({ id: m.id, ok: true }); }
    else if (m.cmd === 'stamp') {
      /* S673 — the keystroke stamper firing WITHOUT the slower value save:
         stampSoon's 500ms debounce beat the 700ms save debounce, then the
         kill landed between them. Ledger and cache disagree — the exact
         hybrid Mark's tablet carried into its relaunch.
         S674 — this now drives stampSoon, the door a KEYSTROKE actually
         reaches, rather than stampLocal underneath it. Anything the engine
         hangs off that door — including durability — has to be exercised by
         the probe, or the probe proves only the half of the path that was
         already right. */
      try {
        if (w.SyncEngine.stampSoon) w.SyncEngine.stampSoon();
        else await w.SyncEngine.stampLocal();
      } catch (_) {}
      await new Promise(res => setTimeout(res, m.settle || 900));
      send({ id: m.id, ok: true });
    }
    else if (m.cmd === 'paintfail') { paintOk = false; send({ id: m.id, ok: true }); }
    else if (m.cmd === 'paintok')   { paintOk = true;  send({ id: m.id, ok: true }); }
    else if (m.cmd === 'get')     { send({ id: m.id, ok: true, screen: screen }); }
    else if (m.cmd === 'exit')    { send({ id: m.id, ok: true }); process.exit(0); }
    else send({ id: m.id, ok: false, err: 'unknown cmd' });
  } catch (e) {
    send({ id: m.id, ok: false, err: String(e && e.message || e) });
  }
}
