# Canonical Studio schemas

This directory is the canonical source for Studio's language-neutral artifact and message schemas. Every schema uses JSON Schema Draft 2020-12 and a stable `$id` under `https://schemas.kumwe.org/studio/v1/`.

## Canonical-source rule

Files copied into `packages/protocol`, generated language packages, documentation sites, release archives, or schema registries are generated artifacts. They MUST be byte-identical to, or reproducibly generated from, the files here. A package-local schema MUST NOT be edited independently.

The synchronizer copies canonical schemas and fixtures, compares them byte-for-byte, publishes a
digest-verified schema manifest, generates the complete Version 2 TypeScript model set, regenerates the
canonical Studio release record, and runs strict schema/example validation. The repository workflow:

1. validates every canonical schema against its declared meta-schema;
2. validates all examples and conformance fixtures;
3. generates TypeScript bindings; the enclosing check compiles them, proves bounded exact-root corpus assignability, and performs the schema-validated JSON round-trip; Version 3 adds Dart bindings before a native profile claim;
4. copies/packages schemas through one deterministic command;
5. compares packaged digests with canonical digests and fails on divergence;
6. publishes a manifest containing each `$id`, file digest, schema epoch URI, document contract revision, and generator version.

The current generated manifest contains 55 canonical root schemas. Their generated TypeScript projection also
contains 253 top-level reusable `$defs` definitions; the manifest and generated metadata, rather than a copied
documentation list, remain the machine authority for that inventory.

`npm run contracts:sync` is the single schema/corpus/release synchronization path. The focused generated-model
commands are `npm run protocol:models:generate` and `npm run protocol:models:check`; the latter is part of
`npm run contracts:check`. Compilation and corpus tests run later in the enclosing `npm run check`; generated
sources are committed release inputs and must never be edited by hand.

The separate [`studio-release.schema.json`](studio-release.schema.json) closes the eight-package release
family. The generated root record and its protocol/testkit copies bind exact package versions to the wire
protocol and corpus-manifest digest; `claimedProfiles` remains empty until immutable evidence permits a claim.

Any existing package-local schema with a different shape or `$id` is an incompatible duplicate and must be reviewed, migrated, and removed before Gate A. Runtime code must resolve schema IDs from its packaged canonical copies, not from the network.

## Schemas

| File                                                                             | Contract                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`common.schema.json`](common.schema.json)                                       | Shared identifiers, references, messages and diagnostics |
| [`authoring-message-catalog.schema.json`](authoring-message-catalog.schema.json) | Versioned shell locale catalog and named parameters      |
| [`studio-config.schema.json`](studio-config.schema.json)                         | Resolved serializable session configuration              |
| [`studio-deployment.schema.json`](studio-deployment.schema.json)                 | Browser mount, host routing and standalone bootstrap     |
| [`studio-browser-assets.schema.json`](studio-browser-assets.schema.json)         | Prebuilt browser asset and runtime-requirement manifest  |
| [`authoring-http.schema.json`](authoring-http.schema.json)                       | Exact seven-operation contextual HTTP exchange shapes    |
| [`authoring-http-vector.schema.json`](authoring-http-vector.schema.json)         | PHP/host HTTP transport conformance matrix               |
| [`authoring-target.schema.json`](authoring-target.schema.json)                   | Core/extension contextual target declaration             |
| [`reusable-content-type.schema.json`](reusable-content-type.schema.json)         | Host-owned Model/Blueprint type projection               |
| [`authoring-session.schema.json`](authoring-session.schema.json)                 | Coordinated Model/Blueprint/Entry session snapshot       |
| [`authoring-save.schema.json`](authoring-save.schema.json)                       | Explicit save planning and reconciliation documents      |
| [`studio-release.schema.json`](studio-release.schema.json)                       | Fixed eight-package Studio release coordinate            |
| [`content-model.schema.json`](content-model.schema.json)                         | Portable content-model definition                        |
| [`entry.schema.json`](entry.schema.json)                                         | Typed-model entry envelope and values                    |
| [`blueprint.schema.json`](blueprint.schema.json)                                 | Composition tree, bindings and dependency locks          |
| [`theme.schema.json`](theme.schema.json)                                         | Theme design profile and renderer compatibility          |
| [`block-definition.schema.json`](block-definition.schema.json)                   | Block properties, slots, ports and authoring metadata    |
| [`plugin-manifest.schema.json`](plugin-manifest.schema.json)                     | Declarative plugin inventory and requirements            |
| [`schema-profile.schema.json`](schema-profile.schema.json)                       | Admitted property-schema meta-schema                     |
| [`schema-profile-vector.schema.json`](schema-profile-vector.schema.json)         | Portable property-schema conformance vectors             |
| [`binding-projection-vector.schema.json`](binding-projection-vector.schema.json) | Portable model-to-block binding projection vectors       |
| [`host-capabilities.schema.json`](host-capabilities.schema.json)                 | Host port and limit negotiation                          |
| [`host-sequence-vector.schema.json`](host-sequence-vector.schema.json)           | Ordered stateful host conformance exchanges              |
| [`command.schema.json`](command.schema.json)                                     | Persistent authoring command envelopes                   |
| [`preview-message.schema.json`](preview-message.schema.json)                     | Isolated preview channel messages                        |
| [`preview-vector.schema.json`](preview-vector.schema.json)                       | Portable render, draft-digest and marker assertions      |
| [`media-asset.schema.json`](media-asset.schema.json)                             | Host-owned media catalogue projection                    |
| [`media-reference.schema.json`](media-reference.schema.json)                     | Small usage-specific media value persisted in artifacts  |

## Validation scope

JSON Schema validates document shape. Implementations must additionally apply the semantic invariants in [`docs/contracts`](../docs/contracts/README.md), including reference resolution, tree uniqueness, type compatibility, permissions, capabilities, limits, migrations, and publication policy.

## Contract status

Three independent version axes apply to the canonical files:

| Axis                       | Current value                                                 | Meaning                                                               |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Schema epoch URI           | `$id` under `https://schemas.kumwe.org/studio/v1/`            | Intended major schema family and reference base                       |
| Document contract revision | `contractVersion: "0.1-draft"`                                | Exact shape and normative semantics of a document or message envelope |
| Wire protocol version      | `protocolVersion: "0.1.0-draft.2"` in a resolved StudioConfig | Negotiated host-port and preview-channel behavior                     |

The axes MUST NOT be compared, substituted, or inferred from one another. The `v1` URI is a development target until Gate A ratifies the epoch. Prior to ratification, releases remain prerelease and consumers pin exact versions. Gate A freezes the ratified schema bytes, replaces the draft document discriminator through an explicit ratification release, and declares the supported wire-version range. The URI must not be silently reused for a breaking post-ratification change.
