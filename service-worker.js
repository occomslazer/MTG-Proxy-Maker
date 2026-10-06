// Bump SHELL_CACHE when the precached file list changes. The app page itself is always
// fetched network-first, so normal releases reach users without a bump.
const SHELL_CACHE = 'mtg-proxy-shell-v2';
const API_CACHE = 'mtg-proxy-scryfall-api-v1';
const IMAGE_CACHE = 'mtg-proxy-scryfall-images-v1';
const KNOWN_CACHES = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];

// Oldest entries are dropped past these limits. Card PNGs are roughly 0.3–1.5 MB each.
const MAX_IMAGE_ENTRIES = 600;
const MAX_API_ENTRIES = 2000;

const APP_SHELL = [
  './MTG Proxy Maker.html',
  './manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache) {
      return cache.addAll(APP_SHELL.map(function(url) { return new Request(url, { cache: 'no-cache' }); }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return KNOWN_CACHES.indexOf(key) === -1; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

function trimCache(cacheName, maxEntries) {
  return caches.open(cacheName).then(function(cache) {
    return cache.keys().then(function(keys) {
      const excess = keys.length - maxEntries;
      if (excess <= 0) return;
      return Promise.all(keys.slice(0, excess).map(function(key) { return cache.delete(key); }));
    });
  });
}

function putInCache(cacheName, request, response, maxEntries) {
  return caches.open(cacheName)
    .then(function(cache) { return cache.put(request, response); })
    .then(function() { return maxEntries ? trimCache(cacheName, maxEntries) : undefined; })
    .catch(function(err) { console.warn('Service worker cache write failed', err); });
}

// Network first so a new release shows up on the next visit; cache when offline.
function networkFirst(event, cacheName, fetchRequest, maxEntries, matchOptions) {
  return fetch(fetchRequest).then(function(response) {
    if (response && response.ok) {
      event.waitUntil(putInCache(cacheName, event.request, response.clone(), maxEntries));
    }
    return response;
  }).catch(function(err) {
    return caches.open(cacheName)
      .then(function(cache) { return cache.match(event.request, matchOptions); })
      .then(function(cached) { if (cached) return cached; throw err; });
  });
}

// Scryfall image URLs are versioned (?timestamp), so a cached copy never goes stale.
// Only CORS responses are stored: opaque ones can't be checked and bloat storage quota.
function cacheFirstImage(event) {
  return caches.open(IMAGE_CACHE).then(function(cache) {
    return cache.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response && response.ok && response.type === 'cors') {
          event.waitUntil(putInCache(IMAGE_CACHE, event.request, response.clone(), MAX_IMAGE_ENTRIES));
        }
        return response;
      });
    });
  });
}

self.addEventListener('fetch', function(event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'cards.scryfall.io') {
    event.respondWith(cacheFirstImage(event));
    return;
  }

  if (url.hostname === 'api.scryfall.com') {
    event.respondWith(networkFirst(event, API_CACHE, request, MAX_API_ENTRIES));
    return;
  }

  if (url.origin === self.location.origin) {
    // Revalidate with the server (cheap ETag check) instead of trusting the HTTP cache.
    // Navigations must get redirects back unfollowed, or the browser rejects the response.
    const fresh = new Request(request.url, {
      cache: 'no-cache',
      credentials: 'same-origin',
      redirect: request.mode === 'navigate' ? 'manual' : 'follow'
    });
    event.respondWith(networkFirst(event, SHELL_CACHE, fresh, 0, { ignoreSearch: true }));
  }
});
