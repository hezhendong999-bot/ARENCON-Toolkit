/* ═══════════════════════════════════════════════════════════════════════
   DEFICIENCY OWNERSHIP                 multipump/js/deficiencyOwner.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. Which machine a deficiency was found on — and, just as
   importantly, when the honest answer is "the room" rather than either
   pump.

   ── WHY IT MATTERS MORE THAN THE OTHER SPLITS ───────────────────────
   A deficiency is the part of the report somebody has to act on. It goes
   to a contractor with a description and photographs, and the contractor
   walks into a pump room with two machines in it. "Controller fails to
   start on pressure drop" against neither machine is a work order that
   cannot be filled: the contractor either asks, and loses a day, or
   guesses, and the wrong controller gets worked on while the failed one
   stays failed in a building that is supposed to be protected.

   So a deficiency raised at a machine carries that machine, and one
   raised against something shared carries the room. Neither is a
   default — each is recorded when the deficiency is created, from where
   the inspector was standing in the report.

   ── DEFICIENCIES ARE FILED BY CONTRACTOR, NOT BY MACHINE ────────────
   The shipped tool groups deficiencies under the contractor responsible,
   which is right — that grouping is how the report gets actioned, and it
   must not change. Ownership is therefore a tag on the deficiency, not a
   regrouping of the list. The contractor's list stays one list; each
   entry knows which machine it is about.

   ── RESPONSES AND PHOTOS RIDE WITH THEIR DEFICIENCY ─────────────────
   A contractor's response, and the photographs attached to it, belong to
   whatever the deficiency belongs to. They are never owned separately:
   two owners on one thread is how a response ends up filed against a
   machine its deficiency was never about.

   ── DELETION STAYS ONE LIST ─────────────────────────────────────────
   As with photos: ownership tags, it never moves an entry into a
   per-pump list. Tombstones stay whole for the report, because a
   deficiency deleted on one device and resurrected under another scope
   is precisely the failure that rule exists to prevent.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var CL = root.MPChecklistScope || null;

function ownerOf(d) { return (d && d.owner && d.owner.scope) ? d.owner : null; }

function tag(d, scope, id) {
  if (!d) throw new Error('tag: no deficiency');
  if (scope !== 'room' && scope !== 'pump') throw new Error('tag: scope must be room or pump');
  if (scope === 'pump' && !id) throw new Error('tag: a pump deficiency needs the pump id');
  d.owner = (scope === 'room') ? { scope: 'room' } : { scope: 'pump', id: id };
  /* A response belongs to its deficiency, never to a machine of its own. */
  (d.responses || []).forEach(function (r) { if (r && r.owner) delete r.owner; });
  return d;
}

/* Where a deficiency raised from a checklist item belongs: the item's own
   scope decides, so a shared item raises a room deficiency and a machine
   item raises one against that machine. One rule, one place. */
function ownerForItem(itemId, activePumpId) {
  var scope = CL ? CL.scopeOfItem(itemId) : 'pump';
  if (scope === 'room') return { scope: 'room' };
  if (!activePumpId) return null;                       /* caller must know which machine */
  return { scope: 'pump', id: activePumpId };
}

function ownedBy(d, pumpId) {
  var o = ownerOf(d);
  return !!(o && o.scope === 'pump' && o.id === pumpId);
}
function isRoom(d) {
  var o = ownerOf(d);
  return !!(o && o.scope === 'room');
}

/* Walk every deficiency in the report — the contractor-keyed map and the
   general list — without changing how either is grouped. */
function walk(byContractor, general, fn) {
  Object.keys(byContractor || {}).forEach(function (ctr) {
    (byContractor[ctr] || []).forEach(function (d, i) { fn(d, { contractor: ctr, index: i }); });
  });
  (general || []).forEach(function (d, i) { fn(d, { contractor: null, index: i, general: true }); });
}

/* What a given machine is answerable for, plus the room's — which is
   what a contractor attending that pump actually needs to see. */
function forPump(byContractor, general, pumpId, opts) {
  opts = opts || {};
  var out = [];
  walk(byContractor, general, function (d, at) {
    if (typeof opts.isDeleted === 'function' && opts.isDeleted(d)) return;
    if (ownedBy(d, pumpId) || (opts.includeRoom !== false && isRoom(d))) out.push({ d: d, at: at });
  });
  return out;
}

/* Deficiencies with no machine recorded. On a one-pump report these are
   answerable without asking; on a two-pump report they are a real
   question and are surfaced, never assigned by guess. */
function unassigned(byContractor, general, opts) {
  opts = opts || {};
  var out = [];
  walk(byContractor, general, function (d, at) {
    if (typeof opts.isDeleted === 'function' && opts.isDeleted(d)) return;
    if (!ownerOf(d)) out.push({ d: d, at: at });
  });
  return out;
}

/* A report from the single-pump tool: one machine, so an untagged
   deficiency raised at the pump is that pump's, and a general one is the
   room's. More than one pump and this refuses. */
function adoptLegacy(byContractor, general, rep, pumpId) {
  if (!rep || !rep.pumps || rep.pumps.length !== 1) {
    return { adopted: 0, refused: 'not-single-pump',
             why: 'This report has ' + ((rep && rep.pumps && rep.pumps.length) || 0)
                + ' pumps. Which machine a deficiency was found on has to be said, not guessed — '
                + 'a work order against the wrong machine leaves the failed one failed.' };
  }
  var n = 0;
  walk(byContractor, general, function (d, at) {
    if (ownerOf(d)) return;
    tag(d, at.general ? 'room' : 'pump', pumpId);
    n++;
  });
  return { adopted: n };
}

/* Before issuing: every deficiency a contractor will act on must say
   which machine, or say the room. Silence is the one unacceptable state. */
function readyToIssue(byContractor, general, rep, opts) {
  var multi = !!(rep && rep.pumps && rep.pumps.length > 1);
  var blank = unassigned(byContractor, general, opts);
  if (!multi || !blank.length) return { ok: true, unassigned: blank.length };
  return { ok: false, unassigned: blank.length,
           why: blank.length + ' deficiency(ies) do not say which machine they were found on. '
              + 'A contractor attending a two-pump room cannot act on that.' };
}

var API = { ownerOf: ownerOf, tag: tag, ownerForItem: ownerForItem, ownedBy: ownedBy, isRoom: isRoom,
            walk: walk, forPump: forPump, unassigned: unassigned, adoptLegacy: adoptLegacy,
            readyToIssue: readyToIssue };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPDeficiencyOwner = API;

})(typeof window !== 'undefined' ? window : globalThis);
