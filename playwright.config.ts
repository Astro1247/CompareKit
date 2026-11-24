import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './test-results',
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    { name: 'Chromium', use: { browserName: 'chromium' } },
    { name: 'Firefox', use: { browserName: 'firefox' } }
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: '4173' },
    url: 'http://127.0.0.1:4173/healthz',
    reuseExistingServer: false
  }
})

