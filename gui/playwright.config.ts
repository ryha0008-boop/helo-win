import { defineConfig } from '@playwright/test';

const slow = process.env.SLOW === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: slow ? 60000 : 30000,
  globalTimeout: slow ? 600000 : 300000,
  retries: 0,
  workers: 1,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      slowMo: slow ? 400 : 0,
    },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
