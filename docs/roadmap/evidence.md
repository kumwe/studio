# Acceptance evidence model

Studio uses evidence to distinguish a declared capability from an implemented and qualified one. The model
applies to work packages, Gate A, Gate B, package releases, host profiles, and compatibility claims.

## Evidence bundle

One immutable evidence bundle is attached to one source commit and one set of produced artifacts. Its
machine-readable manifest records:

- bundle identifier and evidence-schema version;
- source repository, commit, clean/dirty state, and dependency lockfile checksums;
- package, protocol, conformance-profile, host-adapter, browser, operating-system, Node, Dart, and Flutter
  versions applicable to the run;
- command, test identifier, start/end time, exit status, retry count, and runner identity;
- input fixture checksums and generated artifact checksums;
- reports, screenshots, videos, traces, logs, coverage, SBOM, provenance, signatures, and performance data;
- linked acceptance criterion and whether the evidence is positive, negative, migration, recovery, or manual;
- reviewer identity, review time, reproduction result, and freshness expiry; and
- redaction declaration proving no credential, personal data, customer content, or privileged preview token
  entered the bundle.

Evidence artifacts are content-addressed. A changed artifact produces a different bundle; a CI rerun does not
silently replace prior evidence.

## Evidence classes

| Class             | What it proves                                                      | Minimum form                                                                            |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `contract`        | Schemas, types, fixtures, and documented semantics agree            | Meta-validation, generated-model compile, positive/negative vectors, compatibility diff |
| `unit`            | An isolated invariant holds                                         | Deterministic test result linked to source and fixture                                  |
| `property-fuzz`   | Bounds and invariants survive generated/malicious input             | Seed, corpus, shrink result, sanitizer/failure evidence                                 |
| `integration`     | Public ports and real adapters work together                        | Real host adapter, real transport/storage boundary, failure and cleanup proof           |
| `lifecycle`       | Install/activate/disable/upgrade/rollback/recover preserve rules    | Before/after data, registry generation, diagnostics, checksum, audit trail              |
| `end-to-end`      | A representative user completes a workflow                          | Browser/Flutter trace, accessible name/focus evidence, network/console report           |
| `accessibility`   | Automated and human interaction criteria pass                       | Tool report plus keyboard, screen-reader, reflow, contrast, motion, error review        |
| `security`        | Trust boundaries reject attacks and disclose no secrets             | Threat mapping, negative corpus, static/dynamic/dependency results, reviewer record     |
| `performance`     | Published budgets hold on named hardware/profile                    | Raw samples, percentile method, warm/cold distinction, budget comparison                |
| `portability`     | Runtimes interpret the same protocol consistently                   | Shared vectors from TypeScript and Dart, canonical byte comparison, feature negotiation |
| `release`         | Shipped bits derive from reviewed source                            | Reproducible build result, SBOM, provenance, signatures, registry install proof         |
| `manual-decision` | A human judgement has been applied where automation is insufficient | Criterion, procedure, observations, reviewer, captured artifact, explicit outcome       |

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
- A reviewer executes the documented clean-room command or verifies a trusted attestation plus randomly
  selected raw artifacts. Merely reading the CI badge is not reproduction.
- Flaky evidence is failing evidence. A retry is recorded and must be classified and corrected before a gate.

## Freshness

Evidence expires when source, lockfiles, public schemas, generated SDKs, test fixtures, supported environment,
or release artifacts change in a way relevant to its criterion. Security/dependency and supported-browser
evidence is rerun for every release candidate. Manual accessibility and usability evidence is rerun when the
affected interaction or rendered structure changes.

## Gate review record

The gate decision record contains:

1. proposed commit and artifact hashes;
2. every criterion and linked evidence bundle;
3. supported and excluded profiles;
4. unresolved defects with severity and non-impact rationale;
5. compatibility/migration statement;
6. security and accessibility sign-off;
7. reviewer identities and decision time; and
8. `pass` or `fail`.

A mandatory security, accessibility, privacy, data-integrity, or compatibility criterion cannot be waived. If
the supported profile changes, the roadmap and public compatibility declaration change before review and the
affected evidence is regenerated.

## Executable instantiation

This model is instantiated in the repository:

- `evidence/README.md` — directory layout, content addressing, retention rules, and the ordered gate review
  checklist;
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
inputs or outputs have moved on fails regardless of how its commit relates to `HEAD`. Bundle directories prefixed `SAMPLE-` are excluded from those authenticity requirements
but must fail them; a sample bundle that passes fails the lane. This keeps the acceptance proof executable:
missing or stale evidence cannot pass a gate.
