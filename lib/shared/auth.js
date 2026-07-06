/**
 * ARENCON /lib/ (extracted from FRT at S445 — the audit winner; behavior identical incl. the S91/S395 401→silent-refresh→retry path and hooks, so FRT migration later is import-path-only) — Authentication
 * ════════════════════════════════
 * 
 * Supabase auth via REST API (same pattern as v1 CloudSync).
 * Reads tokens from localStorage (shared with Hub on same domain).
 * Auto-refreshes expired access tokens.
 */

// ── Supabase Config ──
// Production credentials (active by default)
var SUPABASE_URL_PROD = 'https://xsemvinxsyphjiaqgywv.supabase.co';
var SUPABASE_ANON_KEY_PROD = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';

// Staging credentials — fill in once the arencon-frt-staging Supabase project exists.
// Until both fields are non-empty, ?staging=1 falls back to PROD with a visible warning
// banner (injected by frt/index.html). MUST stay in sync with the equivalent block in
// ARENCON_Project_Hub.html — update both files in the same commit when credentials arrive.
var SUPABASE_URL_STAGING = 'https://wifvxmqgnkhzxxctqojp.supabase.co';
var SUPABASE_ANON_KEY_STAGING = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZnZ4bXFnbmtoenh4Y3Rxb2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NzI1MjQsImV4cCI6MjA5NTE0ODUyNH0.D8xYU20jri0FdMcOtU0wZnSvlrRRpl1ZnEcwjCWrans';

// ── Environment Detection ──
// `location.search` is available at module-load time in browsers; no DOM wait needed.
var _stagingRequested = (typeof location !== 'undefined') && new URLSearchParams(location.search).get('staging') === '1';
var _stagingActive = _stagingRequested && !!SUPABASE_URL_STAGING && !!SUPABASE_ANON_KEY_STAGING;
var SUPABASE_URL = _stagingActive ? SUPABASE_URL_STAGING : SUPABASE_URL_PROD;
var SUPABASE_ANON_KEY = _stagingActive ? SUPABASE_ANON_KEY_STAGING : SUPABASE_ANON_KEY_PROD;

// ── Staging Banner (FRT side) ──
// ES modules are deferred — document.body exists by the time this runs.
// Visible top stripe whenever ?staging=1 is in the URL. Two visual states:
//   - _stagingActive = true  → "STAGING ENVIRONMENT" (informational)
//   - _stagingActive = false → "STAGING NOT CONFIGURED — RUNNING ON PRODUCTION" (warning)
// The warning state is critical: it tells the user their staging request was ignored,
// preventing the dangerous scenario of writing to PROD while believing they're on staging.
if (_stagingRequested && typeof document !== 'undefined' && document.body) {
  var _stagingBar = document.createElement('div');
  _stagingBar.id = 'staging-banner';
  _stagingBar.textContent = _stagingActive
    ? '\u26A0 STAGING ENVIRONMENT \u2014 Test data only'
    : '\u26A0 STAGING REQUESTED BUT NOT CONFIGURED \u2014 RUNNING ON PRODUCTION';
  _stagingBar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;background:#1A1A1A;color:#FFD600;text-align:center;padding:6px 10px;font-family:Calibri,sans-serif;font-weight:bold;font-size:13px;letter-spacing:1px;box-shadow:0 2px 6px rgba(0,0,0,.35);border-bottom:2px solid #FFD600;';
  document.body.insertBefore(_stagingBar, document.body.firstChild);
  document.body.style.paddingTop = '32px';
  console.log('[Auth] Staging mode: requested=' + _stagingRequested + ' active=' + _stagingActive);
}

var _user = null;
var _role = null;
var _initials = null;   // S331n — from profiles.initials (Admin panel)
var _fullName = null;   // S331n — from profiles.full_name (for fallback derivation)
var _autoRefreshTimer = null;
var _refreshPromise = null;  // S91: dedup concurrent refresh calls

// S130 1.3 — read-only diagnostic state for the boot pre-flight check.
// Captures which path restoreSession() took and how long it took, so
// Mark's tablet pre-flight (sign-out → wait >1h → sign-in → reload) can
// verify that the S129 boot-perf optimizations actually fired in the wild.
// Read via Auth._diag; never mutated outside this module.
var _diag = {
  restoreMs: null,
  restorePath: null,   // 'no-token' | 'preemptive' | 'cached-valid' | 'refresh-on-401'
  tokenExpAtRestore: null,  // ms remaining at restoreSession start, or null
  restoreCalledAt: null     // ISO timestamp of last call
};

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
      // S130 Item 5.3 — opts.rawText returns the raw response body so the
      // caller can defer the JSON.parse to a Web Worker (large pulls only).
      // Default behavior unchanged: parse inline and return the object.
      if (opts.rawText) {
        return res.text();
      }
      return res.text().then(function(text) { return text ? JSON.parse(text) : null; });
    });
  },

  /**
   * Restore session — reads tokens from localStorage, refreshes if needed.
   * Returns user object or null.
   * S81: on restore, also schedule periodic auto-refresh so Mark doesn't have
   * to sign in again every hour.
   * S129 Item 1: preemptive refresh on near-expiry tokens. Before this, an
   * expired token on boot caused 3 sequential Supabase RTTs:
   *   /auth/v1/user → 401 → /auth/v1/token refresh → /auth/v1/user retry
   * ~3000ms on slow links. Now we parse the cached JWT's exp claim first;
   * if <5 min remaining (or already past), go straight to refresh.
   * Pattern lifted from the visibilitychange handler at bottom of this file,
   * which has used this exact idiom in production since S91.
   */
  restoreSession: function() {
    var _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    _diag.restoreCalledAt = new Date().toISOString();
    _diag.tokenExpAtRestore = null;
    _diag.restorePath = null;
    _diag.restoreMs = null;

    var token = localStorage.getItem('sb-access-token');
    if (!token) {
      console.log('[Auth] No access token found');
      _diag.restorePath = 'no-token';
      _diag.restoreMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _t0);
      return Promise.resolve(null);
    }

    var self = this;

    // S129 Item 1: preemptive refresh window. exp is parsed once; if it
    // can't be parsed (malformed JWT, no exp claim) we fall through to the
    // legacy /auth/v1/user path which catches it via the 401 retry chain.
    var expMs = _parseJwtExp(token);
    if (expMs !== null) {
      var remaining = expMs - Date.now();
      _diag.tokenExpAtRestore = remaining;
      if (remaining < 300000) {  // < 5 min
        console.log('[Auth] Cached token near/past expiry (' + Math.round(remaining / 1000) + 's left) — preemptive refresh');
        _diag.restorePath = 'preemptive';
        // _refreshTokenShared() coalesces concurrent callers, calls
        // _scheduleAutoRefresh on success, and loads role internally.
        return this._refreshTokenShared().then(function(u) {
          _diag.restoreMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _t0);
          return u;
        });
      }
    }

    return this.request('/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(user) {
      _user = user;
      console.log('[Auth] Session restored:', user.email);
      _diag.restorePath = _diag.restorePath || 'cached-valid';
      self._scheduleAutoRefresh();
      return self._loadRole(user.id).then(function() {
        _diag.restoreMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _t0);
        return user;
      });
    }).catch(function(err) {
      console.log('[Auth] Token expired, attempting refresh...');
      _diag.restorePath = 'refresh-on-401';
      return self._refreshTokenShared().then(function(u) {
        _diag.restoreMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _t0);
        return u;
      });
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
      // S338 — token genuinely gone (expired/cleared). This is unrecoverable
      // without a fresh sign-in; every sync/R2 call will 401 until the user
      // re-logs. Flag it once so the diagnostic + any status UI can show
      // "session expired — sign in again" instead of silently 401-looping.
      try { window._authSessionExpired = true; } catch(e){}
      console.log('[Auth] No refresh token');
      return Promise.resolve(null);
    }
    try { window._authSessionExpired = false; } catch(e){}

    var self = this;
    return this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: rt },
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
    }).then(function(data) {
      if (data && data.access_token) {
        localStorage.setItem('sb-access-token', data.access_token);
        // S338 — Supabase rotates the refresh token on every refresh, BUT a
        // response can occasionally omit it. The old code wrote it blindly, so a
        // missing/undefined value CLOBBERED the good token in localStorage →
        // the NEXT refresh read an empty value → "No refresh token" → every
        // sync/R2 call 401-looped forever (the "Saved locally, never Synced"
        // bug). Only overwrite when the new token is actually present; otherwise
        // keep the existing one so the session survives a partial response.
        if (data.refresh_token) {
          localStorage.setItem('sb-refresh-token', data.refresh_token);
        }
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
    // S331n — pull role, initials, and full_name in one go. Initials are the
    // Admin-panel-set value (profiles.initials); full_name drives the fallback
    // when initials are blank (mirrors the Hub's name-derived rule).
    return this.request('/rest/v1/profiles?id=eq.' + userId + '&select=role,initials,full_name').then(function(rows) {
      if (rows && rows.length > 0) {
        _role = rows[0].role;
        _initials = rows[0].initials || null;
        _fullName = rows[0].full_name || null;
      }
    }).catch(function() { _role = 'inspector'; });
  },

  // S331n — current user's initials for auto-filling "Prepared By".
  // Priority: Admin-panel initials (profiles.initials) → derived from full_name
  // → derived from email local-part. Returns '' if nothing usable.
  getInitials: function() {
    if (_initials && _initials.trim()) return _initials.trim().toUpperCase();
    var name = (_fullName && _fullName.trim())
      || ((_user && _user.email) ? _user.email.split('@')[0].replace(/[._]/g, ' ') : '');
    if (!name) return '';
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    // First initial + first two letters of last name (e.g. "Mark He" → "MHe")
    return (parts[0][0] + parts[parts.length - 1].slice(0, 2)).toUpperCase();
  },

  getToken: function() {
    return localStorage.getItem('sb-access-token');
  },

  getUser: function() { return _user; },

  isAdmin: function() {
    return _role === 'admin' || _role === 'super_admin';
  },

  // S284: super-admin = Mark only. Role 'super_admin' in the profiles table is
  // the clean forward path; the email fallback guarantees this gate can never
  // lock Mark out if his profile row still reads 'admin'. Gates the Repair
  // tools and the Diagnostics button (destructive/recovery surfaces).
  isSuperAdmin: function() {
    if (_role === 'super_admin') return true;
    return ((_user && _user.email) || '').toLowerCase() === 'mhe@arencon.com';
  },

  getSession: function() { return _user; },

  signOut: function() {
    _user = null;
    _role = null;
    _initials = null;
    _fullName = null;
    if (_autoRefreshTimer) { clearTimeout(_autoRefreshTimer); _autoRefreshTimer = null; }
    _refreshPromise = null;
    localStorage.removeItem('sb-access-token');
    localStorage.removeItem('sb-refresh-token');
    console.log('[Auth] Signed out');
    return Promise.resolve();
  },

  // S130 1.3 — read-only snapshot of the last restoreSession() call.
  // Used by frt/js/diag/preflight.js to verify the S129 boot-perf
  // optimizations fired in the wild. Read-only; do not mutate.
  get _diag() { return Object.assign({}, _diag); }
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

// S130 1.3 — expose Auth for the boot pre-flight diagnostic in
// frt/js/diag/preflight.js. Read-only access via Auth._diag only;
// the rest of the API is callable but should not be invoked from the
// console outside of debugging.
if (typeof window !== 'undefined') {
  window._frt_auth = Auth;
}
