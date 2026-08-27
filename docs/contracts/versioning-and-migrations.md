# Versioning and migration contract

## Version dimensions

Studio distinguishes:

- **Schema epoch URI:** the major compatibility family in a canonical schema `$id`, currently the unratified `/studio/v1/` target.
- **Document contract revision:** the exact discriminator carried as `contractVersion`, currently the non-SemVer draft value `0.1-draft`.
- **Wire protocol version:** the SemVer version negotiated for cross-process host and preview messages, currently `0.1.0-draft.2`.
- **Artifact semantic version:** owner-declared meaning and compatibility of a model, Blueprint, theme, block, or plugin.
- **Artifact revision:** immutable exact persisted state.
- **Package version:** npm distribution version.
- **Plugin API version:** a Gate A target axis for compatibility with the public registration/runtime API; it is not yet carried by the `0.1-draft` plugin manifest.
- **Session generation:** immutable resolved inventory of permissions, limits, plugins and capabilities.

These identifiers are independent and MUST NOT be compared or substituted. In particular, `/v1/` does not mean that the project has released version 1, `0.1-draft` is not a negotiated protocol SemVer, and `0.1.0-draft.2` does not select an artifact schema.

| Axis                       | Current draft value                                | Used for                                                                     |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Schema epoch URI           | `https://schemas.kumwe.org/studio/v1/...`          | Names the intended major schema family and reference base                    |
| Document contract revision | `0.1-draft`                                        | Selects the exact JSON shape and semantics of each document/message envelope |
| Wire protocol version      | `0.1.0-draft.2`                                    | Negotiates request/response and preview-channel behavior                     |
| npm package version        | Exact coordinated version in `studio-release.json` | Resolves implementation artifacts; never appears as a document discriminator |

The current plugin manifest intentionally has no general `studioVersions` range. Before Gate A, hosts pin an exact tested release set. Gate A must ratify a separately identified plugin API version before the manifest can declare a range; document and wire compatibility remain their own axes.

Before Gate A, the `/v1/` schema URI is a repository target and packages are pinned exactly; it is not a promise that the bytes at that URI are stable. Gate A must publish and freeze the ratified v1 schema bytes, replace the draft document discriminator through an explicit migration release, and declare the supported wire-version range. A post-ratification breaking schema change requires a new schema epoch URI.

## Session negotiation

A resolved StudioConfig carries both `contractVersion` and `protocolVersion`:

- `contractVersion` validates the StudioConfig document itself, while every nested canonical document independently validates its own discriminator;
- `protocolVersion` is the one wire version selected from the intersection of versions supported by Studio and `hostCapabilities.protocolVersions`;
- every host-port exchange and preview handshake for that session uses the selected wire version; and
- a session fails before write mode when there is no common wire version or a document contract revision is unsupported.

Session generation changes do not change either version axis. A host may advertise newer wire versions in its capabilities, but the current candidate implementation supports only `0.1.0-draft.2`.

## Semantic compatibility

Artifact, package, and wire protocol versions use SemVer. The current `contractVersion` draft discriminator intentionally does not. Unless a contract states otherwise:

- patch changes fix behavior without changing valid meaning or required capability;
- minor changes add optional, backward-compatible behavior;
- major changes may remove, reinterpret, constrain or require migration of existing data.

Semantic versions MUST follow SemVer 2.0 canonical syntax. In particular, numeric core and numeric prerelease identifiers have no leading zero unless the identifier is exactly `0`. Build metadata does not affect precedence. A version range is accepted only after the lexical guard and the negotiated range parser both succeed.

Published artifacts pin revisions or integrity locks where exact reproducibility is required. Version ranges are used only during compatibility planning and resolution.

## Contract evolution

A schema patch may clarify descriptions but cannot change accepted instances. A compatible schema minor may add optional fields with defined defaults or new enum values only when consumers are required to preserve unknown values and fail safely. A breaking shape or semantic change starts a new schema epoch URI or explicitly versioned schema path.

Readers MUST reject an unsupported document contract revision. They MUST NOT strip unknown required fields and resave. For declared extension maps, readers preserve unknown namespaced data as opaque values within limits.

## Migration definition

A migration declares:

- owner and namespaced ID;
- source and target artifact semantic ranges and/or exact document contract revisions, identified by axis;
- affected artifact kinds;
- deterministic transformation implementation or bounded declarative operations;
- preconditions and capability requirements;
- loss classification;
- diagnostics and human decisions;
- rollback or recovery strategy;
- conformance fixtures with before/after documents and digests.

Executable migrations are trusted package code. Artifacts never carry executable migration source.

The portable half of that declaration is canonical: a plugin declares a migration as a
`migration` manifest contribution whose resource conforms to
[`migration.schema.json`](../../schemas/migration.schema.json) — owner, namespaced ID, affected
artifact kinds, source version range, target version, and loss classification (ADR 0012). A host
validates the declaration at admission and install without executing anything; the deterministic
runner separately enforces the same fields at registration, including the rule that a target
version never sits inside its own source range.

## Migration rules

- Migration operates on a copy and validates the complete result before acceptance.
- The original revision remains immutable and recoverable.
- A lossy migration is never automatic and requires explicit authorized confirmation.
- Migration cannot fabricate permission, ownership, trust, signatures, field values or inaccessible resources.
- IDs remain stable unless the migration declares deterministic remapping and rewrites every affected reference.
- Multi-artifact migrations produce a plan and apply atomically within the host's declared transaction boundary or use a resumable, audited process with no false atomicity claim.
- Reapplying an accepted migration is idempotent or rejected as already applied.

## Dependency migrations

When a model, block, theme or plugin changes, the host computes affected Blueprints and entries. Publication of a breaking dependency is blocked until each dependent artifact is compatible, migrated, intentionally pinned, or explicitly retired.

Theme aliases may resolve renamed semantic tokens without rewriting a Blueprint when the alias contract guarantees equivalent meaning. Visual similarity alone is insufficient.

## Downgrade

Downgrade is not assumed. A previous runtime may open a newer artifact only when it supports that contract and every used capability. Otherwise it provides safe inspection or refuses to write. Exporting to an older version is an explicit migration with loss reporting.

## Evidence

Gate A requires the version vocabulary, compatibility algorithm and migration fixture format to be ratified. Gate B requires executable migration discovery, dry-run plans, recovery, audit, cross-version fixtures and supported-version policy.
