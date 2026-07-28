// ARENCON Field Review Tool — Service Worker
// Strategy: network-first for HTML/JS/CSS (always get latest), cache-first for CDN assets
// S495 (Mark) — COLLISION-PROOF CACHE IDENTITY.
// This was a hand-incremented counter, and sw.js is a shared file that every
// lane bumps on every push. Two lanes that both read v1196 both write v1197:
// whoever pushes second silently reverts the other's bump, and the file still
// LOOKS correct, so nothing catches it. That near-miss happened for real in
// S495 (both lanes independently picked v1174; identical by luck only).
// The value is opaque — only opened as a cache key, compared with !== in the
// activate-purge filter, and echoed in the sw-updated message. Never parsed,
// never ordered. A per-push timestamp works identically and cannot collide.
// FORMAT: arencon-frt-202607271900<UTC yyyymmddhhmm>. Bump = set to the current UTC time.
// Do NOT go back to a counter.
var CACHE_NAME = 'arencon-frt-202607291845';
// S96 Fix #3: separate long-lived cache for drawing tiles. Survives app-cache
// bumps. Never purged on activate. Cleared explicitly by the Hub "Clear offline
// cache" action or on full site-data wipe.
var TILE_CACHE = 'arencon-frt-202607271900tiles-v1';

// Is this a tile URL served by the Cloudflare R2 Worker?
// Pattern: https://arencon-r2-worker.*/workers.dev/{pid}/tiles/{drawingId}/...
function isTileRequest(url) {
  if (url.hostname.indexOf('workers.dev') < 0) return false;
  if (url.pathname.indexOf('/tiles/') < 0) return false;
  // Manifest is served from the same tiles/ path — cache that too (short-lived)
  return true;
}

// Files to precache on install
var APP_FILES = [
  /* ═══ BEGIN GENERATED PRECACHE — tools/gen_precache.py owns this block.
     Hand edits are discarded on the next --write. Add unscannable files
     to tools/precache_extra.txt instead. ═══ */
  './',
  'frt/index.html',
  'ARENCON_Diesel_Fire_Pump_Commissioning.html',
  'ARENCON_Electric_Fire_Pump_Commissioning.html',
  'ARENCON_Project_Hub.html',
  'index.html',
  'ARENCON_Field_Review_Tool.html',
  'shared/auth-gate.js',
  'frt/js/data/syncWorker.js',
  'frt/js/workers/imageWorker.js',
  'lib/data/syncWorker.js',
  'lib/workers/imageWorker.js',
  'frt/fonts/Carlito-Regular.ttf',
  'frt/fonts/Carlito-Bold.ttf',
  'frt/fonts/Carlito-Italic.ttf',
  'frt/fonts/Carlito-BoldItalic.ttf',
  'frt/vendor/fontkit.umd.min.js',
  'aiusage_panel.css',
  'aiusage_panel.js',
  'diesel-sync.js',
  'frt/css/frt.css',
  'frt/js/ai/assistant.js',
  'frt/js/ai/usage.js',
  'frt/js/app.js',
  'frt/js/data/idb.js',
  'frt/js/data/merge.js',
  'frt/js/data/model.js',
  'frt/js/data/photoOutbox.js',
  'frt/js/data/presence.js',
  'frt/js/data/r2.js',
  'frt/js/data/sync.js',
  'frt/js/data/syncWorkerHost.js',
  'frt/js/data/thumbCache.js',
  'frt/js/data/tileCache.js',
  'frt/js/data/uploadQueue.js',
  'frt/js/diag/drawingMigrate.js',
  'frt/js/diag/integrity.js',
  'frt/js/diag/memory.js',
  'frt/js/diag/r2cleanup.js',
  'frt/js/diag/recorder.js',
  'frt/js/export/carlitoBold.js',
  'frt/js/export/carlitoReg.js',
  'frt/js/export/crbImport.js',
  'frt/js/export/crbRender.js',
  'frt/js/export/exportview.js',
  'frt/js/export/json.js',
  'frt/js/export/pdf.js',
  'frt/js/export/projectDocs.adapter.js',
  'frt/js/lib/esc.js',
  'frt/js/shared/auth.js',
  'frt/js/shared/deviceBudget.js',
  'frt/js/shared/dialogs.js',
  'frt/js/shared/scrollLock.js',
  'frt/js/shared/toast.js',
  'frt/js/ui/cameraBurst.js',
  'frt/js/ui/crbThread.js',
  'frt/js/ui/deficiencies.js',
  'frt/js/ui/drawings.js',
  'frt/js/ui/lightbox.js',
  'frt/js/ui/photoPicker.js',
  'frt/js/ui/photos.js',
  'frt/js/ui/pinsGL.js',
  'frt/js/ui/projectInfo.js',
  'frt/js/viewer/dimensionTool.js',
  'frt/js/viewer/markup.js',
  'frt/js/viewer/markupEngine.js',
  'frt/js/viewer/markupSelBridge.js',
  'frt/js/viewer/tiledPdf.js',
  'frt/js/viewer/viewer.js',
  'frt/js/viewer/webglMarkup.js',
  'frt/js/workers/imageWorkerHost.js',
  'lib/assets/logo.js',
  'lib/calc/pumpCurve.js',
  'lib/data/idb.js',
  'lib/data/merge.js',
  'lib/data/photoMint.js',
  'lib/data/photoOutbox.js',
  'lib/data/r2.js',
  'lib/data/sync.js',
  'lib/data/syncWorkerHost.js',
  'lib/export/exportPreview.js',
  'lib/export/projectDocs.js',
  'lib/export/projectDocsSources.js',
  'lib/shared/auth.js',
  'lib/shared/scrollLock.js',
  'lib/shared/toast.js',
  'lib/ui/cameraBurst.js',
  'lib/ui/checklist.js',
  'lib/ui/dialogConfigs.js',
  'lib/ui/dialogEngine.js',
  'lib/ui/deficiencies.js',
  'lib/ui/dieselHelpCards.js',
  'lib/ui/electricHelpCards.js',
  'lib/ui/frtHelpCards.js',
  'lib/ui/helpPanel.css',
  'lib/ui/flowPhotoModal.js',
  'lib/ui/headerConfigs.js',
  'lib/ui/headerEngine2.js',
  'lib/ui/helpEngine.js',
  'lib/ui/hubHeaderConfig.js',
  'lib/ui/hubHelpCards.js',
  'lib/ui/lightbox.js',
  'lib/ui/markupEraser.js',
  'lib/ui/markupPolyline.js',
  'lib/ui/markupSelection.js',
  'lib/ui/markupText.js',
  'lib/ui/markupTools.js',
  'lib/ui/photoInput.js',
  'lib/ui/portalHeaderConfig.js',
  'lib/ui/signaturePad.js',
  'lib/workers/imageWorkerHost.js',
  /* ═══ END GENERATED PRECACHE ═══ */

  /* ═══ S509b — THE MODULAR DIESEL BUILD (diesel-app/**) ═══
     The Hub points the field at this build, and NOT ONE of its files was in the
     cache. A warm device never noticed: same-origin requests are network-first and
     populate the runtime cache as a side effect of normal use, which is exactly why
     airplane-mode testing kept passing. A COLD device — new tablet, cleared storage,
     first open on a site with no signal — had nothing to fall back to and would fail
     outright with no useful message.
     diesel-app/index.html has been listed in tools/precache_extra.txt since S499, so
     the intent was recorded; the generated block above simply never picked it up (its
     scanner follows ES module graphs, and this build loads plain <script src> tags).
     Every path below is verified present in the repo and is mirrored into
     tools/precache_extra.txt, so a future `gen_precache.py --write` reproduces them
     inside the generated block rather than dropping them.
     CSS is listed WITHOUT its ?v= stamp on purpose: the offline fallback matches with
     ignoreSearch, so the bare path serves any stamped request. */
  'diesel-app/index.html',
  'diesel-app/css/diesel-01.css',
  'diesel-app/css/diesel-02.css',
  'diesel-app/js/part01.js',
  'diesel-app/js/part02.js',
  'diesel-app/js/part03.js',
  'diesel-app/js/part04.js',
  'diesel-app/js/part05.js',
  'diesel-app/js/pdfExport.js',   /* S511: moved out of lib/ui/ — Diesel-only */
  'lib/export/capturePdf.js',     /* S511: preview -> real .pdf capture pipeline */
  'lib/data/photoLinkMint.js',    /* S512: opaque /p/{token} links for report photos */
  'vendor/html2canvas.min.js',    /* S511: vendored so a tablet with no signal can still export */
  'vendor/pdf-lib.min.js',
  'diesel-app/js/part06.js',
  'diesel-app/js/part07.js',
  'diesel-app/js/part08.js',
  'diesel-app/js/part09.js',
  'diesel-app/js/part10.js',
  'diesel-app/js/part11.js',
  'diesel-app/js/part12.js',
  'diesel-app/js/part13.js',
  'diesel-app/js/part14.js',
  'diesel-app/js/part15.js',
  'diesel-app/js/part16.js',
  'lib/calc/curveData.js',
  'arencon-icon-192.png',
];

// CDN assets to precache (pdf.js etc)
var CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.4.2/pixi.min.js'
];

// Install — precache app shell + CDN assets
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Precaching app shell + modules');
      var cdnPromises = CDN_ASSETS.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('[SW] Failed to cache CDN asset:', url, err);
        });
      });
      var appPromises = APP_FILES.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('[SW] Failed to cache:', url, err);
        });
      });
      return Promise.all(cdnPromises.concat(appPromises));
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — clean up old caches (PRESERVE TILE_CACHE — survives app-cache bumps)
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME && n !== TILE_CACHE; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      // S163 Fix C (V-9): broadcast one-time "new SW active" to every
      // controlled window. Clients respond by flushing Model→IDB and
      // reloading (see app.js navigator.serviceWorker.message handler).
      // This closes the 24-hour-max-age gap between deploying a safety
      // fix and that fix actually executing on field devices. cacheName
      // is included so future client-side dedup logic can ignore
      // duplicate broadcasts for the same version.
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(function(clients) {
          clients.forEach(function(c) {
            try { c.postMessage({ type: 'sw-updated', cacheName: CACHE_NAME }); } catch(_) {}
          });
        });
    })
  );
});

// S96 Fix #3: postMessage protocol for tile cache management.
//   { type: 'TILE_CACHE_PURGE_PROJECT', pid: '<uuid>' }     → delete all tiles for one project
//   { type: 'TILE_CACHE_CLEAR' }                            → wipe entire tile cache
//   { type: 'TILE_CACHE_STATS', pid: '<uuid>' }             → reply with { count, pid }
self.addEventListener('message', function(e) {
  var msg = e.data || {};
  if (msg.type === 'TILE_CACHE_CLEAR') {
    caches.delete(TILE_CACHE).then(function(){
      if (e.source && e.source.postMessage) e.source.postMessage({ type: 'TILE_CACHE_CLEARED' });
    });
    return;
  }
  if (msg.type === 'TILE_CACHE_PURGE_PROJECT' && msg.pid) {
    var needle = '/' + msg.pid + '/tiles/';
    caches.open(TILE_CACHE).then(function(c){
      c.keys().then(function(reqs){
        var dels = reqs.filter(function(r){ return r.url.indexOf(needle) >= 0; })
                       .map(function(r){ return c.delete(r); });
        Promise.all(dels).then(function(){
          if (e.source && e.source.postMessage) e.source.postMessage({ type: 'TILE_CACHE_PURGED', pid: msg.pid, count: dels.length });
        });
      });
    });
    return;
  }
  if (msg.type === 'TILE_CACHE_STATS' && msg.pid) {
    var needle2 = '/' + msg.pid + '/tiles/';
    caches.open(TILE_CACHE).then(function(c){
      c.keys().then(function(reqs){
        var n = reqs.filter(function(r){ return r.url.indexOf(needle2) >= 0; }).length;
        if (e.source && e.source.postMessage) e.source.postMessage({ type: 'TILE_CACHE_STATS', pid: msg.pid, count: n });
      });
    });
    return;
  }
});

// Fetch strategy
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // S96 Fix #3: Drawing tiles — cache-first with separate long-lived cache.
  // This makes tile-mode drawings work offline after the tiles have been
  // fetched at least once (either live via normal view, via FRT auto-prefetch
  // of L0-L2 on project open, or via Hub "Download for Offline" bulk action).
  // Manifests (*/tiles/*/manifest.json) are cached too but with a shorter
  // effective lifetime because network-win — we always try network first for
  // manifests so freshly rendered drawings pick up the latest tile pyramid.
  if (isTileRequest(url)) {
    var isManifest = url.pathname.indexOf('manifest.json') >= 0;
    if (isManifest) {
      // Network-first for manifest (small file, want freshness)
      e.respondWith(
        fetch(e.request).then(function(resp) {
          if (resp && resp.ok) {
            var clone = resp.clone();
            caches.open(TILE_CACHE).then(function(c) { c.put(e.request, clone); });
          }
          return resp;
        }).catch(function() {
          return caches.open(TILE_CACHE).then(function(c) { return c.match(e.request); })
            .then(function(cached) {
              return cached || new Response('{"offline":true}', {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              });
            });
        })
      );
    } else {
      // Cache-first for actual tile images
      e.respondWith(
        caches.open(TILE_CACHE).then(function(c) {
          return c.match(e.request).then(function(cached) {
            if (cached) return cached;
            return fetch(e.request).then(function(resp) {
              if (resp && resp.ok) {
                var clone = resp.clone();
                c.put(e.request, clone);
              }
              return resp;
            }).catch(function() {
              // Offline + tile not cached — return a 1x1 transparent PNG sentinel
              // so the <img> doesn't show a broken-image icon. The viewer can
              // detect this (via content-length or a custom header) and show a
              // "need signal at this zoom" message.
              return new Response(
                new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,8,153,99,248,207,192,0,0,0,2,0,1,226,33,188,51,0,0,0,0,73,69,78,68,174,66,96,130]),
                { status: 504, headers: { 'Content-Type': 'image/png', 'X-Offline-Sentinel': '1' } }
              );
            });
          });
        })
      );
    }
    return;
  }

  // Skip Supabase/R2/API requests — never cache these
  if (url.hostname.indexOf('supabase') >= 0 ||
      url.hostname.indexOf('workers.dev') >= 0 ||
      url.hostname.indexOf('cloudflare') >= 0 && url.pathname.indexOf('/photos/') >= 0) {
    return;
  }

  // CDN assets — cache-first (these are versioned and stable)
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(resp) {
          if (resp.ok) {
            var clone = resp.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
          }
          return resp;
        });
      })
    );
    return;
  }

  // Same-origin files — network-first (always get latest deploy, fallback to cache offline)
  if (url.hostname === self.location.hostname) {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        if (resp.ok) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        }
        return resp;
      }).catch(function() {
        /* S488 OFFLINE ROOT FIX (Mark's intermittent "sometimes offline works,
           sometimes it doesn't", pattern finally explained): tool URLs carry
           ?project=&instance=&pn=… — but this fallback matched by EXACT URL,
           and the precache stores the bare pathname. So offline navigation to
           any params URL the runtime cache hadn't seen VERBATIM missed, and the
           user got the 503 below despite a completed precache ("I saw the
           offline-available message"). His reconnect→load→disconnect→refresh
           ritual worked only because it runtime-cached that one exact URL.
           ignoreSearch matches the cached file regardless of params. */
        return caches.match(e.request, { ignoreSearch: true }).then(function(cached) {
          return cached || new Response('Offline — open FRT on Wi-Fi first to enable offline mode.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
    );
    return;
  }
});

























