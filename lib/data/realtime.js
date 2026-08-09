/* lib/data/realtime.js — LIVE CHANGE NOTIFICATIONS (S629)
 * ══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS, AND MORE IMPORTANTLY WHAT IT IS NOT
 *
 * This module opens one socket to Supabase Realtime and reports a single
 * fact: "the row you are working on changed." That is the whole contract.
 *
 * It NEVER carries report data, NEVER decides who wins, and NEVER writes
 * anything. On a notification the host runs exactly the pull and merge it
 * already runs on a heartbeat — same stamps, same merge law, same collision
 * door, same offline handling. If every socket in the fleet died, the tool
 * would behave precisely as it does today, only slower to notice. That
 * property is deliberate: this arrives on top of a week of merge fixes, and
 * a transport that could change an outcome would make the next regression
 * impossible to attribute.
 *
 * THE HEARTBEAT STAYS. A socket that silently drops must not mean a silent
 * tool — that is the S624 gag in a new costume. The heartbeat remains the
 * floor; realtime only lets a device hear sooner. `isHealthy()` exists so a
 * caller can relax its cadence while the socket is genuinely live, never so
 * it can switch the heartbeat off.
 *
 * WHY RAW PHOENIX FRAMES AND NOT supabase-js: the toolkit ships no bundler
 * and no npm runtime; every dependency is a file the tools already load. The
 * wire protocol is small and stable, and speaking it directly keeps this a
 * single reviewable file with no build step.
 *
 * PROTOCOL, briefly, so the next session need not reverse-engineer it:
 *   • connect wss://<host>/realtime/v1/websocket?apikey=<anon>&vsn=1.0.0
 *   • join topic "realtime:<channel>" with a postgres_changes config
 *   • keep alive with a "heartbeat" message on topic "phoenix" every 30s
 *   • the server replies phx_reply(ok) to the join, then sends
 *     postgres_changes payloads as they happen
 *
 * The WebSocket constructor is INJECTABLE. That is not a testing nicety —
 * it is how tools/sim/realtime.mjs drives this module's real code against a
 * scripted server, including drops and reconnects, which is exactly the
 * class of failure that has been reaching Mark's devices unproven.
 */

export function createRealtime(config) {
  config = config || {};
  var _url = config.url || '';                 // https://xxx.supabase.co
  var _anon = config.anonKey || '';
  var _getToken = config.getToken || function () { return null; };
  var _WS = config.WebSocketImpl ||
            (typeof WebSocket !== 'undefined' ? WebSocket : null);
  var _log = config.log || function () {};

  var _sock = null;
  var _ref = 0;
  var _joined = false;
  var _hbTimer = null;
  var _reconnectTimer = null;
  var _attempt = 0;
  var _closedByUs = false;
  var _sub = null;                             // {table, filter, onChange}
  var _lastEventAt = 0;
  var _lastJoinAt = 0;
  var _status = 'idle';                        // idle|connecting|live|down

  var HB_MS = 30000;
  var JOIN_TIMEOUT_MS = 12000;
  var MAX_BACKOFF_MS = 60000;

  function _wsUrl() {
    var base = String(_url || '').replace(/^http/, 'ws').replace(/\/+$/, '');
    return base + '/realtime/v1/websocket?apikey=' + encodeURIComponent(_anon) + '&vsn=1.0.0';
  }
  function _send(topic, event, payload) {
    if (!_sock || _sock.readyState !== 1) return false;
    _ref++;
    try {
      _sock.send(JSON.stringify({ topic: topic, event: event, payload: payload || {}, ref: String(_ref) }));
      return true;
    } catch (e) { return false; }
  }
  function _setStatus(s) {
    if (_status === s) return;
    _status = s;
    try { if (config.onStatus) config.onStatus(s); } catch (_) {}
  }

  function _startHeartbeat() {
    _stopHeartbeat();
    _hbTimer = setInterval(function () {
      /* A heartbeat that cannot be sent means the socket is gone even if no
         close event arrived — a half-open TCP connection is the ordinary
         result of a tablet moving between wifi and LTE, and it is the same
         shape as the S624 hang: nothing fails, nothing settles. Treat a
         failed send as a drop rather than waiting for an event that may
         never come. */
      if (!_send('phoenix', 'heartbeat', {})) _drop('heartbeat-unsendable');
    }, HB_MS);
  }
  function _stopHeartbeat() { if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null; } }

  function _backoffMs() {
    var base = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, Math.min(6, _attempt)));
    return Math.round(base * (0.7 + Math.random() * 0.6));   // jitter: a fleet must not reconnect in lockstep
  }

  function _drop(why) {
    _joined = false;
    _stopHeartbeat();
    _setStatus('down');
    try { if (_sock) { _closedByUs = true; _sock.close(); } } catch (_) {}
    _sock = null;
    _log('[realtime] down (' + why + ')');
    _scheduleReconnect();
  }

  function _scheduleReconnect() {
    if (_reconnectTimer || !_sub) return;
    var wait = _backoffMs();
    _attempt++;
    _reconnectTimer = setTimeout(function () {
      _reconnectTimer = null;
      _open();
    }, wait);
  }

  function _open() {
    if (!_WS || !_sub || !_url) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { _scheduleReconnect(); return; }
    _closedByUs = false;
    _setStatus('connecting');
    try { _sock = new _WS(_wsUrl()); } catch (e) { _sock = null; _scheduleReconnect(); return; }

    _sock.onopen = function () {
      _lastJoinAt = Date.now();
      var token = _getToken() || _anon;
      /* One channel per row. The filter is applied SERVER-side so a device
         is never woken by other people's reports — on a fleet this size that
         is the difference between a quiet socket and a constant one. */
      _send('realtime:' + _sub.channel, 'phx_join', {
        config: {
          broadcast: { self: false },
          postgres_changes: [{
            event: '*', schema: 'public', table: _sub.table, filter: _sub.filter
          }]
        },
        access_token: token
      });
      setTimeout(function () {
        if (!_joined) _drop('join-timeout');   // a socket that opens but never joins is not live
      }, JOIN_TIMEOUT_MS);
    };

    _sock.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (!m) return;
      if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok' && !_joined) {
        _joined = true; _attempt = 0;
        _setStatus('live');
        _startHeartbeat();
        _log('[realtime] live on ' + _sub.table + ' ' + _sub.filter);
        return;
      }
      if (m.event === 'phx_error' || m.event === 'phx_close') { _drop(m.event); return; }
      if (m.event === 'postgres_changes' || (m.payload && m.payload.data && m.payload.data.type)) {
        _lastEventAt = Date.now();
        var rec = null;
        try { rec = (m.payload && m.payload.data && (m.payload.data.record || m.payload.data.old_record)) || null; } catch (_) {}
        try { if (_sub.onChange) _sub.onChange({ at: _lastEventAt, record: rec }); } catch (e) { _log('[realtime] onChange threw: ' + (e && e.message)); }
      }
    };

    _sock.onerror = function () { /* close follows; nothing to do that close does not */ };
    _sock.onclose = function () {
      if (_closedByUs) return;
      _joined = false; _stopHeartbeat(); _setStatus('down');
      _scheduleReconnect();
    };
  }

  return {
    VERSION: '1.0.0',
    /** Subscribe to one row. Idempotent: a second call replaces the first. */
    subscribe: function (opts) {
      opts = opts || {};
      this.stop();
      _sub = {
        channel: opts.channel || (opts.table + ':' + (opts.filter || 'all')),
        table: opts.table, filter: opts.filter, onChange: opts.onChange
      };
      _attempt = 0;
      _open();
    },
    stop: function () {
      _sub = null;
      _joined = false;
      _stopHeartbeat();
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      try { if (_sock) { _closedByUs = true; _sock.close(); } } catch (_) {}
      _sock = null;
      _setStatus('idle');
    },
    /** Live AND actually joined. Callers may relax cadence on this — never
     *  switch the heartbeat off, which is the S624 gag by another route. */
    isHealthy: function () { return _status === 'live' && _joined; },
    status: function () { return _status; },
    lastEventAt: function () { return _lastEventAt; },
    /** Exposed for diagnosis on a device, where no debugger is available. */
    stats: function () {
      return { status: _status, joined: _joined, attempt: _attempt,
               lastEventAt: _lastEventAt, joinedAt: _lastJoinAt };
    }
  };
}
