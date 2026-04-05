# HANDOFF — Session 59
**Date:** April 5, 2026
**FRT Lines:** ~17,470
**Hub Lines:** ~5,225
**Last GitHub SHA (FRT):** `4034dfd47a79`
**Last GitHub SHA (Hub):** `edebc66e903e`

---

## Session Focus
FRT bug fixes (photo persistence, deficiency lifecycle tabs, deleted photos), Hub AI Usage & Invoicing panel, photo assign root cause fix.

---

## DELIVERED — Hub: AI Usage & Invoicing Panel

### Supabase Table
- **`ai_invoice_marks`** — tracks per-project per-period invoicing status (project_number + period_start = unique)
- SQL file provided (`ai_invoice_marks.sql`) — Mark needs to run in Supabase SQL Editor

### Hub Changes
- **📊 AI Usage** button in header + mobile menu (visible to admins + inspectors)
- **Period navigation** — prev/next billing cycle based on billing day (saved to `app_settings`)
- **PM filter** — admins see all + per-PM, non-admins see own projects only
- **Summary cards** — total cost, reviews, invoiced count, pending count
- **Project table** — project #, name, PM, tools, cost, invoice status badge
- **Mark as Invoiced** — per-project or "Mark All" for current view
- **CSV export** — filtered by PM with invoiced status column
- **Query builder** — added `gte`, `lte`, `lt`, `inFilter` operators to Supabase client

---

## DELIVERED — FRT Bug Fixes

### 1. Photo R2 URL Priority (Bug #1)
- `_deficPhotoSrc()` — prefers `dataUrl` starting with `data:` over `r2Url`
- `_buildUnifiedPhotoList()` — same priority for site photos
- IDB fallback in `_loadR2OrDirect` — when R2 returns 404, searches project data for matching r2Url, loads blob from IDB `sitePhotos` or `photos` store (follows `_galleryRef`)
- IDB fallback in `_lbShowCurrentDirect` — lightbox loads blob from IDB when R2 fails
- IDB fallback in `_prefetchR2PhotosForPDF` — PDF report loads from IDB when R2 404s
- `_r2FailedUrls` cache now tries IDB fallback instead of giving up
- Observation photos switched from `img src=` to `data-src=` for lazy loading with IDB fallback
- After IDB fallback success, updates `data-orig-src` and `data-src` for lightbox

### 2. Active Tab / Site General Separation (Bug #3)
- `renderDeficGroups()` — removed generalDeficiencies from Active tab
- `renderGeneralDeficView()` — shows ALL generalDeficiencies (removed `_deficIsOpen` filter)
- `renderClosedDeficView()` — excludes generalDeficiencies (`contractorId!==null` filter)
- `_updateDeficLifecycleCounts()` — separate counting: `contractorId===null` → general tab, open contractors → active, closed contractors → closed

### 3. Photo Deletion Cleanup (Bug #5)
- Bulk + single deletion now deletes from IDB `sitePhotos` blob store (`ADB.delete`)
- Deletion now calls `_folderQuickSave()` for immediate cloud push

### 4. "FRT #?" in Re-open Activity Log
- Migration runs every render (removed `_frtQFixed` one-time guard)
- Uses `closedOnInstance || notedOnInstance || 1` (not just `notedOnInstance`)
- `reopenDeficiency` chains `closedOnInstance || notedOnInstance || inst || 1`

### 5. R2 URL Collection for PDF
- `_collectR2Urls` now collects from `observations[].photos` and `activity[].photos` (was missing — only had legacy `entries`/`responses`)

### 6. Dark Mode Photo Zones
- All `.photo-zone` and `.photo-zone-compact` dark mode backgrounds unified to `#0f1318`

### 7. AI Usage Button Visibility
- Desktop: shown via `_isAdmin()` check in `enterProject()`
- Mobile: `admin-only` class on mobile menu button

### 8. Gallery Photo Dedup
- `_seenIds` tracks site photo IDs globally
- Deficiency photos with same ID as site photos are deduped in unified list
- `_galleryRef` dedup reverted (was too aggressive — hid legitimate pin photos)

---

## ROOT CAUSE FIX — Photo Assign to Pin

### Problem
`_galleryDoAssign` and `_lbDoAssign` created deficiency photo records by copying URLs from source photos. No independent R2 upload, no IDB blob copy. After cloud sync stripped `dataUrl`, the photo had only a borrowed R2 URL that could break.

### Fix: `_createDeficPhotoFromSource()`
New shared function used by both gallery assign and lightbox assign:
1. **Finds blob** — searches IDB `sitePhotos` + `photos` stores (follows `_galleryRef`)
2. **Saves to IDB** — `ADB.put('photos', {id: newId, projectId, dataBlob})` — permanent local copy
3. **Uploads to R2** — `photos/{folder}/frt/original/{newId}.jpg` — own key, not borrowed
4. **Sets r2Key/r2Url/r2Status** — survives cloud sync (dataUrl stripping is safe)
5. **Fallback** — if R2 fails: saves dataUrl locally. If no blob: URL reference with warning

### Architecture Rule (NEW)
**Every deficiency photo MUST have its own R2 file.** Never borrow another photo's R2 URL. `_createDeficPhotoFromSource()` enforces this.

---

## AI Modules Restored
Session 58's AI Writing Assistant (AIAssist) and AI Usage Dashboard (AIUsage) were accidentally removed when pushing from a stale project file. Recovered from git history (`46aa0aa2fe4b`) and merged back:
- AI CSS (71 lines)
- AI header buttons (✨ AI Review dropdown + 📊 Usage)
- AI mobile menu buttons
- AI JS modules (665 lines — AIAssist + AIUsage IIFEs)

---

## KNOWN ISSUES — Next Session

### Priority 1: AI Worker Usage Logging
- `ai_usage_log` table has 0 records despite AI reviews being run
- Worker's non-blocking POST to Supabase is failing silently
- Check `SUPABASE_SERVICE_KEY` secret in Cloudflare Worker `arencon-ai-worker`
- Verify RLS policies allow service_role inserts

### Priority 2: Quick Contractor Reassign in Site General Tab
- Mark wants a contractor dropdown directly on deficiency cards in Site General tab
- Currently requires ⋯ menu → Move → select contractor
- Add inline dropdown for faster reassignment

### Priority 3: Photo Gallery Co-Selection
- Site photo and deficiency photo with same source can both appear in gallery
- Selecting one highlights both (same or similar ID)
- Cosmetic issue — doesn't cause data loss after root fix

### Priority 4: Hub vs FRT Photo Gallery Inconsistency
- Hub Project Photos panel reads from R2 storage listing
- FRT Photo Gallery reads from in-memory project data (sitePhotos + deficiency photos)
- These can be out of sync — e.g., Pin 7's photo uploaded to R2 via console doesn't appear in Hub until next R2 scan
- Need to reconcile: Hub should either pull from same unified source as FRT, or re-scan R2 after FRT sync

### Priority 5: Mobile PDF Report Issues (from Session 58)
- Text formatting, missing mini-maps, incomplete drawing appendixes on mobile
- Not addressed this session

---

## CRITICAL LESSON LEARNED

**Always compare uploaded project file against GitHub before editing.**
Session 59 lost AI modules because the project file (16,536 lines) was older than the GitHub version (17,293 lines). The push overwrote newer code. **New rule: check line count + grep for critical modules before first push.**

---

## FILES MODIFIED

| File | Changes |
|------|---------|
| `ARENCON_Project_Hub.html` | AI Usage panel, Supabase query builder operators, view switching |
| `ARENCON_Field_Review_Tool.html` | 15+ surgical fixes, root cause photo assign rewrite, AI module restoration |
| `ai_invoice_marks.sql` | NEW — Supabase table for invoicing workflow |
