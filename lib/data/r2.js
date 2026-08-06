/**
 * ARENCON /lib/ - R2 Storage (parameterized, S446)
 * Extracted VERBATIM from FRT frt/js/data/r2.js (the audit winner). All
 * behaviour preserved - S133 markup tombstone TTL/cap, S129 conditional-PUT
 * read-merge-write, S201d post-PUT verify, S83b5 multipart, S343 authed list.
 *
 * TWO API changes from the FRT original (Plan v2 amendments), both CONFIG:
 *   1. toolKey  - the per-tool path segment. Keys become
 *                 photos/{pid}/{toolKey}/{type}/{fname}. Same backend, no
 *                 migration - a new toolKey is simply a new prefix.
 *   2. workerHost - Cloudflare Worker origin. Default https://files.arencon.app
 *
 * Deps INJECTED (not imported) so each tool supplies its own instances:
 *   import { createR2 } from '../lib/data/r2.js';
 *   export const R2 = createR2({ toolKey:'electric', IDB:ELECTRIC_IDB, Auth, UploadQueue });
 *
 * Key rules (unchanged): GET is public (no auth); PUT/DELETE/LIST need token.
 * HEAD unsupported by Worker (S200/S421) - existence probes use 1-byte Range
 * GET (bytes=0-0), never HEAD. Key format photos/{pid}/{toolKey}/{type}/{fname};
 * list path /list/{pid}/{toolKey}/{type}/. UUID/content-hash filenames.
 */

export function createR2(config) {
  config = config || {};
  var toolKey     = config.toolKey || 'frt';
  var workerHost  = config.workerHost || 'https://files.arencon.app';
  var Auth        = config.Auth;
  var IDB         = config.IDB;
  var UploadQueue = config.UploadQueue;
  if (!Auth || !IDB || !UploadQueue) {
    throw new Error('[lib/r2] createR2 requires { toolKey?, workerHost?, Auth, IDB, UploadQueue }');
  }



var R2_WORKER = workerHost;   // config-injected worker origin

// S133 — Tombstone (deletedIds) policy. Tombstones are {id, t: ms-epoch}
// entries that prevent the erase-while-concurrent resurrection bug. They
// must live long enough that every device interested in this drawing has
// synced past the deletion, but bounded so storage doesn't grow forever.
//
// TTL = 180 days. ARENCON's field workflow is months from first markup to
// report-issued; 180 days is comfortably longer than any realistic
// offline-and-editing window for a single drawing. Defense in depth: a hard
// count cap that should never trigger under normal use.
//
// Legacy plain-string tombstones (pre-S133) are upgraded to {id, t: now} on
// the first merge — they get a full 180-day safety window starting from the
// moment this code first sees the data, not from when the deletion really
// happened. Conservative.
var _TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
var _TOMBSTONE_HARD_CAP = 10000;
var _TOMBSTONE_CAP_TARGET = 5000;

// S133 — Normalize a tombstone array to the canonical {id, t} shape.
// Accepts mixed inputs: plain strings (legacy) and {id, t} objects (current).
// Strings → stamped with Date.now() so the pruner clock starts at first
// encounter. Objects with bad/missing `t` → re-stamped.
function _normTombs(arr) {
  if (!Array.isArray(arr)) return [];
  var now = Date.now();
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var e = arr[i];
    if (typeof e === 'string') {
      out.push({ id: e, t: now });
    } else if (e && typeof e.id === 'string') {
      out.push({ id: e.id, t: (typeof e.t === 'number' && isFinite(e.t)) ? e.t : now });
    }
  }
  return out;
}

// Re-entrancy guard for processPendingUploads() — the offline pending-upload
// drainer (IDB 'pendingUploads' store). This is a SEPARATE concern from the
// S130 UploadQueue, which coordinates live R2.upload() concurrency. The
// drainer just needs a simple boolean so two calls don't double-drain the
// IDB queue. (S130 5.1 accidentally removed this declaration when wiring
// R2.upload through UploadQueue; restored S130 hotfix.)
var _queueRunning = false;

// S201d (SYNC-02 Phase A G1 extension, 2026-05-27) — post-PUT verify
// helper for markup. Mirrors `BinaryOutbox._verifyR2Object` (frt/js/data/
// photoOutbox.js): a tiny ranged GET against the same r2Url after PUT
// success, to catch the 4380.24 class where the worker reports success
// but the object isn't actually retrievable. A real object returns 206
// Partial Content (or 200 if the worker doesn't honor Range — either is
// `resp.ok`); a missing object returns 404. Honors the same URL
// override as photoOutbox so a single `?verify=0` disables both paths.
//
// Markup keeps its in-binary 3-way merge dance (Q1(a) decision) — this
// verify call is the ONLY thing markup adopts from the outbox plumbing.
function _markupVerifyEnabled() {
  try {
    var p = new URLSearchParams(window.location.search);
    if (p.get('verify') === '0') return false;
  } catch (_) { /* non-browser */ }
  return true;
}

function _verifyMarkupR2(r2Url) {
  if (!_markupVerifyEnabled()) return Promise.resolve(true);
  return fetch(r2Url, {
    method: 'GET',
    headers: { 'Range': 'bytes=0-0' }
  }).then(function(resp) {
    return !!resp.ok;
  }).catch(function() {
    // Network error during verify — treat as fail so the retry loop runs.
    return false;
  });
}

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

var R2 = {

  WORKER_URL: R2_WORKER,
  // S491 — expose the tool prefix so dependents (photoOutbox heal probe)
  // derive backup keys from the SAME source as upload paths. Never guess.
  TOOL_KEY: toolKey,

  /** Upload blob/dataUrl/ArrayBuffer to R2. Returns {r2Key, r2Url} or null.
   *  S83: accepts optional mimeHint (for ArrayBuffer → PDF uploads).
   *  S130 5.1: routed through UploadQueue for concurrency cap + transient retry.
   *  Lane = `<pid>:<type>` so same-project same-type uploads serialize in
   *  enqueue order (drawing-then-thumbnail, photo-batch ordering, etc.).
   *  S176: optional 6th param `signal` (AbortSignal) — when provided, fetch
   *  honors aborts so the outbox can interrupt in-flight PUTs on user cancel.
   *  AbortError is non-transient (not TypeError, not 429/503) so UploadQueue
   *  propagates straight to the .catch and returns null without retrying.
   *  All existing callers (uploadPhoto, uploadDrawing, etc.) are unaffected. */
  upload: function(projectId, type, data, filename, mimeHint, signal) {
    if (!filename) filename = R2.generateFilename('jpg');
    var r2Key = 'photos/' + projectId + '/' + toolKey + '/' + type + '/' + filename;
    var r2Url = R2_WORKER + '/' + r2Key;
    var token = _getToken();

    return _toBlob(data, mimeHint).then(function(blob) {
      if (!blob) { console.warn('[R2] No blob to upload'); return null; }
      var ct = blob.type || mimeHint || 'image/jpeg';
      return UploadQueue.enqueue(function() {
        var fetchOpts = {
          method: 'PUT',
          headers: {
            'Content-Type': ct,
            'Authorization': 'Bearer ' + (token || '')
          },
          body: blob
        };
        // S176: AbortSignal piped through to fetch. Captured by closure so
        // UploadQueue's internal retry attempts share the same signal — if
        // the caller aborted between attempts, the retried fetch sees
        // signal.aborted=true and rejects immediately.
        if (signal) fetchOpts.signal = signal;
        return fetch(r2Url, fetchOpts).then(function(resp) {
          if (resp.ok) {
            console.log('[R2] Uploaded:', r2Key, '(' + Math.round(blob.size / 1024) + 'KB)');
            return { r2Key: r2Key, r2Url: r2Url };
          }
          // Build an Error with .status so UploadQueue's transient-retry can see it.
          var err = new Error('R2 upload failed: ' + resp.status + ' ' + resp.statusText);
          err.status = resp.status;
          throw err;
        });
      }, { lane: projectId + ':' + type, maxRetries: 2 })
      .catch(function(err) {
        // S176: distinguish aborts from real failures in the log line.
        // The processor still sees null either way, and _handleR2Failure
        // short-circuits when the row is gone from _rowsById (which the
        // cancel path guarantees synchronously before the fetch rejects).
        if (err && err.name === 'AbortError') {
          console.log('[R2] Upload aborted:', r2Key);
        } else {
          console.warn('[R2] Upload error:', err.message);
        }
        return null;
      });
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

  /** List files in R2. Returns [{key, url, size}].
   *  S343 SECURITY: now sends the Bearer token (same as listAll / PUT / DELETE).
   *  The /list/ endpoint was previously called anonymously, which left it open
   *  for anyone to enumerate every photo/drawing key in a project from a single
   *  public photo URL. Sending the token lets the Worker REQUIRE auth on /list/
   *  (Worker-side change) without breaking the app. GET stays public (filenames
   *  are unguessable UUIDs, so direct GET can't be enumerated — only LIST could). */
  list: function(projectId, type) {
    var token = _getToken();
    var listUrl = R2_WORKER + '/list/' + projectId + '/' + toolKey + '/' + type + '/';
    return fetch(listUrl, {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    }).then(function(resp) {
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
   * S481 — NO-ORPHAN-DELETE INVARIANT (Mark: "permanent, not a patch").
   * S491 — ported into /lib/ from FRT (the S446 extraction predates S481,
   * so every lib consumer — Electric live — was deleting photos unguarded).
   * Photo-image detection is toolKey-parameterized; behavior otherwise
   * verbatim from FRT.
   *
   * The permanent guarantee against the recurring photo-loss class. EVERY
   * deletion of a photo-image object MUST route through here, never through
   * R2.del directly. This function REFUSES to delete a photo file when doing
   * so would destroy the last surviving copy of that image.
   *
   * A delete is allowed ONLY when at least one of these proves a survivor:
   *   - opts.force === true   → a deliberate, user-intended photo delete
   *                             (the caller owns the decision; e.g. the
   *                             gallery trash action, the orphan cleaner).
   *   - opts.refCount > 0     → another LIVE photo record still points at this
   *                             key (caller counts refs; it has Model in scope).
   *   - local bytes exist     → this device's photoBlobs still holds the image
   *                             (opts.photoId), so the object is reconstructible.
   *
   * If NONE hold, the delete is BLOCKED and logged loudly. This is the
   * structural in-the-way guard: no revert/heal/cleanup path can silently
   * orphan a photo again, because the only way to the DELETE verb for a photo
   * key is through this proof gate.
   *
   * Non-photo keys ({toolKey}/markup/, {toolKey}/pdfbufs/, {toolKey}/drawings/)
   * are NOT this class and pass straight through — they have their own
   * share-checks (see deleteDrawingAsset).
   *
   * Returns Promise<boolean>: true if deleted (or non-photo passthrough),
   * false if blocked or the underlying delete failed.
   */
  delPhotoGuarded: function(r2Key, opts) {
    opts = opts || {};
    if (!r2Key) return Promise.resolve(false);
    var isPhotoImage = (r2Key.indexOf('/' + toolKey + '/original/') >= 0) || (r2Key.indexOf('/' + toolKey + '/marked/') >= 0);
    if (!isPhotoImage) {
      // Not a photo image — this guard does not apply. Pass through.
      return R2.del(r2Key);
    }
    if (opts.force === true) {
      console.log('[R2Guard] forced photo delete (deliberate):', r2Key);
      return R2.del(r2Key);
    }
    if (typeof opts.refCount === 'number' && opts.refCount > 0) {
      console.log('[R2Guard] photo delete allowed — ' + opts.refCount + ' other live ref(s):', r2Key);
      return R2.del(r2Key);
    }
    // Last check: does THIS device still hold the bytes? If so the object is
    // reconstructible and deleting the R2 copy is survivable.
    var checkLocal = opts.photoId
      ? IDB.get('photoBlobs', opts.photoId).then(function(rec){ return !!(rec && rec.dataBlob); }).catch(function(){ return false; })
      : Promise.resolve(false);
    return checkLocal.then(function(haveLocal){
      if (haveLocal) {
        console.log('[R2Guard] photo delete allowed — local bytes present (' + opts.photoId + '):', r2Key);
        return R2.del(r2Key);
      }
      console.error('[R2Guard] BLOCKED orphan photo delete — no force, no other ref, no local bytes. Key kept:', r2Key,
        '(photoId=' + (opts.photoId || 'n/a') + '). This is the S481 no-orphan-delete invariant preventing the recurring loss class.');
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

  /**
   * Upload the UNTOUCHED original camera/import file as the `original` type.
   *
   * Unlike uploadPhoto (which uploads photo.dataUrl — the 1600/0.8 compressed
   * copy), this uploads the raw File byte-for-byte. _toBlob passes a File/Blob
   * through unchanged (no re-encode), so the original resolution + quality land
   * in R2 intact. r2Key/r2Url are set to the original, so gallery full-view,
   * download-to-server, and the contractor photo link all resolve full-res.
   * The compressed photo.dataUrl stays local for fast rendering + the PDF embed.
   *
   * R2 is a transfer buffer (downloaded to server, then cleaned up), so storing
   * the full original here is intentional and bounded to in-flight projects.
   */
  uploadPhotoOriginal: function(projectId, photo, file) {
    if (!photo || !file) return Promise.resolve(null);
    var filename = 'defic_' + R2.generateFilename('jpg');
    // file is a Blob → _toBlob returns it untouched; original bytes preserved.
    return R2.upload(projectId, 'original', file, filename).then(function(result) {
      if (result) { photo.r2Key = result.r2Key; photo.r2Url = result.r2Url; }
      return photo;
    });
  },

  /** Upload drawing to R2. Updates drawing.r2Key/r2Url in place. */
  uploadDrawing: function(projectId, drawing, data) {
    // S158 V-5: filename should NOT double-prefix "dwg_". drawing.id already
    // starts with "dwg_" (per ui/drawings.js _runPdfPages id format).
    // Fallback path: when drawing.id is missing, generate a fresh "dwg_<ts>".
    // Existing files in R2 keep their double-prefixed names — DO NOT rename
    // in place; that would break every existing r2Key reference. Only new
    // uploads from this point on use the cleaner filename.
    var filename = (drawing.id || ('dwg_' + Date.now())) + '.jpg';
    return R2.upload(projectId, 'drawings', data, filename).then(function(result) {
      if (result) { drawing.r2Key = result.r2Key; drawing.r2Url = result.r2Url; }
      return drawing;
    });
  },

  /**
   * S126 Phase B — Per-drawing markup binary on R2.
   *
   * Key format: photos/{projectId}/{toolKey}/markup/{drawingId}.json
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
   * S133 — Tombstones are {id, t: ms-epoch} entries. Plain-string entries
   * from legacy callers / older R2 blobs are upgraded to {id, t: Date.now()}
   * on the fly. The union dedupes by id; on collision the earlier `t` wins
   * (the moment the deletion originated). After unioning, entries older than
   * _TOMBSTONE_TTL_MS are pruned, and a hard count cap is applied as
   * defense in depth.
   *
   * Returns `{ objects: Array, deletedIds: Array<{id, t}> }`.
   *
   * Exported for unit testing.
   */
  _mergeMarkupObjects: function(cloudArr, localArr, localTombstones, cloudTombstones) {
    var cloud = Array.isArray(cloudArr) ? cloudArr : [];
    var local = Array.isArray(localArr) ? localArr : [];

    // S133 — Normalize then union tombstones from both sides.
    // Dedup by id; on collision keep the earlier `t`.
    var ct = _normTombs(cloudTombstones);
    var lt = _normTombs(localTombstones);
    var tombById = Object.create(null);   /* S626b: id-keyed off DATA — plain {} made lookups for ids named 'constructor'/'hasOwnProperty'/'__proto__' read truthy off the prototype, so such strokes were SILENTLY DROPPED (or wrongly tombstoned) on merge. Same fault family as the S625 merge.js fix. Null prototype: a key exists only if THIS merge set it. */
    function _addTomb(entry) {
      var prev = tombById[entry.id];
      if (!prev || entry.t < prev.t) tombById[entry.id] = entry;
    }
    for (var t1 = 0; t1 < ct.length; t1++) _addTomb(ct[t1]);
    for (var t2 = 0; t2 < lt.length; t2++) _addTomb(lt[t2]);

    // S133 — Age-based prune: drop tombstones older than the TTL. Strokes
    // whose tombstones expire are no longer protected from resurrection on
    // a long-offline device, but 180 days is comfortably beyond any
    // realistic field workflow for a single drawing.
    var now = Date.now();
    var tombArr = [];
    var tombSet = Object.create(null);
    var pruned = 0;
    var ids = Object.keys(tombById);
    for (var ki = 0; ki < ids.length; ki++) {
      var e = tombById[ids[ki]];
      if (now - e.t >= _TOMBSTONE_TTL_MS) { pruned++; continue; }
      tombArr.push(e);
      tombSet[e.id] = true;
    }

    // S133 — Hard cap (defense in depth — should never trigger). When the
    // unioned set still exceeds the cap, keep the newest CAP_TARGET entries.
    if (tombArr.length > _TOMBSTONE_HARD_CAP) {
      tombArr.sort(function(a, b) { return a.t - b.t; }); // oldest first
      var dropped = tombArr.length - _TOMBSTONE_CAP_TARGET;
      tombArr = tombArr.slice(dropped);
      tombSet = Object.create(null);
      for (var ci = 0; ci < tombArr.length; ci++) tombSet[tombArr[ci].id] = true;
      pruned += dropped;
      console.warn('[R2] Markup tombstone hard-cap hit: dropped ' + dropped +
                   ' to keep ' + tombArr.length + ' newest');
    }
    if (pruned > 0) {
      console.log('[R2] Markup tombstone prune: dropped ' + pruned +
                  ' expired/over-cap, ' + tombArr.length + ' remain');
    }

    var localById = Object.create(null);
    for (var i = 0; i < local.length; i++) {
      if (local[i] && local[i].id) localById[local[i].id] = local[i];
    }
    var seen = Object.create(null);
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
    var r2Key = 'photos/' + projectId + '/' + toolKey + '/markup/' + filename;
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
      // S205 Bug B — markup JSON is mutable, but the Worker serves every
      // /photos/* GET with Cache-Control: public, max-age=31536000. A cached
      // GET hands back a STALE ETag, so the conditional PUT's If-Match never
      // matches R2's live ETag → 412 on every save after the 2nd, race
      // protection silently skipped (observed S202 field-verify). Read LIVE:
      // cache-bust query defeats browser + edge cache; no-store defeats the
      // browser HTTP cache. ONLY the read is busted — the PUT below still
      // targets the canonical r2Url. The Worker keys off pathname, so the
      // extra query param does not affect object resolution.
      var freshUrl = r2Url + (r2Url.indexOf('?') === -1 ? '?' : '&') + '_frt=' + Date.now();
      return fetch(freshUrl, { cache: 'no-store' }).then(function(resp) {
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
    //
    // `unconditional` — when true, skip If-Match / If-None-Match entirely and
    // do a plain PUT. Used by the retry loop as a LAST-RESORT after the
    // conditional retries are exhausted. This trades concurrent-write race
    // protection for guaranteed persistence: for a single inspector working
    // alone (the common case), a markup edit that 412s forever otherwise
    // silently never saves — which is how deletions "came back". The
    // read-merge-write still ran first, so cloud objects are preserved; we
    // just give up the atomic compare-and-swap on the final write.
    function attemptOnce(unconditional) {
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
        // unconditional → no preconditions at all (last-resort write).
        var ifMatch = unconditional ? null : ((cloud.exists && cloud.etag) ? cloud.etag : null);
        var ifNoneMatch = unconditional ? null : ((!cloud.exists) ? '*' : null);
        if (unconditional) {
          console.warn('[R2] Markup unconditional PUT (conditional retries exhausted) — race protection skipped:', r2Key);
        }

        // S127 Push B — 415 hardening. Try application/json first; on 415
        // (Worker content-type allowlist), retry once with octet-stream.
        return doPut(blob, ifMatch, ifNoneMatch, 'application/json').then(function(out) {
          var resp = out.resp;
          if (resp.ok) {
            var bytes = out.json.length;
            // S201d — post-PUT verify (GET Range:0-0). If verify fails,
            // route through retry as if 412'd; the outer retryLoop will
            // re-run read-merge-write.
            return _verifyMarkupR2(r2Url).then(function(verified) {
              if (!verified) {
                console.warn('[R2] Markup PUT 200 but verify GET failed — retrying read-merge-write:', r2Key);
                return { ok: false, retry: true };
              }
              console.log('[R2] Markup uploaded:', r2Key, '(' + mergeOut.objects.length + ' objects, ' +
                          mergeOut.deletedIds.length + ' tombstones, ' + Math.round(bytes / 1024) + 'KB)');
              return { ok: true, result: {
                r2Key: r2Key, r2Url: r2Url,
                count: mergeOut.objects.length,
                deletedCount: mergeOut.deletedIds.length,
                bytes: bytes
              }};
            });
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
                // S201d — same verify on the 415 fallback path.
                return _verifyMarkupR2(r2Url).then(function(verified2) {
                  if (!verified2) {
                    console.warn('[R2] Markup PUT 200 (octet fallback) but verify GET failed — retrying:', r2Key);
                    return { ok: false, retry: true };
                  }
                  console.log('[R2] Markup uploaded (octet fallback):', r2Key,
                              '(' + mergeOut.objects.length + ' objects, ' + mergeOut.deletedIds.length + ' tombstones)');
                  return { ok: true, result: {
                    r2Key: r2Key, r2Url: r2Url,
                    count: mergeOut.objects.length,
                    deletedCount: mergeOut.deletedIds.length,
                    bytes: bytes2
                  }};
                });
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
    // After the conditional retries are exhausted, make ONE final
    // unconditional attempt so the write actually persists. Without this,
    // a persistent 412 (e.g. an undeployed/buggy worker, or genuine heavy
    // contention) means the markup edit silently never reaches R2 — which
    // is exactly the "deleted markup came back on reopen" bug.
    function retryLoop(remaining, unconditional) {
      return attemptOnce(unconditional).then(function(outcome) {
        if (outcome.ok) return outcome.result;
        if (!outcome.retry) return null;            // terminal non-412 failure
        if (remaining > 0) {
          var jitter = 30 + Math.random() * 70;     // 30–100ms
          return new Promise(function(resolve) { setTimeout(resolve, jitter); })
            .then(function() { return retryLoop(remaining - 1, false); });
        }
        // Conditional retries exhausted. If we haven't already tried an
        // unconditional write, do exactly one as a last resort.
        if (!unconditional) {
          return retryLoop(0, true);
        }
        // Even the unconditional write failed (or also 412'd, which would be
        // bizarre) — give up. Caller logs "no result", IDB still has the data.
        return null;
      });
    }

    return retryLoop(MAX_RETRIES, false);
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
    var r2Key = 'photos/' + projectId + '/' + toolKey + '/markup/' + drawingId + '.json';
    return R2.del(r2Key);
  },

  /**
   * S83: Upload the original PDF buffer to R2 so iPad/other-device viewers can
   * fetch the small vectorised source instead of falling back to a 4× rendered
   * JPEG (which crashes iPad Safari's ~400 MB per-tab budget).
   *
   * Key format: photos/{pid}/{toolKey}/pdfbufs/{pdfBufKey}.pdf
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
    var pathSuffix = projectId + '/' + toolKey + '/' + type + '/' + filename;
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

  return R2;
}
