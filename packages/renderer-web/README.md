# `@kumwe/studio-renderer-web`

Portable semantic HTML and trusted progressive enhancements for the Studio production catalog.

`renderStudioWeb(document, context)` renders all 45 first-party types, escapes ordinary values,
resolves media and business resources only through host callbacks, emits responsive 4→2→1 layout
CSS, and returns a CSP-nonce-bearing style element plus declarative enhancement jobs. The base HTML is
usable without JavaScript: accordions, dialogs, and popovers use `details`, tab panels remain visible, chart data remains an
accessible table, and slideshow items remain an ordered scrollable collection.

`enhanceStudioWeb(root, result, options)` installs the trusted tab/slideshow behavior and optional
advanced adapters. It returns an idempotent disposal handle. The Blueprint never contains event
handlers, scripts, Chart.js options, Mermaid settings, KaTeX trust settings, or DOM objects.

Every block may carry the closed Studio `design` intent for alignment, responsive visibility,
spacing, sizing, scrolling, print selection, sticky positioning, and reduced-motion-aware
fade/slide/scale/parallax behavior. These are semantic choices compiled by the renderer, never raw
CSS.

The trusted enhancer also owns countdown updates, gallery lightboxes, modal/offcanvas/overlay focus,
popover/dropdown/dropbar/tooltip disclosure, tabs, and slideshows. Local upload previews require the
explicit `allowBlobMedia` authority; it is off by default, applies only to media resolver output, and
still rejects active SVG/HTML media and every `data:` URL.

Advanced libraries are exact, optional peers and lazy subpaths:

```ts
import { enhanceStudioWeb, renderStudioWeb } from '@kumwe/studio-renderer-web';
import { createChartJsAdapter } from '@kumwe/studio-renderer-web/adapters/chart-js';
import { createKatexAdapter } from '@kumwe/studio-renderer-web/adapters/katex';
import { createMermaidAdapter } from '@kumwe/studio-renderer-web/adapters/mermaid';

const result = await renderStudioWeb(blueprint, hostContext);
mount.replaceChildren(fragmentBuiltFromTrustedRendererResult);
await enhanceStudioWeb(mount, result, {
  adapters: {
    chart: createChartJsAdapter(),
    diagram: createMermaidAdapter(),
    math: createKatexAdapter(),
  },
});
```

The package does not parse arbitrary HTML. A host or authoring adapter must convert allowed pasted
HTML into `SafeMarkupFragment`, whose tags and attributes are rechecked and escaped on output. Scoped
style overrides are likewise structured host input, property/value allowlisted, node-bounded, and
rendered under the host's CSP nonce. Authored JavaScript is never accepted.

The eight canonical JSON vectors in `schemas/conformance/renderer-web` are the portable contract for
all 45 block types, every Studio-owned progressive behavior and presentation capability, and the
security fallbacks. Browser and server renderers must replay the same corpus. This prevents a
PHP/Twig host, for example, from re-inventing Studio semantics while still allowing it to use native
templates and caching internally.
