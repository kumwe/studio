# Artifact model

## Overview

Studio treats modeling, composition, content, and visual language as related but independently versioned concerns.
The target contextual experience may coordinate them in one canvas, but it does not merge their serialized
identity, revisions, publication, or authority. The normative distinction is defined in the
[product contract](../product-contract.md) (`STUDIO-PROD-003`–`STUDIO-PROD-006`).

| Artifact             | Meaning                                                                             | Typical owner               |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------- |
| Content model        | Typed fields, constraints, relationships, semantic roles                            | Host or trusted extension   |
| Entry                | Values conforming to one immutable model revision                                   | Content or business service |
| Blueprint            | Typed node tree, slots, field bindings and authoring policy                         | Designer or extension       |
| Theme                | Responsive roles, tokens, recipes, patterns and renderer compatibility              | Template/theme package      |
| Block definition     | Node properties, slots, binding ports, authoring controls and renderer requirements | Core or extension           |
| Plugin manifest      | Executable authoring contributions and required host capabilities                   | Trusted package             |
| Studio configuration | Session-level policy, limits, enabled capabilities and port bindings                | Embedding host              |

### Current shipped shell boundary

The currently shipped shell surface composes an existing Blueprint and consumes an exact content-model
projection read-only for binding. It does not yet open or persist a coordinated Model/Blueprint/Entry draft,
create a blank definition, hydrate and save Entry values through that composed session, or implement the three
target save outcomes below. This section describes required product state, not shipped behavior
(`STUDIO-PROD-014`).

## Coordinated authoring definitions

A **reusable content type** is the host-facing coordination of one versioned Content Model and one versioned
Blueprint plus authoring policy. It is not a fourth portable artifact or an opaque document joining the two. It
never contains Entry values. A blank start coordinates new Model and Blueprint drafts; a reusable start selects
an exact compatible Model-and-Blueprint version before any values are hydrated (`STUDIO-PROD-002`,
`STUDIO-PROD-004`, and `STUDIO-PROD-005`).

The target product exposes three explicit, non-interchangeable save intentions (`STUDIO-PROD-006`):

- **Save item** persists the authorized Entry draft against its exact Model and Blueprint dependencies.
- **Save as new type** asks the host to accept new, separately versioned Model and Blueprint drafts;
  current Entry values are excluded.
- **Save new type version** asks the host to create the appropriate successor definition revisions under its
  migration, compatibility, and publication policy; it never mutates an immutable published revision in place.

The host owns identity allocation, validation, concurrency, atomicity, migration, publication, and failure
recovery for those outcomes. Future protocol contracts must define any necessary operations before the product
claims them. Authors must not have to pre-create companion records, copy serialized artifacts between tools, or
manually reconcile browser- and host-created definitions (`STUDIO-PROD-010` and `STUDIO-PROD-012`).

## Identity and revisions

Studio does not impose one metadata envelope on every portable document. The canonical schema for each kind defines its identity and version dimensions:

- versioned definition artifacts such as content models, Blueprints, themes, and block definitions carry stable identity, semantic version, immutable revision, and owner reference;
- plugin manifests carry package identity, semantic version, and owner, while package integrity/deployment state supplies the exact executable revision;
- entries and MediaAsset host projections carry stable identity and host revision but do not claim their own semantic version or portable owner field;
- a MediaReference is a value object: it identifies a host asset and may pin the asset revision, but it has no independent artifact identity or owner;
- commands, preview messages, and resolved session configuration use their schema-specific request, channel, session, and generation identifiers rather than artifact semantic versions.

Host persistence records own tenant/site scope, authoritative ownership, actors, timestamps, audit, publication, and workflow metadata outside these portable documents unless the applicable canonical schema explicitly includes a safe projection. Browser-supplied values never become authoritative audit metadata.

Namespaced contract identifiers use a namespace/name form such as `org.example/product-card` or `studio.core/grid`. Human labels are localized metadata and are never identifiers.

Blueprints pin exact compatible revisions of their model and block definitions at publication. A theme declares the block contracts and semantic recipes it can render. Entries pin a model revision. A resolved session identifies an existing entry by ID and exact host revision, not by an invented semantic version; an optional digest may verify transferred or cached bytes but never replaces the host revision. The host records which blueprint revision presents an entry; an entry never embeds a mutable blueprint by reference.

Contextual editing of an existing item must hydrate values only after the host resolves the exact reusable type
and definition versions that govern that Entry. Studio must not infer a nearby model, silently switch a
Blueprint, or project values through a merely compatible-looking type (`STUDIO-PROD-005`).

## Blueprint tree

A blueprint is an ordered rooted forest. Each node contains:

- a stable node ID unique within the blueprint;
- a namespaced block type and block contract version;
- bounded JSON properties validated by the block definition;
- named slots containing ordered child node IDs or nodes;
- zero or more typed field bindings;
- responsive and design choices expressed through theme-approved semantic values;
- authoring policy controlling what an entry author may change.

Cycles, shared child ownership, duplicate node IDs, undeclared slots, excessive depth, and unresolved required blocks are publication errors.

## Bindings

A binding connects a block port to data without embedding executable expressions. Its source is one of:

- `entry-field`: a typed path in the current entry model;
- `context-value`: an allowlisted host-provided semantic value;
- `static-value`: a schema-validated value stored with the blueprint;
- `resource-reference`: an opaque stable identifier resolved by a host port;
- `query-reference`: a host-registered, permission-aware query definition plus bounded parameters.

Bindings never contain SQL, JavaScript, Twig, CSS selectors, arbitrary URLs, or template expressions. Transformations use named, versioned operators declared by the host or a trusted extension. An operator declares input/output types, bounds, determinism, localization behavior, and whether it is legal during public rendering.

## Content authoring policy

Blueprint nodes classify each editable concern as:

- `locked`: defined only by the blueprint;
- `content`: entry authors can change bound values but not composition;
- `variant`: entry authors can choose from a bounded theme or block enumeration;
- `structural`: authorized entry authors can add, remove, or reorder allowed child blocks;
- `designer`: available only in blueprint/model design mode.

This lets a product template preserve layout while a landing page exposes flexible regions.

In the target canvas, active extension-owned blocks, field adapters, and patterns participate through their
declared lifecycle and compatibility. Removing or revoking an owner disables its executable contribution while
preserving the separately owned Model, Blueprint, and Entry data for diagnosis and migration
(`STUDIO-PROD-008` and `STUDIO-PROD-009`).

## Theme semantics

Portable artifacts describe intent, not CSS implementation. A blueprint may request `surface.raised`, `spacing.large`, `emphasis.price`, or a responsive grid policy. The active theme maps those values to trusted renderer output.

A theme switch requires a compatibility report. Studio must not replace missing semantic values silently. The report classifies each reference as supported, substituted by an explicitly declared alias, migratable, or incompatible.

## Extension data

Contracts may provide a bounded `extensions` object. Each member is keyed by a namespace owned by its declaring plugin. Extension data must have a registered schema and version. Removing executable plugin code does not delete persisted extension data. Unknown namespaces are preserved during round-trip but are excluded from interpretation and publication until their definition is available and trusted.

## Canonicalization

Artifacts are logically compared after JSON canonicalization: object member order is irrelevant, array order remains significant, numbers use JSON number semantics subject to field constraints, and strings are Unicode. Hashes and signatures must use a specified canonicalization profile rather than implementation-dependent serialization.
