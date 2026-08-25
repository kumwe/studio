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
      case 'dialog':
        disposers.push(enhanceDialog(container));
        break;
      case 'notice':
        disposers.push(enhanceNotice(container));
        break;
      case 'popover':
        disposers.push(enhancePopover(container, enhancement));
        break;
      case 'motion':
        disposers.push(enhanceMotion(container, enhancement));
        break;
      case 'countdown':
        disposers.push(enhanceCountdown(container, enhancement));
        break;
      case 'lightbox':
        disposers.push(enhanceLightbox(container));
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

function enhanceDialog(container: HTMLElement): () => void {
  const disclosure = container.querySelector<HTMLDetailsElement>('[data-studio-dialog]');
  if (disclosure === null) return () => undefined;
  const trigger = disclosure.querySelector<HTMLElement>('[data-studio-dialog-trigger]');
  const panel = disclosure.querySelector<HTMLElement>('[data-studio-dialog-panel]');
  const close = disclosure.querySelector<HTMLButtonElement>('[data-studio-dialog-close]');
  if (trigger === null || panel === null) return () => undefined;
  const listeners: { listener: EventListener; target: EventTarget; type: string }[] = [];
  let restoreFocus: HTMLElement | undefined;
  const closeDialog = (): void => {
    disclosure.open = false;
    trigger.setAttribute('aria-expanded', 'false');
    restoreFocus?.focus();
  };
  listen(listeners, disclosure, 'toggle', () => {
    trigger.setAttribute('aria-expanded', String(disclosure.open));
    if (disclosure.open) {
      restoreFocus = trigger;
      firstFocusable(panel)?.focus();
    }
  });
  if (close !== null) listen(listeners, close, 'click', closeDialog);
  listen(listeners, panel, 'keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== 'Tab' || disclosure.dataset.studioDialogModal !== 'true') return;
    const focusable = focusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? current <= 0
        ? focusable.length - 1
        : current - 1
      : current < 0 || current === focusable.length - 1
        ? 0
        : current + 1;
    if ((event.shiftKey && current <= 0) || (!event.shiftKey && current === focusable.length - 1)) {
      event.preventDefault();
      focusable[next]?.focus();
    }
  });
  trigger.setAttribute('aria-expanded', String(disclosure.open));
  return () => {
    listeners.forEach(({ listener, target, type }) => target.removeEventListener(type, listener));
    disclosure.open = false;
  };
}

function enhanceNotice(container: HTMLElement): () => void {
  const notice = container.querySelector<HTMLElement>('[data-studio-notice]');
  if (notice === null) return () => undefined;
  const dismiss = notice.querySelector<HTMLButtonElement>('[data-studio-notice-dismiss]');
  if (dismiss === null) return () => undefined;
  const onDismiss = (): void => {
    notice.hidden = true;
  };
  dismiss.addEventListener('click', onDismiss);
  return () => {
    dismiss.removeEventListener('click', onDismiss);
    notice.hidden = false;
  };
}

function enhancePopover(
  container: HTMLElement,
  enhancement: Extract<StudioWebEnhancement, { kind: 'popover' }>,
): () => void {
  const disclosure = container.querySelector<HTMLDetailsElement>('[data-studio-popover]');
  if (disclosure === null) return () => undefined;
  const trigger = disclosure.querySelector<HTMLElement>('[data-studio-popover-trigger]');
  if (trigger === null) return () => undefined;
  const listeners: { listener: EventListener; target: EventTarget; type: string }[] = [];
  listen(listeners, disclosure, 'toggle', () =>
    trigger.setAttribute('aria-expanded', String(disclosure.open)),
  );
  listen(listeners, disclosure, 'keydown', (event) => {
    if (event instanceof KeyboardEvent && event.key === 'Escape') {
      event.preventDefault();
      disclosure.open = false;
      trigger.focus();
    }
  });
  if (enhancement.dismissOnBlur) {
    listen(listeners, document, 'pointerdown', (event) => {
      if (event.target instanceof Node && !disclosure.contains(event.target)) {
        disclosure.open = false;
      }
    });
  }
  if (enhancement.presentation === 'tooltip') {
    const open = (): void => {
      disclosure.open = true;
    };
    const close = (event: Event): void => {
      const related =
        event instanceof FocusEvent || event instanceof MouseEvent ? event.relatedTarget : null;
      if (!(related instanceof Node) || !disclosure.contains(related)) disclosure.open = false;
    };
    listen(listeners, trigger, 'mouseenter', open);
    listen(listeners, trigger, 'focus', open);
    listen(listeners, disclosure, 'mouseleave', close);
    listen(listeners, disclosure, 'focusout', close);
  }
  trigger.setAttribute('aria-expanded', String(disclosure.open));
  return () =>
    listeners.forEach(({ listener, target, type }) => target.removeEventListener(type, listener));
}

function enhanceMotion(
  container: HTMLElement,
  enhancement: Extract<StudioWebEnhancement, { kind: 'motion' }>,
): () => void {
  if (reducedMotion()) return () => undefined;
  container.dataset.studioMotion = enhancement.animation;
  if (enhancement.animation === 'parallax') {
    const update = (): void => {
      const rect = container.getBoundingClientRect();
      const progress = rect.top / Math.max(window.innerHeight, 1) - 0.5;
      const offset = Math.max(-24, Math.min(24, progress * 24));
      container.style.setProperty('--studio-parallax-offset', `${offset.toFixed(2)}px`);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      container.style.removeProperty('--studio-parallax-offset');
      delete container.dataset.studioMotion;
    };
  }
  if (typeof IntersectionObserver !== 'function') {
    container.dataset.studioMotionVisible = '';
    return () => {
      delete container.dataset.studioMotion;
      delete container.dataset.studioMotionVisible;
    };
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      container.dataset.studioMotionVisible = '';
      observer.disconnect();
    }
  });
  observer.observe(container);
  return () => {
    observer.disconnect();
    delete container.dataset.studioMotion;
    delete container.dataset.studioMotionVisible;
  };
}

function enhanceCountdown(
  container: HTMLElement,
  enhancement: Extract<StudioWebEnhancement, { kind: 'countdown' }>,
): () => void {
  const countdown = container.querySelector<HTMLTimeElement>('[data-studio-countdown]');
  const value = countdown?.querySelector<HTMLElement>('[data-studio-countdown-value]');
  const complete = countdown?.querySelector<HTMLElement>('[data-studio-countdown-complete]');
  if (countdown === undefined || countdown === null || value === undefined || value === null) {
    return () => undefined;
  }
  const target = Date.parse(enhancement.target);
  const render = (): void => {
    const remaining = Math.max(0, target - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    value.textContent =
      enhancement.display === 'compact'
        ? `${String(days)}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${String(days)} days ${String(hours)} hours ${String(minutes)} minutes ${String(seconds)} seconds`;
    if (remaining > 0) return;
    if (enhancement.expiredBehavior === 'hide') container.hidden = true;
    if (enhancement.expiredBehavior === 'message') {
      value.hidden = true;
      if (complete !== undefined && complete !== null) {
        complete.textContent = enhancement.completionMessage || 'Complete';
        complete.hidden = false;
      }
    }
  };
  render();
  const interval = window.setInterval(render, 1_000);
  return () => {
    window.clearInterval(interval);
    container.hidden = false;
    value.hidden = false;
    value.textContent = enhancement.target;
    if (complete !== undefined && complete !== null) complete.hidden = true;
  };
}

function enhanceLightbox(container: HTMLElement): () => void {
  const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-studio-lightbox-open]')];
  if (links.length === 0) return () => undefined;
  const dialog = document.createElement('dialog');
  dialog.dataset.studioLightboxDialog = '';
  dialog.setAttribute('aria-label', 'Media viewer');
  const image = document.createElement('img');
  image.dataset.studioPart = 'media';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.textContent = 'Previous';
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next';
  dialog.append(image, previous, next, close);
  container.append(dialog);
  let index = 0;
  let restoreFocus: HTMLElement | undefined;
  const show = (candidate: number): void => {
    index = (candidate + links.length) % links.length;
    const link = links[index];
    const source = link?.querySelector<HTMLImageElement>('img');
    if (link === undefined || source === undefined || source === null) return;
    image.src = link.href;
    image.alt = source.alt;
  };
  const open = (candidate: number, source: HTMLElement): void => {
    restoreFocus = source;
    show(candidate);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    close.focus();
  };
  const closeDialog = (): void => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    restoreFocus?.focus();
  };
  const listeners: { listener: EventListener; target: EventTarget; type: string }[] = [];
  links.forEach((link, candidate) =>
    listen(listeners, link, 'click', (event) => {
      event.preventDefault();
      open(candidate, link);
    }),
  );
  listen(listeners, previous, 'click', () => show(index - 1));
  listen(listeners, next, 'click', () => show(index + 1));
  listen(listeners, close, 'click', closeDialog);
  listen(listeners, dialog, 'cancel', (event) => {
    event.preventDefault();
    closeDialog();
  });
  return () => {
    listeners.forEach(({ listener, target, type }) => target.removeEventListener(type, listener));
    if (dialog.open) closeDialog();
    dialog.remove();
  };
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

function firstFocusable(container: HTMLElement): HTMLElement {
  return focusableElements(container)[0] ?? container;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => !element.hidden);
}

function disposeAll(disposers: (() => void)[]): void {
  while (disposers.length > 0) disposers.pop()?.();
}
