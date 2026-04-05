/**
 * ARENCON FRT v2 — Data Model
 * ═══════════════════════════
 * 
 * Single source of truth for all project data.
 * Backward compatible with v1 JSON format.
 */

import { IDB } from './idb.js';

// ── Internal State ───────────────────────────────────────
var _project = null;
var _dirty = false;
var _saveTimer = null;
var _listeners = {};
var _autoSaveInterval = null;

var SAVE_DEBOUNCE_MS = 800;
var AUTO_SAVE_MS = 15000;

// ── Default Project Template ─────────────────────────────
function createNewProject(overrides) {
  var now = new Date().toISOString();
  var id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  var defaults = {
    id: id,
    info: {
      projectNumber: '', projectName: '', client: '', address: '',
      city: '', province: 'Ontario', dateOfIssue: '', scope: '',
      revision: 'A01', customFilename: '', dateModified: '',
      visitDate: new Date().toISOString().split('T')[0],
      inspectorName: '', weather: '', purpose: '', generalNotes: ''
    },
    status: 'draft',
    settings: { sketchesEnabled: false },
    contractors: [],
    generalDeficiencies: [],
    nextDeficNum: 1,
    drawings: [],
    photos: [],
    sketches: [],
    signatures: {
      sigInspectorName: '', sigInspectorDate: '', sigInspectorData: '',
      sigWitnessName: '', sigWitnessDate: '', sigWitnessData: ''
    },
    created: now,
    modified: now
  };

  if (overrides) {
    Object.keys(overrides).forEach(function(k) {
      if (k === 'info' && typeof overrides.info === 'object') {
        Object.assign(defaults.info, overrides.info);
      } else {
        defaults[k] = overrides[k];
      }
    });
  }
  return defaults;
}

// ── Smart Filename ───────────────────────────────────────
function buildSmartFilename(proj) {
  if (!proj || !proj.info) return 'Untitled Project';
  var parts = [];
  if (proj.info.projectNumber) parts.push(proj.info.projectNumber);
  if (proj.info.client) parts.push(proj.info.client);
  if (proj.info.projectName) parts.push(proj.info.projectName);
  if (proj.info.revision) parts.push(proj.info.revision);
  return parts.length ? parts.join(' \u2014 ') : 'Untitled Project';
}

// ── Debounced Save ───────────────────────────────────────
function _queueSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() { _saveToIDB(); }, SAVE_DEBOUNCE_MS);
}

function _saveToIDB() {
  if (!_project) return Promise.resolve();
  _project.modified = new Date().toISOString();
  return IDB.put('projects', _project).then(function(ok) {
    if (ok) {
      _dirty = false;
      Model._notify('saved', { id: _project.id });
    } else {
      console.warn('[Model] IDB save failed');
    }
  });
}

// ── Public API ───────────────────────────────────────────
export var Model = {

  getProject: function() { return _project; },

  setProject: function(proj) {
    if (!proj) { _project = null; _dirty = false; this._notify('project', null); return; }
    // Ensure all required fields exist (backward compat)
    if (!proj.info) proj.info = {};
    var tpl = createNewProject();
    Object.keys(tpl.info).forEach(function(k) {
      if (proj.info[k] === undefined) proj.info[k] = tpl.info[k];
    });
    if (!proj.contractors) proj.contractors = [];
    if (!proj.generalDeficiencies) proj.generalDeficiencies = [];
    if (!proj.drawings) proj.drawings = [];
    if (!proj.photos) proj.photos = [];
    if (!proj.nextDeficNum) proj.nextDeficNum = 1;
    if (!proj.status) proj.status = 'draft';
    if (!proj.id) proj.id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    _project = proj;
    _dirty = false;
    console.log('[Model] Project loaded:', buildSmartFilename(proj),
      '| contractors:', proj.contractors.length,
      '| drawings:', proj.drawings.length,
      '| deficiencies:', this.getAllDeficiencies(proj).length);
    this._notify('project', proj);
  },

  newProject: function(overrides) {
    var proj = createNewProject(overrides);
    this.setProject(proj);
    _dirty = true;
    _queueSave();
    return proj;
  },

  updateField: function(field, value) {
    if (!_project) return;
    if (!_project.info) _project.info = {};
    _project.info[field] = value;
    _dirty = true;
    _queueSave();
    this._notify('field', { field: field, value: value });
  },

  getSmartFilename: function() { return buildSmartFilename(_project); },

  getAllDeficiencies: function(proj) {
    if (!proj) proj = _project;
    if (!proj) return [];
    var all = [];
    (proj.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(function(d) {
        all.push({ defic: d, contractorName: c.name, contractorId: c.id });
      });
    });
    (proj.generalDeficiencies || []).forEach(function(d) {
      all.push({ defic: d, contractorName: 'Site General', contractorId: null });
    });
    all.sort(function(a, b) { return a.defic.num - b.defic.num; });
    return all;
  },

  findDeficiency: function(deficId, proj) {
    if (!proj) proj = _project;
    if (!proj) return null;
    for (var i = 0; i < (proj.contractors || []).length; i++) {
      var c = proj.contractors[i];
      for (var j = 0; j < (c.deficiencies || []).length; j++) {
        if (c.deficiencies[j].id === deficId)
          return { defic: c.deficiencies[j], contractor: c, arr: c.deficiencies, idx: j };
      }
    }
    for (var k = 0; k < (proj.generalDeficiencies || []).length; k++) {
      if (proj.generalDeficiencies[k].id === deficId)
        return { defic: proj.generalDeficiencies[k], contractor: null, arr: proj.generalDeficiencies, idx: k };
    }
    return null;
  },

  getDrawings: function() { return _project ? (_project.drawings || []) : []; },
  getSitePhotos: function() { return _project ? (_project.photos || []) : []; },
  hasUnsavedChanges: function() { return _dirty; },

  saveNow: function() {
    if (_saveTimer) clearTimeout(_saveTimer);
    return _saveToIDB();
  },

  loadFromIDB: function(projectId) {
    var self = this;
    return IDB.get('projects', projectId).then(function(proj) {
      if (proj) { self.setProject(proj); return true; }
      return false;
    });
  },

  loadLastProject: function() {
    var self = this;
    return IDB.getAll('projects').then(function(all) {
      if (all.length === 0) return false;
      all.sort(function(a, b) {
        return (b.modified || b.created || '').localeCompare(a.modified || a.created || '');
      });
      self.setProject(all[0]);
      return true;
    });
  },

  startAutoSave: function() {
    this.stopAutoSave();
    _autoSaveInterval = setInterval(function() {
      if (_dirty && _project) _saveToIDB();
    }, AUTO_SAVE_MS);
  },

  stopAutoSave: function() {
    if (_autoSaveInterval) { clearInterval(_autoSaveInterval); _autoSaveInterval = null; }
  },

  onChange: function(type, cb) {
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(cb);
  },

  _notify: function(type, data) {
    (_listeners[type] || []).forEach(function(cb) {
      try { cb(type, data); } catch (e) { console.error('[Model] Listener error:', e); }
    });
    (_listeners['*'] || []).forEach(function(cb) {
      try { cb(type, data); } catch (e) { console.error('[Model] Listener error:', e); }
    });
  }
};
