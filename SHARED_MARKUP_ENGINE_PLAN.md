# Shared Markup Engine — Extraction Plan (Option A: plan + demo before code)

**Created:** July 2026
**Goal:** One canonical `lib/ui/markupEngine.js` that both Diesel and FRT import, so every
markup/lightbox bug is fixed ONCE for both tools. Ends the fix-it-twice tax.
**Constraint:** Zero visual/behavioral change for inspectors. Same look, same PDF output.
Locked persistence semantics (never-bake, clean original in Site Records) preserved.

---

## Key finding from the inventory (this changes the strategy)

I compared Diesel's `DieselMarkup` (inline, ~870 lines) against FRT's `markupEngine.js`
(1,329 lines, already a clean standalone module). Result:

**The two engines are the SAME engine built twice with different names.** ~26 public methods
are already identically named (`attach`, `detach`, `confirmPick`, `cancelSelect`, `pickCount`,
`onSelChange`, `undo`, `setColor`, `getBg`, `isDirty`, `isPicking`, `insertNewline`, etc.). Most
of the "differences" are vocabulary, not capability:

| Behavior | Diesel name | FRT name |
|---|---|---|
| delete selected strokes | `deleteSelected` | `deleteSelection` |
| render | `render` | `_render` |
| selection count | `selCount` | `selectionCount` |
| export strokes to save format | `toMk` | `exportStrokes` |
| draw a stroke | `_drawStroke`/`_drawHighlight` | `_strokePath`/`_drawShape` |
| opacity | (size/alpha via applySel) | `setOpacity` |

**FRT's engine is strictly MORE capable** where they genuinely differ:
- `setRotation` / `rotateStrokes` / `rotateStrokesInFrame` — rotation-aware markup (Diesel lacks)
- `cleanBlob` / `saveBlob` / `revert` — blob persistence built INTO the engine
- `_hitResize` / `_hitRotate` — resize + rotate handles on selection (Diesel has neither)
- `hasChangesSinceAttach` — cleaner dirty tracking

**Conclusion:** Don't build a new engine from scratch, and don't extract from the weaker twin.
**FRT's `markupEngine.js` IS the canonical engine** — it's already modular, already more
capable, already the target shape. The right move is:

1. Promote FRT's `markupEngine.js` → `lib/ui/markupEngine.js` (with a compatibility shim so
   FRT keeps working unchanged).
2. Wire Diesel onto it, replacing Diesel's inline `DieselMarkup` — mapping Diesel's method
   names to the shared engine's (a thin adapter so Diesel's ~57 call sites don't all change).
3. From then on: markup fixes land in `lib/ui/markupEngine.js` once → both tools inherit.

This is LOWER risk than a from-scratch engine (FRT's is already field-proven) and it means
Diesel INHERITS FRT's rotation, resize/rotate handles, and cleaner persistence for free —
Diesel gets BETTER, not just shared.

---

## What stays tool-specific (NOT in the shared engine)

The shared engine is the stroke/selection/draw/persist CORE. These stay per-tool as adapters:

- **FRT's `webglMarkup.js`** (611 lines) — FRT's WebGL rendering path for large tiled drawings.
  Diesel doesn't need it (Diesel marks up photos, not giant PDF drawings). Stays FRT-only, sits
  OVER the shared engine as a renderer option.
- **The lightbox CHROME** — the toolbar layout, the confirm bar, the flyouts. Diesel's
  `DslLightbox` and FRT's `lightbox.js` differ in exact toolbar arrangement. Phase 1 shares the
  ENGINE (the hard, bug-prone part); the lightbox chrome can be unified later (Phase 2, lower
  value — it's cosmetic, and the S455 header engine already proved the chrome-sharing pattern).
- **Tool-specific persistence glue** — Diesel bakes into `p.d` + Site Records original; FRT has
  its own never-bake pool. The engine exposes `exportStrokes`/`importStrokes`; each tool owns
  how it stores them. (This is where the never-bake locked semantics live — untouched.)

---

## Phased plan (each phase demo-first + field-verify, per Mark's rules)

### Phase 0 — This document + a DEMO (no live code touched)
- Produce a standalone HTML demo that loads the candidate `lib/ui/markupEngine.js` and lets Mark
  draw/select/delete/rotate on a test photo — proving the shared engine behaves identically to
  what inspectors use today. **Mark signs off on the demo before ANY live wiring.**

### Phase 1 — Promote FRT's engine to `lib/` (FRT-side, zero behavior change)
- Copy `frt/js/viewer/markupEngine.js` → `lib/ui/markupEngine.js`.
- Point FRT's import at the new location (or re-export shim so nothing else in FRT changes).
- FRT field-verify: markup, select, rotate, save, revert, PDF export all unchanged.
- Risk: LOW (same code, new address). This is the safe first step.

### Phase 2 — Wire Diesel onto the shared engine
- Replace Diesel's inline `DieselMarkup` with an adapter that maps Diesel's method names
  (`deleteSelected`→`deleteSelection`, `render`→`_render`, `toMk`→`exportStrokes`, etc.) onto
  the shared `lib/ui/markupEngine.js`. Diesel's ~57 `DieselMarkup.*` call sites keep working
  via the adapter — no mass rewrite.
- Diesel INHERITS rotation + resize/rotate handles + cleaner persistence.
- Diesel field-verify (Mark on-device, throwaway project): draw, select, delete, save (bake +
  Site Records original), revert, close, reopen, PDF. This is the higher-risk phase — locked
  Diesel persistence semantics must be preserved exactly.
- Risk: MEDIUM. Demo-first, staging-first, field-verify gated.

### Phase 3 — Fold in the deferred markup bugs (now fix-once)
Once both tools share the engine, fix these ONCE:
- **Bug 1** (delete-selected needs Save while add doesn't) — resolve to consistent semantics
  ("Save commits, X cancels" for both add and delete). Lands once, both tools.
- **Confirm-bar cleanup** — already fixed in live Diesel; fold the same fix into the shared
  engine so FRT gets it too (FRT may have its own variant of this bug).
- Any future markup bug: one fix, both tools.

### Phase 4 (later, optional) — Unify lightbox chrome
Lower priority, cosmetic. Share the toolbar/confirm-bar/flyout layout via a config, like the
S455 header engine. Only if it's worth it.

---

## Why this is the right approach (vs. alternatives)

- **vs. build-from-scratch:** rejected — FRT's engine is field-proven; a new one re-introduces
  every bug both engines already fixed over dozens of sessions.
- **vs. extract-from-Diesel-first:** rejected — Diesel is the WEAKER twin (no rotation, no
  resize handles). Extracting from it would mean rebuilding what FRT already has.
- **vs. leave them separate:** rejected — that's the fix-it-twice tax Mark explicitly wants gone.

**Bonus:** Diesel doesn't just get "shared" — it gets FRT's rotation, resize/rotate handles, and
cleaner persistence. The weaker tool levels UP to the stronger one.

---

## Sequencing note (reconciling with the data-safety P0s)

Grok's assessment correctly flags Diesel's data-layer concurrency (optimistic lock, keepD,
merge-by-id) as the higher LIABILITY risk (AHJ records). Those are in a DIFFERENT layer than
markup and don't block this work. Plan: shared markup engine proceeds as the main arc; the
Diesel data-layer P0s slot in as their own short field-verified pushes close behind — NOT
indefinitely behind the refactor. Markup THEN data safety, since the urgent phantom-delete fire
is already out (fixed live).

---

## Next step
Build the Phase 0 DEMO: a standalone HTML that loads the candidate shared engine on a test
photo, so Mark can confirm draw/select/delete/rotate behave identically before any live wiring.
Nothing live is touched until the demo is approved.
