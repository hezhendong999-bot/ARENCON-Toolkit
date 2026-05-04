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

// ── S95: drawing dimension helpers ──────────────────────────────────────
// Why: pin placement, hit-testing and coordinate math historically read
// dv-image.naturalWidth / .naturalHeight. In tile-mode drawings the
// backdrop <img> is now either skipped or thumbnailed on touch devices
// (to prevent the 100MB decoded-bitmap kill-the-renderer path), so its
// natural dimensions no longer reflect the TRUE drawing dimensions.
// Source the true dims from TiledPdf when active, fall back to img
// naturalWidth/Height otherwise. Preserves identical behavior on
// image-mode drawings and on desktop.
function _getDrawingNaturalW(imgEl){
  if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()){
    var d = TiledPdf.getDimensions && TiledPdf.getDimensions();
    if (d && d.drawW) return d.drawW;
  }
  return (imgEl && imgEl.naturalWidth) || 0;
}
function _getDrawingNaturalH(imgEl){
  if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()){
    var d = TiledPdf.getDimensions && TiledPdf.getDimensions();
    if (d && d.drawH) return d.drawH;
  }
  return (imgEl && imgEl.naturalHeight) || 0;
}

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
  var budget = 4 * 1000 * 1000; // S95: 8M->4M. At 8M the downscaler's drawImage
  // peak memory (25MP source probe + 8M target canvas) crossed the iPad iOS 16
  // budget and silently threw, falling back to the original 25M-pixel URL —
  // which then loaded the full 100MB decoded bitmap into dv-image. Halving to
  // 4M keeps the peak at ~116MB instead of ~132MB and lets the downscale
  // actually complete. Post-fix backdrop sits at ~16MB decoded.
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
  // S113 Push 13: notify Markup of the new viewer scale so it can resize
  // its canvas to displayed-pixel resolution. Markup filters pan-only
  // events internally (no-op if scale unchanged) so this is cheap.
  if (typeof Markup !== 'undefined' && Markup.setRenderScale) {
    try { Markup.setRenderScale(_scale); } catch(_e) {}
  }
}

function _clampPan() {
  var img = document.getElementById('dv-image');
  var area = document.getElementById('dv-canvas-area');
  if (!area) return;
  var natW = 0, natH = 0;
  if (TiledPdf.isActive()) {
    var dims = TiledPdf.getDimensions();
    if (dims) { natW = dims.drawW; natH = dims.drawH; }
  } else if (img && _getDrawingNaturalW(img)) {
    natW = _getDrawingNaturalW(img); natH = _getDrawingNaturalH(img);
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
// S83b2: iPad Safari's render buffer allocation at zoom-in is the second
// memory pressure point (first is initial decode, handled by downscaler).
// Cap touch-device max zoom to 4× so a zoomed 8MP image stays under ~128MB.
var _IS_TOUCH = false;
try { _IS_TOUCH = window.matchMedia && window.matchMedia('(pointer:coarse)').matches; } catch(_){}
var _MAX_ZOOM = _IS_TOUCH ? 4 : 8;

window._frtZoomIn = function() {
  _scale = Math.min(_MAX_ZOOM, _scale * 1.3);
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
  if (!img || !area || !_getDrawingNaturalW(img)) { _fitScale = 1; return; }
  var aw = area.clientWidth;
  var ah = area.clientHeight;
  var iw = _getDrawingNaturalW(img);
  var ih = _getDrawingNaturalH(img);
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

  // S83b12: explicit unload of previous image bitmap. At 6144px, each decoded
  // page is ~100 MB in memory. If the browser keeps the old bitmap alive
  // briefly while the new one loads, peak memory could double. Setting src=''
  // forces immediate release. Safe on all browsers.
  if (img.src && img.src !== 'about:blank') {
    try { img.src = ''; } catch(e) {}
  }

  // S87: Server-rendered tile branch — tiles are pre-rendered JPEGs in R2,
  // no pdf.js needed. Takes priority over the legacy client-side PDF path.
  if (d.tileStatus === 'ready' && d.tileManifestUrl) {
    _ensureTiledInit();
    if (title) title.textContent = d.name || 'Drawing ' + (idx + 1);
    overlay.classList.add('open');
    document.body.classList.add('dv-open');
    _fitScale = 1; _scale = 1; _panX = 0; _panY = 0;
    var wrapTile = document.getElementById('dv-img-wrap');
    if (wrapTile) wrapTile.style.transform = 'translate3d(0,0,0) scale(1)';
    TiledPdf.open(d.id, d.pdfPage || 1).then(function() {
      if (TiledPdf.isActive()) Markup.init(d.id);
    });
    return;
  }

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
  // Budget: 8 MP decoded (≈32 MB RGBA). Lower than 12 MP because CSS zoom
  // asks Safari to allocate a larger render buffer at zoom-in, so we need
  // headroom for 3–4× zoom before the render buffer itself blows the ceiling.
  var _IPAD_PX_BUDGET = 4 * 1000 * 1000;  // S95: halved from 8M — see comment at line ~358

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
        console.log('[Viewer] Image loaded (' + (label || 'unknown') + '): ' + _getDrawingNaturalW(img) + '×' + _getDrawingNaturalH(img));
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
  var newScale = Math.max(_fitScale, Math.min(_MAX_ZOOM, _scale * delta));

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
  if (e.key === '+' || e.key === '=') { _scale = Math.min(_MAX_ZOOM, _scale * 1.2); _applyTransform(); }
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
        _scale = Math.min(_MAX_ZOOM, _fitScale * 3);
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
    var newScale = Math.max(_fitScale, Math.min(_MAX_ZOOM, _touchStartScale * ratio));

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

// S116 Push 2: pin highlight system. Used when navigating to a pin from
// "Go to drawing" or other jump-to-pin paths so the inspector can spot the
// target among other pins on the drawing.
//
// GL path: hijacks the existing `activeId` slot (which already renders pins
// at 1.15× scale) and pulses it on/off via setInterval, calling _renderPins
// to repaint each beat. After ~3 seconds (~5 beats) it clears.
//
// HTML fallback path: adds an inline glow + scale animation directly on the
// .pin-marker DOM element by id.
var _highlightDeficId = null;
var _highlightPulseTimer = null;
var _highlightPulseClearTimer = null;
function _highlightPin(deficId) {
  if (!deficId) return;
  // Cancel any in-flight highlight first.
  if (_highlightPulseTimer) { clearInterval(_highlightPulseTimer); _highlightPulseTimer = null; }
  if (_highlightPulseClearTimer) { clearTimeout(_highlightPulseClearTimer); _highlightPulseClearTimer = null; }
  _highlightDeficId = deficId;

  // GL path: each beat toggles activeId between deficId and null so the pin
  // visually pumps. Five beats over ~3 seconds.
  var beat = 0;
  var totalBeats = 6;
  var beatMs = 500;
  _highlightPulseTimer = setInterval(function() {
    beat++;
    // Even beats: highlight on; odd beats: off (creates pulse).
    _highlightDeficId = (beat % 2 === 0) ? deficId : null;
    _renderPins();
    if (beat >= totalBeats) {
      clearInterval(_highlightPulseTimer);
      _highlightPulseTimer = null;
      _highlightDeficId = null;
      _renderPins();
    }
  }, beatMs);
  // First paint immediately (without waiting for first interval tick).
  _renderPins();

  // HTML path: also apply an inline animated style to the marker for
  // browsers that fall back to the HTML pin layer (?webgl-pins=0). Selector
  // is the [data-defic-id] inside #dv-pins-layer.
  var htmlMarker = document.querySelector('#dv-pins-layer .pin-marker[data-defic-id="' + deficId + '"]');
  if (htmlMarker) {
    htmlMarker.style.transition = 'transform 0.25s ease, filter 0.25s ease';
    htmlMarker.style.zIndex = '50';
    var pulses = 0;
    var pulseTimer = setInterval(function() {
      pulses++;
      var on = pulses % 2 === 1;
      htmlMarker.style.transform = (on
        ? 'translate(-50%, -100%) scale(1.4)'
        : 'translate(-50%, -100%) scale(1.0)');
      htmlMarker.style.filter = on ? 'drop-shadow(0 0 12px gold) drop-shadow(0 0 4px gold)' : '';
      if (pulses >= totalBeats) {
        clearInterval(pulseTimer);
        htmlMarker.style.transform = 'translate(-50%, -100%)';
        htmlMarker.style.filter = '';
        htmlMarker.style.zIndex = '';
        htmlMarker.style.transition = '';
      }
    }, beatMs);
  }
}

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
  if (!img || !_getDrawingNaturalW(img)) {
    if (htmlLayer) htmlLayer.innerHTML = '';
    if (_useGLPins && _glPinsReady && window.PinsGL) window.PinsGL.render([], {});
    return;
  }
  var iw = _getDrawingNaturalW(img);
  var ih = _getDrawingNaturalH(img);
  var allDefics = Model.getAllDeficiencies();
  var pins = allDefics.filter(function(d) { return d.defic.drawingId === drawingId && d.defic.pinX != null; });

  // ── WebGL path ───────────────────────────────────────────
  if (_useGLPins && window.PinsGL){
    if (!_glPinsReady){ _ensureGLPinsInit(); return; }
    // Hide HTML layer content (keep DOM for accessibility mirror)
    if (htmlLayer) htmlLayer.innerHTML = '';

    // Compute image rect relative to the GL canvas host (dv-canvas-area)
    var host = document.getElementById('dv-canvas-area');
    // S112: in tile mode, dv-image is display:none (CSS rule
    // `#dv-image[src=""]{display:none!important}` strikes once tiledPdf.js
    // blanks the backdrop). getBoundingClientRect on display:none returns
    // 0×0, which makes PinsGL.render early-return on `!imgRect.width` and
    // no pins paint. Use dv-img-wrap instead — it's sized to drawW × drawH
    // and carries the user's pan/zoom transform, so its bounding rect is
    // the correct on-screen drawing area in either tile or img mode.
    var rectSrc;
    if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()) {
      rectSrc = document.getElementById('dv-img-wrap') || img;
    } else {
      rectSrc = img;
    }
    var imgRect = rectSrc.getBoundingClientRect();
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
      // S116 Push 2: when _highlightDeficId is set (during a Go-to-drawing
      // pulse), it takes precedence over the user's current click-active pin
      // so the highlight is visible even if another pin happens to be active.
      activeId:  _highlightDeficId || _lastActiveId || null,
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
  if (!img || !wrap || !_getDrawingNaturalW(img)) return;

  // Get click position relative to the image
  var rect = wrap.getBoundingClientRect();
  var clickX = (e.clientX - rect.left) / _scale;
  var clickY = (e.clientY - rect.top) / _scale;
  var pinX = Math.max(0, Math.min(1, clickX / _getDrawingNaturalW(img)));
  var pinY = Math.max(0, Math.min(1, clickY / _getDrawingNaturalH(img)));

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
  // S116 Push 2: critical — reset Markup.setTool from 'pin' back to 'select'.
  // Without this, Markup.getTool() === 'pin' would persist after the place
  // completes, and the next stray tap (panning, toolbar miss, anywhere) hits
  // the `Markup.getTool() === 'pin'` branch in the canvas click handler and
  // creates a brand-new deficiency at that location — visible as a duplicate
  // pin the user never asked for.
  if (typeof Markup !== 'undefined' && Markup.setTool) Markup.setTool('select');
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
  if (!img || !wrap || !_getDrawingNaturalW(img)) return;

  var rect = wrap.getBoundingClientRect();
  var clickX = (clientX - rect.left) / _scale;
  var clickY = (clientY - rect.top) / _scale;
  var pinX = Math.max(0, Math.min(1, clickX / _getDrawingNaturalW(img)));
  var pinY = Math.max(0, Math.min(1, clickY / _getDrawingNaturalH(img)));

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
  // S116 Push 2: disarm the pin tool after one creation. Otherwise a second
  // tap (e.g., dismissing the editor by tapping outside, or panning) would
  // immediately create another deficiency. v1 behaviour was the same —
  // pin tool fires once, then deactivates.
  if (typeof Markup !== 'undefined' && Markup.setTool) Markup.setTool('select');
  var pinBtn = document.getElementById('dv-pin-btn');
  if (pinBtn) { pinBtn.style.background = 'rgba(255,255,255,.12)'; pinBtn.textContent = '\uD83D\uDCCC Pin'; }
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
  // S116 Push 5: extended with "+ New Contractor…" option at the bottom
  // and edit/delete buttons in a sibling row below. See _peRenderCtrCrudRow.
  var cSel = document.getElementById('pe-contractor');
  var curCtrId = f.contractor ? f.contractor.id : '';
  if (cSel) {
    var proj = Model.getProject();
    var opts = '<option value=""' + (!curCtrId ? ' selected' : '') + '>Site General</option>';
    (proj.contractors || []).forEach(function(c) {
      opts += '<option value="' + c.id + '"' + (curCtrId === c.id ? ' selected' : '') + '>' + String(c.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>';
    });
    opts += '<option value="__new__">+ New Contractor\u2026</option>';
    cSel.innerHTML = opts;
  }
  _peRenderCtrCrudRow(curCtrId);

  // Date
  var dateIn = document.getElementById('pe-date');
  if (dateIn) dateIn.value = d.date || new Date().toISOString().split('T')[0];

  // S116 Push 1 (H): Status — when every observation is priority=general,
  // there's no notion of "open vs closed" because the entry isn't a defect,
  // it's a note. Show a disabled "— Not a deficiency —" option in that case.
  // The check uses the per-observation priority if present (forward-compat
  // with item C, deferred to its own session) and falls back to pin-level
  // priority otherwise. Also disables IAR which has no meaning for notes.
  var obsArrForStatus = (d.observations && d.observations.length) ? d.observations : [{}];
  var allGeneral = obsArrForStatus.every(function(o) {
    var pri = o && o.priority ? o.priority : (d.priority || 'high');
    return pri === 'general';
  });
  var statusSel = document.getElementById('pe-status');
  if (statusSel) {
    if (allGeneral) {
      statusSel.innerHTML = '<option value="na" selected>\u2014 Not a deficiency \u2014</option>';
      statusSel.disabled = true;
      statusSel.style.opacity = '0.5';
      statusSel.style.cursor = 'not-allowed';
    } else {
      statusSel.innerHTML = '<option value="open">\u25CF Outstanding</option><option value="closed">\u2714 Addressed & Closed</option>';
      statusSel.value = (d.status === 'closed' || d.status === 'Addressed & Closed') ? 'closed' : 'open';
      statusSel.disabled = false;
      statusSel.style.opacity = '';
      statusSel.style.cursor = '';
    }
  }

  // IAR
  var iarBtn = document.getElementById('pe-iar');
  if (iarBtn) {
    iarBtn.classList.toggle('active', !!d.iar);
    iarBtn.disabled = allGeneral;
    iarBtn.style.opacity = allGeneral ? '0.4' : '';
    iarBtn.style.cursor = allGeneral ? 'not-allowed' : '';
  }

  // S116 Push 1 (B): description autocomplete via <datalist>. Builds a
  // de-duplicated list of all existing observation texts across the project
  // so common phrases ("Sprinkler escutcheon missing — replace") can be
  // re-used by typing the first few letters. Native browser feature; works
  // on all targeted devices.
  var allDescs = [];
  var projForDl = Model.getProject();
  if (projForDl) {
    Model.getAllDeficiencies().forEach(function(rec) {
      var def = rec.defic;
      (def.observations || []).forEach(function(ob) { if (ob && ob.text && ob.text.trim()) allDescs.push(ob.text.trim()); });
      (def.entries || []).forEach(function(en) { if (en && en.description && en.description.trim()) allDescs.push(en.description.trim()); });
      if (def.description && def.description.trim()) allDescs.push(def.description.trim());
    });
  }
  // De-dupe while preserving insertion order; cap at 200 to keep DOM small.
  var seenDl = {}, uniqDescs = [];
  for (var di = 0; di < allDescs.length && uniqDescs.length < 200; di++) {
    var s = allDescs[di];
    if (!seenDl[s]) { seenDl[s] = 1; uniqDescs.push(s); }
  }
  var oldDl = document.getElementById('pe-desc-suggestions');
  if (oldDl && oldDl.parentNode) oldDl.parentNode.removeChild(oldDl);
  if (uniqDescs.length) {
    var dl = document.createElement('datalist');
    dl.id = 'pe-desc-suggestions';
    var dlHtml = '';
    uniqDescs.forEach(function(s) {
      dlHtml += '<option value="' + String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></option>';
    });
    dl.innerHTML = dlHtml;
    document.body.appendChild(dl);
  }
  var ta = document.getElementById('pe-obs-text');
  if (ta) ta.setAttribute('list', 'pe-desc-suggestions');

  // Observations tabs
  _peRenderObsTabs(d);
  _peRenderObsContent(d, 0);

  // Move-to dropdown (desktop + mobile share the same options)
  var drawingsForMove = _getDrawingsList();
  var currentDwgId = (_currentDrawingIdx >= 0 && drawingsForMove[_currentDrawingIdx]) ? drawingsForMove[_currentDrawingIdx].id : null;
  var moveOpts = '<option value="' + (currentDwgId || '') + '">\u2014 Current drawing \u2014</option>';
  drawingsForMove.forEach(function(dw) {
    if (dw.id !== currentDwgId) moveOpts += '<option value="' + dw.id + '">' + (dw.name || 'Drawing') + '</option>';
  });
  var moveSel = document.getElementById('pe-move-to');
  if (moveSel) moveSel.innerHTML = moveOpts;
  var moveSelMobile = document.getElementById('pe-move-to-mobile');
  if (moveSelMobile) moveSelMobile.innerHTML = moveOpts;

  // S116 Push 1 (G): canvas-based mini-map matching v1.
  // Renders the FULL drawing image (regardless of current viewer zoom) with
  // a priority-coloured teardrop pin marker (number inside, IAR pink) drawn
  // on top. Reads d.drawingId so cross-drawing pins (opened from Tasks panel
  // or Summary tab) show the correct drawing, not the currently-loaded one.
  // Image source priority: dwg.dataUrl → dwg.r2Url → L0 tile (256px) for
  // tile-mode-only PDF drawings. See _renderPinMiniMap below.
  _renderPinMiniMap(d, 'pe-location-thumb');
  _renderPinMiniMap(d, 'pe-location-thumb-mobile');

  overlay.style.display = 'flex';
}

// S116 Push 5: contractor edit/delete + new-contractor inline input,
// rendered directly under the CONTRACTOR dropdown in the pin editor.
//
// Three states managed here:
//   - 'idle' (default)  — show ✏️ Edit / 🗑️ Delete buttons when a real
//                         contractor is selected; hide them for Site General.
//   - 'new'             — show inline name input + ✓/✕ buttons. Picked from
//                         the "+ New Contractor…" dropdown option.
//   - 'edit'            — show inline name input pre-filled with the current
//                         name + ✓/✕. Picked from clicking ✏️ Edit.
//
// The "previous selection" is tracked so picking "+ New Contractor…" then
// cancelling restores the dropdown to whatever was selected before.
var _ctrCrudMode = 'idle';
var _ctrCrudPrevSel = '';
function _peRenderCtrCrudRow(curCtrId) {
  var cSel = document.getElementById('pe-contractor');
  var ctrField = cSel ? cSel.parentElement : null;
  if (!ctrField) return;
  // Re-injection pattern: clean up the previous row by id so re-renders
  // don't stack copies. The action row may live in a different parent
  // (cSel.parentElement vs cSel.parentElement.parentElement) depending on
  // future layout shifts — search globally to be safe.
  var oldRow = document.getElementById('pe-ctr-crud-row');
  if (oldRow && oldRow.parentNode) oldRow.parentNode.removeChild(oldRow);

  var hasCtr = !!curCtrId && curCtrId !== '__new__';
  var actionsDisplay = (_ctrCrudMode === 'idle' && hasCtr) ? 'flex' : 'none';
  var inputDisplay   = (_ctrCrudMode === 'new' || _ctrCrudMode === 'edit') ? 'flex' : 'none';
  var inputPrefill   = '';
  if (_ctrCrudMode === 'edit' && hasCtr) {
    var p = Model.getProject();
    var c = (p && p.contractors ? p.contractors : []).find(function(cc){ return cc.id === curCtrId; });
    if (c) inputPrefill = String(c.name || '').replace(/"/g, '&quot;');
  }

  // Style refs match the muted action-button palette used elsewhere in the
  // pin editor. Edit = slate-blue tint, Delete = red tint, ✓ confirm = green
  // tint. All inline so the row works regardless of CSS load order.
  var crudRow = document.createElement('div');
  crudRow.id = 'pe-ctr-crud-row';
  crudRow.style.cssText = 'margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
  crudRow.innerHTML = ''
    + '<div id="pe-ctr-actions" style="display:' + actionsDisplay + ';gap:6px;">'
      + '<button id="pe-ctr-edit" type="button" title="Rename this contractor" style="background:transparent;border:1px solid #5A6E80;color:#5A6E80;border-radius:5px;padding:2px 8px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));cursor:pointer;">\u270F\uFE0F Edit</button>'
      + '<button id="pe-ctr-del" type="button" title="Delete this contractor" style="background:transparent;border:1px solid #A85959;color:#A85959;border-radius:5px;padding:2px 8px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));cursor:pointer;">\uD83D\uDDD1\uFE0F Delete</button>'
    + '</div>'
    + '<div id="pe-ctr-input-row" style="display:' + inputDisplay + ';align-items:center;gap:4px;flex:1;min-width:160px;">'
      + '<input type="text" id="pe-ctr-input" placeholder="Contractor name\u2026" value="' + inputPrefill + '" style="flex:1;min-width:0;padding:4px 8px;border:1.5px solid var(--border);border-radius:5px;font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));">'
      + '<button id="pe-ctr-confirm" type="button" title="Confirm" style="background:#5C7A65;color:white;border:none;border-radius:5px;width:28px;height:28px;padding:0;font-family:Calibri,sans-serif;font-size:14px;cursor:pointer;flex-shrink:0;">\u2713</button>'
      + '<button id="pe-ctr-cancel" type="button" title="Cancel" style="background:transparent;border:1px solid var(--border);color:var(--silver);border-radius:5px;width:28px;height:28px;padding:0;font-family:Calibri,sans-serif;font-size:14px;cursor:pointer;flex-shrink:0;">\u2715</button>'
    + '</div>';
  ctrField.appendChild(crudRow);

  // Auto-focus the input when shown so the user can type immediately.
  if (inputDisplay === 'flex') {
    var inp = document.getElementById('pe-ctr-input');
    if (inp) {
      setTimeout(function(){ inp.focus(); inp.select(); }, 30);
    }
  }
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
  if (!obs.length) obs = [{ text: '', addressed: false, photos: [] }];
  var o = obs[idx] || obs[0];

  var prBtns = document.querySelectorAll('.pe-pri-btn');
  prBtns.forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-pe-pri') === (d.priority || 'high'));
  });

  var textarea = document.getElementById('pe-obs-text');
  if (textarea) textarea.value = o.text || '';

  // S116 Push 1 (A): per-observation contractor override.
  // Visible only when the pin has more than one observation. Each obs can
  // optionally be assigned to a different contractor — useful when one pin
  // covers two trades (e.g. sprinkler obs + alarm obs on the same fixture).
  // Stored as o.contractorId. Empty/undefined = "use pin contractor".
  // The row is injected at the top of the obs content (above PRIORITY/TYPE)
  // every render; cleaned up via id so re-renders don't stack copies.
  var content = document.getElementById('pe-obs-content');
  var oldOcr = document.getElementById('pe-obs-ctr-row');
  if (oldOcr && oldOcr.parentNode) oldOcr.parentNode.removeChild(oldOcr);
  var obsArrLen = (d.observations && d.observations.length) ? d.observations.length : 0;
  if (content && obsArrLen > 1) {
    var projForOcr = Model.getProject();
    var entryCtrId = o.contractorId || '';
    var hasOverride = !!entryCtrId;
    var ocrOpts = '<option value="">\u2014 Same as pin \u2014</option>';
    (projForOcr && projForOcr.contractors ? projForOcr.contractors : []).forEach(function(cc) {
      ocrOpts += '<option value="' + cc.id + '"' + (cc.id === entryCtrId ? ' selected' : '') + '>'
        + String(cc.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>';
    });
    var ocrRow = document.createElement('div');
    ocrRow.id = 'pe-obs-ctr-row';
    ocrRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:5px 8px;background:rgba(176,127,90,.10);border-radius:6px;border:1px solid rgba(176,127,90,.30);';
    ocrRow.innerHTML =
      '<span style="font-size:calc(10px + var(--ts));font-weight:700;color:#7E5A3F;white-space:nowrap;flex-shrink:0;">\uD83D\uDCCB Obs. Contractor</span>'
      + '<select id="pe-obs-ctr" style="flex:1;min-width:0;padding:3px 6px;border:1px solid rgba(176,127,90,.40);border-radius:5px;font-family:inherit;font-size:calc(12px + var(--ts));background:white;">'
      + ocrOpts + '</select>'
      + (hasOverride ? '<button id="pe-obs-ctr-reset" style="font-size:calc(10px + var(--ts));color:#888;background:none;border:none;cursor:pointer;padding:2px 4px;white-space:nowrap;flex-shrink:0;">\u2715 Reset</button>' : '');
    // Insert as the first child of pe-obs-content so it appears above the
    // PRIORITY/TYPE section.
    if (content.firstChild) content.insertBefore(ocrRow, content.firstChild);
    else content.appendChild(ocrRow);
  }

  // S114: render existing observation photos as a thumbnail strip.
  // Previously the modal showed only upload buttons; existing photos were invisible.
  // S116 Push 1 (E): each thumb now has a corner ✕ remove button.
  var strip = document.getElementById('pe-obs-photos');
  if (strip) {
    var photos = o.photos || [];
    if (!photos.length) {
      strip.innerHTML = '';
      strip.style.display = 'none';
    } else {
      strip.style.display = 'flex';
      var html = '';
      photos.forEach(function(ph, pi) {
        // S115 P11: fallback — thumb → dataUrl (blob URL beats not-yet-
        // uploaded r2Url) → r2Url. Same logic as defic tab.
        var src = ph.thumb || ph.dataUrl || ph.r2Url || '';
        if (!src) return;
        html += '<div class="pe-photo-thumb" data-pe-photo="' + pi + '" title="Photo ' + (pi + 1) + '" style="position:relative;">'
          + '<img src="' + src + '" alt="Photo ' + (pi + 1) + '" loading="lazy">'
          + '<button data-pe-photo-remove="' + pi + '" title="Remove photo" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.65);color:white;border:none;border-radius:50%;width:20px;height:20px;min-width:20px;min-height:20px;padding:0;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">\u2715</button>'
          + '</div>';
      });
      strip.innerHTML = html;
    }
  }

  // S116 Push 1 (E): wire the .pe-photo-zone (Upload / Camera / + Gallery
  // buttons + drop target) to the active deficiency + obs index. Re-using
  // the deficiencies-tab data-action handlers means photo records, R2
  // upload, and Model notifications all behave identically regardless of
  // where the upload was initiated.
  var zone = document.querySelector('.pe-photo-zone');
  if (zone) {
    zone.setAttribute('data-action', 'photo-drop');
    zone.setAttribute('data-defic-id', _peDeficId || '');
    zone.setAttribute('data-obs-idx', String(idx));
    var upBtn = document.getElementById('pe-upload-btn');
    if (upBtn) {
      upBtn.setAttribute('data-action', 'photo-upload');
      upBtn.setAttribute('data-defic-id', _peDeficId || '');
      upBtn.setAttribute('data-obs-idx', String(idx));
    }
    var camBtn = document.getElementById('pe-camera-btn');
    if (camBtn) {
      camBtn.setAttribute('data-action', 'photo-camera');
      camBtn.setAttribute('data-defic-id', _peDeficId || '');
      camBtn.setAttribute('data-obs-idx', String(idx));
    }
    var galBtn = document.getElementById('pe-gallery-btn');
    if (galBtn) {
      galBtn.setAttribute('data-action', 'photo-gallery-pick');
      galBtn.setAttribute('data-defic-id', _peDeficId || '');
      galBtn.setAttribute('data-obs-idx', String(idx));
    }
    // Local dragover styling — the deficiencies.js drop handler adds the
    // photo to the model; we just provide the visual feedback here.
    zone.ondragover = function(ev) { ev.preventDefault(); zone.classList.add('drag-over'); };
    zone.ondragleave = function() { zone.classList.remove('drag-over'); };
  }

  // S116 Push 2: "Split to new pin" — extract the active observation into
  // its own brand-new pin at the same coords. Visible only when the source
  // has 2+ observations (single-obs pins can't be split — there'd be nothing
  // left). Re-injected on every render via #pe-split-row id so re-renders
  // don't stack copies.
  var content2 = document.getElementById('pe-obs-content');
  var oldSplitRow = document.getElementById('pe-split-row');
  if (oldSplitRow && oldSplitRow.parentNode) oldSplitRow.parentNode.removeChild(oldSplitRow);
  var obsArrLenSplit = (d.observations && d.observations.length) ? d.observations.length : 0;
  if (content2 && obsArrLenSplit > 1) {
    var splitRow = document.createElement('div');
    splitRow.id = 'pe-split-row';
    splitRow.style.cssText = 'margin-top:8px;text-align:right;';
    splitRow.innerHTML = '<button id="pe-split-obs" title="Move this observation to its own new pin (at the same location)" '
      + 'style="background:none;border:1px dashed rgba(124,58,107,.55);color:#7C3A6B;border-radius:6px;padding:4px 10px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));cursor:pointer;">'
      + '\u2702 Split to new pin</button>';
    content2.appendChild(splitRow);
  }
}

function _closePinEditor() {
  var overlay = document.getElementById('pin-editor-overlay');
  if (overlay) overlay.style.display = 'none';
  _peDeficId = null;
}

// S116 Push 1 (G): canvas-based pin mini-map. Matches v1's renderPinMiniMap
// behaviour. Loads the drawing's source image (dataUrl → r2Url → L0 tile
// fallback for tile-mode-only PDFs) into a fit-to-width canvas, draws a
// priority-coloured teardrop with the pin number inside.
function _renderPinMiniMap(d, thumbId) {
  var thumb = document.getElementById(thumbId);
  if (!thumb) return;
  if (!d.drawingId) {
    thumb.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-size:13px;">Pin not placed on a drawing</div>';
    return;
  }
  var p = Model.getProject();
  if (!p) return;
  var dwg = (p.drawings || []).find(function(x) { return x.id === d.drawingId; });
  if (!dwg) {
    thumb.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-size:13px;">Drawing not found</div>';
    return;
  }

  // Build image source candidates. Tile-mode-only drawings carry no
  // dataUrl/r2Url for the original — use the L0 (256px) tile as a thumbnail.
  // L0 is one tile per drawing, exactly one HTTP request.
  var candidates = [];
  if (dwg.dataUrl) candidates.push(dwg.dataUrl);
  if (dwg.r2Url) candidates.push(dwg.r2Url);
  // L0 tile fallback (covers tile-only drawings and serves as last-resort)
  var pid = (new URLSearchParams(window.location.search)).get('project');
  if (pid && d.drawingId) {
    candidates.push('https://arencon-r2-worker.hezhendong999.workers.dev/' + encodeURIComponent(pid) + '/tiles/' + encodeURIComponent(d.drawingId) + '/L0/0_0.webp');
  }

  // Try each candidate in order; first one that loads wins.
  thumb.innerHTML = '<canvas style="width:100%;border-radius:8px;background:#f5f5f5;display:block;"></canvas>';
  var canvas = thumb.querySelector('canvas');
  if (!canvas) return;

  function tryLoad(idx) {
    if (idx >= candidates.length) {
      thumb.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-size:13px;">Drawing image unavailable</div>';
      return;
    }
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() { _drawPinMiniMap(canvas, img, d); };
    img.onerror = function() { tryLoad(idx + 1); };
    img.src = candidates[idx];
  }
  tryLoad(0);
}

function _drawPinMiniMap(canvas, img, d) {
  if (!canvas || !img || !img.width || !img.height) return;
  var aspect = img.height / img.width;
  var dpr = Math.min(window.devicePixelRatio || 1, 3);

  // S116 Push 12: fit to BOTH dimensions, picking the size that maximizes
  // canvas area while staying inside both bounds. P11 only invoked the
  // height-fit branch when width-fit OVERFLOWED — but the common case is
  // wide-aspect drawings (~2.5:1) where width-fit's height is SHORTER than
  // the container. P12 always uses min(byWidth, byHeight) so the canvas
  // grows to fill the panel as much as possible. The .pe-location-big
  // flex-center wrapper handles the case where canvas is smaller than the
  // container in either direction. Fallback to width-fit only when height
  // is unknown (mobile thumb panel without flex stretching).
  var parent = canvas.parentElement;
  var containerW = parent ? parent.clientWidth : 360;
  var containerH = parent ? parent.clientHeight : 0;
  if (!containerW || containerW < 20) containerW = 360;

  var displayW, displayH;
  if (containerH && containerH > 20) {
    // Compute size by fitting either dimension fully, pick the larger one
    // that doesn't overflow the other dimension.
    var fitW_w = containerW, fitW_h = containerW * aspect;
    var fitH_h = containerH, fitH_w = containerH / aspect;
    if (fitW_h <= containerH) {
      // Width-fit is fully inside container — use it (drawing fills width).
      displayW = fitW_w; displayH = fitW_h;
    } else {
      // Width-fit overflows height — use height-fit (drawing fills height).
      displayW = fitH_w; displayH = fitH_h;
    }
  } else {
    displayW = containerW;
    displayH = displayW * aspect;
  }
  displayW = Math.round(displayW);
  displayH = Math.round(displayH);

  canvas.width = Math.round(displayW * dpr);
  canvas.height = Math.round(displayH * dpr);
  canvas.style.width = displayW + 'px';
  canvas.style.height = displayH + 'px';
  canvas.style.display = 'block';
  // Margins handled by flex-center on .pe-location-big now (P12).
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, displayW, displayH);
  ctx.drawImage(img, 0, 0, displayW, displayH);

  if (d.pinX != null && d.pinY != null) {
    var px = d.pinX * displayW, py = d.pinY * displayH;
    var fill = d.iar
      ? '#FF69B4'
      : (d.priority === 'general' ? '#1A7A4A' : (d.priority === 'low' ? '#E67E22' : '#C0392B'));
    var r0 = 6;
    ctx.save();
    ctx.translate(px, py - r0 * 2.2);
    ctx.beginPath();
    ctx.arc(0, 0, r0, Math.PI, 0, false);
    ctx.bezierCurveTo(r0, r0 * 0.8, r0 * 0.3, r0 * 2.2, 0, r0 * 2.2);
    ctx.bezierCurveTo(-r0 * 0.3, r0 * 2.2, -r0, r0 * 0.8, -r0, 0);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r0 * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.font = 'bold ' + Math.round(r0 * 1.1) + 'px Calibri,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(d.num != null ? d.num : '?'), 0, 0);
    ctx.restore();
  }
}

// S116 Push 1: expose pin editor opener for Summary tab + other modules
window._frtOpenPinEditor = function(deficId) { _openPinEditor(deficId); };

function _savePinEditor() {
  if (!_peDeficId) return;
  var f = Model.findDeficiency(_peDeficId);
  if (!f) return;
  var d = f.defic;

  // Read fields — contractor assignment
  var cSel = document.getElementById('pe-contractor');
  // S116 Push 5: skip contractor reassignment when value is the synthetic
  // "__new__" sentinel (user picked "+ New Contractor…" but hasn't confirmed
  // the new name yet). Otherwise the defic would be yanked from its current
  // bucket without being re-added anywhere.
  if (cSel != null && cSel.value !== '__new__') {
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

  // S116 Push 1: status. Ignore the synthetic 'na' value used when all obs
  // are priority=general — the dropdown is disabled in that case so the
  // value can't change, but be defensive against stale state.
  var statusSel = document.getElementById('pe-status');
  if (statusSel && statusSel.value && statusSel.value !== 'na') d.status = statusSel.value;

  // Save current observation text
  var textarea = document.getElementById('pe-obs-text');
  if (textarea) {
    if (!d.observations || !d.observations.length) d.observations = [{ text: '', addressed: false }];
    if (d.observations[_peObsIdx]) d.observations[_peObsIdx].text = textarea.value;
  }

  // S116 Push 1 (A): per-observation contractor override. Empty value
  // means "use pin contractor" — store as undefined to keep the JSON clean.
  var obsCtrSel = document.getElementById('pe-obs-ctr');
  if (obsCtrSel && d.observations && d.observations[_peObsIdx]) {
    var v = obsCtrSel.value || '';
    if (v) d.observations[_peObsIdx].contractorId = v;
    else delete d.observations[_peObsIdx].contractorId;
  }

  // Move to different drawing — accept either desktop or mobile select.
  // Mobile and desktop are mutually exclusive via CSS @media; only one is
  // visible at any time but both elements exist in the DOM.
  var moveSel = document.getElementById('pe-move-to');
  var moveSelMobile = document.getElementById('pe-move-to-mobile');
  var newDwgId = '';
  if (moveSel && moveSel.value) newDwgId = moveSel.value;
  if (!newDwgId && moveSelMobile && moveSelMobile.value) newDwgId = moveSelMobile.value;
  if (newDwgId && newDwgId !== d.drawingId) {
    d.drawingId = newDwgId;
    // Keep pinX/pinY — just changes which drawing the pin is on
  }

  Model.saveNow();
  _renderPins();
  if (_tasksVisible) _renderTasks();
  console.log('[Viewer] Pin editor saved for deficiency', _peDeficId);
  _closePinEditor();
}

// S116 Push 1 (F): debounced auto-save. Mirrors the field-reading half of
// _savePinEditor without the close + the noisy console log. Called from
// input/change listeners on every pin editor field — the user no longer
// has to remember to click Save. A 250ms debounce keeps R2 enqueue-on-save
// traffic sane during fast typing.
var _pinAutoSaveTimer = null;
function _pinAutoSave() {
  if (_pinAutoSaveTimer) clearTimeout(_pinAutoSaveTimer);
  _pinAutoSaveTimer = setTimeout(function() {
    _pinAutoSaveTimer = null;
    if (!_peDeficId) return;
    var f = Model.findDeficiency(_peDeficId);
    if (!f) return;
    var d = f.defic;

    // Contractor assignment (same logic as _savePinEditor, minus close).
    // S116 Push 5: skip when value is the "__new__" sentinel — user hasn't
    // confirmed the new name yet; reassigning would orphan the defic.
    var cSel = document.getElementById('pe-contractor');
    if (cSel != null && cSel.value !== '__new__') {
      var proj = Model.getProject();
      var newCtrId = cSel.value || null;
      var oldCtrId = f.contractor ? f.contractor.id : null;
      if (newCtrId !== oldCtrId) {
        if (oldCtrId) {
          var oldCtr = (proj.contractors || []).find(function(c) { return c.id === oldCtrId; });
          if (oldCtr && oldCtr.deficiencies) {
            oldCtr.deficiencies = oldCtr.deficiencies.filter(function(x) { return x.id !== _peDeficId; });
          }
        } else if (proj.generalDeficiencies) {
          proj.generalDeficiencies = proj.generalDeficiencies.filter(function(x) { return x.id !== _peDeficId; });
        }
        if (newCtrId) {
          var newCtr = (proj.contractors || []).find(function(c) { return c.id === newCtrId; });
          if (newCtr) {
            if (!newCtr.deficiencies) newCtr.deficiencies = [];
            newCtr.deficiencies.push(d);
          }
        } else {
          if (!proj.generalDeficiencies) proj.generalDeficiencies = [];
          proj.generalDeficiencies.push(d);
        }
      }
    }

    var dateIn = document.getElementById('pe-date');
    if (dateIn) d.date = dateIn.value;

    var statusSel = document.getElementById('pe-status');
    if (statusSel && statusSel.value && statusSel.value !== 'na') d.status = statusSel.value;

    var textarea = document.getElementById('pe-obs-text');
    if (textarea) {
      if (!d.observations || !d.observations.length) d.observations = [{ text: '', addressed: false }];
      if (d.observations[_peObsIdx]) d.observations[_peObsIdx].text = textarea.value;
    }

    var obsCtrSel = document.getElementById('pe-obs-ctr');
    if (obsCtrSel && d.observations && d.observations[_peObsIdx]) {
      var v = obsCtrSel.value || '';
      if (v) d.observations[_peObsIdx].contractorId = v;
      else delete d.observations[_peObsIdx].contractorId;
    }

    var moveSelDesk = document.getElementById('pe-move-to');
    var moveSelMob = document.getElementById('pe-move-to-mobile');
    var newDwgId = '';
    if (moveSelDesk && moveSelDesk.value) newDwgId = moveSelDesk.value;
    if (!newDwgId && moveSelMob && moveSelMob.value) newDwgId = moveSelMob.value;
    if (newDwgId && newDwgId !== d.drawingId) d.drawingId = newDwgId;

    Model.saveNow();
    _renderPins();
    if (_tasksVisible) _renderTasks();
  }, 250);
}

// S116 Push 1 (E): refresh pin editor obs strip when photos change in the
// model (e.g. user drops a photo on the photo zone — the data-action handler
// in deficiencies.js adds the photo, fires Model._notify('photo'), and then
// we re-render the strip here so the new thumb appears immediately).
Model.onChange('photo', function() {
  if (!_peDeficId) return;
  var f = Model.findDeficiency(_peDeficId);
  if (!f) return;
  // Re-render the active obs only — that's where the photo strip lives.
  _peRenderObsContent(f.defic, _peObsIdx);
});

// S116 Push 1 (F): wire input/change listeners to drive _pinAutoSave().
// Scoped to known pin-editor fields by id; never fires for unrelated inputs.
document.addEventListener('input', function(e) {
  var t = e.target;
  if (!t || !_peDeficId) return;
  if (t.id === 'pe-obs-text' || t.id === 'pe-date') _pinAutoSave();
});

// S116 Push 5: Enter-to-confirm on the contractor name input. Lets users
// add/rename a contractor without reaching for the ✓ button.
document.addEventListener('keydown', function(e) {
  if (!_peDeficId) return;
  if (e.target && e.target.id === 'pe-ctr-input' && e.key === 'Enter') {
    e.preventDefault();
    var btn = document.getElementById('pe-ctr-confirm');
    if (btn) btn.click();
  } else if (e.target && e.target.id === 'pe-ctr-input' && e.key === 'Escape') {
    e.preventDefault();
    var btnCx = document.getElementById('pe-ctr-cancel');
    if (btnCx) btnCx.click();
  }
});
document.addEventListener('change', function(e) {
  var t = e.target;
  if (!t || !_peDeficId) return;

  // S116 Push 5: "+ New Contractor…" picked from the dropdown.
  // Don't auto-save on this synthetic value — it's not a real contractor id;
  // the auto-save logic would yank the defic out of its current bucket and
  // try to push it under a non-existent contractor. Instead enter 'new' mode
  // which exposes the inline input + ✓/✕ buttons; on confirm we add the
  // contractor and re-render. On cancel we revert the dropdown.
  if (t.id === 'pe-contractor' && t.value === '__new__') {
    _ctrCrudPrevSel = ''; // restore to whatever was previously saved
    var fNc = Model.findDeficiency(_peDeficId);
    if (fNc && fNc.contractor) _ctrCrudPrevSel = fNc.contractor.id;
    _ctrCrudMode = 'new';
    _peRenderCtrCrudRow('__new__');
    return;
  }

  if (t.id === 'pe-contractor' || t.id === 'pe-date' || t.id === 'pe-status'
      || t.id === 'pe-obs-ctr' || t.id === 'pe-move-to' || t.id === 'pe-move-to-mobile') {
    _pinAutoSave();
    // S116 Push 5: real contractor change — refresh the CRUD row so the
    // edit/delete buttons reflect the new selection (visible only for real
    // contractors, hidden for Site General).
    if (t.id === 'pe-contractor') {
      _ctrCrudMode = 'idle';
      _peRenderCtrCrudRow(t.value || '');
    }
    // Per-obs contractor change: re-render content so the ✕ Reset button
    // appears/disappears in sync with the override state.
    if (t.id === 'pe-obs-ctr') {
      var f0 = Model.findDeficiency(_peDeficId);
      if (f0) {
        // Save text first (debounced auto-save will also pick it up but
        // re-render below would otherwise overwrite the live textarea).
        var ta0 = document.getElementById('pe-obs-text');
        if (ta0 && f0.defic.observations && f0.defic.observations[_peObsIdx]) {
          f0.defic.observations[_peObsIdx].text = ta0.value;
        }
        _peRenderObsContent(f0.defic, _peObsIdx);
      }
    }
  }
});

// Pin editor event handlers
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('#pe-close')) { _closePinEditor(); return; }
  if (e.target.closest && e.target.closest('#pe-cancel')) { _closePinEditor(); return; }
  if (e.target.closest && e.target.closest('#pe-save')) { _savePinEditor(); return; }

  // S116 Push 5: contractor CRUD inside pin editor (Edit / Delete / new+confirm).
  // Edit → swap to inline input pre-filled with current name.
  if (e.target.closest && e.target.closest('#pe-ctr-edit')) {
    if (!_peDeficId) return;
    var fE = Model.findDeficiency(_peDeficId);
    if (!fE || !fE.contractor) return;
    _ctrCrudMode = 'edit';
    _peRenderCtrCrudRow(fE.contractor.id);
    return;
  }
  // Delete → confirm + reassign deficiencies to Site General + remove.
  if (e.target.closest && e.target.closest('#pe-ctr-del')) {
    if (!_peDeficId) return;
    var fD = Model.findDeficiency(_peDeficId);
    if (!fD || !fD.contractor) return;
    var ctrIdDel = fD.contractor.id;
    var ctrNameDel = fD.contractor.name || 'this contractor';
    var deficCount = (fD.contractor.deficiencies || []).length;
    var msg = deficCount > 1
      ? 'Delete "' + ctrNameDel + '"? Its ' + deficCount + ' deficiencies will be moved to Site General.'
      : (deficCount === 1
        ? 'Delete "' + ctrNameDel + '"? Its 1 deficiency will be moved to Site General.'
        : 'Delete "' + ctrNameDel + '"?');
    showConfirm('Delete contractor', msg).then(function(yes) {
      if (!yes) return;
      var moved = Model.deleteContractorAndReassign(ctrIdDel);
      Model.saveNow();
      // After delete this defic now lives in generalDeficiencies. Re-open
      // the editor to refresh dropdown + state, then nudge defic tab + tasks.
      var stillId = _peDeficId;
      _closePinEditor();
      setTimeout(function() {
        _openPinEditor(stillId);
        if (window._frtRenderTasks) window._frtRenderTasks();
      }, 50);
      toast(moved > 0 ? '\u2713 Deleted, moved ' + moved + ' deficiencies to Site General' : '\u2713 Contractor deleted');
    });
    return;
  }
  // Confirm new contractor or rename existing
  if (e.target.closest && e.target.closest('#pe-ctr-confirm')) {
    if (!_peDeficId) return;
    var inp = document.getElementById('pe-ctr-input');
    if (!inp) return;
    var nameVal = (inp.value || '').trim();
    if (!nameVal) { toast('\u26A0 Name cannot be empty'); inp.focus(); return; }
    var p5 = Model.getProject();
    if (_ctrCrudMode === 'new') {
      // Duplicate-name guard (case-insensitive). Match → auto-select instead
      // of creating a duplicate, which would confuse downstream PDF grouping.
      var nameLower = nameVal.toLowerCase();
      var existing = (p5 && p5.contractors ? p5.contractors : []).find(function(c){ return (c.name || '').trim().toLowerCase() === nameLower; });
      var newCtrId;
      if (existing) {
        newCtrId = existing.id;
        toast('Already exists \u2014 selected "' + existing.name + '"');
      } else {
        var newCtr = Model.addContractor(nameVal);
        if (!newCtr) { toast('\u26A0 Could not add contractor'); return; }
        newCtrId = newCtr.id;
      }
      // Reassign this defic to the new (or matched) contractor.
      var fSel = Model.findDeficiency(_peDeficId);
      if (fSel) {
        var oldCtr = fSel.contractor;
        if (oldCtr && oldCtr.deficiencies) {
          oldCtr.deficiencies = oldCtr.deficiencies.filter(function(x){ return x.id !== _peDeficId; });
        } else if (!oldCtr && p5.generalDeficiencies) {
          p5.generalDeficiencies = p5.generalDeficiencies.filter(function(x){ return x.id !== _peDeficId; });
        }
        var targetCtr = (p5.contractors || []).find(function(c){ return c.id === newCtrId; });
        if (targetCtr) {
          if (!targetCtr.deficiencies) targetCtr.deficiencies = [];
          targetCtr.deficiencies.push(fSel.defic);
        }
      }
      Model.saveNow();
      _ctrCrudMode = 'idle';
      var stillIdNew = _peDeficId;
      _closePinEditor();
      setTimeout(function() { _openPinEditor(stillIdNew); }, 30);
      if (!existing) toast('\u2713 Added "' + nameVal + '"');
    } else if (_ctrCrudMode === 'edit') {
      var fEd = Model.findDeficiency(_peDeficId);
      if (!fEd || !fEd.contractor) return;
      var ok = Model.renameContractor(fEd.contractor.id, nameVal);
      if (!ok) { toast('\u26A0 Could not rename'); return; }
      Model.saveNow();
      _ctrCrudMode = 'idle';
      var stillIdRn = _peDeficId;
      _closePinEditor();
      setTimeout(function() { _openPinEditor(stillIdRn); }, 30);
      toast('\u2713 Renamed to "' + nameVal + '"');
    }
    return;
  }
  // Cancel new/rename — revert dropdown to previous selection
  if (e.target.closest && e.target.closest('#pe-ctr-cancel')) {
    if (!_peDeficId) return;
    var fCx = Model.findDeficiency(_peDeficId);
    var prevCurId = fCx && fCx.contractor ? fCx.contractor.id : '';
    var cSelCx = document.getElementById('pe-contractor');
    if (cSelCx) cSelCx.value = prevCurId;
    _ctrCrudMode = 'idle';
    _peRenderCtrCrudRow(prevCurId);
    return;
  }

  // S116 Push 2/3: "Go to drawing" — navigate-only (uses _frtNavigateToPin
  // which handles tab switch, drawing load, and pulse highlight). Critically
  // does NOT enter place-pin mode — tapping the drawing afterwards opens the
  // editor for whichever pin was tapped, doesn't move it.
  if (e.target.closest && e.target.closest('#pe-goto-dwg')) {
    if (!_peDeficId) return;
    var fGo = Model.findDeficiency(_peDeficId);
    if (!fGo || !fGo.defic.drawingId) {
      toast('This pin is not placed on a drawing yet');
      return;
    }
    var goId = _peDeficId;
    _closePinEditor();
    if (window._frtNavigateToPin) window._frtNavigateToPin(goId);
    return;
  }

  // S116 Push 9: "Remove pin only" — preserves the old "Delete Pin" semantics
  // of unpinning without deleting the deficiency. Companion to the now-
  // destructive Delete button so users have both: unpin (defic stays) and
  // full delete (defic gone).
  if (e.target.closest && e.target.closest('#pe-unpin')) {
    var unpinId = _peDeficId;
    showConfirm('Remove Pin from Drawing', 'Remove this pin from the drawing? The deficiency stays in the project.').then(function(yes) {
      if (!yes) return;
      var fU = Model.findDeficiency(unpinId);
      if (fU) {
        fU.defic.drawingId = null;
        fU.defic.pinX = null;
        fU.defic.pinY = null;
        Model.saveNow();
        _renderPins();
        if (_tasksVisible) _renderTasks();
        if (window._frtRenderDefic) window._frtRenderDefic();
      }
      _closePinEditor();
    });
    return;
  }

  if (e.target.closest && e.target.closest('#pe-delete')) {
    var delId = _peDeficId;
    console.log('[Viewer] Delete pin clicked — deficId:', delId);
    // S116 Push 9: button labeled "Delete Pin" in the editor footer was
    // only nulling drawingId/pinX/pinY (unpinning, not deleting). Mark
    // hit this from the Summary tab — clicked Delete Pin expecting the
    // entry to be removed and instead the deficiency stayed in the
    // project, just unpinned. The "Remove" button on the defic card
    // already does full delete; keep that semantics consistent. Confirm
    // copy is now explicit about what happens.
    showConfirm('Delete Deficiency', 'Permanently delete this deficiency and its pin? This cannot be undone.').then(function(yes) {
      if (!yes) return;
      var f2 = Model.findDeficiency(delId);
      console.log('[Viewer] Delete defic — found:', !!f2);
      if (f2) {
        Model.removeDeficiency(delId);
        if (Model.renumberDeficiencies) Model.renumberDeficiencies();
        Model.saveNow();
        _renderPins();
        if (_tasksVisible) _renderTasks();
        // Notify defic tab to re-render
        if (window._frtRenderDefic) window._frtRenderDefic();
        if (window._frtRenderTasks) window._frtRenderTasks();
        console.log('[Viewer] Deficiency deleted', delId);
      }
      _closePinEditor();
    });
    return;
  }

  // IAR toggle
  if (e.target.closest && e.target.closest('#pe-iar')) {
    var iarEl = e.target.closest('#pe-iar');
    if (iarEl.disabled) return; // S116: disabled when all obs are general
    var f3 = Model.findDeficiency(_peDeficId);
    if (f3) {
      f3.defic.iar = !f3.defic.iar;
      iarEl.classList.toggle('active', !!f3.defic.iar);
      // Mini-map marker colour depends on IAR (pink) → re-render both.
      _renderPinMiniMap(f3.defic, 'pe-location-thumb');
      _renderPinMiniMap(f3.defic, 'pe-location-thumb-mobile');
      Model.saveNow();
      _renderPins();
      if (_tasksVisible) _renderTasks();
    }
    return;
  }

  // Priority buttons
  var priBtn = e.target.closest && e.target.closest('[data-pe-pri]');
  if (priBtn) {
    var pri = priBtn.getAttribute('data-pe-pri');
    var f4 = Model.findDeficiency(_peDeficId);
    if (f4) f4.defic.priority = pri;
    document.querySelectorAll('.pe-pri-btn').forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-pe-pri') === pri); });
    if (f4) {
      // S116 Push 1: priority change must refresh:
      //   - title label (High/Low/General)
      //   - status select state (H — "Not a deficiency" only when general)
      //   - mini-map marker colour
      //   - pin marker on the actual drawing
      var prL = pri === 'general' ? 'General' : pri === 'low' ? 'Low Priority' : 'High Priority';
      var titleEl = document.getElementById('pe-title');
      if (titleEl) titleEl.textContent = 'Pin #' + f4.defic.num + ' \u2014 ' + prL;
      var allGen = pri === 'general';
      var sSel = document.getElementById('pe-status');
      if (sSel) {
        if (allGen) {
          sSel.innerHTML = '<option value="na" selected>\u2014 Not a deficiency \u2014</option>';
          sSel.disabled = true;
          sSel.style.opacity = '0.5';
          sSel.style.cursor = 'not-allowed';
        } else {
          sSel.innerHTML = '<option value="open">\u25CF Outstanding</option><option value="closed">\u2714 Addressed & Closed</option>';
          sSel.value = (f4.defic.status === 'closed' || f4.defic.status === 'Addressed & Closed') ? 'closed' : 'open';
          sSel.disabled = false;
          sSel.style.opacity = '';
          sSel.style.cursor = '';
        }
      }
      var iarBtnRf = document.getElementById('pe-iar');
      if (iarBtnRf) {
        iarBtnRf.disabled = allGen;
        iarBtnRf.style.opacity = allGen ? '0.4' : '';
        iarBtnRf.style.cursor = allGen ? 'not-allowed' : '';
      }
      _renderPinMiniMap(f4.defic, 'pe-location-thumb');
      _renderPinMiniMap(f4.defic, 'pe-location-thumb-mobile');
      Model.saveNow();
      _renderPins();
      if (_tasksVisible) _renderTasks();
    }
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

  // S116 Push 2: split observation → new pin. Confirms first (destructive
  // edit on the source). Server-side: Model.splitObservationToPin handles
  // the heavy lifting (carries drawingId/pinX/pinY/priority/contractor).
  // After split, close current editor and re-open on the NEW pin so the
  // user lands directly on what they just created.
  if (e.target.closest && e.target.closest('#pe-split-obs')) {
    if (!_peDeficId) return;
    var fSp = Model.findDeficiency(_peDeficId);
    if (!fSp) return;
    var srcD = fSp.defic;
    var srcObs = srcD.observations || [];
    if (srcObs.length <= 1) { toast('Need at least 2 observations to split'); return; }
    if (_peObsIdx < 0 || _peObsIdx >= srcObs.length) return;
    var obsLetter = String.fromCharCode(65 + _peObsIdx);
    showConfirm(
      'Split observation ' + obsLetter,
      'Move observation ' + obsLetter + ' off pin #' + srcD.num + ' into its own new pin? It will be placed at the same location — drag it afterwards to separate them.'
    ).then(function(yes) {
      if (!yes) return;
      var newDef = Model.splitObservationToPin(_peDeficId, _peObsIdx);
      if (!newDef) { toast('Could not split observation'); return; }
      Model.saveNow();
      _renderPins();
      // Notify defic tab + tasks panel.
      if (window._frtRenderTasks) window._frtRenderTasks();
      _closePinEditor();
      // Reopen on the new pin so the user lands on what they just made.
      setTimeout(function() { _openPinEditor(newDef.id); }, 50);
      toast('\u2702 Split into pin #' + newDef.num);
    });
    return;
  }

  // S116 Push 1 (A): per-obs contractor ✕ Reset button. Clears the override
  // and re-renders so the Reset button itself disappears.
  if (e.target.closest && e.target.closest('#pe-obs-ctr-reset')) {
    var fR = Model.findDeficiency(_peDeficId);
    if (!fR || !fR.defic.observations || !fR.defic.observations[_peObsIdx]) return;
    delete fR.defic.observations[_peObsIdx].contractorId;
    Model.saveNow();
    _peRenderObsContent(fR.defic, _peObsIdx);
    return;
  }

  // S116 Push 1 (E): photo ✕ remove button. Must run BEFORE the photo-thumb
  // click handler below, since the button lives inside .pe-photo-thumb and
  // would otherwise bubble up and open the lightbox.
  var peRm = e.target.closest && e.target.closest('[data-pe-photo-remove]');
  if (peRm) {
    if (!_peDeficId) return;
    var fRm = Model.findDeficiency(_peDeficId);
    if (!fRm) return;
    var rmIdx = parseInt(peRm.getAttribute('data-pe-photo-remove'), 10);
    if (isNaN(rmIdx)) return;
    showConfirm('Remove Photo', 'Remove this photo from the observation?').then(function(yes) {
      if (!yes) return;
      Model.removeObservationPhoto(_peDeficId, _peObsIdx, rmIdx);
      Model.saveNow();
      var f2 = Model.findDeficiency(_peDeficId);
      if (f2) _peRenderObsContent(f2.defic, _peObsIdx);
    });
    return;
  }

  // S115: pin editor photo thumb click → open lightbox.
  // Pass the LIVE obs.photos array (real records) so markup save/revert
  // propagation works correctly.
  var peThumb = e.target.closest && e.target.closest('[data-pe-photo]');
  if (peThumb) {
    if (!_peDeficId) return;
    var fT = Model.findDeficiency(_peDeficId);
    if (!fT || !fT.defic.observations) return;
    var oT = fT.defic.observations[_peObsIdx];
    if (!oT || !oT.photos || !oT.photos.length) return;
    var photoIdx = parseInt(peThumb.getAttribute('data-pe-photo'), 10) || 0;
    if (window._frtLightbox && window._frtLightbox.open) {
      window._frtLightbox.open(oT.photos, photoIdx, { contextLabel: 'Pin #' + (fT.defic.num || '?') });
    }
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
  if (wrap && img && _getDrawingNaturalW(img)){
    var wRect = wrap.getBoundingClientRect();
    var cx = (touch.clientX - wRect.left) / _scale;
    var cy = (touch.clientY - wRect.top) / _scale;
    var f0 = Model.findDeficiency(deficId);
    if (f0 && f0.defic.pinX != null){
      var curX = f0.defic.pinX * _getDrawingNaturalW(img);
      var curY = f0.defic.pinY * _getDrawingNaturalH(img);
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
  if (!wrap || !img || !_getDrawingNaturalW(img)) return;
  var wRect = wrap.getBoundingClientRect();
  var px = (touch.clientX - wRect.left) / _scale + _pinTouchOffsetX;
  var py = (touch.clientY - wRect.top) / _scale + _pinTouchOffsetY;
  if (_useGLPins){
    var f = Model.findDeficiency(_pinDragDeficId);
    if (f){
      f.defic.pinX = Math.max(0, Math.min(1, px / _getDrawingNaturalW(img)));
      f.defic.pinY = Math.max(0, Math.min(1, py / _getDrawingNaturalH(img)));
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
    if (img && wrap && _getDrawingNaturalW(img)) {
      var wRect = wrap.getBoundingClientRect();
      var finalLeft = (touch.clientX - wRect.left) / _scale + _pinTouchOffsetX;
      var finalTop = (touch.clientY - wRect.top) / _scale + _pinTouchOffsetY;
      var pinX = Math.max(0, Math.min(1, finalLeft / _getDrawingNaturalW(img)));
      var pinY = Math.max(0, Math.min(1, finalTop / _getDrawingNaturalH(img)));
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
  if (wrap && img && _getDrawingNaturalW(img)) {
    var wRect = wrap.getBoundingClientRect();
    var cursorInWrap_X = (e.clientX - wRect.left) / _scale;
    var cursorInWrap_Y = (e.clientY - wRect.top) / _scale;
    var f0 = Model.findDeficiency(deficId);
    if (f0 && f0.defic.pinX != null){
      var curX = f0.defic.pinX * _getDrawingNaturalW(img);
      var curY = f0.defic.pinY * _getDrawingNaturalH(img);
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
  if (!wrap || !img || !_getDrawingNaturalW(img)) return;
  var wRect = wrap.getBoundingClientRect();
  var px = (e.clientX - wRect.left) / _scale + _pinMouseOffsetX;
  var py = (e.clientY - wRect.top) / _scale + _pinMouseOffsetY;
  if (_useGLPins){
    var f = Model.findDeficiency(_pinMouseDragDeficId);
    if (f){
      f.defic.pinX = Math.max(0, Math.min(1, px / _getDrawingNaturalW(img)));
      f.defic.pinY = Math.max(0, Math.min(1, py / _getDrawingNaturalH(img)));
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
  if (img && wrap && _getDrawingNaturalW(img)) {
    var wRect = wrap.getBoundingClientRect();
    var finalLeft = (e.clientX - wRect.left) / _scale + _pinMouseOffsetX;
    var finalTop = (e.clientY - wRect.top) / _scale + _pinMouseOffsetY;
    var pinX = Math.max(0, Math.min(1, finalLeft / _getDrawingNaturalW(img)));
    var pinY = Math.max(0, Math.min(1, finalTop / _getDrawingNaturalH(img)));
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
  // S116 Push 1: load the drawing the deficiency's pin lives on.
  // Previously hardcoded _showDrawing(0) which always opened drawing index 0
  // (page 1) regardless of where the pin actually was.
  var f = Model.findDeficiency(deficId);
  var targetDwgId = f && f.defic ? f.defic.drawingId : null;
  var drawings = _getDrawingsList();
  var targetIdx = -1;
  if (targetDwgId && drawings.length) {
    for (var di = 0; di < drawings.length; di++) {
      if (drawings[di].id === targetDwgId) { targetIdx = di; break; }
    }
  }
  // Fall back to drawing 0 only if pin has no drawingId (place-pin flow)
  if (targetIdx < 0 && drawings.length) targetIdx = 0;

  var overlay = document.getElementById('drawing-viewer-overlay');
  if (!overlay || !overlay.classList.contains('open')) {
    if (targetIdx >= 0) {
      _showDrawing(targetIdx);
      setTimeout(function() { _startPinPlace(deficId); }, 500);
    }
  } else if (_currentDrawingIdx !== targetIdx && targetIdx >= 0) {
    // Viewer already open but on the wrong drawing — switch first
    _showDrawing(targetIdx);
    setTimeout(function() { _startPinPlace(deficId); }, 500);
  } else {
    _startPinPlace(deficId);
  }
};

// S116 Push 3: navigate to a pin without entering place-pin mode.
// Used by both the pin-editor "Go to drawing" button (viewer.js) and the
// deficiency 📌 drawing-name pill (deficiencies.js view-pin action).
//
// Behaviour: switch nav tab + drawing viewer to the pin's drawing, pulse the
// target pin so it's identifiable. Tapping the drawing afterwards opens the
// editor for whichever pin was tapped — does NOT move the pin (which was
// the bug source for the duplicate-pin issue Mark hit in S116 P1).
//
// Returns true if navigation kicked off, false if the pin has no drawingId
// (caller can decide whether to toast "not placed yet" etc).
window._frtNavigateToPin = function(deficId) {
  var f = Model.findDeficiency(deficId);
  if (!f || !f.defic.drawingId) return false;
  var targetDwgId = f.defic.drawingId;

  // Make sure the drawings nav-tab is active.
  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === 'drawings'); });
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.toggle('active', p.id === 'panel-drawings'); });

  var drawings = _getDrawingsList();
  var targetIdx = -1;
  for (var di = 0; di < drawings.length; di++) {
    if (drawings[di].id === targetDwgId) { targetIdx = di; break; }
  }
  if (targetIdx < 0) return false;

  var overlay = document.getElementById('drawing-viewer-overlay');
  var alreadyOpen = overlay && overlay.classList.contains('open');
  if (!alreadyOpen || _currentDrawingIdx !== targetIdx) {
    _showDrawing(targetIdx);
    // Highlight after layout + pin render settles.
    setTimeout(function() { _highlightPin(deficId); }, 600);
  } else {
    _highlightPin(deficId);
  }
  return true;
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
  // S116 Push 13: recompute fit-scale + re-render pins after toggle.
  // The panel takes 300px from the canvas-area flex container via
  // flex-shrink:0, so the visible canvas width changes — but window.resize
  // doesn't fire (the window itself didn't change). Without this, pins
  // stayed positioned for the OLD canvas width while the image rescaled
  // via object-fit, causing visible left-shift of all pins on the
  // drawing the moment the tasks panel opens. The setTimeout gives the
  // CSS transition time to complete before measuring.
  setTimeout(function() {
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
  }, 50);
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


// S115 P10: Re-render the pin editor's photo strip when photos change
// (markup save/revert mutates r2Key/r2Url/thumb on the underlying records).
// Without this hook, the pin editor stays stale until closed + reopened.
Model.onChange('photo', function(){
  if (!_peDeficId) return; // editor not open
  var f = Model.findDeficiency(_peDeficId);
  if (!f) return;
  _peRenderObsContent(f.defic, _peObsIdx);
});
