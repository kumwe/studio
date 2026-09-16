import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');

/** The ordinary compiled mount; the fixture supplies no editor or renderer behavior. */
export async function openPublicStudio(page: Page): Promise<Locator> {
  const manifest = JSON.parse(
    await readFile(resolve(root, 'packages/studio-lit/dist/browser/studio-assets.json'), 'utf8'),
  ) as { module: { entryPoint: string } };
  const modulePath = resolve(root, 'packages/studio-lit/dist/browser', manifest.module.entryPoint);
  const policy = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'none'",
    "connect-src 'none'",
    "img-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types lit-html studio-renderer',
  ].join('; ');
  await page.route('**/canvas-workspace.html', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': policy },
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Studio authoring</title></head><body><main><div id="studio" data-kumwe-studio></div></main><script type="module" src="/canvas-mount.js"></script></body></html>`,
    }),
  );
  await page.route('**/canvas-module.js', (route) =>
    route.fulfill({ path: modulePath, contentType: 'text/javascript; charset=utf-8' }),
  );
  await page.route('**/canvas-mount.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript; charset=utf-8',
      body: `import {autoMountStudio} from '/canvas-module.js';
const report = await autoMountStudio();
if (report.failures.length) throw report.failures[0].error;
document.documentElement.dataset.studioReady = 'true';`,
    }),
  );
  await page.goto('/canvas-workspace.html');
  await expect(page.locator('html')).toHaveAttribute('data-studio-ready', 'true');
  const studio = page.locator('kumwe-studio-contextual');
  await expect(studio.locator('.local-canvas-region')).toHaveAttribute(
    'data-local-canvas-state',
    'current',
  );
  return studio;
}

/** Select a small-screen sheet through its visible control, never a hidden DOM mutation. */
export async function showWorkspacePane(studio: Locator, name: string): Promise<void> {
  const switcher = studio.getByRole('navigation', { name: 'Workspace panels' });
  if (await switcher.isVisible()) await switcher.getByRole('button', { name, exact: true }).click();
}
