// Bildstudio offline: alle Dateien liegen nach dem ersten Aufruf im Cache
const CACHE = 'bildstudio-v3';
const FILES = ['./', 'index.html', 'gen.js', 'filters.js', 'ki.js', 'ki/clip-merges.txt', 'upscale.js',
  'vendor/tfjs/tf.min.js', 'ki/upscale/x2/model.json', 'ki/upscale/x2/group1-shard1of1.bin',
  'ki/upscale/x4/model.json', 'ki/upscale/x4/group1-shard1of1.bin', 'app.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bildstudio-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Netz zuerst (damit Updates ankommen), ohne Netz aus dem Cache
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match(e.request, { ignoreSearch: true })))
  );
});
