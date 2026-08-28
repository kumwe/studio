# Extension lifecycle contract

## Scope

This contract governs Studio plugins, block packages, theme integrations and host-owned extensions that contribute Studio definitions or executable behavior.

## States

An extension progresses through explicit states:

1. `discovered`: metadata can be inspected without executing code.
2. `verified`: package identity, integrity, provenance and compatibility pass host policy.
3. `installed-disabled`: files/metadata exist, no executable contribution is active.
4. `activating`: contributions are compiled and validated transactionally.
5. `active`: contributions belong to one immutable session/runtime generation.
6. `rejected`: activation failed with stable diagnostics; no partial contribution is active.
7. `disabled`: executable contributions are absent; owned artifact data remains.
8. `trust-revoked`: executable contributions are removed from new generations immediately and active sessions are invalidated according to severity.
9. `uninstalled-data-preserved`: package code is removed; owned persisted data remains unless explicit purge occurs.
10. `purged`: separately authorized destructive removal has completed with required recovery evidence.

## Activation

Activation MUST verify manifest schema and document contract revision, namespace ownership, package integrity, the host-pinned tested release set, dependency and capability version requirements, requested permissions, contribution limits, collision rules, contributed schemas, migrations, and host policy before executing allowed initialization.

Registration is atomic. A failure publishes no partial generation. A successful activation creates a new immutable generation; existing sessions either remain safely pinned under host policy or are required to reopen. Security revocation cannot leave untrusted executable code active merely to preserve session convenience.

### Contextual authoring targets

An extension exposes a contextual Studio surface by declaring an `authoring-target` contribution in its
canonical plugin manifest and supplying the matching `AuthoringTargetDeclaration` payload. The target payload
MUST be owned by the exact manifest owner. Because the target is discovery metadata rather than a separately
versioned artifact, its manifest contribution version is the exact owner release version. Missing payloads,
undeclared payloads, owner mismatches, namespace violations, duplicate declarations and cross-owner target-ID
collisions reject activation atomically.

Host-core targets and extension targets enter the same immutable contribution generation. Resolution MUST
match the qualified target ID, resource surface and type, create/edit intent, requested presentation, optional
authoring mode and required capability versions. It resolves every required contribution dependency against
that same generation and version range. A missing required dependency makes the target unavailable; a missing
optional dependency does not. The result contains only the six composition contributions explicitly admitted
by the target, never every globally active contribution.

Target resolution remains bounded discovery. It does not authenticate an actor, authorize a resource, mint a
resource context or permit persistence. The host authoring port performs those operations independently before
opening or saving a session. Disable and trust revocation remove an extension's targets from new resolution in
the successor generation, while a safely pinned prior generation remains immutable under host policy.
Uninstall preserves the owner's target and contribution identities as well as its data; another owner cannot
claim them unless the separately authorized purge has released that inventory.

## Disable and revocation

Disable or trust revocation removes commands, panels, inspectors, transforms, blocks, renderers and assets from newly resolved execution immediately. Persisted namespaced definitions, Blueprint nodes, entry values and migration records remain. Studio displays unresolved/inactive-owner diagnostics without interpreting data through another owner.

If public output depends on the extension, the host follows an explicit policy chosen when the artifact was published:

- retain a verified immutable renderer generation;
- use a declared trusted fallback;
- suppress the affected node with an operational diagnostic;
- hold or roll back publication.

The host MUST NOT silently execute revoked code or substitute an unrelated renderer.

## Upgrade

An upgrade is install plus compatibility plan plus atomic generation switch. Applied package bytes and migration identities are immutable. Breaking upgrades require dependency impact analysis and artifact migrations before affected publication can move to the new version.

## Uninstall and purge

Uninstall removes executable package material and active registrations but preserves owned artifacts and host data by default. Purge is a separate named operation requiring elevated authorization, dependency inspection, explicit target inventory, audit, and a recovery prerequisite defined by the host.

## Recovery mode

Hosts may provide a recovery mode that inspects manifests and opaque artifacts without executing installed extension code, loading extension assets, or invoking extension migrations. Recovery can disable, pin, export, or restore known-good generations through core-owned tooling.

## Diagnostics

Operators can inspect extension ID, owner, package and contract versions, integrity/provenance, state, contribution inventory, dependencies, active generation, rejection/revocation reason, affected artifacts, migrations and fallback policy without loading executable extension UI.

## Conformance fixtures

Lifecycle conformance fixtures in `@kumwe/studio-core` exercise all six canonical composition
payloads: block definitions, patterns, design vocabulary, migrations, field adapters, and inspectors.
The fixtures cover canonical schema validation, kind-scoped resolution into a sealed immutable
generation, owner disable, trust revocation, rejected incompatible-owner and duplicate-kind/ID
activations that leave the active generation untouched, atomic upgrade to new declared versions, and
per-kind unresolved-reason reporting (`not-installed`, `incompatible`, `owner-disabled`,
`owner-revoked`) while documents stay diagnosable. Manifest-only executable kinds remain host-owned
declarations and are not falsely presented as registered composition payloads.

The contextual-target lifecycle fixture additionally proves identical host-core and extension registration,
exact surface/resource/intent/presentation/mode/capability matching, target-scoped dependency admission,
newest-compatible dependency selection, optional dependency degradation, required dependency withdrawal,
target collision rejection, disable/reactivation, trust revocation and atomic owner-version upgrade.

## Kumwe App mapping

Kumwe App should compile Studio contributions through its existing trusted, owner-aware immutable runtime
generation. Studio must not introduce a parallel extension authority. Producer's exact pinned PHP adapter
translates this portable lifecycle vocabulary into the App-owned generation; Producer owns neither extension
authority nor storage, and Studio imports or special-cases neither Producer nor App.
