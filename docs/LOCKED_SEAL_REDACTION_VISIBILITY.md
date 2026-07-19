# LOCKED — Seal Redaction Visibility (S492, Mark-approved demo)

Extends LOCKED_SEAL_REDACTION.md. That lock stands unchanged: covers print in
the PDF only, drawing pixels never altered, NOT a markup object, WARN never
block. This lock adds where the DECISION is visible. Demo of record:
ARENCON_Seal_Redaction_Visibility_Demo.html (approved by Mark, S492:
"Looks good, lock it and build it now").

## 1. Two renderings, never confused
- PRINT rendering (opaque white + grey dashed border + label) exists ONLY in
  the exported PDF. Nowhere on screen.
- MARKER rendering (2px dashed burgundy outline, rgba(156,39,66,.07) fill,
  small burgundy 🔒 tab at top-right of the box) is what every SCREEN shows.
  The sheet stays readable under the marker — that is the point.

## 2. Where the marker appears
- VIEWER: markers drawn over the sheet for every cover on the open drawing.
  Toggleable via the toolbar Seal button. NOT markup objects — an overlay
  layer, untouchable by eraser/select.
- EXPORT SCREEN contact sheet: every appendix drawing as a thumbnail built
  from d.thumb (the existing synced 400px JPEG — verified _lazyGenThumbs,
  drawings.js; NO drawing decode, NO tile fetch). Markers drawn on top.
  Covered sheets: 🔒 badge + count. Click a thumbnail → opens that drawing.
- DRAWINGS TAB cards: 🔒 "Seal covered" tile-badge on covered sheets.

## 3. Amber flagging — Mark's call
Every appendix-bound sheet with NO cover is flagged amber on the contact
sheet (amber border + tinted thumb + "⚠ NO COVER" band). Warning only —
export always proceeds. The amber warning strip listing names stays.

## 4. Editor entry points
- Viewer toolbar: 🔒 Seal button beside the markup tools (primary entry —
  Mark: the ⋯ menu made him hunt for it).
- Viewer ⋯ menu + Drawings-tab card ⋮ menu entries remain.
- Export contact sheet: clicking a flagged thumbnail routes to the sheet.

## 5. Auto-detection — REJECTED, reaffirmed with Mark's own licence
Mark proposed detect + manual review. Rejected because review catches BAD
boxes, not ABSENT ones: after the detector works 9/10 times, the 10th sheet
goes out stamped because nobody's eye is on the sheets any more. Decisive:
Mark's own L.E.T. stamp is a rectangular signed block — visually a title
block / revision box — the format detection handles worst. The format most
likely to be ARENCON's own is the one it would miss.
IF ever revisited: suggestions only, every sheet starts UNCONFIRMED, nothing
counts as covered until a human taps it. A miss must not be able to hide.

## 6. Next after this build
Copy-cover-to-sheets: draw once, apply to the rest of the set (sets carry
the seal in the same spot). Kills the repetitive work with zero silent-miss
path. Build AFTER visibility is field-verified.
