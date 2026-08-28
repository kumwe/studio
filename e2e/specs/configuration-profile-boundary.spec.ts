import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import {
  STUDIO_CONTRACT_VERSION,
  type StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const browserModule = resolve(
  repositoryRoot,
  'packages',
  'studio-lit',
  'dist',
  'browser',
  'studio-browser.js',
);
const hostedFixture = JSON.parse(
  await readFile(
    resolve(repositoryRoot, 'schemas/examples/studio-deployment.hosted.example.json'),
    'utf8',
  ),
) as StudioHostedDeploymentConfiguration;
const browserRelease = (
  JSON.parse(
    await readFile(
      resolve(repositoryRoot, 'packages/studio-lit/dist/browser/studio-assets.json'),
      'utf8',
    ),
  ) as { release: { corpusManifestDigest: string; version: string } }
).release;
const policy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'none'",
  "connect-src 'self'",
  "img-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types lit-html studio-renderer',
].join('; ');

test('keeps local defaults isolated from an exact configured host refusal', async ({ page }) => {
  const requestPaths: string[] = [];
  const hostRequests: {
    headers: Record<string, string>;
    method: string;
    path: string;
    postData: string | null;
  }[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    requestPaths.push(path);
    if (path === '/host/ports/authoring/resolve-target') {
      hostRequests.push({
        headers: request.headers(),
        method: request.method(),
        path,
        postData: request.postData(),
      });
    }
  });

  await page.route('**/configuration-profile-boundary.html', async (route) => {
    await route.fulfill({
      body: testDocument(configuredHostedDeployment()),
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': policy },
    });
  });
  await page.route('**/configuration-profile-boundary-harness.js', async (route) => {
    await route.fulfill({
      body: harnessModule(),
      contentType: 'text/javascript; charset=utf-8',
    });
  });
  await page.route('**/configuration-profile-boundary-studio.js', async (route) => {
    await route.fulfill({ path: browserModule, contentType: 'text/javascript; charset=utf-8' });
  });
  await page.route('**/host/ports/authoring/resolve-target', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        category: 'forbidden',
        contractVersion: STUDIO_CONTRACT_VERSION,
        kind: 'host-error',
        message: {
          defaultMessage: 'The configured host refused this mount.',
          key: 'studio.test/configured-host-refused',
        },
        retryable: false,
      }),
      contentType: 'application/json; charset=utf-8',
      status: 403,
    });
  });

  const response = await page.goto('http://127.0.0.1:4173/configuration-profile-boundary.html');
  expect(response?.headers()['content-security-policy']).toBe(policy);
  await expect(page.locator('html')).toHaveAttribute('data-mount-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-mount-success-count', '1');
  await expect(page.locator('html')).toHaveAttribute(
    'data-mount-failures',
    'runtime:configured-hosted',
  );

  const local = page.locator('#local > kumwe-studio-standalone');
  await expect(local).toHaveCount(1);
  await expect(local.getByRole('heading', { name: 'Local Studio workspace' })).toBeVisible();
  await expect(page.locator('#hosted > kumwe-studio-contextual')).toHaveCount(0);
  await expect(page.locator('#hosted > kumwe-studio-standalone')).toHaveCount(0);
  await expect(page.locator('#hosted [role="alert"]')).toHaveText(
    'The configured host refused this mount.',
  );

  expect(hostRequests).toHaveLength(1);
  expect(hostRequests[0]).toMatchObject({
    method: 'POST',
    path: '/host/ports/authoring/resolve-target',
  });
  expect(hostRequests[0]?.headers.accept).toBe('application/json');
  expect(hostRequests[0]?.headers['content-type']).toBe('application/json');
  expect(hostRequests[0]?.headers['x-studio-csrf-profile-boundary']).toBe('private');
  expect(JSON.parse(hostRequests[0]?.postData ?? '{}')).toMatchObject({
    arguments: {
      request: {
        resourceContext: { key: 'contexts/example-page' },
        targetId: 'org.example.authoring/page',
      },
    },
  });

  await local
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section', exact: true })
    .click();
  await expect.poll(() => standaloneRootCount(local)).toBe(1);
  expect(hostRequests).toHaveLength(1);
  expect([...new Set(requestPaths)].sort()).toEqual(
    [
      '/configuration-profile-boundary-harness.js',
      '/configuration-profile-boundary-studio.js',
      '/configuration-profile-boundary.html',
      '/host/ports/authoring/resolve-target',
    ].sort(),
  );

  await page.getByRole('button', { name: 'Dispose local' }).click();
  await expect(local).toHaveCount(0);
  await expect(page.locator('#hosted > kumwe-studio-standalone')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

function configuredHostedDeployment(): StudioHostedDeploymentConfiguration {
  const configuration = structuredClone(hostedFixture);
  configuration.instanceId = 'configured-hosted';
  configuration.mount = '#hosted';
  configuration.release = browserRelease;
  configuration.transport = {
    ...configuration.transport,
    authentication: {
      credentials: 'same-origin',
      csrf: { headerName: 'X-Studio-CSRF-Profile-Boundary', token: 'private' },
      kind: 'same-origin-session',
    },
    routing: {
      endpoints: {
        'authoring/resolve-target': '/host/ports/authoring/resolve-target',
        'authoring/start': '/host/ports/authoring/start',
      },
      kind: 'operation-map',
    },
  };
  return configuration;
}

function testDocument(configuration: StudioHostedDeploymentConfiguration): string {
  const serialized = JSON.stringify(configuration).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Studio profile boundary test</title></head>
  <body>
    <main>
      <section aria-labelledby="local-heading">
        <h1 id="local-heading">Local Studio</h1>
        <div id="local" data-kumwe-studio></div>
      </section>
      <section aria-labelledby="hosted-heading">
        <h1 id="hosted-heading">Hosted Studio</h1>
        <div id="hosted" data-kumwe-studio="hosted-configuration"></div>
      </section>
      <button id="dispose-local" type="button">Dispose local</button>
    </main>
    <script id="hosted-configuration" type="application/json">${serialized}</script>
    <script type="module" src="/configuration-profile-boundary-harness.js"></script>
  </body>
</html>`;
}

function harnessModule(): string {
  return `import { autoMountStudio } from '/configuration-profile-boundary-studio.js';

const report = await autoMountStudio();
document.querySelector('#dispose-local').addEventListener('click', async () => {
  await report.handles[0]?.dispose();
});
document.documentElement.dataset.mountSuccessCount = String(report.handles.length);
document.documentElement.dataset.mountFailures = report.failures
  .map((failure) => failure.phase + ':' + (failure.instanceId ?? 'anonymous'))
  .join(',');
document.documentElement.dataset.mountReady = 'true';
`;
}

async function standaloneRootCount(runtime: Locator): Promise<number> {
  return runtime.evaluate((element) => {
    const json = (
      element as HTMLElement & {
        exportProjectJson(): string;
      }
    ).exportProjectJson();
    const project = JSON.parse(json) as { state: { blueprint: { roots: unknown[] } } };
    return project.state.blueprint.roots.length;
  });
}
