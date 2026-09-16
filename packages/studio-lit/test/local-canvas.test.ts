import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coreProductionInitialProperties,
  createCoreProductionBlockDefinitions,
} from '@kumwe/studio-core';
import type {
  AuthoringSessionSnapshot,
  BlueprintNode,
  FieldDefinition,
} from '@kumwe/studio-protocol';
import {
  createStudioStandaloneProject,
  createStudioStandaloneRuntime,
  defineKumweStudio,
  type KumweStudioElement,
  type KumweStudioStandaloneElement,
} from '../src/index.js';

function headingProject(text: string): AuthoringSessionSnapshot {
  const project = createStudioStandaloneProject();
  const definition = createCoreProductionBlockDefinitions().find(
    (item) => item.type === 'studio.core/heading',
  );
  if (definition === undefined) throw new Error('Missing heading definition.');
  const node: BlueprintNode = {
    id: 'page-heading',
    type: definition.type,
    version: definition.version,
    authoring: { mode: 'content' },
    properties: coreProductionInitialProperties('studio.core/heading'),
    slots: {},
    bindings: {
      text: {
        source: { kind: 'static-value', value: text },
        onError: 'error',
        onNull: 'empty',
        transforms: [],
      },
    },
  };
  project.state.blueprint.roots = [node];
  return project;
}

async function settle(element: KumweStudioStandaloneElement): Promise<KumweStudioElement> {
  await element.updateComplete;
  const contextual = element.contextualElement;
  if (contextual === undefined) throw new Error('Missing contextual editor.');
  await contextual.updateComplete;
  const shell = contextual.blueprintElement;
  if (shell === undefined) throw new Error('Missing Blueprint editor.');
  await shell.updateComplete;
  await shell.canvasReady;
  await shell.updateComplete;
  return shell;
}

function renderedRoot(shell: KumweStudioElement): ShadowRoot {
  const root = shell.shadowRoot?.querySelector('.local-canvas-host')?.shadowRoot;
  if (root == null) throw new Error('Missing rendered canvas root.');
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('public standalone visual canvas', () => {
  it('renders the real semantic heading under isolated styles and escapes authored markup', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const element = createStudioStandaloneRuntime({
      initialProject: headingProject('<img src=x onerror=alert(1)>A page'),
    });
    document.body.append(element);
    const shell = await settle(element);
    const canvas = renderedRoot(shell);
    expect(canvas.querySelector('h2')?.textContent).toBe('<img src=x onerror=alert(1)>A page');
    expect(canvas.querySelector('img,script,style,iframe')).toBeNull();
    expect(canvas.querySelectorAll('[data-studio-node]')).toHaveLength(1);
    expect(shell.shadowRoot?.querySelector('.structural-canvas-fallback')).toBeNull();
    expect(canvas.adoptedStyleSheets).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps rendered instances isolated and rebuilds the same visible page after export/import', async () => {
    const first = createStudioStandaloneRuntime({ initialProject: headingProject('First page') });
    const second = createStudioStandaloneRuntime();
    document.body.append(first, second);
    const left = await settle(first);
    const right = await settle(second);
    expect(renderedRoot(left).querySelector('h2')?.textContent).toBe('First page');
    expect(renderedRoot(right).querySelectorAll('[data-studio-node]')).toHaveLength(0);
    second.importProjectJson(first.exportProjectJson());
    await settle(second);
    expect(renderedRoot(right).querySelector('h2')?.textContent).toBe('First page');
    first.remove();
    expect(renderedRoot(right).querySelector('h2')?.textContent).toBe('First page');
  });

  it('updates Entry-bound content without replacing the Blueprint binding', async () => {
    const project = headingProject('Unused static text');
    const field: FieldDefinition = {
      id: 'title',
      kind: 'string',
      label: { key: 'studio.local/title', defaultMessage: 'Title' },
      required: false,
      localized: false,
      cardinality: 'one',
      authoring: { control: 'studio.control/single-line-text', order: 0 },
    };
    project.state.model.fields = [field];
    project.state.entry.values = { title: 'Original title' };
    const node = project.state.blueprint.roots[0];
    if (node === undefined) throw new Error('Missing heading.');
    node.bindings.text = {
      source: { kind: 'entry-field', fieldPath: ['title'] },
      onError: 'error',
      onNull: 'empty',
      transforms: [],
    };
    const element = createStudioStandaloneRuntime({ initialProject: project });
    document.body.append(element);
    const shell = await settle(element);
    expect(renderedRoot(shell).querySelector('h2')?.textContent).toBe('Original title');
    element.contextualElement?.setEntryValue(['title'], 'Changed title');
    await settle(element);
    expect(renderedRoot(shell).querySelector('h2')?.textContent).toBe('Changed title');
    expect(element.project.state.blueprint.roots[0]?.bindings.text).toEqual(node.bindings.text);
  });

  it('selects a rendered node through the public shell and does not navigate a link', async () => {
    const element = createStudioStandaloneRuntime({
      initialProject: headingProject('Selectable title'),
    });
    document.body.append(element);
    const shell = await settle(element);
    renderedRoot(shell).querySelector<HTMLElement>('h2')?.click();
    await shell.updateComplete;
    expect(shell.selection).toEqual(['page-heading']);
    expect(shell.shadowRoot?.querySelector('.inspector')?.textContent).toContain('page-heading');
  });

  it('inserts directly without a host listener, honors cancellation, and does not duplicate a legacy synchronous insertion', async () => {
    defineKumweStudio();
    const local = createStudioStandaloneRuntime();
    document.body.append(local);
    const original = await settle(local);
    const shell = document.createElement('kumwe-studio');
    shell.configuration = original.configuration;
    shell.document = structuredClone(original.document);
    document.body.append(shell);
    await shell.updateComplete;
    const insert = (): void => {
      shell.shadowRoot?.querySelector<HTMLButtonElement>('.palette button')?.click();
    };
    insert();
    await shell.updateComplete;
    expect(shell.document?.roots).toHaveLength(1);
    const cancel = (event: Event): void => event.preventDefault();
    shell.addEventListener('studio-insert-request', cancel);
    shell.selectNode(undefined);
    insert();
    expect(shell.document?.roots).toHaveLength(1);
    shell.removeEventListener('studio-insert-request', cancel);
    const legacy = (): void => {
      const document = shell.document;
      const configuration = shell.configuration;
      const first = document?.roots[0];
      if (document === undefined || configuration === undefined || first === undefined)
        throw new Error('Missing legacy insertion context.');
      shell.execute({
        artifactId: document.id,
        baseStateVersion: shell.stateVersion,
        contractVersion: document.contractVersion,
        id: 'legacy-insert',
        kind: 'command',
        sessionGeneration: configuration.session.sessionGeneration,
        type: 'studio.command/insert-node',
        payload: {
          destination: { position: 1 },
          node: { ...structuredClone(first), id: 'legacy-node' },
        },
      });
    };
    shell.addEventListener('studio-insert-request', legacy);
    insert();
    expect(shell.document?.roots).toHaveLength(2);
    expect(shell.document?.roots.map((node) => node.id)).toEqual(['section-1', 'legacy-node']);
  });
});
