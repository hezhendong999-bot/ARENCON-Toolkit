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

  /** Read-only progress report.
   *
   *  S550 — this used to compare the store against EVERY photo in the report and
   *  call the difference "not backed up". On Mark's tablet that read "1 of 223",
   *  looked stuck, and was alarming — and it was wrong. A photo's picture is
   *  stripped when the report uploads (which is why a 223-photo report is ~1MB
   *  and not ~400MB), so a device that PULLED the report down never had an image
   *  for those photos and has nothing it could possibly copy. Counting them as
   *  "not backed up" invents a risk that does not exist and hides the number
   *  that does matter.
   *
   *  Two different questions, reported separately:
   *    held / pending  — photos whose picture IS on this device. This is the
   *                      risk number: taken here, not yet safely uploaded.
   *    cloudOnly       — photos whose picture lives only in cloud storage.
   *                      Normal, expected, and NOT this device's job.
   */
  function report() {
    var out = { inReport: 0, local: 0, held: 0, pending: 0, cloudOnly: 0,
                missing: [], paused: _paused };
    try {
      var all = _photos();
      var seen = {}, localIds = [];
      all.forEach(function (p) {
        if (!p || !p.id || seen[p.id]) return;
        seen[p.id] = true;
        out.inReport++;
        // Empty string counts as absent — that is exactly what an uploaded
        // report leaves behind, and it is the case that misled the old count.
        if (p[BYTES]) localIds.push(p.id);
      });
      return IDB.getAll(STORE).then(function (rows) {
        var have = {};
        (rows || []).forEach(function (r) { if (r && r.id && r.blob) have[r.id] = true; });
        // A photo counts as held if the store has its file, even if the report
        // no longer carries the picture — that is the store doing its job.
        Object.keys(seen).forEach(function (id) { if (have[id]) out.held++; });
        localIds.forEach(function (id) { if (!have[id]) { out.pending++; out.missing.push(id); } });
        out.local = out.held + out.pending;
        out.cloudOnly = Math.max(0, out.inReport - out.local);
        console.log(TAG + ' photo store: ' + out.held + ' held on this device, ' +
                    out.pending + ' still to copy, ' + out.cloudOnly + ' cloud-only' +
                    (_paused ? ' — PAUSED, device low on room' : ''));
        return out;
      }).catch(function () { return out; });
    } catch (e) { return Promise.resolve(out); }
  }

  /** THE resolver — the single door every consumer of a photo's pixels must
   *  come through before the inline copy can be retired.
   *
   *  S553 — why this exists. Retiring the picture from the report is not a
   *  switch, it is a refactor: about forty places in Diesel read those bytes
   *  DIRECTLY and SYNCHRONOUSLY (bake a markup layer, build the PDF, upload,
   *  make a backup). The device's own file is an asynchronous read. Flip the
   *  retirement on before those places can wait for an answer and they get an
   *  empty string — a blank page in a report, a markup baked onto nothing.
   *
   *  Order is deliberate:
   *    1. the inline copy, while it still exists — free and synchronous
   *    2. this device's own file — works with no signal, which is the case
   *       the whole store exists for
   *    3. cloud storage — correct, but needs a network the inspector may not have
   *
   *  Callers get a URL usable as an <img> src or a canvas source. Object URLs
   *  are handed out one per photo and remembered, so a gallery of 200 photos
   *  does not mint 200 more every time it repaints; release() drops them.
   */
  var _srcCache = {};
  function resolveSrc(photo) {
    if (!photo) return Promise.resolve('');
    if (photo[BYTES]) return Promise.resolve(photo[BYTES]);
    var id = photo.id;
    if (id && _srcCache[id]) return Promise.resolve(_srcCache[id]);
    if (!id) return Promise.resolve(photo.r2Url || '');
    return IDB.get(STORE, id).then(function (rec) {
      if (rec && rec.blob) {
        try {
          var u = URL.createObjectURL(rec.blob);
          _srcCache[id] = u;
          return u;
        } catch (e) {}
      }
      return photo.r2Url || '';
    }).catch(function () { return photo.r2Url || ''; });
  }
  /** Drop the object URLs this resolver minted. Call when a report closes —
   *  every one of them pins its image in memory until it is revoked. */
  function release() {
    Object.keys(_srcCache).forEach(function (k) {
      try { URL.revokeObjectURL(_srcCache[k]); } catch (e) {}
    });
    _srcCache = {};
  }

  /** Is this photo safe to retire the inline copy for? Per photo, never per
   *  device: the file must be held here AND the upload confirmed. Both, because
   *  either one alone leaves a single point of failure. */
  function retirable(photo) {
    if (!photo || !photo.id || !photo[BYTES]) return Promise.resolve(false);
    if (photo.r2Status !== 'uploaded') return Promise.resolve(false);
    return IDB.get(STORE, photo.id)
      .then(function (rec) { return !!(rec && rec.blob && rec.blob.size); })
      .catch(function () { return false; });
  }

  /** Retire the inline copy, photo by photo, for everything that passes the
   *  test. S553b.
   *
   *  The picture is only dropped AFTER this device's own file has been read
   *  back and turned into a live source on the photo — so at no instant is a
   *  photo without a way to be drawn. That ordering is the whole safety
   *  argument; reversing it would leave a window where the report has no
   *  picture and the screen has no substitute.
   *
   *  Why an object URL is cheaper than what it replaces: the inline copy is
   *  text in the JavaScript heap, copied in full every time the report is
   *  serialised to save. An object URL points at a file the browser keeps on
   *  disk. Same picture on screen, a fraction of the weight, and saves stop
   *  carrying it.
   *
   *  SKIPPED ON PURPOSE:
   *    - annotated photos: the inline copy is the BAKED marked image, not a
   *      duplicate of the original, and the markup paths still read it directly
   *    - backup records (_isOrigBackup): they exist to be the last clean copy
   *  Those two need the markup paths routed through resolveSrc first.
   */
  function retirePass(limit) {
    var todo = [];
    _photos().forEach(function (p) {
      if (!p || !p.id || !p[BYTES]) return;
      if (p._annotated || p._isOrigBackup) return;
      if (p.r2Status !== 'uploaded') return;
      todo.push(p);
    });
    if (!todo.length) return Promise.resolve(0);
    var freed = 0, chain = Promise.resolve();
    todo.slice(0, limit || 25).forEach(function (p) {
      chain = chain.then(function () {
        return IDB.get(STORE, p.id).then(function (rec) {
          if (!rec || !rec.blob || !rec.blob.size) return;   // no file here: keep the inline copy
          var url = _srcCache[p.id];
          if (!url) {
            try { url = URL.createObjectURL(rec.blob); } catch (e) { return; }
            _srcCache[p.id] = url;
          }
          p._localSrc = url;      // reachable FIRST
          freed += (p[BYTES] || '').length;
          p[BYTES] = '';          // then, and only then, dropped
        }).catch(function () {});
      });
    });
    return chain.then(function () {
      if (freed) console.log(TAG + ' retired inline copies, ' + Math.round(freed / 1024) + 'KB off the report');
      return freed;
    });
  }

  return {
    dataUrlToBlob: dataUrlToBlob,
    roomOk: roomOk,
    sweep: sweep,
    localBytes: localBytes,
    resolveSrc: resolveSrc,
    release: release,
    retirable: retirable,
    retirePass: retirePass,
    report: report,
    isPaused: function () { return _paused; }
  };
}
