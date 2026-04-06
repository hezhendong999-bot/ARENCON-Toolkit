/**
 * ARENCON FRT v2 — Entry Point
 * ═══════════════════════════════
 * 
 * Shell orchestration: tab switching, dark mode, text size,
 * logo loading, module init, event wiring, boot sequence.
 */

import { Model } from './data/model.js';
import { IDB } from './data/idb.js';
import { SyncEngine } from './data/sync.js';
import { R2 } from './data/r2.js';
import { Auth } from './shared/auth.js';
import { toast } from './shared/toast.js';
import { showDialog, showConfirm, showAlert, showPrompt } from './shared/dialogs.js';
import { initProjectInfo } from './ui/projectInfo.js';
import { initDeficiencies } from './ui/deficiencies.js';
import { initDrawings } from './ui/drawings.js';
import { initPhotos } from './ui/photos.js';
import { initPins } from './ui/pins.js';
import { Lightbox } from './ui/lightbox.js';
import { initViewer } from './viewer/viewer.js';
import { initMarkup } from './viewer/markup.js';
import { initPDFExport } from './export/pdf.js';
import { initJSONExport } from './export/json.js';

// ── Constants ────────────────────────────────────────────
var LS_DARK = 'arencon-frt-dark';
var LS_TEXT_SIZE = 'arencon-text-size';
var TEXT_SIZES = ['S', 'M'];
var TEXT_CLASSES = { S: '', M: 'text-m' };
var TEXT_LABELS = { S: 'Small', M: 'Medium' };

// ── State ────────────────────────────────────────────────
var _currentTab = 'info';
var _hubMode = false;
var _projectId = null;

// ── Hub Mode Detection ───────────────────────────────────
function detectHubMode() {
  var params = new URLSearchParams(window.location.search);
  var pid = params.get('project');
  if (pid) {
    _hubMode = true;
    _projectId = pid;
    var logoLink = document.getElementById('logo-link');
    if (logoLink) logoLink.href = '../ARENCON_Project_Hub.html';
    var backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.style.display = '';
      backBtn.addEventListener('click', function() {
        window.location.href = '../ARENCON_Project_Hub.html';
      });
    }
    console.log('[FRT v2] Hub mode \u2014 project:', pid);
  } else {
    _hubMode = false;
    _projectId = null;
    console.log('[FRT v2] Standalone mode');
  }
  return { hubMode: _hubMode, projectId: _projectId };
}

// ── Logo Loading ─────────────────────────────────────────
function loadLogo() {
  var img = document.getElementById('logo-img');
  if (!img) return;
  fetch('../logo_base64.txt').then(function(resp) {
    if (resp.ok) return resp.text();
    throw new Error('Logo fetch: ' + resp.status);
  }).then(function(b64) {
    img.src = b64.trim();
  }).catch(function(err) {
    console.warn('[FRT v2] Logo load error:', err);
  });
}

// ── Tab Switching ────────────────────────────────────────
function switchTab(tabName) {
  _currentTab = tabName;

  document.querySelectorAll('.nav-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  document.querySelectorAll('.panel').forEach(function(p) {
    var panelTab = p.id.replace('panel-', '');
    p.classList.toggle('active', panelTab === tabName);
  });

  // Render the active tab
  switch (tabName) {
    case 'info': initProjectInfo.render(); break;
    case 'drawings': initDrawings.render(); break;
    case 'deficiencies': initDeficiencies.render(); break;
    case 'pins': initPins.render(); break;
    case 'photos': initPhotos.render(); break;
  }
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
  var icon = isDark ? '\uD83C\uDF19' : '\u2600\uFE0F';
  var dt = document.getElementById('dark-toggle');
  if (dt) dt.textContent = icon;
  var dvdt = document.getElementById('dv-dark-toggle');
  if (dvdt) dvdt.textContent = icon;
}

function restoreDarkMode() {
  if (localStorage.getItem(LS_DARK) === '1') document.body.classList.add('dark-mode');
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

// ── JSON Load/Export Wiring ──────────────────────────────
function wireLoadExport() {
  // Load button opens file picker
  var btnLoad = document.getElementById('btn-load');
  if (btnLoad) btnLoad.addEventListener('click', function() {
    document.getElementById('load-input').click();
  });

  // File input triggers import
  var loadInput = document.getElementById('load-input');
  if (loadInput) loadInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
      initJSONExport.importJSON(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Export button (in More menu and mobile)
  var btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.addEventListener('click', function() {
    initJSONExport.exportJSON();
    closeMoreMenu();
  });

  // Load button in More menu
  var btnLoadMore = document.getElementById('btn-load-more');
  if (btnLoadMore) btnLoadMore.addEventListener('click', function() {
    document.getElementById('load-input').click();
    closeMoreMenu();
  });

  // Mobile buttons
  var mobileExport = document.getElementById('mobile-export-btn');
  if (mobileExport) mobileExport.addEventListener('click', function() {
    initJSONExport.exportJSON();
    closeMobileMenu();
  });
  var mobileLoad = document.getElementById('mobile-load-btn');
  if (mobileLoad) mobileLoad.addEventListener('click', function() {
    document.getElementById('load-input').click();
    closeMobileMenu();
  });
}

// ── Online/Offline ───────────────────────────────────────
function updateOnlineStatus() {
  var bar = document.getElementById('offline-bar');
  if (bar) bar.classList.toggle('show', !navigator.onLine);
}

// ── Keyboard Shortcuts ───────────────────────────────────
function handleKeyboard(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    Model.saveNow().then(function() { toast('Saved \u2713'); });
  }
}

// ── beforeunload ─────────────────────────────────────────
function handleBeforeUnload(e) {
  var params = new URLSearchParams(window.location.search);
  if (params.get('project')) return;
  if (Model.hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ''; }
}

// ── Show/Hide Project View ───────────────────────────────
function showProjectView() {
  var vp = document.getElementById('view-project');
  if (vp) vp.style.display = '';
  var sn = document.getElementById('section-nav');
  if (sn) sn.style.display = '';
}

// ── Update Header When Project Loads ─────────────────────
function _updateHeaderForProject() {
  var proj = Model.getProject();
  if (!proj) return;

  // Show project bar with filename + badge
  var pb = document.getElementById('project-bar');
  if (pb) pb.classList.add('visible');
  var pbFn = document.getElementById('pb-filename');
  if (pbFn) pbFn.textContent = Model.getSmartFilename();
  var pbBadge = document.getElementById('pb-badge');
  if (pbBadge) {
    var st = (proj.status || 'draft').toUpperCase();
    pbBadge.textContent = st;
    // Badge colors by status
    var colors = { DRAFT: '#E65100', ISSUED: '#1A7A4A', PUBLISHED: '#1A237E', LOCKED: '#B71C1C' };
    pbBadge.style.background = colors[st] || '#E65100';
  }

  // Update issue status badge in header — HIDDEN, project bar badge is sufficient
  var isb = document.getElementById('issue-status-badge');
  if (isb) isb.style.display = 'none';

  // Toggle header buttons: hide dashboard, show project
  var dashBtns = ['btn-load', 'btn-export-all'];
  var projBtns = ['btn-pdf', 'btn-issue', 'btn-more-wrap', 'btn-qr'];
  dashBtns.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  projBtns.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  // Show repair section for admin
  var repairSec = document.getElementById('more-repair-section');
  if (repairSec) repairSec.style.display = '';
  var mobileRepair = document.getElementById('mobile-repair-section');
  if (mobileRepair) mobileRepair.style.display = '';

  // Update page title
  document.title = 'ARENCON \u2014 ' + Model.getSmartFilename();
}

// ── Cloud Sync (Hub Mode) ────────────────────────────────
var _cloudSyncTimer = null;
var _cloudSyncInterval = 30000; // 30 seconds

function _startCloudSync() {
  if (_cloudSyncTimer) clearInterval(_cloudSyncTimer);

  // Update cloud status indicator
  _setCloudStatus('synced', 'Loaded from cloud');

  // Listen for local saves → push to cloud
  Model.onChange('saved', function() {
    // Debounce cloud push — don't push on every keystroke save
    if (_cloudSyncTimer) clearInterval(_cloudSyncTimer);
    _cloudSyncTimer = setTimeout(function() {
      _pushToCloud();
      // Restart periodic sync
      _cloudSyncTimer = setInterval(_pushToCloud, _cloudSyncInterval);
    }, 5000); // Wait 5s after last local save before pushing
  });

  // Also do periodic sync
  _cloudSyncTimer = setInterval(_pushToCloud, _cloudSyncInterval);
  console.log('[FRT v2] Cloud sync started (every ' + _cloudSyncInterval / 1000 + 's)');
}

function _pushToCloud() {
  if (!_hubMode || !_projectId) return;
  _setCloudStatus('saving', 'Syncing...');
  SyncEngine.push(_projectId).then(function(row) {
    if (row) {
      _setCloudStatus('synced', 'Saved to cloud');
    } else {
      _setCloudStatus('pending', 'Saved locally');
    }
  }).catch(function(err) {
    console.warn('[FRT v2] Cloud push failed:', err);
    _setCloudStatus('error', 'Sync failed');
  });
}

function _setCloudStatus(status, text) {
  var dot = document.getElementById('cloud-dot');
  var label = document.getElementById('cloud-status-text');
  var wrap = document.getElementById('cloud-status');
  if (wrap) wrap.style.display = 'flex';
  if (label) label.textContent = text || '';
  if (dot) {
    var colors = { synced: '#34D399', saving: '#FBBF24', pending: '#F59E0B', error: '#EF4444', offline: '#9CA3AF' };
    dot.style.background = colors[status] || '#9CA3AF';
  }
}

// ── Sign Out ─────────────────────────────────────────────
function _signOut() {
  showConfirm('Sign Out', 'Sign out of your ARENCON account?').then(function(yes) {
    if (yes) {
      Auth.signOut().then(function() {
        toast('Signed out');
        window.location.href = '../ARENCON_Project_Hub.html';
      });
    }
  });
}

// ── Wire All Event Listeners ─────────────────────────────
function wireEvents() {
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { switchTab(this.dataset.tab); });
  });

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
    cycleTextSize(); closeMobileMenu();
  });

  // Load/export
  wireLoadExport();

  // Drawing viewer close
  var dvClose = document.getElementById('dv-close');
  if (dvClose) dvClose.addEventListener('click', function() {
    var overlay = document.getElementById('drawing-viewer-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('dv-open');
  });

  // Sign Out buttons
  var soBtn = document.getElementById('btn-signout');
  if (soBtn) soBtn.addEventListener('click', _signOut);
  var msoBtn = document.getElementById('mobile-signout-btn');
  if (msoBtn) msoBtn.addEventListener('click', function() { closeMobileMenu(); _signOut(); });

  // Online/offline
  window.addEventListener('online', function() {
    updateOnlineStatus();
    if (_hubMode) _setCloudStatus('synced', 'Back online');
  });
  window.addEventListener('offline', function() {
    updateOnlineStatus();
    if (_hubMode) _setCloudStatus('offline', 'Working offline');
  });
  updateOnlineStatus();

  // Keyboard + beforeunload
  document.addEventListener('keydown', handleKeyboard);
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Close dropdowns on outside click
  document.addEventListener('click', function() {
    var m = document.getElementById('more-menu');
    if (m) m.classList.remove('open');
  });

  // More dropdown button
  var moreWrap = document.getElementById('btn-more-wrap');
  if (moreWrap) {
    var moreBtn = moreWrap.querySelector('.hdr-btn');
    if (moreBtn) moreBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = document.getElementById('more-menu');
      if (m) m.classList.toggle('open');
    });
  }

  // PDF Report buttons
  var pdfBtn = document.getElementById('btn-pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', _openPDFPicker);
  var mobilePdfBtn = document.getElementById('mobile-pdf-btn');
  if (mobilePdfBtn) mobilePdfBtn.addEventListener('click', function() {
    closeMobileMenu(); _openPDFPicker();
  });
}

// ── PDF Picker Dialog ───────────────────────────────────
function _openPDFPicker() {
  var proj = Model.getProject();
  if (!proj) return;

  // Build contractor filter options
  var ctrOpts = '<option value="__all__">All Contractors</option>';
  (proj.contractors || []).forEach(function(c) {
    ctrOpts += '<option value="' + c.id + '">' + (c.name || 'Unnamed') + '</option>';
  });
  if ((proj.generalDeficiencies || []).length) {
    ctrOpts += '<option value="__general__">Site General Only</option>';
  }

  var h = '<div id="pdf-picker-overlay" style="position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;">';
  h += '<div style="background:white;border-radius:12px;padding:24px 32px;box-shadow:0 8px 32px rgba(0,0,0,.3);min-width:340px;max-width:440px;">';
  h += '<div style="font-size:18px;font-weight:700;color:#1C2333;margin-bottom:16px;">Export PDF Report</div>';

  // Report type
  h += '<div style="margin-bottom:14px;"><label style="font-weight:600;font-size:13px;color:#4A5568;display:block;margin-bottom:4px;">Report Type</label>';
  h += '<select id="pdf-type" style="width:100%;padding:8px;border:1.5px solid #DDE1E7;border-radius:6px;font-size:14px;font-family:Calibri,sans-serif;">';
  h += '<option value="field">Field Review Report (with drawings)</option>';
  h += '<option value="plain">Deficiency Report (no drawings)</option>';
  h += '</select></div>';

  // Contractor filter
  h += '<div style="margin-bottom:14px;"><label style="font-weight:600;font-size:13px;color:#4A5568;display:block;margin-bottom:4px;">Contractor Filter</label>';
  h += '<select id="pdf-ctr-filter" style="width:100%;padding:8px;border:1.5px solid #DDE1E7;border-radius:6px;font-size:14px;font-family:Calibri,sans-serif;">' + ctrOpts + '</select></div>';

  // Checkboxes
  h += '<div style="margin-bottom:6px;"><label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#1C2333;cursor:pointer;">';
  h += '<input type="checkbox" id="pdf-final-comm"> Final Commissioning (suppress future note)</label></div>';
  h += '<div style="margin-bottom:16px;"><label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#1C2333;cursor:pointer;">';
  h += '<input type="checkbox" id="pdf-show-closed" checked> Include Closed Items Summary</label></div>';

  // Buttons
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
  h += '<button id="pdf-cancel" style="padding:8px 20px;background:#F5F5F5;color:#4A5568;border:1px solid #DDE1E7;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;font-family:Calibri,sans-serif;">Cancel</button>';
  h += '<button id="pdf-go" style="padding:8px 24px;background:#1A237E;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;">\uD83D\uDCC4 Generate PDF</button>';
  h += '</div></div></div>';

  var div = document.createElement('div');
  div.innerHTML = h;
  var overlay = div.firstChild;
  document.body.appendChild(overlay);

  // Wire buttons
  overlay.querySelector('#pdf-cancel').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#pdf-go').addEventListener('click', function() {
    var type = document.getElementById('pdf-type').value;
    var ctrFilter = document.getElementById('pdf-ctr-filter').value;
    var isFinalComm = document.getElementById('pdf-final-comm').checked;
    var showClosedSummary = document.getElementById('pdf-show-closed').checked;
    overlay.remove();
    initPDFExport.generate(type, {
      ctrFilter: ctrFilter,
      isFinalComm: isFinalComm,
      showClosedSummary: showClosedSummary
    });
  });
}

// ── Boot Sequence ────────────────────────────────────────
function boot() {
  console.log('[FRT v2] Booting...');
  var t0 = performance.now();

  // 1. Restore preferences (sync — before first paint)
  restoreDarkMode();
  restoreTextSize();

  // 2. Load logo (async)
  loadLogo();

  // 3. Detect Hub mode
  var mode = detectHubMode();

  // 4. Wire all event listeners
  wireEvents();

  // 5. Initialize IDB then load project
  IDB.init().then(function() {
    console.log('[FRT v2] IDB ready');

    if (_hubMode && _projectId) {
      // Hub mode: authenticate, then pull from cloud
      return Auth.restoreSession().then(function(user) {
        if (user) {
          console.log('[FRT v2] Authenticated as:', user.email);
          // Show sign-out button
          var soBtn = document.getElementById('btn-signout');
          if (soBtn) soBtn.style.display = '';
          var mso = document.getElementById('mobile-signout-btn');
          if (mso) mso.style.display = '';
          // Read instance from URL
          var params = new URLSearchParams(window.location.search);
          var instanceId = params.get('instance');
          return SyncEngine.pull(_projectId, instanceId);
        } else {
          console.warn('[FRT v2] No auth session — trying IDB');
          return Model.loadLastProject().then(function(ok) { return ok ? Model.getProject() : null; });
        }
      }).then(function(data) {
        if (!data && !Model.getProject()) {
          // No cloud data and no IDB — create empty project
          Model.newProject();
          console.log('[FRT v2] Created new project for Hub');
        }
      });
    } else {
      // Standalone: load from IDB
      return Model.loadLastProject().then(function(loaded) {
        if (!loaded) {
          Model.newProject();
          console.log('[FRT v2] Created new empty project');
        }
      });
    }
  }).then(function() {
    // Show project view and render
    showProjectView();
    _updateHeaderForProject();
    switchTab('info');

    // Start auto-save
    Model.startAutoSave();

    // In Hub mode: start cloud sync heartbeat
    if (_hubMode && _projectId) {
      _startCloudSync();
    }

    var elapsed = (performance.now() - t0).toFixed(0);
    console.log('[FRT v2] Boot complete in ' + elapsed + 'ms');

  }).catch(function(err) {
    console.error('[FRT v2] Boot error:', err);
    // Even if IDB fails, show the UI with a new project
    Model.newProject();
    showProjectView();
    _updateHeaderForProject();
    switchTab('info');
  });

  // Update header whenever a new project is loaded (e.g., JSON import)
  Model.onChange('project', function() {
    _updateHeaderForProject();
  });
}

// ── Start ────────────────────────────────────────────────
boot();

// ── Debug exports ────────────────────────────────────────
window._frt = {
  Model: Model,
  IDB: IDB,
  SyncEngine: SyncEngine,
  R2: R2,
  Auth: Auth,
  toast: toast,
  switchTab: switchTab,
  toggleDarkMode: toggleDarkMode,
  version: '2.0.0-alpha',
  phase: '1-A'
};
