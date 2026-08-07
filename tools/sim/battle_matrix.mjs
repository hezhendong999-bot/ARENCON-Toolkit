/* ═══════════════════════════════════════════════════════════════════════════
 * battle_matrix.mjs — S622f FULL-TOOL BATTLE MATRIX (Mark's order, 06 Aug).
 * Every merge family in the live Diesel spec, exercised ≥15 ways each, with
 * the writer / offline / racer roles ROTATED across the three devices
 * (AD=Android tablet, IP=iPhone, PC=desktop — Mark's fleet), online and
 * offline, against the If-Match mock cloud. Built on the S622 battle
 * infrastructure: three real engine+facade instances in separate processes,
 * real browser online/offline events, wire audit.
 * Run one group:  MATRIX_GROUP=scalars node tools/sim/battle_matrix.mjs
 * Groups: scalars fieldmaps statusmaps valuesets arrays offline heartbeat collision
 * ═════════════════════════════════════════════════════════════════════════*/
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';
const GROUP = (process.env.MATRIX_GROUP || 'all').toLowerCase();

/* ── mock Supabase with If-Match ──────────────────────────────────────── */
const cloud = { data: {}, updatedAt: '2026-08-06T00:00:00Z' };
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
        try { const nd = JSON.parse(body).data; if (nd) { cloud.data = nd; patches++; } } catch (_) {}
        bumpToken();
        return send(200, [{ id: ROW, updated_at: cloud.updatedAt }]);
      }
    }
    return send(200, []);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

/* ── device management (verbatim from battle.mjs) ─────────────────────── */
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
    setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error(`${name}:${cmd}: timeout`)); } }, 25000);
  });
  devices[name] = { child, call };
  return devices[name];
}
const D = n => devices[n];
async function boot(name) { spawnDevice(name, REPO, 'MATRIX'); await D(name).call('init', { row: ROW }); }
async function killAll() { for (const n of Object.keys(devices)) { try { await D(n).call('exit', {}); } catch (_) {} delete devices[n]; } }

/* ── helpers ──────────────────────────────────────────────────────────── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const setDeep = (n, p, v) => D(n).call('set', { path: p, value: v });
const save = n => D(n).call('save', {});
const beat = n => D(n).call('beat', {});
const off = n => D(n).call('offline', {});
const on = n => D(n).call('online', {});
async function screen(n) { const r = await D(n).call('get', {}); return r.screen; }
function dig(o, p) { let c = o; for (const k of p) { if (c == null) return undefined; c = c[k]; } return c; }
async function beatAll(rounds = 2) { for (let i = 0; i < rounds; i++) { for (const n of Object.keys(devices)) await beat(n); } }
const settle = (r = 4) => beatAll(r);
const AGO = m => Date.now() - m * 60000;

async function reset(worldData) {
  await killAll();
  cloud.data = JSON.parse(JSON.stringify(worldData || {}));
  bumpToken();
  patches = 0; rejects412 = 0;
  for (const n of ['AD', 'IP', 'PC']) await boot(n);
  await settle(2);
}

let pass = 0, fail = 0; const failures = [];
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL  ${name}  — ${String(detail).slice(0, 220)}`); }
}
async function expectDeepAll(name, pathArr, want) {
  const vals = {};
  for (const n of Object.keys(devices)) vals[n] = dig(await screen(n), pathArr);
  vals.cloud = dig(cloud.data, pathArr);
  const ok = Object.values(vals).every(v => JSON.stringify(v) === JSON.stringify(want));
  chk(name, ok, JSON.stringify(vals) + ' want ' + JSON.stringify(want));
}
const ROT = [['AD','IP','PC'], ['IP','PC','AD'], ['PC','AD','IP']];   // [writer, second, third]

/* ═══ GROUP 1 — SCALARS (npshPsi, npshPsiPld, testType) ═══════════════ */
async function gScalars() {
  console.log('── SCALARS ──');
  for (const [W, X] of ROT) {
    await reset({ npshPsi: '10', _fts: { _root: { npshPsi: AGO(60) } } });
    await setDeep(W, ['npshPsi'], '41'); await save(W); await settle(3);
    await expectDeepAll(`S1 entry by ${W} propagates to all`, ['npshPsi'], '41');
  }
  for (const [W, X] of ROT) {
    await reset({ npshPsiPld: '5', _fts: { _root: { npshPsiPld: AGO(60) } } });
    await setDeep(W, ['npshPsiPld'], '61'); await save(W);
    await sleep(200);
    await setDeep(X, ['npshPsiPld'], '62'); await save(X); await settle(5);
    await expectDeepAll(`S2 race ${W}→${X}: later entry wins`, ['npshPsiPld'], '62');
  }
  for (const [W, X] of ROT) {
    await reset({ npshPsi: '10', _fts: { _root: { npshPsi: AGO(60) } } });
    await off(W);
    await setDeep(X, ['npshPsi'], '71'); await save(X); await settle(2);
    await sleep(250);
    await setDeep(W, ['npshPsi'], '72'); await save(W);
    await on(W); await settle(6);
    await expectDeepAll(`S3 ${W} offline, typed LATER — wins on reconnect`, ['npshPsi'], '72');
  }
  for (const [W, X] of ROT) {
    await reset({ npshPsiPld: '5', _fts: { _root: { npshPsiPld: AGO(60) } } });
    await off(W);
    await sleep(150);
    await setDeep(W, ['npshPsiPld'], '81'); await save(W);
    await sleep(250);
    await setDeep(X, ['npshPsiPld'], '82'); await save(X); await settle(2);
    await on(W); await settle(6);
    await expectDeepAll(`S4 ${W} offline, typed EARLIER — loses to ${X}`, ['npshPsiPld'], '82');
  }
  for (const [W] of ROT) {
    await reset({ npshPsi: '33', _fts: { _root: { npshPsi: AGO(60) } } });
    await setDeep(W, ['npshPsi'], ''); await save(W); await settle(4);
    await expectDeepAll(`S5 stamped clear by ${W} propagates`, ['npshPsi'], '');
  }
  for (const [W, X] of ROT) {
    await reset({ testType: 'std', ttChosen: true, _fts: { _root: { testType: AGO(60) } } });
    await setDeep(W, ['testType'], 'pld'); await save(W); await settle(3);
    await sleep(200);
    await setDeep(X, ['testType'], 'std'); await save(X); await settle(5);
    await expectDeepAll(`S6 pump-type contested ${W}→${X}: later pick holds`, ['testType'], 'std');
  }
}

/* ═══ GROUP 2 — FIELD MAPS (proj, contractorTrades, smState, annDsForce, smCapVis) ═══ */
async function gFieldmaps() {
  console.log('── FIELD MAPS ──');
  for (const [W] of ROT) {
    await reset({ proj: { 'pm-rpm': '50' }, _fts: { proj: { 'pm-rpm': AGO(60) } } });
    await setDeep(W, ['proj', 'pm-rpm'], '1760'); await save(W); await settle(3);
    await expectDeepAll(`F1 rated speed by ${W} propagates`, ['proj', 'pm-rpm'], '1760');
  }
  for (const [W, X] of ROT) {
    await reset({ proj: { 'pm-rpm': '50' }, _fts: { proj: { 'pm-rpm': AGO(60) } } });
    await setDeep(W, ['proj', 'pm-rpm'], '91'); await save(W);
    await sleep(200);
    await setDeep(X, ['proj', 'pm-rpm'], '92'); await save(X); await settle(5);
    await expectDeepAll(`F2 rated-speed race ${W}→${X}: later wins`, ['proj', 'pm-rpm'], '92');
  }
  for (const [W, X] of ROT) {
    await reset({ proj: { 'pm-rpm': '50' }, _fts: { proj: { 'pm-rpm': AGO(60) } } });
    await off(W);
    await setDeep(X, ['proj', 'pm-rpm'], '53'); await save(X); await settle(2);
    await sleep(250);
    await setDeep(W, ['proj', 'pm-rpm'], '22233'); await save(W);
    await on(W); await settle(7);
    await expectDeepAll(`F3 THE MARK DRIFT: ${W} offline rated-speed — no drift`, ['proj', 'pm-rpm'], '22233');
  }
  for (const [W, X] of ROT) {
    await reset({ proj: { consultant: 'Keep Me' }, _fts: { proj: { consultant: AGO(60) } } });
    await setDeep(W, ['proj', 'consultant'], ''); await save(W); await settle(4);
    const vals = {};
    for (const n of ['AD','IP','PC']) vals[n] = dig(await screen(n), ['proj','consultant']);
    chk(`F4 blank from ${W} never erases the consultant name`, Object.values(vals).every(v => v === 'Keep Me'), JSON.stringify(vals));
  }
  for (const [A, B, C] of ROT) {
    await reset({ contractorTrades: {}, smState: {}, annDsForce: {}, _fts: {} });
    await setDeep(A, ['contractorTrades', 'row1'], 'Sprinkler'); await save(A);
    await setDeep(B, ['smState', 'sm-2'], 'on'); await save(B);
    await setDeep(C, ['annDsForce', 'ann-1'], 'forced'); await save(C);
    await settle(6);
    const a = dig(await screen(B), ['contractorTrades', 'row1']);
    const b = dig(await screen(C), ['smState', 'sm-2']);
    const c = dig(await screen(A), ['annDsForce', 'ann-1']);
    chk(`F5 three maps written by ${A}/${B}/${C} at once — no cross-clobber`,
      a === 'Sprinkler' && b === 'on' && c === 'forced', JSON.stringify({ a, b, c }));
  }
  for (const [W, X] of ROT) {
    await reset({ proj: { 'pm-rpm': '10' }, _fts: { proj: { 'pm-rpm': AGO(60) } } });
    await setDeep(X, ['proj', 'pm-rpm'], '33'); await save(X); await beat(W);
    await setDeep(W, ['proj', 'pm-rpm'], '20');
    await beat(W);
    await save(W); await settle(5);
    await expectDeepAll(`F6 ${W} typing through a pull — typed value wins`, ['proj', 'pm-rpm'], '20');
  }
}

/* ═══ GROUP 3 — STATUS MAPS (clState, sigStrokes, equipState, appendixState) ═══ */
async function gStatusmaps() {
  console.log('── STATUS MAPS ──');
  for (const [W] of ROT) {
    await reset({ clState: {} });
    await setDeep(W, ['clState', 'cl-3a-1'], 'pass'); await save(W); await settle(3);
    await expectDeepAll(`M1 checklist tick by ${W} propagates`, ['clState', 'cl-3a-1'], 'pass');
  }
  for (const [W, X] of ROT) {
    await reset({ clState: {} });
    await setDeep(W, ['clState', 'cl-1'], 'pass'); await save(W);
    await setDeep(X, ['clState', 'cl-2'], 'fail'); await save(X);
    await settle(5);
    const s1 = dig(await screen(X), ['clState', 'cl-1']);
    const s2 = dig(await screen(W), ['clState', 'cl-2']);
    chk(`M2 different checklist items by ${W}/${X} — union, both survive`, s1 === 'pass' && s2 === 'fail', JSON.stringify({ s1, s2 }));
  }
  for (const [W, X] of ROT) {
    await reset({ clState: { 'cl-9': 'na' }, _fts: {} });
    await setDeep(W, ['clState', 'cl-9'], 'pass'); await save(W); await settle(3);
    await sleep(200);
    await setDeep(X, ['clState', 'cl-9'], 'fail'); await save(X); await settle(5);
    await expectDeepAll(`M3 same item contested ${W}→${X}: later wins`, ['clState', 'cl-9'], 'fail');
  }
  for (const [W, X] of ROT) {
    await reset({ sigStrokes: {} });
    await setDeep(W, ['sigStrokes', 'sig-tech'], [[1, 2, 3]]); await save(W);
    await setDeep(X, ['sigStrokes', 'sig-wit'], [[9, 9]]); await save(X);
    await settle(5);
    const a = dig(await screen(X), ['sigStrokes', 'sig-tech']);
    const b = dig(await screen(W), ['sigStrokes', 'sig-wit']);
    chk(`M4 two signatures signed on ${W}/${X} — both survive everywhere`,
      JSON.stringify(a) === JSON.stringify([[1, 2, 3]]) && JSON.stringify(b) === JSON.stringify([[9, 9]]), JSON.stringify({ a, b }));
  }
  for (const [W] of ROT) {
    await reset({ equipState: {}, appendixState: {} });
    await off(W);
    await sleep(150);
    await setDeep(W, ['equipState', 'eq-5'], 'used'); await save(W);
    await on(W); await settle(6);
    await expectDeepAll(`M5 offline equipment tick by ${W} lands on reconnect`, ['equipState', 'eq-5'], 'used');
  }
}

/* ═══ GROUP 4 — VALUE SETS (contractors, distribution) ═══════════════ */
async function gValuesets() {
  console.log('── VALUE SETS ──');
  for (const [W] of ROT) {
    await reset({ contractors: [] });
    await setDeep(W, ['contractors'], ['Acme Fire']); await save(W); await settle(3);
    await expectDeepAll(`V1 contractor added by ${W} propagates`, ['contractors'], ['Acme Fire']);
  }
  for (const [W, X] of ROT) {
    await reset({ contractors: ['Base Co'] });
    await setDeep(W, ['contractors'], ['Base Co', 'North Fire']); await save(W);
    await setDeep(X, ['contractors'], ['Base Co', 'South Sprk']); await save(X);
    await settle(5);
    const v = dig(await screen(W), ['contractors']) || [];
    const ok = v.includes('Base Co') && v.includes('North Fire') && v.includes('South Sprk');
    chk(`V2 adds by ${W}+${X} union — nobody's contractor lost`, ok, JSON.stringify(v));
  }
  for (const [W] of ROT) {
    await reset({ distribution: ['Owner'] });
    await off(W);
    await sleep(150);
    await setDeep(W, ['distribution'], ['Owner', 'AHJ Copy']); await save(W);
    await on(W); await settle(6);
    const v = dig(await screen(W === 'AD' ? 'IP' : 'AD'), ['distribution']) || [];
    chk(`V3 offline distribution add by ${W} lands on reconnect`, v.includes('AHJ Copy'), JSON.stringify(v));
  }
  for (const [W, X] of ROT) {
    await reset({ contractors: [] });
    await setDeep(W, ['contractors'], ['Same Co']); await save(W);
    await setDeep(X, ['contractors'], ['Same Co']); await save(X);
    await settle(5);
    const v = dig(await screen(W), ['contractors']) || [];
    chk(`V4 same value added by ${W}+${X} — no duplicate`, v.filter(x => x === 'Same Co').length === 1, JSON.stringify(v));
  }
  for (const [W, X] of ROT) {
    await reset({ distribution: [] });
    await setDeep(X, ['npshPsi'], '7'); await save(X);              // racer traffic
    await setDeep(W, ['distribution'], ['Site Copy']); await save(W);
    await settle(5);
    const v = dig(await screen(X), ['distribution']) || [];
    chk(`V5 distribution add by ${W} survives ${X}'s racing save`, v.includes('Site Copy'), JSON.stringify(v));
  }
}

/* ═══ GROUP 5 — KEYED ARRAYS (stdData, contractorSignRows, generalDeficiencies, pumpCurvePoints) ═══ */
async function gArrays() {
  console.log('── KEYED ARRAYS ──');
  const stdRow = (pct, rpm) => ({ pct, flow: '', cutsheet: '', placard: '', suction: '', discharge: '', rpm, bfUp: '', bfDown: '' });
  /* Faithful to the real tool: Diesel stamps the EDITED row at the keystroke
     (part06.js S594: stdData[idx]._ts = Date.now()). A matrix write that
     skips this is testing a device that cannot exist. */
  const typed = (row) => ({ ...row, _ts: Date.now() });
  for (const [W] of ROT) {
    await reset({ stdData: [stdRow('100', '')] });
    await setDeep(W, ['stdData'], [typed(stdRow('100', '1745'))]); await save(W); await settle(3);
    const v = (dig(await screen(W === 'PC' ? 'AD' : 'PC'), ['stdData']) || []).find(r => r.pct === '100');
    chk(`A1 flow-row RPM entered on ${W} propagates`, v && v.rpm === '1745', JSON.stringify(v));
  }
  for (const [W, X] of ROT) {
    await reset({ stdData: [stdRow('150', '')] });
    await setDeep(W, ['stdData'], [typed(stdRow('150', '1801'))]); await save(W); await settle(3);
    await sleep(200);
    await setDeep(X, ['stdData'], [typed(stdRow('150', '1802'))]); await save(X); await settle(5);
    const v = (dig(await screen(W), ['stdData']) || []).find(r => r.pct === '150');
    chk(`A2 same row contested ${W}→${X}: later RPM wins`, v && v.rpm === '1802', JSON.stringify(v));
  }
  for (const [W, X] of ROT) {
    await reset({ stdData: [stdRow('100', ''), stdRow('150', '')] });
    await setDeep(W, ['stdData'], [typed(stdRow('100', '1750')), stdRow('150', '')]); await save(W);
    await setDeep(X, ['stdData'], [stdRow('100', ''), typed(stdRow('150', '1830'))]); await save(X);
    await settle(6);
    const rows = dig(await screen(W), ['stdData']) || [];
    const r100 = rows.find(r => r.pct === '100'), r150 = rows.find(r => r.pct === '150');
    chk(`A3 different rows by ${W}/${X} — both readings survive`, r100 && r100.rpm === '1750' && r150 && r150.rpm === '1830', JSON.stringify(rows));
  }
  for (const [W] of ROT) {
    await reset({ contractorSignRows: [{ id: 'r1', name: 'Base' }] });
    await off(W);
    await sleep(150);
    await setDeep(W, ['contractorSignRows'], [{ id: 'r1', name: 'Base' }, { id: 'r2', name: 'Field Add' }]); await save(W);
    await on(W); await settle(6);
    const rows = dig(await screen(W === 'IP' ? 'PC' : 'IP'), ['contractorSignRows']) || [];
    chk(`A4 sign-row appended offline on ${W} lands on reconnect`, rows.some(r => r.id === 'r2'), JSON.stringify(rows.map(r => r.id)));
  }
  for (const [W, X] of ROT) {
    await reset({ generalDeficiencies: [{ id: 'd1', description: 'Valve', status: 'open', responses: [] }] });
    await setDeep(W, ['generalDeficiencies'], [{ id: 'd1', description: 'Valve', status: 'open', responses: [{ id: 'rr1', comment: 'Fixed on site', status: 'closed' }] }]);
    await save(W); await settle(4);
    const d = (dig(await screen(X), ['generalDeficiencies']) || []).find(r => r.id === 'd1');
    const resp = d && (d.responses || []).find(r => r.id === 'rr1');
    chk(`A5 deficiency response by ${W} reaches ${X} (nested)`, resp && resp.comment === 'Fixed on site', JSON.stringify(d));
  }
  for (const [W, X] of ROT) {
    await reset({ pumpCurvePoints: [] });
    await setDeep(W, ['pumpCurvePoints'], [{ id: 'p1', flow: '500', psi: '120', label: 'A' }]); await save(W); await settle(3);
    await setDeep(X, ['pumpCurvePoints'], [{ id: 'p1', flow: '500', psi: '120', label: 'A' }, { id: 'p2', flow: '750', psi: '95', label: 'B' }]); await save(X);
    await settle(5);
    const pts = dig(await screen(W), ['pumpCurvePoints']) || [];
    chk(`A6 curve point add by ${W} then ${X} — both points everywhere`, pts.length === 2 && pts.some(p => p.id === 'p2'), JSON.stringify(pts.map(p => p.id)));
  }
}

/* ═══ GROUP 6 — OFFLINE LIFECYCLE ══════════════════════════════════════ */
async function gOffline() {
  console.log('── OFFLINE LIFECYCLE ──');
  for (const [W, X] of ROT) {
    await reset({ npshPsi: '1', _fts: { _root: { npshPsi: AGO(60) } } });
    await off(W);
    await sleep(120);
    await setDeep(W, ['npshPsi'], '20'); await save(W);      // typed FIRST, offline
    await sleep(250);
    await setDeep(X, ['npshPsi'], '21'); await save(X); await settle(2);   // typed later, online
    await on(W); await settle(6);
    await expectDeepAll(`O1 ${W} offline typed-first honestly loses to ${X}`, ['npshPsi'], '21');
  }
  for (const [W, X] of ROT) {
    await reset({ proj: { consultant: 'Orig' }, _fts: { proj: { consultant: AGO(60) } } });
    await setDeep(X, ['proj', 'consultant'], 'Second'); await save(X); await settle(2);
    await off(W);
    await sleep(200);
    await setDeep(W, ['proj', 'consultant'], 'Third'); await save(W);
    await on(W); await settle(6);
    await expectDeepAll(`O2 ${W} offline typed-later wins (header family)`, ['proj', 'consultant'], 'Third');
  }
  for (const [A, B] of ROT) {
    await reset({ npshPsi: '1', proj: { 'pm-rpm': '1' }, _fts: { _root: { npshPsi: AGO(60) }, proj: { 'pm-rpm': AGO(60) } } });
    await off(A); await off(B);
    await sleep(120);
    await setDeep(A, ['npshPsi'], '30'); await save(A);
    await setDeep(B, ['proj', 'pm-rpm'], '1780'); await save(B);
    await on(A); await settle(3);
    await on(B); await settle(6);
    const n = dig(await screen(B), ['npshPsi']);
    const r = dig(await screen(A), ['proj', 'pm-rpm']);
    chk(`O3 double-offline ${A}+${B}, different fields — both land`, n === '30' && r === '1780', JSON.stringify({ n, r }));
  }
  /* O4 (original) — offline edit surviving a device REFRESH — cannot be
     tested here: the harness's in-memory IndexedDB dies with the process,
     while a real tablet's persists on disk. HARNESS LIMITATION, declared,
     not a product verdict. Replacement O4 below keeps the group ≥15. */
  for (const [W, X] of ROT) {
    await reset({ npshPsi: '1', _fts: { _root: { npshPsi: AGO(60) } } });
    await off(W);
    await sleep(120);
    await setDeep(W, ['npshPsi'], '44'); await save(W);
    await setDeep(X, ['npshPsi'], '45'); await save(X); await settle(1);   // cloud advances once…
    await sleep(200);
    await setDeep(X, ['npshPsi'], '46'); await save(X); await settle(1);   // …and again
    await on(W); await settle(6);
    await expectDeepAll(`O4 ${W} offline vs cloud advanced TWICE — typed-time still rules`, ['npshPsi'], '46');
  }
  for (const [W] of ROT) {
    await reset({ npshPsi: '1', _fts: { _root: { npshPsi: AGO(60) } } });
    await off(W); await sleep(100);
    await setDeep(W, ['npshPsi'], '55'); await save(W);
    await on(W); await sleep(150); await off(W); await sleep(150); await on(W);
    await settle(6);
    await expectDeepAll(`O5 network flap on ${W} — entry still lands once`, ['npshPsi'], '55');
  }
}

/* ═══ GROUP 7 — HEARTBEAT & LIFECYCLE ══════════════════════════════════ */
async function gHeartbeat() {
  console.log('── HEARTBEAT & LIFECYCLE ──');
  for (const [W] of ROT) {
    await reset({ npshPsi: '9', _fts: { _root: { npshPsi: AGO(60) } } });
    const before = patches;
    await settle(6);
    chk(`H1 idle system (${W} watch) — zero pushes over 6 beats`, patches === before, `patches ${before}→${patches}`);
  }
  for (const [W, X] of ROT) {
    await reset({ npshPsi: '9', _fts: { _root: { npshPsi: AGO(60) } } });
    await setDeep(X, ['npshPsi'], '77'); await save(X); await settle(1);
    await D(W).call('wake', {}).catch(() => beat(W));
    await beat(W);
    const v = dig(await screen(W), ['npshPsi']);
    chk(`H2 ${W} wakes and picks up ${X}'s change`, v === '77', v);
  }
  for (const [W, X] of ROT) {
    await reset({ proj: { consultant: 'Persist' }, _fts: { proj: { consultant: AGO(60) } } });
    await settle(2);
    await D(W).call('exit', {}); delete devices[W];
    await boot(W); await settle(3);
    const v = dig(await screen(W), ['proj', 'consultant']);
    chk(`H3 ${W} reboot mid-session — state restored`, v === 'Persist', v);
  }
  for (const [W, X] of ROT) {
    await reset({ npshPsi: '9', _fts: { _root: { npshPsi: AGO(60) } } });
    await setDeep(W, ['npshPsi'], '88'); await save(W);
    await beat(X); await beat(X);
    const v = dig(await screen(X), ['npshPsi']);
    chk(`H4 ${W}'s entry reaches ${X} within two beats`, v === '88', v);
  }
  for (const [W] of ROT) {
    await reset({ npshPsi: '9', _fts: { _root: { npshPsi: AGO(60) } } });
    await settle(3);
    const tok = cloud.updatedAt;
    await settle(3);
    chk(`H5 no-change beats (${W} rotation) never move the cloud token`, cloud.updatedAt === tok, `${tok} → ${cloud.updatedAt}`);
  }
}

/* ═══ GROUP 8 — COLLISION ENGINE ═══════════════════════════════════════ */
async function gCollision() {
  console.log('── COLLISION ENGINE ──');
  for (const [A, B, C] of ROT) {
    await reset({ npshPsi: '1', _fts: { _root: { npshPsi: AGO(60) } } });
    await setDeep(A, ['npshPsi'], '101'); await save(A);
    await sleep(120);
    await setDeep(B, ['npshPsi'], '102'); await save(B);
    await sleep(120);
    await setDeep(C, ['npshPsi'], '103'); await save(C);
    await settle(7);
    await expectDeepAll(`C1 three-front storm ${A}→${B}→${C}: last entry wins`, ['npshPsi'], '103');
  }
  for (const [W] of ROT) {
    await reset({ npshPsi: '1', _fts: { _root: { npshPsi: AGO(60) } } });
    await setDeep(W, ['npshPsi'], '111');
    /* triple simultaneous trigger: save + save + beat, un-awaited — single-flight must coalesce */
    const p1 = save(W), p2 = save(W), p3 = beat(W);
    await Promise.allSettled([p1, p2, p3]);
    await settle(5);
    await expectDeepAll(`C2 triple trigger on ${W} — single-flight converges`, ['npshPsi'], '111');
  }
  for (const [W, X] of ROT) {
    await reset({ proj: { 'pm-rpm': '1' }, _fts: { proj: { 'pm-rpm': AGO(60) } } });
    await off(W);
    await sleep(150);
    await setDeep(W, ['proj', 'pm-rpm'], '1999'); await save(W);
    /* racer hammers while W reconnects — the 22:00 livelock shape */
    await on(W);
    for (let i = 0; i < 3; i++) { await setDeep(X, ['npshPsi'], String(200 + i)); await save(X); await beat(W); }
    await settle(7);
    const v = {};
    for (const n of ['AD','IP','PC']) v[n] = dig(await screen(n), ['proj', 'pm-rpm']);
    v.cloud = dig(cloud.data, ['proj', 'pm-rpm']);
    chk(`C3 ${W} reconnect flush under ${X}'s hammering — lands (backoff)`, Object.values(v).every(x => x === '1999'), JSON.stringify(v));
  }
  for (const [W, X] of ROT) {
    await reset({ npshPsi: '1', proj: { consultant: 'Stay' }, _fts: { _root: { npshPsi: AGO(60) }, proj: { consultant: AGO(60) } } });
    await setDeep(W, ['npshPsi'], '131'); const s1 = save(W);
    await setDeep(X, ['npshPsi'], '132'); const s2 = save(X);
    await Promise.allSettled([s1, s2]);
    await settle(6);
    /* Same-moment entries can mint the SAME millisecond — a genuine tie.
       Either value winning is defensible; what is NOT acceptable is
       divergence. Assert convergence, everywhere, on one of the two. */
    const cv = {};
    for (const n of ['AD','IP','PC']) cv[n] = dig(await screen(n), ['npshPsi']);
    cv.cloud = dig(cloud.data, ['npshPsi']);
    const uniq = [...new Set(Object.values(cv).map(String))];
    chk(`C4 same-moment saves ${W}+${X} — system converges (tie allowed)`,
      uniq.length === 1 && (uniq[0] === '131' || uniq[0] === '132'), JSON.stringify(cv));
  }
  for (const [W, X] of ROT) {
    await reset({ sigStrokes: { 'sig-a': [[1]] }, npshPsi: '1', _fts: { _root: { npshPsi: AGO(60) } } });
    await setDeep(W, ['sigStrokes', 'sig-b'], [[7, 7]]); await save(W);
    await setDeep(X, ['npshPsi'], '141'); await save(X);
    await settle(6);
    const sa = dig(await screen(X), ['sigStrokes', 'sig-a']);
    const sb = dig(await screen(X), ['sigStrokes', 'sig-b']);
    const np = dig(await screen(W), ['npshPsi']);
    chk(`C5 signature + scalar collide (${W}/${X}) — nothing lost`,
      JSON.stringify(sa) === JSON.stringify([[1]]) && JSON.stringify(sb) === JSON.stringify([[7, 7]]) && np === '141',
      JSON.stringify({ sa, sb, np }));
  }
}

/* ═══ RUN ══════════════════════════════════════════════════════════════ */
const groups = { scalars: gScalars, fieldmaps: gFieldmaps, statusmaps: gStatusmaps, valuesets: gValuesets, arrays: gArrays, offline: gOffline, heartbeat: gHeartbeat, collision: gCollision };
const run = GROUP === 'all' ? Object.keys(groups) : [GROUP];
for (const g of run) { if (!groups[g]) { console.error('unknown group', g); process.exit(2); } await groups[g](); }
await killAll();
server.close();
console.log(`\n═══ MATRIX [${run.join(',')}]: ${pass} passed, ${fail} failed ═══`);
if (failures.length) { for (const f of failures) console.log('  ✗', f.name); process.exit(1); }
process.exit(0);
