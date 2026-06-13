# FRT_OPEN_ITEMS.md — code-verified open items
**Verified against live HEAD (S325 state). This is the SOURCE OF TRUTH for what's open — verify against live code, not handoff prose.**

Maintenance rule: before adding anything here as "open," grep the live repo to confirm it isn't already built. Items have drifted as "open" while already shipped. Re-check each session.

---

## OPEN — ready / in progress
| # | Item | Type | Gate | Effort | What's left |
|---|------|------|------|--------|-------------|
| 1 | "New this report" donut indicator | Viz | Mark to pick A vs B | S | Inner blue ring is HIDDEN when all items are new (confirmed live, pdf.js _innerA3). Decide: (A) distinct outer-ring arc segment, OR (B) keep inner ring but show even when all-new. |
| 2 | Combined View filter-row | Feature | Inspect first | S | Filter/sort row ported as-is; flagged possibly cramped on mobile, UNVERIFIED. Tidy or confirm-fine-and-drop. |
| 3 | Hub Bold rollout | Feature | Own session | L | Project Hub still on older look; bring onto ARENCON Bold light/dark. Big standalone. |
| 4 | Safe-area: remaining tools | Polish | Ready (proven pattern) | M | S322 covered FRT/Diesel/Hub/Electric. Still: IST, OBC, DD Checklist, Training Center, Training Admin, Resource Planner, Intranet Portal, Org Chart, Trapeze Calc, Onboarding Quiz + toolkit portal (BLOCKED on repo path — root index.html is the Tablet Rescue diagnostic, not the portal). |
| 5 | PK / docs consolidation | Docs | Scope unconfirmed | M | Regenerate one ARENCON_FRT_PK.md from scattered PK + deltas. |

## SHIPPED since last doc update (S316–S325) — do NOT re-add
- S316: Markup nav lock-in; Deficiency Summary footnote (later REMOVED by Mark S317); rec footer disclaimer removed; export-bar counter-scales vs zoom.
- S317 (a–f): Report Item # (Option E `1 · Pin 3A`); lettered defic/rec appendices (A/B) with Item column; rec item #s RESTART at 1 (Option A, LOCKED); photo gallery green=Closed + filter-aware badges; rec colour unified to brown #5E5440; Appendix B drawing render fix; Add Photos merge (Upload+Camera); Site Record = NO CONTRACTOR (not priority).
- S318: PDF page-1 dashboard — Resolution Progress box → compact Report Legend; standalone legend band dropped in full/compact.
- S319→S320: minimap container slack — aspect-lock attempt reverted (broke card grid + shrank pin box); replaced with column-safe height cap on drawing-pin editor box only.
- S321: mobile pin-editor — safe-area-inset-top header + 44px close target + 100dvh + footer inset; tool-wide _frtScrollLock; static minimap teardrop = canonical drawing pin (Path2D); two-finger pinch-zoom in _PinPan; portrait thumb now interactive.
- S322: tool-wide safe-area root fix (grouped rule + .safe-top/.safe-bottom/.safe-x utilities) across FRT, Diesel, Hub, Electric.
- S324: photo badges + card round-badges always show obs letter (1A/2A) even single-obs (PDF left as-is); drawing-viewer pin editor centers vertically; deficiency-log minimap canvas bg white→transparent (slack matches themed dark box).
- S325: removed S323-DBG re-sort instrumentation (re-sort confirmed FIXED by Mark).

## DECIDED / REMOVED — do not re-add as open
- "New This Report not-additive footnote" — Mark REMOVED it (S317, reads as clutter). Decided.
- Rec item-# numbering — LOCKED Option A (restart at 1), S317. Decided.

## DROPPED — do NOT propose again
- Contractor roster relocation (Mark dropped twice). Remove-New-Project-modal-fields (no such modal). FRT rewrite business case / principals deck (permanently excluded). Deficiency templates / quick-add. iOS support.

## CONDITIONAL / MAINTENANCE
- Diesel/Electric/Training modal re-verify — concurrent writers can clobber cross-tool fixes. Re-check at session start.
