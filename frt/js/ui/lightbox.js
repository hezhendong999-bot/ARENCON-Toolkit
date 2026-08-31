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
import { Model } from '../data/model.js';

/* ═══ S715 — THE PHOTOGRAPH, NOT THE PREVIEW ════════════════════════════════
   A camera photo's bytes live on the device until R2 confirms, so before the
   viewer shows one it is handed a transient object URL for those bytes. The
   ladder in lightboxHooks reads _localUrl first, so full resolution is what
   opens even with no signal.

   Only records that need it are touched: no r2Url, no dataUrl, not already
   hydrated. Everything synced, and every pre-S715 photo, is untouched.

   The window either side is hydrated too, so a swipe lands on a photograph
   rather than briefly on its preview. Two either side, not the whole list —
   hydrating 104 photographs at once is the pile-up S715 exists to remove.

   Revoked on close. The URLs are per-session and _localUrl is stripped on
   both persist paths, so nothing dead is ever written or synced. */
var _localUrls = [];
var _openPhotos = null;
function _needsBytes(p) { return !!(p && p.id && !p._localUrl && !p.r2Url && !p.dataUrl); }
function _hydrateWindow(photos, idx) {
  if (!photos || !photos.length) return Promise.resolve();
  var want = [];
  for (var i = Math.max(0, idx - 2); i <= Math.min(photos.length - 1, idx + 2); i++) {
    if (_needsBytes(photos[i])) want.push(photos[i]);
  }
  if (!want.length) return Promise.resolve();
  // One at a time — same rule as the export path.
  return want.reduce(function (chain, p) {
    return chain.then(function () {
      return Model.resolvePhotoBytes(p).then(function (blob) {
        if (!blob) return;
        try { p._localUrl = URL.createObjectURL(blob); _localUrls.push(p._localUrl); } catch (_) {}
      }).catch(function () {});
    });
  }, Promise.resolve());
}
function _releaseLocalUrls(photos) {
  try {
    (photos || []).forEach(function (p) { if (p && p._localUrl) delete p._localUrl; });
    _localUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (_) {} });
  } catch (_) {}
  _localUrls = [];
}

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
    /* S715: hydrate device bytes BEFORE showing. Opening is a deliberate tap,
       so the short read is invisible; showing the 480px preview first and
       swapping would flash a soft image at an inspector judging a deficiency. */
    _openPhotos = photos || null;
    _hydrateWindow(photos, idx || 0).then(function () {
      lb.open(photos, idx || 0, opts || {});
      /* Keep swiping ahead of the viewer. Fire-and-forget — the ladder uses
         whatever has landed by the time a photo is actually shown. */
      setTimeout(function () { _hydrateWindow(photos, (idx || 0) + 4); }, 0);
      setTimeout(function () { _hydrateWindow(photos, Math.max(0, (idx || 0) - 4)); }, 0);
    });
  },
  close: function () {
    var lb = _lb(); if (lb) lb.close();
    _releaseLocalUrls(_openPhotos);   // S715: URLs die with the viewer, never with the record
    _openPhotos = null;
  },
  isOpen: function () { var lb = _shell; return !!(lb && lb.isOpen && lb.isOpen()); },
  flushForUnload: _flushMarkupForUnload,
  restoreRescue: _restoreMarkupRescue,
  activePhoto: function () { return _hk()._current(); }
};

window._frtLightbox = Lightbox;
