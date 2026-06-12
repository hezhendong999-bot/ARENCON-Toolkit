# FRT_HANDOFF_S316.md — Session S316 → next session

**Session-end HEAD:** `6d07390ea36574bd877e19052a4319b437b1b85f` (last FRT push; re-assert live HEAD via API before any work — concurrent Diesel/Electric/Training writers move `main`).
**Versions:** SW `arencon-frt-v767` · `frt.css?v=605`.
**PAT pasted in chat = BURNED — rotate.**

---

## 1. SHIPPED (S316)
| SHA | What |
|-----|------|
| `37c8978` | Markup nav lock-in (paging prev/next mid-markup commits current photo first, never discards — Diesel parity) + code-verified `FRT_OPEN_ITEMS.md`. |
| `f5bb7f7` | Deficiency Summary footnote — "New This Report" is a non-additive overlay column (Total = Outstanding + Closed). Donut inner-arc design UNCHANGED (Mark-locked). |
| `6d07390` | Removed redundant Recommendation footer disclaimer (already in section header subtitle). + Export-PDF bar counter-scales against browser zoom (stays fixed size when zooming the drawing — `_fitBar` via `visualViewport.scale`). |

## 2. 🔒 LOCKED & READY TO BUILD — Report Item # + Recommendation Appendix
Full spec in **`LOCKED_REPORT_ITEM_NUMBER_S316.md`**. Summary:
- **Item # label (Option E, LOCKED):** `1 · Pin 3A` — report-sequential item # (burgundy 11pt bold) · the word "Pin" + pin#/obs# (dark slate). RESETS PER REPORT, no gaps, assigned in body render order. Single-obs pins = `Pin 3` (no letter). Leads the row, before the description. Pin#/obs# NOT dropped. Approved demo: `item_label_demo.html` Option E.
- **Appendix pin table:** add leading **Item** column (Item | Pin | Description | Status | Contractor).
- **Recommendation Appendix (LOCKED):** Deficiency Appendix stays BEFORE Recommendations = "Appendix A — Drawings with Pins (Deficiencies)"; NEW Recommendation Appendix AFTER the Recommendations section = "Appendix B — Drawings with Pins (Recommendations)". Separate pin types, never merged (preserves outside-scope legal separation).
- **Appendix lettering (LOCKED):** A/B/C; multiple drawings share one letter.
- **Continuation (LOCKED):** drawing renders once with all pins; long item lists flow across pages REPEATING the drawing title with "(cont.)"; items below always match pins above.
- **Open sub-decision:** do recommendation item #s restart at 1 in the rec section (default rec) or continue the main sequence? Confirm with Mark at build.
- **Guardrail:** `go(pg)` pagination recursion is PROTECTED — extend, don't rewrite. Mark-present + field-verify on the exported PDF.

---

## 3. FULL OPEN-ITEMS TABLE (nothing omitted)

### Features / builds
| Item | Cause (plain English) | Pre (now) | Post (after) | Recommendation |
|------|----------------------|-----------|--------------|----------------|
| **Report Item # + Rec Appendix** (LOCKED, §2) | Report shows pin #s which jump around; recs have no drawing appendix; appendices unlettered | Pin-only numbering; recs disconnected from drawings | `1 · Pin 3A` item layer + Appendix A (defic) / B (rec) lettered drawings + Item column in pin table | **DO IT** — locked, next focused session |
| **Combined View filter-row redesign** | Filter/sort row ported as-is when Detailed+Board merged; flagged maybe cramped | Works; unverified if actually bad | Cleaner row OR confirmed-fine-and-dropped | **Inspect first**, then decide — don't build blind |
| **Hub Bold rollout** | Hub never got the Bold light/dark theme | Hub on older look | Hub on ARENCON Bold | **Do as own session** — big separate file, screen-by-screen |
| **PK consolidation** | Knowledge spread across PK + many deltas | Read several files to get current | One regenerated `ARENCON_FRT_PK.md` | **Do soon** — cheap, stops drift |

### Known bugs / watch-items
| Bug | Cause | Pre | Post | Recommendation |
|-----|-------|-----|------|----------------|
| **WebGL context-loss during heavy markup** | GPU drops the canvas under memory pressure on tablets | Recovery fires (tablet→Canvas2D, desktop 3× retry) | n/a | **Watch only** — robust recovery exists; not a defect |
| **SW "Not found" on rapid reload** | Update-check hits momentary CDN lag during fast reloads | Intermittent console error, self-clears | n/a | **No action** — not a code bug |
| **Cloud-push timeout (residual)** | Worker-RPC scaling fixed; `_rawFetch` has no network-abort timeout | Telemetry in place; large-project false-timeout fixed | If recurs, read `_diag` for network-vs-worker | **Leave until recurs** — needs a captured real timeout; don't blind-patch |
| **Markup paging stash (Diesel `_mkDraft` parity)** | FRT commits-on-nav; Diesel STASHES drafts to resume mid-drawing | Can't page away + return to a half-drawn uncommitted markup to keep editing (it commits) | Page away → return → resume in-progress strokes | **Optional** — only if Mark wants to resume mid-drawing across photos; commit-on-nav already prevents loss |

### New items I proposed (Mark to accept/decline)
| Proposed | Why | Recommendation |
|----------|-----|----------------|
| **DRY the closed predicate in PDF** | `_rowClosed` and the closed-summary inline predicate are identical logic written twice — divergence risk if one edited | **Low-priority cleanup** — have closed-summary call `_rowClosed` |
| **Photos page: persist last-used filter** | New clickable stat filters reset to "All" each visit | **Nice-to-have** — remember last filter per session |
| **Report: Outstanding high/low split in summary table** | Summary shows one Outstanding column; donut splits high/low | **Ask first** — only if team wants table to mirror donut; risks clutter |
| **Markup: pinch-zoom while marking** | Markup forces fit-scale (no zoom); fine detail on big drawings is hard | **Defer** — real value but non-trivial coordinate math; park unless field asks |

### DROPPED — do NOT propose again
- **Contractor roster relocation** — Mark dropped it (twice).
- **"Remove project-info fields from New Project modal"** — no such modal exists.
- FRT rewrite business case / principals deck; deficiency templates / quick-add; iOS support.

### CONDITIONAL / MAINTENANCE
- **Diesel/Electric/Training modal re-verify** — concurrent writers can clobber cross-tool fixes (Diesel modal fix was reverted once). Re-check their modal state at session start.

---

## 4. LOCKED DESIGN REFERENCE (the donut — do NOT change)
"New this report" indicator stays a thin INNER blue arc/ring, aligned under the outer
status segments, HIDDEN when ALL items are new ("a full circle says nothing"). S284 A3,
Mark-confirmed kept exactly as locked this session. Located deficiencies.js ~1066-1074
(on-screen) and pdf.js `_innerA3()` ~650-657 (PDF). DO NOT convert to an outer arc.

## 5. REPORT APPENDIX SUMMARY REVIEW — CONCLUSION (S316)
Reviewed thoroughly per Mark. **Logic is CORRECT.** Deficiency Summary excludes recs
(S144, no double-count) and Site Records (S154, opt-in). `_rowClosed` (pdf.js 584) ≡ the
closed-summary inline predicate (515) — same logic, can't diverge (minor DRY only). Donut
and table share predicates so they can't disagree. "New This Report" is a correct
non-additive overlay column (footnote added `f5bb7f7`).

## 6. DISCIPLINE
Re-assert HEAD via API; pull fresh; build→validate (`node --input-type=module --check`,
CSS brace balance, HTML div balance)→push (re-parent live HEAD, force:false)→post-verify
raw at new SHA. SW + css bump lockstep on any FRT push. PAT burned — rotate.
