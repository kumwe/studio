# Content model and entry contracts

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

## Entries

An entry is a set of values conforming to one exact model revision. It conforms to [`entry.schema.json`](../../schemas/entry.schema.json).

Entries contain stable identity, model reference, host revision, locale/translation metadata, workflow state, values, and optional composition overrides explicitly allowed by the Blueprint. Host-generated audit, authorization, and publication data MUST NOT be accepted from untrusted clients as authoritative.

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

## Hybrid composition

The `hybrid` composite coordinates Blueprint and Content mode operations for structured fields and authorized compositional regions. It is not an unrestricted fourth editing mode. Business records remain authoritative in their host domain. Studio sends typed field and composition commands through host ports; it does not store a business aggregate in the Blueprint or generic entry JSON unless the host's public entry contract intentionally represents that content model.

## Translations

Translatable fields declare translation behavior in the model. Structure and node identity SHOULD remain shared across locales unless the host explicitly allows locale-specific Blueprint or collection structure. Fallbacks are host policy and MUST be visible in the authoring UI; inherited text must not be mistaken for translated content.

## Save and publish

Entry save uses an expected revision and idempotency key. The host returns the accepted revision and normalized values or a structured conflict/validation error. Publication is a separate authorized operation and MUST validate the entry against its exact model and Blueprint dependencies.
