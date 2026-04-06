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

function _toBlob(data) {
  if (data instanceof Blob) return Promise.resolve(data);
  if (typeof data === 'string' && data.startsWith('data:')) {
    return fetch(data).then(function(r) { return r.blob(); });
  }
  return Promise.resolve(null);
}

export var R2 = {

  WORKER_URL: R2_WORKER,

  /** Upload blob/dataUrl to R2. Returns {r2Key, r2Url} or null. */
  upload: function(projectId, type, data, filename) {
    if (!filename) filename = R2.generateFilename('jpg');
    var r2Key = 'photos/' + projectId + '/frt/' + type + '/' + filename;
    var r2Url = R2_WORKER + '/' + r2Key;
    var token = _getToken();

    return _toBlob(data).then(function(blob) {
      if (!blob) { console.warn('[R2] No blob to upload'); return null; }
      return fetch(r2Url, {
        method: 'PUT',
        headers: {
          'Content-Type': blob.type || 'image/jpeg',
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
