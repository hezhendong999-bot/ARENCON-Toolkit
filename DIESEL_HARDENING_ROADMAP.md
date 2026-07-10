# ARENCON Diesel Tool — Hardening Roadmap

**Created:** July 2026
**Trigger:** Field data loss — staff (Nasim, Thomas, Franz) lost fire-pump photos on
project 7155.51, seconds after capture, single device each, intermittent ("some vanished,
some stayed").
**Source:** Two Grok reviews (general data-loss + photo-loss) cross-checked against live
Diesel code (`ARENCON_Diesel_Fire_Pump_Commissioning.html`, ~19,700 lines). Every claim
below was verified against the actual source before inclusion. Where Grok was wrong or
over-stated, it's noted and NOT actioned.

**Execution rule:** One item at a time. Every item touches the data path, so every item is
**field-verify gated** — Mark on-device with a throwaway project before it's trusted on real
work. No bundling multiple data-path changes into one push.

---

## What the evidence actually says (corrected diagnosis)

The reported loss was **single-device, intermittent, seconds after capture.** That RULES OUT
Grok's headline cause:

- **Multi-device last-write-wins clobber (Grok's P0-A "the field killer"):** NOT the cause
  here. Each inspector was alone on their own report. LWW is still a real latent bug worth
  fixing (two tabs, or reconnect-after-offline), but it did not cause the photo loss Mark saw.

The single-device intermittent pattern points at, in order of likelihood:

1. **Phantom soft-delete (P0-C)** — something programmatically deletes a fresh photo seconds
   after capture. **The code already detects this** (`_markPhotoDeleted` logs a `PHANTOM
   DELETE` when a photo is deleted <10s after creation) **but does NOT block it** — it logs,
   then deletes anyway. This is the leading suspect.
2. **R2 early-strip (P0-B)** — LARGELY ALREADY GUARDED. Verified: new photos start
   `r2Status:'pending'`; a durable IDB outbox persists the blob before upload; the strip only
   fires after a **GET-verified** upload (reconcile sweep, line ~13513, "never demotes").
   Grok over-stated this risk by reading `_keepD` in isolation without tracing the upload path.
   Residual risk is small but non-zero (see P2 below).

We could not pull the tablets' Photo Delete Log (staff used personal devices), so we proceed
on the strongest theory and, critically, the P0-1 fix ALSO turns every future incident into
captured evidence.

---

## Priority 0 — Stop the photo loss (do these first, in order)

### P0-1 — Block phantom deletes of fresh photos  ⭐ FIRST
**Risk: very low. Value: very high. Do this first.**

**What's wrong:** `_markPhotoDeleted(ph)` detects a delete within 10s of capture, logs a
"PHANTOM DELETE" console error + toast — then proceeds to soft-delete the photo anyway
(`ph.delState='deleted'`). The alarm fires; the crime still happens.

**The fix:** Make `_markPhotoDeleted` **refuse** to delete a photo younger than 10s unless the
call is an explicit user action (a real Delete-button tap passing `opts.force===true`).
Programmatic/phantom callers don't pass force, so they get blocked. Keep the existing log
entry so we still capture the caller stack — now as a "BLOCKED phantom" record.

**Why first:**
- Directly stops the most likely cause of what Mark saw.
- Near-zero risk: it only *prevents* a delete that shouldn't happen; it can't cause loss.
- The caller-stack logging means the next time it fires in the field, the log names the exact
  code path that was trying to delete — turning theory into proof for any remaining paths.
- Every real user-delete button must be audited to pass `force:true` (small, mechanical).

**Field-verify:** Take a photo, confirm it stays. Tap the real Delete button, confirm it still
deletes normally. Check the Delete Log shows blocked-phantom entries if any fire.

---

### P0-2 — Harden `_keepD`: never strip `d` until R2 is truly proven
**Risk: low. Value: high.**

**What's wrong (residual):** `_keepD` strips the base64 `d` from the cloud copy as soon as
`r2Status==='uploaded'`. The reconcile sweep only sets 'uploaded' after a verified GET (good),
BUT there are two other set-sites (lines ~14164, ~15329) and the in-memory fallback
(`onComplete: err?'failed':'uploaded'`) that mark uploaded on PUT success without a
GET-verify. If any of those marks uploaded and the object isn't actually GET-able (CDN lag,
orphan purge, wrong key), the next save strips `d` → dead reference → blank tile.

**The fix:** Tighten the strip guard so `d` is only dropped when the photo is BOTH
`r2Status==='uploaded'` AND has a real `r2Url`/`r2Key`. Optionally keep `d` until the photo
has been successfully displayed from `r2Url` at least once. Make the in-memory fallback path
mark `'pending'` (let the GET-verify reconcile promote it) rather than optimistic `'uploaded'`.

**Field-verify:** Capture on throttled/flaky network, confirm photo survives a reload before
and after R2 confirms; confirm no blank tiles.

---

## Priority 1 — Stop the latent data-loss bugs (real, but not what caused 7155.51)

### P1-1 — Optimistic concurrency on `_cloudSave` (reject stale saves)
**Risk: MEDIUM (biggest structural change). Value: high (fixes ALL multi-tab/reconnect loss).**

**What's wrong:** Verified — `_cloudSave` PATCHes the whole `tool_data` row with a client-clock
`updated_at`, no `If-Match`, no version check. A second tab, or a reconnect-after-offline push,
can overwrite newer cloud data with older local data. This is the general last-write-wins hole.

**The fix (Grok's design is sound here):**
- Track `_lastSeenUpdatedAt` from every successful load/save/heartbeat.
- PATCH with an optimistic filter: `...&updated_at=eq.<lastSeen>`. If 0 rows come back →
  someone else wrote → CONFLICT.
- On CONFLICT: reload fresh cloud → `_mergeCloudLocal(cloud, local)` → retry save once (cap 2).
- Stop sending client `updated_at` in the PATCH body; let the DB default own it (fixes clock
  skew that also affects the self-trigger window).

**Why not first:** It's the highest-risk change (touches the core save path for the whole
tool), and it did NOT cause the photo loss Mark reported. Fix the photo bleeding first, then
do this carefully with full field-verify.

**Field-verify:** Two tabs on one throwaway project; edit in both; confirm the stale save is
rejected and re-merged rather than clobbering. Offline-edit-reconnect test.

---

### P1-2 — Merge by stable id, never by array index
**Risk: low-medium. Value: medium.**

**What's wrong:** Verified (line ~15949) — flow-test tables `stdData`/`pldData` union row
photos by array index (`la[i]`), not by stable row id. The code even has a comment admitting
"index pairing copied one photo's binary/markup onto another." If rows differ in count/order
between local and cloud, photos attach to the wrong row or get skipped.

**The fix:** Give flow-test rows stable ids (if not already present) and match by id in the
merge union, completing the S353 id-matching migration that was done for other photo arrays
but not these two tables.

**Field-verify:** Reorder/add flow rows on one session, sync, confirm photos stay on their
correct rows.

---

## Priority 2 — Defensive hardening (lower likelihood, good hygiene)

### P2-1 — Durable-save-on-capture tightening
Verified: `_flushAutosave` is already wired to `visibilitychange(hidden)` + `pagehide`, so
app-switch/background DOES flush to IDB. Grok over-stated this risk. Residual gap: the photo
lives only in RAM for up to the debounce window (~4s IDB) before first persist. Optional
improvement: on every successful capture, do an immediate (micro-debounced ~150ms) `saveState()`
so a hard kill in the first seconds can't lose the only copy. Low urgency given the existing
hide-flush.

### P2-2 — Diesel photo self-test (adapted, NOT Grok's FRT agent verbatim)
A small super-admin diagnostic that walks the live Diesel state and asserts:
- Every live photo has an id.
- No photo with `r2Status:'uploaded'` + empty `d` + a failing `r2Url` (orphan fingerprint).
- No photo with age <10s AND `deleted` (phantom fingerprint).
- Outbox entries have matching photo ids.
- The merge/strip path covers every photo array (single inventory of keys).

NOTE: Grok's Self-Test code is written for FRT's `Model`/`SyncEngine` API, which Diesel does
NOT have (Diesel is single-file with `collectState()`/`CloudSync`). It must be REWRITTEN for
Diesel's structure, not copy-pasted. Read-only first; no auto-fix on a data path.

---

## Explicitly NOT doing (Grok findings rejected or de-scoped)

- **Multi-device LWW as the cause of 7155.51 photo loss** — ruled out; each inspector was
  alone. (The LWW *fix* is still worth doing as P1-1, just not as "the" cause.)
- **Porting FRT's full SyncEngine into Diesel** — Grok correctly says don't; we agree. Diesel
  gets the optimistic-lock *idea*, not FRT's machinery.
- **Grok's Self-Test agent copy-pasted into Diesel** — wrong API surface; would no-op. Rewrite
  required (P2-2).
- **Reducing heartbeat to 30-60s** — deferred; harmless but not a fix, do only after P1-1.
- **`_keepD` "always keep d forever"** — rejected; that bloats the cloud row (base64 in every
  save). The correct fix is verify-before-strip (P0-2), not never-strip.

---

## Execution order (agreed)

1. **P0-1 — Block phantom deletes** ← START HERE (lowest risk, likely cause, self-instrumenting)
2. P0-2 — Harden `_keepD` verify-before-strip
3. P1-1 — Optimistic concurrency on save (biggest, most careful field-verify)
4. P1-2 — Merge by id not index
5. P2-1 — Durable-save-on-capture
6. P2-2 — Diesel photo self-test (rewritten for Diesel)

Each item: build on a `/home/claude/` copy → `node --check` clean → Mark field-verifies on a
throwaway 7155-style project → then push. Never two data-path items in one push.
