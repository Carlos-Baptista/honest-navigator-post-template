// Network first: online, the app always loads the latest files; offline (or on a very slow
// connection) it falls back to the cached copy. There is no version to bump here: the open page
// checks for a newer version by itself (see the "app-version" meta tag in index.html).
const CACHE_NAME = 'editor-capas';
const NETWORK_TIMEOUT_MS = 4000;   // after this, serve the cached copy instead of waiting

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './awesome-serif.ttf',
  './anybody.ttf',
  './icon-120.png',
  './icon-152.png',
  './icon-167.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  // 'reload' skips the browser's HTTP cache, so the first cached copy is never a stale one
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // also removes the old versioned caches ('editor-capas-v20' and earlier)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only same-origin GET requests; other origins (Google Fonts) go straight to the network.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  // 'no-cache': always check with the server, because GitHub Pages lets browsers reuse a file for 10 minutes.
  // If that option is refused for some reason, a plain fetch is the fallback.
  const network = fetch(req, { cache: 'no-cache' })
    .catch(() => fetch(req))
    .then((res) => {
      if (res.ok) cache.put(req, res.clone()).catch(() => {});   // e.g. partial (206) responses cannot be cached
      return res;
    });
  network.catch(() => {});   // avoids an unhandled rejection when the timeout wins the race
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res.status < 500) return res;
  } catch (err) { /* offline or too slow: use the cached copy below */ }
  const cached = (await cache.match(req, { ignoreSearch: true }))
    || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
  return cached || network;   // nothing cached: wait for the network
}
