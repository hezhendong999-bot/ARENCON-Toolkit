# PROJECT KNOWLEDGE — DELTA for Session 96 (FINAL, post-reverts)

**Purpose:** Append/merge into `ARENCON_Project_Knowledge.md`.

**Status:** S96 shipped two of four planned fixes. The two that didn't land (markup viewport canvas, tile cache shrink) will be redone properly in S97. What did land was the offline tile cache — a genuine, first-time-in-v2 capability.

---

## REPLACE — top-of-file date

```
Last updated: 2026-04-20 (Session 96 — offline tile cache shipped; markup viewport canvas + tile shrink reverted, deferred to S97)
```

---

## REPLACE — Current state section

- **FRT v2 rewrite — ~82% complete** (iPad memory crash still open — scheduled for S97)
- **Phase 4 (tile-based viewer): ~92%.** Rendering pipeline stable; offline support now shipped
- Current cache state: `frt.css ?v=219`, SW `arencon-frt-v187`, tile cache `arencon-frt-tiles-v1` (separate, long-lived)
- IDB: `ARENCON_FRT_V2`, version 2, 12 stores (unchanged in S96 — tiles use SW Cache API, not IDB)
- Tile extension: `.webp` only

---

## APPEND — after S94 section

### Session 96 — Offline tile cache shipped; two architectural fixes reverted

**What landed:**

#### Fix #3 — Offline tile cache (commit `d67a56ca304b`, LIVE)

**Before S96:** SW explicitly bypassed all `workers.dev` URLs. Tile-mode drawings had ZERO offline support. v1 regression that went unnoticed because field testing was on Wi-Fi.

**After:** SW intercepts `*/tiles/*` URLs from the Cloudflare R2 worker. Two strategies:
- **Manifest** (`*/tiles/*/manifest.json`): network-first, cache fallback. Fresh manifest wins.
- **Tile images** (`*/tiles/*/page-N/level-X/Y-Z.webp`): cache-first, network fallback. Once cached, always served from cache. Offline + uncached returns 1×1 transparent PNG sentinel with header `X-Offline-Sentinel: 1` and status 504.

Cache name: `arencon-frt-tiles-v1` — SEPARATE from app cache. **Survives `CACHE_NAME` bumps.** Only purged via explicit user action or full site-data wipe.

**SW postMessage protocol** (page-side → SW):
- `{ type: 'TILE_CACHE_PURGE_PROJECT', pid }` → deletes all cached tiles for a project
- `{ type: 'TILE_CACHE_CLEAR' }` → wipes entire tile cache
- `{ type: 'TILE_CACHE_STATS', pid }` → returns cached tile count

**Helper module:** `frt/js/data/tileCache.js` exports:
- `prefetchDrawingLevels(pid, drawingId, levels, onProgress, abortSignal)`
- `autoPrefetchProject(pid, drawings, onProgress, abortSignal)` — levels `[0,1,2]` (overview + readable zoom)
- `downloadProjectAllTiles(pid, drawings, onProgress, abortSignal)` — every level
- `getProjectCacheStats(pid)`, `purgeProjectCache(pid)`

**Auto-prefetch UX (FRT):** triggered 800 ms after `_startCloudSync(didLoad=true)`. Silent, background, subtle bottom-right badge shows progress. Clears after ~3.5 s on completion.

**Manual full-download UX (Hub):** 📡 button on every project card → `downloadProjectOffline(projectId)`. Confirmation dialog with size estimate, iOS keep-app-open warning. Non-blocking progress modal with "Run in background" and "Cancel". Uses `TileCache` + Cache API via fetch.

Concurrency 6. iOS Safari background limitation (no Background Fetch API) acknowledged in code + UI.

#### Fix #4 — Debug instrumentation removal (commit `9805d1ca84be`, LIVE)

Deleted: `frt/debug/instrument.js`, `frt/debug/diag.html`, `frt/debug/reset.html`. Removed `?dbg=1` loader from `frt/index.html`. Removed debug entry from SW precache.

---

**What was reverted:**

#### Fix #1 — Markup viewport canvas (commit `11eb89937f85` reverted by `d7becf13ca7a`)

**Attempted:** viewport-sized markup canvas + JS render transform, replacing drawing-sized buffer + CSS-scaled-with-wrap positioning.

**Failure mode on iPad:**
- Drawings appeared blurry (still investigating — could be DOM disturbance, CSS layering, or SW-related)
- Pen strokes drew correctly during finger-down (overlay canvas path worked) but did not persist on release (commit-to-main-canvas path broken)

**Suspected root causes (to confirm with diagnostic snippet in S97):**
1. Canvas allocated at 0×0 because `dv-canvas-area.clientWidth` was 0 at `Markup.init()` time — drawing-viewer-overlay was being shown but layout had not completed
2. `_viewScale` stayed at init-default `1` because `window.Viewer.getViewState()` seed was unreachable — viewer.js exports via ES module, not window global

**Lesson:** staged rollout required. Commit A should ship DOM move + viewport sizing ONLY, keeping pre-S96 render math via a CSS counter-transform. Commit B should migrate the render transform to JS. Shipping both at once hid where the bug lived.

#### Fix #2 — Tile cache shrink (commit `9805d1ca84be` reverted by `4f3ca35bff0d`)

**Attempted:** `_MAX_TILES` dropped from 180 to 30 on iPad, plus aggressive "evict everything outside visible+1-margin" pass at end of every `_renderVisible()`.

**Failure mode:** markup input felt laggy. Eviction pass fired on every render (i.e., every `_applyTransform` frame during continuous pan/zoom). Tile churn pinned main thread, delayed pen input processing.

**Lesson:** eviction must be **idle-debounced**, not frame-driven. Interaction should never trigger eviction. Only fire when user has been idle for 500 ms.

---

## APPEND — Critical rules earned in S96

### Tile cache name must NOT be in CACHE_NAME deletion sweep (S96 invariant — STILL LIVE)

`sw.js` `activate` handler preserves BOTH `CACHE_NAME` AND `TILE_CACHE`:
```js
names.filter(function(n) { return n !== CACHE_NAME && n !== TILE_CACHE; })
```
If `TILE_CACHE` is ever removed from this filter, every SW activation wipes downloaded tiles. The tile cache is INTENTIONALLY decoupled from app-version cache so SW bumps don't invalidate downloaded tile pyramids.

### Auto-prefetch is per-project only (Mark's explicit S96 constraint)

Auto-prefetch (L0+L1+L2) only ever runs for the actively-opened project. Triggered in `_startCloudSync(didLoad=true)` of `frt/js/app.js`. Any future Hub-side "auto-cache all my pinned projects" feature MUST be Wi-Fi-gated and explicit-opt-in. Cellular data cost on tile pyramids is real (300 MB - 1 GB per project).

### Sentinel response detection

`TileCache.isOfflineSentinelResponse(resp)` checks for `X-Offline-Sentinel: 1` header. SW guarantees the header on offline-tile fallback responses.

### Deferred for S97 — Fix #1 v2 pattern (staged rollout mandatory)

When re-attempting viewport-sized markup canvas:
1. **Commit A:** DOM move + viewport × DPR buffer sizing + CSS counter-transform to preserve visual behavior. Verify on iPad.
2. **Commit B:** JS `ctx.setTransform(scale*DPR, 0, 0, scale*DPR, panX*DPR, panY*DPR)` render transform. Remove CSS counter-transform. Verify on iPad.

Do not ship as one atomic commit again.

### Deferred for S97 — Fix #2 v2 pattern (idle-debounced eviction mandatory)

When re-attempting tile cache shrink:
- `_MAX_TILES` moderate (iPad: 80), not aggressive (30)
- Working-set shrink runs in a `setTimeout(..., 500)` that resets on every `scheduleRender`
- Active interaction never triggers eviction
- Keep existing LRU + other-level eviction as backstops

---

## REPLACE — Sacred files (do NOT touch in S97+)

- `frt/js/data/tileCache.js` — public API is settled. New helpers may be added but existing exports must keep signatures.
- `sw.js` tile interception path — settled. The `isTileRequest()` predicate and manifest-network-first / tiles-cache-first split is the contract.
- `frt/js/viewer/markup.js` — S96 Fix #1 reverted. Back to pre-S96 drawing-sized canvas. S97 will redo this in staged form (see deferred pattern above).
- `frt/js/viewer/tiledPdf.js` — S96 Fix #2 reverted. `_MAX_TILES = 180` on iPad restored. S97 will redo with debounced pattern.

Original sacred list still applies:
- `viewer.js` core (above `_showDrawing`)
- `markupEngine.js` (photo lightbox — separate system)
- `webglMarkup.js` Pixi setup core
- `go(pg)` recursive PDF upload pattern in `drawings.js`
- Azure Function code
- Worker tile route

---

## REPLACE — STILL OPEN

1. **iPad memory crash** — still happens on long sessions with large drawings. Fix #1 v2 in S97 is the resolution.
2. **Pin migration from S83** — 14 pins on legacy drawings.
3. **Offline tile sentinel UX overlay** — polish for Fix #3.
4. **Background Fetch API for Android TWA** — would let manual Hub downloads continue when backgrounded on Android.
5. **Hub-side "Cache stats per project" indicator.**
6. **Native iOS app via Capacitor.**
7. **AI Writing Assistant integration.**
8. **Training Center / LMS.**
9. **M365 migration.**

---

## S96 COMMIT LOG (final, including reverts)

| Commit | Title | Net state |
|---|---|---|
| `11eb89937f85` | FIX #1: Markup canvas viewport-sized | REVERTED |
| `d67a56ca304b` | FIX #3: Offline tile cache | LIVE |
| `9805d1ca84be` | FIX #2 + #4: Tile shrink + debug cleanup | #4 LIVE, #2 REVERTED |
| `1fc3b2070456` | Original handoff + project knowledge delta | SUPERSEDED |
| `d7becf13ca7a` | REVERT FIX #1 | LIVE |
| `4f3ca35bff0d` | REVERT FIX #2 | LIVE |

Production at S96 close: commit `4f3ca35bff0d`, CSS `?v=219`, SW `arencon-frt-v187`, TILE_CACHE `arencon-frt-tiles-v1`.
