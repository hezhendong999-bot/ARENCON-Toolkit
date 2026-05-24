/**
 * ARENCON FRT v2 — Sync Engine
 * ════════════════════════════
 * 
 * Loads/saves project data from Supabase tool_data table.
 * Backward compatible with v1 CloudSync format.
 *
 * S123 Push 6B — sync atomicity:
 *   - Tracks _lastSeenUpdatedAt + _lastSeenSnapshot after every pull/push.
 *   - On push, sends `If-Match: "<updated_at>"` header so PostgREST returns
 *     412 Precondition Failed if the row changed since we last saw it.
 *   - On 412, calls SyncEngine.onConflict(localData, cloudData, baseSnapshot)
 *     which runs merge3 (data/merge.js) and either:
 *       - Auto-retries with merged data if no conflicts (silent merge)
 *       - Surfaces conflicts to app.js via the onConflict callback, which
 *         shows the modal and resolves to a merged-with-resolutions object,
 *         then retries the push.
 *   - Bounded retry: 3 attempts max. After that, returns null + warns.
 *
 * S124 A3 — sync hardening:
 *   - _lastSeenUpdatedAt + _lastSeenSnapshot now persisted to IDB store
 *     `syncMeta` after every pull AND push. Key shape:
 *       `<toolKey>:<projectId>:<instanceId|_default>`
 *   - On pull(): IDB record is restored BEFORE the network call. If the
 *     network pull succeeds, the snapshot is overwritten with cloud data.
 *     If the network pull fails (offline), the IDB-restored snapshot
 *     remains in memory so the next push still sends a valid If-Match.
 *   - Closes the S123 "first save after reload skips precondition" gap.
 */

import { Auth } from '../shared/auth.js';
import { Model } from './model.js';
import { IDB } from './idb.js';
// S132 — the direct merge3 import was removed: since S128 P-6 the 3-way
// merge runs in the sync worker (SyncWorkerHost.merge3Worker), so sync.js
// never calls merge3() directly. The engine still lives in data/merge.js.
import { SyncWorkerHost } from './syncWorkerHost.js';
// S171 (Fix A) — outbox integration. Push strips photos that originated
// in the local outbox before serialize; pull/merge call reconcileWithModel
// to repair any photos a wholesale-replace would have lost. Activation
// gated by PhotoOutbox.isEnabled() so PROD pushers/pullers see no change.
import { PhotoOutbox } from './photoOutbox.js';

// S165 — like the anon key above, the URL also lives in Auth (single source of truth).
// Auth's URL is computed at module load and reflects staging vs prod based on ?staging=1
// in the URL. Reading it dynamically prevents the S125 #1 class of bug where a copy here
// would drift from Auth.
function _url() {
  return (Auth && Auth.SUPABASE_URL) ? Auth.SUPABASE_URL : 'https://xsemvinxsyphjiaqgywv.supabase.co';
}
// S125 #1 — The anon key was rotated in early March 2026 but the copy here
// was missed, causing every PATCH to return 401 "Invalid API key" while
// pulls (which use Auth.request) worked fine. Cloud saves silently failed
// for ~6 weeks. Durable fix: ALWAYS read the live anon key from the Auth
// module — single source of truth. Never store a copy here again.
function _anonKey() {
  return (Auth && Auth.SUPABASE_ANON_KEY) ? Auth.SUPABASE_ANON_KEY : '';
}

var _instanceId = null;
var _instanceNumber = 1;
var _toolKey = 'frt';
var _pendingSync = false;
var _online = navigator.onLine;

// S123 P6B — optimistic-concurrency tracking
// Set after every successful pull AND every successful push. Used as the
// If-Match header on the next push, and as the "common ancestor" snapshot
// in 3-way merge when we hit 412.
// S124 A3 — also persisted to IDB store `syncMeta` so reload between pull
// and push doesn't lose the snapshot.
var _lastSeenUpdatedAt = null;
var _lastSeenSnapshot = null;

// S126 Phase C — Sync atomicity: empty-array clobber guard.
//
// THE PROBLEM:
//   A cloud row can arrive with `drawings: []`, `photos: []`, `contractors: []`
//   even when the local model has populated arrays. Causes include:
//   (a) A concurrent push from another instance that itself had empty arrays
//       (e.g. brand-new instance for the same project)
//   (b) A migration / cleanup pass that emptied an array but isn't yet
//       reconciled with the local model
//   (c) A merged result that legitimately ended up empty for those arrays
//       (rare, but possible)
//   Without a guard, pull() → Model.setProject(cloudData) wipes the local
//   data even when the user has unsaved drawings/photos/contractors.
//
// THE GUARD:
//   Before handing cloud data to Model.setProject or Model.applyMerged, walk
//   four sensitive arrays (drawings, photos, contractors, sitePhotos — the
//   legacy field still seen on pre-S114 projects). For each: if cloud has
//   an empty array AND local has a non-empty array, splice the local array
//   back into the incoming cloud data. Counter increments per guard fire so
//   we can see in field deployment whether this is actually triggering.
//
// WHY NOT JUST FIX IT IN merge3:
//   merge3 already protects against the case where both sides have data —
//   it walks id-keyed arrays per-item. The clobber window we're closing is
//   the direct pull path (no merge happens, cloud is taken whole) and the
//   silent-merge path (where merge3 could legitimately produce an empty
//   array if the cloud version did and base/local agreed on a delete that
//   the local hasn't actually performed yet). The guard is defense-in-depth
//   for cases the merge engine can't distinguish from intentional deletes.
//
// DIAGNOSTIC COUNTERS:
//   Available as window._frt.diagnostics.sync.emptyArrayGuards after Phase D
//   loads. Pre-Phase D: visible via SyncEngine.diag (defined at module
//   bottom).
var _emptyArrayGuardFires = 0;
var _emptyArrayGuardLog = [];
var _GUARDED_ARRAY_FIELDS = ['drawings', 'photos', 'contractors', 'sitePhotos'];

function _guardEmptyArrays(cloudData, label) {
  if (!cloudData || typeof cloudData !== 'object') return cloudData;
  var localProj = Model.getProject();
  if (!localProj) return cloudData;
  _GUARDED_ARRAY_FIELDS.forEach(function(field) {
    var cloudArr = cloudData[field];
    var localArr = localProj[field];
    // Cloud has an EMPTY array AND local has a NON-EMPTY array → preserve local
    if (Array.isArray(cloudArr) && cloudArr.length === 0 &&
        Array.isArray(localArr) && localArr.length > 0) {
      cloudData[field] = JSON.parse(JSON.stringify(localArr));
      _emptyArrayGuardFires++;
      var entry = {
        at: new Date().toISOString(),
        path: label + '.' + field,
        rescued: localArr.length
      };
      _emptyArrayGuardLog.push(entry);
      // Cap log at 50 entries to bound memory
      if (_emptyArrayGuardLog.length > 50) _emptyArrayGuardLog.shift();
      console.warn('[Sync C-guard] Cloud delivered empty ' + field +
                   '; preserved local (' + localArr.length + ' items). Path: ' + label);
    }
  });
  return cloudData;
}

/**
 * S124 A3 — build the IDB key for a given project/instance.
 * Records keyed by `<toolKey>:<projectId>:<instanceId|_default>`.
 */
function _syncMetaKey(projectId, instanceId) {
  return _toolKey + ':' + projectId + ':' + (instanceId || '_default');
}

/**
 * S124 A3 — write current _lastSeen* to IDB. Fire-and-forget; errors
 * are warned but never block sync. Skips silently if IDB unavailable.
 */
function _persistSyncMeta(projectId, instanceId) {
  if (!projectId) return Promise.resolve(false);
  if (!_lastSeenUpdatedAt || !_lastSeenSnapshot) return Promise.resolve(false);
  var key = _syncMetaKey(projectId, instanceId);
  var record = {
    id: key,
    updatedAt: _lastSeenUpdatedAt,
    snapshot: _lastSeenSnapshot,
    savedAt: new Date().toISOString()
  };
  return IDB.put('syncMeta', record).catch(function(e) {
    console.warn('[Sync] _persistSyncMeta failed (non-fatal):', e && e.message);
    return false;
  });
}

/**
 * S124 A3 — read sync meta from IDB and restore _lastSeen* in memory.
 * Returns true if a record was found and applied, false otherwise.
 * Safe to call before the network is reachable.
 */
function _restoreSyncMeta(projectId, instanceId) {
  if (!projectId) return Promise.resolve(false);
  var key = _syncMetaKey(projectId, instanceId);
  return IDB.get('syncMeta', key).then(function(rec) {
    if (!rec || !rec.updatedAt || !rec.snapshot) return false;
    _lastSeenUpdatedAt = rec.updatedAt;
    _lastSeenSnapshot = rec.snapshot;
    console.log('[Sync] Restored snapshot from IDB — updated:', rec.updatedAt, '(saved at', rec.savedAt + ')');
    return true;
  }).catch(function(e) {
    console.warn('[Sync] _restoreSyncMeta failed (non-fatal):', e && e.message);
    return false;
  });
}

// Track online/offline
window.addEventListener('online', function() {
  _online = true;
  if (_pendingSync) {
    console.log('[Sync] Back online — flushing pending changes');
    SyncEngine.flush();
  }
});
window.addEventListener('offline', function() { _online = false; });

/**
 * Raw fetch helper that returns the full Response object (status, headers,
 * body) so we can inspect 412 specifically. Auth.request throws on non-200
 * which would swallow the 412. This is intentionally local — keeps the
 * Auth contract unchanged while letting us handle 412 properly.
 *
 * Auto-refreshes token on 401, just like Auth.request does.
 */
function _rawFetch(path, opts, _isRetry) {
  opts = opts || {};
  var token = localStorage.getItem('sb-access-token');
  var headers = Object.assign({
    'apikey': _anonKey(),
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }, opts.headers || {});

  return fetch(_url() + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function(res) {
    // Mirror Auth.request 401-handling so token expiry doesn't surface as a push failure
    if (res.status === 401 && !_isRetry && path.indexOf('/auth/v1/') !== 0) {
      console.log('[Sync] 401 on ' + path + ' — refreshing token + retrying');
      return Auth._refreshTokenShared().then(function(user) {
        if (!user) throw new Error('Unauthorized (refresh failed)');
        return _rawFetch(path, opts, true);
      });
    }
    return res;
  });
}

export var SyncEngine = {

  get instanceId() { return _instanceId; },
  get instanceNumber() { return _instanceNumber; },
  get lastSeenUpdatedAt() { return _lastSeenUpdatedAt; },

  /**
   * Callback hook. app.js sets this to its conflict-modal handler.
   * Signature: function(conflicts) → Promise<{resolutions: [...]} | null>
   *
   * Called when we hit 412 AND the 3-way merge produces conflicts that
   * need user resolution. If null is returned (user cancels), the push
   * is abandoned (the local state stays dirty, retry on next save).
   *
   * Default no-op returns null so sync gracefully degrades if app.js
   * forgets to wire it.
   */
  onConflict: function(/* conflicts, mergeResult */) {
    console.warn('[Sync] onConflict called but no handler wired. Push abandoned.');
    return Promise.resolve(null);
  },

  /**
   * Callback hook for silent (no-conflict) merge notifications.
   * Signature: function(mergeResult) → void
   * Default no-op. app.js sets this to show a passive toast.
   */
  onSilentMerge: function(/* mergeResult */) { /* no-op */ },

  /**
   * S132 — Is a candidate IDB snapshot blank / a placeholder?
   *
   * The blank-project load race: if the syncMeta record for this project
   * holds a snapshot with no real content (a placeholder captured mid-
   * creation, a stale pre-population snapshot, or a wrong/empty record),
   * the fast path would Model.setProject() it and the app would render
   * blank until the cloud pull lands. While that blank object is the live
   * _project, anything that fires _queueSave() (a user tap on the blank
   * UI, a mis-fired seed) would persist the blank state over the real one.
   *
   * Fix: treat a contentless snapshot as "no snapshot" — return null so the
   * fast path skips it entirely and the cloud pull becomes the FIRST
   * setProject(). A blank _project is then never set, so the race window
   * does not exist. A genuinely populated snapshot still fast-paths exactly
   * as before, so boot speed for real projects is unchanged.
   *
   * "Has content" = any of: a non-empty project number/name, or any
   * drawing / contractor / general deficiency / photo. Deliberately
   * generous — a project the user has touched at all clears this bar; only
   * a truly empty placeholder fails it.
   */
  _isBlankSnapshot: function(snap) {
    if (!snap || typeof snap !== 'object') return true;
    var info = snap.info || {};
    if ((info.projectNumber && String(info.projectNumber).trim()) ||
        (info.projectName && String(info.projectName).trim())) return false;
    if (Array.isArray(snap.drawings) && snap.drawings.length) return false;
    if (Array.isArray(snap.contractors) && snap.contractors.length) return false;
    if (Array.isArray(snap.generalDeficiencies) && snap.generalDeficiencies.length) return false;
    if (Array.isArray(snap.photos) && snap.photos.length) return false;
    return true;
  },

  /**
   * S129 Item 3 — Load the last-seen project snapshot from IDB for fast-path
   * boot render. Returns the project data or null. Side-effect: also sets
   * _lastSeenUpdatedAt and _lastSeenSnapshot so a subsequent push (before
   * pull() resolves) still has its 3-way-merge base.
   *
   * This is the perceived-boot-time fix. The full pull() still runs after
   * auth resolves and overwrites Model with fresh cloud data. The snapshot
   * we return here is whatever was current at the last successful pull.
   *
   * Non-blocking on failure (returns null). Safe to call before IDB.init
   * resolves — it'll just return null. Safe to call before auth — IDB has
   * no auth requirement.
   *
   * S132 — a blank/placeholder snapshot is treated as null (see
   * _isBlankSnapshot) so the fast path never sets a blank _project.
   */
  loadIDBSnapshot: function(projectId, instanceId) {
    if (!projectId) return Promise.resolve(null);
    var key = _syncMetaKey(projectId, instanceId);
    var self = this;
    return IDB.get('syncMeta', key).then(function(rec) {
      if (!rec || !rec.snapshot) return null;
      // S132 — blank-project load race guard. A contentless snapshot is
      // worse than no snapshot: it would render blank AND be persistable
      // over the real cloud data. Skip the fast path entirely; the cloud
      // pull becomes the first setProject(). Do NOT adopt it as the
      // merge base either — leave _lastSeenSnapshot unset so pull() sets
      // a real one.
      if (self._isBlankSnapshot(rec.snapshot)) {
        console.warn('[Sync] IDB snapshot is blank/placeholder — skipping fast-path render, waiting for cloud pull');
        return null;
      }
      _lastSeenUpdatedAt = rec.updatedAt || null;
      _lastSeenSnapshot = rec.snapshot;
      // Also record instanceId so a fast-path push (before pull resolves)
      // targets the right row. Best-effort — may be re-set by pull().
      if (instanceId) _instanceId = instanceId;
      console.log('[Sync] Loaded IDB snapshot for fast-path render — updated:', rec.updatedAt);
      return rec.snapshot;
    }).catch(function(e) {
      console.warn('[Sync] loadIDBSnapshot failed (non-fatal):', e && e.message);
      return null;
    });
  },

  /**
   * Pull project data from Supabase.
   * Reads from tool_data table (v1 format — single blob per project/tool/instance).
   * Records updated_at + a deep snapshot for later 3-way merge.
   *
   * S124 A3 — restores _lastSeen* from IDB BEFORE the network call so an
   * offline open still has a usable snapshot for the next push attempt.
   * If the network pull succeeds, the in-memory snapshot is overwritten
   * with the fresh cloud data and persisted back to IDB.
   */
  pull: function(projectId, instanceId) {
    var path;
    if (instanceId) {
      path = '/rest/v1/tool_data?select=*&id=eq.' + instanceId;
    } else {
      path = '/rest/v1/tool_data?select=*&project_id=eq.' + projectId + '&tool_key=eq.' + _toolKey + '&order=updated_at.desc&limit=1';
    }

    // S124 A3 — try IDB restore first. Non-blocking on failure; the network
    // pull below will overwrite anyway if it succeeds.
    return _restoreSyncMeta(projectId, instanceId).then(function() {
      // S130 Item 5.3 — request raw text and parse off the main thread.
      // For 10MB+ project responses this saves 100-300ms of UI freeze.
      // SyncWorkerHost.parseLarge falls back to inline JSON.parse if the
      // worker is unavailable, so this works on every browser.
      return Auth.request(path, { rawText: true });
    }).then(function(text) {
      return text ? SyncWorkerHost.parseLarge(text) : null;
    }).then(function(rows) {
      if (!rows || !rows.length) {
        console.log('[Sync] No cloud data found for project:', projectId);
        return null;
      }

      var row = rows[0];
      _instanceId = row.id;
      _instanceNumber = row.instance_number || 1;
      _lastSeenUpdatedAt = row.updated_at || null;

      var data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (data) {
        // S126 Phase C — empty-array clobber guard. Inspects cloud arrays
        // vs local; if cloud is empty AND local has data, splice local back
        // in before passing to setProject. Prevents cross-device pulls from
        // wiping unsaved local drawings/photos/contractors.
        data = _guardEmptyArrays(data, 'pull');
        // S123 P6B — snapshot for 3-way merge. Deep clone so later edits
        // to Model.getProject() don't mutate this reference.
        _lastSeenSnapshot = JSON.parse(JSON.stringify(data));
        Model.setProject(data);
        // S171 Fix A — repair any photos a wholesale-replace would have
        // lost. The outbox is parallel to model state; rows in r2_confirmed
        // get re-injected back into model.defic.photos[]. No-op when the
        // outbox is empty or PhotoOutbox is disabled (PROD).
        try {
          if (PhotoOutbox && PhotoOutbox.reconcileWithModel) {
            PhotoOutbox.reconcileWithModel(Model.getProject());
          }
        } catch (e) {
          console.warn('[Sync][Fix A] reconcileWithModel (pull) failed:', e && e.message);
        }
        // S124 A3 — persist fresh snapshot to IDB (re-key in case instanceId
        // was null on entry but resolved from the row).
        _persistSyncMeta(projectId, _instanceId);
        console.log('[Sync] Loaded from cloud — instance:', _instanceId, 'updated:', _lastSeenUpdatedAt);
        return data;
      }
      return null;
    }).catch(function(err) {
      console.warn('[Sync] Pull failed:', err.message);
      return null;
    });
  },

  /**
   * S82: Lightweight check for remote updated_at. Used by periodic-pull system
   * to detect when another inspector pushed changes. Returns ISO timestamp or null.
   * Cheap query (~150 bytes) — safe to run every 30s.
   */
  getRemoteUpdatedAt: function(projectId, instanceId) {
    var path;
    if (instanceId) {
      path = '/rest/v1/tool_data?select=updated_at&id=eq.' + instanceId;
    } else {
      path = '/rest/v1/tool_data?select=updated_at&project_id=eq.' + projectId + '&tool_key=eq.' + _toolKey + '&order=updated_at.desc&limit=1';
    }
    return Auth.request(path).then(function(rows) {
      if (!rows || !rows.length) return null;
      return rows[0].updated_at || null;
    }).catch(function(err) {
      console.warn('[Sync] getRemoteUpdatedAt failed:', err.message);
      return null;
    });
  },

  /**
   * Push current project state to Supabase.
   * If offline, marks as pending and pushes on reconnect.
   *
   * S123 P6B — bounded-retry with 3-way merge:
   *   1. Strip binary data + build payload
   *   2. PATCH with If-Match: "<_lastSeenUpdatedAt>"
   *   3. If 412 (precondition failed):
   *      a. Pull the latest cloud row
   *      b. Run merge3(_lastSeenSnapshot, local, cloud)
   *      c. If no conflicts → apply merged via Model.applyMerged, retry push (attempt++)
   *      d. If conflicts → onConflict callback shows modal, resolves,
   *         apply, retry push (attempt++)
   *      e. After 3 attempts, give up + warn
   */
  push: function(projectId, _attempt) {
    _attempt = _attempt || 0;
    var self = this;
    var proj = Model.getProject();
    if (!proj) return Promise.resolve(null);

    if (!_online) {
      _pendingSync = true;
      console.log('[Sync] Offline — queued for sync');
      IDB.put('syncQueue', {
        id: 'pending_' + Date.now(),
        projectId: projectId,
        timestamp: new Date().toISOString(),
        status: 'pending'
      });
      return Promise.resolve(null);
    }

    if (_attempt >= 3) {
      console.warn('[Sync] Push abandoned — 3 conflict retries exhausted.');
      _pendingSync = true;
      return Promise.resolve(null);
    }

    // Strip binary data before pushing.
    //
    // S126 Phase B — markupObjects ride per-drawing R2 binaries, not the
    // tool_data row. We strip markupObjects from each drawing before push;
    // the drawing.markupR2 reference object stays (it carries r2Key, r2Url,
    // count, updatedAt, inspectorId — small scalars that field-merge
    // cleanly between concurrent writers). Legacy `markupData` (never used
    // since the canvas-objects refactor) is also stripped to be safe.
    //
    // History: pre-S124 stripped markupObjects, but Markup.saveNow() never
    // ran on hard refresh, so strokes were silently lost. S125 hotfix 6
    // removed the strip — strokes round-tripped through cloud but the
    // tool_data row grew unboundedly with heavy-markup projects, and two
    // tablets editing the same project clobbered each other's strokes.
    // S126 Phase B fixes both: the strip is back AND strokes persist
    // because the per-drawing markup binary is the durable store, not the
    // tool_data row.
    // S128 P-6 — moved the deep-clone + strip-binaries block into the
    // sync worker (background thread). serializePush() returns the
    // stripped data; falls back to inline on the main thread if Worker
    // is unavailable. The whole push() flow is now anchored on this
    // initial Promise rather than a sync prelude.
    return SyncWorkerHost.serializePush(proj).then(function(serialized) {
      var data = serialized.strippedData;

      // ── S171 Fix A: strip outbox-originated photos that aren't ready ──
      // Per D7: only strip photos that originated in the LOCAL outbox.
      // Photos with r2Key:null that arrived from cloud (legacy / pre-Fix-A
      // devices) pass through unchanged — we don't destructively clean
      // up another device's data.
      //
      // The strip set is rows in {pending, uploading, retrying, failed}.
      // Rows in r2_confirmed have their photo.r2Key set and ARE pushed
      // — they're exactly what we want cloud to capture, so the next
      // markCloudConfirmed can retire the outbox row.
      var photoIdsToConfirm = [];
      if (PhotoOutbox && PhotoOutbox.isEnabled && PhotoOutbox.isEnabled()) {
        var rows = PhotoOutbox.getEntriesForProject(projectId);
        var stripIds = {};
        rows.forEach(function(r) {
          if (!r || !r.photoId) return;
          if (r.status === 'r2_confirmed') {
            photoIdsToConfirm.push(r.photoId);
          } else if (r.status === 'pending' || r.status === 'uploading' ||
                     r.status === 'retrying' || r.status === 'failed') {
            stripIds[r.photoId] = true;
          }
        });
        var stripCount = 0;
        function _strip(d) {
          if (!d || !Array.isArray(d.photos)) return;
          var before = d.photos.length;
          d.photos = d.photos.filter(function(p) {
            return !(p && p.id && stripIds[p.id]);
          });
          stripCount += (before - d.photos.length);
        }
        (data.contractors || []).forEach(function(c) {
          (c.deficiencies || []).forEach(_strip);
        });
        (data.generalDeficiencies || []).forEach(_strip);
        if (stripCount > 0) {
          console.log('[Sync][Fix A] Stripped ' + stripCount +
                      ' outbox-tracked photo(s) from push payload (waiting for R2 confirm)');
        }
      }

      var user = Auth.getUser();
      var payload = {
        project_id: projectId,
        tool_key: _toolKey,
        instance_number: _instanceNumber,
        data: data,
        updated_by: user ? user.id : null,
        updated_at: new Date().toISOString()
      };

      var method, path;
      var customHeaders = { 'Prefer': 'return=representation' };

      if (_instanceId) {
        method = 'PATCH';
        path = '/rest/v1/tool_data?id=eq.' + _instanceId;
        // S123 P6B — only send If-Match on PATCH (POST is initial create)
        // and only if we have a tracked updated_at (defensive: a hot reload
        // after a manual cloud edit could leave us with no snapshot).
        if (_lastSeenUpdatedAt) {
          customHeaders['If-Match'] = '"' + _lastSeenUpdatedAt + '"';
        }
      } else {
        method = 'POST';
        path = '/rest/v1/tool_data';
        payload.created_by = user ? user.id : null;
        payload.status = 'draft';
        payload = [payload];
      }

      return _rawFetch(path, {
        method: method,
        body: payload,
        headers: customHeaders
      }).then(function(res) {
      // S123 P6B — 412 Precondition Failed = optimistic-concurrency conflict
      if (res.status === 412) {
        console.warn('[Sync] 412 conflict on push — running 3-way merge (attempt ' + (_attempt + 1) + '/3)');
        return self._handleConflict(projectId, proj, _attempt);
      }
      if (!res.ok) {
        return res.json().catch(function() { return { message: res.statusText }; }).then(function(err) {
          throw new Error(err.message || err.msg || res.statusText);
        });
      }
      return res.text().then(function(text) { return text ? JSON.parse(text) : null; });
    }).then(function(rows) {
      if (rows && rows.length > 0) {
        _instanceId = rows[0].id;
        _instanceNumber = rows[0].instance_number;
        _lastSeenUpdatedAt = rows[0].updated_at || null;
        // S123 P6B — update snapshot to the just-pushed state so next
        // 412 has the correct ancestor.
        _lastSeenSnapshot = JSON.parse(JSON.stringify(data));
        // S124 A3 — persist to IDB so the snapshot survives reloads.
        _persistSyncMeta(projectId, _instanceId);
        _pendingSync = false;
        IDB.clear('syncQueue');
        console.log('[Sync] Pushed to cloud — instance:', _instanceId, 'updated:', _lastSeenUpdatedAt);

        // ── S171 Fix A: tell the outbox cloud captured these photos ──
        // Snapshot-time photoIdsToConfirm is what we actually pushed.
        // markCloudConfirmed is idempotent; if rows moved on between
        // capture and now (rare), it filters defensively.
        if (photoIdsToConfirm.length > 0 &&
            PhotoOutbox && PhotoOutbox.markCloudConfirmed) {
          PhotoOutbox.markCloudConfirmed(photoIdsToConfirm).catch(function(e) {
            console.warn('[Sync][Fix A] markCloudConfirmed failed (non-fatal):',
                         e && e.message);
          });
        }

        return rows[0];
      }
      return null;
    }).catch(function(err) {
      console.warn('[Sync] Push failed:', err.message);
      _pendingSync = true;
      return null;
    });
    }); // close SyncWorkerHost.serializePush().then
  },

  /**
   * S123 P6B — internal: handle a 412 conflict.
   * Pulls latest cloud state, runs merge3, dispatches to silent-merge or
   * modal path depending on whether conflicts exist.
   */
  _handleConflict: function(projectId, localProj, attempt) {
    var self = this;
    var pullPath = '/rest/v1/tool_data?select=*&id=eq.' + _instanceId;

    return Auth.request(pullPath).then(function(rows) {
      if (!rows || !rows.length) {
        console.warn('[Sync] 412 conflict but row not found — was it deleted? Abandoning push.');
        return null;
      }
      var cloudRow = rows[0];
      var cloudData = typeof cloudRow.data === 'string' ? JSON.parse(cloudRow.data) : cloudRow.data;
      var cloudUpdatedAt = cloudRow.updated_at;

      // S128 P-6 — merge3 runs in the sync worker (background thread).
      // Falls back to inline on the main thread if Worker is unavailable.
      // The catch below preserves the legacy "merge3 threw → abandon push"
      // contract.
      return SyncWorkerHost.merge3Worker(_lastSeenSnapshot, localProj, cloudData).then(function(mergeResult) {

      // Update the "last seen" to the new cloud state regardless — the
      // next push uses this as the precondition.
      _lastSeenUpdatedAt = cloudUpdatedAt;
      _lastSeenSnapshot = JSON.parse(JSON.stringify(cloudData));
      // S124 A3 — persist new ancestor so a reload mid-conflict doesn't
      // lose the just-fetched cloud state.
      _persistSyncMeta(projectId, _instanceId);

      if (mergeResult.conflicts.length === 0) {
        // Silent merge — apply + retry push
        console.log('[Sync] Silent merge — no field conflicts. Auto-applying merged state.');
        // S126 Phase C — guard the merged result the same way as a direct
        // pull. merge3 already protects per-item but can legitimately
        // produce an empty array if cloud was empty AND local agrees on
        // a delete we haven't yet committed; the guard ensures the local
        // populated state wins in the rare ambiguous case.
        var guardedMerged = _guardEmptyArrays(mergeResult.merged, 'silentMerge');
        Model.applyMerged(guardedMerged);
        // S171 Fix A — applyMerged is just as destructive to in-flight
        // photos as setProject. Run the same outbox reconcile.
        try {
          if (PhotoOutbox && PhotoOutbox.reconcileWithModel) {
            PhotoOutbox.reconcileWithModel(Model.getProject());
          }
        } catch (e) {
          console.warn('[Sync][Fix A] reconcileWithModel (silentMerge) failed:', e && e.message);
        }
        try { self.onSilentMerge(mergeResult); } catch (e) { console.warn('[Sync] onSilentMerge handler threw:', e); }
        return self.push(projectId, attempt + 1);
      }

      // True conflicts — surface to user via callback
      console.log('[Sync] ' + mergeResult.conflicts.length + ' true conflict(s) — surfacing to user.');
      return Promise.resolve(self.onConflict(mergeResult.conflicts, mergeResult)).then(function(resolution) {
        if (!resolution) {
          // User cancelled — leave local dirty for retry on next save
          console.log('[Sync] User cancelled conflict resolution — push abandoned.');
          return null;
        }
        // resolution is { resolutions: [...] } — caller applies them and
        // returns the final merged state. Apply + retry.
        Model.applyMerged(resolution.merged);
        // S171 Fix A — same reconcile as the silent-merge path.
        try {
          if (PhotoOutbox && PhotoOutbox.reconcileWithModel) {
            PhotoOutbox.reconcileWithModel(Model.getProject());
          }
        } catch (e) {
          console.warn('[Sync][Fix A] reconcileWithModel (conflict resolution) failed:', e && e.message);
        }
        return self.push(projectId, attempt + 1);
      });

      }).catch(function(mergeErr) {
        // Legacy contract: any merge3 failure → abandon push.
        console.error('[Sync] merge3 threw — abandoning push:', mergeErr);
        return null;
      });
    }).catch(function(err) {
      console.warn('[Sync] _handleConflict failed:', err.message);
      return null;
    });
  },

  /**
   * Flush pending changes (alias for push).
   */
  flush: function() {
    var params = new URLSearchParams(window.location.search);
    var pid = params.get('project');
    if (!pid) return Promise.resolve();
    return this.push(pid);
  },

  /**
   * Poll for remote changes (stub — full implementation in Phase 1-C).
   */
  poll: function() {
    console.log('[Sync] poll() — stub');
    return Promise.resolve();
  },

  startHeartbeat: function(intervalMs) {
    var self = this;
    this.stopHeartbeat();
    this._heartbeat = setInterval(function() {
      if (_online && _pendingSync) {
        self.flush();
      }
    }, intervalMs || 30000);
    console.log('[Sync] Heartbeat started');
  },

  stopHeartbeat: function() {
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
  },

  get isPending() { return _pendingSync; },
  get isOnline() { return _online; },

  // S126 Phase C — empty-array clobber guard diagnostics. Counts every fire
  // since module load; log holds the most recent 50 events. Read via
  // SyncEngine.diag.emptyArrayGuards (count) and SyncEngine.diag.emptyArrayLog
  // (recent fires). Phase D wires these into window._frt.diagnostics.sync.
  get diag() {
    return {
      emptyArrayGuards: _emptyArrayGuardFires,
      emptyArrayLog: _emptyArrayGuardLog.slice(),
      lastSeenUpdatedAt: _lastSeenUpdatedAt,
      instanceId: _instanceId,
      pendingSync: _pendingSync,
      online: _online
    };
  }
};

// S123 P6B — expose for diagnostic / dev console
if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
}
