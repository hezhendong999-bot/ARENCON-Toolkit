/**
 * ARENCON FRT v2 — Data Model
 * ═══════════════════════════
 * 
 * Single source of truth for all project data.
 * 
 * Architecture:
 *   - In-memory state: one `_project` object
 *   - All reads go through getters (cached where expensive)
 *   - All writes go through mutation methods
 *   - Mutations: update memory → queue IDB write → queue sync → notify UI
 *   - UI subscribes to changes via onChange()
 * 
 * Phase 1 will implement:
 *   - Normalized in-memory state
 *   - Cached getAllDeficiencies()
 *   - Event-driven change notifications
 *   - Undo/redo stack
 *   - Dirty tracking for beforeunload
 */

// ── Internal State ───────────────────────────────────────
let _project = null;
let _dirty = false;
let _listeners = {};

// ── Public API ───────────────────────────────────────────
export const Model = {

  /**
   * Get the current project object.
   * Returns null if no project is loaded.
   */
  getProject() {
    return _project;
  },

  /**
   * Set the entire project (used on load).
   * Notifies all listeners.
   */
  setProject(proj) {
    _project = proj;
    _dirty = false;
    this._notify('project', proj);
  },

  /**
   * Get all deficiencies across all contractors + general.
   * Returns array of { defic, ctrId, ctrName } objects.
   * Cached — cache invalidated on deficiency mutations.
   */
  getAllDeficiencies() {
    // TODO Phase 1: implement with caching
    return [];
  },

  /**
   * Get a single deficiency by ID.
   */
  getDeficiency(id) {
    // TODO Phase 1
    return null;
  },

  /**
   * Update a deficiency. Merges `changes` into existing deficiency.
   * Triggers IDB write + sync queue + UI notification.
   */
  updateDeficiency(id, changes) {
    // TODO Phase 1
    _dirty = true;
    this._notify('deficiency', { id, changes });
  },

  /**
   * Add a new deficiency to a contractor (or general).
   */
  addDeficiency(ctrId, defic) {
    // TODO Phase 1
    _dirty = true;
    this._notify('deficiency', { id: defic.id, action: 'add' });
  },

  /**
   * Get drawings array.
   */
  getDrawings() {
    // TODO Phase 1
    return [];
  },

  /**
   * Get photos for a deficiency or site photos.
   */
  getPhotos(entityType, entityId) {
    // TODO Phase 1
    return [];
  },

  /**
   * Check if there are unsaved changes.
   */
  hasUnsavedChanges() {
    return _dirty;
  },

  /**
   * Subscribe to changes on an entity type.
   * callback(entityType, data)
   */
  onChange(entityType, callback) {
    if (!_listeners[entityType]) _listeners[entityType] = [];
    _listeners[entityType].push(callback);
  },

  /**
   * Internal: notify listeners of a change.
   */
  _notify(entityType, data) {
    var cbs = _listeners[entityType] || [];
    cbs.forEach(function(cb) {
      try { cb(entityType, data); } catch (e) { console.error('[Model] Listener error:', e); }
    });
  }
};
