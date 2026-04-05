/**
 * ARENCON Field Review Tool v2 — Entry Point
 * ═══════════════════════════════════════════
 * 
 * This is the main entry point for the modular FRT.
 * Responsibilities:
 *   - Tab switching
 *   - Dark mode toggle
 *   - Text size cycling
 *   - Logo loading
 *   - Hub mode detection (URL param ?project=<uuid>)
 *   - Module initialization orchestration
 *   - Global event listeners (online/offline, beforeunload, keyboard shortcuts)
 * 
 * All data operations go through Model (data/model.js).
 * All UI rendering is handled by UI modules (ui/*.js).
 * This file ONLY handles the shell — it never touches data directly.
 */

// ── Module Imports ───────────────────────────────────────
import { Model } from './data/model.js';
import { IDB } from './data/idb.js';
import { SyncEngine } from './data/sync.js';
import { R2 } from './data/r2.js';
import { Auth } from './shared/auth.js';
import { toast } from './shared/toast.js';
import { showDialog, showConfirm, showAlert } from './shared/dialogs.js';
import { initProjectInfo } from './ui/projectInfo.js';
import { initDeficiencies } from './ui/deficiencies.js';
import { initDrawings } from './ui/drawings.js';
import { initPhotos } from './ui/photos.js';
import { initPins } from './ui/pins.js';
import { initViewer } from './viewer/viewer.js';
import { initMarkup } from './viewer/markup.js';
import { initPDFExport } from './export/pdf.js';
import { initJSONExport } from './export/json.js';

// ── Constants ────────────────────────────────────────────
const LS_DARK = 'arencon-frt-dark';
const LS_TEXT_SIZE = 'arencon-text-size';
const TEXT_SIZES = ['S', 'M'];
const TEXT_CLASSES = { S: '', M: 'text-m' };
const TEXT_LABELS = { S: 'Small', M: 'Medium' };

// ── State ────────────────────────────────────────────────
let _currentTab = 'info';
let _hubMode = false;
let _projectId = null;

// ── Hub Mode Detection ───────────────────────────────────
function detectHubMode() {
  const params = new URLSearchParams(window.location.search);
  const pid = params.get('project');
  if (pid) {
    _hubMode = true;
    _projectId = pid;
    // Update logo link to point to Hub
    const logoLink = document.getElementById('logo-link');
    if (logoLink) logoLink.href = '../ARENCON_Project_Hub.html';
    // Show back button
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.style.display = '';
      backBtn.addEventListener('click', goToDashboard);
    }
    console.log('[FRT v2] Hub mode — project:', pid);
  } else {
    _hubMode = false;
    _projectId = null;
    console.log('[FRT v2] Standalone mode');
  }
  return { hubMode: _hubMode, projectId: _projectId };
}

function goToDashboard() {
  // In Hub mode, navigate back to the Hub
  if (_hubMode) {
    window.location.href = '../ARENCON_Project_Hub.html';
  }
}

// ── Logo Loading ─────────────────────────────────────────
async function loadLogo() {
  const img = document.getElementById('logo-img');
  if (!img) return;
  try {
    // Try fetching from parent directory (same repo root)
    const resp = await fetch('../logo_base64.txt');
    if (resp.ok) {
      const b64 = await resp.text();
      img.src = b64.trim();
    } else {
      console.warn('[FRT v2] Logo fetch failed:', resp.status);
    }
  } catch (err) {
    console.warn('[FRT v2] Logo load error:', err);
  }
}

// ── Tab Switching ────────────────────────────────────────
function switchTab(tabName) {
  _currentTab = tabName;

  // Update nav tab active state
  document.querySelectorAll('.nav-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  // Update panel visibility
  document.querySelectorAll('.panel').forEach(function(p) {
    var panelTab = p.id.replace('panel-', '');
    p.classList.toggle('active', panelTab === tabName);
  });

  // Notify UI modules so they can render/refresh
  switch (tabName) {
    case 'info':       initProjectInfo.render(); break;
    case 'drawings':   initDrawings.render(); break;
    case 'deficiencies': initDeficiencies.render(); break;
    case 'pins':       initPins.render(); break;
    case 'photos':     initPhotos.render(); break;
  }
}

function initTabListeners() {
  document.querySelectorAll('.nav-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      switchTab(this.dataset.tab);
    });
  });
}

// ── Dark Mode ────────────────────────────────────────────
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  var isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem(LS_DARK, isDark ? '1' : '0');
  updateDarkToggleIcon();
}

function updateDarkToggleIcon() {
  var isDark = document.body.classList.contains('dark-mode');
  var icon = isDark ? '🌙' : '☀️';
  var dt = document.getElementById('dark-toggle');
  if (dt) dt.textContent = icon;
  var dvdt = document.getElementById('dv-dark-toggle');
  if (dvdt) dvdt.textContent = icon;
}

function restoreDarkMode() {
  if (localStorage.getItem(LS_DARK) === '1') {
    document.body.classList.add('dark-mode');
  }
  updateDarkToggleIcon();
}

// ── Text Size ────────────────────────────────────────────
function cycleTextSize() {
  var cur = localStorage.getItem(LS_TEXT_SIZE) || 'M';
  var idx = TEXT_SIZES.indexOf(cur);
  var next = TEXT_SIZES[(idx + 1) % TEXT_SIZES.length];
  applyTextSize(next);
  localStorage.setItem(LS_TEXT_SIZE, next);
}

function applyTextSize(size) {
  if (TEXT_SIZES.indexOf(size) < 0) size = 'M';
  document.body.classList.remove('text-m', 'text-l');
  var cls = TEXT_CLASSES[size];
  if (cls) document.body.classList.add(cls);
  var btn = document.getElementById('btn-text-size');
  if (btn) btn.textContent = size;
  var mob = document.getElementById('mobile-text-size-btn');
  if (mob) mob.textContent = 'Text: ' + TEXT_LABELS[size];
}

function restoreTextSize() {
  applyTextSize(localStorage.getItem(LS_TEXT_SIZE) || 'M');
}

// ── Mobile Menu ──────────────────────────────────────────
function openMobileMenu() {
  var mm = document.getElementById('mobile-menu-overlay');
  if (mm) mm.classList.add('open');
}

function closeMobileMenu() {
  var mm = document.getElementById('mobile-menu-overlay');
  if (mm) mm.classList.remove('open');
}

// ── More Dropdown ────────────────────────────────────────
function toggleMoreMenu(e) {
  if (e) e.stopPropagation();
  var m = document.getElementById('more-menu');
  if (m) m.classList.toggle('open');
}

function closeMoreMenu() {
  var m = document.getElementById('more-menu');
  if (m) m.classList.remove('open');
}

// ── Online/Offline ───────────────────────────────────────
function updateOnlineStatus() {
  var bar = document.getElementById('offline-bar');
  if (bar) {
    bar.classList.toggle('show', !navigator.onLine);
  }
}

// ── Keyboard Shortcuts ───────────────────────────────────
function handleKeyboard(e) {
  // Ctrl+S — save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    // TODO: trigger save via Model
    toast('Saved ✓');
  }
  // Ctrl+Z — undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    // TODO: undo via Model
  }
  // Ctrl+Y or Ctrl+Shift+Z — redo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    // TODO: redo via Model
  }
}

// ── beforeunload ─────────────────────────────────────────
function handleBeforeUnload(e) {
  // In Hub mode, suppress the leave warning (URL param check, not flag)
  var params = new URLSearchParams(window.location.search);
  if (params.get('project')) return;

  // In standalone mode with unsaved changes, warn
  if (Model.hasUnsavedChanges()) {
    e.preventDefault();
    e.returnValue = '';
  }
}

// ── Wire All Event Listeners ─────────────────────────────
function wireEvents() {
  // Tab navigation
  initTabListeners();

  // Dark mode
  var darkBtn = document.getElementById('dark-toggle');
  if (darkBtn) darkBtn.addEventListener('click', toggleDarkMode);
  var dvDarkBtn = document.getElementById('dv-dark-toggle');
  if (dvDarkBtn) dvDarkBtn.addEventListener('click', toggleDarkMode);

  // Text size
  var tsBtn = document.getElementById('btn-text-size');
  if (tsBtn) tsBtn.addEventListener('click', cycleTextSize);

  // Mobile menu
  var mmBtn = document.getElementById('mobile-menu-btn');
  if (mmBtn) mmBtn.addEventListener('click', openMobileMenu);
  var mmOverlay = document.getElementById('mobile-menu-overlay');
  if (mmOverlay) mmOverlay.addEventListener('click', function(e) {
    if (e.target === mmOverlay) closeMobileMenu();
  });
  var mmClose = document.getElementById('mobile-menu-close');
  if (mmClose) mmClose.addEventListener('click', closeMobileMenu);
  var mmTextSize = document.getElementById('mobile-text-size-btn');
  if (mmTextSize) mmTextSize.addEventListener('click', function() {
    cycleTextSize();
    closeMobileMenu();
  });

  // More dropdown — close on outside click
  document.addEventListener('click', function() {
    closeMoreMenu();
  });

  // Online/offline
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // Keyboard
  document.addEventListener('keydown', handleKeyboard);

  // beforeunload
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Drawing viewer close
  var dvClose = document.getElementById('dv-close');
  if (dvClose) dvClose.addEventListener('click', function() {
    var overlay = document.getElementById('drawing-viewer-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('dv-open');
  });
}

// ── Boot Sequence ────────────────────────────────────────
async function boot() {
  console.log('[FRT v2] Booting...');
  var t0 = performance.now();

  // 1. Restore preferences (sync — before first paint matters)
  restoreDarkMode();
  restoreTextSize();

  // 2. Load logo (async — non-blocking)
  loadLogo();

  // 3. Detect Hub mode
  var mode = detectHubMode();

  // 4. Wire all event listeners
  wireEvents();

  // 5. Initialize IDB (creates stores if needed)
  try {
    await IDB.init();
    console.log('[FRT v2] IDB ready');
  } catch (err) {
    console.error('[FRT v2] IDB init failed:', err);
    // Continue — we degrade gracefully without IDB
  }

  // 6. If Hub mode, authenticate and load project from cloud
  if (mode.hubMode) {
    try {
      var session = await Auth.restoreSession();
      if (session) {
        console.log('[FRT v2] Auth session restored');
        await SyncEngine.pull(mode.projectId);
      } else {
        console.warn('[FRT v2] No auth session — working offline');
      }
    } catch (err) {
      console.error('[FRT v2] Auth/sync error:', err);
    }
  }

  // 7. Show the project view and nav
  var viewProject = document.getElementById('view-project');
  if (viewProject) viewProject.style.display = '';
  var sectionNav = document.getElementById('section-nav');
  if (sectionNav) sectionNav.style.display = '';

  // 8. Render the initial tab
  switchTab('info');

  var elapsed = (performance.now() - t0).toFixed(0);
  console.log('[FRT v2] Boot complete in ' + elapsed + 'ms');
}

// ── Start ────────────────────────────────────────────────
boot().catch(function(err) {
  console.error('[FRT v2] Boot failed:', err);
});

// ── Exports (for debugging in console) ───────────────────
window._frt = {
  Model: Model,
  IDB: IDB,
  SyncEngine: SyncEngine,
  R2: R2,
  Auth: Auth,
  switchTab: switchTab,
  toggleDarkMode: toggleDarkMode,
  version: '2.0.0-alpha',
  phase: 0
};
