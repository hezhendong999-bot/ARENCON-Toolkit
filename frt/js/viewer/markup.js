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
 *   - Canvas budget by device class — see deviceMaxPixels():
 *       phone 8 MP / Android field tablet 12 MP / desktop 30 MP
 *   - NEVER auto-select after drawing — tool stays active
 *   - NEVER use OffscreenCanvas (no Safari/iOS)
 *   - Eraser uses destination-out composite
 */

import { Model } from '../data/model.js';
import { IDB } from '../data/idb.js';
import { R2 } from '../data/r2.js';
import { showConfirm } from '../shared/dialogs.js';
import { TiledPdf } from './tiledPdf.js';
import { Diag } from '../diag/memory.js';
import { deviceClass, deviceMaxPixels } from '../shared/deviceBudget.js';

// S82 diagnostic removed — bug was CSS pointer-events:none on mobile sidebar
// parent leaking to open submenus. Fixed in frt.css ~line 2242.

// ── State ───────────────────────────────────────────────
var _drawingId = null;
var _objects = [];
// S129 Item 1.1 — Tombstones: ids of strokes the user has erased. Propagated
// to R2 via uploadMarkup so other inspectors see the deletion and so the
// stroke doesn't get resurrected by the cloud-merge step. Restored from R2
// on load so erases survive reload. Reset only on destroy().
// S133 — Each tombstone is now {id, t} where `t` is the ms-epoch creation
// time. r2.js _mergeMarkupObjects prunes tombstones older than its TTL
// (default 180 days) during the cloud merge — so storage growth is bounded
// without losing the cross-device resurrection-block within the safety
// window. Legacy plain-string entries are accepted on load and upgraded.
var _tombstones = [];
var _undoStack = [];
var _redoStack = [];
var _maxUndo = 40;
var _selectedIds = [];
var _penPoints = [];
var _polyPoints = [];
var _isDrawing = false;
var _dirty = false;

// S126 #5 — Click-to-draw state. When the user activates a shape tool and
// makes the first click, _clickFirstPt holds {x, y}. The next click commits
// the shape from _clickFirstPt to current cursor. Cleared on Esc, tool
// switch, pinch-zoom, or commit. Cursor moves between clicks (mouse only)
// update a live preview on the overlay canvas.
var _clickFirstPt = null;

// S126 #6 — Dimension vertex-edit state. When user taps a committed
// dimension while NOT in select tool, _dimVertexEditId holds the obj id;
// next two endpoint-area positions become draggable handles. Drag start
// sets _dimVertexDragHandle to 0 (A) or 1 (B); cleared on mouseup.
var _dimVertexEditId = null;
var _dimVertexDragHandle = null;

// S126 #6 — Dimension calibrate mode. Activated by the Calibrate button on
// the dimension sub-toolbar. While true, the next two clicks lay the
// calibration points and open the showCalibrationPrompt modal. Once the
// user saves, the entire dimension list is recalibrated.
var _dimCalibrateMode = false;
var _dimCalibrateP1 = null;

// S126 #7 — Text decoration defaults. New text boxes created via the text
// tool pick up these flags; existing text boxes are toggled via the
// context-bar buttons. Both default to false (the S126 design intent is
// transparent text by default).
var _textBorderDefault = false;
var _textHatchDefault = false;

var _tool = null;
var _color = '#A85959';
var _lineWidth = 3;
var _fontSize = 20;
var _opacity = 1;

var _eventsWired = false;
var _hlCanvas = null;
var _objCanvas = null;  // reusable per-object offscreen buffer for mask application

// ── S183a: PINCH-GESTURE DEFER STATE ────────────────────────────────────
// Per S182 instrumentation, _resizeMarkupForScale + _renderAll spikes to
// 200-600 ms per call during pinch (top samples ON run: ms_ms = 595, 483,
// 365, 255, 208ms). Cause: every touchmove during pinch changes scale,
// every scale change triggers a backing-buffer reallocation + redraw of
// all markup objects.
//
// Fix: during an active multi-touch gesture, defer the backing-buffer
// resize entirely. The canvas's CSS box is unchanged (markup.js doesn't
// touch style.width/height in _resizeMarkupForScale — comment at line 577);
// dv-img-wrap's transform already CSS-scales the canvas. The visual
// effect during pinch: markup may look mildly fuzzier (rendering at the
// pre-pinch backing resolution scaled by CSS), then snaps crisp on
// touchend when the deferred resize fires.
//
// Viewer calls setGestureActive(true) on 2-finger touchstart and
// setGestureActive(false) on the last touchend. The false transition
// applies the most recent pending scale exactly once.
var _gestureActive = false;
var _pendingScale = null;
// ────────────────────────────────────────────────────────────────────────

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

// ── Device-class canvas budget (S131 priority #1) ───────
// markup canvas budget logic now lives in ../shared/deviceBudget.js as the
// single source of truth, shared with tiledPdf.js — see deviceClass() /
// deviceMaxPixels() imported at the top of this module. Extracted because
// the budget was duplicated in two markup sites + the tiledPdf level canvas
// with the same flawed 2-tier classifier; the duplication was the root
// cause of the 2026-05-14 field crash.

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

// S126 #5 — Tools that use the two-click pattern (replaces click-and-hold
// drag). Stroke tools (pen / highlight / eraser) stay drag-based because the
// stroke path itself is what gets recorded. Polyline already uses clicks.
// Text places at the click point. Dimension is excluded from this list
// because S126 #6 gives it its own three-click chain controller.
function _isClickToDrawShape(t) {
  return t === 'line' || t === 'arrow'
      || t === 'rect' || t === 'fillrect'
      || t === 'circle' || t === 'fillcircle'
      || t === 'triangle' || t === 'cloud';
}

// S126 #5 — Tear down click-to-draw state and clear the overlay preview.
// Called on Esc, tool-switch, pinch-zoom-start, and after a successful commit.
function _cancelClickToDraw() {
  if (!_clickFirstPt) return;
  _clickFirstPt = null;
  var ov = _getOverlay();
  if (ov) {
    ov.style.display = 'none';
    var c = ov.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ov.width, ov.height);
  }
  if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()) {
    TiledPdf.resume();
    TiledPdf.scheduleRender();
  }
}

// S126 #6 — Resolve the currently-displayed drawing object. The viewer
// owns the active-drawing pointer; we just dereference it.
function _getCurrentDrawing() {
  try {
    var Viewer = (window._frt && window._frt.initViewer) || null;
    if (Viewer && typeof Viewer.getCurrentDrawing === 'function') {
      return Viewer.getCurrentDrawing();
    }
  } catch (e) {}
  return null;
}

// S126 #6 — Tear down any in-progress dimension chain (preview overlay,
// state machine, calibration mode). Called on tool switch, Esc, and
// double-click.
function _resetDimensionFlow() {
  if (window._dimTool && window._dimTool.resetState) window._dimTool.resetState();
  _dimCalibrateMode = false;
  _dimCalibrateP1 = null;
  _dimVertexEditId = null;
  _dimVertexDragHandle = null;
  // S330 #37 — clear the finish chip and close any open value keypad
  if (typeof _dimKpOpen === 'function' && _dimKpOpen()) _dimKpCommit(true);
  var _fc = document.getElementById('dim-finchip');
  if (_fc) _fc.classList.remove('show');
  var ov = _getOverlay();
  if (ov) {
    ov.style.display = 'none';
    var c = ov.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ov.width, ov.height);
  }
  if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()) {
    TiledPdf.resume();
    TiledPdf.scheduleRender();
  }
}

// S126 #6 — Render the dimension chain preview onto the overlay canvas.
// Called from _moveDraw whenever the chain state is non-idle.
function _renderDimensionPreview() {
  var dim = window._dimTool;
  if (!dim) return;
  var ov = _ensureOverlay();
  if (!ov) return;
  ov.style.display = 'block';
  ov.style.opacity = '1';
  var ctx = ov.getContext('2d');
  var d = ov._dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ov.width, ov.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  dim.renderPreview(ctx, _color, _lineWidth, _opacity);
}

// S331 #37 — Live calibration preview. After the first calibration point is
// placed, draw a dimension-style rubber-band line to the cursor (dashed axis,
// endpoint dots, a "set length…" chip) so calibrating looks/feels like drawing
// a real dimension instead of clicking two bare dots. Drawing-space coords on
// the overlay (same transform as _renderDimensionPreview). Display-only.
function _renderCalibratePreview(p1, cursor) {
  var ov = _ensureOverlay();
  if (!ov) return;
  ov.style.display = 'block';
  ov.style.opacity = '1';
  var ctx = ov.getContext('2d');
  var d = ov._dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ov.width, ov.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.save();
  var COL = '#9C2742';
  ctx.strokeStyle = COL; ctx.fillStyle = COL;
  ctx.lineWidth = Math.max(2, _lineWidth || 2);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // dashed measure axis
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(cursor.x, cursor.y);
  ctx.stroke();
  ctx.restore();
  // endpoint dots
  ctx.beginPath(); ctx.arc(p1.x, p1.y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cursor.x, cursor.y, 5, 0, Math.PI * 2); ctx.fill();
  // arrowheads at both ends
  var ang = Math.atan2(cursor.y - p1.y, cursor.x - p1.x);
  _calArrow(ctx, cursor.x, cursor.y, ang, COL);
  _calArrow(ctx, p1.x, p1.y, ang + Math.PI, COL);
  // "set length…" chip — OFFSET perpendicular off the line so it doesn't
  // cover what's being measured (the pipe). Sits 26px to one side at midpoint.
  var perpX = Math.sin(ang), perpY = -Math.cos(ang); // perpendicular unit
  var CHIP_OFF = 26;
  var mx = (p1.x + cursor.x) / 2 + perpX * CHIP_OFF;
  var my = (p1.y + cursor.y) / 2 + perpY * CHIP_OFF;
  // thin leader from the line midpoint to the chip
  var lmx = (p1.x + cursor.x) / 2, lmy = (p1.y + cursor.y) / 2;
  ctx.save();
  ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeStyle = COL;
  ctx.beginPath(); ctx.moveTo(lmx, lmy); ctx.lineTo(mx, my); ctx.stroke();
  ctx.restore();
  var txt = 'set length\u2026';
  ctx.font = 'bold 14px Calibri, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var tw = ctx.measureText(txt).width;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = COL; ctx.lineWidth = 1;
  _calRoundRect(ctx, mx - tw / 2 - 7, my - 12, tw + 14, 24, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = COL; ctx.fillText(txt, mx, my);
  ctx.restore();
}
function _calArrow(ctx, x, y, ang, col) {
  var s = 8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(ang - 0.4) * s, y - Math.sin(ang - 0.4) * s);
  ctx.lineTo(x - Math.cos(ang + 0.4) * s, y - Math.sin(ang + 0.4) * s);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
}
function _calRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// S330 #37 — Dimension value keypad controller. Replaces the old inline
// single-input. Units live OUTSIDE the keypad (the toolbar Imperial/Metric
// toggle governs). The display is a real <input> — type on a keyboard, tap
// keys, or tap the field for the OS keyboard. Auto-commits when the next
// dimension begins (so chains stay fluid). Revert clears an override back
// to the measured value. Non-numeric text is kept as a frozen note.
var _dimKpObj = null;       // the dimension object being edited
var _dimKpCommitted = false;

function _dimKpEls() {
  return {
    kp: document.getElementById('dim-kp'),
    input: document.getElementById('dim-kp-input'),
    flag: document.getElementById('dim-kp-flag'),
    interp: document.getElementById('dim-kp-interp')
  };
}
function _dimKpOpen() {
  var kp = document.getElementById('dim-kp');
  return !!(kp && kp.classList.contains('show'));
}
function _editDimensionLabel(obj) {
  var dim = window._dimTool;
  var els = _dimKpEls();
  if (!dim || !els.kp || !els.input || !obj) return;
  _dimKpObj = obj;
  _dimKpCommitted = false;

  // Seed the field: numeric override -> its typed form; note -> the note;
  // otherwise blank (placeholder shows the measured value).
  var seed = '';
  if (obj.overrideNote != null && obj.overrideNote !== '') seed = obj.overrideNote;
  else if (typeof obj.ovrM === 'number') {
    seed = (dim.getDisplayUnit() === 'metric')
      ? Math.round(obj.ovrM * 1000) + 'mm'
      : dim.formatMeters(obj.ovrM).replace(/[^0-9'"\-\/. ]/g, '').trim();
  }
  els.input.value = seed;

  // metric/imperial key visibility follows the display unit
  els.kp.classList.toggle('metric', dim.getDisplayUnit() === 'metric');

  // Position: floating near the dim label on desktop; CSS docks on touch.
  var isTouch = (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  if (!isTouch) {
    var mc = _getCanvas();
    if (mc) {
      var ax, ay, bx, by, offset;
      if (obj.mx1 != null) { ax = obj.mx1; ay = obj.my1; bx = obj.mx2; by = obj.my2; offset = obj.offset || 0; }
      else { ax = obj.x1; ay = obj.y1; bx = obj.x2; by = obj.y2; offset = 0; }
      var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var px = -dy / len, py = dx / len;
      var midX = (ax + bx) / 2 + px * offset, midY = (ay + by) / 2 + py * offset;
      var r = mc.getBoundingClientRect();
      var lw = mc._logicalW || mc.width, lh = mc._logicalH || mc.height;
      var sx = r.left + (midX / lw) * r.width;
      var sy = r.top + (midY / lh) * r.height;
      els.kp.style.left = Math.min(Math.max(8, sx - 100), window.innerWidth - 208) + 'px';
      els.kp.style.top = Math.min(Math.max(8, sy + 14), window.innerHeight - 270) + 'px';
    }
  }

  els.kp.classList.add('show');
  _dimKpRender();
  if (!isTouch) setTimeout(function () { try { els.input.focus(); els.input.select(); } catch (e) {} }, 40);
}
function _dimKpRender() {
  var dim = window._dimTool;
  var els = _dimKpEls();
  if (!dim || !els.input) return;
  var res = dim.parseLength(els.input.value);
  if (els.flag) {
    els.flag.textContent = res.system === 'metric' ? 'MET' : 'IMP';
    els.flag.className = 'dim-kp-flag ' + (res.system === 'metric' ? 'met' : 'imp');
  }
  if (els.interp) {
    if (!els.input.value) { els.interp.innerHTML = '&nbsp;'; els.interp.className = 'dim-kp-interp'; }
    else if (res.isNote) { els.interp.textContent = 'Note (kept as text): ' + res.label; els.interp.className = 'dim-kp-interp note'; }
    else { els.interp.textContent = '= ' + res.label + (res.confidence === 'guess' ? ' (assumed ft)' : ''); els.interp.className = 'dim-kp-interp'; }
  }
}
function _dimKpApply() {
  var dim = window._dimTool;
  if (!dim || !_dimKpObj) return;
  var els = _dimKpEls();
  var v = (els.input.value || '').trim();
  if (v === '') {
    // empty -> revert to measured (clears any override)
    _dimKpObj.ovrM = undefined;
    _dimKpObj.overrideNote = null;
    _dimKpObj.overrideLabel = null;
  } else {
    var res = dim.parseLength(v);
    if (res.isNote) { _dimKpObj.overrideNote = v; _dimKpObj.ovrM = undefined; _dimKpObj.overrideLabel = null; }
    else { _dimKpObj.ovrM = res.meters; _dimKpObj.overrideNote = null; _dimKpObj.overrideLabel = null; }
  }
  _renderAll();
}
function _dimKpCommit(silent) {
  if (_dimKpCommitted) return;
  _dimKpCommitted = true;
  _dimKpApply();
  var els = _dimKpEls();
  if (els.kp) els.kp.classList.remove('show');
  _dimKpObj = null;
  if (!silent) { _pushHistory(); _markDirty(); }
  else { _markDirty(); }
}
function _dimKpClose() { if (_dimKpOpen()) _dimKpCommit(false); }

// S330 #37 — Finish ✕ chip. Shown between dimensions in continuous/running
// (state 'awaitB' with an anchor), never during the offset stage, so
// reaching for it can't drag the offset. Tapping it ends the chain.
function _updateDimFinChip() {
  var chip = document.getElementById('dim-finchip');
  var dim = window._dimTool;
  if (!chip || !dim) return;
  var anchor = dim.chainFinishAnchor ? dim.chainFinishAnchor() : null;
  var mode = dim.getMode ? dim.getMode() : 'single';
  if (!anchor || mode === 'single' || _tool !== 'dimension') { chip.classList.remove('show'); return; }
  var mc = _getCanvas();
  if (!mc) { chip.classList.remove('show'); return; }
  var r = mc.getBoundingClientRect();
  var lw = mc._logicalW || mc.width, lh = mc._logicalH || mc.height;
  var sx = r.left + (anchor.x / lw) * r.width;
  var sy = r.top + (anchor.y / lh) * r.height;
  var x = Math.min(Math.max(8, sx + 16), window.innerWidth - 56);
  var y = Math.min(Math.max(8, sy - 22), window.innerHeight - 56);
  chip.style.left = x + 'px';
  chip.style.top = y + 'px';
  chip.classList.add('show');
}
function _dimFinChipEnd() {
  var dim = window._dimTool;
  if (_dimKpOpen()) _dimKpCommit(true);
  if (dim && dim.endChain) dim.endChain();
  var chip = document.getElementById('dim-finchip');
  if (chip) chip.classList.remove('show');
  var ov = _getOverlay();
  if (ov) {
    ov.style.display = 'none';
    var c = ov.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ov.width, ov.height);
  }
  if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()) {
    TiledPdf.resume(); TiledPdf.scheduleRender();
  }
  _renderAll();
}

// S330 #37 — Wire keypad keys, unit toggle, finish chip, pickup &
// recalibrate modals. Idempotent; called once after DOM is ready.
var _dimWired = false;
function _wireDimensionV4() {
  if (_dimWired) return;
  _dimWired = true;
  var dim = window._dimTool;

  // keypad keys
  var kp = document.getElementById('dim-kp');
  var kpInput = document.getElementById('dim-kp-input');
  if (kp) {
    kp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    kp.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
    var keyBtns = kp.querySelectorAll('[data-dk]');
    for (var i = 0; i < keyBtns.length; i++) {
      keyBtns[i].addEventListener('click', (function (k) {
        return function (e) { e.stopPropagation(); _dimKpKey(k); };
      })(keyBtns[i].getAttribute('data-dk')));
    }
  }
  if (kpInput) {
    kpInput.addEventListener('input', function () { _dimKpRender(); _dimKpApply(); });
    kpInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _dimKpCommit(false); }
      e.stopPropagation();
    });
  }
  var kpClose = document.getElementById('dim-kp-close');
  if (kpClose) kpClose.addEventListener('click', function (e) { e.stopPropagation(); _dimKpCommit(false); });

  // finish chip
  var finX = document.getElementById('dim-fin-x');
  if (finX) finX.addEventListener('click', function (e) { e.stopPropagation(); _dimFinChipEnd(); });
  var finChip = document.getElementById('dim-finchip');
  if (finChip) {
    finChip.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    finChip.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
  }

  // modal close buttons (universal ✕)
  var closers = document.querySelectorAll('[data-dim-close]');
  for (var c = 0; c < closers.length; c++) {
    closers[c].addEventListener('click', function (e) {
      e.stopPropagation();
      var id = this.getAttribute('data-dim-close');
      var m = document.getElementById(id);
      if (m) m.classList.remove('show');
    });
  }

  // pickup picker choices
  var pickPrev = document.getElementById('dim-pick-prev');
  var pickPoint = document.getElementById('dim-pick-point');
  var pickFresh = document.getElementById('dim-pick-fresh');
  if (pickPrev) pickPrev.addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('dim-pick-back').classList.remove('show');
    if (dim.startContinueFromPrevious) dim.startContinueFromPrevious(_objects);
    _renderDimensionPreview(); _updateDimFinChip();
  });
  if (pickPoint) pickPoint.addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('dim-pick-back').classList.remove('show');
    if (dim.startPickPoint) dim.startPickPoint();
    _renderAll();
  });
  if (pickFresh) pickFresh.addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('dim-pick-back').classList.remove('show');
    if (dim.startFresh) dim.startFresh();
    _updateDimFinChip();
  });

  // recalibrate choices
  var recM = document.getElementById('dim-recal-measured');
  var recA = document.getElementById('dim-recal-all');
  var recN = document.getElementById('dim-recal-none');
  function _doRecal(mode) {
    if (_pendingRecalCal) {
      dim.recalibrateAll(_objects, _pendingRecalCal, mode);
      _pendingRecalCal = null;
    }
    document.getElementById('dim-recal-back').classList.remove('show');
    _pushHistory(); _renderAll(); _markDirty();
    try { var M = (window._frt && window._frt.Model) || null; if (M && M.saveNow) M.saveNow(); } catch (e) {}
  }
  if (recM) recM.addEventListener('click', function (e) { e.stopPropagation(); _doRecal('measured'); });
  if (recA) recA.addEventListener('click', function (e) { e.stopPropagation(); _doRecal('all'); });
  if (recN) recN.addEventListener('click', function (e) { e.stopPropagation(); _doRecal('none'); });

  // unit toggle
  var unitBtns = document.querySelectorAll('[data-dim-unit]');
  for (var u = 0; u < unitBtns.length; u++) {
    unitBtns[u].addEventListener('click', function (e) {
      e.stopPropagation();
      var unit = this.getAttribute('data-dim-unit');
      if (dim.setDisplayUnit) dim.setDisplayUnit(unit);
      _dimSaveUnitPref(unit);
      var sibs = document.querySelectorAll('[data-dim-unit]');
      for (var s = 0; s < sibs.length; s++) sibs[s].classList.toggle('active', sibs[s] === this);
      if (kp) kp.classList.toggle('metric', unit === 'metric');
      if (_dimKpOpen()) _dimKpRender();
      _renderAll();
    });
  }

  // restore persisted unit preference
  var saved = _dimLoadUnitPref();
  if (saved && dim.setDisplayUnit) {
    dim.setDisplayUnit(saved);
    var sb = document.querySelectorAll('[data-dim-unit]');
    for (var k = 0; k < sb.length; k++) sb[k].classList.toggle('active', sb[k].getAttribute('data-dim-unit') === saved);
    if (kp) kp.classList.toggle('metric', saved === 'metric');
  }
}
var _pendingRecalCal = null;

function _dimKpKey(k) {
  var els = _dimKpEls();
  if (!els.input) return;
  if (k === 'BK') { els.input.value = els.input.value.slice(0, -1); }
  else if (k === 'OK') { _dimKpCommit(false); return; }
  else if (k === 'REV') {
    els.input.value = '';
    if (_dimKpObj) { _dimKpObj.ovrM = undefined; _dimKpObj.overrideNote = null; _dimKpObj.overrideLabel = null; }
    _dimKpRender(); _renderAll(); return;
  }
  else { els.input.value += k; }
  _dimKpRender(); _dimKpApply();
}

// Unit preference persistence via FRT's model (NOT artifact localStorage).
function _dimSaveUnitPref(unit) {
  try {
    var M = (window._frt && window._frt.Model) || null;
    if (M && typeof M.setPref === 'function') { M.setPref('dimUnit', unit); return; }
  } catch (e) {}
  try { localStorage.setItem('arencon_frt_dim_unit', unit); } catch (e) {}
}
function _dimLoadUnitPref() {
  try {
    var M = (window._frt && window._frt.Model) || null;
    if (M && typeof M.getPref === 'function') { var v = M.getPref('dimUnit'); if (v) return v; }
  } catch (e) {}
  try { return localStorage.getItem('arencon_frt_dim_unit') || null; } catch (e) { return null; }
}

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

  // S131 priority #1 — device-class markup canvas budget. The old 2-tier
  // logic (Android phone 10 MP / everything else 30 MP) dumped the field
  // tablets into the desktop budget and crashed the app in the field.
  // deviceMaxPixels() is the single source of truth — phone 8 / tablet 12
  // / desktop 30 MP. See the helper definition near the top of this module.
  var maxPixels = deviceMaxPixels();

  var totalPixels = drawW * drawH;
  var mkScale = 1;
  if (totalPixels > maxPixels) mkScale = Math.sqrt(maxPixels / totalPixels);

  var cw = Math.round(drawW * mkScale);
  var ch = Math.round(drawH * mkScale);

  // S125 #2 — Hard clamp to WebGL MAX_TEXTURE_SIZE. Same rationale as the
  // clamp in _resizeMarkupForScale: byte budget can allow larger area than
  // the GPU's per-dimension limit.
  var MAX_TEX = 16384;
  if (cw > MAX_TEX || ch > MAX_TEX) {
    var clampS = Math.min(MAX_TEX / cw, MAX_TEX / ch);
    cw = Math.max(1, Math.round(cw * clampS));
    ch = Math.max(1, Math.round(ch * clampS));
    mkScale = mkScale * clampS;
  }

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

        // S125 hotfix — WebGL CONTEXT_LOST recovery. Without these handlers,
        // a single context loss event (which the browser may trigger under
        // GPU memory pressure, tab visibility change, driver hiccup, etc.)
        // bricks the markup canvas until full page reload. The default
        // browser behavior is "do nothing"; calling preventDefault on the
        // lost event signals the runtime to attempt restoration when memory
        // is available. The restored handler re-runs init so Pixi rebuilds
        // its textures.
        _webglCanvas.addEventListener('webglcontextlost', function(e) {
          console.warn('[Markup] WebGL CONTEXT_LOST — attempting recovery on restore');
          // S126 Phase D — record for diagnostics. Counter survives the
          // Markup.destroy() teardown so post-mortem analysis is possible.
          try { Diag.memory.recordWebglLoss(); } catch(_) {}
          e.preventDefault();
          _webglReady = false;
          _webglInitPromise = null;
          // S131 priority #1 (Step 2) — On a field tablet, a context loss
          // means the GPU is genuinely out of memory, not a transient
          // driver hiccup. The webglcontextrestored handler's 3× retry loop
          // re-attempts the SAME too-large allocation each time and can
          // cascade into a crash loop. So on the FIRST loss on a tablet,
          // abandon WebGL outright and degrade straight to Canvas 2D —
          // which allocates no GPU textures, so context loss cannot recur.
          // The `_useWebGL` guard makes this fire once only (subsequent
          // losses see it already false). Desktop keeps the retry path:
          // there a loss is usually a recoverable driver blip.
          if (_useWebGL && deviceClass() === 'tablet') {
            console.warn('[Markup] Field tablet — abandoning WebGL after first context loss, falling back to Canvas 2D');
            _useWebGL = false;
            try { _renderAll(); } catch(_) {}
            try {
              if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()) {
                TiledPdf.scheduleRender();
              }
            } catch(_) {}
          }
        }, false);
        _webglCanvas.addEventListener('webglcontextrestored', function() {
          console.log('[Markup] WebGL CONTEXT_RESTORED — reinitializing Pixi');
          // S126 Phase D — record for diagnostics
          try { Diag.memory.recordWebglRestore(); } catch(_) {}
          if (!_useWebGL || !_webglCanvas) return;
          // S125 hotfix — Pixi.js v7.4.2 has a race where re-init immediately
          // after webglcontextrestored throws "Invalid value of `0` passed to
          // checkMaxIfStatementsInShader" because the GL context returns 0
          // from MAX_FRAGMENT_UNIFORM_VECTORS before it's fully ready.
          // 250 ms delay + one retry covers driver wakeup on Intel/AMD.
          var attempts = 0;
          var maxAttempts = 3;
          function tryInit() {
            attempts++;
            if (!_useWebGL || !_webglCanvas) return;
            var cw2 = _webglCanvas.width, ch2 = _webglCanvas.height;
            var dpr2 = (mc && mc._dpr) || 1;
            if (!window.WebGLMarkupRenderer || _webglInitPromise) return;
            _webglInitPromise = window.WebGLMarkupRenderer.init(_webglCanvas, { w: cw2, h: ch2, dpr: dpr2 })
              .then(function() {
                _webglReady = true;
                _webglInitPromise = null;
                console.log('[Markup] WebGL recovered and ready (attempt ' + attempts + ')');
                _renderAll();
                // Defensive: kick tiledPdf in case its tile DOM was disturbed
                // by the same GPU reset that killed Pixi.
                try {
                  if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()) {
                    TiledPdf.scheduleRender();
                  }
                } catch(_) {}
              })
              .catch(function(err) {
                _webglInitPromise = null;
                if (attempts < maxAttempts) {
                  console.warn('[Markup] WebGL re-init attempt ' + attempts + ' failed, retrying in 500 ms:', err && err.message);
                  setTimeout(tryInit, 500);
                } else {
                  console.warn('[Markup] WebGL re-init exhausted retries — falling back to Canvas 2D:', err);
                  _useWebGL = false;
                  // Force a final 2D re-render so user isn't stuck on a blank canvas
                  try { _renderAll(); } catch(_) {}
                  // Defensive: kick tiledPdf to redraw too. The GPU reset that
                  // killed Pixi may have also disturbed the tile DOM elements.
                  try {
                    if (typeof TiledPdf !== 'undefined' && TiledPdf.isActive && TiledPdf.isActive()) {
                      TiledPdf.scheduleRender();
                    }
                  } catch(_) {}
                }
              });
          }
          setTimeout(tryInit, 250);
        }, false);
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
        try { window.WebGLMarkupRenderer.resize(cw, ch, mkScale); } catch(_){}
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

  // S131 priority #1 — shared device-class budget. This zoom-resize site
  // is the one that actually triggered the field crash: it reallocates the
  // main + WebGL canvases synchronously on every zoom change. Previously a
  // duplicated copy of the 2-tier logic; now the single deviceMaxPixels()
  // helper so this can never drift from the initial-allocation site again.
  // (Supersedes the S125-era flat-30 MP budget — that comment was removed
  // because it no longer described the code; see S130 handoff lesson.)
  var maxPixels = deviceMaxPixels();
  var budgetScale = Math.sqrt(maxPixels / (drawW * drawH));

  // Effective render scale: capped at budget. No separate <=1.0 clamp;
  // budgetScale naturally limits this to ~1.095 on a typical 25 MP
  // drawing.
  //
  // S125 hotfix 5 — RAISED FLOOR from 0.08 to 0.4. The real cause of
  // "markup looks blurry compared to drawing tiles at zoom-out":
  //   - Tile renderer keeps tile IMAGES at high res, browser does
  //     bilinear-filter downscale on display = clean.
  //   - Markup canvas was being RESIZED to 965×643 at fit-zoom (scale
  //     0.157). Pen strokes that were drawn at 6144×4096 coords got
  //     rasterized into a tiny 965-pixel canvas — a 3px stroke became
  //     0.47 actual pixels = anti-aliased to translucent fuzz.
  // Floor of 0.4 guarantees backing buffer ≥ 4 MP regardless of
  // zoom-out, so thin strokes always have enough pixels to render
  // crisply. Memory cost is negligible.
  var effective = targetScale;
  if (effective > budgetScale) effective = budgetScale;
  if (effective < 0.4) effective = 0.4;

  // No-op: same scale within 1% (filters pan-only events + wheel-zoom jitter)
  if (Math.abs(effective - _lastRenderScale) / effective < 0.01) return;

  var newW = Math.max(1, Math.round(drawW * effective));
  var newH = Math.max(1, Math.round(drawH * effective));

  // S125 #2 — Hard clamp to WebGL MAX_TEXTURE_SIZE (typically 16384). Even
  // though the 100 MP byte budget allows larger area, the GPU rejects a
  // texture if either dimension exceeds this limit. Clamp uniformly so
  // aspect ratio is preserved.
  var MAX_TEX = 16384;
  if (newW > MAX_TEX || newH > MAX_TEX) {
    var clampS = Math.min(MAX_TEX / newW, MAX_TEX / newH);
    newW = Math.max(1, Math.round(newW * clampS));
    newH = Math.max(1, Math.round(newH * clampS));
    effective = effective * clampS;
  }

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
      try { window.WebGLMarkupRenderer.resize(newW, newH, effective); } catch(_e) {}
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
  // S125 hotfix 7 — The overlay canvas (used ONLY for live drag preview
  // during pen / shape / dimension drawing) was once capped at 3 MP — an
  // iPad-era leftover that made live preview render at 3× browser upscale
  // (visible fuzz while holding the mouse down).
  // S131 priority #1 — the overlay now shares the device-class budget via
  // deviceMaxPixels() (phone 8 / tablet 12 / desktop 30 MP). A flat 30 MP
  // here re-introduced GPU pressure on field tablets during drawing even
  // after the two main-canvas budget sites were fixed.
  var ovMax = deviceMaxPixels();
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
  // S129 Item 1.1 — snapshot tombstones alongside objects so undo/redo
  // restore both atomically (undoing an erase must un-tombstone the id).
  _undoStack.push(JSON.stringify({ objects: _objects, tombstones: _tombstones }));
  if (_undoStack.length > _maxUndo) _undoStack.shift();
  _redoStack = [];
  _updateUndoButtons();
}

// S129 Item 1.1 — accept old-shape (plain JSON-stringified array) snapshots
// from any history entries that pre-date this code path (defensive — the
// undo stack is reset on _loadMarkup so this should never happen in practice,
// but it keeps the function total). Returns {objects, tombstones}.
function _decodeHistorySnapshot(s) {
  try {
    var parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return { objects: parsed, tombstones: [] };
    if (parsed && typeof parsed === 'object') {
      return {
        objects: Array.isArray(parsed.objects) ? parsed.objects : [],
        tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : []
      };
    }
  } catch (e) {}
  return { objects: [], tombstones: [] };
}

function _undo() {
  if (!_undoStack.length) return;
  _redoStack.push(JSON.stringify({ objects: _objects, tombstones: _tombstones }));
  var snap = _decodeHistorySnapshot(_undoStack.pop());
  _objects = snap.objects;
  _tombstones = snap.tombstones;
  _selectedIds = [];
  _renderAll();
  _markDirty();
  _updateUndoButtons();
}

function _redo() {
  if (!_redoStack.length) return;
  _undoStack.push(JSON.stringify({ objects: _objects, tombstones: _tombstones }));
  var snap = _decodeHistorySnapshot(_redoStack.pop());
  _objects = snap.objects;
  _tombstones = snap.tombstones;
  _selectedIds = [];
  _renderAll();
  _markDirty();
  _updateUndoButtons();
}

// S129 Item 1.1 — Record erased stroke ids as tombstones. Call BEFORE
// filtering them out of _objects. Idempotent — already-tombstoned ids are
// skipped. Tombstones are unioned into the R2 blob on next save so other
// inspectors see the deletion and so the cloud-merge step doesn't resurrect
// the stroke.
// S133 — Tombstones are now {id, t: ms-epoch}. The timestamp lets the
// cloud-merge step prune entries older than its TTL.
function _tombstone(ids) {
  if (!Array.isArray(ids)) return;
  var now = Date.now();
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (typeof id !== 'string') continue;
    var dup = false;
    for (var j = 0; j < _tombstones.length; j++) {
      if (_tombstones[j] && _tombstones[j].id === id) { dup = true; break; }
    }
    if (!dup) _tombstones.push({ id: id, t: now });
  }
}

// S133 — Backward-compat normalizer for tombstones loaded from IDB or R2.
// Plain-string legacy entries are upgraded to {id, t: Date.now()} — stamping
// at load time rather than 0 means the pruner's clock starts from when this
// code first sees the data, giving legacy tombstones a full safety window.
// Object entries with a valid numeric `t` pass through unchanged.
function _normalizeTombstones(arr) {
  if (!Array.isArray(arr)) return [];
  var now = Date.now();
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var e = arr[i];
    if (typeof e === 'string') {
      out.push({ id: e, t: now });
    } else if (e && typeof e.id === 'string') {
      out.push({ id: e.id, t: (typeof e.t === 'number' && isFinite(e.t)) ? e.t : now });
    }
  }
  return out;
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

  // S331d #37 — Dimension objects are NOT rendered by the WebGL path
  // (WebGLMarkupRenderer has no 'dimension' case and dims use mx1/my1, not
  // x1/y1, so they were created + saved but never painted — the long-standing
  // "dimension won't show" bug). When WebGL is active, draw dimensions here on
  // the 2D markup canvas (which sits above the WebGL canvas) so they appear.
  // They also carry text labels, which the 2D path renders correctly.
  if (useWebGLNow){
    for (var _di = 0; _di < _objects.length; _di++){
      var _dobj = _objects[_di];
      if (_dobj && _dobj.type === 'dimension' &&
          window._dimTool && typeof window._dimTool.renderObject === 'function'){
        ctx.save();
        window._dimTool.renderObject(ctx, _dobj);
        ctx.restore();
      }
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

  // S126 #6 — Vertex handles overlay. Drawn last so they sit on top of all
  // markup. Visible whenever the user has tapped a dimension while NOT in
  // select tool. Click+drag on a handle moves that endpoint of the dim.
  if (_dimVertexEditId != null && window._dimTool && window._dimTool.renderVertexHandles) {
    var editDim = _findObj(_dimVertexEditId);
    if (editDim && editDim.type === 'dimension') {
      window._dimTool.renderVertexHandles(ctx, editDim);
    } else {
      _dimVertexEditId = null;
    }
  }

  // S330 #37 — pickup picker "pick a point" highlights: burgundy rings on
  // every existing dimension vertex, so the user can tap one to start.
  if (window._dimTool && window._dimTool.isPickAwaiting && window._dimTool.isPickAwaiting()) {
    var verts = window._dimTool.allVertices ? window._dimTool.allVertices(_objects) : [];
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#9C2742';
    ctx.fillStyle = 'rgba(156,39,66,.18)';
    for (var pv = 0; pv < verts.length; pv++) {
      ctx.beginPath();
      ctx.arc(verts[pv].x, verts[pv].y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
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
  ctx.strokeStyle = obj.color || '#A85959';
  ctx.fillStyle = obj.color || '#A85959';
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
    // S126 #7 — Optional border + hatch decoration. Both fields default
    // to false (transparent text is the new default). Computed from the
    // text's approximate bounding box (anchor x1, y1 is text baseline).
    var fsTx = obj.fontSize || 20;
    var estWTx = ctx.measureText(obj.text || '').width;
    var padTx = 4;
    var bxLeft = obj.x1 - padTx;
    var bxTop = obj.y1 - fsTx - padTx + 2;
    var bxW = estWTx + padTx * 2;
    var bxH = fsTx + padTx * 2;
    if (obj.hatch) {
      // Fine 45° diagonal lines, 1 px stroke, 6 px spacing, 0.4 alpha of
      // obj.color. Clipped to the text bbox so the hatch stays contained.
      ctx.save();
      ctx.beginPath();
      ctx.rect(bxLeft, bxTop, bxW, bxH);
      ctx.clip();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4 * (obj.opacity || 1);
      ctx.strokeStyle = obj.color || '#A85959';
      var hatchSpacing = 6;
      // Diagonals go from top-right toward bottom-left; cover the bbox
      // by starting outside it and walking by spacing units.
      var diag = bxW + bxH;
      for (var hh = -bxH; hh <= bxW + bxH; hh += hatchSpacing) {
        ctx.beginPath();
        ctx.moveTo(bxLeft + hh, bxTop);
        ctx.lineTo(bxLeft + hh - diag, bxTop + diag);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (obj.border) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = obj.color || '#A85959';
      ctx.globalAlpha = obj.opacity || 1;
      ctx.strokeRect(bxLeft, bxTop, bxW, bxH);
      ctx.restore();
    }
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
  // S124 A1 — Dimension tool. Delegates to window._dimTool.renderObject
  // so the formatting/label logic lives in one place (dimensionTool.js).
  else if (t === 'dimension') {
    ctx.restore();
    if (window._dimTool && typeof window._dimTool.renderObject === 'function') {
      window._dimTool.renderObject(ctx, obj);
    }
    return;
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
  // S124 A1 / S125 hotfix — live preview for dimension tool. Originally I
  // beefed the preview with 1.5× line + filled endpoint dots, but the heavy
  // dots looked like blur artifacts in screenshots and didn't represent the
  // committed result. Now the preview delegates to _dimTool.renderObject so
  // the user sees the EXACT geometry they're about to commit (line + arrows
  // + ticks + label "?" placeholder when uncalibrated).
  else if (t === 'dimension') {
    if (window._dimTool && typeof window._dimTool.renderObject === 'function') {
      // Synthesize a minimal preview object — caller has already set
      // ctx.strokeStyle/lineWidth/etc from the current tool state.
      var prevObj = {
        type: 'dimension',
        x1: x1, y1: y1, x2: x2, y2: y2,
        color: ctx.strokeStyle, size: ctx.lineWidth, opacity: ctx.globalAlpha,
        rawLabel: '\u2026', // ellipsis placeholder until commit
        overrideLabel: null
      };
      ctx.restore();
      window._dimTool.renderObject(ctx, prevObj);
      ctx.save();
      // Restore the stroke/fill/lineWidth that _moveDraw expects
      ctx.strokeStyle = prevObj.color;
      ctx.fillStyle = prevObj.color;
      ctx.lineWidth = prevObj.size;
      ctx.globalAlpha = prevObj.opacity;
    } else {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
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
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.setLineDash([]);
  // Corner resize handles
  var hs = 11;
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
  ctx.lineTo(rcx, rcy + 9);
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rcx, rcy, 9, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Rotation arrow icon inside circle
  ctx.beginPath();
  ctx.arc(rcx, rcy, 5, -0.3, Math.PI * 1.4);
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
    if (Math.abs(pos.x - corners[i][0]) <= 11 && Math.abs(pos.y - corners[i][1]) <= 11) return i;
  }
  return -1;
}

function _hitRotateHandle(pos) {
  var b = _getGroupBounds();
  if (!b) return false;
  var pad = 6;
  var rcx = (b.x1 + b.x2) / 2, rcy = b.y1 - pad - 24;
  var dist = Math.sqrt((pos.x - rcx) * (pos.x - rcx) + (pos.y - rcy) * (pos.y - rcy));
  return dist <= 14;
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

  // S126 #6 — Dimension tool click flow. Routes through the dimensionTool
  // state machine (handleClick). Three click roles:
  //   1. Vertex handle drag (if user has tapped a dim to expose handles)
  //   2. Calibration point lock (if user pressed the Calibrate button)
  //   3. Normal chain click (idle → A → B → offset → commit)
  if (_tool === 'dimension') {
    var posD = _getPos(e);
    var dim = window._dimTool;
    if (!dim) return;

    // (1) Vertex handle drag start. If handles are showing and click is
    //     within tolerance of A or B, begin dragging that endpoint. Mouseup
    //     will commit the new position.
    if (_dimVertexEditId != null) {
      var editObj = _findObj(_dimVertexEditId);
      if (editObj) {
        var hndl = dim.hitTestVertex(posD, editObj);
        if (hndl != null) {
          _dimVertexDragHandle = hndl;
          _isDrawing = true;
          if (TiledPdf.isActive()) TiledPdf.pause();
          return;
        }
        // Click was NOT on a handle — dismiss vertex edit. Re-render to
        // remove handles, then fall through so the click can also start
        // the next normal action (e.g. a new chain or another hit).
        _dimVertexEditId = null;
        _renderAll();
      } else {
        _dimVertexEditId = null;
      }
    }

    // (2) Calibration mode — two clicks collect the calibration points
    if (_dimCalibrateMode) {
      if (!_dimCalibrateP1) {
        _dimCalibrateP1 = { x: posD.x, y: posD.y };
        // Show a marker dot on the overlay so user sees their first click
        var ovCal = _ensureOverlay();
        if (ovCal) {
          ovCal.style.display = 'block';
          ovCal.style.opacity = '1';
          var ctxCal = ovCal.getContext('2d');
          var dCal = ovCal._dpr || 1;
          ctxCal.setTransform(1, 0, 0, 1, 0, 0);
          ctxCal.clearRect(0, 0, ovCal.width, ovCal.height);
          ctxCal.setTransform(dCal, 0, 0, dCal, 0, 0);
          ctxCal.save();
          ctxCal.fillStyle = '#9C2742';
          ctxCal.globalAlpha = 1;
          ctxCal.beginPath();
          ctxCal.arc(posD.x, posD.y, 5, 0, Math.PI * 2);
          ctxCal.fill();
          ctxCal.restore();
        }
        return;
      }
      // Second calibration click — open the prompt
      var p1c = _dimCalibrateP1, p2c = { x: posD.x, y: posD.y };
      _dimCalibrateP1 = null;
      _dimCalibrateMode = false;
      // Reset toolbar state on the Calibrate button
      var calBtn = document.getElementById('dim-calibrate-btn');
      if (calBtn) calBtn.classList.remove('active');
      var addBtn = document.getElementById('dim-add-btn');
      if (addBtn) addBtn.classList.add('active');
      // Clear the overlay marker
      var ovCal2 = _getOverlay();
      if (ovCal2) {
        ovCal2.style.display = 'none';
        var cCal2 = ovCal2.getContext('2d');
        cCal2.setTransform(1, 0, 0, 1, 0, 0);
        cCal2.clearRect(0, 0, ovCal2.width, ovCal2.height);
      }
      var drCal = _getCurrentDrawing();
      dim.showCalibrationPrompt(drCal, p1c.x, p1c.y, p2c.x, p2c.y, function (result) {
        if (!result) return;
        // Count existing dims. If any exist, ask how to apply the new scale
        // (measured-only / all / none) via the recalibrate choice modal.
        // Otherwise apply straight away.
        var dimCount = 0;
        for (var dc = 0; dc < _objects.length; dc++) { if (_objects[dc] && _objects[dc].type === 'dimension') dimCount++; }
        if (dimCount > 0) {
          _pendingRecalCal = result.calibration;
          var rb = document.getElementById('dim-recal-back');
          if (rb) { rb.classList.add('show'); return; }
        }
        dim.recalibrateAll(_objects, result.calibration, 'measured');
        _pushHistory();
        _renderAll();
        _markDirty();
        try {
          var M = (window._frt && window._frt.Model) || null;
          if (M && typeof M.saveNow === 'function') M.saveNow();
        } catch (e2) { /* noop */ }
      });
      return;
    }

    // (3) Existing-dimension hit test (enter vertex edit mode). Only when
    //     the chain is idle so we don't hijack a mid-chain click.
    var st0 = dim.getState();
    if (st0.state === 'idle') {
      var dimHit = dim.hitTestDimension(posD, _objects);
      if (dimHit) {
        _dimVertexEditId = dimHit.id;
        _renderAll();
        return;
      }
    }

    // (3.5) Pickup picker "pick a point" — awaiting a vertex tap. Snap to
    //       the nearest existing dimension vertex and seed the chain there.
    if (dim.isPickAwaiting && dim.isPickAwaiting()) {
      var snap = dim.nearestVertex ? dim.nearestVertex(posD, _objects, 28) : null;
      var seedPt = snap || posD;
      if (dim.seedFromPoint) dim.seedFromPoint(seedPt);
      _renderDimensionPreview();
      _updateDimFinChip();
      return;
    }

    // (4) Normal chain click. Per locked spec, an uncalibrated drawing is
    //     NOT auto-scaled — it stays "not to scale" and the user types each
    //     value via the keypad. Calibration is optional, never a gate.
    var drNow = _getCurrentDrawing();

    // If the value keypad is open from a previous dimension, starting the
    // next one auto-commits it (locks, never flattens) so chains stay fluid.
    if (_dimKpOpen()) _dimKpCommit(true);

    if (TiledPdf.isActive()) TiledPdf.pause();
    var res = dim.handleClick(posD, drNow, _objects);
    if (res.action === 'lockedA' || res.action === 'lockedB') {
      // Show / refresh the overlay preview
      _renderDimensionPreview();
      _updateDimFinChip();
      return;
    }
    if (res.committed) {
      var newObj = res.obj;
      newObj.id = _newId();
      newObj.color = _color;
      newObj.size = _lineWidth;
      newObj.opacity = _opacity;
      _objects.push(newObj);
      _pushHistory();
      _renderAll();
      _markDirty();
      // Calibrated → measured value drops in, no keypad. Uncalibrated →
      // auto-open the keypad so the user types the value for this dim.
      if (!dim.isCalibrated(drNow)) {
        _editDimensionLabel(newObj);
      }
      // Refresh preview for the next chain link, or tear down if chain ended
      var stAfter = dim.getState();
      if (stAfter.state === 'idle') {
        var ovEnd = _getOverlay();
        if (ovEnd) {
          ovEnd.style.display = 'none';
          var cEnd = ovEnd.getContext('2d');
          cEnd.setTransform(1, 0, 0, 1, 0, 0);
          cEnd.clearRect(0, 0, ovEnd.width, ovEnd.height);
        }
        if (TiledPdf.isActive()) { TiledPdf.resume(); TiledPdf.scheduleRender(); }
      } else {
        _renderDimensionPreview();
      }
      _updateDimFinChip();
    }
    return;
  }

  // S126 #5 — Click-to-draw for shape tools. Two-click pattern replaces
  // drag. First click locks point A and shows a zero-length preview dot;
  // second click commits the shape from A to current cursor.
  if (_isClickToDrawShape(_tool)) {
    var posC = _getPos(e);
    if (!_clickFirstPt) {
      // First click — lock A, show dot preview
      _clickFirstPt = posC;
      _startX = posC.x; _startY = posC.y;
      _endX = posC.x; _endY = posC.y;
      if (TiledPdf.isActive()) TiledPdf.pause();
      var ovC = _ensureOverlay();
      if (ovC) {
        ovC.style.display = 'block';
        ovC.style.opacity = '1';
        var cxC = ovC.getContext('2d');
        var dC = ovC._dpr || 1;
        cxC.setTransform(1, 0, 0, 1, 0, 0);
        cxC.clearRect(0, 0, ovC.width, ovC.height);
        cxC.setTransform(dC, 0, 0, dC, 0, 0);
        cxC.save();
        cxC.fillStyle = _color;
        cxC.globalAlpha = _opacity;
        cxC.beginPath();
        cxC.arc(posC.x, posC.y, Math.max(2, _lineWidth / 2), 0, Math.PI * 2);
        cxC.fill();
        cxC.restore();
      }
      return;
    }
    // Second click — commit shape from A to current cursor
    var ax = _clickFirstPt.x, ay = _clickFirstPt.y;
    var bx = posC.x, by = posC.y;
    // Reject zero-area shapes (accidental double-tap on same spot)
    var ddx = bx - ax, ddy = by - ay;
    if (Math.sqrt(ddx * ddx + ddy * ddy) < 3) {
      _cancelClickToDraw();
      return;
    }
    _objects.push({
      id: _newId(), type: _tool,
      x1: ax, y1: ay, x2: bx, y2: by,
      color: _color, size: _lineWidth, opacity: _opacity
    });
    _pushHistory();
    _cancelClickToDraw();
    _renderAll();
    _markDirty();
    return;
  }

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
  // S126 #6 — Dimension move handling. Two sub-cases:
  //   (a) Vertex drag in progress → update endpoint of the dim being edited
  //   (b) Chain in progress → update preview offset / live label
  if (_tool === 'dimension') {
    var posDM = _getPos(e);
    var dim = window._dimTool;
    if (!dim) return;
    // (a0) Calibration in progress — after the FIRST calibration point, draw a
    //      live rubber-band dimension line to the cursor so calibration looks
    //      and feels like drawing a real dimension (S331 #37, locked spec §29),
    //      not clicking two bare dots. Display-only; nothing stored until save.
    if (_dimCalibrateMode && _dimCalibrateP1) {
      _renderCalibratePreview(_dimCalibrateP1, posDM);
      return;
    }
    // (a) Vertex drag
    if (_dimVertexEditId != null && _dimVertexDragHandle != null && _isDrawing) {
      var dragObj = _findObj(_dimVertexEditId);
      if (dragObj) {
        if (_dimVertexDragHandle === 0) {
          if (dragObj.mx1 != null) { dragObj.mx1 = posDM.x; dragObj.my1 = posDM.y; }
          else { dragObj.x1 = posDM.x; dragObj.y1 = posDM.y; }
        } else {
          if (dragObj.mx1 != null) { dragObj.mx2 = posDM.x; dragObj.my2 = posDM.y; }
          else { dragObj.x2 = posDM.x; dragObj.y2 = posDM.y; }
        }
        // Live label recompute (overrideLabel preserved per spec)
        var drDM = _getCurrentDrawing();
        var calDM = dim.getCalibration(drDM);
        if (calDM) {
          var aax = dragObj.mx1 != null ? dragObj.mx1 : dragObj.x1;
          var aay = dragObj.mx1 != null ? dragObj.my1 : dragObj.y1;
          var bbx = dragObj.mx1 != null ? dragObj.mx2 : dragObj.x2;
          var bby = dragObj.mx1 != null ? dragObj.my2 : dragObj.y2;
          var labDM = dim.computeLabel(aax, aay, bbx, bby, calDM);
          if (labDM) {
            dragObj.rawValue = labDM.rawValue;
            dragObj.rawLabel = labDM.rawLabel;
          }
        }
        _renderAll();
      }
      return;
    }
    // (b) Chain preview (awaitB or awaitOffset state)
    var stDM = dim.getState();
    if (stDM.state !== 'idle') {
      dim.handleMove(posDM);
      _renderDimensionPreview();
      return;
    }
    return;
  }

  // S126 #5 — Click-to-draw cursor tracking. When the user has placed point
  // A but not yet committed point B, every cursor move (mouse) or finger
  // move (touch, only while finger is down between taps — pure two-tap
  // pattern has no preview between taps by design) updates the live preview.
  // The preview path uses _drawShapeObj so what the user sees equals what
  // gets committed.
  if (_isClickToDrawShape(_tool) && _clickFirstPt) {
    var posC = _getPos(e);
    _endX = posC.x;
    _endY = posC.y;
    var ovC = _getOverlay();
    if (!ovC) return;
    var cxC = ovC.getContext('2d');
    var dC = ovC._dpr || 1;
    cxC.setTransform(1, 0, 0, 1, 0, 0);
    cxC.clearRect(0, 0, ovC.width, ovC.height);
    cxC.setTransform(dC, 0, 0, dC, 0, 0);
    cxC.save();
    cxC.globalAlpha = _opacity;
    cxC.strokeStyle = _color;
    cxC.fillStyle = _color;
    cxC.lineWidth = _lineWidth;
    cxC.lineCap = 'round';
    cxC.lineJoin = 'round';
    _drawShapeObj(cxC, _tool, _clickFirstPt.x, _clickFirstPt.y, posC.x, posC.y);
    cxC.restore();
    return;
  }

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
  // S126 #6 — Dimension tool: only vertex drag commits on mouseup. The
  // click-to-add flow lives entirely in _startDraw via handleClick.
  if (_tool === 'dimension') {
    if (_dimVertexDragHandle != null) {
      _dimVertexDragHandle = null;
      _isDrawing = false;
      _pushHistory();
      _markDirty();
      if (TiledPdf.isActive()) { TiledPdf.resume(); TiledPdf.scheduleRender(); }
    }
    return;
  }

  // S126 #5 — Click-to-draw shapes don't commit on mouseup/touchend; the
  // commit happens on the SECOND mousedown/touchstart. Just bail. Pen,
  // highlight, and eraser still use drag and continue through the original
  // path below.
  if (_isClickToDrawShape(_tool)) return;

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
  }
  // S126 #6 — dimension commit/calibration NO longer drag-based. The new
  // flow lives in _startDraw (handleClick state machine) so we don't push
  // anything here for type === 'dimension'.
  else if (type && type !== 'polyline' && type !== 'select' && type !== 'text' && type !== 'dimension') {
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

  // S114 Push 4: two-step text flow — if a text input is already active, this
  // click just COMMITS it (via blur). The next click creates a new text box.
  // Prevents the "click confirms + immediately opens new ghost text box" bug.
  var existing = document.querySelector('.mk-text-input-live');
  if (existing) {
    existing.blur(); // triggers the blur listener's commit path
    return;
  }

  // Get screen position of click — derive from the logical click pos and the
  // canvas rect so the input sits EXACTLY where the committed text will render,
  // at the current zoom. (Old code used raw e.clientX/Y, which diverged from the
  // logical anchor whenever the canvas was panned/zoomed — the "not where I
  // clicked" bug.)
  var rectMc = mc.getBoundingClientRect();
  var lwMc = mc._logicalW || mc.width;
  var zoom = rectMc.width / lwMc;                 // CSS px per logical unit
  var screenFontPx = _fontSize * zoom;
  // Committed anchor: x1 = pos.x, y1 = pos.y + _fontSize (baseline one line below
  // the click). Input top-left aligns so its text baseline lands on that anchor.
  var screenX = rectMc.left + pos.x * zoom;
  var screenY = rectMc.top + pos.y * zoom;        // top of the text box

  var input = document.createElement('textarea');
  input.className = 'mk-text-input-live mk-text-paint';
  // MS-Paint style: transparent, no border box, no resize chrome, no hatch.
  // What you type IS the live preview, in the current colour and the on-screen
  // font size at this zoom. A faint 1px colour tick marks an empty field.
  input.style.cssText = 'position:fixed;z-index:99999;display:block;margin:0;padding:0;'+
    'background:transparent;border:none;outline:none;resize:none;overflow:hidden;'+
    'white-space:pre;color:' + _color + ';caret-color:' + _color + ';'+
    'font:' + '400 ' + screenFontPx + 'px/1 Calibri,sans-serif;'+
    'min-width:8px;width:8px;height:' + (screenFontPx * 1.25) + 'px;'+
    'box-shadow:-1px 0 0 0 ' + _color + ';';
  input.style.left = screenX + 'px';
  input.style.top = screenY + 'px';

  // Append inside the viewer overlay for z-index compatibility
  var overlay = document.getElementById('drawing-viewer-overlay');
  (overlay || document.body).appendChild(input);

  input._mkX = pos.x;
  input._mkY = pos.y + _fontSize;

  // Auto-grow width so the caret tracks the end of the typed text
  var _meas = document.createElement('span');
  _meas.style.cssText = 'position:fixed;visibility:hidden;white-space:pre;font:' + '400 ' + screenFontPx + 'px/1 Calibri,sans-serif;';
  (overlay || document.body).appendChild(_meas);
  function _grow(){ _meas.textContent = input.value || ''; input.style.width = (_meas.offsetWidth + 4) + 'px'; }

  setTimeout(function() { input.focus(); }, 80);

  var committed = false;
  function _cleanupMeas(){ if (_meas.parentNode) _meas.parentNode.removeChild(_meas); }
  function _commit() {
    if (committed) return;
    committed = true;
    var txt = input.value.trim();
    if (input.parentNode) input.parentNode.removeChild(input);
    _cleanupMeas();
    if (txt) {
      _objects.push({
        id: _newId(), type: 'text', text: txt,
        x1: input._mkX, y1: input._mkY,
        color: _color, fontSize: _fontSize, bold: false, opacity: _opacity,
        border: _textBorderDefault, hatch: _textHatchDefault
      });
      _pushHistory();
      _renderAll();
      _markDirty();
      console.log('[Markup] Text committed:', txt);
    }
  }
  input.addEventListener('input', _grow);
  input.addEventListener('blur', function() { setTimeout(_commit, 150); });
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); _commit(); }
    if (ev.key === 'Escape') { if (input.parentNode) input.parentNode.removeChild(input); _cleanupMeas(); committed = true; }
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
    _tombstone(_selectedIds);  // S129 1.1
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
      _syncTextDecoButtons();
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
    _syncTextDecoButtons();
    _renderAll();
  } else {
    // Clicked empty space — start rubber-band
    _selectedIds = [];
    _rubberBand = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    _dragState = { type: 'rubberband' };
    _syncTextDecoButtons();
    _renderAll();
  }
}

function _editTextObject(obj, e) {
  var mc = _getCanvas();
  if (!mc) return;

  // Remove previous text input
  var prev = document.querySelectorAll('.mk-text-input-live');
  prev.forEach(function(el) { if (el.parentNode) el.parentNode.removeChild(el); });

  // Calculate screen position from logical coords (zoom-aware)
  var r = mc.getBoundingClientRect();
  var lw = mc._logicalW || mc.width;
  var lh = mc._logicalH || mc.height;
  var zoomE = r.width / lw;                         // CSS px per logical unit
  var screenX = r.left + (obj.x1 / lw) * r.width;
  var screenY = r.top + ((obj.y1 - (obj.fontSize || 20)) / lh) * r.height;

  _color = obj.color || _color;
  _fontSize = obj.fontSize || 20;
  _opacity = obj.opacity != null ? obj.opacity : 1;
  _updateColorSwatch();
  _updateSizeLabels();

  var screenFontPxE = _fontSize * zoomE;
  var input = document.createElement('textarea');
  input.className = 'mk-text-input-live mk-text-paint';
  // MS-Paint style: bare, transparent, no border/box/hatch — matches the create
  // flow (_handleTextPlace). On-screen font scaled to current zoom so the edit
  // preview matches how the text renders.
  input.style.cssText = 'position:fixed;z-index:99999;display:block;margin:0;padding:0;'+
    'background:transparent;border:none;outline:none;resize:none;overflow:hidden;'+
    'white-space:pre;color:' + _color + ';caret-color:' + _color + ';'+
    'font:400 ' + screenFontPxE + 'px/1 Calibri,sans-serif;'+
    'min-width:8px;height:' + (screenFontPxE * 1.25) + 'px;'+
    'box-shadow:-1px 0 0 0 ' + _color + ';';
  input.style.left = screenX + 'px';
  input.style.top = screenY + 'px';
  input.value = obj.text || '';

  var overlay = document.getElementById('drawing-viewer-overlay');
  (overlay || document.body).appendChild(input);

  // Auto-grow width to the text so the box hugs the content (no fixed 120px box)
  var _measE = document.createElement('span');
  _measE.style.cssText = 'position:fixed;visibility:hidden;white-space:pre;font:400 ' + screenFontPxE + 'px/1 Calibri,sans-serif;';
  (overlay || document.body).appendChild(_measE);
  function _growE(){ _measE.textContent = input.value || ''; input.style.width = (_measE.offsetWidth + 4) + 'px'; }
  _growE();

  input._mkX = obj.x1;
  input._mkY = obj.y1;
  input._editObjId = obj.id;

  setTimeout(function() { input.focus(); input.select(); }, 80);

  var committed = false;
  function _cleanupMeasE(){ if (_measE.parentNode) _measE.parentNode.removeChild(_measE); }
  function _commit() {
    if (committed) return;
    committed = true;
    var txt = input.value.trim();
    if (input.parentNode) input.parentNode.removeChild(input);
    _cleanupMeasE();
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
      _tombstone([obj.id]);  // S129 1.1
      _objects = _objects.filter(function(o) { return o.id !== obj.id; });
      _pushHistory();
      _renderAll();
      _markDirty();
    }
  }
  input.addEventListener('input', _growE);
  input.addEventListener('blur', function() { setTimeout(_commit, 150); });
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); _commit(); }
    if (ev.key === 'Escape') { if (input.parentNode) input.parentNode.removeChild(input); _cleanupMeasE(); committed = true; _renderAll(); }
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
    _syncTextDecoButtons();
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

function _markDirty() {
  _dirty = true;
  // S125 hotfix 8 — Schedule a debounced auto-flush. Previously markups
  // ONLY flushed to Model+IDB on Markup.destroy() (drawing close) or an
  // explicit saveNow(). If the user hit Ctrl+Shift+R while a drawing was
  // open, strokes never made it past _objects[] and were lost. With the
  // S123 cloud-push every 15s, this also means strokes weren't reaching
  // the cloud — making "hard refresh wipes my markups" possible even on
  // the same device.
  // 1.2 s debounce: fast enough to flush mid-session pauses, slow enough
  // that rapid pen scribbles batch into one IDB write per pause.
  if (_autosaveTimer) clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(function() {
    _autosaveTimer = null;
    if (_dirty && _drawingId) _saveMarkup();
  }, 1200);
}
var _autosaveTimer = null;

// S126 Phase B — guard against race between in-flight R2 download (load)
// and concurrent save. If the load is still resolving when the user
// commits the first stroke, an empty _objects[] snapshot would push to R2
// and wipe what the download was about to populate. We block saves while
// _markupLoadInflight is true.
var _markupLoadInflight = false;
// In-flight upload guard so rapid debounces don't race against each other
// on the same R2 key. The Worker has no version semantics, so we serialize.
var _markupUploadInflight = false;
// If a save is requested while an upload is in flight, queue exactly one
// follow-up. Multiple queued saves collapse to one — the latest _objects
// snapshot is what ships next.
var _markupSavePending = false;

/**
 * S126 Phase B — Persist current _objects[] to:
 *   1. IDB markupObjects store (offline-safe, fast, durable across reloads)
 *   2. R2 per-drawing JSON binary at photos/{pid}/frt/markup/{drawingId}.json
 *      — durable cloud store, last-write-wins per drawing
 *   3. Model: drawing.markupR2 reference object (NOT markupObjects array)
 *      The cloud strip in sync.js removes drawing.markupObjects but keeps
 *      markupR2.
 *
 * Race protection:
 *   - Skip entirely while a load is in flight (would overwrite remote with stale local)
 *   - Serialize uploads to the same R2 key; queue follow-ups, collapse to one
 *
 * Failure modes:
 *   - IDB error: logged, save continues (R2 may still succeed)
 *   - R2 error: drawing.markupR2 NOT updated; IDB save remains as offline
 *     backup; next save retries.
 */
function _saveMarkup() {
  if (!_drawingId) return;
  if (_markupLoadInflight) {
    // Load racing in — let the debounce re-arm naturally after load resolves
    return;
  }
  if (_markupUploadInflight) {
    _markupSavePending = true;
    return;
  }
  var proj = Model.getProject();
  if (!proj) return;
  // S132 — use the canonical Hub ?project= UUID for the R2 key, matching
  // drawings/tiles/photos/pdfbufs. proj.id is the standalone-mode fallback.
  // Previously this used proj.id unconditionally, which put markup in a
  // different R2 folder than the rest of the project's assets.
  var projectId = (new URLSearchParams(window.location.search).get('project')) || proj.id;
  var drawingId = _drawingId;
  var snapshot = JSON.parse(JSON.stringify(_objects));
  // S129 Item 1.1 — snapshot tombstones alongside objects for atomic upload.
  var tombSnapshot = _tombstones.slice();

  // (1) IDB always wins first — offline-safe durable cache.
  // S129 Item 1.1 — IDB record now carries deletedIds so an offline reload
  // restores tombstones too (not just objects).
  IDB.put('markupObjects', {
    id: drawingId,
    drawingId: drawingId,
    objects: snapshot,
    deletedIds: tombSnapshot
  }).then(function() {
    console.log('[Markup] IDB saved ' + snapshot.length + ' objects, ' +
                tombSnapshot.length + ' tombstones for drawing ' + drawingId);
  }).catch(function(err) {
    console.warn('[Markup] IDB save error:', err);
  });

  // (2) R2 upload with tombstones. On success, write drawing.markupR2
  // reference + Model.saveNow.
  _markupUploadInflight = true;
  R2.uploadMarkup(projectId, drawingId, snapshot, tombSnapshot).then(function(result) {
    _markupUploadInflight = false;
    if (result) {
      // Find the drawing in the (possibly mutated since save started) live model
      var live = Model.getProject();
      if (live && live.drawings) {
        for (var i = 0; i < live.drawings.length; i++) {
          if (live.drawings[i].id === drawingId) {
            // Strip legacy field; cloud strip in sync.js does this too, but
            // keeping it off the local model avoids accidental re-population
            // through a merge cycle.
            delete live.drawings[i].markupObjects;
            // Write the new reference. inspectorId optional; merge engine
            // handles markupR2 as a field-by-field object.
            var user = (typeof window !== 'undefined' && window.Auth && window.Auth.getUser)
              ? window.Auth.getUser() : null;
            live.drawings[i].markupR2 = {
              r2Key: result.r2Key,
              r2Url: result.r2Url,
              count: result.count,
              deletedCount: result.deletedCount || 0,
              bytes: result.bytes,
              updatedAt: new Date().toISOString(),
              inspectorId: user ? user.id : null
            };
            break;
          }
        }
      }
      Model.saveNow();
    } else {
      console.warn('[Markup] R2 upload returned no result; markupR2 reference NOT updated. Next save retries.');
    }
    // If a save came in while we were uploading, run it now with the
    // latest _objects[] state (not the snapshot we just shipped).
    if (_markupSavePending) {
      _markupSavePending = false;
      _saveMarkup();
    }
  }).catch(function(err) {
    _markupUploadInflight = false;
    console.warn('[Markup] R2 upload error:', err && err.message || err);
    if (_markupSavePending) {
      _markupSavePending = false;
      _saveMarkup();
    }
  });

  _dirty = false;
}

function _loadMarkup(drawingId) {
  _objects = [];
  _tombstones = [];  // S129 1.1
  _undoStack = [];
  _redoStack = [];
  _selectedIds = [];

  // S130 — Resolution chain. ORDERING FIX:
  //   1. IDB markupObjects store  ← LOCAL SOURCE OF TRUTH, checked FIRST
  //   2. drawing.markupR2 → R2 JSON  ← cross-device fallback only
  //   3. Legacy drawing.markupObjects  ← back-compat, lazy-migrates
  //
  // Previously R2 was checked first. That caused the "markup needs two opens
  // to show correctly" bug: after you draw or delete, IDB has the newest
  // state immediately, but the R2 upload takes a few seconds. A fast
  // back-then-reopen fetched the STALE R2 copy (or an un-updated
  // drawing.markupR2 still pointing at the previous version), so the first
  // reopen showed old state and only the second showed the truth.
  //
  // IDB is the permanent local backup and on a single device is always
  // newer-or-equal to R2 (project knowledge: "IDB is permanent backup, not
  // a cache"). So check IDB first; fall through to R2 only when IDB has
  // nothing for this drawing — the genuine cross-device case.
  // Non-blocking — _renderAll runs as soon as a source resolves.

  var proj = Model.getProject();
  if (!proj) {
    _renderAll();
    _updateUndoButtons();
    return;
  }
  // S132 — canonical Hub ?project= UUID for R2 keys (see _saveMarkup note).
  var projectId = (new URLSearchParams(window.location.search).get('project')) || proj.id;
  var drawing = null;
  if (proj.drawings) {
    for (var i = 0; i < proj.drawings.length; i++) {
      if (proj.drawings[i].id === drawingId) { drawing = proj.drawings[i]; break; }
    }
  }
  if (!drawing) {
    _renderAll();
    _updateUndoButtons();
    return;
  }

  // IDB first — local source of truth. _loadMarkupFromIDB falls through to
  // the R2 path (and then legacy) when IDB has nothing for this drawing.
  _loadMarkupFromIDB(drawingId, drawing, projectId);
}

/**
 * S130 — R2 fallback. Reached from _loadMarkupFromIDB ONLY when IDB has no
 * record for this drawing — a genuine cross-device case (markup created on
 * another device, only in the cloud) or a fresh device. On success the R2
 * data is mirrored into IDB so the next open is instant and local-first.
 */
function _loadMarkupFromR2(drawingId, drawing, projectId) {
  var _loadToken = drawingId;
  if (drawing && drawing.markupR2 && drawing.markupR2.r2Url) {
    _markupLoadInflight = true;
    R2.downloadMarkup(drawing.markupR2.r2Url).then(function(blob) {
      _markupLoadInflight = false;
      if (_drawingId !== _loadToken) {
        console.log('[Markup] R2 load resolved for stale drawing — discarding:', _loadToken);
        return;
      }
      if (blob && blob.objects && (blob.objects.length || blob.deletedIds.length)) {
        _objects = blob.objects;
        // S133 — backward-compat normalize (R2 may hold legacy string entries).
        _tombstones = _normalizeTombstones(blob.deletedIds);
        console.log('[Markup] Loaded ' + _objects.length + ' objects + ' +
                    _tombstones.length + ' tombstones from R2 (cross-device)');
        // Mirror into IDB so subsequent loads are instant and local-first.
        IDB.put('markupObjects', {
          id: drawingId, drawingId: drawingId,
          objects: _objects, deletedIds: _tombstones
        }).catch(function() {});
        _renderAll();
        _updateUndoButtons();
        if (_useWebGL && !_webglReady && _webglInitPromise) {
          _webglInitPromise.then(function() {
            if (_drawingId === _loadToken) _renderAll();
          });
        }
        return;
      }
      // R2 reference exists but empty — nothing anywhere for this drawing.
      console.log('[Markup] No markup for drawing ' + drawingId + ' (IDB + R2 both empty)');
      _renderAll();
      _updateUndoButtons();
    }).catch(function(err) {
      _markupLoadInflight = false;
      if (_drawingId !== _loadToken) return;
      console.warn('[Markup] R2 load error:', err && err.message || err);
      _renderAll();
      _updateUndoButtons();
    });
    return;
  }
  // No R2 reference and IDB was empty — genuinely nothing for this drawing.
  console.log('[Markup] No markup for drawing ' + drawingId);
  _renderAll();
  _updateUndoButtons();
}

/**
 * S126 Phase B — fallback when R2 reference is absent or fetch failed.
 * IDB first, then legacy drawing.markupObjects. Path 3 triggers lazy
 * migration: upload to R2 and write the reference so the next load uses
 * path 1.
 */
function _loadMarkupFromIDB(drawingId, drawing, projectId) {
  // S130 — same stale-completion guard as the R2 path. If the user navigates
  // away before this async IDB read resolves, don't paint into a stale or
  // destroyed canvas. Also chain a second render onto WebGL init so the GPU
  // canvas gets the strokes even on a fast back-then-reopen.
  var _loadToken = drawingId;
  function _renderWhenReady() {
    _renderAll();
    _updateUndoButtons();
    if (_useWebGL && !_webglReady && _webglInitPromise) {
      _webglInitPromise.then(function() {
        if (_drawingId === _loadToken) _renderAll();
      });
    }
  }
  IDB.get('markupObjects', drawingId).then(function(rec) {
    if (_drawingId !== _loadToken) return; // stale — viewer moved on
    if (rec && (
      (rec.objects && rec.objects.length) ||
      (Array.isArray(rec.deletedIds) && rec.deletedIds.length)
    )) {
      _objects = Array.isArray(rec.objects) ? rec.objects : [];
      // S129 1.1 — restore tombstones from IDB record (defensive on shape).
      // S133 — normalize legacy string entries to {id, t} for the new format.
      _tombstones = _normalizeTombstones(rec.deletedIds);
      console.log('[Markup] Loaded ' + _objects.length + ' objects + ' +
                  _tombstones.length + ' tombstones from IDB');
      _renderWhenReady();
      return;
    }
    // Path 3 — legacy field on the drawing
    if (drawing && drawing.markupObjects && drawing.markupObjects.length) {
      _objects = JSON.parse(JSON.stringify(drawing.markupObjects));
      // No tombstones in legacy format — leave _tombstones = [] from _loadMarkup.
      console.log('[Markup] Loaded ' + _objects.length + ' legacy objects — migrating to R2');
      _renderWhenReady();
      // Lazy migration — upload to R2 + write the reference. S129 1.1: pass
      // empty tombstones (legacy never had any).
      if (projectId && !_markupUploadInflight) {
        _markupUploadInflight = true;
        R2.uploadMarkup(projectId, drawingId, _objects, []).then(function(result) {
          _markupUploadInflight = false;
          if (result) {
            var live = Model.getProject();
            if (live && live.drawings) {
              for (var i = 0; i < live.drawings.length; i++) {
                if (live.drawings[i].id === drawingId) {
                  delete live.drawings[i].markupObjects;
                  var user = (typeof window !== 'undefined' && window.Auth && window.Auth.getUser)
                    ? window.Auth.getUser() : null;
                  live.drawings[i].markupR2 = {
                    r2Key: result.r2Key,
                    r2Url: result.r2Url,
                    count: result.count,
                    deletedCount: result.deletedCount || 0,
                    bytes: result.bytes,
                    updatedAt: new Date().toISOString(),
                    inspectorId: user ? user.id : null,
                    _migratedFromLegacy: true
                  };
                  break;
                }
              }
            }
            IDB.put('markupObjects', {
              id: drawingId, drawingId: drawingId,
              objects: _objects, deletedIds: []
            }).catch(function() {});
            Model.saveNow();
            console.log('[Markup] Migrated drawing ' + drawingId + ' to R2 markupR2 reference');
          }
        }).catch(function(err) {
          _markupUploadInflight = false;
          console.warn('[Markup] Lazy migration upload failed:', err && err.message || err);
        });
      }
      return;
    }
    // S130 — IDB had nothing for this drawing AND no legacy field. Fall
    // through to the R2 path: the genuine cross-device case where the markup
    // only exists in the cloud (created on another device / fresh device).
    _loadMarkupFromR2(drawingId, drawing, projectId);
  }).catch(function(err) {
    console.warn('[Markup] IDB load error, falling back to R2:', err);
    _loadMarkupFromR2(drawingId, drawing, projectId);
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

// S329 (#24, Mark): apply a typed opacity percentage (10–100) through the same
// path as the +/- steppers — mutate selected objects if any, else the module
// default. Used by the click-to-type opacity inputs.
function _setOpacityPct(pct) {
  pct = Math.max(10, Math.min(100, Math.round(pct)));
  var frac = pct / 100;
  if (_selectedIds.length) {
    _selectedIds.forEach(function(id) {
      var obj = _findObj(id);
      if (obj) obj.opacity = frac;
    });
    _renderAll();
    _markDirty();
  } else {
    _opacity = frac;
  }
  _updateSizeLabels();
}

function _updateColorSwatch() {
  var sw = document.getElementById('mk-color-swatch');
  if (sw) sw.style.background = _color;
  var cd = document.getElementById('ctx-color-dot');
  if (cd) cd.style.background = _color;
}

// S126 #7 — Sync the Border + Hatch toggle buttons' visibility and
// .active classes. Pulls state from the active source:
//   - Text tool active → show group; reflect _textBorderDefault / _textHatchDefault
//   - Select tool with selected text obj(s) → show group; reflect any
//     selected text's border / hatch (mixed selection treats as "off"
//     so first click flips all to ON)
//   - Otherwise → hide group, both inactive
function _syncTextDecoButtons() {
  var bBtn = document.querySelector('[data-ctx="text-border"]');
  var hBtn = document.querySelector('[data-ctx="text-hatch"]');
  var grp = document.getElementById('ctx-text-deco-group');
  if (!bBtn || !hBtn) return;
  var visible = false;
  var bOn = false, hOn = false;
  if (_tool === 'text') {
    visible = true;
    bOn = !!_textBorderDefault;
    hOn = !!_textHatchDefault;
  } else if (_tool === 'select' && _selectedIds.length) {
    var textObjs = [];
    for (var i = 0; i < _selectedIds.length; i++) {
      var o = _findObj(_selectedIds[i]);
      if (o && o.type === 'text') textObjs.push(o);
    }
    if (textObjs.length) {
      visible = true;
      bOn = textObjs.every(function (o) { return !!o.border; });
      hOn = textObjs.every(function (o) { return !!o.hatch; });
    }
  }
  if (grp) grp.style.display = visible ? '' : 'none';
  bBtn.classList.toggle('active', bOn);
  hBtn.classList.toggle('active', hOn);
}

function _setActiveTool(tool) {
  if (_tool === 'polyline' && _polyPoints.length >= 2 && tool !== 'polyline') {
    _finishPolyline();
  }

  _tool = tool;
  _selectedIds = [];
  _rubberBand = null;
  _isDrawing = false;
  // S126 #5 — Switching tools cancels any in-progress click-to-draw shape
  _cancelClickToDraw();
  // S126 #6 — Switching tools cancels any in-progress dimension chain /
  // calibrate mode / vertex edit. The sub-toolbar visibility is also
  // bound to whether tool is 'dimension'.
  if (tool !== 'dimension') {
    _resetDimensionFlow();
  }
  var dimSub = document.getElementById('dim-sub-toolbar');
  if (dimSub) dimSub.style.display = (tool === 'dimension') ? 'flex' : 'none';

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

  // S126 #7 — Text deco group visibility + active state. Helper handles
  // both since they share the same source-of-truth logic.
  _syncTextDecoButtons();

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

    // S126 #6 — Dimension sub-toolbar buttons (Calibrate / Add / mode pill).
    // Lives on the floating panel that appears when dimension tool is active.
    var dimCalBtn = e.target.closest && e.target.closest('#dim-calibrate-btn');
    if (dimCalBtn) {
      _dimCalibrateMode = true;
      _dimCalibrateP1 = null;
      // End any in-progress chain so calibrate clicks don't confuse the state machine
      if (window._dimTool && window._dimTool.resetState) window._dimTool.resetState();
      _dimVertexEditId = null;
      _dimVertexDragHandle = null;
      var ovCalClick = _getOverlay();
      if (ovCalClick) {
        ovCalClick.style.display = 'none';
        var cCalClick = ovCalClick.getContext('2d');
        cCalClick.setTransform(1, 0, 0, 1, 0, 0);
        cCalClick.clearRect(0, 0, ovCalClick.width, ovCalClick.height);
      }
      dimCalBtn.classList.add('active');
      var addBtnPair = document.getElementById('dim-add-btn');
      if (addBtnPair) addBtnPair.classList.remove('active');
      _renderAll();
      e.stopPropagation();
      return;
    }
    var dimAddBtn = e.target.closest && e.target.closest('#dim-add-btn');
    if (dimAddBtn) {
      _dimCalibrateMode = false;
      _dimCalibrateP1 = null;
      dimAddBtn.classList.add('active');
      var calBtnPair = document.getElementById('dim-calibrate-btn');
      if (calBtnPair) calBtnPair.classList.remove('active');
      var ovAddClick = _getOverlay();
      if (ovAddClick) {
        ovAddClick.style.display = 'none';
        var cAddClick = ovAddClick.getContext('2d');
        cAddClick.setTransform(1, 0, 0, 1, 0, 0);
        cAddClick.clearRect(0, 0, ovAddClick.width, ovAddClick.height);
      }
      e.stopPropagation();
      return;
    }
    var dimModeBtn = e.target.closest && e.target.closest('[data-dim-mode]');
    if (dimModeBtn) {
      var mode = dimModeBtn.getAttribute('data-dim-mode');
      var dimM = window._dimTool;
      if (dimM && dimM.setMode) dimM.setMode(mode);
      // Update active class on the three mode buttons
      var pillContainer = dimModeBtn.parentNode;
      if (pillContainer) {
        var siblings = pillContainer.querySelectorAll('[data-dim-mode]');
        for (var ms = 0; ms < siblings.length; ms++) {
          siblings[ms].classList.toggle('active', siblings[ms] === dimModeBtn);
        }
      }
      // Clear preview from any prior chain
      var ovMode = _getOverlay();
      if (ovMode) {
        ovMode.style.display = 'none';
        var cMode = ovMode.getContext('2d');
        cMode.setTransform(1, 0, 0, 1, 0, 0);
        cMode.clearRect(0, 0, ovMode.width, ovMode.height);
      }
      // S330 #37 — switching INTO continuous/running with existing dims
      // offers the pickup picker (continue / pick a point / fresh).
      var hasDims = false;
      for (var hd = 0; hd < _objects.length; hd++) { if (_objects[hd] && _objects[hd].type === 'dimension') { hasDims = true; break; } }
      if ((mode === 'continuous' || mode === 'running') && hasDims) {
        var pt = document.getElementById('dim-pick-title');
        if (pt) pt.textContent = (mode === 'running' ? 'Running' : 'Continuous') + ' dimension';
        var pb = document.getElementById('dim-pick-back');
        if (pb) pb.classList.add('show');
      }
      _updateDimFinChip();
      _renderAll();
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

    // S329 (#24, Mark): CLICK-TO-TYPE opacity on both opacity value labels
    // (#ctx-opacity-val compact bar, #mk-opacity-val desktop toolbar). Click the
    // number -> inline editable input; type 10–100; Enter/blur commits clamped,
    // Esc cancels. +/- steppers untouched (still 10% steps via the data-ctx path).
    var _opTypeTarget = e.target && e.target.closest && e.target.closest('#ctx-opacity-val,#mk-opacity-val');
    if (_opTypeTarget && !_opTypeTarget._opEditing) {
      _opTypeTarget._opEditing = true;
      var _cur = Math.round(_opacity * 100);
      var _span = _opTypeTarget;
      var _inp = document.createElement('input');
      _inp.type = 'number'; _inp.min = '10'; _inp.max = '100'; _inp.value = String(_cur);
      _inp.className = _span.className;
      _inp.style.cssText = 'width:40px;text-align:center;font:inherit;border:1px solid #9C2742;border-radius:3px;padding:0;background:#fff;color:#1B1A22;';
      var _commit = function(apply){
        if (!_span._opEditing) return; _span._opEditing = false;
        if (apply) { var v = parseInt(_inp.value, 10); if (!isNaN(v)) _setOpacityPct(v); }
        _inp.removeAttribute('id');
        if (_inp.parentNode) _inp.parentNode.replaceChild(_span, _inp);
        _span.id = _opTypeTarget._opIdRestore;  // restore original id on the span
        _updateSizeLabels();
      };
      _inp.addEventListener('keydown', function(ev){
        if (ev.key === 'Enter') { ev.preventDefault(); _commit(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); _commit(false); }
      });
      _inp.addEventListener('blur', function(){ _commit(true); });
      _inp.addEventListener('click', function(ev){ ev.stopPropagation(); });
      if (_span.parentNode) {
        _opTypeTarget._opIdRestore = _span.id;   // save original id
        _span.removeAttribute('id');             // free the id
        _inp.id = _opTypeTarget._opIdRestore;    // input takes the id during edit
        _span.parentNode.replaceChild(_inp, _span); _inp.focus(); _inp.select();
      }
      else { _span._opEditing = false; }
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
        // Scale the on-screen preview by current zoom so it matches how the
        // committed text will render (logical fontSize × CSS-px-per-logical-unit).
        var _mcLT = _getCanvas();
        var _zoomLT = 1;
        if (_mcLT) { var _rLT = _mcLT.getBoundingClientRect(); var _lwLT = _mcLT._logicalW || _mcLT.width; if (_lwLT) _zoomLT = _rLT.width / _lwLT; }
        liveText.style.fontSize = (_fontSize * _zoomLT) + 'px';
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
          _tombstone(_selectedIds);  // S129 1.1
          _objects = _objects.filter(function(o) { return _selectedIds.indexOf(o.id) === -1; });
          _selectedIds = [];
          _pushHistory();
          _renderAll();
          _markDirty();
        }
        return;
      }
      // S126 #7 — Text decoration toggles. Two sources of truth:
      //   - Text tool active: toggle the module default for the next new
      //     text box. No selected objects to mutate.
      //   - Select tool with text selected: flip the field on every
      //     selected text obj. Mixed selection (some on, some off) flips
      //     all to ON so a second click guarantees uniformity.
      else if (action === 'text-border' || action === 'text-hatch') {
        var field = (action === 'text-border') ? 'border' : 'hatch';
        if (_tool === 'text') {
          if (field === 'border') _textBorderDefault = !_textBorderDefault;
          else _textHatchDefault = !_textHatchDefault;
        } else if (_tool === 'select' && _selectedIds.length) {
          var textTargets = [];
          for (var ti = 0; ti < _selectedIds.length; ti++) {
            var to = _findObj(_selectedIds[ti]);
            if (to && to.type === 'text') textTargets.push(to);
          }
          if (textTargets.length) {
            var allOn = textTargets.every(function (o) { return !!o[field]; });
            var newVal = !allOn;
            for (var ti2 = 0; ti2 < textTargets.length; ti2++) {
              textTargets[ti2][field] = newVal;
            }
            _pushHistory();
            _renderAll();
            _markDirty();
          }
        }
        _syncTextDecoButtons();
        e.stopPropagation();
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
      // S126 #5 — also cancel any in-progress click-to-draw shape
      _cancelClickToDraw();
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
      // S126 #5 — also cancel any in-progress click-to-draw shape
      _cancelClickToDraw();
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

  // Double-click: finishes polyline OR edits text object OR ends dim chain
  mc.addEventListener('dblclick', function(e) {
    if (_tool === 'polyline' && _polyPoints.length >= 2) {
      _finishPolyline();
      return;
    }
    // S330 #37 — dbl-click no longer FINISHES a chain (that ate placement
    // clicks — locked spec §9). Instead: dbl-click on an existing dimension
    // opens its value keypad; dbl-click on empty space does nothing.
    if (_tool === 'dimension') {
      var dimDbl = window._dimTool;
      if (dimDbl && dimDbl.hitTestDimension) {
        var posDbl = _getPos(e);
        var hitDbl = dimDbl.hitTestDimension(posDbl, _objects);
        if (hitDbl) {
          _dimVertexEditId = hitDbl.id;
          _renderAll();
          _editDimensionLabel(hitDbl);
        }
      }
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
      // S126 #6 — Dimension tool: Esc dismisses vertex-edit handles, ends
      // any chain in progress, and exits calibrate mode. Tool stays active.
      if (_tool === 'dimension') {
        var dimEsc = window._dimTool;
        var hadState = (_dimVertexEditId != null) || _dimCalibrateMode ||
                       (dimEsc && dimEsc.getState && dimEsc.getState().state !== 'idle');
        if (hadState) {
          _resetDimensionFlow();
          // Restore the Add button as the active sub-toolbar action
          var calEscBtn = document.getElementById('dim-calibrate-btn');
          if (calEscBtn) calEscBtn.classList.remove('active');
          var addEscBtn = document.getElementById('dim-add-btn');
          if (addEscBtn) addEscBtn.classList.add('active');
          _renderAll();
          e.stopPropagation();
          return;
        }
      }
      // S126 #5 — Cancel click-to-draw mid-flow (between first and second
      // click). Tool stays active so the next first-click starts fresh.
      if (_clickFirstPt) {
        _cancelClickToDraw();
        _renderAll();
        e.stopPropagation();
        return;
      }
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
      _tombstone(_selectedIds);  // S129 1.1
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
        // S125 hotfix 11 — Universal placement.
        // The toolbar has three button shapes that all need tooltips:
        //   1. Main button with submenu (Drawing tools, Shapes, Color)
        //   2. Main button alone (Pin, Select, Text, Dimension, Eraser)
        //   3. Sub-tool button inside a submenu (Pen, Highlighter, etc.)
        // For ALL three, the only collision-free zone is past the
        // RIGHTMOST visible edge of the current row, vertically centered
        // on the hovered element. Compute "rightmost edge" dynamically:
        //   - If the button is inside a submenu → submenu.right
        //   - Else if the button's sibling submenu is visible → that.right
        //   - Else → button.right
        var rightEdge = r.right;
        var subInside = btn.closest && btn.closest('.tool-submenu');
        if (subInside) {
          rightEdge = subInside.getBoundingClientRect().right;
        } else {
          // Main button — check if it owns a submenu that's open
          var group = btn.closest && btn.closest('.tool-group');
          if (group) {
            var ownSub = group.querySelector('.tool-submenu');
            if (ownSub) {
              var subRect = ownSub.getBoundingClientRect();
              // Only consider it visible if it has nonzero width AND extends
              // beyond the button's right (which means it's popped open).
              if (subRect.width > 0 && subRect.right > r.right + 4) {
                rightEdge = subRect.right;
              }
            }
          }
        }
        // Tooltip height is small (~22 px). Center it on the hovered button.
        var tipH = 22;
        tooltip.style.left = (rightEdge + 8) + 'px';
        tooltip.style.top = (r.top + r.height / 2 - tipH / 2) + 'px';
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
    _wireDimensionV4();   // S330 #37 — keypad/unit-toggle/finish-chip/modals
    _loadMarkup(drawingId);
    // Default to pan mode (no tool active)
    _setActiveTool(null);

    console.log('[Markup] Initialized for drawing:', drawingId);
  },

  destroy: function() {
    if (_dirty && _drawingId) _saveMarkup();

    _drawingId = null;
    _objects = [];
    _tombstones = [];  // S129 1.1
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
  // S129 1.1 — expose tombstones for diagnostics + tests.
  getTombstones: function() { return _tombstones; },
  setTool: function(tool) { _setActiveTool(tool); },
  getTool: function() { return _tool; },
  renderAll: function() { _renderAll(); },
  // S113 Push 13: viewer-zoom-aware render resolution. Called from viewer.js
  // _applyTransform on every zoom change. Resizes canvas internal pixels
  // to match displayed pixels (capped at memory budget), then re-renders.
  // No-op if scale unchanged. Synchronous — fast enough not to need debounce
  // for normal zoom interactions (wheel-zoom + pinch-zoom).
  //
  // S183a: during an active pinch gesture (viewer calls setGestureActive(true)
  // on 2-finger touchstart), STORE the requested scale and return without
  // doing the expensive resize+_renderAll. On gesture end, viewer fires
  // setGestureActive(false) which applies the pending scale exactly once.
  // S182 instrumentation showed this single deferral is the highest-leverage
  // pan/zoom fix in the codebase.
  setRenderScale: function(s) {
    if (_gestureActive) {
      _pendingScale = s;
      return;
    }
    // S187 Item 2: when there are no markup objects to draw, the
    // resize is pure waste — backing-buffer realloc costs GPU texture
    // allocation with nothing to render into it afterwards. On FP-1
    // sprinkler (mkc=0, Mark's typical workflow) this is a meaningful
    // chunk of the 100-250ms residual pinch-end lag from S186.
    // _lastRenderScale is intentionally NOT updated: when the first
    // object is later added and setRenderScale fires again at the same
    // scale, the no-op early-return inside _resizeMarkupForScale will
    // see _lastRenderScale != current scale (still the previous value
    // or the -1 sentinel) and apply the resize at that moment.
    if (!_objects || _objects.length === 0) return;
    var prevScale = _lastRenderScale;
    _resizeMarkupForScale(s);
    // Only re-render if resize actually changed dimensions (early-return
    // inside _resizeMarkupForScale leaves _lastRenderScale untouched).
    if (_lastRenderScale !== prevScale) _renderAll();
  },
  // S183a: gesture-active toggle (called by viewer.js touchstart/touchend
  // for multi-touch pinch gestures). When transitioning to false, applies
  // any pending scale change exactly once via setRenderScale's normal path.
  // S187 Item 1: the resize + _renderAll is deferred to the next rAF so
  // the touchend frame can commit promptly (the gesture-final visual
  // position lands without the snap-resize blocking the same frame).
  // Total work is unchanged — it just shifts one frame later. Trims the
  // perceived freeze duration measured in S186 by ~30-50ms.
  // S187 Item 2: also skip the apply entirely when _objects is empty —
  // same rationale as the setRenderScale skip above.
  setGestureActive: function(active) {
    if (active === _gestureActive) return;
    _gestureActive = !!active;
    if (!_gestureActive && _pendingScale != null) {
      var s = _pendingScale;
      _pendingScale = null;
      // Item 2: nothing to draw, skip.
      if (!_objects || _objects.length === 0) return;
      var applyPending = function() {
        // Re-entry guard: if a new gesture started before this rAF
        // fired, the new gesture will accumulate its own _pendingScale
        // and apply at its own end. Don't double-apply here.
        if (_gestureActive) return;
        // Re-check object count: an _objects mutation could have
        // happened between the schedule and the fire.
        if (!_objects || _objects.length === 0) return;
        var prevScale = _lastRenderScale;
        _resizeMarkupForScale(s);
        if (_lastRenderScale !== prevScale) _renderAll();
      };
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(applyPending);
      } else {
        applyPending();
      }
    }
  },
  isActive: function() { return _tool && _tool !== 'pin'; },
  // S184c: surface markup object count for the per-drawing perf telemetry
  // (mkc column in the diagnostic TSV). Returns 0 if the array hasn't been
  // initialized yet (drawing not opened).
  getObjectCount: function() {
    try { return _objects ? _objects.length : 0; } catch (_e) { return 0; }
  }
};

export var initMarkup = Markup;




