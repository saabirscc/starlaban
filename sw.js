// Starlaban offline cache. Second visits load from the phone, not the network.
// - Hashed build files (/assets/*) never change: cache first, keep forever.
// - Brand images, posters and clips: cache first, refreshed in the background.
// - Pages: network first, falling back to the cached copy when offline.
// Videos are fetched with Range requests; those go straight to the network.

const VERSION = 'starlaban-v2';
const ASSETS = `${VERSION}-assets`;
const MEDIA = `${VERSION}-media`;
const PAGES = `${VERSION}-pages`;
// Path the site is served under ('/' locally, '/starlaban/' on GitHub Pages).
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [ASSETS, MEDIA, PAGES];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  let strategy = null;

  if (url.origin === location.origin && url.pathname.startsWith(BASE + 'assets/')) strategy = () => cacheFirst(req, ASSETS);
  else if (url.origin === location.origin && /^(brand|posters|clips)\//.test(url.pathname.slice(BASE.length)) && !/\.(mp4|webm)$/.test(url.pathname)) strategy = () => staleWhileRevalidate(req, MEDIA);
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') strategy = () => staleWhileRevalidate(req, MEDIA);
  else if (req.mode === 'navigate') strategy = () => networkFirst(req, PAGES);
  if (!strategy) return;

  // The cache must never break the page: on any error, fall back to a plain network request.
  event.respondWith(strategy().catch(() => fetch(req)).catch(() => fetch(req.url)));
});

// Only same-origin, complete, non-opaque responses go in the cache, and a failed write is ignored.
function store(cache, req, res) {
  if (res && res.ok && res.status === 200 && res.type !== 'opaque') cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  return store(cache, req, await fetch(req));
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => store(cache, req, res));
  if (hit) { fresh.catch(() => {}); return hit; }
  return fresh;
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    return store(cache, req, await fetch(req));
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
