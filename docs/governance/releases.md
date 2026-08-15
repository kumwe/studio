# Release policy

Studio releases a coordinated, verified set of npm packages, language-neutral schemas/fixtures, Dart packages,
examples, documentation and a release manifest. Publishing one package does not imply Gate A/B or production
readiness for the whole product.

## Channels

| Channel              | Purpose                                            | Compatibility/support claim                                              |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Development snapshot | Internal branch integration and CI                 | None; not published as stable                                            |
| `alpha`              | Contract/interaction discovery with early adopters | May break with changeset and fixtures; no durable host commitment        |
| `beta`               | Feature-complete candidate for a declared profile  | Contract changes treated as release blockers and reviewed explicitly     |
| `rc`                 | Immutable candidate for gate/release evidence      | Only release-blocking corrections; every rebuild creates a new candidate |
| Stable               | Gate B-qualified supported release set             | Semantic version, compatibility and support policies apply               |

Gate A normally publishes a contract release candidate, not a stable production package. The first stable
release is impossible before Gate B.

The foundation repository wires a non-authoritative release-readiness check only. All registry publication,
including `alpha`, `beta`, `rc`, and stable channels, remains disabled until `M1-04` implements and qualifies
the candidate evidence manifest, protected evidence retrieval, signature and freshness verification, artifact
hashes, reviewer-independence policy, and channel-specific npm tags. A prerelease version in a local manifest
is scaffolding and MUST NOT be published manually around that control. The current readiness workflow cannot
publish or authenticate to a registry, and passing it is not Gate A or Gate B evidence.

## Release unit and manifest

Packages use independent semantic versions while advancing through one compatibility train. The immutable
release manifest records:

- schema epoch, document contract revisions, wire-protocol versions, and every artifact/command/port/profile version;
- npm and Dart package name/version/integrity;
- schema, generated-source, fixture and documentation digests;
- supported Node/build, browser, Dart/Flutter, host and renderer matrices;
- extension/theme/media/rich-text compatibility ranges;
- source commit, toolchain, lockfiles and build environment;
- SBOM, provenance, signature and archive checksums;
- Gate/evidence decision identifier; and
- known limitations, deprecations and support end dates.

Consumers pin the tested set directly or through a release-set convenience manifest. Broad ranges that can
resolve an untested combination are not used in deployable first-party builds.

## Candidate creation

1. Freeze the proposed commit and verify a clean checkout.
2. Resolve all changesets and validate semantic/compatibility classification.
3. Install from the lockfile with the declared Node/npm toolchain.
4. Run format, lint, type, schema, unit, property/fuzz, integration, browser, Flutter, accessibility, security,
   compatibility, migration, performance and packaging lanes required by the support matrix.
5. Generate TypeScript and Dart sources from canonical schemas and prove a clean regeneration diff.
6. Build packages/examples/docs twice in isolated environments and compare expected deterministic outputs.
7. Generate SBOM and provenance; scan source, history, dependencies, artifacts and fixtures for secrets and
   vulnerabilities.
8. Pack npm/Dart artifacts and install them into clean generic, Kumwe, TypeScript and Dart consumers without
   workspace links.
9. Create the release manifest and content-addressed evidence bundle.
10. Sign/attest the candidate and enter evidence review. The candidate bits do not change during review.

If a fix is required, create a new commit, versioned candidate, manifest and affected evidence. A mutable
“latest RC” is not review evidence.

## Publication

Stable publication requires:

- Gate B `pass` for the exact candidate;
- approved changelog/release notes and migration/recovery guide;
- registry ownership, protected publishing environment and least-privilege trusted publication;
- npm provenance and equivalent Dart/source attestations;
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
