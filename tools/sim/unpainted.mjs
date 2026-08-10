/* unpainted.mjs — A SCREEN THAT NEVER PAINTED IS NOT AN EDIT (Lane C, S643)
 *
 * Mark, 09 Aug, three devices: typed 660 into NPSH on the tablet and 88 into
 * the PRV on the phone. Both died. The cloud row afterwards held the OLD 30
 * carrying a stamp minted three minutes earlier — an old value certified as
 * the newest thing anyone had typed, which then outranked every real edit.
 *
 * The mechanism this probe reproduces, and it is an ORDERING fault, not a
 * stamping one: the pull records "this device now holds the merged values"
 * BEFORE handing them to the screen, and unconditionally — the apply that
 * follows is swallowed by a silent catch in three separate places. When the
 * paint fails, the engine's record of this device is a lie, the stamper then
 * correctly observes screen ≠ record, concludes a person typed it, and mints
 * fresh recency onto a value nobody touched.
 *
 * Why the estate never caught this: every simulated device painted perfectly.
 * A harness whose screen always accepts the update cannot express the failure
 * (battle_device gained `paintfail` for exactly this, and it throws from the
 * real _applyLoadedState so the facade swallows it the way it ships).
 *
 * 1  THE FIELD SYMPTOM   the blind device must not launder its stale screen.
 * 2  NEGATIVE CONTROL    a deliberate retype of an old value must still win —
 *                        this is the check that a stale-vs-typed "discriminator"
 *                        would fail, and the reason one was not built.
 * 3  NEGATIVE CONTROL    with the screen painting normally, an edit still
 *                        stamps at once (the S635 iPhone-kill property).
 *
 * Run: SIM_TARGET=fix node tools/sim/unpainted.mjs      [BASE_ROOT=<tree>] */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

let cloud = { data: {}, updatedAt: new Date().toISOString() };
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c);
  req.on('end', () => {
    const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = req.url || '';
    if (u.includes('/auth/v1/user')) return send(200, { id: 'u' });
    if (u.includes('/rest/v1/sync_diag')) return send(200, [{}]);
    if (u.includes('/rest/v1/projects')) return send(200, [{ id: 'p1' }]);
    if (u.includes('/rest/v1/tool_data')) {
      if (req.method === 'GET' && u.includes('select=updated_at')) return send(200, [{ updated_at: cloud.updatedAt }]);
      if (req.method === 'GET') return send(200, [{ id: ROW, project_id: 'p1', tool_key: 'diesel', instance_number: 1, data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
      if (req.method === 'PATCH') {
        const im = req.headers['if-match'];
        if (im && String(im).replace(/"/g, '') !== cloud.updatedAt) return send(412, {});
        try { const nd = JSON.parse(b).data; if (nd) cloud.data = nd; } catch (_) {}
        cloud.updatedAt = new Date().toISOString();
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
  const child = spawn(process.execPath, [path.join(HERE, 'battle_device.mjs')], {
    cwd: REPO,
    env: { ...process.env, DEV_ROOT: REPO, CLOUD_BASE: `http://127.0.0.1:${PORT}`, DEVICE_ID: name, DEV_BUILD: 'SIM' },
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
  devices[name] = {
    child,
    call(cmd, ex) {
      const id = ++msgId;
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(name + ':' + cmd + ' timeout')), 20000);
        pend[id] = m => { clearTimeout(t); res(m); };
        child.stdin.write(JSON.stringify({ id, cmd, ...(ex || {}) }) + '\n');
      });
    }
  };
  return devices[name];
}
const D = n => devices[n];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const killAll = async () => {
  for (const n of Object.keys(devices)) {
    try { await devices[n].call('exit'); } catch (_) {}
    try { devices[n].child.kill('SIGKILL'); } catch (_) {}
    delete devices[n];
  }
};
const results = [];
const check = (n, p, d) => { results.push({ n, p }); console.log((p ? '  PASS  ' : '  FAIL  ') + n + (d ? '\n          ' + d : '')); };
const npsh = async n => (await D(n).call('get')).screen.npshPsi;

console.log('\n═══ UNPAINTED-SCREEN PROBE ═══\nsource: ' + REPO + '\n');

/* ── 1 ─ THE FIELD SYMPTOM ───────────────────────────────────────────────── */
console.log('1 FIELD SYMPTOM  AD types 660. IP cannot paint it. IP then types elsewhere.');
console.log('                 Mark\'s 660 must survive; IP\'s unpainted 30 must not outrank it.');
cloud = { data: {}, updatedAt: new Date().toISOString() };
dev('AD'); dev('IP');
await D('AD').call('init', { row: ROW }); await D('IP').call('init', { row: ROW });
await D('AD').call('load'); await D('IP').call('load');

// both devices agree on 30, the way the report stood before Mark touched it
await D('AD').call('set', { path: ['npshPsi'], value: '30' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('IP').call('beat'); await sleep(120); }
const agreed = (await npsh('AD')) === '30' && (await npsh('IP')) === '30';

// Mark types 660 on the tablet
await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
await sleep(150);

// the phone's restore dies before it reaches the screen
await D('IP').call('paintfail');
for (let i = 0; i < 3; i++) { await D('IP').call('beat'); await sleep(120); }
const ipBlind = (await npsh('IP')) === '30';

// Mark carries on working on the phone — a comment, a different field entirely
await D('IP').call('set', { path: ['proj', 'so-name'], value: 'M He' });
await D('IP').call('save');
await sleep(150);

// the phone's screen recovers (a refresh, or simply the next apply working)
await D('IP').call('paintok');
for (let i = 0; i < 6; i++) { await D('AD').call('beat'); await D('IP').call('beat'); await sleep(130); }

const a1 = await npsh('AD'), i1 = await npsh('IP'), c1 = cloud.data.npshPsi;
check('the preconditions hold (both on 30, then the phone goes blind)', agreed && ipBlind,
  'agreed=' + agreed + ' phoneBlind=' + ipBlind);
check('660 survives on every device and in the cloud', a1 === '660' && i1 === '660' && c1 === '660',
  'AD=' + a1 + '  IP=' + i1 + '  cloud=' + c1 + '   (want 660 everywhere)');
check('the unpainted 30 never wore manufactured recency', c1 !== '30',
  'cloud=' + c1 + '  stamp=' + JSON.stringify(cloud.data._fts && cloud.data._fts._root && cloud.data._fts._root.npshPsi));
check('the comment the phone genuinely typed still arrived',
  !!(cloud.data.proj && cloud.data.proj['so-name'] === 'M He'),
  'cloud so-name=' + (cloud.data.proj && cloud.data.proj['so-name']));
await killAll();

/* ── 2 ─ NEGATIVE CONTROL: A DELIBERATE RETYPE MUST STILL WIN ────────────── */
console.log('\n2 NEGATIVE CTRL  the phone paints 660, then Mark deliberately types 30 back.');
console.log('                 30 must win. A stale-vs-typed guess would have eaten this.');
cloud = { data: {}, updatedAt: new Date().toISOString() };
dev('AD'); dev('IP');
await D('AD').call('init', { row: ROW }); await D('IP').call('init', { row: ROW });
await D('AD').call('load'); await D('IP').call('load');
await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('IP').call('beat'); await sleep(120); }
const painted660 = (await npsh('IP')) === '660';
await D('IP').call('set', { path: ['npshPsi'], value: '30' });     // a correction, typed on purpose
await D('IP').call('save');
for (let i = 0; i < 6; i++) { await D('AD').call('beat'); await D('IP').call('beat'); await sleep(130); }
const a2 = await npsh('AD'), i2 = await npsh('IP'), c2 = cloud.data.npshPsi;
check('the phone actually painted 660 first', painted660, 'IP=' + (painted660 ? '660' : 'not painted'));
check('a deliberate correction back to an older value still wins',
  a2 === '30' && i2 === '30' && c2 === '30',
  'AD=' + a2 + '  IP=' + i2 + '  cloud=' + c2 + '   (want 30 everywhere)');
await killAll();

/* ── 3 ─ NEGATIVE CONTROL: NORMAL EDITS STILL STAMP AT ONCE ──────────────── */
console.log('\n3 NEGATIVE CTRL  nothing blind: a later edit must still beat an earlier one.');
console.log('                 (the S635 property — stamping must stay immediate.)');
cloud = { data: {}, updatedAt: new Date().toISOString() };
dev('AD'); dev('IP');
await D('AD').call('init', { row: ROW }); await D('IP').call('init', { row: ROW });
await D('AD').call('load'); await D('IP').call('load');
await D('AD').call('set', { path: ['npshPsi'], value: '111' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('IP').call('beat'); await sleep(120); }
await sleep(60);
await D('IP').call('set', { path: ['npshPsi'], value: '222' });    // typed later — must win
await D('IP').call('save');
for (let i = 0; i < 6; i++) { await D('AD').call('beat'); await D('IP').call('beat'); await sleep(130); }
const a3 = await npsh('AD'), i3 = await npsh('IP'), c3 = cloud.data.npshPsi;
check('the later entry wins with the screen painting normally',
  a3 === '222' && i3 === '222' && c3 === '222',
  'AD=' + a3 + '  IP=' + i3 + '  cloud=' + c3 + '   (want 222 everywhere)');
await killAll();

server.close();
const f = results.filter(x => !x.p);
console.log('\n' + (results.length - f.length) + '/' + results.length + ' checks passed\n');
process.exit(f.length ? 1 : 0);
