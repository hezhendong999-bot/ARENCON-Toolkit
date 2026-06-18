# DIESEL PDF REPORT REDESIGN — INTEGRATION PLAN (S366, verify-required)

**Status:** scoped, NOT built. The report goes to clients + AHJs; this is a rewrite of the
live report-builder and must be done WITH Mark verifying (no dropped content, correct field
mapping, pagination intact). Do not ship unattended.

**Reference redesign (visual + style source of truth):** `reference/diesel_report_redesign_REFERENCE.html`
(pushed S366, commit 7997c870a1). It's a static mock with sample data (York U / Aurora / Clarke /
Firetrol) — NOT wired to anything. Use its CSS classes + layout; ignore its sample data.

**Live report-builder:** `_realExportPDF()` (Diesel ~line 9134), invoked via `_exportPDFGo()` (9120),
writes to a new window at ~9547. Keep the existing mechanism (new window → paper preview on #525659 →
paginate → print). Only the **markup + CSS of the body** change.

---

## MARK'S DIRECTIVES (S366)
1. **KEEP the current Status Overview pie/donut chart** (`_ovHtml`, S317) — do NOT replace it with
   the mock's tiles version.
2. **KEEP the current Inspection Completion table/bars** — do NOT replace with the mock's version.
3. Adopt the redesign's format/style for EVERYTHING ELSE.
4. **LOSE NO CONTENT** — every table/checklist/photo group the live report emits today must remain.

---

## AUTHORITATIVE CONTENT INVENTORY (what the live report emits today — keep ALL of it)

In order, as emitted by `_realExportPDF()`:

1. **Header block** — FRT-style (logo, address, title block, pi-list: Date of Issue, Date of Site
   Review, Distribution, Prepared By, Project No.). Continuation header `.ph-compact` on later pages.
2. **Status Overview donut** (`_ovHtml`) — checklist outcomes (yes/no/na/incomplete) across sections
   1/2/3/5 incl. custom items. ← **KEEP AS-IS**
3. **Inspection Completion** — answered/total overall + per-section bars. ← **KEEP AS-IS**
4. **1. Prior to Commissioning Date** — `clSection(S1,'s1')` checklist table (num · text · Yes/No/NA ·
   comment), with photos in a spanning row under any item that has them.
5. **2. Visual Inspection** — `clSection(S2,'s2')`.
6. **3. Pump / Controller / Louver Tests**:
   - **Battery Start-Up Time Test** table (BAT_TESTS × batData.b1/b2, 2 batteries).
   - `clSection(S3,'s3')` checklist.
7. **4. Fire Pump Test Results**:
   - **Pressure Settings** table (Designed vs Field Setting psi).
   - **3-Point flow table** (pct/flow/cutsheet/placard/suction/discharge/net/rpm + PASS/FAIL via
     `_calcFlowPoint`). ← verdict now NFPA 20 (S366 criteria) — make sure PDF reflects effective verdict.
   - **3-Point Performance Curve** (chartImgA) + readout strip + safety margin.
   - **3-Point Net Pressure Curve** (chartImgD).
   - **7-Point flow table** (pct/flow/cutsheet/placard/suc_no/dis_no/rpm_no/suc_w/dis_w/rpm_w +
     PASS/FAIL via `updatePldVerdictObj`).
   - **7-Point Discharge Curve** (chartImgB) + safety margin.
   - **7-Point Net Pressure Curve** (chartImgC).
   - NOTE: only the active test type (3pt OR 7pt) renders, per the report's test-type selection.
8. **(S4 items)** Performance Test checklist — `clSection(S4_items,'s4')`.
9. **5. Fire Alarm & Controller Signaling Tests** — `clSection(S5_mandatory,'s5m')` + `clSection(S5,'s5')`.
10. **Deficiency Summary** — per-contractor: each deficiency (priority, description, date, photos)
    + contractor responses (text + photos). "No deficiencies recorded" green box when empty.
11. **Signatures** — sig-grid / consultant + contractor signature blocks.
12. **Gauge / RPM test-reading photos** — labeled by point+location (0% Suction, 100% Discharge,
    100% Backflow Intake, RPM/tach, etc.). The LIVE label list is authoritative (not the mock's).
13. **Certification** — accordance statement (keep). Limitation/AHJ-acceptance sentence REMOVED.

**Removed fields (do NOT reintroduce):** room/ambient temp, jacket-water temp, oil pressure,
"Next Due", certification limitation sentence.

---

## INTEGRATION STEPS (when Mark is present)
1. Copy the redesign's CSS (`.ph/.ph-addr/.title-block/.pi-*/.ph-compact*`, `.sh/.sb`, `.st`+pills,
   `.no-detail/.nd-*`, `.kv-*`, `.curve-*/.cp-*`, `.pd-*`, `.def-*`, `.sig-*/.cert`, density vars)
   into the report builder's `<style>`. Keep logo_base64 + Blair @font-face.
2. Re-skin each inventory item above onto the matching classes. **Splice the existing `_ovHtml` donut
   and the Inspection Completion block in unchanged** (items 2–3) — wrap in `.sh/.sb` for visual
   consistency but keep their internal SVG/bar markup.
3. Map every checklist `clSection` onto `.st` tables with `.pill.yes/.no/.na`; photos under "No"
   items via `.no-detail/.nd-photos` (wraps any count).
4. Flow tables → `.st`; curves → `.curve-panel` (two panels: Net + Discharge), real points vs
   certified curve; `.curve-meta` reflects 3pt/7pt + With/Without PLD.
5. Deficiencies → `.def-*` cards; gauge photos → `.pd-*` slots with the LIVE labels.
6. Density default = Balanced; screen-only toggle bar hidden in `@media print`.
7. **Before commit:** diff-summary of which sections changed; CONFIRM none dropped (check every
   item 1–13 above renders with real data). Validate: extract scripts → node --check exit 0; CSS
   brace balance. Open with a real project, verify pagination + Save-as-PDF on letter.

## RISKS / WATCH-OUTS
- Test-type gating: only 3pt OR 7pt section renders — don't emit both.
- S366 verdicts are now NFPA 20 + override-aware; the PDF flow tables must show the EFFECTIVE
  verdict (incl. manual overrides), consistent with on-screen.
- The donut + completion blocks read live counts; keep their data wiring intact when re-wrapping.
- Photo URLs use `p.r2Url||p.d`; keep that fallback so cloud + local both render.
