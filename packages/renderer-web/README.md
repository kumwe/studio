# `@kumwe/studio-renderer-web`

Status: governed beta development, not an RC or production-supported release. The exact coordinated version
is in the workspace `studio-release.json`; renderer conformance and host support still require accepted
evidence.

Portable semantic HTML and the single prebuilt progressive-enhancement runtime for the Studio production
catalog.

`renderStudioWeb(document, context)` renders all 45 first-party types, escapes ordinary values,
resolves media and business resources only through host callbacks, emits responsive 4→2→1 compact layout
CSS, and returns a CSP-nonce-bearing style element for controlled preview/library use plus declarative
enhancement jobs. The base HTML is usable
without JavaScript: accordions, dialogs, and popovers use semantic disclosure, tab panels remain visible,
chart data remains an accessible table, and slideshow items remain an ordered scrollable collection.

Published delivery materializes the exact `css` bytes as a minified, content-hashed stylesheet with SHA-256
SRI, recorded byte size, and a reviewed size budget in the host's immutable delivery manifest. The inline
`styleElement` does not satisfy that public artifact contract and must not create a second published CSS path.

The published-page contract has exactly eight enhancement families: `tabs`, `dialog`, `popover`, `notice`,
`slideshow`, `lightbox`, `countdown`, and `navigation`. The renderer's `enhancements` result is the complete
per-page need signal. Producer or another server renderer tells its host whether that result contains one of
`STUDIO_PUBLIC_ENHANCEMENT_FAMILIES`; the host includes Studio's one manifest-pinned, content-hashed prebuilt
`enhancement-runtime` with `defer` only when needed. The file is safe to include unconditionally, but no other
script may supply published Studio behavior.

The prebuilt runtime calls `autoEnhancePublishedStudio()` and activates solely from the bounded
`data-studio-*` attributes emitted by the renderer contract. It has no imports, performs no content or
configuration fetch, and introduces no second renderer. No-JavaScript output remains the complete semantic
fallback.

The public file is the one `studio-assets.json` member with `role: "enhancement-runtime"`; its `path` must equal
`enhancementRuntime.entryPoint`. After verifying that member's bytes, budget, content hash, SRI, and
`minified: true`, a host loads it as a classic script using the manifest values—not a copied filename or a
package subpath:

```html
<script
  src="/immutable-studio/<manifest-selected enhancement-runtime path>"
  integrity="<matching assets member integrity>"
  crossorigin="anonymous"
  defer
></script>
```

Its exact manifest-recorded CSP baseline is:

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'
```

This is the published-page enhancement policy, not Studio authoring's separate `lit-html`/style-nonce policy.
A real page may add narrow content directives for its server-rendered CSS, images, or fonts, but the runtime
requires no `connect-src`, inline source, eval source, or Trusted Types policy. The complete selection, CSP,
and immutable-deployment recipe is in
[`docs/integration/prebuilt-browser-assets.md`](../../docs/integration/prebuilt-browser-assets.md#two-browser-surfaces-two-policies).

Every block may carry the closed Studio `design` intent for alignment, responsive visibility,
spacing, sizing, scrolling, print selection, sticky positioning, and reduced-motion-aware
fade/slide/scale/parallax behavior. These are semantic choices compiled by the renderer, never raw
CSS.

`enhanceStudioWeb(root, result, options)` and the Chart.js, Mermaid, and KaTeX adapter subpaths remain available
only to controlled authoring-preview, library, and test integrations. They are not release artifacts and MUST
NOT be bundled, loaded, or treated as an alternate source of behavior on a published page. Charts, diagrams,
math, motion, and any adapter-only job do not trigger the public runtime; their bounded server-rendered or
no-JavaScript projection remains authoritative.

Local upload previews require the explicit `allowBlobMedia` authority; it is off by default, applies only to
media resolver output, and still rejects active SVG/HTML media and every `data:` URL. That preview authority is
not part of the published runtime.

The package does not parse arbitrary HTML. A host or authoring adapter must convert allowed pasted
HTML into `SafeMarkupFragment`, whose tags and attributes are rechecked and escaped on output. Scoped
style overrides are likewise structured host input, property/value allowlisted, node-bounded, and
rendered under the host's CSP nonce. Authored JavaScript is never accepted.

The eight canonical JSON vectors in `schemas/conformance/renderer-web` are the portable contract for
all 45 block types, every Studio-owned progressive behavior and presentation capability, and the
security fallbacks. Browser and server renderers must replay the same corpus. This prevents a
PHP/Twig host, for example, from re-inventing Studio semantics while still allowing it to use native
templates and caching internally.
