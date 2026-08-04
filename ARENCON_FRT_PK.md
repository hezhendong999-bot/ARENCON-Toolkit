# ARENCON FRT — Project Knowledge (CANON)

**Rebuilt 04 Aug 2026 (Lane A) after `ARENCON_FRT_PK.md` was lost from project knowledge in the
S611 cleanup. Repaired the same night** when `docs/ARENCON_FRT_PK.md` — genuine committed FRT canon
covering S25→S492 — was found in the repo.

---

## ⚠ PROVENANCE — what each part of this file is, and how much to trust it

| Part | Source | Confidence |
|---|---|---|
| **PART 1** (canon → S216) | `ARENCON_Project_Knowledge.md`, repo root — permanently in git | **Verbatim.** |
| **PART 2** (S25 → S492) | **`docs/ARENCON_FRT_PK.md`, committed S492 — genuine FRT canon, NOT a reconstruction.** Copied verbatim, not paraphrased. | **Verbatim — highest.** |
| **PART 2B** (S493 → S545) | **THE REMAINING HOLE.** See its own section. | **Incomplete — read the warning there.** |
| **PART 3** (S546 → S615) | Surviving PK deltas, surviving Lane A handoffs, and the commit lineage | High. |
| **PART 4 / PART 5** | Current open queue and standing process, verified at live HEAD | High. |
| **PROVENANCE ARCHIVE** | `ARENCON_Project_Knowledge.md` recovered history S25→S154 | Verbatim. |

**Precedence:** PART 2 is later and FRT-specific, so **where PART 1 and PART 2 disagree, PART 2
wins.** Within PART 2, its own internal convention applies — a later PART supersedes an earlier one,
and its `PART S492 — STATE CORRECTION` section supersedes everything above it in that file.
PART 3 supersedes PART 2 where they touch the same subject.

**PART 2 retains its own title line and internal headings exactly as committed.** That is
deliberate: it is a verbatim copy, and editing it to fit this file's numbering would destroy the
guarantee that makes it trustworthy.

### THE REMAINING HOLE IS S493 → S545 — and only that

The original PK's coverage of **S493 → S545** existed only in the lost file. Everything earlier is
now verbatim canon again. **For that window, prefer the git commit messages over this file** — they
are permanent, written as documentation, and cover it densely (63 sessions, S500 → S545, every one
present on `main`). See PART 2B for the specific committed sources that cover it.

### RULE GOING FORWARD

**The tool PKs live in the GitHub repo, not only in project knowledge.** Git is permanent and
versioned; a chat project is not a backup. This file is committed to the repo and the project copy
is a convenience mirror.

**And: a session's view of the project files is a snapshot, not evidence.** It can be stale or
partial. Before reporting canon as missing — or reconstructing, harvesting, or re-uploading
anything — confirm against the live listing. Two false alarms in one night came from trusting a
snapshot; the second nearly replaced an intact master with a reconstruction.

---

## CURRENT LIVE STATE (verified against GitHub HEAD, not prose)

| | |
|---|---|
| HEAD at this reconcile | `513fff2d` |
| `FRT_BUILD` | **`S613`** |
| `frt.css` | `?v=730` |
| Root SW `CACHE_NAME` | `arencon-frt-202608040456` (UTC-minute scheme; read live before bumping) |
| FRT offline cache namespace | **`arencon-fieldreview-`** — the root shell worker owns `arencon-frt-` |
| Repo / branch | `hezhendong999-bot/ARENCON-Toolkit` · `main` · GitHub Pages · `arencon.app` |

### Other FRT canon recovered in the repo (do not treat as missing)

`docs/ARENCON_DATA_INTEGRITY_DOCTRINE_S524.md` · `docs/LOCKED_SEAL_REDACTION.md` ·
`docs/LOCKED_SEAL_REDACTION_VISIBILITY.md` · `docs/ARENCON_FRT_PK_PART_S492.md` (already folded
into PART 2 below — verified identical, do not append it twice) ·
`ARENCON_Style_Guide.css` (repo copy stops at S143 + the S283 data-viz palette; **the true master
lives in project knowledge and is intact — do not regenerate the Style Guide from the repo copy**).

---

---

# ════════ PART 1 — CANON THROUGH S216 (VERBATIM from the repo file) ════════

*Source: `ARENCON_Project_Knowledge.md` at the repo root — permanently in git.*


## Company Profile

- **ARENCON Inc.** (www.arencon.com) — fire protection & building-code consulting, Mississauga ON. Founded 1992. ~25 staff (≈18 technical). Real Ontario projects: fire protection inspections, pump commissioning, OBC compliance, IST. ULC-listed CAN/ULC-S1001; SAFFIRE Safety Consultants alliance member.
- **Address (use in all PDF headers):** 1551 Caterpillar Rd Suite 206, Mississauga ON L4X 2Z6.
- **Mark He** — Licensed Engineering Technologist (**L.E.T.** under PEO; also C.E.T., FPET). **Never** "P.Eng" or "fire protection engineer" — Mark is not an engineer of any kind. Builds the entire toolkit through Claude with no coding background.
- **Principals / key staff:** Leslie Sims (Founding Principal), Shaun Kelly (Principal), Alexander Yarmoluk (Principal), Mike Zukov (Principal), Matthew McDonald (FPET). Field inspectors include Leslie and Shaun.
- **Explain everything in plain language.** Lead with real-world impact (inspector data, field work, reports), not file names, function names, or implementation detail, unless Mark explicitly asks.

---

## What's Live — Architecture (FRT v2)

The flagship is **ARENCON FRT v2** — a modular ES6 **PWA** (~40 ES6 modules under `frt/js/`; NOT the old single-file v1, which is fully retired).
- **Repo:** `hezhendong999-bot/ARENCON-Toolkit`, branch `main`. **Live:** `…github.io/ARENCON-Toolkit/frt/`.
- **Auth + project data:** Supabase `xsemvinxsyphjiaqgywv.supabase.co`; table `tool_data` (column `data`); auth token in `localStorage` as `sb-access-token`. Email/password, @arencon.com only. Anon key is safe in the frontend; service_role / R2 keys never are.
- **Binaries:** Cloudflare R2 via Worker `arencon-r2-worker.hezhendong999.workers.dev`.
- **PDF tiles:** Azure Function `arencon-pdf-render` (FlexConsumption, Node 22, 4GB, 30-min timeout, Canada Central). Re-add CORS (`https://hezhendong999-bot.github.io`) after every deploy. Before debugging it, hit `/api/health` and check the `renderer` field. Azure HTTP gateway has a 230s timeout — relevant to long renders.
- **AI Writing Assistant:** Cloudflare Worker → Anthropic API (see AI Assistant section).
- **Local backup:** IndexedDB (permanent) + localStorage (fallback).
- **Future:** Azure post-M365 (Cosmos DB + Blob + Entra ID) — swap endpoints only.
- **Data split (CANON):** cloud owns structure; local **IndexedDB** owns binary data.
- **Sync cadence (current live model, S82+):** local-save debounce 5s; **heartbeat push every 15s** (`_cloudSyncInterval=15000`); **periodic pull every 30s** (`_cloudPullInterval=30000`) with a context-aware "remote update" banner; a header **last-sync indicator** re-renders relative time on a 30s interval (muted green <1min / amber 1–5min / red >5min). (Historical note: the S25 incident narrative references a single 60s heartbeat — that was the pre-S82 design; the split 15s-push / 30s-pull model superseded it.)

**Modes:** Hub mode (`?project=<uuid>`) = cloud save/load, cross-device sync, logo → Hub. Standalone (no params) = IDB/localStorage only, logo → index.html. `beforeunload` suppression in Hub mode keys off the URL param, not a flag.

**Toolkit deploy:** GitHub Pages, `main`. Mark picks up new versions with Ctrl+Shift+R — no manual upload. Stable filenames only (no version numbers in deployed filenames). A parallel Supabase **Training Center** workstream AND the **Diesel/Electric pump** workstream commit to `main` frequently — all pushes use the re-parent helper (live-HEAD parent, `force:false`) to absorb that drift.

**Live module state handle:** the FRT app object is **`window._frt`** (`_frt.Model`, `_frt.IDB`, `_frt.R2`, `_frt.SyncEngine`, `_frt.Auth`). There is **no bare global `Model`**. Current project = `_frt.Model.getProject()`; current-instance deficiencies = **`project.generalDeficiencies`** (fields: `num`, `pinX`/`pinY` normalized 0–1, `drawingId`, `observations[]`; each obs has `photoSelection`). `window._frtRec` is a recorder utility (not the data store); `window._frtDbgPeek` is the tile ring-buffer.

**Cross-module window hooks** (so the gallery `photos.js` and pin editor `viewer.js` can reach code in `deficiencies.js`):
- `window._frtBuildObsEditor(d, oi, ctrId, opts)` — the single shared observation editor (see below).
- `window._frtOpenPinPhotoPicker(deficId, obsIdx, photoId)` — the pin-to-pin photo mover (S216; exposed so the gallery can reuse it for defic photos).
- `window._frtOpenPinFocus(deficId)` — open the focused-pin modal (Editor C).
- `window._frtRenderDefic()` / `window._frtRenderPhotos()` — re-render the Deficiencies tab / gallery.
- `window._frtRefreshPinEditor` / `_frtPinEditorAddedObs` / `_frtPinEditorRemovedObs` / `_frtClosePinEditorIf` — guarded pin-editor repaint hooks in viewer.js, called by deficiencies.js handlers.

**SW precache discipline:** `sw.js` (repo-root; `frt/sw.js` is a 404 stub) uses atomic `addAll` — one 404 → the entire SW install fails → devices stop updating. When a module is added/deleted, update ALL of: the file, its `index.html` `<script>`/import, AND the `sw.js` precache entry. The `?v=N` on the classic scripts (webglMarkup, pinsGL, dimensionTool, diag/*) is manual too. Bump SW `CACHE_NAME` + CSS `?v=` together on every commit that changes JS or CSS. SW strategy: network-first for HTML, cache-first for static assets. **FRT must be opened once on Wi-Fi after a deploy to prime the SW cache; after that, offline works.**

---

## PWA / Android TWA / Cross-Tool Infrastructure

**PWA:** `manifest.json` + repo-root `sw.js`. Icons `arencon-icon-192.png` / `arencon-icon-512.png` (hyphenated filenames, burgundy triangle on dark slate). Hub is the start URL. Each tool has a QR button in the header (Hub mode only, lazy qrcodejs) showing the current tool URL with all project params; the Hub has a QR button for sharing the Hub URL.

**Android TWA (S36):** package `com.arencon.projecthub`, built via PWABuilder — a thin Android shell loading the live GitHub Pages URL, no browser UI. **TWA users cannot edit URLs — never suggest URL-param activation as a user-facing path; diagnostics via in-app gestures/settings/buttons only.** Android classifies IDB as "app data" (never silently evicted, unlike browser "website data").
- **Digital Asset Links:** `assetlinks.json` must live at the root domain (`hezhendong999-bot.github.io/.well-known/assetlinks.json`), NOT in the project subdirectory. **Two repos coexist:** `ARENCON-Toolkit` (the tools) + `hezhendong999-bot.github.io` (root domain, asset links only).
- **Keystore:** `signing.keystore` + `signing-key-info` backed up on Mark's computer — required for APK updates.
- **Updates:** HTML deploys to Pages as usual and the TWA loads the live URL; APK rebuild is only needed for app name/icon/package changes. Distribution: APK sideload (email/USB/Drive); future Microsoft Intune when M365 is ready.
- **Android "Clear Cache" vs "Clear Data":** Cache = temp files, IDB survives. Data = nuclear wipe, re-login from cloud.

**Smart filenames (Hub-canonical, S33/S37):** `buildSmartFilename` lives in the Hub and is passed to tools via the `&sfn=` URL param (tools use the Hub prefix + local revision). Format: `{ProjNo} {ClientAbbrev} {StreetNum} {Street} {Building max 3 words} {ScopeAbbrev} {Rev}` (scope abbreviations e.g. Sprinkler→Sprkl, Fire Alarm→FA, Standpipe→Stdp, Commissioning→Comm; strip "Automatic"/"System" from the building name). A PDF export's `<title>` must use the smart filename + tool report name + instance number (if >1) + revision — the browser uses `<title>` as the default "Save as PDF" filename.

**Shared cross-tool keys & behaviors:**
- **Dark mode:** all tools and the Hub use `localStorage 'ARENCON_Dark'` (value `'1'` = dark). Never use tool-specific keys.
- **Sign-out anti-auto-login:** `doLogout()` sets `sessionStorage.ARENCON_signed_out='1'`; `tryRestoreSession()` checks it first and shows login without restoring; flag cleared on successful manual login, and `sessionStorage` clears when the tab/browser closes.
- **Session lock (FRT, current):** idle-based (not wall-clock) — 4h idle → PIN lock, 8h idle → full sign-out. A user working 12 straight hours is never logged out. (PIN users: 4h soft pin-lock + 8h hard sign-out; no-PIN users: 4h full sign-out — the S154 fix that stopped no-PIN users staying logged in indefinitely.)

**Hub (project management dashboard, Supabase auth):** three-tier board (📌 Pinned > ⭐ Starred > All), shared pinning + personal starring, soft-delete + trash, bulk actions, multiple sort modes; per-project detail with tool toggles, report instances, activity feed, cloud-storage panel (file counts + MB per type), status badges (Draft/Review/Issued). Custom inline-SVG tool icons + short names on cards.

**AVAILABLE_TOOLS keys** (Hub ↔ tool routing):

| Key | File | Short | Icon colour |
|---|---|---|---|
| `frt` | `ARENCON_Field_Review_Tool.html` | FRT | `#9C2742` |
| `diesel` | `ARENCON_Diesel_Fire_Pump_Commissioning.html` | DFP | `#E65100` |
| `electric` | `ARENCON_Electric_Fire_Pump_Commissioning.html` | EFP | `#1565C0` |
| `ist` | `ARENCON_IST_S1001.html` | IST | `#C62828` |
| `obc` | `ARENCON_OBC_Report_Generator.html` | OBC | `#2E7D32` |
| `dd` | `ARENCON_DD_Checklist.html` | DD | `#5E35B1` |

(Tool-card icon colours are the only place these saturated hexes are sanctioned — they are status/identity tokens, not UI fills.)

---

## Cloudflare R2 Storage

**Worker routes / auth:** `PUT` and `DELETE` on `/photos/...` require auth. `GET /photos/...`, `GET /list/...`, `GET /health` require **none**.

**⚠️ R2 auth — PERMANENT RULE:** GET requires no Bearer token (tokens expire → images break). Security is via private bucket + unguessable filenames. Never add token checks to GET routes. `_loadR2OrDirect(src, img)` is a plain `fetch(src)` — no auth headers.

**The asymmetry that caused 4380.24:** R2 uploads can succeed (200 OK) even while Supabase pushes silently fail (expired token). Uploads looked successful while metadata never persisted. This asymmetry is permanent — design around it.

**Key formats:**

| | Format |
|---|---|
| Stored `r2Key` | `photos/{pid}/frt/{type}/{fname}` |
| R2 bucket key | `{pid}/photos/frt/{type}/{fname}` |
| Worker list path | `/list/{pid}/frt/{type}/` (no `/photos/` in the list path) |
| Tile path | `{pid}/tiles/{drawingId}/L{level}/{col}_{row}.webp` |

Valid types: `original` · `marked` · `drawings` · `markup`. Filename prefixes: `site_`, `defic_`, `mkup_`, `dwg_`. Photo filenames encode the deficiency UUID (`defic_<uuid>.jpg`) — the **recovery oracle**: even if cloud loses metadata, blobs are identifiable and re-attach via `r2Key` lookup. **Photo blobs never need re-uploading.** Canonical R2 project id = the Hub `?project=` UUID; `proj.id` is standalone-only and is never part of an R2 key (S132).

**IDB is permanent backup.** `delete rec.dataUrl` only inside the `_collectFullState()` deep copy — never on live records. Orphan cleanup is **always event-driven and user-initiated** (the 🧹 R2 Cleanup button in the FRT header, Hub mode; scans both UUID and slug paths) — never timer-driven, never before IDB loads, never auto-run.

**Worker `Cache-Control` (open follow-up):** the Worker currently serves mutable markup JSON with a long cache, which produced the Bug B 412 storm. The S205 client fix cache-busts the markup GET; the deeper fix is to stop long-caching mutable JSON at the Worker (Mark's Cloudflare deploy).

---

## Data Integrity (the Session 25 + 4380.24 lineage)

Two incidents shaped every sync rule.

**S25 (2026-03-18):** Mark drove 700 km to a Windsor site, used FRT with no cell signal, took 60 photos through the FRT camera (saved to IDB, queued for R2). R2 uploads completed on Wi-Fi return (all 60 made it). Then CloudSync pulled empty/wrong cloud state and overwrote local IDB — photos vanished from FRT despite existing on R2. 6-hour live-debug recovery. Root causes: `DB_VER` mismatch (code v3 / device v4); `_cloudLoad` ordered by `instance_number.desc` (picked an empty duplicate row); no `length>0` guards; `_collectFullState` had no empty-push safety; the 60s heartbeat overwrote local with stale cloud; `r2Url` not rebuilt from `r2Key`; orphan cleanup could delete files on corrupted metadata.

**4380.24 / S155:** silent metadata-push failure while R2 succeeded (the R2/Supabase asymmetry above). Caused pin/photo loss that looked like success.

**Sync guards (current build):** `DB_VER:4` (never go backwards); `_cloudLoad` orders by `updated_at.desc` (never `instance_number`); `length>0` guards on drawings/contractors/deficiencies in initial sync and heartbeat; `_collectFullState` safety block (refuse empty push when local has data); upload on any connection (`wifiOnly:false`); blob preserved during metadata saves; `_rebuildMissingR2Urls(proj)` rebuilds `r2Url` from `r2Key` after every cloud merge and project enter; outbox + reconcile (Fix A, S173) makes the 4380.24-class loss mechanically impossible.

**Recovery pattern (photos gone but R2 has files):** stop heartbeat → `curl WORKER/list/{pid}/frt/original/` → rebuild the photos array → set each `r2Url = WORKER + '/' + r2Key` → `IDB.saveFullProject(p)` → reset the dedup (`_lastSavedJson=''`) → build clean stripped state → push → restart sync.

**⛔ Absolute rules — no exceptions:**
- Never auto-delete R2 files.
- Never overwrite a non-empty local array with an empty cloud array (check `length>0`).
- Never push to cloud without verifying it has data (`_collectFullState` safety block — never remove it).
- Never set "local is always source of truth" (broke mobile sync for months) — cross-device sync is last-write-wins via `_cloudSyncedAt`.
- Never deploy to production without testing sync on a real project first.
- Never let an inspector take a build to the field without verifying offline works.
- R2 is the last line of defense — if IDB and Supabase both lose data, R2 survives.
- Photos taken through the FRT camera do NOT save to the device camera roll — if IDB + R2 both fail, they are gone; advise native camera for critical shots.

**IDB transaction rule (ALL tools, learned via the Diesel R2Outbox build S210):** create the transaction and issue the request in the SAME tick; resolve on `tx.oncomplete`. Splitting create→request across a `.then()` lets the tx auto-commit and the write silently fails — strict on iOS Safari. Latent-bug pattern to watch for everywhere.

**Blank-project load race (`sync.js`) — ACCEPTED RISK, deliberate (post-S148, Mark-confirmed). NOT a bug to fix.** On open the tablet shows local IDB first, then the cloud master lands and `pull()` does an unconditional `Model.setProject(cloud)`; an unpushed edit made in that gap could be silently overwritten (no conflict modal — `merge3` only runs on the push-412 path). Why it's accepted not fixed: (1) the pure no-signal field case self-protects (pull never completes → local kept); the only residual is the narrow flaky-signal case; (2) three guards already mitigate — S129 ordering (`pull()` gated behind `fastPathDone`), S132 `_isBlankSnapshot`, S126 empty-array guard; (3) no reported real loss across many sessions; (4) `sync.js` is the single highest-blast-radius file — a wrong change there loses *more* than the bug. Revisit only with real field evidence, in a dedicated session, before any code change. Do not "fix" this on sight.

**Behavioral commitments (CANON, from the S155 pattern-of-failures conversation):**
1. Default to **fewer** commits per session, not more.
2. **No** commits to the sync engine, merge engine, IDB save path, or upload pipeline without Mark actively watching when next in the field.
3. Stop calling sync-engine commits "scope-minimal" — they never are.
4. Honor any hard rule Mark sets.
5. Push back harder before shipping, especially before a field day.
6. "syntax OK" / "node --check passed" is **not** validation — it only catches typos.
7. Honest disagreement is welcomed; sycophancy is not. Never claim work done before it's done — that's a lie, not a mistake. Mistakes are acceptable; false confidence is not.

**Debugging discipline:** after 2 failed fix attempts, STOP guessing — read live state with browser-console diagnostics (`_frt.Model.getProject()`). Instrument, don't speculate. **"Moved on screen" ≠ "persisted to model"** — confirm the round-trip by reading live state. **DevTools desktop/phone-frame emulation cannot faithfully test touch** (it emits `type=mouse` pointer events); touch-only paths (pin drag, press-drag, hit-tests) must be verified on a real Android tablet.

---

## Photo Model (pool architecture)

- Each pin (deficiency) has a **photo pool** `defic.photos[]`. Each observation has `obs.photoSelection`: `null` = show the whole pool (default for legacy obs); an **Array** = a custom subset. **New observations are seeded `photoSelection:[]`** (start EMPTY, not the whole pool — `null` read as photo duplication; fixed in `model.js addObservation`, S209).
- **Pool-aware access is mandatory** across all UI: render and lightbox read `Model.getEffectivePhotos(defic, obsIdx)`, never `obs.photos[]` directly.
- Pin coordinates `pinX`/`pinY` are **normalized fractions (0–1)**, not pixels.
- **Move/Copy between pins shares the binary** — same `r2Key`, new per-pool id, no R2 re-upload, no URL copying (`Model.copyPhotoToPin` / `movePhotoToPin`). Deleting a pin **releases** its photos to Site (`proj.photos`) when no other pin references the `r2Key`; the binary is never deleted.
- **Photo assign rule:** always use `_createDeficPhotoFromSource()` — upload blob to R2 under the new defic's own key + save to IDB. Never copy URLs from source (cloud sync strips `dataUrl`; borrowed R2 URLs break). This is the 4380.24 rule.
- **Site→pin assignment is a NEW binary path** (site photos have no source pin). Must mint a new pool binary via a `_createDeficPhotoFromSource`-style create — never copy the URL. ⚠️ The existing bulk "Assign to Pin" (`_doReassign` in `photos.js`) writes a moved photo into `obs.photos` rather than the pin pool; it works today only via the `getEffectivePhotos` legacy fallback (empty pool → reads `obs.photos`) and is misaligned with the pool model. Fix it properly before extending it (own session, field-verify).
- Empty-src photos must render a placeholder, never be silently skipped. Silent error handlers are forbidden in user-facing pipelines.
- **Markup propagates to all copies of a photo** — `_propagateMarkupToAllCopies(p, srcPh)` (S115): after a markup save or revert, sync `markupObjects`, `_markupCanvasW/H`, and `_origBackupId` from the source photo to every other photo object sharing the same id across `d.photos`, `d.entries[].photos`, `d.observations[].photos`, `d.activity[].photos`, `d.responses[].photos`. Without it, ghost markup survives in non-primary copies. Photo markup is non-destructive (original preserved via the backup id).
- Date parsing: never trust `new Date("YYYY-MM-DD")` (timezone shift) — parse explicitly.
- All blob-to-dataURL is **lazy** — never at startup or at `loadFullProject` time. A project opens in <1s regardless of size.

---

## Drawing Viewer & Rendering

- **Tile renderer:** Azure Function only (MuPDF → PAM RGBA → Sharp → WebP). **No byte-level manipulation in the render pipeline** — fix color/rendering in the renderer config or the viewer, never in bytes. 5 zoom levels L0–L4, 256px WebP tiles. Before debugging deployed tile rendering, hit `/api/health` and confirm the `renderer` field — don't edit dead code. Tile pyramid concurrency caps at `_MAX_TILES`≈800 / `_MAX_CONCURRENT`≈6; `LEVEL_WIDTHS=[256,1024,2560,6144,12288]`.
- **⚠️ Viewport-windowed level-canvas is ALREADY BUILT & LIVE (do NOT treat as unbuilt — S107-class dead-code trap).** The S132 `_computeWindow`/`_rewindowLevelCanvas` system in `frt/js/viewer/tiledPdf.js`, plus `frt/js/shared/deviceBudget.js` memory tiers (phone 8 MP / tablet 12 MP / desktop 30 MP), are in force. When an *old* drawing is blurry/laggy (e.g. 4380.24), the cause is **missing/never-rendered tiles** (live diag shows `render#0`, `tiles 0/800`) — a huge dense PDF that failed/timed out in the tile-maker at upload, so no pyramid exists. Fix = **regenerate tiles via the built-in migration tool, no viewer code change**. Do not "fix" the viewer for this.
- **Escape in the drawing viewer:** cancels the active tool / copy mode **only** — never closes the viewer.
- **Pin drag (touch):** long-press 500ms arms drag; tap a pin opens its editor; the long-press timer cancels only if the finger moves >8px. (Pin tool single-shot since S174.)
- **Lightbox:** the live overlay is `.lightbox-overlay`, z-index **10000** (above `#pinfocus-overlay` at 9998). On open it is re-parented to the last child of `<body>` to escape the pin-editor stacking context (S205b). iOS scroll-lock when a lightbox is open requires `body.position='fixed'; body.width='100%'` in addition to `overflow:hidden` (overflow alone doesn't stop iOS momentum scroll).
- **Highlighter:** offscreen layer composited once at reduced opacity (≈0.30–0.35 α) — never stack opacity across strokes. **No `OffscreenCanvas`** (no Safari/iOS support). Pen/highlight strokes use `lineTo` only — never `quadraticCurveTo`.
- **Auto-select after draw is DISABLED** — the tool stays active after placing a stroke.
- **Loading overlay:** NEVER replace `.main-wrap` innerHTML with a spinner — use a `position:fixed` overlay on `body`.
- **PDF upload handlers** use a recursive `go(pg)` pattern — never rewrite it. Drawing-name conflicts are never silently renamed — `_resolveDrawingNameConflict()` shows a 3-suggestion modal (used by image + PDF upload paths; the PDF path checks once before rendering so `go(pg)` is untouched).
- **Canvas buttons inside the drawing area** must use `ontouchend` + `event.stopPropagation()` + `event.preventDefault()` — the canvas `touchend` calls `preventDefault()` which blocks click events.
- **Mobile markup canvas cap:** capped (≈1536px mobile / larger desktop; photo-lightbox canvas ≈2048px mobile) to prevent Safari/WebKit crashes on large phone photos.
- Mobile/desktop viewer breakpoint: **900/901px**.

**⭐ The on-drawing pin shape lives in `pinsGL.js`, NOT `viewer.js _renderPins` (S213 key learning).** The pins the user sees are rendered by PinsGL (Pixi/canvas) via `pinsGL.js → _drawPinAtNative` (console confirms `[Viewer] WebGL pins ready`). The `.pin-marker` HTML/SVG block in `viewer.js _renderPins` is a **dead fallback** that does not run when WebGL pins are active. To match a rendered pin, read `pinsGL.js` — not the same-named fallback. The actual spec (`_drawPinAtNative`): solid teardrop, NO white outer border; white inner circle r=11 @ (16,14) α0.95; number 17/13/11px by digit count, weight 900, Calibri. `_priorityFillHex`: Site Record `#6B6FA8` · IAR `#E91E8C` · general `#5F8068` · low `#B07F5A` · high `#A85959`. Outstanding glow via `_buildFilterString`; closed → α0.5. Mini-map uses fixed `PW=20`. (The legacy `viewer.js`/PDF SVG-teardrop pin spec — outer white halo, `general→#1A7A4A` etc. — is the dead fallback; do not treat it as current.)

**Pin mini-map (interactive, `_PinPan` in viewer.js, S213):** the desktop pin-editor drawing panel (`#pe-location-thumb`) is interactive; the mobile thumb is static. `_drawPinMiniMap` routes on host id. Zoom floor = Fit (can't zoom out past fit); pan only when zoomed in. Dragging the pin repositions the real pin (writes normalized `d.pinX/d.pinY` + `saveNow()`) using a grab-offset on the tip. ⚠️ **Drag-to-move-pin is UNVERIFIED on a real tablet** (S213/S214 DevTools mouse-emulation was inconclusive); if broken it's a 4380.24-class silent-loss risk (pin reverts on reload). Owed check.

**WebGL pin positioning (S112b — sacred):** PinsGL reads `getBoundingClientRect()` from the drawing element. On tile drawings `dv-image` has empty `src` + `display:none` → 0×0 rect → early-return. Fix: when `TiledPdf.isActive()`, read `dv-img-wrap`'s rect instead of `img`.

**Diagnostics gated behind `?dbg=1` + 🔍 toggle:** `#dbg-overlay`, the recorder panel, `#arencon-frt-progress` (tile progress), `#arencon-frt-anomaly` (anomaly counter) are hidden by default, surfaced via the floating 🔍 button which toggles `body.diag-show`. The toggle only renders when debug mode is on (`?dbg=1` or `localStorage._frtDbg='1'`); `_frtDbgOff()` removes panels. Diag modules are the dormant field-debug toolkit — KEEP (do not treat as dead code).

---

## Deficiencies / Trade Board (current behavior)

### Views
- **Detailed (default)** and **Board** are the two views. **Table view was retired S216** (toggle shows 📋 Detailed · ▦ Board only).
- **Detailed view = the locked Deficiency List redesign (S209, shipped, field-verified — DO NOT RE-DEMO).** Layout = Option B: navy trade band (`#2A3A5C`) → contractor band (tinted via `getContractorColor`) → sorted rows; all three levels collapsible. **Row per OBSERVATION** (independent rows — 1A and 1B are separate rows, no grouping wrapper). Global sort: pin # (numeric, non-numeric last) then obs letter — NEVER out of order ("Pin #2 never after Pin #3", enforced by `_sortPins`). **Show-once:** a pin renders under ONE trade (tagged → contractor's first declared trade → Other), via `Model.derivePinTradeSingle`.
- **Collapsed Rich row:** star (rec) · PILL id badge (#N / #N+letter) in contractor accent · 54px first-photo thumb + count (left) · 2-line obs-text title · contractor colour DOT (no name — redundant under the band) · combined priority+status chip · caret. Tap → expand ONE editor at a time (`_openObsKey`).
- **Combined priority+status = ONE dropdown** (`obs-pristatus`), three states: Outstanding–High / Outstanding–Low / Closed. No "General." Chip/dropdown colours mirror the PDF report pills.
- **Recommendation control = the ★ star ONLY**, everywhere. No "Mark as recommendation" text button. Preserve the row-star `_recHoldUntilNav` mis-tap-undo.
- `_buildPinGroupCard` (deficiencies.js ~571) is the **Deficiencies-tab list-card renderer** (also serves the focused-pin modal). Protected — rewriting it in place blasts the whole tab. Step 5 convergence (retire its duplicate editor) is deferred.

### The unified observation editor (A / B / C)
One renderer, **`_buildObsEditor(d, oi, ctrId, opts)`** in `deficiencies.js`, exported as `window._frtBuildObsEditor`, used in three contexts. `opts.withHeader` (B/C only — A unaffected) adds the star + "Pin #N" header, observation tab strip (`[Obs A ✕][Obs B][＋ Add observation]`, inline ⋮ split), quiet auto-stamped "📅 Noted DATE · edit" line, Photos heading + grow-to-fill dashed drop box with 5-across scrolling grid + labeled Upload/Camera/Gallery, and a bottom-pinned action bar (`+ Response · + Comment · ⋯ More`). The editor root gets class `dfx-ed-mode` scoping all B/C layout overrides so A stays byte-identical.
- **A — Detailed card:** `opts.withHeader` absent → the collapsed-row design above. `_buildObsRow` wraps it.
- **B — On-drawing pin editor:** lives in **`viewer.js` `_openPinEditor` → `_peRenderUnifiedEditor`** into `#pe-obs-content` (state `_peObsIdx`, gated to `#pin-editor-overlay`). Renders `_frtBuildObsEditor(…, {withHeader:true, pinNum})` in the left column; the drawing panel + mini-map stay right (desktop) / below (mobile). **LIVE since S213.** ⚠️ B is in `frt/js/viewer/viewer.js` — there is no `frt/js/ui/viewer.js`, and B does **not** call `_buildPinGroupCard`.
- **C — Focused-pin modal:** `_openPinFocus → _buildPinFocusBody` (deficiencies.js, state `_pfObsIdx`, gated to `#pinfocus-overlay`). Passes `{withHeader:true}` with **no `onDrawingLink`** so its body equals B's; keeps its own modal chrome for navigation (View on drawing / Place pin). **LIVE since S214.** `_scopePinFocusObs` retired/inert.
- **The reserved `onDrawingLink` header slot exists but is unused** by both B and C (decision S214: navigation stays as C's modal chrome).
- **Save model: auto-save, NO Save button.** Persistence is through document-delegated handlers (`obs-text` 500ms debounce; `obs-contractor`/`obs-trade`/`obs-pristatus`/`toggle-rec` immediate). ✕ Close / Close flush the active textarea synchronously (`_peFlushUnifiedTextarea` → `Model.updateObservation`) before closing. Legacy `_savePinEditor`/`_pinAutoSaveFlush` are defined-but-inert (S137).
- **Convergence rule:** converge B/C by pointing them at `_buildObsEditor` via `withHeader`; never hand-edit the protected `_buildPinGroupCard`. The document-level `data-action` delegates handle the editor's markup wherever it's mounted, so B/C inherit A's persistence wiring with no re-binding.
- **Inline contractor create:** the shared contractor `<select>` (A/B/C) has a "+ New contractor…" option → `showPrompt` → `Model.addContractor` → assign (via `__new__` sentinel). Create-only; rename/delete stay on the roster / Trade Board.
- **Quiet observed date:** `obs.notedDate` auto-stamped on create (green `auto-stamped` flag), never overwritten; hand-edit via `dfx-ed-edit-noted` sets `notedDateEdited` and clears the flag. `_fmtNotedDate` parses explicitly. The report still carries the single final date; per-pin date covers multi-day reviews for legal tracking.
- **Auto-bullet (observation textarea):** typing `1 ` (digit + space) at the start of a line auto-converts to `1. ` (any digit count; `10 `→`10. `), implemented via `document.execCommand('insertText')` so native Ctrl+Z reverts it. Pattern check `/^\d+ $/` on the current line up to the caret.

### The shared photo-selection picker (`FrtPhotoPicker`, S215)
The "⊞ Choose / Manage photos" subset picker is a single shared ES module **`frt/js/ui/photoPicker.js`** (`FrtPhotoPicker`), called by both B (viewer.js) and C (deficiencies.js). Fully parameterized: `FrtPhotoPicker.open({ mount, deficId, obsIdx, onExit, toast? })` / `.exit()` / `.isActive()` / `.handleClick(e)`. No module-global current-defic/obs; class hooks (`.pp-*`) scoped inside the caller's mount so B (`#pe-obs-content`) and C (`#pf-obs-content`) never collide. Reuses existing `.pe-sel-*` CSS. Esc/backdrop/close in C exit the picker first (rebuild C), not the whole modal. Imports `showTypeToConfirm` from dialogs.js so the ≥5-photo destructive-delete guard fires. ⚠️ **DEPLOYED, NOT tablet-verified** — verify B+C: save a subset → reopen → stuck; on a 2+ obs pin, custom-select Obs A then switch to Obs B → independent (catches a parameterization bug); ≥5-photo delete shows type-to-confirm.

### Move/Copy ⤴ (photo to another pin)
The ⤴ control (`_openPinPhotoPicker(deficId, obsIdx, photoId)`, exposed as `window._frtOpenPinPhotoPicker`) is present on: Editor A (`_buildPinGroupCard`), B + C (via `_buildObsEditor`), and **the Photo Gallery's defic photos (S216)**. Gallery defic-photo cards carry a hover-revealed ⤴ in the bottom-left slot (touch-safe, hidden in select-mode) that resolves `photoIdx → photoId` via `getEffectivePhotos` and calls the shared mover. **Gallery site photos still have no ⤴** — that's the separate "site→pin new binary path" item (see Photo Model).

### Board view
- One board, three lanes stacked as rows: **Deficiencies → Recommendations → Site Records**. Classification is DERIVED per observation (per-obs rec flag → REC; else contractor present → DEFIC; else SITEREC), never a manual toggle. Each lane renders the 4-column board (High / Low / General / Closed). Lane banners: def navy, rec amber `#BC7327`, sr grey `#6B7280`.
- **Move mechanics, single mutation point `_bvApplyMove(id, oi, toLane, toPri)`:** lane move sets the rec/contractor flags; column move sets priority/closed. Desktop native HTML5 drag and the ↗-arm-then-tap-a-column path both funnel through it.
- **Board card interaction (S205c):** tap card body → open pin editor; tap photo → lightbox; ↗ → arm assign (then tap a contractor/trade or a column; auto-deactivates). On touch there is **no press-drag today** — lane/column moves use ↗-arm + tap. (Mark confirmed S216 the current touch behavior is good — do not add press-drag.)
- **Contractor assign on the board (S153, both kept):** (a) select a board card → tap the whole contractor card (`.crx-cc`); (b) arm a roster contractor → tap a board card. The `crx-addbtn` ⊕ was removed S153 (too small for thumbs) — the whole `.crx-cc` card is the tap target; the `crx-pick-start` handler is kept defined-but-inert (do NOT delete).
- **Trade-from-card is DECOUPLED (standing rule, S153):** tapping a roster trade pill with a board card selected sets ONLY that obs's trade (`Model.updateObsTrade`) and NEVER silently mutates `contractor.trades`; if the trade is new to that contractor, a confirm offers one-tap `addContractorToTrade`. Auto-coupling was explicitly rejected — it would let one fat-finger re-tag a contractor across the report.

### 🔒 BOARD REDESIGN — LOCKED S216 (Option A), build pending (own field-verify-gated session)
Mark approved the layout via `board_rail_demo.html`. Net design:
- **Remove the General priority entirely.** Columns become **High / Low / Closed** everywhere General appears (pin editor, board, PDF report filter). This is cross-cutting — pin editor, board, AND PDF report (General is currently *excluded* from the client report).
- **Migrate existing General pins → Site Records** (matches General's current "excluded from client report" meaning). One-time migration on the build.
- **Layout:** Deficiencies over Recommendations on the LEFT (3 columns each); **Site Records = ONE full-height rail on the RIGHT** — no priority, no contractor, no trade.
- **Drag a card sideways into the rail to archive it** (clears the contractor for that pin). Short horizontal move, no page scroll.
- **⇄ chooser on each card** for the rarer Deficiency ↔ Recommendation move (no long drag).
- Keep the existing touch behavior otherwise (tap-to-open, ↗-assign).
- Own session: bigger blast radius (pin editor + PDF report + pin migration), fewer-commits, field-verify-with-Mark-watching.

### Other board / deficiency facts
- **Contractor roster** renders in creation order. Unassigned cards glow amber in place (never reorder). Assigning a trade does not move a card; only deletion shifts the rest.
- **Contractor delete is non-destructive everywhere** — `deleteContractorAndReassign` moves the contractor's deficiencies → Site Records; no destructive splice path.
- **Observations:** per-obs delete ✕ on the editor tabs (hover on desktop, always-on under `@media(pointer:coarse)`; shown only when more than one obs exists — a pin keeps at least one). Row delete auto-routes: 2+ obs → `removeObservation`; last obs → `removeDeficiency`.
- **Deficiency Log** is a reporting rollup (not a triage surface), collapsed by default with a one-line summary (`N total · M outstanding · K closed`) + chevron, state persisted in localStorage.
- Trade derivation fallback (Trade Board, `derivePinTrade` singular): `obs[0].trade` → contractor's sole declared trade → none.
- **PDF pin status:** `Model.getEffectiveStatus(d)` is the single source of truth — both `_deficIsOpen`/`_deficIsClosed` derive from it; never read `d.status` directly. Returns `'closed'` iff ALL obs are `addressed` (falls back to `d.status` only when no obs exist). Keeps the open/closed partition clean so no pin is silently dropped.
- **Inspector attribution (S143):** per-obs `obs.createdBy`; on-screen `.obs-insp-chip` keyed by a deterministic hash into the contractor palette; unresolved/legacy `createdBy` renders a muted "?" chip (never silently hidden). The initials toggle lives in the **PDF/report export modal only** ("Internal review — show inspector initials", default off) — never a board control.

---

## PDF Export Standards

New window, paper-like preview (white 8.5×11" on `#525659`), paginated via JS bin-pack (`PAGE_H=912`, `CONT_H=85`). Export bar: `#2C4770` background, green Export, gray Close. Never inline / never raw HTML flow. Company address in every header. No timestamps on checklist Yes/No/NA buttons. The Export button + progress bar may use `#1A7A4A` green (print-preview chrome) — allowed, do not "fix" it. Appendix status cells: muted maroon `#A85959` (Outstanding), muted sage `#5F8068` (Closed). `@page` margin boxes carry running headers; named pages suppress them.

**PDF "Model 2" structure (S139–S145, current):** Trade→Contractor hierarchy with all primary header bands navy `#2A3A5C` (`.th-band`, `.st th`, `.sh`); taupe contractor sub-bands; burgundy `#9C2742` for accents only. Three disjoint sections — **Deficiencies** / pooled **Recommendations** (own grey `#6B7280` band, main-report card grammar) / **Site Records** (internal, excluded from external reports unless opted-in). The **Deficiency Summary** = deficiencies only (cols Summary/Total/New/Outstanding/Closed, no IAR column); a separate **Recommendation Summary** scoreboard counts each rec once (single-trade `_aByT` by design, so per-trade rows sum to Total); **Previously Closed Items** and a split **Previously Closed Recommendations** table. Deficiency-body pagination keeps each trade together where it fits a fresh page (S148 D1). Report title is overridable per project via `p.info.reportTitleOverride` (data, not code). PDF export entry point is `frt/js/export/exportview.js` (`initExportView.open()`) — all PDF buttons route there; role-grouped distribution (Owner/Contractors/Other, Site Records excluded). The PDF report pin matches the viewer pin path exactly via canvas `bezierCurveTo` (no `quadraticCurveTo`).

**⚠️ PDF performance bottleneck (known):** the paginator measures each block by injecting HTML and reading `offsetHeight`; with many photo cards the print dialog can show "Loading preview" for 10–30s on large reports. A real speedup would mean estimated heights instead of DOM measurement — scope for a future session if it becomes a recurring pain.

---

## AI Writing Assistant Architecture

- **Cloudflare Worker `arencon-ai-worker`** (`https://arencon-ai-worker.hezhendong999.workers.dev`): POST `{fields, context, mode}`; Bearer (Supabase JWT) auth; modes `rewrite` (Sonnet) / `quickfix` (Haiku); returns `{suggestions:[{id, improved, changes}], usage:{input_tokens, output_tokens, cost_usd}}`. Secrets (`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) encrypted in Cloudflare. Non-blocking usage logging to Supabase `ai_usage_log` via service_role.
- **Frontend `AIAssist`** (IIFE, same pattern as CloudSync/R2): `reviewAll(mode)` entry; accept/skip/accept-all panel actions; word-level LCS diff (green additions / red strikethrough). Writes back to the model and saves IDB + cloud per accept.
- **Frontend `AIUsage`** (admin only): billing-day from Supabase `app_settings`; period buttons; CSV + PDF export.
- The roadmap AI features (photo analysis, reusable cross-tool proxy) extend this same worker pattern; training tools bill to ARENCON's internal training project number.

---

## Permanent UI / Brand Rules

- **Font:** Calibri exclusively for all body text, UI, and PDF exports (never Outfit/Rajdhani). BlairMdITC TT (`Blaimim.ttf`) for the "ARENCON INC." wordmark only ("ARENCON" 9pt / "INC." 7pt), embedded as base64 `@font-face`.
- **Color:** burgundy `#9C2742` for primary CTAs only; navy `#1B2438`, dark slate `#2C4770` as structural accents; **muted palette throughout** (no bright saturated colors). Forbidden bright hexes in UI fills: `#C0392B #96281B #FDEDEC #FADBD8 #1A7A4A (except PDF print-preview chrome) #EAFAF1 #D4EDDA #E67E22 #3F6E9C`. Desaturated equivalents only (e.g. FRT `--red` `#A85959`, forest `#5F8068`). Recommendation amber `#BC7327` is a sanctioned muted exception. Contractor palette is a fixed status-reserved set.
- **Logo:** always from `logo_base64.txt` with the full `data:image/png;base64,` prefix, used directly in `img src`.
- **Photo zones:** drag-&-drop default + Upload button + Camera button (never click-only).
- **Cloudflare email** in template literals: always split as `${'mail'+'@'+'arencon.com'}`.
- **Hover-reveal controls** must include `@media(pointer:coarse)` for touch — never rely on `:hover` alone.
- **Leave dialog:** 3-button modal (green "Save & Leave" / "Leave without saving" / "Cancel"); never `confirm()`/`alert()`.
- **Modal buttons:** use the muted-button family from frt.css — `.btn-muted-ok` (green: Yes/OK/Save/Add/Confirm), `.btn-muted-cancel` (red: Cancel/No/Close/Back), `.btn-muted-warn` (orange: Revise), `.btn-muted-neutral` (slate: Revert/Leave-without-saving). **No inline button styling in modals.** **Cancel always on the right**, primary on the left. Every button class needs a dark-mode variant (nothing bright/saturated in dark mode). `_createModal` maps `color:'#1A7A4A'`→ok, `color:'#C0392B'`→cancel automatically.
- **Background operations:** subtle indicator changes, never toasts.
- **Index portal:** Mark describes changes → Claude hardcodes into `DEF_TOOLS`/`DEF_CATS` in `index.html` → Mark uploads (the Admin panel is not used for permanent changes).
- **Dead handlers** kept defined-but-inert rather than deleted (S137 discipline).
- **No AHJ/Municipality, Permit No., or Engineer-of-Record fields** in any tool.
- **No `JSON.stringify` inside `onclick`** — pass arrays/objects via `dataset`.
- **Warm-paper light theme** (`body:not(.dark-mode)` ~frt.css 5361: `--smoke:#F0EDE6` etc.) is intentional and app-wide. A grey-blue switch is an OPEN, undecided, app-wide cosmetic call — do not change piecemeal.
- **Real-Unicode-glyph rule (S150f):** use real Unicode glyphs in UI, not ad-hoc image/emoji substitutes where a glyph exists.

---

## Tool Inventory & Status

| Tool | File | Cloud |
|---|---|---|
| ARENCON FRT v2 (flagship) | `ARENCON_Field_Review_Tool.html` | ✅ CloudSync + R2 fully integrated (upload + offline prefetch) |
| Project Hub (Supabase auth, dashboard) | `ARENCON_Project_Hub.html` | ✅ |
| Diesel / Electric Fire Pump Commissioning | `ARENCON_Diesel_…` / `ARENCON_Electric_…` | ✅ CloudSync + R2Outbox + heartbeat + S25 empty-cloud guard (hardened S210). Photo gallery FRT-matched. UI migrating to the FRT muted-palette family; flow-test-as-cards approved (`flow_card_clean.html`). |
| IST S1001, OBC Report Generator, DD Checklist | `ARENCON_IST_S1001.html` / `…OBC_Report_Generator.html` / `…DD_Checklist.html` | ❌ no CloudSync yet (rollout pending) |
| Design Resource Planner (company scheduling/Gantt, admin) | `ARENCON_Design_Resource_Planner.html` | — |
| Intranet Portal · index.html (toolkit portal, CFG_VER 14) | `ARENCON_Intranet_Portal.html` / `index.html` | — |
| Supabase admin/cleanup | `ARENCON_Supabase_Admin.html` | — |

**Pump-tool cross-device note:** historically push-only (no heartbeat); the heartbeat + R2 prefetch were brought up to the FRT pattern through S210. CloudSync rollout to IST/OBC/DD remains pending.

---

## Open Queue (FRT forward items)

1. **Board redesign build (locked S216, Option A)** — remove General priority + migrate General pins to Site Records + the Defic/Rec-left / Site-Records-rail-right layout + ⇄ chooser. Own session; touches pin editor + PDF report + migration; field-verify with Mark watching.
2. **Gallery site→pin ⤴** — the new binary path (site photos have no source pin). Confirm intent; fix/replace the misaligned `_doReassign` pool write first; own session, on-device verify.
3. **Tablet-verify owed items** — S215 shared photo picker (B+C parameterization catch); S213 drag-to-move-pin round-trip (`_frt.Model.getProject()`); S214 C-convergence layout.
4. **Slice 1b step 5** — converge `_buildPinGroupCard`'s duplicate editor; migrate Active-tab/focused-pin onto the obs editor.
5. **Worker `Cache-Control` for mutable JSON** — Cloudflare deploy (not code here). Plus field-verify the S205 markup GET cache-bust + photo release-on-delete (Mark watching).
6. **Dead-CSS cleanup (deferred, needs Mark's explicit OK):** `.dfx-tbl*` (retired Table view), legacy `_openPDFPicker`, dead rec CSS (`.th-band.recs`/`.rec-sub`/`.rec-cap`/`.rec-ctrchip`). S137 dead-handler discipline holds until then.

## Standing Roadmap (no staging)

AI Writing Assistant extensions (Cloudflare Worker → Anthropic API: Haiku for polish, Sonnet for photo analysis; logs to Supabase `ai_usage_log`; company API account; reusable across tools). ARENCON Training Center / LMS. Calc-tool pipeline: Explosion Vent (NFPA 68), Sprinkler Obstruction Reference, Spatial Separation (OBC 3.2.3), Firefighting Water Supply, Travel Distance / Exit Capacity, FRR Quick Ref, Occupant Load, NFPA 25 / OFC IT&M checklists ×3, standalone Water Supply Curve. Standalone Photo Gallery PWA. Closeout Package Review tool (mockup approved). CloudSync rollout to IST / OBC / DD. M365 migration (Azure Static Web Apps, Entra ID SSO, Azure Blob, Cosmos DB) — strategically important, per-seat licensing already in place. Android Capacitor app (post-principal approval). **Principals deliverable = the live-tool PDF.**

OBC reference files (upload when needed): `120332_e.doc` (2012 OBC), `301881.pdf` (2024 Vol 1), `301880__1_.pdf` (2024 Vol 2), `301913v3.pdf` (2026 Ontario Fire Code Compendium).

**Phase-2 deletion/restore model (designed, with the M365/RLS work — not yet shipped):** soft-delete with admin-only restore + 90-day auto-purge + daily R2 backup, to satisfy Mark's "don't let staff permanently delete (fired/vindictive), but don't let trash pile up." Schema: `projects.deleted_at TIMESTAMPTZ NULL`; reads default-filter `WHERE deleted_at IS NULL`; delete sets `deleted_at=NOW()`. Two-tier: staff soft-delete (their projects move to a Trash they can't see); admins (Mark/Leslie/Shaun) see Trash and can Restore (`deleted_at=NULL`) or Permanently Delete (real `DELETE` + R2 cleanup). Three protection layers: (1) a 90-day auto-purge cron Worker; (2) a `deletion_log` audit table; (3) a daily R2 backup Worker dumping each project as JSON to `arencon-files/backups/YYYY-MM-DD/`. Pairs with the `softLock`-replacement presence model (a `project_presence` 30s ping + "👤 X editing now" header indicator instead of a lockout overlay).

---

## Session Discipline

Cold-start: read this canon (honor the ledger) → assert GitHub HEAD → compare the deployed code against HEAD (read via `raw.githubusercontent.com/.../main/...` or GitHub Pages — no token, no rate limit; note Pages CDN lags ~10 min, so use the API `?ref={sha}` for fresh post-push verification), download from GitHub if the uploaded copy differs → then work. **For files >1 MB use the Git Blobs API** (`/repos/{owner}/{repo}/git/blobs/{sha}`) — the Contents API silently truncates; fetch the tree recursively, build a `path → blob_sha` map, fetch blobs with base64 decode. **Verify "shipped" against live HEAD — handoffs can lie about pushes** (check SW `CACHE_NAME` + CSS `?v=` + a distinctive symbol against live code, not the handoff's prose; S208/S209/S212 each had "shipped" work that was lost or never pushed).

Surgical `str_replace` only, full reads before edits, per-slice bisectable commits pushed via the re-parent helper. **Concurrent-writer push contract** (Training-Center + Diesel write `main` continuously): GET ref → assert HEAD → byte-verify targets → POST blobs → POST tree (`base_tree=HEAD`) → POST commit (`parents=[HEAD]`) → PATCH ref `force:false` → post-verify each pushed blob SHA. On 409/422 re-read HEAD and retry from blob creation. Re-parent helper at `/home/claude/push.py` (or session equivalent). Never force-push, never direct-edit `main`.

`node --input-type=module --check < file.js` after every JS change (syntax only — NOT behavior validation); CSS brace-balance after every CSS change; bump SW `CACHE_NAME` + CSS `?v=` together.

**One `ask_user_input` widget per turn, one question** — always fill the question text, not just the options. Align on scope before any code change. No sync/merge/IDB/upload-pipeline commits without Mark present.

Deliverables only on Mark's explicit request: "give me a handoff" = handoff only; "full handoff" = handoff + PK delta + Style Guide delta (complete files, never additions snippets; Style Guide omitted if no CSS changed); "give me the canon pass" = full PK + Style Guide regenerated. If Mark references a past discussion you can't find in files, **search conversation history before saying it isn't documented** (S204/S206 lesson — the board-rail decision had to be recovered from chat because it was never written into a handoff).

**Demo-first for significant UI** — Mark iterates layout via standalone throwaway demos before any tool edit (Deficiency List redesign, flow-test cards, board rail all went this way).

**Security — PATs:** fine-grained PATs have been pasted into chat across many sessions plus the (dead, 401) project-instructions PAT. **Always rotate/revoke a chat-pasted token after use; never push with a stored token assumed live.** Mark supplies a fresh PAT per session. Without a PAT, read canonical source from public Pages / `raw.githubusercontent.com`. `service_role` / R2 keys NEVER in frontend code.

---

## APPENDIX — Durable key learnings

- **The stale-monolith trap:** a `…Field_Review_Tool.html` single-file monolith may appear in project uploads — it is NOT deployed (the deployed app is the modular `frt/js/` tree). Always verify findings against GitHub HEAD before treating any bug as real (an entire bug log was once invalidated by this).
- **ID specificity beats `class !important`** for CSS overrides; `_resetView` must route through `_applyTransform`; don't proxy data-zoom buttons.
- **Action-name collisions** (same `data-action` handled in two modules) silently misroute — grep before naming a new action.
- **`?s99test=`-style toggle frameworks** are the sanctioned way to A/B a rendering fix in PROD without branching (there is no staging).
- **Azure lessons:** re-add CORS after every deploy; the HTTP gateway 230s timeout bounds long renders; verify the live renderer via `/api/health` before editing render code.
- **Three-layer defense for sticky-state bugs**; buttons hidden `display:none` on desktop have no desktop use case (don't wire them there).
- **Date logic:** never trust `new Date("YYYY-MM-DD")` (UTC shift) — parse explicitly.
- **User-interaction learnings:** Mark wants plain-language explanations led by field impact; honest engineering pushback over sycophancy; fewer, safer commits; nothing claimed done before it is done.

---

*Reconciliation note: this file merges `ARENCON_Project_Knowledge_S154_FULL_RECOVERED.md` (S25→S154 base), the lean S205 canon, and the S216 forward regen, then aggressively prunes dead material (v1 single-file architecture, staging, iOS/iPhone field use, Fly.io, IAR, the S28 tiled-disabled era, superseded trade/board/PDF UI generations, closed bugs, decided-against features). Durable cross-tool infrastructure (PWA/TWA, Hub keys, AVAILABLE_TOOLS, CloudSync rollout, AI worker, diag framework, modal button family) folded back in per Mark's instruction. Live triad at S216 close: HEAD `b9ef0c94ac`, SW `arencon-frt-v579`, `frt.css?v=438`.*


---


---

# ════════ PART 2 — FRT CANON S25 → S492 ════════

> **VERBATIM COPY of `docs/ARENCON_FRT_PK.md`, committed at S492.**
> Genuine folded FRT canon — **not a reconstruction.** Copied byte-for-byte, not paraphrased.
> Its own title line and internal headings are preserved deliberately: editing them to fit this
> file's numbering would destroy the guarantee that makes it trustworthy.
> Its internal `PART S492 — STATE CORRECTION` section supersedes everything above it *within this
> part*. `docs/ARENCON_FRT_PK_PART_S492.md` is already folded in here — verified identical; do not
> append it a second time.
>
> **Everything between this banner and the PART 2B header below is the committed file.**

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

---

# ════════ PART 2B — S493 → S545 · THE REMAINING HOLE ════════

**⚠ This is the one window where this file is thinner than the rest — but it is no longer a blank.**
Most of it was recovered at S617 from the originating session transcripts; see the RECOVERED section below. The original PK's narrative canon for
S493–S545 existed only in the lost file. Everything before S493 is verbatim committed canon
(PART 2); everything from S546 is PART 3.

**For this window, prefer the git commit messages over this file.** Every session S500–S545 is
present on `main` and the messages are written as documentation — they are the better record, not a
fallback. Sessions present: `S500 · S501 · S502(+b) · S503(+b,c,d,e) · S504 · S505(+b–g) · S506 ·
S507 · S508(+b) · S509(+b,c) · S510 · S511 · S512 · S513 · S514 · S515 · S516 · S517 · S518 · S519 ·
S520 · S521 · S522 · S523 · S524(+c,d,e) · S525(+a) · S526 · S527 · S528 · S529 · S530 · S531 ·
S532 · S533 · S534 · S535 · S536 · S537 · S538 · S539 · S540 · S541 · S542 · S543 · S544 · S545`.

## Committed sources that already cover much of this window

| Source | Covers |
|---|---|
| **`docs/ARENCON_DATA_INTEGRITY_DOCTRINE_S524.md`** (in the repo) | The S524 doctrine in full — invariants I-1 … I-10. **This is the authoritative text; do not summarise it from memory.** |
| **`lib/data/sync.js`** — the `_LWW_SPECS` block and its in-code commentary | The whole per-item merge evolution S531 → S541, written as prose in the file itself, including why each structure was brought under protection |
| `docs/LOCKED_SEAL_REDACTION.md` + `_VISIBILITY.md` | The S492+ seal-redaction decision (**WARN**, not block — settled, not open) |
| `ARENCON_Platform_PK.md` | The shared-library / dialog-engine / help-engine arc (S488–S513) from the platform side |
| `ARENCON_Style_Guide.css` (project master) | All visual canon in this window |

## What is recorded here for the window, from surviving sources

### Photo purge and the R2 leak (S494)
`Model.purgeExpiredPhotos(retentionDays)` in `frt/js/data/model.js`, called from `photos.js` with
`_TRASH_RETENTION_DAYS = 90`. **It fires client-side, once per project, on the first Photos-panel
render after load** (`_purgedForProjectId`) — not on a timer, not on a server. A project nobody
opens is never purged; the clock only advances when someone visits.
Any photo with `deleted === true`, not already `purged`, whose `deletedDate` is older than the
cutoff becomes a purged tombstone via `_makePurgedTombstone()`, which sets `purged = true` and drops
the local payload keys (`thumb`, `_origBlob`, `dataUrl`, `_markupStrokes`). The photo leaves Trash
and stops consuming device storage.
**The gap, stated in the function's own comment: it leaves R2 in place.** The bucket object is never
deleted, so **R2 grows monotonically and never self-corrects.** One piece of good luck:
`_makePurgedTombstone` **keeps `r2Key`**, so the stranded object stays traceable. Had the key been
stripped, those bytes would be unreachable garbage nothing could reconcile.
**Reference-count before any R2 reclamation, driven from tombstones, never a bucket scan** — FRT
reports share R2 objects, so purging one report must never break its sibling's photos.

### Per-item merge — the arc, from the engine's own commentary
- **S531** flow-test photo arrays brought under per-item timestamp protection + stable-id backfill
  for legacy entries.
- **S532** permanent ids for deficiencies / responses / sketches; contractor-keyed `arrayMaps` shape
  introduced (`deficiencies` is an object keyed by contractor, each value a list).
- **S535** the engine **refuses to pair records by position** — identity required (`_lwwKeyable`),
  and **FRT switched on** for per-item protection. Activation is strictly additive: a structure
  either gains correct protection or gains nothing; it cannot gain wrong protection.
- **S538** nested per-item merge — deficiencies inside contractors, responses inside deficiencies.
- **S539 / S540** Field Heights rows, pitot rows, custom equipment and signature rows carry
  permanent names that survive a reload and merge row by row.
- **S541** unlimited-depth nesting (FRT observations three levels down); union merge for plain text
  lists; custom checklist items per section.
- **S536** shared version floor — an out-of-date build warns and, when armed, saves locally without
  publishing.
- **S533 / S534** reassign MOVES a photo (one record per stored file, identity-based detach); the
  shared photo engine made tool-neutral with FRT's behaviour as the defaults.
- **S545** burst camera Cancel asks before discarding — one accidental tap on the ✕ threw away an
  entire unfinished burst.

### Theme (S518, Lane B in Lane A's file, Mark's explicit instruction)
FRT moved off its private `arencon-frt-dark` key onto the shared **`ARENCON_Dark`** key, with a
one-time carry-over (`_frtMigrateDarkKey`) so an inspector's existing preference is not silently
reset, plus a `storage` listener so a day/night change made in any other ARENCON tab is followed
live. **The page owns the mode; the shared header mirrors it — never the reverse.**


---

## RECOVERED FROM SESSION TRANSCRIPTS (S617)

**Provenance:** the two delta files that carried this window —
`ARENCON_FRT_PK_DELTA_S508-S518.md` and `ARENCON_FRT_PK_DELTA_S526-S543.md` — were deleted by the
S611 cleanup under the heading *"their content is in the FRT PK."* **It was not.** A Lane A session
had reviewed both weeks earlier and ruled, in writing: *"KEEP — S441–S545 layer — NOT folded into
the PK; load-bearing."* `LANE-A_ADDENDUM_DOCTRINE_S524.md` went the same way.

The material below was mined back out of the originating session transcripts. It is **faithful but
not complete** — a transcript preserves what was discussed, not necessarily every line of the delta
that was written from it. Treat it as substantially better than the gap it replaces, and still not
a delta file.

### CRB re-import + issue lifecycle (S508–S509 — LIVE, and largely UNVERIFIED)

- **CRB re-import diff (S508):** comment tombstones, a four-way classifier, and a single `_writeRow`
  path. **An ISSUED answer is NEVER overwritten on re-import** — this is the most important
  unverified behaviour in the system. Also: respond-in-flow drives the real composer rather than a
  parallel one.
- **Issue lifecycle rework (S509):** issuing is redefined as an **internal review handoff** — soft
  lock, per-issue receipts, scoped unfreeze. The issue log is **in-app only**. Working-copy imports
  carry a **permanent printed marker**; non-issued exports carry a **DRAFT COPY watermark**;
  amendment notes no longer print. `undoImportBatch` flat-scan defect fixed.
- **Field tests owed (script was in the S509 transcript):** offer-back → decline-remembered →
  issued-never-overwritten → unissued Replace/Keep-both, plus the flow steps.

### Drawing fidelity — the illegible-appendix root cause (S511)

**Tiled sheets had no local raster**, so the PDF appendix printed the **400 px card thumbnail —
about 23 DPI on 11×17**. No quality tier could reach it, which is why raising export quality never
helped. **Fix (LIVE):** `_stitchTiledDrawing()` in `frt/js/export/pdf.js` — fetches the tile
manifest, picks the highest level within a ~60 MP budget, fetches tiles 8 lanes wide, stitches to
canvas and hands a PNG dataURL to the normal pipeline. Falls back to best-available if more than
25% of tiles fail. Logs `[S511] stitched…` per sheet.
Also live: export tiers show the **achievable** DPI per sheet size (Letter / 11×17 → 288 max;
24×36 → "171 DPI (sheet limit)"). **Reverted and still owed:** the seal-covers-vanish heal (the poll
must compare painted count against data, not just drawing id), the 8192 px upload cap (24×36 →
227 DPI), and PNG-at-upload (removes the first of two lossy JPEG generations).

### The viewer-header chrome saga (S512–S518) — read before touching header CSS

Six attempts. What finally worked: **triple-id selectors**
`#drawing-viewer-overlay #dv-toolbar button#dv-X` (specificity 3,0,1) beat the host's flattening
rule. S517 hardcoded the engine chrome-skin `.hicon`/`.chip` shadows with **no token and no
fallback**, because the Hub *defines* `--b-btn-shadow` as a near-invisible `0 1px 2px rgba(0,0,0,.08)`
— so a fallback could never fire. **This is the origin of the standing do-not-re-tokenise warning.**
S513/S515/S516 blocks may still sit in-file as outranked dead weight.

### DOM-ONLY TEXT IS NOT SAVED WORK (S528) — the most expensive lesson in this window

**16 pins across 6 inspectors and 6 projects lost their typed comments**
(5224.51 · 7033.13 · 7155.35 · 7155.40 · 7155.52 · 7310.17) — **unrecoverable.** Verified against
every archived version firm-wide, every sibling structure including FRT's `entries[].description`
fallback, R2, the AI log and the incident table; the tablets had since been wiped, so no device copy
survived either.
**Mechanism:** typed text lived only in the DOM behind a 500 ms debounce, and a burst-camera render
demolished the textarea before the save ran. Ian's earlier 6360 project was clean only because it
predates the burst camera — **timing luck, not safety.** One surviving artifact tells the whole
story: 7155.52 pin 5 reads `"Two manual pull station is"`, truncated mid-word where the redraw
landed partway through typing.
**LAW: cosmetics may debounce; a model write may not.** Applied at
`Model.updateObservation` / `Model.updateClosedNote` per keystroke (`deficiencies.js`) and
`_commitHeightsLive()` (`viewer.js`), plus `Model.saveNow()` on `visibilitychange→hidden` and
`pagehide`.
**TRIAGE RULE: any "it was on screen but not in the report" complaint is this family until proven
otherwise.** FRT is audited clean — every `el.value =` writes the model first. Lane C found the same
shape twice more in Diesel (the AI placard scan wrote via `el.value =` with the save path reading
back off the DOM, no model copy at all).

### Drawing markup — load order and reconcile (S526)

Markup lives as a **separate R2 file per drawing**, not inside the report — so it is **outside the
per-item merge engine entirely.** Three copies exist: the viewer's memory, the device's
`markupObjects` store, and the R2 file, with `drawing.markupR2` as the record's pointer.
**The S130 trap:** load order was "device store first, R2 only when the device has NOTHING", so a
device holding *any* record for a drawing never consulted R2 again. Markup authored on another
device was shadowed permanently — and **signing out does not touch local storage**, which is why
sign-out/in never helped Ian.
**`_reconcileMarkupWithR2` (S526)** runs in the background after the instant local render: per-item
union by id — adds R2 objects the device lacks, honours R2 tombstones (explicit cross-device
deletions), **never removes a local object R2 merely lacks** (absence ≠ delete), stands aside if the
user has started editing, and persists the union locally.
**Do NOT restore absence-based fallback and do NOT make R2 win wholesale** — that is the pre-S130
two-opens bug in reverse.

### On-screen markup diagnostic (S527)

Viewer ⋯ → 🩺 **Markup Diagnostic**: reports memory / device store / record pointer / actual cloud
file, plus **"Merge cloud copy now"** — a forced additive union for a device stuck on a stale local
copy. **It exists because field tablets run the Android TWA where the user CANNOT edit the URL**, so
URL-param debug paths do not exist in the field. **Never convert it to one, and the merge button
must stay additive.**

### Field Heights (S539 Lane C + S543 Lane A)

Heights live at `drawings[].heights` as `{id, label, value, unit}`. S539 gave rows permanent ids so
they merge row by row; S543 made the commit **synchronous** — the same "cosmetics may debounce, the
model write may not" rule applied to the heights editor, because values had lived only in the text
box until Save.

### Firm-wide save outage (S524-era) — the polarity worth remembering

A history-archiver trigger shipped without `SECURITY DEFINER` read a table authenticated users
cannot access, and **every save firm-wide was rejected for four hours.** The polarity was perverse:
**content-destroying saves still passed while content-adding saves were refused.** Fixed by
restoring the function as `SECURITY DEFINER` with a pinned search path and the throttle read moved
inside the exception block.

### Version floor (S536) and the build-identity trap

The floor identifies builds from the **service-worker cache stamp**. A Lane C note claimed "FRT has
no build stamp" — **wrong, FRT has `FRT_BUILD`.** Verify which one the floor reads for FRT before
arming it, or it can refuse cloud writes on healthy devices. An untrusted identity **may warn but
must never block cloud writes.**

### Still-open items carried out of this window

- **Simultaneous drawing markup is UNVERIFIED.** Markup sits outside the merge engine; S526
  reconcile protects a device against an empty cloud copy, but **two people marking the same sheet
  at once has never been tested.** Lane A owns the viewer — do not claim it is safe until it is.
- **`gate.py` vs `drawings.js` false positive** — the gate reported 89 silent deletions on a 4-edit
  additive change with spot-checked symbols present in both files. This blocked three real fixes
  (listed under S511 above). **Fix the gate; do not bypass it.**
- **A push whose transcript does not show the gate exiting 0 is invalid** — this rule exists because
  S511 shipped a gate-BLOCKED file when an ad-hoc script ignored the exit code.
  `gate.py --kill` takes **one comma-separated string**, not repeated flags; repeated flags silently
  keep only the last.
- **Cross Main / Feed Main on 7033.13** — values swapped between the 07-29 15:23 snapshot and live;
  **Ian confirmed he did not retype them**, and the mechanism is closed by S539+S543. Physically the
  cross main sits above the feed main. Stacy's one-sentence confirmation is still owed before that
  report ships.


---

## SECOND RECOVERY PASS (S617) — doctrine, chrome, and the S524–S525a delta

The S611 cleanup also destroyed `LANE-A_ADDENDUM_DOCTRINE_S524.md` and, earlier in the chain,
`ARENCON_FRT_PK_DELTA_S524-S525a.md`. Both recovered here from their originating sessions.

### THE DATA INTEGRITY DOCTRINE IS PK-LEVEL CANON (I-1 … I-13)

`docs/ARENCON_DATA_INTEGRITY_DOCTRINE_S524.md` **is in the repo — read the file, do not work from
this summary.** It governs every save / load / sync / merge / boot / photo / delete change in FRT
with the same force as this PK. The FRT-relevant core:

- the sync engine may **never destroy content in either direction**
- **absence never deletes** — tombstones only
- **no save before a clean cloud baseline** (I-4): FRT is read-only, visibly, until one lands
- local changes durable **instantly**, with guaranteed delivery (I-5)
- **sync failure must be loud** (I-6)
- **binaries never inside the save payload** (I-7)
- server backstops stand **regardless of client build** (I-8/I-10)
- attribution mandatory
- **I-11: a database change is not done until a real save is performed as an ordinary user**
- **I-12/I-13: devices must auto-update; the version floor is part of integrity, not convenience**

**ARCHITECTURE DECISION, settled — do not reopen:** standard sync patterns hand-built on our own
stack. **No engine migration.** Build to the doctrine; do not propose alternatives.

**The incident mechanism the doctrine closes, in three links:** a boot-push of stale state gutted
the cloud → a pull then clobbered local work → a silent save failure swallowed the rest. Every
hardening task maps to one of those three.

### Lane A's doctrine orders (recovered from the deleted addendum)

1. **Pull path = I-1 + I-2.** Audit FRT's pull/merge so absence never deletes — pins, deficiencies
   (per-drawing AND general), photos (record + per-deficiency), drawings, markup strokes, contractor
   data. Where existing array-shrinkage guards already do this, **PROVE it per category with a
   stale-pull test and record the proof**; where they don't, extend them.
   **Hollowed structures — arrays kept, values emptied — count as deletion attempts. Guard content,
   not just lengths.**
2. **Boot discipline = I-4.** Verify no boot-time writer exists (autosave timers, migration shims,
   AI writers) that can fire before the baseline.
3. **PT409 handling = I-8.** Surface guard rejections loudly: *"Save refused — this would have
   erased report content. Your local data is intact."* Any clear/reset flow needs
   `_intentionalClear` after explicit user confirmation.
4. **If-Match on every writer = I-8/I-10.** The main sync path **and** every secondary writer —
   background sync, photo-outbox metadata, direct PATCH. **One header-less writer re-opens
   last-write-wins for everybody.**
5. **Loud staleness = I-6.** Freshness pill escalates: amber at ~5 min since the last confirmed
   cloud save, red banner at ~15 min.
6. **Acceptance gate:** two-device torture test with Mark present — crash/relaunch, stale pulls,
   offline queues.

### Nested content collapse guard (S524c)

The original guard counted **containers**. S524c extended it to count content **at every depth**, so
a wipe that keeps the containers and empties the items inside them is now seen. This was the gap
originally assigned to Lane A and shipped by Lane C.

**Known coarseness, recorded not chased:** the server wipe guard counts *total* photo references, so
wiping one whole section while photos survive elsewhere does not read as a collapse. **Correct
trade** — a per-section guard would fight legitimate section deletes.

### FRT's own merge chain — a real gap, still open

Per the sync shim's own note, **FRT injects its own merge/worker chain rather than `lib`'s.** The
S524 hardening was in the sync engine only; **`frt/js/data/merge.js` → `lib/data/merge.js` is
untouched and its known gaps remain Lane A's.**

### FIELD RULES IN FORCE (these superseded the old "stop entering data" instruction)

Give the crew this version:

> **Keep working — signal is not required to do a review.** Everything is on the device as it is
> typed, photos have a crash-surviving queue, entries retry every 60 s, and a relaunch flushes both.
> **If the banner appears, do not close or reload the app** — it is retrying. Do not open the same
> report on a second device or tab until it is green. **Get to signal and see green before leaving
> site.** If it will not go green after five minutes on good signal, call Mark — do not reload.

**Same-report co-editing is an approved, supported mode**, not forbidden. Separate records remain
the default for independent work.

### Viewer chrome — one shared sealed button (`lib/ui/chromeButton.js`, S524)

The six drawing-viewer header buttons and Back render from **one sealed-shadow definition — not a
matching copy.** Eleven previous pushes failed because each copied values into `frt.css`, where ~200
accumulated rules argue and a new rule is merely the 201st contestant.

- **Sizes:** icon **34×34**, back **40×34**, wide auto×34. **No breakpoints, no
  `@media(pointer:coarse)`, no size variation of any kind.** Mark, S524: *"I want these 6 buttons to
  be the same size, stop changing size."*
- **Order (Mark's workflow):** layers · heights · seal — more · help · theme. Sheet view → sheet
  capture → print-only, then the same tail the main FRT header uses. A 10 px gap before `more`
  separates sheet controls from utilities — **a gap, not a divider.**
- **THE DELETION IS THE PROOF.** 36 blocks / 7,711 bytes removed from `frt.css`; 47 selectors
  declared to the gate; live rules touching those ids went **56 → 11**. **If id-level chrome rules
  for `#dv-close` / `#dv-layers-btn` / `#dv-seal-btn` / `#dv-heights-btn` / `#dv-help-btn` /
  `#dv-more-btn` / `#dv-dark-toggle` ever reappear in `frt.css`, the unification is fake** — that is
  exactly what failed eleven times.
- **Deliberate keeps in `frt.css`:** `#dv-seal-btn .seal-dot` (+ `.has-covers`, colour);
  `@media(max-width:900px){#dv-seal-btn{display:none}}`;
  `> div:has(#dv-layers-btn){margin-left:auto}`; `#dv-dark-toggle{margin-left:0}`; `.dv-lb-txt` hide.
  **Spacing and visibility stay with the host; the box does not.**
- **Upgrade order is load-bearing:** `upgradeViewerChrome()` runs as the **FIRST** statement in
  `boot()`, before `restoreDarkMode()` / `wireEvents()`. The upgrade swaps `<button>` → `<span>`
  host (a `<button>` cannot own a shadow root), so any listener bound beforehand is discarded with
  the element. Delegated handlers (`closest('#dv-close')`) are unaffected — the host keeps the id.
- **Light-DOM children stay slotted, deliberately:** `viewer.js` reads `#dv-heights-dot` by id and
  `drawings.js` appends `.seal-dot` into `#dv-seal-btn`. Moving that content inside the shadow would
  break both **silently.** Runtime state classes (`.active`, `.seal-armed`, `.has-covers`) are set on
  the host and styled from inside via `:host(.class)` — no observer, no caller changes.
- **Values are HARDCODED — no `var()` indirection into host pages.** A host may define a token weakly
  and **a defined token beats any fallback.** Scars: S504 Back button, S514 Hub icons. **The ONE
  exception is `--ts`** (user text size), a real user setting that inherits through the shadow
  boundary, so `calc(16px + var(--ts,0px))` works unchanged inside the seal.


---

## THIRD RECOVERY PASS (S618) — verbatim delta text, and a source that was never lost

### FINDING: `tools/protected_symbols.txt` is a verbatim archive of this whole window

The protected-symbols manifest — **in git, permanent, appended to at every ship** — carries **100
prose blocks**, each written at ship time as the authoritative statement of a Mark-specified
feature. The S508/S509 issue-lifecycle rules, the S524 chrome button, the S526 markup reconcile and
dozens more sit in it **word-for-word as they were written on the day.** For any feature shipped in
this window, **read its `@` block in the manifest first** — that text never left git and outranks
any recollection, including this file's.

### VERBATIM — `ARENCON_FRT_PK_DELTA_S508-S518.md` § CRB (recovered word-for-word from the
### transcript of the session that wrote it)

> **Re-import diff (S508, live):** already-imported rows are reconciled, not dropped. Classifier
> `_classifyDupes` buckets: silent (unchanged, or removed + this exact wording already declined) ·
> offerBack (removed, contractor still says it — one-tap Bring back / Leave out) · reworded (live
> UNISSUED → Replace / Keep both) · newRound (live ISSUED → never overwritten; files as a new round
> on the current instance). **Issued is checked BEFORE any skip logic.** Wording comparison is
> whitespace/case-insensitive (`_normTombText`).
>
> **Comment tombstones:** deliberate removal of an IMPORTED comment (`removeThreadEntry` on kind
> response with dedupeKey) writes `project.commentTombstones[dedupeKey] = {text, at, by,
> declined[]}`. Declining an offer pushes the normalized wording into `declined`. Restore and
> `undoImportBatch` clear the tombstone. API: `_writeCommentTomb`, `findCommentTomb`,
> `dismissCommentTomb`, `clearCommentTomb`, `tombDecisionFor` → 'none' | 'silent' | 'offer'.
>
> **`findLiveResponseByDedupe(dedupeKey)`** walks contractors[].deficiencies AND
> generalDeficiencies (⚠ there is NO flat `_project.deficiencies` — **third time this trap has
> bitten**; also fixed inside `undoImportBatch`).
>
> **`replaceUnissuedImportedDraft`** — in-place correction of an imported, UNISSUED contractor
> draft. Hard-refuses: issued entries, non-imported comments, ARENCON reviews. Logs
> `reimport-replace` amend. Writes no tombstone. (Distinct from `editThreadEntry`, which requires
> deliberate unlock.)
>
> **ONE writer:** `_writeRow(row, ctx, opts)` in crbImport.js is the sole path from an imported row
> to a contractor round (normal commit + every diff branch). `opts.asNewRound` strips sheet round so
> an issued-revision files on the current instance. Registers dedupeKey only after a successful
> write; records `{deficId, obsIdx}` into `ctx.written` for the flow.
>
> **Respond-in-flow (S508 L3, live):** `window._frtStartRespondFlow(targets)` (dedup one step per
> observation).

### VERBATIM — the S509 issue-lifecycle rules (from the live manifest, never lost)

> Issuing is asked **BEFORE** export generation; a working copy gets a grey diagonal DRAFT COPY
> watermark **drawn into the PDF bytes of every page**. Issuing soft-locks via a per-issue receipt
> (`_issueId`); `unfreezeIssue` releases ONLY that issue's comments and they remember
> (`wasIssuedOnInstance`). The issue log is **IN-APP ONLY** — never printed, never exported.
> Working-copy sheets import with a warning and a **permanent WORKING COPY marker that DOES print**.
> `undoImportBatch` walks contractors[].deficiencies AND generalDeficiencies (flat-scan defect fixed
> S509) and clears the batch's comment tombstones. **Amendment notes NO LONGER print**
> (`_crbAmendNote` retained unused — **do not re-wire without Mark**). (Mark, S509)

The reasoning behind that decision, recovered from the design conversation: "issued" in this firm
means the **internal review handoff** to Mark or Shaun — what actually goes outside is tracked by
email. An "Amended" line on the PDF would advertise internal review churn to the client and the AHJ.
The trade named plainly at the time and accepted: with the lock this soft, the
issued-never-overwritten protection only holds while a comment is actually locked — **flexibility
over enforcement**, chosen deliberately for a firm where Mark and Shaun review everything.

### Push-discipline canon from the deleted S526–S543 delta (verbatim from its opener)

> Push discipline, updated after a clobber (S524e): **re-asserting HEAD is not enough. Re-fetch
> every file you are about to overwrite from live HEAD and compare its blob SHA against the copy you
> started editing.** If it moved, rebase onto their version and gate against theirs. Post-verify via
> Trees API blob SHA + direct `/git/blobs/{sha}` content fetch — **never the Contents API (it serves
> stale copies)**, never CDN.

### The version floor's FRT blind spot (S543-era finding, still worth knowing)

The floor identifies a build by reading the browser's offline-cache name, and it only recognises
names shaped as *prefix + digits and nothing else*. **FRT's cache name carries an extra suffix tag,
so the floor skips FRT entirely** — and because it fails open, it silently decides "I can't tell"
and does nothing. Verify what the floor reads before ever arming it for FRT; an untrusted identity
may warn but must never block cloud writes.

### Codified process rules from the S512–S518 saga (verbatim, from the manifest of the day)

> 1. Specificity calculators must count `:not()` contents.
> 2. **No styling claim without a device computed-style check** — dead/outranked selectors pass
>    syntax checks, gates, and blob verification.
> 3. **Served bytes ≠ painted pixels.** Mark's one console line ended what seven pushes could not;
>    **ask for it at round ONE, not round eight.**

---

## ⛔ What is genuinely unrecoverable

After three recovery passes — transcripts mined to the point where searches return only material
already recovered — what is left is narrow: the lost deltas' **retire lists and supersession
notes** for this window — the "these class names are
dead, never reuse them" material, and the record of which decision overruled which. Those document
what is deliberately *absent*, so they cannot be regenerated from live code by definition.
**If you are about to reintroduce a class name, a flag, or a pattern that feels familiar but you
cannot find in current code, search the commit log for it before assuming it is new.**

---

# ════════ PART 3 — FRT CANON S546 → S614 ════════

**Source confidence: high.** Folded verbatim from the two surviving PK deltas, the surviving
Lane A handoffs, and the git commit lineage (each commit message written as documentation).

## NEW LAWS (S572–S587) — these outrank anything they contradict above

### 1. Pins live in TWO arrays — always sweep both
`generalDeficiencies[]` **and** `contractors[].deficiencies[]` (CRB copies). A month of forensic
analysis searched only the first and missed real damage on two projects, including a pin corrupted
13 Jul that sat wrong for three weeks. **Any data question about pins, photos or deficiencies must
query both.** `Model.findDeficiency` already spans both — SQL and analysis must too.

### 2. Validate at the END of a gesture. Never clamp-and-save.
A clamp (`Math.max(0,Math.min(1,…))`) applied to a raw computed fraction on a commit path is the
fingerprint of every corrupted pin since inception. Doctrine, uniform on every pin surface:
- inside the sheet → commit exactly
- a hair past the edge (2% fingertip tolerance) → clamp deliberately (a real edge placement stays possible)
- beyond tolerance → **REFUSE**, write nothing, log what was computed

A clamp is legal ONLY if validation precedes it in the same routine, or it is a per-frame preview
whose gesture end validates — and previews must be tagged `PREVIEW: validated at …`.
`pinTeleportGuards.exercise.mjs` §E enforces this permanently.

### 3. Android sends `touchcancel`, not `touchend`, when the OS takes over
Camera intent, keyboard opening, notification, palm rejection. **Any surface that arms state on
touchstart and clears it on touchend MUST also handle touchcancel**, or the armed state survives
indefinitely. This is what let a pin write itself after an inspector returned from the camera.
Pair it with `visibilitychange` + `blur` disarms.

### 4. One shared state per module = a clobber bug waiting for density
The mini-map kept one module-level `st` that every mount overwrote. At 9 pins nobody noticed; at 16
it wrote to pins nobody was looking at. **State belongs to the instance** (`canvas._peState`), and a
pointer-down re-points at the element actually touched.

### 5. The mobile toolbar does not inherit desktop tools
`dv-toolrow-v75` is a row of PROXY buttons. A new desktop tool is **invisible in the field** until
it gets its own proxy there. Ship the proxy with the tool.

### 6. "Shared engine" means shadow-scoped, not merely shared code
Four rounds failed on the ⋯ menu because a host stylesheet outranked the shared CSS
(`.dv-toolbar button` 0-0-2-1 beats `.menu button` 0-0-1-1). Sharing the code was not enough.
**A shared UI component that must look identical everywhere mounts in its own shadow root** — then
no host stylesheet can reach it, in any tool. Proof of a real conversion is the host stylesheet
getting *emptier*.

### 7. `aria-hidden` must never wrap anything focusable
Use `role="presentation"` + `inert` for presentational wrappers.

## Module changes (S572–S587)

- **`lib/ui/markupSelection.js` → v2.12.0** — trash mode: `setTrashMode` / `isTrashMode` /
  `_trashDown` / `deleteTrashPicks` / `trashCount`. **Tap-only by design** (a destructive mode gets
  no bulk-capture gesture). Deletion routes through the host's existing `deleteSelected`, so the
  FRT viewer's tombstone wrapper fires exactly as on the select path — one delete path, never two.
- **`lib/ui/headerEngine2.js`** — now **exports the dropdown it always owned**:
  `menuCSS(darkSelectorPrefix, z)` and `buildSharedMenu(items, { shadow, onPick })`. The header's
  own More/Reports/AI dropdowns build through `buildSharedMenu`. `shadow:true` mounts in a shadow
  root with the CSS inside and syncs `data-theme` from `body.dark-mode` via a MutationObserver.
  **Consumers pass items; they never style the menu.**
- **`frt/js/viewer/viewer.js`** — `_pinPlaceValidate` (both placement paths); `_peCancelGesture` +
  `window._frtPeCancelGesture`; `_frtDisarmAllPinGestures` on `visibilitychange`/`blur`; per-mount
  `canvas._peState`; write-identity guard against `_peDeficId`; density guard on press; disarm on
  editor switch/close; one-finger pan (`_oneFPanReady`/`_oneFPanning`) neutral-state only;
  long-press suppression at `selectstart`/`dragstart`.
- **`frt/js/viewer/markup.js`** — loupe removed; `_DV_PILL_*` uncompressible; single-mode dimension
  cancel; undo/redo dissolve in-progress dimensions; trash routing + `_dvEnsureTrashBar` /
  `_dvRefreshTrashBar` / `_handleTrashDown`; `_dvEnsureMoreMenu` (engine-built, shadow) +
  `_dvRunMoreAction`; `_showPinWriteLog`.
- **`frt/index.html`** — mobile toolrow: trash proxy in, undo/redo out to the style strip;
  `#dv-more-menu-slot` is **empty by design** (the engine builds the menu).
- **`frt/css/frt.css`** — nine menu selectors DELETED (proof of real unification); menu rules
  limited to positioning with a standing "fix the engine, never add rules here" note;
  `#mk-trash.active` red; `.dv-ss-ur` strip buttons; long-press suppression for `.dv-canvas-area *`.

## Live update — FRT is on the shared engine (S588–S596 · adopted by FRT at S608)

`lib/ui/liveUpdate.js` owns listening, staging, safe moments, the pill, and the swap. **FRT's old
S207 "Update ready / Refresh / Not now" banner and its bottom-right indicator are REMOVED at Mark's
explicit direction — do not restore `_showUpdateReadyBanner` / `_showUpdateReadyIndicator` /
`_doUpdateReload` from history.** FRT supplies only:
- `flush()` → `Model.saveNow()` (the S162 field-day-loss primitive, preserved)
- `isBusy()` → drawing viewer / photo lightbox open, or photos in flight in the outbox
- `capture()` → `{tab, scroll}`

**Safe-moment rules are engine-owned** (focused field, open dialog, hidden mid-gesture) and must
never be re-implemented per tool. **The swap happens while the tab is HIDDEN, 20 s in — never as
the user returns** (S592: Mark stepped away, came back, started reading, and the page reloaded
under him). Idle 5 min is the other window. The engine keeps asking every minute while visible
(S593).

**The tab now lives in the address bar** (`?tab=`, written by `switchTab` with `replaceState`, read
by `_restoreView`), so ANY reload — refresh, update swap, crash — returns the inspector to the tab
they were on instead of Project Info. Same class as the Hub bug fixed in S591, one level down.
TWA users cannot edit URLs; the app writing its own state is the sanctioned path.

## Sync doctrine — FRT joined it at S608, hardened S612–S613

**The listening loop says what it did on every beat** (`_frtHeartbeatTick`, Diesel S602–S605 form):
- every exit records WHY to `_frtTickDiag` — a ring diary readable **on the tablet** from the
  cloud-dot popup (SYNC TIMELINE), because field devices have no console
- a watchdog releases a hung pull (45 s) instead of going deaf for the session; the release lives
  in a `finally`, never a trailing statement
- every network call is time-bound (`_frtWithTimeout`, 20 s)
- a probe error is **never** mistaken for "the cloud has not changed" (`lastProbeError`)
- unsent work flushes on EVERY beat and pushes **before** any pull can touch it — a push into a
  newer cloud row 412s into the 3-way merge, so non-overlapping edits from two tablets both survive
- **S605 stats-based re-arm only** (`lastPullKeptLocal`) — never the S604 content-compare, which
  misfires on photo binaries
- notable outcomes leave the device via `_frtSyncDiag` → `sync_diag`. **Module-scope mirrors
  lesson:** a logger reading closure variables from module scope throws silently and writes nothing,
  forever (Diesel's table was empty for four sessions for exactly this reason).

**Startup is unhangable** — `_bootStep(name, promise, ms)` time-bounds local-db / sign-in /
cloud-pull; a stalled sign-in works from the device copy instead of bouncing the inspector to a
login page their connection cannot load; a 25 s boot watchdog forces the local render;
`_frtBootLog` breadcrumbs appear in the same on-device panel.
**A timed-out boot pull is NOT an empty cloud** — `_bootPullTimedOut` gates new-project creation
off and `_bootPullRetry` keeps asking. Fabricating a blank report over real cloud work is the
failure this prevents.

**The automatic "you have unsaved edits — Pull now?" banner is retired** from the heartbeat path.
With per-item entry stamps live for FRT (S535) and push-before-pull, both devices settle
field-by-field without asking anyone to choose. The banner survives only behind the explicit
pull-to-refresh gesture (`_frtCheckRemote`), where the user asked.

## Merge spec — FRT's `_LWW_SPECS` entry

- **Typed photo fields (S608, restored S612).** FRT photo records carry local-only binary the cloud
  strips by design (`dataUrl`, `thumb`). Whole-object dirtiness read every photo as "locally edited"
  on every device on every pull, so local won forever and another tablet's caption edit, rotation or
  delete could never land. Dirtiness is judged only on what a person can change about a photo — and
  the never-bake markup vectors (`_markupStrokes` / `_mkFrame`) **are** content a person changes.
  `_lwwStripFields` serializes non-scalar typed fields canonically (`stableKey`), so a **moved** mark
  counts as an edit; `String()` on an array of objects preserves only the count.
- **Deficiency and observation entries remain UNtyped** pending Lane C's deficiency-propagation
  work. See `frt/tests/sim/deficsync.mjs` for the unblock criteria — and verify Lane C's closure
  against live HEAD, never against a handoff's claim.
- **Emptiness ignores values nobody typed (S613).** FRT stamps defaults onto every row at load —
  contractors get a palette `color`, observations get `priority`/`tradeSource`/`repeatCount`,
  deficiencies get `_photoPoolMigrated`. The engine's emptiness test read those machine-written
  values as an inspector's work, so a genuinely blank row could never be recognised as empty: it
  survived absence-never-deletes and unioned into everyone's report — the same ghost-row machine as
  Diesel's 21→32. `_lwwItemEmpty(item, defaults)` now takes a per-family `defaults` map declared in
  `_LWW_SPECS`, **value-matched**: `priority` is ignorable only while it still reads `'high'`;
  `'*'` means machine-chosen and never typed. Threaded through all six emptiness call sites.
  **Tools that declare nothing are untouched — Diesel is byte-identical.**
  ⚠ **Never widen a `defaults` map without re-running the negative control** in
  `frt/tests/sim/converge.mjs` check R.

## Tests that must stay green

| File | What it protects |
|---|---|
| `frt/tests/unit/pinTeleportGuards.exercise.mjs` | 31 checks; writer census, structural invariants, live replay of the mini-map validator, density/wrong-target guards, placement validate-and-refuse + the no-raw-clamp rule |
| `frt/tests/unit/twoInspectorMarkup.exercise.mjs` | markup conditional-PUT concurrency, 7 scenarios, extracts the LIVE merge at run time |
| `frt/tests/sim/tickhealth.mjs` | the listening loop reports every exit; watchdog; probe errors; stats re-arm |
| `frt/tests/sim/bootstall.mjs` | time-bound boot steps; watchdog; **timeout ≠ empty cloud** |
| `frt/tests/sim/stalemate.mjs` | typed photo fields + canonical serialization + live merge replay |
| `frt/tests/sim/converge.mjs` | **49 checks.** Spec-driven P/K/W/G walk at NESTED depth (11 families) + fieldMaps + check **R** (real rows built through Model's own creation calls must survive). New spec families are covered by construction. |
| `frt/tests/sim/deficsync.mjs` | deliberate BLOCKED stub — records scope, asserts nothing |
| `tools/sim/*` (Lane C, portable since S614) | **run these too whenever `lib/data/sync.js` is touched** — it is shared, and that is how Diesel gets clobbered |

## Data repair on record

**7033.13** — three boundary-clamped pins restored to their last deliberate positions;
pre-repair snapshot in `tool_data_history`, `hist_id` **1006**, reason `pre-repair S583`.
**1490.04** — pin 1 damaged and already re-placed by Mark; quarantine lifted, Mark works in it daily.

## Tooling / gate

- `tools/gate.py` — pre-push symbol diff. **Output must be pasted for every file, every push.**
- `tools/protected_symbols.txt` — Mark-specified features; the gate refuses to pass if any listed
  symbol disappears. `--kill` does **not** override a protected symbol. Only Mark edits the manifest.
- `tools/gen_precache.py` — `sw.js APP_FILES` is MACHINE-OWNED. **Re-fetch `sw.js` from live HEAD
  immediately before every run** (S604c: Lane C clobbered a Lane A fix learning this).
- **GATE HOLE #2 (open):** the gate catches symbols that disappear, not calls to functions that
  never existed. The S567 bug — a call against a never-defined function — was invisible for a week.
- **GATE HOLE #3 (found S612, accepted by Lane C in writing S614, Lane A to build):**
  protected-symbol enforcement is **diff-conditional** — `prot_hit` is computed from the removed
  set, so a symbol missing from a **stale base** was never in the diff and protection never fires.
  Protection inherits the staleness of whatever base you point at. **Fix: an absolute presence
  check** — if the manifest says a symbol must exist and it is not in the file about to be pushed,
  block, regardless of the diff. This single change would have prevented S610's silent revert of
  Lane A's S608 work.

---

# ════════ PART 4 — CURRENT OPEN QUEUE (S615) ════════

## Owed field verification — Mark present, before anything is built on top

1. **S613 ghost-row fix is a DATA-PATH CHANGE and is not yet trusted.** Two devices on one FRT
   report: add a contractor on one, type nothing for a minute, confirm it is **still there** on
   both — genuine in-progress work must survive. Then confirm a blank ghost row that was already
   floating stops coming back. **If either fails, that is the session.**
2. **Pin guards** — the crew works a normal day on S587+, then sends the Pin Write Log from the ⋯
   menu. Also still unrun: one-finger pan over a dense pin field (16 pins).
3. **Offline path unverified since the service worker moved to stale-while-revalidate** — one
   deliberate airplane-mode open on a tablet.

## Build queue

1. **Gate hole #3** — the absolute presence check described in PART 3. Lane A owns it; coordinate
   the push with Lane C because `tools/gate.py` is shared.
2. **Header consolidation demo** — owed to Mark, **demo-first, no live code.** The viewer bar
   carries back · sync · ☰ layers · 📐 heights · 🔒 seal · ⋯ more · ? · theme = eight controls on a
   phone-width bar. Proposal on the table: one "Tools" drawer absorbing layers/heights/seal/
   download/diagnostic/tasks, unless one of them is a during-markup workhorse.
3. **Two standing shared-header requests from Lane B — not to be worked around:**
   - `--b-hbtn-fg` / `--b-hbtn-bg` on the chrome skin. Text-button colour is hard-coded `#fff`,
     which is invisible on a light header; the only current route is a solid `bg` per button.
   - `ctl.setMenuItemLabel(menuKey, index, html)` — there is no menu-ITEM relabel API
     (`setControlIcon` relabels a whole control only).
   **⚠ DRIFT WARNING: the hardcoded chrome shadows must NEVER be re-tokenised.** The Hub's
   `--b-btn-shadow` is a still-armed `.08`; token indirection caused an 8-round shadow loop.
4. **Backup photos are markable and orphan a second backup.** Marking photo A creates clean backup
   B (`_isOrigBackup:true`); B has no guard against being marked up itself, so opening B creates a
   third record C whose parent is B — orphaned litter with nothing linking it to A. Not corrupting.
   **Fix: a photo with `_isOrigBackup` must not be markable** — gate the markup entry in the photo
   viewer, with a second check in the `frt-markup-saved` handler so no other path can get round it.
5. **Deficiency split stage 2+** — photo move/copy block next (Mark present: photo path), then the
   burst block, then the 2,168-line event-delegation block.
   ⚠ `PLAN_FRT_DEFICIENCIES_SPLIT.md` **does not exist in the repo** — the stage-2 cut list was
   never pushed. Regenerate before starting.
6. **Contractor Response Phase 2** — lifecycle (Awaiting → Responded/No-response → Reviewed),
   portal, deterministic PDF import, soft email gate. Phase 1 is done and prints.
7. **Workstream 2 — video capture → R2 → PDF.**
8. **Per-contractor mini-donuts** — the last piece of the charts direction.
9. **`_doReassign` pool-write fix** (see PART 2, photos) before extending gallery site→pin.
10. **Photo dedup → admin Repair button** — awaiting Mark's orphan-handling decision (delete vs
    re-attach vs offer both). Console fns are the spec: `_frtCleanDupes` / `_frtCleanAllOrphans` /
    `_frtRehomeOrphans`.
11. **L3/L4 pin size step** — Mark's tablet judges the feel; two multipliers to tune.

## Watch / diagnostics

- **Cloud-push 30 s timeout** — telemetry shipped, root cause still open; read
  `window._frt_syncWorker._diag` at the next timeout.
- **PDF export-bar page-zoom** — accept the banner or strip the ineffective counter-scale.
  Mark is OK with the banner; tidy-up, not a defect.
- **`window._frtPinWriteLog`** — a REFUSED entry on `pe-location-thumb*` means stale geometry
  upstream is still live.
- **`frt-next/`** is a dormant ~5.3 MB duplicate tree — nothing links or caches it, but it answers
  every code search twice.
- **Session numbering collides with Lane C.** Lane A took S612/S613 while Lane C used S607–S611;
  read the lane prefix in a commit before assuming lineage.

## Owed human items

- Crew one-liner: hard-refresh → confirm the build → **hold for the glow, then drag**.
- **Stacy's one-sentence confirmation on 7033.13 Cross Main / Feed Main** — the report has been held
  on it since Friday.
- Owed field verifies: trash grid PC pass; two-device repaint test; instance-1 7155.51
  keep-or-delete.

## Permanently closed — never re-queue

Tombstone purge (shipped; 1490.04 quarantine lifted) · Library Step 0/1 (shipped, exceeded) ·
CRB Phase 1 (shipped) · N+1/N+0 carry-forward port (live since S119–S269; only the optional
`frtInstances[]` ledger is unbuilt) · **Export Project Docs** (shipped — `lib/export/projectDocs.js`
+ FRT adapter; Mark has corrected this being re-raised) · Lightbox → shared shell migration (closed,
not worth doing) · **IST / OBC / DD work of any kind** (deferred indefinitely, Mark S551) ·
de-burgundy reskin · **FRT rewrite business case / principals "delivered vs promised" deliverable**
(permanently excluded — the principals presentation is the PDF output of the live tool itself).

---

# ════════ PART 5 — SESSION DISCIPLINE (standing) ════════

- **Mark is a Licensed Engineering Technologist (L.E.T.) under PEO — never "engineer".**
  He is not a coder: lead with **field impact**, not implementation.
- **Lead with a recommendation and reasoning, never a neutral menu. One question per turn, written
  as plain text** — the option widget frequently renders blank on his end.
- **Terse approvals ("A", "go", "push it") mean proceed immediately.**
- **Honest pushback is expected and welcomed; sycophancy is not.** Flag data-corruption,
  silent-side-effect and fat-finger hazards in plain terms, propose the safer path, then let him
  decide.
- **Never claim work is done that isn't.** Verify against live GitHub HEAD before saying something
  "isn't done" or "was agreed" — **do not trust a handoff document's own claims; they are
  frequently stale.**
- **No fix may be claimed without a test that FAILS on current live code first.** If a test passes
  on both old and new code, it proves nothing — sharpen it or say so. **Prove the test has teeth
  with a negative control.**
- **Instrument before theorizing.** Field devices have no console; the on-screen panel is the only
  instrument. After 2 failed fix attempts, STOP guessing and read live state.
- **Surgical `str_replace` only — no block rewrites.** They silently delete needed content with no
  failure mode.
- **Push discipline:** re-assert live HEAD immediately before every push → blob → tree
  (`base_tree=HEAD`) → commit (`parents=[HEAD]`) → PATCH ref `force:false` → **post-verify via the
  Trees API blob SHA, never CDN** (`raw.githubusercontent.com` lags ~10 min).
  Bump the build stamp every push; `CACHE_NAME` and CSS `?v=` bump together when touched.
  Files >1 MB use the Blobs API (Contents API silently truncates).
- **Demo-first** for significant UI changes. **Data-path changes (save/load/sync/migrations/photo
  pipeline) are field-verify-gated with Mark present.**
- **Standing command meanings:** *"Proceed with handoff XXX"* = read that tool's latest handoff plus
  every delta layered on top, then **report the to-do list** — it never means write a handoff.
  *"give me handoffs"* = handoff + PK delta + Style delta. *"give me FULL handoffs"* = handoff +
  complete regenerated PK + complete Style Guide (the Style Guide is >500 KB and organised in PARTs
  — **append a new PART, never regenerate the file**).
  **Never auto-generate deliverables.**
- **Times:** all database and log timestamps are UTC. **Mark is in Mississauga / Eastern —
  always convert before showing him a time.**

---

# ════════ PROVENANCE ARCHIVE (recovered history, S25→S154) ════════

> The body above is the **current truth** for working sessions. Everything below is the **complete recovered history**, preserved at Mark's request. It is reference-only: where it conflicts with the body above or the DO-NOT-RESURFACE ledger, the body wins. Read this for the *why* and the lineage of decisions, not for current state.

## Per-session PDF / trade-model lineage (S139→S151)

# Session 139 Additions — Phase 3 PDF restructure (AS-SHIPPED)

> S139 shipped HEAD `9f300a7b`, SW `arencon-frt-v418`, CSS `frt.css?v=318`.
> Commits `4ade000` → `9f300a7b`. ⚠ **Model 2 is now SHIPPED** (S140
> structure + S142 PDF, live) — the "approved spec" that used to live
> here has been folded into the Session 140/142/143 sections below and
> §2944 has been rewritten. S139 "B" (in-trade rec sub-band + "Site
> General · Recommendations" band) is **superseded and removed from live
> code**; S139 "A" (Trade→Contractor restructure) and "D" (hi-rec note)
> are KEPT under Model 2. This section is retained as the S139 as-shipped
> record only.

## A/B/D/E/F — as shipped (do NOT device-trust until Mark verifies; QA in handoff)

- **A** — PDF report regrouped **Trade→Contractor→cards**. Navy trade band
  `#2A3A5C`, taupe contractor sub-band (S118 burgundy `.ch` recolored to
  `#7B6F5A`). Pagination re-stamps both bands on continued pages via
  `_restamp()` / `_aTradeHtml`. Trade order: declared `projectTrades` →
  extras seen → "Other Trade Items" → (old) "Site General · Recommendations".
  **This restructure (A) is KEPT under Model 2.**
- **B** *(SUPERSEDED by Model 2)* — grey `#6B7280` "Recommendations" sub-band
  within a trade for no-contractor trade-tagged recs; bottom "Site General ·
  Recommendations" band; verbatim italic `.rec-foot`; muted `.rec-chip` REC
  in card header.
- **D** — italic `.hirec-note` (taupe) under the deficiency summary: "This
  report includes X high-priority recommendation(s) — see Recommendations
  section." Distinct-pin count, legacy pin-level priority handled, count=1
  grammar, auto-suppressed when recs gated off. **KEPT; S140 only re-points
  the "see Recommendations section" wording to the new pooled section.**
- **E** — export-modal "Untagged items (N with no trade)": Show as "Other
  Trade Items" (default) / Exclude; plus "Include recommendations" toggle
  (default ON) gating all rec content from the main body.
- **F** — control-bar `#defic-renumber-btn` REMOVED from `frt/index.html`
  (handler in `deficiencies.js` left defined-but-inert, S137 discipline).
  Amber "Renumber before export" toggle (default ON, `--warn #B7791F`) in
  export modal; runs `Model.renumberDeficiencies()` + re-renders pre-export.

---

# Session 140 Additions — Phase 3.x "Model 2" structure + contractor lifecycle (AS-SHIPPED)

> Live at S140: SW `arencon-frt-v424` / CSS `?v=324`. Demo
> `ARENCON_Phase3x_Model_Demo.html` approved verbatim by Mark. This is
> the on-screen Model 2 structure; the PDF half shipped S142 (below).

### 1. Model 2 — Detailed-view structure (SUPERSEDES the prior rec model)

`_renderDetailedView` (deficiencies.js) renders **3 disjoint sections**,
in this order; every pin appears in exactly one:

1. **Deficiencies** — Trade → Contractor spine. Navy trade band
   (`.dfx-trade-banner`), taupe contractor sub-band (`.dfx-ctr-banner`),
   protected `_buildPinGroupCard` pins. No-trade deficiencies fall to a
   distinct steel **"Other Trade Items"** band (`.dfx-trade-banner.other`
   `#4A5568`). The literal word "Untagged" is gone (user-facing).
2. **Recommendations** — every `isRecommendation` pin is PULLED OUT of
   the spine into ONE pooled section. Grey header
   (`.dfx-trade-banner.recs` `#6B7280`); header reads
   **"Recommendations (Closed)"** under the Closed pivot. Internal layout
   = trade **subheadings only** (`.dfx-rec-sub`), with **"No trade
   assigned" last**. Contractor shown as an **inline chip**
   (`.dfx-rec-ctrchip`) ONLY when one exists — never a contractor
   sub-band.
3. **Site Records** — the reserved no-contractor informational bucket
   (`proj.generalDeficiencies`, **renamed from "Site General"**). Muted-
   slate band (`.dfx-trade-banner.records` `#5C6678`) + persistent
   **"Internal — excluded from client report" pill** (`.dfx-sr-pill`) +
   **dimmed cards** (`.dfx-sr-pin` opacity .8). Excluded from external
   reports by default.

**Filter = uniform (Behavior B, Mark-approved):** the 3-state rec filter
+ lifecycle pivot are applied in `_flatRows` BEFORE `_renderDetailedView`;
the filter behaves identically in Active and Closed. No special
Closed-view rec handling.

**Trade ordering rule:** declared `proj.projectTrades` first, then extras
seen, then "Other Trade Items" / "(No trade assigned)" appended last.

### 2. ⚑ MODEL INTERPRETATION (in force; flagged in `_renderDetailedView`)

Schema has **NO separate "is a Site Record" flag**. Per S139 §4.1/§4.6
("Site Records = RENAME of Site General; no new flag; no migration"):
- non-recommendation pin **with NO contractor** (lives in
  `generalDeficiencies`) = a **Site Record**, regardless of any trade;
- pin **with a contractor** = a **Deficiency**;
- any `isRecommendation` pin = a **Recommendation**, wherever it lives.

Reproduces the approved demo exactly. If Mark ever wants no-contractor
*deficiencies* distinct from Site Records → that needs a new schema flag.

### 3. model.js additions (B1) — canonical

- `SITE_RECORDS_LABEL = 'Site Records'` (module const).
- `isSiteRecordsName(nm)` — matches new + legacy "Site General".
- `Model.derivePinTrade(defic, contractor)` — canonical fallback:
  `obs[0].trade` → contractor's **SOLE** declared trade → `''`. Use this
  everywhere a pin's effective trade is needed (Detailed view AND
  `pdf.js`).
- All user-facing 'Site General' string literals now emit
  `SITE_RECORDS_LABEL` (model.js + 6 deficiencies.js call sites). Dead
  `ctrColorClass`/inert `buildGroup`/comment occurrences left per S137
  no-rewrite discipline.

### 4. Contractor lifecycle (B2d + B2e) — non-destructive, LIVE

> ⚠ The B2d amber "unassigned strip" and B2e read-only Trade-Board card
> are themselves **superseded by S142 §2 ClickAssign** (the whole kanban
> board + B2f roster are gone). The **delete-safety contract below is
> PERMANENT and still in force**:

- **Delete is non-destructive EVERYWHERE.** All UI delete paths call
  `Model.deleteContractorAndReassign(ctrId)`: the contractor's
  deficiencies are **MOVED to Site Records (`generalDeficiencies`),
  never deleted**; only the contractor record is spliced. Confirm +
  toast report the moved count.
- **`Model.removeContractor` (destructive splice — orphans deficiencies)
  is no longer reachable from ANY UI path.** Kept in model.js, unused
  (S137 discipline). This structurally fixes the S140 contractor-delete
  data-loss bug — there is no Undo until Phase 4, so the safety net is
  "cannot lose data in the first place."

**model.js contractor API (verbatim):** `removeContractor(ctrId)` —
DESTRUCTIVE, UI-unreachable, keep don't call. `deleteContractorAndReassign(ctrId)`
— SAFE, returns moved count, the ONLY delete used by UI.
`addContractor(name)` → `{trades:[], deficiencies:[], color:auto}` (no
auto-deficiency). `renameContractor(id,name)`,
`setContractorTrades(id,[trades])`, `addContractorToTrade(ctrId,trade)`
(additive, idempotent, auto-creates the trade), `addProjectTrade(t)`
(idempotent, case-insensitive), `removeContractorFromTrade(id,trade)`,
`removeProjectTrade(trade)` (cascades — strips the trade from every
`contractor.trades`).

### 5. Operational — concurrent writers to `main` (PERMANENT)

A parallel **Training Center / Supabase** workstream pushes to `main`
independently and frequently (orthogonal to FRT). Mandatory push pattern
every commit: GET ref → if HEAD ≠ baseline, fetch each target path at
baseline and at HEAD and assert byte-identical (any diff → ABORT, manual
rebase, never force) → `base_tree` = HEAD's tree → blobs → tree → commit
(parent = HEAD) → PATCH ref `force:false` → re-assert. **Never
force-push.** Expected, not anomalous.

---

# Session 141 Additions — B2f persistent roster (SHIPPED then SUPERSEDED)

> Shipped `d0da10c`, SW `v425` / CSS `?v=325`. **B2f is SUPERSEDED by
> S142 §2 ClickAssign** (the persistent roster + the kanban Trade Board
> are both gone). Recorded for provenance — do NOT rebuild B2f.

B2f replaced the S140 conditional `.tb-unassigned` amber strip with a
**persistent Contractor Roster** (always rendered, listed ALL
contractors, single master Add/Rename/Delete/Assign; golden per-chip
border when on no trade, cleared at ≥1; roster "+ Add contractor" = bare
contractor, no auto-deficiency; assign switched to additive
`Model.addContractorToTrade`). It also did **2B Trade-Board column
auto-fit** — removed the three `min-height:100px` floors (`.trade-col`,
`.trade-add-col`, `.trade-add-col-input`); kept equal-height +
bottom-pinned `+ Add contractor` for row alignment (Mark's refinement).
The B2f `.ctr-roster*`/`.cr-chip*` CSS is recorded in the Style Guide
§23 retired list (replaced by the `crx-` family).

---

# Session 142 Additions — §2 ClickAssign + Model 2 PDF AS-SHIPPED + Batch 4

> Live at S142: HEAD `c0c9d353`, SW `arencon-frt-v438`, CSS
> `frt.css?v=338`. Visual contracts: `ARENCON_ClickAssign_Demo.html` and
> `ARENCON_Phase3x_Model_Demo.html`, both approved verbatim.

### 1. §2 — Contractor Roster (ClickAssign) SUPERSEDES the trade board + B2f

`_renderTradeBoard` (deficiencies.js) is now the **`crx-` ClickAssign
system**. Replaces the S136 kanban Trade Board AND the S141 B2f roster.

- **`TRADE_LIST` (model.js)** = `['Sprinkler','Fire Alarm','General
  Contracting','Electrical','Mechanical','Civil']` (was the old 4 incl.
  "Building Conditions"). `pdf.js` has zero `TRADE_LIST` refs.
- Layout: colour **pill strip** of trades + `+ trade ▾` prebuilt
  dropdown (six prebuilt not already added, plus "+ new trade…") +
  **2-up roster grid** (`.crx-grid`, collapses 1-col ≤720px) + pick-mode
  state machine. Body pick state = `body.crx-picking` (`crxPulse`
  keyframe). Unassigned contractor chip = golden border
  (`.crx-cc.crx-unassigned`), clears at ≥1 trade.
- Assign = click the per-card **`⊕`** → enter pick mode (strip gets a
  dashed burgundy frame, every pill pulses, target chip gets a burgundy
  ring, taken trades dimmed/blocked) → click a glowing pill. Cancel =
  Esc, the Cancel bar, or click-away (capture-phase document click).
- `×` on a contractor tag = un-assign that one contractor; `×` on a
  strip pill (only when NOT picking) = delete the trade everywhere
  (confirm shows the un-tag count).
- **Custom-trade colour = deterministic char-code name-hash** into 2
  EXTRA palette slots (`_TRADE_EXTRA`). No colour picker. Trade colour is
  applied consistently: strip pill AND that trade's tag on every
  contractor.
- 11 `crx-*` click handlers; capture-phase document click (cancel pick +
  close menu) + Esc. Legacy S136/B2f trade-board handlers are
  **defined-but-inert** (S137 — present, no longer emit data-actions).
- `index.html` card header reads **"🏗 Contractor Roster"**.

### 2. Model 2 PDF — AS-SHIPPED (the §2944 rewrite is the canonical record)

See the rewritten §2944 above for the full live PDF structure. Net:
trade/contractor sections are deficiencies-only; every recommendation is
pooled into ONE "Recommendations" section on a forced new page after
Previously Closed Items; **all primary header bands are navy `#2A3A5C`**;
burgundy `#9C2742` is accents-only. Key code anchors:

- `pdf.js _pinTrade(d)` = `Model.derivePinTrade(d, _parentCtrByDefId[d.id]||null)`.
  Parent = contractor whose `.deficiencies[]` holds the pin (NOT the
  per-obs `r.ctr` override); `generalDeficiencies` → null. Root-cause fix
  for "single-trade contractor pin still shows as Other Trade Items".
- Grouping loop diverts `isRecommendation` rows to `pooledRecs[]`;
  `recBlocks` emitted after Previously Closed via
  `_aTradeHtml=''; _aCtrHtml=''; _startPage(); recBlocks.forEach(_flowBlock); _finalizePage();`.
- `_flowBlock` = the extracted pagination callback (was inline
  `contentBlocks.forEach`). Main body = `contentBlocks.forEach(_flowBlock)`;
  recs reuse it. **Architectural rule: do not re-inline.**
- `_buildDefCard(r, hdrExtra)` — optional 2nd param injects HTML into
  `.dc-hdr` after the priority pill; `''` (byte-identical) for the 2
  deficiency callers; the rec caller passes the contractor chip.
- `_recsMode` ∈ `bottom` | `only` | `exclude`; `_recFooter` default ON;
  `_srOptIn` = `includeSiteRecords` (default OFF) OR explicit Site-General
  filter. The S139 in-trade rec sub-band + "Site General ·
  Recommendations" band are **removed**.

### 3. All primary PDF header bands navy `#2A3A5C`

`.th-band` (trade), `.st th` (page-1 Deficiency Summary table header —
*was burgundy*), `.sh` (Appendix "Drawings with Pins" — *was burgundy*),
and the Previously Closed inline header are **all navy**. Pooled-recs
band `.th-band.recs` is grey `#6B7280`. Previously Closed: navy band,
neutral `#EEF2F4`/`#4A5568` instance row, muted-green `#3F6E55`
"Addressed" (forbidden bright `#1A7A4A` eliminated here). Burgundy
`#9C2742` accents-only: `.dc-itemnum` (pin #), `.ph-addr` (2px left
rule), `.app-dwg-title` (3px left-border). Tracked retained debt
(untouched unless Mark asks): the appendix `app-pin-table` status-cell
hexes and the `.st td` status-count colours (`#1565C0`/`#C0392B`/`#1A7A4A`);
the `#FF69B4` IAR status colour is **gone** (column removed S143).

### 4. Terminology — "Untagged" deprecated (user-facing)

No-trade pins are **"Other Trade Items"** (band) / **"Items with no
trade"** / **"No trade assigned"**. The literal user-facing word
**"Untagged" is gone everywhere** (export-modal box header → "Items with
no trade (N)"; Board card no-trade chip → "none"). Internal identifiers
(`pdf-untagged`, `untaggedMode`, `_countUntaggedForBand`, the `untagged`
group var) are **deliberately retained** (non-user-facing; renaming is
churn/risk, out of scope).

### 5. Detailed list — inline contractor reassign (Batch 4-2)

`_buildPinGroupCard` renders a defic-level `data-action="obs-contractor"`
`<select>` (`.ctr-banner`) next to the Trade select. Change →
`Model.reassignDeficiency(deficId, value||null)` (`''` = Site Records;
dedup-safe, persists) + `saveNow()` + `render()`. Reassigns the whole
pin's contractor **without opening the pin editor**. Defic-level (no
`data-obs-idx`): on a multi-obs pin it shows on each obs row but
reassigns the whole pin.

### 6. Focused single-pin panel (Batch 4-3/4-4)

A Table row / Board card click opens **`_openPinFocus(deficId)`** — a
body-level overlay `#pinfocus-overlay` rendering the **same
`buildDeficCard`** (every inline control + view-pin/place-pin
affordance) + a prominent "📌 View on drawing" / "📌 Place pin" CTA. It
is **NOT** a jump to the Detailed list and **NOT** the heavy
drawing-canvas pin editor. `initDeficiencies.render()` calls
`_refreshPinFocus()` at its end so an open panel stays current after any
model edit; it **skips the rebuild while a TEXTAREA inside the panel is
focused**, and closes the panel if the defic was deleted. Esc / backdrop
/ ✕ close; `view-pin`/`place-pin` call `_closePinFocus()` first.
`_dfxGotoPin` is kept defined-but-inert (S137); `dfx-goto` now routes to
`_openPinFocus`. Universal because **every on-screen card path uses
`buildDeficCard`** (Detailed, Closed, Rec, Site Records).

### 7. Modal text scaling (precedent)

Inline-styled modals follow app S/L via `font-size:calc(Npx + var(--ts))`
(`_openPDFPicker` converted; precedent for all future inline modals).
PDF body stays locked 11pt regardless.

---

# Session 143 Additions — Inspector attribution + Report Legend (AS-SHIPPED, incl. post-handoff fixes)

> Live at the S143 canon pass: HEAD `9c9b3115`, SW `arencon-frt-v440`,
> CSS `frt.css?v=340`. The S143 handoff was written at `6f9c1f79` (SW
> v439 / CSS v339); **two post-handoff fix commits (`ea71cdc5`,
> `9c9b3115`) are live and folded here.** The original S82 PDF inspector
> "modes A/B/C" spec is **lost and formally retired** — the canonical
> model is **2 modes only (Off / Initials)**.

### 1. Inspector attribution — data layer (`model.js`)

- `createdBy` is stamped per-entity since S83 (= `_currentUserId`);
  **per-observation** (`obs.createdBy`) is the attribution key, not
  per-pin.
- `Model.setInspectorFetch(fn)` — injection point. **`model.js` has no
  Auth import by deliberate design**; `app.js` injects the Auth-backed
  fetcher. Keep the data layer Auth-free.
- `Model.resolveInspector(userId)` — synchronous `{name, initials,
  color}`. Contract: null/legacy → `{name:'—',initials:'—',color:null}`
  (no fetch ever); unknown → provisional + background batch fetch;
  cached → resolved.
- `Model.setInspectorEntry(userId,name)` — direct seed (signed-in user,
  no round-trip).
- `Model.primeInspectors(userIds)` — debounced via `_inspectorPending`;
  **caches color-only on missing rows** so deleted/absent profiles never
  refetch in a loop; emits the `'inspectors'` change event.
- `_inspectorColor` / `_inspectorInitials` — internal, deterministic.
  **Color rule:** inspector chip colour is derived **deterministically
  by hashing `userId` into the existing `CONTRACTOR_COLOR_PALETTE`**.
  `profiles.inspector_color` does NOT exist in the live Supabase schema
  and is NOT read. No new colours enter the system. If
  `profiles.inspector_color` is ever added, preferring it is a clean
  future enhancement (single branch in `primeInspectors`) — not wired.

### 2. Profiles fetch (`app.js`)

Batch endpoint `/rest/v1/profiles?id=in.(<ids>)&select=id,full_name` via
`Auth.request`, injected immediately after `Model.setCurrentUser`. Name
resolution order: `profiles.full_name` → `user_metadata.full_name` →
email prefix → `—`. **Standalone mode (no auth path) never injects the
fetcher → resolver inert → no chips. Correct, intended graceful
degradation.**

### 3. On-screen

- Per-observation initials chip `.obs-insp-chip` renders into the
  reserved `.obs-insp-slot` (designed empty S137, populated S143). Color
  via the `--ic` custom property (set inline from `Model._inspectorColor`).
- Control-bar toggle `#dfx-insp-toggle` (NOT a "Layers menu" — no such
  menu exists in FRT). localStorage `arencon-frt-insp-chip`, **default
  ON**. Lives next to the Detailed/Table/Board view toggles, `.dfx-recmode`
  idiom.
- Async resolution repaints via a one-time `Model.onChange('inspectors')`
  subscription (guarded `_inspChipSubscribed`).
- Legacy/null `createdBy` → empty slot (no `—` chip on screen; existing
  projects unchanged).

### 4. PDF (supersedes the lost S82 "modes A/B/C")

- **2 modes only:** `off` (default) / `initials`, via the `#pdf-insp-tag`
  `<select>` in `_openPDFPicker`. `inspTag` threaded as the **trailing
  positional arg** of `_exportPDFWithCache` (now 15 params; same additive
  convention `recFooter` used; never reorder the legacy positional
  signature — only append). Passed at both call sites
  (`opts.inspTag||'off'`).
- Chip renders in `.dc-hdr` after the priority pill when `initials`.
  `.dc-insp` CSS lives in pdf.js's **injected** stylesheet (new-window
  document; frt.css does not reach it).
- Off-by-default keeps client reports clean; legacy/null prints nothing.

### 5. Report Legend (Phase 3 C, re-scoped + post-handoff fix2)

- **There was never a pre-existing PDF title-page legend.** The old
  §2944 "legend gains a rec entry" line referenced a legend that did not
  exist. Built fresh in S143, then revised by fix2:
- Live: title is **"Report Legend"** (renamed from "Report Key");
  `.rep-key` box on page 1, injected after the Deficiency Summary table,
  before the hi-rec note, inside `if(reportDefs.length)`. Now a **2-column
  grid** (`.rep-key-grid` `grid-template-columns:1fr 1fr`), compacted
  (`margin-top:10px; padding:8px 12px`).
- Reuses **literal report classes** (`.th-band.recs`, `.rec-chip`,
  `.pill-h/.pill-l/.pill-c`, `.dc-insp`) as live swatches so the legend
  can never drift from actual output.
- Rows: Recommendations band (gloss "recommendation items - do not hold
  off sign-off"), REC chip, Outstanding-high, Outstanding-low, Closed,
  and an inspector-initials row **only when** `inspTag==='initials'`.
  **No Trade row** (dropped in fix2) and **no IAR row** (IAR retired
  S135).

### 6. Post-handoff fix2 — legacy IAR cleanup (`model.js`, NEW canonical migration)

The IAR feature was UI-removed in S135 but the `iar:true` flag lingered
in old JSON and could no longer be toggled off in-UI. S143 fix2 adds a
**load-time clear** inside `loadFullProject`'s migration:
- Pin level: `if (d.iar) { d.iar = false; _iarCleared++; }`
- Per-obs: `if (o.iar) { o.iar = false; _iarCleared++; }`
- **One-directional, idempotent, touches ONLY `iar`** — never
  priority/status/dates. Once cleared nothing truthy remains, so re-loads
  are no-ops (no dirty churn). A single `console.log('[Model] S143:
  cleared N legacy IAR flag(s)')` only when `_iarCleared > 0` — **no UI
  toast** (background normalization). Reinforces the S135 "IAR fully
  retired — do NOT re-add" rule with active cleanup.
- PDF: the Deficiency Summary **IAR column was removed** (per-contractor
  rows + Total row); columns now Deficiency Summary / Total / New This
  Report / Outstanding / Closed.

### 7. Engineering notes (carry forward)

- `str_replace` into single-quoted JS strings: a literal `\u2014`
  written as `\\u2014` becomes a double backslash in-file and prints
  literal text. Codebase convention is single `\u2014` inside
  single-quoted strings (e.g. pdf.js:469). Verify after every such edit.
- The CSS-string scanner's "unbalanced `c+=`" hits at pdf.js
  ~202/284/285 are **pre-existing false positives** (multi-line
  font-face / title-block). Not regressions.

### 8. Scoped OUT (carry forward)

- **Canvas inspector pin-ring** (the broader S82 "outer ring on
  drawing"): unbuilt, touches protected `pinsGL.js`/`pins.js`, a
  separate future piece. The reserved `.obs-insp-slot` and the PDF
  dropdown are NOT this.
- S139 QA follow-ups — skipped by Mark's explicit instruction; still
  open.
- Closed Items Summary still listing rec rows — pre-S143, untouched;
  confirm acceptable.

---

# Session 144 Additions — PDF Recommendation-page rework (DESIGN; shipped at S145)

> ⚠ **S144 was design-only — nothing was pushed at S144.** This rework
> actually shipped in the **S145 push** (`arencon-frt-v441`). Recorded
> here as the design of record; the AS-SHIPPED state (incl. the S144 §6
> "section title OPEN" resolution and the §7 Export view actually built)
> is in the **Session 145 Additions** section below. Where S144 intent and
> S145 shipped differ, **S145 wins**. This **SUPERSEDES the S142 Model-2
> pooled grey-themed Recommendations layout** and the S143/early-S144
> legend order.

### 1. Recommendations section — SUPERSEDES the S142 pooled-recs layout

The S142 pooled "Recommendations" section (grey `.th-band.recs` master
band + `.rec-cap` caption + `.rec-sub` grey trade sub-band + inline
`.rec-ctrchip`, emitted after Previously Closed Items) is **superseded**:

- **Deficiency Summary table = deficiencies only.** Recs filtered out
  (`summaryDefs` excludes `isRecommendation`). Resolves the pre-S143 rec
  double-count where recs were counted on both tables.
- **Recommendation Summary table** — NEW, built from the SAME
  `recByTrade`/`recOrder` structures the section emits → summary ≡
  section. Cols **Total / Open / Closed**, Open+Closed=Total. It is the
  top block of the rec section and serves as the de-facto section header,
  parallel to "Deficiency Summary". Navy `.st` family; Total-row border
  navy `#2A3A5C`.
- **All rec bands navy `#2A3A5C`.** Grey rec theme dropped. The rec
  section now uses the **exact main-report grammar**: navy `.th-band`
  trade → taupe `.ch` contractor → connected square `.dc` cards.
  Visually identical to the deficiency body; only differentiators are the
  REC chip per card + the "Recommendation Summary" heading.
- **Removed:** master grey "Recommendations" title-card; `.rec-cap`
  caption. **Dead CSS now** (kept in place, tidy later): `.th-band.recs`,
  `.rec-sub`, `.rec-cap`, `.rec-ctrchip`.
- **Footer note** — single italic `.rec-foot` at the very end of the
  section, **always shown, no toggle**: *"Recommendation items noted
  during this review fall outside the contracted scope of work, and are
  not held against the engineer sign-off letter."* The picker's "Show
  recommendations note" checkbox is **removed** (`app.js`); `recFooter`
  hardcoded `true`, positional arg preserved (no signature change).
- **`'only'` mode** = standalone recommendations document. No Deficiency
  Summary. Order: header + info grid → Recommendation Summary → Report
  Legend → trade groups → Previously Closed Recommendations → footer
  note. Recs lead page 1 (no orphan near-empty page).

### 2. Closed-rec split — NEW, mirrors the main report

- `_recPrevClosed(r) = _deficIsClosed(r.d) && (r.d.closedOnInstance||_curInst) < _curInst`.
- A rec closed in the **current** instance stays inline in its trade
  group (first-time close). A rec closed in a **prior** instance moves to
  a **"Previously Closed Recommendations"** table — identical markup to
  the deficiency "Previously Closed Items" (navy `#2A3A5C` colspan
  header; `#4A5568` uppercase sub-header row; grouped `"Closed in FRT #N
  — date (N items)"`; rows Pin/Description/Contractor/Noted/Status;
  80-char description clamp). No `closedOnInstance` ⇒ current ⇒ inline.
- The Recommendation Summary still counts **all** pooled recs (closed,
  incl. previously-closed, land in Closed) — scoreboard stays complete;
  only the body splits. Mirrors the deficiency side.
- The S143 `closedSummaryDefs` exclusion of recs from deficiency
  "Previously Closed Items" STILL stands and is correct — recs get their
  OWN Previously Closed Recommendations table inside the rec section.

### 3. Card header — REC chip relocated

`_buildDefCard` header: REC chip moved from the left group (`.dc-hdr-l`,
beside `#num`) to the **right group** (`.dc-hdr-r`), **immediately before
the status pill**. Card left side = `#num` only, identical to deficiency
cards. Right cluster order: inspector chip → contractor chip → **REC** →
status pill.

### 4. Report Legend — order corrected + gloss capitalised

- 4 entries, 2-col grid, navy filled `.rep-key-ttl` bar. Left col =
  Outstanding-high (top) / Outstanding-low (bottom). Right col =
  **Closed (top) / REC (bottom)** — corrected S144 (emit order `high,
  Closed, low, REC`). *This reverses the S143/early-S144 REC-top/
  Closed-bottom order; Mark flagged it 3× — Closed-top/REC-bottom is the
  current truth.*
- REC gloss capitalised: **"Recommendations - do not hold off sign-off"**.
  The S143 "Recommendations" band-swatch row remains removed.
- In `'only'` mode the legend is emitted as a rec block right after the
  Recommendation Summary table; in full/deficiency mode it stays on
  page 1 (`_legendHtml`; appended to `summaryHtml` only when
  `_recsMode!=='only'`).

### 5. Report title + per-project override — NEW

- Recs-only `_rptTitleBase` = **`Field Review Report-Recommendation`**
  (hyphen, no surrounding spaces, **singular**). Non-recs unchanged
  (`Field Review Report`).
- **Per-project override hook:** `_rptTitleOverride = (p.info &&
  p.info.reportTitleOverride && String(...).trim()) || ''`; `_rptTitleBase
  = _rptTitleOverride || (<default>)`. Override is **project data, not
  code** → a special client-requested title can be issued with **no tool
  redeploy**. The report number (`' #'+_rptNum`) is appended downstream
  and is **never part of the override** → automatic, non-editable. The
  override editor lives in the Export view (built S145).

### 6. Section title — RESOLVED AT S145 (was OPEN at S144)

S144 left this open (Mark rejected both `.sh` and the thin-divider
alternative; no shipped decision). **Resolved in S145 as Option I** — see
the Session 145 section: `.rec-secttl` / `.rec-secttl-ttl` (15pt navy
`#2A3A5C`) / `.rec-secttl-sub` (10pt `#5A6473`), no box/bar/fill.

### 7. Export view — built at S145 (was design-only at S144)

The dedicated Export view captured in S144 design (role-grouped
distribution, card colours by role, report-type two options, editable
title persisting to `p.info.reportTitleOverride`, plain-language Scope
dropdowns, folds in D3 = exclude "Site General" pseudo-contractor) was
**built and shipped in S145** as `frt/js/export/exportview.js` — see the
Session 145 section.

### 8. Still scoped OUT / carry forward (from S144, status as of S148)

- **D1 pagination** — ✅ **DONE S148 (Option #1, per-trade
  keep-together — commit `0dc4a558`, SW v449).** As shipped it is
  finer-grained than the original "whole deficiency section to page 2"
  framing: each main-body *trade* that fits a fresh page is not started
  near a page bottom (pre-pass `_secH` + one `tradeHeader`-branch
  guard); an over-page trade still splits; Recommendations pagination
  unchanged. See the Session 148 Additions section.
- Dead rec CSS cleanup (`.th-band.recs`/`.rec-sub`/`.rec-cap`/
  `.rec-ctrchip`) — still pending.
- Protected internals untouched: `go(pg)` recursive PDF upload pattern,
  `_flowBlock`, bin-pack pagination, `_pushItems`.

---

# Session 145 Additions — S144 reconstruction SHIPPED + new `exportview.js` (AS-SHIPPED)

> Shipped HEAD `9dae2589`, SW `arencon-frt-v441` (precaches
> `frt/js/export/exportview.js`), CSS `frt.css?v=340` (**S145 did NOT
> touch frt.css**). This is the push that actually landed the S144
> recommendation-page rework onto live S143 canon, **plus** the new
> Export view module. Where this differs from the S144 design, this
> (shipped) wins.

### 1. pdf.js — full S144 rec-page reconstruction onto live S143 canon

- Deficiency Summary is **deficiencies-only**; **new Recommendation
  Summary** table; **navy trade → taupe contractor → cards** rec grammar
  (grey rec theme gone); **"Previously Closed Recommendations"** split;
  reworked legend (Closed top / REC bottom, no band-swatch row,
  capitalised gloss); **REC chip in the right header cluster** via the
  `.dc-hdr-l` / `.dc-hdr-r` split; **always-on `.rec-foot`** footer;
  recs-only title `Field Review Report-Recommendation #N` +
  `p.info.reportTitleOverride` hook.
- **Option I — final rec section title (the S144 §6 OPEN item, RESOLVED):**
  `.rec-secttl` / `.rec-secttl-ttl` (15pt navy `#2A3A5C`) /
  `.rec-secttl-sub` (10pt `#5A6473`) — **no box, bar, or fill**. Scope
  sentence (verbatim canon): *"The following items were noted during this
  review and fall outside the contracted scope of work. They are provided
  for information and are not held against the engineer sign-off letter."*
- **Forced page break before the rec section in full mode**; **none in
  recs-only** (recs lead page 1 — no orphan page).
- Protected internals (`_flowBlock`, `_startPage`, `_finalizePage`,
  bin-pack, `go(pg)`, `handlePDFUpload*`, `_pushItems`) untouched —
  surgical edits only.

### 2. app.js

- The rec-footer toggle is **removed** (`recFooter` hardcoded `true`,
  positional arg order preserved — never reordered).
- The **3 PDF buttons now route to `initExportView.open()`**.
- Legacy `_openPDFPicker` is left **defined but dead/unreachable** (S137
  no-delete discipline; future cleanup — flagged).

### 3. NEW module `frt/js/export/exportview.js` — canonical PDF-export entry point

Replaces the cramped legacy PDF picker as the export UI:

- **Role-grouped distribution rows:** Owner / Contractors / Other
  recipients. **"Site General" (Site Records) is excluded** from the
  auto distribution list (folds in S144 D3).
- Plain-language **Scope** dropdown (P3 wording): full report
  (deficiencies + recommendations) / recommendations-only document /
  exclude from report.
- **Editable report title**; persists to `p.info.reportTitleOverride`;
  the locked auto `#N` is shown separately and is never part of the
  override. Distribution persists to `p.distribution[]`.
- **Imports:** `Model, isSiteRecordsName` from `../data/model.js`;
  `initPDFExport` from `./pdf.js`; `initDeficiencies` from
  `../ui/deficiencies.js`; `toast` from `../shared/toast.js`. **No
  `app.js` import → no circular dependency.** This import contract is
  load-bearing — preserve it.
- **Generate call keeps exact functional parity with the old picker** —
  do not regress the generate path.
- CSS classes are the `.exv-*` family (injected as `#exv-style` by the
  module — a new-window/in-app injected sheet; see Style Guide).

### 4. sw.js

- `arencon-frt-v440` → `v441`; precaches `frt/js/export/exportview.js`.

### 5. Carried open (status as of S147)

- Legacy `_openPDFPicker` dead code (future cleanup).
- Recs-only PDF still emits the drawings appendix (no S144 spec said to
  suppress — left as-is).

---

# Session 146 Additions — Trade fan-out · Site Records · empty sections · export-modal · Detailed-view fold · width/control-bar (AS-SHIPPED)

> Live at S146 close: **HEAD `5daeca19`, SW `arencon-frt-v447`,
> `frt.css?v=342`.** Shipped across 6 verified per-batch pushes
> (`953e0136`→`5daeca19`); a concurrent Training Center/Supabase
> workstream pushed to `main` mid-session (`530da527`, `77806794`) and
> was preserved via the verify-then-rebase pattern (target paths
> asserted byte-identical, never forced).

### 1. B1 — plural trade derivation (model.js) — CANONICAL

- **NEW** `Model.derivePinTrades(defic, contractor)` → **array**:
  `obs[0].trade`→`[that]`; else legacy `defic.trade`→`[that]`; else
  **all** `contractor.trades` (trimmed, de-duped); else `[]`.
- Singular `Model.derivePinTrade` is **UNCHANGED** and still canonical
  for any single-trade caller (Trade-Board etc.). Both coexist. **Do not
  alter the singular.**
- **Fan-out applies to the deficiency listing only:** deficiencies.js
  `_renderDetailedView` deficiency partition + pdf.js main-body grouping
  (new local `_pinTrades(d)` mirroring `_pinTrade`). A no-explicit-trade
  pin on a multi-trade contractor renders under **EVERY** assigned trade;
  on-screen Detailed view and PDF agree (for non-empty sections).
- **Recommendation grouping stays SINGLE-trade** (deficiencies.js rec
  partition; pdf.js `_pinTrade` at rec Summary `_aByT` + rec section
  `_rByT`). **Documented deferred follow-up — recs do NOT fan out yet;
  surface to Mark before doing.** ⚠ **SUPERSEDED at S148 (Option A):**
  recs now fan out in the deficiencies.js rec partition AND the pdf.js
  active rec section body `_rByT` (both → plural `_pinTrades`); ONLY
  the PDF Recommendation Summary scoreboard `_aByT` stays single-trade
  `_pinTrade`, by design, so its per-trade rows sum to Total. See the
  Session 148 Additions section — that is the current truth for recs.
- **Double-count guard (structural, permanent):** `_renderDeficLog`
  (on-screen, contractor-grouped) and `_deficSummaryHtml` (PDF,
  contractor-grouped) are separate code paths from the trade body —
  fan-out never inflates Total/New/Outstanding/Closed. Trade-band +
  contractor count pills and listing rows intentionally duplicate per
  trade ("two rows like FRT").

### 2. B2 — "Site General" → "Site Records" (completes the S140 rename)

- Display label everywhere → `SITE_RECORDS_LABEL`. Sentinel/equality
  everywhere → `isSiteRecordsName()`.
- **model.js `isSiteRecordsName` predicate KEEPS legacy `'Site General'`**
  (`nm===SITE_RECORDS_LABEL || nm==='Site General'`) — old project JSON /
  cloud snapshots still carry it; removing it breaks load grouping.
  **PERMANENT.**
- Functional sites fixed: deficiencies.js `ctrColorClass` slot-c3 (via
  `isSiteRecordsName`), Deficiency Log fallback label, `buildGroup`
  label; pdf.js `_pushItems` arg + `_ctrFilterName` + `_isRealCtr`
  (coherence: `_isRealCtr` uses `!isSiteRecordsName(nm)` so the bucket
  isn't treated as a real contractor — done together). app.js +
  exportview.js legacy/dead option labels → "Site Records only".
  Imports added: deficiencies.js `isSiteRecordsName`; pdf.js
  `isSiteRecordsName, SITE_RECORDS_LABEL`. The wrong "Site General"
  `.exv-hint` sentence was deleted (also seeded B3 de-clutter).

### 3. Empty trade→contractor sections — SCREEN ONLY (deficiencies.js)

- `_renderDetailedView` seeds every `proj.contractors[].trades[]` combo
  into `tradeMap`/`T.ctrs` at count 0 so an assigned-but-deficiency-free
  contractor section stays OPEN with its `+ Add deficiency` button.
- **Gate:** only `!closedPivot && _dfxRecMode!=='rec' &&
  !_dfxSearch.trim() && !_dfxPri`; `_dfxCtr` (if set) limits to that
  contractor.
- **PDF unaffected — Mark-confirmed.** pdf.js NOT changed. The B1
  "screen+PDF agree" invariant is now: *non-empty sections agree; empty
  scaffolding is screen-only.*

### 4. `+ Add deficiency` — parametrized trigger + prefill

- `_addDeficTriggerHTML(opts)`: no-arg = global trigger (behavior
  unchanged); `opts.scoped` = compact dashed per-section variant carrying
  `data-ctr-id` / `data-trade`.
- `_openAddDeficModal(prefillCtrId, prefillTrade)` sets `#adf-ctr` /
  `#adf-trade` **only when the value exists as an option** (else graceful
  blank). Handler `open-add-defic` reads the data-attrs off the clicked
  `[data-action]` element.

### 5. Detailed-view independent fold (deficiencies.js) — NEW, canonical

- The Detailed view never had fold before S146. The `_foldedGroups` /
  `toggle-fold` / `.defic-group-header` mechanism is the **legacy
  `buildGroup` path only**; Detailed lost fold at S140 when it became
  default — **not a S146 regression.** S146 builds independent fold
  (Mark Option 1).
- State (module scope, persists across re-renders): `_dfxFoldTrade{}`
  (key = trade name | `'__recs__'` | `'__siterec__'`), `_dfxFoldCtr{}`
  (key = `trade '::' ctrId`), `_dfxSectionKeys[]`.
- Markup: trade banner `data-action="dfx-fold-trade" data-trade`; ctr
  banner `data-action="dfx-fold-ctr" data-ctr-key`; **each contractor
  wrapped in `.dfx-ctr-block`** (no prior code depends on the old flat
  shape — verified); `.dfx-collapsed` class; `.dfx-fold-arrow` chevron
  (▼/▶); `.dfx-foldall-bar`/`.dfx-foldall-btn` Collapse all / Expand all.
  Recs + Site Records sections fold too.
- Behavior: single banner toggle = flip persisted state + **direct class
  + chevron toggle (no re-render → no scroll jump)**; fold-all = mutate
  all + `initDeficiencies.render()`. Handlers in the main click
  dispatcher **before** the legacy `toggle-fold`.

### 6. B3 — Export modal (exportview.js injected `#exv-style`) — canonical

- **`--panel` is NOT a real CSS var** and is now **eliminated** from
  exportview.js (it was the dark-mode white-box bug). Surfaces use
  `var(--card,…)`: `.exv-lock`, `.exv-c`, `.exv-prev`, `.exv-f`.
  **Never reintroduce `--panel` anywhere.**
- Modal `max-width 1060px` (was 900); tightened spacing; no desktop
  scroll (phone scrolls via `#exv-ov{overflow:auto}`). ALL text on the
  FRT idiom `calc(Npx + var(--ts,0px))` (labels 13 / selects+inputs 14 /
  section headers 13 / checkboxes 13).
- Removed permanently: the 4 field `.sub` explainers, the report-title
  `.exv-hint`, the footer `.exv-f .l` "Saved per project…" line (markup +
  dead CSS). Footer right-aligned. `.exv-cancel`/`.exv-go` = `6px 18px`,
  muted `#8A4A4A` / `#4A6B5A`.
- **Generate handler byte-unchanged — exact functional parity with the
  picker, verified.**
- **Known open issue (flagged, untouched):** `.exv-fld select,input`
  still use `var(--bg)` (= dark-mode `#0f1318`, near-black) → low
  contrast on the dark modal. **Separate pre-existing issue, NOT the
  `--panel` bug.** Deferred — awaiting Mark's go.

### 7. Appendix pin-table (pdf.js `_buildCSS`)

- `.app-pin-table` / `th` / `td` = **`11pt`** (matches the locked report
  body — `body`, `.dc-desc`, `.st` are all 11pt). 11px was tried (push 5)
  then corrected to 11pt (push 6) per Mark — body must match the report,
  not shrink. The PDF body 11pt lock now explicitly extends to this table
  (header was 9pt pre-S146).
- Pin/Status/Contractor `th+td` (`:first-child`, `:nth-child(3)`,
  `:nth-child(4)`) → `white-space:nowrap;width:1%`; Description (col 2)
  unconstrained, absorbs slack — the `#N` / `#N-A` pin label never wraps.

### 8. Visual tokens (see Style Guide §20 / §B-S146 / §48)

- `.main-wrap` max-width **1600px** (was 1400).
- Dark-mode active-state burgundy = **`#7C3344`** bg / **`#F4DDE3`** text
  (de-loud of `#9C2742`) for `.defic-pivot-btn.active`,
  `.dfx-recmode-btn.active`, `.view-toggle-btn.active`; and
  `.add-deficiency-card .adc-plus` dark.
- `.view-toggle-btn.active` light mode = burgundy `#9C2742`/#fff (was
  white).
- `.add-deficiency-card` restyled to a solid, obvious button (+ `.scoped`
  variant); `.dfx-*` fold classes added; control-bar B4 single-row;
  export-modal B3 token rules — all recorded in the Style Guide.

### 9. CURRENT-TRUTH supersedes (S146)

- "Site General" user-facing strings: **gone** (Site Records); legacy
  string survives ONLY inside `isSiteRecordsName`.
- Detailed-view trade/contractor sections are **collapsible** (S146).
- Export modal: no explainer sub-text, no hint, no footer status line;
  `--panel` forbidden; 1060px; FRT type idiom.
- `Model.derivePinTrades` is the canonical multi-trade source for the
  deficiency listing; `derivePinTrade` unchanged for single-trade
  callers; ~~recs stay single-trade (deferred follow-up)~~ **— SUPERSEDED
  S148: recs now fan out in the body (Option A); only the PDF
  Recommendation Summary scoreboard `_aByT` stays single-trade by
  design. See Session 148 Additions.**

---

# Session 148 Additions — Rec body fan-out (Option A) · D1 pagination (Option #1) · exportview dark-mode input contrast (AS-SHIPPED)

> Live at S148 close: **HEAD `8afae4270b6f5d884758a0a4148cc06668ccc2a2`,
> SW `arencon-frt-v450`, `frt.css?v=342` (UNCHANGED — no frt.css/visual
> change in S148, so there is NO Style Guide delta and none is needed).**
> Shipped across 3 verified per-item pushes (`88cd88e1` → `0dc4a558` →
> `8afae427`), each HEAD-re-asserted, target paths verified byte-identical
> at baseline vs the (concurrently-moved) HEAD, re-parented `force:false`,
> post-verified. A Training Center / Supabase workstream pushed to `main`
> repeatedly during the session and was never disturbed. **Both
> S147-flagged follow-ups and the S144 D1 carry-forward are now closed.**

### 1. Rec body fan-out — Option A (commit `88cd88e1`, SW v448)

Files: `frt/js/ui/deficiencies.js`, `frt/js/export/pdf.js`, `sw.js`.
`model.js` NOT modified (only reads the existing S146 `derivePinTrades`).

- **deficiencies.js `_renderDetailedView` rec partition:** now
  `Model.derivePinTrades(e.d, ctrOf(e.ctrId))` (plural) with a
  `[NOTRADE]` fallback. A recommendation with no trade of its own on a
  multi-trade contractor is **listed under every one of that
  contractor's trades** (mirrors the deficiency body / the on-screen
  "two rows like FRT" behaviour). The per-trade rec sub-band pill
  (`R.count`) duplicates intentionally, exactly like the deficiency
  `T.count`.
- **`recCount += e.count` is OUTSIDE the fan-out loop** → the master
  "Recommendations" band total pill counts each rec **once**. This is
  the on-screen half of Option A.
- **pdf.js:** the ACTIVE rec section body grouping `_rByT` now uses
  plural `_pinTrades` — fans out, an exact idiom match to the deficiency
  main body (`var tks=_pinTrades(r.d)`).
- **pdf.js `_aByT` (Recommendation Summary scoreboard) DELIBERATELY
  STAYS single-trade `_pinTrade`.** This **is Option A, by design:** the
  scoreboard counts each rec once so its per-trade rows still sum to the
  Total row. The Total row is computed from flat `pooledRecs` so it is
  always truthful regardless. **Do NOT switch `_aByT` to `_pinTrades`**
  — that is Option B (per-trade rows would visibly exceed Total) and was
  explicitly rejected after a side-by-side demo
  (`ARENCON_RecFanout_Decision_Demo.html`).
- Previously-Closed-Recommendations table unaffected (separate
  non-trade-grouped path).
- pdf.js `_pinTrades` doc-comment updated: body fans out (deficiency +
  rec); only the Rec Summary scoreboard stays single-trade (Option A).
- On-screen rec note corrected: was "Each appears once" → now "A
  recommendation on a multi-trade contractor is listed under each of
  that contractor's trades; the PDF carries them as their own section."
- **SUPERSEDES** the S146/S147-folded "Recommendation grouping stays
  SINGLE-trade … recs do NOT fan out yet" rule and the deferred-list
  line "B1 recommendation-section fan-out — recs still single-trade".

### 2. D1 pagination — Option #1 per-trade keep-together (commit `0dc4a558`, SW v449)

Files: `frt/js/export/pdf.js`, `sw.js`. Two additive pieces; no rewrite
of defended internals.

- **Pre-pass** before `contentBlocks.forEach(_flowBlock)`: for each
  main-body `tradeHeader`, sum `_measure(...)` of it + every block up to
  the next `tradeHeader`; stash the total on the block as `_secH`. Pure
  measurement (idempotent scratch zone). `_secH` is a new block property
  — verified zero prior collisions.
- **One guard** at the top of the `tradeHeader` branch of `_flowBlock`,
  before the existing (unchanged) logic:
  ```
  var _secH=block._secH||0,_freshCap=PAGE_H-COMPACT_HEADER_H;
  if(_secH&&_secH<=_freshCap&&avail<_secH&&curUsed>PAGE_H*0.15){
    _finalizePage();_startPage();avail=PAGE_H-curUsed;
  }
  ```
  A whole trade that would start near a page bottom and break is forced
  to a fresh page — **only** when it fits a fresh page (`_freshCap` =
  the engine's own existing single-block ceiling) and the page is not
  already near-empty (`curUsed>PAGE_H*0.15`, the engine's own idiom at
  lines ~959/962). On page 1, `curUsed=FULL_HEADER_H` so a first trade
  too big for the page-1 remnant correctly moves to page 2.
- An over-page-length trade still splits (unavoidable; unchanged).
  bin-pack / `go(pg)` / dc-split / restamp / the `avail<blockH+200`
  header guard ALL untouched. `_buildCSS` proven byte-unchanged (balance
  asserted for `_buildCSS("")` AND `_buildCSS("AAAA")`).
- **Recommendations pagination UNCHANGED** — the pre-pass only annotates
  `contentBlocks`; `recBlocks` flows separately and its tradeHeaders get
  `_secH||0`=0 → guard inert. Recs already get a forced fresh page as a
  whole section. **D1 is deficiency-body only.**
- Decision aid produced (not pushed): `ARENCON_D1_Pagination_Demo.html`.
- **Closes** the S144/S147-folded deferred item "S144 D1 pagination —
  NOT built." As shipped it is finer-grained than the original "whole
  deficiency *section* to page 2" framing — granularity is per *trade*.

### 3. exportview dark-mode input contrast (commit `8afae427`, SW v450)

Files: `frt/js/export/exportview.js`, `sw.js`.

- The `#exv-style` injected sheet: the two input rules
  (`.exv-fld select,.exv-fld input[type=text]`; `.exv-add input`)
  changed `background:var(--bg,#fff)` → `background:var(--card,#fff)`.
  In dark mode the modal panel `.exv-w` is `var(--bg)` (near-black
  `#0f1318`) and the inputs were the same near-black → invisible field /
  low-contrast text. Inputs now sit on the elevated `--card` surface,
  consistent with `.exv-lock`/`.exv-c`/`.exv-prev` in the same sheet;
  light-mode `#fff` fallback preserved.
- Panel `.exv-w` deliberately LEFT `var(--bg)` (it is the base surface;
  inputs must contrast against it). `--panel` count remains 0 (S146
  retirement intact).
- This is exportview's OWN injected JS-string sheet — **not frt.css**.
  No `frt.css?v=` bump; **no Style Guide delta** (the §B-S146
  export-modal canon note already records `--panel`-forbidden /
  `var(--card)` surfaces / the FRT type idiom — S148 simply brings the
  two input rules into line with that already-canon note).
- **Closes** the S147-folded flagged item "exportview.js dark-mode
  input contrast — `.exv-fld select,input` use `var(--bg)` near-black".

### 4. Validation & push (all green)

- `node --check` exit 0 on every changed JS file, local AND
  remote-fetched, every push.
- pdf.js `_buildCSS` brace-balance asserted for `""` AND `"AAAA"` —
  proven byte-unchanged by the D1 change.
- exportview.js brace-balanced 98/98; exactly 2 input-rule swaps; 0
  remaining `var(--bg)` in the input rules; 0 `--panel`.
- Option-A invariants asserted by grep (`_aByT` single-trade, `_rByT`
  plural, `recCount` outside the fan-out loop).
- Concurrent-writer-safe atomic push (HEAD re-assert → byte-identical
  verify of targets at baseline vs moved HEAD → blob→tree→commit
  parent=[HEAD] → PATCH ref `force:false` → post-verify) — protocol
  unchanged; Training Center workstream is an active concurrent writer.

### 5. Net live triad

HEAD `8afae4270b6f5d884758a0a4148cc06668ccc2a2`, SW `arencon-frt-v450`,
`frt.css?v=342` (unchanged). No code pending at S148 close.

---

---

# Session 149 Additions — Activity Log dark-mode fix · viewport-windowed level-canvas REFRAMED · blank-project race ACCEPTED RISK · plain-language rule (AS-SHIPPED)

> Live at S149 close: **HEAD `4229cd3de1cf8343dac1d11072b240ddd74fe91a`,
> SW `arencon-frt-v451`, `frt.css?v=343`.** One real code fix shipped
> + two documentary decisions on items previously carried as "to fix".
> Concurrent Training-Center / Supabase workstream pushed
> `8afae427` → `0506bef4` mid-session; all 4 FRT target files verified
> byte-identical at baseline vs the moved HEAD, re-parented `force:false`,
> post-verified.

### 1. Activity Log dark-mode colour/contrast — SHIPPED & Mark-confirmed

- **Root cause:** `_buildActEntryHtml` (`frt/js/ui/deficiencies.js`)
  baked the row background + label colours inline (light-only) and gave
  the body-text div **no colour at all** → in dark mode a light box
  with invisible body text (Contractor Response / ARENCON Comment rows
  in the pin-footer Activity Log AND per-obs threads — single centralized
  builder, so one fix covers both surfaces).
- **Fix:** replaced inline baked colours with theme-aware classes
  (`.act-entry.act-ctr` / `.act-entry.act-con`, `.act-ent-lbl`,
  `.act-ent-txt`); added light + **muted** dark rules to `frt.css`.
  ARENCON label muted from bright `#1565C0` → `#2C4A6B` (muted-colour
  rule compliance — in scope, flagged to Mark). Light-mode appearance
  otherwise unchanged; dark mode now readable + muted both modes.
- Files: `frt/js/ui/deficiencies.js`, `frt/css/frt.css`,
  `frt/index.html` (`?v=342→343`), `sw.js` (`v450→v451`).
- Style Guide §ACTIVITY LOG (the `.act-entry` token block) now lives
  in the canonical Style Guide at this position; this is the only S149
  Style Guide change.

### 2. Viewport-windowed level-canvas — REFRAMED in canon (no code change)

Read-only investigation at HEAD established that the architecture
**is already built & live** (S132 `_computeWindow` / `_rewindowLevelCanvas`
in `frt/js/viewer/tiledPdf.js` + `frt/js/shared/deviceBudget.js` tiers
phone 8 / tablet 12 / desktop 30 MP). The previously-carried
"deferred S131/S132, not built, open" entry was **stale — an S107-class
dead-code trap.**

The real-world blurry+laggy *old* drawings on Mark's project **4380.24**
were diagnosed from Mark's on-device diagnostic overlay (`render#0`,
`tiles: 0/800 peak:0`, `scale 0.000`, `draw 0x0`) as the tiled renderer
**never engaging → flat-image fallback** (blurry zoomed-in; ~240 MB
single-image layer = the lag). Cause: 4380.24's huge dense sprinkler
PDFs almost certainly failed/timed out in the tile-maker at upload →
no tile pyramid was produced.

**Fix path = (re)generate tiles for the affected old projects; NO
viewer code change is needed or appropriate.** Treat the pin/markup-swap
feature (re-upload identical PDF → fresh sharp tiles + pins/markup
re-pointed 1:1) as the proper, low-risk way to fix 4380.24. Until that
ships, the read-only investigation is the authoritative record.

### 3. Blank-project load race — ACCEPTED RISK (no code change)

Read-only trace of the live Hub-mode boot path: `pull()` does an
unconditional `Model.setProject(cloud)` (no merge on initial pull;
`merge3` only runs on the push 412 path). Residual = unpushed edit
made in the gap between IDB fast-path render and the first cloud pull.

**Mark-confirmed deliberate decision: ACCEPTED RISK, documented, code
untouched.** Rationale:
- pure no-signal case self-protects (pull never completes → local kept);
- only narrow flaky-signal residual;
- three existing guards (S129 ordering / S132 `_isBlankSnapshot` / S126
  `_guardEmptyArrays`);
- no reported real loss;
- `sync.js` is the single highest-blast-radius file;
- a non-behavioural "flight recorder" was considered and **declined**;
- revisit only with field evidence in a dedicated session.

### 4. Memory canon updates

- Consolidated the two PEO-title notes into one (now reads: LET under
  PEO, NOT P.Eng, NOT a fire protection engineer, PEO directory search
  "Zhendong (Mark) He").
- New rule canonised: **Mark is NOT a coder — explain everything in
  plain, non-technical language, lead with real-world meaning, avoid
  code jargon/file/function names unless explicitly asked.** Default
  for all technical discussion.

### 5. Net live triad

HEAD `4229cd3de1cf8343dac1d11072b240ddd74fe91a`, SW `arencon-frt-v451`,
`frt.css?v=343`.

---

# Session 150 Additions — Recommendation = AMBER · Clickable star (all 3 views) · S150g no-refresh in-place flip · Per-observation rec DECIDED (AS-SHIPPED, reconstructed)

> Live at S150 close: **HEAD `1bd07bc5f719e1b82148e5e8ff4f4a3ceaf249cc`,
> SW `arencon-frt-v458`, `frt.css?v=348`.** S150 a–g shipped, pushed,
> post-verified, Mark-confirmed on-device. The S150 conversation hit
> its length limit before a handoff/delta file could be exported; the
> content below is reconstructed from references in the S151/S153 PK
> deltas + the S149/S151 handoffs + the live `frt.css?v=354` at HEAD
> `bfa40c40` (which contains the §49 / §50 blocks byte-accurate).

### 1. Recommendation colour = AMBER — APPROVED MUTED-RULE EXCEPTION

The recommendation visual language moved from slate-grey to a vivid
burnt-amber. **This is a deliberate, Mark-approved EXCEPTION to the
muted-colours rule, SCOPED TO THE RECOMMENDATION SIGNAL ONLY.** No
other tool/region may cite this as precedent to go bright.

Exact tokens (see Style Guide §49):
- `.dfx-trade-banner.recs` / `.dfx-ctr-banner.rec`:
  light `#BC7327` / dark `#915E2C`
- `.dfx-rec-sub`: light `#C5843A` / dark `#7E5734`
- `.rec-badge`: `background: rgba(188,115,39,.18); color: #9A5E1C`
  (light) / `color: #D0A064` (dark)
- `.dfx-bv-rec`: `color: #9A5E1C; background: rgba(188,115,39,.16)`
  (light) / `color: #D0A064; background: rgba(208,160,100,.18)` (dark)
- `.pin-rec-toggle.is-rec` (active): amber family

`.dfx-rec-ctrchip` deliberately **left neutral** — it signals
contractor, not rec-ness. Do not recolour it amber.

### 2. Clickable recommendation star — now in ALL THREE views

- **Detailed / pin-editor:** pin-strip star (`.pin-rec-toggle.is-rec`) —
  pre-existing, now amber.
- **Table view:** NEW leading star column (`.dfx-tbl-star-c` cell with
  `.dfx-tbl-star` button). The old inline "REC" **text** badge in the
  Table Trade cell is **REMOVED** at S150 (redundant with the star).
- **Board view:** NEW clickable star, replacing the static `.dfx-bv-rec`
  REC span (the Board static span is later fully retired at S153).

A `dfx-goto` guard ensures a star tap **only** toggles — it never also
opens the focused pin. Tapping anywhere else on the card still opens
it.

### 3. S150g — `.dfx-rec-changed` no-refresh in-place flip cue

When a rec star is toggled in a list view the list deliberately does
**NOT refresh** (so a mis-tap is one tap from undo and the card never
vanishes). The `.dfx-rec-changed` class (subtle amber left-accent +
faint tint via `inset 3px 0 0` box-shadow) marks any card whose star
was toggled since the last refresh. Cleared automatically on the next
full re-render (leave & return, or change view/pivot/filter).
Implemented via the `_recHoldUntilNav` flag in `deficiencies.js`.
**Accepted trade-off:** top counts intentionally lag the rec-star
state until the next deliberate render.

### 4. S150f — real-Unicode-glyph rule (canonical execution rule)

`str_replace`/`create_file` write backslashes **literally**. A single
`\uXXXX` inside a JS string literal renders the glyph correctly; a
**double** `\\uXXXX` produces the literal text `\uXXXX` on screen
(this shipped as a visible bug in the Table star at S150e, fixed
S150f). **Rule:** insert real Unicode characters (★ ☆ —) directly via
a Python edit — never rely on `\u` escapes through str_replace.
Re-confirmed S151.

### 5. Per-observation recommendation — DECIDED Option 1 (split-pin)

At S150 close, `isRecommendation` was still **per-pin in code**, but
the decision was **locked to move to per-observation** with a
split-pin layout. A future session must NOT treat per-pin as
permanent canon. This decision is the seed for S151's steps 1–2.

### 6. Net live triad

HEAD `1bd07bc5`, SW `arencon-frt-v458`, `frt.css?v=348`.

---

# Session 151 Additions — Recommendation per-observation steps 1–2 of 6 (PAUSED) · `esc()` hardening · single-route Back-to-pin chip (AS-SHIPPED)

> Live at S151 close: **HEAD `8af34abf8b621ebaf2f4496e7d8dd967a19e65c1`,
> SW `arencon-frt-v463`, `frt.css?v=348`** (unchanged from S150; S151
> Style Guide is documentary only — `#dv-return-pin` is inline-styled
> in viewer.js). Steps 1–2 of 6 shipped then paused to ship live bug
> fixes; steps 3–6 (on-screen split / PDF split / preview split /
> tests) remain NOT done.

### 1. Recommendation is now PER-OBSERVATION (decided + half-built)

- **DECISION (LOCKED, do not re-litigate):** recommendation moved from
  a pin-level flag to a **per-observation** flag. Pin-level
  `defic.isRecommendation` is **retained as an auto-maintained DERIVED
  ROLLUP** (true iff any obs is a recommendation) — phased/safer
  transition so legacy readers, JSON round-trip, merge, and the
  report/preview keep working through the migration.
- **Report behaviour = SPLIT THE PIN.** A mixed pin shows its non-rec
  obs in its trade/deficiency section and its rec obs in the pooled
  Recommendations section; **full pin header repeated in both
  sections** (each section stands alone — safe for recommendations-only
  export). Numbering stays **#1A / #1B**, identical in every section
  and on the drawing. Each obs counted **once** in its own section
  (no double-count).
- **CURRENT-TRUTH status (critical):** as of S151, steps 1–2 are
  live — the data model is per-obs and the on-screen STAR is per-obs
  in all three views — but **layout/report still group by the pin
  rollup**. The on-screen split (step 3), PDF split (step 4), preview
  split (step 5) and test rewrite (step 6) are **NOT done**.
- **Migration:** legacy projects backfill every obs's
  `isRecommendation` from the old pin-level flag (a legacy
  recommendation pin → all its obs become recommendations). No data
  lost; idempotent.
- **API:** `Model.setObsRecommendation(deficId, obsIdx, val)` sets one
  obs and recomputes the rollup. `Model.setRecommendation(deficId, val)`
  retained as the whole-pin convenience (sets every obs) — used by the
  add-deficiency modal (fresh pin = one obs). Per-obs
  `isRecommendation` deliberately does **NOT** inherit from sibling
  obs in `addObservation` (unlike priority/trade) — rec classification
  is a deliberate per-item routing decision.
- **DROPPED (Mark, S151):** (a) restricting an obs's trade dropdown to
  its contractor's trades — any trade is allowed; (b) the off-trade
  gold-frame card warning — moot, the pooled "Other Trade Items"
  group is itself the "assign a trade" reminder. Do not build either.
- Terminology unchanged from S142: **"Other Trade Items" / "items
  with no trade"** — never "Untagged" in user-facing strings.

### 2. `esc()` hardening — canonical (Bug C root fix)

- `esc(s)` in `deficiencies.js` is now
  `(s == null ? '' : String(s)).replace(/&/g,…)…` — it coerces
  non-strings before `.replace`. **Rule:** `esc()` is safe for numbers
  (e.g. `esc(d.num)`), strings, null, undefined. Do NOT revert to the
  old `(s||'').replace` form — that crashes on Number args and on
  `esc(0)` silently emptied. `esc(0)` now correctly renders `"0"`;
  `esc(null/undefined/'')` still → `''` (unchanged).
- **Why it was latent:** the bad form predated S151 (proven by diff —
  not introduced by the per-obs work). It only began crashing once
  the S150/S151 Table/Board card-click routed into `_openPinFocus`
  (`esc(d.num)`). **Lesson:** a one-way "jump" can expose a long-
  dormant defect — when wiring a new entry path into old code, audit
  the helpers it newly reaches.

### 3. Single-route "← Back to pin #N" navigation — canonical pattern

- **Scope rule:** this is a deliberate SINGLE-ROUTE return, **NOT** a
  navigation/back-stack. Exactly one remembered origin (pin id +
  origin tab), cleared whenever the drawing viewer closes by any
  means. A general tool-wide back-stack is explicitly OUT of scope
  (too large / risky for `viewer.js` + `deficiencies.js` + `app.js`
  under budget) and, if ever revived, is a dedicated design-first
  session.
- **Mechanism (canonical, don't "simplify" away):** the `view-pin`
  handler records the pin AND the active `.nav-tab` `data-tab` — but
  only when the focused-pin modal is actually open (a real jump, not
  a plain list "view on drawing"). Viewer shows `#dv-return-pin`, a
  fixed finger-sized burgundy chip (no hover dependency — field
  tablets). Tapping it: capture pin+tab → `initViewer.close()` →
  restore origin tab via the real `.nav-tab[data-tab]` click (reuse
  the app's own tab switch, never duplicate tab logic) → reopen the
  focused pin via `window._frtOpenPinFocus`. Auto-clear is hooked in
  `initViewer.close()` (one line, no close-logic change).
- **Why origin-tab restore exists:** `_frtNavigateToPin` switches the
  app to the Drawings tab; without restoring, closing the reopened
  modal stranded the user on Drawings instead of Board/Table. Board,
  Table and Detailed all live under the single `deficiencies` tab.

### 4. Bug A / Bug B — pre-existing, NOT fixed at S151

- **Bug A (#3-B Site General report/screen mismatch):** diagnosed, NOT
  fixed. Almost certainly an inherited-contractor display mismatch
  (per-observation contractor inheritance — the on-screen dropdown
  shows the pin's inherited contractor while the report derives that
  obs by its own (empty) contractor → "Site Records"). Confirm with
  a console read of pin's obs `contractorId` per obs before fixing —
  do NOT guess. Best fixed during/after step 3–4 of the per-obs
  rebuild.
- **Bug B (Board card drag-and-drop gone):** pre-existing (no Board
  card drag exists at HEAD `1bd07bc5` either — predates S150/S151).
  **Subsumed by the S152/S153 Board rework** — do NOT patch
  separately.

### 5. CURRENT-TRUTH supersedes (S151)

- Recommendation is **per-observation** at the data + on-screen-star
  level (S151 steps 1–2 live); pin-level flag is a **derived rollup**.
  Layout/PDF/preview split = decided but NOT yet built. Supersedes the
  S150 "per-pin in code" entry.
- `esc()` coerces non-strings — supersedes any reference to the old
  `(s||'').replace` form.
- A single-route Back-to-pin chip (`#dv-return-pin`) exists in the
  drawing viewer; it restores both the focused pin and the origin tab.
  No general back-stack exists or is sanctioned.

### 6. Net live triad

HEAD `8af34abf`, SW `arencon-frt-v463`, `frt.css?v=348`.



## Supersedes Index — S132→S146 (recovered)

Single authoritative pointer for every item that changed across
S132–S146. Later session always wins.

| Topic | Authoritative state | Superseded sources |
|---|---|---|
| Tile renderer | Azure **Function** `arencon-pdf-render`, **pdfium v2.2.1**, Canada Central. `LEVEL_WIDTHS=[256,1024,2560,6144,12288]`, `losslessLevels:[3,4]`, WebP. Verify via `/api/health`. | mupdf/container `arencon-pdf-render-v3` text (S107/S113) — historical only |
| L2 tile grid / edge-tile 404 | RESOLVED (S112 / operational) — not open issues | "Known issues remaining" filings |
| Sync atomicity / CRDT merge | DONE (If-Match + 412 + merge.js 3-way + showConflictModal) | any "unfinished" framing |
| R2 project id | Canonical = Hub `?project=` UUID; `proj.id` standalone-only, never an R2 key part | any path built from `proj.id` |
| sync.js merge3 | Runs in sync worker (`SyncWorkerHost.merge3Worker`); `sync.js` does NOT import merge3 | direct-import assumptions |
| Trade grouping model | **Contractor-scoped** trades, **6 defaults** (`Sprinkler, Fire Alarm, General Contracting, Electrical, Mechanical, Civil`, S142) | S133 obs-tagged 8-trade life-safety model; S135 4-list |
| Trade board / contractor UI | **S142 §2 ClickAssign `crx-` Contractor Roster** (pill strip + `+ trade ▾` + 2-up grid + click-⊕ pick-mode) | S134 kanban Trade Board; S136 picker; **S141 B2f persistent roster** — all retired |
| `TRADE_LIST` default | **6 prebuilt** `Sprinkler, Fire Alarm, General Contracting, Electrical, Mechanical, Civil` (S142) | S135 4-list incl. "Building Conditions" |
| Trade column header color | (moot — no kanban columns) historically taupe `#7B6F5A` | S134 navy for the board |
| Contractor color source | `contractor.color` (8-color muted palette) drives `crx-` chip/tag + group header | legacy `getContractorColor`/`_CTR_PALETTE` (now PDF + Deficiency-Log-table only) |
| `.ctr-card`/`.picker-chip` style | retired with the kanban board (S142) | S134 4px border; S136 renumber-pill |
| Deficiencies tab cards order | **Trade Board (now Roster) → Deficiency Log → Deficiency List** | any earlier order |
| `#defic-toolbar` | Removed. Renumber NOT in the control bar — **merged into the PDF export modal** (amber toggle, default ON, S139); `#defic-renumber-btn` removed from markup (S139 F), handler inert | S137 slim toolbar; S137-POLISH control-bar Renumber |
| Control bar / content boxing | Flush — `.defic-control-bar` single `border-bottom`, `.defic-content` flush | S134 box-framed treatment |
| Detailed-view structure | **Model 2 (S140): 3 disjoint sections** — Deficiencies (navy trade → taupe ctr → cards; no-trade → steel "Other Trade Items") / pooled **Recommendations** (grey band → `.dfx-rec-sub` subheads → inline `.dfx-rec-ctrchip`) / **Site Records** (muted-slate band + INTERNAL pill + dimmed) | S134/S137/S138 in-place REC-badge + grey within-trade sub-band + "Site General · Recommendations" bottom band |
| Rec render model | **Model 2 pooled, disjoint, each rec exactly once** (S140 on-screen / S142 PDF) | S138 "rec never relocated, only a badge in place" — REVERSED |
| Rec filter | **3-state `.dfx-recmode`** segmented (Deficiencies / Recommendations / Both), uniform across Active+Closed | S138 "Recommendations only" checkbox `#dfx-reconly` |
| "Untagged" (user-facing) | **"Other Trade Items"** / "Items with no trade" / "No trade assigned" — literal "Untagged" gone (S142). Internal `untagged*` identifiers retained | S134/S139 "Untagged" wording |
| Site General | **Site Records** (`SITE_RECORDS_LABEL`; rename only, no flag, no migration); excluded from external PDF unless opted-in | "Site General" naming + tab |
| Contractor delete | **Non-destructive everywhere** — `deleteContractorAndReassign` moves deficiencies → Site Records; `removeContractor` UI-unreachable (S140) | any destructive-splice path |
| PDF header bands | **ALL primary bands navy `#2A3A5C`** — `.th-band`, `.st th`, `.sh`, Previously-Closed header (S142). `.th-band.recs` grey `#6B7280`. Burgundy `#9C2742` = **accents only** | S139 "Previously Closed only" recolor (too narrow); pre-S142 burgundy `.st th`/`.sh` |
| PDF recommendations | **S144/S145 reconstruction**: Deficiency Summary = deficiencies-only; NEW **Recommendation Summary** table (Total/Open/Closed); rec body uses the **main-report grammar** — navy `.th-band` trade → taupe `.ch` ctr → `.dc` cards (grey rec theme dropped); **"Previously Closed Recommendations"** split; **always-on `.rec-foot`** note; recs-only title `Field Review Report-Recommendation #N`. **S148 Option A:** the active rec section **body** grouping `_rByT` fans out via plural `_pinTrades` (exact idiom match to the deficiency main body); the **Recommendation Summary scoreboard `_aByT` stays single-trade `_pinTrade` by design** so its per-trade rows sum to Total. Previously-Closed-Recommendations table unaffected (separate non-grouped path) | **S142 pooled grey-themed layout** (`.th-band.recs`/`.rec-cap`/`.rec-sub`/`.rec-ctrchip` now dead in live pdf.js — keep for provenance, do NOT re-emit); S139 in-trade `.rh`/`.th-band.sgr`; the S146 "rec body single-trade" state (superseded S148) |
| PDF Recommendation Summary / Previously Closed Recs | **NEW S144/S145** — Rec Summary built from the SAME `recByTrade`/`recOrder` the section emits; rec closed in a *prior* instance → "Previously Closed Recommendations" table (mirrors deficiency Previously Closed Items); Rec Summary still counts ALL recs. **S148 Option A:** the Rec Summary scoreboard `_aByT` deliberately stays single-trade `_pinTrade` (each rec counted ONCE) so per-trade rows sum to the Total row; the Total row is computed from flat `pooledRecs` so it is always truthful. The Rec Summary is therefore NOT a mirror of the (now fanned-out) rec body — by design | (new — did not exist pre-S144); **do NOT make the Rec Summary fan out to mirror the body — that is Option B, rejected S148** |
| PDF deficiency-body pagination | **Per-trade keep-together (S148 D1, Option #1)** — pdf.js: a pre-pass before `contentBlocks.forEach(_flowBlock)` measures each main-body trade section (`tradeHeader` + every block up to the next `tradeHeader`) and stashes `_secH`; ONE guard at the top of the `tradeHeader` branch of `_flowBlock` forces a fresh page when a whole trade would otherwise start near a page bottom and break — **only** when it fits a fresh page (`_freshCap = PAGE_H-COMPACT_HEADER_H`, the engine's own ceiling) and the page is not near-empty (`curUsed>PAGE_H*0.15`, the engine's own idiom). An over-page-length trade still splits (unavoidable, unchanged). On page 1, `curUsed=FULL_HEADER_H` so a first trade too big for the page-1 remnant correctly moves to page 2 | **S144/S147 deferred "S144 D1 pagination — NOT built" — DONE S148 (Option #1)**; bin-pack / `go(pg)` / dc-split / restamp / the `avail<blockH+200` header guard ALL untouched; `_buildCSS` byte-unchanged (asserted); **Recommendations pagination UNCHANGED — D1 is deficiency-body only** (the pre-pass only annotates `contentBlocks`; `recBlocks` tradeHeaders have no `_secH` so the guard reads 0 and is inert; recs already get a forced fresh page as a whole section); `_secH` is a new block prop, verified zero prior collisions |
| PDF rec section title | **Option I (S145):** `.rec-secttl`/`.rec-secttl-ttl` (15pt navy `#2A3A5C`)/`.rec-secttl-sub` (10pt `#5A6473`), **no box/bar/fill**; scope sentence verbatim canon | S144 §6 OPEN (Mark rejected `.sh` + thin-divider); never use `.sh` for the rec title |
| PDF REC chip placement | **Right header cluster** via `.dc-hdr-l`/`.dc-hdr-r` split (S144/S145) — order inspector → contractor → REC → status pill; card left = `#num` only | S142 REC chip in the left group beside `#num` |
| PDF report title override | **`p.info.reportTitleOverride`** (project data, not code) → custom client title with no redeploy; report `#N` appended downstream, never part of override (S144/S145) | (new) |
| PDF export entry point | **`frt/js/export/exportview.js` `initExportView.open()`** (NEW module, S145) — all 3 PDF buttons route here; role-grouped distribution (Owner/Contractors/Other, Site Records excluded), plain-language Scope, editable title; persists `p.distribution[]` + `p.info.reportTitleOverride`. Imports Model/isSiteRecordsName/initPDFExport/initDeficiencies/toast — **no app.js import (no circular dep)** | legacy `_openPDFPicker` (S145: left **defined but dead/unreachable** — S137 no-delete; future cleanup) |
| PDF trade derivation | **Deficiency listing fans out** via plural `Model.derivePinTrades(d, ctr)` → `obs[0].trade`→`[that]` / legacy `defic.trade`→`[that]` / **all** `ctr.trades` / `[]` (S146; pdf.js local `_pinTrades` mirrors it). **S148 Option A:** the ACTIVE rec **section body** `_rByT` now ALSO uses plural `_pinTrades` (fans out, exact idiom match to the deficiency main body). Singular `pdf.js _pinTrade` = `Model.derivePinTrade(d, parentCtr)` is now used ONLY by the **Recommendation Summary scoreboard `_aByT` (single-trade BY DESIGN — Option A, so per-trade rows sum to Total)** and any other single-trade caller — UNCHANGED | per-obs `r.ctr` override grouping; pre-S146 single-trade-only deficiency grouping (multi-trade ctr + untagged obs wrongly fell to "Other Trade Items"); **the S146/S147 "rec grouping single-trade, deferred" framing is SUPERSEDED — only the Rec Summary scoreboard stays single-trade, and that is final, not a deferral** |
| Trade fan-out (deficiency listing + rec body) | **`Model.derivePinTrades` plural = canonical (S146)** for deficiencies.js `_renderDetailedView` deficiency partition + pdf.js main body. Untagged pin on a multi-trade ctr renders under EVERY assigned trade; screen+PDF agree (non-empty sections). Double-count guard is structural (`_renderDeficLog`/`_deficSummaryHtml` contractor-grouped). **S148 Option A: recs now ALSO fan out** — deficiencies.js rec partition uses `Model.derivePinTrades(e.d, ctrOf(e.ctrId))` (`[NOTRADE]` fallback) and pdf.js active rec section body `_rByT` uses `_pinTrades`; a rec with no trade of its own on a multi-trade contractor is listed under EACH of that contractor's trades. `recCount += e.count` is OUTSIDE the fan-out loop so the master "Recommendations" pill counts each rec ONCE. **The PDF Recommendation Summary scoreboard `_aByT` deliberately STAYS single-trade `_pinTrade` so its per-trade rows still sum to the Total row — this is the essence of Option A, final, NOT a bug** | single-trade-only derivation; **the S146/S147 "recs still single-trade — flagged deferred follow-up" is SUPERSEDED — DONE S148 (Option A)**; do NOT switch `_aByT` to `_pinTrades` (that is Option B — per-trade rows would exceed Total — explicitly rejected after a side-by-side demo) |
| PDF "Report Key" | **"Report Legend"** — 2-col `.rep-key-grid`, no Trade row, no IAR row, reworded gloss; inspector row only when initials (S143 + fix2) | "Report Key" + Trade row + (never-existed) title-page `.legend*` |
| PDF Deficiency Summary | IAR column **removed** (S143 fix2); cols = Summary / Total / New / Outstanding / Closed | S119 table with pink `#FF69B4` IAR column |
| Inspector attribution | **BUILT S143** — per-obs `obs.createdBy`; `.obs-insp-chip` keyed `--ic` (deterministic hash into `CONTRACTOR_COLOR_PALETTE`, NOT `profiles.inspector_color`); control-bar `#dfx-insp-toggle` (default ON, NOT a Layers menu); **PDF 2 modes Off/Initials** | S81–S82 colored-card-border + "modes A/B/C" + `profiles.inspector_color` — LOST/RETIRED |
| IAR feature | Fully retired (UI gone S135) **+ S143 actively clears legacy `iar:true`→false on load** (idempotent, console-only); PDF IAR column removed | all IAR UI/handlers/`toggleIAR`; lingering `iar:true` JSON |
| `+ deficiency` unified modal + `defic.isRecommendation` | ✅ SHIPPED S138 (`d042b40`) | — |
| Renumber→PDF-export merge | ✅ SHIPPED S139 (`9f300a7b`) — control-bar button removed, modal amber toggle (default ON) | — |
| Inline contractor reassign | **`.ctr-banner` `<select>` in Detailed list** → `Model.reassignDeficiency` (S142) | (new) |
| Table/Board click target | **`_openPinFocus` focused single-pin overlay** (`#pinfocus-overlay`, reuses `buildDeficCard`) (S142) | S137 `_dfxGotoPin` jump-to-Detailed (handler inert) |
| Inline modal text scaling | Inline-styled modals follow app S/L via `calc(Npx + var(--ts))` (S142); PDF body locked 11pt | fixed-px inline modal text |
| Export modal (exportview.js `#exv-style`) | **S146 canon:** `--panel` **eliminated** (never a real var — was the dark-mode white-box bug; surfaces use `var(--card,…)` on `.exv-lock`/`.exv-c`/`.exv-prev`/`.exv-f`); modal `max-width 1060px`; ALL text on `calc(Npx + var(--ts))`; **removed** the 4 `.sub` explainers + report-title `.exv-hint` + footer `.exv-f .l` status line; footer right-aligned; `.exv-cancel`/`.exv-go` `6px 18px` muted `#8A4A4A`/`#4A6B5A`. Generate handler byte-unchanged (parity verified). **S148: the input-contrast debt is RESOLVED** — `.exv-fld select,.exv-fld input[type=text]` and `.exv-add input` changed `background:var(--bg,#fff)` → `var(--card,#fff)` so inputs sit on the elevated `--card` surface (consistent with `.exv-lock`/`.exv-c`/`.exv-prev`); panel `.exv-w` deliberately LEFT `var(--bg)` (it is the base; inputs must contrast against it); light-mode `#fff` fallback preserved; `--panel` count remains 0. This is exportview's OWN injected JS-string sheet — NOT frt.css → no `frt.css?v=` bump, no Style Guide delta | the 900px modal with `--panel`, sub-explainers, hint, footer status line; **never reintroduce `--panel`**; ~~*Open debt (flagged): `.exv-fld select,input` still `var(--bg)` near-black in dark*~~ **— RESOLVED S148 (commit `8afae427`, SW v450)** |
| Detailed-view fold | **Collapsible (S146, Mark Option 1)** — trade banner `dfx-fold-trade`, ctr banner `dfx-fold-ctr`, each ctr in `.dfx-ctr-block`, `.dfx-collapsed` + `.dfx-fold-arrow` chevron, top `.dfx-foldall-bar` Collapse/Expand all; recs + Site Records fold too. State `_dfxFoldTrade{}`/`_dfxFoldCtr{}`/`_dfxSectionKeys[]` (module scope, persists across re-renders). Single toggle = direct class/chevron flip (no re-render/scroll-jump); fold-all = state + render() | Detailed view had NO fold S140→S145 (the `_foldedGroups`/`toggle-fold`/`.defic-group-header` mechanism is the **legacy `buildGroup` path only** — not Detailed) |
| Tap-contractor-name-to-focus / collapse-all | **Detailed-view independent fold SHIPPED S146** (above) — there is now a collapse-all affordance. (Phase-6 *tap-the-name-to-focus* gesture itself is a separate, still-open idea — not the same as the S146 banner fold; do not conflate) | S134/S135 "tap-contractor replaces Fold All" framing; S137-POLISH "no collapse-all in interim" |
| Empty trade→ctr sections | **Screen-only scaffolding (S146)** — `_renderDetailedView` seeds every `ctr.trades[]` combo at count 0 so an assigned-but-empty ctr stays open with its `+ Add deficiency` button. Gated `!closedPivot && _dfxRecMode!=='rec' && !_dfxSearch.trim() && !_dfxPri`. **PDF NOT affected (Mark-confirmed)** | (new) — B1 invariant relaxed to "non-empty sections agree; empty scaffolding is screen-only" |
| `+ Add deficiency` trigger | **Parametrized (S146):** `_addDeficTriggerHTML(opts)` no-arg = global (behavior unchanged); `opts.scoped` = compact dashed per-section variant w/ `data-ctr-id`/`data-trade`; `_openAddDeficModal(prefillCtrId,prefillTrade)` prefills only when the value exists as an option | S138 transparent-dashed placeholder card (restyled S146 to a solid obvious button — Style Guide §20) |
| Site General → Site Records | **B2 complete (S146):** ALL user-facing strings → `SITE_RECORDS_LABEL`; ALL sentinels → `isSiteRecordsName()`. **Legacy `'Site General'` string survives ONLY inside the `model.js isSiteRecordsName` predicate** (back-compat for old JSON/cloud — PERMANENT, never remove). pdf.js `_isRealCtr` uses `!isSiteRecordsName(nm)` (coherence) | bare "Site General" naming + tab; raw `=== 'Site General'` sentinels anywhere outside `isSiteRecordsName` |
| Global content width | **`.main-wrap` `max-width:1600px` (S146)** — all four tabs; modest reclaim of side-margin, do not exceed without Mark | `1400px` |
| Dark-mode active burgundy | **`#7C3344` bg / `#F4DDE3` text (S146)** for `.defic-pivot-btn.active`, `.dfx-recmode-btn.active`, `.view-toggle-btn.active`, `.add-deficiency-card .adc-plus`. Light-mode active stays full burgundy `#9C2742` (`.view-toggle-btn.active` light was white pre-S146) | full `#9C2742` on dark (too loud); white `.view-toggle-btn.active` |
| Tap-contractor-name-to-focus | Deferred to **S145/Phase 6** — no collapse-all in interim *(superseded — see "Detailed-view fold" + "Tap-contractor / collapse-all" rows above; S146 shipped independent fold)* | S134/S135 "replaces Fold All" framing |
| Undo/Redo + 3-button leave dialog | Phase 4 (still deferred); leave dialog stays until Undo ships | S134 "leave dialog replaced" framing |
| Detailed-view banners | Flat bands `border-radius:4px`; `.dfx-pingrp` no fill/border (Model 2 adds `.other`/`.recs`/`.records` variants on the same flat-band system) | S134/S137 box-top `6px 6px 0 0` + `.dfx-pingrp` fill+border |
| Card layout | Single-obs == multi-obs (`renderPinStrip=true`), drawing pill left-aligned for ALL pins | S122 single-obs compact layout |
| Addressed stripe | `box-shadow: inset 3px 0 0` (paint-only) | `border-left:3px` (layout-occupying) |
| High board column color | Muted `#A85959` | S134 `#C0392B` (forbidden bright) |
| AI obs-grouping / Summary tab / Site General tab / Bulk Select / Fold All / per-obs AI Review | Retired (S135 Phase 0) | S130/S133 feature set |
| Viewport-windowed level-canvas / blurry-laggy old drawings | **Architecture ALREADY BUILT & LIVE** (S132 `_computeWindow`/`_rewindowLevelCanvas` in `tiledPdf.js` + `deviceBudget.js` tiers). Blurry/laggy *old* drawings (e.g. project 4380.24) = **missing/never-rendered tiles** (live diag: `render#0`, `tiles 0/800`), fix = regenerate tiles via built-in tool, **no viewer change**. Reframed post-S148 investigation. | "deferred S131/S132, viewport-windowed architecture not built / open" — STALE, S107-class dead-code trap; do not treat as unbuilt |
| Blank-project load race (`sync.js`) | **ACCEPTED RISK — deliberate, documented, code untouched (post-S148, Mark-confirmed).** No-signal case self-protects (pull never completes → local kept); residual = narrow flaky-signal only; 3 guards already mitigate (S129/S132/S126); no reported real loss; highest-blast-radius file → bar to touch not met. Revisit only with field evidence. Flight-recorder considered & declined. | "broader load-ordering race still open / to fix" — superseded by the accepted-risk decision |



## Deferred / Carry-Forward Work as recorded at the S148/S154 canon passes (recovered)

# Deferred / Carry-Forward Work (open, not superseded)

> **Provenance note (flagged, not invented):** The S132–S137-POLISH merge
> chain did not include S131, and the canonical base does not carry the
> item below. It is preserved here from the repo's
> `PROJECT_KNOWLEDGE_S131_DELTA.md` + the S137-POLISH handoff carry-forward
> list so the thread is not lost on delta retirement. Mark: confirm scope.

- **FRT v2 — viewport-windowed level-canvas architecture — REFRAMED
  (post-S148 investigation, NOT open as written).** This was carried as
  "deferred from S131/S132, open." A read-only investigation at HEAD
  `8afae427` established the architecture **is already built and live**:
  the S132 `_computeWindow` / `_rewindowLevelCanvas` viewport-windowed
  level-canvas system in `frt/js/viewer/tiledPdf.js` (~lines 712–960),
  plus the `frt/js/shared/deviceBudget.js` single-source memory tiers
  (phone 8 MP / tablet 12 MP / desktop 30 MP). The S131/S132 "build the
  architecture" framing is **stale — do NOT treat this as unbuilt
  (S107-class dead-code trap risk).** The remaining real-world symptom
  (blurry + laggy *old* drawings) was diagnosed this session, from the
  live on-device diagnostic overlay for project **4380.24**, as
  **missing/never-rendered tiles for specific old projects** — not a
  viewer-architecture gap. The overlay showed `render#0`, `tiles: 0/800
  peak:0`, `scale 0.000`, `draw 0x0` → the tiled renderer never engaged;
  the viewer fell back to a single flat raster (acceptable zoomed-out,
  blurry zoomed-in; the ~240 MB single-image layer is the lag). Cause:
  4380.24's huge dense sprinkler PDFs almost certainly failed/timed out
  in the tile-maker at upload (known large-PDF behaviour) so no tile
  pyramid exists. **Correct fix = (re)generate tiles for the affected
  old projects via the built-in migration tool — NO viewer code change,
  low risk.** A residual *tuning* opportunity exists (the `_pickLevel`
  L4 threshold; the `scheduleRender` 60 ms debounce is not rAF-coalesced)
  but the viewer is working acceptably on properly-tiled drawings and
  the disciplined default is not to touch a working render pipeline.
  4380.24 tile regeneration is pending Mark's go (it is a real job, not
  a no-op) plus a one-step read-only storage pre-check that tiles are
  genuinely absent vs present-but-failing.
- **FRT v2 — blank-project load race in `sync.js` — ACCEPTED RISK,
  DELIBERATE DECISION (post-S148, Mark-confirmed). NOT a bug to fix;
  documented, tracked, intentionally left untouched.** Scenario in
  plain terms: on open, the tablet shows its local IDB copy first, then
  the cloud master copy lands and `pull()` does an unconditional
  `Model.setProject(cloud)`. If an inspector edits during that gap and
  the edit has not yet been pushed, the cloud overwrite silently
  discards it (no conflict modal — `merge3` only runs on the push 412
  path, never on the initial pull overwrite). **Why this is accepted,
  not fixed:** (1) the pure "no cell signal" field case is
  *self-protecting* — with no signal the pull never completes, the
  local copy is kept, nothing is lost; the genuine residual is only the
  narrower *flaky/intermittent* signal case (pull fails, inspector
  edits on stale local, signal flickers back, late pull overwrites);
  (2) three guards already mitigate this — S129 ordering (`pull()`
  gated behind `fastPathDone` so the merge base is set first), S132
  `_isBlankSnapshot` (skips blank/placeholder snapshots), S126
  `_guardEmptyArrays` (empty cloud cannot wipe non-empty local arrays);
  (3) carried many sessions with **no actual reported inspector data
  loss** attributable to it (loss is silent, so this is not proof of
  absence — hence "accepted *risk*," documented here so the decision is
  deliberate and revisitable, not a forgotten hole); (4) `sync.js` is
  the single highest-blast-radius area — a wrong change there causes
  *worse* loss than the bug, so the bar to touch it is high and not met
  by an unproven narrow risk. A non-behavioural "flight recorder"
  (instrument-only) was explicitly considered and **declined for now**;
  if real field loss ever surfaces, revisit with that evidence, in a
  dedicated session, before any code change. (See Session 132 Additions
  for the S132 guard.)
- **Queued toolkit tools:** Firefighting Water Supply Calc rural/municipal
  (Mark provides template), NFPA 25 / OFC IT&M Checklists ×3 (sprinkler /
  diesel / electric), Travel Distance & Exit Capacity Calc (OBC 3.4.2),
  FRR Quick Ref (OBC 3.2.2), Occupant Load Calc (OBC 3.1.17).
- **Phased FRT roadmap:** ✅ unified `+ deficiency` modal +
  `defic.isRecommendation` (S138, `d042b40`); ✅ PDF Trade→Contractor
  restructure + hi-rec note + Renumber→PDF merge (S139, `9f300a7b`);
  ✅ **Model 2 structure** on-screen — pooled Recommendations, Site
  Records rename, "Other Trade Items", 3-state filter,
  `derivePinTrade`, non-destructive contractor delete (S140, `v424`);
  ✅ **§2 ClickAssign Contractor Roster** + **Model 2 PDF** (all bands
  navy, pooled recs new page, inline reassign, focused pin panel) (S142,
  `c0c9d353`); ✅ **Inspector attribution** + PDF "Report Legend" +
  legacy-IAR clear (S143, `9c9b3115`); ✅ **PDF Recommendation-page
  reconstruction** — Deficiency-Summary-only, NEW Recommendation Summary,
  navy main-report rec grammar, Previously Closed Recommendations split,
  Option I rec section title, report-title override (S144 design /
  **S145 shipped**, `9dae2589` SW `v441`); ✅ **NEW `exportview.js`**
  canonical PDF-export entry point (role-grouped distribution, plain
  Scope, editable title) (S145); ✅ **B1 trade fan-out**
  (`derivePinTrades` plural — deficiency listing), **B2 Site Records
  rename completion**, **Detailed-view independent fold**, **B3
  export-modal rework**, screen-only empty sections, parametrized
  `+ Add deficiency`, appendix-table 11pt, `.main-wrap` 1600,
  dark-mode burgundy de-loud (S146, `5daeca19` SW `v447` CSS `?v=342`);
  ✅ **S148** rec body fan-out **Option A** (`88cd88e1` SW `v448`), D1
  pagination **Option #1** per-trade keep-together (`0dc4a558` SW
  `v449`), exportview dark-mode input contrast fix (`8afae427` SW
  `v450`) — live triad HEAD `8afae427` SW `v450` CSS `?v=342`
  (unchanged). Both S147-flagged follow-ups + the S144 D1
  carry-forward CLOSED.
  **Still open (carry-forward):**
  - ✅ **B1 recommendation-section fan-out — DONE S148 (Option A).**
    Recs now fan out in the Detailed-view body + PDF active rec
    section (`_pinTrades`); the PDF Recommendation Summary scoreboard
    `_aByT` deliberately STAYS single-trade `_pinTrade` so per-trade
    rows sum to Total. **This split is final and by design — NOT a
    bug; do NOT switch `_aByT` to plural (that is Option B, rejected).**
  - ✅ **exportview.js dark-mode input contrast — RESOLVED S148.**
    `.exv-fld select,.exv-fld input[type=text]` + `.exv-add input`
    `background:var(--bg)` → `var(--card)`; inputs now on the elevated
    surface; panel `.exv-w` left `var(--bg)` by design; not frt.css
    (no `?v=` bump). Commit `8afae427`, SW v450.
  - **legacy `_openPDFPicker` dead code** — defined but unreachable
    since S145; future cleanup (S137 no-delete discipline holds until
    then).
  - **recs-only PDF still emits the drawings appendix** — no S144 spec
    said to suppress; left as-is, confirm acceptable.
  - ✅ **S144 D1 pagination — DONE S148 (Option #1, per-trade
    keep-together).** A whole main-body trade that fits a fresh page
    is not started near a page bottom (pre-pass `_secH` + one
    `tradeHeader`-branch guard); over-page trades still split
    (unavoidable); Recommendations pagination unchanged (D1 is
    deficiency-body only). Commit `0dc4a558`, SW v449. The original
    "whole deficiency *section* to page 2" framing is superseded by
    the as-shipped per-trade granularity.
  - **dead rec CSS cleanup** — `.th-band.recs`/`.rec-sub`/`.rec-cap`/
    `.rec-ctrchip` are dead in live pdf.js (recs use main-report
    grammar) but kept in place; tidy later.
  - S139 QA checklist (Mark runs independently); Undo/Redo Phase 4;
    Phase-6 *tap-the-name-to-focus* gesture (distinct from the S146
    banner fold which IS shipped); Closed Items Summary still listing
    rec rows (confirm acceptable); canvas inspector pin-ring (S82 "outer
    ring" — future separate piece, touches protected
    `pinsGL.js`/`pins.js`); future `profiles.inspector_color` opt-in
    colours.



## Deferred items as of S154 close (recovered)

# Deferred items as of S154 close

**Closed this canon-pass cycle (S149 → S154):**
- ✅ Activity Log dark-mode contrast (S149)
- ✅ Viewport-windowed level-canvas — reframed (S149, no code change needed)
- ✅ Blank-project load race — accepted risk (S149, no code change)
- ✅ Recommendation amber recolour + Table star + Board star + S150g cue (S150)
- ✅ Per-obs rec model + per-obs star in all 3 views (S151 steps 1–2)
- ✅ `esc()` non-string crash (S151 Bug C)
- ✅ Back-to-pin chip + origin-tab restore (S151)
- ✅ Board Rework B1 + B2 + B2.1 + B3 (S153)
- ✅ Bug #1 stale ⊕ toast (S154)
- ✅ Bug #2 unresolved-inspector chip fallback (S154)
- ✅ Bug #3 Hub auto-signout for no-PIN users (S154)
- ✅ Bug #4 PDF closed/outstanding mismatch (S154)
- ✅ Board Rework §2.3 Initials moved to PDF picker (S154)
- ✅ Board Rework §2.1 Option A Deficiency Log collapse (S154)

**Open / Deferred to S155+:**

| Item | Source | Why deferred |
|---|---|---|
| **Per-obs rec rebuild steps 3–6** — on-screen split / PDF split / preview split / test rewrite | S151 | Board rework partially supersedes step 3; step 4 (PDF split) is the real work item; revisit after S155 auth work |
| **Bug #5 multi-obs lane move dispatcher** — split vs whole pin dialog | S153 bug log | Biggest behaviour change of the cycle; needs own commit + on-device gate. Mark's call: proper fix not toast patch |
| **Split-pin `⛓ #N` badge + On/Off control** (default ON) | Board Rework §1 carry | Bundles cleanly with Bug #5 (same surface) |
| **Board Rework §2.4** — sticky lane banners + Hide-Closed compactor + slim jump-nav pivot | Board Rework spec | Biggest remaining Board batch — own session |
| **Board Rework §3** — pin-focused card redesign (clean per-obs cards / property grid / `⋯` overflow / collapsed thread / small "View on drawing" header button) | S152 build spec | Own demo → approve → build cycle |
| **S155 auth overhaul** — mandatory PIN, self-serve reset, admin reset backend (Worker vs Edge Function), recovery email semantics, account-sharing policy | S154 | Promoted to its own session; constraint `service_role` NEVER in frontend stands |
| **`_showInspChip` default state on board** — judgment call after §2.3 removed the toggle UI | S154 §5 | One-line localStorage init flip if Mark confirms |
| **S151 nav-fix round-trip confirmation on-device** | S151 | Awaiting Mark's confirmation Board/Table → pin → drawing → Back-to-pin → close lands back on Board/Table, NOT Drawings |
| **Closed Items Summary still listing recommendation rows** | Pre-S153 carry | Pre-Shaun-Kelly review item; still open |
| **Appendix status-cell forbidden hex colour cleanup** | Pre-S153 carry | Polish; not blocking |
| **PDF title-page legend (Phase 3 C)** | Pre-S153 carry | Likely moot under Model 2 — confirm with Mark |
| **Recommendations-only report summary-table decision** | Pre-S153 carry | If demoing rec-only export |
| **`FRT_REWRITE_BUSINESS_CASE.md` refresh** (future-tense → delivered-vs-promised one-pager) | Pre-S153 carry, Mark's own time | Highest-leverage non-code item before principals review |
| **Pin/markup-swap feature** — whole-project PDF re-upload, fresh tiles, pins+markup re-pointed 1:1 (reuses `drawingMigrate.js` engine; UI + markup carry-over net-new) | S149 carry | The proper, low-risk fix for blurry old drawings (project 4380.24); A or C+D pick still open |
| **Site Records → its own tab + "Both" → "All"** rename | S149 carry C+D | Touches the Model 2 4-state filter machine + PDF Site-Records-excluded canon |
| **Legacy `_openPDFPicker` dead code, dead rec CSS** (`.th-band.recs` / `.rec-sub` / `.rec-cap` / `.rec-ctrchip`) | Pre-S148 carry | Needs Mark's explicit delete OK (S137 dead-handler discipline) |
| **Recs-only PDF still emits the drawings appendix** | Pre-S148 carry | Confirm acceptable |
| **Undo/Redo Phase 4; Phase-6 tap-name-to-focus; canvas inspector pin-ring** (protected `pinsGL.js`/`pins.js`); **`profiles.inspector_color` opt-in** | Pre-S148 carry | All open, unchanged |



## Trade-model & Deficiencies-tab design history (S133→S138, recovered)

# Session 133 Additions — Trade-Based Grouping (DESIGN ONLY)

> ⚠️ **SUPERSEDED BY SESSION 134.** The S133 obs-tagged 8-trade design below
> was reset in S134 to a contractor-scoped 4-trade model. This section is
> retained for audit trail. For the LIVE trade design read Sessions 134–137-POLISH.
> Items from S133 that survived unchanged (repeat-count chip, sibling-trace,
> destructive-button outline rule, mini-map unchanged) are still in force.

### S133 design (superseded — historical)

Original design tagged every `obs` with `trade` / `tradeSource` / `repeatCount`, an 8-trade life-safety list (`Fire Alarm, Sprinkler, Standpipe, Fire Pump, Smoke Control, Passive/Separations, Kitchen Hood, Extinguishers`), Trade→Contractor→cards hierarchy, multi-obs sibling-trace with letter suffixes, repeat-count chip replacing IAR, AI `trade_tag` worker mode + `ai_trade_corrections` Supabase table, and a title-page legend. **S134 replaced the 8-trade obs-tagged core with contractor-scoped trades (4 defaults).**

### S133 elements that REMAIN IN FORCE (not superseded)

- **`obs.repeatCount`** (default 1) — auto-incremented on FRT save when an obs carries forward still-outstanding; closed-then-reopened counts as 2. Not user-editable. Replaces the retired IAR feature. Repeat-count chip renders BEFORE the priority pill in the card header (reading order `[#11A] [3rd review] [High]`).
- **Sibling-trace** for multi-obs pins spanning different trade/contractor — italic muted purple caption; bold pin labels are scroll-to anchors in the FRT tab, bold-only in PDF; suppressed when sibling is adjacent (same trade + same contractor).
- **Priority/status pills are light-tinted in BOTH light and dark mode** (NOT dark-hatched — was unreadable). `.pill-h/.pill-l/.pill-c/.pill-g`. Pill text is just "High"/"Low"/"General"/"Closed" — never "Outstanding · X".
- **IAR fully removed from UI** (tab + report). `pin.iar` field still readable, never displayed. Silent-degrade existing data, no migration.
- **Outlined-red destructive buttons** standard (`#A85959` border + text, fill on hover) — NOT solid red. Multi-obs pin delete requires type-to-confirm; single-obs uses standard confirm.
- **Mini-map unchanged** — keep `.mini-pin-marker` circle (white border, `left/top %`). The teardrop-SVG demo was rejected. `.dc-mini-pin` in PDF already matches.
- **Per-obs Contractor Response / ARENCON Comment buttons** at OBS level, left-aligned, full names. Pin-level duplicate pair removed.

### S133 deprecations (acted on in S135)

S130 AI section-catalog feature + editor, and the `auto_group` worker mode, were flagged dead in S133 and retired in S135.

---

# Session 134 Additions — Trade Grouping LOCKED DESIGN (replaces S133)

> This is the authoritative trade-grouping design. S135 shipped the schema
> layer, S136 the trade board UI, S137 the unified tab, S137-POLISH the
> layout. Where S134 here conflicts with S136/S137/S137-POLISH, the later
> session wins (see Current-Truth index at end of doc).

### Core model: contractor-scoped trades, not obs-tagged

Trade declaration lives at the **contractor** level. Most obs inherit their trade from their contractor without manual tagging. Per-obs trade override exists for the multi-trade contractor case. Tagging once at the contractor level reduces friction from obs-count to contractor-count (3–5 per project). AI worker becomes optional polish, not load-bearing.

### Data model (S134-shipped)

```js
// CONTRACTOR
contractor.trades: string[]   // subset of project.projectTrades, default []
contractor.color: string      // auto-assigned hex, never user-picked

// PROJECT
project.projectTrades: string[]   // default = DEFAULT_PROJECT_TRADES

// DEFICIENCY
defic.isRecommendation: boolean   // default false — SHIPPED S138 (additive; idempotent backfill in setProject _migrateDeficArr after `delete d.description`, before S119 per-obs backfill; generic merge3 passthrough, no merge.js change; 11 recSchema.test.js, suite 144→155)

// OBSERVATION
obs.trade: string                 // from contractor or manual override
obs.repeatCount: number           // default 1 (S133 chip system)
// obs.tradeSource — DEPRECATED. Derive: trade === contractor's trade → 'inherited'; else 'manual'
```

### Default trade list — REDUCED 8 → 4

```js
const DEFAULT_PROJECT_TRADES = ['Sprinkler', 'Fire Alarm', 'General Contracting', 'Building Conditions'];
```

Replaces the S133 8-trade life-safety list. Standpipe/Fire Pump/Extinguishers/Smoke Control/Kitchen Hood/Passive-Separations are NOT defaults — they roll up under Sprinkler or General Contracting ~99% of the time. Users add custom trades per-project via the trade board's `+ trade` column.

### Migration policy — lossless tolerance

- Existing contractors → `trades: []`, `color: <next unused from palette>`.
- Existing projects → `projectTrades: <default 4>`.
- Existing out-of-list `obs.trade` values ("Standpipe", "Fire Pump", "Extinguishers") stay as-is in JSON; the obs dropdown shows the current value italicized if not in `projectTrades`.
- `obs.tradeSource` reads removed; writes preserved one session, then field removed.
- Legacy `iar:true` continues silent-degrade; UI rendering removed in Phase 0 (S135).

### Trade board UI

> ⚠ **SUPERSEDED by S142 §2 ClickAssign (see the Session 142 section).**
> The S134 kanban-column trade board AND the S141 B2f persistent roster
> are both gone. The ONLY contractor UI is now a single **"Contractor
> Roster"** card: a deletable colour-coded trade pill strip + `+ trade ▾`
> prebuilt dropdown + a 2-up roster grid + a click-`⊕`-then-click-a-pill
> pick-mode assign flow (`crx-` namespace). The paragraph below is the
> retired S134 design, kept for provenance only — do NOT rebuild it.

Kanban section at the top of the Deficiencies tab. Replaces the "Contractors on Site" pill row. One column per `projectTrades` trade + trailing `+ trade` column. Each column: header (trade name + count), N contractor cards (4px colored left border = `contractor.color`), `+ Add contractor` slot at bottom. Multi-trade contractors appear as separate cards in each column, same color. Card body tap → contractor edit modal (rename only; auto-color; delete entirely). Card `×` → remove from THIS column only. `+ Add contractor` → smart picker (existing-contractor chips not in column + new-contractor text input, case-insensitive dup detection). `+ trade` → inline input field (NOT browser `prompt()`). Custom trades get a `×` in their column header. **NO drag-and-drop** (Mark explicitly rejected for mobile/tablet hostility).

### Unified Deficiencies tab — Summary tab retires

The Summary tab is eliminated; Board and Table views migrate into the Deficiencies tab via a view toggle. Layout top→bottom: (1) Trade board *(now the S142 ClickAssign Contractor Roster)*, (2) Control bar, (3) Content, (4) `+ deficiency` card at bottom.

> ⚠ **Rec/Site-General rendering SUPERSEDED by S140 "Model 2".** The
> S134 "untagged + no-contractor → grey 'Site General · Recommendations'
> bottom section" is GONE. Model 2 (live since S140, see Session 140/142
> sections) renders three **disjoint** sections — Deficiencies / pooled
> **Recommendations** / **Site Records** — and no-trade pins land in an
> **"Other Trade Items"** band (the literal word "Untagged" is retired
> everywhere user-facing). Control-bar filter is now the **3-state
> `.dfx-recmode`** segmented control (Deficiencies / Recommendations /
> Both), replacing the S138 "Recommendations only" checkbox.

### Three views

> ⚠ The colour/structure below is the S134 baseline; **Model 2 (S140)
> is authoritative** — see Session 140. Net live state: Detailed = three
> disjoint sections (Deficiencies: navy trade band → taupe contractor
> sub-band → cards; no-trade → steel **"Other Trade Items"** band;
> pooled **Recommendations**: grey band → grey-slate trade subheadings →
> inline contractor chip only when one exists; **Site Records**: muted-
> slate band + persistent "Internal — excluded from client report" pill
> + dimmed cards). Table/Board carry an inline contractor `<select>`
> (S142) and route a row/card click to the focused single-pin panel
> `_openPinFocus` (S142) rather than jumping to Detailed.

- **Detailed (default):** Trade banner (navy `#2A3A5C`) → Contractor sub-banner (taupe `#7B6F5A`) → obs cards. *(Model 2: + steel "Other Trade Items", pooled grey Recommendations, muted-slate Site Records.)* Multi-obs sibling-trace across trades/contractors.
- **Table:** one row per obs — # / Trade / Contractor / Description / Priority / Status / Thumbnail. Contractor color dot before name. *(S142: inline contractor reassign `<select>`; row click → `_openPinFocus` panel.)*
- **Board (priority kanban):** four columns High / Low / General / **Closed** (closed always visible). *(S142: card click → `_openPinFocus` panel.)*

Filters apply to all three views identically.

### Recommendations (`defic.isRecommendation: true`)

> ⚠ **SUPERSEDED by S140 "Model 2" (live).** A recommendation is now
> PULLED OUT of the trade/contractor spine into ONE pooled
> **Recommendations** section (on screen: grey `.dfx-trade-banner.recs`
> band; in the PDF: a forced new page after Previously Closed Items).
> Internal layout = trade subheadings only ("No trade assigned" last),
> with the contractor shown as an inline chip ONLY when one exists —
> never a contractor sub-band. Each rec appears exactly once
> (disjoint from the deficiency sections). The S134/S138 "a rec is
> never relocated, only gains a REC badge in place" rule is **reversed**
> by Model 2 — see Session 140/142. The text below is the retired S134
> design, kept for provenance.

Advisory, doesn't block sign-off. Can have contractor or not, trade or not, pin or not. *(Retired render: has-trade+has-contractor → under that trade→contractor with REC badge; has-trade+no-contractor → "Recommendations" grey sub-banner within trade; no-trade+no-contractor → Site General · Recommendations bottom section.)*

### Unified `+ deficiency` creation

Single dashed-border card at the bottom of every view replaces "+ General Deficiency" and per-contractor "Add". Modal fields: Description (required), Priority, Contractor (optional incl "None"), Trade (optional incl "None"), Pin location (optional), Recommendation checkbox. Inserts at next pin number.

### PDF report

> ⚠ **§2944 STRUCK AND REWRITTEN.** The S134/S139 in-place rec model
> (REC badge in the trade spine, grey "Recommendations" within-trade
> sub-band, "Site General · Recommendations" bottom band) is **fully
> superseded by Model 2 AS-SHIPPED** (S142, live). What follows is the
> live PDF structure; the authoritative detail lives in the Session 140
> + Session 142 + Session 143 sections.

**Live PDF structure (Model 2, S142–S143):**

- **All primary header bands are navy `#2A3A5C`** — `.th-band` (trade
  section), `.st th` (page-1 Deficiency Summary table header — *was
  burgundy*), `.sh` (Appendix "Drawings with Pins" — *was burgundy*),
  and the Previously Closed Items inline header. **Burgundy `#9C2742`
  survives ONLY as accents** (`.dc-itemnum` pin number, `.ph-addr` 2px
  left rule, `.app-dwg-title` 3px left-border). No header band is
  burgundy any more.
- **Trade → Contractor → cards** for deficiencies. Navy trade band,
  taupe contractor sub-band `.ch` (`#7B6F5A`). No-trade pins → steel
  **"Other Trade Items"** band (`#4A5568`-family). Pagination re-stamps
  both bands on continued pages.
- **Canonical trade derivation** (`pdf.js _pinTrade(d)` =
  `Model.derivePinTrade(d, parentCtr)`): `obs[0].trade` → parent
  contractor's **sole** declared trade → `''`. "Parent" = the contractor
  whose `.deficiencies[]` holds the pin (NOT the per-obs override);
  `generalDeficiencies` → null. PDF grouping and the on-screen Detailed
  view now agree.
- **Recommendations are pooled.** Every `isRecommendation` row is
  diverted out of the trade/Other-Trade structure into ONE
  **Recommendations** section emitted AFTER Previously Closed Items on a
  **forced new page**: grey band `.th-band.recs` (`#6B7280`) + count →
  caption `.rec-cap` → per-trade subheads `.rec-sub` in `projectTrades`
  order with **"No trade assigned" LAST** → cards (muted `.rec-chip`
  REC; inline contractor chip `.rec-ctrchip` ONLY when a real contractor
  exists — never a contractor sub-band) → optional italic footer
  `.rec-foot` (export-modal toggle, default ON). Each rec appears
  exactly once.
- **Recs mode** (`_recsMode` ∈ `bottom` | `only` | `exclude`, from the
  export modal): `exclude` strips recs pre-grouping; `bottom` pools as
  above; `only` = recommendations-only report (also suppresses the
  deficiency trade emit, Previously Closed, the closing note, the hi-rec
  note). Italic `.hirec-note` under the Deficiency Summary when any
  high-priority recommendation exists; wording points at the pooled
  section.
- **Site Records gate:** non-recommendation `generalDeficiencies` are
  excluded from external reports unless `includeSiteRecords` (export-
  modal toggle, default **OFF**) OR an explicit Site-General contractor
  filter is active. Recs among generals are never gated.
- **Pagination callback** `_flowBlock` is extracted (was the inline
  `contentBlocks.forEach`); the main body and the pooled recs both reuse
  it. Architectural rule: do not re-inline. `_buildDefCard(r, hdrExtra)`
  takes an optional 2nd param injecting HTML into `.dc-hdr` after the
  priority pill (`''` byte-identical for the two deficiency callers; the
  rec caller passes the contractor chip; S143 inspector chip rides here
  too when initials mode is on).
- **Previously Closed Items** — navy band, neutral `#EEF2F4`/`#4A5568`
  instance row, muted-green `#3F6E55` "Addressed" (the forbidden bright
  `#1A7A4A` was eliminated here). PDF body locked 11pt.
- **Report Legend** (page 1, `.rep-key`, S143 + fix2 — *renamed from
  "Report Key"*): a 2-column grid (`.rep-key-grid`
  `grid-template-columns:1fr 1fr`) injected after the Deficiency Summary
  table, before the hi-rec note, inside `if(reportDefs.length)`. Reuses
  the **literal** report classes (`.th-band.recs`, `.rec-chip`,
  `.pill-h/.pill-l/.pill-c`, `.dc-insp`) as live swatches so the key can
  never drift from output. Rows: Recommendations band (gloss
  "recommendation items - do not hold off sign-off"), REC chip,
  Outstanding-high, Outstanding-low, Closed, and an inspector-initials
  row **only when** `inspTag==='initials'`. **No Trade row, no IAR row**
  (Trade row dropped in fix2; IAR retired since S135).
- **Deficiency Summary table** columns (S143 fix2): Deficiency Summary /
  Total / New This Report / Outstanding / Closed. **The IAR column was
  removed** (the pink `#FF69B4` IAR count is gone). Status-count text
  colours `#1565C0` (New), `#C0392B` (Outstanding), `#1A7A4A` (Closed)
  remain inline in that table — tracked cosmetic debt, untouched.
- **Renumber merged with Generate PDF** (S139, KEPT) — single button;
  the export modal has an amber "Renumber before export" toggle
  (default ON) that runs `Model.renumberDeficiencies()` + re-renders
  pre-export. The control-bar `#defic-renumber-btn` was removed (handler
  left defined-but-inert, S137 discipline).
- **Export modal** (`app.js _openPDFPicker`): 3-way Recommendations
  `<select>` (At bottom / Recommendations-only / Exclude) + "Italic
  footer on Recommendations" (default ON) + "Include Site Records
  (internal)" (default OFF) + amber "Renumber before export" (default
  ON) + 2-option inspector tag `<select>` (Off default / Initials tag).
  Inline modal text scales with app S/L via `calc(Npx + var(--ts))`
  (precedent for future inline modals); PDF body stays locked 11pt.

### Data integrity / patterns (S134 additions — IN FORCE)

- **`contractor.trades` is the source-of-truth for contractor scope.** `obs.trade` computed from it on creation (when contractor has exactly 1 trade) but can be manually overridden. AI worker (if re-enabled) refuses to overwrite manual overrides.
- **`contractor.color` is auto-assigned from the muted palette, never user-editable.** Frees up for reuse on contractor delete.
- **8-color muted palette** (auto-assigned, never user-picked): `['#5C7A6E', '#4A6B8C', '#7B6F5A', '#9C5070', '#6B7280', '#5E2370', '#8B6F47', '#4A8089']`. First unused; cycles after 8 (no enforced uniqueness).
- **Contractor cards use 4px colored left border** *(NOTE: S136 superseded this with the renumber-pill tinted-fill pattern — see S136).* Not used in PDF.
- **`+ deficiency` is dashed-border card style** at the bottom of every view — single source of truth for new-item creation.
- **Trade board column width min 185px**, card padding 5px 8px, font 12.5px.
- **No drag-and-drop anywhere** (Mark explicitly rejected).
- **Tap-contractor-name-to-focus replaces Fold All** *(NOTE: deferred to S145/Phase 6 per S137-POLISH — not built yet; no collapse-all affordance in the interim).*

### NEW FEATURE — Undo/Redo system (Phase 4 — deferred to S142–143)

New module `frt/js/data/undo.js`, 30-action stack, always-visible toolbar buttons (greyed when unavailable). In-memory within session; IDB store `undoStack` keyed `<projectId>:<currentFrtInstance>` across reloads; optional Supabase push (Phase 4.5, deferred). Covers pin/obs/photo add-delete, text edits (debounced 800ms = one action), comment add/delete/edit, priority/trade/contractor/status changes, markup add/delete, contractor add/delete/rename, trade column add/remove. Photo undo: within-session full recovery; cross-session R2 deletion is final (falls back to daily backup commits — acceptable per Mark). UI: `↶` undo with stack-depth badge, `↷` redo adjacent. **The 3-button leave dialog stays until the Undo system ships** (it is tied to Phase 4, not retired in Phase 0).

---

# Session 135 Additions — Phase 0 cleanup + Phase 1a schema (LIVE)

### Version state (end of S135)

SW `v401`, CSS `?v=301`, tests `144/144` (was 106 baseline + 38 new).

### LIVE in `model.js` (Phase 1a — trade schema)

```js
export var TRADE_LIST = ['Sprinkler', 'Fire Alarm', 'General Contracting', 'Building Conditions'];
// ⚠ S142 SUPERSEDES this default: TRADE_LIST is now the 6-trade prebuilt
//   ['Sprinkler','Fire Alarm','General Contracting','Electrical','Mechanical','Civil']
//   ("Building Conditions" removed). pdf.js has zero TRADE_LIST refs. The
//   §1a out-of-list tolerance still renders legacy/custom trades.
export var CONTRACTOR_COLOR_PALETTE = ['#5C7A6E','#4A6B8C','#7B6F5A','#9C5070','#6B7280','#5E2370','#8B6F47','#4A8089'];
export function nextContractorColor(usedColors) { /* first unused, cycles after 8 */ }

project.projectTrades : string[]   // default = TRADE_LIST.slice() (auto-seeded by setProject, idempotent)
contractor.trades     : string[]   // default = []
contractor.color      : string     // auto-assigned hex, never user-picked

Model.setContractorTrades(ctrId, trades)        // replaces array
Model.addProjectTrade(trade)                    // case-insensitive dedup
Model.removeProjectTrade(trade)                 // cascades cleanup to contractor.trades
Model.addContractorToTrade(ctrId, trade)        // atomic add-trade-and-contractor
Model.removeContractorFromTrade(ctrId, trade)   // narrow remove

Model.addContractor()        → trades:[], color auto-assigned from unused palette
Model.addDeficiency(ctrId)   → obs.trade inherited if contractor has exactly 1 trade
Model.addObservation(deficId)→ obs.trade inherited from most-recent sibling with a trade,
                               else single-trade contractor
```

### RETIRED in S135 (Phase 0 — do NOT re-add)

- **`model.js`:** `Model.toggleIAR`, `getGroupCatalog`, `setGroupCatalog`, `setObsGroup`, `applyAiObsGroups`, `clearAllAiObsGroups`, `setDeficGroup`, `applyAiGroups`, `clearAllAiGroups`. KEPT: `_migrateDeficAiGroupToObs(d)` (load-time silent-degrade, one more session).
- **`assistant.js`:** `AIAssist.autoGroupDeficiencies`, `_collectObservationItems`, `_showAutoGroupModal`.
- **`deficiencies.js`:** per-obs `obs-group-badge`/`-empty`, per-obs AI Review button + `ai-review-menu` popup, Bulk Select + `_deficSelectMode`, Fold All + `_allFolded`, IAR pill on cards, IAR column in Deficiency Log table, AI/MAN trade source badge (`.trade-source-mark`), `confirmIARDeactivate` gates, `toggle-iar` handler, "IAR only" filter option, AI Group toolbar button + obs group picker + section catalog editor modal, Summary tab (`#panel-pins` + `data-tab="pins"`), Site General tab (`data-dlc="general"` — now a bottom section of Active view).
- **`frt.css`:** `.iar-toggle-btn`, `.obs-pill.iar`, `.tt-status.iar`, S116-P13 IAR hatch chip, duplicate `.pins-kanban-*` blocks + dark + mobile, `.defic-ai-btn` (3 layered overrides), `.ai-review-pop`/`.ai-rv-*`, `[data-action="ai-review-defic"]`/`.ai-review-chip`, `.trade-banner.manual` + `.trade-source-mark(.manual)` + dark variant, `.pins-kanban-board`/`-col` from kanban mobile media query.
- **KEPT despite earlier S134 retire-list (correction):** `.ctx-text-toggle` (+ `.active`, dark `.active`) — used by markup text tool (Border/Hatch toggles), referenced from `index.html` ~lines 560-561 by `data-ctx` handlers in `markup.js`. NOT IAR-related.
- **KEPT pragmatically:** all `tasks-*` mobile rules, `#btn-ai-review` header button styles (separate live feature), `.kanban-wrap`/`.kanban-col` (live Deficiency kanban — different system from retired pins-kanban).

### S135 data-integrity additions (IN FORCE)

- **`contractor.color` auto-assigned, not user-editable** via `nextContractorColor(usedColors)`; cycles after 8; frees on delete.
- **`project.projectTrades` is the per-project source-of-truth for trade columns.** `TRADE_LIST` seeds new/legacy projects (4 defaults). Phase 1c updates the per-obs dropdown to read `project.projectTrades` (Phase 1a UI shim surfaces out-of-list values italicized so removing a trade never strips obs data).
- **`removeProjectTrade` cascades** — strips the trade from every `contractor.trades`; does NOT touch `obs.trade` (those keep rendering as italicized out-of-list options).
- **`addContractorToTrade` atomic for new trades** — adds the trade to `project.projectTrades` first (case-insensitive match preserves casing).
- **Auto-inheritance is non-destructive** — `addDeficiency`/`addObservation` only set `obs.trade` when empty AND parent contractor has a single declared trade. Multi-trade contractors leave it blank.
- **Test baseline 106 → 144.** 38 new tests in `frt/tests/unit/contractorTrades.test.js`. `obsSchema.test.js` TRADE_LIST assertion updated 8 → 4.
- **`merge3` handles new fields generically** — no special-case; `contractor.trades` / `project.projectTrades` ride standard array-path rules; concurrent edits → conflicts at the array path.

### Trade-dropdown out-of-list rule (S135)

When `obs.trade` isn't in current `project.projectTrades` (legacy "Standpipe"/"Fire Pump"/"Extinguishers", or a custom trade later removed), the dropdown surfaces it as an italicized `<option>` ABOVE the canonical list (inline `font-style:italic`, no new CSS). The S134 `.trade-banner.manual` purple variant is retired — the dropdown is blue-only; AI-inherited vs manual differentiation returns in Phase 2 as derived data (contractor color cue), not a hue swap.

---

# Session 136 Additions — Trade Board UI LIVE (Phase 1b/1c) + Inspector re-slot

### Version state (end of S136)

SW `v407`, CSS `?v=307`, tests `144/144` (UI-only). Final commit `fdedc75108`.

### Trade board — LIVE

- `_renderTradeBoard()` in `frt/js/ui/deficiencies.js` replaces `_renderContractorsOnSite()`. Renders into `#contractors-on-site`, which now lives in its **own top-level card** `#trade-board-card` (burgundy `.card-header`) — a sibling of Deficiency Log / Deficiencies Identified, NOT nested inside Deficiencies Identified. *(S137-POLISH renames the header to "Trade Board" and re-orders cards — see S137-POLISH.)*
- Columns = `project.projectTrades`; cards = contractors whose `.trades[]` includes the column trade. Default-4 trades have no header `×`; custom trades show `×` → `removeProjectTrade` (confirm if column populated).
- Smart picker overlay (`_openCtrPicker`/`_closeCtrPicker`): existing-contractor chips not already in column + free-text new-contractor input. Backdrop click closes via direct listener (not delegated `data-action`).
- Contractor card body click → `_showCtrEditDialog` (3-button `showDialog`: Cancel / ✏ Rename / 🗑 Delete entirely). Card `×` → `removeContractorFromTrade` (narrow, this column only).
- Per-obs trade dropdown (`_buildPinGroupCard`) reads `project.projectTrades` (Phase 1c) with `TRADE_LIST` fallback; out-of-list values surface as italic options.
- `+ General Deficiency` temporarily in `.trade-board-foot` — Phase 2 absorbs it into the unified `+ deficiency` modal.

### S136 design rules (IN FORCE)

- **`contractor.color` is the SINGLE visual identity for a contractor.** Drives: trade board `.ctr-card`, smart-picker `.picker-chip`, AND the `👷 <name>` group header in Deficiencies Identified (`buildGroup` sources `accentCol` from `contractor.color`, NOT the legacy hash palette). One contractor = one color across every list surface. Phase 2's three views must also key contractor color off `contractor.color`.
- **Legacy `getContractorColor(name)` hash palette (`_CTR_PALETTE`, `ctrColorClass`) is NO LONGER the contractor-color source for the group header.** Retained ONLY for the Deficiency Log summary table + PDF export. Flagged for unification with `contractor.color` during the Phase 3 PDF restructure. Site General / unknown fallback = `#6B7280`.
- **Trade column header color = locked PDF taupe `#7B6F5A`** (day) / `#5F5749` (dark, `body.dark-mode .trade-col-hdr`). NOT navy. Navy `#2A3A5C` stays reserved for the per-obs `.trade-banner` dropdown + PDF trade-section header only.
- **Renumber-pill is a reusable visual pattern** — tinted fill + colored border + colored text via `color-mix(in srgb, var(--X) N%, transparent|bg)`, ALWAYS preceded by a hard-hex fallback declaration of the same property (old-cached-browser safety). Used by `.ctr-card` + `.picker-chip` (keyed on `--cc`); Phase 3.5 reuses it for the inspector chip keyed on `--ic`. **This supersedes the S134 "4px colored left border" treatment on `.ctr-card`/`.picker-chip` — do NOT restore the border-left look.**
- **`color-mix()` is now in production CSS.** Supported on current Android/desktop Chrome (iOS abandoned). Always precede a `color-mix` declaration with a plain-value fallback of the same property.
- **One visual channel per data dimension (LOCKED principle):** Contractor → color. Inspector → initials chip (non-color). Priority → pin body color. Inspector → pin outer ring (drawing canvas only).
- **Push discipline:** invoke `python3 push.py` exactly once. Never `import push` (executes on import → duplicate commit).
- **Trade board lives in its own `.card`** — do not reintroduce a `.trade-board-section` inner wrapper. `.trade-board-section` / `.trade-board-title` selectors retired (do not re-add).

### Inspector Attribution — REDESIGNED + RE-SLOTTED → BUILT S143

> ⚠ **The S81–S82 spec (colored card border; PDF "modes A/B/C";
> `profiles.inspector_color`; "Layers menu" toggles) is LOST and
> formally RETIRED.** Inspector attribution was BUILT in S143 — see the
> Session 143 section for the authoritative live design. Net live state:
> - **Per-observation** attribution (`obs.createdBy`, stamped since S83),
>   NOT per-pin and NOT a card border.
> - On screen: a compact initials chip `.obs-insp-chip` rendered into
>   the reserved `.obs-insp-slot`, color carried per-instance via the
>   `--ic` custom property. Chip color is **derived deterministically by
>   hashing `userId` into the existing `CONTRACTOR_COLOR_PALETTE`** — no
>   new colors, no `profiles.inspector_color` column (it does not exist
>   in the live schema and is not read). Control-bar toggle
>   `#dfx-insp-toggle` (localStorage `arencon-frt-insp-chip`, default
>   ON) — **not** a "Layers menu" (no such menu exists in FRT).
> - PDF: **2 modes only — Off (default) / Initials tag** (`#pdf-insp-tag`
>   in the export modal). Chip renders in `.dc-hdr` after the priority
>   pill when initials. Legacy/null `createdBy` prints/renders nothing.
> - Canvas inspector pin-ring (S82 "outer ring on drawing") is
>   explicitly **out of scope** — unbuilt, touches protected
>   `pinsGL.js`/`pins.js`, a separate future piece.

(S136 historical: re-slotted as Phase 3.5; card 3px-left-border
attribution dropped in favour of a compact chip; Phase 2 reserved the
~20px `.obs-insp-slot`; Phase 3 was to build a PDF dropdown shell. All
realized — with the corrections above — in S143.)

---

# Session 137 Additions — Unified Deficiencies Tab LIVE (Phase 2a)

### Version state (S137 ship)

SW `v409`, CSS `?v=309`, tests `144/144`. Final commit `5d546d5b7a`. *(Superseded by S137-POLISH: SW v413 / CSS v=313 / head `2f888b0`.)*

### Unified Deficiencies tab — LIVE (Phase 2a)

- The "⚠ Deficiencies Identified" card contains: a slim `#defic-toolbar`, the `.defic-control-bar` (Active/Closed **pivot** + search + contractor + priority filters + Detailed/Table/Board **view toggle**), then `#deficiencies-container.defic-content`. *(S137-POLISH removes `#defic-toolbar` entirely and moves Renumber into `.defic-control-bar`; renames card to "Deficiency List"; re-orders the three cards — see S137-POLISH.)*
- `#defic-lifecycle-tabs`, old `#defic-search`, `#defic-filters-btn` removed from markup. `_renderActiveTab`/`_renderClosedTab`/`buildGroup`/`_updateDlcCounts`/`_applySearchFilter` remain defined but inert (safe to delete in a future cleanup; no rewrites).
- `initDeficiencies.render()` shows `#defic-control-bar`, renders Deficiency Log + Trade Board, syncs the control bar (`_syncDfxControls`), dispatches on `_deficView`: `_renderTableView` / `_renderBoardView` / `_renderDetailedView`.
- **`_flatRows(proj, ignorePivot)`** = single filter engine for all three views (lifecycle pivot via `_activeDlcTab` unless `ignorePivot`, plus contractor/priority/search). Returns `[{d,o,oi,ctrId,ctrName}]`. 0-obs legacy pins emit a synthetic row (`oi:-1`) so they stay reachable/editable (no data loss).
- **Detailed view** = Trade → Contractor → the existing interactive `_buildPinGroupCard` (unchanged). Trade banner navy `#2A3A5C`, contractor sub-banner taupe `#7B6F5A` w/ `contractor.color` dot, grey `#6B7280` "Recommendations" (no-contractor-but-trade) and bottom "Site General · Recommendations".
- **Table view** = row-per-(defic,obs): # / Trade / Contractor / Description / Priority / Status / Photo.
- **Board view** = priority kanban High/Low/General/**Closed**; pivot-independent (`_flatRows(proj, true)` — owns its Closed column).
- Table rows + Board cards = `data-action="dfx-goto"` → `_dfxGotoPin()` switches to Detailed, scrolls live `.defic-pin-group` into view, brief `.dfx-flash` pulse. **Editing is Detailed-only**; Table/Board are read/triage surfaces.

### S137 design rules (IN FORCE)

- **No box-in-box inside a `.card`.** A feature rendering inside an existing `.card` (header+body) must NOT wrap content in a second bordered/filled box. The control bar is a flush toolbar row with a single `border-bottom`; content flows directly. Only genuine content grouping (Detailed trade-section banners) may be a nested visual level. Locked per Mark field review S137.
- **Trade is per-observation (`o.trade`).** Any pin-level grouping uses the pin's FIRST observation's trade (Option 1). Splitting a pin card across trade sections is forbidden (would require rewriting the protected `_buildPinGroupCard`).
- **Active/Closed pivot is per-observation** (`obs.addressed`), not pin-level. A pin with any closed obs appears under Closed; the card still shows all obs (it is an editor).
- **Board view is pivot-independent** — carries its own Closed column.
- **Forbidden-color enforcement overrides spec deltas.** S134 specced `#C0392B` for the High board column; shipped muted `#A85959`. The muted-only rule supersedes any style-delta hex. Never use `#C0392B` / `#1A7A4A` / `#3F6E9C`.
- **`dfx-` is the unified-tab CSS namespace** — prevents collision with `.trade-banner` per-obs dropdown and `.defic-group`/`.defic-pin-group` (still used by the interactive card).
- Detailed view **reuses the existing interactive `_buildPinGroupCard`** under new banner wrappers. The `unified_defic_demo.html` cards are a visual mock only — never replace working interactive code with the demo.
- Filter inputs live in the control bar **outside** `#deficiencies-container` so a content re-render never clobbers the search caret/focus. Keep new persistent inputs outside the re-rendered container.
- Cross-view nav: lightweight views link to the heavy Detailed view via `data-action` + goto helper (re-render + `scrollIntoView` + brief highlight), never duplicate the editor.

### S138 — Phase 2b (SHIPPED, final commit `d042b40`)

Unified `+ deficiency` modal + `defic.isRecommendation` schema + canon-aligned
recommendation rendering + "Recommendations only" filter all shipped. Folded
design rules (canon):

- **A recommendation is NEVER relocated.** It stays in its natural group and
  only gains a REC badge — has-trade+has-contractor → under that
  trade→contractor + REC badge; has-trade+no-contractor → grey
  "Recommendations" sub-banner within trade; no-trade+no-contractor → "Site
  General · Recommendations" bottom section. The S137-era "Option 2 / rec flag
  wins over contractor" idea was implemented in `fb6e151`, found to violate
  this rule in the requested audit, reverted in `143f0e8`. **Do not re-propose
  flag-driven relocation.** The flag's only render effect is the badge.
  *(NOTE: superseded S140 by Model 2 — recs pooled into a bottom section;
  see S139 section at end. Left here as the S138 as-shipped record.)*
- **REC badge is rendered by a wrapper, never inside `_buildPinGroupCard`.**
  `_renderDetailedView` wraps a rec pin's card in
  `<div class="dfx-rec-pin"><span class="rec-badge">REC</span> …card…</div>`;
  `.dfx-rec-pin > .rec-badge` absolutely positioned in the pin-strip's
  right-side whitespace, `pointer-events:none`. Protected card fn untouched.
- **Creation path:** `Model.addDeficiency(ctrId)` → `updateObservation` /
  `updateObsPriority` / `updateObsTrade(…, 'manual')` → set additive
  `isRecommendation`/`drawingId` on the returned live defic → `saveNow()` →
  force `_activeDlcTab='active'` → `render()`. No array hand-mutation.
- **Single creation entry point.** One `.add-deficiency-card` (§20) at the
  foot of every view. The per-contractor `+ Add Deficiency` rows and the
  trade-board-foot `+ General Deficiency` are removed; their
  `add-defic`/`add-general` handlers + dead `buildGroup` emitter remain
  defined-but-inert (S137 no-rewrite discipline).
- **`_flatRows` is the single filter engine** and carries the rec filter:
  `_dfxRecOnly` state, predicate `if (_dfxRecOnly && !d.isRecommendation)
  return;` in obs + 0-obs branches. The **"Recommendations only"**
  control-bar checkbox (`#dfx-reconly` in `.defic-filters`) scopes
  Detailed/Table/Board identically, hierarchy preserved, intersecting the
  Active/Closed pivot + contractor/priority/search. Synced in
  `_syncDfxControls`.
- **Modal uses documented modal infra**, not bespoke overlay:
  `.pin-modal-overlay.open` > `.pin-modal` > `.pin-panel-header|body|footer`,
  `.field-group`, `.modal-checkbox-row` (§20, native `for=` deliberately
  omitted), `.btn-outline` Cancel + `.btn-primary` Add. Overlay
  `add-defic-overlay`, in the `app.js` global Esc modal stack after
  `gp-overlay`. The invented `.adf-*` / `.dfx-add-defic-*` / `.dfx-tbl-rec`
  classes were removed in `143f0e8` — do not document them.
- Versions: SW v413→**v416**, CSS ?v=313→**316**, tests 144→**155**.

---

