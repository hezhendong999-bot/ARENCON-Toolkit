# ARENCON DATA INTEGRITY DOCTRINE — S524 (PERMANENT CANON, ALL LANES)

**Status: LOCKED. This document is PK-level canon for every lane (FRT, Diesel/Electric, Platform/Hub, Shared Engine) and every future tool. It is layered into each lane's PK and survives every handoff. No session may violate an invariant below without Mark's explicit written say-so in that session. Read it whenever touching save, load, sync, merge, boot, photo, or delete paths.**

## Origin (why this exists)
July 28, 2026 — project 7155.40. Three inspectors, three separate diesel reports. A crash-relaunched app boot-pushed stale local state over the cloud (destroying photos + checklist), the gutted cloud was then pulled down over a device's local work (destroying hours of flow entries on screen), and silent save failure (10.8MB payloads over hotspot) swallowed the entire afternoon's entries, unrecoverable. Photos survived everything because the photo pipeline is append-only with a durable, crash-surviving delivery queue. The report record had neither property. Same wipe signature previously hit 1490.04. Root cause: the sync layer used the naive whole-document, last-write-wins model — the canonical textbook failure — long after usage became multi-device and multi-inspector.

## THE INVARIANTS (non-negotiable, both directions, every tool)

**I-1. The sync engine may never destroy content, in either direction.** Not on push, not on pull, not on merge, not on boot, not on conflict. Ever.

**I-2. Absence never deletes (tombstones) — but an EXPLICIT deletion must ALWAYS succeed.** A copy that merely LACKS an item (photo, pin, reading, answer, deficiency, drawing) is stale or partial — never an instruction to delete. Deletion happens only via an explicit tombstone record (what, when, by whom). The toolkit already does this for photos; it is mandatory for every content type. Any new hard-delete ships with tombstone treatment or it does not ship.

**The converse is equally binding.** Guards exist to stop the MACHINE destroying work nobody asked it to destroy. They NEVER exist to second-guess a person. If an inspector deletes another inspector's pin, photo, or reading, that deletion must land, propagate, and stick — on both devices and in the cloud — even if it empties the report. Rules:
- Guards distinguish **explicit deletion** (tombstone / deleted flag / recorded user action with attribution) from **absence** (a copy that simply lacks content). **Only absence is ever refused.** When deletion records are present, every guard stands aside — including a delete-all.
- Never gate a delete on the other device being online, agreeing, or acknowledging.
- Never resurrect a tombstoned item because a stale copy still contains it.
- **If a guard ever makes an inspector fight the software to delete something, that guard is broken.** Fix the guard; do not tell the user to work around it.
- Server-side consequence: the wipe guard's collapse thresholds WILL refuse a legitimate delete-all on a small report (e.g. 3 deficiencies → 0). The app must set `_intentionalClear` when the user has explicitly confirmed through the normal confirmation modal, so the server stands aside. This is required work, not optional — an inspector hitting "save refused" on a legitimate deletion is how people stop trusting the tool.

**I-3. Edits are per-item, newest-wins, and REPLACE.** Every reading, photo entry, pin, answer, and field carries its own last-touched timestamp. Merges reconcile item by item: a newer edit to a field fully replaces the older value (filling blanks only is NOT compliance). Whole-document timestamps and whole-document replacement are forbidden as a merge strategy. Device clocks are sanity-checked against server time; an implausible clock cannot outrank real work.

**I-4. Boot discipline: no save before baseline.** On open/relaunch, a report is read-only until a clean cloud pull establishes baseline. No pull → no save, and the UI says so. A freshly booted context can never speak first.

**I-5. Local changes are durable the instant they are made, and delivery is guaranteed.** Every entry persists to device storage immediately and enters a crash-surviving outbox that retries until the cloud confirms receipt — the same architecture as the photo queue (which is the proven benchmark: it delivered 220/220 photos through two crashes on 7155.40).

**I-6. Sync failure must be LOUD.** Escalating indicator when the last confirmed cloud save ages (amber ~5 min, unmissable red banner ~15 min). An inspector must never again work minutes — let alone 110 of them — into a void without knowing.

**I-7. Photos and other binaries never ride inside the report save payload.** Binaries travel their own pipeline (R2 outbox); the record carries references. Oversized record payloads caused the crashes and the silent-save cliff.

**I-8. Server-side backstops stand regardless of client behavior.** The tool_data wipe guard (blocks content-collapsing saves; SQLSTATE PT409; bypass only via explicit `_intentionalClear`) and the shrink-always-snapshots history rule are permanent. Clients must handle PT409 visibly. Any schema change re-verifies the guard's counters. Intentional reset/clear flows must set `_intentionalClear` after explicit user confirmation.

**I-9. Separate records per person remain the default; SAME-REPORT CO-EDITING IS APPROVED AS A SUPPORTED MODE (Mark, S524).** Separate rows are structurally isolated and cannot cross-write — that is what saved two of three reports on 7155.40, and it remains the default for independent work. **But two inspectors working in ONE report is a real field need and must be supported, not forbidden.** Mark's direction, verbatim in intent: they are going to do it anyway, so make it work.
- FRT's three-way merge already unions by id and recurses project → contractors → deficiencies → observations → photos, with tombstoned deletes and edit-vs-delete raised as a conflict. Two inspectors adding their own pins to one report is the case it was built for. Verified by reading the implementation (32 self-tests incl. nested-deficiency and photo-tombstone cases).
- **Correction to a claim that circulated in S524:** `_guardEmptyArrays` IS applied to the merge result on the silentMerge path. Only `_guardArrayShrinkage` is excluded, deliberately — merge3 has already reconciled adds and deletes, so a subset check would fight legitimate deletions. "The merge output is unguarded" is false; verify in code before building on either claim.
- **Genuine remaining gaps before co-editing is fully trusted:** (a) nested content (pins/deficiencies inside contractors) is unguarded by anything — a stale copy keeping all contractors while emptying every deficiency inside them reads as "no shrinkage" and passes; (b) two FRT devices have never been run against each other. The nested guard must be built **generically — counting content at every depth, not enumerating containers** — so every tool inherits it rather than each lane rediscovering the hole (the Diesel-only collapse guard is the cautionary example).
- Acceptance: two-device test with Mark present (both open one report, both drop pins, one goes airplane-mode and returns, one sits stale and wakes). On pass, activate per-item LWW for that tool.
- Field rule while unverified: co-editing is permitted; if either device's sync indicator stops advancing, that person stops entering data immediately.

**I-10. Attribution is mandatory.** Every write path sets updated_by and the true build stamp. Build stamps bump on every push (a frozen stamp cost days of forensics). A write that cannot be attributed is a defect.

**I-11. A database change is not done until a real save has been performed as an ordinary user.** Reading the SQL and confirming "migration succeeded" is NOT verification — a migration reports success while the resulting behavior is broken for clients. Before any session claims a database change is complete it must, in the same session: (a) `set local role authenticated` and perform BOTH a growing save and a shrinking save against a real row, (b) confirm client grants are unchanged, (c) re-run the wipe-guard block test, since fixes touch the same trigger family. Additional standing rules for database work:
- **`create or replace function` silently drops unspecified attributes.** SECURITY DEFINER, search_path, volatility, and cost all revert to defaults unless restated. ALWAYS restate them.
- **Any table read inside a trigger must sit inside the exception block.** A trigger's bookkeeping must never be able to abort the user's write. If a read can raise (permissions, missing table, lock), it aborts the whole UPDATE.
- **Triggers run as the CALLER unless SECURITY DEFINER.** A trigger touching a table clients cannot access must be SECURITY DEFINER with a pinned `search_path`.
- **One owner for production DDL.** Never two lanes applying schema changes concurrently; the lane that diagnosed it owns the fix.

**COST OF LEARNING I-11 (S524, same night as the incident):** migration `tool_data_history_shrink_always_snapshots_s524` replaced `snapshot_tool_data()` without restating SECURITY DEFINER and placed its throttle read of `tool_data_history` outside the exception block. `authenticated` has zero grants there, so every UPDATE aborted with 42501 → client 403. **All saves firm-wide were refused for ~4 hours (two successful saves company-wide).** Polarity made it worse: the read is skipped when a payload shrinks >10%, so wipes still committed while legitimate growing saves were refused — the anti-wipe hardening became the only path a wipe could take. Fixed in `fix_snapshot_tool_data_blocking_all_saves_s524b` (SECURITY DEFINER + `search_path=public`, read moved inside the exception block). The SQL was not subtle; the failure was applying code-verification discipline to code and not to the database.

## ARCHITECTURE DECISION (S524, Mark-approved direction)
Standard sync patterns (tombstones, per-item LWW, boot discipline, durable outbox) are HAND-IMPLEMENTED on the existing stack (Supabase + device storage + R2 + shared /lib/). No third-party sync-engine migration at current scale. Rationale: data reshaping is required under either path; an engine adds a permanent service dependency and a 10-tool migration while removing the full-stack debuggability that made the 7155.40 forensics and same-day server guard possible. Revisit ONLY if true simultaneous co-editing of one record becomes a requirement.

## BUILD ORDER (Lane C leads; Lane A mirrors; Shared Engine owns the final common implementation)
1. **Phase 1 (next session, closes the 7155.40 failure class outright):** Boot discipline (I-4) + tombstone/absence rule on the pull path (I-2). No data reshaping needed.
2. **Phase 2:** Per-item timestamps + newest-wins-replace merge (I-3), with migration of existing reports.
3. **Phase 3:** Durable entry outbox + loud staleness alarm (I-5, I-6), photos out of payload (I-7).
Acceptance gate for every phase: two-device torture test with Mark present — crash it, relaunch it, feed it stale pulls, prove nothing dies. Demo-first for any UI surface.

## SHIPPED STATUS (as of S524 close — verify against live HEAD before trusting)
- **Server:** wipe guard v2 live on `tool_data` (blocks content-collapsing saves, SQLSTATE PT409, bypass only via `_intentionalClear`); `snapshot_tool_data` archives unconditionally on >10% shrink, SECURITY DEFINER + `search_path=public` after s524b. Verified as role `authenticated`: growing save commits, wipe replay still blocked, client grants on `tool_data_history` remain zero.
- **Shared engine `lib/data/sync.js`** (HEAD `211bc99`): content-collapse guard (I-2), guarded-field coverage extended to Diesel arrays, push refused without cloud baseline token (I-4), per-item LWW stamp+merge (I-3), PT409 loud handling (I-8), escalating staleness banner + background retry loop (I-5/I-6).
- **`diesel-sync.js`:** the 110-minute silent-retry bug fixed — cloud push now gated on `_lastPushedJson` (advances only on confirmed push) instead of `_lastSavedJson` (was set before the push, so a failed push was never retried).
- **FRT inherits everything except the per-item merge**, which is armed but dormant (`_LWW_SPECS.frt` unset) pending the two-device acceptance test. FRT's sync file is a genuine shim importing lib — verified, not a copy. FRT injects its OWN merge/worker chain, so lib's merge modules are NOT in FRT's graph.
- **NOT yet done:** two-device acceptance test (gates FRT merge activation), photos out of the save payload (I-7), 3pt/7pt clarity design, review-numbering model, placard-scan false "overwrite someone else's work" modal, Hub blindness to Diesel photos (Lane B).

## VERIFICATION CULTURE (learned at cost on 7155.40)
- Byte sizes and compressed sizes are not content; verify loss/survival by COUNTING CONTENT (photos, readings, answers, pins), never by payload size.
- A build stamp is only evidence if it is actually bumped; verify the constant before trusting the gauge.
- Field recollection is evidence; when data and a professional's account conflict, re-examine the data's interpretation before doubting the person. (The "25% row" was correct; the analysis wasn't.)
- History snapshots store pre-images; reason about write timing accordingly, and remember snapshot inserts can silently fail — absence of a snapshot is weak evidence of absence of a write.
- **The Contents API can serve a stale copy.** During S524 a good push appeared to have failed because the Contents API returned pre-push content. The Trees API blob SHA plus a direct `/git/blobs/{sha}` content fetch is the authoritative post-verify. Never conclude a push failed from the Contents API alone, and never conclude it succeeded from CDN.
- **"Shared engine" claims must be verified by reading the import chain**, not by file naming. FRT's `frt/js/data/sync.js` really is a shim importing `lib/data/sync.js` (verified S524), but `frt-next/js/data/sync.js` is a separate 45KB copy. Check which file the live page actually loads before believing a change propagates.
- **A shared-engine change alters other lanes' tools without those lanes touching their code.** When one lane ships to `lib/`, it must tell the other lanes what behavior changed, so a surprise in FRT is not misdiagnosed as FRT's own bug.
- **Test the way a person uses it.** In-memory and service-role tests do not exercise permissions, triggers, or RLS. Any claim about "it saves" requires a save through the ordinary user path (see I-11).
