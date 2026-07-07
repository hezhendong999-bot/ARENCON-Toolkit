/* ══════════════════════════════════════════════════════════════════════════
   ARENCON /lib/ — Photo Engine (Layer 1 + 2)   (photoEngine.js, S446 Step 4)
   ══════════════════════════════════════════════════════════════════════════
   The TOOL-AGNOSTIC photo primitives, extracted from FRT frt/js/ui/photos.js
   at live HEAD. This is the "conservative cut" (Mark, S446):

     LAYER 1 — pure photo plumbing (zero data-model coupling):
       compressPhoto()        off-thread resize/JPEG via injected ImageWorkerHost
       readExifCaptureDate()   minimal EXIF DateTimeOriginal reader (S367)
       compositeThumbnailURL() rotation + markup-stroke thumbnail (plain canvas)
       cloudIconHtml()         R2 + cloud-sync status glyph (S161)
       rewriteR2Host() / esc() display-host rewrite (S431) + HTML escape

     LAYER 2 — Recently-Deleted UI + tombstone retention (tool-agnostic):
       trashDaysRemaining()    90-day retention countdown
       renderTrashHtml()        grid + multi-select Recently-Deleted view (S439)

   NOT here (stays in FRT — the 34-method deficiency-photo logic): photo→pin→
   deficiency/observation reassign, site/pool mutual-exclusivity, pin labels,
   ghost strips, the deleted-record GATHERER that walks FRT's tree. Those call
   INTO this module; this module never reaches back into a tool's data model.

   INJECTION: the only outside surfaces are passed in, never imported:
     • ImageWorkerHost — for compressPhoto (createBinaryImageWorker instance)
     • isAdmin()        — optional; gates the trash "Delete forever" controls
   Everything else is pure. No Model, no R2, no Auth import.

   RULES honored verbatim from source: plain <canvas> only (never Offscreen in
   the composite path — that ban protects iPad; the image WORKER's Offscreen is
   the documented S130 waiver and lives in lib/workers, not here); markup strokes
   rendered via window.MarkupEngine when present; files.arencon.app is the live
   R2 host (S391) and rewriteR2Host() maps the retired worker host onto it.
   ══════════════════════════════════════════════════════════════════════════ */

// ── Config constants (carried from photos.js) ──
export var TRASH_RETENTION_DAYS = 90;

export var IC_RESTORE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/></svg>';
export var IC_TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';

// ═══════════════════ LAYER 1 — pure plumbing ═══════════════════

/** HTML-escape (verbatim from photos.js esc). */
export function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/**
 * S431 display-layer host rewrite. Local model layers still hold r2Urls on the
 * RETIRED worker host; the live host is files.arencon.app (S391). Rewrites ONLY
 * the string used to paint a tile — never mutates the stored model. No-op on
 * data:/blob:/current-host strings. (Confirms live canon: workers.dev is dead.)
 */
export function rewriteR2Host(u) {
  if (!u || typeof u !== 'string') return u;
  if (u.indexOf('arencon-r2-worker.hezhendong999.workers.dev') === -1) return u;
  return u.replace('arencon-r2-worker.hezhendong999.workers.dev', 'files.arencon.app');
}

/**
 * Compress + optionally thumbnail an image File off the main thread.
 * ImageWorkerHost is INJECTED (lib/workers/imageWorkerHost.js instance).
 * Resolves { dataUrl, thumb } — same contract as FRT _compressSitePhoto.
 */
export function compressPhoto(ImageWorkerHost, file, opts) {
  opts = opts || {};
  if (!ImageWorkerHost || !ImageWorkerHost.compressFile) {
    return Promise.reject(new Error('[lib/photoEngine] compressPhoto requires an ImageWorkerHost with compressFile()'));
  }
  return ImageWorkerHost.compressFile(file, {
    maxW: opts.maxW || 1600,
    quality: (typeof opts.quality === 'number') ? opts.quality : 0.8,
    thumbMaxW: (typeof opts.thumbMaxW === 'number') ? opts.thumbMaxW : 200,
    thumbQuality: (typeof opts.thumbQuality === 'number') ? opts.thumbQuality : 0.7
  }).then(function (r) {
    return { dataUrl: r.dataUrl, thumb: r.thumb, w: r.w, h: r.h };
  });
}

/**
 * S367 — minimal EXIF capture-date reader. Photos are dated by when they were
 * TAKEN (EXIF DateTimeOriginal), not when uploaded — fixes photos shot on the
 * field day but imported later showing the import date. Reads only the date tag
 * from the JPEG APP1/EXIF segment; no dependency, no full EXIF parse.
 * Returns 'YYYY-MM-DD' or null (caller falls back to upload date).
 * VERBATIM from photos.js _readExifCaptureDate.
 */
export function readExifCaptureDate(file) {
  return new Promise(function (resolve) {
    try {
      if (!file || !/^image\/jpe?g$/i.test(file.type || '')) { resolve(null); return; }
      var reader = new FileReader();
      reader.onerror = function () { resolve(null); };
      reader.onload = function (e) {
        try {
          var view = new DataView(e.target.result);
          if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) { resolve(null); return; } // not JPEG
          var offset = 2, len = view.byteLength;
          while (offset < len) {
            if (view.getUint16(offset) !== 0xFFE1) {            // not APP1 — skip this marker
              if ((view.getUint16(offset) & 0xFF00) !== 0xFF00) { resolve(null); return; }
              offset += 2 + view.getUint16(offset + 2);
              continue;
            }
            var app1 = offset + 4;
            if (view.getUint32(app1) !== 0x45786966) { resolve(null); return; } // "Exif"
            var tiff = app1 + 6;
            var little = (view.getUint16(tiff) === 0x4949);    // II = little-endian
            function u16(o) { return view.getUint16(o, little); }
            function u32(o) { return view.getUint32(o, little); }
            if (u16(tiff + 2) !== 0x002A) { resolve(null); return; }
            var ifd0 = tiff + u32(tiff + 4);
            var n0 = u16(ifd0), exifIfd = 0;
            for (var i = 0; i < n0; i++) {
              var e0 = ifd0 + 2 + i * 12;
              if (u16(e0) === 0x8769) { exifIfd = tiff + u32(e0 + 8); break; }
            }
            function readDateTag(ifd, tag) {
              if (!ifd) return null;
              var n = u16(ifd);
              for (var j = 0; j < n; j++) {
                var ent = ifd + 2 + j * 12;
                if (u16(ent) === tag) {
                  var cnt = u32(ent + 4);
                  var valOff = (cnt > 4) ? tiff + u32(ent + 8) : (ent + 8);
                  var s = '';
                  for (var k = 0; k < Math.min(cnt, 19); k++) {
                    var c = view.getUint8(valOff + k); if (!c) break; s += String.fromCharCode(c);
                  }
                  return s;
                }
              }
              return null;
            }
            var raw = readDateTag(exifIfd, 0x9003) || readDateTag(exifIfd, 0x9004);
            if (raw) {
              var m = raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
              if (m) { resolve(m[1] + '-' + m[2] + '-' + m[3]); return; }
            }
            resolve(null); return;
          }
          resolve(null);
        } catch (err) { resolve(null); }
      };
      reader.readAsArrayBuffer(file.slice(0, 131072));
    } catch (err) { resolve(null); }
  });
}

/**
 * Rotation + markup-stroke thumbnail. Plain <canvas> only (NO OffscreenCanvas —
 * iPad rule). Uses window.MarkupEngine for stroke rendering when present.
 * VERBATIM from photos.js _compositeThumbnailURL.
 */
export function compositeThumbnailURL(src, rot, strokes, mkFrame) {
  return new Promise(function (resolve) {
    try {
      var ME = (typeof window !== 'undefined') ? window.MarkupEngine : null;
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var nw = img.naturalWidth, nh = img.naturalHeight;
          if (!nw || !nh) { resolve(''); return; }
          var maxEdge = 240, scale = Math.min(1, maxEdge / Math.max(nw, nh));
          var dw = Math.max(1, Math.round(nw * scale)), dh = Math.max(1, Math.round(nh * scale));
          var sideways = (rot === 90 || rot === 270);
          var ow = sideways ? dh : dw, oh = sideways ? dw : dh;
          var cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
          var ctx = cv.getContext('2d');
          function applyRot() {
            if (rot === 90) { ctx.translate(ow, 0); ctx.rotate(Math.PI / 2); }
            else if (rot === 180) { ctx.translate(ow, oh); ctx.rotate(Math.PI); }
            else if (rot === 270) { ctx.translate(0, oh); ctx.rotate(3 * Math.PI / 2); }
          }
          ctx.save(); applyRot(); ctx.drawImage(img, 0, 0, dw, dh); ctx.restore();
          if (strokes && strokes.length && ME && ME.renderStrokesToContext) {
            var fw = (mkFrame && mkFrame.w) ? mkFrame.w : nw, fh = (mkFrame && mkFrame.h) ? mkFrame.h : nh;
            ctx.save(); applyRot(); ctx.scale(dw / fw, dh / fh);
            try { ME.renderStrokesToContext(ctx, strokes, fw, fh); } catch (_) {}
            ctx.restore();
          }
          var out = cv.toDataURL('image/jpeg', 0.82); cv.width = 0; cv.height = 0;
          resolve(out || '');
        } catch (e) { resolve(''); }
      };
      img.onerror = function () { resolve(''); };
      img.src = src;
    } catch (e) { resolve(''); }
  });
}

/**
 * Cloud-status icon composing R2 binary state with cloud-metadata sync state.
 * Reads window.SyncEngine.diag defensively (present when the sync engine is
 * wired; absent → treated as "unknown", never downgrades a confirmed photo).
 * VERBATIM from photos.js _cloudIcon (S161).
 */
export function cloudIconHtml(ph) {
  var status, color, glyph = '';
  if (ph.r2Status === 'failed') {
    status = 'Upload failed'; color = '#A85959';
    glyph = '<path d="M9 9l6 6M15 9l-6 6" stroke="white" stroke-width="2.2" stroke-linecap="round"/>';
  } else if (ph.r2Status === 'uploading' || ph.r2Status === 'pending') {
    status = 'Uploading\u2026'; color = '#FFA726';
  } else if (ph.r2Status === 'uploaded' || (ph.r2Url && !ph.r2Status)) {
    var lastSync = null;
    try {
      if (typeof window !== 'undefined' && window.SyncEngine && window.SyncEngine.diag) {
        lastSync = window.SyncEngine.diag.lastSeenUpdatedAt;
      }
    } catch (e) { /* defensive */ }
    var photoTs = 0;
    var m = String(ph.id || '').match(/^[a-z]+_(\d{13})/i);
    if (m) photoTs = parseInt(m[1], 10);
    var syncTs = lastSync ? new Date(lastSync).getTime() : 0;
    if ((photoTs && syncTs && photoTs <= syncTs) || (!syncTs)) {
      status = 'Synced'; color = '#5F8068';
      glyph = '<path d="M8 12.5l2.5 2.5L16 9.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
    } else {
      status = 'R2 done \u2014 awaiting cloud sync'; color = '#FFA726';
      glyph = '<circle cx="12" cy="12" r="1.5" fill="white"/>';
    }
  } else {
    status = 'Local only'; color = '#94A3B8';
  }
  return '<span class="ph-cloud" title="' + status + '">'
    + '<svg width="18" height="14" viewBox="0 0 24 18" fill="' + color + '">'
    + '<path d="M19 16H6a4.5 4.5 0 010-9 5.5 5.5 0 0110.5-1A4.5 4.5 0 0119 16z"/>' + glyph
    + '</svg></span>';
}

// ═══════════════════ LAYER 2 — Recently-Deleted ═══════════════════
// Per-instance selection state lives on a factory so two tools (or two mounts)
// don't share module-global selection. renderTrashHtml is pure given records.

/** 90-day retention countdown. VERBATIM from photos.js _trashDaysRemaining. */
export function trashDaysRemaining(deletedDateIso) {
  if (!deletedDateIso) return TRASH_RETENTION_DAYS;
  var deleted = new Date(deletedDateIso).getTime();
  if (!deleted) return TRASH_RETENTION_DAYS;
  var elapsedMs = Date.now() - deleted;
  var elapsedDays = Math.floor(elapsedMs / 86400000);
  return Math.max(0, TRASH_RETENTION_DAYS - elapsedDays);
}

/** uid for a deleted record (site vs defic routing). From photos.js _trashUid. */
export function trashUid(r) { return r.kind === 'site' ? ('s:' + r.siteIdx) : ('d:' + r.deficId + ':' + r.photoId); }

/**
 * Build the Recently-Deleted grid HTML (S439 grid + multi-select rewrite).
 * PURE given the deletedRecords array — the caller (FRT or Electric) gathers
 * records in whatever shape its model uses and passes them in as plain objects:
 *   { kind:'site'|'defic', siteIdx?, deficId?, photoId?, src, deletedDate,
 *     badgeText?, badgeClass? }
 * `state` is a per-instance selection object from makeTrashState(); `isAdmin`
 * gates the permanent-delete controls (default false → inspectors can't purge).
 * VERBATIM logic from photos.js _renderTrashHtml.
 */
export function renderTrashHtml(deletedRecords, state, isAdmin) {
  state = state || makeTrashState();
  isAdmin = !!isAdmin;
  var h = '';
  if (!deletedRecords.length) {
    state.order = []; state.selected.clear(); state.lastSel = null;
    h += '<p class="ph-empty">Nothing in Recently Deleted. Photos you delete from the gallery appear here and can be restored for ' + TRASH_RETENTION_DAYS + ' days.</p>';
    return h;
  }
  state.order = deletedRecords.map(trashUid);
  state.selected.forEach(function (u) { if (state.order.indexOf(u) < 0) state.selected.delete(u); });
  var nSel = state.selected.size;
  h += '<p class="ph-trash-note">Deleted photos are kept for ' + TRASH_RETENTION_DAYS + ' days, then removed automatically. Restore brings a photo back where it was.'
    + (isAdmin ? '' : ' Only a principal can delete a photo permanently.') + '</p>';
  if (isAdmin) {
    h += '<div class="ph-trash-bulkbar">';
    h += '<button class="ph-trash-purge" data-action="ph-trash-purge-selected"' + (nSel ? '' : ' disabled') + '>Delete selected' + (nSel ? ' (' + nSel + ')' : '') + '</button>';
    h += '<button class="ph-trash-purge ph-trash-purge-all" data-action="ph-trash-purge-all">Delete all (' + deletedRecords.length + ')</button>';
    if (nSel) h += '<button class="ph-trash-restore" data-action="ph-trash-clear-sel">Clear selection</button>';
    h += '</div>';
  }
  h += '<div class="ph-trash-grid">';
  deletedRecords.forEach(function (r) {
    var uid = trashUid(r);
    var days = trashDaysRemaining(r.deletedDate);
    var daysCls = days <= 5 ? 'ph-trash-days urgent' : 'ph-trash-days';
    var selected = state.selected.has(uid);
    var routeAttrs = (r.kind === 'site')
      ? ' data-kind="site" data-site-idx="' + r.siteIdx + '"'
      : ' data-kind="defic" data-defic-id="' + esc(r.deficId) + '" data-photo-id="' + esc(r.photoId) + '"';
    h += '<div class="ph-trash-tile' + (selected ? ' selected' : '') + '" data-trash-uid="' + esc(uid) + '">';
    if (r.src) {
      h += '<img class="tphoto" src="' + esc(rewriteR2Host(r.src)) + '" loading="lazy" data-action="ph-trash-lightbox"' + routeAttrs + ' title="View photo" onerror="this.style.display=\'none\'">';
    } else {
      h += '<div class="tphoto tnoimg">\uD83D\uDCF7</div>';
    }
    if (r.badgeText) h += '<span class="ph-badges"><span class="ph-badge ' + esc(r.badgeClass || 'ph-badge-site') + '">' + esc(r.badgeText) + '</span></span>';
    if (isAdmin) {
      h += '<span class="ph-trash-check" data-action="ph-trash-toggle" data-uid="' + esc(uid) + '" title="Select">' + (selected ? '\u2713' : '') + '</span>';
    }
    h += '<div class="' + daysCls + '" title="' + days + ' day' + (days === 1 ? '' : 's') + ' left">' + days + 'd</div>';
    h += '<div class="ph-trash-actions">';
    h += '<button class="ph-trash-restore" data-action="ph-restore-photo"' + routeAttrs + ' title="Restore">' + IC_RESTORE_SVG + '</button>';
    if (isAdmin) h += '<button class="ph-trash-purge" data-action="ph-purge-photo"' + routeAttrs + ' title="Delete forever">' + IC_TRASH_SVG + '</button>';
    h += '</div></div>';
  });
  h += '</div>';
  return h;
}

/** Per-instance Recently-Deleted selection state (replaces photos.js module globals). */
export function makeTrashState() {
  return { selected: new Set(), lastSel: null, order: [] };
}
