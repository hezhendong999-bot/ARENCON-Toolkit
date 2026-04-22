// frt/js/viewer/tiledPdf.js
// S92 CLEAN REWRITE
// Server-rendered tile pyramid viewer. Small, predictable, no stuck states.
//
// Public API (unchanged — callers in viewer.js / markup.js depend on this):
//   TiledPdf.init(config)
//   TiledPdf.open(drawingId, pageNum)   -> Promise<void>
//   TiledPdf.close()                     -> void
//   TiledPdf.scheduleRender()            -> void
//   TiledPdf.pause() / .resume()         -> void
//   TiledPdf.isActive()                  -> bool
//   TiledPdf.getDimensions()             -> {drawW, drawH, pageW, pageH, baseScale} | null
//
// Design:
//   • Fetch queue with concurrency cap (4 in-flight max)
//   • On scheduleRender: compute visible tiles for current level, enqueue
//     missing ones; tiles from prior levels stay cached until LRU eviction
//   • Level change cancels PENDING (not-yet-started) requests for old levels,
//     but lets in-flight ones finish (to populate cache for possible return)
//   • Render loop is idempotent — calling it N times with same view state
//     does nothing extra
//   • No "skip tiles" tricks — we always load whatever level the picker picks
//   • Backdrop (dv-image) stays visible forever as a safety net

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

// Tile cache: key "level_col_row" -> { img, level }
var _tiles = {};
// In-flight fetches: key -> true
var _inflight = {};
// Pending queue: [{ key, level, col, row, lvl }]
var _pending = [];
var _tileOrder = [];          // LRU order (oldest first)
var _tileCount = 0;

var _isIPhone = /iPhone|iPod/.test(navigator.userAgent);
var _isIPad   = /iPad/.test(navigator.userAgent)
               || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
var _isMobile = _isIPhone || _isIPad || /Android/.test(navigator.userAgent);
// S93 FIX: split iPhone / iPad budgets. Old value of 40 was too aggressive
// for iPad (plenty of RAM, capable of 150+ tiles) and caused visible-tile
// eviction churn on L3 (12x8 = 96 tiles; a viewport + margin frequently
// needed >40 tiles resident) resulting in blank/black tiles where evicted
// ones hadn't been refetched yet. iPhones keep a conservative cap to avoid
// Safari canvas memory kill; iPad gets closer to desktop.
var _MAX_TILES = _isIPhone ? 80 : (_isIPad ? 180 : 250);
var _MAX_CONCURRENT = _isIPhone ? 3 : (_isIPad ? 5 : 6);
var _TILE_SIZE = 512;

// ── Debug overlay — OFF by default. Enable with ?dbg=1 URL param only.
// S93 fixes are stable in production, so the always-on mobile overlay is
// retired. Keep the code path intact so it can still be invoked ad-hoc for
// future bug reports without another deploy.
// S97 DIAG (revised): enable via ANY of three methods —
//   1) URL has ?dbg=1 or &dbg=1 (works in plain Safari tab)
//   2) localStorage._frtDbg === '1' (persists across reloads, survives crash,
//      survives PWA / home-screen launch where URL params get stripped)
//   3) Console helpers exposed below: _frtDbgOn() flips on + reloads,
//      _frtDbgOff() flips off + reloads, _frtDbgPeek() dumps ring buffer.
function _readDbgFlag() {
  try {
    if (typeof window === 'undefined') return false;
    if (/[?&]dbg=1\b/.test(window.location.search || '')) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('_frtDbg') === '1') return true;
  } catch (_) { /* private mode etc. — fall through */ }
  return false;
}
var _DBG_ENABLED = _readDbgFlag();

// Console helpers — installed UNCONDITIONALLY (cheap, no overhead until called).
// This is the escape hatch for when ?dbg=1 doesn't survive the launch URL.
if (typeof window !== 'undefined') {
  window._frtDbgOn = function () {
    try { localStorage.setItem('_frtDbg', '1'); } catch (_) {}
    console.log('[S97 DIAG] enabled — reloading…');
    setTimeout(function () { window.location.reload(); }, 200);
  };
  window._frtDbgOff = function () {
    try {
      localStorage.removeItem('_frtDbg');
      localStorage.removeItem('_frtS97DbgRing');
    } catch (_) {}
    console.log('[S97 DIAG] disabled + ring buffer cleared — reloading…');
    setTimeout(function () { window.location.reload(); }, 200);
  };
  window._frtDbgPeek = function () {
    try {
      var ring = JSON.parse(localStorage.getItem('_frtS97DbgRing') || '[]');
      if (!ring.length) { console.log('[S97 DIAG] ring buffer is empty'); return ring; }
      console.log('[S97 DIAG] ring buffer (' + ring.length + ' entries, oldest first):');
      console.table(ring.map(function (s) {
        var d = new Date(s.t);
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return {
          time: pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
          tiles: s.tiles + '/' + s.cap,
          byLevel: s.byLevel || '-',
          mk_Mpx: s.mk, gl_Mpx: s.gl, approx_MB: s.approxMB,
          inflight: s.inflight, pending: s.pending, scale: s.scale
        };
      }));
      return ring;
    } catch (e) { console.error('[S97 DIAG] peek failed:', e); return null; }
  };
}
var _dbg_el = null;
var _dbg_lastEvents = [];
var _dbg_maxInflight = 0;
var _dbg_maxTiles = 0;
var _dbg_renderCount = 0;

function _dbgEvent(s) {
  if (!_DBG_ENABLED) return;
  _dbg_lastEvents.push(s);
  if (_dbg_lastEvents.length > 5) _dbg_lastEvents.shift();
}
function _dbgTick() {
  if (!_DBG_ENABLED) return;
  if (!_dbg_el) {
    if (typeof document === 'undefined' || !document.body) return;
    _dbg_el = document.createElement('div');
    _dbg_el.id = 'dbg-overlay';
    _dbg_el.style.cssText =
      'position:fixed;left:4px;bottom:4px;z-index:99999;' +
      'background:rgba(0,0,0,0.85);color:#0f0;font:10px/1.2 monospace;' +
      'padding:4px 6px;border-radius:4px;pointer-events:none;' +
      'max-width:80vw;white-space:pre;text-align:left;';
    document.body.appendChild(_dbg_el);
  }
  var inflight = 0;
  for (var k in _inflight) if (Object.prototype.hasOwnProperty.call(_inflight, k)) inflight++;
  if (inflight > _dbg_maxInflight) _dbg_maxInflight = inflight;
  if (_tileCount > _dbg_maxTiles) _dbg_maxTiles = _tileCount;

  var view = _cfg && _cfg.getViewState ? _cfg.getViewState() : null;
  var scale = (view && typeof view.scale === 'number') ? view.scale : 0;
  var area = document.getElementById('dv-canvas-area');
  var wrap = document.getElementById('dv-img-wrap');
  var aw = area ? area.clientWidth : 0;
  var ah = area ? area.clientHeight : 0;
  var wrapRect = wrap ? wrap.getBoundingClientRect() : null;
  var wrapW = wrapRect ? Math.round(wrapRect.width) : 0;
  var wrapH = wrapRect ? Math.round(wrapRect.height) : 0;

  // S97 DIAG: markup canvas sizes (Mpx rounded to 1 decimal)
  var mc = document.getElementById('markup-canvas');
  var wc = document.getElementById('markup-webgl-canvas');
  var mkMpx = (mc && mc.width && mc.height) ? Math.round((mc.width * mc.height) / 100000) / 10 : 0;
  var glMpx = (wc && wc.width && wc.height) ? Math.round((wc.width * wc.height) / 100000) / 10 : 0;

  // S97 DIAG: per-level tile distribution — tells us which zoom level is hoarding tiles
  var byLevel = {};
  for (var tk in _tiles) {
    if (!Object.prototype.hasOwnProperty.call(_tiles, tk)) continue;
    var lv = _tiles[tk].level;
    byLevel[lv] = (byLevel[lv] || 0) + 1;
  }
  var lvKeys = Object.keys(byLevel).sort();
  var lvStr = '';
  for (var li = 0; li < lvKeys.length; li++) {
    lvStr += (li ? ' ' : '') + 'L' + lvKeys[li] + ':' + byLevel[lvKeys[li]];
  }

  // S97 DIAG: approx MB — each 512x512 decoded tile ~1MB, each canvas px * 4 bytes
  var approxMB = Math.round(_tileCount + mkMpx * 4 + glMpx * 4);

  _dbg_el.textContent =
    'tiles: ' + _tileCount + '/' + _MAX_TILES + ' peak:' + _dbg_maxTiles + '\n' +
    (lvStr ? 'by lvl: ' + lvStr + '\n' : '') +
    'mk: ' + mkMpx + 'M  gl: ' + glMpx + 'M\n' +
    'approx: ~' + approxMB + ' MB\n' +
    'inflight: ' + inflight + ' peak:' + _dbg_maxInflight + '\n' +
    'pending: ' + _pending.length + '\n' +
    'scale: ' + scale.toFixed(3) + '\n' +
    'draw: ' + _drawW + 'x' + _drawH + '\n' +
    'area: ' + aw + 'x' + ah + '\n' +
    'wrap: ' + wrapW + 'x' + wrapH + '\n' +
    'render#' + _dbg_renderCount + '\n' +
    _dbg_lastEvents.join('\n');

  // S97 DIAG: ring buffer write for post-crash forensics. Survives Safari
  // Jetsam tab-reload (localStorage persists). On next load, _dbgBootReport
  // reads it and shows a burgundy banner with the last 10 pre-crash states.
  try {
    var ring = [];
    try { ring = JSON.parse(localStorage.getItem('_frtS97DbgRing') || '[]'); } catch (_e1) { ring = []; }
    ring.push({
      t: Date.now(),
      tiles: _tileCount, cap: _MAX_TILES, peak: _dbg_maxTiles,
      byLevel: lvStr, mk: mkMpx, gl: glMpx, approxMB: approxMB,
      inflight: inflight, pending: _pending.length,
      scale: +scale.toFixed(3),
      draw: _drawW + 'x' + _drawH, area: aw + 'x' + ah,
      render: _dbg_renderCount,
      events: _dbg_lastEvents.slice(-3)
    });
    while (ring.length > 40) ring.shift();
    localStorage.setItem('_frtS97DbgRing', JSON.stringify(ring));
  } catch (_e2) { /* quota / private mode — swallow */ }
}
if (_DBG_ENABLED && typeof window !== 'undefined') {
  setInterval(_dbgTick, 250);
}

// S97 DIAG: post-crash forensics banner. If the ring buffer was written in
// the last 120s (suggesting the previous load ended in a tab-reload, not a
// clean close) show a burgundy banner with peak-memory summary + last 10
// snapshots. Tap to dismiss + clear buffer.
if (_DBG_ENABLED && typeof window !== 'undefined' && typeof document !== 'undefined') {
  var _dbgBootReport = function () {
    try {
      var ring = [];
      try { ring = JSON.parse(localStorage.getItem('_frtS97DbgRing') || '[]'); } catch (_e) { return; }
      if (!ring.length) return;
      var last = ring[ring.length - 1];
      if (!last || !last.t) return;
      var age = Date.now() - last.t;
      if (age > 120000) return; // >2min — probably a clean close, not a crash

      // Peak across ring
      var peak = ring[0];
      for (var i = 1; i < ring.length; i++) {
        if ((ring[i].approxMB || 0) > (peak.approxMB || 0)) peak = ring[i];
      }
      var recent = ring.slice(-10);
      var lines = [];
      for (var j = recent.length - 1; j >= 0; j--) {
        var s = recent[j];
        var d = new Date(s.t);
        var pad = function(n){ return n < 10 ? '0' + n : '' + n; };
        var ts = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        var rel = Math.round((Date.now() - s.t) / 1000);
        lines.push('-' + rel + 's  ' + ts +
          ' | tiles:' + s.tiles + '/' + s.cap +
          (s.byLevel ? ' (' + s.byLevel + ')' : '') +
          '  mk:' + s.mk + 'M  gl:' + s.gl + 'M' +
          '  ~' + s.approxMB + 'MB' +
          '  inf:' + s.inflight + '  pnd:' + s.pending +
          '  s:' + s.scale);
      }

      var banner = document.createElement('div');
      banner.id = 's97-crash-report';
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:999999;' +
        'background:#9C2742;color:#fff;font:11px/1.4 Menlo,monospace;' +
        'padding:10px 14px;max-height:60vh;overflow:auto;white-space:pre;' +
        'box-shadow:0 2px 12px rgba(0,0,0,0.5);';
      var title = document.createElement('div');
      title.style.cssText = 'font:600 13px/1.3 Calibri,sans-serif;margin-bottom:6px;';
      title.textContent = 'S97 DIAG  —  pre-crash peak: tiles ' +
        peak.tiles + '/' + peak.cap +
        (peak.byLevel ? ' (' + peak.byLevel + ')' : '') +
        ', ~' + peak.approxMB + ' MB    |    tap banner to dismiss + clear';
      banner.appendChild(title);
      var body = document.createElement('div');
      body.textContent = lines.join('\n');
      banner.appendChild(body);
      banner.addEventListener('click', function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
        try { localStorage.removeItem('_frtS97DbgRing'); } catch (_) { /* noop */ }
      });
      if (document.body) document.body.appendChild(banner);
    } catch (_err) { /* swallow */ }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(_dbgBootReport, 600); });
  } else {
    setTimeout(_dbgBootReport, 600);
  }
}

function _dbg(msg) { if (typeof window !== 'undefined' && window._FRT_DEBUG) console.log('[TiledPdf] ' + msg); }

// ── Public setters/getters ─────────────────────────────────────────────────
function init(config) { _cfg = config || {}; }
function isActive() { return _active; }
function pause() { _paused = true; }
function resume() { _paused = false; scheduleRender(); }
function getDimensions() {
  if (!_active) return null;
  return { drawW: _drawW, drawH: _drawH, pageW: _nativeW, pageH: _nativeH, baseScale: _baseScale };
}

// ── Tile URL ───────────────────────────────────────────────────────────────
function _tileUrl(level, col, row) {
  var d = _cfg && _cfg.getDrawing ? _cfg.getDrawing(_drawingId) : null;
  if (!d || !d.tileServer || !_manifest) return '';
  // S94 correction — reverted to .webp. Earlier in S94 we switched to .jpg
  // to dodge what looked like a VP8L decode bug at L3/L4, but those "broken"
  // jpgs turned out to be stale tiles from a pre-S90 render that nothing in
  // the current pipeline overwrites. Current server.js writes *only* .webp;
  // every fresh render (pdfium, poppler, font/LCD tweaks, everything) lands
  // in .webp. Real iOS Safari decodes .webp VP8L fine — the black/color
  // artifacts that motivated the original switch were Chrome DevTools iPad
  // emulation being buggy, not a real-device issue.
  return d.tileServer + '/' + _manifest.pid + '/tiles/' +
    _manifest.drawingId + '/page-' + _pageInfo.pageNumber +
    '/level-' + level + '/' + col + '-' + row + '.webp';
}

// ── Level picker ───────────────────────────────────────────────────────────
// Simple rule: pick lowest level whose pixel width >= target width (drawW *
// viewScale). At zoom ≥ 1, floor at index 3 (matches backdrop resolution).
// Always returns a valid index so tiles always load (no "missing content").
function _pickLevel(viewScale) {
  if (!_pageInfo || !_pageInfo.levels || !_pageInfo.levels.length) return -1;
  var levels = _pageInfo.levels;
  var minLevel = (viewScale >= 1) ? Math.min(3, levels.length - 1) : 0;
  var targetW = _drawW * viewScale;
  for (var i = minLevel; i < levels.length; i++) {
    if (levels[i].width >= targetW) return i;
  }
  return levels.length - 1;
}

// ── Cache + queue ──────────────────────────────────────────────────────────
function _tileKey(level, col, row) { return level + '_' + col + '_' + row; }

function _inflightCount() {
  var n = 0;
  for (var k in _inflight) if (Object.prototype.hasOwnProperty.call(_inflight, k)) n++;
  return n;
}

// Drop queued-but-not-started fetches whose level != keepLevel. Lets already-
// started fetches finish (cheap — they'll populate cache).
function _cancelPendingExceptLevel(keepLevel) {
  var next = [];
  for (var i = 0; i < _pending.length; i++) {
    if (_pending[i].level === keepLevel) next.push(_pending[i]);
  }
  _pending = next;
}

function _evictExcess(layer) {
  while (_tileCount > _MAX_TILES && _tileOrder.length) {
    var oldest = _tileOrder.shift();
    var tile = _tiles[oldest];
    if (tile && tile.img) {
      if (layer && tile.img.parentNode === layer) layer.removeChild(tile.img);
      tile.img.src = '';
    }
    delete _tiles[oldest];
    _tileCount--;
  }
}

function _touch(key) {
  var i = _tileOrder.indexOf(key);
  if (i >= 0) _tileOrder.splice(i, 1);
  _tileOrder.push(key);
}

// Promote a single pending request into flight (if capacity).
function _pumpQueue() {
  var layer = document.getElementById('dv-tiles-layer');
  while (_pending.length > 0 && _inflightCount() < _MAX_CONCURRENT) {
    var req = _pending.shift();
    // Re-verify: cached or already in-flight since queued?
    if (_tiles[req.key] || _inflight[req.key]) continue;
    _startFetch(req, layer);
  }
}

function _startFetch(req, layer) {
  var key = req.key;
  _inflight[key] = true;

  var url = _tileUrl(req.level, req.col, req.row);
  if (!url) { delete _inflight[key]; return; }

  var lvl = req.lvl;
  var scaleX = _drawW / lvl.width;
  var scaleY = _drawH / lvl.height;
  var tileX = req.col * _TILE_SIZE;
  var tileY = req.row * _TILE_SIZE;
  var tileW = Math.min(_TILE_SIZE, lvl.width - tileX);
  var tileH = Math.min(_TILE_SIZE, lvl.height - tileY);
  if (tileW <= 0 || tileH <= 0) { delete _inflight[key]; _pumpQueue(); return; }

  var cssL = Math.round(tileX * scaleX);
  var cssT = Math.round(tileY * scaleY);
  var cssR = Math.round((tileX + tileW) * scaleX) + 1;
  var cssB = Math.round((tileY + tileH) * scaleY) + 1;
  var cssW = cssR - cssL;
  var cssH = cssB - cssT;

  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';

  // S93 FIX v2 (Session 93 part 4) — edge-tile aspect ratio bug:
  //   Tile images on R2 are always _TILE_SIZE x _TILE_SIZE (512x512), but for
  //   edge tiles (last column when level.width % 512 != 0, or last row when
  //   level.height % 512 != 0), only the top-left (tileW x tileH) region
  //   contains actual drawing content. The remainder is white padding added
  //   by the server's sharp.extend() call.
  //
  //   Fix: for EDGE tiles only, render the <img> at full _TILE_SIZE-scaled
  //   dimensions and use clip-path:inset() to mask off the padded portion.
  //   For interior tiles (tileW===tileH===_TILE_SIZE), use the simple
  //   cssW x cssH sizing that worked before S93.
  //
  //   S93 part 1 (commit df5b19ae) applied clip-path unconditionally, which
  //   produced NEGATIVE inset values for interior tiles at L3 (where cssR
  //   has a +1 pad for gap-free abutment). Safari/Chrome treated that as
  //   "clip everything" on pages 1 & 2 specifically, making L3 drawing
  //   appear completely black. Fixed here.
  var isEdgeTile = (tileW < _TILE_SIZE) || (tileH < _TILE_SIZE);
  // S94 — tile fade-in polish. Tiles start at opacity 0 and the transition
  // fades them to 1 on append. Kills the visible "pop-in" and grid-of-tiles
  // shimmer that was previously visible when zooming or switching pages.
  // 180ms ease-out matches Google Maps' tile transition timing; shorter
  // feels abrupt, longer feels sluggish. Cache-hit tiles don't go through
  // this code path (they're already in the DOM), so no perceived latency
  // added on repeat views.
  var fadeIn = 'opacity:0;transition:opacity 180ms ease-out;will-change:opacity;';
  var cssText;
  if (isEdgeTile) {
    var fullCssW = Math.round(_TILE_SIZE * scaleX);
    var fullCssH = Math.round(_TILE_SIZE * scaleY);
    // Clamp at 0 so rounding never produces a negative inset (which some
    // browsers treat as full-hide rather than "no clip").
    var clipR = Math.max(0, fullCssW - cssW);
    var clipB = Math.max(0, fullCssH - cssH);
    cssText =
      'position:absolute;left:' + cssL + 'px;top:' + cssT + 'px;' +
      'width:' + fullCssW + 'px;height:' + fullCssH + 'px;' +
      'clip-path:inset(0 ' + clipR + 'px ' + clipB + 'px 0);' +
      '-webkit-clip-path:inset(0 ' + clipR + 'px ' + clipB + 'px 0);' +
      'image-rendering:auto;pointer-events:none;' + fadeIn;
  } else {
    // Interior tile: image content fills the full 512x512 source exactly,
    // so simple sizing is both correct and clip-path-free.
    cssText =
      'position:absolute;left:' + cssL + 'px;top:' + cssT + 'px;' +
      'width:' + cssW + 'px;height:' + cssH + 'px;' +
      'image-rendering:auto;pointer-events:none;' + fadeIn;
  }
  img.style.cssText = cssText;

  var drawingIdAtRequest = _drawingId;
  img.onload = function() {
    delete _inflight[key];
    if (!_active || _drawingId !== drawingIdAtRequest) {
      img.src = '';
      _pumpQueue();
      return;
    }
    var finish = function() {
      if (!_active || _drawingId !== drawingIdAtRequest) { img.src = ''; _pumpQueue(); return; }
      _tiles[key] = { img: img, level: req.level };
      _tileOrder.push(key);
      _tileCount++;
      var curLayer = document.getElementById('dv-tiles-layer');
      if (curLayer && curLayer.parentNode) {
        curLayer.appendChild(img);
        // S94 — trigger the fade-in. RAF ensures the browser commits the
        // initial opacity:0 from cssText BEFORE we set opacity:1, so the
        // transition actually animates. Without RAF, both styles land in
        // the same frame and the transition gets skipped (straight pop-in).
        requestAnimationFrame(function() { img.style.opacity = '1'; });
      }
      _evictExcess(curLayer);
      _pumpQueue();
    };
    if (img.decode) img.decode().then(finish, finish); else finish();
  };
  img.onerror = function() {
    delete _inflight[key];
    _dbgEvent('err ' + key);
    _pumpQueue();
  };
  img.src = url;
}

// ── Render loop ────────────────────────────────────────────────────────────
function _renderVisible() {
  if (!_active || _paused || !_pageInfo) return;
  _dbg_renderCount++;

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
  if (levelIdx < 0) return;
  var lvl = _pageInfo.levels[levelIdx];
  if (!lvl) return;
  _dbgEvent('L' + levelIdx + '@' + scale.toFixed(2));

  // Drop queued requests from other levels — they're no longer relevant.
  _cancelPendingExceptLevel(levelIdx);

  // S92 FIX: purge tiles from ALL other levels from cache + DOM. Without
  // this, tiles from every level the user has visited accumulate stacked
  // on top of each other. Lower-level tiles painting over higher-level
  // ones caused the "wrong colors at zoom-out" bug — the drawing you see
  // is the top of a multi-level sandwich, not a clean level. Keep only
  // the active level; re-fetch on zoom back is cheap (immutable CDN cache).
  var keysToDrop = [];
  for (var tk in _tiles) {
    if (!Object.prototype.hasOwnProperty.call(_tiles, tk)) continue;
    if (_tiles[tk].level !== levelIdx) keysToDrop.push(tk);
  }
  // S95: on iOS, skip the S94 fade-out. During rapid zoom, the 220ms delay
  // keeps old-level tile <img>s alive in the DOM (and WebKit's image decode
  // cache) while new-level tiles are already loading, resulting in up to
  // 95+ decoded tile bitmaps stacked momentarily. Repeated zoom cycles
  // build up pressure until the page process is Jetsam-killed. Log-confirmed
  // on iPad iOS 16.3 with zoom sequences of 3-6 transitions in <1s.
  // Desktop/Android keep the smooth crossfade.
  var _iosNoFade = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                   (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  for (var ki = 0; ki < keysToDrop.length; ki++) {
    var dk = keysToDrop[ki];
    var dt = _tiles[dk];
    if (dt && dt.img) {
      if (_iosNoFade) {
        // Immediate removal — visual snap, no memory lingering
        if (dt.img.parentNode) dt.img.parentNode.removeChild(dt.img);
        dt.img.src = '';
      } else {
        // S94 — fade OUT before remove. The 180ms opacity transition (already
        // baked into the img's inline style at creation time) runs in parallel
        // with the new-level tiles fading IN, producing a smooth crossfade at
        // level boundaries instead of the harsh "pop to backdrop" gap that
        // looked like tiles were shifting. 220ms removal delay > 180ms fade
        // gives the transition a full tick of headroom to complete before
        // the img is yanked.
        (function(el) {
          el.style.opacity = '0';
          setTimeout(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
            el.src = '';
          }, 220);
        })(dt.img);
      }
    }
    delete _tiles[dk];
    _tileCount--;
    var oi = _tileOrder.indexOf(dk);
    if (oi >= 0) _tileOrder.splice(oi, 1);
  }

  // Visible draw-space rectangle, expanded by 1 tile worth of margin so pan
  // has pre-fetched edges. Margin is in level pixels, converted to drawing
  // pixels.
  var visX0 = Math.max(0, -panX / scale);
  var visY0 = Math.max(0, -panY / scale);
  var visX1 = Math.min(_drawW, (areaW - panX) / scale);
  var visY1 = Math.min(_drawH, (areaH - panY) / scale);

  var d2lX = lvl.width / _drawW;
  var d2lY = lvl.height / _drawH;
  var lvlX0 = visX0 * d2lX;
  var lvlY0 = visY0 * d2lY;
  var lvlX1 = visX1 * d2lX;
  var lvlY1 = visY1 * d2lY;

  var colMin = Math.max(0, Math.floor(lvlX0 / _TILE_SIZE) - 1);
  var colMax = Math.min(lvl.cols - 1, Math.ceil(lvlX1 / _TILE_SIZE));
  var rowMin = Math.max(0, Math.floor(lvlY0 / _TILE_SIZE) - 1);
  var rowMax = Math.min(lvl.rows - 1, Math.ceil(lvlY1 / _TILE_SIZE));

  // First pass: enqueue missing, touch cached.
  for (var col = colMin; col <= colMax; col++) {
    for (var row = rowMin; row <= rowMax; row++) {
      var key = _tileKey(levelIdx, col, row);
      if (_tiles[key]) { _touch(key); continue; }
      if (_inflight[key]) continue;
      // Already queued?
      var queued = false;
      for (var q = 0; q < _pending.length; q++) {
        if (_pending[q].key === key) { queued = true; break; }
      }
      if (queued) continue;
      _pending.push({ key: key, level: levelIdx, col: col, row: row, lvl: lvl });
    }
  }

  _pumpQueue();
}

function scheduleRender() {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(_renderVisible, 60);
}

// ── Open / close ───────────────────────────────────────────────────────────
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

      // Backdrop (dv-image) — ALWAYS visible. Safety net if tiles fail.
      // S95: on touch devices (iPad/iPhone), loading the full-resolution source
      // URL here (e.g. 6144×4096 PNG) decodes to ~100 MB bitmap — which, on top
      // of the markup canvases and tile images, crosses the iOS WebKit
      // per-page memory ceiling and triggers a Jetsam process kill. Skip the
      // backdrop assignment entirely on touch — if tiles fail to load the user
      // sees a blank viewer with the "loading tile" chrome still in place.
      // Pin coordinate math has been updated (see viewer.js _getDrawingNatural*)
      // to source dimensions from TiledPdf.getDimensions() instead of
      // dv-image.naturalWidth, so skipping the backdrop is coordinate-safe.
      var img = document.getElementById('dv-image');
      if (img) {
        var _isTouch = false;
        try { _isTouch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches; } catch(_){}
        if (_isTouch){
          // Blank the backdrop — releases any prior-drawing bitmap
          if (img.src && img.src !== 'about:blank'){
            try { img.src = ''; } catch(_){}
          }
        } else {
          // Desktop: preserve original safety-net behavior
          var jpegSrc = d.r2Url || d.dataUrl || d.thumb || '';
          if (jpegSrc) {
            img.crossOrigin = 'anonymous';
            img.style.display = 'block';
            if (img.src !== jpegSrc) img.src = jpegSrc;
          }
        }
      }

      var wrap = document.getElementById('dv-img-wrap');
      var oldLayer = document.getElementById('dv-tiles-layer');
      if (oldLayer && oldLayer.parentNode) oldLayer.parentNode.removeChild(oldLayer);

      var layer = document.createElement('div');
      layer.id = 'dv-tiles-layer';
      layer.style.cssText =
        'position:absolute;top:0;left:0;width:' + _drawW + 'px;height:' + _drawH +
        'px;overflow:hidden;';
      var mc = document.getElementById('markup-canvas');
      if (wrap && mc) wrap.insertBefore(layer, mc);
      else if (wrap) wrap.appendChild(layer);

      _active = true;
      if (_cfg.hideLoading) _cfg.hideLoading();
      if (_cfg.onReady) _cfg.onReady({ drawW: _drawW, drawH: _drawH });

      _renderVisible();

      // Mobile second-pass (layout may not have settled on first render).
      if (window.innerWidth <= 700) {
        setTimeout(function() {
          if (_cfg.onReady) _cfg.onReady({ drawW: _drawW, drawH: _drawH });
          _renderVisible();
        }, 200);
      }

      _dbg('Server tiles opened: ' + _manifest.drawingId +
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
  if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }

  var layer = document.getElementById('dv-tiles-layer');
  for (var k in _tiles) {
    if (!Object.prototype.hasOwnProperty.call(_tiles, k)) continue;
    var t = _tiles[k];
    if (t && t.img) t.img.src = '';
  }
  _tiles = {};
  _inflight = {};
  _pending = [];
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
