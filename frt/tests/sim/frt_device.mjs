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
/* S666 hunt — tally what this device actually asks the cloud, so a silent
   pull can be classified: token-check-only (skip) vs full fetch (merge ran). */
const netTally = { tokenChecks: 0, fullGets: 0, patches: 0, patch412: 0 };
global.fetch = w.fetch = function (url, opts) {
  if (!online) return Promise.reject(new Error('Failed to fetch'));
  const u = new URL(String(url), 'https://x.supabase.co');
  const isTD = u.pathname.includes('/tool_data');
  const method = (opts && opts.method) || 'GET';
  if (isTD && method === 'GET') {
    if ((u.search || '').includes('select=updated_at')) netTally.tokenChecks++;
    else netTally.fullGets++;
  }
  const p = realFetch(BASE + u.pathname + u.search, opts);
  if (isTD && method === 'PATCH') {
    netTally.patches++;
    return p.then(r => { if (r && r.status === 412) netTally.patch412++; return r; });
  }
  return p;
};
w.localStorage.setItem('sb-access-token', 'tok');
w.localStorage.setItem('sb-refresh-token', 'ref');
w.localStorage.setItem('arencon-device-id', DEV);

const { Model } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/model.js')).href);
const { IDB } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/idb.js')).href);
const { SyncEngine } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/sync.js')).href);
const { applyResolutions } = await import(pathToFileURL(path.join(ROOT, 'lib/data/merge.js')).href);
await IDB.init();

/* ── onConflict wiring (S666; the S646 session wrote this and never pushed it).
   WITHOUT THIS, the engine's default handler logs "no handler wired. Push
   abandoned." and DROPS the push — which is how four harness results became
   artifacts and three were reported to Mark as field defects. A probe that
   does not reproduce the real app's wiring proves nothing about the app.
   The real app (frt/js/app.js) shows a modal and applies the user's picks via
   applyResolutions. Here the "user" is a POLICY — 'theirs' | 'mine' |
   'cancel' — set per-device by the parent test, defaulting to 'theirs'
   (accept the other inspector's version), which is the modal's own default
   emphasis. Every invocation is recorded and reported so tests can assert on
   WHAT conflicted, not just the outcome. */
let conflictPolicy = 'theirs';
const conflictLog = [];
SyncEngine.onConflict = function (conflicts, mergeResult) {
  conflictLog.push({ n: (conflicts || []).length, paths: (conflicts || []).map(c => c.path) });
  if (conflictPolicy === 'cancel') return null;   // user closed the modal
  const res = (conflicts || []).map(c => ({ path: c.path, chosen: conflictPolicy }));
  return { merged: applyResolutions(mergeResult, res) };
};
SyncEngine.onSilentMerge = function () { /* toast in the real app; nothing to decide */ };
/* S666 — the engine narrates its own pull/push decisions through onDiag; that
   is the channel to watch, not guesses. To a FILE when DIAG_FILE is set —
   console forwarding proved heavy enough to close the very race being hunted
   (22 clean VERBOSE runs vs ~1-in-10 failures without) — else stderr. */
import fs from 'fs';
const DIAGF = process.env.DIAG_FILE || '';
try {
  SyncEngine.onDiag = (ev, d) => {
    const line = '[' + DEV + '] ' + ev + ' ' + JSON.stringify(d) + '\n';
    if (DIAGF) { try { fs.appendFileSync(DIAGF, line); } catch (_) {} }
    else process.stderr.write(line);
  };
} catch (_) {}

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
    } else if (m.cmd === 'net') {
      /* S666 hunt — this device's cloud traffic so far */
      send({ id: m.id, ok: true, net: netTally });
    } else if (m.cmd === 'policy') {
      /* S666 — set this device's conflict answer: 'theirs' | 'mine' | 'cancel' */
      conflictPolicy = m.value || 'theirs';
      send({ id: m.id, ok: true, policy: conflictPolicy });
    } else if (m.cmd === 'conflicts') {
      /* S666 — what did THIS device's conflict modal see, and how often */
      send({ id: m.id, ok: true, log: conflictLog });
    } else if (m.cmd === 'offline') { online = false; send({ id: m.id, ok: true }); }
    else if (m.cmd === 'online')  { online = true;  send({ id: m.id, ok: true }); }
    else if (m.cmd === 'exit')    { send({ id: m.id, ok: true }); process.exit(0); }
    else send({ id: m.id, ok: false, err: 'unknown cmd' });
  } catch (e) {
    send({ id: m.id, ok: false, err: String((e && e.message) || e) });
  }
}
