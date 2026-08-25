import type {
  StudioWebAdvancedAdapters,
  StudioWebEnhancement,
  StudioWebEnhancementHandle,
  StudioWebEnhancementOptions,
  StudioWebRenderResult,
} from './types.js';

/** Install trusted behavior over usable server HTML; disposal removes every listener/timer/chart. */
export async function enhanceStudioWeb(
  root: ParentNode,
  result: Readonly<StudioWebRenderResult>,
  options: Readonly<StudioWebEnhancementOptions> = {},
): Promise<StudioWebEnhancementHandle> {
  const disposers: (() => void)[] = [];
  const signal = options.signal;
  for (const enhancement of result.enhancements) {
    if (signal?.aborted === true) break;
    const container = root.querySelector<HTMLElement>(`[data-studio-scope="${enhancement.scope}"]`);
    if (container === null) continue;
    switch (enhancement.kind) {
      case 'tabs':
        disposers.push(enhanceTabs(container, enhancement));
        break;
      case 'slideshow':
        disposers.push(enhanceSlideshow(container, enhancement));
        break;
      case 'chart':
        if (options.adapters?.chart !== undefined) {
          const visual = container.querySelector<HTMLElement>('[data-studio-chart-visual]');
          if (visual !== null) {
            const canvas = document.createElement('canvas');
            canvas.setAttribute('aria-hidden', 'true');
            visual.replaceChildren(canvas);
            disposers.push(await options.adapters.chart.enhance(canvas, enhancement.spec));
          }
        }
        break;
      case 'diagram':
        await replaceWithAdapter(
          container.querySelector('[data-studio-diagram-source]'),
          options.adapters,
          'diagram',
          enhancement.source,
        );
        break;
      case 'math':
        await replaceWithAdapter(
          container.querySelector('[data-studio-math-source]'),
          options.adapters,
          'math',
          { displayMode: enhancement.displayMode, source: enhancement.source },
        );
        break;
    }
  }
  const abort = (): void => disposeAll(disposers);
  signal?.addEventListener('abort', abort, { once: true });
  let disposed = false;
  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      signal?.removeEventListener('abort', abort);
      disposeAll(disposers);
    },
  };
}

function enhanceTabs(
  container: HTMLElement,
  enhancement: Extract<StudioWebEnhancement, { kind: 'tabs' }>,
): () => void {
  const list = container.querySelector<HTMLElement>('[data-studio-tab-list]');
  const buttons = [...(list?.querySelectorAll<HTMLButtonElement>('[data-studio-tab]') ?? [])];
  const panels = [...container.querySelectorAll<HTMLElement>('[data-studio-tab-panel]')];
  if (list === null || buttons.length === 0 || buttons.length !== panels.length)
    return () => undefined;
  list.hidden = false;
  list.setAttribute('role', 'tablist');
  const activate = (index: number, focus: boolean): void => {
    buttons.forEach((button, candidate) => {
      const selected = candidate === index;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      panels[candidate]?.toggleAttribute('hidden', !selected);
      if (selected && focus) button.focus();
    });
  };
  const listeners: { listener: EventListener; target: EventTarget; type: string }[] = [];
  buttons.forEach((button, index) => {
    const tabId = `${enhancement.scope}-tab-${index}`;
    const panelId = `${enhancement.scope}-panel-${index}`;
    button.id = tabId;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelId);
    const panel = panels[index];
    panel?.setAttribute('role', 'tabpanel');
    panel?.setAttribute('aria-labelledby', tabId);
    if (panel !== undefined) panel.id = panelId;
    listen(listeners, button, 'click', () => activate(index, false));
    listen(listeners, button, 'keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const keyIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : event.key === 'ArrowRight' || event.key === 'ArrowDown'
              ? (index + 1) % buttons.length
              : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                ? (index - 1 + buttons.length) % buttons.length
                : undefined;
      if (keyIndex !== undefined) {
        event.preventDefault();
        if (enhancement.activation === 'automatic') activate(keyIndex, true);
        else buttons[keyIndex]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(index, false);
      }
    });
  });
  activate(0, false);
  return () =>
    listeners.forEach(({ listener, target, type }) => target.removeEventListener(type, listener));
}

function enhanceSlideshow(
  container: HTMLElement,
  enhancement: Extract<StudioWebEnhancement, { kind: 'slideshow' }>,
): () => void {
  const slides = [...container.querySelectorAll<HTMLElement>('[data-studio-slide]')];
  const previous = container.querySelector<HTMLButtonElement>('[data-studio-slide-previous]');
  const next = container.querySelector<HTMLButtonElement>('[data-studio-slide-next]');
  if (slides.length === 0) return () => undefined;
  let index = 0;
  const show = (candidate: number): void => {
    index = (candidate + slides.length) % slides.length;
    slides[index]?.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  };
  const listeners: { listener: EventListener; target: EventTarget; type: string }[] = [];
  if (previous !== null) listen(listeners, previous, 'click', () => show(index - 1));
  if (next !== null) listen(listeners, next, 'click', () => show(index + 1));
  const interval =
    enhancement.autoplay && !reducedMotion()
      ? window.setInterval(() => show(index + 1), 5_000)
      : undefined;
  return () => {
    listeners.forEach(({ listener, target, type }) => target.removeEventListener(type, listener));
    if (interval !== undefined) window.clearInterval(interval);
  };
}

async function replaceWithAdapter(
  target: Element | null,
  adapters: StudioWebAdvancedAdapters | undefined,
  kind: 'diagram' | 'math',
  value: string | { displayMode: boolean; source: string },
): Promise<void> {
  if (target === null) return;
  if (kind === 'diagram' && typeof value === 'string' && adapters?.diagram !== undefined) {
    target.replaceWith(await adapters.diagram.render(value));
  }
  if (kind === 'math' && typeof value !== 'string' && adapters?.math !== undefined) {
    target.replaceWith(await adapters.math.render(value));
  }
}

function listen(
  listeners: { listener: EventListener; target: EventTarget; type: string }[],
  target: EventTarget,
  type: string,
  listener: EventListener,
): void {
  target.addEventListener(type, listener);
  listeners.push({ listener, target, type });
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function disposeAll(disposers: (() => void)[]): void {
  while (disposers.length > 0) disposers.pop()?.();
}
