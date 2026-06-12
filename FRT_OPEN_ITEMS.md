# FRT_OPEN_ITEMS.md — code-verified open items
**Verified against live HEAD `160d4ba` (S315 state). This is the SOURCE OF TRUTH for what's open — verify against live code, not handoff prose.**

Maintenance rule: before adding anything here as "open," grep the live repo to confirm it isn't already built. Multiple items drifted as "open" while already shipped (Combined View, Repair button, pin mini-map, badge exclusivity, N+1 lifecycle). Re-check each session.

---

## OPEN — ready / in progress
| Item | Type | Gate | Pre-change | Post-change |
|------|------|------|-----------|-------------|
| "New this report" donut indicator (Defic Log + PDF) | Viz | Mark to pick A vs B | Shown as a thin INNER blue ring, aligned under status segments, HIDDEN when all items are new (current case: 5/5 new → invisible). S284 A3 locked. | (A) distinct outer-ring arc segment, OR (B) keep inner ring but show it even when all-new. Mark deciding. |
| Combined View filter-row redesign | Feature | Inspect first | Filter/sort row ported as-is from Detailed+Board merge; flagged possibly cramped, UNVERIFIED | Cleaner row, OR confirmed-fine-and-dropped |
| Hub Bold rollout | Feature | Own session | Hub on older look | Hub on ARENCON Bold light/dark |
| PK consolidation | Docs | Scope unconfirmed | Knowledge spread across PK + deltas | One regenerated `ARENCON_FRT_PK.md` |

## DONE (do not re-add)
- Combined Deficiency View · Resolution Dashboard · Photo dedup/Repair button · Pin mini-map · Site/obs badge exclusivity · Unassigned-Outstanding flag · N+1/N+0 lifecycle
- Markup Select/rotate/resize + opacity · MS-Paint text (lightbox + viewer create+edit) · Contractor Highlight + green closed pins
- Bug fixes: site→pin reassign · cloud-push timeout (worker-RPC scaling) · group-drag · lightbox text tool
- Tasks panel obs-rows · pin-# gaps legend note · site Upload/Camera MERGED (one Add Photos, burst) · favicon consistency (Hub/portal/intranet)
- Photos page: clickable stat-tile filters (colour kept) + Select all + full-category dropdown
- Modal backdrop-close DISABLED everywhere (FRT incl. AI Usage/Assistant/mobile-menu, Diesel x5, Electric x5, Hub QR, lightbox)
- Markup auto-commit on exit (pencil/X/Escape/close) + nav lock-in (commit-before-page)

## DROPPED — do NOT propose again
- **Contractor roster relocation** — Mark dropped it (twice). Do not resurrect.
- **"Remove project-info fields from New Project modal"** — no such modal exists; info entered in Project Info tab.
- FRT rewrite business case / principals "delivered vs promised" deck — permanently excluded.
- Deficiency templates / quick-add — removed from roadmap.
- iOS support — abandoned.

## CONDITIONAL / MAINTENANCE
- Diesel/Electric/Training modal re-verify — concurrent writers can clobber cross-tool fixes (Diesel modal fix was reverted once). Re-check at session start.

---

## REPORT APPENDIX SUMMARY — REVIEW FINDINGS (S316, reviewed thoroughly per Mark)
**Conclusion: logic is CORRECT.** Details:
- **Deficiency Summary** excludes recommendations (S144 — no double-count) and Site Records (S154 — internal, opt-in only). Columns Total / New This Report / Outstanding / Closed, per contractor + grand total. ✓
- **Closed/Outstanding predicates consistent:** `_rowClosed` (pdf.js 584) and the closed-summary inline predicate (515) are IDENTICAL logic (per-obs `addressed` wins, else `_deficIsClosed` = effective status). They can't diverge. Minor DRY opportunity only (have closed-summary call `_rowClosed`), not a correctness issue.
- **Donut ↔ table consistency:** both use the same predicates (`notedOnInstance`/`_rowOpen`/`_rowClosed`), so they can never disagree. ✓
- **Recommendation Summary** is a separate pooled section; recs stripped from the deficiency tally. ✓
- **One clarity note (not a bug):** "New This Report" is a NON-ADDITIVE overlay column — `Total = Outstanding + Closed`, while New overlaps both (a new item is also open or closed). Numbers are correct but the four columns intentionally don't sum. RECOMMEND: a small clarifying footnote under the Deficiency Summary, e.g. "New This Report counts items first logged on this report; it overlaps Outstanding/Closed and is not additive." (Mirrors the pin-number gaps legend note.) Mark to confirm whether to add.
