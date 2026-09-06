/* ═══ frt/js/data/exportRecord.js ════════════════════════════════════════════
   WHAT EACH ISSUED PDF ACTUALLY SAID.

   LOCKED_REPORT_VERSIONING.md §4:
     "Every export takes a snapshot. Not a prompt, not a decision — a
      consequence."

   This is the record that replaces enforcement (§6). The tool does not stop
   anyone correcting an issued copy, because a design that turns every typo
   into a client-facing revision just stops people pressing Issue. What it
   does instead is remember. Nothing is blocked, nothing is asked, and the
   inspector sees none of it.

   ─── WHY IT IS BOUGHT EITHER WAY ───────────────────────────────────────────

   Two reasons, both from §3.5, and the first one alone would justify it:

     1. It is the navigator's storage. Flipping back to B01 can only SHOW B01
        if something stored what B01 said. Without this, a version strip is a
        row of chips that all display today's report.

     2. Contractor round-matching. Sheets come back stamped with the version
        they were printed from. If that version's words have moved since, the
        import can say so — today it cannot, because there is nothing to
        compare against.

   The earlier justification — that this protects ARENCON in a dispute — was
   argued by Claude and correctly rejected by Mark: an emailed PDF and its
   timestamp settle that on their own. The two reasons above are the ones that
   hold, and they are the ones this file is built for.

   ─── WHAT A RECORD HOLDS ───────────────────────────────────────────────────

     { v:'B02', schema:1, at:'2026-09-01T14:20:00Z', by:'elvis',
       digest:'…', words:{ … } }

   The words are reportWords()'s projection — report header, deficiencies,
   comments, thread history. §7: a snapshot stores the WORDS and does NOT
   store images. §8: a photograph belongs to the site visit; a revision
   references it and never owns a copy, which is exactly why keeping every
   snapshot forever is affordable — five revisions of a 233-photo report
   duplicate no pictures at all.

   ─── WHAT WRITES ONE, AND WHAT DOES NOT ────────────────────────────────────

   §4: ONLY an issued PDF writes a record. A working copy writes nothing. The
   on-screen preview writes nothing. Reviewing, demonstrating and checking
   formatting must stay free of consequence, or Issue becomes a button people
   avoid — and then the record is lost anyway.

   FRT already has the seam this needs: lib/export/exportPreview.js renders
   on-screen, and the PDF only reaches the device when someone taps Save/Open
   or the download link. The call belongs on that tap, never on the render.

   ─── NOTHING IS EVER PRUNED ────────────────────────────────────────────────

   §7: every snapshot is kept permanently. Nothing ages out. Mark's ruling —
   storage is paid for, losing a copy is not. There is deliberately no prune,
   trim, or expiry function in this file. If one appears here later, it was
   not asked for.

   ─── ONE CHIP PER VERSION ──────────────────────────────────────────────────

   §4.1: B01 exported five times is ONE chip in the navigator, not five. The
   repeat exports live one tap deep. versionsWithRecords() is the chip list;
   recordsFor() is what the tap opens.

   PURE. No clock, no storage, no app state — timestamps are passed in by the
   caller. Every function returns new data and never modifies its input.
   ═════════════════════════════════════════════════════════════════════════ */

import { reportWords, wordsDigest, WORDS_SCHEMA } from './reportWords.js';

export var RECORD_SCHEMA = 1;

function list(records) {
  return Array.isArray(records) ? records.filter(function (r) { return r && typeof r.v === 'string'; }) : [];
}

/* ── writing ────────────────────────────────────────────────────────────────
   Called on the tap that produces a PDF — never on a preview render.
   Returns null for a report that cannot be read, because a record that says
   nothing is worse than no record: it would later read as "this is what B02
   said" when it is not. */
export function makeRecord(proj, version, at, by) {
  var w = reportWords(proj);
  if (!w || !version) return null;
  return {
    v: String(version),
    schema: RECORD_SCHEMA,
    wordsSchema: WORDS_SCHEMA,
    at: at || '',
    by: by || '',
    digest: wordsDigest(proj),
    words: w
  };
}

export function appendRecord(records, rec) {
  var l = list(records).slice();
  if (rec && rec.v) l.push(rec);
  return l;
}

/* ── reading ────────────────────────────────────────────────────────────── */

/* Every export of one version, oldest first. This is what the one-tap-deep
   export history shows. */
export function recordsFor(records, version) {
  return list(records).filter(function (r) { return r.v === version; });
}

/* The newest export of a version — what the navigator displays when you flip
   to it, and what an incoming contractor sheet is matched against. */
export function latestFor(records, version) {
  var l = recordsFor(records, version);
  return l.length ? l[l.length - 1] : null;
}

/* §4.1 — the chip list. Each version once, in the order it was first
   exported, however many times it was exported. */
export function versionsWithRecords(records) {
  var seen = {}, out = [], l = list(records);
  for (var i = 0; i < l.length; i++) {
    if (!seen[l[i].v]) { seen[l[i].v] = 1; out.push(l[i].v); }
  }
  return out;
}

/* What a version said — the navigator's whole reason for this store. Returns
   null when nothing was stored for it, which the navigator must show as
   "not recorded", never as today's report. */
export function wordsAt(records, version) {
  var r = latestFor(records, version);
  return r && r.words ? r.words : null;
}

export function exportCount(records, version) {
  return recordsFor(records, version).length;
}

/* ── comparing ──────────────────────────────────────────────────────────────
   'same' | 'changed' | 'unknown'. Unknown means exactly that: nothing stored,
   or stored under a different definition of the words. A caller must treat
   unknown as "ask", never as "unchanged" — assuming unchanged is how a
   revision goes missing. */
export function compareToVersion(proj, records, version) {
  var r = latestFor(records, version);
  if (!r || !r.digest || r.wordsSchema !== WORDS_SCHEMA) return 'unknown';
  var d = wordsDigest(proj);
  if (!d) return 'unknown';
  return d === r.digest ? 'same' : 'changed';
}

/* §3.5 reason 2 — contractor round-matching. A sheet comes back stamped with
   the version it was printed from; this answers whether that version's words
   have moved since. 'changed' is the case worth telling someone about. */
export function driftSincePrinted(proj, records, printedVersion) {
  return compareToVersion(proj, records, printedVersion);
}

/* Guard, used by the probe and safe to call anywhere: a record must never
   carry image data. §7/§8 — snapshots store words, not pictures. If this ever
   returns false, something upstream started putting bytes in the report
   again, which is the whole failure S718 exists to prevent. */
export function recordIsTextOnly(rec) {
  if (!rec) return false;
  var s = JSON.stringify(rec.words || {});
  return !/data:image|base64,|blob:/i.test(s);
}
