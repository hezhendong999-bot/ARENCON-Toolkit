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

// S120 Push 22: collision-resistant ID generator.
// PRIOR BUG: Date.now() + 4-char base36 random had a 1-in-4096 collision rate
// when two IDs were minted in the same millisecond. duplicateDeficiency()
// hit this collision in real production data, producing two pins with the
// same id which made findDeficiency() return the wrong record on delete.
// FIX: combine three sources of uniqueness:
//   - Date.now() (millisecond clock)
//   - _uidCounter (monotonic per-page-load — guarantees uniqueness within a
//     single millisecond no matter how many IDs we mint)
//   - 8-char base36 random (1-in-2.8-trillion collision rate, defense in depth
//     against multi-tab and after-reload collisions)
// Total length is ~25 chars after the prefix — slightly longer than before
// but readable and grep-friendly. Format: prefix_<ms>_<counter>_<rand8>.
var _uidCounter = 0;
function _uid(prefix) {
  _uidCounter = (_uidCounter + 1) & 0xFFFFFF;
  var rand = Math.random().toString(36).slice(2, 10);
  // pad rand to 8 chars in case Math.random produced a short value
  while (rand.length < 8) rand = '0' + rand;
  return prefix + '_' + Date.now() + '_' + _uidCounter.toString(36) + '_' + rand;
}

// ── Default Project Template ─────────────────────────────
function createNewProject(overrides) {
  var now = new Date().toISOString();
  var id = _uid('proj');
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

/**
 * S135 Phase 1a: Default trade list reduced from the 8-trade life-safety
 * order to 4 trades. Standpipe / Fire Pump / Extinguishers roll up under
 * Sprinkler 99% of the time (same contractor scope); Smoke Control /
 * Kitchen Hood / Passive-Separations are rare enough to add per-project
 * via the trade board's `+ trade` column. "Building Conditions" absorbs
 * non-trade observations that still belong in the report.
 *
 * TRADE_LIST is now the SEED for `project.projectTrades` on new/legacy
 * projects. Existing per-project `projectTrades` is the source-of-truth
 * after load. Existing obs.trade values not in this list (e.g.
 * "Standpipe", "Fire Pump", "Extinguishers" from prior S134 sessions)
 * stay intact in JSON — UI renders them as additional dropdown options.
 *
 * Empty trades suppressed.
 */
export var TRADE_LIST = [
  'Sprinkler',
  'Fire Alarm',
  'General Contracting',
  'Building Conditions'
];

/**
 * S135 Phase 1a: 8-color muted palette for contractor.color auto-assignment.
 * Auto-assigned, never user-picked (per S134 design lock). When deleting
 * a contractor, the color frees up for reuse. After 8 contractors, the
 * palette cycles (no enforced uniqueness).
 *
 * Used in the trade board UI (4px colored left border on contractor
 * cards) and in the Detailed view contractor sub-banner. Not used in
 * PDF exports — Mark explicitly excluded visual color from external
 * deliverables.
 */
export var CONTRACTOR_COLOR_PALETTE = [
  '#5C7A6E', '#4A6B8C', '#7B6F5A', '#9C5070',
  '#6B7280', '#5E2370', '#8B6F47', '#4A8089'
];

/**
 * Pick the first unused color from CONTRACTOR_COLOR_PALETTE. If all 8
 * are already used by other contractors, cycle (palette repeats without
 * enforced uniqueness — visual collision is acceptable on >8 contractors).
 *
 * @param {string[]} usedColors  Hex strings already assigned. Order ignored.
 * @returns {string}             A hex color from the palette.
 */
export function nextContractorColor(usedColors) {
  var used = {};
  (usedColors || []).forEach(function(c) { used[c] = true; });
  for (var i = 0; i < CONTRACTOR_COLOR_PALETTE.length; i++) {
    if (!used[CONTRACTOR_COLOR_PALETTE[i]]) return CONTRACTOR_COLOR_PALETTE[i];
  }
  // All 8 used — cycle by length-mod (deterministic, no random).
  return CONTRACTOR_COLOR_PALETTE[(usedColors || []).length % CONTRACTOR_COLOR_PALETTE.length];
}

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
              id: _uid('obs') + '_' + i,
              text: e.description || e.text || '',
              photos: e.photos || [],
              notedOnInstance: d.notedOnInstance || _migInst,
              notedDate: d.notedDate || _migToday,
              addressed: e._addressed || false,
              createdBy: d.createdBy || null,
              // ── S134: trade-based grouping schema ──
              trade: '',
              tradeSource: 'ai',
              repeatCount: 1
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
        // ── S138: recommendation flag backfill (idempotent, additive) ──
        // Defaults false on legacy data. Existing grouping is unchanged:
        // the UI still derives "Recommendations" from no-contractor+trade
        // (Option 2 / additive). The explicit flag, when true, also forces
        // Recommendations grouping (and wins over an assigned contractor).
        if (d.isRecommendation === undefined) d.isRecommendation = false;
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
          // ── S134: trade schema backfill (idempotent) ──
          // Pre-S134 projects (and projects with legacy iar:true) have no
          // trade fields. Backfill safe defaults so the new dropdown reads
          // sensible values. iar:true silently degrades — the field stays
          // in JSON, just no longer rendered. No data conversion.
          if (o.trade === undefined) o.trade = '';
          if (o.tradeSource === undefined) o.tradeSource = 'ai';
          if (o.repeatCount === undefined) o.repeatCount = 1;
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
                  id: ph.id || (_uid('ph')),
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

    // S130 — Migrate legacy defic-level aiGroup → per-observation aiGroup.
    // Earlier S130 commit shipped defic-level grouping; Mark's actual workflow
    // is per-obs (one pin can have obs in different report sections). Carry
    // the legacy value down to each obs that doesn't already have one, then
    // delete the parent field.
    function _migrateDeficAiGroupToObs(d) {
      if (!d || !d.aiGroup) return;
      var obs = d.observations || [];
      for (var oi = 0; oi < obs.length; oi++) {
        if (!obs[oi].aiGroup) obs[oi].aiGroup = d.aiGroup;
      }
      delete d.aiGroup;
    }
    (proj.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(_migrateDeficAiGroupToObs);
    });
    (proj.generalDeficiencies || []).forEach(_migrateDeficAiGroupToObs);

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
    if (!proj.id) proj.id = _uid('proj');

    // ── S135 Phase 1a: contractor-scoped trades + auto-color schema ──
    // Idempotent. Seeds projectTrades from TRADE_LIST defaults on first
    // load; gives every contractor an empty trades array and an
    // auto-assigned palette color if missing. Runs on every setProject so
    // contractors created before S135 schema land here pick up defaults.
    if (!Array.isArray(proj.projectTrades)) proj.projectTrades = TRADE_LIST.slice();
    var _usedCtrColors = (proj.contractors || [])
      .map(function(c) { return c.color; })
      .filter(function(c) { return !!c; });
    (proj.contractors || []).forEach(function(c) {
      if (!Array.isArray(c.trades)) c.trades = [];
      if (!c.color) {
        c.color = nextContractorColor(_usedCtrColors);
        _usedCtrColors.push(c.color);
      }
    });

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

  /**
   * S123 P6A — Apply a merged project state (from sync conflict resolution).
   *
   * Used by SyncEngine after a 412 Precondition Failed → 3-way merge.
   * Differs from setProject() in two ways:
   *
   *   1. Skips the V1→V2 normalization + auto-dedup pipeline — the
   *      merge result is already in V2 shape (came from cloud which is
   *      already normalized) so re-running migrations would be wasteful
   *      and possibly destructive on transient merge artifacts.
   *
   *   2. Marks the project dirty + queues an immediate save — the
   *      caller (sync.js push retry) needs the merged state pushed to
   *      cloud as soon as possible to close the conflict window.
   *
   * Does NOT trigger a 'project' notify event with the same firing
   * shape as initial load; uses a distinct 'merged' event so UI can
   * choose to refresh selectively rather than a full re-render.
   *
   * Returns the merged project (the new _project state).
   */
  applyMerged: function(mergedProj) {
    if (!mergedProj) return null;
    _project = mergedProj;
    _dirty = true;
    console.log('[Model] applyMerged: replaced project state from merge result',
                '| contractors:', (mergedProj.contractors || []).length,
                '| drawings:', (mergedProj.drawings || []).length,
                '| deficiencies:', this.getAllDeficiencies(mergedProj).length);
    this._notify('merged', mergedProj);
    // Also fire 'project' so existing listeners (which mostly re-render the
    // whole UI) update too. This is intentional — merge results can change
    // any part of the tree, so a full re-render is the safe default until
    // we have finer-grained merge-aware re-render logic.
    this._notify('project', mergedProj);
    _queueSave();
    return mergedProj;
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
    // S135 Phase 1a: auto-assign palette color from unused pool; init
    // trades:[] so the trade board's "Add contractor" picker has a
    // canonical empty state to start from.
    var _used = (_project.contractors || [])
      .map(function(c) { return c.color; })
      .filter(function(c) { return !!c; });
    var ctr = {
      id: _uid('ctr'),
      name: name || 'New Contractor',
      trades: [],
      color: nextContractorColor(_used),
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

    // S135 Phase 1a: auto-inherit trade when the parent contractor has
    // exactly 1 trade declared. Multi-trade contractors leave it blank
    // (user picks per obs via dropdown or trade board reassignment).
    // Site General defics (ctrId === null) always start untagged.
    var _inheritedTrade = '';
    if (ctrId) {
      var _ctrLookup = (_project.contractors || []).find(function(c) { return c.id === ctrId; });
      if (_ctrLookup && Array.isArray(_ctrLookup.trades) && _ctrLookup.trades.length === 1) {
        _inheritedTrade = _ctrLookup.trades[0];
      }
    }

    var defic = {
      id: _uid('def'),
      num: num,
      status: 'open',
      priority: 'general',
      category: '',
      isRecommendation: false,             // S138: recommendation flag (additive; default false)
      drawingId: null,
      pinX: null, pinY: null,
      date: today,
      notedDate: today,
      notedOnInstance: inst,
      createdBy: _currentUserId || null,   // S83: inspector attribution
      observations: [{
        id: _uid('obs'),
        text: '',
        photos: [],
        notedOnInstance: inst,
        notedDate: today,
        addressed: false,
        priority: 'high',                    // S119: per-obs priority
        createdBy: _currentUserId || null,   // S83
        // ── S134: trade-based grouping schema ──
        trade: _inheritedTrade,
        tradeSource: 'ai',
        repeatCount: 1
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

  // S135: S130 AI auto-grouping methods retired (getGroupCatalog,
  // setGroupCatalog, setObsGroup, applyAiObsGroups, clearAllAiObsGroups,
  // setDeficGroup, applyAiGroups, clearAllAiGroups). UI consumers were
  // removed in Commit A. obs.aiGroup field stays in JSON for silent-degrade
  // (load-path normalizer at _migrateDeficAiGroupToObs preserved one session).


  addObservation: function(deficId) {
    var f = this.findDeficiency(deficId);
    if (!f) return null;
    var inst = (_project && _project.currentFrtInstance) || 1;
    var today = new Date().toISOString().split('T')[0];
    // S119: new obs inherits priority from existing obs (effective) or pin level.
    // Falls back to 'high' so a new obs on a fresh pin stays the strongest signal.
    var inheritPri = this.getEffectivePriority(f.defic) || f.defic.priority || 'high';
    // S135 Phase 1a: auto-inherit trade from the parent contractor when
    // it has exactly 1 trade. If the pin has other obs that already
    // carry a non-empty trade, prefer the most recent (last) one — the
    // user's pattern when adding obs is usually "more of the same."
    var _inheritedTrade = '';
    var _existingObs = f.defic.observations || [];
    for (var _oi = _existingObs.length - 1; _oi >= 0; _oi--) {
      if (_existingObs[_oi] && _existingObs[_oi].trade) {
        _inheritedTrade = _existingObs[_oi].trade; break;
      }
    }
    if (!_inheritedTrade && f.contractor && Array.isArray(f.contractor.trades) && f.contractor.trades.length === 1) {
      _inheritedTrade = f.contractor.trades[0];
    }
    var obs = {
      id: _uid('obs'),
      text: '',
      photos: [],
      notedOnInstance: inst,
      notedDate: today,
      addressed: false,
      priority: inheritPri,                // S119: per-obs priority
      createdBy: _currentUserId || null,   // S83
      // ── S134: trade-based grouping schema ──
      trade: _inheritedTrade,
      tradeSource: 'ai',
      repeatCount: 1
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

  // ── S134: per-observation trade mutation ──
  // Sets obs.trade and obs.tradeSource. Manual override marks tradeSource
  // as 'manual' so the AI tagger (S136) will never overwrite it. Setting
  // an empty trade with source='manual' is a valid "user cleared the AI
  // guess" state. The AI worker will refuse to retag any obs with
  // tradeSource === 'manual'. Source defaults to 'manual' when invoked
  // from the UI dropdown; AI worker callers pass 'ai' explicitly.
  updateObsTrade: function(deficId, obsIdx, trade, source) {
    var f = this.findDeficiency(deficId);
    if (!f) return;
    var obs = f.defic.observations || [];
    if (!obs[obsIdx]) return;
    obs[obsIdx].trade = trade || '';
    obs[obsIdx].tradeSource = (source === 'ai') ? 'ai' : 'manual';
    _dirty = true;
    _queueSave();
    this._notify('observation', { action: 'trade', deficId: deficId, obsIdx: obsIdx, trade: obs[obsIdx].trade, tradeSource: obs[obsIdx].tradeSource });
  },

  // ── S135 Phase 1a: contractor-scoped trade management ──
  // The trade board UI (Phase 1b, S136 main session) calls these from
  // the kanban column add/remove buttons + smart picker. Each is
  // narrow + idempotent — no UX coupling. All mutations queue a save
  // and emit a 'contractor' or 'project' notify so listeners refresh.

  /**
   * Replace a contractor's trades list. Pass [] to clear (contractor
   * is then "untriaged" and shows under whatever trade columns its
   * obs are tagged with, not in the trade board column slots).
   *
   * @param {string} ctrId
   * @param {string[]} trades  Subset of project.projectTrades (caller
   *   responsible for filtering invalid entries).
   * @returns {boolean}        true on success, false if contractor not found.
   */
  setContractorTrades: function(ctrId, trades) {
    if (!_project) return false;
    var ctr = (_project.contractors || []).find(function(c) { return c.id === ctrId; });
    if (!ctr) return false;
    ctr.trades = Array.isArray(trades) ? trades.slice() : [];
    _dirty = true;
    _queueSave();
    this._notify('contractor', { action: 'trades', ctrId: ctrId, trades: ctr.trades.slice() });
    return true;
  },

  /**
   * Add a new trade column to the project. Idempotent: a no-op if the
   * trade already exists. Whitespace-trimmed, empty rejected.
   *
   * @param {string} trade
   * @returns {boolean}  true if added, false if duplicate / invalid /
   *                     no project loaded.
   */
  addProjectTrade: function(trade) {
    if (!_project) return false;
    var t = (trade || '').trim();
    if (!t) return false;
    if (!Array.isArray(_project.projectTrades)) _project.projectTrades = TRADE_LIST.slice();
    // Case-insensitive dedup, but preserve original casing if already present
    for (var i = 0; i < _project.projectTrades.length; i++) {
      if (_project.projectTrades[i].toLowerCase() === t.toLowerCase()) return false;
    }
    _project.projectTrades.push(t);
    _dirty = true;
    _queueSave();
    this._notify('project', { action: 'tradeAdd', trade: t });
    return true;
  },

  /**
   * Remove a trade column from the project. Also strips that trade from
   * every contractor's trades array (cascade cleanup). Does NOT touch
   * obs.trade values — those continue to render in dropdowns as
   * "out-of-list" entries until the user retags them.
   *
   * @param {string} trade  Exact-match removal (case-sensitive — should
   *                        match the value as stored).
   * @returns {boolean}     true if removed, false if not present.
   */
  removeProjectTrade: function(trade) {
    if (!_project || !Array.isArray(_project.projectTrades)) return false;
    var idx = _project.projectTrades.indexOf(trade);
    if (idx < 0) return false;
    _project.projectTrades.splice(idx, 1);
    // Cascade: strip from contractor.trades arrays.
    (_project.contractors || []).forEach(function(c) {
      if (Array.isArray(c.trades)) {
        var ci = c.trades.indexOf(trade);
        if (ci >= 0) c.trades.splice(ci, 1);
      }
    });
    _dirty = true;
    _queueSave();
    this._notify('project', { action: 'tradeRemove', trade: trade });
    return true;
  },

  /**
   * Add a contractor to a trade column. Idempotent (no-op if already
   * present). If the trade is not in project.projectTrades, also adds
   * it (so the smart picker's "Add new contractor + new trade" path
   * is atomic).
   *
   * @param {string} ctrId
   * @param {string} trade
   * @returns {boolean}  true on success.
   */
  addContractorToTrade: function(ctrId, trade) {
    if (!_project) return false;
    var t = (trade || '').trim();
    if (!t) return false;
    var ctr = (_project.contractors || []).find(function(c) { return c.id === ctrId; });
    if (!ctr) return false;
    // Ensure trade is in projectTrades (case-insensitive match; uses
    // existing casing if found, otherwise appends).
    if (!Array.isArray(_project.projectTrades)) _project.projectTrades = TRADE_LIST.slice();
    var canonical = null;
    for (var i = 0; i < _project.projectTrades.length; i++) {
      if (_project.projectTrades[i].toLowerCase() === t.toLowerCase()) {
        canonical = _project.projectTrades[i]; break;
      }
    }
    if (canonical === null) {
      _project.projectTrades.push(t);
      canonical = t;
    }
    if (!Array.isArray(ctr.trades)) ctr.trades = [];
    if (ctr.trades.indexOf(canonical) >= 0) {
      // Already there — flush dirty if we mutated projectTrades; else no-op.
      if (canonical === t && _project.projectTrades[_project.projectTrades.length - 1] === t) {
        _dirty = true;
        _queueSave();
      }
      return true;
    }
    ctr.trades.push(canonical);
    _dirty = true;
    _queueSave();
    this._notify('contractor', { action: 'trades', ctrId: ctrId, trades: ctr.trades.slice() });
    return true;
  },

  /**
   * Remove a contractor from a trade column. Does NOT remove the trade
   * from project.projectTrades (use removeProjectTrade for that).
   *
   * @param {string} ctrId
   * @param {string} trade
   * @returns {boolean}  true if removed, false if not present.
   */
  removeContractorFromTrade: function(ctrId, trade) {
    if (!_project) return false;
    var ctr = (_project.contractors || []).find(function(c) { return c.id === ctrId; });
    if (!ctr || !Array.isArray(ctr.trades)) return false;
    var idx = ctr.trades.indexOf(trade);
    if (idx < 0) return false;
    ctr.trades.splice(idx, 1);
    _dirty = true;
    _queueSave();
    this._notify('contractor', { action: 'trades', ctrId: ctrId, trades: ctr.trades.slice() });
    return true;
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

  // ── S121 Phase C-1: tab flatten helper ──
  // Mirrors the row shape produced by export/pdf.js _pushItems but WITHOUT
  // the priority='general' filter and WITHOUT the addressed/instance filter.
  // Tabs render everything; per-tab filter logic (in deficiencies.js /
  // pins.js) applies its own predicate to the row stream.
  //
  // Returned row shape:
  //   {
  //     d:             defic ref,
  //     obs:           observation ref or null (legacy defic w/o observations),
  //     obsIdx:        0 for legacy, else index into d.observations,
  //     ctr:           per-obs effective contractor NAME (after obs.contractorId
  //                    override) — what the PDF groups by,
  //     parentCtrId:   contractor id this defic lives under (null for general),
  //     parentCtrName: parent contractor name ('Site General' for general),
  //     numLabel:      d.num, with '-A'/'-B' suffix iff this pin's obs span
  //                    more than one effective contractor (matches PDF labels)
  //   }
  //
  // Cross-contractor suffix logic mirrors _pushItems: if a pin's obs span
  // more than one effective contractor, every obs gets a letter suffix on
  // its numLabel; same-contractor multi-obs pins keep plain #N labels.
  // Legacy defics (no observations array) emit a single row with obs:null
  // and a plain numLabel.
  //
  // Both `ctr` (per-obs) and `parentCtrName` (pin-level) are returned so
  // C-2 callers can choose grouping behavior — pin-grouped rendering uses
  // parentCtrName to keep cross-contractor pins visually unified, while
  // PDF-strict rendering uses ctr.
  flattenForTabs: function(p) {
    if (!p) return [];
    var rows = [];

    function emitForDefic(d, parentCtrId, parentCtrName) {
      var obs = (d.observations && d.observations.length) ? d.observations : null;
      if (obs) {
        // Pre-compute each obs's effective contractor (per-obs override
        // takes precedence; falls back to parent contractor name).
        var obsEffCtrs = obs.map(function(o) {
          if (o && o.contractorId) {
            var fc = (p.contractors || []).find(function(c) { return c.id === o.contractorId; });
            if (fc) return fc.name;
          }
          return parentCtrName;
        });
        var distinctCtrs = obsEffCtrs.filter(function(v, i, a) { return a.indexOf(v) === i; });
        var needsSuffix = distinctCtrs.length > 1;
        obs.forEach(function(o, oi) {
          var label = needsSuffix
            ? (d.num + '-' + String.fromCharCode(65 + oi))
            : String(d.num || '?');
          rows.push({
            d: d,
            obs: o,
            obsIdx: oi,
            ctr: obsEffCtrs[oi],
            parentCtrId: parentCtrId,
            parentCtrName: parentCtrName,
            numLabel: label
          });
        });
      } else {
        rows.push({
          d: d,
          obs: null,
          obsIdx: 0,
          ctr: parentCtrName,
          parentCtrId: parentCtrId,
          parentCtrName: parentCtrName,
          numLabel: String(d.num || '?')
        });
      }
    }

    (p.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(function(d) {
        emitForDefic(d, c.id, c.name);
      });
    });
    (p.generalDeficiencies || []).forEach(function(d) {
      emitForDefic(d, null, 'Site General');
    });

    return rows;
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
      id: _uid('act'),
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

  // S122 Push 5 — update an existing activity entry's mutable fields
  // (text/date/obsRef/photos). Returns the updated entry, or null if not found.
  updateActivityEntry: function(deficId, actId, fields) {
    var f = this.findDeficiency(deficId);
    if (!f || !f.defic.activity) return null;
    var idx = -1;
    for (var i = 0; i < f.defic.activity.length; i++) {
      if (f.defic.activity[i].id === actId) { idx = i; break; }
    }
    if (idx < 0) return null;
    var entry = f.defic.activity[idx];
    if (fields.hasOwnProperty('text'))    entry.text    = fields.text || '';
    if (fields.hasOwnProperty('date'))    entry.date    = fields.date || entry.date;
    if (fields.hasOwnProperty('obsRef'))  entry.obsRef  = fields.obsRef || null;
    if (fields.hasOwnProperty('photos'))  entry.photos  = fields.photos || [];
    _dirty = true;
    _queueSave();
    this._notify('activity', { action: 'update', deficId: deficId, entry: entry });
    return entry;
  },

  // S122 Push 5 — remove an activity entry by id. Returns true if removed.
  removeActivityEntry: function(deficId, actId) {
    var f = this.findDeficiency(deficId);
    if (!f || !f.defic.activity) return false;
    var idx = -1;
    for (var i = 0; i < f.defic.activity.length; i++) {
      if (f.defic.activity[i].id === actId) { idx = i; break; }
    }
    if (idx < 0) return false;
    f.defic.activity.splice(idx, 1);
    _dirty = true;
    _queueSave();
    this._notify('activity', { action: 'remove', deficId: deficId, actId: actId });
    return true;
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
      id: _uid('ph'),
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

  // S120 Push 10: restore a soft-deleted pool photo. Counterpart to
  // removePoolPhoto — clears the deleted/deletedDate flags so the photo
  // becomes visible again. Does NOT re-add the photo to any obs's
  // photoSelection (that would over-reach: the inspector explicitly
  // selected which obs see what; restoring should bring the photo back
  // visible to default-state obs only). The inspector can then add it
  // to specific obs's selections via Manage photos if desired.
  // Idempotent: restoring a not-deleted photo is a no-op returning false.
  // Returns the restored photo record or false.
  restorePoolPhoto: function(deficId, photoId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var pool = f.defic.photos || [];
    var photo = pool.find(function(p) { return p && p.id === photoId; });
    if (!photo) return false;
    if (!photo.deleted) return false;
    delete photo.deleted;
    delete photo.deletedDate;
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'restore-pool', deficId: deficId, photoId: photoId });
    return photo;
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

  // S120 Push 4: per-obs narrow — what a default-view ✕ should do. Removes
  // the photo from THIS obs only. The photo stays in the pool and remains
  // visible to any other obs that references it (or to default-state obs
  // if those exist). Three branches:
  //   1) Pool photo, obs is custom-state → remove ID from photoSelection
  //   2) Pool photo, obs is default-state → narrow obs to "all pool except this"
  //   3) Legacy photo (never-migrated obs.photos[]) → splice that array
  // To delete a photo from the pool entirely (cascading across all obs),
  // use removePoolPhoto. This helper deliberately never touches the pool.
  removePhotoFromObs: function(deficId, obsIdx, photoId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var d = f.defic;
    var obs = (d.observations || [])[obsIdx];
    if (!obs) return false;
    var poolPhoto = (d.photos || []).find(function(p) { return p && !p.deleted && p.id === photoId; });
    if (poolPhoto) {
      if (Array.isArray(obs.photoSelection)) {
        obs.photoSelection = obs.photoSelection.filter(function(id) { return id !== photoId; });
      } else {
        // Default-state → narrow to "all pool except this one"
        var others = (d.photos || []).filter(function(p) { return p && !p.deleted && p.id !== photoId; });
        obs.photoSelection = others.map(function(p) { return p.id; });
      }
      _dirty = true;
      _queueSave();
      this._notify('photo', { action: 'unselect', deficId: deficId, obsIdx: obsIdx, photoId: photoId });
      return true;
    }
    if (obs.photos && obs.photos.length) {
      var legacyIdx = obs.photos.findIndex(function(p) { return p && p.id === photoId; });
      if (legacyIdx >= 0) return !!this.removeObservationPhoto(deficId, obsIdx, legacyIdx);
    }
    return false;
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

  // S135: toggleIAR retired. IAR (Item At Risk) feature removed in S135 —
  // UI rendering retired in Commit A, model method retired here. Existing
  // pin.iar values in JSON silent-degrade (writes still happen elsewhere
  // for one session via status-mirror; reads no longer used by UI).

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
    newDefic.id = _uid('def');
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
    // S120 Push 22: re-id every observation after the JSON.stringify clone.
    // PRIOR BUG: cloning preserved obs.id from the source, so the new pin's
    // observations had identical ids to the source's. When combined with a
    // collision in the outer defic.id (1-in-4096 same-ms) this produced two
    // pins where deleting one removed the other (findDeficiency returns
    // first-match). Mark hit this in production with pins #1 and #3 sharing
    // both def_1775136016191_7mh3 AND obs_1775136016191_g71x. The new _uid()
    // helper above prevents the outer collision; this loop prevents the
    // inner one.
    (newDefic.observations || []).forEach(function(o) {
      if (o) o.id = _uid('obs');
    });
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
    // S121 Push 13: renumber by ARRAY ORDER (= creation order = visual
    // tab order) instead of by current num value. The previous sort by
    // (a.num - b.num) was a no-op when nums were already sequential
    // (1, 2, 3 → 1, 2, 3) — Mark hit Renumber and saw nothing change.
    //
    // Card display in deficiencies.js _renderActiveTab / _renderGeneralTab
    // walks each contractor's `deficiencies` array in-order and emits
    // cards in that sequence. Same for `generalDeficiencies`. Every add
    // path does `.push()`, so array index reflects creation order.
    // Renumbering by index ⇒ pin numbers match the order the inspector
    // sees them on screen. Hitting Renumber after deletes/inserts now
    // visibly compacts the sequence (e.g., delete pin #2, hit Renumber:
    // pins #1 #3 #4 #5 → #1 #2 #3 #4).
    var ctrDefics = [];
    (_project.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(function(d) {
        ctrDefics.push(d);
      });
    });
    var genDefics = (_project.generalDeficiencies || []).slice();
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
