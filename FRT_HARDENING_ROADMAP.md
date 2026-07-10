# ARENCON FRT — Hardening Roadmap

**Created:** July 2026
**Source:** Grok's FRT review + Self-Test agent design, cross-checked against live FRT code
(`frt/` modular app on `arencon.app`). Every item was verified against the real source before
inclusion. Grok's findings are used where they held up, corrected where they didn't, and
rejected where wrong. **This is a backlog, executed one item at a time, each field-verify
gated for any data-path change.**

Companion to `DIESEL_HARDENING_ROADMAP.md`. The Diesel photo-loss work comes FIRST (real field
incident on 7155.51); FRT hardening follows once Diesel is stable.

---

## Verification note (why this isn't a blind copy of Grok)

Grok's FRT review scored the tool 8.1/10 and was mostly accurate, BUT its single highest-severity
finding was **wrong**:

- **P0-1 OffscreenCanvas (Grok's "Critical"):** REJECTED. Verified — `lib/workers/imageWorkerHost.js`
  ALREADY has the feature-detect (`typeof OffscreenCanvas === 'undefined'` → skip worker), a full
  main-thread Canvas2D fallback (`_fallbackCompress`), AND the exact telemetry Grok "recommended
  adding" (`_diag.fallbackCount`, `workerOK`, `lastError`). It's a documented S130 waiver. Grok
  flagged it from code comments without seeing the worker source. **Do NOT action — already done.**

When I checked Grok's Self-Test code against live FRT, though, it was BETTER than expected: 12 of 13
assumed APIs exist with correct names AND correct return shapes (`getAllDeficiencies()`→`{defic:...}`,
`getAllPhotoRecords()`→`{photo:...}`, `getEffectiveStatus()`→`'closed'`/`'open'`). Grok clearly read
model.js carefully. So its Self-Test is a usable base — with three corrections below.

---

## Priority 0 — Real data-safety (do after Diesel photo work)

### FRT-P0-1 — Dirty-path audit (highest value, zero risk to run)  ⭐ FIRST FRT ITEM
**What it is:** In FRT, an edit must both save to the tablet (IDB) AND flag the cloud push. Two
functions: `saveNow()` hits IDB; `Model.touch()` flags cloud. History shows paths that called
only `saveNow()` (fixed piecemeal in S342, S351b). Any remaining such path = "edit shows, survives
local refresh, then next cloud pull silently overwrites it."

**What "doing it" means:** A pure **grep-and-audit** — NO code changes. Search every mutation of
`d.observations[i].text/activity/photos/photoSelection/addressed/isRecommendation`, pin coords, etc.
that calls `saveNow()` without `touch()`/`_dirty`. Output: a list of safe vs. suspect paths. Then
Mark decides which to fix. Zero risk to run; this is diagnosis, not surgery.

**Verified:** `Model.touch`, `Model.saveNow`, `Model.hasUnsavedChanges` all exist in live model.js.

### FRT-P0-2 — Shape validation on load / pull / import
**What it is:** FRT currently trusts whatever project JSON arrives from cloud. A corrupt/half-migrated
row renders broken and can be re-pushed, spreading the corruption.

**The fix:** A lightweight `validateProjectShape(p)` at load/pull/import time — confirm expected arrays
exist, every deficiency has id+num, every photo has id. On obvious corruption: show "project looks
corrupted — contact admin / restore from JSON" instead of silently rendering garbage. Soft-fill missing
empty arrays only; NEVER rewrite real data. Low risk, pure protection.

---

## Priority 1 — Reliability (real, moderate risk)

### FRT-P1-1 — UI-state consolidation (demo-first, medium risk)
**What it is:** Deficiency-list view settings (`_dfxSearch`, `_catFilter`, `_recHoldUntilNav`, `_bvSel`,
etc.) are scattered module globals. After a cloud pull / AI-accept / renumber, some don't reset → stale
filter, ghost selection, wrong fold. Confusing, not data-losing.

**The fix:** Consolidate into one `uiState` object; `resetTransientUiState()` on project change (clear
selection/drag/hold; keep filters/folds if desired). Persist only what should survive reload.

**Why demo-first:** Touches deficiency-list rendering (`_buildDeficCard` region), which is LOCKED code
per PK. Build a demo, get Mark's sign-off, then port. Medium risk.

### FRT-P1-2 — Photo-identity invariant doc + read-only self-test
**What it is:** FRT's photo/never-bake/backup identity is sophisticated but the highest residual-risk
area (per Grok, and matches FRT's own S-session history). Write a one-page INVARIANTS.md stating the
rules (working photo → clean original; backup holds pre-markup identity; photoSelection is the only
visibility filter; deleted = tombstone).

**CORRECTION to Grok:** Grok wanted an auto-repair self-test that mutates `photoSelection` + calls
`Model.touch()` on every save. REJECTED as written — a silent write to a data path from a diagnostic is
exactly the fat-finger/side-effect risk the field-verify gate exists to stop. Ship the self-test
**READ-ONLY first** (report orphans, don't prune). Only add auto-fix later, field-verified, off by default.

---

## Priority 2 — Test agents (Grok's Tier-1 Self-Test, corrected)

### FRT-P2-1 — FRT Self-Test Agent (Tier 1), corrected from Grok's code
Grok delivered a working `selfTest.js` for FRT. It would mostly run as-is (12/13 APIs verified). Ship a
CORRECTED version:

**Keep (verified good):** C01 project shape, C02 effective-status consistency, C03 recommendation rollup,
C04 photo IDs, C06 markup backups (never-bake), C07 tombstones, C13 CRB round math, C14 defic nums.
Super-admin gate, per-check try/catch isolation, read-only default — all sound.

**Corrections required before shipping:**
1. **C05 auto-fix → OFF.** Grok's photoSelection auto-prune writes to the data path. Ship read-only
   (report orphans); no `Model.touch()` from a diagnostic. (Same principle as FRT-P1-2.)
2. **C08 Site Records → use the real constant.** Grok's fallback regex flags any name matching
   `/general/i` as Site Records — would false-positive a real sub "General Fire Protection Ltd."
   Use FRT's actual `SITE_RECORDS_LABEL`/`isSiteRecordsName` (exists in model.js), not a regex.
3. **C09/C10 observability → honest reporting.** Grok guessed sync-diag property names
   (`window._frt.diagnostics.sync.emptyArrayGuards`, `SyncEngine.lastSeenUpdatedAt`). VERIFY these
   against live sync.js. If a counter isn't exposed, the check must report "not measured" — NOT a
   green pass. A false green is worse than no check (false comfort).

**Integration:** `frt/js/diag/selfTest.js` (sibling to integrity.js), super-admin button in the existing
diagnostic modal, `node --check` clean. Grok's integration brief is fine; follow it with the above fixes.

### FRT-P2-2 — Diagnostics panel expansion
Additive to the existing admin Diagnostics: sync-meta age, guard fire counts, image-compress path, recent
sync errors, exportable-as-text. Low risk, genuinely useful for remote field support.

---

## Test-agent strategy (Grok's 3-tier model — my assessment)

Grok proposed 3 tiers. My judgment on each:

- **Tier 1 — In-app Self-Test (super-admin button):** AGREE. Highest ROI, offline, runs on the real
  tablet against real data. This is FRT-P2-1 above. Build first (after Diesel + FRT-P0 items).
- **Tier 2 — Node pure-logic suite** (`node --test` on extracted status/photo/merge/CRB helpers):
  AGREE, but BLOCKED on extracting pure functions from the god-modules first (see "deliberate someday"
  below). You already have a Test Agent + Playwright in `tests/` — Tier 2 would extend that. Medium value.
- **Tier 3 — Playwright golden journeys** (real browser E2E: login→project→pin→photo→markup→PDF):
  AGREE it's last. Needs a test Supabase + test R2. Highest maintenance cost. Grok is right to defer.
- **Full vision/computer-use agent that "clicks like Mark":** REJECT as primary regression. Grok agrees —
  flaky on canvas/pan/zoom/gestures, gives false confidence. Not worth it.

---

## Deliberate someday (NOT now — high risk against locked code)

- **God-module extraction** (Grok P1-1): split `deficiencies.js` (~7k lines), `viewer.js`/`markup.js`
  (~5k each), extract `status.js`/`photoIdentity.js`/`contractorColor.js`/`descHtml.js`/shared pin renderer.
  Real long-term health win, but touches `_buildDeficCard`, `getEffectiveStatus`, merge logic — all LOCKED.
  Only do this deliberately, surgically, re-export to keep imports working, one module at a time, never
  mid-feature. This ALSO unblocks Tier-2 tests. High value / high risk — schedule as its own arc.

- **PDF export memory batching** (Grok P1-3): batch photo downscale (4-6 at a time with yield), cancelable
  export, aggressive `URL.revokeObjectURL`, reuse one pin canvas. Real on iPad with 40+ photos. Medium
  priority; do after the P0 safety items.

---

## Execution order (FRT — after Diesel photo work is stable)

1. FRT-P0-1 — Dirty-path audit (zero-risk diagnostic) ← first FRT item
2. FRT-P0-2 — Shape validation on load
3. FRT-P2-1 — FRT Self-Test agent (corrected, read-only)
4. FRT-P1-1 — UI-state consolidation (demo-first)
5. FRT-P1-2 — Photo-identity invariant doc + read-only self-test
6. FRT-P2-2 — Diagnostics expansion
7. (someday, deliberate) god-module extraction → unblocks Tier-2 tests; PDF memory batching

Each data-path item: `/home/claude/` copy → `node --check` clean → CSS brace + `<style>` balance →
Mark field-verifies → push. Never two data-path items in one push.
