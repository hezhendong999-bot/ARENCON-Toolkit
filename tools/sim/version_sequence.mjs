/* ═══ tools/sim/version_sequence.mjs ═════════════════════════════════════════
   THE SEQUENCE ENGINE UNDER TEST — run: node tools/sim/version_sequence.mjs

   Every case below is taken from LOCKED_REPORT_VERSIONING.md, not invented
   here. Where the file gives a worked example, that example is the test, in
   the file's own words, with the section number on it. If the ruling changes,
   these fail — which is the point.

     PART A — the numbering law (§3): always the next one, never a hole,
              never a skip.
     PART B — the locking rule (§3.1): anything with something after it is
              locked; delete what is after it and it opens again.
     PART C — repeated Issue mints nothing (§4).
     PART D — entering the system without inventing history (§17.1).
     PART E — conformance with the grammar already in frt/js/app.js, and the
              three places the ruling deliberately overrules it.
     PART F — purity: nothing given to the engine is ever modified.

   No app, no browser, no clock, no randomness.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  parseVersion, formatVersion, tip, currentVersion, lastIssued,
  isLocked, canDelete, nextIssue, nextDraft, issue, revise, remove,
  seedLedger, isInferred, SEQ_SCHEMA
} from '../../frt/js/data/versionSeq.js';

let pass = 0, fail = 0; const failures = []; let _n = 0;
function is(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ✓ ' + label); }
  else { fail++; failures.push(label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); console.log('  ✗ ' + label + '   expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
  return ok;
}
const L = (...vs) => vs.map(v => ({ v, issued: /^[B-Z]\d+$/.test(v) }));

console.log('\n═══ VERSION SEQUENCE — schema ' + SEQ_SCHEMA + ' ═══\n');

/* ── PART A — the numbering law (§3) ────────────────────────────────────── */
console.log('── PART A — the numbering law (§3) ──');

is(parseVersion('A01'), { issued: false, onIssue: null, letter: 'A', major: 1, suffix: null }, 'A01 is a draft');
is(parseVersion('B02'), { issued: true, onIssue: null, letter: 'B', major: 2, suffix: null }, 'B02 is an issued copy');
is(parseVersion('B01A03'), { issued: false, onIssue: 'B01', letter: 'B', major: 1, suffix: 3 }, 'B01A03 is a revision on top of B01');
is(parseVersion('rubbish'), null, 'an unreadable version is null, not a guess');
is(parseVersion(''), null, 'an empty version is null');
is(formatVersion(parseVersion('B01A03')), 'B01A03', 'format round-trips');
is(formatVersion(parseVersion('A07')), 'A07', 'format round-trips a draft');

is(nextDraft([]), 'A01', 'a brand-new report starts at A01');
is(nextIssue([]), 'B01', 'the first issue is B01');
is(nextDraft(L('A01')), 'A02', 'the second draft is A02');
is(nextIssue(L('A01', 'A02')), 'B01', 'issuing from any A draft gives B01');
is(nextDraft(L('A01', 'A02', 'B01')), 'B01A01', 'revising an issued copy gives B01A01');
is(nextIssue(L('A01', 'B01', 'B01A01')), 'B02', 'issuing from a revision gives B02');
is(nextDraft(L('A01', 'B01', 'B01A01', 'B01A02', 'B02')), 'B02A01', 'revisions sit on the NEWEST issued copy');

/* §3 worked example: "Withdraw B02 and resume drafting → the resumed draft is
   B01A04 if B01A03 was the last one, and the next issue is B02 again." */
const afterWithdraw = L('A01', 'B01', 'B01A01', 'B01A02', 'B01A03');
is(nextDraft(afterWithdraw), 'B01A04', '§3 resumed draft is B01A04 when B01A03 was the last');
is(nextIssue(afterWithdraw), 'B02', '§3 the next issue is B02 again — the number was not retired');

/* §3: "Delete B01A04 → the next draft created is B01A04." */
is(nextDraft(L('A01', 'B01', 'B01A01', 'B01A02', 'B01A03')), 'B01A04', '§3 a deleted draft number is reused — no hole');

/* Numbers are never retired, and two digits hold past nine. */
is(nextIssue(L('A01', 'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09')), 'B10', 'B09 is followed by B10');
is(nextDraft(L('B01', 'B01A09')), 'B01A10', 'B01A09 is followed by B01A10');

/* ── PART B — the locking rule (§3.1) ───────────────────────────────────── */
console.log('\n── PART B — the locking rule (§3.1) ──');

const l1 = L('A01', 'B01', 'B01A01');
is(isLocked(l1, 'B01A01', false), false, 'the tip is open');
is(isLocked(l1, 'B01', false), true, '§3.1 create B01A01 → B01 is locked');
is(isLocked(l1, 'A01', false), true, 'everything before the tip is locked');
is(isLocked(L('A01', 'B01', 'B01A01', 'B02'), 'B01A01', false), true, '§3.1 create B02 → B01A01 is locked');
is(isLocked(l1, 'B99', false), true, 'a version not in the ledger is never treated as open');
is(isLocked(l1, 'B01A01', true), true, '§3.1 a later REPORT locks the tip too');

is(canDelete(l1, 'B01A01', false), true, 'the tip may be deleted');
is(canDelete(l1, 'B01', false), false, 'a locked copy may not be deleted');
is(canDelete(l1, 'B01A01', true), false, 'nothing may be deleted while a later report exists');
is(canDelete(L('A01'), 'A01', false), false, 'the only copy is the report itself, not a version to delete');

/* §3.1: "The newest issued copy may be deleted even after a PDF has been
   produced from it. Deleting B02 returns drafting to the revision it was
   made from, and the next issue is B02 again." */
const withB02 = [
  { v: 'A01', issued: false },
  { v: 'B01', issued: true, digest: 'd1' },
  { v: 'B01A01', issued: false },
  { v: 'B02', issued: true, digest: 'd2', at: '2026-09-01T00:00:00Z', exported: true }
];
is(canDelete(withB02, 'B02', false), true, '§3.1 the newest issued copy is deletable even after export');
const del = remove(withB02, 'B02', false);
is(del.removed, true, '§3.1 delete succeeds');
is(del.version, 'B01A01', '§3.1 drafting returns to the revision it was made from');
is(nextIssue(del.ledger), 'B02', '§3.1 the next issue is B02 again');
is(isLocked(del.ledger, 'B01A01', false), false, '§3.1 "delete what is after it and it opens again"');

const refused = remove(withB02, 'B01', false);
is(refused.removed, false, 'deleting something that is not the tip is refused');
is(refused.version, 'B02', 'a refused delete changes nothing');

/* ── PART C — repeated Issue mints nothing (§4) ─────────────────────────── */
console.log('\n── PART C — repeated Issue mints nothing (§4) ──');

let led = L('A01', 'A02');
const first = issue(led, 'words-1', { id:'v_a', at: '2026-09-01T10:00:00Z', by: 'elvis' });
is(first.version, 'B01', 'first Issue gives B01');
is(first.minted, true, 'first Issue mints');

const again = issue(first.ledger, 'words-1', { id:'v_b', at: '2026-09-01T10:05:00Z', by: 'elvis' });
is(again.version, 'B01', '§4 pressing Issue again on unchanged words returns B01');
is(again.minted, false, '§4 nothing is minted');
is(again.ledger.length, first.ledger.length, '§4 no second copy appears in the ledger');

/* §4: "Mashing the button on A02 yields B01 every time." */
let mash = L('A01', 'A02'), mashLedger = mash, mashResults = [];
for (let i = 0; i < 5; i++) {
  const r = issue(mashLedger, 'words-1', { id:'v_'+(++_n) });
  mashLedger = r.ledger; mashResults.push(r.version);
}
is(mashResults, ['B01', 'B01', 'B01', 'B01', 'B01'], '§4 mashing Issue five times yields B01 every time');
is(mashLedger.filter(e => e.issued).length, 1, '§4 five presses leave exactly one issued copy');

const moved = issue(first.ledger, 'words-2', { id:'v_'+(++_n) });
is(moved.version, 'B02', '§4 B02 appears only when the words actually changed');
is(moved.minted, true, '§4 a real change mints');

const noDigest = issue(first.ledger, '', { id:'v_'+(++_n) });
is(noDigest.version, 'B02', 'an uncomputable digest mints rather than assuming "unchanged"');

const revised = revise(first.ledger, { id:'v_r1' });
is(revised.version, 'B01A01', 'revising after B01 gives B01A01');
is(lastIssued(revised.ledger).v, 'B01', 'the last issued copy is still B01');
is(currentVersion(revised.ledger), 'B01A01', 'the tip is the revision');

/* A full walk, the way a real report moves. */
let w = [];
const walk = [];
let r1 = revise(w, { id:'v_'+(++_n) }); w = r1.ledger; walk.push(r1.version);          /* A01 */
let r2 = revise(w, { id:'v_'+(++_n) }); w = r2.ledger; walk.push(r2.version);          /* A02 */
let r3 = issue(w, 'v1', { id:'v_'+(++_n) }); w = r3.ledger; walk.push(r3.version);     /* B01 */
let r4 = revise(w, { id:'v_'+(++_n) }); w = r4.ledger; walk.push(r4.version);          /* B01A01 */
let r5 = issue(w, 'v2', { id:'v_'+(++_n) }); w = r5.ledger; walk.push(r5.version);     /* B02 */
let r6 = remove(w, 'B02', false); w = r6.ledger; walk.push(currentVersion(w)); /* back to B01A01 */
let r7 = issue(w, 'v3', { id:'v_'+(++_n) }); w = r7.ledger; walk.push(r7.version);     /* B02 again */
is(walk, ['A01', 'A02', 'B01', 'B01A01', 'B02', 'B01A01', 'B02'], 'a full walk matches the ruling end to end');

/* ── PART D — entering the system (§17.1) ───────────────────────────────── */
console.log('\n── PART D — entering the system without inventing history (§17.1) ──');

const seeded = seedLedger('B01A02');
is(seeded.length, 1, '§17.1 a seeded ledger has ONE entry — history is not invented');
is(currentVersion(seeded), 'B01A02', 'the seeded entry is the revision the report already carries');
is(isInferred(seeded, 'B01A02'), true, 'the seeded entry is marked inferred');
is(seeded[0].digest, undefined, '§17.1 an inferred entry carries no digest, so comparison answers "unknown"');
is(nextIssue(seeded), 'B02', 'a seeded report still knows its next issue');
is(nextDraft(seedLedger('B01')), 'B01A01', 'a seeded issued copy revises correctly');
is(currentVersion(seedLedger('nonsense')), 'A01', 'an unreadable stored revision seeds as A01, not as garbage');
is(currentVersion(seedLedger(undefined)), 'A01', 'a missing revision seeds as A01');
is(canDelete(seeded, 'B01A02', false), false, 'a seeded report has nothing behind it to fall back to, so nothing is deletable');

/* ── PART E — conformance with the grammar already in the app ───────────── */
console.log('\n── PART E — conformance with frt/js/app.js, and where the ruling overrules it ──');

/* The app's grammar, copied verbatim from frt/js/app.js at HEAD, so the two
   cannot silently drift while both exist. Deleted from the host at wiring. */
function _appParseRevision(rev) {
  var m;
  m = rev.match(/^([B-Z])(\d{2,})A(\d{2,})$/);
  if (m) return { issued: true, hasSuffix: true, letter: m[1], major: parseInt(m[2]), suffixNum: parseInt(m[3]) };
  m = rev.match(/^([B-Z])(\d{2,})$/);
  if (m) return { issued: true, hasSuffix: false, letter: m[1], major: parseInt(m[2]), suffixNum: 0 };
  m = rev.match(/^A(\d{2,})$/);
  if (m) return { issued: false, hasSuffix: false, letter: 'A', major: parseInt(m[1]), suffixNum: 0 };
  return { issued: false, hasSuffix: false, letter: 'A', major: 1, suffixNum: 0 };
}
function _appCalcIssueRevision(parsed) {
  if (!parsed.issued) return 'B01';
  var next = parsed.major + 1;
  return parsed.letter + (next < 10 ? '0' : '') + next;
}

/* Where both agree: the number the Issue button offers, walking forward. */
const agree = ['A01', 'A05', 'B01', 'B02', 'B09', 'B01A01', 'B02A03'];
let allAgree = true;
for (const v of agree) {
  const app = _appCalcIssueRevision(_appParseRevision(v));
  const eng = nextIssue(seedLedger(v));
  if (app !== eng) { allAgree = false; console.log('    ' + v + ': app=' + app + ' engine=' + eng); }
}
is(allAgree, true, 'the engine offers the same next issue number as the live app, for every shape');

/* Overrule 1 — the app calls B01A01 "issued". It is a draft on top of an
   issued copy; the ruling treats only B## as issued. */
is(_appParseRevision('B01A01').issued, true, 'the app marks B01A01 as issued');
is(parseVersion('B01A01').issued, false, 'OVERRULED §2: B01A01 is a revision in progress, not an issued copy');

/* Overrule 2 — the app's Revert-to-Draft jumps past the used draft number and
   leaves a hole. §3 forbids holes. */
function _appCalcRevertDraft(proj) {
  var highest = 0, info = proj.info || {};
  if (info._lastDraftNum) highest = info._lastDraftNum;
  var next = highest + 1;
  return 'A' + (next < 10 ? '0' : '') + next;
}
is(_appCalcRevertDraft({ info: { _lastDraftNum: 1, revision: 'B01' } }), 'A02', 'the app reverts B01 to A02');
is(currentVersion(remove(L('A01', 'B01'), 'B01', false).ledger), 'A01',
  'OVERRULED §3: deleting B01 returns to A01 — the draft number is not burned');

/* Overrule 3 — the app has no concept of a locked copy at all; the string it
   keeps cannot express one. Nothing to compare, so this is stated, not run. */
is(typeof isLocked, 'function', 'OVERRULED §3.1: locking exists only in the engine — a single string cannot express it');

/* ── PART F — purity ────────────────────────────────────────────────────── */
console.log('\n── PART F — the engine never modifies what it is given ──');

const original = L('A01', 'B01');
const snapshot = JSON.stringify(original);
issue(original, 'x', { id:'v_p1', at: 'now' });
revise(original, {});
remove(original, 'B01', false);
nextIssue(original); nextDraft(original); isLocked(original, 'B01', false);
is(JSON.stringify(original), snapshot, 'the input ledger is untouched by every operation');

const out = issue(original, 'x', { id:'v_'+(++_n) }).ledger;
out.push({ v: 'JUNK', issued: false });
is(JSON.stringify(original), snapshot, 'mutating a returned ledger cannot reach back into the input');


/* ── PART G — SURVIVES THE REAL SYNC MERGE ──────────────────────────────────
   Not a mock. This imports lib/data/merge.js — the merge engine that actually
   runs when two devices sync — and puts the ledger through it.

   Why this section exists: the merge keys arrays by an `id` field and nothing
   else. An array whose items have no id cannot be matched item by item, so
   two devices that both added something fall through to a whole-array
   conflict and one side's entries are thrown away. That is silent version-
   history loss, on a fleet where two inspectors on one project is normal.  */

const { merge3 } = await import('../../lib/data/merge.js');

console.log('\n── PART G — the ledger through the real sync merge ──');

const baseLedger = [
  { id: 'v_1', v: 'A01', issued: false },
  { id: 'v_2', v: 'B01', issued: true, digest: 'd1' }
];
const asProj = (led) => ({ id: 'p1', info: { projectNumber: '1490.04' }, versions: led });

/* Two devices, both busy. Elvis issues B02 on the tablet; Mark starts a
   revision on the PC. Neither has seen the other. */
const mine = asProj(issue(baseLedger, 'd2', { id: 'v_3', at: 't1', by: 'elvis' }).ledger);
const theirs = asProj(revise(baseLedger, { id: 'v_4', at: 't2', by: 'mark' }).ledger);
const m1 = merge3(asProj(baseLedger), mine, theirs);
const merged1 = m1.merged.versions.map(e => e.id).sort();
is(merged1, ['v_1', 'v_2', 'v_3', 'v_4'], 'two devices each add an entry — BOTH survive the merge');
is(m1.conflicts.length, 0, 'and it is not even a conflict');

/* The same scenario with the ids stripped — the design as it was before this
   was caught. Kept as a live demonstration, not a story. */
const strip = (p) => ({ ...p, versions: p.versions.map(({ id, ...rest }) => rest) });
const m2 = merge3(strip(asProj(baseLedger)), strip(mine), strip(theirs));
const lostCount = m2.merged.versions.length;
is(lostCount < 4, true, 'WITHOUT ids the same merge keeps only ' + lostCount + ' of 4 entries — this is the loss the id prevents');

/* A delete must travel, not bounce back. Elvis deletes the tip; Mark's device
   still has it live and syncs afterwards. */
const deleted = asProj(remove(issue(baseLedger, 'd2', { id: 'v_3', at: 't1' }).ledger, 'B02', false, 't3').ledger);
const untouched = asProj(issue(baseLedger, 'd2', { id: 'v_3', at: 't1' }).ledger);
const m3 = merge3(untouched, deleted, untouched);
const v3 = m3.merged.versions.find(e => e.id === 'v_3');
is(!!v3, true, 'the deleted entry is still PRESENT after merge — it is a tombstone, not a hole');
is(v3.deleted, true, 'and it is still marked deleted — the delete travelled');
is(currentVersion(m3.merged.versions), 'B01', 'the other device now agrees the tip is B01 — no resurrection');
is(nextIssue(m3.merged.versions), 'B02', 'and B02 is available again, exactly as §3.1 requires');

/* Two devices open the same un-seeded report at the same time. */
const seedA = asProj(seedLedger('B01A02'));
const seedB = asProj(seedLedger('B01A02'));
const m4 = merge3({ id: 'p1', info: {} }, seedA, seedB);
is(m4.merged.versions.length, 1, 'two devices seeding independently produce ONE entry, not a doubled ledger');

/* ── result ─────────────────────────────────────────────────────────────── */

console.log('\n═══ ' + pass + ' passed, ' + fail + ' failed ═══');
if (fail) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ✗ ' + f);
  console.log('\nDo NOT wire this to the Issue button.\n');
  process.exit(1);
}
console.log('\nThe sequence obeys the ruling: always the next one, never a hole, never a skip.\n');
