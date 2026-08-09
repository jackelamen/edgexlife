/*
  Custom service worker (injectManifest strategy — see vite.config.js for
  why: generateSW's default Workbox worker has no room for a `push`
  listener, and a real "log your day" / "check in" nudge needs one).

  Precaching/offline behavior below is a straight port of the config the
  generateSW strategy used to build automatically (cleanupOutdatedCaches,
  skipWaiting, clientsClaim, navigateFallback to index.html, never touching
  supabase.co requests since vision images are handled entirely by the app's
  own imageCache.js, not Workbox).
*/
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api/],
}))

/* ── Push notifications ──────────────────────────────────────────
   Payload shape sent by the life-send-reminders edge function:
   { title, body, url, type }. Falls back to sane defaults if a push
   arrives with no body (some push services allow empty pushes as a
   liveness ping) so a malformed payload never throws inside the handler —
   an uncaught error here silently drops the notification with no way for
   the user to ever see it happened. */
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* non-JSON payload, use defaults */ }

  const title = data.title || 'EdgeX Life'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.type || 'life-reminder',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

/* Clicking the notification focuses an already-open tab on the target
   route if one exists, rather than always opening a new one — a PWA on
   a phone is usually already running in the background. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsList) {
      if (client.url.includes(url) && 'focus' in client) return client.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
