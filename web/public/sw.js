/* Yuxa menyu service worker: zəif Wi-Fi və offline üçün. Admin (/admin, /api/admin) heç vaxt cache olunmur. */
const V = 'yx-v1';
const SHELL = `${V}-shell`, MEDIA = `${V}-media`, API = `${V}-api`;
const TIMEOUT = 3500;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    try {
      const r = await fetch('/', { cache: 'no-cache' });
      const html = await r.clone().text();
      await c.put('/', r);
      const assets = [...html.matchAll(/(?:src|href)="(\/(?:assets|fonts)\/[^"]+)"/g)].map((m) => m[1]);
      await c.addAll([...new Set([...assets, '/theme-boot.js', '/icon.svg', '/manifest.webmanifest',
        '/fonts/Onest-latin.woff2', '/fonts/Onest-latin-ext.woff2', '/fonts/Onest-cyrillic.woff2'])]);
      const m = await fetch('/api/menu', { cache: 'no-cache' });
      if (m.ok) await (await caches.open(API)).put('/api/menu', m);
    } catch { /* offline install: növbəti dəfə */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(V)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'warm' && Array.isArray(e.data.urls)) {
    e.waitUntil((async () => {
      const c = await caches.open(MEDIA);
      for (const u of e.data.urls.slice(0, 200)) {
        if (typeof u !== 'string' || !u.startsWith('/media/')) continue;
        if (await c.match(u)) continue;
        try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch { /* sonra */ }
      }
    })());
  }
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function networkFirst(req, cacheName, key) {
  const c = await caches.open(cacheName);
  try {
    const r = await withTimeout(fetch(req), TIMEOUT);
    if (r.ok) await c.put(key ?? req, r.clone());
    return r;
  } catch {
    const hit = await c.match(key ?? req);
    if (hit) {
      const h = new Headers(hit.headers); h.set('x-yx-cache', 'offline');
      return new Response(await hit.blob(), { status: 200, headers: h });
    }
    throw new Error('offline');
  }
}
async function cacheFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) await c.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/admin') || p.startsWith('/api/admin')) return;
  if (req.mode === 'navigate' && (p === '/' || p.startsWith('/m/'))) {
    e.respondWith(networkFirst(new Request('/'), SHELL, '/').catch(() => caches.match('/')));
    return;
  }
  if (p === '/api/menu') { e.respondWith(networkFirst(new Request('/api/menu'), API, '/api/menu')); return; }
  if (p.startsWith('/media/')) { e.respondWith(cacheFirst(req, MEDIA)); return; }
  if (p.startsWith('/assets/') || p.startsWith('/fonts/') || p === '/theme-boot.js' || p === '/icon.svg') {
    e.respondWith(cacheFirst(req, SHELL));
  }
});
