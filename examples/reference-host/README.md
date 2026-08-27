# Studio reference host

This standalone Vite host exercises the Lit authoring shell, the complete first-party production
catalog, the production semantic-web renderer, Studio-owned advanced controls, deterministic commands,
viewport/theme projections, and the origin-pinned canonical preview channel. It needs no external
service and stores no user data.
It is a development harness measured against the [Studio product contract](../../docs/product-contract.md),
not an implementation of that complete contract.
Its bounded in-memory preview store validates complete drafts with `validateBlueprint` before hashing,
storing, and resolving them; keys include artifact ID, revision, and digest. The renderer recomputes
identity, verifies its node map against canonical preorder, and cooperates with render cancellation.
The block palette is populated by `createCoreProductionBlockDefinitions()` rather than host-local
definitions. The representative page covers layout, rich text, safe host-sanitized markup, media,
gallery/slideshow, tabs, accordion, dialog, popover, notice, code, Mermaid source, LaTeX source, chart,
drawing, exact money, scoped styling, content references, and query-backed collections. Grid and columns
store semantic responsive intent; the renderer emits semantic HTML, bounded scoped CSS, usable advanced
fallbacks, and progressive behavior.

The separate “Inline block authoring” panel is a current harness limitation, not the target inline/contextual
authoring experience. It mounts `StudioAuthoringControlRegistry` outside the canvas because the Lit shell does
not yet coordinate Model, Blueprint, and Entry values in one session. It neither edits an `EntryDocument` nor
proves fields and values on the same canvas, exact reusable-type hydration, or explicit item/type save outcomes
(`STUDIO-PROD-001`–`006`). Because this
host pins strict style CSP and Trusted Types without a `default` policy, it explicitly selects Studio's
sink-free rich-text surface. The surface retains Studio's full first-party structured tool suite and
canonical JSON; the host neither imports Editor.js nor weakens its policy. A less restrictive host gets
the Studio-owned Editor.js adapter by default without importing Editor.js itself. The media control uses
a host-injected `MediaProvider` while persisting only canonical references. The same panel mounts the
dependency-free native SVG drawing and text-only table controls and sends their canonical values through
ordinary Studio commands. The deterministic mock demonstrates browse/select/upload handoff but does not claim
durable media custody, scanning, or delivery.

The renderer surface is now slotted into the shell and the shell owns ready/render ordering, deterministic
coalescing, viewport changes and two-way marker selection through `StudioPreviewBinding`. This harness uses a
real `MessageChannel`, the preview contract's equivalently isolated mechanism, because its deliberately pinned
reference CSP contains `frame-src 'none'`. It therefore proves the surface/controller integration without
claiming the framed deployment path. A production host that supplies an iframe must reconcile its dedicated
authoring response policy and sandbox with the security contract before claiming that profile; this example
does not weaken the pinned policy to simulate it.

From the repository root:

```bash
npm ci
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. To smoke-test the generated bundle under
the pinned Content Security Policy, run `npm start` instead.

Those commands are contributor/harness commands. They do not imply a production Node.js/npm dependency. The
product target requires compiled browser assets served by the host with zero production Node.js/npm
(`STUDIO-PROD-011`), which this Vite harness does not qualify.

The harness proves that the packages compose into a runnable local product slice. It does not claim a
contextual host target, coordinated content-entry/type persistence, presentation continuity, production host,
Gate A/B, or accepted RC profile: authentication, authorization, durable persistence, audit, media custody,
publication, manual assistive-technology validation, and operational recovery belong to a real host such as
Kumwe App and remain outside this browser-only example. It therefore cannot satisfy `STUDIO-PROD-014` or the
integrated acceptance journey in `STUDIO-PROD-015` by itself.
