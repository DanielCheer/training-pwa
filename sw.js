/* DJ Training — offline cache.
   Gym reception is unreliable; the app must open with no network.
   Strategy: cache-first for the shell, network refresh in the background.
   BUMP `VERSION` on every deploy or clients keep serving the old shell. */

const VERSION = 'dj-train-v120'; // release history: CHANGELOG.md
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app/config.js',
  './app/diagrams.js',
  './app/schedule.js',
  './app/plan.js',
  './app/food.js',
  './app/sync.js',
  './app/main.js',
  './data/profile.js',
  './data/program.js',
  './data/overrides.js',
  './data/seed.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('shared-log.json')) return; // network-only, DJ's phone must see new entries the moment they're added
  if (e.request.url.includes('server-synced.json')) return; // network-only, same reason - stale synced-ids would cause pointless re-uploads
  if (e.request.url.includes('/videos/')) return; // saved reels: 30-100MB each, never cache - and range requests must hit the real server
  if (e.request.url.includes('autofill-state.json')) return;
  if (e.request.url.includes('draft-state.json')) return; // network-only: drafts appear the moment the PC writes them // network-only: the status strip must show the REAL last auto-fill run, never a cached one
  if (e.request.url.includes('/food-photos/')) return; // meal photos: network-only, never bloat the shell cache (thumbnails just hide offline)

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const live = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);

      return hit || live;
    })
  );
});
