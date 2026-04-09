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
import { AIAssist } from './ai/assistant.js';
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
function _resetProject() {
  showConfirm('Reset Project', 'This will delete ALL project data. Are you sure?').then(function(yes) {
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
  showConfirm('Reset Tab', 'Clear all data from the "' + tab + '" tab?').then(function(yes) {
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
  h += '<button id="insp-ok" style="flex:1;padding:8px;background:#1A7A4A;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;">Apply</button>';
  h += '<button id="insp-cancel" style="padding:8px 16px;background:' + _cancelBg + ';color:' + _cancelFg + ';border:1px solid ' + _bdr + ';border-radius:6px;font-size:14px;cursor:pointer;font-family:Calibri,sans-serif;">Cancel</button>';
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
  h += '<button id="leave-save" style="width:100%;padding:11px;background:#1A7A4A;color:white;border:none;border-radius:8px;font-size:calc(13px + var(--ts));font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;">Save & Leave</button>';
  h += '<button id="leave-nosave" style="width:100%;padding:11px;background:#f9f9f9;color:#2C3E50;border:1.5px solid #CBD5E0;border-radius:8px;font-size:calc(13px + var(--ts));cursor:pointer;font-family:Calibri,sans-serif;">Leave without saving</button>';
  h += '<button id="leave-cancel" style="width:100%;padding:11px;background:white;color:#9C2742;border:1.5px solid #9C2742;border-radius:8px;font-size:calc(13px + var(--ts));font-weight:600;cursor:pointer;font-family:Calibri,sans-serif;">Cancel \u2014 go back</button>';
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
  h += '<button id="pdf-cancel" style="padding:8px 20px;background:var(--bg,white);color:var(--fg);border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;font-family:Calibri,sans-serif;">Cancel</button>';
  h += '<button id="pdf-go" style="padding:8px 24px;background:#1A237E;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;">\uD83D\uDCC4 Generate PDF</button>';
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
          // Set inspector from authenticated user
          var emailPrefix = (user.email || '').split('@')[0].toUpperCase();
          if (emailPrefix) {
            localStorage.setItem(LS_INSPECTOR, emailPrefix);
            _updateInspectorChip();
          }
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

    // Rebuild missing R2 URLs (safety net for sync issues)
    var proj = Model.getProject();
    if (proj) R2.rebuildUrls(proj);

    // Start auto-save
    Model.startAutoSave();

    // In Hub mode: start cloud sync heartbeat + process pending R2 uploads
    if (_hubMode && _projectId) {
      _startCloudSync();
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
  html += '<button data-issue-action="issue" data-rev="' + issueTarget + '" style="width:100%;padding:12px 16px;border:none;border-radius:8px;background:#1A7A4A;color:white;font-weight:700;font-size:calc(14px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;margin-bottom:10px;text-align:left;">';
  html += '\uD83D\uDCCB Issue Report<span style="float:right;font-weight:400;opacity:.85;">' + rev + ' \u2192 <b>' + issueTarget + '</b></span></button>';

  // Option 2: Revise (only if issued B## without A suffix)
  if (parsed.issued && !parsed.hasSuffix) {
    var reviseTarget = rev + 'A01';
    html += '<button data-issue-action="revise" data-rev="' + reviseTarget + '" style="width:100%;padding:12px 16px;border:none;border-radius:8px;background:#E67E22;color:white;font-weight:700;font-size:calc(14px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;margin-bottom:10px;text-align:left;">';
    html += '\u270F\uFE0F Revise Issued Report<span style="float:right;font-weight:400;opacity:.85;">' + rev + ' \u2192 <b>' + reviseTarget + '</b></span></button>';
  }

  // Option 3: Revert to draft (only if B-series)
  if (parsed.issued) {
    var draftTarget = _calcRevertDraft(proj);
    html += '<button data-issue-action="revert" data-rev="' + draftTarget + '" style="width:100%;padding:12px 16px;border:none;border-radius:8px;background:' + bdr + ';color:' + fg + ';font-weight:700;font-size:calc(14px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;margin-bottom:10px;text-align:left;border:1.5px solid ' + bdr + ';">';
    html += '\u21A9\uFE0F Revert to Draft<span style="float:right;font-weight:400;opacity:.85;">' + rev + ' \u2192 <b>' + draftTarget + '</b></span></button>';
  }

  // Cancel
  html += '<button data-issue-action="cancel" style="width:100%;padding:10px 16px;border:1.5px solid ' + fg2 + ';border-radius:8px;background:none;color:' + fg2 + ';font-weight:600;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;margin-top:4px;">Cancel</button>';
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
  Model.save();
  _updateProjectUI();
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
  Model.save();
  _updateProjectUI();
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
  Model.save();
  _updateProjectUI();
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
  switchTab: switchTab,
  toggleDarkMode: toggleDarkMode,
  version: '2.0.0-alpha',
  phase: '1-A'
};
