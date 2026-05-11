/**
 * ARENCON FRT v2 — R2 Storage
 * ════════════════════════════
 * 
 * Cloudflare R2 via Worker proxy for photos and drawings.
 * 
 * Key rules (from Project Knowledge):
 *   - GET requests: NEVER require auth (public read)
 *   - PUT/DELETE: require valid Supabase auth token via Worker
 *   - R2 key format: photos/{projectId}/frt/{type}/{filename}
 *   - Worker list path: /list/{projectId}/frt/{type}/
 *   - Content-hash or UUID filenames
 */

import { Auth } from '../shared/auth.js';
import { IDB } from './idb.js';

var R2_WORKER = 'https://arencon-r2-worker.hezhendong999.workers.dev';
var _queueRunning = false;

function _getToken() {
  var t = localStorage.getItem('sb-access-token');
  if (t) return t;
  var u = Auth.getUser();
  return u ? u.access_token : null;
}

function _toBlob(data, mime) {
  if (data instanceof Blob) return Promise.resolve(data);
  if (data instanceof ArrayBuffer) return Promise.resolve(new Blob([data], { type: mime || 'application/octet-stream' }));
  if (data && data.buffer instanceof ArrayBuffer) return Promise.resolve(new Blob([data], { type: mime || 'application/octet-stream' }));
  if (typeof data === 'string' && data.startsWith('data:')) {
    return fetch(data).then(function(r) { return r.blob(); });
  }
  return Promise.resolve(null);
}

export var R2 = {

  WORKER_URL: R2_WORKER,

  /** Upload blob/dataUrl/ArrayBuffer to R2. Returns {r2Key, r2Url} or null.
   *  S83: accepts optional mimeHint (for ArrayBuffer → PDF uploads). */
  upload: function(projectId, type, data, filename, mimeHint) {
    if (!filename) filename = R2.generateFilename('jpg');
    var r2Key = 'photos/' + projectId + '/frt/' + type + '/' + filename;
    var r2Url = R2_WORKER + '/' + r2Key;
    var token = _getToken();

    return _toBlob(data, mimeHint).then(function(blob) {
      if (!blob) { console.warn('[R2] No blob to upload'); return null; }
      var ct = blob.type || mimeHint || 'image/jpeg';
      return fetch(r2Url, {
        method: 'PUT',
        headers: {
          'Content-Type': ct,
          'Authorization': 'Bearer ' + (token || '')
        },
        body: blob
      }).then(function(resp) {
        if (resp.ok) {
          console.log('[R2] Uploaded:', r2Key, '(' + Math.round(blob.size / 1024) + 'KB)');
          return { r2Key: r2Key, r2Url: r2Url };
        }
        console.warn('[R2] Upload failed:', resp.status, resp.statusText);
        return null;
      });
    }).catch(function(err) {
      console.warn('[R2] Upload error:', err.message);
      return null;
    });
  },

  /** Download file from R2. GET — no auth. Returns Blob or null. */
  download: function(r2Url) {
    return fetch(r2Url).then(function(resp) {
      if (resp.ok) return resp.blob();
      console.warn('[R2] Download failed:', resp.status);
      return null;
    }).catch(function(err) {
      console.warn('[R2] Download error:', err.message);
      return null;
    });
  },

  /** List files in R2. Returns [{key, url, size}]. */
  list: function(projectId, type) {
    var listUrl = R2_WORKER + '/list/' + projectId + '/frt/' + type + '/';
    return fetch(listUrl).then(function(resp) {
      if (!resp.ok) return [];
      return resp.json();
    }).then(function(data) {
      if (!data || !data.objects) return [];
      return data.objects.map(function(o) {
        return { key: o.key, url: R2_WORKER + '/' + o.key, size: o.size || 0 };
      });
    }).catch(function(err) {
      console.warn('[R2] List error:', err.message);
      return [];
    });
  },

  /**
   * S124 A4 — list ALL R2 objects under {pid}/ prefix in one call.
   * Covers photos, tiles, pdfbufs. Authenticated.
   *
   * Returns { count, totalBytes, truncated, objects: [{key,size,uploaded}] }
   * Returns null on auth/network failure.
   *
   * Used by frt/js/diag/r2cleanup.js to scan a whole project for orphans.
   */
  listAll: function(projectId) {
    var token = _getToken();
    if (!token) {
      console.warn('[R2] listAll: no auth token');
      return Promise.resolve(null);
    }
    var url = R2_WORKER + '/listall/' + encodeURIComponent(projectId);
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(resp) {
      if (!resp.ok) {
        console.warn('[R2] listAll failed:', resp.status, resp.statusText);
        return null;
      }
      return resp.json();
    }).catch(function(err) {
      console.warn('[R2] listAll error:', err.message);
      return null;
    });
  },

  /** Delete file from R2. Requires auth. Returns boolean. */
  del: function(r2Key) {
    var token = _getToken();
    return fetch(R2_WORKER + '/' + r2Key, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (token || '') }
    }).then(function(resp) {
      if (resp.ok || resp.status === 404) { console.log('[R2] Deleted:', r2Key); return true; }
      console.warn('[R2] Delete failed:', resp.status);
      return false;
    }).catch(function(err) {
      console.warn('[R2] Delete error:', err.message);
      return false;
    });
  },

  /**
   * S120 Push 25 (C4): exclusive-asset cleanup for a drawing.
   *
   * Called when a drawing is deleted OR has its content replaced. Deletes
   * the underlying PDF buffer in R2 IF AND ONLY IF no other live drawing
   * in the project shares the same pdfBufKey. Multi-page PDFs commonly
   * share a single pdfBufKey across N drawings (one per page), so we MUST
   * check before deleting.
   *
   * Tiles cleanup is intentionally NOT handled here — the worker has no
   * list-by-prefix endpoint at /tiles/, so we'd need to enumerate by
   * walking known levels/columns/rows from the manifest. That's a follow-on
   * change. PDFs are typically the larger storage cost (10-50MB each)
   * compared to ~256x256 WebP tiles, so this covers ~80% of orphan storage.
   *
   * Inputs:
   *   - projectId: needed for the R2 key path
   *   - drawingBeingRemoved: the drawing record about to be removed/replaced
   *   - allDrawings: the project's full drawings array (CALLER passes this
   *     pre-removal so we can check sharing among LIVE drawings)
   *
   * Returns Promise<{ pdfBufDeleted: bool, sharedSkipped: bool }>.
   */
  deleteDrawingAssets: function(projectId, drawingBeingRemoved, allDrawings) {
    if (!projectId || !drawingBeingRemoved) return Promise.resolve({ pdfBufDeleted: false, sharedSkipped: false });
    var key = drawingBeingRemoved.pdfBufKey;
    if (!key) return Promise.resolve({ pdfBufDeleted: false, sharedSkipped: false });
    // Sharing check: any OTHER live drawing referencing the same pdfBufKey?
    // _migratedAwayTo is the soft-deleted-by-migration flag — those don't count
    // since they're tombstones the user will purge.
    var others = (allDrawings || []).filter(function(d) {
      return d
        && d.id !== drawingBeingRemoved.id
        && !d._migratedAwayTo
        && d.pdfBufKey === key;
    });
    if (others.length > 0) {
      console.log('[R2] PDF buffer ' + key + ' still shared by ' + others.length + ' other drawing(s); not deleting.');
      return Promise.resolve({ pdfBufDeleted: false, sharedSkipped: true });
    }
    // Exclusive — safe to delete the PDF buffer. Worker key path is
    // {pid}/photos/pdfbufs/{pdfBufKey}.pdf as per uploadPdfBuf.
    var bufKey = projectId + '/photos/pdfbufs/' + key + '.pdf';
    return R2.del(bufKey).then(function(ok) {
      return { pdfBufDeleted: !!ok, sharedSkipped: false };
    });
  },

  /** Upload photo + save blob to IDB. Updates photo.r2Key/r2Url in place. */
  uploadPhoto: function(projectId, photo, type) {
    if (!photo || !photo.dataUrl) return Promise.resolve(null);
    type = type || 'original';
    var filename = 'defic_' + R2.generateFilename('jpg');
    return _toBlob(photo.dataUrl).then(function(blob) {
      if (!blob) return null;
      IDB.put('photoBlobs', { id: photo.id, dataBlob: blob }).catch(function() {});
      return R2.upload(projectId, type, blob, filename).then(function(result) {
        if (result) { photo.r2Key = result.r2Key; photo.r2Url = result.r2Url; }
        return photo;
      });
    });
  },

  /** Upload drawing to R2. Updates drawing.r2Key/r2Url in place. */
  uploadDrawing: function(projectId, drawing, data) {
    var filename = 'dwg_' + (drawing.id || Date.now()) + '.jpg';
    return R2.upload(projectId, 'drawings', data, filename).then(function(result) {
      if (result) { drawing.r2Key = result.r2Key; drawing.r2Url = result.r2Url; }
      return drawing;
    });
  },

  /**
   * S83: Upload the original PDF buffer to R2 so iPad/other-device viewers can
   * fetch the small vectorised source instead of falling back to a 4× rendered
   * JPEG (which crashes iPad Safari's ~400 MB per-tab budget).
   *
   * Key format: photos/{pid}/frt/pdfbufs/{pdfBufKey}.pdf
   * Returns {r2Key, r2Url} or null.
   *
   * S83b5: Files >90 MB use multipart automatically (single-PUT can't exceed
   * Cloudflare's 100 MB request body cap).
   */
  uploadPdfBuf: function(projectId, pdfBufKey, arrayBuf) {
    if (!projectId || !pdfBufKey || !arrayBuf) return Promise.resolve(null);
    var filename = pdfBufKey + '.pdf';
    var size = arrayBuf.byteLength || (arrayBuf.size || 0);
    var SINGLE_PUT_LIMIT = 90 * 1024 * 1024; // 90 MB safe ceiling
    if (size > SINGLE_PUT_LIMIT){
      console.log('[R2] PDF buffer ' + Math.round(size/1024/1024) + 'MB > 90MB \u2014 using multipart upload');
      return R2.uploadMultipart(projectId, 'pdfbufs', arrayBuf, filename, 'application/pdf');
    }
    return R2.upload(projectId, 'pdfbufs', arrayBuf, filename, 'application/pdf');
  },

  /**
   * S83b5: Multipart upload for files larger than the worker's single-request
   * body limit (~100 MB on Cloudflare). Splits the buffer into 5 MB parts,
   * uploads each via PUT, then completes the multipart upload.
   *
   * Returns { r2Key, r2Url } on success, null on failure.
   *
   * Uploads two parts in parallel by default (gentle on slow uplinks).
   */
  uploadMultipart: function(projectId, type, data, filename, mimeHint, opts){
    opts = opts || {};
    var partSize = opts.partSize || (5 * 1024 * 1024); // 5 MB per part
    var concurrency = opts.concurrency || 2;
    var contentType = mimeHint || 'application/octet-stream';
    var token = _getToken();
    if (!token) { console.warn('[R2] Multipart: no auth token'); return Promise.resolve(null); }
    if (!filename) filename = R2.generateFilename('bin');
    var pathSuffix = projectId + '/frt/' + type + '/' + filename;
    var r2Key = 'photos/' + pathSuffix;
    var r2Url = R2_WORKER + '/' + r2Key;

    return _toBlob(data, mimeHint).then(function(blob){
      if (!blob) { console.warn('[R2] Multipart: nothing to upload'); return null; }
      var totalSize = blob.size;
      var totalParts = Math.ceil(totalSize / partSize);
      console.log('[R2] Multipart init: ' + filename + '  ' + Math.round(totalSize/1024/1024) + 'MB in ' + totalParts + ' parts');

      // 1. Init
      return fetch(R2_WORKER + '/multipart/init/' + pathSuffix, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'X-Upload-Content-Type': contentType
        }
      }).then(function(r){
        if (!r.ok) throw new Error('init HTTP ' + r.status);
        return r.json();
      }).then(function(init){
        var uploadId = init.uploadId;
        if (!uploadId) throw new Error('init returned no uploadId');
        console.log('[R2] Multipart uploadId:', uploadId);

        // 2. Build parts list
        var parts = [];
        for (var i = 0; i < totalParts; i++){
          parts.push({
            partNumber: i + 1,
            offset: i * partSize,
            length: Math.min(partSize, totalSize - i * partSize)
          });
        }
        var completed = []; // {partNumber, etag}
        var nextIdx = 0;
        var doneCount = 0;
        var failed = false;
        var failErr = null;

        function _uploadOne(p){
          var slice = blob.slice(p.offset, p.offset + p.length);
          var url = R2_WORKER + '/multipart/part/' + pathSuffix +
                    '?uploadId=' + encodeURIComponent(uploadId) +
                    '&partNumber=' + p.partNumber;
          return fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token },
            body: slice
          }).then(function(r){
            if (!r.ok) return r.text().then(function(t){ throw new Error('part ' + p.partNumber + ' HTTP ' + r.status + ': ' + t); });
            return r.json();
          }).then(function(j){
            completed.push({ partNumber: j.partNumber, etag: j.etag });
            doneCount++;
            console.log('[R2] Part ' + j.partNumber + '/' + totalParts + ' done');
            if (opts.onProgress) opts.onProgress(doneCount, totalParts);
          });
        }

        // 3. Run with bounded concurrency
        function _runWorker(){
          if (failed) return Promise.resolve();
          if (nextIdx >= parts.length) return Promise.resolve();
          var p = parts[nextIdx++];
          return _uploadOne(p).then(_runWorker).catch(function(e){
            failed = true; failErr = e;
          });
        }
        var workers = [];
        for (var w = 0; w < Math.min(concurrency, parts.length); w++){
          workers.push(_runWorker());
        }
        return Promise.all(workers).then(function(){
          if (failed){
            // Try to abort the multipart so R2 cleans up
            return fetch(R2_WORKER + '/multipart/abort/' + pathSuffix +
                         '?uploadId=' + encodeURIComponent(uploadId), {
              method: 'DELETE',
              headers: { 'Authorization': 'Bearer ' + token }
            }).catch(function(){}).then(function(){
              throw failErr || new Error('multipart upload failed');
            });
          }

          // 4. Complete (parts must be sorted by partNumber)
          completed.sort(function(a, b){ return a.partNumber - b.partNumber; });
          return fetch(R2_WORKER + '/multipart/complete/' + pathSuffix +
                       '?uploadId=' + encodeURIComponent(uploadId), {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(completed)
          }).then(function(r){
            if (!r.ok) return r.text().then(function(t){ throw new Error('complete HTTP ' + r.status + ': ' + t); });
            return r.json();
          });
        });
      });
    }).then(function(result){
      if (!result) return null;
      console.log('[R2] Multipart complete: ' + r2Key);
      return { r2Key: r2Key, r2Url: r2Url };
    }).catch(function(err){
      console.warn('[R2] Multipart upload error:', err && err.message);
      return null;
    });
  },

  /** Queue upload for offline (saves to IDB pendingUploads). */
  queueUpload: function(id, projectId, type, data, filename) {
    return IDB.put('pendingUploads', {
      id: id, projectId: projectId, type: type || 'original',
      filename: filename || R2.generateFilename('jpg'),
      data: data, timestamp: new Date().toISOString()
    });
  },

  /** Process pending uploads from IDB queue. */
  processPendingUploads: function(projectId) {
    if (_queueRunning) return Promise.resolve();
    _queueRunning = true;
    return IDB.getAll('pendingUploads').then(function(items) {
      if (!items || !items.length) { _queueRunning = false; return; }
      console.log('[R2] Processing', items.length, 'pending uploads...');
      var chain = Promise.resolve();
      items.forEach(function(item) {
        chain = chain.then(function() {
          return _toBlob(item.data || item.dataUrl).then(function(blob) {
            if (!blob) return IDB.del('pendingUploads', item.id);
            return R2.upload(item.projectId || projectId, item.type || 'original', blob, item.filename).then(function(result) {
              if (result) return IDB.del('pendingUploads', item.id);
            });
          });
        });
      });
      return chain.then(function() { _queueRunning = false; });
    }).catch(function() { _queueRunning = false; });
  },

  /** Rebuild r2Url from r2Key for all photos (safety net). */
  rebuildUrls: function(proj) {
    if (!proj) return;
    var count = 0;
    function fix(ph) {
      if (ph && ph.r2Key && !ph.r2Url) { ph.r2Url = R2_WORKER + '/' + ph.r2Key; count++; }
    }
    (proj.photos || []).forEach(fix);
    (proj.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(function(d) {
        (d.observations || []).forEach(function(o) { (o.photos || []).forEach(fix); });
        (d.photos || []).forEach(fix);
      });
    });
    (proj.generalDeficiencies || []).forEach(function(d) {
      (d.observations || []).forEach(function(o) { (o.photos || []).forEach(fix); });
      (d.photos || []).forEach(fix);
    });
    (proj.drawings || []).forEach(fix);
    if (count > 0) console.log('[R2] Rebuilt', count, 'missing r2Urls');
  },

  generateFilename: function(extension) {
    var uuid = crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    return uuid + '.' + (extension || 'jpg');
  }
};
