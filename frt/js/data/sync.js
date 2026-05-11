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
import { merge3 } from './merge.js';

var SUPABASE_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgwMzAwODcsImV4cCI6MjA2MzYwNjA4N30.MOEcA_GeXX-Vk4iVidzZ23s_QkXkXOFXupY02tDtfJI';

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
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }, opts.headers || {});

  return fetch(SUPABASE_URL + path, {
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
      return Auth.request(path);
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
        // S123 P6B — snapshot for 3-way merge. Deep clone so later edits
        // to Model.getProject() don't mutate this reference.
        _lastSeenSnapshot = JSON.parse(JSON.stringify(data));
        Model.setProject(data);
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

    // Strip binary data before pushing (same as before)
    var data = JSON.parse(JSON.stringify(proj));
    (data.drawings || []).forEach(function(d) {
      delete d.dataUrl; delete d.dataBlob; delete d.thumb; delete d._hasLocalBlob;
      delete d.markupObjects; delete d.markupData;
    });
    (data.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
    if (data.signatures) {
      delete data.signatures.sigInspectorData;
      delete data.signatures.sigWitnessData;
    }
    (data.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(function(d) {
        (d.observations || []).forEach(function(o) {
          (o.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
        });
        (d.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
      });
    });
    (data.generalDeficiencies || []).forEach(function(d) {
      (d.observations || []).forEach(function(o) {
        (o.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
      });
      (d.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
    });

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
        return rows[0];
      }
      return null;
    }).catch(function(err) {
      console.warn('[Sync] Push failed:', err.message);
      _pendingSync = true;
      return null;
    });
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

      // Run 3-way merge: base = _lastSeenSnapshot, mine = localProj, theirs = cloudData
      var mergeResult;
      try {
        mergeResult = merge3(_lastSeenSnapshot, localProj, cloudData);
      } catch (e) {
        console.error('[Sync] merge3 threw — abandoning push:', e);
        return null;
      }

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
        Model.applyMerged(mergeResult.merged);
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
        return self.push(projectId, attempt + 1);
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
  get isOnline() { return _online; }
};

// S123 P6B — expose for diagnostic / dev console
if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
}
