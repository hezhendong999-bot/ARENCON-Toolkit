/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — PHOTO RETENTION       lib/data/photoRetention.js v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 3 — fourth cut.

   WHAT THIS OWNS. Which deleted photographs may be destroyed for good, the
   order the trash is shown in, and — the part that matters most — THE ORDER
   THEY MUST BE REMOVED IN.

   THIS IS THE ONLY MODULE IN THE TOOLKIT WHOSE OUTPUT IS PERMANENT. Everything
   else here can be undone: a wrong verdict is re-typed, a wrong date is
   corrected, a soft-deleted photo is restored. A purge cannot be undone. The
   photograph is gone from the device and from the bucket and there is nothing
   to restore from. That is the whole reason it is extracted rather than
   duplicated into Electric later.

   ── THE THREE RULES ──────────────────────────────────────────────────────

   1. ELIGIBILITY. A photo may be destroyed only if it is deleted AND carries a
      readable deletion time AND that time is older than the retention window.
      Note the middle clause: a deleted photo with NO readable timestamp is
      never purged. It sits in the trash indefinitely. That is deliberate and
      must stay — the alternative is treating "I don't know when this was
      deleted" as "delete it now", and being wrong about that is unrecoverable.

   2. REMOVAL ORDER — DESCENDING INDEX WITHIN EACH BUCKET. Photos are removed
      from arrays by position. Remove position 2 before position 5 and every
      later position shifts down by one, so the removal aimed at 5 lands on
      what was 6 — a photograph nobody asked to destroy, permanently, while the
      one that was supposed to go survives. Removing highest-index-first makes
      every remaining index still correct. This is not a preference. Reversing
      this sort destroys the wrong photographs, and it is the kind of change
      that looks harmless in a diff.

   3. THE TRASH IS SHOWN NEWEST-DELETED FIRST, so the thing someone just
      removed by mistake is the thing at the top when they go looking for it.

   ── A KNOWN INCONSISTENCY, PRESERVED ON PURPOSE ──────────────────────────
   Eligibility reads the LEGACY `deleted` flag, while the trash listing reads
   the canonical deleted state. Today those always agree, because recording a
   delete writes both. But a record whose canonical state says deleted while
   the legacy flag is missing would appear in the trash and never expire from
   it. That is latent, not active, and this module reproduces the live
   behaviour exactly rather than quietly changing what may be destroyed. It is
   written down here so the next person finds it as a decision rather than a
   discovery.

   HOST CONTRACT: classic <script>, publishes window.PhotoRetention.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var DEFAULT_RETENTION_DAYS = 90;

/* When a photo was deleted. Both spellings are read because records written
   before the canonical model only carry the older one — and this fallback was
   previously written out separately in the trash listing and the purge sweep,
   two copies of the question "when did this happen". */
function deletedAt(p) {
  if (!p) return 0;
  var iso = p.delAt || p.deletedDate;
  if (!iso) return 0;
  var t = new Date(iso).getTime();
  return t > 0 ? t : 0;
}

/* Rule 1 — may this be destroyed? Deleted, timestamped, and older than the
   window. No timestamp means never, deliberately. */
function isExpired(p, opts) {
  opts = opts || {};
  var days = (opts.retentionDays == null) ? DEFAULT_RETENTION_DAYS : opts.retentionDays;
  var now = (opts.now == null) ? Date.now() : opts.now;
  if (!p || !p.deleted) return false;
  var t = deletedAt(p);
  return t > 0 && t < (now - days * 86400000);
}

/* The eligible subset of an inventory listing, already in the order they must
   be removed in — eligibility and ordering are returned together on purpose,
   so no caller can obtain the list without the ordering that makes removing it
   safe. */
function expiredAmong(entries, opts) {
  var out = (entries || []).filter(function (a) { return isExpired(a && a.photo, opts); });
  return removalOrder(out);
}

/* Rule 2 — highest index first within each bucket. See the header: reversing
   this destroys photographs nobody selected. */
function removalOrder(entries) {
  return (entries || []).slice().sort(function (a, b) {
    var ka = ((a.type || '') + '|' + (a.section || ''));
    var kb = ((b.type || '') + '|' + (b.section || ''));
    if (ka !== kb) return ka < kb ? -1 : 1;
    return (b.idx || 0) - (a.idx || 0);
  });
}

/* Rule 3 — trash listing, newest deletion first. */
function trashOrder(entries) {
  return (entries || []).slice().sort(function (x, y) {
    return deletedAt(y && y.photo) - deletedAt(x && x.photo);
  });
}

/* Days remaining before a deleted photo becomes eligible. */
function daysLeft(p, opts) {
  opts = opts || {};
  var days = (opts.retentionDays == null) ? DEFAULT_RETENTION_DAYS : opts.retentionDays;
  var now = (opts.now == null) ? Date.now() : opts.now;
  var t = deletedAt(p);
  if (!t) return days;
  return Math.max(0, days - Math.floor((now - t) / 86400000));
}

var api = {
  deletedAt: deletedAt,
  isExpired: isExpired,
  expiredAmong: expiredAmong,
  removalOrder: removalOrder,
  trashOrder: trashOrder,
  daysLeft: daysLeft,
  DEFAULT_RETENTION_DAYS: DEFAULT_RETENTION_DAYS,
  VERSION: '1.0.0'
};

if (root) root.PhotoRetention = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
