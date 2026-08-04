/* ============================================================================
 * tickhealth.mjs — LANE C, target 1.
 *
 * Runs the REAL live diesel-sync.js facade over the REAL shared engine in a
 * jsdom page with a scriptable Supabase. Three tests, each aimed at one of the
 * four faults that produce the identical "save: just now / pull: never" panel.
 *
 * RULE (S583-S601 hard lesson): each test must FAIL on live HEAD code and PASS
 * on the fix. Run with SIM_TARGET=live first and confirm the failures.
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

const ROW_ID = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';
const PROJECT = 'p-1490-04';

/* ── scriptable cloud ──────────────────────────────────────────────────── */
const cloud = {
  updatedAt: '2026-08-03T20:00:00Z',
  hangProbe: false,       // fault 3: request that never settles
  failProbe: false,       // fault 2: probe errors out
  probeCalls: 0,
  pullCalls: 0
};

function jsonRes(body, status = 200) {
  return Promise.resolve({
    ok: status < 300, status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  });
}

function makeFetch() {
  return function (url, opts) {
    url = String(url);
    const method = ((opts && opts.method) || 'GET').toUpperCase();

    if (url.includes('/auth/v1/user')) return jsonRes({ id: 'u-mark', email: 'mhe@arencon.com' });
    if (url.includes('/auth/v1/token')) return jsonRes({ access_token: 'tok', refresh_token: 'ref' });

    if (url.includes('/rest/v1/tool_data')) {
      if (method === 'GET' && url.includes('select=updated_at')) {
        cloud.probeCalls++;
        if (cloud.hangProbe) return new Promise(() => {});          // never settles
        if (cloud.failProbe) return Promise.reject(new Error('Failed to fetch'));
        return jsonRes([{ updated_at: cloud.updatedAt }]);
      }
      if (method === 'GET') {
        cloud.pullCalls++;
        return jsonRes([{ id: ROW_ID, project_id: PROJECT, tool_key: 'diesel', instance_number: 1,
                          data: { stdData: [] }, updated_at: cloud.updatedAt, status: 'draft' }]);
      }
      if (method === 'PATCH' || method === 'POST') {
        cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString();
        return jsonRes([{ id: ROW_ID, updated_at: cloud.updatedAt }]);
      }
    }
    if (url.includes('/rest/v1/sync_diag')) return jsonRes([{}]);
    if (url.includes('/rest/v1/projects')) return jsonRes([{ id: PROJECT, project_number: '1490.04' }]);
    return jsonRes([]);
  };
}

/* ── page ──────────────────────────────────────────────────────────────── */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/' });
const w = dom.window;
global.window = w; global.document = w.document;
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w; global.CustomEvent = w.CustomEvent;
global.Event = w.Event; global.Blob = w.Blob;
global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory();
global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;
w.indexedDB = global.indexedDB;
global.fetch = w.fetch = makeFetch();
w.localStorage.setItem('sb-access-token', 'tok');
w.localStorage.setItem('sb-refresh-token', 'ref');
w.localStorage.setItem('arencon-device-id', 'sim-harness');
global.DIESEL_BUILD = w.DIESEL_BUILD = 'SIM';

const state = { stdData: [{ pct: '100%', discharge: '200', _ts: Date.now() }] };
const collect = () => JSON.parse(JSON.stringify(state));

/* ── boot the facade ───────────────────────────────────────────────────── */
const mod = pathToFileURL(path.join(ROOT, 'diesel-sync.js')).href;
await import(mod);
const CS = w.CloudSync;
await CS.init({ toolKey: 'diesel', projectId: PROJECT, instanceId: ROW_ID });
CS.startAutoSave(collect, 1e9);          // huge interval: we drive ticks by hand
await new Promise(r => setTimeout(r, 50));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

console.log(`\n=== TICK HEALTH (${TARGET.toUpperCase()} code) ===\n`);

/* TEST 1 — a stalled request must not deafen the device forever.
   Fault 3. One request that hangs instead of failing leaves the busy flag
   raised; on live code every later tick exits at the front door for good. */
cloud.hangProbe = true;
CS.heartbeatTick();                       // deliberately not awaited: it hangs
await sleep(300);
cloud.hangProbe = false;
cloud.updatedAt = '2026-08-03T21:30:00Z'; // another inspector saved
const pullsBefore = cloud.pullCalls;
/* Beat for 40s of wall time — longer than the 20s network timeout and the 45s
   watchdog ceiling combined with the beat interval. Live code never recovers
   no matter how long we wait; that is the point. */
for (let i = 0; i < 40 && cloud.pullCalls === pullsBefore; i++) { CS.heartbeatTick(); await sleep(1200); }
check('a stalled cloud request does not deafen the device permanently',
      cloud.pullCalls > pullsBefore,
      `pulls after the stall: ${cloud.pullCalls - pullsBefore}`);

/* TEST 2 — a failed question must not be silently read as "nothing new".
   Fault 2. The probe swallows every error and returns null, which the tick
   treats exactly like an unchanged cloud: no pull, no telemetry, no trace. */
const diagRows = [];
const prevFetch = global.fetch;
global.fetch = w.fetch = function (url, opts) {
  if (String(url).includes('/rest/v1/sync_diag') && opts && opts.body) {
    try { diagRows.push(JSON.parse(opts.body)); } catch (_) {}
  }
  return prevFetch(url, opts);
};
cloud.failProbe = true;
await CS.heartbeatTick();
await sleep(200);
cloud.failProbe = false;
const sawFailure = JSON.stringify(diagRows).includes('probe');
check('a failed cloud check is reported, not swallowed', sawFailure,
      `telemetry rows written: ${diagRows.length}`);

/* TEST 3 — the gauge must distinguish "checked, nothing new" from "never checked".
   Fault 4. Live code only stamps the panel when something is received, so a
   perfectly healthy idle device reads identically to a dead one. */
const before = CS.getSyncDiag ? CS.getSyncDiag() : {};
await CS.heartbeatTick();                 // cloud unchanged since last pull
await sleep(200);
const after = CS.getSyncDiag ? CS.getSyncDiag() : {};
const hasCheckClock = typeof after.lastCheckAt === 'number' && after.lastCheckAt > 0 &&
                      after.lastCheckAt !== before.lastCheckAt;
check('the panel records a quiet check, not just a received change', hasCheckClock,
      `lastCheckAt=${after.lastCheckAt || 'absent'}`);

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed on ${TARGET.toUpperCase()} code\n`);
process.exit(TARGET === 'live' ? (failed > 0 ? 0 : 9) : (failed > 0 ? 1 : 0));
