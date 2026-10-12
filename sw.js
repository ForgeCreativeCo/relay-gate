/* The service worker for the installed game (a PWA): once you've played online, it starts without a connection.
   The game's own files always come fresh from the network when there is one, so an update is picked up on the next load, and a copy
   is kept for when there isn't. The 3D engine and the fonts come from CDNs at fixed versions, so the kept copy is used first. */
const CACHE = 'relay-gate';
/* fetched as soon as it's installed, so it can start offline straight away; the sound effects are kept as the game loads them */
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  ...['actors', 'audio', 'combat', 'core', 'fx', 'game', 'gate', 'geo', 'input', 'look', 'loot', 'machines', 'main', 'nav', 'region1', 'region2', 'save', 'survival', 'tex', 'ui'].map(f => `js/${f}.js`),
  'https://cdn.jsdelivr.net/npm/babylonjs@7.31.0/babylon.js'];
const PINNED = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));   // one missing file doesn't stop the rest
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/* keep a copy of whole files only (a partial one, status 206, can't be stored) */
const keep = (req, res) => { if (res && (res.status === 200 || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* The game's files: the network first, the kept copy offline (any ?region=2 on the page is ignored when looking it up). Always checked
     with the server (GitHub Pages tells browsers to reuse files for ten minutes, which held back updates); unchanged files cost a tiny reply.
     A page load can't be re-sent with different settings, so it is asked for afresh by its address. */
  if (url.origin === location.origin) {
    const fresh = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' });
    e.respondWith(fetch(fresh).then(res => keep(req, res)).catch(() => caches.match(req, { ignoreSearch: true })));
  }
  /* the engine and the fonts: the kept copy first */
  else if (PINNED.test(req.url)) e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => keep(req, res))));
});
