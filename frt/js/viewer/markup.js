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
import { toast } from '../shared/toast.js';   // S574: trash-mode undo hint
import { buildSharedMenu } from '../../../lib/ui/headerEngine2.js';   // S581: the ⋯ menu IS the header dropdown
import { TiledPdf } from './tiledPdf.js';
import { Diag } from '../diag/memory.js';
import { deviceClass, deviceMaxPixels } from '../shared/deviceBudget.js';
// S461: drawing-viewer selection convergence — in-memory model = engine strokes,
// persisted v1 format byte-unchanged. Conversion + FRT hook pack live in the
// bridge (harnessed 55/55 against this file's own _getBounds / rotate oracles).
import { toStroke, toV1, buildHooks as buildSelHooks } from './markupSelBridge.js';

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
var _maxUndo = 30;
// S461 — the drawing viewer's selection is the SHARED engine
// (lib/ui/markupSelection.js), the same one behind the Diesel lightbox and the
// FRT photo lightbox: a selection fix lands once, everywhere. Selection state
// (selIds, drag, rubber-band) lives ON SelHost; the persisted v1 drawing format
// is untouched (conversion at the boundaries — see the bridge import above).
var SelHost = {
  get strokes() { return _objects; },            // live ref — engine splices/pushes it
  get canvas() { return _getCanvas(); },
  get ctx() { var c = _getCanvas(); return c ? c.getContext('2d') : null; },
  // Engine chrome scale is k = nw / rect.width. This getter makes k equal
  // _uiScale() EXACTLY, so selection chrome keeps the drawing viewer's
  // screen-constant sizing at every zoom (S342 rule) with zero engine changes.
  get nw() { var c = _getCanvas(); var w = c ? (c.getBoundingClientRect().width || 1) : 1; return _uiScale() * Math.max(1, w); },
  render: function() { _renderAll(); },
  _findStroke: function(id) { return _findObj(id); },
  _strokeBBox: function(s) { return _getBounds(toV1(s)); },
  _strokeCenter: function(s) { var b = this._strokeBBox(s); return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }; },
  _uid: function() { return _newId(); },
  _pushOp: function() { /* superseded by the logOp hook (→ _pushHistory + _markDirty) */ }
};
if (window.MarkupSelection) {
  window.MarkupSelection.install(SelHost, buildSelHooks({
    getBounds: _getBounds, pushHistory: _pushHistory, markDirty: _markDirty
  }));
  SelHost._selectSub = 'rubber';   // drawing viewer = classic rubber+click (no TAP UI)
  // S129 — deletions MUST tombstone (cross-inspector deletion sync). The engine
  // doesn't know tombstones, so wrap its delete: tombstone first, then the engine
  // splices + op-logs (logOp → _pushHistory captures objects AND tombstones
  // atomically, same order as the old inline delete path).
  var _engineDeleteSel = SelHost.deleteSelected.bind(SelHost);
  SelHost.deleteSelected = function () {
    if (this.hasSel()) _tombstone(this.selIds);
    _engineDeleteSel();
  };
  SelHost.onSelChange(function () { _syncTextDecoButtons(); _dvRefreshSelConfirm(); _dvRefreshTrashBar(); });   // S574
} else {
  console.error('[Markup] lib/ui/markupSelection.js missing — Select tool disabled');
}

// ── S461e: Select sub-tool flyout + ✓/✗ confirm bar — PORTED from the FRT
// lightbox (S339 block in frt/js/ui/lightbox.js), same styles, same engine
// APIs (setSelectSub / confirmPick / cancelSelect / isPicking / pickCount).
// Not a new design — the lightbox feature, now on the drawing viewer.
var _dvSelFly = null, _dvSelBar = null, _dvSelCnt = null, _dvSelOk = null;
function _dvEnsureSelChrome() {
  if (_dvSelFly) return;
  // ── S461n (Mark, repeatedly): the select sub-menu is a REAL .tool-submenu,
  // built exactly like #pen-submenu / #shapes-submenu — same wrapper, same
  // classes, same open/close mechanism, same _positionSubmenu(). Previous
  // rounds hand-built a floating fixed-position div and tried to IMITATE the
  // look; it could never match on PC or touch. Do not reintroduce that.
  var selBtn = document.getElementById('mk-select');
  if (!selBtn) return;

  // Wrap the existing Select button in a .tool-group (the pen/shape pattern)
  var grp = document.createElement('div');
  grp.className = 'tool-group';
  grp.id = 'tool-select-group';
  selBtn.parentNode.insertBefore(grp, selBtn);
  grp.appendChild(selBtn);
  var arrow = document.createElement('span');
  arrow.className = 'tool-group-arrow';
  arrow.textContent = '\u25B8';
  selBtn.appendChild(arrow);

  _dvSelFly = document.createElement('div');
  _dvSelFly.className = 'tool-submenu';       // inherits ALL submenu styling
  _dvSelFly.id = 'select-submenu';
  // S461u (Mark): redesigned icons — MARQUEE (dashed box + solid corner
  // handles, mirroring the real selection chrome; solid corners keep it crisp)
  // and TAP RIPPLE (fingertip dot + arcs — no hands). currentColor throughout
  // so active-state styling recolors both stroke and fills. The lightbox uses
  // THIS EXACT pair — one icon set, both hosts.
  _dvSelFly.innerHTML =
    '<button class="tool-btn sub-tool-btn" data-sel-sub="rubber" data-tip="Rubber-band">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path stroke-dasharray="3.2 2.8" d="M8.5 4h7M8.5 20h7M4 8.5v7M20 8.5v7"/><rect x="2" y="2" width="4.6" height="4.6" rx="0.8" fill="currentColor" stroke="none"/><rect x="17.4" y="2" width="4.6" height="4.6" rx="0.8" fill="currentColor" stroke="none"/><rect x="2" y="17.4" width="4.6" height="4.6" rx="0.8" fill="currentColor" stroke="none"/><rect x="17.4" y="17.4" width="4.6" height="4.6" rx="0.8" fill="currentColor" stroke="none"/></svg></button>' +
    '<button class="tool-btn sub-tool-btn" data-sel-sub="tap" data-tip="Tap select">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg></button>';
  grp.appendChild(_dvSelFly);

  function markSub(sub) {
    _dvSelFly.querySelectorAll('[data-sel-sub]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.selSub === sub);   // same 'active' class the app uses
    });
  }
  _dvSelFly.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-sel-sub]');
    if (!b) return;
    e.stopPropagation();
    SelHost.setSelectSub(b.dataset.selSub);
    markSub(b.dataset.selSub);
    // S487d (Mark): the parent Select button adopts the picked sub-tool's icon,
    // exactly like the pen/shapes group buttons do — one pattern, all groups.
    var selMain = document.getElementById('mk-select');
    if (selMain) {
      var svg = b.querySelector('svg');
      selMain.innerHTML = (svg ? svg.outerHTML : b.innerHTML) + '<span class="tool-group-arrow">\u25B8</span>';
    }
    _dvSelFly.classList.remove('open');
    _dvRefreshSelConfirm();
  });
  markSub('rubber');

  // Confirm bar — the shared pill metrics (unchanged).
  _dvSelBar = document.createElement('div'); _dvSelBar.id = 'dv-mk-confirm';
  _dvSelBar.style.cssText = _DV_PILL_BOX + 'left:50%;bottom:84px;transform:translateX(-50%);display:none;padding-left:12px;';
  _dvSelCnt = document.createElement('span'); _dvSelCnt.style.cssText = 'font:600 12px Calibri,sans-serif;color:#cfcad6;';
  _dvSelOk = document.createElement('button'); _dvSelOk.innerHTML = '\u2713'; _dvSelOk.title = 'Confirm \u2014 group these';
  _dvSelOk.style.cssText = 'border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:17px;color:#fff;background:#3FD08A;display:flex;align-items:center;justify-content:center;';
  var no = document.createElement('button'); no.innerHTML = '\u2715'; no.title = 'Cancel \u2014 clear selection';
  no.style.cssText = _DV_PILL_X;
  _dvSelBar.appendChild(_dvSelCnt); _dvSelBar.appendChild(_dvSelOk); _dvSelBar.appendChild(no);
  (document.getElementById('drawing-viewer-overlay') || document.body).appendChild(_dvSelBar);
  _dvSelOk.addEventListener('click', function () { (SelHost.confirmSelection || SelHost.confirmPick).call(SelHost); _dvRefreshSelConfirm(); });
  no.addEventListener('click', function () { SelHost.cancelSelect(); _dvRefreshSelConfirm(); });
}
function _dvToggleSelFly() {
  _dvEnsureSelChrome();
  if (!_dvSelFly) return;
  // Identical to the pen/shape group handler: close siblings, toggle 'open',
  // and let the app's own _positionSubmenu place it (PC and touch alike).
  var ps = document.getElementById('pen-submenu'); if (ps) ps.classList.remove('open');
  var ss = document.getElementById('shapes-submenu'); if (ss) ss.classList.remove('open');
  var wasOpen = _dvSelFly.classList.contains('open');
  _dvSelFly.classList.toggle('open');
  if (!wasOpen && typeof _positionSubmenu === 'function') {
    _positionSubmenu(_dvSelFly, document.getElementById('mk-select'));
  }
}
function _dvRefreshSelConfirm() {
  if (!_dvSelBar) { if (!SelHost.hasActiveSelection || !SelHost.hasActiveSelection()) return; _dvEnsureSelChrome(); }
  if (_tool !== 'select' || !SelHost.hasActiveSelection()) { _dvSelBar.style.display = 'none'; return; }
  _dvSelBar.style.display = 'flex';
  // S461t (Mark): ✓ stays through the whole lifecycle — confirm picks, then
  // confirm (finalize) the group after moving. Same rule as the lightbox.
  _dvSelOk.style.display = 'flex';
  _dvSelCnt.textContent = SelHost.isPicking() ? (SelHost.pickCount() + ' picked') : (SelHost.selCount() + ' selected');
}

// ── S574 TRASH MODE — drawing-viewer chrome (LOCKED_TRASH_MODE.md) ─────────
// The engine owns the behaviour (setTrashMode/_trashDown/deleteTrashPicks in
// lib/ui/markupSelection.js); this is only the host's bar — the same dark pill
// family as the select confirm bar, tick swapped for the red trash. Deletion
// routes through SelHost.deleteSelected, i.e. the TOMBSTONE-wrapped delete —
// trash mode is a new entry into the existing delete path, never a second one.
var _dvTrashBar = null, _dvTrashCnt = null;
function _dvEnsureTrashBar() {
  if (_dvTrashBar) return;
  _dvTrashBar = document.createElement('div');
  _dvTrashBar.id = 'dv-trash-confirm';
  _dvTrashBar.style.cssText = _DV_PILL_BOX + 'left:50%;bottom:84px;transform:translateX(-50%);padding-left:14px;display:none;';
  _dvTrashCnt = document.createElement('span');
  _dvTrashCnt.style.cssText = 'font:600 13px Calibri,sans-serif;color:#cfcad6;';
  var del = document.createElement('button');
  del.id = 'dv-trash-ok';
  del.title = 'Delete selected markups';
  del.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>';
  del.style.cssText = _DV_PILL_X;   // red circle — SEL.groupDelete family
  var no = document.createElement('button');
  no.id = 'dv-trash-no';
  no.innerHTML = '\u2715'; no.title = 'Cancel — clear selection';
  no.style.cssText = _DV_PILL_X.replace('#C0445F', 'rgba(255,255,255,.18)');   // grey ✕
  _dvTrashBar.appendChild(_dvTrashCnt); _dvTrashBar.appendChild(del); _dvTrashBar.appendChild(no);
  (document.getElementById('drawing-viewer-overlay') || document.body).appendChild(_dvTrashBar);
  del.addEventListener('click', function () {
    var n = SelHost.trashCount ? SelHost.trashCount() : 0;
    if (!n) return;
    // One-tap custom confirm modal — the real gate (never type-to-confirm).
    showConfirm('Delete Markups', 'Delete ' + n + ' selected markup' + (n > 1 ? 's' : '') + ' from this drawing? Undo can restore them.').then(function (yes) {
      if (!yes) return;
      var d = SelHost.deleteTrashPicks ? SelHost.deleteTrashPicks() : 0;   // tombstones + history via the wrapped delete
      _dvRefreshTrashBar();
      if (d) { try { toast('Deleted ' + d + ' markup' + (d > 1 ? 's' : '') + ' \u2014 Undo restores them'); } catch (eT) {} }
    });
  });
  no.addEventListener('click', function () { SelHost.cancelSelect(); _dvRefreshTrashBar(); });
  _dvTrashBar.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  _dvTrashBar.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
}
function _dvRefreshTrashBar() {
  if (_tool !== 'trash') { if (_dvTrashBar) _dvTrashBar.style.display = 'none'; return; }
  _dvEnsureTrashBar();
  var n = SelHost.trashCount ? SelHost.trashCount() : 0;
  if (!n) { _dvTrashBar.style.display = 'none'; return; }
  _dvTrashCnt.textContent = n + ' selected';
  _dvTrashBar.style.display = 'flex';
}
// ── S581 — the ⋯ MENU IS THE SHARED HEADER DROPDOWN. ──────────────────────
// buildSharedMenu() is the same function lib/ui/headerEngine2.js uses for the
// header's own More / Reports / AI dropdowns, and menuCSS() (injected once by
// app.js) is the same stylesheet. Rounds S577–S579 each hand-wrote rows here
// and re-derived the styling in frt.css — a matching COPY, which is the fake
// conversion the shared-engine rule forbids (Mark, repeatedly). The viewer now
// contributes only its ITEMS; the engine emits every node and every pixel.
// Items keep their data-dv-action attribute so the existing delegated action
// handler below is untouched.
var _dvMoreMenuEl = null;
function _dvEnsureMoreMenu() {
  if (_dvMoreMenuEl) return _dvMoreMenuEl;
  var slot = document.getElementById('dv-more-menu-slot');
  if (!slot) return null;
  var items = [
    { label: '\u2B07\uFE0F Download Drawing', sub: 'Save this sheet as an image', action: 'download' },
    // S527: on-screen markup diagnostic — an in-app row, never a URL param
    // (field tablets run the Android TWA where the address bar is not editable).
    { label: '\uD83E\uDE7A Markup Diagnostic', sub: 'Markup counts, sync state, manual merge', action: 'markupdiag' },
    { label: '\uD83D\uDCCC Tasks', sub: 'Open the task panel for this drawing', action: 'tasks' },
    // S587: on-tablet pin evidence — the crew has no console in the TWA
    { label: '\uD83D\uDCCD Pin Write Log', sub: 'Did a pin move on its own? Check here', action: 'pinlog' }
  ];
  /* S582: shadow:true — the menu gets the same host-CSS immunity the header's
     dropdown has always had by living in a shadow root. Without it the
     viewer toolbar's generic button rule drew a border + pill on every row. */
  var wrap = buildSharedMenu(items, { shadow: true });
  var menu = wrap._menu;
  wrap.id = 'dv-more-menu';   /* the HOST is the toggled/positioned node now */
  // tag each engine-built row with its action for the delegated handler
  var btns = menu.querySelectorAll('button');
  for (var i = 0; i < btns.length && i < items.length; i++) {
    btns[i].setAttribute('data-dv-action', items[i].action);
    /* Clicks inside a shadow root do bubble, but e.target is retargeted to the
       HOST — so the document-level [data-dv-action] delegation can no longer
       see the row. Wire each row directly; the action names are unchanged. */
    (function (act) {
      btns[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        wrap.classList.remove('open');
        _dvRunMoreAction(act);
      });
    })(items[i].action);
  }
  slot.parentNode.replaceChild(wrap, slot);
  _dvMoreMenuEl = wrap;
  return wrap;
}

// S582: one place that runs a ⋯ menu action, called by the shadow-built rows
// (whose clicks are retargeted to the host and so cannot use the document-level
// [data-dv-action] delegation). The legacy delegation stays for any other
// light-DOM element that still carries the attribute.
function _dvRunMoreAction(act) {
  if (act === 'download') { _downloadDrawing(); return; }
  if (act === 'markupdiag') { _showMarkupDiag(); return; }
  if (act === 'pinlog') { _showPinWriteLog(); return; }   // S587
  if (act === 'tasks') { try { if (window._frtToggleTasks) window._frtToggleTasks(); } catch (e) {} return; }
  if (act === 'delete-all-markup') {
    showConfirm('Delete All Markup', 'Remove all markup on this drawing?').then(function (yes) {
      if (!yes) return;
      _objects = []; _pushHistory(); _renderAll(); _markDirty();
    });
    return;
  }
  if (act === 'delete-all-pins') { _deleteAllPins(); return; }
}

function _handleTrashDown(e) {
  if (SelHost._trashDown) SelHost._trashDown(_getPos(e));
  _dvRefreshTrashBar();
}
var _penPoints = [];
// S461q: _polyPoints retired — the shared module owns polyline state.
var _isDrawing = false;
var _dirty = false;

// S126 #5 — Click-to-draw state. When the user activates a shape tool and
// makes the first click, _clickFirstPt holds {x, y}. The next click commits
// the shape from _clickFirstPt to current cursor. Cleared on Esc, tool
// switch, pinch-zoom, or commit. Cursor moves between clicks (mouse only)
// update a live preview on the overlay canvas.
var _clickFirstPt = null;
var _shapeDrag = false;   // S339 — true while a shape is being press-drag-drawn

// S126 #6 — Dimension vertex-edit state. When user taps a committed
// dimension while NOT in select tool, _dimVertexEditId holds the obj id;
// next two endpoint-area positions become draggable handles. Drag start
// sets _dimVertexDragHandle to 0 (A) or 1 (B); cleared on mouseup.
var _dimVertexEditId = null;
/* S664 — label chips as tap targets. The renderer computes each dim's painted
   label box (_labelBox) but draws on THROWAWAY v1 views, so the box dies each
   frame. Render copies it here, keyed by id — a transient side map, never
   written onto the saved objects (no render state in the sync payload).
   Stale entries for deleted dims are harmless: lookups go through _objects. */
var _dimLabelBoxes = {};
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
var _dimFinChipWasShowing = false;  // S331 #37 — gate one-time finish-chip pulse
var _color = '#A85959';
var _lineWidth = 3;
// ── S549/S559 — ONE TEXT-SIZE STEPPER. ────────────────────────────────────
// S549 fixed the 80-default/72-cap inversion with a proportional stepper.
// S551 then moved the editor onto the shared engine, whose docked bar walks
// the tuned _DV_SIZE_STEPS list — leaving the sidebar SIZE buttons stepping
// proportionally while the bar stepped the list: same button family, two
// different behaviours. One stepper now, the tuned list, everywhere. Values
// between steps (legacy text) snap to the nearest step on first press.
function _stepFont(v, dir) {
  v = v || 20;
  if (!Array.isArray(_DV_SIZE_STEPS) || !_DV_SIZE_STEPS.length) return v;  // pre-init guard
  var i = 0, best = 1e9;
  for (var k = 0; k < _DV_SIZE_STEPS.length; k++) {
    var d = Math.abs(_DV_SIZE_STEPS[k] - v);
    if (d < best) { best = d; i = k; }
  }
  i = Math.max(0, Math.min(_DV_SIZE_STEPS.length - 1, i + dir));
  return _DV_SIZE_STEPS[i];
}
var _fontSize = 80;  // S391: default logical text size, tuned for large PDF drawings (5184px @ ~0.22 fit ~= 18px on-screen). User steps smaller/larger via the chip bar.
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
// S491 — TRUE while Markup.destroy() is deliberately tearing down the WebGL
// renderer. Pixi's destroy releases the GL context on purpose (freeing GPU
// memory), and the browser announces that release with the SAME
// webglcontextlost event a genuine GPU crash fires. Without this flag every
// routine drawing-page switch was logged as a context loss, inflated the
// Diag crash counter, and — the real bug — tripped the S131 tablet rule
// ("first loss = GPU out of memory, abandon WebGL"), silently downgrading
// tablets to Canvas 2D for the rest of the session after one page switch.
var _webglTearingDown = false;
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

// S390: translucent fill for a text background-pill swatch (ported from the
// lightbox markupEngine _bgFill). hex -> rgba ~0.78; 'none'/invalid -> transparent.
function _mkBgFill(hex) {
  if (!hex || hex === 'none') return 'rgba(0,0,0,0)';
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var rr = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), bb = parseInt(h.slice(4, 6), 16);
  if (isNaN(rr)) return 'rgba(20,18,24,0.72)';
  return 'rgba(' + rr + ',' + gg + ',' + bb + ',0.78)';
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
  _shapeDrag = false;
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
  if (_fc) { _fc.classList.remove('show'); _fc.style.display = 'none'; }
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
  // S552: dimension chrome is screen-constant like every other affordance here.
  if (dim.setUiScale) dim.setUiScale(_uiScale());
  dim.renderPreview(ctx, _color, _lineWidth, _opacity);
}

// S331 #37 — Live calibration preview. After the first calibration point is
// placed, draw a dimension-style rubber-band line to the cursor (dashed axis,
// endpoint dots, a "set length…" chip) so calibrating looks/feels like drawing
// a real dimension instead of clicking two bare dots. Drawing-space coords on
// the overlay (same transform as _renderDimensionPreview). Display-only.
// S331j — Green ortho guide for endpoint re-drag. Drawn on the overlay (same
// coordinate space as the main markup canvas) along the anchor→moved ray,
// extended far past both ends like AutoCAD polar tracking. Cleared on drag end.
function _drawOrthoGuide(anchor, moved) {
  var ov = _ensureOverlay();
  if (!ov) return;
  ov.style.display = 'block';
  ov.style.opacity = '1';
  var ctx = ov.getContext('2d');
  var d = ov._dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ov.width, ov.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  var gdx = moved.x - anchor.x, gdy = moved.y - anchor.y;
  var glen = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
  var gux = gdx / glen, guy = gdy / glen;
  var ext = 9999;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(46, 158, 114, 0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(anchor.x - gux * ext, anchor.y - guy * ext);
  ctx.lineTo(anchor.x + gux * ext, anchor.y + guy * ext);
  ctx.stroke();
  ctx.restore();
}

// S331k — Green ortho guide for the CALIBRATION draw. Unlike _drawOrthoGuide,
// this does NOT clear the overlay (the calibration preview was just drawn into
// it); it composites the guide on top. Same coordinate space as the preview.
function _renderCalibratePreview(p1, cursor, showGuide) {
  var ov = _ensureOverlay();
  if (!ov) return;
  ov.style.display = 'block';
  ov.style.opacity = '1';
  var ctx = ov.getContext('2d');
  var d = ov._dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ov.width, ov.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  // S331k — green ortho guide drawn FIRST (under the preview) when snapped, in
  // the SAME overlay pass. (Drawing it in a separate function re-ran
  // _ensureOverlay, which resets canvas width and wiped the preview.)
  if (showGuide) {
    var ggx = cursor.x - p1.x, ggy = cursor.y - p1.y;
    var gglen = Math.sqrt(ggx * ggx + ggy * ggy) || 1;
    var ggux = ggx / gglen, gguy = ggy / gglen;
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(46, 158, 114, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p1.x - ggux * 9999, p1.y - gguy * 9999);
    ctx.lineTo(p1.x + ggux * 9999, p1.y + gguy * 9999);
    ctx.stroke();
    ctx.restore();
  }
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
  // S331x — endpoints as perpendicular TICK lines, not dots (matches the
  // dimension tool; circles only appear while actively picking a point).
  (function(){
    var dx = cursor.x - p1.x, dy = cursor.y - p1.y, len = Math.sqrt(dx*dx + dy*dy);
    var ux = len < 1 ? 1 : -dy/len, uy = len < 1 ? 0 : dx/len, h = 6;
    ctx.save(); ctx.setLineDash([]); ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p1.x - ux*h, p1.y - uy*h); ctx.lineTo(p1.x + ux*h, p1.y + uy*h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cursor.x - ux*h, cursor.y - uy*h); ctx.lineTo(cursor.x + ux*h, cursor.y + uy*h); ctx.stroke();
    ctx.restore();
  })();
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
/* S662 — what the editor OPENED with. If the field still equals this on apply,
   the dimension's override state is restored exactly as it was at open, so
   merely looking at a dimension can never convert measured → overridden
   (S660 shipped that bug: any non-empty field wrote ovrM, and the seed made
   the field always non-empty). Restoring the ORIGINAL values — not skipping —
   also means an already-overridden dimension survives an open/close without
   its stored ovrM being re-parsed through the ½″ display formatter. */
var _dimKpSeed = '';
var _dimKpOrig = null;

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

  // S659 (Mark) — SEED WITH WHAT IS ON THE DRAWING, always.
  // Previously the field was left blank whenever a dimension had no typed
  // override, so opening a measured dimension gave an empty box and the only
  // way to change it was to retype the whole value — including the feet when
  // only the inches were wrong. Now the current label seeds the field and is
  // selected, so typing replaces it and a single tap puts the caret where the
  // finger landed. Clearing the field still means "revert to measured" on
  // apply; that behaviour is unchanged, it is simply no longer the start state.
  var seed = '';
  if (obj.overrideNote != null && obj.overrideNote !== '') seed = obj.overrideNote;
  else if (typeof obj.ovrM === 'number') {
    seed = (dim.getDisplayUnit() === 'metric')
      ? Math.round(obj.ovrM * 1000) + 'mm'
      : dim.formatMeters(obj.ovrM).replace(/[^0-9'"\-\/. ]/g, '').trim();
  } else {
    // S660 — seed from the STORED measured label. S659 called
    // dim.computeLabel(obj, drawing), but that function takes four
    // coordinates plus a calibration and returns an object, so the call
    // produced nothing, the guard swallowed it, and the field stayed empty —
    // which is the bug Mark saw. obj.rawLabel is the measured label already
    // written onto every dimension at draw time and rewritten by
    // recalibrateAll, so it is the value actually on the drawing.
    if (typeof obj.rawLabel === 'string' && /\d/.test(obj.rawLabel)) {
      seed = obj.rawLabel.replace(/[^0-9'"\-\/. ]/g, '').trim();
    }
  }
  els.input.value = seed;
  // S662 — remember the open state; see _dimKpSeed declaration.
  _dimKpSeed = seed;
  _dimKpOrig = { ovrM: obj.ovrM, overrideNote: obj.overrideNote, overrideLabel: obj.overrideLabel };

  // metric/imperial key visibility follows the display unit
  els.kp.classList.toggle('metric', dim.getDisplayUnit() === 'metric');

  // Position: floating near the dim label on desktop; CSS docks on touch.
  var isTouch = (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  if (!isTouch) {
    var mc = _getCanvas();
    if (mc) {
      // S461: stroke model — both dim flavors live in pts[0]/pts[1]; legacy dims
      // carry no offset field, so `|| 0` preserves the old forced-zero behavior.
      var ax = obj.pts[0].x, ay = obj.pts[0].y, bx = obj.pts[1].x, by = obj.pts[1].y, offset = obj.offset || 0;
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
  /* S659 — focus and select on TOUCH as well as desktop.
     The old guard was `if (!isTouch)`, so on a tablet the field never took
     focus: the OS keyboard did not open, the seeded value was not selected,
     and the only way in was the small custom keys. That is the whole reason
     editing a dimension on a tablet felt broken.
     select() after focus() is what makes typing REPLACE rather than append;
     a single tap in the field afterwards still places the caret where the
     finger landed, which is how you change only the inches.
     The delay is longer on touch because the panel animates in and iOS/Android
     ignore focus() issued mid-transition. */
  setTimeout(function () {
    try { els.input.focus(); els.input.select(); } catch (e) {}
  }, isTouch ? 120 : 40);
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
  // S662 — field unchanged since open → restore the state it opened with.
  // Covers type-then-retype-the-original too: live keystrokes may have
  // written intermediate overrides, so restoring (not skipping) is required.
  if (v === _dimKpSeed) {
    if (_dimKpOrig) {
      _dimKpObj.ovrM = _dimKpOrig.ovrM;
      _dimKpObj.overrideNote = _dimKpOrig.overrideNote;
      _dimKpObj.overrideLabel = _dimKpOrig.overrideLabel;
    }
    _renderAll();
    return;
  }
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
  _dimKpSeed = '';
  _dimKpOrig = null;
  if (!silent) { _pushHistory(); _markDirty(); }
  else { _markDirty(); }
}
function _dimKpClose() { if (_dimKpOpen()) _dimKpCommit(false); }

// S330 #37 — Finish ✕ chip. Shown between dimensions in continuous/running
// (state 'awaitB' with an anchor), never during the offset stage, so
// reaching for it can't drag the offset. Tapping it ends the chain.
function _dvStyleDimFinChip(chip) {
  // S461i (Mark): the red "✕ Done" chip becomes the SAME dark pill family as
  // the polyline pill / confirm bar — ✓ Finish (green) + ✕ (red). One visual
  // language for every "in-progress → commit/cancel" surface.
  if (chip._dvStyled) return; chip._dvStyled = true;
  chip.style.cssText += ';' + _DV_PILL_BOX + 'display:none;';
  chip.innerHTML = '';
  var ok = document.createElement('button');
  ok.id = 'dim-finchip-ok';
  ok.innerHTML = '\u2713';   // S461k: circle only — matches the polyline pill exactly
  ok.style.cssText = _DV_PILL_FINISH;
  var no = document.createElement('button');
  no.id = 'dim-finchip-no';
  no.innerHTML = '\u2715';
  no.style.cssText = _DV_PILL_X;
  chip.appendChild(ok); chip.appendChild(no);
}
/* S651 — the Refresh (↻) and Remove-scale (⊘) buttons only DO anything on a
   drawing that has a scale, but they are ALWAYS VISIBLE (Mark, 12 Aug).
   S651 first shipped them hidden until calibrated; the cost showed up
   immediately — the feature looked like it had never deployed, because an
   uncalibrated drawing gives you nothing to find. A control you cannot see is
   a control nobody knows exists. They now dim instead of disappearing, and
   tapping one while there is no scale explains itself rather than no-opping.
   Safe to call often: idempotent, touches opacity + aria-disabled only. */
function _syncDimScaleButtons() {
  try {
    var dim = window._dimTool;
    var dr = _getCurrentDrawing();
    var on = !!(dim && dr && dim.isCalibrated(dr));
    var ids = ['dim-recalc-btn', 'dim-uncal-btn'];
    for (var i = 0; i < ids.length; i++) {
      var b = document.getElementById(ids[i]);
      if (!b) continue;
      b.style.display = '';            /* never hide — see note above */
      b.style.opacity = on ? '' : '0.4';
      b.setAttribute('aria-disabled', on ? 'false' : 'true');
      /* Deliberately NOT the disabled attribute and NOT pointer-events:none —
         a dead button on a tablet reads as a broken app. The handlers stay
         reachable so a tap can say why nothing happened. */
    }
  } catch (_) {}
}
function _updateDimFinChip() {
  var chip = document.getElementById('dim-finchip');
  var dim = window._dimTool;
  _syncDimScaleButtons();
  if (!chip || !dim) return;
  _dvStyleDimFinChip(chip);
  var anchor = dim.chainFinishAnchor ? dim.chainFinishAnchor() : null;
  var mode = dim.getMode ? dim.getMode() : 'single';
  // S572 (Mark): single mode gets a CANCEL. A half-drawn dimension — the
  // accidental tap right after finishing one — previously had NO exit at all:
  // the pill was chain-only, Escape doesn't exist on touch, and undo ignored
  // uncommitted state. When single mode has a point down, the same pill shows
  // with the red ✗ alone (✓ commits chains; there is nothing to commit here).
  var stChip = 'idle';
  try { stChip = dim.getState().state; } catch (eChip) {}
  var singleCancel = (mode === 'single' && stChip !== 'idle' && !_dimAdjustObj && !_dimChainPressPending);
  if (_tool !== 'dimension' || _dimAdjustObj || (!singleCancel && (!anchor || mode === 'single'))) {
    chip.classList.remove('show', 'pulse'); chip.style.display = 'none';
    _dimFinChipWasShowing = false;
    return;
  }
  var okChipBtn = document.getElementById('dim-finchip-ok');
  if (okChipBtn) okChipBtn.style.display = singleCancel ? 'none' : 'flex';
  var mc = _getCanvas();
  if (!mc) { chip.classList.remove('show', 'pulse'); chip.style.display = 'none'; _dimFinChipWasShowing = false; return; }
  // S342: the Done chip used to sit 16px right / 24px above the chain anchor —
  // i.e. right on top of the point you're drawing from, blocking the live line
  // (Mark's complaint). It does NOT need to track the anchor: tapping it just
  // ends the chain, so a fixed, predictable, out-of-the-way spot is better and
  // behaves identically on mobile and PC. Pin it to the TOP-CENTRE of the canvas
  // area, just below the toolbar, where it never overlaps the drawing zone and
  // is always within easy thumb reach. (Kept position:fixed; only x/y change.)
  // S461k (Mark): identical placement logic to the polyline pill — mobile
  // fixed bottom-center, PC follows the chain anchor, hard-clamped.
  var anchorL = null;
  try { var _a0 = dim.chainFinishAnchor(); if (_a0) anchorL = { x: _a0.x, y: _a0.y }; } catch (e0) {}
  chip.classList.add('show');
  _dvPlacePill(chip, anchorL);
  // S331 #37 — pulse once when a chain FIRST starts waiting (discoverability),
  // not on every render while it sits there.
  if (!_dimFinChipWasShowing) {
    chip.classList.remove('pulse');
    void chip.offsetWidth;          // reflow so the animation can restart
    chip.classList.add('pulse');
    _dimFinChipWasShowing = true;
  }
}
function _dimFinChipEnd() {
  var dim = window._dimTool;
  if (_dimKpOpen()) _dimKpCommit(true);
  if (dim && dim.endChain) dim.endChain();
  var chip = document.getElementById('dim-finchip');
  // F5 (S487): _dvPlacePill shows the pill via INLINE display:flex, so removing
  // the 'show' class alone leaves it on screen. Hide exactly the way the
  // _updateDimFinChip hide path does, and reset the one-time pulse gate so the
  // next chain pulses again.
  if (chip) { chip.classList.remove('show', 'pulse'); chip.style.display = 'none'; }
  _dimFinChipWasShowing = false;
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

  // finish chip — S461i: delegated, because the chip's innerHTML is rebuilt
  // by _dvStyleDimFinChip (✓ Finish + ✕; both end the chain — endChain and
  // cancel are the same reset in the dim module, segments commit immediately).
  var finChip = document.getElementById('dim-finchip');
  if (finChip) {
    finChip.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target.closest && (e.target.closest('#dim-finchip-ok') || e.target.closest('#dim-finchip-no') || e.target.closest('#dim-fin-x'))) {
        _dimFinChipEnd();
      }
    });
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
    if (dim.startContinueFromPrevious) dim.startContinueFromPrevious(_objects.map(toV1));   // S461g
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
      var _recalV2 = _objects.map(toV1);   // S461g: writes → v1 round-trip
      dim.recalibrateAll(_recalV2, _pendingRecalCal, mode);
      _objects = _recalV2.map(toStroke);
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
          // S491 — deliberate teardown (Markup.destroy → Pixi destroy →
          // planned context release). Not a crash: no warn, no Diag count,
          // no tablet WebGL abandonment. Genuine losses arrive with the
          // flag down and get the full recovery path below.
          if (_webglTearingDown) return;
          // S491 — the browser may deliver this event AFTER destroy()
          // finished and the flag is already lowered. A stale event from a
          // discarded canvas identifies itself: its target is no longer the
          // live _webglCanvas (which is null, or a fresh canvas, by then).
          if (e.target !== _webglCanvas) return;
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
  // S484 — root cause of the field pen lag (Nasim 7310.17, Mark repro): every
  // touchmove strokes a huge layer the GPU re-composites at finger rate. This
  // overlay is ONLY the transient live-drag preview — the committed stroke
  // re-renders at full quality on the real markup layer on release.
  // S485 — the fixed cap made the preview smooth but fuzzy at zoom (the
  // documented S125-era symptom, reintroduced). Fix: ADAPTIVE resolution —
  // 1 overlay px = 1 physical screen px whenever affordable, clamped at the
  // device budget only at extreme zoom. [S487h: ported into frt-next — flip
  // prerequisite per FRT_HANDOFF_S482-S486 §4.1.]
  var _zPhys = 1;
  try {
    var _zr = mc.getBoundingClientRect();
    var _z = (_zr.width / lw) * (window.devicePixelRatio || 1);
    if (isFinite(_z) && _z > 0) _zPhys = _z;
  } catch (_eZ) {}
  var ovScale = Math.min(1, _zPhys);
  var ovMax = deviceMaxPixels();
  if (lw * lh * ovScale * ovScale > ovMax) ovScale = Math.sqrt(ovMax / (lw * lh));
  // Resize only when dims actually change — assigning canvas.width always
  // clears/reallocs even at the same value, and _paintLive ensures per frame.
  var _tw = Math.round(lw * ovScale), _th = Math.round(lh * ovScale);
  if (ov.width !== _tw) ov.width = _tw;
  if (ov.height !== _th) ov.height = _th;
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
  try { console.log('[UndoDiag] pushHistory — undoStack=' + _undoStack.length + ' objects=' + _objects.length + ' tombstones=' + _tombstones.length); } catch(e){}
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
  // S572 (Mark): undo first dissolves any in-progress dimension. A half-drawn
  // dimension isn't in history yet, so undo used to ignore it entirely — the
  // most natural cancel gesture did nothing. Adjust stage → discard the
  // provisional; a locked point/chain → same reset the ✗ pill performs.
  if (_tool === 'dimension') {
    try {
      if (_dimAdjustObj) { _dimAdjustFinish(false); return; }
      var _duT = window._dimTool;
      if (_duT && _duT.getState && _duT.getState().state !== 'idle') { _dimFinChipEnd(); return; }
    } catch (eDU) {}
  }
  try { console.log('[UndoDiag] _undo CALLED — undoStack=' + _undoStack.length + ' redoStack=' + _redoStack.length + ' objectsBefore=' + _objects.length); } catch(e){}
  if (!_undoStack.length) { try { console.log('[UndoDiag] _undo NOOP — empty undoStack'); } catch(e){} return; }
  _redoStack.push(JSON.stringify({ objects: _objects, tombstones: _tombstones }));
  var snap = _decodeHistorySnapshot(_undoStack.pop());
  _objects = snap.objects;
  _tombstones = snap.tombstones;
  SelHost.deselect();   // S461: clears selIds + drag + rubber-band, renders
  _renderAll();
  _markDirty();
  _updateUndoButtons();
  try { console.log('[UndoDiag] _undo DONE — objectsAfter=' + _objects.length + ' undoStack=' + _undoStack.length + ' redoStack=' + _redoStack.length + ' webgl=' + (typeof _useWebGL!=='undefined'?_useWebGL:'?')); } catch(e){}
}

function _redo() {
  // S572 (Mark): same rule as _undo — an in-progress dimension is dissolved
  // before history moves, so redo can never fire "through" a half-drawn one.
  if (_tool === 'dimension') {
    try {
      if (_dimAdjustObj) { _dimAdjustFinish(false); return; }
      var _drT = window._dimTool;
      if (_drT && _drT.getState && _drT.getState().state !== 'idle') { _dimFinChipEnd(); return; }
    } catch (eDR) {}
  }
  try { console.log('[UndoDiag] _redo CALLED — redoStack=' + _redoStack.length + ' objectsBefore=' + _objects.length); } catch(e){}
  if (!_redoStack.length) { try { console.log('[UndoDiag] _redo NOOP — empty redoStack'); } catch(e){} return; }
  _undoStack.push(JSON.stringify({ objects: _objects, tombstones: _tombstones }));
  var snap = _decodeHistorySnapshot(_redoStack.pop());
  _objects = snap.objects;
  _tombstones = snap.tombstones;
  SelHost.deselect();   // S461: clears selIds + drag + rubber-band, renders
  _renderAll();
  _markDirty();
  _updateUndoButtons();
  try { console.log('[UndoDiag] _redo DONE — objectsAfter=' + _objects.length); } catch(e){}
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
      // S400: exclude the object currently open in the text edit box — the 2D path
      // skips it in _drawObject (obj._editing), but WebGL renders committed objects
      // directly and never saw that skip, so the edited text showed doubled behind
      // the live box. Filter here to match the 2D behaviour.
      var _wglObjs = _objects.filter(function(o){ return !o._editing; }).map(toV1);   // S461: WebGL renderer speaks v1
      window.WebGLMarkupRenderer.render(_wglObjs, { dpr: dpr, hlAlpha: 0.3 });
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
        var _dv664 = toV1(_dobj);
        window._dimTool.renderObject(ctx, _dv664);   // S461g: _dimTool speaks v1 — raw strokes rendered NOTHING (invisible dims)
        if (_dv664._labelBox) _dimLabelBoxes[_dobj.id] = _dv664._labelBox;   // S664
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
          if (!obj.pts || obj.pts.length < 2) return;
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
          oc2.moveTo(obj.pts[0].x, obj.pts[0].y);
          for (var i = 1; i < obj.pts.length; i++) oc2.lineTo(obj.pts[i].x, obj.pts[i].y);
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

  // S461: selection chrome + rubber-band — the SHARED engine draws them,
  // always in 2D on top of WebGL. No-op when the select tool is idle.
  SelHost._drawSelChrome(ctx);

  // S126 #6 — Vertex handles overlay. Drawn last so they sit on top of all
  // markup. Visible whenever the user has tapped a dimension while NOT in
  // select tool. Click+drag on a handle moves that endpoint of the dim.
  if (_dimVertexEditId != null && window._dimTool && window._dimTool.renderVertexHandles) {
    if (window._dimTool.setUiScale) window._dimTool.setUiScale(_uiScale());   // S552
    var editDim = _findObj(_dimVertexEditId);
    if (editDim && editDim.type === 'dimension') {
      window._dimTool.renderVertexHandles(ctx, toV1(editDim));   // S461: _dimTool speaks v1
    } else {
      _dimVertexEditId = null;
    }
  }

  // S330 #37 — pickup picker "pick a point" highlights: burgundy rings on
  // every existing dimension vertex, so the user can tap one to start.
  if (window._dimTool && window._dimTool.isPickAwaiting && window._dimTool.isPickAwaiting()) {
    var verts = window._dimTool.allVertices ? window._dimTool.allVertices(_objects.map(toV1)) : [];   // S461
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
  // S398: don't paint the object that's currently open in the text edit box —
  // otherwise the committed copy shows THROUGH/behind the live box (doubled text
  // while editing or resizing). Cleared on commit/cancel (delete obj._editing).
  if (obj._editing) return;
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
    if (!obj.pts || obj.pts.length < 2) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(obj.pts[0].x, obj.pts[0].y);
    for (var k = 1; k < obj.pts.length; k++) ctx.lineTo(obj.pts[k].x, obj.pts[k].y);
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
      var tcx = obj.pts[0].x + estW_t / 2, tcy = obj.pts[0].y - fs_t / 2;
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
    var bxLeft = obj.pts[0].x - padTx;
    var bxTop = obj.pts[0].y - fsTx - padTx + 2;
    var bxW = estWTx + padTx * 2;
    var bxH = fsTx + padTx * 2;
    // S390: optional background pill (ported from lightbox). Committed text shows
    // its chosen bg colour behind the ink for legibility over busy drawings.
    // Default 'none'/undefined = no pill (clean text — matches all pre-S390 objects).
    if (obj.bg && obj.bg !== 'none') {
      var _pbgX = fsTx * 0.28, _pbgY = fsTx * 0.20;
      var _pbx = obj.pts[0].x - _pbgX, _pby = obj.pts[0].y - fsTx - _pbgY;
      var _pbw = estWTx + _pbgX * 2, _pbh = fsTx + _pbgY * 2;
      var _prad = Math.min(8, _pbh / 2);
      ctx.save();
      ctx.globalAlpha = (obj.opacity != null ? obj.opacity : 1);
      ctx.fillStyle = _mkBgFill(obj.bg);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(_pbx, _pby, _pbw, _pbh, _prad);
      else ctx.rect(_pbx, _pby, _pbw, _pbh);
      ctx.fill();
      ctx.restore();
    }
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
    ctx.fillText(obj.text || '', obj.pts[0].x, obj.pts[0].y);
  }
  else if (t === 'eraser') {
    if (!obj.pts || obj.pts.length < 2) { ctx.restore(); return; }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = (obj.size || 2) * 3;
    ctx.beginPath();
    ctx.moveTo(obj.pts[0].x, obj.pts[0].y);
    for (var e2 = 1; e2 < obj.pts.length; e2++) ctx.lineTo(obj.pts[e2].x, obj.pts[e2].y);
    ctx.stroke();
  }
  else if (t === 'polyline') {
    if (!obj.pts || obj.pts.length < 2) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(obj.pts[0].x, obj.pts[0].y);
    for (var pl = 1; pl < obj.pts.length; pl++) ctx.lineTo(obj.pts[pl].x, obj.pts[pl].y);
    ctx.stroke();
  }
  // S124 A1 — Dimension tool. Delegates to window._dimTool.renderObject
  // so the formatting/label logic lives in one place (dimensionTool.js).
  else if (t === 'dimension') {
    ctx.restore();
    if (window._dimTool && typeof window._dimTool.renderObject === 'function') {
      var _dv664b = toV1(obj);
      window._dimTool.renderObject(ctx, _dv664b);   // S461: _dimTool speaks v1
      if (_dv664b._labelBox) _dimLabelBoxes[obj.id] = _dv664b._labelBox;   // S664
    }
    return;
  }
  else {
    // Apply rotation for shapes if present
    if (obj.rotation) {
      var scx = (obj.pts[0].x + obj.pts[1].x) / 2, scy = (obj.pts[0].y + obj.pts[1].y) / 2;
      ctx.translate(scx, scy);
      ctx.rotate(obj.rotation);
      ctx.translate(-scx, -scy);
    }
    _drawShapeObj(ctx, t, obj.pts[0].x, obj.pts[0].y, obj.pts[1].x, obj.pts[1].y);
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
  var pts = obj.pts;
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
    return toStroke({                            // S461: fragments minted as engine strokes
      id: idx === 0 ? obj.id : _newId(),         // first fragment keeps the original id
      type: obj.type,
      points: frag,
      color: obj.color,
      size: obj.size,
      opacity: obj.opacity
    });
  });
}

// Check if shape/text bounds overlap the eraser path (using obj's _getBounds)
function _shapeHitByEraser(obj, eraserPts, eraserR2) {
  var b = _getBounds(toV1(obj));   // S461: _getBounds speaks v1 (the oracle)
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
  if (!eraserPts || eraserPts.length < 2) return false;
  // S331 (C1): remember pre-erase state so we can tell the caller whether the
  // eraser actually changed anything. A stroke that passes through empty space
  // must NOT push a history entry (no-op snapshots are what made undo feel
  // broken — you had to tap undo several times to get past empty snapshots).
  var _beforeSig = JSON.stringify(_objects);
  // Eraser hit radius matches the visual line in 2D: (size||2)*3 / 2
  var eraserR = ((lineWidth || 2) * 3) / 2;
  var eraserR2 = eraserR * eraserR;

  var next = [];
  for (var i = 0; i < _objects.length; i++) {
    var obj = _objects[i];
    if (!obj || !obj.type) continue;

    if (obj.type === 'pen') {
      // S459 (shared markupEraser decision — keep all three markup surfaces matched):
      // pen = MASK carve, not vertex-split. Split removes WHOLE segments adjacent to
      // a dropped vertex — on sparse-vertex strokes (fast drags) a 12px eraser cut
      // 60px chunks, and a crossing BETWEEN vertices erased nothing (S459 harness
      // cases 4/5, field-confirmed in the Diesel lightbox). The mask carves the
      // exact eraser path — the same mechanism polyline/highlight already use here.
      // lib/ui/markupEraser.js is the canonical statement of this rule.
      var penHalfW = ((obj.size || 2)) / 2;
      var penR = eraserR + penHalfW;
      if (_strokeHitByEraser(obj, eraserPts, penR * penR)) {
        _pushMask(obj, eraserPts, lineWidth);
      }
      next.push(obj);
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
  if (SelHost.selIds && SelHost.selIds.length) {
    var alive = {};
    for (var k = 0; k < _objects.length; k++) alive[_objects[k].id] = true;
    SelHost.selIds = SelHost.selIds.filter(function(id) { return alive[id]; });
  }
  // S331 (C1): true only if the erase actually altered the drawing.
  return JSON.stringify(_objects) !== _beforeSig;
}

// Did the eraser come within eraserR of any part of the stroke polyline?
// Tests segment-pair minimum distance — robust against sparse vertices on
// either side. Falls back to vertex-only test for degenerate single-point
// strokes.
function _strokeHitByEraser(obj, eraserPts, eraserR2) {
  var pts = obj.pts;
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
// S461: _rubberBand removed — engine-owned on SelHost.

// S461: _getGroupBounds removed — the shared selection engine (lib/ui/markupSelection.js)
// owns selection chrome, handle hit-testing, and clone. See SelHost below line 50.

// S461: _drawGroupedSelection removed — the shared selection engine (lib/ui/markupSelection.js)
// owns selection chrome, handle hit-testing, and clone. See SelHost below line 50.

// Returns corner index (0=TL,1=TR,2=BL,3=BR) or -1
// S461: _hitResizeHandle removed — the shared selection engine (lib/ui/markupSelection.js)
// owns selection chrome, handle hit-testing, and clone. See SelHost below line 50.

// S461: _hitRotateHandle removed — the shared selection engine (lib/ui/markupSelection.js)
// owns selection chrome, handle hit-testing, and clone. See SelHost below line 50.

// S461: _hitDeleteButton removed — the shared selection engine (lib/ui/markupSelection.js)
// owns selection chrome, handle hit-testing, and clone. See SelHost below line 50.

// S342 — copy handle hit-test (ported from markupEngine S339 _hitCopy, per
// LOCKED_COPY_MARKUP_DESIGN). Filled circle centred BELOW the selection box
// bottom edge — a corner not used by rotate (top-centre) or delete (top-right).
// Scaled by _uiScale() so it stays a constant, finger-friendly size at any zoom
// (matches the S342 handle-sizing fix). Tested BEFORE delete/resize/rotate/move
// in _handleSelectDown so tapping it duplicates instead of starting a drag.
// S461: _hitCopyHandle removed — the shared selection engine (lib/ui/markupSelection.js)
// owns selection chrome, handle hit-testing, and clone. See SelHost below line 50.

// S342 — deep-clone the current selection, offset by (+28,+28) image-space px,
// and make the clones the new active selection so the user can immediately
// drag-to-place and chain another copy (offset-drag model, LOCKED spec).
// Coordinate fields offset PER TYPE (mk.js model): x1/y1/x2/y2 (rect/line/arrow/
// circle/text), mx1/my1/mx2/my2 (dimension), every point in points[], and every
// point in each eraserMask[].points[]. All arrays DEEP-copied (no aliasing).
// S461: _cloneSelection removed — the shared selection engine (lib/ui/markupSelection.js)
// owns selection chrome, handle hit-testing, and clone. See SelHost below line 50.

function _getBounds(obj) {
  // S331g — Dimension objects use mx1/my1/mx2/my2 (+ offset), not x1/x2, so
  // none of the generic branches below matched them and _hitTestObjects could
  // never select them — they appeared "frozen" (can't select/move/delete) once
  // the WebGL render fix made them visible. Give them a real AABB covering the
  // offset dimension line and the label chip so the Select tool can hit them.
  if (obj.type === 'dimension' && obj.mx1 != null) {
    var dox = obj.mx2 - obj.mx1, doy = obj.my2 - obj.my1;
    var dlen = Math.sqrt(dox * dox + doy * doy) || 1;
    var dpx = -doy / dlen, dpy = dox / dlen; // perpendicular unit
    var doff = obj.offset || 0;
    // four points: both measured endpoints AND both offset (dim-line) endpoints
    var pxs = [obj.mx1, obj.mx2, obj.mx1 + dpx * doff, obj.mx2 + dpx * doff];
    var pys = [obj.my1, obj.my2, obj.my1 + dpy * doff, obj.my2 + dpy * doff];
    // include the label chip midpoint with a little padding so the number is grabbable
    var mlx = (obj.mx1 + obj.mx2) / 2 + dpx * doff;
    var mly = (obj.my1 + obj.my2) / 2 + dpy * doff;
    pxs.push(mlx - 28, mlx + 28); pys.push(mly - 14, mly + 14);
    return {
      x1: Math.min.apply(null, pxs), y1: Math.min.apply(null, pys),
      x2: Math.max.apply(null, pxs), y2: Math.max.apply(null, pys)
    };
  }
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
  // S461k (Mark): polyline points commit on RELEASE, not press — press-drag
  // shows the live segment, releasing confirms the point. Fixes the touch
  // "jumping point" bug: press used to commit immediately, the drag only
  // moved a preview, and the next press snapped the frozen preview to it.
  if (_tool === 'polyline') { return; }

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
        if (dim.setUiScale) dim.setUiScale(_uiScale());   // S552: grab zone in screen px
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
        // S557: EXCEPT during the adjust-then-place stage. The provisional
        // dimension is not committed yet; a stray tap starting a SECOND
        // chain on top of it would stack two half-finished dimensions. The
        // tap is simply absorbed — the pill's ✓/✗ are the only exits.
        if (_dimAdjustObj) return;
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
      // Second calibration click — open the prompt. S331k: snap p2 to ortho
      // relative to p1 so the saved calibration line is dead-straight when
      // near H/V/45 (matches the live green guide the user just saw).
      var p1c = _dimCalibrateP1;
      var dimCal = window._dimTool;
      var p2c = (dimCal && dimCal.applyOrtho)
        ? dimCal.applyOrtho(p1c, { x: posD.x, y: posD.y })
        : { x: posD.x, y: posD.y };
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
        // S461g: recalibrateAll WRITES dim fields — run it on v1 views, then
        // re-import wholesale (ids preserved, so selection state stays valid).
        var _recalV = _objects.map(toV1);
        dim.recalibrateAll(_recalV, result.calibration, 'measured');
        _objects = _recalV.map(toStroke);
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
      var dimHit = dim.hitTestDimension(posD, _objects.map(toV1));   // S461: v1 views (id-only use)
      if (dimHit) {
        _dimVertexEditId = dimHit.id;
        _renderAll();
        return;
      }
    }

    // (3.5) Pickup picker "pick a point" — awaiting a vertex tap. Snap to
    //       the nearest existing dimension vertex and seed the chain there.
    if (dim.isPickAwaiting && dim.isPickAwaiting()) {
      var snap = dim.nearestVertex ? dim.nearestVertex(posD, _objects.map(toV1), 28) : null;   // S461
      var seedPt = snap || posD;
      if (dim.seedFromPoint) dim.seedFromPoint(seedPt, _objects.map(toV1));   // S461h: views let it adopt the picked dim's offset
      _renderDimensionPreview();
      _updateDimFinChip();
      return;
    }

    // (4) Normal chain click — S461k: DEFERRED TO RELEASE (Mark: press-drag-
    //     release for endpoint placement instead of eyeballing a blind tap).
    //     Vertex drags, calibration, dim-hit and pick-seed stay on press.
    // S553: remember WHERE the press landed and what state we were in, so the
    // release can tell a tap apart from a drag (see _dimChainRelease).
    _dimPressPos   = { x: posD.x, y: posD.y };
    _dimPressState = dim.getState().state;
    _dimChainPressPending = true;
    return;
  }

  _startDrawShapePath(e);
}

var _dimChainPressPending = false;
// ── S557 loupe REMOVED (Mark, S572): the magnifier circle obstructed the
// view more than it helped. The adjust-then-place stage below stays.

var _dimPressPos = null;      // S553: drawing-space position of the press
var _dimPressState = 'idle';  // S553: chain state at press time

// ── S557 — ADJUST, THEN PLACE. ────────────────────────────────────────────
// Lifting used to be final: an end two feet off meant delete and redo, and a
// span longer than one comfortable drag was simply impossible. Now the lift
// opens a correction stage — both endpoints stay as the S552 finger-sized
// handles, the drawing can still be panned and zoomed for a closer look, and
// nothing is final until the green check. Reuses the EXISTING vertex-edit
// machinery (hit-test, drag, ortho re-snap) rather than a second system; the
// only new parts are the pill and the deferred history push.
var _dimAdjustObj = null;      // the provisional dimension, already in _objects
var _dimAdjustBar = null;
function _dimEnterAdjust(obj) {
  _dimAdjustObj = obj;
  _dimVertexEditId = obj.id;              // existing machinery takes over
  _renderAll();
  if (!_dimAdjustBar) {
    _dimAdjustBar = document.createElement('div');
    _dimAdjustBar.id = 'dv-dim-adjust';
    _dimAdjustBar.style.cssText = _DV_PILL_BOX + 'left:50%;bottom:84px;transform:translateX(-50%);padding-left:12px;';
    var lbl = document.createElement('span');
    lbl.style.cssText = 'font:600 12px Calibri,sans-serif;color:#cfcad6;';
    lbl.textContent = 'Drag an end to adjust';
    var ok = document.createElement('button');
    ok.innerHTML = '\u2713'; ok.title = 'Place dimension';
    ok.style.cssText = _DV_PILL_FINISH;
    var no = document.createElement('button');
    no.innerHTML = '\u2715'; no.title = 'Discard';
    no.style.cssText = _DV_PILL_X;
    _dimAdjustBar.appendChild(lbl); _dimAdjustBar.appendChild(ok); _dimAdjustBar.appendChild(no);
    (document.getElementById('drawing-viewer-overlay') || document.body).appendChild(_dimAdjustBar);
    ok.addEventListener('click', function () { _dimAdjustFinish(true); });
    no.addEventListener('click', function () { _dimAdjustFinish(false); });
  }
  _dimAdjustBar.style.display = 'flex';
}
function _dimAdjustFinish(keep) {
  var obj = _dimAdjustObj;
  _dimAdjustObj = null;
  if (_dimAdjustBar) _dimAdjustBar.style.display = 'none';
  _dimVertexEditId = null; _dimVertexDragHandle = null;
  if (!obj) { _renderAll(); return; }
  // S557: in continuous/running modes the offset commit re-armed the next
  // chain link from the lift point. The adjust stage supersedes that — after
  // ✓/✗ the tool returns to idle so the next gesture starts clean rather
  // than chaining invisibly from a point the inspector may have just moved.
  try { if (window._dimTool && window._dimTool.resetState) window._dimTool.resetState(); } catch (e) {}
  if (keep) {
    _pushHistory(); _markDirty();
    // uncalibrated drawings: same keypad rule as the tap flow — the value is
    // typed, never guessed. Calibrated: the measured label is already on it.
    try {
      var dim = window._dimTool;
      if (dim && !dim.isCalibrated(_getCurrentDrawing())) _editDimensionLabel(obj);
    } catch (e) {}
  } else {
    var ix = _objects.indexOf(obj);
    if (ix >= 0) _objects.splice(ix, 1);   // never entered history — no ghost undo step
  }
  _renderAll();
  _updateDimFinChip();
}
function _dimChainRelease(e) {
  var posD = _getPos(e);
  var dim = window._dimTool;
  if (!dim) return;

  // ── S553 — DRAG TO MEASURE (Mark: "not natural, copy Fieldwire"). ────────
  // Three separate taps to get one dimension is the unnatural part: tap the
  // start, lift, aim at nothing, tap the end, lift, tap again to place it.
  // Between taps there is no finger on the glass, so there is nothing to aim
  // with — which is why it felt like guessing even after the start marker.
  //
  // A measurement is ONE GESTURE: press where it starts, drag, lift where it
  // ends. The line and the live length follow the finger the whole way, which
  // is how every drawing app on a tablet behaves.
  //
  // A tap that does not move still behaves exactly as before, so the precise
  // two-tap flow and running/continuous chains are untouched — this only adds
  // a meaning to a gesture that previously did nothing useful.
  if (_dimPressState === 'idle' && _dimPressPos) {
    var _mvx = posD.x - _dimPressPos.x, _mvy = posD.y - _dimPressPos.y;
    var _slop = 14 * _uiScale();          // finger jitter, in screen px
    if ((_mvx * _mvx + _mvy * _mvy) > (_slop * _slop)) {
      var drDrag = _getCurrentDrawing();
      if (_dimKpOpen()) _dimKpCommit(true);
      if (TiledPdf.isActive()) TiledPdf.pause();
      if (dim.setUiScale) dim.setUiScale(_uiScale());
      var vDrag = _objects.map(toV1);
      dim.handleClick({ x: _dimPressPos.x, y: _dimPressPos.y }, drDrag, vDrag);  // start = where the finger landed
      dim.handleMove(posD);                                                      // keep the preview honest
      var resDrag = dim.handleClick(posD, drDrag, vDrag);                        // end = where it lifted
      _dimPressPos = null; _dimPressState = 'idle';
      // S557 (corrected): the second click yields lockedB — the tool is now
      // waiting for a THIRD click to place the label offset. Verified in
      // dimensionTool.js: awaitB → lockedB, and only awaitOffset commits.
      // The earlier assumption that single-mode committed here was wrong.
      // For the drag gesture, the offset gets a sensible default (a fixed
      // screen distance off the line via the same _projectOffset math, by
      // clicking one row above the lift point) and the dimension goes
      // straight into the adjust stage, where the endpoints AND the whole
      // line remain correctable before the green check. The tap-tap-tap
      // flow keeps its explicit third click, untouched.
      if (resDrag && resDrag.action === 'lockedB') {
        var offPt = { x: posD.x, y: posD.y - 28 * _uiScale() };
        var resOff = dim.handleClick(offPt, drDrag, vDrag);
        if (resOff && resOff.committed && resOff.obj) {
          var adjObj = resOff.obj;
          adjObj.id = _newId(); adjObj.color = _color; adjObj.size = _lineWidth; adjObj.opacity = _opacity;
          adjObj = toStroke(adjObj);
          _objects.push(adjObj);
          _renderAll();
          _dimEnterAdjust(adjObj);   // history + dirty deferred to the ✓
          return;
        }
        // offset click didn't commit (should not happen) — leave the tool in
        // its normal awaitOffset state so the next tap places it manually.
        _renderDimensionPreview();
        _updateDimFinChip();
        return;
      }
      // Anything unexpected — fall through to the normal single-click path
      // rather than leaving the chain half-locked.
    }
  }
  _dimPressPos = null; _dimPressState = 'idle';
  {
    // Per locked spec, an uncalibrated drawing is NOT auto-scaled — it stays
    // "not to scale" and the user types each value via the keypad.
    var drNow = _getCurrentDrawing();

    // If the value keypad is open from a previous dimension, starting the
    // next one auto-commits it (locks, never flattens) so chains stay fluid.
    if (_dimKpOpen()) _dimKpCommit(true);

    if (TiledPdf.isActive()) TiledPdf.pause();
    var res = dim.handleClick(posD, drNow, _objects.map(toV1));   // S461g: v1 views (chain snapping reads mx*)
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
      newObj = toStroke(newObj);   // S461: mint as engine stroke (same ref flows to label edit below)
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
      /* ── S661 (Mark) — SINGLE MODE HANDS YOU BACK TO SELECT. ────────────
         The complaint this fixes: tapping an existing dimension to edit it
         started a NEW dimension on top of it instead, repeatedly, because the
         tool stays armed and an armed tap always draws.
         Disarming after a committed Single dimension means that by the time
         you reach for an existing one, nothing is armed and the tap edits.
         Continuous and Run deliberately STAY armed — those modes exist to draw
         chains, and disarming mid-chain would be the opposite of useful.
         Gated on state 'idle' so a half-drawn dimension is never abandoned. */
      try {
        var _mdNow = (dim.getMode ? dim.getMode() : 'single');
        if (_mdNow === 'single' && stAfter && stAfter.state === 'idle') {
          _setActiveTool('select');
        }
      } catch (_) {}
    }
    return;
  }
}

function _startDrawShapePath(e) {
  // S126 #5 — Click-to-draw for shape tools. Two-click pattern replaces
  // drag. First click locks point A and shows a zero-length preview dot;
  // second click commits the shape from A to current cursor.
  if (_isClickToDrawShape(_tool)) {
    var posC = _getPos(e);
    // S339 — press-drag-release (was S126 two-click). Down locks point A and arms
    // a drag; move previews; up commits if dragged past threshold. _shapeDrag tells
    // the up handler to finalize. Matches the photo engine + the signed-off demo.
    _clickFirstPt = posC;
    _shapeDrag = true;
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
      // S331k — calibration draw gets the same ortho snap + green guide as
      // dimensions. Guide is drawn inside the preview (single overlay pass).
      var _calPt = (dim.applyOrtho ? dim.applyOrtho(_dimCalibrateP1, { x: posDM.x, y: posDM.y }) : posDM);
      var _calSnapped = !!(dim.isOrthoActive && dim.isOrthoActive());
      _renderCalibratePreview(_dimCalibrateP1, _calPt, _calSnapped);
      return;
    }
    // (a) Vertex drag
    if (_dimVertexEditId != null && _dimVertexDragHandle != null && _isDrawing) {
      var dragObj = _findObj(_dimVertexEditId);
      if (dragObj) {
        // Capture the OLD pixel length before we move the handle — needed to
        // back out the implied scale for a not-to-scale (uncalibrated) measured
        // dimension so dragging still re-measures proportionally (S331h).
        var _oax = dragObj.pts[0].x;
        var _oay = dragObj.pts[0].y;
        var _obx = dragObj.pts[1].x;
        var _oby = dragObj.pts[1].y;
        var _oldPx = Math.sqrt((_obx - _oax) * (_obx - _oax) + (_oby - _oay) * (_oby - _oay));
        var _oldTrueM = (window._dimTool && window._dimTool.dimTrueMeters)
          ? window._dimTool.dimTrueMeters(toV1(dragObj)) : (typeof dragObj.trueM === 'number' ? dragObj.trueM : null);   // S461: _dimTool speaks v1

        var _orthoAnchor = null;
        if (_dimVertexDragHandle === 0) {
          // dragging endpoint A — snap relative to the fixed endpoint B
          var _anchorB = { x: dragObj.pts[1].x, y: dragObj.pts[1].y };
          var _sp0 = (dim.applyOrtho ? dim.applyOrtho(_anchorB, { x: posDM.x, y: posDM.y }) : posDM);
          dragObj.pts[0] = { x: _sp0.x, y: _sp0.y };
          _orthoAnchor = _anchorB;
        } else {
          // dragging endpoint B — snap relative to the fixed endpoint A
          var _anchorA = { x: dragObj.pts[0].x, y: dragObj.pts[0].y };
          var _sp1 = (dim.applyOrtho ? dim.applyOrtho(_anchorA, { x: posDM.x, y: posDM.y }) : posDM);
          dragObj.pts[1] = { x: _sp1.x, y: _sp1.y };
          _orthoAnchor = _anchorA;
        }

        // Re-measure rule (locked with Mark, S331h):
        //   • Typed override (overrideNote / ovrM / overrideLabel) → FROZEN.
        //   • Measured dimension → value follows the new geometry, whether the
        //     drawing is calibrated (recompute from scale) or not-to-scale
        //     (recompute proportionally from the dim's own implied scale).
        var _hasOverride = (dragObj.overrideNote != null && dragObj.overrideNote !== '') ||
                           (typeof dragObj.ovrM === 'number') ||
                           (dragObj.overrideLabel != null && dragObj.overrideLabel !== '');
        if (!_hasOverride) {
          var aax = dragObj.pts[0].x;
          var aay = dragObj.pts[0].y;
          var bbx = dragObj.pts[1].x;
          var bby = dragObj.pts[1].y;
          var newPx = Math.sqrt((bbx - aax) * (bbx - aax) + (bby - aay) * (bby - aay));
          var drDM = _getCurrentDrawing();
          var calDM = dim.getCalibration(drDM);
          if (calDM) {
            // Calibrated → authoritative recompute from scale.
            var labDM = dim.computeLabel(aax, aay, bbx, bby, calDM);
            if (labDM) {
              dragObj.rawValue = labDM.rawValue;
              dragObj.rawLabel = labDM.rawLabel;
              dragObj.trueM = labDM.trueM;
            }
          } else if (_oldTrueM != null && _oldPx > 0.0001) {
            // Not-to-scale but the dim already has a measured length → scale it
            // proportionally so the number tracks the drag. metres-per-pixel is
            // implied by the existing value, so the ratio stays self-consistent.
            var mPerPx = _oldTrueM / _oldPx;
            dragObj.trueM = mPerPx * newPx;
            dragObj.rawValue = dragObj.trueM / 0.3048; // feet, display path reformats
            if (dragObj.rawLabel != null) delete dragObj.rawLabel; // force reformat from trueM
          }
        }
        _renderAll();
        // S331j — green ortho guide during endpoint re-drag (matches the
        // new-dimension preview). Drawn on the overlay AFTER _renderAll so it
        // sits on top; only when the snap is actually engaged.
        if (dim.isOrthoActive && dim.isOrthoActive() && _orthoAnchor) {
          var movedPt = (_dimVertexDragHandle === 0)
            ? { x: dragObj.pts[0].x, y: dragObj.pts[0].y }
            : { x: dragObj.pts[1].x, y: dragObj.pts[1].y };
          _drawOrthoGuide(_orthoAnchor, movedPt);
        }
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
    // Live rubber line during the initial press-drag, before any state locks
    if (_dimChainPressPending && _dimPressPos) {
      var octx0 = (function(){ var ov=_ensureOverlay(); if(!ov) return null;
        ov.style.display='block'; ov.style.opacity='1';
        var c=ov.getContext('2d'), d=ov._dpr||1;
        c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,ov.width,ov.height);
        c.setTransform(d,0,0,d,0,0); return c; })();
      if (octx0) {
        // live rubber line from the press point, so the drag reads as measuring
        octx0.save();
        octx0.strokeStyle=_color; octx0.lineWidth=2*_uiScale(); octx0.setLineDash([6*_uiScale(),4*_uiScale()]);
        octx0.beginPath(); octx0.moveTo(_dimPressPos.x,_dimPressPos.y); octx0.lineTo(posDM.x,posDM.y); octx0.stroke();
        octx0.restore();
      }
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

  if (_tool === 'pen' || _tool === 'highlight' || _tool === 'eraser') {
    // S484 [ported S487h] — points still record on EVERY event (zero fidelity
    // loss), but the preview paints at most once per animation frame. Touch
    // events fire at 60-120Hz+ on tablets; painting per EVENT was half the
    // field pen lag. Full-path repaint per frame also matches the committed
    // render (uniform alpha along the stroke) better than per-segment did.
    _penPoints.push(pos);
    if (_penPoints.length < 2) return;
    _lastLivePos = pos;
    _scheduleLivePaint();
  } else {
    _lastLivePos = pos;
    _scheduleLivePaint();
  }
}

// S484 [ported S487h] — frame-batched live preview painter (see _moveDraw).
// One repaint per rAF, from recorded state. Never touches committed strokes.
var _lastLivePos = null;
var _livePaintQueued = false;
function _scheduleLivePaint() {
  if (_livePaintQueued) return;
  if (typeof requestAnimationFrame !== 'function') { _paintLive(); return; }
  _livePaintQueued = true;
  requestAnimationFrame(function () { _livePaintQueued = false; _paintLive(); });
}
function _paintLive() {
  if (!_isDrawing) return; // stroke ended/aborted before this frame — nothing to show
  var ov = _ensureOverlay();
  if (!ov) return;
  var ctx = ov.getContext('2d');
  var d = ov._dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ov.width, ov.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  if (_tool === 'pen' || _tool === 'highlight' || _tool === 'eraser') {
    if (_penPoints.length < 2) return;
    ctx.save();
    ctx.strokeStyle = _tool === 'eraser' ? '#8a94b0' : _color;
    ctx.lineWidth = _tool === 'highlight' ? _lineWidth * 4 : (_tool === 'eraser' ? _lineWidth * 3 : _lineWidth);
    ctx.globalAlpha = (_tool === 'pen') ? _opacity : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(_penPoints[0].x, _penPoints[0].y);
    for (var i = 1; i < _penPoints.length; i++) ctx.lineTo(_penPoints[i].x, _penPoints[i].y);
    ctx.stroke();
    ctx.restore();
  } else if (_lastLivePos) {
    ctx.save();
    ctx.globalAlpha = _opacity;
    ctx.strokeStyle = _color;
    ctx.fillStyle = _color;
    ctx.lineWidth = _lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    _drawShapeObj(ctx, _tool, _startX, _startY, _lastLivePos.x, _lastLivePos.y);
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
      // S331j — clear the green ortho guide drawn during the re-drag.
      var ovD = _getOverlay();
      if (ovD) {
        ovD.style.display = 'none';
        var cD = ovD.getContext('2d');
        cD.setTransform(1, 0, 0, 1, 0, 0);
        cD.clearRect(0, 0, ovD.width, ovD.height);
      }
    }
    return;
  }

  // S126 #5 — Click-to-draw shapes don't commit on mouseup/touchend; the
  // commit happens on the SECOND mousedown/touchstart. Just bail. Pen,
  // highlight, and eraser still use drag and continue through the original
  // path below.
  // S339 — press-drag-release shape commit (was: two-click, which returned here).
  // Down armed _shapeDrag + locked A in _startX/_startY; move tracked _endX/_endY.
  // Commit on up if the drag has real extent; a stationary tap is ignored (no shape,
  // no stray marks). Mirrors the photo engine fix.
  if (_isClickToDrawShape(_tool)) {
    if (_shapeDrag) {
      var _sov = _getOverlay();
      if (_sov) { _sov.style.display='none'; var _sc=_sov.getContext('2d'); _sc.setTransform(1,0,0,1,0,0); _sc.clearRect(0,0,_sov.width,_sov.height); }
      if (TiledPdf.isActive()) { TiledPdf.resume(); TiledPdf.scheduleRender(); }
      var _sdx=(typeof _endX==='number')?(_endX-_startX):0, _sdy=(typeof _endY==='number')?(_endY-_startY):0;
      if (Math.sqrt(_sdx*_sdx + _sdy*_sdy) >= 3) {
        _objects.push(toStroke({ id:_newId(), type:_tool, x1:_startX, y1:_startY, x2:_endX, y2:_endY,
          color:_color, size:_lineWidth, opacity:_opacity }));
        _pushHistory(); _markDirty();
      }
      _clickFirstPt = null; _shapeDrag = false; _renderAll();
    }
    return;
  }

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
  // S331 (C1): track whether this pointer-up actually mutated the drawing.
  // Previously _pushHistory() fired unconditionally here, so taps, aborted
  // drags, and erases over empty space all pushed no-op snapshots — undo then
  // appeared to "do nothing" until you'd tapped past the duplicates. Now we
  // only record history when something really changed.
  var _changed = false;
  if (type === 'eraser') {
    // Destructive eraser: split/remove underlying strokes permanently.
    // Eraser itself is NEVER added to _objects — it's a one-shot editing operation.
    if (_penPoints.length > 1) {
      _changed = _applyEraser(_penPoints.slice(), _lineWidth);
    }
  } else if (type === 'pen' || type === 'highlight') {
    if (_penPoints.length > 1) {
      _objects.push(toStroke({
        id: _newId(), type: type, points: _penPoints.slice(),
        color: _color, size: _lineWidth, opacity: _opacity
      }));
      _changed = true;
    }
  }
  // S126 #6 — dimension commit/calibration NO longer drag-based. The new
  // flow lives in _startDraw (handleClick state machine) so we don't push
  // anything here for type === 'dimension'.
  else if (type && type !== 'polyline' && type !== 'select' && type !== 'text' && type !== 'dimension') {
    // A shape only counts as drawn if it has real extent — a click that didn't
    // drag (x2/y2 still equal to start) is a tap, not a shape.
    var _hasExtent = (typeof _endX === 'number' && typeof _endY === 'number') &&
                     (_endX !== _startX || _endY !== _startY);
    if (_hasExtent) {
      _objects.push(toStroke({
        id: _newId(), type: type,
        x1: _startX, y1: _startY, x2: _endX, y2: _endY,
        color: _color, size: _lineWidth, opacity: _opacity
      }));
      _changed = true;
    }
  }

  if (_changed) _pushHistory();
  _penPoints = [];
  _renderAll();
  _markDirty();
}

// ── Text Tool ───────────────────────────────────────────

// ── Text Tool — S390 CHIP ENGINE (ported from photo lightbox) ───────────
// Replaces the old bare-textarea text tool with the IDENTICAL engine the photo
// lightbox uses (markupEngine _textPrompt + #lb-text-bar): an on-canvas
// contentEditable box driven by a docked bottom bar (size − N +, text-colour A,
// background pill, ↵ newline, ✕ discard, ✓ place). Multi-line. Sticky colour+bg.
// Storage stays NATIVE to this engine (type:'text', x1, y1, fontSize, color,
// bold, opacity) so selection / move / copy / group / hit-test are untouched;
// only a new optional `bg` field is added (rendered by both the 2D and WebGL
// paths). Existing text objects (no bg) render exactly as before.
//
// KEY DIFFERENCE vs the photo lightbox: the drawing surface can pan/zoom WHILE a
// box is open (a photo cannot). So the open box re-anchors to its logical point
// on every transform change — _dvRepositionTextBox(), called from the viewer's
// transform-apply. Coordinate primitive is identical to both engines:
//   zoom = canvasRect.width / _logicalW ; screen = rect.left + logical * zoom.

var _dvTextBox = null;          // the on-canvas contentEditable box (or null)
var _dvTextCtl = null;          // controller the docked bar drives (or null)
var _dvLastTextColor = '#9C2742';    // S394: sticky text colour; defaults to brand burgundy (legible on light drawings). Was falling back to muted #A85959.
var _dvLastTextBg = 'none';     // sticky bg across boxes
var _DV_SIZE_STEPS = [24, 32, 40, 56, 72, 80, 96, 120, 160, 220];  // S391: logical px, tuned for large PDF drawings; 80 = default. Stepper spans small->large like the lightbox.
var _DV_TEXT_PALETTE = ['#A85959','#E74C3C','#FF9800','#F1C40F','#2196F3','#1565C0','#4CAF50','#9C27B0','#1C2333','#607D8B','#FFFFFF'];

// css-px per logical unit, from the markup canvas rect (same as _handleTextPlace was)
function _dvTextZoom() {
  var mc = _getCanvas(); if (!mc) return 1;
  var r = mc.getBoundingClientRect();
  var lw = mc._logicalW || mc.width;
  return lw ? (r.width / lw) : 1;
}
function _dvLogicalToScreen(lx, ly) {
  var mc = _getCanvas(); var r = mc.getBoundingClientRect();
  var lw = mc._logicalW || mc.width, z = lw ? r.width / lw : 1;
  return { x: r.left + lx * z, y: r.top + ly * z, z: z };
}
function _dvScreenToLogical(sx, sy) {
  var mc = _getCanvas(); var r = mc.getBoundingClientRect();
  var lw = mc._logicalW || mc.width, z = lw ? r.width / lw : 1;
  return { x: (sx - r.left) / z, y: (sy - r.top) / z };
}

// Called from _startDraw when the text tool is active (replaces old placement),
// and from the click handler when an existing text object is tapped for edit.
function _handleTextPlace(e) {
  var mc = _getCanvas();
  if (!mc) { console.warn('[Markup] Text: no canvas'); return; }
  // If a box is already open, a tap elsewhere just COMMITS it (two-step flow,
  // matches the old S114 Push-4 behaviour + the lightbox).
  if (_dvTextBox) { if (_dvTextCtl) _dvTextCtl.commit(); return; }
  var pos = _getPos(e);
  // S390: tap-to-edit — if the tap lands on an existing text object, reopen the
  // chip on it (identical to the lightbox), rather than dropping a new one.
  var hit = _hitTestObjects(pos);
  if (hit && hit.type === 'text') { _dvOpenTextBox(null, hit); return; }
  // baseline one line below the tap (unchanged anchor rule from the old tool)
  _dvOpenTextBox({ x: pos.x, y: pos.y + _fontSize }, null);
}

// editObj != null → re-edit an existing text object at its own anchor.
// ── S551 — THE DRAWING VIEWER'S TEXT TOOL NOW RUNS ON THE SHARED ENGINE. ──
// Until now the drawing viewer carried a complete second text editor, separate
// from the one the photo markup uses. Same job, two implementations, already
// drifting apart. This replaces the private editor with an adapter: the engine
// is host-agnostic and asks the host where to put the box, what a size means in
// the host's own units, and how to write the result into the host's own object
// store. Everything below is that answer for the drawing viewer.
//
// NOTHING ELSE MOVES: same object store, same snapshot undo, same docked bar —
// the bar already drove exactly the controller interface the engine returns, so
// not one line of it changes.
//
// WHY WEIGHT IS THREADED THROUGH: drawing text is REGULAR weight; the engine's
// other hosts are bold. Passing the flag keeps every drawing already marked up
// in every report already issued rendering exactly as it does today.
var DVTextHost = {
  _lastTextColor: null,
  _lastTextBg: null,
  _textInput: null,
  _textController: null,
  _PALETTE: null,
  _SIZE_STEPS: _DV_SIZE_STEPS,
  _uid: function () { return _newId(); },
  render: function () { _renderAll(); },
  _findStroke: function (id) {
    for (var i = 0; i < _objects.length; i++) if (_objects[i] && _objects[i].id === id) return _objects[i];
    return null;
  },
  // The engine records individual operations; this viewer snapshots the whole
  // drawing. Both do it AFTER the mutation, so the timing already matches every
  // other change made here and undo behaves exactly as it always has.
  _pushOp: function () { _pushHistory(); },
  _onDirty: function () { _markDirty(); },
  _onTextStart: function (ctl) {
    _dvTextCtl = ctl;
    _dvTextBox = DVTextHost._textInput;
    if (_dvTextBox) {
      _dvTextBox.classList.add('dv-text-box');                     // keep the viewer's own box styling
      _dvTextBox._dvReposition = DVTextHost._repositionTextBox;    // pan/zoom re-glue hook
    }
    _dvShowTextBar(ctl);
  },
  _onTextEnd: function () {
    _dvLastTextColor = DVTextHost._lastTextColor || _dvLastTextColor;
    _dvLastTextBg    = DVTextHost._lastTextBg    || _dvLastTextBg;
    _dvTextCtl = null;
    _dvTextBox = null;
    _dvHideTextBar();
  }
};
Object.defineProperty(DVTextHost, 'strokes', { get: function () { return _objects; } });
Object.defineProperty(DVTextHost, 'canvas',  { get: function () { return _getCanvas(); } });
Object.defineProperty(DVTextHost, 'nw', { get: function () { var m = _getCanvas(); return m ? (m._logicalW || m.width)  : 1; } });
Object.defineProperty(DVTextHost, 'nh', { get: function () { var m = _getCanvas(); return m ? (m._logicalH || m.height) : 1; } });
// The engine clears array-typed redo stores by assignment; empty ours IN PLACE
// so the viewer's real redo stack is the one that gets cleared, not a copy.
Object.defineProperty(DVTextHost, 'redoStack', {
  get: function () { return _redoStack; },
  set: function () { try { _redoStack.length = 0; } catch (_) {} }
});

var _dvTextEngineReady = false;
function _dvInstallTextEngine() {
  if (_dvTextEngineReady) return true;
  if (!window.MarkupText || !window.MarkupText.install) return false;
  window.MarkupText.install(DVTextHost, {
    readFontN:   function (es) { return (es && es.fontSize) || 20; },
    newFontN:    function () { return _fontSize; },
    storeFont:   function (t, fontN) { t.fontSize = fontN; },
    // Verbatim the old controller's stepper: walk the tuned list, nearest first.
    stepFontN:   function (fontN, dir) {
      var i = 0, best = 1e9;
      for (var k = 0; k < _DV_SIZE_STEPS.length; k++) {
        var d = Math.abs(_DV_SIZE_STEPS[k] - fontN);
        if (d < best) { best = d; i = k; }
      }
      i = Math.max(0, Math.min(_DV_SIZE_STEPS.length - 1, i + dir));
      return _DV_SIZE_STEPS[i];
    },
    displaySize: function (fontN) { return Math.round(fontN); },
    readBold:    function (es) { return es ? !!es.bold : false; },   // new drawing text is REGULAR
    edgeDrag:    function () { return true; },                       // S410 #2 grab-the-edge move
    placement: function () {
      var overlay = document.getElementById('drawing-viewer-overlay') || document.body;
      return {
        host: overlay,
        origin: function () {
          var m = _getCanvas(); if (!m) return { x: 0, y: 0 };
          var r = m.getBoundingClientRect(), h = overlay.getBoundingClientRect();
          return { x: r.left - h.left, y: r.top - h.top };
        },
        sx: function () { return _dvTextZoom() || 1; },
        sy: function () { return _dvTextZoom() || 1; },
        track: true      // the drawing pans and zooms under the box; keep it glued
      };
    },
    buildStroke: function (v, fontN, color, bg, lx, ly, st, bold) {
      return toStroke({
        id: _newId(), type: 'text', text: v,
        x1: lx, y1: ly, color: color, fontSize: fontN,
        bold: !!bold, opacity: _opacity, bg: bg
      });
    },
    applyEdit: function (es, v, fontN, color, bg, lx, ly, bold) {
      es.text = v; es.fontSize = fontN; es.color = color;
      es.bg = bg; es.bold = !!bold; es.pts[0] = { x: lx, y: ly };
    }
  });
  _dvTextEngineReady = true;
  return true;
}

// editObj != null → re-edit an existing text object at its own anchor.
function _dvOpenTextBox(logicalPt, editObj) {
  if (!_dvInstallTextEngine()) { console.warn('[Markup] shared text engine unavailable'); return null; }
  if (DVTextHost._textController && DVTextHost._textController.isActive()) DVTextHost._textController.cancel();
  DVTextHost._lastTextColor = _dvLastTextColor || _color;
  DVTextHost._lastTextBg    = _dvLastTextBg;
  var st = { tool: 'text', color: (_dvLastTextColor || _color), alpha: _opacity, fontSize: _fontSize };
  var pt = editObj ? { x: editObj.pts[0].x, y: editObj.pts[0].y }
                   : { x: logicalPt.x, y: logicalPt.y };
  return DVTextHost._promptText(pt, st, editObj ? editObj.id : null);
}

function _dvCaretEnd(box) {
  try { var rg = document.createRange(); rg.selectNodeContents(box); rg.collapse(false);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(rg); } catch (_) {}
}

// Re-glue the open box to its logical anchor. MUST be called whenever the
// drawing surface pans/zooms (the whole reason this differs from the lightbox).
function _dvRepositionTextBox() {
  if (_dvTextBox && _dvTextBox._dvReposition) _dvTextBox._dvReposition();
}

// ---- docked text bar (built once, lazily) ----
var _dvTextBar = null, _dvPopText = null, _dvPopBg = null;
function _dvBuildTextBar() {
  if (_dvTextBar) return _dvTextBar;
  var overlay = document.getElementById('drawing-viewer-overlay') || document.body;
  var RET = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>';
  var XS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var OK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 13 10 18 19 6"/></svg>';
  var NONEX = '<svg width="100%" height="100%" viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" stroke="#e23" stroke-width="2.6"/></svg>';
  var bar = document.createElement('div');
  bar.id = 'dv-text-bar';
  bar.style.cssText = 'position:fixed;left:50%;bottom:72px;transform:translateX(-50%);display:none;' +
    'align-items:center;gap:4px;padding:7px 9px;background:rgba(20,20,28,.96);border:1.5px solid #C9476A;' +
    'border-radius:14px;z-index:1000;box-shadow:0 6px 20px rgba(0,0,0,.55);max-width:calc(100vw - 16px);' +
    'box-sizing:border-box;flex-wrap:nowrap;';
  bar.innerHTML =
    '<button type="button" class="dvtb-dec" style="width:34px;height:40px;border:none;background:transparent;color:#f4f3f6;font:700 20px Calibri;border-radius:8px;cursor:pointer;">\u2212</button>' +
    '<div class="dvtb-sizeval" style="min-width:26px;text-align:center;font:13px Calibri;color:#a09aa8;font-variant-numeric:tabular-nums;">20</div>' +
    '<button type="button" class="dvtb-inc" style="width:34px;height:40px;border:none;background:transparent;color:#f4f3f6;font:700 20px Calibri;border-radius:8px;cursor:pointer;">+</button>' +
    '<div style="width:1px;height:28px;background:rgba(255,255,255,.14);margin:0 2px;"></div>' +
    '<button type="button" class="dvtb-textcol" title="Text colour" style="width:40px;height:40px;border:none;background:transparent;border-radius:8px;cursor:pointer;position:relative;">' +
      '<span class="dvtb-A" style="font:800 19px Calibri;color:#9C2742;">A</span>' +
      '<span class="dvtb-Ustrip" style="position:absolute;bottom:5px;left:9px;right:9px;height:3px;border-radius:2px;background:#9C2742;"></span></button>' +
    '<button type="button" class="dvtb-bgcol" title="Background colour" style="width:40px;height:40px;border:none;background:transparent;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">' +
      '<span class="dvtb-bgglyph" style="width:22px;height:18px;border-radius:3px;border:1.5px solid rgba(255,255,255,.5);position:relative;overflow:hidden;display:block;"></span></button>' +
    '<button type="button" class="dvtb-ret" title="New line" style="width:44px;height:40px;border:none;background:transparent;color:#f4f3f6;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">' + RET + '</button>' +
    '<div style="width:1px;height:28px;background:rgba(255,255,255,.14);margin:0 2px;"></div>' +
    '<button type="button" class="dvtb-x" title="Discard" style="width:46px;height:40px;border:none;background:transparent;color:#a09aa8;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">' + XS + '</button>' +
    '<button type="button" class="dvtb-ok" title="Place" style="width:46px;height:40px;border:none;background:#3FD08A;color:#fff;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">' + OK + '</button>';
  overlay.appendChild(bar);
  _dvTextBar = bar;

  function mkPop() {
    var p = document.createElement('div');
    p.style.cssText = 'position:fixed;display:none;flex-wrap:wrap;gap:6px;width:160px;padding:8px;' +
      'background:rgba(34,34,44,.99);border:1px solid rgba(255,255,255,.16);border-radius:12px;' +
      'box-shadow:0 8px 26px rgba(0,0,0,.6);z-index:1001;';
    overlay.appendChild(p); return p;
  }
  _dvPopText = mkPop(); _dvPopBg = mkPop();

  function swatch(c, isNone) {
    var s = document.createElement('button'); s.type = 'button';
    s.style.cssText = 'width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.4);cursor:pointer;padding:0;overflow:hidden;';
    if (isNone) { s.style.background = '#2a2a32'; s.innerHTML = NONEX; } else { s.style.background = c; }
    return s;
  }
  function closePops() { _dvPopText.style.display = 'none'; _dvPopBg.style.display = 'none'; }
  function posPop(pop, btn) {
    var br = btn.getBoundingClientRect();
    pop.style.left = Math.max(6, br.left + br.width / 2 - 80) + 'px';
    pop.style.top = (br.top - pop.offsetHeight - 8) + 'px';
  }
  bar._dvClosePops = closePops;

  // text-colour palette + custom
  _DV_TEXT_PALETTE.forEach(function (c) {
    var s = swatch(c, false);
    s.addEventListener('click', function (e) { e.stopPropagation(); if (_dvTextCtl) { _dvTextCtl.setColor(c); _dvRefreshTextBar(); } closePops(); });
    _dvPopText.appendChild(s);
  });
  var txCustom = document.createElement('input'); txCustom.type = 'color'; txCustom.value = '#A85959';
  txCustom.style.cssText = 'width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none;';
  txCustom.addEventListener('input', function () { if (_dvTextCtl) { _dvTextCtl.setColor(txCustom.value); _dvRefreshTextBar(); } });
  _dvPopText.appendChild(txCustom);

  // bg palette: none + palette + custom
  var bgNone = swatch(null, true);
  bgNone.addEventListener('click', function (e) { e.stopPropagation(); if (_dvTextCtl) { _dvTextCtl.setBg('none'); _dvRefreshTextBar(); } closePops(); });
  _dvPopBg.appendChild(bgNone);
  _DV_TEXT_PALETTE.forEach(function (c) {
    var s = swatch(c, false);
    s.addEventListener('click', function (e) { e.stopPropagation(); if (_dvTextCtl) { _dvTextCtl.setBg(c); _dvRefreshTextBar(); } closePops(); });
    _dvPopBg.appendChild(s);
  });
  var bgCustom = document.createElement('input'); bgCustom.type = 'color'; bgCustom.value = '#1C2333';
  bgCustom.style.cssText = 'width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none;';
  bgCustom.addEventListener('input', function () { if (_dvTextCtl) { _dvTextCtl.setBg(bgCustom.value); _dvRefreshTextBar(); } });
  _dvPopBg.appendChild(bgCustom);

  // S396: fire on pointerdown + preventDefault so the button acts BEFORE the
  // contentEditable box loses focus (click was racing the blur and getting lost —
  // OK appeared to do nothing). Matches the dimension-chip pattern (mousedown-based).
  function _dvBtn(sel, fn) {
    var b = bar.querySelector(sel);
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
  }
  _dvBtn('.dvtb-dec', function () { if (_dvTextCtl) { _dvTextCtl.stepSize(-1); _dvRefreshTextBar(); } });
  _dvBtn('.dvtb-inc', function () { if (_dvTextCtl) { _dvTextCtl.stepSize(1); _dvRefreshTextBar(); } });
  _dvBtn('.dvtb-ret', function () { if (_dvTextCtl) _dvTextCtl.insertNewline(); });
  _dvBtn('.dvtb-ok',  function () { if (_dvTextCtl) _dvTextCtl.commit(); });
  _dvBtn('.dvtb-x',   function () { if (_dvTextCtl) _dvTextCtl.cancel(); });
  bar.querySelector('.dvtb-textcol').addEventListener('click', function (e) {
    e.stopPropagation(); var on = _dvPopText.style.display === 'flex'; closePops();
    if (!on) { _dvPopText.style.display = 'flex'; posPop(_dvPopText, this); }
  });
  bar.querySelector('.dvtb-bgcol').addEventListener('click', function (e) {
    e.stopPropagation(); var on = _dvPopBg.style.display === 'flex'; closePops();
    if (!on) { _dvPopBg.style.display = 'flex'; posPop(_dvPopBg, this); }
  });
  overlay.addEventListener('click', function (ev) { if (!bar.contains(ev.target) && !_dvPopText.contains(ev.target) && !_dvPopBg.contains(ev.target)) closePops(); });

  // lift the bar above the on-screen keyboard (visualViewport)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _dvLiftTextBar);
    window.visualViewport.addEventListener('scroll', _dvLiftTextBar);
  }
  return bar;
}
function _dvLiftTextBar() {
  if (!_dvTextBar || _dvTextBar.style.display === 'none') return;
  var vv = window.visualViewport;
  if (vv) { var gap = window.innerHeight - vv.height - vv.offsetTop; if (gap < 0) gap = 0; _dvTextBar.style.bottom = (gap + 12) + 'px'; }
  else { _dvTextBar.style.bottom = '16px'; }
}
function _dvRefreshTextBar() {
  if (!_dvTextBar || !_dvTextCtl) return;
  var col = _dvTextCtl.getColor(), bg = _dvTextCtl.getBg();
  _dvTextBar.querySelector('.dvtb-A').style.color = col;
  _dvTextBar.querySelector('.dvtb-Ustrip').style.background = col;
  var g = _dvTextBar.querySelector('.dvtb-bgglyph');
  if (!bg || bg === 'none') { g.style.background = 'transparent'; g.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" stroke="#e23" stroke-width="2.6"/></svg>'; }
  else { g.style.background = bg; g.innerHTML = ''; }
  _dvTextBar.querySelector('.dvtb-sizeval').textContent = Math.round(_dvTextCtl.getSize());
}
function _dvShowTextBar(ctl) {
  _dvBuildTextBar();
  _dvTextBar.style.display = 'flex';
  _dvRefreshTextBar();
  _dvLiftTextBar();
  requestAnimationFrame(_dvLiftTextBar);
  setTimeout(_dvLiftTextBar, 150);
  setTimeout(_dvLiftTextBar, 400);
}
function _dvHideTextBar() {
  if (_dvTextBar) { _dvTextBar.style.display = 'none'; if (_dvTextBar._dvClosePops) _dvTextBar._dvClosePops(); }
}

// ── Polyline Tool ───────────────────────────────────────

// ── S461q: POLYLINE runs on the SHARED module (lib/ui/markupPolyline.js).
// The module was EXTRACTED FROM THIS CODE — the drawing viewer is the source of
// truth — so behaviour is unchanged: 15-unit close tolerance, exact copy of
// point 0 on close, preview from 2 points, ✓ commits as-drawn, ↩ pops one point,
// ✕ discards. The photo lightbox drives the SAME module with its own config, so
// there is now ONE polyline tool, not two.
var PolyHost = (window.MarkupPolyline && window.MarkupPolyline.create({
  getOverlay: function () { return _ensureOverlay(); },
  hideOverlay: function () {
    var ov = _getOverlay();
    if (!ov) return;
    ov.style.display = 'none';
    var c = ov.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ov.width, ov.height);
  },
  style: function () { return { color: _color, size: _lineWidth, opacity: _opacity }; },
  commit: function (pts) {
    // The host mints its OWN format — the module knows nothing about v1 objects.
    _objects.push(toStroke({
      id: _newId(), type: 'polyline', points: pts,
      color: _color, size: _lineWidth, opacity: _opacity
    }));
    _pushHistory();
    _markDirty();
  },
  afterChange: function (n) {
    var pill = document.getElementById('poly-sub-toolbar');
    if (!pill) return;
    if (n > 0) _dvPositionPolyPill();       // appears with point 1, follows the last
    else pill.style.display = 'none';       // finished or cancelled
  },
  render: function () { _renderAll(); }
})) || null;

function _handlePolylineClick(e) { if (PolyHost) PolyHost.addPoint(_getPos(e)); }
function _finishPolyline()      { if (PolyHost) PolyHost.finish(); }
function _commitPolyline()      { if (PolyHost) PolyHost.finish(); }   // <2 pts → module cancels
function _cancelPolyline()      { if (PolyHost) PolyHost.cancel(); }
// ── S461e: polyline pill — restyled to MATCH the ✓/✗ confirm bar (same
// family as tap-select) and ANCHORED beside the last placed point instead of
// floating far away (Mark, frt-next field report). Styles applied once.
function _dvStylePolyPill(pill) {
  if (pill._dvStyled) return; pill._dvStyled = true;
  pill.style.cssText += ';' + _DV_PILL_BOX;
  var ok = document.getElementById('poly-commit-btn');
  if (ok) { ok.innerHTML = '\u2713'; ok.style.cssText = _DV_PILL_FINISH; }   // S461k: circle only
  // S461j: ↩ RESTORED (Mark: "I didn't say to remove ↩ from polyline" — only
  // the NEW pills [dim finish, selection confirm] are Finish + ✕).
  var un = document.getElementById('poly-undo-pt-btn');
  if (un) un.style.cssText = 'border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:15px;color:#fff;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;';
  var no = document.getElementById('poly-cancel-btn');
  if (no) no.style.cssText = _DV_PILL_X;
}
// S461j — ONE pill design (Mark: "match polyline pill design exactly").
// Every in-progress pill [polyline / dim finish / selection confirm] clones
// these metrics; only the button set differs (polyline keeps ↩).
var _DV_PILL_BOX    = 'position:fixed;z-index:10021;display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(20,20,28,.96);border:1px solid rgba(255,255,255,.14);border-radius:20px;box-shadow:0 6px 20px rgba(0,0,0,.55);';
var _DV_PILL_FINISH = 'border:none;flex:0 0 auto;width:36px;min-width:36px;height:36px;min-height:36px;border-radius:50%;cursor:pointer;font-size:17px;color:#fff;background:#3FD08A;display:flex;align-items:center;justify-content:center;';   // S479 (Mark, B): TRUE circle — was a lozenge. S572 (Mark): flex:0 0 auto + min sizes — the pill row was allowed to squeeze the circles into ovals when it ran out of room
var _DV_PILL_X      = 'border:none;flex:0 0 auto;width:36px;min-width:36px;height:36px;min-height:36px;border-radius:50%;cursor:pointer;font-size:15px;color:#fff;background:#C0445F;display:flex;align-items:center;justify-content:center;';
// S461k (Mark): ONE placement rule for every pill. Touch devices → FIXED
// bottom-center (never jumps, never leaves the screen). Fine pointers (PC)
// → follow near the anchor point, hard-clamped inside the viewport.
function _dvPlacePill(pill, anchorLogical) {
  var coarse = (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  pill.style.display = 'flex';
  if (coarse || !anchorLogical) {
    pill.style.left = '50%'; pill.style.transform = 'translateX(-50%)';
    pill.style.top = 'auto'; pill.style.bottom = '84px'; pill.style.right = 'auto';
    return;
  }
  var mc = _getCanvas(); if (!mc) return;
  var r = mc.getBoundingClientRect();
  var lw = mc._logicalW || mc.width, lh = mc._logicalH || mc.height;
  var px2 = r.left + (anchorLogical.x / lw) * r.width;
  var py2 = r.top + (anchorLogical.y / lh) * r.height;
  var pw = pill.offsetWidth || 170, ph = pill.offsetHeight || 50;
  var sx = px2 + 56;
  if (sx + pw > window.innerWidth - 8) sx = px2 - pw - 56;
  var sy = py2 + 56;
  sx = Math.max(8, Math.min(window.innerWidth - pw - 8, sx));
  sy = Math.max(8, Math.min(window.innerHeight - ph - 8, sy));
  pill.style.transform = ''; pill.style.bottom = 'auto'; pill.style.right = 'auto';
  pill.style.left = sx + 'px'; pill.style.top = sy + 'px';
}
function _dvPositionPolyPill() {
  var pill = document.getElementById('poly-sub-toolbar');
  var last = PolyHost && PolyHost.lastPoint();
  if (!pill || !last) return;
  _dvStylePolyPill(pill);
  _dvPlacePill(pill, last);
}

// ↩ Undo removes only the LAST placed point and repaints the preview —
// fixes a misclick without redrawing the whole polyline.
function _undoPolyPoint() { if (PolyHost) PolyHost.undoPoint(); }
// S461q: _redrawPolyOverlay retired — the shared module repaints the preview.
function _redrawPolyOverlay() { if (PolyHost) PolyHost.redraw(); }

function _drawPolylinePreview(e) {
  // S461q: the shared module draws the preview — placed segments + the
  // rubber-band leg to the cursor + the close indicator on point 0.
  if (PolyHost) PolyHost.preview(_getPos(e));
}

// ── Select Tool ─────────────────────────────────────────

// S461: _dragState removed — drag state lives on SelHost (engine-owned).

function _hitTestObjects(pos) {
  // S461: kept for the text tap/double-tap-to-edit paths (selection hit-testing
  // itself lives in the shared engine now). _getBounds speaks v1 — hand it views.
  for (var i = _objects.length - 1; i >= 0; i--) {
    var b = _getBounds(toV1(_objects[i]));
    if (b && pos.x >= b.x1 - 6 && pos.x <= b.x2 + 6 && pos.y >= b.y1 - 6 && pos.y <= b.y2 + 6) {
      return _objects[i];
    }
  }
  return null;
}

function _handleSelectDown(e) {
  // S461: selection is the SHARED engine. Multi = the S113 Ctrl/Cmd toggle,
  // routed as the engine's multi flag (identical semantics: toggle membership,
  // no drag starts on a modifier click). Copy/delete/resize/rotate handles,
  // group move, and rubber-band all live in the engine now.
  var pos = _getPos(e);
  /* ── S661 (Mark) — SELECT IS THE EDIT PATH FOR DIMENSIONS. ──────────────
     A dimension is a couple of pixels of line plus a small value chip, and
     rubber-banding one to then find an edit command is not something anyone
     can do with a thumb. With Select active, a plain tap on a dimension now
     opens its value editor directly — same result as the desktop double-click,
     reachable on a tablet.
     Deliberately does NOT apply while the dimension tool is armed: an armed
     tap must still be able to draw across an existing dimension, which is
     routine on a congested sprinkler sheet. Arming is the switch between the
     two behaviours, so a tap never has to guess what you meant. */
  try {
    var _dimSel = window._dimTool;
    if (_dimSel && _dimSel.hitTestDimension) {
      /* S662 — the edit-tap zone is SCREEN-constant and touch-aware.
         The default tolerance is 8 DRAWING units, which shrinks as you zoom
         out: on a full sheet it is a 2–4 screen-px sliver, untappable under
         a finger — the reason editing felt broken while the demo (thumb-
         sized target) felt fine. Same principle as the S552 vertex handles.
         ±24 screen px on touch (≈48 px band), ±10 on desktop, converted to
         drawing units via _uiScale() so it holds at any zoom.
         Deliberately passed HERE only: the armed-tap and dbl-click callers
         keep the tight default so an armed tap still draws across an
         existing dimension (locked S661 behaviour). */
      var _selCoarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
      /* S664 — the LABEL CHIP is a tap target, checked before the line. When
         you want to edit a value, eye and finger go to the "8'-4" text, not
         the thin line beside it: tap the number to change the number. Point-
         in-rect against the painted chip (from _dimLabelBoxes, harvested at
         render), padded screen-constant so a fit-zoomed chip stays tappable.
         Overlapping chips: nearest centre wins. Host-owned tap policy — the
         engine owns the chip geometry, not what a tap on it means. */
      var _lbPad = (_selCoarse ? 12 : 4) * _uiScale();
      var _lbBest = null, _lbBestD = Infinity;
      for (var _lbI = _objects.length - 1; _lbI >= 0; _lbI--) {
        var _lbO = _objects[_lbI];
        if (!_lbO || _lbO.type !== 'dimension') continue;
        var _lbB = _dimLabelBoxes[_lbO.id];
        if (!_lbB) continue;
        if (pos.x < _lbB.x - _lbPad || pos.x > _lbB.x + _lbB.w + _lbPad ||
            pos.y < _lbB.y - _lbPad || pos.y > _lbB.y + _lbB.h + _lbPad) continue;
        var _lbDx = pos.x - (_lbB.x + _lbB.w / 2), _lbDy = pos.y - (_lbB.y + _lbB.h / 2);
        var _lbD = _lbDx * _lbDx + _lbDy * _lbDy;
        if (_lbD < _lbBestD) { _lbBest = _lbO; _lbBestD = _lbD; }
      }
      if (_lbBest) {
        _dimVertexEditId = _lbBest.id;
        _renderAll();
        _editDimensionLabel(_lbBest);   // live object — no lookup needed
        return;
      }
      var _hitSel = _dimSel.hitTestDimension(pos, _objects.map(toV1), (_selCoarse ? 24 : 10) * _uiScale());
      if (_hitSel) {
        _dimVertexEditId = _hitSel.id;
        _renderAll();
        // hitTestDimension returns a v1 VIEW (a copy) — resolve the live
        // stroke so label writes land on the real object.
        _editDimensionLabel(_findObj(_hitSel.id) || _hitSel);
        return;
      }
    }
  } catch (_) {}
  SelHost._selDown(pos, !!(e && (e.ctrlKey || e.metaKey)));
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
  // S461: pts model. NOTE — this function appears to have no callers post-S390
  // (the dv-text-box chip engine owns text editing); converted anyway so no
  // stale v1 reads survive in the file.
  var screenX = r.left + (obj.pts[0].x / lw) * r.width;
  var screenY = r.top + ((obj.pts[0].y - (obj.fontSize || 20)) / lh) * r.height;

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

  input._mkX = obj.pts[0].x;
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
  SelHost._selMove(_getPos(e));
}

function _handleSelectUp() {
  // Engine finishes the drag: rubber-band select (aabb-hook intersect),
  // op-log on moved commits (logOp → _pushHistory + _markDirty), render,
  // onSelChange → _syncTextDecoButtons. Full parity with the old handler.
  SelHost._selUp();
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
  /* S700a — AN ISSUED REPORT'S DRAWINGS DO NOT MOVE. This save writes to
     IndexedDB and uploads to cloud storage BEFORE the report row is written,
     and the row is the only thing the issued-report lock can refuse. So on an
     issued report the strokes would reach storage — and every other device —
     while the report itself was refused: the drawings of a document already
     sent to a client would change underneath it, silently.

     The markup tools are hidden and the gesture gate refuses them before a
     stroke exists, so reaching here at all means a path we did not foresee.
     Refusing here is the backstop that makes the outcome safe anyway. */
  try {
    if (typeof window !== 'undefined' && window.FRT_ISSUED_LOCKED && window.FRT_ISSUED_LOCKED()) {
      console.warn('[Markup S700a] Save refused \u2014 this report is issued and closed to edits.');
      return;
    }
  } catch (_e700) {}
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
  // S461: persisted format stays v1 byte-for-byte — strokes → v1 at the boundary.
  var snapshot = JSON.parse(JSON.stringify(_objects.map(toV1)));
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
  SelHost.deselect();   // S461

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
 * S526 — background per-item reconcile of local IDB markup against the
 * drawing's R2 copy. See the call-site comment for the field incident this
 * closes. Additive + tombstone-honouring only; never removes a local object
 * that R2 merely lacks.
 */
function _reconcileMarkupWithR2(drawingId, drawing, loadToken) {
  try {
    if (!drawing || !drawing.markupR2 || !drawing.markupR2.r2Url) return;
    R2.downloadMarkup(drawing.markupR2.r2Url).then(function(blob) {
      if (_drawingId !== loadToken) return;             // viewer moved on
      if (_undoStack.length || _redoStack.length) return; // user edited — next open reconciles
      if (!blob) return;
      var remoteObjs  = Array.isArray(blob.objects) ? blob.objects : [];
      var remoteTombs = _normalizeTombstones(blob.deletedIds);

      var localIds = {}, i;
      for (i = 0; i < _objects.length; i++) localIds[_objects[i].id] = true;
      var localTomb = {};
      for (i = 0; i < _tombstones.length; i++) localTomb[_tombstones[i].id] = true;
      var remoteTomb = {};
      for (i = 0; i < remoteTombs.length; i++) remoteTomb[remoteTombs[i].id] = true;

      var added = 0, removed = 0;
      // + objects R2 has that we don't — unless we deleted them here.
      for (i = 0; i < remoteObjs.length; i++) {
        var ro = remoteObjs[i];
        if (ro && ro.id && !localIds[ro.id] && !localTomb[ro.id]) {
          _objects.push(toStroke(ro));
          added++;
        }
      }
      // − objects R2 explicitly tombstoned — a recorded cross-device delete.
      if (remoteTombs.length) {
        var kept = [];
        for (i = 0; i < _objects.length; i++) {
          if (remoteTomb[_objects[i].id]) { removed++; } else { kept.push(_objects[i]); }
        }
        _objects = kept;
      }
      if (!added && !removed) return;                    // already in step

      // union tombstones so our next upload preserves both sides' deletes
      for (i = 0; i < remoteTombs.length; i++) {
        if (!localTomb[remoteTombs[i].id]) _tombstones.push(remoteTombs[i]);
      }
      console.log('[Markup] R2 reconcile: +' + added + ' from other devices, −' +
                  removed + ' cross-device deletions (drawing ' + drawingId + ')');
      _renderAll();
      _updateUndoButtons();
      // persist the union locally so the next open is instant and complete
      IDB.put('markupObjects', {
        id: drawingId, drawingId: drawingId,
        objects: JSON.parse(JSON.stringify(_objects.map(toV1))),
        deletedIds: _tombstones.slice()
      }).catch(function(e) { console.warn('[Markup] reconcile IDB save error:', e); });
    }).catch(function(e) {
      console.warn('[Markup] R2 reconcile skipped:', e && e.message);
    });
  } catch (e) {
    console.warn('[Markup] R2 reconcile error:', e && e.message);
  }
}


/* ═══════════════════════════════════════════════════════════════════════
   S527 — ON-SCREEN MARKUP DIAGNOSTIC (Mark)

   WHY: Ian's tablet would not show dimensions that his phone and PC both
   showed. Everything I could check remotely was healthy — the cloud file,
   the record's reference, the deployed code. The missing evidence was only
   ever on the device, and field tablets run the Android TWA where the user
   CANNOT type a URL param, so the usual debug hatch does not exist. This is
   that hatch: viewer ⋯ menu → Markup Diagnostic.

   It answers, in plain words, the only question that matters when markup is
   missing: WHERE DOES THIS DEVICE THINK THE MARKUP IS, and what does each
   copy actually contain — this device, the record, the cloud file.

   Read-only, except for one deliberate button: "Merge cloud copy now",
   which runs the same union as the automatic reconcile but ignores the
   "device already has a local copy" shortcut. It ADDS what the cloud has and
   honours cloud deletions; it never removes a local object the cloud merely
   lacks. That is the escape hatch for a device stuck on a stale local copy.
   ═══════════════════════════════════════════════════════════════════════ */
function _markupDiagReport() {
  var out = { drawingId: _drawingId || null, memObjects: _objects.length,
              memTombstones: _tombstones.length, build: (window.FRT_BUILD || '?') };
  try {
    var proj = Model.getProject();
    out.projectName = proj && proj.info ? (proj.info.projectNumber || '') : '';
    var dwg = null;
    if (proj && proj.drawings) {
      for (var i = 0; i < proj.drawings.length; i++) {
        if (proj.drawings[i].id === _drawingId) { dwg = proj.drawings[i]; break; }
      }
    }
    out.drawingName = dwg ? (dwg.name || '') : '(drawing not found in record)';
    out.ref = (dwg && dwg.markupR2) ? {
      count: dwg.markupR2.count, updatedAt: dwg.markupR2.updatedAt, url: dwg.markupR2.r2Url
    } : null;
    out.legacy = !!(dwg && dwg.markupObjects && dwg.markupObjects.length);
  } catch (e) { out.error = e && e.message; }
  return out;
}

/* ── S587 — PIN WRITE LOG, on-tablet (Mark: the crew hit this in the field and
   only a PC console could read the evidence). Every pin surface already logs
   each accepted, refused, ignored and disarmed write to window._frtPinWriteLog;
   this simply shows it. Read-only, no actions — the point is that an inspector
   who thinks a pin moved can OPEN this and screenshot it, so "I think my pin
   moved" becomes evidence the same day instead of a month-later forensic dig.
   Field tablets run the Android TWA where the address bar is not editable, so
   a menu row is the only way in — never a URL param. */
function _showPinWriteLog() {
  var log = [];
  try { log = (window._frtPinWriteLog || []).slice(); } catch (e) {}
  var old = document.getElementById('frt-pin-log');
  if (old) old.remove();

  var wrap = document.createElement('div');
  wrap.id = 'frt-pin-log';
  wrap.setAttribute('style',
    'position:fixed;inset:0;z-index:100000;background:rgba(11,10,13,.55);' +
    'display:flex;align-items:center;justify-content:center;padding:16px;' +
    'font-family:Calibri,sans-serif;');

  var card = document.createElement('div');
  card.setAttribute('style',
    'background:#EFEDF0;color:#1B1A22;border:1px solid #D2CEDB;border-radius:16px;' +
    'box-shadow:0 8px 32px rgba(0,0,0,.35);max-width:620px;width:100%;' +
    'max-height:88vh;overflow:auto;padding:20px 22px;');

  var blocked = 0;
  for (var i = 0; i < log.length; i++) {
    var v = String(log[i].verdict || '');
    if (v.indexOf('REFUSED') === 0 || v.indexOf('IGNORED') === 0 || v.indexOf('DISARMED') === 0) blocked++;
  }

  var h = '<div style="font-size:17px;font-weight:600;margin-bottom:4px;">Pin Write Log</div>' +
    '<div style="font-size:12.5px;color:#5E5B68;margin-bottom:14px;line-height:1.5;">' +
    'Every pin position this device has written or refused since the app was opened. ' +
    'If a pin looks like it moved on its own, open this and screenshot it.</div>';

  h += '<div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #E4E1E8;">' +
       '<div style="flex:0 0 44%;font-size:13px;color:#5E5B68;">Entries this session</div>' +
       '<div style="flex:1;font-size:13px;font-weight:600;color:#5E5B68;">' + log.length + '</div></div>';
  h += '<div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #E4E1E8;">' +
       '<div style="flex:0 0 44%;font-size:13px;color:#5E5B68;">Bad writes stopped</div>' +
       '<div style="flex:1;font-size:13px;font-weight:600;color:' + (blocked ? '#2E9E72' : '#5E5B68') + ';">' +
       blocked + (blocked ? '  \u2014 the guards did their job' : '') + '</div></div>';

  if (!log.length) {
    h += '<div style="margin:14px 0;font-size:13px;color:#5E5B68;line-height:1.6;">' +
         'Nothing yet. Entries appear as soon as a pin is placed, moved, or a bad ' +
         'write is refused. This clears every time the app restarts.</div>';
  } else {
    h += '<div style="margin-top:14px;font-size:13px;font-weight:600;">Most recent first</div>';
    var shown = log.slice(-40).reverse();
    for (var j = 0; j < shown.length; j++) {
      var e = shown[j];
      var vv = String(e.verdict || '?');
      var bad = (vv.indexOf('REFUSED') === 0 || vv.indexOf('IGNORED') === 0);
      var warn = (vv.indexOf('DISARMED') === 0);
      var col = bad ? '#C0445F' : (warn ? '#C98A4A' : '#2E9E72');
      var when = '?';
      try { when = new Date(e.at).toLocaleTimeString(); } catch (eT) {}
      var pos = (e.computed && typeof e.computed.x === 'number')
        ? (e.computed.x + ', ' + e.computed.y) : '\u2014';
      h += '<div style="padding:8px 0;border-bottom:1px solid #E4E1E8;">' +
           '<div style="font-size:13px;font-weight:600;color:' + col + ';word-break:break-word;">' + vv + '</div>' +
           '<div style="font-size:12px;color:#5E5B68;margin-top:2px;">' +
           when + '  \u00b7  ' + (e.surface || e.host || 'pin') + '  \u00b7  position ' + pos + '</div></div>';
    }
    if (log.length > 40) {
      h += '<div style="margin-top:8px;font-size:11.5px;color:#928E9C;">' +
           'Showing the last 40 of ' + log.length + '.</div>';
    }
  }

  h += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">' +
    '<button id="pwl-copy" style="height:40px;padding:0 14px;border-radius:8px;border:1px solid #D2CEDB;' +
    'background:#EFEDF0;color:#1B1A22;font-family:Calibri,sans-serif;font-size:14px;cursor:pointer;">Copy report</button>' +
    '<button id="pwl-close" style="height:40px;padding:0 14px;border-radius:8px;border:1px solid #D2CEDB;' +
    'background:#EFEDF0;color:#1B1A22;font-family:Calibri,sans-serif;font-size:14px;cursor:pointer;">Close</button>' +
    '</div>' +
    '<div id="pwl-msg" style="margin-top:10px;font-size:13px;color:#5E5B68;min-height:18px;"></div>' +
    '<div style="margin-top:10px;font-size:11.5px;color:#928E9C;line-height:1.5;">' +
    'Green lines are normal saved positions. Red means a bad write was stopped before ' +
    'it could move a pin. Amber means a pin was let go safely when the camera or another ' +
    'app interrupted you.</div>';

  card.innerHTML = h;
  wrap.appendChild(card);
  document.body.appendChild(wrap);

  var msg = card.querySelector('#pwl-msg');
  card.querySelector('#pwl-close').addEventListener('click', function () { wrap.remove(); });
  card.querySelector('#pwl-copy').addEventListener('click', function () {
    var txt = 'ARENCON FRT — Pin Write Log\n' +
      'build ' + (window.FRT_BUILD || '?') + '  ·  ' + new Date().toLocaleString() + '\n' +
      'entries ' + log.length + '  ·  bad writes stopped ' + blocked + '\n\n' +
      log.map(function (e) {
        var pos = (e.computed && typeof e.computed.x === 'number') ? (e.computed.x + ',' + e.computed.y) : '-';
        return e.at + '  ' + (e.surface || e.host || 'pin') + '  ' + e.verdict + '  ' + pos;
      }).join('\n');
    try {
      navigator.clipboard.writeText(txt);
      if (msg) msg.textContent = 'Copied. Paste it into a message to Mark.';
    } catch (eC) {
      if (msg) msg.textContent = 'Could not copy — screenshot this instead.';
    }
  });
  wrap.addEventListener('click', function (ev) { if (ev.target === wrap) wrap.remove(); });
}
try { window._frtPinWriteLogPanel = _showPinWriteLog; } catch (e) {}

function _showMarkupDiag() {
  var r = _markupDiagReport();
  var old = document.getElementById('frt-markup-diag');
  if (old) old.remove();

  var wrap = document.createElement('div');
  wrap.id = 'frt-markup-diag';
  wrap.setAttribute('style',
    'position:fixed;inset:0;z-index:100000;background:rgba(11,10,13,.55);' +
    'display:flex;align-items:center;justify-content:center;padding:16px;' +
    'font-family:Calibri,sans-serif;');

  var card = document.createElement('div');
  card.setAttribute('style',
    'background:#EFEDF0;color:#1B1A22;border:1px solid #D2CEDB;border-radius:16px;' +
    'box-shadow:0 8px 32px rgba(0,0,0,.35);max-width:620px;width:100%;' +
    'max-height:88vh;overflow:auto;padding:20px 22px;');

  function row(label, value, tone) {
    var c = tone === 'bad' ? '#C0445F' : (tone === 'good' ? '#2E9E72' : '#5E5B68');
    return '<div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #E4E1E8;">' +
           '<div style="flex:0 0 44%;font-size:13px;color:#5E5B68;">' + label + '</div>' +
           '<div style="flex:1;font-size:13px;font-weight:600;color:' + c + ';word-break:break-word;">' +
           value + '</div></div>';
  }

  var h = '<div style="font-size:17px;font-weight:600;margin-bottom:4px;">Markup Diagnostic</div>' +
    '<div style="font-size:12.5px;color:#5E5B68;margin-bottom:14px;line-height:1.5;">' +
    'Where this device thinks the markup is. Read this top to bottom — the first ' +
    'red line is the problem.</div>';

  h += row('Sheet', (r.drawingName || '—') + (r.projectName ? '  ·  ' + r.projectName : ''));
  h += row('App build', r.build, r.build === '?' ? 'bad' : 'good');
  h += row('Showing on screen now', r.memObjects + ' marks, ' + r.memTombstones + ' deleted',
           r.memObjects ? 'good' : 'bad');
  h += row('This device\u2019s saved copy', '<span id="mdg-idb">checking\u2026</span>');
  h += row('Record points at cloud file',
           r.ref ? ('yes \u2014 ' + r.ref.count + ' marks, saved ' +
                    (r.ref.updatedAt ? new Date(r.ref.updatedAt).toLocaleString() : '?'))
                 : 'NO \u2014 nothing recorded for this sheet',
           r.ref ? 'good' : 'bad');
  h += row('Cloud file itself', '<span id="mdg-r2">checking\u2026</span>');
  if (r.legacy) h += row('Legacy markup on record', 'yes (will migrate on open)');

  h += '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">' +
    '<button id="mdg-merge" style="flex:1 1 220px;height:40px;border-radius:8px;border:1px solid #9C2742;' +
    'background:#9C2742;color:#fff;font-family:Calibri,sans-serif;font-size:14px;font-weight:600;cursor:pointer;">' +
    'Merge cloud copy now</button>' +
    '<button id="mdg-copy" style="height:40px;padding:0 14px;border-radius:8px;border:1px solid #D2CEDB;' +
    'background:#EFEDF0;color:#1B1A22;font-family:Calibri,sans-serif;font-size:14px;cursor:pointer;">Copy report</button>' +
    '<button id="mdg-close" style="height:40px;padding:0 14px;border-radius:8px;border:1px solid #D2CEDB;' +
    'background:#EFEDF0;color:#1B1A22;font-family:Calibri,sans-serif;font-size:14px;cursor:pointer;">Close</button>' +
    '</div>' +
    '<div id="mdg-msg" style="margin-top:10px;font-size:13px;color:#5E5B68;min-height:18px;"></div>' +
    '<div style="margin-top:10px;font-size:11.5px;color:#928E9C;line-height:1.5;">' +
    'Merging only ADDS marks this device is missing and applies deletions made ' +
    'elsewhere. It never removes your own work.</div>';

  card.innerHTML = h;
  wrap.appendChild(card);
  document.body.appendChild(wrap);

  var msg = card.querySelector('#mdg-msg');
  function set(id, text, tone) {
    var el = card.querySelector('#' + id);
    if (!el) return;
    el.textContent = text;
    el.style.color = tone === 'bad' ? '#C0445F' : (tone === 'good' ? '#2E9E72' : '#1B1A22');
  }

  IDB.get('markupObjects', r.drawingId).then(function(rec) {
    var n = rec && rec.objects ? rec.objects.length : 0;
    var t = rec && rec.deletedIds ? rec.deletedIds.length : 0;
    set('mdg-idb', rec ? (n + ' marks, ' + t + ' deleted') : 'none stored on this device',
        rec && n ? 'good' : 'bad');
  }).catch(function(e) { set('mdg-idb', 'could not read: ' + (e && e.message), 'bad'); });

  if (r.ref && r.ref.url) {
    R2.downloadMarkup(r.ref.url).then(function(blob) {
      var n = blob && blob.objects ? blob.objects.length : 0;
      set('mdg-r2', blob ? (n + ' marks available in the cloud') : 'reachable but empty',
          n ? 'good' : 'bad');
    }).catch(function(e) {
      set('mdg-r2', 'CANNOT REACH \u2014 ' + (e && e.message ? e.message : 'network blocked'), 'bad');
    });
  } else {
    set('mdg-r2', 'no cloud file recorded for this sheet', 'bad');
  }

  card.querySelector('#mdg-close').onclick = function() { wrap.remove(); };
  card.querySelector('#mdg-copy').onclick = function() {
    var txt = JSON.stringify(_markupDiagReport(), null, 2);
    try { navigator.clipboard.writeText(txt); msg.textContent = 'Report copied.'; }
    catch (e) { msg.textContent = txt; }
  };
  card.querySelector('#mdg-merge').onclick = function() {
    if (!r.drawingId) { msg.textContent = 'No sheet open.'; return; }
    var proj = Model.getProject(), dwg = null;
    if (proj && proj.drawings) {
      for (var i = 0; i < proj.drawings.length; i++) {
        if (proj.drawings[i].id === r.drawingId) { dwg = proj.drawings[i]; break; }
      }
    }
    if (!dwg || !dwg.markupR2 || !dwg.markupR2.r2Url) {
      msg.textContent = 'No cloud file recorded for this sheet \u2014 nothing to merge.';
      return;
    }
    var before = _objects.length;
    msg.textContent = 'Merging\u2026';
    // Same union as the automatic reconcile, but forced: bypasses the
    // "device already has a copy" shortcut and the mid-edit stand-aside.
    var savedUndo = _undoStack, savedRedo = _redoStack;
    _undoStack = []; _redoStack = [];
    _reconcileMarkupWithR2(r.drawingId, dwg, _drawingId);
    setTimeout(function() {
      _undoStack = savedUndo; _redoStack = savedRedo;
      var added = _objects.length - before;
      msg.textContent = added > 0
        ? ('Merged \u2014 ' + added + ' mark(s) added from the cloud. Close this and check the sheet.')
        : 'Already in step with the cloud \u2014 nothing to add.';
      msg.style.color = added > 0 ? '#2E9E72' : '#5E5B68';
    }, 2500);
  };
}

/* Menu wiring — delegated so it survives any re-render of the More menu. */
document.addEventListener('click', function(e) {
  if (e.target && e.target.closest && e.target.closest('[data-dv-action="markupdiag"]')) {
    e.preventDefault();
    var mm = document.getElementById('dv-more-menu');
    if (mm) mm.classList.remove('open');   // S581: engine menus open/close by class
    _showMarkupDiag();
  }
});
try { window._frtMarkupDiag = _showMarkupDiag; } catch (_e) {}


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
        _objects = (Array.isArray(blob.objects) ? blob.objects : []).map(toStroke);   // S461: v1 → engine strokes
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
      _objects = (Array.isArray(rec.objects) ? rec.objects : []).map(toStroke);   // S461: v1 → engine strokes
      // S129 1.1 — restore tombstones from IDB record (defensive on shape).
      // S133 — normalize legacy string entries to {id, t} for the new format.
      _tombstones = _normalizeTombstones(rec.deletedIds);
      console.log('[Markup] Loaded ' + _objects.length + ' objects + ' +
                  _tombstones.length + ' tombstones from IDB');
      _renderWhenReady();
      // ── S526 DOCTRINE I-2/I-3 — RECONCILE WITH R2, DON'T SHADOW IT ────
      // The S130 ordering ("IDB first, R2 only when IDB has NOTHING") fixed
      // the two-opens bug but created its mirror image in the field: a
      // device that holds ANY IDB record for a drawing never consults R2
      // again. Ian's tablet held an early, near-empty record for Ceiling
      // A01 pg1; Mark's PC later authored 16 dimensions to R2; the tablet's
      // stale IDB copy shadowed them forever — sign-out/in doesn't touch
      // IDB, so it looked exactly like data loss. "IDB is newer-or-equal to
      // R2" is only true for markup THIS device authored.
      // Fix: after rendering local instantly, fetch R2 in the background
      // when the drawing carries a markupR2 ref, and UNION per item by id:
      //   + add R2 objects we don't have (unless locally tombstoned)
      //   − honour R2 tombstones (an explicit cross-device deletion record
      //     — deletion beats absence, doctrine I-2)
      //   · never remove a local object R2 merely LACKS (absence ≠ delete)
      // Skip the merge if the user has started drawing since open
      // (_undoStack not empty) — the next open reconciles instead. No R2
      // re-upload here; the next ordinary save uploads the union.
      _reconcileMarkupWithR2(drawingId, drawing, _loadToken);
      return;
    }
    // Path 3 — legacy field on the drawing
    if (drawing && drawing.markupObjects && drawing.markupObjects.length) {
      _objects = JSON.parse(JSON.stringify(drawing.markupObjects)).map(toStroke);   // S461: v1 → engine strokes
      // No tombstones in legacy format — leave _tombstones = [] from _loadMarkup.
      console.log('[Markup] Loaded ' + _objects.length + ' legacy objects — migrating to R2');
      _renderWhenReady();
      // Lazy migration — upload to R2 + write the reference. S129 1.1: pass
      // empty tombstones (legacy never had any).
      if (projectId && !_markupUploadInflight) {
        _markupUploadInflight = true;
        R2.uploadMarkup(projectId, drawingId, _objects.map(toV1), []).then(function(result) {   // S461: v1 view
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
  if (SelHost.selIds.length) {
    SelHost.selIds.forEach(function(id) {
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
  } else if (_tool === 'select' && SelHost.selIds.length) {
    var textObjs = [];
    for (var i = 0; i < SelHost.selIds.length; i++) {
      var o = _findObj(SelHost.selIds[i]);
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
  // S392: An open text box must not survive a tool switch/disarm — otherwise the
  // empty contentEditable div is left on the canvas (invisible pointer-blocker as
  // you pan/zoom) and its docked bar stays visible. Commit it first (empty text
  // self-deletes via commit()). Guarded by _dvTextCtl.isActive() so the nested
  // _setActiveTool(null) that cleanup() itself fires is a no-op (already resolved).
  if (_dvTextBox && _dvTextCtl && _dvTextCtl.isActive()) {
    _dvTextCtl.commit();
  }
  if (_tool === 'polyline' && PolyHost && PolyHost.count() >= 2 && tool !== 'polyline') {
    _finishPolyline();
  }

  _tool = tool;
  SelHost.deselect();   // S461
  // S574: entering/leaving the trash tool drives the engine's trash mode —
  // switching straight to ANY other tool exits it, so the forced tap sub-mode
  // and the pick set can never leak into the next tool.
  if (SelHost.setTrashMode) SelHost.setTrashMode(tool === 'trash');
  if (tool !== 'trash' && _dvTrashBar) _dvTrashBar.style.display = 'none';
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
  // S407: polyline sub-toolbar visibility mirrors the dimension pattern.
  // Leaving the polyline tool discards any in-progress (uncommitted) points —
  // same contract as _resetDimensionFlow above.
  var polySub = document.getElementById('poly-sub-toolbar');
  // S461h (Mark): the pill shows ONLY while a polyline is actually in
  // progress — it appears on the first placed point (_dvPositionPolyPill)
  // and hides on Finish / Cancel / tool switch. Never idles on screen.
  if (polySub) polySub.style.display = 'none';
  if (tool === 'polyline' && polySub) _dvStylePolyPill(polySub);
  // S461e: leaving Select hides its chrome
  if (tool !== 'select') {
    if (_dvSelBar) _dvSelBar.style.display = 'none';
    if (_dvSelFly) _dvSelFly.classList.remove('open');   // S461n: submenu uses the .open class
  }
  if (tool !== 'polyline' && PolyHost && PolyHost.isActive()) _cancelPolyline();

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
    if (tool && tool !== 'select' && tool !== 'pin' && tool !== 'trash') {
      mc.classList.add('drawing-active');
      mc.style.pointerEvents = 'auto';
    } else if (tool === 'select' || tool === 'trash') {   // S574: trash gets select-style pointer routing
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
    else if (tool && tool !== 'select' && tool !== 'trash') area.classList.add('drawing');
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
    // F4 (S487): select-submenu is a sibling too — close it on any sub-tool pick.
    var selSubT = document.getElementById('select-submenu');
    if (selSubT) selSubT.classList.remove('open');
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
      // S461g (Mark): a SINGLE tap on Select both arms the tool AND opens the
      // sub-tool flyout (Rubber-band / Tap select) — no double-tap needed.
      if (tool === 'select') {
        // S461h: _setTool never existed — the dispatcher's real function is
        // _setActiveTool. The bad name threw a ReferenceError on every Select
        // click and killed the whole handler ("nothing happens"). One tap now
        // arms select AND opens the Rubber-band / Tap-select flyout.
        // S487d (Mark): clicking Select while ALREADY armed now DISARMS it —
        // single click arms, single click again disarms, same as every other
        // sidebar tool. (_setActiveTool(null) also closes the flyout + chrome.)
        if (_tool === 'select') {
          _setActiveTool(null);
          if (btn && btn.blur) btn.blur();   // S487e: drop the pale focus tint
          e.stopPropagation();
          return;
        }
        _setActiveTool('select');
        _dvToggleSelFly();
        e.stopPropagation();
        return;
      }
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
        // F4 (S487): close the select flyout too — full sibling set.
        var selA = document.getElementById('select-submenu');
        if (selA) selA.classList.remove('open');
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
        // F4 (S487): close the select flyout too — full sibling set.
        var selB = document.getElementById('select-submenu');
        if (selB) selB.classList.remove('open');
        var isOpen = sm.classList.contains('open');
        sm.classList.toggle('open');
        if (!isOpen) _positionSubmenu(sm, shapesGroupBtn);
      }
      e.stopPropagation();
      return;
    }

    // S407 — Polyline sub-toolbar buttons (✓ finish / ↩ undo point / ✕ cancel).
    if (e.target.closest && e.target.closest('#poly-commit-btn')) {
      _commitPolyline();
      e.stopPropagation();
      return;
    }
    if (e.target.closest && e.target.closest('#poly-undo-pt-btn')) {
      _undoPolyPoint();
      e.stopPropagation();
      return;
    }
    if (e.target.closest && e.target.closest('#poly-cancel-btn')) {
      _cancelPolyline();
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
    /* ── S651 — Refresh + Reset scale (Mark, after Ian's 12 Aug report) ────
       Ian set a scale by accident on a drawing he had been dimensioning by
       hand. Setting a scale flips the drawing into measured mode: the keypad
       stops auto-opening on commit, and the numbers on existing dimensions get
       recomputed. There was no way back — a scale could be replaced but never
       removed — so it read as "I can't set my dimensions anymore" and looked
       like the tool had overwritten his work.
       Both buttons operate on the CURRENT drawing only. */
    var dimRecalcBtn = e.target.closest && e.target.closest('#dim-recalc-btn');
    if (dimRecalcBtn) {
      var _drR = _getCurrentDrawing();
      var _dimR = window._dimTool;
      if (!(_dimR && _drR && _dimR.isCalibrated(_drR))) {
        /* Visible-but-dimmed: say why rather than no-op. A tablet button that
           does nothing when tapped reads as a broken app.
           S663: reworded — since Remove Scale now KEEPS measured values,
           "dimensions are typed in" is no longer necessarily true here. */
        try { toast('No scale on this drawing — dimensions unchanged'); } catch (_) {}
        e.stopPropagation();
        return;
      }
      if (_dimR && _drR && _dimR.isCalibrated(_drR)) {
        /* mode 'measured' — the ONLY mode used here. It recomputes dimensions
           the user never typed over and leaves hand-set values alone. Never
           pass 'all' from this button: that clears overrides, which is exactly
           the "it redid all my dimensions" complaint this exists to answer.
           S663 — v1 ROUND-TRIP, same as every other recalibrateAll caller
           (S461g). This button passed the raw stroke objects, whose
           coordinates live in pts[] — recalibrateAll reads mx1/x1, got
           undefined, and wrote NaN'-0" over every measured value while
           reporting "Recomputed 10". The round-trip is the root-cause fix;
           computeLabel's finite guard is the backstop. */
        var _recalV3 = _objects.map(toV1);
        var _nR = _dimR.recalibrateAll(_recalV3, _dimR.getCalibration(_drR), 'measured');
        _objects = _recalV3.map(toStroke);
        _pushHistory(); _markDirty(); _renderAll(); _updateDimFinChip();
        try { toast(_nR ? ('Recomputed ' + _nR + ' dimension' + (_nR > 1 ? 's' : '') + ' — typed values kept')
                        : 'Nothing to recompute'); } catch (_) {}
      }
      e.stopPropagation();
      return;
    }
    var dimUncalBtn = e.target.closest && e.target.closest('#dim-uncal-btn');
    if (dimUncalBtn) {
      var _drU = _getCurrentDrawing();
      var _dimU = window._dimTool;
      if (!(_dimU && _drU && _dimU.isCalibrated(_drU))) {
        try { toast('No scale set on this drawing — nothing to remove'); } catch (_) {}
        e.stopPropagation();
        return;
      }
      if (_dimU && _drU && _dimU.isCalibrated(_drU)) {
        /* S663 (Mark) — removing the scale KEEPS every dimension's value.
           A measured dimension is a captured fact: it was measured correctly
           under the scale that existed at the time. Removing the scale only
           means NEW measurements can't be taken. The old behaviour wiped
           rawValue/rawLabel/trueM on every measured-only dim ("— set —",
           "type each dimension again") — destroying real data and inviting
           hand-typed replacements for values that were measured. The flow is
           now: remove scale → values stay; recalibrate → nothing changes yet;
           ↻ Refresh → measured dims recompute under the new scale. */
        var _msg = 'Remove the scale from this drawing?\n\n' +
                   'Every dimension keeps the value it shows now. New dimensions will ask ' +
                   'you to type the value until a new scale is set.\n\n' +
                   'After recalibrating, tap \u21bb Refresh to recompute the measured ones.';
        showConfirm('Remove Scale', _msg).then(function (yes) {
          if (!yes) return;
          _pushHistory();   /* before the mutation, so Undo restores the scale */
          try { delete _drU.calibration; } catch (_) { _drU.calibration = null; }
          _markDirty(); _renderAll(); _updateDimFinChip(); _syncDimScaleButtons();
          try { toast('Scale removed — dimensions keep their values'); } catch (_) {}
        });
      }
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
      if (SelHost.selIds.length) {
        SelHost.selIds.forEach(function(id) {
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
        _fontSize = _stepFont(_fontSize, action === 'size-up' ? 1 : -1);
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
        if (SelHost.selIds.length) {
          // Modify selected objects' size/fontSize
          SelHost.selIds.forEach(function(id) {
            var obj = _findObj(id);
            if (!obj) return;
            if (obj.type === 'text') {
              obj.fontSize = _stepFont(obj.fontSize || 20, sizeDir);
            } else {
              obj.size = Math.max(1, Math.min(30, (obj.size || 2) + sizeDir));
            }
          });
          _renderAll();
          _markDirty();
        } else if (_tool === 'text') {
          _fontSize = _stepFont(_fontSize, action === 'size-up' ? 1 : -1);
        } else {
          _lineWidth = action === 'size-up' ? Math.min(30, _lineWidth + 1) : Math.max(1, _lineWidth - 1);
        }
      }
      else if (action === 'opacity-up' || action === 'opacity-down') {
        var opDir = action === 'opacity-up' ? 0.1 : -0.1;
        if (SelHost.selIds.length) {
          SelHost.selIds.forEach(function(id) {
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
        if (SelHost.hasSel()) {
          // S461: engine delete — the wrapper tombstones first (S129), then the
          // engine splices + op-logs (logOp → _pushHistory/_markDirty) + renders.
          SelHost.deleteSelected();
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
        } else if (_tool === 'select' && SelHost.selIds.length) {
          var textTargets = [];
          for (var ti = 0; ti < SelHost.selIds.length; ti++) {
            var to = _findObj(SelHost.selIds[ti]);
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

    // More menu — S581: rows BUILT by the shared header engine, not written here.
    if (e.target.closest && e.target.closest('#dv-more-btn')) {
      var mm = _dvEnsureMoreMenu();
      if (mm) mm.classList.toggle('open');
      e.stopPropagation();
      return;
    }
    var menuItem = e.target.closest && e.target.closest('[data-dv-action]');
    if (menuItem) {
      var act = menuItem.getAttribute('data-dv-action');
      var mmenu = document.getElementById('dv-more-menu');
      if (mmenu) mmenu.classList.remove('open');   // S581: engine menus open/close by class
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
      // F4 (S487): the select flyout is a .tool-submenu like the others —
      // clicks inside it are already exempt via the closest() guard above.
      var sel2 = document.getElementById('select-submenu');
      if (sel2) sel2.classList.remove('open');
    }
    if (!e.target.closest || !e.target.closest('#dv-more-btn')) {
      var mm2 = document.getElementById('dv-more-menu');
      if (mm2) mm2.classList.remove('open');   // S581: close-on-outside, engine class
    }
  });

  // Custom color picker
  document.addEventListener('input', function(e) {
    if (e.target.id === 'mk-custom-color') {
      _color = e.target.value;
      if (SelHost.selIds.length) {
        SelHost.selIds.forEach(function(id) {
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
    if (_tool === 'trash') { _handleTrashDown(e); return; }   // S574
    if (_tool === 'select') { _handleSelectDown(e); return; }
    _startDraw(e);
  });
  mc.addEventListener('mousemove', function(e) {
    _updateEraserCursor(e);
    if (_tool === 'trash') { return; }   // S574: trash has no drags
    if (_tool === 'select') { _handleSelectMove(e); return; }
    // Polyline rubber-band preview
    if (_tool === 'polyline' && PolyHost && PolyHost.count() >= 1 && !_isDrawing) {
      _drawPolylinePreview(e);
      return;
    }
    _moveDraw(e);
  });
  mc.addEventListener('mouseup', function(e) {
    if (_tool === 'trash') { return; }   // S574: pick happened on down
    if (_tool === 'select') { _handleSelectUp(); return; }
    // S461k: release-commit for polyline points + dimension chain clicks
    if (_tool === 'polyline' && !_isDrawing) { _handlePolylineClick(e); return; }
    if (_tool === 'dimension' && _dimChainPressPending && !_isDrawing) {
      _dimChainPressPending = false; _dimChainRelease(e); return;
    }
    _endDraw(e);
  });
  mc.addEventListener('mouseleave', function() {
    if (_eraserCursor) _eraserCursor.style.display = 'none';
    _dimChainPressPending = false;   // S461k: never commit a chain click off-canvas
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
    if (_tool === 'trash') { _handleTrashDown(e); return; }   // S574
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
    if (_tool === 'trash') { return; }   // S574: trash has no drags
    if (_tool === 'select') { _handleSelectMove(e); return; }
    if (_tool === 'polyline' && PolyHost && PolyHost.count() >= 1 && !_isDrawing) {
      _drawPolylinePreview(e);
      return;
    }
    _moveDraw(e);
  }, { passive: false });

  mc.addEventListener('touchend', function(e) {
    if (!_tool || _tool === 'pin') return;
    if (_tool === 'trash') { return; }   // S574: pick happened on down
    if (_tool === 'select') { _handleSelectUp(); return; }
    // S461k: release-commit (uses changedTouches — _getPos handles touchend)
    if (_tool === 'polyline' && !_isDrawing) { _handlePolylineClick(e); return; }
    if (_tool === 'dimension' && _dimChainPressPending && !_isDrawing) {
      _dimChainPressPending = false; _dimChainRelease(e); return;
    }
    _endDraw(e);
  });

  // Double-click: finishes polyline OR edits text object OR ends dim chain
  mc.addEventListener('dblclick', function(e) {
    if (_tool === 'polyline' && PolyHost && PolyHost.count() >= 2) {
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
        var hitDbl = dimDbl.hitTestDimension(posDbl, _objects.map(toV1));   // S461: v1 views
        if (hitDbl) {
          _dimVertexEditId = hitDbl.id;
          _renderAll();
          // S461: hitDbl is a v1 VIEW (a copy) — resolve the live stroke so the
          // keypad reads pts and label writes land on the real object.
          _editDimensionLabel(_findObj(hitDbl.id) || hitDbl);
        }
      }
      return;
    }
    // Double-click on text object with selector → edit it (S390: via chip engine)
    if (_tool === 'select') {
      var pos = _getPos(e);
      var hit = _hitTestObjects(pos);
      if (hit && hit.type === 'text') {
        // S399: drop selection first. Editing + transform handles must not be
        // live on the same object simultaneously — otherwise the selected copy
        // stays painted and draggable behind the edit box (redundant/doubled text).
        SelHost.deselect();   // S461
        _dvOpenTextBox(null, hit);
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
      if (_tool === 'polyline' && PolyHost && PolyHost.count() >= 2) { _finishPolyline(); e.stopPropagation(); return; }
      // If objects selected: clear selection first
      if (SelHost.hasActiveSelection()) {
        SelHost.deselect();   // S461 (renders)
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

    // S331 (C1): if focus is in a text field, Ctrl+Z/Y must do NATIVE
    // per-keystroke text undo — never hijack it into markup undo. (This was a
    // real "sometimes undo does the wrong thing" cause: typing in a comment over
    // the open viewer, Ctrl+Z would undo a pen stroke instead of your text.)
    var _ae = document.activeElement;
    var _typing = _ae && (_ae.tagName === 'TEXTAREA' || _ae.tagName === 'INPUT' || _ae.isContentEditable);

    if (!_typing && (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (_undoStack.length) { e.preventDefault(); _undo(); return; }
      // Fall through to project-level undo
    }
    if (!_typing && (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      if (_redoStack.length) { e.preventDefault(); _redo(); return; }
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && SelHost.hasSel() && _tool === 'select') {
      SelHost.deleteSelected();   // S461: wrapper tombstones (S129) then engine deletes
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
    // S557: an unconfirmed adjust-stage dimension is discarded on close, the
    // same as ✗ — it never entered history and the inspector never placed it.
    // Resolving BEFORE the dirty-save below so it cannot ride into IDB/R2.
    if (_dimAdjustObj) _dimAdjustFinish(false);
    if (_dirty && _drawingId) _saveMarkup();

    _drawingId = null;
    _objects = [];
    _tombstones = [];  // S129 1.1
    _undoStack = [];
    _redoStack = [];
    SelHost.deselect();   // S461
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
    // S491 — raise the intentional-teardown flag BEFORE destroying the
    // renderer: Pixi's destroy releases the GL context and the resulting
    // webglcontextlost event may dispatch after the canvas is detached.
    // Lower it after the canvas reference is dropped.
    _webglTearingDown = true;
    if (window.WebGLMarkupRenderer && _webglReady){
      try { window.WebGLMarkupRenderer.destroy(); } catch(_){}
    }
    if (_webglCanvas && _webglCanvas.parentNode){
      _webglCanvas.parentNode.removeChild(_webglCanvas);
    }
    _webglCanvas = null;
    _webglReady = false;
    _webglInitPromise = null;
    _webglTearingDown = false;

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
    // S390: keep an open text-entry box glued to its logical anchor as the
    // drawing pans/zooms under it (photo lightbox never needed this — a photo
    // can't move under an open box). Runs BEFORE the gesture/empty early-returns
    // so the box tracks during a live pinch and even before the first object.
    if (_dvTextBox) _dvRepositionTextBox();
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




