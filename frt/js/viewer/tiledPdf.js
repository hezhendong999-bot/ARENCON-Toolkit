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

// Pick smallest level whose width >= drawW * screenZoom.
// Minimum display level = 2 (2560px, 20 tiles) — L0/L1 are too blurry
// compared to the old 6144px single-JPEG path. L0 is used only as the
// background-image instant preview.
function _pickLevel(viewScale) {
  if (!_pageInfo || !_pageInfo.levels || !_pageInfo.levels.length) return 0;
  var targetW = _drawW * viewScale;
  var levels = _pageInfo.levels;
  var minLevel = Math.min(2, levels.length - 1);  // at least L2
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

  var tileCssW = _drawW / lvl.cols;
  var tileCssH = _drawH / lvl.rows;
  // Integer positions — floor for left/top, ceil for size + 1px overlap to seal sub-pixel gaps
  var cssL = Math.floor(col * tileCssW);
  var cssT = Math.floor(row * tileCssH);
  var cssR = Math.ceil((col + 1) * tileCssW) + 1;  // 1px overlap
  var cssB = Math.ceil((row + 1) * tileCssH) + 1;
  // Clamp to draw bounds
  if (cssR > _drawW + 1) cssR = _drawW + 1;
  if (cssB > _drawH + 1) cssB = _drawH + 1;
  var cssW = cssR - cssL;
  var cssH = cssB - cssT;

  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.style.cssText =
    'position:absolute;left:' + cssL + 'px;top:' + cssT + 'px;' +
    'width:' + cssW + 'px;height:' + cssH + 'px;image-rendering:auto;' +
    'z-index:' + (levelIdx + 1) + ';pointer-events:none;';

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
  var lvl = _pageInfo.levels[levelIdx];
  if (!lvl) return;

  var visX0 = Math.max(0, -panX / scale);
  var visY0 = Math.max(0, -panY / scale);
  var visX1 = Math.min(_drawW, (areaW - panX) / scale);
  var visY1 = Math.min(_drawH, (areaH - panY) / scale);

  var tileCssW = _drawW / lvl.cols;
  var tileCssH = _drawH / lvl.rows;
  var colMin = Math.max(0, Math.floor(visX0 / tileCssW));
  var colMax = Math.min(lvl.cols - 1, Math.floor(visX1 / tileCssW));
  var rowMin = Math.max(0, Math.floor(visY0 / tileCssH));
  var rowMax = Math.min(lvl.rows - 1, Math.floor(visY1 / tileCssH));

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

      var img = document.getElementById('dv-image');
      if (img) { img.src = ''; img.style.display = 'none'; }

      var wrap = document.getElementById('dv-img-wrap');
      var oldLayer = document.getElementById('dv-tiles-layer');
      if (oldLayer && oldLayer.parentNode) oldLayer.parentNode.removeChild(oldLayer);

      var layer = document.createElement('div');
      layer.id = 'dv-tiles-layer';
      // S87 fix: L0 thumbnail as background-image for instant blur preview
      // while higher-level tiles load. Covers the entire draw area.
      var l0url = _tileUrl(0, 0, 0);
      layer.style.cssText =
        'position:absolute;top:0;left:0;width:' + _drawW + 'px;height:' + _drawH +
        'px;overflow:hidden;' +
        (l0url ? 'background:url(' + l0url + ') no-repeat top left/100% 100%;' : 'background:white;');
      if (wrap) wrap.insertBefore(layer, wrap.firstChild);

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
