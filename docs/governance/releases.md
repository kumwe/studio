# Release policy

Studio Version 2 releases a coordinated, verified family of eight npm packages with language-neutral
schemas/fixtures, examples, documentation, and a canonical release record. Version 3 may add a separately
qualified Dart/Flutter set. Publishing one package does not imply Gate A/B, a profile claim, or production
readiness for the whole product.

## Channels

| Channel              | Purpose                                                                                   | Compatibility/support claim                                              |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Development snapshot | Internal branch integration and CI                                                        | None; not published as stable                                            |
| `alpha`              | Contract/interaction discovery with early adopters                                        | May break with changeset and fixtures; no durable host commitment        |
| `beta`               | Feature-complete candidate for a [declared profile](../contracts/conformance-profiles.md) | Contract changes treated as release blockers and reviewed explicitly     |
| `rc`                 | Immutable candidate for gate/release evidence                                             | Only release-blocking corrections; every rebuild creates a new candidate |
| Stable               | Gate B-qualified supported release set                                                    | Semantic version, compatibility and support policies apply               |

Gate A normally publishes a contract release candidate, not a stable production package. The first stable
release is impossible before Gate B.

The `alpha` channel is live: the release train versions merged Changesets and publishes the coordinated
workspace packages to the `alpha` distribution tag with provenance. No `alpha` carries a support or
compatibility claim. The single manual **Governed RC and stable promotion** workflow implements preparation
and protected publication, but it fails closed until the exact candidate has accepted, independently
reproduced evidence, immutable artifact hashes, required human review, and an authoritative passing gate in
`docs/roadmap/STATUS.md`. The `beta` channel has no automated publisher. A local prerelease version is
scaffolding and MUST NOT be published manually around these controls.

The **Evidence bundle** workflow only creates pending qualification material. It cannot publish, make a gate
decision, or authenticate to npm. Gate A is currently not assessed and Gate B is blocked, so neither RC nor
stable publication can pass today; this is the intended result until real evidence is accepted.

The checked-in `studio-release.json` coordinates `@kumwe/studio-renderer-web` and the other seven packages at
one alpha version. That record is not proof that the packages are available from npm. Every publisher verifies
all eight exact registry versions; RC/stable additionally verify registry integrity, provenance, the channel
tag, and a source-bound GitHub release before Kumwe App or another deployable host updates its pin.

Conceptual `beta` qualification requires a declared, executable conformance profile the candidate is
feature-complete against, claimed with reproduced evidence. It does not add a second release route: the
automated lifecycle advances from `alpha` to the stricter governed `rc` channel. The profiles and their
assertion sets are in [conformance profiles](../contracts/conformance-profiles.md).

“Release-candidate implementation” may describe a proposed immutable source tree under evaluation. It does
not mean the npm `rc` channel has opened. An `rc` publication is allowed only after every advertised profile
is claimed at that exact commit; naming incomplete bits “RC” cannot substitute for that evidence.

## Release unit and record

The eight npm packages are one Changesets fixed group and advance to the same semantic version. The
repository-root `studio-release.json` is the canonical, generated coordinate record and is copied byte-for-byte
into `@kumwe/studio-protocol` and `@kumwe/studio-testkit`. Its schema fixes the complete package family and
records the release version, exact package versions, wire protocol version, corpus-manifest digest, and only
profiles backed by acceptable evidence. The current pre-version alpha baseline claims no profiles.

The contracts lane regenerates the record from package manifests, protocol constants, and corpus bytes, then
fails on drift, an extra/missing package, a stale copy, an invalid schema, or a changed fixed group. The alpha
version command runs Changesets first and regenerates the record. Explicit promotion generation transforms all
manifests, internal dependency pins, the lockfile, changelogs, prerelease state, profile claims, and all three
record copies together. The first transition resets `alpha.N` to `rc.1`; a correction Changeset creates
`rc.N+1`; Gate B promotion removes the suffix without changing runtime code. Post-stable Changesets
automatically enter a new alpha train. Therefore a partial or staggered set cannot be treated as a release.

Qualification evidence associated with the release record additionally records:

- schema epoch, document contract revisions, wire-protocol versions, and every artifact/command/port/profile version;
- npm package name/version/integrity, and Dart package coordinates only for a Version 3 native claim;
- schema, generated-source, fixture and documentation digests;
- supported Node/build, browser, host and renderer matrices, plus Dart/Flutter matrices only for a Version 3 native claim;
- extension/theme/media/rich-text compatibility ranges;
- source commit, toolchain, lockfiles and build environment;
- SBOM, provenance, signature and archive checksums;
- Gate/evidence decision identifier; and
- known limitations, deprecations and support end dates.

Consumers pin the single Studio release coordinate and verify the bundled record before resolving its exact
package versions. Broad ranges that can resolve an untested combination are not used in deployable first-party
builds.

## Candidate creation

1. Freeze the proposed commit and verify a clean checkout.
2. Resolve all changesets and validate semantic/compatibility classification.
3. Install from the lockfile with the declared Node/npm toolchain.
4. Run format, lint, type, schema, unit, property/fuzz, integration, browser, accessibility, security,
   compatibility, migration, performance, and packaging lanes required by the exact profile matrix. Add
   Flutter lanes only for a Version 3 native claim.
5. Generate TypeScript sources from canonical schemas and prove a clean regeneration diff; generate and compare
   Dart sources when a Version 3 native profile is in the candidate.
6. Build packages/examples/docs twice in isolated environments and compare expected deterministic outputs.
7. Generate SBOM and provenance; scan source, history, dependencies, artifacts and fixtures for secrets and
   vulnerabilities.
8. Pack the fixed npm family and install it into clean generic, Kumwe App, and TypeScript consumers without
   workspace links. Add Dart clean consumers for a Version 3 native claim.
9. Regenerate and verify the canonical release record, then create the content-addressed evidence bundle.
10. Sign/attest the candidate and enter evidence review. The candidate bits do not change during review.

If a fix is required, create a new commit, versioned candidate, manifest and affected evidence. A mutable
“latest RC” is not review evidence.

The exact operator inputs, preparation/publication split, and retry procedure are normative operational
instructions in [`CONTRIBUTING.md`](../../CONTRIBUTING.md). Preparation creates a reviewed PR and never receives
npm credentials. Publication occurs only after merge in the protected `studio-rc` or `studio-stable`
environment, revalidates current `main`, and is idempotent after a partial registry publish or token rotation.

## Publication

Stable publication requires:

- Gate B `pass` for the exact candidate;
- approved changelog/release notes and migration/recovery guide;
- registry ownership, protected publishing environment and least-privilege trusted publication;
- npm provenance, plus equivalent Dart/source attestations for a Version 3 native release;
- package/archive checksum verification after registry download;
- documentation and examples deployed from the same release set; and
- a post-publication clean-consumer smoke test before announcement.

Long-lived registry tokens are avoided where trusted publishing is available. Release credentials are never
available to pull-request workflows or untrusted package code.

## Release notes

Release notes include:

- user-visible authoring and host-integration changes;
- exact supported profiles and environments;
- protocol/package/schema/SDK compatibility changes;
- migrations and rollback constraints;
- new deprecations and earliest removal date/version;
- security/privacy/accessibility corrections described safely;
- known limitations and unresolved non-blocking defects; and
- links to evidence, SBOM, provenance, signatures and checksums.

An implementation correction that may break consumers relying on prior defective behaviour is called out even
when released as a patch.

## Failure and rollback

- Stop publication if any registry artifact differs from the approved checksum or lacks provenance.
- Do not overwrite or silently rebuild a published version.
- If a package is corrupt or malicious, deprecate/yank according to registry capability, publish an advisory
  and release a corrected version; retain forensic evidence.
- Rollback instructions identify the last compatible release set and artifact revisions. Unsupported downgrade
  fails explicitly rather than risking data loss.
- A host integration activation remains separate from package publication and uses its own backup, migration,
  smoke-test and atomic rollback procedure.
- Security incident response follows private disclosure, coordinated fix, regression evidence and advisory.

## Release cadence

The six-month programme uses continuous prerelease candidates and evidence reviews rather than promising a
release on a calendar date. Stable releases occur when the applicable gate and quality evidence pass. After
Gate B, maintainers may adopt a regular train, but a missed train carries forward; it never weakens a gate.
