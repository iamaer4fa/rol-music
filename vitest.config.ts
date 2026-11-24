import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src-tauri/src/react/**/*.test.ts'],
  },
})
