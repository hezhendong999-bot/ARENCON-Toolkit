# DESIGN — PHASE 4 · COVER / BODY SPLIT (Diesel report → shared engine)

**Status: PROPOSAL for future unification work. Not a Diesel defect. Restoring this document obligates nothing.**

**Provenance.** Written at S686c. Confirmed absent from both the repository and project knowledge at S718. Its substance was preserved verbatim in `ARENCON_Diesel_PK.md` §1.14 and this file is restored from that record at S722, per item 6 of the approved road to Diesel 100% (Owner: *"Finish item 5"* / D4). Where this file and the PK disagree, the PK wins.

---

## 1. The problem

`_realExportPDF` in the Diesel tool is ~696 lines doing two jobs at once.

**~500 lines describe what a Diesel commissioning report looks like** and belong in the shared export engine:

| Region | Approx. lines |
|---|---|
| Print stylesheet | 96 |
| Cover frame | ~70 |
| Status Overview donut and bars | ~55 |
| Section shell | ~60 |
| Data panels | ~120 |
| Chart frames | ~30 |
| Verdict boxes | ~40 |

**66 lines are Diesel reading its own screen** and must NOT move:

- checklist harvest over `clState` / `customItems` / `S1`–`S5` / `cid()`
- `toBase64Image()` on four live Chart.js objects
- `toDataURL()` on live canvases
- `batData` reduction
- `getProjInfo()`
- the photo source arrays

If those move, the engine ends up holding one tool's state while wearing a label that says it is shared — the exact failure the shared-engine rule exists to prevent.

## 2. Proposed seam

Diesel builds **one plain object** and the engine returns the document:

```
{ meta, cover, sections, panels, figures, verdict, appendix }
```

Section order and headings become a **per-tool config** — `diesel.layout.js`. Electric ships its own layout file rather than its own code.

## 3. Proposed order — one per session, each independently shippable

1. Print stylesheet
2. Cover frame + Status Overview
3. Section shell
4. Panels and figures
5. `buildReport` assembled + `diesel.layout.js`

## 4. Gate 0 — before any of it

**Owner's printed-report field check** (item 7 of the road to Diesel 100%): cover donut reads 61 (was 55), the "4. Performance Test" completion bar appears, no blank pages, no text running off the sheet, PDF text selectable and searchable.

Five extractions are already stacked on that document with no printed page behind them. Nothing in this proposal starts until that check has been done on a real device.

## 5. Four questions Owner has not yet answered

1. Is the seam object (§2) the right shape?
2. One layout config per tool, or per section?
3. Stylesheet first, or cover first?
4. **The S686 band-orphan finding** — a section heading stranded at the foot of a page when the verdict box pulls the summary onto a fresh sheet. Fix it, or leave it as it has always behaved?

---

*Restored S722 from `ARENCON_Diesel_PK.md` §1.14. Do not treat as a build prompt.*
