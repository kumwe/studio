import type { BlueprintNode, MediaReference, StudioChartSpec } from '@kumwe/studio-protocol';

export interface ResolvedWebMedia {
  altText: string;
  caption?: string;
  height?: number;
  mediaType?: string;
  src: string;
  width?: number;
}

export interface ResolvedWebResource {
  id: string;
  label: string;
  summary?: string;
  url?: string;
}

export interface StudioScopedStyleRule {
  declarations: Readonly<Record<string, string>>;
  target: 'action' | 'content' | 'heading' | 'media' | 'self';
}

/** Host-supplied, structured style intent. It is not stored in a Blueprint. */
export interface StudioScopedStyleSheet {
  rules: readonly StudioScopedStyleRule[];
}

export type StudioWebEnhancement =
  | { kind: 'chart'; nodeId: string; scope: string; spec: StudioChartSpec }
  | {
      completionMessage: string;
      display: 'compact' | 'detailed';
      expiredBehavior: 'hide' | 'message' | 'zero';
      kind: 'countdown';
      nodeId: string;
      scope: string;
      target: string;
    }
  | { kind: 'navigation'; nodeId: string; scope: string }
  | { kind: 'diagram'; nodeId: string; scope: string; source: string }
  | { kind: 'dialog'; modal: boolean; nodeId: string; scope: string }
  | { kind: 'math'; displayMode: boolean; nodeId: string; scope: string; source: string }
  | { kind: 'lightbox'; nodeId: string; scope: string }
  | {
      animation: 'fade' | 'parallax' | 'scale' | 'slide';
      kind: 'motion';
      nodeId: string;
      scope: string;
    }
  | { kind: 'notice'; nodeId: string; scope: string }
  | {
      dismissOnBlur: boolean;
      kind: 'popover';
      nodeId: string;
      presentation: 'dropbar' | 'dropdown' | 'popover' | 'tooltip';
      scope: string;
    }
  | { autoplay: boolean; kind: 'slideshow'; nodeId: string; scope: string }
  | { activation: 'automatic' | 'manual'; kind: 'tabs'; nodeId: string; scope: string };

export interface StudioWebRenderContext {
  /** Explicit trusted authority for local host-generated media previews; default is false. */
  allowBlobMedia?: boolean;
  cspNonce?: string;
  locale?: string;
  resolveBinding?: (node: Readonly<BlueprintNode>, port: string) => unknown;
  resolveMedia?: (
    reference: Readonly<MediaReference>,
  ) => Promise<ResolvedWebMedia> | ResolvedWebMedia;
  scopedStyles?: Readonly<Record<string, StudioScopedStyleSheet>>;
}

export interface StudioWebRenderResult {
  css: string;
  enhancements: StudioWebEnhancement[];
  html: string;
  styleElement: string;
}

export interface StudioChartEnhancer {
  enhance(canvas: HTMLCanvasElement, spec: Readonly<StudioChartSpec>): Promise<() => void>;
}

export interface StudioMarkupEnhancer<TValue> {
  render(value: TValue): Promise<Node>;
}

export interface StudioWebAdvancedAdapters {
  chart?: StudioChartEnhancer;
  diagram?: StudioMarkupEnhancer<string>;
  math?: StudioMarkupEnhancer<{ displayMode: boolean; source: string }>;
}

export interface StudioWebEnhancementOptions {
  adapters?: StudioWebAdvancedAdapters;
  signal?: AbortSignal;
}

export interface StudioWebEnhancementHandle {
  dispose(): void;
}

export interface SafeMarkupText {
  kind: 'text';
  value: string;
}

export interface SafeMarkupElement {
  attributes?: Readonly<Record<string, string>>;
  children: readonly SafeMarkupNode[];
  kind: 'element';
  tag: string;
}

export type SafeMarkupNode = SafeMarkupElement | SafeMarkupText;

/** Sanitized structural projection; raw HTML is never accepted by the renderer. */
export interface SafeMarkupFragment {
  kind: 'safe-markup-fragment';
  nodes: readonly SafeMarkupNode[];
  policy: string;
}
