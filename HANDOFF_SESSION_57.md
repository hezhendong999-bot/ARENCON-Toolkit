# HANDOFF — Session 57
**Date:** April 4, 2026  
**File:** `ARENCON_Field_Review_Tool.html` (16,537 lines)  
**Last GitHub SHA:** `b77ae3afa266ac302b09d78a0099cef94db9a712`

---

## Session Focus
Drawing viewer performance, markup persistence, photo management, deficiency lifecycle fixes.

---

## CRITICAL FIXES (Data Loss Prevention)

### 1. Markup Objects Now Persist Across Reloads
**Root cause found:** IDB has two stores for drawings — `projects` meta (saved `markupObjects` ✓) and `drawings` blob store (did NOT save `markupObjects` ✗). On every page load, `loadFullProject` loaded drawings from the blob store (without markupObjects) and **overwrote** the project meta's drawings. Every reload wiped markupObjects.

**Three fixes applied:**
- `ADB.saveFullProject` — IDB drawings store now includes `markupObjects`
- `ADB.saveDrawing` — single-drawing save also preserves `markupObjects`
- `ADB.loadFullProject` — after loading from IDB drawings store, merges `markupObjects` from project meta as safety net

### 2. Markup Objects Now Sync to Cloud
**Root cause:** `_collectFullState()` ran `delete d.markupObjects` on every cloud push (line 14813). Markups only existed in local IDB — never reached Supabase. Cloud merge then overwrote local with empty cloud data.

**Fix:** Removed the `delete d.markupObjects` line. Markup data (small JSON stroke coordinates) now syncs to Supabase. Fallback strip in `_cloudSave` only fires on genuine 500 errors (payload too large).

### 3. Markup Saved on Viewer Close
**Root cause:** `closeDrawingViewer()` never saved markup. `saveToLS()` debounced at 600ms — if app closed within that window, markup lost.

**Fix:** `closeDrawingViewer()` now:
- Copies `_mkObjects` to `dwg.markupObjects` immediately
- Flushes IDB immediately (clears debounce timer)
- Triggers `_debouncedCloudSave()`
- `prevDrawing()`/`nextDrawing()` also save before switching

### 4. Site Photos No Longer Disappear on Reload
**Root cause:** Cloud merge for sitePhotos replaced `localProj.sitePhotos` with ONLY what existed in Supabase. Local-only photos (newly added, not yet synced) were dropped. Next `saveFullProject` then deleted them from IDB too.

**Fix:** Both init merge and heartbeat merge now preserve local-only sitePhotos. After mapping cloud sitePhotos, any local photos whose IDs aren't in the cloud set are appended to the merged array.

---

## DRAWING VIEWER CHANGES

### PDF Pre-Render at Upload (Eliminates pdf.js from Viewing)
- `_runPdfPages` and `_runPdfPagesToFolder` rewritten: render at full resolution (up to 4096px, JPEG quality 0.85) during upload
- JPEG blob stored in IDB `drawings` store as `dataBlob`
- Drawing set to `pdfTiled: false` — viewer uses fast `<img>` path
- Background migration: `_migratePdfToImage()` converts existing `pdfTiled:true` drawings on project enter
- Pre-cache pauses when drawing viewer is open (`dvState.currentDrawingId` check)

### Snapshot System Removed
- Built, tested, then removed — caused MORE flashing (old→snapshot→full-res = 3 visual states)
- Pre-rendered JPEGs load from IDB in ~100ms, no intermediate needed
- `_saveDrawingSnapshot`, `_loadDrawingSnapshot` code still exists but NOT called

### Flash Prevention
- `initPanZoom()` clones DOM (required for iPhone memory), hides `dv-img-wrap` with `opacity:0`
- `fitDrawing()` reveals wrap (`opacity:1`) inside rAF callback AFTER `applyTransform()`
- Old image stays visible during switch (no src clearing)

### Performance Deferrals
- `img.onload` only runs `fitDrawing()` synchronously
- Pins, tasks panel, canvas sizing deferred to `requestAnimationFrame`
- Markup events deferred to second rAF
- `resizeMarkupCanvas()` deferred 500ms (heavy allocation)
- Overlay canvas cap: 3M pixels (Samsung Tab A sweet spot)

### initPanZoom — Clone vs No-Clone
**Decision: CLONE (reverted).** No-clone eliminated first-zoom GPU lag on Samsung but crashed iPhone Safari. iPhones need DOM cleanup. First-zoom lag optimization needs AbortController approach (next session).

### Drawing Title Width (Tablet Portrait)
At `@media(max-width:800px)`:
- `flex:1` spacers collapsed
- `.dv-nav-group` becomes `flex:1`
- `.dv-title` becomes `flex:1; max-width:none`
At `@media(max-width:700px)`: removed `max-width:80px`

### Undo/Redo Always Visible
Added ↩/↪ buttons to `dv-toolbar` (between nav group and Layers), always visible regardless of active tool.

---

## DEFICIENCY LIFECYCLE FIXES

### Site General Tab Added
Three tabs: **Active** | **Site General** | **Closed**
- Site General shows only `p.generalDeficiencies`
- Count updates via `_updateDeficLifecycleCounts()`
- Renders via `renderGeneralDeficView()` using `buildDeficGroup(null,'Site General',...)`

### Closed Tab Fixed
- Was showing "No closed deficiencies yet" despite count showing 2
- Root cause: `renderClosedDeficView` used `_deficIsClosed()` (only `status==='closed'`), but tab counter used `!_deficIsOpen()` (anything not open)
- Fix: changed to `!_deficIsOpen(d.defic)` to match counter logic

### Reopen Activity Log "FRT #?" Fixed
- `reopenDeficiency()` set `closedOnInstance=null` BEFORE creating activity entry that referenced it
- Fix: capture `prevClosedInst` before nulling
- One-time data migration in `_doRenderDeficiencyPanel` scans existing activity entries and replaces "FRT #?" with correct instance number

---

## PHOTO MANAGEMENT

### Observation Photos Fix
- `processEntryPhotos` wrote to `entries[ei].photos` (legacy) but renderer checked `observations[oi].photos` (current)
- Fix: now writes to BOTH `observations[ei].photos` (primary) and `entries[ei].photos` (compat)
- Renderer prefers `observations.photos`, falls back to `entries.photos`
- `_syncDeficPhotos` gathers from both arrays
- Observation photos now use `src` directly (not `data-src` lazy loading) — eliminates broken thumbnail chain
- Deficiency content key includes photo counts — triggers re-render on photo changes

### Gallery Picker ("+ Gallery" button)
- Each observation photo zone has three buttons: Upload | Camera | **+ Gallery**
- Opens full-screen picker showing ALL photos from unified list (`getPhotoList`)
- Tap to select (green checkmark), "Attach" copies to observation
- Photos already attached show "Added" badge (greyed out)
- `_gpPhotoList` stores unified list for session; `_gpAttach` creates photo records with `_galleryRef` tracking

### Assign to Pin from Gallery
**Two entry points:**
1. **Gallery Actions → 📌 Assign to Pin** — bulk assign selected photos to a deficiency
2. **Lightbox → 📌 Assign to Pin** — assign current photo to a deficiency

Both show deficiency picker with "📷 Site Photo (no pin)" option at top.

### Photo Display Fix
- Attached photos showed empty boxes because `dataUrl` and `r2Url` weren't being copied from unified photo list correctly
- All three attach functions now store displayable source in BOTH `dataUrl` and `r2Url`

---

## ARCHITECTURE RULES (NEW)

1. **initPanZoom MUST clone** — no-clone crashes iPhone Safari. First-zoom lag is accepted tradeoff.
2. **IDB drawings store MUST save markupObjects** — prevents loss on reload
3. **`_collectFullState()` MUST keep markupObjects** on drawings — never strip from cloud sync
4. **Cloud merge MUST preserve local-only sitePhotos** — append locals not in cloud set
5. **Observation photos use `src` directly** — not `data-src` lazy loading (too few to need it, chain breaks)
6. **Deficiency content key MUST include photo counts** per observation
7. **Pre-cache pauses when viewer open** — `dvState.currentDrawingId` check in `_next()`

---

## PENDING / NEXT SESSION

### First-Zoom Lag (Samsung)
- Cloning forces GPU texture re-upload on every drawing open
- Fix: refactor `initPanZoom` to use AbortController for listener management instead of DOM cloning
- This preserves iPhone memory cleanup while avoiding GPU texture cost
- AbortController supported on Chrome 90+ (Samsung Tab A has it)

### Markup Cross-Device Sync
- `_collectFullState()` now includes markupObjects in cloud sync
- R2 markup sync (`_r2SaveMarkup`, `_r2LoadMarkup`) exists but may not be fully working
- Need to verify: draw markup on tablet → close viewer → wait for sync → open on PC → verify markup appears

### Photo-Pin Architecture
- Gallery photos (`sitePhotos`) and deficiency observation photos (`observations[].photos`) are separate arrays
- Gallery picker copies photos between them (with `_galleryRef` tracking)
- Long-term: should photos live in one place with references?

### Session 57 Handoff Document
- This document ✓

### Updated Project Knowledge
- Needs update with new architecture rules from this session
- Not done yet — carry to next session
