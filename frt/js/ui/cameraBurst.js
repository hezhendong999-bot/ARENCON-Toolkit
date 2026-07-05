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
    // S437: the installed app (TWA/standalone/fullscreen display-mode) already has
    // no browser chrome — requesting fullscreen there does nothing except trigger
    // Chrome's mandatory "swipe down to exit" toast. Skip it; browser tabs keep it.
    if ((window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone) return;
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
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } }, // 4:3 to match native/report framing (was 16:9 1080)
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

  // ═══ S428 Android-style layout: top bar (icon-only, outside feed) / raw feed / bottom controls ═══
  var overlay = document.createElement('div');
  overlay.id = 'cam-burst-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;font-family:Calibri,sans-serif;color:#fff;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;';

  // ---- top bar ----
  var topbar = document.createElement('div');
  topbar.style.cssText = 'flex:none;display:flex;align-items:center;gap:14px;padding:calc(10px + env(safe-area-inset-top,0px)) 18px 10px;background:#000;';
  function _ib(svg, label) {
    var b = document.createElement('button'); b.innerHTML = svg; if (label) b.setAttribute('aria-label', label);
    b.style.cssText = 'width:32px;height:32px;flex:none;display:flex;align-items:center;justify-content:center;background:none;border:0;color:#fff;position:relative;cursor:pointer;';
    return b;
  }
  var btnCancel = _ib('<span style="font-size:20px;line-height:1">&#10005;</span>', 'Cancel'); btnCancel.id = 'cam-burst-cancel';
  var sp = document.createElement('div'); sp.style.flex = '1';
  var btnFlash = _ib('<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>', 'flash');
  var flashSlash = document.createElement('span');
  flashSlash.style.cssText = 'position:absolute;left:50%;top:50%;width:26px;height:2px;background:#fff;transform:translate(-50%,-50%) rotate(45deg);border-radius:2px;box-shadow:0 0 0 1.5px rgba(0,0,0,.55);display:block;';
  btnFlash.appendChild(flashSlash);
  var torchIcon = document.createElement('span'); // S433: TORCH-state glyph
  torchIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 2h10v3l-3 4v13h-4V9L7 5z"/><path d="M12 12v3"/></svg>';
  torchIcon.style.cssText = 'display:none;line-height:0;pointer-events:none;';
  btnFlash.appendChild(torchIcon);
  var btnNight = _ib('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>', 'night');
  var btnGrid = _ib('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>', 'grid');
  var btnFloat = _ib('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>', 'floating shutter');
  var btnFlip = _ib('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 14.5-7.1"/><path d="M20 3v5h-5"/><path d="M21 12a9 9 0 0 1-14.5 7.1"/><path d="M4 21v-5h5"/><circle cx="12" cy="12" r="2.4"/></svg>', 'switch camera');
  topbar.appendChild(btnCancel); topbar.appendChild(sp);
  topbar.appendChild(btnFlash); topbar.appendChild(btnNight); topbar.appendChild(btnGrid); topbar.appendChild(btnFloat); topbar.appendChild(btnFlip);
  overlay.appendChild(topbar);

  // ---- feed (raw, no forced aspect box) ----
  var vidWrap = document.createElement('div');
  vidWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;background:#0a0a0c;';
  var video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true; video.setAttribute('playsinline', '');
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .16s ease-out,filter .2s;';
  video.srcObject = stream;
  vidWrap.appendChild(video);
  function _updateStageAspect() {} // no-op: raw feed has no forced aspect; kept for _onOrient
  var flash = document.createElement('div'); // capture blink (used by _addShot)
  flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .12s;';
  vidWrap.appendChild(flash);
  var gridOverlay = document.createElement('div');
  gridOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;background-image:linear-gradient(rgba(255,255,255,.24) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.24) 1px,transparent 1px);background-size:33.333% 33.333%;background-position:center;';
  vidWrap.appendChild(gridOverlay);
  // focus reticle + exposure slider
  var reticle = document.createElement('div');
  reticle.style.cssText = 'position:absolute;width:76px;height:76px;margin:-38px 0 0 -38px;pointer-events:none;display:none;z-index:4;border:1.5px solid #FFB020;border-radius:8px;box-shadow:0 0 0 1px rgba(0,0,0,.3);';
  var retLock = document.createElement('div');
  retLock.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#FFB020" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  retLock.style.cssText = 'position:absolute;top:-20px;left:50%;transform:translateX(-50%);';
  reticle.appendChild(retLock);
  var expo = document.createElement('div');
  expo.style.cssText = 'position:absolute;left:100%;top:50%;margin:-56px 0 0 8px;width:30px;height:112px;pointer-events:auto;display:flex;flex-direction:column;align-items:center;';
  var expoTrack = document.createElement('div'); expoTrack.style.cssText = 'position:relative;flex:1;width:2px;background:rgba(255,255,255,.45);';
  var expoSun = document.createElement('div');
  expoSun.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="#FFB020"><circle cx="12" cy="12" r="4"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" stroke="#FFB020" stroke-width="2"/></svg>';
  expoSun.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);';
  expoTrack.appendChild(expoSun); expo.appendChild(expoTrack); reticle.appendChild(expo);
  vidWrap.appendChild(reticle);

  // ---- bottom controls (overlay feed) ----
  var controls = document.createElement('div');
  controls.style.cssText = 'position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,.35) 60%,transparent);';
  var zoomBar = document.createElement('div');
  zoomBar.style.cssText = 'display:flex;justify-content:center;gap:6px;padding:8px 0;';
  var zoomPills = [];
  ['0.6', '1', '2', '5'].forEach(function(z) {
    var b = document.createElement('button'); b.dataset.z = z; b.textContent = (z === '0.6' ? '.6' : (z === '1' ? '1\u00D7' : z));
    b.style.cssText = 'min-width:38px;height:36px;padding:0 8px;border-radius:99px;background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.16);color:#c9c6cf;font-size:12.5px;font-weight:800;font-family:Calibri,sans-serif;font-variant-numeric:tabular-nums;cursor:pointer;';
    zoomBar.appendChild(b); zoomPills.push(b);
  });
  controls.appendChild(zoomBar);
  var bottom = document.createElement('div');
  bottom.style.cssText = 'display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding:4px 26px calc(14px + env(safe-area-inset-bottom,0px));';
  var chip = document.createElement('button'); chip.id = 'cam-burst-chip';
  chip.style.cssText = 'justify-self:start;width:52px;height:52px;border-radius:50%;overflow:hidden;border:2px dashed rgba(255,255,255,.3);background:#111;position:relative;padding:0;cursor:pointer;';
  var shutter = document.createElement('button'); shutter.id = 'cam-burst-shutter'; shutter.setAttribute('aria-label', 'Take photo');
  shutter.style.cssText = 'justify-self:center;width:74px;height:74px;border-radius:50%;background:transparent;border:4px solid #fff;padding:5px;cursor:pointer;';
  var shutCore = document.createElement('span'); shutCore.style.cssText = 'display:block;width:100%;height:100%;border-radius:50%;background:#fff;'; shutter.appendChild(shutCore);
  var btnDone = document.createElement('button'); btnDone.id = 'cam-burst-done';
  btnDone.style.cssText = 'justify-self:end;display:none;align-items:center;justify-content:center;height:48px;min-width:92px;padding:0 18px;border-radius:24px;background:#20463a;border:0;color:#9ff0c4;font-size:15px;font-weight:700;font-family:Calibri,sans-serif;cursor:pointer;';
  btnDone.textContent = 'Done (0)';
  bottom.appendChild(chip); bottom.appendChild(shutter); bottom.appendChild(btnDone);
  controls.appendChild(bottom);
  vidWrap.appendChild(controls);
  overlay.appendChild(vidWrap);

  // ---- floating draggable shutter ----
  var floater = document.createElement('div');
  floater.style.cssText = 'position:absolute;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.92);border:3px solid rgba(255,255,255,.5);display:none;z-index:6;touch-action:none;box-shadow:0 4px 16px rgba(0,0,0,.4);';
  var floatDel = document.createElement('div');
  floatDel.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" style="pointer-events:none;display:block"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  floatDel.style.cssText = 'position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;background:#ff3b30;display:none;align-items:center;justify-content:center;border:2px solid #fff;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;cursor:pointer;';
  floater.appendChild(floatDel);
  overlay.appendChild(floater);

  // ---- review overlay (verbatim behavior) ----
  var review = document.createElement('div');
  review.style.cssText = 'position:absolute;inset:0;z-index:20;background:#08070a;display:none;flex-direction:column;';
  var rTop = document.createElement('div');
  rTop.style.cssText = 'flex:none;position:relative;display:flex;align-items:center;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 10px;';
  var rBack = document.createElement('button');
  rBack.innerHTML = '<span style="font-size:20px;line-height:1;margin-right:6px">&#8249;</span>Camera';
  rBack.style.cssText = 'position:relative;z-index:2;display:flex;align-items:center;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.34);color:#fff;font-size:15px;font-weight:700;font-family:Calibri,sans-serif;padding:9px 16px;border-radius:99px;cursor:pointer;';
  var rPos = document.createElement('div');
  rPos.style.cssText = 'position:absolute;left:0;right:0;text-align:center;pointer-events:none;font-size:15px;color:#a09aa8;';
  var rVer = document.createElement('div'); // build tag — one-glance confirmation of the running build
  rVer.textContent = 'v437';
  rVer.style.cssText = 'position:relative;z-index:2;margin-left:auto;font-size:10px;color:rgba(255,255,255,.35);pointer-events:none;font-variant-numeric:tabular-nums;';
  rTop.appendChild(rBack); rTop.appendChild(rVer); rTop.appendChild(rPos); review.appendChild(rTop);
  var rImgWrap = document.createElement('div');
  rImgWrap.style.cssText = 'flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:8px;';
  var rImg = document.createElement('img');
  rImg.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;touch-action:none;-webkit-user-drag:none;';
  rImg.draggable = false; // S437: touches start ON the img — without its own gesture lock the browser hijacks the pinch (the frozen-zoom cause)
  rImgWrap.appendChild(rImg); review.appendChild(rImgWrap);
  // S436: pinch-zoom / pan / double-tap on the review photo
  var _rvS = 1, _rvX = 0, _rvY = 0;
  function _rvApply() { rImg.style.transform = (_rvS === 1 && !_rvX && !_rvY) ? 'none' : ('translate(' + _rvX + 'px,' + _rvY + 'px) scale(' + _rvS + ')'); }
  function _rvClampPan() {
    var r = rImgWrap.getBoundingClientRect();
    var mx = r.width * (_rvS - 1) / 2, my = r.height * (_rvS - 1) / 2;
    if (_rvX > mx) _rvX = mx; if (_rvX < -mx) _rvX = -mx;
    if (_rvY > my) _rvY = my; if (_rvY < -my) _rvY = -my;
  }
  function _rvReset() { _rvS = 1; _rvX = 0; _rvY = 0; _rvApply(); }
  // S437: zoom rebuilt on Pointer Events with pointer capture — touch events
  // proved unreliable through this overlay stack on Android Chrome ("frozen").
  // Pinch = 2 pointers · pan while zoomed = 1 pointer · double-tap toggles 2.5x.
  (function () {
    var pts = {}, n = 0, d0 = 0, s0 = 1, px = 0, py = 0, lastTap = 0;
    function arr() { var a = []; for (var k in pts) a.push(pts[k]); return a; }
    function dist(a) { var dx = a[0].x - a[1].x, dy = a[0].y - a[1].y; return Math.sqrt(dx * dx + dy * dy) || 1; }
    rImgWrap.style.touchAction = 'none';
    rImgWrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    rImgWrap.addEventListener('pointerdown', function (e) {
      try { rImgWrap.setPointerCapture(e.pointerId); } catch (err) {}
      pts[e.pointerId] = { x: e.clientX, y: e.clientY }; n++;
      if (n === 2) { d0 = dist(arr()); s0 = _rvS; }
      else if (n === 1) {
        var now = Date.now();
        if (now - lastTap < 300) { if (_rvS > 1.05) { _rvReset(); } else { _rvS = 2.5; _rvClampPan(); _rvApply(); } lastTap = 0; }
        else { lastTap = now; }
        px = e.clientX; py = e.clientY;
      }
    });
    rImgWrap.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (n >= 2 && d0) { _rvS = Math.max(1, Math.min(5, s0 * (dist(arr()) / d0))); _rvClampPan(); _rvApply(); }
      else if (n === 1 && _rvS > 1) { _rvX += e.clientX - px; _rvY += e.clientY - py; px = e.clientX; py = e.clientY; _rvClampPan(); _rvApply(); }
    });
    function up(e) {
      if (pts[e.pointerId]) { delete pts[e.pointerId]; n = n > 0 ? n - 1 : 0; }
      if (n < 2) d0 = 0;
      if (n === 1) { var a = arr(); px = a[0].x; py = a[0].y; }
      if (n === 0 && _rvS <= 1.02) _rvReset();
    }
    rImgWrap.addEventListener('pointerup', up);
    rImgWrap.addEventListener('pointercancel', up);
  })();
  var rBar = document.createElement('div');
  rBar.style.cssText = 'flex:none;display:flex;align-items:center;justify-content:space-between;padding:10px 28px calc(20px + env(safe-area-inset-bottom,0px));';
  var rPrev = document.createElement('button'); rPrev.innerHTML = '&#8249;';
  rPrev.style.cssText = 'width:56px;min-height:52px;background:none;border:0;color:#fff;font-size:30px;cursor:pointer;';
  var rDel = document.createElement('button'); rDel.innerHTML = '&#128465; Delete';
  rDel.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(226,96,118,.16);border:1px solid rgba(226,96,118,.5);color:#E26076;font-size:16px;font-weight:700;font-family:Calibri,sans-serif;padding:12px 22px;border-radius:12px;cursor:pointer;';
  var rNext = document.createElement('button'); rNext.innerHTML = '&#8250;';
  rNext.style.cssText = 'width:56px;min-height:52px;background:none;border:0;color:#fff;font-size:30px;cursor:pointer;';
  rBar.appendChild(rPrev); rBar.appendChild(rDel); rBar.appendChild(rNext);
  var rStrip = document.createElement('div'); // S429: all-photos strip — tap any thumb to jump
  rStrip.style.cssText = 'flex:none;display:flex;gap:8px;overflow-x:auto;padding:8px 12px;background:rgba(255,255,255,.04);';
  review.appendChild(rStrip);
  review.appendChild(rBar);
  overlay.appendChild(review);
  var reviewIdx = 0;

  document.body.appendChild(overlay);
  var prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  var track = stream.getVideoTracks()[0];
  var busy = false;

  // ══ S428 native controls: flash · zoom · night · grid · focus · flip · floating shutter ══
  var caps = {};
  try { caps = (track && track.getCapabilities) ? track.getCapabilities() : {}; } catch (e) { caps = {}; }
  var hasTorch = !!(caps && caps.torch);
  var hasHwZoom = !!(caps && caps.zoom && typeof caps.zoom.max === 'number');
  var facing = 'environment';


  // flash — OFF/ON honest torch (S429). Web can't auto-meter, so no AUTO.
  // Torch is attempted regardless of reported caps: getCapabilities() is often
  // empty until the track settles, so caps alone under-reports support.
  var flashMode = 'off';
  // S431 (measured S430): the default 'environment' pick (camera 2) has NO torch on
  // this device; the torch lives on another back lens (camera 0, the main). On
  // flash-ON with a torchless track we hunt the back lenses for the one with a
  // torch and bind to it. Cached per session; flip-to-back prefers it.
  var _torchDevId = null, _torchHopeless = false, _torchBusy = false;
  function _recap() {
    try { caps = (track && track.getCapabilities) ? track.getCapabilities() : {}; } catch (e) { caps = {}; }
    hasTorch = !!(caps && caps.torch);
    hasHwZoom = !!(caps && caps.zoom && typeof caps.zoom.max === 'number');
  }
  setTimeout(_recap, 800);
  // S433: three flash states — 'off' (slashed bolt), 'flash' (amber bolt,
  // torch fires only ~320ms around the grab), 'torch' (amber flashlight,
  // continuous work light).
  function _setTorch(on, cb) {
    if (!track) { if (cb) cb(); return; }
    try {
      var p = track.applyConstraints({ advanced: [{ torch: !!on }] });
      if (p && p.then) { p.then(function () { if (cb) cb(); }, function () { if (cb) cb(); }); return; }
    } catch (e) {}
    if (cb) cb();
  }
  function _applyFlash() {
    var bolt = btnFlash.querySelector('svg'); // first svg = bolt
    if (bolt) bolt.style.display = (flashMode === 'torch') ? 'none' : 'block';
    torchIcon.style.display = (flashMode === 'torch') ? 'block' : 'none';
    btnFlash.style.color = (flashMode === 'off') ? '#fff' : '#FFCC00';
    flashSlash.style.display = (flashMode === 'off') ? 'block' : 'none';
    _setTorch(flashMode === 'torch');
  }
  function _acquireTorchTrack(cb) {
    if (_torchBusy) return; _torchBusy = true;
    var trace = []; // S432: per-lens trace — shown in DIAG on failure
    navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var cams = ds.filter(function (d) { return d.kind === 'videoinput'; });
      var curId = null; try { curId = track.getSettings ? track.getSettings().deviceId : null; } catch (e) {}
      var backs = cams.filter(function (d) { return /back|rear|environment/i.test(d.label || '') && d.deviceId !== curId; });
      if (!backs.length) backs = cams.filter(function (d) { return d.deviceId !== curId; });
      // stop the current stream first — Android cameras are exclusive
      try { if (track && track.removeEventListener) { track.removeEventListener('mute', _showAdjusting); track.removeEventListener('unmute', _hideAdjusting); } } catch (e) {}
      try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      var i = 0;
      function tryNext() {
        if (i >= backs.length) {
          _torchHopeless = true; _torchBusy = false;
          navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 4096 }, height: { ideal: 3072 }, facingMode: facing }, audio: false })
            .then(function (s) { _attachStream(s, facing); cb(false, trace); })
            .catch(function () { cb(false, trace); });
          return;
        }
        var dev = backs[i++], id = dev.deviceId, lbl = (dev.label || id.slice(0, 6));
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 4096 }, height: { ideal: 3072 }, deviceId: { exact: id } }, audio: false })
          .then(function (s) {
            var t = s.getVideoTracks()[0];
            // S432: wait for the track to settle — caps are empty when read
            // immediately (measured S430/S431 failure cause), then PROVE torch by
            // applying it: a resolved applyConstraints is the ground truth.
            setTimeout(function () {
              var c = {}; try { c = t.getCapabilities ? t.getCapabilities() : {}; } catch (e) {}
              var proven = false;
              var settle = function (ok, err) {
                trace.push(lbl + ': caps.torch=' + String(c && c.torch) + ' apply=' + (ok ? 'OK' : ('REJ ' + (err && err.name || ''))));
                if (ok) { _torchDevId = id; _attachStream(s, 'environment'); _torchBusy = false; cb(true, trace); }
                else { try { s.getTracks().forEach(function (x) { x.stop(); }); } catch (e) {} tryNext(); }
              };
              try {
                var p = t.applyConstraints({ advanced: [{ torch: true }] });
                if (p && p.then) { p.then(function () { settle(true); }, function (err) { settle(false, err); }); }
                else settle(!!(c && c.torch));
              } catch (e) { settle(false, e); }
            }, 650);
          })
          .catch(function (err) { trace.push(lbl + ': gUM ' + (err && err.name || 'fail')); tryNext(); });
      }
      tryNext();
    }).catch(function () { _torchBusy = false; cb(false, trace); });
  }
  btnFlash.addEventListener('click', function () {
    _recap();
    flashMode = flashMode === 'off' ? 'flash' : (flashMode === 'flash' ? 'torch' : 'off');
    _applyFlash();
    if ((flashMode === 'flash' || flashMode === 'torch') && !hasTorch && !_torchHopeless) {
      var want = flashMode; // _attachStream resets to 'off'; restore the chosen state
      _acquireTorchTrack(function (ok, trace) {
        if (ok) { flashMode = want; _applyFlash(); }
        // hunt failed: no torch-capable lens exposed — flash states stay honest no-ops
      });
    }
  });
  _applyFlash();

  // night — brightness boost (browser can't do true computational night)
  var night = false;
  function _applyFilter(ev) {
    var b = 1 + (typeof ev === 'number' ? ev * 0.6 : 0) + (night ? 0.5 : 0);
    video.style.filter = (b === 1 ? 'none' : 'brightness(' + b + ') contrast(1.03)');
  }
  btnNight.addEventListener('click', function () { night = !night; btnNight.style.color = night ? '#FFCC00' : '#fff'; _applyFilter(); });

  // grid
  var gridOn = false;
  btnGrid.addEventListener('click', function () { gridOn = !gridOn; gridOverlay.style.display = gridOn ? 'block' : 'none'; btnGrid.style.color = gridOn ? '#FFCC00' : '#fff'; });

  // zoom — hardware where available (0.6–5), digital preview fallback; rAF-throttled
  var zoom = 1, _zoomRaf = 0, _zoomPending = false;
  function _mirror() { return facing === 'user' ? ' scaleX(-1)' : ''; }
  function applyZoom() {
    var lo = hasHwZoom ? Math.min(0.6, caps.zoom.min) : 1;
    zoom = Math.max(lo, Math.min(5, zoom));
    zoomPills.forEach(function (b) { var on = Math.abs(zoom - (+b.dataset.z)) < 0.06; b.style.background = on ? 'rgba(0,0,0,.62)' : 'rgba(0,0,0,.42)'; b.style.color = on ? '#FFCC00' : '#c9c6cf'; });
    if (hasHwZoom && track) {
      video.style.transform = 'none' + _mirror();
      if (!_zoomPending) { _zoomPending = true; _zoomRaf = requestAnimationFrame(function () { _zoomPending = false; var hz = Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoom)); try { var zp = track.applyConstraints({ advanced: [{ zoom: hz }] }); var reassert = function () { if (flashMode === 'torch') { try { var tp = track.applyConstraints({ advanced: [{ torch: true }] }); if (tp && tp.catch) tp.catch(function () {}); } catch (e) {} } }; if (zp && zp.then) zp.then(reassert, reassert); else reassert(); } catch (e) {} }); }
    } else { video.style.transform = 'scale(' + Math.max(1, zoom) + ')' + _mirror(); }
  }
  zoomPills.forEach(function (b) { b.addEventListener('click', function () { zoom = +b.dataset.z; applyZoom(); }); });
  applyZoom();
  setTimeout(function () { _resGuard(); }, 0); // opener stream guarded too (hoisted fn)

  // flip front/back — S429 rebuild. Android holds the camera exclusively, so the
  // old stream must be STOPPED before requesting the other lens (the silent-fail
  // cause). Fallback chain: exact facing -> plain facing -> recover original.
  var _flipping = false;
  function _attachStream(s, newFacing) {
    facing = newFacing; stream = s; video.srcObject = s; track = s.getVideoTracks()[0];
    _recap();
    try { if (track && track.addEventListener) { track.addEventListener('mute', _showAdjusting); track.addEventListener('unmute', _hideAdjusting); } } catch (e) {}
    video.style.transform = _mirror(); flashMode = 'off'; _applyFlash(); zoom = 1; applyZoom();
    setTimeout(_recap, 800);
    _resGuard(); // S436: permanent — no stream is ever allowed to run low-res
    _flipping = false;
  }
  // S436 (permanent, from S434/S435 measurement): some devices ignore the gUM
  // resolution request on deviceId-bound lenses. Verify the RUNNING track at two
  // intervals and force 1920x1440 onto it whenever it reports low. Never 640x480.
  function _resGuard() {
    function check() {
      var w = 0; try { w = (track.getSettings && track.getSettings().width) || video.videoWidth || 0; } catch (e) { w = video.videoWidth || 0; }
      if (w && w < 2000 && track) {
        try {
          var p = track.applyConstraints({ width: { ideal: 4096 }, height: { ideal: 3072 } });
          if (p && p.catch) p.catch(function () {});
        } catch (e) {}
      }
    }
    setTimeout(check, 700);
    setTimeout(check, 1800);
  }
  function flip() {
    if (_flipping) return; _flipping = true;
    var next = facing === 'environment' ? 'user' : 'environment';
    try { if (track && track.removeEventListener) { track.removeEventListener('mute', _showAdjusting); track.removeEventListener('unmute', _hideAdjusting); } } catch (e) {}
    try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    var _req = (next === 'environment' && _torchDevId)
      ? navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 4096 }, height: { ideal: 3072 }, deviceId: { exact: _torchDevId } }, audio: false })
      : navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 4096 }, height: { ideal: 3072 }, facingMode: { exact: next } }, audio: false });
    _req
      .then(function (s) { _attachStream(s, next); })
      .catch(function () {
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 4096 }, height: { ideal: 3072 }, facingMode: next }, audio: false })
          .then(function (s) { _attachStream(s, next); })
          .catch(function () { // recover the original lens so the camera never dies
            navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 4096 }, height: { ideal: 3072 }, facingMode: facing }, audio: false })
              .then(function (s) { _attachStream(s, facing); })
              .catch(function () { _flipping = false; });
          });
      });
  }
  btnFlip.addEventListener('click', flip);
  btnFloat.addEventListener('click', function () {
    var on = floater.style.display === 'none';
    floater.style.display = on ? 'block' : 'none'; btnFloat.style.color = on ? '#FFCC00' : '#fff';
    if (on && !floater._placed) { floater.style.right = '24px'; floater.style.bottom = '190px'; floater._placed = true; }
  });

  // ---- capture ----
  function _updateUI() {
    var n = shots.length;
    btnDone.style.display = n ? 'inline-flex' : 'none';
    btnDone.textContent = 'Done (' + n + ')';
  }
  function renderStrip() { // last-shot chip
    if (!shots.length) { chip.style.borderStyle = 'dashed'; chip.style.borderColor = 'rgba(255,255,255,.3)'; chip.innerHTML = ''; return; }
    chip.style.borderStyle = 'solid'; chip.style.borderColor = 'rgba(255,255,255,.6)';
    chip.innerHTML = '<img src="' + urls[urls.length - 1] + '" style="width:100%;height:100%;object-fit:cover">' + (shots.length > 1 ? '<span style="position:absolute;inset:0;display:grid;place-items:center;font-size:13px;font-weight:800;color:#fff;background:rgba(0,0,0,.28)">' + shots.length + '</span>' : '');
  }
  chip.addEventListener('click', function () { if (shots.length) _openReview(shots.length - 1); });
  function _addShot(blob) {
    var f = new File([blob], 'camera_' + Date.now() + '_' + (shots.length + 1) + '.jpg', { type: blob.type || 'image/jpeg' });
    shots.push(f); urls.push(URL.createObjectURL(blob));
    renderStrip();
    flash.style.opacity = '.7';
    setTimeout(function () { flash.style.opacity = '0'; }, 90);
    _updateUI();
  }
  function _deleteAt(i) {
    if (i < 0 || i >= shots.length) return;
    try { URL.revokeObjectURL(urls[i]); } catch (e) {}
    shots.splice(i, 1); urls.splice(i, 1);
    renderStrip(); _updateUI();
  }
  function _openReview(i) { reviewIdx = i; _renderReview(); review.style.display = 'flex'; }
  function _renderReviewStrip() {
    rStrip.innerHTML = '';
    urls.forEach(function (u, i) {
      var t = document.createElement('img'); t.src = u;
      t.style.cssText = 'flex:none;width:52px;height:52px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid ' + (i === reviewIdx ? '#FFCC00' : 'rgba(255,255,255,.22)') + ';';
      t.addEventListener('click', function () { reviewIdx = i; _renderReview(); });
      rStrip.appendChild(t);
    });
    var cur = rStrip.children[reviewIdx];
    if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} }
  }
  function _renderReview() {
    if (!shots.length) { review.style.display = 'none'; return; }
    if (reviewIdx > shots.length - 1) reviewIdx = shots.length - 1;
    if (reviewIdx < 0) reviewIdx = 0;
    rImg.src = urls[reviewIdx];
    _rvReset(); // S436: fresh photo starts unzoomed
    rPos.textContent = 'Photo ' + (reviewIdx + 1) + ' of ' + shots.length;
    rPrev.disabled = reviewIdx === 0; rPrev.style.opacity = reviewIdx === 0 ? '.25' : '.9';
    rNext.disabled = reviewIdx === shots.length - 1; rNext.style.opacity = reviewIdx === shots.length - 1 ? '.25' : '.9';
    _renderReviewStrip();
  }
  rBack.addEventListener('click', function () { review.style.display = 'none'; });
  rPrev.addEventListener('click', function () { if (reviewIdx > 0) { reviewIdx--; _renderReview(); } });
  rNext.addEventListener('click', function () { if (reviewIdx < shots.length - 1) { reviewIdx++; _renderReview(); } });
  rDel.addEventListener('click', function () { _deleteAt(reviewIdx); if (!shots.length) { review.style.display = 'none'; return; } _renderReview(); });

  // S341/S424: capture path — VERBATIM. Plain canvas only, gravity orientation fix, 1920px clamp.
  function _grabFrameCore(maxPx) {
    var vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    var scrA = _camAngle(); if (scrA === null) scrA = 0;
    var corr = 0;
    if (_grav !== null) {
      var delta = (((_grav - scrA) % 360) + 360) % 360;
      corr = (360 - delta) % 360;
    }
    var swap = (corr === 90 || corr === 270);
    var upW = swap ? vh : vw, upH = swap ? vw : vh;
    var mid = document.createElement('canvas');
    mid.width = upW; mid.height = upH;
    var mctx = mid.getContext('2d');
    if (corr !== 0) {
      mctx.translate(upW / 2, upH / 2);
      mctx.rotate(corr * Math.PI / 180);
      mctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else {
      mctx.drawImage(video, 0, 0, vw, vh);
    }
    var TARGET = (upW >= upH) ? (4 / 3) : (3 / 4);
    var srcW = upW, srcH = upH, sx = 0, sy = 0;
    if (upW / upH > TARGET) { srcW = Math.round(upH * TARGET); sx = Math.round((upW - srcW) / 2); }
    else if (upW / upH < TARGET) { srcH = Math.round(upW / TARGET); sy = Math.round((upH - srcH) / 2); }
    var MAX = maxPx; // S438: capture at max stream res (R2 keeps originals); adaptive wrapper below steps down on failure — never crash
    var scale = Math.min(1, MAX / Math.max(srcW, srcH));
    var cw = Math.round(srcW * scale), ch = Math.round(srcH * scale);
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    ctx.drawImage(mid, sx, sy, srcW, srcH, 0, 0, cw, ch);
    mid.width = 0; mid.height = 0;
    cv.toBlob(function (b) {
      cv.width = 0; cv.height = 0;
      if (b) { _addShot(b); busy = false; }
      else if (MAX > 1920) { _grabFrame(MAX >= 4096 ? 2560 : 1920); } // encode failed at this size: step down, never crash
      else { busy = false; }
    }, 'image/jpeg', 0.95);
  }
  // S438: adaptive capture — try max, degrade 4096→2560→1920 on any allocation
  // or encode failure. Worst case is a softer photo, never a crash.
  function _grabFrame(maxPx) {
    var m = maxPx || 4096;
    try { _grabFrameCore(m); }
    catch (e) {
      if (m > 1920) { _grabFrame(m >= 4096 ? 2560 : 1920); }
      else { busy = false; }
    }
  }
  function shutterAction() {
    if (busy) return; busy = true;
    if (flashMode === 'flash' && (hasTorch || _torchDevId)) {
      // S433 flash-at-capture: torch on -> ~320ms exposure settle -> grab -> torch off.
      _setTorch(true, function () {
        setTimeout(function () {
          flash.style.opacity = '.85'; setTimeout(function () { flash.style.opacity = '0'; }, 60);
          _grabFrame();
          _setTorch(false);
        }, 320);
      });
    } else {
      if (flashMode !== 'off') { flash.style.opacity = '.85'; setTimeout(function () { flash.style.opacity = '0'; }, 60); }
      _grabFrame();
    }
  }
  shutter.addEventListener('click', shutterAction);

  // floating shutter: drag anywhere; hold → remove; re-enable from top ●
  (function () {
    var holdT = null, moved = false, sx0, sy0, ox, oy;
    floater.addEventListener('touchstart', function (e) { var t = e.touches[0]; moved = false; sx0 = t.clientX; sy0 = t.clientY; var r = floater.getBoundingClientRect(); ox = t.clientX - r.left; oy = t.clientY - r.top; holdT = setTimeout(function () { floatDel.style.display = 'flex'; }, 550); }, { passive: true });
    floater.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (Math.hypot(t.clientX - sx0, t.clientY - sy0) > 6) { moved = true; clearTimeout(holdT); } floater.style.left = (t.clientX - ox) + 'px'; floater.style.top = (t.clientY - oy) + 'px'; floater.style.right = 'auto'; floater.style.bottom = 'auto'; }, { passive: true });
    floater.addEventListener('touchend', function () { clearTimeout(holdT); if (!moved && floatDel.style.display === 'none') shutterAction(); });
    floatDel.addEventListener('click', function (e) { e.stopPropagation(); floater.style.display = 'none'; floatDel.style.display = 'none'; btnFloat.style.color = '#fff'; });
    floater.addEventListener('click', function () { if (!('ontouchstart' in window) && floatDel.style.display === 'none') shutterAction(); });
  })();

  // gestures on feed: tap→focus · swipe up/down→flip · pinch→zoom
  (function () {
    var pinch = 0, pz = 1, t0 = null;
    function dist(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.hypot(dx, dy); }
    vidWrap.addEventListener('touchstart', function (e) {
      if (e.target.closest && e.target.closest('button, [id="cam-burst-chip"]')) return;
      if (e.target === expo || (e.target.closest && e.target.closest('div') === expo)) return;
      if (e.touches.length === 2) { pinch = dist(e.touches); pz = zoom; t0 = null; }
      else if (e.touches.length === 1) { var t = e.touches[0]; t0 = { x: t.clientX, y: t.clientY, at: Date.now(), moved: false }; }
    }, { passive: true });
    vidWrap.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && pinch) { zoom = pz * (dist(e.touches) / pinch); applyZoom(); }
      else if (t0) { var t = e.touches[0]; if (Math.hypot(t.clientX - t0.x, t.clientY - t0.y) > 8) t0.moved = true; }
    }, { passive: true });
    vidWrap.addEventListener('touchend', function (e) {
      if (pinch && e.touches.length < 2) pinch = 0;
      if (t0) {
        var last = e.changedTouches[0], dx = last.clientX - t0.x, dy = last.clientY - t0.y, ax = Math.abs(dx), ay = Math.abs(dy);
        if (!t0.moved && (Date.now() - t0.at) < 300) focusAt(last.clientX, last.clientY);
        else if (ay > 70 && ay > ax) flip();
      }
      t0 = null;
    }, { passive: true });
    vidWrap.addEventListener('click', function (e) { if (!('ontouchstart' in window) && !(e.target.closest && e.target.closest('button'))) focusAt(e.clientX, e.clientY); });
  })();

  // tap-to-focus + exposure slider
  var _fh = null, expDragging = false;
  function focusAt(clientX, clientY) {
    var r = vidWrap.getBoundingClientRect();
    reticle.style.left = (clientX - r.left) + 'px'; reticle.style.top = (clientY - r.top) + 'px'; reticle.style.display = 'block';
    if (track && caps && (caps.pointsOfInterest || caps.focusMode)) {
      try { var con = {}; if (caps.pointsOfInterest) con.pointsOfInterest = [{ x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height }]; if (caps.focusMode && caps.focusMode.indexOf && caps.focusMode.indexOf('single-shot') >= 0) con.focusMode = 'single-shot'; track.applyConstraints({ advanced: [con] }); } catch (e) {}
    }
    clearTimeout(_fh); _fh = setTimeout(function () { if (!expDragging) reticle.style.display = 'none'; }, 3500);
  }
  (function () {
    function setSun(clientY) { var r = expoTrack.getBoundingClientRect(); var p = Math.max(0, Math.min(1, (clientY - r.top) / r.height)); expoSun.style.top = (p * 100) + '%'; var ev = (0.5 - p) * 2; _applyFilter(ev); if (track && caps.exposureCompensation) { try { track.applyConstraints({ advanced: [{ exposureCompensation: ev * caps.exposureCompensation.max }] }); } catch (e) {} } clearTimeout(_fh); }
    expo.addEventListener('touchstart', function (e) { expDragging = true; setSun(e.touches[0].clientY); }, { passive: true });
    expo.addEventListener('touchmove', function (e) { if (expDragging) setSun(e.touches[0].clientY); }, { passive: true });
    expo.addEventListener('touchend', function () { expDragging = false; _fh = setTimeout(function () { reticle.style.display = 'none'; }, 2500); }, { passive: true });
  })();

  // S342: rotation "Adjusting…" handling
  var _adjust = document.createElement('div');
  _adjust.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(11,10,13,.55);color:#f4f3f6;font-family:Calibri,sans-serif;font-size:15px;z-index:3;';
  _adjust.textContent = 'Adjusting…';
  vidWrap.appendChild(_adjust);
  var _adjustTimer = null;
  function _showAdjusting() { _adjust.style.display = 'flex'; if (_adjustTimer) clearTimeout(_adjustTimer); _adjustTimer = setTimeout(_hideAdjusting, 1200); }
  function _hideAdjusting() { _adjust.style.display = 'none'; if (_adjustTimer) { clearTimeout(_adjustTimer); _adjustTimer = null; } try { if (video.paused) video.play().catch(function () {}); } catch (e) {} }
  function _onOrient() { _updateStageAspect(); _showAdjusting(); }
  try {
    window.addEventListener('orientationchange', _onOrient);
    if (track && track.addEventListener) { track.addEventListener('mute', _showAdjusting); track.addEventListener('unmute', _hideAdjusting); }
  } catch (e) {}

  function _close(result) {
    try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    document.body.style.overflow = prevOverflow;
    overlay.remove();
    document.removeEventListener('keydown', _esc);
    try {
      window.removeEventListener('orientationchange', _onOrient);
      if (track && track.removeEventListener) { track.removeEventListener('mute', _showAdjusting); track.removeEventListener('unmute', _hideAdjusting); }
    } catch (e) {}
    if (_adjustTimer) { clearTimeout(_adjustTimer); _adjustTimer = null; }
    _disarmGravity();
    _exitFullscreen();
    if (_zoomRaf) { try { cancelAnimationFrame(_zoomRaf); } catch (e) {} }
    done(result);
  }
  function _esc(e) { if (e.key === 'Escape') { if (review.style.display !== 'none') review.style.display = 'none'; else _close([]); } }
  document.addEventListener('keydown', _esc);
  btnCancel.addEventListener('click', function () { _close([]); });
  btnDone.addEventListener('click', function () { _close(shots.slice()); });

  renderStrip(); _updateUI();
}
