# Shared Markup Tool-Definitions — Plan (drawing viewer = canonical template)

**Created:** July 2026
**Scope (narrow, deliberate):** Extract the markup TOOL DEFINITIONS (tool list, shape set,
shape-drawing functions) into one shared module that all markup surfaces import, so the tools
can never drift again. NOT an engine merge. Each surface keeps its own engine, rendering, and
persistence. **The drawing viewer is the canonical template — everything conforms to it.**

**Mark's requirements (verbatim intent):**
- Unify the tools that ALREADY exist in both (pen, highlight, shapes, text, eraser, select,
  undo/redo, size, opacity, colour, delete). Edit once → all surfaces update.
- NOT everything is shared. `dimension` stays drawing-viewer-only. If it (or any tool) is ever
  promoted to the lightbox, it ports FROM the drawing viewer — never redesigned (no drift).
- Don't lose what exists. No revamp. Preserve current behavior exactly.
- Drawing viewer is the template (source of truth).
- Save / trash / Revert stay per-surface (they mean different things per surface).

---

## The drift, mapped (why this is needed)

Three surfaces, three vocabularies for the SAME shapes — Mark hand-matched them; they've drifted:

| Shape | Drawing viewer (CANONICAL) | FRT lightbox | Diesel lightbox |
|---|---|---|---|
| rectangle | `rect` | `rect` | `square` ⚠ |
| filled rect | `fillrect` | `rect-fill` ⚠ | `square-fill` ⚠ |
| circle | `circle` | `circle` | `circle` ✓ |
| filled circle | `fillcircle` | `circle-fill` ⚠ | `circle-fill` ⚠ |
| triangle | `triangle` | `triangle` | `triangle` ✓ |
| filled triangle | `filltriangle` | (none) | (none) |
| arrow / line / cloud | `arrow`/`line`/`cloud` | same ✓ | same ✓ |
| dimension | `dimension` (viewer-only) | — | — |

Add a "heart" today = edit 3 files with 3 naming conventions, hope they match. That is the bug.

---

## Architecture — a shared tool-definitions module (small, pure)

Create **`lib/ui/markupTools.js`** — the canonical definitions ONLY:

- `TOOLS` — the shared tool list (pen, highlight, eraser, text, select, + shapes). NOT dimension.
- `SHAPE_TOOLS` — the canonical shape set, using the DRAWING VIEWER's names
  (`rect`, `fillrect`, `circle`, `fillcircle`, `triangle`, `filltriangle`, `arrow`, `line`, `cloud`).
- `drawShape(ctx, type, x1, y1, x2, y2)` — the canonical shape renderer, lifted verbatim from the
  drawing viewer's `_drawShapeObj` + `_drawCloudObj`. Pure canvas drawing; no coords/persistence.
- `SHAPE_ALIASES` — backward-compat map so OLD saved markup still renders:
  `square→rect`, `square-fill→fillrect`, `rect-fill→fillrect`, `circle-fill→fillcircle`.
  Never delete an alias (old reports depend on them).

**What it does NOT contain** (stays per-surface): canvas/coord systems, pan/zoom, WebGL, tile
logic, selection hit-testing plumbing, persistence (Save/trash/Revert), the never-bake model.

**Import direction (the "not vice versa" rule enforced structurally):**
- Drawing viewer: its `_drawShapeObj`/`_drawCloudObj` MOVE into `markupTools.js` (it's the source);
  the viewer imports them back. Zero behavior change — same code, new home.
- FRT lightbox + Diesel lightbox: DELETE their own shape lists/draw functions; import from
  `markupTools.js`. They normalize their stored tool names through `SHAPE_ALIASES` on load/draw.
- `dimension` stays in the drawing viewer's own code — NOT in `markupTools.js` — until Mark
  promotes it. When promoted, it moves INTO `markupTools.js` (from the viewer), so it can't drift.

Result: add a shape (heart, star, cloud v2) = edit `markupTools.js` ONCE → all three surfaces
draw it, identically named. Dimension stays viewer-only by simply not being in the shared list.

---

## Naming reconciliation (the one real data decision)

Canonical = drawing viewer names. The lightboxes adopt them. Old markup keeps working via aliases:

- Diesel `square` → canonical `rect` (alias `square`→`rect` kept forever)
- Diesel/FRT `square-fill`/`rect-fill` → canonical `fillrect` (aliases kept)
- `circle-fill` → canonical `fillcircle` (alias kept)

On load, each lightbox maps any legacy name through `SHAPE_ALIASES` before drawing. Newly-created
markup uses canonical names. **No existing report breaks** — aliases guarantee old strokes render.

---

## Phased plan (each phase staging + field-verify, per Mark's rules)

### Phase 1 — Create `lib/ui/markupTools.js` from the drawing viewer (canonical)
- Lift `_drawShapeObj` + `_drawCloudObj` + the shape list verbatim into `lib/ui/markupTools.js`.
- Point the drawing viewer at it (import back). **Zero behavior change** — same code, new location.
- Field-verify: FRT drawing-viewer markup (all shapes, on a real site plan) unchanged.
- Risk: LOW (identical code relocated).

### Phase 2 — FRT lightbox imports the shared definitions
- Replace FRT lightbox's `SHAPE_TOOLS` + shape draw with imports from `markupTools.js`.
- Add alias normalization for its `rect-fill`/`circle-fill` legacy names.
- Field-verify (staging FRT): lightbox photo markup — every shape draws identically; old marked
  photos still render.
- Risk: LOW-MEDIUM.

### Phase 3 — Diesel lightbox imports the shared definitions
- Diesel is single-file, so `markupTools.js` is inlined at build/deploy OR loaded as a sibling
  script (decide in-phase; sibling script is cleaner given Diesel already loads from same origin).
- Replace Diesel's `_isShape` + shape draw with the shared definitions; map `square`/`square-fill`
  through aliases so existing Diesel reports render unchanged.
- Field-verify (Diesel STAGING file + throwaway project): every shape draws identically; existing
  markup on old photos still renders; Save/revert unchanged.
- Risk: MEDIUM (Diesel is single-file + live field tool — staging-first, same as phantom-delete).

### From then on
- Add/modify a shape or shared tool → edit `lib/ui/markupTools.js` once → all three surfaces update.
- Promote `dimension` (or any viewer tool) to lightbox → move it from the viewer INTO
  `markupTools.js`; both lightboxes inherit it. No redesign, no drift.

---

## Explicitly NOT in scope

- Merging the three engines (rendering, selection plumbing, persistence stay per-surface).
- Sharing Save/trash/Revert (per-surface by design).
- Bringing `dimension` to the lightboxes now (stays viewer-only until Mark asks).
- Any visual/behavior change (this is a de-drift refactor; inspectors see nothing different).
- Unifying lightbox CHROME/toolbar layout (separate, later, optional).

---

## Next step
Phase 1: build `lib/ui/markupTools.js` from the drawing viewer's shape code (verbatim), wire the
drawing viewer to it on a staging FRT copy, Mark field-verifies drawing-viewer markup is unchanged.
Nothing else touched until that's confirmed.
