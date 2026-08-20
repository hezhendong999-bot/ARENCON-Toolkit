/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — PIN COMMENTS ON TWO REAL DEVICES (S646, Lane A)
   frt/tests/sim/pincomment.mjs      run: node frt/tests/sim/pincomment.mjs

   Mark, 10 Aug: "will they lose data if they enter comments in Pins?"

   Since S594 an entry time is minted AT THE KEYSTROKE, and the save-time pass
   only carries stamps forward (S597: every time that pass guessed, it guessed
   wrong). Diesel was taught to stamp. FRT never was — `_ts =` appears nowhere
   in the tool. On top of that, the stamping walker descends only TWO levels,
   and an FRT observation sits THREE deep (contractor → deficiency →
   observation): the level inspectors actually type into is below where the
   walker stops, so observations carry no entry time at all.

   Two devices editing the same pin therefore have nothing to arbitrate with.

   This runs TWO REAL DEVICES in separate processes, each with its own engine,
   own ledger, own IndexedDB and own device id, colliding on If-Match through
   a mock cloud — because a single-process harness shares all of that and
   never produces the collision, which is where the arbitration lives.

   1  THE FIELD CASE     the later edit of an existing pin comment must win.
   2  NEGATIVE CONTROL   a new pin from each device must both survive.
   3  NEGATIVE CONTROL   an AI retag must not outrank a person's edit.

   Run: node frt/tests/sim/pincomment.mjs        [BASE_ROOT=<tree>]
   Deps: cd tools/sim && npm i jsdom fake-indexeddb
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

const obsOf = src => {
  const c = ((src && src.contractors) || [])[0]; if (!c) return null;
  const d = ((c.deficiencies) || [])[0]; if (!d) return null;
  return ((d.observations) || [])[0] || null;
};
const textIn = src => { const o = obsOf(src); return o ? o.text : '(none)'; };
const tsIn   = src => { const o = obsOf(src); return o ? o._ts : undefined; };
const screenText = async n => textIn((await D(n).call('get')).proj);

console.log('\n═══ FRT PIN-COMMENT PROBE (two real devices) ═══\nsource: ' + REPO + '\n');
console.log('1 FIELD CASE   two inspectors edit the SAME pin comment. The later must win.\n');

dev('tabletA'); dev('phoneB');
/* HARNESS NOTE: a device must hear the row before it can publish to it — the
   engine drops a push it has no ancestor token for, and the first draft of
   this file lost tabletA's opening save that way (cloud stayed empty and every
   later check read as a failure for the wrong reason). Both devices open with
   a pull, exactly as a real session does. */
await D('tabletA').call('pull'); await D('phoneB').call('pull');
const seed = await D('tabletA').call('newproject');
const DEF = seed.deficId;
await D('tabletA').call('call', { fn: 'updateObservation', args: [DEF, 0, 'first note'] });
await D('tabletA').call('push');
await sleep(150);
await D('phoneB').call('pull');
await sleep(150);
const born = tsIn(cloud.data);
check('both devices hold the saved pin comment',
  textIn(cloud.data) === 'first note' && (await screenText('phoneB')) === 'first note',
  'cloud="' + textIn(cloud.data) + '"  phoneB="' + (await screenText('phoneB')) + '"  entry time=' + born);

// A edits, pushes. B edits a moment later without having heard A — the collision.
await D('tabletA').call('call', { fn: 'updateObservation', args: [DEF, 0, 'A revision'] });
await D('tabletA').call('push');
await sleep(250);
await D('phoneB').call('call', { fn: 'updateObservation', args: [DEF, 0, 'B revision'] });
await D('phoneB').call('push');
/* S666 — settle-then-converge (see deficsync.mjs): the S622e collision
   backoff can outlast a fixed run of rounds; poll the cloud until the
   contested write lands, then pull until agreement, both hard-capped. */
for (let w = 0; w < 120 && textIn(cloud.data) !== 'B revision'; w++) await sleep(100);   /* S666b: load margin */
for (let i = 0; i < 40; i++) {   /* S666b */
  await D('tabletA').call('pull'); await D('phoneB').call('pull'); await sleep(120);
  if ((await screenText('tabletA')) === 'B revision' && (await screenText('phoneB')) === 'B revision') break;
}

const a = await screenText('tabletA'), b = await screenText('phoneB');
check('a genuine collision actually occurred (the 412 door was exercised)',
  conflicts > 0, 'If-Match conflicts seen by the cloud = ' + conflicts);
check('the two devices agree after syncing', a === b, 'tabletA="' + a + '"  phoneB="' + b + '"');
check('the later edit (B) survived',
  a === 'B revision' && b === 'B revision' && textIn(cloud.data) === 'B revision',
  'tabletA="' + a + '"  phoneB="' + b + '"  cloud="' + textIn(cloud.data) + '"   (want "B revision")');
check('the pin comment carries an entry time that moved with the edit',
  !!tsIn(cloud.data) && tsIn(cloud.data) !== born,
  'first save=' + born + '  after both edits=' + tsIn(cloud.data) +
  (tsIn(cloud.data) === undefined ? '   <-- NEVER STAMPED: nothing to arbitrate with' : ''));

console.log('\n2 NEGATIVE CTRL  a new pin from each device must both survive.\n');
const ctrId = seed.ctrId;
const dA = await D('tabletA').call('call', { fn: 'addDeficiency', args: [ctrId] });
await D('tabletA').call('call', { fn: 'addObservation', args: [dA.ret] });
await D('tabletA').call('call', { fn: 'updateObservation', args: [dA.ret, 0, 'from A'] });
await D('tabletA').call('push');
const dB = await D('phoneB').call('call', { fn: 'addDeficiency', args: [ctrId] });
await D('phoneB').call('call', { fn: 'addObservation', args: [dB.ret] });
await D('phoneB').call('call', { fn: 'updateObservation', args: [dB.ret, 0, 'from B'] });
await D('phoneB').call('push');
/* S666 — settle-then-converge, phase 2. */
for (let w = 0; w < 120; w++) {   /* S666b */
  const t = (((cloud.data.contractors || [])[0] || {}).deficiencies || []).map(d => ((d.observations || [])[0] || {}).text);
  if (t.indexOf('from A') >= 0 && t.indexOf('from B') >= 0) break;
  await sleep(100);
}
for (let i = 0; i < 24; i++) { await D('tabletA').call('pull'); await D('phoneB').call('pull'); await sleep(120); }   /* S666b */
const all = (((cloud.data.contractors || [])[0] || {}).deficiencies || [])
  .map(d => ((d.observations || [])[0] || {}).text).filter(Boolean);
check('both new pins survive (different items never collide)',
  all.indexOf('from A') >= 0 && all.indexOf('from B') >= 0, 'cloud pins = ' + JSON.stringify(all));

console.log('\n3 NEGATIVE CTRL  an AI retag must not outrank a person\'s edit.\n');
const beforeAi = textIn(cloud.data);
await D('phoneB').call('call', { fn: 'updateObservation', args: [DEF, 0, 'human wins'] });
await D('phoneB').call('push');
await sleep(200);
await D('tabletA').call('call', { fn: 'updateObsTrade', args: [DEF, 0, 'Sprinkler', 'ai'] });
await D('tabletA').call('push');
/* S666 — settle-then-converge, phase 3. */
for (let w = 0; w < 120 && textIn(cloud.data) !== 'human wins'; w++) await sleep(100);   /* S666b */
for (let i = 0; i < 24; i++) { await D('tabletA').call('pull'); await D('phoneB').call('pull'); await sleep(120); }   /* S666b */
check('the AI retag left the newer human comment standing',
  textIn(cloud.data) === 'human wins',
  'cloud="' + textIn(cloud.data) + '"   (want "human wins", was "' + beforeAi + '")');

for (const n of Object.keys(devices)) { try { await devices[n].call('exit'); } catch (_) {} try { devices[n].child.kill('SIGKILL'); } catch (_) {} }
server.close();
const f = results.filter(x => !x.ok);
console.log('\n' + (results.length - f.length) + '/' + results.length + ' checks passed\n');
process.exit(f.length ? 1 : 0);
