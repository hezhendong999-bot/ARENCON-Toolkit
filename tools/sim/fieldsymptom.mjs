/* ═══════════════════════════════════════════════════════════════════════════
 * fieldsymptom.mjs — S622: THE HARNESS THAT REPLAYS MARK'S DESK, NOT A MECHANISM.
 *
 * Three consecutive scalar fixes (S616/S620/S621) shipped with every harness
 * green and failed on Mark's devices. The S622 rule: no fix is claimed without
 * a test that fails first ON THE FIELD SYMPTOM. This file IS those symptoms:
 *
 *   T1  "Quick succession, all online" (Mark, 05 Aug, Test 1):
 *       device A saves 15; THIS device is mid-typing 22 when the pull lands.
 *       The 22 must survive the pull, and — the decisive wire assertion — the
 *       22 must reach the cloud carrying an entry stamp NEWER than the 15's,
 *       or every other device will lawfully discard it. On S621 live code the
 *       pull overwrites this device's stamp ledger with the merged document,
 *       so the 22 ships wearing the 15's stamp (or 0) and loses everywhere:
 *       that is the exact production of "the FIRST entry propagated".
 *
 *   T2  "Offline, later edit" (Mark, 05 Aug, Test 2 — the lost 35):
 *       agreed at 10; this device goes offline and types 35 (stamped at edit
 *       time, T35); meanwhile device A types 20 (T20 < T35). On reconnect the
 *       35 must win the pull AND reach the cloud still wearing T35. On S621
 *       live code the pull-merge dresses the 35 in the 20's stamp; the 35 then
 *       loses the arbitration on every other device — the data-loss direction
 *       Mark proved on-device.
 *
 *   N1  A genuinely newer STAMPED clear still propagates (doctrine I-2 both
 *       directions — the permanent negative control).
 *   N2  An agreeing pair never re-arms the push (no idle-tick storms).
 *   N3  No fabrication: the stamp that reaches the cloud is the EDIT moment,
 *       never the merge/flush moment (within 250 ms of the keystroke).
 *   N4  The recorder tells the truth: a contested pull on a device whose
 *       ledger holds a stamp must log localTs > 0 (the S619 recorder read the
 *       screen state, which never carries stamps — its "localTs:0" rows sent
 *       three sessions chasing a value that was never really unstamped).
 *
 * Run: SIM_TARGET=fix|live node tools/sim/fieldsymptom.mjs
 * Exit: fix → 0 all-pass / 1 any-fail;  live → 0 on expected FAIL / 9 if live
 *       unexpectedly passes (same convention as offlineflush.mjs).
 * ═════════════════════════════════════════════════════════════════════════*/
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const TARGET = process.env.SIM_TARGET === 'live' ? 'live' : 'fix';
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const LIVE  = process.env.SIM_LIVE || path.resolve(REPO, '../live');
const ROOT  = TARGET === 'fix' ? REPO : LIVE;
const ROW = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

const jr = b => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/' });
const w = dom.window; global.window = w; global.document = w.document;
let online = true;
Object.defineProperty(w.navigator, 'onLine', { get: () => online, configurable: true });
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w; global.CustomEvent = w.CustomEvent; global.Event = w.Event;
global.Blob = w.Blob; global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory(); global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;

const cloud = { data: {}, updatedAt: '2026-08-06T04:00:00Z' };
let patches = 0;
const diagRows = [];                                   // captured sync_diag POSTs (N4)
global.fetch = w.fetch = function (url, opts) {
  url = String(url); const m = ((opts && opts.method) || 'GET').toUpperCase();
  if (!online) return Promise.reject(new Error('Failed to fetch'));
  if (url.includes('/auth/v1/user')) return jr({ id: 'u' });
  if (url.includes('/rest/v1/sync_diag')) {
    if (m === 'POST') { try { diagRows.push(JSON.parse(opts.body)); } catch (_) {} }
    return jr([{}]);
  }
  if (url.includes('/rest/v1/projects')) return jr([{ id: 'p1' }]);
  if (url.includes('/rest/v1/tool_data')) {
    if (m === 'GET' && url.includes('select=updated_at')) return jr([{ updated_at: cloud.updatedAt }]);
    if (m === 'GET') return jr([{ id: ROW, project_id: 'p1', tool_key: 'diesel', instance_number: 1, data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
    if (m === 'PATCH') {
      /* The REAL cloud enforces If-Match: two devices saving in quick
         succession ALWAYS collide into the 412 reconciliation door. The
         first version of this harness accepted colliding saves silently
         and the field failure could not reproduce — the failures live
         behind the collision. */
      const im = (opts.headers && (opts.headers['If-Match'] || opts.headers['if-match'])) || null;
      if (im && String(im).replace(/"/g, '') !== cloud.updatedAt) {
        return Promise.resolve({ ok: false, status: 412, headers: { get: () => null }, json: () => Promise.resolve({}), text: () => Promise.resolve('412') });
      }
      patches++;
      try { cloud.data = JSON.parse(opts.body).data || cloud.data; } catch (_) {}
      cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString();
      return jr([{ id: ROW, updated_at: cloud.updatedAt }]);
    }
  }
  return jr([]);
};
w.localStorage.setItem('sb-access-token', 'tok'); w.localStorage.setItem('sb-refresh-token', 'ref');
w.localStorage.setItem('arencon-device-id', 'sim-fs'); global.DIESEL_BUILD = w.DIESEL_BUILD = 'SIM';

let screen = {};
w._collectCloudState = () => JSON.parse(JSON.stringify(screen));
w._applyLoadedState = j => { screen = JSON.parse(j); };
w._mergeCloudLocal = c => c; w._stateHasContent = () => true;

await import(pathToFileURL(path.join(ROOT, 'diesel-sync.js')).href);
const CS = w.CloudSync;
await CS.init({ toolKey: 'diesel', projectId: 'p1', instanceId: ROW });
CS.startAutoSave(w._collectCloudState, 1e9);
await new Promise(r => setTimeout(r, 60));
const beat = async () => { await CS.heartbeatTick(); await new Promise(r => setTimeout(r, 150)); };
const cloudBump = () => { cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString(); };
const rootStamp = () => ((cloud.data && cloud.data._fts && cloud.data._fts._root) || {}).npshPsi || 0;

let pass = 0, fail = 0; const lines = [];
function chk(tag, ok, d) { (ok ? pass++ : fail++); lines.push(`  ${ok ? 'PASS' : 'FAIL'}  ${tag}  ${d || ''}`); }

/* ═══ T1 — QUICK SUCCESSION, ALL ONLINE ════════════════════════════════════ */
const T10 = Date.now() - 3600e3;                       // both sides agreed at 10, an hour ago
screen = { npshPsi: '10' };
cloud.data = { npshPsi: '10', _fts: { _root: { npshPsi: T10 } } };
cloudBump(); await beat();                              // baseline pull — ledger now holds 10@T10

console.log('─── PHASE T1 mid-typing ───');
const T15 = Date.now() - 5000;                          // device A saved 15, five seconds ago
cloud.data = { npshPsi: '15', _fts: { _root: { npshPsi: T15 } } };
cloudBump();
screen.npshPsi = '22';                                  // Mark is MID-TYPING when the pull lands
await beat();
chk('T1a  mid-typing edit survives the pull            ', screen.npshPsi === '22', `screen=${screen.npshPsi}`);

const tSave1 = Date.now();
await CS.save(JSON.stringify(w._collectCloudState()));  // the autosave fires
for (let i = 0; i < 4 && String((cloud.data || {}).npshPsi) !== '22'; i++) await beat();
chk('T1b  the 22 reaches the cloud                     ', String((cloud.data || {}).npshPsi) === '22', `cloud=${(cloud.data || {}).npshPsi}`);
/* THE DECISIVE WIRE ASSERTION — the exact production of "first entry wins":
   a 22 wearing the 15's stamp (or 0) is lawfully discarded by every device. */
chk('T1c  ...wearing a stamp NEWER than the 15\'s       ', rootStamp() > T15, `stamp=${rootStamp()} vs T15=${T15}`);

cloud.data = { npshPsi: '15', _fts: { _root: { npshPsi: T15 } } };  // A pushes its stale 15 once more
cloudBump(); await beat();
chk('T1d  a re-arriving older 15 cannot overwrite it   ', screen.npshPsi === '22', `screen=${screen.npshPsi}`);

/* ═══ T2 — OFFLINE, LATER EDIT (the lost 35) ═══════════════════════════════ */
screen = { npshPsi: '10' };
cloud.data = { npshPsi: '10', _fts: { _root: { npshPsi: T10 } } };
cloudBump(); await beat();                              // re-baseline at 10

console.log('─── PHASE T2 offline ───');
online = false;
const tEdit = Date.now();
screen.npshPsi = '35';                                  // typed in airplane mode
await CS.save(JSON.stringify(w._collectCloudState()));  // stamped at EDIT time (S617)
await new Promise(r => setTimeout(r, 400));             // dwell: flush-time stamps are now ≥400 ms late

const T20 = tEdit - 120000;                             // device A typed 20 BEFORE our 35
cloud.data = { npshPsi: '20', _fts: { _root: { npshPsi: T20 } } };
cloudBump();

online = true;
for (let i = 0; i < 5 && String((cloud.data || {}).npshPsi) !== '35'; i++) await beat();
chk('T2a  the 35 survives on this device               ', screen.npshPsi === '35', `screen=${screen.npshPsi}`);
chk('T2b  the 35 reaches the cloud                     ', String((cloud.data || {}).npshPsi) === '35', `cloud=${(cloud.data || {}).npshPsi}`);
const s2 = rootStamp();
chk('T2c  ...wearing ITS OWN edit-time stamp, not 20\'s ', s2 > T20 && s2 >= tEdit && (s2 - tEdit) < 250, `stamp=${s2} tEdit=${tEdit} Δ=${s2 - tEdit}ms`);

console.log('─── PHASE T2d re-assert 20 ───');
cloud.data = { npshPsi: '20', _fts: { _root: { npshPsi: T20 } } };  // A re-asserts its 20
cloudBump(); await beat();
chk('T2d  the returning older 20 cannot destroy the 35 ', screen.npshPsi === '35', `screen=${screen.npshPsi}`);

/* ═══ N4 — THE RECORDER TELLS THE TRUTH (checked here: T2d was contested and
       this device's ledger held a real stamp for the 35) ═══════════════════ */
const contestedNpsh = [];
diagRows.forEach(rw => {
  const det = rw && rw.detail; const c = det && det.contested;
  if (Array.isArray(c)) c.forEach(x => { if (x.field === 'npshPsi') contestedNpsh.push(x); });
});
const lastC = contestedNpsh[contestedNpsh.length - 1] || null;
chk('N4   recorder reports a real local stamp          ', !!lastC && (lastC.localTs || 0) > 0, lastC ? `localTs=${lastC.localTs}` : 'no contested row captured');

/* ═══ N1 — A GENUINELY NEWER STAMPED CLEAR STILL PROPAGATES ════════════════ */
await beat();                                           // settle
console.log('─── PHASE N1 clear ───');
const TCLR = Date.now() + 1000;                         // strictly newer than everything above
cloud.data = { npshPsi: '', _fts: { _root: { npshPsi: TCLR } } };
cloudBump(); await beat();
chk('N1   a newer STAMPED clear still propagates       ', screen.npshPsi === '', `screen="${screen.npshPsi}"`);

/* ═══ N2 — AN AGREEING PAIR NEVER RE-ARMS ══════════════════════════════════ */
console.log('─── PHASE N2 agree ───');
screen = { npshPsi: '40' };
cloud.data = { npshPsi: '40', _fts: { _root: { npshPsi: TCLR + 500 } } };
cloudBump();
/* drain: earlier phases legitimately leave re-armed work in flight; N2
   measures steady state, so beat until two consecutive quiet beats. */
for (let q = 0; q < 8; q++) { const p0 = patches; await beat(); if (patches === p0) { const p1 = patches; await beat(); if (patches === p1) break; } }
const before = patches;
await beat(); await beat();
chk('N2   an agreeing pair never re-arms the push      ', patches === before, `extra pushes=${patches - before}`);

console.log('\nfieldsymptom — Mark\'s Test 1 + Test 2, replayed against the real facade+engine');
lines.forEach(l => console.log(l));
console.log(`\n${pass} passed, ${fail} failed on ${TARGET.toUpperCase()}\n`);
process.exit(TARGET === 'live' ? (fail > 0 ? 0 : 9) : (fail > 0 ? 1 : 0));
