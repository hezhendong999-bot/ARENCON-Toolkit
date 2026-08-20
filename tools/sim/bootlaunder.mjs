/* bootlaunder.mjs — BOOT IS A BARRIER, NOT A RACE (Lane C, S673)
 *
 * Mark, 17 Aug, field test 3 (crash recovery): tablet in airplane mode typed
 * 770 into NPSH, revised to 50, force-closed, reconnected, reopened — the
 * field came back COMPLETELY EMPTY on every device, and the cloud held a
 * blank wearing a stamp minted seconds after the relaunch. sync_diag shows
 * the whole sequence: blank pushed 21:14:32, the recovered 770 pushed
 * 21:14:39, blank pushed again 21:15:19 — each blank wearing fresh recency
 * it never earned.
 *
 * The mechanism, and it is the S643 ordering fault through the one door S643
 * left open: S602 starts the autosave loop, the heartbeat and the lifecycle
 * kick BEFORE CloudSync.load() resolves and BEFORE the host applies its boot
 * merge. In that window every collect reads the default skeleton. The kick
 * and the beat push it; _stampLWW sees skeleton-blank ≠ ledger and mints NOW
 * onto a value nobody typed — manufactured recency on a transient boot
 * state, which then lawfully destroys real entries everywhere.
 *
 * 1  THE FIELD SYMPTOM   relaunch after an offline kill; the boot loops fire
 *                        before the host paints. The cloud must never receive
 *                        a blank wearing a post-relaunch stamp, and the
 *                        recovered offline value must survive everywhere.
 * 2  SECOND ARM          the offline clear itself got autosaved before the
 *                        kill (cache holds a stamped blank). A stamped,
 *                        non-dirty blank lawfully loses to cloud content:
 *                        the report must converge on the cloud value, and
 *                        still no manufactured stamps.
 * 3  NEGATIVE CONTROL    an edit typed normally AFTER boot completes still
 *                        wins everywhere (the barrier must not eat edits).
 * 4  NEGATIVE CONTROL    a deliberate ONLINE clear of a painted field still
 *                        propagates (blanks must remain pushable).
 *
 * Run: SIM_TARGET=fix node tools/sim/bootlaunder.mjs   [BASE_ROOT=<tree>] */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

let cloud = { data: {}, updatedAt: new Date().toISOString() };
let patchLog = [];                       // every write the cloud ever accepts
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c);
  req.on('end', () => {
    const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = req.url || '';
    if (u.includes('/auth/v1/user')) return send(200, { id: 'u' });
    if (u.includes('/rest/v1/sync_diag')) {
      if (req.method === 'POST' && process.env.DEBUG_LOG) { try { const d=JSON.parse(b); (Array.isArray(d)?d:[d]).forEach(e=>console.log('  [diag]', e.device, e.event, JSON.stringify(e.detail).slice(0,220))); } catch(_){} }
      return send(200, [{}]);
    }
    if (u.includes('/rest/v1/projects')) return send(200, [{ id: 'p1' }]);
    if (u.includes('/rest/v1/tool_data')) {
      if (req.method === 'GET' && u.includes('select=updated_at')) return send(200, [{ updated_at: cloud.updatedAt }]);
      if (req.method === 'GET') return send(200, [{ id: ROW, project_id: 'p1', tool_key: 'diesel', instance_number: 1, data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
      if (req.method === 'PATCH') {
        const im = req.headers['if-match'];
        if (im && String(im).replace(/"/g, '') !== cloud.updatedAt) return send(412, {});
        try {
          const nd = JSON.parse(b).data;
          if (nd) {
            cloud.data = nd;
            patchLog.push({
              at: Date.now(),
              npsh: nd.npshPsi,
              npshTs: (nd._fts && nd._fts._root && nd._fts._root.npshPsi) || 0
            });
          }
        } catch (_) {}
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
const killDev = n => { try { devices[n].child.kill('SIGKILL'); } catch (_) {} delete devices[n]; };
const killAll = () => { Object.keys(devices).forEach(killDev); };
const results = [];
const check = (n, p, d) => { results.push({ n, p }); console.log((p ? '  PASS  ' : '  FAIL  ') + n + (d ? '\n          ' + d : '')); };
const npsh = async n => (await D(n).call('get')).screen.npshPsi;

/* The honest full boot: init, load, apply, announce. This is the sequence the
   fixed host performs; on live, bootdone is a no-op and the sequence is the
   optimistic path every existing probe already models. */
async function fullBoot(n) {
  await D(n).call('init', { row: ROW });
  const r = await D(n).call('bootload');
  if (r.state) await D(n).call('apply', { state: r.state });
  await D(n).call('bootdone', { state: r.state || null });
}

console.log('\n═══ BOOT-LAUNDER PROBE (Mark, 17 Aug, field test 3) ═══\nsource: ' + REPO + '\n');

/* ═══ 1 ─ THE FIELD SYMPTOM ══════════════════════════════════════════════ */
console.log('1 FIELD SYMPTOM  660 agreed everywhere. Tablet offline: types 770, revises');
console.log('                 toward 50, is KILLED mid-edit. Relaunch: the boot loops fire');
console.log('                 before the host paints. No blank may wear a relaunch stamp;');
console.log('                 the recovered 770 must reach every device.');
cloud = { data: {}, updatedAt: new Date().toISOString() }; patchLog = [];
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');

await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
check('baseline: 660 agreed on both devices and the cloud',
  (await npsh('AD')) === '660' && (await npsh('PC')) === '660' && cloud.data.npshPsi === '660',
  `AD=${await npsh('AD')}  PC=${await npsh('PC')}  cloud=${cloud.data.npshPsi}`);

// The offline session, exactly as the sync_diag stamps tell it: 770 typed and
// autosaved (cache holds 770); the field is CLEARED mid-revision and the
// 500ms keystroke stamper fires (ledger holds blank@now) but the slower value
// save never runs; the 50 is typed and the kill lands inside every debounce.
// Ledger and cache disagree — that hybrid is what the tablet carried back up.
await D('AD').call('offline');
await D('AD').call('set', { path: ['npshPsi'], value: '770' });
await D('AD').call('save');                                  // offline: cache=770 + ledger 770
await sleep(200);
await D('AD').call('set', { path: ['npshPsi'], value: '' }); // the clear
await D('AD').call('stamp');                                 // stampSoon fires: ledger=blank@now
await D('AD').call('set', { path: ['npshPsi'], value: '50' }); // dies un-stamped, un-saved
const store1 = (await D('AD').call('snapshot')).store;
killDev('AD');                                               // force-close from recents

// Relaunch: disk intact, DOM is the default skeleton. S602's loops are already
// alive; the lifecycle kick fires on foreground; the host's paint arrives LAST
// — and per OPEN 2 (field-verified, undiagnosed) the NPSH field never repaints
// at all. The display bug is tolerated; the DATA must not launder.
const relaunchAt = Date.now();
delete store1.screen;                                        // a relaunched DOM starts blank
dev('AD');
await D('AD').call('restore', { store: store1 });
await D('AD').call('set', { path: ['npshPsi'], value: '' }); // the skeleton the collect sees
await D('AD').call('paintskip', { fields: ['npshPsi'] });    // OPEN 2 during the boot window
await D('AD').call('init', { row: ROW });
await D('AD').call('focus');                                 // the kick: pull + collect + save
// The host's own boot machinery writes the sign-off date at startup — the
// field log shows so-date changing INSIDE the 21:14 window. That machine
// write triggers the autosave with the screen still unpainted: the whole
// skeleton goes to the cloud, blank NPSH included, wearing a fresh mint.
await D('AD').call('set', { path: ['proj', 'so-date'], value: '2026-08-18T01:14' });
await D('AD').call('save');
const boot1 = await D('AD').call('bootload');                // CS.load(), unapplied
await D('AD').call('beat');                                  // a heartbeat lands mid-window
await sleep(150);
await D('AD').call('paintskip', { fields: [] });             // the host's real apply paints fully
await D('AD').call('apply', { state: boot1.state });
await D('AD').call('bootdone', { state: boot1.state || null });
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }

if (process.env.DEBUG_LOG) { const dg=(await D('AD').call('diag')).diag; console.log('AD diag:', JSON.stringify({pendingLocal:dg.pendingLocal,pendingSince:dg.pendingSince,lastPushOkAt:dg.lastPushOkAt&&(dg.lastPushOkAt-relaunchAt),lastPushFailAt:dg.lastPushFailAt&&(dg.lastPushFailAt-relaunchAt),failMsg:dg.lastPushFailMsg,hasBaseline:dg.hasBaseline,boot:dg.bootTrace})); }
if (process.env.DEBUG_LOG) console.log('patchLog arm1:', JSON.stringify(patchLog.map(p=>({npsh:p.npsh, stampRel:p.npshTs-relaunchAt, arriveRel:p.at-relaunchAt}))));
const laundered1 = patchLog.filter(p => (p.npsh === '' || p.npsh === undefined) && p.npshTs >= relaunchAt - 2000);
check('no blank ever reached the cloud wearing a relaunch-minted stamp',
  laundered1.length === 0,
  laundered1.length ? `blank pushed ${laundered1.length}x with fresh stamps (the 21:14:32 fault)` : 'clean');
check('the recovered 770 survives on every device and the cloud',
  (await npsh('AD')) === '770' && (await npsh('PC')) === '770' && cloud.data.npshPsi === '770',
  `AD=${await npsh('AD')}  PC=${await npsh('PC')}  cloud=${cloud.data.npshPsi}   (want 770 everywhere)`);
killAll();

/* ═══ 2 ─ SECOND ARM: the clear itself was autosaved before the kill ═════ */
console.log('\n2 STAMPED CLEAR  same kill, but the offline pause let the CLEAR autosave.');
console.log('                 A stamped, non-dirty blank lawfully loses to cloud content:');
console.log('                 converge on 660, and still no manufactured stamps.');
cloud = { data: {}, updatedAt: new Date().toISOString() }; patchLog = [];
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }

await D('AD').call('offline');
await D('AD').call('set', { path: ['npshPsi'], value: '770' });
await D('AD').call('save');
await sleep(200);
await D('AD').call('set', { path: ['npshPsi'], value: '' });
await D('AD').call('save');                                  // the pause: blank cached + stamped
await sleep(200);
await D('AD').call('set', { path: ['npshPsi'], value: '50' }); // dies in the debounce
const store2 = (await D('AD').call('snapshot')).store;
killDev('AD');

const relaunchAt2 = Date.now();
delete store2.screen;
dev('AD');
await D('AD').call('restore', { store: store2 });
await D('AD').call('set', { path: ['npshPsi'], value: '' });
await D('AD').call('init', { row: ROW });
await D('AD').call('focus');
const boot2 = await D('AD').call('bootload');
await D('AD').call('beat');
await sleep(150);
await D('AD').call('apply', { state: boot2.state });
await D('AD').call('bootdone', { state: boot2.state || null });
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }

const laundered2 = patchLog.filter(p => (p.npsh === '' || p.npsh === undefined) && p.npshTs >= relaunchAt2 - 2000);
check('no relaunch-minted blank reached the cloud',
  laundered2.length === 0,
  laundered2.length ? `blank pushed ${laundered2.length}x with fresh stamps` : 'clean');
check('a stamped blank lawfully loses: 660 restored everywhere',
  (await npsh('AD')) === '660' && (await npsh('PC')) === '660' && cloud.data.npshPsi === '660',
  `AD=${await npsh('AD')}  PC=${await npsh('PC')}  cloud=${cloud.data.npshPsi}   (want 660 everywhere)`);
killAll();

/* ═══ 3 ─ NEGATIVE CONTROL: post-boot edits still win ════════════════════ */
console.log('\n3 NEGATIVE CTRL  after boot completes, a normal edit must still stamp at');
console.log('                 once and win everywhere (the S635 property).');
cloud = { data: {}, updatedAt: new Date().toISOString() }; patchLog = [];
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
for (let i = 0; i < 2; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
await D('PC').call('set', { path: ['npshPsi'], value: '999' });
await D('PC').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
check('a later edit typed after boot still wins everywhere',
  (await npsh('AD')) === '999' && (await npsh('PC')) === '999' && cloud.data.npshPsi === '999',
  `AD=${await npsh('AD')}  PC=${await npsh('PC')}  cloud=${cloud.data.npshPsi}   (want 999 everywhere)`);
killAll();

/* ═══ 4 ─ NEGATIVE CONTROL: a deliberate online clear still propagates ═══ */
console.log('\n4 NEGATIVE CTRL  clearing a painted field ON PURPOSE, online, must still');
console.log('                 reach the other device. Blanks stay pushable.');
cloud = { data: {}, updatedAt: new Date().toISOString() }; patchLog = [];
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
for (let i = 0; i < 2; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
await D('AD').call('set', { path: ['npshPsi'], value: '' });   // deliberate clear, painted screen
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
check('a deliberate online clear propagates to the other device',
  (await npsh('AD')) === '' && (await npsh('PC')) === '' && cloud.data.npshPsi === '',
  `AD='${await npsh('AD')}'  PC='${await npsh('PC')}'  cloud='${cloud.data.npshPsi}'   (want blank everywhere)`);
killAll();

server.close();
const passed = results.filter(r => r.p).length;
console.log('\n' + passed + '/' + results.length + ' checks passed\n');
process.exit(passed === results.length ? 0 : 1);
