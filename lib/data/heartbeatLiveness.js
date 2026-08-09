/* lib/data/heartbeatLiveness.js — ONE IMPLEMENTATION, TWO TOOLS (S630)
 * ══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AT ALL
 *
 * S624 fixed the Android sync gag in Diesel and PORTED the fix to Electric by
 * copying ~90 lines. That was flagged at the time as a judgement call with a
 * stated cost — "two copies means two places to keep in step" — and then never
 * revisited. The cost arrived exactly where predicted: Electric received
 * layers 1-3 and silently missed layer 4, because the copy carried the
 * staleness HELPERS but Electric had no readout for them to write to. The
 * helpers sat there, defined and never called, for six sessions.
 *
 * The toolkit's own principle is "engine shared, personality per-tool config".
 * A copied fix is not a shared fix; it is a second thing to forget.
 *
 * WHAT THIS OWNS (the engine): the timeout on a hung check, the watchdog on
 * the busy flag, the liveness check on the timer, and the staleness threshold.
 * WHAT THE HOST KEEPS (the personality): its own timer variable, its own
 * status text, and how it renders the warning — Diesel through its header
 * controller, Electric through its own. Storage paths and render calls are
 * deliberately NOT shared; that is the line the toolkit has held since S479.
 *
 * THE FAULT IT GUARDS, restated so it is never re-introduced: a heartbeat that
 * raises a busy flag before an UN-TIMED await is permanently gagged by a fetch
 * that HANGS rather than fails — a hung request neither resolves nor rejects,
 * so the flag never lowers, the timer keeps firing, and every beat returns at
 * the gate before any logging can run. That is why the device went silent
 * instead of loud (Mark, 07 Aug, and-ceerf7 at 21:22Z).
 */

export function createHeartbeatLiveness(cfg) {
  cfg = cfg || {};
  var TICK_TIMEOUT_MS  = cfg.tickTimeoutMs  || 20000;
  var GAG_WATCHDOG_MS  = cfg.gagWatchdogMs  || 45000;
  var STALE_FLOOR_MS   = cfg.staleFloorMs   || 90000;

  var _running = false;
  var _raisedAt = 0;
  var _lastDoneAt = 0;
  var _wired = false;

  function _diag(outcome, extra) {
    try {
      if (!cfg.reportDiag) return;
      cfg.reportDiag('push_result', Object.assign({
        outcome: outcome,
        heldForMs: _raisedAt ? (Date.now() - _raisedAt) : 0,
        sinceLastTickMs: _lastDoneAt ? (Date.now() - _lastDoneAt) : null,
        visibilityState: (typeof document !== 'undefined' ? document.visibilityState : 'unknown'),
        online: (typeof navigator !== 'undefined' ? navigator.onLine : null)
      }, extra || {}));
    } catch (_) {}
  }

  /* THE STALENESS CONTRACT — deliberately not a fixed number of minutes. The
     scheduler already declares how often it intends to check, so staleness is
     "three intended checks missed", with a floor so a 15s cadence does not nag
     over one slow round trip. Retune the cadence, or let Realtime make
     scheduled beats rare, and this follows on its own. */
  function staleThresholdMs() {
    var iv = 15000;
    try { if (cfg.desiredIntervalMs) iv = cfg.desiredIntervalMs() || iv; } catch (_) {}
    return Math.max(3 * iv, STALE_FLOOR_MS);
  }
  function isStale() {
    var last = _lastDoneAt || (cfg.lastCloudContactAt ? cfg.lastCloudContactAt() : 0);
    if (!last) return false;
    return (Date.now() - last) > staleThresholdMs();
  }

  return {
    VERSION: '1.0.0',
    staleThresholdMs: staleThresholdMs,
    isStale: isStale,
    lastDoneAt: function () { return _lastDoneAt; },

    /** Wrap one beat. The host passes the work; this owns whether it may run,
     *  how long it may hold the flag, and what is reported when it does not. */
    runTick: function (doTick) {
      /* LAYER 2 — watchdog the FLAG itself, so a failure nobody imagined still
         breaks out within a minute. */
      if (_running && _raisedAt && (Date.now() - _raisedAt) > GAG_WATCHDOG_MS) {
        _diag('heartbeat-gag-released');
        _running = false; _raisedAt = 0;
      }
      if (_running) return Promise.resolve(false);
      _running = true; _raisedAt = Date.now();

      /* LAYER 1 — timeout the wait. The work is not cancelled (fetch cannot
         be), but it no longer OWNS the flag, so the next beat runs. */
      return Promise.race([
        Promise.resolve().then(doTick),
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('heartbeat-tick-timeout')); }, TICK_TIMEOUT_MS);
        })
      ]).then(function () {
        /* A tick that returned WITHOUT touching the network is not cloud
           contact. Counting it made a device in airplane mode refresh its own
           freshness every 15s and report itself healthy — a stalled tool
           reassuring the person, which is the hazard staleness exists to kill. */
        if (typeof navigator === 'undefined' || navigator.onLine !== false) _lastDoneAt = Date.now();
        return true;
      }).catch(function (e) {
        if (e && String(e.message || e).indexOf('heartbeat-tick-timeout') !== -1) {
          _diag('heartbeat-tick-timeout', { timeoutMs: TICK_TIMEOUT_MS });
        }
        return false;
      }).then(function (ok) {
        /* Released HERE, never on the happy path only — a throw between the
           raise and the lower was the same permanent gag by another route. */
        _running = false; _raisedAt = 0;
        return ok;
      });
    },

    /** LAYER 3 — a timeout cannot rescue a timer that STOPPED FIRING, which is
     *  exactly what Android does to a backgrounded tab it never resumes. */
    checkLiveness: function (why) {
      try {
        if (cfg.isActive && !cfg.isActive()) return;
        var noTimer = cfg.hasTimer ? !cfg.hasTimer() : false;
        var silent = _lastDoneAt && (Date.now() - _lastDoneAt) > staleThresholdMs();
        if (noTimer || silent) {
          _diag('heartbeat-timer-restarted', { why: why, noTimer: noTimer, silent: !!silent });
          try { if (cfg.restart) cfg.restart(); } catch (_) {}
          try { if (cfg.wake) cfg.wake(); } catch (_) {}
        }
      } catch (_) {}
    },

    /** Wire the three moments a person returns to the tool. Idempotent. */
    wire: function () {
      if (_wired) return;
      _wired = true;
      var self = this;
      try {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') self.checkLiveness('tab-visible');
        });
        window.addEventListener('focus',  function () { self.checkLiveness('window-focus'); });
        window.addEventListener('online', function () { self.checkLiveness('online'); });
      } catch (_) {}
    },

    /** For on-device diagnosis, where no debugger is available. */
    stats: function () {
      return { running: _running, raisedAt: _raisedAt, lastDoneAt: _lastDoneAt,
               staleThresholdMs: staleThresholdMs(), stale: isStale() };
    }
  };
}
