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
- Accordions, dialogs, popovers, tabs, and slideshows expose all content before enhancement. Keyboard behavior and
  reduced-motion policy apply after the trusted enhancer activates.
- Charts retain an accessible data table; math and diagrams retain their escaped source; drawings are
  rendered from bounded point/stroke data.
- Portable rich text renders every governed block, inline node, and mark as semantic HTML. Callout and
  highlight tones remain bounded `data-studio-tone` values; checklist state and depth render as
  labelled native checkboxes in nested lists with explicit accessible levels; table headers, hard
  breaks, and inert code language/source remain explicit in the output.
- Styles are node-scoped through a bounded, lossless encoding of the schema-valid node ID, so distinct
  nodes cannot share CSS or trusted enhancement targets. Public scope input and a CSP nonce are
  validated before either is emitted. No authored JavaScript, handler, URL-bearing CSS, SVG source, or
  library configuration is accepted.
- The closed presentation intent maps to renderer-owned CSS. Motion is installed only by the
  disposable enhancer, respects reduced-motion preferences, and leaves content visible when
  JavaScript is absent. Parallax offsets are bounded and never accept authored measurements.
- Countdown, lightbox, dialog/offcanvas/overlay, popover/dropdown/dropbar/tooltip, navigation,
  slideshow, and tab behavior is Studio-owned and disposable. Native disclosure, links, ordered
  content, semantic time, and data tables remain useful before enhancement.
- `allowBlobMedia` defaults to false. When explicitly enabled it applies only to a trusted media
  resolver's syntactically bounded `blob:https?` result. Active SVG/HTML media and all `data:` URLs
  still fail closed; ordinary resource, embed, and action URL sinks never inherit this authority.
- Root and slot traversal is deterministic. Async host binding or media resolution cannot reorder the
  returned HTML, scoped CSS, or trusted enhancement jobs relative to Blueprint document order.

## Normative conformance corpus

The JSON vectors in `schemas/conformance/renderer-web` are the language-neutral rendering contract,
not examples. Their declared coverage must remain exhaustive across all 45 canonical block types,
the nine progressive behavior families, the ten presentation capabilities, and the five security
fallbacks. CI rejects a coverage claim whose block does not occur in that vector and rejects any
catalog or capability that disappears from the union.

Every renderer implementation, including a server-side PHP/Twig adapter, must replay these vectors
against its own output. It may use host-native templates internally, but it must preserve the
required semantic elements, `studio-block` classes, `data-studio-*` markers, progressive fallback,
responsive rules, enhancement requirements, escaping, and fail-closed URL/media behavior. A host
must not infer or redefine those rules independently.

## Optional exact adapters

The Chart.js 4.5.1, Mermaid 11.17.1, and KaTeX 0.18.4 subpaths are optional lazy peers. Version
mismatch fails closed. Mermaid runs strict mode and its returned SVG is parsed and inspected before
DOM insertion. KaTeX disables trust and uses strict parsing. Chart.js receives a newly built options
object from a parsed `StudioChartSpec`; an artifact cannot override it.

See [ADR 0028](../decisions/0028-portable-semantic-web-renderer.md).
