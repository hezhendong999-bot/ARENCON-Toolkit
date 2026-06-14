# LOCKED — Copy Markup Feature (FRT markup engine) — design locked with Mark, S327-scope session

## Interaction model — SINGLE MODE, both platforms (offset-drag)
Mark tested PC hover-ghost vs touch offset-drag and chose **offset-drag for BOTH** — one mental model everywhere, no hover dependency, chains naturally for repeat work.

**The flow:**
1. User selects a markup object (or multi-selects a group) → selection box appears with handles.
2. User taps/clicks the **copy handle** — a small button ON the selection box (NOT a toolbar button), same family/size as the existing rotate + delete handles.
3. A **duplicate is created, offset** from the original (≈ +28,+28 canvas px, pre-zoom-adjusted so the visual offset is consistent at any zoom), and the duplicate becomes the **active selection**.
4. User **drags the duplicate and lifts/releases** to place it. (On PC, a plain click-to-drop is ALSO accepted as a quiet convenience, but offset-drag is the primary, documented behavior — instructions are identical on all devices.)
5. Because the dropped copy is now selected with its copy handle present, the user can **immediately copy again** → drag → drop. Repeat to lay down rows (e.g. identical sprinkler circles), then a line for branchline, then **group-select + copy the whole branch** to replicate.

## Copy handle — placement & spec
- Position: a corner of the selection box NOT used by rotate (top-center) or delete (top-right). Recommend **top-LEFT corner**.
- Hit target: reuse the proven `_hitRotateHandle` pattern (circle, generous radius). On coarse pointers (tablet/phone) the hit radius must be finger-friendly (≥ ~16px in CSS px after zoom mapping). Match/beat the rotate handle's hit size.
- Visual: small filled circle with a copy glyph (⧉ U+29C9 or a Tabler-style two-rect copy icon), drawn in the markup accent colour, white glyph. Shown ONLY when `_tool==='select'` and there is a selection (same visibility rule as the existing handles).
- Multi-select: handle sits on the GROUP bounding box (`_getGroupBounds()`); copying clones EVERY selected object together, preserving relative positions, and the new group becomes selected.

## Clone semantics (FRT object model)
- Objects are plain `{id, type, x1,y1,x2,y2, color, size, opacity}` (+ type-specific like text/fontSize/rotation). Pen/highlight carry a points array; eraserMask carries point arrays — **deep-copy** all arrays (no aliasing — see the existing S-note at markup.js ~L1369 "Deep-copy the path so later mutations don't alias").
- `clone(obj, dx, dy)`: new `_newId()` for each object; offset all coordinate fields (x1/y1/x2/y2 AND every point in points/eraserMask) by (dx,dy); copy color/size/opacity/rotation verbatim.
- After clone: push to `_objects`, set `_selectedIds` to the new id(s), `_pushHistory()`, `_renderAll()`, `_markDirty()`.

## Zoom correctness (ties into scope #20/#22)
- The offset and the drag MUST be computed in the markup's own coordinate space (image space), not screen space, so a copy made while zoomed lands correctly and can be dragged anywhere — including outside the original unzoomed photo bounds (scope #22). Do the copy-markup work AFTER (or together with) the #20/#22 zoom-transform fix, or the copy will inherit the same broken coordinate mapping.

## Mobile/PC pointer handling (S319 caution — protected code)
- Hook into the existing `_handleSelectDown/_Move/_Up` path; add a copy-handle hit-test BEFORE the rotate/delete/move tests (so tapping the handle copies rather than starting a move).
- One unified pointer path for mouse + touch (the engine already routes both into `_handleSelect*`). No hover required.
- `@media (pointer:coarse)`: only affects hit-radius sizing, not behavior.

## v1 status
- v1/v2 NEVER finished copy — only a stub `mk-copy-btn` (show/hide on select, no logic) exists (markup.js ~L3120). Build fresh; do NOT resurrect the toolbar button. Remove or repurpose the stub.

## Demo
- Interactive demo shown to Mark this session (single circle, both modes) confirmed the model; offset-drag chosen. No FRT code written yet — build next session per this spec.

## Build gate
- Markup engine is protected code (S319). Read markup.js fully, map the coordinate/transform model, and coordinate with scope #20/#22 (zoom) before implementing. Field-verify on a real tablet after.
