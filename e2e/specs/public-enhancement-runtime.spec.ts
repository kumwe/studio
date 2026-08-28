import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  renderStudioWeb,
  type RendererWebVector,
  type StudioWebRenderResult,
} from '../../packages/renderer-web/src/index.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const vector = JSON.parse(
  await readFile(
    resolve(repositoryRoot, 'schemas/conformance/renderer-web/interactive-behaviors.json'),
    'utf8',
  ),
) as RendererWebVector;
const manifest = JSON.parse(
  await readFile(
    resolve(repositoryRoot, 'packages/studio-lit/dist/browser/studio-assets.json'),
    'utf8',
  ),
) as {
  assets: { integrity: string; path: string; role: string }[];
  enhancementRuntime: { contentSecurityPolicy: string; entryPoint: string };
};
const runtimeAssetCandidate = manifest.assets.find(({ role }) => role === 'enhancement-runtime');
if (runtimeAssetCandidate === undefined) {
  throw new Error('The built manifest does not contain a public enhancement runtime.');
}
if (
  runtimeAssetCandidate.path !== manifest.enhancementRuntime.entryPoint ||
  !/^assets\/studio-enhancements-[a-f0-9]{16}\.min\.js$/u.test(runtimeAssetCandidate.path)
) {
  throw new Error('The built manifest does not locate exactly one public enhancement runtime.');
}
const runtimeAsset = runtimeAssetCandidate;
const enhancementAssetName = basename(runtimeAsset.path);
const enhancementAssetPath = resolve(
  repositoryRoot,
  'packages/renderer-web/dist/browser/assets',
  enhancementAssetName,
);
const runtimePolicy =
  "default-src 'none'; script-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'";
if (manifest.enhancementRuntime.contentSecurityPolicy !== runtimePolicy) {
  throw new Error('The built enhancement runtime does not carry the frozen CSP contract.');
}
const policy = `${runtimePolicy}; img-src 'self'`;
const rendered = renderInteractiveVector(vector);
if (
  rendered.enhancements.map(({ kind }) => kind).join('\n') !==
  ['tabs', 'dialog', 'popover', 'notice', 'slideshow', 'lightbox', 'countdown', 'navigation'].join(
    '\n',
  )
) {
  throw new Error(
    'The interactive renderer vector no longer fixes the exact eight public families.',
  );
}

interface RecordedViolation {
  blockedURI: string;
  directive: string;
}

declare global {
  interface Window {
    __publicEnhancementViolations?: RecordedViolation[];
  }
}

test('the one prebuilt public runtime activates actual renderer output under strict CSP', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__publicEnhancementViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__publicEnhancementViolations?.push({
        blockedURI: event.blockedURI,
        directive: event.effectiveDirective,
      });
    });
    Element.prototype.scrollIntoView = function scrollIntoView(): void {
      this.setAttribute('data-scroll-into-view', 'true');
    };
  });
  await routePublicPage(page);

  const response = await page.goto('http://127.0.0.1:4173/public-enhancements.html');

  expect(response?.headers()['content-security-policy']).toBe(policy);
  await expect(page.locator(`script[src="/assets/${enhancementAssetName}"]`)).toHaveCount(2);
  await expect(page.locator('[data-studio-lightbox-dialog]')).toHaveCount(1);
  await expect(page.locator('[data-studio-tab-list]')).not.toHaveAttribute('hidden', '');
  await page.locator('[data-studio-tab="0"]').click();
  await expect(page.locator('[data-studio-tab="0"]')).toHaveAttribute('aria-selected', 'true');

  await page.locator('[data-studio-dialog-trigger]').click();
  await expect(page.locator('[data-studio-dialog]')).toHaveAttribute('open', '');
  await page.locator('[data-studio-dialog-close]').click();
  await expect(page.locator('[data-studio-dialog]')).not.toHaveAttribute('open', '');

  await page.locator('[data-studio-popover-trigger]').click();
  await expect(page.locator('[data-studio-popover]')).toHaveAttribute('open', '');
  await page.getByRole('heading', { name: 'Published page' }).click();
  await expect(page.locator('[data-studio-popover]')).not.toHaveAttribute('open', '');

  await page.locator('[data-studio-notice-dismiss]').click();
  await expect(page.locator('[data-studio-notice]')).toBeHidden();

  await page.locator('[data-studio-slide-next]').click();
  await expect(page.locator('[data-studio-slide="0"]')).toHaveAttribute(
    'data-scroll-into-view',
    'true',
  );

  await page.locator('[data-studio-lightbox-open]').click();
  await expect(page.locator('[data-studio-lightbox-dialog]')).toHaveAttribute('open', '');
  await page.locator('[data-studio-lightbox-dialog] button', { hasText: 'Close' }).click();
  await expect(page.locator('[data-studio-lightbox-dialog]')).not.toHaveAttribute('open', '');

  await expect(page.locator('[data-studio-countdown-value]')).toHaveText(/^\d+:/u);

  await page.locator('[data-studio-navigation-toggle]').click();
  await expect(page.locator('[data-studio-navigation-children]')).not.toHaveAttribute('hidden', '');
  await page.locator('[data-studio-navigation-item]').first().press('Escape');
  await expect(page.locator('[data-studio-navigation-children]')).toHaveAttribute('hidden', '');

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__publicEnhancementViolations)).toEqual([]);
});

test('actual server-rendered fallbacks remain complete with JavaScript disabled', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await routePublicPage(page);
  try {
    await page.goto('http://127.0.0.1:4173/public-enhancements.html');

    await expect(page.locator('[data-studio-tab-list]')).toHaveAttribute('hidden', '');
    await expect(page.locator('[data-studio-tab-panel]')).toBeVisible();
    await expect(page.locator('[data-studio-notice]')).toBeVisible();
    await expect(page.locator('[data-studio-slide]')).toBeVisible();
    await expect(page.locator('[data-studio-lightbox-open] img')).toBeVisible();
    await expect(page.locator('[data-studio-navigation-children]')).not.toHaveAttribute(
      'hidden',
      '',
    );
    await expect(page.locator('[data-studio-countdown-value]')).toHaveText(
      '2099-01-01T00:00:00.000Z',
    );
    await page.locator('[data-studio-dialog-trigger]').click();
    await expect(page.locator('[data-studio-dialog]')).toHaveAttribute('open', '');
    await page.locator('[data-studio-popover-trigger]').click();
    await expect(page.locator('[data-studio-popover]')).toHaveAttribute('open', '');
  } finally {
    await context.close();
  }
});

function renderInteractiveVector(input: RendererWebVector): StudioWebRenderResult {
  const bindings = new Map(
    input.bindings.map(({ nodeId, port, value }) => [`${nodeId}\u0000${port}`, value]),
  );
  const media = new Map(
    input.media.map((item) => [item.assetId, { ...item, src: '/public-enhancement-slide.gif' }]),
  );
  return renderStudioWeb(
    { roots: input.roots },
    {
      resolveBinding: (node, port) => bindings.get(`${node.id}\u0000${port}`),
      resolveMedia: (reference) => {
        const result = media.get(reference.assetId);
        if (result === undefined) throw new Error(`Missing vector media ${reference.assetId}.`);
        return result;
      },
    },
  );
}

async function routePublicPage(page: Page): Promise<void> {
  await page.route('**/public-enhancements.html', async (route) => {
    await route.fulfill({
      body: publicDocument(),
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': policy },
    });
  });
  await page.route(`**/assets/${enhancementAssetName}`, async (route) => {
    await route.fulfill({
      path: enhancementAssetPath,
      contentType: 'text/javascript; charset=utf-8',
    });
  });
  await page.route('**/public-enhancement-slide.gif', async (route) => {
    await route.fulfill({
      body: Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64'),
      contentType: 'image/gif',
    });
  });
}

function publicDocument(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Public enhancement runtime</title><script src="/assets/${enhancementAssetName}" integrity="${runtimeAsset.integrity}" crossorigin="anonymous" defer></script><script src="/assets/${enhancementAssetName}" integrity="${runtimeAsset.integrity}" crossorigin="anonymous" defer></script></head>
<body><h1>Published page</h1>${rendered.html}</body></html>`;
}
