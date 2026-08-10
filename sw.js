/* =====================================================================
   Meetings & Appointments Manager — service worker
   Saudi Friends Association (جمعية أصدقاء السعودية)

   Bump CACHE whenever you deploy a change to index.html, otherwise
   installed copies keep serving the old shell.
   ===================================================================== */

const CACHE = 'sfc-meetings-v5';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

/* Install: cache the shell, then take over immediately. */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // addAll fails the whole install if any single file 404s; add each
    // individually so a missing icon can't block the update.
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

/* Activate: drop older versions. */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Let the page trigger an immediate update. */
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

const isSupabase = url => /supabase\.(co|in)$/.test(url.hostname) || url.pathname.startsWith('/rest/v1');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache database traffic — stale records are worse than an error.
  if (isSupabase(url)) return;

  // Navigations: try the network so deploys land, fall back to the cached shell.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin assets: cache first, they only change on deploy.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) (await caches.open(CACHE)).put(req, fresh.clone());
        return fresh;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  // Cross-origin (the Cairo webfont): serve cached, refresh in the background.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(r => {
      if (r && (r.ok || r.type === 'opaque')) caches.open(CACHE).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
