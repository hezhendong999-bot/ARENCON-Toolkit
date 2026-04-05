# ARENCON FRT — Full Rewrite Roadmap
**Created:** April 5, 2026  
**Goal:** Match Fieldwire smoothness, eliminate all data loss, proper architecture for growth to native app  
**Constraint:** Same look, same features, same PDF output — zero visual changes for inspectors

---

## Overview

| Phase | Focus | Sessions | Cumulative |
|-------|-------|----------|------------|
| 0 | Planning & scaffolding | 1 | 1 |
| 1 | Data layer rewrite (IDB + sync engine) | 5-6 | 7 |
| 2 | AI Writing Assistant | 2-3 | 10 |
| 3 | UI migration (split modules, same look) | 4-5 | 15 |
| 4 | Tile-based drawing viewer | 3-4 | 19 |
| 5 | WebGL markup engine | 4-5 | 24 |
| 6 | Web Worker integration | 2-3 | 27 |
| 7 | Hub + other tools compatibility | 2-3 | 30 |
| 8 | Android Capacitor app | 1-2 | 32 |
| 9 | Testing, migration, cutover | 2-3 | 35 |
| **Total** | | **27-35 sessions** | |

Current FRT stays live and functional throughout. New version developed in parallel. Cutover is one deploy — inspectors see no interruption.

---

## Phase 0 — Planning & Scaffolding (1 session)

**What we build:**
- New repo structure (or subfolder in existing repo)
- Module file layout with build-free ES modules (native `<script type="module">`)
- HTML shell that loads modules
- Shared CSS file (extracted from current FRT — same styles, same variables)
- Updated service worker to cache module files (not single HTML)
- Development workflow: edit modules → deploy to GitHub Pages → test

**File structure:**
```
ARENCON-Toolkit/
  frt/
    index.html              ← shell (200 lines)
    css/
      frt.css               ← extracted from current FRT (same styles)
    js/
      app.js                ← entry point, router, tab switching
      data/
        model.js            ← in-memory state, getProject(), getAllDeficiencies()
        idb.js              ← IndexedDB operations (normalized stores)
        sync.js             ← incremental CloudSync engine
        sync-compat.js      ← backward compat: reads/writes old tool_data format during transition
        r2.js               ← R2 photo/drawing upload/download
      ui/
        projectInfo.js      ← Project Info tab
        deficiencies.js     ← Deficiency panel, observation cards
        drawings.js         ← Drawing gallery, folders
        photos.js           ← Photo gallery, lightbox
        pins.js             ← All Deficiencies table/kanban
      viewer/
        viewer.js           ← Drawing viewer shell, pan/zoom
        tiles.js            ← Tile-based renderer
        markup.js           ← WebGL markup engine (Pixi.js)
        pins.js             ← Pin overlay, pin editor
      export/
        pdf.js              ← PDF report (copied from current FRT — zero changes)
        json.js             ← JSON import/export
      shared/
        dialogs.js          ← _aAlert, _aConfirm, _aPrompt (shared modal builder)
        toast.js            ← toast notifications
        darkmode.js         ← dark mode toggle
        auth.js             ← Supabase auth
        compress.js         ← image compression
      ai/
        assistant.js        ← AI Writing Assistant client
    worker/
      sync-worker.js        ← Web Worker for background sync/IDB
    sw.js                   ← service worker (caches all modules)
    assets/
      logo_base64.txt
      Blaimim_base64.txt
```

**No build tools.** Native ES modules (`import`/`export`) work in all modern browsers and Android TWA. No webpack, no npm, no node_modules. Edit a file, push to GitHub, Ctrl+Shift+R. Same workflow you have today.

**Service Worker update:** Current SW caches one HTML file. New SW must cache the HTML shell + all JS modules + CSS. Strategy: network-first for HTML shell (picks up new deploys), cache-first for JS/CSS (versioned via query string or hash). On deploy, bump SW version to force refresh.

---

## Phase 1 — Data Layer Rewrite (5-6 sessions)

This is the foundation. Everything else depends on it.

### Session 1-A: Normalized IDB Schema

**Current:** One `projects` store with entire project as one record. One `drawings` store with blobs. One `sitePhotos` store with blobs.

**New:** Each entity type gets its own IDB object store with individual records:

```
IDB stores:
  projects        → {id, name, number, client, address, currentFrtInstance, ...}
  contractors     → {id, projectId, name}
  deficiencies    → {id, projectId, contractorId, num, status, priority, instanceNumber, ...}
  observations    → {id, deficiencyId, text, addressed, notedOnInstance, ...}
  drawings        → {id, projectId, name, folder, width, height, pdfTiled, ...}
  drawingBlobs    → {id, dataBlob}  (separate store for heavy blobs)
  drawingTiles    → {id, drawingId, level, x, y, blob}  (for Phase 4)
  markupObjects   → {id, drawingId, objects: [...]}
  photos          → {id, projectId, entityType, entityId, r2Key, r2Url, ...}
  photoBlobs      → {id, dataBlob}  (separate store for heavy blobs)
  activityLog     → {id, deficiencyId, obsRef, date, label, text, instanceNumber, ...}
  syncQueue       → {id, entityType, entityId, action, timestamp, data}
```

**Why this matters:** Each deficiency is ~1KB. Saving one deficiency writes 1KB to IDB instead of 500KB for the entire project. Loading is parallel — fetch the 3 deficiencies visible on screen, not all 50.

### Session 1-B: Data Model Layer

```javascript
// model.js — single source of truth
const Model = {
  project: null,
  
  // Getters (cached, invalidated on change)
  getDeficiency(id) { ... },
  getAllDeficiencies() { ... },  // cached, walks contractors once
  getDrawing(id) { ... },
  getPhotosForEntity(entityType, entityId) { ... },
  getDeficienciesForInstance(instanceNumber) { ... },  // FRT #1, #2, etc.
  
  // Mutations (all go through here — single point of control)
  updateDeficiency(id, changes) {
    // 1. Update in-memory state
    // 2. Queue IDB write (async, non-blocking)
    // 3. Queue sync (async, non-blocking)  
    // 4. Notify UI to re-render affected components
    // 5. Return immediately — UI never waits for persistence
  },
  
  // Event system
  onChange(entityType, callback) { ... },  // UI subscribes to changes
};
```

**FRT multi-instance handling:** `deficiencies` and `activityLog` stores have `instanceNumber` field. `Model.getDeficienciesForInstance(n)` filters by instance. Creating FRT #2 increments `project.currentFrtInstance` — existing deficiencies keep their `notedOnInstance`, new ones get the current instance. Closed items tracked by `closedOnInstance`. Same logic as current FRT, just normalized.

**Key principle:** UI never writes to data directly. All mutations go through `Model.updateDeficiency()`, `Model.addPhoto()`, etc. The Model handles persistence and sync. UI just renders what the Model tells it.

### Session 1-C: Incremental Sync Engine

**Supabase schema (new tables — added alongside existing, not replacing):**

```sql
-- New normalized tables (coexist with tool_data during transition)
CREATE TABLE frt_projects (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ,
  updated_by TEXT
);

CREATE TABLE frt_deficiencies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  contractor_id TEXT,
  instance_number INTEGER DEFAULT 1,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ,
  updated_by TEXT
);

CREATE TABLE frt_drawings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ
);

CREATE TABLE frt_markup (
  id TEXT PRIMARY KEY,
  drawing_id TEXT NOT NULL,
  objects JSONB,
  updated_at TIMESTAMPTZ
);

CREATE TABLE frt_photos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  entity_type TEXT,            -- 'site', 'observation', 'activity'
  entity_id TEXT,
  r2_key TEXT,
  updated_at TIMESTAMPTZ
);

CREATE TABLE frt_activity (
  id TEXT PRIMARY KEY,
  deficiency_id TEXT NOT NULL,
  obs_ref TEXT,
  instance_number INTEGER DEFAULT 1,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ
);

-- Existing tool_data table KEPT for:
-- 1. Diesel Pump, Electric Pump, IST, OBC, DD (still use blob format)
-- 2. Old FRT clients that haven't refreshed yet (backward compat)
-- 3. Rollback safety net
```

**Sync protocol:**
```
1. On change: Model.updateDeficiency(id, changes)
   → writes to IDB immediately
   → adds to syncQueue: {entity:'deficiency', id:'def_123', action:'update', ts: now}

2. Every 2 seconds (or on demand): SyncEngine.flush()
   → reads syncQueue
   → batches by entity type
   → pushes to Supabase: UPSERT frt_deficiencies SET data=$1 WHERE id=$2
   → on success: remove from syncQueue
   → on conflict: compare timestamps, newer wins per-field

3. On page load: SyncEngine.pull()
   → SELECT * FROM frt_deficiencies WHERE project_id=$1 AND updated_at > $lastSync
   → for each newer record: Model.applyRemote(entity, data)
   → UI re-renders affected components

4. Heartbeat (every 15s): SyncEngine.poll()
   → same as pull, but only checks for changes since last poll
```

**No more `_collectFullState()`.** No more `JSON.parse(JSON.stringify(project))`. No more 500KB payloads. Each sync is 1-5KB.

### Session 1-D: Backward Compatibility Layer

**Critical:** During rollout, some devices will still run the OLD FRT (single-blob `tool_data`). New FRT uses normalized tables. They must coexist.

**`sync-compat.js` module:**
- On load: check if project exists in new tables. If not, read from `tool_data` blob and migrate.
- On save: write to new normalized tables AND write a blob summary to `tool_data` (dual-write). Old FRT clients can still read `tool_data`.
- Dual-write continues until all devices have upgraded (Mark manually disables via config after confirming).
- Old `tool_data` rows NEVER deleted — permanent backup.

### Session 1-E: Migration Tool

One-time migration that converts existing projects from old format to new:
- Read `tool_data` blob from Supabase
- Explode into individual rows in new tables
- Read IDB `projects` store → write to normalized stores
- Verify integrity: count entities before/after
- Flag project as `migrated: true`

Runs automatically on first load after deploy. Reversible — old `tool_data` row kept untouched as backup.

---

## Phase 2 — AI Writing Assistant (2-3 sessions)

**Independent of rewrite — can ship on current FRT immediately, carries over unchanged.**

### Session 2-A: Cloudflare Worker Proxy

```
Inspector's browser → Cloudflare Worker → Anthropic API (Claude Sonnet)
```

- Worker handles API key (never in frontend)
- Rate limiting per user
- Usage logging to Supabase `ai_usage_log` table
- Cost tracking: tokens × price, allocated to project number for Timeslips billing

### Session 2-B: FRT Integration

**Four review styles:**
| Style | What it does |
|-------|-------------|
| Quick Fix | Grammar, spelling, abbreviation expansion only |
| Polish | Rewrite for clarity, keep technical meaning |
| Full Rewrite | Professional tone, complete sentences, proper terminology |
| Rearrange | Reorder observations logically (location-based, severity-based) |

**UI:** Button on each observation card: "✨ AI Review". Click → dropdown of 4 styles → sends observation text + optional photo → returns improved text in a diff view → Accept / Edit / Reject.

**Photo analysis:** "📷 AI Describe" button on observation photos. Sends photo to Claude Sonnet vision → returns description. Inspector reviews and accepts/edits.

### Session 2-C: Batch Processing

"AI Review All" button in deficiency toolbar. Processes all open deficiencies sequentially. Shows progress bar. Presents all suggestions in a review queue — inspector accepts/rejects each one. Never auto-applies — inspector always has final say.

---

## Phase 3 — UI Migration (4-5 sessions)

Move current HTML/JS into modules. **Zero visual changes.** Same CSS, same HTML structure, same event handlers. Just organized into separate files.

### Session 3-A: Shell + Project Info + Auth
- `index.html` shell with module imports
- Tab switching, header, dark mode
- Auth flow (Supabase login)
- Project Info tab (copy current HTML/JS)

### Session 3-B: Deficiency Panel
- Extract deficiency rendering into `deficiencies.js`
- Observation cards, contractor chips, lifecycle tabs (Active / Site General / Closed)
- Wire to new Model (subscribe to changes, render on notification)
- Photo zones with Gallery picker
- FRT instance system (FRT #1, #2 — instance-scoped queries)

### Session 3-C: Drawing Gallery + Photo Gallery
- Extract into `drawings.js` and `photos.js`
- Gallery rendering, lightbox, photo selection
- Assign-to-pin flows (lightbox + gallery Actions)
- Photo auto-link: tag photos with last-viewed deficiency

### Session 3-D: All Deficiencies + Pin Editor + Remaining UI
- Tasks table/kanban view
- Pin editor modal
- JSON import/export
- All remaining dialogs and modals
- Offline queue indicator: "3 changes pending" badge in header

### Session 3-E: PDF Export
- Copy `_exportPDFWithCache`, `_finalizePage`, `_pdfActLine`, `go(pg)` into `pdf.js` module
- **Zero changes to rendering logic** — same output, same fonts, same layout
- Wire to new Model for data source

**Validation at end of Phase 3:** Deploy new version. Open same project on both old and new FRT. Screenshot every tab, every dialog, every PDF page. Pixel-compare. Must be identical.

---

## Phase 4 — Tile-Based Drawing Viewer (3-4 sessions)

### Session 4-A: Tile Generation Pipeline

At upload time (or one-time migration for existing drawings):
```
PDF/Image → Full-res JPEG (current behavior)
          → Slice into 256×256 tile pyramid
          → Store tiles in IDB: drawingTiles store {drawingId, level, x, y, blob}
          → Upload tiles to R2: photos/{pid}/frt/tiles/{drawingId}/{level}/{x}_{y}.jpg

Pyramid levels:
  Level 0: 1 tile (256×256) — thumbnail
  Level 1: 4 tiles (512×512 total)
  Level 2: 16 tiles (1024×1024)
  Level 3: 64 tiles (2048×2048)
  Level 4: 256 tiles (4096×4096) — full resolution
```

### Session 4-B: Tile Viewer

Replace current `<img>` viewer with tile container:
- On pan/zoom: calculate visible viewport → determine which tiles needed → load from IDB/R2
- LRU cache: keep ~30 tiles in DOM, evict oldest
- Level switching: zoom in past threshold → swap for higher-res level tiles
- Result: constant ~2MB memory regardless of drawing size
- No more initPanZoom DOM clone — tile container persists, tiles swap in/out

### Session 4-C: Tile Migration + R2 Upload
- Background migration: convert existing full-res JPEGs to tile pyramids
- R2 tile upload: each tile uploaded individually (small files, fast)
- Fallback: if tiles not yet generated, load full JPEG (current behavior)
- Drawing versioning prep: when a revised drawing is uploaded, old tiles archived, new tiles generated. Both versions accessible.

---

## Phase 5 — WebGL Markup Engine (4-5 sessions)

### Session 5-A: Pixi.js Integration + Basic Strokes
- Replace Canvas 2D with Pixi.js WebGL renderer
- Pen tool: GPU-accelerated line rendering, no pixel cap
- Coordinate system: same logical coordinates as current (backward compatible with existing markupObjects)

### Session 5-B: All Shape Tools
- Highlight (GPU blending — true non-stacking opacity)
- Eraser (stencil buffer — instant, no getImageData)
- Rectangle, circle, arrow, line, triangle, cloud, polyline
- Text (Pixi.js text rendering)
- Fill variants (fillrect, fillcircle)

### Session 5-C: Selection + Manipulation
- Select tool: GPU-based hit testing (color picking — instant, no loop)
- Move, resize handles
- Copy/paste
- Undo/redo stack (same architecture, just WebGL render)

### Session 5-D: Integration with Tile Viewer
- Markup layer overlays tile container
- Same transform (pan/zoom) applied to both
- Pin markers rendered in markup layer (GPU-accelerated)
- Export: render WebGL canvas to PNG for PDF export (same as current `canvas.toDataURL`)

**Backward compatibility:** Existing `markupObjects` arrays load directly into WebGL renderer. Same JSON format, same coordinate space. Old markup appears correctly without migration.

---

## Phase 6 — Web Worker Integration (2-3 sessions)

### Session 6-A: Sync Worker

Move to background thread:
- All IDB read/write operations
- CloudSync push/pull
- R2 photo uploads
- JSON serialization
- Image compression

Main thread only handles touch events and rendering. Zero stutter from saves, syncs, or uploads.

### Session 6-B: Offline Queue + Background Sync
- Persistent sync queue in IDB (survives app kill)
- Retry with exponential backoff
- Conflict resolution in worker (never blocks UI)
- Status reporting to main thread: "3 changes pending" badge in header
- Offline indicator: clear visual state showing online/offline/syncing

---

## Phase 7 — Hub + Other Tools Compatibility (2-3 sessions)

### Session 7-A: Project Hub Update

Hub currently reads FRT data from `tool_data` blob. Must be updated to read from new normalized tables:

- **Project Photos panel:** currently reads `sitePhotos` from tool_data blob → update to query `frt_photos` table
- **Cloud Storage panel:** currently counts files in tool_data → update to count rows in normalized tables
- **Report instances:** currently reads `currentFrtInstance` from tool_data → update to read from `frt_projects`
- **Project detail info:** tool toggle states, status badges → same source, new table

**Backward compat:** Hub checks for normalized tables first. If not found (project not yet migrated), falls back to `tool_data` blob read. Handles both old and new FRT clients seamlessly.

### Session 7-B: Other Tools Compatibility

**Diesel Pump + Electric Pump:** Both use CloudSync with `tool_data` table. They are NOT being rewritten — they stay single-file, blob-based. The `tool_data` table remains untouched. New FRT normalized tables are ADDITIONAL tables, not replacements. Zero impact on other tools.

**IST, OBC, DD:** Same — still use `tool_data` or localStorage. Unaffected.

**Training Center:** Has its own development track (Tier 1 infrastructure in `HANDOFF_TRAINING_CENTER.md`). Shares Supabase auth and R2 bucket but uses separate tables/paths. Training Center Tier 1 (auth, cloud, R2) can proceed independently — the infrastructure patterns from the FRT rewrite (normalized IDB, incremental sync, Web Worker) can be adopted by Training Center later.

### Session 7-C: Service Worker + PWA

- Rewrite `sw.js` to cache modular file structure
- Cache strategy: network-first for HTML shell, cache-first for JS/CSS modules
- Version stamping: bump cache version on deploy to force module refresh
- Offline manifest: list all modules for pre-caching
- Test: airplane mode after initial load — all modules load from cache

---

## Phase 8 — Android Capacitor App (1-2 sessions)

### Session 8-A: Capacitor Setup
- `npx @capacitor/cli create` with modular web app
- Configure: app name "ARENCON Hub", package `com.arencon.hub`
- Bundle HTML/JS/CSS into APK (offline-first)
- Build APK, test on Samsung Galaxy Tab A

### Session 8-B: Native Plugins
- Camera plugin (faster than web API, direct file system access)
- File system plugin (store photos outside IDB — gigabytes available)
- Background sync plugin (sync even when app is backgrounded)
- Splash screen + app icon (ARENCON branding)

**Distribution:** Same as current — sideload via email/USB/Drive. No Google Play needed. Replaces current TWA.

---

## Phase 9 — Testing, Migration, Cutover (2-3 sessions)

### Session 9-A: Parallel Testing
- Deploy new FRT alongside old (different URL path)
- Open same project on both versions
- Compare: every tab, every dialog, every workflow
- PDF report comparison: pixel-level diff
- Tablet testing: Samsung Tab A + iPhone

### Session 9-B: Data Migration
- Run migration tool on all active projects
- Verify: entity counts match, photos load, markup appears
- Keep old `tool_data` rows as backup (never delete)
- Dual-write enabled: new FRT writes to both normalized tables AND tool_data

### Session 9-C: Cutover
- Point `ARENCON_Field_Review_Tool.html` to new modular version
- Old version archived at `ARENCON_Field_Review_Tool_legacy.html`
- Monitor for 1 week — any issues, instant rollback
- After 2 weeks stable: disable dual-write (new tables only)
- Old `tool_data` rows kept permanently as backup

---

## Future Features (Post-Rewrite)

These become straightforward to build on the new architecture:

| Feature | Effort | Notes |
|---------|--------|-------|
| **Photo auto-link** | 1 session | Tag photos with last-viewed deficiency automatically |
| **Drawing versioning** | 2 sessions | Upload revised drawing, overlay compare, version history |
| **Offline queue indicator** | Built into Phase 6 | "3 changes pending" badge |
| **Real-time multi-user** | 2-3 sessions | Supabase Realtime subscriptions on normalized tables |
| **Deficiency statistics dashboard** | 1-2 sessions | Charts, trends, contractor metrics |
| **iOS Capacitor app** | 1-2 sessions | Same codebase as Android, requires $99/yr Apple Developer |
| **Training Center cloud infrastructure** | 2-3 sessions | Reuse FRT's normalized IDB + sync patterns |
| **Google Drive / M365 sync** | 2-3 sessions | Per-entity export, OAuth flow |

---

## What's NOT in This Roadmap

| Item | Why | When |
|------|-----|------|
| iOS Capacitor app | $99/year Apple Developer, pending principal approval | After demo approval |
| React Native / Flutter rewrite | Not needed — Capacitor + WebGL gets us to 90-95% of native | Only if principals demand App Store presence |
| Other tool rewrites (Diesel, Electric, IST, DD, OBC) | They're small and stable. tool_data table untouched. | Only if they grow complex |
| Google Drive / M365 integration | Planned but not blocking. Easier to build after normalized sync. | Post-rewrite |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Rewrite takes longer than estimated | Current FRT stays live. No deadline pressure. |
| New version has bugs old one didn't | Parallel testing phase. One-click rollback to old version. |
| Inspectors confused by changes | Zero visual changes. Same buttons, same workflows. |
| Data migration fails | Old data untouched. Migration is additive (writes to new tables, never deletes old). |
| Old FRT and new FRT open on different devices | Dual-write layer: new FRT writes to both normalized tables AND tool_data blob. Old FRT reads blob normally. |
| Hub breaks when FRT schema changes | Hub gets backward-compat update (Phase 7): tries normalized tables first, falls back to tool_data. |
| Diesel/Electric Pump tools break | They don't. tool_data table is untouched. New tables are additions. |
| WebGL not supported on old device | Fallback to Canvas 2D (current behavior). Feature-detect at runtime. |
| Pixi.js too large (200KB) | Loaded async, cached by service worker. One-time download. |

---

## Success Criteria

After Phase 9 cutover, these must all be true:

1. Drawing opens in <200ms on Samsung Galaxy Tab A
2. Markup drawing at 60fps with no pixel cap
3. Zero data loss across 100 consecutive Ctrl+Shift+R cycles
4. Two inspectors editing different deficiencies offline → both changes survive sync
5. PDF report pixel-identical to current version
6. Every UI element looks and works identical to current version
7. App loads in <1 second on tablet
8. AI Writing Assistant processes observation in <3 seconds
9. Android Capacitor APK installed and running on Samsung tablets
10. Project Hub reads data correctly from new schema
11. Diesel/Electric Pump tools unaffected — still work with tool_data
12. Offline mode works: airplane mode after initial load, all features functional, sync on reconnect
