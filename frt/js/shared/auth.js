/**
 * ARENCON FRT v2 — Authentication
 * ════════════════════════════════
 * 
 * Supabase auth via REST API (same pattern as v1 CloudSync).
 * Reads tokens from localStorage (shared with Hub on same domain).
 * Auto-refreshes expired access tokens.
 */

var SUPABASE_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';

var _user = null;
var _role = null;
var _autoRefreshTimer = null;
var _refreshPromise = null;  // S91: dedup concurrent refresh calls

// S91: parse the exp claim from a JWT so we know when it actually expires.
// Returns ms-since-epoch, or null if unparseable.
function _parseJwtExp(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    var parts = token.split('.');
    if (parts.length !== 3) return null;
    var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload && payload.exp ? payload.exp * 1000 : null;
  } catch (e) { return null; }
}

function _getHeaders() {
  var h = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  };
  var token = localStorage.getItem('sb-access-token');
  h['Authorization'] = 'Bearer ' + (token || SUPABASE_ANON_KEY);
  return h;
}

export var Auth = {

  SUPABASE_URL: SUPABASE_URL,
  SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,

  /**
   * Make an authenticated request to Supabase REST API.
   * S91: on 401 (except auth endpoints), transparently refresh the JWT and
   * retry once so callers never see auth failures from stale tokens.
   */
  request: function(path, opts, _isRetry) {
    opts = opts || {};
    var self = this;
    return fetch(SUPABASE_URL + path, {
      method: opts.method || 'GET',
      headers: Object.assign({}, _getHeaders(), opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function(res) {
      // Reactive refresh: only non-auth endpoints, only once per call.
      if (res.status === 401 && !_isRetry && path.indexOf('/auth/v1/') !== 0) {
        console.log('[Auth] 401 on ' + path + ' — refreshing token + retrying');
        return self._refreshTokenShared().then(function(user) {
          if (!user) throw new Error('Unauthorized (refresh failed)');
          var retryOpts = Object.assign({}, opts);
          retryOpts.headers = Object.assign({}, opts.headers || {});
          delete retryOpts.headers.Authorization;  // let _getHeaders() inject fresh token
          return self.request(path, retryOpts, true);
        });
      }
      if (!res.ok) {
        return res.json().catch(function() { return { message: res.statusText }; }).then(function(err) {
          throw new Error(err.message || err.msg || res.statusText);
        });
      }
      return res.text().then(function(text) { return text ? JSON.parse(text) : null; });
    });
  },

  /**
   * Restore session — reads tokens from localStorage, refreshes if needed.
   * Returns user object or null.
   * S81: on restore, also schedule periodic auto-refresh so Mark doesn't have
   * to sign in again every hour.
   */
  restoreSession: function() {
    var token = localStorage.getItem('sb-access-token');
    if (!token) {
      console.log('[Auth] No access token found');
      return Promise.resolve(null);
    }

    var self = this;
    return this.request('/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(user) {
      _user = user;
      console.log('[Auth] Session restored:', user.email);
      self._scheduleAutoRefresh();
      return self._loadRole(user.id).then(function() { return user; });
    }).catch(function(err) {
      console.log('[Auth] Token expired, attempting refresh...');
      return self._refreshTokenShared();
    });
  },

  /**
   * S91: schedule a one-shot refresh for 60s before the actual JWT expiry.
   * Cascades: on success, re-calls itself to schedule the next refresh.
   * Replaces S81's fixed 50-min setInterval which missed refreshes when the
   * tab was backgrounded or JS was throttled.
   */
  _scheduleAutoRefresh: function(){
    if (_autoRefreshTimer) { clearTimeout(_autoRefreshTimer); _autoRefreshTimer = null; }
    var self = this;
    var token = localStorage.getItem('sb-access-token');
    var expMs = _parseJwtExp(token);
    if (!expMs) {
      // Can't parse exp — fall back to fixed 50-min schedule.
      console.log('[Auth] No exp in JWT, using 50min fallback schedule');
      _autoRefreshTimer = setTimeout(function(){
        self._refreshTokenShared().then(function(u){ if (u) self._scheduleAutoRefresh(); });
      }, 50 * 60 * 1000);
      return;
    }
    var delay = Math.max(0, (expMs - 60000) - Date.now());
    console.log('[Auth] Next refresh in ' + Math.round(delay/1000) + 's (token exp ' + new Date(expMs).toLocaleTimeString() + ')');
    _autoRefreshTimer = setTimeout(function(){
      self._refreshTokenShared().then(function(u){
        if (u) self._scheduleAutoRefresh();
        else console.warn('[Auth] Auto-refresh failed — will retry reactively on next 401');
      });
    }, delay);
  },

  /**
   * S91: deduplicate concurrent refresh calls. Multiple in-flight requests
   * hitting 401 at once all share a single refresh promise, so we don't
   * fire N refresh calls and race-condition the localStorage write.
   */
  _refreshTokenShared: function(){
    if (_refreshPromise) return _refreshPromise;
    var self = this;
    _refreshPromise = this._refreshToken().then(function(user){
      if (user) self._scheduleAutoRefresh();
      return user;
    }).finally(function(){ _refreshPromise = null; });
    return _refreshPromise;
  },

  /**
   * Refresh expired access token using refresh token.
   */
  _refreshToken: function() {
    var rt = localStorage.getItem('sb-refresh-token');
    if (!rt) {
      console.log('[Auth] No refresh token');
      return Promise.resolve(null);
    }

    var self = this;
    return this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: rt },
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
    }).then(function(data) {
      if (data && data.access_token) {
        localStorage.setItem('sb-access-token', data.access_token);
        localStorage.setItem('sb-refresh-token', data.refresh_token);
        console.log('[Auth] Token refreshed');
        return self.request('/auth/v1/user', {
          headers: { 'Authorization': 'Bearer ' + data.access_token }
        }).then(function(user) {
          _user = user;
          return self._loadRole(user.id).then(function() { return user; });
        });
      }
      return null;
    }).catch(function(err) {
      console.warn('[Auth] Refresh failed:', err.message);
      return null;
    });
  },

  /**
   * Load user role from profiles table.
   */
  _loadRole: function(userId) {
    return this.request('/rest/v1/profiles?id=eq.' + userId + '&select=role').then(function(rows) {
      if (rows && rows.length > 0) _role = rows[0].role;
    }).catch(function() { _role = 'inspector'; });
  },

  getToken: function() {
    return localStorage.getItem('sb-access-token');
  },

  getUser: function() { return _user; },

  isAdmin: function() {
    return _role === 'admin' || _role === 'super_admin';
  },

  getSession: function() { return _user; },

  signOut: function() {
    _user = null;
    _role = null;
    if (_autoRefreshTimer) { clearTimeout(_autoRefreshTimer); _autoRefreshTimer = null; }
    _refreshPromise = null;
    localStorage.removeItem('sb-access-token');
    localStorage.removeItem('sb-refresh-token');
    console.log('[Auth] Signed out');
    return Promise.resolve();
  }
};

// S91: when the tab returns from background, browsers may have throttled
// or suspended the scheduled refresh timer entirely. If the token is near
// or past expiry on visibility restore, refresh it proactively before the
// user triggers a request and eats a 401.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState !== 'visible') return;
    var token = localStorage.getItem('sb-access-token');
    var expMs = _parseJwtExp(token);
    if (!expMs) return;
    var remaining = expMs - Date.now();
    if (remaining < 120000) { // < 2 min
      console.log('[Auth] Tab visible with token near/past expiry (' + Math.round(remaining/1000) + 's left) — refreshing');
      Auth._refreshTokenShared();
    }
  });
}
