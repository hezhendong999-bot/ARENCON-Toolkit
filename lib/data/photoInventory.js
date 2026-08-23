/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — PHOTO INVENTORY       lib/data/photoInventory.js v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 3 — third cut.

   WHAT THIS OWNS. Which photographs in a project are VISIBLE to a caller, and
   the shape of the list they come back in. Not what they are called, not what
   badge they carry, not what order the sources are declared in — those are the
   tool's personality and stay with the tool. What is shared is the one thing
   that must never differ between two tools: the rule deciding whether a photo
   appears at all.

   WHY THE FILTER IS THE PART WORTH SHARING. It has two settings that are easy
   to get wrong in opposite and equally damaging directions, and both have
   already happened:

     • TOO STRICT (S367). The live-only filter was hard-coded here, so the
       consumers that manage DELETED photos — the Recently Deleted list,
       Restore, Purge — asked for the full walk and silently got the live-only
       one. Recently Deleted was always empty and Restore could never find a
       photograph to restore. Nothing errored. The photos were there the whole
       time and no screen would show them.

     • TOO LOOSE. The default must stay live-only, because roughly thirty
       callers depend on it — the gallery, badge filenames, reassignment,
       counts, and the PDF appendix. Loosen it and soft-deleted photos and
       internal backup duplicates leak into a client's report. A deleted
       placard appearing in an issued PDF is not a display bug; it is the tool
       publishing something somebody deliberately removed.

   So: default is live only. `includeDeleted` gives the full walk, for the
   deletion-management consumers. `includeBackups` adds the clean-original
   backups the gallery shows as their own tiles (S372) and the appendix must
   never set.

   ── THE CONTRACT ─────────────────────────────────────────────────────────
   The host declares its SOURCES, in its own order, each knowing how to walk
   its own corner of a report and what to call what it finds. The engine hands
   each source an `emit` and that emit is the ONLY way into the list — which is
   what makes the filter unskippable. A source cannot forget to apply it,
   because a source never sees it.

     PhotoInventory.collect([
       { each: function (emit) { photos.forEach(function (p, i) {
            emit(p, { type:'record', cat:'records', badge:'Site', ... }); }); } }
     ], { includeDeleted:false, includeBackups:false, src: fn })

   `src` is the host's own thumbnail resolver, applied uniformly so every entry
   arrives the same shape whichever corner it came from.

   HOST CONTRACT: classic <script>, publishes window.PhotoInventory.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* THE VISIBILITY RULE. Exported on its own as well, because the callers that
   need to ask about ONE photo must get the same answer as the walk — two
   places deciding "is this visible" is how a gallery and a trash disagree
   about the same photograph. */
function isVisible(p, opts) {
  var includeDeleted = !!(opts && opts.includeDeleted);
  var includeBackups = !!(opts && opts.includeBackups);
  if (includeDeleted) return !!p;
  if (!p || p.deleted) return false;
  if (p._isOrigBackup) return includeBackups;
  return true;
}

/* Walk the declared sources in the order given. Every entry is shaped the same
   way and carries the photo it came from, so a caller can act on the record
   without going back to find where it lived. */
function collect(sources, opts) {
  opts = opts || {};
  var all = [];
  var srcFn = (typeof opts.src === 'function') ? opts.src : null;

  function emit(p, meta) {
    if (!isVisible(p, opts)) return false;
    var entry = { photo: p };
    if (meta) {
      for (var k in meta) {
        if (Object.prototype.hasOwnProperty.call(meta, k)) entry[k] = meta[k];
      }
    }
    if (srcFn && entry.src === undefined) entry.src = srcFn(p);
    all.push(entry);
    return true;
  }

  (sources || []).forEach(function (s) {
    if (!s || typeof s.each !== 'function') return;
    /* A source that throws must not take the whole gallery with it. An empty
       corner is a visible absence; a blank screen is not. */
    try { s.each(emit); }
    catch (e) {
      try { console.warn('[PhotoInventory] source failed, skipped:', (s.name || '?'), e); } catch (_) {}
    }
  });
  return all;
}

var api = {
  collect: collect,
  isVisible: isVisible,
  VERSION: '1.0.0'
};

if (root) root.PhotoInventory = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
