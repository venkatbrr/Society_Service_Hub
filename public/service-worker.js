// Wooru — PWA Service Worker (v12)
// Provides offline caching for static assets, and serves app-shell navigations
// from cache while revalidating in the background.

// Bump CACHE_NAME whenever a cached asset changes — the fetch handler is
// cache-first for images, so installed PWAs keep serving the old icons otherwise.
//
// v7: manifest.json changed (start_url moved off `/`, which is the marketing
// page, onto `/network`; explicit id and scope added). manifest.json is in
// STATIC_ASSETS below, so without this bump an already-installed client would
// keep the old manifest and keep launching into the landing page.
// v8: landing.html's Install app button gained a reduced-motion fallback.
// v9: landing.html gained the iOS "Add to Home Screen" nudge (#wn-ios-install).
// landing.html is in STATIC_ASSETS below and is precached, so without this
// bump an already-installed client keeps serving the old page and never sees it.
// v10: app-shell navigations moved from network-first to stale-while-revalidate
// (see the fetch handler) — installed clients must pick up the new strategy.
// v11: added push and notificationclick event listeners for Web Push notifications.
// v12: notification `badge` moved off /images/icon-192.png. Android masks the
// status-bar badge by its ALPHA channel, and icon-192 is a full-bleed opaque
// square — so it rendered as a solid white block. /images/notification-badge.png
// is a transparent arch silhouette. It is precached below, so this bump is what
// makes installed clients actually fetch it.
const CACHE_NAME = 'wooru-pwa-v12';


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
  '/images/notification-badge.png',
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

  // Stale-while-revalidate for HTML pages / navigation.
  //
  // This was network-first, which meant every single launch of the installed
  // app — including a cold launch on a slow mobile connection — blocked on a
  // round trip for the shell before the browser could even discover the script
  // tag and start fetching the (already cached) bundle. The shell is a tiny,
  // near-static file; serving the cached copy immediately and refreshing it in
  // the background makes launch feel instant.
  //
  // The trade: a deploy reaches an installed client on its *next* launch rather
  // than the current one. That is the standard PWA bargain, and the long
  // pull-to-refresh (HARD_RELOAD_THRESHOLD in components/useWebPullToRefresh.ts)
  // is still there for a user who wants the new build right now.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    const isRoot = url.pathname === '/' || url.pathname === '/landing.html';
    const shellUrl = isRoot ? '/landing.html' : APP_SHELL;

    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cachedResponse) => {
          const networkFetch = fetch(request)
            .then((response) => {
              // put() is fire-and-forget but must not reject unhandled — a
              // rejected put inside a waitUntil chain fails the whole extend.
              if (response.ok) cache.put(request, response.clone()).catch(() => { });
              return response;
            })
            .catch(() => null);

          if (cachedResponse) {
            // Refresh behind the response we are about to hand back.
            event.waitUntil(networkFetch);
            return cachedResponse;
          }

          // Nothing cached for this URL yet — wait for the network, and fall
          // back to the precached shell so expo-router can resolve the route
          // client-side. Falling back to /landing.html for an app route drops
          // users onto the marketing page, so only the root does that.
          return networkFetch.then(
            (response) =>
              response ||
              cache
                .match(shellUrl)
                .then((shell) => shell || new Response('Offline', { status: 503 }))
          );
        })
      )
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

// Push: handle incoming web push notifications
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {};
  }

  const title = payload.title || 'Wooru';
  const options = {
    body: payload.body || '',
    // `icon` is the large art in the expanded notification — the full-colour
    // app icon is correct there. `badge` is the small status-bar glyph, which
    // Android masks by alpha, so it MUST be a transparent silhouette.
    icon: '/images/icon-192.png',
    badge: '/images/notification-badge.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/network' },
  };

  // userVisibleOnly:true means we MUST show something for every push, or
  // Chrome will eventually revoke the subscription.
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: deep-link into the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/network';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

