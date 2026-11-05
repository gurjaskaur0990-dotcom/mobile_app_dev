import { deleteApp } from 'firebase/app'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
})

it.each([
  ['production', 'splittrip-1879b', 'splittrip-1879b:'],
  ['emulator', 'demo-splittrip-flutter', ''],
])('routes Google popup callbacks to their Firebase iframe in %s', async (mode, projectId, storagePrefix) => {
  vi.stubEnv('MODE', mode)
  vi.resetModules()
  const { app } = await import('../src/platform/firebase')
  try {
    expect(app.options.projectId).toBe(projectId)
    const { apiKey } = app.options
    expect(apiKey).toBeTruthy()
    const iframe = new URLSearchParams({ apiKey: apiKey!, appName: app.name })
    // Firebase's hosted /__/auth/handler.js splits this key and uses only
    // the first two fields to locate the iframe in the popup's opener.
    const [callbackApiKey, callbackAppName] = (apiKey + ':' + app.name).split(':')
    expect(callbackApiKey).toBe(iframe.get('apiKey'))
    expect(callbackAppName).toBe(iframe.get('appName'))

    const { trustKey, queueLockName } = await import('../src/platform/storage')
    const { scopedName } = await import('../src/platform/environment')
    expect(trustKey('traveler')).toBe(storagePrefix + 'splittrip.flutter.trust.traveler')
    expect(queueLockName('traveler')).toBe(storagePrefix + 'splittrip.queue.traveler')
    expect(scopedName('splittrip.flutter.v1.traveler')).toBe(storagePrefix + 'splittrip.flutter.v1.traveler')
  } finally {
    await deleteApp(app)
  }
})
