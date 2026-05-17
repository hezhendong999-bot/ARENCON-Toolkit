# ARENCON Fire Protection Toolkit — Project Knowledge

## About This Document

**This is the single canonical Project Knowledge doc as of the S143 canon
pass.** The S132–S137-POLISH delta chain plus the cumulative **S138 +
S140 + B2f (S141) + S142 + S143** deltas have all been folded in here.
From here forward only this file is kept; future per-session deltas are
merged in each session, so deleting old deltas is safe. When two sessions
conflict, the later one wins — the **CURRENT-TRUTH — Supersedes Index**
near the end of this doc is the authoritative quick-reference for
everything that changed. The S138→S143 delta `.md` files
(`ARENCON_PK_DELTA_S140/S142/S143.md`) are now absorbed and disposable.

> **S143 canon-pass ground-truth note:** This fold records the **live**
> code at HEAD `9c9b3115` (not the S143 handoff at `6f9c1f79`). Two
> post-handoff S143 fix commits (`ea71cdc5`, `9c9b3115`) shipped after
> the handoff was written and ARE folded here: (1) `model.js` now
> actively clears legacy `iar` flags on load; (2) the PDF "Report Key"
> was renamed "Report Legend", made a 2-column grid, the Trade row
> dropped, the gloss reworded; (3) the PDF Deficiency Summary IAR column
> was removed (IAR retired since S135). The S143 delta files describe the
> handoff state; where they differ from live, **live wins** and is what
> is recorded below.

Upload to the Claude Project along with:
- The consolidated `ARENCON_Style_Guide.css` (single canonical Style Guide — S133→S137-POLISH plus the carried pre-S133 appendix; no per-session delta files needed)
- ARENCON_FRT_Core_Template.md (reusable architecture reference for building new tools)
- logo_base64.txt (must include "data:image/png;base64," prefix)
- TOOL_BUILD_QUEUE.md
- Current tool HTML files (stable filenames — no version numbers)
- Current session handoff document

Last updated: 2026-05-17 (**Session 143 canon pass** — S138 + S140 + B2f
(S141) + S142 + S143 deltas all folded into this single file and the
single `ARENCON_Style_Guide.css`. **Live triad: HEAD `9c9b3115`, SW
`arencon-frt-v440`, CSS `frt.css?v=340`.** Cumulative shipped state now
in canon: **S138** Phase 2b (`defic.isRecommendation` schema, unified
`+ deficiency` modal — `d042b40`); **S139** Phase 3 A/D (PDF
Trade→Contractor restructure, hi-rec note, Renumber→PDF merge —
`9f300a7b`); **S140** "Model 2" Detailed-view sections + non-destructive
contractor lifecycle + B2d/B2e (`v424`/`?v=324`); **S141** B2f
persistent roster (`d0da10c` — *superseded by S142*); **S142** §2
ClickAssign `crx-` contractor roster (supersedes the S136 kanban Trade
Board AND the S141 B2f roster) + Model 2 PDF as-shipped (all primary PDF
header bands navy `#2A3A5C`, recs pooled to a new page after Previously
Closed, burgundy = accents only) + Batch 4 polish — `c0c9d353`; **S143**
inspector attribution (per-observation `createdBy`, deterministic-palette
chip, control-bar toggle, PDF 2-mode Off/Initials) + PDF "Report Legend"
+ load-time legacy-`iar` clear + PDF IAR column removal —
`9c9b3115`. ⚠ **The S139 in-place rec model (badge + "Site General ·
Recommendations" band) is fully SUPERSEDED and STRUCK** — §2944 below is
rewritten to Model 2 AS-SHIPPED. The original S82 PDF inspector "modes
A/B/C" spec is **lost and formally retired** — the canonical model is
2 modes only (Off / Initials).)

Prior milestone: Session 119 — Phase A per-obs priority + status independence; Phase B confirmation modal audit + type-DELETE; photo refactor design locked for S120.

---

## Company Profile
- **Company:** ARENCON Inc. (www.arencon.com), founded 1992
- **Industry:** Fire Protection & Building Code Consulting
- **Location:** 1551 Caterpillar Rd Suite 206, Mississauga ON L4X 2Z6
- **Lead:** Mark He — L.E.T., C.E.T., FPET (no coding background — builds all tools through Claude)
- **Team:** ~25 staff; 2–3 tablets shared in field (Android tablets + iPhones)
- **Key Staff:** Leslie Sims (Founding Principal), Shaun Kelly (Principal), Alexander Yarmoluk (Principal), Mike Zukov (Principal), Matthew McDonald (FPET)
- **Certifications:** ULC-listed CAN/ULC-S1001; SAFFIRE Safety Consultants alliance member

---

## Toolkit Overview

### Hosting & Deployment
- **GitHub Pages** — flat file repo root, stable filenames, no version numbers in deployed filenames
- Mark uploads via drag-and-drop to GitHub, hard-refreshes with Ctrl+Shift+R
- **Auth/DB:** Supabase (PostgreSQL + email/password, @arencon.com only)
- **Storage:** Cloudflare R2 via Worker proxy
- **Local:** IndexedDB (primary permanent backup) + localStorage (fallback)
- **Planned:** Azure post-M365 migration (swap endpoints only, ~one session)

### PWA
- `manifest.json` + `sw.js` deployed to repo root
- Hub is start URL; installs via Safari "Add to Home Screen" on iPhone
- Service worker: **network-first for HTML** (fetches latest, falls back to cache offline), **cache-first for static assets** (pdf.js CDN, icons)
- Cache version: `arencon-frt-v2` — bump version in `sw.js` to force cache refresh
- Registration: `navigator.serviceWorker.register('sw.js')` in FRT `<head>` — checks for updates every 30 min
- **CRITICAL:** FRT must be opened once on Wi-Fi after deploy to prime the service worker cache. After that, airplane mode works.
- Icons: `arencon-icon-192.png` / `arencon-icon-512.png` — burgundy triangle on dark slate (HYPHENATED filenames)
- Hub has QR code button in header (📱, desktop + mobile menu) for sharing Hub URL
- Each tool has QR button in header (Hub mode only, lazy qrcodejs loading) showing current tool URL with all project params
- **iOS biometric autofill:** Login form uses real `<form>` tag with `autocomplete="current-password"` — iOS offers Face ID/Touch ID to save and autofill via iCloud Keychain. No JS needed on iOS; Credential Management API used for Android/Chrome.

### Android TWA (Trusted Web Activity) — Session 36
- **Package:** `com.arencon.projecthub`, built via PWABuilder
- **What it does:** Wraps the PWA in a thin Android shell. Loads from live GitHub Pages URL. No browser UI.
- **Storage permanence:** Android classifies IDB as "app data" — never silently evicted (unlike browser "website data")
- **Digital Asset Links:** `assetlinks.json` must be at root domain (`hezhendong999-bot.github.io/.well-known/assetlinks.json`), NOT in the project subdirectory. Separate repo `hezhendong999-bot.github.io` hosts this.
- **Two repos coexist:** `ARENCON-Toolkit` (tools) + `hezhendong999-bot.github.io` (root domain, asset links only)
- **Keystore:** `signing.keystore` + `signing-key-info` backed up on Mark's computer. Required for APK updates.
- **Updates:** HTML deploys to GitHub Pages as usual. TWA loads live URL. APK rebuild only for app name/icon/package changes.
- **Distribution:** APK sideload (email, USB, Drive). Future: Microsoft Intune when M365 ready.
- **iOS:** No TWA equivalent. PWA via Safari "Add to Home Screen." TestFlight wrapper ($99/yr Apple Developer) available when ready.
- **Clear Cache vs Clear Data:** Cache = temp files, IDB survives. Data = nuclear wipe, re-login from cloud.

### Stable Filenames
| File | Tool |
|------|------|
| `index.html` | Portal (CFG_VER 14) |
| `ARENCON_Project_Hub.html` | Project Hub |
| `ARENCON_Field_Review_Tool.html` | Field Review Report (FRT) |
| `ARENCON_Diesel_Fire_Pump_Commissioning.html` | Diesel Pump |
| `ARENCON_Electric_Fire_Pump_Commissioning.html` | Electric Pump |
| `ARENCON_IST_S1001.html` | IST S1001 |
| `ARENCON_OBC_Report_Generator.html` | OBC Report |
| `ARENCON_DD_Checklist.html` | Due Diligence Checklist |
| `ARENCON_Supabase_Admin.html` | Supabase admin/cleanup tool |
| `manifest.json` | PWA manifest |
| `sw.js` | Service worker (minimal) |
| `arencon-icon-192.png` / `arencon-icon-512.png` | PWA icons |
| `worker.js` | Cloudflare Worker source (deploy via dashboard) |

---

## Project Hub

### Features (Session 42 current)
- Three-tier dashboard: 📌 Pinned > ⭐ Starred > All Projects
- Shared pinning, personal starring, soft delete + trash, bulk actions, 8 sort modes
- Project detail: info grid, tool toggles, report instances, activity feed, foldable sections
- Cloud Storage panel: file counts + MB per type
- Status badges: Draft/Review/Issued per tool instance
- Dark mode: unified palette (`#0f1318` page, `#1e2533` card, `#d0d8f0` text)
- Tool cards: burgundy left-border accent when enabled, muted state when disabled, custom SVG icons
- Detail sections: burgundy left-border accent
- Photo gallery: grouped by Tool→Date (foldable), click=select, shift+click=range, double-click=lightbox
- Photo gallery: 🗑 delete + ⬇ download buttons on hover, 22px checkboxes
- QR codes: Hub header (📱 button desktop + mobile menu), per-project (detail actions)
- Custom SVG tool icons with short names (FRT, DFP, EFP, IST, OBC, DD) on project cards
- Password reveal 👁 button on login form
- Biometric autofill: real `<form>` tag enables iOS Face ID via iCloud Keychain

### Dark Mode — Shared Key
All tools and Hub use `localStorage key: 'ARENCON_Dark'` — value '1' = dark.
Never use tool-specific keys.

### Sign-out Anti-Auto-Login
`doLogout()` sets `sessionStorage.ARENCON_signed_out = '1'`.
`tryRestoreSession()` checks this flag first — if set, shows login screen without restoring.
Flag is cleared on successful manual login. `sessionStorage` clears when tab/browser closes.

### AVAILABLE_TOOLS Keys
| Key | File | Short | PDF Name |
|-----|------|-------|----------|
| `frt` | `ARENCON_Field_Review_Tool.html` | FRT | Field Review Rpt |
| `diesel` | `ARENCON_Diesel_Fire_Pump_Commissioning.html` | DFP | Diesel Pump Rpt |
| `electric` | `ARENCON_Electric_Fire_Pump_Commissioning.html` | EFP | Electric Pump Rpt |
| `ist` | `ARENCON_IST_S1001.html` | IST | IST Rpt |
| `obc` | `ARENCON_OBC_Report_Generator.html` | OBC | OBC Rpt |
| `dd` | `ARENCON_DD_Checklist.html` | DD | DD Rpt |

Tool icons are custom inline SVGs (`_toolSvg` object in Hub), not emojis. Each has a distinct color:
FRT=#9C2742, Diesel=#E65100, Electric=#1565C0, IST=#C62828, OBC=#2E7D32, DD=#5E35B1

---

## Cloud Architecture

### Stack
| Component | Service |
|-----------|---------|
| Hosting | GitHub Pages |
| Database + Auth | Supabase |
| Photo/Drawing storage | Cloudflare R2 via Worker |
| AI Writing Assistant | Cloudflare Worker → Anthropic API (Sonnet/Haiku) |
| Local backup | IndexedDB (permanent) |
| Future | Azure (Cosmos DB + Blob + Entra ID) |

### CloudSync Module
Two modes:
- **Hub mode** (`?project=<uuid>` in URL): cloud save/load, cross-device sync, logo → Hub
- **Standalone** (no params): IDB/localStorage only, logo → index.html

### Cross-Device Sync — Last-Write-Wins
- Every cloud save stamps `p._cloudSyncedAt = now` on local project
- On project open: `cloud.updated_at > p._cloudSyncedAt` → apply cloud state
- Local newer/equal → push local to cloud
- **60-second heartbeat** (`_syncHeartbeat()`): checks cloud silently while project open; if cloud >5s newer, applies update + refreshes view; blue cloud-dot flash (2s)
- Timer cleared on sign-out
- ⚠️ NEVER set "local is always source of truth" — broke mobile sync for months

### CloudSync Rollout Status
| Tool | CloudSync | Cross-device Sync | R2 Photos |
|------|-----------|-------------------|-----------|
| FRT | ✅ | ✅ last-write-wins + 60s heartbeat | ✅ Full pipeline (upload + prefetch + offline) |
| Diesel | ✅ | ⚠️ push-only (no heartbeat — needs ~50 lines from FRT pattern) | ✅ Upload pipeline (no offline prefetch) |
| Electric | ✅ | ⚠️ push-only (no heartbeat — needs ~50 lines from FRT pattern) | ✅ Upload pipeline (no offline prefetch) |
| IST | ❌ | ❌ | ❌ |
| OBC | ❌ | ❌ | ❌ |
| DD Checklist | ❌ | ❌ | ❌ |

**Pump tools cross-device gap:** Missing `_syncHeartbeat()` — 60s poll checking `cloud.updated_at > local._cloudSyncedAt`, pulls updates. ~50 lines per tool. Also missing R2 prefetch for offline photo viewing.

---

## Cloudflare R2 Storage

### Worker Routes & Auth
| Method | Route | Auth |
|--------|-------|------|
| PUT | `/photos/...` | ✅ Required |
| DELETE | `/photos/...` | ✅ Required |
| GET | `/photos/...` | ❌ None |
| GET | `/list/...` | ❌ None |
| GET | `/health` | ❌ None |

### ⚠️ R2 Auth — PERMANENT RULE
GET requests require NO Bearer token. Tokens expire → images break. Security via private bucket + unguessable filenames. NEVER add token checks to GET routes.

`_loadR2OrDirect(src, img)` is a plain `fetch(src)` — no auth headers, no retry.

### R2 Key Formats
| Location | Format |
|----------|--------|
| Stored `r2Key` | `photos/{pid}/frt/{type}/{fname}` |
| R2 bucket key | `{pid}/photos/frt/{type}/{fname}` |
| Worker list path | `/list/{pid}/frt/{type}/` |

Valid types: `original` | `marked` | `drawings` | `markup`
Filename prefixes: `site_`, `defic_`, `mkup_`, `dwg_`

### ⚠️ IDB — Permanent Backup
- `ADB.saveDrawing` ALWAYS saves blob regardless of `r2Status`
- `delete rec.dataUrl` ONLY inside `_collectFullState()` deep copy — never on live records
- "☁ Re-upload All" button (FRT header, Hub mode, orange) recovers from R2 data loss

### Orphan Cleanup — User-Initiated (Session 28)
`_r2CleanupOrphans` triggered by 🧹 R2 Cleanup button in FRT header (Hub mode only). Scans both UUID and slug folder paths. Shows confirm dialog with file count and size. NEVER auto-run.

---

## ⛔ DATA INTEGRITY — Session 25 Incident & Protections

### What Happened (2026-03-18)
Mark drove 700 km to site in Windsor. Used FRT with bad/no cell signal. All photos taken through FRT camera (not native camera app). Photos saved to IDB + queued for R2. R2 uploads completed when Wi-Fi returned (all 60 files made it to R2). Then CloudSync pulled empty/wrong cloud state and overwrote local IDB data. Photos disappeared from FRT despite existing on R2. Recovery took 6 hours of live debugging.

### Root Causes
1. `DB_VER` mismatch — code had v3, device at v4
2. `_cloudLoad` used `instance_number.desc` — picked empty duplicate row
3. No `length > 0` guards — empty cloud arrays overwrote local data
4. `_collectFullState` had no safety check — pushed empty state to cloud
5. Heartbeat ran every 60s overwriting local with stale cloud
6. `r2Url` not rebuilt from `r2Key` after merge
7. R2 orphan cleanup could delete files if metadata was corrupted

### 9 Sync Guards (all in current build)
| # | Guard | Location |
|---|-------|----------|
| 1 | `DB_VER:4` | `ADB` init |
| 2 | `_cloudLoad` → `updated_at.desc` | CloudSync module |
| 3 | Initial sync drawings `length > 0` | `_initCloudSync` |
| 4 | Initial sync contractors/defics `length > 0` | `_initCloudSync` |
| 5 | Heartbeat contractors/defics `length > 0` | `_syncHeartbeat` |
| 6 | `_collectFullState` safety block | Blocks empty push when local has data |
| 7 | `R2Photos wifiOnly: false` | Upload on any connection |
| 8 | `saveDrawing` pdfTiled guard | Preserves blob during metadata saves |
| 9 | R2 upload race condition fix | `_r2EnqueueDrawing` inside `savePdfData.then()` |

### `_rebuildMissingR2Urls(proj)` — Safety Net
Rebuilds `r2Url` from `r2Key` for ALL photos (deficiency, entry, response, site). Called at:
- `enterProject()` — every project open
- After initial CloudSync merge
- After heartbeat merge

Pattern: `if(ph.r2Key && !ph.r2Url) ph.r2Url = WORKER_URL + '/' + ph.r2Key`

### ⚠️ KNOWN REMAINING ISSUE
`r2Url` is still being stripped somewhere in the save/load/merge chain. `_rebuildMissingR2Urls` is a workaround. Root cause needs tracing in next session. Suspect: heartbeat applies cloud data that was saved before `r2Url` was rebuilt.

### Recovery Pattern (if photos disappear but R2 has files)
1. Stop heartbeat: `clearInterval(window._syncHeartbeatTimer);CloudSync.stopAutoSave();`
2. List R2 files: `curl WORKER/list/{pid}/frt/original/`
3. Rebuild sitePhotos array from R2 file list
4. Fix defic r2Urls: iterate all photos, set `r2Url = WORKER + '/' + r2Key`
5. Save to IDB: `ADB.saveFullProject(p)`
6. Reset dedup: `CloudSync._lastSavedJson = ''`
7. Build clean state manually (strip dataUrl), push to cloud
8. Restart sync

### ⛔ ABSOLUTE RULES — NO EXCEPTIONS
- **NEVER auto-delete R2 files** — orphan cleanup is disabled permanently until proven safe
- **NEVER overwrite non-empty local arrays with empty cloud arrays** — always check `length > 0`
- **NEVER push state to cloud without verifying it has data** — `_collectFullState` safety block
- **NEVER deploy to production without testing sync on a real project first**
- **NEVER let an inspector take a build to site without verifying offline works**
- **R2 is the last line of defense** — if IDB and Supabase both lose data, R2 files survive

---

## FRT Architecture (Session 24B — current)

### File Stats
~13,425 lines, single HTML file (Session 31)

### Loading Strategy
All blob-to-dataURL is **lazy** — never at startup. Project opens in <1s regardless of size.

### Offline Sync
- **Auto-prefetch on project enter** (500ms delay): downloads all drawings, site photos, and deficiency photos from R2 to IDB if missing locally
- **`_autoDownloadR2()`** runs 3s after heartbeat: downloads remaining R2 items, saves blobs to IDB stores (`drawings`, `sitePhotos`, `photos`)
- Progress indicator: "📥 Caching for offline 4/12…" → "✅ 12 items offline ready"
- After prefetch, zero network needed for viewing
- Deficiency photo blobs saved to IDB `photos` store (not `pendingUploads`)

### Drawing Viewer
- **Tiled PDF renderer DISABLED (Session 28)** — all drawings load as `<img>` via `_openDrawingImage`
- `_openDrawingImage` loads from `r2Url` directly (no blob URLs, no IDB for R2 content)
- Fallback chain: `r2Url` → `dataUrl` → IDB blob → error message
- `img.onerror` retries from R2 URL if blob URL fails
- `dv-image` visibility restored at entry (fixes tiled→image transition)
- **Escape key:** cancels tool/copy mode ONLY — never closes viewer
- **Auto-fit:** `fitDrawing()` called on `resize` (100ms + 200ms double-fire) and `orientationchange`
- **Mobile canvas cap:** markup canvas capped at 1536px on mobile, 3000px desktop

### Mobile Drawing Viewer Layout
On `max-width:700px`:
- `dv-sidebar-tools` → horizontal scrollable strip (`overflow-x:auto`, `scrollbar-width:none`)
- `dv-sidebar-tools` desktop width rule (`width:52px!important`) scoped to `@media(min-width:701px)` so mobile can override
- Sliders: `writing-mode:horizontal-tb!important` overrides desktop `writing-mode:vertical-lr`
- Tasks panel: `order:3` (below toolbar strip)
- Toolbar padding: `padding-bottom: max(4px, env(safe-area-inset-bottom))` — prevents system bar overlap
- ⚠️ Buttons inside the drawing canvas area MUST use `ontouchend` with `event.stopPropagation()` + `event.preventDefault()` — the canvas `touchend` has `e.preventDefault()` which blocks click events

### Foldable Tasks Panel (Mobile)
- Fold button (`#dv-tasks-fold-btn`) uses `ontouchend` + `onclick` both
- `_dvToggleTasksPanel()` toggles `.collapsed` class on `#dv-tasks-panel`
- Collapsed state: `max-height:44px; overflow:hidden` (header only visible)
- Body content wrapped in `<div id="dv-tasks-body" class="dv-tasks-body-inner">` — hidden via `.dv-tasks-panel.collapsed .dv-tasks-body-inner { display:none }`
- Works on both desktop and mobile (no screen-width guard)

### Photo Lightbox
Two lightboxes — know the difference:
| Lightbox | ID | Opens Via | Markup |
|----------|----|-----------|--------|
| Gallery viewer | `#gallery-lightbox` | `showLightboxAt()` | ❌ |
| Markup lightbox | `#photo-lightbox` | `openPhotoLightboxDirect(src)` | ✅ |

NEVER call `openLightbox()` for markup — it looks for `#lightbox-overlay` which doesn't exist.

**Site photo markup flow:**
1. Capture `imgEl.src` before closing
2. `openPhotoLightboxDirect(captureSrc)` — opens markup lightbox first
3. `closePhotoLightbox()` — closes gallery after
4. Click `lb-draw-btn`

**Background scroll prevention (iOS):** `openPhotoLightboxDirect` sets `body.position='fixed'; body.width='100%'` in addition to `overflow:hidden`. Restored in `closeLightbox()`. This is required — `overflow:hidden` alone doesn't stop iOS momentum scroll.

**Markup canvas coordinate mapping (`_lbGetPos`):**
```
logW = canvas.width / canvas._dpr
sx = logW / r.width   // maps screen pixels → logical image pixels
```
`canvas._dpr` = `dpr * downscale` stored at canvas setup time.

**Canvas size cap (mobile):**
- Max dimension: 2048px on mobile (≤700px), 4096px desktop
- Prevents Safari crash on large iPhone photos (12MP at dpr=3 = 12000px canvas without cap)

### Pin Drag (Mobile)
- Long-press 500ms activates drag mode (blue glow on pin)
- Long-press timer only cancels if finger moves >8px (prevents tremor cancellation)
- `touchend` in select mode (`mkState.tool==='select'`): tapping a pin does NOT open pin editor
- Pin position saved as normalized coords (0..1): `origPinX + dx/(scale * naturalWidth)`

### Drawing Name Conflict Resolution
`_resolveDrawingNameConflict(baseName, p)` — returns Promise resolving to chosen name or null.
- Shows modal with 3 suggested names (e.g. "ABC v1", "ABC v2", "ABC v3")
- User can pick suggestion or type custom name
- Cancel aborts upload entirely
- Used by: `handleImageDrawingUpload`, `handleImageUploadToFolder`, `handlePDFUpload`
- PDF: conflict checked once before rendering starts — `go(pg)` pattern untouched

### Session Management (Hub mode)
- Soft lock: 20 min idle → blur UI, inspector selector overlay
- Hard sign-out: 8 hr idle → save + clear tokens → redirect Hub
- `signOutSession()` clears only `sb-*` keys — never project/IDB data

### CloudSync in FRT
- Auto-save every 5s via `CloudSync.startAutoSave`
- `_debouncedCloudSave()` stamps `p._cloudSyncedAt` before each push
- Heartbeat: `_syncHeartbeat()` every 60s
- `_collectFullState()` strips all base64 — Supabase only, deep copy, live records untouched
- **Safety block in `_collectFullState()`:** if local has data (drawings/defics/photos) but stripped state is empty, returns `{}` to block push
- **`_lastSavedJson` dedup:** `CloudSync.save` skips if JSON matches last saved. Can bypass with `CloudSync._lastSavedJson = ''` for force-push.
- **`_rebuildMissingR2Urls(proj)`** runs after initial sync, heartbeat, and project enter — rebuilds `r2Url` from `r2Key`

---

## PDF Architecture Standards
- `@page` margin boxes for running headers; named pages suppress headers
- Preview: white 8.5×11" on `#525659` background in new window
- JS bin-pack: `PAGE_H=912`, `CONT_H=85`
- Export bar: `#2C4770` bg, 📄 Export PDF (`#1A7A4A`), ✕ Close (`#455A64`)
- `@media print` collapses `.page` wrappers
- NEVER render raw HTML flow or inline PDF

### ⚠️ PDF Performance — Known Bottleneck
The pagination engine calls `_measure()` (inject HTML into DOM, read `offsetHeight`, clear) for every content block. With many deficiency cards + photos, this is slow — the browser's print dialog shows "Loading preview" for 10-30 seconds on large reports. The R2 photo prefetch runs before the PDF window opens, but DOM measurement of 20+ cards with embedded images is inherently expensive. A significant speedup would require switching to **estimated heights** instead of DOM measurement (e.g. calculate card height from text lines + photo count × known dimensions). Worth scoping for a future session if it's a recurring pain point.

---

## Highlighter Architecture
Rule: **ZERO opacity stacking** — offscreen composite pattern only.
- Draw at full opacity on offscreen layer, composite once at 0.3–0.35 alpha
- All highlights share one offscreen layer per render pass

---

## Permanent Technical Rules

1. **Font:** Calibri exclusively. NEVER Outfit/Rajdhani. BlairMdITC TT for wordmark ONLY.
2. **Logo:** Always full `data:image/png;base64,` prefix from `logo_base64.txt`
3. **Branding:** Burgundy `#9C2742`, Navy `#1B2438`, Dark Slate `#2C4770`
4. **PDF upload handlers:** `go(pg)` recursive pattern — NEVER rewrite or modify
5. **OffscreenCanvas:** NEVER use — no Safari/iOS support
6. **Pen rendering:** NEVER `quadraticCurveTo` — `lineTo` only
7. **Highlighter:** NEVER stack opacity — offscreen composite only
8. **Photo gallery:** Always `_buildUnifiedPhotoList()` — never separate lists
9. **One `ask_user_input` per turn, max 1 question — NO EXCEPTIONS**
10. **Surgical edits only** — `str_replace` + JS syntax check after every change
11. **Supabase anon key** safe for frontend. R2/service_role keys NEVER in frontend
12. **Stable filenames:** No version numbers in deployed filenames
13. **Cloudflare email:** Always split as `${'mail'+'@'+'arencon.com'}` in template literals
14. **No AHJ/Municipality, Permit No., or Engineer of Record fields** in any tool
15. **Leave dialog:** 3-button: "Save & Leave" (green), "Leave without saving", "Cancel"
16. **R2 uploads:** Always on any connection — never Wi-Fi gate
17. **Loading overlay:** NEVER replace `.main-wrap` innerHTML — `position:fixed` on `body`
18. **Blob loading:** NEVER convert blobs at `loadFullProject` — always lazy
19. **Auto-select after draw:** DISABLED — tool stays active after placing stroke
20. **R2 GET = no auth** — plain `fetch(src)`, no headers. See R2 Auth section.
21. **IDB = permanent backup** — `ADB.saveDrawing` always saves blob. `delete dataUrl` only in `_collectFullState()` deep copy.
22. **Dark mode key:** `'ARENCON_Dark'` everywhere — unified across all tools and Hub
23. **Gallery lightbox markup:** `openPhotoLightboxDirect(src)` — NEVER `openLightbox()`
24. **JSON.stringify in onclick:** NEVER — use `dataset` to pass arrays/objects
25. **Cross-device sync:** Last-write-wins via `_cloudSyncedAt`. NEVER "local always wins."
26. **Orphan cleanup:** Event-driven from `enterProject()` — NEVER timer-based
27. **R2 list path:** `/list/{pid}/{tool}/{type}/` — NO `/photos/` in list path
28. **beforeunload in Hub mode:** Suppress via URL param check, not `_csHubMode` flag
29. **Escape in drawing viewer:** Cancel tool/copy mode ONLY — never close viewer
30. **`_mkSelectedIds[]`:** Always clear with `_mkSelectedId=null` — never one without the other
31. **Mobile canvas buttons inside drawing area:** Must use `ontouchend` + `event.stopPropagation()` + `event.preventDefault()` — canvas `touchend` has `e.preventDefault()` blocking click events
32. **iOS scroll lock in lightbox:** Set `body.position='fixed'; body.width='100%'` in addition to `overflow:hidden`. `overflow:hidden` alone doesn't stop iOS momentum scroll.
33. **Drawing name conflicts:** Never silently rename — show `_resolveDrawingNameConflict()` modal
34. **Mobile markup canvas cap:** 1536px max on mobile, 2048px for photo lightbox — prevents Safari/WebKit crash
35. **Sign-out anti-auto-login:** `sessionStorage.ARENCON_signed_out` flag prevents `tryRestoreSession` from auto-logging in after explicit logout
36. **R2 orphan cleanup: USER-INITIATED ONLY** — 🧹 R2 Cleanup button in FRT header (Hub mode). NEVER auto-run. Scans both UUID and slug paths.
37. **CloudSync merge guards** — NEVER apply cloud array to local if cloud array is empty (`length === 0`). Applies to drawings, contractors, generalDeficiencies, sitePhotos.
38. **`_rebuildMissingR2Urls`** — MUST run after every cloud merge and every project enter. Safety net for lost `r2Url` values.
39. **`_collectFullState` safety block** — if local has data but stripped state is empty, return `{}` to block cloud push. NEVER remove this check.
40. **`_cloudLoad` ordering** — ALWAYS `updated_at.desc`. NEVER `instance_number.desc` (highest instance may be empty duplicate).
41. **DB_VER must be 4** — devices already at version 4. NEVER go backwards. Check before every deploy.
42. **R2 uploads: any connection** — `wifiOnly` default is `false`. Photos upload immediately on cell data. NEVER change back to Wi-Fi-only default.
43. **Photos taken through FRT camera do NOT save to device camera roll** — browser camera input bypasses photo library. If IDB + R2 both fail, photos are gone. Advise inspectors to use native camera for critical photos.

### Session 27 Additions (Sync Architecture)
44. **Cloud owns structure, local owns binary** — cloud determines what items exist (drawings, defics, photos). Local only enriches with R2 fields and blob references. If cloud doesn't have an item, it was DELETED — do NOT re-add.
45. **NEVER call saveToLS() inside sync/merge chain** — it triggers `_debouncedCloudSave` which races with explicit `CloudSync.save` calls. Use `ADB.saveFullProject` + direct `CloudSync.save` instead.
46. **Auto-save stamps `_cloudSyncedAt` before every push** — prevents heartbeat from seeing its own pushes as "newer cloud data."
47. **Heartbeat stamps `_cloudSyncedAt = now` after applying** — NOT `cloudUpdatedAt`. Prevents timestamp gap from growing across heartbeat cycles.
48. **Heartbeat mutex `_heartbeatRunning`** — prevents stacked concurrent runs. `finally` block always releases.
49. **`_autoDedup` must be a pure function** — modifies `proj.drawings` in memory only. Caller is responsible for saving to IDB and cloud. NEVER call `saveToLS()` from within dedup.
50. **`_lastSavedJson` must be reset before dedup push** — `CloudSync._lastSavedJson=''` ensures the deduped state actually pushes (won't match the pre-dedup JSON).
51. **Pin CSS: NEVER include `circle` in priority selectors** — `.pin-marker[data-priority="high"] path{fill:...}` only. Adding `circle` overrides the white number background.
52. **Pin SVG viewBox: `0 0 32 42`** — teardrop centered at x=16, white circle at `cx=16 cy=14 r=9`, text font-size auto-sized by digit count (14/11/9).
53. **PDF recovery check REMOVED** — auto-recovery from pdfData caused infinite loops with corrupted data. Use "Fix Blurry" button for one-time fix instead.
54. **Markup R2 load gated by `markupR2Saved`** — only fetch markup JSON from R2 if the flag is set. Suppresses 404 noise for drawings that never had markup uploaded.
55. **Continuous camera: REMOVED (Session 42B)** — iOS/Android browsers block programmatic `inp.click()` outside user gesture context. `setTimeout` re-click doesn't work. Camera buttons do simple one-shot capture only. Do NOT re-implement.
56. **PDF report title: always "Field Review Report"** — "Plain Report" removed. Both formats use same title.
57. **PDF photo sizes: 160×160px** — evidence, response, and minimap photos all 160px (was 140px).
58. **PDF minimap pre-fetch** — drawing images loaded from blob cache → IDB → R2 via `Promise.all` before rendering starts. Required because `dataUrl` is stripped in R2-first architecture.

### Session 28 Additions (Drawing Pipeline Rewrite + Sync Dedup Fix)
59. **`CloudSync.resetLastSaved()`** — ALWAYS use this method. NEVER `CloudSync._lastSavedJson=''` (it's a no-op — doesn't touch the closure variable).
60. **`_syncLock` flag** — blocks `_debouncedCloudSave` during init/heartbeat merge. Set `true` before merge, `false` after.
61. **`_verifiedDedupSave`** — saves → re-loads → verifies count → raw PATCHes ALL rows if wrong.
62. **Heartbeat `dataActuallyChanged`** — compares cloud drawing count + defic count vs local. Skips merge if both match.
63. **`_collectFullState` strips internal fields** — `_cloudSyncedAt`, `_localModifiedAt`, `_hasLocalBlob`, and `markupObjects` all deleted from deep copy.
64. **`markupR2Saved` preserved in `_mergeDrawing`** — since `markupObjects` stripped from cloud state.
65. **`_csR2Folder`** — sanitized slug from URL params `pn` + `pname`. Falls back to UUID via `_getR2FolderId()`.
66. **`_makeR2FolderSlug(pn, pname)`** — spaces→underscores, strip unsafe chars, max 80 chars.
67. **All `hubId` assignments use `_getR2FolderId()`** — never `_csProjectId` directly for new R2 uploads.
68. **`_r2LoadMarkup` tries slug first, falls back to UUID.**
69. **`_requeuePendingUploads` checks both UUID and slug paths.**
70. **~~Tiled PDF renderer PERMANENTLY DISABLED~~ — SUPERSEDED by Session 56.** `openDrawingViewer` routes `pdfTiled` drawings to `_openTiledPDF` (individual tile canvases). Non-PDF drawings still use `_openDrawingImage`.
71. **~~PDF upload renders at 4x scale~~ — SUPERSEDED.** PDF uploads now store raw PDF ArrayBuffer in `pdfData` IDB store + JPEG thumb for gallery. `pdfTiled:true` set on drawing record. Viewer renders on demand via `_openTiledPDF` with individual tile canvases (Session 56).
72. **`_openDrawingImage` priority:** `r2Url` → direct `img.src`. `dataUrl` → direct `img.src`. Last resort → IDB blob. NO blob URLs for R2 content.
73. **`dv-image` visibility:** `_openDrawingImage` ALWAYS restores `img.style.display=''` and hides tile canvas at entry.
74. **All `img.src=dwg.dataUrl` references updated** to `dwg.dataUrl||dwg.r2Url||''` with `crossOrigin='anonymous'`. Includes: mini-map, PDF export, rotate.
75. **ArrayBuffer clone before pdf.js:** `arrayBuf.slice(0)` immediately after `reader.onload`, before `pdfjsLib.getDocument` which detaches the original.
76. **`_r2CleanupOrphans()` user-initiated only** — 🧹 button in header. Scans both UUID and slug paths.
77. **`sessionStorage.ARENCON_signed_out`** — set by FRT + Hub on sign-out, checked by Hub on restore.

### Session 29 Additions (PDF Export Overhaul + Heartbeat Fix + Filename + Visual Audit)
78. **Heartbeat early return on unchanged data** — when cloud drawing count + defic count match local, stamp `_cloudSyncedAt = cloudUpdatedAt` and return immediately. No merge, no push, no re-render.
79. **PDF pages are discrete `.page` divs** — JS bin-pack measurement determines page breaks, NOT CSS `page-break-inside:avoid`. Each page is a white 8.5×11" div on gray background.
80. **PDF running header: OBC 3-line format** — Pages 2+: Left = Client / Address / "Field Review Report #N - Scope". Right = ProjNo Rev Page N / blank / Date. Separated by `1px solid #999`. No page footer.
81. **No page footer on PDF** — all identification info is in the running header. Mark explicitly removed footer.
82. **Client abbreviation rules for filenames:** All-caps ≤5 chars → use it (FGF, IFAB). Has `&` → initials with `&` (G&G). Strip ONLY legal suffixes (Ltd/Inc/Corp/Co/LLC/LLP). NEVER strip Canada/Group/International/Holdings. 1 word remaining → spell out (Caplink). 2+ words → initials (IM, MLF).
83. **Smart filename format:** `{ProjNo} {ClientAbbrev} {StreetNum} {Street} {Building max 3 words} {ScopeAbbrev} {Rev}`. Scope: Sprinkler→Sprkl, Fire Alarm→FA, Standpipe→Stdp, Commissioning→Comm, etc. Strip "Automatic"/"System" from building name.
84. **`CloudSync.instanceNumber` getter** — exposed on public API. Used by PDF export for "Field Review Report #N". Falls back to 1 in standalone mode.
85. **R2 GET in PDF prefetch: NO Bearer token** — plain `fetch(url)`, no auth headers. Rule 20 applies to all R2 GET including PDF photo pre-fetch.
86. **Custom modal replacement MUST be standalone change** — never combined with other changes. The async conversion affects 42+ functions. Consider callback pattern `_aConfirm(msg, callback)` instead of async/await to avoid converting function signatures.
87. **Dead code removal is safe but must be standalone** — 49 confirmed dead functions, brace-aware Python removal tested and working. Apply separately from any other changes.

### Session 30 Additions (Offline Prefetch + Sync Manifest + Revision System + Visual Overhaul)
88. **Drawing viewer loads IDB blob first** — IDB → R2 URL → dataUrl fallback. Never hit R2 if local blob exists.
89. **Auto-prefetch on project enter** — 500ms delay, sequential fetch, no user action needed. Indicator at bottom-right.
90. **SyncManifest in localStorage** — every save records unsynced state. On startup, checks for data loss and shows red banner if IDB was evicted before sync.
91. **Revision scheme: A##→B##→B##A##→B(#+1)** — drafts are A-series, issuance is B-series, revisions append A## suffix, re-issuance bumps B number and drops suffix.
92. **Issue modal replaces confirm()** — 3 options (Issue/Revise/Revert), dark/light mode, no async conversion.
93. **Unified dark mode palette** — page `#0f1318`, card `#1e2533`, border `#2a3040`, text `#d0d8f0`, labels `#8a94b0`, inputs `#151a24`. Applied to all 7 tools.

### Session 31 Additions (Console Noise + PDF Splitting + Header Redesign + UX Polish)
94. **`_DEBUG` flag guards all non-critical console output** — `_dbg()`/`_dbw()` replace `console.log`/`console.warn`. Enable with `_DEBUG=true`. `console.error` always visible.
95. **Oversized deficiency cards split at `dc-split` boundaries** — pagination engine handles splitting inside page layout loop where `_measure()` is available. NEVER split in `_buildDefCardHtml` (it runs before `_measure` exists).
96. **Deficiency photo blobs saved to IDB `photos` store** — not `pendingUploads`. Both `_prefetchDrawingsForOffline` and `_autoDownloadR2` use `photos` store.
97. **Header button order: Reports → Issue → Review → Sign Out → ⚙️ More ▾ → dark toggle.** More dropdown contains Download JSON (with confirm), Repair tools (Hub only), Reset options.
98. **Corp/Corporation NOT stripped from client names** — included in initials. Only strip: Ltd, Limited, Inc, Incorporated, Co, Company, LLC, LLP.
99. **Clickable status badge** — ISSUED/DRAFT/REVISION badge `onclick="issueReport()"`. Hover: brightness + scale. Second entry point for revision modal.
100. **Sync indicator hidden in Hub mode** — "No folder" meaningless when CloudSync handles saves.
101. **Dropdown z-index: header-actions z-index:10, section-nav z-index:1** — all dropdowns render above tab bar.

### Session 32 Additions (Mobile Drawing Viewer Overhaul)
102. **Markup canvas is lazy-allocated on mobile** — `_lazyCanvasSize()` sets CSS size only on drawing open. Full pixel buffer allocation deferred to `resizeMarkupCanvas()` which runs only when user selects a markup tool. `closeDrawingViewer()` zeros canvas dimensions to free GPU memory.
103. **Two-finger pan+zoom, single-finger disabled on mobile** — `_isMobileDevice` flag gates single-finger pan. Two-finger gestures track midpoint (pan) and distance (zoom) simultaneously. `touch-action:none` on `.dv-canvas-area` prevents browser interference.
104. **Mobile canvas cap is 1200px** (was 2000). Desktop remains 3000px. Detection: iOS UA or (width≤900 AND touch). Reduces GPU memory ~3x.

### Session 33 Additions (Mobile Polish + Text Size + Steppers)
105. **Text size S/M via `--ts` CSS variable** — `calc(Xpx + var(--ts))` in all readable font-size rules. `body.text-m{--ts:2px}`. Default M. PDF text excluded. No Large option.
106. **Drawing viewer toolbar at TOP on mobile** — sidebar-tools in overlay flow below header. Context bar with +/− steppers when tool active.
107. **ALL tools use +/− tap steppers** for thickness, opacity, text size. No sliders anywhere. Applies to drawing viewer, photo lightbox, and all future markup features.
108. **`buildSmartFilename` canonical in Hub** — passed via `&sfn=` URL param. Tools use Hub prefix + local revision.
109. **Photo lightbox touch: `preventDefault()` in _lbDown/_lbMove**, check `e.touches.length`, no DPR scaling, `drawImage` always with explicit width/height params.
110. **`_lbRenderAll` and eraser must use `drawImage(img,0,0,canvas.width,canvas.height)`** — never `drawImage(img,0,0)` without size params. Natural image size ≠ buffer size when capped.

### Session 34 Additions (Custom Modals + PIN Lock + Dead Code Removal)
111. **All native dialogs replaced** — `_aConfirm(msg, onOk, okText)`, `_aPrompt(msg, defVal, onOk)`, `_aAlert(msg)`. Callback pattern, no async conversion. Dark mode aware. Zero `confirm()`, `alert()`, or `prompt()` calls remain in FRT.
112. **PIN lock via Hub** — `profiles.pin_hash` (SHA-256). 4hr soft lock (numpad overlay), 8hr hard sign-out. Activity tracked in `localStorage('ARENCON_lastActivity')` shared across Hub + tools. 5 wrong attempts → forced sign-out. No PIN set = no lock.
113. **All tools must write `ARENCON_lastActivity`** on click/touch/keydown (throttled 30s). Hub and FRT have it. Remaining tools need it added.
114. **Review Mode permanently removed** — all rv-changed CSS, review banner, snapshot/diff logic, header Review button, and 15 `_scheduleReviewUpdate()` callsites stripped. Principals review PDF output, not live tool.
115. **Standalone Dashboard permanently removed** — `renderDashboard`, project CRUD, context menus all stripped. FRT is Hub-only. `goToDashboard()` redirects to Hub.
116. **Folder Save System permanently removed** — `chooseFolder`, `saveAsToFolder`, `ADB.pickFolder`, `ADB.writeLockFile`, lock takeover UI all stripped. CloudSync replaced it.
117. **Header button order updated: Reports → Issue → Sign Out → ⚙️ More ▾ → dark toggle.** Review button removed.

### Session 35 Additions (Pump Tool Parity)
118. **Pump tool headers match FRT pattern** — Reports → Issue → Sign Out → ⚙️ More ▾ → Dark → Aa → ☰. Reports/Issue/SignOut hidden by default, shown in Hub mode.
119. **`_collectCloudState()` strips base64 photos** — all CloudSync.save() calls use this. Local IDB keeps full base64 via `collectState()`.
120. **⚙️ More ▾ dropdown** — `.hdr-repair-menu` CSS class, click-outside-to-close. Contains Download JSON + Reset options.

### Session 36 Additions (R2 Pump Integration + Hub Cleanup + TWA)
121. **Pump R2 key format:** `photos/{projectId}/{toolKey}/original/{fname}`. Photo objects: `{d, n, id, r2Key, r2Status, r2Url}`.
122. **AutoSave must use `_collectCloudState`** — never raw `collectState`. Fixed bug where full base64 was pushed to Supabase.
123. **`_cloudLoad` ordering** — all tools use `updated_at.desc`. Fixed from `instance_number.desc` in pump tools.
124. **Text size button** — all tools show `M` or `S`, no `Aa` prefix. Mobile: `Text: Medium`.
125. **Hub toolbar layout** — Search → My/All → Sort → Select → More ▾ → + New Project. Archived/Deleted/Export All in dropdown.
126. **Instance titles** — `buildSmartFilename(proj) + toolPrefix` as default. Custom label takes priority.
127. **TWA Digital Asset Links** — `assetlinks.json` at root domain repo, not project subdirectory. Android checks `domain/.well-known/`, not `domain/repo/.well-known/`.
128. **TWA keystore** — must be backed up. Lose it = cannot update APK under same package name.

### Session 37 Additions (PDF Smart Filenames)
129. **PDF export `<title>` must use smart filename** — `buildSmartFilename(p)` or `_csHubSfn` + tool-specific report name + instance number (if >1) + revision. Browser uses `<title>` as default "Save as PDF" filename.
130. **Electric pump section-nav must NOT have `style="display:none"`** — pump tools show all tabs immediately.

### Session 38 Additions (R2 Slug + Header Color + Migration)
131. **R2 folder slug** — `_makeR2FolderSlug(pn, pname)` builds human-readable folder from project number + name. All tools use slug for new uploads, falling back to UUID.
132. **Supabase `tool_data` column is `data`** (not `state`). Contains JSON with `r2Key` and `r2Url` references.
133. **R2 Migration tool** column name is `data`. Must use `authHeaders()` (with Bearer token) for PATCH operations due to RLS.
134. **Header color** — all field tools use Hub's navy gradient: light `linear-gradient(135deg, #1B2438, #243048)`, dark `linear-gradient(135deg, #0F172A, #1E293B)`. NOT burgundy `#9C2742`.
135. **Chart annotation label CSS** must NOT include forced `color` — per-dataset colors from `_chartLabelColor()` must show through.
136. **Highlighter composite alpha** = 0.55 (not 0.35) for visibility on dark backgrounds.

### Session 39 Additions (Styling Overhaul + PDF Fixes)
137. **Tab bar color** — `.section-nav` uses same navy gradient as header (light + dark).
138. **Section titles in pump tools** — use `card-header` class inside cards (connected to card-body), NOT floating `.section-title` divs. Exception: multi-card sections (s3) can use floating `.section-title` between card groups.
139. **Dark mode card headers** — muted gradients with `!important`: default `#5a1a2a→#3d1220`, .mid `#1e2a40→#172235`, .red `#5a1a1a→#3d1212`. Must override inline styles.
140. **Verdict banner dark mode** — translucent bg + colored text (green `#4ade80` / amber `#fbbf24` / red `#f87171`). NEVER solid bright bg in dark mode.
141. **PDF verdict must check hasAnyNo** — iterate all checklist sections for `status==='no'`. Any NO → downgrade to CONDITIONAL PASS at best. Must match UI verdict logic.
142. **PDF test type detection** — use `input[name="pump-test-type"]:checked` radio, fallback to `⦿` character in button text. NEVER use `button[style*="var(--red)"]` CSS selector.
143. **Text size toggle button** — same padding/font-size as `.hdr-btn` (`padding:5px 12px`, `font-size:calc(12px + var(--ts))`). No `min-height`.
144. **PDF Section 4 must be test-type-aware** — only render 3-Point table when std/both, only PLD table when pld/both. Include Water Supply & Demand data tables (static/residual + system demand).

### Session 40 Additions (R2 Folder Fix + Photo Dedup + Dark Mode)
145. **`_rebuildMissingR2Urls` is ALWAYS-RUN** — rebuilds ALL r2Keys/r2Urls using current `_getR2FolderId()` on every project load. Extracts type+filename from r2Key, reconstructs with current slug folder. Not just when r2Url is missing.
146. **`_loadR2OrDirect` has 404 fallback** — tries alternate folder ID (UUID↔slug) on 404. Never fails silently on first 404.
147. **`processEntryPhotos` must use `_syncDeficPhotos`** — NEVER directly push to `d.photos`. The `_syncDeficPhotos` function is the ONLY way to update `d.photos` (dedup by photo ID).
148. **Hub `_pgExtractPhotos` uses `seenIds`** — prevents double-counting photos from both `d.entries[].photos` and `d.photos`.
149. **Dark mode buttons** — ALL action buttons in FRT and Hub use translucent `rgba()` backgrounds with soft-colored text in dark mode. NEVER solid bright colors. Applies to: card headers, response buttons, camera button, modal buttons, header buttons, Hub action buttons.
150. **Section titles in FRT** — "Project Information" and "Deficiency Log" use `.card-header` inside cards (connected), NOT floating `.section-title`. Same pattern as "Drawings".
151. **Single cloud status indicator** — header `#cloud-status` only. `#pb-cloud` in project bar permanently hidden (`display:none!important` + JS removed).
152. **Hub `r2RefreshStatus`** — must use `_pgMakeR2FolderSlug` to build slug folder for R2 list paths. NEVER use raw UUID project ID.
153. **Hub `_pgResolveR2Src` ALWAYS rebuilds from r2Key** — never trust stored `r2Url`. `r2Url` in Supabase may be stale (UUID path when files are at slug path). Only fall back to `r2Url` if `r2Key` is missing.
154. **Hub `_pgObserveThumbs` must check `res.ok`** — R2 GET 404 returns a body; without check, 404 body gets blobified as `img.src` → broken image. Always check `res.ok` before `.blob()`.
155. **Hub R2 GET = no auth** — same as FRT Rule 20. `_pgObserveThumbs` uses plain `fetch(src)`, no Authorization header.

### Session 41 Additions (General Priority + Photo Reassign + Ghost Fix + Tiled Crispness)
156. **General priority is NOT a deficiency** — status dropdown disabled ("— Not a deficiency —"), IAR disabled, `setObsPriority` sets `status='N/A'` when all entries general. PDF report excludes general-priority items. Label is "General" (not "General / Cosmetic").
157. **Photo gallery general annotations** — general-priority pin photos show green `#1A7A4A` badge "General · Pin #X". `_buildUnifiedPhotoList` includes `deficPriority` field. Photo filter menu has "General photos" option.
158. **Photo reassignment** — `reassignSelectedPhotos()` in Actions dropdown opens modal with destination picker. `_doReassign()` moves photo records between site/pin, calls `_syncDeficPhotos` on both source and destination.
159. **Ghost photo hiding** — FRT `_loadR2OrDirect` and Hub `_pgObserveThumbs` hide entire thumbnail container on R2 404. Hub lightbox: no auth on R2 GET, checks `res.ok`. Ghost records remain in data (hidden, not deleted).
160. **Hub dark mode buttons muted** — toggle active, primary, secondary all use translucent `rgba()` with soft text. Same pattern as FRT Rule 149. No conflicting duplicate rules.
161. **Tiled drawing memory tuning** — `baseScale` derived from stored `drawW/pageW` (typically 1.5-2.0). `maxRenderScale=4.0` (zoom-in cap), `maxTiles=24`. Individual tile canvases positioned in `dv-tiles-layer`. `image-rendering:auto`. NEVER set baseScale above 2.0 (iPad OOM risk).
162. **Single-finger pan on mobile when zoomed** — allowed when `dvState.scale > fitScale * 1.08`. At fit scale, single finger does nothing. Both touchstart and touchmove updated.
163. **Pin modal scrollbar hidden** — `scrollbar-width:none` + `::-webkit-scrollbar{display:none}` on `.pin-modal` and `.pin-panel-body`.
164. **Card header font-size** — `calc(15px + var(--ts))`, not fixed `17px`. Responds to text-size toggle.

### Session 42 Additions (Pump Tool Overhaul)
165. **Pump tools: NO `.section-title` elements** — all panel headers use `.card-header` (default burgundy). `.section-title` CSS exists but is dead/unused. Zero instances in both diesel and electric.
166. **Pump tools: NO `.card-header.mid` elements** — all card headers use default `.card-header`. `.mid` CSS exists but is dead/unused. Inline `style=""` overrides (witness sigs, Overall Test Result) still work.
167. **Pump test type buttons: muted orange** — active `#c27a2a` (light), `#6b4c1a` (dark). `setPumpTestType()` syncs all button instances across 4a + 4b tabs.
168. **`collectState` testType** — detect via `⦿` character in `.pump-type-btns button` text. NEVER use `input[name="pump-test-type"]:checked` (radio inputs don't exist).
169. **`restoreState` testType** — call `setPumpTestType(s.testType)` unconditionally. NEVER gate behind radio element check.
170. **Sketch highlight composite** — use `'source-over'`, NEVER `'darken'`. `'darken'` invisible on dark backgrounds. Alpha = 0.55 (Rule 136).
171. **Sketch highlight non-stacking** — call `_skRedraw(uid)` after every highlight stroke commit (mouseup/mouseleave/touchend).
172. **Dark mode button palette (pump tools)** — matches FRT: `.tool-btn` default `#323a4e`, active `rgba(156,39,66,.45)`. `.btn-outline.btn-sm` `#242c3a`. Hover accents `#9C2742`.
173. **Camera/Upload button font size** — `calc(12.5px + var(--ts))`, never hardcoded `11px`.
174. **Diesel 4b has pump-type-btns** — users switch test type from either 4a or 4b tab.

### Session 42B Additions (FRT + Hub Major Overhaul)
175. **FRT Hub mode auth gate** — 2-layer: (1) check `sb-access-token` in localStorage before `_csHubMode=true` → redirect to Hub if missing. (2) After `CloudSync.init()`, check `info.userId` → redirect if null. ALL tools must implement this pattern.
176. **Markup save: original preserved** — when marking up a deficiency photo, save unmarked original as new site photo (`sp_orig_` prefix, `site_` R2 filename, "(original)" caption). Marked version replaces defic photo in-place via `_replacePhotoInProject`. NEVER save marked copy to sitePhotos.
177. **Hub photo gallery: click=select** — single click toggles selection, shift+click range selects, double-click opens lightbox. NOT single-click-to-lightbox.
178. **Hub photo gallery: grouped by Tool→Date** — `_pgRender` groups by `ph.tool` first (foldable sections via `pgToggleToolSection`), then by date within each tool. Section headers show tool icon + name + photo count.
179. **Continuous camera: REMOVED** — browser security blocks programmatic file input clicks outside user gesture. Do not re-implement. Camera buttons do one-shot capture only.
180. **`saveSitePhoto` must preserve existing IDB blobs** — when `photo.dataUrl` is empty (R2 mode), read existing record from IDB via `ADB.get` and carry forward `dataBlob`. Prevents offline prefetch cache from being wiped by auto-save. ALL tools with photos must follow this pattern.
181. **Hub `pgDeleteOne` placeholder** — currently shows read-only toast. Session 43 will implement actual deletion via Supabase PATCH + R2 delete.
182. **Custom SVG tool icons** — inline SVGs in `_toolSvg` object, referenced by `AVAILABLE_TOOLS[key].icon`. 20px on project cards, 28px on tool launch cards. Each tool has distinct color. FRT=burgundy clipboard, Diesel=orange engine, Electric=blue motor+bolt, IST=red alarm+waves, OBC=green doc+checkmark, DD=purple checklist.
183. **Tool short names** — `AVAILABLE_TOOLS[key].short`: FRT, DFP, EFP, IST, OBC, DD. Shown on project cards next to SVG icon via `.tool-short` CSS class.
184. **PDF filename abbreviations** — "Report"→"Rpt", "Upgrade"→"Upg". Contractor name before revision when filtered (e.g. `...Field Review Rpt #1 Vipond B01`). `w.document.title = _pdfTitle` for Save As dialog. No double revision — strip rev from smart name base before appending.
185. **QR in tool headers, not Hub tool cards** — each tool has its own 📱 button (Hub mode only, hidden by default, shown in Hub init). Lazy qrcodejs loading from cdnjs. Uses `window.location.href` as QR content. Hub tool cards have no QR buttons.
186. **PDF section headers connected** — `.sh` margin-bottom:0, border-radius:6px top-only, letter-spacing:.3px. `.sb` background:#FAFBFC, no border-top, border-radius:0 0 6px 6px. `.ch` contractor headers same pattern. Visual card connection between header and content.
187. **PDF Contractor(s) field in Project Info** — shows all contractor names when "All" selected, or specific contractor when filtered. Built dynamically from `p.contractors[]`. Replaces contractor name in title header.
188. **Offline prefetch 404 fallback** — `_doOfflinePrefetch` tries alternate R2 folder path (UUID↔slug swap) on 404, same recovery pattern as `_loadR2OrDirect`. Updates `item.r2Url` on successful alt fetch.
189. **Hub photo gallery: delete + download hover buttons** — 🗑 delete (top-right, 26px red circle) and ⬇ download (bottom-right, 26px green circle) appear on hover. Checkbox always visible (22px). R2 cloud icon at bottom-left.
190. **Per-contractor PDF export** — `_exportPDFWithCache` accepts `ctrFilter` param. PDF picker modal has contractor scope dropdown. `reportDefs` filtered by contractor ID. Summary table adjusts to show only filtered contractor.
191. **`AVAILABLE_TOOLS` has `pdfName` field** — used for PDF filename across all tools (e.g. "Field Review Rpt", "Diesel Pump Rpt"). Applied when building `_pdfTitle`.


### Session 48 Additions (Non-Destructive Photo Markup)

233. **Non-destructive photo markup** — `markupObjects` JSON array stored on photo records (site + deficiency). Original image NEVER modified. Composited preview (`markedPreview`) generated for thumbnails. Objects re-editable on re-open via `_lbShowCurrentDirect` and `lightboxDrawMode`.

234. **`_markupPreviewCache`** — global in-memory cache keyed by photo ID `{preview, objects}`. Survives object reference changes from save/load/merge. `_buildUnifiedPhotoList` and `_stripPh` fall back to cache. Cleared on revert.

235. **`_autoRegenerateMarkupPreviews()`** — runs 2s after `enterProject`. Scans all photos for `markupObjects` without `markedPreview`. Fetches original, renders objects via `_lbDrawObj` on offscreen canvas, generates base64. Re-renders gallery on completion.

236. **`markedPreview` NOT persisted in IDB project metadata** — too large. Regenerated from `markupObjects` + original image after refresh. `markedR2Url` fallback once R2 upload completes.

237. **Thumb src priority** — `markedPreview` (base64, `length>100`) → `_markupPreviewCache` → `markedR2Url` (`indexOf('http')===0`) → original. Prevents R2 keys from being used as image URLs.

238. **`_stripPh` preserves markup fields** — `markupObjects`, `_origBackupId`, `markedR2Key`, `markedR2Url` survive `ADB.saveProject`. Falls back to `_markupPreviewCache`.

239. **`_collectFullState` keeps `markupObjects` on defic photos** — only strips `dataUrl` and `markedPreview`. Objects survive cloud round-trip.

240. **`_mergeDeficR2Fields` preserves markup fields** — `markupObjects`, `markedPreview`, `markedR2Key`, `markedR2Url`, `_origBackupId` from local during heartbeat merge.

241. **Delete key in markup lightbox** — checks `activeElement` is body OR canvas. Also checks `_lbSelectedIds` for multi-select. Canvas `tabindex="0"`.

242. **Markup lightbox close/nav inside `lb-canvas-wrap`** — positioned relative to photo, not viewport. Matches gallery lightbox.

243. **`_deficPhotoThumbSrc(ph)`** — returns markup preview for display. Also checks cache even without `markupObjects` on record.

244. **"(original)" backup: push inside async callback** — never push with empty `dataUrl`. `_origPushed` flag prevents duplicates.

---

## ⚠️ Production Readiness — Remaining Gaps

### 1. ✅ Service Worker + PWA — DONE (Session 30)
### 2. ✅ Text Size S/M Toggle — DONE (Session 33, Hub + FRT)
### 3. ✅ Smart Filename → Hub-Based — DONE (Session 33)
### 4. ✅ Custom Modal Replacement — DONE (Session 34)
### 5. ✅ Mobile Drawing Viewer — DONE (Sessions 32-33)
### 6. PIN Lock + Inactivity Management — PARTIALLY DONE
Hub has full PIN lock (numpad overlay, SHA-256 verify, 4hr soft lock, 8hr hard sign-out).
FRT and ALL other tools still need PIN lock overlay + inactivity checker ported from Hub.
Activity tracking uses shared localStorage key `ARENCON_lastActivity` — already cross-tool.
Each tool needs: PIN overlay HTML, CSS, JS (checker + verify), profile PIN hash fetch.

### 7. CloudSync Rollout (IST, OBC, DD) — PENDING
Three tools still IDB-only. Biggest functional gap.

### 8. Activity Stamp for Remaining Tools — PENDING
Diesel, Electric, IST, OBC, DD need the 6-line inactivity tracker snippet.

### 9. Text Size + Stepper for Other Tools — PENDING
IST, OBC, DD still need `calc(--ts)` and stepper conversion. Diesel + Electric done (Session 35).

### 10. Supabase Migration — PENDING
`ALTER TABLE profiles ADD COLUMN pin_hash TEXT;`

### 11. ✅ Android TWA Wrapper — DONE (Session 36)
Full-screen app, storage permanence, Digital Asset Links verified.

### 12. Auth Gate for All Tools — PENDING (Session 43)
FRT has 2-layer auth gate. Diesel, Electric, IST, OBC, DD still need it.

### 13. Lightbox Zoom — PENDING (Session 43)
Mouse wheel (PC) + pinch-to-zoom (mobile) + pan. Needed in FRT photo lightbox (canvas) and Hub gallery lightbox (img).

### 14. QR Code for All Tools — PENDING (Session 43)
FRT has 📱 QR button in header (Hub mode). Other tools need same pattern added.

---

## Session 40 — R2 Folder Mismatch & Photo Duplication (2026-03-23)

### UUID↔Slug R2 Folder Mismatch
**Problem**: r2Keys in local IDB used UUID project folder but actual R2 files stored under slug folder after Session 39 migration. Office PC IDB had stale data → all photos 404.
**Fix**: `_rebuildMissingR2Urls` now ALWAYS rewrites r2Keys using `_getR2FolderId()` slug on every project load. `_loadR2OrDirect` has 404 fallback that tries alternate folder.
**Hub**: `_pgResolveR2Src` helper rebuilds URLs from r2Key using slug. `r2RefreshStatus` uses slug for R2 list paths.

### Photo Duplication Bug
**Problem**: `processEntryPhotos` pushed same rec to both `d.entries[ei].photos` AND `d.photos` → 2× records per photo. Gallery showed duplicates. Deleting one left ghost with invalid r2Key.
**Fix**: `processEntryPhotos` now calls `_syncDeficPhotos(f.defic)` instead of direct push. Hub `_pgExtractPhotos` uses `seenIds` dedup.

### Section Title Structure
"Project Information" and "Deficiency Log" converted from floating `.section-title` to `.card-header` inside cards — connected to body, same as "Drawings".

### Dark Mode Muting (Session 40)
ALL buttons in FRT and Hub use translucent backgrounds in dark mode:
- Card headers: muted gradients with `!important`
- Response/camera/modal/header buttons: `rgba()` translucent + soft text
- Hub Archive/Delete: translucent orange/red

### Single Cloud Status
`#pb-cloud` in project bar permanently hidden. Header cloud dot is the only indicator.

---

### Session 43 Additions (Lightbox Zoom, Photo Gallery, QR, PDF Redesign)

192. **Lightbox zoom: cursor-anchored math** — `imgX = (mx - pan) / scale; newPan = mx - imgX * newScale`. The image point under the cursor stays fixed during zoom. Applied to all 3 lightbox zoom functions (`_glbZoomAt`, `_mlbZoomAt`, `_hlbZoomAt`). NEVER use the old center-pivot formula (`cx - r.left - r.width/2`).

193. **Lightbox zoom: CSS transform approach** — zoom via `transform: translate(px,py) scale(s)` with `transform-origin: 0 0` on the image/canvas element. The wrapper div has `overflow:hidden; touch-action:none`. Canvas `getBoundingClientRect()` includes CSS transform, so `_lbGetPos` coordinate mapping works unchanged without any formula changes. NEVER resize the canvas buffer for zoom.

194. **Lightbox zoom: two-finger always works in markup mode** — pinch zoom listeners use `capture:true` on the photo-lightbox overlay element, so they fire before canvas draw handlers. Single-finger draws when `_lbDrawing=true`, pans when `_mlbZ.s > 1` and not drawing. Overlay click-to-close blocked when `_mlbZ.s > 1.05`.

195. **FRT photo gallery: Hub-style thumbnails** — checkbox always visible (22px, `accent-color:#9C2742`), 🗑 delete button top-right on hover (site photos only, calls `deleteSingleSitePhoto`), ⬇ download button bottom-right on hover, type badge top-left offset right of checkbox, R2 icon bottom-left. NO caption input in grid. CSS classes: `.photo-thumb-cb`, `.photo-type-badge`, `.photo-r2-icon`, `.photo-thumb-del`, `.photo-thumb-dl`. Old classes removed: `.photo-select-check`, `.photo-hover-info`, `.photo-hover-date`, `.photo-dl-btn`, `.photo-caption-row`, `.photo-caption-input`.

196. **QR in FRT header** — 📱 button (`#btn-qr`) hidden by default, shown when Hub mode detected (alongside signout/more buttons). Lazy-loads qrcodejs from CDN on first use. Shows `window.location.href` as QR content (includes all project URL params). `_frtQrLastUrl` reset on modal close to regenerate if URL changed. QR modal: `#frt-qr-overlay`, z-index 9000, Escape closes. ALL other tools need same pattern added.

197. **Hub tool cards: NO QR buttons** — `qrHtml` variable set to empty string in `renderToolCards`. The `.tlc-qr` CSS class still exists (dead) but no buttons are generated. QR lives in each tool's own header only.

198. **PDF `.sec-card` pattern** — single card with integrated header: `<div class="sec-card"><div class="sec-card-hdr">Title</div><div class="sec-card-body">content</div></div>`. Border-radius:6px on outer div, overflow:hidden. Used for Deficiency Summary. Replaces separate `.sh` + `.sb` pairs for non-paginated sections.

199. **PDF: no standalone "Deficiencies (X)" header** — REMOVED from `contentBlocks`. Contractor headers (`<div class="ch">`) are sufficient section markers. Deficiency cards connect directly below contractor header with `border-top:none`, `border-radius:0`. Last `.dc` in group gets `border-radius:0 0 6px 6px`.

200. **Header button order** — Reports → Issue → ⚙️ More ▾ → 📱 QR → ☀️ Dark → M Text → 🔓 Sign Out → ☰. Sign Out always rightmost before hamburger. ALL tools must match this order.

201. **PIN numpad OK button** — replaces blank key at bottom-left of `.pin-numpad`. HTML: `<button class="pin-key confirm" onclick="_pinConfirm()" style="background:var(--arencon);color:white;font-weight:700;">OK</button>`. `_pinConfirm()` validates `_pinEntry.length >= 4` before calling `verifyPin()`.

202. **Hub gallery: view-only permanently** — no photo deletion from Hub. `pgDeleteOne` shows info toast: "To delete a photo, open the tool and remove it there." Hub gallery is for browsing/downloading only. DELETE/SELECT/DOWNLOAD buttons still work (select for bulk download).

203. **Token refresh guard** — `_refreshFailCount` incremented on each failed `_sb.auth.refreshSession()`, reset on success. After 3 consecutive failures, logs warning and stops retrying. Prevents console spam from dead refresh tokens (e.g. another tab consumed the token).




192. **Lightbox zoom: cursor-anchored math** — `imgX = (mx - pan) / scale; newPan = mx - imgX * newScale`. Applied to all lightbox zoom functions. NEVER use center-pivot formula.
193. **Lightbox zoom: CSS transform approach** — `transform: translate(px,py) scale(s)` with `transform-origin: 0 0`. Canvas `getBoundingClientRect()` includes transform. NEVER resize canvas buffer for zoom.
194. **Lightbox zoom: two-finger always works in markup mode** — pinch zoom listeners use `capture:true`. Single-finger draws when `_lbDrawing=true`, pans when zoomed + not drawing.
195. **FRT photo gallery: Hub-style thumbnails** — checkbox always visible (22px, `#9C2742`), 🗑 delete top-right hover (site only), ⬇ download bottom-right hover, type badge top-left offset, R2 icon bottom-left.
196. **QR in FRT header** — 📱 button hidden by default, shown in Hub mode. Lazy qrcodejs CDN. ALL other tools need same pattern.
197. **Hub tool cards: NO QR buttons** — QR lives in each tool's own header only.
198. **PDF `.sec-card` pattern** — single card with integrated header for non-paginated sections.
199. **PDF: no standalone "Deficiencies (X)" header** — contractor headers are sufficient section markers.
200. **Header button order** — Reports → Issue → ⚙️ More ▾ → 📱 QR → ☀️ Dark → M Text → 🔓 Sign Out → ☰. ALL tools.
201. **PIN numpad OK button** — replaces blank key. `_pinConfirm()` validates ≥4 digits.
202. **Hub gallery: view-only permanently** — no deletion from Hub. Photos deleted from source tool only.
203. **Token refresh guard** — `_refreshFailCount` stops retrying after 3 consecutive failures.

### Session 44 Additions (PDF Template Match, Lightbox UX, Markup Save, UI Polish)

204. **PDF address block** — Arial 6pt, line-height 1.26x, `border-left:2px solid #9C2742`, `text-align:left`. NOT Calibri, NOT 9pt.
205. **PDF title block** — BlairMdITC TT 12pt, line-height 0.85x, centered (NO small-caps). Font embedded as base64 @font-face (~72KB). Fallback: "Times New Roman", serif. `Blaimim_base64.txt` in project files.
206. **PDF title block order** — Fire Protection Engineering → Field Review Report #X → Client. Address → Project Name/Scope. Client+address BEFORE project name.
207. **PDF body/deficiency text** — Calibri 11pt, line-height 1.23x. ALL body text, tables, cards, responses. Client/address/project name lines in title block are Calibri 12pt bold.
208. **PDF Project Info** — label:value list (NOT grid). Fields: Date of Issue, Date of Site Review, Distribution, Prepared By, Project No. Two black horizontal lines (`border-top/bottom: 2px solid #1C2333`) sandwiching the list. NO Client/Address/Project Name/Revision (those are in title block).
209. **Distribution auto-logic** — Client name always first. Single contractor filter → append contractor name. All contractors → append all names. No manual input field.
210. **PDF filename format** — `{smartFilename base without revision} FPE Field Rvw {ctrSuffix} #{instance} {revision}`. `w.document.title = _pdfTitle`. No duplicate revision.
211. **Contractor group header color** — burgundy `#9C2742` (was navy `#2C4A6B`). All PDF section headers use burgundy.
212. **Closing note** — "Note: Further deficiencies may be noted in future field reports following final commissioning." Plain text (NOT italic), no border-top. Injected inline before `_finalizePage()`. Suppressed when "Final Commissioning" checkbox checked in PDF picker.
213. **Markup save: original ALWAYS preserved** — regardless of source (deficiency, response, or gallery), original photo backed up to sitePhotos/Photo Gallery with "(original)" caption + R2 upload to `original/` type.
214. **Lightbox zoom: transformOrigin in BOTH CSS and JS** — CSS: `transform-origin: 0 0`. JS: `el.style.transformOrigin='0 0'` in apply function. Clamp: `minPx=ww-dw`, range `[minP, 0]`.
215. **Gallery lightbox controls** — close/nav positioned relative to `.lb-content` wrapper (not screen edges). Close: top-right of photo. Nav: left/right of photo. Circular buttons with dark bg + subtle border.
216. **Dark mode buttons** — `rgba(255,255,255,.06)` bg, `rgba(255,255,255,.2)` border. NOT navy `#242c3a`/`#556080`.
217. **"Site Photos" renamed to "Photo Gallery"** — everywhere in UI and code references.
218. **"Deficiencies Identified" uses default `.card-header`** — NOT `.card-header.red`. Matches Deficiency Log burgundy.
220. **PDF header standard — FINAL (apply to ALL report tools):**
  - Logo bar: ARENCON Inc. logo left, company address right (Arial 6pt, 1.26x line-height, burgundy vertical line)
  - Title: BlairMdITC TT 12pt, centered, NO small-caps. "Fire Protection Engineering" → "Field Review Report #X" → 10px gap → Client - Address (Calibri 12pt bold, dash separator) → Project Name (Calibri 12pt bold)
  - Project Info: label:value list (Calibri 11pt, 1.23x), two black horizontal lines
  - Body: Calibri 11pt, 1.23x
  - Page 2+: compact header (11pt, black text, 1x line-height, black bottom border). Three rows left: client / address / report title. NO dash between client and address on page 2+ headers.
  - BlairMdITC TT font embedded as base64 @font-face in PDF CSS (~72KB from Blaimim.ttf)
  - This standard applies to FRT, Diesel, Electric, IST, OBC, DD — ALL report PDFs.

221. **Bulk photo download = zip file** — JSZip loaded lazily from CDN. Zip named `{smartFilename base} {tool} photos.zip`. Individual downloads still use direct `<a>` download. Applied to FRT Photo Gallery and Hub Project Gallery.

219. **Deficiency Summary: Option C** — single burgundy `<th>` row serves as both section title ("Deficiency Summary") and column headers (Total/New This Report/IAR/Outstanding/Closed). Font size 11pt (matches section titles). No `.sec-card` wrapper. Values center-aligned. "New This Report" counts items where `notedOnInstance === currentFrtInstance`.


### Session 50 — Non-Destructive Photo Markup (FINAL — Complete Rewrite)

**Session 48–49 markup system was removed and rewritten from scratch in Session 50.** The old system had 8+ interconnected data paths (`_markupPreviewCache`, `markedPreview`, `markedR2Key`, `markedR2Url`, `_origBackupId`, `_markupCleared`, `_autoRegenerateMarkupPreviews`, composited previews) that fought each other and caused ghost restoration, dark photos (404 from `marked/` R2 type), and reverts not persisting.

#### What Was Removed (NEVER re-add)
- `_markupPreviewCache` — in-memory cache that restored reverted markup via 12+ fallback paths
- `markedPreview` — composited base64 thumbnail, too large for IDB, stripped by cloud, unreliable
- `markedR2Key` / `markedR2Url` — R2 `marked/` type PUT succeeded but GET always 404'd
- `_markupCleared` — flag system with 12+ check points, whack-a-mole
- `_autoRegenerateMarkupPreviews()` — scanned all photos after load, fed the broken cache
- `_regenerateMarkupPreview()` — offscreen canvas composite, fed the broken cache
- `_replacePhotoInProject()` — old destructive save that baked markup into photo blob
- All cache fallback code in `lightboxDrawMode`, `_lbShowCurrentDirect`, `_buildUnifiedPhotoList`

#### Current Architecture (4 fields only)

233. **Markup fields on photo records** — `markupObjects` (JSON array or null), `_markupCanvasW`, `_markupCanvasH`, `_origBackupId`. Nothing else. These 4 fields are the complete markup system.

234. **`markupObjects` is the ONLY source of truth** — null means no markup, populated array means markup exists. No previews, no caches, no flags.

235. **`_stripPh` always writes markup fields** — even null values, so IDB gets the null on revert. Previously only wrote truthy values, causing old objects to persist through save/load cycles.

236. **`saveSitePhoto` always writes markup fields** — same pattern. Tracks `_markupExplicit` flag so IDB inheritance only applies when caller didn't explicitly set fields (prevents revert from being overwritten by stale IDB data).

237. **`_collectFullState` strips site photo markup** — `markupObjects`, `_markupCanvasW/H`, `_origBackupId` all deleted from cloud payload. Site photo markup lives only in IDB sitePhotos store.

238. **`_collectFullState` keeps defic photo markup** — `markupObjects`, `_markupCanvasW/H`, `_origBackupId` survive cloud round-trip on deficiency photos. Only `dataUrl` stripped.

239. **Thumbnail display** — always shows original photo. `_deficPhotoThumbSrc` returns original src. ✏️ badge shown in gallery when `hasMarkup` flag set by `_buildUnifiedPhotoList`.

240. **Gallery lightbox display** — `_glbRenderMarkupComposite()` renders markup on-the-fly via temporary canvas when opening a marked photo. Fetches original as blob (avoids CORS tainting), draws at stored canvas dimensions, composites markup objects using `_lbDrawObj`, exports to `img.src`. Falls back to original if composite fails.

241. **Markup lightbox display** — `_lbShowCurrentDirect()` reads `markupObjects` directly from photo record. No cache fallbacks. Shows revert button when objects exist.

242. **`lightboxDrawMode()`** — reads objects from photo record only. No cache fallbacks. Restores existing objects for re-editing.

243. **Save flow (`lightboxSaveMarkup`)** — saves `markupObjects` + `_markupCanvasW/H` on photo record. On FIRST save, creates "(original)" backup as site photo (tracked by `_origBackupId` — no duplicates on repeated saves). Persists to IDB via `saveSitePhoto` for site photos.

244. **Revert flow (`lightboxRevertMarkup`)** — sets `markupObjects = null`, `_markupCanvasW/H = null`. Deletes original backup from sitePhotos array + IDB + R2. Sets `_origBackupId = null`. Persists to IDB.

245. **Original backup photo** — created on first markup save only. Caption: "{original caption} (original)" or "Original". Saved to sitePhotos array + IDB sitePhotos store + R2 `original/` type. Deleted on revert. `_origBackupId` on parent photo tracks the backup record ID.

246. **Merge functions preserve markup from local** — `_mergeSitePhoto` and `_mergeDeficR2Fields` carry `markupObjects`, `_markupCanvasW/H`, `_origBackupId` from local (cloud strips these for site photos).

247. **`_lbDrawObj` eraser: use `ctx.canvas` not `_lbCanvas`** — works in both lightbox and on-the-fly composite rendering.

248. **Canvas buffer size** — stored as `_markupCanvasW/H` on save. `_glbRenderMarkupComposite` uses stored size; falls back to 1200px max dimension if not stored (legacy data).

249. **R2 `marked/` type: PERMANENTLY BANNED** — never upload composited previews to R2. PUT succeeds but GET 404s. This is what caused dark photos in Sessions 48–49. The original photo + on-the-fly canvas composite is the only display path.

250. **NEVER add a markup preview cache** — the old `_markupPreviewCache` caused ghost restoration of reverted markup through 12+ fallback paths. Markup objects on the photo record are the only source of truth. No in-memory caches, no preview fields, no regeneration functions.

251. **Delete key in markup lightbox** — checks `activeElement` is body OR canvas. Also checks `_lbSelectedIds` for multi-select. Canvas `tabindex="0"`.

252. **Markup lightbox close/nav uses CSS classes** — `lb-close`, `lb-nav`, `lb-prev`, `lb-next` divs inside `#lb-content-wrap` (position:relative). Canvas wrap (`#lb-canvas-wrap`) keeps `overflow:hidden` for zoom. Buttons are OUTSIDE the canvas wrap so they're never clipped. No scrollbar on lightbox. Matches gallery lightbox `.photo-lightbox-overlay` pattern.

---

### Session 51 Additions (Markup Bug Fixes — Complete Rewrite of Save/Revert/Merge)

253. **`_propagateMarkupToAllCopies(p, srcPh)`** — NEW helper. After save or revert, syncs `markupObjects`, `_markupCanvasW/H`, `_origBackupId` from the source photo to ALL other photo objects with the same ID across `d.photos`, `d.entries[].photos`, `d.observations[].photos`, `d.activity[].photos`, `d.responses[].photos`. Prevents ghost markup from surviving in non-primary copies.

254. **Markup save/revert: force immediate cloud push** — both `lightboxSaveMarkup` and `lightboxRevertMarkup` call `CloudSync.resetLastSaved(); CloudSync.save(_collectFullState())` immediately. Prevents heartbeat from restoring pre-save/pre-revert cloud data during the 5s debounce delay.

255. **`_mergeDeficR2Fields` uses `'in'` check for markup** — `if(!('markupObjects' in ph))` instead of `if(!ph.markupObjects)`. After revert, cloud has `markupObjects: null` (the property exists). The old truthy check treated `null` as "missing" and restored stale local data. The `'in'` check respects explicit `null`.

256. **`saveSitePhoto` `_origBackupId` inheritance gated by `_markupExplicit`** — line `if(!_markupExplicit && !rec._origBackupId && existing && existing._origBackupId)`. Previously not gated, causing reverted `null` to be overwritten by stale IDB data. Now all 4 markup field inheritance lines are consistently gated.

257. **`_origBackupId` set on success only** — moved inside `_finishOrigBackup` callback, not before the async fetch. Prevents ghost ID when fetch fails.

258. **`_findPhotoRecById` search order: observations first** — `d.observations` and `d.activity` searched BEFORE `d.photos`, `d.entries`, `d.responses`. Observations are the primary photo location in the lifecycle model.

259. **`_ensureEntries` sync-back preserves markup** — when `d.observations[i].photos` is replaced by `en.photos`, markup fields are merged from observation photos to entry photos first if the arrays are different references.

260. **Download with markup: `_downloadWithMarkup()`** — composites `markupObjects` onto a temporary canvas, exports as JPEG blob. `downloadPhoto()` checks `_findPhotoRecById` for markup before calling. Falls back to plain download on error.

261. **Observation photo gallery ID uses real `ph.id`** — `_buildUnifiedPhotoList` now uses `ph.id` (when available) instead of synthetic `def_<id>_o<idx>_<pidx>`. Fixes `_findPhotoRecById` lookups for gallery lightbox markup compositing.

262. **⚠️ DEBUGGING METHODOLOGY — MANDATORY** — When a bug is not resolved after 2 fix attempts, STOP guessing. Use one or both of these approaches: (a) Add targeted `console.log` lines to the code and ask Mark to report the output. (b) Give Mark a JavaScript snippet to paste in the browser console that reads live state (e.g., scan all copies of a record, check field values, dump project structure). This approach has resolved every stuck issue. NEVER guess at root causes beyond 2 attempts — instrument the code or read live state directly.

---

### Session 52 — Deficiency Lifecycle PDF & Instance Awareness

263. **Instance awareness in `_initCloudSync`** — after CloudSync.load(), FRT reads `CloudSync.instanceNumber` and sets `p.currentFrtInstance`. Auto-creates `frtInstances[]` entry if the instance number doesn't exist. `_updateFrtInstanceIndicator()` shows FRT #N badge in project bar.

264. **PDF T+0 filtering** — `mainBodyDefs` = open items + items closed in current FRT instance. `closedSummaryDefs` = ALL closed items. `contentBlocks` built from `mainBodyDefs`. Items closed in earlier instances appear ONLY in the "Previously Closed Items" back summary.

265. **PDF deficiency card lifecycle fields** — every card shows "Noted: FRT #N — date — Contractor". Closed T+0 items render as compact 3-line cards (pin + description, noted, closed info — no photos, no observation boxes). Addressed observations render as one-liners: `☑ A) text — Addressed`. Open observations keep full bordered boxes.

266. **PDF activity log — compact inline format** — 9pt indented lines under "Activity:" header. No colored background cards. Format: `date — Label (FRT #N)(Re: A — obs text): comment text`. Rich text HTML tags stripped for PDF display.

267. **PDF Previously Closed Items section** — single table at back of report. Burgundy `#9C2742` title row ("Previously Closed Items"). Dark slate `#4A5568` column labels row (white text). Light mauve `#e8e0e3` FRT group rows. Alternating white/light gray data rows. Grouped by `closedOnInstance` ascending.

268. **PDF contractor group continuation headers** — when a contractor group spans a page break, page 2+ shows the burgundy group header with " — continued" appended. `_activeCtrHeader` / `_activeCtrHeaderHtml` tracked in pagination engine. Applied at all three page-break points (normal, fits-on-fresh, card-split).

269. **PDF compact header (page 2+) — CORRECTED** — 11pt font, 1x line-height (not 8.5pt/1.6x). Three rows left: client / address / report title. NO dash between client and address. Dash separator only on page 1 title block.

270. **PDF page 1 title block — client-address separator** — `_tbClientAddr.join(' - ')` — dash between client and address on page 1 centered title only.

271. **Activity entry edit/delete** — each activity entry in the UI has ✏ (edit) and ✕ (delete) buttons next to the date. `editActivityEntry(did,actId)` opens modal pre-filled with date, text, obsRef. `removeActivityEntry(did,actId)` confirms before removing. `_saveEditActivity(did,actId)` saves edits.

272. **Activity form "Regarding" dropdown** — when a deficiency has 2+ observations, the Contractor Response / ARENCON Comment form shows a "Regarding" `<select>` with observation text (truncated 50 chars). Stored as `obsRef` (observation ID or null) on the activity entry. Displayed in UI and PDF as "(Re: A — text...)".

273. **UI alternating deficiency row colors** — `.defic-item:nth-child(even)` gets `background:rgba(0,0,0,.07)` (light) / `#2a3348` (dark). Distinguishes adjacent deficiency cards visually.

274. **Activity buttons — burgundy accent** — "+ Contractor Response" and "+ ARENCON Comment" buttons use `color:#9C2742;border-color:#9C2742` inline styles on `.btn-outline.btn-sm`.

275. **Hub tool abbreviations** — `_TOOL_PREFIXES`: frt→FRT, diesel→DFP, electric→EFP, ist→IST, obc→OBC, dd→DD. Old FR/DP/EP values are wrong and must not be used.

276. **Hub instance labels append #N** — `defaultTitle` includes `' #' + inst.instance_number` for both project detail instances and activity feed entries.

277. **PDF summary table "New This Report" column** — 6 columns: Contractor | Total | New This Report | IAR | Outstanding | Closed. Counts items where `notedOnInstance === currentFrtInstance`. `.st th` font-size: 11pt (consistent with section titles).

278. **autoGenerated activity entries hidden from PDF** — re-open activity entries have `autoGenerated:true` flag. Filtered out in PDF activity log rendering. Still visible in UI.

### Session 52 (continued) — Carry-Forward Items

279. **Activity entries grouped under observations** — entries with `obsRef` matching an observation ID render directly below that observation in the UI (separated by dashed border). Entries with no `obsRef` or orphaned refs fall to a "General Responses" collapsible section at bottom. `_buildActEntry(a)` helper renders consistently in both locations. `_buildObsRow` now takes `obsId` parameter and filters `sortedAct` for matching entries.

280. **"General" → "Site General" rename** — contractor display name for unassigned deficiencies changed from "General" to "Site General" in 7 locations: `getAllDeficiencies` (contractorName), `buildDeficItem` (ctrName fallback), `renderDeficGroups` (group header), PDF export (ctr field), `ctrFilterName`, `foldAllDefics`, pin editor dropdown default option, drawing pin label. Template categories (`cat:'General'`) and priority label ("General" priority) are UNCHANGED — those refer to different concepts.

281. **Photo zone redesign** — `.photo-zone-compact` increased to `min-height:52px`, `padding:12px 10px`, `justify-content:center`, `flex-wrap:wrap`. Buttons got `padding:5px 12px`, `border-radius:6px`. Better drop target on tablets, centered layout.

282. **Hub FRT instance deficiency counts** — FRT instance rows in project detail show `(N noted, N open, N closed)` after the title. Counts extracted from `inst.data` blob (already returned by the query). Only shown for `key==='frt'` when data contains deficiencies. Gray subtle text `rgba(255,255,255,.6)`.

283. **Drawing toolbar steppers — vertical layout** — `.tool-stepper-wrap` changed to `flex-direction:column` with labels (WIDTH/OPAC/SIZE) on top, `+` button, value, `−` button stacked vertically. Fits within the 56px sidebar width. `.tool-step-btn` reduced to `28×20px` (was `28×28px`).

284. **PDF activity log grouped under observations** — in `_buildDefCardHtml`, observation cards include their obsRef'd activity entries inline with colored background (orange for contractor, blue for ARENCON). General/unref'd entries shown in "General Activity" section. Activity photos rendered inline.

285. **Deficiency card alternating rows — final contrast** — `.defic-item:nth-child(even)` at `rgba(0,0,0,.07)` light / `#2a3348` dark. Clearly distinguishes adjacent cards.

### Session 52 (final) — Observation Cards Redesign, PDF Fixes, Cleanup

286. **Observation cards redesign** — each observation is a self-contained bordered card (`border:1.5px solid`, `border-radius:8px`, `padding:10px 12px`). Contains: header (label + status pill) → textarea → photos → photo zone → activity thread (dashed separator) → Remove Obs button. Function: `_buildObsCard(text,photos,oi,isAddr,frtLabel,obsId)`.

287. **Green borders for closed deficiencies** — when `_deficIsClosed(d)` is true, ALL observation cards inside get green border (`#1A7A4A`) + tint (`rgba(26,122,74,.03)`) regardless of individual observation `addressed` state. Applies to both UI (`_isGreen=isAddr||_deficIsClosed(d)`) and PDF (`_obsBorder=isClosed?'#1A7A4A':'#9C2742'`).

288. **Per-observation buttons removed** — only deficiency-level "+ Contractor Response" / "+ ARENCON Comment" buttons remain at the bottom. Activity form "Regarding" dropdown handles observation targeting. `showAddActivityFormForObs(did,label,obsId)` is a shortcut that pre-selects the obsRef dropdown.

289. **FRT #N hidden on current instance** — "Noted: FRT #1" suppressed when viewing FRT #1's own report (both UI and PDF). Just shows the date. "Closed: FRT #1" similarly suppressed. Only appears on N+1 reports. Check: `(d.notedOnInstance||1)!==_curI`.

290. **PDF cards — no compact closed cards** — ALL main body items (open + closed in current FRT#) get full detail with complete communication history. The compact 3-line card is gone. Every item shows observations, photos, and activity.

291. **PDF "Include Previously Closed Items" toggle** — checkbox in export dialog (`id="pdf-show-closed"`, checked by default). Passed as `showClosedSummary` parameter to `_exportPDFWithCache`. Gates the closed summary section: `if(showClosedSummary&&closedSummaryDefs.length)`.

292. **PDF smart page break** — contractor group headers require 200px minimum available space for content after them (was 80px). Prevents orphaned headers sitting alone at page bottom.

293. **Activity buttons muted color** — "+ Contractor Response" / "+ ARENCON Comment" use `color:#888;border-color:#b8c2cc` (gray/muted). Cancel button in Report Status dialog has visible border.

### Session 54 — Drawing Viewer Markup & Hub Fixes

294. **Markup canvas caps** — total pixel count (16M mobile, 25M desktop), NOT per-axis dimension. Ensures maximum sharpness while preventing Safari GPU crashes.

295. **Device detection for canvas** — UA string + `navigator.maxTouchPoints` only. NEVER use `window.innerWidth` (changes during DevTools toggle, causes canvas resize → undo stack wipe).

296. **Submenu positioning** — JS-only via `getBoundingClientRect()`. No CSS `!important` positioning on `.tool-submenu` in mobile media queries. Single `click` listener via `addEventListener` in `initToolbarTooltips()`. 300ms timestamp dedup guard.

297. **Shape preview transform** — identity `setTransform(1,0,0,1,0,0)` — must match `renderAllMarkup`.

298. **Undo push order** — `mkPushHistory()` AFTER `_mkObjects.push()` in `endDraw()`. Stack captures completed state.

299. **loadMarkupData on resize** — only on first canvas allocation (`canvas._markupLoaded` flag). Subsequent resizes re-render only — never reload/reset stack.

300. **Resize debounce** — single 500ms timer shared between `resize` and `orientationchange` handlers. No cascade retries.

301. **Hub login screen** — starts `display:none`. Only shown after `tryRestoreSession` confirms no session.

302. **Hub `?open=` flow** — captured into `_pendingOpenId` before `replaceState`, consumed once in `loadProjects`.

303. **Hub photo gallery labels** — always include instance number `#N`. Full report names (not abbreviations).

### Session 55 — Performance Optimization

304. **R2 Repair persistent skip** — `localStorage('ARENCON_r2repair_' + pid)` stores `Date.now()` after successful repair. Skips 4 `/list/` network requests if within 4 hours (14400000ms). `forceRun=true` (manual button) bypasses. Falls back to running repair on localStorage error.

305. **Batch IDB in saveFullProject** — `ADB.batchPutDelete(store, putRecs, delKeys)` opens ONE readwrite transaction for all puts and deletes per store. `saveFullProject` uses exactly 5 transactions (1 project meta + 2 drawings read/write + 2 photos read/write) regardless of data size. Pre-reads existing records via `getAllByIndex` for blob preservation.

306. **renderDeficiencyPanel debounce + content hash** — `renderDeficiencyPanel()` debounced at 16ms. `_deficContentKey()` computes structural hash (contractor IDs/names, deficiency IDs/statuses/priorities, observation/activity counts, `_foldedCtrs` state). `renderDeficGroups()` (expensive innerHTML rebuild) only runs when key changes. Returns `Date.now()` on error to guarantee rebuild.

307. **Markup drag RAF throttle** — `renderAllMarkup()` in `moveSelect()` gated behind `requestAnimationFrame` via `_mkRafId` flag. Max 60fps during object drag and rubber-band selection. `cancelAnimationFrame` on `endSelect` ensures clean final render.

308. **Hover-reveal buttons on touch devices** — any button that uses `opacity:0` + `:hover` reveal pattern MUST include `@media(pointer:coarse)` rule making it always visible. Touch devices don't reliably support hover-to-reveal. Applied to `.folder-rename-btn` (drawing gallery folder ✏️ button).

### Session 56 — Tiled PDF Rendering + Overlay Markup + DPR Coordinates

309. **Individual tile canvases replace composite canvas** — PDF drawings render as individual 512×512 `<canvas>` elements inside `<div id="dv-tiles-layer">`. Each tile positioned absolutely. `dv-tiles-layer` has white background, sized to `drawW × drawH`, inside `dv-img-wrap`. CSS transform on wrapper handles pan/zoom.

310. **Tile quality adapts to zoom** — `renderScale = min(maxRenderScale, max(1, zoom) * baseScale)`. Quantized via `qKey = Math.round(renderScale * 4)`. Quality upgrades replace existing tile canvas.

311. **Sequential tile queue with 4 concurrent** — `_tileProcessQueue()` renders up to 4 tiles simultaneously. `_tileState._paused` halts queue during markup drawing.

312. **LRU tile eviction** — `maxTiles = 24`. Oldest tiles removed from DOM and GPU memory freed.

313. **Overlay canvas for ALL markup drawing** — `#markup-overlay` is a lightweight canvas (5M pixel cap) used for ALL active drawing (pen, highlight, eraser, shapes). Main `#markup-canvas` is NEVER touched during drawing. On finger lift (`endDraw`), overlay hidden, stroke committed to `_mkObjects`, `renderAllMarkup()` re-renders sharp on main canvas. Samsung sweet spot: 5M (5.5M laggy, 4M too fuzzy).

314. **Main markup canvas pixel cap** — Android tablets: 10M. iPhones: 16M. iPads: 16M. Desktop: 25M. Only touched on `endDraw` (not during drawing). Android detection: `/Android/.test(ua) && (!/Mobile/.test(ua) || /SM-T|SM-X|Tablet/.test(ua))`.

315. **DPR-aware logical coordinates** — All markup objects store coordinates in logical space (`drawW × drawH`). `canvas._dpr` maps logical→buffer via `ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0)`. `getPos()` returns `_logicalW / r.width`. Backward compatible (`_dpr=1` for existing markup). Applied to: `renderAllMarkup`, `_drawSelectionHandles`, `_mkHitHandle`, `handleTextPlace`, `handlePolylineClick`, `_mkDrawCopyGhost`, all incremental drawing in `moveDraw`.

316. **Overlay eraser shows red preview trail** — eraser can't erase from overlay (nothing to erase). Shows red trail at 50% CSS opacity during drawing. Actual erasing applied on finger lift via renderAllMarkup with `destination-out` composite.

317. **Highlight overlay uses CSS opacity** — single stroke on overlay at full alpha, `ov.style.opacity = 0.3 * getOpacity()`. Non-stacking guaranteed (one continuous stroke per draw session).

318. **Markup stays visible during zoom** — removed `markup-canvas` opacity:0 during pan/zoom. Pins layer still hidden (many DOM elements). Markup canvas is one element, GPU handles CSS transform fine.

319. **`_tileState.drawW / drawH`** — logical drawing dimensions. `baseScale` = `drawW / pageW`. Used by `fitDrawing`, tile rendering, and markup canvas sizing.

320. **SW cache bump required for TWA updates** — `sw.js` `CACHE_NAME` must be bumped to force HTML refresh on Android TWA. Close/reopen app twice after bump. Current: `arencon-frt-v10`.

### Session 57 — Drawing Viewer Performance, Markup Persistence, Photo Management

321. **Markup objects persist across reloads** — IDB `drawings` store now saves `markupObjects`. `loadFullProject` merges from project meta as safety net. `_collectFullState()` no longer strips `markupObjects`.

322. **Markup saved on viewer close** — `closeDrawingViewer()` copies `_mkObjects` to `dwg.markupObjects`, flushes IDB immediately, triggers cloud save.

323. **Site photos preserved on cloud merge** — Both init merge and heartbeat merge now append local-only sitePhotos not found in cloud set.

324. **PDF pre-render at upload** — PDFs rendered to full-resolution JPEG at upload time. pdf.js removed from viewing path. Background migration for existing `pdfTiled:true` drawings.

325. **Overlay canvas cap: 3M pixels** — Samsung Tab A sweet spot (down from 5M). Responsive on Samsung while maintaining quality.

326. **Site General tab** — Three lifecycle tabs: Active | Site General | Closed. `_updateDeficLifecycleCounts()` tracks counts.

### Session 58 — AI Writing Assistant + Usage Dashboard

327. **AI Writing Assistant — Cloudflare Worker** (`arencon-ai-worker`) at `https://arencon-ai-worker.hezhendong999.workers.dev`. Proxies to Anthropic API. Two modes: `rewrite` (Sonnet — full professional rewrite) and `quickfix` (Haiku — typos only). Validates Supabase JWT. Logs usage to `ai_usage_log`. Worker secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

328. **AIAssist frontend module** — `AIAssist.reviewAll(mode)` collects all observation texts, activity entries, and closed notes from data model. Sends to Worker. Displays slide-in review panel with word-level diff (LCS algorithm). Accept/Skip per suggestion, Accept All. Saves immediately per accept. Re-renders deficiency panel on close.

329. **Model selector dropdown** — `✨ AI Review ▾` header button opens dropdown: Full Rewrite (Sonnet) and Quick Fix (Haiku). Mobile menu has both options separately.

330. **AIUsage admin dashboard** — `📊` button (admin-only). Queries `ai_usage_log` from Supabase. Summary by project (number, name, tool, reviews, cost) and by user. Detail log. Quick period buttons: This Cycle, Last Cycle, This Month, This Week, Today. Billing day saved to Supabase `app_settings` table (default: 20th). CSV and PDF export.

331. **Supabase `ai_usage_log` table** — Tracks: user_id, user_email, tool, project_number, project_name, action, model, input_tokens, output_tokens, cost_usd, field_count, accepted_count. RLS: users see own, admins see all.

332. **Supabase `app_settings` table** — Key-value store for company-wide settings. RLS: anyone reads, admins write. Used for billing cycle day.

333. **Content key includes text length** — `_deficContentKey()` includes `(o.text||'').length` per observation so AI text changes trigger DOM re-render immediately.

334. **Auth token from localStorage** — `localStorage.getItem('sb-access-token')`, NOT `CloudSync.getToken()`.

335. **Project variable is `getProject()`** — returns `allProjects[currentProjectId]`, NOT `_proj`.

336. **Deficiency fields are flat** — `d.num`, `d.observations`, `d.activity`, `d.closedNote`. NOT nested under `d.defic`. `getAllDeficiencies()` wraps them as `{defic: d, contractorName, contractorId}`.

337. **IDB database name** — `ARENCON_FieldReview` (version 4). Stores: `backups`, `config`, `drawings`, `pdfData`, `pendingUploads`, `photos`, `projects`, `sitePhotos`. NOT `arencon-frt`.

338. **Photo Lightbox (v2)** — `Lightbox.open(photos, startIdx)` in `lightbox.js`. Takes array of photo objects (`{r2Url, dataUrl, caption, filename}`). Pan/zoom/pinch/swipe/double-tap. Global: `window._frtLightbox`. z-index 9500 (above drawing viewer 9000, below loading 9999). Backdrop click closes only at fit scale.

339. **Pin info popup (v2)** — Tap pin marker → `_showPinPopup(deficId, markerEl)` in `viewer.js`. Shows defic #, status, contractor, observation text. Actions: Move (re-enters placement mode), Remove (clears drawingId/pinX/pinY), Close. Auto-positions above marker, flips below if too close to top. HTML element: `#pin-info-popup`.

340. **Pin drag-to-move (v2)** — Long-press 400ms on pin marker enters drag mode. `_pinDragging` flag. Pin follows finger. Release saves new `pinX/pinY` relative to image natural dimensions. Cancels if finger moves before threshold (prevents accidental drags during pan/zoom).

341. **R2 upload (v2)** — `r2.js` full implementation. `R2.upload()` uses PUT with auth token. `R2.download()` uses GET without auth. Key format: `photos/{pid}/frt/{type}/{filename}`. Fire-and-forget pattern: UI saves to IDB first, then R2 upload runs async. `R2.rebuildUrls()` called at project boot. `R2.processPendingUploads()` runs in Hub mode at boot.

342. **Delete methods (v2 model)** — `removeDeficiency(deficId)`, `removeObservationPhoto(deficId, obsIdx, photoIdx)`, `removeSitePhoto(photoIdx)`, `removeDrawing(drawingId)` (also clears pins referencing drawing). All use splice on arrays + save + notify.

343. **IAR toggle (v2)** — `Model.toggleIAR(deficId)` flips `d.iar` boolean. Pink `#E91E8C` button when active. Deficiency log summary table counts IAR per contractor.

344. **Activity log entry (v2)** — Inline form on deficiency card: label select (ARENCON/Contractor) + text input + Add button. Uses existing `Model.addActivityEntry()`.

345. **Closed note (v2)** — Textarea appears when deficiency status = "Addressed & Closed". Green-tinted border/background. `Model.updateClosedNote(deficId, note)` with 500ms debounce.

346. **Inspector system (v2)** — `localStorage` keys: `ARENCON_FR_Inspector` (current name), `ARENCON_FR_InspectorHist` (JSON array, max 5). Click inspector chip → modal with input + history. Apply saves to localStorage + `Model.updateField('inspectorName', name)`. `_updateInspectorChip()` called on project load.

347. **FRT Instance management (v2)** — Badge `#pb-inst` in project bar shows "FRT #N". Click → confirm dialog → increments `proj.currentFrtInstance`, sets today's date as visitDate. New deficiencies get `notedOnInstance: N`.

348. **Fold/unfold contractor groups (v2)** — `_foldedGroups` object keyed by ctrId. Click group header toggles body display + arrow (▶/▼). State preserved across re-renders (not across page reload).

349. **Deficiency reassignment (v2)** — `Model.reassignDeficiency(deficId, newCtrId)` splices from source array, pushes to target contractor (or generalDeficiencies if null). ⇄ button on card → contractor picker overlay.

350. **3-button leave dialog (v2)** — `_showLeaveDialog(destUrl)` in app.js. Save & Leave (green, saves + syncs then navigates), Leave without saving (gray), Cancel — go back (burgundy outline). Triggered on back button + logo click when `_hubMode && Model.hasUnsavedChanges()`.

351. **Deficiency search + filter (v2)** — `#defic-search` input + `#defic-filter-sel` dropdown in deficiency toolbar. Filters visible `.defic-item` elements by text match and status (all/outstanding/iar). Fold All / Unfold All toggle via `#defic-fold-all-btn`.

352. **Drawing folder operations (v2)** — Folder fold/unfold via `_foldedFolders` object. Folder rename via ✏️ button → `showPrompt`. Drawing rename via click on card name. Drawing search via `#dwg-search` input. Compact mode toggle via `#btn-dwg-compact`.

353. **Duplicate deficiency (v2)** — `Model.duplicateDeficiency(deficId)` deep-copies deficiency with new ID, num, date. Strips photos and pins from copy. 📋 button on card.

354. **QR code (v2)** — `_showQR()` in app.js. Lazy-loads qrcodejs from CDN. Shows overlay with QR of current URL. Wired to `#btn-qr` and `#mobile-qr-btn`.

355. **Storage usage (v2)** — `_updateStorageDisplay()` uses `navigator.storage.estimate()`. Shows usage in header `.storage-bar-fill` and mobile menu `#mobile-storage-bar`. Called at boot.

356. **Reset operations (v2)** — `_resetProject()` creates new empty project. `_resetCurrentTab()` clears data for active tab only. `_reuploadAll()` walks all photos/drawings missing r2Url and uploads to R2. All wired to More menu + mobile menu.

357. **Photo caption editing (v2)** — Click lightbox info bar → inline text input. Blur or Enter saves caption to photo object. Escape cancels. `ev.stopPropagation()` prevents lightbox keyboard shortcuts during editing.

358. **All Deficiencies table (v2)** — pins.js. Search input, IAR column, clickable rows navigate to deficiency tab and scroll/highlight the card. Sort by any column.

359. **AI Writing Assistant (v2)** — `ai/assistant.js`. `AIAssist.reviewAll(mode)` collects text fields ≥8 chars from observations, activity, closedNote. Calls `arencon-ai-worker` with Bearer token. Two modes: `rewrite` (Sonnet) and `quickfix` (Haiku). Review panel: slide-in 420px on desktop, bottom sheet 75vh on mobile, z-index 9000. Word-level LCS diff with green additions / red strikethrough. Accept/Skip per suggestion, Accept All, auto-close after completion. Write-back via array path indexing. Button: `#btn-ai-review` dropdown with mode picker.

360. **AI Usage Dashboard (v2)** — `ai/usage.js`. Admin-only (`role = super_admin | admin`). Queries `ai_usage_log` from Supabase. Summary by Project, by User, and Detail Log tables. Quick period buttons based on billing cycle day (stored in `app_settings`). CSV + PDF export. z-index 9500.

361. **Service Worker v11** — Precaches all 22 v2 module files + CDN assets. Network-first for same-origin (always gets latest deploy, falls back to cache offline). Cache-first for CDN (versioned, stable). Bump `CACHE_NAME` to force module refresh on deploy.

---

## AI Writing Assistant Architecture

### Cloudflare Worker — `arencon-ai-worker`
- **URL:** `https://arencon-ai-worker.hezhendong999.workers.dev`
- **Method:** POST with JSON body `{fields, context, mode}`
- **Auth:** Bearer token (Supabase JWT) in Authorization header
- **Modes:** `rewrite` (Sonnet) or `quickfix` (Haiku)
- **Response:** `{suggestions: [{id, improved, changes}], usage: {input_tokens, output_tokens, cost_usd}}`
- **Secrets:** `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (all encrypted in Cloudflare)
- **Usage logging:** Non-blocking POST to `ai_usage_log` via service_role key

### Frontend Module — `AIAssist`
- IIFE module, same pattern as CloudSync/R2Photos
- `AIAssist.reviewAll(mode)` — main entry point
- `AIAssist._accept(idx)` / `AIAssist._skip(idx)` / `AIAssist._acceptAll()` — panel actions
- `AIAssist._toggleMenu()` / `AIAssist._closeMenu()` — dropdown control
- Field collection walks: `p.contractors[].deficiencies[].observations[].text`, `d.activity[].text`, `d.closedNote`, `p.generalDeficiencies[]`
- Write-back updates data model directly, saves IDB + cloud per accept
- Word-level diff via LCS algorithm, green additions / red strikethrough deletions

### Frontend Module — `AIUsage`
- Admin-only (`_isAdmin()` check)
- `AIUsage.open()` — opens modal, loads billing day from Supabase, fetches usage data
- Billing day stored in `app_settings` table, not localStorage
- Quick period buttons calculate date ranges based on billing cycle day
- CSV export: all columns including tokens and cost
- PDF export: opens print dialog with formatted report

---

## ⚠️ Production Readiness — Updated Gaps

### 7. CloudSync Rollout (IST, OBC, DD) — PENDING
### 8. Activity Stamp for Remaining Tools — PENDING
### 9. Text Size + Stepper for Other Tools — PENDING
### 10. Supabase Migration — PENDING
### 12. Auth Gate for All Tools — PENDING
### 13. ~~Lightbox Zoom~~ — ✅ DONE (Sessions 43-44)
### 16. ~~PDF Report Template~~ — ✅ DONE (Session 44) — Final header/font spec locked in
### 14. QR Code for All Tools — PARTIALLY DONE (FRT only)
### 15. Photo Gallery Hub-Style for Other Tools — PENDING
### 16. Hub Project Card Tool Icons + Short Names — PENDING (Session 45)

---

## Files to Keep in Claude Project
1. `ARENCON_Project_Knowledge.md` (this file — complete, no additions files needed)
2. `ARENCON_Style_Guide_v119.css` (complete, no additions files needed)
3. `ARENCON_FRT_Core_Template.md` (reusable architecture reference — upload for any new tool build)
4. `logo_base64.txt`
5. `Blaimim_base64.txt` (BlairMdITC TT font for PDF title block)
6. `TOOL_BUILD_QUEUE.md`
7. `FRT_Deficiency_Lifecycle_Spec.md`
8. `index.html`
9. `ARENCON_Project_Hub.html`
10. `ARENCON_Field_Review_Tool.html`
11. `HANDOFF_SESSION_58.md`
12. `HANDOFF_SESSION_64.md`
12. `FRT_REWRITE_ROADMAP.md`
13. `FRT_REWRITE_BUSINESS_CASE.md`
14. `HANDOFF_AI_WRITING_ASSISTANT.md`

---

## FRT v2 Rewrite — Status as of Session 67

### Architecture
```
frt/
  index.html              ← shell (649 lines)
  css/frt.css             ← full CSS with light/dark mode (1,583 lines)
  js/
    app.js                ← entry, boot, inspector, instances, leave, QR, storage, issue system (1,247 lines)
    data/
      model.js            ← in-memory state, mutations, IDB save, undo stack (657 lines)
      idb.js              ← IndexedDB with 11 normalized stores (239 lines)
      sync.js             ← Supabase pull/push, offline queue (192 lines)
      r2.js               ← R2 upload/download/list/delete/queue (200 lines)
    ui/
      projectInfo.js      ← two-way field binding (122 lines)
      deficiencies.js     ← deficiency UI + card footer + search/filter (941 lines)
      drawings.js         ← gallery + upload + folder ops + compact (620 lines)
      photos.js           ← full photo gallery + upload + delete (224 lines)
      pins.js             ← All Deficiencies table + search + row click (194 lines)
      lightbox.js         ← full-screen photo viewer + caption edit (345 lines)
    viewer/
      viewer.js           ← full-screen viewer + pin editor + resize handler (1,182 lines)
      markup.js           ← complete markup engine + toolbar groups (1,460 lines)
    export/
      pdf.js              ← full PDF report engine (495 lines)
      json.js             ← JSON import/export (128 lines)
    shared/
      auth.js             ← Supabase REST auth (137 lines)
      dialogs.js          ← modal dialogs (216 lines)
      toast.js            ← notifications (57 lines)
    ai/
      assistant.js        ← AI Writing Assistant client (406 lines)
      usage.js            ← AI Usage admin dashboard (249 lines)
```
**Total: ~11,543 lines across 22 files**

### v2 uses separate IDB database
- Database: `ARENCON_FRT_V2` (never touches v1's `ARENCON_FRT_DB`)
- 11 stores: projects, contractors, deficiencies, observations, drawings, drawingBlobs, markupObjects, photos, photoBlobs, activityLog, syncQueue

### Key v2 Patterns
- **Gallery cards: thumb only** — never load r2Url in card grid. Lazy-gen thumbs from R2 in background.
- **Drawing dataUrl: null on project** — full blob in IDB drawingBlobs only. Prevents 50MB+ project blob.
- **PDF render cap: 8192px** — matches v1. Confirmed via console check (v1=8192×5461, v2 was 4096 before fix).
- **Pin markers: exact v1 SVG** — teardrop shape, priority colors, scaling, opacity for closed.
- **Sacred go(pg)** — PDF upload handler ported verbatim. NEVER rewrite.
- **Dev files: Claude project only** — never push handoff/knowledge/style to GitHub repo.

### Phase Status
| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Scaffolding | ✅ Complete (Session 62) |
| 1 | Data layer (IDB + sync) | ✅ Complete (Session 62) |
| 3 | UI migration | ✅ Complete (Session 64) |
| 2 | AI Writing Assistant | ✅ Frontend complete (needs Worker deploy) |
| 4 | Tile-based viewer | Pending |
| 5 | WebGL markup engine | Pending |
| 6 | Web Worker integration | Pending |
| 7 | Android Capacitor app | Pending |
| 8 | Testing + cutover | Pending |

### Session 64 Additions (Phase 3 — 5 pushes, 1,765 lines added)
- Photo lightbox with caption editing (lightbox.js NEW)
- Pin editor: info popup, remove, drag-to-move, drawing name display
- R2 full implementation: upload/download/list/delete/queue/rebuild
- R2 wired into all photo + drawing upload pipelines
- Delete: deficiency, observation photo, site photo, drawing (all with confirmation)
- IAR toggle, activity log entry form, closed note textarea
- Inspector system (modal, history, localStorage, project sync)
- FRT Instance management (badge, create new instance, visit date)
- Fold/unfold contractor groups + fold-all toggle
- Deficiency reassignment between contractors
- Deficiency duplicate (📋 button)
- Deficiency search bar + status filter (All/Outstanding/IAR)
- 3-button leave dialog (Hub mode)
- Project rename (click filename)
- Drawing folder rename + fold/unfold
- Drawing rename (click card name)
- Drawing search bar + compact mode toggle
- Photo gallery: shows all photos (site + deficiency) grouped
- All Deficiencies table: search, IAR column, clickable rows → navigate
- QR code button (lazy qrcodejs)
- Browser storage usage display
- More menu wiring (Re-upload All, Reset Tab, Reset Project)
- Mobile menu wiring (PDF, reset, repair, QR)

362. **Drawing card structure (v2 final)** — Matches v1 exactly. `.drawing-card` (160px, position:relative) → `.card-thumb.drawing-thumb` (height:110px, position:relative) containing `<img>` + `.pin-badge` (absolute top:6px right:6px, red #C0392B circle with white pin count) → `.card-footer` (flex row) containing `.select-check` (absolute positioned top:6px left:6px via CSS, opacity:0 default, visible on hover) + `.card-name` (ellipsis, flex:1) + `.card-menu-btn` (⋮, opacity:0, visible on hover).

363. **Drawing select-check hover** — `.drawing-card:hover .select-check{opacity:1}`. On mobile (≤900px), always visible at opacity:0.45. When `.checked`, blue background (#2196F3). `user-select:none` on cards prevents text selection during shift-click.

364. **Shift-click multi-select (v2)** — Google Photos style. Click select-check → toggle. Shift+click → select range between last-clicked and current using DOM order. `_selectedDrawings` Set tracks state. `_updateSelectionUI()` applies `.selected` class + check text. Folder checkbox selects all cards within that folder group via `folderGroup.querySelectorAll('.drawing-card')`.

365. **Drawing context menu (v2)** — `_showDrawingContextMenu(drawingId, anchorEl)` creates a fixed-position `.card-context-menu` with: ✏️ Rename, 📁 Move to folder, 🔄 Rotate 90°, 🔧 Replace image, ⬆️ Upload new version, ⬇️ Download, 🗑️ Delete. Auto-positions near anchor, auto-closes on outside click.

366. **Drawing search (v2)** — Delegated `document.addEventListener('input')` checks `e.target.id === 'dwg-search'`. Filters `proj.drawings` by name/folder match before grouping. Re-renders on every keystroke.

367. **Folder checkbox bug fix** — Inline `onclick="event.stopPropagation()"` on the checkbox HTML was preventing the event from reaching the document-level delegated handler. Removed inline handler; delegated handler does `e.stopPropagation()` itself.

368. **Folder rename action priority** — Click handler checks rename-folder BEFORE toggle-folder. Previously, clicking ✏️ matched the parent `toggle-folder` div first and returned early.

369. **Contractor chip edit (v2)** — Chips match v1: `Name ✏ ✕`. ✏ opens rename prompt (`data-action="edit-contractor"`). ✕ always shows confirmation dialog before removing, even with 0 deficiencies.

370. **Add contractor creates deficiency** — `Model.addContractor(name)` returns the contractor object. Handler immediately calls `Model.addDeficiency(ctr.id)` to create the first deficiency card.

371. **Renumber deficiencies (v2)** — `Model.renumberDeficiencies()` gets all deficiencies sorted by current num, assigns 1, 2, 3... sequentially. Button: "#↕ Renumber" in deficiency toolbar. Use before PDF export to clean up gaps from deleted deficiencies.

372. **CSS orphan selector bug** — Lines 91-92 of frt.css had `body.dark-mode /* comment */` selectors with no property block. CSS parser chained them into `:root{...}` below, making it `body.dark-mode body.dark-mode :root{...}` which never matches. All CSS variables lost. Fixed by removing orphan lines. This is the SAME bug class as Session 61 — add to permanent checklist.

373. **CSS cache busting** — `<link rel="stylesheet" href="css/frt.css?v=XX">` in index.html. Bump version on every CSS push to bypass browser/SW cache. Currently at v70.

374. **Header button sizing (v2)** — All `.hdr-btn` use `height:34px; display:inline-flex; align-items:center; padding:0 12px`. `#dark-toggle` and `#mobile-menu-btn` use `width:34px; height:34px` square. On touch devices: all bump to 38px. Only ONE `.hdr-btn` definition — removed 3 duplicate blocks that conflicted.

375. **Hamburger menu always visible** — Removed `.mobile-menu-btn{display:none}` default. At ≤1024px, `header-actions>*{display:none!important}` hides other buttons but `#dark-toggle` and `#mobile-menu-btn` are shown back via `display:inline-flex!important`.

376. **Photo Gallery (v2)** — Renamed from "Site Photos". Actions ▾ + ⚙ Filters buttons. Upload zone: "Drag & drop photos, or import from camera roll" + "Select multiple at once" + "📥 Import from Camera Roll" button + green Camera button (#1A7A4A). Stats with borders and 20px margin-top separation from upload zone.

377. **All Deficiencies table (v2 final)** — Columns: #, Drawing, Description, Contractor, Status (badge), Priority (badge), Jump. Pin column removed (Drawing column serves same purpose). Status badges: `.tt-status.outstanding` (red), `.tt-status.closed` (green), `.tt-status.iar` (pink). Priority badges: `.tt-priority.high/low/general`. Jump button: `.tt-jump`. Filters: search + status dropdown + priority dropdown + contractor dropdown. Table/Board toggle in header (Board not yet implemented).

378. **Lifecycle tabs centered** — `.dlc-tab{text-align:center}`.

379. **btn-primary = burgundy** — Changed from `--red` to `--arencon` (#9C2742). Red means cancel/close throughout the toolkit.

380. **upload-box class** — `.upload-box{border:2px dashed var(--border);border-radius:10px;background:var(--smoke);}` + `.upload-box.drag-over{border-color:#1A7A4A!important;background:rgba(26,122,74,.06)!important;}`. Used for both drawings and photos upload zones.

381. **AI Usage dashboard (v2 final)** — Available for ALL users (not admin-only). PM dropdown + Project dropdown auto-populated from data, instant re-render on change. Billing day editable by admin only (disabled input + 🔒 for non-admins). "All Time" period button added. PDF opens preview window with export bar (📄 Export PDF + ✕ Close) on gray background with white 8.5×11" page — no auto-print. PDF header shows billing cycle dates + PM filter + project filter. AI Worker (`arencon-ai-worker`) and Supabase tables (`ai_usage_log`, `app_settings`) already deployed from v1 — fully functional.

382. **IDB storage format** — Shows `221MB / 10461MB (2%)` matching v1, not just `221MB`.

383. **Deficiency toolbar (v2)** — ⚙ Filters | 🔍 Search | All/Outstanding/IAR dropdown | flex spacer | #↕ Renumber | ☐ Select | ▼ Fold All.

384. **Drawings toolbar (v2)** — + New Folder | ☑ Select All | Actions ▾ | flex spacer | ☷ Compact | 🗑 Purge Old | ⚙ Filters. Search below toolbar. Upload zone with 📐 icon and burgundy "Select files" button.

### Session 65 Additions (Phase 5 — Markup Engine, 9 pushes)
- Complete markup engine (markup.js 1,260→1,460 lines): 14 tools, highlighter non-stacking composite, overlay canvas (3M cap Samsung), undo/redo 40 levels, IDB persistence
- Left sidebar v1-style: Pin, Select, tools, color picker, width/opacity steppers, undo/redo
- Viewer features: Tasks panel (right sidebar), Layers dropdown, Heights/Dimensions panel, inline text tool, pin placement via Tasks
- Pin editor modal: contractor, date, status, IAR, observations, priority, photo zone, location thumbnail, Move To
- ◀▶ nav buttons bottom-left (Fieldwire-style)
- All `confirm()` replaced with `showConfirm()` custom modal

### Session 66 Additions (12 pushes)
- Markup selector overhaul: `_selectedIds[]` array, rubber-band drag selection (blue dashed rect), ONE grouped bounding box (white corner handles, blue border), red X delete, group drag
- Pin tool: crosshair cursor, blocks pan, creates Site General deficiency + drops pin, 400ms debounce guard, 1% sizing (clamped 24-96px)
- Undo delete deficiency: `Model.undoLast()` with 20-level stack, Ctrl+Z with markup priority
- Pin editor duplicate fix: "Site General" option in contractor dropdown
- Tasks panel X delete button on each task
- Inspector linked to authenticated user email (auto-set on login, manual override available)
- All Deficiencies table: row click navigates, hover highlight
- Import strips signatures; inspector never auto-set from project data

### Session 67 Additions (4 pushes)
- **Issue system**: DRAFT→ISSUED→REVISION lifecycle. `_parseRevision()` parses A##/B##/B##A##. Issue modal with 3 options. Badge colors: DRAFT=#6B7280, ISSUED=#1A7A4A, REVISION=#E67E22. Supabase status sync via `Auth.request()` PATCH.
- **Card footer redesign**: `.defic-actions` bar with styled buttons: `+ Response` (orange), `+ Comment` (blue), `✔ Close` / `↩ Reopen`, `✕ Remove` (red), `⋯` More dropdown (Duplicate, Move, Remove Pin). Full dark mode.
- **Close deficiency prompt**: `showPrompt()` dialog with optional closing note before status change.
- **Toolbar consolidation**: Pen group (Pen, Highlighter, Line, Arrow, Polyline) + Shape group (Rect, Fillrect, Circle, Fillcircle, Triangle, Cloud). Single-click opens submenu. Group button icon updates to last-selected. `_lastPenTool`/`_lastShapeTool` memory.
- **SIZE control merged**: WIDTH + TEXT SIZE → single SIZE stepper. Tool-aware: shows `_fontSize` for text tool, `_lineWidth` otherwise.
- **Drawing flash fix**: `visibility:hidden` before src change, `visibility:visible` after onload + transform applied.
- **DevTools resize fix**: `window.addEventListener('resize')` with 200ms debounce recalculates `_calcFitScale()`, resets pan/zoom, re-renders pins.
- **Viewer light mode**: Full light/dark mode support for viewer overlay, toolbar, sidebar, buttons, submenus, steppers. Light mode is default, `body.dark-mode` overrides.

385. **Issue system (v2)** — `_parseRevision(rev)` returns `{issued, hasSuffix, letter, major, suffixNum}`. A01=draft, B01=issued, B01A01=revision. `_calcIssueRevision(parsed)`: draft→B01, revision B##A##→B(#+1), issued B##→B(#+1). `_calcRevertDraft(proj)`: finds highest A-series number, increments. Issue modal: green "Issue Report", orange "Revise" (if B## without suffix), gray "Revert to Draft" (if B-series). Cancel button. All 3 action functions update `proj.info.revision`, `proj.status`, badge, field inputs, and call `_syncIssueStatus()`.

386. **`_syncIssueStatus(status)`** — Uses `Auth.request('/rest/v1/tool_data?id=eq.' + SyncEngine.instanceId, { method: 'PATCH', body: JSON.stringify({status, updated_at}) })`. NOT `SyncEngine.patchInstance` (doesn't exist).

387. **Card footer `.defic-actions`** — `display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border);flex-wrap:wrap;align-items:center;`. Buttons use `.defic-act-btn` base class + modifier (`.act-close`, `.act-reopen`, `.act-remove`, `.act-response`, `.act-comment`, `.act-more`). More popup uses `.defic-more-popup` with `.open` toggle class.

388. **Close deficiency dialog** — `showPrompt('✔ Close Deficiency #X', 'Closing note (optional):')`. Returns null=cancelled, empty=close without note, text=close with note. Calls `Model.updateClosedNote(deficId, note)` if note provided.

389. **Toolbar groups** — `#tool-pen-group` and `#tool-shapes-group` each contain a `.tool-group-btn` (main button with `data-mk-group` attr) + `.tool-submenu` (dropdown). Clicking main button always opens submenu (single click). Selecting a sub-tool: updates group button innerHTML with tool's SVG + arrow span, stores in `_lastPenTool`/`_lastShapeTool`, closes submenu. `_setActiveTool` highlights group button when any sub-tool is active.

390. **SIZE control merged** — Single stepper in sidebar labeled "SIZE". `_updateSizeLabels()` checks `_tool === 'text'` to display `_fontSize` or `_lineWidth`. Step handlers: size-up/size-down check `_tool === 'text'` to adjust correct variable.

391. **Drawing navigation flash fix** — `_loadImg()` sets `img.style.visibility = 'hidden'` before `img.src = url`. On `img.onload`: calculates fit scale, applies transform, THEN sets `img.style.visibility = 'visible'`. No CSS transition needed — binary hide/show prevents any paint of old image.

392. **Viewer resize handler** — `window.addEventListener('resize')` with 200ms debounced `setTimeout`. Only fires when `drawing-viewer-overlay.open`. Recalculates `_calcFitScale()`, resets `_scale/_panX/_panY`, calls `_applyTransform()` + `_renderPins()`. Fixes DevTools open/close, orientation change, window resize.

393. **Viewer light/dark mode** — Viewer now responds to `body.dark-mode`. Light defaults: overlay #e8eaed, toolbar #fff with shadow, sidebar #f0f1f4, buttons rgba(0,0,0,.06), text #1C2333. Dark overrides via `body.dark-mode .dv-*` selectors. Never hardcode dark-only viewer styles.

394. **Text markup is EDITABLE** — Text objects must remain selectable and editable after placement. When selector tool clicks a text object, it reopens for editing. Text font size is stored per-object in markup data. When text tool is active and text box is open, clicking SIZE +/- adjusts the text size live WITHOUT closing the text box.

395. **Markup selector edits properties** — When objects are selected via markup selector, the SIZE control adjusts stroke width (or font size for text objects), OPAC adjusts opacity, and the color picker changes color of selected objects. Changes apply to all selected objects in group selection. Changes persist to IDB immediately.

396. **Pin movement** — Mobile: long-press pin → drag to reposition. PC: long-click (press and hold) → drag, OR when markup selector is active, single-click pin to select (shows handles, does NOT open pin editor), then drag to move. Pin editor only opens when no tool/selector is active (pan/navigate mode). Pin coordinates update in model + IDB on drop.

397. **Selector mode blocks pin editor** — When markup selector tool is active, single-clicking a pin selects it for repositioning rather than opening the pin editor. This is critical for drag-to-move workflow. Pin editor only opens in default pan mode (null tool).

---

## Revised Session Plan — 5 Sessions to Production Cutover (as of Session 67)

| Session | Phase | Focus |
|---------|-------|-------|
| **68** | Phase 5 finish | Response/Comment modal, editable text, property editing, pin movement, inline expand, selector resize/rotate |
| **69** | Phase 2 + 7 + 9 start | AI Worker deploy, Hub v2 compat, SW module caching, parallel testing begins |
| **70** | Phase 4 | Tile-based viewer (pyramid, LOD, cache, viewport culling) |
| **71** | Phase 6 + 4 polish | Web Workers (IDB/sync/R2 background thread), offline queue, tile polish |
| **72** | Phase 9 | Final testing, PDF comparison, field testing, production cutover |

**Phase 8 (Capacitor) deferred** — after principal approves Android demo.

---

## SESSION 69 ADDITIONS (2026-04-10)

### AI Writing Assistant — Phase 2 complete
- **Phase 2a — Field Selector Modal:** `assistant.js` `reviewAll(mode)` collects fields → modal with checkboxes per field (label + 140-char preview), Select/Deselect All toggle, dynamic count button. Single-field auto-proceeds. CSS: `.ai-fs-*` classes.
- **Phase 2b — Photo Suggest:** Worker `arencon-ai-worker.js` has `mode: 'photo_suggest'` branch using Sonnet vision. Frontend exposes `window.AIAssist.suggestFromPhotos({photos, existingText, onAccept})`. Per-photo `.photo-ai-btn` (top-LEFT, hover-reveal + `pointer:coarse`) and observation-level `.pz-ai-suggest`. Confirmed working: $0.0042/photo.
- **Cloudflare Worker manual deployment required:** Workers do NOT auto-deploy from GitHub. Mark must paste from `raw.githubusercontent.com` → Cloudflare Dashboard → Workers & Pages → arencon-ai-worker → Edit code → Save and deploy.

### v1 vs v2 URL distinction (CRITICAL)
- v1 monolithic: `ARENCON_Field_Review_Tool.html`
- v2 modular: `/frt/` (with trailing slash)
- Hub still defaults to v1 URL — Phase 7 fix needed.
- Always confirm which URL Mark is testing before debugging missing features.

### Cloudflare Vectorize for RAG (decision)
- Supabase free tier auto-pauses after 7 days inactivity — unacceptable for cold knowledge bases.
- **Cloudflare Vectorize**: free tier, no auto-pause, integrated with existing Cloudflare ecosystem.
- Supabase stays for auth + `tool_data` (active daily, never pauses in practice).
- Cannot move "everything" off Supabase — would need D1 + KV + Access + custom auth.
- Data ownership: user owns text + embeddings. Only irreplaceable asset is JSON of deficiency texts (~1KB each). Embeddings regeneratable via API for ~$0.10. Triple-tier backup: live + nightly cron → private GitHub + manual download + USB.

### Photo cost analysis
- Sonnet vision: ~$0.008-0.011/photo (no context), ~$0.015-0.02/photo (with full deficiency context)
- Monthly: ~$8-11/inspector at 50 photos/day, ~$40-55 total for 5 inspectors
- Multi-photo requests cheaper per-photo (shared system prompt)

### Session 70+ feature gap list
1. Photo Gallery v2 parity (date folders, hover buttons, badges, multi-select, Actions/Filters menus)
2. Photo Lightbox v2 parity (Download, Rotate, Zoom/pan, Mark up toolbar, Assign to Pin, Revert) — site, deficiency, AND pin editor entry points
3. Lightbox nav/close redesign (v1 was "trash" per Mark)
4. "+ Gallery" picker on observation photo zone
5. AI Photo Review side-panel restructure (move to AI Review dropdown)
6. AI Photo Scan with context (existing deficiencies as prompt)
7. Hub v2 compatibility (Phase 7)
8. M365 migration plan document

### Hard rules learned this session
- **NEVER claim work done that wasn't done.** No "I've added it" without verification.
- **Photo buttons only render when `obsPhotos.length > 0`.** Working as designed.
- **DO NOT deviate from v1 photo lightbox/markup behavior.** Mark spent significant time perfecting v1.
- **Site photo cards on hover:** delete + download + checkbox.
- **Deficiency photo cards on hover:** download ONLY (deletion stays in deficiency card / pin editor to prevent orphan refs).
- Shift-click multi-select must use `user-select:none` (no text highlighting).

---

# Session 82 additions (April 13, 2026)

## Commit chain (23 commits)
a7660f3d → ef70041d → 4748c25e → e96773d7 → 5550d43d → b0c58626 → 938daa90 → baf1c508 → f50ca044 → 2f7ff4a9 → 23de5b3f → 4a6869f5 → e1c09a40 → 068fa093 → ca362184 → 6cf82bbf → 92f151f1 → 491a41f6 → 673adef2 → 6db53848 → cb7ed09a → 8e1d1ab2 → df4f05eb

Final: `df4f05eb`. See HANDOFF_SESSION_82.md for per-commit details.

## Cache versions end of S82
- frt.css v=210
- pinsGL.js v=9 (unchanged)
- SW cache v112

## Multi-inspector sync implementation (shipped S82)

### Heartbeat — 15s push
`app.js` — `_cloudSyncInterval = 15000` (was 30000). All other push logic unchanged. Debounce on local saves still 5s.

### Periodic pull — 30s with context-aware banner
`app.js`:
- `_cloudPullInterval = 30000`
- `_lastPulledUpdatedAt` — ISO timestamp tracker
- `_startCloudPull()` — sets interval, skipped if not in Hub mode
- `_checkRemoteForChanges()` — calls `SyncEngine.getRemoteUpdatedAt()`, compares to baseline
- `_showRemoteUpdateBanner(remoteTs)` — builds `#frt-remote-update-banner` at top of viewport

Logic:
- Baseline set at startup (first `getRemoteUpdatedAt` call) so first poll doesn't false-positive
- Baseline updated on every successful own-push (from `push()` return row's `updated_at`)
- Baseline updated on every successful pull
- If `remoteTs > _lastPulledUpdatedAt`:
  - `Model.hasUnsavedChanges() === false` → silent `SyncEngine.pull()`, UI refresh
  - `Model.hasUnsavedChanges() === true` → show banner with [Pull now] (with confirm) / [Dismiss] (suppresses that specific remote version)
- Banner never stacks (checks for existing `#frt-remote-update-banner` before creating)

### SyncEngine.getRemoteUpdatedAt (new method)
Lightweight GET — `select=updated_at` only. Returns ISO timestamp or null on failure. ~150 bytes per call. Safe at 30s cadence.

## Known bugs (as of S82 final)

1. **Highlighter erase regression** (newly reported S82) — eraser not clearing highlighter strokes properly. Likely related to S81 composite-once-at-reduced-opacity refactor; eraser may be targeting wrong layer.

2. **Hub compatibility (Phase 7)** — Project Hub reads v1 single-blob format. v2 writes normalized. Hub dashboard can't display v2 projects until prefer-normalized-with-v1-fallback read path added.

3. **iPad drawing crash** — v2 only uploads rendered JPEG to R2; iPad hits ~400 MB tab budget on single `<img>` fallback. Fix = PDF-buffer-to-R2 (Option 1, S81-spec'd, queued S83 #1).

4. **Pushpin emoji cross-platform** (📌) — renders differently iOS/Samsung/Windows. S83 queue #5: SVG replacement.

## Architecture principles reinforced S82

### ID specificity beats class !important
`.back-btn { font-size:15px !important }` cannot override `#dv-close { font-size:13px !important }`. When class-level `!important` overrides fail, grep for ID-selector rules FIRST. Do not stack more class rules.

### `_resetView` must route through `_applyTransform`
Any code path that changes `_scale`/`_panX`/`_panY` must call `_applyTransform()`, never write `wrap.style.transform` inline. `_applyTransform()` is the only function that calls `_renderPins()` for GL pin re-positioning. `_resetView` previously violated this — fit-to-page left pins at stale positions.

### Don't proxy data-zoom buttons
Buttons with `data-zoom` attribute are caught by `markup.js` document delegation. Adding a JS `.click()` proxy on top (e.g., to forward to `#zoom-controls`) causes double-fire of zoom handlers, leaving mid-render state. Rule: if `data-zoom` present, just style/flash the button and trust the delegation.

### DevTools mobile-emulation lies about touch
`(pointer:coarse)` and `(hover:none)` do NOT match reliably in DevTools mobile-emulation — the physical mouse generates hover events. Use `body.input-touch` class (JS-set by last `pointerdown.pointerType === 'touch'` or `touchstart`) to gate mobile-only CSS behavior.

### Three-layer defense for sticky-state bugs
When a single fix doesn't catch all browsers/modes, apply redundant protection:
- JS `blur()` after click
- CSS `hover:hover`-only red rule (positive match)
- CSS `:focus:not(:focus-visible)` reset
Cost of redundancy is trivial; debug hours saved are huge.

### Buttons `display:none` on PC have no PC use case
If a mobile button is hidden via `display:none` on PC (e.g., `.dv-bb-nav` at `min-width:769px`), drop its hover state styling entirely. PC users never see it. `:active` + JS `.tap-flash` is sufficient for touch feedback.

## User (Mark He) interaction learnings S82

- Claude cannot process video (MP4) files, only images (PNG/JPG). Must request screenshots.
- When Mark says "look at the pictures I sent you", actually compare the visual state, don't just re-read console logs.
- When a fix is pushed and user says "identical behavior, no change", verify the new file is live via cache-buster URL in console (`document.querySelector('link[href*="frt.css"]').href`) before pushing more changes.
- Mark will redo prior testing in DevTools mobile-emulation for UI work. Fixes must work there AND on real Samsung (input-touch tracker handles both).
- After 3 failed guesses, Mark expects an instrumentation approach, not another guess.

---

# Session 84-85 Additions (April 14-15, 2026) — Server-side PDF Tile Rendering

## Background

Session 83 attempted a 6144px client-side JPEG approach for large engineering PDFs (128 MB AutoSPRINK from Shell Sprinkler & Fire Alarm project). Testing on iPhone Safari showed quality was insufficient — iOS rendering ceilings prevented competing with Fieldwire's zoom/clarity. Decision made to move PDF rendering server-side, matching the architecture of commercial field-inspection tools.

## Architecture decision

Azure Functions (FlexConsumption, Linux, Node 22, 4 GB) renders PDFs into a **tile pyramid**, stores tiles in R2, FRT viewer fetches tiles on demand via existing Cloudflare Worker. FRT does NOT render PDFs anymore.

Evaluated and rejected: ConvertAPI (Mark preferred Microsoft path), Railway/Fly.io, Azure Container Apps (overkill), Supabase Edge Functions (2s CPU cap).

## Azure infrastructure (S84)

| Resource | Value |
|---|---|
| Subscription | Azure Pay-As-You-Go |
| Subscription ID | `c7b96674-dae0-479d-b630-1203136b6ad2` |
| Account | hezhendong999@gmail.com (personal MS account — deliberate, not ARENCON email) |
| Resource group | `arencon-rg` |
| Region | Canada Central |
| Function App | `arencon-pdf-render` |
| Hostname | `arencon-pdf-render.azurewebsites.net` |
| Plan | FlexConsumption, Linux, Node 22 LTS |
| Memory | 4096 MB |
| Max instances | 100 |
| Timeout | 30 minutes (extended from default 10 in S85) |

Resource providers registered: `Microsoft.Web`, `Microsoft.Storage`, `Microsoft.Insights`, `Microsoft.OperationalInsights`.

## Function code (S85)

Deployed code lives in GitHub at `/azure-function/` folder of the repo. Key files:
- `azure-function/src/functions/render.js` — main handler
- `azure-function/host.json` — runtime config, 30-min timeout
- `azure-function/package.json` — deps (`@azure/functions`, `@aws-sdk/client-s3`, `@napi-rs/canvas`, `pdfjs-dist` 4.0.379, `sharp`)
- `azure-function/README.md` — API contract + deploy steps

Claude can fetch these via GitHub API anytime — Mark does not need to keep local copies.

### Render pipeline

1. POST /api/render with `{pid, drawingId, r2Key}`
2. Function downloads PDF from R2 via direct S3 API (not via Worker)
3. Loads PDF with `pdfjs-dist` legacy build + `@napi-rs/canvas` factory
4. For each page sequentially:
   - Renders at 5 zoom levels: L0=256px, L1=1024px, L2=2560px, L3=6144px, L4=12288px wide
   - Slices each level into 512×512 JPEG tiles with `sharp`
   - Parallel uploads (12 concurrent) back to R2 via direct S3
5. Writes `manifest.json` describing all pages/levels/tile grids
6. Returns `{success, pageCount, totalTiles, manifestKey, durationMs}`

### Key technical details (learned the hard way)

- **pdfjs workerSrc must point at real file**, even in Node. Use `require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')` + `pathToFileURL()`. Setting to `null` breaks document loading.
- **Complex PDFs need `canvasFactory` passed to `getDocument()`**, not just `page.render()`. Without it, PDFs with embedded images/patterns throw `Cannot read properties of undefined (reading 'createCanvas')` during parsing.
- **Direct S3 to R2** chosen over Worker-mediated uploads: zero Worker CPU tax on 4500+ tile PUTs, native parallel uploads, R2 keys encrypted in Azure App Settings.
- **npm install `--platform=linux --arch=x64`** required when installing from Cloud Shell. Sharp + @napi-rs/canvas ship platform-specific native binaries.
- **Sequential page processing, parallel tile uploads.** Bounds memory at ~600 MB peak per page on 4 GB instance; 12 concurrent PUTs saturate R2 without throttling.

## Azure HTTP gateway 230s timeout (CRITICAL for FRT integration)

Azure's HTTP gateway cuts responses at ~230 seconds regardless of `functionTimeout` setting. For 128 MB PDFs rendering takes ~2–5 minutes — the Function completes successfully but the HTTP caller gets `504 Gateway Timeout`.

**FRT integration pattern (for S86):**
1. FRT fires POST to Function — fire-and-forget, don't await response
2. FRT polls `{pid}/tiles/{drawingId}/manifest.json` at the Worker endpoint every 5–10s
3. When manifest appears → drawing is ready, begin tile fetch

## R2 storage structure (extended)

```
arencon-files/                            (R2 bucket — confirmed name)
  {pid}/
    photos/
      frt/
        drawings/  (drawing originals: pdf or img)
        photos/    (inspection photos)
        pdfbufs/   (uploaded PDFs awaiting processing)
    tiles/                                (NEW in S85)
      {drawingId}/
        manifest.json
        page-{N}/
          level-{L}/
            {x}-{y}.jpg                   (512×512 JPEG, edge-padded)
```

### Manifest schema

```json
{
  "version": 1,
  "drawingId": "...",
  "pid": "...",
  "tileSize": 512,
  "renderedAt": "ISO-8601",
  "pageCount": 9,
  "pages": [
    {
      "pageNumber": 1,
      "nativeWidth": 2592,
      "nativeHeight": 1728,
      "levels": [
        {"level": 0, "tileSize": 512, "cols": 1, "rows": 1, "width": 256, "height": 171},
        {"level": 1, "tileSize": 512, "cols": 2, "rows": 2, "width": 1024, "height": 683},
        {"level": 2, "tileSize": 512, "cols": 5, "rows": 4, "width": 2560, "height": 1707},
        {"level": 3, "tileSize": 512, "cols": 12, "rows": 8, "width": 6144, "height": 4096},
        {"level": 4, "tileSize": 512, "cols": 24, "rows": 16, "width": 12288, "height": 8192}
      ]
    }
  ]
}
```

## R2 API access

### R2 S3 Token (for Azure Function)
- Name: `arencon-pdf-render-azure`
- Scope: Object Read & Write, **`arencon-files` bucket only**
- Secrets stored in Azure App Settings (encrypted):
  - `R2_ACCOUNT_ID` = `fceb61622bd4b1c13da59e94dbe08c46`
  - `R2_ACCESS_KEY_ID` (rotate via Cloudflare if exposed)
  - `R2_SECRET_ACCESS_KEY` (rotate via Cloudflare if exposed)

### Cloudflare Worker updates (S85)

Added tile route to `arencon-r2-worker.js` (commit `aeca71478e`):

```js
// ── TILES: /{pid}/tiles/{drawingId}/... (unauthenticated, immutable cache) ──
if (request.method === 'GET' && /^\/[^/]+\/tiles\//.test(rawPath)) {
  const r2Key = decodeURIComponent(rawPath.slice(1));
  const object = await env.BUCKET.get(r2Key);
  // ... immutable cache for tiles, short cache for manifest
}
```

Worker served tile URL pattern:
```
https://arencon-r2-worker.hezhendong999.workers.dev/{pid}/tiles/{drawingId}/page-{N}/level-{L}/{x}-{y}.jpg
```

Manifest URL:
```
https://arencon-r2-worker.hezhendong999.workers.dev/{pid}/tiles/{drawingId}/manifest.json
```

## S85 test results (all green)

| Test | Pages | Tiles | R2 size | Time |
|---|---|---|---|---|
| Small PDF (4.5 KB checklist) | 2 | 2004 | 2.16 MB | 34s |
| Monster (128 MB AutoSPRINK) | 9 | 4545 | 71.91 MB | ~3 min (504 on HTTP, completed in background) |

Thumbnail verified visually in browser at level-0. Drawing content (sprinkler symbols, title block, grid layout) renders crisply.

## Roadmap changes

### Sessions 86–88 (revised scope)

- **S86** — FRT upload + progress UI:
  - After PDF R2 upload completes, fire POST to Azure Function (don't await)
  - Add polling for manifest.json via Worker GET every 5–10s
  - Progress badges on drawing cards: "Uploading..." → "Processing..." → "Ready"
  - Drawing record schema: add `manifestUrl`, `tileServer` fields
  - Keep `pdfTiled: false` legacy flag for backward compat
  - Do NOT touch viewer yet

- **S87** — Viewer tile fetch:
  - Revive/rework `tiledPdf.js` for new manifest format
  - Fetch visible tiles on demand based on zoom level
  - Cache tiles in IDB for offline use
  - Auto-prefetch L0 + L1 when manifest arrives (~2 MB/drawing)

- **S88** — Auto-push + polish:
  - Supabase realtime channel `project_tiles_ready`
  - FRT subscribes on project open, prefetches blurry tier for new drawings
  - Pin migration from S83 (still pending — 14 pins on legacy drawings)
  - Style guide bump v119 → v120+

## Key learnings (S84-85)

### Azure lessons
- Azure portal forms can mis-diagnose subscription state. Cloud Shell CLI is ground truth.
- Resource providers must be registered before first use on new subscriptions.
- Classic Consumption is Windows-only; Flex Consumption is the Linux path (and better anyway).
- Function keys are rotatable per-app; safe to paste into CLI, but rotate after any exposure.
- Cloud Shell `Ctrl+V` triggers bracketed paste artifacts — use `Ctrl+Shift+V`.

### Architecture lessons
- iPhone rendering quality ceiling is a real physical limit — no client-side cleverness beats server rendering for 100+ MB engineering PDFs.
- Azure HTTP gateway 230s timeout is an INFRASTRUCTURE limit, not a Function limit. Long tasks must use async patterns.
- Cloudflare Workers are for client-facing traffic only. Server-to-server uses direct R2 S3 API.
- Bucket name ≠ Worker name. Always check Worker Bindings panel.

### Debug lessons
- `sed -i 'Na\TEXT'` is more reliable than multi-line Python patches when exact line numbers are known.
- npm EBADENGINE warnings are usually harmless — N-API modules are ABI-stable across Node versions.
- Test small before big. A 4.5 KB PDF caught 3 separate bugs in minutes; a 128 MB PDF would have taken hours to debug the same issues.

## Sacred — do NOT touch in S86+

Same as S83 plus:
- Azure Function code without confirming with Mark (it works, don't break it)
- Worker tile route logic (works, don't refactor)
- R2 tile path convention `{pid}/tiles/{drawingId}/...`

Original sacred list:
- `viewer.js` core (above `_showDrawing`)
- `markup.js`
- `markupEngine.js`
- `tiledPdf.js` (will be rewritten in S87 for new manifest format — don't touch until then)
- The `go(pg)` recursive PDF upload pattern in `drawings.js`

---

# Session 99 Additions (April 24, 2026) — Rendering-Chain Investigation via `?s99test=` Toggle Framework

## TL;DR

S99 followed the handoff's "no theory-based pushes" rule. Built a URL-param diagnostic toggle (`?s99test=<name>[-<amount>]`) that gates rendering candidates behind opt-in testing. Mark A/B-tested on Chrome 147 desktop. Result: `delaysrc` (opacity=1 hold) promoted to non-iOS production default; `overlap` rejected (distorted CAD lines); `fastfade` and `prefetch` wired but unused. Final live state: commit `2bc24d8e`, SW `arencon-frt-v218`. L2 tile grid and iOS flash remain known issues, deferred.

## Commit chain

| Commit | Label | Description |
|---|---|---|
| `f3c643d9` | S99a | `?s99test=` framework + `overlap` candidate (tile-seam extension) |
| `82b08501` | S99b | + `fastfade`, `delaysrc`, `prefetch` candidates |
| `29f29efd` | S99c | **Failed promotion** — `overlap-8` universal + `delaysrc` non-iOS as defaults. Introduced "wavy" CAD line distortion at tile seams. Reverted. |
| `27d492ce` | S99d | REVERT S99c — back to S99b state (all toggle-gated, no defaults) |
| `2bc24d8e` | S99e | **CURRENT** — `delaysrc` promoted as non-iOS default ONLY. Overlap stays toggle-gated. |

## `?s99test=` Toggle Framework (permanent infrastructure)

Module-level URL param reader in `frt/js/viewer/tiledPdf.js`. Parses `?s99test=<name>[-<amount>]` once on module load. Activates a small burgundy "S99 test: <value>" banner bottom-right when any value is opted in. Zero cost in default path (when param absent).

Available toggles:

| Toggle | What it does | Production status |
|---|---|---|
| `?s99test=baseline` | Disables both S99 promoted fixes → pre-S99 rendering (overlap off + S94 220ms fade-out on non-iOS) | Escape hatch |
| `?s99test=overlap[-N]` | Extends interior tile cssR/cssB by N level-pixels (default 4) | Not default — causes CAD distortion |
| `?s99test=delaysrc[-N]` | Overrides hold duration (default 400ms) | `delaysrc` itself IS the non-iOS default |
| `?s99test=fastfade[-N]` | Fast fade-out (default 50ms + 20ms timeout). Replaces delaysrc behavior. | Diagnostic only |
| `?s99test=prefetch[-N]` | Warms HTTP cache for next-level tiles at N% zoom threshold (default 70) | Diagnostic only |

One toggle active at a time. Not composable.

## Promoted fix: `delaysrc` (non-iOS default)

**Behavior:** In the level-purge branch of `_renderVisible`, when old-level tiles are about to be dropped:
- iOS (iPad/iPhone) → snap-remove (unchanged from S95, Jetsam-safe)
- Non-iOS → `transition:none; opacity:1` then `setTimeout(removeChild + src='', 400ms)`

**Critical detail vs S98c failure:** S98c tried to delay the DOM purge by 500ms while the baked-in 180ms fade animation was still running. That somehow broke L4 sharpness. The delaysrc approach explicitly sets `transition:none` FIRST to override any in-flight fade, THEN locks opacity=1. This is the reason S99 succeeded where S98c failed.

**Tested outcome:** Flash on zoom-IN (L2→L3→L4) eliminated. Heap stable (~30MB on Chrome 147 desktop). Memory cost acceptable (400ms hold adds ~60-100 tile DOM nodes peak).

**Zoom-OUT caveat:** delaysrc does NOT eliminate the "split-second new tile rendering" visible on fast zoom-out L4→L3→L2. Root cause is different: new viewport expands to areas that were never covered by old tiles, so there are no pixels to hold. Inherent to tile pyramid architecture. Not considered a flash bug.

## Rejected fix: `overlap`

**Hypothesis:** Extend each interior tile's CSS width/height by N level-pixels so adjacent tiles overlap instead of butting edge-to-edge — masks JPEG edge-antialiasing artifacts at tile seams.

**Why it failed:** The overlap is achieved by STRETCHING the 512×512 source JPEG by N/512 pixels. Even at 1.56% stretch (N=8), this visibly distorts CAD line content at tile boundaries — straight lines appear to kink, and the entire drawing looks "wavy". Fine for photographic content; unacceptable for engineering drawings.

**Status:** Still available via `?s99test=overlap-N` for diagnostic A/B. Do not promote.

## Known issues remaining (filed for future sessions)

### iPad/iPhone Jetsam crashes (SEPARATE WORK STREAM)

Still open. S97 Fix #1 (viewport-sized markup canvas) was the architectural fix designed to drop iPad memory ~176MB → ~90MB. Has been deferred across S97, S98, S99 as rendering-chain bugs pulled focus. Mark confirmed in S99: "Last I tested on IPAD/IPHONE still crashed just so you know."

**S100+ priority:** execute S97 Fix #1 staged rollout (Commit A: DOM move + viewport sizing + CSS counter-transform; Commit B: migrate to JS render transform).

### L2 Tile Grid — ✅ RESOLVED S112 (corrected S132; historical detail retained below)

**[S132 CORRECTION]** This is no longer an open item. Resolved at S112: the canvas compositor (`_S99_CANVAS` default) uses one fractional CSS scale per level, so there are no sub-pixel seams, and the renderer now emits **WebP, not JPEG** — the named root cause (JPEG edge-quantization) is gone. Do not re-file as an open issue.

*Historical (pre-S112 analysis, kept for audit trail only):* Root cause was JPEG edge-quantization artifacts at 512px tile boundaries, most visible at L2 because tiles were stretched up for display and adjacent tiles didn't share compression context. The candidate fixes once filed (raise L2→L3 threshold, CSS blur at L2, lossless WebP L0–L2, server overlap bleed, accept-and-document) are obsolete — the WebP/canvas-compositor path superseded all of them.

### Edge-tile 404 errors — ✅ RESOLVED as a code issue (corrected S132; historical detail retained below)

**[S132 CORRECTION]** Not an open code bug. The renderer uploads every `cols×rows` tile, the manifest matches, and the client clamps to bounds. The S99-era 404s were old drawings produced by an *older* renderer — an operational re-render situation, not a code defect. If 404s recur on a legacy drawing, the action is operational re-tiling, not a code fix.

*Historical (S99 observation, kept for audit trail only):* S99 test logs (recording `r191s`) captured `err 3_10_4, err 3_6_4, err 3_7_4, err 3_11_4, err 3_9_5` on `dwg_1776631552442_pg2_yy4m` (format `level_col_row`, edge tiles at L3) — traced post-S132 to the older-renderer-output cause above.

### iOS flash on level transitions (ACCEPTED TRADEOFF)

iPad/iPhone still snap-remove old tiles (S95 behavior), so level transitions still show a brief flash on iOS. This is intentional — adding delaysrc on iOS would hold more tile DOM nodes alive, worsening Jetsam pressure. Decision deferred until iOS stabilization lands.

## Process lessons from S99

1. **The `?s99test=` framework approach worked.** Testing 4 candidates behind toggles without redeploying saved ~3+ failed push cycles compared to S98's theory-based approach. Keep using this pattern for future render-chain work.

2. **S99c was a bad promotion.** I promoted both overlap and delaysrc as defaults after Mark reported "overlap-8: grid gone, delaysrc: flash gone" in separate tests. But I didn't verify the COMBINATION was safe — overlap's CAD distortion was masked in the initial tests because attention was on flash. Lesson: before promoting two fixes as combined defaults, explicitly test the combination (e.g. both active simultaneously via a composite toggle).

3. **Zoom-out ≠ zoom-in for flash purposes.** delaysrc fixes zoom-in flash because new viewport is a subset of old. Zoom-out exposes new viewport area never covered by old tiles, so "hold old pixels" doesn't fill the gap. Future flash fixes must address both directions.

4. **"Wavy" and "squeezed" are CAD-specific complaints.** Photographic content hides sub-percent stretch; engineering drawings expose it. The `overlap` approach that works in photo-tile viewers (maps, etc.) is fundamentally incompatible with CAD line content. File this as a hard constraint for any future tile-seam fix.

5. **Mark's verification pattern:** device recordings + overlay snapshots + screenshots are the gold-standard diagnostic. Logs alone don't show what the user perceives visually. Always ask for screenshots when claims diverge from my model of the rendering chain.

## Sacred additions (do NOT touch in S100+)

- `?s99test=` toggle framework and all 4 candidate branches in `tiledPdf.js` — retained as permanent A/B infrastructure for future render-chain experiments
- `delaysrc` as non-iOS default in purge branch — proven fix, don't revert to S94 fade-out without equivalent validation
- iOS snap-remove path in `_iosNoFade` branch — Jetsam-safe, don't change until iOS stabilization work stream lands

---

# Sessions 112 + 113 (April 30 – May 2, 2026) — iOS abandonment, FRT v2 polish, architectural fixes

These two sessions together delivered the largest single-stretch of work on FRT v2 to date. S112 closed the iOS investigation that had been open for many sessions. S113 ran 24 pushes covering markup engine bug fixes, viewer architecture, modal styling consistency, contractor color palette, board view, PDF polish, Fly.io removal, and UX consistency rules.

## Platform support — final state

**Supported:** Desktop (any modern browser), Android tablets, Android phones.
**Not supported:** iOS — any version, any browser, any wrapper.

**Why iOS was abandoned (S112).** Empirical testing on iPad 9th-gen across iPadOS 16.3.1 and 18.7.8 in Chrome iOS 136 confirmed the toolkit cannot run on WKWebView regardless of memory-throttling toggles. Tab Jetsam-dies on first drawing-open at fit zoom with zero tiles loaded after ~4 seconds of idle. The crash happens at WebKit memory-ceiling at drawing-open allocation time and cannot be solved in JavaScript. Capacitor / Cordova / React Native WebView all use WKWebView — same engine, same Jetsam ceiling. **Do not promise a wrapper as a path to iOS support.** Native Swift/SwiftUI rewrite is the only viable iOS path — 3-6 months dedicated work.

**S113 cleanup (Push 1+2).** Removed: `_isIPhone`/`_isIPad`/`_isMobile` detection vars; `_S99_IOS_PURGE` flag and ios-purge block; `_detectJetsamReload` IIFE; `?s99test=ios-purge`; `?nopixi=1` / `?s99test=no-pixi`; `?iosres=N`; iPhone/iPad branches in `_allocateCanvas` (`maxPixels`); `!isIPhone` guard on the WebGL sibling canvas; the 257-line iOS DIAGNOSTIC BOOTSTRAP script in `frt/index.html`; the `📋 iOS Diag` button + `setupiOSDiag()`/`copyiOSDiag()` in Hub. Tile pool simplified: `_MAX_TILES = 800`, `_MAX_CONCURRENT = 6`. Markup canvas budget: Android phone 10 Mpx, everything else 25 Mpx.

## URL toggles — post-S113 final state

| Toggle | Purpose |
|---|---|
| `?dbg=1` | Enable LIFE buffer logging (also persists to `localStorage._frtDbg`) |
| `?s99test=img` | Force legacy `<img>` tile compositor (escape hatch if a drawing has a canvas-mode regression) |
| `?webgl=0` / `?webgl=1` | Disable / force-enable Pixi WebGL markup |
| `localStorage.ARENCON_NoWebGL='1'` | Persistent equivalent of `?webgl=0` |

All other toggles removed in S113. The `?s99test=` parser framework is preserved for future render-chain experiments — only `img` is a recognized value as of S113.

## Markup engine — fixes shipped in S113

S113 Pushes 4-5 fixed three pre-existing markup bugs that had been deferred:

1. **`_getBounds()` rotation-aware for shapes + text.** Previously returned the AABB of stored coords, ignoring `obj.rotation`. Render path applied `ctx.rotate(obj.rotation)` but bounds didn't, so selection box, group center for rotation pivot, eraser hit-test, click hit-test, and resize anchor all referenced the wrong rectangle. Fix: returns AABB of the four rotated corners. Identity for `rotation == 0`.
2. **`_segmentIntersectsBbox()` Liang–Barsky helper added.** `_shapeHitByEraser` now does both vertex-inside-bbox AND segment-vs-bbox intersection, catching fast eraser strokes whose sparse pointer-sampled vertices all land outside a small shape's bbox even though the path swept through it.
3. **`_segDistSq()` segment-segment distance helper added.** `_strokeHitByEraser` now does pair-segment minimum-distance check, robust against sparse vertices on either side. Fixes highlighter / polyline eraser missing fast strokes.

**Text rotation pivot fix (Push 5):**
- Render path: pivot moved from `(x1, y1-fs/2)` (left-baseline-center) to `(x1+estW/2, y1-fs/2)` (visual center). Text now spins in place instead of swinging around its left edge.
- Rotate-drag handler: dedicated text branch added BEFORE the shape branch. Previously text fell into shape branch which dereferenced `obj.x2/y2` (text doesn't have them), corrupting `origCx`. New branch rotates the text's visual center around the group pivot, derives new `(x1, y1)` anchor from new center, accumulates `obj.rotation`. Never writes `x2/y2`.
- `_getBounds` text branch made rotation-aware around the same visual center.

**Ctrl/Cmd+click multi-select.** `_handleSelectDown` checks `e.ctrlKey || e.metaKey` — toggles object membership in `_selectedIds` (add if not present, remove if present). No drag starts on toggle. Click without modifier behaves exactly as before.

**Selection box L4 click-target bigger (Push 24):** corner squares 8→11, rotation handle 7→9, line widths 1.5→2. Hit-test radii bumped to match (`_hitResizeHandle` 8→11, `_hitRotateHandle` 12→14).

## Markup canvas viewer-zoom-aware resolution (S113 architectural fix — Pushes 13-14)

The original architectural problem: at fit-zoom on a typical drawing (~0.22× viewer scale), the markup canvas's full drawing-pixel resolution gets bilinear-downsampled by the browser's CSS transform, washing out thin lines and producing "broken pen lines" + invisible selection box.

**Fix:** `Markup.setRenderScale(s)` exported method on the Markup module. Called from `viewer.js _applyTransform` on every zoom change. Resizes canvas internal pixels to displayed pixels, capped at memory budget.

**Critical invariants preserved:**
- `mc.style.width = drawW + 'px'` — unchanged. Wrap transform math intact.
- `mc._logicalW = drawW` — unchanged. `_getPos()` coordinate translation intact, eraser hit-tests intact, pin coords intact.
- `mc._dpr` now equals effective render scale. Existing render path's `ctx.setTransform(dpr, ..., dpr, ...)` correctly maps drawing coords → canvas pixels at the new resolution. **Zero changes to render logic** beyond canvas resize.
- 1% scale-change tolerance filters pan-only `_applyTransform` calls (no spurious re-renders during pan).

**WebGL renderer (`webglMarkup.js`) `resize(w, h, dpr)`** — accepts new `dpr` explicitly. Critical fix in Push 14: without passing the new dpr, Pixi computed its logical (drawing-coordinate) dimensions from the stale `_dpr` captured at init time, causing markup to drift to bottom-right of the canvas at fit-zoom.

```js
// webglMarkup.js resize() — Pixi dpr update is REQUIRED
if (typeof dpr === 'number' && dpr > 0) {
  _dpr = dpr;
  if (_app.renderer && _app.renderer.resolution !== undefined) {
    _app.renderer.resolution = dpr;
  }
}
var logicalW = Math.max(1, w / _dpr);  // logicalW must stay constant at drawing px
```

**Memory profile (drawing 6144 × 4096):**
- Fit zoom (s=0.222): canvas internal 1364×909 = **1.2 Mpx** (was 25.0 Mpx)
- Half zoom (s=0.5): canvas internal 3072×2048 = 6.3 Mpx
- Native (s=1.0): canvas internal 6124×4082 = 25.0 Mpx (budget cap)
- Zoom-in (s>1.0): canvas stays at 25.0 Mpx (browser upscales — same as before)
- Extreme zoom out (<0.08): floors at 0.08 to avoid degenerate sub-100px canvas

## Tile renderer — final state

**[S132 CORRECTION — supersedes the mupdf/container description below]** The LIVE renderer is the **Azure Function `arencon-pdf-render`** (pdfium **v2.2.1**, Canada Central) — verified S132 via `/api/health`. It is NOT a container app running mupdf. Renderer config: `LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288]`, `losslessLevels: [3,4]` (emits WebP, not JPEG). Any text describing `container-render/server.js` / mupdf / `mutool draw` / `arencon-pdf-render-v3` as the *active* renderer is HISTORICAL only — treat the pdfium Azure Function as ground truth. Always confirm via `/api/health` before debugging the renderer (the `renderer` field).

*Historical (pre-S132, retained for audit trail only — NOT the live renderer):*

**~~Single source of truth: Azure Container App `arencon-pdf-render-v3`~~** running mupdf via `mutool draw` (post-S107). Source in `container-render/`. Build pipeline `.github/workflows/build-container.yml` deploys on push to `container-render/**`. ~4-5 minutes from commit to live.

**Fly.io fully removed in S113 Push 21-22.** Deleted: `container-render/fly.toml`, `container-render/diag_s94.py`, `.github/workflows/fly-deploy.yml`. The Fly.io app `arencon-render-staging.fly.dev` is orphaned in Mark's Fly.io account — no GitHub connection. Mark to delete manually via Fly dashboard.

**S113 Push 21 was an over-deletion.** Push 21 deleted the entire `container-render/` directory thinking it was Fly.io-only. It wasn't — `Dockerfile`, `server.js`, `package.json`, `render.py` are the AZURE container source. Push 22 restored them. Lesson: when removing infrastructure, audit the build pipeline to confirm what each file feeds before deleting.

**CORS on Azure must be manually re-added after every deploy** — `https://hezhendong999-bot.github.io`.

## Pin renderer architecture

**Viewer pins:** SVG teardrop, viewBox 32×42, anchor at (16, 40) (marker tip). Outer white halo path + colored inner path + white inner circle r=9 at (16, 14) + bold text centered. Color logic: `iar→#E91E8C`, `general→#1A7A4A`, `low→#E67E22`, `high (default)→#C0392B`, `closed→0.5 alpha overlay`.

**WebGL pin renderer dependency (S112b — sacred, do NOT touch):** reads `getBoundingClientRect()` from the drawing element to position pins. On tile drawings, `dv-image` has empty `src` and gets `display:none` via CSS, returning 0×0 from `getBoundingClientRect()`, which causes `PinsGL.render()` to early-return on `!imgRect.width`. Fix in `viewer.js` (~line 1173): when `TiledPdf.isActive()`, use `dv-img-wrap`'s rect instead.

```js
var rectSrc;
if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()) {
  rectSrc = document.getElementById('dv-img-wrap') || img;
} else {
  rectSrc = img;
}
var imgRect = rectSrc.getBoundingClientRect();
```

**PDF report pin (Push 12):** matches viewer SVG path EXACTLY. New helper `_drawTeardropPin(ctx, anchorX, anchorY, pinW, d)` traces both viewer paths via canvas `bezierCurveTo` (no `quadraticCurveTo` — adheres to project rule). Same color logic as viewer. Sizing: minimap 7% of crop width (Push 15), full-drawing overlay 2.8% of image width. Number font sizes scale by `s = pinW/32` and bumped 20% in Push 15 to compensate for canvas `fillText` rendering glyphs visibly smaller than SVG `<text>`. Push 23: appendix table IAR badge wraps below `#N` aligned-left (margin-left:0 override) instead of inline-right.

## Modal styling consistency rules (post-S113)

**Mandatory: use the muted-button family classes from frt.css. No inline button styling in modals.**

| Class | Use for | Color |
|---|---|---|
| `.btn-muted-ok` | Yes / OK / Apply / Save / Add / Generate / Confirm | green |
| `.btn-muted-cancel` | Cancel / No / Dismiss / Close / Back | red |
| `.btn-muted-warn` | Revise / warning-tone alternative actions | orange |
| `.btn-muted-neutral` | Revert / Leave-without-saving / benign-tertiary | slate |

**Cancel button always on the right.** In any flex-row pair, primary action goes left, Cancel goes right. Sites verified in S113: Activity modal, Reassign Drawing, Reassign Contractor, Export PDF, AI Review field-select, AI Photo-spec, Inspector, showConfirm Yes/Cancel, showPrompt OK/Cancel.

**Light + dark mode both required.** Every new button class must define dark-mode variant. Test by toggling dark mode; nothing should look bright/saturated in dark mode.

**`showConfirm` Cancel uses fill (not outline).** Push 17 dropped the `outline:true` flag from showConfirm's Cancel — it now uses the muted-cancel filled style for visual consistency with Yes.

**`_createModal` color-detection logic.** When a button has `color: '#1A7A4A'` → `.btn-muted-ok`, `color: '#C0392B'` → `.btn-muted-cancel`. Other colors fall through to the older dark/light tint logic. To get muted styling, just pass the right color hex; no need to import the class manually.

## Contractor color palette

**`ctrColorClass(name)` exported from `deficiencies.js`** — deterministic 8-slot hash. "Site General" pinned to `ctr-c3` (green) regardless of hash. Used in:
- "Contractors on Site" chips (Deficiencies tab)
- Contractor group headers (4-px left-border accent + tinted name)
- All-Deficiencies table contractor cell (wrapped in `.ctr-tag` chip)
- Kanban cards (color of the # badge)

**Slots:**

| Slot | Light bg / text | Dark bg / text |
|---|---|---|
| `ctr-c0` (red) | `#FDEDEC` / `#C0392B` | `#3a1515` / `#f08080` |
| `ctr-c1` (orange) | `#FEF5E7` / `#E67E22` | `#3a2510` / `#f0a878` |
| `ctr-c2` (yellow) | `#FEF9E7` / `#B7950B` | `#322a10` / `#e8c878` |
| `ctr-c3` (green — Site General default) | `#EAFAF1` / `#1A7A4A` | `#0d2a1a` / `#80c8a0` |
| `ctr-c4` (blue) | `#EBF4FF` / `#1565C0` | `#0a1f3a` / `#88b8e8` |
| `ctr-c5` (purple) | `#F4ECF7` / `#7E22CE` | `#28163a` / `#c898e8` |
| `ctr-c6` (pink) | `#FCE4EC` / `#E91E8C` | `#3a1828` / `#f098c0` |
| `ctr-c7` (teal) | `#E0F7FA` / `#00838F` | `#0a282a` / `#80d0d8` |

If a contractor's hash collision lands on an unreadable combo, override by hard-coding in `ctrColorClass()`.

## IAR rules

- **IAR cannot coexist with low/general priority.** When activating IAR, `Model.toggleIAR` forces `priority='high'` and propagates to all `entries[i].priority`. Toggling IAR off leaves priority unchanged. Matches v1 behavior.
- **Activated IAR badge: pink `#E91E8C` fill** with `⚡ IAR` label.
- **Inactive IAR badge: subtle outline** — `background:transparent; color:#9AA5B5; border:1.5px solid rgba(154,165,181,.4)`. Push 18 fix.
- **In All-Deficiencies table:** IAR appears as a SECOND row below `Outstanding`/`Closed`, not in place of it. Status column shows the lifecycle state always; IAR is additive (Push 24).
- **In PDF report appendix table:** IAR wraps below `#N` in the Pin column with `margin-left:0` override so it aligns with the `#` symbol (Push 23).

## Diagnostic panels gated behind `?dbg=1` + 🔍 toggle

`#dbg-overlay` (LIFE buffer green panel), `#s97-recorder-panel`, `#arencon-frt-progress` (tile-progress), `#arencon-frt-anomaly` (anomaly counter) are all hidden by default. Surfaced via the floating 🔍 button (`#diag-toggle`) at top-right which toggles `body.diag-show`.

The toggle button itself only renders when debug mode is on (`?dbg=1` URL param OR `localStorage._frtDbg='1'`). To remove panels entirely from view: `_frtDbgOff()` in console.

**S97 DIAG burgundy banner permanently deleted in Push 9.** Won't reappear. The `_frtS97DbgRing` localStorage write inside `_dbgTick` was also removed; remaining reads (`_frtDbgOff` cleanup, `_frtDbgPeek` console helper) read the never-written key, get `'[]'`, produce empty output. Harmless.

## Drawing viewer chrome (S113 Pushes 6-7)

- **Cloud dot in viewer header** gets `cloudPulse` animation matching the FRT main-header dot (Push 6).
- **Drawing title always at the bottom** (`#dv-bb-namepill` in bottombar). Top-toolbar `.dv-title-wrap` hidden via `visibility:hidden` (kept in DOM so MutationObserver mirrors title text into bottom name pill).
- **Bottombar visible on every screen size** (was `@media max-width:900` only). Layout: prev/next on left, name pill in center, zoom controls on right.
- **`#dv-bb-tasks` (bottombar pin button) hidden globally** — top toolbar already has `📌`.
- **Floating `.dv-nav-controls` retired** — bottombar carries that role uniformly.
- **Title text size standardized** at `calc(13px + var(--ts))` across all screens.

## v1 vs v2 feature parity (post-S113)

| Area | Status |
|---|---|
| Project Info, Drawings, Deficiencies tabs | ✅ Parity |
| Summary tab (table + board) | ✅ Parity (Push 16, 18) |
| Photos tab + lightbox | ✅ Parity |
| Pin placement + WebGL renderer | ✅ Parity, **better** (Pixi) |
| Markup engine | ✅ Parity, **better** (rotation-aware bounds, segment-based eraser, viewer-zoom-aware canvas) |
| PDF report export | ✅ Parity (teardrop pin matches viewer) |
| JSON export/import | ✅ Parity |
| Issue/revision lifecycle (DRAFT→ISSUED→REVISION) | ✅ Parity (Mark confirmed working) |
| Smart filename with revision | ✅ Parity |
| AI features (Rewrite, Quick Fix, Review) | ✅ Parity |
| Cloud sync (Hub mode) | ⚠️ Infrastructure exists, NOT YET CONNECTED to Hub. Phase A target. |
| Tile rendering | ✅ Parity, **better** (Azure mupdf, no Fly.io duplicate) |
| Mobile responsive + dark mode | ✅ Parity |

## Phase A target (next session — S114)

**Hub dual launcher.** Add "Launch in v2 (beta)" button next to the existing Launch button on each project tile in `ARENCON_Project_Hub.html`. v2 button URL: `frt/index.html?project=<uuid>&pn=...&pname=...&client=...&addr=...&sfn=...#proj_<id>`. Verify schema/auth handoff. Mark to test side-by-side with v1.

Phase B (data migration) deferred to S115+.

## Sacred — do NOT touch (carry forward + S113 additions)

- `?s99test=img` escape hatch — only retained s99test value
- `_dbgLife()` LIFE ring buffer + `?dbg=1`
- `?s99test=` toggle parser framework — permanent A/B infrastructure
- Recursive `go(pg)` PDF upload pattern in `drawings.js`
- `_createDeficPhotoFromSource()` R2 upload pattern
- WebGL pin renderer's `dv-img-wrap` rect lookup in `viewer.js` (S112b fix)
- z-index:5 on `#markup-canvas`, `#markup-overlay`, `#markup-webgl-canvas`
- Canvas-per-level tile compositor as unconditional default (S112+S113)
- Markup canvas viewer-zoom-aware resolution (`Markup.setRenderScale`) — S113 architectural commit
- WebGL `resize(w, h, dpr)` signature — dpr param is REQUIRED when caller has changed scale
- Muted button family classes (`.btn-muted-ok` / `-cancel` / `-warn` / `-neutral`)
- Cancel-on-right convention in flex pairs
- `ctrColorClass()` deterministic palette
- IAR auto-promotes to high priority on activation
- "Site General" pinned to `ctr-c3` color slot
- Diagnostic panels behind `?dbg=1` + 🔍 toggle

## Process lessons from S113

1. **Mark's iteration cycle is fast.** 24 pushes in one session. Each push needs to be self-contained and validated. Brace counts + node --check must run before every push, no exceptions. Multi-file commits via GitHub API blob+tree+commit pattern is the right primitive.

2. **Don't trust over-broad cleanup verbs.** "Remove mupdf/fly.io entirely" sounded like delete the whole `container-render/` directory. Reality: that directory contained BOTH Fly.io AND Azure source. Audit the build pipeline before deleting infrastructure. If unsure, ask.

3. **Architectural fixes can't be tweaked in.** Pen blur at fit-zoom looked like a tweakable line-width problem. Two attempts (Pushes 9 + 10) both got rejected — first made strokes too thick, second broke eraser. The actual fix (Pushes 13-14) was architectural: make the canvas resolution adaptive. Stop pattern-matching to "tweak a constant" when the problem is at the wrong layer.

4. **Confirm mental model before coding when user says "match v1".** v1 had several behaviors v2 hadn't ported — Issue/revision modal, board view, IAR auto-promote. Each looks like a small thing in isolation; together they're substantial. Read v1 source first; don't assume parity.

5. **Cancel-on-right is a UX rule, not a preference.** Mark explicitly said "fix throughout" — apply it without exceptions across every modal. Do a full audit when applying a UX rule, not piecemeal.

6. **Before-and-after tests are gold.** When introducing helpers like `_segmentIntersectsBbox` or `_segDistSq`, write 5-10 logical unit tests covering edge cases (parallel, perpendicular, overlapping, zero-length, far apart). Catches algorithm bugs cheaply.

7. **iOS removal taught: don't be afraid to delete code permanently.** S113 deleted ~705 lines of iOS-specific code that had been accumulated across many earlier sessions. The codebase got measurably cleaner. Don't preserve dead code "just in case" — version control is the just-in-case.


---

# Session 113 Closeout — Strategic decisions + roadmap (May 2, 2026 final notes)

These decisions came out of the end-of-S113 v1↔v2 audit conversation with Mark. Captured here to survive into S114 context.

## NEW UX rules (must implement, S114 or S115)

### Escape key behavior

- **Escape closes popup modals** — pin editor modal, Issue/Revise/Revert modal, AI Review modal, Add Activity modal, Reassign modals, Inspector picker, etc.
- **Escape NEVER closes the drawing viewer.** The drawing viewer is treated as a navigation tab, not a popup. Only clicking the back button closes it.
- **Escape in drawing viewer cancels active markup state:**
  - Clears the active markup tool (returns to pan/select mode)
  - Deselects any selected markup objects
  - **Does NOT delete the selected markups** — only deselects
- Existing rule preserved: Escape cancels copy mode if active

### Text markup workflow

Current bug: clicking once to drop text, typing, then clicking elsewhere both confirms the text AND immediately starts a new text box. Should be a two-step flow:

- Click → place caret, enter text-input mode
- Type → text appears
- Click elsewhere → **confirms text only**, returns to text-tool-active-but-no-active-input state
- Click again → start a new text box

Single click confirms; user must click a second time to drop another text. Prevents accidental "ghost text boxes" when clicking around to inspect a finding.

## Decisions on v1 features (post-audit)

### KEEP / port to v2

- **`_autoDedup`** — content-hash-based dedup of drawings on import. Critical for v1→v2 migration safety.
- **`openProjectQuickEdit`** — right-click (or long-press) project tile in Hub → small popup to edit name/number/client/address inline. ~80 lines.
- **`openPinEditor` modal** — port from v1. Click pin on drawing viewer → full pin editor modal opens on top of drawing → all fields editable in-place → save closes modal, drawing stays. v2 currently does NOT have this (clicks go nowhere or jump to deficiency tab depending on context). Mark explicitly prefers v1's "stay in drawing context" UX.
- **`_buildDeficDescSuggestions`** — autocomplete dropdown of past observation/entry descriptions. ~30 lines + datalist injection.
- **ZIP bulk photo download** — JSZip-based, lazy-loaded from CDN. Photo gallery "Export selected" → single ZIP file.

### REPLACE with better alternative

- **`softLock` → presence heartbeat indicator.** Don't port the 20-min lockout overlay. Instead: every 30s send a "user X active on project Y" ping to a new `project_presence` table. Header shows "👤 Mark · 👤 Leslie editing now" when more than one user has heartbeated in last 60s. No lockout. No overlay. Modern collaborative-editing pattern.
- **`_checkBackupReminder` → "Last cloud sync: X ago" indicator.** Small text near the cloud dot, color-coded freshness (green <1min, amber 1-5min, red >5min). Replaces the anachronistic 30-day-old "back up your data" banner. Cloud is the backup now.

### SKIP permanently (don't port)

- **`showDeficTemplates`** — NFPA template picker library. Replaced by descSuggestions (item above) + AI Quick Fix.
- **`showWipeConfirmation`** — type-to-confirm WIPE modal. Standard `showConfirm` is sufficient now that cloud is the backup.

## Deletion + restore model (Phase 2 — already in roadmap)

Mark's question: "Don't let staff permanently delete (in case fired/vindictive), but don't pile up either."

**Solution: soft-delete with admin-only restore + 90-day auto-purge + daily R2 backup.**

### Schema (Phase 2)

`projects` table gets `deleted_at TIMESTAMPTZ NULL`. Reads default-filter `WHERE deleted_at IS NULL`. Deletion sets `deleted_at = NOW()` instead of `DELETE`.

### Two-tier permission

- **Staff** — soft-delete their projects. Project moves to "Trash" view (hidden by default). Staff cannot see the Trash.
- **Admin** (Mark, Leslie, Shaun) — see Trash. Two ops: Restore (sets `deleted_at = NULL`) or Permanently Delete (real `DELETE` + R2 cleanup).

### Vindictive-deletion protection (3 layers)

1. **90-day auto-purge** — cron Worker permanently deletes rows where `deleted_at < NOW() - 90 days`. Staff can't accelerate; admin can purge early.
2. **Audit trail** — `deletion_log` table: `user_id`, `project_id`, `deleted_at`, optional `reason`. Admin sees who deleted what when, last 12 months.
3. **Daily R2 backup Worker** — Cloudflare cron pulls every project as JSON to `arencon-files/backups/YYYY-MM-DD/`. Even after permanent delete + R2 cleanup, previous day's backup snapshot exists. Recoverable from R2 for ~30-90 days.

### Result

- Click Delete → 90 days in Trash → gone forever (auto-purged) — handles "piling up"
- Vindictive deletion before quitting → admin sees Trash → one-click Restore — handles "fired/vindictive"
- Hard delete via API somehow → daily R2 backup still has it — last-resort safety net

This is exactly what Phase 2 of the Strategic Roadmap is designed for. Already documented in `ARENCON_Strategic_Roadmap.md`. Doesn't need a separate session — it's on the docket as part of `user_profiles` + role enum + soft-delete columns work.

## AI chatbot in Hub — extended scope

Approved by Mark with extensions. Sessions S118-S122. Below is the agreed scope:

### Capabilities

**A. Pattern recognition / cross-project search:**
- "Find all deficiencies mentioning sprinkler deflector below light fixture"
- "Have we seen this issue before at any other building?"
- "Which projects have similar fire alarm issues to Caplink?"

**B. Time-based queries:**
- "Show me all outstanding deficiencies older than 60 days"
- "Which projects haven't had a field review in the past 3 months?"
- "How many deficiencies were closed last week?"

**C. Contractor accountability:**
- "How many open IAR items does Vipond have across all projects?"
- "Which contractor closes deficiencies fastest on average?"
- "Show me Site General deficiencies open >30 days"

**D. Quick navigation:**
- "Open Caplink page 5"
- "Show me deficiency #14 on Sprucewood"
- "Find Field Review Report #3 for Sprucewood project"
- Auto-suggests as user types project names / numbers

**E. Report generation shortcuts:**
- "Generate a draft executive summary for Caplink B01"
- "What's the current status breakdown for all active projects?"
- "Email Leslie a list of projects pending review"

**F. NEW per Mark — Summary reports with charts:**
- "List the top 5 contractors with the most deficiencies, make a bar chart"
- "Pie chart of open vs closed deficiencies by project status"
- "Histogram of deficiency closure time across last 6 months"
- "Stacked bar: priority breakdown per contractor"

Charts rendered inline in chat using **Chart.js** (Cloudflare CDN, lazy-loaded like JSZip). Agent generates data + chart spec; frontend renders. Optional "Download as PNG/PDF" on each chart.

### Architecture

Reuse existing `arencon-ai-worker.hezhendong999.workers.dev`. New chat endpoint takes:

```js
{
  query: "find all sprinkler deflector findings",
  context: {
    user_role: "admin",
    accessible_project_ids: [...]  // RLS-filtered list
  }
}
```

Worker:
1. Fetches relevant project rows from Supabase (filtered by `accessible_project_ids`)
2. Compresses into structured context
3. Sends prompt with tool-use schema: agent can call `get_project(id)`, `search_deficiencies(query, filters)`, `get_drawing(id)`, `generate_link(type, id)`, `generate_chart(type, data)`
4. Returns formatted response with embedded markdown links + chart specs

Cost logged to `ai_usage_log` like every other AI call.

### Phasing

Built **after Phase A + Phase 2 (RLS + roles)** because the agent needs role-aware filtering to be safe.

- **S118** — Backend: Worker route + Claude tool-use schema for project / deficiency / drawing queries
- **S119** — Frontend: Chat UI panel in Hub + deep-link generator + voice-input integration
- **S120** — Iterate on prompt engineering: which queries work, which need refinement
- **S121** — Add advanced capabilities (time-based, accountability, summary reports + charts)
- **S122** — Polish + edge cases

## Voice-to-text + AI cleanup pipeline

Approved. Two-stage:

### Stage 1 — Speech-to-text (S116)

Free, browser-native via `webkitSpeechRecognition`. ~30 lines. 🎤 button on description fields → speak → raw transcript appears.

### Stage 2 — AI cleanup via Quick Fix (S117)

Pipe raw transcript through existing AI Quick Fix path (Haiku, cheap). Adds:
- Punctuation
- Number normalization ("forty-five feet four inches" → `45'-4"`)
- Engineering vocabulary correction ("sprinkle effector" → "sprinkler deflector")
- NFPA/OBC reference formatting ("OBC three point two point five" → "OBC 3.2.5")
- Sentence structure (fragments → coherent prose)

Side-by-side UI: raw on left, cleaned on right, accept/edit/use-raw buttons.

Cost: ~$0.0003 per finding × 1000 findings/month = **$0.30/month**. Negligible. Time savings 3-5x faster description entry.

The chatbot input field also becomes voice-input, providing a unified natural-language entry point.

## Backlog / nice-to-have / future

These are noted but not scheduled. Build only when explicitly requested:

- **Photo tags** (per-photo "before/after/evidence/context" labels). Mostly relevant for multi-visit commissioning projects.
- **Contractor portal** — separate Hub-style entry, contractor sees their deficiencies, marks addressed, uploads evidence. Phase 5+ scope. Real value for contractor accountability but complex (auth + RLS + role).
- **NFPA Link integration** — investigate if NFPA Link has a public URL pattern. If yes, ~10 lines for "🔗 Look up" button next to deficiency descriptions. If no, dropped permanently.

### Don't build (decided against)

- **Sub-deficiencies / parent-child structure** — observations cover this. Adding tree structure complicates data model without proportional value.
- **`showDeficTemplates`** (NFPA template library) — descSuggestions + AI Quick Fix replace this.
- **`_checkBackupReminder`** — replaced by Last-sync indicator.
- **`showWipeConfirmation`** type-to-confirm — standard confirm sufficient now that cloud is backup.
- **Pin editor modal-jump-to-deficiency** UX — Mark explicitly prefers in-context modal. v2's tab-jump is wrong direction.

## Updated session priority queue

| Session | Scope |
|---|---|
| **S114** (LOCKED) | Phase A — Hub dual launcher + cloud sync verification + "Last sync: X ago" indicator + escape key rule + text markup workflow fix |
| **S115** | Multi-user safety + UX wins: presence heartbeat, `_autoDedup`, `openProjectQuickEdit`, port v1 pin editor modal to v2 |
| **S116** | Productivity batch: `_buildDeficDescSuggestions`, ZIP bulk photo download, voice-to-text basic (🎤 button) |
| **S117** | Voice + AI Quick Fix integration (cleanup pipeline) |
| **S118-S119** | Drawing revision tracking |
| **S120-S122** | AI chatbot in Hub (cross-project agent + summary reports + charts) |
| **S123+** | Symbol stamps, offline-first UX clarity polish |
| **Backlog** | Contractor portal, photo tags, NFPA Link if URL pattern exists |

## Phase 2 (RLS + soft-delete) is already documented separately

`HANDOFF_SESSION_114.md` (the next-session pickup) carries Phase A specifically. Phase 2 of the Strategic Roadmap (`user_profiles`, role enum, soft-delete columns, daily backup Worker) is its own track, scheduled per `ARENCON_Strategic_Roadmap.md`. Don't conflate with Phase A.


---

# Session 114 Closeout — Phase A complete (May 3, 2026)

S114 shipped 14 commits: 10 incremental UI/UX/AI pushes (1.1–1.10) plus the four primary-scope items (Hub flip, last-sync indicator, Escape rule, text-markup fix) and this docs commit. v1 retired to `legacy/`. v2 is the default for FRT.

## Final commit chain

| Push | Commit | Scope |
|---|---|---|
| 1   | a89ffcfa | Migration: sitePhotos→photos, entries→observations, drop responses[]; sig strip on push |
| 1.1 | ae25a6ca | Pin editor empty-modal fix; promote `d.description` defensively |
| 1.2 | 94d3d6bf | Photo gallery v3: selection, badges, cloud icons, date groups, filters |
| 1.3 | f638a605 | Hover-only controls; shift-click range select; restrict bulk delete to site photos |
| 1.4 | f5432654 | crossOrigin fix on lightbox; render debounce; (later-reverted) priority frames |
| 1.5 | b9348c03 | 3-column obs row; 100×100 photos; bigger upload tile |
| 1.6 | 5ff0d289 | AI scratchpad (multi-photo accumulation, 3 merge actions, native Ctrl+Z) |
| 1.7 | 23fa9b48 | Fixed 3-column layout (no auto-wrap) |
| 1.8 | 53e30a1a | AI Review consolidated to pin header; +Gallery picker; recolored drop buttons |
| 1.9 | 9a21b9ee | Muted color palette enforced; auto-bullet; redundant All dropdown removed |
| 1.10| 377e5a7e | Darker drawing chip; sequential contractor colors |
| 2   | 158f77e9 | Hub flip-to-v2 default; v1 archived to `legacy/ARENCON_Field_Review_Tool_v1.html` |
| 3   | 5c079424 | "Last sync: X ago" indicator with muted color-coded freshness |
| 4   | f62a7fe6 | Global Escape modal handler; text-markup two-step |
| 5   | 561281f0 | (interim closeout — superseded by P6 closeout) |
| 6   | 08778929 | Header reshuffle — title left-anchored; status/undo/redo moved to right cluster so the title can no longer shift |
| 7   | 353195ca | Restored cloud-status visibility at all widths — `header-actions > *` blanket-hide whitelist now includes `#cloud-status` so dot + last-sync stay visible on tablet + phone |

## V1→V2 schema migration (audited safe in S114)

Migration runs in `model.js setProject()` every time a project loads, idempotent:

1. `proj.sitePhotos` → `proj.photos` (rename; legacy site-photo array key)
2. For each deficiency:
   - If `entries[]` exists and `observations[]` is empty: build `observations[]` from entries (preserving photos and `_addressed`)
   - If both exist: observations is canonical, drop entries (audit confirmed they were pure mirrors)
   - Drop `responses[]` (all 15 in audit were empty placeholders)
   - Drop legacy `description` scalar after promoting it to `observations[0].text` if obs was empty

Audited against 3 real projects (Sprucewood, Sun Pharma, Caplink) — verified no per-entry `contractorId`, no `description`/`obs.text` divergence. Photo IDs are the same across `d.photos` / `entries[i].photos` / `observations[i].photos` (v1 dual-writes them as references, not duplicate photos on R2). Provably zero data loss.

Sun Pharma's 10 entries-only deficiencies (where observations[] was missing) had 38 photos total — all preserved through migration.

`sync.js push()` now also strips `signatures.sigInspectorData` / `sigWitnessData` (large base64) before sending to Supabase.

## Color palette rule — PERMANENT

**Muted colors only across all ARENCON tools.** Never bright saturated tones. Recorded to memory (#30). Mark has corrected this multiple times — the rule applies project-wide, day mode and dark mode equally.

| Element | Old | New (muted) |
|---|---|---|
| Drop button: Upload | `#3F6E9C` | `#5A6E80` slate-blue |
| Drop button: Camera | `#1A7A4A` | `#5C7A65` sage |
| Drop button: + Gallery | `#9C2742` | `#7D3F4F` muted burgundy |
| Drawing chip pill | `#2196F3` (bright blue) | `#2C4770` muted dark blue |
| Per-photo delete X | `#C0392B` | `#A85959` |
| Photo AI sparkle bg | `#9C2742` | `#7B2D8E` (matches header AI Review) |
| Pin AI Review button | n/a | `#7B2D8E` purple (matches header) |
| Last-sync freshness | green/amber/red | `#5F8068`/`#B07F5A`/`#A85959` |
| Contractor palette (8 slots) | bright | desaturated, see ctrColorClass |

Burgundy `#9C2742` reserved for primary CTAs only (Save, key actions). Status/badge/button accent colors elsewhere stay muted.

## AI Scratchpad architecture (P1.6 + P1.8)

Per-observation persistent panel below the 3-column row. Multi-photo accumulation: each photo's analysis appends with a separator. Whole-obs button does synthesis (replaces, capped at 4 photos per Worker call). Three merge actions use `document.execCommand('insertText')` so native Ctrl+Z reverts.

**Per-pin AI Review menu** in pin header (P1.8) — three modes pipe into the obs 0 scratchpad:
- Full review (photos + text) — uses `mode='photo_suggest'`
- Full review (text only) — uses `mode='rewrite'`
- Quick review (grammar/flow) — uses `mode='quickfix'`

State key: `<deficId>:<obsIdx>`. Survives DOM re-renders via `repopulateAllScratchpads` hook.

## 3-column observation layout (P1.5+, finalized in P1.9)

Each observation in deficiency tab uses a fixed 3-column grid (stacks to 1 column at <900px):

1. **Comment** (1fr) — textarea (min 140px tall)
2. **Photos** (1.5fr) — 100×100 thumbnail grid, hover-revealed delete + AI sparkle, no distinctive bg/border (transparent — photos float on parent)
3. **Drop zone** (1fr) — fixed dashed border, NEVER shrinks/wraps; Upload + Camera + +Gallery buttons in single row, muted colors

`obs-meta-row` (Shorten/Undo buttons) was removed — AI Review menu replaces them. Native Ctrl+Z still works for AI inserts.

## Hub now defaults to v2

`AVAILABLE_TOOLS.frt.file = 'frt/index.html'` — clicking the Field Review Report card on a project tile opens v2. v1 file moved to `legacy/ARENCON_Field_Review_Tool_v1.html` and unlinked from Hub. Available for reference if needed.

## Last-sync indicator

Replaces v1's 30-day backup banner. Sits next to cloud dot in v2 header. Stamp `_lastSyncedAt = Date.now()` on every `_setCloudStatus('synced', ...)`. `setInterval(_updateLastSyncIndicator, 30000)` re-renders relative time. Color-coded: muted green <1min, muted amber 1-5min, muted red >5min.

## Escape key behavior

Global capture-phase handler in `app.js` closes popup modals in priority order: gallery picker → activity modal → pin editor → AI field-selector → legacy photo-suggest → inspector picker → QR → leave dialog → AI Review popover. **Drawing viewer is never closed by Escape.** When no modal is open, `markup.js`'s existing Escape handler runs (cancel stroke / clear polyline / deselect / deactivate tool — but never close viewer).

## Text-markup two-step

Click → caret + input field. Click elsewhere → blurs the existing input (commit via blur listener), does NOT create a new text box. Next fresh click creates the new box. Eliminates the "ghost text box" double-action.

## Auto-bullet in observation textarea

Type `1 ` (digit + space) at start of line → auto-converts to `1. ` via `execCommand('insertText')`. Works for any digit count (`10 ` → `10. `). Ctrl+Z reverts. Pattern check: `/^\d+ $/` on the current line up to caret.

## Cloud status visibility — PERMANENT RULE (P7)

The cloud status dot and last-sync timing text MUST be visible at every screen width — desktop, tablet, phone. Mark's permanent rule. Inspectors need the live signal that data is actually syncing. The verbose "Saved to cloud" label MAY hide on narrow screens, the title MAY hide, the IDB indicator MAY hide, but `#cloud-dot` and `#last-sync-text` are the LAST things to lose visibility. If header runs out of room, move OTHER things into the hamburger menu first — including the day/night toggle if needed.

Implementation: in `@media(max-width:1024px)`, whitelist `#cloud-status` alongside `#dark-toggle` and `#mobile-menu-btn` against the `header-actions > *` blanket-hide. Verbose text inside (`#cloud-status-text`) still hides at narrow widths via the existing rule.

## TODO: Site photo markup original-preservation flow

Recorded for next session that touches site-photo markup:

When user marks up a site photo: keep the original untouched as a hidden backup AND save the markup as a SEPARATE marked-up photo. When user clears all markups (revert), the duplicated marked-up photo gets auto-deleted, leaving only the original. **Reference v1's `_origBackupId` field** on photo records and the revert flow. Mark explicitly said "go review V1 and copy exactly the feature." Required before site-photo markup is considered complete in v2.

## Light-mode color overhaul — DEFERRED

Mark flagged in P1.9: "I think you should redesign the colour style overall in day mode, as they look really odd." Not addressed in S114. Scope: page header bar, modal action buttons, status badges, dialogs, project info chips. Needs a coordinated CSS pass. Suggest scoping as the first thing in S115 OR a dedicated cleanup session.

## Updated session priority queue (post-S114)

| Session | Scope |
|---|---|
| **S115** | Light-mode color overhaul + presence heartbeat + `_autoDedup` + `openProjectQuickEdit` + port v1 pin editor modal additions to v2 |
| **S116** | Productivity batch: `_buildDeficDescSuggestions`, ZIP bulk photo download, voice-to-text basic (🎤 button), site-photo markup original-preservation |
| **S117** | Voice + AI Quick Fix integration (cleanup pipeline); Worker-side `mode='shorten'` if not already added |
| **S118-S119** | Drawing revision tracking |
| **S120-S122** | AI chatbot in Hub (cross-project agent + summary reports + charts) |
| **S123+** | Symbol stamps; offline-first UX clarity polish |
| **Backlog** | Contractor portal, photo tags, NFPA Link if URL pattern exists |


---

# Session 115 closeout

S115 shipped 13 commits on `main` (`81282b19` through `2bf8acbe`). The session pivoted from the originally-planned light-mode overhaul into a deep rebuild of the photo markup pipeline + v1 photo-data recovery against a real corrupted project. Light-mode overhaul, presence heartbeat, and pin editor v1 port-over are all carried forward to S116.

## What got built (high level)

| Area | Outcome |
|---|---|
| Drawing dedup | `_autoDedup` ported from v1; runs in `setProject()`. Folder-scoped (folder \| name) so two photos with the same name in different folders are NOT treated as duplicates (v2 has folders, v1 didn't) |
| Folder drop UX | Entire `.dwg-folder-group` is now a drop target. Drops on folder header / body whitespace / existing tiles all route to that folder. Master `#dwg-upload-zone` at top is the only thing that creates new folders |
| Photo markup pipeline | Full v1-style propagation: mark a photo once, applies everywhere (gallery + every defic copy + pin references) sharing the same R2 key. Backup record created on first markup, removed on revert. CASE-based handler with explicit branches |
| Markup revert | Bulletproofed against multiple corrupted-state scenarios; aborts with visible alert if backup r2Key itself contains `/marked/` (indicates earlier-session corruption) instead of silently no-oping or deleting the only remaining image copy |
| Defic + pin-editor refresh | Both render their photo thumbnails using the same fallback chain as the gallery (`thumb \|\| dataUrl \|\| r2Url`). Both subscribe to `Model.onChange('photo')` for instant re-render on markup save/revert |
| `_dayKey` priority order | Matches v1: defic photos prefer parent defic `notedDate` over id timestamp. Photos uploaded weeks after a field visit still appear under the visit date |
| Hub Edit | New ✏️ button on each project tile opens existing Edit Project modal directly. Skips the project detail-page round-trip. Hover-reveal on desktop, always-visible on touch |
| Photo rotate | Lightbox rotation now pivots around photo center via translation-offset trick (was: rotated around top-left CSS origin, swung the photo off-screen) |

## Photo markup architecture (PERMANENT — read carefully before touching)

### CASE branching in `frt-markup-saved` handler (`photos.js`)

The save handler has 4 explicit cases. Every code path must be assigned to one of these:

| Case | Trigger | Action |
|---|---|---|
| **CASE 1** | `existingBackupId` is set on the photo (re-save of already-marked photo) | Skip backup creation. Re-upload marked blob (same deterministic key). Stamp siblings (no-op for fields already correct) |
| **CASE 2** | First markup, `preKey` is set AND not pointing at `/marked/` | Create gallery backup record pointing at preKey/preUrl. Stamp every sibling sharing preKey with new marked r2Key |
| **CASE 3** | First markup, no `preKey` (or preKey is corrupted `/marked/` path) BUT `_origBlob` is available | Upload `_origBlob` to R2 ourselves (`photos/{pid}/frt/original/orig_{photoId}.jpg`), then create backup pointing at the freshly-uploaded original, then stamp siblings |
| **CASE 4** | First markup, no preKey, no `_origBlob` | Warn loudly. Stamp `_annotated=true` but pass `null` backupId. Markup persists; revert won't work for this record. Should be vanishingly rare in practice |

`preKeyIsMarked` detection (the photo's r2Key already contains `/marked/`) is treated as if preKey were empty — falls through to CASE 3 or CASE 4. This is the corrupted-state recovery path; without it, a previously-corrupted photo would create a backup pointing at a marked file (same key as the active photo), and a subsequent revert would delete the only remaining image copy.

### Cross-context propagation

Photos sharing the same r2Key are siblings. `Model.findPhotosByR2Key(r2Key)` walks every location:
- `proj.photos[]` (gallery + backup records)
- `contractor.deficiencies[].photos[]`
- `contractor.deficiencies[].observations[].photos[]`
- `contractor.deficiencies[].entries[].photos[]` (legacy)
- `generalDeficiencies[].*.photos[]` (same shape)

`_stampSiblings(backupId)` mutates every sibling identically: new r2Key, new r2Url, `r2Status='uploading'`, `_annotated=true`, `_origBackupId=backupId`, today's `addedDate`. Plus shares the lightbox blob URL across all siblings as `dataUrl` for instant visual feedback.

### Photo render fallback chain (PERMANENT RULE)

Every photo render surface (gallery, defic tab, pin editor) MUST use this priority:

```js
var src = ph.thumb || ph.dataUrl || ph.r2Url || '';
```

- `ph.thumb` — small data URI cached on the record. Survives reload. Fastest render. Set by `_addSitePhoto` on initial upload OR by markup save handler's async thumb-gen (~100-500ms after save).
- `ph.dataUrl` — may be a `blob:` URL set during a markup session. Document-scoped (any `<img>` on the page can use it). Provides instant feedback before R2 upload completes. Stripped from IDB persistence by `_stripBlobUrls`.
- `ph.r2Url` — R2-hosted file. Works after upload completes. May 404 mid-upload.

If the order ever gets reordered: marked photos will appear broken until R2 upload finishes. Don't reorder.

### Notification model

`Model._notify('photo')` must fire after EVERY mutation that affects render. S115 P11 added these calls:
- After `_stampSiblings` — covers initial backup creation and sibling propagation
- After async thumb generation completes — covers `ph.thumb` getting set
- After R2 upload of marked blob completes — covers `r2Status` flipping to `'uploaded'`

Both `deficiencies.js` and `viewer.js` (pin editor section) subscribe to `Model.onChange('photo')` and re-render. The `photos.js` gallery uses RAF-coalesced `_scheduleRender`.

### r2Status values (PERMANENT)

Gallery's cloud-icon check is `r2Status === 'uploaded' || (r2Url && !r2Status)`. **Use `'uploaded'` everywhere, never `'synced'`.** Earlier S115 commits used `'synced'` and broke the green-cloud icon for hours of testing time.

Other valid values: `'uploading'` (in flight, yellow icon), `'failed'` (red icon), `'pending'` (queued for retry).

### Date logic

The `(original)` backup record gets the **original photo's** `addedDate` (preserved). The marked-up photo gets **today's** `addedDate` — unless the photo was already added today (in which case no change).

Revert restores `addedDate` from the backup record onto every sibling. Without this, reverted photos show under today's date in the gallery instead of their original date.

### Permanent debugging command

```bash
# Hit /api/health to know what renderer is actually serving requests, no code edits before this
curl https://arencon-render-staging.fly.dev/api/health

# Verify JS module syntax (CRITICAL — plain `node --check` lies)
node --input-type=module --check < path/to/module.js
```

## Validation rule (NEW PERMANENT — S115 P6 lesson)

`node --check file.js` reports OK on syntactically broken ES modules because it parses them in CommonJS mode and the import statements at the top fail first, masking later syntax errors.

**Always validate ES modules with stdin + module mode:**

```bash
node --input-type=module --check < path/to/module.js
```

S115 P5 shipped a syntax error to production (escaped-apostrophe in a `console.warn` literal broke the entire `photos.js` module parse → blank FRT page on load). Plain `node --check` had reported OK. P6 was the hotfix.

This rule is added to memory. Never use plain `node --check` on `.js` files in this project again.

## Photo markup recovery scripts (S115 artifacts)

Real-data-corruption recovery from earlier buggy S115 commits. Mark applied all of these against project 1490.04 successfully. Kept as templates for any future similar issue:

| Script | Purpose |
|---|---|
| `arencon_photo_recovery.js` | Restores `r2Key/r2Url` on photos whose r2Key got overwritten to `/marked/` paths during early buggy markup saves. Uses v1 JSON export as authoritative source (id → r2Key mapping) |
| `arencon_date_recovery.js` (v1) | Clears `addedDate` on photos whose value matches today but id timestamp says otherwise |
| `arencon_date_recovery_v2.js` | Broader: clears `addedDate` whenever it doesn't match the photo id timestamp |
| `inspect_pin1.js` | Diagnostic — dumps full state of a photo by id |
| `clear_pin1_date.js` | Surgical — clears `addedDate` on a specific photo id |

All run in browser console via `window.__arenconRecovery.commit()` / `cancel()` pattern. Plan-then-confirm — print full plan first, require explicit commit() call.

## What was deferred to S116

Originally-planned S115 items that didn't ship:
- **Light-mode color overhaul** — Mark redirected on turn 2. 123 hits in `frt.css` already inventoried during P1 investigation. Still owed.
- **Presence heartbeat** — `project_presence` table + 30s ping + header indicator. Still owed.
- **Pin editor v1 port-over** — activity log inline + linked findings + photo carousel. Still owed.

S114 deferral that's still open:
- **Worker `mode='shorten'`** — Cloudflare Worker patch. Mark deploys manually.

## Process lessons from S115

1. **Plain `node --check` lies for ES modules.** Always use `node --input-type=module --check < file.js`. P6 hotfix taught this the hard way.
2. **Console output is faster than guessing.** Once Mark started pasting `[Markup save]`/`[Markup revert]` console output, every remaining bug became diagnosable in one pass instead of three. Add diagnostic logging early; remove only after stable.
3. **Real corrupted data is unforgiving.** Mark's project 1490.04 had legacy v1 photos plus accumulated S115-buggy state. Recovery required: (a) the v1 JSON export, (b) live R2 listing to confirm originals still existed, (c) targeted scripts to walk every photo location. Lesson: always preserve JSON exports before destructive code changes.
4. **Self-reinforcing corruption is the worst kind.** A photo that ended up with `r2Key='/marked/...'` AND `_origBackupId=null` would re-corrupt every time it was marked up. Detection in BOTH save AND revert paths needed; just one wasn't enough.
5. **Escape-apostrophe in `str_replace`-generated literals** — passing `won\\'t` through Python's `str_replace` ended up as `won\\'t` (literal double-backslash + escaped apostrophe) in the JS file, which is a syntax error. Just write "will not" or use `&apos;` if HTML, or use a different quote style. Don't escape escapes through tools that escape.

## Stable commits this session

| Push | Commit | Description |
|---|---|---|
| 1 | `81282b19` | `_autoDedup` ported to v2 |
| 2 | `937f238c` | Photo markup original-preservation + folder drop-target fix |
| 3 | `3b910722` | Gallery markup persistence + lightbox top-bar Revert + pin editor lightbox click |
| 4 | `b214980f` | r2Status='uploaded', backup keeps original date, fresh thumb gen, rotate-around-center |
| 5 | `a3bf167f` | Defic markup CASE 3 (upload `_origBlob` first) |
| 6 | `fbdba1bc` | HOTFIX: escaped-apostrophe syntax error |
| 7 | `4400e9fa` | Simplify save/revert with explicit CASE 1/2/3/4 branching |
| 8 | `425f297d` | Detect corrupted-state `/marked/` in preKey + revert backup |
| 9 | `feb48fe7` | Defic tab re-renders on `'photo'` notify; revert restores addedDate |
| 10 | `746f69ee` | Defic + pin-editor thumbs prefer `ph.thumb`; pin editor re-renders on photo notify |
| 11 | `552c41dc` | Instant marked-thumb feedback via shared blob URL; strip blob: URLs from IDB save |
| 12 | `c929935d` | `_dayKey` priority matches v1 (parent defic notedDate before id timestamp) |
| 13 | `2bf8acbe` | Hub Edit project button on dashboard tile |

End of S115 — proceed to S116.

---

## Session 119 Additions (Per-obs priority + status independence; confirmation audit; photo refactor design locked)

### Final state
- 9 commits on `main` (`216ef63d` through `9a22bc47`)
- All FRT JS files clean on `node --check`; CSS brace count balanced
- Bug-free integration verified by Mark on device after each push
- Photo refactor design locked via demo iteration; ready to implement in S120

### Per-obs priority + status (Phase A — Push A `216ef63d`)
Each `observation` now carries its own `priority` and per-obs addressed metadata. Pin-level `d.priority` and `d.status` kept as last-bulk-set snapshots; renderers use derived values:
- `Model.getEffectivePriority(d)` — max across obs (high > low > general), pin-level fallback
- `Model.getEffectiveStatus(d)` — 'closed' iff every obs `addressed`

Schema migration in `setProject` is idempotent: backfills `o.priority` from `d.priority`, backfills `addressedOnInstance/addressedDate` for already-addressed obs.

New methods: `Model.updateObsPriority(deficId, obsIdx, priority)`. Existing `Model.toggleObsAddressed` upgraded to track `addressedDate` / `addressedOnInstance` and mirror `d.status` to effective. `Model.updateDeficStatus` propagates pin-level intent to every obs's addressed flag (bulk semantics).

Rendering paths updated to use effective values:
- Pin marker color (GL + HTML + tasks panel)
- Pin editor mini-map
- Pin editor title
- Pin editor STATUS dropdown + IAR enable-state (now per-active-observation, rendered inside `_peRenderObsContent`)
- Priority buttons in pin editor write `obs[_peObsIdx].priority`, not `d.priority`
- Status save in pin editor routes through `Model.toggleObsAddressed`
- Deficiency tab card: effective-priority badge in top row (read-only), per-obs priority dropdown in each obs row (`data-action="obs-priority"`)
- Reassignment business logic (general↔non-general → contractor reshuffle) fires on **effective** priority transitions, not per-obs writes
- Pins kanban + table: filter, sort, column placement, cell colors all use effective
- PDF: pill color uses `r.obs.priority`; `_pushItems` filters general per-obs (mixed pins emit cards only for non-general obs); `mainBodyDefs` filter is per-obs aware

### Bug fixes from Phase A integration testing

**Push B (`7ba1c049`)** — pin-editor footer auto-wraps on phones. `.pin-editor-footer` got `flex-wrap:wrap` + `row-gap:8px` so the 5 action buttons reflow into 2 rows on narrow screens. Inline `margin-left:6px` on `#pe-goto-dwg` / `#pe-unpin` zeroed so flex `gap` is the sole spacing control (margin + gap stacked caused premature wrap on borderline widths).

**Push C (`ac6d4faa`)** — textarea no longer loses focus while typing. The Push A change introduced an `obs-priority` dropdown that triggered re-render via the `'saved'` notifier, destroying the textarea node. Fix: `'saved'` and `'photo'` listeners in deficiencies.js skip the re-render when an INPUT/TEXTAREA inside `#tab-deficiencies` has focus. The mutation is already applied to Model and the textarea's value already shows what the user typed; next normal render catches up.

**Push D (`3bff83df`)** — per-obs contractor selector applies on first click. Race condition: `change` event called `_pinAutoSave` (debounced 250ms) and synchronously called `_peRenderObsContent`. Re-render read stale `o.contractorId` because debounce hadn't fired yet, so dropdown reverted to the old value. Fix: write `contractorId` to model synchronously in the change handler before re-render.

**Push E (`b03c25a5`)** — PDF respects per-obs contractor + per-obs description. Two issues from Push A's S118 obs flattening: (1) `_pushItems` hardcoded `r.ctr` to pin's parent `ctrName`, ignoring `obs.contractorId`. (2) Per-drawing appendix and closed-summary tables used `_deficDesc(r.d)` which always returns `obs[0].text`, duplicating identical content for multi-obs pins. Added `_itemDesc(r)` and `_itemIsOpen(r)` helpers; `_pushItems` looks up `obs.contractorId` in `p.contractors` and uses that name as grouping key with fallback to `ctrName`.

**Push F (`170fca91`)** — cross-contractor suffix on item labels. When a pin's obs span >1 contractor, every obs of that pin gets a letter suffix (`#4-A`, `#4-B`, ...) on its display label. Same-contractor multi-obs pins keep plain `#N`. Suffix appears on main report card item number, per-drawing appendix Pin column, closed-summary Pin column. Teardrop on drawing image still shows plain pin number. Plus IAR replaces "Outstanding" in the per-drawing appendix Status column (Mark request — match the first item's IAR badge style).

**Note on main card item number change:** pre-S119 cards showed sequential `r.rn` (1, 2, 3, ...). Post-Push F cards show pin-number `r.numLabel`. Same-contractor multi-obs pins now show e.g. `#3 / #3` (duplicate but distinguishable by description). Mark approved this via the demo mockup before Push F. If he later wants universal suffixing (suffix even when same contractor), it's a one-line change in `_pushItems`.

**Push G (`a1b6162b`)** — item# size + closing-note orphan fix. `.dc-itemnum` 14pt → 11pt to match the contractor banner font size (visual hierarchy was inverted). Closing note "Further deficiencies may be noted..." top/bottom chrome reduced from 26px (margin-top:16px + padding:10px) to 6px, so the note fits in any spot with at least ~22px free instead of the previous ~42px requirement. Edge case where even compact doesn't fit still spills cleanly.

### Confirmation audit (Phase B — Push H `d8c37301`)
New helper in `frt/js/shared/dialogs.js`: `showTypeToConfirm(title, message, requiredText='DELETE')`. Returns `Promise<bool>`. OK button starts disabled (`opacity:0.45; cursor:not-allowed`); enables only when input matches required text exactly (case-sensitive). Esc → resolve(false). Enter when enabled → resolve(true). Red destructive styling, `Cancel | Delete` button order.

| Action | Before | After |
|---|---|---|
| Deficiency-tab card "Remove Pin" button | No confirm | `showConfirm` matching `#pe-unpin` copy |
| `_resetProject` (More menu → Reset Entire Project) | Simple confirm | type-DELETE |
| `_resetCurrentTab` (More menu → Reset Current Tab) | Simple confirm | type-DELETE with tab-specific scope message |
| Hub `purgeProject` (single permanent delete) | Browser `confirm()` | Custom type-DELETE modal `_typeToConfirmPurge` |
| Hub `bulkPurge` (multi-select permanent) | Browser `confirm()` | Same type-DELETE modal |

Hub modal is inline (no ES modules in Hub). Mirrors existing "Move to Trash" type-DELETE modal style — single source of truth for type-DELETE in Hub script.

### Dead UI cleanup (Push I `9a22bc47`)
Removed:
- `data-dv-action="delete-all-markup"` button (drawing viewer ⋯ menu) — never had a JS handler
- `data-dv-action="delete-all-pins"` button — same
- The `<div class="dv-more-sep">` separator above them
- `#mobile-clear-all` button (mobile menu) — `display:none` + no handler, redundant with `#mobile-reset-btn`
- Orphan CSS for the above (4 lines in frt.css across both light + dark + drawing-viewer-overlay scopes)

If "Delete All Markup" or "Delete All Pins" become wanted features later, both can come back wired with type-DELETE confirms following the Push H pattern.

### Locked design for S120 (no code yet)

**Photo refactor — pool model + per-obs assignment.** Iterated through three demo versions with Mark; v3 design locked.

Data model:
- `defic.photos[]` = source pool. Owns sourceR2Key, thumb, dataUrl. One entry per source photo regardless of how many obs use it.
- `obs.photoSelection` = `null` (default = all pool photos shown for this obs) OR an array of pool photo IDs (custom subset).
- `obs.photoMarkups[poolPhotoId]` = `{ markupOverlay, markedR2Key }` per (obs, pool photo) pair. Independent markup state, independent revert behavior. Same source photo on two obs = two independent markup overlays + two marked R2 keys; source bytes shared.

Workflow:
- Default = inclusive: every obs shows every pool photo with no inspector action. Reports just work.
- "Manage photos" button enters selection mode for current obs. Header has master checkbox (none/some/all states like Google Photos), `[N] of [total]` count.
- Two distinct save actions in selection mode: "Save as Obs X selection" (green) sets `obs.photoSelection`; if everything checked, sets to `null` (default). "Delete N from pool" (red, destructive) — `<5` photos = simple confirm modal, `≥5` photos = type-DELETE modal. Removes from pool AND from every obs's `photoSelection`.
- Cancel exits without saving. "Reset to default" button (outside selection mode) sets `obs.photoSelection = null`.

Visual indicators:
- **Dots only in selection mode within pin editor.** Not in view mode, not in report, not in gallery. Each obs has a fixed color; every photo carries small colored letter-dots in bottom-left for OTHER obs that have it in their custom selection. Default-state obs contribute no dot (would clutter). Helps inspector see cross-obs assignments while picking.
- **Orphan warning:** in selection mode, when at least one obs is custom AND a photo has zero dots from any source AND isn't in the active obs's pending selection, the photo gets a thin red outline + ⚠ badge. "This photo will appear in zero reports." Easy to fix or ignore intentionally.
- Tab itself shows `• custom` text next to obs letter when `photoSelection !== null`.

New uploads always land in pool. Default-state obs auto-show new photos. Custom-state obs do NOT auto-add — inspector explicitly assigns. Avoids "I narrowed Obs A weeks ago, then uploaded a photo and it silently appeared there."

**Pin editor footer cleanup.** `Save / Go to drawing / Remove pin only / Delete / Cancel` → `Save / More ▾ / Delete / Cancel`. "More ▾" dropdown contains "Go to drawing" + "Remove pin only".

**IAR auto-deactivate prompt.** When closing a deficiency from any path (bulk close, single close button, defic-card status dropdown, pin-editor STATUS → closed on last obs), if `defic.iar === true`, show modal: "Pin #N is currently marked IAR. Closing it will automatically deactivate IAR. Confirm close?" OK → set `iar = false` AND status closed. Cancel/Esc → abort entirely (status stays open, IAR stays active).

Currently in code: bulk close silently sets `iar = false` (no prompt). `Model.updateDeficStatus` doesn't touch `iar` at all. Pin editor STATUS → closed routes through `Model.toggleObsAddressed`, no IAR handling. All three need a shared `confirmIARDeactivate(deficId): Promise<bool>` helper called before deciding what to do with `iar` + status.

**T+0 rules verified in place** — current FRT v2 already implements them correctly (closed in current FRT → full card + appendix; closed in prior FRT → appendix only no photos; closed-summary groups by which FRT closed it via header banner; reopen via `Model.updateDeficStatus(id, 'open')` clears closure metadata; defic data carries across instances). Closed-summary section grouping is per-banner not per-row; Mark approved leaving as-is.

**Esc layered behavior.** Existing global handler in `app.js` line 1471 already does most of this — priority-ordered modal list, drawing viewer never closes on Esc, falls through to markup.js for tool/selection cancel. Gaps for S120: pin editor selection mode (Esc exits selection, NOT closes pin editor); IAR confirm prompt (Esc = abort close); "More ▾" dropdown (Esc closes dropdown only). Add inner-state checks at top of handler for these.

### Critical principles reinforced this session

- **PDF item flattening (S118 design) carries forward.** Each obs is one report card with its own description, photos, status pill, item label. Multi-obs pins share pin number on the drawing teardrop but emit separate cards.
- **Effective priority/status > pin-level fields.** Always use `Model.getEffectivePriority(d)` / `Model.getEffectiveStatus(d)` for rendering. Pin-level `d.priority` / `d.status` are last-bulk-set snapshots, not source of truth.
- **Cross-contractor pins keep grouping atomic.** `ctrG2` groups by `r.ctr`; per-obs contractor override changes which bucket an obs lands in. Vipond fully completes before Site General appears in the report flow.
- **Close paths all leak IAR currently** (gap to fix in S120). Audit every close path before assuming IAR auto-clear is in place.
- **`'saved'` notifier triggers re-render** which destroys focused inputs. Always check `document.activeElement` before re-rendering on save events.
- **250ms `_pinAutoSave` debounce** races with synchronous re-render in pin editor handlers. Write to model synchronously in change handlers if rendering depends on the new value.
- **Hub doesn't import ES modules.** Type-DELETE modals there are inline functions. Don't try to import `showTypeToConfirm` in Hub.
- **`r.numLabel` carries the suffix** (cross-contractor disambiguator). All renderers should use `r.numLabel || r.rn || r.d.num`. Teardrop on drawing image stays plain `d.num` (one number per physical pin).

### Final commit state
- `9a22bc47` on `main`
- Cache busters: `frt.css?v=245`, `sw.js CACHE_NAME = 'arencon-frt-v286'`
- All FRT modules pass `node --check`
- CSS brace count: 2409 / 2409 balanced

End of S119 — proceed to S120 (photo refactor + IAR prompt + pin editor footer + Esc inner-state checks).


---

# Project Knowledge — S120 Additions (delta)

Append after the S119 section.

---

## Session 120 Additions

### Photo Pool model (S120 C1)

The FRT moved from per-obs photo storage to a project-level pool with per-obs visibility selection.

**Schema:**
- `defic.photos[]` — source pool. Photos live here once.
- `obs.photoSelection` — null = obs sees ALL pool photos (default), Array<photoId> = custom subset.
- `obs.photoMarkups[poolPhotoId]` — per-(obs, photo) markup state.
- `defic._photoPoolMigrated = true` — idempotence flag.
- Legacy `obs.photos[]` retained as silent backup, no longer read.

**Helpers in model.js:**
- `Model.getEffectivePhotos(deficId, obsIdx)` — live photo list after photoSelection.
- `Model.addPoolPhoto(deficId, photo)` — appends to pool, fires `_notify('photo', { action: 'add-pool', ... })`.
- `Model.removePoolPhoto(deficId, photoId)` — soft-deletes, cascades to all obs.photoSelection + obs.photoMarkups. R2 NOT touched (recovery layer).
- `Model.restorePoolPhoto(deficId, photoId)` — clears deleted flag. Does NOT re-add to any custom selections.
- `Model.setObsPhotoSelection(deficId, obsIdx, selection)` — null resets to default.
- `Model.isObsCustom(deficId, obsIdx)` — boolean.

Migration runs in `Model.setProject` if `!proj._photoPoolMigrated`. Idempotent.

---

### Collision-resistant ID generator (S120 P22)

**Format:** `prefix_<ms>_<counter>_<rand8>` — e.g. `def_1778210878268_3a_kx9p4mn7`.

Components:
- `Date.now()` — millisecond timestamp.
- `_uidCounter` — module-private monotonic counter (base36), masked to 24 bits. Uniqueness within a single ms regardless of mint count.
- 8-char base36 random — defense in depth across reloads/multi-tab.

Previous format used 4-char random (1-in-4096 collision rate within same ms — confirmed in production data). New format: effectively zero collision rate.

All 11 mint sites in model.js now use `_uid(prefix)`.

`duplicateDeficiency` does `JSON.parse(JSON.stringify(src))` for the clone. The new outer `def_*` id is fresh, but the clone preserves source observation ids — P22 added a re-id loop giving every cloned obs a fresh `_uid('obs')`.

---

### Pin editor live-refresh (S120 P23)

The pin editor renders once at `_openPinEditor` and previously didn't react to external Model changes.

**Implementation:**
- `_peSubscribed` sentinel — registers Model listeners ONCE on first open.
- Subscribes to `photo`, `observation`, `deficiency` events.
- Handler `_peOnModelChange(type, data)`:
  1. Returns early if `_peDeficId` is null (editor closed).
  2. Returns early if `_peSelectionMode` active (selection mode has its own redraw).
  3. Tests if change touches our defic via deficId match OR photoId match in pool.
  4. Re-renders via existing `_peRenderObsContent`.

Model has no `offChange` API. The `_peDeficId` null-check effectively unsubscribes.

**Caveat:** every code path that mutates a defic's photos must call `Model._notify('photo', { deficId, ... })`. P24 fixed `_showGalleryPicker` which had bypassed this since S114.

---

### R2 cleanup on drawing replace/delete (S120 P25 / C4)

Multi-page PDFs commonly produce N drawings sharing 1 pdfBufKey. Previously, replacing or deleting left the buffer orphaned in R2.

**New helper:** `R2.deleteDrawingAssets(projectId, drawing, allDrawings) → Promise<{ pdfBufDeleted, sharedSkipped }>`.
- Checks if any OTHER drawing in `allDrawings` references the same pdfBufKey (excludes the target itself + `_migratedAwayTo` tombstones).
- If shared → skip. If exclusive → `R2.del('{pid}/photos/pdfbufs/{key}.pdf')`.

**Wired into 4 paths in drawings.js:**
1. Drawing replace handler — snapshots old pdfBufKey before overwrite.
2. Single drawing delete (3-dot menu).
3. Bulk multi-select delete.
4. Orphan purge.

Plus `_drawingMigrate.deleteHidden` in drawingMigrate.js.

`_removeDrawingWithCleanup(drawingId)` wrapper in drawings.js encapsulates the snapshot-then-remove-then-cleanup sequence.

Tile cleanup NOT included — worker has no `/list/{pid}/tiles/{key}/` endpoint. PDFs cover ~80% of orphan storage by size.

---

### Drawing migration tool (S120 P18-21)

New: `frt/js/diag/drawingMigrate.js`. Console-driven pin migration between drawing sets.

**Workflow:**
```
_drawingMigrate.clearManualPairs()
_drawingMigrate.pairFolders('inspector 2', 'ift b10')
_drawingMigrate.preview()
_drawingMigrate.plan()
_drawingMigrate.apply()
// verify pins land correctly
_drawingMigrate.deleteHidden()   // first call: tags + 30s confirm
_drawingMigrate.deleteHidden()   // second call: actual delete
```

**Auto-matcher strategies** (priority order):
1. pdfBufKey + page
2. name + page
3. name-only
4. ordered-by-folder (last resort)

**`pairFolders(oldFragment, newFragment)`** with smart de-overlap — when both fragments match same folder, more-discriminating fragment wins (longer or substring relationship).

**`deleteHidden()` two-step** — first call tags `_migratedAwayTo` + 30s window, second call actually removes. Wired through `R2.deleteDrawingAssets` for PDF cleanup.

---

### Esc handler architecture (S120 P26 / S121 audit)

**FRT global Esc handler** in `frt/js/app.js` (capture phase, runs before markup.js):

Priority order (most-specific first):
1. Pin editor "More ▾" menu — close menu only.
2. Pin editor selection mode — exit selection only.
3. Modal stack: gp-overlay, activity-modal-overlay, ph-reassign-overlay (S121 added), pin-editor-overlay, ai-fs-overlay, ai-ps-overlay, insp-overlay, qr-overlay, leave-overlay.
4. AI Review popover.
5. Fall through → markup.js handles drawing-viewer state.

Drawing viewer is NEVER closed by Escape (S114 design).

**Hub global Esc handler** in `ARENCON_Project_Hub.html` (capture phase, S120 P26):
- Skips if photo-gallery lightbox open (its own handler below).
- Skips if QR modal open (its own handler below).
- Otherwise finds topmost visible `.modal-overlay.show` and removes the class.
- Covers: new-project-modal, delete-project-modal, edit-role-modal, edit-project-modal, profile-modal.

---

### Cloud sync silent-pull race (S120 healing observations)

When local IDB and cloud have different versions, sync engine's silent-pull overwrites local with cloud if remote `updated_at` > local. Heal scripts that mutate local get wiped on the next pull unless:
1. Healed state is pushed BEFORE the next pull races in.
2. Local `proj.modified` is bumped to a future timestamp.

**Recovery pattern that worked:**
```javascript
proj.modified = new Date(Date.now() + 86400000).toISOString();
M.setProject(proj);
await M.saveNow();
```

The `Model.setProject + saveNow` path is the same one the Load button uses. It goes through SyncEngine.push which has the right auth plumbing — bypasses direct-PostgREST attempts that might fail due to RPC schema mismatch.

**Lesson:** when mutating live data via console, always go through Model methods. They fire `_notify` AND mark dirty AND trigger save AND won't be overwritten if `modified` is bumped.


---

# Session 132 Additions (consolidated from S132 delta)

> S132 was a correction + architecture-rule session. The stale entries it
> retired have been corrected in place above (L2 Tile Grid, Edge-tile 404,
> Tile-renderer mupdf description). The confirmations and new rules below
> are recorded here as the authoritative S132 record.

## Stale "Known issues" — confirmed resolved (do NOT re-file)

- **Sync atomicity — DONE.** `sync.js` has If-Match optimistic concurrency, 412 handling, IDB-persisted `_lastSeenSnapshot` (S124 A3), empty-array clobber guard (S126 Phase C), worker-offloaded merge3 (S128 P-6), bounded retry. Not an open item.
- **Full CRDT merge — DONE** as a complete 3-way merge + conflict-resolution system: `merge.js` (775-line engine, `applyResolutions`), `app.js` wires `onConflict`/`onSilentMerge`, `dialogs.js` `showConflictModal` (real, 146 lines). Not a literal CRDT; not unfinished work.
- **L2 tile-grid seam — RESOLVED S112.** Canvas compositor (`_S99_CANVAS` default) = one fractional CSS scale per level, no sub-pixel seams. Renderer emits WebP, not JPEG — named root cause gone.
- **Edge-tile 404s — RESOLVED as a code issue.** Renderer uploads every `cols×rows` tile; manifest matches; client clamps to bounds. S99-era 404s were old drawings from an older renderer (operational re-render, not code).

## Process rule (reinforced — PERMANENT)

The "Known issues remaining" section is **not authoritative** — it accumulates stale entries. **Ground-truth every "remaining" item against the actual repo before treating it as open.** Always verify the live renderer via `/api/health` (`renderer` field) before debugging any deployed render service.

## S132 Architecture Rules (NEW — additive)

### R2 project id — canonical source (PERMANENT)

The canonical R2 project id is the **Hub `?project=` URL UUID** — used by drawings, tiles, photos, pdfbufs, the tile renderer, the worker, and the Hub Cloud Storage panel. The FRT internal `proj.id` (`proj_*`) is **NOT** an R2 key component. Standard resolution at any R2 call site:

```js
(new URLSearchParams(window.location.search).get('project')) || proj.id  // proj.id = standalone only
```

S132 fixed `markup.js` (`_saveMarkup`, `_loadMarkup`) and two `drawings.js` `deleteDrawingAssets` sites that had been wrongly using `proj.id`, splitting markup into a different R2 folder. Markup load self-heals because it reads the stored `drawing.markupR2.r2Url`, not a rebuilt path.

### Blank-project load race — guard (PERMANENT)

`SyncEngine._isBlankSnapshot()` rejects a contentless IDB syncMeta snapshot in `loadIDBSnapshot` (returns `null`). Prevents the fast path from ever setting a blank `_project` (which was persistable — `_queueSave` is not gated on boot state — before the cloud pull landed). A blank snapshot is also not adopted as the merge base. Real projects fast-path unchanged. "Blank" = no project number/name AND no drawings/contractors/general deficiencies/photos — intentionally generous.

### `_r2cleanup` safety (PERMANENT)

- `_getProjectId()` uses the canonical `?project=` UUID (was `proj.id`).
- Unrecognized R2 key shapes (`_classify` → `'other'`) return `isOrphan: false` — never flagged, never auto-deleted. `deleteOrphans()` can only ever touch positively-classified orphans (photos / pdfbufs / tiles with a confirmed-missing referent).

### Dead-code audit baseline

`no-undef` (ESLint) is clean across `frt/js` as of S132 — the `_queueRunning`-class bug (referenced-but-undeclared identifier) is not present anywhere. 20 cosmetic `no-unused-vars` remain inventoried (see `HANDOFF_SESSION_132.md` §4) for a future dedicated cleanup — not removed because several sit in protected/sensitive files and removal needs per-site side-effect verification.

### sync.js no longer imports merge3 directly

`sync.js` does **not** `import { merge3 }` — since S128 P-6 the merge runs in the sync worker via `SyncWorkerHost.merge3Worker`. The engine still lives in `data/merge.js`; only `syncWorkerHost.js` / the worker import it.

## State snapshot (end of S132)

HEAD `74baf8c0b1` · SW `arencon-frt-v391` · CSS `?v=297` (unchanged since pre-S132). Tests: 95 passed / 2 skipped.

---

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

# Session 137-POLISH Additions — Deficiencies tab layout polish (LATEST — authoritative)

> Head `2f888b0`. SW `arencon-frt-v413` / CSS `frt.css?v=313`. JS schema
> untouched — unit suite 144/144 passed. This is the newest session;
> where it conflicts with anything above, IT WINS.

### Deficiencies tab — layout (supersedes the S137 entry)

- **Card order is Trade Board → Deficiency Log → Deficiency List.** Rationale: the Deficiency Log's per-contractor rows ARE the Trade Board roster; roster precedes the scoreboard. **Do not reorder back.**
- Card headers are **"Trade Board"** and **"Deficiency List"** — the long "· Contractors on Site" and "Deficiencies Identified" names are retired.
- **`#defic-toolbar` no longer exists.** AI Group / Select / Fold All are gone (S135 retired the features; S137-POLISH removed their orphan markup). **Renumber lives in `.defic-control-bar`** (far right, after the view toggle), `id="defic-renumber-btn"` preserved so its document-delegate handler still binds. Renumber→PDF-export-toggle merge is still the **S139** plan (not pulled forward).

### Card rendering — single-obs == multi-obs (NEW INVARIANT — PERMANENT)

- `_buildPinGroupCard` renders **every** pin through the multi-obs layout. `renderPinStrip` is hardwired `true`. The S122 single-obs compact layout (no strip, inline pin circle, right-pushed drawing pill, no Observation sub-card/thread) is **removed**. Single-obs and multi-obs, active and closed, are now visually identical.
- The drawing pill is carried by `.defic-pin-strip` for ALL pins → **left-aligned everywhere**. There is no longer a right-aligned drawing-pill path; `.lbl-row-spacer` is no longer emitted in the obs label row.
- Per-obs **Thread / +Response / +Comment** renders for all pins.
- Pin-footer threaded-activity filter no longer special-cases single-obs; the `multiObsPin` variable is deleted. `multiObs` (per-obs scope, ~L517) remains and is unchanged — do not confuse the two.
- **Single-obs pins still hide Spinoff / Remove-obs** (deliberate, non-destructive — those actions orphan a single-obs pin). The footer ⋯ menu "Remove pin" is the deletion path. Do NOT "complete parity" here.
- S122's no-double-circle intent is consciously traded away: a single-obs pin shows the pin number in the strip AND on its lone observation. Mark accepted this explicitly in favor of consistency. Do not "fix" it.

### Closed/addressed card styling (supersedes S133 dark-mode addressed bg)

- `.defic-obs-card.addressed` stripe is **`box-shadow: inset 3px 0 0`** (NOT `border-left`). A border that toggles with state changes box geometry between states → width mismatch + text shift on re-render. Never reintroduce a layout-occupying border for state. Dark-mode stripe `#4a8a6a` / light `#5F8068`. Background `rgba(26,122,74,.05)` light / `rgba(26,122,74,.10)` dark.

### Control bar

- `select.dfx-filter-input` widths are pinned (168px; `#dfx-pri` 130px; ellipsis) so the wrapping flex control bar has constant height across re-renders. Keep pinned — do not let selects auto-size to option text.

### De-box principle (CODIFIED — PERMANENT)

- Grouping uses a **banner/band, not a container box**, unless the element is an atomic editable object. In the Deficiencies tab only TWO real boxes exist: the section card and the pin card. `.dfx-trade-banner` / `.dfx-ctr-banner` are flat bands (`border-radius:4px`, no box-top radius); `.dfx-pingrp` has no fill/border. Apply this pattern to all future grouped lists.

---

# CURRENT-TRUTH — Supersedes Index (read this when in doubt)

Single authoritative pointer for every item that changed across
S132–S143. Later session always wins.

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
| PDF recommendations | **Pooled, forced new page AFTER Previously Closed** (`_flowBlock`, `_recsMode` bottom/only/exclude) (S142) | S139 in-trade `.rh` sub-band + `.th-band.sgr` "Site General · Recs" band — removed |
| PDF trade derivation | `pdf.js _pinTrade` = `Model.derivePinTrade(d, parentCtr)` → `obs[0].trade` → ctr's SOLE trade → `''`; parent = ctr holding the pin (S142) | per-obs `r.ctr` override grouping |
| PDF "Report Key" | **"Report Legend"** — 2-col `.rep-key-grid`, no Trade row, no IAR row, reworded gloss; inspector row only when initials (S143 + fix2) | "Report Key" + Trade row + (never-existed) title-page `.legend*` |
| PDF Deficiency Summary | IAR column **removed** (S143 fix2); cols = Summary / Total / New / Outstanding / Closed | S119 table with pink `#FF69B4` IAR column |
| Inspector attribution | **BUILT S143** — per-obs `obs.createdBy`; `.obs-insp-chip` keyed `--ic` (deterministic hash into `CONTRACTOR_COLOR_PALETTE`, NOT `profiles.inspector_color`); control-bar `#dfx-insp-toggle` (default ON, NOT a Layers menu); **PDF 2 modes Off/Initials** | S81–S82 colored-card-border + "modes A/B/C" + `profiles.inspector_color` — LOST/RETIRED |
| IAR feature | Fully retired (UI gone S135) **+ S143 actively clears legacy `iar:true`→false on load** (idempotent, console-only); PDF IAR column removed | all IAR UI/handlers/`toggleIAR`; lingering `iar:true` JSON |
| `+ deficiency` unified modal + `defic.isRecommendation` | ✅ SHIPPED S138 (`d042b40`) | — |
| Renumber→PDF-export merge | ✅ SHIPPED S139 (`9f300a7b`) — control-bar button removed, modal amber toggle (default ON) | — |
| Inline contractor reassign | **`.ctr-banner` `<select>` in Detailed list** → `Model.reassignDeficiency` (S142) | (new) |
| Table/Board click target | **`_openPinFocus` focused single-pin overlay** (`#pinfocus-overlay`, reuses `buildDeficCard`) (S142) | S137 `_dfxGotoPin` jump-to-Detailed (handler inert) |
| Inline modal text scaling | Inline-styled modals follow app S/L via `calc(Npx + var(--ts))` (S142); PDF body locked 11pt | fixed-px inline modal text |
| Tap-contractor-name-to-focus | Deferred to **S145/Phase 6** — no collapse-all in interim | S134/S135 "replaces Fold All" framing |
| Undo/Redo + 3-button leave dialog | Phase 4 (still deferred); leave dialog stays until Undo ships | S134 "leave dialog replaced" framing |
| Detailed-view banners | Flat bands `border-radius:4px`; `.dfx-pingrp` no fill/border (Model 2 adds `.other`/`.recs`/`.records` variants on the same flat-band system) | S134/S137 box-top `6px 6px 0 0` + `.dfx-pingrp` fill+border |
| Card layout | Single-obs == multi-obs (`renderPinStrip=true`), drawing pill left-aligned for ALL pins | S122 single-obs compact layout |
| Addressed stripe | `box-shadow: inset 3px 0 0` (paint-only) | `border-left:3px` (layout-occupying) |
| High board column color | Muted `#A85959` | S134 `#C0392B` (forbidden bright) |
| AI obs-grouping / Summary tab / Site General tab / Bulk Select / Fold All / per-obs AI Review | Retired (S135 Phase 0) | S130/S133 feature set |

---

# Deferred / Carry-Forward Work (open, not superseded)

> **Provenance note (flagged, not invented):** The S132–S137-POLISH merge
> chain did not include S131, and the canonical base does not carry the
> item below. It is preserved here from the repo's
> `PROJECT_KNOWLEDGE_S131_DELTA.md` + the S137-POLISH handoff carry-forward
> list so the thread is not lost on delta retirement. Mark: confirm scope.

- **FRT v2 — viewport-windowed level-canvas architecture** for crisp L4
  zoom without OOM crashes. Deferred from S131/S132. Open.
- **FRT v2 — blank-project load race in `sync.js`** (cloud-pull completing
  after the IDB snapshot restore). The S132 `_isBlankSnapshot` guard
  mitigates the persist-blank path; the broader load-ordering race is
  still open. (See Session 132 Additions for the shipped guard.)
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
  legacy-IAR clear (S143, `9c9b3115`). **Still open:** S139 QA checklist
  (Mark runs independently); Undo/Redo Phase 4; tap-contractor /
  Phase 6 (S145); Closed Items Summary still listing rec rows (confirm
  acceptable); canvas inspector pin-ring (S82 "outer ring" — future
  separate piece, touches protected `pinsGL.js`/`pins.js`); future
  `profiles.inspector_color` opt-in colours.

---

# APPENDIX — Pre-S133 Carried Visual Rules (from `STYLE_GUIDE_v127_S126_NOTE.css`)

> **Scope note (decision recorded for Mark):** The merge instructions scope
> the consolidated Style Guide to S133→S137-POLISH ("no full base exists —
> these deltas ARE the record"). The full pre-S133 Style Guide (≤v126) is
> NOT in the project and cannot be reconstructed. The ONLY surviving
> pre-S133 fragment is `STYLE_GUIDE_v127_S126_NOTE.css` (an S126 delta-note,
> not a base). Because Mark's workflow deletes old files, its substantive
> markup-tool visual rules — which exist nowhere else — are carried here so
> they are not lost when that note is retired. **This is NOT a complete
> pre-S133 base; it is the S126 delta-note's content only.** Mark can
> override this call.

Carried rules (S126 markup-tool visual surface — faithful summary; full
selectors live in the consolidated Style Guide appendix):

- **§S126-1 Click-to-draw preview dot:** first click of a click-to-draw shape shows a filled dot at point A in current color + opacity on the overlay canvas. Radius = `max(2, _lineWidth / 2)`.
- **§S126-2 Dimension sub-toolbar (`.dim-sub-toolbar`):** floating panel top-center of `.dv-canvas-area` when dimension tool active; `position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:9000`; light bg `rgba(255,255,255,0.96)`, border `#C8C0B0`, radius 8px, shadow; Calibri 13px. `.dim-tb-btn` 6px 12px transparent. Light + dark palette.
- **§S126-3 Dimension override pill (Option D):** the chosen dimension-label override rendering pattern (Option D was selected over A/B/C).
- **§S126-4 Dimension chain preview:** live preview rendering during multi-segment dimension chains.
- **§S126-5 Text box transparent default + edit chrome:** text markup boxes default transparent; edit-mode chrome distinct from committed state.
- **§S126-6 Text decoration — border + hatch:** text objects support optional border and hatch fills (the `.ctx-text-toggle` Border/Hatch toggles — KEPT per S135 correction, NOT IAR-related).
- **§S126-7 / §S126-8:** Phase B / Phase C notes — no visual changes.
- **§S126-9 Phase D — diagnostic console output format:** standardized diagnostic console output formatting (non-visual).
- **§S126-10 Push 7 — muted-color palette enforced:** Calibri + muted-burgundy palette mandatory; burgundy `#9C2742` is the ONLY saturated color allowed, reserved for primary CTAs. (This rule is reinforced/duplicated by later sessions and the permanent rules — kept here for provenance.)
- **§S126-11 Push 7 — recorded design rules (no visual surface).**

The full verbatim CSS for the above lives in the consolidated Style Guide's
matching appendix section so no rule is lost on delta retirement.

---

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

*Consolidation complete. From the S143 canon pass this is the single
canonical `ARENCON_Project_Knowledge.md`. The S132–S137-POLISH delta
files AND the S138/S140/S142/S143 delta `.md` files are now absorbed and
disposable. Future per-session deltas are folded in each session so
deleting them remains safe.*
