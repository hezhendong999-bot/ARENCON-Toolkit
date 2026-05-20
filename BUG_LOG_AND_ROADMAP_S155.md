# ARENCON FRT — Bug Log + Roadmap (updated end-of-S155)

**Filed:** 2026-05-20, end of Session 155 (post-sync-optimization commit,
HEAD `800b996ecce4883235f28305f1d01bd8b6d2f6b5`, SW v475, css v354
unchanged).
Supersedes `BUG_LOG_AND_ROADMAP_S154.md`.

---

# BUGS — S153 LIST AT S155 CLOSE

| # | Symptom | Status | Commit |
|---|---------|--------|--------|
| #1 | Stale toast/empty-state referencing removed ⊕ | **SHIPPED S154** | `75125ddd` |
| #2 | Inspector initials chip silently hides | **SHIPPED S154** | `75125ddd` |
| #3 | Auto-signout never fires for no-PIN users | **SHIPPED S154** | `7c16c7da` |
| #4 | Closed pin / "Outstanding" pill mismatch in PDF | **SHIPPED S154** | `d0a21f83` |
| #5 | Multi-obs lane move cascades whole pin | **STILL OPEN — deferred to S156** | — |

Bug #5 plan unchanged. See `S154_CHECKLIST.md` Step 5.

---

## BUG #5 (still open) — Linked observations move together to Site Records

### Status

**Validated, planned, not shipped.** S153 diagnostics + S154 design pass
confirmed: `contractorId` is pin-level, so any lane-move on one obs of a
multi-obs pin moves the whole pin. By design, but Mark wants the
override.

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

# AUTH OVERHAUL — REVISED PICTURE (S155 spec deliverable)

**S155 outcome:** the S154 roadmap's six-item auth queue was based on an
outdated picture of the live Hub. Live source code at HEAD `800b996e`
shows much of the work is already done. See
`AUTH_OVERHAUL_SPEC_S155.md` for the full audit. Summary:

| # | Item | Was | Now |
|---|------|-----|-----|
| 1 | Mandatory PIN gate | "Owed S155" | ✅ Shipped S154 (`5a5635c2`) |
| 2 | Self-serve password reset | "Smallest — ship first" | ✅ **Already shipped** (`_sb.auth.resetPasswordForEmail()` + Forgot UI live in Hub) |
| 3 | Admin password reset backend | Owed | **Stub only.** Edge Function recommended when needed |
| 4 | Recovery email | "Clarify A vs B" | Decision owed (recommend A — already covered by #2) |
| 5 | No password visibility | Confirm only | ✅ Already safe |
| 6 | Account sharing prevention | "Mostly policy" | Recommend skip at current scale |

**Net actual code work outstanding for auth:** one Edge Function (admin
reset) IF Mark green-lights it. Otherwise zero. Three decisions are
owed from Mark — see spec doc.

**Constraint that stays canon:** `service_role` key, R2 admin key, and
any Supabase admin API MUST NEVER appear in frontend code. All admin
operations route through a backend proxy (Edge Function preferred,
Cloudflare Worker acceptable).

---

# SYNC OPTIMIZATION — SHIPPED (S155 commit 1)

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

**Expected impact:** idle foreground 10 → 7 req/min (30% cut). Idle
background 10 → 4 req/min (60% cut). Active editing unchanged.

See PK delta §1 for the full lifecycle table.

---

# TIER / PHASE ROADMAP (post-S155)

## Track 1 — Board Rework (current, FRT)

**SHIPPED through S154:** §1, §2.1, §2.2, §2.3, B1, B2, B2.1, B3, pin
colour overhaul, pill prominence, pill darkening, Site Records pill.

**Remaining:**
- **§2.4** — sticky lane banners + Hide-Closed compactor + slim sticky
  jump-nav. Biggest remaining batch — own session.
- **Split-pin `⛓ #N` badge + new On/Off control.** Default ON. Bundles
  with Bug #5 in S156 (same board card surface).
- **§3** — full pin-focused card redesign. Own demo → approve → build
  cycle.
- **Contractor-card click in Detailed + Table views** — extend S153 B3
  unified select→tap-target. Currently Board-only.

## Track 2 — New Tools Pipeline

Unchanged from S153/S154. NOT STARTED: IT&M Checklists (Sprinkler,
Diesel Pump, Electric Pump), Travel Distance / Exit Capacity, Occupant
Load, FRR Quick Reference, Proposal Template Generator. PARKED:
Firefighting Water Supply Calc (waiting on Mark's template).

## Track 3 — Training Center / LMS (Tiers 1–6)

Unchanged. **Tier 1 (Cloud Infrastructure) next.** Concurrent writer
on `main` continues to ship Training-Center commits (S155 observed
push from `Training 20: slice 2b — per-question tutor chat panel +
sbChat helper`). Re-parent push pattern handles cleanly.

## Track 4 — FRT Full Rewrite (Phases 0–9)

Unchanged. Board Rework lives inside Phase 3.

## Track 5 — Strategic / Infrastructure

**Auth overhaul recalibrated** — most of the work is already done. The
remaining sequence after Mark's three decisions land:

1. (If Option B chosen) Admin reset Edge Function — own session.
2. RLS rollout → production cutover → ARENCON ownership transfer →
   Microsoft SSO/M365 → scaled rollout.

Non-code items unchanged from S154:
1. Confirm M365 deployment timeline with ARENCON IT.
2. Designate company-side technical contact for ownership transfer.
3. Decide public domain (`tools.arencon.com`? `frt.arencon.com`?).
4. Plan inspector bookmark/URL transition.

---

# PRE-PRESENTATION CARRY (Shaun Kelly sign-off items)

Unchanged from pre-S155:

- Closed Items Summary still listing recommendation rows (bug)
- PDF title-page legend (Phase 3 C — likely moot under Model 2)
- Recommendations-only report summary-table decision
- Appendix status-cell forbidden hex colour cleanup (polish)
- **Highest-leverage non-code item:** refresh
  `FRT_REWRITE_BUSINESS_CASE.md` from future-tense to a
  delivered-vs-promised one-pager against April commitments

---

# RECOMMENDED S156 ORDER

1. **Mark's three auth decisions from `AUTH_OVERHAUL_SPEC_S155.md`** —
   not blocking other work; can answer in writing or hold.
2. **Bug #5 proper fix** — multi-obs lane move dispatcher. Full plan
   ready in `S154_CHECKLIST.md` Step 5.
3. **Split-pin badge + On/Off control** — bundles cleanly with Bug #5
   (same surface).
4. **Contractor-card click in Detailed + Table views** — extends S153
   B3 model.
5. **Appendix A: Drawings consolidated** — Mark approved Option 1 in
   S154; ready to build.
6. (Conditional on Mark's auth decision) **Admin reset Edge Function**.
7. **Board Rework §2.4** — own session.

Everything beyond (Training Center Tier 1, new calc tools, FRT Full
Rewrite phases, Strategic infra) — its own dedicated session.

---

# CARRY-FORWARD (do NOT forget)

- Concurrent writer on `main` — re-assert HEAD via API every push;
  baseline-diff each target file against the moved HEAD. S155 verified
  this happens reliably (1 push, attempt 1 success).
- **Compute tier upgrade Nano → Micro still owed** in Supabase
  dashboard. Sync optimizations help but Micro is the real fix for the
  Disk IO Budget ceiling. Free with Pro tier.
- Dead PAT in project instructions — **ask Mark for a fresh one each
  session**. S155 PAT logged; assume next session gets fresh.
- Canon pass (fold S150 → S155 into full PK + Style Guide) ONLY when
  Mark says **"give me the canon pass."**
- Memory #7: keep pushing back with honest engineering judgment. S155
  example: flagged that self-serve password reset was already shipped
  rather than executing the redundant work the roadmap thought was
  owed.
- Trust rule (absolute): never claim work done that isn't.
- Confirm S151 nav-fix round-trip on-device (still open).
- One judgment call open from S154: `_showInspChip` default after
  §2.3 — see S154 handoff.
