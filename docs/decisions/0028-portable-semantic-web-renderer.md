# ADR 0028: Portable semantic web rendering with optional advanced adapters

- **Status:** Proposed
- **Date:** 2026-08-25

## Context

Studio's document model must remain portable while a production page needs semantic HTML, responsive
CSS, media and business-resource projections, charts, equations, diagrams, drawings, tabs,
accordions, dialogs, popovers, notices, and slideshows. Letting each host interpret the catalog independently would produce
incompatible output. Persisting a frontend library configuration would give that library ownership of
the public contract.

## Decision

Studio ships `@kumwe/studio-renderer-web` as an eighth coordinated package. It renders all first-party
types to escaped semantic HTML and deterministic CSS. Dynamic binding and media values come from host
callbacks; the renderer never queries a database or storage system. Base output remains readable and
operable without JavaScript. Trusted progressive enhancement is installed after rendering and is
disposable.

Chart, Mermaid and LaTeX values use Studio-owned canonical data/source shapes. Exact Chart.js 4.5.1,
Mermaid 11.17.1 and KaTeX 0.18.4 support is isolated behind lazy optional peer adapters and subpath
exports. Their configuration and runtime objects never enter a Blueprint.

Raw authored HTML is not a renderer input. Approved HTML is converted at an earlier trust boundary to
a structural `SafeMarkupFragment`, then rechecked and escaped. Scoped CSS is a bounded rule/declaration
document supplied by the trusted host, compiled under one deterministic node scope, and emitted with
the host's validated CSP nonce. Authored JavaScript remains excluded.

## Consequences

- Standalone Studio and every host can replay the same renderer-web corpus.
- Hosts may omit advanced peers; accessible source/table fallbacks remain.
- Server and client implementations can implement the same schema without linking a JavaScript
  editor or renderer library.
- A renderer-web profile claim still requires executable corpus and browser evidence; this ADR does
  not mark a release gate complete.

## Rejected alternatives

- Core-specific Twig generation was rejected as the only implementation because Studio would cease
  to be standalone. Core may project the same semantics into Twig through its adapter.
- Eagerly bundling all advanced libraries was rejected for startup cost and unnecessary attack
  surface.
- Storing arbitrary HTML, CSS, JavaScript, SVG, or library options was rejected as non-portable and
  unsafe.
