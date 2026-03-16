// ARENCON Hub — Minimal Service Worker
// Purpose: PWA installability only. No caching — tools always load fresh from GitHub Pages.
// Version: 1.0

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

// No fetch handler — all requests go straight to network
