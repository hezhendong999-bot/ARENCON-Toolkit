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
var _undoStack = [];
var _listeners = {};
var _autoSaveInterval = null;

// S83: Inspector attribution state.
// app.js boot captures Auth.getUser() and pushes id here via Model.setCurrentUser(id).
// Every new entity is stamped with this id as createdBy. Never mutated after creation.
var _currentUserId = null;

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
  if (!proj || !proj.info) return 'Untitled';
  var p = proj;
  // Format: {ProjNo} {ClientAbbrev} {StreetNum} {Street} {Building/Location} {ScopeAbbrev} {Revision}
  // Example: 1490.04 IM 610 Sprucewood Attic Space Sprkl Upgrade A01
  var parts = [];
  if (p.info.projectNumber) parts.push(p.info.projectNumber.trim());
  if (p.info.client) {
    var c = p.info.client.trim().replace(/\s*[\(\)\.]/g, ' ').replace(/\s+/g, ' ').trim();
    var cWords = c.split(/\s+/).filter(function(w) { return w.length > 0; });
    if (cWords.length) {
      if (cWords[0].length <= 5 && /^[A-Z]+$/.test(cWords[0])) { parts.push(cWords[0]); }
      else if (cWords.indexOf('&') > 0 && cWords.indexOf('&') < cWords.length - 1) {
        var ai = cWords.indexOf('&');
        parts.push(cWords[ai - 1].charAt(0).toUpperCase() + '&' + cWords[ai + 1].charAt(0).toUpperCase());
      } else {
        var suffixes = /^(Limited|Ltd|Inc|Incorporated|Co|Company|LLC|LLP)$/i;
        var real = cWords.filter(function(w) { return !suffixes.test(w); });
        if (!real.length) real = cWords;
        if (real.length === 1) parts.push(real[0]);
        else parts.push(real.map(function(w) { return w.charAt(0).toUpperCase(); }).join(''));
      }
    }
  }
  if (p.info.address) {
    var am = p.info.address.trim().match(/^(\d+)\s+(\S+)/);
    if (am) parts.push(am[1] + ' ' + am[2].replace(/[.,]$/, ''));
  }
  if (p.info.projectName) {
    var raw = p.info.projectName.trim();
    var fpPattern = /\b(Sprinkler|Fire Alarm|Standpipe|Suppression|Protection|Installation|Inspection|Testing|Commissioning|Modification|Upgrade|Retrofit|Replacement|Assessment|Review)\b/gi;
    var scopeWords = []; var match;
    while ((match = fpPattern.exec(raw)) !== null) scopeWords.push(match[0]);
    var firstFpIdx = raw.search(/\b(Sprinkler|Fire Alarm|Standpipe|Suppression|Protection|Installation|Inspection|Testing|Commissioning|Modification|Upgrade|Retrofit|Replacement|Assessment|Review)\b/i);
    var building = firstFpIdx > 0 ? raw.substring(0, firstFpIdx).trim() : '';
    building = building.replace(/^(for|the|at|of|and|&)\s+/i, '').replace(/\s*[&,]\s*$/, '').replace(/\bAutomatic\b/i, '').replace(/\bSystem\b/i, '').trim();
    var bWords = building.split(/\s+/).filter(function(w) { return w.length > 0; });
    if (bWords.length > 3) bWords = bWords.slice(0, 3);
    if (bWords.length) parts.push(bWords.join(' '));
    if (scopeWords.length) {
      var abbrev = scopeWords.map(function(w) {
        return w.replace(/Sprinkler/i, 'Sprkl').replace(/Fire Alarm/i, 'FA')
          .replace(/Standpipe/i, 'Stdp').replace(/Suppression/i, 'Supp')
          .replace(/Protection/i, 'Prot').replace(/Installation/i, 'Install')
          .replace(/Inspection/i, 'Insp').replace(/Testing/i, 'Test')
          .replace(/Commissioning/i, 'Comm').replace(/Modification/i, 'Mod')
          .replace(/Assessment/i, 'Assess').replace(/Review/i, 'Review');
      }).join(' ');
      parts.push(abbrev);
    } else if (!building) {
      parts.push(raw.split(/\s+/).slice(0, 3).join(' '));
    }
  }
  parts.push(p.info.revision || 'A01');
  return parts.join(' ').replace(/[^a-zA-Z0-9 ._&-]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
}

// ── Debounced Save ───────────────────────────────────────
function _queueSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() { _saveToIDB(); }, SAVE_DEBOUNCE_MS);
}

function _saveToIDB() {
  if (!_project) return Promise.resolve();
  _project.modified = new Date().toISOString();
  // S115 P11: strip blob: URLs from dataUrl before persisting. Blob URLs are
  // session-scoped — on page reload they become invalid. If we leave them
  // in IDB, render code that checks dataUrl first will get a 404. The
  // in-memory project keeps the blob URLs (we deep-clone for IDB).
  var snapshot = _stripBlobUrls(_project);
  return IDB.put('projects', snapshot).then(function(ok) {
    if (ok) {
      _dirty = false;
      Model._notify('saved', { id: _project.id });
    } else {
      console.warn('[Model] IDB save failed');
    }
  });
}

// S115 P11: deep-clone a project + remove blob: URLs from any photo dataUrl.
// Cheap because blob URLs are short strings; we don't strip image bytes.
function _stripBlobUrls(proj) {
  if (!proj) return proj;
  var copy;
  try { copy = JSON.parse(JSON.stringify(proj)); }
  catch(e) { return proj; } // fallback: persist as-is rather than lose data
  function _scrub(arr) {
    (arr || []).forEach(function(p) {
      if (p && typeof p.dataUrl === 'string' && p.dataUrl.indexOf('blob:') === 0) {
        delete p.dataUrl;
      }
    });
  }
  _scrub(copy.photos);
  _scrub(copy.sitePhotos);
  (copy.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(function(d) {
      _scrub(d.photos);
      (d.observations || []).forEach(function(o) { _scrub(o.photos); });
      (d.entries || []).forEach(function(e) { _scrub(e.photos); });
    });
  });
  (copy.generalDeficiencies || []).forEach(function(d) {
    _scrub(d.photos);
    (d.observations || []).forEach(function(o) { _scrub(o.photos); });
    (d.entries || []).forEach(function(e) { _scrub(e.photos); });
  });
  return copy;
}

// ── S115: Drawing auto-dedup (ported from v1) ────────────────
// v1 logic: keep first occurrence, drop later duplicates by name.
// v2 enhancement: folder-scoped (folder|name) so the same name in
// different folders is NOT treated as a duplicate. Returns the
// number of drawings that were removed. Idempotent and safe to
// call repeatedly. Pure function — does not save or notify.
function _autoDedup(proj) {
  if (!proj || !proj.drawings || proj.drawings.length < 2) return 0;
  var seen = {}, keep = [];
  proj.drawings.forEach(function(d) {
    var folderKey = (d.folder || '').trim().toLowerCase();
    var nameKey   = (d.name   || '').trim().toLowerCase();
    var key = folderKey + '|' + nameKey;
    if (!seen[key]) {
      seen[key] = true;
      keep.push(d);
    }
  });
  var removed = proj.drawings.length - keep.length;
  if (removed > 0) proj.drawings = keep;
  return removed;
}

// ── Public API ───────────────────────────────────────────
export var Model = {

  getProject: function() { return _project; },

  setProject: function(proj) {
    if (!proj) { _project = null; _dirty = false; this._notify('project', null); return; }

    // ── S114: V1→V2 normalization (one-shot, idempotent) ──
    // Audited safe in S114 against 3 real projects: Sprucewood, Sun Pharma, Caplink.
    // Migrates: sitePhotos→photos, entries[]→observations[], drops empty responses[],
    // drops legacy d.description scalar (content now lives in observations[0].text).
    // Provably no data loss: no per-entry contractorId set anywhere; entries and
    // observations contents are pure mirrors when both exist; all responses[]
    // arrays in audit were empty placeholders.
    if (proj.sitePhotos && (!proj.photos || !proj.photos.length)) {
      proj.photos = proj.sitePhotos;
    }
    delete proj.sitePhotos;

    var _migInst = proj.currentFrtInstance || 1;
    var _migToday = new Date().toISOString().split('T')[0];
    function _migrateDeficArr(arr) {
      (arr || []).forEach(function(d) {
        if ((!d.observations || !d.observations.length) && d.entries && d.entries.length) {
          d.observations = d.entries.map(function(e, i) {
            return {
              id: 'obs_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 4),
              text: e.description || e.text || '',
              photos: e.photos || [],
              notedOnInstance: d.notedOnInstance || _migInst,
              notedDate: d.notedDate || _migToday,
              addressed: e._addressed || false,
              createdBy: d.createdBy || null
            };
          });
        }
        delete d.entries;
        delete d.responses;
        // Promote legacy d.description into observations[0].text if obs has empty
        // text and description had content (defensive for future legacy data).
        if (d.description && d.observations && d.observations.length && !d.observations[0].text) {
          d.observations[0].text = d.description;
        }
        delete d.description;
        // ── S119: per-observation priority + addressed metadata backfill ──
        // Idempotent. Each obs gets its own priority (defaults to pin-level
        // priority if missing) so the pin editor's priority buttons can mutate
        // a single observation independently. Pin-level d.priority is kept as
        // a "last bulk-set" snapshot but is no longer the source of truth for
        // rendering — getEffectivePriority(d) reads from obs.
        // Also backfills addressedOnInstance/addressedDate so previously
        // closed observations get correctly filtered against currentFrtInstance.
        (d.observations || []).forEach(function(o) {
          if (o.priority === undefined) o.priority = d.priority || 'high';
          if (o.addressed && o.addressedOnInstance === undefined) {
            o.addressedOnInstance = d.closedOnInstance || _migInst;
            o.addressedDate = d.closedDate || _migToday;
          }
        });
        // ── S120: photo pool migration (one-shot, idempotent) ──
        // Bulk-migrate legacy obs.photos[] into defic.photos[] pool, preserve
        // per-obs visibility via obs.photoSelection. Markup state attached to
        // a photo record (markedR2Key/markupOverlay) becomes an entry in
        // obs.photoMarkups[poolPhotoId] = { markedR2Key, markupOverlay }.
        //
        // Idempotence: a defic is considered already-migrated if it has
        // _photoPoolMigrated === true. Set on first run; subsequent loads
        // (cloud pull, re-open, etc.) skip the work.
        //
        // Backward compat: legacy obs.photos[] arrays are NOT deleted. They
        // remain as a silent backup so the data is recoverable if anything
        // ever proves wrong with the new model. NEW uploads go ONLY to the
        // pool; legacy obs.photos[] arrays are frozen at migration time.
        if (!d._photoPoolMigrated) {
          if (!Array.isArray(d.photos)) d.photos = [];
          // Index existing pool entries so re-runs and partial migrations
          // don't create duplicates. Prefer r2Key (canonical source identity)
          // then fall back to legacy id.
          var _poolByR2 = {};
          var _poolById = {};
          (d.photos || []).forEach(function(p) {
            if (p && p.r2Key) _poolByR2[p.r2Key] = p;
            if (p && p.id) _poolById[p.id] = p;
          });
          (d.observations || []).forEach(function(o) {
            if (!o || !o.photos || !o.photos.length) return;
            if (Array.isArray(o.photoSelection)) return; // obs already migrated
            if (!o.photoMarkups) o.photoMarkups = {};
            var _sel = [];
            o.photos.forEach(function(ph) {
              if (!ph) return;
              var _existing = (ph.r2Key && _poolByR2[ph.r2Key])
                           || (ph.id && _poolById[ph.id])
                           || null;
              if (!_existing) {
                // Pool entry is the source-of-truth source photo; markup state
                // is intentionally NOT stored here (it lives per-obs).
                var _poolEntry = {
                  id: ph.id || ('ph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
                  r2Key: ph.r2Key || null,
                  sourceR2Key: ph.sourceR2Key || ph.r2Key || null,
                  dataUrl: ph.dataUrl || null,
                  thumb: ph.thumb || null,
                  filename: ph.filename || null,
                  addedDate: ph.addedDate || _migToday,
                  createdBy: ph.createdBy || null
                };
                d.photos.push(_poolEntry);
                if (_poolEntry.r2Key) _poolByR2[_poolEntry.r2Key] = _poolEntry;
                _poolById[_poolEntry.id] = _poolEntry;
                _existing = _poolEntry;
              }
              _sel.push(_existing.id);
              // Transfer markup state to obs.photoMarkups (keyed by pool id)
              if (ph.markedR2Key || ph.markupOverlay) {
                o.photoMarkups[_existing.id] = {
                  markedR2Key: ph.markedR2Key || null,
                  markupOverlay: ph.markupOverlay || null
                };
              }
            });
            o.photoSelection = _sel;
            // o.photos[] is intentionally left intact as silent backup.
          });
          d._photoPoolMigrated = true;
        }
      });
    }
    (proj.contractors || []).forEach(function(c) { _migrateDeficArr(c.deficiencies); });
    _migrateDeficArr(proj.generalDeficiencies);

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

    // ── S115: drawing auto-dedup (port from v1) ──
    // Defensive cleanup for projects loaded from IDB / cloud / pull where the
    // drawings array contains duplicates. v1 ran this in 3 cloud-merge spots;
    // v2's setProject is the single funnel for every load path so one call
    // here covers all of them. Folder-scoped to respect v2's folder model
    // (two drawings with the same name in different folders are NOT duplicates).
    var _dedupRemoved = _autoDedup(proj);
    if (_dedupRemoved > 0) {
      console.log('[Model] AutoDedup: removed ' + _dedupRemoved + ' duplicate drawing(s) (' + proj.drawings.length + ' remaining)');
    }

    _project = proj;
    _dirty = false;
    console.log('[Model] Project loaded:', buildSmartFilename(proj),
      '| contractors:', proj.contractors.length,
      '| drawings:', proj.drawings.length,
      '| deficiencies:', this.getAllDeficiencies(proj).length);
    this._notify('project', proj);
    // If dedup actually removed something, mark dirty so it gets persisted on next save.
    if (_dedupRemoved > 0) { _dirty = true; _queueSave(); }
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

  // ── Contractor Mutations ─────────────────────────────
  addContractor: function(name) {
    if (!_project) return null;
    var ctr = {
      id: 'ctr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: name || 'New Contractor',
      deficiencies: []
    };
    _project.contractors.push(ctr);
    _dirty = true;
    _queueSave();
    this._notify('contractor', { action: 'add', contractor: ctr });
    return ctr;
  },

  removeContractor: function(ctrId) {
    if (!_project) return;
    var idx = _project.contractors.findIndex(function(c) { return c.id === ctrId; });
    if (idx >= 0) {
      _project.contractors.splice(idx, 1);
      _dirty = true;
      _queueSave();
      this._notify('contractor', { action: 'remove', id: ctrId });
    }
  },

  // S116 Push 5: rename a contractor in place. Pins reference contractors by
  // id (not by name), so the rename takes effect everywhere automatically —
  // defic cards, summary tab, PDF export grouping, etc. all re-render with
  // the new name on the next render cycle. Name is trimmed; empty names
  // are rejected (returns false).
  renameContractor: function(ctrId, newName) {
    if (!_project) return false;
    var trimmed = (newName || '').trim();
    if (!trimmed) return false;
    var ctr = (_project.contractors || []).find(function(c) { return c.id === ctrId; });
    if (!ctr) return false;
    if (ctr.name === trimmed) return true; // no-op, treat as success
    ctr.name = trimmed;
    _dirty = true;
    _queueSave();
    this._notify('contractor', { action: 'rename', id: ctrId, name: trimmed });
    return true;
  },

  // S116 Push 5: delete a contractor AND reassign its deficiencies to
  // Site General (instead of orphaning them, which is what removeContractor
  // by itself would do). Returns the count of deficiencies reassigned.
  deleteContractorAndReassign: function(ctrId) {
    if (!_project) return 0;
    var idx = _project.contractors.findIndex(function(c) { return c.id === ctrId; });
    if (idx < 0) return 0;
    var ctr = _project.contractors[idx];
    var moved = (ctr.deficiencies || []).slice(); // shallow copy
    if (!_project.generalDeficiencies) _project.generalDeficiencies = [];
    moved.forEach(function(d) { _project.generalDeficiencies.push(d); });
    _project.contractors.splice(idx, 1);
    _dirty = true;
    _queueSave();
    this._notify('contractor', { action: 'remove', id: ctrId, reassigned: moved.length });
    return moved.length;
  },

  // ── Deficiency Mutations ─────────────────────────────
  addDeficiency: function(ctrId) {
    if (!_project) return null;
    var inst = (_project.currentFrtInstance) || 1;
    var today = new Date().toISOString().split('T')[0];
    var num = _project.nextDeficNum || 1;
    _project.nextDeficNum = num + 1;

    var defic = {
      id: 'def_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      num: num,
      status: 'open',
      priority: 'general',
      category: '',
      drawingId: null,
      pinX: null, pinY: null,
      date: today,
      notedDate: today,
      notedOnInstance: inst,
      createdBy: _currentUserId || null,   // S83: inspector attribution
      observations: [{
        id: 'obs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        text: '',
        photos: [],
        notedOnInstance: inst,
        notedDate: today,
        addressed: false,
        priority: 'high',                    // S119: per-obs priority
        createdBy: _currentUserId || null   // S83
      }],
      photos: [],
      activity: []
    };

    if (ctrId) {
      var ctr = _project.contractors.find(function(c) { return c.id === ctrId; });
      if (ctr) {
        if (!ctr.deficiencies) ctr.deficiencies = [];
        ctr.deficiencies.push(defic);
      }
    } else {
      if (!_project.generalDeficiencies) _project.generalDeficiencies = [];
      _project.generalDeficiencies.push(defic);
    }

    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'add', defic: defic, ctrId: ctrId });
    return defic;
  },

  updateObservation: function(deficId, obsIdx, text) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    var obs = f.defic.observations || f.defic.entries;
    if (!obs || !obs[obsIdx]) return;
    if (f.defic.observations) f.defic.observations[obsIdx].text = text;
    else if (f.defic.entries) f.defic.entries[obsIdx].description = text;
    _dirty = true;
    _queueSave();
  },

  updateDeficStatus: function(deficId, newStatus) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    var oldStatus = f.defic.status;
    f.defic.status = newStatus;

    // If closing, record closure metadata
    if ((newStatus === 'closed' || newStatus === 'Addressed & Closed') &&
        oldStatus !== 'closed' && oldStatus !== 'Addressed & Closed') {
      f.defic.closedDate = new Date().toISOString().split('T')[0];
      f.defic.closedOnInstance = (_project && _project.currentFrtInstance) || 1;
    }
    // If reopening, clear closure metadata
    if ((newStatus === 'open' || newStatus === 'Outstanding') &&
        (oldStatus === 'closed' || oldStatus === 'Addressed & Closed')) {
      f.defic.closedDate = null;
      f.defic.closedOnInstance = null;
    }

    // S119: pin-level status change is a "bulk" action — propagate to every
    // observation. Keeps per-obs addressed flags in sync with the pin-level
    // intent, and writes per-obs addressedDate / addressedOnInstance so the
    // PDF filter and per-obs UI both see the closure consistently.
    var nowClosed = newStatus === 'closed' || newStatus === 'Addressed & Closed';
    var inst = (_project && _project.currentFrtInstance) || 1;
    var today = new Date().toISOString().split('T')[0];
    if (f.defic.observations && f.defic.observations.length) {
      f.defic.observations.forEach(function(o) {
        o.addressed = nowClosed;
        if (nowClosed) {
          if (!o.addressedDate) o.addressedDate = today;
          if (!o.addressedOnInstance) o.addressedOnInstance = inst;
        } else {
          o.addressedDate = null;
          o.addressedOnInstance = null;
        }
      });
    }

    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'status', deficId: deficId, status: newStatus });
  },

  updateDeficPriority: function(deficId, priority) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    f.defic.priority = priority;
    _dirty = true;
    _queueSave();
  },

  addObservation: function(deficId) {
    var f = this.findDeficiency(deficId);
    if (!f) return null;
    var inst = (_project && _project.currentFrtInstance) || 1;
    var today = new Date().toISOString().split('T')[0];
    // S119: new obs inherits priority from existing obs (effective) or pin level.
    // Falls back to 'high' so a new obs on a fresh pin stays the strongest signal.
    var inheritPri = this.getEffectivePriority(f.defic) || f.defic.priority || 'high';
    var obs = {
      id: 'obs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      text: '',
      photos: [],
      notedOnInstance: inst,
      notedDate: today,
      addressed: false,
      priority: inheritPri,                // S119: per-obs priority
      createdBy: _currentUserId || null  // S83
    };
    if (!f.defic.observations) f.defic.observations = [];
    f.defic.observations.push(obs);
    _dirty = true;
    _queueSave();
    this._notify('observation', { action: 'add', deficId: deficId, obs: obs });
    return obs;
  },

  removeObservation: function(deficId, obsIdx) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    var obs = f.defic.observations || [];
    if (obs.length <= 1) return; // Never remove the last observation
    if (obsIdx < 0 || obsIdx >= obs.length) return;
    obs.splice(obsIdx, 1);
    _dirty = true;
    _queueSave();
    this._notify('observation', { action: 'remove', deficId: deficId, obsIdx: obsIdx });
  },

  // S116 Push 2: split one observation off a multi-obs deficiency into its
  // own brand-new pin. New pin inherits drawingId + pinX/pinY + priority +
  // notedDate from the source. Contractor: per-obs override (obs.contractorId)
  // wins, otherwise the source pin's contractor. The user typically drags
  // the new pin somewhere visible afterwards since it starts overlapping the
  // source. Returns the new defic on success, or null if invalid input
  // (single-obs pins can't be split — there'd be nothing left).
  splitObservationToPin: function(sourceDeficId, obsIdx) {
    var f = this.findDeficiency(sourceDeficId);
    if (!f) return null;
    var src = f.defic;
    var srcObs = src.observations || [];
    if (srcObs.length <= 1) return null; // need at least 2 obs to split
    if (obsIdx < 0 || obsIdx >= srcObs.length) return null;

    // The obs being extracted. Deep-copy so subsequent edits don't bleed
    // back into the source.
    var extracted = JSON.parse(JSON.stringify(srcObs[obsIdx]));

    // Determine target contractor — per-obs override beats pin contractor.
    var targetCtrId = extracted.contractorId || (f.contractor ? f.contractor.id : null);

    // Create the new deficiency under that contractor (or Site General).
    var newDefic = this.addDeficiency(targetCtrId);
    if (!newDefic) return null;

    // Carry over geometry + state. New defic's notedDate matches source so
    // it groups with the same visit in the gallery / day view.
    newDefic.drawingId = src.drawingId || null;
    newDefic.pinX = src.pinX != null ? src.pinX : null;
    newDefic.pinY = src.pinY != null ? src.pinY : null;
    newDefic.priority = extracted.priority || src.priority || 'high';
    if (src.notedDate) newDefic.notedDate = src.notedDate;
    if (src.date) newDefic.date = src.date;
    // Per-obs override is now redundant on the moved obs (it IS the pin).
    delete extracted.contractorId;
    newDefic.observations = [extracted];
    // Status defaults to 'open' (addDeficiency sets that).

    // Remove the obs from the source.
    srcObs.splice(obsIdx, 1);

    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'split', sourceId: sourceDeficId, newId: newDefic.id });
    this._notify('observation', { action: 'remove', deficId: sourceDeficId, obsIdx: obsIdx });
    return newDefic;
  },

  toggleObsAddressed: function(deficId, obsIdx) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    var obs = f.defic.observations || [];
    if (!obs[obsIdx]) return;
    var inst = (_project && _project.currentFrtInstance) || 1;
    var today = new Date().toISOString().split('T')[0];
    obs[obsIdx].addressed = !obs[obsIdx].addressed;
    // S119: track per-obs closure metadata so the PDF filter can hide obs that
    // were addressed in earlier FRT instances (mirrors pin-level closedDate /
    // closedOnInstance pattern). Clear on reopen.
    if (obs[obsIdx].addressed) {
      obs[obsIdx].addressedDate = today;
      obs[obsIdx].addressedOnInstance = inst;
    } else {
      obs[obsIdx].addressedDate = null;
      obs[obsIdx].addressedOnInstance = null;
    }
    // S119: keep pin-level d.status mirrored to effective status so legacy
    // readers (UI badges, summary tabs that haven't migrated yet) stay coherent.
    var eff = this.getEffectiveStatus(f.defic);
    if (eff === 'closed' && f.defic.status !== 'closed' && f.defic.status !== 'Addressed & Closed') {
      f.defic.status = 'closed';
      f.defic.closedDate = today;
      f.defic.closedOnInstance = inst;
    } else if (eff === 'open' && (f.defic.status === 'closed' || f.defic.status === 'Addressed & Closed')) {
      f.defic.status = 'open';
      f.defic.closedDate = null;
      f.defic.closedOnInstance = null;
    }
    _dirty = true;
    _queueSave();
    this._notify('observation', { action: 'addressed', deficId: deficId, obsIdx: obsIdx });
  },

  // S119: per-observation priority mutation. Pin-level d.priority is left
  // alone (kept as a "last bulk-set" snapshot for legacy compatibility);
  // renderers use getEffectivePriority(d) to derive the pin-level color.
  updateObsPriority: function(deficId, obsIdx, priority) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    var obs = f.defic.observations || [];
    if (!obs[obsIdx]) return;
    obs[obsIdx].priority = priority;
    _dirty = true;
    _queueSave();
    this._notify('observation', { action: 'priority', deficId: deficId, obsIdx: obsIdx, priority: priority });
  },

  // S119: effective pin priority — highest priority across all observations.
  // Order: high > low > general. Falls back to pin-level d.priority for
  // legacy/empty-obs cases. Used by pin marker color, deficiency tab business
  // logic (priority-driven contractor reassignment), and the PDF minimap
  // teardrop color (all of which describe the pin as a whole, not one obs).
  getEffectivePriority: function(d) {
    if (!d) return 'high';
    var obs = (d.observations && d.observations.length) ? d.observations : null;
    if (!obs) return d.priority || 'high';
    var hasHigh = false, hasLow = false, hasGen = false;
    for (var i = 0; i < obs.length; i++) {
      var p = obs[i].priority || d.priority || 'high';
      if (p === 'high') hasHigh = true;
      else if (p === 'low') hasLow = true;
      else if (p === 'general') hasGen = true;
    }
    if (hasHigh) return 'high';
    if (hasLow) return 'low';
    if (hasGen) return 'general';
    return d.priority || 'high';
  },

  // S119: effective pin status — 'closed' iff every observation is addressed.
  // Falls back to pin-level d.status for legacy/empty-obs cases. The PDF filter
  // and tab badges use this so a pin with mixed addressed/open obs still
  // renders as Outstanding and shows on the report.
  getEffectiveStatus: function(d) {
    if (!d) return 'open';
    var obs = (d.observations && d.observations.length) ? d.observations : null;
    if (!obs) {
      return (d.status === 'closed' || d.status === 'Addressed & Closed') ? 'closed' : 'open';
    }
    for (var i = 0; i < obs.length; i++) {
      if (!obs[i].addressed) return 'open';
    }
    return 'closed';
  },

  // ── S120: photo pool read helpers ──
  // Pool model: defic.photos[] = source pool; obs.photoSelection = null
  // (default = all pool) OR array of pool photo IDs (custom subset);
  // obs.photoMarkups[poolPhotoId] = per-(obs, photo) markup state.

  // Returns the effective photo list for a given obs, drawn from the
  // defic-level pool. Soft-deleted photos (deleted: true) are filtered
  // out everywhere. Legacy fallback: if pool is empty AND obs.photos has
  // entries (never-migrated edge case), returns obs.photos[].
  getEffectivePhotos: function(defic, obsIdx) {
    if (!defic) return [];
    var obs = (defic.observations || [])[obsIdx];
    if (!obs) return [];
    var pool = (defic.photos || []).filter(function(p) { return p && !p.deleted; });
    // Legacy fallback: never-migrated, has obs.photos but no pool
    if (!pool.length && obs.photos && obs.photos.length) {
      return obs.photos.slice();
    }
    if (obs.photoSelection === null || obs.photoSelection === undefined) {
      return pool; // default = all pool photos
    }
    if (!Array.isArray(obs.photoSelection)) return pool;
    var idSet = {};
    obs.photoSelection.forEach(function(id) { idSet[id] = true; });
    // Preserve pool ordering (stable display) while filtering
    return pool.filter(function(p) { return idSet[p.id]; });
  },

  // Returns the markup state for an (obs, pool photo) pair, or null.
  // { markedR2Key, markupOverlay } when present.
  getObsPhotoMarkup: function(defic, obsIdx, photoId) {
    if (!defic) return null;
    var obs = (defic.observations || [])[obsIdx];
    if (!obs || !obs.photoMarkups) return null;
    return obs.photoMarkups[photoId] || null;
  },

  // True iff the obs has explicitly narrowed its selection (vs. default = all).
  // Used for the "• custom" tab indicator and the orphan-warning logic.
  isObsPhotoSelectionCustom: function(defic, obsIdx) {
    if (!defic) return false;
    var obs = (defic.observations || [])[obsIdx];
    if (!obs) return false;
    return Array.isArray(obs.photoSelection);
  },

  // Returns the set of obs indices that reference a given pool photo via
  // their photoSelection (default-state obs are included implicitly because
  // they show all pool photos). Used by the selection-mode dot rendering
  // and by the orphan-warning detector.
  getObsIndicesUsingPoolPhoto: function(defic, photoId) {
    var out = [];
    if (!defic) return out;
    (defic.observations || []).forEach(function(o, i) {
      if (!Array.isArray(o.photoSelection)) {
        out.push(i); // default-state obs uses every pool photo
      } else if (o.photoSelection.indexOf(photoId) !== -1) {
        out.push(i);
      }
    });
    return out;
  },

  addActivityEntry: function(deficId, label, text, obsRef) {
    var f = this.findDeficiency(deficId);
    if (!f) return null;
    var inst = (_project && _project.currentFrtInstance) || 1;
    var today = new Date().toISOString().split('T')[0];
    var entry = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      date: today,
      label: label || 'ARENCON',
      text: text || '',
      photos: [],
      instance: inst,
      obsRef: obsRef || null,
      autoGenerated: false
    };
    if (!f.defic.activity) f.defic.activity = [];
    f.defic.activity.push(entry);
    _dirty = true;
    _queueSave();
    this._notify('activity', { action: 'add', deficId: deficId, entry: entry });
    return entry;
  },

  addObservationPhoto: function(deficId, obsIdx, photoData) {
    // S120: Route legacy "add to obs.photos" uploads into the pool model so
    // post-migration uploads aren't orphaned. Behavior:
    //  - Adds to defic.photos[] pool (single source of truth)
    //  - Default-state obs (photoSelection null) auto-shows it (default = all pool)
    //  - Custom-state obs (photoSelection array) gets the new id appended so
    //    the photo is visible in THIS obs but not silently leaking into other
    //    custom obs (matches the locked S120 design).
    // Existing callers (deficiencies.js, viewer.js, photos.js) keep working
    // without changes.
    var f = this.findDeficiency(deficId);
    if (!f) return null;
    var obs = (f.defic.observations || [])[obsIdx];
    if (!obs) return null;
    var photo = this.addPoolPhoto(deficId, photoData);
    if (!photo) return null;
    if (Array.isArray(obs.photoSelection)) {
      obs.photoSelection.push(photo.id);
    }
    // Notify under the legacy "add" event so the existing UI listeners (which
    // don't know about "add-pool" yet) keep firing renders. addPoolPhoto
    // already fired "add-pool" — this is a second notification on the legacy
    // channel for back-compat. Cheap; renderers de-dupe via element identity.
    this._notify('photo', { action: 'add', deficId: deficId, photo: photo, obsIdx: obsIdx });
    return photo;
  },

  removeObservationPhoto: function(deficId, obsIdx, photoIdx) {
    // S120: photoIdx is now an index into the EFFECTIVE photo list for this
    // obs (what the UI shows). Resolve to the underlying pool entry and
    // soft-delete via removePoolPhoto so the cascade (selection + markup)
    // runs correctly. Falls back to the legacy obs.photos[] splice for
    // never-migrated edge cases (pool empty, obs.photos populated).
    var f = this.findDeficiency(deficId);
    if (!f) return null;
    var obs = (f.defic.observations || [])[obsIdx];
    if (!obs) return null;
    var effective = this.getEffectivePhotos(f.defic, obsIdx);
    var target = effective[photoIdx];
    if (!target) return null;
    // Pool path: target has an id that exists in defic.photos
    var poolHit = (f.defic.photos || []).some(function(p) { return p && p.id === target.id; });
    if (poolHit) {
      // For custom-state obs, also remove from this obs's selection so the
      // UI immediately stops showing it (default-state obs see it removed
      // through the pool tombstone alone).
      if (Array.isArray(obs.photoSelection)) {
        obs.photoSelection = obs.photoSelection.filter(function(id) { return id !== target.id; });
      }
      this.removePoolPhoto(deficId, target.id);
      return target;
    }
    // Legacy fallback: never-migrated obs.photos
    var photos = obs.photos || [];
    var legacyIdx = photos.indexOf(target);
    if (legacyIdx === -1) return null;
    var removed = photos.splice(legacyIdx, 1)[0];
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'remove', deficId: deficId, photo: removed });
    return removed;
  },

  // ── S120: photo pool mutation helpers ──

  // Add a photo to the defic-level pool. Auto-shows in every default-state
  // obs (because default = all pool). Custom-state obs (photoSelection is
  // a defined array) do NOT auto-add — caller must explicitly assign via
  // setObsPhotoSelection or addObsPhotoToSelection. Returns the new entry.
  addPoolPhoto: function(deficId, photoData, opts) {
    var f = this.findDeficiency(deficId);
    if (!f) return null;
    if (!Array.isArray(f.defic.photos)) f.defic.photos = [];
    opts = opts || {};
    var photo = {
      id: 'ph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      r2Key: opts.r2Key || null,
      sourceR2Key: opts.sourceR2Key || opts.r2Key || null,
      dataUrl: typeof photoData === 'string' ? photoData : (photoData && photoData.dataUrl) || null,
      thumb: opts.thumb || null,
      filename: opts.filename || ('photo_' + Date.now() + '.jpg'),
      addedDate: new Date().toISOString().split('T')[0],
      createdBy: _currentUserId || null
    };
    f.defic.photos.push(photo);
    f.defic._photoPoolMigrated = true; // mark migrated since we now have pool entries
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'add-pool', deficId: deficId, photo: photo });
    return photo;
  },

  // Soft-delete a pool photo. Sets deleted:true on the pool entry (R2
  // objects are intentionally NOT touched per Q2 — they remain forever
  // as a recovery layer against accidental or malicious deletion).
  // Cascade-removes the photoId from every obs.photoSelection AND from
  // every obs.photoMarkups map. Idempotent: re-deleting is a no-op.
  removePoolPhoto: function(deficId, photoId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var pool = f.defic.photos || [];
    var photo = pool.find(function(p) { return p && p.id === photoId; });
    if (!photo) return false;
    if (photo.deleted) return false;
    photo.deleted = true;
    photo.deletedDate = new Date().toISOString();
    (f.defic.observations || []).forEach(function(o) {
      if (Array.isArray(o.photoSelection)) {
        o.photoSelection = o.photoSelection.filter(function(id) { return id !== photoId; });
      }
      if (o.photoMarkups && o.photoMarkups[photoId]) {
        delete o.photoMarkups[photoId];
      }
    });
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'remove-pool', deficId: deficId, photoId: photoId });
    return true;
  },

  // Set per-obs photo selection. null = reset to default (all pool photos
  // visible to this obs). Array = custom subset of pool photo IDs. IDs
  // that aren't in the live pool (or are tombstoned) are filtered out.
  setObsPhotoSelection: function(deficId, obsIdx, photoIds) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var obs = (f.defic.observations || [])[obsIdx];
    if (!obs) return false;
    if (photoIds === null || photoIds === undefined) {
      obs.photoSelection = null;
    } else if (Array.isArray(photoIds)) {
      var poolIds = {};
      (f.defic.photos || []).forEach(function(p) {
        if (p && !p.deleted) poolIds[p.id] = true;
      });
      obs.photoSelection = photoIds.filter(function(id) { return poolIds[id]; });
    } else {
      return false;
    }
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'selection', deficId: deficId, obsIdx: obsIdx });
    return true;
  },

  // Set markup state for an (obs, pool photo) pair. null = clear.
  setObsPhotoMarkup: function(deficId, obsIdx, photoId, markup) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var obs = (f.defic.observations || [])[obsIdx];
    if (!obs) return false;
    if (!obs.photoMarkups) obs.photoMarkups = {};
    if (markup === null || markup === undefined) {
      delete obs.photoMarkups[photoId];
    } else {
      obs.photoMarkups[photoId] = {
        markedR2Key: markup.markedR2Key || null,
        markupOverlay: markup.markupOverlay || null
      };
    }
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'markup', deficId: deficId, obsIdx: obsIdx, photoId: photoId });
    return true;
  },

  removeDeficiency: function(deficId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    // Save for undo
    _undoStack.push({
      type: 'deleteDefic',
      defic: JSON.parse(JSON.stringify(f.defic)),
      contractorId: f.contractor ? f.contractor.id : null
    });
    if (_undoStack.length > 20) _undoStack.shift();
    f.arr.splice(f.idx, 1);
    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'remove', deficId: deficId });
    return true;
  },

  undoLast: function() {
    if (!_undoStack.length || !_project) return null;
    var entry = _undoStack.pop();
    if (entry.type === 'deleteDefic') {
      if (entry.contractorId) {
        var ctr = (_project.contractors || []).find(function(c) { return c.id === entry.contractorId; });
        if (ctr) {
          if (!ctr.deficiencies) ctr.deficiencies = [];
          ctr.deficiencies.push(entry.defic);
        } else {
          // Contractor was deleted — put in general
          if (!_project.generalDeficiencies) _project.generalDeficiencies = [];
          _project.generalDeficiencies.push(entry.defic);
        }
      } else {
        if (!_project.generalDeficiencies) _project.generalDeficiencies = [];
        _project.generalDeficiencies.push(entry.defic);
      }
      _dirty = true;
      _queueSave();
      this._notify('deficiency', { action: 'undo-delete', defic: entry.defic });
      console.log('[Model] Undo: restored deficiency #' + entry.defic.num);
      return entry;
    }
    return null;
  },

  hasUndo: function() { return _undoStack.length > 0; },

  toggleIAR: function(deficId) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    f.defic.iar = !f.defic.iar;
    // S113 Push 20: IAR is mutually exclusive with low/general priority
    // (matches v1 behavior). When activating IAR, force priority='high'
    // and propagate to all entries so the pin renders red and the row
    // sorts correctly. Toggling OFF leaves priority alone — user might
    // have already set low/general manually for a non-IAR item.
    if (f.defic.iar) {
      f.defic.priority = 'high';
      if (f.defic.entries && f.defic.entries.length) {
        f.defic.entries.forEach(function(en) { en.priority = 'high'; });
      }
    }
    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'iar', deficId: deficId, iar: f.defic.iar });
  },

  updateClosedNote: function(deficId, note) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    f.defic.closedNote = note;
    _dirty = true;
    _queueSave();
  },

  removeDrawing: function(drawingId) {
    if (!_project || !_project.drawings) return false;
    var idx = _project.drawings.findIndex(function(d) { return d.id === drawingId; });
    if (idx < 0) return false;
    var removed = _project.drawings.splice(idx, 1)[0];
    // Also clear pins referencing this drawing
    this.getAllDeficiencies().forEach(function(d) {
      if (d.defic.drawingId === drawingId) {
        d.defic.drawingId = null;
        d.defic.pinX = null;
        d.defic.pinY = null;
      }
    });
    _dirty = true;
    _queueSave();
    this._notify('drawing', { action: 'remove', drawing: removed });
    return true;
  },

  removeSitePhoto: function(photoIdx) {
    if (!_project || !_project.photos) return null;
    if (photoIdx < 0 || photoIdx >= _project.photos.length) return null;
    var removed = _project.photos.splice(photoIdx, 1)[0];
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'remove-site', photo: removed });
    return removed;
  },

  reassignDeficiency: function(deficId, newCtrId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var defic = f.defic;
    // Remove from current location
    f.arr.splice(f.idx, 1);
    // Dedup guard: also remove from ALL other locations (prevents duplicates)
    (_project.contractors || []).forEach(function(c) {
      if (c.deficiencies) c.deficiencies = c.deficiencies.filter(function(d) { return d.id !== deficId; });
    });
    if (_project.generalDeficiencies) {
      _project.generalDeficiencies = _project.generalDeficiencies.filter(function(d) { return d.id !== deficId; });
    }
    // Add to new contractor (or general if null)
    if (newCtrId) {
      var ctr = _project.contractors.find(function(c) { return c.id === newCtrId; });
      if (!ctr) return false;
      if (!ctr.deficiencies) ctr.deficiencies = [];
      ctr.deficiencies.push(defic);
    } else {
      if (!_project.generalDeficiencies) _project.generalDeficiencies = [];
      _project.generalDeficiencies.push(defic);
    }
    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'reassign', deficId: deficId, newCtrId: newCtrId });
    return true;
  },

  duplicateDeficiency: function(deficId) {
    var f = this.findDeficiency(deficId);
    if (!f || !_project) return null;
    var src = f.defic;
    var num = _project.nextDeficNum || 1;
    _project.nextDeficNum = num + 1;
    var inst = (_project.currentFrtInstance) || 1;
    var newDefic = JSON.parse(JSON.stringify(src));
    newDefic.id = 'def_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    newDefic.num = num;
    newDefic.notedOnInstance = inst;
    newDefic.notedDate = new Date().toISOString().split('T')[0];
    newDefic.status = 'open';
    newDefic.closedDate = null;
    newDefic.closedOnInstance = null;
    newDefic.closedNote = '';
    newDefic.drawingId = null;
    newDefic.pinX = null;
    newDefic.pinY = null;
    newDefic.activity = [];
    // Strip photo dataUrls from copy (they reference the same R2 files)
    (newDefic.observations || []).forEach(function(o) { o.photos = []; o.addressed = false; });
    f.arr.push(newDefic);
    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'add', defic: newDefic });
    return newDefic;
  },

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

  renumberDeficiencies: function() {
    if (!_project) return 0;
    // Contractor deficiencies first (sorted by current num), then general
    var ctrDefics = [];
    (_project.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(function(d) {
        ctrDefics.push(d);
      });
    });
    ctrDefics.sort(function(a, b) { return (a.num || 0) - (b.num || 0); });
    var genDefics = (_project.generalDeficiencies || []).slice();
    genDefics.sort(function(a, b) { return (a.num || 0) - (b.num || 0); });
    var ordered = ctrDefics.concat(genDefics);
    ordered.forEach(function(d, idx) {
      d.num = idx + 1;
    });
    _project.nextDeficNum = ordered.length + 1;
    _dirty = true;
    _queueSave();
    this._notify('project', _project);
    return ordered.length;
  },

  addDrawing: function(dwg) {
    if (!_project) return null;
    if (!_project.drawings) _project.drawings = [];
    // S83: stamp inspector attribution when not already set
    if (!dwg.createdBy) dwg.createdBy = _currentUserId || null;
    _project.drawings.push(dwg);
    _dirty = true;
    _queueSave();
    this._notify('drawing', { action: 'add', drawing: dwg });
    return dwg;
  },

  // S115: Public auto-dedup. Re-runs the folder-scoped name dedup
  // and persists+notifies if anything was removed. Returns the
  // number of duplicates removed. Safe to call any time.
  autoDedup: function() {
    if (!_project) return 0;
    var removed = _autoDedup(_project);
    if (removed > 0) {
      _dirty = true;
      _queueSave();
      this._notify('drawing', { action: 'dedup', removed: removed });
      console.log('[Model] AutoDedup: removed ' + removed + ' duplicate drawing(s)');
    }
    return removed;
  },

  // S83: Inspector attribution — app.js calls this on boot and whenever auth changes.
  // Passing null explicitly clears attribution (e.g., on sign-out).
  setCurrentUser: function(userId) {
    _currentUserId = userId || null;
  },
  getCurrentUser: function() { return _currentUserId; },

  getSitePhotos: function() { return _project ? (_project.photos || []) : []; },
  hasUnsavedChanges: function() { return _dirty; },

  // ── S115: Photo enumeration + lookup helpers (for markup propagation) ──
  // Walks every place a photo record can live: gallery, contractor deficiencies
  // (top-level + per-observation), and general deficiencies (top-level + per-
  // observation). Returns {photo, location} entries; location describes where
  // the photo lives so callers can update / persist correctly.
  getAllPhotoRecords: function() {
    if (!_project) return [];
    var out = [];
    (_project.photos || []).forEach(function(ph){
      out.push({ photo: ph, location: { type: 'site' } });
    });
    function _walk(arr, ctrId) {
      (arr || []).forEach(function(d) {
        (d.photos || []).forEach(function(ph) {
          out.push({ photo: ph, location: { type: 'defic-top', deficId: d.id, contractorId: ctrId } });
        });
        (d.observations || []).forEach(function(obs) {
          (obs.photos || []).forEach(function(ph) {
            out.push({ photo: ph, location: { type: 'defic-obs', deficId: d.id, contractorId: ctrId, obsId: obs.id } });
          });
        });
      });
    }
    (_project.contractors || []).forEach(function(c) { _walk(c.deficiencies, c.id); });
    _walk(_project.generalDeficiencies, null);
    return out;
  },

  // S115: All photo records (across every location) that share an R2 key.
  // Used by markup propagation: marking up one copy updates all copies.
  // Empty/missing r2Key returns []. Falls back to comparing photo.id when
  // both records have an id and no r2Key (defensive — shouldn't happen
  // in normal flow but keeps revert safe for offline-created photos).
  findPhotosByR2Key: function(r2Key) {
    if (!r2Key) return [];
    var all = this.getAllPhotoRecords();
    return all.filter(function(rec) { return rec.photo && rec.photo.r2Key === r2Key; });
  },
  findPhotosById: function(id) {
    if (!id) return [];
    var all = this.getAllPhotoRecords();
    return all.filter(function(rec) { return rec.photo && rec.photo.id === id; });
  },

  // S115: Add a backup photo record to the gallery (for markup originals).
  // Marks dirty + queues save. Returns the photo (now in the gallery array).
  addSitePhoto: function(ph) {
    if (!_project || !ph) return null;
    if (!_project.photos) _project.photos = [];
    _project.photos.push(ph);
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'add-site', photo: ph });
    return ph;
  },

  // S115: Remove a gallery photo by id (used to remove the backup record on revert).
  // Marks dirty + queues save. Returns true if removed.
  removeSitePhotoById: function(id) {
    if (!_project || !_project.photos || !id) return false;
    for (var i = 0; i < _project.photos.length; i++) {
      if (_project.photos[i] && _project.photos[i].id === id) {
        _project.photos.splice(i, 1);
        _dirty = true;
        _queueSave();
        this._notify('photo', { action: 'remove-site', id: id });
        return true;
      }
    }
    return false;
  },

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
