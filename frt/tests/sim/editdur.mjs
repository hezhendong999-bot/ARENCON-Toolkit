/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — EDIT DURABILITY ACROSS A KILL (S676, Lane A, from Lane C's order)
   frt/tests/sim/editdur.mjs        run: node frt/tests/sim/editdur.mjs

   Three clocks run after an inspector acts: the CLAIM (entry-time ledger,
   durable at 500ms), the VALUE (the model's own IDB save, 800ms), and the
   ARGUABLE moment (the cloud push, seconds later). Kill in between and — in
   FRT specifically — the value was durable on disk but UNREACHABLE: hub boot
   never read the model's own store, so any edit killed before its cloud push
   vanished at relaunch. S676 adds the boot barrier, the durability door
   (value rides with its claim), the wide-edit triggers, and boot recovery
   (relaunch renders the device's own newer saved state and the boot pull
   MERGES instead of adopting).

   Two REAL devices per arm, separate processes, own engines, own IndexedDB,
   colliding on If-Match through a mock cloud with ONE honest clock. A kill
   is a process kill; the relaunch is seeded with exactly what was durable at
   the moment of death — nothing more (battle_device S625 pattern).

   1  TYPE-KILL       typed pin comment, killed at ~0.7s, survives relaunch
                      and reaches the other device
   2  TAP-KILL        a status tap (no form event), same kill, same standard
   3  PEN-KILL        a stamped edit announced only by pointerup, same
   4  SILENT ARRIVAL  a record landing with NO DOM event, killed after the
                      5s sweep window, survives and propagates
   5  NEGATIVE        nothing a relaunched device pushes wears a stamp minted
                      after the relaunch (no stale value is re-dated)
   6  NEGATIVE        an idle session with the sweep running sends nothing —
                      the device's PATCH count stays at its seed value
   7  NEGATIVE        a colleague's LATER edit of the same field still beats
                      the locally-recovered earlier one — both devices converge

   Arms run CONCURRENTLY on separate cloud rows (loads the core — the
   single-process leniency that hid earlier bugs is exactly what this avoids).

   Run: node frt/tests/sim/editdur.mjs          [BASE_ROOT=<tree>] [VERBOSE=1]
   Deps: npm i jsdom fake-indexeddb  (resolvable from the tree root)
   ═══════════════════════════════════════════════════════════════════════════ */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../../..');

/* ── mock Supabase: ONE honest clock, one row per arm ──────────────────── */
const rows = {};   // rowId → { data, updatedAt, patches, gets }
let tick = 0;
const row = id => rows[id] || (rows[id] = { data: {}, updatedAt: new Date(tick = Math.max(Date.now(), tick + 1)).toISOString(), patches: 0 });
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
      const idm = /id=eq\.([a-z0-9-]+)/i.exec(u);
      const R = row(idm ? idm[1] : 'default');
      if (req.method === 'GET' && u.includes('select=updated_at')) return send(200, [{ updated_at: R.updatedAt }]);
      if (req.method === 'GET') return send(200, [{ id: idm ? idm[1] : 'default', project_id: 'p1', tool_key: 'frt', instance_number: 1, data: R.data, updated_at: R.updatedAt, status: 'draft' }]);
      if (req.method === 'PATCH') {
        const im = req.headers['if-match'];
        if (im && String(im).replace(/"/g, '') !== R.updatedAt) return send(412, {});
        try { const nd = JSON.parse(b).data; if (nd) R.data = nd; } catch (_) {}
        R.patches++;
        tick = Math.max(Date.now(), tick + 1);           // one clock, monotonic, honest
        R.updatedAt = new Date(tick).toISOString();
        return send(200, [{ id: idm ? idm[1] : 'default', instance_number: 1, updated_at: R.updatedAt }]);
      }
    }
    return send(200, []);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

/* ── device plumbing (pincomment.mjs pattern) ──────────────────────────── */
let msgId = 0; const live = new Set();
function dev(name, rowId) {
  const child = spawn(process.execPath, [path.join(HERE, 'frt_device.mjs')], {
    cwd: REPO,
    env: { ...process.env, DEV_ROOT: REPO, CLOUD_BASE: `http://127.0.0.1:${PORT}`, DEVICE_ID: name, ROW_ID: rowId },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  live.add(child);
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
  return {
    child,
    kill() { try { child.kill('SIGKILL'); } catch (_) {} live.delete(child); },
    call(cmd, ex) {
      const id = ++msgId;
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(name + ':' + cmd + ' timeout')), 25000);
        pend[id] = m => { clearTimeout(t); res(m); };
        child.stdin.write(JSON.stringify({ id, cmd, ...(ex || {}) }) + '\n');
      });
    }
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (!ok && d ? '\n          ' + d : '')); };

const obsOf = src => {
  const c = ((src && src.contractors) || [])[0]; if (!c) return null;
  const d = (c.deficiencies || [])[0]; if (!d) return null;
  return (d.observations || [])[0] || null;
};
const deficOf = src => {
  const c = ((src && src.contractors) || [])[0]; if (!c) return null;
  return (c.deficiencies || [])[0] || null;
};

/* seed a row: A creates the report and pushes it; returns ids.
   HARNESS NOTE (from pincomment.mjs): a device must HEAR the row before it
   can publish to it — the engine drops a push it has no ancestor token for.
   Every device opens with a pull, exactly as a real session does. */
async function seed(rowId, A) {
  await A.call('pull');
  const np = await A.call('newproject');
  await A.call('push');
  /* settle the push's post-success bookkeeping (snapshot deep clone +
     persist) BEFORE any arm mutates: without a real Worker the inline
     serialize can share references with the model for a beat, and a
     mutation inside that beat leaks into the snapshot — a harness-only
     artifact a real tablet cannot produce (its worker structured-clones). */
  await sleep(350);
  return { ctrId: np.ctrId, deficId: np.deficId };
}

/* wait until the device's 'projects' IDB record shows the marker (door write),
   or the cap elapses — returns ms waited. Reads DISK, not memory. */
async function waitDoorWrite(A, projId, test, capMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    const r = await A.call('idbget', { store: 'projects', key: projId });
    if (r.rec && test(r.rec)) return Date.now() - t0;
    await sleep(120);
  }
  return -1;
}

/* ── ARM 1: type-kill ──────────────────────────────────────────────────── */
async function arm1() {
  const R = 'a1000000-0000-4000-8000-000000000001';
  let A = dev('a1-A', R); const B = dev('a1-B', R);
  const ids = await seed(R, A);
  await B.call('pull');
  const projId = (await A.call('get')).proj.id;
  await A.call('edit', { kind: 'type', fn: 'updateObservation', args: [ids.deficId, 0, 'TYPED-BEFORE-KILL'] });
  /* kill the moment the value is durable ON DISK (door at ~500ms on an S676
     tree; the old 800ms debounce on a pre-S676 tree) — the pre-S676 red is
     not the timing, it is that the old boot cannot REACH this record. */
  await waitDoorWrite(A, projId, rec => { const o = obsOf(rec); return !!o && o.text === 'TYPED-BEFORE-KILL'; }, 2500);
  const snap = (await A.call('snapshot')).store; // exactly what is durable at the moment of death
  A.kill();
  A = dev('a1-A2', R);
  await A.call('restore', { store: snap });
  await A.call('boot');
  await A.call('push');                          // the S155 safety push every FRT boot performs
  await B.call('pull');
  const bObs = obsOf((await B.call('get')).proj);
  check('1  type-kill: typed comment survives the kill and reaches the colleague',
    !!bObs && bObs.text === 'TYPED-BEFORE-KILL', 'B sees: ' + JSON.stringify(bObs && bObs.text));
  A.kill(); B.kill();
}

/* ── ARM 2: tap-kill ───────────────────────────────────────────────────── */
async function arm2() {
  const R = 'a2000000-0000-4000-8000-000000000002';
  let A = dev('a2-A', R); const B = dev('a2-B', R);
  const ids = await seed(R, A);
  await B.call('pull');
  const projId = (await A.call('get')).proj.id;
  await A.call('edit', { kind: 'tap', fn: 'updateDeficStatus', args: [ids.deficId, 'closed'] });
  await waitDoorWrite(A, projId, rec => { const d = deficOf(rec); return !!d && d.status === 'closed'; }, 2500);
  const snap = (await A.call('snapshot')).store;
  A.kill();
  A = dev('a2-A2', R);
  await A.call('restore', { store: snap });
  await A.call('boot');
  await A.call('push');
  await B.call('pull');
  const bDef = deficOf((await B.call('get')).proj);
  check('2  tap-kill: a status answered by a TAP survives the kill and propagates',
    !!bDef && bDef.status === 'closed', 'B sees status: ' + JSON.stringify(bDef && bDef.status));
  A.kill(); B.kill();
}

/* ── ARM 3: pen-kill (a stamped edit announced only by pointerup) ─────── */
async function arm3() {
  const R = 'a3000000-0000-4000-8000-000000000003';
  let A = dev('a3-A', R); const B = dev('a3-B', R);
  const ids = await seed(R, A);
  await B.call('pull');
  const projId = (await A.call('get')).proj.id;
  await A.call('edit', { kind: 'pen', fn: 'updateObservation', args: [ids.deficId, 0, 'PEN-ANNOUNCED-EDIT'] });
  await waitDoorWrite(A, projId, rec => { const o = obsOf(rec); return !!o && o.text === 'PEN-ANNOUNCED-EDIT'; }, 2500);
  const snap = (await A.call('snapshot')).store;
  A.kill();
  A = dev('a3-A2', R);
  await A.call('restore', { store: snap });
  await A.call('boot');
  await A.call('push');
  await B.call('pull');
  const bObs = obsOf((await B.call('get')).proj);
  check('3  pen-kill: an edit announced only by pointerup survives and propagates',
    !!bObs && bObs.text === 'PEN-ANNOUNCED-EDIT', 'B sees: ' + JSON.stringify(bObs && bObs.text));
  A.kill(); B.kill();
}

/* ── ARM 4: silent arrival — no DOM event; only the 5s sweep may notice ── */
async function arm4() {
  const R = 'a4000000-0000-4000-8000-000000000004';
  let A = dev('a4-A', R); const B = dev('a4-B', R);
  const ids = await seed(R, A);
  await B.call('pull');
  const seedProj = (await A.call('get')).proj;
  const projId = seedProj.id;
  const seedObsN = (deficOf(seedProj).observations || []).length;   // a new pin is born with observations — count them, don't assume
  await A.call('edit', { kind: 'silent', fn: 'addObservation', args: [ids.deficId] });
  /* wait for the sweep (≤5s) + stamp (0.5s) to make the record durable ON
     DISK — poll the store itself, then kill. Killing inside the sweep window
     is the documented unrecoverable case, not this arm. */
  const waited = await waitDoorWrite(A, projId,
    rec => !!(deficOf(rec) && (deficOf(rec).observations || []).length >= seedObsN + 1), 7000);
  const snap = (await A.call('snapshot')).store;
  A.kill();
  A = dev('a4-A2', R);
  await A.call('restore', { store: snap });
  await A.call('boot');
  await A.call('push');
  await B.call('pull');
  const bDef = deficOf((await B.call('get')).proj);
  check('4  silent arrival: a record landing with NO event survives via the sweep',
    !!bDef && (bDef.observations || []).length >= seedObsN + 1,
    'door-write waited ' + waited + 'ms; seeded=' + seedObsN + '; B sees obs count: ' + (bDef ? (bDef.observations || []).length : 'none'));
  A.kill(); B.kill();
}

/* ── ARM 5: NEGATIVE — nothing pushed after relaunch wears a fresh mint ── */
async function arm5() {
  const R = 'a5000000-0000-4000-8000-000000000005';
  let A = dev('a5-A', R);
  const ids = await seed(R, A);
  await A.call('edit', { kind: 'type', fn: 'updateObservation', args: [ids.deficId, 0, 'STAMP-HONESTY'] });
  await sleep(700);
  const killAt = Date.now();
  const snap = (await A.call('snapshot')).store;
  A.kill();
  await sleep(1500);                              // a visible gap before the relaunch
  A = dev('a5-A2', R);
  await A.call('restore', { store: snap });
  const relaunchAt = Date.now();
  await A.call('boot');
  await A.call('push');
  const cObs = obsOf(row(R).data);
  const ts = cObs && cObs._ts;
  /* whatever the relaunched device pushed for that observation, its entry
     stamp must predate the relaunch — recovery may carry a stamp, never mint
     one. (Mock clock is anchored to Date.now(), so frames are comparable.) */
  const ok = !ts || ts < relaunchAt - 200;
  check('5  NEGATIVE: no value pushed after relaunch wears a post-relaunch stamp',
    ok, 'obs._ts=' + ts + ' relaunchAt=' + relaunchAt + ' killAt=' + killAt);
  A.kill();
}

/* ── ARM 6: NEGATIVE — an idle session invents nothing ─────────────────── */
async function arm6() {
  const R = 'a6000000-0000-4000-8000-000000000006';
  const A = dev('a6-A', R);
  await seed(R, A);
  const patchesAtSeed = row(R).patches;
  const dataAtSeed = JSON.stringify(row(R).data);
  await sleep(11000);                             // two idle sweeps with the flag raised
  const net = (await A.call('net')).net;
  const ok = row(R).patches === patchesAtSeed && JSON.stringify(row(R).data) === dataAtSeed;
  check('6  NEGATIVE: idle device with the sweep running sends nothing new',
    ok, 'patches ' + patchesAtSeed + '→' + row(R).patches + ' net=' + JSON.stringify(net));
  A.kill();
}

/* ── ARM 7: NEGATIVE — a colleague\'s LATER entry still wins ────────────── */
async function arm7() {
  const R = 'a7000000-0000-4000-8000-000000000007';
  let A = dev('a7-A', R); const B = dev('a7-B', R);
  const ids = await seed(R, A);
  await B.call('pull');
  await A.call('edit', { kind: 'type', fn: 'updateObservation', args: [ids.deficId, 0, 'A-EARLIER'] });
  await sleep(700);
  const snap = (await A.call('snapshot')).store;
  A.kill();
  await sleep(400);
  /* B edits the SAME observation, strictly LATER, and pushes it */
  await B.call('edit', { kind: 'type', fn: 'updateObservation', args: [ids.deficId, 0, 'B-LATER'] });
  await sleep(700);
  await B.call('push');
  /* A relaunches with its recovered earlier edit and pushes through the law */
  A = dev('a7-A2', R);
  await A.call('restore', { store: snap });
  await A.call('boot');
  await A.call('push');
  await B.call('pull');
  const aObs = obsOf((await A.call('get')).proj);
  const bObs = obsOf((await B.call('get')).proj);
  const ok = !!aObs && !!bObs && aObs.text === 'B-LATER' && bObs.text === 'B-LATER';
  check('7  NEGATIVE: the colleague\'s later entry beats the recovered earlier one — both converge',
    ok, 'A sees ' + JSON.stringify(aObs && aObs.text) + ' / B sees ' + JSON.stringify(bObs && bObs.text));
  A.kill(); B.kill();
}

/* ── run all arms concurrently on their own rows ───────────────────────── */
const t0 = Date.now();
try {
  await Promise.all([arm1(), arm2(), arm3(), arm4(), arm5(), arm6(), arm7()]);
} catch (e) {
  console.error('PROBE ERROR:', e && e.message);
  results.push({ n: 'probe-error', ok: false });
}
for (const c of live) { try { c.kill('SIGKILL'); } catch (_) {} }
server.close();
const fails = results.filter(r => !r.ok).length;
console.log('\n' + (fails ? 'RED' : 'GREEN') + '  ' + (results.length - fails) + '/' + results.length +
  ' arms in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's  (tree: ' + REPO + ')');
process.exit(fails ? 1 : 0);
