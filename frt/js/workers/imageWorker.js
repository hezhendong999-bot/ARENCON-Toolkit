/**
 * ARENCON FRT — Image Compression Worker (S130 Item 5.4)
 * ══════════════════════════════════════════════════════
 *
 * Resizes + JPEG re-encodes image Blobs off the main thread using
 * OffscreenCanvas. Replaces the synchronous Image + Canvas + toDataURL chain
 * that froze the UI for ~200-500ms per photo on field tablets.
 *
 * Rule waiver (S130): OffscreenCanvas was previously banned in the project
 * because iPad Safari < 16.4 didn't support it. iPad support was abandoned
 * (kept crashing); field tablets are Android-only now. Android Chrome has
 * supported OffscreenCanvas since 2018. The host (imageWorkerHost.js) keeps
 * a main-thread fallback so the code path still works if OffscreenCanvas
 * ever isn't available — e.g. local dev on macOS Safari.
 *
 * RPC protocol (main thread → worker):
 *   postMessage({
 *     id: 'rpc-N',
 *     op: 'compress',
 *     payload: {
 *       blob: <Blob>,       // input image (any decodable format)
 *       maxW: 1600,         // max output width (height auto-scales)
 *       quality: 0.8,       // JPEG quality 0..1
 *       thumbMaxW: 200,     // optional: also generate a thumbnail
 *       thumbQuality: 0.7
 *     }
 *   })
 *
 * Response:
 *   postMessage({
 *     id: 'rpc-N',
 *     ok: true,
 *     result: { dataUrl: '<data:image/jpeg;...>',
 *               thumb:   '<data:image/jpeg;...>' | null,
 *               w: <int>, h: <int> }
 *   })
 *
 * Pure helper: calcResize(w, h, maxW) → { w, h }
 *   Exported so the main-thread fallback uses the same math. Tested directly.
 */

/**
 * Pure aspect-ratio math. If input width is <= maxW, returns unchanged.
 * Otherwise scales height proportionally. Used by both worker and fallback.
 */
export function calcResize(w, h, maxW) {
  if (!w || !h || !maxW) return { w: w | 0, h: h | 0 };
  if (w <= maxW) return { w: w | 0, h: h | 0 };
  var nh = Math.round(h * maxW / w);
  return { w: maxW | 0, h: nh | 0 };
}

/**
 * Read a Blob into a data URL via FileReader. Works in Worker scopes
 * (FileReader is available in DedicatedWorkerGlobalScope).
 */
function _blobToDataUrl(blob) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.onerror = function() { reject(new Error('FileReader failed')); };
    r.readAsDataURL(blob);
  });
}

/**
 * Worker-only: decode + resize + re-encode. Uses createImageBitmap +
 * OffscreenCanvas + convertToBlob — all unavailable in jsdom, which is why
 * unit tests only cover calcResize directly; the integration is exercised
 * by the live deployed site and Playwright smoke tests.
 */
async function _compressInWorker(payload) {
  var blob = payload.blob;
  var maxW = payload.maxW || 1600;
  var quality = (typeof payload.quality === 'number') ? payload.quality : 0.8;
  var thumbMaxW = payload.thumbMaxW || 0;
  var thumbQuality = (typeof payload.thumbQuality === 'number') ? payload.thumbQuality : 0.7;

  if (!blob || !(blob instanceof Blob)) {
    throw new Error('imageWorker.compress: blob is required');
  }

  // Decode. createImageBitmap is the off-main-thread image decoder.
  var bmp = await createImageBitmap(blob);
  var dims = calcResize(bmp.width, bmp.height, maxW);

  // Main resize
  var cv = new OffscreenCanvas(dims.w, dims.h);
  var ctx = cv.getContext('2d');
  ctx.drawImage(bmp, 0, 0, dims.w, dims.h);
  var mainBlob = await cv.convertToBlob({ type: 'image/jpeg', quality: quality });
  var dataUrl = await _blobToDataUrl(mainBlob);

  // Optional thumbnail
  var thumb = null;
  if (thumbMaxW > 0) {
    var tdims = calcResize(bmp.width, bmp.height, thumbMaxW);
    var tcv = new OffscreenCanvas(tdims.w, tdims.h);
    tcv.getContext('2d').drawImage(bmp, 0, 0, tdims.w, tdims.h);
    var tBlob = await tcv.convertToBlob({ type: 'image/jpeg', quality: thumbQuality });
    thumb = await _blobToDataUrl(tBlob);
  }

  bmp.close();
  return { dataUrl: dataUrl, thumb: thumb, w: dims.w, h: dims.h };
}

// ── Worker RPC dispatcher ───────────────────────────────────────────
// Only attach when actually running inside a Worker (not jsdom unit tests).
// Detection mirrors syncWorker.js: `self.postMessage` exists, no `window`.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' &&
    typeof window === 'undefined') {
  self.addEventListener('message', function(e) {
    var msg = e.data || {};
    var id = msg.id;
    var op = msg.op;
    var payload = msg.payload || {};

    if (op === 'ping') {
      self.postMessage({ id: id, ok: true, result: { pong: true, t: Date.now() } });
      return;
    }
    if (op !== 'compress') {
      self.postMessage({ id: id, ok: false, error: 'Unknown op: ' + op });
      return;
    }
    _compressInWorker(payload)
      .then(function(result) { self.postMessage({ id: id, ok: true, result: result }); })
      .catch(function(err) {
        self.postMessage({ id: id, ok: false, error: (err && err.message) || String(err) });
      });
  });
}
