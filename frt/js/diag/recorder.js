// frt/js/diag/recorder.js
// S97 — Session recorder for diagnosing viewer bugs.
//
// Captures EVERYTHING that happens during a recording session:
//   - Every console.log / warn / error (patched at module load)
//   - Every mutation of #dv-tiles-layer (tile append/remove/opacity changes)
//   - Every <img src=> assignment on #dv-image and tile <img>s
//   - Every transform change on #dv-img-wrap (rAF-sampled, 60 Hz max)
//   - Every scale/zoom change reported by TiledPdf.getViewState()
//   - Every DOMContentLoaded / resize / visibilitychange / orientationchange
//   - Every Pixi.js init / destroy event (via console hooks)
//   - Every Markup.init / destroy event
//   - Every existing _dbgLife event (piggy-backs on _frtS97LifeRing)
//   - Periodic memory snapshots every 500ms (tile count, canvas sizes, MB)
//   - html2canvas thumbnails at every "milestone" event (page open, level
//     change, zoom end) — captured async at ~400px wide, base64 stored
//
// Usage:
//   1. User opens FRT with ?dbg=1 (or _frtDbg='1' in localStorage)
//   2. Green panel has "⚫ Record" button — click to start a session
//   3. User reproduces bug
//   4. Click "⏹ Stop" — recording finalizes
//   5. Click "📋 Export" — single JSON blob copied to clipboard with
//      everything including base64 thumbnail images
//
// Output format (v1):
//   {
//     sessionId: "rec_1776914...",
//     startedAt: 1776914...,
//     stoppedAt: 1776914...,
//     ua: "...",
//     viewport: {w, h, dpr},
//     events: [ { t, type, ...payload }, ... ],
//     thumbs: { <event_idx>: "data:image/png;base64,..." },
//     lifecycleRing: [ ... ], // snapshot of _frtS97LifeRing at stop
//     periodicRing: [ ... ],  // snapshot of _frtS97DbgRing at stop
//   }

(function () {
  'use strict';

  // Gate: only activate if dbg flag is set (URL or localStorage)
  var _enabled = false;
  try {
    _enabled = /[?&]dbg=1\b/.test(window.location.search || '') ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('_frtDbg') === '1');
  } catch (_) {}
  if (!_enabled) return;

  // ── Module state ─────────────────────────────────────────────────────────
  var _recording = false;
  var _sessionId = null;
  var _startedAt = 0;
  var _events = [];
  var _thumbs = {};
  var _rafHandle = null;
  var _periodicTimer = null;
  var _lastTransform = null;
  var _lastScale = null;
  var _mutObserver = null;
  var _html2canvasLoaded = false;
  var _html2canvasLoading = null;
  var _thumbsPending = 0;

  // Saved originals for unpatching on stop
  var _origConsole = {};
  var _origImgSrcDescriptor = null;
  var _consolePatched = false;

  var MAX_EVENTS = 20000;         // hard cap to keep memory sane
  var MAX_THUMB_INTERVAL_MS = 250; // minimum gap between thumbnails
  var THUMB_WIDTH = 480;          // target thumbnail width in px
  var _lastThumbAt = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function _now() { return Date.now(); }
  function _rel() { return _now() - _startedAt; }

  function _push(type, payload) {
    if (!_recording || _events.length >= MAX_EVENTS) return -1;
    var idx = _events.length;
    var rec = { t: _rel(), type: type };
    if (payload != null) rec.d = payload;
    _events.push(rec);
    return idx;
  }

  function _safeStringify(v) {
    try {
      if (v == null) return String(v);
      if (typeof v === 'string') return v.length > 500 ? v.substring(0, 500) + '…' : v;
      if (typeof v === 'number' || typeof v === 'boolean') return v;
      if (v instanceof Error) return { err: v.message, stack: (v.stack || '').substring(0, 500) };
      if (v instanceof HTMLElement) {
        return {
          tag: v.tagName, id: v.id || null, cls: v.className || null,
          src: (v.src || '').replace(/^.*\/tiles\//, '…/tiles/').substring(0, 200),
          w: v.width || null, h: v.height || null,
          opacity: v.style && v.style.opacity
        };
      }
      // Generic object — truncate via JSON roundtrip
      var s = JSON.stringify(v);
      return s.length > 800 ? JSON.parse(s.substring(0, 795) + '"}') : v;
    } catch (_) { return String(v); }
  }

  // ── Console hooks ────────────────────────────────────────────────────────
  function _patchConsole() {
    if (_consolePatched) return;
    ['log', 'warn', 'error', 'info', 'debug'].forEach(function (level) {
      _origConsole[level] = console[level];
      console[level] = function () {
        try {
          var args = Array.prototype.slice.call(arguments).map(_safeStringify);
          _push('console.' + level, args);
        } catch (_) {}
        return _origConsole[level].apply(console, arguments);
      };
    });
    _consolePatched = true;
  }

  function _unpatchConsole() {
    if (!_consolePatched) return;
    ['log', 'warn', 'error', 'info', 'debug'].forEach(function (level) {
      if (_origConsole[level]) console[level] = _origConsole[level];
    });
    _origConsole = {};
    _consolePatched = false;
  }

  // ── MutationObserver on dv-tiles-layer and dv-image parent ───────────────
  function _startMutationObserver() {
    var area = document.getElementById('dv-canvas-area');
    if (!area) return;
    _mutObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'childList') {
          for (var i = 0; i < m.addedNodes.length; i++) {
            var n = m.addedNodes[i];
            if (n.nodeType === 1) {
              _push('dom:add', {
                parent: m.target.id || m.target.tagName,
                tag: n.tagName,
                id: n.id || null,
                src: n.src ? n.src.replace(/^.*\/tiles\//, '…/tiles/').substring(0, 120) : null,
                w: n.width, h: n.height,
                style: (n.style && n.style.cssText) ? n.style.cssText.substring(0, 200) : null
              });
            }
          }
          for (var j = 0; j < m.removedNodes.length; j++) {
            var r = m.removedNodes[j];
            if (r.nodeType === 1) {
              _push('dom:remove', {
                parent: m.target.id || m.target.tagName,
                tag: r.tagName,
                id: r.id || null,
                src: r.src ? r.src.replace(/^.*\/tiles\//, '…/tiles/').substring(0, 120) : null
              });
            }
          }
        } else if (m.type === 'attributes') {
          var tgt = m.target;
          var val = tgt.getAttribute(m.attributeName);
          _push('dom:attr', {
            tag: tgt.tagName,
            id: tgt.id || null,
            attr: m.attributeName,
            oldValue: (m.oldValue || '').substring(0, 120),
            newValue: (val || '').substring(0, 120)
          });
        }
      });
    });
    _mutObserver.observe(area, {
      childList: true, subtree: true,
      attributes: true, attributeOldValue: true,
      attributeFilter: ['src', 'style', 'class', 'opacity', 'transform']
    });
  }

  function _stopMutationObserver() {
    if (_mutObserver) { _mutObserver.disconnect(); _mutObserver = null; }
  }

  // ── rAF sampler for transform + scale ────────────────────────────────────
  function _rafSample() {
    if (!_recording) return;
    _rafHandle = requestAnimationFrame(_rafSample);

    try {
      var wrap = document.getElementById('dv-img-wrap');
      if (wrap) {
        var t = wrap.style.transform || '';
        if (t !== _lastTransform) {
          _push('view:transform', { transform: t });
          _lastTransform = t;
        }
      }
      // Scale from TiledPdf state (exported on window if we're in dbg mode)
      var tp = window._frt && window._frt.TiledPdf;
      // Fallback: parse scale from the transform string
      if (wrap) {
        var m = (_lastTransform || '').match(/scale\(([\d.]+)\)/);
        if (m) {
          var s = parseFloat(m[1]);
          if (s !== _lastScale) {
            _push('view:scale', { scale: s });
            _lastScale = s;
          }
        }
      }
    } catch (_) {}
  }

  // ── Periodic memory snapshot ─────────────────────────────────────────────
  function _snapshotMemory() {
    if (!_recording) return;
    try {
      var layer = document.getElementById('dv-tiles-layer');
      var mc = document.getElementById('markup-canvas');
      var wc = document.getElementById('markup-webgl-canvas');
      var dvi = document.getElementById('dv-image');
      var kids = layer ? layer.children : [];
      var pageMix = {};
      for (var i = 0; i < kids.length; i++) {
        var src = kids[i].src || '';
        var m = src.match(/\/page-(\d+)\//);
        var lm = src.match(/\/level-(\d+)\//);
        var key = (m ? 'p' + m[1] : 'p?') + '_' + (lm ? 'L' + lm[1] : 'L?');
        pageMix[key] = (pageMix[key] || 0) + 1;
      }
      _push('mem:snap', {
        tileDomCount: kids.length,
        tilePageLevelMix: pageMix,
        mc: mc ? { w: mc.width, h: mc.height } : null,
        wc: wc ? { w: wc.width, h: wc.height } : null,
        dvImage: dvi ? {
          src: (dvi.src || '').substring(0, 200),
          display: getComputedStyle(dvi).display,
          opacity: getComputedStyle(dvi).opacity,
          natural: { w: dvi.naturalWidth, h: dvi.naturalHeight }
        } : null,
        perf_memory: (performance && performance.memory) ? {
          used: Math.round(performance.memory.usedJSHeapSize / 1048576),
          total: Math.round(performance.memory.totalJSHeapSize / 1048576),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
        } : null
      });
    } catch (_) {}
  }

  // ── html2canvas thumbnail ─────────────────────────────────────────────────
  function _loadHtml2Canvas() {
    if (_html2canvasLoaded) return Promise.resolve();
    if (_html2canvasLoading) return _html2canvasLoading;
    _html2canvasLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = function () { _html2canvasLoaded = true; resolve(); };
      s.onerror = function () { reject(new Error('html2canvas load failed')); };
      document.head.appendChild(s);
    });
    return _html2canvasLoading;
  }

  function _captureThumb(eventIdx, tag) {
    if (!_recording) return;
    if (_now() - _lastThumbAt < MAX_THUMB_INTERVAL_MS) return;
    if (_thumbsPending >= 3) return; // back-pressure
    _lastThumbAt = _now();
    _thumbsPending++;

    _loadHtml2Canvas().then(function () {
      if (!_recording) { _thumbsPending--; return; }
      var target = document.getElementById('dv-canvas-area') || document.body;
      // html2canvas options tuned for thumbnail, not fidelity
      window.html2canvas(target, {
        scale: Math.min(1, THUMB_WIDTH / target.clientWidth),
        backgroundColor: '#000',
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 800,
        ignoreElements: function (el) {
          // Skip the dbg overlay and anything marked as diag-hidden
          return (el.id === 'dbg-overlay' ||
                  el.id === 's97-crash-report' ||
                  el.id === 's97-recorder-panel' ||
                  el.classList.contains('diag-hidden'));
        }
      }).then(function (canvas) {
        if (!_recording) { _thumbsPending--; return; }
        try {
          var dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          _thumbs[eventIdx] = dataUrl;
          _push('thumb:ok', { forEvent: eventIdx, tag: tag, sizeKB: Math.round(dataUrl.length / 1024) });
        } catch (e) {
          _push('thumb:err', { forEvent: eventIdx, err: e.message });
        }
        _thumbsPending--;
      }).catch(function (e) {
        _push('thumb:err', { forEvent: eventIdx, err: e.message });
        _thumbsPending--;
      });
    }).catch(function (e) {
      _push('thumb:loadErr', { err: e.message });
      _thumbsPending--;
    });
  }

  // ── Milestone detector (piggy-back on _dbgLife via localStorage ring) ────
  // We can't hook into tiledPdf.js from outside, so we poll the life ring
  // and mirror new events. Trigger thumbnails on significant ones.
  var _lastLifeSeen = 0;
  function _pollLifeRing() {
    if (!_recording) return;
    try {
      var ring = JSON.parse(localStorage.getItem('_frtS97LifeRing') || '[]');
      for (var i = 0; i < ring.length; i++) {
        var r = ring[i];
        if (r.t <= _lastLifeSeen) continue;
        _lastLifeSeen = r.t;
        var idx = _push('life', r);
        // Trigger a thumbnail for visual milestones only
        if (r.tag === 'open:manifest-applied' ||
            r.tag === 'level-change' ||
            r.tag === 'close:end') {
          _captureThumb(idx, r.tag);
        }
      }
    } catch (_) {}
  }

  // ── Window-level event hooks ─────────────────────────────────────────────
  var _winListeners = [];
  function _hookWindowEvents() {
    var evts = ['resize', 'orientationchange', 'visibilitychange', 'pagehide', 'pageshow', 'online', 'offline'];
    evts.forEach(function (name) {
      var fn = function (e) {
        _push('win:' + name, {
          w: window.innerWidth, h: window.innerHeight,
          dpr: window.devicePixelRatio,
          hidden: document.hidden
        });
      };
      window.addEventListener(name, fn, true);
      _winListeners.push({ name: name, fn: fn });
    });
    // Scroll/pointer gestures on canvas area
    var area = document.getElementById('dv-canvas-area');
    if (area) {
      var ptrEvts = ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'wheel', 'gesturestart', 'gesturechange', 'gestureend'];
      ptrEvts.forEach(function (name) {
        var fn = function (e) {
          var touches = e.touches ? e.touches.length : 0;
          _push('ptr:' + name, {
            touches: touches,
            scale: e.scale || null,
            rotation: e.rotation || null,
            clientX: e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || null,
            clientY: e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || null
          });
        };
        area.addEventListener(name, fn, { passive: true, capture: true });
        _winListeners.push({ name: name, fn: fn, target: area });
      });
    }
  }

  function _unhookWindowEvents() {
    _winListeners.forEach(function (l) {
      (l.target || window).removeEventListener(l.name, l.fn, true);
    });
    _winListeners = [];
  }

  // ── Start / Stop ─────────────────────────────────────────────────────────
  function start() {
    if (_recording) return;
    _recording = true;
    _sessionId = 'rec_' + _now() + '_' + Math.random().toString(36).slice(2, 6);
    _startedAt = _now();
    _events = [];
    _thumbs = {};
    _lastTransform = null;
    _lastScale = null;
    _lastLifeSeen = 0;
    _lastThumbAt = 0;
    _thumbsPending = 0;

    _push('session:start', {
      sessionId: _sessionId,
      ua: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }
    });

    // Initial full memory snapshot
    _snapshotMemory();

    // Capture one thumbnail immediately so we have a baseline
    _loadHtml2Canvas().then(function () {
      if (_recording) _captureThumb(_events.length - 1, 'baseline');
    });

    _patchConsole();
    _startMutationObserver();
    _hookWindowEvents();

    _rafHandle = requestAnimationFrame(_rafSample);
    _periodicTimer = setInterval(function () {
      _snapshotMemory();
      _pollLifeRing();
    }, 500);

    console.log('%c[REC] START ' + _sessionId, 'color:#fff;background:#c00;padding:2px 6px');
    _updatePanelState();
  }

  function stop() {
    if (!_recording) return;

    _push('session:stop', {
      eventCount: _events.length,
      thumbCount: Object.keys(_thumbs).length,
      thumbsPending: _thumbsPending
    });

    _recording = false;

    if (_rafHandle) { cancelAnimationFrame(_rafHandle); _rafHandle = null; }
    if (_periodicTimer) { clearInterval(_periodicTimer); _periodicTimer = null; }
    _stopMutationObserver();
    _unhookWindowEvents();
    _unpatchConsole();

    console.log('%c[REC] STOP  ' + _sessionId + '  events=' + _events.length + '  thumbs=' + Object.keys(_thumbs).length, 'color:#fff;background:#060;padding:2px 6px');
    _updatePanelState();
  }

  function buildExport() {
    return {
      sessionId: _sessionId,
      startedAt: _startedAt,
      stoppedAt: _now(),
      durationMs: _now() - _startedAt,
      ua: navigator.userAgent,
      viewport: {
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: window.devicePixelRatio
      },
      url: window.location.href,
      eventCount: _events.length,
      thumbCount: Object.keys(_thumbs).length,
      events: _events,
      thumbs: _thumbs,
      lifecycleRing: (function () {
        try { return JSON.parse(localStorage.getItem('_frtS97LifeRing') || '[]'); }
        catch (_) { return null; }
      })(),
      periodicRing: (function () {
        try { return JSON.parse(localStorage.getItem('_frtS97DbgRing') || '[]'); }
        catch (_) { return null; }
      })()
    };
  }

  function exportToClipboard() {
    var data = buildExport();
    // Compact JSON — one line, no indentation (smaller)
    var json = JSON.stringify(data);
    var ok = function (result) {
      console.log('%c[REC] EXPORT  ' + Math.round(json.length / 1024) + ' KB  ' +
        data.events.length + ' events  ' + data.thumbCount + ' thumbs  ' +
        (result ? 'copied ✓' : 'copy failed'),
        'color:#fff;background:#c5a000;padding:2px 6px');
      _updatePanelState(result ? 'Exported ✓' : 'Copy failed');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () { ok(true); }, function () {
        // Fallback to textarea
        try {
          var ta = document.createElement('textarea');
          ta.value = json;
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
          document.body.appendChild(ta);
          ta.focus(); ta.select();
          var done = false;
          try { done = document.execCommand('copy'); } catch (_) {}
          document.body.removeChild(ta);
          ok(done);
        } catch (_) { ok(false); }
      });
    } else {
      try {
        var ta2 = document.createElement('textarea');
        ta2.value = json;
        ta2.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta2);
        ta2.focus(); ta2.select();
        var done2 = document.execCommand('copy');
        document.body.removeChild(ta2);
        ok(done2);
      } catch (_) { ok(false); }
    }
  }

  // ── UI panel ─────────────────────────────────────────────────────────────
  var _panel = null;
  var _statusEl = null;

  function _createPanel() {
    if (_panel) return;
    _panel = document.createElement('div');
    _panel.id = 's97-recorder-panel';
    _panel.className = 'diag-hidden'; // exclude from html2canvas captures
    _panel.style.cssText =
      'position:fixed;right:8px;bottom:8px;z-index:99998;' +
      'background:rgba(30,30,30,0.95);color:#fff;font:11px/1.3 -apple-system,system-ui,sans-serif;' +
      'padding:8px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.5);' +
      'display:flex;flex-direction:column;gap:6px;min-width:160px;' +
      '-webkit-tap-highlight-color:transparent;';

    var title = document.createElement('div');
    title.textContent = 'S97 Recorder';
    title.style.cssText = 'font-weight:700;font-size:10px;opacity:0.7;letter-spacing:0.5px;';
    _panel.appendChild(title);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;';

    var btnStart = document.createElement('button');
    btnStart.type = 'button';
    btnStart.id = 's97-rec-start';
    btnStart.textContent = '\u26AB Record';
    btnStart.style.cssText = _btnStyle('#c0392b');
    btnStart.addEventListener('click', function (e) { e.stopPropagation(); start(); });
    btnRow.appendChild(btnStart);

    var btnStop = document.createElement('button');
    btnStop.type = 'button';
    btnStop.id = 's97-rec-stop';
    btnStop.textContent = '\u23F9 Stop';
    btnStop.style.cssText = _btnStyle('#555');
    btnStop.disabled = true;
    btnStop.addEventListener('click', function (e) { e.stopPropagation(); stop(); });
    btnRow.appendChild(btnStop);

    _panel.appendChild(btnRow);

    var btnExport = document.createElement('button');
    btnExport.type = 'button';
    btnExport.id = 's97-rec-export';
    btnExport.textContent = '\uD83D\uDCCB Export to clipboard';
    btnExport.style.cssText = _btnStyle('#2c7cb0') + 'width:100%;';
    btnExport.disabled = true;
    btnExport.addEventListener('click', function (e) { e.stopPropagation(); exportToClipboard(); });
    _panel.appendChild(btnExport);

    _statusEl = document.createElement('div');
    _statusEl.id = 's97-rec-status';
    _statusEl.style.cssText = 'font-size:10px;opacity:0.8;white-space:pre;';
    _statusEl.textContent = 'Idle';
    _panel.appendChild(_statusEl);

    document.body.appendChild(_panel);

    // Update status every 250ms while recording
    setInterval(function () {
      if (_recording && _statusEl) {
        _statusEl.textContent =
          'REC \u2022 ' + Math.round((_now() - _startedAt) / 1000) + 's  ' +
          _events.length + ' events  ' +
          Object.keys(_thumbs).length + ' thumbs' +
          (_thumbsPending ? ' (' + _thumbsPending + ' pending)' : '');
      }
    }, 250);
  }

  function _btnStyle(bg) {
    return 'background:' + bg + ';color:#fff;border:0;border-radius:4px;' +
      'padding:6px 10px;font:600 11px/1 -apple-system,system-ui,sans-serif;' +
      'cursor:pointer;flex:1;' +
      '-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
  }

  function _updatePanelState(overrideMsg) {
    if (!_panel) return;
    var btnStart = document.getElementById('s97-rec-start');
    var btnStop = document.getElementById('s97-rec-stop');
    var btnExport = document.getElementById('s97-rec-export');
    if (btnStart) {
      btnStart.disabled = _recording;
      btnStart.style.opacity = _recording ? '0.5' : '1';
    }
    if (btnStop) {
      btnStop.disabled = !_recording;
      btnStop.style.opacity = _recording ? '1' : '0.5';
      btnStop.style.background = _recording ? '#c0392b' : '#555';
    }
    if (btnExport) {
      btnExport.disabled = _recording || _events.length === 0;
      btnExport.style.opacity = btnExport.disabled ? '0.5' : '1';
    }
    if (_statusEl) {
      if (overrideMsg) {
        _statusEl.textContent = overrideMsg;
      } else if (_recording) {
        _statusEl.textContent = 'REC \u2022 starting...';
      } else if (_events.length > 0) {
        _statusEl.textContent = 'Stopped \u2022 ' +
          _events.length + ' events, ' +
          Object.keys(_thumbs).length + ' thumbs';
      } else {
        _statusEl.textContent = 'Idle';
      }
    }
  }

  // Expose on window for console debugging + explicit helpers
  window._frtRec = {
    start: start,
    stop: stop,
    exportToClipboard: exportToClipboard,
    isRecording: function () { return _recording; },
    getEvents: function () { return _events; },
    getThumbs: function () { return _thumbs; }
  };

  // Auto-create panel when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _createPanel);
  } else {
    _createPanel();
  }

  console.log('%c[REC] Recorder module loaded — ' +
    'click "⚫ Record" in bottom-right panel, reproduce bug, click "⏹ Stop", ' +
    'click "📋 Export to clipboard"',
    'color:#fff;background:#333;padding:2px 6px');

})();
