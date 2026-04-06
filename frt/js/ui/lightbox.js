/**
 * ARENCON FRT v2 — Photo Lightbox
 * ════════════════════════════════
 * 
 * Full-screen photo viewer with:
 *   - Pan/zoom (mouse wheel + pinch-to-zoom)
 *   - Swipe left/right for prev/next (touch)
 *   - Arrow buttons + keyboard arrows
 *   - Double-tap to toggle zoom
 *   - Photo info bar (caption, filename)
 *   - Close button + Escape key
 */

var _photos = [];
var _idx = 0;
var _scale = 1;
var _fitScale = 1;
var _panX = 0;
var _panY = 0;
var _dragging = false;
var _lastX = 0;
var _lastY = 0;
var _isOpen = false;

// Touch state
var _touchStartDist = 0;
var _touchStartScale = 1;
var _touchStartMidX = 0;
var _touchStartMidY = 0;
var _touchStartPanX = 0;
var _touchStartPanY = 0;
var _singleTouchX = 0;
var _singleTouchY = 0;
var _lastTapTime = 0;
var _swipeStartX = 0;
var _swipeStartY = 0;
var _swiping = false;

function _el(id) { return document.getElementById(id); }

function _clampPan() {
  var img = _el('lb-image');
  var area = _el('lb-canvas');
  if (!img || !area || !img.naturalWidth) return;
  var aw = area.clientWidth;
  var ah = area.clientHeight;
  var sw = img.naturalWidth * _scale;
  var sh = img.naturalHeight * _scale;
  if (sw <= aw) { _panX = (aw - sw) / 2; }
  else { _panX = Math.min(0, Math.max(aw - sw, _panX)); }
  if (sh <= ah) { _panY = (ah - sh) / 2; }
  else { _panY = Math.min(0, Math.max(ah - sh, _panY)); }
}

function _applyTransform() {
  _clampPan();
  var wrap = _el('lb-img-wrap');
  if (wrap) wrap.style.transform = 'translate3d(' + _panX + 'px,' + _panY + 'px,0) scale(' + _scale + ')';
}

function _calcFitScale() {
  var img = _el('lb-image');
  var area = _el('lb-canvas');
  if (!img || !area || !img.naturalWidth) { _fitScale = 1; return; }
  _fitScale = Math.min(area.clientWidth / img.naturalWidth, area.clientHeight / img.naturalHeight);
  if (_fitScale > 1) _fitScale = 1;
}

function _resetView() {
  _scale = _fitScale;
  _panX = 0; _panY = 0;
  _clampPan();
  _applyTransform();
}

function _showPhoto(idx) {
  if (idx < 0 || idx >= _photos.length) return;
  _idx = idx;
  var p = _photos[idx];
  var img = _el('lb-image');
  var info = _el('lb-info');
  var counter = _el('lb-counter');
  if (!img) return;

  var src = p.r2Url || p.dataUrl || p.thumb || '';
  img.onload = function() {
    _calcFitScale();
    _scale = _fitScale;
    _panX = 0; _panY = 0;
    _applyTransform();
  };
  img.src = src;

  // Info bar
  var caption = p.caption || p.filename || '';
  if (info) info.textContent = caption;
  if (counter) counter.textContent = (_photos.length > 1) ? (idx + 1) + ' / ' + _photos.length : '';

  // Prev/next button visibility
  var prev = _el('lb-prev');
  var next = _el('lb-next');
  if (prev) prev.style.display = _photos.length > 1 ? '' : 'none';
  if (next) next.style.display = _photos.length > 1 ? '' : 'none';
}

function _open(photos, startIdx) {
  if (!photos || !photos.length) return;
  _photos = photos;
  _idx = startIdx || 0;
  _isOpen = true;

  var overlay = _el('lightbox-overlay');
  if (overlay) {
    overlay.classList.add('open');
    document.body.classList.add('lb-open');
  }
  _showPhoto(_idx);
}

function _close() {
  _isOpen = false;
  _photos = [];
  var overlay = _el('lightbox-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    document.body.classList.remove('lb-open');
  }
  var img = _el('lb-image');
  if (img) img.src = '';
}

function _next() { if (_idx < _photos.length - 1) _showPhoto(_idx + 1); }
function _prev() { if (_idx > 0) _showPhoto(_idx - 1); }

// ── Event Wiring ─────────────────────────────────────────

// Close button
document.addEventListener('click', function(e) {
  if (!_isOpen) return;
  if (e.target.id === 'lb-close' || (e.target.closest && e.target.closest('#lb-close'))) { _close(); return; }
  if (e.target.id === 'lb-prev' || (e.target.closest && e.target.closest('#lb-prev'))) { _prev(); return; }
  if (e.target.id === 'lb-next' || (e.target.closest && e.target.closest('#lb-next'))) { _next(); return; }
  // Click on dark backdrop closes
  if (e.target.id === 'lb-canvas' && _scale <= _fitScale * 1.05) { _close(); }
});

// Keyboard
document.addEventListener('keydown', function(e) {
  if (!_isOpen) return;
  if (e.key === 'Escape') { _close(); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { _prev(); e.preventDefault(); }
  if (e.key === 'ArrowRight') { _next(); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') { _scale = Math.min(8, _scale * 1.2); _applyTransform(); }
  if (e.key === '-') { _scale = Math.max(_fitScale, _scale / 1.2); if (_scale <= _fitScale) { _panX = 0; _panY = 0; } _applyTransform(); }
  if (e.key === '0') { _resetView(); }
});

// Mouse wheel zoom
document.addEventListener('wheel', function(e) {
  if (!_isOpen) return;
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;
  e.preventDefault();
  var rect = area.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;
  var imgX = (mx - _panX) / _scale;
  var imgY = (my - _panY) / _scale;
  var delta = e.deltaY > 0 ? 0.9 : 1.1;
  var newScale = Math.max(_fitScale, Math.min(8, _scale * delta));
  if (newScale <= _fitScale) { _panX = 0; _panY = 0; _scale = _fitScale; _applyTransform(); return; }
  _panX = mx - imgX * newScale;
  _panY = my - imgY * newScale;
  _scale = newScale;
  _applyTransform();
}, { passive: false });

// Mouse drag pan
document.addEventListener('mousedown', function(e) {
  if (!_isOpen) return;
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;
  if (e.target.closest && (e.target.closest('#lb-prev') || e.target.closest('#lb-next') || e.target.closest('#lb-close'))) return;
  _dragging = true;
  _lastX = e.clientX;
  _lastY = e.clientY;
  e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
  if (!_isOpen || !_dragging) return;
  if (_scale <= _fitScale) return;
  _panX += e.clientX - _lastX;
  _panY += e.clientY - _lastY;
  _lastX = e.clientX;
  _lastY = e.clientY;
  _applyTransform();
});

document.addEventListener('mouseup', function() {
  if (_isOpen) _dragging = false;
});

// Touch: pinch-to-zoom + swipe + double-tap
document.addEventListener('touchstart', function(e) {
  if (!_isOpen) return;
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;
  if (e.target.closest && (e.target.closest('#lb-prev') || e.target.closest('#lb-next') || e.target.closest('#lb-close'))) return;

  if (e.touches.length === 2) {
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
    _swiping = false;
  } else if (e.touches.length === 1) {
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swiping = (_scale <= _fitScale * 1.05);

    // Double-tap detection
    var now = Date.now();
    if (now - _lastTapTime < 350) {
      e.preventDefault();
      if (_scale > _fitScale * 1.5) { _resetView(); }
      else {
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
      _swiping = false;
    } else {
      _lastTapTime = now;
    }
  }
}, { passive: false });

document.addEventListener('touchmove', function(e) {
  if (!_isOpen) return;
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;

  if (e.touches.length === 2) {
    e.preventDefault();
    _swiping = false;
    var dx = e.touches[1].clientX - e.touches[0].clientX;
    var dy = e.touches[1].clientY - e.touches[0].clientY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (_touchStartDist === 0) return;
    var ratio = dist / _touchStartDist;
    var newScale = Math.max(_fitScale, Math.min(8, _touchStartScale * ratio));
    var imgX = (_touchStartMidX - _touchStartPanX) / _touchStartScale;
    var imgY = (_touchStartMidY - _touchStartPanY) / _touchStartScale;
    _scale = newScale;
    _panX = _touchStartMidX - imgX * newScale;
    _panY = _touchStartMidY - imgY * newScale;
    _applyTransform();
  } else if (e.touches.length === 1) {
    if (_swiping) {
      // Allow horizontal swipe for prev/next (don't prevent default for natural scrolling feel)
      var diffX = e.touches[0].clientX - _swipeStartX;
      var diffY = e.touches[0].clientY - _swipeStartY;
      // If moving more vertically, stop treating as swipe
      if (Math.abs(diffY) > Math.abs(diffX) * 1.5 && Math.abs(diffX) < 30) { _swiping = false; }
    } else if (_scale > _fitScale) {
      e.preventDefault();
      _panX += e.touches[0].clientX - _singleTouchX;
      _panY += e.touches[0].clientY - _singleTouchY;
      _applyTransform();
    }
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;
  }
}, { passive: false });

document.addEventListener('touchend', function(e) {
  if (!_isOpen) return;
  if (e.touches.length < 2) _touchStartDist = 0;
  if (e.touches.length === 1) {
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;
  }
  // Swipe detection on final release
  if (_swiping && e.touches.length === 0 && e.changedTouches && e.changedTouches.length) {
    var endX = e.changedTouches[0].clientX;
    var diffX = endX - _swipeStartX;
    if (Math.abs(diffX) > 60) {
      if (diffX > 0) _prev(); else _next();
    }
    _swiping = false;
  }
});

// ── Public API ───────────────────────────────────────────
export var Lightbox = {
  open: _open,
  close: _close,
  isOpen: function() { return _isOpen; }
};

// Global access for cross-module use
window._frtLightbox = Lightbox;
