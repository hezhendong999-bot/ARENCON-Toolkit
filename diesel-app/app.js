/* ============================================================================
 * ARENCON Diesel Fire Pump Commissioning — modular app entry (diesel-app/)
 * ----------------------------------------------------------------------------
 * Phase A (S447): the data layer is extracted OUT of the single-file tool and
 * rebuilt here BESIDE the live tool. Nothing in the Hub points here yet.
 *
 * Path A (locked with Mark, S447): Diesel is a single-instance commissioning
 * tool — its sync policy is LAST-WRITE-WINS, NOT the merge-based lib/sync.js
 * (which exists for FRT's multi-device model). Forcing Diesel onto merge would
 * change its data-consistency behavior, so we DO NOT converge it onto
 * createSync. Instead:
 *
 *   - R2Photos  : carried VERBATIM from the live tool. Only change = worker
 *                 host swapped from the retired arencon-r2-worker...workers.dev
 *                 to files.arencon.app (same worker, same bucket, same
 *                 photos/{pid}/{tool}/{type}/{fname} key scheme — verified S447).
 *   - R2Outbox  : carried VERBATIM (self-contained durable upload queue).
 *   - CloudSync : LWW save/load carried VERBATIM, but its Supabase transport
 *                 (_request/_getUser) routes through the shared Auth module,
 *                 gaining the S91/S395 401->silent-refresh->retry path. This is
 *                 behavior-compatible with Diesel's old manual refresh.
 *
 * The globals window.CloudSync / window.R2Photos / window.R2Outbox are exposed
 * with the EXACT public shapes the ~40 inline call sites expect, so ZERO call
 * sites in index.html change. The 18,400 lines of UI/verdict/checklist/PDF/
 * camera markup stay byte-identical.
 *
 * FIELD-VERIFY GATE: the data-path swap is not "done" until Mark verifies
 * save/load/photo-upload against real Diesel data on a device. No Hub pointer
 * flip before that.
 * ========================================================================== */

import { Auth } from '../lib/shared/auth.js';

const TOOL_KEY = 'diesel';

/* ══════════════════════════════════════════════════════════════════════════
 * R2 PHOTOS MODULE — carried verbatim from live tool (S365), host swapped.
 * ════════════════════════════════════════════════════════════════════════ */
var R2Photos = (function () {
  'use strict';
  // S447: retired arencon-r2-worker.hezhendong999.workers.dev -> files.arencon.app.
  // Same worker/bucket behind both hostnames (both resolve, verified S447); the
  // photos/{pid}/{tool}/{type}/{fname} path scheme is identical, so existing
  // photos stored under the old host still load and new writes use the clean host.
  var WORKER_URL = 'https://files.arencon.app';
  var _queue = [];
  var _uploading = false;
  var _onProgress = null;

  function _authHeaders() {
    var h = {};
    var token = localStorage.getItem('sb-access-token');
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  // Refresh the Supabase access token using the stored refresh token.
  // Returns the new access token, or null if refresh isn't possible.
  async function _refreshAccessToken() {
    var rt = localStorage.getItem('sb-refresh-token');
    if (!rt) return null;
    var SB_URL = Auth.SUPABASE_URL;
    var SB_ANON = Auth.SUPABASE_ANON_KEY;
    try {
      var res = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON },
        body: JSON.stringify({ refresh_token: rt })
      });
      if (!res.ok) return null;
      var data = await res.json();
      if (data && data.access_token) {
        localStorage.setItem('sb-access-token', data.access_token);
        if (data.refresh_token) localStorage.setItem('sb-refresh-token', data.refresh_token);
        return data.access_token;
      }
    } catch (e) {}
    return null;
  }

  /* ── Core API calls ── */
  async function upload(projectId, tool, type, filename, blob) {
    var path = '/photos/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(tool) + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(filename);
    var headers = _authHeaders();
    headers['Content-Type'] = blob.type || 'image/jpeg';
    var res = await fetch(WORKER_URL + path, { method: 'PUT', headers: headers, body: blob });
    if (res.status === 401 || res.status === 403) {
      // Token missing/expired — refresh once and retry.
      var nt = await _refreshAccessToken();
      if (nt) {
        headers['Authorization'] = 'Bearer ' + nt;
        res = await fetch(WORKER_URL + path, { method: 'PUT', headers: headers, body: blob });
      }
    }
    if (!res.ok) { var err; try { err = await res.json(); } catch (e) { err = { error: res.statusText }; } throw new Error(err.error || res.statusText); }
    return await res.json();
  }

  function getUrl(projectId, tool, type, filename) {
    return WORKER_URL + '/photos/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(tool) + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(filename);
  }

  async function remove(projectId, tool, type, filename) {
    var path = '/photos/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(tool) + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(filename);
    var res = await fetch(WORKER_URL + path, { method: 'DELETE', headers: _authHeaders() });
    if (!res.ok && res.status !== 404) { throw new Error('Delete failed: ' + res.statusText); }
    return true;
  }

  async function list(projectId, tool, type) {
    var path = '/list/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(tool) + '/' + encodeURIComponent(type);
    // S343 SECURITY: send auth so the Worker can REQUIRE auth on /list/ (was anon).
    var res = await fetch(WORKER_URL + path, { method: 'GET', headers: _authHeaders() });
    if (!res.ok) { throw new Error('List failed: ' + res.statusText); }
    return await res.json();
  }

  /* ── Upload Queue ── */
  function enqueue(item) {
    _queue.push(item);
    _fireProgress();
    _processQueue();
  }

  function _fireProgress() {
    if (_onProgress) _onProgress({ queued: _queue.length, uploading: _uploading });
  }

  async function _processQueue() {
    if (_uploading || !_queue.length) return;
    if (!navigator.onLine) { _fireProgress(); return; }
    _uploading = true;
    while (_queue.length > 0) {
      if (!navigator.onLine) break;
      var item = _queue[0];
      try {
        await upload(item.projectId, item.tool, item.type, item.filename, item.blob);
        _queue.shift();
        if (item.onComplete) item.onComplete(null);
      } catch (e) {
        console.warn('[R2Photos] Upload failed:', e.message, ', will retry');
        break;
      }
      _fireProgress();
    }
    _uploading = false;
    _fireProgress();
  }

  /* ── Helpers ── */
  function dataUrlToBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    try {
      var parts = dataUrl.split(','); var mime = parts[0].match(/:(.*?);/)[1];
      var raw = atob(parts[1]); var arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }

  function generateFilename(prefix) {
    return (prefix || 'photo') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg';
  }

  /* ── Lifecycle ── */
  function init(opts) {
    opts = opts || {};
    _onProgress = opts.onProgress || null;
    window.addEventListener('online', function () { setTimeout(_processQueue, 1000); });
    if (navigator.connection) {
      navigator.connection.addEventListener('change', function () { setTimeout(_processQueue, 1000); });
    }
  }

  function getQueueLength() { return _queue.length; }
  function isUploading() { return _uploading; }

  return {
    init: init, upload: upload, getUrl: getUrl, remove: remove, list: list,
    enqueue: enqueue, dataUrlToBlob: dataUrlToBlob, generateFilename: generateFilename,
    getQueueLength: getQueueLength, isUploading: isUploading,
    get WORKER_URL() { return WORKER_URL; }
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
 * R2 OUTBOX — durable upload queue (Phase 2: 4380.24 protection).
 * Carried VERBATIM. Self-contained (own arencon_r2_outbox IDB); depends only
 * on R2Photos, which is defined above.
 * ════════════════════════════════════════════════════════════════════════ */
var R2Outbox = (function () {
  'use strict';
  var DB_NAME = 'arencon_r2_outbox';
  var DB_VERSION = 1;
  var STORE = 'outbox';
  var _ready = null;
  var _driving = false;
  var _onVerified = null;

  function _open() {
    if (_ready) return _ready;
    _ready = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'key' });
          os.createIndex('status', 'status', { unique: false });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return _ready;
  }
  // IDB-safe: create tx and issue the request in the SAME tick (no microtask gap),
  // resolve on tx.oncomplete so the write is durably committed. Splitting these
  // across .then() lets the tx auto-commit and the request fail — strict on iOS.
  function _withStore(mode, fn) {
    return _open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var os = tx.objectStore(STORE);
        var req = fn(os);
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function put(entry) { return _withStore('readwrite', function (os) { return os.put(entry); }); }
  function del(key) { return _withStore('readwrite', function (os) { return os['delete'](key); }); }
  function getAll() { return _withStore('readonly', function (os) { return os.getAll(); }).then(function (r) { return r || []; }).catch(function () { return []; }); }
  function count() { return getAll().then(function (a) { return a.length; }); }

  // Confirm the object is actually retrievable on R2. HEAD first; fall back to
  // GET if the Worker doesn't support HEAD. 200 = present, 404 = absent.
  function _verify(url) {
    // This R2 Worker does not implement HEAD (returns 404 for HEAD even when the
    // object exists), and every HEAD attempt floods the console with 404s. Use a
    // direct GET — unauthenticated on the Worker and authoritative: 200 = present.
    return fetch(url, { method: 'GET' }).then(function (g) { return g.ok; }).catch(function () { return false; });
  }

  // Upload + verify every pending entry. One bad entry never stalls the rest.
  function drive() {
    if (_driving) return Promise.resolve();
    if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve();
    if (typeof R2Photos === 'undefined') return Promise.resolve();
    _driving = true;
    return getAll().then(function (entries) {
      var chain = Promise.resolve();
      entries.forEach(function (e) {
        chain = chain.then(function () {
          if (typeof navigator !== 'undefined' && !navigator.onLine) return;
          if (!e || !e.blob) return del(e && e.key);
          return R2Photos.upload(e.projectId, e.tool, e.type, e.filename, e.blob).then(function () {
            var url = R2Photos.getUrl(e.projectId, e.tool, e.type, e.filename);
            return _verify(url);
          }).then(function (ok) {
            if (ok) {
              return del(e.key).then(function () { if (typeof _onVerified === 'function') { try { _onVerified(e.key); } catch (_) {} } });
            }
            e.attempts = (e.attempts || 0) + 1; e.lastTry = Date.now(); e.status = 'pending';
            return put(e);
          }).catch(function (err) {
            e.attempts = (e.attempts || 0) + 1; e.lastTry = Date.now(); e.status = 'pending'; e.lastError = String(err && err.message || err);
            return put(e).catch(function () {});
          });
        });
      });
      return chain;
    }).then(function () { _driving = false; }).catch(function () { _driving = false; });
  }

  function setOnVerified(fn) { _onVerified = fn; }
  function init() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', function () { setTimeout(drive, 1200); });
    if (navigator.connection && navigator.connection.addEventListener) {
      navigator.connection.addEventListener('change', function () { setTimeout(drive, 1200); });
    }
  }

  return { put: put, del: del, getAll: getAll, count: count, drive: drive, init: init, setOnVerified: setOnVerified };
})();

/* ══════════════════════════════════════════════════════════════════════════
 * CLOUDSYNC MODULE v1 — LWW save/load carried VERBATIM.
 * Transport (_request/_getUser) routed through shared Auth (S91 401-refresh).
 * IDB kept as the tool's own arencon_cloud_cache / tool_state store so any
 * device that already cached Diesel data is NOT orphaned by the swap.
 * ════════════════════════════════════════════════════════════════════════ */
var CloudSync = (function () {
  'use strict';
  var SUPABASE_URL = Auth.SUPABASE_URL;
  var SUPABASE_ANON_KEY = Auth.SUPABASE_ANON_KEY;
  var IDB_NAME = 'arencon_cloud_cache';
  var IDB_VERSION = 1;
  var IDB_STORE = 'tool_state';
  var AUTOSAVE_MS = 15000;
  var _projectId = null;
  var _toolKey = null;
  var _instanceId = null;
  var _instanceNumber = 1;
  var _collectStateFn = null;
  var _onStatusChange = null;
  var _autoSaveTimer = null;
  var _idb = null;
  var _online = navigator.onLine;
  var _pendingSync = false;
  var _userId = null;
  var _projectInfo = null;
  var _lastSavedJson = '';
  var _initialized = false;

  // S447: transport routed through shared Auth.request — same Supabase fetch as
  // the inline _request, plus transparent S91/S395 401->refresh->retry. keepalive
  // preserved for PATCH/POST so autosave survives page-hide (matches inline).
  function _request(path, opts) {
    opts = opts || {};
    return Auth.request(path, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      keepalive: (opts.method === 'PATCH' || opts.method === 'POST')
    });
  }

  function _openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function (e) { var db = e.target.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
      req.onsuccess = function (e) { _idb = e.target.result; resolve(_idb); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }
  function _idbKey() { return _projectId + '|' + _toolKey + '|' + (_instanceId || 'new'); }
  function _idbGet2(key) {
    return new Promise(function (resolve, reject) {
      if (!_idb) { resolve(null); return; }
      var tx = _idb.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function _idbPut2(key, val) {
    return new Promise(function (resolve, reject) {
      if (!_idb) { resolve(); return; }
      var tx = _idb.transaction(IDB_STORE, 'readwrite');
      var req = tx.objectStore(IDB_STORE).put(val, key);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function _setStatus(status, msg) { if (_onStatusChange) _onStatusChange(status, msg); }

  // S447: _getUser via shared Auth. Auth.request already handles 401->refresh, so
  // the manual refresh-token fallback in the old inline _getUser is redundant.
  async function _getUser() {
    var token = localStorage.getItem('sb-access-token');
    if (!token) return null;
    try { return await _request('/auth/v1/user'); } catch (e) { return null; }
  }

  async function _cloudLoad() {
    if (!_projectId || !_toolKey) return null;
    if (_instanceId) { var rows = await _request('/rest/v1/tool_data?select=*&id=eq.' + _instanceId); return (rows && rows.length > 0) ? rows[0] : null; }
    var rows = await _request('/rest/v1/tool_data?select=*&project_id=eq.' + _projectId + '&tool_key=eq.' + _toolKey + '&order=updated_at.desc&limit=1');
    return (rows && rows.length > 0) ? rows[0] : null;
  }

  async function _cloudSave(stateJson) {
    if (!_projectId || !_toolKey) return null;
    var payload = { project_id: _projectId, tool_key: _toolKey, instance_number: _instanceNumber, data: typeof stateJson === 'string' ? JSON.parse(stateJson) : stateJson, updated_by: _userId, updated_at: new Date().toISOString() };
    if (_instanceId) {
      var rows = await _request('/rest/v1/tool_data?id=eq.' + _instanceId, { method: 'PATCH', body: payload });
      return (rows && rows.length > 0) ? rows[0] : null;
    } else {
      payload.created_by = _userId; payload.status = 'draft';
      var rows2 = await _request('/rest/v1/tool_data', { method: 'POST', body: [payload] });
      if (rows2 && rows2.length > 0) { _instanceId = rows2[0].id; _instanceNumber = rows2[0].instance_number; return rows2[0]; }
      return null;
    }
  }

  async function _loadProjectInfo() {
    if (!_projectId) return null;
    try { var rows = await _request('/rest/v1/projects?select=*&id=eq.' + _projectId, { headers: { 'Accept': 'application/vnd.pgrst.object+json' } }); _projectInfo = rows; return rows; } catch (e) { return null; }
  }

  async function load() {
    var cloudRow = null;
    if (_online) {
      try {
        cloudRow = await _cloudLoad();
        if (cloudRow) {
          _instanceId = cloudRow.id; _instanceNumber = cloudRow.instance_number;
          var sj = typeof cloudRow.data === 'string' ? cloudRow.data : JSON.stringify(cloudRow.data);
          _lastSavedJson = sj;
          await _idbPut2(_idbKey(), { state: sj, projectId: _projectId, toolKey: _toolKey, instanceId: _instanceId, instanceNumber: _instanceNumber, savedAt: cloudRow.updated_at });
          _setStatus('synced', 'Loaded from cloud');
          return { source: 'cloud', state: typeof cloudRow.data === 'string' ? JSON.parse(cloudRow.data) : cloudRow.data, row: cloudRow };
        }
      } catch (e) { console.warn('[CloudSync] Cloud load failed:', e.message); }
    }
    try {
      var idbData = await _idbGet2(_idbKey());
      if (idbData && idbData.state) {
        _setStatus(_online ? 'synced' : 'offline', 'Loaded from cache');
        return { source: 'idb', state: typeof idbData.state === 'string' ? JSON.parse(idbData.state) : idbData.state, row: null };
      }
    } catch (e) { console.error('[CloudSync] IDB load failed:', e); }
    _setStatus(_online ? 'synced' : 'offline', 'No saved data');
    return null;
  }

  async function save(stateJson) {
    if (typeof stateJson !== 'string') stateJson = JSON.stringify(stateJson);
    if (stateJson === _lastSavedJson) return;
    _lastSavedJson = stateJson;
    try {
      await _idbPut2(_idbKey(), { state: stateJson, projectId: _projectId, toolKey: _toolKey, instanceId: _instanceId, instanceNumber: _instanceNumber, savedAt: new Date().toISOString() });
    } catch (e) { console.error('[CloudSync] IDB save failed:', e); }
    if (_online) {
      try { _setStatus('saving', 'Syncing...'); var row = await _cloudSave(stateJson); _pendingSync = false; _setStatus('synced', 'Saved to cloud'); return row; }
      catch (e) { console.warn('[CloudSync] Cloud save failed:', e.message); _pendingSync = true; _setStatus('pending', 'Saved locally'); }
    } else { _pendingSync = true; _setStatus('offline', 'Saved locally (offline)'); }
    return null;
  }

  function startAutoSave(collectStateFn, intervalMs) {
    _collectStateFn = collectStateFn; stopAutoSave();
    _autoSaveTimer = setInterval(function () { if (!_collectStateFn) return; try { var state = _collectStateFn(); save(state); } catch (e) { console.error('[CloudSync] Auto-save error:', e); } }, intervalMs || AUTOSAVE_MS);
  }
  function stopAutoSave() { if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; } }

  function _onOnline() {
    _online = true; _setStatus('saving', 'Reconnected...');
    if (_pendingSync && _collectStateFn) { try { var state = _collectStateFn(); save(state); } catch (e) { _setStatus('error', 'Sync failed'); } }
    else { _setStatus('synced', 'Online'); }
  }
  function _onOffline() { _online = false; _setStatus('offline', 'Working offline'); }

  function readUrlParams() {
    var p = new URLSearchParams(window.location.search);
    return { projectId: p.get('project') || null, instanceId: p.get('instance') || null, projectNumber: p.get('pn') || null, projectName: p.get('pname') || null, client: p.get('client') || null, address: p.get('addr') || null, smartFilename: p.get('sfn') || null };
  }

  async function _getNextInstanceNumber() {
    if (!_online) return 1;
    try { var rows = await _request('/rest/v1/tool_data?select=instance_number&project_id=eq.' + _projectId + '&tool_key=eq.' + _toolKey + '&order=instance_number.desc&limit=1'); if (rows && rows.length > 0) return rows[0].instance_number + 1; } catch (e) {}
    return 1;
  }

  async function init(opts) {
    _toolKey = opts.toolKey; _onStatusChange = opts.onStatusChange || null; _projectId = opts.projectId || null; _instanceId = opts.instanceId || null;
    try { await _openIDB(); } catch (e) { console.error('[CloudSync] IDB open failed:', e); }
    try { var user = await _getUser(); if (user) _userId = user.id; } catch (e) {}
    if (_projectId && _online) { try { await _loadProjectInfo(); } catch (e) {} }
    if (_projectId && !_instanceId) { _instanceNumber = await _getNextInstanceNumber(); }
    window.addEventListener('online', _onOnline); window.addEventListener('offline', _onOffline);
    _initialized = true; _setStatus(_online ? 'synced' : 'offline', 'Ready');
    return { projectInfo: _projectInfo, userId: _userId, online: _online, instanceId: _instanceId, instanceNumber: _instanceNumber };
  }

  async function syncNow() {
    if (!_online) { _setStatus('offline', 'No connection'); return false; }
    if (!_collectStateFn) return false;
    try { _setStatus('saving', 'Syncing...'); var state = _collectStateFn(); await save(state); _setStatus('synced', 'Force sync complete'); return true; } catch (e) { _setStatus('error', 'Sync failed'); return false; }
  }

  function destroy() { stopAutoSave(); window.removeEventListener('online', _onOnline); window.removeEventListener('offline', _onOffline); _initialized = false; }

  return {
    init: init, load: load, save: save, startAutoSave: startAutoSave, stopAutoSave: stopAutoSave, syncNow: syncNow, destroy: destroy, readUrlParams: readUrlParams,
    get projectInfo() { return _projectInfo; }, get projectId() { return _projectId; }, get toolKey() { return _toolKey; },
    get instanceId() { return _instanceId; }, get instanceNumber() { return _instanceNumber; }, get userId() { return _userId; },
    get isOnline() { return _online; }, get hasPendingSync() { return _pendingSync; }, get isInitialized() { return _initialized; }, request: _request
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
 * Expose as globals — the inline call sites in index.html reference these by
 * bare name (typeof CloudSync !== 'undefined' guards throughout). Module scope
 * would hide them, so publish to window explicitly.
 * ════════════════════════════════════════════════════════════════════════ */
window.CloudSync = CloudSync;
window.R2Photos = R2Photos;
window.R2Outbox = R2Outbox;

/* S447: NO proactive Auth.restoreSession() here. The single-file tool never
 * restored/refreshed a session at page load — it uses whatever token is already
 * in localStorage (via CloudSync.init -> _getUser) and shows its own sign-in
 * gate when there isn't one. Calling restoreSession() here refreshed a session
 * from the stored refresh token on every load, which bypassed sign-in after the
 * user had signed out. Behavioral parity restored by leaving auth to the tool's
 * own boot. */
