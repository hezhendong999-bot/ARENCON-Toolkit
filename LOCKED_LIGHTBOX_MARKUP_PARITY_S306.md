# LOCKED — Lightbox Markup Parity (Select / Rotate / Resize + Opacity + MS-Paint Text)

**Status:** BUILT & LIVE (FRT). Select+Opacity shipped S306 (`47ffb75`); MS-Paint text tool shipped S(this session).
**Owner files:** `frt/js/viewer/markupEngine.js` (engine), `frt/js/ui/lightbox.js` (toolbar).
**Do NOT re-derive the source-of-truth decision below. Do NOT mount `markup.js` in the lightbox.**

---

## THE DECISION (why each half comes from where)

The photo-lightbox markup engine is `markupEngine.js` — an **object-based** engine
(`strokes[]` of `{id, tool, color, size, opacity, pts[], text?, rotation?}`,
`redoStack`, `attach()`, four-pass `_render`). It is the engine the FRT lightbox
already saves marked photos through. Two capabilities were missing vs other surfaces;
each was sourced from the surface that already had it RIGHT:

| Capability | Sourced from | Why |
|---|---|---|
| **Select / move / resize / rotate** | Drawing viewer `markup.js` (~1470–2570) | Object-based, full handle UI, daily-proven. Ported VERBATIM (math, handle sizes, hit tolerances). |
| **Opacity** | Diesel checklist inline engine | Diesel already had the ± stepper + per-stroke alpha + highlighter multiply. Matched its UX. |
| **MS-Paint text tool** | Built fresh in `markupEngine.js` | Old `_textPrompt` was broken (offset box, white fill, "Type, Enter" hatch). New one is the reference for the other two surfaces. |

**`markup.js` was explicitly REJECTED as a lightbox engine** (161KB, welded to the
viewer DOM). We extend `markupEngine.js` instead. This is settled — do not revisit.

---

## 1. SELECT ENGINE (S306) — identical behaviour to the drawing viewer

State on the engine: `_selectedIds[]`, `_dragState`, `_rubberBand`.
`setTool('select')` enters select mode; switching to any other tool clears selection.

**Handle UI (drawn each `_render` in select mode, `_drawSelection`):**
- Dashed `#2196F3` group box, pad 6, lineWidth 2, dash [5,4]
- 4 corner resize handles: 11px white squares, blue 1.5px stroke, hit tolerance ±11
- Rotate handle: white circle r9 at `(cx, boxTop−24)`, stem line + arc-arrow icon
- Delete: red `#E53E3E` circle r9 with white ✕, top-right outside box
- Rubber-band drag-select (dashed blue, [4,3]); group model via `_selectedIds[]`
- Ctrl/Cmd-click toggles membership

**Transforms (verbatim math from markup.js):**
- **Move:** translate all `pts` by drag delta.
- **Resize:** scale about the OPPOSITE corner; `size` scales too; `s = max(0.1,(sx+sy)/2)`.
- **Rotate:** about group-bounds center.
  - pen/highlight → rotation BAKED into points (points are the visual AABB).
  - shapes (line/rect/circle/arrow) → store `obj.rotation`, render `ctx.rotate` around bbox center.
  - text → store `obj.rotation`, render rotates around visual center `(x+estW/2, y−fs/2)`.
  This matches the drawing viewer exactly (non-destructive for shapes/text).
- **Delete:** Delete/Backspace key (lightbox keydown) → `MarkupEngine.deleteSelection()`,
  or the red ✕ handle.
- All mutations go through the existing undo/redo (`_onDirty` fires).

Bounds helpers ported: `_strokeBounds` (rotation-aware AABB for shapes/text;
points-AABB for pen/highlight), `_groupBounds`, `_hitStroke` (±6 pad),
`_hitResize`, `_hitRotate` (≤14), `_hitDelete` (≤12).

## 2. OPACITY (S306) — Diesel-style, never stacks

- Per-stroke `opacity` (0.1–1) stamped at commit from `MarkupEngine.opacity`.
- `setOpacity(v)` updates current draw opacity AND live-applies to current selection.
- `setColor` also live-applies to selection (`_applyToSelection`).
- **Highlighter:** grouped by opacity value; each group composites ONCE at
  `hlAlpha * groupOpacity` (offscreen composite). NEVER stack opacity — locked rule,
  same as markup.js `0.3 * grp.opacity` and Diesel `alpha*0.55`.
- Pen/shapes/text: per-object `globalAlpha = opacity` at render and in `saveBlob`
  (baked at natural resolution so the saved marked photo matches the screen).
- **Toolbar UI:** ± stepper (`−  100%  +`), 10% steps, clamp 10–100% — mirrors Diesel,
  glove-friendlier than a slider. Placed after the Size control in `_buildMarkupBar`.

## 3. MS-PAINT TEXT TOOL (this session) — replaces the broken `_textPrompt`

The old input was `position:absolute` vs `canvas.parentNode` (landed offset from the
click), had a near-white fill + dashed box + "Type, Enter to commit" placeholder.
The NEW tool:
- Input is `position:fixed`, placed at the EXACT click point via
  `canvas.getBoundingClientRect()` (screenX/Y = rect + logical coord × scale; scale=1
  because markup forces fit-scale so logical px == CSS px). Baseline-anchored.
- **Transparent background, no border box, no hatch** — what you type IS the live
  preview, in the current colour and `size*4` font. Faint 1px colour tick marks an
  empty field so it's locatable.
- **Enter** or **click/tap outside** commits; **Escape** cancels.
- Draggable while active (Shift-drag or grab the left ~10px edge; logical anchor
  recomputed on drag). Secondary feature — committed text is also movable via the
  Select tool, which is the primary reposition path on tablets.
- Commits a normal text stroke `{id, tool:'text', pts:[{x,y}], text, color, size, opacity}`
  → fully selectable / movable / rotatable / opacity-adjustable by §1–§2.

---

## TOOLBAR (`_buildMarkupBar` in lightbox.js)
Tool row order (locked): **Pen · Highlight · Line · Rect · Oval · Arrow · Text · Eraser · Select**
| sep | Undo · Redo | sep | swatches | Size | Opacity(±) | sep | Save · Clear · Revert · ✕
- Select button placed AFTER Eraser (groups with tool-selection cluster — Mark approved placement).
- Save path (marked R2 upload via `frt-markup-saved` event) UNCHANGED by all of the above.

## VERSION DISCIPLINE (applied)
- SW `CACHE_NAME` bumped (S306: v754→v755). `markupEngine.js?v=` bumped on every push touching it (S306: 4→5).
- CSS `?v=` bumped lockstep with SW per discipline even when CSS unchanged.
- `markupEngine.js` AND `lightbox.js` are both SW-precached; `lightbox.js` loads via
  `import './ui/lightbox.js'` in app.js (no `?v=` — SW cache is its bust).

---

## DIESEL PORT SPEC (handed to the Diesel workstream — their file, their build)
Diesel's inline engine is **raster** (ImageData snapshots for undo), NOT object-based.
It has opacity already but NO Select. To get Select/rotate/resize in Diesel you must
FIRST give its engine an object model (`strokes[]` with ids), then port §1 verbatim.
Diesel-unique categories (Checklist, Deficiencies, General, Flow Test, Records) and its
existing opacity stepper stay. The FRT `markupEngine.js` §1–§3 implementation is the
reference. The MS-Paint text tool (§3) should also replace Diesel's `_aPrompt`-based
text (prompt dialog → inline at click point). This is NOT an FRT task.

## ALSO PENDING (not built here)
- Port the MS-Paint text tool (§3) into the DRAWING VIEWER `markup.js` text tool —
  **DONE (S310):** both `_handleTextPlace` (create) and `_editTextObject` (edit) now use
  the bare zoom-aware MS-Paint input (`.mk-text-paint`, transparent, no box/hatch,
  position+font scaled to current viewer zoom). CSS `.mk-text-paint` variant added.
- Diesel Select port — still pending (Diesel engine needs an object model first).

## CONTRACTOR HIGHLIGHT MODE — BUILT (S310)
Per `LOCKED_CTR_HIGHLIGHT_LAYERS_S284.md`. Radio group "HIGHLIGHT CONTRACTOR" in the
SHOW popover (`#dv-layers-menu`), populated from the LIVE roster each time the popover
opens. Selecting a contractor dims non-matching pins to 0.22 (× base alpha; reduced
shadow `drop-shadow(0 1px 2px rgba(0,0,0,.2))`); "All pins" resets. Per-session view
lens in `pinsGL.js` (`_highlightCtrId`, `setHighlightContractor`/`getHighlightContractor`),
NEVER persisted/synced. Resets to all on viewer close (`initViewer.close` →
`_frtResetCtrHighlight`); kept across drawing switches. Pins carry `contractorId`
(threaded onto glPin in viewer.js `_renderPins`).
**Green closed pins CONFIRMED & BUILT:** `GREEN_CLOSED=true` → closed pins fill
`#5F8068` (isClosed check first in `_priorityFillHex`). To revert, flip `GREEN_CLOSED=false`.
