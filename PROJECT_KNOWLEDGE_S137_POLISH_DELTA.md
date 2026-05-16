# Project Knowledge — S137-POLISH Delta

> Fold into canonical `ARENCON_Project_Knowledge.md` at start of S138.
> Head: `2f888b0`. SW v413 / CSS v=313.

## Deficiencies tab — layout (supersedes S137 entry)

- Card order is **Trade Board → Deficiency Log → Deficiency List**.
  Rationale: the Deficiency Log's per-contractor rows ARE the Trade Board
  roster; roster precedes the scoreboard. Do not reorder back.
- Card headers are **"Trade Board"** and **"Deficiency List"** (the long
  "· Contractors on Site" and "Deficiencies Identified" names are retired).
- `#defic-toolbar` no longer exists. AI Group / Select / Fold All are gone
  (S135 retired the features; this removed their orphan markup). **Renumber
  lives in `.defic-control-bar`** (far right, after the view toggle),
  `id="defic-renumber-btn"` preserved so its document-delegate handler
  still binds. Renumber→PDF-export-toggle is still the S139 plan.

## Card rendering — single-obs == multi-obs (NEW INVARIANT)

- `_buildPinGroupCard` renders **every** pin through the multi-obs layout.
  `renderPinStrip` is hardwired `true`. The S122 single-obs compact layout
  (no strip, inline pin circle, right-pushed drawing pill, no Observation
  sub-card/thread) is **removed**. Single-obs and multi-obs, active and
  closed, are now visually identical.
- The drawing pill is carried by `.defic-pin-strip` for ALL pins →
  **left-aligned** everywhere. There is no longer a right-aligned drawing
  pill path; `.lbl-row-spacer` is no longer emitted in the obs label row.
- Per-obs **Thread / +Response / +Comment** renders for all pins.
- Pin-footer threaded-activity filter no longer special-cases single-obs;
  `multiObsPin` variable is deleted. `multiObs` (per-obs scope, ~L517)
  remains and is unchanged — do not confuse the two.
- **Single-obs pins still hide Spinoff / Remove-obs** (deliberate,
  non-destructive — those actions orphan a single-obs pin). The footer
  ⋯ menu "Remove pin" is the deletion path. Do not "complete parity"
  here.
- S122's no-double-circle intent is consciously traded away: a single-obs
  pin now shows the pin number in the strip AND on its lone observation.
  Mark accepted this explicitly in favor of consistency. Do not "fix" it.

## Closed/addressed card styling

- `.defic-obs-card.addressed` stripe is `box-shadow: inset 3px 0 0`
  (NOT `border-left`). Border-based status stripes cause width-mismatch +
  text-shift between toggled states — never reintroduce a layout-occupying
  border for state. Dark-mode stripe `#4a8a6a`, light `#5F8068`.

## Control bar

- `select.dfx-filter-input` widths are pinned (168px; `#dfx-pri` 130px;
  ellipsis) so the wrapping flex control bar has constant height across
  re-renders. Keep pinned — do not let selects auto-size to option text.

## De-box principle (now codified)

- Grouping uses a **banner/band**, not a container box, unless the element
  is an atomic editable object. In the Deficiencies tab only TWO real
  boxes exist: the section card and the pin card. `.dfx-trade-banner` /
  `.dfx-ctr-banner` are flat bands (`border-radius:4px`, no box-top
  radius); `.dfx-pingrp` has no fill/border. Apply this pattern to future
  grouped lists.
