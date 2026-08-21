const CACHE = 'reigns-atelier-v13';
const CANONICAL_ORIGIN = 'https://reignsatelier.com';
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
  if (event.data?.type === 'SET_APP_BADGE') {
    const count = Math.max(0, Number(event.data.count) || 0);
    event.waitUntil(Promise.resolve(count
      ? self.registration.setAppBadge?.(count)
      : self.registration.clearAppBadge?.()));
  }
});

// Push events are deliberately handled here so the installed app can show
// alerts even while it is not open once the studio enables its web-push keys.
self.addEventListener('push', event => {
  const payload = event.data?.json?.() || {};
  const title = payload.title || 'Reigns Atelier';
  const badgeCount = Math.max(0, Number(payload.badgeCount) || 0);
  const incomingCall = Boolean(payload.callId);
  const canQuickReply = Boolean(payload.replyUrl) && !incomingCall;
  const notification = self.registration.showNotification(title, {
    body: payload.body || 'You have a new studio action to review.',
    icon: payload.icon || '/brand/reigns-app-icon-192.png',
    badge: '/brand/reigns-app-icon-192.png',
    image: payload.image || undefined,
    tag: payload.tag || 'reigns-atelier',
    renotify: true,
    requireInteraction: incomingCall,
    data: { url: payload.url || '/admin?section=alerts', replyUrl: payload.replyUrl || payload.url || '/messages', callId: payload.callId || '' },
    actions: incomingCall
      ? [{ action: 'answer', title: 'Answer' }, { action: 'dismiss', title: 'Dismiss' }]
      : canQuickReply
        ? [{ action: 'reply', title: 'Quick reply' }, { action: 'open', title: 'Open message' }]
        : [{ action: 'open', title: 'Open' }],
  });
  const badge = badgeCount
    ? self.registration.setAppBadge?.(badgeCount)
    : self.registration.clearAppBadge?.();
  event.waitUntil(Promise.all([notification, badge].filter(Boolean)));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const targetPath = event.action === 'reply'
    ? `${event.notification.data?.replyUrl || '/messages'}${String(event.notification.data?.replyUrl || '/messages').includes('?') ? '&' : '?'}compose=1`
    : event.notification.data?.url || '/messages';
  // iOS may omit action buttons, but tapping the notification still opens the
  // exact conversation. Use an absolute URL for reliable installed-PWA routing.
  const target = new URL(targetPath, CANONICAL_ORIGIN).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => new URL(client.url).origin === CANONICAL_ORIGIN);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  }));
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
