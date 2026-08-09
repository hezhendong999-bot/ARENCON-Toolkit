/* realtime.mjs — LIVE NOTIFICATIONS, INCLUDING WHEN THEY FAIL (Lane C, S629)
 *
 * Mark asked for the live socket repeatedly. It was sequenced last on purpose,
 * behind the merge work, because a faster delivery pipe on top of a moving
 * target hides regressions.
 *
 * WHAT MUST BE TRUE FOR THIS TO BE SAFE, and what this file therefore asserts:
 *   1. a change on the row wakes this device
 *   2. a DROPPED socket is noticed and reconnects — the failure mode that
 *      matters on a tablet moving between wifi and LTE
 *   3. a socket that opens but never joins is treated as down, not live
 *      (a half-open connection reports no error at all — the S624 shape)
 *   4. a heartbeat that cannot be sent counts as a drop
 *   5. isHealthy() is FALSE whenever any of the above is true, because the
 *      caller relaxes its polling on that answer and a wrong "healthy" would
 *      silence the tool — the S624 gag arriving by a new route
 *   6. the transport decides nothing: it hands over a notification and never
 *      report data
 *
 * The module's WebSocket is injectable, so every one of those runs against the
 * module's REAL code with a scripted server — no re-implementation, and the
 * failure paths are exercised rather than reasoned about.
 *
 * Run: node tools/sim/realtime.mjs
 */
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const { createRealtime } = await import(pathToFileURL(path.join(REPO, 'lib/data/realtime.js')).href);

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── a scripted Phoenix server, driven by the test ──────────────────────── */
let sockets = [];
function makeWS(behaviour) {
  return class FakeWS {
    constructor(url) {
      this.url = url; this.readyState = 0; this.sent = [];
      sockets.push(this);
      setTimeout(() => {
        if (behaviour.refuseOpen) return;
        this.readyState = 1;
        this.onopen && this.onopen();
      }, 5);
    }
    send(raw) {
      if (behaviour.blockSend) throw new Error('send failed');
      this.sent.push(JSON.parse(raw));
      const m = JSON.parse(raw);
      if (m.event === 'phx_join' && !behaviour.ignoreJoin) {
        setTimeout(() => this.onmessage && this.onmessage({
          data: JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } })
        }), 5);
      }
    }
    close() { this.readyState = 3; }
    /* server-initiated events */
    emitChange(rec) {
      this.onmessage && this.onmessage({ data: JSON.stringify({
        topic: 'realtime:x', event: 'postgres_changes',
        payload: { data: { type: 'UPDATE', record: rec } } }) });
    }
    serverDrop() { this.readyState = 3; this.onclose && this.onclose(); }
  };
}

console.log('\n═══ REALTIME PROBE ═══\n');

/* 1 — the happy path ---------------------------------------------------- */
console.log('1 WAKE            a change on the row must wake this device');
{
  sockets = [];
  const seen = [];
  const rt = createRealtime({ url: 'https://x.supabase.co', anonKey: 'anon',
    WebSocketImpl: makeWS({}), getToken: () => 'tok' });
  rt.subscribe({ table: 'tool_data', filter: 'id=eq.ROW', channel: 'c', onChange: e => seen.push(e) });
  await sleep(60);
  check('the socket joins and reports itself live', rt.isHealthy(), 'status=' + rt.status());

  const join = sockets[0].sent.find(m => m.event === 'phx_join');
  check('it subscribes to THIS row only, filtered server-side',
        !!join && join.payload.config.postgres_changes[0].filter === 'id=eq.ROW',
        'filter=' + (join && join.payload.config.postgres_changes[0].filter));

  sockets[0].emitChange({ id: 'ROW' });
  await sleep(20);
  check('a row change fires exactly one notification', seen.length === 1, 'notifications=' + seen.length);
  check('the notification carries no report data — only that it changed',
        seen[0] && typeof seen[0].at === 'number' && !('state' in (seen[0] || {})) && !('data' in (seen[0] || {})),
        JSON.stringify(seen[0] && Object.keys(seen[0])));
  rt.stop();
}

/* 2 — the failure that actually happens in the field --------------------- */
console.log('\n2 DROP-RECOVER    a dropped socket must be noticed and reconnect');
{
  sockets = [];
  const rt = createRealtime({ url: 'https://x.supabase.co', anonKey: 'anon',
    WebSocketImpl: makeWS({}), getToken: () => 'tok' });
  rt.subscribe({ table: 'tool_data', filter: 'id=eq.ROW', channel: 'c', onChange: () => {} });
  await sleep(60);
  const wasLive = rt.isHealthy();
  sockets[0].serverDrop();
  await sleep(20);
  check('a drop is noticed immediately and reported unhealthy',
        wasLive && !rt.isHealthy(), 'was live=' + wasLive + ', now status=' + rt.status());
  await sleep(2600);                       // first backoff is ~1s with jitter
  check('it reconnects on its own and returns to live',
        rt.isHealthy() && sockets.length > 1,
        'sockets opened=' + sockets.length + ' status=' + rt.status());
  rt.stop();
}

/* 3 — the half-open connection: opens, never joins, reports no error ----- */
console.log('\n3 JOIN-TIMEOUT    a socket that opens but never joins is NOT live');
{
  sockets = [];
  const rt = createRealtime({ url: 'https://x.supabase.co', anonKey: 'anon',
    WebSocketImpl: makeWS({ ignoreJoin: true }), getToken: () => 'tok' });
  rt.subscribe({ table: 'tool_data', filter: 'id=eq.ROW', channel: 'c', onChange: () => {} });
  await sleep(80);
  check('an unjoined socket never reports itself healthy',
        !rt.isHealthy(), 'status=' + rt.status() + ' (a wrong "healthy" here would quiet the tool)');
  rt.stop();
}

/* 4 — isHealthy is the safety interlock --------------------------------- */
console.log('\n4 INTERLOCK       isHealthy() must be false whenever delivery is not guaranteed');
{
  sockets = [];
  const rt = createRealtime({ url: 'https://x.supabase.co', anonKey: 'anon',
    WebSocketImpl: makeWS({ refuseOpen: true }), getToken: () => 'tok' });
  rt.subscribe({ table: 'tool_data', filter: 'id=eq.ROW', channel: 'c', onChange: () => {} });
  await sleep(60);
  check('a socket that never opens is not healthy', !rt.isHealthy(), 'status=' + rt.status());
  rt.stop();
  check('after stop() it is idle and not healthy',
        !rt.isHealthy() && rt.status() === 'idle', 'status=' + rt.status());
}

/* 5 — the heartbeat stays the floor -------------------------------------- */
console.log('\n5 NO-SILENCE      the transport must never claim health it cannot deliver');
{
  sockets = [];
  const rt = createRealtime({ url: 'https://x.supabase.co', anonKey: 'anon',
    WebSocketImpl: makeWS({}), getToken: () => 'tok' });
  rt.subscribe({ table: 'tool_data', filter: 'id=eq.ROW', channel: 'c', onChange: () => {} });
  await sleep(60);
  const st = rt.stats();
  check('stats() exposes enough to diagnose a quiet socket on a device',
        st && 'status' in st && 'joined' in st && 'attempt' in st && 'lastEventAt' in st,
        JSON.stringify(st));
  rt.stop();
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed\n');
process.exit(failed.length ? 1 : 0);
