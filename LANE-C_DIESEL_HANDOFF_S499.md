# LANE-C DIESEL HANDOFF — S499

## ▶ PROMPT OPENER

You are **Lane C (Diesel/Electric)**. Read this block first; it is self-launching.

**Files you own:** `ARENCON_Diesel_Fire_Pump_Commissioning.html`, `diesel-app/**`,
`ARENCON_Electric_Fire_Pump_Commissioning.html`, `lib/calc/**`, `tests/unit/*` (Diesel suites).

**Files you do NOT touch:** `ARENCON_Project_Hub.html`, `index.html`,
`ARENCON_Intranet_Portal.html`, `updates.json`, `lib/ui/portalHeaderConfig.js` — Lane B.
`frt/**` — FRT lane. If a change needs a Lane B file, write the message and hand it to Mark;
do not edit it yourself (this happened in S499 with the Hub pointer and worked well).

**Before trusting ANY claim in this document, verify against live GitHub HEAD**
(Blobs/Trees API). This doc was accurate at commit `0b25b9c`; concurrent lanes move `main`
continuously — five FRT commits landed mid-session in S499.

**Standing command meanings:**
- "Proceed with handoff XXX" = read the tool's PK + this handoff + every delta layered on it,
  then report the to-do list. Do not start work.
- "give me handoffs" = handoff document + delta files only (PK delta + Style delta).
- "give me FULL handoffs" = handoff + COMPLETE regenerated PK + COMPLETE Style Guide
  (Style Guide only if CSS/visual changed).
- Terse approvals ("A", "go", "push it") = proceed immediately.

**Where to pick up:** Mark chose the modularization carve as literally #1 priority and asked
to be held to that. Next decision is his: option A (shrink part06), option B (lock down report
maths), or option C (protected-symbols manifest cleanup). See §6. Do not start a fourth
extraction without his pick.

**Non-negotiables for this lane:** surgical `str_replace` only, never block rewrites.
Syntax check must exit 0. `python3 tools/gate.py --old <live> --new <edited>` and paste output
into the transcript — a push without gate output is invalid. Also run
`python3 tools/push_guard.py <repo-path> <local> --base <pristine>` (needs `GH_PAT` env).
Never hand-edit `sw.js` — run `python3 tools/gen_precache.py --write`. Re-assert live HEAD
immediately before pushing; post-verify via Trees API blob SHA, never CDN.

---

## 1. STATE AT END OF SESSION

| Fact | Value |
|---|---|
| HEAD at handoff | `0b25b9c` |
| Monolith | 18,486 lines / 1,262,086 B |
| `diesel-app/js/part06.js` | 11,800 lines (still the bulk) |
| Diesel tests | **61, all passing** (0 at session start) |
| Shared modules added | `lib/calc/pumpCurve.js`, `lib/calc/curveData.js` |
| Precache entries | 125 (includes both new modules + all `diesel-app/`) |

**Lane C commits this session (5):**
- `fbe6d96` carve step 1 — pumpCurve + tests
- `49d19f1` precache diesel-app (cold-device offline fix)
- `4528254` merge-engine tests (no production change)
- `0b017a4` carve step 3 — curveData + tests
- `0b25b9c` delete stale `diesel-app/app.js`

---

## 2. THE CARVE — WHAT WAS DONE AND WHY IT WAS SMALL

Mark's instruction: break the tool into small modules, put everything on shared modules.
Three steps shipped. **None reduced part06's line count**, and that was deliberate — each
bought provability first, on the code where a silent error reaches a sealed report.

### Step 1 — `lib/calc/pumpCurve.js` (22 tests)
`_interpCurve`, `_curveDevOver1pct`. Pure maths, zero DOM. Decides what the report asserts
about pump performance. Verified by a **9,800-case differential** against the original
monolith functions: 0 divergences.

### Step 2 — merge engine (18 tests, NO production change)
`_mergeCloudLocal` + photo-preserve family, ~785 lines, zero DOM. **Extraction deliberately
deferred.** Mutation testing reintroduced three historical field bugs (S314 flowTestPhotosPld
wipe, S353 index cross-copy, S335 lost fresh photo) — **none caused data loss**, because every
protection has ≥2 independent layers. That redundancy is the safety property and is why photo
loss stopped being a field problem. Carving it risks collapsing two layers into one while
tests still pass. Tests now pin each layer independently, plus a case asserting binaries
survive in all six photo locations.

### Step 3 — `lib/calc/curveData.js` (21 tests)
`_measuredDischargePts`, `_goldenCurve`. Decides where the curve is drawn. **10,000-case
differential**: 0 divergences. Scope kept small on purpose — of ~35 chart functions, most are
Chart.js instance wiring and dark-mode restyling that read the DOM and mutate live chart
objects; moving those relocates code without making it testable or sharable. Global/DOM reads
(`stdData`/`pldData`, cap inputs) **stay in the host**; the module takes values as arguments.
That separation is the only reason the maths is testable.

**Pattern to repeat for every future extraction:**
extract → unit tests → differential vs live original → thin delegate with inline fallback →
gate → verify BOTH builds in a real browser → regenerate beta → `gen_precache --write` → push
→ Trees API post-verify.

---

## 3. CORRECTION — THE PHOTO ENGINE IS ALREADY SHARED

Earlier in S499 this lane listed "ui/photos — 68 functions" as a large extraction target.
**That was wrong, and Mark caught it.** The shared photo engine is already built and already
consumed by both tools: `photoInput`, `cameraBurst`, `markupTools`, `markupSelection`,
`markupText`, `markupEraser`, `photoMint`, `lightbox`.

What remains in Diesel is **Diesel-specific wiring** connecting those shared primitives to
Diesel's own surfaces (checklist items, flow-test rows, deficiencies, general deficiencies,
sketches, record photos). It cannot be shared because each tool's screens differ. The eight
`_galleryReuse*` functions were checked as the best duplication candidate — they are already
4 lines each and each targets a different data shape; unifying them would add indirection for
no gain.

The error was counting functions whose names matched `photo` without checking what they did.
**Do not re-propose "extract photos to a shared engine."** The only real photo candidate left
is the flow-photo modal (~25 `_flowPhoto*` functions) — Diesel-only UI, worth extracting for
file size, not for sharing.

---

## 4. NON-CARVE WORK THIS SESSION (all verified live)

- **Checklist photo attach — ROOT FIX.** Boot `renderChecklist()` ran during parse, before the
  deferred `photoInput.js` module executed, so all 60 photo zones were baked with
  "engine not loaded" and nothing repainted them. **This affected the live monolith too**, not
  just the beta — checklist photos could not be attached at all. Fix: `_mountPhotoInput` calls
  the existing `_dslRefreshPhotoSurfaces()` once when the engine arrives. Verified live:
  0 baked hints, 120 real engine buttons. Mark confirmed on tablet.
- **Auth gate** (cross-lane from Lane B). `shared/auth-gate.js` added to Diesel head at
  Electric's exact placement; beta mirrors as `../shared/auth-gate.js`. Mark confirmed no
  prompt on an already-signed-in device.
- **Export modal → engine panel** (Batch 2a). Live, Mark-approved. Gains engine ✕, Cancel
  leftmost, accent-wash header, Esc/✕ parity. Fail-safe deliberately differs from `_aConfirm`:
  engine absent falls through to PDF with last saved distribution rather than blocking, because
  blocking an export strands an inspector.
- **Cold-device offline fix** (Lane B finding). `gen_precache.py` excluded `diesel-app/` as a
  beta lane; after Lane B's Hub flip, the build the field opens had **zero** files precached.
  Warm devices worked (same-origin is network-first and populates the runtime cache — which is
  why airplane-mode testing passed); a cold device would have failed completely with no signal.
  Fixed in the generator, verified end-to-end: fresh browser installs SW, goes fully offline,
  Diesel boots.
- **Hub pointer flip** — Lane B applied it (`2c6b493`). `diesel-app/` is now what the field opens.

---

## 5. OPEN ITEMS

**Needs Mark, not the assistant:**
- **Protected-symbols manifest cleanup.** 182 of 270 entries match neither Diesel nor FRT —
  the gate is guarding renamed/removed symbols while real shipped features (export modal,
  photo-attach fix, the new calc modules) have no coverage. Only Mark may edit that file.
- **Monolith retirement.** Both copies are live and both receive every fix; the monolith is
  reachable by direct URL as a fallback. Recommendation: keep until the team has run real
  commissioning jobs on `diesel-app/` without incident. Needs explicit say-so.
- **Field-verify pump curves** on a real project (S499 changed the maths path; browser-verified
  but not eyeballed on a tablet).

**Carried, Diesel/Electric:**
- Electric photo architecture port — flagged in the tool inventory as highest field-safety
  priority; predates the carve. Electric lacks Diesel's photo protections.
- Electric queue: autosave watchdog → unified photo-delete verb → photoMint →
  R2Outbox/tombstones/camera burst/auth-gate.
- `clState["null"]` junk key purge; `tool_data_history` witness-row check.
- `_NEXT.html` retirement (recommend retire).
- Batch 2 remainder: Report Photos grid (1040px), photo reuse picker.
- Option B two-column export modal — demo built, Mark decided against adopting it as a layout
  exercise; revisit only if the Scope column gains real controls.

**Cross-lane:**
- 7 FRT unit tests failing on `main` (contractorTrades, markupMerge, obsSchema, r2Client) —
  pre-existing, not Lane C's work, but they now sit in the same `npx vitest run` output as the
  Diesel suites. Worth telling the FRT lane before people stop reading test output.

---

## 6. NEXT SESSION — MARK PICKS ONE

**A — Shrink part06.** Extract flow-photo modal (~25 fns), deficiencies UI, PDF builder into
their own files. Real line reduction; produces nothing another tool can use. **Caveat:** these
blocks are DOM-heavy and cannot be differentially tested the way the maths modules were, so
verification falls back to browser checks and Mark's eye on a tablet — each step is riskier
than S499's three.

**B — Lock down remaining report maths** (recommended). Smaller pieces, larger consequence:
the code deciding what a sealed report asserts, which fails silently when wrong. Same proof
pattern as steps 1 and 3.

**C — Protected-symbols manifest cleanup.** Quick, restores a safety net Mark is currently
relying on more than it deserves. Assistant presents the 182 dead entries and the uncovered
real features; Mark decides; assistant applies.

Recommendation order: **B, then C, then A.** A is worth doing but should follow the maths work
because it lacks the same safety net.

---

## 7. PROCESS NOTES FOR THE NEXT SESSION

- **Concurrent writers are constant.** HEAD moved mid-push in S499. A `safe_push_preflight.sh`
  pattern exists: compare HEAD against expected, and hard-fail if any intervening commit
  touched a file being pushed. Use it rather than relying on care.
- **Generated files: never hand-merge.** When `sw.js` conflicted during a rebase, the correct
  resolution was to take upstream wholesale and re-run `gen_precache.py`, then prove upstream's
  non-generated content was byte-identical.
- **Beta regeneration is mechanical and must be re-proven each time.** The `diesel-app/` split
  is derived from the monolith by a lossless segmenter; after every regeneration, prove the
  reassembled beta differs from the monolith by **exactly** the `../` path lines (22 as of
  `0b25b9c`) and nothing else.
- **A test that cannot fail protects nothing.** In S499 the first merge-test harness passed for
  the wrong reason: a missing helper caused a `ReferenceError` that the real code's `try/catch`
  swallowed, silently skipping a whole deletion-reconcile pass. The harness now self-checks its
  dependency closure and throws if a helper is missing. Mutation-test any new safety-critical
  suite before trusting it.
- **Verify in a real browser, not just by parsing.** Browser checks caught three genuine bugs
  this session that syntax checks could not: the photo-zone boot race, shadow-root breakage of
  `document.getElementById` after the export-modal migration, and an invented engine method
  (`Dlg.closeTop`) that does not exist.
- **`git checkout` to revert one bad edit takes good edits with it.** This happened in S499;
  caught immediately, redone cleanly. Prefer targeted `str_replace` reversal.
