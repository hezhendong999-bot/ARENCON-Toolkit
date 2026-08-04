/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — TICK HEALTH (S608, Lane A)
   frt/tests/sim/tickhealth.mjs        run: node frt/tests/sim/tickhealth.mjs

   WHAT THIS PROVES
   The FRT listening loop must SAY WHAT IT DID on every beat. Diesel spent
   nineteen sessions choosing between four faults that all produced the same
   panel reading ("save: just now / pull: never") because nothing in the code
   distinguished them. The S602 rule: every exit from the tick records WHY,
   the busy flag cannot be held forever by a hung request, and a probe error
   is never mistaken for "the cloud has not changed".

   HARNESS-FIRST CONTRACT (Lane C directive, 04 Aug): this file FAILS on the
   pre-S608 FRT (the old _checkRemoteForChanges is silent on every early
   exit) and passes once the heartbeat ships. Reads the SHIPPED code at run
   time so it cannot drift from what the field actually runs.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const app = readFileSync(join(ROOT, 'frt', 'js', 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (why ? ' — ' + why : '')); }
}

console.log('\n═══ A. The tick exists and reports every outcome ═══');
ok('FRT has a heartbeat tick (_frtHeartbeatTick)',
   /function _frtHeartbeatTick\s*\(/.test(app),
   'the loop is still the silent pre-S608 _checkRemoteForChanges');
ok('a tick diary exists (_frtTickDiag writes to a ring log)',
   /function _frtTickDiag\s*\(/.test(app) && /_frtTickLog/.test(app));

// Every early-exit reason the diesel forensics identified must be recorded,
// not silently returned.
const tickBody = (() => {
  const m = app.match(/function _frtHeartbeatTick[\s\S]*?\n\}/);
  return m ? m[0] : '';
})();
for (const why of ['offline', 'hidden', 'busy', 'no-user', 'typing-or-saving']) {
  ok("early exit records '" + why + "'",
     tickBody.indexOf("'" + why + "'") >= 0,
     'a silent return here is indistinguishable from a dead loop');
}

console.log('\n═══ B. The busy flag cannot be held forever ═══');
ok('watchdog releases a stuck pull (watchdog-release)',
   tickBody.indexOf('watchdog-release') >= 0,
   'a request that hangs instead of failing must not deafen the session');
ok('the release lives in a finally block',
   /finally\s*\{[\s\S]*?_frtPulling\s*=\s*false/.test(tickBody),
   'a trailing release can be skipped by anything that never returns');
ok('network calls are time-bound (_frtWithTimeout)',
   /_frtWithTimeout\(/.test(tickBody),
   'an unbounded fetch owns the tick on a tablet moving wifi→LTE');

console.log('\n═══ C. A probe error is not a quiet cloud ═══');
ok('probe failures are surfaced (lastProbeError read)',
   tickBody.indexOf('lastProbeError') >= 0,
   'an expired token must not read as "nothing new", forever');

console.log('\n═══ D. Unsent work rides every beat; kept-local re-arms the push ═══');
ok('the tick flushes unsent local work before pulling',
   /_pushDirty/.test(tickBody) && /_pushToCloud/.test(tickBody),
   'S496/S583: whether an edit survives must not depend on push/pull timing');
ok('S605 stats-based re-arm: lastPullKeptLocal → _pushDirty = true',
   /lastPullKeptLocal[\s\S]{0,200}_pushDirty\s*=\s*true/.test(tickBody),
   'a merge that keeps local means this device is AHEAD; the dedupe would stay silent while the cloud keeps the losing value forever');

console.log('\n═══ E. The field can see the diary ═══');
ok('the cloud-dot diagnostic prints the tick timeline',
   /SYNC TIMELINE/.test(app),
   'field tablets have no console; the diary must be on the device');
ok('notable outcomes go to sync_diag (off-device telemetry)',
   /function _frtSyncDiag\s*\(/.test(app) && /sync_diag/.test(app));

console.log('\n' + (fail ? '✗ TICKHEALTH: ' + fail + ' FAILED, ' + pass + ' passed'
                         : '✓ TICKHEALTH: all ' + pass + ' checks passed'));
process.exit(fail ? 1 : 0);
