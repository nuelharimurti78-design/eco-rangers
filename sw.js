/**
 * Eco-Gotchi Service Worker (PWA Offline & Cache Engine)
 * Versi Cache: v1.5.0 (Admin QR Generator & Physical Sticker Feature)
 */

const CACHE_NAME = 'ecogotchi-v1.5.0';

// Asset inti yang di-cache saat instalasi service worker
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './wallet.js',
  './scanner.js',
  './qr-generator.js',
  './camera.js',
  './game.js',
  './manifest.json',
  './icons/favicon.svg',
  './icons/favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png'
];

// Event: Install - Pre-cache asset statis inti
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install Event: Mempersiapkan cache aset inti Fase 4+Admin...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching core assets...');
      return cache.addAll(CORE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Event: Activate - Membersihkan cache lama jika ada pembaruan versi
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate Event: Pembersihan cache lawas...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[ServiceWorker] Menghapus cache versi lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Event: Fetch - Strategi Stale-While-Revalidate / Cache-first dengan Network Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
