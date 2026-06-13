# FRT HANDOFF — Sessions S318–S326
**Branch:** main · **Repo:** hezhendong999-bot/ARENCON-Toolkit · **Latest mine:** `ac97bc8` (S326)
**Read FIRST. Verify SHIPPED claims against live HEAD blob SHAs, not this prose.**
Concurrent Training/Hub writers interleaved commits (Sessions 332–335) — those are NOT this workstream.

---

## SHIPPED THIS SESSION (verified byte-match at push)

| S | Commit | Area | Change |
|---|--------|------|--------|
| S318 | `391cd47` | PDF | Page-1 dashboard: **Resolution Progress box → compact Report Legend** (4 rows High/Low/Closed/REC, scoped `.dash-key` pills). Per-contractor bars removed from page 1 (dead-but-inert). Standalone legend band dropped in full/compact assembly; KEPT in recs-'only'. Inspector-initials row dropped from page 1 (Mark's call). |
| S319→S320 | `04709ce`→`8bc65ea` | viewer/CSS | Minimap slack. S319 aspect-lock attempt REVERTED (broke card-editor grid → gap; shrank pin-editor box → tiny drawing). Replaced (S320) with **column-safe height cap** on drawing-pin editor box only (`#pe-location-thumb` / `#pe-location-thumb-mobile`); card editor (`#cv-pe-location-thumb`, stretch-grid) deliberately excluded. |
| S321 | `5979d9a` | viewer/CSS | Mobile pin-editor: `.pin-editor-header` safe-area-inset-top + 44px close tap target + `100dvh` modal + footer inset-bottom; tool-wide **`window._frtScrollLock`** (refcounted, iOS body-freeze) on editor open/close; static minimap teardrop → canonical drawing-pin **Path2D**; **two-finger pinch-zoom** in `_PinPan`; portrait mobile thumb now mounts interactive `_PinPan` (pinch+drag). |
| S322 | `593caa0` (FRT) + `8fe9b35` (Diesel/Electric/Hub) | CSS | **Tool-wide safe-area root fix.** Grouped mobile rule pads every top-anchored header/overlay/drawer; `.safe-top`/`.safe-bottom`/`.safe-x` utilities = standing convention. Applied to FRT, Diesel, Electric, Hub (main header `.header-top`/`.hdr` carries inset). |
| S324 | `549f351` | photos/defic/viewer/CSS | Photo badges + card round-badges **always show obs letter** ("1A","2A") even single-obs (PDF left as-is per Mark). Drawing-viewer pin editor **centers vertically** (`.pe-drawing-panel justify-content:center`). Deficiency-log minimap canvas bg `#f5f5f5`→**transparent** (letterbox slack matches themed dark box). |
| S325 | `b874156` + doc commits | defic/docs | Removed S323-DBG re-sort instrumentation (re-sort CONFIRMED FIXED by Mark). Refreshed **FRT_OPEN_ITEMS.md** to code-verified state. |
| S326 | `ac97bc8` | viewer | (1) Global viewer keyboard shortcuts (Arrow page-flip, +/-/0 zoom) now **skip when focus is in input/textarea/select/contenteditable** — left-arrow in a comment was flipping the drawing page + losing caret. (2) `_PinPan` window mousemove/mouseup were bound once to the **first mount's stale closures** → mouse drag/zoom died after 2nd editor open; now delegate to current mount's handlers via `_PinPan._onMove`/`._onUp`. |

**Versioning at session end:** SW `arencon-frt-v783`, `frt.css?v=621`.

---

## OPEN BUG QUEUE (reported by Mark, NOT yet fixed — next session)

| # | Bug | First lead |
|---|-----|-----------|
| B1 | **Rec pin teardrop still RED, should be brown (#5E5440).** | viewer.js ~L2536 + pinsGL.js L85 ALREADY use brown for `d.isRecommendation`. So the rec flag is NOT on `d.isRecommendation` for these pins — likely per-OBSERVATION status, not top-level. Trace the rec data-model (status vs flag, obs-level) before patching; wrong guess mis-colours other pins. |
| B2 | **Markup on photos drags the photo** (should draw, not move). | Touch/pointer handler conflict in the photo markup/lightbox — markup tool's pointer events not suppressing the image drag/pan. |
| B3 | **Deficiency card flashes when dragging pin in minimap.** | `_PinPan` pin-drag onMove calls a full card re-render (`_frtRenderDefic`) on every move or on up; the flash = full innerHTML swap. Throttle / patch-in-place instead of full render during drag. |
| B4 | **Appendix item numbers out of order** (PDF). | pdf.js appendix (A/B) Item column ordering — items not sorted by item# before render. |
| B5 | **Photo lightbox selection feature doesn't work.** | Lightbox multi-select (the Select-all / per-photo select) — handler not wiring or selection state not applied. |

All 5 deferred because context budget was low at session end; each needs careful tracing (B1/B2/B3 touch protected drag/markup/photo code where rushed patches regress — cf. S319).

---

## FRT OPEN ITEMS (post-S326, from FRT_OPEN_ITEMS.md `cda0619`)
1. Hub Bold rollout (L, own session)
2. Safe-area: remaining tools — IST, OBC, DD, Training ×2, Resource Planner, Intranet, Org Chart, Trapeze, Onboarding + toolkit portal (BLOCKED on repo path: root index.html is the Tablet Rescue diagnostic, NOT the portal)
3. PK/docs consolidation (M)
PLUS the 5 open bugs above.

**Cleared as phantom this session:** donut "new this report" (LOCKED S284, hidden-when-all-new is intended); not-additive footnote (Mark removed S317); rec item-# numbering (locked S317); filter-row (inspected S325, responsive handling already present).

---

## KEY LEARNINGS THIS SESSION
- **Aspect-locking a container fights its parent layout** (S319): grid-stretch cell → gap; tall column → shrunk box. Don't pin container aspect; cap height in column contexts only, leave stretch-grids alone.
- **Stale-closure window listeners** (S326): binding window mousemove/up once to a per-mount closure breaks after re-mount. Delegate to a stored current-handler ref.
- **Global keyboard shortcuts MUST guard for editable focus** — else they hijack typing (data-loss risk).
- **Safe-area is per-file** for standalone tools (each single-file HTML needs its own `.header-top`/header inset + `.safe-*` utilities). Convention now standing; propagated to FRT/Diesel/Electric/Hub.
- **Verify "open" items against live code before working** — 4 of the listed FRT "open" items were already done/locked. FRT_OPEN_ITEMS.md is now the code-verified source of truth.
