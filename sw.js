const CACHE = 'monitor-pwa-v01-1';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // No interceptamos Google OAuth/API.
  if (
    url.hostname.includes('google.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(response => {
          if (response && response.ok && url.origin === self.location.origin) {
            const copia = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copia));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
