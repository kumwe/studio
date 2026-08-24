# Compatibility and evolution policy

This policy governs protocol artifacts, package APIs, host ports, previews, extensions, themes, generated SDKs,
conformance profiles and stored documents.

## Stability points

Before Gate A, all packages remain prerelease and public contracts may change with an explicit changeset and
updated fixtures; no compatibility promise may be inferred from a package name or `1.0` schema draft.

Gate A establishes the first integration compatibility baseline. From that point, a durable host integration
may rely on the frozen release-candidate epoch and the deprecation rules below. Gate B promotes a tested set to
the first stable release.

## Version axes

| Axis                          | Meaning                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema epoch URI              | Major compatibility family and reference base for serialized document schemas                                                               |
| Artifact contract version     | Schema/semantic revision for model, Blueprint, entry, theme, media, rich text or another artifact                                           |
| Command/port/message version  | Behavioural version of a command family, host port or preview channel                                                                       |
| Package semantic version      | Fixed-family npm API/distribution version in Version 2; separately qualified Dart package version in Version 3                              |
| Contribution semantic version | Block, pattern, theme profile, renderer or plugin implementation version                                                                    |
| Contribution contract version | Stored schema/behaviour version used by documents and migrations                                                                            |
| Conformance profile version   | Exact assertions required to claim a host/client/renderer profile, declared in [conformance profiles](../contracts/conformance-profiles.md) |
| Studio release coordinate     | One fixed npm-family version whose generated record names exact packages, wire protocol, corpus digest, and claimed profiles                |

These values are explicit and must not be guessed from one another. All seven Version 2 packages share the
Studio release coordinate while still declaring their supported schema epochs, document contract revisions,
and wire-protocol ranges. The generated release record identifies the exact set. A future Dart package version
does not follow from the npm coordinate unless a Version 3 record explicitly binds it.

## Semantic-version rules

After Gate B:

- **patch** fixes an implementation that contradicted the existing public contract and does not require a
  consumer change; risk-relevant corrections are still called out;
- **minor** adds optional capabilities, exports or contract fields with deterministic behaviour for old
  consumers, or introduces a deprecation;
- **major** removes/renames a public surface, changes required structure or semantics, changes canonical bytes,
  invalidates a previously valid artifact, or requires consumer modification without an old-compatible path.

Package major versions replace neither the schema epoch nor the wire-protocol version. A UI package may need a
major API change while the wire protocol remains compatible; a schema-epoch or incompatible wire-protocol
change requires coordinated package/SDK releases and migrations.

## Additive protocol evolution

An additive change is compatible only when all of these hold:

1. Old valid artifacts/messages remain valid and retain the same meaning.
2. Old commands produce the same result and diagnostic outcome.
3. New data is optional or isolated in a declared extension envelope.
4. Old readers either preserve the data losslessly or capability negotiation prevents write mode.
5. Canonicalization/checksum rules remain stable or carry a new explicit algorithm/version.
6. Generated TypeScript types remain source-compatible within their documented semantic range; generated Dart
   types meet the same rule when a Version 3 native profile is affected.
7. Valid, invalid, unknown-field and mixed-version fixtures prove the behaviour.

Adding a required field, changing a default, broadening executable authority, reinterpreting an enum, changing
ordering, changing numeric precision, accepting formerly rejected unsafe input, or silently ignoring new data
is not additive.

Closed objects reject unknown fields. Open extension envelopes preserve unknown values as inert bounded JSON
and cannot turn them into executable behaviour. A client that cannot preserve a required extension envelope
must use a read-only session state.

## Stored artifact compatibility

- Published artifacts and revisions are immutable.
- Every artifact records the exact applicable contract version and dependency references.
- Migrations are explicit, deterministic, ordered, idempotent where rerun, and side-effect-free in the client
  model; the authoritative host transacts persistent migration and audit.
- A migration produces a new revision and retains provenance from the old revision.
- A dry run returns the compatibility report and diagnostics before mutation.
- Missing migration, renderer, block, theme semantic or plugin prevents publication; it never triggers a visual
  guess or silent deletion.
- Unsupported downgrades fail before mutation. Rollback restores the old executable generation and compatible
  artifact revision rather than forcing newer data through older code.

## Block, theme and plugin evolution

A contribution declares both implementation and contract versions. Compatible implementation changes keep the
stored contract meaning. A stored contract change supplies migration and renderer compatibility ranges.

Theme token, recipe and viewport names are semantic public APIs. Renaming/removing one requires a declared alias
or migration, a template-switch compatibility report and accessibility evidence. A similar-looking token is
not an automatic substitute.

Provider disable/revocation removes executable code but not stored data. Unknown contributions remain as
unresolved nodes with owner/type/version and safe diagnostics. A fallback runs only when declared in the trusted
contract and cannot grant greater capability.

## Deprecation policy

A stable public surface is deprecated for at least **two consecutive minor release trains and 180 days,
whichever is longer**, before removal in a major release. During the window:

- the replacement is documented and production-ready;
- runtime/type/schema diagnostics identify the deprecated use without leaking data;
- migration or adapter tooling exists and is tested;
- fixtures cover old, mixed and new consumers; and
- release notes state first deprecation and earliest removal version/date.

A critical security issue may shorten the window. The security advisory explains the incompatibility, provides
the safest available migration/mitigation, and records the steward decision. Security acceleration is not a
general route around compatibility review.

## Support window

Before the first stable release, only the latest prerelease commit/candidate receives fixes. After Gate B:

- the current stable major receives fixes and qualified minor releases;
- after a new major ships, the preceding major receives critical security/data-loss fixes for 12 months;
- exact supported package/profile/environment ranges are published in each release manifest; and
- a host outside the matrix may consume the open protocol but cannot claim first-party conformance/support.

This window is a minimum engineering policy, not a hosted-service SLA.

## Compatibility fixtures and reports

Every release candidate runs:

- current writer/current reader;
- previous supported writer/current reader;
- current writer/previous supported reader in read-only and writable negotiation;
- each stored artifact and contribution version;
- TypeScript canonical round-trip and command results for Version 2, plus TypeScript/Dart parity for any
  Version 3 native profile;
- host/preview/plugin/theme/media mixed-version negotiation;
- migration, interrupted migration, restart, rollback and downgrade refusal; and
- representative unknown optional and unknown required capabilities.

The release publishes a machine-readable compatibility matrix and human summary. “Latest with latest” alone is
insufficient.

## Breaking-change procedure

1. Approve an ADR/proposal describing necessity and rejected compatible alternatives.
2. Define the new schema epoch and/or wire major, supported bridge period, and exact old/new profiles.
3. Publish schemas, fixtures, diagnostics, migration/adapter tooling and generated SDK candidates.
4. Exercise real generic, Kumwe App, and web integrations; add Flutter integrations when the breaking change
   affects a Version 3 native profile.
5. Complete the deprecation window unless a documented security emergency applies.
6. Qualify upgrade, rollback and preserved-old-data paths.
7. Publish the tested release set, support dates and recovery instructions.
