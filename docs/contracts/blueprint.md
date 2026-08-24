# Blueprint contract

## Purpose

A Blueprint describes reusable composition: layout, typed blocks, field bindings, semantic appearance, slots, responsive intent, and authoring policy. It does not contain template source, executable code, host-specific CSS classes, or the authoritative entry data.

Blueprint documents conform to [`blueprint.schema.json`](../../schemas/blueprint.schema.json).

## Identity

A Blueprint MUST contain a stable `id`, semantic `version`, immutable host-assigned `revision`, `contractVersion`, ownership reference, model reference, root nodes, dependency inventory, and publication state. The separate owner reference supplies namespace ownership.

Draft revisions MAY contain diagnostics, unresolved optional references, or an empty `roots` array while a new Blueprint is being composed. Published revisions MUST contain at least one root and be fully valid for their declared host, model, block, and theme compatibility range.

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

For a grid, a Blueprint stores bounded column count, span, order, alignment, gap role and collapse strategy supported by the block/theme pair. The renderer owns exact CSS.

## Authoring controls

Blueprint policy determines whether an entry author may edit content, choose variants, reorder children, insert allowed blocks, or not change the node. Studio MUST make locked state visible and MUST reject forbidden commands even when issued programmatically.

Beyond the node-level mode, an authoring policy may carry per-slot composition markers ([ADR 0013](../decisions/0013-per-slot-composition-markers.md)): `authoring.slots` names individual slots as hybrid-composable regions without making the whole node structural. A marker only grants composability — it never revokes what the node-level policy permits — and its optional `allowedBlocks` bounds that slot ahead of the node-level list.

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
