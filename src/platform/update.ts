import { Capacitor } from '@capacitor/core'
import { liveLocalUrl } from './environment'
import { useEffect, useState } from 'react'

let registration: ServiceWorkerRegistration | undefined
let ready = false
let reloadRequested = false
const observers = new Set<() => void>()
function notify() {
  ready = true
  for (const observer of observers) observer()
}

if (
  !Capacitor.isNativePlatform() &&
  !liveLocalUrl(location.href) &&
  import.meta.env.PROD &&
  'serviceWorker' in navigator
) {
  let controlled = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) {
      window.location.reload()
      return
    }
    if (controlled) notify()
    controlled = true
  })
  void navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      registration = reg
      if (reg.waiting && navigator.serviceWorker.controller) notify()
      const watch = () => {
        const worker = reg.installing
        worker?.addEventListener('statechange', () => {
          if (
            worker.state === 'installed' &&
            navigator.serviceWorker.controller
          )
            notify()
        })
      }
      reg.addEventListener('updatefound', watch)
      watch()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible')
          void reg.update().catch(() => {})
      })
    })
    .catch(() => {})
}
export function useUpdate() {
  const [available, setAvailable] = useState(ready)
  useEffect(() => {
    const listener = () => setAvailable(ready)
    observers.add(listener)
    listener()
    return () => {
      observers.delete(listener)
    }
  }, [])
  return {
    ready: available,
    activate() {
      reloadRequested = true
      if (registration?.waiting)
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      else window.location.reload()
    },
  }
}
