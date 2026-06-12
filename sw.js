// ARENCON Field Review Tool — Service Worker
// Strategy: network-first for HTML/JS/CSS (always get latest), cache-first for CDN assets
var CACHE_NAME = 'arencon-frt-v762';
// S96 Fix #3: separate long-lived cache for drawing tiles. Survives app-cache
// bumps. Never purged on activate. Cleared explicitly by the Hub "Clear offline
// cache" action or on full site-data wipe.
var TILE_CACHE = 'arencon-frt-tiles-v1';

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
  './',
  'ARENCON_Field_Review_Tool.html',
  'ARENCON_Project_Hub.html',
  'index.html',
  // FRT v2 modular files
  'frt/index.html',
  'frt/css/frt.css',
  'frt/js/app.js',
  'frt/js/data/model.js',
  'frt/js/data/idb.js',
  'frt/js/data/sync.js',
  'frt/js/data/syncWorker.js',
  'frt/js/data/syncWorkerHost.js',
  'frt/js/data/merge.js',
  'frt/js/data/r2.js',
  'frt/js/data/uploadQueue.js',
  'frt/js/data/tileCache.js',
  'frt/js/data/hubBridge.js',
  // S220: presence.js is a static (blocking) import in app.js but was absent
  // from the precache list. Online use self-heals via runtime cache, but a
  // cold-offline first boot on a freshly-activated SW would 503 the import and
  // fail the module graph. Precaching closes that gap.
  'frt/js/data/presence.js',
  // S169 (Fix A foundation) — stub module, no behavior. Cached so devices
  // pick it up on next SW activate.
  'frt/js/data/photoOutbox.js',
  'frt/js/diag/memory.js',
  'frt/js/workers/imageWorker.js',
  'frt/js/workers/imageWorkerHost.js',
  'frt/js/ui/projectInfo.js',
  'frt/js/ui/deficiencies.js',
  'frt/js/ui/drawings.js',
  'frt/js/ui/photos.js',
  'frt/js/ui/cameraBurst.js',
  'frt/js/ui/pins.js',
  'frt/js/ui/pinsGL.js',
  'frt/js/ui/lightbox.js',
  'frt/js/ui/photoPicker.js',
  'frt/js/viewer/viewer.js',
  'frt/js/viewer/markup.js',
  'frt/js/viewer/markupEngine.js',
  'frt/js/viewer/webglMarkup.js',
  'frt/js/viewer/tiledPdf.js',
  'frt/js/export/pdf.js',
  'frt/js/export/json.js',
  'frt/js/export/exportview.js',
  'frt/js/shared/auth.js',
  'frt/js/shared/dialogs.js',
  'frt/js/shared/toast.js',
  'frt/js/ai/assistant.js',
  'frt/js/ai/usage.js',
  'frt/js/diag/recorder.js',
  'frt/js/diag/integrity.js',
  'frt/js/diag/drawingMigrate.js',
  'frt/js/diag/preflight.js'
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
        return caches.match(e.request).then(function(cached) {
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























