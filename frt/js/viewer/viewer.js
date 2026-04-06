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
    img.onload = function() {
      console.log('[Viewer] Image loaded (' + (label || 'unknown') + '): ' + img.naturalWidth + '×' + img.naturalHeight);
      _calcFitScale();
      _scale = _fitScale;
      _panX = 0;
      _panY = 0;
      _applyTransform();
      _renderPins();
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
    var overlay = document.getElementById('drawing-viewer-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('dv-open');
    _currentDrawingIdx = -1;
  },

  next: function() {
    if (_currentDrawingIdx < _drawings.length - 1) _showDrawing(_currentDrawingIdx + 1);
  },

  prev: function() {
    if (_currentDrawingIdx > 0) _showDrawing(_currentDrawingIdx - 1);
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
});

// Pan: mouse drag
var canvasArea = null;
document.addEventListener('mousedown', function(e) {
  canvasArea = document.getElementById('dv-canvas-area');
  if (!canvasArea || !canvasArea.contains(e.target)) return;
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
    // Single finger pan (only when zoomed in)
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
  // Pin size scales with drawing resolution
  var baseW = 3000;
  var pinScale = Math.max(0.8, Math.min(2.0, Math.max(iw, ih) / baseW));
  var pw = Math.round(36 * pinScale);
  var ph2 = Math.round(48 * pinScale);
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
  _renderPins();
}

// Pin drop click handler (only active in pin-mode)
document.getElementById('dv-canvas-area').addEventListener('click', function(e) {
  if (!_pinModeDeficId) return;
  if (e.target.closest('.dv-toolbar') || e.target.closest('#dv-close')) return;
  _handlePinDrop(e);
});

// Pin drop touch handler
document.getElementById('dv-canvas-area').addEventListener('touchend', function(e) {
  if (!_pinModeDeficId) return;
  if (e.target.closest('.dv-toolbar') || e.target.closest('#dv-close')) return;
  if (e.changedTouches && e.changedTouches.length) {
    _handlePinDrop({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
  }
});

// Pin marker click — select pin
document.addEventListener('click', function(e) {
  var marker = e.target.closest && e.target.closest('.pin-marker[data-defic-id]');
  if (!marker) return;
  var deficId = marker.getAttribute('data-defic-id');
  // Toggle selection
  document.querySelectorAll('.pin-marker.selected').forEach(function(m) { m.classList.remove('selected'); });
  marker.classList.add('selected');
  console.log('[Viewer] Pin selected:', deficId);
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
