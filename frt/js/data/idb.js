/**
 * ARENCON FRT v2 — IndexedDB Abstraction
 * ═══════════════════════════════════════
 * 
 * Key improvements over v1:
 *   1. Auto-creates all stores on first open (fixes P4: IDB Version 1 / No Stores)
 *   2. Proper versioned migrations — stores always exist
 *   3. Graceful degradation — if IDB fails, returns null instead of throwing
 *   4. Read-before-write for blob stores — never overwrites existing data
 *   5. Normalized stores: each entity type gets its own store
 * 
 * Stores (Phase 1 schema):
 *   projects       → { id, name, number, client, ... }
 *   contractors    → { id, projectId, name }
 *   deficiencies   → { id, projectId, contractorId, ... }
 *   observations   → { id, deficiencyId, text, ... }
 *   drawings       → { id, projectId, name, folder, ... }
 *   drawingBlobs   → { id, dataBlob }
 *   markupObjects  → { id, drawingId, objects: [...] }
 *   photos         → { id, projectId, entityType, entityId, r2Key, ... }
 *   photoBlobs     → { id, dataBlob }
 *   activityLog    → { id, deficiencyId, date, label, text, ... }
 *   syncQueue      → { id, entityType, entityId, action, timestamp, data }
 */

const DB_NAME = 'ARENCON_FRT_V2';
const DB_VERSION = 2;

const STORES = [
  'projects',
  'contractors',
  'deficiencies',
  'observations',
  'drawings',
  'drawingBlobs',
  'pdfBufs',
  'markupObjects',
  'photos',
  'photoBlobs',
  'activityLog',
  'syncQueue'
];

let _db = null;

export const IDB = {

  /**
   * Initialize the database. Creates all stores if they don't exist.
   * Safe to call multiple times — returns existing connection if open.
   */
  async init() {
    if (_db) return _db;

    return new Promise(function(resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function(e) {
        var db = e.target.result;
        console.log('[IDB] Upgrade needed — creating stores');
        STORES.forEach(function(storeName) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
            console.log('[IDB] Created store:', storeName);
          }
        });
      };

      request.onsuccess = function(e) {
        _db = e.target.result;

        // Handle connection loss
        _db.onclose = function() {
          console.warn('[IDB] Connection closed unexpectedly');
          _db = null;
        };

        console.log('[IDB] Opened successfully — version', _db.version,
          '— stores:', Array.from(_db.objectStoreNames));
        resolve(_db);
      };

      request.onerror = function(e) {
        console.error('[IDB] Open failed:', e.target.error);
        reject(e.target.error);
      };

      request.onblocked = function() {
        console.warn('[IDB] Open blocked — close other tabs');
      };
    });
  },

  /**
   * Get a record by ID from a store.
   * Returns null if not found or if store doesn't exist.
   */
  async get(storeName, id) {
    if (!_db) {
      try { await this.init(); } catch (e) { return null; }
    }
    if (!_db || !_db.objectStoreNames.contains(storeName)) return null;

    return new Promise(function(resolve) {
      try {
        var tx = _db.transaction(storeName, 'readonly');
        var store = tx.objectStore(storeName);
        var req = store.get(id);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { resolve(null); };
      } catch (e) {
        console.warn('[IDB] get error:', storeName, id, e);
        resolve(null);
      }
    });
  },

  /**
   * Get all records from a store.
   * Returns empty array if store doesn't exist.
   */
  async getAll(storeName) {
    if (!_db) {
      try { await this.init(); } catch (e) { return []; }
    }
    if (!_db || !_db.objectStoreNames.contains(storeName)) return [];

    return new Promise(function(resolve) {
      try {
        var tx = _db.transaction(storeName, 'readonly');
        var store = tx.objectStore(storeName);
        var req = store.getAll();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function() { resolve([]); };
      } catch (e) {
        console.warn('[IDB] getAll error:', storeName, e);
        resolve([]);
      }
    });
  },

  /**
   * Put a record into a store (upsert).
   * Returns true on success, false on failure.
   */
  async put(storeName, record) {
    if (!_db) {
      try { await this.init(); } catch (e) { return false; }
    }
    if (!_db || !_db.objectStoreNames.contains(storeName)) return false;

    return new Promise(function(resolve) {
      try {
        var tx = _db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        store.put(record);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      } catch (e) {
        console.warn('[IDB] put error:', storeName, e);
        resolve(false);
      }
    });
  },

  /**
   * Delete a record from a store.
   * Returns true on success, false on failure.
   */
  async del(storeName, id) {
    if (!_db) {
      try { await this.init(); } catch (e) { return false; }
    }
    if (!_db || !_db.objectStoreNames.contains(storeName)) return false;

    return new Promise(function(resolve) {
      try {
        var tx = _db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        store.delete(id);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      } catch (e) {
        console.warn('[IDB] del error:', storeName, e);
        resolve(false);
      }
    });
  },

  /**
   * Save a blob with read-before-write protection.
   * If the record exists and has a dataBlob, preserves it
   * unless the new record also has a dataBlob.
   */
  async saveBlob(storeName, record) {
    if (!record || !record.id) return false;

    // Read existing record to preserve blob if present
    var existing = await this.get(storeName, record.id);
    if (existing && existing.dataBlob && !record.dataBlob) {
      record.dataBlob = existing.dataBlob;
    }

    return this.put(storeName, record);
  },

  /**
   * Clear all records in a store.
   */
  async clear(storeName) {
    if (!_db) return false;
    if (!_db.objectStoreNames.contains(storeName)) return false;

    return new Promise(function(resolve) {
      try {
        var tx = _db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      } catch (e) {
        resolve(false);
      }
    });
  },

  /**
   * Check if the database is connected.
   */
  isReady() {
    return !!_db;
  },

  /**
   * Get list of store names.
   */
  getStoreNames() {
    if (!_db) return [];
    return Array.from(_db.objectStoreNames);
  }
};
