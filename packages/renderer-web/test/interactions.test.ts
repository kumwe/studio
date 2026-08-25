import { describe, expect, it } from 'vitest';
import {
  CORE_PRODUCTION_BLOCK_TYPES,
  coreProductionInitialProperties,
  type CoreProductionBlockType,
} from '@kumwe/studio-core';
import type { BlueprintNode, FieldBinding, JsonObject, JsonValue } from '@kumwe/studio-protocol';
import { enhanceStudioWeb, renderStudioWeb } from '../src/index.js';

function binding(value: JsonValue): FieldBinding {
  return {
    onError: 'error',
    onNull: 'empty',
    source: { kind: 'static-value', value },
    transforms: [],
  };
}

function node(
  id: string,
  type: CoreProductionBlockType,
  values: Readonly<Record<string, JsonValue>> = {},
  slots: Readonly<Record<string, BlueprintNode[]>> = {},
  properties: JsonObject = coreProductionInitialProperties(type),
): BlueprintNode {
  return {
    authoring: { mode: Object.keys(slots).length === 0 ? 'content' : 'structural' },
    bindings: Object.fromEntries(
      Object.entries(values).map(([port, value]) => [port, binding(value)]),
    ),
    id,
    properties,
    slots,
    type,
    version: '1.0.0',
  };
}

describe('trusted progressive interaction controller', () => {
  it('manages dialog focus and Escape without persisted scripts', async () => {
    const result = await renderStudioWeb({
      roots: [
        node(
          'dialog',
          CORE_PRODUCTION_BLOCK_TYPES.dialog,
          { title: 'Settings', triggerLabel: 'Open settings' },
          { content: [] },
        ),
      ],
    });
    const host = document.createElement('div');
    document.body.append(host);
    host.innerHTML = result.html;
    const handle = await enhanceStudioWeb(host, result);
    const disclosure = host.querySelector<HTMLDetailsElement>('[data-studio-dialog]');
    const trigger = host.querySelector<HTMLElement>('[data-studio-dialog-trigger]');
    const panel = host.querySelector<HTMLElement>('[data-studio-dialog-panel]');
    const close = host.querySelector<HTMLButtonElement>('[data-studio-dialog-close]');
    if (disclosure === null || panel === null || trigger === null || close === null) {
      throw new Error('Dialog fallback markup is incomplete.');
    }
    disclosure.open = true;
    disclosure.dispatchEvent(new Event('toggle'));
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(close);
    panel?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(disclosure?.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    handle.dispose();
    host.remove();
  });

  it('dismisses popovers outside and restores dismissed notices on disposal', async () => {
    const richText: JsonObject = {
      content: [{ content: [{ text: 'Saved', type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    };
    const result = await renderStudioWeb({
      roots: [
        node(
          'popover',
          CORE_PRODUCTION_BLOCK_TYPES.popover,
          { triggerLabel: 'Help' },
          { content: [] },
        ),
        node(
          'notice',
          CORE_PRODUCTION_BLOCK_TYPES.notice,
          { content: richText, title: 'Success' },
          {},
          { dismissible: true, tone: 'success' },
        ),
      ],
    });
    const host = document.createElement('div');
    document.body.append(host);
    host.innerHTML = result.html;
    const handle = await enhanceStudioWeb(host, result);
    const popover = host.querySelector<HTMLDetailsElement>('[data-studio-popover]');
    if (popover === null) throw new Error('Popover fallback markup is missing.');
    popover.open = true;
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover?.open).toBe(false);
    const notice = host.querySelector<HTMLElement>('[data-studio-notice]');
    host.querySelector<HTMLButtonElement>('[data-studio-notice-dismiss]')?.click();
    expect(notice?.hidden).toBe(true);
    handle.dispose();
    expect(notice?.hidden).toBe(false);
    host.remove();
  });
});
