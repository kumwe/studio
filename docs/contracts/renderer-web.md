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
- The closed presentation intent maps to renderer-owned CSS. Motion remains a semantic/server-rendered
  projection with visible reduced-motion-aware output when JavaScript is absent. Controlled authoring-preview,
  library, and test integrations may exercise the disposable `enhanceStudioWeb` motion seam, but `motion`
  cannot authorize the published enhancement runtime. Parallax offsets are bounded and never accept authored
  measurements.
- The public enhancement set is exactly `tabs`, `dialog`, `popover`, `notice`, `slideshow`, `lightbox`,
  `countdown`, and `navigation`. Native disclosure, links, ordered content, semantic time, and data tables
  remain useful before enhancement.
- The sole per-page need signal is whether the closed `enhancements` output intersects that exact eight-family
  set. An empty intersection forbids loading the public runtime; a non-empty intersection authorizes the host
  to include Studio's one release-manifest-pinned, content-hashed, self-contained IIFE with `defer`. `chart`,
  `diagram`, `math`, and `motion` never authorize it.
- The public IIFE activates only from the bounded `data-studio-*` attributes emitted by the renderer contract.
  It does not fetch configuration or content, and no host script, adapter, frontend framework, or alternate
  bundle may supply behavior inside published Studio output. Chart, diagram, math, and motion remain
  semantic/server output or controlled authoring-preview, library, and test seams.
- `allowBlobMedia` defaults to false. When explicitly enabled it applies only to a trusted media
  resolver's syntactically bounded `blob:https?` result. Active SVG/HTML media and all `data:` URLs
  still fail closed; ordinary resource, embed, and action URL sinks never inherit this authority.
- Root and slot traversal is deterministic. Async host binding or media resolution cannot reorder the
  returned HTML, scoped CSS, or trusted enhancement jobs relative to Blueprint document order.

## Normative conformance corpus

The JSON vectors in `schemas/conformance/renderer-web` are the language-neutral rendering contract,
not examples. Their `coverage.behaviors` union is exactly the native accordion behavior plus the eight public
enhancement families. Separately, `expect.enhancements` covers the non-authorizing `chart`, `diagram`, `math`,
and `motion` jobs as well as the eight public jobs. Declared coverage must also remain exhaustive across all 45
canonical block types, ten presentation capabilities, and five security fallbacks. CI rejects a coverage claim
whose block does not occur in that vector and rejects any catalog or capability that disappears from the union.

Every renderer implementation, including Producer's PHP realization or another server-side adapter, must
replay these vectors against its own output. It may use host-native templates internally, but it must preserve
the required semantic elements, `studio-block` classes, exact `data-studio-*` markers, progressive fallback,
responsive rules, enhancement list and need-signal result, escaping, and fail-closed URL/media behavior.
Producer must prove both the vector result and the emitted attribute boundary at its deliberate Studio pin.
Every vector binds the exact canonical HTML through `htmlBytes` and `htmlSha256`; `activationMarkers` remains a
readable closed-vocabulary diagnostic, while the HTML digest closes element relationships and marker topology.
A host must not infer or redefine those rules independently.

For published delivery, the renderer's compact `css` bytes are the materialization input. A host MUST preserve
their deterministic bytes, write them to a content-hashed minified stylesheet, record SHA-256 SRI, byte size,
and a reviewed size budget in its immutable delivery manifest, and link that exact asset with integrity. The
nonce-bearing `styleElement` is a controlled authoring-preview/library convenience; it is not the published
stylesheet contract and cannot create an inline-CSS deployment track.

The browser-assets manifest's `publicRenderer.style` record is the machine-readable materialization rule:
Producer writes the exact UTF-8 `renderer-web.css` bytes without another host-selected transform, derives the
16-hex filename suffix and SRI from SHA-256, and enforces the 262,144-byte ceiling. Every renderer-web vector
publishes exact `htmlBytes`/`htmlSha256` and `cssBytes`/`cssSha256`, so a PHP replay proves canonical markup
topology and stylesheet byte identity rather than only matching selected fragments or declarations. The
presentation vector carries a schema-bounded `context.scopedStyles` input, so the same proof also closes the
trusted host-style declaration ordering and node-scoping algorithm.
The rule's `outputSchema` points to the published `$defs.publicStyleAsset` closed shape. Each renderer vector's
exact `expect.publicStyleAsset` proves the required cross-field derivation from that vector's CSS bytes; schema
validation alone cannot prove that a filename prefix, full digest, SRI, and byte count all describe the same
content. Producer must replay both layers. Producer records that
exact `{ path, role, mediaType, bytes, budgetBytes, contentHash, integrity, minified }` object in the host's
immutable per-page delivery manifest; a locally invented asset record is not conforming.

## Controlled preview and library adapters

The Chart.js 4.5.1, Mermaid 11.17.1, and KaTeX 0.18.4 subpaths are optional lazy peers. Version
mismatch fails closed. Mermaid runs strict mode and its returned SVG is parsed and inspected before
DOM insertion. KaTeX disables trust and uses strict parsing. Chart.js receives a newly built options
object from a parsed `StudioChartSpec`; an artifact cannot override it.

Those adapters and `enhanceStudioWeb` exist only for controlled authoring-preview, direct library, and test
integrations. They are not public delivery artifacts, do not change the eight-family need signal, and MUST NOT
be bundled or loaded as an alternate source of behavior on a published page.

See [ADR 0028](../decisions/0028-portable-semantic-web-renderer.md).
