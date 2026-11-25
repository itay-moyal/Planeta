// Planeta service worker. A service worker is a small script the browser keeps and runs in the
// background, even when the page is closed. Ours only does two things: show a notification when
// the server pushes one, and open the app when the notification is tapped. It caches nothing.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  // Browsers (iOS especially) require every push to show a notification.
  event.waitUntil(
    self.registration.showNotification(data.title || 'Planeta', {
      body: data.body || '',
      lang: 'he',
      dir: 'rtl',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever open a page of our own app, whatever the payload says.
  let target = new URL('/', self.location.origin);
  try {
    const wanted = new URL(event.notification.data?.url || '/', self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch {
    // keep the home page
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          await w.focus();
          if ('navigate' in w) await w.navigate(target.href).catch(() => {});
          return undefined;
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
