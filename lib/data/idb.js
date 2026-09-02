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
  var TAG = '[IDB:' + DB_NAME + ']';

  // S496 — per-store keyPath. A store may be declared two ways:
  //   'photos'                        → keyPath 'id'  (the pre-S496 default,
  //                                     so every existing caller is unchanged)
  //   { name:'state', keyPath:'k' }   → that store's own key field
  // WHY: a store's keyPath is fixed at creation and CANNOT be changed by
  // reopening the database. A tool whose live DB keys on something other than
  // 'id' (Diesel's `state` store keys on 'k') could not adopt this factory:
  // the browser would silently skip creation because the store already exists,
  // and reads/writes would then disagree about where the key lives — no error,
  // just wrong data on a field tablet. Declaring the true keyPath is what makes
  // adoption safe WITHOUT migrating existing records.
  var _STORE_DEFS = config.stores.map(function(s) {
    if (typeof s === 'string') return { name: s, keyPath: 'id' };
    if (s && typeof s === 'object' && s.name) {
      return { name: s.name, keyPath: (typeof s.keyPath === 'string' ? s.keyPath : 'id') };
    }
    throw new Error('[lib/idb] store entry must be a name string or { name, keyPath }');
  });
  var STORES = _STORE_DEFS.map(function(d) { return d.name; });

  var _db = null;

  return {

    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORES: STORES.slice(),

    /** S496 — declared store shapes, for adoption checks. */
    STORE_DEFS: _STORE_DEFS.map(function(d) { return { name: d.name, keyPath: d.keyPath }; }),

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
          _STORE_DEFS.forEach(function(def) {
            if (!db.objectStoreNames.contains(def.name)) {
              db.createObjectStore(def.name, { keyPath: def.keyPath });
              console.log(TAG, 'Created store:', def.name, '(keyPath:', def.keyPath + ')');
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

    /* ═══ S718e — LIST KEYS WITHOUT READING THE RECORDS. ═══════════════════
       getAll() above pulls whole records, which in photoBlobs means every
       photograph on the device — hundreds of megabytes — just to find out
       which ids exist. openKeyCursor walks the index alone and never touches
       a body, so asking "which previews do I already hold?" costs almost
       nothing even on a tablet holding a 300-photo job.

       `prefix` is an optional string filter applied to string keys. Resolves
       to an array of keys; never rejects into the caller's critical path —
       a store that does not exist yet answers with an empty list. */
    keys: function(storeName, prefix) {
      var self = this;
      return self.init().then(function(db) {
        return new Promise(function(resolve) {
          var out = [];
          var tx, req;
          try { tx = db.transaction(storeName, 'readonly'); }
          catch (e) { resolve(out); return; }
          try { req = tx.objectStore(storeName).openKeyCursor(); }
          catch (e2) { resolve(out); return; }
          req.onsuccess = function() {
            var cur = req.result;
            if (!cur) { resolve(out); return; }
            var k = cur.key;
            if (!prefix || (typeof k === 'string' && k.indexOf(prefix) === 0)) out.push(k);
            cur.continue();
          };
          req.onerror = function() { resolve(out); };
          tx.onabort = function() { resolve(out); };
        });
      }).catch(function() { return []; });
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
    },

    /**
     * S496 — ADOPTION SAFETY CHECK. Opens the real database and compares each
     * EXISTING store's actual keyPath against what this config declares.
     *
     * WHY THIS EXISTS: a keyPath is fixed at creation. If a tool adopts this
     * factory with a keyPath that disagrees with its live database, IndexedDB
     * does NOT throw — `contains()` is true, creation is skipped, and the tool
     * then reads and writes against a key field that isn't there. Silent wrong
     * data on a field tablet, exactly the class of failure that blanked a live
     * report in S488. A syntax check cannot see it; only reading the real
     * database can. Call this once at adoption time and log the result.
     *
     * Resolves { ok, mismatches[], missing[], extra[] }. `missing` = declared
     * but absent (will be created on the next version bump — not an error).
     * `extra` = present in the DB but not declared (left untouched; this
     * factory never drops stores).
     */
    verifyShape: function() {
      var self = this;
      return self.init().then(function(db) {
        var mismatches = [], missing = [], extra = [];
        var declared = {};
        _STORE_DEFS.forEach(function(d) { declared[d.name] = d.keyPath; });

        var present = Array.from(db.objectStoreNames);
        present.forEach(function(n) {
          if (!(n in declared)) extra.push(n);
        });

        var names = _STORE_DEFS.filter(function(d) {
          if (present.indexOf(d.name) === -1) { missing.push(d.name); return false; }
          return true;
        }).map(function(d) { return d.name; });

        if (names.length) {
          var tx = db.transaction(names, 'readonly');
          names.forEach(function(n) {
            var actual = tx.objectStore(n).keyPath;
            if (actual !== declared[n]) {
              mismatches.push({ store: n, declared: declared[n], actual: actual });
            }
          });
        }

        var result = {
          ok: mismatches.length === 0,
          mismatches: mismatches,
          missing: missing,
          extra: extra
        };
        if (!result.ok) {
          console.error(TAG, 'KEYPATH MISMATCH — do not use this database:', mismatches);
        } else {
          console.log(TAG, 'Shape verified. missing:', missing, 'extra:', extra);
        }
        return result;
      });
    }
  };
}
