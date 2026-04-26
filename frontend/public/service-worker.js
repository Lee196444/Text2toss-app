/* Text2Toss Service Worker — handles background push notifications */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Text2Toss', body: 'You have a new notification.' };
  if (event.data) {
    try { data = event.data.json(); } catch { data.body = event.data.text(); }
  }
  const url = data.url || '/admin';
  const options = {
    body: data.body,
    icon: '/text2toss-icon.png',
    badge: '/text2toss-icon.png',
    tag: data.tag || 't2t-push',
    data: { url },
    requireInteraction: false
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      for (const c of all) {
        if (c.url.includes(target) && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
      return null;
    })
  );
});
