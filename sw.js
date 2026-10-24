const CACHE_NAME = 'ram-sawit-shell-v3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './assets/logo-default.png', './assets/logo-icon.png', './assets/ram-sawit.ico'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.includes('/api/')) return;
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
    if (res.ok && (req.mode === 'navigate' || /\.(css|js|png|ico|webmanifest)$/.test(url.pathname))) {
      const copy = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
    }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
