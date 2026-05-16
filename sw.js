/* ═══════════════════════════════════════════════════════════════
   My Apps — Service Worker  (v5)
   Fixes:
   · v4 response cloning bug   → .clone() called on response AFTER
     it was returned to the browser (body already consumed), so the
     fallback cache entries ('./', './index.html') were never stored.
     Now clones are created synchronously before the async cache.open.
   · v4 fix list (still applies):
     · 404 on home-screen launch  → network-first for HTML
     · Update refresh not working → skipWaiting + clients.claim()
     · Blank iframe on return     → improved fetch error handling
     · Iframe switching issue     → proper cache matching for GET
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'my-apps-v5';

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
     when online, but falls back to cache when offline. This includes
     all HTML requests (main page, iframes, sub-pages, etc).          */
  var isHTML = (e.request.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(function (response) {
        if (response && response.status === 200) {
          /* Clone all responses BEFORE the async cache.open, because
             the original response body gets consumed by the browser
             once we return it in respondWith. Calling .clone() on a
             consumed response throws. */
          var reqClone = response.clone();
          var rootClone = response.clone();
          var idxClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(e.request, reqClone);
            /* Also cache under './' and './index.html' for redundancy */
            cache.put('./', rootClone);
            cache.put('./index.html', idxClone);
          });
        }
        return response;
      }).catch(function (err) {
        /* Offline: try exact match first, then fallback chain */
        console.log('[SW] HTML fetch failed, trying cache for:', e.request.url);
        return caches.match(e.request)
          .then(function (r) {
            if (r) return r;
            /* Fallback to index.html, then to ./ */
            return caches.match('./index.html');
          })
          .then(function (r) {
            if (r) return r;
            return caches.match('./');
          });
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
      }).catch(function (err) {
        console.log('[SW] Asset fetch failed, no cache:', e.request.url);
        /* No cache and offline: return index.html as last resort */
        return caches.match('./index.html')
          .then(function (r) { return r || caches.match('./'); });
      });
    })
  );
});
