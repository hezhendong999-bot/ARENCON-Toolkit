# HANDOFF — Session 130

**Date range:** 2026-05-13 → 2026-05-14 (long session, crossed midnight)
**Final HEAD:** to be filled by the closing commit hash
**SW:** `arencon-frt-v375`
**CSS:** `?v=297` (unchanged — no visual style changes this session)
**CI status:** all 3 jobs green on every push

---

## What shipped this session (chronological)

| Commit | Title |
|---|---|
| `0aa5db114d` | S130 Item 5.3 — parseLarge in syncWorker for off-thread pull JSON.parse |
| `0d14b1cd28` | S130 Item 5.1 — UploadQueue: concurrency cap + lane FIFO + transient retry |
| `e9b7d532f2` | S130 Item 5.4 — Image compression in OffscreenCanvas worker (Android-only waiver) |
| `b4dfa8f413` | S130 Item 4.2 — CI workflow_dispatch input to regenerate visual baselines |
| `a9431bf29c` | S130 Item 1.3 — Boot pre-flight diagnostic tooling (Auth._diag + preflight.js) |
| `0e597d9e04` | S130 — AI auto-group deficiencies + Hub site-photos bug fix |
| `826d5ca01e` | S130 — Hub photo UX: single click opens lightbox + hover-only checkbox |
| `2005680492` | S130 — Per-observation groups + fixed catalog + bug fix |
| (this push) | S130 — Proposal A: jump-to-pin from Hub lightbox |

---

## Closed this session

- **5.3** parseLarge in syncWorker (off-thread pull JSON.parse)
- **5.1** UploadQueue (concurrency cap + lane FIFO + transient retry)
- **5.4** Image compression in OffscreenCanvas worker (rule waiver: Android-only)
- **4.2** CI workflow_dispatch input to regenerate visual baselines
- **1.3 tooling** Auth._diag + preflight.js diagnostic
- **#1 AI auto-grouping** — per-observation, fixed catalog, classifier worker
- **Hub site-photos bug** — was reading `data.sitePhotos` (legacy), now reads `data.photos` (FRT v2)
- **Hub photo UX** — single click opens lightbox, hover-only checkbox (match FRT pattern)
- **Proposal A — jump-to-pin** — Hub lightbox button → FRT with `?pinFocus=<deficId>&from=hub`; FRT uses existing `_frtNavigateToPin` hook to focus on the pin

## Killed (do not propose again)

- **5.2 IDB writes in worker** — footgun. No transaction isolation across threads; the disk I/O already happens off-main-thread inside the browser's internal IDB worker; cross-thread locking would require COOP/COEP headers and a major refactor for zero user-visible gain.

## Carried forward to S131

| | Item | Notes |
|---|---|---|
| 1 | **Dead-code / unwired-feature audit** | Mark's directive: first task of S131. Walk every module, identify unused functions, dead branches, and features that have UI but no working backing (or vice versa). |
| 2 | **Proposal B remainder — drag-drop + grouped view + PDF rendering** | Foundation shipped (per-obs groups, catalog editor, badge with picker). Still needed: a "Grouped view" tab in the deficiency tab, drag-drop reorder within and across groups, PDF export emits group section headers using `obs.aiGroup` + `obs.groupOrder` |
| 3 | **1.3 tablet pre-flight verification** | Tooling shipped (`frt/js/diag/preflight.js`). Mark runs after 1h+ sign-out → sign-in → reload. Pastes preflight.js into console. Verifies S129 Items 1-3 fired in production. |
| 4 | **Unified Hub bulk-download with smart backup** | Was #2/#3; scope grew based on Mark's input. Smart backup: per-project lastDownloadedAt tracker, "Download Changed" / "Download All" buttons, indicator badges (🟢 backed up / 🟡 changed since / 🔴 never), ZIP output with per-project subfolders and manifest. ~1.5 sessions. |

---

## FRT Tier list — features to build, ranked by ARENCON workflow value

Mark asked for this list to be in the handoff for later. **Order them and decide one or two per future session.**

### Tier 1 — real time-savers

| | Feature | Effort | Why |
|---|---|---|---|
| T1.1 | **Voice-to-text for observation notes** | 1 session | Web Speech API on Android Chrome. Typing on a tablet under a sprinkler head is slow. Free, no API cost. |
| T1.2 | **Photo annotation overlay** (arrows, circles, callouts) | 1-2 sessions | Currently the photo is the evidence; inspectors describe "see the gap upper right" in text. Annotate on the photo directly. |
| T1.3 | **Recheck date / reminder on deficiency** | 0.5 session | Open defic with "re-inspect by [date]" → Hub dashboard surfaces what's due. Persists with the defic data. |

**Explicitly EXCLUDED by Mark on 2026-05-14:** Deficiency templates / quick-add. Do not propose this again.

### Tier 2 — quality of life

| | Feature | Effort | Why |
|---|---|---|---|
| T2.1 | **Saved filter presets** | 0.5 session | "Show me sprinkler-only urgent items" one-click instead of three |
| T2.2 | **Multi-mode PDF export** (Executive 1-pager / Detail full / Contractor-only) | 1 session | One flavor today; different audiences want different depth |
| T2.3 | **DRAFT watermark on PDFs** in review state | 0.3 session | Status badges already track state; watermark on export prevents draft-as-final accidents |
| T2.4 | **Cross-project search** (find any project mentioning text) | 0.5 session | Hub-level full-text search across projects |

### Tier 3 — useful but not urgent

| | Feature | Effort | Why |
|---|---|---|---|
| T3.1 | Auto-numbering by area/floor instead of pure sequence | 0.5 session | Current numbering is creation order; floor-based reads better |
| T3.2 | Inspector handoff notes (mid-stream takeover) | 0.5 session | Note attached to project when one inspector hands off to another |
| T3.3 | Excel export for tracking spreadsheets | 0.5 session | For external trackers that aren't ARENCON's PDF format |
| T3.4 | QR code per drawing for direct pin lookup | 1 session | Scan QR on a printed drawing → opens that pin in FRT |

---

## Worker deploy pending (Mark action)

The auto_group mode plus the obs-level refactor BOTH require `arencon-ai-worker.js` to be redeployed via Cloudflare dashboard. Until that happens, the AI Group button shows "AI auto-grouping not yet deployed — Mark needs to push the latest worker code in Cloudflare dashboard."

Steps:
1. Cloudflare dashboard → Workers → arencon-ai-worker → Edit Code
2. Paste current contents of `arencon-ai-worker.js` from the repo
3. Deploy

After deploy, the catalog picker UI works immediately; AI Group button works immediately.

---

## Critical rules to keep in front of mind for S131

1. **Dead-code audit FIRST.** Mark's explicit directive for S131. Don't jump into B drag-drop or anything else before the audit lands.
2. **One ask_user_input widget per turn, max 1 question.** Non-negotiable.
3. **Bump SW cache** on every JS-touching push. Final state this session: `v367 → v375` (8 bumps).
4. **Never claim work is done that isn't.** 1.3 verification still pending — tooling is shipped but the actual physical check on Mark's tablet has not happened.
5. **Visual regression baselines depend on Carlito.** Don't change fonts or print CSS without regenerating baselines (use the new workflow_dispatch toggle in the Tests workflow).
6. **Worker code at the repo root** (`arencon-r2-worker.js`, `arencon-ai-worker.js`) is **not auto-deployed**. Mark must push via Cloudflare dashboard. Always tell him when a worker change ships.

---

## Net state

```
HEAD              (filled by closing commit)
SW                arencon-frt-v375
CSS               ?v=297
Unit tests        90 passing (was 60 at session start, +30 net)
Coverage          64.46% statements / 74.52 branches / 63.15 funcs / 64.46 lines
                  (was 59.93/71.26/54.34/59.93 — improvement across the board)
CI                all 3 jobs green
Open PRs          none
Worker deployed   arencon-r2-worker (S129); arencon-ai-worker NOT YET (pending Mark)
S130 items closed 5.1, 5.3, 5.4, 4.2, 1.3 tooling, #1 AI group, Hub photo bug, Hub photo UX, Proposal A
S130 items killed 5.2 (footgun)
S131 first task   Dead-code / unwired-feature audit
S131 then         Proposal B remainder, smart-backup bulk-download, Tier 1 items per Mark
```

— End of HANDOFF_SESSION_130.md
