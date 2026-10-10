/* Service worker básico: red primero, caché como respaldo sin conexión. */
// Subir la versión al cambiar archivos de la app para que los celulares la renueven.
const CACHE = 'socoda-v6';
const ARCHIVOS = [
  'index.html',
  'styles.css',
  'app.js',
  'db.js',
  'manifest.json',
  'icon.svg',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'data/ferreterias.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // El API nunca se cachea: sus respuestas siempre deben venir del servidor.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
