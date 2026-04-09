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
import { Markup } from './markup.js';
import { showConfirm } from '../shared/dialogs.js';

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
}

function _clampPan() {
  var img = document.getElementById('dv-image');
  var area = document.getElementById('dv-canvas-area');
  if (!img || !area || !img.naturalWidth) return;

  var aw = area.clientWidth;
  var ah = area.clientHeight;
  var sw = img.naturalWidth * _scale;
  var sh = img.naturalHeight * _scale;

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
  _clampPan(); // Centers the image
  var wrap = document.getElementById('dv-img-wrap');
  if (wrap) {
    wrap.style.transform = 'translate3d(' + _panX + 'px,' + _panY + 'px,0) scale(' + _scale + ')';
  }
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
    _calcFitScale();
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

  var src = d.thumb || d.r2Url || d.dataUrl || '';

  function _loadImg(url, label) {
    // Binary hide — visibility:hidden prevents any paint of old image
    img.style.visibility = 'hidden';
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
    img.src = url;
    img.style.display = 'block';
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
    Markup.destroy();
    var overlay = document.getElementById('drawing-viewer-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('dv-open');
    _currentDrawingIdx = -1;
  },

  next: function() {
    if (_currentDrawingIdx < _drawings.length - 1) {
      Markup.destroy();
      _showDrawing(_currentDrawingIdx + 1);
    }
  },

  prev: function() {
    if (_currentDrawingIdx > 0) {
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

  // Click title to rename drawing
  if (e.target.id === 'dv-title' || (e.target.closest && e.target.closest('#dv-title'))) {
    var titleEl = document.getElementById('dv-title');
    if (!titleEl || titleEl.querySelector('input')) return; // already editing
    var drawings = _getDrawingsList();
    if (_currentDrawingIdx < 0 || _currentDrawingIdx >= drawings.length) return;
    var d = drawings[_currentDrawingIdx];
    var oldName = d.name || '';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = oldName;
    inp.style.cssText = 'background:rgba(255,255,255,.15);border:1.5px solid #2196F3;border-radius:4px;color:white;font-family:Calibri,sans-serif;font-size:inherit;padding:2px 8px;width:280px;max-width:60vw;outline:none;';
    titleEl.textContent = '';
    titleEl.appendChild(inp);
    inp.focus();
    inp.select();
    var committed = false;
    function _commitRename() {
      if (committed) return;
      committed = true;
      var newName = inp.value.trim();
      if (newName && newName !== oldName) {
        d.name = newName;
        Model.saveNow();
      }
      titleEl.textContent = d.name || 'Drawing ' + (_currentDrawingIdx + 1);
    }
    inp.addEventListener('blur', function() { setTimeout(_commitRename, 100); });
    inp.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); _commitRename(); }
      if (ev.key === 'Escape') { committed = true; titleEl.textContent = oldName || 'Drawing ' + (_currentDrawingIdx + 1); }
      ev.stopPropagation();
    });
  }
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

// ── Pin Rendering ───────────────────────────────────────
var _pinModeDeficId = null;

function _renderPins() {
  // Don't rebuild during active drag (would destroy marker reference)
  if (_pinDragging || _pinMouseDragging) return;
  var layer = document.getElementById('dv-pins-layer');
  if (!layer) return;
  var drawings = _getDrawingsList();
  if (_currentDrawingIdx < 0 || _currentDrawingIdx >= drawings.length) { layer.innerHTML = ''; return; }
  var drawingId = drawings[_currentDrawingIdx].id;
  var img = document.getElementById('dv-image');
  if (!img || !img.naturalWidth) { layer.innerHTML = ''; return; }
  var iw = img.naturalWidth;
  var ih = img.naturalHeight;
  var allDefics = Model.getAllDeficiencies();
  var pins = allDefics.filter(function(d) { return d.defic.drawingId === drawingId && d.defic.pinX != null; });
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
  layer.innerHTML = html;
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

  if (_pinModeDeficId) { _handlePinDrop(e); return; }
  if (Markup.getTool() === 'pin') { _pinToolDrop(e.clientX, e.clientY); return; }
});

// Pin drop touch handler
document.getElementById('dv-canvas-area').addEventListener('touchend', function(e) {
  if (e.target.closest('.dv-toolbar') || e.target.closest('#dv-close') || e.target.closest('.dv-sidebar-tools') || e.target.closest('.zoom-controls') || e.target.closest('.dv-nav-controls')) return;
  var touch = e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : null;
  if (!touch) return;

  if (_pinModeDeficId) { _handlePinDrop({ clientX: touch.clientX, clientY: touch.clientY }); return; }
  if (Markup.getTool() === 'pin') { _pinToolDrop(touch.clientX, touch.clientY); return; }
});

// Pin marker click — open pin editor (only in pan mode, no tool active)
var _pinDragEndTime = 0;
document.addEventListener('click', function(e) {
  var marker = e.target.closest && e.target.closest('.pin-marker[data-defic-id]');
  if (!marker) return;
  if (_pinModeDeficId) return;
  if (_pinDragging) return;
  // Suppress click immediately after drag end
  if (Date.now() - _pinDragEndTime < 300) return;
  // Block pin editor when any markup/selector tool is active
  if (Markup.getTool()) return;
  var deficId = marker.getAttribute('data-defic-id');
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
  var marker = e.target.closest && e.target.closest('.pin-marker[data-defic-id]');
  if (!marker || _pinModeDeficId) return;
  var deficId = marker.getAttribute('data-defic-id');
  var touch = e.touches[0];
  if (touch) {
    _pinTouchStartX = touch.clientX;
    _pinTouchStartY = touch.clientY;
    // Pre-calculate offset
    var wrap = document.getElementById('dv-img-wrap');
    if (wrap) {
      var wRect = wrap.getBoundingClientRect();
      var cx = (touch.clientX - wRect.left) / _scale;
      var cy = (touch.clientY - wRect.top) / _scale;
      _pinTouchOffsetX = parseFloat(marker.style.left || 0) - cx;
      _pinTouchOffsetY = parseFloat(marker.style.top || 0) - cy;
    }
  }
  _pinLongPressTimer = setTimeout(function() {
    _pinDragging = true;
    _pinDragDeficId = deficId;
    _pinDragMarker = marker;
    marker.classList.add('dragging');
    var area = document.getElementById('dv-canvas-area');
    if (area) area.classList.add('pin-drag-mode');
    console.log('[Viewer] Pin drag started:', deficId);
  }, 400);
}, { passive: true });

document.addEventListener('touchmove', function(e) {
  if (_pinLongPressTimer && !_pinDragging) {
    clearTimeout(_pinLongPressTimer);
    _pinLongPressTimer = null;
  }
  if (!_pinDragging || !_pinDragMarker) return;
  e.preventDefault();
  var touch = e.touches[0];
  if (!touch) return;
  var wrap = document.getElementById('dv-img-wrap');
  if (!wrap) return;
  var wRect = wrap.getBoundingClientRect();
  var px = (touch.clientX - wRect.left) / _scale + _pinTouchOffsetX;
  var py = (touch.clientY - wRect.top) / _scale + _pinTouchOffsetY;
  _pinDragMarker.style.left = px + 'px';
  _pinDragMarker.style.top = py + 'px';
}, { passive: false });

document.addEventListener('touchend', function(e) {
  if (_pinLongPressTimer) { clearTimeout(_pinLongPressTimer); _pinLongPressTimer = null; }
  if (!_pinDragging || !_pinDragDeficId) return;

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
  _renderPins();
});

// ── Pin Drag-to-Move (PC mouse — long click or selector mode) ──
var _pinMouseLongPress = null;
var _pinMouseDragging = false;
var _pinMouseDragDeficId = null;
var _pinMouseDragMarker = null;
var _pinMouseStartX = 0;
var _pinMouseStartY = 0;
var _pinMouseOffsetX = 0; // Offset from cursor to marker left (prevents jump)
var _pinMouseOffsetY = 0;

document.addEventListener('mousedown', function(e) {
  if (e.button !== 0) return;
  var marker = e.target.closest && e.target.closest('.pin-marker[data-defic-id]');
  if (!marker || _pinModeDeficId) return;
  var overlay = document.getElementById('drawing-viewer-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  var deficId = marker.getAttribute('data-defic-id');
  _pinMouseStartX = e.clientX;
  _pinMouseStartY = e.clientY;

  // Pre-calculate offset between cursor and marker's current position
  var wrap = document.getElementById('dv-img-wrap');
  if (wrap) {
    var wRect = wrap.getBoundingClientRect();
    var cursorInWrap_X = (e.clientX - wRect.left) / _scale;
    var cursorInWrap_Y = (e.clientY - wRect.top) / _scale;
    _pinMouseOffsetX = parseFloat(marker.style.left || 0) - cursorInWrap_X;
    _pinMouseOffsetY = parseFloat(marker.style.top || 0) - cursorInWrap_Y;
  }

  // Selector tool: start drag after small movement threshold (not instant)
  if (Markup.getTool() === 'select') {
    _pinMouseDragDeficId = deficId;
    _pinMouseDragMarker = marker;
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Non-selector: long-press (400ms hold)
  _pinMouseLongPress = setTimeout(function() {
    _pinMouseDragging = true;
    _pinMouseDragDeficId = deficId;
    _pinMouseDragMarker = marker;
    marker.classList.add('dragging');
    var area = document.getElementById('dv-canvas-area');
    if (area) area.classList.add('pin-drag-mode');
  }, 400);
}, true); // Use capture phase

document.addEventListener('mousemove', function(e) {
  if (_pinMouseLongPress && !_pinMouseDragging) {
    if (Math.abs(e.clientX - _pinMouseStartX) > 5 || Math.abs(e.clientY - _pinMouseStartY) > 5) {
      clearTimeout(_pinMouseLongPress);
      _pinMouseLongPress = null;
    }
  }
  // For selector mode: activate dragging after 4px threshold
  if (!_pinMouseDragging && _pinMouseDragDeficId && _pinMouseDragMarker) {
    if (Math.abs(e.clientX - _pinMouseStartX) > 4 || Math.abs(e.clientY - _pinMouseStartY) > 4) {
      _pinMouseDragging = true;
      _pinMouseDragMarker.classList.add('dragging');
      var area = document.getElementById('dv-canvas-area');
      if (area) area.classList.add('pin-drag-mode');
    }
  }
  if (!_pinMouseDragging || !_pinMouseDragMarker) return;
  e.preventDefault();
  var wrap = document.getElementById('dv-img-wrap');
  if (!wrap) return;
  var wRect = wrap.getBoundingClientRect();
  // Apply stored offset so pin doesn't jump on first move
  var px = (e.clientX - wRect.left) / _scale + _pinMouseOffsetX;
  var py = (e.clientY - wRect.top) / _scale + _pinMouseOffsetY;
  _pinMouseDragMarker.style.left = px + 'px';
  _pinMouseDragMarker.style.top = py + 'px';
});

document.addEventListener('mouseup', function(e) {
  if (_pinMouseLongPress) { clearTimeout(_pinMouseLongPress); _pinMouseLongPress = null; }

  // If selector mode started but drag never activated (no movement), just select pin visually
  if (_pinMouseDragDeficId && !_pinMouseDragging) {
    _pinMouseDragDeficId = null;
    _pinMouseDragMarker = null;
    return;
  }

  if (!_pinMouseDragging || !_pinMouseDragDeficId) return;

  var area = document.getElementById('dv-canvas-area');
  if (area) area.classList.remove('pin-drag-mode');
  if (_pinMouseDragMarker) _pinMouseDragMarker.classList.remove('dragging');

  // Calculate final position (include offset for accurate placement)
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
