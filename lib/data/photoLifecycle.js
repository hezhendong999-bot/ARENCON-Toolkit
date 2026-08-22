/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — PHOTO LIFECYCLE          lib/data/photoLifecycle.js v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 3 — first cut: pure logic, no DOM.

   WHAT THIS OWNS. Whether a photo is deleted, when it was taken, how a delete
   is recorded, how a restore is recorded, how legacy records are brought to
   the canonical shape, and how long a deleted photo has left in the trash.
   Nothing here draws anything or touches storage.

   WHY THIS IS THE FIRST THING OUT OF part07. It is the part where being wrong
   loses a photograph. A photo taken in a pump room and then wrongly marked
   deleted is not a bug report — it is evidence that no longer exists, on a job
   that has been signed. Every rule below was written after that nearly
   happened, and the rules are subtle enough that a second copy WILL drift:

     • THE PHANTOM-DELETE GUARD (7155.51). A delete that nobody asked for is
       refused if the photo is younger than ten seconds. Deletes carry force
       when a person actually tapped Delete; everything else — merge
       propagation, cleanup passes, anything programmatic — cannot remove a
       photo that has only just been captured. The refusal is loud, and the
       caller is recorded, because a silent refusal and a silent deletion are
       equally impossible to investigate from the field.
     • DELETION IS A STATE, NOT A FLAG. delState is 'deleted' or 'live' and it
       is authoritative; the older `deleted` booleans are still written as a
       mirror so a tablet on an older cached build reads the same answer, and
       are still read as a fallback for records written before S354. Direction
       matters: a restore must be recorded as a decision, because between two
       devices an absent flag and a deliberate restore look identical.
     • A PHOTO'S AGE COMES FROM ITS OWN ID. Ids are minted ph_<ms>_<rand>, so
       the capture time travels with the record and survives every merge. That
       is what makes the phantom guard work on a device that never saw the
       capture.

   BEHAVIOUR IS IDENTICAL, BUG FOR BUG — this is a MOVE. tools/sim/photolife.mjs
   pins it against a capture of what the live Diesel functions produced before
   the extraction.

   ── WHAT STAYS WITH THE HOST ──────────────────────────────────────────────
   Diagnostics and the toast. The host is told a delete was blocked and decides
   how to say so; this module never reaches for `window` or a UI. The host also
   keeps every storage path, unchanged (S496 rule).

   ── HOST CONTRACT ─────────────────────────────────────────────────────────
   Classic <script>. Publishes window.PhotoLifecycle. No bare `export`.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* S371 — 90 days, raised from 60 to match the all-tools backup plan. The host
   still owns the number (it is passed in on every call); this is the fallback
   for a caller that does not supply one, and it must match what the tools
   actually promise on screen — "you can restore it for N days" and the trash
   countdown have to be the same N. */
var TRASH_RETENTION_DAYS = 90;
var PHANTOM_WINDOW_MS = 10000;

/* Deleted or not. delState is authoritative; the legacy boolean is the
   fallback for records written before the canonical model existed. */
function isDeleted(p) {
  if (!p) return false;
  if (p.delState === 'deleted') return true;
  if (p.delState === 'live') return false;
  return !!p.deleted;
}

/* Capture time, read out of the photo's own id (ph_<ms>_<rand>). Unparseable
   means 0, which the phantom guard reads as "age unknown" and lets through —
   deliberately: a guard that blocks on missing information would refuse real
   deletes on every legacy photo. */
function createdTs(ph) {
  try {
    var m = String((ph && ph.id) || '').match(/^ph_(\d{10,})_/);
    return m ? parseInt(m[1], 10) : 0;
  } catch (e) { return 0; }
}

/* Record a delete. Returns a RESULT rather than just a boolean, so the host
   can say what happened without this module knowing what a toast is:
     { ok, blocked, reason, ageMs, forced, at }
   ok=false with blocked=true is the phantom refusal; ok=false without it is
   "already deleted", which is not a failure, just nothing to do. */
function markDeleted(ph, opts) {
  if (!ph) return { ok: false, blocked: false, reason: 'no-photo', ageMs: -1, forced: false };
  var forced = !!(opts && opts.force);
  if (isDeleted(ph)) return { ok: false, blocked: false, reason: 'already-deleted', ageMs: -1, forced: forced };

  var now = (opts && opts.now) || Date.now();
  var created = createdTs(ph);
  var ageMs = created ? (now - created) : -1;

  /* THE PHANTOM GUARD. Not forced + demonstrably fresh = refuse. */
  if (!forced && ageMs >= 0 && ageMs < PHANTOM_WINDOW_MS) {
    return { ok: false, blocked: true, reason: 'phantom-fresh', ageMs: ageMs, forced: forced };
  }

  var at = new Date(now).toISOString();
  ph.delState = 'deleted';
  ph.delAt = at;
  /* Legacy mirror — still written so an older cached build reads the same
     answer, never read by this build except as the fallback above. */
  ph.deleted = true;
  ph.deletedDate = at;
  ph.deletedBy = forced ? 'user' : 'system';
  return { ok: true, blocked: false, reason: 'deleted', ageMs: ageMs, forced: forced, at: at };
}

/* Record a restore. Putting a photo back is a DECISION and is recorded as one;
   the legacy mirror is cleared so an older build agrees. */
function markLive(ph) {
  if (!ph) return false;
  ph.delState = 'live';
  delete ph.delAt;
  delete ph.deleted;
  delete ph.deletedDate;
  delete ph.deletedBy;
  return true;
}

/* Bring one legacy record to the canonical shape. Idempotent. */
function normalize(p, now) {
  if (!p || typeof p !== 'object') return p;
  if (p.delState === 'deleted' || p.delState === 'live') return p;
  if (p.deleted) {
    p.delState = 'deleted';
    p.delAt = p.deletedDate || p.delAt || new Date(now || Date.now()).toISOString();
    p.deletedBy = p.deletedBy || 'legacy';
    p.deletedDate = p.delAt;
  } else {
    p.delState = 'live';
  }
  return p;
}

/* Walk a whole saved report and normalise every photo in it, wherever photos
   live. The SHAPE of a report is the host's business, so the host declares the
   places to look; the default covers the pump tools' layout, which is the one
   this was extracted from. Missing a location here means legacy records in
   that corner keep answering from the old boolean — correct, but never
   upgraded, so the list matters. */
var DEFAULT_ARRAYS = ['recordPhotos', 'flowTestPhotos', 'flowTestPhotosPld'];
var DEFAULT_ROWSETS = ['stdData', 'pldData'];

function normalizeAll(s, spec) {
  if (!s || typeof s !== 'object') return s;
  spec = spec || {};
  var arrays = spec.arrays || DEFAULT_ARRAYS;
  var rowsets = spec.rowSets || DEFAULT_ROWSETS;
  function arr(a) { if (Array.isArray(a)) a.forEach(function (p) { normalize(p); }); }

  arrays.forEach(function (k) { arr(s[k]); });
  rowsets.forEach(function (k) {
    if (Array.isArray(s[k])) s[k].forEach(function (r) { if (r && Array.isArray(r.photos)) arr(r.photos); });
  });
  if (s.clState) {
    Object.keys(s.clState).forEach(function (k) {
      var v = s.clState[k];
      if (v && Array.isArray(v.photos)) arr(v.photos);
    });
  }
  if (s.deficiencies) {
    Object.keys(s.deficiencies).forEach(function (ctr) {
      (s.deficiencies[ctr] || []).forEach(function (d) {
        if (Array.isArray(d.photos)) arr(d.photos);
        (d.responses || []).forEach(function (r) { if (Array.isArray(r.photos)) arr(r.photos); });
      });
    });
  }
  if (Array.isArray(s.generalDeficiencies)) {
    s.generalDeficiencies.forEach(function (d) {
      if (Array.isArray(d.photos)) arr(d.photos);
      (d.responses || []).forEach(function (r) { if (Array.isArray(r.photos)) arr(r.photos); });
    });
  }
  return s;
}

/* Days left before a deleted photo is purged for good. */
function trashDaysLeft(iso, retentionDays, now) {
  var days = (retentionDays == null) ? TRASH_RETENTION_DAYS : retentionDays;
  if (!iso) return days;
  var t = new Date(iso).getTime();
  if (!t) return days;
  var elapsed = Math.floor((((now == null) ? Date.now() : now) - t) / 86400000);
  return Math.max(0, days - elapsed);
}

var api = {
  isDeleted: isDeleted,
  createdTs: createdTs,
  markDeleted: markDeleted,
  markLive: markLive,
  normalize: normalize,
  normalizeAll: normalizeAll,
  trashDaysLeft: trashDaysLeft,
  TRASH_RETENTION_DAYS: TRASH_RETENTION_DAYS,
  PHANTOM_WINDOW_MS: PHANTOM_WINDOW_MS,
  VERSION: '1.0.0'
};

if (root) root.PhotoLifecycle = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
