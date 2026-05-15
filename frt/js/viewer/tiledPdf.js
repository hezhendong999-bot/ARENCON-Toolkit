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

import { deviceMaxPixels } from '../shared/deviceBudget.js';

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

// S99 prefetch candidate — tracks which next-level tiles have already had
// a warm-cache fetch issued this session. Persists across level changes so
// we don't re-fetch the same URLs. Cleared on _close_internal.
var _s99PrefetchIssued = {};

// S113 Push 2: iOS detection vars retired alongside iOS support. Tile pool
// is now sized for the production target — desktop and Android tablets.
// At ~80 kB per WebP tile + decode overhead, 800 tiles ≈ 200 MB, well
// within budget on both platforms. Larger cache keeps old-level tiles
// resident so a fast zoom-in/out doesn't expose white background while
// new tiles fetch (the L4 flash on zoom-in symptom).
var _MAX_TILES = 800;
var _MAX_CONCURRENT = 6;
var _TILE_SIZE = 512;

// ── S99 DIAGNOSTIC TOGGLE ──────────────────────────────────────────────────
// Per S99 handoff rule: DO NOT push theory-based rendering fixes. Each
// candidate gets wired behind a URL param so Mark can A/B test on-device
// without redeploying. Default (no param): identical to current production
// (S97 baseline rendering chain). No candidate code runs unless opted-in.
//
// Activation:   ?s99test=<name>        or   ?s99test=<name>-<amount>
// Examples:     ?s99test=overlap       (default 4 level-px)
//               ?s99test=overlap-8     (8 level-px overlap)
//               ?s99test=fastfade      (default 50ms fade)
//               ?s99test=delaysrc      (default 400ms hold)
//               ?s99test=prefetch      (default 70% threshold)
//               ?s99test=off  or  (no param)  → production behavior
//
// Candidates wired:
//
//   TILE-GRID AT FIT ZOOM:
//     overlap   — extend interior tile cssR/cssB by N level-px so adjacent
//                 tiles visually overlap rather than butt edge-to-edge.
//                 Rationale: current +1 is drawing-px (sub-pixel at fit
//                 viewScale); level-px stays proportional.
//
//   LEVEL-TRANSITION FLASH (L2→L3, L3→L4):
//     fastfade  — shorten new-tile fade-in from 180ms → Nms AND old-tile
//                 setTimeout from 220ms → (N+20)ms. Default 50ms.
//                 Rationale: flash may BE the fade-out animation, not a
//                 true gap. L4 safe: touches opacity DURATION only.
//     delaysrc  — skip fade-out entirely, hold old tiles at opacity 1 for
//                 N ms then snap-remove. Default 400ms. Critical diff vs
//                 S98c: opacity=1 HOLD (no animation extending 180ms fade).
//     prefetch  — when viewScale within N% of next-level threshold,
//                 pre-enqueue next-level visible tiles. Default 70%.
//                 New-level tiles already cached when transition fires.
//
//   TILE-GRID SEAM AT FRACTIONAL ZOOM (S112):
//     canvas    — replace per-tile <img> elements with one <canvas> per
//                 active level. Tile data is drawn via ctx.drawImage at
//                 native level coordinates; the browser does ONE
//                 fractional CSS scale of the whole canvas, so there is
//                 no per-tile sub-pixel rounding and no inter-tile
//                 compositing gap. Eliminates the grey-grid artifact at
//                 L2/L3 fit zoom that overlap/snap couldn't fix from the
//                 <img> side. Trades per-tile fade-in animation for
//                 pixel-correctness. Memory cost: ~36 MB at L2 backing,
//                 ~100 MB at L3, ~400 MB at L4 (each only allocated when
//                 first tile lands and freed when LRU empties the level).
//                 PROMOTED TO DEFAULT in Push 1 for desktop and Android.
//                 Used as the default for desktop and Android.
//
//   ESCAPE HATCH (S112 Push 1):
//     img       — force the legacy per-tile <img> compositor regardless
//                 of platform default. Use this if a specific drawing
//                 shows a canvas-mode regression we missed in verification.
//                 Bookmarkable: append &s99test=img to any FRT URL.
//
// (S113 cleanup: ios-purge / iosres / no-pixi / nopixi toggles removed
//  along with all iOS support — see HANDOFF_SESSION_113.md.)
//
// One candidate active at a time — use URL to switch. Tested in isolation.
function _readS99Test() {
  try {
    if (typeof window === 'undefined') return null;
    var m = /[?&]s99test=([^&#]+)/.exec(window.location.search || '');
    if (!m) return null;
    var raw = decodeURIComponent(m[1]).toLowerCase();
    if (!raw || raw === 'off') return null;
    // Dash-parser: treat the dash as an amount-separator only when what
    // follows is purely numeric. Numeric-suffix toggles (overlap-8,
    // fastfade-50) still parse as expected because their suffixes ARE
    // pure digits. Hyphenated names that ever existed (now removed in
    // S113) used to be passed through intact thanks to this guard.
    var name, amount;
    var lastDash = raw.lastIndexOf('-');
    if (lastDash > 0 && /^\d+$/.test(raw.slice(lastDash + 1))) {
      name = raw.slice(0, lastDash);
      amount = parseInt(raw.slice(lastDash + 1), 10);
      if (isNaN(amount) || amount < 0 || amount > 1024) {
        // Treat malformed amount as no-amount; keep full name
        name = raw;
        amount = null;
      }
    } else {
      name = raw;
      amount = null;
    }
    return { name: name, amount: amount, raw: raw };
  } catch (_e) { return null; }
}
var _S99_TEST = _readS99Test();
if (_S99_TEST) {
  try {
    console.log('[TiledPdf] S99 test mode ACTIVE: ' + _S99_TEST.raw +
      ' (name=' + _S99_TEST.name +
      ', amount=' + (_S99_TEST.amount == null ? 'default' : _S99_TEST.amount) + ')');
  } catch (_e) {}
}

// Canvas-compositor mode is the unconditional DEFAULT (S113 cleanup —
// iOS removed; the Jetsam gate that kept canvas off on iPad/iPhone is no
// longer needed). One opt-out: `?s99test=img` forces the legacy per-tile
// <img> compositor for any drawing where a canvas-mode regression is
// suspected.
//
// URL toggle interactions:
//   ?s99test=img      → force canvas OFF (explicit escape hatch)
//   no toggle         → canvas ON
var _S99_CANVAS;
if (_S99_TEST) {
  // Explicit toggle: only `img` is a recognized opt-out. Anything else
  // (any unknown s99test value) is treated as opt-out so a stale URL
  // never silently changes rendering mode.
  _S99_CANVAS = (_S99_TEST.name !== 'img');
} else {
  _S99_CANVAS = true;
}

// S112: level -> { canvas, ctx, lvl, tilesPainted }. Populated lazily in
// canvas mode by _getOrCreateLevelCanvas. Empty in img mode.
// S132: each entry also carries the viewport WINDOW it covers — winX/winY
// (origin in native level px), winW/winH, colMin..rowMax (tile span) and
// `windowed` (false = whole-sheet, identical to pre-S132).
var _levelCanvases = {};

// S132 viewport-windowed level canvas — level -> window plan computed by
// _renderVisible (which holds the view-state). Consumed by
// _getOrCreateLevelCanvas at lazy-create time. On under-budget levels the
// plan is the whole sheet, so the canvas is created exactly as pre-S132.
var _levelWindowPlan = {};

// ── S132 on-tablet window diagnostic ──────────────────────────────────────
// The field tablets run in a TWA shell with NO DevTools console. This is a
// tiny on-screen readout (top-left) of the live level-canvas window state,
// gated behind ?wininfo=1, so windowed-canvas behaviour can be verified
// on-device. Zero cost when the param is absent (one boolean check).
var _dbgWinInfo = (function () {
  try {
    if (typeof window === 'undefined') return false;
    return /[?&]wininfo=1\b/.test(window.location.search || '');
  } catch (_e) { return false; }
})();
// Count of re-window events since the current drawing opened. A fast-climbing
// counter during a zoom/pan gesture = the window is thrashing (the lag).
var _rewindowCount = 0;

function _updateWinInfoPanel(levelIdx, scale, visCols, visRows) {
  if (!_dbgWinInfo || typeof document === 'undefined') return;
  var el = document.getElementById('s132-wininfo');
  if (!el) {
    if (!document.body) return;
    el = document.createElement('div');
    el.id = 's132-wininfo';
    el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:99999;' +
      'background:rgba(20,20,20,0.86);color:#fff;padding:6px 9px;' +
      'font:600 11px/1.45 monospace;border-radius:4px;white-space:pre;' +
      'pointer-events:none;max-width:62vw;box-shadow:0 1px 4px rgba(0,0,0,0.4);';
    document.body.appendChild(el);
  }
  var e = _levelCanvases[levelIdx];
  var lines = [];
  lines.push('L' + levelIdx + '   scale ' + (scale != null ? scale.toFixed(3) : '?'));
  lines.push('visible: ' + visCols + 'x' + visRows + ' tiles');
  lines.push('rewindows: ' + _rewindowCount);
  if (e) {
    var bw = e.canvas.width, bh = e.canvas.height;
    var winCols = e.colMax - e.colMin + 1, winRows = e.rowMax - e.rowMin + 1;
    lines.push('windowed: ' + (e.windowed ? 'YES' : 'no (whole sheet)'));
    lines.push('window: ' + winCols + 'x' + winRows + ' tiles');
    lines.push('backing: ' + bw + 'x' + bh + ' = ' + (bw * bh / 1e6).toFixed(1) + ' MP');
    lines.push('bufScale: ' + (e.bufScale != null ? e.bufScale.toFixed(3) : '?'));
    lines.push('tiles painted: ' + e.tilesPainted);
  } else {
    lines.push('(no level canvas yet)');
  }
  el.textContent = lines.join('\n');
}

// Show a small, unobtrusive bottom-right indicator when any S99 test is
// active, so Mark visually confirms he's not on baseline. Appended once on
// first _dbg-safe chance; removed never (lives with page).
function _mountS99Banner() {
  if (!_S99_TEST) return;
  if (typeof document === 'undefined') return;
  if (document.getElementById('s99-test-banner')) return;
  var body = document.body;
  if (!body) { setTimeout(_mountS99Banner, 200); return; }
  var el = document.createElement('div');
  el.id = 's99-test-banner';
  el.textContent = 'S99 test: ' + _S99_TEST.raw;
  el.style.cssText =
    'position:fixed;bottom:8px;right:8px;z-index:99999;' +
    'background:#9C2742;color:#fff;padding:3px 8px;' +
    'font:600 10px/1.2 Calibri,sans-serif;border-radius:3px;' +
    'pointer-events:none;opacity:0.85;box-shadow:0 1px 3px rgba(0,0,0,0.3);';
  body.appendChild(el);
}
if (_S99_TEST) {
  if (typeof document !== 'undefined' && document.readyState !== 'loading') {
    _mountS99Banner();
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', _mountS99Banner);
  }
}

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
    if (/[?&]dbg=1\b/.test(window.location.search || '')) {
      // Persist URL activation so dbg survives Hub re-launches and home-screen taps.
      try { localStorage.setItem('_frtDbg', '1'); } catch (_e) {}
      return true;
    }
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

  // S97: lifecycle event peek + clear. Dumps the _frtS97LifeRing buffer
  // (recorded at every open/close/level-change/purge) to console AND copies
  // it to the clipboard as a formatted plain-text block, same way the crash
  // banner Copy Log button works.
  window._frtLifePeek = function () {
    try {
      var ring = JSON.parse(localStorage.getItem('_frtS97LifeRing') || '[]');
      if (!ring.length) { console.log('[S97 LIFE] ring empty'); return ring; }
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      var t0 = ring[0].t;
      var lines = ['=== ARENCON FRT — S97 LIFE events (' + ring.length + ') ==='];
      lines.push('Captured: ' + new Date().toISOString());
      lines.push('UA: ' + navigator.userAgent);
      lines.push('Viewport: ' + window.innerWidth + 'x' + window.innerHeight);
      lines.push('');
      lines.push('  rel_ms   event                     dwg                              pg  tiles  dom  pageMix                  extra');
      lines.push('  ' + '-'.repeat(140));
      ring.forEach(function (r) {
        var rel = String(r.t - t0).padStart(7, ' ');
        var tag = (r.tag || '').padEnd(25, ' ');
        var dwg = String(r.drawingId || '-').substring(0, 32).padEnd(32, ' ');
        var pg = String(r.pageNumber == null ? '-' : r.pageNumber).padStart(3, ' ');
        var tiles = String(r.tileCount).padStart(5, ' ');
        var dom = String(r.domChildren).padStart(4, ' ');
        var mix = JSON.stringify(r.domPageMix || {}).padEnd(24, ' ');
        var extra = r.extra ? JSON.stringify(r.extra) : '';
        lines.push('  ' + rel + '  ' + tag + ' ' + dwg + ' ' + pg + ' ' + tiles + ' ' + dom + ' ' + mix + '  ' + extra);
      });
      var out = lines.join('\n');
      console.log(out);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(out).then(function () {
          console.log('%c[S97 LIFE] copied to clipboard — paste in chat', 'color:#5F8068;font-weight:bold');
        }, function () {
          console.warn('[S97 LIFE] clipboard write failed — select the printed block and Ctrl+C');
        });
      }
      return ring;
    } catch (e) { console.error('[S97 LIFE] peek failed:', e); return null; }
  };

  window._frtLifeClear = function () {
    try {
      localStorage.removeItem('_frtS97LifeRing');
      console.log('[S97 LIFE] ring cleared');
    } catch (e) { console.error('[S97 LIFE] clear failed:', e); }
  };
}
var _dbg_el = null;
var _dbg_text_el = null;
var _dbg_lastEvents = [];
var _dbg_maxInflight = 0;
var _dbg_maxTiles = 0;
var _dbg_renderCount = 0;
var _dbg_lastLevel = null;

function _dbgEvent(s) {
  if (!_DBG_ENABLED) return;
  _dbg_lastEvents.push(s);
  if (_dbg_lastEvents.length > 5) _dbg_lastEvents.shift();
}

// S97 DIAG: lifecycle event logger. Records every page-switch, open, close,
// level-change, and DOM purge with a timestamp + DOM snapshot. Writes a
// separate ring buffer so fast back-to-back events aren't lost (unlike the
// periodic _dbgTick which only samples every 250ms). Buffer persists across
// crashes via localStorage, same as the main diag.
function _dbgLife(tag, extra) {
  if (!_DBG_ENABLED) return;
  try {
    var layer = document.getElementById('dv-tiles-layer');
    var wrap = document.getElementById('dv-img-wrap');
    var childCount = layer ? layer.children.length : 0;
    // Count tiles per page-N actually in the DOM right now
    var pageMix = {};
    if (layer) {
      var kids = layer.children;
      for (var i = 0; i < kids.length; i++) {
        var m = (kids[i].src || '').match(/\/page-(\d+)\//);
        if (m) pageMix[m[1]] = (pageMix[m[1]] || 0) + 1;
      }
    }
    var rec = {
      t: Date.now(),
      tag: tag,
      drawingId: _drawingId,
      pageNumber: _pageInfo ? _pageInfo.pageNumber : null,
      tileCount: _tileCount,
      domChildren: childCount,
      domPageMix: pageMix,
      wrapTransform: wrap ? (wrap.style.transform || '(none)') : '(no-wrap)',
      extra: extra || null
    };
    // Append to dedicated life-event ring (separate from tick ring)
    var ring = [];
    try { ring = JSON.parse(localStorage.getItem('_frtS97LifeRing') || '[]'); } catch (_) { ring = []; }
    ring.push(rec);
    while (ring.length > 80) ring.shift();
    try { localStorage.setItem('_frtS97LifeRing', JSON.stringify(ring)); } catch (_) {}
    // Also to console for live monitoring
    console.log('%c[LIFE]%c ' + tag +
      '  t=' + Date.now() +
      '  dwg=' + (_drawingId || '-') +
      '  pg=' + (rec.pageNumber || '-') +
      '  tiles=' + _tileCount +
      '  dom=' + childCount +
      '  mix=' + JSON.stringify(pageMix) +
      (extra ? '  ' + JSON.stringify(extra) : ''),
      'color:#9C2742;font-weight:bold', 'color:inherit');
  } catch (_err) { /* swallow */ }
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
      'padding:4px 6px;border-radius:4px;pointer-events:auto;' +
      'max-width:80vw;white-space:pre;text-align:left;';
    document.body.appendChild(_dbg_el);

    // S97: Copy button at the top of the green overlay. Clicking gathers BOTH
    // the periodic tick ring AND the lifecycle ring, formats them, and copies
    // to clipboard. Replaces the workaround of needing to call _frtLifePeek()
    // from console — which doesn't exist on iPad without DevTools.
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '\u2398 Copy log';
    copyBtn.style.cssText =
      'display:block;width:100%;margin:0 0 4px 0;background:#5F8068;color:#fff;' +
      'border:0;border-radius:3px;padding:4px 6px;font:600 10px/1.2 monospace;' +
      'cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
    copyBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      var lines = ['=== ARENCON FRT — S97 OVERLAY snapshot ==='];
      lines.push('Captured: ' + new Date().toISOString());
      lines.push('UA: ' + navigator.userAgent);
      lines.push('Viewport: ' + window.innerWidth + 'x' + window.innerHeight + '  DPR: ' + (window.devicePixelRatio || 1));
      lines.push('');
      lines.push('--- CURRENT LIVE STATE ---');
      lines.push((_dbg_text_el && _dbg_text_el.textContent) || '(no live state)');
      lines.push('');
      // Lifecycle ring
      try {
        var life = JSON.parse(localStorage.getItem('_frtS97LifeRing') || '[]');
        if (life.length) {
          lines.push('--- LIFECYCLE EVENTS (' + life.length + ') ---');
          var t0 = life[0].t;
          life.forEach(function (r) {
            var rel = String(r.t - t0).padStart(7, ' ');
            var tag = (r.tag || '').padEnd(25, ' ');
            var dwg = String(r.drawingId || '-').substring(0, 32).padEnd(32, ' ');
            var pg = String(r.pageNumber == null ? '-' : r.pageNumber).padStart(3, ' ');
            var tiles = String(r.tileCount).padStart(5, ' ');
            var dom = String(r.domChildren).padStart(4, ' ');
            var mix = JSON.stringify(r.domPageMix || {}).padEnd(20, ' ');
            var extra = r.extra ? JSON.stringify(r.extra) : '';
            lines.push('  +' + rel + 'ms ' + tag + ' ' + dwg + ' pg' + pg + ' ' + tiles + ' dom' + dom + ' ' + mix + '  ' + extra);
          });
        } else {
          lines.push('--- LIFECYCLE EVENTS: ring empty ---');
        }
      } catch (e) { lines.push('--- LIFECYCLE EVENTS: read failed (' + e.message + ') ---'); }
      lines.push('');
      // Tick ring (periodic samples)
      try {
        var ticks = JSON.parse(localStorage.getItem('_frtS97DbgRing') || '[]');
        if (ticks.length) {
          lines.push('--- PERIODIC SAMPLES (' + ticks.length + ', last 20) ---');
          var t1 = ticks[0].t;
          ticks.slice(-20).forEach(function (s) {
            var rel = String(s.t - t1).padStart(7, ' ');
            lines.push('  +' + rel + 'ms tiles ' + s.tiles + '/' + s.cap +
              ' (' + (s.byLevel || '-') + ') mk:' + s.mk + 'M gl:' + s.gl + 'M ~' + s.approxMB + 'MB s:' + s.scale);
          });
        }
      } catch (_) {}
      var out = lines.join('\n');
      console.log(out);
      var done = function (ok) {
        copyBtn.textContent = ok ? '\u2713 Copied' : '\u2715 Failed';
        copyBtn.style.background = ok ? '#4caf50' : '#666';
        setTimeout(function () {
          copyBtn.textContent = '\u2398 Copy log';
          copyBtn.style.background = '#5F8068';
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(out).then(function () { done(true); }, function () {
          // Textarea fallback
          try {
            var ta = document.createElement('textarea');
            ta.value = out;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (_) {}
            document.body.removeChild(ta);
            done(ok);
          } catch (_e) { done(false); }
        });
      } else {
        try {
          var ta2 = document.createElement('textarea');
          ta2.value = out;
          ta2.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
          document.body.appendChild(ta2);
          ta2.focus(); ta2.select();
          var ok2 = document.execCommand('copy');
          document.body.removeChild(ta2);
          done(ok2);
        } catch (_e) { done(false); }
      }
    });
    _dbg_el.appendChild(copyBtn);

    // The text area below the button — separate element so we can update it
    // without rebuilding the button each tick.
    _dbg_text_el = document.createElement('div');
    _dbg_text_el.style.cssText = 'pointer-events:none;';
    _dbg_el.appendChild(_dbg_text_el);
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

  _dbg_text_el.textContent =
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

  // S113 Push 9: S97 DIAG ring-buffer + post-crash banner deleted. Was never used.
}
if (_DBG_ENABLED && typeof window !== 'undefined') {
  setInterval(_dbgTick, 250);
}

// S97 DIAG: post-crash forensics banner. If the ring buffer was written in
// the last 120s (suggesting the previous load ended in a tab-reload, not a
// clean close) show a burgundy panel pinned to the BOTTOM of the screen
// (top-pinned blocked the FRT nav tabs). Has explicit Copy and Close buttons
// — no tap-to-dismiss (which was firing on accidental scrolls).
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
    if (tile) {
      if (_S99_CANVAS) {
        _evictTileFromCanvas(tile);
      } else if (tile.img) {
        if (layer && tile.img.parentNode === layer) layer.removeChild(tile.img);
        tile.img.src = '';
      }
    }
    delete _tiles[oldest];
    _tileCount--;
  }
}

// S112 canvas mode helpers ────────────────────────────────────────────────
//
// Architecture: one <canvas id="dv-tiles-canvas-LN"> per active level.
// Backing buffer sized to native level pixels (e.g. 3584×2560 for L2 on
// the test fixture). CSS sized to _drawW × _drawH so it overlays the
// drawing area exactly. Tiles draw at native level coordinates with
// ctx.drawImage — the browser does ONE fractional CSS scale of the whole
// canvas, so no per-tile sub-pixel gaps form. Eliminates the L2/L3 grid
// seam at fit zoom that no <img>-side fix could solve.
//
// LRU eviction clears the tile's rect on the level canvas. When all
// painted tiles for a level are gone, the canvas is removed from the DOM
// and its backing buffer is released (set width=0, height=0).

// S132 viewport-windowed level canvas ─────────────────────────────────────
//
// THE PROBLEM (post-S131): S131 capped the level-canvas backing store at
// deviceMaxPixels() by DOWNSCALING the whole sheet (bufScale < 1). That
// stopped the "Aw snap" crash but, on a tablet, L4 (≈101 MP native) was
// squeezed into a 12 MP buffer — ~35% linear resolution — so the deepest
// zoom was noticeably blurry. You cannot brute-force L4 sharpness through
// one global number.
//
// THE FIX: don't downscale the whole sheet — size the backing store to the
// VISIBLE WINDOW. The tablet only ever displays a small crop at L4 zoom, so
// a window covering "visible tiles + generous margin" fits the SAME 12 MP
// budget while rendering that crop at bufScale 1.0 — fully crisp. When the
// user pans past the window, the canvas is re-windowed (see
// _rewindowLevelCanvas) — the overlapping pixels are blitted across so the
// move is seamless, and only the newly-exposed strip is re-fetched.
//
// SAFETY: _computeWindow returns `windowed:false` (the whole sheet) whenever
// the level already fits the device budget. That covers ALL desktop levels
// and the tablet's low levels — for those the canvas is created, positioned
// and composited byte-for-byte as pre-S132. Windowed code only runs on the
// over-budget levels (tablet L3/L4) — exactly where the blur was.
//
// Per-level peak memory is unchanged from S131 (still ≤ deviceMaxPixels()).
// A re-window briefly holds the old + new canvas at once (both ≤ budget)
// for the few synchronous statements of the blit — a transient, not the
// sustained pressure that caused the crash.

// Compute the window a level canvas should cover, given the visible
// level-space rect. Returns { windowed, bufScale, winX, winY, winW, winH,
// colMin, colMax, rowMin, rowMax }. Window edges are tile-aligned so the
// tile span and the blit math stay exact.
function _computeWindow(lvl, lvlX0, lvlY0, lvlX1, lvlY1) {
  var T = _TILE_SIZE;
  var fullCols = lvl.cols | 0, fullRows = lvl.rows | 0;
  var budgetPx = deviceMaxPixels();
  var nativePx = lvl.width * lvl.height;

  // Under budget → whole sheet. Identical to pre-S132 in every respect.
  if (nativePx <= budgetPx) {
    return {
      windowed: false, bufScale: 1,
      winX: 0, winY: 0, winW: lvl.width, winH: lvl.height,
      colMin: 0, colMax: fullCols - 1, rowMin: 0, rowMax: fullRows - 1
    };
  }

  // Visible tile span (clamped to the sheet).
  var vc0 = Math.max(0, Math.min(fullCols - 1, Math.floor(lvlX0 / T)));
  var vc1 = Math.max(0, Math.min(fullCols - 1, Math.floor((lvlX1 - 1e-3) / T)));
  var vr0 = Math.max(0, Math.min(fullRows - 1, Math.floor(lvlY0 / T)));
  var vr1 = Math.max(0, Math.min(fullRows - 1, Math.floor((lvlY1 - 1e-3) / T)));
  var visCols = vc1 - vc0 + 1, visRows = vr1 - vr0 + 1;

  // How many whole 512px tiles the device budget affords.
  var maxTiles = Math.max(1, Math.floor(budgetPx / (T * T)));

  // Defensive: if the visible span ALONE exceeds the tile budget (would need
  // an over-budget level shown at low zoom — unusual, but never trust it
  // won't happen), clamp the window to the visible span and downscale its
  // buffer to fit. Soft but safe — never crashes.
  if (visCols * visRows > maxTiles) {
    var cX = vc0 * T, cY = vr0 * T;
    var cW = Math.min(lvl.width, (vc1 + 1) * T) - cX;
    var cH = Math.min(lvl.height, (vr1 + 1) * T) - cY;
    var clampScale = Math.min(1, Math.sqrt(budgetPx / (cW * cH)));
    return {
      windowed: true, bufScale: clampScale,
      winX: cX, winY: cY, winW: cW, winH: cH,
      colMin: vc0, colMax: vc1, rowMin: vr0, rowMax: vr1
    };
  }

  // Grow the window symmetrically around the visible span — every extra
  // tile of margin is pan room before the next re-window — capped by the
  // tile budget and the sheet bounds.
  var winCols = visCols, winRows = visRows;
  var guard = fullCols + fullRows + 4;
  while (guard-- > 0) {
    var grew = false;
    if (winCols < fullCols && (winCols + 1) * winRows <= maxTiles) { winCols++; grew = true; }
    if (winRows < fullRows && winCols * (winRows + 1) <= maxTiles) { winRows++; grew = true; }
    if (!grew) break;
  }

  // Centre on the visible span, then clamp the window inside the sheet.
  var col0 = vc0 - Math.floor((winCols - visCols) / 2);
  var row0 = vr0 - Math.floor((winRows - visRows) / 2);
  col0 = Math.max(0, Math.min(fullCols - winCols, col0));
  row0 = Math.max(0, Math.min(fullRows - winRows, row0));
  var col1 = col0 + winCols - 1;
  var row1 = row0 + winRows - 1;

  var winX = col0 * T, winY = row0 * T;
  var winW = Math.min(lvl.width, (col1 + 1) * T) - winX;
  var winH = Math.min(lvl.height, (row1 + 1) * T) - winY;
  // winW*winH ≤ winCols*winRows*T*T ≤ maxTiles*T*T ≤ budgetPx — buffer is
  // guaranteed within budget.
  return {
    windowed: true, bufScale: 1,
    winX: winX, winY: winY, winW: winW, winH: winH,
    colMin: col0, colMax: col1, rowMin: row0, rowMax: row1
  };
}

// True when the visible tile span has come within 1 tile of a window edge
// that still has sheet beyond it. The 1-tile hysteresis band stops the
// window re-centring on every tile of pan.
function _windowNeedsMove(e, vc0, vc1, vr0, vr1, fullCols, fullRows) {
  if (vc0 <= e.colMin + 1 && e.colMin > 0) return true;
  if (vc1 >= e.colMax - 1 && e.colMax < fullCols - 1) return true;
  if (vr0 <= e.rowMin + 1 && e.rowMin > 0) return true;
  if (vr1 >= e.rowMax - 1 && e.rowMax < fullRows - 1) return true;
  return false;
}

// Re-window an existing windowed level canvas: allocate the new window,
// blit the overlapping region across (so the move is seamless — no flash,
// no white gap), swap the DOM node, and reconcile _tiles so records that
// fell outside the new window get re-enqueued by _renderVisible.
function _rewindowLevelCanvas(level, lvl, nw) {
  var old = _levelCanvases[level];
  if (!old) return;
  var layer = document.getElementById('dv-tiles-layer');
  if (!layer) return;

  var nc = document.createElement('canvas');
  var ns = nw.bufScale || 1;
  nc.width = Math.max(1, Math.round(nw.winW * ns));
  nc.height = Math.max(1, Math.round(nw.winH * ns));
  nc.id = old.canvas.id;
  var d2lX = lvl.width / _drawW, d2lY = lvl.height / _drawH;
  nc.style.cssText =
    'position:absolute;' +
    'left:' + (nw.winX / d2lX) + 'px;top:' + (nw.winY / d2lY) + 'px;' +
    'width:' + (nw.winW / d2lX) + 'px;height:' + (nw.winH / d2lY) + 'px;' +
    'z-index:' + level + ';' +
    'pointer-events:none;image-rendering:auto;';
  var nctx;
  try {
    nctx = nc.getContext('2d', { alpha: true, willReadFrequently: false });
  } catch (_e) {
    nctx = nc.getContext('2d');
  }
  if (!nctx) return; // bail — keep the old canvas intact

  // Blit the overlap (native level px → backing px on each side).
  var ox0 = Math.max(old.winX, nw.winX);
  var oy0 = Math.max(old.winY, nw.winY);
  var ox1 = Math.min(old.winX + old.winW, nw.winX + nw.winW);
  var oy1 = Math.min(old.winY + old.winH, nw.winY + nw.winH);
  if (ox1 > ox0 && oy1 > oy0) {
    var os = old.bufScale || 1;
    try {
      nctx.drawImage(
        old.canvas,
        (ox0 - old.winX) * os, (oy0 - old.winY) * os,
        (ox1 - ox0) * os, (oy1 - oy0) * os,
        (ox0 - nw.winX) * ns, (oy0 - nw.winY) * ns,
        (ox1 - ox0) * ns, (oy1 - oy0) * ns
      );
    } catch (_e) { /* broken source — fall through, strip re-fetches */ }
  }

  // Swap DOM + release the old backing buffer.
  if (old.canvas.parentNode) old.canvas.parentNode.removeChild(old.canvas);
  try { old.canvas.width = 0; old.canvas.height = 0; } catch (_) {}
  layer.appendChild(nc);

  // Reconcile _tiles: a record for this level is only still valid if it sat
  // inside BOTH windows (→ it was blitted across). Anything else is dropped
  // so _renderVisible re-enqueues it when it next becomes visible.
  var painted = 0;
  for (var k in _tiles) {
    if (!Object.prototype.hasOwnProperty.call(_tiles, k)) continue;
    var t = _tiles[k];
    if (t.level !== level) continue;
    var inNew = (t.col >= nw.colMin && t.col <= nw.colMax &&
                 t.row >= nw.rowMin && t.row <= nw.rowMax);
    var inOld = (t.col >= old.colMin && t.col <= old.colMax &&
                 t.row >= old.rowMin && t.row <= old.rowMax);
    if (inNew && inOld) {
      painted++;
    } else {
      delete _tiles[k];
      var oi = _tileOrder.indexOf(k);
      if (oi >= 0) _tileOrder.splice(oi, 1);
      _tileCount--;
    }
  }

  _levelCanvases[level] = {
    canvas: nc, ctx: nctx, lvl: lvl, tilesPainted: painted,
    bufScale: ns, windowed: nw.windowed,
    winX: nw.winX, winY: nw.winY, winW: nw.winW, winH: nw.winH,
    colMin: nw.colMin, colMax: nw.colMax, rowMin: nw.rowMin, rowMax: nw.rowMax
  };
  _levelWindowPlan[level] = nw;
  _rewindowCount++;
}

function _getOrCreateLevelCanvas(level, lvl) {
  var entry = _levelCanvases[level];
  if (entry) return entry;
  var layer = document.getElementById('dv-tiles-layer');
  if (!layer) return null;

  // S132 — the window is planned by _renderVisible (it holds the
  // view-state). Fall back to the whole sheet if a tile fetch somehow lands
  // before the first _renderVisible — defensive only; on a budgeted level
  // _renderVisible always runs first and stashes a real window.
  var win = _levelWindowPlan[level];
  if (!win) {
    win = {
      windowed: false, bufScale: 1,
      winX: 0, winY: 0, winW: lvl.width, winH: lvl.height,
      colMin: 0, colMax: (lvl.cols | 0) - 1, rowMin: 0, rowMax: (lvl.rows | 0) - 1
    };
  }

  var c = document.createElement('canvas');
  var bufScale = win.bufScale || 1;
  c.width = Math.max(1, Math.round(win.winW * bufScale));
  c.height = Math.max(1, Math.round(win.winH * bufScale));
  c.id = 'dv-tiles-canvas-L' + level;
  if (win.windowed) {
    // Windowed: position + size the canvas to the window's drawing-space
    // rect. The level canvas's backing store is the window at bufScale 1.0
    // (full native resolution of the visible crop) — crisp.
    var d2lX = lvl.width / _drawW, d2lY = lvl.height / _drawH;
    c.style.cssText =
      'position:absolute;' +
      'left:' + (win.winX / d2lX) + 'px;top:' + (win.winY / d2lY) + 'px;' +
      'width:' + (win.winW / d2lX) + 'px;height:' + (win.winH / d2lY) + 'px;' +
      'z-index:' + level + ';' +
      'pointer-events:none;image-rendering:auto;';
  } else {
    // Whole sheet — byte-for-byte the pre-S132 cssText (left:0;top:0 spanning
    // the full drawing). One fractional CSS scale, no per-tile seams.
    c.style.cssText =
      'position:absolute;left:0;top:0;' +
      'width:' + _drawW + 'px;height:' + _drawH + 'px;' +
      'z-index:' + level + ';' +
      'pointer-events:none;image-rendering:auto;';
  }
  var ctx;
  try {
    ctx = c.getContext('2d', { alpha: true, willReadFrequently: false });
  } catch (_e) {
    ctx = c.getContext('2d');
  }
  if (!ctx) return null;
  layer.appendChild(c);
  entry = {
    canvas: c, ctx: ctx, lvl: lvl, tilesPainted: 0,
    bufScale: bufScale, windowed: win.windowed,
    winX: win.winX, winY: win.winY, winW: win.winW, winH: win.winH,
    colMin: win.colMin, colMax: win.colMax, rowMin: win.rowMin, rowMax: win.rowMax
  };
  _levelCanvases[level] = entry;
  return entry;
}

function _evictTileFromCanvas(tile) {
  var entry = _levelCanvases[tile.level];
  if (!entry) return;
  // S131 — coordinates are in native level pixels; multiply by the level
  // canvas's backing-buffer scale.
  // S132 — and subtract the canvas's window origin. winX/winY are 0 on
  // whole-sheet (under-budget) canvases, so this is identical to pre-S132
  // there. On a windowed canvas it maps the tile to its slot in the window.
  var s = entry.bufScale || 1;
  var winX = entry.winX || 0, winY = entry.winY || 0;
  var tx = (tile.col * _TILE_SIZE - winX) * s;
  var ty = (tile.row * _TILE_SIZE - winY) * s;
  // Clear only the actual content region. Edge tiles have tileW/tileH < 512.
  entry.ctx.clearRect(tx, ty, tile.tileW * s, tile.tileH * s);
  entry.tilesPainted--;
  if (entry.tilesPainted <= 0) {
    if (entry.canvas.parentNode) entry.canvas.parentNode.removeChild(entry.canvas);
    // Force backing-buffer release. Setting w/h to 0 is the canonical idiom.
    try { entry.canvas.width = 0; entry.canvas.height = 0; } catch(_) {}
    delete _levelCanvases[tile.level];
    delete _levelWindowPlan[tile.level];
  }
}

function _disposeAllLevelCanvases() {
  for (var lk in _levelCanvases) {
    if (!Object.prototype.hasOwnProperty.call(_levelCanvases, lk)) continue;
    var le = _levelCanvases[lk];
    if (le && le.canvas) {
      if (le.canvas.parentNode) le.canvas.parentNode.removeChild(le.canvas);
      try { le.canvas.width = 0; le.canvas.height = 0; } catch(_) {}
    }
  }
  _levelCanvases = {};
  _levelWindowPlan = {};
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

// S112 canvas-mode tile loader. Loads the WebP, decodes it, draws it onto
// the level canvas at native level coordinates, then releases the source
// image bitmap. The tile's "DOM presence" is the painted region on the
// level canvas — no per-tile <img> in the DOM, so no per-tile sub-pixel
// rounding, so no seams at fractional CSS scale.
function _startFetchCanvas(req, layer) {
  var key = req.key;
  _inflight[key] = true;

  var url = _tileUrl(req.level, req.col, req.row);
  if (!url) { delete _inflight[key]; return; }

  var lvl = req.lvl;
  var tileX = req.col * _TILE_SIZE;
  var tileY = req.row * _TILE_SIZE;
  var tileW = Math.min(_TILE_SIZE, lvl.width - tileX);
  var tileH = Math.min(_TILE_SIZE, lvl.height - tileY);
  if (tileW <= 0 || tileH <= 0) { delete _inflight[key]; _pumpQueue(); return; }

  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';

  var drawingIdAtRequest = _drawingId;
  img.onload = function() {
    delete _inflight[key];
    if (!_active || _drawingId !== drawingIdAtRequest) {
      img.src = '';
      _pumpQueue();
      return;
    }
    var finish = function() {
      if (!_active || _drawingId !== drawingIdAtRequest) {
        img.src = ''; _pumpQueue(); return;
      }
      var entry = _getOrCreateLevelCanvas(req.level, lvl);
      if (!entry) { img.src = ''; _pumpQueue(); return; }
      // S132 — the window may have moved (re-windowed) while this fetch was
      // in flight. If the tile is no longer inside the level canvas's
      // window, discard it — _renderVisible re-enqueues it if it is still
      // needed. `windowed` is false on whole-sheet canvases, so this guard
      // never engages there (identical to pre-S132).
      if (entry.windowed &&
          (req.col < entry.colMin || req.col > entry.colMax ||
           req.row < entry.rowMin || req.row > entry.rowMax)) {
        img.src = ''; _pumpQueue(); return;
      }
      // Source rect (0,0,tileW,tileH) clips the white-padded region of
      // edge tiles produced by sharp.extend() — same reason the <img> path
      // uses clip-path:inset() for edge tiles. Dest rect places it at the
      // tile's slot in the level canvas.
      // S131 — the SOURCE rect stays in native tile pixels (the decoded
      // WebP is always native res); the DEST rect is multiplied by the
      // level canvas's backing-buffer scale.
      // S132 — and offset by the canvas's window origin (winX/winY are 0 on
      // whole-sheet canvases → identical to pre-S132). (tileX+tileW-winX)*s
      // === c.width for the window's last column, so edge tiles still land
      // flush — no gap, no overflow.
      var s = entry.bufScale || 1;
      var winX = entry.winX || 0, winY = entry.winY || 0;
      try {
        entry.ctx.drawImage(img, 0, 0, tileW, tileH,
          (tileX - winX) * s, (tileY - winY) * s, tileW * s, tileH * s);
      } catch (_e) {
        // drawImage can throw on broken/blank decode; treat as load failure.
        img.src = ''; _pumpQueue(); return;
      }
      entry.tilesPainted++;
      _tiles[key] = {
        level: req.level, col: req.col, row: req.row,
        tileW: tileW, tileH: tileH
      };
      _tileOrder.push(key);
      _tileCount++;
      // Release the source bitmap immediately — tile data lives in the
      // canvas now. Saves the per-tile decoded-bitmap memory the <img>
      // path keeps alive for as long as the element is in DOM.
      img.src = '';
      _evictExcess(layer);
      _pumpQueue();
    };
    if (img.decode) img.decode().then(finish, finish); else finish();
  };
  img.onerror = function() {
    delete _inflight[key];
    var aborted = !img.src || img.src === window.location.href;
    if (_active && _drawingId === drawingIdAtRequest && !aborted) {
      _dbgEvent('err ' + key);
    }
    _pumpQueue();
  };
  img.src = url;
}

function _startFetch(req, layer) {
  if (_S99_CANVAS) return _startFetchCanvas(req, layer);
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

  // S99 candidate: `overlap` — extend interior tile right/bottom by N
  // level-pixels so adjacent tiles visually overlap (not butt edge-to-edge),
  // masking edge-antialiasing halos + sub-pixel gaps that form the visible
  // tile grid at fit zoom. Level-px (not drawing-px) because:
  //   (a) stretch ratio is then uniform across levels: overlap / 512,
  //       keeping L4 sharpness invariant;
  //   (b) scales naturally with viewScale — fit zoom picks low levels
  //       where level-px are mapped to many drawing-px, giving adequate
  //       screen-px overlap even when the drawing is scaled down.
  // Skipped on last col / last row (no seam to mask there) so edge-tile
  // clip-path math stays identical to baseline. Zero effect when
  // _S99_TEST is null (production default).
  var _s99ExtR = 0, _s99ExtB = 0;
  if (_S99_TEST && _S99_TEST.name === 'overlap') {
    var _s99Amt = (_S99_TEST.amount != null) ? _S99_TEST.amount : 4;
    if ((req.col + 1) < lvl.cols) _s99ExtR = _s99Amt;
    if ((req.row + 1) < lvl.rows) _s99ExtB = _s99Amt;
  }

  var cssR = Math.round((tileX + tileW + _s99ExtR) * scaleX) + 1;
  var cssB = Math.round((tileY + tileH + _s99ExtB) * scaleY) + 1;

  // S111c candidate: `snap` — eliminate the sub-pixel gap that produces the
  // visible tile-grid at fit zoom by computing each tile's left edge as the
  // exact same pixel as the previous tile's right edge.
  //
  // Why the existing `+1` cssR doesn't fully fix this: each tile rounds its
  // left and right edges independently, so on a 0.213x scale, tile (n)'s
  // right and tile (n+1)'s left can land on different sub-pixel positions.
  // Browser's bilinear interpolation at fractional scale shows the gap as
  // a 1-pixel grey grid line at every boundary.
  //
  // Fix: compute boundary positions globally. Tile (n+1).cssL =
  // Math.round((col+1) * TILE_SIZE * scaleX) — same formula tile (n) would
  // use for its right edge if we computed it that way. Both tiles agree on
  // the exact pixel where they meet. No gap. No overlap. No grid.
  if (_S99_TEST && _S99_TEST.name === 'snap') {
    cssR = Math.round((req.col + 1) * _TILE_SIZE * scaleX);
    cssB = Math.round((req.row + 1) * _TILE_SIZE * scaleY);
    // Clamp at level edge so last-row/last-col don't extend past the drawing.
    var maxR = Math.round(lvl.width * scaleX);
    var maxB = Math.round(lvl.height * scaleY);
    if (cssR > maxR) cssR = maxR;
    if (cssB > maxB) cssB = maxB;
  }

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
  // S99 candidate: `fastfade` — shorten the 180ms fade-in transition on
  // new tiles. Hypothesis: the "flash" at level boundaries may be the
  // fade-out animation itself (tiles visibly dimming then snapping away)
  // rather than a true tile-absent gap. Tighter duration → shorter visible
  // animation window. L4 safe: only changes transition DURATION, no change
  // to geometry, compositor properties, or which tiles load.
  var _s99FadeMs = 180;
  if (_S99_TEST && _S99_TEST.name === 'fastfade') {
    _s99FadeMs = (_S99_TEST.amount != null) ? _S99_TEST.amount : 50;
  }
  var fadeIn = 'opacity:0;transition:opacity ' + _s99FadeMs + 'ms ease-out;will-change:opacity;';
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
      'z-index:' + req.level + ';' +
      'image-rendering:auto;pointer-events:none;' + fadeIn;
  } else {
    // Interior tile: image content fills the full 512x512 source exactly,
    // so simple sizing is both correct and clip-path-free.
    // S111b: z-index by level (higher level = on top). With this, tiles
    // from previously-active levels can stay in DOM without painting over
    // the active level — fixes both the S92 wrong-colors-at-zoomout bug
    // AND the flash on zoom transitions, because old-level tiles remain
    // visible UNDER the active level.
    cssText =
      'position:absolute;left:' + cssL + 'px;top:' + cssT + 'px;' +
      'width:' + cssW + 'px;height:' + cssH + 'px;' +
      'z-index:' + req.level + ';' +
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
    // S98 — suppress "err" log for aborted loads (img.src='' during drawing
    // switch / level change / close). Only log real failures where the
    // drawing is still active.
    var aborted = !img.src || img.src === window.location.href;
    if (_active && _drawingId === drawingIdAtRequest && !aborted) {
      _dbgEvent('err ' + key);
    }
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

  // S97 DIAG: detect level changes vs same-level pans
  if (_dbg_lastLevel !== levelIdx) {
    _dbgLife('level-change', { from: _dbg_lastLevel, to: levelIdx, scale: +scale.toFixed(3) });
    _dbg_lastLevel = levelIdx;
  }

  // Drop queued requests from other levels — they're no longer relevant.
  _cancelPendingExceptLevel(levelIdx);

  // S92 FIX: purge tiles from ALL other levels from cache + DOM. Without
  // this, tiles from every level the user has visited accumulate stacked
  // on top of each other. Lower-level tiles painting over higher-level
  // ones caused the "wrong colors at zoom-out" bug — the drawing you see
  // is the top of a multi-level sandwich, not a clean level. Keep only
  // the active level; re-fetch on zoom back is cheap (immutable CDN cache).
  // S111b: REMOVED the eager purge:other-levels logic that was here.
  //
  // Why removed: that purge eagerly deleted ALL tiles from levels other
  // than the active one on every level change, regardless of cache fill.
  // Combined with the 1500ms delaysrc hold (S111), it tried to mask flash
  // by holding old tiles visible briefly, then deleting them. Mark still
  // saw flash on L3↔L4 transitions in field testing.
  //
  // The original reason for this purge (S92 comment): "Lower-level tiles
  // painting over higher-level ones caused the wrong-colors-at-zoom-out
  // bug." That root cause is now solved differently: each tile now has
  // z-index:levelIdx, so higher levels always paint on top of lower
  // levels regardless of DOM order. No multi-level stacking issue.
  //
  // With purge removed:
  //   - Old-level tiles stay in cache (LRU bounded by _MAX_TILES = 800)
  //   - On zoom-back, old tiles are instantly visible from cache (no flash)
  //   - On zoom-out expansion, new-level tiles paint over old-level tiles
  //     in the previously-visible area while filling newly-exposed edges
  //   - LRU eviction kicks in only when cache overflows (>800 tiles)
  //
  // Memory: ~800 tiles × ~80kB compressed + decode overhead ≈ 200MB max.
  // Within budget for desktop and Tab S7 (Mark's primary device).
  //
  // The previous decision tree (iOS snap-remove, fastfade, delaysrc) is
  // entirely bypassed. Nothing in this branch any more — just continue
  // to the visible-rect computation below.
  if (false) {
    // No-op block kept so any inline `_S99_TEST.name === 'baseline'/...`
    // toggles in URL params don't blow up; they'll just have no effect.
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

  // ── S132 viewport-windowed level canvas ────────────────────────────────
  // Plan / maintain the window the level canvas covers. _renderVisible is
  // the one place with the view-state, so the window decision lives here.
  //   • No canvas yet  → stash a freshly computed window for
  //                       _getOrCreateLevelCanvas to use at lazy-create.
  //   • Windowed canvas → re-window (seamless blit) only when the visible
  //                       span nears an edge AND the new window differs.
  //   • Whole-sheet canvas (under-budget level / desktop) → nothing to do;
  //                       _computeWindow would just return the whole sheet.
  var _le = _levelCanvases[levelIdx];
  if (!_le) {
    _levelWindowPlan[levelIdx] = _computeWindow(lvl, lvlX0, lvlY0, lvlX1, lvlY1);
  } else if (_le.windowed) {
    var _vc0 = Math.max(0, Math.min(lvl.cols - 1, Math.floor(lvlX0 / _TILE_SIZE)));
    var _vc1 = Math.max(0, Math.min(lvl.cols - 1, Math.floor((lvlX1 - 1e-3) / _TILE_SIZE)));
    var _vr0 = Math.max(0, Math.min(lvl.rows - 1, Math.floor(lvlY0 / _TILE_SIZE)));
    var _vr1 = Math.max(0, Math.min(lvl.rows - 1, Math.floor((lvlY1 - 1e-3) / _TILE_SIZE)));
    if (_windowNeedsMove(_le, _vc0, _vc1, _vr0, _vr1, lvl.cols, lvl.rows)) {
      var _nw = _computeWindow(lvl, lvlX0, lvlY0, lvlX1, lvlY1);
      if (_nw.windowed &&
          (_nw.colMin !== _le.colMin || _nw.colMax !== _le.colMax ||
           _nw.rowMin !== _le.rowMin || _nw.rowMax !== _le.rowMax)) {
        _rewindowLevelCanvas(levelIdx, lvl, _nw);
        _le = _levelCanvases[levelIdx];
      }
    }
  }

  var colMin = Math.max(0, Math.floor(lvlX0 / _TILE_SIZE) - 1);
  var colMax = Math.min(lvl.cols - 1, Math.ceil(lvlX1 / _TILE_SIZE));
  var rowMin = Math.max(0, Math.floor(lvlY0 / _TILE_SIZE) - 1);
  var rowMax = Math.min(lvl.rows - 1, Math.ceil(lvlY1 / _TILE_SIZE));

  // S132 — clamp enumeration to the level canvas's window so we never
  // enqueue a tile that has no slot on the canvas. Whole-sheet levels: the
  // window IS the sheet, so the clamp is a no-op (identical to pre-S132).
  var _aw = _le || _levelWindowPlan[levelIdx];
  if (_aw && _aw.windowed) {
    colMin = Math.max(colMin, _aw.colMin);
    colMax = Math.min(colMax, _aw.colMax);
    rowMin = Math.max(rowMin, _aw.rowMin);
    rowMax = Math.min(rowMax, _aw.rowMax);
  }

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

  // S99 candidate: `prefetch` — when current viewScale is within N% of the
  // scale that would trigger the NEXT level, warm the browser HTTP cache
  // with next-level visible tiles. On the actual level transition, the
  // `new Image()` loads hit cache and render with zero network latency →
  // no "loading new level" gap visible.
  //
  // Design note: we use fetch() to warm the SW/HTTP cache, NOT the _tiles
  // map. Prefetched tiles never enter the _tiles structure, never get
  // appended to the tile-layer DOM, and so are NOT affected by the
  // other-level purge (which would otherwise destroy them instantly).
  // Budget: up to 6 prefetches per render. Silent fail.
  if (_S99_TEST && _S99_TEST.name === 'prefetch') {
    var _pctThresh = (_S99_TEST.amount != null) ? _S99_TEST.amount : 70;
    // Scale at which picker would advance to (levelIdx+1). Picker rule:
    //   pick level i where levels[i].width >= _drawW * viewScale
    // So the current level's ceiling (scale that just barely still picks L)
    // is levels[L].width / _drawW. Beyond that, L+1 takes over.
    var nextIdx = levelIdx + 1;
    if (nextIdx < _pageInfo.levels.length) {
      var ceilScale = lvl.width / _drawW;
      var triggerScale = ceilScale * (_pctThresh / 100);
      if (scale >= triggerScale) {
        var nextLvl = _pageInfo.levels[nextIdx];
        var nd2lX = nextLvl.width / _drawW;
        var nd2lY = nextLvl.height / _drawH;
        var nCol0 = Math.max(0, Math.floor((visX0 * nd2lX) / _TILE_SIZE));
        var nCol1 = Math.min(nextLvl.cols - 1, Math.ceil((visX1 * nd2lX) / _TILE_SIZE));
        var nRow0 = Math.max(0, Math.floor((visY0 * nd2lY) / _TILE_SIZE));
        var nRow1 = Math.min(nextLvl.rows - 1, Math.ceil((visY1 * nd2lY) / _TILE_SIZE));
        var budget = 6;
        for (var nc = nCol0; nc <= nCol1 && budget > 0; nc++) {
          for (var nr = nRow0; nr <= nRow1 && budget > 0; nr++) {
            var nkey = _tileKey(nextIdx, nc, nr);
            // Skip if already in our cache (racing a real load), in flight,
            // or we've issued a prefetch for it already in this session.
            if (_tiles[nkey] || _inflight[nkey]) continue;
            if (!_s99PrefetchIssued[nkey]) {
              var nurl = _tileUrl(nextIdx, nc, nr);
              if (nurl) {
                _s99PrefetchIssued[nkey] = true;
                budget--;
                try {
                  // mode:cors + credentials:omit matches <img crossOrigin=anonymous>
                  // so the browser cache key aligns with the eventual <img> request.
                  fetch(nurl, { mode: 'cors', credentials: 'omit' })
                    .catch(function(){ /* silent */ });
                } catch (_e) { /* silent */ }
              }
            }
          }
        }
      }
    }
  }

  if (_dbgWinInfo) {
    var _dvc0 = Math.max(0, Math.floor(lvlX0 / _TILE_SIZE));
    var _dvc1 = Math.min(lvl.cols - 1, Math.floor((lvlX1 - 1e-3) / _TILE_SIZE));
    var _dvr0 = Math.max(0, Math.floor(lvlY0 / _TILE_SIZE));
    var _dvr1 = Math.min(lvl.rows - 1, Math.floor((lvlY1 - 1e-3) / _TILE_SIZE));
    _updateWinInfoPanel(levelIdx, scale, _dvc1 - _dvc0 + 1, _dvr1 - _dvr0 + 1);
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

      // Backdrop (dv-image) — DISABLED for tile drawings on all platforms.
      // S95: touch skipped to avoid iOS Jetsam kills from 100MB bitmap.
      // S98b: desktop also skips. The r2Url jpeg for multi-page PDFs is
      // often larger than one page's wrap; with no overflow:hidden it
      // spilled past wrap and showed adjacent-page content as a permanent
      // right-side ghost. Tiles alone cover the drawing; if tiles fail, the
      // onFallbackImage catch path handles recovery. Pin math already uses
      // TiledPdf.getDimensions(), not dv-image.naturalWidth.
      var img = document.getElementById('dv-image');
      if (img) {
        if (img.src && img.src !== 'about:blank') {
          try { img.src = ''; } catch(_){}
        }
        img.style.visibility = 'hidden';
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

      _dbgLife('open:manifest-applied', { page: pn, drawW: _drawW, drawH: _drawH });
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
  _dbgLife('open:request', { requestedDrawing: drawingId, requestedPage: pageNum });
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
  _dbgLife('close:begin', { prior_tileCount: _tileCount });
  _active = false;
  _paused = false;
  _manifest = null;
  _pageInfo = null;
  var prevDrawing = _drawingId;
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
  // S132 — reset the on-tablet diagnostic re-window counter per drawing.
  _rewindowCount = 0;
  // S99 prefetch candidate — reset per-drawing prefetch tracker. Without
  // this, stale next-level URLs from a prior drawing persist and prevent
  // re-issuing fetches on the next drawing's prefetch window.
  _s99PrefetchIssued = {};

  // S112 canvas mode — explicitly free level-canvas backing buffers. Just
  // removing the parent layer would let GC eventually collect them, but
  // canvas backing stores are not always counted against the JS heap, so
  // we force release by zeroing width/height before drop.
  _disposeAllLevelCanvases();

  if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
  var img = document.getElementById('dv-image');
  if (img) {
    // S98b: hide backdrop instantly via visibility, blank src to release
    // memory. Simpler and more reliable than S97's display-based approach.
    img.style.visibility = 'hidden';
    if (img.src && img.src !== 'about:blank') {
      try { img.src = ''; } catch (_) { /* noop */ }
    }
  }
  _dbgLife('close:end', { prevDrawing: prevDrawing });
}

function close() { _close_internal(); }

// ─── S111: Render-progress + Anomaly floating panels ──────────────────────
//
// Two compact bottom-right floating panels for diagnostic feedback during
// drawing tile loads:
//
//   ┌─────────────────────────────┐
//   │ Tiles 47/96 [▓▓▓▓▓░░░░] 49% │   render-progress
//   │ inflight 6 · pending 43     │
//   │ ETA ~12s                    │
//   └─────────────────────────────┘
//   ┌─────────────────────────────┐
//   │ Anomalies: B 0  C 0  Δ 0    │   anomaly counter
//   │ (latest: —)            [📋] │
//   └─────────────────────────────┘
//
// Render-progress polls _tileCount / _pending.length / inflight every 500ms
// while a tile load is in flight. Auto-hides 5 seconds after the last
// inflight resolves. ETA computed from rolling tile-completion rate.
//
// Anomaly panel listens to _frtAnomaly events (dispatched by the boundary
// detector elsewhere in the v2 code) and shows a live count per bug class
// plus a one-line description of the latest event. Copy-button puts a
// shareable text report on clipboard for paste into a session handoff.
//
// Both panels use only CSS + DOM — no rendering dependency. They survive
// drawing close/open cycles (re-attached in _ensurePanels).
//
var _progPanel = null, _progBar = null, _progText = null, _progSub = null, _progEta = null;
var _anomPanel = null, _anomCounts = null, _anomLatest = null, _anomCopyBtn = null;
var _progPollTimer = null, _progFinishTimer = null;
var _progStarted = 0, _progStartTiles = 0;
var _anomBuckets = { A: 0, B: 0, C: 0, EDGE_BAD: 0, LAG: 0 };
var _anomLatestText = '';

function _ensurePanels(){
  if (!_progPanel){
    _progPanel = document.createElement('div');
    _progPanel.id = 'arencon-frt-progress';
    _progPanel.style.cssText =
      'position:fixed;right:12px;bottom:60px;z-index:99980;' +
      'background:rgba(27,35,48,.93);color:#E5E9EF;' +
      'padding:8px 12px;border-radius:6px;border:1px solid #2C4770;' +
      'font:600 12px/1.45 Calibri,sans-serif;min-width:200px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.28);' +
      'transition:opacity .25s ease;opacity:0;pointer-events:none;';
    var line1 = document.createElement('div');
    line1.style.cssText = 'display:flex;align-items:center;gap:8px;';
    _progText = document.createElement('span');
    _progText.style.cssText = 'flex:1;white-space:nowrap;';
    _progText.textContent = 'Tiles 0/0';
    var barWrap = document.createElement('div');
    barWrap.style.cssText = 'flex:1;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;';
    _progBar = document.createElement('div');
    _progBar.style.cssText = 'height:100%;width:0%;background:#5F8068;transition:width .3s ease;';
    barWrap.appendChild(_progBar);
    line1.appendChild(_progText);
    line1.appendChild(barWrap);

    _progSub = document.createElement('div');
    _progSub.style.cssText = 'color:#9AA5B5;font-weight:400;font-size:11px;margin-top:3px;';
    _progSub.textContent = '';

    _progEta = document.createElement('div');
    _progEta.style.cssText = 'color:#9AA5B5;font-weight:400;font-size:11px;margin-top:1px;';
    _progEta.textContent = '';

    _progPanel.appendChild(line1);
    _progPanel.appendChild(_progSub);
    _progPanel.appendChild(_progEta);
    document.body.appendChild(_progPanel);
  }

  if (!_anomPanel){
    _anomPanel = document.createElement('div');
    _anomPanel.id = 'arencon-frt-anomaly';
    _anomPanel.style.cssText =
      'position:fixed;right:12px;bottom:14px;z-index:99980;' +
      'background:rgba(27,35,48,.93);color:#E5E9EF;' +
      'padding:7px 11px;border-radius:6px;border:1px solid #2C4770;' +
      'font:600 11px/1.45 Calibri,sans-serif;max-width:320px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.28);';
    _anomCounts = document.createElement('div');
    _anomCounts.style.cssText = 'white-space:nowrap;';
    _anomCounts.textContent = 'Anomalies: A 0 · B 0 · C 0 · Δ 0';

    var bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:3px;color:#9AA5B5;font-weight:400;font-size:10px;';
    _anomLatest = document.createElement('span');
    _anomLatest.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    _anomLatest.textContent = '(none)';
    _anomCopyBtn = document.createElement('button');
    _anomCopyBtn.textContent = '📋';
    _anomCopyBtn.title = 'Copy anomaly report';
    _anomCopyBtn.style.cssText = 'background:#2C4770;color:#FFF;border:none;border-radius:3px;padding:2px 6px;cursor:pointer;font-size:11px;';
    _anomCopyBtn.addEventListener('click', _copyAnomalyReport);
    bottomRow.appendChild(_anomLatest);
    bottomRow.appendChild(_anomCopyBtn);

    _anomPanel.appendChild(_anomCounts);
    _anomPanel.appendChild(bottomRow);
    document.body.appendChild(_anomPanel);

    // Hook the global anomaly bus
    window.addEventListener('frt-anomaly', _onAnomalyEvent);
    // Expose a manual entry point so other modules can push without an event
    window._frtPushAnomaly = function(bucket, msg){
      _onAnomalyEvent({ detail: { bucket: bucket, msg: msg } });
    };
  }
}

function _showProgressPanel(){
  if (!_progPanel) _ensurePanels();
  _progPanel.style.opacity = '1';
  if (_progFinishTimer){ clearTimeout(_progFinishTimer); _progFinishTimer = null; }
}

function _hideProgressPanel(){
  if (!_progPanel) return;
  _progPanel.style.opacity = '0';
}

function _updateProgress(){
  if (!_progPanel) return;
  var loaded = _tileCount;
  var pending = _pending.length;
  var inflight = _inflightCount();
  var total = loaded + pending + inflight;
  if (total === 0){
    _progBar.style.width = '0%';
    _progText.textContent = 'Tiles 0/0';
    _progSub.textContent = '';
    _progEta.textContent = '';
    return;
  }
  var pct = Math.round(loaded / total * 100);
  _progBar.style.width = pct + '%';
  _progText.textContent = 'Tiles ' + loaded + '/' + total + '  ' + pct + '%';
  _progSub.textContent = 'inflight ' + inflight + ' · pending ' + pending;

  // ETA from rolling rate
  if (_progStarted && _progStartTiles != null){
    var dt = (Date.now() - _progStarted) / 1000;
    var done = loaded - _progStartTiles;
    if (dt > 1 && done > 0){
      var rate = done / dt; // tiles/sec
      var remaining = pending + inflight;
      var eta = remaining > 0 ? Math.round(remaining / rate) : 0;
      _progEta.textContent = eta > 0 ? ('ETA ~' + eta + 's') : 'finishing…';
    } else {
      _progEta.textContent = '';
    }
  }
}

function _maybeStartProgressPoll(){
  if (_progPollTimer) return;
  _ensurePanels();
  _showProgressPanel();
  _progStarted = Date.now();
  _progStartTiles = _tileCount;
  _progPollTimer = setInterval(function(){
    _updateProgress();
    var pending = _pending.length;
    var inflight = _inflightCount();
    if (pending === 0 && inflight === 0){
      // Schedule hide 5 seconds after stable
      if (!_progFinishTimer){
        _progFinishTimer = setTimeout(function(){
          _hideProgressPanel();
          if (_progPollTimer){ clearInterval(_progPollTimer); _progPollTimer = null; }
          _progStarted = 0;
          _progFinishTimer = null;
        }, 5000);
      }
    } else if (_progFinishTimer){
      clearTimeout(_progFinishTimer); _progFinishTimer = null;
    }
  }, 500);
}

function _onAnomalyEvent(ev){
  var d = ev && ev.detail;
  if (!d) return;
  var b = String(d.bucket || '').toUpperCase();
  if (b === 'A' || b === 'B' || b === 'C' || b === 'EDGE_BAD' || b === 'LAG') _anomBuckets[b]++;
  _anomLatestText = (d.msg || '').slice(0, 200);
  if (_anomLatest) _anomLatest.textContent = b + ': ' + _anomLatestText.slice(0, 80);
  if (_anomCounts){
    _anomCounts.textContent = 'Anomalies: A ' + _anomBuckets.A + ' · B ' + _anomBuckets.B + ' · C ' + _anomBuckets.C + ' · Δ ' + (_anomBuckets.EDGE_BAD + _anomBuckets.LAG);
  }
}

function _copyAnomalyReport(){
  var lines = [];
  lines.push('=== ARENCON FRT anomaly report ===');
  lines.push('Build: s111a (mitchell + L2 height shift)');
  lines.push('When: ' + new Date().toISOString());
  lines.push('PID: ' + (_drawingId || '-'));
  lines.push('Drawing: ' + (_drawingId || '-'));
  lines.push('Counts: A=' + _anomBuckets.A + ', B=' + _anomBuckets.B + ', C=' + _anomBuckets.C + ', EDGE_BAD=' + _anomBuckets.EDGE_BAD + ', LAG=' + _anomBuckets.LAG);
  lines.push('Latest: ' + _anomLatestText);
  lines.push('Tiles: ' + _tileCount + '/' + _MAX_TILES);
  var report = lines.join('\n');
  navigator.clipboard.writeText(report).then(function(){
    if (_anomLatest){ var prev = _anomLatest.textContent; _anomLatest.textContent = '✓ copied'; setTimeout(function(){ _anomLatest.textContent = prev; }, 1500); }
  }).catch(function(){
    if (_anomLatest){ _anomLatest.textContent = 'copy failed — open console'; console.log(report); }
  });
}

// Hook into the existing fetch+evict path so the panel auto-shows whenever
// a tile fetch starts. This is a wrapper monkey-patch on _startFetch and
// _evictExcess so we don't have to thread a callback through every existing
// code path.
var _origStartFetch = _startFetch;
_startFetch = function(req, layer){
  _maybeStartProgressPoll();
  return _origStartFetch(req, layer);
};

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



