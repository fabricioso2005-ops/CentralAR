// Service worker: guarda a "casca" do app para abrir rápido e funcionar como aplicativo instalado.
// Os dados (Supabase) sempre vêm da rede.
const CACHE = 'central-ar-v1';
const SHELL = ['./', './index.html', './styles.css', './app.js', './config.js', './vendor/supabase.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/logo.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // rede primeiro (pega atualizações), cache se estiver offline
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
