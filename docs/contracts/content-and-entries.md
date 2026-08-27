# Content model and entry contracts

This contract is subordinate to the [Studio product contract](../product-contract.md). In particular,
`STUDIO-PROD-001` through `STUDIO-PROD-006`, `STUDIO-PROD-008` through `STUDIO-PROD-012`, and
`STUDIO-PROD-014` define the contextual authoring outcome these artifacts must support. The product term
**reusable content type** means one host-owned authoring definition that coordinates exact Content Model and
Blueprint revisions. It is not a new portable artifact and it never contains an Entry's values.

> **Current implementation:** the shipped headless composition profile persists one Blueprint, the model
> projection is read-only, and the Lit shell does not hold or persist an Entry. The coordinated contextual
> behavior below is a required target, not an implementation claim (`STUDIO-PROD-014`).

## Content models

A content model defines stable field IDs, types, constraints, semantic roles, relationships, localization, defaults, and authoring metadata. It conforms to [`content-model.schema.json`](../../schemas/content-model.schema.json).

Model fields MUST use stable namespaced or model-scoped identifiers. Labels and help text use localization keys. Storage names, database types, validators and domain internals are host concerns and MUST NOT leak into portable Blueprints.

A new model draft MAY begin with an empty `fields` array so Model mode has a valid initial state. A published model MUST contain at least one field and satisfy every semantic and host-domain invariant; changing status is not a shortcut around publication validation.

Supported protocol field kinds are deliberately bounded: string, rich text, boolean, integer, decimal, money, date, date-time, enum, media reference, resource reference, object and collection. Hosts and plugins MAY add namespaced kinds with published schemas and conformance mappings.

`defaultValue` is a static, schema-valid value suggestion. Applying it is an explicit command; validation never mutates an entry or evaluates a dynamic expression. Contextual or calculated defaults require a namespaced, host-registered operation in a later compatible contract and are not represented as executable model data.

Field `authoring` metadata is a bounded presentation hint for control, placeholder, grouping, order, read-only display, visibility and width. It does not grant permission, suppress host validation, or make a hidden field confidential. Host permission remains authoritative.

Relationships declare cardinality, stable source field, target model/version, optional target field, deletion behavior, and bounded authoring hints. They are host-resolved metadata; they do not embed queries, storage keys, cascade code, or ownership of the related record. Relationship access, creation, search and deletion remain authorized host use cases.

## Model lifecycle

Published model revisions are immutable. A model draft may add, remove or change fields, but publishing a breaking change requires a migration plan for entries and dependent Blueprints. Studio MUST show the effect on bindings before accepting the publication request.

Dragging an unbound field-like block into a Blueprint MAY offer to create a model field only when the actor has model-design permission. Creation occurs in a visible model draft and never silently mutates a published model.

The target coordinated contextual profile MUST let an authorized author add and configure typed fields while
composing the layout and values in the same Studio session (`STUDIO-PROD-003`). The host still creates a model
draft and returns its accepted revision; Studio MUST NOT make a published model mutable or disguise a model
version operation as a local canvas change. Field-adapter contributions declared by an authorized extension
MAY supply the control for a namespaced field kind, but they do not gain definition-write authority
(`STUDIO-PROD-009`, `STUDIO-PROD-010`).

## Entries

An entry is a set of values conforming to one exact model revision. It conforms to [`entry.schema.json`](../../schemas/entry.schema.json).

Entries contain stable identity, model reference, host revision, locale/translation metadata, workflow state, values, and optional composition overrides explicitly allowed by the Blueprint. Host-generated audit, authorization, and publication data MUST NOT be accepted from untrusted clients as authoritative.

When Studio opens an existing item in the target contextual profile, the host MUST supply the exact reusable
content-type version, its locked Model and Blueprint revisions, and the Entry revision and values that belong to
that item (`STUDIO-PROD-005`). Studio MUST NOT substitute the latest type, reconstruct values from rendered
markup, or ask the author to copy values between a legacy form and the canvas. A new item MUST be able to start
from an authorized reusable type or from host-created empty draft artifacts in the same launch flow
(`STUDIO-PROD-002`, `STUDIO-PROD-012`).

## Values and precision

- Decimal, money, and quantity-like extension values MUST use exact string representations with declared scale or currency rather than binary floating point.
- Date values use RFC 3339 full-date strings; date-time values use RFC 3339 instants or explicitly declared local-date-time semantics.
- Media and resource values store stable opaque references, not expiring URLs.
- Rich text stores a bounded typed document, never unsanitized HTML.
- Object and collection fields declare nested schemas and limits.

## Binding behavior

Studio derives an entry editing surface from the intersection of:

- fields in the pinned model revision;
- ports bound by the active Blueprint;
- authoring policy;
- actor field permissions;
- workflow state and host capability.

A field hidden by permission MUST NOT appear in the canvas, inspector, outline, diagnostics, clipboard, undo metadata, preview messages, telemetry, or counts. The host enforces the same rule when resolving preview or rendering data.

Blueprint binding projection consumes one already-authorized `content-model` snapshot and the Blueprint's
exact model lock. The model ID, semantic version and immutable revision MUST all match before any candidate
is offered. A mismatch fails the candidate surface closed and reports the exact coordinate member; Studio
does not search the catalog for a plausible replacement.

Candidate order is deterministic: fields follow `authoring.order`, then their declaration order; nodes use
Blueprint preorder with slot names compared by UTF-16 code unit. An authoring-hidden field is not a candidate.
A single-cardinality object may expose its children through their complete field-ID path; collection/object
children are not flattened into an invented coordinate. Port and field cardinality MUST agree. Field kind
matches the port value type exactly except for the declared portable aliases: `text` accepts `string` and
`enum`, while `number` accepts `integer` and `decimal`; a collection compares its `itemKind`.

The field's declared `authoring.control` travels with the candidate exactly. A built-in client may render the
matching control; a namespaced control requires the host's field-adapter contribution and MUST NOT be
silently replaced by an inferred input. Controls are presentation hints, not entry-write authority.

An existing binding is never rewritten during projection. A removed field reports
`studio.binding/field-missing`; changed cardinality or kind reports
`studio.binding/field-cardinality-incompatible` or `studio.binding/field-kind-incompatible`; a removed block
port reports `studio.binding/port-missing`; and a required unbound port reports
`studio.binding/required-port-unbound`. The binding remains serialized so an explicit migration can address
it. The projection operation is read-only and detached: it cannot mutate the model, Blueprint, block
definition, workflow, translation or field policy
([ADR 0024](../decisions/0024-read-only-model-binding-projection.md)).

## Hybrid composition

The `hybrid` composite coordinates Blueprint and Content mode operations for structured fields and authorized compositional regions. It is not an unrestricted fourth editing mode. Business records remain authoritative in their host domain. Studio sends typed field and composition commands through host ports; it does not store a business aggregate in the Blueprint or generic entry JSON unless the host's public entry contract intentionally represents that content model.

The authorized compositional regions are declared by the Blueprint itself through node authoring policy: hybrid grants Content-mode field commands plus the structure commands — insert, remove, restore, move, duplicate, reorder, and their batches — whose every affected collection is a named slot of a node whose authoring policy mode is `structural`, or a slot the node's per-slot composition marker names ([ADR 0013](../decisions/0013-per-slot-composition-markers.md)). Inserted block types MUST satisfy the governing `allowedBlocks` when declared — the marked slot's own list ahead of the node-level list; subtrees containing a `locked` node are never inserted, removed, moved, or duplicated; document roots are never in bounds; and pattern application together with property, binding, size-role, and inheritance-reset configuration remains Blueprint-mode vocabulary. A structure command outside these bounds fails closed with `mode-forbidden`, leaving document, history, and selection untouched ([ADR 0011](../decisions/0011-editing-modes.md)).

The target product experience coordinates Model, Blueprint, and Entry operations without collapsing their
artifacts or permission boundaries. An author may see layout, field-definition controls, and actual Entry values
on one canvas, but every command still targets exactly one declared artifact and every durable effect is accepted
by the host (`STUDIO-PROD-003`, `STUDIO-PROD-010`). The current Blueprint session's helper reducers for model
and entry commands do not provide that coordinated state, history, persistence, or UI.

## Translations

Translatable fields declare translation behavior in the model. Structure and node identity SHOULD remain shared across locales unless the host explicitly allows locale-specific Blueprint or collection structure. Fallbacks are host policy and MUST be visible in the authoring UI; inherited text must not be mistaken for translated content.

## Save and publish

Entry save uses an expected revision and idempotency key. The host returns the accepted revision and normalized values or a structured conflict/validation error. Publication is a separate authorized operation and MUST validate the entry against its exact model and Blueprint dependencies.

The target contextual profile MUST present three distinct, explicit outcomes (`STUDIO-PROD-006`):

1. **Save item** persists the Entry values and authorized item-local composition only. It does not change the
   reusable type.
2. **Save new type version** asks the host to create coordinated immutable Model and Blueprint revisions and to
   return the accepted authoring-definition version. The host validates dependent-entry migration and binding
   impact as one declared transactional outcome.
3. **Save as new type** asks the host to create a new reusable authoring definition from the draft Model and
   Blueprint, excluding all Entry values (`STUDIO-PROD-004`).

Changing a field, block, or value locally never implies that any one of those outcomes succeeded. Studio MUST
show which artifacts are dirty, request the selected host operation, and reconcile every accepted or rejected
revision without copy-paste or manual cross-screen repair (`STUDIO-PROD-006`, `STUDIO-PROD-012`). The required
canonical authoring port now defines the planning and three transaction shapes. That protocol foundation does
not by itself make the legacy Blueprint-only host session or a shell UI a completed multi-artifact journey.
