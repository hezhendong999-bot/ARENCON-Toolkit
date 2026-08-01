/* lib/data/photoStore.js — the device's own copy of every photo.
 * ═══════════════════════════════════════════════════════════════════════════
 * S548 — lifted out of diesel-app/js/part06.js (S537), unchanged in behaviour.
 *
 * WHY THIS IS SHARED, in field terms: a report carries its photos inside itself
 * as text, which is how they reach the cloud — but that copy is the FIRST thing
 * stripped when a report is trimmed, and it is not a file, so nothing can
 * re-upload from it once it is gone. This keeps a real image file on the device
 * for every photo in the report. That file is what lets a photo whose stored
 * copy has vanished be put back, and it is the only thing that can.
 *
 * Diesel has had this since S537. Electric has NOTHING — no local copy at all,
 * which is why its photos are the one set in the toolkit that cannot be rescued.
 * Porting it by copying a thousand lines across is the trap: two copies drift,
 * and the second one is always the one that stops being maintained. One engine,
 * each tool supplying its own database, its own way of listing its photos, and
 * its own field name for the inline copy.
 *
 * DELIBERATELY CONSERVATIVE, all three inherited from S537 and worth keeping:
 *   - It pauses above a storage ceiling rather than filling the tablet. An
 *     inspector mid-inspection must never be the one who discovers the device
 *     is full. Pausing loses nothing while the inline copy still exists.
 *   - It works in small bites, because it runs behind someone typing.
 *   - A photo whose inline copy is unreadable is marked done rather than retried
 *     forever, so one bad record cannot stall the whole sweep.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Turn the inline text copy of a photo into a real image file.
 *  Standalone because it is genuinely generic — no tool state involved. */
export function dataUrlToBlob(d) {
  try {
    if (!d || d.indexOf('data:') !== 0) return null;
    var comma = d.indexOf(',');
    if (comma < 0) return null;
    var meta = d.slice(5, comma);
    var isB64 = meta.indexOf(';base64') !== -1;
    var mime = meta.split(';')[0] || 'image/jpeg';
    var body = d.slice(comma + 1);
    if (!isB64) return new Blob([decodeURIComponent(body)], { type: mime });
    var bin = atob(body);
    var len = bin.length;
    var buf = new Uint8Array(len);
    for (var i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  } catch (e) { return null; }
}

/**
 * @param {object} config
 *   IDB          required — needs get(store,key), put(store,rec), getAll(store)
 *   photoWalk    required — () => [photo], EVERY photo in the report including
 *                deleted ones and backups. Deleted photos are kept on purpose:
 *                a delete that turns out to be a mistake is recoverable only
 *                while the image still exists somewhere.
 *   storeName    default 'photoBlobs'
 *   bytesField   default 'd'      — where the tool keeps the inline copy
 *   perPass      default 5
 *   quotaCeiling default 0.85
 *   tag          default '[photoStore]'
 */
export function createPhotoStore(config) {
  config = config || {};
  var IDB      = config.IDB;
  var walk     = config.photoWalk;
  var STORE    = config.storeName || 'photoBlobs';
  var BYTES    = config.bytesField || 'd';
  var PER_PASS = config.perPass || 5;
  var CEIL     = (typeof config.quotaCeiling === 'number') ? config.quotaCeiling : 0.85;
  var TAG      = config.tag || '[photoStore]';

  var _stashed = {};        // photo id -> true, this session only
  var _busy    = false;
  var _paused  = false;     // set when the device is short of room

  function _photos() {
    try { var r = walk ? walk() : []; return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }

  /* Storage headroom. Holding both copies temporarily roughly doubles local
     usage. Within reach of the ceiling we stop — the inline copy is still
     there, so pausing costs nothing. */
  function roomOk() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(true);
      return navigator.storage.estimate().then(function (est) {
        if (!est || !est.quota) return true;
        var used = est.usage || 0;
        var ok = (used / est.quota) < CEIL;
        if (!ok && !_paused) {
          _paused = true;
          console.warn(TAG + ' photo store paused — device storage above ' +
                       Math.round(CEIL * 100) + '% (' + Math.round(used / 1048576) +
                       'MB of ' + Math.round(est.quota / 1048576) + 'MB)');
        }
        return ok;
      }).catch(function () { return true; });
    } catch (e) { return Promise.resolve(true); }
  }

  /** One small pass. Safe to call on every save — it never blocks and never
   *  throws into the caller. */
  function sweep() {
    if (_busy || _paused) return Promise.resolve();
    if (!IDB || !walk) return Promise.resolve();
    _busy = true;
    return Promise.resolve().then(roomOk).then(function (ok) {
      if (!ok) return null;
      var todo = [];
      _photos().forEach(function (p) {
        if (!p || !p.id || _stashed[p.id]) return;
        if (!p[BYTES]) return;                       // nothing inline to copy
        todo.push(p);
      });
      if (!todo.length) return null;
      var chain = Promise.resolve();
      todo.slice(0, PER_PASS).forEach(function (p) {
        chain = chain.then(function () {
          var blob = dataUrlToBlob(p[BYTES]);
          // Unreadable inline copy: mark done rather than retry it forever.
          if (!blob || !blob.size) { _stashed[p.id] = true; return null; }
          return IDB.put(STORE, { id: p.id, blob: blob, bytes: blob.size, savedAt: Date.now() })
            .then(function () { _stashed[p.id] = true; })
            .catch(function (e) {
              // Quota or transaction failure — pause rather than hammer the device.
              _paused = true;
              console.warn(TAG + ' photo store write failed, pausing:', e && (e.message || e));
            });
        });
      });
      return chain;
    }).catch(function (e) {
      console.warn(TAG + ' photo store sweep skipped:', e && (e.message || e));
    }).then(function () { _busy = false; });
  }

  /** This device's own bytes for a photo — the reader the rescue engine needs.
   *  Falls back to the inline copy while both exist, so it is already correct
   *  for the period before the inline copy is retired. */
  function localBytes(photoId) {
    try {
      return IDB.get(STORE, photoId).then(function (rec) {
        if (rec && rec.blob) return rec.blob;
        var hit = null;
        _photos().forEach(function (p) { if (!hit && p && p.id === photoId && p[BYTES]) hit = p; });
        return hit ? dataUrlToBlob(hit[BYTES]) : null;
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /** Read-only progress report. Nothing is allowed to depend on this store
   *  until this says it is genuinely keeping up. */
  function report() {
    var out = { inReport: 0, withInline: 0, inStore: 0, missing: [], paused: _paused };
    try {
      var all = _photos();
      out.inReport = all.length;
      var ids = [];
      all.forEach(function (p) {
        if (!p || !p.id) return;
        if (p[BYTES]) out.withInline++;
        ids.push(p.id);
      });
      return IDB.getAll(STORE).then(function (rows) {
        var have = {};
        (rows || []).forEach(function (r) { if (r && r.id) have[r.id] = true; });
        ids.forEach(function (id) { if (have[id]) out.inStore++; else out.missing.push(id); });
        console.log(TAG + ' photo store: ' + out.inStore + ' of ' + ids.length +
                    ' photos held as binary (' + out.withInline + ' still inline)' +
                    (_paused ? ' — PAUSED, device low on room' : ''));
        return out;
      }).catch(function () { return out; });
    } catch (e) { return Promise.resolve(out); }
  }

  return {
    dataUrlToBlob: dataUrlToBlob,
    roomOk: roomOk,
    sweep: sweep,
    localBytes: localBytes,
    report: report,
    isPaused: function () { return _paused; }
  };
}
