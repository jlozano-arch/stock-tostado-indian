// ════════════════════════════════════════════════════
// Indian Ecotrade ERP — Service Worker
// Control Stock Café Tostado
// ════════════════════════════════════════════════════

const CACHE_NAME = 'indian-ecotrade-erp-v1';
const APP_SHELL  = 'indian-ecotrade-erp-v5.html';

// Recursos a cachear al instalar
const PRECACHE = [
  './',
  './indian-ecotrade-erp-v5.html',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
];

// ── Instalar: precachear el shell ──
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(e => console.warn('[SW] No se pudo cachear:', url, e.message))
        )
      );
    })
  );
});

// ── Activar: limpiar cachés viejas ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache First para el shell, Network First para Sheets API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Peticiones a Google Sheets API — siempre red, sin cachear
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ ok: false, error: 'Sin conexión a internet' }),
          { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Google Fonts — red primero, caché como fallback
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Chart.js y demás CDN — caché primero, red como fallback
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App Shell (el HTML principal) — caché primero
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('./indian-ecotrade-erp-v5.html'));
    })
  );
});

// ── Background sync (para enviar a Sheets cuando vuelva la conexión) ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-sheets') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: 'SYNC_REQUESTED' })
        );
      })
    );
  }
});

// ── Push notifications (base para futuras alertas de caducidad) ──
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Indian Ecotrade ERP', {
      body:  data.body  || 'Tienes alertas pendientes',
      icon:  data.icon  || './icon-192.png',
      badge: data.badge || './icon-72.png',
      data:  data.url   || '/',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});
