import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
interface DevicePlugin {
  addListener(
    name: 'updateProgress',
    listener: (event: { percent?: number }) => void,
  ): Promise<PluginListenerHandle>
  configuration(): Promise<{ messaging: boolean }>
  googleSignIn(): Promise<{ idToken: string }>
  googleSignOut(): Promise<void>
  wallpaperColors(): Promise<{ accent?: string }>
  openUpdate(options: { url: string }): Promise<void>
  foregroundNotification(options: {
    title: string
    body: string
    messageId?: string
    tripId?: string
  }): Promise<void>
}
const device = registerPlugin<DevicePlugin>('SplitTripDevice')
export function onNativeUpdateProgress(fn: (percent: number | null) => void) {
  if (!native) return () => {}
  const handle = device.addListener('updateProgress', (event) => fn(event.percent ?? null))
  return () => {
    void handle.then((listener) => listener.remove())
  }
}
export const native = Capacitor.getPlatform() === 'android'
export const getNativeGoogleIdToken = async () => (await device.googleSignIn()).idToken
export const signOutNative = () => device.googleSignOut()
export const nativeAccent = async () => (await device.wallpaperColors()).accent
export const installAndroidRelease = (url: string) => device.openUpdate({ url })
export function onNativePushToken(fn: (token: string) => void) {
  if (!native) return () => {}
  const handles = [
    PushNotifications.addListener('registration', ({ value }) => fn(value)),
    PushNotifications.addListener('pushNotificationReceived', (message) => {
      if (!message.title && !message.body) return
      void device
        .foregroundNotification({
          title: message.title || 'SplitTrip',
          body: message.body || '',
          messageId: message.id,
          tripId: typeof message.data?.tripId === 'string' ? message.data.tripId : undefined,
        })
        .catch(() => {})
    }),
  ]
  return () => {
    for (const handle of handles) void handle.then((h) => h.remove())
  }
}
export async function getNativePushToken(): Promise<string> {
  if (!native) throw Error('Android notifications are unavailable in this browser.')
  if (!(await device.configuration()).messaging)
    throw Error(
      'Add the Firebase registration for the SplitTrip React Android app to enable device notifications.',
    )
  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') throw Error('Notification permission was declined.')
  return new Promise((resolve, reject) => {
    const handles: Promise<PluginListenerHandle>[] = []
    const finish = () => {
      clearTimeout(timer)
      for (const handle of handles) void handle.then((h) => h.remove())
    }
    const timer = setTimeout(() => {
      finish()
      reject(Error('Device registration timed out.'))
    }, 20000)
    handles.push(
      PushNotifications.addListener('registration', ({ value }) => {
        finish()
        resolve(value)
      }),
    )
    handles.push(
      PushNotifications.addListener('registrationError', ({ error }) => {
        finish()
        reject(Error(error))
      }),
    )
    void Promise.all(handles)
      .then(() => PushNotifications.register())
      .catch((e) => {
        finish()
        reject(e)
      })
  })
}
export async function unregisterLocalPush() {
  if (native && (await device.configuration()).messaging) await PushNotifications.unregister()
}
