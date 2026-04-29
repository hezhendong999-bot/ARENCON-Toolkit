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

// S99 prefetch candidate — tracks which next-level tiles have already had
// a warm-cache fetch issued this session. Persists across level changes so
// we don't re-fetch the same URLs. Cleared on _close_internal.
var _s99PrefetchIssued = {};

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
// S111: bumped cache cap from 250 → 800 on desktop (180 → 360 on iPad,
// 80 → 160 on iPhone). Larger cache means old-level tiles aren't evicted
// the moment new-level tiles arrive on zoom-in, so the brief gap between
// "old tile fades out" and "new tile finishes loading" no longer shows
// the white background. The L4 flash on zoom-in (S110 deferred bug) is
// caused by exactly this gap on slow first-fetches. Raising the cap
// preserves L3 tiles in memory after the zoom-in even though they're not
// actively rendered, so a quick zoom-out re-shows them instantly.
// Memory cost: at ~80kB per WebP tile + decode overhead, 800 tiles is
// roughly 200MB. Within desktop budgets, but if memory issues appear in
// the field this is the lever to pull.
var _MAX_TILES = _isIPhone ? 160 : (_isIPad ? 360 : 800);
var _MAX_CONCURRENT = _isIPhone ? 3 : (_isIPad ? 5 : 6);
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
//                 Explicitly DISABLED on iOS (iPad/iPhone) — the L4 canvas
//                 alone exceeds the iOS Safari Jetsam ceiling. Use
//                 ?s99test=img to opt out on a non-iOS device.
//
//   ESCAPE HATCH (S112 Push 1):
//     img       — force the legacy per-tile <img> compositor regardless
//                 of platform default. Use this if a specific drawing
//                 shows a canvas-mode regression we missed in verification.
//                 Bookmarkable: append &s99test=img to any FRT URL.
//
//   iOS JETSAM DEFENSES (S112 Push 2 — toggle-gated, default OFF):
//     ios-purge — restore the S95-era eager purge of non-active-level
//                 tiles at every level change. iOS only (gate enforced
//                 inline). Drops cumulative tile pool ~200 MB → ~30-50 MB
//                 at level boundaries. Brings back brief level-transition
//                 flash on iOS (acceptable tradeoff). Promotes to default
//                 iOS behavior in a future push after iPad verification.
//
//                 Companion knob: ?iosres=N in markup.js shrinks markup
//                 canvas pixel budget from 4-8 Mpx to N Mpx for further
//                 in-field degradation if needed.
//
// One candidate active at a time — use URL to switch. Tested in isolation.
function _readS99Test() {
  try {
    if (typeof window === 'undefined') return null;
    var m = /[?&]s99test=([^&#]+)/.exec(window.location.search || '');
    if (!m) return null;
    var raw = decodeURIComponent(m[1]).toLowerCase();
    if (!raw || raw === 'off') return null;
    var dash = raw.indexOf('-');
    var name, amount;
    if (dash > 0) {
      name = raw.slice(0, dash);
      var n = parseInt(raw.slice(dash + 1), 10);
      amount = (!isNaN(n) && n >= 0 && n <= 1024) ? n : null;
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

// S112 Push 1: canvas-compositor mode is now the DEFAULT on desktop and
// Android, and force-OFF on iOS (Jetsam guard — a level canvas at L4 is
// ~400 MB backing buffer, well past iOS Safari's tab budget).
//
// URL toggle interactions:
//   ?s99test=canvas   → force canvas ON (overrides iOS gate; for diagnostic
//                        testing of the crash on iPad)
//   ?s99test=img      → force canvas OFF (explicit escape hatch — field staff
//                        can append this to their URL if a drawing has any
//                        canvas-mode regression we missed in verification)
//   ?s99test=baseline → force canvas OFF (pre-existing alias; same effect)
//   ?s99test=overlap  → force canvas OFF (overlap toggle only meaningful
//                        in the <img> path it modifies)
//   ?s99test=snap     → force canvas OFF (same)
//   ?s99test=fastfade → force canvas OFF (same)
//   ?s99test=delaysrc → force canvas OFF (same)
//   ?s99test=prefetch → force canvas OFF (same)
//   no toggle, iOS    → canvas OFF (gate)
//   no toggle, other  → canvas ON
var _S99_CANVAS;
if (_S99_TEST) {
  // Explicit toggle: only `canvas` opts in. Any other toggle (including
  // the diagnostic ones that modify the <img> path) implies img mode so
  // the toggle can do what it was designed for.
  _S99_CANVAS = (_S99_TEST.name === 'canvas');
} else {
  // Default: canvas mode everywhere except iOS. The _isIPad detection
  // above covers iPadOS 13+ which spoofs Mac in user-agent (it adds the
  // `navigator.maxTouchPoints > 1` check). A real Mac with no touch
  // support evaluates _isIPad === false and gets canvas mode.
  _S99_CANVAS = !(_isIPhone || _isIPad);
}

// S112: level -> { canvas, ctx, lvl, tilesPainted }. Populated lazily in
// canvas mode by _getOrCreateLevelCanvas. Empty in img mode.
var _levelCanvases = {};

// S112 Push 2: ?s99test=ios-purge toggle. When ON and on iOS, restore the
// S95-era eager purge of tiles from non-active levels at every level
// change. Reduces cumulative tile pool growth that contributes to the
// iOS Safari Jetsam ceiling. Default OFF — same behavior as today.
// iOS only because purge brings back the brief level-transition flash
// that desktop/Android no longer need to suffer (S111b removed it for
// them).
var _S99_IOS_PURGE = !!(_S99_TEST && _S99_TEST.name === 'ios-purge');

// S112 Push 2: passive Jetsam-reload detection. iOS only. Reads the
// _frtS97LifeRing buffer (persists in localStorage across page reloads).
// If the previous tab's most-recent lifecycle event was <30 s ago AND
// wasn't a graceful close:end, the tab probably got Jetsam-killed and
// the user reopened. Pushes a synthetic 'jetsam-reload-suspected' event
// so it shows up in _frtLifePeek() output for forensics. Read-only
// telemetry; no behavior change. Runs once on module load.
(function _detectJetsamReload(){
  if (!(_isIPhone || _isIPad)) return;
  if (typeof localStorage === 'undefined') return;
  try {
    var raw = localStorage.getItem('_frtS97LifeRing');
    if (!raw) return;
    var ring = JSON.parse(raw);
    if (!ring || !ring.length) return;
    var last = ring[ring.length - 1];
    if (!last || !last.t) return;
    var ageSec = (Date.now() - last.t) / 1000;
    if (ageSec >= 0 && ageSec < 30 && last.tag !== 'close:end' && last.tag !== 'jetsam-reload-suspected') {
      console.warn('[TiledPdf] iOS Jetsam-reload SUSPECTED — previous event "' +
        last.tag + '" was ' + ageSec.toFixed(1) + 's ago without a graceful close. ' +
        'Tab may have been killed. Run _frtLifePeek() for forensics.');
      ring.push({
        t: Date.now(),
        tag: 'jetsam-reload-suspected',
        drawingId: null,
        extra: {
          priorTag: last.tag,
          priorAgeSec: +ageSec.toFixed(1),
          priorTime: last.t,
          ua: (navigator.userAgent || '').slice(0, 120)
        }
      });
      // Cap ring at 50 entries (matching existing _dbgLife trim threshold)
      while (ring.length > 50) ring.shift();
      localStorage.setItem('_frtS97LifeRing', JSON.stringify(ring));
    }
  } catch (_e) { /* localStorage parse error etc — silent */ }
})();

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
          console.log('%c[S97 LIFE] copied to clipboard — paste in chat', 'color:#1A7A4A;font-weight:bold');
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
      'display:block;width:100%;margin:0 0 4px 0;background:#1A7A4A;color:#fff;' +
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
          copyBtn.style.background = '#1A7A4A';
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
// clean close) show a burgundy panel pinned to the BOTTOM of the screen
// (top-pinned blocked the FRT nav tabs). Has explicit Copy and Close buttons
// — no tap-to-dismiss (which was firing on accidental scrolls).
if (_DBG_ENABLED && typeof window !== 'undefined' && typeof document !== 'undefined') {
  var _dbgBuildLogText = function (ring, peak) {
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var fmtTime = function (t) {
      var d = new Date(t);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
             ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    };
    var out = '=== ARENCON FRT — S97 DIAG snapshot ===\n';
    out += 'Captured: ' + fmtTime(Date.now()) + '\n';
    out += 'UA: ' + (navigator.userAgent || '?') + '\n';
    out += 'Viewport: ' + window.innerWidth + 'x' + window.innerHeight +
           '  DPR: ' + (window.devicePixelRatio || 1) + '\n\n';

    out += 'PEAK during pre-crash window:\n';
    out += '  tiles: ' + peak.tiles + '/' + peak.cap +
           (peak.byLevel ? '  (' + peak.byLevel + ')' : '') + '\n';
    out += '  markup canvas: ' + peak.mk + ' Mpx\n';
    out += '  webgl canvas:  ' + peak.gl + ' Mpx\n';
    out += '  approx total memory: ~' + peak.approxMB + ' MB\n';
    out += '  inflight: ' + peak.inflight + '  pending: ' + peak.pending + '\n';
    out += '  scale at peak: ' + peak.scale + '\n';
    out += '  draw size: ' + peak.draw + '  area: ' + peak.area + '\n\n';

    out += 'All ' + ring.length + ' snapshots (oldest \u2192 newest):\n';
    out += '   t        time      tiles      byLevel              mk    gl    ~MB   inf  pnd  scale\n';
    var nowT = Date.now();
    for (var i = 0; i < ring.length; i++) {
      var s = ring[i];
      var d = new Date(s.t);
      var ts = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      var rel = '-' + Math.round((nowT - s.t) / 1000) + 's';
      var pp = function (str, w) {
        str = '' + str;
        while (str.length < w) str += ' ';
        return str.length > w ? str.substring(0, w) : str;
      };
      out += '  ' + pp(rel, 7) + '  ' + pp(ts, 9) +
             ' ' + pp(s.tiles + '/' + s.cap, 9) +
             '  ' + pp(s.byLevel || '-', 20) +
             ' ' + pp(s.mk + 'M', 5) +
             ' ' + pp(s.gl + 'M', 5) +
             ' ' + pp('~' + s.approxMB, 5) +
             ' ' + pp(s.inflight, 4) +
             ' ' + pp(s.pending, 4) +
             ' ' + s.scale + '\n';
    }
    return out;
  };

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

      // Visible body shows last 12 snapshots (newest first) — full ring goes to clipboard
      var recent = ring.slice(-12);
      var bodyLines = [];
      for (var j = recent.length - 1; j >= 0; j--) {
        var s = recent[j];
        var d = new Date(s.t);
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        var ts = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        var rel = Math.round((Date.now() - s.t) / 1000);
        bodyLines.push('-' + rel + 's  ' + ts +
          ' | tiles:' + s.tiles + '/' + s.cap +
          (s.byLevel ? ' (' + s.byLevel + ')' : '') +
          '  mk:' + s.mk + 'M  gl:' + s.gl + 'M' +
          '  ~' + s.approxMB + 'MB' +
          '  inf:' + s.inflight + '  pnd:' + s.pending +
          '  s:' + s.scale);
      }

      // Container — bottom-pinned, doesn't block the top nav tabs
      var banner = document.createElement('div');
      banner.id = 's97-crash-report';
      banner.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
        'background:#9C2742;color:#fff;font:11px/1.4 Menlo,monospace;' +
        'padding:0;max-height:55vh;overflow:hidden;display:flex;flex-direction:column;' +
        'box-shadow:0 -4px 16px rgba(0,0,0,0.5);' +
        'padding-bottom:env(safe-area-inset-bottom,0);';

      // Title row — flexbox: peak text left, buttons right
      var titleRow = document.createElement('div');
      titleRow.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:8px 12px;' +
        'background:rgba(0,0,0,0.18);flex:0 0 auto;';
      var titleText = document.createElement('div');
      titleText.style.cssText = 'flex:1;font:600 12px/1.3 Calibri,sans-serif;min-width:0;';
      titleText.textContent = 'S97 DIAG \u2014 peak: tiles ' +
        peak.tiles + '/' + peak.cap +
        (peak.byLevel ? ' (' + peak.byLevel + ')' : '') +
        ', ~' + peak.approxMB + ' MB';
      titleRow.appendChild(titleText);

      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy log';
      copyBtn.style.cssText =
        'flex:0 0 auto;background:#fff;color:#9C2742;border:0;border-radius:4px;' +
        'padding:6px 12px;font:600 12px/1 Calibri,sans-serif;cursor:pointer;' +
        '-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
      copyBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var fullText = '';
        try { fullText = _dbgBuildLogText(ring, peak); } catch (_e) { fullText = '[log build failed: ' + _e.message + ']'; }
        var done = function (ok) {
          copyBtn.textContent = ok ? '\u2713 Copied' : 'Failed';
          copyBtn.style.background = ok ? '#1A7A4A' : '#666';
          copyBtn.style.color = '#fff';
          setTimeout(function () {
            copyBtn.textContent = 'Copy log';
            copyBtn.style.background = '#fff';
            copyBtn.style.color = '#9C2742';
          }, 1800);
        };
        // Modern API first (iOS Safari 13.4+ inside a click handler)
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(fullText).then(function () { done(true); }, function () {
            // Fallback: textarea + execCommand
            try {
              var ta = document.createElement('textarea');
              ta.value = fullText;
              ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
              document.body.appendChild(ta);
              ta.focus(); ta.select();
              var ok = false;
              try { ok = document.execCommand('copy'); } catch (_) {}
              document.body.removeChild(ta);
              done(ok);
            } catch (_err) { done(false); }
          });
        } else {
          // Old browser fallback
          try {
            var ta2 = document.createElement('textarea');
            ta2.value = fullText;
            ta2.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
            document.body.appendChild(ta2);
            ta2.focus(); ta2.select();
            var ok2 = document.execCommand('copy');
            document.body.removeChild(ta2);
            done(ok2);
          } catch (_err) { done(false); }
        }
      });
      titleRow.appendChild(copyBtn);

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '\u2715';
      closeBtn.title = 'Close + clear log';
      closeBtn.style.cssText =
        'flex:0 0 auto;background:rgba(255,255,255,0.18);color:#fff;border:0;border-radius:4px;' +
        'padding:6px 10px;font:700 14px/1 Calibri,sans-serif;cursor:pointer;min-width:32px;' +
        '-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
      closeBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (banner.parentNode) banner.parentNode.removeChild(banner);
        try { localStorage.removeItem('_frtS97DbgRing'); } catch (_) { /* noop */ }
      });
      titleRow.appendChild(closeBtn);

      banner.appendChild(titleRow);

      // Body — scrollable area below the title row
      var body = document.createElement('div');
      body.style.cssText =
        'flex:1 1 auto;overflow:auto;padding:8px 12px;white-space:pre;' +
        '-webkit-overflow-scrolling:touch;';
      body.textContent = bodyLines.join('\n');
      banner.appendChild(body);

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

function _getOrCreateLevelCanvas(level, lvl) {
  var entry = _levelCanvases[level];
  if (entry) return entry;
  var layer = document.getElementById('dv-tiles-layer');
  if (!layer) return null;
  var c = document.createElement('canvas');
  c.width = lvl.width;
  c.height = lvl.height;
  c.id = 'dv-tiles-canvas-L' + level;
  // CSS-scale the WHOLE canvas to drawing space. One fractional scale,
  // applied to a single DOM element — no per-tile rounding, no seams.
  c.style.cssText =
    'position:absolute;left:0;top:0;' +
    'width:' + _drawW + 'px;height:' + _drawH + 'px;' +
    'z-index:' + level + ';' +
    'pointer-events:none;image-rendering:auto;';
  var ctx;
  try {
    ctx = c.getContext('2d', { alpha: true, willReadFrequently: false });
  } catch (_e) {
    ctx = c.getContext('2d');
  }
  if (!ctx) return null;
  layer.appendChild(c);
  entry = { canvas: c, ctx: ctx, lvl: lvl, tilesPainted: 0 };
  _levelCanvases[level] = entry;
  return entry;
}

function _evictTileFromCanvas(tile) {
  var entry = _levelCanvases[tile.level];
  if (!entry) return;
  var tx = tile.col * _TILE_SIZE;
  var ty = tile.row * _TILE_SIZE;
  // Clear only the actual content region. Edge tiles have tileW/tileH < 512.
  entry.ctx.clearRect(tx, ty, tile.tileW, tile.tileH);
  entry.tilesPainted--;
  if (entry.tilesPainted <= 0) {
    if (entry.canvas.parentNode) entry.canvas.parentNode.removeChild(entry.canvas);
    // Force backing-buffer release. Setting w/h to 0 is the canonical idiom.
    try { entry.canvas.width = 0; entry.canvas.height = 0; } catch(_) {}
    delete _levelCanvases[tile.level];
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
      // Source rect (0,0,tileW,tileH) clips the white-padded region of
      // edge tiles produced by sharp.extend() — same reason the <img> path
      // uses clip-path:inset() for edge tiles. Dest rect places it at the
      // tile's slot in the level canvas at native level pixels.
      try {
        entry.ctx.drawImage(img, 0, 0, tileW, tileH, tileX, tileY, tileW, tileH);
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

  // S112 Push 2: opt-in iOS eager purge. When ?s99test=ios-purge is
  // active AND we're on iOS, drop all tiles from levels other than the
  // currently-active level. This restores S95-era behavior on iOS only —
  // a defense against cumulative tile pool growth that, combined with the
  // 50 Mpx markup canvas baseline, lands iPad/iPhone tabs over the
  // Safari Jetsam ceiling on second drawing-open.
  //
  // Tradeoffs:
  //   • Memory: drops ~200 MB peak tile pool to ~30-50 MB at level boundary
  //   • Visual: brings back brief level-transition flash on iOS (acceptable,
  //     iOS already had it pre-S111b — non-iOS keeps S111b's flash-free)
  //   • Doesn't touch markup canvas — that's a separate piece of the iOS
  //     plan (?iosres=N override in markup.js)
  //
  // Default OFF. Mark verifies on real iPad before promotion to iOS-default.
  if (_S99_IOS_PURGE && (_isIPhone || _isIPad)) {
    var keysToPurge = [];
    for (var pk in _tiles) {
      if (!Object.prototype.hasOwnProperty.call(_tiles, pk)) continue;
      if (_tiles[pk].level !== levelIdx) keysToPurge.push(pk);
    }
    for (var pi = 0; pi < keysToPurge.length; pi++) {
      var purgeKey = keysToPurge[pi];
      var purgeTile = _tiles[purgeKey];
      if (purgeTile) {
        if (_S99_CANVAS) {
          _evictTileFromCanvas(purgeTile);
        } else if (purgeTile.img) {
          if (layer && purgeTile.img.parentNode === layer) layer.removeChild(purgeTile.img);
          purgeTile.img.src = '';
        }
      }
      delete _tiles[purgeKey];
      var lruIdx = _tileOrder.indexOf(purgeKey);
      if (lruIdx >= 0) _tileOrder.splice(lruIdx, 1);
      _tileCount--;
    }
    if (keysToPurge.length) {
      _dbgLife('ios-purge', { dropped: keysToPurge.length, kept: _tileCount, level: levelIdx });
    }
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
    _progBar.style.cssText = 'height:100%;width:0%;background:#1A7A4A;transition:width .3s ease;';
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



