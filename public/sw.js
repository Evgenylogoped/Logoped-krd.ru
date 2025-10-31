const CACHE_NAME = 'logoped-cache-v9';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/favicon.svg',
  '/icons/favicon-16.png',
  '/icons/favicon-32.png',
  '/icons/apple-touch-icon-180.png',
  '/icons/safari-pinned-tab.svg',
  '/screens/hero-1.png',
  '/screens/hero-2.png',
  '/screens/hero-3.png',
  '/screens/hero-4.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// --- Web Push notifications ---
function isQuietHoursMoscow(nowUtcMs) {
  try {
    // Convert UTC -> Europe/Moscow (UTC+3)
    const ms = nowUtcMs + 3 * 60 * 60 * 1000
    const h = new Date(ms).getUTCHours() // already shifted by +3, so UTC hours here = MSK hours
    return (h >= 22 || h < 8)
  } catch { return false }
}

self.addEventListener('push', (event) => {
  const data = (() => {
    try { return event.data ? event.data.json() : {} } catch { return {} }
  })()
  const title = data.title || 'Logoped‑KRD'
  const body = data.body || 'У вас новое уведомление в Logoped‑KRD'
  const url = data.url || '/after-login'
  const tag = data.tag || 'logoped-krd'
  const icon = data.icon || '/icons/icon-512.png'
  const badge = data.badge || '/icons/icon-192.png'
  const requireInteraction = Boolean(data.requireInteraction)

  const quiet = isQuietHoursMoscow(Date.now())
  const options = {
    body,
    icon,
    badge,
    tag,
    data: { url },
    renotify: false,
    requireInteraction,
    silent: quiet || Boolean(data.silent),
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/'
  event.notification.close()
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      try {
        const c = client
        if ('focus' in c && c.url && c.url.includes(self.location.origin)) {
          await c.focus()
          if ('navigate' in c && url) { try { await c.navigate(url) } catch {} }
          return
        }
      } catch {}
    }
    if (self.clients && 'openWindow' in self.clients && url) {
      try { await self.clients.openWindow(url) } catch {}
    }
  })())
})

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

  // 2) Навигация (HTML) — сеть, при оффлайне отдаём оффлайн-страницу
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
