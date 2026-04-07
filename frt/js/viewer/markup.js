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

// ── State ───────────────────────────────────────────────
var _drawingId = null;
var _objects = [];
var _undoStack = [];
var _redoStack = [];
var _maxUndo = 40;
var _selectedId = null;
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
function _getToolbar() { return document.getElementById('mk-toolbar'); }

// ── Canvas Allocation ───────────────────────────────────

function _allocateCanvas() {
  var mc = _getCanvas();
  var img = document.getElementById('dv-image');
  if (!mc || !img || !img.naturalWidth) return;

  var drawW = img.naturalWidth;
  var drawH = img.naturalHeight;

  var ua = navigator.userAgent;
  var isIPhone = /iPhone|iPod/.test(ua);
  var isAndroidTablet = /Android/.test(ua) && (!/Mobile/.test(ua) || /SM-T|SM-X|Tablet/.test(ua));
  var isTablet = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || isAndroidTablet;
  var maxPixels = isIPhone ? 16000000 : (isAndroidTablet ? 10000000 : (isTablet ? 16000000 : 25000000));
  var totalPixels = drawW * drawH;
  var mkScale = 1;
  if (totalPixels > maxPixels) mkScale = Math.sqrt(maxPixels / totalPixels);

  var cw = Math.round(drawW * mkScale);
  var ch = Math.round(drawH * mkScale);

  mc.width = cw;
  mc.height = ch;
  mc.style.width = drawW + 'px';
  mc.style.height = drawH + 'px';
  mc._dpr = mkScale;
  mc._logicalW = drawW;
  mc._logicalH = drawH;

  var ctx = mc.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  console.log('[Markup] Canvas: logical ' + drawW + '×' + drawH +
    ', buffer ' + cw + '×' + ch + ' (dpr=' + mkScale.toFixed(3) +
    ', ' + Math.round(cw * ch / 1000000) + 'M px)');
}

function _ensureOverlay() {
  var mc = _getCanvas();
  if (!mc) return null;
  var ov = _getOverlay();
  if (!ov) {
    ov = document.createElement('canvas');
    ov.id = 'markup-overlay';
    ov.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;display:none;';
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
  _selectedId = null;
  _renderAll();
  _markDirty();
  _updateUndoButtons();
}

function _redo() {
  if (!_redoStack.length) return;
  _undoStack.push(JSON.stringify(_objects));
  _objects = JSON.parse(_redoStack.pop());
  _selectedId = null;
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
      hx.clearRect(0, 0, _hlCanvas.width, _hlCanvas.height);
      hx.setTransform(dpr, 0, 0, dpr, 0, 0);
      grp.objs.forEach(function(obj) {
        if (!obj.points || obj.points.length < 2) return;
        hx.strokeStyle = obj.color || '#F1C40F';
        hx.lineWidth = (obj.size || 2) * 4;
        hx.lineCap = 'round';
        hx.lineJoin = 'round';
        hx.globalAlpha = 1;
        hx.globalCompositeOperation = 'source-over';
        hx.beginPath();
        hx.moveTo(obj.points[0].x, obj.points[0].y);
        for (var i = 1; i < obj.points.length; i++) hx.lineTo(obj.points[i].x, obj.points[i].y);
        hx.stroke();
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
      if (obj.id === _selectedId) _drawSelectionHandles(ctx, obj);
    });
  }

  if (_selectedId) {
    var sel = _findObj(_selectedId);
    if (sel && sel.type !== 'highlight') _drawSelectionHandles(ctx, sel);
  }
}

function _drawObject(ctx, obj) {
  ctx.save();
  ctx.globalAlpha = obj.opacity || 1;
  ctx.strokeStyle = obj.color || '#C0392B';
  ctx.fillStyle = obj.color || '#C0392B';
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

function _drawSelectionHandles(ctx, obj) {
  var b = _getBounds(obj);
  if (!b) return;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 1;
  ctx.strokeRect(b.x1 - 4, b.y1 - 4, b.x2 - b.x1 + 8, b.y2 - b.y1 + 8);
  ctx.setLineDash([]);
  var hs = 6;
  ctx.fillStyle = '#2196F3';
  [[b.x1, b.y1], [b.x2, b.y1], [b.x1, b.y2], [b.x2, b.y2]].forEach(function(p) {
    ctx.fillRect(p[0] - hs / 2 - 4, p[1] - hs / 2 - 4, hs, hs);
  });
  ctx.restore();
}

function _getBounds(obj) {
  if (obj.points && obj.points.length) {
    var xs = obj.points.map(function(p) { return p.x; });
    var ys = obj.points.map(function(p) { return p.y; });
    return { x1: Math.min.apply(null, xs), y1: Math.min.apply(null, ys), x2: Math.max.apply(null, xs), y2: Math.max.apply(null, ys) };
  }
  if (obj.x1 != null && obj.x2 != null) {
    return { x1: Math.min(obj.x1, obj.x2), y1: Math.min(obj.y1, obj.y2), x2: Math.max(obj.x1, obj.x2), y2: Math.max(obj.y1, obj.y2) };
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
      ctx.strokeStyle = _tool === 'eraser' ? '#C0392B' : _color;
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

  var ov = _getOverlay();
  if (ov) {
    ov.style.display = 'none';
    var c = ov.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ov.width, ov.height);
  }

  var type = _tool;
  if (type === 'pen' || type === 'highlight' || type === 'eraser') {
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
  var text = prompt('Enter text:');
  if (!text || !text.trim()) return;
  _objects.push({
    id: _newId(), type: 'text', text: text.trim(),
    x1: pos.x, y1: pos.y,
    color: _color, fontSize: _fontSize, bold: false, opacity: _opacity
  });
  _pushHistory();
  _renderAll();
  _markDirty();
}

// ── Polyline Tool ───────────────────────────────────────

function _handlePolylineClick(e) {
  var pos = _getPos(e);
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

// ── Select Tool ─────────────────────────────────────────

var _dragState = null;

function _handleSelectDown(e) {
  if (_tool !== 'select') return;
  var pos = _getPos(e);
  var hit = null;
  for (var i = _objects.length - 1; i >= 0; i--) {
    var b = _getBounds(_objects[i]);
    if (b && pos.x >= b.x1 - 6 && pos.x <= b.x2 + 6 && pos.y >= b.y1 - 6 && pos.y <= b.y2 + 6) {
      hit = _objects[i];
      break;
    }
  }
  if (hit) {
    _selectedId = hit.id;
    _dragState = { id: hit.id, startX: pos.x, startY: pos.y, moved: false };
    _renderAll();
  } else {
    _selectedId = null;
    _dragState = null;
    _renderAll();
  }
}

function _handleSelectMove(e) {
  if (!_dragState) return;
  var pos = _getPos(e);
  var dx = pos.x - _dragState.startX;
  var dy = pos.y - _dragState.startY;
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && !_dragState.moved) return;
  _dragState.moved = true;

  var obj = _findObj(_dragState.id);
  if (!obj) return;

  if (obj.points) {
    obj.points.forEach(function(p) { p.x += dx; p.y += dy; });
  }
  if (obj.x1 != null) { obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy; }

  _dragState.startX = pos.x;
  _dragState.startY = pos.y;
  _renderAll();
}

function _handleSelectUp() {
  if (!_dragState) return;
  if (_dragState.moved) {
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
    _eraserCursor.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #C0392B;border-radius:50%;z-index:2600;display:none;box-shadow:0 0 4px rgba(0,0,0,.3);';
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
  _selectedId = null;

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
  var existing = _getToolbar();
  if (existing) { existing.style.display = 'flex'; return; }

  var bar = document.createElement('div');
  bar.id = 'mk-toolbar';
  bar.className = 'mk-toolbar';

  bar.innerHTML =
    '<div class="mk-tools-row">' +
      '<button class="mk-btn" data-mk-tool="pen" title="Pen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>' +
      '<button class="mk-btn" data-mk-tool="highlight" title="Highlighter"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg></button>' +
      '<button class="mk-btn" data-mk-tool="text" title="Text"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg></button>' +
      '<div class="mk-shape-wrap">' +
        '<button class="mk-btn" id="mk-shape-main" data-mk-tool="rect" title="Shapes"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></button>' +
        '<button class="mk-btn mk-shape-expand" id="mk-shape-expand" title="More shapes">\u25BE</button>' +
        '<div class="mk-shape-menu" id="mk-shape-menu">' +
          '<button class="mk-btn" data-mk-tool="rect" title="Rectangle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></button>' +
          '<button class="mk-btn" data-mk-tool="fillrect" title="Filled Rect"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></button>' +
          '<button class="mk-btn" data-mk-tool="circle" title="Circle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg></button>' +
          '<button class="mk-btn" data-mk-tool="fillcircle" title="Filled Circle"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg></button>' +
          '<button class="mk-btn" data-mk-tool="arrow" title="Arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>' +
          '<button class="mk-btn" data-mk-tool="line" title="Line"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 20 4"/></svg></button>' +
          '<button class="mk-btn" data-mk-tool="triangle" title="Triangle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3L22 21H2z"/></svg></button>' +
          '<button class="mk-btn" data-mk-tool="cloud" title="Cloud"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19a4.5 4.5 0 1 0 0-9h-.1A5.5 5.5 0 0 0 7 13.5 3.5 3.5 0 0 0 3.5 17 3.5 3.5 0 0 0 7 20.5h10.5"/></svg></button>' +
          '<button class="mk-btn" data-mk-tool="polyline" title="Polyline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,20 8,8 14,14 19,4"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<button class="mk-btn" data-mk-tool="eraser" title="Eraser"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/></svg></button>' +
      '<button class="mk-btn" data-mk-tool="select" title="Select"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg></button>' +
      '<span class="mk-sep"></span>' +
      '<input type="color" id="mk-color" value="#C0392B" title="Color" class="mk-color-input">' +
      '<span class="mk-sep"></span>' +
      '<button class="mk-btn mk-step" id="mk-size-down" title="Thinner">\u2212</button>' +
      '<span class="mk-size-label" id="mk-size-label">3</span>' +
      '<button class="mk-btn mk-step" id="mk-size-up" title="Thicker">+</button>' +
      '<span class="mk-sep mk-font-sep"></span>' +
      '<span class="mk-lbl" style="display:none;">Font:</span>' +
      '<button class="mk-btn mk-step" id="mk-font-down" title="Smaller font" style="display:none;">\u2212</button>' +
      '<span class="mk-size-label" id="mk-font-label" style="display:none;">20</span>' +
      '<button class="mk-btn mk-step" id="mk-font-up" title="Larger font" style="display:none;">+</button>' +
      '<span class="mk-sep"></span>' +
      '<button class="mk-btn" id="mk-undo" title="Undo (Ctrl+Z)" style="opacity:0.3;">\u21A9</button>' +
      '<button class="mk-btn" id="mk-redo" title="Redo (Ctrl+Y)" style="opacity:0.3;">\u21AA</button>' +
      '<span class="mk-sep"></span>' +
      '<button class="mk-btn mk-del" id="mk-delete" title="Delete selected" style="display:none;">\uD83D\uDDD1</button>' +
    '</div>';

  // Insert after dv-toolbar
  var dvToolbar = document.getElementById('dv-toolbar');
  if (dvToolbar && dvToolbar.parentNode) {
    dvToolbar.parentNode.insertBefore(bar, dvToolbar.nextSibling);
  }
}

function _setActiveTool(tool) {
  if (_tool === 'polyline' && _polyPoints.length >= 2 && tool !== 'polyline') {
    _finishPolyline();
  }

  _tool = tool;
  _selectedId = null;
  _isDrawing = false;

  var bar = _getToolbar();
  if (bar) {
    bar.querySelectorAll('.mk-btn[data-mk-tool]').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-mk-tool') === tool);
    });
  }

  var mc = _getCanvas();
  if (mc) {
    mc.classList.remove('drawing-active', 'select-active', 'text-mode');
    if (tool && tool !== 'select') {
      mc.classList.add('drawing-active');
      mc.style.pointerEvents = 'auto';
    } else if (tool === 'select') {
      mc.classList.add('select-active');
      mc.style.pointerEvents = 'auto';
    } else {
      mc.style.pointerEvents = 'none';
    }
  }

  var area = document.getElementById('dv-canvas-area');
  if (area) {
    area.classList.remove('drawing', 'erasing', 'text-mode');
    if (tool === 'eraser') area.classList.add('erasing');
    else if (tool === 'text') area.classList.add('text-mode');
    else if (tool && tool !== 'select') area.classList.add('drawing');
  }

  if (_eraserCursor && tool !== 'eraser') _eraserCursor.style.display = 'none';

  // Show/hide font controls
  var showFont = (tool === 'text');
  ['mk-font-down', 'mk-font-up', 'mk-font-label'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = showFont ? '' : 'none';
  });
  if (bar) {
    var lbl = bar.querySelector('.mk-lbl');
    if (lbl) lbl.style.display = showFont ? '' : 'none';
    var fsep = bar.querySelector('.mk-font-sep');
    if (fsep) fsep.style.display = showFont ? '' : 'none';
  }

  // Show/hide delete button
  var delBtn = document.getElementById('mk-delete');
  if (delBtn) delBtn.style.display = (tool === 'select') ? '' : 'none';

  _renderAll();
}

// ── Event Wiring ────────────────────────────────────────

function _wireEvents() {
  if (_eventsWired) return;
  _eventsWired = true;

  // Toolbar clicks (delegated on document)
  document.addEventListener('click', function(e) {
    // Only handle if inside mk-toolbar
    var toolbar = e.target.closest && e.target.closest('#mk-toolbar');
    if (!toolbar) {
      // Close shape menu on outside click
      if (!e.target.closest || !e.target.closest('.mk-shape-wrap')) {
        var m2 = document.getElementById('mk-shape-menu');
        if (m2) m2.classList.remove('open');
      }
      return;
    }

    var btn = e.target.closest('[data-mk-tool]');
    if (btn) {
      var tool = btn.getAttribute('data-mk-tool');
      var menu = document.getElementById('mk-shape-menu');
      if (menu && menu.contains(btn)) {
        var main = document.getElementById('mk-shape-main');
        if (main) {
          main.setAttribute('data-mk-tool', tool);
          main.innerHTML = btn.innerHTML;
          main.title = btn.title;
        }
        menu.classList.remove('open');
      }
      _setActiveTool(tool);
      e.stopPropagation();
      return;
    }

    if (e.target.closest('#mk-shape-expand')) {
      var m = document.getElementById('mk-shape-menu');
      if (m) m.classList.toggle('open');
      e.stopPropagation();
      return;
    }

    if (e.target.closest('#mk-undo')) { _undo(); e.stopPropagation(); return; }
    if (e.target.closest('#mk-redo')) { _redo(); e.stopPropagation(); return; }
    if (e.target.closest('#mk-size-down')) {
      _lineWidth = Math.max(1, _lineWidth - 1);
      var sl = document.getElementById('mk-size-label');
      if (sl) sl.textContent = _lineWidth;
      e.stopPropagation();
      return;
    }
    if (e.target.closest('#mk-size-up')) {
      _lineWidth = Math.min(20, _lineWidth + 1);
      var sl2 = document.getElementById('mk-size-label');
      if (sl2) sl2.textContent = _lineWidth;
      e.stopPropagation();
      return;
    }
    if (e.target.closest('#mk-font-down')) {
      _fontSize = Math.max(8, _fontSize - 2);
      var fl = document.getElementById('mk-font-label');
      if (fl) fl.textContent = _fontSize;
      e.stopPropagation();
      return;
    }
    if (e.target.closest('#mk-font-up')) {
      _fontSize = Math.min(72, _fontSize + 2);
      var fl2 = document.getElementById('mk-font-label');
      if (fl2) fl2.textContent = _fontSize;
      e.stopPropagation();
      return;
    }
    if (e.target.closest('#mk-delete')) {
      if (_selectedId) {
        _objects = _objects.filter(function(o) { return o.id !== _selectedId; });
        _selectedId = null;
        _pushHistory();
        _renderAll();
        _markDirty();
      }
      e.stopPropagation();
      return;
    }
  });

  // Color picker
  document.addEventListener('input', function(e) {
    if (e.target.id === 'mk-color') _color = e.target.value;
  });

  // Canvas mouse events
  var mc = _getCanvas();
  if (!mc) return;

  mc.addEventListener('mousedown', function(e) {
    if (_tool === 'select') { _handleSelectDown(e); return; }
    _startDraw(e);
  });
  mc.addEventListener('mousemove', function(e) {
    _updateEraserCursor(e);
    if (_tool === 'select') { _handleSelectMove(e); return; }
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
    if (e.touches.length > 1) return;
    if (!_tool) return;
    e.preventDefault();
    if (_tool === 'select') { _handleSelectDown(e); return; }
    _startDraw(e);
  }, { passive: false });

  mc.addEventListener('touchmove', function(e) {
    if (e.touches.length > 1) return;
    if (!_tool) return;
    e.preventDefault();
    if (_tool === 'select') { _handleSelectMove(e); return; }
    _moveDraw(e);
  }, { passive: false });

  mc.addEventListener('touchend', function(e) {
    if (!_tool) return;
    if (_tool === 'select') { _handleSelectUp(); return; }
    _endDraw(e);
  });

  // Double-click finishes polyline
  mc.addEventListener('dblclick', function() {
    if (_tool === 'polyline' && _polyPoints.length >= 2) {
      _finishPolyline();
    }
  });

  // Keyboard shortcuts (Escape, Ctrl+Z, Delete)
  document.addEventListener('keydown', function(e) {
    var overlay = document.getElementById('drawing-viewer-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;

    // Escape: cancel active tool, NOT close viewer
    if (e.key === 'Escape') {
      if (_tool === 'polyline' && _polyPoints.length >= 2) { _finishPolyline(); e.stopPropagation(); return; }
      if (_tool) {
        _setActiveTool(null);
        e.stopPropagation();
        return;
      }
    }

    // Ctrl+Z / Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); _undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); _redo(); return; }

    // Delete selected
    if ((e.key === 'Delete' || e.key === 'Backspace') && _selectedId && _tool === 'select') {
      _objects = _objects.filter(function(o) { return o.id !== _selectedId; });
      _selectedId = null;
      _pushHistory();
      _renderAll();
      _markDirty();
      e.preventDefault();
    }
  });

  // Prevent toolbar touch events from propagating to pan/zoom
  var mkToolbar = _getToolbar();
  if (mkToolbar) {
    mkToolbar.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: false });
    mkToolbar.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: false });
    mkToolbar.addEventListener('touchend', function(e) { e.stopPropagation(); }, { passive: false });
  }
}

// ── Public API ──────────────────────────────────────────

export var Markup = {
  init: function(drawingId) {
    _drawingId = drawingId;
    _tool = null;
    _isDrawing = false;
    _dirty = false;

    _allocateCanvas();
    _buildToolbar();
    _wireEvents();
    _loadMarkup(drawingId);

    console.log('[Markup] Initialized for drawing:', drawingId);
  },

  destroy: function() {
    if (_dirty && _drawingId) _saveMarkup();

    _drawingId = null;
    _objects = [];
    _undoStack = [];
    _redoStack = [];
    _selectedId = null;
    _isDrawing = false;
    _tool = null;

    var bar = _getToolbar();
    if (bar) bar.style.display = 'none';

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

    if (_eraserCursor) _eraserCursor.style.display = 'none';

    console.log('[Markup] Destroyed');
  },

  saveNow: function() {
    if (_drawingId) _saveMarkup();
  },

  getObjects: function() { return _objects; },
  setTool: function(tool) { _setActiveTool(tool); },
  renderAll: function() { _renderAll(); },
  isActive: function() { return !!_tool; }
};

export var initMarkup = Markup;
