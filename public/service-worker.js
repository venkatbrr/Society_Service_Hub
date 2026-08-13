// Wooru — PWA Service Worker (v6)
// Provides offline caching for static assets and network-first strategy for navigation.

// Bump CACHE_NAME whenever a cached asset changes — the fetch handler is
// cache-first for images, so installed PWAs keep serving the old icons otherwise.
const CACHE_NAME = 'wooru-pwa-v6';

// `/app.html` is the SPA shell every app route rewrites to (see vercel.json).
// It is the offline fallback for in-app navigation; `/` and `/landing.html`
// serve the marketing page and are only correct for the root.
//
// v6 moved the shell off `/index.html` — the root is now the static landing
// page so Google's OAuth brand review can read it without JavaScript. A stale
// v5 cache would fall back to the marketing page for every app route, so this
// rename must ship with the CACHE_NAME bump above.
const APP_SHELL = '/app.html';
const STATIC_ASSETS = [
  APP_SHELL,
  '/landing.html',
  '/manifest.json',
  '/images/icon.png',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/icon-512-maskable.png',
  '/images/apple-touch-180.png',
  '/images/favicon.png',
  '/images/favicon-32.png',
  '/images/favicon-16.png',
];

// Install: pre-cache critical static assets
self.addEventListener('install', (event) => {
  // Deliberately NOT cache.addAll(): that is atomic, so a single 404 rejects the
  // whole install and the service worker never activates — one renamed asset
  // would silently disable offline support entirely. Cache each entry
  // independently and let stragglers fail.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[PWA] Could not pre-cache', asset, err);
          })
        )
      )
    )
  );
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch: network-first for navigation and API calls, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Supabase API calls and auth redirects — always go to network
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('accounts.google')
  ) {
    return;
  }

  // Never cache our own serverless endpoints. `/api/share-drop` is a same-origin
  // GET, so the hostname checks above do not catch it — without this it falls
  // into the cache-first branch below and its response (often a redirect into
  // the app) is replayed forever, since nothing evicts an entry until
  // CACHE_NAME changes.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for HTML pages / navigation
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Offline. Serve this URL if we have it, else boot the SPA shell and
          // let expo-router resolve the route client-side. Falling back to
          // /landing.html here dropped users onto the marketing page when they
          // pressed back or reloaded offline inside the app.
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            const isRoot = url.pathname === '/' || url.pathname === '/landing.html';
            return caches
              .match(isRoot ? '/landing.html' : APP_SHELL)
              .then((shell) => shell || new Response('Offline', { status: 503 }));
          });
        })
    );
    return;
  }

  // Cache-first for static assets (images, js, css, fonts)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      });
    })
  );
});
