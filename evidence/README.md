# Evidence

This directory is the executable form of the acceptance model in
`docs/roadmap/evidence.md`. It defines stable Gate A and Gate B criteria, bundle and decision schemas,
strict source/artifact validation, and deliberately failing specimens.

The proof-binding and signed-review machinery is implemented. Phase 2 adds closed, versioned contracts and
deterministic internal producers for lifecycle, reference-host HTTP, media/rich-text, TypeScript portability,
the reproducible eight-package family, CycloneDX SBOM, and staged-registry proof. No real bundle has yet been
independently reproduced or accepted, and no gate record exists.
`docs/roadmap/STATUS.md` remains the sole gate authority: Gate A is not assessed and Gate B is blocked.

## Layout

| Path                                        | Content                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `gate-criteria.json`                        | Stable criterion IDs, required evidence classes, profile vocabulary       |
| `profile-assertions.json`                   | Exact source inputs and executable test lanes for every profile           |
| `environment-assertions.json`               | Closed executable/target mapping for every environment-matrix identity    |
| `proof-assertions.json`                     | Exact runs, roles, subjects, and availability for every Gate A/B class    |
| `producer-contracts.json`                   | Fixed lane, filename, media type, role, and schema for producer outputs   |
| `manual-procedures.json`                    | Closed human procedures; each step and reviewer role is mandatory         |
| `external-subject-assertions.json`          | Exact external repository/workflow/source/package-family bindings         |
| `reviewer-authorities.json`                 | Public reviewer keys/roles                                                |
| `reviewer-authorities.sha256`               | Exact repository pin for local structural/signature verification          |
| `schema/environment-assertions.schema.json` | Closed schema for environment commands, variants, and metadata predicates |
| `schema/gate-criteria.schema.json`          | Closed schema for the criterion registry                                  |
| `schema/evidence-bundle.schema.json`        | Closed schema for one immutable bundle manifest                           |
| `schema/evidence-intake-v1.schema.json`     | Closed checksum-bound manual/external intake envelope                     |
| `schema/producer-output-v1.schema.json`     | Closed per-role schema for internal structured evidence                   |
| `schema/cyclonedx-sbom-v1.schema.json`      | Closed deterministic CycloneDX candidate graph                            |
| `schema/gate-record.schema.json`            | Closed schema for a multi-bundle, per-criterion gate decision             |
| `bundles/<bundleId>/manifest.json`          | One manifest; regular files below `artifacts/` are its exact outputs      |
| `gates/gate-<a\|b>.json`                    | Gate records; none exist, so Gate A is unassessed and Gate B is blocked   |

The entries in `gate-criteria.json#profileVocabulary` are allowable Version 2 identifiers, not support claims.
RC and stable metadata always carry the complete fixed set of nine Version 2 profiles, including
`studio.profile/authoring-web`; partial promotion sets are rejected. `profile-assertions.json` remains the proof
authority: a supported profile must record every named source input and pass every exact registered lane. The
authoring profile is still target-only, so it blocks official RC publication until its closed proof route is
executable and accepted; it cannot be omitted to make the gate easier. Only `supportedProfiles` in a valid,
reviewed gate record can authorize publication, and `STATUS.md` still controls programme status.

All run IDs use one closed command and artifact-role registry shared by the generator and validator. Every
artifact names one producer lane and role, every run names its retained artifacts, and every criterion/class
claim contains exact proof references derived from `proof-assertions.json`. Unknown lanes, label-only claims,
command substitutions, role or producer substitutions, nonzero exits, and retries fail authenticity. Gate
coverage is derived only from proof bindings which completed those checks; a criterion/class string never
counts by itself. Environment
qualification is also executable: every `coveredBy` value resolves as `<bundleId>#<testId>`, the run command
must be the registered command, and its bundle metadata must satisfy the exact governed variant. Unsupported
browser/mobile/desktop, clean-consumer, and Kumwe App database variants remain `target`; they cannot claim
qualification and they block Version 2 stable release. The target-only Dart/Flutter row belongs to Version 3
and does not block Version 2.

All 32 Gate B criterion/class bindings remain explicit targets, not gaps hidden behind labels. The internal
contribution-lifecycle and TypeScript-portability classes are executable. The reference-host and
rich-text/media producers are executable components of criteria whose integration class also requires
authenticated Kumwe App real-shell output. A requested criterion therefore produces a class-scoped pending
bundle: every executable class runs and is retained even when a sibling class is `manual-input`,
`external-input`, or `target`. The pending scope names every required class and its available and missing
runs; only a fully executed class receives a proof claim. Acceptance still requires every class registered for
the criterion across authenticated, reviewed bundles.

Manual decisions and accessibility use registered procedures and require a checksum-bound record from a
human with the exact role, complete step set, and identity independent of every runner. External classes
likewise require their registered signed subject, report, attestation, and review authentication. These bytes
enter only through the closed intake/assembly route; an internal producer never fabricates a human observation
or external result. Gate A criterion 13 additionally binds the staged-registry command, but that command alone
cannot satisfy the criterion: its independent manual-decision class is still required, and the release class
itself requires all registered family, provenance, SBOM, reproducibility, clean-consumer, signature, and
staged-registry artifacts. The RC quarantine is not the official `rc` channel or a support claim.

`studio.profile/authoring-web` remains an explicit target within the mandatory nine-profile product surface.
Its future executable route is closed over the
automated accessibility lane, the registered manual accessibility procedure, and an authenticated exact-commit
Kumwe App real-shell subject. It cannot pass today, and it cannot be silently omitted from RC metadata.

Directories prefixed `SAMPLE-` are deliberately failing specimens. They stay schema-valid, must fail
authenticity, and may never be referenced by a gate. A sample that starts passing causes the lane to
fail.

## Authenticity and immutability

- The bundle directory name equals `bundleId`. `SAMPLE-` is reserved and rejected by the generator.
- The canonical repository URL, exact source commit, clean source state, lockfile, release record,
  criterion/profile/environment registries and schemas, protocol manifest, testkit corpus manifest, and
  profile-specific test inputs are recorded. Retained bundles authenticate these inputs and package versions
  against their own source commit, not whatever RC correction or stable metadata happens to be at current
  `HEAD`.
- Every checksum is `sha256-` SRI over the exact bytes. Artifact array entries and
  `artifactChecksums` have identical path/checksum membership.
- A human decision is not authenticated by reviewer strings in JSON. Bundle, manual, and gate reviews bind
  the exact raw subject bytes through a closed attestation and a detached Ed25519 SSH signature in namespace
  `kumwe-studio-evidence-v1`. The signer identity, public key, roles, and independence must come from
  `reviewer-authorities.json`. Its checked-in `.sha256` companion permits deterministic local structural and
  signature verification only. A release decision is authorized only when the protected environment's
  `STUDIO_REVIEWER_AUTHORITY_SHA256` independently equals both that file and the registry bytes.
- Manual reviewers must carry trusted independent authority, the procedure's exact domain role, and an
  identity distinct from every recorded runner.
- Every proof points to the exact registered runs, to all artifacts produced by those runs, and to the exact
  external subjects required by the source-commit registry. Structured manual and external records are read
  back from their checksum-bound artifact paths before they can authenticate.
- Recorded paths are bounded repository-relative paths. Validators resolve them, refuse traversal and
  symlinks, require bounded mode-`0644` review files and regular tracked source modes, and verify the resolved
  path remains inside the selected checkout.
- Every generated claim carries all mandatory lane IDs for its class with ordered timestamps, exit status
  zero, and zero retries. Pending scope retains unavailable class/run IDs explicitly; it does not convert them
  into claims. Retried evidence is failing evidence.
- The generator stages outside `evidence/bundles/`, rechecks `HEAD` and cleanliness after all commands,
  validates its manifest, and atomically renames it into place. An existing bundle is never replaced.
- A changed input, artifact, commit, package version, profile, or review produces a new bundle; a
  correction never mutates an accepted bundle.

Accepted bundle artifacts must remain reachable as regular content-addressed files for the release plus
its support window. The current schema does not model external object storage, so a gate cannot rely on
an external URL or a CI-retention promise. The workflow's 90-day upload is provisional transport for
review, not accepted retention.

## Validation

`node scripts/check-evidence.mjs` runs through `contracts:check`. It validates all evidence schemas,
registry/document ID parity, the environment matrix and its closed assertion registry, bundle authenticity,
and gate semantics.
For a gate it additionally requires:

- the exact registered criterion set, once each, with `met`, `not-met`, or `not-assessed`;
- the top-level bundle set to equal the union of per-criterion links;
- every referenced non-sample bundle to exist, authenticate, describe the gate's exact source commit,
  be independently reproduced, and remain fresh now and at decision time;
- a `met` criterion to carry every required evidence class through authenticated proof bindings across its
  linked bundles; labels without those bindings contribute no coverage;
- supported and excluded profiles to be disjoint and partition the Version 2 vocabulary, with evidence
  for each supported profile;
- every stable environment `coveredBy` value to use `<bundleId>#<testId>` and resolve to a linked,
  independently reproduced bundle containing the governed passing lane for that environment;
- exact reachable hashes for every linked manifest, declared artifact, and bundle-review authentication file;
  two distinct cryptographically authenticated human reviewers; one trusted independent reviewer; and named
  accessibility, security, compatibility, and data-integrity reviewers with authority for those roles; and
- a passing decision to have every criterion met and no unresolved critical/high defect.

When no record exists, the command reports structural coverage as absent. That diagnostic is not a programme
decision: it never manufactures a record or changes `STATUS.md`, whose authoritative states remain Gate A
**Not assessed** and Gate B **Blocked**. Without the protected external digest it
can validate registry checksums, signatures, records, and artifact closure for CI, but it explicitly reports
any signed gate as structurally verified and still release-unassessed. Only the protected release verifier can
authorize the decision.

## Producing a pending bundle

Install the locked Chromium first, then identify one or more criterion IDs that include at least one currently
executable registered lane:

```bash
./node_modules/.bin/playwright install --with-deps chromium
node scripts/create-evidence-bundle.mjs \
  --package M2-01 \
  --criteria gate-a/02-protocol-schemas \
  --profiles studio.profile/engine-core \
  --runner local/clean-room
```

The generator plans class scope from `proof-assertions.json`. It records every requested criterion/class and
runs the union of executable lanes even when the same criterion also requires manual or external input. It
emits proof claims only for classes whose complete registered run/subject contract is available; unavailable
classes remain explicit in `scope.proofs` with their status and missing run, subject, or procedure binding. It
refuses only a requested scope with no executable producer lane. Landed lifecycle and portability producers can
therefore be retained now; integration still needs authenticated App input, and accessibility and
manual-decision classes still need their registered human records. The release producer is executable, but
Gate A criterion 13 still requires independent manual reproduction in addition to quarantine.

The script accepts no shell fragments: every flag is unique and bounded, the package and bundle ID are
validated before filesystem access, criteria and profiles must exist in the registry, and unknown or missing
flags fail. It runs format, lint, typecheck, build, all contract/governance scripts, the complete unit/Node test
command, and the Chromium accessibility lane with zero retries. Each lane gets a bounded, credential-scanned
log artifact.

The generated manifest has nonempty mechanical criterion/class entries with exact proof references and
`review: { "status": "pending" }`. These criterion entries describe evidence modality (`positive`,
`negative`, `migration`, `recovery`, or `manual`); they are not gate judgements. The generator cannot
write `met`, cannot mark reproduction, and cannot accept a gate.

The `Evidence bundle` workflow accepts an exact candidate SHA, validates dispatch values before
checkout, installs the locked toolchain and Chromium, derives an immutable server-side bundle ID, and
uploads only the generated directory. A badge or downloaded workflow artifact is not reproduction.

## Completing manual or external classes

Manual and external evidence is assembled into a downloaded pending bundle through one closed command:

```bash
npm run evidence:assemble -- \
  --pending <downloaded-pending-bundle-directory> \
  --intake <evidence-intake-v1.json>
```

The intake document must validate against `schema/evidence-intake-v1.schema.json`. Its bundle ID, candidate
commit and tree, work package, execution ID/attempt/runner, criterion, class, lane, and per-run identity must
match the pending manifest and registry exactly. Every source artifact declares its checksum, media type,
role, and destination below that exact bundle's `artifacts/` directory. Manual input must contain the closed
procedure record, signed review attestation, detached signature, and captured observation required by the
lane. External input must contain the registered subject, report, attestation, signed human review,
detached signature, and exact source/lockfile/package-family bindings. The assembler rejects undeclared,
substituted, extra, escaping, symlinked, oversized, checksum-mismatched, or secret-bearing bytes.

Assembly copies into a new immutable bundle target, runs the registered manual or external verifier with a
credential-free environment, retains its real log, and changes only the completed class from pending scope to
a generated proof claim. It does not edit the downloaded pending bundle and leaves bundle review
`status: pending`. It cannot invent a person's observations, signature, authority, independence, or an
external workflow result. A criterion becomes acceptable only after every required class is authenticated,
independently reproduced, reviewed, and linked by the later gate decision.

## Reviewer clean-room procedure

Replace every angle-bracket value before executing this exact sequence in a fresh directory:

```bash
git clone https://github.com/kumwe/studio.git studio-evidence-review
cd studio-evidence-review
git checkout --detach <candidate-40-character-sha>
test "$(git rev-parse HEAD)" = "<candidate-40-character-sha>"
test "$(node -p 'process.versions.node.split(".")[0]')" = "24"
test "$(npm --version)" = "11.9.0"
npm ci
./node_modules/.bin/playwright install --with-deps chromium
node scripts/create-evidence-bundle.mjs \
  --candidate <candidate-40-character-sha> \
  --package <work-package> \
  --criteria <comma-separated-stable-criterion-ids> \
  --id <new-immutable-review-bundle-id> \
  --runner clean-room/<runner-id>
node scripts/check-evidence.mjs
```

The reviewer then compares commands, inputs, environment, raw logs, and checksums with the proposed CI
bundle; randomly inspects raw artifacts; and rejects any unexplained difference, retry, redaction issue,
or source mutation. The human records the final review block and its two authentication paths, writes the
closed review attestation over the exact final `manifest.json` bytes, and signs that attestation with their
registered Ed25519 key:

```bash
ssh-keygen -Y sign \
  -f <reviewer-private-key> \
  -n kumwe-studio-evidence-v1 \
  evidence/bundles/<bundle-id>/review/<reviewer>.json
```

The command writes the detached `.sig` named by the review block. The private key never enters the repository.
The public-key registry and matching `.sha256` file must already be part of the frozen candidate, and
administrators must set the same registry SHA-256 SRI as `STUDIO_REVIEWER_AUTHORITY_SHA256` in both protected
release environments. The review identity must not be a runner identity, and its roles/independence must
exactly equal the pinned authority. Reproduction still does not set a gate outcome.

## Gate review procedure

1. Confirm the exact proposed source commit and all artifact hashes.
2. Link every criterion to complete, current bundles; leave missing work explicitly `not-assessed`.
3. Prove every `met` criterion has all classes declared in `gate-criteria.json`.
4. Reject nonzero, retried, expired, unreviewed, missing, sample, source-mismatched, or unreachable data.
5. Partition the profile vocabulary into supported and excluded entries without turning targets into
   claims, and record defects plus the compatibility/migration statement.
6. Record two distinct human reviewers, one independent, with competent accessibility, security,
   compatibility, and data-integrity sign-off. Each reviewer writes and signs their own closed attestation over
   the exact final gate-record bytes; a JSON identity or copied signature cannot grant authority. An automated
   contributor is never a reviewer.
7. Write `gate-a.json` or `gate-b.json`, run `node scripts/check-evidence.mjs` for structural/signature
   verification, and update `STATUS.md` in the same reviewed change. The protected release controller then
   repeats validation with `STUDIO_REVIEWER_AUTHORITY_SHA256`; a failing record may preserve `not-assessed`,
   while a passing record may not.

## Phase 2 producer contracts

`producer-contracts.json` fixes each internal output's lane, filename, media type, role, and versioned schema.
The generator gives a producer an exclusive output directory, requires exact regular-file membership, retains
canonical JSON bytes and checksums, and binds each document to the candidate commit, coordinated package map,
release record, protocol schema manifest, and corpus manifest. The validator replays those semantics from the
frozen candidate and rejects arbitrary bytes, renamed or extra outputs, symlinks, role/producer substitution,
incomplete package families, SBOM drift, and staged-versus-approved digest drift.

Gate B remains target-only until equivalent per-role contracts and producers land. Manual decisions,
accessibility observations, the authoring shell, and external-host evidence are authenticated intake contracts;
an automated Studio producer never fabricates them.

The Kumwe App lane remains target-only until Studio verifies independently authenticated GitHub workflow
provenance for the exact App repository, ref, commit, tree, workflow path and commit, run ID/attempt, command,
and digest; exact committed App source and lockfile checksums; the Studio candidate and release-record/corpus
digests; and all eight npm package integrities. The App-produced report and attestation must be parsed through
their closed schemas, retained under exact producer/role paths, and grounded against the Studio candidate,
GitHub run, and npm registry rather than merely being internally self-consistent. Only then may the App subject,
the dependent integration classes, and the `authoring-web` profile binding become executable.
