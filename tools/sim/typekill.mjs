/* typekill.mjs — A CLAIM AND ITS VALUE BECOME DURABLE TOGETHER (Lane C, S674)
 *
 * Mark, 21 Aug, on S673: typed 2500 into Rated Flow, closed the app straight
 * away, reopened — the field read 2000. The cloud never saw 2500 at any point
 * (every history snapshot holds 2000), and at 23:08:52 the OLD 2000 acquired
 * a brand-new stamp, replacing one minted on 08 Aug. Two symptoms, one cause.
 *
 * THE ORDERING FAULT. Three things happen after a keystroke, on three clocks:
 *   500ms  the ledger records the CLAIM  — "rated flow changed, at this time"
 *          (stampSoon → stampLocal → _persistSyncMeta: durable immediately)
 *   700ms  the host writes the VALUE to its own IDB autosave (S488 watchdog)
 *   5500ms the value reaches the facade cache and the cloud (4000 + 1500)
 * The claim is durable at 500ms. The value does not become ARGUABLE until
 * 5500ms: the host's own IDB copy is read at boot but _mergeCloudLocal treats
 * cloud as authoritative for every typed field (correctly — it rescues photo
 * binaries, not readings). So a kill in between leaves a stamped claim about
 * a number that nothing authoritative holds. At the next boot the claim is
 * an orphan: the ledger says "changed at 23:08", the screen (from cloud) says
 * 2000, they disagree — so the stamping pass mints NOW onto 2000 and the old
 * value goes out wearing recency it never earned, outranking the real edit on
 * any other device that has not pushed yet.
 *
 * This is the LAST unsealed door in the S672/S673 family and the deepest: the
 * boot barrier stops the app certifying an unpainted screen, but nothing
 * stopped it certifying an unpainted CLAIM. Fixing it retires the "type and
 * close fast loses the edit" class outright — Mark's 50 on 17 Aug and his
 * 2500 on 21 Aug are the same bug, four days apart.
 *
 * 1  THE FIELD SYMPTOM   type into a project field, kill inside the window.
 *                        The value must survive the relaunch and reach the
 *                        cloud, and no stale value may be re-dated.
 * 2  ROOT SCALAR         the same for a top-level reading (Mark's 50, NPSH).
 * 3  NEGATIVE CONTROL    a kill with NO typing must leave the ledger and the
 *                        cloud completely untouched — durability must not
 *                        invent writes on its own.
 * 4  NEGATIVE CONTROL    a colleague's newer entry still wins over a value
 *                        this device merely persisted at keystroke time.
 *
 * Run: SIM_TARGET=fix node tools/sim/typekill.mjs   [BASE_ROOT=<tree>] */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

let cloud = { data: {}, updatedAt: new Date().toISOString() };
let patchLog = [];
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
        try {
          const nd = JSON.parse(b).data;
          if (nd) {
            cloud.data = nd;
            patchLog.push({
              at: Date.now(),
              rated: nd.proj && nd.proj['pm-rated-flow'],
              ratedTs: (nd._fts && nd._fts.proj && nd._fts.proj['pm-rated-flow']) || 0,
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
const rated = async n => { const s = (await D(n).call('get')).screen; return s.proj && s.proj['pm-rated-flow']; };
const npsh  = async n => (await D(n).call('get')).screen.npshPsi;

async function fullBoot(n) {
  await D(n).call('init', { row: ROW });
  const r = await D(n).call('bootload');
  if (r.state) await D(n).call('apply', { state: r.state });
  await D(n).call('bootdone', { state: r.state || null });
}
/* A relaunch: the disk survives, the DOM does not. */
async function relaunch(n, store) {
  const s = JSON.parse(JSON.stringify(store));
  delete s.screen;
  dev(n);
  await D(n).call('restore', { store: s });
  await fullBoot(n);
}

console.log('\n═══ TYPE-AND-CLOSE PROBE (Mark, 21 Aug, Rated Flow 2500) ═══\nsource: ' + REPO + '\n');

/* ═══ 1 ─ THE FIELD SYMPTOM: a project field ════════════════════════════ */
console.log('1 FIELD SYMPTOM  2000 agreed everywhere. Type 2500 and close the app inside');
console.log('                 the window: the claim is on disk, the value is not yet');
console.log('                 arguable. 2500 must survive; 2000 must not be re-dated.');
cloud = { data: {}, updatedAt: new Date().toISOString() }; patchLog = [];
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['proj', 'pm-rated-flow'], value: '2000' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
check('baseline: 2000 agreed on both devices and the cloud',
  (await rated('AD')) === '2000' && (await rated('PC')) === '2000' && cloud.data.proj && cloud.data.proj['pm-rated-flow'] === '2000',
  `AD=${await rated('AD')}  PC=${await rated('PC')}  cloud=${cloud.data.proj && cloud.data.proj['pm-rated-flow']}`);

// Type 2500 and close. The keystroke stamper fires (500ms); the value save
// (700ms host IDB) and the cloud push (5500ms) never get their turn.
await D('AD').call('set', { path: ['proj', 'pm-rated-flow'], value: '2500' });
await D('AD').call('stamp');
const store1 = (await D('AD').call('snapshot')).store;
killDev('AD');

const relaunchAt = Date.now();
await relaunch('AD', store1);
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }

const redated1 = patchLog.filter(p => p.rated === '2000' && p.ratedTs >= relaunchAt - 2000);
check('the typed 2500 survives the close and reaches every device',
  (await rated('AD')) === '2500' && (await rated('PC')) === '2500' && cloud.data.proj['pm-rated-flow'] === '2500',
  `AD=${await rated('AD')}  PC=${await rated('PC')}  cloud=${cloud.data.proj['pm-rated-flow']}   (want 2500 everywhere)`);
check('no stale value is re-dated as a fresh entry (the 23:08:52 fault)',
  redated1.length === 0,
  redated1.length ? `2000 pushed ${redated1.length}x wearing a post-relaunch stamp` : 'clean');
killAll();

/* ═══ 2 ─ THE SAME FOR A ROOT SCALAR (Mark's 50, 17 Aug) ════════════════ */
console.log('\n2 ROOT SCALAR    same close, a top-level reading. NPSH 660 → type 50 → close.');
cloud = { data: {}, updatedAt: new Date().toISOString() }; patchLog = [];
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
await D('AD').call('set', { path: ['npshPsi'], value: '50' });
await D('AD').call('stamp');
const store2 = (await D('AD').call('snapshot')).store;
killDev('AD');
const relaunchAt2 = Date.now();
await relaunch('AD', store2);
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }
const redated2 = patchLog.filter(p => p.npsh === '660' && p.npshTs >= relaunchAt2 - 2000);
check('the typed 50 survives the close and reaches every device',
  (await npsh('AD')) === '50' && (await npsh('PC')) === '50' && cloud.data.npshPsi === '50',
  `AD=${await npsh('AD')}  PC=${await npsh('PC')}  cloud=${cloud.data.npshPsi}   (want 50 everywhere)`);
check('no stale reading is re-dated as a fresh entry',
  redated2.length === 0,
  redated2.length ? `660 pushed ${redated2.length}x wearing a post-relaunch stamp` : 'clean');
killAll();

/* ═══ 3 ─ NEGATIVE CONTROL: a kill with no typing writes nothing ════════ */
console.log('\n3 NEGATIVE CTRL  open and close WITHOUT typing: durability must invent');
console.log('                 nothing — no new stamps, no value changes.');
cloud = { data: {}, updatedAt: new Date().toISOString() }; patchLog = [];
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['proj', 'pm-rated-flow'], value: '2000' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
const stampBefore = cloud.data._fts && cloud.data._fts.proj && cloud.data._fts.proj['pm-rated-flow'];
const store3 = (await D('AD').call('snapshot')).store;
killDev('AD');
await relaunch('AD', store3);
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }
const stampAfter = cloud.data._fts && cloud.data._fts.proj && cloud.data._fts.proj['pm-rated-flow'];
check('an untouched field keeps its original entry time across a relaunch',
  stampBefore === stampAfter && cloud.data.proj['pm-rated-flow'] === '2000',
  `stamp before=${stampBefore} after=${stampAfter}  value=${cloud.data.proj['pm-rated-flow']}`);
killAll();

/* ═══ 4 ─ NEGATIVE CONTROL: a colleague's later entry still wins ════════ */
console.log('\n4 NEGATIVE CTRL  a colleague types LATER on another device: their entry must');
console.log('                 still win over the one this device persisted at keystroke.');
cloud = { data: {}, updatedAt: new Date().toISOString() }; patchLog = [];
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['proj', 'pm-rated-flow'], value: '2000' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
await D('AD').call('set', { path: ['proj', 'pm-rated-flow'], value: '2500' });
await D('AD').call('stamp');
const store4 = (await D('AD').call('snapshot')).store;
killDev('AD');
await sleep(150);
await D('PC').call('set', { path: ['proj', 'pm-rated-flow'], value: '3000' });   // typed later
await D('PC').call('save');
for (let i = 0; i < 2; i++) { await D('PC').call('beat'); await sleep(100); }
await relaunch('AD', store4);
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }
check("the colleague's later 3000 wins everywhere",
  (await rated('AD')) === '3000' && (await rated('PC')) === '3000' && cloud.data.proj['pm-rated-flow'] === '3000',
  `AD=${await rated('AD')}  PC=${await rated('PC')}  cloud=${cloud.data.proj['pm-rated-flow']}   (want 3000 everywhere)`);
killAll();

server.close();
const passed = results.filter(r => r.p).length;
console.log('\n' + passed + '/' + results.length + ' checks passed\n');
process.exit(passed === results.length ? 0 : 1);
