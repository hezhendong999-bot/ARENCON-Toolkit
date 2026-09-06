/* ═══ tools/sim/export_record.mjs ════════════════════════════════════════════
   THE EXPORT RECORD UNDER TEST — run: node tools/sim/export_record.mjs

   Cases come from LOCKED_REPORT_VERSIONING.md, tagged with their section.

     PART A — §4: every export takes a snapshot; the number does not move.
     PART B — §4.1: one chip per version, repeat exports one tap deep.
     PART C — §3.5: the navigator can show what a version said, and a
              contractor sheet can be matched against the version it was
              printed from.
     PART D — §7/§8: words are stored, images never are, nothing is pruned.
     PART E — unknown means unknown, never "unchanged".
     PART F — purity.

   No app, no browser, no clock — timestamps are handed in.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  makeRecord, appendRecord, recordsFor, latestFor, versionsWithRecords,
  wordsAt, exportCount, compareToVersion, driftSincePrinted, recordIsTextOnly,
  RECORD_SCHEMA
} from '../../frt/js/data/exportRecord.js';
import { WORDS_SCHEMA } from '../../frt/js/data/reportWords.js';

let pass = 0, fail = 0; const failures = [];
function is(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ✓ ' + label); }
  else { fail++; failures.push(label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); console.log('  ✗ ' + label + '   expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
const clone = (o) => JSON.parse(JSON.stringify(o));

/* A small report, with a photograph carrying real image data so Part D has
   something genuine to fail on if the guard ever slips. */
function proj(note) {
  return {
    id: 'proj_1', info: {
      projectNumber: '1490.04', projectName: 'Attic Sprinkler Upgrade',
      client: 'Ironmount Properties Ltd.', address: '610 Sprucewood Ave',
      city: 'Mississauga', province: 'Ontario', dateOfIssue: '2026-08-28',
      scope: 'Field review', visitDate: '2026-08-21', inspectorName: 'E. Rodriguez',
      weather: 'Clear', purpose: 'Progress review', generalNotes: note || 'Original note.',
      revision: 'B01'
    },
    status: 'issued', contractors: [{
      id: 'ctr_1', name: 'Northbridge Fire Protection', trades: ['Sprinkler'],
      deficiencies: [{
        id: 'def_1', num: 1, status: 'open', priority: 'high', category: 'Sprinkler',
        drawingId: 'dwg_1', pinX: 0.3124, pinY: 0.6882, date: '2026-08-21',
        notedDate: '2026-08-21', notedOnInstance: 1,
        observations: [{
          id: 'obs_1', text: 'Sprinkler head obstructed by ductwork.',
          priority: 'high', trade: 'Sprinkler', addressed: false, repeatCount: 1,
          photos: [{ id: 'ph_a', caption: 'Duct', thumb: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ', r2Key: 'photos/x/frt/original/ph_a.jpg' }],
          responses: [], followups: []
        }],
        photos: [], activity: []
      }]
    }],
    generalDeficiencies: [], photos: [], drawings: [{ id: 'dwg_1', name: 'FP-101', folder: '' }],
    signatures: { sigInspectorName: 'E. Rodriguez', sigInspectorDate: '2026-08-28', sigInspectorData: 'data:image/png;base64,SIGA' }
  };
}

console.log('\n═══ EXPORT RECORD — schema ' + RECORD_SCHEMA + ' / words ' + WORDS_SCHEMA + ' ═══\n');

/* ── PART A — every export takes a snapshot (§4) ─────────────────────────── */
console.log('── PART A — every export takes a snapshot (§4) ──');

const p1 = proj();
const r1 = makeRecord(p1, 'B01', '2026-09-01T14:00:00Z', 'elvis', 'exp_1');
is(!!r1, true, 'an export produces a record');
is(r1.v, 'B01', 'the record carries the version it was exported under');
is(r1.at, '2026-09-01T14:00:00Z', 'the record carries when');
is(r1.by, 'elvis', 'the record carries who');
is(typeof r1.digest === 'string' && r1.digest.length === 16, true, 'the record carries a fingerprint of the words');
is(!!r1.words, true, 'the record carries the words themselves — not just a fingerprint');
is(r1.words && r1.words.header ? r1.words.header.projectNumber : null, '1490.04', 'the words are the report, readable later');

/* §4 worked example: "Export B01 at 14:00, notice an error, fix it, export
   again at 14:20 → two snapshots, both B01, both kept forever." */
let recs = [];
recs = appendRecord(recs, makeRecord(p1, 'B01', '2026-09-01T14:00:00Z', 'elvis', 'exp_1'));
const p1fixed = proj('Corrected note.');
recs = appendRecord(recs, makeRecord(p1fixed, 'B01', '2026-09-01T14:20:00Z', 'elvis', 'exp_2'));
is(recs.length, 2, '§4 two exports, two snapshots');
is(recs[0].v === 'B01' && recs[1].v === 'B01', true, '§4 both are B01 — the number did not move');
is(recs[0].digest !== recs[1].digest, true, '§4 the two snapshots hold different words');
is(exportCount(recs, 'B01'), 2, 'B01 was exported twice');

is(makeRecord(null, 'B01', 'now', 'e', 'x'), null, 'an unreadable report produces NO record, not an empty one');
is(makeRecord(p1, '', 'now', 'e', 'x'), null, 'a record without a version is refused');

/* ── PART B — one chip per version (§4.1) ───────────────────────────────── */
console.log('\n── PART B — one chip per version (§4.1) ──');

recs = appendRecord(recs, makeRecord(proj('B02 words.'), 'B02', '2026-09-05T09:00:00Z', 'mark', 'exp_3'));
recs = appendRecord(recs, makeRecord(proj('B02 words fixed.'), 'B02', '2026-09-05T09:30:00Z', 'mark', 'exp_4'));
recs = appendRecord(recs, makeRecord(proj('B03 words.'), 'B03', '2026-09-08T11:00:00Z', 'elvis', 'exp_5'));

is(recs.length, 5, 'five exports are stored');
is(versionsWithRecords(recs), ['B01', 'B02', 'B03'], '§4.1 the chip list is one entry per version, in order');
is(exportCount(recs, 'B02'), 2, '§4.1 the repeat export is still there, one tap deep');
is(recordsFor(recs, 'B02').map(r => r.at), ['2026-09-05T09:00:00Z', '2026-09-05T09:30:00Z'],
  '§4.1 the export history is oldest first');
is(latestFor(recs, 'B02').at, '2026-09-05T09:30:00Z', 'the newest export of a version is what the version shows');
is(latestFor(recs, 'B99'), null, 'a version never exported has no record');

/* ── PART C — the navigator, and round-matching (§3.5) ──────────────────── */
console.log('\n── PART C — what a version said, and round-matching (§3.5) ──');

is(wordsAt(recs, 'B01').header.generalNotes, 'Corrected note.',
  '§3.5 flipping to B01 shows what B01 said — the newest export of it');
is(wordsAt(recs, 'B02').header.generalNotes, 'B02 words fixed.', '§3.5 flipping to B02 shows B02');
is(wordsAt(recs, 'B99'), null, '§3.5 a version with nothing stored returns nothing — never today\'s report');

/* A contractor sheet comes back stamped B02. Have B02's words moved since? */
const unchanged = proj('B02 words fixed.');
is(driftSincePrinted(unchanged, recs, 'B02'), 'same',
  '§3.5 a sheet printed from B02 matches when B02 has not moved');
const movedOn = proj('Someone corrected B02 after it went out.');
is(driftSincePrinted(movedOn, recs, 'B02'), 'changed',
  '§3.5 the import can now say the version has moved since it was printed');
is(driftSincePrinted(unchanged, recs, 'B99'), 'unknown',
  '§3.5 a sheet stamped with a version we never recorded is unknown, not a match');

/* ── PART D — words yes, images never, nothing pruned (§7/§8) ───────────── */
console.log('\n── PART D — words stored, images never, nothing pruned (§7/§8) ──');

for (const r of recs) {
  if (!recordIsTextOnly(r)) { is(false, true, '§7 record ' + r.v + ' @ ' + r.at + ' contains image data'); break; }
}
is(recs.every(recordIsTextOnly), true, '§7/§8 NO record contains image data, though the report does');
is(JSON.stringify(r1.words).includes('ph_a'), true, '§8 a photograph is REFERENCED by id — the picture is not copied');
is(/r2Key|thumb|dataUrl/.test(JSON.stringify(r1.words)), false, '§8 no storage pointer is copied into a snapshot either');

const before = recs.length;
versionsWithRecords(recs); recordsFor(recs, 'B01'); wordsAt(recs, 'B02'); latestFor(recs, 'B03');
is(recs.length, before, '§7 reading never removes a snapshot');

const mod = await import('../../frt/js/data/exportRecord.js');
is(Object.keys(mod).filter(k => /prune|trim|expire|purge|cleanup|evict/i.test(k)), [],
  '§7 the module offers NO way to prune a snapshot — nothing ages out');

/* A snapshot is small because it holds no pictures. */
const bytes = JSON.stringify(r1).length;
is(bytes < 4000, true, 'a snapshot of this report is ' + bytes + ' bytes — text-sized (§8)');

/* ── PART E — unknown means unknown ─────────────────────────────────────── */
console.log('\n── PART E — unknown means unknown, never "unchanged" ──');

is(compareToVersion(p1, [], 'B01'), 'unknown', 'nothing stored reads as unknown');
is(compareToVersion(p1, recs, 'B01'), 'changed', 'a moved report reads as changed');
is(compareToVersion(proj('Corrected note.'), recs, 'B01'), 'same', 'an unmoved report reads as same');
is(compareToVersion(null, recs, 'B01'), 'unknown', 'an unreadable report reads as unknown');

const oldSchema = clone(recs);
oldSchema.forEach(r => { r.wordsSchema = WORDS_SCHEMA + 1; });
is(compareToVersion(proj('Corrected note.'), oldSchema, 'B01'), 'unknown',
  'a snapshot written under a different definition of the words reads as UNKNOWN, not same');

const noDigest = clone(recs);
noDigest.forEach(r => { r.digest = ''; });
is(compareToVersion(p1, noDigest, 'B01'), 'unknown', 'a snapshot with no fingerprint reads as unknown');

/* ── PART F — purity ────────────────────────────────────────────────────── */
console.log('\n── PART F — nothing given to the store is modified ──');

const snapRecs = JSON.stringify(recs);
const snapProj = JSON.stringify(p1);
appendRecord(recs, makeRecord(p1, 'B04', 'now', 'x', 'exp_9'));
makeRecord(p1, 'B04', 'now', 'x', 'exp_9');
compareToVersion(p1, recs, 'B01');
is(JSON.stringify(recs), snapRecs, 'the record list is untouched');
is(JSON.stringify(p1), snapProj, 'the report is untouched — a snapshot only reads');

const grown = appendRecord(recs, makeRecord(p1, 'B04', 'now', 'x', 'exp_9'));
grown.push({ v: 'JUNK' });
is(JSON.stringify(recs), snapRecs, 'mutating a returned list cannot reach back into the input');


/* ── PART G — SNAPSHOTS THROUGH THE REAL SYNC MERGE ─────────────────────────
   The same hazard as the ledger, and the same reason the id exists. Two
   inspectors export on two devices; both snapshots must survive. */

const { merge3 } = await import('../../lib/data/merge.js');

console.log('\n── PART G — snapshots through the real sync merge ──');

const baseP = { id: 'p1', info: { projectNumber: '1490.04' }, exportRecords: [] };
const withA = { ...baseP, exportRecords: appendRecord([], makeRecord(proj('A words.'), 'B01', 't1', 'elvis', 'exp_A')) };
const withB = { ...baseP, exportRecords: appendRecord([], makeRecord(proj('B words.'), 'B01', 't2', 'mark', 'exp_B')) };

const mg = merge3(baseP, withA, withB);
is(mg.merged.exportRecords.map(r => r.id).sort(), ['exp_A', 'exp_B'],
  'two devices each export — BOTH snapshots survive the merge');
is(mg.conflicts.length, 0, 'and it is not a conflict');
is(exportCount(mg.merged.exportRecords, 'B01'), 2, 'both are still B01, one tap deep');

const stripIds = (p) => ({ ...p, exportRecords: p.exportRecords.map(({ id, ...r }) => r) });
const mg2 = merge3(stripIds(baseP), stripIds(withA), stripIds(withB));
is(mg2.merged.exportRecords.length < 2, true,
  'WITHOUT ids the merge keeps only ' + mg2.merged.exportRecords.length + ' of 2 — the loss the id prevents');

/* A snapshot must never be edited by a merge — it is what a PDF said. */
const same = merge3(withA, withA, withA);
is(JSON.stringify(same.merged.exportRecords), JSON.stringify(withA.exportRecords),
  'a snapshot passes through the merge unchanged — history is not rewritten');

/* ── result ─────────────────────────────────────────────────────────────── */

console.log('\n═══ ' + pass + ' passed, ' + fail + ' failed ═══');
if (fail) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ✗ ' + f);
  console.log('\nDo NOT wire this to the export path.\n');
  process.exit(1);
}
console.log('\nEvery export is recorded, every version can say what it said, and no picture is ever copied.\n');
