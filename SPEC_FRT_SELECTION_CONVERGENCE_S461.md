# SPEC — FRT DRAWING-VIEWER SELECTION CONVERGENCE (STEP 2 SURGERY)
**Locked S461. Foundation: `frt/js/viewer/markupSelBridge.js` v1.0.0 (live, 55/55 green).**

The drawing viewer (`frt/js/viewer/markup.js`, 5,226 lines, SACRED — authorization
granted S461) adopts the shared selection engine the same way the FRT lightbox did
at S459: **in-memory model = engine strokes; persisted v1 format byte-unchanged.**

---

## 0. GROUND TRUTH AT SPEC TIME
- `markup.js` blob `8a9ad3405f` — untouched.
- Bridge proven against verbatim oracles: round-trip byte-exact (key order included),
  `aabb` == `_getBounds`, `applyRotate` == the S331g rotate-drag handler to 1e-9,
  `logOp` == `_pushHistory(); _markDirty();`.
- Blast radius CONFIRMED to include two files beyond markup.js:
  `frt/js/viewer/webglMarkup.js` (24,351 B — reads v1 geometry) and the
  `window._dimTool` module (dimension renderer — receives raw objects).

## 1. THE MODEL FLIP (what "in-memory = engine strokes" means)
Objects in `_objects` become bridge strokes: `{id, type, tool, _v1type, _v1keys,
pts, color, size, …, rotation?}`. `type` REMAINS (immutable metadata — every
`obj.type === '…'` check in the file keeps working untouched). Only GEOMETRY
access changes: `points` → `pts`; shape `x1..y2` → `pts[0]/pts[1]`; text `x1,y1`
→ `pts[0]`; dimension `mx1..my2` → `pts[0]/pts[1]`.

## 2. SITE INVENTORY (line numbers = blob 8a9ad3405f)

### 2a. Boundary — objects enter/leave memory (toStroke / toV1)
| Site | Line | Edit |
|---|---|---|
| `_loadMarkup` reset | 3817 | (empty init — no change) |
| R2 load | 3883 | `_objects = blob.objects.map(toStroke)` |
| IDB load | ~3927+ | same mapping (locate the assignment inside) |
| `_saveMarkup` | 3725 | serialize `_objects.map(toV1)` — find every stringify of `_objects` in it |
| undo restore | 1113 | snapshots hold stroke-model → **no conversion** (stack reset on load) |
| redo restore | 1127 | same |
| split-eraser rebuild | 1904 | `_objects = next` — next built from stroke fragments → keep stroke-model (see 2c) |

### 2b. Creation sites — 7 pushes become `_objects.push(toStroke({…v1 literal…}))`
Lines: **2138** (copy — replaced by engine clone, see 2e), **2400**, **2714**
(shape commit), **2750**, **2766**, **2938**, **3163**. Wrapping the existing v1
literals in `toStroke()` is the minimal-diff form and guarantees consistency.

### 2c. Geometry reads — the mechanical pass
- `.points` — 36 refs; each classified: object-geometry → `.pts`; eraserMask
  `.points` STAYS (mask format unchanged — the bridge rotates masks with
  `points`, matching the persisted mask shape).
- `.x1/.y1/.x2/.y2` — ~50 refs; classify per site: object shapes/text →
  `pts[0]/pts[1]`; `_rubberBand.x1`, bounds `.x1`, dimension-preview locals →
  UNCHANGED (not objects).
- `mx1..my2` — dimension render/vertex-edit sites → `pts[0]/pts[1]`, EXCEPT the
  `_dimTool` handoffs (2d).
- Split-eraser (1788): fragments minted from a stroke — build fragments as
  strokes directly (they carry `_v1type/_v1keys` from the parent; fragment keeps
  parent id on idx 0 per current behavior).
- **Every classification is recorded in the transform script with its line +
  before/after; anchor-asserted count == 1 per edit. No blind regex over the file.**

### 2d. External consumers — fed a v1 VIEW, their code untouched
| Consumer | Site | Edit |
|---|---|---|
| WebGL feed | 1217 | `_wglObjs = _objects.filter(!_editing).map(toV1)` — WebGL path only runs when NO eraser masks exist and is skipped during 2D fallback; per-frame map cost accepted v1, measured on device; if pan-perf regresses, cache keyed on a dirty counter (v1.1, only if needed) |
| Dimension render (2D + WebGL-overlay) | 1243, 1571-area | `_dimTool.renderObject(ctx, toV1(_dobj))` |
| Dimension vertex handles | 1367-1379 | `renderVertexHandles(ctx, toV1(editDim))`; `allVertices(_objects.map(toV1))` |
| PDF export (`pdf.js`) | — | reads the PERSISTED format → untouched by design |

### 2e. Selection surface swap (the point of it all)
**DELETE** (replaced by the shared engine): `_selectedIds` (57 refs),
`_drawGroupedSelection` (1963), `_hitResizeHandle` (2051), `_hitRotateHandle`
(2068), `_hitDeleteButton` (2078), `_hitCopyHandle` (2098), `_hitTestObjects`
(3273 — becomes engine hit), the select branches of pointer down/move/up
(~3294-3640: rubber-band, group move/resize/rotate drags, copy at 2119-2142,
delete-selected at 3302).

**INSTALL** (the host object — module-scope in markup.js):
```js
const SelHost = {
  get strokes(){ return _objects; },          // live ref — engine splices/pushes it
  canvas: <markup canvas>, ctx: <its 2d ctx>,
  // k == _uiScale() exactly: engine computes k = nw / rect.width, so
  get nw(){ return _uiScale() * Math.max(1, <canvas>.getBoundingClientRect().width); },
  render(){ _renderAll(); },
  _findStroke(id){ return _findObj(id); },
  _strokeBBox(s){ return _getBounds(toV1(s)); },
  _strokeCenter(s){ const b=this._strokeBBox(s); return {x:(b.x1+b.x2)/2, y:(b.y1+b.y2)/2}; },
  _uid(){ return _newId(); },
  _pushOp(){ /* logOp hook supersedes */ }
};
MarkupSelection.install(SelHost, buildHooks({ getBounds:_getBounds,
  pushHistory:_pushHistory, markDirty:_markDirty }));
SelHost._selectSub = 'rubber';   // drawing viewer = classic rubber+click (no TAP UI)
```
- Pointer routing: select-tool branches call `SelHost._selDown/_selMove/_selUp`
  with the SAME object-space pos the old hit-test received.
- Chrome: `_renderAll` tail calls `SelHost._drawSelChrome(ctx)` where
  `_drawGroupedSelection(ctx)` was.
- Remaining `_selectedIds` integrations (text-deco toolbar sync, keyboard
  delete/escape, any UI state) → `SelHost.selIds` / `SelHost.deselect()` /
  `SelHost.deleteSelected()`.
- **`strokes` getter caveat:** engine methods MUTATE the returned array
  (deleteSelected splices; clone pushes) — the getter returns the live `_objects`
  ref so this works; undo/redo REASSIGN `_objects`, and the getter always
  reflects the current binding. Verified against every engine touch point.
- **Rubber mode chrome = blue group box only** (halo/pick chrome is tap-mode) —
  matches the drawing viewer's current single-box UX. The S461 high-visibility
  colours apply automatically.

## 3. VALIDATION GATES (in order, each blocking)
1. `node --input-type=module --check` on modified markup.js.
2. Greps: `_selectedIds` == 0; `.points` remaining == eraserMask sites only
   (enumerated); no `obj.x1` on shape/text objects (classified list == done).
3. `frtSelBridge.test.mjs` still 55/55 (bridge untouched by surgery).
4. Static integration checks: SelHost installs against the real engine in Node
   with stubbed DOM (extend the harness).
5. **Device verification on a real redlined drawing (Mark, parallel deploy):**
   select · rubber-band · group move · resize · rotate (freehand AND shape AND
   text in one group) · copy · delete · undo/redo · dimension select/move ·
   text-deco toolbar on selected text · zoom in/out (chrome stays screen-constant
   == `_uiScale` parity) · WebGL on AND off (`?webgl=0`) · open an OLD drawing
   (pixel-identical) · save, reload, re-save (byte-identical persisted JSON).

## 4. PARALLEL DEPLOY (`frt-next/`)
- New tree paths `frt-next/**` REUSING the existing blob SHAs for every
  unchanged file (Trees API — no re-upload), + the modified `markup.js` blob,
  + an `index.html` variant with **service-worker registration disabled**
  (frt-next must NOT fight the live FRT SW for the origin scope; live FRT is
  the only SW registrant).
- Live `frt/` untouched until Mark verifies. Switchover = markup.js blob into
  `frt/js/viewer/` + **SW `CACHE_NAME` bump** (FRT is a PWA — mandatory) +
  CRB-session-idle confirmation.

## 5. RISK REGISTER (named, not hidden)
- **~90 hand-classified edit sites in a sacred file** — the largest single-file
  surgery since the S459 lightbox migration. Mitigation: scripted anchor-asserted
  transforms, per-pass validation, parallel deploy.
- **WebGL per-frame `map(toV1)`** — measured on device before switchover; cache
  escape hatch specced.
- **`_dimTool` v1 views** — dimension edits flow engine→pts→toV1 view; vertex
  EDITING writes back how? → recon item #1 of the surgery session: read
  `_dimVertexEdit*` write path before pass 2c.
- **Concurrent CRB session** — all surgery work in new paths; switchover gated.

## 6. STANDING RULES IN FORCE
lineTo only · no OffscreenCanvas · no opacity stacking · never auto-select after
draw · Escape never closes the viewer · `go(pg)` sacred · S280 single listener ·
canvas budgets per deviceMaxPixels — none of these are touched by the surgery,
and the transform script asserts the first three by grep after every pass.
