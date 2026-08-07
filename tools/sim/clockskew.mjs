/* clockskew.mjs — THE SUB-SECOND STAMP INVERSION PROBE (Lane C, S623)
 *
 * WHAT THIS EXISTS TO PROVE
 * Mark, 07 Aug 21:19:41Z: two values typed about a second apart on two
 * different devices, and the EARLIER one won. sync_diag showed the two entry
 * stamps 79 ms apart with the cloud copy ahead — the engine arbitrated
 * lawfully on the stamps it was given, so the fault is upstream of the merge:
 * the stamps themselves were minted on disagreeing device clocks.
 *
 * WHY NO EXISTING HARNESS CATCHES IT
 * battle/matrix/converge devices share one wall clock, and the mock cloud's
 * If-Match token is a synthetic counter (+60 s per write), not a server clock.
 * Both properties are exactly what a real fleet lacks. This probe fixes both:
 * every device can be biased independently (CLOCK_SKEW_MS) and the mock server
 * stamps `updated_at` from its OWN wall clock, which is what Postgres does
 * (tool_data_updated_at BEFORE UPDATE → NEW.updated_at = now(), verified live
 * 07 Aug, microsecond resolution).
 *
 * THE FOUR CHECKS
 *   1 SKEW-INVERSION  the field symptom: fast-clocked device types FIRST,
 *                     honest device types 300 ms LATER — the later value must
 *                     win. Fails on S622m.
 *   2 HONEST-PAIR     two agreeing clocks: the later value must still win.
 *                     Guards the fix against injecting artificial skew — the
 *                     exact trap the S622i centring attempt fell into.
 *   3 NO-PHANTOM      with no real skew, the learned offset must stay 0.
 *                     A correction invented out of network latency is a new
 *                     bug wearing the old bug's clothes.
 *   4 GROSS-SKEW      +8 s must still be corrected (S622i regression guard).
 *
 * Run: node tools/sim/clockskew.mjs
 */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

/* ── mock Supabase — server clock is REAL wall time, as Postgres now() is ── */
let cloud = { data: {}, updatedAt: new Date().toISOString() };
let wire = [];                       // every accepted write: {at, val, stamp}
let patches = 0, rejects412 = 0;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = req.url || '';
    if (u.includes('/auth/v1/user')) return send(200, { id: 'u' });
    if (u.includes('/rest/v1/sync_diag')) return send(200, [{}]);
    if (u.includes('/rest/v1/projects')) return send(200, [{ id: 'p1' }]);
    if (u.includes('/rest/v1/tool_data')) {
      if (req.method === 'GET' && u.includes('select=updated_at')) return send(200, [{ updated_at: cloud.updatedAt }]);
      if (req.method === 'GET') return send(200, [{ id: ROW, project_id: 'p1', tool_key: 'diesel', instance_number: 1, data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
      if (req.method === 'PATCH') {
        const im = req.headers['if-match'];
        if (im && String(im).replace(/"/g, '') !== cloud.updatedAt) { rejects412++; return send(412, {}); }
        try {
          const nd = JSON.parse(body).data;
          if (nd) {
            cloud.data = nd; patches++;
            const r = (nd._fts && nd._fts._root) || {};
            /* arrival on the SERVER's clock — the only honest ruler here */
            wire.push({ at: Date.now(), val: nd.npshPsi, stamp: r.npshPsi || 0 });
          }
        } catch (_) {}
        /* the trigger: the SERVER decides updated_at, from the server's clock */
        cloud.updatedAt = new Date().toISOString();
        return send(200, [{ id: ROW, instance_number: 1, updated_at: cloud.updatedAt }]);
      }
    }
    return send(200, []);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

/* ── devices ──────────────────────────────────────────────────────────── */
const devices = {};
let msgId = 0;
function spawnDevice(name, skewMs) {
  const child = spawn(process.execPath, [path.join(HERE, 'battle_device.mjs')], {
    cwd: REPO,
    env: { ...process.env, DEV_ROOT: REPO, CLOUD_BASE: `http://127.0.0.1:${PORT}`,
           DEVICE_ID: name, DEV_BUILD: 'SIM', CLOCK_SKEW_MS: String(skewMs || 0) },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const pending = {};
  let buf = '';
  child.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch (_) { continue; }
      const p = pending[m.id]; if (p) { delete pending[m.id]; p(m); }
    }
  });
  child.stderr.on('data', d => { if (process.env.VERBOSE) process.stderr.write('[' + name + '] ' + d); });
  const dev = {
    name, child,
    call(cmd, extra) {
      const id = ++msgId;
      return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error(name + ' timeout on ' + cmd)), 20000);
        pending[id] = m => { clearTimeout(to); resolve(m); };
        child.stdin.write(JSON.stringify({ id, cmd, ...(extra || {}) }) + '\n');
      });
    }
  };
  devices[name] = dev;
  return dev;
}
const D = n => devices[n];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function bootPair(skewA, skewB) {
  cloud = { data: {}, updatedAt: new Date().toISOString() };
  patches = 0; rejects412 = 0;
  for (const n of Object.keys(devices)) { try { await devices[n].call('exit'); } catch (_) {} delete devices[n]; }
  spawnDevice('AD', skewA); spawnDevice('IP', skewB);
  await D('AD').call('init', { row: ROW });
  await D('IP').call('init', { row: ROW });
  /* Every real session opens with a cloud load — and that pull is where a
     device first hears the server's clock, before anyone can type. */
  await D('AD').call('load');
  await D('IP').call('load');
  /* Warm-up round trips. A device that has been open and syncing has already
     made write round trips; a device that never has cannot have learned
     anything, and testing the cold case would be testing the seed, not the
     clock. */
  await D('AD').call('set', { path: ['npshPsi'], value: '10' }); await D('AD').call('save');
  await D('AD').call('beat'); await D('IP').call('beat');
  await D('IP').call('set', { path: ['npshPsi'], value: '11' }); await D('IP').call('save');
  await D('AD').call('beat'); await D('IP').call('beat');
  await sleep(120);
}

/* first device types EARLY, second types LATER — the later value must win.
   The gap is MEASURED on the server's clock, not assumed: if harness latency
   ever pushes the real gap past the skew under test, the scenario stops being
   an inversion test and starts passing for the wrong reason. That is exactly
   how a check goes quietly toothless, so the probe asserts its own validity. */
async function race(first, firstVal, second, secondVal, gapMs) {
  await D(first).call('set', { path: ['npshPsi'], value: firstVal });
  const tFirst = Date.now();
  await D(first).call('save');
  await sleep(gapMs);
  await D(second).call('set', { path: ['npshPsi'], value: secondVal });
  const tSecond = Date.now();
  await D(second).call('save');
  lastGap = tSecond - tFirst;
  for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('IP').call('beat'); }
  await sleep(150);
  const ad = (await D('AD').call('get')).screen.npshPsi;
  const ip = (await D('IP').call('get')).screen.npshPsi;
  return { ad, ip, cloudVal: cloud.data && cloud.data.npshPsi };
}

let lastGap = 0;
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
}
/* A race only tests inversion while the skew exceeds the real gap between the
   two entries. Below that the honest clock already orders them and the check
   would pass on a broken engine. */
function validRace(skewMs) {
  const ok = lastGap < skewMs;
  check('scenario validity: real gap ' + lastGap + ' ms < skew ' + skewMs + ' ms', ok,
        ok ? '' : 'harness latency invalidated this race — tighten the gap');
  return ok;
}

console.log('\n═══ CLOCK-SKEW PROBE (Lane C) ═══\n');

/* 1 — THE FIELD SYMPTOM ------------------------------------------------- */
console.log('1 SKEW-INVERSION  AD clock +900 ms, types 36 first; IP honest, types 35 immediately after');
await bootPair(900, 0);
let r = await race('AD', '36', 'IP', '35', 0);
validRace(900);
check('later value wins across a 900 ms clock skew',
      r.ad === '35' && r.ip === '35' && r.cloudVal === '35',
      'AD=' + r.ad + ' IP=' + r.ip + ' cloud=' + r.cloudVal + ' (want 35 everywhere)');

/* 2 — NEGATIVE CONTROL: the fix must not break the agreeing case --------- */
console.log('\n2 HONEST-PAIR     both clocks agree; AD types 36 first, IP types 35 immediately after');
await bootPair(0, 0);
r = await race('AD', '36', 'IP', '35', 0);
check('later value still wins when clocks agree',
      r.ad === '35' && r.ip === '35' && r.cloudVal === '35',
      'AD=' + r.ad + ' IP=' + r.ip + ' cloud=' + r.cloudVal + ' (want 35 everywhere)');

/* 3 — NEGATIVE CONTROL: no correction invented from network latency ------ */
console.log('\n3 NO-PHANTOM      an unskewed device must not learn a non-zero offset');
const off0 = (await D('AD').call('dbg')).offset;
const off1 = (await D('IP').call('dbg')).offset;
check('unskewed devices hold a zero offset',
      off0 === 0 && off1 === 0,
      'AD offset=' + off0 + ' IP offset=' + off1 + ' (want 0/0)');

/* 4 — REGRESSION GUARD: gross skew was already handled at S622i ---------- */
console.log('\n4 GROSS-SKEW      AD clock +8 s, types 36 first; IP honest, types 35 immediately after');
await bootPair(8000, 0);
r = await race('AD', '36', 'IP', '35', 0);
validRace(8000);
check('later value wins across an 8 s clock skew',
      r.ad === '35' && r.ip === '35' && r.cloudVal === '35',
      'AD=' + r.ad + ' IP=' + r.ip + ' cloud=' + r.cloudVal + ' (want 35 everywhere)');

/* 5 — THE HAZARD THE FLOOR-YIELD INTRODUCES ----------------------------- */
console.log('\n5 SELF-OVERWRITE  AD clock +8 s: after its clock is corrected, AD must still be');
console.log('                  able to replace a value IT published in the wrong frame');
await bootPair(8000, 0);
await D('AD').call('set', { path: ['npshPsi'], value: '70' });
await D('AD').call('save');                       // published on the skewed clock
await D('AD').call('beat'); await D('IP').call('beat');
await sleep(200);
await D('AD').call('set', { path: ['npshPsi'], value: '71' });   // same device, same field, later
await D('AD').call('save');
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('IP').call('beat'); }
await sleep(150);
const adSelf = (await D('AD').call('get')).screen.npshPsi;
const ipSelf = (await D('IP').call('get')).screen.npshPsi;
check('a device can overwrite its own pre-correction value',
      adSelf === '71' && ipSelf === '71' && cloud.data.npshPsi === '71',
      'AD=' + adSelf + ' IP=' + ipSelf + ' cloud=' + cloud.data.npshPsi + ' (want 71 everywhere)');

for (const n of Object.keys(devices)) { try { await devices[n].call('exit'); } catch (_) {} }
server.close();

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed\n');
process.exit(failed.length ? 1 : 0);
