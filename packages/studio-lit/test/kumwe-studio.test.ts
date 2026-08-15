import { describe, expect, it } from 'vitest';
import { STUDIO_CONTRACT_VERSION, type InsertNodeCommand } from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  defineTestBlock,
} from '@kumwe/studio-testkit';
import { defineKumweStudio, KumweStudioElement } from '../src/index.js';

describe('kumwe-studio element', () => {
  it('renders a palette and applies canonical commands', async () => {
    const definition = defineTestBlock({ label: 'Text', type: 'studio.core/text' });
    defineKumweStudio();
    const element = new KumweStudioElement();
    element.configuration = {
      blockDefinitions: [definition],
      session: createStudioConfigurationFixture(),
    };
    element.document = createBlueprintFixture();
    document.body.append(element);
    await element.updateComplete;

    const command: InsertNodeCommand = {
      artifactId: element.document.id,
      baseStateVersion: 0,
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: 'command-1',
      kind: 'command',
      payload: {
        destination: { position: 0 },
        node: {
          authoring: { mode: 'content' },
          bindings: {},
          id: 'text-1',
          properties: {},
          slots: {},
          type: 'studio.core/text',
          version: '1.0.0',
        },
      },
      sessionGeneration: 'session-r1',
      type: 'studio.command/insert-node',
    };
    element.execute(command);
    await element.updateComplete;

    expect(element.document.roots).toHaveLength(1);
    expect(element.shadowRoot?.textContent).toContain('Text');
    element.remove();
  });
});
