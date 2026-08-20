/* diagrecorder.mjs — S619 teeth for the contested-field recorder.
   WHY THIS EXISTS: the previous recorder wrote 25 identical rows across three
   devices during a day of reproducible failures, because it read one
   hard-coded field and only ran at boot. Nothing was watching the watcher.
   While building the replacement I referenced a spec accessor that does not
   exist — the surrounding try/catch would have swallowed the error and the
   recorder would have logged NOTHING, silently, forever. This file is the
   gate that stops that shipping. */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_HERE, '../..');
const TARGET = process.env.SIM_TARGET === 'fix' ? 'fix' : 'live';
const ROOT = TARGET === 'fix' ? REPO : (process.env.SIM_LIVE || path.resolve(REPO, '../live'));
const ROW = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';
const T_OLD = 1785700000000, T_NEW = 1785790000000;

const jr = b => Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
  json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://arencon.app/' });
const w = dom.window; global.window = w; global.document = w.document;
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w; global.CustomEvent = w.CustomEvent; global.Event = w.Event;
global.Blob = w.Blob; global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory(); global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;

/* Cloud holds a NEWER npsh than the screen — a genuine disagreement. */
const cloud = { data: { npshPsi: '50', _fts: { _root: { npshPsi: T_NEW } } },
                updatedAt: '2026-08-05T03:00:00Z' };
const diagRows = [];
global.fetch = w.fetch = function (url, opts) {
  url = String(url); const m = ((opts && opts.method) || 'GET').toUpperCase();
  if (url.includes('/auth/v1/user')) return jr({ id: 'u' });
  if (url.includes('/rest/v1/sync_diag')) {
    if (m === 'POST') { try { diagRows.push(JSON.parse(opts.body)); } catch (_) {} }
    return jr([{}]);
  }
  if (url.includes('/rest/v1/projects')) return jr([{ id: 'p1' }]);
  if (url.includes('/rest/v1/tool_data')) {
    if (m === 'GET' && url.includes('select=updated_at')) return jr([{ updated_at: cloud.updatedAt }]);
    if (m === 'GET') return jr([{ id: ROW, project_id: 'p1', tool_key: 'diesel', instance_number: 1,
                                  data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
    if (m === 'PATCH') { cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString();
                         return jr([{ id: ROW, updated_at: cloud.updatedAt }]); }
  }
  return jr([]);
};
w.localStorage.setItem('sb-access-token', 'tok');
w.localStorage.setItem('arencon-device-id', 'sim-and');
global.DIESEL_BUILD = w.DIESEL_BUILD = 'SIM';

/* Screen holds an OLDER npsh. The merge should take the cloud's newer value,
   and the recorder must SAY SO, naming the field. */
const screen = { npshPsi: '30', _fts: { _root: { npshPsi: T_OLD } } };
w._collectCloudState = () => JSON.parse(JSON.stringify(screen));
w._applyLoadedState = () => {};
w._mergeCloudLocal = c => c;
w._stateHasContent = () => true;

await import(pathToFileURL(path.join(ROOT, 'diesel-sync.js')).href);
const CS = w.CloudSync;
await CS.init({ toolKey: 'diesel', projectId: 'p1', instanceId: ROW });
try { if (CS.bootApplyComplete) CS.bootApplyComplete(null); } catch(_){}   // S673: model the shipped host's boot announcement
CS.startAutoSave(w._collectCloudState, 1e9);
await new Promise(r => setTimeout(r, 60));
await CS.heartbeatTick();
await new Promise(r => setTimeout(r, 200));

let pass = 0, fail = 0;
const chk = (n, c, g) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : `  → ${g}`)); c ? pass++ : fail++; };

const pulls = diagRows.filter(r => (r.event || r.Event) === 'pull_decision');
chk('a contested pull is recorded at all', pulls.length > 0, `${diagRows.length} diag rows, 0 pull_decision`);

const contested = pulls.length ? (pulls[0].detail && pulls[0].detail.contested) || [] : [];
chk('the contested field is NAMED', contested.some(c => c.field === 'npshPsi'),
    JSON.stringify(contested).slice(0, 160));

const npsh = contested.filter(c => c.field === 'npshPsi')[0] || {};
chk('both candidate values are captured', npsh.cloud === '50' && npsh.local === '30',
    `cloud=${npsh.cloud} local=${npsh.local}`);
chk('both entry stamps are captured', npsh.cloudTs === T_NEW && npsh.localTs === T_OLD,
    `cloudTs=${npsh.cloudTs} localTs=${npsh.localTs}`);
chk('the winner is stated', npsh.won === 'cloud', `won=${npsh.won}`);
chk('older-won flag is correct (newer won here)', npsh.olderWon === false, `olderWon=${npsh.olderWon}`);

console.log(`\n${pass} passed, ${fail} failed on ${TARGET.toUpperCase()}\n`);
process.exit(TARGET === 'live' ? 0 : (fail ? 1 : 0));
