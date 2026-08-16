import { defineConfig, devices } from '@playwright/test';

/**
 * The automated accessibility lane (roadmap M1-06). It drives the built
 * reference host — the Vite app mounting the <kumwe-studio> shell with a demo
 * session — in headless Chromium and holds the chrome to SR-019, SR-020, and
 * SR-025, plus the TH-013 CSP lane: the preview server serves the pinned
 * Content-Security-Policy from examples/reference-host/vite.config.ts, so
 * every spec here runs under it. Run the lane with `npm run check:a11y`,
 * which builds the reference host first; it is intentionally not part of the
 * browser-free `npm run check`.
 */
export default defineConfig({
  forbidOnly: process.env.CI !== undefined,
  fullyParallel: true,
  // Generated output lands in .cache/, which the repository already excludes
  // from version control and formatting.
  outputDir: '../.cache/playwright/test-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.cache/playwright/report' }]],
  retries: process.env.CI === undefined ? 0 : 2,
  testDir: './specs',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command:
      'npm run preview --workspace @kumwe/studio-reference-host -- --host 127.0.0.1 --port 4173 --strictPort',
    cwd: '..',
    reuseExistingServer: process.env.CI === undefined,
    url: 'http://127.0.0.1:4173',
  },
});
