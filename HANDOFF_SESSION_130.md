# HANDOFF — Session 130

**Date:** 2026-05-13 → 2026-05-14 (long session, crossed midnight)
**Final HEAD:** `2c43904e6b`
**SW:** `arencon-frt-v382`
**CSS:** `?v=297` (unchanged — no visual/style changes this session)
**Tests:** 91 unit tests passing | CI 3 jobs green on all pushes
**Coverage:** ~64% statements (up from ~60% at session start)

---

## ⚠️ READ FIRST — Live state & open risks

0. **🔴 S131 PRIORITY #1 — FIELD TABLET ZOOM CRASH. The app FAILED in the field on
   2026-05-14 — the team could not use FRT for a live site review.** When field staff
   zoom in on a drawing, the tablet runs out of GPU memory, the browser kills the WebGL
   context, and the app crashes/blanks. Root cause: the markup memory budget in
   `markup.js` has only two tiers (Android phone = 10 MP, everything else = 30 MP) — so
   field TABLETS silently get the 30 MP DESKTOP budget, which their GPU cannot hold.
   Full diagnosis, fix plan, and acceptance criteria are in
   `S131_PRIORITY_1_TABLET_ZOOM_CRASH.md`. **This must be addressed before any other
   S131 work, including the dead-code audit.** Immediate field workaround: `?webgl=0`
   in the URL or `localStorage.setItem('ARENCON_NoWebGL','1')` — falls back to Canvas
   2D, no GPU textures, no crash.

1. **Team is on site using FRT right now (as of session end).** All core read/write
   paths are on untouched, safe code. Do not ship risky changes until they're done.

2. **`_r2cleanup` diagnostic is NOT safe to use.** Its `/listall`-backed inventory is
   blind — reports "1 R2 object" when the project has 200+. AND its orphan classifier
   produces false positives (flagged a real markup file as an orphan because markup is
   stored under a different folder-ID than drawings). **Do not run `_r2cleanup.scan()`
   or `_r2cleanup.deleteOrphans()` until S131 fixes both.** `scan()` is read-only and
   harmless; `deleteOrphans()` is the danger and must stay untouched.

3. **`arencon-r2-worker.js` deploy status uncertain.** `/list/` is confirmed working
   live (Hub Cloud Storage shows correct file counts; curl tests pass). `/listall/` is
   reachable but its prefix logic could NOT be verified — `_r2cleanup.scan()` still
   reported "1 object" after the user's latest deploy. Either the deploy didn't take
   the `/listall` fix, or `/listall` has a deeper issue. **S131 must verify `/listall`
   against the live bucket before trusting any cleanup tooling.**

4. **`arencon-ai-worker.js` still needs CF dashboard deploy** — enables AI auto-grouping.

---

## What shipped this session (chronological)

| Commit | Title |
|---|---|
| `0aa5db114d` | 5.3 — parseLarge in syncWorker (off-thread pull JSON.parse) |
| `0d14b1cd28` | 5.1 — UploadQueue: concurrency cap + lane FIFO + transient retry |
| `e9b7d532f2` | 5.4 — Image compression in OffscreenCanvas worker (Android-only waiver) |
| `b4dfa8f413` | 4.2 — CI workflow_dispatch input to regenerate visual baselines |
| `a9431bf29c` | 1.3 tooling — Auth._diag + preflight.js boot diagnostic |
| `0e597d9e04` | AI auto-grouping (initial, defic-level) + Hub site-photos bug fix |
| `826d5ca01e` | Hub photo UX — single click opens lightbox, hover-only checkbox |
| `2005680492` | AI grouping refactor → per-OBSERVATION + fixed catalog + classifier worker |
| `f62003a78c` | Proposal A — jump-to-pin from Hub photo lightbox |
| `7be6cf2e6e` | HOTFIX — restore `_queueRunning` var in r2.js (boot crash on new projects) |
| `2f9445184a` | Seed new FRT report's Project Info from Hub URL params (pn/pname/client/addr) |
| `f24c746ce4` | Markup deletions 412 loop — worker If-Match passthrough + client unconditional fallback |
| `bbcf35471f` | Markup load priority — IDB first, R2 fallback (fixes "two opens to show" bug) |
| `ad6fca215d` | Hub R2 path — list/resolve by UUID not slug **(see ⚠️ — partially wrong, see below)** |
| `a9e49c20b9` | Worker /list/ prefix + markup render race **(see ⚠️ — /list/ part was wrong)** |
| `2c43904e6b` | **REVERT** the bad R2 path "fixes" — match the real bucket layout |

---

## Features completed

- **5.1 / 5.3 / 5.4 / 4.2** deferred infra items — all closed.
- **1.3 tooling** — `Auth._diag` + `frt/js/diag/preflight.js`. **Actual tablet
  verification still PENDING** (needs physical tablet + 1h token-expiry wait).
- **AI auto-grouping (#1)** — per-observation grouping. `obs.aiGroup` field. Worker
  `auto_group` mode is a CLASSIFIER constrained to `proj.groupCatalog` (defaults to 8
  standard FP report sections; user-editable per-project via catalog editor). One pin
  can have observations in different report sections. Migration: legacy `defic.aiGroup`
  → `obs.aiGroup` on load. **Worker needs CF deploy to function.**
- **Proposal A — jump-to-pin** — Hub photo lightbox "📍 Open in FRT" button →
  `frt/index.html?project=&instance=&pinFocus=<deficId>&from=hub` → FRT focuses the pin
  via existing `_frtNavigateToPin`. Photo records carry `deficId/obsIdx/instanceId/projectId`.
- **Hub photo UX** — single click opens lightbox, hover-only checkbox.

## Bugs fixed (all from user screenshots — most were S129/S130 collateral)

1. **`_queueRunning` boot crash** (`7be6cf2e6e`) — S130 commit `0d14b1cd28` deleted the
   `var _queueRunning` declaration but `processPendingUploads()` still referenced it.
   New projects froze on boot with a ReferenceError. `node --check` doesn't catch
   runtime ReferenceErrors. Restored the declaration.
2. **Blank new report** (`2f9445184a`) — FRT never read the Hub's `pn/pname/client/addr`
   URL params. New reports opened blank even though the Hub knew the project info. FRT
   now seeds those 4 fields on boot, but ONLY when the instance is genuinely fresh (all
   4 core fields empty) — never overwrites existing data.
3. **Markup deletions 412 loop** (`f24c746ce4`) — worker stripped quotes off the
   `If-Match` header before R2's `onlyIf.etagMatches`, which expects the quoted strong-
   etag form. Every conditional markup PUT 412'd forever; deletions saved to IDB as
   tombstones but never reached R2. Fix: pass If-Match unmodified. Client safety net:
   unconditional last-resort PUT after the conditional retries are exhausted (works
   without worker deploy — for a lone inspector, guarantees the write persists).
4. **Markup "two opens to show correct state"** (`bbcf35471f`) — `_loadMarkup` checked
   R2 (cloud) first. After an edit, IDB has the newest state immediately but the R2
   upload lags seconds. A fast back-then-reopen fetched the stale R2 copy. Fix: check
   IDB first (local source of truth), R2 only as cross-device fallback. New
   `_loadMarkupFromR2` function; R2 path mirrors into IDB so subsequent loads stay
   local-first. **Confirmed working** — console shows "Loaded ... from IDB".

## The R2 path-scheme mistake — full account (important for S131)

This is the messiest part of the session and S131 must understand it.

**What went wrong:** trusted a code comment. The worker's `listPathToR2Prefix` had a
comment claiming the transposed prefix `{folder}/photos/{tool}/{type}/` was "the bug"
and that a fix to `photos/{folder}/...` was correct. Believed it, and ALSO changed the
Hub client to match. Both were wrong. Commits `ad6fca215d` + `a9e49c20b9` shipped the
mistake.

**Ground truth (from live R2 `/debug`):** the ACTUAL stored key layout is
`{folder}/photos/frt/{type}/...` — "photos" in the MIDDLE — exactly what the worker's
`urlPathToR2Key` produces. That transposition function was always correct and was never
touched.

**The revert (`2c43904e6b`):**
- `listPathToR2Prefix` → back to `{folder}/photos/{tool}/{type}/` (verified matches real keys)
- `listall` prefix → back to `{pid}/` (not `photos/{pid}/`)
- Hub `_pgResolveR2Src` — logic kept (prefixing worker origin onto `r2Key` URL-shape IS
  correct; the worker GET transposes internally); only the misleading comment fixed
- Hub `r2RefreshStatus` — `r2Folder = projId` (UUID) kept (current FRT passes the UUID);
  added a slug-folder fallback for legacy projects stored under a number+name slug

**Lesson:** a code comment is NOT evidence. Verify against the live system (`/debug`
endpoint) before trusting any claim about a bug. This cost most of an evening.

**Still unresolved:** the markup-vs-drawings folder-ID inconsistency. Observed: a real
drawing's markup was stored at `proj_1778765899037_2_x6glvpq0/photos/frt/markup/...`
while the drawings for the SAME project are under `69ff8895-<uuid>/photos/frt/drawings/`.
Markup saves and drawing saves are using different project-folder identifiers. This is
why `_r2cleanup` false-flagged real markup as an orphan. **Not data loss** — IDB-first
load means markup still works regardless of R2 folder name — but it IS a real bug and a
genuine investigation item for S131.

## Killed permanently (do not propose again)

- **5.2** — IDB writes in worker. Footgun: no cross-thread transaction isolation, zero
  UX gain.
- **Deficiency templates / quick-add** — Mark excluded this explicitly on 2026-05-14.
  Do not propose again.

---

## Proposal B — ordering decision STILL PENDING

A standalone interactive demo was built and shared (`grouping_ordering_demo.html`) showing
3 ordering models for observations within a report section:
- **A** — pin-number order only (no new field, ~0 effort)
- **B** — full hand-ordering, every obs draggable (`obs.groupOrder` int, ~1.5 sessions)
- **C** — pin default + drag override (`obs.groupPin` null-or-int, ~1 session) — Claude's pick

**Mark has not yet chosen.** This gates the Proposal B data model. The last
`ask_user_input` widget asked for the choice; awaiting the answer at session end.

Claude's other Proposal-B-adjacent recommendations (not yet decided):
- **Company-level default group catalog** — configure ARENCON's standard sections once
  instead of trimming the 8 defaults on every project. ~0.5 session. Highest friction payoff.
- **AI confidence flags** — worker returns high/med/low per item; modal highlights the
  uncertain ones. ~0.5 session.
- **Catalog order = report section order** — free, just a rule.
- **Multi-select bulk group-assign** — pairs with drag-drop for the no-AI manual path.

---

## S131 PLAN (locked by Mark's directive + this session's findings)

0. **🔴 PRIORITY #1 — FIELD TABLET ZOOM CRASH.** See
   `S131_PRIORITY_1_TABLET_ZOOM_CRASH.md`. The app failed in the field — non-negotiable
   first task of S131, ahead of everything else including the audit. Three-tier device
   memory budget (phone/tablet/desktop), extracted into one shared helper. MUST be
   validated on the team's actual tablets, not a dev check.

1. **Dead-code / unwired-feature audit.** Mark's directive — second task, after the
   tablet crash is fixed. This session produced 5 bugs that were all collateral from
   prior changes or stale leftover code (the abandoned-looking-but-actually-live slug
   scheme, the deleted `_queueRunning` var, the markup folder-ID split). Walk every FRT
   module: find unused functions, dead branches, features with UI but no backing.
   **Audit checklist MUST include:** grep every variable referenced in S130-touched
   files and confirm each has a declaration (`node --check` does not catch runtime
   ReferenceErrors — that's how `_queueRunning` shipped broken). Also: the markup memory
   budget is duplicated in 2-3 places in markup.js — exactly the kind of drift-prone
   cruft this audit targets; the priority-1 fix already calls for extracting it.
2. **R2 path scheme — proper investigation.** Verify `/listall` against the live bucket.
   Fix the markup-vs-drawings folder-ID inconsistency. Only AFTER that, make `_r2cleanup`
   trustworthy (fix the orphan classifier's false positives). Do NOT delete any R2
   objects until the tool is proven correct against `/debug` ground truth. The genuine
   orphans (an 8:36am team drawing ~1.85MB, a 6KB failed-markup-export "download" file)
   are harmless and can wait.
3. **Proposal B remainder** — once Mark picks the ordering model: grouped-view tab,
   drag-drop reorder, PDF section headers using `obs.aiGroup`.
4. **1.3 tablet pre-flight verification** — needs Mark's physical tablet + 1h token wait.
5. **Unified Hub smart bulk-backup** — per-project `lastDownloadedAt` tracking,
   "Download Changed" / "Download All", status badges, ZIP with manifest. ~1.5 sessions.
6. Company-level default catalog; AI confidence flags; multi-select bulk group-assign.

---

## FRT TIER LIST — features to build later, ranked by ARENCON workflow value

Mark wants this in the handoff for future sessions. Pick one or two per session.

### Tier 1 — real time-savers
| | Feature | Effort | Why |
|---|---|---|---|
| T1.1 | Voice-to-text for observation notes | ~1 session | Web Speech API on Android Chrome. Typing on a tablet under a sprinkler head is slow. Free, no API cost. |
| T1.2 | Photo annotation overlay (arrows, circles, callouts) | ~1-2 sessions | Annotate directly on the evidence photo instead of describing "see upper right" in text. |
| T1.3 | Recheck date / reminder on a deficiency | ~0.5 session | "Re-inspect by [date]" → Hub dashboard surfaces what's due. |

**EXCLUDED by Mark — do NOT propose:** deficiency templates / quick-add.

### Tier 2 — quality of life
| | Feature | Effort |
|---|---|---|
| T2.1 | Saved filter presets | ~0.5 session |
| T2.2 | Multi-mode PDF export (Executive 1-pager / Detail full / Contractor-only) | ~1 session |
| T2.3 | DRAFT watermark on PDFs in review state | ~0.3 session |
| T2.4 | Cross-project search (find any project mentioning text) | ~0.5 session |

### Tier 3 — useful but not urgent
| | Feature | Effort |
|---|---|---|
| T3.1 | Auto-numbering by area/floor instead of pure sequence | ~0.5 session |
| T3.2 | Inspector handoff notes (mid-stream takeover) | ~0.5 session |
| T3.3 | Excel export for external tracking spreadsheets | ~0.5 session |
| T3.4 | QR code per drawing for direct pin lookup | ~1 session |

---

## Worker deploy checklist (Mark action — do when team is OFF site)

Two workers need Cloudflare dashboard deploys. Neither is auto-deployed from the repo.

1. **`arencon-r2-worker.js`** — contains: `/list/` prefix fix (confirmed working live),
   `/listall/` prefix fix (NOT yet verified live), If-Match passthrough. The verified
   file md5 is `4ea185e93f18fc8a79891da7fe47e9d4`, 485 lines. Deploy: CF dashboard →
   Workers → `arencon-r2-worker` → Edit Code → select ALL → paste → Deploy → wait for
   "Deployment successful". Then re-run `_r2cleanup.scan()` — it MUST report ~200
   objects, not 1. If still 1, the deploy didn't take.
2. **`arencon-ai-worker.js`** — enables AI auto-grouping `auto_group` mode. Same deploy
   procedure.

---

## Critical rules carried forward

- **One `ask_user_input` widget per turn, max 1 question.** Non-negotiable.
- **Bump SW cache** on every JS/CSS push. This session: v367 → v382 (15 bumps).
- **`node --check` only catches syntax errors, not runtime ReferenceErrors.** The
  `_queueRunning` crash shipped because of this. S131 audit must grep for
  referenced-but-undeclared vars in changed files.
- **A code comment is not evidence.** Verify against the live system (`/debug`) before
  trusting any claim about a bug. Cost most of this session's evening.
- **Worker files at repo root are NOT auto-deployed.** Always tell Mark when a worker
  change ships and confirm the deploy took (test the live endpoint).
- **Re-clone the working repo and verify HEAD before editing.** Claude's clone went
  stale multiple times this session, causing edits on a stale base.
- **IDB is the local source of truth, always ≥ R2 on a single device.** This is why the
  markup load-priority fix is IDB-first.
- **Never claim work is done before verifying it.**

---

## Net state

```
HEAD              2c43904e6b
SW                arencon-frt-v382
CSS               ?v=297 (unchanged)
Unit tests        91 passing (was 60 at session start, +31 net)
CI                3 jobs green
Open PRs          none
Workers deployed  arencon-r2-worker: PARTIAL (/list/ works, /listall/ unverified)
                  arencon-ai-worker: NOT deployed
S130 closed       5.1, 5.3, 5.4, 4.2, 1.3-tooling, AI grouping (#1), Proposal A,
                  Hub photo UX, + 4 production bug fixes
S130 killed       5.2 (footgun), deficiency templates (Mark excluded)
S130 unresolved   R2 path scheme (markup vs drawings folder-ID split), _r2cleanup
                  reliability, /listall live verification
Pending decision  Proposal B ordering model (A/B/C) — Mark to choose
S131 first task   🔴 FIELD TABLET ZOOM CRASH (priority #1) — then dead-code audit
```

— End of HANDOFF_SESSION_130.md
