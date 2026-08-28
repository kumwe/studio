import { defineConfig, devices } from '@playwright/test';

/** Standalone public-delivery proof with no authoring or PHP web server. */
export default defineConfig({
  forbidOnly: process.env.CI !== undefined,
  fullyParallel: true,
  outputDir: '../.cache/playwright/public-runtime-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [['list']],
  retries: process.env.CI === undefined ? 0 : 2,
  testDir: './specs',
  testMatch: /public-enhancement-runtime\.spec\.ts/u,
  use: {
    headless: true,
    trace: 'on-first-retry',
  },
});
