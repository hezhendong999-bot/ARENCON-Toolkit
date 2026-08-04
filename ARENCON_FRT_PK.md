# ARENCON FRT — Project Knowledge (CANON)

**Reconstructed 04 Aug 2026 (S615, Lane A) after `ARENCON_FRT_PK.md` went missing from project knowledge during the S611 file cleanup.**

---

## ⚠ READ THIS BEFORE TRUSTING ANY LINE BELOW

The previous `ARENCON_FRT_PK.md` is **not** what you are reading. That file was
removed from project knowledge and could not be recovered. This file was rebuilt
from four surviving sources, and **each part below is labelled with which source it
came from and how much to trust it.**

| Source | What it is | Confidence |
|---|---|---|
| `ARENCON_Project_Knowledge.md` (in the GitHub repo, root) | The full canon pass through **S216**, 190 KB, permanently in git and NOT deletable from a chat project | **Verbatim — highest.** PART 1 and the PROVENANCE ARCHIVE below are this file, unaltered. |
| `ARENCON_FRT_PK_DELTA_S546-S559.md`, `ARENCON_FRT_PK_DELTA_S572-S587.md` | Delta files that survived the cleanup | **Verbatim — high.** Folded into PART 3. |
| Lane A handoffs S546–S559, S572–S587, S588–S606 | Survived the cleanup | High. |
| Git commit messages S217 → S614 | Written as documentation, permanent, never deletable | **High for what they cover.** Everything in PART 2 traceable to a commit is marked with its session number. |
| Retrieved fragments of the old PK | Recovered from search before the index dropped them | **Medium — flagged `[recovered fragment]`.** Wording is faithful; completeness is not guaranteed. |

### KNOWN GAP — the S217 → S545 window

The old PK's coverage of roughly **S217 → S545** existed only in that file. What is in
PART 2 for that window is what could be recovered; **it is not complete.** Treat PART 2 as
a floor, not a ceiling. If a rule you half-remember is not in this file, check the git log
before assuming it was never true — the commit messages for that window are intact and are
the best remaining record.

**Specifically lost or unverifiable:** the `S454` shared-module audit (corrected module
counts, off-limits traps) was written to be appended to the FRT PK and is not recoverable
from any surviving source. `S445` / `S447` are likewise unrecovered. `S446` (the `/lib/`
extraction) and `S458` (shared markup-tool definitions) survive in substance because their
cross-cutting rules were also written into the Platform PK and the Style Guide.

### RULE GOING FORWARD (so this cannot happen twice)

**The tool PKs must live in the GitHub repo, not only in project knowledge.** Git is
permanent, versioned, and survives any cleanup; a chat project is not a backup. This file
should be committed to the repo alongside `ARENCON_Project_Knowledge.md` and the project
copy treated as a convenience mirror.

---

## CURRENT LIVE STATE (verified against GitHub HEAD, not prose)

| | |
|---|---|
| HEAD at reconstruction | `6564136` (Session 614, Lane C) |
| `FRT_BUILD` | **`S613`** |
| `frt.css` | `?v=730` |
| Root SW `CACHE_NAME` | `arencon-frt-2026080404xx` (UTC-minute scheme; read live before bumping) |
| FRT offline cache namespace | **`arencon-fieldreview-`** — the root shell worker keeps `arencon-frt-` |
| Repo / branch | `hezhendong999-bot/ARENCON-Toolkit` · `main` · GitHub Pages · `arencon.app` |

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

# ════════ PART 2 — FRT CANON S217 → S545 (RECONSTRUCTED) ════════

**Everything in this part is either a `[recovered fragment]` of the old PK or is
traceable to a git commit. It is a FLOOR, not a complete record.** See the gap
notice at the top of this file.

## Deficiencies tab — filters, bands, rounds, reopen  `[recovered fragment, S336–S338]`

- **Filter row = 5 segments:** All · Outstanding · Recommendations · Site Records · Closed.
  "All" = `_activeDlcTab='any'` + `_dfxRecMode='all'`, neutral chrome active state (**never a
  category colour**). Markup is static in `frt/index.html`; the state machine lives in
  `deficiencies.js` (`_setCatFilter` / `_deriveCatFilter` / `ccAll`). Phone portrait: All full
  top row, 2×2 below. The add-button label follows the filter (`Add recommendation` /
  `Add site record` / none on Closed).
- **Connected-card band reskin (S337 R1, CSS-only):** trade banner + contractor banner + cards
  are ONE bordered rounded card (`.dfx-trade-section`); soft burgundy gradient trade header with
  accent tick; contractor band flush; hairline between contractors. **Both bands KEPT**
  (ghost-trade rejected). Collapse selectors untouched.
- **Rounds-escalation chip (S337):** replaces "Noted FRT #N".
  Round = `(currentFrtInstance − notedOnInstance) + 1`; round 1 = NO chip; **2nd round grey**,
  **3rd+ maroon + drawn inline SVG flag (never emoji)**. Render-only, in `_buildObsRow`.
- **Closed view split (S337):** per contractor, "Closed this report" (sage) vs "Previously
  closed" (muted grey), by `closedOnInstance >= currentFrtInstance`; `_emitPin` closure shared.
- **Reopen lifecycle (S338, LIVE):** non-destructive and nature-preserving — routes through
  `Model.updateDeficStatus(id,'open')`, which clears `addressed` **without** touching
  `priority` / `isRecommendation`, so the original nature re-surfaces.
  **NEVER force a priority on reopen** — the first build flattened everything to high.
  `reopenedOnInstance` / `reopenedFromInstance` are stamped ONLY on a cross-report reopen;
  same-report reopen is silent; re-closing clears them. `reopenDeficiencies(ids)` is the batch
  path. UI: blue `#2C7FB8` / `#46C5E8` accent; "↩ Reopen" appears in the menu only when closed;
  "↩ Reopened FRT #N" chip is **always** shown when stamped (Mark: it documents an undone
  closure). Closed-view multi-select (`_cvSelMode` / `_cvSelIds`) is reopen-only, transient, and
  auto-exits on filter change.
- **Rec-segment dashboard (S406):** `_deriveCatFilter()==='rec'` renders `_renderRecDashboard`
  (per-obs via `_deriveCategory`; 0-obs pins fall back to pin flags);
  `.dlc-track-rec` brown→sage gradient.

## Auth / sync / data integrity  `[recovered fragment, S338 · S426 · S440]`

- **Token-refresh hardening (S338, root cause):** `_refreshToken` writes `sb-refresh-token`
  **only** when `data.refresh_token` is truthy. The unconditional write clobbered good tokens →
  silent 401 loop → "Saved locally, never Synced". `window._authSessionExpired` is set for
  diagnostics. **Only `signOut()` removes the refresh token.** A genuinely expired session still
  needs a manual re-sign-in.
- **`Auth.getInitials()`** — profiles.initials → full_name → email local part. FRT's
  "Prepared By" auto-fills **only when empty**.
- **AI write-back must persist via Model methods, never raw-assign (S342):** `_writeBack` routes
  obs → `Model.updateObservation`, act → `updateActivityEntry`, cn → `updateClosedNote` — each
  sets `_dirty` and queues the cloud save. `Model.saveNow()` is **IDB-only**.
- **Stale-overwrite guard (S263, `sync.js pull()`):** skip the overwrite when local
  `_project.modified` is newer than cloud `updated_at`. Prevents loss; the push timeout itself
  was a separate open item.
- **Stale-writer guard (S426):** load-time migrations mark the model dirty at boot, so a freshly
  opened tab could push its stale IDB snapshot over a NEWER cloud row. Before pushing, confirm
  the cloud row is not newer than the baseline this tab last pulled.

## Photos — assignment, soft delete, purge  `[recovered fragment, S265 · S266 · S494]`

- **Photo assign rule:** always use `_createDeficPhotoFromSource()` — upload the blob to R2 under
  the **new deficiency's own key** and save to IDB. **Never copy URLs from the source**: cloud
  sync strips `dataUrl`, and borrowed R2 URLs break silently.
- **Site→pin assignment is a NEW binary path** — mint a new pool binary, never copy the URL.
  ⚠ The bulk "Assign to Pin" (`_doReassign` in `photos.js`) writes a moved photo into
  `obs.photos` rather than the pin pool, and works today only via the `getEffectivePhotos`
  legacy fallback. **Fix it properly before extending** (own session, field-verify).
- **Repair pattern (Mark-present):** use `Model.setObsPhotoSelection(deficId, obsIdx, photoIds)`
  — `null` resets to "all pool"; an array is auto-filtered against the live pool (so passing the
  current selection back DROPS dead ids). Never raw-mutate. Verify R2 object existence first via
  a worker GET (GET needs no auth).
- **Soft delete (Phase 1, LIVE S265):** `removePoolPhoto(deficId, photoId)` sets `deleted:true` +
  `deletedDate`, keeps R2, cascades the id out of every `photoSelection` and `photoMarkups`, and
  is idempotent. `restorePoolPhoto` clears the flags and deliberately does NOT re-insert into a
  custom `photoSelection` it was removed from — the inspector's explicit choice is preserved.
  `removeSitePhoto` is soft-delete and the index does NOT shift; `restoreSitePhoto(idx)` restores;
  the gallery site loop skips deleted site photos so `siteIdx` stays the true array index.
- **Permanent delete** — `purgeSitePhoto(idx)` / `purgePoolPhoto(deficId, photoId)` splice the
  entry, act only on already-`deleted` photos, and leave the R2 object in place.
  **Delete-forever is admin-gated** (`Auth.isAdmin()`, re-checked in the handler — the
  anti-malice gate).
- **Auto-purge:** `purgeExpiredPhotos(retentionDays)` converts expired soft-deleted photos to
  purged tombstones via `_makePurgedTombstone()`, dropping the local payload keys. It runs
  **client-side, once per project, on the first Photos-panel render** (`_purgedForProjectId`),
  so a project nobody opens is never purged. Retention is `_TRASH_RETENTION_DAYS`.
  **It leaves R2 in place** — the bucket grows monotonically. `_makePurgedTombstone` deliberately
  KEEPS `r2Key`, so the stranded object stays traceable.
- **Site-Records fallback:** `restorePoolPhotoOrSiteFallback(deficId, photoId)` — if the parent
  deficiency is gone, the photo moves to `proj.photos` (Site Records). Returns `{ok, fallback}`.
- **Gallery UI:** Photos panel sub-tab row **All Photos (n) | 🗑 Recently Deleted (n)**
  (`_photoTab`). Trash thumbnails are tappable into a **read-only** lightbox — viewing does not
  restore. Helpers `_gatherDeletedRecords` / `_trashDaysRemaining`.
  **Restore button colour = MUTED green `#3E7D63`**, never bright `#3FD08A`.
- **Thumbnail compositing (S362):** match the `<img>` by exact `data-thumb-pid` — **NEVER a URL
  prefix.** All photos share the worker prefix, so prefix matching stamped one composite onto
  every thumbnail (the S355 regression that forced the S357 rollback). The composited thumb is
  pre-rotated: clear its inline CSS rotate.

## Markup / selection / drawing viewer  `[recovered fragment, S339 · S358–S410]`

- **Locked select/draw model** (`LOCKED_SELECT_DRAW_MODEL_S339.md`): Select is a tool group
  (Single / Rubber-band / Tap); selection is sticky (only ✗ clears); Tap = pick boxes + ✓ confirm;
  universal press-drag-release; two-click retired; the S329 two-finger cancel is preserved.
  **Additive grouping (S410):** empty `_pickIds` + existing `_selectedIds` → the committed group
  seeds the picks; a tap after commit never destroys the group.
- **`markupEngine.js` cache-bust rule:** loaded via `?v=` in `frt/index.html` AND precached by
  the root `sw.js` — **bump BOTH on every push of that file.**
- **Gesture routing (working — no work needed):** engine down/move bail on `touches.length>=2`
  WITHOUT `preventDefault`, so pinch bubbles to the lightbox; a second finger mid-stroke cancels
  the stray mark.
- **S389 reconciliation — SHIPPED, do not re-open:** draw-while-rotated 90/270 (S358 single
  forward transform, `pt()` inverse exact); zoom-during-markup teleport/drift (S358 — the markup
  canvas is a child of `lb-img-wrap`, canvas-mirror deleted); gallery thumb composite;
  markup + rotation survive assign-to-pin (S359 deep clone); frozen report snapshots (S360);
  visible clean-backup Site Record (S363); screen-constant handles (S364).
- **Drawing-viewer text engine (S390–S403):** committed markup renders via **WebGL**
  (`WebGLMarkupRenderer.render`, Pixi) with a 2D `_drawObject` fallback — **any per-object filter
  (e.g. skip `_editing`) must apply to BOTH paths.** `.dv-text-box` contentEditable needs its own
  `position:fixed; z-index:10000` CSS (not shared with the lightbox `.mk-text-box`) or it
  collapses invisibly inside the `overflow:hidden` overlay. Default text size is 80 logical px
  (20 is invisible at fit-zoom on large drawings); steps 24…220. Text-bar buttons fire on
  `pointerdown` + `preventDefault` to survive the contentEditable focus race; `commit()` resolves
  the canvas via `_getCanvas()`. Editing and selection are mutually exclusive; a canvas
  pointer-down while editing commits.
- **Text edge-drag (S410):** pointerdown within 12 px (16 px coarse) of the box border drags it;
  the interior keeps the caret.
- **Open scope:** the lightbox `mk-text-chip` (S339) was never ported to the drawing viewer,
  which still uses `.mk-text-input-live` / `_handleTextPlace`. Mark wants the engines identical —
  substantial (different coordinate model), demo-first, `markup.js` is protected.
  Scope file: `SCOPE_FRT_TEXT_ENGINE_PORT.md`.

## Build identity, cache namespaces, markup cloud writes  `[verbatim, PK delta S546–S559]`

- **`FRT_BUILD` is live again.** It sat frozen at `S528` for ~15 sessions while the code moved on.
  It is bumped **every push**, same discipline as the cache name. *(Now `S613`.)*
- **FRT's offline cache namespace is `arencon-fieldreview-`**, not `arencon-frt-`. The root shell
  worker keeps the historic `arencon-frt-` prefix and now owns it alone.
- **Each service worker purges only its own namespace.** Previously every worker deleted every
  cache on the origin except its own, so publishing the portal wiped FRT's offline files and vice
  versa — a tablet arriving on site had nothing cached. Each worker declares `CACHE_PREFIX` and
  filters on it. `TILE_CACHE` is preserved explicitly *and* by a `/tiles/` exclusion.
- **Build identity is ASKED, not guessed.** `GET_BUILD_STAMP` → `{type:'BUILD_STAMP', cacheName}`,
  handled in both `frt/sw.js` and root `sw.js`. `caches.keys()` is ORIGIN-wide: the old scan took
  the newest cache of *any* tool, so a stale FRT beside a fresh portal cache read as current —
  precisely the device the floor exists to catch. **An identity from the cache scan may WARN but
  must never block cloud writes.**
- **Markup conditional-PUT contract:** the 412 storm's root cause was the worker and client
  disagreeing on whether the version fingerprint carries quotes (wrong in both directions
  historically: S129 quoted → S130 stripped → flipped back). Every markup save failed three
  preconditions on a single device with nobody else editing, then wrote unconditionally with
  **race protection skipped.** The worker now accepts either form — sent value first, then
  quote-toggled — before returning 412; a genuine concurrent write fails every form and still
  refuses. **The worker deploys separately** — pushing `arencon-r2-worker.js` to GitHub does
  nothing until it is deployed in the Cloudflare dashboard. **Only markup uses conditional PUTs**;
  Diesel/Electric photos write immutable unique filenames.
  Permanently tested by `frt/tests/unit/twoInspectorMarkup.exercise.mjs` (plain `node`, extracts
  the LIVE merge out of `lib/data/r2.js` at run time so it cannot drift). **Local wins on a
  same-id conflict** is the documented rule.
- **Photo bursts redraw the deficiency screen ONCE.** Every entry point — camera, upload,
  drag-drop, gallery — funnels through `_addPhotoFiles()`. Photos are still written and queued the
  instant each is compressed; only the repaint is deferred. **A failed photo must still tick the
  batch** or the screen never repaints. Quiet progress pill, never 12 toasts.
  `openCameraBurst({projectId, tool:'frt', label})` — the label names the deficiency so crash
  recovery says which pin the shots were for.
- **Markup text is one implementation.** The drawing viewer's private text editor is gone; it runs
  `lib/ui/markupText.js` through an adapter (`DVTextHost`). **Weight is read off the stroke** — a
  stroke with no `bold` field paints `bold` exactly as before; the drawing viewer writes
  `bold:false` and gets `400`. Without this, adopting the engine would have re-rendered text on
  **every drawing in every report already issued to a client.** One text-size stepper: the tuned
  `_DV_SIZE_STEPS` list, everywhere.
- **Dimension tool is sized in SCREEN terms via `_uiScale()`.** Handles were a flat 10 drawing
  units ≈ 2 px on a fitted sheet against a ~40 px fingertip; now 13 px marker / 30 px grab.
  The start point is drawn when there is no cursor (touch has no hover). Ortho snap is **4.5° on
  coarse pointers**. A dimension is ONE gesture: press, drag, lift — a tap that does not move
  behaves as before. The second point yields `lockedB`, **not** `committed`; only the third click
  (offset) commits. **Lifting is not final** — `_dimEnterAdjust()` keeps both endpoints grabbable
  with pan/zoom allowed; nothing commits until the ✓. Discard splices the provisional object out,
  so there is no ghost undo step. A stray tap during adjust is **absorbed**. `destroy()` resolves
  a dangling adjust as a discard *before* the dirty-save.
  *(S572: the loupe was REMOVED at Mark's explicit direction — do not restore it from history.)*
- **Field-reachable diagnostics:** the integrity check is on screen (More menu → 🩺 Check Report
  Integrity) as a read-only panel. It used to end in `alert('open DevTools')` — the installed
  tablets have no console and no address bar. **The answer is per-device**: it checks the copy on
  THIS tablet.
- **Standing corrections to earlier PK claims:** the version-floor comment claiming "FRT has no
  build stamp" was wrong — it had one, frozen. A hand-set contractor colour survives the guarded
  auto-assign **but not** the earlier load-time remap, which migrates anything outside the locked
  8-palette (no field exposure — no UI can set a custom colour). `quadraticCurveTo` uses in the
  viewer are all **cloud shapes** (explicitly permitted); pen and highlighter are clean.
  `OffscreenCanvas` has a main-thread fallback.

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

