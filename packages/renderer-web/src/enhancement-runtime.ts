import {
  enhanceCountdown,
  enhanceDialog,
  enhanceLightbox,
  enhanceNavigation,
  enhanceNotice,
  enhancePopover,
  enhanceSlideshow,
  enhanceTabs,
} from './enhance.js';
import type { StudioWebEnhancement } from './types.js';

export type StudioPublicEnhancementFamily =
  'countdown' | 'dialog' | 'lightbox' | 'navigation' | 'notice' | 'popover' | 'slideshow' | 'tabs';

export interface StudioPublishedEnhancementHandle {
  dispose(): void;
}

interface ActivePublishedEnhancement {
  disposers: (() => void)[];
  leases: number;
}

export const STUDIO_PUBLIC_ENHANCEMENT_FAMILIES: readonly StudioPublicEnhancementFamily[] =
  Object.freeze([
    'countdown',
    'dialog',
    'lightbox',
    'navigation',
    'notice',
    'popover',
    'slideshow',
    'tabs',
  ]);

const PUBLIC_ENHANCEMENT_FAMILY_SET: ReadonlySet<string> = new Set(
  STUDIO_PUBLIC_ENHANCEMENT_FAMILIES,
);

/** Return the exact per-page need signal for the single public enhancement file. */
export function needsStudioPublicEnhancementRuntime(
  enhancements: readonly Pick<StudioWebEnhancement, 'kind'>[],
): boolean {
  return enhancements.some(({ kind }) => PUBLIC_ENHANCEMENT_FAMILY_SET.has(kind));
}

/**
 * Enhance trusted renderer-web output by inspecting only its bounded data attributes.
 * Server-rendered HTML remains the complete no-JavaScript fallback.
 */
export function enhancePublishedStudio(
  root: ParentNode = document,
): StudioPublishedEnhancementHandle {
  const registry = publishedEnhancementRegistry();
  const existing = registry.get(root);
  if (existing !== undefined) return acquirePublishedEnhancement(root, existing, registry);

  const disposers: (() => void)[] = [];

  forEachScope(root, '[data-studio-tabs]', (scope, marker) => {
    const identity = scopeIdentity(scope);
    const activation = tabsActivation(marker.getAttribute('data-studio-tabs-activation'));
    if (identity === undefined || activation === undefined) return;
    disposers.push(
      enhanceTabs(scope, {
        activation,
        kind: 'tabs',
        ...identity,
      }),
    );
  });
  forEachScope(root, '[data-studio-dialog]', (scope, marker) => {
    if (
      exactBoolean(marker.getAttribute('data-studio-dialog-modal')) === undefined ||
      dialogPresentation(marker.getAttribute('data-studio-dialog-presentation')) === undefined
    ) {
      return;
    }
    disposers.push(enhanceDialog(scope));
  });
  forEachScope(root, '[data-studio-popover]', (scope, marker) => {
    const identity = scopeIdentity(scope);
    const presentation = popoverPresentation(
      marker.getAttribute('data-studio-popover-presentation'),
    );
    const dismissOnBlur = exactBoolean(marker.getAttribute('data-studio-popover-dismiss-on-blur'));
    if (identity === undefined || presentation === undefined || dismissOnBlur === undefined) return;
    disposers.push(
      enhancePopover(scope, {
        dismissOnBlur,
        kind: 'popover',
        presentation,
        ...identity,
      }),
    );
  });
  forEachScope(root, '[data-studio-notice-dismiss]', (scope) => {
    disposers.push(enhanceNotice(scope));
  });
  forEachScope(root, '[data-studio-slideshow-autoplay]', (scope, marker) => {
    const identity = scopeIdentity(scope);
    const autoplay = exactBoolean(marker.getAttribute('data-studio-slideshow-autoplay'));
    if (identity === undefined || autoplay === undefined) return;
    disposers.push(
      enhanceSlideshow(scope, {
        autoplay,
        kind: 'slideshow',
        ...identity,
      }),
    );
  });
  forEachScope(root, '[data-studio-lightbox-open]', (scope) => {
    disposers.push(enhanceLightbox(scope));
  });
  forEachScope(root, '[data-studio-countdown]', (scope, marker) => {
    if (!(marker instanceof HTMLTimeElement)) return;
    const identity = scopeIdentity(scope);
    const target = marker.dateTime;
    const display = countdownDisplay(marker.getAttribute('data-studio-countdown-display'));
    const expiredBehavior = countdownExpiredBehavior(
      marker.getAttribute('data-studio-countdown-expired-behavior'),
    );
    if (
      identity === undefined ||
      display === undefined ||
      expiredBehavior === undefined ||
      !isCanonicalTimestamp(target)
    ) {
      return;
    }
    const completionMessage =
      marker.querySelector<HTMLElement>('[data-studio-countdown-complete]')?.textContent ?? '';
    disposers.push(
      enhanceCountdown(scope, {
        completionMessage,
        display,
        expiredBehavior,
        kind: 'countdown',
        ...identity,
        target,
      }),
    );
  });
  forEachScope(root, '[data-studio-navigation-toggle]', (scope) => {
    disposers.push(enhanceNavigation(scope));
  });

  const active: ActivePublishedEnhancement = { disposers, leases: 0 };
  registry.set(root, active);
  return acquirePublishedEnhancement(root, active, registry);
}

/** Enhance immediately, or after parsing when loaded without `defer`. */
export function autoEnhancePublishedStudio(
  root: ParentNode = document,
): StudioPublishedEnhancementHandle {
  if (root !== document || document.readyState !== 'loading') {
    return enhancePublishedStudio(root);
  }

  let active: StudioPublishedEnhancementHandle | undefined;
  let disposed = false;
  const start = (): void => {
    if (!disposed) active = enhancePublishedStudio(document);
  };
  document.addEventListener('DOMContentLoaded', start, { once: true });
  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('DOMContentLoaded', start);
      active?.dispose();
    },
  };
}

function forEachScope(
  root: ParentNode,
  selector: string,
  enhance: (scope: HTMLElement, marker: HTMLElement) => void,
): void {
  const visited = new Set<HTMLElement>();
  for (const marker of root.querySelectorAll<HTMLElement>(selector)) {
    const scope = marker.closest<HTMLElement>('[data-studio-scope]');
    if (
      scope === null ||
      visited.has(scope) ||
      !isWithinRoot(root, scope) ||
      scopeIdentity(scope) === undefined
    ) {
      continue;
    }
    visited.add(scope);
    enhance(scope, marker);
  }
}

function isWithinRoot(root: ParentNode, scope: HTMLElement): boolean {
  if (root === document) return scope.ownerDocument === document;
  if (root instanceof Element) return root === scope || root.contains(scope);
  return scope.getRootNode() === root;
}

function scopeIdentity(scope: HTMLElement): { nodeId: string; scope: string } | undefined {
  const nodeId = scope.dataset.studioNode;
  const scopeId = scope.dataset.studioScope;
  if (
    nodeId === undefined ||
    nodeId.length === 0 ||
    scopeId === undefined ||
    scopeId.length === 0
  ) {
    return undefined;
  }
  return { nodeId, scope: scopeId };
}

function popoverPresentation(
  value: string | null,
): 'dropbar' | 'dropdown' | 'popover' | 'tooltip' | undefined {
  return value === 'dropbar' || value === 'dropdown' || value === 'popover' || value === 'tooltip'
    ? value
    : undefined;
}

function tabsActivation(value: string | null): 'automatic' | 'manual' | undefined {
  return value === 'automatic' || value === 'manual' ? value : undefined;
}

function dialogPresentation(value: string | null): 'modal' | 'offcanvas' | 'overlay' | undefined {
  return value === 'modal' || value === 'offcanvas' || value === 'overlay' ? value : undefined;
}

function countdownDisplay(value: string | null): 'compact' | 'detailed' | undefined {
  return value === 'compact' || value === 'detailed' ? value : undefined;
}

function countdownExpiredBehavior(value: string | null): 'hide' | 'message' | 'zero' | undefined {
  return value === 'hide' || value === 'message' || value === 'zero' ? value : undefined;
}

function exactBoolean(value: string | null): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

function publishedEnhancementRegistry(): WeakMap<ParentNode, ActivePublishedEnhancement> {
  const key = Symbol.for('@kumwe/studio-renderer-web/public-enhancement-runtime/v1');
  const host = globalThis as Record<PropertyKey, unknown>;
  const existing = host[key];
  if (existing instanceof WeakMap) {
    return existing as WeakMap<ParentNode, ActivePublishedEnhancement>;
  }
  const registry = new WeakMap<ParentNode, ActivePublishedEnhancement>();
  Object.defineProperty(host, key, { value: registry });
  return registry;
}

function acquirePublishedEnhancement(
  root: ParentNode,
  active: ActivePublishedEnhancement,
  registry: WeakMap<ParentNode, ActivePublishedEnhancement>,
): StudioPublishedEnhancementHandle {
  active.leases += 1;
  let disposed = false;
  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      active.leases -= 1;
      if (active.leases !== 0 || registry.get(root) !== active) return;
      registry.delete(root);
      while (active.disposers.length > 0) active.disposers.pop()?.();
    },
  };
}

function isCanonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
