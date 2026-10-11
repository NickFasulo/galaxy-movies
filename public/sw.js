// Push-only service worker — no fetch handler, so it never touches page loads
// or caching. Root scope comes free from living at /sw.js.
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Galaxy Movies', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'galaxy-alerts',
      data: { url: payload.url || '/watchlist' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/watchlist'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client && new URL(client.url).pathname === new URL(url, self.location.origin).pathname) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
