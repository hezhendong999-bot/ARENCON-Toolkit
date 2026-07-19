# ARENCON Field Review Tool (FRT v2) — Project Knowledge (CANON)

**Scope:** This is the **FRT-only** canon. Load it together with `ARENCON_Platform_PK.md` (the shared spine — repo/push discipline, R2/Supabase/Cloudflare/Azure architecture, ARENCON Bold + muted palette, data-integrity lineage, PDF standard, working style, debugging rules) for every FRT session. Anything true of more than one tool lives in Platform, not here.

**What FRT is:** the flagship — a modular ES6 **PWA** (~40 ES6 modules under `frt/js/`; NOT the old single-file v1, which is fully retired). **Live:** `…github.io/ARENCON-Toolkit/frt/`. A `…Field_Review_Tool.html` single-file monolith may appear in uploads — it is **NOT deployed**; always verify findings against GitHub HEAD.

**Live triad at last reconcile (S440):** FRT_BUILD `S440`, SW `arencon-frt-v1026`, `frt.css?v=664`, HEAD `0ded68d0`. (Concurrent Training-Center writer moves HEAD between sessions — always re-assert via the re-parent helper before any push. Earlier reference points: S432 `812f25b`/`f6a8635`; S425 v1005; S414-arc v991-era; S389 v962/`d3aff48`; S368 v931/`f1f9735`; S357 v920/`d2c2f90`; S349 v906/`8079345`; S340 v878/`47ad7287`; S328 v799/v637/`5ecd084`; S272 `a2c210ef07`/v730/v567; S265 `f38f931`/v723/v563; S233 `5a8294cc`/v600/v451.)

> **⭐ CONSOLIDATION NOTE (S440 canon pass):** This file folds the FRT delta chain **S329→S440** on top of the S328 base below. The base body is preserved verbatim; the handful of statements a later session explicitly superseded are corrected inline (marked `[S###]`), and everything new lives in **the consolidated part at the end** (`## S329→S440 CONSOLIDATED CANON`). Where any base-body note conflicts with the consolidated part, **the consolidated part wins.** Verified against live HEAD `0ded68d0`.

> **Canon-pass note (this file):** S328 pass folds the FRT field-testing fixes (pin-editor regressions, render-flash family, smooth mini-map resize, pin-editor cleanup, obs-or-pin delete modal) on top of the S272 base. Earlier folds: S249, S259, S261–S266→S269b, S272 and the locked specs. Where a later session supersedes an earlier note, the later one wins and the earlier is dropped or marked superseded.

---

## ⛔ DO NOT RESURFACE — FRT authoritative ledger

Never re-propose, re-investigate, or list any of these as a next step, priority, or fallback.

| Item | Status |
|---|---|
| **IAR feature** | **FULLY RETIRED** (UI gone S135; S143 clears legacy `iar:true`→false on load; PDF IAR column removed). Never re-add IAR UI, `toggleIAR`, or the pink `#E91E8C` IAR badge. |
| **Bug A** (pool-orphan integrity warnings, 4380.24) | **CLOSED (S204)** — not a defect. Pin #13 is a recovery deficiency by design. |
| **`reconcileFailedAgainstR2()` (Option 3)** | **SHIPPED & field-verified (S203)** — self-heals stale-FAILED outbox rows. |
| **Bug B** (markup conditional-PUT 412 storm) | **FIXED (S205)** — cache-busted the markup GET in `r2.js`. |
| **4380.24-class silent photo loss** | Mechanically closed since S173 (Fix A: outbox + reconcile). Do not re-open the Fix A/B/V-1/V-2 sync backlog as a "next step" — any sync change is field-day-gated, Mark watching only. |
| **Header dropdown z-index** (Reports / AI Review / More) | **FIXED** (HEAD `4431632e9e`). The Bold reskin's `z-index:1` flattening rule had demoted `.app-header` to z:1. Do not re-add `.app-header` to the z:1 flattening group; keep `.app-header{position:sticky;z-index:1000;}`. |
| **S206 feature build** (Move/Copy ⤴ reach, per-obs scoping, board touch-drag, M3 thumb targets, orphan deletions) | **NEVER PUSHED — that build was LOST (container reset).** Pieces rebuilt later where still wanted (per-obs scoping shipped S209; gallery ⤴ defic shipped S216). Do not cite S206 as live history. |
| **Mobile backlog M1 / M2** | **COMPLETE (S166/S188).** Drawings grid `minmax(280px,1fr)`, pin-editor vertical stack, trade-pill flex-wrap. |
| **Mobile backlog M3** (touch-target audit) | **SUBSTANTIALLY COMPLETE (S178/S188)** — photo-thumb corner buttons have ≥44px hit areas. |
| **`hubBridge.js` / `ui/pins.js`** | **DELETED (S206)** — proven orphans. Do NOT recreate or "restore." |
| **`markupEngine.js`** | **⚠️ LIVE — NEVER DELETE.** Looks orphaned (not ES-imported, uses `self.`) but it sets `window.MarkupEngine`, consumed by `ui/lightbox.js` for the photo-markup toolbar. Any dead-code pass must treat it as live. |
| **In-file dead handlers / diag modules** | **KEEP (S137 + S206).** Diag modules are the dormant field-debug toolkit; inert handlers stay defined. "No dead code" applies to provably-unreachable FILES only. |
| **Obs photo-tile button overlap** | **FIXED S207** — one control per corner: ⤴ pin top-left, ✕ del top-right, ✨ AI bottom-right, ✓ sync badge bottom-left. |
| **Auto-refresh force-reload disruption** | **FIXED S207** — forced `reload()` on `sw-updated` replaced with a non-disruptive top-center "Update ready" banner (Refresh / Not now); `boot()` restores tab + scroll. Do NOT restore the force-reload (it once cost a field day). |
| **S146/S147 trade fan-out** (untagged pin listed under EVERY trade) | **RETIRED + SHIPPED S208.** Detailed view uses `Model.derivePinTradeSingle` → each pin under ONE trade. |
| **Trade tint / trade stripe on deficiency rows/cards** | **Do NOT re-propose.** Locked S208: trade = the navy band (`#2A3A5C`); contractor = the colour. One colour language per element. |
| **Deficiency List redesign re-demo** | **DONE — DO NOT RE-DEMO (S209).** The mockup `FRT_list_options_demo.html` is final. |
| **"Mark as recommendation" text button** | **REMOVED PERMANENTLY (S207–S211).** The ★ star is the only recommendation control. Preserve the list-row star's `_recHoldUntilNav` mis-tap-undo. |
| **Table view (Deficiencies tab)** | **RETIRED S216.** `_renderTableView` left defined-but-inert; remove with `.dfx-tbl*` CSS at a later canon pass. |
| **B2f persistent roster / S134 kanban Trade Board / S136 picker** | **RETIRED.** The contractor surface is the S142 §2 ClickAssign Roster. Do not resurface the kanban Trade Board. |
| **`_collectFullState` empty-push / `instance_number.desc` load / Wi-Fi-only upload** | **NEVER reintroduce** — each is a root cause of the S25 data-loss incident (see Platform PK Data Integrity). |
| **Blank-project load race (`sync.js`)** | **ACCEPTED RISK, deliberate (Mark-confirmed). NOT a bug to fix on sight** — see below. |
| **Fixed/sticky compact roster bar (`#dfx-compact-bar`)** | **REMOVED PERMANENTLY (S229).** The position:fixed duplicate of the Contractor Roster bled onto other tabs and only rendered right in Board view. The full Contractor Roster card (`_renderTradeBoard`) is the SINGLE source of truth and scrolls naturally. Removed controller (`_dfxCheckCompact`/`_dfxOnScroll`/`_dfxSetupStickyObserver`/`_renderCompactBar`) + all S197 CSS. Do NOT add a sticky/fixed roster bar again without an explicit new decision. Supersedes all S192–S197 compact-bar architecture. |
| **"General" priority** | **RETIRED TOOL-WIDE (S217).** Only High / Low / Closed exist. `getEffectivePriority` collapses any stray `general` → `low` (renders as Low without mutating stored data until migration runs). ⚠️ `__general__` / `generalDeficiencies` / "Site General" in code = the **Site Records bucket**, NOT the priority — never conflate. |
| **Board Redesign "Option A" (S217: Defic-over-Rec + Site rail)** | **DEAD** — superseded by the Combined Deficiency View lock. Shipped dormant S217, never adopted. Do not cite as the forward plan. |
| **Detailed view / Board view as live renderers** | **RETIRED — there is ONE combined renderer now.** `_renderDetailedView` (~298 lines) and `_renderBoardView` (~145 lines) are defined-but-INERT (zero live callers since S232). Flagged for removal in a dedicated bisectable commit; until then they stay (S137 discipline). Do NOT route any view to them. |
| **Bold "day mode was never a real light skin"** (chrome dark in BOTH modes) | **FIXED + LOCKED (S249).** Chrome is now a true two-skin system — LIGHT in day, near-black in dark, token-driven on `body.dark-mode`. Tokens pinned in the Style Guide Bold PART (S249 canon). Do not reintroduce dark-in-both-modes chrome. |
| **Sticky-red toggle on touch** | **FIXED (S249).** Hover-burgundy MUST be gated behind `@media(hover:hover)` — on touch `:hover` sticks after tap and keeps toggles red/selected. Never ship a hover state on a toggle without the gate. |
| **`!important` chrome-button FILL** | **FORBIDDEN (S249).** Neutral chrome buttons = transparent + `--b-chrome-rule` border + `--b-chrome-fg` ink, identical both modes (a fill drifts: white in day, navy in dark). Shadows only on FILLED neutral buttons (`.btn-outline`). |
| **`display:...!important` on header buttons** | **FORBIDDEN (S259).** `#btn-load`/`#btn-export-all` are dashboard-only, hidden by JS inline `display:none` when a project opens; an `!important` display leaks them into the project header. Geometry yes, display no. |
| **Header action cluster WRAPPING into stacked rows** | **FORBIDDEN (S262).** On overflow the action cluster COLLAPSES INTO THE HAMBURGER (breakpoint `@media(max-width:1200px)`), never wraps. Wrapping was tried S262, looked terrible, reverted. `.header-actions` stays `flex-shrink:0; flex-wrap:nowrap`. |
| **dark-toggle PNG → ☀️/🌙 emoji swap (FRT)** | **REVERTED TWICE (S250/S251) — do NOT re-swap without explicit Mark go.** FRT keeps Mark's custom PNG sun/moon; Diesel uses emoji. This is the one accepted header difference between the tools. |
| **"Quick Fix" in the AI Review menu** | **REMOVED (S272).** Menu = ✨ Full Rewrite (Sonnet) + 📊 Usage & Costs only. No `ai-mode-quickfix`/`mobile-ai-quickfix` elements or handlers remain. `AIAssist.reviewAll('quickfix')` is unreachable from the UI. |
| **FRT #2 header showing "FRT #1"** | **FIXED (S269), confirmed S272.** `_updateFrtInstanceIndicator` adopts `SyncEngine.instanceNumber` (the loaded row's `instance_number`) into `proj.currentFrtInstance`; the `#pb-inst` badge shows the real instance. Was display-only — the instance loaded correctly all along. |
| **Photo "badge spam" (duplicate gallery cards)** | **FIXED PERMANENTLY (S269).** Root cause = the gallery grouped by raw `r2Key` while assign-to-pin gives each pin its own r2Key; the gallery now groups by `Model._photoIdentityKey` (the single byte-aware identity). NEVER add a separate identity notion in the gallery — that divergence is what made it recur. |
| **"+N" photo-badge collapse** | **Do NOT add (Mark-locked).** All per-obs photo badges stay visible. The deeper *site/obs mutual-exclusivity* rework is a separate DEFERRED Mark-present item — not a badge display bug. |
| **REC chip + "Outstanding" pill on the same PDF card** | **FIXED (S269b).** The status pill is EXACTLY ONE category, precedence **Site Record > Closed > Recommendation > Outstanding**. `.pill-rec` added; REC chip suppressed when the pill already says "Recommendation." Never REC+Outstanding or Site-Record+Outstanding. |
| **ResizeObserver on the combined-view drawing box** | **FORBIDDEN (S263).** It loops with `_frtRenderPinMiniMap` (sets canvas px → nudges box → re-fires) → constant flash + blank drawing. Re-fit on a debounced one-shot (~350ms) ONLY when box height changed. **S328 refinement:** the debounced full-refit is now the *fallback*; the fast path is `_PinPan.resizeInPlace` (synchronous canvas re-fit reusing the decoded image, no reload), called on each keystroke. Still no continuous observer. |
| **Closed pin shows dimmed old colour in `_PinPan` mini-map** | **FIXED (S328 #3).** `_renderPinOverlay` now sets `fill='#5F8068'` (solid green) + full opacity when closed — was its old priority colour at α0.5 (a faded ghost). Closed wins the fill outright. There are THREE teardrop renderers (pinsGL ✓, `_drawPinMiniMapStatic` ✓ S327, `_PinPan` ✓ S328) — all now honour closed. |
| **Pin drag + Fit/zoom frozen in the drawing-viewer pin-editor mini-map** | **FIXED (S328 #1/#2).** NOT the S327-B3 regression the scope guessed. Root: the editor renders BOTH thumbs on open (`pe-location-thumb` desktop + hidden `pe-location-thumb-mobile`); both images load async and whichever mounts LAST clobbers the shared `_PinPan` `st` + rebinds the Fit/+/− toolbar to its canvas. When the hidden thumb won, everything bound to an off-screen 0×0 box → frozen visible panel. Fix: `_PinPan.mount` bails when `host.offsetParent===null` (the hidden thumb), keeping `st`+toolbar on the visible one. `cv-pe-location-thumb` excluded (legit null offsetParent under fixed ancestor). |
| **Card flash on pin-drag from the card-editor mini-map** | **FIXED (S328).** `cv-pe-location-thumb` drag fires `saveNow()`→`'saved'`→debounced `render()`; since the card editor IS the list (no modal hiding it) the open card collapsed/reopened. `_PinPan.onUp` now calls `window._frtHoldCardRenderOnce()` (sets `_cvPinDragHold`) for the `cv-*` surface only; the `'saved'` listener consumes it one-shot. Drawing-viewer path unchanged. |
| **Intermittent card flash with NO input** | **FIXED (S328 #19).** The 15s cloud heartbeat fires `Model._notify('project')` (merge-apply); the `project` onChange rebuilt the whole list while a card was simply expanded and idle. Now: if `_openObsKey` is set and no editable field focused, the `project` listener sets `_cvDeferredBgRender` and SKIPS the rebuild; the next deliberate render (card toggle / nav / filter — which clears it at render() top) reconciles. Scoped to the `project` listener only; `photo`/`saved` untouched (a photo finishing load may still legitimately repaint). |
| **Comment-delete card flash** | **FIXED (S328 #15).** `delete-activity` removed the entry via a full `render()`. Now it removes ONLY the `.act-entry` node (tagged `data-act-entry-id`), fixes the thread "(n)" count in place, and holds the post-save render (`_cvPinDragHold`). No full rebuild, no flash. |
| **Card summary lags while typing the comment** | **FIXED (S328 #18).** The collapsed-row `.dfx-or-title` updated only on blur (next render). The `obs-text` input handler now live-updates the matching `.dfx-obsrow[data-defic-id][data-obs-idx] .dfx-or-title` textContent/empty-class on each keystroke (cosmetic, try/caught, never blocks typing). Model save still on the 500ms debounce. |
| **Gear "All photos" photo-filter button** | **REMOVED (S328 #34).** The gear filter button + its dropdown menu are gone from the Photos toolbar — the clickable stat tiles (Total/High/Low/Recommendations/Closed/Site Records) already perform every filter it offered. `ph-toggle-filter` handler + `_filterPanelOpen` are now inert but harmless. "Select all" stays. |
| **Pin-editor (B/C) Add Photos/Gallery buttons oversized** | **FIXED (S328 #17 + #4).** S317 forced full labels on the card editor (was icon-only space-saver); S328 sized them down (`.dfx-ed-mode .obs-drop-btn` 5px 12px desktop / 8px 14px coarse) so they're peers to the status pills, not the loudest control. |
| **Obs-tab `⋮` three-dot (Split to its own pin)** | **MOVED to the `⋯ More` menu (S328 #6).** The cryptic three-dot beside the active Obs tab is removed; "✂ Split to its own pin" now lives in More with a clear label (multi-obs only). Action `dfx-ed-tab-split` unchanged (still reads `data-obs-idx` from the clicked element → works from either source). |
| **Two delete controls in the drawing-viewer pin editor** | **DEDUPED (S328, Mark).** The duplicate "Remove obs/pin" is removed from the `⋯ More` menu (withHeader editor); the FOOTER Delete button (`#pe-delete`) is now the single delete control. (The non-withHeader combined-view card editor keeps its own `dfx-remove-obsrow` button — different surface, no footer Delete there.) |
| **PDF export bar zooms with browser PAGE zoom** | **OPEN — partially addressed (S328 #32).** The `_fitBar` counter-scale was reworked to anchor the bar to the *visual viewport* (counters PINCH-zoom correctly). But Chrome **page zoom** (the 100%/300%/500% control) does NOT change `visualViewport.scale`, so the bar still scales with page zoom. JS cannot reliably detect page zoom → counter-scaling is the wrong strategy. Mark is OK with the full-width banner as long as it's consistent (it carries the Cancel button, so a compact fixed cluster has nowhere to put Cancel). NEXT: either accept it, or strip the now-ineffective counter-scale back to a plain fixed banner. The bar never appears in the actual PDF (`@media print{#pdf-btn-bar{display:none}}`). |
| **"Site General" label anywhere** | **PURGED (S328, Mark).** Every user-facing string says **Site Records** (contractor-delete confirm + toast in viewer.js; AI Review field labels in ai/assistant.js). All code comments scrubbed. The pre-S140 literal survives in EXACTLY ONE place — the frozen constant `_LEGACY_SITE_BUCKET_NAME = 'Site General'` in model.js, used only by `isSiteRecordsName()` to recognize old saved/cloud data (never migrated). Do NOT reintroduce the literal elsewhere; reference the constant if ever needed. (Schema identifiers `generalDeficiencies` / `__general__` / `priority:'general'` are NOT the label and stay — renaming them corrupts saved data.) |
| **Contractor Highlight = dim-only** | **REPLACED by recolor (S328).** See "Contractor Highlight lens" under Drawing viewer. Matching pins recolour to `c.color`, others dim to 10% with shadow kept. Do not revert to the old 0.22 dim-only behaviour. |

---

## S328 new render-hold / repaint canon (combined view)

Three transient, never-persisted one-shot flags now govern when a background or post-save event is allowed to rebuild the deficiency list. They share the `_recHoldUntilNav` lifecycle: set by an action, consumed once by the listener, and force-cleared at `render()` top so a deliberate navigation always reconciles. **All four guards (`project`/`photo`/`saved`/`inspectors`) and these flags must stay coherent — a drifted guard = "sometimes flashes."**

- **`_recHoldUntilNav`** (S150g) — a rec-star toggle; skip the next `'saved'` render.
- **`_cvPinDragHold`** (S328) — set via `window._frtHoldCardRenderOnce()` from `_PinPan.onUp` when the dragged mini-map is the card editor's (`cv-pe-location-thumb*`); ALSO set directly by `delete-activity` (#15). The `'saved'` listener consumes it one-shot (skip + reset).
- **`_cvDeferredBgRender`** (S328 #19) — set by the `project` (cloud-heartbeat-merge) listener when `_openObsKey` is set and the user isn't editing; SKIPS the destructive rebuild. Cleared at render() top. **Do NOT extend this to the `photo` listener** — a photo finishing load may be THIS card's thumbnail; deferring it would leave a stale image.

**Rule:** any new background re-render path must respect an open-and-idle card the same way (defer, don't tear down), and must register its hold in the render() top clear so it can't wedge.

---

## App handles & cross-module hooks

- The FRT app object is **`window._frt`** (`_frt.Model`, `_frt.IDB`, `_frt.R2`, `_frt.SyncEngine`, `_frt.Auth`). There is **no bare global `Model`**. Current project = `_frt.Model.getProject()`; current-instance deficiencies = **`project.generalDeficiencies`** (fields: `num`, `pinX`/`pinY` normalized 0–1, `drawingId`, `observations[]`; each obs has `photoSelection`). `window._frtRec` = recorder utility (not the data store); `window._frtDbgPeek` = the tile ring-buffer.
- **Cross-module window hooks:** `window._frtBuildObsEditor(d, oi, ctrId, opts)` (shared obs editor) · `_frtOpenPinPhotoPicker(deficId, obsIdx, photoId)` (pin-to-pin photo mover) · `_frtOpenPinFocus(deficId)` (focused-pin modal C) · `_frtRenderDefic()` / `_frtRenderPhotos()` · `_frtRefreshPinEditor` / `_frtPinEditorAddedObs` / `_frtPinEditorRemovedObs` / `_frtClosePinEditorIf` (guarded pin-editor repaint hooks in viewer.js) · **`_frtRenderPinMiniMap(d, thumbId)`** (full render) / **`_frtResizePinMiniMap(d, thumbId)`** (S328 — smooth in-place resize, returns bool) · **`_frtHoldCardRenderOnce()`** (S328 — card-flash one-shot render hold) · **`_frtConfirmDeleteObsOrPin(deficId, obsIdx, afterFn, afterPinDeleteFn)`** (S328 — footer-Delete obs-or-pin + photo modal).
- **Never-touch files (without explicit authorization):** `markup.js`, `tiledPdf.js`, `viewer.js`, `markupEngine.js`. A 2nd live tiled-WebGL instance would inherit CONTEXT_LOST + the fit bug; the viewer is REUSED, never modified.

**SW precache discipline:** `sw.js` (repo-root; `frt/sw.js` is a 404 stub) uses atomic `addAll` — one 404 → the entire SW install fails → devices stop updating. When a module is added/deleted, update ALL of: the file, its `index.html` `<script>`/import, AND the `sw.js` precache entry. The `?v=N` on the classic scripts (webglMarkup, pinsGL, dimensionTool, diag/*) is manual. **Bump SW `CACHE_NAME` + CSS `?v=` together on every commit that changes JS or CSS.** SW strategy: network-first for HTML, cache-first for static assets. **FRT must be opened once on Wi-Fi after a deploy to prime the SW cache; after that, offline works.**

**Sync cadence (current, S82+):** local-save debounce 5s; **heartbeat push every 15s** (`_cloudSyncInterval=15000`); **periodic pull every 30s** (`_cloudPullInterval=30000`) with a context-aware "remote update" banner; header last-sync indicator re-renders relative time every 30s (muted green <1min / amber 1–5min / red >5min).

**Session lock (idle-based, not wall-clock):** 4h idle → PIN lock, 8h idle → full sign-out. A user working 12 straight hours is never logged out. (No-PIN users: 4h full sign-out — the S154 fix.)

**Diagnostics (gated behind `?dbg=1` + 🔍 toggle):** `#dbg-overlay`, recorder panel, `#arencon-frt-progress` (tile progress), `#arencon-frt-anomaly` hidden by default; the floating 🔍 button toggles `body.diag-show`. Only renders when `?dbg=1` or `localStorage._frtDbg='1'`. Diag modules are the dormant field-debug toolkit — KEEP.

---

## Photo model (pool architecture)

- Each pin (deficiency) has a **photo pool** `defic.photos[]`. Each observation has `obs.photoSelection`: `null`/undefined = show the whole pool (default for legacy obs); an **Array** = a custom subset; **`[]` (empty array) = show NOTHING** (the intentional "new observation" starting state — `addObservation` seeds `photoSelection:[]`, S209d). This `null`-vs-`[]` asymmetry is the corruption vector behind the S264 R2-404s: a defic whose only obs had `photoSelection:[]` while the pool held real photos orphaned every photo (gallery emitted 0 entries) even though the binaries were safe in R2 (verified 200). It was a broken DATA LINK, never lost binaries.
- **Pool-aware access is mandatory:** render + lightbox read `Model.getEffectivePhotos(defic, obsIdx)`, never `obs.photos[]` directly.
- **Where deficiencies actually live (confirmed S264):** NOT at `proj.deficiencies`. They live in **`proj.contractors[].deficiencies`** (per-contractor) + **`proj.generalDeficiencies`** (Site Records / no contractor). Canonical accessor: **`Model.getAllDeficiencies(proj)`** → `[{defic, contractorName, contractorId}]`, sorted by `defic.num`.
- **Photos are per-observation** (per `obsIdx`), not per-pin. Pin coordinates `pinX`/`pinY` are **normalized fractions (0–1)**, not pixels.

### Photo identity — the SINGLE source of truth (S265/S269)
- **`Model._photoIdentityKey(photo)`** is the one answer to "are these the same photo." Priority: `r2Key` → `sourceR2Key` → **image-bytes fallback** (`'b:'+len+head48+tail16` of `dataUrl`/`thumb`). The byte fallback (S265) is critical: photos added/copied **before upload** have a null r2Key, and keying only on r2Key let them bypass every dedup guard → that was the root cause of duplicate pool entries and pool-orphan spam.
- The **dedup guard, orphan checker, move/copy, AND the gallery all use `_photoIdentityKey`.** NEVER add a separate identity notion in the gallery — that divergence caused the recurring "badge spam" (duplicate cards) and is now locked against (S269).
- **`addPoolPhoto`** dedups within the pin: if a live (non-deleted) pool entry shares the identity key, it RETURNS that entry instead of pushing a duplicate. `opts.allowDuplicate` bypasses (unused — genuine re-captures are byte-distinct and never collapse). **Mark's rule:** the same photo never duplicates within the same obs (except a genuine re-take, always byte-distinct → allowed); the same photo across DIFFERENT obs is fine and intended; adding a new obs must NOT carry photos over.

### Move / Copy / assign (the 4380.24 rule)
- **Move/Copy between pins shares the binary** — same `r2Key`, new per-pool id, no R2 re-upload, no URL copying (`Model.copyPhotoToPin` / `movePhotoToPin` / `copySitePhotoToPin`, all dedup via `_photoIdentityKey`). Markup is stored per-obs (`photoMarkups[poolPhotoId]`), never as a new photo.
- **Photo assign rule:** always use `_createDeficPhotoFromSource()` — upload the blob to R2 under the new defic's own key + save to IDB. **Never copy URLs from source** (cloud sync strips `dataUrl`; borrowed R2 URLs break).
- **Site→pin assignment is a NEW binary path** — mint a new pool binary, never copy the URL. ⚠️ The existing bulk "Assign to Pin" (`_doReassign` in `photos.js`) writes a moved photo into `obs.photos` rather than the pin pool; works today only via the `getEffectivePhotos` legacy fallback. Fix it properly before extending (own session, field-verify).
- **Repair pattern (Mark-present):** use `Model.setObsPhotoSelection(deficId, obsIdx, photoIds)` — `null` = reset to "all pool"; an array is auto-filtered against the live pool (so passing the current selection back DROPS dead ids). Never raw-mutate. Verify R2 object existence first via worker GET (no auth for GET).

### Soft-delete / Recently Deleted (Phase 1 — LIVE, S265)
- **Defic photos:** `removePoolPhoto(deficId, photoId)` soft-deletes (sets `deleted:true` + `deletedDate` ISO, keeps R2, cascades the id out of every `photoSelection` + `photoMarkups`; idempotent). `restorePoolPhoto` clears flags (deliberately does NOT re-insert into a custom `photoSelection` it was removed from — preserves the inspector's explicit choices).
- **Site photos (S265):** `removeSitePhoto` is now soft-delete (index does NOT shift). `restoreSitePhoto(idx)` restores. Gallery site loop skips `deleted` site photos, keeping `siteIdx` = true array index.
- **Permanent delete:** `purgeSitePhoto(idx)` / `purgePoolPhoto(deficId, photoId)` — splice the pool entry, only act on already-`deleted` photos, leave the R2 object in place (cheap, avoids DELETE auth). **Delete-forever is admin-gated** (`Auth.isAdmin()`; disabled+greyed for inspectors, re-checked in the handler — the anti-malice gate).
- **Auto-purge:** `purgeExpiredPhotos(30)` removes soft-deleted photos older than 30 days (site + pool); runs once per project on first Photos-panel render (`_purgedForProjectId` guard).
- **Site-Records fallback:** `restorePoolPhotoOrSiteFallback(deficId, photoId)` — if the parent defic is gone, moves the photo to `proj.photos` (Site Records). Returns `{ok, fallback}`. Dormant in Phase 1; Phase 2 (whole-pin delete) composes on it.
- **Gallery UI:** Photos panel sub-tab row **All Photos (n) | 🗑 Recently Deleted (n)** (`_photoTab` state). Trash thumbnails are tappable (read-only lightbox, S266 — viewing does not restore). Helpers `_gatherDeletedRecords` / `_trashDaysRemaining`. Pin-editor delete (photoPicker.js) already soft-deletes via `removePoolPhoto`.
- **Restore button colour = MUTED green `#3E7D63`** (never bright `#3FD08A`).
- **Phase 2 (deferred, own session):** deficiency-level trash. Restore-pin brings back its photos (Option 1) with refinements — (a) only photos attached as-of-deletion, not independently-trashed ones; (b) pin + photos-deleted-with-it share one 30-day clock, restore/expire as a unit.

### ✕ / obs-delete behaviour (S266c/d — LOCKED)
- **✕ on a photo:** if shared by 2+ obs → brief confirm, de-select from THIS obs only (`removePhotoFromObs`); other obs keep it, nothing deleted/sited. If this obs is the photo's LAST reference → 3-button modal (Move to Site Records / Delete photo / Cancel).
- **Delete an obs that has photos:** 3-button modal (Move photos to Site Records / Delete all / Cancel), acting ONLY on photos unique to that obs; shared photos left untouched. No-unique-photos → plain confirm. Last-obs guard routes to `removeDeficiency` (Detailed) or no-ops (Active "remove-obs").
- Both routes share `_confirmRemoveObsWithPhotos(deficId, obsIdx, afterFn)`. New model helpers: `releasePoolPhotoToSite`, `getPhotosUniqueToObs`, `isPoolPhotoSharedAcrossObs`, `getAllObsReferencesForPhoto(deficId, photoId)` (every pin/obs showing the same binary — drives the gallery ↗ "open in pin editor" picker).

### Pin-editor FOOTER Delete — obs-or-pin with photo modal (S328, LOCKED)
The drawing-viewer/focused pin editor's **footer Delete** button (`#pe-delete`, index.html; handler viewer.js) is the SINGLE delete control (the duplicate "Remove obs/pin" was removed from `⋯ More`). It routes through `window._frtConfirmDeleteObsOrPin(deficId, obsIdx, afterFn, afterPinDeleteFn)` → `_confirmDeleteObsOrPin` (deficiencies.js):
- **Deletes only the CURRENT obs** (`_peObsIdx`); if it's the pin's LAST obs, the whole pin is deleted instead.
- **Photo-fate modal in BOTH cases** (3-button, `showDialog({vertical:true})`): **Move to Site Records** (`releasePoolPhotoToSite` — independent binary, the safe Option-1 release) / **Delete photos** (`removePoolPhoto` → Recently Deleted) / **Cancel**. No-unique-photos → plain confirm, no modal.
- **Ordering safety (verified against model.js):** the modal's photo choice runs FIRST, then deletion. For the whole-pin case `removeDeficiency` auto-releases pool photos to Site, but it SKIPS `deleted` photos (so "Delete photos" wins) and skips binaries already in Site via its `already` guard (so "Move to Site" doesn't double-release). No orphans, no double-handling.
- `afterFn` = save + repaint pins/tasks/defic + `_frtPinEditorRemovedObs` (refresh editor onto a valid obs). `afterPinDeleteFn` = save + repaint + `_closePinEditor`.
- ⚠️ **Field-verify owed:** the "Move to Site" path with a photo SHARED across pins/obs (Mark-present, real project).

### showDialog vertical option (S328)
`showDialog(config)` (shared/dialogs.js) gained an opt-in `config.vertical` (default false = the existing horizontal wrap-row, unchanged for every other caller). `vertical:true` → buttons stack `flex-direction:column`, each `width:100%`, single-line. Used by the obs-delete modal so its three differing-length labels read cleanly instead of cramped tall columns. **Do not change the default layout.**

### Gallery → pin editor (S266b)
- The gallery ↗ button opens a photo in the focused pin editor (`window._frtOpenPinFocus`, extended to accept an optional `obsIdx`, backward-compatible). One obs uses the photo → opens that obs directly; 2+ → a picker lists every obs across all pins ("Pin 1 · Obs A").

### Markup & misc
- **Markup propagates to all copies** — `_propagateMarkupToAllCopies(p, srcPh)` (S115) syncs `markupObjects` + `_markupCanvasW/H` + `_origBackupId` to every photo object sharing the same id. Photo markup is **non-destructive:** `markupObjects` + `_markupCanvasW/H` + `_origBackupId` only — no `markedR2Url`, no `_markupPreviewCache`; revert sets `markupObjects = null` and deletes the original backup.
- Empty-src photos render a placeholder, never silently skipped. Silent error handlers forbidden in user-facing pipelines.

---

## Drawing viewer & rendering

- **Tile renderer:** Azure Function only (MuPDF → PAM RGBA → Sharp → WebP). No byte-level manipulation. 5 zoom levels L0–L4, 256px WebP tiles. Tile pyramid caps `_MAX_TILES`≈800 / `_MAX_CONCURRENT`≈6; `LEVEL_WIDTHS=[256,1024,2560,6144,12288]`.
- **⚠️ Viewport-windowed level-canvas is ALREADY BUILT & LIVE (do NOT treat as unbuilt — S107-class dead-code trap).** The S132 `_computeWindow`/`_rewindowLevelCanvas` system in `tiledPdf.js` + `deviceBudget.js` memory tiers (phone 8 MP / tablet 12 MP / desktop 30 MP) are in force. When an *old* drawing is blurry/laggy (e.g. 4380.24), the cause is **missing/never-rendered tiles** (diag shows `render#0`, `tiles 0/800`) — a huge dense PDF that failed/timed out in the tile-maker at upload. **Fix = regenerate tiles via the built-in migration tool, no viewer code change.**
- **Escape in the drawing viewer:** cancels the active tool / copy mode **only** — never closes the viewer.
- **Pin drag (touch) [CORRECTED S331]:** pan is now **two-finger** (one-finger pan removed); **one finger is reserved for pins/markup.** Pin press-drag: the touchstart is `passive:false` and `preventDefault()`s on a pin hit, guarded by `e.touches.length>1`; drag starts on >3px move (no 500ms hold). Tap (no move) opens the pin editor. Rule: anything that needs a one-finger gesture must be non-passive + preventDefault; pan no longer competes for one finger. (Pin tool single-shot since S174. The old "long-press 500ms arms drag" model is superseded.)
- **Lightbox:** live overlay `.lightbox-overlay`, z-index **10000** (above `#pinfocus-overlay` at 9998). On open it's re-parented to the last child of `<body>` to escape the pin-editor stacking context (S205b). iOS scroll-lock needs `body.position='fixed'; body.width='100%'` in addition to `overflow:hidden`.
- **Highlighter:** offscreen layer composited once at reduced opacity (≈0.30–0.35 α) — never stack opacity across strokes. **No `OffscreenCanvas`** (no Safari/iOS support). Pen/highlight strokes use `lineTo` only — never `quadraticCurveTo`.
- **Auto-select after draw is DISABLED** — the tool stays active.
- **Loading overlay:** NEVER replace `.main-wrap` innerHTML with a spinner — use a `position:fixed` overlay on `body`.
- **PDF upload handlers** use a recursive `go(pg)` pattern — never rewrite it. Drawing-name conflicts show a 3-suggestion modal (`_resolveDrawingNameConflict()`); the PDF path checks once before rendering so `go(pg)` is untouched.
- **Canvas buttons inside the drawing area** use `ontouchend` + `stopPropagation()` + `preventDefault()` (the canvas `touchend` calls `preventDefault()` which blocks click events).
- **Mobile markup canvas cap:** ≈1536px mobile / larger desktop; photo-lightbox canvas ≈2048px mobile (prevents Safari crashes). Mobile/desktop viewer breakpoint: **900/901px**.
- Drawing-viewer zoom: minimum = fit-to-viewport (`_fitScale`), maximum = 8×.

**⭐ The on-drawing pin shape lives in `pinsGL.js`, NOT `viewer.js _renderPins` (S213).** Pins are rendered by PinsGL (Pixi/canvas) via `pinsGL.js → _drawPinAtNative` (console: `[Viewer] WebGL pins ready`). The `.pin-marker` HTML/SVG block in `viewer.js _renderPins` is a **dead fallback**. Spec (`_drawPinAtNative`): solid teardrop, NO white outer border; white inner circle r=11 @ (16,14) α0.95; number 17/13/11px by digit count, weight 900, Calibri. `_priorityFillHex`: Site Record `#6B6FA8` · IAR `#E91E8C` · general `#5F8068` · low `#B07F5A` · high `#A85959`. Outstanding glow via `_buildFilterString`; closed → α0.5.

**Pin mini-map (`_PinPan` in viewer.js, S213 / S328):** the desktop pin-editor drawing panel (`#pe-location-thumb`) and the card-editor desktop panel (`cv-pe-location-thumb`) are interactive; the mobile/portrait thumbs are static crops EXCEPT `pe-location-thumb-mobile` which is also `_PinPan` (S321). Zoom floor = Fit; pan only when zoomed in. Dragging the pin repositions the real pin (writes normalized `d.pinX/d.pinY` + `saveNow()`). **S328 hardening:**
- **`mount()` bails on a hidden host** (`host.offsetParent===null`, except `cv-pe-location-thumb`). The editor renders BOTH thumbs on open; without this the hidden one's async image mount clobbers the shared `st` + rebinds the Fit/+/− toolbar to an off-screen 0×0 box (froze pin-drag + zoom on the visible panel — the #1/#2 bug).
- **`resizeInPlace(hostId, d)`** (exposed `window._frtResizePinMiniMap`) — smooth resize that REUSES the already-decoded `st.img`: re-measure host, resize canvas, `computeFit`, redraw. Synchronous, no `new Image()`/reload. Returns false (→ caller falls back to full `_frtRenderPinMiniMap`) when not mounted into `hostId` or the drawing differs. Drives the butter-smooth comment-box grow/shrink (#16); called live on each `obs-text` keystroke + as the settle path.
- **`onUp` on the card surface** calls `window._frtHoldCardRenderOnce()` (card-flash guard, see render-hold canon) instead of syncing the mobile thumb; the drawing-viewer surface keeps the mobile-thumb sync.
- **Closed-pin fill** in `_renderPinOverlay` is `#5F8068` solid + full opacity (S328 #3) — closed wins the fill, not its old priority colour dimmed. ⚠️ **Drag-to-move-pin is still UNVERIFIED on a real tablet for the round-trip persistence** (DevTools mouse-emulation inconclusive); a 4380.24-class silent-loss risk if broken. Owed check.

**WebGL pin positioning (S112b — sacred):** PinsGL reads `getBoundingClientRect()`. On tile drawings `dv-image` has empty `src` + `display:none` → 0×0 rect → early-return. Fix: when `TiledPdf.isActive()`, read `dv-img-wrap`'s rect instead.

**Contractor Highlight lens (S328, recolor — LOCKED):** the SHOW popover's "HIGHLIGHT CONTRACTOR" radios are a per-session view lens in `PinsGL` (`setHighlightContractor(cid)`; `_highlightCtrId`), never persisted/synced, reset to "All pins" on viewer close (`_resetCtrHighlight`). Behaviour (Mark's spec):
- Select a contractor → its pins **RECOLOUR to the contractor's stored `c.color`**; every other pin dims to **10%** (`CTR_DIM_ALPHA = 0.10`), shadow KEPT (real `drop-shadow`, not removed).
- viewer.js builds a `contractorId→color` map per render and passes `contractorColor` on each glPin (next to `contractorId`). pinsGL matches on `o.pin.contractorId === _highlightCtrId` and, when matched + not closed, draws the teardrop in `contractorColor`.
- **Closed pins stay green** even when matched (resolved reads as resolved on busy linework).
- "All pins" / viewer-close reverts to normal priority colours.
- The list is filtered with `isSiteRecordsName` so the Site Records / legacy no-contractor placeholder never appears (it's not a real contractor). Every other contractor list already filtered it via `realCtrs`; the highlight list was the one gap (fixed S328).
- ⚠️ **CANON / the dim-alpha trap:** `_drawPinAtNative` RESETS `globalAlpha` internally for each layer (teardrop / white circle / number), so a loop-level `globalAlpha` alone NEVER reaches the paint — only the shadow filter changed. The effective per-pin alpha MUST be threaded INTO `_drawPinAtNative` (the `pinAlpha` arg) and multiplied onto every layer's `globalAlpha`. Any future per-pin opacity (dim, fade, ghost) has to go through that arg, not the outer ctx alpha.

---

## Deficiencies tab — current behavior (live)

> **The Combined Deficiency View IS the live renderer (since S232).** Detailed and Board are retired/inert. The S209 "Detailed view" facts below are kept as lineage for the editor/photo internals the combined view reuses, but the live list is `_renderCombinedView`. Where the two conflict, the Combined View section wins.

### Combined View — current live state (S262/S263/S265)
- Active renderer: **`_renderCombinedView(proj, container)`** (deficiencies.js, ~5,966 lines — highest blast radius in the toolkit). Consumes `_flatRows(proj,false,false)`.
- **Per-observation end to end (2B bug closed, S262).** Classify, filter, count, AND emit are all keyed off `_deriveCategory(d, o, hasCtr)` per OBSERVATION, never the pin flag. The load-bearing fix: the emit loop iterates the FILTERED `e.rows` (survivors, each `{o, oi}`; 0-obs row `oi:-1`), NOT `e.d.observations`. **Rule:** any future combined-view change that emits rows must emit from the filtered rows, never re-iterate the pin's full observation list.
- **Four categories**, classified per-obs by `_deriveCategory` (precedence addressed→Closed, else rec→Recommendation, else no-contractor→Site Record, else Active). "Site Record" has **NO schema flag** — non-recommendation + no contractor = Site Record (so Outstanding-with-no-contractor cannot exist without a new flag).
- **Status control = tappable colored popover (S263).** The collapsed-row status pill is tappable → opens `_cvStatusMenu`, a custom colored popover (NOT native `<select>` — Android TWA can't colour `<option>`s; each item is a pill in its own `dfx-cs-*` colour). Five choices: Outstanding (High red / Low amber — both category=active, differ by `updateObsPriority`), Recommendation, Site Record, Closed. **Row pill text is always "Outstanding" for active** — red=high/amber=low carries priority by colour, never spelled out. Picks route through existing Model setters only.
  - **The old four-segment category bar + global Edit-categories lock (`_cvUnlocked`/`_cvCategoryPill`/`_cvSetCategory`/`cv-setcat`/`cv-togglelock`) are REMOVED (S263).** The pill is always tappable.
  - **Portal pattern (CANON):** on open the menu is moved to `document.body` to escape the card's `overflow:hidden`, `position:fixed`, positioned from the pill rect with viewport-edge flips, returned home on close (`_cvOpenMenuHome`). A clipping ancestor traps a popover regardless of coordinate math — portal-to-body is the fix.
  - Interaction: single tap toggles; different pill closes prior; pick closes; tap-outside/scroll-off closes. Open pill carries `.cv-pill-active`.
- **No auto-resort on status change (S265).** A status pick sets `_recHoldUntilNav=true`; the debounced `'saved'` render skips flushing `_cvPendingKeys`, so the pill patches in place and the card holds position. Full resettle happens ONLY on the manual **↻ Re-sort** button (`_cvResort` clears the hold at render top) or deliberate navigation. This is the S248 manual-resort intent. Mis-pick safety = pending set + Option-D marker (target-colour corner dot on the pill + "↻ moved" tag; clears on Re-sort).
- **Site Record → Outstanding (S269).** Picking Outstanding on a Site Record: if `d._cvPriorCtr` exists (reversible round-trip) → reassign back; else `_promptContractorThenOutstanding` (roster-style card picker — colored dot · name · trades). Pick a contractor → moves to Outstanding under it; Cancel/Esc/backdrop → stays a Site Record.
- **Priority filter is Outstanding-only (S262).** `#dfx-pri` High/Low only partitions the Outstanding segment; under Recommendations/Site Records/Closed it is DISABLED + dimmed (`.dfx-pri-frozen`) and any stale `_dfxPri` is cleared. Set in `_syncDfxControls`.
- **Reopen restores pre-close category automatically (S262)** — both `toggleObsAddressed` and `updateDeficStatus` only flip `addressed` + closure metadata, never `isRecommendation`/contractor; `_deriveCategory` re-derives nature on reopen. Do not add reopen-revert code.
- **Editor layout (combined card, S263):** two columns `align-items:stretch`. Comment box (`.cv-ed-left .obs-text-input`) AUTO-GROWS (JS height=scrollHeight, no scrollbar/resize handle). Drawing box (`.cv-loc-thumb`) `flex:1`, min-height 240px floor; re-fits on a debounced one-shot (~350ms) ONLY if box height changed. **CANON / DO-NOT: never put a continuous ResizeObserver on the drawing box** — it loops with `_frtRenderPinMiniMap` (constant flash + blank drawing).
- **Focus guard (CANON):** the `'saved'`/`'photo'` onChange listeners re-render the list; their focus-guard MUST include the combined-view DOM (`ae.classList.contains('obs-text-input')`, `#deficiencies-container`, `.cv-row`, `.cv-ed-left`). The legacy detailed-view selectors (`.defic-item/.defic-list/.defic-pin-group`) DO NOT match the combined view — relying on them alone re-renders mid-typing (focus loss, flash, deleted-char reappears).
- **Collapsed title (multi-obs):** each row shows THIS obs's own text (CSS 2-line clamp + "…"). Empty obs on a multi-obs pin shows a muted placeholder (`.dfx-or-title-empty`) — does NOT borrow obs[0]'s text. Single-obs pins fall back to pin description. (The 3A/3B "linked comments" report was display-only; data was never cross-linked.)
- **Category colour semantics (locked, identical both modes, all tools):** Outstanding-High = red (`--b-high`) · Outstanding-Low = amber (`--b-low`) · Recommendation = **TEAL** (`--b-cat-rec-*`; was amber, changed S248 to disambiguate from amber low-Outstanding) · Site Record = **LAVENDER/purple** (`--b-cat-site-*`) · Closed = green (`--b-cat-closed-*`).

### Resolution Dashboard (S264/S265, shipped)
- Top of `#defic-log-container` (Deficiency Log card body), above the summary table. `_renderDeficDashboard(total, outstanding, closed, rows)` fed by totals `_renderDeficLog` already computes — pure presentation, no model/sync impact.
- Status **donut** (r=57, C≈358.14; outstanding arc from 0, closed arc offset `-outLen`; total in centre) + resolution **bar** (gradient `--arencon`→`--b-bar-b`, big % = closed÷total).
- **By-contractor block (S265 final form) = one row:** solid pie (left, per-contractor `c.color`) + full-width **share bars as the legend** (right: dot · name · count · % over a proportional fill). Numbers shown ONCE — no separate legend, no in-slice % labels (tried, Mark rejected, removed). Dot class is **`.dlc-dot`** (NOT `.dot` — a bare `.dot` inherits `position:absolute` and overlaps text); table-cell dot is `.dlc-tbl-dot`.
- **Contractor colour = stored `c.color`** everywhere (roster dot, dashboard pie/bars, summary-table row dots, future charts) via `_dfxCtrColor(proj, ctrId)`, fallback `#6B7280`. Never a positional/arbitrary palette. Site Records / no contractor → neutral grey.
- **Charts direction (approved, build pending):** keep the resolution bar; replace by-contractor bars with a by-contractor pie (done); add per-contractor mini-donuts (resolution % per contractor — new info). All keyed to `c.color`.

### PDF status pill + naming (S269b — LOCKED)
- A card's PDF status pill is EXACTLY ONE category — precedence **Site Record > Closed > Recommendation > Outstanding.** `.pill-rec` (`#DDD8CB`/`#5E5440`) shown ONLY when the pill isn't already "Recommendation." Never REC+Outstanding or Site-Record+Outstanding on one card. (pdf.js ~675–706.)
- **Pin naming:** item-number references use **`#2B`** (hash, no dash) — PDF item number, model row label. Cards' round-badge shows **`2B`** (no hash). **Photo gallery badges use `2A`** (number + obs letter, no separator) to align with the round-badge; single-obs pins show just the number. Retired: `#2-B` (dash), `2·A` (middle-dot badge).

### FRT instance number (S269)
- `_updateFrtInstanceIndicator` (app.js) adopts `SyncEngine.instanceNumber` (the loaded `tool_data` row's `instance_number`) into `proj.currentFrtInstance` when they differ; writes back, no forced save. Header reads the true report number. Re-painted post-pull via `Model.onChange('project')`.

### Lineage — the retired Detailed/Board views (reference only)

### Views (live)
- **Detailed (default)** and **Board** are the two views (Table view retired S216).
- **Detailed view = the locked Deficiency List redesign (S209, shipped, field-verified — DO NOT RE-DEMO).** Layout = Option B: navy trade band (`#2A3A5C`) → contractor band (tinted via `getContractorColor`) → sorted rows; all three levels collapsible. **Row per OBSERVATION** (1A and 1B are separate rows). Global sort: pin # then obs letter, never out of order (`_sortPins`). **Show-once:** a pin renders under ONE trade via `Model.derivePinTradeSingle`.
- **Collapsed Rich row:** star (rec) · PILL id badge in contractor accent · 54px first-photo thumb + count · 2-line obs-text title · contractor colour DOT · combined priority+status chip · caret. Tap → expand ONE editor at a time (`_openObsKey`).
- **Combined priority+status = ONE dropdown** (`obs-pristatus`): Outstanding–High / Outstanding–Low / Closed. No "General."
- **Recommendation control = the ★ star ONLY.** Preserve `_recHoldUntilNav` mis-tap-undo.
- `_buildPinGroupCard` (deficiencies.js ~571) is the **Deficiencies-tab list-card renderer** (also serves the focused-pin modal). **Protected — rewriting in place blasts the whole tab.** Step 5 convergence (retire its duplicate editor) is deferred.

### The unified observation editor (A / B / C)
One renderer, **`_buildObsEditor(d, oi, ctrId, opts)`** (exported `window._frtBuildObsEditor`), used in three contexts. `opts.withHeader` (B/C only) adds the star + "Pin #N" header, obs tab strip, quiet auto-stamped "📅 Noted DATE" line, Photos heading + drop box + 5-across grid + Upload/Camera/Gallery, and a bottom action bar (`+ Response · + Comment · ⋯ More`). The root gets class `dfx-ed-mode` scoping B/C overrides so A stays byte-identical. **The `⋯ More` menu (withHeader) holds, in order (S328): ✂ Split to its own pin (multi-obs only) · 📐 Move pin (move to another drawing) · ⧉ Duplicate.** The obs-tab `⋮`/`✕` are gone (S328 #6/#9 — split moved into More, delete is the footer button); the standalone reassign "Move pin" and the duplicate "Remove obs/pin" were removed (S328 #7 + dedup).
- **A — Detailed card:** `opts.withHeader` absent → the collapsed-row design. `_buildObsRow` wraps it.
- **B — On-drawing pin editor:** `viewer.js _openPinEditor → _peRenderUnifiedEditor` into `#pe-obs-content` (state `_peObsIdx`, gated to `#pin-editor-overlay`). LIVE since S213. B is in `frt/js/viewer/viewer.js` (there is no `frt/js/ui/viewer.js`) and does NOT call `_buildPinGroupCard`.
- **C — Focused-pin modal:** `_openPinFocus → _buildPinFocusBody` (deficiencies.js, state `_pfObsIdx`, gated to `#pinfocus-overlay`). `{withHeader:true}` with no `onDrawingLink` so its body equals B's; keeps modal chrome for navigation. LIVE since S214.
- **Save model: auto-save, NO Save button.** Document-delegated handlers (`obs-text` 500ms debounce; `obs-contractor`/`obs-trade`/`obs-pristatus`/`toggle-rec` immediate). ✕ Close flushes the active textarea synchronously (`_peFlushUnifiedTextarea → Model.updateObservation`) before closing. Legacy `_savePinEditor`/`_pinAutoSaveFlush` defined-but-inert.
- **Convergence rule:** converge B/C by pointing them at `_buildObsEditor` via `withHeader`; never hand-edit `_buildPinGroupCard`.
- **Inline contractor create:** the shared `<select>` has "+ New contractor…" → `showPrompt` → `Model.addContractor` → assign (via `__new__` sentinel). Create-only; rename/delete on the roster.
- **Quiet observed date:** `obs.notedDate` auto-stamped on create (never overwritten); hand-edit via `dfx-ed-edit-noted`. The report carries the single final date; per-pin date covers multi-day reviews for legal tracking.
- **Auto-bullet:** typing `1 ` at the start of a line auto-converts to `1. ` via `document.execCommand('insertText')` so native Ctrl+Z reverts it.

### Shared photo-selection picker (`FrtPhotoPicker`, S215)
The "⊞ Choose / Manage photos" subset picker is a single ES module `frt/js/ui/photoPicker.js`, called by both B (viewer.js) and C (deficiencies.js). Fully parameterized: `.open({mount, deficId, obsIdx, onExit, toast?})` / `.exit()` / `.isActive()` / `.handleClick(e)`. No module-global current-defic/obs; class hooks (`.pp-*`) scoped inside the caller's mount. Esc/backdrop/close in C exit the picker first (rebuild C), not the whole modal. Imports `showTypeToConfirm` so the ≥5-photo destructive-delete guard fires. ⚠️ **DEPLOYED, NOT tablet-verified.**

### Move/Copy ⤴ (photo to another pin)
The ⤴ control (`_openPinPhotoPicker`, exposed `window._frtOpenPinPhotoPicker`) is on Editor A, B + C (via `_buildObsEditor`), and **the Photo Gallery's defic photos (S216)**. Gallery defic-photo cards carry a hover-revealed ⤴ (touch-safe, hidden in select-mode) resolving `photoIdx → photoId` via `getEffectivePhotos`. **Gallery site photos still have no ⤴** — that's the separate site→pin new-binary-path item.

### Board view (live)
- One board, three lanes stacked as rows: **Deficiencies → Recommendations → Site Records.** Classification is DERIVED per observation (per-obs rec flag → REC; else contractor → DEFIC; else SITEREC). Each lane renders 4 columns (High / Low / General / Closed). Lane banners: def navy, rec amber `#BC7327`, sr grey `#6B7280`.
- **Single mutation point `_bvApplyMove(id, oi, toLane, toPri)`:** lane move sets rec/contractor flags; column move sets priority/closed. Desktop native HTML5 drag and the ↗-arm-then-tap path both funnel through it.
- **Board card interaction (S205c):** tap body → pin editor; tap photo → lightbox; ↗ → arm assign. On touch **no press-drag** — lane/column moves use ↗-arm + tap (Mark confirmed S216 this is good; do not add press-drag).
- **Contractor assign (S153, both kept):** select a board card → tap the whole `.crx-cc` contractor card; OR arm a roster contractor → tap a board card. The `crx-addbtn` ⊕ was removed S153; the whole card is the target.
- **Trade-from-card is DECOUPLED (S153):** tapping a roster trade pill with a board card selected sets ONLY that obs's trade (`Model.updateObsTrade`), NEVER silently mutates `contractor.trades`; a new trade offers one-tap `addContractorToTrade`. Auto-coupling was rejected.

### Other deficiency facts (live)
- **Contractor roster** renders in creation order. Unassigned cards glow amber in place (never reorder). **Contractor delete is non-destructive everywhere** — `deleteContractorAndReassign` moves the contractor's deficiencies → Site Records.
- **Observations:** per-obs delete ✕ on the editor tabs (hover desktop, always-on under `@media(pointer:coarse)`; shown only when >1 obs exists — a pin keeps at least one). Row delete auto-routes: 2+ obs → `removeObservation`; last obs → `removeDeficiency`.
- **Deficiency Log** is a reporting rollup (not a triage surface), collapsed by default with a one-line summary + chevron, persisted in localStorage.
- **PDF pin status:** `Model.getEffectiveStatus(d)` is the single source of truth (both `_deficIsOpen`/`_deficIsClosed` derive from it; never read `d.status` directly). Returns `'closed'` iff ALL obs are `addressed`.
- **Inspector attribution (S143):** per-obs `obs.createdBy`; on-screen `.obs-insp-chip` keyed by a deterministic hash into the contractor palette; unresolved → muted "?" chip. The initials toggle lives in the **PDF/report export modal only** (default off) — never a board control.

### Migrations, roles & truthful messaging
- **General → Site Records migration is LIVE but DORMANT (S217).** Flag `_S217_MIGRATE_ENABLED=false`; nothing rewrites data on load. Run with `Model.enableGeneralMigration()` (reversible via `Model.revertGeneralMigration()`). Rules: a contractored general pin → contractor cleared, becomes a true Site Record; general obs rewritten to `low`. Backed by per-record snapshots (`_preS217`, `_s217Backup`). **Owed: Mark's on-device A/B/C verify.** No flag conversion needed for the Combined View — `priority:'general'` items have no contractor and aren't recs, so they already derive as Site Record.
- **Dormant + reversible migration pattern (canon):** data-rewriting migrations ship OFF by default behind an operator flag, with per-record snapshots + a project-level backup manifest enabling a one-call revert. Mark runs them in the console while watching — never on load.
- **Repair / Diagnostics is ADMIN-ONLY (S229).** `more-repair-section` / `mobile-repair-section` (Re-upload All / Fix Blurry / R2 Cleanup / Repair R2 Links / Diagnostics) show ONLY when `Auth.isAdmin()` (`admin`/`super_admin`). HTML defaults them to `display:none` — inspectors never see these destructive field footguns; admins keep recovery access.
- **Photo move/copy messaging must be truthful (S228/S229).** `addPhotoToObs` only attaches an id when the destination obs is in CUSTOM-selection mode (`photoSelection` is an Array); for a DEFAULT-mode obs (`photoSelection == null`) the photo is already visible via the whole-pool view and it returns false. `doPick` only claims "Obs X on Pin N" when truly pinned, else "Pin N's photos"; default-mode landings record `obsIdx:null`. **Never claim an obs-specific landing that didn't happen.**

---

## 🔒 COMBINED DEFICIENCY VIEW — remaining locked-but-unbuilt scope

The combined view is the LIVE renderer (its current behavior is documented in "Deficiencies tab — current behavior" above). What remains locked-but-NOT-built, all on `deficiencies.js` (~5,966 lines, highest blast radius — Mark-present, field-verify-gated, real `4380_24` SP-114 + `1490.04` split-pin data):

- **Site/obs photo-badge mutual exclusivity (Mark's locked rule, S265):** a photo is *either* Site *or* obs/finding, never both — assigned to an obs → loses Site badge; released from all obs → falls back to Site. NO per-badge photo duplication (Mark explicitly rejected). KEEP all multi-obs pin badges visible (no "+N" collapse). Touches assign/release/obs-delete + badge derivation — own session.
- **Embedded interactive mini-map in the card editor** (Combined View Commit 2): expose viewer.js `_PinPan`/`_renderPinMiniMap` cross-module so the card editor's drawing box becomes drag-to-reposition + zoom (not just a static crop). Inherits the UNVERIFIED-on-tablet pin-drag risk — real-tablet drag-test gate required.
- **Filter-row redesign + wiring** (from `LOCKED_FRT_COMBINED_VIEW_FINAL_S248.md`): one pill row with counts — All · Active · Recommendations · Site Records · Closed + search + contractor dropdown.
- **"Unassigned Outstanding" schema flag** (`SPEC_UNASSIGNED_OUTSTANDING_FLAG.md`): one per-obs boolean, no migration — lets a no-contractor item be a genuine Outstanding-Unassigned distinct from a Site Record, unlocking the "prompt-but-don't-force" Site-Records exit (Cancel → Unassigned Outstanding instead of staying Site Record). Companion to the N+1/N+0 work.

Full spec references (the PK points to these — do not duplicate): `LOCKED_FRT_COMBINED_VIEW_FINAL_S248.md`, `LOCKED_STATUS_PILL_DROPDOWN.md`, `LOCKED_COMBINED_VIEW_MANUAL_RESORT.md`, `DESIGN_LOCK_UNIFIED_PHOTO_GALLERY.md`. Never-touch: viewer.js / markup.js / markupEngine.js / tiledPdf.js. One bisectable commit per change; SW + CSS `?v=` bump together; re-parent push, force:false; do not push unattended.

---

## 🔒 N+1 / N+0 LIFECYCLE — V1 → V2 [S338/S389: LIVE — this section is now LINEAGE]

> **⚠️ SUPERSEDED FRAMING (S338, re-confirmed S389).** The "NOT yet ported / BUILT S271 but NOT pushed / live HEAD does NOT contain them" claim below is **STALE**. Carry-forward IS live: per-defic + per-obs `notedOnInstance` stamping (`addDeficiency`/`addObservation`), the PDF `mainBodyDefs = open OR (closed AND closedOnInstance===currentInstance)` split (pdf.js), `_newThis`/`_priorClosed` page-1 bars, and the carried-forward rounds chip are all in force (landed incrementally S119–S269). Carry-forward needs no active copy — one project blob; advancing `currentFrtInstance` makes prior open items carried-by-default. The ONLY genuinely-unbuilt piece is the optional `frtInstances[]` per-report ledger (`{number,createdDate,siteVisitDate,revision,notes}`) — decide after Mark's field test. Keep the mapping detail below as the reference for how it works; do NOT re-list this as "HIGHEST priority unbuilt work."

Reverse-engineered from `legacy/ARENCON_Field_Review_Tool_v1.html` (16,540 lines; pull via Blobs API >1MB; V1 calls it the "T+0 PDF SPLIT").

**Model fields (V1):** `proj.currentFrtInstance` (int, default 1; V2 already adopts the cloud value, S269); `proj.frtInstances[]` (`{number, createdDate, siteVisitDate, revision, notes}`); per-deficiency `notedOnInstance` / `notedDate` / `closedOnInstance` (null while open) / `closedDate` / `closedNote`; per-observation `notedOnInstance` / `notedDate` / `addressed`.

**Lifecycle rule (Mark's words, confirmed against V1 code):**
1. Note outstanding Obs A on FRT #1 → `notedOnInstance:1`. "New this report."
2. Open FRT #2 (N+1): A still outstanding → carries forward automatically, still tagged "Noted FRT #1," counted as carried-over not new.
3. Close A while #2 is current (the **N+0** moment) → `closedOnInstance:2`. In #2's PDF it shows in the MAIN body marked Closed (the report where closure happened still displays it).
4. FRT #3 (N+2): A was closed on a PRIOR instance → DROPS from the main body, appears ONLY in the "Previously Closed" history section.

**Governing filter (V1 pdf.js ~13206–13216):** `mainBodyDefs = open OR (closed AND closedOnInstance === currentInstance)`; `closedSummary = ALL closed` (history table). "New This Report" count = `notedOnInstance === currentInstance` (V1 ~10816).

**V2 mapping targets:** model.js (schema + instance advancement) · deficiencies.js (card/list filter by current instance) · pdf.js (main-body vs closed-summary split) · app.js/sync.js (`currentFrtInstance` already adopted; the new-instance action `_showNewInstanceDialog` exists but carry-forward + per-obs tagging is not yet wired). V1 reference lines: `_migrateDeficLifecycle` ~10387; instance seed ~10393/~15879; cloud instance adoption ~15877; new-this-report count ~10816; PDF split ~13206–13216; per-obs FRT# tag ~9303/~9391. Field-verify checklist in `FRT_HANDOFF_S270_S271.md` §3 (if that file is missing, the spec above is complete).

---

## PDF export (FRT-specific, "Model 2" structure)

The shared paper-preview PDF standard is in Platform PK. FRT specifics:

- **Model 2 structure (S139–S145, current):** Trade→Contractor hierarchy; all primary header bands navy `#2A3A5C` (`.th-band`, `.st th`, `.sh`); taupe contractor sub-bands; burgundy `#9C2742` accents only. **Three disjoint sections** — **Deficiencies** / pooled **Recommendations** (own grey `#6B7280` band) / **Site Records** (internal, excluded from external reports unless opted-in).
- **Deficiency Summary** = deficiencies only (Summary/Total/New/Outstanding/Closed, no IAR column); a separate **Recommendation Summary** scoreboard counts each rec once (single-trade `_aByT` BY DESIGN, so per-trade rows sum to Total — do NOT switch `_aByT` to plural `_pinTrades`; that's the rejected Option B). **Previously Closed Items** + a split **Previously Closed Recommendations** table.
- Deficiency-body pagination keeps each trade together where it fits a fresh page (S148 D1). Report title overridable per project via `p.info.reportTitleOverride` (data, not code).
- **PDF export entry point = `frt/js/export/exportview.js`** (`initExportView.open()`) — all PDF buttons route there; role-grouped distribution (Owner/Contractors/Other, Site Records excluded). The PDF pin matches the viewer pin path exactly via canvas `bezierCurveTo` (no `quadraticCurveTo`).
- **⚠️ Known bottleneck:** the paginator measures each block by injecting HTML + reading `offsetHeight`; with many photo cards the print dialog can show "Loading preview" 10–30s on large reports. A real speedup = estimated heights instead of DOM measurement — future session if it becomes a recurring pain.
- **[CORRECTED S386/S403] The green "Export PDF" button is CAPTURE, not `w.print()`.** It rasterizes each on-screen `.page` div with html2canvas → embeds 1:1 onto Letter pages via pdf-lib; this is the ONLY path that matches the preview exactly. See `## S329→S440 CONSOLIDATED CANON → PDF EXPORT` for the full locked capture pipeline (minimap decode cache, `_minimapsReady` gate, page-size-from-canvas-pixels, photo-link annotation re-creation, jsDelivr pdf-lib). Do NOT revert to `w.print()`; do NOT chase pagination — a correct preview + wrong export means the bug is in the CAPTURE path.

---

## FRT-specific design rules

- **No box-in-box inside a `.card`** (S137). A feature rendering inside a `.card` must NOT wrap content in a second bordered/filled box.
- **Trade is per-observation (`o.trade`).** Pin-level grouping uses the pin's FIRST observation's trade. Splitting a pin card across trade sections is forbidden (would rewrite the protected `_buildPinGroupCard`).
- **Forbidden-color enforcement overrides spec deltas.** The muted-only rule supersedes any style-delta hex. Never use `#C0392B` / `#1A7A4A` / `#3F6E9C` in UI fills.
- **`dfx-` is the unified-tab CSS namespace.**
- Filter inputs live in the control bar **outside** `#deficiencies-container` so a content re-render never clobbers the search caret/focus.
- **ARENCON Bold theme — COMPLETE for chrome (S249).** FRT is a true two-skin system: LIGHT chrome in day, near-black in dark, all token-driven on `body.dark-mode` + `--b-*` tokens (NOT a `data-theme` attribute — the demo's `data-theme` was demo-only). The long-standing defect where chrome was dark-in-BOTH modes is resolved and locked (tokens pinned in the Style Guide Bold PART, S249 canon). Locked button rules (apply to every tool): neutral chrome buttons = transparent + `--b-chrome-rule` border + `--b-chrome-fg` ink, identical both modes, burgundy on hover **gated behind `@media(hover:hover)`** (else `:hover` sticks on touch — the S249 sticky-red bug); colored CTAs stay flat+colored, never get chrome treatment, never shadowed; shadows (`--b-btn-shadow`) only on FILLED neutral buttons + `translateY(1px)` on `:active`. Full token set + brand rules in Platform PK. App-wide cosmetic switch → field-verify, Mark-present.
- **Header buttons matched to the Diesel tool EXACTLY (S261, Diesel = spec).** Verify with the header diagnostic (dumps computed size/pad/font/border/bg/glyph per button) in BOTH tabs at the SAME text size before any header CSS change. Three groups: **icon squares** (`#btn-qr`,`#dark-toggle`,`#btn-text-size`) `calc(34px+var(--ts))` square, pad 0, font `calc(14px+var(--ts))`, bg `#EFEDF0`, border `1px #D2CEDB`; **back-btn** pad `5px 12px`, no fixed min-height, font `calc(13px+var(--ts))`; **CTA text buttons** (ai-review/reports/more/signout) pad `8px 14px`, font `calc(12px+var(--ts))`, height 40 (AI #7B2D8E, Reports #1A237E, More #455A64, Sign Out #0F766E — dark mode signout muted to chrome). Hamburger 36×36. On `@media(pointer:coarse)` the three icon buttons + hamburger are flat 36×36 pad-0 squares (NOT --ts-scaled). The icon-square rule MUST be prefixed `.app-header #btn-qr,…` to beat the older `.app-header #btn-qr{background:transparent}` light rule. **`#btn-text-size` ("S"/"L") is a NORMAL `.hdr-btn`, NOT an icon-square.**
- **Text-size system:** `TEXT_CLASSES={S:'text-m', L:'text-l'}` → S=`--ts:2px`, L=`--ts:4px`. Icon FONT is FLAT (does not scale with --ts); only the icon BOX scales. **Diagnostic caveat:** `getPropertyValue('--ts')` on documentElement returns :root (always 0) — read `document.body.className` for the real text size.
- **Header overflow → collapse into hamburger, never wrap (LOCKED, S262).** `.header-actions` stays `flex-shrink:0; flex-wrap:nowrap`; hamburger-collapse breakpoint `@media(max-width:1200px)` (raised from 1024 — the ~1137px row overflowed in the dead zone). At ≤600px the left group shrinks (`.logo-area{flex-shrink:1;min-width:0;overflow:hidden}`) so the ARENCON wordmark CLIPS rather than overrunning the actions (Back stays fixed). Title stays visible ≤1200px (S264 removed the title-hide there), hides at 600/480px.
- **Header-button shadow clip = a PARENT `overflow:hidden`** (S259). Fix the ancestor (header-left flex wrapper → `overflow:visible`; title keeps its own overflow:hidden+ellipsis), NOT the button. **CSS specificity (S249/S261):** with `!important` pervasive, the most-specific selector wins regardless of source order — trace by the element's id, enumerate every rule touching it, fix the WINNER (the viewer back button `#dv-close` cost ~4 pushes because the winner was `.dv-toolbar #dv-close`, not the edited `.dv-close-btn`).
- **PWA safe-area (S249):** `viewport-fit=cover` + `env(safe-area-inset-top)` padding on the top bar/viewer toolbar prevents the status bar / Dynamic Island overlapping the header in installed-PWA portrait.
- No `JSON.stringify` inside `onclick` — pass arrays/objects via `dataset`.
- `?s99test=`-style toggle frameworks are the sanctioned way to A/B a rendering fix in PROD.

---

## FRT open queue / owed items (S328) — ⚠️ SUPERSEDED: see `S329→S440 CONSOLIDATED CANON → CURRENT OPEN QUEUE (S440)` at the end of this file. Kept for lineage only.

**S328 session closed (2026-06-14, all field-verified by Mark except where noted):** pin-editor regressions #1/#2/#3; card-flash on card-pin drag; quick wins #34/#17/#7/#9/#10; render-flash #15/#18/#16/#19; drawing cards #36 + Compact removed; pin-editor #6 (split→More); footer Delete rework (obs-or-pin + photo modal) + delete dedup; #4 button sizing; delete-modal vertical polish. **Owed tablet-verify (S328):** footer-Delete "Move to Site" with a SHARED photo; #16 smooth resize on a real tablet; #19 heartbeat-defer behaviour over a multi-device session.

**Remaining from `FRT_SCOPE_S328.md` (NOT done — design-first / bigger):**
- **#32 PDF export-bar page-zoom** — OPEN (see ledger). Decide: accept the banner, or strip the ineffective counter-scale.
- **#5 pin-editor full UX pass · #8 active-obs indicator · #11 comment box expand (PC horizontal / mobile vertical)** — design-first.
- **#12–14 contractor/trade write-back to roster** — design-gated, data-path-adjacent (Mark-present).
- **#20–24 markup cluster** (photo-markup zoom scale, lightbox select-vs-pan, drawable bounds, two-click shapes, click-to-type opacity) + **#25 copy-markup** (DESIGN LOCKED `LOCKED_COPY_MARKUP_DESIGN.md`, depends on #20/#22). Protected code — read engine fully first.
- **#26 text-box redesign · #27–30 calibration overhaul · #37 dimension engine full redesign** — significant, design-first.
- **#31 PDF orphan section header · #33 dimension-in-PDF dead · #35 AI usage/cost page redesign demo.**

---

## FRT prior open queue / owed items (S272) — ⚠️ SUPERSEDED (S389 reconciliation closed most of these; the live queue is `CURRENT OPEN QUEUE (S440)` in the consolidated part). Kept for lineage only.

1. **N+1 / N+0 lifecycle port** (spec above) — HIGHEST, own session, Mark present, field-verify-gated. Carry-forward built S271 but NOT pushed; re-assert HEAD, bump SW.
2. **Photo dedup → admin Repair button** — awaiting Mark's orphan-handling decision (delete vs re-attach vs offer both). Console fns are the spec: `_frtCleanDupes` / `_frtCleanAllOrphans` / `_frtRehomeOrphans`. (The S265 dedup hardening stops NEW dupes; this is the cleanup-for-existing tool.)
3. **Combined View remaining locked scope** (above) — site/obs badge mutual-exclusivity (Mark's locked rule), embedded mini-map (Commit 2), filter-row redesign, Unassigned-Outstanding flag. Mark-present, highest blast radius.
4. **Gallery site→pin ⤴** — the new binary path; fix the misaligned `_doReassign` pool write first; own session, on-device verify. (Gallery defic photos already have ⤴; site photos don't.)
5. **Hub Bold live rollout** — DESIGN LOCKED (`LOCKED_HUB_BOLD_FINAL_S272.md` + `hub_bold_final_demo.html`), build DEFERRED (Mark: FRT first). Its own push-then-verify-per-screen session. Highlights: red banished from chrome (burgundy only on the New-Project CTA + active-tab underline + progress gradient); per-tool fixed accents from one futureproof `TOOLS` token map; My/All/**Closed** tabs; stats = active+closed project counts scoped to tab; progress "N of T open · X% resolved". (Platform-level — also noted in Platform PK.)
6. **Cloud-push 30s timeout** — passive payload telemetry shipped S265 (`syncWorkerHost.js` `_logPayloadSize`, read `window._frt_syncWorker._diag`); root cause OPEN. The stale-overwrite guard (sync.js `pull()`, S263 — skip overwrite when local `_project.modified` > cloud `updated_at`, auto-pulls only) prevents LOSS but the push timeout itself is unresolved. Wait for the next timeout to read the named payload size.
7. **Tablet-verify owed:** S266c/d deletion modals + S269 Site-Records exit / instance-number write / gallery grouping (Mark was present live but a full pass is owed); S215 shared photo picker; S213 drag-to-move-pin round-trip.
8. **Dead-code (deferred, needs Mark's OK):** inert `_renderDetailedView` / `_renderBoardView` (own bisectable commit); `.dfx-tbl*` + `_renderTableView`; legacy `_openPDFPicker`. S137 discipline holds until then.
9. **New-contractor empty group not showing in the Detailed log** (S266–S269 watch item) — NOT confirmed bug vs expected (empty contractor = no group is arguably correct). Don't fix blind; check the render path.

---

## FRT lineage (recovered S25→S154 — reference only)

The full provenance archive (the recovered per-session history) is preserved separately for the *why* behind decisions. Where it conflicts with the body above or the DO-NOT-RESURFACE ledger, **the body wins**. Durable lineage worth keeping in mind:

- **Trade model:** S133 obs-tagged 8-trade life-safety list → S134 contractor-scoped trades → S135 4-list → **S142 6 defaults** (`TRADE_LIST = ['Sprinkler','Fire Alarm','General Contracting','Electrical','Mechanical','Civil']`). Out-of-list legacy `obs.trade` values ("Standpipe"/"Fire Pump"/"Extinguishers") show italicized above the canonical list in the dropdown; they roll up under Sprinkler/General ~99% of the time. `pdf.js` has zero `TRADE_LIST` refs.
- **Contractor surface:** S134 kanban Trade Board → S136 picker → S141 B2f persistent roster → **S142 §2 ClickAssign (`crx-` system, live)**. All earlier generations RETIRED; their handlers defined-but-inert.
- **Rec model:** S138 `isRecommendation` flag + badge → S140 Model 2 (recs pooled into a bottom section) → **S150 amber rec colour + clickable star (all views)** → **S151 per-observation rec (split-pin)**. A rec is never relocated out of its natural group beyond the pooled-section model; flag-driven relocation was explored and rejected.
- **PDF rec page:** S139 in-trade sub-band → S142 pooled section → S144 design → **S145 shipped + `exportview.js`** → **S148 Option A** (rec body fans out via plural `_pinTrades`; the Rec Summary scoreboard `_aByT` stays single-trade — final, not a deferral).
- **Inspector attribution:** S81/S82 colored-card-border + `profiles.inspector_color` were LOST → **S143 rebuilt** on the deterministic-hash chip + 2-mode PDF (Off/Initials).
- **"Site General" → "Site Records"** rename completed S140/S146; no schema flag (a no-contractor non-rec pin in `generalDeficiencies` = a Site Record).
- **"Untagged" deprecated user-facing (S142)** → "Other Trade Items" / "Items with no trade" / "No trade assigned"; internal identifiers (`pdf-untagged`, `untaggedMode`) deliberately retained.
- **Incidents:** S25 (Windsor 60-photo loss) and 4380.24/S155 (silent metadata-push failure) shaped every sync rule — full detail in Platform PK Data Integrity.

---
---

# S329→S440 CONSOLIDATED CANON
*Folded at the S440 canon pass from deltas S329, S330, S331, S336, S337, S338, S339, S340, S341, S342–S343, S345, S346, S347/S348, S349, S357, S358–S368, S377–S388 (PDF-export arc), S389, S390, S392–S400, S393–S396, S403, S404–S414, S415–S425, S404–S429, S430–S431, S432, S426–S440. Later-session-wins applied; anything a later delta corrected appears here ONLY in its final form. Verified against live HEAD `0ded68d0`. Where the S328 base body above conflicts with this part, THIS PART WINS.*

## ⛔ DO-NOT-RESURFACE — additions S329→S440

| Item | Status |
|---|---|
| **N+1/N+0 lifecycle "port"** | **LIVE, not pending (S338/S389).** Carry-forward, per-obs/per-defic `notedOnInstance`, PDF main-body split, page-1 bars, rounds chip all shipped S119–S269. Only the optional `frtInstances[]` ledger is unbuilt. Never re-list the port as queued work. |
| **`_PinPan` closed-pin colour** | FIXED (S328 #3/S331 B1) — `fill = isClosed ? '#5F8068' : …`, full opacity. Do not re-touch. |
| **`applyGuessedCalibration` auto-apply on first uncalibrated click** | REMOVED (S330). Do not reinstate — conflicts with the locked dimension spec (keypad auto-opens instead). |
| **#32 export-bar page-zoom counter-scale** | RESOLVED BY REMOVAL (S338). JS can't read Chrome page zoom; `_fitBar` counter-scale was dead code — plain fixed banner now. |
| **Forbidden green `#1A7A4A` in pdf.js** | PURGED (S338) → `#2E9E72`. Only a historical comment remains. |
| **One-finger pan in the drawing viewer** | REMOVED (S331). Pan+pinch are two-finger; one finger is pins/markup only. |
| **Floating auth badge (`#arencon-auth-badge`, shared/auth-gate.js)** | `mountBadge` is a NO-OP (S341, Mark). Absence is by design, not a regression. Never re-mount; ☰-menu `#mobile-signout-btn` is the single sign-out path. |
| **Hiding `#inspector-chip`** | REVERTED (S341). Chip stays; do not re-add a hide rule. |
| **Permanent rotation via R2 round-trip / baked-binary fork / CSS `_rotations` dual system** | FAILED ARCHITECTURE ×3 (S347/S348/S349) — superseded by the S357 never-bake model (below). Never rebuild the bake-and-upload path. |
| **`w.print()` as the Export PDF path** | RETIRED (S384/S386). Capture export only. `break-inside:avoid` on `.page` blanks pages — never use. |
| **cdnjs pdf-lib 1.17.1** | CORRUPT BUILD (NaN pageCount, S396). pdf-lib loads from jsDelivr (`_CAP_PDFLIB_CDN`). Never switch back. |
| **`object-fit` anywhere inside the capture DOM** | FORBIDDEN (S403/S405/S414). html2canvas ignores it. Photos = `background-size:cover` divs; minimaps = natural-aspect imgs. Zero object-fit in pdf.js is the verified state; any reintroduction is a regression by definition. |
| **S421 camera rotate-by-screen-angle / S422 no-rotation** | Both WRONG (TWA is portrait-locked, angle always 0). S424 gravity model is canon. |
| **HEAD probes against the R2 worker** | FORBIDDEN (S421 root cause of the 2026-06/07 photo-loss wave — worker rejects HEAD; probes nulled valid keys). Presence check = `GET + Range: bytes=0-0`. |
| **BETA PDF button** | REMOVED from exportview.js (S346). `initPDFExportBeta` export is dead-but-harmless; shared photo-link helpers retained (real report uses them). |
| **Beta/production channel (`/beta/frt/`)** | **DECLINED by Mark (S431).** Layered guards (push_guard, S426 stale-writer guard, tool_data_history, post-promote field-verify) are the accepted safety story. Do not re-propose unprompted. |
| **7155.51 full relink session** | NO LONGER NEEDED (S431). Instance 2 healthy; instance 1's 5 pointer-less site photos are Mark's keep-or-delete call. |
| **`sp_1780369916688_3ngo4h` (1490.04)** | UNRECOVERABLE, record deleted by Mark (S431). Closed. |
| **Contractor Response portal (Phases 3–4)** | DEFERRED by Mark (S432). Never propose building unprompted. |
| **1920px capture clamp** | REPLACED (S438) by adaptive 4096→2560→1920 step-down. Never below 1920 (Mark's hard rule). |
| **De-burgundy reskin** | REJECTED (S336, again S394-scoped). Burgundy stays primary everywhere it already is; NEW elements use it as accent-only (new primaries = navy). |
| **Combined single merged deficiency list** | NOT WANTED (S336). Tabs stay separate + an "All" segment. |

## VIEWER / TOUCH / PINS (S331, S341)

- **Touch model:** two-finger pan + pinch-zoom (midpoint travel = pan, pinch ratio = zoom); one finger reserved for pins/markup (non-passive touchstart + preventDefault on pin hit, `touches.length>1` guard, drag on >3px move, tap opens editor).
- **Pin sizing on zoom (viewer.js pinScale):** base 0.7× at fit → lerp to 1.0× at 1×; **L3/L4 deep-zoom boost ×1.645** (S341; supersedes ×1.265 S331 and ×1.15 S187); **L1 on touch ×0.90**. Level via `TiledPdf.stats().activeLevel`; touch via module `_IS_TOUCH`.
- **Single-tap-to-open pin:** `dv-canvas-area` touchend has an explicit branch (no tool armed + pin tap → `_openPinEditor`) because Android WebView often doesn't synthesize the click. Guarded against drag/pan.
- **Samsung long-press menu** suppressed via `pointer-events:none` on `#dv-image` + `oncontextmenu="return false"` on wrap/canvas/canvas-area + document capture-phase contextmenu guard. `-webkit-touch-callout` is iOS-only — do not rely on it. The drawing `<img>` is purely visual; hit-tests are coordinate-based, so non-interactive img is safe.
- **iOS/PWA status bar (S329):** with `apple-mobile-web-app-status-bar-style:black-translucent`, the strip shows the `<html>` ROOT background — not theme-color, not body. Paint `<html>` per mode (`app.js _setThemeColor` mirrors body's computed bg onto documentElement + theme-color; CSS `html{background:var(--smoke)}` for first paint). `viewport-fit=cover` was REMOVED from FRT (it jammed the header under the status bar and requires safe-area compensation); FRT head metas match Diesel. Diagnosis lesson: when Diesel is right and FRT isn't, diff the two tools' heads directly.

## DIMENSION ENGINE (S330 build, S331 polish — LIVE)

Spec lock: `LOCKED_DIMENSION_ENGINE_S329.md`; ref demo `dimension_engine_demo_v4.html`. Logic spans `viewer/dimensionTool.js` (IIFE, `window._dimTool`: engine/parser/render/calibration) + `viewer/markup.js` (host: keypad, finish chip, toolbar, modals). Dimensions persist through normal markup serialization (`_objects` array) — no separate save path.
- **Object shape:** `mx1..my2` measured points, `offset` signed perpendicular, **`trueM`** true metres (round-trip-safe; display unit is render-time, toggling never mutates), `ovrM` numeric override in metres (converts on toggle), `overrideNote` frozen text (TYP./EQ, never converts), legacy `overrideLabel` honored by `resolveLabel`, `rawValue/rawLabel/isGuess` retained.
- **Locked behaviours:** calibration OPTIONAL never a gate (uncalibrated = "NOT TO SCALE", keypad auto-opens after 3rd click); keypad units OUTSIDE (Imperial/Metric toolbar toggle; metric hides feet/inch keys; bottom-dock on coarse, floating desktop; real `<input>`; live interpretation; revert-to-measured; auto-commit on next dim). Smart parse `parseLength`: dash = feet-inches, bare number = imperial feet (flagged), mm/cm/m/km = metric, non-numeric = frozen note; imperial rounds ½″, metric default mm (→m ≥10000mm). Unit toggle is DISPLAY-ONLY (push-safe, not Mark-gated), persisted via model pref `dimUnit` (fallback localStorage `arencon_frt_dim_unit`). Finish ✕ chip shows between dims in continuous/running only, never during offset. Pickup picker: continue-from-previous (resetState BEFORE seeding `_pA` — order matters) / pick-a-point / start-fresh. Recalibrate dialog: measured-only default / all / none via `recalibrateAll(objects, cal, mode)`. Gentle 12px vertex snapping via `handleClick` 3rd param.
- **S331:** in-progress endpoints render as perpendicular **tick lines** (`_drawTick`; calibration ticks inline in `_renderCalibratePreview` — must draw inside its single overlay pass, `_ensureOverlay` wipes separate passes). **Ortho snap 1.5°** (`_applyOrtho`, symmetric all directions incl. 180°); **offset-alignment snap** `_snapOffset` (green guide, OFFSET_SNAP_PX=10, last-dim-only by design). Perf/ImgBmp HUD disabled (`_allowed()` false).
- **API:** `parseLength, formatMeters, get/setDisplayUnit, resolveLabel, dimTrueMeters, startContinueFromPrevious, startPickPoint, startFresh, isPickAwaiting, seedFromPoint, allVertices, nearestVertex, chainFinishAnchor, recalibrateAll(mode), computeLabel→trueM, handleClick(pos,drawing,objects)`.
- **S407 pattern:** `#poly-sub-toolbar` reuses the dim-v3 class family wholesale — new sub-toolbars MUST reuse dim-v3, never fork it.
- **Wanted, unbuilt (S341):** D2 point-alignment green guide (snap NEXT point to previous point's X/Y — distinct from the offset-row snap); D1 move "Done" to fixed bottom toolbar; D3 non-blocking calibration prompt.

## MARKUP — NEVER-BAKE MODEL (S357 canon; S358–S368 consistency; S389 reconcile)

**The rotation/markup model (proven, LOCKED):**
- **Never-bake.** Strokes are vector points in the UNROTATED photo pixel frame (`_mkFrame` = natural size). `p.rotation` ∈ {0,90,180,270} is DISPLAY-ONLY (CSS transform on the wrap holding photo + ink canvas together). Stored image stays clean forever — no rotation baked, no marked-binary R2 fork. On 90/270 the engine canvas + `_mkFrame` swap dims; `MarkupEngine._rotation` must equal `p.rotation` at all times.
- The markup-save handler uploads **no marked binary**; `_markupStrokes` + `_mkFrame` are the only markup persistence. `/marked/` corruption guards in the revert handler are legacy-data defensive — keep them.
- **PDF/thumbnail composite** built offscreen from clean image + strokes via `_compositeRotatedMarkedURL` (pdf.js): rotate ctx, draw clean image, `ctx.scale(natural/mkFrame)`, `renderStrokesToContext`.
- **Delete persistence:** `_saveMarkup` commits when strokes **changed since attach** — guard = `hasChangesSinceAttach()` (JSON vs `_attachSig`), NOT `isDirty()` (length>0). Erasing to empty MUST persist the empty array + clear `_annotated`.
- **Strokes live in FIT-logical px (E.w×E.h), not natural px** (S347 knowledge). Rigid rotation in fraction space `(fx,fy)→(1−fy,fx)` is identity-stable over 4 turns.
- **Re-editable markup (S340):** engine `attach(host,img,origBlob,onDirty,initStrokes)` reloads saved strokes; `exportStrokes()` deep-clones for persistence; `hasChangesSinceAttach()` at exit gates. Reopen rule: swap `lb-image` to the CLEAN ORIGINAL (`_resolveOriginalSrc`: backup r2Url → `_origBlob`) BEFORE attaching with strokes — never attach onto a flattened JPEG (doubling). `_resolveOriginalSrc` rejects dead `blob:` URL strings (S347b); original-load failure/timeout (6s) → attach clean so the photo always opens. `frt-markup-saved` carries strokes; `_stampSiblings` propagates `_markupStrokes` to every sibling; revert clears on all exit paths. Pre-feature photos attach clean (not retroactively editable). Round-trip verified through IDB → Supabase `tool_data` → reload (sync/merge/stripBinaries do NOT drop `_markupStrokes`).
- **Clean-original backup (S347d + S363):** `MarkupEngine.cleanBlob()` re-encodes the clean source; `_saveMarkup` captures it BEFORE bake, passes as `cleanBlob`; markup-save CASE 2 uploads a **distinct clean copy to `/original/`** (own r2Key → own `_photoIdentityKey` → separate visible **Site Record** tile, `_isOrigBackup:true`). Erase-all/revert auto-deletes the backup — symmetric lifecycle: marks present ⇔ backup exists.
- **Photo DATE model (S365/S367, locked):** marked photo → TODAY (only when strokes present, never on `_isOrigBackup`); clean backup → ORIGINAL capture date; revert/erase-all rolls the marked photo back to original. Save never otherwise moves dates; no id-timestamp date repair (id ts = record-creation, not capture). **EXIF DateTimeOriginal on upload (S367):** `_readExifCaptureDate(file)` (dependency-free, tag 0x9003→0x9004, `YYYY-MM-DD`|null) read BEFORE compression (compression strips EXIF); falls back to upload date. Pre-S367 photos keep upload-time dates (only a manual date-edit fixes those — shipped S414: lightbox caption editor date input writes `p.addedDate`, top of grouping precedence).
- **Selection chrome is screen-constant (S364):** `_uiScale() = naturalW/onScreenW` (clamp 0.5–12) multiplies every handle size/offset/hit-radius/line-width in `_drawSelection` + `_hitResize/_hitRotate/_hitDelete/_hitCopy`. Never "fix" back to fixed pixels.
- **Copy exists in BOTH engines (S339 photo / S342 viewer):** bottom-center handle (r9 `#1565C0`, center at `b.y2+pad+34` — +24 collided with coarse resize hit zones; draw + hit-test keep +34 in sync), `_cloneSelection` deep-copies all coord arrays (`pts[]`; viewer adds x1..y2/dimension `mx*`/eraserMask), offset +28,+28, clones become selection. Photo-engine undo caveat (permanent until undo-grouping): per-stroke LIFO, multi-copy undoes one stroke per press — do NOT special-case copy.
- **Two engines are SEPARATE codebases (reaffirmed S339/S342/S389):** photo/lightbox = `viewer/markupEngine.js` (~860 lines, strokes[]/pts[]) + `ui/lightbox.js`; drawing viewer = `viewer/markup.js` (~4718 lines, richer object model, `_uiScale`). They share handle GEOMETRY, not code — parity by deliberate porting. Locked select/draw model (`LOCKED_SELECT_DRAW_MODEL_S339.md`): Select = tool group (Single/Rubber-band/Tap), sticky selection (✗ only clears), Tap = pick boxes + ✓ confirm; universal press-drag-release; two-click retired; S329 2-finger-cancel preserved. **Additive grouping (S410):** empty `_pickIds` + existing `_selectedIds` → committed group seeds the picks; a tap after commit never destroys the group.
- **markupEngine.js cache-bust rule:** loaded via `?v=` in frt/index.html AND precached by root sw.js — bump BOTH on every push of this file.
- **Gesture routing (working, no work needed):** engine down/move bail on `touches.length>=2` WITHOUT preventDefault (pinch bubbles to lightbox); a 2nd finger mid-stroke cancels the stray mark.
- **Thumbnail compositing (S362):** match `<img>` by exact `data-thumb-pid` — NEVER URL prefix (all photos share the worker prefix; prefix-matching stamped one composite on every thumbnail, the S355 regression that forced the S357 rollback). Composited thumb is pre-rotated: clear its inline CSS rotate.
- **S389 reconciliation — SHIPPED, do not re-open:** draw-while-rotated 90/270 (S358 single-forward-transform, pt() inverse exact); zoom-during-markup teleport/drift #20/#22 (S358: markup canvas is a child of `lb-img-wrap`, canvas-mirror deleted); gallery thumb composite; markup/rotation survive assign-to-pin (S359 deep-clone); frozen report snapshots (S360); visible clean-backup Site Record (S363); screen-constant handles (S364).

## DRAWING-VIEWER TEXT ENGINE (S390–S403)

- Committed markup renders via **WebGL** (`WebGLMarkupRenderer.render`, Pixi) with a 2D `_drawObject` fallback — any per-object filter (e.g. skip `_editing`) must apply to BOTH paths.
- `.dv-text-box` contentEditable needs its own `position:fixed;z-index:10000` CSS (not shared with lightbox `.mk-text-box`) or it collapses invisibly in the overflow:hidden overlay. Default text size 80 logical px (20 is invisible at fit-zoom on large drawings); steps 24…220. Text-bar buttons fire on `pointerdown+preventDefault` (survive the contentEditable focus race); `commit()` resolves canvas via `_getCanvas()`. Editing and selection are mutually exclusive; canvas pointer-down while editing commits.
- **Text edge-drag (S410):** pointerdown within 12px (16px coarse) of the box border drags it; interior keeps the caret.
- **Lightbox text-engine port to the drawing viewer:** the lightbox `mk-text-chip` (S339) was never ported; drawing viewer still uses `.mk-text-input-live`/`_handleTextPlace`. Mark wants engines identical — substantial (different coordinate model); demo-first; `markup.js` protected. Scope: `SCOPE_FRT_TEXT_ENGINE_PORT.md`.

## PHOTOS — ORIGINALS, R2, IDENTITY, HEAL (S389, S404–S429, S430–S431)

**Two-copy originals model (S389 defic path; S414 site path — BOTH live):**
- `R2.uploadPhotoOriginal(projectId, photo, file)` uploads the **raw camera/import File byte-for-byte** as `original` type (`_toBlob` passes Blobs through, no re-encode); sets `photo.r2Key/r2Url` to the original. `R2.uploadPhoto` = the compressed dataUrl copy. Do not confuse them. Gallery full-view / server download / contractor PDF links all read `r2Url` → full-res for free; thumbnails stay `ph.thumb` (200px); PDF EMBED stays compressed `dataUrl` (`_downscalePhotoForPDF`, S343: 1000px/JPEG0.8, ~150–250KB/photo, ~20MB per 40-photo report). Capture-quality changes never affect PDF size; the PDF photo link IS the "click for full quality" path. Upload failure sets `photo.r2UploadFailed` + saves — never silent. `_walkPhotos` backfill stays on the compressed path (only dataUrl exists there).
- **R2 is a TRANSFER BUFFER, not permanent storage (Mark).** Originals live in R2 until the project is downloaded to the company server; then R2 is cleaned. After cleanup, PDF full-res links 404 by design (embedded thumbs still read). **Never clean up R2 before originals are confirmed landed.**
- **Render gate = `obs.photoSelection`, full stop (S349 scar).** A restored photo will NOT render even when present in the pool AND `obs.photos`. To restore so it renders: add its id to `photoSelection` AND stamp `obs.photoSelTs[id] = {s:1, t:Date.now()}` (LWW register) or the next 3-way merge silently reverts it.
- **Worker GET contract (S429):** ONLY `/photos/{folder}/frt/{type}/{fname}` is servable. `/list/{folder}/frt/{type}/` unauth. **Worker rejects HEAD — presence checks = `GET + Range: bytes=0-0`.**
- **Three folder generations coexist** per project: current slug · project UUID · legacy `proj_<ts>_<suffix>`. Resolvers honor a key's OWN folder first, slug→UUID fallback. Legacy `<projname>_<descr>` prefixes hold the archive of true originals. The record's stored `r2Key` names the exact prefix — trust it over guessing; JSON export is the fastest source of the correct key.
- **Key-form law (S345):** stored `r2Key` = `photos/{slug}/{tool}/{type}/{fname}` (URL form) but the bucket files under `{slug}/photos/…` — SWAPPED. `_toR2BucketKey(k)` transforms before any mint/resolve (matches the worker's `urlPathToR2Key`).
- **Photo links are opaque `/p/{token}`, never raw R2 URLs.** `_pdfPhotoFullHref` returns `_PDF_WORKER+'/p/'+token` or '' (mint failure → no link; privacy over clickability). KV namespace `arencon-pdf-links`; token = 32 chars b64url HMAC-SHA256(secret,key), deterministic. Two-layer KV-write reduction: FRT caches tokens in `localStorage['arencon_pdf_link_tokens_v1']`; worker `get`-before-`put`. `/mintlinks` auth; `GET /p/{token}` unauth → 404 wall for unminted.
- **Report snapshots (S360):** PDF photo links resolve to frozen content-addressed snapshots `photos/{pid}/frt/report-snapshots/{hash}/{photoId}.jpg` (FNV-1a of rotation+strokes; unchanged content = same hash = no re-upload). Old reports stay frozen.
- **`verifyR2Keys` heal (S414, corrected S421):** on cloud pull, **Range-GET**-verify each stored `r2Url` once/project/session. Heal ladder: photoBlobs bytes → re-upload original; dataUrl only → compressed upload; nothing → null keys (record ALWAYS kept). Only a confirmed 404 heals; network failures never do. Bounded 300 keys/run; `[R2Heal]` console signal. (The HEAD-probe era of this function nulled valid keys and pushed damage on every open — the root cause of the photo-loss wave.)
- **Display-layer host rewrite (S430/S431):** old worker host → `files.arencon.app` rewritten at PAINT TIME only — `_r2h()` (photos.js, all 8 src points) + `_r2Host()` (lightbox.js). Stored model never mutated; every new src consumer routes through `_r2h`.
- **Gallery tile contract (S430):** tile img carries `data-r2fb` (host-rewritten r2Url) — onerror tries ONCE then classes `ph-img-broken` (visible clickable placeholder). Never `display:none` a tile image (kills the click target). Source-less records render `ph-noimg` WITH the lightbox click.
- **Lightbox contract (S430):** `_setNoImg(on)` toggles `#lb-noimg` ("Photo unavailable on this device"), hides img, clears stale zoom/pan + static-markup overlay. Empty src detected BEFORE assignment (`img.src=''` never fires onerror); prev/next always work.
- **Gallery identity ruling (S429, Mark):** site copy + pin copy of one image = **two entries** (`_phIdKey = ('S|'|'D|') + identityKey`). Within-kind collapse (S205/S269 badge pills) unchanged.
- **"All Photos" counts distinct non-deleted binaries** (deduped by `_photoIdentityKey`), after deleted-filter + Site/Obs mutual-exclusivity collapse; `_isOrigBackup` duplicates inflate raw counts but aren't distinct photos. Reconcile against distinct r2Keys, not a remembered total.
- **Explicit Copy semantics (S362):** `copyPhotoToPin`/`copySitePhotoToPin` take `forceCopy`; the explicit Copy action passes true (bypasses dedup → real new reference); Move + internal callers stay deduped.
- **Relink doctrine (S429):** deterministic joins only — full-id-in-filename > ≤10ms timestamp match > cross-era export consistency. Never positional matching. Corruption-era smears can live in ANY field (a `thumb` once held HTTP URLs) — `data::text LIKE` the whole blob when hunting a mystery string.
- **Photo sync badge (S341):** orange "awaiting cloud sync" when `r2Status` pending/uploading OR `photoTs > syncTs`; null/zero watermark = treated as Synced (never downgrade a confirmed-R2 photo on load). `deficiencies.js _obsPhotoSyncBadge` and `photos.js _cloudIcon` MUST stay in sync.
- **Trash grid (S439):** gallery-style multi-select grid mirroring the S114 pattern (`_trashSelected`/`_trashLastSel`/`_trashOrder`, shift-range, uid `s:{siteIdx}` / `d:{deficId}:{photoId}`). Admin-only bulk bar; `Auth.isAdmin()` re-verified INSIDE `_bulkPurge`. **Site-photo purges execute in DESCENDING `siteIdx` order** (splice shifts indices). Checkboxes always visible under `@media(pointer:coarse)`.

## CAMERA (S419–S438 — CANON, supersedes all prior `_openUI` descriptions)

`frt/js/ui/cameraBurst.js`, Android-native direction, ALL field-verified by Mark incl. a 25-photo max-res burst:
- **Layout (S428):** raw full-bleed feed — NO forced aspect box, NO object-fit crop-magnify (preview = raw feed; WYSIWYG comes from capture-side crop). Solid-black icon-only top bar OUTSIDE the feed: ✕ · flash · night · grid · floating-shutter ● · flip. Zoom pills .6/1×/2/5 + pinch. Tap-to-focus reticle + draggable exposure sun. Draggable floating shutter (hold ~550ms → red ✕ SVG removes; SVG because text glyphs get selected on Android). Bottom: last-shot chip · shutter · Done(N) green pill. Review: all-photos strip, tap-to-jump, ‹ › nav, ‹ Camera pill (must be a visible pill), 🗑 Delete-any; **Pointer Events + `setPointerCapture`** for pinch-zoom (raw touch events silently die through stacked overlays); pinch 1–5×, double-tap 2.5×; faint `v437` build tag kept deliberately (one-glance stale-cache detection).
- **Resolve contract unchanged:** Done → File[]; Cancel/Esc → []; unsupported/denied → null.
- **Gravity orientation (S424 — SACRED, verify by diff on every camera edit):** the Android TWA is portrait-locked → `screen.orientation.angle` is ALWAYS 0; no orientation event ever fires. Module-level `devicemotion` → `accelerationIncludingGravity` → `atan2(gx,gy)` snapped to 0/90/180/270 → `_grav` (iOS inverts the accel sign — `_isIOSDev`; near-flat <3 m/s² ignored, last value kept). `corr = (360 − ((_grav − screenAngle) mod 360)) mod 360`; rotate the raw frame upright on an intermediate canvas (plain canvas, never OffscreenCanvas), then aspect-crop. Calibration: rotated-left → grav 90° → corr 270°. Null-safe (`_grav===null` → corr 0). iOS 13+ motion permission requested inside the user gesture (`_armGravity()` in `openCameraBurst()`).
- **Capture resolution (S438 — REPLACES the 1920 clamp):** `_grabFrame(maxPx)` adaptive wrapper around `_grabFrameCore`: 4096→2560→1920 step-down on allocation/encode failure; JPEG 0.95. Never below 1920.
- **gUM resolution rule (S434):** EVERY `getUserMedia` call carries `width:{ideal:4096},height:{ideal:3072}` — hunt/flip/recover paths without it stream 640×480 ("wavy"). `_resGuard()` checks the RUNNING track at 700/1800ms and force-applies if width<2000.
- **Torch (S430–S433):** `facingMode:'environment'` may bind a torchless lens. `getCapabilities()` is empty until ~650ms settle and is not ground truth — **a resolved `applyConstraints({advanced:[{torch:true}]})` is the only proof.** Hunt: stop current stream FIRST (Android holds cameras exclusively), enumerate back lenses, settle+prove each, bind winner, cache `_torchDevId`; flip-to-back prefers it. Zoom applyConstraints can CLEAR torch — re-assert after every zoom apply in TORCH state. **Three flash states:** OFF / FLASH (torch fired ~320ms around the grab — no hardware sync on web; ~⅓s delay) / TORCH (continuous work light). No AUTO (web can't meter).
- **Fullscreen ownership (S439):** page-level sticky fullscreen owns immersion; camera must NOT call `_exitFullscreen()` on close.
- **1080p ImageCapture retirement (S341) preserved:** `ImageCapture.takePhoto()` stays retired (ignored constraints, full-sensor frames crashed Android WebView).
- **Accepted hardware trade-offs:** .6× ultrawide may clamp to 1× on the torch lens; first flash-ON blinks (lens switch); iOS web has no torch/focus/element-fullscreen; ~2–5MB/photo through R2/sync. Web ceilings: Chrome's fullscreen exit toast is unsuppressible (installed TWA is the only chromeless mode); no true night mode/HDR/stacking.
- **Video (workstream 2, NOT shipped):** MediaRecorder in a VIDEO mode of the S428 camera; poster frame at capture; new R2 type for clips; PDF poster thumbnail with a **small corner play badge (▶ + duration, bottom-right — NEVER centered, Mark explicit)** linking to the R2 clip; cap length/resolution.

## PDF EXPORT — CAPTURE ARCHITECTURE (S377–S388 arc, S393–S396, S403–S409 — LOCKED)

- **Green "Export PDF" = CAPTURE:** html2canvas rasterizes each on-screen `.page` div (scale 2) → pdf-lib embeds 1:1. The ONLY path matching the preview; `w.print()` re-paginates (orphaned bands, blank pages) and stays only as the taupe "Browser Print" fallback. Capture failure shows an error, never auto-prints.
- **Preview correct + export wrong ⇒ the bug is in the CAPTURE path, not pagination.** Four `_flowBlock` rewrites chased a non-existent bug. `@media print` cannot reconcile a re-paginating printer with a pre-paginated preview.
- **Page size:** deterministic POINTS — letter 612×792, `.p11x17` 1224×792, `.p24x36` 2592×1728 (optionally height from canvas aspect). NEVER `offsetWidth/offsetHeight` (NaN → `addPage([NaN])` throws with pdf-lib's misleading "page must be of type n" message — that's its internal insert-index param).
- **pdf-lib from jsDelivr only** (`_CAP_PDFLIB_CDN`); pageCount-repair shim after `PDFDocument.create()` kept as cheap insurance; addPage try/catch skip-guard per page ("Skipped page 1..N" spanning ALL pages = upstream corruption, not per-page failure).
- **Capture preconditions:** `await D.fonts.ready`; `await _minimapsReady` (armed by `_armMinimapsReady()` before the async minimap chain, resolved by `_signalMinimapsReady()`); per-image `img.decode()` + naturalWidth poll (~10s bound). `complete===true && naturalWidth===0` = failed/empty — never trust `complete` alone.
- **Photo links survive capture** re-created as pdf-lib `/Annot /Link` `/A /URI` dicts from each `<a>` rect scaled to PDF points (Y-flipped). Links = minted opaque tokens only. Field-verified.
- **html2canvas rules:** `object-fit` NOT honored — photos are `background-size:cover` divs (`.dp`), minimaps natural-aspect imgs (`.dc-mini` width:160px height:auto). Zero object-fit in pdf.js. Captured text is not selectable (accepted; the separate pdf-lib row-builder `_betaCollectRows` in the same file is NOT called by the Export button — never fix export bugs there).
- **Minimap performance:** decode each drawing dataURL ONCE (`_mmImgCache` promise cache); `_mmRenderCache[renderKey]` caches finished minimap dataURLs; recurse via Promise microtasks, no setTimeout delays; free canvases (`canvas.width=0`).
- **Section order (S408, per LOCKED_S316 §4):** body → Appendix A → Previously Closed → Recommendations → Appendix B. `_emitAppendices(_kindsWanted)` called twice; `_appLetters/_appIdx` HOISTED so lettering spans calls; shared declarations before the first call.
- **Recommendations lead dashboard (S409):** reads the SAME predicates as the Rec Summary table (`_recOpenN`, `notedOnInstance`) — donut and table can never disagree. Rec palette fixed hex both modes: open `#5E5440`, closed `#5F8068`, new arc `#2C7FB8`.
- **Appendix large-format (S346, live):** export modal `#exv-drawpage` Letter / 11×17 / 24×36 (**default 11×17**, S396); hidden when report-only. Letter = drawing-on-top + `.app-pin-table` below, chunked. 11×17/24×36 = `.app-split`: drawing LEFT flexes, card list RIGHT fixed 4.6in (body `.dc` family minus photo), measured chunking, drawing repeats per chunk. Mixed-size print via named `@page tabloidpg/archpg`; body stays Letter. Pin frac per sheet: 0.014/0.022/0.028. `.app-pin-table th/td vertical-align:top` (S362).
- **Untagged-pin fan-out guard (S345):** grouping guards with `_pinHasOwnTrade(d)` — untagged pins route ONCE into "Other Trade Items", never once-per-trade ("27 instead of 13"). Minimap fill uses `querySelectorAll` on `data-mm` (duplicate IDs across sections) + `_mmDone` dedup. `_stampKeepWithNext` stamps tradeHeader too. Bullet rule (`_descHtml`): a line is a bullet ONLY if it begins with a dash on its own line.
- **Missing/404 photo → `.dp-missing` placeholder tile, never empty `<img>`** (empty-src corrupts html2canvas).
- **Distribution (S346/S393–S394):** `_pdfDP` sources `p.distribution` (modal selection incl. added recipients) when present. `_exportPDFWithCache` gained a 17th param `internalMode` (⚠️ the fallback call site ~2308 still passes 16 — align on next pdf.js edit). Internal Site-Records report: Option-B banner (3px `#1C2333` top rule + corner tag, report-ink not burgundy), distribution forced "Internal — ARENCON only".
- **Export modal (REWRITTEN S393–S394, one-time authorized):** `initExportView.open()` = merged single-roster modal — ONE contractors-only table (Site Records excluded, de-duped), Deficiency ✓ column (drives ctrFilter) + Distribution ➤ column (drives `p.distribution`, owner forced first, locked ON); default the two link, overridable. "+ Add to pool" recipients deletable. Internal mode: greys roster, in-DOM confirm (never browser confirm), `ctrFilter:'__general__'`, `includeSiteRecords:true`. Report Title + inspector initials removed (inspTag 'off'). Header navy `#1B2438→#243048` (Mark rejected burgundy); client-mode primary navy, internal-mode Generate/confirm keep burgundy as warning accent. "White-on-white" in this modal historically = the "All contractors" bar + hint footer (hardcoded dark now). Site Records defaults UNCHECKED (never a hardcoded ✓ glyph in un-`.on` markup). **Generate PDF must NOT close the modal** (preserve scope selections; closes only via X/Cancel). Fit-viewport layout: header/footer pinned, body scrolls.
- **PDF is generated FRESH from pdf.js on every export** — fixes are global, no per-project patching, report never stored. Page-1 additions (S336): two summary bars between dashboard and Deficiency Summary (`_progressBarsHtml`): Project Resolution (cumulative) + This Visit (+new/−prior-closed); minus sign MUST be literal U+2212. Donut blue "new" arc shows whenever ≥1 new OUTSTANDING item (never suppressed at N>=T, never under green). Per-defic minimap: crop 0.291, pin `outW*0.1215` floor 49. Closing note under the page-1 summary table; appendix "(cont.)" uses the navy `.sh` band + italic `.ch-cont`; trade keep-together only for sections ≤ `PAGE_H*0.45`. Closed PDF minimap teardrops = solid green `#5F8068`. PDF teardrop inner fill traces the viewer's exact path (`M16 3…16 37`); note `_PinPan` uses the fuller `M16 1…16 40` — reconcile if mismatched in the field.

## DEFICIENCIES TAB — S336–S338 additions

- **Filter row = 5 segments:** All · Outstanding · Recommendations · Site Records · Closed. "All" = `_activeDlcTab='any'` + `_dfxRecMode='all'`, neutral chrome active state (never a category colour). Markup static in frt/index.html; state machine in deficiencies.js (`_setCatFilter`/`_deriveCatFilter`/`ccAll`). Phone portrait: All full top row, 2×2 below. Add-button label follows the filter (`Add recommendation` / `Add site record` / none on Closed).
- **Connected-card band reskin (S337 R1, CSS-only):** trade banner + contractor banner + cards = ONE bordered rounded card (`.dfx-trade-section`); soft burgundy gradient trade header + accent tick; contractor band flush; hairline between contractors. Both bands KEPT (ghost-trade rejected). Collapse selectors untouched.
- **Rounds-escalation chip (S337):** replaces "Noted FRT #N". Round = `(currentFrtInstance − notedOnInstance) + 1`; round 1 = NO chip; **2nd rd grey**, **3rd+ maroon + drawn inline SVG flag (never emoji)**. Render-only, in `_buildObsRow`.
- **Closed view split (S337):** per-contractor "Closed this report" (sage) vs "Previously closed" (muted grey) by `closedOnInstance >= currentFrtInstance`; `_emitPin` closure shared.
- **Reopen lifecycle (S338, LIVE):** non-destructive + nature-preserving — routes through `Model.updateDeficStatus(id,'open')` which clears `addressed` WITHOUT touching priority/isRecommendation (the original nature re-surfaces). **NEVER force a priority on reopen** (the first-build bug flattened everything to high). `reopenedOnInstance/reopenedFromInstance` stamped ONLY on cross-report reopen; same-report reopen silent; re-closing clears. `reopenDeficiencies(ids)` batch. UI: blue `#2C7FB8`/`#46C5E8` accent; "↩ Reopen" menu item only when closed; "↩ Reopened FRT #N" chip ALWAYS shown when stamped (Mark: documents an undone closure); Closed-view multi-select (`_cvSelMode`/`_cvSelIds`) reopen-only, transient, auto-exits on filter change.
- **Rec-segment dashboard (S406):** `_deriveCatFilter()==='rec'` renders `_renderRecDashboard` (per-obs via `_deriveCategory`; 0-obs pins fall back to pin flags); `.dlc-track-rec` brown→sage gradient.

## AUTH / SYNC / DATA INTEGRITY (S338, S426, S440)

- **Token-refresh hardening (S338, root-cause):** `_refreshToken` writes `sb-refresh-token` ONLY when `data.refresh_token` is truthy (the unconditional write clobbered good tokens → silent 401-loop → "Saved locally, never Synced"). `window._authSessionExpired` flag for diagnostics. Only `signOut()` removes the refresh token. A genuinely-expired session still needs manual re-sign-in.
- **`Auth.getInitials()`** (profiles.initials → full_name → email local-part); FRT "Prepared By" auto-fills only when empty.
- **AI write-back must persist via Model methods, never raw-assign (S342):** `_writeBack` routes obs→`Model.updateObservation`, act→`updateActivityEntry`, cn→`updateClosedNote` (each sets `_dirty` + queues cloud save). `Model.saveNow()` is IDB-only.
- **Stale-writer guard (S426):** `_pushToCloud` skips when remote `updated_at` > this tab's pull baseline; dirty flag preserved; pull reconciles. External DB repairs are safe against open tabs.
- **Silent pulls must repaint (S440):** every background-pull success path calls `_repaintAfterPull()` → `switchTab(_currentTab)`; plus instant remote check on `visibilitychange→visible`.
- **⚠ S189 GUARD COLLISION — OPEN DEFECT, next session's FIRST build.** `_guardArrayShrinkage` cannot distinguish a legitimate cross-device PURGE from a wipe (both = cloud shorter, strict id-subset) → rescues by replacing cloud with local wholesale → stale device PUSHES the rescue → **resurrection** (1490.04, forensically confirmed). Soft-deletes don't trip it. **Fix design (agreed): tombstones** — purge writes `{id, purged:true, purgedAt[, r2Key]}`; arrays never shrink on legit purges; guard stays armed for real wipes; ALL consumers skip tombstones (FRT gallery/counts/trash, lightbox, PDF, R2 rebuildUrls, **Hub gallery+badges**, photo picker, sync merge); narrow guard exception when every cloud-missing id is locally `purged:true`; migrate `_bulkPurge`/`purgePoolPhoto`/`purgeSitePhoto`. **UNTIL SHIPPED: do NOT open 1490.04 in FRT on Mark's phone** (stale 44-photo IDB re-resurrects; PC safe). Repair record: cloud restored to 19 photos/7 flagged; pre-repair state = history reason `pre_sync_repair_1490_04_S440`.
- **Raw-JSON vs in-memory model (S431, CRITICAL):** cloud-JSON deficiencies carry **no `contractorId`** (in-memory only). Raw-JSON consumers derive contractor-vs-site from STRUCTURE: `contractors[].deficiencies` vs `data.generalDeficiencies`. Never test `d.contractorId` on raw data.
- **Supabase repair toolkit:** MCP `execute_sql` bypasses RLS. `tool_data_history` columns: `hist_id,row_id,project_id,tool_key,instance_number,data,data_bytes,row_updated_at,row_updated_by,snapshot_at,snapshot_reason` (filter `row_id`, order `hist_id`). jsonb rebuilds: **COALESCE every jsonb_agg** (empty array → NULL → `jsonb_set(...,NULL)` destroys the array); verify with aggregates. `projects` col = `project_name`. IndexedDB DB name is **`ARENCON_FRT_V2`** (photo objects in the `projects` store). 7155.51 has two project rows (`6338d5af` real FRT; `9173a374` diesel-only dup).
- **Mobile-keyboard bug patterns (S340):** a fixed on-photo box anchored to a canvas rect is placed ONCE and left alone while typing (re-running the positioner on input yanks it once the keyboard shifts visualViewport). NEVER compensate for the keyboard by moving the photo (feedback-loop ratchet — the reverted `_kbShift`).
- **`window._frtModel = Model`** dev hook exposed (S340).

## NAVIGATION / SCROLL-LOCK / SHARED (S404–S425)

- **Nav convention (Mark-approved S412, all tools):** three tiers — tool page → project detail (Hub `?project=<uuid>`) → Hub dashboard. Back = exactly ONE tier up; in-tool it first peels layers via the tiered back-trap (lightbox → drawing viewer → export modal → mobile menu → default tab), then leaves through the canonical `_leaveTool()` (3-button dialog when dirty). Back may NEVER skip to dashboard. **ARENCON logo = Hub dashboard (home)**, save-guarded, via `_hubDashboardUrl()`. Hub deep-link accepts BOTH `?open=` and `?project=` (S413). All back-like paths route through ONE `_leaveTool()`; duplicate listeners forbidden.
- **Scroll-lock system (S416–S418):** `frt/js/shared/scrollLock.js` — ref-counted `lockScroll()/unlockScroll()/resetScrollLock()`, position:fixed body lock with scrollY capture/restore. Wired: dialogs.js overlays, exportview main overlay (`ov.remove`-override = the sanctioned exactly-once path-agnostic unlock pattern) + internal confirm, assistant panel, mobile menu, `_issueReport` modal, ai/usage. Lightbox/drawing-viewer keep their own `body.lb-open`/`body.dv-open` CSS locks — separate. Pending port: Electric/IST/OBC/DD as inline IIFE.
- **Sticky fullscreen (S439):** 15-line IIFE before the LAST `</body>` in all 10 root pages (several tools contain `</body>` inside template strings — always `rfind`); any pointerdown re-enters fullscreen when chrome shows. Chrome's exit toast is unsuppressible.
- **`showDialog` vertical option** (S328 canon in base) unchanged; `dialogs.js` and `cameraBurst.js` confirmed concurrent-writer flip-flop targets — re-fetch at live HEAD + assert anchors before splicing.
- **Hub launch/tab reuse (S341):** `window.open('', 'arencon_{key}_{projectId}')` FIRST (focuses existing named tab without navigation); set `.location` only when new/blank/different report. Report tabs keyed tool+project+instance. Never open `about:blank` into the named target. AI-Usage PDF + print previews intentionally `window.open('','_blank')` — leave as-is.
- **ai-proxy repoint:** `frt/js/ai/assistant.js` WORKER_URL = Supabase `ai-proxy` Edge Function (S415, confirmed) — closes that item. Old github.io origin still live = two origins = split IDB/localStorage; retire with a redirect page only on Mark's approval, then drop github.io from worker allowlists.

## CONTRACTOR RESPONSE SYSTEM (design LOCKED S432; Phase 1 = report PDF, build pending)

Authority: `LOCKED_CONTRACTOR_RESPONSE_SYSTEM.md`. Data model: per-defic `responses[]` (insert-only contractor entries `{round, instance, source:'manual'|'pdf'|'portal', status:'addressed'|'progress'|'scope'|'other'|'noresponse', text, photos[], responderName, company, receiptId, emailPending}`) + `arenconReviews[]` (`{instance, status(real FRT status), text, photos[], date}`). Round math reuses S337. **Invariants:** contractor entry text is NEVER edited by ARENCON — anywhere, ever (ARENCON's voice = the review entry only; cross-comments accept-verbatim-or-exclude); **thread arrays must survive every save/load/sync/merge path** (same protection class as `markupObjects`). Print grammar: one `.crb` box/item, flat hairline rows, NO nested boxes; colour = ARENCON only (claims quiet slate; ARENCON Review row = sole pill + 2px burgundy rule); rounds chip per S337 tiers; thread compression for rounds older than the previous report; closed-this-report prints full thread, earlier-closed → back Previously Closed table. Fillable AcroForm via the C2 pdf-lib post-process: `resp_{item}_status` exclusive group + `resp_{item}_comment` fixed 4-row shrink-to-fit never-scroll (pagination determinism); deterministic field-name import contract; "Save the PDF — do not print to PDF". Lifecycle (Phase 2 locked): Awaiting → (Responded | No response) → Reviewed, hard sequence; composer locked till resolved; inbox never auto-writes; conflicts portal-pre-selected; deterministic no-AI PDF import; soft email gate ("📧 Email pending" until the email of record). Full decisions log in the S432 lock file.

## PUSH / DEPLOY DISCIPLINE — additions (S342–S440)

- **`tools/push_guard.py` is MANDATORY** before pushing any single-file tool or catastrophic-if-stale file. Fetches live-HEAD copy, ABORTS on >2% byte shrink or lower/missing build string (byte-accurate since S413).
- **Edit base = the repo blob at live HEAD via API** — never the CDN copy, never the project-knowledge snapshot (the S391 Diesel −8,000-line wipe was a stale-snapshot base). Whole-file edits in binary mode (`rb`/`wb`).
- **`curl -d` with a large base64 blob silently truncates** — always `--data-binary @file`; hard-stop guard: verify blob SHA non-empty before building the tree.
- **Bump `FRT_BUILD` (app.js ~2085, burgundy console badge) + SW `CACHE_NAME` on every FRT push**; markupEngine.js also needs its `?v=` bump when touched.
- **Restore tags canon:** tag `<tool>-good-SNNN` / `<tool>-checkpoint-SNNN` after each field-verified build.
- **GitHub Pages latency:** serves the previous build ~1–10 min post-push; verify live by content-signature grep with cache-buster or the Pages builds API — never build status alone. Hung `building` >3–4 min → **`.deploy-kick` touch commit** (PAT can't POST rebuilds — 403). **`.nojekyll` at repo root is PERMANENT** (Pages intermittently failed builds through Jekyll).
- **SW serves same-origin files network-first — it CANNOT hold a stale app.js online.** Stuck-on-old-build = CDN/Pages latency. Android reload ritual: pull-to-refresh ×2, else swipe the tab away and reopen. Map vNNN→commit by reading sw.js CACHE_NAME at each commit (messages don't carry it).
- **Test Agent (S399/S400):** workflow `test-agent` (push paths + nightly 09:00 UTC cron); failure → Issue labeled `test-agent`. `tests/frt.test.js` (9 checks, explorer seed 411001). Tripwire lists = the canonical shipped-feature register — update when features ship. Pre-existing repo workflow `test.yml` ("Tests") fails on every commit — not ours.
- **Custom domain (S390):** `arencon.app` (GitHub Pages, repo root; HTTPS enforced, HSTS). PAT cannot edit Pages settings. Root `index.html` = branded redirect → Hub (no public portal by design). New tools use relative cross-tool links, never hardcoded hosts.
- **Architecture decisions (standing):** single-file rule RETIRED — /lib/ shared-engine restructure approved (`SHARED_ENGINE_EXTRACTION_PLAN.md`); FRT data layer wins (3-way base-snapshot merge, durable outbox, etag-verified R2); Electric converts FIRST; live tools untouched, same backend, feature-parity before pointer flip. Project-instructions "single self-contained HTML files" line + old worker URL are STALE pending Mark's edit — the plan and the latest handoff override them.
- **Process canon (reinforced repeatedly):** after 2 failed fixes STOP and instrument from live state — in-app DIAG strips beat standalone diagnostic pages; "0 difference" between builds is itself a measurement (path never executes, or user is on the old build — check the live deploy marker first). Distinguish "feature broken" from "data-state broken" and from stale cache before changing code. When a session degrades into fix-one-break-one, roll back to the last measured-good commit. When Mark circles UI in a screenshot, match the EXACT circled elements. Memory store is at cap — durable facts go in handoff/PK files.

## CURRENT OPEN QUEUE (S440 — supersedes ALL prior queues in this file)

1. **Tombstone purge system** (photo-loss-class; demo/field-verify-gated; Mark present) — design agreed above. Then clear the 1490.04 phone quarantine.
2. **Workstream 2 — video capture → R2 → PDF** (locked decisions above).
3. **Library Step 0+1** per `SHARED_ENGINE_EXTRACTION_PLAN.md` (Mark, binding S431): `/lib/` skeleton + `electric/` skeleton loading lib/toast, then extract toast/idb/dialogs/auth with the S395 JWT acceptance case. Boot: "proceed with library step 0". FRT→/lib/ import migration LAST.
4. **Contractor Response PDF, Phase 1** (Layout B1, design locked S432) — flagship, own session(s).
5. Deferred backlog: 7155.51 orphan-file audit + r2cleanup (after relinks fleet-final); scroll-lock part C (Electric/IST/OBC/DD); camera-review `v437` tag keep/strip decision; phone photo tombstone bug (PC-deleted photos persisting on phone — folds into #1's field verify); dimension D1/D2/D3 wants; lightbox→viewer text-engine port (`SCOPE_FRT_TEXT_ENGINE_PORT.md`); copy-of-site-photo identity (separate-tile render); photo date-edit for pre-S367 photos is SHIPPED (S414) — verify; camera-burst on-device re-verify after any camera edit (diff `_grabFrameCore` byte-identical).
6. **Owed field verifies:** trash grid on Mark's PC pass; S440 repaint two-device test (interrupted by the S189 discovery); instance-1 7155.51 keep-or-delete (Mark's call).
7. **Housekeeping:** PAT rotate + scrub once the build phase is done (flagged since S336); Mark's project-instructions edit (single-file line + old worker URL); repo demo/diag artifacts (camtest.html, camera-ui-demo.html, camera-burst-demo.html, frt/diag-camera-orient.html, .deploy-kick) cleanup only with Mark's OK.

---

# PART S492 — STATE CORRECTION (SUPERSEDES ALL EARLIER SECTIONS OF THIS FILE)

> **Convention:** a later PART supersedes an earlier one. Where this PART and
> anything above it disagree, **this PART wins.** The "CURRENT OPEN QUEUE
> (S440)" section above is **STALE AND DEAD** — do not work from it.
>
> **Why this PART exists.** Four consecutive sessions re-derived the same state
> from live HEAD, reported it to Mark as a finding, asked Mark the same four
> questions, and then closed without writing any of it down. Mark answered the
> same questions four times. That is a recording failure, not a discovery
> problem. The corrections below are written so that no session ever asks them
> again.

---

## 1. THE SWITCHOVER IS DONE. IT HAPPENED AT S490.

**`frt-next` → live FRT is NOT pending. It is COMPLETE.**

Verified against live HEAD (GitHub Trees/Blobs API, not documentation prose):
`frt/js/viewer/` holds the complete viewer stack. 5 of 7 files are **byte-identical**
to their `frt-next` counterparts (`dimensionTool.js`, `markupEngine.js`,
`markupSelBridge.js`, `tiledPdf.js`, `webglMarkup.js`).

The two that differ — `viewer.js` and `markup.js` — differ because **LIVE IS AHEAD**:

| Fix | In live `frt/` | In `frt-next/` |
|---|---|---|
| Footer ⋯ More relocation | ✅ | ❌ |
| S479e dead-code removal | ✅ | ❌ |
| S491 WebGL teardown fix (tablets silently downgraded to slow rendering after a page switch) | ✅ | ❌ |

**CONSEQUENCE — HARD RULE:** copying `frt-next` over live is a **REGRESSION**.
`frt-next/` is now a **BETA LANE**, not a staging area. It is not "ahead."
Nothing is waiting to be merged from it.

**Do not propose, plan, schedule, or ask about "the switchover." It is finished.**

## 2. THE F1–F10 VIEWER BUG QUEUE IS CLOSED.

All triaged and resolved. F3 (lightbox resize losing zoom) and F10 (menu on a
narrow tablet) were fixed **at root** in S490 — not patched around. No open
viewer bug queue exists.

## 3. LIBRARY MIGRATION — STEP 1 IS COMPLETE (14/14 PAIRS).

**Do not re-plan, re-audit, or re-propose step 1.** It is done.

What step 1 was: `/lib/` and FRT each held the same 16 modules by name, but only
2 were the same file. FRT's copies were consistently newer — every fix since the
original extraction had landed in FRT's private fork while the shared copy went
stale. Now: one implementation each, FRT consuming all of them.

**What it uncovered (the reason it mattered):** Electric was running on ALL of
those weakened copies. Four real data-safety holes were closed as a result,
including a photo-pointer guard whose absence silently reverted a photo-loss
protection on every sync.

**Step 1 ≠ the whole migration.** Still outstanding: Diesel (in progress),
Electric (not started; its photo-architecture port is the top field-safety item),
Electric on header v1 while FRT is on v2, two competing sign-in implementations
to reconcile. Hub was migrated to the shared header and its last 6 native popups
were converted in S492.

## 4. LIVE TRIAD — CORRECTED.

| | Stale value in this file above | **ACTUAL (verified live)** |
|---|---|---|
| FRT build | S440 | **S491j** |
| SW `CACHE_NAME` | v1026 | **v1154** |

(SW has since advanced through v1155–v1158 during S492 Diesel/Electric work.
Always read the live value before bumping — never trust a number in a document.)

## 5. BETA SANDBOX PROJECT UUID — DEFERRED BY MARK. NOT A BLOCKER.

`frt-next`'s allowlist is empty, so the beta lane opens no cloud project.
**Mark deferred this explicitly (S492).** It is not blocking anything and is not
an open question. Do not raise it again unless Mark raises it.

## 6. SEAL REDACTION — DECIDED: **WARN**. NOT OPEN. (Mark, repeatedly.)

**Mark has answered this many times: WARN, not block.** It was recorded as
"open" anyway — including, absurdly, in the first cut of THIS PART, whose entire
purpose is to stop losing Mark's decisions. It is not open. Do not ask again.

**The decision:** the export screen lists any appendix drawing with no redaction
box as a **WARNING**. It does **NOT** hard-block issuance. Many drawings
legitimately carry no seal; a block that fires on those trains inspectors to
click through the gate, which destroys the value of the gate.

`LOCKED_SEAL_REDACTION.md` §8 still reads "OPEN — Mark to confirm" — that line is
**STALE AND WRONG**; this PART supersedes it. Build to WARN.

## 7. PHOTO INPUT — CANON FOR EVERY TOOL, CURRENT AND FUTURE (Mark, S492).

**`lib/ui/photoInput.js` IS the photo input surface for every ARENCON tool.
No tool draws its own photo zone. Ever. Including tools that do not exist yet.**

The standard, three ways in, always:
**Drag & Drop (the zone itself) + 📷 Camera + 📎 Upload + 🖼 Gallery.**
Never a click-only zone. Never a subset.

**THE TEST (mechanical, not a matter of opinion):** grep the tool for photo-button
markup (`pz-camera`, `pz-upload`, `pz-gallery`, `pm-b cam`, `pm-b gal`).
**If the tool draws even one photo button itself, it has NOT adopted the engine —
it is a copy, and it will drift.** A conversion that leaves the host drawing
buttons is fake.

**Storage stays per-tool — deliberately, and this is load-bearing.** The engine
hands back `File` objects and NOTHING else. Each tool routes them into its own
field-proven pipeline (Diesel: `handleFiles` → EXIF date capture → compression →
`ArcPhoto.mint` → R2 own-key upload → IDB). An engine that saved photos for its
hosts would have to know all of them, and the first time one changed, a photo
would vanish untraceably.

**CSS is ported VERBATIM from FRT's live `frt.css`, never re-derived.** A
"matching" copy is how the previous cut drifted (hint 12px vs 11px, gap 5px vs
6px, wrong padding — Mark spotted it instantly). `.obs-drop-btn.is-upload` MUST
be present: it is the one genuinely new rule the engine adds, and its absence in
S478e made Upload white-on-white — an invisible live button on Mark's tablet.

**Status as of S492:** `lib/ui/checklist.js` converted — it draws zero photo
buttons and renders the engine. Diesel + Electric both adopted (Electric's two
flow-test zones converted too). Electric's Gallery is currently rendered-but-
unwired pending its gallery-pick path; **Mark's standing instruction is that
everything renders now** — the wiring follows, the button does not get hidden.

## 8. RULE EARNED THE HARD WAY (S492) — DELETION vs. SHARED HOST CONTRACTS.

**Before deleting ANY function from a tool that consumes `/lib/`, grep EVERY lib
module too.**

A shared engine calls host functions **by name**, from HTML it generates as
strings, in a **different file**. Those call sites are **invisible** to a
single-file reference scan. The S492 dead-code sweep counted references inside
the Diesel file only, declared 22 functions orphaned, and deleted five that were
load-bearing:

| Deleted | Called by | Broke |
|---|---|---|
| `triggerPhoto` | `lib/ui/checklist.js` | click-to-upload |
| `handleDrop` | `lib/ui/checklist.js` | drag-and-drop |
| `_galleryReuseChecklist` | `lib/ui/checklist.js` | Gallery button |
| `removePhoto` | `lib/ui/checklist.js` | thumbnail ✕ |
| `_dslMarkupRevert` | `lib/ui/lightbox.js` | **photo markup revert** |

The checklist photo zone went completely inert in the field. `node --check`
passed the whole time — syntax validity proves nothing about a late-bound global.

## 9. PROCESS RULE — WRITE THE DECISION IN THE SESSION IT IS MADE.

**Deliverable files are updated BEFORE wrapping, as part of finishing the work —
never "on request."** Treating the PK/handoff update as an optional deliverable
is what produced the four-times-repeated question this PART exists to end.

Corollary, already canon and repeatedly violated: **do not trust a handoff
document's own claims.** Verify against live HEAD (Blobs/Trees API) plus a
past-session search before telling Mark something is done, undone, or agreed.

---

## CURRENT OPEN QUEUE (S492 — SUPERSEDES THE S440 QUEUE ABOVE)

**FRT — what is actually left:**

1. **Field-verify S490–S490d** (needs Mark on a device): trade write-back "No"
   path · ⋯ More in the footer · F10 menu on a narrow tablet · F3 lightbox
   resize keeping zoom.
2. That is all. **There is no switchover. There is no F1–F10 queue. Seal
   redaction is DECIDED (warn) and needs building, not deciding.**

**Deferred by Mark (do not re-raise):** beta sandbox project UUID · Hub client
suggestion · AI agents (training + site-review copilot; knowledge-boundary
question unanswered).

**Specced, ready, deliberately deferred until library work settles:** trash mode
(`LOCKED_TRASH_MODE.md`) · seal redaction (`LOCKED_SEAL_REDACTION.md` — **decided:
WARN**; build it, do not re-ask) · HD photo
tiers — **root-cause check owed FIRST:** does export render drawings from full
source or a cached preview bitmap? If the latter, that is the real blur cause and
DPI tuning will appear not to work.

**CRB:** Phase 1 shipped. Phase 2 (Pending/Confirm, issue-gate, round math,
carry-forward) is owned by a DIFFERENT session under the lane rule — this file
does not move it. Phases 3–4 (purge, tombstones, photo cleanup) after.

**Platform / cross-tool (not FRT-blocking):** Diesel SYNC-NEXT field-verify
(tests 1–3 passed S492; test 4 retestable after the restoration fix) · Diesel
onto shared `/lib/` · Electric photo-architecture port (**top field-safety
item**) · Electric Gallery wiring · header v1→v2 drift · two sign-in
implementations · Export Project Docs · Photo Gallery standalone · M365
migration.

**Housekeeping:** **PAT is burned — rotate** (flagged since S336, still open).
