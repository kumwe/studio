# SAMPLE-failing-stale-commit

This bundle is a deliberately failing specimen. It exists to satisfy the `M1-04` acceptance criterion
that missing or stale evidence cannot pass a gate. Its manifest validates against
`evidence/schema/evidence-bundle.schema.json`, but the strict authenticity checks in
`scripts/check-evidence.mjs` must reject it because:

- `source.commit` is `0000000000000000000000000000000000000000` and never equals the checked-out
  commit, so the evidence is stale; and
- `artifactChecksums` records `evidence/bundles/SAMPLE-failing-stale-commit/artifacts/contract-vectors.report.json`,
  which does not exist, so a claimed artifact is missing.

The validator exempts bundle directories prefixed `SAMPLE-` from having to pass authenticity checks and
instead fails the whole check lane if such a bundle passes them. Never link a `SAMPLE-` bundle from a
work package, gate record, or status entry.
