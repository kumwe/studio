import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STUDIO_PUBLIC_ENHANCEMENT_FAMILIES,
  enhancePublishedStudio,
  needsStudioPublicEnhancementRuntime,
  renderStudioWeb,
  type RendererWebVector,
} from '../src/index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('prebuilt public enhancement runtime source', () => {
  it('activates the exact eight renderer-web families from emitted attributes alone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    });
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    const vector = JSON.parse(
      await readFile(
        join(process.cwd(), 'schemas/conformance/renderer-web/interactive-behaviors.json'),
        'utf8',
      ),
    ) as RendererWebVector;
    const bindingMap = new Map(
      vector.bindings.map((binding) => [`${binding.nodeId}\u0000${binding.port}`, binding.value]),
    );
    const mediaMap = new Map(vector.media.map((media) => [media.assetId, media]));
    const result = await renderStudioWeb(
      { roots: vector.roots },
      {
        resolveBinding: (node, port) => bindingMap.get(`${node.id}\u0000${port}`),
        resolveMedia: (reference) => {
          const media = mediaMap.get(reference.assetId);
          if (media === undefined) throw new Error(`Missing vector media ${reference.assetId}.`);
          return media;
        },
      },
    );
    const host = document.createElement('main');
    host.innerHTML = result.html;
    document.body.append(host);

    expect(result.enhancements.map(({ kind }) => kind)).toEqual([
      'tabs',
      'dialog',
      'popover',
      'notice',
      'slideshow',
      'lightbox',
      'countdown',
      'navigation',
    ]);
    expect([...STUDIO_PUBLIC_ENHANCEMENT_FAMILIES]).toEqual([
      'countdown',
      'dialog',
      'lightbox',
      'navigation',
      'notice',
      'popover',
      'slideshow',
      'tabs',
    ]);
    expect(needsStudioPublicEnhancementRuntime(result.enhancements)).toBe(true);
    expect(
      needsStudioPublicEnhancementRuntime([
        { kind: 'chart' },
        { kind: 'diagram' },
        { kind: 'math' },
        { kind: 'motion' },
      ]),
    ).toBe(false);
    expect(needsStudioPublicEnhancementRuntime([])).toBe(false);
    expect(result.html).not.toContain('<script');
    expect(host.querySelector<HTMLElement>('[data-studio-tab-list]')?.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('[data-studio-tab-panel]')?.hidden).toBe(false);
    expect(host.querySelector<HTMLElement>('[data-studio-navigation-children]')?.hidden).toBe(
      false,
    );
    expect(host.querySelector<HTMLElement>('[data-studio-notice]')?.hidden).toBe(false);

    const handle = enhancePublishedStudio(host);
    const tabList = host.querySelector<HTMLElement>('[data-studio-tab-list]');
    const tab = host.querySelector<HTMLButtonElement>('[data-studio-tab]');
    const dialogTrigger = host.querySelector<HTMLElement>('[data-studio-dialog-trigger]');
    const popoverTrigger = host.querySelector<HTMLElement>('[data-studio-popover-trigger]');
    const notice = host.querySelector<HTMLElement>('[data-studio-notice]');
    const navigationChildren = host.querySelector<HTMLElement>('[data-studio-navigation-children]');
    const navigationToggle = host.querySelector<HTMLButtonElement>(
      '[data-studio-navigation-toggle]',
    );
    const dialog = host.querySelector<HTMLDetailsElement>('[data-studio-dialog]');
    const dialogPanel = host.querySelector<HTMLElement>('[data-studio-dialog-panel]');
    const popover = host.querySelector<HTMLDetailsElement>('[data-studio-popover]');
    const slideshowNext = host.querySelector<HTMLButtonElement>('[data-studio-slide-next]');
    const lightboxLink = host.querySelector<HTMLAnchorElement>('[data-studio-lightbox-open]');
    const countdown = host.querySelector<HTMLElement>('[data-studio-countdown-value]');

    expect(tabList?.hidden).toBe(false);
    expect(tab?.getAttribute('aria-selected')).toBe('true');
    expect(dialogTrigger?.getAttribute('aria-expanded')).toBe('false');
    expect(popoverTrigger?.getAttribute('aria-expanded')).toBe('false');
    expect(navigationChildren?.hidden).toBe(true);
    expect(countdown?.textContent).toBe('25202:00:00:00');
    expect(host.querySelector('[data-studio-lightbox-dialog]')).not.toBeNull();

    dialog?.setAttribute('open', '');
    dialog?.dispatchEvent(new Event('toggle'));
    expect(dialogTrigger?.getAttribute('aria-expanded')).toBe('true');
    dialogPanel?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(dialog?.open).toBe(false);
    popover?.setAttribute('open', '');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover?.open).toBe(false);
    host.querySelector<HTMLButtonElement>('[data-studio-notice-dismiss]')?.click();
    navigationToggle?.click();
    slideshowNext?.click();
    lightboxLink?.click();
    expect(notice?.hidden).toBe(true);
    expect(navigationChildren?.hidden).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(host.querySelector<HTMLDialogElement>('[data-studio-lightbox-dialog]')?.open).toBe(true);

    handle.dispose();
    expect(tabList?.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('[data-studio-tab-panel]')?.hidden).toBe(false);
    expect(tab?.hasAttribute('aria-selected')).toBe(false);
    expect(dialog?.open).toBe(false);
    expect(dialogTrigger?.hasAttribute('aria-expanded')).toBe(false);
    expect(popover?.open).toBe(false);
    expect(popoverTrigger?.hasAttribute('aria-expanded')).toBe(false);
    expect(notice?.hidden).toBe(false);
    expect(navigationChildren?.hidden).toBe(false);
    expect(navigationToggle?.hasAttribute('aria-expanded')).toBe(false);
    expect(host.querySelector('[data-studio-lightbox-dialog]')).toBeNull();
    expect(countdown?.textContent).toBe('2099-01-01T00:00:00.000Z');
    scrollIntoView.mockClear();
    slideshowNext?.click();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('is inert when a published page has no renderer enhancement attributes', () => {
    const host = document.createElement('main');
    host.innerHTML =
      '<article><h1>Server-rendered page</h1><p>Complete without JavaScript.</p></article>';
    const before = host.innerHTML;

    const handle = enhancePublishedStudio(host);

    expect(host.innerHTML).toBe(before);
    handle.dispose();
    expect(host.innerHTML).toBe(before);
  });

  it('shares one disposable lifecycle across repeated bootstrap calls', () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    const host = document.createElement('main');
    host.innerHTML = `
      <div data-studio-node="slides" data-studio-scope="scope-slides">
        <section data-studio-slideshow-autoplay="false">
          <article data-studio-slide="0">Slide</article>
          <button data-studio-slide-next type="button">Next</button>
        </section>
      </div>
      <div data-studio-node="gallery" data-studio-scope="scope-gallery">
        <a data-studio-lightbox-open href="/image.png"><img alt="Image" src="/image.png"></a>
      </div>`;
    document.body.append(host);

    const first = enhancePublishedStudio(host);
    const second = enhancePublishedStudio(host);

    expect(host.querySelectorAll('[data-studio-lightbox-dialog]')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('[data-studio-slide-next]')?.click();
    expect(scrollIntoView).toHaveBeenCalledOnce();

    first.dispose();
    expect(host.querySelectorAll('[data-studio-lightbox-dialog]')).toHaveLength(1);
    scrollIntoView.mockClear();
    host.querySelector<HTMLButtonElement>('[data-studio-slide-next]')?.click();
    expect(scrollIntoView).toHaveBeenCalledOnce();

    second.dispose();
    expect(host.querySelector('[data-studio-lightbox-dialog]')).toBeNull();
    scrollIntoView.mockClear();
    host.querySelector<HTMLButtonElement>('[data-studio-slide-next]')?.click();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not treat advanced adapters or motion as a public-runtime need signal', () => {
    expect(needsStudioPublicEnhancementRuntime([])).toBe(false);
    expect(
      needsStudioPublicEnhancementRuntime([
        { kind: 'chart' },
        { kind: 'diagram' },
        { kind: 'math' },
        { kind: 'motion' },
      ]),
    ).toBe(false);
    expect(needsStudioPublicEnhancementRuntime([{ kind: 'tabs' }])).toBe(true);
  });

  it('fails closed when renderer marker options are missing or non-canonical', () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    const host = document.createElement('main');
    host.innerHTML = `
      <div data-studio-node="tabs" data-studio-scope="scope-tabs">
        <div data-studio-tabs><div data-studio-tab-list hidden><button data-studio-tab="0">Tab</button></div><section data-studio-tab-panel>Panel</section></div>
      </div>
      <div data-studio-node="dialog" data-studio-scope="scope-dialog">
        <details data-studio-dialog data-studio-dialog-modal="yes" data-studio-dialog-presentation="modal"><summary data-studio-dialog-trigger>Open</summary><section data-studio-dialog-panel></section></details>
      </div>
      <div data-studio-node="popover" data-studio-scope="scope-popover">
        <details data-studio-popover data-studio-popover-presentation="tooltip" data-studio-popover-dismiss-on-blur="1"><summary data-studio-popover-trigger>Open</summary></details>
      </div>
      <div data-studio-node="slideshow" data-studio-scope="scope-slideshow">
        <section data-studio-slideshow-autoplay="False"><article data-studio-slide="0">Slide</article><button data-studio-slide-next>Next</button></section>
      </div>
      <div data-studio-node="countdown" data-studio-scope="scope-countdown">
        <time data-studio-countdown data-studio-countdown-display="short" data-studio-countdown-expired-behavior="zero" datetime="2099-01-01T00:00:00.000Z"><span data-studio-countdown-value>2099-01-01T00:00:00.000Z</span></time>
      </div>`;

    const handle = enhancePublishedStudio(host);

    expect(host.querySelector<HTMLElement>('[data-studio-tab-list]')?.hidden).toBe(true);
    expect(host.querySelector('[data-studio-dialog-trigger]')?.hasAttribute('aria-expanded')).toBe(
      false,
    );
    expect(host.querySelector('[data-studio-popover-trigger]')?.hasAttribute('aria-expanded')).toBe(
      false,
    );
    expect(host.querySelector<HTMLElement>('[data-studio-countdown-value]')?.textContent).toBe(
      '2099-01-01T00:00:00.000Z',
    );
    host.querySelector<HTMLButtonElement>('[data-studio-slide-next]')?.click();
    expect(scrollIntoView).not.toHaveBeenCalled();
    handle.dispose();
  });
});
