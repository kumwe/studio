# Acceptance evidence model

Studio uses evidence to distinguish a declared capability from an implemented and qualified one. The model
applies to work packages, Gate A, Gate B, package releases, host profiles, and compatibility claims.

## Evidence bundle

One immutable evidence bundle is attached to one source commit and one set of produced artifacts. Its
machine-readable manifest records:

- bundle identifier and evidence-schema version;
- source repository, commit, clean/dirty state, and dependency lockfile checksums;
- package, protocol, conformance-profile, host-adapter, browser, operating-system, and Node versions applicable
  to the run, plus Dart and Flutter versions when a Version 3 native profile is under review;
- command, test identifier, start/end time, exit status, retry count, and runner identity;
- input fixture checksums and generated artifact checksums;
- reports, screenshots, videos, traces, logs, coverage, SBOM, provenance, signatures, and performance data;
- linked acceptance criterion and whether the evidence is positive, negative, migration, recovery, or manual;
- review lifecycle (`pending`, `reproduced`, or `rejected`), human reviewer identity, review time, freshness
  expiry for reproduced evidence, and detached signature paths; and
- redaction declaration proving no credential, personal data, customer content, or privileged preview token
  entered the bundle.

Evidence artifacts are content-addressed. A changed artifact produces a different bundle; a CI rerun does not
silently replace prior evidence.

The generator may record a criterion's evidence modality because that is a mechanical description of
the lane it ran. It always writes `review.status: pending`. Only a human with authority from the externally
pinned reviewer registry may sign reproduction or rejection, and only a separately signed gate record may
assign `met`, `not-met`, or `not-assessed`. Reviewer identity, role, or independence strings in the evidence
JSON are not authority.

## Evidence classes

| Class             | What it proves                                                      | Minimum form                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract`        | Schemas, types, fixtures, and documented semantics agree            | Meta-validation, generated-model compile, positive/negative vectors, compatibility diff                                                         |
| `unit`            | An isolated invariant holds                                         | Deterministic test result linked to source and fixture                                                                                          |
| `property-fuzz`   | Bounds and invariants survive generated/malicious input             | Seed, corpus, shrink result, sanitizer/failure evidence                                                                                         |
| `integration`     | Public ports and real adapters work together                        | Real host adapter, real transport/storage boundary, failure and cleanup proof                                                                   |
| `lifecycle`       | Install/activate/disable/upgrade/rollback/recover preserve rules    | Before/after data, registry generation, diagnostics, checksum, audit trail                                                                      |
| `end-to-end`      | A representative user completes a workflow                          | Browser trace for Version 2; Flutter trace for a Version 3 native claim; accessible name/focus evidence and network/console report              |
| `accessibility`   | Automated and human interaction criteria pass                       | Tool report plus keyboard, screen-reader, reflow, contrast, motion, error review                                                                |
| `security`        | Trust boundaries reject attacks and disclose no secrets             | Threat mapping, negative corpus, static/dynamic/dependency results, reviewer record                                                             |
| `performance`     | Published budgets hold on named hardware/profile                    | Raw samples, percentile method, warm/cold distinction, budget comparison                                                                        |
| `portability`     | A claimed runtime interprets the protocol consistently              | TypeScript canonical replay for Version 2; shared TypeScript/Dart vectors and byte comparison for a Version 3 native claim; feature negotiation |
| `release`         | Shipped bits derive from reviewed source                            | Reproducible build result, SBOM, provenance, signatures, registry install proof                                                                 |
| `manual-decision` | A human judgement has been applied where automation is insufficient | Criterion, procedure, observations, reviewer, captured artifact, explicit outcome                                                               |

## Stable gate criterion registry

`evidence/gate-criteria.json` is the closed machine-readable mapping from the stable identifiers printed
beside the criteria in `README.md` to their required evidence classes. The check lane requires document
and registry identifier order to remain identical. Changing an identifier or mapping is a contract
change; it does not silently rewrite an existing gate record.

| Gate A identifier                      | Required evidence classes    |
| -------------------------------------- | ---------------------------- |
| `gate-a/01-artifact-vocabulary`        | contract, manual-decision    |
| `gate-a/02-protocol-schemas`           | contract, security           |
| `gate-a/03-deterministic-commands`     | contract, property-fuzz      |
| `gate-a/04-extension-theme-lifecycle`  | contract, lifecycle          |
| `gate-a/05-host-ports-negotiation`     | contract, integration        |
| `gate-a/06-media-rich-text-boundaries` | contract, integration        |
| `gate-a/07-threat-model`               | security, property-fuzz      |
| `gate-a/08-errors-diagnostics`         | contract, security           |
| `gate-a/09-typescript-corpus`          | contract, portability        |
| `gate-a/10-host-playbooks`             | integration, manual-decision |
| `gate-a/11-evolution-release-policy`   | contract, manual-decision    |
| `gate-a/12-accessible-interactions`    | accessibility, contract      |
| `gate-a/13-reproducible-evidence`      | release, manual-decision     |
| `gate-a/14-no-high-risk-contradiction` | security, manual-decision    |

For `gate-a/13-reproducible-evidence`, the `release` class is not satisfied by the generic quality or package
dry-run lanes alone. The bundle must execute the closed `release/staged-registry-install` command against the
exact frozen RC. That command requires all eight candidate tarballs and source-bound provenance under the
coordinate-scoped quarantine tag, then proves an unauthenticated clean install, embedded release records, and
npm signatures. Quarantine does not move the official `rc` tag or create a release; it remains until Gate A is
reviewed and the official publication succeeds.

| Gate B identifier                     | Required evidence classes        |
| ------------------------------------- | -------------------------------- |
| `gate-b/01-contract-implementation`   | contract, integration            |
| `gate-b/02-coordinated-npm-release`   | release                          |
| `gate-b/03-dom-free-core`             | unit, property-fuzz, portability |
| `gate-b/04-web-authoring-operations`  | end-to-end, accessibility        |
| `gate-b/05-host-conformance`          | integration, lifecycle           |
| `gate-b/06-public-rendering-boundary` | integration, security            |
| `gate-b/07-extension-theme-examples`  | lifecycle, integration           |
| `gate-b/08-document-compatibility`    | lifecycle, integration           |
| `gate-b/09-web-accessibility`         | accessibility, end-to-end        |
| `gate-b/10-security-resilience`       | security, property-fuzz          |
| `gate-b/11-performance-budgets`       | performance                      |
| `gate-b/12-deterministic-builds`      | release                          |
| `gate-b/13-release-materials`         | release, manual-decision         |
| `gate-b/14-clean-room-host`           | integration, end-to-end          |
| `gate-b/15-kumwe-app-vertical`        | integration, end-to-end          |
| `gate-b/16-upgrade-recovery`          | lifecycle, integration           |
| `gate-b/17-candidate-evidence`        | release                          |
| `gate-b/18-independent-approval`      | manual-decision                  |

The registry's `profileVocabulary` lists allowable Version 2 profile identifiers, including target
profiles. It is not a support or qualification claim.

## Host profile replay evidence

A `studio.profile/host-baseline-v2` claim records both corpus groups: every single-exchange vector in
`vectors/host/` and every ordered vector in `vectors/host-sequence/`. The input checksums MUST match the
published corpus manifest. Raw results retain each step's request-independent identifier, outcome,
revision comparison, retry classification and delay, plus the asserted final artifact, recovery, and
preview state. The bundle also retains the vector's machine-readable idempotency scope/preimage and
every explicit `advance-clock` or `release-preview-render` control. Cancellation evidence records that
render was in flight before cancel, the renderer completion was released at the declared later step,
render settled as `cancelled`, no work remained pending, and no late result was delivered. The
cross-context case records the inverse: the unrelated cancel did not settle the render, whose explicit
completion was delivered once. Wall-clock sleeps, hidden callbacks, fault injection, or an
implementation-specific shortcut do not reproduce the portable sequence precondition.

A local green replay is unit and contract evidence, not a profile claim. The immutable bundle still
names the exact package/corpus versions and commit, is reproduced independently, and records the host
adapter under test. Any sequence schema, vector, operation registry, or runtime-semantic change expires
that claim.

## Criterion outcomes

A criterion has exactly one gate outcome:

- `not-assessed` — no complete, current bundle has been submitted;
- `not-met` — evidence was reproduced and demonstrated failure;
- `met` — all required evidence classes were reproduced at the proposed commit.

“Mostly met,” “expected to pass,” and “green on another branch” are not gate outcomes. A package may use
`blocked` or `evidence-review` as workflow state, but a gate criterion remains one of the three outcomes.

## Reproduction and independence

- Package acceptance needs one reviewer who did not author the relevant implementation.
- Gate A and Gate B need two reviewers, at least one independent of the work-package owners.
- Security, accessibility, compatibility, and data-integrity claims need a reviewer competent in that domain.
- Every manual, bundle, and gate decision signs a closed attestation over the exact raw subject bytes with an
  Ed25519 key. The key, reviewer roles, and independence come from `evidence/reviewer-authorities.json`, whose
  exact repository `.sha256` companion enables structural verification; release authorization additionally
  requires the protected environment to supply that same SHA-256 SRI independently.
- A reviewer executes the documented clean-room command or verifies a trusted attestation plus randomly
  selected raw artifacts. Merely reading the CI badge is not reproduction.
- Flaky evidence is failing evidence. A retry is recorded and must be classified and corrected before a gate.

The exact clean-room checkout, toolchain checks, Chromium installation, generator invocation, and
post-generation validation command are maintained in `evidence/README.md`. The generator uses fixed
argument vectors rather than a shell, stages outside the bundle tree, and records all mandatory quality,
contract, unit, build, and accessibility lanes with zero retries. Its result remains pending until the
human procedure is complete.

The current-main release controller also compares the candidate's exact verifier/publisher source closure,
setup action, and byte-identical npm lockfile before RC authorization. Stable preparation may change only the
workspace release coordinates allowed by its deterministic transform; the normalized external dependency
closure must remain exact.

## Freshness

Evidence expires when source, lockfiles, public schemas, generated SDKs, test fixtures, supported environment,
or release artifacts change in a way relevant to its criterion. Security/dependency and supported-browser
evidence is rerun for every release candidate. Manual accessibility and usability evidence is rerun when the
affected interaction or rendered structure changes.

## Gate review record

The gate decision record contains:

1. proposed commit and artifact hashes;
2. the complete stable criterion set, each criterion's gate outcome and zero or more linked bundles, plus
   the exact union of all linked bundle identifiers;
3. supported and excluded profiles;
4. unresolved defects with severity and non-impact rationale;
5. compatibility/migration statement;
6. security, accessibility, compatibility, and data-integrity sign-off tied to reviewers with those roles;
7. two distinct human reviewer identities, one independent, decision time, and per-reviewer detached signed
   attestations bound to the exact gate-record bytes; and
8. `pass` or `fail`.

A mandatory security, accessibility, privacy, data-integrity, or compatibility criterion cannot be waived. If
the supported profile changes, the roadmap and public compatibility declaration change before review and the
affected evidence is regenerated.

A `pass` record contains every criterion exactly once as `met`, links at least one non-sample bundle,
and covers every required evidence class. A `fail` record may preserve `not-met` or `not-assessed` and
therefore provides an honest durable review result without implying acceptance. Every referenced bundle
describes the record's exact source commit, is independently reproduced, remains fresh at decision and
validation time, and has already passed bundle authenticity.

## Executable instantiation

This model is instantiated in the repository:

- `evidence/README.md` — directory layout, content addressing, retention rules, and the ordered gate review
  checklist;
- `evidence/gate-criteria.json` and `evidence/schema/gate-criteria.schema.json` — stable Gate A/Gate B
  identifiers and required evidence-class mappings;
- `evidence/proof-assertions.json` and its schema — closed Gate A and Gate B criterion/class bindings to exact runs,
  artifact roles, manual procedures, external subjects, and current executable/target status;
- `evidence/manual-procedures.json` and its record schema — complete step sets and independent human roles for
  manual decisions and accessibility;
- `evidence/external-subject-assertions.json` and its subject schema — exact cross-repository workflow,
  source, candidate, and package-family binding for Kumwe App evidence;
- `evidence/reviewer-authorities.json`, its exact `.sha256` companion, and the review-attestation/authority
  schemas — public reviewer keys/roles and signed-review format; repository pinning proves structure and
  signatures, while release authority remains inert without the matching protected external digest;
- `evidence/schema/evidence-bundle.schema.json` — machine-readable manifest schema for one bundle;
- `evidence/schema/gate-record.schema.json` — machine-readable gate decision record schema;
- `scripts/check-evidence.mjs` — validator executed by the repository check lane (`npm run check` via
  `contracts:check`).

The validator rejects any bundle whose recorded commit, working-tree state, or checksums do not match the
checked-out source. The recorded commit must be the checked-out commit **or an ancestor of it**: evidence
is produced at the commit under review and is then committed itself, which advances `HEAD`, so requiring
equality would make a bundle unrecordable — its manifest would have to name the hash of the commit that
contains it. Reachability is the weaker of the two guarantees and the checksum verification is the
stronger one: every recorded fixture and artifact is rehashed against the working tree, so a bundle whose
inputs or outputs have moved on fails regardless of how its commit relates to `HEAD`. It also rejects
path escape, symlinks, non-regular tracked source modes, artifact-array/checksum-map drift, missing mandatory inputs/lanes, producer/role/run
substitution, incomplete proof references, unauthenticated manual or external subjects, nonzero exits,
retries, unknown criterion/class mappings, package-version drift, invalid profiles, future reviews, and
expired reproduced evidence. Bundle directories prefixed `SAMPLE-` must fail those requirements and are
categorically unavailable to gate records. Gate validation then requires exact source equality, bundle
reachability, per-criterion class coverage derived only from authenticated proof bindings, exact profile
partition/coverage, exact manifest/artifact/review-authentication bytes, and independently authenticated
human role/independence rules. Candidate registries, schemas, lane definitions, generator inputs, review
authentication, and imported release-policy helpers must also equal the executing verifier semantics. This
keeps the acceptance proof executable: missing, fabricated, stale,
or self-certified evidence cannot pass a gate.

The registry deliberately keeps the specialized lifecycle, host/media integration, TypeScript portability,
release-family/SBOM, every Gate B binding, and Kumwe App lanes non-executable until each producer has a closed
semantic schema and validator for every structured artifact role. It also keeps
`studio.profile/authoring-web` as a target bound to both an exact Kumwe App real-shell subject and the complete
manual accessibility procedure. Neither a profile label nor the existing automated browser lane can promote
that target. RC/stable metadata nevertheless freezes the complete fixed nine-profile Version 2 surface, so
`authoring-web` must be completed rather than omitted before official RC publication.
