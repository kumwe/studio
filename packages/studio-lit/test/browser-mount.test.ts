import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type StudioDeploymentConfiguration,
  type StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';
import {
  autoMountStudio,
  mountStudio,
  mountStudioFromConfigElement,
  parseStudioDeploymentConfiguration,
  type KumweStudioStandaloneElement,
  type StudioDeploymentRuntimeResolver,
} from '../src/index.js';

const hostedDeploymentFixture = JSON.parse(
  await readFile(
    join(process.cwd(), 'schemas/examples/studio-deployment.hosted.example.json'),
    'utf8',
  ),
) as StudioHostedDeploymentConfiguration;

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('Studio browser mounting', () => {
  it('uses isolated blank standalone defaults without performing an endpoint call', async () => {
    const firstTarget = target('local-first');
    const secondTarget = target('local-second');
    const fetch = vi.fn(() => Promise.reject(new Error('unexpected endpoint call')));
    vi.stubGlobal('fetch', fetch);

    const first = await mountStudio(firstTarget);
    const second = await mountStudio(secondTarget);

    expect(first.target).toBe(firstTarget);
    expect(second.target).toBe(secondTarget);
    expect(first.element.tagName.toLowerCase()).toBe('kumwe-studio-standalone');
    expect(second.element.tagName.toLowerCase()).toBe('kumwe-studio-standalone');
    const firstRuntime = first.element as KumweStudioStandaloneElement;
    const secondRuntime = second.element as KumweStudioStandaloneElement;
    const changed = JSON.parse(firstRuntime.exportProjectJson()) as {
      state: { blueprint: { label: { defaultMessage: string } } };
    };
    changed.state.blueprint.label.defaultMessage = 'First mount only';
    firstRuntime.importProjectJson(changed);
    expect(
      (
        JSON.parse(secondRuntime.exportProjectJson()) as {
          state: { blueprint: { label: { defaultMessage: string } } };
        }
      ).state.blueprint.label.defaultMessage,
    ).toBe('Untitled page');
    expect(fetch).not.toHaveBeenCalled();
    await first.dispose();
    expect(firstTarget.children).toHaveLength(0);
    expect(secondTarget.children).toHaveLength(1);
    await second.dispose();
  });

  it('forwards trusted hosted seams through the normal resolver without replacing it', async () => {
    target('studio-page');
    const resolver = vi.fn(testResolver());
    const hosted = {
      adapter: {
        resolveAuthentication: vi.fn(() => undefined),
      },
      saveConfirmationHandler: vi.fn(() => false as const),
    };

    const handle = await mountStudio(structuredClone(hostedDeploymentFixture), {
      hosted,
      runtimeResolver: resolver,
    });

    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver.mock.calls[0]?.[2]).toBe(hosted);
    await handle.dispose();
  });

  it('recognizes hosted seams as mount options for a configless explicit target', async () => {
    const mountTarget = target('local-with-hosted-options');
    const resolver = vi.fn(testResolver());
    const hosted = {
      adapter: {
        resolveAuthentication: vi.fn(() => undefined),
      },
    };

    const handle = await mountStudio(mountTarget, { hosted, runtimeResolver: resolver });

    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver.mock.calls[0]?.[1]).toEqual({});
    expect(resolver.mock.calls[0]?.[2]).toBe(hosted);
    await handle.dispose();
  });

  it('allocates hosted live seams per discovered instance through an options factory', async () => {
    const first = target('hosted-auto-first');
    const second = target('hosted-auto-second');
    first.dataset.kumweStudio = 'hosted-auto-first-config';
    second.dataset.kumweStudio = 'hosted-auto-second-config';
    configurationScript('hosted-auto-first-config', {
      ...structuredClone(hostedDeploymentFixture),
      instanceId: 'hosted-auto-instance-first',
      mount: '#hosted-auto-first',
    });
    configurationScript('hosted-auto-second-config', {
      ...structuredClone(hostedDeploymentFixture),
      instanceId: 'hosted-auto-instance-second',
      mount: '#hosted-auto-second',
    });
    const resolver = vi.fn(testResolver());
    const hosted = vi.fn(
      (mountTarget: HTMLElement, configuration: StudioHostedDeploymentConfiguration) => ({
        adapter: { resolveAuthentication: vi.fn(() => undefined) },
        marker: `${mountTarget.id}:${configuration.instanceId ?? ''}`,
      }),
    );

    const report = await autoMountStudio({ hosted, runtimeResolver: resolver });

    expect(report.failures).toEqual([]);
    expect(hosted).toHaveBeenCalledTimes(2);
    expect(hosted.mock.calls.map(([mountTarget]) => mountTarget)).toEqual([first, second]);
    expect(resolver.mock.calls.map(([, , options]) => options)).toEqual([
      expect.objectContaining({ marker: 'hosted-auto-first:hosted-auto-instance-first' }),
      expect.objectContaining({ marker: 'hosted-auto-second:hosted-auto-instance-second' }),
    ]);
    expect(resolver.mock.calls[0]?.[2]).not.toBe(resolver.mock.calls[1]?.[2]);
    await report.dispose();
  });

  it('mounts isolated instances by element and selector and cleans each lifecycle independently', async () => {
    const firstTarget = target('first');
    const secondTarget = target('second');
    const disposed: string[] = [];
    const resolver = testResolver(disposed);

    const first = await mountStudio(firstTarget, deployment('instance-first', '#first'), {
      runtimeResolver: resolver,
    });
    const second = await mountStudio('#second', deployment('instance-second', '#second'), {
      runtimeResolver: resolver,
    });

    expect(first.element).not.toBe(second.element);
    expect(first.element.dataset.instanceId).toBe('instance-first');
    expect(second.element.dataset.instanceId).toBe('instance-second');
    expect(firstTarget.children).toHaveLength(1);
    expect(secondTarget.children).toHaveLength(1);

    await first.dispose();
    await first.dispose();
    expect(first.disposed).toBe(true);
    expect(firstTarget.children).toHaveLength(0);
    expect(secondTarget.children).toHaveLength(1);
    expect(disposed).toEqual(['instance-first']);

    const remounted = await mountStudio(deployment('instance-remounted', '#first'), {
      runtimeResolver: resolver,
    });
    expect(remounted.target).toBe(firstTarget);
    await Promise.all([remounted.dispose(), second.dispose()]);
    expect(disposed).toEqual(['instance-first', 'instance-remounted', 'instance-second']);
  });

  it('reserves pending targets and propagates a configured runtime refusal without fallback', async () => {
    target('pending');
    let rejectRuntime: ((reason: Error) => void) | undefined;
    const resolver: StudioDeploymentRuntimeResolver = () =>
      new Promise((_, reject) => {
        rejectRuntime = reject;
      });
    const configuration = deployment('pending-instance', '#pending');
    const pending = mountStudio(configuration, { runtimeResolver: resolver });
    await Promise.resolve();

    await expect(mountStudio(configuration, { runtimeResolver: testResolver() })).rejects.toThrow(
      /active or pending/u,
    );
    rejectRuntime?.(new Error('host-forbidden'));
    await expect(pending).rejects.toThrow('host-forbidden');
    expect(document.querySelector('#pending')?.children).toHaveLength(0);

    const recovered = await mountStudio(configuration, { runtimeResolver: testResolver() });
    await recovered.dispose();
  });

  it('uses only the exact hosted route and never opens local Studio after a real host refusal', async () => {
    const mountTarget = target('studio-page');
    const configuration = structuredClone(hostedDeploymentFixture);
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            category: 'forbidden',
            contractVersion: STUDIO_CONTRACT_VERSION,
            kind: 'host-error',
            message: {
              defaultMessage: 'This content is not available for authoring.',
              key: 'studio.test/forbidden',
            },
            retryable: false,
          }),
          { headers: { 'content-type': 'application/json' }, status: 403 },
        ),
      ),
    );
    const resolveAuthentication = vi.fn(() => ({
      credentials: 'same-origin' as const,
      csrf: { headerName: 'X-CSRF-Token', token: 'rotated-session-csrf' },
      kind: 'same-origin-session' as const,
    }));

    await expect(
      mountStudio(configuration, {
        hosted: { adapter: { fetchImplementation, resolveAuthentication } },
      }),
    ).rejects.toMatchObject({
      error: { category: 'forbidden' },
    });

    expect(resolveAuthentication).toHaveBeenCalledWith({
      operation: 'authoring/resolve-target',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [requestedUrl, request] = fetchImplementation.mock.calls[0] ?? [];
    if (typeof requestedUrl !== 'string') throw new TypeError('Expected a configured URL string.');
    expect(requestedUrl).toBe(
      new URL('/api/studio/authoring/resolve-target', document.baseURI).href,
    );
    expect(request).toMatchObject({
      cache: 'no-store',
      credentials: 'same-origin',
      method: 'POST',
      redirect: 'error',
    });
    expect(new Headers(request?.headers).get('x-csrf-token')).toBe('rotated-session-csrf');
    expect(mountTarget.querySelector('kumwe-studio-contextual')).toBeNull();
    expect(mountTarget.querySelector('kumwe-studio-standalone')).toBeNull();
    expect(mountTarget.querySelector('[role="alert"]')?.textContent).toBe(
      'This content is not available for authoring.',
    );
  });

  it('parses inert bounded JSON without evaluating configuration text', async () => {
    target('safe');
    const script = configurationScript('safe-config', deployment('safe-instance', '#safe'));
    const evaluate = vi.fn(() => {
      throw new Error('eval must not run');
    });
    vi.stubGlobal('eval', evaluate);

    const parsed = parseStudioDeploymentConfiguration(script);
    expect(parsed.instanceId).toBe('safe-instance');
    expect(evaluate).not.toHaveBeenCalled();
    expect(
      (globalThis as { __studioConfigurationExecuted?: boolean }).__studioConfigurationExecuted,
    ).toBeUndefined();

    const handle = await mountStudioFromConfigElement(script, {
      runtimeResolver: testResolver(),
    });
    expect(handle.target.id).toBe('safe');
    await handle.dispose();
  });

  it('rejects executable, external, malformed, duplicate, oversized, deep, and ambiguous configuration', async () => {
    target('invalid');

    const executable = configurationScript(
      'executable',
      deployment('invalid-executable', '#invalid'),
      'text/javascript',
    );
    expect(() => parseStudioDeploymentConfiguration(executable)).toThrow(/application\/json/u);

    const external = configurationScript('external', deployment('invalid-src', '#invalid'));
    external.src = '/configuration.json';
    expect(() => parseStudioDeploymentConfiguration(external)).toThrow(/inline inert JSON/u);

    const malformed = document.createElement('script');
    malformed.type = 'application/json';
    malformed.textContent = '{';
    expect(() => parseStudioDeploymentConfiguration(malformed)).toThrow(/not valid JSON/u);

    const duplicate = document.createElement('script');
    duplicate.type = 'application/json';
    duplicate.textContent =
      '{"mount":"#invalid","transport":{"kind":"standalone"},"transport":{"kind":"standalone"}}';
    expect(() => parseStudioDeploymentConfiguration(duplicate)).toThrow(/not valid JSON/u);

    const oversized = document.createElement('script');
    oversized.id = 'oversized';
    oversized.type = 'application/json';
    oversized.textContent = `"${'x'.repeat(2_097_151)}"`;
    document.body.append(oversized);
    expect(new TextEncoder().encode(oversized.textContent).byteLength).toBe(2_097_153);
    expect(() => parseStudioDeploymentConfiguration(oversized)).toThrow(/exceeds 2097152 bytes/u);

    let nested: Record<string, unknown> = {};
    for (let index = 0; index < 17; index += 1) nested = { nested };
    const deep = configurationScript('deep', {
      ...deployment('invalid-deep', '#invalid'),
      nested,
    });
    expect(() => parseStudioDeploymentConfiguration(deep)).toThrow(/JSON depth 16/u);

    target('duplicate-target', 'duplicate');
    target('duplicate-target-2', 'duplicate');
    const ambiguous = configurationScript(
      'ambiguous',
      deployment('invalid-ambiguous', '.duplicate'),
    );
    await expect(
      mountStudioFromConfigElement(ambiguous, { runtimeResolver: testResolver() }),
    ).rejects.toThrow(/exactly one/u);

    target('duplicate-config-id');
    configurationScript('duplicate-config-id', deployment('invalid-duplicate-id', '#invalid'));
    await expect(
      mountStudioFromConfigElement('duplicate-config-id', {
        runtimeResolver: testResolver(),
      }),
    ).rejects.toThrow(/exactly one script element/u);
  });

  it('fully validates nested transport, authentication, session, and contribution data before runtime', async () => {
    const mountTarget = target('nested-invalid');
    const resolver = vi.fn(testResolver());
    const invalidConfigurations = [
      {
        transport: {
          authentication: {
            credentials: 'same-origin',
            csrf: { headerName: 'X-CSRF-Token', token: 'token' },
            kind: 'same-origin-session',
          },
          kind: 'http',
          routing: { endpoint: 'javascript:alert(1)', kind: 'single-endpoint' },
        },
      },
      {
        transport: {
          authentication: { credentials: 'include', kind: 'unknown-authentication' },
          kind: 'http',
          routing: { endpoint: '/studio', kind: 'single-endpoint' },
        },
      },
      {
        launch: {},
        session: {},
        transport: {
          authentication: {
            credentials: 'same-origin',
            csrf: { headerName: 'X-CSRF-Token', token: 'token' },
            kind: 'same-origin-session',
          },
          kind: 'http',
          routing: { endpoint: '/studio', kind: 'single-endpoint' },
        },
      },
      {
        contributions: {
          generation: 'contributions-r1',
          payloads: [{ kind: 'executable-script', source: 'alert(1)' }],
        },
      },
    ];

    for (const configuration of invalidConfigurations) {
      await expect(
        mountStudio(mountTarget, configuration as unknown as StudioDeploymentConfiguration, {
          runtimeResolver: resolver,
        }),
      ).rejects.toThrow(/Studio deployment configuration/u);
    }
    expect(resolver).not.toHaveBeenCalled();
    expect(mountTarget.children).toHaveLength(0);
  });

  it('auto-mounts multiple declared targets only when explicitly requested', async () => {
    const first = target('auto-first');
    const second = target('auto-second');
    first.dataset.kumweStudio = 'auto-first-config';
    second.dataset.kumweStudio = 'auto-second-config';
    configurationScript('auto-first-config', deployment('auto-instance-first', '#auto-first'));
    configurationScript('auto-second-config', {
      contractVersion: STUDIO_CONTRACT_VERSION,
      instanceId: 'auto-instance-second',
      kind: 'studio-deployment',
    } satisfies StudioDeploymentConfiguration);
    const resolver = testResolver();

    expect(first.children).toHaveLength(0);
    expect(second.children).toHaveLength(0);
    const report = await autoMountStudio({ runtimeResolver: resolver });
    const handles = report.handles;

    expect(handles.map((handle) => handle.instanceId)).toEqual([
      'auto-instance-first',
      'auto-instance-second',
    ]);
    expect(report.discoveredTargetCount).toBe(2);
    expect(report.failures).toEqual([]);
    expect(first.children).toHaveLength(1);
    expect(second.children).toHaveLength(1);
    await expect(autoMountStudio({ runtimeResolver: resolver })).resolves.toMatchObject({
      discoveredTargetCount: 0,
      failures: [],
      handles: [],
    });

    await report.dispose();
    await report.dispose();
    expect(first.children).toHaveLength(0);
    expect(second.children).toHaveLength(0);
  });

  it('auto-mounts isolated configless targets without IDs or unique selectors', async () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.className = 'shared-studio-target';
    second.className = 'shared-studio-target';
    first.setAttribute('data-kumwe-studio', '');
    second.setAttribute('data-kumwe-studio', '');
    document.body.append(first, second);

    const resolver = vi.fn(testResolver());
    const report = await autoMountStudio({ runtimeResolver: resolver });
    const handles = report.handles;

    expect(handles).toHaveLength(2);
    expect(report.failures).toEqual([]);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(handles.every((handle) => handle.instanceId === undefined)).toBe(true);
    expect(first.children).toHaveLength(1);
    expect(second.children).toHaveLength(1);
    expect(first.firstElementChild).not.toBe(second.firstElementChild);
    await report.dispose();
    expect(first.children).toHaveLength(0);
    expect(second.children).toHaveLength(0);
  });

  it('requires one declarative configuration element per mount target', async () => {
    const first = target('shared-config-first');
    const second = target('shared-config-second');
    first.dataset.kumweStudio = 'shared-config';
    second.dataset.kumweStudio = 'shared-config';
    configurationScript('shared-config', {} satisfies StudioDeploymentConfiguration);
    const resolver = vi.fn(testResolver());

    const report = await autoMountStudio({ runtimeResolver: resolver });

    expect(report.discoveredTargetCount).toBe(2);
    expect(report.handles).toEqual([]);
    expect(report.failures).toHaveLength(2);
    expect(report.failures.every((failure) => failure.phase === 'configuration')).toBe(true);
    expect(report.failures.map((failure) => failure.target)).toEqual([first, second]);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('reports malformed configuration per target and still mounts valid siblings', async () => {
    const first = target('atomic-first');
    const second = target('atomic-second');
    const third = target('atomic-third');
    first.dataset.kumweStudio = 'atomic-first-config';
    second.dataset.kumweStudio = 'atomic-second-config';
    third.dataset.kumweStudio = 'atomic-third-config';
    configurationScript(
      'atomic-first-config',
      deployment('atomic-instance-first', '#atomic-first'),
    );
    const invalid = document.createElement('script');
    invalid.id = 'atomic-second-config';
    invalid.type = 'application/json';
    invalid.textContent = '{';
    document.body.append(invalid);
    configurationScript(
      'atomic-third-config',
      deployment('atomic-instance-third', '#atomic-third'),
    );
    const resolver = vi.fn(testResolver());

    const report = await autoMountStudio({ runtimeResolver: resolver });

    expect(report.discoveredTargetCount).toBe(3);
    expect(report.handles.map((handle) => handle.instanceId)).toEqual([
      'atomic-instance-first',
      'atomic-instance-third',
    ]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({
      configurationElementId: 'atomic-second-config',
      instanceId: undefined,
      phase: 'configuration',
      target: second,
    });
    expect(report.failures[0]?.error).toBeInstanceOf(TypeError);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(first.children).toHaveLength(1);
    expect(second.children).toHaveLength(0);
    expect(third.children).toHaveLength(1);

    await report.dispose();
    expect(first.children).toHaveLength(0);
    expect(third.children).toHaveLength(0);
  });

  it('retains successful siblings when one configured runtime is refused and never falls back', async () => {
    const first = target('runtime-first');
    const refused = target('runtime-refused');
    const later = target('runtime-later');
    first.dataset.kumweStudio = 'runtime-first-config';
    refused.dataset.kumweStudio = 'runtime-refused-config';
    later.dataset.kumweStudio = 'runtime-later-config';
    configurationScript(
      'runtime-first-config',
      deployment('runtime-instance-first', '#runtime-first'),
    );
    configurationScript(
      'runtime-refused-config',
      deployment('runtime-instance-refused', '#runtime-refused'),
    );
    configurationScript(
      'runtime-later-config',
      deployment('runtime-instance-later', '#runtime-later'),
    );
    const resolver = vi.fn<StudioDeploymentRuntimeResolver>((targetElement, configuration) => {
      if (configuration.instanceId === 'runtime-instance-refused') {
        return Promise.reject(
          Object.assign(new Error('Host refused Studio with HTTP 403.'), {
            status: 403,
          }),
        );
      }
      return testResolver()(targetElement, configuration);
    });

    const report = await autoMountStudio({ runtimeResolver: resolver });

    expect(report.handles.map((handle) => handle.instanceId)).toEqual([
      'runtime-instance-first',
      'runtime-instance-later',
    ]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({
      configurationElementId: 'runtime-refused-config',
      instanceId: 'runtime-instance-refused',
      phase: 'runtime',
      target: refused,
    });
    expect(report.failures[0]).not.toHaveProperty('configuration');
    expect(report.failures[0]?.error).toMatchObject({ status: 403 });
    expect(first.children).toHaveLength(1);
    expect(refused.children).toHaveLength(0);
    expect(refused.querySelector('kumwe-studio-standalone')).toBeNull();
    expect(later.children).toHaveLength(1);
    expect(resolver).toHaveBeenCalledTimes(3);

    await report.dispose();
    expect(first.children).toHaveLength(0);
    expect(later.children).toHaveLength(0);
  });
});

function deployment(instanceId: string, mount: string): StudioDeploymentConfiguration {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    instanceId,
    kind: 'studio-deployment',
    mount,
  };
}

function target(id: string, className?: string): HTMLDivElement {
  const element = document.createElement('div');
  element.id = id;
  if (className !== undefined) element.className = className;
  document.body.append(element);
  return element;
}

function configurationScript(
  id: string,
  configuration: unknown,
  type = 'application/json',
): HTMLScriptElement {
  const script = document.createElement('script');
  script.id = id;
  script.type = type;
  script.textContent = JSON.stringify(configuration);
  document.body.append(script);
  return script;
}

function testResolver(disposed: string[] = []): StudioDeploymentRuntimeResolver {
  return (targetElement, configuration) => {
    const element = document.createElement('section');
    element.dataset.instanceId = configuration.instanceId ?? configuration.mount ?? 'local';
    targetElement.append(element);
    return {
      dispose: () => {
        disposed.push(configuration.instanceId ?? configuration.mount ?? 'local');
        element.remove();
      },
      element,
    };
  };
}
