import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/perf',
  testMatch: '**/*.spec.ts',
  timeout: 240_000,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/performance',
  use: {
    baseURL: 'http://127.0.0.1:4199',
    browserName: 'chromium',
    channel: process.env.SPLITTRIP_SYSTEM_CHROME === '1' ? 'chrome' : undefined,
  },
  webServer: {
    command: 'npm run dev -- --mode emulator --host 127.0.0.1 --port 4199 --strictPort',
    url: 'http://127.0.0.1:4199/tests/perf/client.html',
    reuseExistingServer: false,
  },
})
