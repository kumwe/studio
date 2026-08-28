# Blueprint contract

This artifact contract is subordinate to the [Studio product contract](../product-contract.md), especially
`STUDIO-PROD-002` through `STUDIO-PROD-006`, `STUDIO-PROD-009`, and `STUDIO-PROD-014`.

> **Implementation relationship:** the bounded `openStudioSession` Blueprint profile remains supported. The
> additive `openContextualStudioSession` coordinator and contextual shell now coordinate exact Model,
> Blueprint, and Entry drafts and all three save outcomes without changing this Blueprint artifact contract.
> That Studio-side implementation is not evidence of a qualified host integration or completed product journey.

## Purpose

A Blueprint describes reusable composition: layout, typed blocks, field bindings, semantic appearance, slots, responsive intent, and authoring policy. It does not contain template source, executable code, host-specific CSS classes, or the authoritative entry data.

In the product vocabulary, a **reusable content type** is a host-owned authoring definition coordinating one
exact Content Model revision with one exact Blueprint revision (`STUDIO-PROD-004`). The Model owns fields and
the Blueprint owns reusable presentation; Entry values remain separate. Studio coordinates all three in one
contextual session but MUST NOT serialize them into one undifferentiated document.

Blueprint documents conform to [`blueprint.schema.json`](../../schemas/blueprint.schema.json).

## Identity

A Blueprint MUST contain a stable `id`, semantic `version`, immutable host-assigned `revision`, `contractVersion`, ownership reference, model reference, root nodes, dependency inventory, and publication state. The separate owner reference supplies namespace ownership.

Draft revisions MAY contain diagnostics, unresolved optional references, or an empty `roots` array while a new Blueprint is being composed. Published revisions MUST contain at least one root and be fully valid for their declared host, model, block, and theme compatibility range.

For the target new-item flow, the host MAY create an empty draft Blueprint and empty draft Model or resolve an
existing reusable type before Studio opens (`STUDIO-PROD-002`). Studio then keeps those exact coordinates for
the session. The current `openStudioSession` profile requires an existing locked Blueprint reference and MUST
NOT fabricate this bootstrap behavior.

## Tree invariants

- Node IDs MUST be unique within the Blueprint and stable across edits that preserve node identity.
- Each node MUST have exactly one parent slot or be a root.
- Slot names MUST be declared by the selected block definition.
- A node type MUST be allowed by its parent slot's acceptance rule.
- The graph MUST be acyclic and within session depth and count limits.
- Ordered arrays define visual and reading order unless a block contract explicitly supplies a different accessible order that passes conformance.
- Deleting a node MUST delete or explicitly relocate its owned descendants in the same atomic command.

## Block resolution

A node pins a block type and compatible block version. A published Blueprint MUST include a dependency lock recording the exact definition revision and, when applicable, the package integrity reference used for validation. The host MAY resolve a compatible newer renderer only according to the compatibility contract.

An unresolved node remains preserved in draft or recovery state. It MUST NOT be interpreted by a different block sharing a label, alias, or unowned identifier.

Core and authorized extension block definitions and patterns participate through the same owner-aware
contribution lifecycle (`STUDIO-PROD-009`). Disable, removal, upgrade, or trust loss MUST leave persisted nodes
inspectable and migratable without executing an unavailable contribution. A contributed block or pattern does
not grant model, entry, save, or publication authority.

## Bindings

Each binding specifies a target block port, a typed source, an optional chain of named bounded transforms, null/error behavior, and authoring policy.

Field paths address model field IDs, not display labels or storage column names. Renaming a label does not change a binding. Removing or type-changing a field requires a model and Blueprint migration.

The active binding surface MUST use the Blueprint's exact locked model ID, version and revision. A model
coordinate mismatch offers no fields. For each declared block port, Studio MAY offer only visible fields
whose cardinality and kind satisfy the portable compatibility rules in the
[content model contract](content-and-entries.md). Candidate order and nested object paths are deterministic,
and the field's declared authoring control is preserved rather than inferred.

Projection is diagnostic, never reparative. An entry-field binding whose field or block port disappears, or
whose field kind/cardinality becomes incompatible, remains in the Blueprint and receives its exact
`studio.binding/*` diagnostic. Non-field sources remain non-field sources until an explicit `set-binding`
command replaces them. Studio MUST NOT change a host model definition while resolving or editing a Blueprint
binding.

Static values MUST satisfy the target port schema. Query references MUST resolve through a host-owned registered query and MUST preserve authorization before counts, filters, pagination, aggregation, or projection.

## Responsive intent

Responsive behavior uses semantic viewport roles supplied by the theme, for example `compact`, `medium`, and `expanded`. Layout values MAY vary by role using a cascade from the theme-declared base role. Pixel breakpoints, raw media queries and utility-class strings MUST NOT be stored in a portable Blueprint.

The effective property object at every declared viewport MUST satisfy the block definition's exact
`propertySchema` after responsive overrides cascade over base properties. Validation reports the
stored responsive location, and an invalid override blocks publication even when the base object is
valid; a host never defers that refusal until a visitor renders the affected viewport.

For a grid, a Blueprint stores bounded column count, span, order, alignment, gap role and collapse strategy supported by the block/theme pair. The renderer owns exact CSS.

## Authoring controls

Blueprint policy determines whether an entry author may edit content, choose variants, reorder children, insert allowed blocks, or not change the node. Studio MUST make locked state visible and MUST reject forbidden commands even when issued programmatically.

Beyond the node-level mode, an authoring policy may carry per-slot composition markers ([ADR 0013](../decisions/0013-per-slot-composition-markers.md)): `authoring.slots` names individual slots as hybrid-composable regions without making the whole node structural. A marker only grants composability — it never revokes what the node-level policy permits — and its optional `allowedBlocks` bounds that slot ahead of the node-level list.

In the required contextual profile, Blueprint controls share one visible canvas with permitted Model-field and
Entry-value controls (`STUDIO-PROD-003`). Their visual proximity does not change ownership: a layout action
mutates the Blueprint draft, a field-definition action mutates the Model draft, and value entry mutates the
Entry draft. Keyboard and explicit-control paths MUST remain equivalent to pointer interaction
(`STUDIO-PROD-013`).

Studio MUST expose the save outcome explicitly. **Save item** excludes reusable Blueprint changes unless the
host's declared item-local composition policy permits them. **Save new type version** versions the coordinated
Model and Blueprint. **Save as new type** creates a new authoring definition from those two artifacts and strips
Entry values (`STUDIO-PROD-004`, `STUDIO-PROD-006`). No Blueprint edit silently updates every item using the
current reusable type.

## Publication

Publishing a Blueprint MUST:

1. validate schema and semantic invariants;
2. resolve and lock dependencies;
3. verify model, block, theme and renderer compatibility;
4. verify accessibility and security publication rules;
5. create an immutable revision;
6. record actor, timestamp and validation evidence through the host;
7. preserve the previous published revision for rollback according to host policy.

Preview success alone is not publication evidence.
