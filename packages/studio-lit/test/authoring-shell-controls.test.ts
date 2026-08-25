import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coreProductionInitialProperties,
  createCoreProductionBlockDefinitions,
} from '@kumwe/studio-core';
import type {
  BlockDefinition,
  BlockType,
  BlueprintNode,
  FieldBinding,
  JsonValue,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  defineTestBlock,
} from '@kumwe/studio-testkit';
import {
  createStudioStandaloneSetup,
  defineKumweStudio,
  KumweStudioElement,
} from '../src/index.js';

vi.mock('@editorjs/editorjs', () => ({
  default: class FakeEditorJsRuntime {
    public readonly caret = { focus: (): boolean => true };
    public readonly isReady = Promise.resolve();
    readonly #configuration: Record<string, unknown>;

    public constructor(configuration: Record<string, unknown>) {
      this.#configuration = configuration;
      const holder = configuration.holder;
      if (holder instanceof HTMLElement) {
        const marker = document.createElement('div');
        marker.className = 'fake-editorjs-runtime';
        marker.textContent = 'Editor.js runtime';
        holder.append(marker);
      }
    }

    public destroy(): void {
      return undefined;
    }

    public render(data: unknown): Promise<void> {
      this.#configuration.data = data;
      return Promise.resolve();
    }

    public save(): Promise<unknown> {
      return Promise.resolve(this.#configuration.data);
    }
  },
}));

afterEach(() => {
  document.body.replaceChildren();
});

const staticBinding = (value: JsonValue): FieldBinding => ({
  onError: 'error',
  onNull: 'empty',
  source: { kind: 'static-value', value },
  transforms: [],
});

function productionNode(
  id: string,
  type: BlockType,
  bindings: Record<string, FieldBinding>,
): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings,
    id,
    properties: coreProductionInitialProperties(type as never),
    slots: {},
    type,
    version: '1.0.0',
  };
}

async function mount(
  roots: BlueprintNode[],
  definitions?: BlockDefinition[],
): Promise<KumweStudioElement> {
  defineKumweStudio();
  const element = new KumweStudioElement();
  element.configuration = {
    ...(definitions === undefined ? {} : { blockDefinitions: definitions }),
    session: createStudioConfigurationFixture(),
  };
  element.document = createBlueprintFixture({ roots });
  document.body.append(element);
  await element.updateComplete;
  return element;
}

async function select(element: KumweStudioElement, nodeId: string): Promise<void> {
  element.selectNode(nodeId);
  await element.updateComplete;
  await element.authoringReady;
}

describe('Studio shell authoring-control lifecycle', () => {
  it('owns the first-party catalog and exposes an append-only standalone bootstrap', async () => {
    const element = await mount([]);
    const palette = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.palette button') ?? []),
    ];
    expect(palette.length).toBe(createCoreProductionBlockDefinitions().length + 10);
    expect(palette.some((button) => button.textContent?.includes('Rich Text'))).toBe(true);

    const extension = defineTestBlock({ label: 'Host entity', type: 'host.entity/card' });
    const setup = createStudioStandaloneSetup(createStudioConfigurationFixture(), {
      blockDefinitions: [extension],
    });
    expect(setup.configuration.blockDefinitions?.at(-1)?.type).toBe('host.entity/card');
    const firstPartyDefinition = createCoreProductionBlockDefinitions()[0];
    if (firstPartyDefinition === undefined) throw new Error('Missing first-party definition.');
    expect(() =>
      createStudioStandaloneSetup(createStudioConfigurationFixture(), {
        blockDefinitions: [firstPartyDefinition],
      }),
    ).toThrow(/already registered/u);
  });

  it('mounts catalog controls in the live inspector and persists canonical static values', async () => {
    const richText = productionNode('rich', 'studio.core/rich-text', {
      content: staticBinding({
        content: [{ content: [{ text: 'Hello', type: 'text' }], type: 'paragraph' }],
        type: 'doc',
      }),
    });
    const source = productionNode('source', 'studio.core/code', {
      source: staticBinding('const answer = 41;'),
    });
    const chart = productionNode('chart', 'studio.core/chart', {
      chart: staticBinding({
        datasets: [{ label: 'Sales', values: [10] }],
        labels: ['January'],
        type: 'bar',
      }),
    });
    const money = productionNode('money', 'studio.core/money', {
      amount: staticBinding({ amount: '19.95', currency: 'NAD' }),
    });
    const element = await mount([richText, source, chart, money]);

    await select(element, 'rich');
    expect(element.shadowRoot?.querySelector('.fake-editorjs-runtime')).not.toBeNull();

    await select(element, 'source');
    const sourceField =
      element.shadowRoot?.querySelector<HTMLTextAreaElement>('.studio-source-editor');
    if (sourceField === null || sourceField === undefined) throw new Error('Missing source field.');
    sourceField.value = 'const answer = 42;';
    sourceField.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await element.updateComplete;
    await element.authoringReady;
    expect(
      element.document?.roots.find((node) => node.id === 'source')?.bindings.source?.source,
    ).toEqual({ kind: 'static-value', value: 'const answer = 42;' });

    await select(element, 'chart');
    expect(element.shadowRoot?.querySelector('table[aria-label="Chart data"]')).not.toBeNull();

    await select(element, 'money');
    expect(
      element.shadowRoot?.querySelector<HTMLInputElement>('[aria-label="Exact decimal amount"]')
        ?.value,
    ).toBe('19.95');
  });

  it('mounts governed property controls, forwards read-only state and surfaces failures', async () => {
    const scopedDefinition: BlockDefinition = {
      ...defineTestBlock({
        label: 'Scoped presentation',
        propertySchema: { additionalProperties: true, type: 'object' },
        type: 'host.presentation/scoped',
      }),
      propertyControls: [{ control: 'studio.control/scoped-css', property: 'styles' }],
    };
    const dynamicSource = productionNode('dynamic-source', 'studio.core/code', {
      source: {
        onError: 'error',
        onNull: 'empty',
        source: { key: 'host/current-source', kind: 'context-value' },
        transforms: [],
      },
    });
    const scoped: BlueprintNode = {
      authoring: { mode: 'content' },
      bindings: {},
      id: 'scoped',
      properties: {},
      slots: {},
      type: scopedDefinition.type,
      version: scopedDefinition.version,
    };
    const element = await mount(
      [dynamicSource, scoped],
      [...createCoreProductionBlockDefinitions(), scopedDefinition],
    );

    await select(element, 'dynamic-source');
    expect(
      element.shadowRoot?.querySelector<HTMLTextAreaElement>('.studio-source-editor')?.disabled,
    ).toBe(true);

    await select(element, 'scoped');
    const styleSource = element.shadowRoot?.querySelector<HTMLTextAreaElement>(
      '[aria-label="Scoped CSS source"]',
    );
    expect(styleSource).not.toBeNull();
    expect(
      element.shadowRoot?.querySelector('.inspector-property-input[data-property="styles"]'),
    ).toBeNull();
    const changes: unknown[] = [];
    element.addEventListener('studio-scoped-style-change', (event) => {
      changes.push((event as CustomEvent).detail);
    });
    if (styleSource === null || styleSource === undefined) throw new Error('Missing style source.');
    styleSource.value = 'self { color: red; }';
    styleSource.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(changes).toEqual([
      {
        nodeId: 'scoped',
        value: { rules: [{ declarations: { color: 'red' }, target: 'self' }] },
      },
    ]);
    expect(element.document?.roots.find((node) => node.id === 'scoped')?.properties).toEqual({});
  });
});
