/* ═══════════════════════════════════════════════════════════════════════════
 * battle.mjs — S622 THREE-DEVICE BATTLE HARNESS.
 * Three REAL engine instances in separate processes (AD=Android tablet,
 * IP=iPhone, PC=desktop — Mark's actual device set) against one mock
 * Supabase that enforces If-Match exactly like production, so every
 * near-simultaneous save collides into the 412 door. Scenarios replay the
 * FULL S616–S621 field-failure catalogue plus adversarial variations,
 * including a mixed-build device still running the S621 engine.
 * WIRE AUDIT: every accepted PATCH is recorded (value + entry stamp) and
 * audited — a non-blank scalar must never ship stamp-0 after having carried
 * a real stamp (the exact production of every historical wipe).
 * Run: node tools/sim/battle.mjs            (S622 everywhere)
 * ═════════════════════════════════════════════════════════════════════════*/
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const OLD  = process.env.BATTLE_OLD_ROOT || '/home/claude/live_baseline';
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';

/* ── mock Supabase with If-Match + wire audit ─────────────────────────── */
const cloud = { data: {}, updatedAt: '2026-08-06T00:00:00Z' };
const wire = [];                       // every accepted PATCH: {t, npsh, stamp, testType, ttStamp}
let patches = 0, rejects412 = 0;
function bumpToken() { cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString(); }
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
            wire.push({ t: Date.now(), npsh: nd.npshPsi, stamp: r.npshPsi || 0, testType: nd.testType, ttStamp: r.testType || 0 });
          }
        } catch (_) {}
        bumpToken();
        return send(200, [{ id: ROW, updated_at: cloud.updatedAt }]);
      }
    }
    return send(200, []);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

/* ── device management ─────────────────────────────────────────────────── */
const devices = {};
let msgId = 0;
function spawnDevice(name, root, build) {
  const child = spawn(process.execPath, [path.join(HERE, 'battle_device.mjs')], {
    cwd: REPO,
    env: { ...process.env, DEV_ROOT: root, CLOUD_BASE: `http://127.0.0.1:${PORT}`, DEVICE_ID: name, DEV_BUILD: build },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const pending = {};
  let buf = '';
  child.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try { const m = JSON.parse(line); if (pending[m.id]) { pending[m.id](m); delete pending[m.id]; } } catch (_) {}
    }
  });
  child.stderr.on('data', () => {});
  const call = (cmd, extra) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending[id] = m => m.ok ? resolve(m) : reject(new Error(`${name}:${cmd}: ${m.err}`));
    child.stdin.write(JSON.stringify({ id, cmd, ...extra }) + '\n');
    setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error(`${name}:${cmd}: timeout`)); } }, 20000);
  });
  devices[name] = { child, call };
  return devices[name];
}
const D = n => devices[n];
async function boot(name, root, build) {
  spawnDevice(name, root, build);
  await D(name).call('init', { row: ROW });
}
async function killAll() { for (const n of Object.keys(devices)) { try { await D(n).call('exit', {}); } catch (_) {} delete devices[n]; } }

/* ── scenario helpers ──────────────────────────────────────────────────── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const set = (n, field, v) => D(n).call('set', { path: [field], value: v });
const setDeep = (n, p, v) => D(n).call('set', { path: p, value: v });
const save = n => D(n).call('save', {});
const beat = n => D(n).call('beat', {});
const off = n => D(n).call('offline', {});
const on = n => D(n).call('online', {});
async function get(n, field) { const r = await D(n).call('get', {}); return field ? r.screen[field] : r.screen; }
async function beatAll(rounds = 2) { for (let i = 0; i < rounds; i++) { for (const n of Object.keys(devices)) await beat(n); } }
async function settle(rounds = 4) { await beatAll(rounds); }

/* fresh world per scenario */
async function reset(worldData) {
  await killAll();
  cloud.data = JSON.parse(JSON.stringify(worldData || {}));
  bumpToken();
  wire.length = 0; patches = 0; rejects412 = 0;
}
const baseWorld = (npsh, stamp) => ({ npshPsi: npsh, _fts: { _root: { npshPsi: stamp } } });

/* ── results ───────────────────────────────────────────────────────────── */
let pass = 0, fail = 0; const failures = [];
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL  ${name}  — ${detail}`); }
}
async function expectAll(name, field, want) {
  const vals = {};
  for (const n of Object.keys(devices)) vals[n] = await get(n, field);
  vals.cloud = cloud.data ? cloud.data[field] : undefined;
  const ok = Object.values(vals).every(v => String(v) === String(want));
  chk(name, ok, JSON.stringify(vals) + ' want ' + want);
}
function auditWire(name) {
  /* a non-blank scalar that has carried a real stamp must never regress to 0 */
  let hadStamp = false, bad = null;
  for (const w2 of wire) {
    if (w2.npsh != null && w2.npsh !== '' ) {
      if (w2.stamp > 0) hadStamp = true;
      else if (hadStamp) { bad = w2; break; }
    }
  }
  chk(name + ' [wire: no stamp-0 regression]', !bad, bad ? JSON.stringify(bad) : '');
}

const T0 = Date.now();
const AGO = m => T0 - m * 60000;

/* ═══════════════════════════════════════════════════════════════════════ */
console.log('\n═══ BATTLE S622 — three real devices, one colliding cloud ═══\n');

/* ── GROUP A: the two canonical field tests + timing permutations ─────── */
console.log('── A. Quick-succession races (Mark Test 1 family) ──');
for (const [i, gap] of [[1, 0], [2, 150], [3, 400]].entries()) {
  await reset(baseWorld('10', AGO(60)));
  await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
  await settle(2);
  await set('AD', 'npshPsi', '15'); await save('AD');
  if (gap) await sleep(gap);
  await set('IP', 'npshPsi', '27'); await save('IP');
  await settle(5);
  await expectAll(`A${i + 1} later entry wins (gap ${gap}ms)`, 'npshPsi', '27');
  auditWire(`A${i + 1}`);
}
/* A4: three devices, three rapid entries — last wins */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'npshPsi', '15'); await save('AD'); await sleep(60);
await set('IP', 'npshPsi', '27'); await save('IP'); await sleep(60);
await set('PC', 'npshPsi', '44'); await save('PC');
await settle(6);
await expectAll('A4 three rapid entries — the last one wins', 'npshPsi', '44');
auditWire('A4');
/* A5: mid-typing pull — type, pull lands, then save (the S621 window) */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'npshPsi', '15'); await save('AD'); await beat('IP');   // IP pulls the 15
await set('IP', 'npshPsi', '31');                                        // typing AFTER the pull
await beat('IP');                                                        // heartbeat mid-typing
await save('IP');
await settle(5);
await expectAll('A5 value typed after a pull still wins', 'npshPsi', '31');
auditWire('A5');
/* A6: same value typed on two devices — no fight, no storm */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'npshPsi', '55'); await save('AD');
await set('IP', 'npshPsi', '55'); await save('IP');
await settle(4);
const pBefore = patches; await settle(4);
chk('A6 agreeing entries — no push storm afterwards', patches - pBefore <= 1, `${patches - pBefore} extra pushes`);
await expectAll('A6 agreed value everywhere', 'npshPsi', '55');

/* ── GROUP B: offline permutations (Mark Test 2 family + inversions) ──── */
console.log('── B. Offline edits, both directions ──');
/* B1: offline LATER edit must win (the lost-35) */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await off('IP');
await set('AD', 'npshPsi', '20'); await save('AD'); await settle(2);
await sleep(200);
await set('IP', 'npshPsi', '35'); await save('IP');       // typed AFTER the 20, while offline
await on('IP');
await settle(6);
await expectAll('B1 offline LATER edit wins on reconnect', 'npshPsi', '35');
auditWire('B1');
/* B2: offline EARLIER edit must LOSE (inversion — correctness, not just survival) */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await off('IP');
await set('IP', 'npshPsi', '35'); await save('IP');       // typed FIRST, offline
await sleep(250);
await set('AD', 'npshPsi', '20'); await save('AD'); await settle(2);   // typed LATER, online
await on('IP');
await settle(6);
await expectAll('B2 offline EARLIER edit yields to a later one', 'npshPsi', '20');
auditWire('B2');
/* B3: long offline number (Mark's 125555) survives round trips */
await reset(baseWorld('55', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await off('IP');
await set('IP', 'npshPsi', '125555'); await save('IP');
await sleep(150); await on('IP');
await settle(6);
await expectAll('B3 long offline entry propagates (no drift split)', 'npshPsi', '125555');
auditWire('B3');
/* B4: BOTH edited offline; later entry wins when both reconnect */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await off('AD'); await off('IP');
await set('AD', 'npshPsi', '71'); await save('AD');
await sleep(250);
await set('IP', 'npshPsi', '82'); await save('IP');
await on('AD'); await settle(3);
await on('IP'); await settle(6);
await expectAll('B4 dual-offline: later entry wins', 'npshPsi', '82');
auditWire('B4');
/* B5: offline edit + a THIRD device joins mid-fight */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622');
await settle(2);
await off('IP');
await set('AD', 'npshPsi', '88'); await save('AD'); await settle(2);
await sleep(200);
await set('IP', 'npshPsi', '91'); await save('IP');   // typed AFTER the 88, offline
await on('IP'); await settle(3);
await boot('PC', REPO, 'S622');    // late joiner boots into the aftermath
await settle(4);
await expectAll('B5 late-boot device converges to the true winner', 'npshPsi', '91');
auditWire('B5');
/* B6: offline through MANY online saves, reconnect — later offline entry still wins */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'npshPsi', '11'); await save('AD'); await settle(1);
await set('AD', 'npshPsi', '12'); await save('AD'); await settle(1);
await off('IP');
await sleep(150);
await set('IP', 'npshPsi', '99'); await save('IP');
await set('AD', 'npshPsi', '13'); await save('AD'); await settle(1);   // typed BEFORE 99? No — after. So 13 is later? sleep ordering: 99 typed at t, 13 typed after → 13 should win
await on('IP');
await settle(6);
await expectAll('B6 churn then reconnect: latest entry wins', 'npshPsi', '13');
auditWire('B6');

/* ── GROUP C: clears and blanks (doctrine I-2 both directions) ────────── */
console.log('── C. Clears, blanks, skeletons ──');
/* C1: a deliberate clear propagates */
await reset(baseWorld('50', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'npshPsi', ''); await save('AD');
await settle(5);
await expectAll('C1 a typed CLEAR propagates to every device', 'npshPsi', '');
/* C2: a clear followed by a later re-entry — re-entry wins */
await reset(baseWorld('50', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'npshPsi', ''); await save('AD'); await settle(2);
await sleep(150);
await set('IP', 'npshPsi', '77'); await save('IP');
await settle(5);
await expectAll('C2 entry after a clear wins', 'npshPsi', '77');
/* C3: clear RACING content — later action wins (clear typed after) */
await reset(baseWorld('50', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('IP', 'npshPsi', '66'); await save('IP');
await sleep(200);
await set('AD', 'npshPsi', ''); await save('AD');
await settle(5);
await expectAll('C3 a LATER clear beats an earlier entry', 'npshPsi', '');
/* C4: a stale device with a blank must NOT wipe content (boot-skeleton class) */
await reset(baseWorld('42', AGO(5)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
/* PC's screen loses the field entirely (unloaded screen / skeleton) */
await D('PC').call('set', { path: ['npshPsi'], value: undefined });
await save('PC');
await settle(5);
await expectAll('C4 a skeleton save never erases the reading', 'npshPsi', '42');

/* ── GROUP D: testType — the "selection doesn't stick" complaint ──────── */
console.log('── D. Pump type selection (testType scalar) ──');
/* D1: selection sticks locally and propagates */
await reset({ npshPsi: '10', testType: '', _fts: { _root: { npshPsi: AGO(60) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'testType', '7pt'); await save('AD');
await settle(5);
await expectAll('D1 pump-type selection sticks and propagates', 'testType', '7pt');
/* D2: selection made, heartbeat lands, selection changed again — final choice wins */
await reset({ testType: '', _fts: { _root: {} } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'testType', '3pt'); await save('AD'); await beat('IP');
await set('IP', 'testType', '7pt'); await beat('IP'); await save('IP');
await settle(5);
await expectAll('D2 re-selection after a pull sticks', 'testType', '7pt');
/* D3: two devices pick different types near-simultaneously — later wins, no flap */
await reset({ testType: '3pt', _fts: { _root: { testType: AGO(30) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'testType', '7pt'); await save('AD');
await sleep(180);
await set('IP', 'testType', '3pt'); await save('IP');
await settle(5);
/* Re-entering the value the report already held ('3pt' baseline) is not a new
   entry — value-identical to the ledger, and the real UI cannot produce the
   tap (an already-selected option is a no-op). The one genuine change wins. */
await expectAll('D3 re-entered baseline value is not a new entry — converges on the real change', 'testType', '7pt');

/* ── GROUP E: project-header fieldMaps (the decorative-arbitration fix) ─ */
console.log('── E. Project header fields (proj fieldMap) ──');
/* E1: consultant-name edit propagates */
await reset({ proj: { consultant: 'Old Name', addr: '1 Main St' }, _fts: { proj: { consultant: AGO(120), addr: AGO(120) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await setDeep('AD', ['proj', 'consultant'], 'Mark He, L.E.T.'); await save('AD');
await settle(5);
{ const vals = {}; for (const n of ['AD','IP','PC']) vals[n] = (await get(n, 'proj') || {}).consultant; vals.cloud = (cloud.data.proj||{}).consultant;
  chk('E1 header edit propagates', Object.values(vals).every(v => v === 'Mark He, L.E.T.'), JSON.stringify(vals)); }
/* E2: two devices edit DIFFERENT header keys — both survive */
await reset({ proj: { consultant: 'A', addr: 'B' }, _fts: { proj: { consultant: AGO(120), addr: AGO(120) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await setDeep('AD', ['proj', 'consultant'], 'NewConsult'); await save('AD');
await setDeep('IP', ['proj', 'addr'], 'NewAddr'); await save('IP');
await settle(6);
{ let ok = true, detail = {};
  for (const n of ['AD','IP','PC']) { const p = await get(n, 'proj') || {}; detail[n] = p; ok = ok && p.consultant === 'NewConsult' && p.addr === 'NewAddr'; }
  const cp = cloud.data.proj || {}; ok = ok && cp.consultant === 'NewConsult' && cp.addr === 'NewAddr';
  chk('E2 different header keys merge — nobody loses', ok, JSON.stringify(detail)); }
/* E3: SAME header key contested — later entry wins (was first-pusher-wins) */
await reset({ proj: { consultant: 'Old' }, _fts: { proj: { consultant: AGO(120) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await setDeep('AD', ['proj', 'consultant'], 'First'); await save('AD');
await sleep(200);
await setDeep('IP', ['proj', 'consultant'], 'Second'); await save('IP');
await settle(6);
{ const vals = {}; for (const n of ['AD','IP','PC']) vals[n] = (await get(n, 'proj') || {}).consultant; vals.cloud = (cloud.data.proj||{}).consultant;
  chk('E3 contested header key: later entry wins', Object.values(vals).every(v => v === 'Second'), JSON.stringify(vals)); }
/* E4: header blank never wipes (S610 doctrine preserved) */
await reset({ proj: { consultant: 'Keep Me' }, _fts: { proj: { consultant: AGO(5) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await setDeep('PC', ['proj', 'consultant'], ''); await save('PC');   // skeleton-class blank
await settle(5);
{ const vals = {}; for (const n of ['AD','IP','PC']) vals[n] = (await get(n, 'proj') || {}).consultant; vals.cloud = (cloud.data.proj||{}).consultant;
  chk('E4 header blank does not wipe content (accepted trade-off intact)', Object.values(vals).every(v => v === 'Keep Me'), JSON.stringify(vals)); }

/* E5 — S622c: THE SCENARIO THAT WOULD HAVE CAUGHT MARK'S RPM DRIFT.
   Offline edit on a PROJECT-FIELD key (pm-rpm), reconnect into a moved
   cloud. The S622 fieldMaps dirty-keep raised no kept-local flag, the
   facade never reset the push dedupe, and the reconnect flush was
   swallowed — the device sat ahead of the cloud forever. The original
   battle ran offline scenarios only on npshPsi (which had the flag);
   family × scenario coverage is now explicit. */
await reset({ proj: { 'pm-rpm': '50' }, _fts: { proj: { 'pm-rpm': AGO(60) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await off('IP');
await setDeep('AD', ['proj', 'pm-rpm'], '53'); await save('AD'); await settle(2);
await sleep(250);
await setDeep('IP', ['proj', 'pm-rpm'], '22233'); await save('IP');   // typed AFTER the 53, offline
await on('IP');
await settle(7);
{ const vals = {}; for (const n of ['AD','IP','PC']) vals[n] = (await get(n, 'proj') || {})['pm-rpm']; vals.cloud = (cloud.data.proj||{})['pm-rpm'];
  chk('E5 offline project-field edit propagates on reconnect (no drift)', Object.values(vals).every(v => String(v) === '22233'), JSON.stringify(vals)); }
/* E6 — mid-typing pull on a project-field key (the Test-1 window, fieldMap flavour) */
await reset({ proj: { 'pm-rpm': '10' }, _fts: { proj: { 'pm-rpm': AGO(60) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await setDeep('AD', ['proj', 'pm-rpm'], '33'); await save('AD'); await beat('IP');   // IP pulls the 33
await setDeep('IP', ['proj', 'pm-rpm'], '20');                                        // typing AFTER the pull
await beat('IP');                                                                     // heartbeat mid-typing
await save('IP');
await settle(6);
{ const vals = {}; for (const n of ['AD','IP','PC']) vals[n] = (await get(n, 'proj') || {})['pm-rpm']; vals.cloud = (cloud.data.proj||{})['pm-rpm'];
  chk('E6 project-field value typed after a pull still wins', Object.values(vals).every(v => String(v) === '20'), JSON.stringify(vals)); }

/* ── GROUP F: signatures (statusMaps) under collision ─────────────────── */
console.log('── F. Signatures under collision ──');
/* F1: never-signed device colliding must not wipe a signature */
await reset({ sigStrokes: { pad1: { s: [{ pts: [{ x: 1, y: 1 }], w: 900, h: 130 }], _ts: AGO(10) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('PC', 'npshPsi', '5'); await save('PC');   // PC saves other work; its pad is untouched cloud copy
await settle(4);
{ let ok = true, d = {};
  for (const n of ['AD','IP','PC']) { const s = await get(n, 'sigStrokes'); const p = s && s.pad1; d[n] = p && p.s && p.s.length; ok = ok && !!(p && p.s && p.s.length); }
  const cp = cloud.data.sigStrokes && cloud.data.sigStrokes.pad1; ok = ok && !!(cp && cp.s && cp.s.length);
  chk('F1 signature survives unrelated saves from all sides', ok, JSON.stringify(d)); }
/* F2: fresh signature propagates through a collision */
await reset({ sigStrokes: { pad1: { s: [] } }, npshPsi: '1', _fts: { _root: { npshPsi: AGO(90) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await setDeep('AD', ['sigStrokes', 'pad1'], { s: [{ pts: [{ x: 5, y: 5 }], w: 900, h: 130 }] });
await save('AD');
await set('IP', 'npshPsi', '2'); await save('IP');   // forced collision
await settle(5);
{ let ok = true, d = {};
  for (const n of ['AD','IP','PC']) { const s = await get(n, 'sigStrokes'); const p = s && s.pad1; d[n] = p && p.s && p.s.length; ok = ok && !!(p && p.s && p.s.length); }
  chk('F2 fresh signature survives a colliding save', ok, JSON.stringify(d)); }
/* F3: never-signed pads on TWO devices + one real signature — signature wins everywhere */
await reset({});
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await setDeep('IP', ['sigStrokes', 'pad1'], { s: [] }); await save('IP');
await setDeep('PC', ['sigStrokes', 'pad1'], { s: [] }); await save('PC');
await setDeep('AD', ['sigStrokes', 'pad1'], { s: [{ pts: [{ x: 9, y: 9 }], w: 900, h: 130 }] }); await save('AD');
await settle(6);
{ let ok = true, d = {};
  for (const n of ['AD','IP','PC']) { const s = await get(n, 'sigStrokes'); const p = s && s.pad1; d[n] = p && p.s && p.s.length; ok = ok && !!(p && p.s && p.s.length); }
  const cp = cloud.data.sigStrokes && cloud.data.sigStrokes.pad1; ok = ok && !!(cp && cp.s && cp.s.length);
  chk('F3 one real signature beats two empty pads', ok, JSON.stringify(d)); }

/* ── GROUP G: checklists / flow rows — the families that already worked ─ */
console.log('── G. Item families still safe (regression guard) ──');
/* G1: two devices edit DIFFERENT flow rows — both survive collisions */
await reset({ stdData: [{ pct: '100%', discharge: '150', _ts: AGO(60) }, { pct: '150%', discharge: '200', _ts: AGO(60) }] });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await D('AD').call('set', { path: ['stdData'], value: [{ pct: '100%', discharge: '777', _ts: Date.now() }, { pct: '150%', discharge: '200', _ts: AGO(60) }] });
await save('AD');
await D('IP').call('set', { path: ['stdData'], value: [{ pct: '100%', discharge: '150', _ts: AGO(60) }, { pct: '150%', discharge: '888', _ts: Date.now() }] });
await save('IP');
await settle(6);
{ let ok = true, d = {};
  for (const n of ['AD','IP','PC']) { const s = await get(n, 'stdData') || []; d[n] = s.map(r => r.discharge).join(','); ok = ok && d[n] === '777,888'; }
  chk('G1 different flow rows both survive a collision', ok, JSON.stringify(d)); }
/* G2: newer row edit beats older on the same row */
await reset({ stdData: [{ pct: '100%', discharge: '150', _ts: AGO(60) }] });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await D('AD').call('set', { path: ['stdData'], value: [{ pct: '100%', discharge: '300', _ts: Date.now() - 400 }] }); await save('AD');
await sleep(120);
await D('IP').call('set', { path: ['stdData'], value: [{ pct: '100%', discharge: '400', _ts: Date.now() }] }); await save('IP');
await settle(5);
{ let ok = true, d = {};
  for (const n of ['AD','IP','PC']) { const s = await get(n, 'stdData') || []; d[n] = s[0] && s[0].discharge; ok = ok && d[n] === '400'; }
  chk('G2 same row contested: newer entry wins', ok, JSON.stringify(d)); }
/* G3: scalar war does not disturb the flow table */
await reset({ npshPsi: '10', stdData: [{ pct: '100%', discharge: '150', _ts: AGO(60) }], _fts: { _root: { npshPsi: AGO(60) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
for (let i = 0; i < 3; i++) {
  await set('AD', 'npshPsi', String(20 + i)); await save('AD');
  await set('IP', 'npshPsi', String(30 + i)); await save('IP');
}
await settle(6);
{ let ok = true, d = {};
  for (const n of ['AD','IP','PC']) { const s = await get(n, 'stdData') || []; d[n] = s[0] && s[0].discharge; ok = ok && d[n] === '150'; }
  chk('G3 scalar churn leaves the flow table untouched', ok, JSON.stringify(d)); }
await expectAll('G3 scalar war still converges', 'npshPsi', '32');
auditWire('G3');

/* ── GROUP H: mixed build — one device still on S621 ──────────────────── */
console.log('── H. Mixed-build rollout window (PC still on S621) ──');
/* H1: old-build device re-asserting an older value cannot destroy a newer one */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', OLD, 'S621');
await settle(2);
await set('PC', 'npshPsi', '20'); await save('PC'); await settle(2);   // old build enters 20
await sleep(200);
await set('IP', 'npshPsi', '35'); await save('IP');                    // new build enters 35 later
await settle(6);
{ const vals = {}; for (const n of ['AD','IP']) vals[n] = await get(n, 'npshPsi'); vals.cloud = cloud.data.npshPsi;
  chk('H1 S622 devices + cloud hold the newer entry despite an S621 peer', Object.values(vals).every(v => String(v) === '35'), JSON.stringify(vals)); }
/* H2: old-build device's LATER entry still wins on new devices (fairness both ways) */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', OLD, 'S621');
await settle(2);
await set('IP', 'npshPsi', '35'); await save('IP'); await settle(2);
await sleep(200);
await set('PC', 'npshPsi', '48'); await save('PC');
await settle(6);
{ const vals = {}; for (const n of ['AD','IP']) vals[n] = await get(n, 'npshPsi'); vals.cloud = cloud.data.npshPsi;
  chk('H2 an S621 peer typing LATER still wins on S622 devices', Object.values(vals).every(v => String(v) === '48'), JSON.stringify(vals)); }
/* H3: signature safety with an old-build peer colliding */
await reset({ sigStrokes: { pad1: { s: [{ pts: [{ x: 1, y: 1 }], w: 900, h: 130 }], _ts: AGO(10) } }, npshPsi: '1', _fts: { _root: { npshPsi: AGO(90) } } });
await boot('AD', REPO, 'S622'); await boot('PC', OLD, 'S621');
await settle(2);
await set('PC', 'npshPsi', '2'); await save('PC');
await set('AD', 'npshPsi', '3'); await save('AD');
await settle(5);
{ let ok = true, d = {};
  for (const n of ['AD']) { const s = await get(n, 'sigStrokes'); const p = s && s.pad1; d[n] = p && p.s && p.s.length; ok = ok && !!(p && p.s && p.s.length); }
  const cp = cloud.data.sigStrokes && cloud.data.sigStrokes.pad1; ok = ok && !!(cp && cp.s && cp.s.length);
  chk('H3 signature survives mixed-build collisions', ok, JSON.stringify(d)); }

/* ── GROUP I: chaos & endurance ───────────────────────────────────────── */
console.log('── I. Chaos: rapid interleaves, flapping network, convergence ──');
/* I1: 10 rapid alternating entries across three devices — final entry wins, bounded pushes */
await reset(baseWorld('0', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
const order = ['AD', 'IP', 'PC', 'AD', 'IP', 'PC', 'AD', 'IP', 'PC', 'AD'];
for (let i = 0; i < order.length; i++) { await set(order[i], 'npshPsi', String(100 + i)); await save(order[i]); }
await settle(8);
await expectAll('I1 ten rapid interleaved entries — the tenth wins', 'npshPsi', '109');
auditWire('I1');
/* I2: network flap mid-save */
await reset(baseWorld('10', AGO(60)));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await off('AD'); await set('AD', 'npshPsi', '61'); await save('AD'); await on('AD');
await off('AD'); await on('AD');   // flap
await settle(5);
await expectAll('I2 network flap: the entry still lands', 'npshPsi', '61');
/* I3: quiet system stays quiet (endurance idle) */
await reset(baseWorld('61', Date.now() - 1000));
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(3);
const pQ = patches; await settle(6);
chk('I3 idle three-device system pushes nothing', patches === pQ, `${patches - pQ} idle pushes`);
/* I4: scalar + header + signature + flow row all changed on different devices in one storm */
await reset({ npshPsi: '10', proj: { consultant: 'Old' }, stdData: [{ pct: '100%', discharge: '150', _ts: AGO(60) }],
              sigStrokes: {}, _fts: { _root: { npshPsi: AGO(60) }, proj: { consultant: AGO(60) } } });
await boot('AD', REPO, 'S622'); await boot('IP', REPO, 'S622'); await boot('PC', REPO, 'S622');
await settle(2);
await set('AD', 'npshPsi', '99'); await save('AD');
await setDeep('IP', ['proj', 'consultant'], 'Nasim'); await save('IP');
await D('PC').call('set', { path: ['stdData'], value: [{ pct: '100%', discharge: '555', _ts: Date.now() }] }); await save('PC');
await setDeep('AD', ['sigStrokes', 'pad1'], { s: [{ pts: [{ x: 2, y: 2 }], w: 900, h: 130 }] }); await save('AD');
await settle(8);
{ let ok = true, d = {};
  for (const n of ['AD','IP','PC']) {
    const s = await get(n);
    d[n] = { n: s.npshPsi, c: (s.proj || {}).consultant, f: (s.stdData || [{}])[0].discharge, g: !!(s.sigStrokes && s.sigStrokes.pad1 && s.sigStrokes.pad1.s && s.sigStrokes.pad1.s.length) };
    ok = ok && d[n].n === '99' && d[n].c === 'Nasim' && d[n].f === '555' && d[n].g;
  }
  chk('I4 four-front storm: every edit lands everywhere', ok, JSON.stringify(d)); }
auditWire('I4');

await killAll();
server.close();

console.log(`\n═══ BATTLE COMPLETE: ${pass} passed, ${fail} failed ═══`);
if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log(`  ✗ ${f.name}\n    ${f.detail}`)); }
process.exit(fail ? 1 : 0);
