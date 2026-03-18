// ARENCON FRT Service Worker — enables full offline use
var CACHE_NAME = 'arencon-frt-v1';
var URLS_TO_CACHE = [
  './',
  './ARENCON_Field_Review_Tool.html',
  './ARENCON_Project_Hub.html',
  './arenconicon192.png',
  './arenconicon512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// Install: cache all critical files
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching app shell');
      return cache.addAll(URLS_TO_CACHE);
    }).then(function() {
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// Activate: clear old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim(); // Take control of all pages immediately
    })
  );
});

// Fetch: network-first for HTML (get latest version), cache-first for static assets
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Never cache API calls (Supabase, R2 worker)
  if (url.hostname.includes('supabase.co') || url.hostname.includes('workers.dev')) {
    return; // Let browser handle normally
  }

  // HTML files: network-first (try to get latest, fall back to cache)
  if (event.request.url.endsWith('.html') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function(response) {
        // Got fresh copy — update cache
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        // Offline — serve from cache
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('./ARENCON_Field_Review_Tool.html');
        });
      })
    );
    return;
  }

  // Everything else (JS, images, icons): cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache CDN resources for offline PDF rendering
        if (url.hostname === 'cdnjs.cloudflare.com') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
