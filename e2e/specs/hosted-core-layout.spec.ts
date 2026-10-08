import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Locator } from '@playwright/test';
import type * as StudioCore from '@kumwe/studio-core';
import type {
  AuthoringSessionSnapshot,
  BlockDefinition,
  BlueprintNode,
  StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
const browserAssetManifest = await readJson<{
  module: { entryPoint: string };
  release: { corpusManifestDigest: string; version: string };
}>('packages/studio-lit/dist/browser/studio-assets.json');
const browserModule = resolve(
  repositoryRoot,
  'packages',
  'studio-lit',
  'dist',
  'browser',
  browserAssetManifest.module.entryPoint,
);
const hostedFixture = await readJson<StudioHostedDeploymentConfiguration>(
  'schemas/examples/studio-deployment.hosted.example.json',
);
const sessionFixture = await readJson<AuthoringSessionSnapshot>(
  'schemas/examples/authoring-session.example.json',
);
const priceFixture = await readJson<BlockDefinition>('schemas/examples/block.price.example.json');
// The built package is loaded at run time, exactly as a server-side host materializes the definitions
// from its pinned @kumwe/studio-core (ADR 0038); the test runner does not transpile package sources.
const { createCoreLayoutBlockDefinitions } = (await import(
  pathToFileURL(resolve(repositoryRoot, 'packages/core/dist/index.js')).href
)) as typeof StudioCore;
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

test('hosted Studio validates and inserts a host block inside a target-extended section without slot rejections', async ({
  page,
}) => {
  const { configuration, session } = coreLayoutHost();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/hosted-core-layout.html', async (route) => {
    await route.fulfill({
      body: testDocument(configuration),
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': policy },
    });
  });
  await page.route('**/hosted-core-layout-harness.js', async (route) => {
    await route.fulfill({ body: harnessModule(), contentType: 'text/javascript; charset=utf-8' });
  });
  await page.route('**/hosted-core-layout-studio.js', async (route) => {
    await route.fulfill({ path: browserModule, contentType: 'text/javascript; charset=utf-8' });
  });
  const hostOperations: string[] = [];
  await page.route('**/host/studio-authoring', async (route) => {
    const operation = route.request().headers()['x-studio-operation'] ?? '';
    hostOperations.push(operation);
    switch (operation) {
      case 'authoring/resolve-target':
        await route.fulfill(
          hostValue({
            availableStarts: ['existing'],
            initialPresentation: 'inline',
            resourceContext: session.resourceContext,
            returnContext: session.presentation.returnContext,
            target: session.target,
          }),
        );
        return;
      case 'authoring/start':
        await route.fulfill(hostValue(session));
        return;
      default:
        await route.fulfill({ body: '', status: 404 });
    }
  });

  await page.goto('http://127.0.0.1:4173/hosted-core-layout.html');
  await expect(page.locator('html')).toHaveAttribute('data-mount-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-mount-failure-messages', '');
  await expect(page.locator('html')).toHaveAttribute('data-mount-failures', '');
  const studio = page.locator('#hosted > kumwe-studio-contextual');
  await expect(studio).toHaveCount(1);

  const shell = studio.locator('kumwe-studio');
  await expect.poll(() => diagnosticCodes(studio)).toEqual([]);
  await expect(shell.locator('section.panel.diagnostics')).toHaveAttribute('data-empty', 'true');

  await shell.locator('button.outline-entry[data-node-id="section-1"]').click();
  await shell.locator('.command-palette-toggle').click();
  await shell
    .locator('button.command-entry[data-command-id="insert-org.example.catalog/price@1.0.0"]')
    .click();
  await expect
    .poll(() => sectionChildTypes(studio))
    .toEqual(['org.example.catalog/price', 'org.example.catalog/price']);
  // The section accepts the inserted host block. The only finding is the new node's own unbound
  // required price port, which the author binds next; no slot rejects the type.
  await expect
    .poll(() => diagnosticCodes(studio))
    .toEqual([expect.stringMatching(/^studio\.binding\/required-port-unbound: /u)]);
  expect(hostOperations).toEqual(['authoring/resolve-target', 'authoring/start']);
  expect(pageErrors).toEqual([]);
});

/**
 * A Blueprint-mode host session whose target extends the core layout slots with
 * its admitted price block. The section's derived revision is obtained from the
 * pinned package, never hand-written (ADR 0038).
 */
function coreLayoutHost(): {
  configuration: StudioHostedDeploymentConfiguration;
  session: AuthoringSessionSnapshot;
} {
  const session = structuredClone(sessionFixture);
  const block: BlockDefinition = {
    ...structuredClone(priceFixture),
    owner: structuredClone(session.target.owner),
  };
  session.target.contributionDependencies = [
    { id: block.type, kind: 'block-definition', required: true, versions: block.version },
  ];
  session.target.coreLayout = { acceptedChildTypes: [block.type] };
  const [section] = createCoreLayoutBlockDefinitions(session.target.coreLayout);
  if (section === undefined) throw new Error('The layout factory returns the section first.');
  const priceNode: BlueprintNode = {
    authoring: { mode: 'designer' },
    bindings: {
      value: {
        onError: 'error',
        onNull: 'empty',
        source: { kind: 'static-value', value: { amount: '12.00', currency: 'USD' } },
        transforms: [],
      },
    },
    id: 'price-1',
    properties: {},
    slots: {},
    type: block.type,
    version: block.version,
  };
  session.state.blueprint.roots = [
    {
      authoring: { mode: 'structural' },
      bindings: {},
      id: 'section-1',
      properties: {},
      slots: { content: [priceNode] },
      type: section.type,
      version: section.version,
    },
  ];
  const locks = [
    { revision: section.revision, type: section.type, version: section.version },
    { revision: block.revision, type: block.type, version: block.version },
  ];
  session.state.blueprint.dependencyLock.blocks = structuredClone(locks);

  const configuration = structuredClone(hostedFixture);
  configuration.instanceId = 'core-layout-hosted';
  configuration.mount = '#hosted';
  configuration.release = browserAssetManifest.release;
  configuration.launch = {
    initialPresentation: 'inline',
    intent: 'edit',
    resourceContext: structuredClone(session.resourceContext),
    start: { kind: 'existing' },
    targetId: session.target.id,
  };
  const operations = [
    'studio.operation/authoring.resolve-target',
    'studio.operation/authoring.start',
    'studio.operation/authoring.plan-save',
    'studio.operation/authoring.save-item',
    'studio.operation/authoring.save-new-type-version',
    'studio.operation/authoring.save-as-new-type',
  ];
  configuration.session = {
    ...configuration.session,
    hostCapabilities: {
      ...configuration.session.hostCapabilities,
      ports: [{ id: 'studio.port/authoring', operations, version: '1.0.0' }],
    },
    permissions: operations,
    artifacts: {
      blueprint: structuredClone(session.state.coordinates.blueprint),
      entry: structuredClone(session.state.coordinates.entry),
      model: structuredClone(session.state.coordinates.model),
    },
    blocks: structuredClone(locks),
    resourceContext: structuredClone(session.resourceContext),
    sessionGeneration: session.sessionGeneration,
    sessionId: session.sessionId,
  };
  configuration.contributions = { generation: session.contributionGeneration, payloads: [block] };
  configuration.transport = {
    ...configuration.transport,
    authentication: {
      credentials: 'same-origin',
      csrf: { headerName: 'X-Studio-CSRF-Core-Layout', token: 'private' },
      kind: 'same-origin-session',
    },
    routing: { endpoint: '/host/studio-authoring', kind: 'single-endpoint' },
  };
  return { configuration, session };
}

function hostValue(value: unknown): { body: string; contentType: string; status: number } {
  return {
    body: JSON.stringify({ value }),
    contentType: 'application/json; charset=utf-8',
    status: 200,
  };
}

async function diagnosticCodes(studio: Locator): Promise<string[]> {
  return studio.evaluate((element) =>
    (
      (
        element as HTMLElement & {
          blueprintElement?: { diagnostics: readonly { code: string; message?: string }[] };
        }
      ).blueprintElement?.diagnostics ?? []
    ).map((diagnostic) => `${diagnostic.code}: ${JSON.stringify(diagnostic.message ?? '')}`),
  );
}

async function sectionChildTypes(studio: Locator): Promise<string[]> {
  return studio.evaluate((element) => {
    const snapshot = (
      element as HTMLElement & {
        snapshot?: {
          state: {
            blueprint: { roots: { id: string; slots: Record<string, { type: string }[]> }[] };
          };
        };
      }
    ).snapshot;
    const section = snapshot?.state.blueprint.roots.find((root) => root.id === 'section-1');
    return (section?.slots.content ?? []).map((child) => child.type);
  });
}

function testDocument(configuration: StudioHostedDeploymentConfiguration): string {
  const serialized = JSON.stringify(configuration).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Studio core layout admission test</title></head>
  <body>
    <main>
      <h1>Hosted Studio</h1>
      <div id="hosted" data-kumwe-studio="hosted-configuration"></div>
    </main>
    <script id="hosted-configuration" type="application/json">${serialized}</script>
    <script type="module" src="/hosted-core-layout-harness.js"></script>
  </body>
</html>`;
}

function harnessModule(): string {
  return `import { autoMountStudio } from '/hosted-core-layout-studio.js';

const report = await autoMountStudio();
document.documentElement.dataset.mountFailures = report.failures
  .map((failure) => failure.phase + ':' + (failure.instanceId ?? 'anonymous'))
  .join(',');
document.documentElement.dataset.mountFailureMessages = report.failures
  .map((failure) => String(failure.error?.message ?? failure.error))
  .join(' | ');
document.documentElement.dataset.mountReady = 'true';
`;
}
