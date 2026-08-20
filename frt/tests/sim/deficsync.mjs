/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — DEFICIENCY SYNC ON TWO REAL DEVICES (S666, Lane A)
   frt/tests/sim/deficsync.mjs          run: node frt/tests/sim/deficsync.mjs

   HISTORY, kept because it matters: this file spent S608–S665 as a stub that
   printed a blocked notice and EXITED 0 — a green light with no assertions
   behind it, which gave false comfort on exactly the question Mark asked
   (S646 handoff, item 4: "a stub that reports green is worse than an absent
   test"). It is now a real test on the real two-device harness.

   WHAT IT ASSERTS (the stub's planned #1/#2, now genuinely testable):
     1  Same deficiency, different aspects: a STATUS change on tablet A and a
        NEW OBSERVATION on phone B must BOTH survive one sync cycle.
     2  Typed-fields dirtiness, exercised live: the status value and the new
        observation each carry their own entry, and neither outranks the other.

   DELIBERATELY STILL OUT — the stub's #3 (_tryPartialSave change-scoping)
   remains under the original Lane C gate: nothing here commits to
   _tryPartialSave behaviour. Unblock criteria unchanged: Lane C's handoff
   must state the deficiency-propagation investigation CLOSED, verified
   against live HEAD, never against this comment.
   ═══════════════════════════════════════════════════════════════════════════ */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

let cloud = { data: {}, updatedAt: new Date().toISOString() };
let conflicts = 0;
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
        if (im && String(im).replace(/"/g, '') !== cloud.updatedAt) { conflicts++; return send(412, {}); }
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
let tick = 0;
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

let msgId = 0; const devices = {};
function dev(name) {
  const child = spawn(process.execPath, [path.join(HERE, 'frt_device.mjs')], {
    cwd: REPO,
    env: { ...process.env, DEV_ROOT: REPO, CLOUD_BASE: `http://127.0.0.1:${PORT}`, DEVICE_ID: name, ROW_ID: ROW },
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

const obsList = src => {
  const c = ((src && src.contractors) || [])[0]; if (!c) return { status: '(none)', texts: [] };
  const d = ((c.deficiencies) || [])[0]; if (!d) return { status: '(none)', texts: [] };
  return { status: d.status, texts: (d.observations || []).map(o => o.text) };
};
const view = async n => obsList((await D(n).call('get')).proj);

console.log('\n═══ FRT DEFICIENCY-SYNC PROBE (two real devices) ═══\nsource: ' + REPO + '\n');
console.log('Same deficiency: a STATUS change on A and a NEW OBSERVATION on B must both survive.\n');

dev('tabletA'); dev('phoneB');
await D('tabletA').call('pull'); await D('phoneB').call('pull');
const seed = await D('tabletA').call('newproject');
const DEF = seed.deficId;
await D('tabletA').call('call', { fn: 'updateObservation', args: [DEF, 0, 'original observation'] });
await D('tabletA').call('push');
await sleep(150);
await D('phoneB').call('pull');
await sleep(150);
check('both devices open on the same saved deficiency',
  obsList(cloud.data).texts.indexOf('original observation') >= 0 &&
  (await view('phoneB')).texts.indexOf('original observation') >= 0,
  'cloud=' + JSON.stringify(obsList(cloud.data)));

/* A changes the deficiency STATUS; B, without hearing it, ADDS an observation
   to the SAME deficiency. The everyday two-inspector overlap. */
await D('tabletA').call('call', { fn: 'updateDeficStatus', args: [DEF, 'closed'] });
await D('tabletA').call('push');
await sleep(250);
await D('phoneB').call('call', { fn: 'addObservation', args: [DEF] });
await D('phoneB').call('call', { fn: 'updateObservation', args: [DEF, 1, 'added by B'] });
await D('phoneB').call('push');
/* S666 — WAIT FOR THE WORLD TO SETTLE, THEN CONVERGE, THEN ASSERT. The
   engine's S622e collision backoff (350ms x attempt + up to 900ms jitter —
   a deliberate anti-storm feature) means the post-conflict re-push can land
   AFTER a fixed run of pull rounds has finished; six 120ms rounds lost that
   race about 1 run in 10, and the "failure" was a device honestly not yet
   told. Poll the cloud until the contested write has landed (hard cap keeps
   a real defect loud), then pull until both devices agree, capped again. */
for (let w = 0; w < 120 && obsList(cloud.data).texts.indexOf('added by B') < 0; w++) await sleep(100);   /* S666b: 12s — 5s was outrun under triple-suite load */
for (let i = 0; i < 40; i++) {   /* S666b: load margin; clean runs break in 1-2 rounds (tally-proven) */
  await D('tabletA').call('pull'); await D('phoneB').call('pull'); await sleep(120);
  const va = await view('tabletA'), vb = await view('phoneB');
  if (JSON.stringify(va) === JSON.stringify(vb) && va.texts.indexOf('added by B') >= 0 && va.status === 'closed') break;
}

const a = await view('tabletA'), b = await view('phoneB'), c = obsList(cloud.data);
check("A's status change survived on every surface",
  a.status === 'closed' && b.status === 'closed' && c.status === 'closed',
  'tabletA=' + a.status + '  phoneB=' + b.status + '  cloud=' + c.status + '   (want closed)');
check("B's new observation survived on every surface",
  a.texts.indexOf('added by B') >= 0 && b.texts.indexOf('added by B') >= 0 && c.texts.indexOf('added by B') >= 0,
  'tabletA=' + JSON.stringify(a.texts) + '  phoneB=' + JSON.stringify(b.texts) + '  cloud=' + JSON.stringify(c.texts));
check('the original observation was not lost in the crossfire',
  a.texts.indexOf('original observation') >= 0 && c.texts.indexOf('original observation') >= 0,
  'cloud=' + JSON.stringify(c.texts));
check('the two devices agree completely',
  JSON.stringify(a) === JSON.stringify(b),
  'tabletA=' + JSON.stringify(a) + '  phoneB=' + JSON.stringify(b));

for (const n of Object.keys(devices)) { try { await devices[n].call('exit'); } catch (_) {} try { devices[n].child.kill('SIGKILL'); } catch (_) {} }
server.close();
const f = results.filter(x => !x.ok);
console.log('\n' + (results.length - f.length) + '/' + results.length + ' checks passed\n');
process.exit(f.length ? 1 : 0);
