# ARENCON_Project_Knowledge.md — S138 Delta

Fold into the canonical `ARENCON_Project_Knowledge.md`. S138 shipped
**Phase 2b complete**: the unified `+ deficiency` modal, the
`defic.isRecommendation` schema, canon-aligned recommendation rendering,
and the "Recommendations only" control-bar filter. Final commit
`d042b40` on `main`.

---

## REPLACES — "Current state"

```
SW:        v416   (was v413 at S138 start)
CSS ?v=:   316    (was v=313 at S138 start)
Tests:     155/155 (was 144 — +11 recSchema.test.js)
Final commit: d042b40   (fb6e151 → 143f0e8 → d042b40, rebased over 48be8f1 docs)
```

## FLIP — forward-looking "NOT yet in code" statements (now shipped)

The following canonical lines describe S138 as a future deliverable. Change them to **shipped S138**:

- `defic.isRecommendation: boolean // default false (NOTE: not actually added to model until S138 …)` → **shipped S138; additive, default false, idempotent `setProject` backfill, generic merge3.**
- "DEFERRED to S138 — Unified `+ deficiency` modal …" / "Recommendation schema: there is currently NO `isRecommendation` field …" → **shipped S138.**
- Gotcha-table row "`+ deficiency` unified modal + `defic.isRecommendation` | NOT yet in code — S138 deliverable" → **shipped S138 (`d042b40`).**
- Roadmap "unified `+ deficiency` modal + `defic.isRecommendation` (S138)" → mark ✅; S139 = PDF restructure + Renumber→PDF-export merge.

---

## ADDITIONS — schema

- **`defic.isRecommendation: boolean`** — additive, default `false`. Set in the `addDeficiency` template; idempotent backfill in the `_migrateDeficArr` loop inside the `setProject` funnel (`if (d.isRecommendation === undefined) d.isRecommendation = false;`, placed right after `delete d.description;`, before the S119 per-obs backfill). Rides cloud merge with **no `merge.js` change** — `_merge3Object` recurses every field; a scalar boolean is handled generically (confirmed by code read; matches the documented "merge3 handles new fields generically" rule). New unit file `frt/tests/unit/recSchema.test.js` (11 tests, mirrors `obsSchema.test.js`) asserts default/backfill/idempotence/round-trip/merge3. Suite 144→155.

## ADDITIONS — data integrity / design rules

- **A recommendation is NEVER relocated.** It stays in its natural group and only gains a REC badge:
  - has-trade + has-contractor → under that trade→contractor, **REC badge**;
  - has-trade + no-contractor → grey "Recommendations" sub-banner within trade;
  - no-trade + no-contractor → "Site General · Recommendations" bottom section.
  This is canon. The S137-era "Option 2 / rec flag wins over contractor" idea was implemented in `fb6e151`, found to violate the canonical Recommendations rule during the requested audit, and reverted in `143f0e8`. **Do not re-propose flag-driven relocation.** The flag's only render effect is the badge.
- **REC badge is rendered by a wrapper, never inside `_buildPinGroupCard`.** `_renderDetailedView` wraps a rec pin's card in `<div class="dfx-rec-pin"><span class="rec-badge">REC</span> …card… </div>`. `.dfx-rec-pin > .rec-badge` is absolutely positioned in the pin-strip's right-side whitespace with `pointer-events:none`. The protected card fn is untouched (still: every pin through multi-obs layout, `renderPinStrip` hardwired true).
- **Creation path:** `Model.addDeficiency(ctrId)` → `Model.updateObservation` / `updateObsPriority` / `updateObsTrade(…, 'manual')` → set additive `isRecommendation` / `drawingId` on the returned live defic (spin-off precedent) → `Model.saveNow()` → force `_activeDlcTab='active'` (new obs is unaddressed) → `render()`. No array hand-mutation.
- **Single creation entry point.** One `.add-deficiency-card` (§20) at the foot of every view (`container.insertAdjacentHTML('beforeend', …)` after the view dispatch). The per-contractor `+ Add Deficiency` rows and the trade-board-foot `+ General Deficiency` button are **removed**. Their `add-defic` / `add-general` action handlers + the dead `buildGroup` emitter remain defined-but-inert (S137 no-rewrite discipline; safe future cleanup, not required).

## ADDITIONS — Deficiencies tab behavior

- **`_flatRows` is the single filter engine and now also carries the recommendation filter.** `_dfxRecOnly` boolean state; predicate `if (_dfxRecOnly && !d.isRecommendation) return;` in both the obs branch and the 0-obs legacy branch. Because all three views consume `_flatRows`, the **"Recommendations only"** control-bar checkbox (`#dfx-reconly`, in `.defic-filters`) scopes Detailed/Table/Board identically with hierarchy preserved (Detailed still groups trade→contractor; empty groups don't render). Composes with the Active/Closed pivot + contractor/priority/search as an intersection. Synced in `_syncDfxControls`; wired in the control-bar `change` listener.
- **Modal uses the documented modal infra**, not a bespoke overlay: `.pin-modal-overlay.open` > `.pin-modal` > `.pin-panel-header|body|footer`, `.field-group` rows (dark-mode + mobile already handled by existing rules), `.modal-checkbox-row` (§20) for the recommendation row (native `for=` deliberately omitted so the row toggles exactly once via the handler), `.btn-outline` Cancel + `.btn-primary` Add. Overlay id `add-defic-overlay`, body-appended + removed, registered in the `app.js` global Esc modal stack after `gp-overlay`.
- Table rec marker and Board rec tag use the canonical `.rec-badge` / the canon-reserved `.dfx-bv-rec` respectively (Table/Board remain read/triage; editing is Detailed-only).

End of S138 delta.
