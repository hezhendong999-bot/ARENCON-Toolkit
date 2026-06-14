# FRT HANDOFF — Session S327 (FINAL — supersedes the mid-session FRT_HANDOFF_S327.md)
**Repo:** hezhendong999-bot/ARENCON-Toolkit · branch main · **LIVE HEAD at session end: `439f0be`**
**Versions at end:** SW `arencon-frt-v786`, `frt.css?v=624`.
Concurrent Training/Hub writers interleaved commits throughout; HEAD moved many times (98a2654 → 7d3ecd9 → d05696f → f9b9d8c → … → 439f0be). Every push re-asserted HEAD + post-verified via Blobs API. **Verify SHIPPED claims against live blob SHAs, not this prose.**

This session had THREE phases: (1) ship the 5 deferred S326 bugs, (2) full-tool scan + fixes + dead-code removal, (3) capture a large field-testing backlog as SCOPE + lock the copy-markup design. **No code was written in phase 3 — scope/design only.**

---

## MY S327 COMMITS (in order; all on live history)
| Commit | Type | Summary |
|--------|------|---------|
| `042c364` | CODE | B4 PDF appendix item-# sort; B5 photo select-mode selection-state |
| `a4b7b21` | CODE | B1 minimap rec teardrop + add-modal rec setter; B2 markup pointer guards; B3 defer pin-drag list render |
| `2bede34` | CODE | scan-fixes: typing-flash photo-guard parity; photo selection Set desync; Tasks-search focus loss |
| `775fa35` | DELETE | removed dead `frt/js/viewer.js` |
| `f9b9d8c` | DOC | `FRT_SCOPE_S328.md` — 37-item backlog (scope only) |
| `6fcbaaf` | DOC | `LOCKED_COPY_MARKUP_DESIGN.md` — copy-markup locked |
| `439f0be` | DOC | scope #25 → points to the locked copy-markup design |

---

## PHASE 1 + 2 — CODE SHIPPED & VERIFIED (B1–B5 + 3 scan bugs + 1 deletion)

**B1 — minimap rec teardrop red→brown.** `viewer/viewer.js` `_drawPinMiniMapStatic` now derives rec as "any obs is rec, fallback rollup" (was reading stale pin-level `d.isRecommendation`). **Root cause also fixed:** add-deficiency modal `doCreate` (`ui/deficiencies.js`) now routes rec through `Model.setRecommendation(id,true)` so obs[0] + rollup both written (was setting only `d.isRecommendation`).
**B2 — markup on photo dragged the photo.** `ui/lightbox.js`: mouse/touch pan+swipe+zoom+double-tap handlers bail when `_markupActive`, so a single-finger drag draws.
**B3 — card flash on pin-drag.** `viewer/viewer.js`: `_PinPan` onUp no longer full-renders the list; sets `_peListDirtyFromPinDrag`, consumed once by `_closePinEditor`.
**B4 — PDF appendix out of order.** `export/pdf.js`: `dPins` sorted by body `_itemNo` (asc, null→last) before table + `_appendixImgJobs`.
**B5 — photo select-mode broken.** `ui/photos.js`: select-mode card-tap drives the real `_selectedUids` Set (was CSS-class-only), shift-click range parity.
**Scan-fix 1 — typing-flash root cause.** `ui/deficiencies.js`: the `onChange('photo')` guard was missing `.defic-pin-group` + SELECT vs the other 3 guards → brought to parity. This is the "sometimes flashes when typing comments" with photos loading in background.
**Scan-fix 2 — photo selection Set desync.** `ui/photos.js`: `_clearSelection()` now clears `_selectedUids` (was CSS-only → stale "N selected"); popup-menu Select-all/Deselect drive the Set.
**Scan-fix 3 — Tasks-search focus loss.** `ui/pins.js`: `render()` preserves focus+caret on `#tasks-search` across the innerHTML swap; `saved` guard skips rebuild while search is focused.
**Deletion — dead code.** Root `frt/js/viewer.js` removed (app.js imports `./viewer/viewer.js`; zero executable loads; not in SW precache). Prevents the wrong-file-edit trap.

### Full-scan clean findings (no action)
All 50 JS files pass syntax. No assignment-in-condition, no dup functions, no off-by-one loops, no listener leaks, no orphaned intervals. dwg-search + pin-picker modal searches use the correct display-toggle (no re-render); only pins Tasks-search had the anti-pattern (fixed).

### Report-only flags (deliberately NOT changed — need Mark / data-path gating)
- PDF reads rec rollup in ~10 places — safe while rollup reliable (S327 write-fix guarantees new data); on-screen self-heals. Don't change without Mark.
- `projectInfo.js` 'project' guard unguarded but render is non-destructive (sets el.value) → no flash. Left.
- `app.js` cloud-sync timer juggling — fragile-looking, correct. Data-path. Untouched.

---

## PHASE 3 — SCOPE + DESIGN CAPTURED (NO CODE)

### `FRT_SCOPE_S328.md` (pushed `f9b9d8c`, updated `439f0be`) — 37 items, the S328 entry point
Captured from Mark's field testing of project 1490.04 (IMCC Sprucewood Attic Sprinkler). Groups A–I. **Read this doc first next session.** Top-of-doc "verify-first" flags:
- **#1/#2 (pin drag disabled + +/−/Fit frozen in drawing-viewer pin editor) — LIKELY A REGRESSION FROM S327 B3** (the `_PinPan` onUp / `_closePinEditor` change). CHECK FIRST — highest-value quick win, possibly self-inflicted.
- **#3** (closed pin shows amber in pin-editor minimap) — confirmed bug in `_PinPan` draw() (~L2665): `isClosed` only sets alpha, not fill. A THIRD rec/closed renderer beyond the two fixed in B1. Closed must win → `#5F8068`.
- **#20/#21** (photo-markup zoom scale; lightbox select drags photo) overlap S327 B2 but are DIFFERENT surfaces — not done.

Full 37-item list lives in the doc. Highlights by group:
- **A** pin-editor regressions (#1–3). **B** pin-editor layout/mobile cleanup + obs UX (#4–11): replace 3-dot spin-off w/ diagonal-arrow icon + move into More; remove standalone Move-pin; clearer active-obs indicator; remove obs-title X; rename "Move pin to another drawing"→"Move pin"; comment box EXPANDS (PC horizontal / mobile vertical). **C** contractor/trade write-back to roster (#12–14, design-gated). **D** defic-card flashing/smoothness (#15–19). **E** markup cluster (#20–24) + copy-markup (#25). **F** text-box redesign (#26). **G** calibration overhaul (#27–30) + **G2 dimension engine full redesign (#37, keep single/continuous/running)**. **H** PDF orphan-header (#31) + export-bar-zoom (#32). **I** housekeeping: dimension-in-PDF dead (#33), delete "All photos" btn (#34), AI cost-page redesign demo (#35), drawing cards 2-per-row mobile + remove Compact btn (#36).

### `LOCKED_COPY_MARKUP_DESIGN.md` (pushed `6fcbaaf`) — copy-markup, DESIGN LOCKED
Mark tested an interactive demo (PC hover-ghost vs touch offset-drag) and **chose offset-drag for BOTH platforms** — single mental model, no hover dependency.
**Locked model:** copy handle = small button ON the selection box (top-left corner, same family as the existing rotate/delete handles — NOT a toolbar button). Tap it → duplicate created OFFSET (~+28,+28 image-space px) and becomes the active selection → drag-and-lift to place. PC also accepts plain click-to-drop as a quiet convenience, but offset-drag is the documented primary. Dropped copy stays selected → copy again → chains for rapid sprinkler rows; group-select copies the whole branch.
**Build notes in the doc:** object model `{id,type,x1,y1,x2,y2,color,size,opacity}`; deep-copy points/eraserMask arrays; new `_newId()` per object; reuse `_hitRotateHandle` hit-test pattern (finger-friendly radius on coarse pointers); hook into `_handleSelectDown/Move/Up` with copy-handle hit-test BEFORE rotate/delete/move; v1/v2 only had a stub `mk-copy-btn` (no logic) — build fresh, remove stub.
**Dependency:** build copy-markup AFTER/WITH the #20/#22 zoom-transform fix, or the copy inherits the broken coordinate mapping (won't land right / can't drag outside original photo bounds).

---

## STATE FOR S328 START
1. `git`/API HEAD will have moved (concurrent writers) — re-assert before any push.
2. **Read `FRT_SCOPE_S328.md` first**, then `LOCKED_COPY_MARKUP_DESIGN.md` for the copy feature.
3. **First action: check #1/#2** — confirm whether S327 B3's `_PinPan` change disabled pin drag + froze +/−/Fit. If so, that's the fastest fix and partially self-inflicted; own it.
4. No open BUG QUEUE in the old sense — B1–B5 closed. The 37 scope items ARE the new queue.
5. Versions to bump on next code push: SW v786→v787, css v624→v625 (together).

## KEY LEARNINGS (S327)
- Verify the IMPORTED file, not the named one (B1 wasted time on dead root viewer.js; now deleted).
- Rec is per-obs + rollup; read it the way the consumer reads it; any writer setting one side desyncs — there are THREE rec/closed teardrop renderers (pinsGL ✓, `_drawPinMiniMapStatic` ✓, `_PinPan` ✗ still #3).
- Flash = a full `initDeficiencies.render()` (innerHTML swap) mid-interaction. 4 render-guards in deficiencies.js MUST stay byte-identical; a drifted guard = "sometimes flashes."
- Full-render on a search keystroke loses focus unless caret is preserved or you filter by display-toggle.
- Two parallel selection systems (a Set + a CSS class) WILL desync — Set is source of truth, derive class on render.
- Touch has no hover — design touch-first interactions on stamp/drag, not cursor-follow (drove the copy-markup decision).
