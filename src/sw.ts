import {
  PrecacheController,
  PrecacheRoute,
  cleanupOutdatedCaches,
} from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { emulator, liveLocalUrl, scopedName } from './platform/environment'
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}
if (liveLocalUrl(self.location.href)) {
  // A cached demo may be stuck before sign-in, where its update prompt never renders.
  self.addEventListener('install', (event) =>
    event.waitUntil(self.skipWaiting()),
  )
  self.addEventListener('activate', (event) =>
    event.waitUntil(retireDemoWorker()),
  )
} else {
  installAppWorker()
}

async function retireDemoWorker() {
  await self.clients.claim()
  const windows = await self.clients.matchAll({ type: 'window' })
  await Promise.allSettled(
    windows.map(async (client) => {
      const target = liveLocalUrl(client.url)
      if (target && client.frameType !== 'nested')
        await client.navigate(target.href)
    }),
  )
  // Future visits use the live entry point. Keep the old origin's saved drafts and queue intact.
  await self.registration.unregister()
}

function installAppWorker() {
  const precache = new PrecacheController({
    cacheName: emulator
      ? undefined
      : scopedName('shell:' + self.registration.scope),
  })
  precache.precache(self.__WB_MANIFEST)
  registerRoute(new PrecacheRoute(precache))
  // Only the original emulator cache uses Workbox's versioned default cache name.
  if (emulator) cleanupOutdatedCaches()
  registerRoute(
    new NavigationRoute(precache.createHandlerBoundToURL('/index.html')),
  )
  const pushCache = scopedName('splittrip-push-v1')
  const binding = '/__splittrip_current_push_binding'
  self.addEventListener('activate', (event) =>
    event.waitUntil(self.clients.claim()),
  )
  self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
    if (event.data?.type === scopedName('SPLITTRIP_PUSH_ACCOUNT'))
      event.waitUntil(
        (async () => {
          const cache = await caches.open(pushCache)
          if (typeof event.data.uid === 'string')
            await cache.put(binding, new Response(event.data.uid))
          else await cache.delete(binding)
        })(),
      )
  })
  // The existing Flutter backend sends notification.title/body and an optional data.tripId.
  function destination(id: unknown) {
    return typeof id === 'string' &&
      id.length <= 1500 &&
      /^[^/\\?#\s]+$/u.test(id) &&
      id !== '.' &&
      id !== '..'
      ? '/trip/' + encodeURIComponent(id)
      : '/notifications'
  }
  self.addEventListener('push', (event) => {
    event.waitUntil(
      (async () => {
        let message
        try {
          message = event.data?.json()
        } catch {
          return
        }
        if (!message) return
        const account = await (
          await (await caches.open(pushCache)).match(binding)
        )?.text()
        if (
          !account ||
          (message.data?.recipientId && message.data.recipientId !== account)
        )
          return
        await self.registration.showNotification('SplitTrip', {
          body: 'Open SplitTrip to view your notification.',
          icon: '/icons/icon-192.png',
          tag: message.fcmMessageId || message.data?.eventId,
          data: { tripId: message.data?.tripId, account },
        })
      })(),
    )
  })
  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    event.waitUntil(
      (async () => {
        const account = await (
          await (await caches.open(pushCache)).match(binding)
        )?.text()
        const data = event.notification.data
        const path =
          account && account === data?.account
            ? destination(data.tripId)
            : '/notifications'
        await self.clients.openWindow(new URL(path, self.location.origin).href)
      })(),
    )
  })
}
