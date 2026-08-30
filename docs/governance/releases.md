# Release policy

Studio Version 2 releases a coordinated, verified family of eight npm packages with language-neutral
schemas/fixtures, examples, documentation, and a canonical release record. Version 3 may add a separately
qualified Dart/Flutter set. Publishing one package does not imply Gate A/B, a profile claim, or production
readiness for the whole product.

## Channels

| Channel              | Purpose                                               | Compatibility/support claim                                                   |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| Development snapshot | Internal branch integration and CI                    | None; not published as stable                                                 |
| `beta`               | Integrated product implementation and host validation | Incomplete development maturity; no conformance, production, or support claim |
| `rc`                 | Immutable candidate for gate/release evidence         | Only release-blocking corrections; every rebuild creates a new candidate      |
| Stable               | Gate B-qualified supported release set                | Semantic version, compatibility and support policies apply                    |

The coordinate-scoped `studio-stage-<version>` tag is a quarantine mechanism, not a channel or support claim.
It makes one frozen `rc.N` family installable for Gate A evidence without moving `rc` or `latest` and without
creating a Git tag or GitHub release.

Gate A normally publishes a contract release candidate, not a stable production package. The first stable
release is impossible before Gate B.

The `beta` development train versions merged Changesets and publishes the coordinated workspace packages to
the `beta` distribution tag with provenance. Beta is where the integrated product becomes complete; its label
does not claim feature completeness, conformance, production readiness, compatibility support, or Gate A/B.
The single manual **Governed RC and stable promotion** workflow implements preparation and protected
publication. It refuses RC work unless the closed implementation inventory in `docs/roadmap/STATUS.md` contains
exactly `STUDIO-PROD-001`–`015`, every row is `repository-verified`, and all nine fixed Version 2 profile
assertion entries have non-empty executable inputs and lanes. After a reviewed RC metadata PR merges, its
protected quarantine operation may publish the exact candidate only under its nonofficial staging tag so
release evidence can inspect real npm bits and provenance. Opening the official `rc` channel still fails closed
until that exact candidate has accepted, independently reproduced evidence, required human review, and an
authoritative passing gate. A local prerelease version MUST NOT be published manually around these controls.

The **Evidence bundle** workflow only creates class-scoped pending qualification material. It runs every
executable class in the requested criterion even when a sibling class requires manual/external input, records
the unavailable classes explicitly, and claims only classes whose complete registered contract ran. Signed
manual/external bytes may enter later only through the closed `evidence:assemble` verifier; neither workflow
can fabricate human proof, publish, make a gate decision, or authenticate to npm. Gate A criterion 13 binds
its exact quarantined-registry install lane plus the complete family, provenance, SBOM, reproducibility,
clean-consumer, and signature artifacts, and still requires its registered manual class. Every class is
required for acceptance; the lane or a generic release label alone cannot satisfy it. Any active product row,
target-only fixed profile assertion, or missing Gate A evidence blocks the corresponding RC operation. Gate A
is not assessed and Gate B is blocked, so the official `rc` and stable channels cannot open.

At source `829694efb25374d3b498f2d46856d2c39650728a`, `studio-release.json` coordinated all eight packages at
`0.1.0-rc.1` and recorded nine proposed Version 2 profile names. Product review withdrew that maturity decision
after confirming the contextual authoring gap. The family had been published only under npm quarantine tags;
the official `rc` tag and coordinated GitHub release never opened. The coordinate and commit remain immutable
provenance, but the candidate is abandoned and MUST NOT be re-staged, promoted, overwritten, reused, or treated
as current maturity.
Generated versioning has since exited that stale RC state, entered the numeric beta train, cleared proposed
claims, and coordinated the source family at `0.1.0-beta.2`. Every publisher still verifies all eight exact
registry versions and provenance before a channel tag moves.

Beta publication and conformance qualification are deliberately separate. A beta build may be incomplete and
claims no profile. RC preparation requires repository-verified completion of the product contract and
executable assertions for the complete fixed profile set; official RC publication additionally requires
reproduced evidence for that exact set. Profile definitions and assertion sets remain in
[conformance profiles](../contracts/conformance-profiles.md).

Version 2 RC and stable promotion use one fixed nine-profile surface, including `authoring-web`. Initial RC
preparation defaults to that complete sorted set and rejects a subset. Preparation freezes the intended product
surface; it does not prove it. Official RC publication still requires Gate A to support all nine at the exact
candidate. A target-only authoring assertion or an unavailable Kumwe App/manual proof blocks the corresponding
operation and cannot be omitted as a shortcut.

“Release-candidate implementation” may describe a proposed immutable source tree under evaluation. It does
not mean the npm `rc` channel has opened. An `rc` publication is allowed only after every advertised profile
is claimed at that exact commit; naming incomplete bits “RC” cannot substitute for that evidence.

## Release unit and record

The eight npm packages are one Changesets fixed group and advance to the same semantic version. The
repository-root `studio-release.json` is the canonical, generated coordinate record and is copied byte-for-byte
into `@kumwe/studio-protocol` and `@kumwe/studio-testkit`. Its schema fixes the complete package family and
records the release version, exact package versions, wire protocol version, corpus-manifest digest, and the
fixed promotion profile surface. Its required `browserArtifacts` member also fixes how a consumer discovers
the manifest-backed delivery surfaces: the versioned authoring archive stem and its `browser-module` entry, plus
the deferred `enhancement-runtime` shipped by `@kumwe/studio-renderer-web`. The locator intentionally contains
no archive or inner-asset digest. `studio-assets.json` is authoritative for each content-hashed asset's exact
filename, bytes, SHA-256/SRI, minification status, and size budget; approved release metadata binds the outer
archive bytes. Putting either digest into the release record carried inside that archive would create a
self-reference. The external approved-artifact record adds the archive's content-hash suffix and exact digest
to that logical stem. A consumer therefore verifies the digest-pinned release record, approved archive, and
manifest/asset chain as one release; a matching filename alone is insufficient.

The artifact boundary is explicit. Every deployable browser JavaScript or CSS file has a content-hashed
`.min.js`/`.min.css` name plus its own SRI, byte count, and fixed budget. An npm package is governed as the
content-hashed `.tgz` envelope recorded in `approved-package-integrities.json`: all JavaScript/CSS members are
deterministically minified and runtime JavaScript/CSS source maps are excluded, while declaration maps and stable internal filenames remain necessary for
Node/package export resolution. The envelope carries exact SHA-1/SHA-256/SHA-512 integrity, byte size, and a
fixed package budget, so no unrecorded package byte can leave the gate. Publication performs two isolated clean
install/build/pack passes and rejects any differing tarball before authentication. This package-envelope rule
does not weaken the stricter per-file rule for anything served directly to a browser.

The abandoned `0.1.0-rc.1` metadata records nine withdrawn proposed Version 2 claims. Beta versioning clears
them. A future generated RC restores the fixed intended set only after the
implementation guard passes, and they become publishable claims only when the passing exact-candidate gate
supports the identical set. Candidate metadata is never itself conformance evidence.

The contracts lane regenerates the record from package manifests, protocol constants, and corpus bytes, then
fails on drift, an extra/missing package, a stale copy, an invalid schema, or a changed fixed group. The beta
version command runs Changesets first and regenerates the record. Explicit promotion generation transforms all
manifests, internal dependency pins, the lockfile, changelogs, prerelease state, profile claims, and all three
record copies together. For the current `0.1.0` base, the first transition resets `beta.N` to `rc.2` because
the withdrawn immutable `rc.1` already exists on npm; a semantic base with no reserved RC starts at `rc.1`.
A correction Changeset creates `rc.N+1`; Gate B promotion removes the suffix without changing runtime code.
Post-stable Changesets automatically enter a new beta train. Therefore a partial or staggered set cannot be
treated as a release.

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

### Browser-artifact consumer migration

The required `browserArtifacts` member is a breaking change for a consumer that pins the release-record or
schema digest. Producer and other PHP realization layers migrate one complete generation at a time:

1. update the release-record parser and canonical schema closure;
2. pin the exact new `studio-release.json`, corpus manifest, and conformance-vector bytes;
3. pin the approved authoring archive and exact `@kumwe/studio-renderer-web` package;
4. validate `studio-assets.json`, require its release identity to equal the coordinated record, and resolve
   exactly one `browser-module` plus one `enhancement-runtime` entry; and
5. verify each resolved entry's filename, byte count, full content hash, SRI digest, minification flag, and
   budget before making the generation available.

Those pins move atomically. An older release record, schema, corpus, manifest, archive, package, or inner asset
must not be mixed with the new generation, even when its filename appears compatible. Producer computes the
public runtime need only from the renderer's existing `enhancements` output intersected with the manifest's
closed eight-family set; no host-private flag or non-member enhancement can authorize another public behavior
file.

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
8. Pack the fixed npm family, publish the frozen RC only under its coordinate-scoped quarantine tag, verify
   exact registry integrity and source provenance, and install every exact package in a fresh credential-free
   consumer without workspace links. Add Dart clean consumers for a Version 3 native claim.
9. Regenerate and verify the canonical release record, then create the content-addressed evidence bundle.
10. Sign/attest the candidate and enter evidence review. Every manual, bundle, and gate decision uses a
    detached Ed25519 SSH signature over a closed attestation bound to the exact raw subject bytes. Reviewer
    authority comes only from the frozen public-key registry plus its exact digest in the protected environment.
    The candidate bits and quarantine tag do not change during review.

If a fix is required, create a new commit, versioned candidate, manifest and affected evidence. A mutable
“latest RC” is not review evidence.

The exact operator inputs, preparation/publication split, and retry procedure are normative operational
instructions in [`CONTRIBUTING.md`](../../CONTRIBUTING.md). Preparation creates a reviewed PR and never receives
npm credentials. Publication occurs only after merge in the protected `studio-rc` or `studio-stable`
environment. RC quarantine deterministically packs the eight approved candidates before authentication,
requires any already-present registry artifact to match those exact bytes, revalidates the exact current
`main` candidate state, and is idempotent after a partial registry publish or token rotation. It verifies all eight exact
registry artifacts, source-bound provenance, embedded release records, and a clean unauthenticated consumer,
then retains the quarantine tags for evidence without moving `rc` or creating a release. Changesets owns
version calculation and version PRs only. After a beta family and its `beta` dist-tag pass complete registry
and provenance proof, the beta workflow creates or verifies one source-bound coordinated GitHub prerelease and
its approved browser archive/checksum, then removes its quarantine tags. Official RC publication requires every
coordinate to exist already; after Gate A it verifies the same candidate provenance, moves `rc`, creates the
source-bound GitHub prerelease, verifies again, and only then removes the quarantine tags. Stable publication
uses the same retained-tarball discipline. Beta never assigns `latest`; legacy prerelease `latest` drift is
removed without changing a stable `latest`.

`NPM_TOKEN` placement is channel-specific. The beta workflow declares no GitHub environment and can read only
a repository Actions secret or an organization Actions secret explicitly granted to `kumwe/studio`. RC and
stable jobs read environment secrets from protected `studio-rc` and `studio-stable` respectively. Actions
variables do not satisfy `${{ secrets.NPM_TOKEN }}`, and a token configured only on an environment is therefore
invisible to beta.

Both protected environments define `STUDIO_REVIEWER_AUTHORITY_SHA256` as the exact SHA-256 SRI of the
candidate's `evidence/reviewer-authorities.json`; it must also equal the candidate's checked-in
`evidence/reviewer-authorities.sha256`. The checked-in value supports local structural/signature checks, while
the independent protected value is required before any reviewer identity, role, independence flag, or detached
signature can authorize a release decision. RC publication runs the verifier from a separate checkout of the
exact current `main` controller against the immutable candidate and evidence, then blocks if any verifier or
publisher semantic path differs before npm authentication. RC publication requires byte-identical
`package-lock.json`; the deterministic stable transform may change workspace release coordinates only, while
its normalized external dependency closure must remain exact. The live remote `main` SHA is checked again
before every registry upload, the official dist-tag move, and GitHub release creation.

Governed RC/stable operation also requires an administrator-configured default-branch protection rule or
ruleset with pull-request review and required CI checks. This is a GitHub repository setting, not something the
workflow YAML can establish; an absent rule remains a release-governance prerequisite.

## Publication

Official RC publication requires a passing Gate A record for the exact quarantined candidate and refuses to
upload any missing RC coordinate. This prevents Gate A from being manufactured by the publication it is meant
to authorize. Only after the full staged family and its independently reproduced evidence pass may `rc` move
or a GitHub prerelease be created.

Stable publication requires:

- Gate B `pass` for the exact candidate;
- approved changelog/release notes and migration/recovery guide;
- registry ownership, protected publishing environment and least-privilege trusted publication;
- npm provenance, plus equivalent Dart/source attestations for a Version 3 native release;
- package/archive checksum verification after registry download;
- documentation and examples deployed from the same release set; and
- a post-publication clean-consumer smoke test before announcement.

Each claimed environment must also have an executable entry in
`evidence/environment-assertions.json`. Its exact lane commands and required browser, OS, toolchain, host, PHP,
and database metadata must be present in independently reproduced bundles. Target-only Version 2 matrix entries
remain explicit stable blockers; their labels cannot be promoted into support claims.

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
- On a partial quarantine upload or token failure, retry the stage operation with the same frozen RC SHA and
  coordinate. Missing packages are uploaded, matching packages are reused, and a conflicting staging tag or
  immutable version fails closed. Do not clean the stage tag before evidence acceptance.
- A final staging-tag cleanup is housekeeping after the complete release and official channel have already
  been verified. If npm refuses that version-scoped dist-tag `DELETE`, the workflow may report the exact tag
  as retained only after re-reading it and proving that it still identifies the verified release. A mismatch,
  unverifiable result, or any other cleanup failure remains fatal.
- The npm attestation endpoint is checked for the exact package/version/tarball subject and expected GitHub
  workflow repository, path, ref, and commit. This structural source binding does not replace independent
  cryptographic verification: the registry verifies attestations at publication, and npm's supported
  `npm audit signatures` path verifies installed registry signatures and provenance attestations. The recovery
  checker does not reimplement Sigstore verification.
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
