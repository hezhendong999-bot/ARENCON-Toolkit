/* ============================================================================
 * ARENCON Electric — CloudSync facade over the SHARED sync engine (S567)
 * ----------------------------------------------------------------------------
 * Replaces the inline last-write-wins CloudSync IIFE in the Electric tool —
 * the same S491/S492 move Diesel made, on Mark's S566 ruling that ALL tools
 * get the shared engine and change-scoped saves. This file is an adaptation
 * of the field-proven diesel-sync.js facade; deltas are Electric-only:
 *   - no journal (Electric has no Recent Saves yet), no photo outbox here
 *     (Electric's photo store + rescue live in the tool's own module block,
 *     S552/S556, and are untouched), no R2 heal adapter.
 *   - partialSave outcomes go to the console until Electric grows a record.
 *   - sync-meta database: ARENCON_ELECTRIC_SYNC (syncMeta + syncQueue).
 *   - offline cache: SAME arencon_cloud_cache/tool_state DB and SAME
 *     projectId|toolKey|instanceId key the inline IIFE used — existing
 *     device caches carry over with zero migration.
 *
 * WHAT THIS BUYS ELECTRIC, in field terms: every push now carries If-Match
 * (no more silent last-writer-wins overwrites), a stale push 3-way merges
 * instead of clobbering, ancestor snapshots survive reloads, boot discipline
 * refuses to overwrite cloud from a context with no baseline, unsent work is
 * durably marked and recovered after a crash, and saves are change-scoped —
 * a device that edited the checklist cannot rewrite photos it never touched.
 *
 * WHAT STAYS ELECTRIC'S (per-tool personality — do NOT converge):
 *   - _collectCloudState(): strips ALL photo bytes (R2 holds the images) —
 *     unlike Diesel's _keepD rule. serializePush stays CLONE-ONLY.
 *   - _mergeCloudLocal + the host heartbeat's union merge protections.
 *   - The S564 photo-durability save, photo store, and rescue wiring.
 *
 * PUBLIC SHAPE: window.CloudSync with the exact API the inline call sites
 * use — init/load/save/startAutoSave/stopAutoSave/syncNow/destroy/
 * readUrlParams/request/heartbeatTick/recoverUnsentWork + the same getters.
 * ========================================================================== */

import { Auth } from './lib/shared/auth.js';
import { createIDB } from './lib/data/idb.js';
import { createSync, contentEquals } from './lib/data/sync.js';   // S583: canonical no-change comparison
import { createChangeJournal } from './lib/data/changeJournal.js';  // S574
import { merge3, applyResolutions, summarizeConflict } from './lib/data/merge.js';
import * as Dlg from './lib/ui/dialogEngine.js';

/* ── Sync-only metadata DB (NEW — never touches ARENCON_DIESEL) ─────────── */
/* Sync metadata ONLY: Electric's report autosave, its photo store and its
   blobs live in the tool's own databases and are not involved. */
const SyncIDB = createIDB({
  dbName: 'ARENCON_ELECTRIC_SYNC',
  version: 2,                                   /* S574: +changeJournal */
  stores: ['syncMeta', 'syncQueue', 'changeJournal']
});

/* ── Worker-host adapter ────────────────────────────────────────────────────
 * Electric payloads are small — _collectCloudState strips ALL photo bytes
 * (R2 holds the images) — so no background worker is needed. merge3Worker
 * still runs THE shared merge engine — same brain as Diesel and FRT.
 * serializePush is CLONE-ONLY by design (see header). */
const ElectricWorkerHost = {
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
 * getProject  → _collectCloudState(): Electric's cloud-shaped payload —
 *               all photo bytes already stripped (R2 holds the images).
 * setProject  → silent-pull apply. Boot uses capture mode (the host's S488
 *               boot block does its own IDB merge — unchanged); heartbeat
 *               pulls run through _applyCloudSilent, which keeps ALL of
 *               Electric's protections: S25 empty-cloud guard + the union
 *               via _mergeCloudLocal against the REAL current local state.
 * applyMerged → 412-path apply of a 3-way merged result. The merged object
 *               already contains local's newer edits by merge semantics.
 * saveNow     → Electric's own saveState (field-proven local persistence,
 *               includes the S564 photo-store sweep). */
/* S567 — Electric has no host _stateHasContent; the S25 empty-cloud guard in
   _applyCloudSilent needs one. "Has content" = any answered checklist item,
   any deficiency, any photo record, or any flow-test value. Published guarded
   so a future host implementation wins. */
function _elecStateHasContent(s) {
  try {
    if (!s || typeof s !== 'object') return false;
    if (s.clState && Object.keys(s.clState).some(function (k) {
      var v = s.clState[k]; return v && (v.status || (v.photos && v.photos.length));
    })) return true;
    if (s.deficiencies && Object.keys(s.deficiencies).some(function (k) {
      return Array.isArray(s.deficiencies[k]) && s.deficiencies[k].length;
    })) return true;
    if (Array.isArray(s.generalDeficiencies) && s.generalDeficiencies.length) return true;
    if (Array.isArray(s.flowTestPhotos) && s.flowTestPhotos.length) return true;
    if (Array.isArray(s.sketchEntries) && s.sketchEntries.length) return true;
    return false;
  } catch (_) { return false; }
}
try { if (typeof window._stateHasContent !== 'function') window._stateHasContent = _elecStateHasContent; } catch (_) {}

let _captureNext = false;

function _applyCloudSilent(cloudState) {
  const w = window;
  try {
    const local = (typeof w._collectCloudState === 'function') ? w._collectCloudState() : null;
    /* S583 — NO-CHANGE GATE (Mark's ruling: identical content produces total
       silence). If the cloud copy matches what this window already shows —
       compared canonically, bookkeeping ignored — apply NOTHING. */
    if (local && contentEquals(cloudState, local)) return;
    // S25 EMPTY-CLOUD GUARD — never let a materially-empty cloud row
    // overwrite a non-empty local report. Local wins; the next push
    // repopulates cloud (If-Match will match — we HAVE seen this row).
    if (typeof w._stateHasContent === 'function' && local &&
        !w._stateHasContent(cloudState) && w._stateHasContent(local)) {
      console.warn('[ElectricSync] S25 guard: cloud row empty, local has content — keeping local.');
      return;
    }
    const merged = (typeof w._mergeCloudLocal === 'function' && local)
      ? w._mergeCloudLocal(cloudState, local)
      : cloudState;
    w._applyLoadedState(JSON.stringify(merged));
  } catch (e) {
    console.warn('[ElectricSync] silent apply failed:', e && e.message);
  }
}

/* ── S574 — the change journal for Electric ────────────────────────────────
 * Same module, same rules as Diesel: one small entry per save saying what each
 * part of the report went from and to, flagged when something loses a lot at
 * once. Collection names are PLAIN LANGUAGE because a person reads them on a
 * tablet. Records only; the acting half is the cloud-door gate further down. */
const ElectricJournal = createChangeJournal({
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
      'checklist items':      s.clState,
      'deficiencies':         defs,
      'general deficiencies': s.generalDeficiencies,
      'flow test photos':     s.flowTestPhotos,
      'sketches':             s.sketchEntries
    };
  },
  whoami: function () { try { return (Auth.getUser && Auth.getUser().email) || ''; } catch (_) { return ''; } },
  build:  function () { try { return window.ELEC_BUILD || ''; } catch (_) { return ''; } },
  tag: '[electric]'
});
try { window._elecJournal = ElectricJournal; } catch (_) {}

const model = {
  /* S643b — Electric's getProject() is a FRESH collect of what the inspector is
     actually looking at, so a failed repaint CAN leave the screen
     disagreeing with what the engine applied. That is the one condition
     under which the ledger may be anchored to the device. FRT must never
     set this: its getProject() hands back the in-memory model by
     reference, and anchoring there would put photo binaries into a ledger
     that gets persisted to disk. */
  getProjectReadsScreen: true,
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
    catch (e) { console.warn('[ElectricSync] applyMerged failed:', e && e.message); }
  },
  saveNow: function () {
    try { if (typeof window.saveState === 'function') window.saveState(); } catch (_) {}
  }
};

/* ── The shared engine instance ─────────────────────────────────────────── */
const engine = createSync({
  toolKey: 'electric',
  Auth: Auth,
  IDB: SyncIDB,
  model: model,
  SyncWorkerHost: ElectricWorkerHost,
  /* S566/S567 — CHANGE-SCOPED SAVES: ON for Electric (Mark's call, all
     tools). The engine sends only the report sections that differ from the
     pinned ancestor; any doubt = the full-document push, byte for byte.
     Outcomes go to the console until Electric grows an on-screen record. */
  partialSave: {
    onPartialPush: function (info) {
      try {
        if (info && info.mode === 'partial') {
          console.info('[ElectricSync] change-scoped save: ' + (info.sent || []).join(', ') +
                       ' (' + (info.sentKB || 0) + ' KB of ' + (info.fullKB || 0) + ' KB)');
        } else if (info) {
          console.info('[ElectricSync] full save' + (info.reason ? ' (' + info.reason + ')' : ''));
        }
      } catch (_) {}
    }
  }
});

/* ── Conflict screen (shared dialog engine; semantic accent, no burgundy) ──
 * Auto-resolves bookkeeping noise (_build, dateModified — both sides stamp
 * them on every save, so they can conflict without any human meaning) in
 * favour of MINE, and only shows the dialog for real field conflicts. */
const _NOISE_PATHS = { '_build': 1, 'dateModified': 1 };
/* S583: stamp paths are bookkeeping — auto-resolve, never ask a person. */
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
      console.info('[ElectricSync S590] ' + conflicts.length + ' contested field(s) auto-resolved, latest entry wins:');
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
    console.info('[ElectricSync] silent merge applied — both editors kept ('
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
  /* S584 — live OS read at every decision point; the online/offline events
     are unreliable on Android and remain only as instant status updates.
     Same stranded-phone fix as Diesel. */
  function _netUp() { _online = (navigator.onLine !== false); return _online; }
  let _userId = null;
  let _projectInfo = null;
  let _lastSavedJson = '';
  /* S595 — last ACTUAL keystroke (not focus). See the heartbeat gate below. */
  let _lastEditAt = 0;
  try {
    document.addEventListener('input', function () { _lastEditAt = Date.now(); }, true);
  } catch (_) {}
  let _lastPushedJson = '';   // S524 I-5: advances only on CONFIRMED push
  let _pendingSince = null;   // S524 I-5: when unsent work first appeared (durable)
  /* S673 — the boot barrier, mirrored from Diesel (see diesel-sync.js for the
     full field-test-3 account, 17 Aug: a relaunch pushed a blank NPSH wearing
     a fresh mint and destroyed the unsent offline work on disk). Until the
     host announces its boot apply, the facade is inert on every outbound and
     record-touching door; a 20s fallback guarantees sync can never be wedged.
     Harness: tools/sim/bootlaunder.mjs. */
  let _bootApplied = false;
  let _bootHoldTimer = null;
  let _bootAppliedState = null;
  const BOOT_HOLD_MAX_MS = 20000;
  let _initialized = false;
  let _pulling = false;
  /* S602 — tick health, mirrored from Diesel. */
  let _pullingSince = 0, _lastCheckAt = 0;
  let _bootTrace = [];   // S603
  const ELEC_TICK_NET_TIMEOUT_MS = 20000;
  const ELEC_TICK_WATCHDOG_MS = 45000;
  function _elecWithTimeout(p, ms, label) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error(label + ' timed out after ' + Math.round(ms / 1000) + 's')); }, ms);
    })]);
  }

  function _setStatus(status, msg) {
    if (_onStatusChange) { try { _onStatusChange(status, msg); } catch (_) {} }
  }

  // S447 transport contract (inherited): REST calls always send
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
    if (!_netUp()) return 1;   // S584
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

    /* S673 — arm the boot barrier before anything else can fire (mirror). */
    try { engine.holdEditStamps = true; } catch (_) {}
    if (!_bootHoldTimer && !_bootApplied) {
      _bootHoldTimer = setTimeout(function () { _liftBootHold('timeout'); }, BOOT_HOLD_MAX_MS);
    }

    /* S603 — startup can no longer hang; mirrored from Diesel (see
       diesel-sync.js for the full reasoning and the Android evidence). */
    async function _step(name, fn, ms) {
      try { await _elecWithTimeout(Promise.resolve().then(fn), ms || 10000, name); _bootTrace.push(name + ' ok'); }
      catch (e) {
        var why = (e && e.message) || 'failed';
        _bootTrace.push(name + ' ' + (/timed out/.test(why) ? 'timed out' : ('failed: ' + why.slice(0, 60))));
        console.warn('[ElectricSync] init step "' + name + '":', why);
      }
    }
    await _step('local-db', function () { return SyncIDB.init(); }, 8000);
    await _step('sign-in',  async function () { const user = await _getUser(); if (user) _userId = user.id; }, 10000);
    if (_projectId && _online) await _step('project-info', function () { return _loadProjectInfo(); }, 10000);
    if (_projectId && !_instanceId) await _step('report-number', async function () { _instanceNumber = await _getNextInstanceNumber(); }, 10000);

    window.addEventListener('online', function () {
      _online = true;
      _setStatus('saving', 'Reconnected...');
      /* S583 — an offline save never involves the engine, so engine.isPending
         stays false and this handler used to do nothing on reconnect. Check
         the real ledger: local saved vs cloud confirmed. */
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
          .then(function (r) { _setStatus(r ? 'synced' : 'pending', r ? 'Saved to cloud' : 'Saved locally'); })
          .catch(function () { _setStatus('pending', 'Saved locally'); });
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
    /* S674 — the engine's keystroke stamper carries the value with it. */
    try { engine.onStampPersist = _persistAtStamp; } catch (_) {}
    /* S675 — any edit is an edit: taps, strokes, and silent arrivals feed the
       same diff-gated pipeline. Opt-in flag; FRT stays unchanged until its
       own lane raises it. */
    try { engine.wideEditTriggers = true; } catch (_) {}

    engine.onModelReplaced = function () {
      try {
        if (!_collectStateFn) return;
        /* S673 — no re-baseline during boot (mirror): this fires on the boot
           capture pull too, and a collect here reads the unpainted skeleton —
           overwriting the previous session's unsent work on disk. */
        if (!_bootApplied) return;
        var now = JSON.stringify(_collectStateFn());
        _lastSavedJson = now;
        /* S622c — confirmation honesty, mirrored from Diesel (see the Diesel
           facade for the full 06 Aug pm-rpm stranding account): the dedupe
           advances and the unsent marker clears ONLY when the merge kept
           nothing local. A device the merge left AHEAD of the cloud has
           unconfirmed work; the S604 re-arm pushes it on the next beat. */
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
      } catch (e) { console.warn('[ElectricSync] re-baseline after cloud apply failed:', e && e.message); }
    };

    /* S586 — mobile lifecycle wake-up flush (same root fix as Diesel: Android
       freezes background timers; flush + catch up the moment we're back). */
    var _lastKickAt = 0;
    function _lifecycleKick(pullToo) {
      if (!_initialized) return;
      if (!_bootApplied) return;   // S673 — a kick during boot collects the skeleton; hold it
      var now = Date.now();
      if (now - _lastKickAt < 2000) return;
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
      else _lifecycleKick(false);
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
          } catch (e) { console.warn('[ElectricSync S601] boot stamp-merge skipped:', e && e.message); }
          const meta = await _fetchRowMeta();
          _instanceId = engine.instanceId || _instanceId;
          _instanceNumber = engine.instanceNumber || _instanceNumber;
          const sj = JSON.stringify(data);
          _lastSavedJson = sj;
          /* S673 (mirror) — retain the boot-decided document for the anchor,
             and carry the durable unsent-work marker instead of erasing it
             (the OPEN-6 second defect). */
          _bootAppliedState = data;
          var _prevRec = null;
          try { _prevRec = await _cacheGet(_cacheKey()); } catch (_) {}
          _cachePut(_cacheKey(), {
            state: sj, projectId: _projectId, toolKey: _toolKey,
            instanceId: _instanceId, instanceNumber: _instanceNumber,
            savedAt: (meta && meta.updated_at) || new Date().toISOString(),
            pendingPush: !!(_prevRec && _prevRec.pendingPush),
            pendingSince: (_prevRec && _prevRec.pendingSince) || null
          });
          if (_prevRec && _prevRec.pendingPush && !_pendingSince) {
            _pendingSince = _prevRec.pendingSince || new Date().toISOString();
          }
          _setStatus('synced', 'Loaded from cloud');
          return {
            source: 'cloud',
            state: data,
            row: meta || { id: _instanceId, status: 'draft', updated_at: engine.lastSeenUpdatedAt }
          };
        }
      } catch (e) {
        _captureNext = false;
        console.warn('[ElectricSync] cloud load failed:', e && e.message);
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
    } catch (e) { console.error('[ElectricSync] cache load failed:', e); }
    _setStatus(_online ? 'synced' : 'offline', 'No saved data');
    return null;
  }

  /* ── S574 — the cloud-door wipe gate (ported from Diesel S571) ────────────
   * A save whose shape matches a wipe stops at the CLOUD door and asks once.
   * Safe on an unwatched threshold for the same three reasons as Diesel:
   *   1. the LOCAL save has already happened above — nobody can be stopped
   *      from working, and nothing can be lost by pausing;
   *   2. it FAILS OPEN — no dialog, no journal, any error = the push proceeds,
   *      so the guard can never become a silent sync outage;
   *   3. it asks ONCE PER LOSS SHAPE, so autosave cannot nag, while a
   *      genuinely different loss later still gets its own question.
   * The server wipe guard remains the hard backstop underneath. */
  var _wipeAnswers = {};
  var _wipeAsking = false;

  function _wipeSignature(losses) {
    return losses.map(function (l) { return l.k + ' ' + l.from + '\u2192' + l.to; }).join(' | ');
  }

  async function _wipeGateAllows(stateJson) {
    if (!_lastPushedJson) return true;
    var J = window._elecJournal;
    if (!J || typeof J.assessLosses !== 'function') return true;
    var before, after;
    try { before = JSON.parse(_lastPushedJson); after = JSON.parse(stateJson); }
    catch (_) { return true; }
    try { if (after && after._intentionalClear) return true; } catch (_) {}
    var losses = J.assessLosses(before, after);
    if (!losses || !losses.length) return true;
    var sig = _wipeSignature(losses);
    if (_wipeAnswers[sig] !== undefined) return _wipeAnswers[sig];
    if (_wipeAsking) return false;
    if (!Dlg || typeof Dlg.confirm !== 'function') {
      console.warn('[ElectricSync S574] wipe gate: no dialog engine — allowing push.');
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
      console.warn('[ElectricSync S574] wipe gate dialog failed — allowing push:', e && e.message);
      ok = true;
    }
    _wipeAsking = false;
    _wipeAnswers[sig] = ok;
    if (!ok) console.warn('[ElectricSync S574] cloud push paused by the user for: ' + sig);
    return ok;
  }

  /* Save. The engine pushes model.getProject() — a FRESH _collectCloudState()
   * — under If-Match. stateJson is used for dedupe + the offline cache only
   * (call sites pass the same collect, so the two are equivalent). */
  async function save(stateJson) {
    if (typeof stateJson !== 'string') stateJson = JSON.stringify(stateJson);
    /* S673 — nothing saves before the report exists (mirror): while the boot
       barrier holds, a collect is not the report — caching it destroys the
       unsent-work record and pushing it launders blanks. Do nothing at all. */
    if (!_bootApplied) { _setStatus('pending', 'Loading report\u2026'); return null; }
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
      /* S617 — mirror of Diesel's fix: an offline edit must carry the moment
         it was TYPED. Without this, its stamp was minted at first online
         flush and wrongly beat values other devices typed later. */
      try { if (engine && typeof engine.stampLocal === 'function') await engine.stampLocal(); } catch (_) {}
      _settleRetry(); return null;
    }   // S584
    if (alreadyPushed) return null;
    try {
      const _allow = await _wipeGateAllows(stateJson);
      if (!_allow) { _setStatus('pending', 'Saved locally — cloud save paused'); return null; }
    } catch (e) {
      console.warn('[ElectricSync] wipe gate skipped (failing open):', e && e.message);
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
        _setStatus('synced', 'Saved to cloud');
        return row;
      }
      // null = offline-queued, conflict abandoned/cancelled, or push error —
      // in every case the local save is durable and retries later.
      _setStatus('pending', 'Saved locally');
      return null;
    } catch (e) {
      console.warn('[ElectricSync] save failed:', e && e.message);
      /* S584 — dead sign-in goes loud (same as Diesel). */
      var _m = String((e && e.message) || '');
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
      b.id = 'elecAuthDeadBanner';
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

  /* S674 (mirror) — THE VALUE RIDES WITH ITS CLAIM. See diesel-sync.js for the
     full account of Mark's 21 Aug Rated Flow loss: the entry stamp was durable
     at 500ms, the value not until the ~5500ms push, and a kill in between left
     an orphaned claim that re-dated whatever the screen showed next. Same
     trigger as the stamp, local only, held while the boot barrier is up.
     Harness: tools/sim/typekill.mjs. */
  function _persistAtStamp() {
    if (!_bootApplied) return;                 // S673 — the screen is not the report yet
    if (!_collectStateFn || !_projectId) return;
    var stateJson;
    try { stateJson = JSON.stringify(_collectStateFn()); } catch (_) { return; }
    if (stateJson === _lastSavedJson) return;
    _lastSavedJson = stateJson;
    _cachePut(_cacheKey(), {
      state: stateJson, projectId: _projectId, toolKey: _toolKey,
      instanceId: engine.instanceId || _instanceId, instanceNumber: engine.instanceNumber || _instanceNumber,
      savedAt: new Date().toISOString(),
      pendingPush: true,
      pendingSince: _pendingSince || (_pendingSince = new Date().toISOString()),
      bgIfMatch: engine.lastSeenUpdatedAt || null
    });
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
  /* ═══ S673 — LIFTING THE BOOT BARRIER (mirror; see diesel-sync.js for the
     full ordering rationale: anchor first, then flush with honest stamps). */
  function _liftBootHold(why) {
    if (_bootApplied) return;
    _bootApplied = true;
    if (_bootHoldTimer) { clearTimeout(_bootHoldTimer); _bootHoldTimer = null; }
    try { engine.holdEditStamps = false; } catch (_) {}
    try { if (engine.anchorBoot) engine.anchorBoot(_bootAppliedState); } catch (e) {
      console.warn('[ElectricSync S673] boot anchor failed (continuing):', e && e.message);
    }
    if (why !== 'host') console.warn('[ElectricSync S673] boot barrier lifted by ' + why);
    if (_collectStateFn) {
      try {
        var j = JSON.stringify(_collectStateFn());
        engine.pushVia = 'boot-complete';
        Promise.resolve(save(j)).catch(function () {});
      } catch (_) {}
    }
  }

  async function _recoverUnsentWork() {
    try {
      const rec = await _cacheGet(_cacheKey());
      if (!rec || !rec.pendingPush) return null;
      if (!engine.lastSeenUpdatedAt) {
        console.warn('[ElectricSync I-5] Unsent work found but NO cloud baseline yet — ' +
                     'holding it on device; will retry once a pull succeeds.');
        return { recovered: true, minutesOld: _ageMin(rec.pendingSince), baseline: false };
      }
      // Force the next collect→save to actually push: clear the push dedupe so
      // identical content is not mistaken for "already sent".
      _lastPushedJson = '';
      _pendingSince = rec.pendingSince || new Date().toISOString();
      const mins = _ageMin(rec.pendingSince);
      console.log('[ElectricSync I-5] Recovered unsent work from a previous session (' +
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
            console.log('[ElectricSync S592] recovered work already matches cloud — nothing to send.');
          }
        } catch (e) {
          console.warn('[ElectricSync I-5] recovery flush failed; retry loop will continue:', e && e.message);
        }
      }
      return { recovered: true, minutesOld: mins, baseline: true };
    } catch (e) {
      console.warn('[ElectricSync I-5] recovery check skipped:', e && e.message);
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
    /* S602 — mirrored from Diesel: the busy flag can no longer be held for the
       rest of the session by a request that hangs instead of failing, and the
       cloud check is time-bound. See diesel-sync.js for the full reasoning. */
    if (!_netUp() || !_initialized || !_projectId) return;   // S584
    if (!_bootApplied) return;   // S673 — barrier holds until the boot apply
    if (_pulling && (Date.now() - _pullingSince) < ELEC_TICK_WATCHDOG_MS) return;
    _pulling = false;
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
    if ((Date.now() - _lastEditAt) < 3000 || window._autosaveTimer) return;
    _pulling = true;
    _pullingSince = Date.now();
    _lastCheckAt = Date.now();   // S602: "I looked", recorded apart from "I received"
    try {
      /* S584 — unsent work flushes on every beat, same as Diesel: it must not
         depend on whether the cloud happens to have moved. */
      if (_collectStateFn) {
        try {
          const unsentNow = JSON.stringify(_collectStateFn());
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
        } catch (e) { console.warn('[ElectricSync] heartbeat flush failed:', e && e.message); }
      }
      const remote = await _elecWithTimeout(
        engine.getRemoteUpdatedAt(_projectId, engine.instanceId || _instanceId),
        ELEC_TICK_NET_TIMEOUT_MS, 'probe');   // S602
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
            /* S583 — same 70-psi fix as Diesel: ask the CLOUD ledger
               (_lastPushedJson), not the local one. Offline work always
               pushes before any pull can touch it. */
            if (localNow !== _lastPushedJson) await save(localNow);
          } catch (e) { console.warn('[ElectricSync] pre-pull push failed:', e && e.message); }
        }
        await _elecWithTimeout(engine.pull(_projectId, engine.instanceId || _instanceId),
                               ELEC_TICK_NET_TIMEOUT_MS, 'pull');   // S602 — silent, stale-guard active
        /* S604 — mirrored from Diesel: re-arm the push when the merge kept
           newer local entries over the cloud copy (see diesel-sync.js). */
        if (engine.lastPullKeptLocal) {
          _lastPushedJson = '';
          if (!_pendingSince) _pendingSince = new Date().toISOString();
        }
        const ctl = window.__elecHeaderCtl;
        if (ctl) {
          ctl.setCloud({ state: 'pull' });
          setTimeout(function () { ctl.setCloud({ state: 'ok' }); }, 2000);
        }
      }
    } catch (e) {
      console.warn('[ElectricSync] heartbeat tick failed:', e && e.message);
    } finally {
      _pulling = false;   // S602: a finally, so nothing can skip the release
    }
  }

  function startAutoSave(collectStateFn, intervalMs) {
    _collectStateFn = collectStateFn;
    stopAutoSave();
    _autoSaveTimer = setInterval(function () {
      if (!_collectStateFn) return;
      try { engine.pushVia = 'autosave'; save(_collectStateFn()); }
      catch (e) { console.error('[ElectricSync] auto-save error:', e); }
    }, intervalMs || 15000);
  }
  function stopAutoSave() {
    if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
  }

  async function syncNow() {
    if (!_netUp()) { _setStatus('offline', 'No connection'); return false; }   // S584
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
      if (!_bootApplied) return;   // S673 — a mid-boot apply+re-baseline destroys the unsent cache
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
        console.log('[ElectricSync S596] applying new build (' + reason + ').');
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
    /* S673 — the host announces its boot apply is done (mirror). */
    bootApplyComplete: function (appliedState) {
      if (appliedState) _bootAppliedState = appliedState;
      _liftBootHold('host');
    },
    syncNow: syncNow, destroy: destroy, readUrlParams: readUrlParams,
    heartbeatTick: heartbeatTick, request: _request,
    /* S624 — the host owns the heartbeat timer and its gate, so it is the only
       thing that can report a heartbeat that stopped running, and it cannot
       report that through the sync path it is describing. Liveness telemetry
       only. */
    reportDiag: _diag,
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
console.log('%c[ElectricSync] merge-based sync engine active (S492)',
  'background:#9C2742;color:#fff;padding:2px 8px;border-radius:4px;');

/* S447 parity note, still binding: NO proactive Auth.restoreSession() here.
 * The tool uses whatever token is already in localStorage and shows its own
 * sign-in gate when there is none. */
