/* ============================================================================
 * stalemate.mjs — reproduces tonight's field telemetry exactly.
 *
 * TEST 1 (the revert): the host merge _mergeCloudLocal (part06d.js) takes any
 * non-empty local field over the cloud value with NO stamp comparison. Cloud
 * 150/newer-stamp + screen 200/older-stamp must merge to 150. Live: yields 200
 * — the phone's 01:00:48 "applied" telemetry row, reproduced.
 *
 * TEST 2 (the deadlock): a device whose pull correctly KEEPS its newer local
 * value never pushes it, because the push dedupe compares against what THIS
 * device last sent, not against what the cloud now holds. Cloud stays wrong
 * forever. Live: zero re-push. Fixed: the pull re-arms the push.
 *
 * RULE: FAIL on the live build ($SIM_LIVE), PASS on this repo.
 * ==========================================================================*/
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import fs from 'fs';
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
const TS_OLD = 1785710537327, TS_NEW = 1785719978889;
const results = [];
const check = (n, p, d) => { results.push(p); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

console.log(`\n=== STALEMATE (${TARGET.toUpperCase()} code) ===\n`);

/* ── TEST 1: extract the real _mergeCloudLocal and feed it tonight's rows ── */
{
  const src = fs.readFileSync(path.join(ROOT, 'diesel-app/js/part06d.js'), 'utf8');
  const start = src.indexOf('function _mergeCloudLocal');
  let depth = 0, end = start;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  const merge = new Function('return (' + src.slice(start, end) + ')')();
  const cloud = { stdData: [{ pct: '100%', discharge: '150', _ts: TS_NEW }] };   // another inspector, newer entry
  const local = { stdData: [{ pct: '100%', discharge: '200', _ts: TS_OLD }] };   // this screen, older entry
  const out = merge(JSON.parse(JSON.stringify(cloud)), local);
  const got = out.stdData[0];
  check('host merge honours the newer entry stamp (150/new beats 200/old)',
        String(got.discharge) === '150' && got._ts === TS_NEW,
        `merged to ${got.discharge}/${got._ts === TS_NEW ? 'new-ts' : 'OLD-ts'}`);
  /* and the mirror direction must still protect a genuinely newer local entry */
  const out2 = merge({ stdData: [{ pct: '100%', discharge: '150', _ts: TS_OLD }] },
                     { stdData: [{ pct: '100%', discharge: '200', _ts: TS_NEW }] });
  check('host merge still keeps a local entry that is genuinely newer',
        String(out2.stdData[0].discharge) === '200', `merged to ${out2.stdData[0].discharge}`);
}

/* ── TEST 2: full facade+engine — the deadlocked device must re-push ─────── */
{
  const ROW = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';
  const cloud = { data: { stdData: [{ pct: '100%', discharge: '150', _ts: TS_NEW }] },
                  updatedAt: '2026-08-04T01:00:00Z' };
  let patches = 0, lastPatchBody = null;
  const jr = b => Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
    json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
  global.location = w.location; global.self = w; global.CustomEvent = w.CustomEvent;
  global.Event = w.Event; global.Blob = w.Blob; global.localStorage = w.localStorage;
  global.indexedDB = w.indexedDB = new FDBFactory();
  global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;
  global.fetch = w.fetch = function (url, opts) {
    url = String(url); const m = ((opts && opts.method) || 'GET').toUpperCase();
    if (url.includes('/auth/v1/user')) return jr({ id: 'u-mark' });
    if (url.includes('/rest/v1/sync_diag')) return jr([{}]);
    if (url.includes('/rest/v1/projects')) return jr([{ id: 'p1', project_number: '1490.04' }]);
    if (url.includes('/rest/v1/tool_data')) {
      if (m === 'GET' && url.includes('select=updated_at')) return jr([{ updated_at: cloud.updatedAt }]);
      if (m === 'GET') return jr([{ id: ROW, project_id: 'p1', tool_key: 'diesel', instance_number: 1,
                                    data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
      if (m === 'PATCH') { patches++; try { lastPatchBody = JSON.parse(opts.body); } catch (_) {}
        cloud.data = (lastPatchBody && lastPatchBody.data) || cloud.data;
        cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString();
        return jr([{ id: ROW, updated_at: cloud.updatedAt }]); }
    }
    return jr([]);
  };
  w.localStorage.setItem('sb-access-token', 'tok');
  w.localStorage.setItem('sb-refresh-token', 'ref');
  w.localStorage.setItem('arencon-device-id', 'sim-pc');
  global.DIESEL_BUILD = w.DIESEL_BUILD = 'SIM';

  /* this device's screen holds the NEWER entry, matching the PC tonight */
  const screen = { stdData: [{ pct: '100%', discharge: '150', _ts: TS_NEW }] };
  w._collectCloudState = () => JSON.parse(JSON.stringify(screen));
  const collect = w._collectCloudState;

  await import(pathToFileURL(path.join(ROOT, 'diesel-sync.js')).href);
  const CS = w.CloudSync;
  await CS.init({ toolKey: 'diesel', projectId: 'p1', instanceId: ROW });
  CS.startAutoSave(collect, 1e9);
  await new Promise(r => setTimeout(r, 80));

  /* step 1: device pushes its 150 — cloud confirms, dedupe now holds it */
  await CS.save(JSON.stringify(collect()));
  const afterFirst = patches;

  /* step 2: the phone clobbers the cloud with 200/OLD-stamp (tonight, 01:01:43) */
  cloud.data = { stdData: [{ pct: '100%', discharge: '200', _ts: TS_OLD }] };
  cloud.updatedAt = '2026-08-04T01:01:43Z';

  /* step 3: heartbeat pulls; the stamp merge correctly keeps local 150 */
  await CS.heartbeatTick();
  await new Promise(r => setTimeout(r, 120));

  /* step 4: autosave fires — on live code the dedupe says "already pushed
     this content" and the cloud keeps the wrong 200 forever */
  await CS.save(JSON.stringify(collect()));
  await new Promise(r => setTimeout(r, 120));
  await CS.save(JSON.stringify(collect()));
  await new Promise(r => setTimeout(r, 120));

  const cloudDisch = cloud.data && cloud.data.stdData && cloud.data.stdData[0] && cloud.data.stdData[0].discharge;
  check('the winning value is pushed back — the cloud does not keep the loser forever',
        patches > afterFirst && String(cloudDisch) === '150',
        `re-pushes: ${patches - afterFirst}, cloud now holds: ${cloudDisch}`);
}

const failed = results.filter(p => !p).length;
console.log(`\n${results.length - failed}/${results.length} passed on ${TARGET.toUpperCase()} code\n`);
process.exit(TARGET === 'live' ? (failed ? 0 : 9) : (failed ? 1 : 0));
