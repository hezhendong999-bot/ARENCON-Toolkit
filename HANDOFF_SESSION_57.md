# HANDOFF — Session 57
**Date:** April 4, 2026  
**File:** `ARENCON_Field_Review_Tool.html` (16,132 lines — down from 16,537)  
**Last GitHub SHA:** `d01f40e5d03b843eab389231528e1db3a8e585cf`

---

## Session Focus
Drawing viewer performance, markup persistence, photo management, deficiency lifecycle, code cleanup.

---

## CRITICAL FIXES (Data Loss Prevention)

### 1. Markup Objects Now Persist Across Reloads
**Root cause:** IDB `drawings` blob store never saved `markupObjects`. On every page load, `loadFullProject` loaded drawings from blob store (without markupObjects) and overwrote project meta's drawings (which had them).

**Fixes:**
- `ADB.saveFullProject` — IDB drawings store now includes `markupObjects`
- `ADB.saveDrawing` — single-drawing save also preserves `markupObjects`
- `ADB.loadFullProject` — merges `markupObjects` from project meta into resolved drawings as safety net
- Existing IDB merge path preserves `markupObjects` from existing records

### 2. Markup Objects Now Sync to Cloud
**Root cause:** `_collectFullState()` ran `delete d.markupObjects` on every cloud push.

**Fix:** Removed the delete. Markup (small JSON stroke coords) now syncs to Supabase. Fallback strip in `_cloudSave` only fires on genuine 500 errors.

### 3. Markup Saved on Viewer Close
**Root cause:** `closeDrawingViewer()` never saved markup. `saveToLS()` debounced at 600ms.

**Fix:** `closeDrawingViewer()` copies `_mkObjects` to `dwg.markupObjects`, flushes IDB immediately, triggers cloud save. `prevDrawing()`/`nextDrawing()` also save before switching.

### 4. Site Photos No Longer Disappear on Reload
**Root cause:** Cloud merge replaced `localProj.sitePhotos` with ONLY what existed in Supabase. Local-only photos dropped. Next save deleted them from IDB too.

**Fix:** Both init merge and heartbeat merge now append local-only sitePhotos (IDs not in cloud set) to the merged array.

---

## DRAWING VIEWER CHANGES

### PDF Pre-Render at Upload
- `_runPdfPages` / `_runPdfPagesToFolder`: render full-res JPEG (up to 4096px, quality 0.85) at upload
- JPEG blob stored in IDB as `dataBlob`, `pdfTiled:false`
- Viewer uses fast `<img>` path — no pdf.js, no tile rendering
- Background migration: `_migratePdfToImage()` converts existing `pdfTiled:true` on project enter
- Pre-cache simplified to PDF migration only (snapshot generation removed)

### Snapshot System Fully Removed
- `_saveDrawingSnapshot`, `_loadDrawingSnapshot`, `_genSnapshotFromSrc`, `_genSnapshotFromBlob` — all deleted
- Snapshot preservation in `saveDrawing`/`saveFullProject` — removed
- Snapshot generation in image upload handlers — removed
- Pre-cache snapshot branches — removed (only PDF migration remains)

### Flash Prevention
- `initPanZoom()` clones DOM (required for iPhone), hides `dv-img-wrap` with `opacity:0`
- `fitDrawing()` reveals wrap inside rAF after `applyTransform()`
- Old image stays visible during switch

### Performance Deferrals
- `img.onload`: only `fitDrawing()` synchronous; pins/tasks/canvas deferred via rAF chain
- `resizeMarkupCanvas()` deferred 500ms
- Overlay canvas cap: 3M pixels
- Pre-cache pauses when viewer open

### initPanZoom — MUST Clone
No-clone crashed iPhone Safari. Clone is required. First-zoom GPU lag on Samsung accepted — fix via AbortController is future work.

### UI Changes
- Drawing title fills header on tablet portrait (flex:1, no max-width)
- Undo/redo always visible in toolbar

---

## DEFICIENCY LIFECYCLE

### Site General Tab
Three tabs: **Active** | **Site General** | **Closed**. `renderGeneralDeficView()` function. Count via `_updateDeficLifecycleCounts()`.

### Closed Tab Fixed
Changed filter from `_deficIsClosed(d.defic)` to `!_deficIsOpen(d.defic)` — matches counter logic.

### Reopen "FRT #?" Fixed
Captured `prevClosedInst` before nulling `closedOnInstance`. One-time data migration replaces existing "FRT #?" entries.

---

## PHOTO MANAGEMENT

### Observation Photos Fixed
- `processEntryPhotos` writes to `observations[ei].photos` (primary) + `entries[ei].photos` (compat)
- Renderer prefers observations, falls back to entries
- `_syncDeficPhotos` gathers from both arrays
- Thumbnails use `src` directly (not `data-src` lazy loading)
- Content key includes photo counts per observation

### Gallery Picker ("+ Gallery" button)
- On each observation photo zone (`.pz-gallery` CSS class)
- Opens full-screen picker with ALL photos from unified `getPhotoList()`
- `_gpPhotoList` stores session list; `_gpAttach` creates records with `_galleryRef`
- Photos already attached show "Added" badge

### Assign to Pin
- **Lightbox:** "Assign to Pin" button — `_lbAssignToPin()` / `_lbDoAssign()`
- **Gallery Actions:** "Assign to Pin" — `galleryAssignToPin()` / `_galleryDoAssign()`
- Both show "Site Photo (no pin)" option at top
- All assign functions search unified photo list, store displayable src in both `dataUrl` and `r2Url`

---

## CODE CLEANUP

### 28 Dead Functions Removed (~15KB)
**Hub-only (6):** `openProjectQuickEdit`, `toggleStatusDropdown`, `closeCreateProjectModal`, `confirmCreateProject`, `exportStarredProjects`, `exportUnstarredProjects`

**Legacy entry/response (10):** `updateEntryContractor`, `addDeficEntry`, `removeDeficEntry`, `addDeficResponse`, `removeDeficResponse`, `updateDeficResponse`, `triggerRespPhotoUpload`, `triggerRespPhotoCamera`, `handleRespPhotoDrop`, `processRespPhotos`

**Dead misc (12):** `_downloadPublishedCopy`, `_deficAllPhotos`, `_closeRepairOnClick`, `bumpRevision`, `_getInspectorName`, `showAddActivityFormForObs`, `consultantCloseItem`, `updateSitePhotoCaption`, `fillProjectSizeIndicators`, `openPhotoPicker`, `_saveDrawingSnapshot`, `_loadDrawingSnapshot`

### Shared Modal Builder
`_aModalBase()` extracts dark/light theme colors and button styles. `_aAlert`, `_aConfirm`, `_aConfirmTwoBtn`, `_aPrompt` all use it. 85+ call sites unchanged.

### getAllDeficiencies Cache
Was called 26x per render cycle. Now caches with structural key. Invalidated on `saveToLS()`.

### Net Result
16,537 to 16,132 lines (405 lines / ~20KB removed)

---

## NEW ARCHITECTURE RULES (321–342)

321. PDF pre-render at upload — `pdfTiled:false` for new uploads
322. Pre-cache pauses when viewer open — `dvState.currentDrawingId` check
323. Overlay canvas 3M pixels — Samsung Tab A sweet spot
324. initPanZoom MUST clone — no-clone crashes iPhone Safari
325. img.onload deferred work — only fitDrawing synchronous
326. IDB drawings store MUST save markupObjects
327. loadFullProject merges markupObjects from meta
328. `_collectFullState()` MUST keep markupObjects
329. Markup saved on viewer close — immediate IDB flush
330. Cloud merge preserves local-only sitePhotos
331. Observation photos write to observations (not entries)
332. Observation photo thumbnails use `src` directly
333. Deficiency content key includes photo counts
334. Gallery picker uses unified photo list
335-336. Photo assign from lightbox + gallery Actions
337. `.pz-gallery` CSS class for Gallery button
338. Site General tab between Active/Closed
339. Closed tab uses `!_deficIsOpen`
340. Reopen captures closedOnInstance before nulling
341. Undo/redo always visible in toolbar
342. Drawing title fills header on tablet portrait

---

## PENDING / NEXT SESSION

1. **First-zoom lag (Samsung)** — refactor initPanZoom to use AbortController instead of DOM cloning
2. **Markup cross-device sync verification** — draw on tablet, verify appears on PC
3. **Updated Project Knowledge** — v112 delivered, needs upload to Claude Project
4. **Updated Style Guide** — v112 delivered, needs upload to Claude Project
5. **CloudSync merge bug** — deficiency photo metadata wiped during cloud-to-local merges (pre-existing)
6. **Highlight opacity** — `0.3 x opacity` multiplier produces imperceptible visual changes (pre-existing)
