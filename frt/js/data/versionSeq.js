/* ═══ frt/js/data/versionSeq.js ══════════════════════════════════════════════
   THE SEQUENCE ENGINE — what number comes next, and what may still be moved.

   LOCKED_REPORT_VERSIONING.md §3:
     "A version number is a position in a sequence, never an identity. Always
      the next one. Never a hole. Never a skip. Numbers are never retired."

   §3.1, the whole locking rule in one sentence:
     "Anything with something after it is locked. Delete what is after it and
      it opens again."

   ─── WHY THIS OWNS A LIST AND NOT A STRING ─────────────────────────────────

   Today the tool keeps ONE value — the current revision — and issuing
   overwrites it. A single value cannot answer any of the questions the ruling
   asks. It cannot say whether something exists after this copy, so it cannot
   say what is locked. It cannot say what a deleted copy should fall back to,
   so Revert-to-Draft currently jumps to the next unused draft number and
   leaves a hole the ruling forbids.

   So the engine owns the LEDGER: every version this report has had, oldest
   first. Every number is then DERIVED from what is in the ledger, never from
   a stored counter — which is what makes holes and skips impossible rather
   than merely discouraged.

   ─── THE LEDGER ────────────────────────────────────────────────────────────

     [ { v:'A01', issued:false },
       { v:'B01', issued:true, digest:'…', at:'…', by:'…' },
       { v:'B01A01', issued:false } ]

   Oldest first. The last entry is the TIP — the copy in front of you. Only
   the tip may be deleted; everything before it is locked, because removing it
   would leave a hole.

   ─── NOT RETROACTIVE ───────────────────────────────────────────────────────

   §17.1: no report in the field has a ledger today. seedLedger() therefore
   builds a ONE-ENTRY ledger from the revision a report already carries and
   marks it inferred. It does not invent the history that came before, and an
   inferred entry carries no digest — so comparisons against it answer
   "unknown", never "unchanged". A report that went out and was edited
   afterwards is undetectable now and always will be. Saying so is the honest
   behaviour; guessing is not.

   ─── PURE ──────────────────────────────────────────────────────────────────

   No app state, no clock, no randomness, no storage. Every function returns a
   NEW ledger and never mutates the one it was given — a caller that decides
   not to save must be able to simply drop the result.

   ─── DEBT TO CLOSE AT WIRING ───────────────────────────────────────────────

   frt/js/app.js still contains _parseRevision, _calcIssueRevision and
   _calcRevertDraft. Until the Issue flow is converted, TWO implementations of
   the grammar exist. That is a declared, temporary state, not a fork:
   tools/sim/version_sequence.mjs asserts the two agree everywhere the ruling
   says they should, and pins the three places the ruling deliberately
   overrules the old behaviour. At wiring time the HOST DELETES ITS OWN THREE
   FUNCTIONS and calls this engine. If they are still there afterwards, the
   conversion did not happen.
   ═════════════════════════════════════════════════════════════════════════ */

export var SEQ_SCHEMA = 1;

/* ── grammar ────────────────────────────────────────────────────────────────
   A01            a draft, before anything was ever issued
   B01            an issued copy
   B01A01         a revision being worked on top of an issued copy
   Letters run B..Z after A. A is the draft series and is never an issue.     */

function pad(n) { return (n < 10 ? '0' : '') + n; }

export function parseVersion(v) {
  if (typeof v !== 'string') return null;
  var s = v.trim().toUpperCase();
  var m = s.match(/^([B-Z])(\d{2,})A(\d{2,})$/);
  if (m) return { issued: false, onIssue: m[1] + m[2], letter: m[1], major: parseInt(m[2], 10), suffix: parseInt(m[3], 10) };
  m = s.match(/^([B-Z])(\d{2,})$/);
  if (m) return { issued: true, onIssue: null, letter: m[1], major: parseInt(m[2], 10), suffix: null };
  m = s.match(/^A(\d{2,})$/);
  if (m) return { issued: false, onIssue: null, letter: 'A', major: parseInt(m[1], 10), suffix: null };
  return null;
}

export function formatVersion(p) {
  if (!p) return '';
  if (p.letter === 'A') return 'A' + pad(p.major);
  if (p.suffix === null || p.suffix === undefined) return p.letter + pad(p.major);
  return p.letter + pad(p.major) + 'A' + pad(p.suffix);
}

/* ── reading a ledger ───────────────────────────────────────────────────── */

function entries(ledger) { return Array.isArray(ledger) ? ledger.filter(function (e) { return e && typeof e.v === 'string'; }) : []; }

export function tip(ledger) {
  var l = entries(ledger);
  return l.length ? l[l.length - 1] : null;
}

export function currentVersion(ledger) {
  var t = tip(ledger);
  return t ? t.v : '';
}

/* The last copy that was actually issued — what Issue compares against. */
export function lastIssued(ledger) {
  var l = entries(ledger);
  for (var i = l.length - 1; i >= 0; i--) if (l[i].issued) return l[i];
  return null;
}

/* §3.1 — anything with something after it is locked. The tip is open; a
   later report locks the whole ledger, tip included. */
export function isLocked(ledger, v, hasLaterReport) {
  if (hasLaterReport) return true;
  var l = entries(ledger);
  for (var i = 0; i < l.length; i++) if (l[i].v === v) return i < l.length - 1;
  return true;                     /* not in the ledger — never treat as open */
}

/* Only the tip may be deleted, and only while no later report exists.
   §3.1: this holds even after a PDF was produced. Mark's ruling, 5 Sep. */
export function canDelete(ledger, v, hasLaterReport) {
  if (hasLaterReport) return false;
  var t = tip(ledger);
  if (!t || t.v !== v) return false;
  return entries(ledger).length > 1;   /* the only copy is the report itself */
}

/* ── what comes next ────────────────────────────────────────────────────────
   Both derived by looking at what the ledger already holds. No counters. */

export function nextIssue(ledger) {
  var l = entries(ledger), letter = 'B', highest = 0;
  for (var i = 0; i < l.length; i++) {
    var p = parseVersion(l[i].v);
    if (!p || p.letter === 'A') continue;
    if (p.letter > letter) { letter = p.letter; highest = 0; }
    if (p.letter === letter && p.major > highest) highest = p.major;
  }
  return letter + pad(highest + 1);
}

export function nextDraft(ledger) {
  var l = entries(ledger), li = lastIssued(ledger);

  /* Nothing issued yet — the plain A series. */
  if (!li) {
    var hiA = 0;
    for (var i = 0; i < l.length; i++) {
      var p = parseVersion(l[i].v);
      if (p && p.letter === 'A') hiA = Math.max(hiA, p.major);
    }
    return 'A' + pad(hiA + 1);
  }

  /* Revisions sit on top of the newest issued copy. */
  var base = li.v, hiS = 0;
  for (var j = 0; j < l.length; j++) {
    var q = parseVersion(l[j].v);
    if (q && q.onIssue === base && q.suffix !== null) hiS = Math.max(hiS, q.suffix);
  }
  return base + 'A' + pad(hiS + 1);
}

/* ── moving the sequence ────────────────────────────────────────────────────
   Each returns a NEW ledger. None mutates its input.                        */

function copy(ledger) { return entries(ledger).map(function (e) { return Object.assign({}, e); }); }

/* §4 — pressing Issue repeatedly mints nothing. Issue compares the report in
   front of you against the last issued copy; unchanged words return the same
   number, no second copy, no message.

   digest is the answer from reportWords.wordsDigest(). Pass '' when it cannot
   be computed — an unknown answer must never be read as "unchanged", so it
   mints a new number rather than silently reusing one. */
export function issue(ledger, digest, meta) {
  var l = copy(ledger), li = lastIssued(l);
  if (li && digest && li.digest && li.digest === digest) {
    return { ledger: l, version: li.v, minted: false };
  }
  var v = nextIssue(l);
  l.push(Object.assign({ v: v, issued: true, digest: digest || '' }, meta || {}));
  return { ledger: l, version: v, minted: true };
}

/* Start revising on top of the newest issued copy. */
export function revise(ledger, meta) {
  var l = copy(ledger), v = nextDraft(l);
  l.push(Object.assign({ v: v, issued: false }, meta || {}));
  return { ledger: l, version: v };
}

/* §3.1/§6 — delete the tip and the copy before it opens again. Refuses
   anything that is not the tip; refusing is the whole point of the rule. */
export function remove(ledger, v, hasLaterReport) {
  if (!canDelete(ledger, v, hasLaterReport)) return { ledger: copy(ledger), removed: false, version: currentVersion(ledger) };
  var l = copy(ledger);
  l.pop();
  return { ledger: l, removed: true, version: currentVersion(l) };
}

/* ── entering the system ────────────────────────────────────────────────────
   §17.1 — not retroactive. One entry, marked inferred, carrying no digest. */
export function seedLedger(revision) {
  var v = parseVersion(revision) ? String(revision).trim().toUpperCase() : 'A01';
  return [{ v: v, issued: !!(parseVersion(v) || {}).issued, inferred: true }];
}

export function isInferred(ledger, v) {
  var l = entries(ledger);
  for (var i = 0; i < l.length; i++) if (l[i].v === v) return !!l[i].inferred;
  return false;
}
