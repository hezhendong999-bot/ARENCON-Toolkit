/* anyedit.mjs — ANY EDIT IS AN EDIT (Lane C, S675)
 *
 * Mark, 22 Aug, after S674 shipped: "confirm if this is applied for all
 * fields, including all formats." It was not. S674's durability rides the
 * KEYSTROKE trigger, so only typed fields, comment boxes and dropdowns are
 * covered. Everything an inspector does that is not typing reaches state
 * through its own handler and fires no form event:
 *   • a checklist YES/NO/NA answer is a TAP — recorded in memory, stamped,
 *     and saved by NOTHING until the 30-second background loop;
 *   • a signature is POINTER STROKES on a canvas;
 *   • a photo attach lands in state SECONDS AFTER the click that started it,
 *     once reading and compression finish — no event marks its arrival.
 * Tap an answer and close the app: up to 30 seconds of exposure — six times
 * the window that just lost Rated Flow. Per-handler save calls are the
 * "handler 19 forgets" failure the S488 watchdog was built to end; the fix
 * must be one trigger that cannot be forgotten, in the shared engine, so
 * Diesel, Electric and every future tool inherit it by construction.
 *
 * THE SHAPE UNDER TEST: three feeders into the ONE existing diff-gated
 * pipeline (stampSoon → stampLocal + onStampPersist): form events (S635),
 * document-wide click + pointerup (new), and a slow idle sweep (new) that
 * catches mutations no DOM event announces. Diff-gated end to end: a click
 * that changed nothing writes nothing. Opt-in per facade — a tool that does
 * not raise the flag is byte-for-byte unchanged.
 *
 * 1  THE TAP            answer a checklist item, close the app at once.
 *                       The answer must survive and reach every device.
 * 2  THE PEN            draw a signature stroke, close at once. Survives.
 * 3  THE SILENT ARRIVAL a mutation with NO event (the photo-attach shape),
 *                       then a close after the sweep window. Survives.
 * 4  NEGATIVE CONTROL   an idle session invents nothing: no edits, sweep
 *                       running, kill — no new stamps, no value changes.
 *
 * Run: SIM_TARGET=fix node tools/sim/anyedit.mjs   [BASE_ROOT=<tree>] */
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
        const t = setTimeout(() => rej(new Error(name + ':' + cmd + ' timeout')), 25000);
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
const clAnswer = async (n, id) => { const s = (await D(n).call('get')).screen; return s.clState && s.clState[id] && s.clState[id].status; };
const sigLen   = async n => { const s = (await D(n).call('get')).screen; return (s.sigStrokes && s.sigStrokes['sig-canvas'] || []).length; };

async function fullBoot(n) {
  await D(n).call('init', { row: ROW });
  const r = await D(n).call('bootload');
  if (r.state) await D(n).call('apply', { state: r.state });
  await D(n).call('bootdone', { state: r.state || null });
}
async function relaunch(n, store) {
  const s = JSON.parse(JSON.stringify(store));
  delete s.screen;
  dev(n);
  await D(n).call('restore', { store: s });
  await fullBoot(n);
}

console.log('\n═══ ANY-EDIT PROBE (taps, strokes, silent arrivals) ═══\nsource: ' + REPO + '\n');

/* ═══ 1 ─ THE TAP: a checklist answer, then an immediate close ══════════ */
console.log('1 THE TAP        answer item d1-3 YES, close the app at once. The answer');
console.log('                 must survive the relaunch and reach the other device.');
cloud = { data: {}, updatedAt: new Date().toISOString() };
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['clState', 'd1-3'], value: { status: 'no', comment: '', photos: [], _ts: Date.now() - 86400000 } });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
check('baseline: the old NO answer agreed on both devices and the cloud',
  (await clAnswer('AD', 'd1-3')) === 'no' && (await clAnswer('PC', 'd1-3')) === 'no' && cloud.data.clState && cloud.data.clState['d1-3'].status === 'no',
  `AD=${await clAnswer('AD','d1-3')}  PC=${await clAnswer('PC','d1-3')}  cloud=${cloud.data.clState && cloud.data.clState['d1-3'].status}`);

// The inspector taps YES. setStatus writes state + the item stamp and calls no
// save; the only DOM trace is the click itself.
await D('AD').call('set', { path: ['clState', 'd1-3'], value: { status: 'yes', comment: '', photos: [], _ts: Date.now() } });
await D('AD').call('tap');
const store1 = (await D('AD').call('snapshot')).store;
killDev('AD');
await relaunch('AD', store1);
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }
check('the tapped YES survives the close and reaches every device',
  (await clAnswer('AD', 'd1-3')) === 'yes' && (await clAnswer('PC', 'd1-3')) === 'yes' && cloud.data.clState['d1-3'].status === 'yes',
  `AD=${await clAnswer('AD','d1-3')}  PC=${await clAnswer('PC','d1-3')}  cloud=${cloud.data.clState['d1-3'].status}   (want yes everywhere)`);
killAll();

/* ═══ 2 ─ THE PEN: a signature stroke, then an immediate close ══════════ */
console.log('\n2 THE PEN        draw a signature stroke, close at once. Pointer-up is the');
console.log('                 only trace a canvas leaves.');
cloud = { data: {}, updatedAt: new Date().toISOString() };
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
await D('AD').call('set', { path: ['sigStrokes'], value: { 'sig-canvas': [{ pts: [[1, 1], [40, 38]], w: 2, _ts: Date.now() }] } });
await D('AD').call('penup');
const store2 = (await D('AD').call('snapshot')).store;
killDev('AD');
await relaunch('AD', store2);
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }
check('the signature stroke survives the close and reaches every device',
  (await sigLen('AD')) === 1 && (await sigLen('PC')) === 1 && ((cloud.data.sigStrokes || {})['sig-canvas'] || []).length === 1,
  `AD=${await sigLen('AD')} strokes  PC=${await sigLen('PC')}  cloud=${((cloud.data.sigStrokes||{})['sig-canvas']||[]).length}   (want 1 everywhere)`);
killAll();

/* ═══ 3 ─ THE SILENT ARRIVAL: state mutates with no event at all ════════ */
console.log('\n3 SILENT ARRIVAL a photo record lands in state seconds after the click that');
console.log('                 started it — no event announces it. The idle sweep must');
console.log('                 make it durable before a close ~7s later.');
cloud = { data: {}, updatedAt: new Date().toISOString() };
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['clState', 'd2-1'], value: { status: 'no', comment: '', photos: [], _ts: Date.now() - 86400000 } });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
await D('AD').call('set', { path: ['clState', 'd2-1'], value: { status: 'no', comment: '', photos: [{ id: 'ph_probe1', n: 'IMG_001.jpg' }], _ts: Date.now() } });
await sleep(7000);                                        // no event; only the sweep can see it
const store3 = (await D('AD').call('snapshot')).store;
killDev('AD');
await relaunch('AD', store3);
for (let i = 0; i < 4; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(120); }
const phCount = n => D(n).call('get').then(m => ((m.screen.clState || {})['d2-1'] || {}).photos ? m.screen.clState['d2-1'].photos.length : 0);
check('the silently-arrived photo record survives the close and reaches every device',
  (await phCount('AD')) === 1 && (await phCount('PC')) === 1 && (((cloud.data.clState || {})['d2-1'] || {}).photos || []).length === 1,
  `AD=${await phCount('AD')}  PC=${await phCount('PC')}  cloud=${(((cloud.data.clState||{})['d2-1']||{}).photos||[]).length}   (want 1 everywhere)`);
killAll();

/* ═══ 4 ─ NEGATIVE CONTROL: an idle session invents nothing ═════════════ */
console.log('\n4 NEGATIVE CTRL  open, touch nothing for 7s (sweep runs), close. No new');
console.log('                 stamps, no value changes, cloud row untouched.');
cloud = { data: {}, updatedAt: new Date().toISOString() };
dev('AD'); dev('PC');
await fullBoot('AD'); await fullBoot('PC');
await D('AD').call('set', { path: ['npshPsi'], value: '660' });
await D('AD').call('save');
for (let i = 0; i < 3; i++) { await D('AD').call('beat'); await D('PC').call('beat'); await sleep(100); }
const rowBefore = JSON.stringify([cloud.data.npshPsi, cloud.data._fts && cloud.data._fts._root]);
await sleep(7000);                                        // idle with the sweep running
await D('AD').call('beat'); await D('PC').call('beat'); await sleep(150);
const rowAfter = JSON.stringify([cloud.data.npshPsi, cloud.data._fts && cloud.data._fts._root]);
check('an idle session with the sweep running invents nothing',
  rowBefore === rowAfter,
  rowBefore === rowAfter ? 'row byte-identical' : `before=${rowBefore}  after=${rowAfter}`);
killAll();

server.close();
const passed = results.filter(r => r.p).length;
console.log('\n' + passed + '/' + results.length + ' checks passed\n');
process.exit(passed === results.length ? 0 : 1);
