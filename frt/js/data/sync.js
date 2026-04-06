/**
 * ARENCON FRT v2 — Sync Engine
 * ════════════════════════════
 * 
 * Loads/saves project data from Supabase tool_data table.
 * Backward compatible with v1 CloudSync format.
 */

import { Auth } from '../shared/auth.js';
import { Model } from './model.js';

var _instanceId = null;
var _instanceNumber = 1;
var _toolKey = 'frt';

export var SyncEngine = {

  get instanceId() { return _instanceId; },
  get instanceNumber() { return _instanceNumber; },

  /**
   * Pull project data from Supabase.
   * Reads from tool_data table (v1 format — single blob per project/tool/instance).
   */
  pull: function(projectId, instanceId) {
    var path;
    if (instanceId) {
      path = '/rest/v1/tool_data?select=*&id=eq.' + instanceId;
    } else {
      path = '/rest/v1/tool_data?select=*&project_id=eq.' + projectId + '&tool_key=eq.' + _toolKey + '&order=updated_at.desc&limit=1';
    }

    return Auth.request(path).then(function(rows) {
      if (!rows || !rows.length) {
        console.log('[Sync] No cloud data found for project:', projectId);
        return null;
      }

      var row = rows[0];
      _instanceId = row.id;
      _instanceNumber = row.instance_number || 1;

      var data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (data) {
        Model.setProject(data);
        console.log('[Sync] Loaded from cloud — instance:', _instanceId, 'updated:', row.updated_at);
        return data;
      }
      return null;
    }).catch(function(err) {
      console.warn('[Sync] Pull failed:', err.message);
      return null;
    });
  },

  /**
   * Push current project state to Supabase.
   */
  push: function(projectId) {
    var proj = Model.getProject();
    if (!proj) return Promise.resolve(null);

    // Strip binary data before pushing
    var data = JSON.parse(JSON.stringify(proj));
    (data.drawings || []).forEach(function(d) {
      delete d.dataUrl; delete d.dataBlob; delete d.thumb; delete d._hasLocalBlob;
      delete d.markupObjects; delete d.markupData;
    });
    (data.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });

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
    if (_instanceId) {
      method = 'PATCH';
      path = '/rest/v1/tool_data?id=eq.' + _instanceId;
    } else {
      method = 'POST';
      path = '/rest/v1/tool_data';
      payload.created_by = user ? user.id : null;
      payload.status = 'draft';
      payload = [payload];
    }

    return Auth.request(path, {
      method: method,
      body: method === 'POST' ? payload : payload,
      headers: { 'Prefer': 'return=representation' }
    }).then(function(rows) {
      if (rows && rows.length > 0) {
        _instanceId = rows[0].id;
        _instanceNumber = rows[0].instance_number;
        console.log('[Sync] Pushed to cloud — instance:', _instanceId);
        return rows[0];
      }
      return null;
    }).catch(function(err) {
      console.warn('[Sync] Push failed:', err.message);
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
    console.log('[Sync] startHeartbeat() — stub');
  },

  stopHeartbeat: function() {
    console.log('[Sync] stopHeartbeat() — stub');
  }
};
