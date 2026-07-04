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

// S424: physical orientation from the gravity sensor. The TWA viewport is
// portrait-locked, so screen.orientation.angle reads 0 no matter how the device
// is held (measured, S423 DIAG) — the accelerometer is the only true signal.
// atan2 of the gravity vector in the device x-y plane = physical roll, snapped to
// 0/90/180/270. Strongest exactly when the camera is in use (device near vertical);
// near-flat readings are ignored and the last known value kept, like native cameras.
var _grav = null;
var _gravArmed = false;
var _isIOSDev = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function _onMotion(e) {
  var g = e.accelerationIncludingGravity;
  if (!g || g.x === null || g.y === null) return;
  var gx = _isIOSDev ? -g.x : g.x, gy = _isIOSDev ? -g.y : g.y; // iOS inverts the sign convention
  if (Math.sqrt(gx * gx + gy * gy) < 3) return; // near-flat: ambiguous, keep last known
  var a = Math.round(Math.atan2(gx, gy) / (Math.PI / 2)) * 90;
  _grav = ((a % 360) + 360) % 360;
}
function _armGravity() {
  if (_gravArmed) return; _gravArmed = true;
  try {
    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS 13+: must be called inside the user gesture — openCameraBurst is.
      DeviceMotionEvent.requestPermission().then(function (s) {
        if (s === 'granted') window.addEventListener('devicemotion', _onMotion);
      }).catch(function () {});
    } else {
      window.addEventListener('devicemotion', _onMotion);
    }
  } catch (e) {}
}
function _disarmGravity() {
  _gravArmed = false;
  try { window.removeEventListener('devicemotion', _onMotion); } catch (e) {}
}

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
    _armGravity(); // inside the user gesture (iOS sensor permission)
    _showStartingOverlay(); // instant feedback before the hardware opens
    // S341: Android WebView crashes ("Aw, Snap") on the old 4096x3072 (12MP)
    // request — the live video texture + full-res canvas grabs exhaust the
    // WebView renderer's much tighter memory ceiling (iOS Safari has far more
    // headroom and was fine). Cap the live stream to 1080p, which is still a
    // sharp deficiency photo after downstream compression and slashes memory
    // ~6x. iOS keeps behaving; this just stops the Android crash.
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, // 4:3 to match native/report framing (was 16:9 1080)
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
  var shots = [];   // File[]  — index-aligned with urls[]
  var urls  = [];   // object URLs (thumbnails + review); revoked on delete/close
  var metas = [];   // DIAG (temporary): per-shot {aShot,vw,vh,src} — index-aligned with shots[]
  function _camAngle() {
    try {
      if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
      if (typeof window.orientation === 'number') return (window.orientation + 360) % 360;
    } catch (e) {}
    return null;
  }
  var aOpen = _camAngle(); // DIAG: device angle when the camera opened

  var overlay = document.createElement('div');
  overlay.id = 'cam-burst-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0a0d;display:flex;flex-direction:column;font-family:Calibri,sans-serif;';

  // ---- top bar: ✕ cancel · live count · Library ----
  var top = document.createElement('div');
  top.style.cssText = 'flex:none;display:flex;align-items:center;justify-content:space-between;padding:calc(12px + env(safe-area-inset-top,0px)) 18px 10px;color:#f4f3f6;';
  var btnCancel = document.createElement('button');
  btnCancel.id = 'cam-burst-cancel'; btnCancel.setAttribute('aria-label', 'Cancel'); btnCancel.innerHTML = '&#10005;';
  btnCancel.style.cssText = 'width:44px;height:40px;background:none;border:0;color:#f4f3f6;font-size:24px;line-height:1;cursor:pointer;text-align:left;';
  var counter = document.createElement('div');
  counter.style.cssText = 'font-size:15px;color:#f4f3f6;opacity:.6;';
  counter.innerHTML = '<b id="cam-burst-count">0</b> photos this round';
  var btnLib = document.createElement('button');
  btnLib.id = 'cam-burst-library'; btnLib.textContent = '\uD83D\uDDBC Library';
  btnLib.style.cssText = 'background:rgba(255,255,255,.10);color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:99px;padding:8px 14px;font-size:14px;font-family:Calibri,sans-serif;cursor:pointer;';
  top.appendChild(btnCancel); top.appendChild(counter); top.appendChild(btnLib);
  overlay.appendChild(top);

  // ---- preview ----
  var vidWrap = document.createElement('div');
  vidWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#000;min-height:0;';
  var stage = document.createElement('div'); // true 4:3 frame — WYSIWYG with the 4:3 grab below
  stage.style.cssText = 'position:relative;height:100%;max-height:100%;max-width:100%;aspect-ratio:4/3;overflow:hidden;background:#000;';
  var video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true; video.setAttribute('playsinline', '');
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;'; // fill the 4:3 stage (center-crop)
  video.srcObject = stream;
  stage.appendChild(video);
  vidWrap.appendChild(stage);
  function _updateStageAspect() {
    var portrait = false;
    try { portrait = window.matchMedia('(orientation: portrait)').matches; } catch (e) {}
    stage.style.aspectRatio = portrait ? '3 / 4' : '4 / 3'; // preview frame follows the hold (WYSIWYG)
  }
  _updateStageAspect();
  var flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .12s;';
  vidWrap.appendChild(flash);
  overlay.appendChild(vidWrap);

  // ---- thumbnail strip (tap a thumb to review) ----
  var strip = document.createElement('div');
  strip.style.cssText = 'flex:none;display:flex;gap:8px;overflow-x:auto;padding:8px 12px;background:#16141b;';
  overlay.appendChild(strip);

  // ---- bottom bar: Retake last · shutter · Done ----
  var bar = document.createElement('div');
  bar.style.cssText = 'flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 22px calc(14px + env(safe-area-inset-bottom,0px));background:#16141b;border-top:1px solid rgba(255,255,255,.08);';
  var btnRetake = document.createElement('button');
  btnRetake.id = 'cam-burst-retake'; btnRetake.innerHTML = '&#8630; Retake last';
  btnRetake.style.cssText = 'min-width:120px;min-height:52px;background:none;border:0;color:#f4f3f6;font-size:15px;font-weight:600;font-family:Calibri,sans-serif;text-align:left;cursor:pointer;';
  var shutter = document.createElement('button');
  shutter.id = 'cam-burst-shutter'; shutter.setAttribute('aria-label', 'Take photo');
  shutter.style.cssText = 'width:74px;height:74px;border-radius:50%;background:#fff;border:5px solid rgba(255,255,255,.35);cursor:pointer;flex:none;';
  var btnDone = document.createElement('button');
  btnDone.id = 'cam-burst-done'; btnDone.textContent = 'Done';
  btnDone.style.cssText = 'min-width:120px;min-height:52px;background:none;border:0;color:#f4f3f6;font-size:17px;font-weight:700;font-family:Calibri,sans-serif;text-align:right;cursor:pointer;opacity:.45;';
  bar.appendChild(btnRetake); bar.appendChild(shutter); bar.appendChild(btnDone);
  overlay.appendChild(bar);

  // S332: Library — existing photos merge into shots[] and flow out the identical
  // Done path (ported from Diesel S333).
  var libInput = document.createElement('input');
  libInput.type = 'file'; libInput.accept = 'image/*'; libInput.multiple = true; libInput.style.display = 'none';
  overlay.appendChild(libInput);
  btnLib.addEventListener('click', function(){ libInput.value = ''; libInput.click(); });
  libInput.addEventListener('change', function(){
    var fs = Array.prototype.slice.call(libInput.files || []);
    fs.forEach(function(file){ shots.push(file); urls.push(URL.createObjectURL(file)); metas.push({ aShot: null, vw: 0, vh: 0, src: 'lib' }); }); // DIAG
    renderStrip(); _updateUI();
  });

  // ---- review overlay: tap a thumb → full photo + prev/next + delete + back ----
  var review = document.createElement('div');
  review.style.cssText = 'position:absolute;inset:0;z-index:5;background:#000;display:none;flex-direction:column;';
  var rTop = document.createElement('div');
  rTop.style.cssText = 'flex:none;position:relative;display:flex;align-items:center;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 10px;';
  var rBack = document.createElement('button');
  rBack.innerHTML = '<span style="font-size:20px;line-height:1;margin-right:6px">&#8249;</span>Camera';
  rBack.style.cssText = 'position:relative;z-index:2;display:flex;align-items:center;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.34);color:#fff;font-size:15px;font-weight:700;font-family:Calibri,sans-serif;padding:9px 16px;border-radius:99px;cursor:pointer;';
  var rPos = document.createElement('div');
  rPos.style.cssText = 'position:absolute;left:0;right:0;text-align:center;pointer-events:none;font-size:15px;color:#a09aa8;';
  rTop.appendChild(rBack); rTop.appendChild(rPos); review.appendChild(rTop);
  var rImgWrap = document.createElement('div');
  rImgWrap.style.cssText = 'flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:8px;';
  var rImg = document.createElement('img');
  rImg.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;';
  rImgWrap.appendChild(rImg); review.appendChild(rImgWrap);
  // DIAG (temporary): readings + the four rotations of this photo, labeled A-D.
  var rDbg = document.createElement('div');
  rDbg.style.cssText = 'flex:none;padding:4px 10px 0;';
  review.appendChild(rDbg);
  var rBar = document.createElement('div');
  rBar.style.cssText = 'flex:none;display:flex;align-items:center;justify-content:space-between;padding:10px 28px calc(20px + env(safe-area-inset-bottom,0px));';
  var rPrev = document.createElement('button'); rPrev.innerHTML = '&#8249;';
  rPrev.style.cssText = 'width:56px;min-height:52px;background:none;border:0;color:#fff;font-size:30px;cursor:pointer;';
  var rDel = document.createElement('button'); rDel.innerHTML = '&#128465; Delete';
  rDel.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(226,96,118,.16);border:1px solid rgba(226,96,118,.5);color:#E26076;font-size:16px;font-weight:700;font-family:Calibri,sans-serif;padding:12px 22px;border-radius:12px;cursor:pointer;';
  var rNext = document.createElement('button'); rNext.innerHTML = '&#8250;';
  rNext.style.cssText = 'width:56px;min-height:52px;background:none;border:0;color:#fff;font-size:30px;cursor:pointer;';
  rBar.appendChild(rPrev); rBar.appendChild(rDel); rBar.appendChild(rNext);
  review.appendChild(rBar);
  overlay.appendChild(review);
  var reviewIdx = 0;

  document.body.appendChild(overlay);
  var prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  var track = stream.getVideoTracks()[0];
  var busy = false;

  function _updateUI() {
    var el = document.getElementById('cam-burst-count'); if (el) el.textContent = shots.length;
    counter.style.opacity = shots.length ? '1' : '.6';
    btnDone.textContent = 'Done' + (shots.length ? ' (' + shots.length + ')' : '');
    btnDone.style.opacity = shots.length ? '1' : '.45';
    btnRetake.style.opacity = shots.length ? '1' : '.4';
    btnRetake.disabled = !shots.length;
  }
  function renderStrip() {
    strip.innerHTML = '';
    shots.forEach(function(f, i) {
      var cell = document.createElement('div');
      cell.style.cssText = 'position:relative;flex:none;cursor:pointer;';
      var th = document.createElement('img'); th.src = urls[i];
      th.style.cssText = 'height:56px;width:56px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,.22);display:block;';
      var num = document.createElement('span'); num.textContent = (i + 1);
      num.style.cssText = 'position:absolute;bottom:2px;right:4px;font-size:10px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8);';
      cell.appendChild(th); cell.appendChild(num);
      cell.addEventListener('click', function() { _openReview(i); });
      strip.appendChild(cell);
    });
    strip.scrollLeft = strip.scrollWidth;
  }
  function _addShot(blob, diag) {
    var f = new File([blob], 'camera_' + Date.now() + '_' + (shots.length + 1) + '.jpg', { type: blob.type || 'image/jpeg' });
    shots.push(f); urls.push(URL.createObjectURL(blob));
    metas.push({ aShot: _camAngle(), grav: diag ? diag.grav : null, corr: diag ? diag.corr : null, vw: video.videoWidth || 0, vh: video.videoHeight || 0, src: 'cam' }); // DIAG
    renderStrip();
    flash.style.opacity = '.7';
    setTimeout(function() { flash.style.opacity = '0'; }, 90);
    _updateUI();
  }
  function _deleteAt(i) {
    if (i < 0 || i >= shots.length) return;
    try { URL.revokeObjectURL(urls[i]); } catch (e) {}
    shots.splice(i, 1); urls.splice(i, 1); metas.splice(i, 1);
    renderStrip(); _updateUI();
  }
  // review
  function _openReview(i) { reviewIdx = i; _renderReview(); review.style.display = 'flex'; }
  function _renderReview() {
    if (!shots.length) { review.style.display = 'none'; return; }
    if (reviewIdx > shots.length - 1) reviewIdx = shots.length - 1;
    if (reviewIdx < 0) reviewIdx = 0;
    rImg.src = urls[reviewIdx];
    rPos.textContent = 'Photo ' + (reviewIdx + 1) + ' of ' + shots.length;
    rPrev.disabled = reviewIdx === 0; rPrev.style.opacity = reviewIdx === 0 ? '.25' : '.9';
    rNext.disabled = reviewIdx === shots.length - 1; rNext.style.opacity = reviewIdx === shots.length - 1 ? '.25' : '.9';
    _renderDebug();
  }
  function _fmtA(a) { return (a === null || a === undefined) ? 'n/a' : (a + '\u00B0'); }
  function _rotThumb(img, deg, H) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var swap = (deg === 90 || deg === 270);
    var ow = swap ? h : w, oh = swap ? w : h;
    var s = H / oh;
    var cv = document.createElement('canvas'); // plain canvas — never OffscreenCanvas
    cv.width = Math.max(1, Math.round(ow * s)); cv.height = H;
    var c = cv.getContext('2d');
    c.translate(cv.width / 2, cv.height / 2); c.rotate(deg * Math.PI / 180);
    c.drawImage(img, -w * s / 2, -h * s / 2, w * s, h * s);
    return cv;
  }
  function _renderDebug() {
    var m = metas[reviewIdx] || {};
    rDbg.innerHTML = '';
    var head = document.createElement('div');
    head.style.cssText = 'font-family:monospace;font-size:11px;color:#a09aa8;text-align:center;margin-bottom:4px;';
    head.textContent = 'DIAG \u00B7 shot ' + _fmtA(m.aShot) + ' \u00B7 grav ' + _fmtA(m.grav) + ' \u00B7 rot ' + _fmtA(m.corr) + ' \u00B7 frame ' + (m.vw || '?') + '\u00D7' + (m.vh || '?') + (m.src === 'lib' ? ' \u00B7 library' : '');
    rDbg.appendChild(head);
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;justify-content:center;align-items:flex-start;';
    rDbg.appendChild(row);
    var img = new Image();
    img.onload = function () {
      row.innerHTML = '';
      [0, 90, 180, 270].forEach(function (deg, i) {
        var cell = document.createElement('div'); cell.style.cssText = 'text-align:center;';
        var cv = _rotThumb(img, deg, 92);
        cv.style.cssText = 'display:block;border:1px solid rgba(255,255,255,.3);border-radius:6px;';
        var lbl = document.createElement('div');
        lbl.textContent = 'ABCD'[i] + ' \u00B7 ' + deg + '\u00B0';
        lbl.style.cssText = 'font-size:11px;color:#f4f3f6;margin-top:2px;font-family:monospace;';
        cell.appendChild(cv); cell.appendChild(lbl); row.appendChild(cell);
      });
    };
    img.src = urls[reviewIdx];
  }
  rBack.addEventListener('click', function() { review.style.display = 'none'; });
  rPrev.addEventListener('click', function() { if (reviewIdx > 0) { reviewIdx--; _renderReview(); } });
  rNext.addEventListener('click', function() { if (reviewIdx < shots.length - 1) { reviewIdx++; _renderReview(); } });
  rDel.addEventListener('click', function() {
    _deleteAt(reviewIdx);
    if (!shots.length) { review.style.display = 'none'; return; }
    _renderReview();
  });
  // retake last — quick delete of the most recent shot
  btnRetake.addEventListener('click', function() { if (shots.length) _deleteAt(shots.length - 1); });

  // S341: resolution-clamped canvas grab is the primary path. ImageCapture.takePhoto()
  // ignores the getUserMedia size constraint and returns full-sensor images (12MP+)
  // on Android, which crashed the WebView; it stays retired. Plain canvas only —
  // never OffscreenCanvas (Safari/iOS). 1920px long-edge cap keeps memory bounded.
  function _grabFrame() {
    var vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    // S424 orientation fix (measured via S423 DIAG): the portrait-locked viewport
    // never rotates (screen angle always 0), so frames stay device-portrait and a
    // sideways hold saved sideways. Correction = gravity roll minus screen angle.
    // Measured on device: rotated-left → grav 90 → apply 270 (candidate D,
    // confirmed upright). No gravity reading → rotation 0 — identical to S422,
    // so nothing can regress.
    var scrA = _camAngle(); if (scrA === null) scrA = 0;
    var corr = 0;
    if (_grav !== null) {
      var delta = (((_grav - scrA) % 360) + 360) % 360;
      corr = (360 - delta) % 360;
    }
    var swap = (corr === 90 || corr === 270);
    var upW = swap ? vh : vw, upH = swap ? vw : vh;
    var mid = document.createElement('canvas'); // plain canvas — never OffscreenCanvas
    mid.width = upW; mid.height = upH;
    var mctx = mid.getContext('2d');
    if (corr !== 0) {
      mctx.translate(upW / 2, upH / 2);
      mctx.rotate(corr * Math.PI / 180);
      mctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else {
      mctx.drawImage(video, 0, 0, vw, vh);
    }
    // Crop the upright frame to its display aspect (wide → 4:3, tall → 3:4),
    // then the S341 1920px long-edge clamp.
    var TARGET = (upW >= upH) ? (4 / 3) : (3 / 4);
    var srcW = upW, srcH = upH, sx = 0, sy = 0;
    if (upW / upH > TARGET) { srcW = Math.round(upH * TARGET); sx = Math.round((upW - srcW) / 2); }
    else if (upW / upH < TARGET) { srcH = Math.round(upW / TARGET); sy = Math.round((upH - srcH) / 2); }
    var MAX = 1920;
    var scale = Math.min(1, MAX / Math.max(srcW, srcH));
    var cw = Math.round(srcW * scale), ch = Math.round(srcH * scale);
    var cv = document.createElement('canvas'); // plain canvas — never OffscreenCanvas
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    ctx.drawImage(mid, sx, sy, srcW, srcH, 0, 0, cw, ch);
    mid.width = 0; mid.height = 0;
    var diag = { grav: _grav, scr: scrA, corr: corr };
    cv.toBlob(function(b) {
      if (b) _addShot(b, diag);
      busy = false;
      cv.width = 0; cv.height = 0;
    }, 'image/jpeg', 0.9);
  }
  shutter.addEventListener('click', function() { if (busy) return; busy = true; _grabFrame(); });

  // S342: rotation "Adjusting…" handling — the Android track briefly mutes/renegotiates
  // on rotate and the <video> keeps painting the last frame; show a brief hint and nudge repaint.
  var _adjust = document.createElement('div');
  _adjust.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(11,10,13,.55);color:#f4f3f6;font-family:Calibri,sans-serif;font-size:15px;z-index:3;';
  _adjust.textContent = 'Adjusting…';
  vidWrap.appendChild(_adjust);
  var _adjustTimer = null;
  function _showAdjusting() { _adjust.style.display = 'flex'; if (_adjustTimer) clearTimeout(_adjustTimer); _adjustTimer = setTimeout(_hideAdjusting, 1200); }
  function _hideAdjusting() { _adjust.style.display = 'none'; if (_adjustTimer) { clearTimeout(_adjustTimer); _adjustTimer = null; } try { if (video.paused) video.play().catch(function(){}); } catch (e) {} }
  function _onOrient() { _updateStageAspect(); _showAdjusting(); }
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
    _disarmGravity();
    done(result);
  }
  // Escape: close the review first if it's open, otherwise cancel the camera.
  function _esc(e) { if (e.key === 'Escape') { if (review.style.display !== 'none') review.style.display = 'none'; else _close([]); } }
  document.addEventListener('keydown', _esc);
  btnCancel.addEventListener('click', function() { _close([]); });
  btnDone.addEventListener('click', function() { _close(shots.slice()); });

  renderStrip(); _updateUI();
}
