# Semantic web renderer contract

The `studio.profile/renderer-web` surface is the portable output contract for Studio's first-party
catalog. Its implementation is `@kumwe/studio-renderer-web`; a host-native implementation conforms
only when it replays the same corpus.

## Inputs and authority

- The Blueprint supplies bounded structure, semantic properties, and binding sources.
- The host resolves every non-static binding and media reference before delivery. Resource and query
  blocks are read-only projections; the renderer has no host port and no fetch authority.
- A safe-markup projection is a structural allowlisted tree, never a raw HTML string.
- A scoped stylesheet is trusted, structured host input and is not stored in the Blueprint.

## Required output

- Every value is escaped for its exact HTML/attribute/SVG context.
- Responsive grid and columns inherit compact → medium → expanded values and support a deterministic
  one/two/four-column composition without storing media queries.
- Accordions, tabs, and slideshows expose all content before enhancement. Keyboard behavior and
  reduced-motion policy apply after the trusted enhancer activates.
- Charts retain an accessible data table; math and diagrams retain their escaped source; drawings are
  rendered from bounded point/stroke data.
- Styles are node-scoped. A CSP nonce is validated before it is emitted. No authored JavaScript,
  handler, URL-bearing CSS, SVG source, or library configuration is accepted.

## Optional exact adapters

The Chart.js 4.5.1, Mermaid 11.17.1, and KaTeX 0.18.4 subpaths are optional lazy peers. Version
mismatch fails closed. Mermaid runs strict mode and its returned SVG is parsed and inspected before
DOM insertion. KaTeX disables trust and uses strict parsing. Chart.js receives a newly built options
object from a parsed `StudioChartSpec`; an artifact cannot override it.

See [ADR 0028](../decisions/0028-portable-semantic-web-renderer.md).
