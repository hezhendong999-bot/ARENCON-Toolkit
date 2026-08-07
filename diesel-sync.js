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
import { createSync, contentEquals } from './lib/data/sync.js';   // S583: canonical no-change comparison
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
    /* S566: clone-only again. The S565 shadow diff lived here for one build;
       the engine now computes the real change-scoped payload itself and
       reports every outcome through config.partialSave.onPartialPush below —
       one implementation, not a matching copy. */
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

/* ═══ S590 — CHANGE OBSERVER for the badge system (PURE READ) ══════════════
   Whenever the engine replaces on-screen state (silent pull, silent merge,
   resolved 412), diff the flow readings row-by-row and hand every changed
   field to the badge module together with the incoming write's device
   receipt (S589 _dev/_via/_wroteAt). Never touches the save path — a badge
   bug can cost a badge, never a reading. */
function _flowDiffEvents(prev, next) {
  var evts = [];
  if (!prev || !next) return evts;
  var FIELDS = ['suction', 'discharge', 'rpm', 'flow', 'cutsheet', 'placard', 'bfUp', 'bfDown'];
  ['stdData', 'pldData'].forEach(function (tbl) {
    var pa = Array.isArray(prev[tbl]) ? prev[tbl] : [];
    var na = Array.isArray(next[tbl]) ? next[tbl] : [];
    var byPct = {};
    pa.forEach(function (r) { if (r && r.pct != null) byPct[r.pct] = r; });
    na.forEach(function (r, ni) {
      if (!r || r.pct == null) return;
      var p = byPct[r.pct]; if (!p) return;
      FIELDS.forEach(function (f) {
        var a = (p[f] == null) ? '' : String(p[f]);
        var b = (r[f] == null) ? '' : String(r[f]);
        if (a !== b) {
          evts.push({ path: tbl + ':' + r.pct + ':' + f, tbl: tbl, idx: ni, pct: r.pct,
                      field: f, prev: a, next: b,
                      dev: next._dev || '', via: next._via || 'sync',
                      wroteAt: next._wroteAt || new Date().toISOString() });
        }
      });
    });
  });
  return evts;
}
function _noteFlowChanges(prev, next) {
  try {
    var evts = _flowDiffEvents(prev, next);
    if (evts.length && window._dslChangeBadges) window._dslChangeBadges.noteChanges(evts);
  } catch (e) { console.warn('[DieselSync] change-badge diff skipped:', e && e.message); }
}

/* ═══ S598 — PULL TELEMETRY (automatic; nothing for anyone to run) ═════════
   Two days of failures have all had the same shape: the cloud holds the right
   number, the device pulls, and the screen keeps the old one — and every
   attempt to reproduce it off-device has passed. So the device now reports the
   decision itself. On any pull where the cloud copy differs from the screen,
   one small row goes to sync_diag with both values, both entry stamps, and
   what was applied. Fire-and-forget, never blocks or fails a sync. This is
   read from the database; it is not a panel and needs no one's attention. */
/* S602 — module-scope mirrors of the three identifiers _diag needs; set once
   in init(). Kept deliberately small and write-once so they cannot drift. */
let _diagTool = null, _diagProject = null, _diagInstance = null;

function _diag(event, detail) {
  try {
    var tok = null; try { tok = localStorage.getItem('sb-access-token'); } catch (_) {}
    if (!tok) return;
    fetch(Auth.SUPABASE_URL + '/rest/v1/sync_diag', {
      method: 'POST',
      headers: { 'apikey': Auth.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + tok,
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        device: (function(){ try { return localStorage.getItem('arencon-device-id'); } catch(_) { return null; } })(),
        /* ═══ S602 — WHY THIS TABLE HAS ALWAYS BEEN EMPTY ═══════════════════
           This function sits at module scope; _toolKey, _projectId and
           _instanceId are declared INSIDE the CloudSync closure below. Reading
           them from here throws ReferenceError on the very first line of the
           payload — swallowed by the catch, so every call has failed silently
           since the telemetry was added. S599 moved the reporting deeper in
           order to explain an empty table; the table was empty because the
           writer itself never ran. An empty sync_diag has therefore NOT been
           evidence that a code path did not execute. Mirrors, set in init(),
           are visible from here. */
        tool: _diagTool, project_id: _diagProject || null,
        instance_id: (engine && engine.instanceId) || _diagInstance || null,
        event: event, detail: detail
      })
    }).catch(function () {});
  } catch (_) {}
}

function _pick100(state) {
  try {
    var r = (state && state.stdData || []).filter(function (x) { return x && x.pct === '100%'; })[0];
    return r ? { disch: r.discharge, ts: r._ts } : null;
  } catch (_) { return null; }
}

function _applyCloudSilent(cloudState) {
  const w = window;
  try {
    const local = (typeof w._collectCloudState === 'function') ? w._collectCloudState() : null;
    /* S583 — NO-CHANGE GATE (Mark's ruling: identical content produces total
       silence). If the cloud copy matches what this window already shows —
       compared canonically, bookkeeping ignored — apply NOTHING: no merge, no
       _applyLoadedState, no re-render of every table. The engine-level gate
       usually catches this first; this is the belt on Diesel's own door. */
    var _c100 = _pick100(cloudState), _l100 = _pick100(local);
    var _differs = !!(_c100 && _l100 && String(_c100.disch) !== String(_l100.disch));
    if (local && contentEquals(cloudState, local)) {
      if (_differs) _diag('gate_blocked_apply', { cloud: _c100, screen: _l100, build: (typeof DIESEL_BUILD!=='undefined'?DIESEL_BUILD:'?') });
      return;
    }
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
    _noteFlowChanges(local, merged);   // S590: badge what this apply changed
    if (_differs) _diag('applied', { cloud: _c100, screen: _l100, applied: _pick100(merged),
      build: (typeof DIESEL_BUILD!=='undefined'?DIESEL_BUILD:'?') });
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
    try {
      var _prevB = (typeof window._collectCloudState === 'function') ? window._collectCloudState() : null;
      window._applyLoadedState(JSON.stringify(merged));
      _noteFlowChanges(_prevB, merged);   // S590: badge what the merge changed
    }
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
  },
  /* S566 — CHANGE-SCOPED SAVES: ON for Diesel (Mark's call, all tools).
     The engine sends only the report sections that differ from the pinned
     ancestor; every outcome — scoped or full, and why — lands in the journal
     so Recent Saves shows what each push actually did on a real job. */
  partialSave: {
    onPartialPush: function (info) {
      try {
        DieselJournal.note(Object.assign({ kind: 'push', pinned: true }, info || {}));
      } catch (_) {}
    }
  }
});

/* ── Conflict screen (shared dialog engine; semantic accent, no burgundy) ──
 * Auto-resolves bookkeeping noise (_build, dateModified — both sides stamp
 * them on every save, so they can conflict without any human meaning) in
 * favour of MINE, and only shows the dialog for real field conflicts. */
const _NOISE_PATHS = { '_build': 1, 'dateModified': 1 };
/* S583: per-item stamps and field-stamp maps are bookkeeping — merge3 now
   resolves them deterministically (newer wins) and no longer emits them, but
   older payloads in flight can still carry them. Belt: any path whose leaf is
   _ts or _fts auto-resolves and never reaches a person. */
function _isNoisePath(p) {
  if (_NOISE_PATHS[p]) return true;
  /* S592: the S589 device-receipt fields are bookkeeping — they were showing
     up as "2 contested field(s)" on every collision (console, 03 Aug 12:12). */
  if (p === '_dev' || p === '_tab' || p === '_via' || p === '_wroteAt') return true;
  return /(^|[.\[])_(ts|fts)(\]|$)/.test(p) || /\._ts$/.test(p) || /\._fts$/.test(p);
}

engine.onConflict = function (conflicts, mergeResult) {
  /* ═══ S590 — NO MODAL, EVER (Mark's ruling, stated three times, final).
     "This report was changed by someone else" is gone. Whatever the merge
     could not settle on its own resolves HERE, automatically:
       • bookkeeping paths → this side (they carry no meaning);
       • everything else → the CLOUD side. By this point the engine's stamp
         tiebreak (S590 in merge.js) has already given every contested field
         to the NEWER ENTRY; only stamp-less or same-instant edits reach this
         list. Preferring cloud for those is the resurrection-safe default: a
         stale window's copy carries old stamps and has already lost the
         fields that matter, so nothing it holds can overwrite newer work,
         while a person actively typing wins the very next save because their
         entry re-stamps fresher.
     The overwritten values are not lost — every version is in the history
     table, which the badge system will surface for review. The push then
     completes: reconnect → merge → "Saved to cloud", no questions asked. */
  const res = conflicts.map(function (c) {
    return { path: c.path, chosen: _isNoisePath(c.path) ? 'mine' : 'theirs' };
  });
  try {
    if (conflicts.length) {
      console.info('[DieselSync S590] ' + conflicts.length + ' contested field(s) auto-resolved, latest entry wins:');
      conflicts.forEach(function (c) {
        const s = summarizeConflict(c);
        console.info('  · ' + s.pretty + ' → ' + (_isNoisePath(c.path) ? 'this device' : 'cloud'));
      });
    }
  } catch (_) {}
  return { merged: applyResolutions(mergeResult, res) };
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
  /* S584 — THE STRANDED-PHONE FIX. _online was set at boot and then changed
     ONLY by the browser's online/offline events. On Android, the 'online'
     event after airplane mode is unreliable — if it never fires, this flag
     stays false forever: every save says "Saved locally (offline)", the
     heartbeat refuses to run, and the device sits fully connected but mute
     until the app is killed. (1490.04 retest: phone held 60 psi locally and
     never sent it.) The OS always knows the real state via navigator.onLine —
     read it LIVE at every decision point; the events remain only as instant
     status-pill updates. */
  function _netUp() { _online = (navigator.onLine !== false); return _online; }
  let _userId = null;
  let _projectInfo = null;
  let _lastSavedJson = '';
  /* S595 — last ACTUAL keystroke (not focus). See the heartbeat gate below. */
  let _lastEditAt = 0;
  try {
    document.addEventListener('input', function () { _lastEditAt = Date.now(); }, true);
  } catch (_) {}
  /* S585 — sync diagnostics timeline (feeds the on-screen Sync Status panel) */
  let _lastPushOkAt = 0, _lastPushFailAt = 0, _lastPushFailMsg = '', _lastPullAt = 0;
  let _lastPushedJson = '';   // S524 I-5: advances only on CONFIRMED push
  let _pendingSince = null;   // S524 I-5: when unsent work first appeared (durable)
  let _initialized = false;
  let _pulling = false;

  /* ═══ S602 — TICK HEALTH ════════════════════════════════════════════════
     _lastCheckAt   : the device LOOKED at the cloud (whether or not anything
                      came back). Reported separately from _lastPullAt, which
                      only moves when something was actually received.
     _pullingSince  : when the current check started, so a hung request can be
                      released instead of deafening the device permanently.
     TICK_NET_TIMEOUT_MS : a cloud check that has not answered in 20s has not
                      failed — it has hung. Treat it as failed and move on.
     TICK_WATCHDOG_MS    : hard ceiling on holding the busy flag.            */
  let _lastCheckAt = 0, _pullingSince = 0, _lastTickWhy = '', _lastTickAt = 0;
  let _bootTrace = [];   // S603 — how far startup got, shown on the panel
  const TICK_NET_TIMEOUT_MS = 20000;
  const TICK_WATCHDOG_MS = 45000;

  function _withTimeout(p, ms, label) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error(label + ' timed out after ' + Math.round(ms / 1000) + 's')); }, ms);
    })]);
  }

  /* One line per tick, rate-limited: every change of outcome is reported, and
     an unchanging outcome repeats at most once every two minutes. Enough to
     read a device's whole day; not enough to flood the table. */
  function _tickDiag(why, extra) {
    var now = Date.now();
    var same = (why === _lastTickWhy);
    _lastTickWhy = why;
    if (same && (now - _lastTickAt) < 120000 && !/^(pulled|error|probe-failed|watchdog)/.test(why)) return;
    _lastTickAt = now;
    try { _diag('tick', Object.assign({ why: why, sinceCheck: _lastCheckAt ? now - _lastCheckAt : null }, extra || {})); }
    catch (_) {}
  }

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

  /* ═══ S587 — BACKGROUND SYNC ARMING ═══════════════════════════════════════
     Android's Background Sync API is the OS-level answer to "push it when the
     internet comes back": once armed, the service worker's 'sync' event fires
     on connectivity restoration EVEN IF the page is pocketed, frozen, or
     closed. Every foreground timing dependency the last three sessions fought
     disappears. Armed whenever unsent work is written to disk. */
  function _armBgSync() {
    /* S592 — retired with the service-worker blob push. Kept as a no-op so the
       call sites read honestly rather than being scattered-deleted. */
  }

  /* S587 — RADIO-SETTLE RETRY. After airplane mode, the OS reports offline for
     the first few seconds while the radio reattaches. A wake-up flush landing
     in that window found "offline", was consumed, and nothing retried until
     the next lifecycle event — tonight's residual race. While the page is
     visible and work is unsent, retry briefly until the radio settles. */
  var _settleTimer = null, _settleTries = 0;
  function _settleRetry() {
    if (_settleTimer) return;
    _settleTries = 0;
    _settleTimer = setInterval(function () {
      _settleTries++;
      var done = _settleTries > 20 || document.visibilityState !== 'visible' ||
                 !_lastSavedJson || _lastSavedJson === _lastPushedJson;
      if (!done && (navigator.onLine !== false)) {
        Promise.resolve(save(_collectStateFn ? _collectStateFn() : _lastSavedJson)).catch(function () {});   // S589: live model, never a stored snapshot
        done = true;   // one armed attempt per settle window; save() owns retries from here
      }
      if (done) { clearInterval(_settleTimer); _settleTimer = null; }
    }, 3000);
  }

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
    if (!_netUp()) return 1;   // S584: live OS read
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
    _diagTool = _toolKey; _diagProject = opts.projectId || null; _diagInstance = opts.instanceId || null;   // S602
    _onStatusChange = opts.onStatusChange || null;
    _projectId = opts.projectId || null;
    _instanceId = opts.instanceId || null;

    /* ═══ S603 — STARTUP CAN NO LONGER HANG (the Android root) ══════════════
       These four awaits had no time limit. A network request that HANGS
       instead of failing — the wifi/LTE handover shape, routine on Android —
       left init() unresolved forever: no error, no toast, no autosave, no
       heartbeat, a device running local-only all day while looking normal.
       That is the owner's 03-Aug Android panel, byte for byte ("everything
       never" while online and signed in), independently confirmed by review.
       Every step is now time-bound, records a breadcrumb the panel can show,
       and NOTHING can stop init() reaching _initialized = true. Degraded is
       honest; silent is not. Harness: sim/bootstall.mjs (0/2 on S602 for all
       three hang points → 2/2 here). */
    async function _step(name, fn, ms) {
      try { await _withTimeout(Promise.resolve().then(fn), ms || 10000, name); _bootTrace.push(name + ' ok'); }
      catch (e) {
        var why = (e && e.message) || 'failed';
        _bootTrace.push(name + ' ' + (/timed out/.test(why) ? 'timed out' : ('failed: ' + why.slice(0, 60))));
        console.warn('[DieselSync] init step "' + name + '":', why);
      }
    }
    await _step('local-db', function () { return SyncIDB.init(); }, 8000);
    await _step('sign-in',  async function () { const user = await _getUser(); if (user) _userId = user.id; }, 10000);
    if (_projectId && _online) await _step('project-info', function () { return _loadProjectInfo(); }, 10000);
    if (_projectId && !_instanceId) await _step('report-number', async function () { _instanceNumber = await _getNextInstanceNumber(); }, 10000);

    window.addEventListener('online', function () {
      _online = true;
      _setStatus('saving', 'Reconnected...');
      /* S583 — an OFFLINE save returns before the engine is ever involved, so
         engine.isPending stays false and this handler used to do nothing: the
         offline work sat unsent until something else happened to push it —
         and the first heartbeat pull could destroy it first. Check the real
         ledger: local saved vs cloud confirmed. save() routes through the
         wipe gate and full push machinery, exactly like any other save. */
      if (_lastSavedJson && _lastSavedJson !== _lastPushedJson) {
        /* S589 — push the LIVE model, never the stored string. save(_lastSavedJson)
           re-sent a document collected minutes earlier; if a pull had since
           brought in another device's newer readings, that stale document was
           pushed straight back over them. Collect fresh: whatever is on screen
           now already contains the merged truth. */
        engine.pushVia = 'reconnect';
        /* S600: reconnect is a wake by another name — same pull-first rule. */
        Promise.resolve((async function () {
          if (_projectId) { try { await engine.pull(_projectId, engine.instanceId || _instanceId); _lastPullAt = Date.now(); } catch (_) {} }
          return save(_collectStateFn ? JSON.stringify(_collectStateFn()) : _lastSavedJson);
        })())
          .then(function (r) {
            _setStatus(r ? 'synced' : 'pending', r ? 'Saved to cloud' : 'Saved locally');
            /* S622c — the facade-level truth: a save that resolved WITHOUT a
               cloud row while the device believes it is online is the drift
               seed. Record it; the engine's push_result rows say why. */
            try { if (!r && navigator.onLine && engine && engine.constructor) _diag('push_result', { outcome: 'save-resolved-null-online' }); } catch (_) {}
          })
          .catch(function (e) {
            _setStatus('pending', 'Saved locally');
            try { if (navigator.onLine) _diag('push_result', { outcome: 'save-threw-online', err: String(e && e.message || e).slice(0, 120) }); } catch (_) {}
          });
      } else if (engine.isPending) {
        engine.flush().then(function (r) { _setStatus(r ? 'synced' : 'pending', r ? 'Saved to cloud' : 'Saved locally'); });
      } else { _setStatus('synced', 'Online'); }
    });
    window.addEventListener('offline', function () {
      _online = false;
      _setStatus('offline', 'Working offline');
    });

    /* S589 — RE-BASELINE ON EVERY ENGINE APPLY. When the engine replaces the
       model (pull, silent merge, resolved conflict), this device's old
       "unsent work" marker describes a document that no longer exists. Left
       standing, the next flush re-pushes it over the very data that just
       arrived — the 80→150 revert. Re-point the ledger at what is now on
       screen, and retire the durable pending flag when nothing differs. */
    /* S599 — the engine reports each pull decision; forward it to the database. */
    engine.onDiag = function (event, detail) {
      try { _diag(event, Object.assign({ build: (typeof DIESEL_BUILD!=='undefined'?DIESEL_BUILD:'?') }, detail || {})); }
      catch (_) {}
    };

    engine.onModelReplaced = function () {
      try {
        if (!_collectStateFn) return;
        var now = JSON.stringify(_collectStateFn());
        _lastSavedJson = now;
        /* ═══ S622c — CONFIRMATION HONESTY (Mark's iPhone, 06 Aug: pm-rpm
           22233 stranded for good). This baseline declared "the cloud
           round-trip that produced this IS the confirmation" and advanced
           the push dedupe + cleared the durable pending marker for WHATEVER
           the merge applied. True when the merge applied cloud content —
           false when the merge KEPT LOCAL VALUES the cloud does not have:
           the device's own winning entry was recorded as already-on-the-
           server, every later save deduped as sent, the wake flush skipped
           it, and pendingPush:false was even persisted to the IDB cache —
           zero pushes forever, drift surviving refresh. The dedupe's own
           S524 header states the law: it advances only on a CONFIRMED push.
           When the merge kept anything local, this device is AHEAD of the
           cloud — nothing is confirmed. Baseline the local ledger, leave
           the push dedupe and the unsent marker alone; the S604 re-arm
           right after this pushes the winning state through the normal
           If-Match path. The S600 anti-resurrection property is untouched:
           a stale screen that LOST the merge kept nothing, confirms as
           before, and still has nothing left to send. */
        var _ahead = false;
        try { _ahead = !!engine.lastPullKeptLocal; } catch (_) {}
        if (!_ahead) {
          _lastPushedJson = now;      // the cloud round-trip that produced this IS the confirmation
          _pendingSince = null;
        } else if (!_pendingSince) {
          _pendingSince = new Date().toISOString();   // unsent work exists — keep it durable
        }
        _cachePut(_cacheKey(), {
          state: now, projectId: _projectId, toolKey: _toolKey,
          instanceId: engine.instanceId || _instanceId,
          instanceNumber: engine.instanceNumber || _instanceNumber,
          savedAt: new Date().toISOString(), pendingPush: _ahead, pendingSince: _pendingSince
        });
      } catch (e) { console.warn('[DieselSync] re-baseline after cloud apply failed:', e && e.message); }
    };

    /* ═══ S586 — MOBILE LIFECYCLE: THE WAKE-UP FLUSH (the real 1490.04 root).
       Android freezes a backgrounded page's timers COMPLETELY. The field flow
       is: edit on the phone → pocket it / switch away → check the desktop.
       From the switch onward the 15s autosave and heartbeat are frozen — not
       failing, simply never running — so offline work sits unsent for exactly
       as long as nobody is staring at the phone. Proven by harness 03 Aug:
       the identical code pushes on the first tick when the page is awake.
       Fix: the moment the page becomes visible / focused / restored, flush
       unsent work and catch up on pulls IMMEDIATELY — no waiting for a tick.
       On hide, fire one best-effort flush too (browsers grant a few seconds
       of grace before the freeze; a save takes well under one). */
    var _lastKickAt = 0;
    function _lifecycleKick(pullToo) {
      if (!_initialized) return;
      var now = Date.now();
      if (now - _lastKickAt < 2000) return;   // debounce event bursts
      _lastKickAt = now;
      (async function () {
        try {
          /* ═══ S600 — THE WAKE FLUSH WAS THE RESURRECTION MACHINE ═══════════
             Device receipts, 03 Aug: 13:33, 13:51, 15:11, 15:45 — every stale
             overwrite of the day arrived `via: wake`. This flush pushed the
             screen's document the moment the app foregrounded, with a valid
             token, so nothing ever stamp-checked it: a day-old 250 kept
             steamrolling the cloud's newer entry, after which every pull
             correctly found "no difference" — no badge, no telemetry, no
             change. PULL FIRST. The merge (honest entry stamps since S597)
             settles every field: a genuinely newer offline entry survives and
             pushes; a stale screen loses, gets updated, badges the change,
             and has nothing left to send. Same rule as S592 boot recovery. */
          if (pullToo && _netUp() && _projectId) {
            try { await engine.pull(_projectId, engine.instanceId || _instanceId); _lastPullAt = Date.now(); } catch (_) {}
          }
          if (_collectStateFn) {
            var j = JSON.stringify(_collectStateFn());
            engine.pushVia = 'wake';
            if (j !== _lastPushedJson) await save(j);   // only what survived the merge
          }
        } catch (e) { /* a failed kick costs nothing; the next one retries */ }
      })();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') _lifecycleKick(true);
      else _lifecycleKick(false);   // going dark: best-effort flush, no pull
    });
    window.addEventListener('pageshow', function () { _lifecycleKick(true); });
    window.addEventListener('focus', function () { _lifecycleKick(true); });

    /* ═══ S594 — LIVE UPDATES, NO MANUAL RELAUNCH (Mark: "everything should be
       live instantly; no commercial app has a manual update button").
       The service worker has always taken the new version immediately and
       broadcast 'sw-updated' to every window — FRT listened and reloaded
       itself; Diesel and Electric never did, which is the entire reason a new
       build needed the app killed and reopened (twice, on a bad day). Now:
         • listen for the broadcast → flush unsent work → reload, so the new
           build is running seconds after it deploys;
         • never interrupt someone mid-entry: if a field is focused or an
           autosave is pending, wait and re-check;
         • ask the worker to look for a new version on every foreground return
           and every 10 minutes, so a device left open all day still updates.
       Work is flushed before the reload, so nothing typed can be lost to it. */
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', function (ev) {
          if (!ev || !ev.data || ev.data.type !== 'sw-updated') return;
          _liveUpdateReload();
        });
        var _upd = function () {
          navigator.serviceWorker.ready.then(function (reg) {
            if (reg && reg.update) reg.update().catch(function () {});
          }).catch(function () {});
        };
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') _upd();
        });
        setInterval(_upd, 600000);
        _upd();
      }
    } catch (_) {}

    _bootTrace.push('started');
    _initialized = true;
    _diag('boot', { trace: _bootTrace.join(' \u2192 ') });   // S603
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
        let data = await engine.pull(_projectId, _instanceId, { allowStaleOverwrite: true });
        _captureNext = false;
        if (data) {
          /* ═══ S601 — BOOT GOES THROUGH THE STAMP MERGE (receipts 16:58:19:
             a PC on S600 still wrote a stale 150 over the Android's newer 200
             seconds after a hard refresh). Boot was the ONE door that skipped
             the per-item entry-stamp merge: it took the cloud copy "raw"
             (allowStaleOverwrite), the host restore then preferred the disk
             copy for the screen, and the boot autosave pushed that un-merged
             screen with a fresh valid token — a resurrection on every reopen,
             which is why the harder the testing, the worse it looked. Boot
             now merges disk vs cloud by entry stamps exactly like every
             heartbeat pull: whichever value was ENTERED later survives, per
             field, and that is what reaches both the screen and the cloud. */
          try {
            const rec = await _cacheGet(_cacheKey());
            const localDisk = rec && rec.state
              ? (typeof rec.state === 'string' ? JSON.parse(rec.state) : rec.state) : null;
            const bm = engine.mergeByStamps(localDisk, data);
            if (bm) data = bm;
          } catch (e) { console.warn('[DieselSync S601] boot stamp-merge skipped:', e && e.message); }
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

  /* ── S571 — the cloud-door wipe gate ──────────────────────────────────────
   * Returns true = let the push go. Answers are keyed to a SIGNATURE of the
   * loss ("site photos 225->0|flow readings 15->9") so autosave asks once, and
   * a genuinely different loss later still gets asked. Everything is wrapped;
   * every failure path returns true (fail open — see save()). */
  var _wipeAnswers = {};      // signature -> true (allowed) | false (paused)
  var _wipeAsking = false;

  function _wipeSignature(losses) {
    return losses.map(function (l) { return l.k + ' ' + l.from + '\u2192' + l.to; }).join(' | ');
  }

  async function _wipeGateAllows(stateJson) {
    // Nothing to compare against yet (first push of the session) — allow.
    if (!_lastPushedJson) return true;
    var J = window._dslJournal;
    if (!J || typeof J.assessLosses !== 'function') return true;

    var before, after;
    try { before = JSON.parse(_lastPushedJson); after = JSON.parse(stateJson); }
    catch (_) { return true; }

    // A user-declared reset already had its own confirmation — never double-ask.
    try { if (after && after._intentionalClear) return true; } catch (_) {}

    var losses = J.assessLosses(before, after);
    if (!losses || !losses.length) return true;

    var sig = _wipeSignature(losses);
    if (_wipeAnswers[sig] !== undefined) return _wipeAnswers[sig];
    if (_wipeAsking) return false;      // a question is already on screen — wait for it

    if (!Dlg || typeof Dlg.confirm !== 'function') {
      console.warn('[DieselSync S571] wipe gate: no dialog engine — allowing push.');
      return true;
    }

    _wipeAsking = true;
    var ok = true;
    try {
      var lines = losses.map(function (l) {
        return l.k + ': ' + l.from + ' \u2192 ' + l.to + '  (' + l.lost + ' removed)';
      }).join('\n');
      ok = await Dlg.confirm({
        title: 'This save removes a lot at once',
        icon: '\u26A0\uFE0F', accent: 'attention', width: 560,
        message: 'The report on this device now has less than the copy in the cloud:\n\n' + lines +
                 '\n\nIf you deleted these on purpose, save to the cloud. If this is unexpected, ' +
                 'pause and check Recent Saves first.',
        detail: 'Your work on this device is already saved either way. Pausing only leaves the ' +
                'fuller copy in the cloud until you decide — nothing is lost by pausing.',
        cancelText: 'Pause \u2014 let me check',
        confirmText: 'Yes, save to cloud'
      });
    } catch (e) {
      console.warn('[DieselSync S571] wipe gate dialog failed — allowing push:', e && e.message);
      ok = true;
    }
    _wipeAsking = false;
    _wipeAnswers[sig] = ok;
    if (!ok) {
      // Make the pause visible and point at the record that explains it.
      try { if (typeof window._dslSetSaveFlag === 'function') window._dslSetSaveFlag(true); } catch (_) {}
      console.warn('[DieselSync S571] cloud push paused by the user for: ' + sig);
    }
    return ok;
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
        pendingSince: _pendingSince || (_pendingSince = new Date().toISOString()),
        /* S587 — everything the service worker's Background Sync handler needs
           to push this WITHOUT the page: credentials, the concurrency token,
           and the payload (state above). If-Match discipline (I-4) carries
           over: the SW refuses to push a record without a token. */
        /* S592 — credentials and token REMOVED from the cache record with the
           service-worker blob push (see sw.js S592). Nothing may deliver a
           stored document; delivery happens only through the page paths,
           which collect live state and merge by entry stamp. */
        bgIfMatch: engine.lastSeenUpdatedAt || null
      });
    }
    if (!_netUp()) {
      _setStatus('offline', 'Saved locally (offline)');
      /* S617 — this early exit is where an offline edit LOST ITS TIME: the
         engine (and its stamping pass) was never reached, so the value was
         only stamped at the first online flush — and wrongly beat values other
         devices typed later (Mark's 50-vs-30 NPSH failure, 05 Aug). Stamp the
         edit's true moment now; no network is touched. Awaited so the ledger
         is pinned before this save resolves. */
      try { if (engine && typeof engine.stampLocal === 'function') await engine.stampLocal(); } catch (_) {}
      _settleRetry(); return null;
    }   // S584: live OS read, never the stale event latch
    if (alreadyPushed) return null;
    /* ── S571 — CHANGE JOURNAL, STAGE THREE (second half) ────────────────────
     * A save whose shape matches a wipe now stops at the CLOUD DOOR and asks a
     * person, once. Three properties make this safe to ship on a threshold
     * that has not yet been watched against a week of real jobs:
     *
     *   1. THE LOCAL SAVE HAS ALREADY HAPPENED, above. Nothing here can cost an
     *      inspector their work or stop them working — the report is on disk
     *      either way. Only the cloud copy waits.
     *   2. IT FAILS OPEN. No dialog engine, no journal, an error anywhere — the
     *      push proceeds exactly as before. A guard that cannot render must
     *      never become a silent sync outage (the 4380.24 lesson).
     *   3. IT ASKS ONCE PER SHAPE. The answer is remembered against a signature
     *      of the loss itself, so autosave cannot nag every 15 seconds, and a
     *      DIFFERENT loss later still gets its own question.
     *
     * So a wrong threshold costs one dialog, not a stranded inspector — which
     * is the objection that kept this half unbuilt until now. If the person
     * says no, the cloud keeps the fuller previous copy and the local report is
     * untouched, which is exactly the state they'd want while they check.
     * The server wipe guard remains the hard backstop underneath all of it. */
    try {
      const _hold = await _wipeGateAllows(stateJson);
      if (!_hold) {
        _setStatus('pending', 'Saved locally — cloud save paused');
        return null;
      }
    } catch (e) {
      console.warn('[DieselSync] wipe gate skipped (failing open):', e && e.message);
    }
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
        _lastPushOkAt = Date.now();   // S585
        _setStatus('synced', 'Saved to cloud');
        return row;
      }
      // null = offline-queued, conflict abandoned/cancelled, or push error —
      // in every case the local save is durable and retries later.
      _setStatus('pending', 'Saved locally');
      return null;
    } catch (e) {
      console.warn('[DieselSync] save failed:', e && e.message);
      /* S584 — A DEAD SIGN-IN GOES LOUD. When the token refresh itself fails,
         every push dies quietly and retries forever — from the outside it
         looks exactly like a sync bug (the wrap-time "expiry loop"). Auth
         death is not a sync state; it is a person-must-act state. Say so,
         once, visibly, and keep saying it in the pill. Work stays safe on
         the device the whole time. */
      var _m = String((e && e.message) || '');
      _lastPushFailAt = Date.now(); _lastPushFailMsg = _m;   // S585
      if (_m.indexOf('Unauthorized') !== -1 || _m.indexOf('refresh failed') !== -1 ||
          _m.indexOf('JWT') !== -1 || _m.indexOf('401') !== -1) {
        _setStatus('error', 'Signed out — reopen from the Hub to sign in. Work is saved on this device.');
        _authDeadBanner();
      } else {
        _setStatus('pending', 'Saved locally');
      }
      return null;
    }
  }

  /* S584 — one persistent, dismissible banner for a dead sign-in. */
  var _authBannerShown = false;
  function _authDeadBanner() {
    if (_authBannerShown) return;
    _authBannerShown = true;
    try {
      var b = document.createElement('div');
      b.id = 'dslAuthDeadBanner';
      b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:99999;' +
        'background:#C0445F;color:#fff;font:600 14px Calibri,sans-serif;padding:12px 18px;' +
        'border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:92vw;display:flex;gap:12px;align-items:center;';
      b.innerHTML = '<span>Your sign-in has expired. Nothing is syncing — your work is saved on this device. ' +
        'Close this report and reopen it from the Project Hub to sign in again.</span>' +
        '<button style="background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.5);color:#fff;' +
        'border-radius:8px;padding:6px 12px;font:600 13px Calibri;cursor:pointer" ' +
        'onclick="this.parentNode.remove()">OK</button>';
      document.body.appendChild(b);
    } catch (_) {}
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
      /* S592 — RECOVERY IS A MERGE, NOT A RESURRECTION (receipts-proven, 03 Aug).
         This flush used to send whatever the screen held at boot, with the push
         dedupe cleared to force it through. When the cloud had moved on — as it
         had at 12:12:24, the phone's 200 already up — that pushed a stale
         document over newer work. Now: pull first, so the engine's 3-way merge
         and entry stamps settle every field, and push only what survives that.
         Genuinely newer offline entries still win (their stamps are newer);
         a stale document loses every field and nothing is overwritten. */
      if (_collectStateFn && _netUp()) {
        try {
          await engine.pull(_projectId, engine.instanceId || _instanceId);
          const afterMerge = JSON.stringify(_collectStateFn());
          if (afterMerge !== _lastPushedJson) {
            engine.pushVia = 'boot-recovery';
            await save(afterMerge);
          } else {
            console.log('[DieselSync S592] recovered work already matches cloud — nothing to send.');
          }
        } catch (e) {
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
    /* ═══ S602 — THE TICK NOW SAYS WHAT IT DID ═══════════════════════════════
       Nineteen sessions were spent choosing between four faults that all
       produce the same panel reading ("save: just now / pull: never"): the
       loop never starting, the cloud check failing and being read as "nothing
       new", the busy flag sticking, and the gauge simply never reporting a
       quiet check. Nothing in the code distinguished them, so every fix was a
       guess. Every exit from this function now records WHY, and the busy flag
       can no longer be held forever by a request that hangs instead of
       failing — the exact shape a tablet produces moving between wifi and LTE.
       Harness: sim/tickhealth.mjs (fails on S601, passes here). */
    var _why = '';
    if (!_netUp()) _why = 'offline';                                     // S584: live OS read
    else if (_pulling && (Date.now() - _pullingSince) < TICK_WATCHDOG_MS) _why = 'busy';
    else if (!_initialized) _why = 'not-initialised';
    else if (!_projectId) _why = 'no-project';
    if (_why) { _tickDiag(_why); return; }
    if (_pulling) {
      /* The previous tick never came back — a hung request, not a failed one.
         Release it rather than going deaf for the rest of the session. */
      _tickDiag('watchdog-release', { heldFor: Date.now() - _pullingSince });
      _pulling = false;
    }
    /* ═══ S595 — THE PULL WAS GATED ON FOCUS, WHICH NEVER CLEARS ═══════════
       This tick used to skip whenever ANY input held focus. On a desktop a
       field keeps focus indefinitely after one click, so a tab that had been
       clicked into simply STOPPED PULLING — forever — while continuing to
       push. That is the shape of every "the cloud has the right number and my
       screen doesn't" report: PC parked on 150 while the cloud held 200.
       (Mark, 03 Aug: "local is not pulling from the cloud".)

       The gate existed because a pull could once overwrite a live edit. That
       risk is gone: since S594 a typed value is stamped at the keystroke, so
       the merge gives it the win over anything arriving from the cloud. All
       that is still worth deferring is the split second of active typing, to
       avoid re-rendering a field under someone's fingers.

       So: defer only if a keystroke landed in the last 3 seconds, or an
       autosave is still in flight. Idle focus no longer blocks anything. */
    if ((Date.now() - _lastEditAt) < 3000) { _tickDiag('typing'); return; }
    if (window._autosaveTimer) { _tickDiag('autosave-pending'); return; }
    _pulling = true;
    _pullingSince = Date.now();
    /* S602 — "I looked" is recorded separately from "I received something".
       The old panel only ever stamped the latter, so a healthy idle device
       read exactly like a dead one, which is what sent every session hunting
       a loop that may not have been broken. */
    _lastCheckAt = Date.now();
    var _outcome = 'no-change';
    try {
      /* S584 — UNSENT WORK FLUSHES ON EVERY BEAT. This flush previously lived
         INSIDE the remote-changed branch below: if the cloud hadn't moved
         since this device last saw it, the whole tick returned early and
         offline work never rode the heartbeat at all. Unsent work is this
         device's obligation regardless of what the cloud has been doing. */
      if (_collectStateFn) {
        try {
          const unsentNow = JSON.stringify(_collectStateFn());
          /* locally saved but never cloud-confirmed → flush. (Content still
             mid-edit — differing from the local ledger too — belongs to the
             autosave debounce, not this beat.) */
          /* S608 — Mark, offline-return test: work saved in airplane mode sat
             at "saved to local" indefinitely once back online; only a CLOUD
             change (another device editing) dislodged it. Two causes: Android
             never fires the 'online' event (S584), so the event-driven
             reconnect flush never runs there; and this beat's own trigger
             demanded the live collect byte-match the last local save — any
             volatile key breaks that equality forever. The durable pending
             flag is the honest trigger: set the moment an offline save
             happens, cleared ONLY by a confirmed cloud push. If it is up and
             we are online, this device owes the cloud a push — now. */
          if (_pendingSince || (unsentNow === _lastSavedJson && unsentNow !== _lastPushedJson)) {
            engine.pushVia = 'heartbeat';
            await save(unsentNow);
          }
        } catch (e) { console.warn('[DieselSync] heartbeat flush failed:', e && e.message); }
      }
      /* S602 — the probe swallows every error and returns null, which this
         line then reads as "the cloud has not changed". An expired token, a
         dropped connection or a blocked request therefore looked exactly like
         a quiet cloud, forever, with no trace anywhere the field can see.
         engine.lastProbeError now distinguishes the two, and the call is
         time-bound so a request that hangs cannot own the tick. */
      engine.lastProbeError = null;
      const remote = await _withTimeout(
        engine.getRemoteUpdatedAt(_projectId, engine.instanceId || _instanceId),
        TICK_NET_TIMEOUT_MS, 'probe');
      if (!remote) _outcome = engine.lastProbeError ? ('probe-failed:' + engine.lastProbeError) : 'no-row';
      else if (remote === engine.lastSeenUpdatedAt) _outcome = 'no-change';
      if (remote && remote !== engine.lastSeenUpdatedAt) {
        _outcome = 'pulled';
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
            /* S583 — THE 70-PSI FIX (1490.04 forensics). This guard asked
               "does this differ from what I SAVED?" (_lastSavedJson) — but an
               offline save had already advanced that ledger, so offline work
               looked "already handled", the push was skipped, and the pull
               that followed replaced the unpushed edit with the cloud copy.
               The 70 psi never left the phone. Correct question: "does this
               differ from what the CLOUD has confirmed?" (_lastPushedJson,
               which advances ONLY on a confirmed push — the same I-5 split
               the save() dedupe already uses). Unsent work now always pushes
               before any pull can touch it. */
            if (localNow !== _lastPushedJson) await save(localNow);
          } catch (e) { console.warn('[DieselSync] pre-pull push failed:', e && e.message); }
        }
        await _withTimeout(engine.pull(_projectId, engine.instanceId || _instanceId),
                           TICK_NET_TIMEOUT_MS, 'pull');   // silent — stale-guard active
        _lastPullAt = Date.now();   // S585
        /* S604 — if the merge kept newer LOCAL entries over the cloud copy,
           this device is ahead of the cloud. Re-arm the push (the dedupe
           compares against what WE last sent, and would otherwise stay
           silent while the cloud keeps the losing value forever). The next
           autosave beat pushes the winning state through the normal
           If-Match path. */
        if (engine.lastPullKeptLocal) {
          _lastPushedJson = '';
          if (!_pendingSince) _pendingSince = new Date().toISOString();
          _outcome = 'pulled-local-ahead';
        }
        const ctl = window.__dslHeaderCtl;
        if (ctl) {
          ctl.setCloud({ state: 'pull' });
          setTimeout(function () { ctl.setCloud({ state: 'ok' }); }, 2000);
        }
      }
    } catch (e) {
      _outcome = 'error:' + ((e && e.message) || 'unknown');
      console.warn('[DieselSync] heartbeat tick failed:', e && e.message);
    } finally {
      /* S602 — a `finally`, not a trailing statement. The old release could be
         skipped by anything that never returned, and a device that skipped it
         once stopped listening for the rest of the session. */
      _pulling = false;
      _tickDiag(_outcome, { lastSeen: engine.lastSeenUpdatedAt || null });
    }
  }

  function startAutoSave(collectStateFn, intervalMs) {
    _collectStateFn = collectStateFn;
    stopAutoSave();
    _autoSaveTimer = setInterval(function () {
      if (!_collectStateFn) return;
      try { engine.pushVia = 'autosave'; save(_collectStateFn()); }
      catch (e) { console.error('[DieselSync] auto-save error:', e); }
    }, intervalMs || 15000);
  }
  function stopAutoSave() {
    if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
  }

  async function syncNow() {
    if (!_netUp()) { _setStatus('offline', 'No connection'); return false; }   // S584: live OS read
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

  /* ═══ S585 — SYNC STATUS PANEL (the on-device console) ═══════════════════
     The field devices are the installed app: no console, no address bar. Two
     sync bugs in a row could not be diagnosed because nobody could see what
     the device believed. This panel says it all on screen, in plain words:
     build, real network state, sign-in health, unsent work, last successful
     push, last failure and its reason, last pull. One screenshot ends the
     guessing. */
  function getSyncDiag() {
    var d = {
      build: (typeof DIESEL_BUILD !== 'undefined') ? DIESEL_BUILD : 'unknown',
      netUp: (navigator.onLine !== false),
      flagOnline: _online,
      user: null, tokenMinLeft: null,
      pendingLocal: !!(_lastSavedJson && _lastSavedJson !== _lastPushedJson),
      pendingSince: _pendingSince || null,
      lastPushOkAt: _lastPushOkAt, lastPushFailAt: _lastPushFailAt,
      lastPushFailMsg: _lastPushFailMsg, lastPullAt: _lastPullAt,
      lastCheckAt: _lastCheckAt, lastTickWhy: _lastTickWhy,   // S602
      bootTrace: _bootTrace.join(' \u2192 ') || 'not started', engineStarted: _initialized,   // S603
      hasBaseline: !!engine.lastSeenUpdatedAt,
      hubMode: !!_projectId, instanceNumber: engine.instanceNumber || _instanceNumber
    };
    try {
      /* S597 — the panel read Auth.getUser() only, which is populated
         asynchronously and is empty on iOS for the first stretch of a session.
         It therefore showed a scary red NOT SIGNED IN while the device was
         signed in and saving fine — and it cost an hour of testing today
         chasing a phantom. The token is the real evidence of a session, so
         fall back to it (and to the recorded user id) before claiming the
         person is signed out. */
      var u = Auth.getUser(); d.user = (u && (u.email || u.id)) || _userId || null;
      var tok = Auth.getToken && Auth.getToken();
      if (!d.user && tok) {
        try {
          var pu = JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
          if (pu && (pu.email || pu.sub)) d.user = pu.email || pu.sub;
        } catch (_) {}
      }
      if (tok) {
        var p = JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if (p && p.exp) d.tokenMinLeft = Math.round((p.exp * 1000 - Date.now()) / 60000);
      }
    } catch (_) {}
    return d;
  }

  function _fmtAgo(ts) {
    if (!ts) return 'never (this session)';
    var m = Math.round((Date.now() - ts) / 60000);
    var t = new Date(ts); var hh = ('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2);
    return hh + (m <= 0 ? ' (just now)' : ' (' + m + ' min ago)');
  }

  function showSyncStatus() {
    var render = function (body) {
      var d = getSyncDiag();
      var row = function (label, val, tone) {
        var c = tone === 'bad' ? '#C0445F' : tone === 'good' ? '#2E9E72' : 'inherit';
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;' +
          'border-bottom:1px solid rgba(128,128,128,.18);font:14px Calibri,sans-serif">' +
          '<span style="opacity:.75">' + label + '</span>' +
          '<span style="font-weight:600;color:' + c + ';text-align:right">' + val + '</span></div>';
      };
      var signIn, signTone;
      if (!d.user) { signIn = 'NOT SIGNED IN'; signTone = 'bad'; }
      else if (d.tokenMinLeft !== null && d.tokenMinLeft <= 0) { signIn = d.user + ' — EXPIRED'; signTone = 'bad'; }
      else { signIn = d.user + (d.tokenMinLeft !== null ? ' (' + d.tokenMinLeft + ' min left)' : ''); signTone = 'good'; }
      var pend = d.pendingLocal
        ? 'YES — waiting since ' + (d.pendingSince ? new Date(d.pendingSince).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '?')
        : 'none — everything sent';
      body.innerHTML =
        row('Build', d.build) +
        row('Network (from the OS)', d.netUp ? 'Online' : 'OFFLINE', d.netUp ? 'good' : 'bad') +
        row('Signed in', signIn, signTone) +
        row('Unsent work on this device', pend, d.pendingLocal ? 'bad' : 'good') +
        row('Last successful cloud save', _fmtAgo(d.lastPushOkAt)) +
        (d.lastPushFailAt ? row('Last FAILED save', _fmtAgo(d.lastPushFailAt) + ' — ' +
          (d.lastPushFailMsg || 'unknown reason').slice(0, 80), 'bad') : '') +
        /* S602 — two lines, because they answer two different questions.
           "Checked the cloud" is the one that says the loop is alive: on a
           healthy idle device it is seconds old while "Received" can sit at
           never all day and mean nothing is wrong. The old single line
           conflated them and sent 19 sessions after the wrong fault. */
        row('Last checked the cloud',
            _fmtAgo(d.lastCheckAt) + (d.lastTickWhy ? ' — ' + d.lastTickWhy : ''),
            (d.lastCheckAt && (Date.now() - d.lastCheckAt) < 90000) ? 'good' : 'bad') +
        row('Last received from cloud', _fmtAgo(d.lastPullAt)) +
        row('Sync engine started', d.engineStarted ? 'yes' : 'NO \u2014 startup did not finish',
            d.engineStarted ? 'good' : 'bad') +
        row('Startup steps', d.bootTrace,
            /timed out|failed/.test(d.bootTrace) ? 'bad' : undefined) +
        row('Cloud baseline established', d.hasBaseline ? 'yes' : 'NO — pushes refused until a pull succeeds',
            d.hasBaseline ? 'good' : 'bad') +
        row('Mode', d.hubMode ? 'Hub (cloud sync on) — report #' + d.instanceNumber : 'Standalone (no cloud)');
    };
    Dlg.panel({
      title: 'Sync Status', icon: '\uD83D\uDCF6', accent: 'slate', width: 460,
      build: function (body) { render(body); },
      buttons: [
        { label: 'Close', kind: 'cancel' },
        { label: 'Push now', kind: 'primary', onClick: function (api) {
            syncNow().then(function () { render(api.body); });
            return false;   // keep the panel open; result renders in place
          } }
      ]
    });
  }

  /* ═══ S596 — UPDATES INSTALL QUIETLY, SWAP AT A SAFE MOMENT ═══════════════
     S594 reloaded the moment a new build arrived. On a job site that throws an
     inspector back to the top of the tool mid-inspection — unacceptable, and
     not what any commercial app does. They stage the update and apply it when
     it costs the user nothing.

     Rule now: a new build NEVER interrupts work. It is applied only when one
     of these is true:
       • the app has been in the background for 20+ seconds (they left it —
         phone pocketed, switched apps, tab in the back). This is the normal
         case and the swap is invisible;
       • the app has been completely idle for 5 minutes with nothing unsaved
         (no typing, no taps) — a lunch break, a walk between risers;
       • the person taps the quiet "Update ready" pill themselves.
     Never while typing, never with unsent work, never with a dialog open.

     And when the swap does happen, it is not a trip back to the top: the
     current tab and scroll position are saved first and restored on the way
     in, so the person lands exactly where they were. Unsent work is flushed
     before the reload either way. */
  /* ═══ S622j — LOOK-NOW PULLS (Mark, 07 Aug field run). Two symptoms, one
     cause: the heartbeat runs every ~60-75s, and nothing pulls at the exact
     moments a person LOOKS. (a) A field held focused during a sync keeps its
     typed value by design — but after blur, the reconciled value waited for
     the next scheduled beat, so the screen sat stale for up to a cycle and
     read as "stuck". (b) On the desktop, switching to the tab to check it is
     precisely when the person expects freshness — and precisely when the
     browser had been throttling the timer. Now: leaving a field, returning
     to the tab, and focusing the window each trigger an immediate pull,
     throttled to one per 3s, online only. Data decisions are untouched —
     this only moves WHEN the screen catches up to them. */
  var _lookPullAt = 0;
  function _lookNowPull(why) {
    try {
      if (!navigator.onLine || !_projectId) return;
      var t = Date.now();
      if (t - _lookPullAt < 3000) return;
      _lookPullAt = t;
      engine.pull(_projectId, engine.instanceId || _instanceId)
        .then(function () { _lastPullAt = Date.now(); })
        .catch(function () {});
    } catch (_) {}
  }
  try {
    document.addEventListener('focusout', function (e) {
      var el = e && e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        setTimeout(function () { _lookNowPull('blur'); }, 250);   // let the autosave stamp first
      }
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') _lookNowPull('tab-visible');
    });
    window.addEventListener('focus', function () { _lookNowPull('window-focus'); });
  } catch (_) {}

  var _updReady = false, _updApplied = false, _lastActivityAt = Date.now();
  try {
    ['pointerdown', 'keydown', 'input', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, function () { _lastActivityAt = Date.now(); }, true);
    });
  } catch (_) {}

  function _updSafeNow() {
    if (_updApplied) return false;
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return false;
    if (window._autosaveTimer) return false;
    if (document.querySelector('.dlg-backdrop, .modal.open, dialog[open]')) return false;
    if (_lastSavedJson && _lastSavedJson !== _lastPushedJson) return false;   // unsent work
    return true;
  }

  function _updSaveRestorePoint() {
    try {
      /* Diesel/Electric panels: the active nav tab's id is 'tab-<panel>'. */
      var tab = null;
      var active = document.querySelector('.nav-tab.active');
      if (active && active.id && active.id.indexOf('tab-') === 0) tab = active.id.slice(4);
      sessionStorage.setItem('arencon-restore', JSON.stringify({
        tab: tab, y: window.scrollY || 0, at: Date.now()
      }));
    } catch (_) {}
  }

  function _updApply(reason) {
    if (_updApplied) return;
    _updApplied = true;
    Promise.resolve()
      .then(function () {
        if (!_collectStateFn) return null;
        var j = JSON.stringify(_collectStateFn());
        if (j === _lastPushedJson) return null;
        engine.pushVia = 'pre-update';
        return save(j);
      })
      .catch(function () {})
      .then(function () {
        _updSaveRestorePoint();
        console.log('[DieselSync S596] applying new build (' + reason + ').');
        try { location.reload(); } catch (_) {}
      });
  }

  /* ═══ S622g — ONE UPDATE PILL IN THE TOOLKIT (Mark, 06 Aug, photographed:
     two pills on screen at once, and this one sitting on top of the Prev/Next
     footer — the exact corner S595 ruled out for this tool). This drew its
     own pill in its own corner while lib/ui/updateReady.js drew another at
     the top. Per the shared-engine rule the host does not keep a matching
     copy: it DELETES its own and CALLS the engine, passing the apply path it
     owns (restore point first, so the person lands back where they were).
     Detection and apply stay here; the pixels belong to the engine. */
  function _updPill() {
    try {
      var _eng = (typeof window !== 'undefined') ? window.ArcUpdateReady : null;
      if (_eng && typeof _eng.show === 'function') {
        _eng.show(function () { _updApply('user tapped'); });
        return;
      }
      /* engine absent (a host that never loaded it) — stay silent rather than
         reintroduce a second look; the update still applies on backgrounding,
         on idle, and on the next open. */
    } catch (_) {}
  }

  function _liveUpdateReload() {
    if (_updReady) return;
    _updReady = true;
    _updPill();                       // quiet, corner, non-blocking
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden') return;
      setTimeout(function () {
        if (document.visibilityState === 'hidden' && _updSafeNow()) _updApply('app backgrounded');
      }, 20000);
    });
    setInterval(function () {
      if (!_updReady || _updApplied) return;
      if ((Date.now() - _lastActivityAt) > 300000 && _updSafeNow()) _updApply('idle 5 min');
    }, 60000);
  }

  function destroy() { stopAutoSave(); _initialized = false; }

  return {
    init: init, load: load, save: save,
    startAutoSave: startAutoSave, stopAutoSave: stopAutoSave,
    recoverUnsentWork: _recoverUnsentWork,   // S524 I-5 — call after boot load()
    syncNow: syncNow, destroy: destroy, readUrlParams: readUrlParams,
    getSyncDiag: getSyncDiag, showSyncStatus: showSyncStatus,   // S585 on-device console
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
