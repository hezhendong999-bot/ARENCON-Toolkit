// ARENCON Field Review Tool — Service Worker
// Strategy: network-first for HTML (always get latest), cache-first for CDN assets
var CACHE_NAME = 'arencon-frt-v4';

// HTML files to precache on install
var HTML_FILES = [
  './',
  'ARENCON_Field_Review_Tool.html',
  'ARENCON_Project_Hub.html',
  'index.html'
];

// CDN assets to precache (pdf.js etc)
var CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// Install — precache HTML + CDN assets
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Precaching app shell');
      // Cache CDN assets (these rarely change)
      var cdnPromises = CDN_ASSETS.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('[SW] Failed to cache CDN asset:', url, err);
        });
      });
      // Cache HTML files
      var htmlPromises = HTML_FILES.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('[SW] Failed to cache HTML:', url, err);
        });
      });
      return Promise.all(cdnPromises.concat(htmlPromises));
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — clean up old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch strategy
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

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

  // HTML files — network-first (always get latest deploy, fallback to cache offline)
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
