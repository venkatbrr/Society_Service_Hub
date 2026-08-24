// Wooru — PWA Service Worker
//
// Caching contract, one line per resource class:
//
//   HTML / navigations   → network-first (4s timeout), cache is offline fallback
//   /_expo/static/*      → cache-first (content-hashed by Metro, immutable)
//   other same-origin    → stale-while-revalidate (icons, manifest.json, ...)
//   /api/*, Supabase,    → never touched, straight to network
//   every cross-origin
//
// The rule behind it: nothing that can change under a stable URL is served from
// cache without also being revalidated. The shell is the one that matters — it
// carries the <script src> for the hashed bundle, so a stale shell is a stale
// *entire app*, which is exactly how new features stop appearing after a deploy.
//
// CACHE_NAME is stamped at build time (see build-admin.js). Do NOT hand-bump it
// and do not hardcode a version here: the build derives it from the content of
// the shell and every precached asset, so a deploy that changes them
// invalidates the cache automatically, and one that does not keeps it warm.
const BUILD_ID = '__WOORU_BUILD_ID__';
const CACHE_NAME = 'wooru-pwa-' + (/^[0-9a-f]{8,}$/.test(BUILD_ID) ? BUILD_ID : 'dev');

// How long a navigation waits for the network before falling back to the cached
// shell. Long enough to win on a normal mobile connection, short enough that a
// dead connection does not feel like a hang.
const NETWORK_TIMEOUT_MS = 4000;

// `/app.html` is the SPA shell every app route rewrites to (see vercel.json).
// `/` and `/landing.html` serve the marketing page and are only correct for the
// root — falling back to it for an app route ejects users onto marketing.
const APP_SHELL = '/app.html';
const LANDING = '/landing.html';

const STATIC_ASSETS = [
  APP_SHELL,
  LANDING,
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

const noop = () => { };

// Install: pre-cache critical static assets.
self.addEventListener('install', (event) => {
  // Deliberately NOT cache.addAll(): that is atomic, so a single 404 rejects the
  // whole install and the service worker never activates — one renamed asset
  // would silently disable offline support entirely. Cache each entry
  // independently and let stragglers fail.
  //
  // `cache: 'reload'` bypasses the browser's own HTTP cache so a precache can
  // never be seeded from a stale copy the HTTP layer happened to be holding.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: 'reload' })).catch((err) => {
            console.warn('[PWA] Could not pre-cache', asset, err);
          })
        )
      )
    )
  );
  // Activate immediately without waiting for existing tabs to close.
  self.skipWaiting();
});

// Activate: drop every cache that is not this build's, and turn on navigation
// preload so a network-first navigation starts its request in parallel with the
// worker booting instead of after it.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(noop);
      }
      await self.clients.claim();
    })()
  );
});

// Lets a page ask a waiting worker to take over immediately. We already
// skipWaiting() on install, so this is a belt-and-braces path for any browser
// that still holds the new worker back.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network-timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ---------------------------------------------------------------------------
// Navigations — network-first.
// ---------------------------------------------------------------------------
function handleNavigation(event, shellUrl) {
  // Kicked off synchronously so the `event.waitUntil` below is still inside the
  // event dispatch — that is what keeps the worker alive long enough to finish
  // writing the refreshed shell even when we answered from cache.
  const network = (async () => {
    const preloaded = await event.preloadResponse;
    return preloaded || fetch(event.request);
  })();

  event.waitUntil(
    network
      .then((response) => {
        if (!response || !response.ok) return null;
        // Clone BEFORE any await. The same Response is handed to respondWith(),
        // and once the browser starts reading that body clone() throws — so an
        // `await caches.open()` here would race the refresh away silently.
        const copy = response.clone();
        return caches.open(CACHE_NAME).then((cache) => cache.put(shellUrl, copy));
      })
      .catch(noop)
  );

  return (async () => {
    try {
      const response = await withTimeout(network, NETWORK_TIMEOUT_MS);
      if (response) {
        // respondWith() throws on a response carrying the redirected flag, so a
        // followed server redirect (e.g. /network/* → /mcn/*, see vercel.json)
        // has to be handed back to the browser as a real redirect.
        if (response.redirected) return Response.redirect(response.url, 302);
        return response;
      }
    } catch (_) {
      // Offline, errored, or slower than NETWORK_TIMEOUT_MS — fall through.
    }

    const cache = await caches.open(CACHE_NAME);
    const cached = (await cache.match(shellUrl)) || (await cache.match(event.request));
    if (cached) return cached;

    // Nothing cached — a first visit, or a client whose cache was just evicted
    // by a new build. The timeout only exists to stop a slow network holding up
    // a shell we already have; with no fallback there is nothing to fall back
    // *to*, so wait the network out rather than showing an offline page to
    // someone who is merely on a bad connection.
    try {
      const response = await network;
      if (response) {
        if (response.redirected) return Response.redirect(response.url, 302);
        return response;
      }
    } catch (_) {
      // Genuinely unreachable.
    }
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })();
}

// ---------------------------------------------------------------------------
// Same-origin assets.
// ---------------------------------------------------------------------------

// Metro fingerprints everything under /_expo/static/ with a content hash, so a
// changed file always arrives under a new URL. Cache-first is safe there, and
// nowhere else.
const isImmutableAsset = (url) => url.pathname.startsWith('/_expo/static/');

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone()).catch(noop);
  }
  return response;
}

// Stale-while-revalidate for same-origin assets served from a stable URL —
// icons, manifest.json, anything under /images. The cached copy answers now and
// the refreshed copy is in place for the next load, so swapping an icon or
// editing the manifest no longer requires a cache-version bump.
function staleWhileRevalidate(event) {
  const { request } = event;
  let written = Promise.resolve();

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        // Clone before awaiting anything — see the note in handleNavigation.
        const copy = response.clone();
        written = caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => null);

  // Hold the worker open for the write, not just the fetch — otherwise the
  // browser is free to kill it the moment we answer from cache and the refresh
  // never reaches disk, which is the whole point of the strategy.
  event.waitUntil(network.then(() => written).catch(noop));

  return caches.match(request).then(
    (cached) =>
      cached ||
      network.then(
        (response) =>
          response ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      )
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only GETs are cacheable at all.
  if (request.method !== 'GET') return;

  // Anything that is not our own origin goes straight to the network: Supabase,
  // Google auth and fonts, and every remote image host. Caching a third-party
  // image under a stable URL is how an updated photo keeps rendering as the old
  // one.
  if (url.origin !== self.location.origin) return;

  // Our own serverless endpoints are API calls, not assets — `/api/share-drop`
  // is a same-origin GET that returns a redirect into the app, and replaying a
  // cached copy of that is never right.
  if (url.pathname.startsWith('/api/')) return;

  // The worker must never cache itself: a stale worker cannot be replaced.
  if (url.pathname === '/service-worker.js') return;

  const isNavigation =
    request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    const isRoot = url.pathname === '/' || url.pathname === LANDING;
    event.respondWith(handleNavigation(event, isRoot ? LANDING : APP_SHELL));
    return;
  }

  event.respondWith(isImmutableAsset(url) ? cacheFirst(request) : staleWhileRevalidate(event));
});

// Push: handle incoming web push notifications.
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

// Notification click: deep-link into the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/network';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => { });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
