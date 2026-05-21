# ARENCON FRT — Bug Log + Roadmap (end-of-S155 final)

**Filed:** 2026-05-20 (late evening), end of Session 155.
HEAD `761985b3` plus this docs commit. SW v476, CSS v354 unchanged.
Supersedes `BUG_LOG_AND_ROADMAP_S154.md` and the earlier S155 versions.

**Tomorrow's priority above everything else: 4380.24 rescue.** Read `R2_RECOVERY_REPORT_4380_24.md` and `HANDOFF_SESSION_155.md` first.

---

# BUGS — STATUS AT S155 CLOSE

| # | Symptom | Status | Commit / Note |
|---|---------|--------|---------------|
| #1 | Stale toast/empty-state referencing removed ⊕ | SHIPPED S154 | `75125ddd` |
| #2 | Inspector initials chip silently hides | SHIPPED S154 | `75125ddd` |
| #3 | Auto-signout never fires for no-PIN users | SHIPPED S154 | `7c16c7da` |
| #4 | Closed pin / "Outstanding" pill mismatch in PDF | SHIPPED S154 | `d0a21f83` |
| #5 | Multi-obs lane move cascades whole pin | DEFERRED — touches Model state; no ship without staging | — |
| #6 | Closed Items Summary listing recommendation rows | SHIPPED S155 | `6967e1e1` |
| #7 (NEW) | Drawings disappear right after PDF upload | **OPEN — high severity. Hypothesized race in sync pull. Fix needs staging.** | — |
| #8 (NEW) | Photos sometimes don't stick despite "Photos added" toast | **OPEN — high severity. Same race as #7, different array.** | — |
| #9 (NEW) | Pins not showing on PC for drawings whose deficiencies never synced | **OPEN — root is sync absence, not coordinate bug.** Resolves with #10 fix. | — |
| #10 (NEW) | All-day silent Supabase sync failure (4380.24) | **OPEN CRITICAL. Three candidate causes. Tomorrow's rescue + diagnostic.** | — |

---

## BUG #10 (highest priority) — All-day silent Supabase sync failure

### Incident detail

Project 4380.24 Sun Pharma. Mark spent 2026-05-20 in field on hotspot. R2 received 30 photos correctly (all `defic_<uuid>.jpg`). Supabase `tool_data` row's `generalDeficiencies` field has 9 entries — all pre-today's UUIDs. Today's 30 deficiency UUIDs exist in R2 photo filenames but NOT in cloud.

Cloud row `updated_at = 2026-05-21T00:30:57 UTC` (8:30 PM ET tonight). Sync is firing — just not pushing today's deficiency records. Tablet IDB unconfirmed but ~95% likely has today's metadata.

### Candidate causes (ranked by likelihood)

1. **Silent auth-token failure on tablet.** Token expired (or refresh failed), Supabase REST → 401 silently, R2 uploads continued working (separate Cloudflare Worker, no auth required), no surfaced failure alert. Explains the asymmetry exactly.

2. **Stale PC tab overwrote.** A PC tab with older cached view of 4380.24 pushed an older snapshot over tablet's work. Mark says he was not actively on PC at 8:30 PM ET — but a stale tab open from earlier could explain.

3. **S155 `_pushDirty` latched stuck.** Optimistic-clear-at-push-start could leave the flag permanently `false`. Tomorrow's diagnostic must explicitly check.

### Fix paths (only after root cause confirmed)

- If #1: hardening of token refresh + visible failure alert when refresh fails. Don't trust silent retry.
- If #2: tab-coordination guard. Heavy work (~2 sessions). Could be partial — e.g., warn on push if cloud `updated_at` is newer than what local last pulled AND local doesn't have stale-tab markers.
- If #3: replace `_pushDirty` boolean with a counter. Push captures-then-decrements rather than clears.

### Recovery state

| Source | Today's data | Status |
|---|---|---|
| R2 photos | 30 blobs | ✅ Safe |
| R2 drawings | 5 from today | ✅ Safe |
| Cloud row | 0 of today's 30 deficiencies | ❌ Missing |
| Tablet IDB | 30 deficiencies + pins + observations + contractor assignments | ❓ ~95% intact |

**See `R2_RECOVERY_REPORT_4380_24.md` for full inventory and rescue plan.**

---

## BUG #7 / #8 — Drawings disappear / photos don't stick (umbrella: cloud-pull race)

### Mechanism (hypothesized — needs staging to verify)

`Model.addDrawing` (or `addObservationPhoto`) pushes onto local array → `_queueSave` → IDB write → `'saved'` event fires → S155 5s debounce delay before push.

Within that 5s window, the 30s periodic pull (`_checkRemoteForChanges`) can fire and call `SyncEngine.pull`. If `getRemoteUpdatedAt` returns a value newer than `_lastPulledUpdatedAt` (because of concurrent writer or drift), the pull merges cloud's older array over local's newer array.

`_guardEmptyArrays` in `frt/js/data/sync.js:103` only catches `cloud.length === 0`. It does NOT catch "cloud has 8 drawings, local has 9, cloud overwrites local" — which is exactly Mark's symptom.

### Fix direction (needs staging)

Extend `_guardEmptyArrays` to:
- Refuse cloud `drawings` / `deficiencies` / `photos` / `sitePhotos` arrays that are SHORTER than current local
- AND have at least one local item by ID that isn't in cloud
- AND `_dirty` is true OR last save was within debounce window

The guard becomes "refuse overwrite where local has unique items cloud doesn't know about."

---

## BUG #9 — Pins not showing for some drawings on PC

### Mechanism

Mark dropped pins on tablet, viewed on PC, pins for some drawings were missing entirely (not offset). Root: those deficiencies never synced (Bug #10), so cloud has no record → PC fetched cloud state → correctly shows "no pins on this drawing."

The "pin offset" symptom Mark first reported on a different drawing may be partly artifact (DevTools "iPad Mini" responsive mode triggers the iPad downscale path on PC, creating coordinate discrepancy). **Don't fix what we haven't measured.** Test cross-device pin positioning properly only after Bug #10 is resolved and DevTools is NOT in responsive mode.

---

## BUG #5 (existing) — Multi-obs lane move cascades whole pin

Plan unchanged from S154 checklist Step 5. **Now deferred** until staging environment exists — touches `Model.splitObservationToPin` which is core Model state. Same risk class as the sync bugs.

---

# AUTH OVERHAUL — CLOSED OUT AT S155

All three S154 open questions resolved by Mark:

| Q | Decision | Effect |
|---|----------|--------|
| Recovery email | **A** — Reset-via-login-email | Already shipped. Zero new work. |
| Admin password reset backend | **Defer** — Supabase dashboard | Revisit when inspector count climbs. |
| Account sharing prevention | **Skip** — Idle-based lock is enough | No enforcement code. |

**Net new auth code outstanding: zero at current scale.**

---

# STAGING ENVIRONMENT — PROPOSED S156-S158 PRIORITY

Mark raised "why no test environment?" S155 incident underscores the need.

Proposed:
1. Staging GitHub Pages deploy (parallel URL)
2. Staging Supabase project (or staging-flagged rows)
3. Staging R2 prefix
4. Pre-flight checklist for sync/merge/IDB/upload commits
5. End-of-session smoke test list

Estimated effort: 2-3 sessions. **Mark's expressed view: above all feature work.**

Recommended sequence for S156 onward:
1. **S156**: 4380.24 RESCUE first thing. Then incident root cause investigation. Then staging plan agreement.
2. **S157-S158**: build staging environment.
3. **S159+**: harden sync engine using staging. Then resume feature work (Bug #5, contractor-card click, Appendix A, §2.4, etc.).

---

# TIER / PHASE ROADMAP (post-S155)

## Track 1 — Board Rework (FRT)

**SHIPPED through S155:** §1, §2.1, §2.2, §2.3, B1, B2, B2.1, B3, pin colour overhaul, pill prominence, pill darkening, Site Records pill, sync optimizations (with caveat), Closed Items Summary rec-exclusion.

**DEFERRED until staging exists:** §2.4 (sticky banners + Hide-Closed compactor + jump-nav), §3 pin-focused card redesign, Bug #5 multi-obs lane move dispatcher, split-pin badge.

**Lower-risk items potentially OK without staging:** Appendix A drawings consolidated (PDF export only). Contractor-card click Option A/B/C still pending Mark's call.

## Track 2 — New Tools Pipeline

Unchanged. NOT STARTED: IT&M Checklists, Travel Distance/Exit Capacity, Occupant Load, FRR Quick Reference, Proposal Template Generator. PARKED: Firefighting Water Supply Calc.

## Track 3 — Training Center / LMS (Tiers 1-6)

Unchanged. Tier 1 next. Concurrent writer on `main` remains active.

## Track 4 — FRT Full Rewrite (Phases 0-9)

Unchanged. Board Rework lives inside Phase 3.

## Track 5 — Strategic / Infrastructure

**Auth overhaul closed for current scale.** Sequence when inspector count or password-incident frequency climbs:
1. Admin reset Edge Function (when needed)
2. RLS rollout → production cutover → ARENCON ownership transfer → M365 SSO → scaled rollout

Non-code items unchanged from S154:
- Confirm M365 deployment timeline with ARENCON IT
- Designate company-side technical contact for ownership transfer
- Decide public domain
- Plan inspector bookmark/URL transition

---

# PRE-PRESENTATION CARRY (Shaun Kelly sign-off)

- ✅ Closed Items Summary listing recommendation rows — SHIPPED S155 (`6967e1e1`)
- ✅ Appendix status-cell forbidden hex — verified done S154 (`46c6c44c`)
- ⏳ PDF title-page legend (Phase 3 C, likely moot under Model 2)
- ⏳ Recommendations-only report summary-table decision
- ⏳ Refresh `FRT_REWRITE_BUSINESS_CASE.md` to delivered-vs-promised one-pager

---

# RECOMMENDED S156 ORDER

1. **4380.24 rescue with Mark in the loop.** Read-only IDB diagnostic, confirm 30 deficiencies intact, manual push. **No other code ships until rescue is complete.**
2. **Root cause investigation for Bug #10.** Which of the three candidates is it?
3. **Staging environment build agreement** with Mark. If green-lit, S156-S158 priority.
4. **`_guardEmptyArrays` hardening** (Bugs #7 + #8 fix). Only ship via staging.

Everything below waits for staging:
- Bug #5 multi-obs lane move dispatcher
- Split-pin badge + On/Off control
- Contractor-card click (Mark's A/B/C still owed)
- Board Rework §2.4
- §3 pin-focused card redesign
- All sync/merge/upload changes

Lower-risk items potentially OK without staging:
- Appendix A drawings consolidated (PDF export only)
- Pre-presentation polish items remaining

---

# CARRY-FORWARD (do NOT forget)

- **Tomorrow's rescue is the only priority on session open.** Read recovery report first.
- Concurrent writer on `main` — re-assert HEAD via API every push. S155 verified 4/4 first-attempt success.
- **Compute upgraded Nano → Micro by Mark in S155.** Disk IO headroom is real.
- Dead PAT in project instructions — **ask Mark for fresh PAT each session.**
- **Canon pass deferred** until Mark says "give me the canon pass." S155 PK delta accumulates with S150-S154 deltas for next pass.
- **Behavioral commitments from pattern-of-failures conversation** — see HANDOFF §"Pattern-of-failures conversation" and PK delta §8. Especially:
  - Default to fewer commits, not more
  - No sync/merge/IDB/upload commits without tablet in hand and (eventually) staging
  - Stop calling sync-engine work "scope-minimal"
  - Push back harder before Mark goes into field next day
  - Don't claim `node --check` as validation
- Trust rule (absolute): never claim work done that isn't.
- Confirm S151 nav-fix round-trip on-device (still open).
- One judgment call open from S154: `_showInspChip` default after §2.3.

