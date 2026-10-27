// Offline support: keeps a copy of this page and its files on the device.
// Page: network first (falls back to the saved copy when offline or slow). Other files: saved copy first, refreshed in the background.
// GitHub API calls (sync) are never intercepted.
const CACHE = 'meiji-offline-v1';
const PRECACHE = ['./', 'manifest.json', 'icon.png'];
const PAGE = new URL('./', self.location).href;
const HOSTS = [self.location.origin, 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u =>
    fetch(new Request(u, { cache: 'reload' })).then(r => (r.ok || r.type === 'opaque') && c.put(u, r)).catch(() => {})
  ))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('meiji-offline-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function savePage(res) {
  if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(PAGE, copy)); }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!HOSTS.includes(url.origin)) return;
  if (url.searchParams.has('nc') || req.cache === 'no-store') return;   // update checks go straight to the network

  if (req.mode === 'navigate') {
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(PAGE).then(r => r || caches.match(req, { ignoreSearch: true }));
      const net = fetch(new Request(req.url, { cache: 'no-cache' })).then(savePage);   // always revalidate, so a new version shows up right after it is published
      const timer = setTimeout(() => fallback().then(r => { if (r && !done) { done = true; resolve(r); } }), 4000);
      net.then(r => { if (!done) { done = true; clearTimeout(timer); resolve(r); } })
        .catch(() => fallback().then(r => { if (!done) { done = true; clearTimeout(timer); resolve(r || Response.error()); } }));
    }));
    return;
  }

  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: url.origin === self.location.origin }).then(hit => {
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })));
});
