# ARENCON FRT — Bug Log + Roadmap (updated end-of-S155)

**Filed:** 2026-05-20, end of Session 155 (3 code commits + docs).
HEAD `6967e1e17e44a4d51b3552662697ea5a745e9c32`, SW v476, CSS v354 unchanged.
Supersedes `BUG_LOG_AND_ROADMAP_S154.md`.

---

# BUGS — STATUS AT S155 CLOSE

| # | Symptom | Status | Commit |
|---|---------|--------|--------|
| #1 | Stale toast/empty-state referencing removed ⊕ | **SHIPPED S154** | `75125ddd` |
| #2 | Inspector initials chip silently hides | **SHIPPED S154** | `75125ddd` |
| #3 | Auto-signout never fires for no-PIN users | **SHIPPED S154** | `7c16c7da` |
| #4 | Closed pin / "Outstanding" pill mismatch in PDF | **SHIPPED S154** | `d0a21f83` |
| #5 | Multi-obs lane move cascades whole pin | **STILL OPEN — top of S156 queue** | — |
| #6 (new) | Closed Items Summary listing recommendation rows | **SHIPPED S155** | `6967e1e1` |

Bug #5 plan unchanged. See `S154_CHECKLIST.md` Step 5.

---

## BUG #5 (still open) — Linked observations move together to Site Records

### Status

**Validated, planned, not shipped through S155.** Top of the code queue
for S156. S153 diagnostics + S154 design pass confirmed: `contractorId`
is pin-level, so any lane-move on one obs of a multi-obs pin moves the
whole pin. By design, but Mark wants the override.

### Fix path (Mark's call — path C: proper fix)

When `_bvApplyMove(id, oi, toLane, toPri)` runs and:
- the pin has 2+ observations, AND
- the move crosses a lane boundary (current class ≠ target class)

…show a 3-button dialog:
- **"Just this obs"** → `Model.splitObservationToPin(id, oi)`, then
  apply move to the new pin's single obs.
- **"Whole pin (N obs)"** → apply move to original pin (current
  behaviour).
- **"Cancel"** → no change.

Priority-only moves within the same lane skip the prompt (priority is
already per-obs).

Open questions at S156 start:
1. Does the shipped `showDialog` helper support 3 buttons? If not, fall
   back to two passes of `showConfirm` — works but uglier.
2. Confirm `splitObservationToPin` returns the new defic ID (per
   `model.js:903` it does).

Same commit should also add the "still has rec-flagged obs" toast hint
to the DEFIC-lane branch of `_bvApplyMoveInner`.

---

# AUTH OVERHAUL — CLOSED OUT AT S155

All three open S155 spec-doc questions resolved by Mark on wake:

| Q | Decision | Effect |
|---|----------|--------|
| Recovery email | **A** — Reset-via-login-email | Already shipped. Zero new work. |
| Admin password reset backend | **Defer** — Supabase dashboard | Revisit when inspector count climbs. |
| Account sharing prevention | **Skip** — Idle-based PIN+sign-out lock is enough | No enforcement code. |

**Net new auth code work outstanding: zero at current scale.**

### What's already shipped (do not duplicate)

| Piece | Status |
|---|---|
| Mandatory PIN gate (forced setup on first sign-in if `!_pinHash`) | ✅ Shipped S154 (`5a5635c2`) |
| Self-serve password reset (`resetPasswordForEmail` + Forgot UI) | ✅ Shipped (existed before S154) |
| Idle-based session locks (4h PIN-lock / 8h sign-out, both reset on activity) | ✅ Shipped (constants in Hub ~pos 286310) |
| Password plaintext protection | ✅ Already safe (Supabase bcrypt) |

**Constraint that stays canon:** `service_role` key, R2 admin key, and
any Supabase admin API MUST NEVER appear in frontend code. All admin
operations route through a backend proxy when they're built (Edge
Function preferred, Cloudflare Worker acceptable).

---

# SYNC OPTIMIZATION — SHIPPED (S155 commit `800b996e`)

**Commit `800b996e`** (SW v474 → v475). One commit, scope-minimal per
Mark's spec.

**What shipped:**
- `_pushDirty` module-scope flag in `frt/js/app.js`. Skip-if-unchanged
  push gate. Cleared optimistically; restored on failure/offline. Set
  once on session start as a tab-killed-mid-debounce safety push.
- `document.hidden` early-return in `_pushToCloud` and
  `_checkRemoteForChanges`. Pauses push and pull when tab is hidden.
  Presence heartbeat NOT paused per Mark.

**What deliberately stayed:** push 15s, pull 30s, presence 30s,
debounced 5s saved-event setTimeout, `SyncEngine.push` internals.

**Expected impact (with Mark's Micro compute upgrade now active):**
idle foreground 10 → 7 req/min (30% cut). Idle background 10 → 4
req/min (60% cut). Active editing unchanged.

See PK delta §1 for the full lifecycle table.

---

# CLOSED ITEMS SUMMARY FIX — SHIPPED (S155 commit `6967e1e1`)

**Commit `6967e1e1`** (SW v475 → v476). One-line filter addition in
`pdf.js` `closedSummaryDefs` to exclude `isRecommendation` entries.
Recs already render in a dedicated "Previously Closed Recommendations"
section — they were appearing in BOTH tables before this fix.

Bug #6 in the table above. Closes the pre-presentation polish item Mark
flagged for Shaun Kelly sign-off.

---

# CONTRACTOR-CARD CLICK EXTENSION — INVESTIGATED, DEFERRED (S155)

The S154 queue listed "extend Board-view contractor-card-click
reassign to Detailed + Table views." Investigated this session.
**Deferred with rationale**: the Detailed view's `defic-pin-group`
cards are dense edit surfaces (priority select, contractor select,
trade select, textareas, photo zones, activity buttons). Extending
"tap card to select" requires UX disambiguation of "tap-to-select" vs
"tap-on-inline-control" — and getting it wrong creates silent
data-corruption fat-finger hazards (wrong pin gets reassigned on
next contractor tap).

**S156 quick decision owed:**
- Option A: tap-to-select fires only from a specific safe area of each
  pin group (e.g., the pin badge / drawing-pill region)
- Option B: add a dedicated "select-this-pin" tap target (small button
  or chevron) to each pin group
- Option C: don't extend — Detailed view's existing inline contractor
  `<select>` dropdown is already a working reassign UX (my
  recommendation)

No code shipped on this item.

---

# TIER / PHASE ROADMAP (post-S155)

## Track 1 — Board Rework (current, FRT)

**SHIPPED through S154/S155:** §1, §2.1, §2.2, §2.3, B1, B2, B2.1, B3,
pin colour overhaul, pill prominence, pill darkening, Site Records
pill, sync optimizations (S155), Closed Items Summary rec-exclusion
(S155).

**Remaining:**
- **§2.4** — sticky lane banners + Hide-Closed compactor + slim sticky
  jump-nav. Biggest remaining batch — own session.
- **Split-pin `⛓ #N` badge + new On/Off control.** Default ON. Bundles
  with Bug #5 in S156 (same board card surface).
- **§3** — full pin-focused card redesign. Own demo → approve → build
  cycle.
- **Contractor-card click in Detailed + Table views** — pending Mark's
  Option A/B/C decision.

## Track 2 — New Tools Pipeline

Unchanged from S153/S154. NOT STARTED: IT&M Checklists (Sprinkler,
Diesel Pump, Electric Pump), Travel Distance / Exit Capacity, Occupant
Load, FRR Quick Reference, Proposal Template Generator. PARKED:
Firefighting Water Supply Calc (waiting on Mark's template).

## Track 3 — Training Center / LMS (Tiers 1–6)

Unchanged. **Tier 1 (Cloud Infrastructure) next.** Concurrent writer
on `main` continues to ship Training-Center commits during FRT
sessions.

## Track 4 — FRT Full Rewrite (Phases 0–9)

Unchanged. Board Rework lives inside Phase 3.

## Track 5 — Strategic / Infrastructure

**Auth overhaul closed out for current scale.** Resume the sequence
when inspector count or password-incident frequency climbs:

1. Admin reset Edge Function (when needed) — own session.
2. RLS rollout → production cutover → ARENCON ownership transfer →
   Microsoft SSO/M365 → scaled rollout.

Non-code items unchanged from S154:
1. Confirm M365 deployment timeline with ARENCON IT.
2. Designate company-side technical contact for ownership transfer.
3. Decide public domain (`tools.arencon.com`? `frt.arencon.com`?).
4. Plan inspector bookmark/URL transition.

---

# PRE-PRESENTATION CARRY (Shaun Kelly sign-off items)

Updated end of S155:

- ✅ **Closed Items Summary still listing recommendation rows** —
  SHIPPED S155 (commit `6967e1e1`).
- ✅ **Appendix status-cell forbidden hex colour cleanup** — verified
  already done in S154 (commit `46c6c44c`); S154 handoff mistakenly
  carried this as open. Closed at S155.
- ⏳ PDF title-page legend (Phase 3 C — likely moot under Model 2)
- ⏳ Recommendations-only report summary-table decision
- ⏳ **Highest-leverage non-code item:** refresh
  `FRT_REWRITE_BUSINESS_CASE.md` from future-tense to a
  delivered-vs-promised one-pager against April commitments

---

# RECOMMENDED S156 ORDER

1. **Bug #5 proper fix** — multi-obs lane move dispatcher. Full plan
   ready in `S154_CHECKLIST.md` Step 5. Top of code queue.
2. **Split-pin badge + On/Off control** — bundles cleanly with Bug #5
   (same surface).
3. **Appendix A: Drawings consolidated** — Mark approved Option 1 in
   S154; ready to build.
4. **Contractor-card click — Mark's Option A/B/C decision**, then
   build only if A or B.
5. **Board Rework §2.4** — own session.

Everything beyond (Training Center Tier 1, new calc tools, FRT Full
Rewrite phases, Strategic infra) — its own dedicated session.

---

# CARRY-FORWARD (do NOT forget)

- Concurrent writer on `main` — re-assert HEAD via API every push;
  baseline-diff each target file against the moved HEAD. S155 verified
  this happens reliably (3 pushes, all attempt-1 success).
- **Compute tier upgraded Nano → Micro by Mark this session.** Sync
  optimization + Micro compute together resolve the S154 Disk IO
  Budget concern at current scale.
- Dead PAT in project instructions — **ask Mark for a fresh one each
  session**. S155 PAT remained valid throughout.
- Canon pass (fold S150 → S155 into full PK + Style Guide) ONLY when
  Mark says **"give me the canon pass."**
- Memory #7: keep pushing back with honest engineering judgment. S155
  examples:
  - flagged that self-serve password reset was already shipped rather
    than rebuilding it
  - recommended deferring admin reset Edge Function until needed
  - investigated contractor-card click and recommended deferring or
    adopting Option C rather than shipping a fat-finger-risk pattern
- Trust rule (absolute): never claim work done that isn't.
- Confirm S151 nav-fix round-trip on-device (still open).
- One judgment call open from S154: `_showInspChip` default after
  §2.3 — see S154 handoff.
