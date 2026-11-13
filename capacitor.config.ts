import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.splittrip.react',
  appName: 'SplitTrip',
  webDir: process.env.SPLITTRIP_ANDROID_WEB_DIR || 'dist',
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
}
export default config
