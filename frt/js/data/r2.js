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

    // S126 Phase B — Markup binary is per-drawing (no sharing possible), so
    // delete it unconditionally. Fire-and-forget — if delete fails the
    // orphan-cleanup pass picks it up later.
    if (drawingBeingRemoved.id) {
      R2.deleteMarkup(projectId, drawingBeingRemoved.id).catch(function() {});
    }

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
   * S126 Phase B — Per-drawing markup binary on R2.
   *
   * Key format: photos/{projectId}/frt/markup/{drawingId}.json
   *
   * The Worker is content-type agnostic — it's a thin auth-then-pass-through
   * proxy to R2. We send application/json on PUT and GET it back the same way.
   *
   * Returns { r2Key, r2Url, count, bytes } on success, or null.
   *
   * Why per-drawing files (not one project-wide markup blob): write contention.
   * Two inspectors editing two different drawings of the same project no longer
   * collide on a shared object. The drawing-level granularity matches the
   * existing photo per-file convention and keeps the worst-case clobber window
   * to a single drawing's edit batch.
   */
  /**
   * S129 Item 2 (tight scope) — Union two markup-object arrays by `id`.
   * S129 Item 1.1 (medium scope) — Tombstones close the erase-while-concurrent
   * resurrection bug. Any id present in EITHER deletedIds set is excluded from
   * the merged objects, and tombstones are unioned so all inspectors converge.
   *
   * CRDT-lite pattern: every stroke already has a unique `id` (mk_<base36>_<rand>
   * — see markup.js _newId()), so concurrent additions on different drawings
   * (or even the same drawing) merge cleanly without conflict.
   *
   * On id collision (same id in both arrays) local wins — the local copy is
   * "fresher" because the user is actively editing.
   *
   * Order: cloud objects first (in cloud order), then local-only objects appended.
   * This preserves cloud-side z-order for the other inspector's strokes while
   * placing the current user's new strokes on top.
   *
   * Tombstone semantics: a tombstoned id is excluded from the merged objects
   * regardless of where the object lives (cloud, local, or both). Delete is
   * final. Tombstones from both sides are unioned so the deletion propagates
   * to every other inspector on their next merge.
   *
   * Returns `{ objects: Array, deletedIds: Array<string> }`.
   *
   * Exported for unit testing.
   */
  _mergeMarkupObjects: function(cloudArr, localArr, localTombstones, cloudTombstones) {
    var cloud = Array.isArray(cloudArr) ? cloudArr : [];
    var local = Array.isArray(localArr) ? localArr : [];
    var lt = Array.isArray(localTombstones) ? localTombstones : [];
    var ct = Array.isArray(cloudTombstones) ? cloudTombstones : [];

    // Union of tombstones — propagate deletions to every collaborator.
    var tombSet = {};
    var tombArr = [];
    for (var t1 = 0; t1 < ct.length; t1++) {
      var id1 = ct[t1];
      if (typeof id1 === 'string' && !tombSet[id1]) { tombSet[id1] = true; tombArr.push(id1); }
    }
    for (var t2 = 0; t2 < lt.length; t2++) {
      var id2 = lt[t2];
      if (typeof id2 === 'string' && !tombSet[id2]) { tombSet[id2] = true; tombArr.push(id2); }
    }

    var localById = {};
    for (var i = 0; i < local.length; i++) {
      if (local[i] && local[i].id) localById[local[i].id] = local[i];
    }
    var seen = {};
    var objects = [];
    // 1) Walk cloud — for each cloud object, prefer local version if same id
    //    exists (local wins on conflict); otherwise keep cloud version.
    //    Tombstoned ids are excluded.
    for (var j = 0; j < cloud.length; j++) {
      var c = cloud[j];
      if (!c || !c.id) continue;
      if (seen[c.id]) continue;
      if (tombSet[c.id]) continue;
      seen[c.id] = true;
      objects.push(localById[c.id] || c);
    }
    // 2) Append local-only objects (id not present in cloud) in local order.
    //    Tombstoned ids are excluded.
    for (var k = 0; k < local.length; k++) {
      var l = local[k];
      if (!l || !l.id) continue;
      if (seen[l.id]) continue;
      if (tombSet[l.id]) continue;
      seen[l.id] = true;
      objects.push(l);
    }
    return { objects: objects, deletedIds: tombArr };
  },

  /**
   * S126 Phase B — Per-drawing markup binary on R2.
   * S129 Item 2 (tight scope) — Read-merge-write semantics: GET current cloud
   * state, union with local objects by id, PUT the merged result. Fixes
   * the two-inspector concurrent-draw clobber bug where last-write wiped the
   * first inspector's strokes.
   * S129 Item 1.1 (medium scope) — Tombstones close the erase-while-concurrent
   * resurrection bug. Local deletedIds are propagated and exclude objects
   * from the merged result.
   * S129 Item 1.2 — Conditional PUT via If-Match closes the GET-then-PUT race
   * window. If a concurrent write lands between our GET and our PUT, R2
   * returns 412 and we re-read/re-merge/re-PUT (up to 3 retries). When the
   * Worker has not yet been upgraded to enforce If-Match, the PUT succeeds
   * normally — this code is deploy-tolerant. The benefit activates as soon
   * as the Worker is updated.
   *
   * Storage format: `{ objects: Array, deletedIds: Array<string> }`.
   * Back-compat: a plain-array body is read as `{objects: arr, deletedIds: []}`.
   *
   * @param {string} projectId
   * @param {string} drawingId
   * @param {Array} objects                  — current local stroke array
   * @param {Array<string>} [tombstones]     — local deletedIds (optional, S129 1.1)
   * @returns {Promise<{r2Key, r2Url, count, bytes, deletedCount} | null>}
   */
  uploadMarkup: function(projectId, drawingId, objects, tombstones) {
    if (!projectId || !drawingId) return Promise.resolve(null);
    var self = this;
    var localArr = Array.isArray(objects) ? objects : [];
    var localTomb = Array.isArray(tombstones) ? tombstones : [];
    var filename = drawingId + '.json';
    var r2Key = 'photos/' + projectId + '/frt/markup/' + filename;
    var r2Url = R2_WORKER + '/' + r2Key;
    var token = _getToken();

    var MAX_RETRIES = 3;

    // S129 1.1 — Normalize blob shape. Old format is a plain array of strokes;
    // new format is `{objects, deletedIds}`. Loader treats either equivalently.
    function normalizeCloudBody(body) {
      if (!body) return { objects: [], deletedIds: [] };
      if (Array.isArray(body)) return { objects: body, deletedIds: [] };
      if (typeof body === 'object') {
        return {
          objects: Array.isArray(body.objects) ? body.objects : [],
          deletedIds: Array.isArray(body.deletedIds) ? body.deletedIds : []
        };
      }
      return { objects: [], deletedIds: [] };
    }

    // S129 1.2 — Read cloud + capture ETag for conditional PUT.
    // 404 → no existing markup (first write). On non-OK responses or parse
    // failure we treat the cloud as empty and proceed (legacy fallback).
    function fetchCloud() {
      return fetch(r2Url).then(function(resp) {
        if (resp.status === 404) {
          // First write — use If-None-Match: * so a concurrent first-create
          // by another inspector loses (then we retry).
          return { body: null, etag: null, exists: false };
        }
        if (!resp.ok) {
          // Other error — treat as no-merge to preserve legacy behavior;
          // unconditional PUT (no If-Match) on this path.
          return { body: null, etag: null, exists: false };
        }
        var etag = resp.headers.get('ETag') || resp.headers.get('etag');
        return resp.json().then(function(body) {
          return { body: body, etag: etag, exists: true };
        }).catch(function() {
          return { body: null, etag: etag, exists: true };
        });
      }).catch(function() {
        return { body: null, etag: null, exists: false };
      });
    }

    // S129 1.2 — Conditional PUT. Header set depends on cloud state:
    //   exists & etag known → If-Match: <etag>
    //   does not exist      → If-None-Match: *
    //   exists but no etag  → unconditional (Worker undeployed or CORS not exposing ETag)
    function doPut(merged, ifMatch, ifNoneMatch, ct) {
      var json = JSON.stringify(merged);
      var headers = {
        'Content-Type': ct,
        'Authorization': 'Bearer ' + (token || '')
      };
      if (ifMatch) headers['If-Match'] = ifMatch;
      if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;
      return fetch(r2Url, { method: 'PUT', headers: headers, body: json })
        .then(function(resp) { return { resp: resp, json: json }; });
    }

    // Run one attempt: GET cloud → merge → PUT. Returns
    //   { ok: true,  result: {r2Key, r2Url, count, bytes, deletedCount} }
    //   { ok: false, retry: true }   ← precondition failed, caller should retry
    //   { ok: false, retry: false }  ← terminal failure
    function attemptOnce() {
      return fetchCloud().then(function(cloud) {
        var normalized = normalizeCloudBody(cloud.body);
        var mergeOut = self._mergeMarkupObjects(
          normalized.objects, localArr, localTomb, normalized.deletedIds
        );
        var addedFromCloud = mergeOut.objects.length - localArr.length;
        if (addedFromCloud > 0) {
          console.log('[R2] Markup merge: ' + addedFromCloud + ' cloud object(s) preserved, ' +
                      localArr.length + ' local object(s) — uploading ' + mergeOut.objects.length +
                      ' total (' + mergeOut.deletedIds.length + ' tombstones)');
        }

        var blob = { objects: mergeOut.objects, deletedIds: mergeOut.deletedIds };
        var ifMatch = (cloud.exists && cloud.etag) ? cloud.etag : null;
        var ifNoneMatch = (!cloud.exists) ? '*' : null;

        // S127 Push B — 415 hardening. Try application/json first; on 415
        // (Worker content-type allowlist), retry once with octet-stream.
        return doPut(blob, ifMatch, ifNoneMatch, 'application/json').then(function(out) {
          var resp = out.resp;
          if (resp.ok) {
            var bytes = out.json.length;
            console.log('[R2] Markup uploaded:', r2Key, '(' + mergeOut.objects.length + ' objects, ' +
                        mergeOut.deletedIds.length + ' tombstones, ' + Math.round(bytes / 1024) + 'KB)');
            return { ok: true, result: {
              r2Key: r2Key, r2Url: r2Url,
              count: mergeOut.objects.length,
              deletedCount: mergeOut.deletedIds.length,
              bytes: bytes
            }};
          }
          // 412 Precondition Failed — concurrent write happened between our
          // GET and our PUT. Retry the whole read-merge-write cycle.
          if (resp.status === 412) {
            console.log('[R2] Markup PUT 412 (concurrent write detected) — retrying read-merge-write:', r2Key);
            return { ok: false, retry: true };
          }
          if (resp.status === 415) {
            console.warn('[R2] Markup upload 415 on application/json — retrying with octet-stream:', r2Key);
            return doPut(blob, ifMatch, ifNoneMatch, 'application/octet-stream').then(function(out2) {
              var resp2 = out2.resp;
              if (resp2.ok) {
                var bytes2 = out2.json.length;
                console.log('[R2] Markup uploaded (octet fallback):', r2Key,
                            '(' + mergeOut.objects.length + ' objects, ' + mergeOut.deletedIds.length + ' tombstones)');
                return { ok: true, result: {
                  r2Key: r2Key, r2Url: r2Url,
                  count: mergeOut.objects.length,
                  deletedCount: mergeOut.deletedIds.length,
                  bytes: bytes2
                }};
              }
              if (resp2.status === 412) {
                console.log('[R2] Markup PUT 412 (octet fallback) — retrying read-merge-write:', r2Key);
                return { ok: false, retry: true };
              }
              console.error('[R2] Markup upload FAILED (both content-types):', r2Key, resp2.status, resp2.statusText);
              return { ok: false, retry: false };
            });
          }
          console.error('[R2] Markup upload FAILED:', r2Key, resp.status, resp.statusText);
          return { ok: false, retry: false };
        }).catch(function(err) {
          console.error('[R2] Markup upload ERROR:', r2Key, err && err.message);
          return { ok: false, retry: false };
        });
      });
    }

    // Retry loop with small jitter so concurrent retries don't lockstep.
    function retryLoop(remaining) {
      return attemptOnce().then(function(outcome) {
        if (outcome.ok) return outcome.result;
        if (!outcome.retry || remaining <= 0) return null;
        var jitter = 30 + Math.random() * 70;  // 30–100ms
        return new Promise(function(resolve) { setTimeout(resolve, jitter); })
          .then(function() { return retryLoop(remaining - 1); });
      });
    }

    return retryLoop(MAX_RETRIES);
  },

  /**
   * S126 Phase B — Download markup JSON for a drawing. GET, no auth.
   * S129 Item 1.1 — Returns `{objects: Array, deletedIds: Array<string>}` to
   * surface tombstones to the loader. Back-compat: an old-format plain-array
   * body is normalized to `{objects: arr, deletedIds: []}`.
   *
   * Returns the normalized object, or null on network fail / 404 / parse error.
   *
   * 404 is a valid "no markup yet" outcome and returns null without warning —
   * the caller treats null as "fall through to IDB / legacy field".
   */
  downloadMarkup: function(r2Url) {
    if (!r2Url) return Promise.resolve(null);
    return fetch(r2Url).then(function(resp) {
      if (resp.status === 404) return null;
      if (!resp.ok) {
        console.warn('[R2] Markup download failed:', resp.status);
        return null;
      }
      return resp.json();
    }).then(function(body) {
      if (body == null) return null;
      // Old format: plain array of strokes.
      if (Array.isArray(body)) return { objects: body, deletedIds: [] };
      // New format: { objects, deletedIds }.
      if (typeof body === 'object') {
        return {
          objects: Array.isArray(body.objects) ? body.objects : [],
          deletedIds: Array.isArray(body.deletedIds) ? body.deletedIds : []
        };
      }
      return null;
    }).catch(function(err) {
      console.warn('[R2] Markup download error:', err.message);
      return null;
    });
  },

  /** S126 Phase B — Delete a drawing's markup binary. Auth required. */
  deleteMarkup: function(projectId, drawingId) {
    if (!projectId || !drawingId) return Promise.resolve(false);
    var r2Key = 'photos/' + projectId + '/frt/markup/' + drawingId + '.json';
    return R2.del(r2Key);
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
