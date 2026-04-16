// frt/js/viewer/tiledPdf.js
// S87 rewrite for server-rendered tile pyramids from R2.
//
// API (unchanged from original):
//   TiledPdf.init(config)
//   TiledPdf.open(drawingId, pageNum)   -> Promise<void>
//   TiledPdf.close()                     -> void
//   TiledPdf.scheduleRender()            -> void  (call after pan/zoom)
//   TiledPdf.pause() / .resume()         -> void  (markup.js pen handlers)
//   TiledPdf.isActive()                  -> bool
//   TiledPdf.getDimensions()             -> {drawW, drawH, pageW, pageH, baseScale} | null

var _cfg = null;
var _active = false;
var _paused = false;
var _renderTimer = null;

var _drawingId = null;
var _manifest = null;
var _pageInfo = null;
var _drawW = 0;
var _drawH = 0;
var _nativeW = 0;
var _nativeH = 0;
var _baseScale = 1;

var _tiles = {};
var _loading = {};
var _tileOrder = [];
var _tileCount = 0;
var _MAX_TILES = 60;
var _TILE_SIZE = 512;

function _dbg(msg) { if (window._FRT_DEBUG) console.log('[TiledPdf] ' + msg); }

function init(config) { _cfg = config || {}; }
function isActive() { return _active; }
function pause() { _paused = true; }
function resume() { _paused = false; scheduleRender(); }

function getDimensions() {
  if (!_active) return null;
  return { drawW: _drawW, drawH: _drawH, pageW: _nativeW, pageH: _nativeH, baseScale: _baseScale };
}

function _tileUrl(level, col, row) {
  var d = _cfg.getDrawing ? _cfg.getDrawing(_drawingId) : null;
  if (!d || !d.tileServer || !_manifest) return '';
  return d.tileServer + '/' + _manifest.pid + '/tiles/' +
    _manifest.drawingId + '/page-' + _pageInfo.pageNumber +
    '/level-' + level + '/' + col + '-' + row + '.jpg';
}

// Level selection: JPEG backdrop is 6144px (matches drawW). Tiles only add
// value when zoomed past 1x where JPEG gets upscaled. At >1x, jump straight
// to L4 (12288px) for maximum crispness. Skip L3 entirely — it's the same
// resolution as JPEG. Returns -1 when JPEG alone is sufficient.
// Always load tiles at every zoom level. JPEG backdrop has client-side
// pdf.js rendering gaps (missing text, clipped notes) that the server-
// rendered tiles don't. L3 (6144px) at normal zoom fixes these gaps
// without visual change (same resolution, JPEG shows through until tile
// loads). L4 (12288px) kicks in at zoom > 1x for extra crispness.
function _pickLevel(viewScale) {
  if (!_pageInfo || !_pageInfo.levels || !_pageInfo.levels.length) return -1;
  var levels = _pageInfo.levels;
  var minLevel = Math.min(3, levels.length - 1);
  var targetW = _drawW * viewScale;
  for (var i = minLevel; i < levels.length; i++) {
    if (levels[i].width >= targetW) return i;
  }
  return levels.length - 1;
}

function _evictLRU(layer) {
  while (_tileCount > _MAX_TILES && _tileOrder.length) {
    var oldest = _tileOrder.shift();
    var tile = _tiles[oldest];
    if (tile && tile.img) {
      if (layer && tile.img.parentNode === layer) layer.removeChild(tile.img);
      tile.img.src = '';
    }
    delete _tiles[oldest];
    delete _loading[oldest];
    _tileCount--;
  }
}

function _fetchTile(levelIdx, col, row, lvl, layer) {
  var key = levelIdx + '_' + col + '_' + row;
  if (_tiles[key] || _loading[key]) return;
  _loading[key] = true;

  var url = _tileUrl(levelIdx, col, row);
  if (!url) { delete _loading[key]; return; }

  // Map tile from level-pixel space to draw-pixel space.
  // Each tile covers TILE_SIZE × TILE_SIZE level-pixels (edges may be smaller).
  // Scale uniformly by drawW/levelW and drawH/levelH.
  var scaleX = _drawW / lvl.width;
  var scaleY = _drawH / lvl.height;
  var tileX = col * _TILE_SIZE;
  var tileY = row * _TILE_SIZE;
  var tileW = Math.min(_TILE_SIZE, lvl.width - tileX);
  var tileH = Math.min(_TILE_SIZE, lvl.height - tileY);
  if (tileW <= 0 || tileH <= 0) { delete _loading[key]; return; }

  var cssL = Math.round(tileX * scaleX);
  var cssT = Math.round(tileY * scaleY);
  // Compute right/bottom edge from next tile boundary to avoid rounding gaps
  var cssR = Math.round((tileX + tileW) * scaleX) + 1;  // +1 overlap
  var cssB = Math.round((tileY + tileH) * scaleY) + 1;
  var cssW = cssR - cssL;
  var cssH = cssB - cssT;

  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.style.cssText =
    'position:absolute;left:' + cssL + 'px;top:' + cssT + 'px;' +
    'width:' + cssW + 'px;height:' + cssH + 'px;image-rendering:auto;' +
    'pointer-events:none;';

  var drawingIdAtRequest = _drawingId;
  img.onload = function() {
    delete _loading[key];
    if (!_active || _drawingId !== drawingIdAtRequest) { img.src = ''; return; }
    _tiles[key] = { img: img, level: levelIdx, col: col, row: row };
    _tileOrder.push(key);
    _tileCount++;
    if (layer && layer.parentNode) layer.appendChild(img);
    _evictLRU(layer);
  };
  img.onerror = function() {
    delete _loading[key];
    _dbg('Tile load failed: ' + key);
  };
  img.src = url;
}

function _renderVisible() {
  if (!_active || _paused || !_pageInfo) return;

  var area = document.getElementById('dv-canvas-area');
  var layer = document.getElementById('dv-tiles-layer');
  if (!area || !layer) return;

  var view = _cfg.getViewState ? _cfg.getViewState() : { scale: 1, panX: 0, panY: 0 };
  var scale = view.scale || 1;
  var panX = view.panX || 0;
  var panY = view.panY || 0;
  var areaW = area.clientWidth;
  var areaH = area.clientHeight;

  var levelIdx = _pickLevel(scale);
  if (levelIdx < 0) return;  // JPEG backdrop is sufficient at this zoom
  var lvl = _pageInfo.levels[levelIdx];
  if (!lvl) return;

  // Visible draw-space region
  var visX0 = Math.max(0, -panX / scale);
  var visY0 = Math.max(0, -panY / scale);
  var visX1 = Math.min(_drawW, (areaW - panX) / scale);
  var visY1 = Math.min(_drawH, (areaH - panY) / scale);

  // Convert visible draw region to level-pixel coordinates
  var d2lX = lvl.width / _drawW;
  var d2lY = lvl.height / _drawH;
  var lvlX0 = visX0 * d2lX;
  var lvlY0 = visY0 * d2lY;
  var lvlX1 = visX1 * d2lX;
  var lvlY1 = visY1 * d2lY;

  // Tile grid range (1-tile margin for smooth panning)
  var colMin = Math.max(0, Math.floor(lvlX0 / _TILE_SIZE) - 1);
  var colMax = Math.min(lvl.cols - 1, Math.ceil(lvlX1 / _TILE_SIZE));
  var rowMin = Math.max(0, Math.floor(lvlY0 / _TILE_SIZE) - 1);
  var rowMax = Math.min(lvl.rows - 1, Math.ceil(lvlY1 / _TILE_SIZE));

  for (var col = colMin; col <= colMax; col++) {
    for (var row = rowMin; row <= rowMax; row++) {
      var key = levelIdx + '_' + col + '_' + row;
      if (_tiles[key]) {
        var idx = _tileOrder.indexOf(key);
        if (idx >= 0) _tileOrder.splice(idx, 1);
        _tileOrder.push(key);
        continue;
      }
      _fetchTile(levelIdx, col, row, lvl, layer);
    }
  }
}

function scheduleRender() {
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(_renderVisible, 60);
}

function _openServerTiles(d, drawingId, pageNum) {
  _drawingId = drawingId;
  _active = false;

  if (_cfg.showLoading) _cfg.showLoading('Loading drawing tiles\u2026');

  return fetch(d.tileManifestUrl + '?t=' + Date.now())
    .then(function(resp) {
      if (!resp.ok) throw new Error('Manifest HTTP ' + resp.status);
      return resp.json();
    })
    .then(function(manifest) {
      if (_drawingId !== drawingId) return;

      _manifest = manifest;

      var pn = pageNum || d.pdfPage || 1;
      _pageInfo = null;
      for (var i = 0; i < manifest.pages.length; i++) {
        if (manifest.pages[i].pageNumber === pn) { _pageInfo = manifest.pages[i]; break; }
      }
      if (!_pageInfo && manifest.pages.length) _pageInfo = manifest.pages[0];
      if (!_pageInfo) throw new Error('Page ' + pn + ' not found in manifest');

      _nativeW = _pageInfo.nativeWidth;
      _nativeH = _pageInfo.nativeHeight;
      _drawW = d.width || _nativeW;
      _drawH = d.height || _nativeH;
      _baseScale = _drawW / _nativeW;

      // S87 fix #4: Keep dv-image as instant backdrop while tiles load.
      // The old JPEG (from upload-time render) covers the full drawing at
      // 6144px. Tiles load ON TOP with higher z-index. No white gaps ever.
      var img = document.getElementById('dv-image');
      if (img) {
        var jpegSrc = d.r2Url || d.dataUrl || d.thumb || '';
        if (jpegSrc) {
          img.crossOrigin = 'anonymous';
          img.style.display = 'block';
          if (img.src !== jpegSrc) img.src = jpegSrc;
        }
      }

      var wrap = document.getElementById('dv-img-wrap');
      var oldLayer = document.getElementById('dv-tiles-layer');
      if (oldLayer && oldLayer.parentNode) oldLayer.parentNode.removeChild(oldLayer);

      var layer = document.createElement('div');
      layer.id = 'dv-tiles-layer';
      // Transparent background — JPEG shows through gaps while tiles load.
      // No z-index — DOM order handles layering: dv-image < tiles < markup-canvas.
      layer.style.cssText =
        'position:absolute;top:0;left:0;width:' + _drawW + 'px;height:' + _drawH +
        'px;overflow:hidden;';
      // Insert between dv-image and markup-canvas (DOM order = paint order for positioned elements)
      var mc = document.getElementById('markup-canvas');
      if (wrap && mc) wrap.insertBefore(layer, mc);
      else if (wrap) wrap.appendChild(layer);

      _active = true;
      if (_cfg.hideLoading) _cfg.hideLoading();
      if (_cfg.onReady) _cfg.onReady({ drawW: _drawW, drawH: _drawH });

      // L0 is already the background-image. Jump straight to target level.
      _renderVisible();

      // Mobile second-pass
      if (window.innerWidth <= 700) {
        setTimeout(function() {
          if (_cfg.onReady) _cfg.onReady({ drawW: _drawW, drawH: _drawH });
          _renderVisible();
        }, 200);
      }

      console.log('[TiledPdf] Server tiles opened: ' + _manifest.drawingId +
        ' page ' + _pageInfo.pageNumber + ', ' + _pageInfo.levels.length + ' levels');
    })
    .catch(function(err) {
      console.error('[TiledPdf] Server tile open failed:', err);
      if (_cfg.hideLoading) _cfg.hideLoading();
      if (_cfg.onFallbackImage) {
        d.pdfTiled = false;
        _cfg.onFallbackImage(d, drawingId);
      } else if (_cfg.toast) {
        _cfg.toast('Could not load tiles: ' + err.message);
      }
    });
}

function _openLegacyFallback(d, drawingId) {
  _dbg('No server tiles for ' + drawingId + ' \u2014 falling back to image viewer');
  if (_cfg.hideLoading) _cfg.hideLoading();
  if (d && _cfg.onFallbackImage) {
    d.pdfTiled = false;
    _cfg.onFallbackImage(d, drawingId);
  } else if (_cfg.toast) {
    _cfg.toast('Drawing tiles not available');
  }
}

async function open(drawingId, pageNum) {
  if (!_cfg) throw new Error('TiledPdf.init() must be called first');
  _close_internal();
  _drawingId = drawingId;

  var d = _cfg.getDrawing ? _cfg.getDrawing(drawingId) : null;
  if (!d) { if (_cfg.toast) _cfg.toast('Drawing not found'); return; }

  if (d.tileStatus === 'ready' && d.tileManifestUrl) {
    return _openServerTiles(d, drawingId, pageNum);
  }

  _openLegacyFallback(d, drawingId);
}

function _close_internal() {
  _active = false;
  _paused = false;
  _manifest = null;
  _pageInfo = null;
  _drawingId = null;
  clearTimeout(_renderTimer);

  var layer = document.getElementById('dv-tiles-layer');
  Object.keys(_tiles).forEach(function(k) {
    var t = _tiles[k];
    if (t && t.img) { t.img.src = ''; }
  });
  _tiles = {};
  _loading = {};
  _tileOrder = [];
  _tileCount = 0;

  if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
  var img = document.getElementById('dv-image');
  if (img) img.style.display = 'block';
}

function close() { _close_internal(); }

export var TiledPdf = {
  init: init,
  open: open,
  close: close,
  scheduleRender: scheduleRender,
  pause: pause,
  resume: resume,
  isActive: isActive,
  getDimensions: getDimensions
};
