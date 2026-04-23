// frt/js/diag/recorder.js
// S97 — SLIM session recorder (v2). Text only, no screenshots.
//
// Previous version exported 1-10 MB of JSON including base64 PNG thumbnails,
// which exceeded what the user could paste into chat in one go. This version:
//
//   - NO screenshots / NO html2canvas (saves ~45 KB dependency + all base64)
//   - Aggregates tile DOM mutations into counters, not per-tile events
//   - Deduplicates identical consecutive events
//   - Caps total text output at ~60 KB (fits comfortably in a chat message)
//   - Emits a plain-text report, not JSON, for copy-paste readability
//
// What still gets captured:
//   - Every console.log / warn / error with truncated arguments
//   - Lifecycle events mirrored from _dbgLife ring (open/close/level/purge)
//   - Pointer gestures aggregated: touch sessions summarized as one event each
//   - Window events (resize, visibility, orientationchange)
//   - Periodic 500ms sampler: tile DOM count, per-level tile mix, canvas sizes,
//     JS heap if available — only emits when something changed since last tick
//   - Transform changes on dv-img-wrap (rAF-sampled, dedup on identical value)
//   - MutationObserver summaries: aggregated counts per 500ms bucket, not
//     individual tile add/remove events
//
// Usage:
//   1. Visit with ?dbg=1 (or call _frtDbgOn())
//   2. Floating dark panel appears bottom-right. Click ⚫ Record
//   3. Reproduce the bug
//   4. Click ⏹ Stop, then 📋 Copy
//   5. Paste text into chat

(function () {
  'use strict';

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
  var _events = [];             // aggregated event log
  var _rafHandle = null;
  var _periodicTimer = null;
  var _lastTransform = null;
  var _lastScale = null;
  var _mutObserver = null;
  var _mutBucket = null;        // { add, remove, attr } aggregated per flush interval
  var _lastPeriodicHash = '';   // dedup identical consecutive periodic samples
  var _lastLifeSeen = 0;

  // Caps
  var MAX_EVENTS = 3000;        // hard stop — beyond this we drop events
  var MAX_REPORT_CHARS = 60000; // ~60 KB output ceiling
  var MUT_FLUSH_MS = 500;       // aggregate mutations every 500ms

  // Saved originals for unpatching
  var _origConsole = {};
  var _consolePatched = false;
  var _winListeners = [];
  var _mutFlushTimer = null;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function _now() { return Date.now(); }
  function _rel() { return _now() - _startedAt; }

  function _push(type, payload) {
    if (!_recording || _events.length >= MAX_EVENTS) return;
    // Dedup identical consecutive entries (same type + same payload JSON)
    var rec = { t: _rel(), type: type };
    if (payload != null) rec.d = payload;
    var last = _events[_events.length - 1];
    if (last && last.type === type) {
      try {
        if (JSON.stringify(last.d) === JSON.stringify(payload)) {
          last._dup = (last._dup || 1) + 1;
          last.tEnd = rec.t;
          return;
        }
      } catch (_) {}
    }
    _events.push(rec);
  }

  function _str(v, cap) {
    cap = cap || 160;
    try {
      if (v == null) return String(v);
      if (typeof v === 'string') return v.length > cap ? v.substring(0, cap) + '…' : v;
      if (typeof v === 'number' || typeof v === 'boolean') return v;
      if (v instanceof Error) return 'ERR:' + (v.message || '?');
      if (v instanceof HTMLElement) {
        return '<' + v.tagName +
          (v.id ? '#' + v.id : '') +
          (v.src ? ' src=' + shortUrl(v.src) : '') + '>';
      }
      var s = JSON.stringify(v);
      return s.length > cap ? s.substring(0, cap) + '…' : s;
    } catch (_) { return '?'; }
  }

  function shortUrl(u) {
    if (!u) return '';
    // Strip long prefixes, keep the distinguishing suffix
    var m = u.match(/\/tiles\/[^/]*\/(page-\d+\/level-\d+\/[^/?]+)/);
    if (m) return '…' + m[1];
    var n = u.match(/\/photos\/.*\/([^/?]+)$/);
    if (n) return '…/' + n[1];
    return u.length > 80 ? '…' + u.substring(u.length - 60) : u;
  }

  // ── Console patch ────────────────────────────────────────────────────────
  function _patchConsole() {
    if (_consolePatched) return;
    ['log', 'warn', 'error'].forEach(function (level) {
      _origConsole[level] = console[level];
      console[level] = function () {
        try {
          var parts = [];
          var cap = arguments.length > 3 ? 3 : arguments.length;
          for (var i = 0; i < cap; i++) parts.push(_str(arguments[i], 120));
          _push('c.' + level[0], parts.join(' '));
        } catch (_) {}
        return _origConsole[level].apply(console, arguments);
      };
    });
    _consolePatched = true;
  }
  function _unpatchConsole() {
    if (!_consolePatched) return;
    ['log', 'warn', 'error'].forEach(function (level) {
      if (_origConsole[level]) console[level] = _origConsole[level];
    });
    _origConsole = {};
    _consolePatched = false;
  }

  // ── MutationObserver with aggregation ────────────────────────────────────
  function _newBucket() { return { add: 0, remove: 0, attr: 0, addSample: [], remSample: [] }; }

  function _flushMutBucket() {
    if (!_mutBucket) return;
    var b = _mutBucket;
    if (b.add || b.remove || b.attr) {
      var payload = { a: b.add, r: b.remove, ch: b.attr };
      if (b.addSample.length) payload.as = b.addSample.slice(0, 2);
      if (b.remSample.length) payload.rs = b.remSample.slice(0, 2);
      _push('dom', payload);
    }
    _mutBucket = _newBucket();
  }

  function _startMutationObserver() {
    var area = document.getElementById('dv-canvas-area');
    if (!area) return;
    _mutBucket = _newBucket();
    _mutObserver = new MutationObserver(function (mutations) {
      if (!_recording) return;
      mutations.forEach(function (m) {
        if (m.type === 'childList') {
          for (var i = 0; i < m.addedNodes.length; i++) {
            var n = m.addedNodes[i];
            if (n.nodeType === 1) {
              _mutBucket.add++;
              if (_mutBucket.addSample.length < 2) {
                _mutBucket.addSample.push(n.tagName + (n.src ? ' ' + shortUrl(n.src) : n.id ? '#' + n.id : ''));
              }
            }
          }
          for (var j = 0; j < m.removedNodes.length; j++) {
            var r = m.removedNodes[j];
            if (r.nodeType === 1) {
              _mutBucket.remove++;
              if (_mutBucket.remSample.length < 2) {
                _mutBucket.remSample.push(r.tagName + (r.src ? ' ' + shortUrl(r.src) : r.id ? '#' + r.id : ''));
              }
            }
          }
        } else if (m.type === 'attributes') {
          _mutBucket.attr++;
        }
      });
    });
    _mutObserver.observe(area, {
      childList: true, subtree: true,
      attributes: true,
      attributeFilter: ['src', 'style', 'class']
    });
    _mutFlushTimer = setInterval(_flushMutBucket, MUT_FLUSH_MS);
  }
  function _stopMutationObserver() {
    if (_mutFlushTimer) { clearInterval(_mutFlushTimer); _mutFlushTimer = null; }
    _flushMutBucket();
    if (_mutObserver) { _mutObserver.disconnect(); _mutObserver = null; }
    _mutBucket = null;
  }

  // ── rAF sampler for transform + scale ────────────────────────────────────
  function _rafSample() {
    if (!_recording) return;
    _rafHandle = requestAnimationFrame(_rafSample);
    try {
      var wrap = document.getElementById('dv-img-wrap');
      if (!wrap) return;
      var t = wrap.style.transform || '';
      if (t !== _lastTransform) {
        var m = t.match(/scale\(([\d.]+)\)/);
        var scale = m ? parseFloat(m[1]) : null;
        // Only log transform on scale change or on large pan (not every pixel)
        if (scale !== _lastScale) {
          _push('view', { s: scale == null ? null : +scale.toFixed(3) });
          _lastScale = scale;
        }
        _lastTransform = t;
      }
    } catch (_) {}
  }

  // ── Periodic snapshot (dedup on hash) ────────────────────────────────────
  function _snapshot() {
    if (!_recording) return;
    try {
      var layer = document.getElementById('dv-tiles-layer');
      var mc = document.getElementById('markup-canvas');
      var wc = document.getElementById('markup-webgl-canvas');
      var dvi = document.getElementById('dv-image');
      var kids = layer ? layer.children : [];
      var mix = {};
      for (var i = 0; i < kids.length; i++) {
        var src = kids[i].src || '';
        var pm = src.match(/\/page-(\d+)\//);
        var lm = src.match(/\/level-(\d+)\//);
        var k = (pm ? 'p' + pm[1] : 'p?') + 'L' + (lm ? lm[1] : '?');
        mix[k] = (mix[k] || 0) + 1;
      }
      var snap = {
        n: kids.length,
        mix: mix,
        mc: mc ? (mc.width + 'x' + mc.height) : '-',
        wc: wc ? (wc.width + 'x' + wc.height) : '-',
        bg: dvi ? (dvi.src ? 'set' : 'blank') : '-',
        bgD: dvi ? getComputedStyle(dvi).display : '-'
      };
      if (performance && performance.memory) {
        snap.heap = Math.round(performance.memory.usedJSHeapSize / 1048576);
      }
      var hash = JSON.stringify(snap);
      if (hash !== _lastPeriodicHash) {
        _push('snap', snap);
        _lastPeriodicHash = hash;
      }
    } catch (_) {}
  }

  // ── Lifecycle ring mirror ────────────────────────────────────────────────
  function _pollLife() {
    if (!_recording) return;
    try {
      var ring = JSON.parse(localStorage.getItem('_frtS97LifeRing') || '[]');
      for (var i = 0; i < ring.length; i++) {
        var r = ring[i];
        if (r.t <= _lastLifeSeen) continue;
        _lastLifeSeen = r.t;
        var payload = {
          tag: r.tag,
          dwg: r.drawingId ? r.drawingId.substring(r.drawingId.length - 14) : '-',
          pg: r.pageNumber
        };
        if (r.extra) payload.x = r.extra;
        _push('life', payload);
      }
    } catch (_) {}
  }

  // ── Window events ────────────────────────────────────────────────────────
  function _hookWindowEvents() {
    ['resize', 'orientationchange', 'visibilitychange'].forEach(function (name) {
      var fn = function () {
        _push('win.' + name, {
          w: window.innerWidth, h: window.innerHeight,
          hidden: document.hidden
        });
      };
      window.addEventListener(name, fn, true);
      _winListeners.push({ target: window, name: name, fn: fn });
    });
    // Pointer gestures aggregated per session
    var area = document.getElementById('dv-canvas-area');
    if (area) {
      var gestureStart = null;
      var gestureFn = function (e) {
        if (e.type === 'gesturestart' || e.type === 'touchstart') {
          gestureStart = { t: _rel(), touches: (e.touches && e.touches.length) || 1 };
        } else if (e.type === 'gestureend' || e.type === 'touchend') {
          if (gestureStart) {
            _push('gesture', {
              touches: gestureStart.touches,
              dur: _rel() - gestureStart.t,
              scale: e.scale != null ? +e.scale.toFixed(2) : null
            });
            gestureStart = null;
          }
        }
      };
      ['gesturestart', 'gestureend', 'touchstart', 'touchend'].forEach(function (name) {
        area.addEventListener(name, gestureFn, { passive: true, capture: true });
        _winListeners.push({ target: area, name: name, fn: gestureFn });
      });
    }
  }
  function _unhookWindowEvents() {
    _winListeners.forEach(function (l) {
      try { l.target.removeEventListener(l.name, l.fn, true); } catch (_) {}
    });
    _winListeners = [];
  }

  // ── Start / Stop ─────────────────────────────────────────────────────────
  function start() {
    if (_recording) return;
    _recording = true;
    _sessionId = 'r' + (_now() % 100000).toString(36);
    _startedAt = _now();
    _events = [];
    _lastTransform = null;
    _lastScale = null;
    _lastLifeSeen = 0;
    _lastPeriodicHash = '';

    _push('start', {
      ua: _str(navigator.userAgent, 120),
      w: window.innerWidth, h: window.innerHeight,
      dpr: window.devicePixelRatio,
      url: shortUrl(window.location.href)
    });
    _snapshot();

    _patchConsole();
    _startMutationObserver();
    _hookWindowEvents();

    _rafHandle = requestAnimationFrame(_rafSample);
    _periodicTimer = setInterval(function () {
      _snapshot();
      _pollLife();
    }, 500);

    console.log('%c[REC] START ' + _sessionId, 'color:#fff;background:#c00;padding:2px 6px');
    _updatePanel();
  }

  function stop() {
    if (!_recording) return;
    _push('stop', { n: _events.length });
    _recording = false;
    if (_rafHandle) { cancelAnimationFrame(_rafHandle); _rafHandle = null; }
    if (_periodicTimer) { clearInterval(_periodicTimer); _periodicTimer = null; }
    _stopMutationObserver();
    _unhookWindowEvents();
    _unpatchConsole();
    console.log('%c[REC] STOP ' + _sessionId + ' events=' + _events.length,
      'color:#fff;background:#060;padding:2px 6px');
    _updatePanel();
  }

  // ── Report builder (plain text, not JSON) ────────────────────────────────
  function _buildReport() {
    var lines = [];
    lines.push('=== ARENCON FRT S97 recording ' + _sessionId + ' ===');
    lines.push('UA: ' + (navigator.userAgent || '').substring(0, 120));
    lines.push('Viewport: ' + window.innerWidth + 'x' + window.innerHeight + ' DPR:' + window.devicePixelRatio);
    lines.push('Duration: ' + Math.round((_now() - _startedAt) / 1000) + 's, ' + _events.length + ' events');
    lines.push('');

    // One event per line, compact format
    for (var i = 0; i < _events.length; i++) {
      var e = _events[i];
      var time = e.t < 10000 ? ('+' + e.t + 'ms') : ('+' + (e.t / 1000).toFixed(1) + 's');
      var pad = (time + '        ').substring(0, 8);
      var tag = (e.type + '        ').substring(0, 8);
      var body = '';
      if (e.d != null) {
        if (typeof e.d === 'string') body = e.d;
        else {
          try { body = JSON.stringify(e.d); } catch (_) { body = '?'; }
        }
      }
      var dup = e._dup ? ' x' + e._dup : '';
      var line = pad + ' ' + tag + ' ' + body + dup;
      // Per-line truncation to ensure a runaway event can't explode the report
      if (line.length > 240) line = line.substring(0, 237) + '…';
      lines.push(line);
      // Stop before we blow the cap
      if (lines.join('\n').length > MAX_REPORT_CHARS - 200) {
        lines.push('… [' + (_events.length - i - 1) + ' more events truncated to fit ' + MAX_REPORT_CHARS + ' char cap]');
        break;
      }
    }
    return lines.join('\n');
  }

  function copyToClipboard() {
    var text = _buildReport();
    console.log(text);
    var done = function (ok) {
      _setStatus(ok ? ('Copied ✓ ' + Math.round(text.length / 1024) + 'KB') : 'Copy failed');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
        _fallbackCopy(text, done);
      });
    } else {
      _fallbackCopy(text, done);
    }
  }

  function _fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      done(ok);
    } catch (_) { done(false); }
  }

  // ── UI panel ─────────────────────────────────────────────────────────────
  var _panel = null;
  var _statusEl = null;

  function _createPanel() {
    if (_panel) return;
    _panel = document.createElement('div');
    _panel.id = 's97-recorder-panel';
    _panel.className = 'diag-hidden';
    _panel.style.cssText =
      'position:fixed;right:8px;bottom:8px;z-index:99998;' +
      'background:rgba(30,30,30,0.95);color:#fff;font:11px/1.3 -apple-system,system-ui,sans-serif;' +
      'padding:8px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.5);' +
      'display:flex;flex-direction:column;gap:6px;min-width:150px;' +
      '-webkit-tap-highlight-color:transparent;';

    var title = document.createElement('div');
    title.textContent = 'S97 Recorder (slim)';
    title.style.cssText = 'font-weight:700;font-size:10px;opacity:0.7;letter-spacing:0.5px;';
    _panel.appendChild(title);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;';

    var btnStart = _mkBtn('s97-rec-start', '\u26AB Record', '#c0392b', function () { start(); });
    btnRow.appendChild(btnStart);
    var btnStop = _mkBtn('s97-rec-stop', '\u23F9 Stop', '#555', function () { stop(); });
    btnStop.disabled = true;
    btnRow.appendChild(btnStop);
    _panel.appendChild(btnRow);

    var btnCopy = _mkBtn('s97-rec-copy', '\uD83D\uDCCB Copy', '#2c7cb0', function () { copyToClipboard(); });
    btnCopy.style.width = '100%';
    btnCopy.disabled = true;
    _panel.appendChild(btnCopy);

    _statusEl = document.createElement('div');
    _statusEl.id = 's97-rec-status';
    _statusEl.style.cssText = 'font-size:10px;opacity:0.8;white-space:pre;';
    _statusEl.textContent = 'Idle';
    _panel.appendChild(_statusEl);

    document.body.appendChild(_panel);

    setInterval(function () {
      if (_recording && _statusEl) {
        _statusEl.textContent = 'REC ' + Math.round((_now() - _startedAt) / 1000) + 's  ' +
          _events.length + '/' + MAX_EVENTS + ' events';
      }
    }, 250);
  }

  function _mkBtn(id, label, bg, onclick) {
    var b = document.createElement('button');
    b.type = 'button'; b.id = id; b.textContent = label;
    b.style.cssText = 'background:' + bg + ';color:#fff;border:0;border-radius:4px;' +
      'padding:6px 10px;font:600 11px/1 -apple-system,system-ui,sans-serif;' +
      'cursor:pointer;flex:1;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
    b.addEventListener('click', function (e) { e.stopPropagation(); onclick(); });
    return b;
  }

  function _updatePanel() {
    var start_ = document.getElementById('s97-rec-start');
    var stop_ = document.getElementById('s97-rec-stop');
    var copy_ = document.getElementById('s97-rec-copy');
    if (start_) { start_.disabled = _recording; start_.style.opacity = _recording ? '0.5' : '1'; }
    if (stop_) { stop_.disabled = !_recording; stop_.style.opacity = _recording ? '1' : '0.5'; }
    if (copy_) { copy_.disabled = _recording || _events.length === 0; copy_.style.opacity = copy_.disabled ? '0.5' : '1'; }
    if (_statusEl) {
      if (_recording) _statusEl.textContent = 'REC starting...';
      else if (_events.length > 0) _statusEl.textContent = 'Stopped \u2022 ' + _events.length + ' events';
      else _statusEl.textContent = 'Idle';
    }
  }

  function _setStatus(msg) {
    if (_statusEl) {
      _statusEl.textContent = msg;
      setTimeout(_updatePanel, 2000);
    }
  }

  window._frtRec = {
    start: start, stop: stop, copy: copyToClipboard,
    isRecording: function () { return _recording; },
    getEvents: function () { return _events; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _createPanel);
  } else {
    _createPanel();
  }

  console.log('%c[REC] Slim recorder loaded — panel bottom-right. Cap: ' +
    MAX_EVENTS + ' events, ' + (MAX_REPORT_CHARS / 1024) + ' KB text output.',
    'color:#fff;background:#333;padding:2px 6px');
})();
