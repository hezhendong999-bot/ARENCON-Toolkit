# HANDOFF — SESSION 97

**Session 96 final state:** Two of four fixes landed live. Two were reverted after iPad regressions.

| Change | S96 ship | Current state | Reason |
|---|---|---|---|
| Fix #1 — Markup canvas viewport-sized | `11eb89937f85` | **REVERTED** (`d7becf13ca7a`) | Drawings appeared blurry; pen strokes drawn mid-stroke but didn't persist on release. Timing-related root cause — needs iPad diagnostic to confirm before re-attempt. |
| Fix #2 — Tile cache shrink | `9805d1ca84be` | **REVERTED** (`4f3ca35bff0d`) | Aggressive per-frame eviction churned tiles, pinned main thread, made pen input feel laggy. Wrong design (frame-driven instead of idle-debounced). |
| Fix #3 — Offline tile cache | `d67a56ca304b` | **LIVE** | Working. SW tile intercept + silent L0-L2 auto-prefetch on project open + per-project 📡 Hub button for full deep-zoom download. |
| Fix #4 — Debug instrumentation removed | `9805d1ca84be` | **LIVE** | Clean. `/frt/debug/*` files deleted, SW precache entry removed. |

Current production state: commit `4f3ca35bff0d`, CSS `?v=219`, SW `arencon-frt-v187`, TILE_CACHE `arencon-frt-tiles-v1`.

**The iPad crash is NOT fixed.** Memory is back to pre-S96 (~176 MB peak on large drawings). Long sessions will still trigger Safari tab kill. That was supposed to be Fix #1's job — it didn't land properly.

---

## CRITICAL — DO THIS FIRST IN S97

**Before touching any code**, paste this diagnostic snippet into iPad Safari's console with a drawing open and send me the output. I use it to confirm which root-cause hypothesis for Fix #1's failure is correct, so v2 addresses the right problem:

```js
(function(){
  var mc = document.getElementById('markup-canvas');
  var wrap = document.getElementById('dv-img-wrap');
  var area = document.getElementById('dv-canvas-area');
  var img = document.getElementById('dv-image');
  var overlay = document.getElementById('drawing-viewer-overlay');
  var report = {
    overlay_visible: overlay ? getComputedStyle(overlay).display : null,
    overlay_open_class: overlay ? overlay.classList.contains('open') : null,
    area_present: !!area,
    area_w: area ? area.clientWidth : null,
    area_h: area ? area.clientHeight : null,
    wrap_transform: wrap ? getComputedStyle(wrap).transform : null,
    wrap_inline_transform: wrap ? wrap.style.transform : null,
    mc_present: !!mc,
    mc_parent_id: mc ? mc.parentNode.id : null,
    mc_buffer_wh: mc ? [mc.width, mc.height] : null,
    mc_css_wh: mc ? [mc.offsetWidth, mc.offsetHeight] : null,
    mc_dpr_attr: mc ? mc._dpr : null,
    img_natural: img ? [img.naturalWidth, img.naturalHeight] : null,
    img_displayed: img ? [img.offsetWidth, img.offsetHeight] : null,
    devicePixelRatio: window.devicePixelRatio,
    viewer_on_window: (window.Viewer && typeof window.Viewer.getViewState === 'function') ? 'yes' : 'no'
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
})()
```

What this confirms:
- `area_w: 0` → canvas allocated at 0×0 because layout hadn't completed (likely root cause → fix with ResizeObserver)
- `viewer_on_window: "no"` → `window.Viewer` unreachable from ES module context (likely secondary cause → fix with direct module import)
- `wrap_transform` → confirms the scale/pan the viewer is applying
- `mc_parent_id` and `mc_dpr_attr` → confirms fresh code is running, not a stuck cache

---

## Fix #1 v2 — Correct Plan

Architecture unchanged from what we agreed on: markup canvas at viewport × DPR, outside `dv-img-wrap`, viewer transform applied in render code.

What must change from v1:

### Canvas sizing (handle late layout)

- **ResizeObserver** on `dv-canvas-area` — primary trigger for allocation/reallocation
- When `Markup.init()` runs and viewport is 0×0, allocate a placeholder (e.g. 100×100), then reallocate correctly on first ResizeObserver callback
- Keep `orientationchange` as secondary trigger

### View state (seed correctly)

- Do **not** use `window.Viewer` — it's an ES module, not attached to window
- Add a named export `getViewState` on `viewer.js` OR access via already-imported `Viewer` object from the existing import
- Seed `_viewScale`/`_viewPanX`/`_viewPanY` in `_allocateCanvas()` AFTER canvas is real, BEFORE first `_renderAll()`
- `Markup.onTransform()` callback from `viewer._applyTransform()` — that path was correct in v1

### Staged rollout (ship in TWO separate commits with iPad verification between them)

**Commit A — DOM move + sizing only. Behavior preserved via CSS counter-transform.**
- Move `markup-canvas` out of `dv-img-wrap` into `dv-canvas-area`
- Size buffer to viewport × DPR with ResizeObserver
- Keep `_renderAll` at the ORIGINAL `setTransform(dpr, 0, 0, dpr, 0, 0)` math
- Apply CSS counter-transform so canvas visually stays overlaid on the wrap: `markup-canvas { transform: translate3d(panX, panY, 0) scale(scale) }`, updated via `Markup.onTransform()` callback
- **Expected result:** identical visual behavior to pre-S96, just with the canvas in a different DOM position and a viewport-sized buffer. If anything breaks here, it's the DOM/sizing path, isolated.

**Commit B — Switch to JS render transform. Remove CSS counter-transform.**
- Only after Commit A verified on iPad
- `_renderAll`: `setTransform(scale*DPR, 0, 0, scale*DPR, panX*DPR, panY*DPR)`, draw objects at drawing-space coords
- `_getPos`: reverse-map via current scale+pan
- Overlay draws (`_moveDraw`, polyline preview): same transform
- `_drawObjectMasked` offscreen buffer: same transform
- WebGL renderer: apply stage scale/pan (from v1's webglMarkup edit)
- **Expected result:** visually identical to Commit A but with JS transform path. Memory savings finally kick in.

The insight from v1's failure: **ship behavior-preserving changes first, then migrate the render math.** v1 did both at once, which hid where the bug actually lived.

---

## Fix #2 v2 — Plan (after Fix #1 v2 lands)

Idle-debounced eviction. Never fires during active pan/zoom.

Sketch in `tiledPdf.js`:

```js
var _MAX_TILES = _isIPhone ? 80 : (_isIPad ? 80 : 150);  // moderate, not aggressive
var _idleEvictTimer = null;

function _scheduleIdleEvict(levelIdx, colMin, colMax, rowMin, rowMax, lvl) {
  if (_idleEvictTimer) clearTimeout(_idleEvictTimer);
  _idleEvictTimer = setTimeout(function(){
    _idleEvictTimer = null;
    var margin = 2;
    var workingKeys = {};
    for (var c = Math.max(0, colMin - margin); c <= Math.min(lvl.cols - 1, colMax + margin); c++) {
      for (var r = Math.max(0, rowMin - margin); r <= Math.min(lvl.rows - 1, rowMax + margin); r++) {
        workingKeys[_tileKey(levelIdx, c, r)] = true;
      }
    }
    // Evict out-of-working-set tiles at this level only
    // ... (same eviction mechanics as v1 Fix #2, just inside the debounced closure)
  }, 500);
}
```

Called at end of `_renderVisible()`. Every new `_renderVisible` resets the timer. During continuous interaction the eviction never fires. When the user stops, 500ms later it runs once.

Memory savings: ~25-30 MB on iPad. Zero interaction-time lag.

---

## Suggested S97 execution order

1. **Run the diagnostic snippet on iPad** (2 min). Paste output back.
2. Design Fix #1 v2 Commit A based on actual data.
3. **Build + push Fix #1 v2 Commit A** (DOM move + sizing + CSS counter-transform). Verify drawings sharp + pen persists on iPad. ~30 min real-use test.
4. **Build + push Fix #1 v2 Commit B** (JS render transform). Verify no regression.
5. **Build + push Fix #2 v2** (debounced eviction). Verify memory down + no lag.
6. Close S97 with updated docs.

Less Q&A this time; more build-verify loops. Budget: 1-2 sessions depending on diagnostic findings.

---

## What went wrong in S96 (post-mortem)

1. **Too much scope in one session.** Four fixes shipped without iPad verification between them. When regressions surfaced, it was unclear which commit to revert.
2. **Missing iPad test in dev loop.** Validation was `node --check` only (syntax). No behavioral test. For architectural viewer/markup changes, insufficient.
3. **Small-looking code change was architecturally deep.** Fix #1 touched DOM + render transform + coordinate system + WebGL update in one commit. Safer version is the staged A/B above.
4. **No diagnostic-first approach.** Wrote the fix from handoff theory. When it failed I had nothing to debug with. Diagnostic snippet goes first next time.

**What worked:** Fix #3 (offline tile cache) shipped clean, no regressions, real user value. GitHub tree-API atomic commits made both reverts a 5-minute operation. Fix #4 cleanup is trivially correct.

---

## Still open / parked

1. Pin migration from S83 — 14 pins on legacy drawings. Independent of all above; doable any session.
2. AI Writing Assistant integration
3. Training Center / LMS
4. M365 migration
5. Native iOS app via Capacitor (capital expense)
6. Offline tile sentinel UX overlay (polish for Fix #3)

---

## S96 final commit log

| Commit | Status | Description |
|---|---|---|
| `11eb89937f85` | REVERTED | Fix #1 first attempt |
| `d67a56ca304b` | LIVE | Fix #3 offline tile cache |
| `9805d1ca84be` | PARTIAL | Fix #4 kept, Fix #2 reverted |
| `1fc3b2070456` | SUPERSEDED | Original handoff (pre-revert) |
| `d7becf13ca7a` | LIVE | Revert Fix #1 |
| `4f3ca35bff0d` | LIVE | Revert Fix #2 |

S97 opens against `4f3ca35bff0d`.
