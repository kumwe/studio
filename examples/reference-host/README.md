# Studio reference host

This standalone Vite host exercises contextual Studio through public protocol, core, and Lit APIs. Studio
opens inside the reference content area for an exact host resource; it is not a detached catalogue screen.
The browser-only reference host resolves the authoring target, offers blank and reusable-type starts, hydrates
separate Model, Blueprint, and Entry artifacts, and accepts the three explicit save intentions. It also exercises
the complete first-party production catalog, the production semantic-web renderer, Studio-owned advanced
controls, deterministic commands, viewport/theme projections, and the origin-pinned canonical preview channel.
It needs no external service or server-side data store; only the explicitly labeled recovery controls use browser
local storage. It is an executable development reference measured against the
[Studio product contract](../../docs/product-contract.md), not an implementation of that complete contract or a
production host.
Its bounded in-memory preview store validates complete drafts with `validateBlueprint` before hashing,
storing, and resolving them; keys include artifact ID, revision, and digest. The renderer recomputes
identity, verifies its node map against canonical preorder, and cooperates with render cancellation.
The block palette is populated by `createCoreProductionBlockDefinitions()` rather than host-local
definitions. The representative page covers layout, rich text, safe host-sanitized markup, media,
gallery/slideshow, tabs, accordion, dialog, popover, notice, code, Mermaid source, LaTeX source, chart,
drawing, exact money, scoped styling, content references, and query-backed collections. Grid and columns
store semantic responsive intent; the renderer emits semantic HTML, bounded scoped CSS, usable advanced
fallbacks, and progressive behavior.

The contextual wrapper demonstrates the bounded `STUDIO-PROD-001`–`006` runtime slice:

- **Edit this content** opens the exact existing reusable-type version and non-empty Entry revision, even though a
  newer type version is available.
- **Start blank** opens new, empty Model, Blueprint, and Entry drafts in the same resource-bound session.
- **Start from reusable type** hydrates the selected exact Model and Blueprint while starting with empty
  Entry values.
- Model, Blueprint, and Content tabs keep the three drafts separate while presenting one continuous authoring
  session. Inline, maximized, minimized, and fullscreen presentations preserve the same snapshot.
- **Save item**, **Save new type version**, and **Save as new type** first show the host plan, affected artifacts,
  and consequences. The host returns the accepted revisions; reusable definitions never contain Entry values.

The “Inline block authoring” panel remains as focused proof for representative rich-text, media, drawing, and
table controls; it is no longer the session boundary. Because this host pins strict style CSP and Trusted Types
without a `default` policy, it explicitly selects Studio's sink-free rich-text surface. The surface retains
Studio's full first-party structured tool suite and canonical JSON; the host neither imports Editor.js nor
weakens its policy. A less restrictive host gets the Studio-owned Editor.js adapter by default without importing
Editor.js itself. The media control uses a host-injected `MediaProvider` while persisting only canonical
references. The deterministic mock demonstrates browse/select/upload handoff but does not claim durable media
custody, scanning, or delivery.

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

The harness proves that the public packages compose into a runnable contextual product slice and that the host
boundary can preserve target, resource, type, Model, Blueprint, Entry, and revision identity. Its in-memory
`AuthoringPort` is the already-authenticated authority for the demonstration; it deliberately rejects attempts
to reinterpret a contextual save as sequential generic artifact saves. It does not claim durable persistence,
authentication, authorization, audit, media custody, publication, Gate A/B, an accepted RC profile, manual
assistive-technology validation, or operational recovery. Those responsibilities belong to a real host such as
Kumwe App. This browser-only example therefore cannot satisfy `STUDIO-PROD-014` or the integrated acceptance
journey in `STUDIO-PROD-015` by itself.
