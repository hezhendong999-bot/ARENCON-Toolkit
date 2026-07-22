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
// S169 (Fix A foundation) — durable in-flight photo upload tracker.
// Imported here so the module loads (registers window.BinaryOutbox for
// DevTools diagnostic access) but is NOT yet invoked from any code
// path. Stub-only in S169; real behavior lands incrementally in
// S170+. See FIX_A_ARCHITECTURE.md.
import { BinaryOutbox } from './data/photoOutbox.js';
import { openCrbImport } from './export/crbImport.js'; // S463: CRB 1d return path
import { Auth } from './shared/auth.js';
import { buildHeader2 } from '../../lib/ui/headerEngine2.js';   /* S488 Wave 3: sealed header */
import { frtHeaderConfig } from '../../lib/ui/headerConfigs.js';
import { toast } from './shared/toast.js';
import { showConfirm, showAlert, showPrompt, showTypeToConfirm, showConflictModal, showDialog } from './shared/dialogs.js';
import { lockScroll, unlockScroll } from './shared/scrollLock.js';
import { initProjectInfo } from './ui/projectInfo.js';
import { initDeficiencies } from './ui/deficiencies.js';
import { initDrawings } from './ui/drawings.js';
import { initPhotos } from './ui/photos.js';
// S135: initPins/pins.js import removed — Summary tab retired.
// Table/Board views migrate into the Deficiencies tab in Phase 2.
import { initViewer } from './viewer/viewer.js';
import { Markup } from './viewer/markup.js';
import { initPDFExport } from './export/pdf.js';
import { initExportView } from './export/exportview.js'; // S145 P5: Export view replaces _openPDFPicker
import { initJSONExport } from './export/json.js';
import { initProjectDocsExport } from './export/projectDocs.adapter.js';
// S126 Phase D — memory + sync diagnostics. Pure instrumentation; no
// behavior change. Boot-time module load registers global window._frtDiag
// and starts the 60-second probe.
import { Diag } from './diag/memory.js';
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

// ── S165 Hub URL Helper ──────────────────────────────────
// Centralizes Hub link construction so the ?staging=1 flag propagates from
// FRT back to Hub on every navigation path. Without this, clicking the
// back button or sign-out drops the staging flag — Hub then loads in PROD
// mode and the warning banner disappears. Used by back-button, logo link,
// sign-out, cloud diag sign-in, and the auth-session-invalid redirect.
function _hubUrl(extraQuery) {
  var url = '../ARENCON_Project_Hub.html';
  var parts = [];
  if (extraQuery) parts.push(extraQuery);
  // S331: carry the current project id back so the Hub re-opens THIS project's
  // detail page instead of the top-level dashboard (the long-standing "Back
  // goes to main Hub" bug). Only add if not already in extraQuery.
  try {
    var _pid = new URLSearchParams(location.search).get('project');
    if (_pid && !(extraQuery && extraQuery.indexOf('project=') !== -1)) {
      parts.push('project=' + encodeURIComponent(_pid));
    }
  } catch(_) {}
  try {
    if (new URLSearchParams(location.search).get('staging') === '1') {
      parts.push('staging=1');
    }
  } catch(_) {}
  if (parts.length) url += '?' + parts.join('&');
  return url;
}

// S412 (navigation convention, Mark-approved): Back walks ONE tier up (tool ->
// project DETAIL page via _hubUrl's project= carry); the ARENCON logo jumps
// HOME (Hub dashboard, no project param). Two affordances, three tiers.
function _hubDashboardUrl() {
  var url = '../ARENCON_Project_Hub.html';
  try { if (new URLSearchParams(location.search).get('staging') === '1') url += '?staging=1'; } catch (_) {}
  return url;
}
// S412: ONE canonical leave flow for every back-like path (← button, tiered
// back-trap fall-through). Always guards unsaved changes with the 3-button
// dialog in Hub mode. Fixes a latent bug where the hub-mode ← handler
// navigated directly and bypassed the save dialog entirely.
function _leaveTool() {
  var dest = _hubMode ? _hubUrl() : '../index.html';
  // S489: leaving must consider BOTH local and cloud state. Model's _dirty
  // clears the moment IDB writes (~800ms), but the cloud push waits a
  // further 5s after that 'saved' event. In the window between the two the
  // app looked clean, skipped this dialog, and destroyed the tab with the
  // push still pending — the edit lived only in local IDB while carry-
  // forward (Hub-side, cloud-backed) read the STALE value. Mark's repro:
  // set an obs to Closed, hit Back immediately, create FRT #N+1 -> item
  // still Outstanding. _frtHasPendingCloudPush() exposes that pending state.
  _flushAndLeave(dest);   /* S489c: always flush (incl. the S489 pending-push case), never prompt */
}

// ── Hub Mode Detection ───────────────────────────────────
function detectHubMode() {
  var params = new URLSearchParams(window.location.search);
  var pid = params.get('project');
  if (pid) {
    _hubMode = true;
    _projectId = pid;
    /* S488 Wave 3: back-button + logo routing live in the sealed header now —
       _buildHeader() reads _hubMode and wires ctl.setHubMode + the S412
       save-guarded _leaveTool path. The old light-DOM pokes are gone. */
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
    case 'photos': initPhotos.render(); break;
  }
}

// S207: restore the tab + scroll the user was on before an update reload.
// Keys are written by _doUpdateReload() (the "Refresh" button). Consumed
// once and cleared, so a normal cold boot (no keys) still lands on 'info'.
// Valid tabs only; anything stale/unknown falls back to 'info'. Scroll is
// best-effort and deferred to the next frame so the panel has rendered.
function _restoreView() {
  var tab = null, scroll = 0;
  try {
    tab = sessionStorage.getItem('arencon-frt-restore-tab');
    scroll = parseInt(sessionStorage.getItem('arencon-frt-restore-scroll'), 10) || 0;
    sessionStorage.removeItem('arencon-frt-restore-tab');
    sessionStorage.removeItem('arencon-frt-restore-scroll');
  } catch(_) {}
  var valid = ['info', 'drawings', 'deficiencies', 'photos'];
  if (!tab || valid.indexOf(tab) < 0) { switchTab('info'); return; }
  switchTab(tab);
  if (scroll > 0) {
    requestAnimationFrame(function() {
      var panel = document.querySelector('.panel.active');
      var mw = document.querySelector('.main-wrap');
      if (panel && panel.scrollHeight > panel.clientHeight) panel.scrollTop = scroll;
      else if (mw) mw.scrollTop = scroll;
    });
  }
}

// ── Dark Mode ────────────────────────────────────────────
// S329 (Mark): with apple-mobile-web-app-status-bar-style=black-translucent, the
// iOS status-bar strip shows the ROOT (<html>) background, NOT the theme-color and
// NOT body's background. FRT painted body but left <html> unpainted, so the strip
// was white. Mirror body's ACTUAL computed background onto <html> (and theme-color)
// so the strip always matches the page in both modes — no hardcoded color guess,
// it follows whatever tokens are live (base or Bold overlay).
function _setThemeColor() {
  try {
    var bg = getComputedStyle(document.body).backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      bg = document.body.classList.contains('dark-mode') ? '#0b0a0d' : '#EFEDF0';
    }
    document.documentElement.style.background = bg;
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.setAttribute('content', bg);
  } catch (e) {}
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  var isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem(LS_DARK, isDark ? '1' : '0');
  updateDarkToggleIcon();
  _setThemeColor();
}

// S251b: REVERTED to Mark's original custom PNG sun/moon icons (S82 set),
// restored verbatim from pre-S250 history. The S250 emoji swap and the
// S251 outline-SVG were both unwanted. Mapping matches the original:
// dark mode shows the moon, light mode shows the sun (icon = current mode).
var _SUN_ICON = '<img src="data:image/png;base64,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" width="22" height="22" alt="Light mode" style="vertical-align:middle;display:inline-block;">';
var _MOON_ICON = '<img src="data:image/png;base64,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" width="22" height="22" alt="Dark mode" style="vertical-align:middle;display:inline-block;">';

function updateDarkToggleIcon() {
  var isDark = document.body.classList.contains('dark-mode');
  var icon = isDark ? _MOON_ICON : _SUN_ICON;
  if (_hdrCtl) _hdrCtl.setTheme(isDark ? 'dark' : 'light');   /* engine swaps its own sun/moon */
  var dvdt = document.getElementById('dv-dark-toggle');
  if (dvdt) dvdt.innerHTML = icon;
  var mdt = document.getElementById('mobile-dark-btn');
  if (mdt) mdt.innerHTML = icon;
}

function restoreDarkMode() {
  if (localStorage.getItem(LS_DARK) === '1') document.body.classList.add('dark-mode');
  updateDarkToggleIcon();
  _setThemeColor();
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
  if (_hdrCtl) _hdrCtl.setControlIcon('ts', size);
  var mob = document.getElementById('mobile-text-size-btn');
  if (mob) mob.textContent = size;   // S479 (Mark, item I): same bare S/M/L as the header button — never a reworded label
}

function restoreTextSize() {
  applyTextSize(localStorage.getItem(LS_TEXT_SIZE) || 'S');
}

// ── Mobile Menu ──────────────────────────────────────────
function openMobileMenu() {
  var mm = document.getElementById('mobile-menu-overlay');
  if (mm && !mm.classList.contains('open')) { mm.classList.add('open'); lockScroll(); }
}

function closeMobileMenu() {
  var mm = document.getElementById('mobile-menu-overlay');
  if (mm && mm.classList.contains('open')) { mm.classList.remove('open'); unlockScroll(); }
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

  // Export Project Docs (ZIP: photos + JSON + README) — More menu + mobile
  var btnExportDocs = document.getElementById('btn-export-docs');
  if (btnExportDocs) btnExportDocs.addEventListener('click', function() {
    closeMoreMenu();
    initProjectDocsExport.run();
  });

  // Load button in More menu
  var btnLoadMore = document.getElementById('btn-load-more');
  if (btnLoadMore) btnLoadMore.addEventListener('click', function() {
    document.getElementById('load-input').click();
    closeMoreMenu();
  });

  // S161 P3: Diagnostics button in More menu — opens the existing
  // _showCloudDiagnostic modal. Previously the modal was only reachable
  // by tapping the small "Saved to cloud" header chip, which inspectors
  // didn't know was tappable. Dedicated button + extended modal (with
  // photo subsystem state) gives field-friendly diagnostic access.
  var btnDiag = document.getElementById('btn-diagnostics');
  if (btnDiag) btnDiag.addEventListener('click', function() {
    closeMoreMenu();
    if (typeof _showCloudDiagnostic === 'function') _showCloudDiagnostic();
  });

  // Mobile buttons
  var mobileExport = document.getElementById('mobile-export-btn');
  if (mobileExport) mobileExport.addEventListener('click', function() {
    initJSONExport.exportJSON();
    closeMobileMenu();
  });
  var mobileExportDocs = document.getElementById('mobile-export-docs-btn');
  if (mobileExportDocs) mobileExportDocs.addEventListener('click', function() {
    closeMobileMenu();
    initProjectDocsExport.run();
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
  // S497h: the mobile Repair rows had no handlers at all — every tap in the
  // drawer did nothing. They now call the SAME functions as the desktop menu,
  // each of which re-checks super-admin at runtime, so the tablet path is
  // neither more nor less privileged than the desktop one.
  (function _wireMobileRepair() {
    function _bind(id, fn) {
      var b = document.getElementById(id);
      if (b) b.addEventListener('click', function() {
        closeMobileMenu();   /* canonical helper — right id + unlockScroll */
        fn();
      });
    }
    _bind('mobile-reupload-btn', function() { _reuploadAll(); });
    _bind('mobile-repair-photos-btn', function() { _repairPhotos(); });
    _bind('mobile-r2cleanup-btn', function() { _r2CleanupMenu(); });
  })();

  // Mobile PDF — listener moved to the main wiring block (S462). A second
  // registration here stacked two export modals per click (double backdrop,
  // X needed twice). initExportView.open() is also idempotent now.

  // More menu buttons — delegate
  var moreMenu = document.getElementById('more-menu');
  if (moreMenu) {
    moreMenu.querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var text = btn.textContent || '';
        closeMoreMenu();
        if (text.indexOf('Re-upload') >= 0) _reuploadAll();
        else if (text.indexOf('Repair Photos') >= 0) _repairPhotos();
        else if (text.indexOf('Reset Current') >= 0) _resetCurrentTab();
        else if (text.indexOf('Reset Entire') >= 0) _resetProject();
      });
    });
  }

  // Mobile repair-tools delegate (Repair Photos lives here on mobile)
  var mobileRepairTools = document.getElementById('mobile-repair-tools');
  if (mobileRepairTools) {
    mobileRepairTools.querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var text = btn.textContent || '';
        if (text.indexOf('Repair Photos') >= 0) { closeMobileMenu(); _repairPhotos(); }
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

// ── S283: Photo Pool Repair (admin) ─────────────────────
// One-tap cleanup wrapping Model.repairPhotoPool. Flow: admin-gate → dry-run
// to preview counts → if nothing to fix, say so → else present the orphan
// choice (Re-home / Delete orphans / Cancel) with re-home as the safe default.
// Dedup always runs (always safe). Re-home is the recommended path (S265:
// re-home > delete for unique orphans). Field-verify gated — runs against the
// live project, saves via the model's normal cycle (push rides next sync).
function _r2CleanupMenu() {
  // S497h (Mark, "wire it") — the R2 Cleanup menu row was inert: it rendered
  // but onR2Cleanup was null, so tapping it did nothing. The engine has
  // existed since S124 at frt/js/diag/r2cleanup.js (loaded by index.html on
  // every page) but was console-only: scan() then deleteOrphans() twice
  // within 30s. This wraps it in the tool's own confirm UI — scan first,
  // show REAL counts and bytes, delete only on an explicit tap. Nothing is
  // deleted without Mark seeing exactly what and how much.
  if (!(Auth && Auth.isSuperAdmin && Auth.isSuperAdmin())) {
    showAlert('Restricted', 'R2 Cleanup is restricted to the administrator.');
    return;
  }
  var pid = new URLSearchParams(window.location.search).get('project');
  if (!pid) { showAlert('Hub mode only', 'R2 Cleanup needs a cloud project. Open this report from the Hub.'); return; }
  var C = window._r2cleanup;
  if (!C || typeof C.scan !== 'function') {
    showAlert('Unavailable', 'The cleanup engine did not load. Reload the page and try again.');
    return;
  }
  toast('Scanning cloud storage\u2026');
  Promise.resolve(C.scan()).then(function (inv) {
    if (!inv) { showAlert('Scan failed', 'Could not list cloud storage \u2014 this is usually a network or sign-in issue. Nothing was changed.'); return; }
    var o = inv.orphans || {};
    var n = ['photos','pdfbufs','tiles','other'].reduce(function (s, k) { return s + ((o[k] || []).length); }, 0);
    var bytes = ['photos','pdfbufs','tiles','other'].reduce(function (s, k) { return s + ((inv.orphanBytes || {})[k] || 0); }, 0);
    var mb = (bytes / 1048576);
    if (!n) {
      showAlert('Cloud storage is clean', 'Scanned ' + inv.totalR2Objects + ' file' + (inv.totalR2Objects === 1 ? '' : 's') + ' for this project. Nothing is orphaned \u2014 no action needed.');
      return;
    }
    var lines = [];
    if ((o.photos || []).length)  lines.push('\u2022 ' + o.photos.length + ' photo file' + (o.photos.length === 1 ? '' : 's') + ' no longer used by any deficiency');
    if ((o.pdfbufs || []).length) lines.push('\u2022 ' + o.pdfbufs.length + ' stored PDF' + (o.pdfbufs.length === 1 ? '' : 's') + ' whose drawing was removed');
    if ((o.tiles || []).length)   lines.push('\u2022 ' + o.tiles.length + ' drawing preview tile' + (o.tiles.length === 1 ? '' : 's') + ' from removed drawings');
    if ((o.other || []).length)   lines.push('\u2022 ' + o.other.length + ' other unrecognised file' + (o.other.length === 1 ? '' : 's'));
    var msg = 'Scanned ' + inv.totalR2Objects + ' cloud file' + (inv.totalR2Objects === 1 ? '' : 's') + ' for this project.\n\n'
            + 'Not referenced by anything in this report:\n' + lines.join('\n')
            + '\n\nTotal ' + n + ' file' + (n === 1 ? '' : 's') + ', about ' + (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB.'
            + '\n\nDeleting these frees cloud storage. It cannot be undone \u2014 but nothing still in use is touched.';
    showDialog({
      title: 'Clean up cloud storage',
      message: msg,
      buttons: [
        { label: 'Cancel', outline: true, action: function () {} },
        { label: 'Delete ' + n + ' file' + (n === 1 ? '' : 's'), color: '#C0445F', action: function () {
            toast('Deleting\u2026');
            // The engine arms on first call and deletes on the second within
            // 30s. Mark has already confirmed here, so drive both steps.
            Promise.resolve(C.deleteOrphans()).then(function () {
              return Promise.resolve(C.deleteOrphans());
            }).then(function (r) {
              if (r && typeof r.deleted === 'number') {
                toast('Deleted ' + r.deleted + ' of ' + n + ' file' + (n === 1 ? '' : 's')
                  + (r.failed ? (' \u2014 ' + r.failed + ' failed') : ''));
              } else { toast('Cleanup finished'); }
            }).catch(function (e) {
              showAlert('Cleanup error', 'Some files may not have been removed. Nothing in use was affected.\n\n' + (e && e.message ? e.message : ''));
            });
          } }
      ]
    });
  }).catch(function (e) {
    showAlert('Scan error', 'Could not scan cloud storage. Nothing was changed.\n\n' + (e && e.message ? e.message : ''));
  });
}

function _repairPhotos() {
  if (!(Auth && Auth.isSuperAdmin && Auth.isSuperAdmin())) {
    showAlert('Restricted', 'Photo Repair is restricted to the administrator.');
    return;
  }
  var proj = Model.getProject();
  if (!proj) { showAlert('No project', 'Open a project first.'); return; }

  // Dry-run preview (counts only, no mutation)
  var preview = Model.repairPhotoPool({ dryRun: true, orphanMode: 'rehome' });
  var dupes = preview.dupesRemoved;
  var orphans = preview.orphansRehomed + preview.orphansDeleted;

  if (!dupes && !orphans) {
    showAlert('Nothing to repair', 'No duplicate pool photos or orphaned photos were found. The photo pool is clean.');
    return;
  }

  var lines = [];
  if (dupes) lines.push('\u2022 ' + dupes + ' duplicate pool photo' + (dupes === 1 ? '' : 's') + ' \u2014 will be merged (an identical copy is kept; no photo is lost).');
  if (orphans) lines.push('\u2022 ' + orphans + ' orphaned photo' + (orphans === 1 ? '' : 's') + ' \u2014 referenced by no observation.');
  var msg = 'Found across ' + preview.pinsTouched + ' pin' + (preview.pinsTouched === 1 ? '' : 's') + ':\n\n' + lines.join('\n');
  if (orphans) {
    msg += '\n\nWhat should happen to the orphaned photos?\n\u2022 Re-home: attach each to its pin\u2019s first observation (keeps the image).\n\u2022 Delete orphans: soft-delete them (the cloud file is not touched).';
  }

  function _run(orphanMode) {
    var r = Model.repairPhotoPool({ dryRun: false, orphanMode: orphanMode });
    var done = [];
    if (r.dupesRemoved) done.push(r.dupesRemoved + ' duplicate' + (r.dupesRemoved === 1 ? '' : 's') + ' merged');
    if (r.orphansRehomed) done.push(r.orphansRehomed + ' orphan' + (r.orphansRehomed === 1 ? '' : 's') + ' re-homed');
    if (r.orphansDeleted) done.push(r.orphansDeleted + ' orphan' + (r.orphansDeleted === 1 ? '' : 's') + ' deleted');
    toast(done.length ? ('Repaired: ' + done.join(', ')) : 'Nothing changed');
    // repairPhotoPool fires Model._notify('project') on success; the photos +
    // deficiencies views are subscribed to that, so they re-render on their own.
  }

  if (!orphans) {
    // Only dupes — single safe confirm, no orphan choice needed.
    showConfirm('Repair Photos', msg + '\n\nMerge the duplicates now?').then(function(yes) {
      if (yes) _run('rehome');
    });
    return;
  }

  showDialog({
    title: 'Repair Photos',
    message: msg,
    buttons: [ // S443 order: Cancel leftmost, primary rightmost
      { label: 'Cancel', outline: true, action: function() {} },
      { label: 'Delete orphans', color: '#C0445F', outline: true, action: function() { _run('delete'); } },
      { label: 'Re-home orphans', color: '#3E8E6E', action: function() { _run('rehome'); } }
    ]
  });
}

function _reuploadAll() {
  // S497f (Mark): runtime gate, not just menu hiding — staff must not touch
  // R2 in any form. Mirrors the _repairPhotos guard. Menu visibility is
  // cosmetics; this line is the actual protection.
  if (!(Auth && Auth.isSuperAdmin && Auth.isSuperAdmin())) {
    showAlert('Restricted', 'Re-upload is restricted to the administrator.');
    return;
  }
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
  overlay.addEventListener('click', function(e) { /* backdrop-click close disabled (accidental dismiss) */ if(false){} });

  // Load qrcodejs if not already loaded
  if (typeof window.QRCode !== 'undefined') {
    new window.QRCode(overlay.querySelector('#qr-canvas'), { text: url, width: 200, height: 200 });
  } else {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = function() { new window.QRCode(overlay.querySelector('#qr-canvas'), { text: url, width: 200, height: 200 }); };
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
    if (_hdrCtl) _hdrCtl.setStorage({ pct: pct,
      label: usedMB + 'MB / ' + totalMB + 'MB (' + pct + '%)' });
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
  if (_hdrCtl) _hdrCtl.setInspector(name ? { name: '\uD83D\uDC64 ' + name } : { placeholder: '\uD83D\uDC64 Set Name' });
}

function _showInspectorModal() {
  // S116 Push 8: in Hub mode the inspector identity is auto-derived from the
  // authenticated user's profiles.full_name. Editing it here would create
  // local drift between what the chip displays and what the user actually
  // is in Supabase. Bail out silently if the chip is locked.
  if (_inspectorLocked) {
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
  overlay.addEventListener('click', function(e) { /* backdrop-click close disabled (accidental dismiss) */ if(false){} });
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
  // S269: V2 never adopted the loaded tool_data row's instance_number into the
  // project blob — Hub-created reports left blob.currentFrtInstance at 1, so
  // FRT #2 (and beyond) showed "FRT #1" in the header. The row's instance_number
  // is authoritative (mirrors V1's "always adopt cloud instance_number"). Prefer
  // it for the label AND write it back into the blob so the N+1/N+0 lifecycle
  // (carry-forward, "new this report", PDF main-vs-history split) computes
  // against the correct instance. Only writes when it actually differs, and does
  // NOT force a save — it rides the next normal save cycle. Per-row: reopening a
  // different report re-adopts that row's own number.
  var cloudInst = (typeof SyncEngine !== 'undefined' && SyncEngine.instanceNumber)
    ? SyncEngine.instanceNumber : null;
  var inst = cloudInst || proj.currentFrtInstance || 1;
  if (cloudInst && proj.currentFrtInstance !== cloudInst) {
    proj.currentFrtInstance = cloudInst;
  }
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
  // Hub mode: the report number IS the cloud row's instance_number, which
  // _updateFrtInstanceIndicator re-adopts on every load/pull — a local bump
  // here would be silently overwritten (an untruthful dialog). New instances
  // in Hub mode are created from the Project Hub ("+ New Report"), which
  // seeds the new row from this one so open items carry forward (N+1 rule).
  if (_hubMode) {
    showAlert('New FRT Report',
      'This report is FRT #' + cur + ', managed by the Project Hub. To start FRT #' + next +
      ', use \u201C\uFF0B New Report\u201D on this project in the Hub \u2014 open items will carry forward automatically.'
    );
    return;
  }
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
/* S489c (Mark): FLUSH ON LEAVE — no save modal, anywhere.
   The 3-button dialog is DELETED. It was a pre-cloud fossil and was already
   unreachable in normal use: it fired only while a dirty flag was set, and the
   debounced IDB save clears that flag ~1.5s after any edit — long before a hand
   reaches Back. S489 had widened the trigger to catch the pending-cloud-push
   window (Mark's repro: close an item, hit Back, create FRT #N+1, item still
   Outstanding). That fix is PRESERVED and made unconditional here: instead of
   asking, leaving now always performs the same flush the dialog's "Save & Leave"
   button did — local IDB save, then the cloud push when one is actually pending —
   and only then navigates. _frtHasPendingCloudPush() still owns that state.
   Failure behaviour (S489's concern): a rejected push must never trap an
   inspector on site, and the edit is already safe in IDB, so we navigate anyway
   and let the next open reconcile. A 4s watchdog covers a hung network. */
function _flushAndLeave(dest) {
  var gone = false;
  var go = function(){ if (gone) return; gone = true; window.location.href = dest; };
  setTimeout(go, 4000);
  try {
    var needPush = _frtHasPendingCloudPush() || Model.hasUnsavedChanges();
    try { _setCloudStatus('saving', 'Saving\u2026'); } catch (_) {}
    Model.saveNow().then(function() {
      if (needPush && _hubMode && _projectId && typeof SyncEngine !== 'undefined') {
        return SyncEngine.push(_projectId);
      }
      return null;
    }).then(go, function(err) {
      console.warn('[FRT] leave-flush push failed; local IDB holds the edit:', err);
      go();
    });
  } catch (e) { go(); }
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

  // S488 Wave 3: header mode via the sealed engine — project open hides the
  // dashboard controls and reveals AI/Reports/More (config hubOnly).
  if (_hdrCtl){
    _hdrCtl.setHubMode({ hub:true, backVisible:_hubMode,
      logoHref:'#', logoTitle:_hubMode ? 'Project dashboard' : 'Back to Toolkit' });
    _hdrCtl.setControlHidden('load', true);
    _hdrCtl.setControlHidden('exportall', true);
  }

  // Show AI usage button for all users (everyone tracks their own project costs)
  var aiUsageBtn = document.getElementById('btn-ai-usage');
  if (aiUsageBtn) aiUsageBtn.style.display = '';
  var aiUsageMore = document.getElementById('btn-ai-usage-more');
  if (aiUsageMore) aiUsageMore.style.display = '';

  // Show mobile AI buttons
  var mar = document.getElementById('mobile-ai-rewrite');
  if (mar) mar.style.display = '';
  var mau = document.getElementById('mobile-ai-usage');
  if (mau) mau.style.display = '';

  // S284: Repair tools + Diagnostics are SUPER-ADMIN (Mark) only — was
  // admin-wide for repair, everyone for Diagnostics. The HTML defaults all
  // three (desktop repair section, mobile repair section, Diagnostics button)
  // to display:none, so everyone else simply never sees them — protecting
  // field users from destructive recovery actions (R2 Cleanup, Repair R2
  // Links, Photo Pool Repair) and state-heavy diagnostic surfaces.
  if (Auth && Auth.isSuperAdmin && Auth.isSuperAdmin()) {
    if (_hdrCtl) _hdrCtl.setAdmin(true);   /* S488: Repair section + Diagnostics (S284 gate) */
    var mobileRepair = document.getElementById('mobile-repair-section');
    if (mobileRepair) mobileRepair.style.display = '';
  }

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

// S155: Skip-if-unchanged push gate.
// _pushDirty tracks "the model has changed since the last successful push."
// Set when Model fires 'saved' (only real local mutations) and at session start
// (one safety push covers the tab-killed-mid-debounce reload case). Cleared
// optimistically at push start; restored on failure/offline so the next 15s
// cycle retries. Skip combined with the document.hidden tab-hidden gate is
// the entire idle-IO win — push timer interval unchanged at 15s, presence
// untouched per Mark.
var _pushDirty = false;
// S489: read-only accessor for the "changed locally but not yet pushed to
// cloud" state. _pushDirty is module-scoped and set by the 'saved' listener;
// the leave path needs it to decide whether the 3-button dialog is required.
// Deliberately a function, not an exported flag, so there is exactly one
// owner of the value.
function _frtHasPendingCloudPush() {
  return !!(_hubMode && _projectId && _pushDirty);
}

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
    // S155: real local mutation just persisted to IDB — needs cloud push.
    _pushDirty = true;
    // Debounce cloud push — don't push on every keystroke save
    if (_cloudSyncTimer) clearInterval(_cloudSyncTimer);
    _cloudSyncTimer = setTimeout(function() {
      _pushToCloud();
      // Restart periodic sync
      _cloudSyncTimer = setInterval(_pushToCloud, _cloudSyncInterval);
    }, 5000); // Wait 5s after last local save before pushing
  });

  // S155: one safety push on session start. Covers the case where the tab
  // was killed between the last 'saved' event and its 5s debounced push,
  // leaving local IDB ahead of cloud. After this single push, the gate
  // takes over and idle ticks are no-ops.
  _pushDirty = true;

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
  // S440: instant catch-up when the app returns to foreground. The interval
  // no-ops while hidden (S155), so switching PC→phone could wait a full tick;
  // this closes that gap the moment the tab becomes visible.
  if (!window._frtVisPullWired) {
    window._frtVisPullWired = true;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && _hubMode && _projectId) {
        _checkRemoteForChanges();
      }
    });
  }
}

// S440: repaint after a background pull. Model.setProject() refreshes the
// data, but the painted screen kept showing the pre-pull state (the
// cross-device “deleted photos still active” bug) — silent pulls updated
// the model and the status pill only. Re-invoke the current tab, the same
// idiom the boot-path render gate uses.
function _repaintAfterPull(){
  try { switchTab(_currentTab); } catch (e) { console.warn('[FRT v2] repaint after pull failed:', e && e.message); }
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
  // S155: pause pull when tab is hidden. The 30s interval keeps firing, but
  // the no-op tick costs nothing; the next tick after visibility restores
  // catches up. Presence heartbeat is intentionally NOT paused (per Mark).
  if (typeof document !== 'undefined' && document.hidden) return;
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
          _repaintAfterPull(); // S440: land the pulled data on screen
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
      // Explicit user choice — bypass the S263 stale-overwrite gate (the
      // confirm above already warns this overwrites local).
      SyncEngine.pull(_projectId, SyncEngine.instanceId, { allowStaleOverwrite: true }).then(function(data){
        if (data) { _lastPulledUpdatedAt = remoteTs; _setCloudStatus('synced', 'Refreshed from cloud'); _repaintAfterPull(); }
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
  // S155: skip-if-unchanged gate. The 15s interval keeps ticking, but if
  // nothing has changed since the last successful push, no network round
  // trip happens. The 'saved' Model event sets _pushDirty=true the moment
  // a real local mutation persists to IDB.
  if (!_pushDirty) return;
  // S155: pause when tab hidden. Push timer ticks but does nothing while
  // the user is on another tab / app is backgrounded. Resume on next tick
  // after the user returns. _pushDirty is preserved so no change is lost.
  if (typeof document !== 'undefined' && document.hidden) return;
  // S81: don't claim to push if auth is missing — shows "Not signed in" instead
  var user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
  if (!user){
    _setCloudStatus('error', 'Not signed in — tap for details');
    return;
  }
  // S426: stale-writer guard. Load-time migrations mark the model dirty at
  // boot, so a freshly opened tab could push its stale IDB snapshot over a
  // NEWER cloud row (external repair, another device, SQL fix) — the root
  // cause of the S404–S421 relink clobbers. Before pushing, confirm the
  // cloud row is not newer than the state this tab last pulled. If it is,
  // skip: _pushDirty stays true and the 30s pull loop reconciles first;
  // the push retries on a later tick against a fresh baseline.
  if (typeof SyncEngine !== 'undefined' && SyncEngine.getRemoteUpdatedAt) {
    SyncEngine.getRemoteUpdatedAt(_projectId, SyncEngine.instanceId).then(function(remoteTs) {
      if (remoteTs && (!_lastPulledUpdatedAt || remoteTs > _lastPulledUpdatedAt)) {
        console.log('[FRT v2] Push skipped \u2014 cloud (' + remoteTs + ') is newer than our baseline (' + (_lastPulledUpdatedAt || 'none') + '); pull will reconcile first');
        return; // dirty flag preserved; no data lost, no overwrite
      }
      _pushToCloudNow();
    }).catch(function() { _pushToCloudNow(); }); // network blip: behave as before
    return;
  }
  _pushToCloudNow();
}

function _pushToCloudNow() {
  // S155: optimistic clear. If push succeeds, _pushDirty stays false. If a
  // concurrent 'saved' fires during the network round-trip, it re-sets
  // _pushDirty=true and the next cycle picks it up — no edit lost. If push
  // fails or returns null (offline queued), wasDirty restores the flag so
  // the next cycle retries.
  var wasDirty = _pushDirty;
  _pushDirty = false;
  _setCloudStatus('saving', 'Syncing...');
  SyncEngine.push(_projectId).then(function(row) {
    if (row) {
      _setCloudStatus('synced', 'Saved to cloud');
      // S82: update periodic-pull baseline so banner doesn't fire for our own push
      if (row.updated_at) _lastPulledUpdatedAt = row.updated_at;
    } else {
      // null = offline-queued or no-op. Restore so next cycle retries.
      _pushDirty = wasDirty;
      _setCloudStatus('pending', 'Saved locally');
    }
  }).catch(function(err) {
    // Restore so next cycle retries.
    _pushDirty = wasDirty;
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
  var dvEl = document.getElementById('dv-last-sync-text');
  if (!_lastSyncedAt) {
    if (_hdrCtl) _hdrCtl.setCloud({ lastSync:'' });
    if (dvEl) { dvEl.textContent = ''; dvEl.style.display = 'none'; }
    return;
  }
  var diff = Date.now() - _lastSyncedAt;
  var label = '\u00B7 last sync: ' + _formatTimeAgo(diff);
  // Color-coded freshness — muted palette per Mark's color rule
  var color = diff < 60000 ? '#5F8068'    // muted green: <1 min
            : diff < 300000 ? '#B07F5A'   // muted amber: 1-5 min
            : '#A85959';                   // muted red:   >5 min
  if (_hdrCtl) _hdrCtl.setCloud({ lastSync: label });   /* S488: engine slot (freshness
     colors simplified to the engine's quiet style — dv mirror keeps them) */
  if (dvEl) {
    dvEl.style.display = '';
    dvEl.textContent = label;
    dvEl.style.color = color;
  }
}

// Update the "X ago" text every 30s
setInterval(_updateLastSyncIndicator, 30000);

// ─── S170 (Fix A): Photo outbox header badge ─────────────────────────────
// Minimal badge that surfaces in-flight upload counts. Only renders when
// BinaryOutbox is enabled (i.e. ?staging=1 is in the URL). Injects itself
// into the existing project-bar; no HTML edit required.
//
// Per D8: r2_confirmed and cloud_confirmed are NOT counted — they're safe
// states. The badge counts pending + uploading + retrying as "in flight"
// and failed separately. Failed takes visual priority (muted red).
//
// S175: badge is now tappable — opens the outbox detail modal so users
// can retry/cancel failed rows without DevTools.
function _updateOutboxBadge() {
  if (!BinaryOutbox || !BinaryOutbox.isEnabled || !BinaryOutbox.isEnabled()) return;
  var bar = document.getElementById('project-bar');
  if (!bar) return;
  var badge = document.getElementById('pb-outbox');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'pb-outbox';
    badge.title = 'Photo upload status — tap for details';
    badge.style.cssText = 'display:none;padding:2px 8px;border-radius:4px;' +
      'font-weight:600;font-size:calc(11px + var(--ts));color:#fff;' +
      'flex-shrink:0;white-space:nowrap;margin-left:6px;cursor:pointer;' +
      'font-family:Calibri,sans-serif;letter-spacing:.2px;';
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    // S175: click → modal. Wired once at creation. Keyboard parity via
    // Enter/Space for accessibility (matches role=button semantics).
    badge.addEventListener('click', _showOutboxModal);
    badge.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _showOutboxModal();
      }
    });
    bar.appendChild(badge);
  }
  var counts = BinaryOutbox.getStatusCounts();
  var inflight = counts.pending + counts.uploading + counts.retrying;
  var failed = counts.failed;
  if (failed > 0) {
    badge.style.display = '';
    badge.style.background = '#A85959';  // muted red — matches sync-indicator >5min state
    badge.textContent = (inflight > 0 ? ('\uD83D\uDCE4 ' + inflight + ' \u00B7 ') : '') +
                        '\u26A0 ' + failed + ' failed';
  } else if (inflight > 0) {
    badge.style.display = '';
    badge.style.background = '#2C4A6B';  // muted blue — matches pb-inst style
    badge.textContent = '\uD83D\uDCE4 ' + inflight + ' uploading';
  } else {
    badge.style.display = 'none';
    badge.textContent = '';
  }
}

// Wire outbox events to badge updates. Hooked unconditionally so the badge
// stays in sync even if the activation flag flips later in some future
// session; the updater itself short-circuits when disabled.
try {
  if (BinaryOutbox && BinaryOutbox.onChange) {
    ['enqueue', 'uploading', 'r2_confirmed', 'cloud_confirmed',
     'failed', 'cancelled'].forEach(function(ev) {
      BinaryOutbox.onChange(ev, _updateOutboxBadge);
    });
  }
} catch (_) {}

// Also refresh on a slow timer as a safety net for any state changes we
// might miss (e.g. resume() restoring rows before the listeners are wired
// on the very first paint).
setInterval(_updateOutboxBadge, 5000);

// ─── S175 (Fix A): Photo outbox detail modal ──────────────────────────────
// Tap the header badge → modal listing every outbox row for the current
// project, grouped by status (failed → in-flight → r2_confirmed). Per-row
// Retry / Cancel buttons, plus a bulk "Retry all failed" affordance.
//
// Before S175, the only retry path was `window.BinaryOutbox.retryEntry(rowId)`
// from DevTools — meaning the failure toast's "tap the badge to retry"
// promise was a dead end for field users. This modal closes that gap.
//
// Pattern follows _showInspectorModal: inline-style overlay, dark-mode
// aware, dismiss on backdrop click / × / Escape. No CSS file changes.
// Registered in the global Escape priority list as `outbox-overlay`.
//
// Auto-refresh: subscribes to BinaryOutbox events on open so the list
// reflects state changes (e.g. a manual retry succeeds and the row
// transitions to r2_confirmed). Unsubscribes on close to avoid leaks.

// In-memory handle to the outbox event subscriptions while the modal
// is open. Cleared on close.
var _outboxModalListeners = null;

function _formatOutboxTime(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    // Show HH:MM if today, else MMM D HH:MM
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() &&
                  d.getMonth() === now.getMonth() &&
                  d.getDate() === now.getDate();
    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (sameDay) return hm;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ' ' + hm;
  } catch (_) { return ''; }
}

function _outboxDeficLabel(row) {
  // Return "Pin #N" if we can resolve the defic; otherwise a stable
  // short ID. Reads from current model state — outbox row's deficId
  // is the lookup key.
  try {
    var proj = (typeof Model !== 'undefined' && Model.getProject) ? Model.getProject() : null;
    if (!proj || !row || !row.deficId) return 'Unknown pin';
    var contractors = proj.contractors || [];
    for (var i = 0; i < contractors.length; i++) {
      var defs = contractors[i].deficiencies || [];
      for (var j = 0; j < defs.length; j++) {
        if (defs[j] && defs[j].id === row.deficId) {
          return 'Pin #' + (defs[j].num || '?');
        }
      }
    }
    var general = proj.generalDeficiencies || [];
    for (var k = 0; k < general.length; k++) {
      if (general[k] && general[k].id === row.deficId) {
        return 'Pin #' + (general[k].num || '?') + ' (general)';
      }
    }
    return 'Pin (deleted)';
  } catch (_) { return 'Unknown pin'; }
}

function _escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
}

function _renderOutboxModalBody(theme) {
  var proj = (typeof Model !== 'undefined' && Model.getProject) ? Model.getProject() : null;
  if (!proj || !proj.id) {
    return '<div style="padding:24px 0;text-align:center;color:' + theme.muted +
           ';font-size:13px;">No project loaded.</div>';
  }
  if (!BinaryOutbox || !BinaryOutbox.getEntriesForProject) {
    return '<div style="padding:24px 0;text-align:center;color:' + theme.muted +
           ';font-size:13px;">Photo outbox unavailable.</div>';
  }
  var rows = BinaryOutbox.getEntriesForProject(proj.id) || [];

  // Bucket by status
  var failed = [], inflight = [], confirmed = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r) continue;
    if (r.status === 'failed') failed.push(r);
    else if (r.status === 'pending' || r.status === 'uploading' ||
             r.status === 'retrying') inflight.push(r);
    else if (r.status === 'r2_confirmed') confirmed.push(r);
  }

  if (rows.length === 0 ||
      (failed.length === 0 && inflight.length === 0 && confirmed.length === 0)) {
    return '<div style="padding:32px 0;text-align:center;color:' + theme.muted +
           ';font-size:13px;">' +
           '<div style="font-size:32px;margin-bottom:8px;">\u2705</div>' +
           'No photos in flight or failed.<br>All uploads are settled.</div>';
  }

  var h = '';

  // ── FAILED section ──
  if (failed.length > 0) {
    h += '<div style="margin-bottom:18px;">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
    h += '<div style="font-size:13px;font-weight:700;color:#A85959;flex:1;">' +
         '\u26A0 ' + failed.length + ' Failed</div>';
    if (failed.length > 1) {
      h += '<button class="outbox-retry-all" style="padding:6px 12px;' +
           'background:#1A7A4A;color:#fff;border:none;border-radius:5px;' +
           'font-family:Calibri,sans-serif;font-size:12px;font-weight:600;' +
           'cursor:pointer;min-height:32px;">\u21BB Retry All Failed</button>';
    }
    h += '</div>';
    for (var f = 0; f < failed.length; f++) {
      h += _renderOutboxRow(failed[f], theme, 'failed');
    }
    h += '</div>';
  }

  // ── IN-FLIGHT section ──
  if (inflight.length > 0) {
    h += '<div style="margin-bottom:18px;">';
    h += '<div style="font-size:13px;font-weight:700;color:#2C4A6B;' +
         'margin-bottom:8px;">\uD83D\uDCE4 ' + inflight.length + ' Uploading</div>';
    for (var u = 0; u < inflight.length; u++) {
      h += _renderOutboxRow(inflight[u], theme, 'inflight');
    }
    h += '</div>';
  }

  // ── R2 CONFIRMED section ──
  if (confirmed.length > 0) {
    h += '<div style="margin-bottom:8px;">';
    h += '<div style="font-size:13px;font-weight:700;color:#1A7A4A;' +
         'margin-bottom:8px;">\u2713 ' + confirmed.length +
         ' Confirmed (awaiting cloud sync)</div>';
    h += '<div style="font-size:12px;color:' + theme.muted + ';' +
         'padding:8px 12px;background:' + theme.subtleBg + ';border-radius:6px;' +
         'border:1px solid ' + theme.border + ';">' +
         'These photos are safely on R2 and will be cleared from this list ' +
         'after the next successful cloud sync. No action needed.</div>';
    h += '</div>';
  }

  return h;
}

function _renderOutboxRow(row, theme, kind) {
  var pinLabel = _outboxDeficLabel(row);
  var statusLine = '';
  var actions = '';
  var icon = '';
  var iconColor = theme.muted;

  if (kind === 'failed') {
    icon = '\u26A0';
    iconColor = '#A85959';
    var attempts = (row.retryCount || 0) + 1;
    statusLine = attempts + ' attempt' + (attempts === 1 ? '' : 's') + ' \u00B7 last tried ' +
                 _formatOutboxTime(row.lastAttemptAt);
    actions = '<button class="outbox-retry" data-rowid="' + _escHtml(row.id) + '" ' +
              'style="padding:6px 12px;background:#1A7A4A;color:#fff;border:none;' +
              'border-radius:5px;font-family:Calibri,sans-serif;font-size:12px;' +
              'font-weight:600;cursor:pointer;min-height:32px;margin-right:6px;">' +
              '\u21BB Retry</button>' +
              '<button class="outbox-cancel" data-photoid="' + _escHtml(row.photoId) + '" ' +
              'style="padding:6px 12px;background:transparent;color:' + theme.fg +
              ';border:1px solid ' + theme.border + ';border-radius:5px;' +
              'font-family:Calibri,sans-serif;font-size:12px;cursor:pointer;' +
              'min-height:32px;">\u2715 Cancel</button>';
  } else if (kind === 'inflight') {
    if (row.status === 'uploading') {
      icon = '\u23F3';
      iconColor = '#2C4A6B';
      statusLine = 'Uploading\u2026';
    } else if (row.status === 'retrying') {
      icon = '\u21BB';
      iconColor = '#E67E22';
      var nextIn = '';
      if (row.nextRetryAt) {
        var ms = new Date(row.nextRetryAt).getTime() - Date.now();
        if (ms > 0) {
          var secs = Math.ceil(ms / 1000);
          nextIn = secs < 60 ? (secs + 's') : (Math.ceil(secs / 60) + 'm');
          statusLine = 'Retrying in ' + nextIn + ' (attempt ' + ((row.retryCount || 0) + 1) +
                       ' of 5)';
        } else {
          statusLine = 'Retrying soon (attempt ' + ((row.retryCount || 0) + 1) + ' of 5)';
        }
      } else {
        statusLine = 'Retrying (attempt ' + ((row.retryCount || 0) + 1) + ' of 5)';
      }
    } else {
      icon = '\u2026';
      iconColor = theme.muted;
      statusLine = 'Queued';
    }
    actions = '<button class="outbox-cancel" data-photoid="' + _escHtml(row.photoId) + '" ' +
              'style="padding:6px 12px;background:transparent;color:' + theme.fg +
              ';border:1px solid ' + theme.border + ';border-radius:5px;' +
              'font-family:Calibri,sans-serif;font-size:12px;cursor:pointer;' +
              'min-height:32px;">\u2715 Cancel</button>';
  }

  var errBlock = '';
  if (kind === 'failed' && row.lastError) {
    errBlock = '<div style="font-size:11px;color:#A85959;margin-top:4px;' +
               'font-family:Consolas,Menlo,monospace;word-break:break-word;">' +
               _escHtml(String(row.lastError).slice(0, 200)) + '</div>';
  }

  return '<div style="padding:10px 12px;border:1px solid ' + theme.border +
         ';border-radius:6px;background:' + theme.subtleBg + ';margin-bottom:6px;">' +
         '<div style="display:flex;align-items:flex-start;gap:10px;">' +
         '<div style="font-size:18px;color:' + iconColor + ';flex-shrink:0;' +
         'line-height:1;padding-top:2px;">' + icon + '</div>' +
         '<div style="flex:1;min-width:0;">' +
         '<div style="font-size:13px;font-weight:600;color:' + theme.fg + ';">' +
         _escHtml(pinLabel) + '</div>' +
         '<div style="font-size:11px;color:' + theme.muted + ';margin-top:2px;">' +
         _escHtml(statusLine) + '</div>' +
         errBlock +
         '</div></div>' +
         (actions ? '<div style="margin-top:8px;display:flex;flex-wrap:wrap;">' +
                    actions + '</div>' : '') +
         '</div>';
}

function _wireOutboxModalActions(overlay, theme) {
  // (Re)wire row action buttons + bulk retry. Called after every render so
  // freshly-injected buttons get handlers. Re-renders the body on each
  // action so the user sees the row transition immediately.
  function _rerender() {
    var body = overlay.querySelector('#outbox-body');
    if (body) {
      body.innerHTML = _renderOutboxModalBody(theme);
      _wireOutboxModalActions(overlay, theme);
    }
  }

  overlay.querySelectorAll('.outbox-retry').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var rowId = btn.getAttribute('data-rowid');
      if (!rowId || !BinaryOutbox || !BinaryOutbox.retryEntry) return;
      btn.disabled = true;
      btn.textContent = '\u2026';
      BinaryOutbox.retryEntry(rowId).then(function(ok) {
        if (!ok) {
          toast('Could not retry \u2014 row no longer failed', 3500);
        }
        _rerender();
      }, function(err) {
        console.warn('[outbox modal] retry failed:', err);
        toast('Retry failed: ' + (err && err.message ? err.message : 'unknown error'), 5000);
        _rerender();
      });
    });
  });

  overlay.querySelectorAll('.outbox-retry-all').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!BinaryOutbox || !BinaryOutbox.retryAllFailed) return;
      btn.disabled = true;
      var orig = btn.textContent;
      btn.textContent = '\u2026';
      BinaryOutbox.retryAllFailed().then(function(n) {
        toast('Re-queued ' + n + ' photo' + (n === 1 ? '' : 's') + ' for upload', 3500);
        _rerender();
      }, function(err) {
        console.warn('[outbox modal] retryAllFailed error:', err);
        btn.disabled = false;
        btn.textContent = orig;
      });
    });
  });

  overlay.querySelectorAll('.outbox-cancel').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var photoId = btn.getAttribute('data-photoid');
      if (!photoId || !BinaryOutbox || !BinaryOutbox.cancelByPhotoId) return;
      showConfirm('Cancel this upload?',
        'The photo will remain on the pin but will not be uploaded to the cloud.'
      ).then(function(ok) {
        if (!ok) return;
        btn.disabled = true;
        BinaryOutbox.cancelByPhotoId(photoId).then(function() {
          _rerender();
          _updateOutboxBadge();
        }, function(err) {
          console.warn('[outbox modal] cancel error:', err);
          btn.disabled = false;
        });
      });
    });
  });
}

function _showOutboxModal() {
  // Guard: don't open if disabled or already open.
  if (!BinaryOutbox || !BinaryOutbox.isEnabled || !BinaryOutbox.isEnabled()) return;
  if (document.getElementById('outbox-overlay')) return;

  var _isDark = document.body.classList.contains('dark-mode');
  var theme = {
    bg:        _isDark ? '#1e2533' : '#ffffff',
    fg:        _isDark ? '#d0d8f0' : '#1a202c',
    muted:     _isDark ? '#8a94b0' : '#718096',
    border:    _isDark ? '#3a4050' : '#DDE1E7',
    subtleBg:  _isDark ? '#151a24' : '#f7f9fb',
    cancelBg:  _isDark ? '#2a3040' : '#f5f5f5',
    cancelFg:  _isDark ? '#d0d8f0' : '#4A5568'
  };

  var h = '<div id="outbox-overlay" style="position:fixed;inset:0;z-index:9998;' +
          'background:rgba(0,0,0,.55);display:flex;align-items:center;' +
          'justify-content:center;font-family:Calibri,sans-serif;padding:16px;' +
          'box-sizing:border-box;">';
  h += '<div id="outbox-card" style="background:' + theme.bg + ';color:' + theme.fg +
       ';border-radius:12px;padding:20px 22px;box-shadow:0 8px 32px rgba(0,0,0,.3);' +
       'min-width:300px;max-width:520px;width:100%;max-height:85vh;' +
       'display:flex;flex-direction:column;box-sizing:border-box;">';
  // Header
  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;' +
       'flex-shrink:0;">';
  h += '<div style="font-size:16px;font-weight:700;flex:1;color:' + theme.fg + ';">' +
       '\uD83D\uDCE4 Photo Upload Status</div>';
  h += '<button id="outbox-close" aria-label="Close" style="padding:6px 10px;' +
       'background:' + theme.cancelBg + ';color:' + theme.cancelFg + ';border:none;' +
       'border-radius:5px;font-family:Calibri,sans-serif;font-size:14px;' +
       'cursor:pointer;min-height:32px;min-width:32px;">\u2715</button>';
  h += '</div>';
  // Body (scrollable)
  h += '<div id="outbox-body" style="overflow-y:auto;flex:1;min-height:0;' +
       'margin:0 -4px;padding:0 4px;"></div>';
  // Footer info line
  h += '<div style="margin-top:14px;padding-top:10px;border-top:1px solid ' +
       theme.border + ';font-size:11px;color:' + theme.muted +
       ';flex-shrink:0;line-height:1.4;">' +
       'Retries: 5s \u2192 15s \u2192 45s \u2192 2m \u2192 5m. After 5 attempts, ' +
       'manual retry is required.</div>';
  h += '</div></div>';

  var div = document.createElement('div');
  div.innerHTML = h;
  var overlay = div.firstChild;
  document.body.appendChild(overlay);

  // Initial render
  overlay.querySelector('#outbox-body').innerHTML = _renderOutboxModalBody(theme);
  _wireOutboxModalActions(overlay, theme);

  // Subscribe to outbox events so the list stays live while the modal
  // is open (e.g. a retrying row transitions to r2_confirmed while user
  // is looking at it; a new failure batch arrives). Re-renders + re-wires.
  function _liveRefresh() {
    if (!document.getElementById('outbox-overlay')) return;
    var body = overlay.querySelector('#outbox-body');
    if (!body) return;
    body.innerHTML = _renderOutboxModalBody(theme);
    _wireOutboxModalActions(overlay, theme);
  }
  _outboxModalListeners = [];
  if (BinaryOutbox && BinaryOutbox.onChange) {
    ['enqueue', 'uploading', 'r2_confirmed', 'cloud_confirmed',
     'failed', 'cancelled', 'reconcile'].forEach(function(ev) {
      BinaryOutbox.onChange(ev, _liveRefresh);
      _outboxModalListeners.push({ ev: ev, fn: _liveRefresh });
    });
  }
  // Also a 1-second pulse so "Retrying in Ns" countdowns advance.
  var pulseTimer = setInterval(function() {
    if (!document.getElementById('outbox-overlay')) {
      clearInterval(pulseTimer);
      return;
    }
    // Only refresh if at least one retrying row is visible (cheap check).
    var proj = (typeof Model !== 'undefined' && Model.getProject) ? Model.getProject() : null;
    if (!proj || !proj.id || !BinaryOutbox.getEntriesForProject) return;
    var rows = BinaryOutbox.getEntriesForProject(proj.id) || [];
    var hasRetrying = false;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].status === 'retrying') { hasRetrying = true; break; }
    }
    if (hasRetrying) _liveRefresh();
  }, 1000);

  function _close() {
    // Unsubscribe outbox listeners
    if (_outboxModalListeners && BinaryOutbox && BinaryOutbox.offChange) {
      _outboxModalListeners.forEach(function(L) {
        BinaryOutbox.offChange(L.ev, L.fn);
      });
    }
    _outboxModalListeners = null;
    clearInterval(pulseTimer);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  overlay.querySelector('#outbox-close').addEventListener('click', _close);
  // Click backdrop (overlay itself, not the inner card) → close
  overlay.addEventListener('click', function(e) {
    /* backdrop close disabled */ if(false){ _close() }
  });
}

// ─── S117-A: Presence chip rendering ────────────────────────────────────
// Shows "👥 N here" pill in main header when other users are active in this
// project. Click → modal listing names. Hidden when nobody else is here.
function _renderPresenceChip(others) {
  var n = (others || []).length;
  _presenceNames = (others || []).map(function(o){
    var nm = (o.full_name || '').trim();
    return nm || (o.user_id || '').slice(0, 8);
  });
  if (_hdrCtl) _hdrCtl.setPresence({ visible: n > 0,
    text: n + ' other' + (n === 1 ? '' : 's') + ' here' });
}
window._renderPresenceChip = _renderPresenceChip;

function _setCloudStatus(status, text) {
  _lastCloudStatus = status;
  _lastCloudText   = text || '';
  if (status === 'synced') _lastSyncedAt = Date.now();
  /* S488 Wave 3: header cloud slot is engine-owned; dv-* mirrors stay host. */
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
  if (dvText) dvText.textContent = safeText;
  var colors = { synced: '#34D399', saving: '#FBBF24', pending: '#F59E0B', error: '#EF4444', offline: '#9CA3AF' };
  var color = colors[status] || '#9CA3AF';
  if (_hdrCtl) _hdrCtl.setCloud({ visible:true, text:safeText,
    state: status === 'synced' ? 'ok' : (status === 'error' ? 'err' :
           (status === 'offline' ? 'off' : 'sync')) });
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
  lines.push('');
  // S161 P3: Photo subsystem state. Captures the data needed to diagnose
  // the "added a photo but no thumbnail" silent-failure pattern from
  // back-to-back photos in the pin editor. workerOK=false + non-zero
  // fallbackCount = worker died, browser fell back to main-thread JPEG
  // encoding; high mem usage + high fallback count = OOM pressure;
  // lastError tells us WHY the worker died.
  lines.push('PHOTO SUBSYSTEM:');
  var iw = (typeof window !== 'undefined' && window._frt_imageWorker) ? window._frt_imageWorker._diag : null;
  if (iw) {
    lines.push('  Worker OK:    ' + (iw.workerOK ? 'YES' : 'NO'));
    lines.push('  Compress calls: ' + (iw.callCount || 0));
    lines.push('  Fallbacks (worker died): ' + (iw.fallbackCount || 0));
    lines.push('  Last error: ' + (iw.lastError || '(none)'));
  } else {
    lines.push('  (image worker not loaded yet)');
  }
  if (typeof performance !== 'undefined' && performance.memory) {
    var used = Math.round(performance.memory.usedJSHeapSize / 1048576);
    var lim = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
    var pct = Math.round(100 * used / lim);
    lines.push('  Memory: ' + used + ' MB / ' + lim + ' MB  (' + pct + '%)');
  } else {
    lines.push('  Memory: (not reported by this browser)');
  }

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
  ov.addEventListener('click', function(e){ /* backdrop-click close disabled */ if(false){} });
  panel.querySelector('#cloud-diag-close').addEventListener('click', function(){ ov.parentNode.removeChild(ov); });
  var signIn = panel.querySelector('#cloud-diag-signin');
  if (signIn) signIn.addEventListener('click', function(){ window.location.href = _hubUrl(); });
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
        window.location.href = _hubUrl();
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

  _buildHeader();   /* S488 Wave 3: sealed header first — everything below that
     touched old header IDs is null-guarded and self-disables. */

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
    /* backdrop close disabled */ if(false){ closeMobileMenu(); }
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

  // S412: the old duplicate back-btn listener is REMOVED — it raced the
  // hub-mode handler (which navigated with NO save dialog). The single
  // registration in the hub-mode init now routes through _leaveTool().

  /* S489c: the logo lives inside the sealed header (S488 Wave 3) and routes
     through the config's onHome -> _flushAndLeave. This listener is retired. */

  // ── S411: TIERED BACK-TRAP (ports Diesel's S332/S333 pattern) ─────────
  // Android/TWA back (or swipe-back) peels ONE layer at a time instead of
  // throwing the inspector all the way back to the Hub: photo lightbox →
  // drawing viewer → export modal → mobile menu → non-default tab → and only
  // then the normal ← Back leave flow (3-button dialog when unsaved, exact
  // same path as the on-screen button). Guard entries keep history topped up
  // so the page itself never pops out from under an open layer.
  var _BT_DEPTH = 3;
  function _btTopUp() {
    try {
      var have = (history.state && history.state._frtGuard) ? history.state._frtGuard : 0;
      while (have < _BT_DEPTH) { have++; history.pushState({ _frtGuard: have }, ''); }
    } catch (e) {}
  }
  function _btPeel() {
    try {
      // 1. photo lightbox (public API — runs its unsaved-markup exit flow)
      var lb = window._frtLightbox;
      if (lb && lb.isOpen && lb.isOpen()) { lb.close(); return true; }
      // 2. drawing viewer — click #dv-close so the viewer's REAL close flow runs
      var dvo = document.getElementById('drawing-viewer-overlay');
      if (dvo && dvo.classList.contains('open')) {
        var x = document.getElementById('dv-close');
        if (x) { x.click(); return true; }
      }
      // 3. export modal
      var exv = document.getElementById('exv-ov');
      if (exv) {
        var ex = document.getElementById('exv-x');
        if (ex) ex.click(); else exv.remove();
        return true;
      }
      // 4. mobile menu
      var mm = document.getElementById('mobile-menu-overlay');
      if (mm && mm.classList.contains('open')) { closeMobileMenu(); return true; }
      // 5. non-default tab collapses to Project Info (mirrors Diesel's
      //    collapse-to-Summary tier)
      if (_currentTab !== 'info') { switchTab('info'); return true; }
    } catch (e) {}
    return false;
  }
  (function _installBackTrap() {
    try {
      _btTopUp();
      var _btLastPeel = 0;
      window.addEventListener('popstate', function () {
        var _now = Date.now();
        // S487j (F9): absorb Android back-gesture bounce — a pop landing within
        // the settle window after a successful peel is the same gesture; the
        // second pop was falling through to switchTab('info') ("tab 1").
        if (_now - _btLastPeel < 600) {
          _btTopUp();
          try { console.info('[BackTrap] absorbed bounce pop (' + (_now - _btLastPeel) + 'ms after peel)'); } catch (eB) {}
          return;
        }
        var handled = _btPeel();
        if (handled) _btLastPeel = _now;
        _btTopUp();   // re-arm guards after every pop
        if (!handled) {
          // Nothing left to peel → one tier up via the canonical leave flow
          // (project DETAIL page; 3-button dialog when unsaved). S412.
          _leaveTool();
        }
      });
    } catch (e) {}
  })();

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
  if (pdfBtn) pdfBtn.addEventListener('click', function() { initExportView.open(); });
  var mobilePdfBtn = document.getElementById('mobile-pdf-btn');
  if (mobilePdfBtn) mobilePdfBtn.addEventListener('click', function() {
    closeMobileMenu(); initExportView.open();
  });
  // S463: Import contractor-filled report PDF (CRB 1d return path)
  var crbImpBtn = document.getElementById('btn-crb-import');
  if (crbImpBtn) crbImpBtn.addEventListener('click', function() { openCrbImport(); });
  var mCrbImpBtn = document.getElementById('mobile-crb-import-btn');
  if (mCrbImpBtn) mCrbImpBtn.addEventListener('click', function() {
    closeMobileMenu(); openCrbImport();
  });

  // QR Code button
  // S441: header QR button removed — QR now lives in the More ▾ menu (desktop)
  // and the ☰ mobile menu. The more-menu delegate closes the menu on click.
  var qrBtn = document.getElementById('btn-qr-more');
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
  // S272: Quick Fix removed from the AI Review menu (Mark, S265). The desktop
  // and mobile menu buttons are already gone from index.html; the click
  // handlers that referenced #ai-mode-quickfix / #mobile-ai-quickfix are
  // removed here so no dead lookups remain.
  // Mobile AI buttons
  var mobileAiR = document.getElementById('mobile-ai-rewrite');
  if (mobileAiR) mobileAiR.addEventListener('click', function() { closeMobileMenu(); AIAssist.reviewAll('rewrite'); });
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

// ─── S488 Wave 3: sealed shared header (locked navy unification) ──────────
var _hdrCtl = null;
var _presenceNames = [];
var _inspectorLocked = false;
function _buildHeader(){
  var mount = document.getElementById('hdr-mount');
  if (!mount || _hdrCtl) return;
  var cfg = frtHeaderConfig({
    onBack: function(){ _leaveTool(); },                       /* S412 save-guarded */
    onHome: function(){
      var href = _hubMode ? _hubDashboardUrl() : '../index.html';
      _flushAndLeave(href);   /* S489c: always flush, never prompt */
    },
    onCloudClick: function(){ if (typeof _showCloudDiagnostic === 'function') _showCloudDiagnostic(); },
    onPresenceClick: function(){
      if (_presenceNames.length && typeof showAlert === 'function')
        showAlert('Currently in this project:\n\n\u2022 ' + _presenceNames.join('\n\u2022 '));
    },
    onInspector: _showInspectorModal,
    onLoad: function(){ var li = document.getElementById('load-input'); if (li) li.click(); },
    onExportAll: null,                                          /* live parity: unwired */
    onAiRewrite: function(){ AIAssist.reviewAll('rewrite'); },
    onAiUsage: function(){ AIUsage.open(); },
    onIssue: function(){ _issueReport(); },
    onExportPDF: function(){ initExportView.open(); },
    onCrbImport: function(){ openCrbImport(); },
    onDownloadJSON: function(){ initJSONExport.exportJSON(); },
    onExportDocs: function(){ initProjectDocsExport.run(); },
    onLoadProject: function(){ var li = document.getElementById('load-input'); if (li) li.click(); },
    onReupload: function(){ _reuploadAll(); },
    onRepairPhotos: function(){ _repairPhotos(); },
    /* S497h: R2 Cleanup wired to the S124 engine via _r2CleanupMenu (scan →
       show real counts → delete on confirm). onFixBlurry/onRepairLinks are
       gone with their menu rows — never implemented, so never wired. */
    onR2Cleanup: function(){ _r2CleanupMenu(); },
    onDiagnostics: function(){ if (typeof _showCloudDiagnostic === 'function') _showCloudDiagnostic(); },
    onQR: function(){ _showQR(); },
    onResetTab: function(){ _resetCurrentTab(); },
    onResetProject: function(){ _resetProject(); },
    onToggleTheme: toggleDarkMode,
    onTextSize: cycleTextSize,
    onSignout: function(){ _signOut(); }
  });
  _hdrCtl = buildHeader2(mount, cfg);
  window._frtHeaderCtl = _hdrCtl;   /* other modules + console access */
  /* seed state */
  _hdrCtl.setTheme(document.body.classList.contains('dark-mode') ? 'dark' : 'light');
  _hdrCtl.setControlIcon('ts', localStorage.getItem(LS_TEXT_SIZE) || 'S');
  _hdrCtl.setControlHidden('signout', !localStorage.getItem('sb-access-token'));
  fetch('../logo_base64.txt').then(function(r){ return r.text(); })
    .then(function(b64){ _hdrCtl.setLogo(b64.trim()); }).catch(function(){});
  if (_hubMode){
    _hdrCtl.setHubMode({ hub:true, backVisible:true, logoHref:'#', logoTitle:'Project dashboard' });
    _hdrCtl.setCloud({ visible:true });
  }
}

// S139 Phase 3: count pins that would land in the "Other Trade Items"
// band (untagged = first-obs trade empty). Contractor defics always count
// (incl. recs — they show with a REC chip in the band). General defics
// count only when NOT a recommendation; untagged no-contractor recs route
// to "Site Records · Recommendations" instead, governed by the recs gate.
// Pin-granularity approximation — fine for the modal hint.
function _countUntaggedForBand(proj) {
  var n = 0;
  function ptrade(d) { return (d && d.observations && d.observations[0] && d.observations[0].trade) || ''; }
  (proj.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(function(d) { if (!ptrade(d)) n++; });
  });
  (proj.generalDeficiencies || []).forEach(function(d) {
    if (!ptrade(d) && !(d && d.isRecommendation)) n++;
  });
  return n;
}

// ── S462: Photo-attention banner ─────────────────────────
// The permanent, visible surface for photo-durability problems. Ghost
// records festered for six weeks because failures only whispered to the
// console; this pill makes any sourceless/at-risk photo state impossible
// to miss on every device that opens the project. Idempotent — callers
// (sync verify pass, integrity boot summary) just report a count.
window._frtPhotoAttention = function(n) {
  var el = document.getElementById('frt-photo-attn');
  if (!n || n < 1) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('button');
    el.id = 'frt-photo-attn';
    el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9000;' +
      'background:#C98A4A;color:#fff;border:none;border-radius:20px;' +
      'padding:10px 16px;font-family:Calibri,sans-serif;font-size:14px;font-weight:bold;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;min-height:44px;';
    el.addEventListener('click', function(){
      try { if (window._frtIntegrityReport) window._frtIntegrityReport(); } catch(_){}
      el.remove();  // dismiss for this session; reappears next boot if unresolved
    });
    document.body.appendChild(el);
  }
  el.textContent = '\u26A0 ' + n + ' photo' + (n === 1 ? '' : 's') + ' need attention \u2014 ' +
    'open this project on the device that took ' + (n === 1 ? 'it' : 'them');
};

// ── Boot Sequence ────────────────────────────────────────
var FRT_BUILD = 'S498c';
try { window.FRT_BUILD = FRT_BUILD; } catch (e) {}
function boot() {
  console.info('%c[FRT] build ' + FRT_BUILD, 'background:#9C2742;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold;');
  console.log('[FRT v2] Booting...');
  var t0 = performance.now();

  // 1. Restore preferences (sync — before first paint)
  restoreDarkMode();
  restoreTextSize();

  // 2. Load logo (async)
  loadLogo();

  // 3. Detect Hub mode (sets _hubMode / _projectId / wires logo+back button)
  detectHubMode();

  // 4. Wire all event listeners
  wireEvents();

  // ── S129 boot perf ─────────────────────────────────────
  // Item 2: parallelize IDB.init and Auth.restoreSession. Auth doesn't read
  // IDB; the only thing that depends on IDB readiness is the fast-path
  // snapshot load below, which serializes against idbReady explicitly.
  //
  // Item 3: fast-path render. As soon as IDB is ready, if we have a token
  // and a local snapshot in IDB, render the UI BEFORE the cloud pull
  // resolves. Cloud pull continues in the background and overwrites Model
  // when it lands; we re-render the current tab so fresh data lands on
  // screen without forcing the user back to 'info'.
  //
  // Trade-off: a token-present-but-invalid case will flash the UI briefly
  // before the auth refresh fails and we redirect to Hub login. Acceptable
  // — preemptive refresh (Item 1) catches near-expiry tokens, and the
  // remaining failure modes are rare (revoked / wholly invalid tokens).
  var hasToken = _hubMode && _projectId && !!localStorage.getItem('sb-access-token');
  // S479 (Mark, item I): the sign-out buttons show whenever this DEVICE holds
  // a signed-in session (tokens present) — hub or standalone. The reveal used
  // to live ONLY inside the ?project= boot path, so at frt/ without a project
  // the header never had a sign-out button. Mark's report stands as written.
  // Clicking routes through the existing Auth.signOut(), which clears tokens
  // whether or not a session object was restored this boot.
  if (localStorage.getItem('sb-access-token')) {
    if (_hdrCtl) _hdrCtl.setControlHidden('signout', false);
    var _msoBoot = document.getElementById('mobile-signout-btn');
    if (_msoBoot) _msoBoot.style.display = '';
  }
  var idbReady = IDB.init();
  var authReady = hasToken ? Auth.restoreSession() : Promise.resolve(null);

  // S170 (Fix A) — initialize the photo outbox in parallel with everything
  // else. Resume picks up rows that were uploading when the tab was last
  // killed. This runs whether or not staging is active — the module
  // initializes its in-memory mirror regardless, and the activation flag
  // gates whether new uploads route through it.
  idbReady.then(function() {
    return BinaryOutbox.init();
  }).then(function() {
    return BinaryOutbox.resume();
  }).catch(function(e) {
    console.warn('[FRT v2] BinaryOutbox init failed (non-fatal):', e && e.message);
  });

  var _localRendered = false;

  // Fast-path render: hangs off idbReady, runs in parallel with authReady.
  var fastPathDone = idbReady.then(function() {
    console.log('[FRT v2] IDB ready');
    if (!hasToken) return null;  // standalone or signed-out → no fast path
    var instanceId = new URLSearchParams(window.location.search).get('instance');
    return SyncEngine.loadIDBSnapshot(_projectId, instanceId).then(function(snap) {
      if (snap) {
        Model.setProject(snap);
        showProjectView();
        _updateHeaderForProject();
        _restoreView();
        _localRendered = true;
        var elapsedFast = (performance.now() - t0).toFixed(0);
        console.log('[FRT v2] Boot complete (local) in ' + elapsedFast + 'ms — cloud pull in background');
      }
      return snap;
    });
  }).catch(function(e) {
    // Fast-path failure is non-fatal — main path will still render after cloud pull.
    console.warn('[FRT v2] Fast-path render skipped:', e && e.message);
    return null;
  });

  // Main path: wait for IDB + Auth, then cloud pull (Hub) or local-load (standalone).
  Promise.all([idbReady, authReady]).then(function(results) {
    var user = results[1];

    if (_hubMode && _projectId) {
      // Hub mode
      if (!user) {
        // Either no token (already known) or token present but refresh failed.
        // In both cases, redirect to Hub login.
        if (hasToken) {
          console.warn('[FRT v2] Auth session invalid — redirecting to Hub login');
        } else {
          console.warn('[FRT v2] No auth session — redirecting to Hub login');
        }
        var returnUrl = encodeURIComponent(window.location.href);
        window.location.href = _hubUrl('returnTo=' + returnUrl);
        return null;
      }

      console.log('[FRT v2] Authenticated as:', user.email);
      // S83: push user id into Model so newly-created entities get createdBy
      if (Model.setCurrentUser) Model.setCurrentUser(user.id);
      // S143 (Phase 3 G/3.5): inject the batch profiles fetcher so the
      // resolver can turn createdBy ids into name/initials/color. Reuses
      // the proven Auth.request profiles pattern. Standalone mode never
      // reaches here (no auth path) → resolver stays inert, chips hidden.
      if (Model.setInspectorFetch) {
        Model.setInspectorFetch(function (ids) {
          if (!ids || !ids.length) return Promise.resolve([]);
          return Auth.request('/rest/v1/profiles?id=in.(' + ids.join(',') + ')&select=id,full_name')
            .then(function (rows) { return rows || []; });
        });
      }
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
        // S143: seed the resolver so the current user's own observations
        // show a real-name chip immediately (no round-trip for self).
        if (Model.setInspectorEntry) Model.setInspectorEntry(user.id, fullName);
        _updateInspectorChip();
        // Lock chip in Hub mode — inspector identity is the authenticated
        // user's real name. Free-form editing in standalone mode still
        // works (no project URL param = no auth path).
        _inspectorLocked = true;   /* S488: engine chip — lock flag replaces the class */
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
      // Show sign-out button (engine)
      if (_hdrCtl) _hdrCtl.setControlHidden('signout', false);
      var mso = document.getElementById('mobile-signout-btn');
      if (mso) mso.style.display = '';
      // Read instance from URL
      var params = new URLSearchParams(window.location.search);
      var instanceId = params.get('instance');
      // S129: wait on fastPathDone so loadIDBSnapshot has set _lastSeen*
      // before pull() starts (lets pull() do a proper 3-way merge if needed).
      return fastPathDone.then(function() {
        // Initial load — adopt cloud (S263 gate bypassed; the fast-path IDB
        // snapshot sets _lastSeen* for the 3-way merge, and on first load there
        // is no in-progress local edit to protect).
        return SyncEngine.pull(_projectId, instanceId, { allowStaleOverwrite: true });
      });
    } else {
      // Standalone: load from IDB
      return Model.loadLastProject().then(function(loaded) {
        if (!loaded) {
          Model.newProject();
          console.log('[FRT v2] Created new empty project');
        }
        return null;
      });
    }
  }).then(function(data) {
    if (_hubMode && _projectId) {
      if (!data && !Model.getProject()) {
        // No cloud data AND no fast-path snapshot — create empty project
        Model.newProject();
        console.log('[FRT v2] Created new project for Hub');
      }
      window._frtCloudLoaded = !!data;
    }

    // S129 Item 3 — render gate. Two cases:
    //   (a) Fast-path already rendered: re-call switchTab on the CURRENT
    //       tab so cloud data lands on screen. _currentTab may have changed
    //       if the user navigated during the cloud-pull window.
    //   (b) Fast-path didn't render (standalone, no IDB snapshot, or fast-path
    //       skipped due to no token): this is the first render.
    if (_localRendered) {
      // Refresh current tab content with cloud-pulled data. Header re-render
      // is wired via Model.onChange('project') below.
      switchTab(_currentTab);
    } else {
      showProjectView();
      _updateHeaderForProject();
      _restoreView();
    }

    // Rebuild missing R2 URLs (safety net for sync issues)
    var proj = Model.getProject();
    if (proj) R2.rebuildUrls(proj);

    // S130 — Seed a brand-new report's Project Info from the Hub URL params.
    // The Hub passes pn/pname/client/addr when launching a tool instance, but
    // FRT historically ignored them, so every new report opened blank even
    // though the Hub already knew the project number, client, and address.
    //
    // GUARD: only seed when the instance is genuinely new — i.e. the core
    // info fields are all still empty. If the report already has any of
    // these filled (existing instance, or user already typed), do NOT
    // overwrite. This makes the seed safe to run on every boot.
    if (_hubMode && proj && proj.info) {
      var __sp = new URLSearchParams(window.location.search);
      var __urlPn    = __sp.get('pn')     || '';
      var __urlPname = __sp.get('pname')  || '';
      var __urlClient= __sp.get('client') || '';
      var __urlAddr  = __sp.get('addr')   || '';
      var __i = proj.info;
      var __isFresh = !__i.projectNumber && !__i.projectName &&
                      !__i.client && !__i.address;
      if (__isFresh && (__urlPn || __urlPname || __urlClient || __urlAddr)) {
        // updateField is the public mutation path — sets dirty, queues the
        // cloud save, and fires the 'field' change notification so the
        // Project Info tab re-renders the input live.
        if (__urlPn)     Model.updateField('projectNumber', __urlPn);
        if (__urlPname)  Model.updateField('projectName',   __urlPname);
        if (__urlClient) Model.updateField('client',        __urlClient);
        if (__urlAddr)   Model.updateField('address',       __urlAddr);
        console.log('[FRT v2] Seeded new report from Hub params:', __urlPn, '/', __urlPname);
        // Re-render the info tab if it's the current view so the user sees
        // the seeded values immediately (boot may have rendered it empty).
        if (_currentTab === 'info') switchTab('info');
      }
    }

    // Start auto-save
    Model.startAutoSave();

    // In Hub mode: start cloud sync heartbeat + process pending R2 uploads
    if (_hubMode && _projectId) {
      _startCloudSync(!!window._frtCloudLoaded);
      R2.processPendingUploads(_projectId);
    }

    var elapsed = (performance.now() - t0).toFixed(0);
    if (_localRendered) {
      console.log('[FRT v2] Cloud sync complete in ' + elapsed + 'ms total');
    } else {
      console.log('[FRT v2] Boot complete in ' + elapsed + 'ms');
    }

    // Update storage display
    _updateStorageDisplay();

    // Show mobile PDF button in project mode
    var mp = document.getElementById('mobile-pdf-btn');
    if (mp) mp.style.display = '';
    var mci = document.getElementById('mobile-crb-import-btn');
    if (mci) mci.style.display = '';   // S463: shown alongside Export PDF
    var mq = document.getElementById('mobile-qr-btn');
    if (mq) mq.style.display = ''; // S441: was hub-gated; header QR removed, so the menu entry now covers all project modes

    // S130 Proposal A — Deep-link pin focus from Hub photo gallery.
    // URL contract: ?project=<pid>&pinFocus=<deficId>&from=hub
    // After project is loaded and rendered, jump to the drawings tab and
    // open the viewer on the pin. Uses the existing _frtNavigateToPin hook
    // (defined in viewer/viewer.js) so the navigation matches the behavior
    // of the in-app "Go to drawing" buttons.
    try {
      var __pinFocusParams = new URLSearchParams(window.location.search);
      var __pinFocusId = __pinFocusParams.get('pinFocus');
      if (__pinFocusId) {
        // Defer 1 frame so the drawings tab content has finished mounting.
        setTimeout(function() {
          if (typeof window._frtNavigateToPin === 'function') {
            var ok = window._frtNavigateToPin(__pinFocusId);
            if (!ok) console.warn('[FRT v2] pinFocus deep-link failed — pin not found:', __pinFocusId);
          }
        }, 200);
      }
    } catch (_) {}

  }).catch(function(err) {
    console.error('[FRT v2] Boot error:', err);
    // Even if IDB/auth/pull fails, show the UI with a new project — unless
    // the fast-path already rendered something, in which case leave it.
    if (!_localRendered) {
      Model.newProject();
      showProjectView();
      _updateHeaderForProject();
      switchTab('info');
    }
  });

  // Update header whenever a new project is loaded (e.g., JSON import,
  // or cloud pull overwriting fast-path snapshot)
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
    'outbox-overlay',          // S175: photo upload detail modal
    'gp-overlay',              // gallery picker (P1.8)
    'add-defic-overlay',       // S138: unified + deficiency modal
    'activity-modal-overlay',  // Add Activity / Contractor Response / ARENCON Comment
    'ph-reassign-overlay',     // S121: photo reassign confirm (photos.js)
    'pin-editor-overlay',      // pin editor
    'ai-fs-overlay',           // AI full-screen field selector
    'ai-ps-overlay',           // legacy AI photo-suggest modal
    'insp-overlay',            // inspector picker
    'qr-overlay'               // QR code overlay
    /* S489c: 'leave-overlay' removed — the 3-button leave dialog no longer exists. */
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
    /* backdrop close disabled */ if(false){ modal.remove(); return; }
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
  lockScroll();
  (function(){ var _r = false, _o = modal.remove.bind(modal);
    modal.remove = function(){ if (_r) return _o(); _r = true; _o(); unlockScroll(); }; })();
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

// ── S163 Fix C (V-9) / S207 update: SW update propagation ───────
// When a new service worker activates, it broadcasts {type:'sw-updated'}
// to every controlled client (see sw.js activate handler). The client
// flushes Model to IDB so any in-flight unsaved state survives a later
// reload (Fix E protects the leave-dialog path; this protects the
// SW-driven path with the same primitive).
//
// S207 change: we NO LONGER force a reload. The original force-reload
// (1200ms timer) could yank the page mid-task — mid-observation, mid
// drawing markup, mid photo upload — which is unacceptable in the field.
// Instead we surface a non-disruptive "Update ready" banner; the user
// refreshes at a safe stopping point. _doUpdateReload() persists the
// current tab + scroll position to sessionStorage first, so the refresh
// returns them to where they were rather than the Info tab at scroll 0.
//
// Without an update path at all, safety-critical fixes shipped to GitHub
// can sit unused on cached devices for up to 24 hours (SW byte-comparison
// max-age) or indefinitely until a manual hard-refresh. The banner keeps
// that propagation guarantee while leaving the *timing* in the user's hands.
//
// Once-guard: _swUpdatedHandled prevents the banner re-appearing if the
// SW re-broadcasts (multi-tab races, repeated activations).

// S207: sessionStorage keys for tab/scroll restore across an update reload.
var SS_RESTORE_TAB = 'arencon-frt-restore-tab';
var SS_RESTORE_SCROLL = 'arencon-frt-restore-scroll';

// Persist current view, then reload. Called by the banner Refresh button
// (and the indicator's re-opened banner). Tab-level + best-effort scroll;
// pin-level restore is not state-tracked today so we do not claim it.
function _doUpdateReload() {
  try {
    sessionStorage.setItem(SS_RESTORE_TAB, _currentTab || 'info');
    var panel = document.querySelector('.panel.active');
    // The scrollable element is usually the active panel; fall back to the
    // main wrap if the panel itself isn't the scroll container.
    var sc = 0;
    if (panel && panel.scrollTop) sc = panel.scrollTop;
    if (!sc) {
      var mw = document.querySelector('.main-wrap');
      if (mw && mw.scrollTop) sc = mw.scrollTop;
    }
    sessionStorage.setItem(SS_RESTORE_SCROLL, String(sc || 0));
  } catch(_) {}
  // Flush once more in case anything changed after the sw-updated flush.
  Promise.resolve()
    .then(function(){ if (typeof Model !== 'undefined' && Model.saveNow) return Model.saveNow(); })
    .catch(function(){})
    .then(function(){ window.location.reload(); });
}

// Small persistent indicator (bottom-right), shown after "Not now".
// Tapping it re-opens the banner. Matches the tile-prefetch badge style.
function _showUpdateReadyIndicator() {
  if (document.getElementById('frt-update-indicator')) return;
  var d = document.createElement('div');
  d.id = 'frt-update-indicator';
  d.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9001;' +
    'background:rgba(28,36,52,.94);color:#f0d6dd;font:600 12px/1.3 Calibri,sans-serif;' +
    'padding:7px 13px;border-radius:16px;border:1px solid #9C2742;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer;display:flex;align-items:center;gap:6px;';
  d.innerHTML = '<span style="font-size:13px;">\u2728</span><span>Update ready</span>';
  d.title = 'A new version is ready — tap to refresh';
  d.addEventListener('click', function(){
    var ex = document.getElementById('frt-update-indicator');
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
    _showUpdateReadyBanner();
  });
  document.body.appendChild(d);
}

// Top-center "Update ready" banner. Refresh reloads (preserving view);
// "Not now" dismisses to the small indicator. Mirrors the remote-update
// banner construction so styling stays consistent (Calibri, #9C2742 CTA).
function _showUpdateReadyBanner() {
  // Banner and indicator are mutually exclusive.
  var ind = document.getElementById('frt-update-indicator');
  if (ind && ind.parentNode) ind.parentNode.removeChild(ind);
  if (document.getElementById('frt-update-ready-banner')) return;
  var b = document.createElement('div');
  b.id = 'frt-update-ready-banner';
  b.style.cssText =
    'position:fixed;top:60px;left:50%;transform:translateX(-50%);' +
    'z-index:99999;background:#1B2438;color:#fff;border:1px solid #9C2742;' +
    'border-radius:8px;padding:10px 14px;font:14px Calibri,sans-serif;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.4);display:flex;align-items:center;gap:12px;' +
    'max-width:90vw;';
  b.innerHTML =
    '<span>\u2728 A new version is ready.</span>' +
    '<button id="frt-update-refresh" style="background:#9C2742;color:#fff;border:none;border-radius:6px;padding:6px 12px;font:600 13px Calibri,sans-serif;cursor:pointer;">Refresh</button>' +
    '<button id="frt-update-later" style="background:transparent;color:#c8ccd4;border:1px solid #3a4660;border-radius:6px;padding:6px 10px;font:13px Calibri,sans-serif;cursor:pointer;">Not now</button>';
  document.body.appendChild(b);
  document.getElementById('frt-update-refresh').addEventListener('click', function(){
    b.remove();
    _doUpdateReload();
  });
  document.getElementById('frt-update-later').addEventListener('click', function(){
    b.remove();
    _showUpdateReadyIndicator();
  });
}

var _swUpdatedHandled = false;
if ('serviceWorker' in navigator && navigator.serviceWorker.addEventListener) {
  navigator.serviceWorker.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'sw-updated' || _swUpdatedHandled) return;
    _swUpdatedHandled = true;
    // S207: do NOT force-reload. A field inspector mid-deficiency (typing an
    // observation, mid drawing markup, photo half-uploaded) must never have the
    // page yanked out from under them by a background SW activation. Instead we
    // flush Model to IDB (preserves the safety primitive that protected against
    // the S162 field-day loss) and surface a non-disruptive "Update ready"
    // banner. The user refreshes when *they* are at a safe stopping point.
    // _showUpdateReadyBanner() persists current tab + scroll before reloading,
    // so refreshing doesn't dump them back on the Info tab scrolled to top.
    Promise.resolve()
      .then(function() {
        if (typeof Model !== 'undefined' && Model.saveNow) return Model.saveNow();
      })
      .catch(function(){})
      .then(function() {
        // S284c (Mark): banner fatigue fix — many concurrent build sessions
        // bump the SW several times a day, and the top banner interrupted on
        // every load. Policy: the interrupting banner shows at most ONCE per
        // browser session; later updates in the same session surface only the
        // small bottom-right indicator and apply naturally on the next reload.
        // Model.saveNow() above still runs every time (S162 safety primitive).
        var _seen = false;
        try { _seen = sessionStorage.getItem('frt-upd-banner-shown') === '1'; } catch(_) {}
        if (_seen) { _showUpdateReadyIndicator(); return; }
        try { sessionStorage.setItem('frt-upd-banner-shown', '1'); } catch(_) {}
        _showUpdateReadyBanner();
      });
  });
}

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
  // S126 Phase D — memory + sync diagnostics. Use:
  //   window._frt.diagnostics.memory.report()  → printable snapshot
  //   window._frt.diagnostics.memory.canvasMP() → live MP per canvas
  //   window._frt.diagnostics.sync.emptyArrayGuards → C-guard fire count
  //   window._frt.diagnostics.sync.emptyArrayLog → recent guard events
  diagnostics: Diag,
  version: '2.0.0-alpha',
  phase: '1-A'
};

// S126 Phase D — Start the 60-second memory probe. Single one-line console
// log per tick when a drawing is open; silent otherwise. Diagnostic only.
try { Diag.memory.startProbe(60000); } catch(_) {}

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
          if (data){ _lastPulledUpdatedAt = remoteTs; _setCloudStatus('synced', 'Refreshed from cloud'); _repaintAfterPull(); }
          resolve({ checked:true, remoteNewer:true, pulled:!!data });
        });
      } else {
        _showRemoteUpdateBanner(remoteTs);
        resolve({ checked:true, remoteNewer:true, pulled:false, dirtyLocal:true });
      }
    }).catch(function(){ resolve({ checked:false, remoteNewer:false, pulled:false, reason:'error' }); });
  });
};

