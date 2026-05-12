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
import './data/merge.js'; // S123 P6A — registers window._frt_mergeDiag for diagnostic / Push B usage
import { applyResolutions as mergeApplyResolutions } from './data/merge.js';
import { R2 } from './data/r2.js';
import { TileCache } from './data/tileCache.js';
import { Presence } from './data/presence.js';
import { Auth } from './shared/auth.js';
import { toast } from './shared/toast.js';
import { showConfirm, showAlert, showPrompt, showTypeToConfirm, showConflictModal } from './shared/dialogs.js';
import { initProjectInfo } from './ui/projectInfo.js';
import { initDeficiencies } from './ui/deficiencies.js';
import { initDrawings } from './ui/drawings.js';
import { initPhotos } from './ui/photos.js';
import { initPins } from './ui/pins.js';
import { initViewer } from './viewer/viewer.js';
import { Markup } from './viewer/markup.js';
import { initPDFExport } from './export/pdf.js';
import { initJSONExport } from './export/json.js';
import { AIAssist } from './ai/assistant.js';
// ── Side-effect imports ──
// These modules don't expose anything app.js calls directly, but their
// loading has side effects we depend on:
//   - lightbox.js: sets window._frtLightbox at module-eval time. Used by
//     photos.js, deficiencies.js, viewer.js for thumb-click lightbox open.
//   - markup.js: exports initMarkup which is also auto-attached to viewer.
//     The viewer's drawing-overlay markup tools come from here.
// Push 11 erroneously dropped these as "unused"; restored in Push 13. The
// integrity scanner from Push 9 catches data issues but not module-load
// side-effect dependencies — added a comment for the next reviewer.
import './ui/lightbox.js';
import './viewer/markup.js';
import { AIUsage } from './ai/usage.js';

// ── Constants ────────────────────────────────────────────
var LS_DARK = 'arencon-frt-dark';
var LS_TEXT_SIZE = 'arencon-text-size';
var TEXT_SIZES = ['S', 'L'];
var TEXT_CLASSES = { S: 'text-m', L: 'text-l' };
var TEXT_LABELS = { S: 'Small', L: 'Large' };

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

// ── S123 Push 6B: SyncEngine conflict-handler wiring ──────────────────
//
// SyncEngine has two callback hooks (onConflict, onSilentMerge) that
// are no-ops by default. We wire them here at module-load time so the
// merge-engine pipeline in sync.js has something to call when a 412
// hits.
//
// onConflict: 412 + merge produced true field-clashes → show modal,
//             let user resolve, hand back merged + resolutions.
//
// onSilentMerge: 412 + merge produced ZERO conflicts → no modal,
//             just a passive toast so the user knows a sync happened.

SyncEngine.onConflict = function(conflicts, mergeResult) {
  return showConflictModal(conflicts, mergeResult).then(function(userChoice) {
    if (!userChoice) return null;  // user cancelled
    // userChoice = { resolutions: [{path, chosen}, ...], merged: {...} }
    // Apply each resolution to the base merged object to produce the final result.
    var finalMerged = mergeApplyResolutions(mergeResult, userChoice.resolutions);
    return { merged: finalMerged };
  });
};

SyncEngine.onSilentMerge = function(mergeResult) {
  // Passive notification — sync happened in the background, no decision
  // required. Toast is the right channel; don't block the UI.
  try {
    toast('\u2713 Synced \u2014 merged changes from another inspector', 'info', 4000);
  } catch (e) {
    console.log('[Sync] Silent merge — ' + (mergeResult && mergeResult.conflicts ? mergeResult.conflicts.length : 0) + ' conflicts');
  }
};

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
  // S82: sun/moon icons as base64-embedded PNGs matching user-supplied reference
  // images exactly. Rendered at 22px so they match the ~14px font-size buttons.
  var sunSVG = '<img src="data:image/png;base64,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" width="22" height="22" alt="Light mode" style="vertical-align:middle;display:inline-block;">';
  var moonSVG = '<img src="data:image/png;base64,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" width="22" height="22" alt="Dark mode" style="vertical-align:middle;display:inline-block;">';
  var icon = isDark ? moonSVG : sunSVG;
  var dt = document.getElementById('dark-toggle');
  if (dt) dt.innerHTML = icon;
  var dvdt = document.getElementById('dv-dark-toggle');
  if (dvdt) dvdt.innerHTML = icon;
  var mdt = document.getElementById('mobile-dark-btn');
  if (mdt) mdt.innerHTML = icon;
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
  if (TEXT_SIZES.indexOf(size) < 0) size = 'S';
  document.body.classList.remove('text-m', 'text-l');
  var cls = TEXT_CLASSES[size];
  if (cls) document.body.classList.add(cls);
  var btn = document.getElementById('btn-text-size');
  if (btn) btn.textContent = size;
  var mob = document.getElementById('mobile-text-size-btn');
  if (mob) mob.textContent = 'Text: ' + TEXT_LABELS[size];
}

function restoreTextSize() {
  applyTextSize(localStorage.getItem(LS_TEXT_SIZE) || 'S');
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

function closeMoreMenu() {
  var m = document.getElementById('more-menu');
  if (m) m.classList.remove('open');
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

  // Mobile Reset Project
  var mobileReset = document.getElementById('mobile-reset-btn');
  if (mobileReset) mobileReset.addEventListener('click', function() {
    closeMobileMenu();
    _resetProject();
  });

  // Mobile repair toggle
  var mobileRepairToggle = document.getElementById('mobile-repair-toggle');
  if (mobileRepairToggle) mobileRepairToggle.addEventListener('click', function() {
    var tools = document.getElementById('mobile-repair-tools');
    if (tools) tools.style.display = tools.style.display === 'none' ? '' : 'none';
  });

  // Mobile PDF
  var mobilePdf = document.getElementById('mobile-pdf-btn');
  if (mobilePdf) mobilePdf.addEventListener('click', function() {
    closeMobileMenu(); _openPDFPicker();
  });

  // More menu buttons — delegate
  var moreMenu = document.getElementById('more-menu');
  if (moreMenu) {
    moreMenu.querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var text = btn.textContent || '';
        closeMoreMenu();
        if (text.indexOf('Re-upload') >= 0) _reuploadAll();
        else if (text.indexOf('Reset Current') >= 0) _resetCurrentTab();
        else if (text.indexOf('Reset Entire') >= 0) _resetProject();
      });
    });
  }
}

// ── Reset Helpers ───────────────────────────────────────
// S119 Push H: type-to-confirm for high-risk resets. Both _resetProject
// and _resetCurrentTab nuke significant data (whole project / entire tab
// category). A simple confirm dialog isn't enough friction to prevent
// accidental loss. User must type DELETE before the OK button enables.
function _resetProject() {
  showTypeToConfirm(
    'Reset entire project',
    'This will permanently delete ALL project data — drawings, deficiencies, photos, and everything else. This cannot be undone.'
  ).then(function(yes) {
    if (yes) {
      Model.newProject();
      _updateHeaderForProject();
      switchTab('info');
      toast('Project reset');
    }
  });
}

function _resetCurrentTab() {
  var activeTab = document.querySelector('.nav-tab.active');
  var tab = activeTab ? activeTab.dataset.tab : 'info';
  // Match the destructive scope to a clear message per tab.
  var msg;
  if (tab === 'drawings') msg = 'This will permanently delete every drawing in this project.';
  else if (tab === 'photos') msg = 'This will permanently delete every photo in this project.';
  else if (tab === 'deficiencies') msg = 'This will permanently delete every contractor and every deficiency in this project.';
  else msg = 'This will clear all data from the "' + tab + '" tab.';
  showTypeToConfirm('Reset ' + tab + ' tab', msg + ' This cannot be undone.').then(function(yes) {
    if (yes) {
      var proj = Model.getProject();
      if (!proj) return;
      if (tab === 'drawings') { proj.drawings = []; }
      else if (tab === 'photos') { proj.photos = []; }
      else if (tab === 'deficiencies') { proj.contractors = []; proj.generalDeficiencies = []; }
      Model.saveNow();
      Model._notify('project', proj);
      toast(tab + ' data cleared');
    }
  });
}

function _reuploadAll() {
  var pid = new URLSearchParams(window.location.search).get('project');
  if (!pid) { toast('Only available in Hub mode'); return; }
  var proj = Model.getProject();
  if (!proj) return;
  toast('Re-uploading all files to R2...');
  var count = 0;
  // Upload all drawings missing r2Url
  var chain = Promise.resolve();
  (proj.drawings || []).forEach(function(d) {
    if (!d.r2Url) {
      chain = chain.then(function() {
        return IDB.get('drawingBlobs', d.id).then(function(rec) {
          if (rec && rec.dataBlob) {
            count++;
            return R2.uploadDrawing(pid, d, rec.dataBlob);
          }
        });
      });
    }
  });
  // Upload all photos missing r2Url
  function _walkPhotos(photos) {
    (photos || []).forEach(function(ph) {
      if (!ph.r2Url && ph.dataUrl) {
        chain = chain.then(function() {
          count++;
          return R2.uploadPhoto(pid, ph, 'original');
        });
      }
    });
  }
  _walkPhotos(proj.photos);
  (proj.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(function(d) {
      (d.observations || []).forEach(function(o) { _walkPhotos(o.photos); });
    });
  });
  chain.then(function() {
    Model.saveNow();
    toast('Re-upload complete: ' + count + ' files');
  });
}

// ── QR Code ─────────────────────────────────────────────
function _showQR() {
  var url = window.location.href;
  var h = '<div id="qr-overlay" style="position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;">';
  h += '<div style="background:white;border-radius:12px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.3);text-align:center;max-width:340px;">';
  h += '<div style="font-size:16px;font-weight:700;margin-bottom:12px;">Scan to Open</div>';
  h += '<div id="qr-canvas" style="margin:0 auto 12px;"></div>';
  h += '<div style="font-size:11px;color:#718096;word-break:break-all;margin-bottom:12px;">' + url + '</div>';
  h += '<button id="qr-close" style="padding:8px 24px;background:#455A64;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-family:Calibri,sans-serif;">Close</button>';
  h += '</div></div>';
  var div = document.createElement('div'); div.innerHTML = h;
  var overlay = div.firstChild; document.body.appendChild(overlay);
  overlay.querySelector('#qr-close').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  // Load qrcodejs if not already loaded
  if (typeof QRCode !== 'undefined') {
    new QRCode(overlay.querySelector('#qr-canvas'), { text: url, width: 200, height: 200 });
  } else {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = function() { new QRCode(overlay.querySelector('#qr-canvas'), { text: url, width: 200, height: 200 }); };
    s.onerror = function() {
      var c = overlay.querySelector('#qr-canvas');
      if (c) c.innerHTML = '<div style="padding:20px;color:#C0392B;">QR library failed to load</div>';
    };
    document.head.appendChild(s);
  }
}

// ── Storage Usage Display ───────────────────────────────
function _updateStorageDisplay() {
  if (!navigator.storage || !navigator.storage.estimate) return;
  navigator.storage.estimate().then(function(est) {
    var usedMB = Math.round((est.usage || 0) / 1024 / 1024);
    var totalMB = Math.round((est.quota || 0) / 1024 / 1024);
    var pct = totalMB > 0 ? Math.round(usedMB / totalMB * 100) : 0;
    var fill = document.querySelector('.storage-bar-fill');
    if (fill) fill.style.width = pct + '%';
    var label = document.querySelector('.storage-label');
    if (label) label.textContent = usedMB + 'MB / ' + totalMB + 'MB (' + pct + '%)';
    var mobText = document.getElementById('mobile-storage-text');
    if (mobText) mobText.textContent = usedMB + ' MB used / ' + totalMB + ' MB available';
    var mobBar = document.getElementById('mobile-storage-bar');
    if (mobBar) mobBar.style.width = pct + '%';
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

// ── Inspector System ─────────────────────────────────────
var LS_INSPECTOR = 'ARENCON_FR_Inspector';
var LS_INSPECTOR_HISTORY = 'ARENCON_FR_InspectorHist';

function getInspectorName() { return localStorage.getItem(LS_INSPECTOR) || ''; }

function _updateInspectorChip() {
  var name = getInspectorName();
  var chip = document.getElementById('inspector-chip-name');
  if (chip) chip.textContent = name || 'Set Name';
}

function _showInspectorModal() {
  // S116 Push 8: in Hub mode the inspector identity is auto-derived from the
  // authenticated user's profiles.full_name. Editing it here would create
  // local drift between what the chip displays and what the user actually
  // is in Supabase. Bail out silently if the chip is locked.
  var chip = document.getElementById('inspector-chip');
  if (chip && chip.classList.contains('inspector-chip-locked')) {
    var current = getInspectorName();
    toast('Inspector is set from your account: ' + (current || 'unknown') + ' \u2014 sign out to change it', 'info');
    return;
  }
  var current = getInspectorName();
  var histRaw = localStorage.getItem(LS_INSPECTOR_HISTORY) || '[]';
  var history = [];
  try { history = JSON.parse(histRaw); } catch(e) {}

  var _isDark = document.body.classList.contains('dark-mode');
  var _bg = _isDark ? '#1e2533' : 'white';
  var _fg = _isDark ? '#d0d8f0' : '#1a202c';
  var _bdr = _isDark ? '#3a4050' : '#DDE1E7';
  var _inputBg = _isDark ? '#151a24' : 'white';
  var _labelCol = _isDark ? '#8a94b0' : '#718096';
  var _cancelBg = _isDark ? '#2a3040' : '#f5f5f5';
  var _cancelFg = _isDark ? '#d0d8f0' : '#4A5568';

  var h = '<div id="insp-overlay" style="position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;">';
  h += '<div style="background:' + _bg + ';color:' + _fg + ';border-radius:12px;padding:24px 28px;box-shadow:0 8px 32px rgba(0,0,0,.3);min-width:300px;max-width:380px;width:90%;">';
  h += '<div style="font-size:16px;font-weight:700;margin-bottom:12px;color:' + _fg + ';">Inspector</div>';
  h += '<input type="text" id="insp-input" value="' + (current || '').replace(/"/g,'&quot;') + '" placeholder="Your name" style="width:100%;padding:8px;border:1.5px solid ' + _bdr + ';border-radius:6px;font-size:14px;font-family:Calibri,sans-serif;box-sizing:border-box;margin-bottom:8px;background:' + _inputBg + ';color:' + _fg + ';">';
  if (history.length) {
    h += '<div style="font-size:11px;font-weight:600;color:' + _labelCol + ';margin-bottom:4px;">Recent:</div>';
    history.forEach(function(n) {
      h += '<div class="insp-hist-item" data-name="' + n.replace(/"/g,'&quot;') + '" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:4px;cursor:pointer;margin-bottom:2px;">';
      h += '<span style="flex:1;font-size:13px;">' + n + '</span>';
      h += '<button class="insp-hist-del" data-name="' + n.replace(/"/g,'&quot;') + '" style="border:none;background:none;color:' + _labelCol + ';cursor:pointer;font-size:14px;padding:0;">✕</button>';
      h += '</div>';
    });
  }
  h += '<div style="display:flex;gap:8px;margin-top:12px;">';
  h += '<button id="insp-ok" class="btn-muted-ok">Apply</button>';
  h += '<button id="insp-cancel" class="btn-muted-cancel">Cancel</button>';
  h += '</div></div></div>';

  var div = document.createElement('div');
  div.innerHTML = h;
  var overlay = div.firstChild;
  document.body.appendChild(overlay);

  var input = overlay.querySelector('#insp-input');
  function _applyInspector() {
    var name = input.value.trim();
    if (name) {
      localStorage.setItem(LS_INSPECTOR, name);
      var hist = [];
      try { hist = JSON.parse(localStorage.getItem(LS_INSPECTOR_HISTORY) || '[]'); } catch(e) {}
      hist = hist.filter(function(n) { return n !== name; });
      hist.unshift(name);
      if (hist.length > 5) hist = hist.slice(0, 5);
      localStorage.setItem(LS_INSPECTOR_HISTORY, JSON.stringify(hist));
      Model.updateField('inspectorName', name);
    }
    _updateInspectorChip();
    overlay.remove();
  }
  overlay.querySelector('#insp-ok').addEventListener('click', _applyInspector);
  overlay.querySelector('#insp-cancel').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') _applyInspector(); if (e.key === 'Escape') overlay.remove(); });
  overlay.querySelectorAll('.insp-hist-item').forEach(function(el) {
    el.addEventListener('click', function(e) {
      if (e.target.classList.contains('insp-hist-del')) return;
      input.value = el.getAttribute('data-name');
    });
  });
  overlay.querySelectorAll('.insp-hist-del').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var name = el.getAttribute('data-name');
      var hist = [];
      try { hist = JSON.parse(localStorage.getItem(LS_INSPECTOR_HISTORY) || '[]'); } catch(e) {}
      hist = hist.filter(function(n) { return n !== name; });
      localStorage.setItem(LS_INSPECTOR_HISTORY, JSON.stringify(hist));
      overlay.remove();
      _showInspectorModal();
    });
  });
  input.focus();
  input.select();
}

// ── FRT Instance Management ─────────────────────────────
function _updateFrtInstanceIndicator() {
  var proj = Model.getProject();
  if (!proj) return;
  var inst = proj.currentFrtInstance || 1;
  var badge = document.getElementById('pb-inst');
  if (badge) {
    badge.textContent = 'FRT #' + inst;
    badge.style.display = '';
  }
}

function _showNewInstanceDialog() {
  var proj = Model.getProject();
  if (!proj) return;
  var cur = proj.currentFrtInstance || 1;
  var next = cur + 1;
  showConfirm('New FRT Instance',
    'Create FRT #' + next + '? This starts a new visit. Existing deficiencies carry forward. New deficiencies will be marked as noted on FRT #' + next + '.'
  ).then(function(yes) {
    if (yes) {
      proj.currentFrtInstance = next;
      proj.info.visitDate = new Date().toISOString().split('T')[0];
      Model.saveNow();
      _updateFrtInstanceIndicator();
      toast('FRT #' + next + ' created');
    }
  });
}

// ── Project Rename ──────────────────────────────────────
function _showRenameDialog() {
  var proj = Model.getProject();
  if (!proj) return;
  var current = proj.info.customFilename || Model.getSmartFilename();
  showPrompt('Rename Project', 'Custom filename:', current).then(function(name) {
    if (name !== null && name !== undefined) {
      proj.info.customFilename = name.trim();
      Model.saveNow();
      _updateHeaderForProject();
      toast('Renamed');
    }
  });
}

// ── Leave Dialog (3-button, Hub mode) ───────────────────
function _showLeaveDialog(destUrl) {
  var h = '<div id="leave-overlay" style="position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;">';
  h += '<div style="background:white;border-radius:12px;padding:24px 28px;box-shadow:0 8px 32px rgba(0,0,0,.3);min-width:300px;max-width:380px;width:90%;">';
  h += '<div style="text-align:center;margin-bottom:16px;">';
  h += '<div style="font-size:32px;margin-bottom:8px;">\uD83D\uDCBE</div>';
  h += '<div style="font-size:14px;color:#718096;">You have unsaved changes.</div>';
  h += '</div>';
  h += '<div style="display:flex;flex-direction:column;gap:8px;">';
  h += '<button id="leave-save" class="btn-muted-ok" style="width:100%;">Save & Leave</button>';
  h += '<button id="leave-nosave" class="btn-muted-neutral" style="width:100%;">Leave without saving</button>';
  h += '<button id="leave-cancel" class="btn-muted-cancel" style="width:100%;">Cancel \u2014 go back</button>';
  h += '</div></div></div>';

  var div = document.createElement('div');
  div.innerHTML = h;
  var overlay = div.firstChild;
  document.body.appendChild(overlay);

  overlay.querySelector('#leave-save').addEventListener('click', function() {
    Model.saveNow().then(function() {
      if (_hubMode && _projectId) return SyncEngine.push(_projectId);
    }).then(function() {
      overlay.remove();
      window.location.href = destUrl;
    });
  });
  overlay.querySelector('#leave-nosave').addEventListener('click', function() {
    overlay.remove();
    window.location.href = destUrl;
  });
  overlay.querySelector('#leave-cancel').addEventListener('click', function() {
    overlay.remove();
  });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}
function handleBeforeUnload(e) {
  // S125 hotfix 8 — Flush in-progress markup to Model+IDB before unload
  // EVEN IN HUB MODE. Hub mode deliberately skips the browser "unsaved
  // changes?" popup (it would interrupt every navigation), but the
  // markup module's _objects[] was previously only persisted on
  // Markup.destroy(). A Ctrl+Shift+R while a drawing was open lost the
  // strokes entirely.
  try {
    if (Markup && Markup.saveNow) Markup.saveNow();
  } catch(_) {}
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
    var rev = (proj.info && proj.info.revision) || 'A01';
    var parsed = _parseRevision(rev);
    var st = parsed.issued ? (parsed.hasSuffix ? 'REVISION' : 'ISSUED') : 'DRAFT';
    pbBadge.textContent = st;
    var colors = { DRAFT: '#E67E22', ISSUED: '#1A7A4A', REVISION: '#E67E22' };
    pbBadge.style.background = colors[st] || '#E67E22';
    pbBadge.style.cursor = 'pointer';
  }

  // Toggle header buttons: hide dashboard, show project
  var dashBtns = ['btn-load', 'btn-export-all'];
  var projBtns = ['btn-pdf', 'btn-issue', 'btn-more-wrap', 'btn-qr', 'btn-ai-review'];
  dashBtns.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  projBtns.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  // Show AI usage button for all users (everyone tracks their own project costs)
  var aiUsageBtn = document.getElementById('btn-ai-usage');
  if (aiUsageBtn) aiUsageBtn.style.display = '';
  var aiUsageMore = document.getElementById('btn-ai-usage-more');
  if (aiUsageMore) aiUsageMore.style.display = '';

  // Show mobile AI buttons
  var mar = document.getElementById('mobile-ai-rewrite');
  if (mar) mar.style.display = '';
  var maq = document.getElementById('mobile-ai-quickfix');
  if (maq) maq.style.display = '';
  var mau = document.getElementById('mobile-ai-usage');
  if (mau) mau.style.display = '';

  // Show repair section for admin
  var repairSec = document.getElementById('more-repair-section');
  if (repairSec) repairSec.style.display = '';
  var mobileRepair = document.getElementById('mobile-repair-section');
  if (mobileRepair) mobileRepair.style.display = '';

  // Update page title
  document.title = 'ARENCON \u2014 ' + Model.getSmartFilename();

  // Update inspector chip
  _updateInspectorChip();

  // Update FRT instance indicator
  _updateFrtInstanceIndicator();
}

// ── Cloud Sync (Hub Mode) ────────────────────────────────
var _cloudSyncTimer = null;
var _cloudSyncInterval = 15000; // S82: 15s heartbeat (was 30s) for cross-device freshness

// S82: Periodic pull — detects other inspectors' changes
var _cloudPullTimer = null;
var _cloudPullInterval = 30000; // 30s — lightweight updated_at check
var _lastPulledUpdatedAt = null; // ISO timestamp; updated on every successful pull

function _startCloudSync(didLoad) {
  if (_cloudSyncTimer) clearInterval(_cloudSyncTimer);

  // S81: reflect actual boot state — don't lie about cloud load if auth failed.
  // Caller passes whether a cloud pull actually succeeded.
  var user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
  if (didLoad && user){
    _setCloudStatus('synced', 'Loaded from cloud');
    // Initialize periodic-pull baseline so the first poll doesn't false-positive
    if (typeof SyncEngine !== 'undefined' && SyncEngine.getRemoteUpdatedAt && _projectId){
      SyncEngine.getRemoteUpdatedAt(_projectId, SyncEngine.instanceId).then(function(ts){
        if (ts) _lastPulledUpdatedAt = ts;
      });
    }
    // S96 Fix #3: silent L0-L2 auto-prefetch for THIS project only.
    // Pulls overview + readable-zoom tiers (~30-60 MB for typical 10-drawing
    // project) so drawings work offline at field-readable zoom without any
    // user action. Deep zoom (L3/L4) requires the explicit Hub
    // "Download for Offline" button.
    setTimeout(_autoPrefetchTiles, 800);
  } else if (!user){
    _setCloudStatus('error', 'Not signed in — tap for details');
  } else {
    _setCloudStatus('pending', 'No cloud data for this project yet');
  }

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

  // Also do periodic sync (push)
  _cloudSyncTimer = setInterval(_pushToCloud, _cloudSyncInterval);
  console.log('[FRT v2] Cloud sync started (push every ' + _cloudSyncInterval / 1000 + 's)');

  // S82: Start periodic pull for cross-inspector visibility
  _startCloudPull();
}

// ─── S82: Periodic pull + context-aware banner ──────────────────
function _startCloudPull(){
  if (_cloudPullTimer) clearInterval(_cloudPullTimer);
  if (!_hubMode || !_projectId) return;
  _cloudPullTimer = setInterval(_checkRemoteForChanges, _cloudPullInterval);
  console.log('[FRT v2] Cloud pull started (poll every ' + _cloudPullInterval / 1000 + 's)');
}

// ─── S96 Fix #3: Tile auto-prefetch (L0-L2 only, current project only) ──
var _tilePrefetchAbort = null;
var _tilePrefetchActive = false;
function _autoPrefetchTiles() {
  if (!_hubMode || !_projectId || _tilePrefetchActive) return;
  var proj = (typeof Model !== 'undefined' && Model.getProject) ? Model.getProject() : null;
  if (!proj || !proj.drawings || !proj.drawings.length) return;
  // Only drawings that have been server-rendered (have manifestUrl/tileServer
  // set, or are recognizably tile-mode). We skip image-only drawings — those
  // already have full offline support via the existing R2 prefetch path.
  var tiled = proj.drawings.filter(function(d) {
    return d && d.id && (d.manifestUrl || d.tileServer || d.pdfTiled || d.serverRendered);
  });
  if (!tiled.length) return;

  _tilePrefetchActive = true;
  _tilePrefetchAbort = { aborted: false };
  _setTilePrefetchBadge('Caching offline tiles… 0/' + tiled.length);
  TileCache.autoPrefetchProject(_projectId, tiled, function(p) {
    var pct = p.total > 0 ? Math.round(p.done * 100 / p.total) : 0;
    _setTilePrefetchBadge('Caching ' + p.drawingIndex + '/' + p.drawingCount + ' (' + pct + '%)');
  }, _tilePrefetchAbort).then(function(res) {
    _tilePrefetchActive = false;
    _tilePrefetchAbort = null;
    if (res && res.aborted) {
      _setTilePrefetchBadge('');
    } else {
      _setTilePrefetchBadge('✓ Offline ready', 3500);
    }
  }).catch(function() {
    _tilePrefetchActive = false;
    _tilePrefetchAbort = null;
    _setTilePrefetchBadge('');
  });
}

// Subtle bottom-right indicator. Does not block UI.
function _setTilePrefetchBadge(msg, fadeAfterMs) {
  var b = document.getElementById('tile-prefetch-badge');
  if (!msg) {
    if (b && b.parentNode) b.parentNode.removeChild(b);
    return;
  }
  if (!b) {
    b = document.createElement('div');
    b.id = 'tile-prefetch-badge';
    b.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9000;background:rgba(28,36,52,.92);color:#cdd5e8;font:12px/1.3 Calibri,sans-serif;padding:6px 12px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;transition:opacity .4s ease-out;';
    document.body.appendChild(b);
  }
  b.style.opacity = '1';
  b.textContent = msg;
  if (fadeAfterMs) setTimeout(function() {
    if (b && b.parentNode) {
      b.style.opacity = '0';
      setTimeout(function() { if (b && b.parentNode) b.parentNode.removeChild(b); }, 600);
    }
  }, fadeAfterMs);
}

function _checkRemoteForChanges(){
  if (!_hubMode || !_projectId) return;
  var user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
  if (!user) return;
  if (typeof SyncEngine === 'undefined' || !SyncEngine.getRemoteUpdatedAt) return;
  SyncEngine.getRemoteUpdatedAt(_projectId, SyncEngine.instanceId).then(function(remoteTs){
    if (!remoteTs) return;
    if (!_lastPulledUpdatedAt){ _lastPulledUpdatedAt = remoteTs; return; }
    if (remoteTs <= _lastPulledUpdatedAt) return; // nothing new
    // Remote has newer data than our last pull
    var hasLocal = (typeof Model !== 'undefined' && Model.hasUnsavedChanges) ? Model.hasUnsavedChanges() : false;
    if (!hasLocal){
      // Silent pull — no risk of losing local edits
      console.log('[FRT v2] Remote newer (' + remoteTs + ') and no local changes — silent pull');
      SyncEngine.pull(_projectId, SyncEngine.instanceId).then(function(data){
        if (data) {
          _lastPulledUpdatedAt = remoteTs;
          _setCloudStatus('synced', 'Refreshed from cloud');
        }
      });
    } else {
      // Local dirty — show banner, let user decide
      _showRemoteUpdateBanner(remoteTs);
    }
  });
}

function _showRemoteUpdateBanner(remoteTs){
  // Don't stack banners
  if (document.getElementById('frt-remote-update-banner')) return;
  var b = document.createElement('div');
  b.id = 'frt-remote-update-banner';
  b.style.cssText =
    'position:fixed;top:60px;left:50%;transform:translateX(-50%);' +
    'z-index:99999;background:#1B2438;color:#fff;border:1px solid #9C2742;' +
    'border-radius:8px;padding:10px 14px;font:14px Calibri,sans-serif;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.4);display:flex;align-items:center;gap:12px;' +
    'max-width:90vw;';
  b.innerHTML =
    '<span>☁️ Another inspector saved changes. You have unsaved edits.</span>' +
    '<button id="frt-banner-pull" style="background:#9C2742;color:#fff;border:none;border-radius:6px;padding:6px 12px;font:600 13px Calibri,sans-serif;cursor:pointer;">Pull now</button>' +
    '<button id="frt-banner-dismiss" style="background:transparent;color:#c8ccd4;border:1px solid #3a4660;border-radius:6px;padding:6px 10px;font:13px Calibri,sans-serif;cursor:pointer;">Dismiss</button>';
  document.body.appendChild(b);
  document.getElementById('frt-banner-pull').addEventListener('click', function(){
    // S120 Push 14: switched from native confirm() to showConfirm modal.
    // Native confirm() doesn't match the rest of the app's dialog style
    // and the project standard is "no native confirm/alert/prompt".
    showConfirm('Pull from cloud?', 'Pulling will overwrite your unsaved local changes. Continue?').then(function(yes) {
      if (!yes) return;
      SyncEngine.pull(_projectId, SyncEngine.instanceId).then(function(data){
        if (data) { _lastPulledUpdatedAt = remoteTs; _setCloudStatus('synced', 'Refreshed from cloud'); }
        b.remove();
      });
    });
  });
  document.getElementById('frt-banner-dismiss').addEventListener('click', function(){
    _lastPulledUpdatedAt = remoteTs; // suppress for this remote version
    b.remove();
  });
}

function _pushToCloud() {
  if (!_hubMode || !_projectId) return;
  // S81: don't claim to push if auth is missing — shows "Not signed in" instead
  var user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
  if (!user){
    _setCloudStatus('error', 'Not signed in — tap for details');
    return;
  }
  _setCloudStatus('saving', 'Syncing...');
  SyncEngine.push(_projectId).then(function(row) {
    if (row) {
      _setCloudStatus('synced', 'Saved to cloud');
      // S82: update periodic-pull baseline so banner doesn't fire for our own push
      if (row.updated_at) _lastPulledUpdatedAt = row.updated_at;
    } else {
      _setCloudStatus('pending', 'Saved locally');
    }
  }).catch(function(err) {
    console.warn('[FRT v2] Cloud push failed:', err);
    _setCloudStatus('error', 'Sync failed');
  });
}

// S81: persist last status so the diagnostic popup can display it
var _lastCloudStatus = 'synced';
var _lastCloudText   = 'Saved to cloud';
// S114 P3: timestamp of last successful cloud round-trip. Drives the "Last sync: X ago"
// indicator next to the cloud dot. Updated every time _setCloudStatus is called with 'synced'.
var _lastSyncedAt = 0;

function _formatTimeAgo(ms) {
  var sec = Math.floor(ms / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return sec + 's ago';
  var min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  var hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  var day = Math.floor(hr / 24);
  return day + 'd ago';
}

function _updateLastSyncIndicator() {
  var el = document.getElementById('last-sync-text');
  // S116 Push 14: also mirror onto the drawing-viewer header.
  var dvEl = document.getElementById('dv-last-sync-text');
  if (!el && !dvEl) return;
  if (!_lastSyncedAt) {
    if (el) { el.textContent = ''; el.style.display = 'none'; }
    if (dvEl) { dvEl.textContent = ''; dvEl.style.display = 'none'; }
    return;
  }
  var diff = Date.now() - _lastSyncedAt;
  var label = '\u00B7 last sync: ' + _formatTimeAgo(diff);
  // Color-coded freshness — muted palette per Mark's color rule
  var color = diff < 60000 ? '#5F8068'    // muted green: <1 min
            : diff < 300000 ? '#B07F5A'   // muted amber: 1-5 min
            : '#A85959';                   // muted red:   >5 min
  if (el) {
    el.style.display = '';
    el.textContent = label;
    el.style.color = color;
  }
  if (dvEl) {
    dvEl.style.display = '';
    dvEl.textContent = label;
    dvEl.style.color = color;
  }
}

// Update the "X ago" text every 30s
setInterval(_updateLastSyncIndicator, 30000);

// ─── S117-A: Presence chip rendering ────────────────────────────────────
// Shows "👥 N here" pill in main header when other users are active in this
// project. Click → modal listing names. Hidden when nobody else is here.
function _renderPresenceChip(others) {
  var chip = document.getElementById('presence-chip');
  if (!chip) return;
  var n = (others || []).length;
  if (!n) {
    chip.style.display = 'none';
    return;
  }
  chip.style.display = 'inline-flex';
  var label = document.getElementById('presence-chip-text');
  if (label) label.textContent = n + ' other' + (n === 1 ? '' : 's') + ' here';
  // Build tooltip + click-modal content from names
  var names = others.map(function(o){
    var nm = (o.full_name || '').trim();
    if (!nm) nm = (o.user_id || '').slice(0, 8);
    return nm;
  });
  chip.title = 'Also here: ' + names.join(', ');
  chip.onclick = function() {
    if (typeof showAlert === 'function') {
      showAlert('Currently in this project:\n\n• ' + names.join('\n• '));
    }
  };
}
window._renderPresenceChip = _renderPresenceChip;

function _setCloudStatus(status, text) {
  _lastCloudStatus = status;
  _lastCloudText   = text || '';
  if (status === 'synced') _lastSyncedAt = Date.now();
  var dot = document.getElementById('cloud-dot');
  var label = document.getElementById('cloud-status-text');
  var wrap = document.getElementById('cloud-status');
  if (wrap) wrap.style.display = 'flex';
  // S116 Push 16: don't blank the text when status updates with empty text —
  // Mark image 1 showed "(dot)  · last sync: just now" with no "Saved to cloud"
  // between them, creating a weird gap. The label slot was rendered as empty
  // string rather than fallback text. Now: empty text falls back to a status-
  // appropriate default.
  var dvText = document.getElementById('dv-cloud-text');
  var safeText = text || (
    status === 'synced'  ? 'Saved to cloud' :
    status === 'saving'  ? 'Saving…'        :
    status === 'pending' ? 'Pending sync'   :
    status === 'offline' ? 'Offline'        :
    status === 'error'   ? 'Sync error'     :
    'Saved to cloud'
  );
  if (label) label.textContent = safeText;
  if (dvText) dvText.textContent = safeText;
  var colors = { synced: '#34D399', saving: '#FBBF24', pending: '#F59E0B', error: '#EF4444', offline: '#9CA3AF' };
  var color = colors[status] || '#9CA3AF';
  if (dot) dot.style.background = color;
  // Mirror on the project-bar mini dot
  var pbDot = document.getElementById('pb-cloud-dot');
  if (pbDot) pbDot.style.background = color;
  // S81: mirror on the drawing-viewer header dot
  var dvDot = document.getElementById('dv-cloud-dot');
  if (dvDot) dvDot.style.background = color;
  // Refresh "X ago" immediately when status changes
  _updateLastSyncIndicator();
}

// S81 mobile-friendly diagnostic — tapping the cloud dot opens a large popup
// showing everything that matters for "why isn't this working?" triage.
// Replaces the impossible-to-read header text on small phones.
function _showCloudDiagnostic() {
  var lines = [];
  // Mode + project
  var params = new URLSearchParams(window.location.search);
  var pidParam = params.get('project');
  lines.push('MODE: ' + (_hubMode ? 'Hub (cloud)' : 'Standalone (local only)'));
  lines.push('URL ?project= : ' + (pidParam ? pidParam.slice(0, 8) + '…' : '(missing)'));
  lines.push('');
  // Auth
  var user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
  var token = null;
  try { token = localStorage.getItem('sb-access-token'); } catch(_){}
  lines.push('AUTH:');
  lines.push('  Signed in: ' + (user ? 'YES (' + (user.email || '?') + ')' : 'NO'));
  lines.push('  Token in localStorage: ' + (token ? 'present (len=' + token.length + ')' : 'MISSING'));
  lines.push('');
  // Cloud status
  lines.push('CLOUD STATUS:');
  lines.push('  ' + _lastCloudStatus + ' — ' + _lastCloudText);
  lines.push('  Online: ' + (navigator.onLine ? 'YES' : 'NO'));
  try {
    if (typeof SyncEngine !== 'undefined' && SyncEngine.instanceId) {
      lines.push('  Instance ID: ' + String(SyncEngine.instanceId).slice(0, 8) + '…');
    } else {
      lines.push('  Instance ID: (none loaded)');
    }
  } catch(_){}
  lines.push('');
  // Project content
  var proj = (typeof Model !== 'undefined' && Model.getProject) ? Model.getProject() : null;
  lines.push('PROJECT DATA:');
  if (proj) {
    var nDrawings = (proj.drawings || []).length;
    var nDefics = 0;
    try {
      if (typeof Model.getAllDeficiencies === 'function') nDefics = Model.getAllDeficiencies().length;
    } catch(_){}
    lines.push('  Name: ' + (proj.projectName || proj.name || '(unnamed)'));
    lines.push('  Project #: ' + (proj.projectNumber || '-'));
    lines.push('  Drawings: ' + nDrawings);
    lines.push('  Deficiencies: ' + nDefics);
  } else {
    lines.push('  (no project loaded)');
  }
  lines.push('');
  // Service worker + build
  lines.push('APP VERSION:');
  lines.push('  SW cache: see console');
  lines.push('  User agent: ' + (navigator.userAgent || '').slice(0, 60));

  // Render as a fixed overlay (not alert() because Chrome Android may truncate it)
  var prior = document.getElementById('cloud-diag-overlay');
  if (prior) prior.parentNode.removeChild(prior);
  var ov = document.createElement('div');
  ov.id = 'cloud-diag-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px;';
  var panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;color:#1C2333;max-width:520px;width:100%;max-height:80vh;overflow:auto;border-radius:12px;padding:16px 18px;font-family:Calibri,sans-serif;font-size:14px;box-shadow:0 12px 40px rgba(0,0,0,.4);';
  var closeHtml = '<button id="cloud-diag-close" class="btn-muted-cancel" style="position:sticky;top:0;float:right;">Close</button>';
  var hdr = '<div style="font-size:16px;font-weight:700;color:#9C2742;margin-bottom:10px;">FRT Diagnostic</div>';
  var body = '<pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Menlo,monospace;font-size:12px;margin:0;">' + lines.join('\n').replace(/[<>&]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;'}[c];}) + '</pre>';
  var signInBtn = '';
  if (_hubMode && !user){
    signInBtn = '<div style="margin-top:14px;"><button id="cloud-diag-signin" class="btn-muted-ok" style="width:100%;">Not signed in — Open Hub to sign in</button></div>';
  }
  panel.innerHTML = closeHtml + hdr + body + signInBtn;
  ov.appendChild(panel);
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if (e.target === ov) ov.parentNode.removeChild(ov); });
  panel.querySelector('#cloud-diag-close').addEventListener('click', function(){ ov.parentNode.removeChild(ov); });
  var signIn = panel.querySelector('#cloud-diag-signin');
  if (signIn) signIn.addEventListener('click', function(){ window.location.href = '../ARENCON_Project_Hub.html'; });
}
// Expose globally for inline onclick / console poking
window._showCloudDiagnostic = _showCloudDiagnostic;

// ── Sign Out ─────────────────────────────────────────────
function _signOut() {
  showConfirm('Sign Out', 'Sign out of your ARENCON account?').then(function(yes) {
    if (yes) {
      try { Presence.stop(); } catch(_){} // S117-A
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

  // Inspector chip
  var inspChip = document.getElementById('inspector-chip');
  if (inspChip) inspChip.addEventListener('click', _showInspectorModal);

  // FRT Instance badge (click to create new)
  var instBadge = document.getElementById('pb-inst');
  if (instBadge) instBadge.addEventListener('click', _showNewInstanceDialog);
  instBadge && (instBadge.style.cursor = 'pointer');

  // Project filename rename
  var pbFn = document.getElementById('pb-filename');
  if (pbFn) {
    pbFn.style.cursor = 'pointer';
    pbFn.title = 'Click to rename project';
    pbFn.addEventListener('click', _showRenameDialog);
  }

  // Back button with leave dialog
  var backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.addEventListener('click', function(e) {
    e.preventDefault();
    var logoLink = document.getElementById('logo-link');
    var destUrl = logoLink ? logoLink.href : '../index.html';
    if (_hubMode && Model.hasUnsavedChanges()) {
      _showLeaveDialog(destUrl);
    } else {
      window.location.href = destUrl;
    }
  });

  // Logo click with leave dialog in Hub mode
  var logoLink = document.getElementById('logo-link');
  if (logoLink) logoLink.addEventListener('click', function(e) {
    if (_hubMode && Model.hasUnsavedChanges()) {
      e.preventDefault();
      _showLeaveDialog(logoLink.href);
    }
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

  // QR Code button
  var qrBtn = document.getElementById('btn-qr');
  if (qrBtn) qrBtn.addEventListener('click', _showQR);
  var mobileQr = document.getElementById('mobile-qr-btn');
  if (mobileQr) mobileQr.addEventListener('click', function() { closeMobileMenu(); _showQR(); });

  // AI Review buttons
  var aiBtn = document.getElementById('btn-ai-review');
  if (aiBtn) aiBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var m = document.getElementById('ai-mode-menu');
    if (m) m.classList.toggle('open');
  });
  var aiRewrite = document.getElementById('ai-mode-rewrite');
  if (aiRewrite) aiRewrite.addEventListener('click', function() {
    var m = document.getElementById('ai-mode-menu');
    if (m) m.classList.remove('open');
    AIAssist.reviewAll('rewrite');
  });
  var aiQuickfix = document.getElementById('ai-mode-quickfix');
  if (aiQuickfix) aiQuickfix.addEventListener('click', function() {
    var m = document.getElementById('ai-mode-menu');
    if (m) m.classList.remove('open');
    AIAssist.reviewAll('quickfix');
  });
  // Mobile AI buttons
  var mobileAiR = document.getElementById('mobile-ai-rewrite');
  if (mobileAiR) mobileAiR.addEventListener('click', function() { closeMobileMenu(); AIAssist.reviewAll('rewrite'); });
  var mobileAiQ = document.getElementById('mobile-ai-quickfix');
  if (mobileAiQ) mobileAiQ.addEventListener('click', function() { closeMobileMenu(); AIAssist.reviewAll('quickfix'); });
  // AI Usage button
  var aiUsageBtn = document.getElementById('btn-ai-usage');
  if (aiUsageBtn) aiUsageBtn.addEventListener('click', function() { AIUsage.open(); });
  var mobileAiU = document.getElementById('mobile-ai-usage');
  if (mobileAiU) mobileAiU.addEventListener('click', function() { closeMobileMenu(); AIUsage.open(); });
  var aiUsageMore = document.getElementById('btn-ai-usage-more');
  if (aiUsageMore) aiUsageMore.addEventListener('click', function() { var m=document.getElementById('more-menu'); if(m)m.classList.remove('open'); AIUsage.open(); });
  // Close AI mode menu on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest || !e.target.closest('#btn-ai-wrap')) {
      var m = document.getElementById('ai-mode-menu');
      if (m) m.classList.remove('open');
    }
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

  var h = '<div id="pdf-picker-overlay" style="position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;">';
  h += '<div style="background:var(--bg,white);border-radius:12px;padding:24px 32px;box-shadow:0 8px 32px rgba(0,0,0,.3);min-width:340px;max-width:440px;color:var(--fg,#1B2438);">';
  h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Export PDF Report</div>';

  // Report type
  h += '<div style="margin-bottom:14px;"><label style="font-weight:600;font-size:13px;color:var(--steel,#4A5568);display:block;margin-bottom:4px;">Report Type</label>';
  h += '<select id="pdf-type" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-family:Calibri,sans-serif;background:var(--bg,white);color:var(--fg);">';
  h += '<option value="field">Field Review Report (with drawings)</option>';
  h += '<option value="plain">Deficiency Report (no drawings)</option>';
  h += '</select></div>';

  // Contractor filter
  h += '<div style="margin-bottom:14px;"><label style="font-weight:600;font-size:13px;color:var(--steel,#4A5568);display:block;margin-bottom:4px;">Contractor Filter</label>';
  h += '<select id="pdf-ctr-filter" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-family:Calibri,sans-serif;background:var(--bg,white);color:var(--fg);">' + ctrOpts + '</select></div>';

  // Checkboxes
  h += '<div style="margin-bottom:6px;"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">';
  h += '<input type="checkbox" id="pdf-final-comm"> Final Commissioning (suppress future note)</label></div>';
  h += '<div style="margin-bottom:16px;"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">';
  h += '<input type="checkbox" id="pdf-show-closed" checked> Include Closed Items Summary</label></div>';

  // Buttons
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
  h += '<button id="pdf-go" class="btn-muted-ok">\uD83D\uDCC4 Generate PDF</button>';
  h += '<button id="pdf-cancel" class="btn-muted-cancel">Cancel</button>';
  h += '</div></div></div>';

  var div = document.createElement('div');
  div.innerHTML = h;
  var overlay = div.firstChild;
  document.body.appendChild(overlay);

  // Wire buttons
  overlay.querySelector('#pdf-cancel').addEventListener('click', function() { overlay.remove(); });
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
          // S83: push user id into Model so newly-created entities get createdBy
          if (Model.setCurrentUser) Model.setCurrentUser(user.id);
          // S116 Push 8: pull full_name from profiles table — Mark reported
          // the inspector chip showed "MHE" (stale localStorage) instead of
          // his real name, because the FRT was reading email.split('@')[0]
          // even when an authenticated profile existed. Now: profiles.full_name
          // wins, then user_metadata.full_name, then email prefix as last
          // resort. Lock the chip in Hub mode so the user can't edit a name
          // that's auto-derived from their account.
          Auth.request('/rest/v1/profiles?id=eq.' + user.id + '&select=full_name').then(function(rows) {
            var fullName = (rows && rows[0] && rows[0].full_name) ? String(rows[0].full_name).trim() : '';
            if (!fullName) {
              var meta = user.user_metadata || {};
              fullName = (meta.full_name || '').trim();
            }
            if (!fullName) {
              fullName = (user.email || '').split('@')[0].toUpperCase();
            }
            localStorage.setItem(LS_INSPECTOR, fullName);
            _updateInspectorChip();
            // Lock chip in Hub mode — inspector identity is the authenticated
            // user's real name. Free-form editing in standalone mode still
            // works (no project URL param = no auth path).
            var chip = document.getElementById('inspector-chip');
            if (chip) {
              chip.classList.add('inspector-chip-locked');
              chip.title = 'Inspector: ' + fullName + ' (signed in)';
            }
            // S117-A: kick off presence heartbeat. Self-disables silently if
            // the project_presence table doesn't exist yet (i.e. before Mark
            // deploys supabase/project_presence.sql).
            try { Presence.start(_projectId, user, fullName); } catch(_){}
            try { Presence.onChange(_renderPresenceChip); } catch(_){}
          }).catch(function(e){
            console.warn('[FRT v2] Could not load profiles.full_name:', e);
            // Fallback: email prefix
            var emailPrefix = (user.email || '').split('@')[0];
            if (emailPrefix) {
              localStorage.setItem(LS_INSPECTOR, emailPrefix);
              _updateInspectorChip();
            }
            // S117-A: still try to start presence with the fallback name
            try { Presence.start(_projectId, user, emailPrefix || ''); } catch(_){}
            try { Presence.onChange(_renderPresenceChip); } catch(_){}
          });
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
          // S81: don't silently create an empty project — Mark spent 10 min
          // figuring out why the Samsung showed nothing. Route to Hub login so
          // they can re-auth and come back.
          console.warn('[FRT v2] No auth session — redirecting to Hub login');
          var returnUrl = encodeURIComponent(window.location.href);
          window.location.href = '../ARENCON_Project_Hub.html?returnTo=' + returnUrl;
          return null;
        }
      }).then(function(data) {
        if (!data && !Model.getProject()) {
          // No cloud data and no IDB — create empty project
          Model.newProject();
          console.log('[FRT v2] Created new project for Hub');
        }
        window._frtCloudLoaded = !!data;
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

    // Rebuild missing R2 URLs (safety net for sync issues)
    var proj = Model.getProject();
    if (proj) R2.rebuildUrls(proj);

    // Start auto-save
    Model.startAutoSave();

    // In Hub mode: start cloud sync heartbeat + process pending R2 uploads
    if (_hubMode && _projectId) {
      _startCloudSync(!!window._frtCloudLoaded);
      R2.processPendingUploads(_projectId);
    }

    var elapsed = (performance.now() - t0).toFixed(0);
    console.log('[FRT v2] Boot complete in ' + elapsed + 'ms');

    // Update storage display
    _updateStorageDisplay();

    // Show mobile PDF button in project mode
    var mp = document.getElementById('mobile-pdf-btn');
    if (mp) mp.style.display = '';
    var mq = document.getElementById('mobile-qr-btn');
    if (mq && _hubMode) mq.style.display = '';

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

// ── Project-level Undo (Ctrl+Z) ─────────────────────────
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    // Skip if markup undo handled it (markup handler runs first and stops propagation)
    if (!Model.hasUndo()) return;
    e.preventDefault();
    var entry = Model.undoLast();
    if (entry) {
      toast('Undo: restored deficiency #' + entry.defic.num);
      // Refresh visible UI
      if (typeof initDeficiencies !== 'undefined' && initDeficiencies.render) initDeficiencies.render();
    }
  }
});

// S114 Push 4: Global Escape handler — closes popup modals in priority order.
// Runs at CAPTURE phase so it fires BEFORE markup.js's drawing-viewer Escape.
// If no modal is open, does nothing → markup.js handles drawing-viewer state.
// Drawing viewer itself is treated as a navigation tab and is NEVER closed by Escape.
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;

  // S120 Push 7: layered Esc behavior — inner-state checks fire FIRST, so a
  // pin-editor selection mode or open More-menu intercepts Esc without
  // closing the pin editor itself. The drawing viewer is never closed by
  // Esc (S114 design). Order matters: most-specific first.

  // (1) Pin editor: open "More ▾" menu → close menu only
  var moreMenu = document.getElementById('pe-more-menu');
  if (moreMenu && moreMenu.style.display !== 'none' && moreMenu.offsetParent !== null) {
    moreMenu.style.display = 'none';
    var moreBtn = document.getElementById('pe-more-btn');
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  // (2) Pin editor: photo selection mode → exit selection only (don't close
  //     the pin editor). Trigger the cancel pseudo-button so the existing
  //     _peExitSelectionMode logic runs and re-renders the photo zone.
  if (typeof window._peSelectionModeIsActive === 'function' && window._peSelectionModeIsActive()) {
    if (typeof window._peExitSelectionMode === 'function') {
      window._peExitSelectionMode();
      e.stopPropagation();
      e.preventDefault();
      return;
    }
  }

  // Priority order: most-recently-opened first
  var modalIds = [
    'gp-overlay',              // gallery picker (P1.8)
    'activity-modal-overlay',  // Add Activity / Contractor Response / ARENCON Comment
    'ph-reassign-overlay',     // S121: photo reassign confirm (photos.js)
    'pin-editor-overlay',      // pin editor
    'ai-fs-overlay',           // AI full-screen field selector
    'ai-ps-overlay',           // legacy AI photo-suggest modal
    'insp-overlay',            // inspector picker
    'qr-overlay',              // QR code overlay
    'leave-overlay'            // 3-button leave dialog
  ];
  for (var i = 0; i < modalIds.length; i++) {
    var el = document.getElementById(modalIds[i]);
    if (!el) continue;
    var visible = el.offsetParent !== null && el.style.display !== 'none';
    if (!visible) continue;
    // Pin editor uses display:none toggle; everything else gets removed from DOM
    if (modalIds[i] === 'pin-editor-overlay') el.style.display = 'none';
    else if (el.parentNode) el.parentNode.removeChild(el);
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  // Also handle the AI Review popover (anchored, not modal)
  var aiPop = document.getElementById('ai-review-pop');
  if (aiPop && aiPop.parentNode) {
    aiPop.parentNode.removeChild(aiPop);
    e.stopPropagation();
    return;
  }
  // No modal open → fall through. markup.js's handler will see this Escape if
  // the drawing viewer is open and clear active-tool / selection (without closing the viewer).
}, true);  // capture phase

// ═══════════════════════════════════════════════════════
//  ISSUE SYSTEM — DRAFT → ISSUED → REVISION
// ═══════════════════════════════════════════════════════

function _parseRevision(rev) {
  var m;
  // B##A## pattern (revision of issued)
  m = rev.match(/^([B-Z])(\d{2,})A(\d{2,})$/);
  if (m) return { issued: true, hasSuffix: true, letter: m[1], major: parseInt(m[2]), suffixNum: parseInt(m[3]) };
  // B## pattern (issued)
  m = rev.match(/^([B-Z])(\d{2,})$/);
  if (m) return { issued: true, hasSuffix: false, letter: m[1], major: parseInt(m[2]), suffixNum: 0 };
  // A## pattern (draft)
  m = rev.match(/^A(\d{2,})$/);
  if (m) return { issued: false, hasSuffix: false, letter: 'A', major: parseInt(m[1]), suffixNum: 0 };
  return { issued: false, hasSuffix: false, letter: 'A', major: 1, suffixNum: 0 };
}

function _calcIssueRevision(parsed) {
  if (!parsed.issued) return 'B01';
  if (parsed.hasSuffix) {
    var next = parsed.major + 1;
    return parsed.letter + (next < 10 ? '0' : '') + next;
  }
  var next2 = parsed.major + 1;
  return parsed.letter + (next2 < 10 ? '0' : '') + next2;
}

function _calcRevertDraft(proj) {
  var highest = 0;
  var info = proj.info || {};
  if (info._lastDraftNum) { highest = info._lastDraftNum; }
  else {
    var m = (info.revision || '').match(/^A(\d+)$/);
    if (m) highest = parseInt(m[1]);
  }
  var next = highest + 1;
  return 'A' + (next < 10 ? '0' : '') + next;
}

function _issueReport() {
  var proj = Model.getProject();
  if (!proj) { toast('No project loaded'); return; }
  var rev = (proj.info && proj.info.revision) || 'A01';
  var parsed = _parseRevision(rev);
  var isDark = document.body.classList.contains('dark-mode');
  var bg = isDark ? '#1e2533' : '#fff';
  var fg = isDark ? '#d0d8f0' : '#1C2333';
  var fg2 = isDark ? '#8a94b0' : '#4A5568';
  var bdr = isDark ? '#2a3040' : '#DDE1E7';

  var modal = document.createElement('div');
  modal.id = 'issue-modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';

  var html = '<div style="background:' + bg + ';border-radius:12px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,.25);color:' + fg + ';">';
  html += '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">\uD83D\uDCCB Report Status</div>';
  html += '<div style="font-size:calc(13px + var(--ts));color:' + fg2 + ';margin-bottom:20px;">Current revision: <b style="color:' + fg + ';">' + rev + '</b></div>';

  // Option 1: Issue
  var issueTarget = _calcIssueRevision(parsed);
  html += '<button data-issue-action="issue" data-rev="' + issueTarget + '" class="btn-muted-ok" style="width:100%;margin-bottom:10px;text-align:left;padding:12px 16px;font-size:calc(14px + var(--ts));">';
  html += '\uD83D\uDCCB Issue Report<span style="float:right;font-weight:400;opacity:.85;">' + rev + ' \u2192 <b>' + issueTarget + '</b></span></button>';

  // Option 2: Revise (only if issued B## without A suffix)
  if (parsed.issued && !parsed.hasSuffix) {
    var reviseTarget = rev + 'A01';
    html += '<button data-issue-action="revise" data-rev="' + reviseTarget + '" class="btn-muted-warn" style="width:100%;font-size:calc(14px + var(--ts));margin-bottom:10px;text-align:left;padding:12px 16px;">';
    html += '\u270F\uFE0F Revise Issued Report<span style="float:right;font-weight:400;opacity:.85;">' + rev + ' \u2192 <b>' + reviseTarget + '</b></span></button>';
  }

  // Option 3: Revert to draft (only if B-series)
  if (parsed.issued) {
    var draftTarget = _calcRevertDraft(proj);
    html += '<button data-issue-action="revert" data-rev="' + draftTarget + '" class="btn-muted-neutral" style="width:100%;font-size:calc(14px + var(--ts));margin-bottom:10px;text-align:left;padding:12px 16px;">';
    html += '\u21A9\uFE0F Revert to Draft<span style="float:right;font-weight:400;opacity:.85;">' + rev + ' \u2192 <b>' + draftTarget + '</b></span></button>';
  }

  // Cancel
  html += '<button data-issue-action="cancel" class="btn-muted-cancel" style="width:100%;margin-top:4px;">Cancel</button>';
  html += '</div>';
  modal.innerHTML = html;

  // Delegated click handler
  modal.addEventListener('click', function(e) {
    if (e.target === modal) { modal.remove(); return; }
    var btn = e.target.closest('[data-issue-action]');
    if (!btn) return;
    var act = btn.getAttribute('data-issue-action');
    var newRev = btn.getAttribute('data-rev') || '';
    modal.remove();
    if (act === 'issue') _doIssue(newRev);
    else if (act === 'revise') _doRevise(newRev);
    else if (act === 'revert') _doRevertDraft(newRev);
  });

  document.body.appendChild(modal);
}

function _doIssue(newRev) {
  var proj = Model.getProject();
  if (!proj) return;
  var curRev = (proj.info && proj.info.revision) || 'A01';
  var draftMatch = curRev.match(/^A(\d+)$/);
  if (draftMatch) {
    if (!proj.info) proj.info = {};
    proj.info._lastDraftNum = parseInt(draftMatch[1]);
  }
  proj.info.revision = newRev;
  proj.info.dateOfIssue = new Date().toISOString().substring(0, 10);
  proj.status = 'issued';
  Model.saveNow();
  _updateHeaderForProject();
  // Update revision field if visible
  var revEl = document.querySelector('[data-field="revision"]');
  if (revEl) revEl.value = newRev;
  var doiEl = document.querySelector('[data-field="dateOfIssue"]');
  if (doiEl) doiEl.value = proj.info.dateOfIssue;
  // Update Supabase status
  _syncIssueStatus('issued');
  toast('Report issued as ' + newRev);
}

function _doRevise(newRev) {
  var proj = Model.getProject();
  if (!proj) return;
  if (!proj.info) proj.info = {};
  proj.info.revision = newRev;
  proj.status = 'draft';
  Model.saveNow();
  _updateHeaderForProject();
  var revEl = document.querySelector('[data-field="revision"]');
  if (revEl) revEl.value = newRev;
  _syncIssueStatus('revision');
  toast('Revision started: ' + newRev);
}

function _doRevertDraft(newRev) {
  var proj = Model.getProject();
  if (!proj) return;
  if (!proj.info) proj.info = {};
  proj.info.revision = newRev;
  proj.status = 'draft';
  Model.saveNow();
  _updateHeaderForProject();
  var revEl = document.querySelector('[data-field="revision"]');
  if (revEl) revEl.value = newRev;
  _syncIssueStatus('draft');
  toast('Reverted to draft: ' + newRev);
}

function _syncIssueStatus(status) {
  if (typeof SyncEngine !== 'undefined' && SyncEngine.instanceId) {
    Auth.request('/rest/v1/tool_data?id=eq.' + SyncEngine.instanceId, {
      method: 'PATCH',
      body: JSON.stringify({ status: status, updated_at: new Date().toISOString() }),
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }
    }).catch(function(e) { console.error('[Issue] Status sync failed:', e); });
  }
}

// Wire issue button + badge clicks
(function() {
  var btnIssue = document.getElementById('btn-issue');
  if (btnIssue) btnIssue.addEventListener('click', _issueReport);
  var pbBadge = document.getElementById('pb-badge');
  if (pbBadge) pbBadge.addEventListener('click', _issueReport);
})();

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
  initViewer: initViewer,
  Markup: Markup,
  switchTab: switchTab,
  toggleDarkMode: toggleDarkMode,
  version: '2.0.0-alpha',
  phase: '1-A'
};

// S83: Expose periodic-pull trigger for pull-to-refresh gesture in drawing viewer.
// Callers receive a Promise that resolves to { checked, remoteNewer, pulled } so
// UI indicators can show the right state.
window._frtCheckRemote = function(){
  return new Promise(function(resolve){
    if (!_hubMode || !_projectId) { resolve({ checked:false, remoteNewer:false, pulled:false, reason:'not-hub' }); return; }
    var user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
    if (!user) { resolve({ checked:false, remoteNewer:false, pulled:false, reason:'no-user' }); return; }
    if (typeof SyncEngine === 'undefined' || !SyncEngine.getRemoteUpdatedAt) {
      resolve({ checked:false, remoteNewer:false, pulled:false, reason:'no-sync' }); return;
    }
    SyncEngine.getRemoteUpdatedAt(_projectId, SyncEngine.instanceId).then(function(remoteTs){
      if (!remoteTs) { resolve({ checked:true, remoteNewer:false, pulled:false }); return; }
      if (!_lastPulledUpdatedAt){ _lastPulledUpdatedAt = remoteTs; resolve({ checked:true, remoteNewer:false, pulled:false }); return; }
      if (remoteTs <= _lastPulledUpdatedAt) { resolve({ checked:true, remoteNewer:false, pulled:false }); return; }
      var hasLocal = (typeof Model !== 'undefined' && Model.hasUnsavedChanges) ? Model.hasUnsavedChanges() : false;
      if (!hasLocal){
        SyncEngine.pull(_projectId, SyncEngine.instanceId).then(function(data){
          if (data){ _lastPulledUpdatedAt = remoteTs; _setCloudStatus('synced', 'Refreshed from cloud'); }
          resolve({ checked:true, remoteNewer:true, pulled:!!data });
        });
      } else {
        _showRemoteUpdateBanner(remoteTs);
        resolve({ checked:true, remoteNewer:true, pulled:false, dirtyLocal:true });
      }
    }).catch(function(){ resolve({ checked:false, remoteNewer:false, pulled:false, reason:'error' }); });
  });
};
