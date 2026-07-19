/* ============================================================================
 * ARENCON Diesel — CloudSync facade over the SHARED sync engine (S492)
 * ----------------------------------------------------------------------------
 * Replaces the inline last-write-wins CloudSync IIFE in the Diesel tool.
 * Mark's decision (S491): Diesel moves to MERGE-BASED sync, matching FRT and
 * the shared engine. This module is that move.
 *
 * WHAT IS SHARED (one implementation, /lib/):
 *   - lib/data/sync.js   createSync — pull/push, If-Match optimistic
 *     concurrency, 412 → 3-way merge → silent retry or conflict modal,
 *     syncMeta ancestor snapshots persisted to IDB (survives reload).
 *   - lib/data/merge.js  merge3 / applyResolutions / summarizeConflict —
 *     THE shared 3-way merge engine (model-neutral; id-keyed structures).
 *   - lib/data/idb.js    createIDB — a NEW, sync-only metadata database
 *     (ARENCON_DIESEL_SYNC). Diesel's own ARENCON_DIESEL database and its
 *     ADB layer are NOT touched.
 *   - lib/shared/auth.js Auth — Supabase transport with the S91/S395
 *     401 → silent-refresh → retry chain. Same sb-access-token /
 *     sb-refresh-token keys Diesel's sign-in already writes (verified).
 *   - lib/ui/dialogEngine.js — the conflict-resolution screen.
 *
 * WHAT STAYS DIESEL'S (locked per-tool personality — do NOT converge):
 *   - The photo save path. _collectCloudState() applies the S393 _keepD rule
 *     (photo bytes stay in the cloud payload until r2Status==='uploaded').
 *     Because Diesel's collect already produces the correct cloud shape,
 *     this module's serializePush is CLONE-ONLY — it must NEVER apply the
 *     FRT stripBinaries walk (different photo model; byte field is `.d`).
 *   - ADB (ARENCON_DIESEL) local persistence, R2Photos, R2Outbox — untouched.
 *   - _mergeCloudLocal — Diesel's field-proven union merge, still the
 *     protective layer for every SILENT cloud apply (S25 empty-cloud guard +
 *     S335 photo union + S488 "real local" canon).
 *   - The arencon_cloud_cache offline-load fallback (devices already have it).
 *
 * PUBLIC SHAPE: window.CloudSync with the exact API the ~40 inline call
 * sites use: init/load/save/startAutoSave/stopAutoSave/syncNow/destroy/
 * readUrlParams/request + projectId/instanceId/instanceNumber/projectInfo/
 * userId/isInitialized/isOnline/hasPendingSync getters. Zero call-site
 * churn beyond the three surgical host edits documented in the handoff.
 *
 * CONCURRENCY MODEL (the change Mark decided):
 *   OLD: PATCH with no precondition — two editors, last save silently wins.
 *   NEW: every push carries If-Match on the last-seen cloud timestamp.
 *        If someone else saved first → 412 → 3-way merge (base = last-seen
 *        snapshot) → non-overlapping edits auto-merge silently; true
 *        same-field conflicts surface ONE dialog where the inspector picks
 *        per-field. Bounded to 3 retries; on abandonment the save stays
 *        pending and re-tries on the next save/reconnect — never lost,
 *        never silently overwritten.
 * ========================================================================== */

import { Auth } from './lib/shared/auth.js';
import { createIDB } from './lib/data/idb.js';
import { createSync } from './lib/data/sync.js';
import { merge3, applyResolutions, summarizeConflict } from './lib/data/merge.js';
import * as Dlg from './lib/ui/dialogEngine.js';

/* ── Sync-only metadata DB (NEW — never touches ARENCON_DIESEL) ─────────── */
const SyncIDB = createIDB({
  dbName: 'ARENCON_DIESEL_SYNC',
  version: 1,
  stores: ['syncMeta', 'syncQueue']
});

/* ── Worker-host adapter ────────────────────────────────────────────────────
 * Diesel payloads are small (uploaded photo bytes already stripped by
 * _collectCloudState), so no background worker is needed. merge3Worker
 * still runs THE shared merge engine — same brain as FRT, same results.
 * serializePush is CLONE-ONLY by design (see header). */
const DieselWorkerHost = {
  parseLarge: function (text) {
    return Promise.resolve(JSON.parse(text));
  },
  serializePush: function (proj) {
    return Promise.resolve({
      strippedData: JSON.parse(JSON.stringify(proj)),
      jsonBody: null
    });
  },
  merge3Worker: function (base, mine, theirs) {
    try { return Promise.resolve(merge3(base, mine, theirs)); }
    catch (e) { return Promise.reject(e); }
  }
};

/* ── Model adapter (the canonical 4-method contract) ────────────────────────
 * getProject  → _collectCloudState(): the cloud-shaped payload WITH Diesel's
 *               S393 photo-byte rules already applied.
 * setProject  → silent-pull apply. Boot uses capture mode (the host's S488
 *               boot block does its own IDB merge — unchanged); heartbeat
 *               pulls run through _applyCloudSilent, which keeps ALL of
 *               Diesel's protections: S25 empty-cloud guard + S335 union
 *               via _mergeCloudLocal against the REAL current local state.
 * applyMerged → 412-path apply of a 3-way merged result. The merged object
 *               already contains local's newer edits by merge semantics.
 * saveNow     → Diesel's own saveState (field-proven local persistence). */
let _captureNext = false;

function _applyCloudSilent(cloudState) {
  const w = window;
  try {
    const local = (typeof w._collectCloudState === 'function') ? w._collectCloudState() : null;
    // S25 EMPTY-CLOUD GUARD — never let a materially-empty cloud row
    // overwrite a non-empty local report. Local wins; the next push
    // repopulates cloud (If-Match will match — we HAVE seen this row).
    if (typeof w._stateHasContent === 'function' && local &&
        !w._stateHasContent(cloudState) && w._stateHasContent(local)) {
      console.warn('[DieselSync] S25 guard: cloud row empty, local has content — keeping local.');
      return;
    }
    const merged = (typeof w._mergeCloudLocal === 'function' && local)
      ? w._mergeCloudLocal(cloudState, local)
      : cloudState;
    w._applyLoadedState(JSON.stringify(merged));
  } catch (e) {
    console.warn('[DieselSync] silent apply failed:', e && e.message);
  }
}

const model = {
  getProject: function () {
    const w = window;
    if (typeof w._collectCloudState === 'function') return w._collectCloudState();
    if (typeof w.collectState === 'function') return w.collectState();
    return null;
  },
  setProject: function (data) {
    if (_captureNext) { _captureNext = false; return; }   // boot load: host applies
    _applyCloudSilent(data);
  },
  applyMerged: function (merged) {
    try { window._applyLoadedState(JSON.stringify(merged)); }
    catch (e) { console.warn('[DieselSync] applyMerged failed:', e && e.message); }
  },
  saveNow: function () {
    try { if (typeof window.saveState === 'function') window.saveState(); } catch (_) {}
  }
};

/* ── The shared engine instance ─────────────────────────────────────────── */
const engine = createSync({
  toolKey: 'diesel',
  Auth: Auth,
  IDB: SyncIDB,
  model: model,
  SyncWorkerHost: DieselWorkerHost,
  BinaryOutbox: null            // Diesel's R2Outbox stays its own, untouched
});

/* ── Conflict screen (shared dialog engine; semantic accent, no burgundy) ──
 * Auto-resolves bookkeeping noise (_build, dateModified — both sides stamp
 * them on every save, so they can conflict without any human meaning) in
 * favour of MINE, and only shows the dialog for real field conflicts. */
const _NOISE_PATHS = { '_build': 1, 'dateModified': 1 };

engine.onConflict = function (conflicts, mergeResult) {
  const auto = [], real = [];
  conflicts.forEach(function (c) {
    (_NOISE_PATHS[c.path] ? auto : real).push(c);
  });
  const autoRes = auto.map(function (c) { return { path: c.path, chosen: 'mine' }; });

  if (!real.length) {
    return { merged: applyResolutions(mergeResult, autoRes) };
  }

  const SHOW_MAX = 8;
  const shown = real.slice(0, SHOW_MAX);
  const overflow = real.slice(SHOW_MAX)
    .map(function (c) { return { path: c.path, chosen: 'mine' }; });

  const fields = shown.map(function (c, i) {
    const s = summarizeConflict(c);
    return {
      key: 'c' + i,
      label: s.pretty,
      type: 'select',
      value: 'mine',
      options: [
        { value: 'mine',   label: 'Keep my version — ' + s.mine },
        { value: 'theirs', label: 'Use their version — ' + s.theirs }
      ]
    };
  });

  return Dlg.form({
    title: 'This report was changed by someone else',
    icon: '\u21C4',
    accent: 'warn',
    message: 'Another save happened while you were editing. Everything that ' +
             'did not overlap has been combined automatically. For each item ' +
             'below, choose which version to keep.',
    fields: fields,
    okText: 'Apply & save',
    cancelText: 'Not now'
  }).then(function (vals) {
    if (!vals) return null;   // user cancelled → push abandoned, stays pending
    const picked = shown.map(function (c, i) {
      return { path: c.path, chosen: (vals['c' + i] === 'theirs') ? 'theirs' : 'mine' };
    });
    const merged = applyResolutions(mergeResult, autoRes.concat(overflow, picked));
    return { merged: merged };
  });
};

engine.onSilentMerge = function (mergeResult) {
  try {
    console.info('[DieselSync] silent merge applied — both editors kept ('
      + ((mergeResult && mergeResult.conflicts) ? mergeResult.conflicts.length : 0)
      + ' conflicts).');
  } catch (_) {}
};

/* ── arencon_cloud_cache — offline-load fallback (verbatim continuity) ────
 * Devices already carry this DB from the old CloudSync; keeping it means an
 * offline boot after the switchover still finds its cached report. */
const CACHE_DB = 'arencon_cloud_cache', CACHE_VER = 1, CACHE_STORE = 'tool_state';
let _cacheDb = null;
function _cacheOpen() {
  return new Promise(function (resolve, reject) {
    if (_cacheDb) { resolve(_cacheDb); return; }
    const req = indexedDB.open(CACHE_DB, CACHE_VER);
    req.onupgradeneeded = function (e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
    };
    req.onsuccess = function (e) { _cacheDb = e.target.result; resolve(_cacheDb); };
    req.onerror = function (e) { reject(e.target.error); };
  });
}
function _cacheGet(key) {
  return _cacheOpen().then(function (db) {
    return new Promise(function (resolve) {
      try {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const req = tx.objectStore(CACHE_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
  }).catch(function () { return null; });
}
function _cachePut(key, val) {
  return _cacheOpen().then(function (db) {
    return new Promise(function (resolve) {
      try {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        tx.objectStore(CACHE_STORE).put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      } catch (_) { resolve(); }
    });
  }).catch(function () {});
}

/* ── The facade ─────────────────────────────────────────────────────────── */
const CloudSync = (function () {
  let _projectId = null;
  let _toolKey = null;
  let _instanceId = null;          // seed; live value proxied from the engine
  let _instanceNumber = 1;
  let _onStatusChange = null;
  let _autoSaveTimer = null;
  let _collectStateFn = null;
  let _online = navigator.onLine;
  let _userId = null;
  let _projectInfo = null;
  let _lastSavedJson = '';
  let _initialized = false;
  let _pulling = false;

  function _setStatus(status, msg) {
    if (_onStatusChange) { try { _onStatusChange(status, msg); } catch (_) {} }
  }

  // S447 transport contract: Diesel's REST calls always send
  // Prefer: return=representation so PATCH/POST return the written row.
  function _request(path, opts) {
    opts = opts || {};
    const hdrs = Object.assign({ 'Prefer': 'return=representation' }, opts.headers || {});
    return Auth.request(path, {
      method: opts.method || 'GET',
      headers: hdrs,
      body: opts.body,
      keepalive: (opts.method === 'PATCH' || opts.method === 'POST')
    });
  }

  function _cacheKey() { return _projectId + '|' + _toolKey + '|' + (engine.instanceId || _instanceId || 'new'); }

  async function _getUser() {
    const token = localStorage.getItem('sb-access-token');
    if (!token) return null;
    try { return await _request('/auth/v1/user'); } catch (e) { return null; }
  }

  async function _loadProjectInfo() {
    if (!_projectId) return null;
    try {
      const rows = await _request('/rest/v1/projects?select=*&id=eq.' + _projectId,
        { headers: { 'Accept': 'application/vnd.pgrst.object+json' } });
      _projectInfo = rows;
      return rows;
    } catch (e) { return null; }
  }

  async function _getNextInstanceNumber() {
    if (!_online) return 1;
    try {
      const rows = await _request('/rest/v1/tool_data?select=instance_number&project_id=eq.'
        + _projectId + '&tool_key=eq.' + _toolKey + '&order=instance_number.desc&limit=1');
      if (rows && rows.length > 0) return rows[0].instance_number + 1;
    } catch (e) {}
    return 1;
  }

  // Row status/updated_at for the boot badge (the engine's pull does not
  // hand the row back). ~150-byte query.
  async function _fetchRowMeta() {
    try {
      let path;
      if (engine.instanceId || _instanceId) {
        path = '/rest/v1/tool_data?select=id,status,instance_number,updated_at&id=eq.' + (engine.instanceId || _instanceId);
      } else {
        path = '/rest/v1/tool_data?select=id,status,instance_number,updated_at&project_id=eq.' + _projectId
          + '&tool_key=eq.' + _toolKey + '&order=updated_at.desc&limit=1';
      }
      const rows = await _request(path);
      return (rows && rows.length) ? rows[0] : null;
    } catch (e) { return null; }
  }

  async function init(opts) {
    _toolKey = opts.toolKey;
    _onStatusChange = opts.onStatusChange || null;
    _projectId = opts.projectId || null;
    _instanceId = opts.instanceId || null;

    try { await SyncIDB.init(); } catch (e) { console.warn('[DieselSync] sync-meta IDB open failed:', e && e.message); }
    try { const user = await _getUser(); if (user) _userId = user.id; } catch (e) {}
    if (_projectId && _online) { try { await _loadProjectInfo(); } catch (e) {} }
    if (_projectId && !_instanceId) { _instanceNumber = await _getNextInstanceNumber(); }

    window.addEventListener('online', function () {
      _online = true;
      _setStatus('saving', 'Reconnected...');
      if (engine.isPending) {
        engine.flush().then(function (r) { _setStatus(r ? 'synced' : 'pending', r ? 'Saved to cloud' : 'Saved locally'); });
      } else { _setStatus('synced', 'Online'); }
    });
    window.addEventListener('offline', function () {
      _online = false;
      _setStatus('offline', 'Working offline');
    });

    _initialized = true;
    _setStatus(_online ? 'synced' : 'offline', 'Ready');
    return { projectInfo: _projectInfo, userId: _userId, online: _online, instanceId: _instanceId, instanceNumber: _instanceNumber };
  }

  /* Boot load. Capture-mode pull: the engine records the cloud row as the
   * 3-way-merge ancestor and concurrency token, but does NOT apply it —
   * the host's S488 boot block (unchanged) merges against the real IDB
   * autosave and applies. Return shape identical to the old CloudSync. */
  async function load() {
    try { await engine.loadIDBSnapshot(_projectId, _instanceId); } catch (_) {}
    if (_online) {
      try {
        _captureNext = true;
        const data = await engine.pull(_projectId, _instanceId, { allowStaleOverwrite: true });
        _captureNext = false;
        if (data) {
          const meta = await _fetchRowMeta();
          _instanceId = engine.instanceId || _instanceId;
          _instanceNumber = engine.instanceNumber || _instanceNumber;
          const sj = JSON.stringify(data);
          _lastSavedJson = sj;
          _cachePut(_cacheKey(), {
            state: sj, projectId: _projectId, toolKey: _toolKey,
            instanceId: _instanceId, instanceNumber: _instanceNumber,
            savedAt: (meta && meta.updated_at) || new Date().toISOString()
          });
          _setStatus('synced', 'Loaded from cloud');
          return {
            source: 'cloud',
            state: data,
            row: meta || { id: _instanceId, status: 'draft', updated_at: engine.lastSeenUpdatedAt }
          };
        }
      } catch (e) {
        _captureNext = false;
        console.warn('[DieselSync] cloud load failed:', e && e.message);
      }
    }
    try {
      const idbData = await _cacheGet(_cacheKey());
      if (idbData && idbData.state) {
        _setStatus(_online ? 'synced' : 'offline', 'Loaded from cache');
        return {
          source: 'idb',
          state: (typeof idbData.state === 'string') ? JSON.parse(idbData.state) : idbData.state,
          row: null
        };
      }
    } catch (e) { console.error('[DieselSync] cache load failed:', e); }
    _setStatus(_online ? 'synced' : 'offline', 'No saved data');
    return null;
  }

  /* Save. The engine pushes model.getProject() — a FRESH _collectCloudState()
   * — under If-Match. stateJson is used for dedupe + the offline cache only
   * (call sites pass the same collect, so the two are equivalent). */
  async function save(stateJson) {
    if (typeof stateJson !== 'string') stateJson = JSON.stringify(stateJson);
    if (stateJson === _lastSavedJson) return null;
    _lastSavedJson = stateJson;
    _cachePut(_cacheKey(), {
      state: stateJson, projectId: _projectId, toolKey: _toolKey,
      instanceId: engine.instanceId || _instanceId, instanceNumber: engine.instanceNumber || _instanceNumber,
      savedAt: new Date().toISOString()
    });
    if (!_online) { _setStatus('offline', 'Saved locally (offline)'); return null; }
    try {
      _setStatus('saving', 'Syncing...');
      const row = await engine.push(_projectId);
      if (row) {
        _instanceId = engine.instanceId || _instanceId;
        _instanceNumber = engine.instanceNumber || _instanceNumber;
        _setStatus('synced', 'Saved to cloud');
        return row;
      }
      // null = offline-queued, conflict abandoned/cancelled, or push error —
      // in every case the local save is durable and retries later.
      _setStatus('pending', 'Saved locally');
      return null;
    } catch (e) {
      console.warn('[DieselSync] save failed:', e && e.message);
      _setStatus('pending', 'Saved locally');
      return null;
    }
  }

  /* Heartbeat tick — periodic silent pull. Replaces the inline
   * _syncHeartbeat body. Order of protections:
   *   1. S321: never pull-apply over a live edit (active input OR a pending
   *      autosave debounce) — defer to the next beat.
   *   2. Cheap updated_at probe vs the engine's last-seen token — the exact
   *      ancestor bookkeeping, no localStorage timestamp heuristics.
   *   3. engine.pull (silent) → setProject → _applyCloudSilent, which keeps
   *      the S25 empty-cloud guard + the _mergeCloudLocal union against the
   *      REAL current local state.  */
  async function heartbeatTick() {
    if (!_online || _pulling || !_initialized || !_projectId) return;
    const ae = document.activeElement;
    const editing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT');
    if (editing || window._autosaveTimer) return;   // S321 deferral
    _pulling = true;
    try {
      const remote = await engine.getRemoteUpdatedAt(_projectId, engine.instanceId || _instanceId);
      if (remote && remote !== engine.lastSeenUpdatedAt) {
        await engine.pull(_projectId, engine.instanceId || _instanceId);   // silent — stale-guard active
        const ctl = window.__dslHeaderCtl;
        if (ctl) {
          ctl.setCloud({ state: 'pull' });
          setTimeout(function () { ctl.setCloud({ state: 'ok' }); }, 2000);
        }
      }
    } catch (e) {
      console.warn('[DieselSync] heartbeat tick failed:', e && e.message);
    }
    _pulling = false;
  }

  function startAutoSave(collectStateFn, intervalMs) {
    _collectStateFn = collectStateFn;
    stopAutoSave();
    _autoSaveTimer = setInterval(function () {
      if (!_collectStateFn) return;
      try { save(_collectStateFn()); }
      catch (e) { console.error('[DieselSync] auto-save error:', e); }
    }, intervalMs || 15000);
  }
  function stopAutoSave() {
    if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
  }

  async function syncNow() {
    if (!_online) { _setStatus('offline', 'No connection'); return false; }
    try {
      _setStatus('saving', 'Syncing...');
      const row = await engine.push(_projectId);
      _setStatus(row ? 'synced' : 'pending', row ? 'Force sync complete' : 'Saved locally');
      return !!row;
    } catch (e) { _setStatus('error', 'Sync failed'); return false; }
  }

  function readUrlParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      projectId: p.get('project') || null, instanceId: p.get('instance') || null,
      projectNumber: p.get('pn') || null, projectName: p.get('pname') || null,
      client: p.get('client') || null, address: p.get('addr') || null,
      smartFilename: p.get('sfn') || null
    };
  }

  function destroy() { stopAutoSave(); _initialized = false; }

  return {
    init: init, load: load, save: save,
    startAutoSave: startAutoSave, stopAutoSave: stopAutoSave,
    syncNow: syncNow, destroy: destroy, readUrlParams: readUrlParams,
    heartbeatTick: heartbeatTick, request: _request,
    get projectInfo() { return _projectInfo; },
    get projectId() { return _projectId; },
    get toolKey() { return _toolKey; },
    get instanceId() { return engine.instanceId || _instanceId; },
    get instanceNumber() { return engine.instanceNumber || _instanceNumber; },
    get userId() { return _userId; },
    get isOnline() { return _online; },
    get hasPendingSync() { return engine.isPending; },
    get isInitialized() { return _initialized; },
    get engine() { return engine; }          // console diagnostics only
  };
})();

window.CloudSync = CloudSync;
console.log('%c[DieselSync] merge-based sync engine active (S492)',
  'background:#9C2742;color:#fff;padding:2px 8px;border-radius:4px;');

/* S447 parity note, still binding: NO proactive Auth.restoreSession() here.
 * The tool uses whatever token is already in localStorage and shows its own
 * sign-in gate when there is none. */
