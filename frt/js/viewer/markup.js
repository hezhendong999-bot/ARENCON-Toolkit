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
      // Selection handles drawn as group below
    });
  }

  // Draw grouped selection box around all selected items
  if (_selectedIds.length) {
    _drawGroupedSelection(ctx);
  }

  // Draw rubber-band selection rectangle if active
  if (_rubberBand) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#2196F3';
    ctx.fillStyle = 'rgba(33,150,243,.08)';
    ctx.lineWidth = 1;
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
    // Apply rotation if present
    if (obj.rotation) {
      var tcx = obj.x1, tcy = obj.y1 - (obj.fontSize || 20) / 2;
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
    return { x1: obj.x1, y1: obj.y1 - fs, x2: obj.x1 + estW, y2: obj.y1 + 4 };
  }
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

  // Sidebar tool clicks (delegated)
  document.addEventListener('click', function(e) {
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
    if (!_tool || _tool === 'pin') return;
    e.preventDefault();
    if (_tool === 'select') { _handleSelectDown(e); return; }
    _startDraw(e);
  }, { passive: false });

  mc.addEventListener('touchmove', function(e) {
    if (e.touches.length > 1) return;
    if (!_tool || _tool === 'pin') return;
    e.preventDefault();
    if (_tool === 'select') { _handleSelectMove(e); return; }
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
  isActive: function() { return _tool && _tool !== 'pin'; }
};

export var initMarkup = Markup;
