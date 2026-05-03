# ARENCON Fire Protection Toolkit — Project Knowledge

## About This Document
Upload to the Claude Project along with:
- ARENCON_Style_Guide_v119.css
- ARENCON_FRT_Core_Template.md (reusable architecture reference for building new tools)
- logo_base64.txt (must include "data:image/png;base64," prefix)
- TOOL_BUILD_QUEUE.md
- Current tool HTML files (stable filenames — no version numbers)
- Current session handoff document

Last updated: 2026-04-24 (Session 99 — S99 rendering-chain investigation; `?s99test=` diagnostic toggle framework shipped; `delaysrc` promoted to non-iOS default for level-transition flash; L2 tile grid accepted as known issue with 5 candidate fixes filed)

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

### L2 Tile Grid (5 candidate fixes filed)

**Root cause:** JPEG edge-quantization artifacts at 512px tile boundaries. Most visible at L2 because tiles are stretched up for display; adjacent tiles don't share compression context so edges don't blend.

**Why baseline `+1 CSS pixel` doesn't help:** That's a position-rounding fudge, doesn't address the JPEG content itself.

**Why S99 `overlap` didn't help:** See rejected fix above.

**Candidates for future evaluation (ranked by cost):**

1. **Raise L2→L3 transition threshold** (client-only, 1-line edit). Use L3 more aggressively at moderate zooms so L2 is rarely displayed. Cost: slightly more L3 tiles in memory.
2. **CSS `filter: blur(0.5px)` on tile-layer at L2 only** (client-only). Softens seams without content distortion. Cost: slight blurriness at L2.
3. **Lossless WebP for L0–L2 server render** (server change, ~1 session in `arencon-pdf-render`). Root-cause fix. Larger L0-L2 tiles (which are small anyway).
4. **Server overlap bleed** (server change + re-tile all drawings, ~2 sessions). Server renders 520×520 tiles containing natural 512+4px of neighbor content. Heaviest, cleanest.
5. **Accept the grid, document it.** May not affect inspection workflow in practice.

### Edge-tile 404 errors (NEW finding)

S99 test logs (2026-04-24 recording `r191s`) captured tile load failures at specific coordinates:
- `err 3_10_4, err 3_6_4, err 3_7_4, err 3_11_4, err 3_9_5` on drawing `dwg_1776631552442_pg2_yy4m`

Format: `level_col_row`. These are edge tiles (right/bottom of drawing) at L3. They 404 from R2. The Azure tile renderer (`arencon-pdf-render`) either failed to produce these specific tiles, or they're missing from the R2 upload. Pre-existing bug unrelated to S99.

**S100+ investigation:** Run a diagnostic script to list R2 keys under `{pid}/tiles/{drawingId}/page-2/level-3/` for the Caplink project (`6338d5af-fbb0-4e30-9a8e-65f1c7dd3efb`). Compare against expected tile grid (6144/512 = 12 cols × 8 rows at L4, etc.). If tiles genuinely missing, re-trigger tile rendering for that drawing. If present in R2 but 404 via Worker, investigate Worker path translation.

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

**Single source of truth: Azure Container App `arencon-pdf-render-v3`** running mupdf via `mutool draw` (post-S107). Source in `container-render/`. Build pipeline `.github/workflows/build-container.yml` deploys on push to `container-render/**`. ~4-5 minutes from commit to live.

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

