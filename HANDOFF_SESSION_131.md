# HANDOFF — SESSION 131

**Date:** 2026-05-14
**Focus:** S131 Priority #1 — Field tablet zoom crash (WebGL context loss / renderer OOM)
**Status:** Crash PERMANENTLY FIXED & DEPLOYED. L4 sharpness tradeoff accepted; proper fix scoped → S132.

---

## TL;DR

The field tablet "Aw snap" crash on L4 zoom-in is **fixed and live**. It was caused by
oversized canvas backing stores — `markup.js` and `tiledPdf.js` each independently
allocated canvases sized for a desktop GPU, and the shared Android field tablets were
never given their own budget tier. Both now share one device-class budget module.

Side effect of the safe budget: at deepest L4 zoom the drawing is **noticeably blurry on
tablets** (~35% linear resolution). This is a known, accepted tradeoff — the global budget
can't deliver crisp L4 without re-risking the crash. The correct fix (viewport-windowed
level canvas) is scoped as **S132 Priority #1**.

---

## What shipped (deployed to main)

**HEAD:** `ceabce0` · **SW cache:** `arencon-frt-v384` · **CSS:** `v=297` (unchanged — no visual changes this session)

Three commits:
- `d3517db` — markup.js 3-tier budget + tablet-first-loss WebGL→2D fallback
- `207d981` — tiledPdf level-canvas budget + extracted shared helper
- `ceabce0` — **fix:** added `deviceBudget.js` (was untracked, omitted by `git commit -am` — would have 404'd both imports and broken FRT boot; caught on diff-stat)

### Files changed
| File | Change |
|---|---|
| `frt/js/shared/deviceBudget.js` | **NEW** — single source of truth for device-class canvas budget |
| `frt/js/viewer/markup.js` | Imports shared helper; local 2-tier logic removed; tablet WebGL→2D fallback added |
| `frt/js/viewer/tiledPdf.js` | Level-canvas backing buffer now budgeted via `deviceMaxPixels()`; 3 compositing sites scale by `entry.bufScale` |
| `sw.js` | Cache `v382` → `v384` |

### `deviceBudget.js` — the budget tiers
```
phone   —  8 MP
tablet  — 12 MP   ← the dial. Raising it reduces blur but eats crash headroom.
desktop — 30 MP
```
`deviceClass()` returns phone/tablet/desktop from UA. `deviceMaxPixels()` returns the cap.
Both `markup.js` and `tiledPdf.js` import from here — the duplicated-and-drifting budget
logic that *was the root cause* can no longer recur.

### Root cause (confirmed)
- `markup.js` had a 2-tier classifier ("Android phone" vs "everything else"). Field
  tablets (`SM-T|SM-X|Tablet`) fell into "everything else" → inherited the **30 MP desktop
  budget**. Two markup canvases (2D + WebGL sibling).
- `tiledPdf.js` `_getOrCreateLevelCanvas` sized the level canvas to the **full native
  level resolution** — no device tier at all. L4 is **12288px longest dim** → a full ARCH-D
  sheet L4 canvas ≈ **101 MP ≈ 403 MB** of backing store, identical on every device.
- Combined on a tablet: renderer memory exhausted → `webglcontextlost` → Chrome OOM-kills
  the renderer process → "Aw snap." Killed a live site review 2026-05-14.

### Safety properties
- When a level/canvas is already under budget, `bufScale === 1` → math is **byte-for-byte
  identical to pre-S131**. **Desktop rendering is completely unchanged.**
- On tablets, normal working zoom (fit → mid-zoom) is also unchanged — the cap only
  engages at the deepest L4 zoom.
- `markup.js` tablet WebGL→2D fallback: on the FIRST `webglcontextlost` on a tablet,
  abandon WebGL outright (Canvas 2D allocates no GPU textures, so loss can't recur)
  instead of the 3× retry loop that re-attempts the same too-large allocation.

### Validation
- All 3 JS files `node --check` clean
- No stale `_device*` names anywhere in `frt/js/`
- Full vitest suite: **95 passed, 2 skipped** (Supabase contract — no anon key in CI; same as S130 baseline)
- Confirmed canvas-mode (`_S99_CANVAS = true` default) is the live tile path; `entry.ctx`
  touched at exactly the 2 compositing sites that were updated — full coverage

### Field-tested by Mark (this session)
- ✅ **No more crash** at L4 max zoom — confirmed on real field tablet
- ⚠️ **L4 is too blurry** — confirmed. Expected: ~35% linear res at 12 MP cap on a 101 MP L4.

---

## OPEN — S132 Priority #1: viewport-windowed level canvas

**Why the global budget can't fix the blur:** even at a 24 MP cap, L4 only reaches ~49%
linear resolution — still soft — and 96 MB puts you back near the crash threshold. You
cannot brute-force L4 sharpness through one global number.

**The correct fix:** the level canvas should size its backing store to the **visible
viewport region + margin**, not the entire sheet. The tablet screen is ~2 MP; at L4 zoom
the user sees a small crop. A viewport-windowed canvas renders that crop at **bufScale
1.0 (fully crisp)** using only viewport-sized memory.

**Scope (dedicated session — `tiledPdf.js` is a protected core file):**
- `_getOrCreateLevelCanvas` → level canvas becomes a viewport-window canvas with an
  `(offsetX, offsetY)` origin in native level pixels
- The 3 compositing sites (`_getOrCreateLevelCanvas` alloc, `_startFetchCanvas` drawImage,
  `_evictTileFromCanvas` clearRect) shift from sheet-relative to window-relative coords
- Re-window + repaint on pan/zoom past the margin (interacts with `scheduleRender`)
- CSS positioning of the level canvas shifts with the window offset
- Validate on a real field tablet: crisp L4 + no crash + no seams on pan

**Interim state:** the 12 MP global budget stays in place until S132 ships. Field is
**usable but soft at max L4 zoom**. If Mark needs it sharper before S132, the only
interim lever is raising the `tablet` value in `deviceBudget.js` — but every MP added
walks back toward the crash. Not recommended without tablet re-validation.

---

## OTHER OPEN ITEMS

### Project load/sync timing bug (observed, NOT data loss)
During this session 7155.51 appeared to "lose all data" — drawings, deficiencies, info
all gone; `Model.getProject().name` was `undefined`; the loaded project id
(`proj_1778764192295_2_otpe4vmy`) did not match the URL project id
(`6338d5af-...`). **The data came back on its own** once the cloud pull completed.

Diagnosis: the project object is momentarily **blank/placeholder** between local IDB
snapshot restore and cloud-pull completion. Not data loss — a load-ordering/race issue.
**Risk:** if a save or sync fires during that blank window, the blank state could be
persisted. Worth a dedicated investigation — recommend it does NOT share a session with
the tiledPdf windowing work. Not yet prioritized; Mark to decide placement.

### S131 deferred (from S130 handoff, not started this session)
- Dead-code / unwired-feature audit
- R2 path-scheme investigation (`photos/{pid}/...` stored key vs bucket key)

These were correctly deprioritized — the crash was a live-incident fix and took the session.

---

## SESSION NOTES / LESSONS

- **`git commit -am` does not stage new untracked files.** `deviceBudget.js` was omitted
  from `207d981`; both imports would have 404'd and broken FRT boot. Caught on the
  post-commit `git diff --stat`. **Lesson: after creating a new file, `git status` before
  considering a commit complete — or `git add -A`.**
- **I anchored to the wrong L4 size early.** Estimated L4 ≈ 6144px / ~25 MP and told Mark
  the blur would be "~70%." Actual L4 is 12288px / ~101 MP → ~35%. Corrected once I read
  `LEVEL_WIDTHS` from `azure-function/src/functions/render.js`. **Lesson: read the renderer
  constants before quoting resolution math.**
- The crash fix shipped in two passes (markup first, then tiledPdf) because the markup
  budget alone was necessary-but-not-sufficient — tiledPdf's untiered level canvas was the
  dominant memory consumer. The priority doc's Step 3 correctly anticipated this.

---

## QUICK REFERENCE

- **Repo:** `hezhendong999-bot/ARENCON-Toolkit`, HEAD `ceabce0`
- **SW cache:** `arencon-frt-v384` · **CSS:** `v=297`
- **Budget dial:** `frt/js/shared/deviceBudget.js` → `tablet` case in `deviceMaxPixels()`
- **Tile renderer levels:** `LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288]` (azure-function)
- **Tile path:** canvas-mode (`_S99_CANVAS`) is default; `?s99test=img` opts out
- **Crash repro (pre-fix):** field tablet → 25+ MP drawing → pinch to L4 max zoom
