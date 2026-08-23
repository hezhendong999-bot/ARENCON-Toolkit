/* photoretain.mjs — WHAT MAY BE DESTROYED, AND IN WHAT ORDER (Lane C, S684)
 *
 * UNIFICATION PHASE 3, fourth cut. This is the only path in the toolkit whose
 * output cannot be undone. A wrong verdict is re-typed; a wrong date is
 * corrected; a soft-deleted photo is restored. A purged photograph is gone
 * from the device and from the bucket with nothing to restore from.
 *
 * THREE RULES UNDER TEST, all of which fail silently:
 *
 *   ELIGIBILITY — deleted, AND carrying a readable deletion time, AND older
 *   than the retention window. The middle clause is the one that looks like an
 *   oversight and is not: a deleted photo with no readable timestamp is never
 *   purged, because the alternative is treating "I don't know when this was
 *   deleted" as "destroy it now", and being wrong about that is permanent.
 *
 *   REMOVAL ORDER — highest index first, within each bucket. Photos come out
 *   of arrays by position. Remove position 2 before position 5 and everything
 *   after shifts down one, so the removal aimed at 5 lands on what was 6: a
 *   photograph nobody selected, destroyed, while the one that was meant to go
 *   survives. Reversing this sort is a one-character change that reads as
 *   harmless in a diff, which is exactly why it is pinned here with a test
 *   that simulates the actual splicing.
 *
 *   TRASH ORDER — newest deletion first, so a photo removed by mistake is at
 *   the top when someone goes looking for it.
 *
 * Held against the PRE-EXTRACTION source, kept as a fixture.
 *
 * Run: node tools/sim/photoretain.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

const root = {};
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/data/photoRetention.js'), 'utf8'))(root, undefined);
const R = root.PhotoRetention;
if (!R) { console.error('lib/data/photoRetention.js did not publish PhotoRetention'); process.exit(1); }

const NOW = 1755800000000;
const DAY = 86400000;
let cases = 0; const bad = [];
const norm = v => JSON.stringify(v);
function agree(label, a, b) {
  cases++;
  if (norm(a) !== norm(b)) bad.push(label + '\n      expected: ' + norm(a) + '\n      got     : ' + norm(b));
}

console.log('\n═══ PHOTO RETENTION — the one irreversible path ═══');
console.log('source: ' + REPO + '\n');

function entry(id, opts) {
  const o = opts || {};
  return {
    type: o.type || 't', section: o.section || 's', idx: o.idx == null ? 0 : o.idx,
    photo: {
      id: id, n: id + '.jpg',
      deleted: o.deleted, delState: o.delState,
      delAt: o.delAt, deletedDate: o.deletedDate
    }
  };
}
const iso = (ms) => new Date(ms).toISOString();

/* ── 1: eligibility, against the live rule reproduced independently ─────── */
let before = cases;
{
  const RET = 90;
  const rows = [
    ['deleted 100 days ago', entry('a', { deleted: true, delAt: iso(NOW - 100 * DAY) }), true],
    ['deleted 91 days ago', entry('b', { deleted: true, delAt: iso(NOW - 91 * DAY) }), true],
    ['deleted 90 days ago exactly', entry('c', { deleted: true, delAt: iso(NOW - 90 * DAY) }), false],
    ['deleted 89 days ago', entry('d', { deleted: true, delAt: iso(NOW - 89 * DAY) }), false],
    ['deleted today', entry('e', { deleted: true, delAt: iso(NOW) }), false],
    ['not deleted at all', entry('f', { delAt: iso(NOW - 200 * DAY) }), false],
    ['deleted, NO timestamp', entry('g', { deleted: true }), false],
    ['deleted, unreadable timestamp', entry('h', { deleted: true, delAt: 'not-a-date' }), false],
    ['deleted, legacy date field only', entry('i', { deleted: true, deletedDate: iso(NOW - 200 * DAY) }), true],
    ['canonical deleted but legacy flag missing', entry('j', { delState: 'deleted', delAt: iso(NOW - 200 * DAY) }), false]
  ];
  for (const [label, e, expected] of rows) {
    agree('eligible? ' + label, expected, R.isExpired(e.photo, { retentionDays: RET, now: NOW }));
  }
  /* The last row is the KNOWN INCONSISTENCY, asserted so it stays a decision:
     eligibility reads the legacy flag, the trash listing reads canonical
     state. Today they always agree because a delete writes both. */
}
console.log('  ' + (cases - before) + ' eligibility cases (including the no-timestamp rule)');

/* ── 2: REMOVAL ORDER — simulated against real array splicing ───────────── */
before = cases;
{
  /* Six photos in one array; three of them expired. Removing them in the
     engine's order must destroy exactly those three and leave the rest. */
  const arr = ['keep0', 'DIE1', 'keep2', 'DIE3', 'keep4', 'DIE5'];
  const entries = [1, 3, 5].map(i => entry(arr[i], {
    deleted: true, delAt: iso(NOW - 200 * DAY), idx: i, type: 'rec', section: 'x'
  }));
  const ordered = R.expiredAmong(entries, { retentionDays: 90, now: NOW });
  const live = arr.slice();
  ordered.forEach(e => live.splice(e.idx, 1));
  agree('the right three photographs are destroyed', ['keep0', 'keep2', 'keep4'], live);
  agree('...and they come back highest-index-first', [5, 3, 1], ordered.map(e => e.idx));

  /* And the counter-proof: ascending order destroys the wrong ones. This is
     what the sort protects against, demonstrated rather than asserted. */
  const wrong = arr.slice();
  entries.slice().sort((a, b) => a.idx - b.idx).forEach(e => wrong.splice(e.idx, 1));
  agree('ascending order WOULD destroy the wrong photographs', true,
        JSON.stringify(wrong) !== JSON.stringify(['keep0', 'keep2', 'keep4']));

  /* Buckets are independent: indices only shift within their own array. */
  const mixed = [
    entry('A', { deleted: true, delAt: iso(NOW - 200 * DAY), idx: 0, section: 'one' }),
    entry('B', { deleted: true, delAt: iso(NOW - 200 * DAY), idx: 2, section: 'one' }),
    entry('C', { deleted: true, delAt: iso(NOW - 200 * DAY), idx: 1, section: 'two' }),
    entry('D', { deleted: true, delAt: iso(NOW - 200 * DAY), idx: 3, section: 'two' })
  ];
  const ord = R.expiredAmong(mixed, { retentionDays: 90, now: NOW });
  const perBucket = {};
  ord.forEach(e => { (perBucket[e.section] = perBucket[e.section] || []).push(e.idx); });
  agree('each bucket descends independently', { one: [2, 0], two: [3, 1] }, perBucket);
}
console.log('  ' + (cases - before) + ' removal-order assertions (simulated against real splicing)');

/* ── 3: trash listing order ─────────────────────────────────────────────── */
before = cases;
{
  const list = [
    entry('old', { deleted: true, delAt: iso(NOW - 10 * DAY) }),
    entry('newest', { deleted: true, delAt: iso(NOW - 1 * DAY) }),
    entry('middle', { deleted: true, delAt: iso(NOW - 5 * DAY) }),
    entry('undated', { deleted: true })
  ];
  agree('newest deletion first, undated last',
        ['newest', 'middle', 'old', 'undated'],
        R.trashOrder(list).map(e => e.photo.id));
  agree('sorting does not mutate the caller\'s list',
        ['old', 'newest', 'middle', 'undated'], list.map(e => e.photo.id));
}
console.log('  ' + (cases - before) + ' trash-order assertions');

/* ── 4: days left ───────────────────────────────────────────────────────── */
before = cases;
{
  agree('90 days for a photo deleted today', 90, R.daysLeft({ deleted: true, delAt: iso(NOW) }, { retentionDays: 90, now: NOW }));
  agree('1 day left at 89 days', 1, R.daysLeft({ deleted: true, delAt: iso(NOW - 89 * DAY) }, { retentionDays: 90, now: NOW }));
  agree('never negative', 0, R.daysLeft({ deleted: true, delAt: iso(NOW - 500 * DAY) }, { retentionDays: 90, now: NOW }));
  agree('no timestamp reads as the full window', 90, R.daysLeft({ deleted: true }, { retentionDays: 90, now: NOW }));
}
console.log('  ' + (cases - before) + ' countdown assertions');

/* ── 5: the delegation must stay wired ──────────────────────────────────── */
before = cases;
{
  const liveSrc = fs.readFileSync(path.join(REPO, 'diesel-app/js/part07.js'), 'utf8');
  agree('the purge sweep delegates', true, /PhotoRetention\.expiredAmong/.test(liveSrc));
  agree('the trash listing delegates', true, /PhotoRetention\.trashOrder/.test(liveSrc));
  /* The removal-order sort must not exist in the host any more — a private
     copy is how the two drift apart, and this one destroys photographs. */
  agree('the removal-order sort is not re-written in the host', false,
        /\(b\.idx\s*\|\|\s*0\)\s*-\s*\(a\.idx\s*\|\|\s*0\)/.test(liveSrc));
}
console.log('  ' + (cases - before) + ' delegation checks');

console.log('\n' + cases + ' cases, ' + bad.length + ' failures');
if (bad.length) {
  console.log('\nFAILURES:');
  bad.slice(0, 8).forEach(m => console.log('  ' + m));
  console.log('\nFAIL — the wrong photographs would be destroyed\n');
  process.exit(1);
}
console.log('PASS — only the expired, only in an order that removes what was selected\n');
process.exit(0);
