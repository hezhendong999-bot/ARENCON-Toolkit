/* ══════════════════════════════════════════════════════════════════════════
   PROBE — FRT ON THE SHARED PHOTO-DELETION LAW (U4, reading/recording half)
                                                 frt/tests/sim/deletionlaw.mjs
   RUN:  node frt/tests/sim/deletionlaw.mjs

   SCOPE. This covers the half that only READS and RECORDS: whether a photo is
   deleted, how a delete is recorded, how a restore is recorded. THE PURGE HALF
   IS NOT COVERED AND IS NOT SHIPPED — a purge is the one operation in the
   toolkit that cannot be undone, and it does not go out without a two-device
   check on a sacrificial project.

   RED BASELINE, measured (not assumed) against the pre-U4 model and shell:
     5-7  FAIL — the model recorded deletes and restores by hand, and the page
                 never loaded the shared law at all. These three ARE the
                 adoption, and they are the only checks that move.
     1-4  PASS ON BOTH ARMS, deliberately. They characterise the law FRT now
                 inherits — the phantom guard, its negative control, FRT's own
                 id format being readable by it, and restore-as-a-decision. The
                 module already existed (Lane C, S681), so these prove nothing
                 about this session's change; they exist so a later edit to the
                 shared module cannot silently weaken what FRT now depends on.
                 Do not read 5/8 red as "most of it already worked".
     8    PASSES on both arms — negative control: the legacy flag must keep
                 being written, or ~30 read sites and every older cached build
                 on a tablet would stop seeing deletions.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = resolve(HERE, '../../js/data/model.js');
const SHELL = resolve(HERE, '../../index.html');

let pass = 0, fail = 0;
function check(n, name, ok, detail) {
  if (ok) { pass++; console.log(`  \u2714 ${n}. ${name}`); }
  else { fail++; console.log(`  \u2718 ${n}. ${name}${detail ? '\n       ' + detail : ''}`); }
}

let PL = null, ERR = '';
try {
  /* Loaded the way the TOOL loads it: a classic script evaluated against a
     window. Requiring it as a CommonJS module tests a path the browser never
     takes, and a harness that does not reproduce the app's wiring proves
     nothing (S666). */
  const src = readFileSync(resolve(HERE, '../../../lib/data/photoLifecycle.js'), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  PL = sandbox.window.PhotoLifecycle;
  if (!PL || typeof PL.markDeleted !== 'function') {
    ERR = 'lib/data/photoLifecycle.js did not publish PhotoLifecycle onto window';
    PL = null;
  }
} catch (e) { ERR = 'lib/data/photoLifecycle.js did not load: ' + ((e && e.message) || e); }
function behaviour(n, name, fn) {
  if (ERR) { check(n, name, false, ERR); return; }
  try { fn(); } catch (e) { check(n, name, false, String((e && e.message) || e)); }
}

const freshId = () => 'ph_' + Date.now() + '_1_abcdefgh';
const oldId = () => 'ph_' + (Date.now() - 600000) + '_1_abcdefgh';

console.log('\nFRT ON THE SHARED DELETION LAW \u2014 U4 (reading/recording half)\n');

/* 1. THE PHANTOM GUARD, on FRT's own id format. A cleanup pass must not be
      able to delete a photograph taken seconds ago in a pump room. */
behaviour(1, 'a cleanup pass cannot delete a just-captured photo', () => {
  const p = { id: freshId() };
  const r = PL.markDeleted(p);
  check(1, 'a cleanup pass cannot delete a just-captured photo',
    r.ok === false && r.blocked === true && !p.deleted,
    `ok=${r.ok} blocked=${r.blocked} reason=${r.reason}`);
});

/* 2. Negative control for 1: a person tapping Delete is never blocked. A guard
      that refuses real deletes is a broken guard (S524e doctrine). */
behaviour(2, 'a person tapping Delete is never blocked', () => {
  const p = { id: freshId() };
  const r = PL.markDeleted(p, { force: true });
  check(2, 'a person tapping Delete is never blocked',
    r.ok === true && p.deleted === true && p.delState === 'deleted',
    `ok=${r.ok} delState=${p.delState}`);
});

/* 3. FRT's id format is READ correctly by the guard. If it were not, the guard
      would be silently inert here and check 1 would be proving nothing about
      the real tool. */
behaviour(3, 'the guard reads FRT\u2019s own photo id format', () => {
  const ts = PL.createdTs({ id: 'ph_1755930000000_1_abcdefgh' });
  check(3, 'the guard reads FRT\u2019s own photo id format',
    ts === 1755930000000, `got ${ts}`);
});

/* 4. A restore is a DECISION, recorded as one. */
behaviour(4, 'a restore is recorded, not merely un-flagged', () => {
  const p = { id: oldId() };
  PL.markDeleted(p, { force: true });
  PL.markLive(p);
  check(4, 'a restore is recorded, not merely un-flagged',
    p.delState === 'live' && !('deleted' in p) && !('delAt' in p),
    `delState=${p.delState} keys=${Object.keys(p).join(',')}`);
});

/* 5-7. THE SHIPPED HOST. */
const model = readFileSync(MODEL, 'utf8');
const shell = readFileSync(SHELL, 'utf8');

check(5, 'the model no longer records deletes by hand',
  (model.match(/\.deleted\s*=\s*true/g) || []).length === 1,
  'exactly one remains \u2014 the purge tombstone, deliberately held back from this half');

check(6, 'delete and restore both route through the shared law',
  /_pl\.markDeleted\(|_plO\.markDeleted\(|_plL\.markDeleted\(/.test(model) && /markLive\(/.test(model),
  'a surface still writing its own flags is a second law');

check(7, 'the law is actually loaded by the tool shell',
  /lib\/data\/photoLifecycle\.js/.test(shell),
  'wiring the model to a module the page never loads refuses every delete');

/* 8. NEGATIVE CONTROL — the legacy mirror must keep being written. Around
      thirty read sites in FRT ask `photo.deleted`, and a tablet running an
      older cached build asks the same. Drop the mirror and a deleted photo
      reappears in a client's report. */
behaviour(8, 'the legacy flag is still written (older builds must agree)', () => {
  const p = { id: oldId() };
  PL.markDeleted(p, { force: true });
  check(8, 'the legacy flag is still written (older builds must agree)',
    p.deleted === true && typeof p.deletedDate === 'string',
    `deleted=${p.deleted} deletedDate=${p.deletedDate}`);
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
