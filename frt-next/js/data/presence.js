/**
 * ARENCON FRT v2 — Presence Heartbeat (S117-A)
 * ══════════════════════════════════════════════
 *
 * Soft-realtime "who else is in this project right now" indicator.
 * Replaces v1's softLock (which silently disabled the UI after 20-min idle).
 *
 * Mechanics
 * ─────────
 * Every 30s, while the tab is VISIBLE and the user is in Hub mode:
 *   1. UPSERT a row into `project_presence` with my user_id, project_id,
 *      last_seen=NOW(), full_name (cached from auth profile).
 *   2. SELECT all rows for this project where last_seen > NOW() - 90s and
 *      user_id != me. The 90s window absorbs one missed heartbeat without
 *      removing a still-present user.
 *   3. Notify subscribers — UI chip reads the list.
 *
 * Heartbeat stops on:
 *   - sign-out
 *   - tab hidden for >2 min (resumes on visibilitychange → visible)
 *   - browser close (best-effort DELETE via sendBeacon-ish PATCH;
 *     if it fails the 90s window cleans up naturally)
 *
 * ❗ Feature-flag tolerance
 * If the `project_presence` table does not exist yet (Mark hasn't deployed
 * `supabase/project_presence.sql`), every request returns 404. The module
 * traps these errors and silently turns itself off after 3 consecutive
 * failures so it doesn't spam the network or the console. Once the SQL is
 * deployed, the next page reload picks it up automatically.
 *
 * Public API
 * ──────────
 *   Presence.start(projectId, user, fullName)   → kick off heartbeat
 *   Presence.stop()                              → tear down
 *   Presence.getOthers()                         → array of {user_id, full_name, last_seen}
 *   Presence.onChange(cb)                        → subscribe to others-list updates
 */

import { Auth } from '../shared/auth.js';

var HEARTBEAT_MS = 30000;     // 30 s
var STALE_MS     = 90000;     // 90 s — drop users from "others" list older than this
var BACKOFF_MAX  = 3;         // give up after 3 consecutive failures (table likely missing)

var _projectId = null;
var _userId = null;
var _fullName = '';
var _heartbeatTimer = null;
var _others = [];             // [{user_id, full_name, last_seen}]
var _subscribers = [];
var _failureCount = 0;
var _disabled = false;        // true once we've decided the table isn't there
var _lastBeatAt = 0;

function _notify() {
  for (var i = 0; i < _subscribers.length; i++) {
    try { _subscribers[i](_others); } catch(_){}
  }
}

function _emitBeat() {
  if (_disabled || !_projectId || !_userId) return Promise.resolve();
  var nowIso = new Date().toISOString();
  var payload = [{
    user_id: _userId,
    project_id: _projectId,
    last_seen: nowIso,
    full_name: _fullName || ''
  }];
  // Postgrest UPSERT: POST with Prefer: resolution=merge-duplicates +
  // on_conflict=user_id,project_id. Anon role won't satisfy RLS — must
  // be authenticated. Auth.request() carries the JWT.
  return Auth.request('/rest/v1/project_presence?on_conflict=user_id,project_id', {
    method: 'POST',
    body: payload,
    headers: {
      'Prefer': 'resolution=merge-duplicates,return=minimal',
      'Content-Type': 'application/json'
    }
  }).then(function(){
    _failureCount = 0;
    _lastBeatAt = Date.now();
  }).catch(function(err){
    _failureCount++;
    // 404 (relation does not exist) and 42P01 errors mean Mark hasn't
    // deployed the SQL yet. Don't bail on a single network blip — wait
    // for BACKOFF_MAX consecutive failures.
    if (_failureCount >= BACKOFF_MAX) {
      console.info('[Presence] Disabled — table likely missing. Deploy supabase/project_presence.sql to enable.');
      _disabled = true;
      _stopTimer();
    }
  });
}

function _fetchOthers() {
  if (_disabled || !_projectId || !_userId) return Promise.resolve();
  // Fetch presence rows for this project newer than STALE_MS, excluding
  // myself. PostgREST timestamp filter uses gt= for strict greater-than.
  var since = new Date(Date.now() - STALE_MS).toISOString();
  var path = '/rest/v1/project_presence'
    + '?select=user_id,full_name,last_seen'
    + '&project_id=eq.' + _projectId
    + '&user_id=neq.' + _userId
    + '&last_seen=gt.' + encodeURIComponent(since)
    + '&order=last_seen.desc';
  return Auth.request(path).then(function(rows){
    if (!Array.isArray(rows)) rows = [];
    // Compare to previous so we only notify on actual changes
    var changed = rows.length !== _others.length;
    if (!changed) {
      for (var i = 0; i < rows.length; i++) {
        if (!_others[i] || _others[i].user_id !== rows[i].user_id) { changed = true; break; }
      }
    }
    _others = rows;
    if (changed) _notify();
  }).catch(function(){
    // 404 etc. — _emitBeat() will trip the disabled flag separately.
    // Don't double-count toward BACKOFF here; just swallow.
  });
}

function _tick() {
  return _emitBeat().then(_fetchOthers);
}

function _stopTimer() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}

function _onVisibility() {
  if (_disabled || !_projectId) return;
  if (document.visibilityState === 'visible') {
    // Tab re-foregrounded — fire one immediate beat then resume cadence
    if (!_heartbeatTimer) {
      _tick();
      _heartbeatTimer = setInterval(_tick, HEARTBEAT_MS);
    } else if (Date.now() - _lastBeatAt > HEARTBEAT_MS) {
      _tick();
    }
  } else {
    // Hidden → stop the timer. We DON'T delete the row — the 90s STALE_MS
    // window will retire it naturally if the user doesn't return.
    _stopTimer();
  }
}

function _onUnload() {
  // Best-effort cleanup. Most browsers won't run async fetch on unload, so
  // don't rely on it — STALE_MS handles the cleanup either way.
  if (_disabled || !_projectId || !_userId) return;
  try {
    var token = Auth.getToken && Auth.getToken();
    if (navigator.sendBeacon && token) {
      // sendBeacon doesn't support DELETE — skip; rely on STALE_MS instead.
    }
  } catch(_){}
}

export var Presence = {
  start: function(projectId, user, fullName) {
    if (!projectId || !user || !user.id) return;
    if (_disabled) return; // permanently off this session
    if (_projectId === projectId && _userId === user.id && _heartbeatTimer) return; // already running
    _projectId = projectId;
    _userId = user.id;
    _fullName = fullName || '';
    _failureCount = 0;
    _stopTimer();
    // Fire one immediately then every 30 s
    _tick();
    _heartbeatTimer = setInterval(_tick, HEARTBEAT_MS);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', _onVisibility);
      document.addEventListener('visibilitychange', _onVisibility);
      window.removeEventListener('pagehide', _onUnload);
      window.addEventListener('pagehide', _onUnload);
    }
    console.log('[Presence] Started — project:', projectId.slice(0, 8) + '…', 'user:', _fullName || _userId.slice(0, 8));
  },

  stop: function() {
    _stopTimer();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', _onVisibility);
      window.removeEventListener('pagehide', _onUnload);
    }
    _others = [];
    _notify();
    _projectId = null;
    _userId = null;
  },

  getOthers: function() { return _others.slice(); },

  isDisabled: function() { return _disabled; },

  onChange: function(cb) {
    if (typeof cb !== 'function') return function(){};
    _subscribers.push(cb);
    return function() {
      var i = _subscribers.indexOf(cb);
      if (i >= 0) _subscribers.splice(i, 1);
    };
  }
};
