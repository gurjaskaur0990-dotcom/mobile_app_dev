import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging'
import type { AppSession } from '../platform/context'
import {
  native,
  getNativePushToken,
  onNativePushToken,
  unregisterLocalPush,
} from '../platform/native'
import { app, auth, vapidKey, emulator } from '../platform/firebase'
import { scopedName } from '../platform/environment'

const preferenceKey = scopedName('splittrip.nativePushEnabled')
let lastNativeToken = ''
const bindingKey = scopedName('splittrip.flutter.pushAccount')
export const pushChangeEvent = scopedName('splittrip-push-change')
type Command = AppSession['command']

export function pushAccount() {
  try {
    return localStorage.getItem(bindingKey)
  } catch {
    return null
  }
}
function notifyWorker(uid: string | null) {
  if ('serviceWorker' in navigator) {
    const message = { type: scopedName('SPLITTRIP_PUSH_ACCOUNT'), uid }
    navigator.serviceWorker.controller?.postMessage(message)
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.active?.postMessage(message))
      .catch(() => {})
  }
}
export function syncPushBinding(uid: string | null) {
  notifyWorker(uid !== null && pushAccount() === uid ? uid : null)
}
function bind(uid: string | null) {
  try {
    if (uid) localStorage.setItem(bindingKey, uid)
    else localStorage.removeItem(bindingKey)
  } catch {
    /* Browser storage can be disabled. */
  }
  notifyWorker(uid)
  window.dispatchEvent(new Event(pushChangeEvent))
}
export async function pushAvailable() {
  return (
    native || (!emulator && 'Notification' in window && (await isSupported().catch(() => false)))
  )
}
export async function enablePush(uid: string, command: Command) {
  if (native) {
    const token = await getNativePushToken()
    if (auth.currentUser?.uid !== uid) throw Error('This session has ended.')
    await command('push.register', { token }, { onlineOnly: true })
    lastNativeToken = token
    localStorage.setItem(preferenceKey, 'yes')
    bind(uid)
    return
  }
  if (!('Notification' in window)) throw Error('This browser does not support push.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted')
    throw Error('Push permission was not granted. Your inbox is still available.')
  if (!(await pushAvailable())) throw Error('Push is unavailable on this installation.')
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.active)
    throw Error('The app is still installing. Try again when the service worker is ready.')
  const token = await getToken(getMessaging(app), {
    ...(vapidKey ? { vapidKey } : {}),
    serviceWorkerRegistration: registration,
  })
  await command('push.register', { token }, { onlineOnly: true })
  bind(uid)
}
export function attachNativePush(uid: string, command: Command) {
  if (!native) return () => {}
  let active = true,
    registering = ''
  const sync = (token: string) => {
    if (
      !active ||
      !token ||
      auth.currentUser?.uid !== uid ||
      localStorage.getItem(preferenceKey) === 'no'
    )
      return
    if (registering === token || (lastNativeToken === token && pushAccount() === uid)) return
    registering = token
    void command('push.register', { token }, { onlineOnly: true })
      .then(() => {
        if (
          active &&
          auth.currentUser?.uid === uid &&
          localStorage.getItem(preferenceKey) !== 'no'
        ) {
          lastNativeToken = token
          bind(uid)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (registering === token) registering = ''
      })
  }
  const stop = onNativePushToken(sync)
  const refresh = () => {
    if (localStorage.getItem(preferenceKey) !== 'no' && navigator.onLine)
      void getNativePushToken()
        .then(sync)
        .catch((e: Error) => {
          if (active && e.message.includes('declined')) localStorage.setItem(preferenceKey, 'no')
        })
  }
  refresh()
  window.addEventListener('online', refresh)
  return () => {
    active = false
    stop()
    window.removeEventListener('online', refresh)
  }
}
export async function disablePush(command: Command) {
  if (native) localStorage.setItem(preferenceKey, 'no')
  await releasePush(command)
}
export async function releasePush(command: Command) {
  const owner = pushAccount()
  if (!owner || owner !== auth.currentUser?.uid) {
    notifyWorker(null)
    return
  }
  bind(null)
  if (native) {
    const token = lastNativeToken
    lastNativeToken = ''
    try {
      if (token && navigator.onLine)
        await command('push.unregister', { token }, { onlineOnly: true })
    } finally {
      await unregisterLocalPush()
    }
    return
  }
  if (!navigator.onLine || !(await pushAvailable())) return
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.active) return
  const messaging = getMessaging(app)
  const token = await getToken(messaging, {
    ...(vapidKey ? { vapidKey } : {}),
    serviceWorkerRegistration: registration,
  }).catch(() => '')
  try {
    if (token) await command('push.unregister', { token }, { onlineOnly: true })
  } finally {
    await deleteToken(messaging).catch(() => {})
  }
}
