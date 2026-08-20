/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — NOBODY SHARES A PIN, AND NOTHING MAY BE LOST (S646, Lane A)
   frt/tests/sim/soloinputs.mjs     run: node frt/tests/sim/soloinputs.mjs

   Mark, 10 Aug: "they won't be sharing but I don't want to lose the inputs."

   That is a DIFFERENT question from pincomment.mjs, which drives two people
   fighting over one pin. This one drives the way the team actually works: one
   inspector owns a pin and types into it, and nobody else touches it. The
   ways input can still disappear in that world:

   A  A COLLEAGUE MERELY HAS THE REPORT OPEN. Not editing — open. A passive
      device still heartbeats, still pushes when it believes it is dirty, and
      load-time normalisation is enough to make it believe that. Its stale copy
      can then land on top of work it never saw. No pin is "shared" and the
      input is gone anyway.

   B  TWO INSPECTORS, DIFFERENT PINS, SAME REPORT. The everyday case for a
      site split by area. Nobody shares a pin; both sets of pins must survive.

   C  ONE INSPECTOR, NO NETWORK. Types a series of pin comments in a lift
      lobby with no signal, then walks back into coverage. Every entry must
      arrive — the whole run, not the last one.

   Two REAL devices in separate processes (own engine, own ledger, own IDB),
   colliding on If-Match through a mock cloud.
   ═══════════════════════════════════════════════════════════════════════════ */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

let cloud = { data: {}, updatedAt: new Date().toISOString() };
let tick = 0;
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c);
  req.on('end', () => {
    const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = req.url || '';
    if (u.includes('/auth/v1/user')) return send(200, { id: 'u' });
    if (u.includes('/rest/v1/sync_diag')) return send(200, [{}]);
    if (u.includes('/rest/v1/profiles')) return send(200, [{ id: 'u', full_name: 'Sim' }]);
    if (u.includes('/rest/v1/projects')) return send(200, [{ id: 'p1' }]);
    if (u.includes('/rest/v1/tool_data')) {
      if (req.method === 'GET' && u.includes('select=updated_at')) return send(200, [{ updated_at: cloud.updatedAt }]);
      if (req.method === 'GET') return send(200, [{ id: ROW, project_id: 'p1', tool_key: 'frt', instance_number: 1, data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
      if (req.method === 'PATCH') {
        const im = req.headers['if-match'];
        if (im && String(im).replace(/"/g, '') !== cloud.updatedAt) return send(412, {});
        try { const nd = JSON.parse(b).data; if (nd) cloud.data = nd; } catch (_) {}
        /* S666 — THE MOCK'S CLOCK POISONED THE EXPERIMENT. updated_at was
           fabricated one FAKE SECOND into the future per write, compounding.
           The engine's server anchor (S622i _learnServerStamp) reads exactly
           this field, NTP-style — that is its job — so each device learned a
           different fake offset depending on which writes it anchored on, and
           an EARLIER keystroke was minted ~600ms in the future of a LATER
           one. Every merge after that was lawful arbitration on poisoned
           time: permanent split, manufactured entirely by the mock. Real
           Supabase serves ONE clock; the mock must too. Monotonic +1ms only
           when two writes share a millisecond — tokens stay distinct, the
           clock stays honest. */
        tick = Math.max(Date.now(), tick + 1);
        cloud.updatedAt = new Date(tick).toISOString();
        return send(200, [{ id: ROW, instance_number: 1, updated_at: cloud.updatedAt }]);
      }
    }
    return send(200, []);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
let msgId = 0; const devices = {};
function dev(name) {
  const child = spawn(process.execPath, [path.join(HERE, 'frt_device.mjs')], {
    cwd: REPO, env: { ...process.env, DEV_ROOT: REPO, CLOUD_BASE: `http://127.0.0.1:${PORT}`, DEVICE_ID: name, ROW_ID: ROW },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const pend = {}; let buf = '';
  child.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(l); } catch (_) { continue; }
      const p = pend[m.id]; if (p) { delete pend[m.id]; p(m); }
    }
  });
  child.stderr.on('data', d => { if (process.env.VERBOSE) process.stderr.write('[' + name + '] ' + d); });
  devices[name] = { child, call(cmd, ex) {
    const id = ++msgId;
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(name + ':' + cmd + ' timeout')), 25000);
      pend[id] = m => { clearTimeout(t); res(m); };
      child.stdin.write(JSON.stringify({ id, cmd, ...(ex || {}) }) + '\n');
    });
  } };
  return devices[name];
}
const D = n => devices[n];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (d ? '\n          ' + d : '')); };
const cloudTexts = () => {
  const out = [];
  ((cloud.data.contractors) || []).forEach(c => ((c.deficiencies) || []).forEach(d =>
    ((d.observations) || []).forEach(o => { if (o && o.text) out.push(o.text); })));
  return out.sort();
};
const killAll = async () => {
  for (const n of Object.keys(devices)) {
    try { await devices[n].call('exit'); } catch (_) {}
    try { devices[n].child.kill('SIGKILL'); } catch (_) {}
    delete devices[n];
  }
};
const settle = async (n) => { for (let i = 0; i < (n || 6); i++) {
  for (const k of Object.keys(devices)) await D(k).call('pull');
  await sleep(120);
} };

console.log('\n═══ SOLO-INPUT PROBE (two real devices) ═══\nsource: ' + REPO + '\n');

/* ── A ─ a colleague merely has the report OPEN ───────────────────────────── */
console.log('A  OPEN, NOT EDITING   a second device has the report open and never touches it.\n');
cloud = { data: {}, updatedAt: new Date().toISOString() }; tick = 0;
dev('inspector'); dev('onlooker');
await D('inspector').call('pull'); await D('onlooker').call('pull');
const seed = await D('inspector').call('newproject');
const DEF = seed.deficId, CTR = seed.ctrId;
await D('inspector').call('call', { fn: 'updateObservation', args: [DEF, 0, 'pin one'] });
await D('inspector').call('push');
await sleep(150);
await D('onlooker').call('pull');            // onlooker now holds the report, and only looks
await sleep(150);

// inspector keeps working; onlooker just sits there beating like a real open tab
for (const t of ['pin one edited', 'pin one edited again']) {
  await D('inspector').call('call', { fn: 'updateObservation', args: [DEF, 0, t] });
  await D('inspector').call('push');
  await D('onlooker').call('pull');
  await D('onlooker').call('push');           // a passive tab that believes it is dirty
  await sleep(140);
}
await settle(6);
check('the inspector\'s latest text survived an idle colleague\'s device',
  cloudTexts().indexOf('pin one edited again') >= 0,
  'cloud = ' + JSON.stringify(cloudTexts()) + '   (want "pin one edited again")');
await killAll();

/* ── B ─ two inspectors, DIFFERENT pins ───────────────────────────────────── */
console.log('\nB  DIFFERENT PINS      two inspectors split the site; nobody shares a pin.\n');
cloud = { data: {}, updatedAt: new Date().toISOString() }; tick = 0;
dev('inspA'); dev('inspB');
await D('inspA').call('pull'); await D('inspB').call('pull');
const s2 = await D('inspA').call('newproject');
await D('inspA').call('call', { fn: 'updateObservation', args: [s2.deficId, 0, 'A pin 1'] });
await D('inspA').call('push');
await sleep(150);
await D('inspB').call('pull');
await sleep(150);
// each adds their own pins, interleaved, never touching the other's
for (let i = 2; i <= 4; i++) {
  const da = await D('inspA').call('call', { fn: 'addDeficiency', args: [s2.ctrId] });
  await D('inspA').call('call', { fn: 'addObservation', args: [da.ret] });
  await D('inspA').call('call', { fn: 'updateObservation', args: [da.ret, 0, 'A pin ' + i] });
  await D('inspA').call('push');
  await sleep(120);
  const db = await D('inspB').call('call', { fn: 'addDeficiency', args: [s2.ctrId] });
  await D('inspB').call('call', { fn: 'addObservation', args: [db.ret] });
  await D('inspB').call('call', { fn: 'updateObservation', args: [db.ret, 0, 'B pin ' + i] });
  await D('inspB').call('push');
  await sleep(120);
}
await settle(8);
/* S666 — settle-then-converge (see deficsync.mjs): interleaved pushes here
   collide, and the S622e backoff (350ms x attempt + up to 900ms jitter) can
   land the last re-push after a fixed settle. Poll until every pin is in the
   cloud, hard-capped so a real loss still fails loudly, then settle again so
   the devices hear it. */
const want = ['A pin 1','A pin 2','A pin 3','A pin 4','B pin 2','B pin 3','B pin 4'];
for (let w = 0; w < 160 && want.some(x => cloudTexts().indexOf(x) < 0); w++) await sleep(100);   /* S666b: load margin */
await settle(6);
const got = cloudTexts();
const missing = want.filter(x => got.indexOf(x) < 0);
check('every pin from both inspectors survived',
  missing.length === 0,
  'missing = ' + JSON.stringify(missing) + '\n          cloud = ' + JSON.stringify(got));
await killAll();

/* ── C ─ one inspector, no signal ─────────────────────────────────────────── */
console.log('\nC  NO SIGNAL           one inspector types a run of comments offline, then reconnects.\n');
cloud = { data: {}, updatedAt: new Date().toISOString() }; tick = 0;
dev('solo');
await D('solo').call('pull');
const s3 = await D('solo').call('newproject');
await D('solo').call('call', { fn: 'updateObservation', args: [s3.deficId, 0, 'before signal loss'] });
await D('solo').call('push');
await sleep(150);
await D('solo').call('offline');
for (let i = 1; i <= 3; i++) {
  const d = await D('solo').call('call', { fn: 'addDeficiency', args: [s3.ctrId] });
  await D('solo').call('call', { fn: 'addObservation', args: [d.ret] });
  await D('solo').call('call', { fn: 'updateObservation', args: [d.ret, 0, 'offline pin ' + i] });
  await D('solo').call('push');            // will fail; the work must be kept
  await sleep(100);
}
await D('solo').call('online');
await sleep(200);
for (let i = 0; i < 6; i++) { await D('solo').call('push'); await D('solo').call('pull'); await sleep(140); }
const wantC = ['before signal loss','offline pin 1','offline pin 2','offline pin 3'];
const gotC = cloudTexts();
const missC = wantC.filter(x => gotC.indexOf(x) < 0);
check('every offline entry arrived once the signal came back',
  missC.length === 0,
  'missing = ' + JSON.stringify(missC) + '\n          cloud = ' + JSON.stringify(gotC));
await killAll();

server.close();
const f = results.filter(x => !x.ok);
console.log('\n' + (results.length - f.length) + '/' + results.length + ' checks passed\n');
process.exit(f.length ? 1 : 0);
