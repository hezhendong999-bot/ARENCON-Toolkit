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
var _loading = {};  // key -> Image  (stores img ref so we can abort via src='')
var _tileOrder = [];
var _tileCount = 0;
var _lastLevelIdx = -1;  // S91: track active level to abort orphaned requests on zoom change

// S91: iPhone Safari caps tab memory at ~250MB. Each decoded WebP tile is
// 512×512×4 = 1MB. With full 6144 backdrop (~100MB) + markup (~16MB) +
// Safari overhead (~50MB) baseline is ~166MB, leaving only ~84MB for tiles.
// 25-tile cap keeps tile memory under ~25MB; combined peak lands at ~190MB
// with healthy headroom. Trade-off: aggressive pan re-fetches evicted tiles,
// but R2 has immutable-year cache so re-fetches are instant from SW cache.
// Desktop / iPad / Android keep 250 — plenty of memory there.
var _isIPhone = /iPhone|iPod/.test(navigator.userAgent);
var _MAX_TILES = _isIPhone ? 25 : 250;
var _TILE_SIZE = 512;

// S91 DEBUG OVERLAY (iPhone only, remove when diagnosis complete) ─────────
// Shows live state just above the bottom of the screen so we can see the
// last numbers before an OOM-kill. Counts in-flight decodes separately from
// cached tiles because transient decode spikes are invisible to _tileCount.
var _DBG_ENABLED = _isIPhone || /[?&]dbg=1\b/.test(typeof window !== 'undefined' ? (window.location.search || '') : '');
var _dbg_loadingCount = 0;
var _dbg_decodingCount = 0;
var _dbg_maxDecoding = 0;
var _dbg_maxLoading = 0;
var _dbg_maxTiles = 0;
var _dbg_zoomCount = 0;
var _dbg_lastEvents = [];
var _dbg_el = null;

function _dbgEvent(s) {
  if (!_DBG_ENABLED) return;
  _dbg_lastEvents.push(s);
  if (_dbg_lastEvents.length > 6) _dbg_lastEvents.shift();
}

function _dbgRender() {
  if (!_DBG_ENABLED) return;
  if (!_dbg_el) {
    if (typeof document === 'undefined' || !document.body) return;
    _dbg_el = document.createElement('div');
    _dbg_el.id = 'dbg-overlay';
    _dbg_el.style.cssText =
      'position:fixed;left:4px;bottom:4px;z-index:99999;' +
      'background:rgba(0,0,0,0.85);color:#0f0;font:10px/1.2 monospace;' +
      'padding:4px 6px;border-radius:4px;pointer-events:none;' +
      'max-width:60vw;white-space:pre;text-align:left;';
    document.body.appendChild(_dbg_el);
  }
  if (_dbg_loadingCount > _dbg_maxLoading) _dbg_maxLoading = _dbg_loadingCount;
  if (_dbg_decodingCount > _dbg_maxDecoding) _dbg_maxDecoding = _dbg_decodingCount;
  if (_tileCount > _dbg_maxTiles) _dbg_maxTiles = _tileCount;
  var view = _cfg && _cfg.getViewState ? _cfg.getViewState() : null;
  var scale = view && view.scale ? view.scale.toFixed(2) : '?';
  _dbg_el.textContent =
    'tiles: ' + _tileCount + '/' + _MAX_TILES + ' peak:' + _dbg_maxTiles + '\n' +
    'loading: ' + _dbg_loadingCount + ' peak:' + _dbg_maxLoading + '\n' +
    'decoding: ' + _dbg_decodingCount + ' peak:' + _dbg_maxDecoding + '\n' +
    'zoom: ' + scale + ' (x' + _dbg_zoomCount + ')\n' +
    _dbg_lastEvents.join('\n');
}

// Fast low-cost tick so the overlay reflects transient spikes
if (_DBG_ENABLED && typeof window !== 'undefined') {
  setInterval(_dbgRender, 250);
}
// ──────────────────────────────────────────────────────────────────────────

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
    '/level-' + level + '/' + col + '-' + row + '.webp';
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
//
// S91 fix 2: pick level based on ACTUAL viewport CSS pixels — not drawing
// coordinate space. Previous logic did targetW = drawW * viewScale, which
// at zoom 0.33 on a 10000px-wide drawing gave targetW = 3300 and picked L3.
// But the viewport is only ~400px on iPhone — we can't display more than
// that in the first place. Using areaW * devicePixelRatio as the target
// (i.e. "how many pixels can the screen actually show"), zoom 0.33x picks
// L1 naturally. Zoom 1.91x at viewport slice picks L3. Zoom 4x+ picks L4.
// Fully display-driven, no arbitrary floors. Fieldwire-style behavior.
function _pickLevel(viewScale, viewportW) {
  if (!_pageInfo || !_pageInfo.levels || !_pageInfo.levels.length) return -1;
  var levels = _pageInfo.levels;
  // Portion of the drawing visible on screen at this zoom, in draw-space px
  var visibleDrawW = Math.min(_drawW, viewportW / viewScale);
  // Target: pick a level where that visible chunk of drawing covers the
  // viewport at native screen resolution. dpr accounts for retina.
  var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  var targetPx = viewportW * dpr;
  // Level width / drawW = pixels per draw-unit. Multiplied by visibleDrawW
  // gives pixels this level would render into the viewport at native scale.
  for (var i = 0; i < levels.length; i++) {
    var levelPxInViewport = (levels[i].width / _drawW) * visibleDrawW;
    if (levelPxInViewport >= targetPx) return i;
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

function _abortOtherLevels(keepLevelIdx) {
  var aborted = 0;
  Object.keys(_loading).forEach(function(key){
    var level = parseInt(key.split('_')[0], 10);
    if (level === keepLevelIdx) return;
    var img = _loading[key];
    if (img && typeof img === 'object') {
      // Setting src='' halts in-flight fetch on Safari (and everywhere else)
      img.onload = null;
      img.onerror = null;
      img.src = '';
    }
    delete _loading[key];
    _dbg_loadingCount--;
    aborted++;
  });
  if (aborted) _dbgEvent('abort ' + aborted + ' L!' + keepLevelIdx);
}

function _fetchTile(levelIdx, col, row, lvl, layer) {
  var key = levelIdx + '_' + col + '_' + row;
  if (_tiles[key] || _loading[key]) return;

  var url = _tileUrl(levelIdx, col, row);
  if (!url) return;

  // Map tile from level-pixel space to draw-pixel space.
  // Each tile covers TILE_SIZE × TILE_SIZE level-pixels (edges may be smaller).
  // Scale uniformly by drawW/levelW and drawH/levelH.
  var scaleX = _drawW / lvl.width;
  var scaleY = _drawH / lvl.height;
  var tileX = col * _TILE_SIZE;
  var tileY = row * _TILE_SIZE;
  var tileW = Math.min(_TILE_SIZE, lvl.width - tileX);
  var tileH = Math.min(_TILE_SIZE, lvl.height - tileY);
  if (tileW <= 0 || tileH <= 0) return;

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

  // S91: store img ref so _abortOtherLevels can cancel in-flight fetches
  _loading[key] = img;
  _dbg_loadingCount++;

  var drawingIdAtRequest = _drawingId;
  img.onload = function() {
    // If already aborted, src was reset and onload was nulled out — we
    // shouldn't get here, but belt-and-suspenders
    if (!_loading[key]) return;
    delete _loading[key];
    _dbg_loadingCount--;
    if (!_active || _drawingId !== drawingIdAtRequest) { img.src = ''; return; }
    // Force-count the decode window: HTML Image decode() resolves when
    // the bitmap is actually in RAM. That's the real memory spike moment.
    _dbg_decodingCount++;
    var doneDecode = function() {
      _dbg_decodingCount--;
      if (!_active || _drawingId !== drawingIdAtRequest) { img.src = ''; return; }
      _tiles[key] = { img: img, level: levelIdx, col: col, row: row };
      _tileOrder.push(key);
      _tileCount++;
      if (layer && layer.parentNode) layer.appendChild(img);
      _evictLRU(layer);
    };
    if (img.decode) {
      img.decode().then(doneDecode).catch(doneDecode);
    } else {
      doneDecode();
    }
  };
  img.onerror = function() {
    // If already aborted, our cleanup already decremented. Skip.
    if (!_loading[key]) return;
    delete _loading[key];
    _dbg_loadingCount--;
    _dbgEvent('err ' + key);
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

  var levelIdx = _pickLevel(scale, areaW);
  if (levelIdx < 0) return;  // JPEG backdrop is sufficient at this zoom
  var lvl = _pageInfo.levels[levelIdx];
  if (!lvl) return;

  // S91 fix: when level changes (zoom crossed a boundary), abort any
  // in-flight requests for other levels. Without this, zooming in to L4
  // then zooming back out piles the old L4 fetches on top of new L1 fetches
  // and the request storm crashes iPhone Safari. Aborting orphaned loads
  // keeps in-flight count bounded to the current level's visible tiles.
  if (_lastLevelIdx !== levelIdx) {
    _abortOtherLevels(levelIdx);
    _lastLevelIdx = levelIdx;
  }
  _dbgEvent('L' + levelIdx + '@' + scale.toFixed(2));

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
  _dbg_zoomCount++;
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
  // S91: also abort in-flight fetches (they have img refs now)
  Object.keys(_loading).forEach(function(k) {
    var img = _loading[k];
    if (img && typeof img === 'object') {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    }
  });
  _tiles = {};
  _loading = {};
  _tileOrder = [];
  _tileCount = 0;
  _lastLevelIdx = -1;
  _dbg_loadingCount = 0;
  _dbg_decodingCount = 0;

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
