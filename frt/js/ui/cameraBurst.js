/**
 * ARENCON FRT v2 — Burst Camera (S284, Mark)
 * ══════════════════════════════════════════
 * Continuous in-app camera: shoot → shoot → shoot → Done, all photos returned
 * together. Replaces the single-shot <input type=file capture> round-trip that
 * forced re-opening the camera per photo (the S159 limitation — native capture
 * inputs are single-shot by design and re-fire is blocked by user-gesture
 * security policy; the fix is this custom getUserMedia + <video> camera).
 *
 * Contract — openCameraBurst() resolves with:
 *   File[]  (length ≥ 1)  photos taken, caller feeds its normal photo pipeline
 *   []                    user cancelled / Done with zero shots → caller no-ops
 *   null                  camera unsupported or permission denied → caller
 *                         informs the user (do NOT auto-click a fallback input:
 *                         by then the user gesture is gone and capture-input
 *                         clicks are gesture-gated on Android Chrome — S159)
 *
 * Capture path: ImageCapture.takePhoto() (full sensor res on Android Chrome)
 * with a <canvas> frame-grab fallback. Plain canvas only — OffscreenCanvas is
 * prohibited (Safari/desktop-Safari incompatibility, established canon).
 * Tracks are always stopped on close. One overlay at a time.
 */

var _open = false;

// S342: instant tap-feedback overlay. getUserMedia can take 1-3s to open the
// camera hardware on Android; previously NOTHING appeared in that gap, so the
// Camera button looked dead and Mark couldn't tell his tap registered (and
// re-tapped). Show a lightweight "Starting camera…" overlay synchronously the
// moment open() is called; replace it with the real UI when the stream lands,
// or remove it on error. <16ms acknowledgment instead of a 1-3s dead button.
function _showStartingOverlay() {
  var o = document.getElementById('cam-burst-starting');
  if (o) return o;
  o = document.createElement('div');
  o.id = 'cam-burst-starting';
  o.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#0b0a0d;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:Calibri,sans-serif;color:#f4f3f6;';
  var spin = document.createElement('div');
  spin.style.cssText = 'width:44px;height:44px;border-radius:50%;border:4px solid rgba(255,255,255,.25);border-top-color:#C9476A;animation:camBurstSpin .8s linear infinite;';
  var label = document.createElement('div');
  label.textContent = 'Starting camera…';
  label.style.cssText = 'font-size:16px;color:#a09aa8;';
  if (!document.getElementById('cam-burst-spin-kf')) {
    var st = document.createElement('style');
    st.id = 'cam-burst-spin-kf';
    st.textContent = '@keyframes camBurstSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  o.appendChild(spin); o.appendChild(label);
  document.body.appendChild(o);
  return o;
}
function _removeStartingOverlay() {
  var o = document.getElementById('cam-burst-starting');
  if (o && o.parentNode) o.parentNode.removeChild(o);
}

export function openCameraBurst() {
  return new Promise(function(resolve) {
    if (_open) { resolve([]); return; }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { resolve(null); return; }
    _open = true;
    _showStartingOverlay(); // instant feedback before the hardware opens
    // S341: Android WebView crashes ("Aw, Snap") on the old 4096x3072 (12MP)
    // request — the live video texture + full-res canvas grabs exhaust the
    // WebView renderer's much tighter memory ceiling (iOS Safari has far more
    // headroom and was fine). Cap the live stream to 1080p, which is still a
    // sharp deficiency photo after downstream compression and slashes memory
    // ~6x. iOS keeps behaving; this just stops the Android crash.
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    }).then(function(stream) {
      _removeStartingOverlay();
      _openUI(stream, function(r) { _open = false; resolve(r); });
    }).catch(function() {
      _removeStartingOverlay();
      _open = false;
      resolve(null);
    });
  });
}

function _openUI(stream, done) {
  var shots = [];
  var urls = [];

  var overlay = document.createElement('div');
  overlay.id = 'cam-burst-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0a0d;display:flex;flex-direction:column;font-family:Calibri,sans-serif;';

  var vidWrap = document.createElement('div');
  vidWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#000;min-height:0;';
  var video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
  video.srcObject = stream;
  vidWrap.appendChild(video);

  var counter = document.createElement('div');
  counter.style.cssText = 'position:absolute;top:14px;right:14px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:99px;padding:6px 14px;font-size:15px;font-weight:700;display:none;';
  vidWrap.appendChild(counter);

  var flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .12s;';
  vidWrap.appendChild(flash);
  overlay.appendChild(vidWrap);

  var strip = document.createElement('div');
  strip.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding:8px 12px;background:#16141b;flex:none;';
  overlay.appendChild(strip);

  // Controls — generous touch targets (field tablets, gloves)
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 22px calc(14px + env(safe-area-inset-bottom,0px));background:#16141b;border-top:1px solid rgba(255,255,255,.08);flex:none;';
  var btnCancel = document.createElement('button');
  btnCancel.id = 'cam-burst-cancel';
  btnCancel.textContent = 'Cancel';
  btnCancel.style.cssText = 'min-width:96px;min-height:52px;background:transparent;color:#a09aa8;border:1px solid rgba(255,255,255,.2);border-radius:12px;font-size:16px;font-family:Calibri,sans-serif;cursor:pointer;';
  var shutter = document.createElement('button');
  shutter.id = 'cam-burst-shutter';
  shutter.setAttribute('aria-label', 'Take photo');
  shutter.style.cssText = 'width:74px;height:74px;border-radius:50%;background:#fff;border:5px solid rgba(255,255,255,.35);cursor:pointer;flex:none;';
  var btnDone = document.createElement('button');
  btnDone.id = 'cam-burst-done';
  btnDone.textContent = 'Done';
  btnDone.style.cssText = 'min-width:96px;min-height:52px;background:#2E9E72;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;font-family:Calibri,sans-serif;cursor:pointer;opacity:.45;';
  bar.appendChild(btnCancel); bar.appendChild(shutter); bar.appendChild(btnDone);
  overlay.appendChild(bar);

  // S332: Library/files option INSIDE the burst UI, so the single "Add Photos"
  // button still reaches existing photos. Picked files merge into shots[] and
  // flow out the identical Done path. (Ported from Diesel S333.)
  var libInput = document.createElement('input');
  libInput.type = 'file'; libInput.accept = 'image/*'; libInput.multiple = true;
  libInput.style.display = 'none';
  overlay.appendChild(libInput);
  var btnLib = document.createElement('button');
  btnLib.id = 'cam-burst-library';
  btnLib.textContent = '\uD83D\uDDBC Library';
  btnLib.style.cssText = 'position:absolute;top:14px;left:14px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:99px;padding:8px 16px;font-size:14px;font-family:Calibri,sans-serif;cursor:pointer;z-index:2;';
  vidWrap.appendChild(btnLib);
  btnLib.addEventListener('click', function(){ libInput.value=''; libInput.click(); });
  libInput.addEventListener('change', function(){
    var fs = Array.prototype.slice.call(libInput.files||[]);
    fs.forEach(function(file){
      shots.push(file);
      var u = URL.createObjectURL(file); urls.push(u);
      var th = document.createElement('img'); th.src=u; th.style.cssText='height:56px;border-radius:8px;flex:none;';
      strip.appendChild(th);
    });
    strip.scrollLeft = strip.scrollWidth;
    _updateUI();
  });

  document.body.appendChild(overlay);
  var prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  var track = stream.getVideoTracks()[0];
  var imgCap = (typeof window.ImageCapture === 'function' && track) ? new window.ImageCapture(track) : null;
  var busy = false;

  function _updateUI() {
    counter.textContent = shots.length + (shots.length === 1 ? ' photo' : ' photos');
    counter.style.display = shots.length ? 'block' : 'none';
    btnDone.textContent = 'Done' + (shots.length ? ' (' + shots.length + ')' : '');
    btnDone.style.opacity = shots.length ? '1' : '.45';
  }
  function _addShot(blob) {
    var f = new File([blob], 'camera_' + Date.now() + '_' + (shots.length + 1) + '.jpg', { type: blob.type || 'image/jpeg' });
    shots.push(f);
    var u = URL.createObjectURL(blob);
    urls.push(u);
    var th = document.createElement('img');
    th.src = u;
    th.style.cssText = 'height:56px;border-radius:8px;flex:none;';
    strip.appendChild(th);
    strip.scrollLeft = strip.scrollWidth;
    flash.style.opacity = '.7';
    setTimeout(function() { flash.style.opacity = '0'; }, 90);
    _updateUI();
  }
  function _grabFrame() {
    var vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    // S341: clamp the grab to a 1920px long edge so a single shot can never
    // allocate a huge canvas (a 12MP grab is ~50MB raw — a few of those crash
    // the Android WebView). Scale proportionally; 1920px is ample for a report
    // photo and is downscaled again by the downstream compressor anyway.
    var MAX = 1920;
    var scale = Math.min(1, MAX / Math.max(vw, vh));
    var cw = Math.round(vw * scale), ch = Math.round(vh * scale);
    var cv = document.createElement('canvas'); // plain canvas — never OffscreenCanvas
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    ctx.drawImage(video, 0, 0, cw, ch);
    cv.toBlob(function(b) {
      if (b) _addShot(b);
      busy = false;
      cv.width = 0; cv.height = 0; // release canvas backing store promptly
    }, 'image/jpeg', 0.9);
  }
  shutter.addEventListener('click', function() {
    if (busy) return;
    busy = true;
    // S341: use the resolution-CLAMPED canvas grab as the primary path.
    // ImageCapture.takePhoto() ignores the getUserMedia size constraint and
    // returns FULL-SENSOR images (12MP+) on Android, which is exactly what
    // crashed the WebView. The canvas grab respects our 1920px cap. (iOS does
    // not expose ImageCapture, so it already used this path.) takePhoto is
    // retired here to keep memory bounded and the shutter responsive.
    _grabFrame();
  });

  // S342: rotation handling. On Android the video track briefly mutes and
  // renegotiates orientation/resolution when the tablet rotates; the <video>
  // keeps painting the LAST frame (looks frozen) until the new stream settles.
  // We can't remove the platform pause, but we can make it read as intentional:
  // show a brief "Adjusting…" hint on the known signals (orientationchange +
  // track mute) and clear it when the track unmutes or after a short timeout,
  // and nudge the video to resume painting.
  var _adjust = document.createElement('div');
  _adjust.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(11,10,13,.55);color:#f4f3f6;font-family:Calibri,sans-serif;font-size:15px;z-index:3;';
  _adjust.textContent = 'Adjusting…';
  vidWrap.appendChild(_adjust);
  var _adjustTimer = null;
  function _showAdjusting() {
    _adjust.style.display = 'flex';
    if (_adjustTimer) clearTimeout(_adjustTimer);
    _adjustTimer = setTimeout(_hideAdjusting, 1200); // safety: clear even if unmute never fires
  }
  function _hideAdjusting() {
    _adjust.style.display = 'none';
    if (_adjustTimer) { clearTimeout(_adjustTimer); _adjustTimer = null; }
    try { if (video.paused) video.play().catch(function(){}); } catch (e) {} // nudge repaint
  }
  function _onOrient() { _showAdjusting(); }
  try {
    window.addEventListener('orientationchange', _onOrient);
    if (track && track.addEventListener) {
      track.addEventListener('mute', _showAdjusting);
      track.addEventListener('unmute', _hideAdjusting);
    }
  } catch (e) {}

  function _close(result) {
    try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
    urls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    document.body.style.overflow = prevOverflow;
    overlay.remove();
    document.removeEventListener('keydown', _esc);
    try {
      window.removeEventListener('orientationchange', _onOrient);
      if (track && track.removeEventListener) {
        track.removeEventListener('mute', _showAdjusting);
        track.removeEventListener('unmute', _hideAdjusting);
      }
    } catch (e) {}
    if (_adjustTimer) { clearTimeout(_adjustTimer); _adjustTimer = null; }
    done(result);
  }
  function _esc(e) { if (e.key === 'Escape') _close([]); } // Escape = cancel (never the null fallback path)
  document.addEventListener('keydown', _esc);
  btnCancel.addEventListener('click', function() { _close([]); });
  btnDone.addEventListener('click', function() { _close(shots.slice()); });
}
