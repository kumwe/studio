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

The `alpha` channel is live: the release train publishes the workspace packages to the `alpha` distribution
tag with provenance on every merge to the default branch, and no `alpha` publish carries a support or
compatibility claim. Publication on the `beta`, `rc`, and stable channels remains disabled until `M1-04` is
accepted, qualifying the candidate evidence manifest, protected evidence retrieval, signature and freshness
verification, artifact hashes, reviewer-independence policy, and channel-specific npm tags. A prerelease
version in a local manifest is scaffolding and MUST NOT be published manually around that control. The
release-readiness workflow cannot publish or authenticate to a registry, and passing it is not Gate A or
Gate B evidence.

Promotion from `alpha` to `beta` additionally requires a declared, executable conformance profile the
candidate is feature-complete against, claimed with reproduced evidence. The profiles and their assertion
sets are in [conformance profiles](../contracts/conformance-profiles.md).

## Release unit and record

The eight npm packages are one Changesets fixed group and advance to the same semantic version. The
repository-root `studio-release.json` is the canonical, generated coordinate record and is copied byte-for-byte
into `@kumwe/studio-protocol` and `@kumwe/studio-testkit`. Its schema fixes the complete package family and
records the release version, exact package versions, wire protocol version, corpus-manifest digest, and only
profiles backed by acceptable evidence. The current pre-version alpha baseline claims no profiles.

The contracts lane regenerates the record from package manifests, protocol constants, and corpus bytes, then
fails on drift, an extra/missing package, a stale copy, an invalid schema, or a changed fixed group. The version
command runs Changesets first, regenerates the record, and requires every package version to equal its release
coordinate. Publication runs the same strict check and a post-publication registry lookup of all eight exact
versions. Therefore a partial or staggered set cannot be treated as a Studio release.

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
