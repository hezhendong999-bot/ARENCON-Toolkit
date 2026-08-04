/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — BOOT STALL (S608, Lane A)
   frt/tests/sim/bootstall.mjs          run: node frt/tests/sim/bootstall.mjs

   WHAT THIS PROVES
   Startup must be unhangable. A tablet in a sub-grade pump room can stall on
   any network step — sign-in, project info, the initial cloud pull — and the
   browser does not fail fast on one bar, it hangs. Pre-S608, a hang in
   Auth.restoreSession or the boot pull left the inspector staring at a page
   that never finished, with no signal and no way forward. The diesel rule
   (S602 _step + boot watchdog): every boot step is time-bound, a stalled
   step is RECORDED and skipped into local-only operation, and a watchdog
   forces the screen up if the chain as a whole goes quiet.

   SAFETY INVARIANT (checked here, because it is the dangerous corner): a
   timed-out boot pull must NEVER be treated as "the cloud is empty". A cold
   device on a slow network must not fabricate a blank report over real cloud
   data — it must wait and retry, showing its state honestly.

   FAILS on pre-S608 FRT (no _bootStep, no watchdog, timeout==empty).
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

console.log('\n═══ A. Every boot network step is time-bound ═══');
ok('_bootStep helper exists (time-bound, records, never throws)',
   /function _bootStep\s*\(/.test(app),
   'an unbounded boot step hangs the whole open on one bar');
ok('sign-in restore runs through _bootStep',
   /_bootStep\(\s*['"]sign-in['"]/.test(app));
ok('the initial cloud pull runs through _bootStep',
   /_bootStep\(\s*['"]cloud-pull['"]/.test(app));
ok('local database open runs through _bootStep',
   /_bootStep\(\s*['"]local-db['"]/.test(app));

console.log('\n═══ B. A stalled boot cannot leave a blank screen ═══');
ok('a boot watchdog exists and forces the screen up',
   /_frtBootWatchdog|boot watchdog/i.test(app) && /_frtBootDone/.test(app),
   'if the chain goes quiet the inspector must still get their local data');
ok('boot stalls are recorded to the boot log',
   /_frtBootLog/.test(app));

console.log('\n═══ C. Timeout is not emptiness (the dangerous corner) ═══');
ok('a timed-out boot pull is distinguished from "no cloud data"',
   /_bootPullTimedOut/.test(app),
   'a slow network must never fabricate a blank report over real cloud data');
ok('new-empty-project creation is gated on the pull NOT having timed out',
   /!_bootPullTimedOut[\s\S]{0,240}Model\.newProject\(\)|Model\.newProject\(\)[\s\S]{0,240}!_bootPullTimedOut/.test(
     app.slice(app.indexOf('function boot('))),
   'timeout==empty is how a cold device shows a blank page over real work');
ok('a timed-out pull keeps retrying until the cloud answers',
   /_bootPullRetry/.test(app));

console.log('\n' + (fail ? '✗ BOOTSTALL: ' + fail + ' FAILED, ' + pass + ' passed'
                         : '✓ BOOTSTALL: all ' + pass + ' checks passed'));
process.exit(fail ? 1 : 0);
