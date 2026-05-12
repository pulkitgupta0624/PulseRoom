const SHELL_CACHE = 'pulseroom-shell-v1';
const RUNTIME_CACHE = 'pulseroom-runtime-v1';
const APP_SHELL_URLS = ['/', '/manifest.webmanifest', '/pulseroom-mark.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (![SHELL_CACHE, RUNTIME_CACHE].includes(cacheName)) {
            return caches.delete(cacheName);
          }

          return Promise.resolve();
        })
      )
    ).then(() => self.clients.claim())
  );
});

const isAppRequest = (requestUrl) =>
  requestUrl.origin === self.location.origin &&
  !requestUrl.pathname.startsWith('/api/') &&
  !requestUrl.pathname.startsWith('/socket/');

const networkFirstNavigation = async (request) => {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    cache.put('/', response.clone());
    return response;
  } catch (_error) {
    const cachedShell = await cache.match('/');
    if (cachedShell) {
      return cachedShell;
    }

    throw _error;
  }
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (!isAppRequest(requestUrl)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(event.request.destination)) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
