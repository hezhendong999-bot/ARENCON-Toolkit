# HANDOFF — Session 137 (Polish)

**Date:** 2026-05-16
**Base commit (S137 ship):** `5d546d5`
**Head commit (this session):** `2f888b0` — `origin/main`, IN SYNC
**Version triad:** SW `arencon-frt-v413` ↔ CSS `frt.css?v=313`
**Scope:** Deficiencies tab polish + single-obs/multi-obs card unification.
**JS schema:** untouched — unit suite **144/144 passed** (run, not assumed).

> This is a standalone per-session handoff. The full 217KB
> `ARENCON_Project_Knowledge.md` regeneration was deliberately deferred to
> the **start of S138** (fresh context budget) — see "Carry-forward" below.
> Project-Knowledge and Style-Guide **deltas** for this session are committed
> alongside this file: `PROJECT_KNOWLEDGE_S137_POLISH_DELTA.md`,
> `STYLE_GUIDE_S137_POLISH_DELTA.css`.

---

## 1. What Mark asked for

Working from screenshots of the post-S137 Deficiencies tab. Five threads,
resolved in order over the session:

1. **Reorder** the three cards — Trade Board should come before the
   Deficiency Log (Mark invited pushback; none given — agreed).
2. **Rename** — "Trade Board · Contractors on Site" too long; "Deficiencies
   Identified" should parallel "Deficiency Log".
3. **Gap** above the Active/Closed + search row in the list section.
4. **Box-in-box** — Untagged/Vipond/pin all nested boxes inside the
   Deficiency List box; reads as clutter, but Mark worried flat would look
   worse → asked for help, not a directive.
5. **Closed card geometry** — closed item card narrower than active +
   text shifting horizontally then vertically on quick page/pivot switch.
   Resolved through three escalating findings (see §2.4).

## 2. What shipped (commit-by-commit)

Session commits on `main` (interleaved with one automated `Backup` commit
that we rebased over cleanly):

### 2.1 — Reorder + rename + button cleanup + de-box  (commit `0dbbd0b`)
- **Reorder:** Trade Board → Deficiency Log → Deficiency List.
  Rationale (objective, not taste): the Deficiency Log's rows *are* the
  Trade Board roster; the roster must exist before the scoreboard that
  pivots on it.
- **Rename:** card headers → **"Trade Board"** and **"Deficiency List"**.
  "Deficiency List" chosen over "Deficiency Identified" — "Log/List" is a
  clean parallel pair, both grammatically a container noun; "Identified"
  reads as a per-item status stamp.
- **Buttons:** `#defic-toolbar` (Renumber / AI Group / Select / Fold All)
  **removed**. Verified via code read: AI Group / Select / Fold All had
  **zero handlers** — S135 retired the underlying features (S135 delta
  "RETIREMENTS") and left orphaned markup. This was *finishing S135's
  incomplete cleanup*, not a new decision. Renumber kept (handler at
  `deficiencies.js` document-delegate on `#defic-renumber-btn`, still
  functional, `Model.renumberDeficiencies()` never retired) and **folded
  into `.defic-control-bar`** far-right after the view toggle → the
  separate toolbar row and its gap are gone in one move.
  - Renumber→PDF-export-toggle merge remains the deliberate **S139 /
    Phase 3** item — NOT pulled forward (Mark's explicit choice).
- **De-box:** trade banner `.dfx-trade-banner` and contractor sub-banner
  `.dfx-ctr-banner` → `border-radius:4px` flat **bands** (were
  `6px 6px 0 0` box-tops); `.dfx-ctr-banner` gains `margin-top:8px` to
  detach. `.dfx-pingrp` container **lost its fill/border entirely**
  (was `#F7F8FA`/`#1C2333` + 1px border) — content now flows flush
  beneath the band. `.defic-pin-group` flattened (`1px`/`8px` from
  `1.5px`/`10px`). Net: **2 real boxes only** — outer section card +
  pin card; bands carry hierarchy.

### 2.2 — Closed-card horizontal stripe fix  (commit `8a00bd1`)
- **Root cause:** `.defic-obs-card.addressed` had
  `border-left:3px solid #5F8068`; base `.defic-obs-card` has no left
  border. Closed (addressed) cards therefore had different box geometry
  → 3px content inset vs active, and the border appearing/disappearing on
  re-render shifted text horizontally.
- **Fix:** stripe → `box-shadow: inset 3px 0 0` (paint-only, zero
  layout). Dark-mode rule matched (`#4a8a6a`, was `border-left-color`).
  Identical geometry both states.

### 2.3 — Control-bar height stability  (commit `ff8564e`)
- **Hypothesis (stated as such to Mark):** `.defic-control-bar` uses
  `flex-wrap`; filter `<select>`s had no fixed width → sized to selected
  option text; `_syncDfxControls` repopulating contractors changed width
  → bar re-wrapped → height changed → vertical content shift.
- **Fix:** pinned `select.dfx-filter-input` width 168px,
  `#dfx-pri` 130px, `text-overflow:ellipsis`; mobile `width:100%`.
- **Outcome:** did NOT fully resolve the vertical jump (Mark: "same
  thing"). Kept (it's a correct hardening regardless) but not the cause.

### 2.4 — Single-obs / multi-obs card unification  (commit `2f888b0`) ★ the real fix
- **Diagnosis via live console (per debugging protocol — stopped guessing
  after 2.3):** Mark ran a DOM-probe one-liner. Output proved the split
  was **single-obs vs multi-obs, NOT active vs closed**:
  ```
  Active:  open | strip:true  51px | obs:2 | firstTextTop:52px
           open | strip:false      | obs:1 | firstTextTop:1px
  Closed:  closed| strip:false      | obs:1 | firstTextTop:1px
  ```
  One renderer (`_buildPinGroupCard`) builds every pin. Single-obs pins
  got the S122 compact layout (no strip header, pin circle inline on the
  obs row, drawing pill pushed right, no Observation sub-card, no thread).
  Mark's closed item happened to be single-obs. An active single-obs pin
  looked equally "old" — there was never a closed-specific renderer.
- **Mark's directive:** make all cards consistent with the active
  multi-obs layout; *do not* redesign; do not touch multi-obs/active;
  Spinoff/Remove-obs stay hidden on single-obs (non-destructive);
  drawing pin on the **left**.
- **6 surgical edits to `_buildPinGroupCard` (no rewrite — protected fn):**
  1. `renderPinStrip = true` (was `obs.length !== 1`) — strip header for
     every pin; the strip is left-packed flex so the drawing pill is now
     **left-aligned for all pins**.
  2. Obs pill: dropped the single-obs `is-pin` big-circle class →
     same small pill as multi-obs.
  3. Obs label: always `· Observation` (was `· Pin` for single-obs).
  4. Deleted the `if (!multiObs)` block that emitted `.lbl-row-spacer` +
     right-side drawing pill (strip now owns it, left).
  5. Removed the `if (multiObs)` gate on the per-obs
     Thread / +Response / +Comment block (converted to a plain `{ }`
     block — brace-safe; one transient dropped-div during editing was
     caught and restored same turn).
  6. Pin-footer threaded-activity filter: dropped `&& multiObsPin` so
     single-obs threaded entries thread instead of duplicating into the
     footer. Dead `var multiObsPin` declaration removed.
- **`multiObs`** (line ~517, per-obs scope) is still live and unchanged —
  only `multiObsPin` (pin scope) became dead and was removed.

## 3. Validation performed

- `node --check`: `deficiencies.js`, `app.js`, `data/sync.js`,
  `data/model.js` — all pass.
- `deficiencies.js` parses cleanly as a full function body (guards
  against the edit-5 transient).
- `frt.css` brace balance: 2748/2748.
- Unit suite: **144/144 passed** — actually executed (`npm install`
  was required first; the fresh shallow clone had no `node_modules`,
  which is why an earlier `vitest` invocation reported "not found" —
  that was a clone artifact, never a code fault).
- HEAD == `origin/main` == `2f888b0`. Version triad coherent.

## 4. Decisions locked / deferred (do NOT re-propose in S138)

- Renumber→PDF-export "Renumber before export" orange toggle (default ON):
  **S139 / Phase 3.** Renumber stays a control-bar button until then.
- Tap-contractor-name-to-focus (the S135-intended Fold All replacement):
  **S145 / Phase 6.** No collapse-all affordance until then — status quo
  since S135, Mark accepted implicitly (did not request it built).
- Spinoff / Remove-obs on single-obs pins: **stay hidden** (non-destructive;
  footer ⋯ "Remove pin" covers deletion). Do not "complete parity" by
  showing them — it orphans the pin.
- Bulk Select undo/redo safety net: still **S142–143 / Phase 4**.
- Top sections (Trade Board / Deficiency Log) foldable: **not requested,
  not built.** Don't add speculatively.

## 5. Carry-forward into S138 (priority order)

1. **FULL `ARENCON_Project_Knowledge.md` regeneration** — deferred from
   this session for context-budget integrity. The S137-polish delta
   (committed) must be folded into the canonical 2,785-line doc. Do this
   FIRST in S138 with a fresh budget. Likewise a full consolidated Style
   Guide (project currently holds only per-session deltas through S137).
2. Visual confirmation from Mark that single/multi/active/closed cards
   now render identically with drawing-pin-left and the vertical jump is
   gone (he had not yet hard-refreshed v413 at session end).
3. Pre-existing open items unchanged by this session:
   - FRT v2 viewport-windowed level-canvas for crisp L4 zoom (no-OOM).
   - sync.js blank-project load race (cloud-pull after IDB snapshot).
   - Toolkit tools still queued (Firefighting Water Supply rural/municipal,
     NFPA 25/OFC IT&M ×3, Travel Distance/Exit Capacity, FRR Quick Ref,
     Occupant Load).

## 6. Files changed this session

```
frt/css/frt.css           | 46 +-
frt/index.html            | 32 +-
frt/js/ui/deficiencies.js | 35 +-
sw.js                     |  2 +-
4 files changed, 61 insertions(+), 54 deletions(-)
```
Commits: `0dbbd0b` → `8a00bd1` → `ff8564e` → `2f888b0` (rebased over
automated `a0e3978` backup).
