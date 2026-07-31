const CACHE = 'reigns-atelier-v7';
const APP_SHELL = ['/', '/manifest.webmanifest', '/brand/reigns-app-icon-192.png', '/brand/reigns-app-icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Push events are deliberately handled here so the installed app can show
// alerts even while it is not open once the studio enables its web-push keys.
self.addEventListener('push', event => {
  const payload = event.data?.json?.() || {};
  const title = payload.title || 'Reigns Atelier';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'You have a new studio action to review.',
    icon: '/brand/reigns-app-icon-192.png',
    badge: '/brand/reigns-app-icon-192.png',
    data: { url: payload.url || '/admin?section=alerts' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/admin?section=alerts'));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const privatePaths = [
    '/api/', '/uploads/', '/admin', '/account', '/login', '/register',
    '/forgot-password', '/reset-password', '/accept-invite', '/verify-email',
  ];
  if (url.origin !== self.location.origin || url.search || privatePaths.some(path => url.pathname.startsWith(path))) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/')))
  );
});
