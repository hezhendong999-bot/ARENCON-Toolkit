# LOCKED — Seal Redaction (PDF appendix drawings)

**Status:** LOCKED — demo approved by Mark, S489 (2026-07-18). **Not built.**
**Owner at build time:** the session holding the `frt/**` code lane.
**Demo of record:** `ARENCON_Seal_Redaction_Demo.html` (S489).

---

## ▶ PROMPT OPENER

Building this? Read this file fully, then verify `frt/js/export/pdf.js` at live GitHub HEAD before
proposing anything. Do not re-litigate the design — Mark approved it.

**Standing command meanings:** "give me handoffs" = handoff + PK delta + Style delta (deltas only).
"give me FULL handoffs" = handoff + complete regenerated PK + complete regenerated Style Guide.
"Proceed with handoff XXX" = read that tool's latest handoff plus every delta on top, then report the
to-do list. Never means "write a handoff."

---

## 1. The problem — and what it is NOT

Field staff upload sealed (stamped) drawings into FRT because that is the set they have. Those sheets
then appear in the PDF report appendix **carrying a P.Eng seal**.

Mark's framing, which is the correct one: *"We are not supposed to put stamped drawings
unintentionally, that includes in the report. It should not carry the stamp as it looks like that page
is stamped regardless if we're using the stamped drawing or not."*

The risk is **misrepresentation of ARENCON's own deliverable**. A reader flipping through an ARENCON
report sees a stamp on the page and reads it as a stamp on *that page* — making an unsealed deliverable
appear sealed. Whose seal it is is beside the point.

**This is NOT seal removal.** The stored drawing is never altered. Nothing is erased from anyone's
sealed document. This is a presentation decision on ARENCON's own report output.

> Rejected at the outset: automatic seal stripping. Mark: *"I dont want autoremoval."* Correct call —
> it would have made the lazy path the easy path firm-wide.

---

## 2. Core principle — COVER, never erase

An opaque box is drawn over the region **at PDF-render time only**.

- The stored drawing keeps its seal, untouched. The original is always recoverable.
- We never modify someone else's sealed document.
- The redaction is purely a property of ARENCON's report output.

---

## 3. The cover is LABELLED (locked)

The cover carries text. Mark selected option 1:

> **"Seal redacted — refer to original issued drawing"**

Rationale: a blank white rectangle reads as a printing defect, or worse, as something concealed. A
label turns it into a deliberate, documented act — and points the reader to the authoritative source.
This is the defensible position if a contractor or AHJ ever asks.

Rendering: white fill, thin grey dashed border, label centred in the box, wrapped to fit, font scaled
to box width (min 10px, max 15px), Calibri.

---

## 4. PDF-ONLY — never in the viewer (locked)

The cover appears in the **PDF appendix only**. The in-app drawing viewer always shows the real sheet,
seal included.

Rationale: inspectors must see the true sheet on site to know which set they are working from. The
risk being solved is entirely about what **leaves the office**.

---

## 5. NOT a markup-engine feature (locked)

Redaction is a **sheet-level property of the drawing record**, edited from the drawing's own settings —
**not** a markup object.

Rationale, and this is the load-bearing reason:

- Markup is a *field annotation* — authored on site, belongs to the observation, appears everywhere the
  drawing appears. Redaction is the opposite on every count: a document-control decision, made once at
  the office, whose entire purpose is to appear in the PDF and **not** in the viewer.
- If redaction lived in the markup engine it would inherit markup's rendering (visible on the tablet)
  and markup's tools — an inspector could erase, move, or unlink a seal cover with the same eraser they
  use on an arrow. **A seal cover that a field tap can silently remove is worse than no feature**,
  because staff would stop trusting it and stop checking.

It may **reuse the box-drawing interaction** so it feels familiar, without being a markup object.

---

## 6. Geometry — fully freehand

Seals vary: round P.Eng seals, rectangular signed blocks, different sizes, anywhere on the sheet.

- Box is **user-drawn anywhere, any size, any aspect**. No assumed corner, no fixed shape.
- **Multiple boxes per sheet** — sets often carry both a seal and a signature block.
- Draw, move (drag inside), resize (drag corner handle), delete.
- **Stored as FRACTIONS of sheet dimensions**, so covers stay correct at every export DPI and page
  size (Letter / 11×17 / 24×36).

---

## 7. No auto-detection (locked)

Rejected. Seals vary too much; detection will miss some and false-positive on title blocks. **A missed
seal is a stamped page in an issued report** — a silent failure in the exact place ARENCON cannot
afford one. Manual is deterministic, and the inspector sees precisely what will be covered.

---

## 8. Export-time warning — WARN, not block

**OPEN — Mark to confirm.** Claude's recommendation: **warn**.

The export screen lists any appendix drawing with no redaction box. Recommended as a **warning, not a
hard block**, because many drawings legitimately carry no seal — a block that fires on those trains
people to click through, which is worse than no gate at all.

Blocking is defensible given Mark's "reports must never appear stamped" position. Mark decides.

---

## 9. Build notes

**Insertion point is clean.** `_renderDrawingWithPins()` in `frt/js/export/pdf.js` already composites
the drawing to a canvas and draws pins on top. The redaction cover is **one more layer on that same
canvas**, between the sheet and the pins. Being export-side by construction — not by a flag someone
could flip — is what makes "PDF-only" structurally true rather than a convention.

Order on the canvas: sheet → **covers** → pins. Pins must remain visible over a cover if one happens to
sit beneath a pin.

**Other notes:**
- Redaction boxes belong to the drawing record and must survive cloud sync and JSON round-trip.
- Applies to every export path that emits appendix drawings, including consolidated bundles — a cover
  that works in one export type and not another is a silent failure.
- Not a data path in the photo-loss sense (nothing is deleted), but it changes report output — Mark
  should verify one real export before it is trusted on live reports.

---

## 10. Next step after approval

**"Apply to all sheets in this folder"** for multi-sheet sets, where the seal sits in the same place on
every sheet. Draw once, cover a 30-sheet set. Same engine, bulk apply. Deliberately *not* in the first
build — get the single-sheet case field-proven first.
