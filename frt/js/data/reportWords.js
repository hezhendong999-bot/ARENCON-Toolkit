/* ═══ frt/js/data/reportWords.js ═════════════════════════════════════════════
   "THE WORDS" — what a report SAYS, with nothing else in it.

   The versioning rulebook (LOCKED_REPORT_VERSIONING.md §4) says pressing Issue
   twice mints nothing: if the words have not moved, the answer is the same
   number again. That rule needs one honest answer to one question —

       has the content of this report changed since the last issued copy?

   §17.1 names this the load-bearing piece and the easiest thing to get wrong.
   If anything volatile leaks in — a sync timestamp, a photo reference re-keyed
   when its upload finally lands, the order an array happened to load in —
   then merely OPENING a report reads as an edit, and the tool forks revisions
   nobody asked for.

   So the rule of this file is subtractive:

     THE WORDS ARE WHAT PRINTS. Nothing else is in here.

   IN  — what an inspector wrote, chose, numbered or signed: report header
         fields, deficiency numbers and their status/priority/category,
         observation text, contractor names and trades, contractor thread
         entries, captions, which photographs are attached, signatures.

   OUT — everything the machine writes by itself: created/modified stamps,
         sync state, device and session fields, storage pointers (r2Key,
         r2Url, thumb, thumbUrl, thumbKey, dataUrl, blob: URLs), hydration
         flags, colours, and the order any array happens to be in.

   A photograph's IDENTITY is in; a photograph's LOCATION is out. When a
   photo finishes uploading, its pointer changes and the picture does not —
   the report still says the same thing, so the digest must not move.

   Version numbers are deliberately absent. The words are the content; the
   number is the label the sequence engine puts on them. Mixing them would
   make every issue look like a change.

   PURE. No imports, no app state, no clock, no randomness. Same input, same
   output, in a browser or in node. That is what makes it testable —
   tools/sim/words_stability.mjs is the proof and must pass before any of
   this is wired to the Issue button.

   Schema changes: bump WORDS_SCHEMA. A stored export record carries the
   schema it was written under; digests from different schemas are never
   compared as equal — they are treated as "cannot tell", never as "changed".
   ═════════════════════════════════════════════════════════════════════════ */

export var WORDS_SCHEMA = 1;

/* ── normalisers ────────────────────────────────────────────────────────────
   Missing, null, undefined and '' are the same absence. Whitespace is not
   content: a trailing space or a re-wrapped newline is not an edit.          */

function T(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}
function B(v) { return v === true ? '1' : '0'; }
function N(v) {
  if (v === null || v === undefined || v === '') return '';
  var f = Number(v);
  if (!isFinite(f)) return '';
  return String(Math.round(f));
}
/* Pin coordinates are FRACTIONS of the sheet, 0–1, clamped at drag time and
   never rewritten on load (verified in viewer.js and pinDrag.js at HEAD
   814d2771). Four decimals is under half a pixel on a 4000px-wide sheet — fine
   enough that a real nudge registers, coarse enough to absorb float noise if a
   coordinate is ever re-derived from device pixels. */
function C(v) {
  if (v === null || v === undefined || v === '') return '';
  var f = Number(v);
  if (!isFinite(f)) return '';
  return f.toFixed(4);
}

/* ── canonical serialisation ────────────────────────────────────────────────
   Objects: keys sorted, so field order never matters.
   Arrays:  each element serialised, then SORTED BY ITS OWN TEXT, so the order
            an array arrived in never matters. Print order is not lost — it is
            carried by the numbers inside the content (a deficiency's num), so
            a renumber IS a change and a reshuffle is NOT.                     */

function canon(v) {
  if (v === null || v === undefined) return '~';
  if (Array.isArray(v)) {
    var parts = [];
    for (var i = 0; i < v.length; i++) parts.push(canon(v[i]));
    parts.sort();
    return '[' + parts.join(',') + ']';
  }
  if (typeof v === 'object') {
    var keys = Object.keys(v).sort();
    var out = [];
    for (var k = 0; k < keys.length; k++) {
      out.push(JSON.stringify(keys[k]) + ':' + canon(v[keys[k]]));
    }
    return '{' + out.join(',') + '}';
  }
  return JSON.stringify(v);
}

/* ── digest ─────────────────────────────────────────────────────────────────
   Two independent 32-bit lanes, mixed and printed as 16 hex characters.
   Not cryptography — this is change detection over a few hundred KB of the
   firm's own text. Synchronous by design: SubtleCrypto is async and the
   Issue button must be able to answer without awaiting anything.             */

function digest(str) {
  var h1 = 0x9c274201, h2 = 0x1b873593;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
    h1 = (h1 << 13) | (h1 >>> 19);
    h2 = (h2 << 7) | (h2 >>> 25);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h1 ^= h2 >>> 15; h2 ^= h1 >>> 17;
  var a = (h1 >>> 0).toString(16), b = (h2 >>> 0).toString(16);
  while (a.length < 8) a = '0' + a;
  while (b.length < 8) b = '0' + b;
  return a + b;
}

/* ── photographs: identity in, location out ─────────────────────────────── */

function photoWords(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (!p || !p.id) continue;
    if (p.deleted === true || p.purged === true) continue;   // does not print
    out.push({ id: T(p.id), cap: T(p.caption) });
  }
  return out;
}

/* ── contractor thread ──────────────────────────────────────────────────── */

function entryWords(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    if (e.removed === true) continue;                        // does not print
    out.push({
      round: N(e.round),
      inst: N(e.frtInstance),
      company: T(e.company),
      date: T(e.date),
      reported: T(e.statusReported),
      text: T(e.text),
      noResp: B(e.noResponse),
      working: B(e.workingCopy),
      withdrawn: B(e.withdrawn),
      replyTo: T(e.replyTo),
      photos: photoWords(e.rectPhotos).concat(photoWords(e.followupPhotos))
    });
  }
  return out;
}

function obsWords(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (!o) continue;
    out.push({
      text: T(o.text),
      priority: T(o.priority),
      trade: T(o.trade),
      addressed: B(o.addressed),
      rec: B(o.isRecommendation),
      repeat: N(o.repeatCount),
      notedInst: N(o.notedOnInstance),
      notedDate: T(o.notedDate),
      photos: photoWords(o.photos),
      responses: entryWords(o.responses),
      followups: entryWords(o.followups)
    });
  }
  return out;
}

function deficWords(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    if (!d) continue;
    if (d.deleted === true) continue;                        // does not print
    out.push({
      num: N(d.num),
      status: T(d.status),
      priority: T(d.priority),
      category: T(d.category),
      rec: B(d.isRecommendation),
      drawing: T(d.drawingId),
      x: C(d.pinX), y: C(d.pinY),
      date: T(d.date),
      notedDate: T(d.notedDate),
      notedInst: N(d.notedOnInstance),
      obs: obsWords(d.observations),
      photos: photoWords(d.photos)
    });
  }
  return out;
}

/* ── the projection ─────────────────────────────────────────────────────── */

export function reportWords(proj) {
  if (!proj || typeof proj !== 'object') return null;
  var info = proj.info || {};
  var sig = proj.signatures || {};

  var contractors = [];
  var cl = Array.isArray(proj.contractors) ? proj.contractors : [];
  for (var i = 0; i < cl.length; i++) {
    var c = cl[i];
    if (!c) continue;
    var trades = Array.isArray(c.trades) ? c.trades.map(T) : [];
    contractors.push({
      name: T(c.name),
      trades: trades,
      defics: deficWords(c.deficiencies)
    });
  }

  var drawings = [];
  var dl = Array.isArray(proj.drawings) ? proj.drawings : [];
  for (var j = 0; j < dl.length; j++) {
    var g = dl[j];
    if (!g || g.deleted === true) continue;
    drawings.push({ id: T(g.id), name: T(g.name), folder: T(g.folder) });
  }

  return {
    schema: WORDS_SCHEMA,
    header: {
      projectNumber: T(info.projectNumber),
      projectName: T(info.projectName),
      client: T(info.client),
      address: T(info.address),
      city: T(info.city),
      province: T(info.province),
      dateOfIssue: T(info.dateOfIssue),
      scope: T(info.scope),
      visitDate: T(info.visitDate),
      inspectorName: T(info.inspectorName),
      weather: T(info.weather),
      purpose: T(info.purpose),
      generalNotes: T(info.generalNotes)
    },
    contractors: contractors,
    siteDefics: deficWords(proj.generalDeficiencies),
    sitePhotos: photoWords(proj.photos).concat(photoWords(proj.sitePhotos)),
    drawings: drawings,
    signatures: {
      inspector: T(sig.sigInspectorName),
      inspectorDate: T(sig.sigInspectorDate),
      inspectorMark: sig.sigInspectorData ? digest(String(sig.sigInspectorData)) : '',
      witness: T(sig.sigWitnessName),
      witnessDate: T(sig.sigWitnessDate),
      witnessMark: sig.sigWitnessData ? digest(String(sig.sigWitnessData)) : ''
    }
  };
}

/* The one call the Issue button makes. Returns '' for a project it cannot
   read — never a fake digest, because an unreadable report must read as
   "cannot tell", never as "unchanged". */
export function wordsDigest(proj) {
  var w = reportWords(proj);
  if (!w) return '';
  return digest(canon(w));
}

/* Compare against a stored export record. Returns 'same', 'changed', or
   'unknown'. Different schema, or a missing digest, is UNKNOWN — the caller
   must treat unknown as "ask", never as "unchanged". */
export function wordsCompare(proj, record) {
  if (!record || !record.digest || record.schema !== WORDS_SCHEMA) return 'unknown';
  var d = wordsDigest(proj);
  if (!d) return 'unknown';
  return d === record.digest ? 'same' : 'changed';
}

/* Exposed for the probe and for a future diff view — not for the app. */
export function _canon(v) { return canon(v); }
export function _digest(s) { return digest(s); }
