import { defineConfig, devices } from '@playwright/test';

/**
 * The automated accessibility lane (roadmap M1-06). It drives the built
 * reference host and the PHP-authoritative compiled-browser fixture in
 * headless Chromium. The Vite preview holds the chrome to SR-019, SR-020, and
 * SR-025 plus the TH-013 CSP lane. The independent PHP built-in test server
 * emits inert configuration and serves the already-built browser module; it
 * does not introduce a production Node/PHP bridge. Run the lane with
 * `npm run check:a11y`, which builds the browser assets first; it is
 * intentionally not part of the browser-free `npm run check`.
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
  webServer: [
    {
      command:
        'npm run preview --workspace @kumwe/studio-reference-host -- --host 127.0.0.1 --port 4173 --strictPort',
      cwd: '..',
      reuseExistingServer: process.env.CI === undefined,
      url: 'http://127.0.0.1:4173',
    },
    {
      command: 'php -S 127.0.0.1:4174 e2e/php-authoring-host/router.php',
      cwd: '..',
      reuseExistingServer: process.env.CI === undefined,
      url: 'http://127.0.0.1:4174/health',
    },
  ],
});
