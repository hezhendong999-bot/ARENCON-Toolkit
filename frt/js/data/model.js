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

// S224: in-memory "recently moved" markers for the faded-with-Undo photo UX.
// Map: undoToken -> reversible descriptor of one move/copy op. Purely a
// session-scoped VISUAL marker — never saved to the project, never synced.
// Cleared on every setProject (so the fade is gone on reload/navigation).
// Each card whose live photo id is referenced by a live token renders faded
// with an Undo button; undoPhotoMove(token) reverses exactly that op.
var _recentMoves = {};

// S217: General-priority → Site Records migration gate. Ships DORMANT
// (false) so the data-rewriting migration never runs unattended. Mark
// flips it on with Model.enableGeneralMigration() while watching; the
// move is reversible via Model.revertGeneralMigration(). See the
// migration block in setProject() and the helpers on the Model object.
var _S217_MIGRATE_ENABLED = true;   // S221: flipped ON per Mark — auto-run General→Site Records migration on load (one-shot per pin via _generalMigrated; reversible via Model.revertGeneralMigration())

// S83: Inspector attribution state.
// app.js boot captures Auth.getUser() and pushes id here via Model.setCurrentUser(id).
// Every new entity is stamped with this id as createdBy. Never mutated after creation.
var _currentUserId = null;

// S143 (Phase 3 G/3.5): Inspector resolver. Maps a createdBy userId to a
// display shape { name, initials, color } for the on-card chip + PDF tag.
// Pure data layer — model.js has no Auth import, so app.js injects a batch
// fetch fn via Model.setInspectorFetch(). Resolver only does cache + shape.
var _inspectorCache = {};        // userId -> { name, initials, color }
var _inspectorFetch = null;      // injected: function(idArray) -> Promise<[{id,full_name}]>
var _inspectorPending = {};      // userId -> true while a fetch is in flight
// Deterministic id -> muted palette slot (reuses CONTRACTOR_COLOR_PALETTE so
// no new colors enter the system; stable per id across sessions).

var SAVE_DEBOUNCE_MS = 800;

// ═══════════════════════════════════════════════════════════════════════
// S284b (Mark) — PERMANENT FIX for photo-reference resurrection.
//
// Root cause of the recurring "deleted references come back" incidents:
// obs.photoSelection is a plain ID array. De-selecting removed the ID and
// left NO record of the deletion, so a stale client's 3-way merge could not
// distinguish "Mark deleted this" from "this device hasn't seen the add
// yet" — and the merge's delete-vs-modify default ("don't silently lose
// work") resurrected the deletion. Third recurrence as of 2026-06-11.
//
// Fix: a per-obs Last-Writer-Wins register stamped by EXPLICIT user intent:
//
//   obs.photoSelTs = { [photoId]: { s: 0|1, t: epoch_ms } }
//     s:0 = de-selected (tombstone)   s:1 = selected (re-add override)
//
// Writers stamp it alongside the legacy photoSelection mutation (legacy
// array stays for back-compat — old clients keep working off it).
// _reconcilePhotoSelectionsFn derives the effective selection from
// legacy-array + register at load and after every merge apply; merge.js
// resolves register conflicts per-photo by greater t (tie → s:0, the safe
// side) and unions both-changed photoSelection arrays WITHOUT conflict —
// reconcile prunes the union via tombstones immediately after.
//
// Hygiene rewrites (repairPhotoPool remap, load pruning) deliberately do
// NOT stamp — only user actions express intent. Register entries for
// photos gone from the pool are GC'd after ~60 days.
// ═══════════════════════════════════════════════════════════════════════
var SELTS_GC_MS = 60 * 24 * 3600 * 1000;  // 60 days

function _stampSelTs(obs, photoId, selected) {
  if (!obs || !photoId) return;
  if (!obs.photoSelTs) obs.photoSelTs = {};
  obs.photoSelTs[photoId] = { s: selected ? 1 : 0, t: Date.now() };
}

// S284b: observations historically had NO id field, so merge.js treated the
// whole observations array as an opaque scalar — any both-sides-changed merge
// CONFLICTED and defaulted to the stale side wholesale. That was the widest
// resurrection path of all (selections, text, status — everything rode it).
// Fix: every obs gets an id. New obs mint _uid('o') at creation; existing
// id-less obs get a DETERMINISTIC migration id ('o_' + defic.id + '_m' + idx)
// so two devices migrating the same base state mint IDENTICAL ids and
// converge under sync (a random id here would make _merge3IdArray see two
// different observations and duplicate them). Runs at load and after every
// merge apply (merged output can contain id-less obs from old clients).
function _ensureObsIdsFn(proj) {
  if (!proj) return 0;
  var assigned = 0;
  function walk(defics) {
    (defics || []).forEach(function(d) {
      if (!d) return;
      (d.observations || []).forEach(function(o, idx) {
        if (o && typeof o === 'object' && !o.id) {
          o.id = 'o_' + (d.id || 'd') + '_m' + idx;
          assigned++;
        }
      });
    });
  }
  (proj.contractors || []).forEach(function(c) { walk(c && c.deficiencies); });
  walk(proj.generalDeficiencies);
  if (assigned > 0) console.log('[Model] S284b: assigned deterministic ids to ' + assigned + ' observation(s)');
  return assigned;
}

function _reconcilePhotoSelectionsFn(proj) {
  if (!proj) return 0;
  var changed = 0;
  function walk(defics) {
    (defics || []).forEach(function(d) {
      if (!d) return;
      var liveIds = {};
      var liveList = [];
      (d.photos || []).forEach(function(p) {
        if (p && !p.deleted && p.id) { liveIds[p.id] = true; liveList.push(p.id); }
      });
      (d.observations || []).forEach(function(o) {
        if (!o || !o.photoSelTs) return;
        var ts = o.photoSelTs;
        var ids = Object.keys(ts);
        if (!ids.length) return;
        var wasNull = !Array.isArray(o.photoSelection);
        // base = current effective selection (null means the whole live pool)
        var base = wasNull ? liveList.slice() : o.photoSelection.slice();
        var next = base.filter(function(id) { return !(ts[id] && ts[id].s === 0); });
        ids.forEach(function(id) {
          if (ts[id].s === 1 && liveIds[id] && next.indexOf(id) === -1) next.push(id);
        });
        // GC: register entries for photos no longer in the pool, older than 60d
        var now = Date.now();
        ids.forEach(function(id) {
          if (!liveIds[id] && (now - (ts[id].t || 0)) > SELTS_GC_MS) delete ts[id];
        });
        if (Object.keys(ts).length === 0) delete o.photoSelTs;
        // Write back only on real change. A null (default-all) obs stays null
        // only if the derived set is exactly the full live pool AND no
        // tombstone exists (an exclusion can't be expressed by null).
        var hasTomb = ids.some(function(id) { return ts[id] && ts[id].s === 0 && liveIds[id]; });
        if (wasNull && !hasTomb && next.length === liveList.length) return;
        var same = Array.isArray(o.photoSelection)
          && o.photoSelection.length === next.length
          && o.photoSelection.every(function(id, i) { return id === next[i]; });
        if (!same) { o.photoSelection = next; changed++; }
      });
    });
  }
  (proj.contractors || []).forEach(function(c) { walk(c && c.deficiencies); });
  walk(proj.generalDeficiencies);
  if (changed > 0) console.log('[Model] S284b: reconciled ' + changed + ' photo selection(s) from LWW register');
  return changed;
}

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
  // S188 V-1: Dedup by drawing.id, NOT folder+name.
  // The old folder|name key silently dropped legitimate drawings with the
  // same filename in the same folder (e.g. coworker uploads "Site Plan" →
  // Mark uploads "Site Plan" → second is lost). True duplicates have the
  // same id; same name with different ids are different drawings. If a
  // drawing has no id (shouldn't happen — every code path assigns one),
  // fall back to a unique synthetic key so it survives the pass.
  var seen = {}, keep = [];
  proj.drawings.forEach(function(d, idx) {
    var key = d && d.id ? String(d.id) : ('__noid_' + idx);
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
 * S142 S1 (§2 redesign): the six prebuilt trades. "Building Conditions"
 * REMOVED (it was a non-trade catch-all — under Model 2 those land in
 * "Other Trade Items" / Site Records, not a trade). Added Electrical,
 * Mechanical, Civil so the Contractor Roster `+ trade ▾` dropdown offers
 * the full prebuilt set. Standpipe / Fire Pump / Extinguishers still roll
 * up under Sprinkler 99% of the time (same contractor scope) and any
 * one-off can be added via "+ new trade…".
 *
 * TRADE_LIST is the SEED for `project.projectTrades` on new/legacy
 * projects. Existing per-project `projectTrades` is the source-of-truth
 * after load. Existing obs.trade / contractor.trades values not in this
 * list (e.g. legacy "Standpipe", "Building Conditions", custom trades)
 * stay intact in JSON — the UI tolerates out-of-list trades and renders
 * them with a muted fallback colour (deficiencies.js _tradeColor).
 *
 * Trade colour is NAME-DERIVED only (deficiencies.js) — no schema field,
 * no migration; a deleted-then-re-added trade keeps its colour.
 *
 * Empty trades suppressed.
 */
export var TRADE_LIST = [
  'Sprinkler',
  'Fire Alarm',
  'General Contracting',
  'Electrical',
  'Mechanical',
  'Civil'
];

/**
 * S140 Batch 1 (Model 2 §4.1) — canonical label for the reserved
 * informational-only scope. This bucket is "Site Records": site
 * documentation (photos/notes), excluded from external reports by default
 * and NEVER a recommendation. Every module must reference this constant
 * instead of hardcoding the string, so the label can never drift between
 * the Detailed view, the PDF and the data model.
 */
export var SITE_RECORDS_LABEL = 'Site Records';

// Frozen back-compat token — the ONE place the pre-S140 bucket name is
// written. Old cloud snapshots / test JSON may still carry it as a saved
// contractor name; isSiteRecordsName() matches it so they keep grouping as
// Site Records with no data migration ("never migrate stored data" canon).
// Nothing else in the toolkit should spell this literal — reference the
// constant if you ever need it.
var _LEGACY_SITE_BUCKET_NAME = 'Site General';

/**
 * S140 Batch 1 — recognizes the reserved-scope bucket by display name.
 * Matches the canonical SITE_RECORDS_LABEL AND the frozen legacy token, so
 * any pre-S140 snapshot keeps grouping correctly with no data migration.
 *
 * @param {string} nm  A contractor/bucket display name.
 * @returns {boolean}
 */
export function isSiteRecordsName(nm) {
  return nm === SITE_RECORDS_LABEL || nm === _LEGACY_SITE_BUCKET_NAME;
}

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
// S283: brighter, separable contractor palette (replaces the desaturated set
// that made the by-contractor pie blend into mud). Drawn from the approved
// ARENCON Data-Viz palette (indigo/emerald/amber/cyan/rose/violet/green/blue).
// These are STORED on each contractor (c.color) and used in BOTH modes, so the
// values are mid-saturation: bright enough to separate on the light pie, not so
// neon they vibrate. NOTE: only NEW contractors get these; existing contractors
// keep their stored colour until deliberately remapped.
export var CONTRACTOR_COLOR_PALETTE = [
  '#5B5FD6', '#1E9E6F', '#D98A1E', '#1AA3C4',
  '#D2415C', '#8B6FE0', '#3E9E55', '#2C7FB8'
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
    _recentMoves = {};  // S224: drop faded-move markers on any project (re)load
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
    var _iarCleared = 0;  // S143: counts legacy IAR flags cleared this load
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
        // ── S143: legacy IAR flag clear (one-directional, idempotent) ──
        // IAR feature removed S135 (no rendering since S134). The flag
        // lingered in old JSON and could no longer be toggled off in-UI.
        // Clear iar:true → false at pin level. Touches ONLY iar — never
        // priority/status/dates. Idempotent: once cleared, nothing truthy
        // remains so re-loads are no-ops (no dirty churn). _iarCleared is
        // counted in the closure for a single console line (no UI noise).
        if (d.iar) { d.iar = false; _iarCleared++; }
        // ── S119: per-observation priority + addressed metadata backfill ──
        // Idempotent. Each obs gets its own priority (defaults to pin-level
        // priority if missing) so the pin editor's priority buttons can mutate
        // a single observation independently. Pin-level d.priority is kept as
        // a "last bulk-set" snapshot but is no longer the source of truth for
        // rendering — getEffectivePriority(d) reads from obs.
        // Also backfills addressedOnInstance/addressedDate so previously
        // closed observations get correctly filtered against currentFrtInstance.
        (d.observations || []).forEach(function(o) {
          // ── S151: per-obs recommendation backfill (idempotent, additive) ──
          // Pre-S151 data carried recommendation only at the pin level (S138).
          // The pin-level default ran above (d.isRecommendation defined here),
          // so inherit it onto EVERY obs: a legacy recommendation pin keeps
          // ALL its observations as recommendations — no data lost. Pin-level
          // d.isRecommendation is retained as a derived rollup, kept in sync
          // by setRecommendation / setObsRecommendation.
          if (o.isRecommendation === undefined) o.isRecommendation = !!d.isRecommendation;
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
          // S143: clear legacy per-obs IAR flag (same contract as pin-level).
          if (o.iar) { o.iar = false; _iarCleared++; }
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
    // S284 (Mark: "remap them all", option B — silent auto-migration): contractor
    // colours predating the S283 palette lock are remapped to the locked
    // CONTRACTOR_COLOR_PALETTE at load. Rule: any contractor whose stored colour
    // is NOT a member of the locked palette (old desaturated set, customs,
    // missing) gets the first palette colour not already used — walked in roster
    // order, so two devices migrating the same project concurrently converge to
    // identical results (safe under sync). Contractors already on a locked
    // palette colour are untouched, so re-loads are a no-op. Persists via the
    // normal save path like the other load-time normalizations (no forced save).
    (function _remapLegacyContractorColors() {
      var _ctrs = proj.contractors || [];
      var _inPal = {};
      CONTRACTOR_COLOR_PALETTE.forEach(function(c) { _inPal[c] = true; });
      var _used = [];
      _ctrs.forEach(function(c) { if (c && c.color && _inPal[c.color]) _used.push(c.color); });
      var _remapped = 0;
      _ctrs.forEach(function(c) {
        if (!c) return;
        if (c.color && _inPal[c.color]) return;
        var _col = nextContractorColor(_used);
        c.color = _col;
        _used.push(_col);
        _remapped++;
      });
      if (_remapped > 0) console.log('[Model] S284: remapped ' + _remapped + ' contractor colour(s) to the locked palette');
    })();
    // S284b (Mark: permanent fix for photo-reference resurrection): reconcile
    // every obs photoSelection against its per-photo LWW register
    // (obs.photoSelTs) so tombstoned de-selects stay deleted no matter what a
    // stale client pushed. Runs at load AND after every merge apply.
    _ensureObsIdsFn(proj);
    _reconcilePhotoSelectionsFn(proj);
    // S143: surface the IAR-clear count to the console (no UI toast — this
    // is a background normalization). Only logs when something changed;
    // re-loads of an already-cleared project stay silent.
    if (_iarCleared > 0) console.log('[Model] S143: cleared ' + _iarCleared + ' legacy IAR flag(s)');

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

    // ── S217: "General" priority retired → migrate to Site Records ──
    // The General priority is being removed tool-wide (board redesign,
    // Option A). General historically meant "informational, excluded from
    // the client report" — exactly what Site Records means. So any pin
    // whose EFFECTIVE priority is 'general' is moved into Site Records:
    //   1. every 'general' observation has its priority rewritten to 'low';
    //   2. if the pin sits under a contractor, the contractor is cleared
    //      and the pin is moved into generalDeficiencies (a true Site
    //      Record), matching General's prior "excluded from report" meaning.
    //
    // ⚠️ SAFETY GATE (added before any unattended deploy): this migration
    // REWRITES REAL PROJECT DATA, so it ships DORMANT. Model._S217_MIGRATE
    // defaults to false → on load the code does NOTHING to data. The board
    // already tolerates a stray 'general' (getEffectivePriority collapses it
    // to 'low'), so the new layout can be reviewed with the migration still
    // off. To run it, with Mark watching:
    //     Model.enableGeneralMigration()   // flips the flag + re-runs load
    // It is REVERSIBLE: each moved pin stores a _preS217 snapshot and the
    // project gets a _s217Backup manifest. To undo (before trusting it):
    //     Model.revertGeneralMigration()
    // One-shot + idempotent: each migrated pin is stamped _generalMigrated
    // so re-loads never re-run. Logs a single count to the console.
    if (!proj.generalDeficiencies) proj.generalDeficiencies = [];
    if (_S217_MIGRATE_ENABLED) {
      var _genMigrated = 0;
      var _s217Manifest = [];   // { deficId, fromContractorId } for revert
      var _deficIsGeneral = function(d) {
        if (!d) return false;
        if (d._generalMigrated) return false;           // already handled
        var obs = (d.observations && d.observations.length) ? d.observations : null;
        if (!obs) return (d.priority || 'high') === 'general';
        // EFFECTIVE general = has a general obs and no high/low obs.
        var hasHigh = false, hasLow = false, hasGen = false;
        for (var i = 0; i < obs.length; i++) {
          var p = obs[i].priority || d.priority || 'high';
          if (p === 'high') hasHigh = true;
          else if (p === 'low') hasLow = true;
          else if (p === 'general') hasGen = true;
        }
        return hasGen && !hasHigh && !hasLow;
      };
      var _snapshotPin = function(d, fromCtrId) {
        // Store enough to fully undo: pin-level priority, the contractor it
        // came from, and each obs's original priority by obs id.
        d._preS217 = {
          priority: d.priority,
          fromContractorId: fromCtrId || null,
          obs: (d.observations || []).map(function(o) { return { id: o.id, priority: o.priority }; })
        };
      };
      var _rewriteGeneralObsToLow = function(d) {
        if ((d.priority || 'high') === 'general') d.priority = 'low';
        (d.observations || []).forEach(function(o) {
          if ((o.priority || 'high') === 'general') o.priority = 'low';
        });
        d._generalMigrated = true;
      };
      // Pass A: contractored pins whose effective priority is general → move
      // to Site Records (clear contractor) AND rewrite their obs to low.
      (proj.contractors || []).forEach(function(c) {
        if (!c || !c.deficiencies) return;
        for (var i = c.deficiencies.length - 1; i >= 0; i--) {
          var d = c.deficiencies[i];
          if (_deficIsGeneral(d)) {
            _snapshotPin(d, c.id);
            _rewriteGeneralObsToLow(d);
            c.deficiencies.splice(i, 1);
            proj.generalDeficiencies.push(d);
            _s217Manifest.push({ deficId: d.id, fromContractorId: c.id });
            _genMigrated++;
          }
        }
      });
      // Pass B: loose pins already in Site Records that still carry a general
      // value — just rewrite to low (no move needed; already a Site Record).
      (proj.generalDeficiencies || []).forEach(function(d) {
        if (_deficIsGeneral(d)) {
          _snapshotPin(d, null);
          _rewriteGeneralObsToLow(d);
          _s217Manifest.push({ deficId: d.id, fromContractorId: null });
          _genMigrated++;
        }
      });
      if (_genMigrated > 0) {
        proj._s217Backup = { ts: new Date().toISOString(), moved: _s217Manifest };
        console.log('[Migrate S217] moved ' + _genMigrated + ' general-priority pin(s) \u2192 Site Records (reversible: Model.revertGeneralMigration())');
      }
    }

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
    // S284b: a merge is exactly when stale-client resurrection happens —
    // re-derive every photoSelection from the LWW register before the UI
    // sees the merged state. Obs ids first — merged output can contain
    // id-less observations from not-yet-updated clients.
    _ensureObsIdsFn(mergedProj);
    _reconcilePhotoSelectionsFn(mergedProj);
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
  // Site Records (instead of orphaning them, which is what removeContractor
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
    // Site Records defics (ctrId === null) always start untagged.
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
      priority: 'low',                     // S217: 'general' priority retired; obs default is 'high' (line below) which drives the effective priority — this pin-level value is a legacy fallback only.
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
        isRecommendation: false,             // S151: per-obs recommendation flag (additive; pin-level d.isRecommendation kept as a derived rollup)
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
      // S338: reopen stamp. Capture the closing instance (M) BEFORE clearing it,
      // then decide same-report vs cross-report:
      //   same-report  (closedOnInstance === currentFrtInstance) → misclick
      //     undo; reopen is SILENT — clear all reopen stamps, no marker.
      //   cross-report (closedOnInstance <  currentFrtInstance) → a prior
      //     report's closure is being undone; stamp reopenedOnInstance = current
      //     and reopenedFromInstance = M so the always-shown blue marker can read
      //     "Reopened FRT #N · was closed FRT #M". No hide toggle (Mark, S337):
      //     the marker documents a contractor's false closure → protects ARENCON.
      var _curInst = (_project && _project.currentFrtInstance) || 1;
      var _closedAt = f.defic.closedOnInstance;
      if (_closedAt != null && _closedAt < _curInst) {
        f.defic.reopenedOnInstance = _curInst;
        f.defic.reopenedFromInstance = _closedAt;
      } else {
        // same-report (or unknown closing instance) → silent, no marker
        f.defic.reopenedOnInstance = null;
        f.defic.reopenedFromInstance = null;
      }
      f.defic.closedDate = null;
      f.defic.closedOnInstance = null;
    }
    // S338: any move BACK to a closed state clears the reopen marker (the item
    // is closed again, so "Reopened" no longer applies). A subsequent reopen
    // re-derives the marker fresh from the new closing instance.
    if ((newStatus === 'closed' || newStatus === 'Addressed & Closed') &&
        oldStatus !== 'closed' && oldStatus !== 'Addressed & Closed') {
      f.defic.reopenedOnInstance = null;
      f.defic.reopenedFromInstance = null;
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

  // S338: batch reopen. Each id routes through updateDeficStatus(id,'open') so
  // the per-item reopen stamp / same-vs-cross-report logic fires identically to
  // a single reopen. Returns the count actually reopened (skips items that
  // weren't closed). One _queueSave covers them all (updateDeficStatus marks
  // _dirty + queues; we save once more at the end to be safe).
  reopenDeficiencies: function(ids) {
    if (!Array.isArray(ids) || !ids.length) return 0;
    var n = 0;
    var self = this;
    ids.forEach(function(id) {
      var f = self.findDeficiency(id);
      if (!f) return;
      var st = f.defic.status;
      if (st === 'closed' || st === 'Addressed & Closed' ||
          self.getEffectiveStatus(f.defic) === 'closed') {
        self.updateDeficStatus(id, 'open');
        n++;
      }
    });
    if (n) { _dirty = true; _queueSave(); }
    return n;
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
      // S209d (#5): a NEW observation starts EMPTY — photoSelection:[] means
      // "show no photos" (vs null = "show the whole pin pool"). Previously a
      // new obs defaulted to null and rendered every photo on the pin, which
      // read as the photos being duplicated onto the new obs. The user adds
      // photos to it deliberately. Existing obs are unaffected (their stored
      // selection is untouched).
      photoSelection: [],
      id: _uid('o'),                       // S284b: obs are id-keyed for merge
      notedOnInstance: inst,
      notedDate: today,
      addressed: false,
      isRecommendation: false,             // S151: per-obs rec flag. Deliberately does NOT inherit from sibling obs (unlike priority/trade) — rec classification is a deliberate per-item decision that routes the item in the principals' report.
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

    // Create the new deficiency under that contractor (or Site Records).
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
      // S338: re-closing clears any stale reopen marker (item is closed again).
      f.defic.reopenedOnInstance = null;
      f.defic.reopenedFromInstance = null;
    } else if (eff === 'open' && (f.defic.status === 'closed' || f.defic.status === 'Addressed & Closed')) {
      // S338: mirror the reopen stamp logic from updateDeficStatus. Capture the
      // closing instance before clearing; cross-report reopen gets the marker,
      // same-report (misclick) is silent.
      var _closedAt = f.defic.closedOnInstance;
      if (_closedAt != null && _closedAt < inst) {
        f.defic.reopenedOnInstance = inst;
        f.defic.reopenedFromInstance = _closedAt;
      } else {
        f.defic.reopenedOnInstance = null;
        f.defic.reopenedFromInstance = null;
      }
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

  // ── S217: General-migration controls (operator-gated, reversible) ──
  // enableGeneralMigration(): flip the dormant flag ON and re-run the load
  // pipeline so the migration executes NOW (with Mark watching). Returns the
  // number of pins moved. Re-running is safe (idempotent via _generalMigrated).
  enableGeneralMigration: function() {
    if (!_project) { console.warn('[S217] No project loaded.'); return 0; }
    _S217_MIGRATE_ENABLED = true;
    var before = (_project.generalDeficiencies || []).length;
    // Re-run setProject on the SAME live object → the migration block runs.
    this.setProject(_project);
    var after = (_project.generalDeficiencies || []).length;
    var moved = (_project._s217Backup && _project._s217Backup.moved) ? _project._s217Backup.moved.length : 0;
    this.saveNow && this.saveNow();
    console.log('[S217] Migration run. Site Records: ' + before + ' \u2192 ' + after + ' (moved ' + moved + '). Revert with Model.revertGeneralMigration().');
    return moved;
  },
  // revertGeneralMigration(): undo the most recent run using the per-pin
  // _preS217 snapshots + the _s217Backup manifest. Restores each moved pin
  // to its original contractor and its original obs priorities, then clears
  // the migration stamps so the data is exactly as before. Returns the count
  // restored. Safe no-op if nothing was migrated.
  revertGeneralMigration: function() {
    if (!_project) { console.warn('[S217] No project loaded.'); return 0; }
    var bk = _project._s217Backup;
    if (!bk || !bk.moved || !bk.moved.length) { console.log('[S217] Nothing to revert.'); return 0; }
    var restored = 0;
    bk.moved.forEach(function(entry) {
      // Find the pin in generalDeficiencies (that's where the migration put it).
      var arr = _project.generalDeficiencies || [];
      var idx = arr.findIndex(function(x) { return x.id === entry.deficId; });
      if (idx < 0) return;
      var d = arr[idx];
      var snap = d._preS217;
      if (snap) {
        // Restore pin-level + per-obs priorities.
        if (snap.priority !== undefined) d.priority = snap.priority;
        (snap.obs || []).forEach(function(os) {
          var o = (d.observations || []).find(function(x) { return x.id === os.id; });
          if (o) o.priority = os.priority;
        });
      }
      delete d._generalMigrated;
      delete d._preS217;
      // If it came from a contractor, move it back.
      if (entry.fromContractorId) {
        var ctr = (_project.contractors || []).find(function(c) { return c.id === entry.fromContractorId; });
        if (ctr) {
          if (!ctr.deficiencies) ctr.deficiencies = [];
          arr.splice(idx, 1);
          ctr.deficiencies.push(d);
        }
      }
      restored++;
    });
    delete _project._s217Backup;
    _S217_MIGRATE_ENABLED = false;   // back to dormant
    _dirty = true;
    _queueSave();
    this._notify('project', _project);
    console.log('[S217] Reverted ' + restored + ' pin(s). Migration flag back OFF.');
    return restored;
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
    // S217: 'general' priority retired — only high/low survive. Any legacy
    // 'general' value (pre-migration data, or a stray) collapses to 'low'
    // so it never silently disappears and never reintroduces a third tier.
    var hasHigh = false, hasLow = false;
    for (var i = 0; i < obs.length; i++) {
      var p = obs[i].priority || d.priority || 'high';
      if (p === 'high') hasHigh = true;
      else if (p === 'low' || p === 'general') hasLow = true;
    }
    if (hasHigh) return 'high';
    if (hasLow) return 'low';
    return (d.priority === 'general') ? 'low' : (d.priority || 'high');
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

  // ── S140 Batch 1 (Model 2 §4.3): canonical pin-trade derivation ──
  // SINGLE source of truth for "what trade does this pin belong to".
  // Before S140 this fallback existed NOWHERE — neither the Detailed
  // view nor pdf.js's _pinTrade applied step 2 — which is why a pin on
  // a contractor that was assigned a single trade via the Trade Board
  // (e.g. Vipond → Sprinkler) still rendered under "Untagged": the only
  // place a trade was ever written was at creation time (the S135
  // _inheritedTrade stamp on obs[0]), and that never re-ran when the
  // contractor's trade changed afterwards. Batches 2 (deficiencies.js
  // Detailed view) and 3 (pdf.js) BOTH call this so on-screen grouping
  // and the PDF agree and Trade Board assignment actually takes effect.
  //
  // Derivation order (Model 2 §4.3):
  //   1. obs[0].trade        — first observation's explicit trade, if set
  //   2. contractor.trades[0] — ONLY if the parent contractor has EXACTLY
  //                             one declared trade (ambiguous if 0 or 2+)
  //   3. ''                   — none; caller renders under "Other Trade
  //                             Items" (the word "Untagged" is retired)
  //
  // Pure read: never mutates, never stamps obs.trade (creation-time
  // inheritance stays in addDeficiency — this is the display/grouping
  // fallback only). `contractor` is the parent contractor record, or
  // null for Site Records / no-contractor pins.
  //
  // @param {object}  defic       deficiency/pin record
  // @param {?object} contractor  parent contractor record (or null)
  // @returns {string}            a trade string, or '' when none derivable
  derivePinTrade: function(defic, contractor) {
    if (defic) {
      var obs = defic.observations;
      if (Array.isArray(obs) && obs.length) {
        var t0 = obs[0] && obs[0].trade;
        if (t0 && String(t0).trim()) return String(t0).trim();
      } else if (defic.trade && String(defic.trade).trim()) {
        // Legacy defic with no observations array — honour a stray
        // pin-level trade if one somehow exists, else fall through.
        return String(defic.trade).trim();
      }
    }
    if (contractor && Array.isArray(contractor.trades) && contractor.trades.length === 1) {
      var sole = contractor.trades[0];
      if (sole && String(sole).trim()) return String(sole).trim();
    }
    return '';
  },

  // ── S146 B1: plural trade derivation (fan-out) ──
  // Companion to derivePinTrade (singular, UNCHANGED — Trade-Board and
  // any other callers keep using it). Returns an ARRAY of every trade a
  // pin should render under:
  //   1. explicit obs[0].trade set            -> [that]            (1)
  //   2. else legacy pin-level defic.trade set -> [that]            (1)
  //   3. else contractor has >=1 trade         -> ALL its trades    (N)
  //   4. else                                  -> []  (caller -> Other Trade Items)
  // Step 3 is the actual fix: an untagged pin on a multi-trade
  // contractor (e.g. Vipond = Sprinkler + Fire Alarm) now fans out to
  // EVERY assigned trade instead of collapsing to '' / Other Trade
  // Items. Pure read: never mutates, never stamps obs.trade. Trades are
  // trimmed + de-duped so a contractor with a repeated trade entry can't
  // emit two identical sections.
  derivePinTrades: function(defic, contractor) {
    if (defic) {
      var obs = defic.observations;
      if (Array.isArray(obs) && obs.length) {
        var t0 = obs[0] && obs[0].trade;
        if (t0 && String(t0).trim()) return [String(t0).trim()];
      } else if (defic.trade && String(defic.trade).trim()) {
        return [String(defic.trade).trim()];
      }
    }
    if (contractor && Array.isArray(contractor.trades) && contractor.trades.length) {
      var out = [];
      contractor.trades.forEach(function(tr) {
        var s = (tr == null) ? '' : String(tr).trim();
        if (s && out.indexOf(s) < 0) out.push(s);
      });
      if (out.length) return out;
    }
    return [];
  },

  // ── S208 Slice 1a: single-trade derivation ("show once") ──
  // Retires the S146/S147 fan-out for the Detailed list. A pin renders
  // under exactly ONE trade band:
  //   1. explicit obs[0].trade set            -> that
  //   2. else legacy pin-level defic.trade set -> that
  //   3. else contractor's FIRST declared trade (its "primary" trade)
  //   4. else                                  -> '' (caller -> Other Trade Items)
  // Differs from derivePinTrade (singular, UNCHANGED) at step 3: that one
  // only adopts the contractor trade when EXACTLY one exists (returns ''
  // on ambiguity); this one picks the first of several. Pure read: never
  // mutates, never stamps obs.trade.
  derivePinTradeSingle: function(defic, contractor) {
    if (defic) {
      var obs = defic.observations;
      if (Array.isArray(obs) && obs.length) {
        var t0 = obs[0] && obs[0].trade;
        if (t0 && String(t0).trim()) return String(t0).trim();
      } else if (defic.trade && String(defic.trade).trim()) {
        return String(defic.trade).trim();
      }
    }
    if (contractor && Array.isArray(contractor.trades) && contractor.trades.length) {
      for (var i = 0; i < contractor.trades.length; i++) {
        var s = (contractor.trades[i] == null) ? '' : String(contractor.trades[i]).trim();
        if (s) return s;
      }
    }
    return '';
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
  //     parentCtrName: parent contractor name (SITE_RECORDS_LABEL for the
  //                    reserved no-contractor scope),
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
            ? (d.num + String.fromCharCode(65 + oi))  // S269: 2B (no dash)
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
      emitForDefic(d, null, SITE_RECORDS_LABEL);
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

  // S266 — every observation, across EVERY pin, where a given photo appears.
  // Used by the gallery "open in editor" jump: resolve the photo's binary
  // identity, find all pins whose pool holds the same binary, and for each pin
  // list the obs indices that show it (default-state obs included, since they
  // show all pool photos). Returns ready-to-display entries:
  //   { deficId, num, obsIdx, label }   label e.g. "Pin 12 · Obs A"
  // Sorted by pin number then obs index. deficId/photoId identify the gallery
  // card's own pin+pool entry as the starting point for identity resolution.
  getAllObsReferencesForPhoto: function(deficId, photoId) {
    var out = [];
    if (!_project || !deficId || !photoId) return out;
    var self = this;
    var f = this.findDeficiency(deficId);
    if (!f || !f.defic) return out;
    // The binary identity of the card's photo (r2Key/sourceR2Key/byte-fallback).
    var srcPhoto = (f.defic.photos || []).filter(function(p) { return p && p.id === photoId; })[0];
    var key = srcPhoto ? this._photoIdentityKey(srcPhoto) : null;
    // Walk every pin; a pin is in scope if its own card pin OR it holds a pool
    // photo with the same binary identity. For each in-scope pin, find the pool
    // entry matching the identity and list the obs indices that show it.
    this.getAllDeficiencies(_project).forEach(function(d) {
      var defic = d.defic;
      var poolMatch = (defic.photos || []).filter(function(p) {
        if (!p || p.deleted) return false;
        if (defic.id === deficId && p.id === photoId) return true; // the card's own entry
        return key && self._photoIdentityKey(p) === key;
      })[0];
      if (!poolMatch) return;
      var obsIdxs = self.getObsIndicesUsingPoolPhoto(defic, poolMatch.id);
      obsIdxs.forEach(function(oi) {
        out.push({
          deficId: defic.id,
          num: defic.num,
          obsIdx: oi,
          label: 'Pin ' + (defic.num != null ? defic.num : '?') + ' \u00b7 Obs ' + String.fromCharCode(65 + oi)
        });
      });
    });
    out.sort(function(a, b) {
      var na = (a.num != null) ? a.num : 1e9, nb = (b.num != null) ? b.num : 1e9;
      if (na !== nb) return na - nb;
      return a.obsIdx - b.obsIdx;
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
      _stampSelTs(obs, photo.id, true);  // S284b: explicit add → LWW select
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
    var _dataUrl = typeof photoData === 'string' ? photoData : (photoData && photoData.dataUrl) || null;
    // S265 dedup: if this pin already has a LIVE pool entry for the same binary
    // (by r2Key, or by image bytes when not yet uploaded), reuse it rather than
    // creating a duplicate. opts.allowDuplicate bypasses (genuine re-capture of
    // the same scene is the user's call — see note below). This is what stops
    // markup/restore/re-add from minting redundant pool copies.
    if (!opts.allowDuplicate) {
      var probe = { r2Key: opts.r2Key || null, sourceR2Key: opts.sourceR2Key || opts.r2Key || null, dataUrl: _dataUrl, thumb: opts.thumb || null };
      var probeKey = this._photoIdentityKey(probe);
      if (probeKey) {
        for (var di = 0; di < f.defic.photos.length; di++) {
          var ex = f.defic.photos[di];
          if (ex && !ex.deleted && this._photoIdentityKey(ex) === probeKey) return ex;
        }
      }
    }
    var photo = {
      id: _uid('ph'),
      r2Key: opts.r2Key || null,
      sourceR2Key: opts.sourceR2Key || opts.r2Key || null,
      dataUrl: _dataUrl,
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
        if (o.photoSelection.indexOf(photoId) !== -1) {
          o.photoSelection = o.photoSelection.filter(function(id) { return id !== photoId; });
          _stampSelTs(o, photoId, false);  // S284b: pool delete tombstones each selection too
        }
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

  // S266 — release ONE live pool photo to Site Records, then soft-delete its
  // pool entry. Extracted from removeDeficiency's per-photo release loop so the
  // pin-editor ✕ ("Move to Site Records") and obs-delete ("Move photos to Site
  // Records") share one proven path. Binary is never destroyed: the R2 object
  // stays, and the photo reappears in the gallery as a site photo.
  //   - If the same binary is ALREADY a live site photo, skip the copy (no dup)
  //     but still soft-delete the pool entry (it's safely in Site Records).
  //   - If another pin still references the same binary, we still release a site
  //     copy here (the caller asked to move THIS pin's photo out) — the other
  //     pin keeps its own pool entry untouched.
  // Returns { ok, sited } — sited:true if a new site photo was created.
  releasePoolPhotoToSite: function(deficId, photoId) {
    var f = this.findDeficiency(deficId);
    if (!f) return { ok: false, sited: false };
    var pool = f.defic.photos || [];
    var p = pool.find(function(x) { return x && x.id === photoId; });
    if (!p || p.deleted) return { ok: false, sited: false };
    if (!_project) return { ok: false, sited: false };
    if (!Array.isArray(_project.photos)) _project.photos = [];
    var self = this;
    var key = this._photoIdentityKey(p);
    var alreadySite = key && _project.photos.some(function(sp) {
      return sp && !sp.deleted && self._photoIdentityKey(sp) === key;
    });
    var sited = false;
    if (!alreadySite) {
      var _siteRec = {
        id: _uid('ph'),
        r2Key: p.r2Key || null,
        sourceR2Key: p.sourceR2Key || p.r2Key || null,
        r2Url: p.r2Url || null,
        dataUrl: p.dataUrl || null,
        thumb: p.thumb || null,
        filename: p.filename || ('photo_' + Date.now() + '.jpg'),
        addedDate: p.addedDate || new Date().toISOString().split('T')[0],
        createdBy: p.createdBy || _currentUserId || null,
        r2Status: p.r2Status || undefined,
        _releasedFromPin: f.defic.num != null ? f.defic.num : true
      };
      // S358: carry never-bake markup vectors + rotation so a marked photo
      // released back to site keeps its marks (not clean at 0°).
      if (p._origBackupId) _siteRec._origBackupId = p._origBackupId;
      if (p._annotated)    _siteRec._annotated    = p._annotated;
      if (p._markupStrokes && p._markupStrokes.length) _siteRec._markupStrokes = JSON.parse(JSON.stringify(p._markupStrokes));
      if (p._mkFrame)                                   _siteRec._mkFrame       = { w: p._mkFrame.w, h: p._mkFrame.h };
      if (typeof p.rotation === 'number')               _siteRec.rotation       = p.rotation;
      _project.photos.push(_siteRec);
      sited = true;
    }
    // Soft-delete the pool entry (cascades out of selections + markups).
    this.removePoolPhoto(deficId, photoId);
    return { ok: true, sited: sited };
  },

  // S266 — true if a pool photo is shown by MORE THAN ONE observation on its
  // pin (default-state obs count, since they show every pool photo). Used by
  // obs-delete to leave shared photos alone (Mark's rule: only act on photos
  // unique to the observation being deleted).
  isPoolPhotoSharedAcrossObs: function(deficId, photoId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    return this.getObsIndicesUsingPoolPhoto(f.defic, photoId).length > 1;
  },

  // S266 — the pool photo ids that ONLY this observation shows (not any sibling
  // obs on the same pin). Drives obs-delete's "act only on unique photos" path.
  // Returns live (non-deleted) pool entries.
  getPhotosUniqueToObs: function(deficId, obsIdx) {
    var f = this.findDeficiency(deficId);
    if (!f) return [];
    var defic = f.defic;
    var obs = (defic.observations || [])[obsIdx];
    if (!obs) return [];
    var self = this;
    var effective = this.getEffectivePhotos(defic, obsIdx) || [];
    return effective.filter(function(p) {
      if (!p || p.deleted) return false;
      // shown by exactly one obs (this one) → unique
      return self.getObsIndicesUsingPoolPhoto(defic, p.id).length <= 1;
    });
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

  // S265 stage 2: Site-Records fallback (locked-spec Option 3). Restore is NEVER
  // blocked and a photo is NEVER lost: if the parent deficiency still exists,
  // restore in place (restorePoolPhoto). If the parent pin/deficiency is GONE,
  // move the photo into the project-level Site Records pool (proj.photos) instead
  // of failing. Returns { ok, fallback } where fallback=true means it landed in
  // Site Records. In Phase 1 the trash only surfaces photos whose parent exists,
  // so the fallback path is dormant until Phase 2 (whole-pin deletion) lands.
  restorePoolPhotoOrSiteFallback: function(deficId, photoId) {
    var f = this.findDeficiency(deficId);
    if (f) {
      var restored = this.restorePoolPhoto(deficId, photoId);
      return restored ? { ok: true, fallback: false, photo: restored } : { ok: false, fallback: false };
    }
    // Parent gone — search every pool for the orphaned photo, move to Site Records.
    if (!_project) return { ok: false, fallback: false };
    var found = null, srcPool = null;
    var allDefics = this.getAllDeficiencies(_project);
    for (var i = 0; i < allDefics.length; i++) {
      var pool = allDefics[i].defic.photos || [];
      var p = pool.find(function(x) { return x && x.id === photoId; });
      if (p) { found = p; srcPool = pool; break; }
    }
    if (!found || !found.deleted) return { ok: false, fallback: false };
    delete found.deleted;
    delete found.deletedDate;
    if (srcPool) {
      var idx = srcPool.indexOf(found);
      if (idx >= 0) srcPool.splice(idx, 1);
    }
    if (!Array.isArray(_project.photos)) _project.photos = [];
    _project.photos.push(found);
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'restore-site-fallback', photoId: photoId });
    return { ok: true, fallback: true, photo: found };
  },

  // Set per-obs photo selection. null = reset to default (all pool photos
  // visible to this obs). Array = custom subset of pool photo IDs. IDs
  // that aren't in the live pool (or are tombstoned) are filtered out.
  setObsPhotoSelection: function(deficId, obsIdx, photoIds) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var obs = (f.defic.observations || [])[obsIdx];
    if (!obs) return false;
    var _livePool = [];
    (f.defic.photos || []).forEach(function(p) { if (p && !p.deleted) _livePool.push(p.id); });
    if (photoIds === null || photoIds === undefined) {
      // S284b: explicit reset to dynamic default-all. LWW can't express
      // "all, including future pool additions", so the user's choice of
      // default clears the register for this obs (deliberate intent wins
      // over any stale tombstones).
      obs.photoSelection = null;
      delete obs.photoSelTs;
    } else if (Array.isArray(photoIds)) {
      var poolIds = {};
      _livePool.forEach(function(id) { poolIds[id] = true; });
      // S284b: diff the new selection against the PREVIOUS effective
      // selection (null = whole live pool) and stamp every change — the
      // bulk picker is pure user intent.
      var _prev = Array.isArray(obs.photoSelection) ? obs.photoSelection : _livePool;
      var _prevSet = {};
      _prev.forEach(function(id) { _prevSet[id] = true; });
      var _next = photoIds.filter(function(id) { return poolIds[id]; });
      var _nextSet = {};
      _next.forEach(function(id) { _nextSet[id] = true; });
      _next.forEach(function(id) { if (!_prevSet[id]) _stampSelTs(obs, id, true); });
      _prev.forEach(function(id) { if (!_nextSet[id]) _stampSelTs(obs, id, false); });
      obs.photoSelection = _next;
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
      // S284b: tombstone — this de-select must survive any stale-client merge.
      _stampSelTs(obs, photoId, false);
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

  // S225: ensure a pool photo IS shown by a specific obs (inverse of
  // removePhotoFromObs). Used when a move/copy targets a specific observation.
  //   - default-state obs (photoSelection null) already shows the whole pool →
  //     no-op (the photo is visible).
  //   - custom-state obs → add the id if missing.
  // Never touches the pool or sibling obs. Returns true if a change was made.
  addPhotoToObs: function(deficId, obsIdx, photoId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var obs = (f.defic.observations || [])[obsIdx];
    if (!obs) return false;
    if (!Array.isArray(obs.photoSelection)) {
      // Default-state shows the whole pool — normally a no-op, BUT an old
      // s:0 tombstone would hide the photo at reconcile; an explicit add
      // must override it (S284b).
      if (obs.photoSelTs && obs.photoSelTs[photoId] && obs.photoSelTs[photoId].s === 0) {
        _stampSelTs(obs, photoId, true);
        _dirty = true;
        _queueSave();
        this._notify('photo', { action: 'select', deficId: deficId, obsIdx: obsIdx, photoId: photoId });
        return true;
      }
      return false; // default shows all
    }
    if (obs.photoSelection.indexOf(photoId) === -1) {
      obs.photoSelection.push(photoId);
      _stampSelTs(obs, photoId, true);  // S284b: re-add outvotes any older tombstone
      _dirty = true;
      _queueSave();
      this._notify('photo', { action: 'select', deficId: deficId, obsIdx: obsIdx, photoId: photoId });
      return true;
    }
    return false;
  },

  // ── S205: cross-pin photo move / copy + reference query ──
  // A photo's identity ACROSS pins is its r2Key (the shared binary). Copying
  // a photo to another pin creates a NEW pool entry in the target defic that
  // SHARES the source r2Key/r2Url/thumb (no R2 re-upload) but gets its own
  // per-pool id (ids drive obs.photoSelection within a defic). The gallery
  // groups by r2Key to render one card with a pill per referencing pin.

  // Live (non-deleted) pool photo by id within a defic, or null.
  _findPoolPhoto: function(defic, photoId) {
    if (!defic || !Array.isArray(defic.photos)) return null;
    for (var i = 0; i < defic.photos.length; i++) {
      var p = defic.photos[i];
      if (p && p.id === photoId && !p.deleted) return p;
    }
    return null;
  },

  // Identity key for a pool photo (the shared binary). Prefer r2Key; fall
  // back to sourceR2Key for never-uploaded/legacy entries.
  // S265: a photo's identity for dedup. PRIMARY key is the shared binary
  // (r2Key/sourceR2Key). But a freshly-taken/attached photo that hasn't uploaded
  // yet has NO r2Key — previously that made this return null, which SKIPPED every
  // dedup guard and let the same physical image be added to a pool twice (the
  // duplicate-pool-entry / pool-orphan bug). Fall back to the image bytes
  // (dataUrl) or thumb so identical images dedup even before upload. Returns a
  // short stable string, or null only when there's truly nothing to compare.
  _photoIdentityKey: function(photo) {
    if (!photo) return null;
    // S371b: a forced Copy carries a unique _idSeed so it has its OWN identity
    // even before its R2 key lands (its bytes are identical to the source, which
    // would otherwise collapse them via the byte-fallback). Checked FIRST and
    // persisted, so the copy stays a distinct tile across reload + after upload.
    if (photo._idSeed) return 'seed:' + photo._idSeed;
    if (photo.r2Key) return 'r2:' + photo.r2Key;
    if (photo.sourceR2Key) return 'r2:' + photo.sourceR2Key;
    // pre-upload fallback: hash-ish of the local image bytes. dataUrl/thumb are
    // identical for the same captured/attached file, so this catches same-image
    // dupes that have no r2Key yet. Slice keeps the key bounded.
    var bytes = photo.dataUrl || photo.thumb || null;
    if (bytes && bytes.length > 64) return 'b:' + bytes.length + ':' + bytes.slice(0, 48) + bytes.slice(-16);
    if (bytes) return 'b:' + bytes;
    return null;
  },

  // Copy a pool photo from one defic to another, sharing the binary (r2Key).
  // Returns the target pool entry (new or pre-existing). Idempotent: if the
  // destination already has a live entry for the same binary, returns it
  // without duplicating. R2 is NOT touched — same object, two references.
  copyPhotoToPin: function(fromDeficId, photoId, toDeficId, forceCopy) {
    if (!fromDeficId || !toDeficId || fromDeficId === toDeficId) return null;
    var src = this.findDeficiency(fromDeficId);
    var dst = this.findDeficiency(toDeficId);
    if (!src || !dst) return null;
    var photo = this._findPoolPhoto(src.defic, photoId);
    if (!photo) return null;
    if (!Array.isArray(dst.defic.photos)) dst.defic.photos = [];
    // S362: explicit Copy (forceCopy) bypasses dedup — always a new reference.
    var key = forceCopy ? null : this._photoIdentityKey(photo);
    if (key) {
      for (var i = 0; i < dst.defic.photos.length; i++) {
        var ex = dst.defic.photos[i];
        if (ex && !ex.deleted && this._photoIdentityKey(ex) === key) {
          // S360: dedup hit (see copySitePhotoToPin) — flag so the caller can say
          // "already on Pin N" rather than a misleading "Copied".
          try { Object.defineProperty(ex, '_dedupExisting', { value: true, enumerable: false, configurable: true }); } catch(_) {}
          return ex;
        }
      }
    }
    var copy = {
      id: _uid('ph'),
      r2Key: photo.r2Key || null,
      sourceR2Key: photo.sourceR2Key || photo.r2Key || null,
      r2Url: photo.r2Url || null,
      dataUrl: photo.dataUrl || null,
      thumb: photo.thumb || null,
      filename: photo.filename || ('photo_' + Date.now() + '.jpg'),
      addedDate: photo.addedDate || new Date().toISOString().split('T')[0],
      createdBy: photo.createdBy || _currentUserId || null
    };
    // Carry markup linkage so a marked photo renders marked on the copy too
    // (marked binary is keyed off r2Key, which is shared — siblings sync).
    if (photo._origBackupId) copy._origBackupId = photo._origBackupId;
    if (photo._annotated)    copy._annotated    = photo._annotated;
    if (photo.r2Status)      copy.r2Status      = photo.r2Status;
    // S358: NEVER-BAKE markup lives entirely in vector fields (no marked binary
    // anymore). Without carrying these, the assigned copy renders CLEAN at 0° while
    // the source keeps its marks (the "markup + rotation vanish on assign" bug).
    // Deep-clone the stroke array so the copy owns its own data.
    if (photo._markupStrokes && photo._markupStrokes.length) copy._markupStrokes = JSON.parse(JSON.stringify(photo._markupStrokes));
    if (photo._mkFrame)                                       copy._mkFrame       = { w: photo._mkFrame.w, h: photo._mkFrame.h };
    if (typeof photo.rotation === 'number')                   copy.rotation       = photo.rotation;
    dst.defic.photos.push(copy);
    dst.defic._photoPoolMigrated = true;
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'copy-pin', fromDeficId: fromDeficId, toDeficId: toDeficId, photo: copy });
    return copy;
  },

  // Move a pool photo from one defic to another: copy to target, soft-delete
  // the source reference. The binary stays in R2 (never deleted).
  movePhotoToPin: function(fromDeficId, photoId, toDeficId) {
    if (!fromDeficId || !toDeficId || fromDeficId === toDeficId) return null;
    var copy = this.copyPhotoToPin(fromDeficId, photoId, toDeficId);
    if (!copy) return null;
    this.removePoolPhoto(fromDeficId, photoId);
    this._notify('photo', { action: 'move-pin', fromDeficId: fromDeficId, toDeficId: toDeficId, photo: copy });
    return copy;
  },

  // ── S224: Site → Pin ──────────────────────────────────────
  // Copy a SITE (gallery) photo onto a pin, sharing the binary (r2Key) exactly
  // like copyPhotoToPin. The binary already lives in R2 (the site photo has an
  // r2Key), so this mints a NEW pool reference (its own id) that SHARES the
  // binary — NEVER a URL copy, NEVER an R2 re-upload (canon Photo Model). Dedup:
  // if the target pin already has a live pool entry for the same binary, return
  // it without duplicating. Returns the target pool entry, or null.
  copySitePhotoToPin: function(siteIdx, toDeficId, forceCopy) {
    if (!_project || !Array.isArray(_project.photos)) return null;
    var src = _project.photos[siteIdx];
    if (!src || src.deleted) return null;
    var dst = this.findDeficiency(toDeficId);
    if (!dst) return null;
    if (!Array.isArray(dst.defic.photos)) dst.defic.photos = [];
    // S362: an EXPLICIT Copy (forceCopy) must always create a new reference, even
    // when the binary is already on this pin — that's what Copy means ("another
    // instance here"). Only the implicit/dedup path (Move, internal) collapses to
    // the existing entry.
    var key = forceCopy ? null : this._photoIdentityKey(src);
    if (key) {
      for (var i = 0; i < dst.defic.photos.length; i++) {
        var ex = dst.defic.photos[i];
        if (ex && !ex.deleted && this._photoIdentityKey(ex) === key) {
          // S360: dedup hit — this binary is already on the target pin. Return the
          // existing entry but flag it (non-enumerable, so it never persists) so the
          // caller can tell the truth ("already on Pin N") instead of "Copied".
          try { Object.defineProperty(ex, '_dedupExisting', { value: true, enumerable: false, configurable: true }); } catch(_) {}
          return ex;
        }
      }
    }
    // S371 (final): an EXPLICIT Copy must render as its OWN tile, not collapse
    // onto the source. The collapse came from _photoIdentityKey returning the
    // same 'r2:'+key for source and copy (it keys on r2Key, then sourceR2Key).
    // Fix: a forced copy gets a unique _idSeed (set below) that _photoIdentityKey
    // checks FIRST, so it is a distinct tile regardless of shared binary keys —
    // this is what makes Copy ≠ Move. Because identity no longer depends on the
    // keys, the copy SAFELY keeps the source's r2Url/dataUrl/thumb for RENDERING
    // (thumbnail + lightbox use thumb||r2Url||dataUrl) in the window before its
    // own binary uploads — without this the tile was blank + unopenable when the
    // source's bytes lived only in R2 (lazy, no inline dataUrl). deficiencies.js
    // then uploads the copy's binary under a fresh key and repoints r2Key/r2Url
    // to its own object. Date: the clean Site-Record backup keeps the ORIGINAL
    // date; this active copy is a NEW change so it carries TODAY (S365 split).
    var _isForced = !!forceCopy;
    var copy = {
      id: _uid('ph'),
      // r2Key stays null until the copy's OWN binary is uploaded (deficiencies.js).
      r2Key: _isForced ? null : (src.r2Key || null),
      sourceR2Key: src.sourceR2Key || src.r2Key || null,
      r2Url: src.r2Url || null,
      dataUrl: src.dataUrl || null,
      thumb: src.thumb || null,
      filename: src.filename || ('photo_' + Date.now() + '.jpg'),
      addedDate: _isForced ? new Date().toISOString().split('T')[0]
                           : (src.addedDate || new Date().toISOString().split('T')[0]),
      createdBy: src.createdBy || _currentUserId || null
    };
    // Unique identity seed (persisted) — checked first in _photoIdentityKey so a
    // forced copy never collapses onto its byte-identical source.
    if (_isForced) copy._idSeed = copy.id;
    // One-shot upload instruction for the caller (non-enumerable: never persisted/synced).
    if (_isForced) { try { Object.defineProperty(copy, '_needsOwnR2', { value: true, enumerable: false, configurable: true }); } catch(_) {} }
    if (src._origBackupId) copy._origBackupId = src._origBackupId;
    if (src._annotated)    copy._annotated    = src._annotated;
    if (src.r2Status)      copy.r2Status      = src.r2Status;
    // S358: carry never-bake markup vectors + display rotation onto the pin copy
    // (see copyPhotoToPin). Site→pin assign of a marked, rotated photo must keep
    // its marks + rotation, not show clean at 0°.
    if (src._markupStrokes && src._markupStrokes.length) copy._markupStrokes = JSON.parse(JSON.stringify(src._markupStrokes));
    if (src._mkFrame)                                     copy._mkFrame       = { w: src._mkFrame.w, h: src._mkFrame.h };
    if (typeof src.rotation === 'number')                copy.rotation       = src.rotation;
    dst.defic.photos.push(copy);
    dst.defic._photoPoolMigrated = true;
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'copy-site-to-pin', toDeficId: toDeficId, photo: copy });
    return copy;
  },

  // Move a SITE photo onto a pin: copy to the pin (shared binary), then remove
  // the site reference. Binary is never deleted from R2.
  moveSitePhotoToPin: function(siteIdx, toDeficId) {
    if (!_project || !Array.isArray(_project.photos)) return null;
    var src = _project.photos[siteIdx];
    if (!src || src.deleted) return null;
    var copy = this.copySitePhotoToPin(siteIdx, toDeficId);
    if (!copy) return null;
    // Remove the site entry (re-resolve index defensively — copy didn't splice)
    var idx = _project.photos.indexOf(src);
    var removedSite = (idx >= 0) ? _project.photos.splice(idx, 1)[0] : null;
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'move-site-to-pin', toDeficId: toDeficId, photo: copy });
    return { copy: copy, removedSite: removedSite };
  },

  // ── S225: move/copy markers + Undo (in-memory, session-scoped) ──
  // Two distinct affordances, recorded by the UI right after a successful op:
  //
  //   MOVE → the photo genuinely LEFT its origin. We render a faded GHOST tile
  //          at the ORIGIN slot (synthesized from the snapshot below — NOT live
  //          data) with an Undo button. Undo re-inserts the photo at origin and
  //          removes the reference the op created at the destination. This is
  //          where the user is still looking right after a move (the destination
  //          card has already re-rendered elsewhere). Origin-ghost model, S225.
  //
  //   COPY → nothing changed at origin; the new thing is the DESTINATION copy.
  //          We fade the live destination photo and put Undo on it. Undo removes
  //          the destination copy. (Copy is rare; this keeps it sensible.)
  //
  // Nothing here is saved or synced — _recentMoves is cleared on setProject.
  //
  // Marker shape (all in-memory):
  //   { token, mode:'move'|'copy',
  //     // ORIGIN (move only) — where the ghost renders + the snapshot to restore:
  //     origin: { type:'site', siteIdx } | { type:'pin', deficId, obsIdx } ,
  //     snapshot: <full photo record that was at origin> ,
  //     // DESTINATION reference the op created (to remove on undo):
  //     dest: { type:'site', photoId } | { type:'pin', deficId, photoId, obsIdx } }
  registerMove: function(desc) {
    if (!desc || !desc.mode) return null;
    var token = _uid('mv');
    desc.token = token;
    _recentMoves[token] = desc;
    return token;
  },

  // S226 COPY chip: is this LIVE photo id the ORIGIN of a recent copy? → token.
  // The chip renders on the original photo (which is still there) so Undo lives
  // at the origin for copies too, never at the destination.
  copyOriginTokenForPhoto: function(photoId) {
    if (!photoId) return null;
    for (var t in _recentMoves) {
      if (!_recentMoves.hasOwnProperty(t)) continue;
      var d = _recentMoves[t];
      if (d.mode === 'copy' && d.origin && d.origin.photoId === photoId) return t;
    }
    return null;
  },

  // S227 DESTINATION chip: is this live photo (at deficId/obsIdx) the thing a
  // recent move OR copy just LANDED there? → token. Lets the destination obs
  // show a "Just added · Undo" chip so a mis-clicked obs can be reversed right
  // where it landed. Matches on the dest pin + photoId (+ obsIdx when recorded).
  justAddedTokenForObsPhoto: function(deficId, obsIdx, photoId) {
    if (!photoId) return null;
    for (var t in _recentMoves) {
      if (!_recentMoves.hasOwnProperty(t)) continue;
      var d = _recentMoves[t];
      if (!d.dest || d.dest.type !== 'pin') continue;
      if (d.dest.deficId !== deficId || d.dest.photoId !== photoId) continue;
      if (d.dest.obsIdx != null && obsIdx != null && d.dest.obsIdx !== obsIdx) continue;
      return t;
    }
    return null;
  },

  // MOVE ghosts whose ORIGIN is the site gallery. Returns synthetic display
  // records [{ token, snapshot }] for the gallery renderer to draw as faded
  // ghost tiles. Pure visual — these photos are NOT in proj.photos anymore.
  siteOriginGhosts: function() {
    var out = [];
    for (var t in _recentMoves) {
      if (!_recentMoves.hasOwnProperty(t)) continue;
      var d = _recentMoves[t];
      if (d.mode === 'move' && d.origin && d.origin.type === 'site') {
        out.push({ token: t, snapshot: d.snapshot });
      }
    }
    return out;
  },

  // MOVE ghosts whose ORIGIN is a specific pin (optionally a specific obs).
  // Returns [{ token, snapshot }] for the pin-editor photo strip / gallery
  // defic rows to draw as faded ghosts.
  pinOriginGhosts: function(deficId, obsIdx) {
    var out = [];
    for (var t in _recentMoves) {
      if (!_recentMoves.hasOwnProperty(t)) continue;
      var d = _recentMoves[t];
      if (d.mode !== 'move' || !d.origin || d.origin.type !== 'pin') continue;
      if (d.origin.deficId !== deficId) continue;
      if (obsIdx != null && d.origin.obsIdx != null && d.origin.obsIdx !== obsIdx) continue;
      out.push({ token: t, snapshot: d.snapshot });
    }
    return out;
  },

  // Reverse exactly one move/copy by token. Idempotent. Returns true on success.
  undoPhotoMove: function(token) {
    var d = _recentMoves[token];
    if (!d) return false;
    delete _recentMoves[token];  // consume first (idempotent)

    // 1) Remove the reference the op created at the destination.
    if (d.dest) {
      if (d.dest.type === 'pin') {
        var df = this.findDeficiency(d.dest.deficId);
        if (df && Array.isArray(df.defic.photos)) {
          var di = df.defic.photos.findIndex(function(p) { return p && p.id === d.dest.photoId; });
          if (di >= 0) df.defic.photos.splice(di, 1);
          // also drop it from a narrowed obs selection if the copy targeted one
          if (d.dest.obsIdx != null) {
            var dobs = (df.defic.observations || [])[d.dest.obsIdx];
            if (dobs && Array.isArray(dobs.photoSelection)) {
              dobs.photoSelection = dobs.photoSelection.filter(function(id) { return id !== d.dest.photoId; });
              _stampSelTs(dobs, d.dest.photoId, false);  // S284b
            }
          }
        }
      } else if (d.dest.type === 'site') {
        if (_project && Array.isArray(_project.photos)) {
          var si = _project.photos.findIndex(function(p) { return p && p.id === d.dest.photoId; });
          if (si >= 0) _project.photos.splice(si, 1);
        }
      }
    }

    // 2) MOVE only — restore the photo at its ORIGIN from the snapshot.
    if (d.mode === 'move' && d.origin && d.snapshot) {
      if (d.origin.type === 'site') {
        if (!_project.photos) _project.photos = [];
        // restore near original index if still valid, else append
        var at = (typeof d.origin.siteIdx === 'number' && d.origin.siteIdx <= _project.photos.length)
          ? d.origin.siteIdx : _project.photos.length;
        _project.photos.splice(at, 0, d.snapshot);
      } else if (d.origin.type === 'pin') {
        var of = this.findDeficiency(d.origin.deficId);
        if (of) {
          if (!Array.isArray(of.defic.photos)) of.defic.photos = [];
          // re-add to the pool if a live entry for this id is gone
          var exists = of.defic.photos.some(function(p) { return p && p.id === d.snapshot.id && !p.deleted; });
          if (!exists) {
            // clear any tombstone then push the snapshot back
            var tomb = of.defic.photos.findIndex(function(p) { return p && p.id === d.snapshot.id; });
            if (tomb >= 0) of.defic.photos.splice(tomb, 1);
            of.defic.photos.push(d.snapshot);
          } else {
            // pool entry still present but tombstoned → restore it
            this.restorePoolPhoto(d.origin.deficId, d.snapshot.id);
          }
          // if the origin obs had a narrowed selection, re-add the id
          if (d.origin.obsIdx != null) {
            var oobs = (of.defic.observations || [])[d.origin.obsIdx];
            if (oobs && Array.isArray(oobs.photoSelection) && oobs.photoSelection.indexOf(d.snapshot.id) === -1) {
              oobs.photoSelection.push(d.snapshot.id);
              _stampSelTs(oobs, d.snapshot.id, true);  // S284b
            }
          }
        }
      }
    }

    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'undo-move', token: token });
    return true;
  },

  // All live pin references to a binary, for the gallery pills. Each entry:
  // { deficId, num, priority }. Optionally exclude one defic (used by the
  // release-on-delete check). A photo may be referenced by N pins.
  getPinReferencesForR2Key: function(r2Key, excludeDeficId) {
    var out = [];
    if (!r2Key || !_project) return out;
    var self = this;
    this.getAllDeficiencies(_project).forEach(function(d) {
      var defic = d.defic;
      if (excludeDeficId && defic.id === excludeDeficId) return;
      var hit = (defic.photos || []).some(function(p) {
        return p && !p.deleted && self._photoIdentityKey(p) === r2Key;
      });
      if (hit) out.push({ deficId: defic.id, num: defic.num, priority: defic.priority });
    });
    return out;
  },

  // ── S283: Photo pool Repair (admin). Wraps the integrity-check classes into
  // a one-tap cleanup. Two problems, two treatments (S265 learning — they are
  // distinct):
  //   DUPLICATES: two+ live pool entries on the SAME pin sharing one identity
  //     key (_photoIdentityKey). Always safe to collapse to one — an identical
  //     live sibling survives. Any obs.photoSelection pointing at a removed
  //     duplicate id is repointed to the survivor's id (no obs loses its photo).
  //   ORPHANS: a live pool entry referenced by ZERO obs (integrity CLASS 5).
  //     Unique image with no home. Default = RE-HOME to the pin's first obs
  //     (add to its photoSelection; flip a default-mode obs to a custom array
  //     first so the attach sticks). Opt = DELETE (soft-delete; binary in R2 is
  //     untouched, matching the never-destroy-binary rule).
  // opts.orphanMode: 'rehome' (default) | 'delete'. opts.dryRun: count only.
  // Returns {dupesRemoved, orphansRehomed, orphansDeleted, pinsTouched}. Does
  // NOT push to cloud itself — caller saves; field-verify gated.
  repairPhotoPool: function(opts) {
    opts = opts || {};
    var orphanMode = opts.orphanMode === 'delete' ? 'delete' : 'rehome';
    var dryRun = !!opts.dryRun;
    var self = this;
    var res = { dupesRemoved: 0, orphansRehomed: 0, orphansDeleted: 0, pinsTouched: 0 };
    if (!_project) return res;

    this.getAllDeficiencies(_project).forEach(function(entry) {
      var d = entry.defic;
      var pool = d.photos || [];
      if (!pool.length) return;
      var touched = false;

      // ── Pass 1: collapse duplicate live pool entries (same identity key) ──
      var seenByKey = Object.create(null);   // identityKey → survivor id
      var remap = Object.create(null);       // removed id → survivor id
      pool.forEach(function(p) {
        if (!p || p.deleted || !p.id) return;
        var key = self._photoIdentityKey(p);
        if (!key) return;                    // can't compare — leave alone
        if (seenByKey[key] === undefined) {
          seenByKey[key] = p.id;             // first occurrence = survivor
        } else if (seenByKey[key] !== p.id) {
          remap[p.id] = seenByKey[key];      // mark this one for removal
        }
      });
      var dupIds = Object.keys(remap);
      if (dupIds.length) {
        res.dupesRemoved += dupIds.length;
        touched = true;
        if (!dryRun) {
          // Repoint any obs custom-selection referencing a removed dup → survivor
          (d.observations || []).forEach(function(o) {
            if (!o || !Array.isArray(o.photoSelection)) return;
            var next = [];
            o.photoSelection.forEach(function(pid) {
              var to = remap[pid] || pid;
              if (next.indexOf(to) === -1) next.push(to);
            });
            o.photoSelection = next;
            // S284b: carry LWW register entries across the remap so prior
            // user intent follows the surviving id (no new stamps — this is
            // hygiene, not intent; on collision the survivor's entry wins).
            if (o.photoSelTs) {
              Object.keys(o.photoSelTs).forEach(function(pid) {
                if (remap[pid]) {
                  var to = remap[pid];
                  if (!o.photoSelTs[to]) o.photoSelTs[to] = o.photoSelTs[pid];
                  delete o.photoSelTs[pid];
                }
              });
            }
            // Carry markup across the merge if the survivor lacks it
            if (o.photoMarkups) {
              Object.keys(o.photoMarkups).forEach(function(pid) {
                if (remap[pid] && !o.photoMarkups[remap[pid]]) {
                  o.photoMarkups[remap[pid]] = o.photoMarkups[pid];
                }
                if (remap[pid]) delete o.photoMarkups[pid];
              });
            }
          });
          // Drop the duplicate pool entries
          d.photos = pool.filter(function(p) { return !(p && remap[p.id]); });
          pool = d.photos;
        }
      }

      // ── Pass 2: orphans — live pool entries referenced by zero obs ──
      var refd = Object.create(null);
      (d.observations || []).forEach(function(o) {
        if (!o) return;
        if (Array.isArray(o.photoSelection)) {
          o.photoSelection.forEach(function(pid) { refd[pid] = true; });
        } else {
          // default-mode obs implicitly references every live pool photo
          pool.forEach(function(p) { if (p && !p.deleted) refd[p.id] = true; });
        }
      });
      var orphans = pool.filter(function(p) { return p && !p.deleted && !refd[p.id]; });
      if (orphans.length) {
        touched = true;
        if (orphanMode === 'delete') {
          res.orphansDeleted += orphans.length;
          if (!dryRun) orphans.forEach(function(p) { p.deleted = true; });
        } else {
          // RE-HOME to the pin's first obs. If that obs is default-mode
          // (photoSelection == null), it already shows the whole pool — so the
          // orphan is only orphaned because EVERY obs is custom-mode. Flip the
          // first obs to a custom array seeded with the current effective set,
          // then add the orphan, so nothing else visually changes.
          var obs0 = (d.observations || [])[0];
          if (obs0) {
            res.orphansRehomed += orphans.length;
            if (!dryRun) {
              if (!Array.isArray(obs0.photoSelection)) {
                // seed with everything obs0 currently shows (the live pool)
                obs0.photoSelection = pool
                  .filter(function(p) { return p && !p.deleted; })
                  .map(function(p) { return p.id; });
              }
              orphans.forEach(function(p) {
                if (obs0.photoSelection.indexOf(p.id) === -1) obs0.photoSelection.push(p.id);
              });
            }
          } else {
            // No obs at all (legacy 0-obs pin) — can't re-home; soft-delete so
            // it stops tripping the orphan check. Counted as deleted, truthful.
            res.orphansDeleted += orphans.length;
            if (!dryRun) orphans.forEach(function(p) { p.deleted = true; });
          }
        }
      }

      if (touched) res.pinsTouched++;
    });

    if (!dryRun && (res.dupesRemoved || res.orphansRehomed || res.orphansDeleted)) {
      _dirty = true;
      _queueSave();
      this._notify('project', _project);
    }
    return res;
  },

  removeDeficiency: function(deficId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    // S205 — release this pin's photos before splicing. For each live pool
    // photo: if NO other pin references the same binary, convert it to a site
    // photo (push to proj.photos) so it survives in the gallery. If another
    // pin still references it, drop only this pin's reference (the splice
    // does that). Binaries are never deleted. Mirrors Mark's rule: deleting a
    // pin releases its photos to the gallery, it does not destroy them.
    if (_project) {
      var self = this;
      if (!Array.isArray(_project.photos)) _project.photos = [];
      (f.defic.photos || []).forEach(function(p) {
        if (!p || p.deleted) return;
        var key = self._photoIdentityKey(p);
        var refsElsewhere = key
          ? self.getPinReferencesForR2Key(key, deficId).length > 0
          : false;
        if (refsElsewhere) return; // still on another pin — nothing to release
        // Avoid duplicating an existing site photo for the same binary
        var already = _project.photos.some(function(sp) {
          return sp && !sp.deleted && self._photoIdentityKey(sp) === key;
        });
        if (already) return;
        var _relRec = {
          id: _uid('ph'),
          r2Key: p.r2Key || null,
          sourceR2Key: p.sourceR2Key || p.r2Key || null,
          r2Url: p.r2Url || null,
          dataUrl: p.dataUrl || null,
          thumb: p.thumb || null,
          filename: p.filename || ('photo_' + Date.now() + '.jpg'),
          addedDate: p.addedDate || new Date().toISOString().split('T')[0],
          createdBy: p.createdBy || _currentUserId || null,
          r2Status: p.r2Status || undefined,
          _releasedFromPin: f.defic.num != null ? f.defic.num : true
        };
        // S358: carry never-bake markup vectors + rotation (see releasePoolPhotoToSite).
        if (p._origBackupId) _relRec._origBackupId = p._origBackupId;
        if (p._annotated)    _relRec._annotated    = p._annotated;
        if (p._markupStrokes && p._markupStrokes.length) _relRec._markupStrokes = JSON.parse(JSON.stringify(p._markupStrokes));
        if (p._mkFrame)                                   _relRec._mkFrame       = { w: p._mkFrame.w, h: p._mkFrame.h };
        if (typeof p.rotation === 'number')               _relRec.rotation       = p.rotation;
        _project.photos.push(_relRec);
      });
    }
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

  // S265 Photo-Trash Phase 1 stage 2: site-photo delete is now SOFT (sets
  // deleted/deletedDate, keeps R2 + array slot) so site photos join Recently
  // Deleted alongside defic photos. The index does NOT shift, so any cached
  // siteIdx stays valid. Idempotent: re-deleting a deleted photo is a no-op.
  removeSitePhoto: function(photoIdx) {
    if (!_project || !_project.photos) return null;
    if (photoIdx < 0 || photoIdx >= _project.photos.length) return null;
    var photo = _project.photos[photoIdx];
    if (!photo || photo.deleted) return null;
    photo.deleted = true;
    photo.deletedDate = new Date().toISOString();
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'remove-site', photoIdx: photoIdx });
    return photo;
  },

  // S265 stage 2: restore a soft-deleted site photo (clears the flags).
  // Idempotent: restoring a not-deleted photo returns false.
  restoreSitePhoto: function(photoIdx) {
    if (!_project || !_project.photos) return false;
    if (photoIdx < 0 || photoIdx >= _project.photos.length) return false;
    var photo = _project.photos[photoIdx];
    if (!photo || !photo.deleted) return false;
    delete photo.deleted;
    delete photo.deletedDate;
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'restore-site', photoIdx: photoIdx });
    return photo;
  },

  // S265 stage 2: PERMANENT delete of a soft-deleted SITE photo — removes the
  // pool entry entirely (the array slot is spliced). Leaves the R2 object in
  // place (a later sweep can reclaim; avoids R2 DELETE/auth complexity now).
  // Only acts on photos already marked deleted (must go through trash first).
  // Returns true on removal.
  purgeSitePhoto: function(photoIdx) {
    if (!_project || !_project.photos) return false;
    if (photoIdx < 0 || photoIdx >= _project.photos.length) return false;
    var photo = _project.photos[photoIdx];
    if (!photo || !photo.deleted) return false;
    _project.photos.splice(photoIdx, 1);
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'purge-site' });
    return true;
  },

  // S265 stage 2: PERMANENT delete of a soft-deleted DEFIC pool photo. Removes
  // the pool entry. Leaves R2 untouched (same rationale as purgeSitePhoto).
  // Only acts on already-deleted photos. Returns true on removal.
  purgePoolPhoto: function(deficId, photoId) {
    var f = this.findDeficiency(deficId);
    if (!f) return false;
    var pool = f.defic.photos || [];
    var i = pool.findIndex(function(p) { return p && p.id === photoId; });
    if (i < 0) return false;
    if (!pool[i].deleted) return false;
    pool.splice(i, 1);
    _dirty = true;
    _queueSave();
    this._notify('photo', { action: 'purge-pool', deficId: deficId, photoId: photoId });
    return true;
  },

  // S265 stage 2: 30-day auto-purge. Permanently removes soft-deleted photos
  // (both site + defic pool) whose deletedDate is older than retentionDays.
  // Called once on project load. Returns the count purged. Leaves R2 in place.
  purgeExpiredPhotos: function(retentionDays) {
    if (!_project) return 0;
    var cutoff = Date.now() - (retentionDays || 30) * 86400000;
    var purged = 0;
    var isExpired = function(p) {
      if (!p || !p.deleted) return false;
      var t = p.deletedDate ? new Date(p.deletedDate).getTime() : 0;
      return t > 0 && t < cutoff;
    };
    // site photos
    if (Array.isArray(_project.photos)) {
      for (var i = _project.photos.length - 1; i >= 0; i--) {
        if (isExpired(_project.photos[i])) { _project.photos.splice(i, 1); purged++; }
      }
    }
    // defic pool photos
    var allDefics = this.getAllDeficiencies(_project);
    allDefics.forEach(function(d) {
      var pool = d.defic.photos;
      if (!Array.isArray(pool)) return;
      for (var j = pool.length - 1; j >= 0; j--) {
        if (isExpired(pool[j])) { pool.splice(j, 1); purged++; }
      }
    });
    if (purged > 0) { _dirty = true; _queueSave(); this._notify('photo', { action: 'purge-expired', count: purged }); }
    return purged;
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

  // S151 (Mark): recommendation is now PER-OBSERVATION. setRecommendation is
  // the whole-pin convenience — it sets EVERY observation (used by the
  // add-deficiency modal, where a fresh pin has exactly one obs). The
  // pin-level d.isRecommendation is retained as a DERIVED ROLLUP (true iff
  // any obs is a recommendation) so legacy readers / JSON round-trip / merge
  // stay valid through the per-obs migration. Fully reversible, no data lost.
  setRecommendation: function(deficId, val) {
    var f = this.findDeficiency(deficId);
    if (!f || !f.defic) return false;
    var v = !!val;
    (f.defic.observations || []).forEach(function(o) { if (o) o.isRecommendation = v; });
    f.defic.isRecommendation = v;   // rollup stays consistent (every obs == v)
    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'set-recommendation', deficId: deficId, isRecommendation: v });
    return true;
  },

  // S151 (Mark): per-observation recommendation setter. Sets ONE obs, then
  // recomputes the pin-level rollup (true iff ANY obs is a recommendation).
  // This is what the per-obs star in Detailed/Table/Board will call so that
  // #1A and #1B flip independently. Same persist/notify idiom; the notify
  // carries obsIdx so the in-place flip can target the single (defic,obs).
  setObsRecommendation: function(deficId, obsIdx, val) {
    var f = this.findDeficiency(deficId);
    if (!f || !f.defic) return false;
    var obs = f.defic.observations || [];
    if (obsIdx < 0 || obsIdx >= obs.length || !obs[obsIdx]) return false;
    obs[obsIdx].isRecommendation = !!val;
    f.defic.isRecommendation = obs.some(function(o) { return o && o.isRecommendation; });
    _dirty = true;
    _queueSave();
    this._notify('deficiency', { action: 'set-recommendation', deficId: deficId, obsIdx: obsIdx, isRecommendation: !!val });
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
    // S151: keep the derived rollup consistent on the clone. The JSON clone
    // already carries per-obs isRecommendation correctly; this just re-asserts
    // the pin-level rollup invariant defensively.
    newDefic.isRecommendation = (newDefic.observations || []).some(function(o) { return o && o.isRecommendation; });
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
      all.push({ defic: d, contractorName: SITE_RECORDS_LABEL, contractorId: null });
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

  // ── S143: Inspector resolver (Phase 3 G/3.5) ────────────────
  // app.js injects an Auth-backed batch fetcher in Batch B. fn receives an
  // array of userIds, returns Promise resolving to [{id, full_name}, ...].
  setInspectorFetch: function(fn) { _inspectorFetch = (typeof fn === 'function') ? fn : null; },

  _inspectorColor: function(userId) {
    if (!userId) return null;
    var h = 0, s = String(userId);
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    var idx = Math.abs(h) % CONTRACTOR_COLOR_PALETTE.length;
    return CONTRACTOR_COLOR_PALETTE[idx];
  },

  _inspectorInitials: function(name) {
    var n = (name || '').trim();
    if (!n) return '\u2014';
    var parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  },

  // Synchronous. Returns the chip shape immediately.
  //  - createdBy null/legacy  -> { name:'\u2014', initials:'\u2014', color:null } (neutral, no fetch)
  //  - cached                 -> resolved shape
  //  - unknown                -> provisional { name:'', initials:'\u2014', color } + bg batch fetch
  resolveInspector: function(userId) {
    if (!userId) return { name: '\u2014', initials: '\u2014', color: null };
    if (_inspectorCache[userId]) return _inspectorCache[userId];
    if (userId === _currentUserId) {
      // Self is special-cased by app.js (it already knows the signed-in
      // name); seed a color-only provisional so the chip paints instantly.
      var pSelf = { name: '', initials: '\u2014', color: this._inspectorColor(userId) };
      this.primeInspectors([userId]);
      return pSelf;
    }
    this.primeInspectors([userId]);
    return { name: '', initials: '\u2014', color: this._inspectorColor(userId) };
  },

  // Directly seed/override a resolved entry (app.js uses this for the
  // signed-in user, whose name it already resolved at boot).
  setInspectorEntry: function(userId, name) {
    if (!userId) return;
    _inspectorCache[userId] = {
      name: (name || '').trim(),
      initials: this._inspectorInitials(name),
      color: this._inspectorColor(userId)
    };
    this._notify('inspectors', { userId: userId });
  },

  // Batch warm the cache for a set of ids. Debounced via _inspectorPending so
  // the same id isn't fetched twice while a request is in flight.
  primeInspectors: function(userIds) {
    if (!_inspectorFetch) return;
    var want = [];
    (userIds || []).forEach(function(id) {
      if (!id) return;
      if (_inspectorCache[id] || _inspectorPending[id]) return;
      _inspectorPending[id] = true;
      want.push(id);
    });
    if (!want.length) return;
    var self = this;
    Promise.resolve(_inspectorFetch(want)).then(function(rows) {
      (rows || []).forEach(function(r) {
        if (!r || !r.id) return;
        var nm = (r.full_name || '').trim();
        _inspectorCache[r.id] = {
          name: nm,
          initials: self._inspectorInitials(nm),
          color: self._inspectorColor(r.id)
        };
      });
      // Any id that came back with no row: cache a color-only entry so we
      // don't refetch forever (e.g. deleted profile).
      want.forEach(function(id) {
        if (!_inspectorCache[id]) {
          _inspectorCache[id] = { name: '', initials: '\u2014', color: self._inspectorColor(id) };
        }
        delete _inspectorPending[id];
      });
      self._notify('inspectors', { userIds: want });
    }).catch(function(e) {
      console.warn('[Model] inspector fetch failed:', e);
      want.forEach(function(id) { delete _inspectorPending[id]; });
    });
  },

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

  // S351b: mark the project dirty so an edit reaches the CLOUD on the next push,
  // not just IDB. saveNow() alone only writes IDB; the cloud push fires on the
  // _dirty flag. A field saved via saveNow() but not marked dirty (e.g. photo
  // rotation) is overwritten by the next cloud pull. touch() fixes that.
  touch: function() {
    _dirty = true;
    _queueSave();
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

// S340: expose Model for console diagnostics (read-only debugging hook).
try { if (typeof window !== 'undefined') window._frtModel = Model; } catch(_){}
