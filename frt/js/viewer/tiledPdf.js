// frt/js/viewer/tiledPdf.js
// ─────────────────────────────────────────────────────────────────────────
// Tiled PDF renderer — Phase 5 port from v1 (ARENCON_Field_Review_Tool.html L5333–5666)
//
// Direct port. No logic changes. v1 was battle-tested on iPad/Samsung tablets;
// don't tune the constants below without field testing.
//
// Architecture:
//   - pdf.js loads the PDF document
//   - Drawing is divided into 512×512 logical-pixel tiles
//   - Visible tiles render to individual <canvas> elements absolutely positioned
//     inside #dv-tiles-layer
//   - Up to 4 concurrent renders, LRU cache capped at 24 tiles
//   - pause()/resume() yields the GPU during pen strokes (called by markup.js)
//
// Rules upheld:
//   - No OffscreenCanvas (Safari/iOS field tablets)
//   - All coords in logical drawing-pixel space (DPR handled at markup layer)
//   - Single sequential queue, processed in batches of 4
//
// Wiring:
//   TiledPdf.init({ getProject, getViewState, getDrawing, savePdfBuf, getPdfBuf,
//                   showLoading, hideLoading, toast, onFallbackImage })
//   TiledPdf.open(drawingId, pageNum)        → Promise<void>
//   TiledPdf.close()                          → void
//   TiledPdf.scheduleRender()                 → void   (call after pan/zoom)
//   TiledPdf.pause() / TiledPdf.resume()      → void   (markup.js pen handlers)
//   TiledPdf.isActive()                       → bool
//   TiledPdf.getDimensions()                  → {drawW, drawH, pageW, pageH, baseScale} | null
// ─────────────────────────────────────────────────────────────────────────

var state = {
  pdfDoc: null,
  drawingId: null,
  page: null,
  pageNum: 1,
  pageW: 0, pageH: 0,
  drawW: 0, drawH: 0,
  tileSize: 512,
  tiles: {},          // key 'tx_ty' → {canvas, quality}
  tileCount: 0,
  // S83b9: bumped to 180. At fit zoom, every tile IS on-screen (just small),
  // so the visible-region calc correctly queues all 176 tiles for an 8192×5461
  // PDF. With cap at 60, the LRU was evicting visible tiles mid-render —
  // causing "first columns disappear as new ones load". At fit zoom each tile
  // renders at ~256×256 (baseScale clamped to 0.5), so 180 tiles ≈ 47 MB total.
  // Safe on iPad budget. When user zooms in to 2×+, most tiles leave the
  // visible region and get naturally evicted by the LRU.
  maxTiles: 180,
  tileOrder: [],      // LRU
  renderTimer: null,
  baseScale: 1.5,
  maxRenderScale: 4.0,
  _rendering: {},
  _queue: [],
  _paused: false,
  active: false       // replaces v1's window._tiledActive
};

var cfg = null; // injected by init()

function _dbg(msg) { if (window._FRT_DEBUG) console.log('[TiledPdf] ' + msg); }

function init(config) {
  cfg = config || {};
  // Required: getViewState() → {scale, panX, panY}
  // Required: getDrawing(drawingId) → drawing record from project
  // Required: getPdfBuf(drawingId) → Promise<{buf}|null>
  // Required: savePdfBuf(drawingId, buf) → Promise<void>
  // Optional: showLoading(msg), hideLoading(), toast(msg), onFallbackImage(drawing, drawingId)
}

function isActive() { return state.active; }

function getDimensions() {
  if (!state.active) return null;
  return {
    drawW: state.drawW, drawH: state.drawH,
    pageW: state.pageW, pageH: state.pageH,
    baseScale: state.baseScale
  };
}

function pause() { state._paused = true; }
function resume() { state._paused = false; }

function _tileKey(tx, ty) { return tx + '_' + ty; }

function _evictLRU() {
  while (state.tileCount > state.maxTiles && state.tileOrder.length) {
    var oldest = state.tileOrder.shift();
    if (state.tiles[oldest]) {
      var t = state.tiles[oldest];
      var layer = document.getElementById('dv-tiles-layer');
      if (t.canvas) {
        t.canvas.width = 1; t.canvas.height = 1;
        if (layer && t.canvas.parentNode === layer) layer.removeChild(t.canvas);
      }
      delete state.tiles[oldest];
      state.tileCount--;
    }
  }
}

function _renderVisible() {
  if (!state.pdfDoc || !state.page) return;
  if (state._paused) return; // yield GPU to markup drawing

  var area = document.getElementById('dv-canvas-area');
  var layer = document.getElementById('dv-tiles-layer');
  if (!area || !layer) return;

  var view = cfg.getViewState ? cfg.getViewState() : { scale: 1, panX: 0, panY: 0 };
  var scale = view.scale || 1;
  var panX = view.panX || 0, panY = view.panY || 0;
  var areaW = area.clientWidth, areaH = area.clientHeight;
  var drawW = state.drawW, drawH = state.drawH;

  // Visible region in logical drawing pixels
  var visX0 = Math.max(0, -panX / scale);
  var visY0 = Math.max(0, -panY / scale);
  var visX1 = Math.min(drawW, (areaW - panX) / scale);
  var visY1 = Math.min(drawH, (areaH - panY) / scale);

  var tileS = state.tileSize;
  var txMin = Math.floor(visX0 / tileS);
  var tyMin = Math.floor(visY0 / tileS);
  var txMax = Math.ceil(visX1 / tileS);
  var tyMax = Math.ceil(visY1 / tileS);
  var maxTx = Math.ceil(drawW / tileS);
  var maxTy = Math.ceil(drawH / tileS);

  // Render quality: match current zoom so tiles stay crisp.
  // S83b8: REMOVED the Math.max(1.0, scale) floor. At fit-zoom of an 8192×5461
  // PDF on a 430px viewport (scale ≈ 0.05), the floor was forcing every tile
  // to render at 1.5× — yielding ~768×768 rasters per tile when only ~25×17
  // were actually displayed. pdf.js took multiple seconds per tile and the
  // renderer queued ALL 176 tiles (since at fit zoom, every tile IS visible).
  // Now: renderScale matches the on-screen pixel density. minimum 0.5 (still
  // crisper than display size on low-DPI viewports). qKey quantization keeps
  // tiles cached across small zoom adjustments.
  var renderScale = Math.min(state.maxRenderScale, Math.max(0.5, scale * state.baseScale));
  var qKey = Math.round(renderScale * 4); // quantise to 0.25 steps

  state._queue = [];

  for (var tx = txMin; tx <= Math.min(txMax, maxTx - 1); tx++) {
    for (var ty = tyMin; ty <= Math.min(tyMax, maxTy - 1); ty++) {
      var key = _tileKey(tx, ty);
      var existing = state.tiles[key];
      // S83b7: quality-hysteresis. Previously we re-rendered any time qKey
      // changed by even 1 step. On mobile DevTools at 88% zoom, the scale
      // wobbles by tiny amounts each frame causing qKey to flip between
      // adjacent values → infinite re-render chasing tail (Mark's
      // "tiles auto-load and disappear without scrolling" report).
      // Now: re-render only if quality differs by >= 2 steps (0.5 scale units).
      // Tiles slightly under-quality are kept; tiles slightly over-quality
      // are kept. Visible difference at < 0.5 zoom step is imperceptible.
      if (existing && Math.abs(existing.quality - qKey) <= 1) {
        // Touch LRU
        var idx = state.tileOrder.indexOf(key);
        if (idx >= 0) state.tileOrder.splice(idx, 1);
        state.tileOrder.push(key);
        continue;
      }
      var rk = key + '@' + qKey;
      if (state._rendering[rk]) continue;
      state._queue.push({ tx: tx, ty: ty, key: key, qKey: qKey, rk: rk, renderScale: renderScale });
    }
  }
  _processQueue();
}

function _processQueue() {
  if (state._paused || !state._queue.length) return;
  var maxConcurrent = 4;
  var activeCount = Object.keys(state._rendering).length;

  while (state._queue.length && activeCount < maxConcurrent) {
    var job = state._queue.shift();
    if (!job) break;
    var existing = state.tiles[job.key];
    if (existing && existing.quality === job.qKey) continue;
    if (state._rendering[job.rk]) continue;

    state._rendering[job.rk] = true;
    activeCount++;

    (function(j) {
      var drawingId = state.drawingId;
      var page = state.page;
      var bs = state.baseScale;
      var tileS = state.tileSize;
      var drawW = state.drawW, drawH = state.drawH;
      var renderScale = j.renderScale;
      var layer = document.getElementById('dv-tiles-layer');

      var logicalX = j.tx * tileS, logicalY = j.ty * tileS;
      var logicalW = Math.min(tileS, drawW - logicalX);
      var logicalH = Math.min(tileS, drawH - logicalY);
      if (logicalW <= 0 || logicalH <= 0) {
        delete state._rendering[j.rk];
        return;
      }

      var pdfX = logicalX / bs, pdfY = logicalY / bs;
      var bufW = Math.round(logicalW * (renderScale / bs));
      var bufH = Math.round(logicalH * (renderScale / bs));

      var tc = document.createElement('canvas');
      tc.width = bufW; tc.height = bufH;
      var ctx = tc.getContext('2d');

      page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: renderScale }),
        transform: [1, 0, 0, 1, -pdfX * renderScale, -pdfY * renderScale]
      }).promise.then(function() {
        delete state._rendering[j.rk];
        if (state.drawingId !== drawingId) return;

        tc.style.cssText =
          'position:absolute;left:' + logicalX + 'px;top:' + logicalY + 'px;' +
          'width:' + logicalW + 'px;height:' + logicalH + 'px;image-rendering:auto;';

        var prev = state.tiles[j.key];
        if (prev && prev.canvas) {
          prev.canvas.width = 1; prev.canvas.height = 1;
          if (layer && prev.canvas.parentNode === layer) layer.removeChild(prev.canvas);
          var pi = state.tileOrder.indexOf(j.key);
          if (pi >= 0) state.tileOrder.splice(pi, 1);
          state.tileCount--;
        }

        state.tiles[j.key] = { canvas: tc, quality: j.qKey };
        state.tileOrder.push(j.key);
        state.tileCount++;
        if (layer) layer.appendChild(tc);
        _evictLRU();
        _processQueue();
      }).catch(function(err) {
        delete state._rendering[j.rk];
        console.warn('[TiledPdf] render failed', j.key, err);
        _processQueue();
      });
    })(job);
  }
}

function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(_renderVisible, 80);
}

async function open(drawingId, pageNum) {
  if (!cfg) throw new Error('TiledPdf.init() must be called first');

  // Reset state
  state.drawingId = drawingId;
  state.tiles = {}; state.tileCount = 0; state.tileOrder = [];
  state._rendering = {}; state._queue = []; state._paused = false;
  state.pdfDoc = null; state.page = null;

  // 1. Get PDF buffer — local IDB first, R2 pdfBufR2Url second, legacy r2Url (image) last
  var rec = await cfg.getPdfBuf(drawingId).catch(function() { return null; });
  if (!rec || !rec.buf) {
    var d = cfg.getDrawing(drawingId);
    // S83: prefer pdfBufR2Url (source PDF) over r2Url (rendered JPEG).
    // Rendered-JPEG fallback exceeds iPad Safari's ~400 MB per-tab budget and crashes.
    var pdfBufUrl = d && d.pdfBufR2Url ? d.pdfBufR2Url : '';
    if (pdfBufUrl){
      _dbg('no IDB pdfData, fetching source PDF from R2: ' + pdfBufUrl.substring(0, 80));
      if (cfg.showLoading) cfg.showLoading('Downloading drawing from cloud…');
      try {
        var resP = await fetch(pdfBufUrl);
        if (!resP.ok) throw new Error('HTTP ' + resP.status);
        var bufP = await resP.arrayBuffer();
        // Cache locally so subsequent opens are fast
        await cfg.savePdfBuf(drawingId, bufP).catch(function() {});
        rec = { buf: bufP };
      } catch (fetchErrP) {
        _dbg('pdfBufR2Url fetch failed: ' + fetchErrP.message + ' — trying legacy r2Url');
        // Fall through to legacy r2Url branch below
      }
    }
  }
  if (!rec || !rec.buf) {
    var d = cfg.getDrawing(drawingId);
    if (d && d.r2Url) {
      _dbg('no IDB pdfData, fetching from R2: ' + d.r2Url.substring(0, 80));
      if (cfg.showLoading) cfg.showLoading('Downloading drawing from cloud…');
      try {
        var res = await fetch(d.r2Url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var contentType = res.headers.get('content-type') || '';
        // R2 returned an image, not a PDF — bail to image viewer
        if (contentType.indexOf('image/') === 0) {
          _dbg('R2 returned image (' + contentType + '), falling back to image viewer');
          d.pdfTiled = false;
          if (cfg.hideLoading) cfg.hideLoading();
          if (cfg.onFallbackImage) cfg.onFallbackImage(d, drawingId);
          return;
        }
        var buf = await res.arrayBuffer();
        await cfg.savePdfBuf(drawingId, buf).catch(function() {});
        rec = { buf: buf };
      } catch (fetchErr) {
        if (cfg.hideLoading) cfg.hideLoading();
        if (cfg.toast) cfg.toast('Could not download drawing from cloud: ' + fetchErr.message);
        return;
      }
    } else {
      _dbg('no IDB pdfData AND no r2Url — falling back to image viewer');
      if (cfg.hideLoading) cfg.hideLoading();
      var fbDwg = cfg.getDrawing(drawingId);
      if (fbDwg) {
        fbDwg.pdfTiled = false;
        if (cfg.onFallbackImage) cfg.onFallbackImage(fbDwg, drawingId);
        return;
      }
      if (cfg.toast) cfg.toast('Drawing data not found locally or in cloud — please re-upload');
      return;
    }
  }

  // S83: Lazy migration — if this drawing has pdfBuf in IDB but no pdfBufR2Url,
  // upload now and patch the drawing metadata. Fire-and-forget; never block open.
  (function(){
    var d = cfg.getDrawing(drawingId);
    if (!d || d.pdfBufR2Url || !d.pdfBufKey) return;
    if (!cfg.lazyUploadPdfBuf) return;
    try { cfg.lazyUploadPdfBuf(d, rec.buf); } catch (e) { /* noop */ }
  })();

  // 2. Load with pdf.js
  if (typeof pdfjsLib === 'undefined') {
    if (cfg.toast) cfg.toast('PDF library not loaded');
    return;
  }
  try {
    var pdf = await pdfjsLib.getDocument({ data: new Uint8Array(rec.buf) }).promise;
    var pg = await pdf.getPage(pageNum || 1);
    var pv = pg.view; // [x,y,w,h] in PDF points
    state.pdfDoc = pdf;
    state.page = pg;
    state.pageNum = pageNum || 1;
    state.pageW = pv[2];
    state.pageH = pv[3];

    // Use stored drawing dims so markup coordinates stay consistent across opens
    var dwgRec = cfg.getDrawing(drawingId);
    var drawW = dwgRec ? dwgRec.width : Math.round(state.pageW * state.baseScale);
    var drawH = dwgRec ? dwgRec.height : Math.round(state.pageH * state.baseScale);
    state.drawW = drawW;
    state.drawH = drawH;
    state.baseScale = drawW / state.pageW;

    // 3. DOM setup — hide image, build tiles layer
    var img = document.getElementById('dv-image');
    if (img) { img.src = ''; img.style.display = 'none'; }

    var wrap = document.getElementById('dv-img-wrap');
    var layer = document.getElementById('dv-tiles-layer');
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = document.createElement('div');
    layer.id = 'dv-tiles-layer';
    layer.style.cssText =
      'position:absolute;top:0;left:0;width:' + drawW + 'px;height:' + drawH + 'px;' +
      'background:white;overflow:hidden;';
    if (wrap) wrap.insertBefore(layer, wrap.firstChild);

    state.active = true;

    // 4. Notify viewer to fit + size markup canvas
    if (cfg.onReady) cfg.onReady({ drawW: drawW, drawH: drawH });

    // 5. Initial render
    _renderVisible();
    if (window.innerWidth <= 700) {
      setTimeout(function() {
        if (cfg.onReady) cfg.onReady({ drawW: drawW, drawH: drawH });
        _renderVisible();
      }, 200);
    }
  } catch (err) {
    console.error('[TiledPdf] PDF load error:', err);
    if (!window._pdfRecoveryFailed) window._pdfRecoveryFailed = {};
    window._pdfRecoveryFailed[drawingId] = true;
    var fbDwg2 = cfg.getDrawing(drawingId);
    if (fbDwg2 && cfg.onFallbackImage) {
      fbDwg2.pdfTiled = false;
      if (cfg.hideLoading) cfg.hideLoading();
      cfg.onFallbackImage(fbDwg2, drawingId);
      return;
    }
    if (cfg.hideLoading) cfg.hideLoading();
    if (cfg.toast) cfg.toast('Could not open drawing: ' + err.message);
  }
}

function close() {
  state.active = false;
  state.pdfDoc = null; state.page = null;
  state._rendering = {}; state._queue = []; state._paused = false;
  Object.keys(state.tiles).forEach(function(k) {
    var t = state.tiles[k];
    if (t && t.canvas) { t.canvas.width = 1; t.canvas.height = 1; }
  });
  state.tiles = {}; state.tileCount = 0; state.tileOrder = [];
  var layer = document.getElementById('dv-tiles-layer');
  if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
  var img = document.getElementById('dv-image');
  if (img) img.style.display = 'block';
}

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
