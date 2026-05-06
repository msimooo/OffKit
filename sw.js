/* ═══════════════════════════════════════════
   My Apps — Service Worker
   Enables PWA install + basic offline support
═══════════════════════════════════════════ */

const CACHE_NAME = 'my-apps-v1';

/* Files to cache on install */
const PRECACHE = [
  './my-apps1.html',
  './manifest.json'
];

/* Install — cache core files */
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE);
    })
  );
});

/* Activate — clean up old caches */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Fetch — serve from cache, fall back to network */
self.addEventListener('fetch', function (e) {
  /* Only handle GET requests */
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (response) {
        /* Cache successful same-origin responses */
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function () {
        /* Offline fallback — return cached index if available */
        return caches.match('./my-apps1.html');
      });
    })
  );
});
