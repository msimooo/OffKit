/* ═══════════════════════════════════════════
   My Apps — Service Worker
   Enables PWA install + offline + auto-update
═══════════════════════════════════════════ */

const CACHE_NAME = 'my-apps-v2';

const PRECACHE = [
  './index.html',
  './manifest.json'
];

/* ── Install: cache core files ───────────── */
self.addEventListener('install', function (e) {
  /* Do NOT skipWaiting here — wait for the page to trigger it
     so we can show the "Update available" banner first.       */
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE);
    })
  );
});

/* ── Activate: clean up old caches ──────── */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ── Message: page asks SW to take over ─── */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── Fetch: cache-first, fallback network ─ */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
