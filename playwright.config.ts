import { defineConfig } from '@playwright/test'
const channel = process.env.SPLITTRIP_SYSTEM_CHROME === '1' ? 'chrome' : undefined
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  timeout: 110_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    channel,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 960 } } },
    { name: 'phone', use: { viewport: { width: 360, height: 800 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
  ],
  webServer: {
    command: 'npm run preview:emulator',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: true,
  },
})
