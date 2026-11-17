// Обработчик Web Push, подключается в service worker через workbox.importScripts (vite.config.ts).
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'MUSE', body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'MUSE', {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.key,
    data: { url: data.url || '/' }
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
  url.searchParams.set('from', 'push')
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    for (const client of windows) {
      if ('focus' in client) { client.navigate(url.href); return client.focus() }
    }
    return self.clients.openWindow(url.href)
  }))
})
