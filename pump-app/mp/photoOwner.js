/* ═══════════════════════════════════════════════════════════════════════
   PHOTO OWNERSHIP                            multipump/js/photoOwner.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The answer to "which machine is this photograph of?" —
   for record photos, and above all for placard photographs, which are
   read by the AI scan and turned into the nameplate values that go into
   a signed report.

   ── WHY IT IS NEEDED ────────────────────────────────────────────────
   The shipped scan takes the MOST RECENT placard photo in the report:

       recordPhotos.filter(kind === 'placard').slice(-1)

   One pump, one placard, and that is exactly right. Two pumps and it is
   a coin toss that nobody sees being tossed. The inspector photographs
   FP-1's placard, then FP-2's, then opens FP-1 and scans — and reads
   FP-2's nameplate onto FP-1. The preview step catches a photo of the
   wrong THING (a pump body instead of its placard, which looks obviously
   wrong). It cannot catch a correctly-read placard belonging to the
   other machine: the numbers are real, they are plausible, and they are
   somebody else's.

   ── WHAT TODAY'S TOOL ALREADY DOES, AND WHY IT IS NOT ENOUGH ────────
   The tool already half-models two machines: the 3-point tab and the
   7-point tab are described in its own source as separate pumps
   (constant-speed and variable-speed), which is why there are two
   placard kinds, `placard` and `placard-pld`. That is a workaround with
   exactly two slots in it, tied to the test path rather than to the
   machine. Two constant-speed pumps in one room have nowhere to go. Once
   pumps are real, ownership belongs on the photograph.

   ── THE RULE THAT MATTERS MOST: NEVER GUESS ─────────────────────────
   On a one-pump report every photo belongs to that pump and can be
   tagged without asking. On a two-pump report an untagged placard is
   genuinely unknown, and this file REFUSES rather than picking one.
   A refusal costs the inspector one tap to say which machine it is. A
   guess costs a nameplate on the wrong pump in a signed document, and
   there is nothing downstream that would catch it.

   ── DELETION STAYS ONE LIST ─────────────────────────────────────────
   Ownership tags a photo; it never moves one into a per-pump list. The
   tombstones are one list for the whole report, deliberately (see
   sectionScope.js): a photo deleted on one device and resurrected under
   another scope is the failure that rule exists to prevent.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* The host owns what "deleted" means — PhotoLifecycle, tombstones, the
   lot. This file asks; it does not reimplement. A caller that supplies
   no predicate gets the conservative answer: nothing is hidden. */
function notDeleted(isDeleted) {
  return function (p) { return typeof isDeleted === 'function' ? !isDeleted(p) : true; };
}

function ownerOf(photo) {
  return (photo && photo.owner && photo.owner.scope) ? photo.owner : null;
}
function tag(photo, scope, id) {
  if (!photo) throw new Error('tag: no photo');
  if (scope !== 'room' && scope !== 'pump') throw new Error('tag: scope must be room or pump');
  if (scope === 'pump' && !id) throw new Error('tag: a pump-owned photo needs the pump id');
  photo.owner = (scope === 'room') ? { scope: 'room' } : { scope: 'pump', id: id };
  return photo;
}
function ownedBy(photo, pumpId) {
  var o = ownerOf(photo);
  return !!(o && o.scope === 'pump' && o.id === pumpId);
}

/* Photos with no owner at all. On a multi-pump report these are the ones
   the interface must ask about — surfaced, not silently filed. */
function unassigned(photos, isDeleted) {
  return (photos || []).filter(notDeleted(isDeleted)).filter(function (p) { return !ownerOf(p); });
}

function forPump(photos, pumpId, opts) {
  opts = opts || {};
  return (photos || []).filter(notDeleted(opts.isDeleted)).filter(function (p) {
    if (!ownedBy(p, pumpId)) return false;
    if (opts.kind && (p.kind || '') !== opts.kind) return false;
    return true;
  });
}

/* ── the placard the scan may read ─────────────────────────────────── */

/* Answers with a photo, or with a refusal that says why. Never a guess.

   `mode` keeps the shipped tool's two placard kinds working: 'std' reads
   the constant-speed placard, 'pld' the variable-speed one. Once pumps
   are real these are a property of the pump, not of the tab, and this is
   the seam where that changes. */
function placardFor(photos, pumpId, opts) {
  opts = opts || {};
  var kind = (opts.mode === 'pld') ? 'placard-pld' : 'placard';
  var live = (photos || []).filter(notDeleted(opts.isDeleted));

  var mine = live.filter(function (p) { return (p.kind || '') === kind && ownedBy(p, pumpId); });
  if (mine.length) return { photo: mine[mine.length - 1], from: 'owned' };

  /* The shipped fallback — the Pump box, when the placard box is empty —
     is kept, because filing a placard shot under the wrong label is the
     commonest mis-file on site. It is kept OWNED: this pump's pump-box
     photo, never anyone else's. */
  var mineFallback = live.filter(function (p) { return (p.kind || '') === 'pump' && ownedBy(p, pumpId); });
  if (mineFallback.length) return { photo: mineFallback[mineFallback.length - 1], from: 'pump-box' };

  /* Nothing owned. Is there an untagged one that MIGHT be this pump's? */
  var untagged = live.filter(function (p) { return (p.kind || '') === kind && !ownerOf(p); });
  if (untagged.length) {
    if (opts.singlePump) return { photo: untagged[untagged.length - 1], from: 'untagged-single-pump' };
    return { refused: 'unassigned', candidates: untagged.length,
             why: untagged.length + ' placard photo(s) are not assigned to a pump yet. '
                + 'Which machine this one is of has to be said, not guessed.' };
  }

  /* Placards exist, but they are other machines'. Say so plainly: an
     inspector told "capture a placard photo first" while one is visibly
     on screen reads the tool as broken. */
  var others = live.filter(function (p) { return (p.kind || '') === kind; });
  if (others.length) {
    return { refused: 'other-pumps', candidates: others.length,
             why: 'The placard photos in this report belong to other pumps. Photograph this machine\u2019s placard.' };
  }
  return { refused: 'none', candidates: 0, why: 'No placard photo in this report yet.' };
}

/* ── legacy ────────────────────────────────────────────────────────── */

/* A report written by a single-pump tool has one machine in it, so every
   untagged photo is that machine's — except the room's own record shots,
   which the caller names. More than one pump means the question is real
   and this refuses to answer it. */
function adoptLegacy(photos, rep, pumpId, opts) {
  opts = opts || {};
  if (!rep || !rep.pumps || rep.pumps.length !== 1) {
    return { adopted: 0, refused: 'not-single-pump',
             why: 'This report has ' + ((rep && rep.pumps && rep.pumps.length) || 0)
                + ' pumps. An untagged photo cannot be assigned without being asked about.' };
  }
  var roomKinds = opts.roomKinds || ['site'];
  var n = 0;
  (photos || []).forEach(function (p) {
    if (ownerOf(p)) return;
    if (roomKinds.indexOf(p.kind || '') !== -1) { tag(p, 'room'); return; }
    tag(p, 'pump', pumpId); n++;
  });
  return { adopted: n };
}

var API = { ownerOf: ownerOf, tag: tag, ownedBy: ownedBy, unassigned: unassigned,
            forPump: forPump, placardFor: placardFor, adoptLegacy: adoptLegacy };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPPhotoOwner = API;

})(typeof window !== 'undefined' ? window : globalThis);
