# Block contract

## Purpose

A block is a typed composition primitive. Its definition describes data and authoring behavior; its renderer is trusted host code; its instances are Blueprint nodes.

Block definitions conform to [`block-definition.schema.json`](../../schemas/block-definition.schema.json).

## Current canonical definition

The `0.1-draft` block schema declares:

- namespaced type, semantic version, contract version and owner;
- localized title, description and category keys;
- property JSON Schema and defaults;
- named slots with cardinality and explicit accepted child types;
- input binding ports with value type, required state and multiplicity, plus optional implementation-neutral authoring control/profile hints;
- supported editing modes; support in a hybrid composite is derived from the declared Blueprint/Content behavior, and read-only is a session state rather than a block mode;
- bounded theme design controls;
- required renderer capabilities by output surface;
- accessibility semantics and author-assistance rules;
- lossless fallback metadata; and
- icon as either a protocol-safe local/namespaced symbol identifier or an integrity-pinned, package-relative asset.

An icon asset path is resolved only inside the trusted package that owns the definition. The current schema's restricted package-relative path cannot contain a scheme, absolute root, traversal or dot segment, backslash, query, fragment, percent-encoding, or control character. A required SRI digest binds the selected package file. Studio MUST NOT interpret an icon path as a URL or fetch it from an author-controlled origin.

## Gate A definition targets

Before Gate A can claim the complete block contract, a later canonical schema in the draft epoch must add or deliberately resolve:

- explicit port direction and block-level null/error defaults;
- bounded responsive-control declarations distinct from theme controls;
- required host capabilities distinct from renderer requirements; and
- capability-based child acceptance, including the child definition's provided-capability inventory, capability versions, and deterministic matching rules; and
- migration declarations and compatibility ranges.

These groups are target requirements, not fields accepted by `block-definition.schema.json` in `0.1-draft`. Namespaced extension data may support experiments, but cannot claim canonical block conformance for them.

## Properties

Properties are instance configuration such as alignment, recipe, column policy, decorative state, or an optional static heading. They MUST be schema-valid and bounded under the [Studio Schema Profile](schema-profile.md). User-authored content SHOULD normally be an entry field binding, not duplicated in Blueprint properties.

Property controls are generated from schema and UI hints where possible. A custom inspector is executable plugin code and requires explicit host capability and trust.

## Slots

A `0.1-draft` slot definition names its semantic purpose, a non-empty allowlist of accepted child block types, minimum and maximum children, and whether order is meaningful. Validation tests each actual child type against that allowlist. The grid fixture is therefore intentionally explicit about accepting the example price block.

Capability-based child acceptance is not part of the current schema. Gate A may add it only together with a versioned provided-capability inventory on child block definitions and deterministic matching semantics. Slot acceptance capabilities are block-composition traits and MUST NOT be inferred from or compared with the host/session capability inventory.

Blocks MUST NOT inspect or mutate siblings or ancestors outside declared command APIs. Cross-node relationships use stable node references with explicit semantic validation.

## Binding ports

An `0.1-draft` port is an input and declares a logical type such as `text`, `rich-text`, `money`, `media`, `resource`, or a namespaced extension type. Studio validates source-to-port compatibility and every transform. Null and error behavior is currently explicit on each Blueprint binding. Renderers receive already resolved, authorized, typed values. Gate A must decide and schema-model output ports and block-level defaults before they become portable behavior.

Optional `authoring` metadata selects a namespaced Studio control and semantic profile. It MUST NOT
expose the editor library, renderer configuration, callbacks, or a host framework type. `readOnly: true`
means the shell may display the host-resolved projection but does not offer a mutation for that port.
In particular, the first-party resource and query projection blocks are read-only: only a host can
authorize and resolve their database-backed values.

## Renderers

A block MAY have multiple renderer implementations identified by surface and renderer ID. The definition manifest describes compatibility; executable renderer registration remains trusted host or plugin code.

A renderer MUST:

- escape or safely encode all untrusted values for its output context;
- produce declared accessible semantics;
- avoid undeclared network or storage access;
- tolerate documented optional/null values;
- provide a deterministic fallback or a blocking diagnostic when required input is absent;
- expose preview markers only in authenticated preview mode.

## Progressive enhancement

Interactive delivery behavior such as accordions or tabs is an optional renderer asset declared by the trusted package. The block's server output MUST contain usable semantic content before enhancement. The Blueprint never stores event handlers or script.

## Accessibility declaration

Every block definition classifies itself as structural, landmark, interactive, media, text, decorative, data display, or composite. It declares required accessible names, heading/landmark behavior, keyboard expectations, focus behavior, output checks, and reduced-motion handling. A block lacking the required declaration cannot pass publication conformance.

## Unknown and inactive blocks

Studio preserves an unknown node as opaque data and displays its type, owner, version and diagnostic. It MUST NOT render the node through an unrelated definition. Publication is blocked unless the dependency lock names an explicit trusted fallback whose data conversion is deterministic and lossless for the promised fields.

## Core layout blocks

Studio ships canonical `section`, `stack`, `grid`, and `columns` block definitions without standardizing their HTML/CSS implementation. The definitions expose closed semantic properties for alignment, spacing, per-viewport visibility, stack direction, a one-through-twelve grid/column count, and collapse behavior. Responsive overrides use the ordinary Blueprint property map and inherit from the base value when the active viewport has no override; the document never stores a media query, class name, declaration, or viewport-specific markup.

`createCoreLayoutBlockDefinitions` admits the layout family recursively and requires a host to add each content block type explicitly. It likewise requires one or more trusted renderer capabilities; there is no wildcard slot or renderer. `resolveCoreLayoutIntent` validates the effective tokens against the active theme and reports exact base/default/viewport provenance. A missing theme control or choice fails closed instead of selecting a visually similar replacement. See [ADR 0022](../decisions/0022-core-layout-block-family.md).

## First-party production catalog

`createCoreProductionBlockDefinitions()` returns the complete 30-type catalog: section, stack, grid,
columns, heading, rich text, image, gallery/slideshow, video, audio, attachment, code, math, Mermaid
diagram, chart, drawing, embed, call to action, card, accordion/item, tabs/tab, dialog, popover,
message notice, callout, content
reference, content collection, and money. `coreProductionInitialProperties()` is the only canonical
factory for a new first-party node's property defaults; every result validates against its definition.

`createCoreProductionPatterns()` returns ten portable starter compositions. Patterns may use static
bindings or host-resolved resource/query bindings, but contain no HTML, CSS, JavaScript, template, SQL,
or implementation-specific editor state. See [ADR 0026](../decisions/0026-production-block-catalog.md).
