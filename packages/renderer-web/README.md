# `@kumwe/studio-renderer-web`

Portable semantic HTML and trusted progressive enhancements for the Studio production catalog.

`renderStudioWeb(document, context)` renders all 27 first-party types, escapes ordinary values,
resolves media and business resources only through host callbacks, emits responsive 4→2→1 layout
CSS, and returns a CSP-nonce-bearing style element plus declarative enhancement jobs. The base HTML is
usable without JavaScript: accordions use `details`, tab panels remain visible, chart data remains an
accessible table, and slideshow items remain an ordered scrollable collection.

`enhanceStudioWeb(root, result, options)` installs the trusted tab/slideshow behavior and optional
advanced adapters. It returns an idempotent disposal handle. The Blueprint never contains event
handlers, scripts, Chart.js options, Mermaid settings, KaTeX trust settings, or DOM objects.

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
