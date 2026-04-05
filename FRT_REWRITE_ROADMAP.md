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
| 7 | Android Capacitor app | 1-2 | 29 |
| 8 | Testing, migration, cutover | 2-3 | 32 |
| **Total** | | **24-32 sessions** | |

Current FRT stays live and functional throughout. New version developed in parallel. Cutover is one deploy — inspectors see no interruption.

---

## Phase 0 — Planning & Scaffolding (1 session)

**What we build:**
- New repo structure (or subfolder in existing repo)
- Module file layout with build-free ES modules (native `<script type="module">`)
- HTML shell that loads modules
- Shared CSS file (extracted from current FRT — same styles, same variables)
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
        pdf.js              ← PDF report (copied from current FRT)
        json.js             ← JSON import/export
      shared/
        dialogs.js          ← _aAlert, _aConfirm, _aPrompt (shared modal builder)
        toast.js            ← toast notifications
        darkmode.js         ← dark mode toggle
        auth.js             ← Supabase auth
        compress.js         ← image compression
    worker/
      sync-worker.js        ← Web Worker for background sync/IDB
    assets/
      logo_base64.txt
      Blaimim_base64.txt
```

**No build tools.** Native ES modules (`import`/`export`) work in all modern browsers and Android TWA. No webpack, no npm, no node_modules. Edit a file, push to GitHub, Ctrl+Shift+R. Same workflow you have today.

**Decision:** Do we keep single-file for other tools (Diesel Pump, Electric Pump, IST, DD, OBC) or migrate them too? Recommendation: keep them single-file for now. They're small and stable. Only FRT needs this.

---

## Phase 1 — Data Layer Rewrite (5-6 sessions)

This is the foundation. Everything else depends on it.

### Session 1-A: Normalized IDB Schema

**Current:** One `projects` store with entire project as one record. One `drawings` store with blobs. One `sitePhotos` store with blobs.

**New:** Each entity type gets its own IDB object store with individual records:

```
IDB stores:
  projects        → {id, name, number, client, address, ...}
  contractors     → {id, projectId, name}
  deficiencies    → {id, projectId, contractorId, num, status, priority, ...}
  observations    → {id, deficiencyId, text, addressed, notedOnInstance, ...}
  drawings        → {id, projectId, name, folder, width, height, pdfTiled, ...}
  drawingBlobs    → {id, dataBlob}  (separate store for heavy blobs)
  markupObjects   → {id, drawingId, objects: [...]}
  photos          → {id, projectId, entityType, entityId, r2Key, r2Url, ...}
  photoBlobs      → {id, dataBlob}  (separate store for heavy blobs)
  activityLog     → {id, deficiencyId, date, label, text, ...}
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
  getPhotosForDeficiency(deficId) { ... },
  
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

**Key principle:** UI never writes to data directly. All mutations go through `Model.updateDeficiency()`, `Model.addPhoto()`, etc. The Model handles persistence and sync. UI just renders what the Model tells it.

### Session 1-C: Incremental Sync Engine

**Supabase schema (new tables):**

```sql
-- One row per entity, not one blob per project
CREATE TABLE frt_deficiencies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  contractor_id TEXT,
  data JSONB NOT NULL,        -- {num, status, priority, description, ...}
  updated_at TIMESTAMPTZ,
  updated_by TEXT
);

CREATE TABLE frt_drawings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  data JSONB NOT NULL,        -- {name, folder, width, height, ...}
  updated_at TIMESTAMPTZ
);

CREATE TABLE frt_markup (
  id TEXT PRIMARY KEY,         -- same as drawing_id
  drawing_id TEXT NOT NULL,
  objects JSONB,               -- [{type:'pen', points:[...], color:'#C00', ...}]
  updated_at TIMESTAMPTZ
);

CREATE TABLE frt_photos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  entity_type TEXT,            -- 'site', 'observation', 'activity'
  entity_id TEXT,              -- deficiency or observation ID
  r2_key TEXT,
  updated_at TIMESTAMPTZ
);

-- Keep existing tool_data table for backward compat during migration
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

### Session 1-D: Migration Tool

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

**Photo analysis:** "📷 AI Describe" button on observation photos. Sends photo to Claude Sonnet vision → returns description: "Sprinkler deflector at approximately 4 inches from ceiling, showing inadequate clearance per NFPA 13 Section 8.6.5.1." Inspector reviews and accepts/edits.

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
- Observation cards, contractor chips, lifecycle tabs
- Wire to new Model (subscribe to changes, render on notification)
- Photo zones with Gallery picker

### Session 3-C: Drawing Gallery + Photo Gallery
- Extract into `drawings.js` and `photos.js`
- Gallery rendering, lightbox, photo selection
- Assign-to-pin flows

### Session 3-D: All Deficiencies + Pin Editor + Remaining UI
- Tasks table/kanban view
- Pin editor modal
- JSON import/export
- All remaining dialogs and modals

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
          → Store tiles in IDB: {drawingId, level, x, y, blob}
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
```
<div id="tile-container" style="transform: translate3d(panX, panY, 0) scale(zoom)">
  <!-- Only visible tiles rendered as <img> elements -->
  <img style="position:absolute; left:512px; top:256px" src="blob:tile_L2_2_1">
  <img style="position:absolute; left:768px; top:256px" src="blob:tile_L2_3_1">
  ...
</div>
```

- On pan/zoom: calculate visible viewport → determine which tiles needed → load from IDB/R2 → append to container
- LRU cache: keep ~30 tiles in DOM, evict oldest
- Level switching: zoom in past threshold → swap for higher-res level tiles
- Result: constant ~2MB memory regardless of drawing size

### Session 4-C: Tile Migration + R2 Upload

- Background migration: convert existing full-res JPEGs to tile pyramids
- R2 tile upload: each tile uploaded individually (small files, fast)
- Fallback: if tiles not yet generated, load full JPEG (current behavior)

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

```javascript
// Main thread (UI)
SyncWorker.postMessage({action: 'saveDeficiency', id: 'def_123', data: {...}});

// Worker thread (background)
onmessage = async (e) => {
  if (e.data.action === 'saveDeficiency') {
    await idb.put('deficiencies', e.data.data);      // IDB write — doesn't block UI
    syncQueue.push({entity: 'deficiency', ...});      // queue for cloud
    postMessage({action: 'saved', id: e.data.id});    // notify main thread
  }
};
```

### Session 6-B: Offline Queue + Background Sync

- Persistent sync queue in IDB (survives app kill)
- Retry with exponential backoff
- Conflict resolution in worker (never blocks UI)
- Status reporting to main thread: "3 changes pending" badge

**Result:** The main thread ONLY handles touch events and rendering. Every data operation happens in the background. Zero stutter from saves, syncs, or uploads. Ever.

---

## Phase 7 — Android Capacitor App (1-2 sessions)

### Session 7-A: Capacitor Setup

- `npx @capacitor/cli create` with existing web app
- Configure: app name "ARENCON Hub", package `com.arencon.hub`
- Point to GitHub Pages URL (live loading, same as TWA)
- OR bundle HTML/JS/CSS into APK (offline-first, update via in-app download)
- Build APK, test on Samsung Galaxy Tab A

### Session 7-B: Native Plugins

- Camera plugin (faster than web API, direct file system access)
- File system plugin (store photos outside IDB — gigabytes available)
- Background sync plugin (sync even when app is backgrounded)
- Splash screen + app icon (ARENCON branding)

**Distribution:** Same as current — sideload via email/USB/Drive. No Google Play needed.

---

## Phase 8 — Testing, Migration, Cutover (2-3 sessions)

### Session 8-A: Parallel Testing

- Deploy new FRT alongside old (different URL path)
- Open same project on both versions
- Compare: every tab, every dialog, every workflow
- PDF report comparison: pixel-level diff
- Tablet testing: Samsung Tab A + iPhone

### Session 8-B: Data Migration

- Run migration tool on all active projects
- Verify: entity counts match, photos load, markup appears
- Keep old `tool_data` rows as backup (never delete)

### Session 8-C: Cutover

- Point `ARENCON_Field_Review_Tool.html` to new modular version
- Old version archived at `ARENCON_Field_Review_Tool_legacy.html`
- Monitor for 1 week — any issues, instant rollback
- After 1 week stable: remove legacy file

---

## What's NOT in This Roadmap

| Item | Why | When |
|------|-----|------|
| iOS Capacitor app | $99/year Apple Developer, pending principal approval | After demo approval |
| React Native / Flutter rewrite | Not needed — Capacitor + WebGL gets us to 90-95% of native | Only if principals demand App Store presence |
| Real-time collaboration | Two inspectors editing same deficiency simultaneously | After incremental sync is stable |
| Other tool rewrites (Diesel, Electric, IST) | They're small and stable | Only if they grow complex |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Rewrite takes longer than estimated | Current FRT stays live. No deadline pressure. |
| New version has bugs old one didn't | Parallel testing phase. One-click rollback to old version. |
| Inspectors confused by changes | Zero visual changes. Same buttons, same workflows. |
| Data migration fails | Old data untouched. Migration is additive (writes to new tables, never deletes old). |
| WebGL not supported on old device | Fallback to Canvas 2D (current behavior). Feature-detect at runtime. |
| Pixi.js too large (200KB) | Loaded async, cached by service worker. One-time download. |

---

## Success Criteria

After Phase 8 cutover, these must all be true:

1. Drawing opens in <200ms on Samsung Galaxy Tab A
2. Markup drawing at 60fps with no pixel cap
3. Zero data loss across 100 consecutive Ctrl+Shift+R cycles
4. Two inspectors editing different deficiencies offline → both changes survive sync
5. PDF report pixel-identical to current version
6. Every UI element looks and works identical to current version
7. App loads in <1 second on tablet
8. AI Writing Assistant processes observation in <3 seconds
9. Android Capacitor APK installed and running on Samsung tablets
