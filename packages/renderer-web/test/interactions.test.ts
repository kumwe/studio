import { describe, expect, it, vi } from 'vitest';
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

  it('activates portable motion only after trusted enhancement and disposes it', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: undefined,
    });
    const heading = node(
      'motion',
      CORE_PRODUCTION_BLOCK_TYPES.heading,
      { text: 'Motion' },
      {},
      { design: { animation: 'fade' }, level: 2 },
    );
    const result = await renderStudioWeb({ roots: [heading] });
    const host = document.createElement('div');
    document.body.append(host);
    host.innerHTML = result.html;
    const rendered = host.querySelector<HTMLElement>('[data-studio-node="motion"]');
    expect(rendered?.dataset.studioMotion).toBeUndefined();
    const handle = await enhanceStudioWeb(host, result);
    expect(rendered?.dataset.studioMotion).toBe('fade');
    expect(rendered?.hasAttribute('data-studio-motion-visible')).toBe(true);
    handle.dispose();
    expect(rendered?.dataset.studioMotion).toBeUndefined();
    host.remove();
  });

  it('updates and disposes deterministic countdown behavior', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    try {
      const countdown = node(
        'countdown',
        CORE_PRODUCTION_BLOCK_TYPES.countdown,
        { completionMessage: 'Finished', target: '2030-01-01T00:00:01.000Z' },
        {},
        { display: 'compact', expiredBehavior: 'message' },
      );
      const result = await renderStudioWeb({ roots: [countdown] });
      const host = document.createElement('div');
      document.body.append(host);
      host.innerHTML = result.html;
      const handle = await enhanceStudioWeb(host, result);
      await vi.advanceTimersByTimeAsync(2_000);
      const complete = host.querySelector<HTMLElement>('[data-studio-countdown-complete]');
      expect(complete?.hidden).toBe(false);
      expect(complete?.textContent).toBe('Finished');
      handle.dispose();
      expect(complete?.hidden).toBe(true);
      host.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('upgrades lightbox links into a disposable focus-managed dialog', async () => {
    const reference: JsonObject = {
      accessibility: { altText: 'Preview', mode: 'informative' },
      assetId: 'preview',
      contractVersion: '0.1-draft',
      kind: 'media-reference',
      usage: 'studio.media/content',
    };
    const gallery = node(
      'lightbox',
      CORE_PRODUCTION_BLOCK_TYPES.gallery,
      { items: [reference] },
      {},
      { autoplay: false, columns: 1, lightbox: true, presentation: 'grid' },
    );
    const result = await renderStudioWeb(
      { roots: [gallery] },
      {
        resolveMedia: () => ({ altText: 'Preview', src: 'https://cdn.example.test/preview.jpg' }),
      },
    );
    const host = document.createElement('div');
    document.body.append(host);
    host.innerHTML = result.html;
    const handle = await enhanceStudioWeb(host, result);
    const link = host.querySelector<HTMLAnchorElement>('[data-studio-lightbox-open]');
    link?.click();
    const dialog = host.querySelector<HTMLDialogElement>('[data-studio-lightbox-dialog]');
    expect(dialog?.hasAttribute('open')).toBe(true);
    const close = dialog?.querySelector<HTMLButtonElement>('button:last-child');
    close?.click();
    expect(dialog?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(link);
    handle.dispose();
    expect(host.querySelector('[data-studio-lightbox-dialog]')).toBeNull();
    host.remove();
  });
});
