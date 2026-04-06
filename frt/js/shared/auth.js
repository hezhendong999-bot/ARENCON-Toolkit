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
   */
  request: function(path, opts) {
    opts = opts || {};
    return fetch(SUPABASE_URL + path, {
      method: opts.method || 'GET',
      headers: Object.assign({}, _getHeaders(), opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function(res) {
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
      return self._loadRole(user.id).then(function() { return user; });
    }).catch(function(err) {
      console.log('[Auth] Token expired, attempting refresh...');
      return self._refreshToken();
    });
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
    localStorage.removeItem('sb-access-token');
    localStorage.removeItem('sb-refresh-token');
    console.log('[Auth] Signed out');
    return Promise.resolve();
  }
};
