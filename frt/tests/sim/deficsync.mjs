/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — DEFICIENCY SYNC (S608, Lane A) — ⛔ BLOCKED, DELIBERATELY
   frt/tests/sim/deficsync.mjs          run: node frt/tests/sim/deficsync.mjs

   WHY THIS FILE IS A STUB AND NOT A TEST
   The Lane A punch list (04 Aug) blocks this item explicitly: Lane C has an
   open investigation into deficiency propagation, and nothing may be built
   on _tryPartialSave behaviour — nor may FRT's deficiency dirtiness rules be
   changed — until that investigation closes. Writing the failing test now
   would mean committing to expected behaviour in exactly the area whose
   behaviour is under forensic question. A test written against a moving
   target proves nothing and can contaminate the forensics.

   WHAT THIS FILE WILL ASSERT ONCE UNBLOCKED
     1. Typed fields on FRT deficiency + observation entries (the S605
        treatment): dirtiness judged only on what a person can type —
        description text, status, priority, trade, recommendation flags,
        delete markers — never on derived rollups or render bookkeeping.
     2. Live replay: a status change on tablet A and a new observation on
        tablet B, same deficiency, both survive one sync cycle.
     3. Change-scoped saves (_tryPartialSave) never send a deficiency
        section the pinned ancestor shows unchanged.

   GATE: unblock only when Lane C's handoff states the deficiency-propagation
   investigation is CLOSED, and verify that claim against live HEAD — never
   against this comment.
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n⛔ DEFICSYNC: BLOCKED — Lane C deficiency-propagation investigation is open.');
console.log('   No assertions run. This is recorded scope, not a passing test.');
console.log('   Unblock criteria are in the header of this file.\n');
process.exit(0);
