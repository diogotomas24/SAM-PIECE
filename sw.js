// Service worker de SAM PIECE 3D: app disponible sin conexión.
// Al cambiar archivos de la app, sube CACHE para que los móviles descarguen la versión nueva.
const CACHE = 'sampiece-0.6.0';
const SHELL = ['/', '/index.html', '/app.js', '/fx.js', '/style.css', '/cards.json', '/manifest.webmanifest',
  '/icons/app-s-192.png', '/icons/app-s-512.png', '/icons/apple-touch-icon-s.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (url.origin === location.origin && url.pathname.startsWith('/audio/')) return; // audio: directo (admite saltos en la canción)
  const model = url.origin === location.origin && (url.pathname.startsWith('/models/') || url.pathname.startsWith('/images/') || url.pathname.startsWith('/assets/'));
  if (cdn || model) {
    // versionados o pesados: primero caché (los modelos se guardan al abrirlos por primera vez)
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin === location.origin) {
    // app: red primero para recibir cambios, caché si no hay conexión
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('/index.html'))));
  }
});
