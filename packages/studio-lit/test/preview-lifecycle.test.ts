import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockType,
  type BlueprintNode,
  type InsertNodeCommand,
  type PreviewMessage,
  type QualifiedName,
} from '@kumwe/studio-protocol';
import {
  createBlueprintFixture,
  createStudioConfigurationFixture,
  defineTestBlock,
} from '@kumwe/studio-testkit';
import { defineKumweStudio, KumweStudioElement } from '../src/index.js';

function blueprintNode(id: string, type: string): BlueprintNode {
  return {
    authoring: { mode: 'content' },
    bindings: {},
    id,
    properties: {},
    slots: {},
    type: type as BlockType,
    version: '1.0.0',
  };
}

interface MountOptions {
  sessionState?: 'editable' | 'read-only';
}

async function mountShell(options: MountOptions = {}): Promise<KumweStudioElement> {
  defineKumweStudio();
  const element = new KumweStudioElement();
  element.configuration = {
    blockDefinitions: [defineTestBlock({ label: 'Text', type: 'studio.core/text' })],
    session: createStudioConfigurationFixture(
      options.sessionState === undefined ? {} : { sessionState: options.sessionState },
    ),
  };
  element.document = createBlueprintFixture({
    roots: [
      blueprintNode('text-1', 'studio.core/text'),
      blueprintNode('text-2', 'studio.core/text'),
    ],
  });
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function liveRegionText(element: KumweStudioElement): string {
  return element.shadowRoot?.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function outlineEntry(element: KumweStudioElement, nodeId: string): HTMLButtonElement {
  const entries =
    element.shadowRoot?.querySelectorAll<HTMLButtonElement>('button.outline-entry') ?? [];
  const entry = [...entries].find((candidate) => candidate.dataset.nodeId === nodeId);
  if (entry === undefined) {
    throw new Error(`Missing outline entry for ${nodeId}`);
  }
  return entry;
}

function insertTextCommand(element: KumweStudioElement): InsertNodeCommand {
  return {
    artifactId: element.document?.id ?? 'test.blueprint',
    baseStateVersion: element.stateVersion,
    contractVersion: STUDIO_CONTRACT_VERSION,
    id: 'command-insert-text',
    kind: 'command',
    payload: {
      destination: { position: element.document?.roots.length ?? 0 },
      node: blueprintNode('text-inserted', 'studio.core/text'),
    },
    sessionGeneration: 'session-r1',
    type: 'studio.command/insert-node',
  };
}

function reloadMessage(reason: QualifiedName, sequence = 0): PreviewMessage {
  return {
    channelId: 'channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: { reason },
    sequence,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/reload',
  };
}

function teardownMessage(reason: QualifiedName): PreviewMessage {
  return {
    channelId: 'channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: { reason },
    sequence: 0,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/teardown',
  };
}

function renderedMessage(): PreviewMessage {
  return {
    channelId: 'channel-1',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'preview-message',
    payload: { diagnostics: [], draftDigest: 'digest-1', markers: [] },
    sequence: 0,
    sessionGeneration: 'session-r1',
    type: 'studio.preview/rendered',
  };
}

/**
 * SR-026: announcements and focus survive preview renderer reload and
 * teardown. The live region is a single slot; the deterministic contract
 * asserted here is that a preview lifecycle announcement arriving while an
 * outcome announcement from the same tick is still waiting to render queues
 * after it — the outcome renders first, the lifecycle message takes the slot
 * on the following update, and neither is lost or reordered.
 */
describe('preview lifecycle announcements', () => {
  it('announces a renderer reload with its qualified reason and preserves focus', async () => {
    const element = await mountShell();
    const entry = outlineEntry(element, 'text-1');
    entry.focus();
    const activeBefore = document.activeElement;
    expect(element.shadowRoot?.activeElement).toBe(entry);

    element.notifyPreviewMessage(reloadMessage('studio.preview/renderer-restarted'));
    await element.updateComplete;

    expect(liveRegionText(element)).toContain(
      'The preview reloaded (studio.preview/renderer-restarted).',
    );
    expect(liveRegionText(element)).toContain('The document is unchanged.');
    expect(document.activeElement).toBe(activeBefore);
    expect(element.shadowRoot?.activeElement).toBe(entry);
    element.remove();
  });

  it('announces a channel teardown with its qualified reason and preserves focus', async () => {
    const element = await mountShell();
    const entry = outlineEntry(element, 'text-2');
    entry.focus();

    element.notifyPreviewMessage(teardownMessage('studio.preview/session-ended'));
    await element.updateComplete;

    expect(liveRegionText(element)).toContain('The preview closed (studio.preview/session-ended).');
    expect(element.shadowRoot?.activeElement).toBe(entry);
    element.remove();
  });

  it('queues a reload announcement behind an outcome announcement from the same tick', async () => {
    const element = await mountShell();
    element.execute(insertTextCommand(element));
    await element.updateComplete;

    // Same tick: an outcome announcement, then the reload notification.
    element.undo();
    element.notifyPreviewMessage(reloadMessage('studio.preview/renderer-restarted'));

    // The outcome renders first — the reload announcement never replaces it.
    await element.updateComplete;
    expect(liveRegionText(element)).toBe('Undid change');

    // The queued reload announcement takes the slot on the following update.
    await element.updateComplete;
    expect(liveRegionText(element)).toContain(
      'The preview reloaded (studio.preview/renderer-restarted).',
    );
    element.remove();
  });

  it('announces identically in read-only sessions', async () => {
    const element = await mountShell({ sessionState: 'read-only' });

    element.notifyPreviewMessage(reloadMessage('studio.preview/renderer-restarted'));
    await element.updateComplete;

    expect(liveRegionText(element)).toContain(
      'The preview reloaded (studio.preview/renderer-restarted).',
    );

    element.notifyPreviewMessage(teardownMessage('studio.preview/session-ended'));
    await element.updateComplete;
    await element.updateComplete;

    expect(liveRegionText(element)).toContain('The preview closed (studio.preview/session-ended).');
    element.remove();
  });

  it('ignores preview messages that are not lifecycle events', async () => {
    const element = await mountShell();

    element.notifyPreviewMessage(renderedMessage());
    await element.updateComplete;

    expect(liveRegionText(element)).toBe('');
    element.remove();
  });

  it('resolves the announcements through the host-overridable message catalog', async () => {
    const element = await mountShell();
    element.messages = {
      'studio.shell/announce-preview-reloaded': {
        defaultMessage: 'Vorschau neu geladen ({reason})',
      },
    };
    await element.updateComplete;

    element.notifyPreviewMessage(reloadMessage('studio.preview/renderer-restarted'));
    await element.updateComplete;

    expect(liveRegionText(element)).toBe(
      'Vorschau neu geladen (studio.preview/renderer-restarted)',
    );
    element.remove();
  });
});
