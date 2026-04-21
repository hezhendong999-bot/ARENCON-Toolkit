# PROJECT KNOWLEDGE — DELTA for Session 96

**Purpose:** Append/merge into `ARENCON_Project_Knowledge.md`.

**Status:** S96 closed the iPad iOS crash via three architectural fixes (markup canvas viewport-sized, tile working-set shrink, offline tile cache) plus debug-instrumentation cleanup. v2 memory profile dropped from ~176 MB to ~106 MB on iPad. Offline support shipped for the first time in v2.

---

## REPLACE — top-of-file date

```
Last updated: 2026-04-20 (Session 96 — Markup canvas viewport-sized, offline tile cache, tile working-set shrink, debug cleanup)
```

---

## REPLACE — Current state section

- **FRT v2 rewrite — ~85% complete** (architectural memory + offline gaps closed; iPad stability now expected)
- **Phase 4 (tile-based viewer): ~98%.** Online + offline both work; manifest-tile-render pipeline solid
- Current cache state: `frt.css ?v=217`, SW `arencon-frt-v185`, tile cache `arencon-frt-tiles-v1` (separate, long-lived)
- IDB: `ARENCON_FRT_V2`, version 2, 12 stores (unchanged in S96 — tiles use Cache API, not IDB)
- Tile extension: `.webp` only

---

## APPEND — after S94 section

### Session 96 — Architectural fix trio: markup viewport canvas, offline tile cache, tile working-set shrink

S96 confronted the architectural mismatch S91-S95 had been patching incrementally. v2 was bolting the tile pyramid on top of v1's "everything sized to the drawing" assumptions, getting tile-architecture complexity with almost none of the memory benefit. S96 fixed all four problems in three commits.

#### Fix #1 — Markup canvas viewport-sized (commit `11eb89937f85`)

**Before:** markup-canvas + markup-webgl-canvas both sized to drawing dimensions (capped at 4M iPhone / 8M iPad / 25M desktop pixels). Lived inside `dv-img-wrap` and CSS-scaled with the wrap's transform. ~32 MB per canvas × 2 canvases = ~64 MB always allocated on iPad regardless of actual zoom level.

**After:** both canvases sized to `dv-canvas-area.clientWidth × clientHeight × DPR` (capped at DPR 2). Moved OUT of `dv-img-wrap` into `dv-canvas-area` (siblings of the wrap, not children). They no longer CSS-scale with zoom. The viewer transform is applied INSIDE `_renderAll` via `ctx.setTransform(scale*DPR, 0, 0, scale*DPR, panX*DPR, panY*DPR)`. Memory: ~12 MB per canvas on iPad (1080×690 viewport × DPR 2 ≈ 3 Mpx). Total saving: ~40-50 MB.

**Public API addition:** `Markup.onTransform(scale, panX, panY)` — viewer calls this from `_applyTransform()` on every zoom/pan change so markup re-renders into the viewport-sized buffer. Mid-stroke transform changes also re-render the in-progress overlay stroke from stored drawing-space points.

**Key invariants preserved:**
- All markup objects still stored in drawing-space coords
- Highlighter offscreen composite still uses 0.3 alpha (no opacity stacking)
- Eraser destination-out mask path still works (offscreen buffer matches viewport × DPR now)
- `markupEngine.js` (sacred file for photo lightbox) unchanged

#### Fix #3 — Offline tile cache via SW Cache API (commit `d67a56ca304b`)

**Before:** SW explicitly bypassed all `workers.dev` URLs (line 91-96 of pre-S96 sw.js). Tile-mode drawings had ZERO offline support — drive to a no-signal site = blank drawings. v1 regression that was missed because field testing was on Wi-Fi.

**After:** SW intercepts `*/tiles/*` URLs from the Cloudflare R2 worker. Two strategies by URL pattern:
- **Manifest** (`*/tiles/*/manifest.json`): network-first, cache fallback. Fresh manifest wins so freshly rendered drawings pick up the latest pyramid.
- **Tile images** (`*/tiles/*/page-N/level-X/Y-Z.webp`): cache-first, network fallback. Once cached, always served from cache. If offline + uncached, returns a 1×1 transparent PNG sentinel with header `X-Offline-Sentinel: 1` and status 504 so img tags don't show broken-image icons.

Cache name: `arencon-frt-tiles-v1` — SEPARATE from the app cache. **Survives `CACHE_NAME` bumps.** Only purged via explicit user action (Hub purge button) or full site-data wipe.

**SW postMessage protocol** (page-side calls these):
- `{ type: 'TILE_CACHE_PURGE_PROJECT', pid }` → deletes all cached tiles for one project, replies `{ type: 'TILE_CACHE_PURGED', count }`
- `{ type: 'TILE_CACHE_CLEAR' }` → wipes entire tile cache, replies `{ type: 'TILE_CACHE_CLEARED' }`
- `{ type: 'TILE_CACHE_STATS', pid }` → counts cached tiles for one project, replies `{ type: 'TILE_CACHE_STATS', count }`

**Page-side helper module:** new file `frt/js/data/tileCache.js` exports:
- `prefetchDrawingLevels(pid, drawingId, levels, onProgress, abortSignal)` — fetches tiles at specified levels (e.g. `[0,1,2]`) via the SW which auto-caches them
- `autoPrefetchProject(pid, drawings, onProgress, abortSignal)` — sequential per drawing, parallel within drawing, levels `[0,1,2]` (overview + readable zoom)
- `downloadProjectAllTiles(pid, drawings, onProgress, abortSignal)` — every level (full deep-zoom)
- `getProjectCacheStats(pid)` — postMessage to SW for cached count
- `purgeProjectCache(pid)` — postMessage to SW for project purge

**Auto-prefetch UX (FRT side):** triggered 800ms after `_startCloudSync(didLoad=true)` succeeds. Silent, runs in background, subtle bottom-right badge `tile-prefetch-badge` shows progress. Cleared after ~3.5s on completion (`✓ Offline ready`). Only fires for THIS project (Mark's explicit S96 requirement: no cross-project prefetch).

**Manual full-download UX (Hub side):** new 📡 button on every project card → `downloadProjectOffline(projectId)`. Confirmation dialog with size estimate (30-100 MB/drawing × N drawings) and iOS keep-app-open warning. Non-blocking progress modal with bar, "Run in background" (just hides modal — JS still runs in foreground), and "Cancel" (keeps partial cache, no data loss).

**Concurrency:** 6 parallel fetches per drawing. Browsers throttle beyond ~6 anyway. Network absorbs other app traffic concurrently.

**iOS limitation acknowledged in code + UX:** Background Fetch API is not supported in WebKit. When user backgrounds Safari mid-download, JS stops within ~30 sec. Hub modal warns explicitly. Real fix would be Capacitor native shell.

#### Fix #2 — Tile cache shrink to visible+margin (commit `9805d1ca84be`)

**Before:** `_MAX_TILES = _isIPad ? 180 : 250`. Tiles accumulated across pan/zoom. Field-observed peak: 48-55 tiles ≈ 50 MB.

**After:** `_MAX_TILES = _isIPad ? 30 : 80` (iPhone unchanged at 80). Plus immediate working-set evict pass at end of every `_renderVisible()`: any tile in `_tiles` whose level === current AND key not in `[colMin..colMax] × [rowMin..rowMax]` (already extended by 1-tile margin) is evicted immediately, image src cleared, DOM node removed. LRU stays as backstop.

**Memory savings:** ~30 MB on iPad.

**Trade-off:** zoom-out-then-zoom-back-in re-fetches tiles from R2 (~100-200ms each, CDN-cached). Pan within a zoom level unaffected. **SAFE only because Fix #3 ships first** — without offline cache, evicted tiles + airplane mode = blank screen. The two fixes are interdependent.

#### Fix #4 — Remove S95 debug instrumentation (commit `9805d1ca84be`)

Deleted: `frt/debug/instrument.js`, `frt/debug/diag.html`, `frt/debug/reset.html`. Removed the `?dbg=1` loader script from `frt/index.html`. Removed `frt/debug/instrument.js` from SW precache list. (`canvas_probe.html` mentioned in S96 handoff didn't actually exist in repo.)

To re-enable for future debugging: restore from git history (commits before `9805d1ca84be`).

---

## APPEND — Critical rules earned in S96

### Markup canvas DOM placement (S96 invariant)

`#markup-canvas` and `#markup-webgl-canvas` MUST be direct children of `#dv-canvas-area`, NEVER children of `#dv-img-wrap`. The whole point of S96 Fix #1 is that they don't CSS-scale with the wrap. `_allocateCanvas()` includes a self-healing relocation step (if a canvas drifted into `dv-img-wrap` from a pre-S96 session, it's moved out) — DO NOT remove this relocation; it's the safety net for cached old DOM.

### Tile cache name must NOT be in CACHE_NAME deletion sweep (S96 invariant)

`sw.js` `activate` handler must preserve BOTH `CACHE_NAME` AND `TILE_CACHE`:
```js
names.filter(function(n) { return n !== CACHE_NAME && n !== TILE_CACHE; })
```
If `TILE_CACHE` is ever removed from this filter, every SW activation wipes the offline tile cache. Many MB lost, force re-prefetch on next project open. The tile cache is INTENTIONALLY decoupled from app-version cache so SW bumps don't invalidate downloaded tile pyramids.

### Auto-prefetch is per-project only (Mark's explicit S96 constraint)

Auto-prefetch (L0+L1+L2) only ever runs for the actively-opened project — never Hub-wide, never across projects. Triggered in `_startCloudSync(didLoad=true)` of `frt/js/app.js`. If a future enhancement adds a Hub-side "auto-cache all my pinned projects" feature, that MUST be Wi-Fi-gated and explicit-opt-in. Cellular data cost on tile pyramids is real (300 MB - 1 GB per project).

### Markup canvas resize handler must clean up on destroy

`Markup.destroy()` must:
- Remove `_resizeHandler` from window resize + orientationchange events
- Clear `_resizeDebounce` timer
- Reset `_viewScale`, `_viewPanX`, `_viewPanY`, `_drawingNatW`, `_drawingNatH`

Failure to clean up = leaking listeners across drawing-open/close cycles, eventually firing dozens of resize handlers per actual resize.

### Sentinel response detection

`TileCache.isOfflineSentinelResponse(resp)` checks for `X-Offline-Sentinel: 1` header. Use this instead of checking image dimensions or content. The SW guarantees the header on offline-tile responses.

### `_isIPad` tile cap is now 30 (was 180)

If iPad pan/zoom feels janky (visible tile re-fetch beyond ~150ms per tile), the working set extension can be increased from `+1` margin to `+2` in `_renderVisible()` at `colMin/colMax/rowMin/rowMax` lines. Or restore `_MAX_TILES` to `60` as a safety backstop. Both are tunables, not structural.

---

## REPLACE — Sacred files (do NOT touch in S97+)

Same as S86+ list, with these additions/changes:

- `frt/js/viewer/markup.js` — S96 viewport-canvas architecture is settled. Do not revert to drawing-sized canvas allocation. The view-transform pattern (`ctx.setTransform(scale*DPR, 0, 0, scale*DPR, panX*DPR, panY*DPR)`) is invariant.
- `frt/js/data/tileCache.js` — public API is settled. New helpers may be added but existing exports must keep their signatures (referenced by app.js, Hub HTML, and possibly future modules).
- `sw.js` tile interception path — settled. The `isTileRequest()` predicate and the manifest-network-first / tiles-cache-first split is the contract.
- `tiledPdf.js` working-set evict pass at end of `_renderVisible()` — settled. Do not remove without first restoring `_MAX_TILES` to a higher value AND verifying offline mode still works without it.

Original sacred list still applies:
- `viewer.js` core (above `_showDrawing`)
- `markupEngine.js` (photo lightbox markup — separate system)
- `webglMarkup.js` Pixi setup core (the `render()` opts contract was extended in S96 to include `scale, panX, panY` — that addition is invariant)
- The `go(pg)` recursive PDF upload pattern in `drawings.js`
- Azure Function code (works, don't break)
- Worker tile route (works, don't refactor)

---

## REPLACE — STILL OPEN

1. **Pin migration from S83** — 14 pins on legacy drawings still pending. Straightforward DB script. Suggested for S97.
2. **Offline tile sentinel UX overlay** — when SW returns the 1×1 PNG sentinel, the viewer currently shows a transparent gap with no label. Polish task: small "Zoom limited — connect for deep detail" banner once per drawing per session.
3. **Background Fetch API** for Android TWA — would let manual downloads continue when app is backgrounded on Android. iOS still requires Capacitor.
4. **Hub-side "Cache stats per project" indicator** — surface the count of cached tiles and approximate MB so users know which projects are offline-ready.
5. **Native iOS app via Capacitor** — only path to true background downloads on iOS. Capital expense decision pending principal approval.
6. **AI Writing Assistant integration** — scoped, not started.
7. **Training Center / LMS** — scoped, not started.
8. **M365 migration** — parallel cutover plan, not started.

---

## S96 COMMIT LOG

| Commit | Description | Files | Net lines |
|---|---|---|---|
| `11eb89937f85` | FIX #1: Markup canvas viewport-sized | markup.js, viewer.js, webglMarkup.js, frt/index.html, sw.js | ~280 |
| `d67a56ca304b` | FIX #3: Offline tile cache | sw.js, tileCache.js (NEW), app.js, ARENCON_Project_Hub.html | ~330 |
| `9805d1ca84be` | FIX #2 + #4: Tile shrink + debug cleanup | tiledPdf.js, frt/index.html, sw.js, DELETE frt/debug/* | ~50 changed, 3 deleted |

Production state at S96 close: commit `9805d1ca84be`, CSS `?v=217`, SW `arencon-frt-v185`, TILE_CACHE `arencon-frt-tiles-v1`.
