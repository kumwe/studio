import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const phpOrigin = 'http://127.0.0.1:4174';
const browserManifestPath = resolve(
  import.meta.dirname,
  '../../packages/studio-lit/dist/browser/studio-assets.json',
);

interface BrowserCspManifest {
  contentSecurityPolicy: {
    headerTemplate: string;
    inertConfigurationScript: {
      element: 'script';
      mediaType: 'application/json';
      requiresHash: false;
      requiresNonce: false;
    };
    styleNonce: { placeholder: string };
  };
}

test('the PHP archive host emits its published strict CSP for inert deployments', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as Window & { __studioCspViolations?: string[] };
    state.__studioCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      state.__studioCspViolations?.push(`${event.effectiveDirective}:${event.blockedURI}`);
    });
  });

  const manifest = JSON.parse(await readFile(browserManifestPath, 'utf8')) as BrowserCspManifest;
  expect(manifest.contentSecurityPolicy.inertConfigurationScript).toEqual({
    element: 'script',
    mediaType: 'application/json',
    requiresHash: false,
    requiresNonce: false,
  });

  const response = await page.goto(`${phpOrigin}/`);
  expect(response?.status()).toBe(200);
  const policy = response?.headers()['content-security-policy'];
  expect(policy).toBeDefined();
  const nonceMatch = /(?:^|; )style-src 'self' 'nonce-([^']+)'(?:; |$)/u.exec(policy ?? '');
  expect(nonceMatch).not.toBeNull();
  const nonce = nonceMatch?.[1];
  expect(nonce).toMatch(/^[A-Za-z0-9+/_-]{22,344}={0,2}$/u);
  expect(policy).toBe(
    manifest.contentSecurityPolicy.headerTemplate.replace(
      manifest.contentSecurityPolicy.styleNonce.placeholder,
      nonce ?? '',
    ),
  );
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("connect-src 'self'");
  expect(policy).not.toMatch(/'unsafe-(?:eval|inline)'|\*/u);

  await expect(page.locator('html')).toHaveAttribute('data-php-mount-ready', 'true');
  const configurations = page.locator('script[type="application/json"]');
  await expect(configurations).toHaveCount(8);
  expect(
    await configurations.evaluateAll((elements) =>
      elements.every((element) => !element.hasAttribute('nonce')),
    ),
  ).toBe(true);
  const trustedStyle = page.locator('style[nonce]');
  await expect(trustedStyle).toHaveCount(1);
  expect(await trustedStyle.evaluate((element) => (element as HTMLStyleElement).nonce)).toBe(nonce);
  expect(
    await page.evaluate(
      () => (window as Window & { __studioCspViolations?: string[] }).__studioCspViolations ?? [],
    ),
  ).toEqual([]);
});
