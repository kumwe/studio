import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCoreProductionBlockDefinitions } from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  type AuthoringSaveIntent,
  type AuthoringSaveItemRequest,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringSessionSnapshot,
  type AuthoringStartRequest,
  type AuthoringTypeSummary,
  type BlockDefinition,
  type DesignVocabulary,
  type FieldAdapterContribution,
  type HostRequestContext,
  type InspectorContribution,
  type MediaAsset,
  type MigrationDeclaration,
  type PatternDocument,
  type QualifiedName,
  type RemoveNodeCommand,
  type StudioConfiguration,
  type StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';
import { createStudioConfigurationFixture } from '@kumwe/studio-testkit';
import {
  clearStudioHostedErrorSurface,
  mountStudioHosted,
  StudioAuthoringControlRegistry,
  type StudioHostedHostErrorDetail,
  type StudioHostedSaveCompleteDetail,
  type StudioHostedSaveConfirmationDetail,
} from '../src/index.js';

const AUTHORING_OPERATIONS: readonly QualifiedName[] = [
  'studio.operation/authoring.resolve-target',
  'studio.operation/authoring.list-types',
  'studio.operation/authoring.start',
  'studio.operation/authoring.plan-save',
  'studio.operation/authoring.save-item',
  'studio.operation/authoring.save-new-type-version',
  'studio.operation/authoring.save-as-new-type',
];
const CONFIRMATION_CODE: QualifiedName = 'studio.test/confirm-save';
const fixture = alignFixtureWithBuiltInCatalog(
  JSON.parse(
    await readFile(join(process.cwd(), 'schemas/examples/authoring-session.example.json'), 'utf8'),
  ) as AuthoringSessionSnapshot,
);
const contributionFixtures = {
  block: JSON.parse(
    await readFile(join(process.cwd(), 'schemas/examples/block.price.example.json'), 'utf8'),
  ) as BlockDefinition,
  designVocabulary: JSON.parse(
    await readFile(join(process.cwd(), 'schemas/examples/design-vocabulary.example.json'), 'utf8'),
  ) as DesignVocabulary,
  fieldAdapter: JSON.parse(
    await readFile(join(process.cwd(), 'schemas/examples/field-adapter.example.json'), 'utf8'),
  ) as FieldAdapterContribution,
  inspector: JSON.parse(
    await readFile(join(process.cwd(), 'schemas/examples/inspector.example.json'), 'utf8'),
  ) as InspectorContribution,
  migration: JSON.parse(
    await readFile(join(process.cwd(), 'schemas/examples/migration.example.json'), 'utf8'),
  ) as MigrationDeclaration,
  pattern: JSON.parse(
    await readFile(join(process.cwd(), 'schemas/examples/pattern.example.json'), 'utf8'),
  ) as PatternDocument,
};

function alignFixtureWithBuiltInCatalog(
  source: AuthoringSessionSnapshot,
): AuthoringSessionSnapshot {
  const snapshot = structuredClone(source);
  const definition = createCoreProductionBlockDefinitions().find(
    (entry) => entry.type === 'studio.core/rich-text',
  );
  const root = snapshot.state.blueprint.roots[0];
  if (definition === undefined || root === undefined) {
    throw new Error('The hosted fixture requires the first-party rich-text block and one root.');
  }
  snapshot.state.blueprint.dependencyLock.blocks = [
    {
      revision: definition.revision,
      type: definition.type,
      version: definition.version,
    },
  ];
  root.type = definition.type;
  root.version = definition.version;
  return snapshot;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('hosted browser runtime', () => {
  it('resolves create authority, chooses an exact reusable type in the same mount, and then starts', async () => {
    const session = structuredClone(fixture);
    if (session.type === undefined || session.state.coordinates.type === undefined) {
      throw new Error('The hosted fixture requires one reusable content type.');
    }
    session.start = { kind: 'from-type', type: structuredClone(session.state.coordinates.type) };
    session.state.entry.values = {};
    const typeSummary: AuthoringTypeSummary = {
      blueprint: structuredClone(session.type.blueprint),
      label: structuredClone(session.type.label),
      model: structuredClone(session.type.model),
      reference: structuredClone(session.state.coordinates.type),
    };
    const server = createBrowserAuthoringServer(session, { createTypes: [typeSummary] });
    const configured = deployment(session);
    configured.launch.intent = 'create';
    configured.launch.start = { kind: 'blank' };
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);

    const mounting = mountStudioHosted(target, configured, {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      identifiers: deterministicIdentifiers(),
    });
    await expect.poll(() => target.querySelector('kumwe-studio-hosted-start')).not.toBeNull();
    const chooser = target.querySelector('kumwe-studio-hosted-start');
    if (chooser === null) throw new Error('Hosted Studio did not mount its start chooser.');
    await chooser.updateComplete;
    await expect
      .poll(() => chooser.shadowRoot?.querySelectorAll('input[type="radio"]').length)
      .toBe(2);

    const radios = chooser.shadowRoot?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    radios?.item(1).click();
    chooser.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.click();
    const runtime = await mounting;

    expect(server.startRequests).toHaveLength(1);
    expect(server.startRequests[0]?.source).toEqual({
      kind: 'from-type',
      type: typeSummary.reference,
    });
    expect(runtime.element.snapshot?.start).toEqual(server.startRequests[0]?.source);
    expect(target.querySelector('kumwe-studio-hosted-start')).toBeNull();
    runtime.dispose();
  });

  it('uses one core draft through edit, undo/redo, explicit confirmation, save, and reconciliation', async () => {
    const session = structuredClone(fixture);
    const server = createBrowserAuthoringServer(session);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);

    const runtime = await mountStudioHosted(target, deployment(session), {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      identifiers: deterministicIdentifiers(),
    });
    await runtime.element.updateComplete;

    const blueprint = runtime.element.blueprintElement;
    if (blueprint === undefined)
      throw new Error('Hosted Studio did not mount its Blueprint shell.');
    await blueprint.updateComplete;
    expect(runtime.admittedContributions.blockDefinitions.map((entry) => entry.type)).toEqual([
      'studio.core/rich-text',
    ]);
    expect(runtime.admittedContributions.patterns).toEqual([]);
    expect(blueprint.shadowRoot?.querySelectorAll('.palette button')).toHaveLength(1);
    const node = session.state.blueprint.roots[0];
    if (node === undefined) throw new Error('The hosted fixture requires one Blueprint node.');
    runtime.element.setEntryValue(['name'], 'Hosted round trip');
    expect(runtime.element.snapshot?.state.entry.values.name).toBe('Hosted round trip');
    const confirmation = nextEvent<StudioHostedSaveConfirmationDetail>(
      runtime.element,
      'studio-contextual-save-confirmation-required',
    );
    const saveFailure = nextEvent<{ error: { message: { defaultMessage?: string; key: string } } }>(
      runtime.element,
      'studio-host-error',
    ).then((detail) => {
      throw new Error(detail.error.message.defaultMessage ?? detail.error.message.key);
    });
    runtime.element.requestSave('save-item');
    const detail = await Promise.race([confirmation, saveFailure]);

    expect(server.saveRequests).toEqual([]);
    expect(detail.plan.confirmationRequired).toBe(true);
    const result = await detail.confirm([CONFIRMATION_CODE]);

    expect(server.plannedIntents).toHaveLength(1);
    expect(server.plannedIntents[0]?.draft).toMatchObject({
      entry: { values: { name: 'Hosted round trip' } },
      outcome: 'save-item',
    });
    expect(server.saveRequests[0]?.acceptedConsequences).toEqual([CONFIRMATION_CODE]);
    expect(result.session.state.entry.revision).toBe('entry-r8');
    expect(result.plan.successorContext).toEqual(detail.plan.successorContext);
    expect(result.session.presentation.returnContext).toEqual(detail.plan.successorContext);
    expect(runtime.element.snapshot?.state.entry).toMatchObject({
      revision: 'entry-r8',
      values: { name: 'Hosted round trip' },
    });
    expect(runtime.element.snapshot?.presentation.returnContext).toEqual(
      detail.plan.successorContext,
    );
    expect(runtime.element.dirty).toBe(false);

    const remove: RemoveNodeCommand = {
      artifactId: session.state.blueprint.id,
      baseStateVersion: blueprint.stateVersion,
      contractVersion: session.contractVersion,
      id: 'commands/hosted-remove',
      kind: 'command',
      payload: { nodeId: node.id },
      sessionGeneration: session.sessionGeneration,
      type: 'studio.command/remove-node',
    };
    blueprint.execute(remove);
    expect(runtime.element.snapshot?.state.blueprint.roots).toEqual([]);
    blueprint.undo();
    expect(runtime.element.snapshot?.state.blueprint.roots).toHaveLength(1);
    blueprint.redo();
    expect(runtime.element.snapshot?.state.blueprint.roots).toEqual([]);
    blueprint.undo();
    expect(runtime.element.snapshot?.state.blueprint.roots).toHaveLength(1);

    runtime.dispose();
    expect(target.children).toHaveLength(0);
  });

  it('bubbles a return request containing only the opaque host return context', async () => {
    const session = structuredClone(fixture);
    const server = createBrowserAuthoringServer(session);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    let detail: unknown;
    target.addEventListener('studio-contextual-return-request', (event) => {
      detail = (event as CustomEvent).detail;
    });
    const runtime = await mountStudioHosted(target, deployment(session), {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      identifiers: deterministicIdentifiers(),
    });

    runtime.element.shadowRoot
      ?.querySelector<HTMLButtonElement>('.contextual-return-button')
      ?.click();

    expect(detail).toEqual({ returnContext: session.presentation.returnContext });
    expect(Object.keys(detail as Record<string, unknown>)).toEqual(['returnContext']);
    expect(server.saveRequests).toEqual([]);
    expect(runtime.element.isConnected).toBe(true);
    runtime.dispose();
  });

  it('retains a safe canonical alert for configured open failure and clears it on demand', async () => {
    const session = structuredClone(fixture);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    const observedErrors: StudioHostedHostErrorDetail[] = [];
    target.addEventListener('studio-host-error', (event) => {
      observedErrors.push((event as CustomEvent<StudioHostedHostErrorDetail>).detail);
    });

    await expect(
      mountStudioHosted(target, deployment(session), {
        adapter: {
          currentTimeMilliseconds: () => 0,
          fetchImplementation: () =>
            Promise.resolve(
              new Response(
                JSON.stringify({
                  category: 'forbidden',
                  contractVersion: STUDIO_CONTRACT_VERSION,
                  kind: 'host-error',
                  message: {
                    defaultMessage: 'This resource is not available for authoring.',
                    key: 'studio.test/forbidden',
                  },
                  retryable: false,
                }),
                { headers: { 'content-type': 'application/json' }, status: 403 },
              ),
            ),
        },
        identifiers: deterministicIdentifiers(),
      }),
    ).rejects.toMatchObject({ error: { category: 'forbidden' } });

    const alert = target.querySelector<HTMLElement>('[data-studio-host-error="true"]');
    expect(alert).toMatchObject({ hidden: false, role: 'alert' });
    expect(alert?.textContent).toBe('This resource is not available for authoring.');
    expect(target.querySelector('kumwe-studio-contextual')).toBeNull();
    expect(observedErrors).toHaveLength(1);
    expect(observedErrors[0]?.error.category).toBe('forbidden');
    expect(observedErrors[0]?.operation).toBe('open');

    clearStudioHostedErrorSurface(target);
    expect(target.children).toHaveLength(0);
  });

  it('fails closed instead of exposing defaults when the host omits an opened block lock', async () => {
    const session = structuredClone(fixture);
    const configured = deployment(session);
    configured.session.blocks = [];
    const server = createBrowserAuthoringServer(session);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);

    await expect(
      mountStudioHosted(target, configured, {
        adapter: { currentTimeMilliseconds: () => 0, fetchImplementation: server.fetch },
        identifiers: deterministicIdentifiers(),
      }),
    ).rejects.toThrow('absent from the resolved Studio session');

    expect(target.querySelector('kumwe-studio-contextual')).toBeNull();
    expect(target.querySelector<HTMLElement>('[data-studio-host-error="true"]')).toMatchObject({
      hidden: false,
      role: 'alert',
    });
  });

  it('replaces a retained failed-open alert when a later default-clock mount succeeds', async () => {
    const session = structuredClone(fixture);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    await expect(
      mountStudioHosted(target, deployment(session), {
        adapter: {
          fetchImplementation: () => Promise.resolve(new Response('', { status: 503 })),
        },
        identifiers: deterministicIdentifiers(),
      }),
    ).rejects.toBeDefined();
    expect(target.querySelectorAll('[data-studio-host-error="true"]')).toHaveLength(1);

    const server = createBrowserAuthoringServer(session);
    const retry = await mountStudioHosted(target, deployment(session), {
      adapter: { fetchImplementation: server.fetch },
      identifiers: deterministicIdentifiers(),
    });

    const surfaces = target.querySelectorAll<HTMLElement>('[data-studio-host-error="true"]');
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]?.hidden).toBe(true);
    expect(target.querySelectorAll('kumwe-studio-contextual')).toHaveLength(1);
    retry.dispose();
    expect(target.children).toHaveLength(0);
  });

  it('automatically commits a plan that requires no consequence confirmation exactly once', async () => {
    const session = structuredClone(fixture);
    const server = createBrowserAuthoringServer(session, { confirmationRequired: false });
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    const runtime = await mountStudioHosted(target, deployment(session), {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      identifiers: deterministicIdentifiers(),
    });
    runtime.element.setEntryValue(['name'], 'Automatic save');
    const completed = nextEvent<StudioHostedSaveCompleteDetail>(
      runtime.element,
      'studio-contextual-save-complete',
    );

    runtime.element.requestSave('save-item');
    await completed;

    expect(server.plannedIntents).toHaveLength(1);
    expect(server.saveRequests).toHaveLength(1);
    expect(runtime.pendingSaveConfirmation).toBeUndefined();
    expect(runtime.element.snapshot?.state.entry.values.name).toBe('Automatic save');
    runtime.dispose();
  });

  it('cancels a consequence plan without invoking a durable save', async () => {
    const session = structuredClone(fixture);
    const server = createBrowserAuthoringServer(session);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    const runtime = await mountStudioHosted(target, deployment(session), {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      identifiers: deterministicIdentifiers(),
    });
    runtime.element.setEntryValue(['name'], 'Cancelled save');
    const confirmation = nextEvent<StudioHostedSaveConfirmationDetail>(
      runtime.element,
      'studio-contextual-save-confirmation-required',
    );

    runtime.element.requestSave('save-item');
    const detail = await confirmation;
    detail.cancel();
    await Promise.resolve();

    expect(server.plannedIntents).toHaveLength(1);
    expect(server.saveRequests).toEqual([]);
    expect(runtime.pendingSaveConfirmation).toBeUndefined();
    expect(runtime.element.dirty).toBe(true);
    runtime.dispose();
  });

  it('consumes the internal save intent at Studio while public completion still reaches ancestors', async () => {
    const session = structuredClone(fixture);
    const server = createBrowserAuthoringServer(session, { confirmationRequired: false });
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    let leakedSaveRequests = 0;
    target.addEventListener('studio-contextual-save-request', () => {
      leakedSaveRequests += 1;
    });
    document.body.append(target);
    const runtime = await mountStudioHosted(target, deployment(session), {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      identifiers: deterministicIdentifiers(),
    });
    const complete = nextEvent<StudioHostedSaveCompleteDetail>(
      target,
      'studio-contextual-save-complete',
    );

    runtime.element.requestSave('save-item');
    await complete;

    expect(leakedSaveRequests).toBe(0);
    expect(server.plannedIntents).toHaveLength(1);
    expect(server.saveRequests).toHaveLength(1);
    runtime.dispose();
  });

  it('provides an ARIA confirmation surface with safe focus, Escape cancel, and explicit confirm', async () => {
    const session = structuredClone(fixture);
    const server = createBrowserAuthoringServer(session);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    const runtime = await mountStudioHosted(target, deployment(session), {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      identifiers: deterministicIdentifiers(),
    });
    const saveButton = runtime.element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.contextual-save-button[data-outcome="save-item"]',
    );
    if (saveButton === null || saveButton === undefined) {
      throw new Error('The contextual save button was not rendered.');
    }
    saveButton.focus();
    const firstConfirmation = nextEvent<StudioHostedSaveConfirmationDetail>(
      runtime.element,
      'studio-contextual-save-confirmation-required',
    );

    runtime.element.requestSave('save-item');
    await firstConfirmation;

    const surface = target.querySelector<HTMLElement>('[data-studio-save-confirmation="true"]');
    const cancel = surface?.querySelector<HTMLButtonElement>(
      '[data-studio-save-confirmation-action="cancel"]',
    );
    const confirm = surface?.querySelector<HTMLButtonElement>(
      '[data-studio-save-confirmation-action="confirm"]',
    );
    expect(surface).toMatchObject({ hidden: false, role: 'alertdialog' });
    expect(surface?.getAttribute('aria-modal')).toBe('true');
    expect(surface?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(surface?.getAttribute('aria-describedby')).toContain('consequences');
    expect(cancel).toBe(document.activeElement);
    expect(surface?.textContent).toContain('Confirm this save.');

    surface?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(runtime.pendingSaveConfirmation).toBeUndefined();
    expect(surface?.hidden).toBe(true);
    expect(runtime.element.shadowRoot?.activeElement).toBe(saveButton);
    expect(server.saveRequests).toEqual([]);

    const secondConfirmation = nextEvent<StudioHostedSaveConfirmationDetail>(
      runtime.element,
      'studio-contextual-save-confirmation-required',
    );
    runtime.element.requestSave('save-item');
    await secondConfirmation;
    const completed = nextEvent<StudioHostedSaveCompleteDetail>(
      target,
      'studio-contextual-save-complete',
    );
    confirm?.click();
    await completed;

    expect(server.saveRequests).toHaveLength(1);
    expect(server.saveRequests[0]?.acceptedConsequences).toEqual([CONFIRMATION_CODE]);
    expect(surface?.hidden).toBe(true);
    runtime.dispose();
  });

  it('supports a precompiled confirmation override without requiring declarative host JavaScript', async () => {
    const session = structuredClone(fixture);
    const server = createBrowserAuthoringServer(session);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    const requests: AuthoringSavePlan[] = [];
    const runtime = await mountStudioHosted(target, deployment(session), {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      identifiers: deterministicIdentifiers(),
      saveConfirmationHandler(request) {
        requests.push(structuredClone(request.plan));
        return [CONFIRMATION_CODE];
      },
    });
    const completed = nextEvent<StudioHostedSaveCompleteDetail>(
      runtime.element,
      'studio-contextual-save-complete',
    );

    runtime.element.requestSave('save-item');
    await completed;

    expect(requests).toHaveLength(1);
    expect(server.saveRequests).toHaveLength(1);
    expect(
      target.querySelector<HTMLElement>('[data-studio-save-confirmation="true"]')?.hidden,
    ).toBe(true);
    runtime.dispose();
  });

  it('composes advertised resource and browse-only media ports into the mounted shell', async () => {
    const session = structuredClone(fixture);
    session.target.resourceTypes = [...session.target.resourceTypes, 'studio.test/article'];
    const configured = deployment(session);
    configured.session.hostCapabilities.ports.push(
      {
        id: 'studio.port/resource',
        operations: ['studio.operation/resource.search'],
        version: '1.0.0',
      },
      {
        id: 'studio.port/media',
        operations: ['studio.operation/media.get', 'studio.operation/media.list'],
        version: '1.0.0',
      },
    );
    const server = createBrowserAuthoringServer(session);
    const media: MediaAsset = {
      byteSize: 100,
      contractVersion: STUDIO_CONTRACT_VERSION,
      filename: 'hosted.png',
      id: 'media/hosted',
      kind: 'media-asset',
      mediaKind: 'image',
      mediaType: 'image/png',
      metadata: { height: 10, width: 20 },
      revision: 'media-r1',
      state: 'ready',
    };
    const serviceContexts: HostRequestContext[] = [];
    const fetch: typeof globalThis.fetch = (input, init) => {
      const route = new Headers(init?.headers).get('x-studio-operation');
      if (route === 'resource/search' || route === 'media/get' || route === 'media/list') {
        if (typeof init?.body !== 'string') throw new TypeError('Expected a service JSON body.');
        const body = JSON.parse(init.body) as { context: HostRequestContext };
        serviceContexts.push(body.context);
        const value =
          route === 'resource/search'
            ? {
                items: [
                  {
                    id: 'articles/hosted',
                    label: { defaultMessage: 'Hosted article', key: 'studio.test/hosted-article' },
                    resourceType: 'studio.test/article',
                  },
                ],
              }
            : route === 'media/get'
              ? media
              : { assets: [media] };
        return Promise.resolve(
          new Response(JSON.stringify({ value }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
        );
      }
      return server.fetch(input, init);
    };
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    const runtime = await mountStudioHosted(target, configured, {
      adapter: { currentTimeMilliseconds: () => 0, fetchImplementation: fetch },
      identifiers: deterministicIdentifiers(),
    });

    const resourceSearch = runtime.element.resourceSearchService;
    if (resourceSearch === undefined) throw new Error('Expected resource search composition.');
    await expect(
      resourceSearch.search(
        { limit: 20, resourceType: 'studio.test/article' },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ items: [{ id: 'articles/hosted' }] });

    const mediaHolder = document.createElement('div');
    document.body.append(mediaHolder);
    const mediaControl = await runtime.element.authoringControlRegistry?.mount(
      'studio.control/media-reference',
      { holder: mediaHolder, value: undefined },
    );
    if (mediaControl === undefined) throw new Error('Expected a hosted media control.');
    await expect
      .poll(() => mediaHolder.querySelector('[aria-label="Select hosted.png (image)"]'))
      .not.toBeNull();
    expect(
      mediaHolder.querySelector<HTMLInputElement>('[aria-label="Upload media"]')?.disabled,
    ).toBe(true);
    expect(serviceContexts.map((context) => context.operationId)).toEqual([
      'studio.operation/resource.search',
      'studio.operation/media.list',
    ]);
    expect(new Set(serviceContexts.map((context) => context.requestId)).size).toBe(2);

    mediaControl.destroy();
    mediaHolder.remove();
    runtime.dispose();
  });

  it('retains and wires every target-admitted declarative contribution family', async () => {
    const session = structuredClone(fixture);
    const configured = deploymentWithContributions(session);
    const server = createBrowserAuthoringServer(session);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);
    const extensionControl = (control: QualifiedName) => ({
      control,
      mount(options: { holder: HTMLElement; readOnly?: boolean; value: unknown }) {
        return {
          destroy(): void {
            options.holder.replaceChildren();
          },
          focus(): void {
            options.holder.focus();
          },
          readOnly: options.readOnly === true,
          value: () => options.value,
        };
      },
    });
    const authoringControlRegistry = new StudioAuthoringControlRegistry({
      extensionControls: [
        extensionControl(contributionFixtures.fieldAdapter.control),
        extensionControl('org.example.control/not-admitted'),
      ],
    });
    const runtime = await mountStudioHosted(target, configured, {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: server.fetch,
      },
      authoringControlRegistry,
      identifiers: deterministicIdentifiers(),
    });
    const admitted = runtime.admittedContributions;

    expect(admitted.blockDefinitions.map((entry) => entry.type)).toEqual([
      'studio.core/rich-text',
      contributionFixtures.block.type,
    ]);
    expect(admitted.patterns.map((entry) => entry.id)).toEqual([contributionFixtures.pattern.id]);
    expect(admitted.fieldAdapters.map((entry) => entry.id)).toEqual([
      contributionFixtures.fieldAdapter.id,
    ]);
    expect(admitted.designVocabularies.map((entry) => entry.id)).toEqual([
      contributionFixtures.designVocabulary.id,
    ]);
    expect(admitted.inspectors.map((entry) => entry.id)).toEqual([
      contributionFixtures.inspector.id,
    ]);
    expect(admitted.migrations.map((entry) => entry.id)).toEqual([
      contributionFixtures.migration.id,
    ]);
    const elementContributions = runtime.element.admittedContributions;
    if (elementContributions === undefined) {
      throw new Error('The contextual element did not retain its admitted contributions.');
    }
    expect([
      ...elementContributions.blockDefinitions.map((entry) => entry.kind),
      ...elementContributions.designVocabularies.map((entry) => entry.kind),
      ...elementContributions.fieldAdapters.map((entry) => entry.kind),
      ...elementContributions.inspectors.map((entry) => entry.kind),
      ...elementContributions.migrations.map((entry) => entry.kind),
      ...elementContributions.patterns.map((entry) => entry.kind),
    ]).toEqual([
      'block-definition',
      'block-definition',
      'design-vocabulary',
      'field-adapter',
      'inspector',
      'migration',
      'pattern',
    ]);
    expect(runtime.element.configuration?.blockDefinitions).toContainEqual(
      contributionFixtures.block,
    );
    expect(
      runtime.element.patterns?.some((entry) => entry.id === contributionFixtures.pattern.id),
    ).toBe(true);
    expect(runtime.element.designControls?.map((entry) => entry.id)).toEqual(
      contributionFixtures.designVocabulary.designControls.map((entry) => entry.id),
    );
    expect(
      runtime.element.authoringControlRegistry?.supports(contributionFixtures.fieldAdapter.control),
    ).toBe(true);
    expect(
      runtime.element.authoringControlRegistry?.supports('org.example.control/not-admitted'),
    ).toBe(false);

    (admitted.inspectors as InspectorContribution[]).splice(0);
    expect(runtime.admittedContributions.inspectors).toHaveLength(1);
    runtime.dispose();
  });

  it('rejects cross-owner contribution collisions without publishing partial browser state', async () => {
    const session = structuredClone(fixture);
    const configured = deploymentWithContributions(session);
    const bundle = configured.contributions;
    if (bundle === undefined) throw new Error('The collision fixture requires contributions.');
    const collidingBlock: BlockDefinition = {
      ...structuredClone(contributionFixtures.block),
      owner: { id: 'org.example/collision', version: '1.0.0' },
    };
    configured.contributions = {
      generation: bundle.generation,
      payloads: [...bundle.payloads, collidingBlock],
    };
    const server = createBrowserAuthoringServer(session);
    const target = document.createElement('div');
    target.id = 'hosted-studio';
    document.body.append(target);

    await expect(
      mountStudioHosted(target, configured, {
        adapter: {
          currentTimeMilliseconds: () => 0,
          fetchImplementation: server.fetch,
        },
        identifiers: deterministicIdentifiers(),
      }),
    ).rejects.toThrow('studio.contribution/cross-owner-collision');

    expect(target.querySelector('kumwe-studio-contextual')).toBeNull();
    expect(target.querySelector('[data-studio-save-confirmation="true"]')).toBeNull();
    expect(target.querySelector<HTMLElement>('[data-studio-host-error="true"]')).toMatchObject({
      hidden: false,
      role: 'alert',
    });

    clearStudioHostedErrorSurface(target);
    const retrySession = structuredClone(fixture);
    const retryServer = createBrowserAuthoringServer(retrySession);
    const retry = await mountStudioHosted(target, deploymentWithContributions(retrySession), {
      adapter: {
        currentTimeMilliseconds: () => 0,
        fetchImplementation: retryServer.fetch,
      },
      identifiers: deterministicIdentifiers(),
    });
    expect(retry.admittedContributions.blockDefinitions).toHaveLength(2);
    retry.dispose();
  });
});

interface BrowserAuthoringServer {
  readonly fetch: typeof fetch;
  readonly plannedIntents: AuthoringSaveIntent[];
  readonly saveRequests: AuthoringSaveItemRequest[];
  readonly startRequests: AuthoringStartRequest[];
}

function createBrowserAuthoringServer(
  initial: AuthoringSessionSnapshot,
  options: {
    confirmationRequired?: boolean;
    createTypes?: readonly AuthoringTypeSummary[];
  } = {},
): BrowserAuthoringServer {
  const plannedIntents: AuthoringSaveIntent[] = [];
  const saveRequests: AuthoringSaveItemRequest[] = [];
  const startRequests: AuthoringStartRequest[] = [];
  const confirmationRequired = options.confirmationRequired ?? true;
  const plan: AuthoringSavePlan = {
    affectedArtifacts: ['entry'],
    confirmationRequired,
    consequences: confirmationRequired
      ? [
          {
            code: CONFIRMATION_CODE,
            message: { defaultMessage: 'Confirm this save.', key: CONFIRMATION_CODE },
            severity: 'warning',
          },
        ]
      : [],
    contractVersion: initial.contractVersion,
    expected: structuredClone(initial.state.coordinates),
    id: 'save-plans/hosted-item',
    kind: 'authoring-save-plan',
    outcome: 'save-item',
    revision: 'save-plan-r1',
    sessionId: initial.sessionId,
    successorContext: { key: 'returns/hosted-item-r8' },
  };

  const browserFetch: typeof fetch = (_input, init) => {
    const headers = new Headers(init?.headers);
    expect(headers.get('x-studio-csrf')).toBe('csrf-test');
    const route = headers.get('x-studio-operation');
    if (typeof init?.body !== 'string') {
      throw new TypeError('The browser adapter must send a JSON string body.');
    }
    const body = JSON.parse(init.body) as {
      arguments: Record<string, unknown>;
      context: HostRequestContext;
    };
    let value: unknown;
    switch (route) {
      case 'authoring/resolve-target':
        value = {
          availableStarts:
            options.createTypes === undefined ? ['existing'] : ['blank', 'from-type'],
          initialPresentation: 'inline',
          resourceContext: structuredClone(initial.resourceContext),
          returnContext: structuredClone(initial.presentation.returnContext),
          target: structuredClone(initial.target),
        };
        break;
      case 'authoring/list-types':
        value = { items: structuredClone(options.createTypes ?? []) };
        break;
      case 'authoring/start': {
        const request = structuredClone(body.arguments.request as AuthoringStartRequest);
        startRequests.push(request);
        value = structuredClone(initial);
        break;
      }
      case 'authoring/plan-save':
        plannedIntents.push(structuredClone(body.arguments.intent as AuthoringSaveIntent));
        value = structuredClone(plan);
        break;
      case 'authoring/save-item': {
        const request = structuredClone(body.arguments.request as AuthoringSaveItemRequest);
        saveRequests.push(request);
        const accepted = structuredClone(initial);
        accepted.state.entry = { ...request.draft.entry, revision: 'entry-r8' };
        accepted.state.coordinates.entry = {
          id: accepted.state.entry.id,
          revision: accepted.state.entry.revision,
        };
        accepted.state.dirty = [];
        accepted.presentation.returnContext = structuredClone(plan.successorContext);
        const result: AuthoringSaveResult = {
          contractVersion: initial.contractVersion,
          kind: 'authoring-save-result',
          outcome: 'save-item',
          plan: structuredClone(request.plan),
          session: accepted,
        };
        value = result;
        break;
      }
      default:
        return Promise.resolve(new Response('', { status: 404 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ value }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
  };
  return { fetch: browserFetch, plannedIntents, saveRequests, startRequests };
}

function deployment(session: AuthoringSessionSnapshot): StudioHostedDeploymentConfiguration {
  const configuration: StudioConfiguration = createStudioConfigurationFixture({ mode: 'content' });
  configuration.artifacts = {
    blueprint: structuredClone(session.state.coordinates.blueprint),
    entry: structuredClone(session.state.coordinates.entry),
    model: structuredClone(session.state.coordinates.model),
  };
  configuration.blocks = structuredClone(session.state.blueprint.dependencyLock.blocks);
  configuration.hostCapabilities = {
    capabilities: [],
    contractVersion: STUDIO_CONTRACT_VERSION,
    host: { generation: 'host-r1', id: 'studio.test/hosted', version: '1.0.0' },
    kind: 'host-capabilities',
    ports: [
      {
        id: 'studio.port/authoring',
        operations: [...AUTHORING_OPERATIONS],
        version: '1.0.0',
      },
    ],
    protocolVersions: [configuration.protocolVersion],
  };
  configuration.resourceContext = structuredClone(session.resourceContext);
  configuration.sessionGeneration = session.sessionGeneration;
  configuration.sessionId = session.sessionId;
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    instanceId: 'hosted-test',
    kind: 'studio-deployment',
    launch: {
      initialPresentation: 'inline',
      intent: 'edit',
      resourceContext: structuredClone(session.resourceContext),
      start: { kind: 'existing' },
      targetId: session.target.id,
    },
    mount: '#hosted-studio',
    release: {
      corpusManifestDigest: 'sha256-HCQ5pF8NMk9nPOXfU6kVX/E8sjgJjHdyDQ86CTOjGi0=',
      version: '0.1.0-beta.2',
    },
    session: configuration,
    transport: {
      authentication: {
        credentials: 'same-origin',
        csrf: { headerName: 'x-studio-csrf', token: 'csrf-test' },
        kind: 'same-origin-session',
      },
      kind: 'http',
      routing: { endpoint: '/studio-authoring', kind: 'single-endpoint' },
    },
  };
}

function deploymentWithContributions(
  session: AuthoringSessionSnapshot,
): StudioHostedDeploymentConfiguration {
  const owner = structuredClone(session.target.owner);
  const block = { ...structuredClone(contributionFixtures.block), owner };
  const designVocabulary = {
    ...structuredClone(contributionFixtures.designVocabulary),
    owner,
  };
  const fieldAdapter = { ...structuredClone(contributionFixtures.fieldAdapter), owner };
  const inspector = { ...structuredClone(contributionFixtures.inspector), owner };
  const migration = { ...structuredClone(contributionFixtures.migration), owner };
  const patternId: QualifiedName = 'patterns/hero-with-caption';
  const pattern: PatternDocument = {
    ...structuredClone(contributionFixtures.pattern),
    blockDependencies: [{ revision: block.revision, type: block.type, version: block.version }],
    id: patternId,
    owner,
    roots: [
      {
        authoring: { mode: 'designer' },
        bindings: {},
        id: 'price-pattern-node',
        properties: {},
        slots: {},
        type: block.type,
        version: block.version,
      },
    ],
  };
  session.target.contributionDependencies = [
    { id: block.type, kind: 'block-definition', required: true, versions: block.version },
    {
      id: designVocabulary.id,
      kind: 'design-vocabulary',
      required: true,
      versions: designVocabulary.version,
    },
    {
      id: fieldAdapter.id,
      kind: 'field-adapter',
      required: true,
      versions: fieldAdapter.version,
    },
    { id: inspector.id, kind: 'inspector', required: true, versions: inspector.version },
    { id: migration.id, kind: 'migration', required: true, versions: migration.version },
    { id: patternId, kind: 'pattern', required: true, versions: pattern.version },
  ];
  const configured = deployment(session);
  configured.session.blocks.push({
    revision: block.revision,
    type: block.type,
    version: block.version,
  });
  configured.session.hostCapabilities.capabilities = [
    { id: 'studio.capability/custom-inspectors', version: '1.0.0' },
    { id: 'studio.capability/field-controls', version: '1.0.0' },
  ];
  configured.contributions = {
    generation: session.contributionGeneration,
    payloads: [block, designVocabulary, fieldAdapter, inspector, migration, pattern],
  };
  return configured;
}

function deterministicIdentifiers() {
  let serial = 0;
  return {
    idempotencyKey(): string {
      serial += 1;
      return `idempotency/hosted-${String(serial)}`;
    },
    requestId(): string {
      serial += 1;
      return `requests/hosted-${String(serial)}`;
    },
  };
}

function nextEvent<TDetail>(target: EventTarget, type: string): Promise<TDetail> {
  return new Promise((resolve) => {
    target.addEventListener(type, (event) => resolve((event as CustomEvent<TDetail>).detail), {
      once: true,
    });
  });
}
