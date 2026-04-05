# HANDOFF — Session 61
**Date:** April 5, 2026
**FRT Lines:** ~17,635
**Last GitHub SHA (FRT):** `3ddcdd162d04` → `77297fe8552b` (clean) → final `3ddcdd162d04`
**Hub Lines:** ~5,225 (unchanged)

---

## CRITICAL FINDING — FRT Needs Full Rewrite

Session 61 exposed fundamental architecture problems that cannot be fixed with surgical patches. Every fix in this session caused a cascade of new issues. The core problems:

### 1. No Data Binding
The DOM and data model are completely disconnected. When AI rewrites observation text, it updates the textarea DOM but never writes back to the data model. Any re-render overwrites the textarea with the stale data value. This affects every editable field.

### 2. IDB Store Dependency
The entire photo/drawing pipeline assumes IDB stores exist. On any device that opens a project in a fresh browser session, the IDB database initializes at version 1 with zero stores. Every operation — photo attach, drawing view, PDF export — fails silently because `ADB.get()` throws `NotFoundError`. The current code has no mechanism to create stores on a fresh DB.

### 3. R2 Filename Mismatch (Persistent)
Site photos and deficiency photos are uploaded to R2 with filenames generated at upload time, but the project data stores different filenames. The `_repairR2Links` function attempts to match by prefix and timestamp, but this is heuristic and fragile. Photos are routinely lost or show as blank thumbnails.

### 4. Cloud Merge Overwrites Local Data
The heartbeat pulls cloud state every 60 seconds. Cloud "owns structure" — any local-only changes (newly attached photos, AI-rewritten text) that haven't been saved to cloud get overwritten on the next heartbeat. The 20-second grace period is insufficient for operations that take longer (R2 uploads, AI API calls).

### 5. Auth Token Expiry Breaks R2 Uploads Silently
R2 PUT operations require a valid Supabase auth token. When the token expires, uploads return 401 and fall back to "local only" — but on a device with no IDB stores, "local only" means the data is lost on refresh. There's no token refresh mechanism or user-facing notification.

### 6. Render/Save Race Conditions
Tab switches trigger full re-renders from the data model. If a photo was attached but the R2 upload hasn't completed (or failed with 401), the re-render reads the data model which may not have the photo record yet (it's added in the upload callback). The photo disappears visually.

---

## DELIVERED — Session 61

### 1. PDF Drawing/Mini-Map Fix (Two bugs)
**Bug A:** `ADB.get('drawings', id).then(...)` — when IDB has no 'drawings' store, the rejection was caught by the OUTER `.catch()`, preventing the R2 fallback from running. Fixed by adding `.catch(function(){return null;})` immediately after `ADB.get()`, before `.then()`. Now falls through to R2 fetch.

**Bug B:** `<img src="" onerror="this.style.display='none'">` — appendix and mini-map images started with empty src, which immediately triggered onerror and hid the images BEFORE the canvas render could set the real src. Fixed by using a 1×1 transparent GIF data URL as placeholder.

### 2. R2Key Reconstruction from r2Url
Enhanced `_fixR2Rec` (load-time rebuild) to handle Case 2: records with `r2Url` but no `r2Key`. Extracts filename from URL and constructs proper r2Key using current `_csR2Folder`.

### 3. Ghost SitePhoto Cleanup
Sync cleanup after r2Key rebuild: removes sitePhotos with no r2Key AND no dataUrl (truly unrecoverable). Also deduplicates records with identical r2Keys.

### 4. `_repairSitePhotoR2` Auto Re-Upload
New function that runs after `_repairR2Links`:
- Lists actual R2 files for the project
- Finds sitePhotos whose filenames don't match any R2 file
- Loads blob from IDB (tries sitePhotos store, photos store)
- Uploads to R2 with new correct filename
- Updates r2Key/r2Url/r2Status
- NEVER deletes records

### 5. Photo Assign R2 Fallback
`_createDeficPhotoFromSource()` now fetches blob from R2 URL when IDB blob lookup fails (PC with no IDB stores). Also gracefully handles `ADB.put()` failure when photos store doesn't exist.

### 6. Site Photo Recovery (Console Script)
Recovered 5 orphaned R2 files as sitePhoto records for project 7155.51. Cleaned 2 ghost records. Cloud synced to 5 clean records.

---

## REVERTED — Session 61

### Async 404 Validation (DESTRUCTIVE — removed)
Added then immediately reverted an async validation that checked each sitePhoto's R2 URL with HEAD requests and removed records returning 404. This was too aggressive — it deleted legitimate photos whose R2 filenames didn't match the stored r2Url, and pushed the stripped data to Supabase. The records were recovered via console script.

**Lesson:** NEVER auto-delete photo records based on R2 availability. Photos may exist on other devices' IDB. Only add/fix — never remove.

---

## KNOWN BUGS — For Rewrite

### P1: Auth Token Expiry
- R2 uploads fail with 401 when Supabase token expires
- No auto-refresh, no user notification
- Photos silently lost on devices with no IDB

### P2: AI Text Not Saved to Data Model
- AI rewrites update textarea DOM only
- Data model retains original text
- Any re-render (tab switch, heartbeat) reverts the text
- Root cause: no two-way data binding

### P3: Photo Thumbnails Missing After Attach
- Photos ARE in data model (confirmed by diagnostic)
- Thumbnail img elements not updated after gallery attach
- Missing re-render call in `_gpAttach` / `_galleryDoAssign` callback chain

### P4: IDB Version 1 / No Stores
- Fresh browser sessions create DB version 1 with empty stores
- Every ADB operation fails with NotFoundError
- Workaround: `indexedDB.deleteDatabase('ARENCON_FRT_DB')` + refresh
- Rewrite must handle DB migration / store creation properly

### P5: Heartbeat Overwrites Unsaved Changes
- 60-second heartbeat pulls cloud state
- Overwrites local changes that haven't been cloud-saved
- Affects: photo attachments in progress, AI text rewrites, any edit during slow operations

### P6: Duplicate Drawings in R2
- Project 7155.51 has 27 drawings in R2 (3 copies of 9 pages)
- Each re-upload creates a new set with different filenames
- No dedup or version tracking for drawings

### P7: Samsung GPU Lag (Carry-Forward)
- AbortController refactor for initPanZoom DOM clone
- Carried forward since Session 57

---

## REWRITE MANDATE

Mark has demanded a full rewrite. The current FRT (17,635 lines, single file) has accumulated too many interacting bugs to patch reliably. Every fix causes cascading failures in other areas.

**Rewrite priorities (from this session's findings):**
1. Proper state management — single source of truth, reactive rendering
2. IDB abstraction — graceful degradation, automatic store creation, migration
3. R2 as primary storage — no filename mismatch possible (use content-hash or UUID filenames)
4. Auth token management — auto-refresh before expiry
5. Offline-first with conflict resolution — not "cloud overwrites local"
6. Modular file structure — not 17K lines in one file

**Rewrite roadmap exists:** `FRT_REWRITE_ROADMAP.md` and `FRT_REWRITE_BUSINESS_CASE.md` in the project.

---

## FILES MODIFIED

| File | Changes |
|------|---------|
| `ARENCON_Field_Review_Tool.html` | PDF drawing R2 fallback, img placeholder fix, R2Key reconstruction, ghost cleanup, _repairSitePhotoR2, photo assign R2 fallback |
