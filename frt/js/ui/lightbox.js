/**
 * ARENCON FRT — Photo Lightbox (S679-C, unification Phase L3: THE CUTOVER)
 * ═══════════════════════════════════════════════════════════════════════
 * FRT's 1,894-line viewer is gone. This file is now a thin contract shim:
 * the viewer that opens is the SHARED SHELL (lib/ui/lightbox.js, loaded as a
 * classic script by frt/index.html) built with FRT's personality
 * (frt/js/ui/lightboxHooks.js). One engine, personality per tool — the
 * shared-engine rule made literal: the host DELETED its implementation and
 * CALLS the engine.
 *
 * WHAT CONSUMERS KEEP (the measured external contract, S679-C):
 *   window._frtLightbox.open(photos, idx, opts)   — all six call sites
 *   window._frtLightbox.isOpen() / .close()       — Android back-peel (app.js)
 *   window._frtLightbox.flushForUnload()          — pagehide flush (app.js)
 *   window._frtLightbox.restoreRescue(photos)     — boot repair
 *   window._frtLightbox.activePhoto()
 *
 * FIXED WHILE CUTTING OVER (Owner-authorized cleanup, S679): the S650 rescue
 * RESTORE half was exported but never called anywhere — a rescue written by a
 * dying tab was never read back. It is now wired where it belongs: every
 * open() repairs the photos it was handed before showing them.
 *
 * Scope stays the caller's choice: the pin editor passes its own short list
 * (deliberately walled, Owner's standing instruction); the trash viewer
 * passes one photo; every other surface routes through photoNav's
 * project-wide running order (S677).
 */
import { buildFrtLightboxHooks } from './lightboxHooks.js';

var _hooks = null;
var _shell = null;

function _hk() {
  if (!_hooks) _hooks = buildFrtLightboxHooks({ markupEngine: window.MarkupEngine || null });
  return _hooks;
}
function _lb() {
  if (_shell) return _shell;
  if (!window.LightboxShell || !window.LightboxShell.build) {
    console.error('[FRT lightbox] lib/ui/lightbox.js (shared shell) is not loaded — check frt/index.html script order');
    return null;
  }
  _shell = window.LightboxShell.build(_hk());
  return _shell;
}

/* ── the rescue feature's protected names live on (S628c/S650) ── */
var RESCUE_KEY = 'frt_markup_rescue_v1';
function _flushMarkupForUnload() {
  var eng = window.MarkupEngine;
  return _hk().flushForUnload(!!(eng && eng.canvas));
}
function _restoreMarkupRescue(photos) { return _hk().restoreRescue(photos); }
function _clearMarkupRescue() { try { localStorage.removeItem(RESCUE_KEY); } catch (_) {} }

/* pagehide fires on tab close / Android backgrounding; visibilitychange
   catches the swipe-away. Both cheap, both idempotent — same arming the old
   viewer had (S628c). */
try {
  window.addEventListener('pagehide', function () { _flushMarkupForUnload(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') _flushMarkupForUnload();
  });
} catch (_) {}

export var Lightbox = {
  open: function (photos, idx, opts) {
    var lb = _lb(); if (!lb) return;
    /* S650 restore, wired at last: repair rescued strokes onto any handed
       record that came back without them, BEFORE it is shown. */
    try { _restoreMarkupRescue(photos); } catch (_) {}
    /* old-contract courtesy: opts.contextLabel labels photos that carry none */
    if (opts && opts.contextLabel && photos && photos.forEach) {
      photos.forEach(function (p) { if (p && !p._ctxLabel) p._ctxLabel = opts.contextLabel; });
    }
    lb.open(photos, idx || 0, opts || {});
  },
  close: function () { var lb = _lb(); if (lb) lb.close(); },
  isOpen: function () { var lb = _shell; return !!(lb && lb.isOpen && lb.isOpen()); },
  flushForUnload: _flushMarkupForUnload,
  restoreRescue: _restoreMarkupRescue,
  activePhoto: function () { return _hk()._current(); }
};

window._frtLightbox = Lightbox;
