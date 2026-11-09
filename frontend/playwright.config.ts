import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  outputDir: '../.test-artifacts/i18n/browser',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.env.PLAYWRIGHT_PRODUCTION ? 'npm run start' : 'npm run dev',
    url: 'http://127.0.0.1:3000/login',
    reuseExistingServer: true,
    timeout: 90000,
  },
});
