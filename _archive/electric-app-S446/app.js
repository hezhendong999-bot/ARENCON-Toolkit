/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Electric Fire Pump Acceptance — App Boot (electric-app/app.js, S446)
   ══════════════════════════════════════════════════════════════════════════
   The first REAL tool on the shared /lib/ engine. This shell boots fully wired:
   auth → storage → sync → photo/camera engine, loads a project via ?project=,
   and presents the faithful S1–S5 + PLD + deficiencies + photos + signature +
   sketch + photos tab structure (empty step-sheets; those port in tab-by-tab
   from the live single-file Electric, which is the spec).

   Faithful to the live tool's boot behavior:
     • ?project=<uuid>  → Hub mode (cloud load/save via /lib/ sync)
     • back button      → ARENCON_Project_Hub.html?project=<uuid>
     • 15s autosave     → touch revision + save through the shared engine
     • 3-button leave   → Save & Leave / Leave without saving / Cancel
     • Bold·Light default (daylight field tool); sun/moon toggle persists
   Nothing single-file: this links /lib/ so every tool shares one engine.
   ══════════════════════════════════════════════════════════════════════════ */

import { createIDB } from '../lib/data/idb.js';
import { Auth } from '../lib/shared/auth.js';
import { UploadQueue } from '../lib/data/uploadQueue.js';
import { createR2 } from '../lib/data/r2.js';
import { createBinaryOutbox } from '../lib/data/photoOutbox.js';
import { createSync } from '../lib/data/sync.js';
import { SyncWorkerHost } from '../lib/data/syncWorkerHost.js';
import { toast } from '../lib/shared/toast.js';
import { lockScroll, unlockScroll } from '../lib/shared/scrollLock.js';

// ── Tool identity ──
const TOOL_KEY = 'electric';                 // its own R2 key space + Supabase tool_key
const AUTOSAVE_MS = 15000;                    // faithful to live tool
const PANELS = ['s1','s2','s3','s4','s4pld','s5','defic','sign','sketch','photos'];

// ── Per-tool data model (the canonical 4-method adapter the /lib/ sync needs) ──
// Electric's project is a simple flat object for now; step-sheets fill it in
// during the tab-by-tab port. The adapter is what sync + outbox both consume.
let _project = null;
let _dirty = false;

function emptyProject(id) {
  return {
    id: id || null,
    tool: TOOL_KEY,
    projectInfo: {},           // client / address / pump tag etc. (S1 fills this)
    pumpTestType: 'std',       // std | pld | both  (the 3-Point / 7-Point VFD choice)
    sheets: { s1:{}, s2:{}, s3:{}, s4:{}, s4pld:{}, s5:{} },
    deficiencies: [],
    photos: [],
    signatures: {},
    sketches: [],
    _rev: 0
  };
}

const model = {
  getProject: () => _project,
  setProject: (p) => { _project = p; },
  applyMerged: (p) => { _project = p; renderAll(); },
  saveNow: () => { try { persistLocal(); } catch (e) {} }
};

// ── /lib/ engine instances (built at boot) ──
let IDB, R2, BinaryOutbox, Sync;
let _hubMode = false;
let _projectId = null;
let _autosaveTimer = null;

async function boot() {
  // 1) URL → hub mode
  const params = new URLSearchParams(window.location.search);
  _projectId = params.get('project');
  _hubMode = !!_projectId;

  // 2) Theme (Bold·Light default for a daylight field tool; persist per-device)
  applyStoredTheme();

  // 3) Build the shared-engine stack for THIS tool
  IDB = createIDB({
    dbName: 'ARENCON_ELECTRIC',
    version: 1,
    stores: ['state', 'photoBlobs', 'pendingUploads', 'photoOutbox']
  });
  R2 = createR2({ toolKey: TOOL_KEY, IDB, Auth, UploadQueue });
  BinaryOutbox = createBinaryOutbox({ IDB, R2, Auth, toast, model }).BinaryOutbox;
  Sync = createSync({ toolKey: TOOL_KEY, Auth, IDB, model, BinaryOutbox, SyncWorkerHost });

  // 4) Wire header controls
  wireHeader();
  wireTabs();
  wireLeaveDialog();

  // 5) Load the project
  try {
    if (_hubMode) {
      showBootStatus('Loading project…');
      await Auth.restoreSession?.();          // best-effort; sync also self-checks
      await BinaryOutbox.init();               // resume any pending uploads
      const loaded = await Sync.pull(_projectId);
      _project = (loaded && loaded.id) ? loaded : emptyProject(_projectId);
      showBootStatus('');
      setSyncStamp('Loaded', 'ok');
    } else {
      // Standalone: local-only, no cloud. Restore last local state if present.
      _project = (await loadLocal()) || emptyProject(null);
    }
  } catch (e) {
    // Never blank the tool on a load error — open with an empty project and warn.
    _project = _project || emptyProject(_projectId);
    setSyncStamp('Offline', 'warn');
    toast('Working offline — changes save locally', 2600);
  }

  renderAll();
  startAutosave();
  showShell();
}

// ── Rendering (shell: header project bar + active panel). Step-sheets port later. ──
function renderAll() {
  renderProjectBar();
  // Each panel's real content arrives in its tab-port; shell shows a ready state.
  PANELS.forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el && !el.dataset.ported) el.querySelector('.panel-placeholder')?.classList.remove('hidden');
  });
}

function renderProjectBar() {
  const bar = document.getElementById('project-bar');
  if (!bar) return;
  const info = (_project && _project.projectInfo) || {};
  const name = info.projectName || info.client || (_hubMode ? ('Project ' + String(_projectId || '').slice(0, 8)) : 'Standalone');
  bar.querySelector('.pb-name').textContent = name;
  const badge = bar.querySelector('.pb-badge');
  if (badge) {
    badge.textContent = _hubMode ? 'HUB' : 'LOCAL';
    badge.style.background = _hubMode ? '#2C4770' : '#6B6674';
  }
}

// ── Tabs (faithful switchPanel) ──
function wireTabs() {
  document.querySelectorAll('.nav-tab').forEach((t) => {
    t.addEventListener('click', () => switchPanel(t.dataset.panel));
  });
  switchPanel('s1');
}
function switchPanel(id) {
  PANELS.forEach(p => document.getElementById('panel-' + p)?.classList.remove('active'));
  document.getElementById('panel-' + id)?.classList.add('active');
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === id));
  try { document.querySelector('.panel-scroll')?.scrollTo(0, 0); } catch (e) {}
}

// ── Autosave (faithful 15s cadence, but through the shared engine) ──
function markDirty() { _dirty = true; }
function startAutosave() {
  stopAutosave();
  _autosaveTimer = setInterval(async () => {
    if (!_dirty || !_project) return;
    _dirty = false;
    _project._rev = (_project._rev || 0) + 1;
    try {
      await persistLocal();
      if (_hubMode) { await Sync.push(_project); setSyncStamp('Saved', 'ok'); }
    } catch (e) { setSyncStamp('Save pending', 'warn'); _dirty = true; }
  }, AUTOSAVE_MS);
}
function stopAutosave() { if (_autosaveTimer) { clearInterval(_autosaveTimer); _autosaveTimer = null; } }

async function persistLocal() {
  if (!_project) return;
  await IDB.put('state', { id: 'current', project: _project, savedAt: Date.now() });
}
async function loadLocal() {
  try { const r = await IDB.get('state', 'current'); return r ? r.project : null; } catch (e) { return null; }
}

// ── Header controls ──
function wireHeader() {
  document.getElementById('back-btn')?.addEventListener('click', requestLeave);
  if (_hubMode) document.getElementById('back-btn').style.display = '';
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('logo-link')?.setAttribute('href', _hubMode
    ? ('ARENCON_Project_Hub.html?project=' + _projectId)
    : 'index.html');
}

// ── Theme (Bold·Light default; persist per-device) ──
function applyStoredTheme() {
  let t = 'light';
  try { t = localStorage.getItem('arencon-electric-theme') || 'light'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
  syncThemeIcon(t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('arencon-electric-theme', next); } catch (e) {}
  syncThemeIcon(next);
}
function syncThemeIcon(t) {
  const b = document.getElementById('theme-toggle');
  if (b) b.textContent = t === 'dark' ? '\u263E' : '\u2600\uFE0F';   // moon / sun
}

// ── Sync freshness stamp (quiet, always-visible — extends the cloud-status rule) ──
function setSyncStamp(text, kind) {
  const el = document.getElementById('sync-stamp');
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
  el.querySelector('.ss-text').textContent = text + ' ' + hh + ':' + mm;
  el.setAttribute('data-kind', kind || 'ok');
}

// ── 3-button leave dialog (faithful; no confirm()/alert()) ──
function wireLeaveDialog() {
  document.getElementById('sl-save-btn')?.addEventListener('click', async () => {
    try { await persistLocal(); if (_hubMode) await Sync.push(_project); } catch (e) {}
    doLeave();
  });
  document.getElementById('sl-leave-btn')?.addEventListener('click', doLeave);
  document.getElementById('sl-cancel-btn')?.addEventListener('click', hideLeave);
  document.getElementById('leave-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'leave-backdrop') hideLeave();
  });
}
function requestLeave() {
  if (!_dirty) { doLeave(); return; }   // nothing unsaved → just go
  const m = document.getElementById('leave-backdrop');
  if (m) { m.style.display = 'flex'; lockScroll(); }
}
function hideLeave() { const m = document.getElementById('leave-backdrop'); if (m) { m.style.display = 'none'; unlockScroll(); } }
function doLeave() {
  hideLeave();
  window.location.href = _hubMode ? ('ARENCON_Project_Hub.html?project=' + _projectId) : 'index.html';
}

// ── Boot chrome ──
function showBootStatus(msg) {
  const el = document.getElementById('boot-status');
  if (el) { el.textContent = msg || ''; el.style.display = msg ? 'flex' : 'none'; }
}
function showShell() {
  document.getElementById('app-shell')?.classList.add('ready');
  showBootStatus('');
}

// Expose a tiny surface for future tab-port modules to hook into.
window.ElectricApp = {
  getProject: () => _project,
  markDirty,
  switchPanel,
  get engine() { return { IDB, R2, BinaryOutbox, Sync }; }
};

// Guard beforeunload in hub mode via URL param (not a flag), per canon.
window.addEventListener('beforeunload', (e) => {
  const inHub = new URLSearchParams(window.location.search).get('project');
  if (inHub && _dirty) { e.preventDefault(); e.returnValue = ''; }
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
