import { defineConfig } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT || '3000';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  outputDir: '../.test-artifacts/i18n/browser',
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `${process.env.PLAYWRIGHT_PRODUCTION ? 'npm run start' : 'npm run dev'} -- --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.PLAYWRIGHT_PRODUCTION,
    timeout: 90000,
  },
});
