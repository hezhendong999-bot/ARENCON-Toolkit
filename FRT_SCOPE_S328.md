# FRT SCOPE — S328+ Backlog (SCOPE ONLY — no code shipped S327-scope-session)
Captured from Mark's field testing (drawing project 1490.04 IMCC Sprucewood Attic Sprkl). Read before S328 work. Nothing here is fixed yet.

**Verify-first flags (Claude must check these BEFORE assuming state):**
- Items #3, #20, #21 OVERLAP with S327 "fixes" but are DIFFERENT surfaces/renderers — do not assume done.
- Items #1/#2 (pin drag + +/-/Fit frozen) may be a REGRESSION from S327 B3 (deferred list render touched `_PinPan` onUp / `_closePinEditor`). CHECK THIS FIRST in S328 — likely the highest-value quick win and possibly self-inflicted.

---

## A. Pin-editor / drawing-viewer interaction — REGRESSIONS, high priority
1. **Pin drag disabled** in the drawing-viewer pin editor — can't drag the pin to relocate. Regression.
2. **+ / − / Fit buttons frozen** in the drawing-viewer pin editor. Likely same root as #1 (`_PinPan` mount toolbar rebind / stale listener). Trace with #1.
3. **Closed pin shows AMBER (low) in pin-editor minimap** — should be GREEN. Root: `_PinPan` `draw()` (viewer/viewer.js ~L2665) computes `isClosed` but uses it only for `alpha`, not `fill`. Closed must override fill → `#5F8068`. Same family as S327 B1 but a THIRD renderer (`_PinPan`, the interactive one), not `_drawPinMiniMapStatic` (fixed) or pinsGL (fixed). Precedence to match: closed > rec(#5E5440) > site(#6B6FA8) > IAR(#E91E8C here) > priority(low #B07F5A / high #A85959).

## B. Pin-editor layout & mobile cleanup (ref: Mark screenshot "picture 2", portrait pin editor)
4. Mobile **Add Photos / Gallery buttons too big**; **hatch/checker pattern too big**.
5. Overall pin-editor **layout messy**, buttons oversized vs content → thorough UX pass, currently hard to use.
6. **Obs spin-off control:** replace the **3-dot button** with a clearer icon (diagonal arrow ↱ "spin off to new pin"). MOVE spin-off action INTO the **"More"** menu (not a standalone face button).
7. **Remove standalone "Move pin" button** — redundant; contractor/status are editable via the pills directly above.
8. **Active observation not obvious** (Obs A vs Obs B). Make active obvious: fade inactive more + hatch/enlarge active (or shrink inactive). Pick one cohesive treatment.
9. **Remove the "X" delete button** beside the observation title.
10. **More-menu "Move pin to another drawing" → rename "Move pin"** (no clash now that standalone Move-pin is removed, #7).
11. **Comment box should EXPAND, not scroll**, in the drawing-viewer pin editor (mirror the deficiency-card editor):
    - **PC:** expanding grows editor **horizontally** → minimap auto-fits horizontally.
    - **MOBILE:** expanding grows **vertically** instead (mode-dependent behavior — must branch).

## C. Contractor / trade logic — needs short design check before build
12. Contractor with no trade → trade pill shows **"Choose a trade"**.
13. Trade dropdown gets a **"+ Trade"** row to type a NEW trade.
14. Picking a trade (incl. new) for an unassigned contractor → **confirm prompt** ("Assign 'Fire Alarm' to [contractor]?") → on confirm WRITE BACK to the contractor roster; roster stays in sync with any change here.
    - **DESIGN FLAG (raise in S328 before coding):** couples pin editor ↔ contractor roster (shared structure). Confirm: can a contractor hold MULTIPLE trades? Is "assign" additive or replace? Where does the roster live (Model + Supabase `tool_data`?)? This is data-path-adjacent → Mark-present + verify-gated for the write-back.

## D. Deficiency card flashing / smoothness
15. **Deleting a comment flashes the card** (collapse→reopen flicker). Fix.
16. **Pin-editor minimap (from defic card) resize is chunky/laggy** on expand/compress — make butter-smooth (debounce-free smooth redraw / rAF, avoid full re-decode of the drawing image on each resize tick).
17. **Defic-card Add Photos / Gallery buttons** — STOP saving space; match ALL other Add Photos/Gallery buttons in shape, colour, size (consistency). (Reverses the space-saving variant.)
18. **Main defic card comments update INSTANTLY** as Mark types in the comment box (currently re-renders only on blur / click outside). If feasible, live-update the card's comment summary on input.
19. **Random card flash with NO input** — intermittent re-render. Continue the S327 render-guard hunt; there's a remaining trigger (background 'photo'/'project'/'saved' tick still rebuilding somewhere, or an obs-text debounce firing a render).

## E. Markup engine — photo & drawing (interrelated cluster; protected code, S319 caution)
20. **Photo-markup doesn't scale with zoom** — markup stays original size+position when the photo zooms; markup layer must share the image transform.
21. **Selection drags the photo instead of selecting markups** unless near fit/closed zoom — select tool must own the pointer (lightbox-markup version of B2; B2 fixed the markup-DRAW pointer, not the lightbox SELECT pointer).
22. **Drawable area limited to original (unzoomed) photo size** — tools dead outside original bounds when zoomed. Coordinate mapping uses unzoomed extents. Related to #20.
23. **Shape markups → TWO-CLICK placement** (click start, click finish), not click-drag-hold. Applies to shapes (circle/oval/rect/line). See also #37 (dimension) which has its own two-click semantics.
24. **Opacity %: CLICK-TO-TYPE** everywhere opacity appears — drawing markup toolbar, photo lightbox markup (from drawings, defic card, AND photo gallery). Keep +/− as 10% steps. Clicking the "100%" label → editable number input, clamp 10–100.

25. **NEW FEATURE — Copy markup (Mark priority) — DESIGN LOCKED (S327): see `LOCKED_COPY_MARKUP_DESIGN.md`.** Summary: copy handle on the selection box; offset-drag model for BOTH PC + touch (Mark chose one mode after demo); duplicate appears offset+selected, drag-and-lift to place, repeat; group copy supported; build AFTER/with the #20/#22 zoom fix so coordinates are correct.**
    - **Trigger = a small button ON the selection box** (like the rotate handle), NOT a separate toolbar button. Select item/group → tap the copy handle → a duplicate attaches to the cursor → click/tap to drop. Repeatable for fast identical sprinkler circles, then a line for branchline, then group-select + copy to replicate whole branches.
    - Must work on **mobile (phone/tablet) AND PC** — design touch + mouse from the start (the copy handle needs a coarse-pointer-friendly hit size).
    - **Check v1's implementation** — Mark unsure it was complete/correct; port the good parts, fix the rest.
    - Supports **single item AND multi-select group** copy.

## F. Text box redesign
26. **Text-box UI is poor** across ALL uses: calibrate/dimension input, drawing TEXT tool, photo-lightbox TEXT tool. Design ONE clean, consistent text-box component. (Coordinate with #37 since dimension input uses it.)

## G. Calibration overhaul — PDF X-Change style (significant)
27. **Calibrate modal wrong colour** — off the Bold/theme palette; reskin.
28. **Smart input parsing** (no separate fields, no forced unit typing):
    - `8-4` → 8'-4"; `8- 4 1/2` → 8'-4.5"; recognize `xx-xx` as feet-inches.
    - `12m` → metric; bare `12` → 12 feet (default imperial).
    - Currently `8-4` misreads as 84'.
29. **Calibration = two-point dimension flow** (NOT clicking dots). Always show dimension points like drawing a dimension; on 2nd point → modal pops to enter the known length (PDF X-Change behavior).
30. **Round to nearest half-inch** (e.g. `8'-4"`, never `8'-3 11/16"`) — fast field measurement.

## G2. Dimension engine — FULL REDESIGN (new, #37)
37. **Entire dimension tool redesigned from scratch** — current flow is "beyond difficult to use." Intended: click point 1 → click point 2 CONFIRMS the dimension (but the current build doesn't drop it down properly). Redesign for an intuitive, predictable place-then-confirm flow. **MUST retain three modes: single, continuous, and running dimensions.** Coordinates with #23 (two-click), #26 (text box), #27–30 (calibration shares the dimension placement flow).

## H. PDF report bugs
31. **Orphan section header** — "Fire Alarm" title alone at the bottom of a page with a big gap, then next page repeats the title "(continued)" + contractor + items. Page-break logic must keep a section header with its first contractor/item (no orphaned header). No screenshot yet; reported from memory.
32. **PDF viewer export bar zooms with the report** — must be FIXED size always (currently covers the whole report when zoomed). Decouple the export bar from the zoom transform.

## I. Smaller / housekeeping
33. **Dimension tool doesn't work in PDF at all** — toggle on, nothing renders. Not urgent. (Likely subsumed by #37 redesign.)
34. **Delete "All photos" button** from the photo gallery.
35. **AI usage & cost page redesign** — previously scoped, NOT done, NOT design-locked → build a demo for sign-off later.
36. **Drawing cards weird in mobile portrait** (too long/wide). Make them TALLER, PC-like in shape, but **two per row** in portrait. **Remove the "Compact" button** from the Drawings tab.

---

## Suggested S328 batching (for Claude, not locked)
- **Quick wins first:** #1/#2 (regression check), #3 (`_PinPan` closed-wins), #34 (delete All-photos btn), #17 (defic photo btns consistency), #10 (rename), #7+#9 (remove buttons).
- **Render/flash pass:** #15, #18, #19, #16 (defic card flashing + smooth minimap).
- **Markup cluster (read engine fully first, S319 caution):** #20, #21, #22, #23, #24.
- **Design-first (demo → sign-off → build):** #25 copy-markup, #37 dimension redesign, #26 text box, #27–30 calibration, #5/#11 pin-editor layout, #12–14 trade logic, #36 drawing cards, #35 AI cost page.
- **PDF:** #31, #32, #33.
