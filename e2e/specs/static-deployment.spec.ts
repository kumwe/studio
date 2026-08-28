import { access, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const deploymentRoot = resolve(repositoryRoot, 'examples', 'standalone-static-host', 'dist');
let server: ChildProcess;
let staticOrigin = '';

test.describe('zero-Node standalone static deployment', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const python = await resolvePython();
    server = spawn(
      python,
      [
        resolve(repositoryRoot, 'examples', 'standalone-static-host', 'serve.py'),
        '--root',
        deploymentRoot,
        '--port',
        '0',
        '--assert-zero-node',
      ],
      {
        env: {
          LANG: 'C.UTF-8',
          PATH: resolve(repositoryRoot, '.cache', 'no-production-executables'),
          PYTHONDONTWRITEBYTECODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    staticOrigin = await readyOrigin(server);
  });

  test.afterAll(async () => {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
  });

  test('boots contextual authoring and emits host-owned save intent from compiled assets', async ({
    page,
  }) => {
    await page.goto(`${staticOrigin}/index.html`);
    await expect(page.locator('html')).toHaveAttribute('data-studio-static-ready', 'true');
    await expect(
      page.getByText('Studio loaded from prebuilt static browser assets.'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Product content' })).toBeVisible();

    await page.getByRole('button', { name: 'Save item' }).click();
    await expect(page.locator('#save-intent')).toContainText('"outcome": "save-item"');
    await expect(
      page.getByText(/No durable effect was applied by this static host/u),
    ).toBeVisible();
  });

  test('composes an extension target and fails closed across its live lifecycle', async ({
    page,
  }) => {
    await page.goto(`${staticOrigin}/index.html`);
    await expect(page.locator('html')).toHaveAttribute('data-studio-static-ready', 'true');
    await expect(page.locator('#extension-state')).toHaveText('active');
    await expect(page.locator('#extension-resolution')).toHaveAttribute('data-resolved', 'true');
    await expect(page.locator('#extension-contributions')).toContainText('block-definition');
    await expect(page.locator('#extension-contributions')).toContainText('field-adapter');
    await expect(page.locator('#extension-contributions')).toContainText('pattern');

    const studio = page.locator('kumwe-studio-contextual');
    await studio.getByRole('tab', { name: 'Content' }).click();
    const extensionName = studio.getByRole('textbox', { name: 'Extension product name' });
    await expect(extensionName).toHaveValue('Trail Backpack');
    await extensionName.fill('Lifecycle Backpack');

    await studio.getByRole('tab', { name: 'Blueprint' }).click();
    await studio.getByRole('button', { name: 'Catalog promotion pattern' }).click();
    await studio.getByRole('tab', { name: 'Content' }).click();
    await studio.getByRole('button', { name: 'Save item' }).click();
    const intent = JSON.parse(await page.locator('#save-intent').innerText()) as {
      draft: {
        entry: { values: Record<string, unknown> };
        itemBlueprint?: { roots: { type: string }[] };
        outcome: string;
      };
    };
    expect(intent.draft).toMatchObject({
      entry: { values: { name: 'Lifecycle Backpack' } },
      outcome: 'save-item',
    });
    expect(intent.draft.itemBlueprint?.roots).toContainEqual(
      expect.objectContaining({ type: 'org.example.catalog/promo-card' }),
    );

    await page.getByRole('button', { name: 'Disable extension' }).click();
    await expect(page.locator('#extension-state')).toHaveText('disabled');
    await expect(page.locator('#extension-resolution')).toContainText('owner-disabled');
    await expect(page.locator('#extension-resolution')).toHaveAttribute('data-resolved', 'false');
    await expect(studio.getByRole('textbox', { name: 'Extension product name' })).toHaveCount(0);
    await expect(studio.getByRole('button', { name: 'Save item' })).toBeDisabled();

    await page.getByRole('button', { name: 'Reactivate extension' }).click();
    await expect(page.locator('#extension-state')).toHaveText('active');
    await expect(page.locator('#extension-resolution')).toHaveAttribute('data-resolved', 'true');
    await studio.getByRole('tab', { name: 'Content' }).click();
    await expect(studio.getByRole('textbox', { name: 'Extension product name' })).toHaveValue(
      'Lifecycle Backpack',
    );

    await page.getByRole('button', { name: 'Revoke extension trust' }).click();
    await expect(page.locator('#extension-state')).toHaveText('trust-revoked');
    await expect(page.locator('#extension-resolution')).toContainText('owner-revoked');
    await expect(page.locator('#extension-resolution')).toHaveAttribute('data-resolved', 'false');
    await page.getByRole('button', { name: 'Uninstall extension' }).click();
    await expect(page.locator('#extension-state')).toHaveText('uninstalled-data-preserved');
    await expect(page.locator('#extension-resolution')).toContainText('owner-disabled');

    const preserved = await studio.evaluate((element) => {
      const snapshot = (
        element as HTMLElement & {
          snapshot?: {
            state: {
              blueprint: { roots: { type: string }[] };
              entry: { values: Record<string, unknown> };
            };
          };
        }
      ).snapshot;
      return {
        name: snapshot?.state.entry.values.name,
        rootTypes: snapshot?.state.blueprint.roots.map((root) => root.type),
      };
    });
    expect(preserved).toEqual({
      name: 'Lifecycle Backpack',
      rootTypes: expect.arrayContaining([
        'studio.core/text',
        'org.example.catalog/promo-card',
      ]) as string[],
    });
  });

  test('keeps the exact compiled session operable with touch, RTL, reflow, and reduced motion', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      reducedMotion: 'reduce',
      viewport: { height: 844, width: 320 },
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(`${staticOrigin}/index.html`);
      expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
      await expect(page.locator('html')).toHaveAttribute('data-studio-static-ready', 'true');
      const studio = page.locator('kumwe-studio-contextual');
      const exact = await studio.evaluate((element) => {
        const snapshot = (
          element as HTMLElement & {
            snapshot?: {
              contributionGeneration: string;
              presentation: { returnContext: { key: string } };
              resourceContext: { key: string };
              state: {
                coordinates: {
                  blueprint: { revision: string };
                  entry: { revision: string };
                  model: { revision: string };
                  type?: { revision: string; version: string };
                };
                entry: { values: Record<string, unknown> };
              };
              target: { id: string };
            };
          }
        ).snapshot;
        if (snapshot === undefined) {
          throw new Error('The compiled contextual session is unavailable.');
        }
        return structuredClone({
          contributionGeneration: snapshot.contributionGeneration,
          coordinates: snapshot.state.coordinates,
          entryValues: snapshot.state.entry.values,
          resourceContext: snapshot.resourceContext.key,
          returnContext: snapshot.presentation.returnContext.key,
          target: snapshot.target.id,
        });
      });
      expect(exact).toEqual({
        contributionGeneration: 'extension-generation-r1',
        coordinates: {
          blueprint: {
            id: 'org.example.blueprints/product-card',
            revision: 'product-card-r5',
            version: '1.0.0',
          },
          entry: { id: 'products/trail-backpack', revision: 'entry-r7' },
          model: {
            id: 'org.example.models/product',
            revision: 'product-model-r1',
            version: '1.0.0',
          },
          type: {
            id: 'content-types/product-page',
            revision: 'product-page-type-r1',
            version: '1.0.0',
          },
        },
        entryValues: { name: 'Trail Backpack' },
        resourceContext: 'contexts/product-trail-backpack',
        returnContext: 'return/product-list',
        target: 'org.example.catalog/product-content',
      });

      const blueprintTab = studio.getByRole('tab', { name: 'Blueprint' });
      await blueprintTab.focus();
      await blueprintTab.press('ArrowRight');
      await expect(studio.getByRole('tab', { name: 'Content' })).toBeFocused();
      await page.evaluate(() => {
        document.documentElement.dir = 'rtl';
      });
      expect(await studio.evaluate((element) => getComputedStyle(element).direction)).toBe('rtl');
      const name = studio.getByRole('textbox', { name: 'Name' });
      await name.tap();
      await name.fill('Touch-authored backpack');
      await name.blur();

      for (const presentation of ['Maximized', 'Fullscreen', 'Minimized', 'Inline']) {
        await studio.getByRole('button', { name: presentation, exact: true }).tap();
        await expect(
          studio.getByRole('button', { name: presentation, exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
      }

      await studio.getByRole('button', { name: 'Save item' }).tap();
      await expect(page.locator('#runtime-status')).toHaveText(
        'Save intent emitted. No durable effect was applied by this static host.',
      );
      const emitted = JSON.parse(await page.locator('#save-intent').innerText()) as {
        draft: { entry: { values: Record<string, unknown> }; outcome: string };
      };
      expect(emitted.draft).toMatchObject({
        entry: { values: { name: 'Touch-authored backpack' } },
        outcome: 'save-item',
      });

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      const motion = await studio.evaluate((element) => {
        const values: string[] = [];
        const inspect = (root: Element | ShadowRoot): void => {
          for (const child of root.querySelectorAll('*')) {
            const style = getComputedStyle(child);
            if (style.animationDuration !== '0s' || style.transitionDuration !== '0s') {
              values.push(
                `${child.tagName}:${style.animationDuration}:${style.transitionDuration}`,
              );
            }
            if (child.shadowRoot !== null) inspect(child.shadowRoot);
          }
        };
        inspect(element);
        return values;
      });
      expect(motion).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('delivers the pre-rendered public result with browser JavaScript disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`${staticOrigin}/public.html`);
      await expect(page.getByText('Trail Backpack')).toBeVisible();
      await expect(page.locator('[data-studio-block="rich-text"]')).toBeVisible();
      await expect(page.locator('script')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

async function readyOrigin(process: ChildProcess): Promise<string> {
  const stdout = process.stdout;
  const stderr = process.stderr;
  if (stdout === null || stderr === null) throw new Error('Static server pipes were not created.');
  stdout.setEncoding('utf8');
  const timeout = AbortSignal.timeout(10_000);
  let output = '';
  for await (const untypedChunk of stdout) {
    const chunk: unknown = untypedChunk;
    if (typeof chunk !== 'string') throw new TypeError('Expected UTF-8 server output.');
    output += chunk;
    const newline = output.indexOf('\n');
    if (newline !== -1) {
      const message = JSON.parse(output.slice(0, newline)) as { ready: true; url: string };
      return message.url;
    }
    if (timeout.aborted) throw new Error('The static validation server did not become ready.');
  }
  throw new Error(`Static server exited before readiness: ${await streamText(stderr)}`);
}

async function resolvePython(): Promise<string> {
  const configured = process.env.STUDIO_STATIC_PYTHON;
  if (configured !== undefined) {
    await access(configured);
    return realpath(configured);
  }
  for (const candidate of ['/usr/bin/python3', '/usr/local/bin/python3']) {
    try {
      await access(candidate);
      return await realpath(candidate);
    } catch {
      // Continue to the next conventional absolute path.
    }
  }
  const discovered = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], {
    encoding: 'utf8',
  });
  if (discovered.status === 0 && discovered.stdout.trim().length > 0) {
    return realpath(discovered.stdout.trim());
  }
  throw new Error('Python 3 is required only for the zero-Node static-server validation lane.');
}

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  let output = '';
  for await (const chunk of stream) output += String(chunk);
  return output;
}
