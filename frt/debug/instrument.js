// frt/debug/instrument.js
// ============================================================================
// ARENCON FRT Crash Instrumentation
// Session 95 — iOS/iPadOS drawing viewer crash diagnostic
//
// PURPOSE
//   When FRT is loaded with ?dbg=1, this script observes viewer state via
//   DOM + polling and writes a synchronous heartbeat to localStorage every
//   1.5 s. localStorage.setItem is synchronous and persists across WebKit
//   renderer kills — so the last heartbeat survives even a Jetsam crash.
//
//   On the NEXT FRT load, if the previous session has a heartbeat but no
//   clean-exit marker, a banner appears showing the exact state at the
//   moment of death, with a [Copy log] button that dumps JSON to clipboard.
//
// INVARIANTS
//   * Zero modification to viewer.js / markup.js / markupEngine.js / tiledPdf.js
//   * Pure DOM + polling observation
//   * Gated behind ?dbg=1 — zero cost in production
//   * No Supabase, no network calls (self-contained)
//
// WHAT IT CAPTURES
//   Heartbeat (every 1.5 s):
//     ts, session, page_open, scale, tiles_in_layer, all_canvases_count,
//     all_canvases_pixels, all_imgs_count, backdrop_{w,h}, markup_canvas_{w,h},
//     viewer_open, idb_usage_mb, idb_quota_mb, heap_mb (if exposed), device
//
//   Events (rolling last 200):
//     tile_add, tile_remove, backdrop_change, canvas_create, canvas_destroy,
//     zoom_change, error, unhandled_rejection, resource_error,
//     visibility_change, pagehide, freeze, resume
//
// SELF-CHECK
//   On load, logs "[FRT-DBG] instrumentation online" with session id to console.
// ============================================================================

(function(){
  'use strict';

  // ── Gate ────────────────────────────────────────────────────────────────
  // Activates via any of:
  //   ?dbg=1 in search, #dbg=1 in hash, window.__frtForceDebug flag,
  //   sessionStorage flag (set by reset.html), or localStorage flag with
  //   30-min expiry (also set by reset.html — persists across full reloads)
  var gateSearch = /[?&]dbg=1\b/.test(location.search);
  var gateHash   = /(?:^|[?&#])dbg=1\b/.test(location.hash || '');
  var gateFlag   = !!window.__frtForceDebug;
  var gateSess   = false;
  var gateLocal  = false;
  try { gateSess  = sessionStorage.getItem('arencon_force_dbg') === '1'; } catch(e){}
  try {
    var exp = parseInt(localStorage.getItem('arencon_force_dbg_until') || '0', 10);
    gateLocal = exp > Date.now();
  } catch(e){}
  if (!gateSearch && !gateHash && !gateFlag && !gateSess && !gateLocal) return;

  // ── Keys ────────────────────────────────────────────────────────────────
  var K_HEARTBEAT   = 'arencon_frt_dbg_heartbeat_v1';
  var K_EVENTS      = 'arencon_frt_dbg_events_v1';
  var K_CLEAN       = 'arencon_frt_dbg_clean_v1';
  var K_SESSION     = 'arencon_frt_dbg_session_v1';
  var K_BOOTS       = 'arencon_frt_dbg_boots_v1';

  // ── Session ─────────────────────────────────────────────────────────────
  var SESSION_ID = (Date.now().toString(36) + '-' +
                    Math.random().toString(36).slice(2, 8));
  var BOOT_COUNT = 0;
  try { BOOT_COUNT = parseInt(localStorage.getItem(K_BOOTS) || '0', 10) + 1; }
  catch(e){}
  try { localStorage.setItem(K_BOOTS, String(BOOT_COUNT)); } catch(e){}
  try { localStorage.setItem(K_SESSION, SESSION_ID); } catch(e){}

  // ── Device fingerprint ──────────────────────────────────────────────────
  var DEVICE = (function(){
    var ua = navigator.userAgent || '';
    var isIPhone = /iPhone|iPod/.test(ua);
    var isIPad   = /iPad/.test(ua) ||
                   (/Macintosh/.test(ua) && (navigator.maxTouchPoints||0) > 1);
    var m = ua.match(/OS (\d+)[_.](\d+)/);
    return {
      ua: ua.slice(0, 250),
      dpr: window.devicePixelRatio || 1,
      view: window.innerWidth + 'x' + window.innerHeight,
      iphone: isIPhone, ipad: isIPad,
      ios_ver: m ? (m[1]+'.'+m[2]) : '',
      deviceMemory: navigator.deviceMemory || null,
      maxTouch: navigator.maxTouchPoints || 0
    };
  })();

  // ── Prior crash detection (BEFORE we start writing) ─────────────────────
  var priorCrash = null;
  var priorEvents = [];
  try {
    var hb = localStorage.getItem(K_HEARTBEAT);
    var clean = localStorage.getItem(K_CLEAN);
    if (hb) {
      var hbObj = JSON.parse(hb);
      // Crash if last heartbeat's session != clean marker's session
      if (!clean || JSON.parse(clean || '{}').session !== hbObj.session) {
        priorCrash = hbObj;
        // Preserve the events from the crashed session BEFORE they get
        // overwritten by the first heartbeat of this new session. This was
        // the instrumentation bug that cost us the timeline for S95 repros
        // through v182 — we saw the final-state heartbeat but never the
        // event sequence that led up to it.
        try {
          priorEvents = JSON.parse(localStorage.getItem(K_EVENTS) || '[]');
        } catch(e){}
      }
    }
  } catch(e){}

  // ── IDB estimate (cached async) ─────────────────────────────────────────
  var _idbUsageMb = null, _idbQuotaMb = null;
  function refreshIdbEstimate(){
    if (!navigator.storage || !navigator.storage.estimate) return;
    try {
      navigator.storage.estimate().then(function(est){
        if (est) {
          _idbUsageMb = Math.round((est.usage  || 0) / 1048576);
          _idbQuotaMb = Math.round((est.quota  || 0) / 1048576);
        }
      }, function(){});
    } catch(e){}
  }
  refreshIdbEstimate();
  setInterval(refreshIdbEstimate, 5000);

  // ── Event log (rolling) ─────────────────────────────────────────────────
  var MAX_EVENTS = 200;
  var events = [];

  function flushEvents(){
    try { localStorage.setItem(K_EVENTS, JSON.stringify(events)); } catch(e){}
  }

  function logEvent(type, data){
    var evt = { t: Date.now(), pt: Math.round(performance.now()), type: type };
    if (data) for (var k in data) if (data.hasOwnProperty(k)) evt[k] = data[k];
    events.push(evt);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    // S95 v3: flush on EVERY event. localStorage writes are synchronous, cheap,
    // and the previous "flush only on fatal" policy meant we lost events when
    // the crash happened between heartbeats. Better to over-flush.
    flushEvents();
  }

  // ── State readers ───────────────────────────────────────────────────────
  function getScale(){
    // Prefer parsing dv-img-wrap inline transform for the source value
    var wrap = document.getElementById('dv-img-wrap');
    if (!wrap) return null;
    var t = wrap.style.transform || '';
    var m = /scale\(([^)]+)\)/.exec(t);
    if (m) return parseFloat(m[1]);
    // Fallback to computed matrix
    var cm = getComputedStyle(wrap).transform;
    if (cm && cm !== 'none') {
      var mm = /matrix(?:3d)?\(([^)]+)\)/.exec(cm);
      if (mm) {
        var parts = mm[1].split(',');
        return parseFloat(parts[0]);
      }
    }
    return null;
  }

  function countAllCanvases(){
    var cs = document.getElementsByTagName('canvas');
    var n = cs.length, total = 0, dims = [];
    for (var i = 0; i < n; i++){
      var c = cs[i];
      total += (c.width||0) * (c.height||0);
      if (dims.length < 8) dims.push((c.id||'-')+':'+(c.width||0)+'x'+(c.height||0));
    }
    return { count: n, pixels: total, dims: dims };
  }

  function sampleState(){
    var tilesLayer = document.getElementById('dv-tiles-layer');
    var img        = document.getElementById('dv-image');
    var mc         = document.getElementById('markup-canvas');
    var overlay    = document.getElementById('drawing-viewer-overlay');
    var cv         = countAllCanvases();

    return {
      ts: Date.now(),
      session: SESSION_ID,
      boot: BOOT_COUNT,
      viewer_open: !!(overlay && overlay.classList.contains('open')) ||
                   (document.body && document.body.classList.contains('dv-open')),
      scale: getScale(),
      tiles_in_layer: tilesLayer ? tilesLayer.children.length : 0,
      backdrop_nat: img ? (img.naturalWidth + 'x' + img.naturalHeight) : '',
      backdrop_disp: img ? (img.clientWidth + 'x' + img.clientHeight) : '',
      backdrop_src_len: img && img.src ? img.src.length : 0,
      backdrop_is_blob: img && img.src ? (img.src.indexOf('blob:')===0) : false,
      markup_canvas: mc ? (mc.width + 'x' + mc.height) : '',
      markup_pixels: mc ? (mc.width * mc.height) : 0,
      all_canvases: cv.count,
      all_canvases_mpx: (cv.pixels / 1e6).toFixed(1),
      canvas_dims: cv.dims.join(','),
      all_imgs: document.getElementsByTagName('img').length,
      idb_usage_mb: _idbUsageMb,
      idb_quota_mb: _idbQuotaMb,
      heap_mb: (performance.memory && performance.memory.usedJSHeapSize)
                ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      events_count: events.length,
      device: DEVICE
    };
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────
  var lastScale = null;
  var lastTileCount = null;
  var lastBackdropNat = null;

  function heartbeat(){
    var s = sampleState();

    // Derived events — detect big changes since last tick
    if (s.scale !== null && lastScale !== null && Math.abs(s.scale - lastScale) > 0.001){
      logEvent('zoom_change', { from: lastScale, to: s.scale });
    }
    if (s.backdrop_nat && s.backdrop_nat !== lastBackdropNat){
      if (lastBackdropNat !== null) logEvent('backdrop_nat_change', { from: lastBackdropNat, to: s.backdrop_nat });
      lastBackdropNat = s.backdrop_nat;
    }
    lastScale = s.scale;
    lastTileCount = s.tiles_in_layer;

    // Write heartbeat synchronously — survives renderer kill
    try { localStorage.setItem(K_HEARTBEAT, JSON.stringify(s)); } catch(e){}
    flushEvents();
    renderOverlay(s);
  }

  setInterval(heartbeat, 300);

  // ── MutationObserver on tiles layer ─────────────────────────────────────
  function installTileObserver(){
    var layer = document.getElementById('dv-tiles-layer');
    if (!layer) { setTimeout(installTileObserver, 500); return; }
    var obs = new MutationObserver(function(muts){
      var add = 0, rem = 0;
      for (var i = 0; i < muts.length; i++){
        add += muts[i].addedNodes.length;
        rem += muts[i].removedNodes.length;
      }
      if (add) logEvent('tile_add', { n: add, total: layer.children.length });
      if (rem) logEvent('tile_remove', { n: rem, total: layer.children.length });
    });
    obs.observe(layer, { childList: true });
    logEvent('tile_observer_on');
  }

  // ── Global canvas create/destroy observer ───────────────────────────────
  var bodyObs = new MutationObserver(function(muts){
    for (var i = 0; i < muts.length; i++){
      var m = muts[i];
      for (var j = 0; j < m.addedNodes.length; j++){
        var n = m.addedNodes[j];
        if (n && n.tagName === 'CANVAS'){
          logEvent('canvas_create', {
            id: n.id || '', w: n.width||0, h: n.height||0,
            mpx: ((n.width||0)*(n.height||0)/1e6).toFixed(2)
          });
        }
      }
      for (var k = 0; k < m.removedNodes.length; k++){
        var r = m.removedNodes[k];
        if (r && r.tagName === 'CANVAS'){
          logEvent('canvas_destroy', { id: r.id || '', w: r.width||0, h: r.height||0 });
        }
      }
    }
  });

  // ── Error handlers ──────────────────────────────────────────────────────
  window.addEventListener('error', function(e){
    logEvent('error', {
      msg: (e.message||'').slice(0, 180),
      src: (e.filename||'').slice(-80),
      line: e.lineno||0, col: e.colno||0
    });
  }, true);

  // ── Resource timing (network fetches) — big spikes in memory are
  //    typically caused by large image decodes kicked off by fetches ──────
  try {
    var perfObs = new PerformanceObserver(function(list){
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++){
        var e = entries[i];
        // Only log non-tiny resources to avoid spam
        var size = e.transferSize || e.encodedBodySize || 0;
        if (size > 5000 || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(e.name)){
          logEvent('resource', {
            name: e.name.length > 80 ? e.name.slice(-80) : e.name,
            type: e.initiatorType || '',
            size: size,
            dur: Math.round(e.duration || 0),
            enc: e.encodedBodySize || 0,
            dec: e.decodedBodySize || 0
          });
        }
      }
    });
    perfObs.observe({ entryTypes: ['resource'] });
    logEvent('perf_observer_on');
  } catch(e){ logEvent('perf_observer_fail', { msg: String(e) }); }

  // ── Backdrop-image attribute observer — catches src changes, load, size ─
  function installBackdropObserver(){
    var img = document.getElementById('dv-image');
    if (!img){ setTimeout(installBackdropObserver, 500); return; }
    var last = { src: '', w: 0, h: 0 };
    // Poll dv-image state (MutationObserver doesn't cover naturalWidth)
    setInterval(function(){
      var src = (img.src||'').slice(0, 60);
      var w = img.naturalWidth || 0, h = img.naturalHeight || 0;
      if (src !== last.src || w !== last.w || h !== last.h){
        logEvent('backdrop_state', {
          src: src, nw: w, nh: h, mpx: ((w*h)/1e6).toFixed(2),
          complete: img.complete
        });
        last.src = src; last.w = w; last.h = h;
      }
    }, 200);
  }
  installBackdropObserver();

  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    var msg = '';
    try { msg = (r && r.message) ? r.message : String(r); } catch(_) { msg = '(unrep)'; }
    logEvent('unhandled_rejection', { msg: msg.slice(0, 180) });
  });

  document.addEventListener('error', function(e){
    var t = e.target;
    if (t && (t.tagName === 'IMG' || t.tagName === 'SCRIPT' || t.tagName === 'LINK')){
      logEvent('resource_error', {
        tag: t.tagName, src: (t.src||t.href||'').slice(-120)
      });
    }
  }, true);

  // ── Lifecycle: clean-exit markers ───────────────────────────────────────
  function markClean(reason){
    try {
      localStorage.setItem(K_CLEAN, JSON.stringify({
        session: SESSION_ID, ts: Date.now(), reason: reason
      }));
    } catch(e){}
    flushEvents();
  }

  window.addEventListener('pagehide', function(e){
    logEvent('pagehide', { persisted: !!e.persisted });
    // persisted === true means bfcache (clean)
    // persisted === false may indicate a kill, BUT also fires on nav — still
    // worth writing the current HB synchronously before leaving.
    heartbeat();
    if (e.persisted) markClean('pagehide_persisted');
    else flushEvents();
  });

  window.addEventListener('beforeunload', function(){
    logEvent('beforeunload');
    heartbeat();
    markClean('beforeunload');
  });

  // Page Lifecycle API — fires before Jetsam in some iOS versions
  document.addEventListener('freeze', function(){
    logEvent('freeze');
    heartbeat();
    flushEvents();
  });
  document.addEventListener('resume', function(){ logEvent('resume'); });

  document.addEventListener('visibilitychange', function(){
    logEvent('visibility', { state: document.visibilityState });
    heartbeat();
  });

  // ── Visible overlay (top-right, made deliberately obvious) ──────────────
  var panel = null;
  function ensurePanel(){
    if (panel) return panel;
    if (!document.body) return null;
    panel = document.createElement('div');
    panel.id = 'frt-dbg-panel';
    panel.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:100000;' +
      'background:#9C2742;color:#fff;' +
      'font:600 14px/1.35 ui-monospace,Menlo,monospace;' +
      'padding:10px 12px 8px;border-radius:8px;' +
      'border:3px solid #ffd34d;' +
      'min-width:240px;max-width:320px;pointer-events:auto;white-space:pre;' +
      'box-shadow:0 6px 20px rgba(0,0,0,0.5);';
    document.body.appendChild(panel);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;';
    btnRow.innerHTML =
      '<button id="fdbg-copy" style="flex:1;min-width:80px;background:#1A7A4A;color:#fff;border:0;padding:8px;font:700 13px Calibri;border-radius:4px;">Copy log</button>' +
      '<button id="fdbg-clear" style="background:#455A64;color:#fff;border:0;padding:8px 10px;font:700 13px Calibri;border-radius:4px;">Clear</button>' +
      '<button id="fdbg-hide" style="background:#777;color:#fff;border:0;padding:8px 10px;font:700 13px Calibri;border-radius:4px;">Hide</button>';
    panel.appendChild(btnRow);

    document.getElementById('fdbg-copy').onclick = copyFullLog;
    document.getElementById('fdbg-clear').onclick = clearLogs;
    document.getElementById('fdbg-hide').onclick  = function(){ panel.style.display = 'none'; };
    return panel;
  }

  function renderOverlay(s){
    var p = ensurePanel();
    if (!p) return;
    var line1 = 'FRT-DBG  boot#' + s.boot + '  sess ' + SESSION_ID.slice(-6);
    var text =
      line1 + '\n' +
      'viewer:' + (s.viewer_open?'OPEN':'-') + '  scale:' + (s.scale==null?'-':s.scale.toFixed(2)) + '\n' +
      'tiles:' + s.tiles_in_layer + '  imgs:' + s.all_imgs + '\n' +
      'canvas:' + s.all_canvases + ' (' + s.all_canvases_mpx + ' Mpx)' + '\n' +
      'markup:' + (s.markup_canvas||'-') + '\n' +
      'backdrop:' + (s.backdrop_nat||'-') + '\n' +
      'IDB:' + (s.idb_usage_mb==null?'?':s.idb_usage_mb) + '/' + (s.idb_quota_mb==null?'?':s.idb_quota_mb) + ' MB' +
      (s.heap_mb!=null ? '\nheap:' + s.heap_mb + ' MB' : '') + '\n' +
      'evts:' + s.events_count;
    // Write text before buttons
    var btnRow = p.lastChild;
    p.textContent = text;
    p.appendChild(btnRow);
  }

  // ── Copy / clear ────────────────────────────────────────────────────────
  function buildFullLog(){
    var hb = null, evts = [], clean = null;
    try { hb    = JSON.parse(localStorage.getItem(K_HEARTBEAT) || 'null'); } catch(_){}
    try { evts  = JSON.parse(localStorage.getItem(K_EVENTS) || '[]'); } catch(_){}
    try { clean = JSON.parse(localStorage.getItem(K_CLEAN) || 'null'); } catch(_){}
    return JSON.stringify({
      now: Date.now(),
      session: SESSION_ID,
      boot_count: BOOT_COUNT,
      device: DEVICE,
      prior_crash: priorCrash,
      prior_events: priorEvents,
      last_heartbeat: hb,
      clean_exit: clean,
      events: evts
    }, null, 2);
  }

  function copyFullLog(){
    var text = buildFullLog();
    function fallback(){
      // Textarea select fallback
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80vw;height:60vh;z-index:200000;font:12px monospace;padding:8px;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch(_){}
      var hint = document.createElement('div');
      hint.textContent = 'Log ready — copy manually then tap to close.';
      hint.style.cssText = 'position:fixed;top:4%;left:50%;transform:translateX(-50%);background:#1A7A4A;color:#fff;padding:6px 10px;border-radius:4px;z-index:200001;font:600 12px Calibri;';
      document.body.appendChild(hint);
      ta.onclick = function(){ ta.remove(); hint.remove(); };
      hint.onclick = function(){ ta.remove(); hint.remove(); };
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){
        alert('Full log copied (' + text.length + ' chars).');
      }, fallback);
    } else {
      fallback();
    }
  }

  function clearLogs(){
    try { localStorage.removeItem(K_HEARTBEAT); } catch(_){}
    try { localStorage.removeItem(K_EVENTS); } catch(_){}
    try { localStorage.removeItem(K_CLEAN); } catch(_){}
    events = [];
    priorCrash = null;
    removePriorCrashBanner();
    alert('Logs cleared.');
  }

  // ── Prior-crash banner ──────────────────────────────────────────────────
  function showPriorCrashBanner(){
    if (!priorCrash || !document.body) return;
    var el = document.createElement('div');
    el.id = 'frt-dbg-crashbanner';
    el.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:99999;' +
      'background:#8a1a1a;color:#fff;' +
      'font:600 13px/1.4 Calibri,sans-serif;padding:10px 14px;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.4);';
    var when = new Date(priorCrash.ts).toLocaleString();
    el.innerHTML =
      '<div style="font-size:14px;margin-bottom:4px">⚠ PRIOR SESSION CRASHED</div>' +
      '<div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;background:rgba(0,0,0,0.25);padding:6px 8px;border-radius:3px;margin:4px 0;white-space:pre;overflow-x:auto">' +
      'when      : ' + when + '\n' +
      'viewer    : ' + (priorCrash.viewer_open?'OPEN':'closed') + '\n' +
      'scale     : ' + (priorCrash.scale==null?'-':priorCrash.scale.toFixed(2)) + '\n' +
      'tiles     : ' + priorCrash.tiles_in_layer + '\n' +
      'canvases  : ' + priorCrash.all_canvases + ' (' + priorCrash.all_canvases_mpx + ' Mpx)\n' +
      'canvas_id : ' + (priorCrash.canvas_dims||'-') + '\n' +
      'markup    : ' + (priorCrash.markup_canvas||'-') + '\n' +
      'backdrop  : ' + (priorCrash.backdrop_nat||'-') + '\n' +
      'IDB       : ' + priorCrash.idb_usage_mb + '/' + priorCrash.idb_quota_mb + ' MB\n' +
      'heap      : ' + (priorCrash.heap_mb==null?'n/a':priorCrash.heap_mb+' MB') + '\n' +
      'events    : ' + priorCrash.events_count + ' in buffer\n' +
      'device    : ' + priorCrash.device.ua.slice(0, 100) + '\n' +
      'iOS ver   : ' + priorCrash.device.ios_ver + '  DPR: ' + priorCrash.device.dpr +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button id="fdbg-banner-copy" style="background:#fff;color:#8a1a1a;border:0;padding:6px 12px;font:600 13px Calibri;border-radius:4px">Copy full log</button>' +
      '<button id="fdbg-banner-clear" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 12px;font:600 13px Calibri;border-radius:4px">Clear & dismiss</button>' +
      '<button id="fdbg-banner-dismiss" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 12px;font:600 13px Calibri;border-radius:4px">Dismiss</button>' +
      '</div>';
    document.body.appendChild(el);
    document.getElementById('fdbg-banner-copy').onclick = copyFullLog;
    document.getElementById('fdbg-banner-clear').onclick = clearLogs;
    document.getElementById('fdbg-banner-dismiss').onclick = removePriorCrashBanner;
  }

  function removePriorCrashBanner(){
    var el = document.getElementById('frt-dbg-crashbanner');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ── Expose for console debugging ────────────────────────────────────────
  window.__frtDbg = {
    heartbeat: heartbeat,
    sampleState: sampleState,
    copyLog: copyFullLog,
    clearLogs: clearLogs,
    buildLog: buildFullLog,
    events: function(){ return events.slice(); },
    priorCrash: function(){ return priorCrash; }
  };

  // ── Boot ────────────────────────────────────────────────────────────────
  function boot(){
    try { bodyObs.observe(document.body, { childList: true, subtree: true }); } catch(_){}
    installTileObserver();
    heartbeat();          // first HB immediately, not in 1500ms
    ensurePanel();
    if (priorCrash) showPriorCrashBanner();
    logEvent('boot', { boot: BOOT_COUNT });
    console.log('[FRT-DBG] instrumentation online. session=' + SESSION_ID +
                ' boot#' + BOOT_COUNT +
                (priorCrash ? ' PRIOR_CRASH_DETECTED' : ''));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
