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
import { createBinaryOutbox } from './lib/data/photoOutbox.js';   // S544: shared photo rescue
import { createChangeJournal } from './lib/data/changeJournal.js'; // S555: what did that save do
import { merge3, applyResolutions, summarizeConflict } from './lib/data/merge.js';
import * as Dlg from './lib/ui/dialogEngine.js';

/* ── Sync-only metadata DB (NEW — never touches ARENCON_DIESEL) ─────────── */
/* S544: version 2 adds 'photoOutbox' — the bookkeeping store the shared photo
   engine needs. Upgrades here are additive-only (createIDB never touches an
   existing store), and this database holds sync metadata ONLY: Diesel's report
   database ARENCON_DIESEL, its photos and its blobs are not involved. */
const SyncIDB = createIDB({
  dbName: 'ARENCON_DIESEL_SYNC',
  version: 3,
  stores: ['syncMeta', 'syncQueue', 'photoOutbox', 'changeJournal']
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
    var clone = JSON.parse(JSON.stringify(proj));
    /* S565 — CHANGE-BASED SYNC, STAGE TWO (shadow). On every real push,
       compute which report sections actually differ from the pinned common
       ancestor — the exact set a change-scoped save would send — and record
       it in the journal. RECORDS ONLY: the push itself is untouched, and any
       failure below resolves with the plain clone exactly as before. The
       server half (diesel_partial_save) is deployed and tested but nothing
       calls it yet; these records are the evidence that decides when it may. */
    return _shadowPushDiff(clone).catch(function () { /* never blocks a push */ })
      .then(function () { return { strippedData: clone, jsonBody: null }; });
  },
  merge3Worker: function (base, mine, theirs) {
    try { return Promise.resolve(merge3(base, mine, theirs)); }
    catch (e) { return Promise.reject(e); }
  }
};

/* ── S565: the shadow diff itself ───────────────────────────────────────────
 * Base pinning: the ancestor snapshot the engine persists to syncMeta after
 * every pull/push. It is only trusted when its updatedAt equals the engine's
 * in-memory lastSeenUpdatedAt — the same token the push's If-Match will carry.
 * If they disagree (mid-pull race, fresh boot, anything), no diff is recorded
 * for this push rather than a wrong one. Threshold-free by design: this is a
 * set comparison against the ancestor, not a judgement about size of change —
 * the journal's loss thresholds are a separate, still watch-only system. */
var _SHADOW_FIELDS = [
  ['recordPhotos',        'site photos'],
  ['flowTestPhotos',      'flow test photos'],
  ['stdData',             'flow readings'],
  ['pldData',             'PLD readings'],
  ['clState',             'checklist items'],
  ['deficiencies',        'deficiencies'],
  ['generalDeficiencies', 'general deficiencies'],
  ['sketchEntries',       'sketches'],
  ['batData',             'battery data'],
  ['contractorSignRows',  'sign-off rows']
];

function _shadowPushDiff(mine) {
  return Promise.resolve().then(function () {
    var pid = (window.CloudSync && window.CloudSync.projectId) || null;
    if (!pid || !mine) return null;
    var key = 'diesel:' + pid + ':' + (engine.instanceId || '_default');
    return SyncIDB.get('syncMeta', key).then(function (rec) {
      var pinned = !!(rec && rec.snapshot && rec.updatedAt &&
                      engine.lastSeenUpdatedAt && rec.updatedAt === engine.lastSeenUpdatedAt);
      var base = pinned ? rec.snapshot : null;
      if (base && typeof base === 'string') { try { base = JSON.parse(base); } catch (_) { base = null; pinned = false; } }
      var fullStr = '';
      try { fullStr = JSON.stringify(mine); } catch (_) {}
      if (!pinned || !base) {
        return DieselJournal.note({ kind: 'push', pinned: false,
          fullKB: Math.round((fullStr.length || 0) / 1024) });
      }
      var sent = [], sentBytes = 0, unchanged = 0;
      _SHADOW_FIELDS.forEach(function (f) {
        var kf = f[0], name = f[1];
        var a, b;
        try { a = JSON.stringify(mine[kf]); } catch (_) { a = undefined; }
        try { b = JSON.stringify(base[kf]); } catch (_) { b = undefined; }
        if (a === b) { if (a !== undefined) unchanged++; return; }
        sent.push(name);
        sentBytes += (a ? a.length : 0);
      });
      return DieselJournal.note({
        kind: 'push', pinned: true,
        sent: sent, unchanged: unchanged,
        sentKB: Math.round(sentBytes / 1024),
        fullKB: Math.round((fullStr.length || 0) / 1024)
      });
    });
  });
}

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

/* ── S544 — DIESEL JOINS THE SHARED PHOTO ENGINE ────────────────────────────
 * What this buys, in field terms: a photo whose stored file has gone missing
 * (upload never really landed, object deleted, key written before the file
 * existed) is re-uploaded automatically from THIS device's own copy of the
 * image the next time the report is opened here — and a photo that has no
 * image anywhere is reported instead of silently occupying a tile. S537 built
 * the copy that makes that possible; until now nothing read from it.
 *
 * WHAT IS NOT TURNED ON: Diesel keeps its own upload queue (R2Outbox). Nothing
 * is ever enqueued into this engine, so its upload processor, retry ladder and
 * pull-time re-injection stay dormant — those paths walk FRT's report shape and
 * are not Diesel's. The rescue pass is the part that is tool-neutral (S534),
 * and it is the part being used.
 *
 * The R2 adapter below exists because the shared engine speaks a different
 * upload signature than Diesel's R2Photos, and because Diesel photos carry
 * their bytes in `.d` rather than `.dataUrl`. Uploading through R2Photos keeps
 * the token-refresh behaviour Diesel already relies on in the field. */
const DieselR2 = {
  TOOL_KEY: 'diesel',
  get WORKER_URL() {
    try { return (window.R2Photos && window.R2Photos.WORKER_URL) || ''; } catch (_) { return ''; }
  },
  /** upload(projectId, type, blob, filename) -> {r2Key, r2Url} | null */
  upload: function (projectId, type, blob, filename) {
    const R2P = window.R2Photos;
    if (!R2P || !projectId || !blob) return Promise.resolve(null);
    const fname = filename || R2P.generateFilename('heal');
    return Promise.resolve(R2P.upload(projectId, 'diesel', type || 'original', fname, blob))
      .then(function () {
        return {
          r2Key: 'photos/' + projectId + '/diesel/' + (type || 'original') + '/' + fname,
          r2Url: R2P.getUrl(projectId, 'diesel', type || 'original', fname)
        };
      })
      .catch(function (e) {
        console.warn('[DieselSync] heal upload failed:', e && e.message);
        return null;
      });
  },
  /** uploadPhoto(projectId, photo, type) — Diesel photos hold bytes in `.d`. */
  uploadPhoto: function (projectId, photo, type) {
    const R2P = window.R2Photos;
    if (!R2P || !photo || !photo.d) return Promise.resolve(null);
    const blob = R2P.dataUrlToBlob(photo.d);
    if (!blob) return Promise.resolve(null);
    return DieselR2.upload(projectId, type || 'original', blob, R2P.generateFilename('heal'))
      .then(function (result) {
        if (result) { photo.r2Key = result.r2Key; photo.r2Url = result.r2Url; photo.r2Status = 'uploaded'; }
        return photo;
      });
  }
};

const DieselPhotoEngine = createBinaryOutbox({
  IDB: SyncIDB,
  R2: DieselR2,
  Auth: Auth,
  toast: function (m) { try { if (typeof window.showToast === 'function') window.showToast(m); } catch (_) {} },
  model: {
    getProject: model.getProject,
    saveNow: model.saveNow
  },
  // The three S534 injection points + the S544 project resolver.
  photoWalk: function (proj) {
    try {
      if (typeof window._collectAllPhotos !== 'function') return [];
      return window._collectAllPhotos({ includeDeleted: true, includeBackups: true })
        .map(function (it) { return it && it.photo; })
        .filter(Boolean);
    } catch (_) { return []; }
  },
  photoFields: { bytes: 'd', thumb: 't' },
  localBytes: function (id) {
    try {
      return (typeof window._dieselLocalBytes === 'function')
        ? window._dieselLocalBytes(id)
        : Promise.resolve(null);
    } catch (_) { return Promise.resolve(null); }
  },
  // Diesel's report payload has no top-level id (verified against the live
  // collect). The R2 folder the host established at Hub init is the truth.
  projectId: function () {
    try { return window._r2FolderId || null; } catch (_) { return null; }
  }
});

/* ── S555 — the change journal (stage one of change-based sync) ──────────
 * Records what each save changed. It does NOT block a save, does not travel to
 * the server, and does not feed the merge — those come only once this has been
 * watched against real inspections. `collections` is where Diesel says what its
 * report is made of; the journal itself has no idea what a flow reading is.
 * Named in plain language because these entries are read by a person on a
 * tablet, not by a developer. */
const DieselJournal = createChangeJournal({
  IDB: SyncIDB,
  collections: function (s) {
    s = s || {};
    var defs = 0;
    try {
      Object.keys(s.deficiencies || {}).forEach(function (k) {
        if (Array.isArray(s.deficiencies[k])) defs += s.deficiencies[k].length;
      });
    } catch (_) {}
    return {
      'site photos':      s.recordPhotos,
      'flow test photos': s.flowTestPhotos,
      'flow readings':    s.stdData,
      'PLD readings':     s.pldData,
      'checklist items':  s.clState,
      'deficiencies':     defs,
      'general deficiencies': s.generalDeficiencies,
      'sketches':         s.sketchEntries
    };
  },
  whoami: function () { try { return (Auth.getUser && Auth.getUser().email) || ''; } catch (_) { return ''; } },
  build:  function () { try { return window.DIESEL_BUILD || ''; } catch (_) { return ''; } },
  tag: '[diesel]'
});
try { window._dslJournal = DieselJournal; } catch (_) {}

/* ── The shared engine instance ─────────────────────────────────────────── */
const engine = createSync({
  toolKey: 'diesel',
  Auth: Auth,
  IDB: SyncIDB,
  model: model,
  SyncWorkerHost: DieselWorkerHost,
  BinaryOutbox: DieselPhotoEngine,   // S544: rescue + dead-key heal only (see above)
  // Per-tool presentation of "photos in this report have no image on this
  // device". The shared engine counts; Diesel's existing banner shows it.
  onPhotoAttention: function (remaining) {
    try { if (typeof window._phRenderBanner === 'function') window._phRenderBanner(remaining || 0); } catch (_) {}
  }
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
  let _lastPushedJson = '';   // S524 I-5: advances only on CONFIRMED push
  let _pendingSince = null;   // S524 I-5: when unsent work first appeared (durable)
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
    /* S524 DOCTRINE I-5 — THE 110-MINUTE BUG. _lastSavedJson was set BEFORE
       the push; when the push failed, the next autosave tick collected the
       same content, matched the dedupe, and returned — so a failed push was
       NEVER retried until the user typed something new, and each new attempt
       failed the same way. On 7155.40 this ran for 110 minutes. Fix: dedupe
       the local IDB write on _lastSavedJson as before, but gate the CLOUD
       push on _lastPushedJson, which only advances on a confirmed push. */
    var alreadyPushed = (stateJson === _lastPushedJson);
    if (stateJson === _lastSavedJson && alreadyPushed) return null;
    if (stateJson !== _lastSavedJson) {
      _lastSavedJson = stateJson;
      _cachePut(_cacheKey(), {
        state: stateJson, projectId: _projectId, toolKey: _toolKey,
        instanceId: engine.instanceId || _instanceId, instanceNumber: engine.instanceNumber || _instanceNumber,
        savedAt: new Date().toISOString(),
        /* S524 DOCTRINE I-5 — DURABLE ENTRY QUEUE.
           Photos survived 7155.40 (220/220 through two crashes) because their
           outbox is on disk: a crash cannot kill it. Report entries had only an
           in-memory retry, so killing the app discarded the knowledge that work
           was unsent — the data sat in this cache but nothing knew to send it.
           This flag is that knowledge, written to disk with the data itself, in
           the SAME record so the two can never disagree. It is cleared only by
           a CONFIRMED cloud push. On relaunch, _recoverUnsentWork() finds it. */
        pendingPush: true,
        pendingSince: _pendingSince || (_pendingSince = new Date().toISOString())
      });
    }
    if (!_online) { _setStatus('offline', 'Saved locally (offline)'); return null; }
    if (alreadyPushed) return null;
    try {
      _setStatus('saving', 'Syncing...');
      const row = await engine.push(_projectId);
      if (row) {
        _instanceId = engine.instanceId || _instanceId;
        _instanceNumber = engine.instanceNumber || _instanceNumber;
        _lastPushedJson = stateJson;   // confirmed on the server — only now
        /* S524 I-5 — the cloud has it: clear the durable unsent marker. This is
           the ONLY place it is cleared. A failed push, a 412, a PT409, an
           offline queue or a crash all leave it set, so the work is still
           found on the next launch. */
        _pendingSince = null;
        _cachePut(_cacheKey(), {
          state: stateJson, projectId: _projectId, toolKey: _toolKey,
          instanceId: engine.instanceId || _instanceId, instanceNumber: engine.instanceNumber || _instanceNumber,
          savedAt: new Date().toISOString(),
          pendingPush: false, pendingSince: null
        });
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

  /* ══════════════════════════════════════════════════════════════════════
     S524 DOCTRINE I-5 — RECOVER UNSENT WORK ON RELAUNCH.
     Call AFTER load() has completed and the host has applied its boot merge.
     Returns {recovered, minutesOld} or null.

     SAFETY — why this cannot repeat the 7155.40 boot-push wipe:
       • It NEVER pushes cached state directly. It only re-arms the retry
         path so the host's normal collect→save runs. The state that goes up
         is the live model AFTER the boot merge, not a raw disk blob.
       • engine.push refuses without an If-Match baseline (I-4), so if the
         boot pull failed, nothing is sent at all.
       • The server wipe guard (PT409) and the pull-side guards still apply.
       • It is a no-op when there is nothing unsent.
     ══════════════════════════════════════════════════════════════════════ */
  async function _recoverUnsentWork() {
    try {
      const rec = await _cacheGet(_cacheKey());
      if (!rec || !rec.pendingPush) return null;
      if (!engine.lastSeenUpdatedAt) {
        console.warn('[DieselSync I-5] Unsent work found but NO cloud baseline yet — ' +
                     'holding it on device; will retry once a pull succeeds.');
        return { recovered: true, minutesOld: _ageMin(rec.pendingSince), baseline: false };
      }
      // Force the next collect→save to actually push: clear the push dedupe so
      // identical content is not mistaken for "already sent".
      _lastPushedJson = '';
      _pendingSince = rec.pendingSince || new Date().toISOString();
      const mins = _ageMin(rec.pendingSince);
      console.log('[DieselSync I-5] Recovered unsent work from a previous session (' +
                  mins + ' min old) — flushing to cloud.');
      if (_collectStateFn && _online) {
        try { await save(_collectStateFn()); } catch (e) {
          console.warn('[DieselSync I-5] recovery flush failed; retry loop will continue:', e && e.message);
        }
      }
      return { recovered: true, minutesOld: mins, baseline: true };
    } catch (e) {
      console.warn('[DieselSync I-5] recovery check skipped:', e && e.message);
      return null;
    }
  }

  function _ageMin(iso) {
    if (!iso) return 0;
    var t = Date.parse(iso);
    return t ? Math.max(0, Math.round((Date.now() - t) / 60000)) : 0;
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
        /* S496 PUSH-BEFORE-PULL — Mark's field repro, diagnosed by Mark himself:
           type in window A → local save lands in ~0.7s but the CLOUD push waits
           for the 30s interval → this 15s pull sees window B's newer cloud copy
           → the apply routes through _mergeCloudLocal, where cloud is
           authoritative for scalars → the unpushed comment is REPLACED by B's
           older text. Whether an edit survived depended purely on whether its
           push happened to beat the next pull.
           Fix: if local edits are pending, PUSH FIRST. With the PT412 trigger,
           a push into newer cloud data 412s → 3-way merges against the last-seen
           base → non-overlapping edits (A typed 1.1, B typed 1.3) both survive
           silently; only a true same-field collision asks. THEN pull, which now
           applies the merged truth instead of clobbering the pending edit. */
        if (_collectStateFn) {
          try {
            const localNow = JSON.stringify(_collectStateFn());
            if (localNow !== _lastSavedJson) await save(localNow);
          } catch (e) { console.warn('[DieselSync] pre-pull push failed:', e && e.message); }
        }
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
    recoverUnsentWork: _recoverUnsentWork,   // S524 I-5 — call after boot load()
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

/* ── S496 Phase 2: host-contract continuity ────────────────────────────────
 * The removed inline IIFE defined `_idbKey()` and `_idbGet2()` as page-level
 * globals. One host site still calls them: the record-photo binary recovery
 * fallback (`_photoSrc` path), which — when a photo has lost its bytes but
 * still has an id/r2Key — scans the CloudSync cache copy of the report for a
 * matching photo before falling back to a network R2 fetch.
 *
 * That call is `typeof`-guarded, so dropping these would NOT have thrown. It
 * would have silently removed one rung of the photo-recovery ladder — the
 * exact class of invisible regression the S492 sweep caused. Republished here
 * with identical semantics (same arencon_cloud_cache DB, same
 * `projectId|toolKey|instanceId` key format), so the ladder is unchanged. */
window._idbKey = function () {
  return (CloudSync.projectId || '') + '|' + (CloudSync.toolKey || '')
       + '|' + (CloudSync.instanceId || 'new');
};
window._idbGet2 = function (key) { return _cacheGet(key); };
console.log('%c[DieselSync] merge-based sync engine active (S492)',
  'background:#9C2742;color:#fff;padding:2px 8px;border-radius:4px;');

/* S447 parity note, still binding: NO proactive Auth.restoreSession() here.
 * The tool uses whatever token is already in localStorage and shows its own
 * sign-in gate when there is none. */
