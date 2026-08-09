/* killswitch.mjs — THE APP IS KILLED BEFORE IT CAN SAY GOODBYE (Lane C)
 *
 * MARK, 09 AUG, ON THE IPHONE: type a value in airplane mode, close the app
 * IMMEDIATELY, reopen — the old number is back. Wait ~10 seconds before closing
 * and it holds. The same test on the Android tablet holds either way.
 *
 * THE SHAPE OF IT. A typed value reaches the device's own saved report ~0.7s
 * after typing. Its ENTRY TIME was recorded on a different, slower schedule:
 * the 5.5s cloud-push debounce, or the best-effort flush fired at
 * visibilitychange/pagehide. Android runs that flush before freezing the page;
 * iOS very often kills the process instead. So on the iPhone the value landed
 * and its time did not — and per S634 a value with no recorded time loses to
 * the cloud's timed copy at reopen, exactly as designed.
 *
 * WHAT THIS PROBE DOES. It models a KILL: it fires no pagehide, no
 * visibilitychange, no flush, and calls no save on the sync layer. It types
 * into a real input element and then simply stops, the way a process that has
 * been terminated stops. Then it asks the one question that decides the case:
 * IS THE ENTRY TIME ALREADY RECORDED?
 *
 * Any harness that ends its offline arm with a flush, a save() call or a
 * lifecycle event is testing the case that already worked. The kill is the
 * case that fails, so the kill is what this refuses to soften.
 *
 * FAIL-FIRST: checks 1 and 2 FAIL on S634.
 *
 * Run: node tools/sim/killswitch.mjs            (SIM_TARGET=fix|live)
 */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';

const TARGET = process.env.SIM_TARGET === 'fix' ? 'fix' : 'live';
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const LIVE  = process.env.SIM_LIVE || path.resolve(REPO, '../live');
const ROOT  = TARGET === 'fix' ? REPO : LIVE;
const ROW   = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

const jr = b => Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
  json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });

const dom = new JSDOM('<!doctype html><html><body>' +
  '<input id="npsh" type="number">' +
  '<div class="dlg-backdrop"><input id="in-dialog" type="text"></div>' +
  '</body></html>', { url: 'https://arencon.app/' });
const w = dom.window; global.window = w; global.document = w.document;
let online = true;
Object.defineProperty(w.navigator, 'onLine', { get: () => online, configurable: true });
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w; global.CustomEvent = w.CustomEvent; global.Event = w.Event;
global.Blob = w.Blob; global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory(); global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;

const cloud = { data: { npshPsi: '200', stdData: [{ pct: '100%', discharge: '150' }] },
                updatedAt: '2026-08-09T03:00:00Z' };
let patches = 0, lastPatchBody = null;
global.fetch = w.fetch = function (url, opts) {
  url = String(url); const m = ((opts && opts.method) || 'GET').toUpperCase();
  if (!online) return Promise.reject(new Error('Failed to fetch'));
  if (url.includes('/auth/v1/user')) return jr({ id: 'u' });
  if (url.includes('/rest/v1/sync_diag')) return jr([{}]);
  if (url.includes('/rest/v1/projects')) return jr([{ id: 'p1' }]);
  if (url.includes('/rest/v1/tool_data')) {
    if (m === 'GET' && url.includes('select=updated_at')) return jr([{ updated_at: cloud.updatedAt }]);
    if (m === 'GET') return jr([{ id: ROW, project_id: 'p1', tool_key: 'diesel', instance_number: 1,
                                  data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
    if (m === 'PATCH') { patches++; try { lastPatchBody = JSON.parse(opts.body); cloud.data = lastPatchBody.data || cloud.data; } catch (_) {}
      cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString();
      return jr([{ id: ROW, updated_at: cloud.updatedAt }]); }
  }
  return jr([]);
};
w.localStorage.setItem('sb-access-token', 'tok');
w.localStorage.setItem('sb-refresh-token', 'ref');
w.localStorage.setItem('arencon-device-id', 'sim-iphone');
global.DIESEL_BUILD = w.DIESEL_BUILD = 'SIM';

/* The screen. collectState-shaped: the typed value, and NO entry-time table —
   the way the running tool actually collects (see bootstamp.mjs check 1). */
const screen = { npshPsi: '200', stdData: [{ pct: '100%', discharge: '150' }] };
w._collectCloudState = () => JSON.parse(JSON.stringify(screen));

console.log('\n═══ KILL-SWITCH PROBE ═══');
console.log('target: ' + TARGET + '  (' + ROOT + ')\n');

await import(pathToFileURL(path.join(ROOT, 'diesel-sync.js')).href);
const CS = w.CloudSync;
if (!CS) { console.error('SUBJECT MISSING: CloudSync did not load from ' + ROOT); process.exit(2); }
await CS.init({ toolKey: 'diesel', projectId: 'p1', instanceId: ROW });
CS.startAutoSave(w._collectCloudState, 1e9);          // no timer-driven saves
await CS.load();                                       // boot pull — the real baseline
await new Promise(r => setTimeout(r, 80));
if (typeof w.__arcLedgerPeek !== 'function') { console.error('SUBJECT MISSING: __arcLedgerPeek'); process.exit(2); }

/* ── AIRPLANE MODE, ONE EDIT, THEN THE PROCESS DIES ───────────────────────
   Type into a real element and dispatch the real event. Then wait — and do
   NOTHING else. No save(), no flush, no pagehide, no visibilitychange. This
   is the kill.                                                            */
online = false;
const tEdit = Date.now();
screen.npshPsi = '77';
const el = w.document.getElementById('npsh');
el.value = '77';
el.dispatchEvent(new w.Event('input', { bubbles: true }));

await new Promise(r => setTimeout(r, 900));   // the app survives 0.9s, then is killed

console.log('1 THE KILL        value typed offline, app killed 0.9s later — no flush of any kind');
{
  const peek = w.__arcLedgerPeek();
  const held = peek && peek.npshPsi;
  const ts = peek && peek.root && peek.root.npshPsi;
  check('the entry time is recorded before anything close-related runs',
        !!ts && ts >= tEdit - 50,
        'ledger stamp for npshPsi = ' + (ts || 'NONE') + (ts ? '' : ' — nothing pinned the moment, so at reopen this edit has no time to argue with'));
  check('and it is recorded against the value actually on screen',
        held === '77',
        'ledger holds npshPsi=' + JSON.stringify(held) + ', screen holds "77". ' +
        'S634 lends the ledger\'s time ONLY to the value the ledger holds — a mismatch loses the edit.');
}

/* ── 2 — NO NETWORK WAS TOUCHED ──────────────────────────────────────────
   Stamping is a local act. If it ever reaches for the network it becomes a
   battery and data-plan cost on every keystroke pause in a pump room.     */
console.log('\n2 LOCAL-ONLY      pinning the time must never touch the network');
check('no cloud write was attempted by the stamping', patches === 0,
      'PATCH count = ' + patches + ' (want 0 — the device is offline and stamping is local)');

/* ── 3 — THE STAMP MUST NOT BE RE-MINTED WHEN IT FINALLY SENDS ───────────
   The whole point of an entry time is that it survives to the merge. If the
   online flush re-mints at reconnect time, an older offline entry wears
   manufactured recency and beats values other people typed later (the
   inverse loss, S622c).                                                    */
console.log('\n3 STAMP-SURVIVES  the eventual online push carries the edit-time stamp, not a fresh one');
{
  const pinned = (w.__arcLedgerPeek() || {}).root || {};
  const pinnedTs = pinned.npshPsi || 0;
  online = true;
  await CS.save(JSON.stringify(w._collectCloudState()));
  await new Promise(r => setTimeout(r, 120));
  let sentTs = null;
  try { sentTs = lastPatchBody && lastPatchBody.data && lastPatchBody.data._fts &&
                 lastPatchBody.data._fts._root && lastPatchBody.data._fts._root.npshPsi; } catch (_) {}
  check('the pushed stamp equals the stamp pinned at edit time',
        !!pinnedTs && sentTs === pinnedTs,
        'pinned=' + pinnedTs + ' pushed=' + sentTs +
        (pinnedTs && sentTs && sentTs !== pinnedTs ? ' — re-minted at flush time, which is the S617 fault' : ''));
}

/* ── 4 — NEGATIVE CONTROL: DIALOG AND SEARCH BOXES ARE NOT REPORT DATA ─── */
console.log('\n4 NOT-REPORT-DATA typing in a dialog must not stamp anything');
{
  const before = JSON.stringify(w.__arcLedgerPeek());
  const d = w.document.getElementById('in-dialog');
  d.value = 'hello';
  d.dispatchEvent(new w.Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 900));
  check('a dialog keystroke leaves the ledger untouched',
        JSON.stringify(w.__arcLedgerPeek()) === before,
        'the ledger changed after typing inside .dlg-backdrop');
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('\nThe value is on disk within a second of typing; its entry time is not.');
  console.log('Nothing that runs at close time can be relied on — iOS kills the');
  console.log('process outright. Pin the time on the SAME trigger as the value save,');
  console.log('on a shorter debounce, so there is nothing left to rescue at close.\n');
}
process.exit(failed.length ? 1 : 0);
