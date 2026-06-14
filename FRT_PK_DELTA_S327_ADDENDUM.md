# FRT PK DELTA — S327 ADDENDUM (append after FRT_PK_DELTA_S327.md)
Late-session canon that emerged during phase 2/3 (scan + scope/design). Append to ARENCON_FRT_PK.md.

## §Rec/closed teardrop — THREE renderers must agree (S327 update)
There are THREE places that resolve a pin teardrop's fill from rec/closed/site/IAR/priority. They MUST use the same precedence: **closed > rec(#5E5440) > site(#6B6FA8, !d.contractorId) > IAR > priority(low #B07F5A / high #A85959)**.
1. `pinsGL.js _priorityFillHex` (drawing canvas) — ✓ correct (IAR #FF69B4 on-screen).
2. `viewer/viewer.js _drawPinMiniMapStatic` (static card/mobile minimap) — ✓ fixed S327 B1.
3. `viewer/viewer.js _PinPan.draw()` (the INTERACTIVE "Location on Drawing" minimap, ~L2665) — ✗ STILL BROKEN (scope #3): computes `isClosed` but applies it only to `alpha`, not `fill`, so a closed low pin shows amber@50%. Fix in S328: closed overrides fill → `#5F8068` (IAR here is `#E91E8C`).
When touching any pin-colour logic, update/check ALL THREE.

## §Touch has no hover — interaction canon (S327, copy-markup)
Field tablets/phones have no hover state — a finger is down or gone. Any interaction that relies on a cursor following without a button pressed (preview-follows-cursor, hover tooltips as primary affordance) does NOT work on touch. Design primary interactions as **stamp / tap-drag-lift**, identical on mouse + touch. (This drove the copy-markup decision: offset-drag for both platforms, not a PC hover-ghost.) Hover may be an optional PC-only convenience, never the documented primary path.

## §Selection-box handles — extensible system (S327, for copy-markup)
The markup selection box already renders a **rotate handle** (top-center, `_hitRotateHandle`, ~14px radius) and a **delete button** (top-right, `_hitDeleteButton`, ~12px radius). New handles (e.g. the locked **copy handle**, top-left) follow the same pattern: a hit-test fn + a draw call in the selection-box render, gated on `_tool==='select'` + a non-empty `_selectedIds`. Handle hit-tests run BEFORE the move/select hit-tests in `_handleSelectDown`. On coarse pointers, hit radius must be finger-friendly.

## §Scope/design docs are canon inputs for S328
- `FRT_SCOPE_S328.md` — the 37-item field-testing backlog; the S328 work queue. Read first.
- `LOCKED_COPY_MARKUP_DESIGN.md` — locked copy-markup spec (offset-drag both platforms; copy handle on selection box; build after/with the zoom-transform fix #20/#22).
