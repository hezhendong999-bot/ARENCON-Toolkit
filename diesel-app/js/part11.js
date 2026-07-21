
/* ══ CLOUDSYNC (S492 module, landed S496 Phase 2): the inline last-write-wins
   IIFE that lived here has been REMOVED. window.CloudSync is now published by
   diesel-sync.js (loaded as a module in <head>) — the SAME public API the ~40
   inline call sites already use, backed by the shared merge-based engine
   (lib/data/sync.js + lib/data/merge.js) with If-Match optimistic concurrency
   and a conflict dialog.

   WHY THIS CHANGED (Mark's decision, S491): the old PATCH carried no
   precondition, so two people in one report meant the second save silently
   erased the first — no error, no warning. Every push now carries If-Match on
   the last-seen cloud timestamp. If someone else saved first, PostgREST
   answers 412, and a 3-way merge runs against the last-seen snapshot:
   non-overlapping edits merge silently; true same-field conflicts raise ONE
   dialog where the inspector chooses per field. Bounded to 3 retries; on
   abandonment the save stays pending and retries on the next save or
   reconnect — never lost, never silently overwritten.

   WHAT DID NOT MOVE (deliberate, per-tool personality):
     · _collectCloudState keeps the S393 _keepD photo rule — diesel-sync's
       serializePush is CLONE-ONLY and must never apply FRT's stripBinaries
       walk (different photo model; Diesel's byte field is `.d`).
     · ADB / ARENCON_DIESEL, R2Photos and R2Outbox are untouched.
     · _mergeCloudLocal remains the protective layer on every silent cloud
       apply (S25 empty-cloud guard + S335 photo union + S488 real-local canon).
   See the diesel-sync.js header for the full contract. ══ */
