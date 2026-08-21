# Evidence

This directory holds machine-readable acceptance evidence for Studio work packages and gates. The
normative model — bundle manifest fields, evidence classes, criterion outcomes, reproduction and
independence rules, freshness, and the gate review record — is `docs/roadmap/evidence.md`. This
directory is its executable instantiation.

Everything under `evidence/` is currently draft scaffolding. No evidence bundle has been accepted and no
gate has passed. `docs/roadmap/STATUS.md` remains the sole authority for Gate A and Gate B status.

## Layout

| Path                                 | Content                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| `schema/evidence-bundle.schema.json` | Manifest schema for one evidence bundle                         |
| `schema/gate-record.schema.json`     | Schema for one gate decision record                             |
| `bundles/<bundleId>/manifest.json`   | One immutable bundle manifest; sibling files are its artifacts  |
| `gates/gate-<a\|b>.json`             | Gate decision records; none exist, so both gates are unassessed |

Bundle directories prefixed `SAMPLE-` are deliberately failing specimens. They must remain schema-valid,
must fail the strict authenticity checks, and must never be linked from a work package, gate record, or
status entry.

## Content addressing

- A bundle directory is named exactly after its `bundleId`; the validator rejects a mismatch.
- Every dependency lockfile, input fixture, and produced artifact is recorded as a repository-relative
  path with a `sha256-` SRI checksum. The validator recomputes each checksum from the working tree.
- A bundle is immutable: a changed artifact produces a different checksum and therefore a different
  bundle. A CI rerun produces a new bundle; it never silently replaces prior evidence.
- Manifests are never edited in place. A correction is a new bundle directory with a new `bundleId`.

## Artifact retention

1. A bundle referenced by an accepted work package, gate record, or published release is retained for the
   life of that release plus its published support window.
2. A bundle superseded before acceptance keeps its manifest; its raw artifacts may be pruned once the
   replacing bundle is accepted.
3. Raw artifacts too large for the repository live in external content-addressed storage; the manifest
   checksums remain authoritative and must still resolve during review.
4. Nothing under `evidence/` is rewritten in place, and deletion of an accepted bundle is a
   record-keeping defect, not housekeeping.

## Validation

`node scripts/check-evidence.mjs` runs in the repository check lane (`npm run check` via
`contracts:check`). It meta-validates both schemas, validates every bundle manifest and gate record, and
applies strict authenticity checks to every non-`SAMPLE-` bundle: the recorded commit must be the
checked-out `HEAD` or an ancestor of it, the working tree state must be `clean`, every recorded fixture
and artifact path must exist with a matching sha256 checksum, and a recorded freshness expiry must not
precede the checked-out commit time. A commit this clone has never seen — including the zeroed sample —
is not an ancestor, so fabricated evidence still fails. A `SAMPLE-` bundle must fail at least one of those checks; a sample that passes fails the
lane.

## Producing a bundle

`node scripts/create-evidence-bundle.mjs --package <M2-01>` captures everything mechanical: the reviewed
commit, the environment, each lane command with its exit status and timings, and the sha256 checksum of
every recorded input and produced artifact. It refuses to run against a dirty tree and refuses to record
a failing lane.

It deliberately leaves `criteria` empty and writes no `review` block. Criterion outcomes are the
reviewer's judgement and `reproduced` is the reviewer's attestation; a generator that filled them in
would be self-certifying evidence, which this model forbids. The bundle is left uncommitted so a
reviewer inspects it, reproduces the run, records their outcomes and identity, and commits it.

The `Evidence bundle` workflow runs the same script on an independent runner and uploads the result as
an artifact, so a reviewer can compare a bundle produced elsewhere against the one they produced
themselves. Downloading that artifact is not itself reproduction.

For `studio.profile/preview-identity-v1`, the contract inputs are
`schemas/preview-vector.schema.json`, `schemas/vectors/preview/*.json`, the canonical serialization
corpus, and the preview negative fixtures. Reproduction runs the contract check plus
`packages/testkit/test/preview-vectors.test.ts` against the candidate commit and records the packaged
`vectors/preview/` checksums from `corpus-manifest.json`. This defines the evidence inputs; it does not
create or accept a bundle, and the profile remains unclaimed until an independent reviewer records one.

## Gate review procedure

`docs/roadmap/evidence.md` is normative; this checklist orders its requirements for a gate review:

1. Confirm the proposed commit is the exact reviewed source and record the artifact hashes it produced.
2. Link every gate criterion to a complete, current evidence bundle. A criterion outcome is exactly
   `met`, `not-met`, or `not-assessed`; nothing else is a gate outcome.
3. Verify each linked bundle carries the evidence classes its criterion requires and that flaky or
   retried evidence has been classified and corrected.
4. Reproduce: execute the documented clean-room command, or verify a trusted attestation plus randomly
   selected raw artifacts. Reading a CI badge is not reproduction.
5. Verify freshness: no relevant source, lockfile, schema, SDK, fixture, environment, or artifact change
   postdates the evidence, and mandatory rerun classes were rerun for this candidate.
6. Record supported and excluded profiles, unresolved defects with severity and non-impact rationale,
   the compatibility/migration statement, and security and accessibility sign-off. Mandatory security,
   accessibility, privacy, data-integrity, and compatibility criteria cannot be waived.
7. Two reviewers, at least one independent of the work-package owners, record their identities and the
   decision time; the decision is `pass` or `fail`.
8. Write the record to `evidence/gates/gate-<a|b>.json`, run `node scripts/check-evidence.mjs`, and
   update `docs/roadmap/STATUS.md` in the same change.
