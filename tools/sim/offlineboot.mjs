/* offlineboot.mjs — DOES AN OFFLINE EDIT SURVIVE THE APP CLOSING? (Lane C)
 *
 * MARK'S REPORT (OPEN 3): a value typed while offline, with the app then fully
 * closed and reopened, REVERTS to the old number. His constraint matters and
 * shapes this harness: in the TWA you cannot get past sign-in while offline,
 * so any procedure that says "reopen while still offline" is testing something
 * no inspector can do. The reopen here is therefore ONLINE.
 *
 * WHAT THE CODE SAYS (verified before this was written). Across an app close
 * the tool persists `syncMeta` — the cloud's last-seen state and its
 * concurrency token. The ENTRY-TIME LEDGER (_lastStampedLocal), which is what
 * every merge decision is actually made from, is a module variable and is
 * written nowhere. It dies with the process. So a value typed offline comes
 * back with no record of WHEN it was entered, and argues against a cloud copy
 * that has a perfectly good stamp. An unstamped value loses — which is why the
 * revert is reliable rather than intermittent. This was written down as a
 * known limit at S617 ("persisting the ledger is queued work") and then
 * queued and forgotten while three sessions chased merge logic.
 *
 * WHY NO EXISTING HARNESS COULD CATCH IT. Every simulated device kept its
 * storage in its own process, so "close the app" and "wipe the disk" were the
 * same event — the one thing a tablet never does. This harness kills the
 * process and hands the persisted world to a fresh one: localStorage and the
 * real IndexedDB contents cross the boundary, the engine is re-imported clean.
 * Only STORAGE survives, exactly as on a relaunched app.
 *
 * READ THE RESULT HONESTLY: this is a FAILING test on today's build. It is
 * checked in as the proof of OPEN 3 and the gate on its fix. It is not a
 * regression when it fails — it is the bug, finally reproducible.
 *
 * Run: node tools/sim/offlineboot.mjs
 */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

let cloud = { data: {}, updatedAt: new Date().toISOString() };
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
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
        try { const nd = JSON.parse(body).data; if (nd) cloud.data = nd; } catch (_) {}
        cloud.updatedAt = new Date().toISOString();
        return send(200, [{ id: ROW, instance_number: 1, updated_at: cloud.updatedAt }]);
      }
    }
    return send(200, []);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

let msgId = 0;
function spawnDevice(name) {
  const child = spawn(process.execPath, [path.join(HERE, 'battle_device.mjs')], {
    cwd: REPO,
    env: { ...process.env, DEV_ROOT: REPO, CLOUD_BASE: `http://127.0.0.1:${PORT}`, DEVICE_ID: name, DEV_BUILD: 'SIM' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const pending = {}; let buf = '';
  child.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch (_) { continue; }
      const p = pending[m.id]; if (p) { delete pending[m.id]; p(m); }
    }
  });
  child.stderr.on('data', d => { if (process.env.VERBOSE) process.stderr.write('[' + name + '] ' + d); });
  return {
    child,
    call(cmd, extra) {
      const id = ++msgId;
      return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error(name + ':' + cmd + ' timeout')), 20000);
        pending[id] = m => { clearTimeout(to); resolve(m); };
        child.stdin.write(JSON.stringify({ id, cmd, ...(extra || {}) }) + '\n');
      });
    }
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

console.log('\n═══ OFFLINE-BOOT SURVIVAL PROBE (Lane C) ═══\n');

/* ── the world starts with an older value already in the cloud ─────────── */
cloud = { data: { npshPsi: '20', _fts: { _root: { npshPsi: Date.now() - 600000 } } },
          updatedAt: new Date().toISOString() };

console.log('SESSION 1  open online, go offline, type 35, close the app');
let d = spawnDevice('AD');
await d.call('init', { row: ROW });
await d.call('load');
await d.call('beat');
await sleep(150);

await d.call('offline');
await d.call('set', { path: ['npshPsi'], value: '35' });
await d.call('save');                       // saved locally, offline
await sleep(250);

const snap = (await d.call('snapshot')).store;
const idbKeys = Object.keys(snap.idb || {}).map(k => k + ':' + (snap.idb[k] || []).length).join(' ');
console.log('           persisted world: localStorage keys=' + Object.keys(snap.localStorage).length + ', idb ' + idbKeys);

/* Does anything on disk remember WHEN 35 WAS TYPED? A loose search for "_fts"
   passes on the CLOUD snapshot's stamps — which describe the old value 20, not
   the new edit — so it would report a ledger that is not there. Ask the precise
   question instead: is the typed value on disk, and is there a stamp for it? */
const disk = JSON.stringify(snap.idb || {});
const typedValueOnDisk = disk.includes('"35"');
const stampForTyped = /"npshPsi"\s*:\s*1[0-9]{12}/.test(disk) && typedValueOnDisk;
check('the entry time of the offline edit is written to disk',
      stampForTyped,
      stampForTyped ? '' : 'typed value on disk: ' + typedValueOnDisk +
        ' — the persisted world carries the cloud\'s stamps for the OLD value, and nothing recording when 35 was entered');

d.child.kill('SIGKILL');                    // the app is CLOSED, not backgrounded
await sleep(300);

console.log('\nSESSION 2  reopen ONLINE (as the TWA forces), same storage, fresh process');
d = spawnDevice('AD');
await d.call('restore', { store: snap });
await d.call('init', { row: ROW });
await d.call('load');
/* One save after reopen — on the device, typing-saves means ANY interaction
   triggers this within a second. The stricter case (cloud heals with ZERO
   interaction after relaunch) is declared open in the manifest, not claimed. */
await d.call('save');
for (let i = 0; i < 4; i++) { await d.call('beat'); await sleep(120); }
await sleep(200);

const screen = (await d.call('get')).screen.npshPsi;
check('the offline edit survives the app closing (screen)',
      screen === '35', 'screen shows ' + screen + ', expected 35');
check('the offline edit reaches the cloud after reopening',
      cloud.data.npshPsi === '35', 'cloud holds ' + cloud.data.npshPsi + ', expected 35');

try { await d.call('exit'); } catch (_) {}
d.child.kill('SIGKILL');
server.close();

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('\nEXPECTED ON TODAY\'S BUILD — this is OPEN 3, reproduced.');
  console.log('The fix is to persist the entry-time ledger beside the snapshot');
  console.log('the tool already writes, so an edit\'s entry time survives exactly');
  console.log('as the edit itself does. Data-path change: Mark present.\n');
}
process.exit(failed.length ? 1 : 0);
