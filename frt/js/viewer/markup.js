/**
 * ARENCON FRT v2 — Markup Engine
 * ═══════════════════════════════
 * 
 * Canvas 2D markup tools with full v1 object format compatibility.
 * 
 * Tools: pen, highlight, eraser, rect, fillrect, circle, fillcircle,
 *        arrow, line, triangle, filltriangle, cloud, polyline, text, select
 * 
 * Key constraints:
 *   - Pen/highlight: lineTo ONLY (never quadraticCurveTo)
 *   - Highlighter: offscreen composite at 0.3×opacity (never stack)
 *   - Overlay canvas capped at 3M pixels (Samsung GPU)
 *   - Main canvas capped: 10M Android, 16M iOS/iPad, 25M desktop
 *   - NEVER auto-select after drawing — tool stays active
 *   - NEVER use OffscreenCanvas (no Safari/iOS)
 *   - Eraser uses destination-out composite
 */

import { Model } from '../data/model.js';
import { IDB } from '../data/idb.js';
import { showConfirm } from '../shared/dialogs.js';
import { TiledPdf } from './tiledPdf.js';

// S82 diagnostic removed — bug was CSS pointer-events:none on mobile sidebar
// parent leaking to open submenus. Fixed in frt.css ~line 2242.

// ── State ───────────────────────────────────────────────
var _drawingId = null;
var _objects = [];
var _undoStack = [];
var _redoStack = [];
var _maxUndo = 40;
var _selectedIds = [];
var _penPoints = [];
var _polyPoints = [];
var _isDrawing = false;
var _dirty = false;

var _tool = null;
var _color = '#C0392B';
var _lineWidth = 3;
var _fontSize = 20;
var _opacity = 1;

var _eventsWired = false;
var _hlCanvas = null;
var _objCanvas = null;  // reusable per-object offscreen buffer for mask application

// ── WebGL state (Phase 5) ───────────────────────────────
var _webglCanvas = null;
var _webglReady = false;
var _webglInitPromise = null;
var _useWebGL = (function(){
  try {
    if (typeof window === 'undefined') return false;
    if (window.location && window.location.search){
      if (window.location.search.indexOf('webgl=0') >= 0) return false;
      if (window.location.search.indexOf('webgl=1') >= 0) return true;
    }
    if (localStorage.getItem('ARENCON_NoWebGL') === '1') return false;
    return !!(window.WebGLMarkupRenderer && window.WebGLMarkupRenderer.isSupported && window.WebGLMarkupRenderer.isSupported());
  } catch(_){ return false; }
})();

// ── Helpers ─────────────────────────────────────────────
function _newId() {
  return 'mk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
}

function _findObj(id) {
  for (var i = 0; i < _objects.length; i++) {
    if (_objects[i].id === id) return _objects[i];
  }
  return null;
}

function _getCanvas() { return document.getElementById('markup-canvas'); }
function _getOverlay() { return document.getElementById('markup-overlay'); }

// ── Canvas Allocation ───────────────────────────────────

function _allocateCanvas() {
  var mc = _getCanvas();
  if (!mc) return;

  var drawW = 0, drawH = 0;
  if (TiledPdf.isActive()) {
    var dims = TiledPdf.getDimensions();
    if (dims) { drawW = dims.drawW; drawH = dims.drawH; }
  }
  if (!drawW || !drawH) {
    var img = document.getElementById('dv-image');
    if (!img || !img.naturalWidth) return;
    drawW = img.naturalWidth;
    drawH = img.naturalHeight;
  }

  var ua = navigator.userAgent;
  // S113 Push 2 — final cleanup. Markup canvas budget by device class:
  //   • Android phone (handheld form factor): 10 Mpx
  //   • Everything else (Android tablet, desktop): 25 Mpx for crisp pen
  //     strokes at every zoom level
  // Phone detection: UA contains both "Android" and "Mobile" tokens, AND
  // does NOT carry any of the common Samsung tablet model prefixes.
  // (Android tablets typically omit the "Mobile" token; the SM-T / SM-X /
  // "Tablet" allowlist guards against UA outliers that include "Mobile".)
  // The `isIPhone` / `isIPad` / `isTablet` branches and the `?iosres=N`
  // parser were removed in Push 1 along with the rest of iOS support.
  var isAndroidPhone = /Android/.test(ua) && /Mobile/.test(ua) && !/SM-T|SM-X|Tablet/.test(ua);
  var maxPixels = isAndroidPhone ? 10000000 : 25000000;

  var totalPixels = drawW * drawH;
  var mkScale = 1;
  if (totalPixels > maxPixels) mkScale = Math.sqrt(maxPixels / totalPixels);

  var cw = Math.round(drawW * mkScale);
  var ch = Math.round(drawH * mkScale);

  mc.width = cw;
  mc.height = ch;
  mc.style.width = drawW + 'px';
  mc.style.height = drawH + 'px';
  // S112: markup-canvas has no z-index in frt.css → defaults to auto (z:0).
  // The 2D-path renders strokes here whenever any eraser mask exists on a
  // non-pen object. Without explicit z, the level canvases (z:0..4) bury it,
  // so the entire object set vanishes the moment a single eraser stroke
  // hits a shape/text/highlight/polyline. Set z:5 to match the lifted
  // markup-webgl-canvas and markup-overlay, so the 2D path is visible too.
  mc.style.zIndex = '5';
  mc._dpr = mkScale;
  mc._logicalW = drawW;
  mc._logicalH = drawH;

  var ctx = mc.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ── WebGL sibling canvas (Phase 5) ─────────────────────
  // Stacks UNDERNEATH mc so selection/rubberband in 2D remains on top.
  // S113: pre-existing `!isIPhone` guard removed alongside iOS support.
  // Pixi WebGL is now available on every platform that passes the
  // `_useWebGL` feature check (with `?webgl=0` / `localStorage.ARENCON_NoWebGL`
  // as the explicit opt-out for any field staff who need to disable it).
  if (_useWebGL){
    try {
      if (!_webglCanvas){
        _webglCanvas = document.createElement('canvas');
        _webglCanvas.id = 'markup-webgl-canvas';
        _webglCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;';
        mc.parentNode.insertBefore(_webglCanvas, mc); // before mc = underneath in stacking order
      }
      _webglCanvas.width  = cw;
      _webglCanvas.height = ch;
      _webglCanvas.style.width  = drawW + 'px';
      _webglCanvas.style.height = drawH + 'px';
      if (!_webglReady && !_webglInitPromise){
        _webglInitPromise = window.WebGLMarkupRenderer.init(_webglCanvas, { w: cw, h: ch, dpr: mkScale })
          .then(function(){
            _webglReady = true;
            _webglInitPromise = null;
            console.log('[Markup] WebGL renderer ready (Pixi.js v' + ((window.PIXI && window.PIXI.VERSION) || '?') + ')');
            _renderAll(); // refresh once Pixi is live
          })
          .catch(function(err){
            console.warn('[Markup] WebGL init failed, falling back to Canvas 2D:', err);
            _useWebGL = false;
            _webglInitPromise = null;
            if (_webglCanvas && _webglCanvas.parentNode){
              _webglCanvas.parentNode.removeChild(_webglCanvas);
            }
            _webglCanvas = null;
          });
      } else if (_webglReady){
        try { window.WebGLMarkupRenderer.resize(cw, ch); } catch(_){}
      }
    } catch(err){
      console.warn('[Markup] WebGL setup threw — disabling:', err);
      _useWebGL = false;
    }
  }

  console.log('[Markup] Canvas: logical ' + drawW + '×' + drawH +
    ', buffer ' + cw + '×' + ch + ' (dpr=' + mkScale.toFixed(3) +
    ', ' + Math.round(cw * ch / 1000000) + 'M px)' +
    (_useWebGL ? ' [WebGL' + (_webglReady ? ' ready' : ' initializing') + ']' : ' [2D]'));
}

// ── S113 Push 13 — viewer-zoom-aware canvas resolution ────────────────────
// The wrap parent applies `transform: scale(viewer_scale)` to display the
// canvas at the user's current zoom. With canvas internal pixels = drawing
// pixels (e.g. 6144×4096), fit-zoom (viewer_scale ≈ 0.222) means the
// browser downsamples ~4.5× via bilinear, washing out thin lines and
// producing the "broken pen lines" + "invisible selection box" that Mark
// reported.
//
// Fix: resize canvas internal dimensions to match displayed pixels on
// every zoom change, capped at the device memory budget. Coordinates and
// stored object data are unchanged — only the rendering substrate
// resolution adapts.
//
//   • At fit (s=0.222): canvas internal ≈ 1366×909  (1.2 Mpx, low memory)
//   • At native (s=1):   canvas internal = drawing pixels (≈25 Mpx, budget cap)
//   • At zoom-in (s>1):  canvas internal stays capped at drawing pixels
//                        (browser still upscales for >1× zoom — same as today)
//
// `mc.style.width` and `_logicalW` stay at drawing dims so the wrap
// transform math, _getPos coordinate translation, and pin position math
// are all unaffected.
//
// Called from viewer.js _applyTransform on every scale change. Pan-only
// changes are filtered by the no-op early-return.
var _lastRenderScale = -1;  // sentinel: forces first call to apply
function _resizeMarkupForScale(targetScale) {
  var mc = _getCanvas();
  if (!mc || !mc._logicalW) return;       // not yet allocated
  if (!(targetScale > 0)) return;          // degenerate

  var drawW = mc._logicalW;
  var drawH = mc._logicalH || mc._logicalW;

  // Budget cap (same as _allocateCanvas)
  var ua = navigator.userAgent;
  var isAndroidPhone = /Android/.test(ua) && /Mobile/.test(ua) && !/SM-T|SM-X|Tablet/.test(ua);
  var maxPixels = isAndroidPhone ? 10000000 : 25000000;
  var budgetScale = Math.sqrt(maxPixels / (drawW * drawH));
  if (budgetScale > 1) budgetScale = 1;

  // Effective render scale: capped at budget (above) and at a sensible
  // floor (below) so very low zooms don't produce a sub-100px canvas.
  var effective = targetScale;
  if (effective > budgetScale) effective = budgetScale;
  if (effective < 0.08) effective = 0.08;

  // No-op: same scale within 1% (filters pan-only events + wheel-zoom jitter)
  if (Math.abs(effective - _lastRenderScale) / effective < 0.01) return;

  var newW = Math.max(1, Math.round(drawW * effective));
  var newH = Math.max(1, Math.round(drawH * effective));

  // Resize main canvas (wipes content; caller must re-render)
  mc.width = newW;
  mc.height = newH;
  mc._dpr = effective;
  // mc.style.width/height/_logicalW/_logicalH UNCHANGED — preserve coord space

  var ctx = mc.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Resize WebGL sibling canvas (Pixi)
  if (_webglCanvas) {
    _webglCanvas.width = newW;
    _webglCanvas.height = newH;
    if (_webglReady && window.WebGLMarkupRenderer && window.WebGLMarkupRenderer.resize) {
      try { window.WebGLMarkupRenderer.resize(newW, newH); } catch(_e) {}
    }
  }

  _lastRenderScale = effective;
}

function _ensureOverlay() {
  var mc = _getCanvas();
  if (!mc) return null;
  var ov = _getOverlay();
  if (!ov) {
    ov = document.createElement('canvas');
    ov.id = 'markup-overlay';
    ov.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;display:none;z-index:5;';
    mc.parentNode.insertBefore(ov, mc.nextSibling);
  }
  var lw = mc._logicalW || mc.width;
  var lh = mc._logicalH || mc.height;
  ov.style.width = lw + 'px';
  ov.style.height = lh + 'px';
  var ovMax = 3000000;
  var ovPx = lw * lh;
  var ovScale = ovPx > ovMax ? Math.sqrt(ovMax / ovPx) : 1;
  ov.width = Math.round(lw * ovScale);
  ov.height = Math.round(lh * ovScale);
  ov._dpr = ovScale;
  ov._logicalW = lw;
  ov._logicalH = lh;
  return ov;
}

// ── Coordinate Transform ────────────────────────────────

function _getPos(e) {
  var mc = _getCanvas();
  if (!mc) return { x: 0, y: 0 };
  var r = mc.getBoundingClientRect();
  var lw = mc._logicalW || mc.width;
  var lh = mc._logicalH || mc.height;
  var sx = lw / r.width;
  var sy = lh / r.height;
  if (e.touches && e.touches.length) return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
  if (e.changedTouches && e.changedTouches.length) return { x: (e.changedTouches[0].clientX - r.left) * sx, y: (e.changedTouches[0].clientY - r.top) * sy };
  return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}

// ── UI overlay scale (S113 Push 12) ─────────────────────
// Returns the multiplier that converts a "visual CSS pixel" intent into
// canvas-pixel space at the current viewer zoom. A line drawn with
// lineWidth `1.5 * _uiScale()` will appear 1.5 CSS px wide on screen
// regardless of zoom level. Used ONLY for selection box, resize handles,
// rotation handle, delete button, rubber-band — i.e. UI affordances that
// must stay visible at fit-zoom. NEVER applied to pen / shape / highlight
// strokes (Mark explicitly asked not to artificially fatten user content).
//
// Capped at 1.0 minimum so zooming PAST 1:1 doesn't shrink UI below its
// intended canvas size.
function _uiScale() {
  var mc = _getCanvas();
  if (!mc || !mc._logicalW) return 1;
  var r = mc.getBoundingClientRect();
  if (!r.width) return 1;
  var s = r.width / mc._logicalW;
  if (s >= 1) return 1;       // at zoom-in, render UI at native size
  if (s <= 0) return 1;
  return 1 / s;
}

// ── Undo / Redo ─────────────────────────────────────────

function _pushHistory() {
  _undoStack.push(JSON.stringify(_objects));
  if (_undoStack.length > _maxUndo) _undoStack.shift();
  _redoStack = [];
  _updateUndoButtons();
}

function _undo() {
  if (!_undoStack.length) return;
  _redoStack.push(JSON.stringify(_objects));
  _objects = JSON.parse(_undoStack.pop());
  _selectedIds = [];
  _renderAll();
  _markDirty();
  _updateUndoButtons();
}

function _redo() {
  if (!_redoStack.length) return;
  _undoStack.push(JSON.stringify(_objects));
  _objects = JSON.parse(_redoStack.pop());
  _selectedIds = [];
  _renderAll();
  _markDirty();
  _updateUndoButtons();
}

function _updateUndoButtons() {
  var ub = document.getElementById('mk-undo');
  var rb = document.getElementById('mk-redo');
  if (ub) ub.style.opacity = _undoStack.length ? '1' : '0.3';
  if (rb) rb.style.opacity = _redoStack.length ? '1' : '0.3';
}

// ── Rendering ───────────────────────────────────────────

function _renderAll() {
  var mc = _getCanvas();
  if (!mc) return;
  var ctx = mc.getContext('2d');
  var dpr = mc._dpr || 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, mc.width, mc.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── WebGL path (Phase 5) ────────────────────────────────
  // Delegate committed-object render to Pixi when available and no eraser strokes.
  // Eraser uses destination-out composite which isn't supported in the WebGL path,
  // so we fall back to full 2D when any eraser is present.
  // S81: comment was stale — now actually enforced. When any object has an
  // eraserMask, render via 2D path where destination-out reliably cuts pixels.
  var _hasEraserMasks = false;
  for (var _mi = 0; _mi < _objects.length; _mi++){
    if (_objects[_mi] && _objects[_mi].eraserMask && _objects[_mi].eraserMask.length){
      _hasEraserMasks = true; break;
    }
  }
  var useWebGLNow = _useWebGL && _webglReady && _webglCanvas &&
    window.WebGLMarkupRenderer && !_hasEraserMasks;

  if (useWebGLNow){
    try {
      window.WebGLMarkupRenderer.render(_objects, { dpr: dpr, hlAlpha: 0.3 });
    } catch(err){
      console.warn('[Markup] WebGL render threw — disabling for this session:', err);
      _useWebGL = false;
      _webglReady = false;
      useWebGLNow = false;
      if (_webglCanvas && _webglCanvas.parentNode){
        _webglCanvas.parentNode.removeChild(_webglCanvas);
      }
      _webglCanvas = null;
    }
  }

  if (!useWebGLNow){
    // ── Canvas 2D path (original) ─────────────────────────
    // Also clear the WebGL canvas if we have one but aren't using it this pass
    // (e.g., eraser just got added — we don't want stale GPU-rendered strokes showing through)
    if (_webglCanvas){
      var wctx = _webglCanvas.getContext('webgl2') || _webglCanvas.getContext('webgl');
      if (wctx){ try { wctx.clearColor(0,0,0,0); wctx.clear(wctx.COLOR_BUFFER_BIT); } catch(_){} }
    }

    var highlights = [];
    var others = [];
    _objects.forEach(function(obj) {
      if (obj.type === 'highlight') highlights.push(obj);
      else others.push(obj);
    });

    others.forEach(function(obj) { _drawObject(ctx, obj); });

    // Highlight offscreen composite (non-stacking)
    if (highlights.length > 0) {
      if (!_hlCanvas) _hlCanvas = document.createElement('canvas');
      _hlCanvas.width = mc.width;
      _hlCanvas.height = mc.height;
      var hx = _hlCanvas.getContext('2d');

      var opGroups = {};
      highlights.forEach(function(obj) {
        var op = obj.opacity != null ? obj.opacity : 1;
        var key = Math.round(op * 100);
        if (!opGroups[key]) opGroups[key] = { opacity: op, objs: [] };
        opGroups[key].objs.push(obj);
      });

      var opKeys = Object.keys(opGroups);
      for (var gi = 0; gi < opKeys.length; gi++) {
        var grp = opGroups[opKeys[gi]];
        hx.setTransform(1, 0, 0, 1, 0, 0);
        hx.clearRect(0, 0, _hlCanvas.width, _hlCanvas.height);
        // Per-highlight: draw into _objCanvas (isolated), apply its mask, then drawImage into _hlCanvas
        var off2 = _ensureObjCanvas(mc);
        var oc2 = off2.getContext('2d');
        grp.objs.forEach(function(obj) {
          if (!obj.points || obj.points.length < 2) return;
          // Clear and set up _objCanvas at dpr transform
          oc2.setTransform(1, 0, 0, 1, 0, 0);
          oc2.clearRect(0, 0, off2.width, off2.height);
          oc2.setTransform(dpr, 0, 0, dpr, 0, 0);
          oc2.strokeStyle = obj.color || '#F1C40F';
          oc2.lineWidth = (obj.size || 2) * 4;
          oc2.lineCap = 'round';
          oc2.lineJoin = 'round';
          oc2.globalAlpha = 1;
          oc2.globalCompositeOperation = 'source-over';
          oc2.beginPath();
          oc2.moveTo(obj.points[0].x, obj.points[0].y);
          for (var i = 1; i < obj.points.length; i++) oc2.lineTo(obj.points[i].x, obj.points[i].y);
          oc2.stroke();
          // Apply this highlight's own mask (cuts only this highlight's pixels)
          if (obj.eraserMask && obj.eraserMask.length) {
            oc2.save();
            oc2.globalCompositeOperation = 'destination-out';
            oc2.lineCap = 'round'; oc2.lineJoin = 'round';
            for (var mi = 0; mi < obj.eraserMask.length; mi++) {
              var m = obj.eraserMask[mi];
              if (!m.points || m.points.length < 2) continue;
              oc2.lineWidth = (m.size || 2) * 3;
              oc2.beginPath();
              oc2.moveTo(m.points[0].x, m.points[0].y);
              for (var mj = 1; mj < m.points.length; mj++) oc2.lineTo(m.points[mj].x, m.points[mj].y);
              oc2.stroke();
            }
            oc2.restore();
          }
          // Accumulate masked highlight onto group canvas at full alpha
          hx.setTransform(1, 0, 0, 1, 0, 0);
          hx.globalAlpha = 1;
          hx.globalCompositeOperation = 'source-over';
          hx.drawImage(off2, 0, 0);
        });
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.3 * grp.opacity;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(_hlCanvas, 0, 0);
        ctx.restore();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      highlights.forEach(function(obj) {
        // Selection handles drawn as group below
      });
    }
  }

  // Selection handles + rubber-band — ALWAYS rendered in 2D on top of WebGL
  if (_selectedIds.length) {
    _drawGroupedSelection(ctx);
  }

  if (_rubberBand) {
    ctx.save();
    var rbS = _uiScale();
    ctx.setLineDash([4 * rbS, 4 * rbS]);
    ctx.strokeStyle = '#2196F3';
    ctx.fillStyle = 'rgba(33,150,243,.08)';
    ctx.lineWidth = 1 * rbS;
    var rx = Math.min(_rubberBand.x1, _rubberBand.x2);
    var ry = Math.min(_rubberBand.y1, _rubberBand.y2);
    var rw = Math.abs(_rubberBand.x2 - _rubberBand.x1);
    var rh = Math.abs(_rubberBand.y2 - _rubberBand.y1);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }
}

function _drawObject(ctx, obj) {
  // Masked objects render into a reusable per-object offscreen buffer so the
  // destination-out eraser mask only cuts from THIS object's pixels, not from
  // underlying objects already on the main canvas.
  if (obj.eraserMask && obj.eraserMask.length && obj.type !== 'highlight') {
    _drawObjectMasked(ctx, obj);
    return;
  }
  _drawObjectRaw(ctx, obj);
}

// Ensure _objCanvas matches the main canvas buffer size
function _ensureObjCanvas(mc) {
  if (!_objCanvas) _objCanvas = document.createElement('canvas');
  if (_objCanvas.width !== mc.width || _objCanvas.height !== mc.height) {
    _objCanvas.width = mc.width;
    _objCanvas.height = mc.height;
  }
  return _objCanvas;
}

function _drawObjectMasked(ctx, obj) {
  var mc = _getCanvas(); if (!mc) { _drawObjectRaw(ctx, obj); return; }
  var dpr = mc._dpr || 1;
  var off = _ensureObjCanvas(mc);
  var oc = off.getContext('2d');
  // Clear offscreen fully at device-px res, then install logical-px transform
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.clearRect(0, 0, off.width, off.height);
  oc.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Draw object into offscreen (same path as raw draw)
  _drawObjectRaw(oc, obj);
  // Apply each mask path with destination-out — cuts ONLY within offscreen pixels
  oc.save();
  oc.globalCompositeOperation = 'destination-out';
  oc.lineCap = 'round'; oc.lineJoin = 'round';
  oc.globalAlpha = 1;
  for (var i = 0; i < obj.eraserMask.length; i++) {
    var m = obj.eraserMask[i];
    if (!m.points || m.points.length < 2) continue;
    oc.lineWidth = (m.size || 2) * 3;
    oc.beginPath();
    oc.moveTo(m.points[0].x, m.points[0].y);
    for (var j = 1; j < m.points.length; j++) oc.lineTo(m.points[j].x, m.points[j].y);
    oc.stroke();
  }
  oc.restore();
  // Composite masked result onto main canvas (in device-px, then restore logical transform)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

function _drawObjectRaw(ctx, obj) {
  ctx.save();
  ctx.globalAlpha = obj.opacity || 1;
  ctx.strokeStyle = obj.color || '#C0392B';
  ctx.fillStyle = obj.color || '#C0392B';
  // S113 Push 9: clamp to a minimum on-screen-visible width when the
  // viewer is zoomed out below 1:1 (fit-zoom blur fix). At scale ≥ 1
  // returns obj.size unchanged. Pen, polyline, and shape strokes are
  // affected; eraser overrides this further down to (size||2)*3, text
  // uses fillText so lineWidth is irrelevant, highlight short-circuits.
  ctx.lineWidth = obj.size || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  var t = obj.type;

  if (t === 'pen') {
    if (!obj.points || obj.points.length < 2) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(obj.points[0].x, obj.points[0].y);
    for (var k = 1; k < obj.points.length; k++) ctx.lineTo(obj.points[k].x, obj.points[k].y);
    ctx.stroke();
  }
  else if (t === 'highlight') {
    // Drawn via offscreen composite in _renderAll — skip individual draw
    ctx.restore();
    return;
  }
  else if (t === 'text') {
    // Apply rotation if present. Pivot is the text's VISUAL CENTER
    // (anchor + half-estimated-width, half-fontSize above baseline) so
    // rotation appears to spin the text in place. The previous pivot of
    // (x1, y1-fs/2) was the left-center, which made text swing around
    // its left edge instead.
    if (obj.rotation) {
      var fs_t = obj.fontSize || 20;
      var estW_t = (obj.text || '').length * fs_t * 0.55;
      var tcx = obj.x1 + estW_t / 2, tcy = obj.y1 - fs_t / 2;
      ctx.translate(tcx, tcy);
      ctx.rotate(obj.rotation);
      ctx.translate(-tcx, -tcy);
    }
    ctx.font = (obj.bold ? '700 ' : '400 ') + (obj.fontSize || 20) + 'px Calibri,sans-serif';
    ctx.fillText(obj.text || '', obj.x1, obj.y1);
  }
  else if (t === 'eraser') {
    if (!obj.points || obj.points.length < 2) { ctx.restore(); return; }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = (obj.size || 2) * 3;
    ctx.beginPath();
    ctx.moveTo(obj.points[0].x, obj.points[0].y);
    for (var e2 = 1; e2 < obj.points.length; e2++) ctx.lineTo(obj.points[e2].x, obj.points[e2].y);
    ctx.stroke();
  }
  else if (t === 'polyline') {
    if (!obj.points || obj.points.length < 2) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(obj.points[0].x, obj.points[0].y);
    for (var pl = 1; pl < obj.points.length; pl++) ctx.lineTo(obj.points[pl].x, obj.points[pl].y);
    ctx.stroke();
  }
  else {
    // Apply rotation for shapes if present
    if (obj.rotation) {
      var scx = (obj.x1 + obj.x2) / 2, scy = (obj.y1 + obj.y2) / 2;
      ctx.translate(scx, scy);
      ctx.rotate(obj.rotation);
      ctx.translate(-scx, -scy);
    }
    _drawShapeObj(ctx, t, obj.x1, obj.y1, obj.x2, obj.y2);
  }
  ctx.restore();
}

function _drawShapeObj(ctx, t, x1, y1, x2, y2) {
  if (t === 'rect') { ctx.beginPath(); ctx.rect(x1, y1, x2 - x1, y2 - y1); ctx.stroke(); }
  else if (t === 'fillrect') { ctx.fillRect(x1, y1, x2 - x1, y2 - y1); }
  else if (t === 'circle') {
    var rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    ctx.beginPath(); ctx.ellipse(x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }
  else if (t === 'fillcircle') {
    var rx2 = Math.abs(x2 - x1) / 2, ry2 = Math.abs(y2 - y1) / 2;
    ctx.beginPath(); ctx.ellipse(x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2, rx2, ry2, 0, 0, Math.PI * 2); ctx.fill();
  }
  else if (t === 'arrow') {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    var a = Math.atan2(y2 - y1, x2 - x1), hl = 15 + (ctx.lineWidth || 2) * 2;
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(a - Math.PI / 6), y2 - hl * Math.sin(a - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(a + Math.PI / 6), y2 - hl * Math.sin(a + Math.PI / 6));
    ctx.stroke();
  }
  else if (t === 'line') { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  else if (t === 'triangle') {
    ctx.beginPath(); ctx.moveTo(x1 + (x2 - x1) / 2, y1); ctx.lineTo(x2, y2); ctx.lineTo(x1, y2); ctx.closePath(); ctx.stroke();
  }
  else if (t === 'filltriangle') {
    ctx.beginPath(); ctx.moveTo(x1 + (x2 - x1) / 2, y1); ctx.lineTo(x2, y2); ctx.lineTo(x1, y2); ctx.closePath(); ctx.fill();
  }
  else if (t === 'cloud') { _drawCloudObj(ctx, x1, y1, x2, y2); }
}

function _drawCloudObj(ctx, x1, y1, x2, y2) {
  var w = x2 - x1, h = y2 - y1;
  var cx = x1 + w / 2, cy = y1 + h / 2;
  var rx = Math.abs(w) / 2, ry = Math.abs(h) / 2;
  if (rx < 5 || ry < 5) return;
  ctx.beginPath();
  var bumps = Math.max(8, Math.floor((rx + ry) / 10));
  for (var i = 0; i < bumps; i++) {
    var a2 = i * 2 * Math.PI / bumps;
    var na = (i + 1) * 2 * Math.PI / bumps;
    var ma = (a2 + na) / 2;
    var px1 = cx + rx * Math.cos(a2), py1 = cy + ry * Math.sin(a2);
    var px2 = cx + rx * Math.cos(na), py2 = cy + ry * Math.sin(na);
    var cpx = cx + (rx + 12) * Math.cos(ma), cpy = cy + (ry + 12) * Math.sin(ma);
    if (i === 0) ctx.moveTo(px1, py1);
    ctx.quadraticCurveTo(cpx, cpy, px2, py2);
  }
  ctx.closePath();
  ctx.stroke();
}

// ── Destructive Eraser ──────────────────────────────────
// Eraser commits modify _objects in place — splitting pen/highlight/polyline
// strokes into fragments, deleting shapes/text that the eraser path intersects.
// The eraser stroke itself is never persisted; one undo entry reverses the whole op.

// Shortest distance² from point (px,py) to segment (ax,ay)-(bx,by)
function _distSqPtSeg(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) { var ex = px - ax, ey = py - ay; return ex * ex + ey * ey; }
  var t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  var qx = ax + t * dx, qy = ay + t * dy;
  var fx = px - qx, fy = py - qy;
  return fx * fx + fy * fy;
}

// Min distance² between segments (a→b) and (c→d). Returns 0 if they cross.
// Used by _strokeHitByEraser for highlighter / polyline so a fast eraser
// stroke whose sparse vertices land between sparse highlight vertices
// still registers when the segments visually pass close enough.
function _segDistSq(a, b, c, d) {
  var dx1 = b.x - a.x, dy1 = b.y - a.y;
  var dx2 = d.x - c.x, dy2 = d.y - c.y;
  var det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) > 1e-9) {
    var nx = a.x - c.x, ny = a.y - c.y;
    var t = (nx * dy2 - ny * dx2) / -det;
    var u = (nx * dy1 - ny * dx1) / -det;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  // No intersection — min of four endpoint-to-other-segment distances
  var d1 = _distSqPtSeg(a.x, a.y, c.x, c.y, d.x, d.y);
  var d2 = _distSqPtSeg(b.x, b.y, c.x, c.y, d.x, d.y);
  var d3 = _distSqPtSeg(c.x, c.y, a.x, a.y, b.x, b.y);
  var d4 = _distSqPtSeg(d.x, d.y, a.x, a.y, b.x, b.y);
  var m = d1;
  if (d2 < m) m = d2;
  if (d3 < m) m = d3;
  if (d4 < m) m = d4;
  return m;
}

// True if any portion of segment p1→p2 lies inside the axis-aligned bbox
// (x1,y1)-(x2,y2). Liang–Barsky line clipping. Used by shape eraser
// hit-test so a fast stroke whose sparse vertices all land outside a
// small shape still registers as a hit when the segment crosses through.
function _segmentIntersectsBbox(p1, p2, bx1, by1, bx2, by2) {
  var dx = p2.x - p1.x, dy = p2.y - p1.y;
  var t0 = 0, t1 = 1;
  // For each of 4 edges: parametric edge-clip
  // Returns false if the segment can be trivially rejected
  function clip(p, q) {
    if (p === 0) {
      if (q < 0) return false; // parallel and outside
      return true;
    }
    var r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  }
  if (!clip(-dx, p1.x - bx1)) return false;
  if (!clip( dx, bx2 - p1.x)) return false;
  if (!clip(-dy, p1.y - by1)) return false;
  if (!clip( dy, by2 - p1.y)) return false;
  return true;
}

// True if point (px,py) is within eraserR of any point on the eraserPts polyline
function _pointHitByEraser(px, py, eraserPts, eraserR2) {
  // Segment-based test — catches points near the eraser PATH, not just its vertices
  if (eraserPts.length === 1) {
    var ex = px - eraserPts[0].x, ey = py - eraserPts[0].y;
    return (ex * ex + ey * ey) <= eraserR2;
  }
  for (var i = 0; i < eraserPts.length - 1; i++) {
    var a = eraserPts[i], b = eraserPts[i + 1];
    if (_distSqPtSeg(px, py, a.x, a.y, b.x, b.y) <= eraserR2) return true;
  }
  return false;
}

// True if segment (sx1,sy1)-(sx2,sy2) comes within eraserR of any eraser segment
function _segHitByEraser(sx1, sy1, sx2, sy2, eraserPts, eraserR2) {
  // Sample midpoint + endpoints — good enough for reasonable stroke densities;
  // callers already test per-vertex, this just catches long segments crossing the eraser.
  if (_pointHitByEraser(sx1, sy1, eraserPts, eraserR2)) return true;
  if (_pointHitByEraser(sx2, sy2, eraserPts, eraserR2)) return true;
  if (_pointHitByEraser((sx1 + sx2) / 2, (sy1 + sy2) / 2, eraserPts, eraserR2)) return true;
  return false;
}

// Split a freehand stroke (pen/highlight/polyline) into fragments, dropping runs of erased points
function _splitStrokeByEraser(obj, eraserPts, eraserR2) {
  var pts = obj.points;
  if (!pts || pts.length < 2) return [obj];
  // Flag each point as erased or kept
  var kept = new Array(pts.length);
  for (var i = 0; i < pts.length; i++) {
    kept[i] = !_pointHitByEraser(pts[i].x, pts[i].y, eraserPts, eraserR2);
  }
  // Walk: collect contiguous runs of kept points (≥2 points each) into fragments
  var fragments = [];
  var run = [];
  for (var j = 0; j < pts.length; j++) {
    if (kept[j]) {
      run.push(pts[j]);
    } else {
      if (run.length >= 2) fragments.push(run);
      run = [];
    }
  }
  if (run.length >= 2) fragments.push(run);

  if (fragments.length === 0) return [];        // entire stroke erased
  return fragments.map(function(frag, idx) {
    return {
      id: idx === 0 ? obj.id : _newId(),         // first fragment keeps the original id
      type: obj.type,
      points: frag,
      color: obj.color,
      size: obj.size,
      opacity: obj.opacity
    };
  });
}

// Check if shape/text bounds overlap the eraser path (using obj's _getBounds)
function _shapeHitByEraser(obj, eraserPts, eraserR2) {
  var b = _getBounds(obj);
  if (!b) return false;
  // Inflate the shape bbox by eraser radius so near-misses don't clip
  var r = Math.sqrt(eraserR2);
  var ix1 = b.x1 - r, iy1 = b.y1 - r, ix2 = b.x2 + r, iy2 = b.y2 + r;
  // (a) Vertex inside inflated bbox
  for (var i = 0; i < eraserPts.length; i++) {
    var p = eraserPts[i];
    if (p.x >= ix1 && p.x <= ix2 && p.y >= iy1 && p.y <= iy2) return true;
  }
  // (b) Segment crosses inflated bbox — catches fast eraser strokes whose
  // sparse pointer-sampled vertices all happen to land outside a small
  // shape's bbox even though the path clearly swept through it. Single-
  // vertex eraser strokes (eraserPts.length === 1) skip this loop and
  // rely on (a) alone, which is correct.
  for (var j = 0; j < eraserPts.length - 1; j++) {
    if (_segmentIntersectsBbox(eraserPts[j], eraserPts[j + 1], ix1, iy1, ix2, iy2)) return true;
  }
  return false;
}

// Append a raw eraser path to the object's eraserMask. Path points are stored in
// world coords (same space as obj points/x1/y1/x2/y2), so move/resize translate
// them along with the rest of the geometry.
function _pushMask(obj, eraserPts, lineWidth) {
  if (!obj.eraserMask) obj.eraserMask = [];
  // Deep-copy the path so later mutations to the original don't alias
  var copy = new Array(eraserPts.length);
  for (var i = 0; i < eraserPts.length; i++) copy[i] = { x: eraserPts[i].x, y: eraserPts[i].y };
  obj.eraserMask.push({ points: copy, size: lineWidth });
}

// Apply an eraser path to _objects destructively. Called from _endDraw at eraser commit.
// - pen: split into fragments (thin stroke, clean visual gap from vertex removal)
// - polyline / highlight / shapes / text: append mask path; render time applies destination-out
//   so the eraser's EXACT path is carved from the object's pixels, regardless of stroke width
function _applyEraser(eraserPts, lineWidth) {
  if (!eraserPts || eraserPts.length < 2) return;
  // Eraser hit radius matches the visual line in 2D: (size||2)*3 / 2
  var eraserR = ((lineWidth || 2) * 3) / 2;
  var eraserR2 = eraserR * eraserR;

  var next = [];
  for (var i = 0; i < _objects.length; i++) {
    var obj = _objects[i];
    if (!obj || !obj.type) continue;

    if (obj.type === 'pen') {
      // Fragment split — thin strokes get clean separation
      var frags = _splitStrokeByEraser(obj, eraserPts, eraserR2);
      for (var j = 0; j < frags.length; j++) next.push(frags[j]);
    }
    else if (obj.type === 'highlight') {
      // Highlight renders at (size||2)*4 wide. Spine hit-test must be inflated
      // by the visible half-width, otherwise eraser passing through the visible
      // blob edge doesn't register (S81 bug — eraser ignored on highlighter).
      var hlHalfW = ((obj.size || 2) * 4) / 2;
      var hlR = eraserR + hlHalfW;
      if (_strokeHitByEraser(obj, eraserPts, hlR * hlR)) {
        _pushMask(obj, eraserPts, lineWidth);
      }
      next.push(obj);
    }
    else if (obj.type === 'polyline') {
      // Polyline renders at obj.size (thinner than highlight) — inflate by half-width too
      var plHalfW = ((obj.size || 2)) / 2;
      var plR = eraserR + plHalfW;
      if (_strokeHitByEraser(obj, eraserPts, plR * plR)) {
        _pushMask(obj, eraserPts, lineWidth);
      }
      next.push(obj);
    }
    else if (obj.type === 'text') {
      // Mask: carve the eraser's exact path from the text glyphs
      if (_shapeHitByEraser(obj, eraserPts, eraserR2)) {
        _pushMask(obj, eraserPts, lineWidth);
      }
      next.push(obj);
    }
    else {
      // All shapes (rect/fillrect/circle/fillcircle/line/arrow/triangle/filltriangle/cloud)
      // Mask: carve the eraser's exact path
      if (_shapeHitByEraser(obj, eraserPts, eraserR2)) {
        _pushMask(obj, eraserPts, lineWidth);
      }
      next.push(obj);
    }
  }

  _objects = next;
  // Drop selection of anything that no longer exists (only possible via pen full-erase)
  if (_selectedIds.length) {
    var alive = {};
    for (var k = 0; k < _objects.length; k++) alive[_objects[k].id] = true;
    _selectedIds = _selectedIds.filter(function(id) { return alive[id]; });
  }
}

// Did the eraser come within eraserR of any part of the stroke polyline?
// Tests segment-pair minimum distance — robust against sparse vertices on
// either side. Falls back to vertex-only test for degenerate single-point
// strokes.
function _strokeHitByEraser(obj, eraserPts, eraserR2) {
  var pts = obj.points;
  if (!pts || pts.length < 1) return false;
  // Single-point stroke: only point-to-segment / point-to-point checks
  if (pts.length === 1) {
    return _pointHitByEraser(pts[0].x, pts[0].y, eraserPts, eraserR2);
  }
  if (eraserPts.length === 1) {
    // Single-point eraser: check distance to each stroke segment
    var ex = eraserPts[0].x, ey = eraserPts[0].y;
    for (var k = 0; k < pts.length - 1; k++) {
      if (_distSqPtSeg(ex, ey, pts[k].x, pts[k].y, pts[k+1].x, pts[k+1].y) <= eraserR2) return true;
    }
    return false;
  }
  // Pair-segment minimum-distance — both polylines have ≥2 points
  for (var i = 0; i < pts.length - 1; i++) {
    var sa = pts[i], sb = pts[i + 1];
    for (var j = 0; j < eraserPts.length - 1; j++) {
      if (_segDistSq(sa, sb, eraserPts[j], eraserPts[j + 1]) <= eraserR2) return true;
    }
  }
  return false;
}

// ── Rubber-band state ───────────────────────────────────
var _rubberBand = null; // {x1,y1,x2,y2} during drag-select

function _getGroupBounds() {
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  _selectedIds.forEach(function(id) {
    var obj = _findObj(id);
    if (!obj) return;
    var b = _getBounds(obj);
    if (!b) return;
    if (b.x1 < x1) x1 = b.x1;
    if (b.y1 < y1) y1 = b.y1;
    if (b.x2 > x2) x2 = b.x2;
    if (b.y2 > y2) y2 = b.y2;
  });
  if (x1 === Infinity) return null;
  return { x1: x1, y1: y1, x2: x2, y2: y2 };
}

function _drawGroupedSelection(ctx) {
  var b = _getGroupBounds();
  if (!b) return;
  var pad = 6;
  var bx = b.x1 - pad, by = b.y1 - pad, bw = b.x2 - b.x1 + pad * 2, bh = b.y2 - b.y1 + pad * 2;
  ctx.save();
  // Dashed border
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 1;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.setLineDash([]);
  // Corner resize handles
  var hs = 8;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1.5;
  [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(function(p) {
    ctx.fillRect(p[0] - hs / 2, p[1] - hs / 2, hs, hs);
    ctx.strokeRect(p[0] - hs / 2, p[1] - hs / 2, hs, hs);
  });
  // Rotation handle (circle above top-center, Microsoft-style)
  var rcx = bx + bw / 2, rcy = by - 24;
  ctx.beginPath();
  ctx.moveTo(bx + bw / 2, by);
  ctx.lineTo(rcx, rcy + 7);
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rcx, rcy, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Rotation arrow icon inside circle
  ctx.beginPath();
  ctx.arc(rcx, rcy, 4, -0.3, Math.PI * 1.4);
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Delete button (red X) — top-right outside box
  var dx = bx + bw + 4, dy = by - 14;
  ctx.fillStyle = '#E53E3E';
  ctx.beginPath();
  ctx.arc(dx + 8, dy + 8, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px Calibri,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u2715', dx + 8, dy + 8);
  ctx.restore();
}

// Returns corner index (0=TL,1=TR,2=BL,3=BR) or -1
function _hitResizeHandle(pos) {
  var b = _getGroupBounds();
  if (!b) return -1;
  var pad = 6;
  var bx = b.x1 - pad, by = b.y1 - pad, bw = b.x2 - b.x1 + pad * 2, bh = b.y2 - b.y1 + pad * 2;
  var corners = [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]];
  for (var i = 0; i < corners.length; i++) {
    if (Math.abs(pos.x - corners[i][0]) <= 8 && Math.abs(pos.y - corners[i][1]) <= 8) return i;
  }
  return -1;
}

function _hitRotateHandle(pos) {
  var b = _getGroupBounds();
  if (!b) return false;
  var pad = 6;
  var rcx = (b.x1 + b.x2) / 2, rcy = b.y1 - pad - 24;
  var dist = Math.sqrt((pos.x - rcx) * (pos.x - rcx) + (pos.y - rcy) * (pos.y - rcy));
  return dist <= 12;
}

function _hitDeleteButton(pos) {
  var b = _getGroupBounds();
  if (!b) return false;
  var pad = 6;
  var dx = b.x2 + pad + 4 + 8;
  var dy = b.y1 - pad - 14 + 8;
  var dist = Math.sqrt((pos.x - dx) * (pos.x - dx) + (pos.y - dy) * (pos.y - dy));
  return dist <= 12;
}

function _getBounds(obj) {
  if (obj.type === 'text') {
    var fs = obj.fontSize || 20;
    var txtLen = (obj.text || '').length;
    var estW = txtLen * fs * 0.55; // Approximate text width
    var bx1t = obj.x1, by1t = obj.y1 - fs;
    var bx2t = obj.x1 + estW, by2t = obj.y1 + 4;
    var rotT = obj.rotation || 0;
    if (rotT) {
      // Rotation pivot must match the render path: visual center
      // (x1 + estW/2, y1 - fs/2). Bounds = AABB of the four rotated
      // corners. Without this, selection box / hit-test reference the
      // un-rotated rectangle even though the visible text has spun.
      var ctx_ = obj.x1 + estW / 2, cty_ = obj.y1 - fs / 2;
      var ct = Math.cos(rotT), st = Math.sin(rotT);
      var cornersT = [[bx1t, by1t], [bx2t, by1t], [bx2t, by2t], [bx1t, by2t]];
      var rxMinT = Infinity, ryMinT = Infinity, rxMaxT = -Infinity, ryMaxT = -Infinity;
      for (var ti = 0; ti < 4; ti++) {
        var ddxT = cornersT[ti][0] - ctx_, ddyT = cornersT[ti][1] - cty_;
        var rxT = ctx_ + ddxT * ct - ddyT * st;
        var ryT = cty_ + ddxT * st + ddyT * ct;
        if (rxT < rxMinT) rxMinT = rxT;
        if (ryT < ryMinT) ryMinT = ryT;
        if (rxT > rxMaxT) rxMaxT = rxT;
        if (ryT > ryMaxT) ryMaxT = ryT;
      }
      return { x1: rxMinT, y1: ryMinT, x2: rxMaxT, y2: ryMaxT };
    }
    return { x1: bx1t, y1: by1t, x2: bx2t, y2: by2t };
  }
  if (obj.points && obj.points.length) {
    // Point-based objects (pen/highlight/polyline): rotation already
    // baked into the points by the rotate drag handler, so the AABB of
    // points IS the visual AABB.
    var xs = obj.points.map(function(p) { return p.x; });
    var ys = obj.points.map(function(p) { return p.y; });
    return { x1: Math.min.apply(null, xs), y1: Math.min.apply(null, ys), x2: Math.max.apply(null, xs), y2: Math.max.apply(null, ys) };
  }
  if (obj.x1 != null && obj.x2 != null) {
    var bx1 = Math.min(obj.x1, obj.x2), by1 = Math.min(obj.y1, obj.y2);
    var bx2 = Math.max(obj.x1, obj.x2), by2 = Math.max(obj.y1, obj.y2);
    var rot = obj.rotation || 0;
    if (rot) {
      // S114-deferred fix: shape stores un-rotated x1..y2 + rotation angle.
      // Render path applies ctx.rotate around bbox center, so the on-screen
      // shape lives at the AABB of the four rotated corners. Bounds must
      // reflect that — otherwise the selection box, rotation pivot, and
      // eraser hit-test all reference the wrong rectangle.
      var cx = (bx1 + bx2) / 2, cy = (by1 + by2) / 2;
      var c = Math.cos(rot), s = Math.sin(rot);
      var corners = [
        [bx1, by1], [bx2, by1], [bx2, by2], [bx1, by2]
      ];
      var rxMin = Infinity, ryMin = Infinity, rxMax = -Infinity, ryMax = -Infinity;
      for (var i = 0; i < 4; i++) {
        var ddx = corners[i][0] - cx, ddy = corners[i][1] - cy;
        var rx = cx + ddx * c - ddy * s;
        var ry = cy + ddx * s + ddy * c;
        if (rx < rxMin) rxMin = rx;
        if (ry < ryMin) ryMin = ry;
        if (rx > rxMax) rxMax = rx;
        if (ry > ryMax) ryMax = ry;
      }
      return { x1: rxMin, y1: ryMin, x2: rxMax, y2: ryMax };
    }
    return { x1: bx1, y1: by1, x2: bx2, y2: by2 };
  }
  return null;
}

// ── Drawing Input ───────────────────────────────────────

var _startX = 0, _startY = 0, _endX = 0, _endY = 0;

function _startDraw(e) {
  if (!_tool || _tool === 'select') return;
  if (_tool === 'text') { _handleTextPlace(e); return; }
  if (_tool === 'polyline') { _handlePolylineClick(e); return; }

  _isDrawing = true;
  if (TiledPdf.isActive()) TiledPdf.pause();
  _penPoints = [];
  var pos = _getPos(e);
  _startX = pos.x;
  _startY = pos.y;
  _penPoints.push(pos);

  var ov = _ensureOverlay();
  if (ov) {
    ov.style.display = 'block';
    if (_tool === 'highlight') ov.style.opacity = String(0.3 * _opacity);
    else if (_tool === 'eraser') ov.style.opacity = '0.5';
    else ov.style.opacity = '1';
  }
}

function _moveDraw(e) {
  if (!_isDrawing) return;
  var pos = _getPos(e);
  _endX = pos.x;
  _endY = pos.y;

  var ov = _getOverlay();
  if (!ov) return;
  var ctx = ov.getContext('2d');
  var d = ov._dpr || 1;

  if (_tool === 'pen' || _tool === 'highlight' || _tool === 'eraser') {
    _penPoints.push(pos);
    if (_penPoints.length < 2) return;

    if (_tool === 'highlight') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ov.width, ov.height);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.strokeStyle = _color;
      ctx.lineWidth = _lineWidth * 4;
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(_penPoints[0].x, _penPoints[0].y);
      for (var i = 1; i < _penPoints.length; i++) ctx.lineTo(_penPoints[i].x, _penPoints[i].y);
      ctx.stroke();
    } else {
      var n = _penPoints.length;
      var p0 = _penPoints[n - 2], p1 = _penPoints[n - 1];
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.save();
      ctx.strokeStyle = _tool === 'eraser' ? '#8a94b0' : _color;
      ctx.lineWidth = _tool === 'eraser' ? _lineWidth * 3 : _lineWidth;
      if (_tool === 'pen') ctx.globalAlpha = _opacity;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.save();
    ctx.globalAlpha = _opacity;
    ctx.strokeStyle = _color;
    ctx.fillStyle = _color;
    ctx.lineWidth = _lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    _drawShapeObj(ctx, _tool, _startX, _startY, pos.x, pos.y);
    ctx.restore();
  }
}

function _endDraw(e) {
  if (!_isDrawing) return;
  _isDrawing = false;
  if (TiledPdf.isActive()) { TiledPdf.resume(); TiledPdf.scheduleRender(); }

  var ov = _getOverlay();
  if (ov) {
    ov.style.display = 'none';
    var c = ov.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ov.width, ov.height);
  }

  var type = _tool;
  if (type === 'eraser') {
    // Destructive eraser: split/remove underlying strokes permanently.
    // Eraser itself is NEVER added to _objects — it's a one-shot editing operation.
    if (_penPoints.length > 1) {
      _applyEraser(_penPoints.slice(), _lineWidth);
    }
  } else if (type === 'pen' || type === 'highlight') {
    if (_penPoints.length > 1) {
      _objects.push({
        id: _newId(), type: type, points: _penPoints.slice(),
        color: _color, size: _lineWidth, opacity: _opacity
      });
    }
  } else if (type && type !== 'polyline' && type !== 'select' && type !== 'text') {
    _objects.push({
      id: _newId(), type: type,
      x1: _startX, y1: _startY, x2: _endX || _startX, y2: _endY || _startY,
      color: _color, size: _lineWidth, opacity: _opacity
    });
  }

  _pushHistory();
  _penPoints = [];
  _renderAll();
  _markDirty();
}

// ── Text Tool ───────────────────────────────────────────

function _handleTextPlace(e) {
  var pos = _getPos(e);
  var mc = _getCanvas();
  if (!mc) { console.warn('[Markup] Text: no canvas'); return; }
  console.log('[Markup] Text tool placed at', pos.x.toFixed(0), pos.y.toFixed(0));

  // Remove any previous text input
  var prev = document.querySelectorAll('.mk-text-input-live');
  prev.forEach(function(el) { if (el.parentNode) el.parentNode.removeChild(el); });

  // Get screen position of click
  var screenX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 200);
  var screenY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 200);

  var input = document.createElement('textarea');
  input.className = 'mk-text-input-live';
  input.style.cssText = 'position:fixed;z-index:99999;display:block;background:rgba(30,37,51,.9);border:2px solid #2196F3;color:' + _color + ';font-family:Calibri,sans-serif;resize:both;outline:none;padding:6px 8px;min-width:120px;min-height:32px;overflow:hidden;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,.5);';
  input.style.fontSize = _fontSize + 'px';
  input.style.left = screenX + 'px';
  input.style.top = screenY + 'px';
  input.placeholder = 'Type here...';

  // Append inside the viewer overlay for z-index compatibility
  var overlay = document.getElementById('drawing-viewer-overlay');
  (overlay || document.body).appendChild(input);

  input._mkX = pos.x;
  input._mkY = pos.y + _fontSize;

  setTimeout(function() { input.focus(); }, 80);

  var committed = false;
  function _commit() {
    if (committed) return;
    committed = true;
    var txt = input.value.trim();
    if (input.parentNode) input.parentNode.removeChild(input);
    if (txt) {
      _objects.push({
        id: _newId(), type: 'text', text: txt,
        x1: input._mkX, y1: input._mkY,
        color: _color, fontSize: _fontSize, bold: false, opacity: _opacity
      });
      _pushHistory();
      _renderAll();
      _markDirty();
      console.log('[Markup] Text committed:', txt);
    }
  }
  input.addEventListener('blur', function() { setTimeout(_commit, 150); });
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); _commit(); }
    if (ev.key === 'Escape') { if (input.parentNode) input.parentNode.removeChild(input); committed = true; }
    ev.stopPropagation(); // Prevent viewer keyboard shortcuts
  });
}

// ── Polyline Tool ───────────────────────────────────────

function _handlePolylineClick(e) {
  var pos = _getPos(e);
  // Click near first point → finish polyline (close loop)
  if (_polyPoints.length >= 2) {
    var dx = pos.x - _polyPoints[0].x, dy = pos.y - _polyPoints[0].y;
    if (Math.sqrt(dx * dx + dy * dy) < 15) {
      _polyPoints.push({ x: _polyPoints[0].x, y: _polyPoints[0].y }); // Close to exact first point
      _finishPolyline();
      return;
    }
  }
  _polyPoints.push(pos);

  var ov = _ensureOverlay();
  if (ov && _polyPoints.length >= 2) {
    ov.style.display = 'block';
    ov.style.opacity = '1';
    var ctx = ov.getContext('2d');
    var d = ov._dpr || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.strokeStyle = _color;
    ctx.lineWidth = _lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = _opacity;
    ctx.beginPath();
    ctx.moveTo(_polyPoints[0].x, _polyPoints[0].y);
    for (var i = 1; i < _polyPoints.length; i++) ctx.lineTo(_polyPoints[i].x, _polyPoints[i].y);
    ctx.stroke();
  }
}

function _finishPolyline() {
  if (_polyPoints.length >= 2) {
    _objects.push({
      id: _newId(), type: 'polyline', points: _polyPoints.slice(),
      color: _color, size: _lineWidth, opacity: _opacity
    });
    _pushHistory();
    _markDirty();
  }
  _polyPoints = [];
  var ov = _getOverlay();
  if (ov) {
    ov.style.display = 'none';
    var c = ov.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ov.width, ov.height);
  }
  _renderAll();
}

function _drawPolylinePreview(e) {
  var pos = _getPos(e);
  var ov = _ensureOverlay();
  if (!ov) return;
  ov.style.display = 'block';
  ov.style.opacity = '1';
  var ctx = ov.getContext('2d');
  var d = ov._dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ov.width, ov.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.strokeStyle = _color;
  ctx.lineWidth = _lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = _opacity;
  // Draw placed segments
  ctx.beginPath();
  ctx.moveTo(_polyPoints[0].x, _polyPoints[0].y);
  for (var i = 1; i < _polyPoints.length; i++) ctx.lineTo(_polyPoints[i].x, _polyPoints[i].y);
  // Rubber-band to cursor
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  // Close indicator: circle on first point when cursor is near
  if (_polyPoints.length >= 2) {
    var dx = pos.x - _polyPoints[0].x, dy = pos.y - _polyPoints[0].y;
    if (Math.sqrt(dx * dx + dy * dy) < 15) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(_polyPoints[0].x, _polyPoints[0].y, 8, 0, Math.PI * 2);
      ctx.fillStyle = _color;
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.restore();
    }
  }
}

// ── Select Tool ─────────────────────────────────────────

var _dragState = null;

function _hitTestObjects(pos) {
  for (var i = _objects.length - 1; i >= 0; i--) {
    var b = _getBounds(_objects[i]);
    if (b && pos.x >= b.x1 - 6 && pos.x <= b.x2 + 6 && pos.y >= b.y1 - 6 && pos.y <= b.y2 + 6) {
      return _objects[i];
    }
  }
  return null;
}

function _handleSelectDown(e) {
  if (_tool !== 'select') return;
  var pos = _getPos(e);

  // Check if clicking the grouped delete button
  if (_selectedIds.length && _hitDeleteButton(pos)) {
    _objects = _objects.filter(function(o) { return _selectedIds.indexOf(o.id) === -1; });
    _selectedIds = [];
    _pushHistory();
    _renderAll();
    _markDirty();
    return;
  }

  // Check if clicking a resize corner handle
  if (_selectedIds.length) {
    var corner = _hitResizeHandle(pos);
    if (corner >= 0) {
      var gb = _getGroupBounds();
      if (gb) {
        // Anchor is the opposite corner
        var anchors = [[gb.x2, gb.y2], [gb.x1, gb.y2], [gb.x2, gb.y1], [gb.x1, gb.y1]];
        _dragState = {
          type: 'resize', corner: corner,
          anchorX: anchors[corner][0], anchorY: anchors[corner][1],
          origBounds: { x1: gb.x1, y1: gb.y1, x2: gb.x2, y2: gb.y2 },
          startX: pos.x, startY: pos.y,
          origObjects: JSON.parse(JSON.stringify(_selectedIds.map(function(id) { return _findObj(id); }).filter(Boolean)))
        };
        return;
      }
    }

    // Check if clicking rotation handle
    if (_hitRotateHandle(pos)) {
      var gb2 = _getGroupBounds();
      if (gb2) {
        var cx = (gb2.x1 + gb2.x2) / 2;
        var cy = (gb2.y1 + gb2.y2) / 2;
        _dragState = {
          type: 'rotate',
          centerX: cx, centerY: cy,
          startAngle: Math.atan2(pos.y - cy, pos.x - cx),
          origObjects: JSON.parse(JSON.stringify(_selectedIds.map(function(id) { return _findObj(id); }).filter(Boolean)))
        };
        return;
      }
    }
  }

  var hit = _hitTestObjects(pos);
  if (hit) {
    // S113: Ctrl/Cmd+click toggles membership in the multi-selection.
    // Desktop convention — Ctrl on Windows/Linux, Cmd on macOS. No drag
    // is started on toggle; the user picks all the objects they want
    // first, then drags any one of them (without modifier) to move the
    // group.
    var multiKey = !!(e && (e.ctrlKey || e.metaKey));
    if (multiKey) {
      var existingIdx = _selectedIds.indexOf(hit.id);
      if (existingIdx !== -1) {
        // Already in selection — remove it
        _selectedIds.splice(existingIdx, 1);
      } else {
        // Add to selection
        _selectedIds.push(hit.id);
      }
      _dragState = null;
      _renderAll();
      return;
    }
    // Clicked an object — select it for move (including text)
    if (_selectedIds.indexOf(hit.id) !== -1) {
      // Already selected — start dragging the group
      _dragState = { type: 'move', startX: pos.x, startY: pos.y, moved: false };
    } else {
      // New selection (replace, not add)
      _selectedIds = [hit.id];
      _dragState = { type: 'move', startX: pos.x, startY: pos.y, moved: false };
    }
    _renderAll();
  } else {
    // Clicked empty space — start rubber-band
    _selectedIds = [];
    _rubberBand = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    _dragState = { type: 'rubberband' };
    _renderAll();
  }
}

function _editTextObject(obj, e) {
  var mc = _getCanvas();
  if (!mc) return;

  // Remove previous text input
  var prev = document.querySelectorAll('.mk-text-input-live');
  prev.forEach(function(el) { if (el.parentNode) el.parentNode.removeChild(el); });

  // Calculate screen position from logical coords
  var r = mc.getBoundingClientRect();
  var lw = mc._logicalW || mc.width;
  var lh = mc._logicalH || mc.height;
  var screenX = r.left + (obj.x1 / lw) * r.width;
  var screenY = r.top + ((obj.y1 - (obj.fontSize || 20)) / lh) * r.height;

  _color = obj.color || _color;
  _fontSize = obj.fontSize || 20;
  _opacity = obj.opacity != null ? obj.opacity : 1;
  _updateColorSwatch();
  _updateSizeLabels();

  var input = document.createElement('textarea');
  input.className = 'mk-text-input-live';
  input.style.cssText = 'position:fixed;z-index:99999;display:block;background:rgba(30,37,51,.9);border:2px solid #2196F3;color:' + _color + ';font-family:Calibri,sans-serif;resize:both;outline:none;padding:6px 8px;min-width:120px;min-height:32px;overflow:hidden;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,.5);';
  input.style.fontSize = _fontSize + 'px';
  input.style.left = screenX + 'px';
  input.style.top = screenY + 'px';
  input.value = obj.text || '';

  var overlay = document.getElementById('drawing-viewer-overlay');
  (overlay || document.body).appendChild(input);

  input._mkX = obj.x1;
  input._mkY = obj.y1;
  input._editObjId = obj.id;

  setTimeout(function() { input.focus(); input.select(); }, 80);

  var committed = false;
  function _commit() {
    if (committed) return;
    committed = true;
    var txt = input.value.trim();
    if (input.parentNode) input.parentNode.removeChild(input);
    if (txt) {
      obj.text = txt;
      obj.fontSize = _fontSize;
      obj.color = _color;
      obj.opacity = _opacity;
      _pushHistory();
      _renderAll();
      _markDirty();
    } else {
      // Empty text = delete object
      _objects = _objects.filter(function(o) { return o.id !== obj.id; });
      _pushHistory();
      _renderAll();
      _markDirty();
    }
  }
  input.addEventListener('blur', function() { setTimeout(_commit, 150); });
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); _commit(); }
    if (ev.key === 'Escape') { if (input.parentNode) input.parentNode.removeChild(input); committed = true; _renderAll(); }
    ev.stopPropagation();
  });
}

function _handleSelectMove(e) {
  if (!_dragState) return;
  var pos = _getPos(e);

  if (_dragState.type === 'rubberband') {
    _rubberBand.x2 = pos.x;
    _rubberBand.y2 = pos.y;
    _renderAll();
    return;
  }

  if (_dragState.type === 'move') {
    var dx = pos.x - _dragState.startX;
    var dy = pos.y - _dragState.startY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && !_dragState.moved) return;
    _dragState.moved = true;

    // Move all selected objects
    _selectedIds.forEach(function(id) {
      var obj = _findObj(id);
      if (!obj) return;
      if (obj.points) {
        obj.points.forEach(function(p) { p.x += dx; p.y += dy; });
      }
      if (obj.x1 != null) { obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy; }
      // Eraser masks travel with the object (holes stay in the same spot on the shape)
      if (obj.eraserMask && obj.eraserMask.length) {
        obj.eraserMask.forEach(function(m) {
          m.points.forEach(function(p) { p.x += dx; p.y += dy; });
        });
      }
    });

    _dragState.startX = pos.x;
    _dragState.startY = pos.y;
    _renderAll();
  }

  if (_dragState.type === 'resize') {
    var ob = _dragState.origBounds;
    var ax = _dragState.anchorX, ay = _dragState.anchorY;
    var ow = ob.x2 - ob.x1, oh = ob.y2 - ob.y1;
    if (ow < 1 || oh < 1) return;
    var sx = Math.abs(pos.x - ax) / ow;
    var sy = Math.abs(pos.y - ay) / oh;
    var s = Math.max(0.1, (sx + sy) / 2);
    _dragState.origObjects.forEach(function(orig) {
      var obj = _findObj(orig.id);
      if (!obj) return;
      if (orig.points) {
        obj.points = orig.points.map(function(p) {
          return { x: ax + (p.x - ax) * s, y: ay + (p.y - ay) * s };
        });
      }
      if (orig.x1 != null) {
        obj.x1 = ax + (orig.x1 - ax) * s;
        obj.y1 = ay + (orig.y1 - ay) * s;
        if (orig.x2 != null) {
          obj.x2 = ax + (orig.x2 - ax) * s;
          obj.y2 = ay + (orig.y2 - ay) * s;
        }
      }
      if (orig.size) obj.size = Math.max(1, Math.round(orig.size * s));
      if (orig.fontSize) obj.fontSize = Math.max(8, Math.round(orig.fontSize * s));
      // Scale eraser masks along with the object
      if (orig.eraserMask && orig.eraserMask.length) {
        obj.eraserMask = orig.eraserMask.map(function(m) {
          return {
            points: m.points.map(function(p) {
              return { x: ax + (p.x - ax) * s, y: ay + (p.y - ay) * s };
            }),
            size: Math.max(1, m.size * s)
          };
        });
      }
    });
    _renderAll();
  }

  if (_dragState.type === 'rotate') {
    var cx = _dragState.centerX, cy = _dragState.centerY;
    var curAngle = Math.atan2(pos.y - cy, pos.x - cx);
    var dAngle = curAngle - _dragState.startAngle;
    var cosA = Math.cos(dAngle), sinA = Math.sin(dAngle);
    _dragState.origObjects.forEach(function(orig) {
      var obj = _findObj(orig.id);
      if (!obj) return;
      function rot(px, py) { return { x: cx + (px - cx) * cosA - (py - cy) * sinA, y: cy + (px - cx) * sinA + (py - cy) * cosA }; }
      if (orig.points) {
        // Point-based objects: rotate actual coordinates (pen, highlight, polyline, eraser)
        obj.points = orig.points.map(function(p) { return rot(p.x, p.y); });
      } else if (orig.type === 'text') {
        // Text: visual center is (x1 + estW/2, y1 - fs/2). Rotate that
        // point around the group pivot to get the new visual center,
        // derive the new anchor from it, accumulate obj.rotation. Do NOT
        // write x2/y2 — text doesn't carry them, and the previous shape
        // branch was corrupting text data by treating undefined x2/y2 as 0.
        var fs_r = orig.fontSize || 20;
        var estW_r = (orig.text || '').length * fs_r * 0.55;
        var origCxT = orig.x1 + estW_r / 2;
        var origCyT = orig.y1 - fs_r / 2;
        var newCT = rot(origCxT, origCyT);
        obj.x1 = newCT.x - estW_r / 2;
        obj.y1 = newCT.y + fs_r / 2;
        obj.rotation = (orig.rotation || 0) + dAngle;
      } else if (orig.x1 != null) {
        // Shape objects: store rotation angle, keep coordinates unchanged
        // Rotate center position around the group center
        var origCx = ((orig.x1 || 0) + (orig.x2 || 0)) / 2;
        var origCy = ((orig.y1 || 0) + (orig.y2 || 0)) / 2;
        var newC = rot(origCx, origCy);
        var hw = Math.abs((orig.x2 || 0) - (orig.x1 || 0)) / 2;
        var hh = Math.abs((orig.y2 || 0) - (orig.y1 || 0)) / 2;
        obj.x1 = newC.x - hw; obj.y1 = newC.y - hh;
        obj.x2 = newC.x + hw; obj.y2 = newC.y + hh;
        obj.rotation = (orig.rotation || 0) + dAngle;
      }
      // Rotate eraser masks around the same pivot (holes follow the object's spin)
      if (orig.eraserMask && orig.eraserMask.length) {
        obj.eraserMask = orig.eraserMask.map(function(m) {
          return { points: m.points.map(function(p) { return rot(p.x, p.y); }), size: m.size };
        });
      }
    });
    _renderAll();
  }
}

function _handleSelectUp() {
  if (!_dragState) return;

  if (_dragState.type === 'rubberband' && _rubberBand) {
    var rx1 = Math.min(_rubberBand.x1, _rubberBand.x2);
    var ry1 = Math.min(_rubberBand.y1, _rubberBand.y2);
    var rx2 = Math.max(_rubberBand.x1, _rubberBand.x2);
    var ry2 = Math.max(_rubberBand.y1, _rubberBand.y2);
    if (Math.abs(rx2 - rx1) > 4 || Math.abs(ry2 - ry1) > 4) {
      var hits = [];
      _objects.forEach(function(obj) {
        var b = _getBounds(obj);
        if (!b) return;
        if (b.x2 >= rx1 && b.x1 <= rx2 && b.y2 >= ry1 && b.y1 <= ry2) {
          hits.push(obj.id);
        }
      });
      _selectedIds = hits;
    }
    _rubberBand = null;
    _renderAll();
  }

  if (_dragState.type === 'move' && _dragState.moved) {
    _pushHistory();
    _markDirty();
  }
  if (_dragState.type === 'resize' || _dragState.type === 'rotate') {
    _pushHistory();
    _markDirty();
  }
  _dragState = null;
}

// ── Eraser Visual Cursor ────────────────────────────────

var _eraserCursor = null;

function _updateEraserCursor(e) {
  if (!_eraserCursor) {
    _eraserCursor = document.createElement('div');
    _eraserCursor.id = 'eraser-cursor';
    _eraserCursor.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #8a94b0;border-radius:50%;z-index:2600;display:none;box-shadow:0 0 4px rgba(0,0,0,.3);';
    document.body.appendChild(_eraserCursor);
  }
  if (_tool === 'eraser') {
    var mc = _getCanvas();
    if (!mc) return;
    var r = mc.getBoundingClientRect();
    var scale = r.width / (mc._logicalW || mc.width);
    var diam = _lineWidth * 3 * 2 * scale;
    _eraserCursor.style.width = diam + 'px';
    _eraserCursor.style.height = diam + 'px';
    _eraserCursor.style.left = (e.clientX - diam / 2) + 'px';
    _eraserCursor.style.top = (e.clientY - diam / 2) + 'px';
    _eraserCursor.style.display = 'block';
  } else {
    _eraserCursor.style.display = 'none';
  }
}

// ── Dirty / Save ────────────────────────────────────────

function _markDirty() { _dirty = true; }

function _saveMarkup() {
  if (!_drawingId) return;
  var proj = Model.getProject();
  if (!proj) return;

  // Save to drawings array in model
  if (proj.drawings) {
    for (var i = 0; i < proj.drawings.length; i++) {
      if (proj.drawings[i].id === _drawingId) {
        proj.drawings[i].markupObjects = _objects.length ? JSON.parse(JSON.stringify(_objects)) : null;
        break;
      }
    }
  }

  // Save to IDB markupObjects store
  var rec = { id: _drawingId, drawingId: _drawingId, objects: JSON.parse(JSON.stringify(_objects)) };
  IDB.put('markupObjects', rec).then(function() {
    console.log('[Markup] Saved ' + _objects.length + ' objects for drawing ' + _drawingId);
  }).catch(function(err) {
    console.warn('[Markup] IDB save error:', err);
  });

  Model.saveNow();
  _dirty = false;
}

function _loadMarkup(drawingId) {
  _objects = [];
  _undoStack = [];
  _redoStack = [];
  _selectedIds = [];

  // Try model drawings array first (v1 compat)
  var proj = Model.getProject();
  if (proj && proj.drawings) {
    for (var i = 0; i < proj.drawings.length; i++) {
      if (proj.drawings[i].id === drawingId && proj.drawings[i].markupObjects && proj.drawings[i].markupObjects.length) {
        _objects = JSON.parse(JSON.stringify(proj.drawings[i].markupObjects));
        console.log('[Markup] Loaded ' + _objects.length + ' objects from model');
        _renderAll();
        _updateUndoButtons();
        return;
      }
    }
  }

  // Fallback: IDB
  IDB.get('markupObjects', drawingId).then(function(rec) {
    if (rec && rec.objects && rec.objects.length) {
      _objects = rec.objects;
      console.log('[Markup] Loaded ' + _objects.length + ' objects from IDB');
    } else {
      console.log('[Markup] No markup for drawing ' + drawingId);
    }
    _renderAll();
    _updateUndoButtons();
  }).catch(function(err) {
    console.warn('[Markup] IDB load error:', err);
    _renderAll();
    _updateUndoButtons();
  });
}

// ── Toolbar ─────────────────────────────────────────────

function _buildToolbar() {
  // Static sidebar in index.html — just set pin as default active
  var sidebar = document.getElementById('dv-sidebar-tools');
  if (sidebar) sidebar.style.display = '';
  // Default: pan mode (no tool active), markup canvas has pointer-events:none
  _setActiveTool(null);
}

function _updateSizeLabels() {
  var sizeVal = _tool === 'text' ? _fontSize : _lineWidth;
  var sv = document.getElementById('mk-size-val');
  if (sv) sv.textContent = sizeVal;
  var cv = document.getElementById('ctx-size-val');
  if (cv) cv.textContent = sizeVal;
  var ov = document.getElementById('mk-opacity-val');
  if (ov) ov.textContent = Math.round(_opacity * 100);
  var co = document.getElementById('ctx-opacity-val');
  if (co) co.textContent = Math.round(_opacity * 100);
}

function _updateColorSwatch() {
  var sw = document.getElementById('mk-color-swatch');
  if (sw) sw.style.background = _color;
  var cd = document.getElementById('ctx-color-dot');
  if (cd) cd.style.background = _color;
}

function _setActiveTool(tool) {
  if (_tool === 'polyline' && _polyPoints.length >= 2 && tool !== 'polyline') {
    _finishPolyline();
  }

  _tool = tool;
  _selectedIds = [];
  _rubberBand = null;
  _isDrawing = false;

  // Update sidebar button states
  var sidebar = document.getElementById('dv-sidebar-tools');
  if (sidebar) {
    sidebar.querySelectorAll('.tool-btn[data-mk-tool]').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-mk-tool') === tool);
    });
    // Highlight pen group button when a pen sub-tool is active
    var penGroupBtn = document.getElementById('mk-pen-btn');
    var penTools = ['pen', 'highlight', 'line', 'arrow', 'polyline'];
    if (penGroupBtn) penGroupBtn.classList.toggle('active', penTools.indexOf(tool) >= 0);
    // Highlight shapes group button when a shape sub-tool is active
    var shapesGroupBtn = document.getElementById('mk-shapes-btn');
    var shapeTools = ['rect', 'fillrect', 'circle', 'fillcircle', 'triangle', 'cloud'];
    if (shapesGroupBtn) shapesGroupBtn.classList.toggle('active', shapeTools.indexOf(tool) >= 0);
  }

  // Canvas mode
  var mc = _getCanvas();
  if (mc) {
    mc.classList.remove('drawing-active', 'select-active', 'text-mode');
    if (tool && tool !== 'select' && tool !== 'pin') {
      mc.classList.add('drawing-active');
      mc.style.pointerEvents = 'auto';
    } else if (tool === 'select') {
      mc.classList.add('select-active');
      mc.style.pointerEvents = 'auto';
    } else {
      mc.style.pointerEvents = 'none';
    }
  }

  // Canvas area cursor
  var area = document.getElementById('dv-canvas-area');
  if (area) {
    area.classList.remove('drawing', 'erasing', 'text-mode');
    if (tool === 'eraser') area.classList.add('erasing');
    else if (tool === 'text') area.classList.add('text-mode');
    else if (tool && tool !== 'select') area.classList.add('drawing');
  }

  if (_eraserCursor && tool !== 'eraser') _eraserCursor.style.display = 'none';

  // Update SIZE label to reflect tool (text size vs stroke width)
  _updateSizeLabels();

  // Show/hide copy button
  var copyBtn = document.getElementById('mk-copy-btn');
  if (copyBtn) copyBtn.style.display = (tool === 'select') ? '' : 'none';

  // Show/hide mobile context bar
  var ctx = document.getElementById('dv-mobile-context');
  if (ctx) ctx.style.display = (tool && tool !== 'pin') ? 'flex' : 'none';

  // Show/hide delete group
  var dg = document.getElementById('ctx-delete-group');
  if (dg) dg.style.display = (tool === 'select') ? '' : 'none';

  _updateSizeLabels();
  _updateColorSwatch();
  _renderAll();
}

// ── Submenu Positioning ─────────────────────────────────

function _positionSubmenu(menu, anchorBtn) {
  if (!menu || !anchorBtn) return;
  var rect = anchorBtn.getBoundingClientRect();
  var sidebar = document.getElementById('dv-sidebar-tools');
  // Check if sidebar is horizontal (mobile) or vertical (desktop)
  if (sidebar && sidebar.offsetWidth > sidebar.offsetHeight) {
    // Horizontal sidebar — position below button
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
  } else {
    // Vertical sidebar — position to the right
    menu.style.left = (rect.right + 4) + 'px';
    menu.style.top = rect.top + 'px';
  }
  // Keep on screen
  requestAnimationFrame(function() {
    var mr = menu.getBoundingClientRect();
    if (mr.right > window.innerWidth - 8) {
      menu.style.left = (window.innerWidth - mr.width - 8) + 'px';
    }
    if (mr.bottom > window.innerHeight - 8) {
      menu.style.top = (window.innerHeight - mr.height - 8) + 'px';
    }
  });
}

// ── Event Wiring ────────────────────────────────────────

function _wireEvents() {
  if (_eventsWired) return;
  _eventsWired = true;

  // Track last-used tool per group
  var _lastPenTool = 'pen';
  var _lastShapeTool = 'rect';
  var _penTools = ['pen', 'highlight', 'line', 'arrow', 'polyline'];
  var _shapeTools = ['rect', 'fillrect', 'circle', 'fillcircle', 'triangle', 'cloud'];

  // S81 fix: on mobile, sub-tool buttons in the pen/shapes submenus could
  // "close and click-through to the canvas" — the synthesized click event
  // sometimes landed on the underlying canvas because the submenu was torn
  // down before click fired. Handle submenu selection on touchstart directly
  // (runs BEFORE any click-synthesis delay) and preventDefault to block the
  // synthesized click entirely. Also stopPropagation on the submenu container
  // so pointer events don't bubble to document-level close-on-outside logic.
  function _activateToolFromSubBtn(btn){
    if (!btn) return;
    var tool = btn.getAttribute('data-mk-tool');
    // Close submenus & update main-button icon same way the click handler does
    var penSub = document.getElementById('pen-submenu');
    if (penSub && penSub.contains(btn)) {
      _lastPenTool = tool;
      var penMain = document.getElementById('mk-pen-btn');
      if (penMain) penMain.innerHTML = btn.innerHTML + '<span class="tool-group-arrow">\u25B8</span>';
      penSub.classList.remove('open');
    }
    var shapesSub = document.getElementById('shapes-submenu');
    if (shapesSub && shapesSub.contains(btn)) {
      _lastShapeTool = tool;
      var shMain = document.getElementById('mk-shapes-btn');
      if (shMain) shMain.innerHTML = btn.innerHTML + '<span class="tool-group-arrow">\u25B8</span>';
      shapesSub.classList.remove('open');
    }
    if (tool === _tool) _setActiveTool(null); else _setActiveTool(tool);
  }
  // S82: Module-level flag — touchend on sub-tool btn sets this to true;
  // the document-level click delegation below checks and clears it, skipping
  // the synthesized click that would otherwise toggle the tool back off.
  var _skipNextClick = false;
  var _subBtnHandledAt = 0; // timestamp of most recent sub-tool activation via pointerup
  // Debug panel already mounted at module-top (see _MK_VERSION banner)
  // S82 fix v3: Log EVERY pointer/touch/click event on submenu + sub-tool btns
  // so we can see exactly what Samsung is dispatching.
  ['pen-submenu','shapes-submenu'].forEach(function(subId){
    var sub = document.getElementById(subId);
    if (!sub) { if (window._mkDbg) window._mkDbg('MISSING '+subId); return; }
    sub.addEventListener('touchstart', function(e){
      if (window._mkDbg) window._mkDbg('touchstart '+subId+' tgt='+(e.target.tagName||'?'));
      e.stopPropagation();
    }, { passive: true });
    sub.addEventListener('pointerdown', function(e){
      if (window._mkDbg) window._mkDbg('pointerdown '+subId+' type='+e.pointerType);
      e.stopPropagation();
    });
    // Wire each sub-tool button individually
    var btns = sub.querySelectorAll('.tool-btn[data-mk-tool]');
    if (window._mkDbg) window._mkDbg(subId+': '+btns.length+' sub-btns wired');
    btns.forEach(function(btn){
      btn.addEventListener('pointerup', function(e){
        if (window._mkDbg) window._mkDbg('PU '+btn.getAttribute('data-mk-tool')+' t='+e.pointerType);
        e.preventDefault();
        e.stopPropagation();
        _skipNextClick = true;
        _subBtnHandledAt = Date.now();
        setTimeout(function(){ _skipNextClick = false; }, 600);
        _activateToolFromSubBtn(btn);
        if (window._mkDbg) window._mkDbg('  _tool='+_tool);
      });
      btn.addEventListener('pointercancel', function(e){
        if (window._mkDbg) window._mkDbg('pointercancel '+btn.getAttribute('data-mk-tool'));
      });
      btn.addEventListener('touchend', function(e){
        if (window._mkDbg) window._mkDbg('touchend-btn '+btn.getAttribute('data-mk-tool'));
      });
    });
  });

  // Sidebar tool clicks (delegated — still the mouse / desktop path)
  document.addEventListener('click', function(e) {
    var _dbgBtn = e.target && e.target.closest && e.target.closest('#dv-sidebar-tools .tool-btn[data-mk-tool]');
    if (window._mkDbg && _dbgBtn) window._mkDbg('click tool='+_dbgBtn.getAttribute('data-mk-tool')+' skip='+_skipNextClick+' dt='+(Date.now()-_subBtnHandledAt));
    // S82: if touchend on a sub-tool btn just fired, UNCONDITIONALLY skip the
    // very next click. Samsung-synthesized click target can differ from touch
    // target so we don't filter by closest() — just eat one click.
    if (_skipNextClick) {
      _skipNextClick = false;
      if (window._mkDbg) window._mkDbg('CLICK SKIPPED (flag)');
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    // S82 v2: time-based dedupe — if a sub-tool was activated via pointerup
    // within the last 600ms AND this click targets a sub-tool btn, skip it.
    if (_dbgBtn && (Date.now() - _subBtnHandledAt) < 600) {
      var subWrap = e.target.closest && e.target.closest('.tool-submenu');
      if (subWrap) {
        if (window._mkDbg) window._mkDbg('CLICK SKIPPED (dedupe)');
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }
    // Tool button in sidebar
    var btn = e.target.closest && e.target.closest('#dv-sidebar-tools .tool-btn[data-mk-tool]');
    if (btn) {
      var tool = btn.getAttribute('data-mk-tool');
      // If from pen submenu, update main button icon, remember, close menu
      var penSub = document.getElementById('pen-submenu');
      if (penSub && penSub.contains(btn)) {
        _lastPenTool = tool;
        var penMain = document.getElementById('mk-pen-btn');
        if (penMain) {
          penMain.innerHTML = btn.innerHTML + '<span class="tool-group-arrow">\u25B8</span>';
        }
        penSub.classList.remove('open');
      }
      // If from shapes submenu, update main button icon, remember, close menu
      var submenu = document.getElementById('shapes-submenu');
      if (submenu && submenu.contains(btn)) {
        _lastShapeTool = tool;
        var mainBtn = document.getElementById('mk-shapes-btn');
        if (mainBtn) {
          mainBtn.innerHTML = btn.innerHTML + '<span class="tool-group-arrow">\u25B8</span>';
        }
        submenu.classList.remove('open');
      }
      // Toggle: clicking active tool deactivates to pan mode
      if (tool === _tool) {
        _setActiveTool(null);
      } else {
        _setActiveTool(tool);
      }
      e.stopPropagation();
      return;
    }

    // Pen group button — single click opens submenu
    var penGroupBtn = e.target.closest && e.target.closest('#mk-pen-btn');
    if (penGroupBtn) {
      var penSm = document.getElementById('pen-submenu');
      if (penSm) {
        // Close shapes submenu if open
        var ss = document.getElementById('shapes-submenu');
        if (ss) ss.classList.remove('open');
        var isOpen = penSm.classList.contains('open');
        penSm.classList.toggle('open');
        if (!isOpen) _positionSubmenu(penSm, penGroupBtn);
      }
      e.stopPropagation();
      return;
    }

    // Shapes group button — single click opens submenu
    var shapesGroupBtn = e.target.closest && e.target.closest('#mk-shapes-btn');
    if (shapesGroupBtn) {
      var sm = document.getElementById('shapes-submenu');
      if (sm) {
        // Close pen submenu if open
        var ps = document.getElementById('pen-submenu');
        if (ps) ps.classList.remove('open');
        var isOpen = sm.classList.contains('open');
        sm.classList.toggle('open');
        if (!isOpen) _positionSubmenu(sm, shapesGroupBtn);
      }
      e.stopPropagation();
      return;
    }

    // Color dot click
    var colorDot = e.target.closest && e.target.closest('[data-mk-color]');
    if (colorDot) {
      _color = colorDot.getAttribute('data-mk-color');
      if (_selectedIds.length) {
        _selectedIds.forEach(function(id) {
          var obj = _findObj(id);
          if (obj) obj.color = _color;
        });
        _renderAll();
        _markDirty();
      }
      _updateColorSwatch();
      var csm = document.getElementById('color-submenu');
      if (csm) csm.classList.remove('open');
      e.stopPropagation();
      return;
    }

    // Color picker button — toggle color menu
    if (e.target.closest && (e.target.closest('#mk-color-btn') || e.target.closest('#ctx-color-dot'))) {
      var cm = document.getElementById('color-submenu');
      if (cm) {
        var isOpen = cm.classList.contains('open');
        cm.classList.toggle('open');
        if (!isOpen) _positionSubmenu(cm, e.target.closest('#mk-color-btn') || e.target.closest('#ctx-color-dot'));
      }
      e.stopPropagation();
      return;
    }

    // Context bar / sidebar step buttons
    var ctxBtn = e.target.closest && e.target.closest('[data-ctx]');
    if (ctxBtn) {
      var action = ctxBtn.getAttribute('data-ctx');
      // Prevent SIZE/OPAC clicks from blurring live text input
      var liveText = document.querySelector('.mk-text-input-live');
      if (liveText && (action === 'size-up' || action === 'size-down')) {
        // Adjust live text size without closing it
        if (action === 'size-up') _fontSize = Math.min(72, _fontSize + 2);
        else _fontSize = Math.max(8, _fontSize - 2);
        liveText.style.fontSize = _fontSize + 'px';
        _updateSizeLabels();
        e.stopPropagation();
        return;
      }
      if (action === 'size-up' || action === 'size-down') {
        var sizeDir = action === 'size-up' ? 1 : -1;
        if (_selectedIds.length) {
          // Modify selected objects' size/fontSize
          _selectedIds.forEach(function(id) {
            var obj = _findObj(id);
            if (!obj) return;
            if (obj.type === 'text') {
              obj.fontSize = Math.max(8, Math.min(72, (obj.fontSize || 20) + sizeDir * 2));
            } else {
              obj.size = Math.max(1, Math.min(30, (obj.size || 2) + sizeDir));
            }
          });
          _renderAll();
          _markDirty();
        } else if (_tool === 'text') {
          _fontSize = action === 'size-up' ? Math.min(72, _fontSize + 2) : Math.max(8, _fontSize - 2);
        } else {
          _lineWidth = action === 'size-up' ? Math.min(30, _lineWidth + 1) : Math.max(1, _lineWidth - 1);
        }
      }
      else if (action === 'opacity-up' || action === 'opacity-down') {
        var opDir = action === 'opacity-up' ? 0.1 : -0.1;
        if (_selectedIds.length) {
          _selectedIds.forEach(function(id) {
            var obj = _findObj(id);
            if (!obj) return;
            obj.opacity = Math.max(0.1, Math.min(1, (obj.opacity != null ? obj.opacity : 1) + opDir));
          });
          _renderAll();
          _markDirty();
        } else {
          _opacity = action === 'opacity-up' ? Math.min(1, _opacity + 0.1) : Math.max(0.1, _opacity - 0.1);
        }
      }
      else if (action === 'undo') { _undo(); return; }
      else if (action === 'redo') { _redo(); return; }
      else if (action === 'delete') {
        if (_selectedIds.length) {
          _objects = _objects.filter(function(o) { return _selectedIds.indexOf(o.id) === -1; });
          _selectedIds = [];
          _pushHistory();
          _renderAll();
          _markDirty();
        }
        return;
      }
      _updateSizeLabels();
      e.stopPropagation();
      return;
    }

    // Undo/redo buttons in sidebar
    if (e.target.closest && e.target.closest('#mk-undo')) { _undo(); e.stopPropagation(); return; }
    if (e.target.closest && e.target.closest('#mk-redo')) { _redo(); e.stopPropagation(); return; }

    // More menu
    if (e.target.closest && e.target.closest('#dv-more-btn')) {
      var mm = document.getElementById('dv-more-menu');
      if (mm) mm.style.display = mm.style.display === 'none' ? 'block' : 'none';
      e.stopPropagation();
      return;
    }
    var menuItem = e.target.closest && e.target.closest('[data-dv-action]');
    if (menuItem) {
      var act = menuItem.getAttribute('data-dv-action');
      var mmenu = document.getElementById('dv-more-menu');
      if (mmenu) mmenu.style.display = 'none';
      if (act === 'delete-all-markup') {
        showConfirm('Delete All Markup', 'Remove all markup on this drawing?').then(function(yes) {
          if (!yes) return;
          _objects = [];
          _pushHistory();
          _renderAll();
          _markDirty();
        });
      } else if (act === 'delete-all-pins') {
        _deleteAllPins();
      } else if (act === 'download') {
        _downloadDrawing();
      }
      e.stopPropagation();
      return;
    }

    // Zoom controls
    var zoomBtn = e.target.closest && e.target.closest('[data-zoom]');
    if (zoomBtn) {
      var z = zoomBtn.getAttribute('data-zoom');
      if (z === 'in' && window._frtZoomIn) window._frtZoomIn();
      else if (z === 'out' && window._frtZoomOut) window._frtZoomOut();
      else if (z === 'fit' && window._frtZoomFit) window._frtZoomFit();
      e.stopPropagation();
      return;
    }

    // Close menus on outside click
    if (!e.target.closest || !e.target.closest('.tool-submenu')) {
      var ps2 = document.getElementById('pen-submenu');
      if (ps2) ps2.classList.remove('open');
      var sm2 = document.getElementById('shapes-submenu');
      if (sm2) sm2.classList.remove('open');
      var cm2 = document.getElementById('color-submenu');
      if (cm2) cm2.classList.remove('open');
    }
    if (!e.target.closest || !e.target.closest('#dv-more-btn')) {
      var mm2 = document.getElementById('dv-more-menu');
      if (mm2) mm2.style.display = 'none';
    }
  });

  // Custom color picker
  document.addEventListener('input', function(e) {
    if (e.target.id === 'mk-custom-color') {
      _color = e.target.value;
      if (_selectedIds.length) {
        _selectedIds.forEach(function(id) {
          var obj = _findObj(id);
          if (obj) obj.color = _color;
        });
        _renderAll();
        _markDirty();
      }
      _updateColorSwatch();
      var csm = document.getElementById('color-submenu');
      if (csm) csm.classList.remove('open');
    }
  });

  // Prevent SIZE/OPAC mousedown from stealing focus from live text input
  document.addEventListener('mousedown', function(e) {
    var liveText = document.querySelector('.mk-text-input-live');
    if (!liveText) return;
    var ctxBtn = e.target.closest && e.target.closest('[data-ctx]');
    if (ctxBtn) {
      var act = ctxBtn.getAttribute('data-ctx');
      if (act === 'size-up' || act === 'size-down' || act === 'opacity-up' || act === 'opacity-down') {
        e.preventDefault(); // Prevents blur on the textarea
      }
    }
  });

  // Canvas mouse events
  var mc = _getCanvas();
  if (!mc) { console.warn('[Markup] No canvas found during event wiring!'); return; }
  console.log('[Markup] Wiring canvas events on element:', mc.id);

  mc.addEventListener('mousedown', function(e) {
    console.log('[Markup] Canvas mousedown — tool:', _tool);
    if (_tool === 'select') { _handleSelectDown(e); return; }
    _startDraw(e);
  });
  mc.addEventListener('mousemove', function(e) {
    _updateEraserCursor(e);
    if (_tool === 'select') { _handleSelectMove(e); return; }
    // Polyline rubber-band preview
    if (_tool === 'polyline' && _polyPoints.length >= 1 && !_isDrawing) {
      _drawPolylinePreview(e);
      return;
    }
    _moveDraw(e);
  });
  mc.addEventListener('mouseup', function(e) {
    if (_tool === 'select') { _handleSelectUp(); return; }
    _endDraw(e);
  });
  mc.addEventListener('mouseleave', function() {
    if (_eraserCursor) _eraserCursor.style.display = 'none';
    if (_isDrawing && _tool !== 'select') _endDraw({});
  });

  // Canvas touch events
  mc.addEventListener('touchstart', function(e) {
    // S81: if a 2nd finger lands during drawing, abort the current stroke so
    // pinch-zoom doesn't leave a stray scribble on the drawing.
    if (e.touches.length > 1) {
      if (_isDrawing) _endDraw({});
      return;
    }
    if (!_tool || _tool === 'pin') return;
    e.preventDefault();
    if (_tool === 'select') { _handleSelectDown(e); return; }
    _startDraw(e);
  }, { passive: false });

  mc.addEventListener('touchmove', function(e) {
    // S81: multi-touch = pinch — abort draw and let the two-finger pan/zoom
    // handler in viewer.js take over.
    if (e.touches.length > 1) {
      if (_isDrawing) _endDraw({});
      return;
    }
    if (!_tool || _tool === 'pin') return;
    e.preventDefault();
    if (_tool === 'select') { _handleSelectMove(e); return; }
    if (_tool === 'polyline' && _polyPoints.length >= 1 && !_isDrawing) {
      _drawPolylinePreview(e);
      return;
    }
    _moveDraw(e);
  }, { passive: false });

  mc.addEventListener('touchend', function(e) {
    if (!_tool || _tool === 'pin') return;
    if (_tool === 'select') { _handleSelectUp(); return; }
    _endDraw(e);
  });

  // Double-click: finishes polyline OR edits text object
  mc.addEventListener('dblclick', function(e) {
    if (_tool === 'polyline' && _polyPoints.length >= 2) {
      _finishPolyline();
      return;
    }
    // Double-click on text object with selector → edit it
    if (_tool === 'select') {
      var pos = _getPos(e);
      var hit = _hitTestObjects(pos);
      if (hit && hit.type === 'text') {
        _editTextObject(hit, e);
      }
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    var overlay = document.getElementById('drawing-viewer-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;

    if (e.key === 'Escape') {
      // If mid-stroke: cancel and discard
      if (_isDrawing) {
        _isDrawing = false;
        _penPoints = [];
        var ov = _getOverlay();
        if (ov) { ov.getContext('2d').clearRect(0, 0, ov.width, ov.height); ov.style.display = 'none'; }
        _renderAll();
        e.stopPropagation();
        return;
      }
      // If polyline in progress: finish it
      if (_tool === 'polyline' && _polyPoints.length >= 2) { _finishPolyline(); e.stopPropagation(); return; }
      // If objects selected: clear selection first
      if (_selectedIds.length) {
        _selectedIds = [];
        _rubberBand = null;
        _renderAll();
        e.stopPropagation();
        return;
      }
      // If any tool active: deselect → back to pan mode
      if (_tool) {
        _setActiveTool(null);
        e.stopPropagation();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (_undoStack.length) { e.preventDefault(); _undo(); return; }
      // Fall through to project-level undo
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      if (_redoStack.length) { e.preventDefault(); _redo(); return; }
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && _selectedIds.length && _tool === 'select') {
      _objects = _objects.filter(function(o) { return _selectedIds.indexOf(o.id) === -1; });
      _selectedIds = [];
      _pushHistory();
      _renderAll();
      _markDirty();
      e.preventDefault();
    }
  });

  // Prevent sidebar touch events from propagating to pan/zoom
  var sidebar = document.getElementById('dv-sidebar-tools');
  if (sidebar) {
    sidebar.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: false });
    sidebar.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: false });
    sidebar.addEventListener('touchend', function(e) { e.stopPropagation(); }, { passive: false });

    // Tooltip on hover
    var tooltip = document.createElement('div');
    tooltip.id = 'dv-tool-tooltip';
    tooltip.style.cssText = 'display:none;position:fixed;background:rgba(30,32,40,.92);color:#fff;font-size:11px;font-family:Calibri,sans-serif;padding:4px 10px;border-radius:6px;pointer-events:none;z-index:9999;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4);';
    document.body.appendChild(tooltip);
    sidebar.addEventListener('mouseover', function(e) {
      var btn = e.target.closest && e.target.closest('[data-tip]');
      if (btn) {
        var tip = btn.getAttribute('data-tip');
        tooltip.textContent = tip;
        tooltip.style.display = 'block';
        var r = btn.getBoundingClientRect();
        tooltip.style.left = (r.right + 8) + 'px';
        tooltip.style.top = (r.top + r.height / 2 - 12) + 'px';
      }
    });
    sidebar.addEventListener('mouseout', function(e) {
      if (e.target.closest && e.target.closest('[data-tip]')) {
        tooltip.style.display = 'none';
      }
    });
  }
  var ctxBar = document.getElementById('dv-mobile-context');
  if (ctxBar) {
    ctxBar.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: false });
    ctxBar.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: false });
    ctxBar.addEventListener('touchend', function(e) { e.stopPropagation(); }, { passive: false });
  }
  var zoomCtrl = document.getElementById('zoom-controls');
  if (zoomCtrl) {
    zoomCtrl.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: false });
    zoomCtrl.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: false });
    zoomCtrl.addEventListener('touchend', function(e) { e.stopPropagation(); }, { passive: false });
  }
}

// ── More Menu Actions ───────────────────────────────────

function _deleteAllPins() {
  showConfirm('Delete All Pins', 'Remove all pins from this drawing?').then(function(yes) {
    if (!yes) return;
    if (_drawingId == null) return;
    var allDefics = Model.getAllDeficiencies();
    var count = 0;
    allDefics.forEach(function(d) {
      if (d.defic.drawingId === _drawingId) {
        d.defic.drawingId = null; d.defic.pinX = null; d.defic.pinY = null; count++;
      }
    });
    if (count > 0) {
      Model.saveNow();
      var layer = document.getElementById('dv-pins-layer');
      if (layer) layer.innerHTML = '';
      console.log('[Markup] Deleted ' + count + ' pins from drawing ' + _drawingId);
    }
  });
}

function _downloadDrawing() {
  var img = document.getElementById('dv-image');
  if (!img || !img.src) return;
  var a = document.createElement('a');
  a.href = img.src;
  var drawings = Model.getDrawings();
  var d = null;
  for (var i = 0; i < drawings.length; i++) {
    if (drawings[i].id === _drawingId) { d = drawings[i]; break; }
  }
  a.download = (d && d.name) ? d.name : 'drawing';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Public API ──────────────────────────────────────────

export var Markup = {
  init: function(drawingId) {
    _drawingId = drawingId;
    _tool = null;
    _isDrawing = false;
    _dirty = false;
    _lastRenderScale = -1;  // force first setRenderScale call to apply

    _allocateCanvas();
    _buildToolbar();
    _wireEvents();
    _loadMarkup(drawingId);
    // Default to pan mode (no tool active)
    _setActiveTool(null);

    console.log('[Markup] Initialized for drawing:', drawingId);
  },

  destroy: function() {
    if (_dirty && _drawingId) _saveMarkup();

    _drawingId = null;
    _objects = [];
    _undoStack = [];
    _redoStack = [];
    _selectedIds = [];
    _rubberBand = null;
    _isDrawing = false;
    _tool = null;

    var mc = _getCanvas();
    if (mc) {
      mc.style.pointerEvents = 'none';
      mc.classList.remove('drawing-active', 'select-active', 'text-mode');
      var ctx = mc.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, mc.width, mc.height);
    }

    var ov = _getOverlay();
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);

    // Tear down WebGL renderer + canvas (Phase 5)
    if (window.WebGLMarkupRenderer && _webglReady){
      try { window.WebGLMarkupRenderer.destroy(); } catch(_){}
    }
    if (_webglCanvas && _webglCanvas.parentNode){
      _webglCanvas.parentNode.removeChild(_webglCanvas);
    }
    _webglCanvas = null;
    _webglReady = false;
    _webglInitPromise = null;

    if (_eraserCursor) _eraserCursor.style.display = 'none';

    // Hide mobile context bar
    var ctxBar = document.getElementById('dv-mobile-context');
    if (ctxBar) ctxBar.style.display = 'none';

    console.log('[Markup] Destroyed');
  },

  saveNow: function() {
    if (_drawingId) _saveMarkup();
  },

  getObjects: function() { return _objects; },
  setTool: function(tool) { _setActiveTool(tool); },
  getTool: function() { return _tool; },
  renderAll: function() { _renderAll(); },
  // S113 Push 13: viewer-zoom-aware render resolution. Called from viewer.js
  // _applyTransform on every zoom change. Resizes canvas internal pixels
  // to match displayed pixels (capped at memory budget), then re-renders.
  // No-op if scale unchanged. Synchronous — fast enough not to need debounce
  // for normal zoom interactions (wheel-zoom + pinch-zoom).
  setRenderScale: function(s) {
    var prevScale = _lastRenderScale;
    _resizeMarkupForScale(s);
    // Only re-render if resize actually changed dimensions (early-return
    // inside _resizeMarkupForScale leaves _lastRenderScale untouched).
    if (_lastRenderScale !== prevScale) _renderAll();
  },
  isActive: function() { return _tool && _tool !== 'pin'; }
};

export var initMarkup = Markup;




