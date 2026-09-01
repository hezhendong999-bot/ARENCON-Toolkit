/* ═══ frt/js/data/photoIngest.js — S716 ═══════════════════════════════════════
   ONE intake for a burst photograph, whichever screen it lands on.

   Until S716 the deficiency editor and the Site Photos gallery each had their
   own copy of the code that takes a photo in. S713 (one at a time), S714
   (no re-decode) and S715 (bytes out of the report) were applied to the
   deficiency copy. The gallery copy received none of them, so a burst from
   the gallery still unpacked every shot at once, wrote every photograph into
   the report as text, and saved the whole report per photo. The field crash
   after S715 was that copy. This module is the one that replaces both.

   What a burst shot IS by the time it reaches here (S716 camera):
     a DESCRIPTOR — { _burstK, name, type, size, thumb, file? }
     · _burstK  key of the photograph in the camera's own disk store
     · thumb    480px preview, made at the shutter from the frame already on
                the canvas — the original is NOT decoded again here
     · file     present ONLY if the disk write failed at the shutter and the
                bytes exist nowhere else. The exception, never the batch.

   proveBurstShot(desc):
     1. one blob, read from the camera store by key (or desc.file)
     2. written to photoBlobs, READ BACK, size must match — or it did not
        happen and there is no record, no handedOff stamp, and the shot stays
        in the camera's recovery list where an inspector can still get it
     3. thumb: the shutter's, or — only if it is missing — one 480 decode of
        THIS blob, then the bitmap is dropped
     4. the blob reference is released before resolving
   The caller creates the report record with { id, thumb, dataUrl:null } and
   only then stamps the shot handedOff. Bytes → record → stamp. That order is
   the safety property; do not reorder it.

   Never held here: an array of photographs. Never returned: the blob.        */

import { IDB } from './idb.js';
import { Model } from './model.js';
import { R2 } from './r2.js';
import { ImageWorkerHost } from '../workers/imageWorkerHost.js';

var THUMB_W = 480, THUMB_Q = 0.7;

function _burstGet(k) {
  var g = (typeof window !== 'undefined') && window._arcBurstGet;
  if (typeof g !== 'function') return Promise.resolve(null);
  return Promise.resolve().then(function () { return g(k); }).then(function (rec) {
    return (rec && rec.blob) || null;
  }).catch(function () { return null; });
}

function _mintId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ═══ S718a — THE PREVIEW GETS A HOME OF ITS OWN ═══════════════════════════
   Until S718 the 480px preview lived in ONE place: inside the report document,
   as base64 text, ~28 KB per photo, copied on every save and pushed on every
   sync. That is why a 233-photo report is 5.5 MB and why saves warn about
   timing out. The rule S718 installs: the report is a document ABOUT
   photographs and never contains one — nothing that grows with picture data
   lives in it.

   Step 1 (this push) gives the preview two more homes while the report STILL
   carries it. Nothing is removed. Step 2 — Mark present — is where the report
   stops carrying the preview, and it may only do so for a photo whose preview
   is PROVEN in both places. Prove, then strip. Never the reverse.

   Device: photoBlobs, key 'thumb:<photoId>' — the same prefixed-key pattern the
           drawing L0 thumbs use in thumbCache.js; no schema migration.
   Cloud:  R2 type 'thumb', filename '<photoId>.jpg'. The worker does not
           validate the type segment (read live S718a) — no deploy needed.     */

var THUMB_STORE = 'photoBlobs', THUMB_PREFIX = 'thumb:';

export function thumbStoreKey(id) { return THUMB_PREFIX + id; }

function _dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) return Promise.resolve(null);
  return fetch(dataUrl).then(function (r) { return r.blob(); }).catch(function () { return null; });
}

/* Write the preview to the device store and READ IT BACK; true only when the
   stored size matches. Never rejects — a preview that could not be stored on
   device simply keeps living in the report until it can be. */
export function storePreview(id, thumbDataUrl) {
  if (!id) return Promise.resolve(false);
  return _dataUrlToBlob(thumbDataUrl).then(function (blob) {
    if (!blob || !blob.size) return false;
    var expect = blob.size;
    return IDB.put(THUMB_STORE, { id: thumbStoreKey(id), dataBlob: blob })
      .then(function () { return IDB.get(THUMB_STORE, thumbStoreKey(id)); })
      .then(function (rec) { return !!(rec && rec.dataBlob && rec.dataBlob.size === expect); });
  }).catch(function () { return false; });
}

/* The preview as a Blob: device store first, then the copy still riding in
   the report. null when neither exists. */
export function readPreview(photo) {
  if (!photo || !photo.id) return Promise.resolve(null);
  return IDB.get(THUMB_STORE, thumbStoreKey(photo.id)).then(function (rec) {
    if (rec && rec.dataBlob && rec.dataBlob.size) return rec.dataBlob;
    return _dataUrlToBlob(photo.thumb);
  }).catch(function () { return _dataUrlToBlob(photo.thumb); });
}

/* Upload the preview under its own type. Sets photo.thumbKey / thumbUrl in
   place on success. Idempotent (skips when thumbUrl is set). Never rejects
   and never blocks the original — 28 KB failing must not hold a photograph
   back. */
export function uploadPreview(pid, photo) {
  if (!pid || !photo || !photo.id || photo.thumbUrl) return Promise.resolve(false);
  return readPreview(photo).then(function (blob) {
    if (!blob) return false;
    return R2.upload(pid, 'thumb', blob, photo.id + '.jpg').then(function (res) {
      blob = null;                                            // release
      if (!res || !res.r2Key) return false;
      photo.thumbKey = res.r2Key;
      photo.thumbUrl = res.r2Url;
      return true;
    });
  }).catch(function () { return false; });
}

/* Returns { id, thumb, filename, size }. Rejects if the bytes could not be
   proven durable. Holds exactly one blob for the duration. */
export function proveBurstShot(desc, idPrefix) {
  var id = _mintId(idPrefix || 'ph');
  var name = (desc && desc.name) || ('camera_' + Date.now() + '.jpg');
  var src = (desc && desc.file) ? Promise.resolve(desc.file) : _burstGet(desc && desc._burstK);
  return src.then(function (blob) {
    if (!blob || !blob.size) throw new Error('burst shot has no bytes: ' + (desc && desc._burstK));
    var expect = blob.size;
    return IDB.put('photoBlobs', { id: id, dataBlob: blob })
      .then(function () { return IDB.get('photoBlobs', id); })
      .then(function (rec) {
        var stored = rec && rec.dataBlob && rec.dataBlob.size;
        if (!stored || stored !== expect) {
          throw new Error('blob not durable (' + (stored || 0) + '/' + expect + ')');
        }
        if (desc.thumb) return desc.thumb;
        // Shutter sent no preview (pre-S716 recovery shot). One small decode of
        // this blob only; the bitmap goes with the promise.
        return ImageWorkerHost.compressFile(blob, { maxW: THUMB_W, quality: THUMB_Q })
          .then(function (t) { return (t && t.dataUrl) || null; })
          .catch(function () { return null; });
      })
      .then(function (thumb) {
        blob = null;                                            // release
        if (!thumb) throw new Error('no preview for ' + id);   // S462: a record needs a source
        // S718a: the preview also goes to the device store, proven by read-back.
        // Not fatal — the report still carries the preview until Step 2 — so
        // this branch never rejects; previewStored just says whether it landed.
        return storePreview(id, thumb).then(function (ok) {
          return { id: id, thumb: thumb, filename: name, size: expect, previewStored: !!ok };
        });
      });
  });
}

/* Strictly one at a time. step(item, i) returns a promise; tick(ok, i) runs
   after each, resolved or rejected. Never rejects — a bad item is a false
   tick, not a dead batch. */
export function runSerial(items, step, tick) {
  var list = Array.prototype.slice.call(items || []);
  var i = 0;
  function next() {
    if (i >= list.length) { list = null; return Promise.resolve(); }
    var item = list[i]; list[i] = null;                          // drop as we go
    var at = i++;
    return Promise.resolve().then(function () { return step(item, at); })
      .then(function () { try { tick(true, at); } catch (_) {} })
      .catch(function (e) {
        try { console.warn('[PhotoIngest] shot failed:', e && e.message); } catch (_) {}
        try { tick(false, at); } catch (_) {}
      })
      .then(next);
  }
  return next();
}

/* Uploads AFTER the batch, reading each photograph from photoBlobs one at a
   time. Never closes over a burst File and never has more than one blob in
   hand. onEach(photo, ok) runs after each attempt. */
export function uploadFromStore(pid, photos, onEach) {
  if (!pid) return Promise.resolve();
  return runSerial(photos, function (photo) {
    if (!photo) return Promise.resolve();
    // S718a: the preview goes up alongside the original — its own type, its
    // own guard, never a reason to hold the photograph back. One onEach per
    // photo, as before, so the caller's save happens once whichever landed.
    return uploadPreview(pid, photo).then(function (previewUp) {
      if (photo.r2Key) {
        if (previewUp && onEach) onEach(photo, true);
        return;
      }
      return Model.resolvePhotoBytes(photo).then(function (blob) {
        if (!blob) throw new Error('no local bytes for ' + photo.id);
        return R2.uploadPhotoOriginal(pid, photo, blob).then(function () {
          blob = null;
          if (onEach) onEach(photo, true);
        });
      }).catch(function (err) {
        try { photo.r2UploadFailed = true; } catch (_) {}
        if (onEach) onEach(photo, false, err);
        throw err;
      });
    });
  }, function () {});
}
