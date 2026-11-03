export const emulator = import.meta.env.MODE === 'emulator'

// Firebase splits the Google popup's routing key on ':', so the app name can't contain it.
export const firebaseClientName = emulator ? 'splittrip-flutter-client' : 'splittrip-1879b-react'

// Existing emulator installations retain their local data. Live clients use a separate namespace.
export function scopedName(name: string) {
  return emulator ? name : 'splittrip-1879b:' + name
}

// Google sign-in on this project authorizes the named loopback host.
export function liveLocalUrl(href: string): URL | undefined {
  const url = new URL(href)
  if (emulator || url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
    return
  url.hostname = 'localhost'
  return url
}
