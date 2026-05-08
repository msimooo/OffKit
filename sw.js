/* ═══════════════════════════════════════════════════════════════
   My Apps — Service Worker  (v3)
   Fixes:
   · 404 on home-screen launch  → network-first for HTML, with
     guaranteed cache fallback; also caches both "/" and "/index.html"
   · Update refresh not working → skipWaiting fires immediately on
     install; clients.claim() takes control of all pages at once
   · Blank iframe on return     → handled in index.html via
     visibilitychange + pageshow events
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'my-apps-v3';

/* Files to pre-cache on install */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json'
];

/* ── Install ─────────────────────────────────────────────────── */
self.addEventListener('install', function (e) {
  /* skipWaiting immediately — the new SW activates right away.
     index.html's controllerchange listener reloads the page for us. */
  self.skipWaiting();

  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* addAll is all-or-nothing; catch each individually so a single
         slow resource does not block the whole install.              */
      return Promise.allSettled(
        PRECACHE.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] pre-cache miss:', url, err);
          });
        })
      );
    })
  );
});

/* ── Activate ───────────────────────────────────────────────── */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) {
            console.log('[SW] removing old cache:', k);
            return caches.delete(k);
          })
      );
    }).then(function () {
      /* Take control of every open tab/window immediately */
      return self.clients.claim();
    })
  );
});

/* ── Message ─────────────────────────────────────────────────── */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── Fetch ───────────────────────────────────────────────────── */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  var url = new URL(e.request.url);

  /* Skip cross-origin requests (Google Fonts, CDNs etc) */
  if (url.origin !== self.location.origin) return;

  /* ── HTML: network-first so the user always gets the latest markup
     when online, but falls back to cache when offline.              */
  var isHTML = (e.request.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(function (response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(e.request, clone);
            /* Also cache under './' so the PWA start_url always resolves */
            cache.put('./', response.clone());
            cache.put('./index.html', response.clone());
          });
        }
        return response;
      }).catch(function () {
        /* Offline fallback */
        return caches.match('./index.html')
          .then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  /* ── Everything else: cache-first, populate cache on miss ─── */
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
        return caches.match('./index.html')
          .then(function (r) { return r || caches.match('./'); });
      });
    })
  );
});
