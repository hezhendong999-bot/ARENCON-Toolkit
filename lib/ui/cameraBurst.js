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

/* ═══════════════════════════════════════════════════════════════════════════
   S544 — EVERY SHOT IS WRITTEN TO DISK AS THE SHUTTER FIRES (Mark, Lane C #1)
   ---------------------------------------------------------------------------
   Until now a burst lived entirely in memory until Done was tapped: N full-
   resolution photos held as Files, plus N object URLs pinning those same bytes
   for the strip and review screen. Two consequences, both field-proven:

     1. A crash, an OOM kill, a lock-screen eviction or a stray back-swipe part
        way through a burst lost EVERY shot in it. Nothing had been written
        anywhere. That is the largest single-moment loss window in the toolkit.
     2. The burst is the app's peak-memory moment, which is precisely why the
        capture ladder is capped (S482) — the memory ceiling is what crashes the
        WebView, and holding a dozen full-res frames is what fills it.

   Each shot now goes to its own tiny IndexedDB database the instant it is
   taken, and the in-memory copy is replaced by a ~1280px preview for the strip
   and review screen. Done reads the full bytes back off disk and hands the tool
   exactly the same File[] it has always received — the caller contract is
   unchanged, so FRT, Diesel and Electric need no edit to benefit.

   Its OWN database on purpose: this engine is shared by three tools with three
   different report databases, and a camera must never depend on the host's
   schema being open, upgraded or healthy at the moment of capture.

   FAILURE BEHAVIOUR: every disk path degrades to the pre-S544 behaviour (keep
   the File in memory). A device that cannot write — quota exhausted, private
   mode, IDB blocked — still takes photos exactly as it did yesterday.

   RECOVERY: records are only marked handed-off once the tool has actually
   received them. Anything left un-handed-off (i.e. the app died mid-burst) is
   offered back the next time the camera opens. Cancel is an explicit discard
   and clears that session's records — a crash is not a cancel.
   ═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   S546 — THREE CORRECTIONS TO S544, all found on Mark's first field test.

   1. RECOVERY WAS DELAYED BY A MINUTE. S544 refused to offer a shot back until
      60 seconds after it was TAKEN, as a crude way of not stealing photos from
      a second window that might still be shooting. It could not tell a live
      window from a killed app, so it made the real case wait — Mark reopened,
      saw nothing, assumed it had failed. Worse, it did not even achieve its own
      goal: after 60s it would happily offer a live window's in-flight shots.
      A running camera now leaves a heartbeat; a killed app stops leaving one
      within seconds. Liveness is tested directly, so recovery is immediate.

   2. THE CHECK LOADED EVERY IMAGE TO READ A TIMESTAMP. All a sweep needs is
      dates and sizes, but records held image and bookkeeping together, so
      opening the camera pulled tens of megabytes into memory — the exact
      pressure S544 exists to remove. Bookkeeping now lives in its own store;
      images are read only for the shots the user actually taps Add on.

   3. RECOVERY DID NOT KNOW WHICH REPORT THE PHOTOS BELONGED TO (the serious
      one). Open a different job, open the camera, and it offered photos from
      another project — and Add filed them there. Silently, into the wrong
      report. Every shot is now stamped with its report and tool at the moment
      it is written, and only shots belonging to the report in front of you are
      ever offered. Shots written before this change carry no stamp; they are
      still offered, but labelled as needing to be confirmed.
   ═══════════════════════════════════════════════════════════════════════════ */
var _BDB_NAME = 'ARENCON_BURST', _BDB_VER = 2;
var _BDB_STORE = 'shots';      // {k, blob} — the images, read only when needed
var _BDB_META  = 'shotMeta';   // {k, at, session, handedOff, ctx…} — the sweep reads ONLY this
var _BDB_SESS  = 'camSessions';// {sid, beat} — proof a camera is still running
var _BURST_KEEP_MS      = 7 * 24 * 3600 * 1000;   // never handed to a tool: a week
var _BURST_KEEP_DONE_MS = 24 * 3600 * 1000;       // already handed over: a day
var _BURST_BEAT_MS      = 5000;                   // how often a live camera signs in
var _BURST_LIVE_MS      = 20000;                  // no sign-in this long = that window is gone
var _bdb = null, _bdbDead = false;

function _bOpen() {
  if (_bdbDead) return Promise.resolve(null);
  if (_bdb) return Promise.resolve(_bdb);
  return new Promise(function (resolve) {
    var req;
    try { req = indexedDB.open(_BDB_NAME, _BDB_VER); }
    catch (e) { _bdbDead = true; resolve(null); return; }
    req.onupgradeneeded = function (e) {
      var db = e.target.result, tx = e.target.transaction;
      if (!db.objectStoreNames.contains(_BDB_STORE)) db.createObjectStore(_BDB_STORE, { keyPath: 'k' });
      if (!db.objectStoreNames.contains(_BDB_SESS))  db.createObjectStore(_BDB_SESS,  { keyPath: 'sid' });
      if (!db.objectStoreNames.contains(_BDB_META)) {
        db.createObjectStore(_BDB_META, { keyPath: 'k' });
        // v1 → v2: bookkeeping was stored alongside the image. Lift it into the
        // new store so shots taken before this update stay recoverable. The old
        // records keep their extra fields — harmless, and never read again.
        if (e.oldVersion >= 1 && tx) {
          try {
            var src = tx.objectStore(_BDB_STORE), dst = tx.objectStore(_BDB_META);
            src.openCursor().onsuccess = function (ev) {
              var cur = ev.target.result;
              if (!cur) return;
              var r = cur.value || {};
              if (r.k) {
                dst.put({ k: r.k, at: r.at || 0, session: r.session || '', name: r.name || '',
                          type: r.type || 'image/jpeg', size: (r.blob && r.blob.size) || 0,
                          handedOff: !!r.handedOff, doneAt: r.doneAt || 0,
                          ctx: null, legacy: true });
              }
              cur['continue']();
            };
          } catch (mErr) { console.warn('[CamBurst] v1 metadata lift skipped', mErr); }
        }
      }
    };
    req.onsuccess = function () {
      _bdb = req.result;
      try { _bdb.onversionchange = function () { try { _bdb.close(); } catch (e2) {} _bdb = null; }; } catch (e3) {}
      resolve(_bdb);
    };
    req.onerror = function () {
      _bdbDead = true;
      console.warn('[CamBurst] shot store unavailable — shots stay in memory (pre-S544 behaviour)');
      resolve(null);
    };
    req.onblocked = function () { resolve(null); };
  });
}

// ALL-TOOLS transaction rule: open the transaction and issue the request in the
// SAME tick, resolve on tx.oncomplete. Splitting across a .then() lets the
// transaction auto-commit and the write silently fails.
function _bTx(store, mode, fn) {
  return _bOpen().then(function (db) {
    if (!db) return null;
    return new Promise(function (resolve) {
      var tx, out = null;
      try { tx = db.transaction(store, mode); } catch (e) { resolve(null); return; }
      try { out = fn(tx.objectStore(store)); } catch (e) { resolve(null); return; }
      tx.oncomplete = function () { var r = null; try { r = out ? out.result : null; } catch (e) {} resolve(r); };
      tx.onerror = function () { resolve(null); };
      tx.onabort = function () { resolve(null); };
    });
  }).catch(function () { return null; });
}
/** Image and bookkeeping are written as two records. The image goes FIRST:
 *  an image with no bookkeeping is recoverable housekeeping, bookkeeping with
 *  no image is a promise the store cannot keep. */
function _bPut(rec) {
  return _bTx(_BDB_STORE, 'readwrite', function (st) { return st.put({ k: rec.k, blob: rec.blob }); })
    .then(function (r) {
      if (r == null) return false;
      return _bTx(_BDB_META, 'readwrite', function (st) {
        return st.put({ k: rec.k, at: rec.at, session: rec.session, name: rec.name, type: rec.type,
                        size: (rec.blob && rec.blob.size) || 0, handedOff: !!rec.handedOff,
                        doneAt: 0, ctx: rec.ctx || null, legacy: false });
      }).then(function (m) { return m != null; });
    });
}
function _bGet(k) {
  return _bTx(_BDB_STORE, 'readonly', function (st) { return st.get(k); }).then(function (r) { return r || null; });
}
function _bDel(k) {
  return _bTx(_BDB_STORE, 'readwrite', function (st) { return st['delete'](k); })
    .then(function () { return _bTx(_BDB_META, 'readwrite', function (st) { return st['delete'](k); }); });
}
function _bAll() {
  return _bTx(_BDB_META, 'readonly', function (st) { return st.getAll ? st.getAll() : null; })
    .then(function (r) { return r || []; });
}

/** A running camera signs in every few seconds so another window can tell it is
 *  alive. A killed app simply stops, which is what makes recovery immediate. */
function _bBeat(sid) { return _bTx(_BDB_SESS, 'readwrite', function (st) { return st.put({ sid: sid, beat: Date.now() }); }); }
function _bBeatStop(sid) { return _bTx(_BDB_SESS, 'readwrite', function (st) { return st['delete'](sid); }); }
function _bLiveSessions() {
  return _bTx(_BDB_SESS, 'readonly', function (st) { return st.getAll ? st.getAll() : null; })
    .then(function (rows) {
      var now = Date.now(), live = {}, stale = [];
      (rows || []).forEach(function (r) {
        if (!r || !r.sid) return;
        if (now - (r.beat || 0) <= _BURST_LIVE_MS) live[r.sid] = true; else stale.push(r.sid);
      });
      stale.forEach(function (sid) { _bBeatStop(sid); });   // the app that owned it is gone
      return live;
    }).catch(function () { return {}; });
}

/** Mark records as handed to the tool. Only called for shots the tool actually
 *  received — anything that could not be read back stays recoverable.
 *  Bookkeeping only: the image is untouched. */
function _bMarkHandedOff(keys) {
  if (!keys || !keys.length) return Promise.resolve();
  var chain = Promise.resolve();
  keys.forEach(function (k) {
    chain = chain.then(function () {
      return _bTx(_BDB_META, 'readonly', function (st) { return st.get(k); }).then(function (rec) {
        if (!rec) return;
        rec.handedOff = true; rec.doneAt = Date.now();
        return _bTx(_BDB_META, 'readwrite', function (st) { return st.put(rec); });
      });
    });
  });
  return chain.catch(function () {});
}

/** Retire expired records and return shots an interrupted session left behind
 *  FOR THE REPORT IN FRONT OF THE USER. Reads bookkeeping only — no images. */
function _bSweep(currentSession, ctx) {
  var here = (ctx && ctx.projectId) || null;
  var tool = (ctx && ctx.tool) || null;
  return _bLiveSessions().then(function (live) {
    return _bAll().then(function (rows) {
      var now = Date.now(), orphans = [], chain = Promise.resolve();
      (rows || []).forEach(function (r) {
        if (!r || !r.k) return;
        var age = now - (r.at || 0);
        var expired = r.handedOff ? (age > _BURST_KEEP_DONE_MS) : (age > _BURST_KEEP_MS);
        if (expired) { chain = chain.then(function () { return _bDel(r.k); }); return; }
        if (r.handedOff) return;
        if (r.session === currentSession) return;
        if (live[r.session]) return;             // another window is still shooting these
        // Wrong-report guard. A stamped shot is offered only where it belongs.
        // Unstamped shots (written before S546) are offered anywhere, flagged so
        // the user is told to check — losing them would be worse than asking.
        if (!r.legacy && r.ctx) {
          if (here && r.ctx.projectId && r.ctx.projectId !== here) return;
          if (!here && r.ctx.projectId) return;
          if (tool && r.ctx.tool && r.ctx.tool !== tool) return;
        }
        orphans.push(r);
      });
      return chain.then(function () {
        orphans.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
        return orphans;
      });
    });
  }).catch(function () { return []; });
}

/** Where a burst is being taken. Three sources, most specific first: what the
 *  caller passed, what the host publishes as window.arenconBurstContext(), and
 *  — failing both — what the page itself already knows.
 *
 *  That last fallback is deliberate and does the heavy lifting. Every tool is
 *  put into Hub mode by ?project=<id> and lives at a known path, so the engine
 *  can identify the report and the tool without a single host edit. If this had
 *  waited on each tool to opt in, FRT and Electric would have kept offering one
 *  report's photos to another until their lanes got round to it — a correctness
 *  hole should not be scheduled. A host that wants to add a spot label still can. */
function _bContext(ctx) {
  var out = null;
  try {
    if (typeof window !== 'undefined' && typeof window.arenconBurstContext === 'function') {
      out = window.arenconBurstContext() || null;
    }
  } catch (e) {}
  if (!out || !out.projectId || !out.tool) {
    out = out || {};
    try {
      if (!out.projectId) {
        var q = new URLSearchParams(window.location.search);
        out.projectId = q.get('project') || q.get('projectId') || null;
      }
      if (!out.tool) {
        var path = (window.location.pathname || '').toLowerCase();
        out.tool = path.indexOf('diesel') >= 0   ? 'diesel'
                 : path.indexOf('electric') >= 0 ? 'electric'
                 : path.indexOf('frt') >= 0      ? 'frt'
                 : path.indexOf('field_review') >= 0 ? 'frt'
                 : null;
      }
    } catch (e2) {}
  }
  if (ctx && typeof ctx === 'object') {
    out = out || {};
    if (ctx.projectId) out.projectId = ctx.projectId;
    if (ctx.tool) out.tool = ctx.tool;
    if (ctx.label) out.label = ctx.label;
  }
  return (out && (out.projectId || out.tool || out.label)) ? out : null;
}

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

export function openCameraBurst(ctx) {
  // S546: resolve WHERE this burst is being taken (report + tool) and start the
  // recovery check immediately — it now reads bookkeeping only, and runs during
  // the 1-3s the camera hardware takes to open, so the bar is ready with the UI
  // instead of appearing seconds later (Mark's field test).
  var _ctx  = _bContext(ctx);
  var _sid  = 'b' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  var _prep = _bSweep(_sid, _ctx);
  return new Promise(function(resolve) {
    // S482: stale-latch self-heal. If _open is true but the camera overlay is
    // NOT in the DOM, a previous session crashed/threw without resetting the
    // latch — every later camera tap silently resolved [] (dead button all day,
    // Nasim on-site 7310.17). Only honour the latch when the UI truly exists.
    if (_open) {
      if (document.getElementById('cam-burst-overlay')) { resolve([]); return; }
      console.warn('[CamBurst] stale _open latch (no overlay in DOM) — self-healing');
      _open = false;
    }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { resolve(null); return; }
    _open = true;
    _armGravity(); // inside the user gesture (iOS sensor permission)
    _enterFullscreen(); // S427 immersive — hide browser + system chrome (gesture-scoped)
    _showStartingOverlay(); // instant feedback before the hardware opens
    // S341/S482: Android WebView crashes ("Aw, Snap") on a 4096x3072 (12MP)
    // live request — the live video texture + full-res canvas grabs exhaust the
    // WebView renderer's much tighter memory ceiling (iOS Safari has far more
    // headroom and was fine). S341 capped this; a later framing change quietly
    // restored 12MP and reintroduced the crash (Nasim, 7310.17). S482 re-caps at
    // 2048x1536: keeps the 4:3 native/report framing that motivated the change,
    // uses ~1/4 the memory of 12MP, and loses nothing — every stored photo is
    // compressed to maxW 1600 downstream anyway. EVERY live-stream request in
    // this file must use 2048x1536; never raise it back to 4096.
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2048 }, height: { ideal: 1536 } }, // 4:3, Android-safe (S482)
      audio: false
    }).then(function(stream) {
      _removeStartingOverlay();
      // S482: if the camera UI throws while building, release the hardware and
      // the latch — otherwise the camera stays locked for every app on the
      // tablet and our button is dead until reload.
      try {
        _openUI(stream, function(r) { _open = false; resolve(r); }, _sid, _ctx, _prep);
      } catch (uiErr) {
        console.error('[CamBurst] _openUI threw — releasing stream + latch', uiErr);
        try { stream.getTracks().forEach(function(t){ t.stop(); }); } catch(_){}
        _open = false;
        resolve(null);
      }
    }).catch(function() {
      _removeStartingOverlay();
      _open = false;
      resolve(null);
    });
  });
}

function _openUI(stream, done, _sessionId, _ctx, _prep) {
  // S544: `shots` holds DESCRIPTORS, not Files — {k,name,type,size,file}. The
  // bytes live on disk under `k`; `file` is only populated when the disk write
  // failed and memory is the fallback. Done materialises the File[] the caller
  // has always been handed. `urls` stays index-aligned (preview object URLs).
  var _bsid = _sessionId || ('b' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  // Sign in every few seconds so another window can tell this camera is alive.
  // Stops the moment the app dies, which is exactly the signal recovery needs.
  _bBeat(_bsid);
  var _beatTimer = setInterval(function () { _bBeat(_bsid); }, _BURST_BEAT_MS);
  var shots = [];
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
  // ═══ S487l — FIRST-FRAME WATCHDOG (black-screen field reports: Nasim + Thomas,
  // pre-S482 12MP era; neither reproducible since the 2048 re-cap). Mechanism it
  // catches: getUserMedia RESOLVES (overlay opens) but the camera HAL never
  // delivers a frame — the one path that shows as silent black with no recovery
  // and no evidence. Now: breadcrumb + visible one-tap retry (stop tracks,
  // reacquire at the safe 2048 profile, re-attach + re-hook mute handlers). ═══
  var _ffMsg = document.createElement('div');
  _ffMsg.style.cssText = 'display:none;position:absolute;inset:0;z-index:6;background:rgba(0,0,0,.78);color:#fff;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:16px Calibri,sans-serif;text-align:center;padding:20px;';
  _ffMsg.innerHTML = '<div>Camera didn&#8217;t start</div>'
    + '<button id="cam-ff-retry" style="padding:12px 26px;border-radius:10px;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);color:#fff;font:16px Calibri,sans-serif;cursor:pointer;">Tap to retry</button>'
    + '<div style="font-size:13px;opacity:.75;">If it stays black, close (&#10005;) and use Upload instead.</div>';
  vidWrap.appendChild(_ffMsg);
  var _ffTimer = null, _ffFired = false;
  function _ffArm() {
    if (_ffTimer) clearTimeout(_ffTimer);
    _ffTimer = setTimeout(function () {
      if (_ffFired) return;
      try { console.warn('[CamBurst] WATCHDOG: no first frame within 3s (stream live, zero frames) — showing retry. facing=' + facing); } catch (eW) {}
      _ffMsg.style.display = 'flex';
    }, 3000);
  }
  function _ffOk() { _ffFired = true; if (_ffTimer) { clearTimeout(_ffTimer); _ffTimer = null; } _ffMsg.style.display = 'none'; }
  video.addEventListener('loadeddata', _ffOk);
  _ffArm();
  // S487n FIX A (black-screen root cause 1/2, Nasim+Thomas field reports):
  // autoplay is NOT guaranteed on Android — after a camera-service hiccup or
  // under memory pressure it can silently fail, leaving the video PAUSED at
  // frame zero: black, no event, no error. The only play() call lived in the
  // unmute-recovery path, which never runs in that scenario. Kick play
  // explicitly at open and again at loadedmetadata; log + retry on rejection.
  function _kickPlay(tag) {
    try {
      var pp = video.play();
      if (pp && pp.catch) pp.catch(function (err) {
        try { console.warn('[CamBurst] video.play() rejected at ' + tag + ' — ' + (err && err.name) + '; retrying'); } catch (e2) {}
        setTimeout(function () { try { var q = video.play(); if (q && q.catch) q.catch(function () {}); } catch (e3) {} }, 350);
      });
    } catch (e1) {}
  }
  video.addEventListener('loadedmetadata', function () { _kickPlay('loadedmetadata'); });
  _kickPlay('open');
  _ffMsg.querySelector('#cam-ff-retry').addEventListener('click', function (ev) {
    ev.stopPropagation();
    try { ((video.srcObject && video.srcObject.getTracks && video.srcObject.getTracks()) || []).forEach(function (t) { try { t.stop(); } catch (eS) {} }); } catch (eT) {}
    _ffMsg.style.display = 'none'; _ffFired = false; _ffArm();
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, facingMode: facing }, audio: false })
      .then(function (s) {
        stream = s; video.srcObject = s; track = s.getVideoTracks()[0];
        try { if (track && track.addEventListener) { track.addEventListener('mute', _showAdjusting); track.addEventListener('unmute', _hideAdjusting); } } catch (eH) {}
        try { console.info('[CamBurst] WATCHDOG: reacquired stream OK'); } catch (eI) {}
      })
      .catch(function (err) {
        try { console.warn('[CamBurst] WATCHDOG: reacquire FAILED — ' + (err && err.name) + ': ' + (err && err.message)); } catch (eE) {}
        if (_ffTimer) clearTimeout(_ffTimer);
        _ffMsg.style.display = 'flex';
        _ffMsg.firstChild.textContent = 'Camera unavailable';
      });
  });
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
  /* S693 (Mark's spec): the button set is .6 / 1x / 2x / 3x — "whatever a
     normal Android phone can do". 5x was dropped: on phones whose max is 3 it
     lied the same way .6 did. The .6 pill is capability-gated below — it is
     shown only on phones where a lens has PROVEN it can go below 1x, because
     a button that silently does nothing teaches the field to distrust all of
     them. */
  ['0.6', '1', '2', '3'].forEach(function(z) {
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
  /* S693 — THE .6 LENS HUNT, same discipline as the torch hunt above it.
     Cause (measured S691): applyZoom clamps into the range the CURRENT camera
     reports, and every phone's main camera reports a minimum of 1 — so 0.6
     became 1 before it was ever sent; .6 and 1x issued an identical
     instruction. On Android the ultra-wide is usually a SEPARATE physical
     camera that must be opened by deviceId. The fix is runtime, never
     per-model (Mark: "what if it's different phones. All of us got different
     phones"): ask THIS phone, prove the capability by applying it, remember
     the verdict per device. Verdicts: 'same' (current lens accepts sub-1x),
     a deviceId (a proven wide-capable back lens), or 'none' (hide the pill —
     the agreed floor: never show a button that does nothing). */
  var _wideDevId = null, _wideHopeless = false, _wideBusy = false, _onWideLens = false;
  function _wideVerdict() { try { return localStorage.getItem('arc-cam-wide') || ''; } catch (e) { return ''; } }
  function _wideRemember(v) { try { localStorage.setItem('arc-cam-wide', v); } catch (e) {} }
  var _capsLogged = false;
  function _recap() {
    try { caps = (track && track.getCapabilities) ? track.getCapabilities() : {}; } catch (e) { caps = {}; }
    hasTorch = !!(caps && caps.torch);
    hasHwZoom = !!(caps && caps.zoom && typeof caps.zoom.max === 'number');
    if (!_capsLogged && caps && Object.keys(caps).length) {
      _capsLogged = true;
      /* S488: one honest line so any device's REAL camera support is knowable
         from the console instead of guessed at. */
      console.info('[CamBurst] device caps — focusModes:', caps.focusMode || 'none',
        '| pointsOfInterest:', !!caps.pointsOfInterest,
        '| exposureComp:', !!caps.exposureCompensation,
        '| hwZoom:', hasHwZoom ? (caps.zoom.min + '–' + caps.zoom.max) : 'none',
        '| torch:', hasTorch);
    }
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
          navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, facingMode: facing }, audio: false })
            .then(function (s) { _attachStream(s, facing); cb(false, trace); })
            .catch(function () { cb(false, trace); });
          return;
        }
        var dev = backs[i++], id = dev.deviceId, lbl = (dev.label || id.slice(0, 6));
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, deviceId: { exact: id } }, audio: false })
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

  /* S693 — hunt the back lenses for one that PROVES it can go below 1x.
     Reuses every hard-won rule from _acquireTorchTrack: Android cameras are
     exclusive (fully stop the current stream before opening the next), caps
     read EMPTY unless the track settles first (S430/S431 — hence the 650ms),
     and a resolved applyConstraints is the only ground truth. */
  function _acquireWideTrack(cb) {
    if (_wideBusy) return; _wideBusy = true;
    var trace = [];
    // Shortcut: the lens already open may accept sub-1x (some phones expose a
    // logical multi-camera whose main track zooms straight into the wide).
    _recap();
    if (hasHwZoom && typeof caps.zoom.min === 'number' && caps.zoom.min < 1) {
      _wideRemember('same'); _onWideLens = false; _wideBusy = false; cb(true, ['current lens min=' + caps.zoom.min]); return;
    }
    var _known = _wideVerdict();
    navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var cams = ds.filter(function (d) { return d.kind === 'videoinput'; });
      var curId = null; try { curId = track.getSettings ? track.getSettings().deviceId : null; } catch (e) {}
      var backs = cams.filter(function (d) { return /back|rear|environment/i.test(d.label || '') && d.deviceId !== curId; });
      if (!backs.length) backs = cams.filter(function (d) { return d.deviceId !== curId; });
      // A remembered wide lens is tried FIRST — the hunt then only runs when
      // the phone's device ids have rotated since the verdict was recorded.
      if (_known && _known !== 'same' && _known !== 'none') {
        backs = backs.slice().sort(function (a, b) { return (a.deviceId === _known ? -1 : 0) - (b.deviceId === _known ? -1 : 0); });
      }
      try { if (track && track.removeEventListener) { track.removeEventListener('mute', _showAdjusting); track.removeEventListener('unmute', _hideAdjusting); } } catch (e) {}
      try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      var i = 0;
      function tryNext() {
        if (i >= backs.length) {
          _wideHopeless = true; _wideBusy = false; _wideRemember('none');
          navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, facingMode: facing }, audio: false })
            .then(function (s) { _attachStream(s, facing); cb(false, trace); })
            .catch(function () { cb(false, trace); });
          return;
        }
        var dev = backs[i++], id = dev.deviceId, lbl = (dev.label || id.slice(0, 6));
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, deviceId: { exact: id } }, audio: false })
          .then(function (s) {
            var t = s.getVideoTracks()[0];
            setTimeout(function () {
              var c = {}; try { c = t.getCapabilities ? t.getCapabilities() : {}; } catch (e) {}
              var min = (c && c.zoom && typeof c.zoom.min === 'number') ? c.zoom.min : 1;
              var settle = function (ok, err) {
                trace.push(lbl + ': zoom.min=' + min + ' apply=' + (ok ? 'OK' : ('REJ ' + (err && err.name || ''))));
                if (ok) { _wideDevId = id; _wideRemember(id); _onWideLens = true; _attachStream(s, 'environment'); _wideBusy = false; cb(true, trace); }
                else { try { s.getTracks().forEach(function (x) { x.stop(); }); } catch (e) {} tryNext(); }
              };
              if (!(min < 1)) { settle(false, { name: 'min>=1' }); return; }
              try {
                var p = t.applyConstraints({ advanced: [{ zoom: Math.max(0.6, min) }] });
                if (p && p.then) { p.then(function () { settle(true); }, function (err) { settle(false, err); }); }
                else settle(true);
              } catch (e) { settle(false, e); }
            }, 650);
          })
          .catch(function (err) { trace.push(lbl + ': gUM ' + (err && err.name || 'fail')); tryNext(); });
      }
      tryNext();
    }).catch(function () { _wideBusy = false; cb(false, trace); });
  }

  /* S693 — 1x/2x/3x belong to the DEFAULT back camera's optics. Zooming a
     wide lens past 1x is a digital crop of the wrong glass, so leaving .6
     switches back before the zoom is applied. Prefers the torch-proven lens
     like flip() does, so flash keeps working after a visit to .6. */
  function _leaveWideLens(cb) {
    _onWideLens = false;
    try { if (track && track.removeEventListener) { track.removeEventListener('mute', _showAdjusting); track.removeEventListener('unmute', _hideAdjusting); } } catch (e) {}
    try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    var _req = _torchDevId
      ? navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, deviceId: { exact: _torchDevId } }, audio: false })
      : navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, facingMode: 'environment' }, audio: false });
    _req.then(function (s) { _attachStream(s, 'environment'); if (cb) cb(); })
      .catch(function () {
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, facingMode: 'environment' }, audio: false })
          .then(function (s) { _attachStream(s, 'environment'); if (cb) cb(); })
          .catch(function () { if (cb) cb(); });
      });
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
  var zoom = 1, _zoomRaf = 0, _zoomPending = false, _hwZoomNow = 1;   /* S488: sensor's actual current zoom */
  function _mirror() { return facing === 'user' ? ' scaleX(-1)' : ''; }
  function applyZoom() {
    var lo = hasHwZoom ? Math.min(0.6, caps.zoom.min) : 1;
    zoom = Math.max(lo, Math.min(5, zoom));
    zoomPills.forEach(function (b) { var on = Math.abs(zoom - (+b.dataset.z)) < 0.06; b.style.background = on ? 'rgba(0,0,0,.62)' : 'rgba(0,0,0,.42)'; b.style.color = on ? '#FFCC00' : '#c9c6cf'; });
    if (hasHwZoom && track) {
      /* S488 (Mark: "zoom is laggy, always has been"): the lag is the camera
         DRIVER animating to the new hardware zoom — applyConstraints can take
         hundreds of ms with zero feedback in between, so taps feel dead.
         Native camera apps mask exactly this by scaling the preview instantly
         while the sensor catches up. Same trick here: CSS-scale the video NOW
         (zoom-in only — an interim scale-down would show gaps around the
         frame), then clear the interim scale the moment the hardware zoom
         actually lands. _hwZoomNow tracks what the sensor is really at. */
      var _ratio = zoom / (_hwZoomNow || 1);
      video.style.transform = (_ratio > 1.02 ? 'scale(' + _ratio.toFixed(3) + ')' : 'none') + _mirror();
      if (!_zoomPending) { _zoomPending = true; _zoomRaf = requestAnimationFrame(function () { _zoomPending = false; var hz = Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoom)); try { var zp = track.applyConstraints({ advanced: [{ zoom: hz }] }); var landed = function () { _hwZoomNow = hz; video.style.transform = 'none' + _mirror(); if (flashMode === 'torch') { try { var tp = track.applyConstraints({ advanced: [{ torch: true }] }); if (tp && tp.catch) tp.catch(function () {}); } catch (e) {} } }; if (zp && zp.then) zp.then(landed, landed); else landed(); } catch (e) { _hwZoomNow = hz; video.style.transform = 'none' + _mirror(); } }); }
    } else { video.style.transform = 'scale(' + Math.max(1, zoom) + ')' + _mirror(); }
  }
  /* S693 — a zoom tap is now a LENS decision first, a number second. */
  function _zoomTo(z) {
    if (z < 1) {
      if (facing !== 'environment') { zoom = z; applyZoom(); return; }   // selfie cam: existing clamp/digital behaviour
      if (_onWideLens || (hasHwZoom && caps.zoom && typeof caps.zoom.min === 'number' && caps.zoom.min < 1)) {
        zoom = z; applyZoom(); return;
      }
      if (_wideHopeless || _wideVerdict() === 'none') { _hideWidePill(); return; }
      _acquireWideTrack(function (ok, trace) {
        console.info('[CamBurst S693] wide hunt:', ok ? 'lens found' : 'no wide lens', '|', (trace || []).join(' · '));
        if (ok) { zoom = z; applyZoom(); }
        else { _hideWidePill(); }   // the agreed floor: hide, never lie
      });
      return;
    }
    if (_onWideLens) { _leaveWideLens(function () { zoom = z; applyZoom(); }); return; }
    zoom = z; applyZoom();
  }
  zoomPills.forEach(function (b) { b.addEventListener('click', function () { _zoomTo(+b.dataset.z); }); });
  var _widePillEl = zoomPills[0];
  function _hideWidePill() { try { if (_widePillEl) _widePillEl.style.display = 'none'; } catch (e) {} }
  /* A phone that has already answered 'none' never shows the pill at all. */
  if (_wideVerdict() === 'none') _hideWidePill();
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
    video.style.transform = _mirror(); flashMode = 'off'; _applyFlash(); zoom = 1; _hwZoomNow = 1; applyZoom();
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
          var p = track.applyConstraints({ width: { ideal: 2048 }, height: { ideal: 1536 } });
          if (p && p.catch) p.catch(function () {});
        } catch (e) {}
      }
    }
    setTimeout(check, 700);
    setTimeout(check, 1800);
  }
  function flip() {
    if (_flipping) return; _flipping = true;
    _onWideLens = false;   /* S693: flip reopens the torch lens or the facing default, never the wide one */
    var next = facing === 'environment' ? 'user' : 'environment';
    try { if (track && track.removeEventListener) { track.removeEventListener('mute', _showAdjusting); track.removeEventListener('unmute', _hideAdjusting); } } catch (e) {}
    try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    var _req = (next === 'environment' && _torchDevId)
      ? navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, deviceId: { exact: _torchDevId } }, audio: false })
      : navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, facingMode: { exact: next } }, audio: false });
    _req
      .then(function (s) { _attachStream(s, next); })
      .catch(function () {
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, facingMode: next }, audio: false })
          .then(function (s) { _attachStream(s, next); })
          .catch(function () { // recover the original lens so the camera never dies
            navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 2048 }, height: { ideal: 1536 }, facingMode: facing }, audio: false })
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
  // S544: a display-sized copy so the full-resolution bytes can be released.
  // Plain canvas only — OffscreenCanvas is prohibited (Safari incompatibility).
  function _preview(blob) {
    return new Promise(function (resolve) {
      var url, img;
      try { url = URL.createObjectURL(blob); } catch (e) { resolve(null); return; }
      img = new Image();
      img.onload = function () {
        try {
          var max = 1280;
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var s = Math.min(1, max / Math.max(w || 1, h || 1));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * s));
          c.height = Math.max(1, Math.round(h * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          try { URL.revokeObjectURL(url); } catch (e2) {}
          c.toBlob(function (b) {
            var u = null;
            if (b) { try { u = URL.createObjectURL(b); } catch (e3) { u = null; } }
            resolve(u);
          }, 'image/jpeg', 0.72);
        } catch (e4) { try { URL.revokeObjectURL(url); } catch (e5) {} resolve(null); }
      };
      img.onerror = function () { try { URL.revokeObjectURL(url); } catch (e6) {} resolve(null); };
      img.src = url;
    });
  }

  function _addShot(blob) {
    var name = 'camera_' + Date.now() + '_' + (shots.length + 1) + '.jpg';
    var type = blob.type || 'image/jpeg';
    var d = {
      k: _bsid + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: name, type: type, size: blob.size || 0, file: null
    };
    // Instant feedback first: the full-resolution URL goes up immediately so the
    // chip never lags the shutter. It is swapped for the preview (and revoked)
    // as soon as the disk copy is safe.
    shots.push(d); urls.push(URL.createObjectURL(blob));
    renderStrip();
    flash.style.opacity = '.7';
    setTimeout(function () { flash.style.opacity = '0'; }, 90);
    _updateUI();
    _bPut({ k: d.k, blob: blob, name: name, type: type, at: Date.now(), session: _bsid, handedOff: false, ctx: _ctx })
      .then(function (ok) {
        if (!ok) {
          // Disk refused it. Hold the bytes in memory — pre-S544 behaviour —
          // rather than let the shot exist nowhere at all.
          d.file = new File([blob], name, { type: type });
          console.warn('[CamBurst] shot kept in memory (disk write failed)');
          return null;
        }
        return _preview(blob).then(function (pv) {
          if (!pv) return;                       // preview failed: keep the full URL, still on disk
          var at = shots.indexOf(d);
          if (at < 0) { try { URL.revokeObjectURL(pv); } catch (e) {} return; }   // deleted meanwhile
          var old = urls[at];
          urls[at] = pv;
          try { URL.revokeObjectURL(old); } catch (e) {}   // releases the full-res bytes
          renderStrip();
          if (review.style.display !== 'none') _renderReview();
        });
      })
      .catch(function () {
        try { d.file = new File([blob], name, { type: type }); } catch (e) {}
      });
  }
  function _deleteAt(i) {
    if (i < 0 || i >= shots.length) return;
    try { URL.revokeObjectURL(urls[i]); } catch (e) {}
    var d = shots[i];
    if (d && d.k) _bDel(d.k);
    shots.splice(i, 1); urls.splice(i, 1);
    renderStrip(); _updateUI();
  }
  // Read the full bytes back for hand-off. A shot that cannot be read is NOT
  // reported as delivered — it stays on disk un-handed-off and is offered again
  // the next time the camera opens.
  function _materialize() {
    var out = [], chain = Promise.resolve();
    shots.forEach(function (d) {
      chain = chain.then(function () {
        if (d.file) { out.push({ file: d.file, k: d.k }); return null; }
        return _bGet(d.k).then(function (rec) {
          if (rec && rec.blob) out.push({ file: new File([rec.blob], d.name, { type: d.type }), k: d.k });
          else console.warn('[CamBurst] shot could not be read back from disk: ' + d.k);
        });
      });
    });
    return chain.then(function () { return out; });
  }
  // Explicit cancel = the user throwing these away. A crash is not a cancel and
  // never reaches this path, which is what makes recovery meaningful.
  function _discardSession() {
    shots.forEach(function (d) { if (d && d.k) _bDel(d.k); });
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
  rDel.addEventListener('click', function () { _confirmDeleteShot(reviewIdx); });   // S547: ask first

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
    /* S488 HONEST FOCUS (Mark: "it only shows the box pretending to focus").
       He was right about the feel, and here is the truth of it:
       — Region tap-to-focus (focus HERE) needs pointsOfInterest, which Android
         Chrome has never implemented for camera tracks; the old code asked for
         it but no field device grants it. That capability is genuinely
         NATIVE-ONLY today. No web app can do it; we stop implying we can.
       — What the web CAN do: force a real autofocus RE-HUNT via a momentary
         'single-shot', which helps when continuous AF has gone lazy on a
         low-contrast placard. The old code applied single-shot and LEFT the
         track in it — latching focus at that distance, so later shots could
         drift soft (also matches "doesn't really focus"). We now restore
         'continuous' after the hunt settles, every time.
       — If the device reports NO focus control at all, the box would be pure
         theatre; it still appears only because the exposure slider anchored to
         it is real (exposureCompensation). If neither exists: no box. Honest.
       Capabilities are logged at open so a device's real support is knowable. */
    var canHunt = !!(track && caps && caps.focusMode && caps.focusMode.indexOf && caps.focusMode.indexOf('single-shot') >= 0);
    var canCont = !!(track && caps && caps.focusMode && caps.focusMode.indexOf && caps.focusMode.indexOf('continuous') >= 0);
    var canExpo = !!(track && caps && caps.exposureCompensation);
    if (!canHunt && !canExpo) return;   /* nothing real to offer — no theatre */
    var r = vidWrap.getBoundingClientRect();
    reticle.style.left = (clientX - r.left) + 'px'; reticle.style.top = (clientY - r.top) + 'px'; reticle.style.display = 'block';
    if (canHunt) {
      try {
        var hp = track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
        var back = function () {
          if (!canCont) return;
          setTimeout(function () {
            try { var cp = track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); if (cp && cp.catch) cp.catch(function(){}); } catch (e) {}
          }, 1500);   /* let the hunt settle, then hand AF back */
        };
        if (hp && hp.then) hp.then(back, back); else back();
      } catch (e) {}
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
    // S487n FIX B (black-screen root cause 2/2): 'mute' listeners fire on
    // TRANSITIONS only — Android delivers a track that is ALREADY muted when
    // the camera hardware is held/wedged (e.g. right after a crashed 12MP
    // session on a SHARED tablet: Nasim's crash → Thomas's black screen).
    // That state arrived as a silent black screen. Label it immediately
    // (no auto-hide — this isn't a rotation blip); the existing unmute
    // handler recovers, and the 3s watchdog escalates to tap-to-retry.
    if (track && track.muted) {
      _adjust.style.display = 'flex';
      try { console.warn('[CamBurst] track arrived MUTED at open — camera held/wedged by another session or app; waiting for unmute'); } catch (eM) {}
    }
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
    // S546: stand this camera down so another window stops treating it as live.
    // A crash never reaches here — which is the whole point: no sign-off means
    // the app died, and the shots become recoverable at once.
    if (_beatTimer) { try { clearInterval(_beatTimer); } catch (e) {} _beatTimer = null; }
    _bBeatStop(_bsid);
    // S439: page-level sticky fullscreen owns immersion now — do not exit on camera close
    if (_zoomRaf) { try { cancelAnimationFrame(_zoomRaf); } catch (e) {} }
    done(result);
  }
  /* ═══ S545 — CANCEL ASKS FIRST (Mark: "I lost photos several times because of that") ═══
     The ✕ discarded an entire burst on one tap, with nothing between the tap and
     the loss. It sits at the top-left corner of a full-screen camera — exactly
     where a thumb rests holding a tablet, and exactly where Android's own back
     affordance lives, so it gets hit by accident. Every other destructive action
     in the toolkit confirms; this one never did.

     The confirmation is drawn INSIDE the camera overlay rather than through the
     host's dialog engine on purpose: the overlay is full-screen at the top of the
     stacking order, and a host modal can render underneath it. Building it here
     also means all three tools get the same behaviour from one implementation.
     One tap to confirm — never type-to-confirm. Nothing at all is asked when
     there are no shots to lose. */
  /* S547: ONE confirmation card, used by every destructive action in the camera.
     z-index 30 puts it above the review screen (20) — at 12 it rendered UNDERNEATH
     the review screen, so the review-screen delete would have asked a question the
     user could not see. Same failure I avoided by not using the host dialog engine,
     reintroduced inside my own overlay. Anything added here must clear 20. */
  function _confirmCard(opts) {
    if (document.getElementById('cam-burst-confirm')) return;   // already asking
    var back = document.createElement('div');
    back.id = 'cam-burst-confirm';
    back.style.cssText = 'position:absolute;inset:0;z-index:30;background:rgba(11,10,13,.86);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Calibri,sans-serif;';
    var card = document.createElement('div');
    card.style.cssText = 'width:100%;max-width:420px;background:#17161b;border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.55);padding:22px 22px 18px;color:#f4f3f6;';
    var h = document.createElement('div');
    h.style.cssText = 'font-size:19px;font-weight:800;margin-bottom:10px;color:#f4f3f6;';
    h.textContent = opts.title;
    var p = document.createElement('div');
    p.style.cssText = 'font-size:15px;line-height:1.45;color:#a09aa8;margin-bottom:20px;';
    p.textContent = opts.body;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    var keep = document.createElement('button');
    keep.textContent = opts.noText;
    keep.style.cssText = 'width:100%;min-height:52px;border:1px solid rgba(255,255,255,.28);border-radius:12px;background:transparent;color:#f4f3f6;font-family:Calibri,sans-serif;font-size:16px;font-weight:700;cursor:pointer;';
    var kill = document.createElement('button');
    kill.textContent = opts.yesText;
    kill.style.cssText = 'width:100%;min-height:52px;border:0;border-radius:12px;background:#E26076;color:#fff;font-family:Calibri,sans-serif;font-size:16px;font-weight:800;cursor:pointer;';
    row.appendChild(keep); row.appendChild(kill);
    card.appendChild(h); card.appendChild(p); card.appendChild(row);
    back.appendChild(card);
    overlay.appendChild(back);
    function _dismiss() { if (back.parentNode) back.parentNode.removeChild(back); }
    keep.addEventListener('click', _dismiss);
    // Tapping the dark area behind the card is a "no" — the safe direction.
    back.addEventListener('click', function (e) { if (e.target === back) _dismiss(); });
    kill.addEventListener('click', function () { _dismiss(); opts.onYes(); });
  }
  function _confirmDiscard(n, onYes) {
    _confirmCard({
      title: 'Discard ' + n + (n === 1 ? ' photo?' : ' photos?'),
      body: (n === 1 ? 'This photo has' : 'These ' + n + ' photos have') +
        ' not been added to the report yet. Discarding removes ' +
        (n === 1 ? 'it' : 'them') + ' from this device and cannot be undone. ' +
        'Tap Keep shooting to go back to the camera, or Done to add ' +
        (n === 1 ? 'it' : 'them') + ' to the report.',
      noText: 'Keep shooting',
      yesText: 'Discard ' + n + (n === 1 ? ' photo' : ' photos'),
      onYes: onYes
    });
  }
  /* S547: the review-screen bin deleted the photo on screen with no question
     asked — the last one-tap destructive action left in the camera. Lower risk
     than the ✕ (the photo is right in front of you), but it is the same class of
     thing that cost Mark photos, and the rule has no exceptions. */
  function _confirmDeleteShot(i) {
    if (i < 0 || i >= shots.length) return;
    _confirmCard({
      title: 'Delete this photo?',
      body: 'Photo ' + (i + 1) + ' of ' + shots.length + ' has not been added to the report yet. ' +
            'Deleting removes it from this device and cannot be undone.',
      noText: 'Keep it',
      yesText: 'Delete photo',
      onYes: function () {
        _deleteAt(i);
        if (!shots.length) { review.style.display = 'none'; return; }
        _renderReview();
      }
    });
  }
  function _cancelBurst() {
    // Nothing shot yet: closing loses nothing, so do not make the user confirm.
    if (!shots.length) { _discardSession(); _close([]); return; }
    if (document.getElementById('cam-burst-confirm')) return;   // already asking
    _confirmDiscard(shots.length, function () { _discardSession(); _close([]); });
  }
  function _esc(e) {
    if (e.key !== 'Escape') return;
    if (document.getElementById('cam-burst-confirm')) return;   // the card owns Escape
    if (review.style.display !== 'none') review.style.display = 'none';
    else _cancelBurst();
  }
  document.addEventListener('keydown', _esc);
  btnCancel.addEventListener('click', _cancelBurst);
  btnDone.addEventListener('click', function () {
    if (btnDone.disabled) return;
    var was = btnDone.textContent;
    btnDone.disabled = true; btnDone.textContent = 'Saving\u2026';
    _materialize().then(function (recs) {
      _bMarkHandedOff(recs.map(function (r) { return r.k; }));
      _close(recs.map(function (r) { return r.file; }));
    }).catch(function (e) {
      console.error('[CamBurst] hand-off failed', e);
      btnDone.disabled = false; btnDone.textContent = was;
    });
  });

  // ── S544 recovery: shots an interrupted session left on disk ──
  // Nothing is deleted here and nothing is added without a tap. The bar simply
  // says the photos exist; Add puts them into this burst so they travel through
  // the tool's normal pipeline, Keep for later leaves them exactly where they are.
  function _showRecoverBar(orphans) {
    var bar = document.createElement('div');
    bar.id = 'cam-burst-recover';
    bar.style.cssText = 'flex:none;display:flex;align-items:center;gap:10px;padding:9px 14px;background:#C98A4A;color:#fff;font-family:Calibri,sans-serif;font-size:14px;font-weight:700;';
    var txt = document.createElement('span');
    txt.style.cssText = 'flex:1;line-height:1.25;';
    // S546: say WHERE they belong. A stamped shot names its spot when the caller
    // supplied one; an unstamped shot (taken before S546) says so plainly rather
    // than implying a certainty the record does not carry.
    var _legacy = orphans.some(function (r) { return r && (r.legacy || !r.ctx); });
    var _spot = null;
    for (var _i = 0; _i < orphans.length; _i++) {
      var _c = orphans[_i] && orphans[_i].ctx;
      if (_c && _c.label) { _spot = (_spot === null || _spot === _c.label) ? _c.label : ''; }
      else { _spot = ''; }
    }
    txt.textContent = orphans.length + (orphans.length === 1 ? ' photo' : ' photos') +
      ' from an interrupted session' + (_spot ? ' for ' + _spot : '') +
      (orphans.length === 1 ? ' is' : ' are') + ' still on this device' +
      (_legacy ? ' \u2014 check they belong to this report before adding' : '');
    var add = document.createElement('button');
    add.textContent = 'Add';
    add.style.cssText = 'flex:none;min-width:74px;min-height:40px;padding:0 14px;border:0;border-radius:8px;background:#fff;color:#8A5A1E;font-family:Calibri,sans-serif;font-size:14px;font-weight:800;cursor:pointer;';
    var later = document.createElement('button');
    later.textContent = 'Keep for later';
    later.style.cssText = 'flex:none;min-height:40px;padding:0 12px;border:1px solid rgba(255,255,255,.75);border-radius:8px;background:transparent;color:#fff;font-family:Calibri,sans-serif;font-size:14px;font-weight:700;cursor:pointer;';
    bar.appendChild(txt); bar.appendChild(add); bar.appendChild(later);
    overlay.insertBefore(bar, vidWrap);
    later.addEventListener('click', function () { if (bar.parentNode) bar.parentNode.removeChild(bar); });
    add.addEventListener('click', function () {
      add.disabled = true; add.textContent = 'Adding\u2026';
      var chain = Promise.resolve();
      // S546: the images are read HERE, one at a time, and only for shots the
      // user actually chose to recover. The bar itself never loaded any.
      orphans.forEach(function (meta) {
        chain = chain.then(function () { return _bGet(meta.k); }).then(function (rec) {
          if (!rec || !rec.blob) { console.warn('[CamBurst] recovered shot has no image: ' + meta.k); return null; }
          var d = { k: meta.k, name: meta.name || ('recovered_' + meta.k + '.jpg'),
                    type: meta.type || 'image/jpeg', size: rec.blob.size || 0, file: null };
          shots.push(d);
          urls.push(URL.createObjectURL(rec.blob));
          renderStrip(); _updateUI();
          return _preview(rec.blob).then(function (pv) {
            if (!pv) return;
            var at = shots.indexOf(d);
            if (at < 0) { try { URL.revokeObjectURL(pv); } catch (e) {} return; }
            var old = urls[at]; urls[at] = pv;
            try { URL.revokeObjectURL(old); } catch (e) {}
            renderStrip();
          });
        });
      });
      chain.then(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); });
    });
  }
  // The sweep was started while the camera hardware was still opening.
  (_prep || _bSweep(_bsid, _ctx)).then(function (orphans) {
    if (!orphans || !orphans.length) return;
    if (!overlay.parentNode) return;                 // camera already closed
    try { _showRecoverBar(orphans); } catch (e) { console.warn('[CamBurst] recovery bar failed', e); }
  });

  renderStrip(); _updateUI();
}

// S479e (engine-adoption review): the shared photo engine's Camera button
// calls window.openCameraBurst and silently falls back to the plain file
// picker when it is absent. FRT only ever ES-exported this function, so the
// engine-converted pin editor has been on the FALLBACK since S478 — masked
// on tablets because their file picker offers a camera. Owned here, once.
if (typeof window !== 'undefined') window.openCameraBurst = openCameraBurst;
