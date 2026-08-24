# Canonical Studio schemas

This directory is the canonical source for Studio's language-neutral artifact and message schemas. Every schema uses JSON Schema Draft 2020-12 and a stable `$id` under `https://schemas.kumwe.org/studio/v1/`.

## Canonical-source rule

Files copied into `packages/protocol`, generated language packages, documentation sites, release archives, or schema registries are generated artifacts. They MUST be byte-identical to, or reproducibly generated from, the files here. A package-local schema MUST NOT be edited independently.

The current alpha synchronizer copies canonical schemas and fixtures, compares them byte-for-byte,
publishes a digest-verified schema manifest, regenerates the canonical Studio release record, and
runs strict schema/example validation. It does not yet generate TypeScript or Dart bindings. The
Version 2 Gate A release workflow must:

1. validate every canonical schema against its declared meta-schema;
2. validate all examples and conformance fixtures;
3. generate TypeScript bindings and prove their canonical round-trip; Version 3 adds Dart bindings before a native profile claim;
4. copy/package schemas through one deterministic command;
5. compare packaged digests with canonical digests and fail on divergence;
6. publish a manifest containing each `$id`, file digest, schema epoch URI, document contract revision, and generator version.

The separate [`studio-release.schema.json`](studio-release.schema.json) closes the seven-package release
family. The generated root record and its protocol/testkit copies bind exact package versions to the wire
protocol and corpus-manifest digest; `claimedProfiles` remains empty until immutable evidence permits a claim.

Any existing package-local schema with a different shape or `$id` is an incompatible duplicate and must be reviewed, migrated, and removed before Gate A. Runtime code must resolve schema IDs from its packaged canonical copies, not from the network.

## Schemas

| File                                                                             | Contract                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`common.schema.json`](common.schema.json)                                       | Shared identifiers, references, messages and diagnostics |
| [`authoring-message-catalog.schema.json`](authoring-message-catalog.schema.json) | Versioned shell locale catalog and named parameters      |
| [`studio-config.schema.json`](studio-config.schema.json)                         | Resolved serializable session configuration              |
| [`studio-release.schema.json`](studio-release.schema.json)                       | Fixed seven-package Studio release coordinate            |
| [`content-model.schema.json`](content-model.schema.json)                         | Portable content-model definition                        |
| [`entry.schema.json`](entry.schema.json)                                         | Typed-model entry envelope and values                    |
| [`blueprint.schema.json`](blueprint.schema.json)                                 | Composition tree, bindings and dependency locks          |
| [`theme.schema.json`](theme.schema.json)                                         | Theme design profile and renderer compatibility          |
| [`block-definition.schema.json`](block-definition.schema.json)                   | Block properties, slots, ports and authoring metadata    |
| [`plugin-manifest.schema.json`](plugin-manifest.schema.json)                     | Declarative plugin inventory and requirements            |
| [`schema-profile.schema.json`](schema-profile.schema.json)                       | Admitted property-schema meta-schema                     |
| [`schema-profile-vector.schema.json`](schema-profile-vector.schema.json)         | Portable property-schema conformance vectors             |
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
