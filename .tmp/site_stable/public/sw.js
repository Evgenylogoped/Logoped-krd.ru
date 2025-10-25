const CACHE_NAME = 'logoped-cache-v4';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1) Никогда не кэшируем next-чонки и манифесты бандлов — всегда сеть
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 2) Навигация (HTML) — всегда сеть, чтобы не ловить устаревшие HTML сессии
  const accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(
      fetch(req).catch(() => caches.match('/'))
    );
    return;
  }

  // 3) API — всегда сеть
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // 4) Для статики (иконки, изображения и т.п.) — cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(()=>{});
          return res;
        })
        .catch(() => caches.match('/'));
    })
  );
});
