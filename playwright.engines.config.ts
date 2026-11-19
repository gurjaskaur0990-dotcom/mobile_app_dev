import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  use: { ...base.use, channel: undefined },
  outputDir: 'test-results/engines',
  testMatch: ['**/ledger.spec.ts', '**/collaboration.spec.ts', '**/platform.spec.ts', '**/platform-cache.spec.ts'],
  projects: ['firefox', 'webkit'].map((browserName) => ({
    name: browserName,
    use: {
      browserName: browserName as 'firefox' | 'webkit',
      viewport: { width: 1280, height: 900 },
    },
  })),
})
