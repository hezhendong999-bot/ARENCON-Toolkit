/**
 * ARENCON /lib/ — IndexedDB layer (parameterized, S445)
 * ══════════════════════════════════════════════════════
 * Extracted from FRT frt/js/data/idb.js (the audit winner). The ONE API
 * change from the FRT original (Plan v2 amendment): the database name,
 * version, and store list are per-tool CONFIG — each tool gets its own DB.
 *
 *   import { createIDB } from '../lib/data/idb.js';
 *   export const IDB = createIDB({
 *     dbName: 'ARENCON_ELECTRIC_V1',
 *     version: 1,
 *     stores: ['projects', 'photoBlobs', 'photoOutbox', 'syncMeta']
 *   });
 *
 * Behavior preserved verbatim from FRT: additive-only upgrades (existing
 * stores never touched), versionchange force-close so other tabs can't
 * block upgrades, settled-guard on the open race, blocked-timer rescue,
 * and the ALL-TOOLS transaction rule — create the transaction and issue
 * the request in the SAME tick; resolve on tx.oncomplete (splitting across
 * a .then() lets the tx auto-commit and the write silently fails).
 * DB_VERSION never goes backwards for a given tool (S25 lineage).
 */

export function createIDB(config) {
  if (!config || !config.dbName || !Array.isArray(config.stores) || !config.stores.length) {
    throw new Error('[lib/idb] createIDB requires { dbName, version, stores[] }');
  }
  var DB_NAME = config.dbName;
  var DB_VERSION = config.version || 1;
  var STORES = config.stores.slice();
  var TAG = '[IDB:' + DB_NAME + ']';

  var _db = null;

  return {

    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORES: STORES.slice(),

    /**
     * Initialize the database. Creates all stores if they don't exist.
     * Safe to call multiple times — returns existing connection if open.
     */
    init: function() {
      if (_db) return Promise.resolve(_db);

      return new Promise(function(resolve, reject) {
        var request = indexedDB.open(DB_NAME, DB_VERSION);
        var _settled = false;
        var _blockedTimer = null;

        request.onupgradeneeded = function(e) {
          var db = e.target.result;
          console.log(TAG, 'Upgrade needed — creating stores (v' + e.oldVersion + ' → v' + e.newVersion + ')');
          STORES.forEach(function(storeName) {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: 'id' });
              console.log(TAG, 'Created store:', storeName);
            }
          });
          db.onversionchange = function() {
            console.warn(TAG, 'Version change requested — closing connection');
            db.close();
            _db = null;
          };
        };

        request.onsuccess = function(e) {
          if (_settled) { try { e.target.result.close(); } catch (_) {} return; }
          _settled = true;
          if (_blockedTimer) clearTimeout(_blockedTimer);
          _db = e.target.result;

          _db.onversionchange = function() {
            console.warn(TAG, 'Another tab requested upgrade — closing');
            _db.close();
            _db = null;
          };
          _db.onclose = function() {
            console.warn(TAG, 'Connection closed unexpectedly');
            _db = null;
          };

          console.log(TAG, 'Opened — version', _db.version,
            '— stores:', Array.from(_db.objectStoreNames));
          resolve(_db);
        };

        request.onerror = function(e) {
          if (_settled) return;
          _settled = true;
          if (_blockedTimer) clearTimeout(_blockedTimer);
          console.error(TAG, 'Open failed:', e.target.error);
          reject(e.target.error);
        };

        request.onblocked = function() {
          console.warn(TAG, 'Open blocked by another tab holding an older version');
          // Rescue: if still blocked after 3s, surface the failure instead of
          // hanging the app forever (FRT-hardened behavior).
          _blockedTimer = setTimeout(function() {
            if (_settled) return;
            _settled = true;
            reject(new Error(DB_NAME + ' open blocked by another tab'));
          }, 3000);
        };
      });
    },

    /** Get a single record by id. Resolves null when absent. */
    get: function(storeName, id) {
      var self = this;
      return self.init().then(function(db) {
        return new Promise(function(resolve, reject) {
          // Transaction + request in the SAME tick (all-tools IDB rule).
          var tx = db.transaction(storeName, 'readonly');
          var req = tx.objectStore(storeName).get(id);
          req.onsuccess = function() { resolve(req.result || null); };
          req.onerror = function() { reject(req.error); };
        });
      });
    },

    /** Get every record in a store. */
    getAll: function(storeName) {
      var self = this;
      return self.init().then(function(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction(storeName, 'readonly');
          var req = tx.objectStore(storeName).getAll();
          req.onsuccess = function() { resolve(req.result || []); };
          req.onerror = function() { reject(req.error); };
        });
      });
    },

    /** Put (insert or replace) one record. Record must carry `id`. */
    put: function(storeName, record) {
      var self = this;
      return self.init().then(function(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).put(record);
          tx.oncomplete = function() { resolve(true); };   // resolve on tx.oncomplete
          tx.onerror = function() { reject(tx.error); };
          tx.onabort = function() { reject(tx.error || new Error('tx aborted')); };
        });
      });
    },

    /** Delete one record by id. */
    del: function(storeName, id) {
      var self = this;
      return self.init().then(function(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).delete(id);
          tx.oncomplete = function() { resolve(true); };
          tx.onerror = function() { reject(tx.error); };
          tx.onabort = function() { reject(tx.error || new Error('tx aborted')); };
        });
      });
    },

    /**
     * Blob-record write. S491 — restored the FRT read-before-write guard
     * that the S445 extraction dropped (header claimed verbatim behavior;
     * it wasn't): if the stored record already holds a dataBlob and the
     * incoming record lacks one, the existing blob is preserved. This is
     * part of the photo-loss protection lineage — a structural save must
     * never clobber local binary data ("cloud owns structure; local owns
     * binary"). One-way safe: only ever preserves, never drops.
     */
    saveBlob: function(storeName, record) {
      var self = this;
      if (!record || !record.id) return Promise.resolve(false);
      return self.get(storeName, record.id).then(function(existing) {
        if (existing && existing.dataBlob && !record.dataBlob) {
          record.dataBlob = existing.dataBlob;
        }
        return self.put(storeName, record);
      });
    },

    /** Clear an entire store. */
    clear: function(storeName) {
      var self = this;
      return self.init().then(function(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).clear();
          tx.oncomplete = function() { resolve(true); };
          tx.onerror = function() { reject(tx.error); };
        });
      });
    },

    /** S491 — parity with the FRT original's public surface. */
    isReady: function() {
      return !!_db;
    },

    /** S491 — parity with the FRT original's public surface. */
    getStoreNames: function() {
      if (!_db) return [];
      return Array.from(_db.objectStoreNames);
    }
  };
}
