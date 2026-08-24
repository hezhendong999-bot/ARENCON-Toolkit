/* ══════════════════════════════════════════════════════════════════════════
   PROBE — FRT ON THE SHARED RETENTION LAW (U4, purge half)
                                              frt/tests/sim/retentionlaw.mjs
   RUN:  node frt/tests/sim/retentionlaw.mjs

   WHAT IS AT STAKE. This is the only path in the tool whose output is
   permanent. A wrong verdict is re-typed; a wrong date is corrected; a
   soft-deleted photo is restored. A destroyed photograph is gone from the
   device and from the bucket and there is nothing to restore from. So the
   checks below are weighted toward REFUSING to destroy, not toward tidiness.

   RED BASELINE, MEASURED against live HEAD before this session's change —
   7 passed, 2 failed. Written down exactly as measured, because a probe that
   overstates its own red is worse than no probe: it reports a change as
   proven when most of the checks never moved.
     1-5  PASS ON BOTH ARMS, deliberately. They drive lib/data/photoRetention.js
          itself, which already existed (Lane C, Phase 3). They prove nothing
          about this session — they exist so a later edit to the shared module
          cannot silently weaken the rules FRT now depends on.
     7-8  ALSO PASS ON BOTH ARMS. The old sweep already skipped what it had
          destroyed, and already tombstoned rather than removing. They are here
          as pins on what MUST NOT change while the rest is unified, not as
          evidence of this session's work.
     6,9  FAIL on live HEAD. These two, and only these two, ARE the adoption.

   CHECK 5 IS THE ONE THAT MATTERS MOST. It is the negative control for the
   whole change: FRT used to read only the legacy `deletedDate`. The shared
   law reads the canonical `delAt` first. Nothing behaves differently today,
   because a delete writes both — but the legacy mirror is explicitly
   temporary, and the day it is retired the OLD code would have stopped
   expiring anything at all, silently, forever, with the trash quietly filling
   up and no error anywhere. That is what this change buys.

   WHAT IS DELIBERATELY *NOT* ADOPTED — check 8. The shared module also
   publishes removalOrder/expiredAmong, which exist because Diesel removes a
   purged photo from its array by position. FRT must never do that: it
   converts the record to a tombstone in place and keeps the id and R2 key,
   because removing the record erases the deletion signal and every other
   device still holding that photo re-adds it on the next sync (S43x photo
   resurrection). Check 8 fails if anyone ever "finishes the unification" by
   adopting the splice. That failure would be correct.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = resolve(HERE, '../../js/data/model.js');
const PHOTOS = resolve(HERE, '../../js/ui/photos.js');
const SHELL = resolve(HERE, '../../index.html');
const DAY = 86400000;

let pass = 0, fail = 0;
function check(n, name, ok, detail) {
  if (ok) { pass++; console.log(`  \u2714 ${n}. ${name}`); }
  else { fail++; console.log(`  \u2718 ${n}. ${name}${detail ? '\n       ' + detail : ''}`); }
}

/* Loaded the way the TOOL loads it — a classic script evaluated against a
   window. Requiring it as a CommonJS module would test a path the browser
   never takes, and a harness that does not reproduce the app's wiring proves
   nothing (S666). */
let PR = null, ERR = '';
try {
  const src = readFileSync(resolve(HERE, '../../../lib/data/photoRetention.js'), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  PR = sandbox.window.PhotoRetention;
  if (!PR || typeof PR.isExpired !== 'function') {
    ERR = 'lib/data/photoRetention.js did not publish PhotoRetention onto window';
    PR = null;
  }
} catch (e) { ERR = 'lib/data/photoRetention.js did not load: ' + ((e && e.message) || e); }

function behaviour(n, name, fn) {
  if (ERR) { check(n, name, false, ERR); return; }
  try { fn(); } catch (e) { check(n, name, false, String((e && e.message) || e)); }
}

const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const OPTS = { retentionDays: 90, now: NOW };

console.log('\nFRT ON THE SHARED RETENTION LAW \u2014 U4 (purge half)\n');

/* 1. THE REFUSAL. A deleted photo with no readable deletion time is never
      destroyed. "I do not know when this was deleted" must never be treated
      as "destroy it now" — being wrong about that is unrecoverable. */
behaviour(1, 'a deletion with no readable time is never destroyed', () => {
  const a = PR.isExpired({ deleted: true }, OPTS);
  const b = PR.isExpired({ deleted: true, delAt: 'not-a-date' }, OPTS);
  check(1, 'a deletion with no readable time is never destroyed',
    a === false && b === false, `missing=${a} unparseable=${b}`);
});

/* 2. A photo deleted longer ago than the window IS eligible. Without this the
      trash never empties and the check above would be indistinguishable from
      a law that simply never says yes. */
behaviour(2, 'a photo past the window is eligible', () => {
  const p = { deleted: true, delAt: iso(NOW - 91 * DAY) };
  check(2, 'a photo past the window is eligible', PR.isExpired(p, OPTS) === true);
});

/* 3. Boundary, from the safe side. At 89 days it must still be recoverable. */
behaviour(3, 'a photo inside the window is still safe', () => {
  const p = { deleted: true, delAt: iso(NOW - 89 * DAY) };
  check(3, 'a photo inside the window is still safe', PR.isExpired(p, OPTS) === false);
});

/* 4. A photo nobody deleted is never eligible, whatever its age. */
behaviour(4, 'a live photo is never eligible, however old', () => {
  const p = { delAt: iso(NOW - 900 * DAY) };
  check(4, 'a live photo is never eligible, however old', PR.isExpired(p, OPTS) === false);
});

/* 5. THE POINT OF THE CHANGE. Canonical spelling only, legacy mirror absent —
      exactly what a record looks like once the mirror is retired. FRT's old
      arithmetic read `deletedDate` alone and would have said "not expired"
      here forever. Both the sweep and the countdown are checked, because a
      countdown that disagrees with the sweep is its own defect. */
behaviour(5, 'canonical-only records are read (the old rule went blind here)', () => {
  const p = { deleted: true, delAt: iso(NOW - 120 * DAY) };
  const oldRule = (p.deletedDate ? new Date(p.deletedDate).getTime() : 0) > 0;
  check(5, 'canonical-only records are read (the old rule went blind here)',
    PR.isExpired(p, OPTS) === true && PR.daysLeft(p, OPTS) === 0 && oldRule === false,
    `shared=${PR.isExpired(p, OPTS)} daysLeft=${PR.daysLeft(p, OPTS)} oldRuleCouldRead=${oldRule}`);
});

/* 6-9. THE SHIPPED HOST — read from the bytes on disk, not from intent. */
const model = readFileSync(MODEL, 'utf8');
const photos = readFileSync(PHOTOS, 'utf8');
const shell = readFileSync(SHELL, 'utf8');

const sweep = (model.match(/purgeExpiredPhotos:[\s\S]*?\n  \},/) || [''])[0];

check(6, 'the sweep asks the shared law instead of doing its own arithmetic',
  /_pr\.isExpired\(/.test(sweep) && !/cutoff\s*=\s*Date\.now\(\)/.test(sweep),
  'a second copy of "has this expired" is how the countdown and the sweep drift apart');

check(7, 'the sweep still refuses to reconsider a photo it already destroyed',
  /p\.purged/.test(sweep),
  'without this every purged tombstone qualifies again on every load, re-saving the whole report each time');

check(8, 'FRT still tombstones in place \u2014 it never removes the record',
  /_makePurgedTombstone\(/.test(sweep)
  && !/splice\(/.test(sweep)
  && !/_pr\.(expiredAmong|removalOrder)\(/.test(model),
  'removing the record erases the deletion signal and other devices resurrect the photo (S43x). '
  + 'NOTE: this tests for CALLS, not for the words — the comment in model.js explaining why '
  + 'these two are not adopted names them, and a substring test read that as using them.');

check(9, 'the law is actually loaded by the tool shell, and the countdown uses it',
  /lib\/data\/photoRetention\.js/.test(shell)
  && /PhotoRetention\.DEFAULT_RETENTION_DAYS/.test(photos)
  && /pr\.daysLeft\(/.test(photos),
  'a second retention number typed by hand is how two numbers that must agree stop agreeing');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
