# ADR 0021: Kind-scoped canonical composition registries

- Status: proposed
- Scope: activation and resolution of canonical composition contribution payloads

## Context

ADR 0012 completed the schema vocabulary for Kumwe App's six frozen composition contribution
families, but the core runtime still registered only block definitions. Non-block lifecycle tests
reasoned from manifest declarations without loading, validating, or resolving their payloads. That
could report a declaration as active even when its resource was absent or malformed, and a lookup
could accidentally treat an equal ID from another kind as satisfying the reference.

## Decision

The contribution runtime validates and activates six canonical payload families atomically:
`block`, `pattern`, `design-vocabulary`, `migration`, `inspector`, and `field-adapter`. The manifest
kind `block` maps explicitly to a payload whose document kind is `block-definition`; the other five
kinds match their payload discriminator. The authoring definition carries the concrete payload for
every canonical declaration, and activation checks the canonical schema, exact owner, kind, ID,
version, namespace declaration, required capability declaration, collision rules, and the Studio
Schema Profile for block properties and field-adapter option schemas.

Registry identity is the tuple `(kind, id, version)`. IDs may be equal across kinds, but two owners
cannot claim the same kind and ID. Successful activation publishes one immutable generation
containing all six families; resolution returns defensive copies. Disable and trust revocation remove
all six from successor generations while retaining lifecycle inventory and unresolved diagnostics.

Activation of a declarative payload does not execute extension code. Inspector and field-adapter code
still requires an executable manifest, a declared capability, and host-owned realm and policy
selection. Migration descriptors register as inert data; only the separately trusted migration
runner can execute an implementation.

## Consequences

Hosts can translate their owner-aware extension registry into a single Studio generation without a
parallel block-only authority. Malformed or partially loaded canonical payload sets fail as one
transaction. Unresolved reporting is kind-safe, so an unrelated declaration can no longer mask a
missing contribution.

This record does not ratify the plugin API or approve an execution realm. Integrity and provenance
verification remain host prerequisites before the already verified payload bytes reach this runtime.

## Rejected alternatives

Keeping non-block declarations manifest-only was rejected because it cannot prove that the declared
resource is schema-valid or available. A global ID namespace without the kind discriminator was
rejected because Kumwe App's extension identity is kind-scoped and equal IDs across different
contribution families are not collisions. Executing inspector, adapter, or migration code during
registration was rejected because declarative inspection and least-authority host policy require
activation to remain data-only.
