/* NUAD service worker (hand-written, no dependencies). Registered by src/main.jsx in production only.
 *
 * At build time the `nuad-sw` plugin in vite.config.js fills in the three placeholders below in
 * dist/sw.js: the build version, the version of the 3D data files, and the list of emitted files.
 *
 *   index.html / navigations   network first, cached copy when offline
 *   /assets/* (hashed)         cache first (precached at install)
 *   /anatomy/*, /models/*      cache first in a cache named after the data's content hash, so a new
 *                              build does not re-download the 4.7 MB anatomy unless the data changed
 *   Google Fonts               stale-while-revalidate
 *
 * Messages from the page: { type: 'WARM' } caches the 3D data in the background and answers
 * { type: 'OFFLINE_READY', fresh } when done; { type: 'SKIP_WAITING' } activates a waiting update.
 */
const VERSION = "c2268613df01";
const DATA_VERSION = "ec2e5f5c9cd8";
const PRECACHE = ["","assets/index-DI-RTKho.css","assets/Explore-_BkaRUnb.css","assets/LogPanel-SgBKQsyA.css","assets/LearnPanel-B0Nj2c10.css","assets/react-CN0hfnDr.js","assets/three-UBZdpALH.js","assets/meshopt-BZim_zmU.js","assets/index-DbRHFQ_Z.js","assets/Explore-CWN_vqwQ.js","assets/Guide-DinaXfDy.js","assets/safety-ClEbBh9c.js","assets/QuickSearch-P7tmZa8C.js","assets/rollers-BXzx_ExJ.js","assets/TodayPanel-D8DP-u0y.js","assets/LogPanel-BJZX_bUh.js","assets/LearnPanel-CW9PwVXS.js","assets/localize-CIzl5wHb.js","assets/injuries-D8-torrp.js","assets/FeedbackPanel-zOgyc7t9.js","assets/th-Duh066RT.js","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
// The 3D data the app needs to work offline.
const DATA_WARM = ['anatomy/bp3d.json', 'anatomy/bp3d.meshopt.json', 'anatomy/bp3d.meshopt.bin', 'models/holds.glb'];

const BASE = new URL('./', self.registration.scope).href; // respects Vite's BASE_URL (sw.js lives at the base)
const SHELL = `nuad-shell-${VERSION}`;
const DATA = `nuad-data-${DATA_VERSION}`;
const FONTS = 'nuad-fonts-v1';
const KEEP = [SHELL, DATA, FONTS];

const abs = (p) => new URL(p, BASE).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(PRECACHE.map(async (p) => {
      const url = abs(p);
      // Hashed files from an earlier version are reused instead of downloaded again.
      const old = /\/assets\//.test(url) ? await caches.match(url) : null;
      if (old) return cache.put(url, old);
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) await cache.put(url, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('nuad-') && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'WARM') {
    event.waitUntil((async () => {
      const cache = await caches.open(DATA);
      let fresh = false;
      for (const p of DATA_WARM) {
        const url = abs(p);
        if (await cache.match(url)) continue;
        try {
          const res = await fetch(url); // usually answered by the HTTP cache: the page fetched it already
          if (res.ok) { await cache.put(url, res); fresh = true; }
        } catch { /* offline: try again next visit */ }
      }
      const ok = (await Promise.all(DATA_WARM.map((p) => cache.match(abs(p))))).every(Boolean);
      event.source?.postMessage({ type: 'OFFLINE_READY', ok, fresh, version: VERSION });
    })());
  }
});

async function networkFirst(req, key, store) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok && store) cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(key)) || (await caches.match(key));
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (!url.href.startsWith(BASE)) return;
  const path = url.pathname.slice(new URL(BASE).pathname.length); // relative to the base
  if (req.mode === 'navigate' || path === '' || path === 'index.html') {
    event.respondWith(networkFirst(req, abs('./'), path === '' || path === 'index.html'));
  } else if (path.startsWith('assets/')) {
    event.respondWith(cacheFirst(req, SHELL));
  } else if (path.startsWith('anatomy/') || path.startsWith('models/')) {
    event.respondWith(cacheFirst(req, DATA));
  } else if (PRECACHE.includes(path)) {
    event.respondWith(cacheFirst(req, SHELL));
  }
});
