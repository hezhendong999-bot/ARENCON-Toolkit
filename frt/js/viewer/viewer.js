/**
 * ARENCON FRT v2 — Drawing Viewer
 * ════════════════════════════════
 * 
 * Full-screen drawing viewer with pan/zoom.
 * Phase 1: image display from R2 with CSS transform pan/zoom.
 * Phase 4+5 will add tile-based rendering and WebGL markup.
 */

import { Model } from '../data/model.js';
import { IDB } from '../data/idb.js';
import { R2 } from '../data/r2.js';
import { Markup } from './markup.js';
import { TiledPdf } from './tiledPdf.js';
import { toast } from '../shared/toast.js';
import { showConfirm } from '../shared/dialogs.js';

// ── WebGL pins (Phase 5 polish → S81 Option B: now Canvas 2D) ────────────
// Name kept for API compatibility; pinsGL.js is Canvas 2D as of v2.0.
//   ?webgl-pins=0 → force HTML fallback (legacy path)
//   default       → Canvas 2D pins (fixed screen size, no GL context)
var _useGLPins = (function(){
  try {
    if (window.location && window.location.search){
      if (window.location.search.indexOf('webgl-pins=0') >= 0) return false;
    }
    if (localStorage.getItem('ARENCON_NoWebGLPins') === '1') return false;
    return !!(window.PinsGL && window.PinsGL.isSupported && window.PinsGL.isSupported());
  } catch(_){ return false; }
})();
var _glPinsReady = false;
var _glPinsInitPromise = null;
function _ensureGLPinsInit(){
  if (!_useGLPins) return Promise.resolve(false);
  if (_glPinsReady) return Promise.resolve(true);
  if (_glPinsInitPromise) return _glPinsInitPromise;
  var host = document.getElementById('dv-canvas-area');
  if (!host || !window.PinsGL){ _useGLPins = false; return Promise.resolve(false); }
  _glPinsInitPromise = window.PinsGL.init(host, { w: host.clientWidth, h: host.clientHeight })
    .then(function(){
      _glPinsReady = true; _glPinsInitPromise = null;
      console.log('[Viewer] WebGL pins ready (Pixi.js v' + ((window.PIXI && window.PIXI.VERSION) || '?') + ')');
      _renderPins();
      return true;
    })
    .catch(function(err){
      console.warn('[Viewer] WebGL pins init failed, falling back to HTML:', err);
      _useGLPins = false; _glPinsInitPromise = null; return false;
    });
  return _glPinsInitPromise;
}

// Uniform pin hit-test: returns deficId at screen coords, null if none.
// HTML path uses bbox hit-test against rendered .pin-marker elements so pins
// remain clickable even when #markup-canvas has pointer-events:auto (any
// markup tool active). Earlier DOM-closest fallback failed in that state.
function _resolvePinAt(clientX, clientY, evTarget){
  if (_useGLPins && _glPinsReady && window.PinsGL){
    return window.PinsGL.hitTest(clientX, clientY);
  }
  // Fast path: direct DOM hit
  var direct = evTarget && evTarget.closest && evTarget.closest('.pin-marker[data-defic-id]');
  if (direct) return direct.getAttribute('data-defic-id');
  // Fallback: bbox hit-test across all pin-marker elements (covers markup-overlay case)
  var markers = document.querySelectorAll('.pin-marker[data-defic-id]');
  for (var i = 0; i < markers.length; i++){
    var r = markers[i].getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom){
      return markers[i].getAttribute('data-defic-id');
    }
  }
  return null;
}

// ── Pin hover: cursor (finger) + tooltip (deficiency # + observations) ──
var _pinTooltipEl = null;
var _pinHoverLastIds = '';

function _ensureTooltipEl(){
  if (_pinTooltipEl) return _pinTooltipEl;
  var el = document.createElement('div');
  el.id = 'dv-pin-tooltip';
  el.style.cssText =
    'position:fixed;z-index:9999;pointer-events:none;' +
    'background:rgba(15,23,42,.95);color:#e8eef8;' +
    'border:1px solid rgba(255,255,255,.15);' +
    'border-radius:6px;padding:8px 10px;' +
    'font:600 12px/1.45 Calibri,sans-serif;' +
    'max-width:340px;min-width:180px;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.5);' +
    'display:none;white-space:normal;';
  document.body.appendChild(el);
  _pinTooltipEl = el;
  return el;
}

function _escHtml(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _buildTooltipHTML(deficIds){
  var rows = [];
  for (var i = 0; i < deficIds.length; i++){
    var f = Model.findDeficiency(deficIds[i]);
    if (!f) continue;
    var d = f.defic;
    var num = d.num;
    var obs = d.observations || [];
    if (!obs.length){
      var desc = d.description || '(no description)';
      rows.push(
        '<div style="margin:2px 0;"><span style="color:#ef4444;font-weight:700">#' + num + '</span> ' +
        _escHtml(desc) + '</div>'
      );
    } else {
      for (var j = 0; j < obs.length; j++){
        var t = (obs[j] && obs[j].text) ? obs[j].text : '(empty observation)';
        rows.push(
          '<div style="margin:2px 0;"><span style="color:#ef4444;font-weight:700">#' + num + '.' + (j + 1) + '</span> ' +
          _escHtml(t) + '</div>'
        );
      }
    }
  }
  return rows.join('');
}

function _hideTooltip(){
  if (_pinTooltipEl) _pinTooltipEl.style.display = 'none';
  _pinHoverLastIds = '';
}

function _positionTooltip(clientX, clientY){
  if (!_pinTooltipEl) return;
  var tw = _pinTooltipEl.offsetWidth;
  var th = _pinTooltipEl.offsetHeight;
  var pad = 14;
  var x = clientX + pad;
  var y = clientY + pad;
  if (x + tw > window.innerWidth - 8) x = clientX - tw - pad;
  if (y + th > window.innerHeight - 8) y = clientY - th - pad;
  if (x < 4) x = 4;
  if (y < 4) y = 4;
  _pinTooltipEl.style.left = x + 'px';
  _pinTooltipEl.style.top  = y + 'px';
}

function _setCanvasCursor(cur){
  var host = document.getElementById('dv-canvas-area');
  if (!host) return;
  if (cur) host.style.cursor = cur;
  else host.style.removeProperty('cursor');
  // S81 Bug #4: mirror cursor intent as data attribute so CSS can override child
  // elements (#markup-canvas, #markup-webgl-canvas) that have their own cursor:
  // rules and pointer-events:auto. Inline style on parent doesn't reach children.
  if (cur === 'pointer') host.setAttribute('data-pin-hover', '1');
  else host.removeAttribute('data-pin-hover');
}

function _updatePinHover(clientX, clientY){
  if (!_useGLPins || !_glPinsReady || !window.PinsGL) return;
  // Pin-drop mode: nothing clickable regarding existing pins
  if (_pinModeDeficId){
    _hideTooltip();
    _setCanvasCursor('');
    _setGLHover(null);
    return;
  }
  // Don't update hover during an active drag (but DO keep tooltip following — handled in drag move)
  if (_pinDragging || _pinMouseDragging){
    return;
  }
  var ids = window.PinsGL.hitTestAll(clientX, clientY);
  if (!ids.length){
    _hideTooltip();
    _setCanvasCursor('');
    _setGLHover(null);
    return;
  }
  // Cursor pointer whenever hovering a pin (any tool mode except pin-drop which returned above)
  _setCanvasCursor('pointer');
  _setGLHover(ids[0]);
  // Tooltip always shown on hover
  var key = ids.join(',');
  if (key !== _pinHoverLastIds){
    _pinHoverLastIds = key;
    var el = _ensureTooltipEl();
    el.innerHTML = _buildTooltipHTML(ids);
    el.style.display = 'block';
  }
  _positionTooltip(clientX, clientY);
}

// Re-render pins with a hover highlight on the given id (null = clear)
var _lastHoveredId = null;
var _lastActiveId = null;
var _lastReadyId  = null;   // S81: V1 press-and-hold "ready to drag" state
function _setGLHover(id){
  if (id === _lastHoveredId) return;
  _lastHoveredId = id;
  _renderPinsWithState();
}
function _setGLActive(id){
  if (id === _lastActiveId) return;
  _lastActiveId = id;
  _renderPinsWithState();
}
// Light wrapper: re-renders pins preserving current hover/active state
function _renderPinsWithState(){
  if (!_useGLPins || !_glPinsReady || !window.PinsGL) return;
  var wasDragging = _pinDragging, wasMouseDragging = _pinMouseDragging;
  _pinDragging = false; _pinMouseDragging = false;
  _renderPins();
  _pinDragging = wasDragging; _pinMouseDragging = wasMouseDragging;
}

document.addEventListener('mousemove', function(e){
  if (_pinDragging || _pinMouseDragging) return;
  _updatePinHover(e.clientX, e.clientY);
});
document.addEventListener('mouseleave', _hideTooltip);
window.addEventListener('scroll', _hideTooltip, true);

// ── TiledPdf init (one-shot, lazy) ───────────────────────
var _tiledInited = false;
function _ensureTiledInit() {
  if (_tiledInited) return;
  _tiledInited = true;
  TiledPdf.init({
    getViewState: function() { return { scale: _scale, panX: _panX, panY: _panY }; },
    getDrawing: function(id) {
      var list = _getDrawingsList();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    getPdfBuf: function(id) {
      // Resolve drawing → pdfBufKey → pdfBufs store
      var list = _getDrawingsList();
      var d = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) { d = list[i]; break; }
      var key = (d && d.pdfBufKey) ? d.pdfBufKey : id;
      return IDB.get('pdfBufs', key).catch(function() { return null; });
    },
    savePdfBuf: function(id, buf) { return IDB.put('pdfBufs', { id: id, buf: buf }).catch(function() {}); },
    // S83: lazy migration — legacy drawings have pdfBufKey in IDB but no R2 url.
    // Upload once when the user opens them, patch drawing.pdfBufR2Url, let sync push.
    lazyUploadPdfBuf: function(drawing, arrayBuf){
      if (!drawing || !drawing.pdfBufKey || !arrayBuf) return;
      var pid = new URLSearchParams(window.location.search).get('project');
      if (!pid || typeof R2 === 'undefined' || !R2.uploadPdfBuf) return;
      // Clone buffer so caller's reference to it isn't consumed by fetch
      var copy;
      try { copy = arrayBuf.slice ? arrayBuf.slice(0) : arrayBuf; } catch(e){ return; }
      R2.uploadPdfBuf(pid, drawing.pdfBufKey, copy).then(function(r){
        if (r && r.r2Url){
          drawing.pdfBufR2Url = r.r2Url;
          console.log('[TiledPdf] Lazy-migrated PDF buffer to R2:', drawing.id);
          if (typeof Model !== 'undefined' && Model.saveNow) Model.saveNow();
        }
      }).catch(function(err){ console.warn('[TiledPdf] lazy migrate failed:', err && err.message); });
    },
    showLoading: function(msg) {
      var ov = document.getElementById('tiled-pdf-loading');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'tiled-pdf-loading';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9700;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;color:white;font-size:15px;';
        ov.innerHTML = '<div style="background:#1B2438;padding:18px 28px;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.4);display:flex;align-items:center;gap:14px;"><div style="width:22px;height:22px;border:3px solid rgba(255,255,255,.25);border-top-color:#9C2742;border-radius:50%;animation:tplSpin 0.9s linear infinite;"></div><span id="tpl-msg"></span></div><style>@keyframes tplSpin{to{transform:rotate(360deg)}}</style>';
        document.body.appendChild(ov);
      }
      var m = ov.querySelector('#tpl-msg');
      if (m) m.textContent = msg || 'Loading…';
      ov.style.display = 'flex';
    },
    hideLoading: function() {
      var ov = document.getElementById('tiled-pdf-loading');
      if (ov) ov.style.display = 'none';
    },
    toast: function(msg) { try { toast(msg); } catch(e) { console.warn('[TiledPdf] ' + msg); } },
    onFallbackImage: function(d, id) {
      // PDF path failed — fall back to raster image load
      var img = document.getElementById('dv-image');
      if (!img) return;
      var url = d.r2Url || d.dataUrl || d.thumb;
      if (url) _loadImgFallback(url, d, 'pdf-fallback');
    },
    onReady: function(dims) {
      // Size wrapper to match drawing dims, then fit
      var wrap = document.getElementById('dv-img-wrap');
      if (wrap) { wrap.style.width = dims.drawW + 'px'; wrap.style.height = dims.drawH + 'px'; }
      _calcFitScaleFromDims(dims.drawW, dims.drawH);
      _scale = _fitScale; _panX = 0; _panY = 0;
      _applyTransform();
      _renderPins();
      TiledPdf.scheduleRender();
    }
  });
}

function _calcFitScaleFromDims(w, h) {
  var area = document.getElementById('dv-canvas-area');
  if (!area || !w || !h) { _fitScale = 1; return; }
  var sx = area.clientWidth / w, sy = area.clientHeight / h;
  _fitScale = Math.min(sx, sy);
  if (_fitScale > 1) _fitScale = 1;
}

function _isPdfDrawing(d) {
  if (!d) return false;
  if (d.pdfTiled === true) return true;
  if (d.mimeType === 'application/pdf') return true;
  var u = d.r2Url || d.dataUrl || '';
  return /\.pdf($|\?)/i.test(u);
}

// Diagnostic — paste in console: window._tplDiag()
window._tplDiag = function() {
  var dims = TiledPdf.getDimensions();
  var list = _getDrawingsList();
  var pdfDwgs = list.filter(function(x) { return x.pdfTiled; });
  console.log('=== TiledPdf Diagnostic ===');
  console.log('Active:', TiledPdf.isActive());
  console.log('Dimensions:', dims);
  console.log('pdfjsLib loaded:', typeof pdfjsLib !== 'undefined');
  console.log('ensurePdfJs available:', typeof window.ensurePdfJs === 'function');
  console.log('Total drawings:', list.length, '— Tiled PDF drawings:', pdfDwgs.length);
  if (pdfDwgs.length) {
    var s = pdfDwgs[0];
    console.log('Sample:', { id: s.id, name: s.name, pdfPage: s.pdfPage, pdfBufKey: s.pdfBufKey });
    IDB.get('pdfBufs', s.pdfBufKey).then(function(rec) {
      console.log('pdfBufs lookup:', rec && rec.buf ? ('FOUND, ' + Math.round(rec.buf.byteLength/1024) + 'KB') : 'NOT FOUND');
    }).catch(function(e) { console.log('pdfBufs error:', e.message); });
  }
  return 'OK';
};

function _loadImgFallback(url, d, label) {
  var img = document.getElementById('dv-image');
  if (!img) return;
  img.style.visibility = 'hidden';
  function _finish(finalUrl){
    img.onload = function() {
      _calcFitScale();
      _scale = _fitScale; _panX = 0; _panY = 0;
      _applyTransform();
      _renderPins();
      img.style.visibility = 'visible';
      Markup.init(d.id);
    };
    img.src = finalUrl;
    img.style.display = 'block';
  }
  // S83b: iPad/iPhone can't hold giant rasters as a single <img>.
  // Downscale if pixel count > budget.
  var isTouch = false;
  try { isTouch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches; } catch(_){}
  if (!isTouch){ _finish(url); return; }
  var budget = 12 * 1000 * 1000;
  var probe = new Image();
  probe.crossOrigin = 'anonymous';
  probe.onload = function(){
    var w = probe.naturalWidth, h = probe.naturalHeight;
    if (w * h <= budget){ _finish(url); return; }
    var ratio = Math.sqrt(budget / (w * h));
    var tw = Math.max(1, Math.floor(w * ratio));
    var th = Math.max(1, Math.floor(h * ratio));
    var c = document.createElement('canvas');
    c.width = tw; c.height = th;
    try {
      c.getContext('2d').drawImage(probe, 0, 0, tw, th);
      c.toBlob(function(blob){
        if (!blob){ c.width=1; c.height=1; _finish(url); return; }
        var objUrl = URL.createObjectURL(blob);
        c.width=1; c.height=1;
        console.log('[Viewer] iPad fallback downscale ' + w + '×' + h + ' → ' + tw + '×' + th);
        _finish(objUrl);
      }, 'image/jpeg', 0.85);
    } catch(e){
      c.width=1; c.height=1;
      _finish(url);
    }
  };
  probe.onerror = function(){ _finish(url); };
  probe.src = url;
}

var _currentDrawingIdx = -1;
var _drawings = [];
var _scale = 1;
var _fitScale = 1;
var _panX = 0;
var _panY = 0;
var _dragging = false;
var _lastX = 0;
var _lastY = 0;

function _getDrawingsList() {
  return Model.getDrawings();
}

function _applyTransform() {
  _clampPan();
  var wrap = document.getElementById('dv-img-wrap');
  if (wrap) {
    wrap.style.transform = 'translate3d(' + _panX + 'px,' + _panY + 'px,0) scale(' + _scale + ')';
  }
  if (TiledPdf.isActive()) TiledPdf.scheduleRender();
  // GL pins live outside dv-img-wrap and must be re-rendered on every transform.
  // HTML pins are children of dv-img-wrap, so they auto-transform; cheap early-out.
  if (_useGLPins && _glPinsReady) _renderPins();
}

function _clampPan() {
  var img = document.getElementById('dv-image');
  var area = document.getElementById('dv-canvas-area');
  if (!area) return;
  var natW = 0, natH = 0;
  if (TiledPdf.isActive()) {
    var dims = TiledPdf.getDimensions();
    if (dims) { natW = dims.drawW; natH = dims.drawH; }
  } else if (img && img.naturalWidth) {
    natW = img.naturalWidth; natH = img.naturalHeight;
  }
  if (!natW || !natH) return;

  var aw = area.clientWidth;
  var ah = area.clientHeight;
  var sw = natW * _scale;
  var sh = natH * _scale;

  if (sw <= aw) {
    // Image fits horizontally — center it
    _panX = (aw - sw) / 2;
  } else {
    // Image wider than viewport — clamp edges
    _panX = Math.min(0, Math.max(aw - sw, _panX));
  }

  if (sh <= ah) {
    // Image fits vertically — center it
    _panY = (ah - sh) / 2;
  } else {
    // Image taller than viewport — clamp edges
    _panY = Math.min(0, Math.max(ah - sh, _panY));
  }
}

function _resetView() {
  _scale = _fitScale;
  _panX = 0;
  _panY = 0;
  // S82: route through _applyTransform — it does _clampPan + transform +
  // TiledPdf.scheduleRender + _renderPins (pin re-position on zoom change).
  // Previously this just set wrap.style.transform inline, leaving GL pins
  // anchored to stale imgRect. Bug surfaced when bottombar fit button
  // became easier to tap on mobile.
  _applyTransform();
}

// Zoom controls (used by markup.js zoom buttons)
window._frtZoomIn = function() {
  _scale = Math.min(8, _scale * 1.3);
  _applyTransform();
};
window._frtZoomOut = function() {
  _scale = Math.max(_fitScale, _scale / 1.3);
  if (_scale <= _fitScale) { _panX = 0; _panY = 0; }
  _applyTransform();
};
window._frtZoomFit = function() {
  _resetView();
};

function _calcFitScale() {
  var img = document.getElementById('dv-image');
  var area = document.getElementById('dv-canvas-area');
  if (!img || !area || !img.naturalWidth) { _fitScale = 1; return; }
  var aw = area.clientWidth;
  var ah = area.clientHeight;
  var iw = img.naturalWidth;
  var ih = img.naturalHeight;
  _fitScale = Math.min(aw / iw, ah / ih);
  if (_fitScale > 1) _fitScale = 1; // Don't upscale small images
}

// Recalculate on viewport resize (fixes DevTools open/close, orientation change, etc.)
var _resizeTimer = null;
window.addEventListener('resize', function() {
  var overlay = document.getElementById('drawing-viewer-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(function() {
    if (TiledPdf.isActive()) {
      var dims = TiledPdf.getDimensions();
      if (dims) _calcFitScaleFromDims(dims.drawW, dims.drawH);
    } else {
      _calcFitScale();
    }
    _scale = _fitScale;
    _panX = 0;
    _panY = 0;
    _applyTransform();
    _renderPins();
    if (typeof Markup !== 'undefined' && Markup.resize) Markup.resize();
  }, 200);
});

function _showDrawing(idx) {
  _drawings = _getDrawingsList();
  if (idx < 0 || idx >= _drawings.length) return;
  _currentDrawingIdx = idx;
  var d = _drawings[idx];

  var overlay = document.getElementById('drawing-viewer-overlay');
  var img = document.getElementById('dv-image');
  var title = document.getElementById('dv-title');

  if (!overlay || !img) return;

  // Always close any prior tiled session before switching drawings
  if (TiledPdf.isActive()) TiledPdf.close();

  // PDF branch — tiled renderer
  if (_isPdfDrawing(d)) {
    _ensureTiledInit();
    if (title) title.textContent = d.name || 'Drawing ' + (idx + 1);
    overlay.classList.add('open');
    document.body.classList.add('dv-open');
    _fitScale = 1; _scale = 1; _panX = 0; _panY = 0;
    var wrapPdf = document.getElementById('dv-img-wrap');
    if (wrapPdf) wrapPdf.style.transform = 'translate3d(0,0,0) scale(1)';
    var _doOpen = function() {
      TiledPdf.open(d.id, d.pdfPage || 1).then(function() {
        if (TiledPdf.isActive()) Markup.init(d.id);
      });
    };
    if (typeof window.ensurePdfJs === 'function') {
      window.ensurePdfJs(_doOpen);
    } else {
      _doOpen();
    }
    return;
  }

  var src = d.thumb || d.r2Url || d.dataUrl || '';

  // S83b: iPad/iPhone Safari cannot hold a decoded single-<img> of an 8192×
  // something JPEG — the decoded bitmap exceeds per-tab memory and crashes.
  // Detect coarse-pointer devices and downscale large rasters through a
  // canvas to a safe pixel budget BEFORE assigning to dv-image.
  var _isTouchDevice = false;
  try { _isTouchDevice = window.matchMedia && window.matchMedia('(pointer:coarse)').matches; } catch(_){}
  // Budget: 12 MP decoded (≈48 MB RGBA). Well under iPad's per-tab ceiling
  // while preserving enough resolution to zoom 2–3× without pixellation.
  var _IPAD_PX_BUDGET = 12 * 1000 * 1000;

  function _downscaleForTouch(url, onDone, onFail){
    var probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = function(){
      var w = probe.naturalWidth, h = probe.naturalHeight;
      var px = w * h;
      if (!_isTouchDevice || px <= _IPAD_PX_BUDGET){
        onDone(url, w, h, false); // pass-through
        return;
      }
      var ratio = Math.sqrt(_IPAD_PX_BUDGET / px);
      var tw = Math.max(1, Math.floor(w * ratio));
      var th = Math.max(1, Math.floor(h * ratio));
      var c = document.createElement('canvas');
      c.width = tw; c.height = th;
      try {
        c.getContext('2d').drawImage(probe, 0, 0, tw, th);
        c.toBlob(function(blob){
          if (!blob){ c.width=1; c.height=1; onFail && onFail('toBlob null'); return; }
          var objUrl = URL.createObjectURL(blob);
          c.width=1; c.height=1;
          console.log('[Viewer] iPad downscale ' + w + '×' + h + ' → ' + tw + '×' + th + ' (' + Math.round(blob.size/1024) + 'KB)');
          onDone(objUrl, tw, th, true);
        }, 'image/jpeg', 0.85);
      } catch (e){
        c.width=1; c.height=1;
        console.warn('[Viewer] Downscale failed, falling back to original:', e.message);
        onDone(url, w, h, false);
      }
    };
    probe.onerror = function(){ onFail && onFail('probe error'); };
    probe.src = url;
  }

  function _loadImg(url, label) {
    // Binary hide — visibility:hidden prevents any paint of old image
    img.style.visibility = 'hidden';
    function _assignAndFinish(finalUrl){
      img.onload = function() {
        console.log('[Viewer] Image loaded (' + (label || 'unknown') + '): ' + img.naturalWidth + '×' + img.naturalHeight);
        _calcFitScale();
        _scale = _fitScale;
        _panX = 0;
        _panY = 0;
        _applyTransform();
        _renderPins();
        // Show after transform applied
        img.style.visibility = 'visible';
        // Initialize markup engine after image loads
        Markup.init(d.id);
      };
      img.src = finalUrl;
      img.style.display = 'block';
    }
    // For legacy raster drawings on iPad, downscale before handing to <img>.
    // For non-PDF drawings only — PDFs go through TiledPdf (which has its own budget).
    if (_isTouchDevice && !_isPdfDrawing(d)){
      _downscaleForTouch(url, function(finalUrl){ _assignAndFinish(finalUrl); }, function(err){
        console.warn('[Viewer] Downscale probe failed (' + err + ') — using original URL');
        _assignAndFinish(url);
      });
    } else {
      _assignAndFinish(url);
    }
  }

  if (d.r2Url) {
    _loadImg(d.r2Url, 'r2Url');
  } else if (d.dataUrl) {
    _loadImg(d.dataUrl, 'dataUrl');
  } else {
    // No URL — try loading full-res blob from IDB drawingBlobs
    img.style.display = 'none';
    console.log('[Viewer] No URL for drawing ' + d.id + ' — loading from IDB drawingBlobs...');
    IDB.get('drawingBlobs', d.id).then(function(rec) {
      if (rec && rec.dataBlob && rec.dataBlob.size > 0) {
        console.log('[Viewer] IDB blob found: ' + Math.round(rec.dataBlob.size / 1024) + 'KB');
        var objUrl = URL.createObjectURL(rec.dataBlob);
        _loadImg(objUrl, 'IDB blob');
      } else {
        console.warn('[Viewer] No IDB blob found — falling back to thumb (' + (d.thumb ? '200px' : 'none') + ')');
        if (d.thumb) _loadImg(d.thumb, 'thumb-fallback');
      }
    }).catch(function(err) {
      console.warn('[Viewer] IDB load error:', err, '— falling back to thumb');
      if (d.thumb) _loadImg(d.thumb, 'thumb-fallback');
    });
  }

  if (title) title.textContent = d.name || 'Drawing ' + (idx + 1);

  // Show overlay immediately, image will fit when loaded
  _fitScale = 1;
  _scale = 1;
  _panX = 0;
  _panY = 0;
  overlay.classList.add('open');
  document.body.classList.add('dv-open');

  // Position wrapper at initial state
  var wrap = document.getElementById('dv-img-wrap');
  if (wrap) {
    wrap.style.transform = 'translate3d(0,0,0) scale(1)';
  }
}

export var initViewer = {

  open: function(drawingId) {
    var drawings = _getDrawingsList();
    var idx = -1;
    for (var i = 0; i < drawings.length; i++) {
      if (drawings[i].id === drawingId) { idx = i; break; }
    }
    if (idx >= 0) _showDrawing(idx);
  },

  close: function() {
    if (TiledPdf.isActive()) TiledPdf.close();
    Markup.destroy();
    var overlay = document.getElementById('drawing-viewer-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('dv-open');
    _currentDrawingIdx = -1;
  },

  next: function() {
    if (_currentDrawingIdx < _drawings.length - 1) {
      if (TiledPdf.isActive()) TiledPdf.close();
      Markup.destroy();
      _showDrawing(_currentDrawingIdx + 1);
    }
  },

  prev: function() {
    if (_currentDrawingIdx > 0) {
      if (TiledPdf.isActive()) TiledPdf.close();
      Markup.destroy();
      _showDrawing(_currentDrawingIdx - 1);
    }
  }
};

// ── Event Wiring ─────────────────────────────────────────

// Close button
document.addEventListener('click', function(e) {
  if (e.target.id === 'dv-close' || (e.target.closest && e.target.closest('#dv-close'))) {
    initViewer.close();
  }
  if (e.target.id === 'dv-prev' || (e.target.closest && e.target.closest('#dv-prev'))) {
    initViewer.prev();
  }
  if (e.target.id === 'dv-next' || (e.target.closest && e.target.closest('#dv-next'))) {
    initViewer.next();
  }

  // Pencil button opens rename modal (handled below)
});

// Drawing rename pencil button → modal
document.addEventListener('click', function(e) {
  if (!e.target.closest || !e.target.closest('#dv-rename-btn')) return;
  var overlay = document.getElementById('drawing-viewer-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  var titleEl = document.getElementById('dv-title');
  var drawings = _getDrawingsList();
  if (_currentDrawingIdx < 0 || _currentDrawingIdx >= drawings.length) return;
  var d = drawings[_currentDrawingIdx];
  var oldName = d.name || '';

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9800;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
  var h = '<div style="background:var(--bg,white);border-radius:12px;padding:24px;width:90%;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,.3);color:var(--fg,#1B2438);">';
  h += '<div style="font-weight:700;font-size:calc(16px + var(--ts));margin-bottom:16px;">Rename Drawing</div>';
  h += '<label style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">Original Name</label>';
  h += '<div style="padding:8px 12px;border:1.5px solid var(--border);border-radius:6px;font-size:calc(13px + var(--ts));background:var(--smoke,#F7F8FA);color:var(--silver,#6B7280);margin-bottom:12px;word-break:break-all;">' + (oldName || '(untitled)') + '</div>';
  h += '<label style="display:block;font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--steel,#4A5568);margin-bottom:3px;">New Name</label>';
  h += '<input type="text" id="dv-rename-input" value="' + oldName.replace(/"/g, '&quot;') + '" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(14px + var(--ts));background:var(--bg,white);color:var(--fg);box-sizing:border-box;margin-bottom:16px;outline:none;">';
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
  h += '<button id="dv-rename-cancel" style="padding:8px 20px;border:1.5px solid var(--border);border-radius:6px;background:var(--bg,white);color:var(--fg);cursor:pointer;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));">Close</button>';
  h += '<button id="dv-rename-ok" style="padding:8px 20px;border:none;border-radius:6px;background:#9C2742;color:white;cursor:pointer;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));font-weight:700;">Confirm</button>';
  h += '</div></div>';
  ov.innerHTML = h;
  document.body.appendChild(ov);

  var inp = ov.querySelector('#dv-rename-input');
  setTimeout(function() { inp.focus(); inp.select(); }, 50);

  function _doRename() {
    var newName = inp.value.trim();
    if (newName && newName !== oldName) {
      d.name = newName;
      Model.saveNow();
      titleEl.textContent = newName;
    }
    ov.remove();
  }
  ov.querySelector('#dv-rename-ok').addEventListener('click', _doRename);
  ov.querySelector('#dv-rename-cancel').addEventListener('click', function() { ov.remove(); });
  inp.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); _doRename(); }
    if (ev.key === 'Escape') ov.remove();
    ev.stopPropagation();
  });
});

// Pan: mouse drag
var canvasArea = null;
document.addEventListener('mousedown', function(e) {
  canvasArea = document.getElementById('dv-canvas-area');
  if (!canvasArea || !canvasArea.contains(e.target)) return;
  // Don't pan when markup tool is active, pin placement, or pin tool selected
  if (Markup.isActive()) return;
  if (_pinModeDeficId) return;
  if (Markup.getTool() === 'pin') return;
  _dragging = true;
  _lastX = e.clientX;
  _lastY = e.clientY;
  canvasArea.classList.add('panning');
  e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
  if (!_dragging) return;
  if (_scale <= _fitScale) return; // No pan at fit
  _panX += e.clientX - _lastX;
  _panY += e.clientY - _lastY;
  _lastX = e.clientX;
  _lastY = e.clientY;
  _applyTransform();
});

document.addEventListener('mouseup', function() {
  _dragging = false;
  if (canvasArea) canvasArea.classList.remove('panning');
});

// Zoom: mouse wheel
document.addEventListener('wheel', function(e) {
  var area = document.getElementById('dv-canvas-area');
  if (!area || !area.contains(e.target)) return;
  e.preventDefault();

  var rect = area.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;

  var imgX = (mx - _panX) / _scale;
  var imgY = (my - _panY) / _scale;

  var delta = e.deltaY > 0 ? 0.9 : 1.1;
  var newScale = Math.max(_fitScale, Math.min(8, _scale * delta));

  // At fit scale, reset pan
  if (newScale <= _fitScale) {
    _panX = 0;
    _panY = 0;
    _scale = _fitScale;
    _applyTransform();
    return;
  }

  _panX = mx - imgX * newScale;
  _panY = my - imgY * newScale;
  _scale = newScale;

  _applyTransform();
}, { passive: false });

// Keyboard: +/- zooms, arrows navigate
document.addEventListener('keydown', function(e) {
  var overlay = document.getElementById('drawing-viewer-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;

  if (e.key === 'ArrowLeft') { initViewer.prev(); e.preventDefault(); }
  if (e.key === 'ArrowRight') { initViewer.next(); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') { _scale = Math.min(8, _scale * 1.2); _applyTransform(); }
  if (e.key === '-') { _scale = Math.max(_fitScale, _scale / 1.2); if (_scale <= _fitScale) { _panX = 0; _panY = 0; } _applyTransform(); }
  if (e.key === '0') { _resetView(); }
});

// ── Touch: Pinch-to-zoom + single-finger pan + double-tap ──
var _touchStartDist = 0;
var _touchStartScale = 1;
var _touchStartMidX = 0;
var _touchStartMidY = 0;
var _touchStartPanX = 0;
var _touchStartPanY = 0;
var _singleTouchX = 0;
var _singleTouchY = 0;
var _lastTapTime = 0;

document.addEventListener('touchstart', function(e) {
  var area = document.getElementById('dv-canvas-area');
  if (!area || !area.contains(e.target)) return;

  if (e.touches.length === 2) {
    // Pinch start
    e.preventDefault();
    var dx = e.touches[1].clientX - e.touches[0].clientX;
    var dy = e.touches[1].clientY - e.touches[0].clientY;
    _touchStartDist = Math.sqrt(dx * dx + dy * dy);
    _touchStartScale = _scale;
    var rect = area.getBoundingClientRect();
    _touchStartMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    _touchStartMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    _touchStartPanX = _panX;
    _touchStartPanY = _panY;
  } else if (e.touches.length === 1) {
    // Skip single-touch when markup tool is active or pin mode
    if (Markup.isActive()) return;
    if (_pinModeDeficId) return;
    if (Markup.getTool() === 'pin') return;
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;

    // Double-tap detection
    var now = Date.now();
    if (now - _lastTapTime < 350) {
      e.preventDefault();
      // Toggle fit ↔ 3x zoom
      if (_scale > _fitScale * 1.5) {
        _resetView();
      } else {
        var rect = area.getBoundingClientRect();
        var mx = e.touches[0].clientX - rect.left;
        var my = e.touches[0].clientY - rect.top;
        var imgX = (mx - _panX) / _scale;
        var imgY = (my - _panY) / _scale;
        _scale = Math.min(8, _fitScale * 3);
        _panX = mx - imgX * _scale;
        _panY = my - imgY * _scale;
        _applyTransform();
      }
      _lastTapTime = 0;
    } else {
      _lastTapTime = now;
    }
  }
}, { passive: false });

document.addEventListener('touchmove', function(e) {
  var area = document.getElementById('dv-canvas-area');
  if (!area || !area.contains(e.target)) return;

  if (e.touches.length === 2) {
    // Pinch zoom
    e.preventDefault();
    var dx = e.touches[1].clientX - e.touches[0].clientX;
    var dy = e.touches[1].clientY - e.touches[0].clientY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (_touchStartDist === 0) return;

    var ratio = dist / _touchStartDist;
    var newScale = Math.max(_fitScale, Math.min(8, _touchStartScale * ratio));

    // Zoom centered on pinch midpoint
    var imgX = (_touchStartMidX - _touchStartPanX) / _touchStartScale;
    var imgY = (_touchStartMidY - _touchStartPanY) / _touchStartScale;
    _scale = newScale;
    _panX = _touchStartMidX - imgX * newScale;
    _panY = _touchStartMidY - imgY * newScale;
    _applyTransform();

  } else if (e.touches.length === 1 && _scale > _fitScale) {
    // Single finger pan (only when zoomed in, not when markup active or pin mode)
    if (Markup.isActive()) return;
    if (_pinModeDeficId) return;
    if (Markup.getTool() === 'pin') return;
    e.preventDefault();
    _panX += e.touches[0].clientX - _singleTouchX;
    _panY += e.touches[0].clientY - _singleTouchY;
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;
    _applyTransform();
  }
}, { passive: false });

document.addEventListener('touchend', function(e) {
  if (e.touches.length < 2) {
    _touchStartDist = 0;
  }
  if (e.touches.length === 1) {
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;
  }
});

// ── S83: Pull-to-refresh gesture ────────────────────────
// Only active on drawing viewer when zoomed to fit. Pulling finger down
// > 80px from near the top of the canvas triggers a remote check.
// Short pulls still act as regular pan. Hub mode only.
var _ptr = {
  tracking: false,
  startY: 0,
  startX: 0,
  indicator: null,
  triggered: false,
  threshold: 80,
  maxPull: 140,      // visual cap
  topZone: 60        // pull must start within this many px of canvas top
};

function _ptrGetIndicator(){
  if (_ptr.indicator && document.body.contains(_ptr.indicator)) return _ptr.indicator;
  var el = document.createElement('div');
  el.id = 'frt-ptr-indicator';
  el.style.cssText =
    'position:fixed;top:0;left:50%;transform:translate(-50%,-60px);' +
    'z-index:99998;background:#1B2438;color:#fff;border:1px solid #9C2742;' +
    'border-radius:0 0 12px 12px;padding:10px 18px;' +
    'font:14px Calibri,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);' +
    'display:flex;align-items:center;gap:10px;' +
    'transition:transform .2s ease;pointer-events:none;';
  el.innerHTML =
    '<div id="frt-ptr-spinner" style="width:18px;height:18px;border:3px solid rgba(255,255,255,.25);border-top-color:#9C2742;border-radius:50%;"></div>' +
    '<span id="frt-ptr-text">Pull to refresh…</span>' +
    '<style>@keyframes frtPtrSpin{to{transform:rotate(360deg)}}</style>';
  document.body.appendChild(el);
  _ptr.indicator = el;
  return el;
}

function _ptrSetVisible(pulled, pastThreshold){
  var el = _ptrGetIndicator();
  if (pulled <= 0){ el.style.transform = 'translate(-50%,-60px)'; return; }
  var shown = Math.min(pulled, _ptr.maxPull);
  // Indicator is 60px tall; slide it from -60 to (shown-60)
  var ty = Math.min(shown - 60, 10);
  el.style.transform = 'translate(-50%,' + ty + 'px)';
  var txt = el.querySelector('#frt-ptr-text');
  var spin = el.querySelector('#frt-ptr-spinner');
  if (txt) txt.textContent = pastThreshold ? 'Release to check for updates' : 'Pull to refresh…';
  if (spin) spin.style.animation = '';
}

function _ptrShowChecking(){
  var el = _ptrGetIndicator();
  el.style.transform = 'translate(-50%,10px)';
  var txt = el.querySelector('#frt-ptr-text');
  var spin = el.querySelector('#frt-ptr-spinner');
  if (txt) txt.textContent = 'Checking for updates…';
  if (spin) spin.style.animation = 'frtPtrSpin 0.9s linear infinite';
}

function _ptrShowResult(msg){
  var el = _ptrGetIndicator();
  el.style.transform = 'translate(-50%,10px)';
  var txt = el.querySelector('#frt-ptr-text');
  var spin = el.querySelector('#frt-ptr-spinner');
  if (txt) txt.textContent = msg;
  if (spin) spin.style.animation = '';
  setTimeout(function(){ el.style.transform = 'translate(-50%,-60px)'; }, 1400);
}

function _ptrShouldActivate(e){
  // Only on drawing viewer when at fit zoom, Hub mode, not panning, not markup
  var overlay = document.getElementById('drawing-viewer-overlay');
  if (!overlay || !overlay.classList.contains('open')) return false;
  if (typeof window._frtCheckRemote !== 'function') return false;
  if (_scale > _fitScale * 1.02) return false; // zoomed in — let pan own this
  if (Markup.isActive()) return false;
  if (_pinModeDeficId) return false;
  if (Markup.getTool() === 'pin') return false;
  var area = document.getElementById('dv-canvas-area');
  if (!area) return false;
  var rect = area.getBoundingClientRect();
  // Start must be near the top of the canvas
  if (e.touches[0].clientY - rect.top > _ptr.topZone) return false;
  return true;
}

document.addEventListener('touchstart', function(e){
  if (e.touches.length !== 1) { _ptr.tracking = false; return; }
  if (!_ptrShouldActivate(e)) { _ptr.tracking = false; return; }
  _ptr.tracking = true;
  _ptr.triggered = false;
  _ptr.startY = e.touches[0].clientY;
  _ptr.startX = e.touches[0].clientX;
}, { passive: true });

document.addEventListener('touchmove', function(e){
  if (!_ptr.tracking || e.touches.length !== 1) return;
  var dy = e.touches[0].clientY - _ptr.startY;
  var dx = Math.abs(e.touches[0].clientX - _ptr.startX);
  // Must be dominantly downward
  if (dy < 0 || dx > dy) { _ptr.tracking = false; _ptrSetVisible(0,false); return; }
  if (dy > 8){
    _ptrSetVisible(dy, dy >= _ptr.threshold);
  }
}, { passive: true });

document.addEventListener('touchend', function(e){
  if (!_ptr.tracking) return;
  var wasTracking = _ptr.tracking;
  _ptr.tracking = false;
  if (!wasTracking || _ptr.triggered) return;
  // Use last-known touchend Y if available via changedTouches
  var endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : _ptr.startY;
  var dy = endY - _ptr.startY;
  if (dy < _ptr.threshold){ _ptrSetVisible(0,false); return; }
  _ptr.triggered = true;
  _ptrShowChecking();
  window._frtCheckRemote().then(function(r){
    if (!r || r.checked === false){
      var reason = (r && r.reason) ? r.reason : 'error';
      var msg;
      if (reason === 'not-hub') msg = 'Standalone mode — no cloud';
      else if (reason === 'no-user') msg = 'Not signed in';
      else msg = 'Could not reach cloud';
      _ptrShowResult(msg);
      return;
    }
    if (r.remoteNewer && r.pulled) _ptrShowResult('✓ Updated from cloud');
    else if (r.remoteNewer && r.dirtyLocal) _ptrShowResult('Updates available — see banner');
    else _ptrShowResult('✓ Up to date');
  }).catch(function(){ _ptrShowResult('Could not reach cloud'); });
}, { passive: true });

// ── Pin Rendering ───────────────────────────────────────
var _pinModeDeficId = null;

function _renderPins() {
  // Don't rebuild during active drag (would destroy marker reference)
  if (_pinDragging || _pinMouseDragging) return;

  var drawings = _getDrawingsList();
  var htmlLayer = document.getElementById('dv-pins-layer');

  if (_currentDrawingIdx < 0 || _currentDrawingIdx >= drawings.length) {
    if (htmlLayer) htmlLayer.innerHTML = '';
    if (_useGLPins && _glPinsReady && window.PinsGL) window.PinsGL.render([], {});
    return;
  }
  var drawingId = drawings[_currentDrawingIdx].id;
  var img = document.getElementById('dv-image');
  if (!img || !img.naturalWidth) {
    if (htmlLayer) htmlLayer.innerHTML = '';
    if (_useGLPins && _glPinsReady && window.PinsGL) window.PinsGL.render([], {});
    return;
  }
  var iw = img.naturalWidth;
  var ih = img.naturalHeight;
  var allDefics = Model.getAllDeficiencies();
  var pins = allDefics.filter(function(d) { return d.defic.drawingId === drawingId && d.defic.pinX != null; });

  // ── WebGL path ───────────────────────────────────────────
  if (_useGLPins && window.PinsGL){
    if (!_glPinsReady){ _ensureGLPinsInit(); return; }
    // Hide HTML layer content (keep DOM for accessibility mirror)
    if (htmlLayer) htmlLayer.innerHTML = '';

    // Compute image rect relative to the GL canvas host (dv-canvas-area)
    var host = document.getElementById('dv-canvas-area');
    var imgRect = img.getBoundingClientRect();
    var hostRect = host ? host.getBoundingClientRect() : { left:0, top:0 };
    var relRect = {
      left:   imgRect.left - hostRect.left,
      top:    imgRect.top  - hostRect.top,
      width:  imgRect.width,
      height: imgRect.height
    };
    if (host) window.PinsGL.resize(host.clientWidth, host.clientHeight);

    // Pin size shrink when zoomed out: 0.7× at fit-to-screen, lerp to 1.0× at 1×,
    // stays 1.0× when zoomed in. Keeps zoomed-in feel unchanged.
    var pinScale = 1;
    var fitS = (typeof _fitScale === 'number' && _fitScale > 0) ? _fitScale : 1;
    if (_scale >= 1) {
      pinScale = 1;
    } else if (_scale <= fitS) {
      pinScale = 0.7;
    } else {
      var t = (_scale - fitS) / (1 - fitS);
      pinScale = 0.7 + 0.3 * t;
    }

    // S83: Build inspector color lookup for this project.
    // Colors live in proj.ui.inspectorColors[userId] = '#xxx' (cached by Project Hub).
    // Master toggle: proj.ui.showInspectorRings (default off for solo, on when >1 inspector).
    var _proj = Model.getProject() || {};
    var _ui = _proj.ui || {};
    var _inspectorColors = _ui.inspectorColors || {};
    var _showRings = !!_ui.showInspectorRings;
    // Per-device hidden list (populated from IDB state store during boot by app.js);
    // viewer consults a shared global if set. Default: none hidden.
    var _hiddenInspectors = (window._frtHiddenInspectors && window._frtHiddenInspectors.slice) ? window._frtHiddenInspectors : [];

    var glPins = pins.map(function(d){
      var cb = d.defic.createdBy || null;
      var ic = cb ? (_inspectorColors[cb] || null) : null;
      var hidden = cb && _hiddenInspectors.indexOf(cb) !== -1;
      return {
        deficId: d.defic.id,
        num:     d.defic.num,
        pinX:    d.defic.pinX,
        pinY:    d.defic.pinY,
        priority:d.defic.priority || 'high',
        isClosed:d.defic.status === 'closed' || d.defic.status === 'Addressed & Closed',
        isIAR:   !!d.defic.iar,
        inspectorColor: ic,                    // S83
        _showRing: _showRings && !hidden && !!ic  // S83
      };
    });
    window.PinsGL.render(glPins, {
      scale: _scale, panX: _panX, panY: _panY,
      pinScale: pinScale,
      hoveredId: _lastHoveredId || null,
      activeId:  _lastActiveId  || null,
      readyId:   _lastReadyId   || null,   // S81: V1 press-and-hold blue glow
      imgRect: relRect, naturalW: iw, naturalH: ih
    });

    // Accessibility mirror — visually-hidden pin list for screen readers
    if (htmlLayer){
      var mirrorHtml = '';
      for (var mi = 0; mi < pins.length; mi++){
        var md = pins[mi].defic;
        mirrorHtml += '<div role="button" aria-label="Pin ' + md.num + '" ' +
          'style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);' +
          'left:' + (md.pinX * 100) + '%;top:' + (md.pinY * 100) + '%;"></div>';
      }
      htmlLayer.innerHTML = mirrorHtml;
    }
    return;
  }

  // ── HTML path (original) ─────────────────────────────────
  if (!htmlLayer) return;
  // Pin size scales proportionally with drawing resolution
  // Target: pin width = ~1% of drawing width (consistent visual size)
  var pw = Math.round(Math.max(iw, ih) * 0.01);
  if (pw < 24) pw = 24;
  if (pw > 96) pw = 96;
  var ph2 = Math.round(pw * 42 / 32);
  var html = '';
  pins.forEach(function(d) {
    var px = d.defic.pinX * iw;
    var py = d.defic.pinY * ih;
    var pr = d.defic.priority || 'high';
    var isClosed = d.defic.status === 'closed' || d.defic.status === 'Addressed & Closed';
    var fill = d.defic.iar ? '#E91E8C' : (pr === 'general' ? '#1A7A4A' : pr === 'low' ? '#E67E22' : '#C0392B');
    var isOutstanding = !isClosed && !d.defic.iar;
    var shadow = isOutstanding ? 'drop-shadow(0 0 3px ' + fill + ') drop-shadow(0 2px 5px rgba(0,0,0,.6))' : 'drop-shadow(0 2px 4px rgba(0,0,0,.45))';
    var alpha = isClosed ? '0.5' : '1';
    var numStr = String(d.defic.num);
    var numFs = numStr.length <= 2 ? '14' : numStr.length === 3 ? '11' : '9';
    html += '<div class="pin-marker" data-defic-id="' + d.defic.id + '" data-priority="' + pr + '" style="left:' + px + 'px;top:' + py + 'px;width:' + pw + 'px;height:' + ph2 + 'px;transform:translate(-50%,-100%);opacity:' + alpha + ';">';
    html += '<svg viewBox="0 0 32 42" width="' + pw + '" height="' + ph2 + '" style="filter:' + shadow + ';overflow:visible;">';
    html += '<path d="M16 1C8.3 1 2 7.3 2 15c0 10.5 14 25 14 25s14-14.5 14-25C30 7.3 23.7 1 16 1z" fill="white"/>';
    html += '<path d="M16 3C9.4 3 4 8.4 4 15c0 9.5 12 22 12 22s12-12.5 12-22C28 8.4 22.6 3 16 3z" fill="' + fill + '"/>';
    html += '<circle cx="16" cy="14" r="9" fill="white" opacity="0.95"/>';
    html += '<text x="16" y="14.5" text-anchor="middle" dominant-baseline="central" font-size="' + numFs + '" font-weight="900" font-family="Calibri,Arial,sans-serif" fill="' + fill + '">' + d.defic.num + '</text>';
    html += '</svg></div>';
  });
  htmlLayer.innerHTML = html;
}

// ── Pin Placement Mode ──────────────────────────────────
function _startPinPlace(deficId) {
  _pinModeDeficId = deficId;
  // Deactivate any active markup tool so canvas releases pointer-events
  Markup.setTool('pin');
  var area = document.getElementById('dv-canvas-area');
  if (area) area.classList.add('pin-mode');
  console.log('[Viewer] Pin placement mode — deficiency:', deficId);
}

function _handlePinDrop(e) {
  if (!_pinModeDeficId) return;
  var img = document.getElementById('dv-image');
  var wrap = document.getElementById('dv-img-wrap');
  if (!img || !wrap || !img.naturalWidth) return;

  // Get click position relative to the image
  var rect = wrap.getBoundingClientRect();
  var clickX = (e.clientX - rect.left) / _scale;
  var clickY = (e.clientY - rect.top) / _scale;
  var pinX = Math.max(0, Math.min(1, clickX / img.naturalWidth));
  var pinY = Math.max(0, Math.min(1, clickY / img.naturalHeight));

  // Save pin to deficiency
  var drawings = _getDrawingsList();
  var drawingId = drawings[_currentDrawingIdx] ? drawings[_currentDrawingIdx].id : null;
  if (!drawingId) return;

  var f = Model.findDeficiency(_pinModeDeficId);
  if (f) {
    f.defic.drawingId = drawingId;
    f.defic.pinX = pinX;
    f.defic.pinY = pinY;
    Model._notify('deficiency', { action: 'pin', deficId: _pinModeDeficId });
    Model.saveNow();
    console.log('[Viewer] Pin placed at', pinX.toFixed(3), pinY.toFixed(3), 'on drawing', drawingId);
  }

  // Exit pin mode
  _pinModeDeficId = null;
  var area = document.getElementById('dv-canvas-area');
  if (area) area.classList.remove('pin-mode');
  var btn = document.getElementById('dv-pin-btn');
  if (btn) { btn.style.background = 'rgba(255,255,255,.12)'; btn.textContent = '\uD83D\uDCCC Pin'; }
  _renderPins();
}

// ── Pin drop shared logic with debounce ───────────────
var _lastPinDropTime = 0;

function _pinToolDrop(clientX, clientY) {
  // Debounce: prevent touch+click double-fire
  var now = Date.now();
  if (now - _lastPinDropTime < 400) return;
  _lastPinDropTime = now;

  var img = document.getElementById('dv-image');
  var wrap = document.getElementById('dv-img-wrap');
  if (!img || !wrap || !img.naturalWidth) return;

  var rect = wrap.getBoundingClientRect();
  var clickX = (clientX - rect.left) / _scale;
  var clickY = (clientY - rect.top) / _scale;
  var pinX = Math.max(0, Math.min(1, clickX / img.naturalWidth));
  var pinY = Math.max(0, Math.min(1, clickY / img.naturalHeight));

  var drawings = _getDrawingsList();
  var drawingId = drawings[_currentDrawingIdx] ? drawings[_currentDrawingIdx].id : null;
  if (!drawingId) return;

  var newDefic = Model.addDeficiency(null);
  if (newDefic) {
    newDefic.drawingId = drawingId;
    newDefic.pinX = pinX;
    newDefic.pinY = pinY;
    Model._notify('deficiency', { action: 'pin', deficId: newDefic.id });
    Model.saveNow();
    _renderPins();
    console.log('[Viewer] Pin tool: created deficiency #' + newDefic.num + ' at', pinX.toFixed(3), pinY.toFixed(3));
    _openPinEditor(newDefic.id);
  }
}

// Pin drop click handler
document.getElementById('dv-canvas-area').addEventListener('click', function(e) {
  if (e.target.closest('.dv-toolbar') || e.target.closest('#dv-close') || e.target.closest('.dv-sidebar-tools') || e.target.closest('.zoom-controls') || e.target.closest('.dv-nav-controls')) return;

  if (_pinModeDeficId) {
    e.stopImmediatePropagation();  // prevent editor-open click handler from also firing
    _handlePinDrop(e);
    return;
  }
  if (Markup.getTool() === 'pin') {
    e.stopImmediatePropagation();
    _pinToolDrop(e.clientX, e.clientY);
    return;
  }
}, true);  // capture phase — runs BEFORE the document-level editor-open handler

// Pin drop touch handler
document.getElementById('dv-canvas-area').addEventListener('touchend', function(e) {
  if (e.target.closest('.dv-toolbar') || e.target.closest('#dv-close') || e.target.closest('.dv-sidebar-tools') || e.target.closest('.zoom-controls') || e.target.closest('.dv-nav-controls')) return;
  var touch = e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : null;
  if (!touch) return;

  if (_pinModeDeficId) {
    e.stopImmediatePropagation();
    _handlePinDrop({ clientX: touch.clientX, clientY: touch.clientY });
    return;
  }
  if (Markup.getTool() === 'pin') {
    e.stopImmediatePropagation();
    _pinToolDrop(touch.clientX, touch.clientY);
    return;
  }
}, true);

// Pin marker click — open pin editor. Allowed in pan mode AND when any
// markup tool is active. ONLY blocked when pin-drop mode is active.
var _pinDragEndTime = 0;
document.addEventListener('click', function(e) {
  var deficId = _resolvePinAt(e.clientX, e.clientY, e.target);
  if (!deficId) return;
  if (_pinModeDeficId) return;     // pin-drop mode: ignore existing pins entirely
  if (_pinDragging) return;
  if (_pinMouseDragging) return;
  // Suppress click immediately after drag end
  if (Date.now() - _pinDragEndTime < 300) return;
  _openPinEditor(deficId);
});

// ── Pin Editor Modal ───────────────────────────────────
var _peDeficId = null;
var _peObsIdx = 0;

function _openPinEditor(deficId) {
  var f = Model.findDeficiency(deficId);
  if (!f) return;
  _peDeficId = deficId;
  _peObsIdx = 0;
  var d = f.defic;
  var overlay = document.getElementById('pin-editor-overlay');
  if (!overlay) return;

  // Title
  var prLabel = d.priority === 'general' ? 'General' : d.priority === 'low' ? 'Low Priority' : 'High Priority';
  document.getElementById('pe-title').textContent = 'Pin #' + d.num + ' \u2014 ' + prLabel;

  // Contractor dropdown
  var cSel = document.getElementById('pe-contractor');
  if (cSel) {
    var proj = Model.getProject();
    var opts = '<option value=""' + (!f.contractor ? ' selected' : '') + '>Site General</option>';
    (proj.contractors || []).forEach(function(c) { opts += '<option value="' + c.id + '"' + (f.contractor && f.contractor.id === c.id ? ' selected' : '') + '>' + c.name + '</option>'; });
    cSel.innerHTML = opts;
  }

  // Date
  var dateIn = document.getElementById('pe-date');
  if (dateIn) dateIn.value = d.date || new Date().toISOString().split('T')[0];

  // Status
  var statusSel = document.getElementById('pe-status');
  if (statusSel) statusSel.value = (d.status === 'closed' || d.status === 'Addressed & Closed') ? 'closed' : 'open';

  // IAR
  var iarBtn = document.getElementById('pe-iar');
  if (iarBtn) iarBtn.classList.toggle('active', !!d.iar);

  // Observations tabs
  _peRenderObsTabs(d);
  _peRenderObsContent(d, 0);

  // Move-to dropdown
  var moveSel = document.getElementById('pe-move-to');
  if (moveSel) {
    var drawings = _getDrawingsList();
    var currentDwgId = (_currentDrawingIdx >= 0 && drawings[_currentDrawingIdx]) ? drawings[_currentDrawingIdx].id : null;
    var opts2 = '<option value="' + (currentDwgId || '') + '">\u2014 Current drawing \u2014</option>';
    drawings.forEach(function(dw) {
      if (dw.id !== currentDwgId) opts2 += '<option value="' + dw.id + '">' + (dw.name || 'Drawing') + '</option>';
    });
    moveSel.innerHTML = opts2;
  }

  // Location thumbnail
  var thumb = document.getElementById('pe-location-thumb');
  if (thumb) {
    var dvImg = document.getElementById('dv-image');
    if (dvImg && dvImg.src && dvImg.src !== '') {
      var pinHtml = '';
      if (d.pinX != null && d.pinY != null) {
        pinHtml = '<div style="position:absolute;left:' + (d.pinX * 100) + '%;top:' + (d.pinY * 100) + '%;transform:translate(-50%,-100%);z-index:2;">' +
          '<svg width="24" height="32" viewBox="0 0 32 42"><path d="M16 3C9.4 3 4 8.4 4 15c0 9.5 12 22 12 22s12-12.5 12-22C28 8.4 22.6 3 16 3z" fill="#C0392B"/><circle cx="16" cy="14" r="6" fill="white" opacity="0.9"/></svg>' +
          '</div>';
      }
      thumb.innerHTML = '<img src="' + dvImg.src + '" crossOrigin="anonymous" alt="" style="width:100%;height:100%;object-fit:contain;display:block;">' + pinHtml;
    } else {
      thumb.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-size:13px;">No drawing loaded</div>';
    }
  }

  overlay.style.display = 'flex';
}

function _peRenderObsTabs(d) {
  var tabs = document.getElementById('pe-obs-tabs');
  if (!tabs) return;
  var obs = d.observations || [];
  if (!obs.length) obs = [{ text: '', addressed: false }];
  var html = '';
  obs.forEach(function(o, i) {
    html += '<button class="pe-obs-tab' + (i === _peObsIdx ? ' active' : '') + '" data-pe-obs="' + i + '">Obs. #' + (i + 1) + '</button>';
  });
  html += '<button class="pe-obs-tab-add" data-pe-obs-add>+</button>';
  tabs.innerHTML = html;
}

function _peRenderObsContent(d, idx) {
  var obs = d.observations || [];
  if (!obs.length) obs = [{ text: '', addressed: false }];
  var o = obs[idx] || obs[0];

  var prBtns = document.querySelectorAll('.pe-pri-btn');
  prBtns.forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-pe-pri') === (d.priority || 'high'));
  });

  var textarea = document.getElementById('pe-obs-text');
  if (textarea) textarea.value = o.text || '';
}

function _closePinEditor() {
  var overlay = document.getElementById('pin-editor-overlay');
  if (overlay) overlay.style.display = 'none';
  _peDeficId = null;
}

function _savePinEditor() {
  if (!_peDeficId) return;
  var f = Model.findDeficiency(_peDeficId);
  if (!f) return;
  var d = f.defic;

  // Read fields — contractor assignment
  var cSel = document.getElementById('pe-contractor');
  if (cSel != null) {
    var proj = Model.getProject();
    var newCtrId = cSel.value || null; // empty string = Site General = null
    var oldCtrId = f.contractor ? f.contractor.id : null;
    if (newCtrId !== oldCtrId) {
      // Remove from old location
      if (oldCtrId) {
        var oldCtr = (proj.contractors || []).find(function(c) { return c.id === oldCtrId; });
        if (oldCtr && oldCtr.deficiencies) {
          oldCtr.deficiencies = oldCtr.deficiencies.filter(function(x) { return x.id !== _peDeficId; });
        }
      } else {
        // Was in generalDeficiencies
        if (proj.generalDeficiencies) {
          proj.generalDeficiencies = proj.generalDeficiencies.filter(function(x) { return x.id !== _peDeficId; });
        }
      }
      // Add to new location
      if (newCtrId) {
        var newCtr = (proj.contractors || []).find(function(c) { return c.id === newCtrId; });
        if (newCtr) {
          if (!newCtr.deficiencies) newCtr.deficiencies = [];
          newCtr.deficiencies.push(d);
        }
      } else {
        // Moving to Site General
        if (!proj.generalDeficiencies) proj.generalDeficiencies = [];
        proj.generalDeficiencies.push(d);
      }
    }
  }

  var dateIn = document.getElementById('pe-date');
  if (dateIn) d.date = dateIn.value;

  var statusSel = document.getElementById('pe-status');
  if (statusSel) d.status = statusSel.value;

  // Save current observation text
  var textarea = document.getElementById('pe-obs-text');
  if (textarea) {
    if (!d.observations || !d.observations.length) d.observations = [{ text: '', addressed: false }];
    if (d.observations[_peObsIdx]) d.observations[_peObsIdx].text = textarea.value;
  }

  // Move to different drawing
  var moveSel = document.getElementById('pe-move-to');
  if (moveSel && moveSel.value && moveSel.value !== d.drawingId) {
    d.drawingId = moveSel.value;
    // Keep pinX/pinY — just changes which drawing the pin is on
  }

  Model.saveNow();
  _renderPins();
  if (_tasksVisible) _renderTasks();
  console.log('[Viewer] Pin editor saved for deficiency', _peDeficId);
  _closePinEditor();
}

// Pin editor event handlers
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('#pe-close')) { _closePinEditor(); return; }
  if (e.target.closest && e.target.closest('#pe-cancel')) { _closePinEditor(); return; }
  if (e.target.closest && e.target.closest('#pe-save')) { _savePinEditor(); return; }

  if (e.target.closest && e.target.closest('#pe-delete')) {
    var delId = _peDeficId;
    console.log('[Viewer] Delete pin clicked — deficId:', delId);
    showConfirm('Delete Pin', 'Remove this pin from the drawing?').then(function(yes) {
      if (!yes) return;
      var f2 = Model.findDeficiency(delId);
      console.log('[Viewer] Delete pin — found:', !!f2);
      if (f2) {
        f2.defic.drawingId = null;
        f2.defic.pinX = null;
        f2.defic.pinY = null;
        Model.saveNow();
        _renderPins();
        if (_tasksVisible) _renderTasks();
        console.log('[Viewer] Pin deleted for deficiency', delId);
      }
      _closePinEditor();
    });
    return;
  }

  // IAR toggle
  if (e.target.closest && e.target.closest('#pe-iar')) {
    var f3 = Model.findDeficiency(_peDeficId);
    if (f3) { f3.defic.iar = !f3.defic.iar; }
    e.target.closest('#pe-iar').classList.toggle('active');
    return;
  }

  // Priority buttons
  var priBtn = e.target.closest && e.target.closest('[data-pe-pri]');
  if (priBtn) {
    var pri = priBtn.getAttribute('data-pe-pri');
    var f4 = Model.findDeficiency(_peDeficId);
    if (f4) f4.defic.priority = pri;
    document.querySelectorAll('.pe-pri-btn').forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-pe-pri') === pri); });
    return;
  }

  // Obs tab click
  var obsTab = e.target.closest && e.target.closest('[data-pe-obs]');
  if (obsTab) {
    var f5 = Model.findDeficiency(_peDeficId);
    if (!f5) return;
    // Save current obs text first
    var ta = document.getElementById('pe-obs-text');
    if (ta && f5.defic.observations && f5.defic.observations[_peObsIdx]) {
      f5.defic.observations[_peObsIdx].text = ta.value;
    }
    _peObsIdx = parseInt(obsTab.getAttribute('data-pe-obs'), 10);
    _peRenderObsTabs(f5.defic);
    _peRenderObsContent(f5.defic, _peObsIdx);
    return;
  }

  // Add obs tab
  if (e.target.closest && e.target.closest('[data-pe-obs-add]')) {
    var f6 = Model.findDeficiency(_peDeficId);
    if (!f6) return;
    if (!f6.defic.observations) f6.defic.observations = [];
    f6.defic.observations.push({ text: '', addressed: false });
    _peObsIdx = f6.defic.observations.length - 1;
    _peRenderObsTabs(f6.defic);
    _peRenderObsContent(f6.defic, _peObsIdx);
    return;
  }

  // Task item click — jump to pin
  var taskItem = e.target.closest && e.target.closest('.dv-task-item[data-task-defic-id]');
  if (taskItem && !e.target.closest('[data-task-pin]') && !e.target.closest('[data-task-del]')) {
    var tid = taskItem.getAttribute('data-task-defic-id');
    _openPinEditor(tid);
    return;
  }
});

// ── Pin Drag-to-Move (long press) ───────────────────────
var _pinDragging = false;
var _pinDragDeficId = null;
var _pinLongPressTimer = null;
var _pinDragMarker = null;
var _pinTouchOffsetX = 0;
var _pinTouchOffsetY = 0;
var _pinTouchStartX = 0;
var _pinTouchStartY = 0;

document.addEventListener('touchstart', function(e) {
  var touch = e.touches[0];
  if (!touch || _pinModeDeficId) return;
  var deficId = _resolvePinAt(touch.clientX, touch.clientY, e.target);
  if (!deficId) return;
  _pinTouchStartX = touch.clientX;
  _pinTouchStartY = touch.clientY;
  // Pre-calculate offset so pin doesn't jump on first drag frame.
  // Offset is in DRAWING-SPACE (logical pixels), computed from current pin position.
  var wrap = document.getElementById('dv-img-wrap');
  var img = document.getElementById('dv-image');
  if (wrap && img && img.naturalWidth){
    var wRect = wrap.getBoundingClientRect();
    var cx = (touch.clientX - wRect.left) / _scale;
    var cy = (touch.clientY - wRect.top) / _scale;
    var f0 = Model.findDeficiency(deficId);
    if (f0 && f0.defic.pinX != null){
      var curX = f0.defic.pinX * img.naturalWidth;
      var curY = f0.defic.pinY * img.naturalHeight;
      _pinTouchOffsetX = curX - cx;
      _pinTouchOffsetY = curY - cy;
    } else {
      _pinTouchOffsetX = 0; _pinTouchOffsetY = 0;
    }
  }
  // S81: V1 500ms press-and-hold — after hold, enter "ready" (blue glow). Any
  // movement after ready = drag. Release before 500ms with no movement = tap
  // opens editor. Movement >5px before timer fires = cancel (fall back to pan).
  _pinDragDeficId = deficId;
  _pinLongPressTimer = setTimeout(function() {
    _lastReadyId = deficId;
    _renderPinsWithState();   // show blue glow
    _pinLongPressTimer = null;
  }, 500);
}, { passive: true });

document.addEventListener('touchmove', function(e) {
  var touch = e.touches[0];
  // Cancel hold if finger moves >5px before 500ms
  if (_pinLongPressTimer && !_pinDragging && !_lastReadyId && touch) {
    if (Math.abs(touch.clientX - _pinTouchStartX) > 5 || Math.abs(touch.clientY - _pinTouchStartY) > 5) {
      clearTimeout(_pinLongPressTimer);
      _pinLongPressTimer = null;
      _pinDragDeficId = null;
    }
  }
  // Transition ready → active drag on any movement
  if (!_pinDragging && _lastReadyId && _pinDragDeficId && touch) {
    var moved = Math.abs(touch.clientX - _pinTouchStartX) > 2 || Math.abs(touch.clientY - _pinTouchStartY) > 2;
    if (moved) {
      _pinDragging = true;
      _lastActiveId = _lastReadyId;
      _lastReadyId = null;
      if (!_useGLPins){
        _pinDragMarker = document.querySelector('.pin-marker[data-defic-id="' + _pinDragDeficId + '"]');
        if (_pinDragMarker) _pinDragMarker.classList.add('dragging');
      }
      var area = document.getElementById('dv-canvas-area');
      if (area) area.classList.add('pin-drag-mode');
    }
  }
  if (!_pinDragging || !_pinDragDeficId) return;
  e.preventDefault();
  if (!touch) return;
  var wrap = document.getElementById('dv-img-wrap');
  var img = document.getElementById('dv-image');
  if (!wrap || !img || !img.naturalWidth) return;
  var wRect = wrap.getBoundingClientRect();
  var px = (touch.clientX - wRect.left) / _scale + _pinTouchOffsetX;
  var py = (touch.clientY - wRect.top) / _scale + _pinTouchOffsetY;
  if (_useGLPins){
    var f = Model.findDeficiency(_pinDragDeficId);
    if (f){
      f.defic.pinX = Math.max(0, Math.min(1, px / img.naturalWidth));
      f.defic.pinY = Math.max(0, Math.min(1, py / img.naturalHeight));
      _lastActiveId = _pinDragDeficId;
      var wasDragging = _pinDragging;
      _pinDragging = false;
      _renderPins();
      _pinDragging = wasDragging;
      // Tooltip follows pin during drag
      if (_pinTooltipEl && _pinTooltipEl.style.display !== 'none'){
        _positionTooltip(touch.clientX, touch.clientY);
      }
    }
  } else if (_pinDragMarker) {
    _pinDragMarker.style.left = px + 'px';
    _pinDragMarker.style.top = py + 'px';
  }
}, { passive: false });

document.addEventListener('touchend', function(e) {
  if (_pinLongPressTimer) { clearTimeout(_pinLongPressTimer); _pinLongPressTimer = null; }
  // Clear ready state if pin was held but not dragged
  if (_lastReadyId) { _lastReadyId = null; _renderPinsWithState(); }
  if (!_pinDragging || !_pinDragDeficId) {
    // Not dragging — release as tap. Clear candidate.
    _pinDragDeficId = null;
    return;
  }

  var area = document.getElementById('dv-canvas-area');
  if (area) area.classList.remove('pin-drag-mode');
  if (_pinDragMarker) _pinDragMarker.classList.remove('dragging');

  var touch = (e.changedTouches && e.changedTouches[0]) || null;
  if (touch) {
    var img = document.getElementById('dv-image');
    var wrap = document.getElementById('dv-img-wrap');
    if (img && wrap && img.naturalWidth) {
      var wRect = wrap.getBoundingClientRect();
      var finalLeft = (touch.clientX - wRect.left) / _scale + _pinTouchOffsetX;
      var finalTop = (touch.clientY - wRect.top) / _scale + _pinTouchOffsetY;
      var pinX = Math.max(0, Math.min(1, finalLeft / img.naturalWidth));
      var pinY = Math.max(0, Math.min(1, finalTop / img.naturalHeight));
      var f = Model.findDeficiency(_pinDragDeficId);
      if (f) {
        f.defic.pinX = pinX;
        f.defic.pinY = pinY;
        Model._notify('deficiency', { action: 'pin-move', deficId: _pinDragDeficId });
        Model.saveNow();
        console.log('[Viewer] Pin moved to', pinX.toFixed(3), pinY.toFixed(3));
      }
    }
  }

  _pinDragging = false;
  _pinDragDeficId = null;
  _pinDragMarker = null;
  _pinDragEndTime = Date.now();
  _lastActiveId = null;
  _hideTooltip();
  _renderPins();
});

// ── Pin Drag-to-Move (PC mouse — long click or selector mode) ──
var _pinMouseLongPress = null;
var _pinMouseDragging = false;
var _pinMouseDragDeficId = null;
var _pinMouseDragMarker = null;
var _pinMouseStartX = 0;
var _pinMouseStartY = 0;
var _pinMouseStartTime = 0;  // S81: mousedown timestamp — drag activates only after ≥150ms hold
var _pinMouseOffsetX = 0; // Offset from cursor to marker left (prevents jump)
var _pinMouseOffsetY = 0;

document.addEventListener('mousedown', function(e) {
  if (e.button !== 0) return;
  if (_pinModeDeficId) return;
  var overlay = document.getElementById('drawing-viewer-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  var deficId = _resolvePinAt(e.clientX, e.clientY, e.target);
  if (!deficId) return;
  _pinMouseStartX = e.clientX;
  _pinMouseStartY = e.clientY;
  _pinMouseStartTime = Date.now();

  // Pre-calculate offset in drawing-space (logical pixels)
  var wrap = document.getElementById('dv-img-wrap');
  var img = document.getElementById('dv-image');
  if (wrap && img && img.naturalWidth) {
    var wRect = wrap.getBoundingClientRect();
    var cursorInWrap_X = (e.clientX - wRect.left) / _scale;
    var cursorInWrap_Y = (e.clientY - wRect.top) / _scale;
    var f0 = Model.findDeficiency(deficId);
    if (f0 && f0.defic.pinX != null){
      var curX = f0.defic.pinX * img.naturalWidth;
      var curY = f0.defic.pinY * img.naturalHeight;
      _pinMouseOffsetX = curX - cursorInWrap_X;
      _pinMouseOffsetY = curY - cursorInWrap_Y;
    } else {
      _pinMouseOffsetX = 0; _pinMouseOffsetY = 0;
    }
  }

  // HTML path: grab DOM marker reference for CSS styling
  var marker = _useGLPins ? null : document.querySelector('.pin-marker[data-defic-id="' + deficId + '"]');

  // S81 Bug #3: pin hit detected — always block markup.js from starting a stroke
  // (regardless of active tool). Capture phase + stopPropagation stops the
  // bubble-phase listener on #markup-canvas from firing.
  e.preventDefault();
  e.stopPropagation();

  // Remember candidate pin; tool activation is deferred until 500ms hold fires.
  _pinMouseDragDeficId = deficId;
  _pinMouseDragMarker = marker;

  // S81: V1-match press-and-hold. Works for ALL active tools. After 500ms the
  // pin goes into "ready" state (blue glow) indicating dragging is armed.
  // Actual dragging starts on subsequent pointer movement. Click released
  // before 500ms = open pin editor (no movement at all). Any movement >5px
  // before the timer fires cancels — falls back to canvas tool behavior.
  _pinMouseLongPress = setTimeout(function() {
    _lastReadyId = deficId;
    // Re-render pins with the "ready" state to show blue glow
    _renderPinsWithState();
    _pinMouseLongPress = null;
  }, 500);
}, true); // Use capture phase

document.addEventListener('mousemove', function(e) {
  // Cancel the press-and-hold timer if the mouse moves before 500ms elapsed
  if (_pinMouseLongPress && !_pinMouseDragging && !_lastReadyId) {
    if (Math.abs(e.clientX - _pinMouseStartX) > 5 || Math.abs(e.clientY - _pinMouseStartY) > 5) {
      clearTimeout(_pinMouseLongPress);
      _pinMouseLongPress = null;
      _pinMouseDragDeficId = null;
      _pinMouseDragMarker = null;
    }
  }
  // Once the pin is in "ready" state (500ms hold completed), any further
  // movement begins actual drag. Transition ready → active.
  if (!_pinMouseDragging && _lastReadyId && _pinMouseDragDeficId) {
    var moved = Math.abs(e.clientX - _pinMouseStartX) > 2 || Math.abs(e.clientY - _pinMouseStartY) > 2;
    if (moved) {
      _pinMouseDragging = true;
      _lastActiveId = _lastReadyId;
      _lastReadyId = null;
      if (_pinMouseDragMarker) _pinMouseDragMarker.classList.add('dragging');
      var area = document.getElementById('dv-canvas-area');
      if (area) area.classList.add('pin-drag-mode');
    }
  }
  if (!_pinMouseDragging || !_pinMouseDragDeficId) return;
  e.preventDefault();
  var wrap = document.getElementById('dv-img-wrap');
  var img = document.getElementById('dv-image');
  if (!wrap || !img || !img.naturalWidth) return;
  var wRect = wrap.getBoundingClientRect();
  var px = (e.clientX - wRect.left) / _scale + _pinMouseOffsetX;
  var py = (e.clientY - wRect.top) / _scale + _pinMouseOffsetY;
  if (_useGLPins){
    var f = Model.findDeficiency(_pinMouseDragDeficId);
    if (f){
      f.defic.pinX = Math.max(0, Math.min(1, px / img.naturalWidth));
      f.defic.pinY = Math.max(0, Math.min(1, py / img.naturalHeight));
      _lastActiveId = _pinMouseDragDeficId;
      var wasDragging = _pinMouseDragging;
      _pinMouseDragging = false;
      _renderPins();
      _pinMouseDragging = wasDragging;
      // Tooltip follows pin during drag
      if (_pinTooltipEl && _pinTooltipEl.style.display !== 'none'){
        _positionTooltip(e.clientX, e.clientY);
      }
    }
  } else if (_pinMouseDragMarker){
    _pinMouseDragMarker.style.left = px + 'px';
    _pinMouseDragMarker.style.top = py + 'px';
  }
});

document.addEventListener('mouseup', function(e) {
  if (_pinMouseLongPress) { clearTimeout(_pinMouseLongPress); _pinMouseLongPress = null; }

  // S81: if pin entered "ready" (blue glow) but never transitioned to drag,
  // clear the ready state and re-render so it returns to idle.
  var hadReady = !!_lastReadyId;
  if (hadReady) {
    _lastReadyId = null;
    _renderPinsWithState();
  }

  // Selector mode: if drag never activated (no movement), clear and return.
  // Treat as a click — open pin editor only if no drag AND no ready transition
  // (i.e. user did NOT do a long press). Long-press without movement = just
  // cancels the armed drag.
  if (_pinMouseDragDeficId && !_pinMouseDragging) {
    _pinMouseDragDeficId = null;
    _pinMouseDragMarker = null;
    return;
  }

  if (!_pinMouseDragging || !_pinMouseDragDeficId) return;

  var area = document.getElementById('dv-canvas-area');
  if (area) area.classList.remove('pin-drag-mode');
  if (_pinMouseDragMarker) _pinMouseDragMarker.classList.remove('dragging');

  // Final position calculation
  var img = document.getElementById('dv-image');
  var wrap = document.getElementById('dv-img-wrap');
  if (img && wrap && img.naturalWidth) {
    var wRect = wrap.getBoundingClientRect();
    var finalLeft = (e.clientX - wRect.left) / _scale + _pinMouseOffsetX;
    var finalTop = (e.clientY - wRect.top) / _scale + _pinMouseOffsetY;
    var pinX = Math.max(0, Math.min(1, finalLeft / img.naturalWidth));
    var pinY = Math.max(0, Math.min(1, finalTop / img.naturalHeight));
    var f = Model.findDeficiency(_pinMouseDragDeficId);
    if (f) {
      f.defic.pinX = pinX;
      f.defic.pinY = pinY;
      Model._notify('deficiency', { action: 'pin-move', deficId: _pinMouseDragDeficId });
      Model.saveNow();
      console.log('[Viewer] Pin moved (mouse) to', pinX.toFixed(3), pinY.toFixed(3));
    }
  }

  _pinMouseDragging = false;
  _pinMouseDragDeficId = null;
  _pinMouseDragMarker = null;
  _pinDragEndTime = Date.now();
  _lastActiveId = null;   // S81 Bug #2: clear active state so pin re-renders in idle color (touchend parity)
  _hideTooltip();         // S81 Bug #2: hide tooltip after drag release (touchend parity)
  _renderPins();
});

// Expose for deficiency cards
window._frtStartPinPlace = function(deficId) {
  // Open current drawing in viewer if not already open
  var overlay = document.getElementById('drawing-viewer-overlay');
  if (!overlay || !overlay.classList.contains('open')) {
    // Open first drawing
    var drawings = _getDrawingsList();
    if (drawings.length) {
      _showDrawing(0);
      setTimeout(function() { _startPinPlace(deficId); }, 500);
    }
  } else {
    _startPinPlace(deficId);
  }
};

// ── Tasks Panel ─────────────────────────────────────────
window._frtRenderTasks = function() { _renderTasks(); };
var _tasksVisible = false;
var _tasksFilter = 'pinned'; // 'pinned' or 'all'

function _toggleTasks() {
  _tasksVisible = !_tasksVisible;
  var panel = document.getElementById('dv-tasks-panel');
  if (panel) panel.classList.toggle('visible', _tasksVisible);
  var btn = document.getElementById('dv-tasks-btn');
  if (btn) btn.classList.toggle('active', _tasksVisible);
  if (_tasksVisible) _renderTasks();
}

function _renderTasks() {
  var list = document.getElementById('dv-tasks-list');
  if (!list) return;
  var allDefics = Model.getAllDeficiencies();
  var drawings = _getDrawingsList();
  var currentDwgId = (_currentDrawingIdx >= 0 && _currentDrawingIdx < drawings.length) ? drawings[_currentDrawingIdx].id : null;

  var filtered = allDefics;
  if (_tasksFilter === 'pinned') {
    filtered = allDefics.filter(function(d) { return d.defic.drawingId === currentDwgId && d.defic.pinX != null; });
  }

  var html = '';
  if (!filtered.length) {
    html = '<div style="padding:16px;color:#8a94b0;text-align:center;font-size:calc(12px + var(--ts));">No ' + (_tasksFilter === 'pinned' ? 'pins on this drawing' : 'deficiencies') + '</div>';
  }
  filtered.forEach(function(d) {
    var def = d.defic;
    var desc = (def.observations && def.observations.length && def.observations[0].text) ? def.observations[0].text : '';
    if (desc.length > 60) desc = desc.substring(0, 60) + '\u2026';
    var isClosed = def.status === 'closed' || def.status === 'Addressed & Closed';
    var fill = def.iar ? '#E91E8C' : (def.priority === 'general' ? '#1A7A4A' : def.priority === 'low' ? '#E67E22' : '#C0392B');
    if (isClosed) fill = '#1A7A4A';
    var isPinned = def.drawingId && def.pinX != null;
    html += '<div class="dv-task-item" data-task-defic-id="' + def.id + '">';
    html += '<div class="dv-task-dot" style="background:' + fill + ';">' + def.num + '</div>';
    html += '<div class="dv-task-desc">' + (desc || '\u2014') + '</div>';
    html += '<button class="dv-task-pin-btn" data-task-pin="' + def.id + '" title="' + (isPinned ? 'Move pin' : 'Place pin') + '">' + (isPinned ? '📌' : '📍') + '</button>';
    html += '<button class="dv-task-del-btn" data-task-del="' + def.id + '" title="Delete deficiency">\u2715</button>';
    html += '</div>';
  });
  list.innerHTML = html;
  var countEl = document.getElementById('dv-tasks-count');
  if (countEl) countEl.textContent = filtered.length;
}

// Tasks event handlers
document.addEventListener('click', function(e) {
  // Tasks toggle
  if (e.target.closest && e.target.closest('#dv-tasks-btn')) { _toggleTasks(); return; }

  // Tasks filter toggle
  if (e.target.closest && e.target.closest('#dv-tasks-filter')) {
    _tasksFilter = _tasksFilter === 'pinned' ? 'all' : 'pinned';
    var fb = document.getElementById('dv-tasks-filter');
    if (fb) fb.textContent = _tasksFilter === 'pinned' ? 'Pinned' : 'All Items';
    _renderTasks();
    return;
  }

  // Task delete button — delete the deficiency entirely
  if (e.target.closest && e.target.closest('[data-task-del]')) {
    var delId = e.target.closest('[data-task-del]').getAttribute('data-task-del');
    var f = Model.findDeficiency(delId);
    var label = f ? '#' + f.defic.num : 'this deficiency';
    showConfirm('Delete Deficiency', 'Delete deficiency ' + label + '? You can undo with Ctrl+Z.').then(function(yes) {
      if (yes) {
        Model.removeDeficiency(delId);
        Model.saveNow();
        _renderPins();
        _renderTasks();
        console.log('[Viewer] Deficiency deleted from Tasks:', delId);
      }
    });
    return;
  }

  // Task pin button
  if (e.target.closest && e.target.closest('[data-task-pin]')) {
    var deficId = e.target.closest('[data-task-pin]').getAttribute('data-task-pin');
    _startPinPlace(deficId);
    return;
  }

  // New Task button — create deficiency + start pin placement
  if (e.target.closest && e.target.closest('#dv-new-task')) {
    var proj = Model.getProject();
    if (!proj) return;
    // Find or create "Site General" contractor
    var siteGen = null;
    if (proj.contractors) {
      siteGen = proj.contractors.find(function(c) { return c.name === 'Site General'; });
    }
    if (!siteGen) {
      siteGen = Model.addContractor('Site General');
    }
    // Create new deficiency
    var newDefic = Model.addDeficiency(siteGen.id);
    if (newDefic) {
      console.log('[Viewer] New task created — deficiency #' + newDefic.num);
      _startPinPlace(newDefic.id);
      // Show feedback
      var area = document.getElementById('dv-canvas-area');
      if (area) area.classList.add('pin-mode');
    }
    return;
  }

  // Tasks fold
  if (e.target.closest && e.target.closest('#dv-tasks-fold-btn')) {
    var panel = document.getElementById('dv-tasks-panel');
    if (panel) panel.classList.toggle('collapsed');
    return;
  }
});

// ── Layers Toggle ───────────────────────────────────────
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('#dv-layers-btn')) {
    var menu = document.getElementById('dv-layers-menu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    e.stopPropagation();
    return;
  }
  // Close on outside click
  if (!e.target.closest || !e.target.closest('#dv-layers-menu')) {
    var m = document.getElementById('dv-layers-menu');
    if (m) m.style.display = 'none';
  }
});

document.addEventListener('change', function(e) {
  if (e.target.id === 'layer-all') {
    var checked = e.target.checked;
    var lt = document.getElementById('layer-tasks');
    var lm = document.getElementById('layer-markups');
    if (lt) lt.checked = checked;
    if (lm) lm.checked = checked;
  }
  if (e.target.id === 'layer-tasks' || e.target.id === 'layer-all') {
    var show = document.getElementById('layer-tasks');
    var pinsLayer = document.getElementById('dv-pins-layer');
    if (pinsLayer) pinsLayer.style.display = (show && show.checked) ? '' : 'none';
  }
  if (e.target.id === 'layer-markups' || e.target.id === 'layer-all') {
    var show2 = document.getElementById('layer-markups');
    var mc = document.getElementById('markup-canvas');
    if (mc) mc.style.display = (show2 && show2.checked) ? '' : 'none';
  }
});

// ── Heights Panel ───────────────────────────────────────
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('[data-dv-action="heights"]')) {
    _openHeights();
    var mm = document.getElementById('dv-more-menu');
    if (mm) mm.style.display = 'none';
    return;
  }
  if (e.target.closest && e.target.closest('#dv-heights-close')) {
    var hp = document.getElementById('dv-heights-panel');
    if (hp) hp.style.display = 'none';
    return;
  }
  if (e.target.closest && e.target.closest('#dv-heights-add')) {
    _addHeightRow();
    return;
  }
  if (e.target.closest && e.target.closest('#dv-heights-save')) {
    _saveHeights();
    return;
  }
  if (e.target.closest && e.target.closest('.ht-del')) {
    e.target.closest('.dv-heights-row').remove();
    return;
  }
});

function _openHeights() {
  var panel = document.getElementById('dv-heights-panel');
  if (!panel) return;
  panel.style.display = 'flex';
  // Load existing heights for current drawing
  var drawings = _getDrawingsList();
  if (_currentDrawingIdx < 0 || _currentDrawingIdx >= drawings.length) return;
  var dwg = drawings[_currentDrawingIdx];
  var heights = (dwg.heights && dwg.heights.length) ? dwg.heights : [
    { label: 'U/S Ceiling Deck', value: "5'-0\"", unit: 'A.F.F.' },
    { label: 'U/S Branchline', value: "5'-0\"", unit: 'A.F.F.' },
    { label: 'U/S Sprinkler Deflectors', value: "5'-0\"", unit: 'A.F.F.' },
    { label: 'U/S Cross Main', value: "5'-0\"", unit: 'A.F.F.' },
    { label: 'U/S Feed Main', value: "5'-0\"", unit: 'A.F.F.' },
    { label: 'Top of Storage', value: "5'-0\"", unit: 'A.F.F.' }
  ];
  var rows = document.getElementById('dv-heights-rows');
  if (rows) {
    var html = '';
    heights.forEach(function(h) {
      html += '<div class="dv-heights-row">';
      html += '<input type="text" value="' + (h.label || '').replace(/"/g,'&quot;') + '" placeholder="Label">';
      html += '<input type="text" value="' + (h.value || '').replace(/"/g,'&quot;') + '" placeholder="Value" style="max-width:70px;">';
      html += '<span class="ht-unit">' + (h.unit || 'A.F.F.') + '</span>';
      html += '<button class="ht-del" title="Remove">✕</button>';
      html += '</div>';
    });
    rows.innerHTML = html;
  }
  // Populate copy-from dropdown
  var sel = document.getElementById('dv-heights-copy-select');
  if (sel) {
    var opts = '<option value="">\u2014 Select a drawing to copy from \u2014</option>';
    drawings.forEach(function(d, i) {
      if (i !== _currentDrawingIdx) {
        opts += '<option value="' + d.id + '">' + (d.name || 'Drawing ' + (i + 1)) + '</option>';
      }
    });
    sel.innerHTML = opts;
  }
}

function _addHeightRow() {
  var rows = document.getElementById('dv-heights-rows');
  if (!rows) return;
  var div = document.createElement('div');
  div.className = 'dv-heights-row';
  div.innerHTML = '<input type="text" placeholder="Label"><input type="text" placeholder="Value" style="max-width:70px;"><span class="ht-unit">A.F.F.</span><button class="ht-del" title="Remove">✕</button>';
  rows.appendChild(div);
}

function _saveHeights() {
  var rows = document.getElementById('dv-heights-rows');
  if (!rows) return;
  var drawings = _getDrawingsList();
  if (_currentDrawingIdx < 0 || _currentDrawingIdx >= drawings.length) return;
  var dwg = drawings[_currentDrawingIdx];
  var heights = [];
  rows.querySelectorAll('.dv-heights-row').forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    if (inputs[0] && inputs[0].value.trim()) {
      heights.push({ label: inputs[0].value.trim(), value: inputs[1] ? inputs[1].value.trim() : '', unit: 'A.F.F.' });
    }
  });
  dwg.heights = heights;
  Model.saveNow();
  var panel = document.getElementById('dv-heights-panel');
  if (panel) panel.style.display = 'none';
  console.log('[Viewer] Heights saved:', heights.length, 'rows');
}
