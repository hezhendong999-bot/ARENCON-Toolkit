# LOCKED_REPORT_ITEM_NUMBER_S316.md — Report Item # + Recommendation Appendix
**STATUS: LOCKED (Mark-approved). Build this exactly. Mark-present + field-verify on output.**

This is a structural change to the client-facing PDF report. It touches pagination
(`go(pg)` recursion — EXTEND, never rewrite), the appendix pin table, and appendix
assembly. Do it as its own focused session.

---

## 1. ITEM NUMBER LABEL — LOCKED FORMAT (Option E)

A new THIRD number — the report-sequential **Item #** — leads each item row, with the
pin#/obs# immediately after. Pin # and obs # are NOT dropped.

**Locked label: `1 · Pin 3A`** — item number, middot separator, the word "Pin" spelled out.
- **Item #** = report-sequential 1,2,3… — RESETS PER REPORT, no gaps, assigned in the
  order items render in the report body (trade → contractor → items, top to bottom).
- **`Pin 3A`** = existing pin # (3) + obs letter (A). Single-obs pins show just `Pin 3`
  (no letter), matching the existing drop-the-letter-when-single rule.
- Separator = middot `·` (U+00B7) with spaces. NOT a dash (range ambiguity), NOT
  parentheses (Mark rejected — brackets around the pin read weird), NOT a compound
  like `1.3A` (reads as a clause number).

**Typography (matches existing report canon):**
- Item # = burgundy `#9C2742`, 11pt, bold (the existing `.dc-itemnum` style).
- `·` separator = light grey `#B8BcC6`, normal weight.
- `Pin 3A` = dark slate `#4A5568`, ~9.5pt, semibold (the `.pinref-dark` treatment in
  the demo). Reads clearly secondary to the bold burgundy item number but still legible.
- Label leads the row, BEFORE the description. Description never buries the pin ref.

Reference render (the approved demo): `item_label_demo.html` Option E.

Example rows:
```
1 · Pin 1     Sprinkler header.                                    [Closed]
2 · Pin 2A    Aisles with loads.                                   [Outstanding]
3 · Pin 2B    Aisles with loads.                                   [Outstanding]
4 · Pin 3     Pipe penetration at the middle wall not sealed.      [Outstanding]
5 · Pin 4     Test.                                                [Closed]
6 · Pin 5     Additional aisle photographs … blocking the aisle.   [Outstanding]
```

## 2. APPENDIX PIN TABLE — ADD "Item" COLUMN
The per-drawing appendix pin table (currently Pin / Description / Status / Contractor)
gains a leading **Item** column: **Item | Pin | Description | Status | Contractor**.
- Item column = burgundy bold (matches body item #).
- Pin column = maroon bold (existing).
- Lets a reader cross-reference both ways: body "Item 5" → appendix table → Pin #5 on
  the drawing, and vice-versa.

## 3. ITEM-# ASSIGNMENT RULES
- Computed at report-render time, in body render order (the same order rows are emitted:
  trade section → contractor sub-section → pins/obs in their existing sort).
- One Item # per OBSERVATION ROW (so a multi-obs pin consumes consecutive item #s:
  Pin 2A = item 2, Pin 2B = item 3). This matches how the row list already expands obs.
- Resets to 1 at the top of each report. No gaps (it's a pure running counter over the
  rendered rows).
- Recommendations get their OWN item-number sequence within the Recommendation section
  (restart at 1 there) OR continue the main sequence — DECISION PENDING with Mark at build
  time; default recommendation: restart at 1 in the rec section since recs are a separate
  document concern (outside scope). Confirm before building.

## 4. RECOMMENDATION ↔ APPENDIX — SEPARATE LETTERED APPENDICES (LOCKED)
Problem solved: the Recommendations section had no drawing appendix, so rec pins (e.g.
#4, #5) never appeared on a drawing. Mark-approved structure:

- **Deficiency Appendix** (drawings with DEFICIENCY pins) — stays BEFORE the
  Recommendations section. Lettered **Appendix A — Drawings with Pins (Deficiencies)**.
- **Recommendation Appendix** (drawings with RECOMMENDATION pins) — NEW, emitted AFTER
  the Recommendations section. Lettered **Appendix B — Drawings with Pins (Recommendations)**.
- Each appendix shows ONLY its own pin type. Do NOT merge rec pins onto the deficiency
  drawings — keeps the legal separation (recs are "outside scope, not held against
  sign-off") clean and visual.
- Items listed below each drawing match the pins ON that drawing, and the status column
  shows the item's status (Outstanding/Closed) within its own appendix.

## 5. APPENDIX LETTERING (LOCKED)
- "Appendix A — …", "Appendix B — …", "Appendix C — …".
- MULTIPLE DRAWINGS within one appendix stay under the SAME letter (Appendix A can hold
  several drawings; each drawing keeps its title card + pin table, all under "A").

## 6. DRAWING-REPEATS-ON-CONTINUATION (LOCKED)
- Each drawing renders ONCE with ALL its pins.
- If the pin/item list below a drawing is long and flows across pages, the continuation
  pages REPEAT the drawing title with a "(cont.)" marker (mirrors the existing trade
  section "(cont.)" header behaviour — see Fire Alarm (cont.) in the report).
- The items below always correspond to the pins on the drawing shown above them.

## 7. SCOPE / GUARDRAILS
- `go(pg)` PDF pagination recursion is PROTECTED — extend the block model, do not rewrite.
- Mark-present + field-verify on the exported PDF (body label, appendix Item column,
  Appendix A/B lettering, rec appendix drawings, continuation repeats).
- No data-path change (pure report rendering); but it's client-facing so treat as
  field-verify-gated on output.
