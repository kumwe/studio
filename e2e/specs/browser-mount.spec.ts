import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { STUDIO_CONTRACT_VERSION } from '@kumwe/studio-protocol';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const browserAssetManifest = JSON.parse(
  await readFile(
    resolve(repositoryRoot, 'packages/studio-lit/dist/browser/studio-assets.json'),
    'utf8',
  ),
) as {
  module: { entryPoint: string };
  release: { corpusManifestDigest: string; version: string };
};
const browserModule = resolve(
  repositoryRoot,
  'packages',
  'studio-lit',
  'dist',
  'browser',
  browserAssetManifest.module.entryPoint,
);
const browserRelease = browserAssetManifest.release;
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

test('mounts and cleans multiple inert-config instances under strict CSP', async ({ page }) => {
  const requests: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/browser-mount-test.html', async (route) => {
    await route.fulfill({
      body: testDocument(),
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': policy },
    });
  });
  await page.route('**/browser-mount-harness.js', async (route) => {
    await route.fulfill({
      body: harnessModule(),
      contentType: 'text/javascript; charset=utf-8',
    });
  });
  await page.route('**/studio-mount-test.js', async (route) => {
    await route.fulfill({ path: browserModule, contentType: 'text/javascript; charset=utf-8' });
  });

  const response = await page.goto('/browser-mount-test.html');
  expect(response?.headers()['content-security-policy']).toBe(policy);
  await expect(page.locator('html')).toHaveAttribute('data-mount-ready', 'true');
  await expect(page.locator('#mount-one > [data-runtime-instance]')).toHaveAttribute(
    'data-runtime-instance',
    'browser-one',
  );
  await expect(page.locator('#mount-two > [data-runtime-instance]')).toHaveAttribute(
    'data-runtime-instance',
    'browser-two',
  );
  await expect(page.locator('#mount-malformed > [data-runtime-instance]')).toHaveCount(0);
  await expect(page.locator('#mount-refused > [data-runtime-instance]')).toHaveCount(0);
  await expect(page.locator('#mount-refused > kumwe-studio-standalone')).toHaveCount(0);
  await expect(page.locator('.anonymous-mount > [data-runtime-instance]')).toHaveCount(2);
  await expect(page.locator('html')).toHaveAttribute('data-mount-success-count', '4');
  await expect(page.locator('html')).toHaveAttribute(
    'data-mount-failures',
    'configuration:mount-malformed,runtime:mount-refused',
  );

  await page.getByRole('button', { name: 'Dispose first' }).click();
  await expect(page.locator('#mount-one > [data-runtime-instance]')).toHaveCount(0);
  await expect(page.locator('#mount-two > [data-runtime-instance]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Dispose all' }).click();
  await expect(page.locator('[data-runtime-instance]')).toHaveCount(0);

  expect(pageErrors).toEqual([]);
  expect([...new Set(requests)].sort()).toEqual(
    ['/browser-mount-harness.js', '/browser-mount-test.html', '/studio-mount-test.js'].sort(),
  );
});

test('mounts the shipped standalone runtime with isolated state and zero runtime network', async ({
  page,
}) => {
  const requests: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/standalone-mount-test.html', async (route) => {
    await route.fulfill({
      body: standaloneTestDocument(),
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': policy },
    });
  });
  await page.route('**/standalone-mount-harness.js', async (route) => {
    await route.fulfill({
      body: standaloneHarnessModule(),
      contentType: 'text/javascript; charset=utf-8',
    });
  });
  await page.route('**/studio-standalone-test.js', async (route) => {
    await route.fulfill({ path: browserModule, contentType: 'text/javascript; charset=utf-8' });
  });

  const response = await page.goto('/standalone-mount-test.html');
  expect(response?.headers()['content-security-policy']).toBe(policy);
  await expect(page.locator('html')).toHaveAttribute('data-mount-ready', 'true');

  const first = page.locator('#standalone-one > kumwe-studio-standalone');
  const second = page.locator('#standalone-two > kumwe-studio-standalone');
  await expect(first).toHaveCount(1);
  await expect(second).toHaveCount(1);
  await expect(first.getByRole('heading', { name: 'Local Studio workspace' })).toBeVisible();
  await expect(
    first.getByText('Nothing is sent to or saved by a server.', { exact: false }),
  ).toBeVisible();

  await first
    .getByRole('complementary', { name: 'Block palette' })
    .getByRole('button', { name: 'Section', exact: true })
    .click();

  const [firstRoots, secondRoots] = await Promise.all([
    standaloneRoots(first),
    standaloneRoots(second),
  ]);
  expect(firstRoots).toEqual([{ id: 'studio-local-node-1', type: 'studio.core/section' }]);
  expect(secondRoots).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect([...new Set(requests)].sort()).toEqual(
    [
      '/standalone-mount-harness.js',
      '/standalone-mount-test.html',
      '/studio-standalone-test.js',
    ].sort(),
  );
});

function testDocument(): string {
  const first = JSON.stringify({
    contractVersion: STUDIO_CONTRACT_VERSION,
    instanceId: 'browser-one',
    kind: 'studio-deployment',
    mount: '#mount-one',
    release: browserRelease,
  });
  const second = JSON.stringify({
    contractVersion: STUDIO_CONTRACT_VERSION,
    instanceId: 'browser-two',
    kind: 'studio-deployment',
    mount: '#mount-two',
    release: browserRelease,
  });
  const refused = JSON.stringify({
    contractVersion: STUDIO_CONTRACT_VERSION,
    instanceId: 'browser-refused',
    kind: 'studio-deployment',
    mount: '#mount-refused',
    release: browserRelease,
  });
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Studio mount test</title></head>
  <body>
    <main>
      <div id="mount-one" data-kumwe-studio="config-one"></div>
      <div id="mount-malformed" data-kumwe-studio="config-malformed"></div>
      <div id="mount-refused" data-kumwe-studio="config-refused"></div>
      <div id="mount-two" data-kumwe-studio="config-two"></div>
      <div class="anonymous-mount" data-kumwe-studio></div>
      <div class="anonymous-mount" data-kumwe-studio></div>
      <button type="button" id="dispose-first">Dispose first</button>
      <button type="button" id="dispose-all">Dispose all</button>
    </main>
    <script id="config-one" type="application/json">${first}</script>
    <script id="config-malformed" type="application/json">{</script>
    <script id="config-refused" type="application/json">${refused}</script>
    <script id="config-two" type="application/json">${second}</script>
    <script type="module" src="/browser-mount-harness.js"></script>
  </body>
</html>`;
}

function harnessModule(): string {
  return `import { autoMountStudio } from '/studio-mount-test.js';

const report = await autoMountStudio({
  runtimeResolver(target, configuration) {
    if (configuration?.instanceId === 'browser-refused') {
      throw Object.assign(new Error('Host refused Studio with HTTP 403.'), { status: 403 });
    }
    const element = document.createElement('section');
    element.dataset.runtimeInstance = configuration?.instanceId ?? configuration?.mount ?? 'local';
    target.append(element);
    return { element, dispose: () => element.remove() };
  },
});

document.querySelector('#dispose-first').addEventListener('click', async () => {
  await report.handles[0].dispose();
});
document.querySelector('#dispose-all').addEventListener('click', async () => {
  await report.dispose();
});
document.documentElement.dataset.mountSuccessCount = String(report.handles.length);
document.documentElement.dataset.mountFailures = report.failures
  .map((failure) => failure.phase + ':' + failure.target.id)
  .join(',');
document.documentElement.dataset.mountReady = 'true';
`;
}

function standaloneTestDocument(): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Standalone Studio mount test</title></head>
  <body>
    <main>
      <div id="standalone-one" data-kumwe-studio></div>
      <div id="standalone-two" data-kumwe-studio></div>
    </main>
    <script type="module" src="/standalone-mount-harness.js"></script>
  </body>
</html>`;
}

function standaloneHarnessModule(): string {
  return `import { autoMountStudio } from '/studio-standalone-test.js';

const report = await autoMountStudio();
if (report.failures.length > 0) throw report.failures[0].error;
document.documentElement.dataset.mountReady = 'true';
`;
}

async function standaloneRoots(runtime: Locator): Promise<{ id: string; type: string }[]> {
  return runtime.evaluate((element) => {
    const json = (
      element as HTMLElement & {
        exportProjectJson(): string;
      }
    ).exportProjectJson();
    const project = JSON.parse(json) as {
      state: { blueprint: { roots: { id: string; type: string }[] } };
    };
    return project.state.blueprint.roots.map(({ id, type }) => ({ id, type }));
  });
}
