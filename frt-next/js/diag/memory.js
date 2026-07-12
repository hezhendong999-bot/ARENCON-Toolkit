/**
 * ARENCON FRT v2 — Memory & GPU Diagnostics
 * ═════════════════════════════════════════════════════════════════════════
 *
 * S126 Phase D — Field-validation instrumentation.
 *
 * Purpose: surface enough state to diagnose memory and WebGL-context-loss
 * issues without needing a remote-debug session. Mark can open the console
 * on a field tablet, run window._frt.diagnostics.memory.report(), and read
 * out: canvas megapixel usage, context-loss counts, last incident
 * timestamp, and a one-line summary that can be screenshotted.
 *
 * The instrumentation is pure — no behavior changes, no DOM impact, no
 * additional network traffic, no IDB writes. A 60-second probe tick logs
 * a single info-level line when a drawing is open; otherwise the module
 * is silent.
 *
 * ─── Exposed API ───────────────────────────────────────────────────────
 *   Diag.memory.canvasMP()             → { main, overlay, webgl, total }
 *   Diag.memory.webglContextLost       → number
 *   Diag.memory.webglContextRestored   → number
 *   Diag.memory.lastContextLossAt      → ISO string | null
 *   Diag.memory.lastContextRestoreAt   → ISO string | null
 *   Diag.memory.recordWebglLoss()      → void   (called by markup.js)
 *   Diag.memory.recordWebglRestore()   → void   (called by markup.js)
 *   Diag.memory.report()               → printable string snapshot
 *   Diag.memory.startProbe(intervalMs) → starts periodic console log
 *   Diag.memory.stopProbe()            → stops periodic console log
 *
 *   Diag.sync.emptyArrayGuards         → number   (from SyncEngine.diag)
 *   Diag.sync.emptyArrayLog            → array    (from SyncEngine.diag)
 *
 * Accessed at runtime as window._frt.diagnostics (wired in app.js).
 *
 * ─── Why a separate module ─────────────────────────────────────────────
 * Field validation depends on counters surviving across drawing-open and
 * drawing-close cycles. Embedding state inside markup.js would reset on
 * Markup.destroy() every time the user closes a drawing — useless for
 * post-mortem analysis of "the tablet crashed an hour ago." A standalone
 * module owns the counters and outlives any per-drawing teardown.
 */

var _webglContextLost = 0;
var _webglContextRestored = 0;
var _lastContextLossAt = null;
var _lastContextRestoreAt = null;
var _probeTimer = null;
var _probeIntervalMs = 60000;

/**
 * Read megapixel size of a canvas element. Megapixels = (width × height) / 1e6.
 * Uses the canvas backing-store dimensions, NOT the CSS-displayed size.
 * Returns 0 if the canvas is not in the DOM, not yet allocated, or zero-sized.
 */
function _canvasMP(id) {
  var el = (typeof document !== 'undefined') ? document.getElementById(id) : null;
  if (!el || !el.width || !el.height) return 0;
  return (el.width * el.height) / 1e6;
}

function _round(n) { return Math.round(n * 10) / 10; }

export var Diag = {

  memory: {
    /**
     * Snapshot the current canvas memory load.
     * Returns megapixels per canvas + total. NOT bytes — that depends on
     * pixel format and browser, and is harder to interpret. MP is what the
     * S125 budget rules are stated in (50 MP main, 30 MP overlay) so this
     * matches the rule surface.
     */
    canvasMP: function() {
      var main = _canvasMP('markup-canvas');
      var overlay = _canvasMP('markup-overlay');
      // Pixi WebGL canvas is created dynamically by markup.js and inserted
      // alongside markup-canvas — find by class so we don't have to know
      // the exact id. Falls back to 0 if absent.
      var webgl = 0;
      if (typeof document !== 'undefined') {
        var w = document.querySelector('canvas.webgl-markup-canvas');
        if (w && w.width && w.height) webgl = (w.width * w.height) / 1e6;
      }
      return {
        main: _round(main),
        overlay: _round(overlay),
        webgl: _round(webgl),
        total: _round(main + overlay + webgl)
      };
    },

    get webglContextLost() { return _webglContextLost; },
    get webglContextRestored() { return _webglContextRestored; },
    get lastContextLossAt() { return _lastContextLossAt; },
    get lastContextRestoreAt() { return _lastContextRestoreAt; },

    /** Called by markup.js webglcontextlost handler. Idempotent — multiple
     *  losses without restores in between are all counted. */
    recordWebglLoss: function() {
      _webglContextLost++;
      _lastContextLossAt = new Date().toISOString();
      console.warn('[Diag-Mem] WebGL context lost #' + _webglContextLost +
                   ' at ' + _lastContextLossAt);
    },

    /** Called by markup.js webglcontextrestored handler. */
    recordWebglRestore: function() {
      _webglContextRestored++;
      _lastContextRestoreAt = new Date().toISOString();
      console.log('[Diag-Mem] WebGL context restored #' + _webglContextRestored +
                  ' at ' + _lastContextRestoreAt);
    },

    /**
     * Printable snapshot. One-liner suitable for screenshotting on a
     * field tablet. Includes canvas MP + context-loss counters + last
     * incident timestamps.
     */
    report: function() {
      var mp = this.canvasMP();
      var lines = [
        '── ARENCON FRT Memory Diag ──',
        'Canvas: main=' + mp.main + ' MP, overlay=' + mp.overlay +
          ' MP, webgl=' + mp.webgl + ' MP (total ' + mp.total + ' MP)',
        'WebGL: ' + _webglContextLost + ' lost / ' + _webglContextRestored + ' restored',
        'Last loss:    ' + (_lastContextLossAt || 'none'),
        'Last restore: ' + (_lastContextRestoreAt || 'none'),
        'Probe:        ' + (_probeTimer ? 'running ' + _probeIntervalMs + 'ms' : 'stopped')
      ];
      var out = lines.join('\n');
      console.log(out);
      return out;
    },

    /**
     * Start the 60-second periodic probe. Logs a single line per tick:
     *   [Diag-Mem] canvas: main=X MP overlay=Y MP total=Z MP | ctxLost=N
     * Probe is no-op if no markup canvas exists (drawing not open).
     * Intended to be called once at app boot; restart safe.
     */
    startProbe: function(intervalMs) {
      if (intervalMs) _probeIntervalMs = intervalMs;
      this.stopProbe();
      _probeTimer = setInterval(function() {
        var el = (typeof document !== 'undefined') ? document.getElementById('markup-canvas') : null;
        if (!el || !el.width) return; // no drawing open
        var mp = Diag.memory.canvasMP();
        console.log('[Diag-Mem] canvas main=' + mp.main +
                    ' overlay=' + mp.overlay + ' webgl=' + mp.webgl +
                    ' total=' + mp.total + ' MP | ctxLost=' + _webglContextLost);
      }, _probeIntervalMs);
    },

    stopProbe: function() {
      if (_probeTimer) { clearInterval(_probeTimer); _probeTimer = null; }
    }
  },

  // Lazy accessor — SyncEngine isn't necessarily loaded before Diag, so
  // resolve at call time via window.SyncEngine (set by sync.js at module
  // bottom for diagnostic access).
  get sync() {
    if (typeof window !== 'undefined' && window.SyncEngine && window.SyncEngine.diag) {
      return window.SyncEngine.diag;
    }
    return {
      emptyArrayGuards: 0,
      emptyArrayLog: [],
      lastSeenUpdatedAt: null,
      instanceId: null,
      pendingSync: false,
      online: (typeof navigator !== 'undefined') ? navigator.onLine : true
    };
  }
};

// Expose for console use even before app.js wires window._frt.diagnostics
if (typeof window !== 'undefined') {
  window._frtDiag = Diag;
}
