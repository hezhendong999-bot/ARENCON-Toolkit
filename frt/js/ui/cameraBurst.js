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
// is held (measured S423) — the accelerometer is the only true signal.
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
// S427: immersive fullscreen — hides the browser URL bar + Android system UI so
// the camera is seamless like iOS. Requested inside the open gesture; edge-swipe
// reveals system UI. iOS Safari only allows fullscreen on <video>, so this is a
// no-op there (harmless) — the Android TWA/browser is the target.
function _enterFullscreen() {
  try {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
      var p = req.call(el);
      if (p && p.catch) p.catch(function () {});
    }
  } catch (e) {}
}
function _exitFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (ex) { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); }
    }
  } catch (e) {}
}

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
    _enterFullscreen(); // S427 immersive — hide browser + system chrome (gesture-scoped)
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
  function _camAngle() {
    try {
      if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
      if (typeof window.orientation === 'number') return (window.orientation + 360) % 360;
    } catch (e) {}
    return null;
  }

  var overlay = document.createElement('div');
  overlay.id = 'cam-burst-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';

  // ---- preview: full-width WYSIWYG stage, chrome floats over it (S426 iOS layout) ----
  var vidWrap = document.createElement('div');
  vidWrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;';
  var stage = document.createElement('div'); // WYSIWYG capture region — width-locked, aspect follows the hold
  stage.style.cssText = 'position:relative;width:100%;max-height:100%;aspect-ratio:4/3;overflow:hidden;background:#000;';
  var video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true; video.setAttribute('playsinline', '');
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .18s ease-out;';
  video.srcObject = stream;
  stage.appendChild(video);
  var gridOverlay = document.createElement('div');
  gridOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;background-image:linear-gradient(rgba(255,255,255,.24) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.24) 1px,transparent 1px);background-size:33.333% 33.333%;background-position:center;';
  stage.appendChild(gridOverlay);
  var reticle = document.createElement('div');
  reticle.style.cssText = 'position:absolute;left:50%;top:50%;width:76px;height:76px;transform:translate(-50%,-50%);pointer-events:none;display:none;border:1.5px solid #FFCC00;border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.25);';
  var retSun = document.createElement('div');
  retSun.innerHTML = '\u2600';
  retSun.style.cssText = 'position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:5px;color:#FFCC00;font-size:16px;line-height:1;';
  reticle.appendChild(retSun);
  stage.appendChild(reticle);
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

  // ---- top cluster: ✕ · count · Library, then flash · grid ----
  var topCluster = document.createElement('div');
  topCluster.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;flex-direction:column;gap:8px;padding:calc(12px + env(safe-area-inset-top,0px)) 14px 14px;background:linear-gradient(180deg,rgba(0,0,0,.55),transparent);';
  var top = document.createElement('div');
  top.style.cssText = 'display:flex;align-items:center;gap:10px;color:#f4f3f6;';
  var btnCancel = document.createElement('button');
  btnCancel.id = 'cam-burst-cancel'; btnCancel.setAttribute('aria-label', 'Cancel'); btnCancel.innerHTML = '&#10005;';
  btnCancel.style.cssText = 'flex:none;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.16);color:#f4f3f6;font-size:18px;line-height:1;cursor:pointer;';
  var counter = document.createElement('div');
  counter.style.cssText = 'flex:1;display:flex;justify-content:center;';
  counter.innerHTML = '<span style="display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:99px;background:rgba(20,19,24,.5);border:1px solid rgba(255,255,255,.16);font-size:13.5px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)"><b id="cam-burst-count" style="color:#46C5E8;font-size:15px">0</b><span style="color:#c9c6cf">photos this round</span></span>';
  var btnLib = document.createElement('button');
  btnLib.id = 'cam-burst-library'; btnLib.innerHTML = '<span style="font-size:15px">\uD83D\uDDBC</span> Library';
  btnLib.style.cssText = 'flex:none;display:inline-flex;align-items:center;gap:6px;height:40px;background:rgba(255,255,255,.11);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:99px;padding:0 14px;font-size:13.5px;font-weight:600;font-family:Calibri,sans-serif;cursor:pointer;';
  top.appendChild(btnCancel); top.appendChild(counter); top.appendChild(btnLib);
  var tools = document.createElement('div');
  tools.style.cssText = 'display:flex;gap:9px;align-items:center;';
  var btnFlash = document.createElement('button');
  btnFlash.style.cssText = 'display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:99px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.16);color:#f4f3f6;font-size:12.5px;font-weight:700;font-family:Calibri,sans-serif;cursor:pointer;';
  btnFlash.innerHTML = '<span style="font-size:14px;line-height:1">\u26A1</span><span id="cam-flash-lab">AUTO</span>';
  var flashLab = btnFlash.querySelector('#cam-flash-lab');
  var btnGrid = document.createElement('button');
  btnGrid.style.cssText = 'display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:99px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.16);color:#f4f3f6;font-size:12.5px;font-weight:700;font-family:Calibri,sans-serif;cursor:pointer;';
  btnGrid.innerHTML = '<span style="font-size:13px;line-height:1">\u25A6</span> Grid';
  tools.appendChild(btnFlash); tools.appendChild(btnGrid);
  topCluster.appendChild(top); topCluster.appendChild(tools);
  overlay.appendChild(topCluster);

  // ---- bottom cluster: zoom pills · thumbnail strip · Retake · shutter · Done ----
  var bottomCluster = document.createElement('div');
  bottomCluster.style.cssText = 'position:absolute;bottom:0;left:0;right:0;display:flex;flex-direction:column;background:linear-gradient(0deg,rgba(0,0,0,.6),transparent);';
  var zoomPills = document.createElement('div');
  zoomPills.style.cssText = 'display:flex;justify-content:center;gap:7px;padding:6px 0 8px;';
  ['1', '2', '5'].forEach(function (z) {
    var p = document.createElement('button'); p.dataset.z = z; p.textContent = (z === '1' ? '1\u00D7' : z);
    p.style.cssText = 'min-width:40px;height:38px;padding:0 8px;border-radius:99px;background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.16);color:#c9c6cf;font-size:13px;font-weight:800;font-family:Calibri,sans-serif;font-variant-numeric:tabular-nums;cursor:pointer;';
    zoomPills.appendChild(p);
  });
  var strip = document.createElement('div');
  strip.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding:2px 14px 8px;min-height:0;';
  var bar = document.createElement('div');
  bar.style.cssText = 'display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:8px 18px calc(14px + env(safe-area-inset-bottom,0px));';
  var btnRetake = document.createElement('button');
  btnRetake.id = 'cam-burst-retake';
  btnRetake.innerHTML = '<span style="font-size:16px;line-height:1">\u21BA</span> Retake';
  btnRetake.style.cssText = 'justify-self:start;display:inline-flex;align-items:center;gap:7px;height:48px;padding:0 18px;border-radius:24px;background:rgba(255,255,255,.14);border:0;color:#fff;font-size:14.5px;font-weight:700;font-family:Calibri,sans-serif;cursor:pointer;';
  var shutter = document.createElement('button');
  shutter.id = 'cam-burst-shutter'; shutter.setAttribute('aria-label', 'Take photo');
  shutter.style.cssText = 'justify-self:center;width:74px;height:74px;border-radius:50%;background:transparent;border:4px solid #fff;padding:5px;cursor:pointer;flex:none;';
  var shutterCore = document.createElement('span');
  shutterCore.style.cssText = 'display:block;width:100%;height:100%;border-radius:50%;background:#fff;';
  shutter.appendChild(shutterCore);
  var btnDone = document.createElement('button');
  btnDone.id = 'cam-burst-done'; btnDone.textContent = 'Done';
  btnDone.style.cssText = 'justify-self:end;display:inline-flex;align-items:center;justify-content:center;height:48px;min-width:96px;padding:0 20px;border-radius:24px;background:#20463a;border:0;color:#9ff0c4;font-size:15px;font-weight:700;font-family:Calibri,sans-serif;cursor:pointer;opacity:.5;';
  bar.appendChild(btnRetake); bar.appendChild(shutter); bar.appendChild(btnDone);
  bottomCluster.appendChild(zoomPills); bottomCluster.appendChild(strip); bottomCluster.appendChild(bar);
  overlay.appendChild(bottomCluster);

  // S332: Library — existing photos merge into shots[] and flow out the identical
  // Done path (ported from Diesel S333).
  var libInput = document.createElement('input');
  libInput.type = 'file'; libInput.accept = 'image/*'; libInput.multiple = true; libInput.style.display = 'none';
  overlay.appendChild(libInput);
  btnLib.addEventListener('click', function(){ libInput.value = ''; libInput.click(); });
  libInput.addEventListener('change', function(){
    var fs = Array.prototype.slice.call(libInput.files || []);
    fs.forEach(function(file){ shots.push(file); urls.push(URL.createObjectURL(file)); });
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

  // ══ S426 native controls: flash · zoom · focus · grid ══════════════════
  // Hardware paths (torch/zoom/focus) come from MediaStreamTrack capabilities —
  // present on Android Chrome/WebView (the TWA target), absent on iOS Safari.
  // Capability-gated: a control is inert (not broken) where the device lacks it.
  var caps = {};
  try { caps = (track && track.getCapabilities) ? track.getCapabilities() : {}; } catch (e) { caps = {}; }
  var hasTorch = !!(caps && caps.torch);
  var hasHwZoom = !!(caps && caps.zoom && typeof caps.zoom.max === 'number');

  // flash / torch — auto → on → off
  var flashMode = 'auto';
  function _applyFlash() {
    if (flashLab) flashLab.textContent = flashMode.toUpperCase();
    btnFlash.style.color = flashMode === 'on' ? '#FFCC00' : (flashMode === 'off' ? '#6b6674' : '#f4f3f6');
    btnFlash.style.borderColor = flashMode === 'on' ? 'rgba(255,204,0,.5)' : 'rgba(255,255,255,.16)';
    if (hasTorch && track) { try { track.applyConstraints({ advanced: [{ torch: flashMode === 'on' }] }); } catch (e) {} }
  }
  btnFlash.addEventListener('click', function () {
    flashMode = flashMode === 'auto' ? 'on' : (flashMode === 'on' ? 'off' : 'auto');
    _applyFlash();
  });
  _applyFlash();

  // 3×3 grid
  var gridOn = false;
  btnGrid.addEventListener('click', function () {
    gridOn = !gridOn;
    gridOverlay.style.display = gridOn ? 'block' : 'none';
    btnGrid.style.color = gridOn ? '#FFCC00' : '#f4f3f6';
    btnGrid.style.borderColor = gridOn ? 'rgba(255,204,0,.5)' : 'rgba(255,255,255,.16)';
  });

  // zoom — hardware where available (affects capture), digital preview fallback otherwise
  var zoom = 1;
  var zMin = hasHwZoom ? caps.zoom.min : 1;
  var zMax = hasHwZoom ? caps.zoom.max : 5;
  var _zoomRaf = 0, _zoomPending = false;
  function _applyZoom() {
    zoom = Math.max(1, Math.min(5, zoom));
    Array.prototype.forEach.call(zoomPills.children, function (p) {
      var on = Math.round(zoom) === +p.dataset.z;
      p.style.background = on ? 'rgba(0,0,0,.62)' : 'rgba(0,0,0,.42)';
      p.style.color = on ? '#FFCC00' : '#c9c6cf';
    });
    if (hasHwZoom && track) {
      video.style.transform = 'none';
      if (!_zoomPending) {               // S427: coalesce hardware zoom to 1/frame — pinch was flooding applyConstraints (lag)
        _zoomPending = true;
        _zoomRaf = requestAnimationFrame(function () {
          _zoomPending = false;
          var hz = zMin + (zoom - 1) * (zMax - zMin) / 4;
          hz = Math.min(zMax, Math.max(zMin, hz));
          try { track.applyConstraints({ advanced: [{ zoom: hz }] }); } catch (e) {}
        });
      }
    } else {
      video.style.transform = 'scale(' + zoom + ')';
    }
  }
  Array.prototype.forEach.call(zoomPills.children, function (p) {
    p.addEventListener('click', function () { zoom = +p.dataset.z; _applyZoom(); });
  });
  _applyZoom();

  // pinch-to-zoom (two-finger) + tap-to-focus (single finger) on the stage
  var _pinchBase = 0, _pinchZoom = 1, _tap = null;
  function _tdist(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) { _pinchBase = _tdist(e.touches); _pinchZoom = zoom; _tap = null; }
    else if (e.touches.length === 1) { var t = e.touches[0]; _tap = { x: t.clientX, y: t.clientY, at: Date.now(), moved: false }; }
  }, { passive: true });
  stage.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && _pinchBase) { zoom = _pinchZoom * (_tdist(e.touches) / _pinchBase); _applyZoom(); }
    else if (_tap) { _tap.moved = true; }
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (_pinchBase && e.touches.length < 2) _pinchBase = 0;
    if (_tap && !_tap.moved && (Date.now() - _tap.at) < 300) _focusAt(_tap.x, _tap.y);
    _tap = null;
  }, { passive: true });
  function _focusAt(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    reticle.style.left = (clientX - r.left) + 'px';
    reticle.style.top = (clientY - r.top) + 'px';
    reticle.style.display = 'block';
    reticle.style.transition = 'none';
    reticle.style.transform = 'translate(-50%,-50%) scale(1.4)';
    void reticle.offsetWidth;
    reticle.style.transition = 'transform .34s ease-out';
    reticle.style.transform = 'translate(-50%,-50%) scale(1)';
    if (track && caps && (caps.focusMode || caps.pointsOfInterest)) {
      try {
        var con = {};
        if (caps.pointsOfInterest) con.pointsOfInterest = [{ x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height }];
        if (caps.focusMode && caps.focusMode.indexOf && caps.focusMode.indexOf('single-shot') >= 0) con.focusMode = 'single-shot';
        track.applyConstraints({ advanced: [con] });
      } catch (e) {}
    }
    clearTimeout(reticle._h); reticle._h = setTimeout(function () { reticle.style.display = 'none'; }, 1100);
  }
  // ═══════════════════════════════════════════════════════════════════════

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
  function _addShot(blob) {
    var f = new File([blob], 'camera_' + Date.now() + '_' + (shots.length + 1) + '.jpg', { type: blob.type || 'image/jpeg' });
    shots.push(f); urls.push(URL.createObjectURL(blob));
    renderStrip();
    flash.style.opacity = '.7';
    setTimeout(function() { flash.style.opacity = '0'; }, 90);
    _updateUI();
  }
  function _deleteAt(i) {
    if (i < 0 || i >= shots.length) return;
    try { URL.revokeObjectURL(urls[i]); } catch (e) {}
    shots.splice(i, 1); urls.splice(i, 1);
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
    // S424 orientation fix (measured S423): the portrait-locked viewport
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
    cv.toBlob(function(b) {
      if (b) _addShot(b);
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
    _exitFullscreen();
    if (_zoomRaf) { try { cancelAnimationFrame(_zoomRaf); } catch (e) {} }
    done(result);
  }
  // Escape: close the review first if it's open, otherwise cancel the camera.
  function _esc(e) { if (e.key === 'Escape') { if (review.style.display !== 'none') review.style.display = 'none'; else _close([]); } }
  document.addEventListener('keydown', _esc);
  btnCancel.addEventListener('click', function() { _close([]); });
  btnDone.addEventListener('click', function() { _close(shots.slice()); });

  renderStrip(); _updateUI();
}
