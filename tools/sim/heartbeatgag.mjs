/* heartbeatgag.mjs — THE ANDROID STALL, REPRODUCED (Lane C, S624)
 *
 * THE FIELD EVENT. 07 Aug, device and-ceerf7: sync_diag output stops dead at
 * 21:22Z while the phone and PC keep going. A typed value strands. Tapping out
 * of the field does nothing. Only a refresh recovers.
 *
 * THE MECHANISM UNDER TEST is a request that HANGS rather than fails.
 * _syncHeartbeat() opened with `if(_syncLock || _heartbeatRunning) return;`,
 * raised the flag, awaited CloudSync.heartbeatTick(), and lowered it after.
 * A REJECTED tick was always survivable — the catch ran and the flag came down.
 * A promise that NEVER SETTLES was not: the await never returns, the flag stays
 * up, and every later beat returns at the gate BEFORE reaching anything that
 * would log. The loop is alive and permanently silent, which is why the device
 * could not even report its own condition.
 *
 * The engine's own TICK_WATCHDOG_MS is no help: it guards a flag INSIDE
 * heartbeatTick, and the outer gate stops heartbeatTick ever being called.
 *
 * WHY THIS HARNESS EXISTS AT ALL. Every other harness drives the ENGINE. This
 * defect lives in the HOST — the timer and the gate that decide whether the
 * engine is called at all. 54 battle scenarios, 129 matrix scenarios and 167
 * converge checks all passed while the tablet sat mute in Mark's hand. A defect
 * no harness can execute is a defect that ships.
 *
 * HOW IT AVOIDS TESTING A STRAW MAN. An earlier draft of this file tested a
 * TRANSCRIPTION of the shipped loop, because that loop lives inside the Diesel
 * app shell and cannot be imported. That was honest but weak — a transcription
 * can drift into testing something easier than the real thing. This version
 * extracts the heartbeat region VERBATIM from the file and evaluates it in a
 * VM against stubs, and the fail-first arm extracts the same region from the
 * PRE-FIX file as it existed at the commit before the fix. Both arms therefore
 * run real shipped bytes. Nothing here is re-implemented.
 *
 * Run:  node tools/sim/heartbeatgag.mjs                    (the working tree)
 *       HB_SRC=/path/to/old/part06d.js node ...            (any other revision)
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path'; import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SRC  = process.env.HB_SRC || path.join(REPO, 'diesel-app/js/part06d.js');

/* ── extract the shipped heartbeat region, verbatim ─────────────────────── */
function extractRegion(src) {
  const start = src.indexOf('/* ──── Heartbeat Sync with Guards');
  if (start < 0) throw new Error('heartbeat region marker not found — did the file move?');
  const fnAt = src.indexOf('async function _syncHeartbeat(){', start);
  if (fnAt < 0) throw new Error('_syncHeartbeat not found after the marker');
  let i = src.indexOf('{', fnAt), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeWorld(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://arencon.app/' });
  const w = dom.window;
  const diag = [];
  let tickCalls = 0;
  let visibility = 'visible';
  Object.defineProperty(w.document, 'visibilityState', { get: () => visibility, configurable: true });
  Object.defineProperty(w.document, 'hidden', { get: () => visibility !== 'visible', configurable: true });

  const CloudSync = {
    isInitialized: true,
    hasPendingSync: false,
    reportDiag: (event, detail) => diag.push({ event, detail }),
    heartbeatTick: () => {
      tickCalls++;
      /* THE HUNG REQUEST: neither resolves nor rejects, exactly as a socket
         stranded by a WiFi handover or a captive portal behaves. */
      if (opts.hang && tickCalls === 1) return new Promise(() => {});
      return Promise.resolve();
    }
  };

  /* In a browser, `window` IS the global object, so the shipped code's bare
     `ArcSyncCadence` reference resolves through it. A VM context has a separate
     global, so a stub placed only on `window` is invisible and the code falls
     back to its default — which made this harness report a product fault that
     did not exist. Publish in BOTH places, and expose a setter that does the
     same, so the sandbox matches the page it claims to model. */
  const setCadence = (obj) => { w.ArcSyncCadence = obj; ctx.ArcSyncCadence = obj; };

  const ctx = vm.createContext({
    window: w, document: w.document, navigator: w.navigator,
    setInterval: (...a) => w.setInterval(...a), clearInterval: (...a) => w.clearInterval(...a),
    setTimeout: (...a) => w.setTimeout(...a), clearTimeout: (...a) => w.clearTimeout(...a),
    console, Object, Promise, Date, Math, Error, String,
    CloudSync, _csHubMode: true, _csProjectId: 'p1'
  });
  vm.runInContext(extractRegion(fs.readFileSync(SRC, 'utf8')), ctx);

  /* Shrink the production constants INSIDE the sandbox so the probe runs in
     seconds. The file's real values are untouched. On the pre-fix arm these
     names do not exist, which is itself the defect being demonstrated. */
  const hasGuards = vm.runInContext('typeof HB_TICK_TIMEOUT_MS !== "undefined"', ctx);
  if (hasGuards) vm.runInContext('HB_TICK_TIMEOUT_MS = 300; HB_GAG_WATCHDOG_MS = 700; HB_STALE_FLOOR_MS = 500;', ctx);
  return { ctx, w, diag, hasGuards, setCadence,
           tick: () => tickCalls, setVisibility: v => { visibility = v; } };
}

console.log('\n═══ HEARTBEAT GAG PROBE ═══');
console.log('source: ' + SRC + '\n');

/* 1 — THE FIELD SYMPTOM -------------------------------------------------- */
console.log('1 GAG-RELEASE     a tick that never settles must not silence the loop forever');
{
  const W = makeWorld({ hang: true });
  vm.runInContext('_syncHeartbeat();', W.ctx);
  await sleep(120);
  const during = W.tick();
  vm.runInContext('_syncHeartbeat();', W.ctx);      // correctly blocked — still inside the window
  await sleep(900);                                  // past both the timeout and the watchdog
  vm.runInContext('_syncHeartbeat();', W.ctx);
  await sleep(200);
  check('a later beat reaches the engine after a hung tick',
        W.tick() > during, 'ticks during hang=' + during + ', after=' + W.tick() + ' (want an increase)');
  check('the timeout is recorded, not silent',
        W.diag.some(d => d.detail && d.detail.outcome === 'heartbeat-tick-timeout'),
        'outcomes seen: ' + JSON.stringify(W.diag.map(d => d.detail && d.detail.outcome)));
}

/* 2 — THE BACKSTOP ------------------------------------------------------- */
console.log('\n2 FLAG-WATCHDOG   a flag raised past the watchdog is force-released AND reported');
{
  const W = makeWorld({});
  vm.runInContext('_heartbeatRunning = true;', W.ctx);
  if (W.hasGuards) vm.runInContext('_hbRaisedAt = Date.now() - 5000;', W.ctx);
  vm.runInContext('_syncHeartbeat();', W.ctx);
  await sleep(150);
  const rel = W.diag.find(d => d.detail && d.detail.outcome === 'heartbeat-gag-released');
  check('force-release emits heartbeat-gag-released carrying its evidence',
        !!rel && typeof rel.detail.heldForMs === 'number' &&
        'visibilityState' in rel.detail && 'online' in rel.detail,
        rel ? JSON.stringify(rel.detail) : 'not emitted');
  check('the beat proceeds after the force-release', W.tick() >= 1, 'ticks=' + W.tick());
}

/* 3 — THE TIMER ITSELF DIES (Android backgrounding) ---------------------- */
console.log('\n3 TIMER-LIVENESS  a timer that stopped firing must be restarted on return');
{
  const W = makeWorld({});
  vm.runInContext('_startHeartbeat();', W.ctx);
  const had = !!W.w._syncHeartbeatTimer;
  vm.runInContext('clearInterval(window._syncHeartbeatTimer); window._syncHeartbeatTimer = null;', W.ctx);
  W.setVisibility('visible');
  W.w.document.dispatchEvent(new W.w.Event('visibilitychange'));
  await sleep(200);
  check('the heartbeat timer is restored when the person returns',
        had && !!W.w._syncHeartbeatTimer, 'timer before=' + had + ' after=' + !!W.w._syncHeartbeatTimer);
  check('the restart is reported, not silent',
        W.diag.some(d => d.detail && d.detail.outcome === 'heartbeat-timer-restarted'),
        'outcomes seen: ' + JSON.stringify(W.diag.map(d => d.detail && d.detail.outcome)));
}

/* 4 — VISIBLE STALENESS, AND THAT IT FOLLOWS THE CADENCE ----------------- */
console.log('\n4 STALENESS       the threshold must be read from the scheduler, not hardcoded');
{
  const W = makeWorld({});
  if (!W.hasGuards) {
    check('fresh is not stale; long-silent is stale', false, 'no staleness support in this revision');
    check('threshold tracks the cadence (3 intervals, with a floor)', false, 'no staleness support in this revision');
  } else {
    vm.runInContext('HB_STALE_FLOOR_MS = 1000;', W.ctx);
    W.setCadence({ desiredIntervalMs: () => 100, wake: () => {} });   // threshold -> the 1000ms floor
    vm.runInContext('_hbLastDoneAt = Date.now();', W.ctx);
    const fresh = vm.runInContext('_hbIsStale()', W.ctx);
    vm.runInContext('_hbLastDoneAt = Date.now() - 5000;', W.ctx);
    const old = vm.runInContext('_hbIsStale()', W.ctx);
    check('fresh is not stale; long-silent is stale',
          fresh === false && old === true, 'fresh=' + fresh + ' old=' + old);
    /* The whole point of the design: retune the cadence and the threshold
       follows, with nothing to revisit here. */
    W.setCadence({ desiredIntervalMs: () => 60000, wake: () => {} });
    const at60 = vm.runInContext('_hbStaleThresholdMs()', W.ctx);
    W.setCadence({ desiredIntervalMs: () => 15000, wake: () => {} });
    const at15 = vm.runInContext('_hbStaleThresholdMs()', W.ctx);
    const floor = vm.runInContext('HB_STALE_FLOOR_MS', W.ctx);
    check('threshold tracks the cadence (3 intervals, with a floor)',
          at60 === 180000 && at15 === Math.max(45000, floor),
          '60s cadence -> ' + at60 + 'ms, 15s cadence -> ' + at15 + 'ms, floor ' + floor + 'ms');
  }
}

/* 5 — NEGATIVE CONTROL --------------------------------------------------- */
console.log('\n5 QUIET-WHEN-WELL a healthy heartbeat must emit no liveness telemetry at all');
{
  const W = makeWorld({});
  for (let i = 0; i < 3; i++) { vm.runInContext('_syncHeartbeat();', W.ctx); await sleep(80); }
  check('three healthy beats produce no liveness noise',
        W.diag.length === 0 && W.tick() === 3,
        'diag rows=' + W.diag.length + ' ticks=' + W.tick());
  check('the flag is down after healthy beats',
        vm.runInContext('_heartbeatRunning === false', W.ctx), '');
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed\n');
process.exit(failed.length ? 1 : 0);
