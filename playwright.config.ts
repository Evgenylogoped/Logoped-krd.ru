import type { PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  testIgnore: [
    '**/.DS_Store',
    '**/._*', // AppleDouble resource fork files from macOS
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  testDir: 'tests/e2e',
  webServer: {
    command: process.env.E2E_START_CMD || 'npm run build && ENABLE_TEST_LOGIN=1 npm run start',
    port: 3000,
    timeout: 180_000,
    reuseExistingServer: false,
  },
}

export default config
