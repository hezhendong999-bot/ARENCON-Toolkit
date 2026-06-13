# FRT PK DELTA — S318–S326
Append to ARENCON_FRT_PK.md. Canon changes only (patterns/rules future sessions must honour).

## §PDF — Page-1 dashboard (S318)
- Right dashboard box is the **Report Legend** (was Resolution Progress). 4 rows: High/Low/Closed/REC, scoped `.dash-key` compact pills (8.5pt, min-width 74px) reusing canon legend colours.
- Standalone `.rep-key` legend band renders ONLY in recs-'only' mode; full/compact get the legend inside the dashboard box. Do NOT re-add the band to full/compact (duplicate).
- Per-contractor completion bars retired from page 1 (dead-but-inert in code per S137 discipline).

## §Minimap — container sizing (S319→S320)
- NEVER aspect-lock the minimap CONTAINER (tried S319, reverted): grid-stretch cells gap, tall columns shrink the box.
- Drawing-pin editor box (`#pe-location-thumb`, `#pe-location-thumb-mobile`) = COLUMN context → `_PinPan.mount` applies a **height cap** (`boxW*aspect`, clamped < panel height) so wide drawings fill width and the box hugs vertically; leftover falls below.
- Card-editor box (`#cv-pe-location-thumb`) = stretch-GRID (`.cv-ed-body`) → NO cap (would gap the row); it intentionally stretches to track comment/photo growth.
- Minimap canvas background is **transparent** (S324) so letterbox slack shows the themed container bg (dark in dark mode), never white.

## §Mobile / safe-area (S321, S322)
- `window._frtScrollLock(on)` — refcounted iOS-safe body-freeze (position:fixed + negative top). Call on EVERY full-screen modal open/close. Pin editor wired; reuse for new modals.
- **Safe-area convention (tool-wide):** main header pads `max(<base>, env(safe-area-inset-top,0px))` top + inset-left/right sides. Define `.safe-top`/`.safe-bottom`/`.safe-x` utilities (mobile-only @media 768px). New full-screen modals get `.safe-top`; portrait footers get `.safe-bottom`. env()=0 on desktop → always safe. Applied: FRT, Diesel, Electric, Hub. STILL TODO: IST, OBC, DD, Training ×2, Resource Planner, Intranet, Org Chart, Trapeze, Onboarding, portal.
- Mobile pin-editor modal uses `100dvh` (NOT 100vh — vh includes URL-bar zone → bottom cutoff).

## §Pin teardrop (S321)
- The static minimap teardrop is now a **Path2D** of the canonical on-drawing geometry (32×42 viewBox, tip (16,40), head (16,14), white disc r=11). Identical to `_PinPan` SVG and pinsGL.js drawing pin. Do not revert to the old arc+bezier blob.
- Teardrop priority precedence (minimap + drawing): closed(#5F8068) > rec(#5E5440 brown) > site(#6B6FA8) > IAR(#FF69B4) > priority(low #B07F5A / high #A85959). **KNOWN BUG B1:** rec shows red because `d.isRecommendation` is false for rec pins here — rec status likely lives per-observation; trace before fixing.

## §_PinPan interaction (S321, S326)
- Two-finger pinch zoom added (zooms around pinch midpoint, floor at Fit). Single-touch/mouse fall through to pin-grab/pan.
- Portrait mobile thumb mounts interactive `_PinPan` (was static).
- Window mousemove/mouseup delegate to `_PinPan._onMove`/`._onUp` (current mount) — do NOT bind a per-mount closure directly to window once (stale after re-mount → drag/zoom dies).

## §Keyboard (S326)
- Global viewer keydown (Arrow page-flip, +/-/0 zoom) MUST bail when `e.target` is INPUT/TEXTAREA/SELECT/contentEditable. Else it hijacks typing in comment fields.

## §Badges (S324)
- Photo badges AND card round-badges ALWAYS show obs letter ("1A","2A") even single-obs (uniform width). PDF item labels UNCHANGED (single-obs stays "2" in reports per Mark).
