import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/legacy*.emulator.test.ts'],
    fileParallelism: false,
    testTimeout: 45000,
    hookTimeout: 45000,
  },
})
