# HANDOFF — SESSION 97

**Session 96 end state:** Production at three sequential commits:

| Commit | Title |
|---|---|
| `11eb89937f85` | Session 96 FIX #1: Markup canvas viewport-sized (saves ~40MB on iPad) |
| `d67a56ca304b` | Session 96 FIX #3: Offline tile cache (SW Cache API + auto L0-L2 + Hub Download for Offline) |
| `9805d1ca84be` | Session 96 FIX #2 + #4: Tile cache shrink to visible+margin (saves ~30MB) + remove S95 debug instrumentation |

CSS `?v=217`, SW `arencon-frt-v185`, separate tile cache `arencon-frt-tiles-v1` (long-lived).

S96 SHIPPED ALL FOUR FIXES. The architectural surgery the handoff called for is complete. Total memory savings on iPad: ~70 MB (~176 MB → ~106 MB). Offline support is real for the first time in v2 (auto L0-L2 silent prefetch + manual full-pyramid Download for Offline button on Hub).

---

## CRITICAL VERIFICATION — DO THIS BEFORE S97 WORK

Mark must verify on iPad in this order. Anything failing = revert that specific commit (each fix is its own atomic commit).

### Fix #1 verification (markup viewport canvas — highest risk surface)

Open any drawing on iPad iOS 16+. Test each:

1. **Pen tool** — draw a stroke at fit zoom. Pinch-zoom in 2-3 levels. Stroke must stay anchored to the same drawing-space position. Pan around. No ghost trails.
2. **Highlight tool** — draw 2-3 overlapping yellow highlights. Verify they composite at uniform 0.3 opacity (not stacking darker). Zoom in/out — opacity must stay uniform.
3. **Shapes** — rectangle, circle, arrow, triangle, cloud. Each at different zoom levels. Rotation handles work? Selected shape transforms correctly?
4. **Text** — place a text annotation. Zoom in — text must scale with zoom (it lives at drawing-space coords). Edit existing text — input box should appear at the click position.
5. **Eraser** — erase part of a pen stroke and part of a highlight. Both should use the offscreen-composite mask path correctly.
6. **Select + drag** — select a shape, drag it to new position. Position must remain consistent after zoom/pan.
7. **Polyline** — draw a multi-point polyline. Click near first point to close. Preview line during placement should track cursor at any zoom.
8. **Pin tap** — drop a pin on the drawing. Tap an existing pin. Both must work whether a markup tool is active or not.
9. **Two-finger pinch mid-stroke** — start drawing a pen stroke, then pinch-zoom while drawing. Stroke should re-render at the new zoom (this was an explicit code path; verify it doesn't crash or freeze).
10. **Memory check** — open the same large drawing 3-5 times in a row, draw markup each time, close. iPad should NOT crash or reload Safari. (Old behavior: crash around the 3rd-5th open.)

If anything fails: `git revert 11eb89937f85` and report what broke.

### Fix #2 verification (tile cache shrink)

1. Open a tiled drawing. Pan around aggressively. Tiles should keep streaming smoothly. **Brief flash when tiles re-fetch is acceptable** (eviction trade-off, ~100-200ms per tile from R2/CDN).
2. Zoom in deep, then zoom back out. Some tiles will re-fetch (they were evicted). Should not result in blank/black gaps lasting more than ~1 second.

### Fix #3 verification (offline tile cache)

**Online auto-prefetch:**
1. Open a project on Wi-Fi. Within 1-3 seconds you should see a small bottom-right indicator: *"Caching offline tiles… 1/N"* counting up.
2. After it completes, indicator shows *"✓ Offline ready"* then fades.

**Hub manual full download:**
1. On Hub, find a project. There should be a 📡 icon next to the 📥 export icon on each project card.
2. Tap 📡. Confirmation modal asks if you want to download — confirm.
3. Progress modal shows "Drawing 1/N — XXX/YYY tiles (XX%)" with a progress bar.
4. Try the "Run in background" button — modal closes, download continues, toast appears when done.
5. Try the Cancel button — partial cache is kept (no data loss).

**Offline test:**
1. After auto-prefetch (or manual download), turn iPad to Airplane mode.
2. Open the same project. Drawings should render at fit-to-screen and at moderate zoom (L0/L1/L2 for auto; all levels for manually-downloaded).
3. Try to deep-zoom into a sprinkler symbol on an auto-only drawing — at L3/L4 zoom, you'll see a tiny placeholder (transparent 1px PNG sentinel from SW). This is the graceful "need signal at this zoom" fallback.

### Fix #4 verification (debug cleanup)

1. Open `https://hezhendong999-bot.github.io/ARENCON-Toolkit/frt/?dbg=1` — should NOT load the debug instrumentation. Console should be clean (no `[INSTR]` log lines).
2. The `/frt/debug/` folder should not be browsable (404 on GitHub Pages for any of those paths).

---

## S96 COMMIT LOG (audit trail)

| # | Commit | Files | Lines |
|---|---|---|---|
| 1 | `11eb89937f85` | markup.js, viewer.js, webglMarkup.js, frt/index.html, sw.js | ~280 changed |
| 2 | `d67a56ca304b` | sw.js, frt/js/data/tileCache.js (NEW), frt/js/app.js, ARENCON_Project_Hub.html | ~330 added |
| 3 | `9805d1ca84be` | tiledPdf.js, frt/index.html, sw.js (+ DELETED frt/debug/{diag.html,instrument.js,reset.html}) | ~50 changed, 3 files deleted |

---

## KNOWN CAVEATS & THINGS TO WATCH

### iOS background download limit
Hub "Download for Offline" requires the app to stay foregrounded. If user backgrounds Safari mid-download, JS execution stops within ~30 seconds. The "Run in background" button is misleading on iOS — it just hides the modal but doesn't actually run the download in OS-level background. The progress modal text warns about this explicitly. **Future work:** integrate Background Fetch API for Android TWA only (iOS has no equivalent without Capacitor native shell).

### Tile re-fetch latency on aggressive zoom-back
Fix #2 evicts tiles outside the visible+1-margin rect immediately. If user zooms in, then back out within a second, tiles will re-fetch from R2 (cached at Cloudflare CDN edge, so ~100-200ms each). Pan within a single zoom level is unaffected. If this proves too aggressive, restore the bigger _MAX_TILES (e.g. iPad: 30 → 60) — this is a tunable, not a structural choice.

### Auto-prefetch silently skips drawings without a manifest
The L0-L2 auto-prefetch only runs for drawings flagged as tile-mode (`d.manifestUrl || d.tileServer || d.pdfTiled || d.serverRendered`). Image-only drawings (legacy single-JPEG) already have full offline support via the existing IDB blob path — no change needed for those.

### Sentinel response for missing offline tiles
SW returns a 1×1 transparent PNG (status 504, header `X-Offline-Sentinel: 1`) when a tile is requested offline and not in cache. The browser displays nothing visible at that tile location (transparent gap). The viewer doesn't currently render a "need signal" overlay — the gap itself is the indicator. **Future polish:** intercept image onerror/onload and show a small message banner once per session per drawing.

### CSS `?v=217` and SW `v185` cache stickiness
Standard mobile-emulation caveat applies. If iPad shows old behavior after deploy, check `application → service workers → update on reload` then full reload. If `css_loaded_v` reads anything other than `217` in the diagnostic, force `clear site data`.

---

## STILL OPEN / PARKED

1. **Pin migration from S83** (14 pins on legacy drawings) — still pending. Can be tackled in S97 or later.
2. **Native iOS app via Capacitor** — only thing that solves the iOS background-download limit. Requires Mac (~$300-700) + Apple Dev ($99/yr). Wait for principal approval after S96 stability is proven in field use.
3. **AI Writing Assistant** integration — scoped, not started.
4. **ARENCON Training Center / LMS** — scoped, not started.
5. **M365 migration** — parallel cutover plan, not yet started.
6. **iPad/iPhone "need signal at this zoom" overlay** — small UX polish for offline gaps (see caveats above).

---

## SUGGESTED S97 SCOPE (in priority order)

1. **Verify all S96 fixes on iPad in real field-like use** (1 hour). If any fail, revert just that commit and re-investigate in isolation.
2. **Pin migration from S83** (1-2 turns). 14 pins on legacy drawings need to migrate to the new pin storage shape. Should be straightforward DB script.
3. **Polish: offline tile sentinel overlay** (1 turn). Detect SW sentinel response in the tile viewer and render a subtle "Zoom limited — connect for deep detail" banner.
4. Anything else from the parked list, in any order.

---

## SESSION 96 META

**Sessions consumed in scope alignment Q&A:** ~8 turns. Worth it — caught two design errors before any code was written:
- Auto-download was previously discussed as fully-automatic-everything; tile-era reality (100-200× larger payload) needs the hybrid auto-L0/L1/L2 + manual deep-zoom design, gated per-project to avoid surprise cellular data costs.
- Initial Approach B for Fix #1 (aggressive cap on drawing-sized canvas) would have made markup strokes blurry at high zoom — rejected by Mark, correctly. Approach A (viewport-sized canvas) was the right architectural choice.

**Lesson for future sessions:** when the handoff calls for "architectural" changes, confirm the user-visible behavior before touching code. A wrong implementation that compiles is more expensive to undo than 5 turns of clarification.

**No Style Guide changes this session.** S94 delta still stands at v119. Next bump expected when AI Writing Assistant or Training Center introduces shared cross-tool patterns.

**No Project Knowledge breaking changes this session.** A delta document `PROJECT_KNOWLEDGE_DELTA_S96.md` will append to `ARENCON_Project_Knowledge.md` documenting the new tile cache architecture (cache name, postMessage protocol, prefetch tiers).
