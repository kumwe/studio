# Studio workflows

The workflows have distinct responsibilities and one release road. Running a qualification workflow never
publishes a package, and publishing a package never manufactures a gate decision.
The canonical contributor and release sequence is [`CONTRIBUTING.md`](../../CONTRIBUTING.md); this file is the
Actions-screen synopsis.

| Workflow                                             | Trigger                                                                 | Purpose                                                                                                                               | Publishes?          |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **CI** (`ci.yml`)                                    | Pull requests and pushes                                                | Repository quality, security, packaging, and browser checks                                                                           | No                  |
| **Alpha release train** (`version-packages.yml`)     | Every push to `main`, or manual recovery for exact `main`               | Maintains the coordinated Changesets alpha PR, publishes a merged alpha, pauses during RC, and opens the next train after stable      | `alpha` only        |
| **Evidence bundle** (`evidence-bundle.yml`)          | Manual, exact candidate SHA                                             | Produces a pending artifact for named criteria/profile lanes; reproduction, review, and gate acceptance happen separately             | No                  |
| **Governed RC and stable promotion** (`release.yml`) | Manual, exact current `main` SHA plus the channel-specific inputs below | Creates the whole-family promotion/correction PR or publishes an evidence-qualified immutable release through a protected environment | `rc` or stable only |

## Release sequence

1. Normal feature changes merge with Changesets.
2. **Alpha release train** creates or updates the version PR.
3. Merging that version PR publishes all eight packages at one `alpha` coordinate and verifies the registry.
4. Dispatch **Governed RC and stable promotion** with current alpha `expected_main_sha`, `channel=rc`, an
   explicit non-empty executable `profiles` list, and empty evidence SHAs. It creates `rc.1` metadata as a PR;
   `alpha.9` never becomes `rc.10`.
5. After that PR merges, use **Evidence bundle** against the exact RC SHA. Independently reproduce and review
   the bundles, commit accepted Gate A records later, and update `STATUS.md` through governance. Evidence bundle
   is not an alternative release button.
6. Dispatch promotion with the exact current evidence-bearing `main`, `channel=rc`, empty `profiles`, the RC
   `candidate_sha`, and later `gate_record_sha`. The protected `studio-rc` job publishes only if Gate A and all
   authenticity checks pass.
7. If an RC correction is necessary, add patch-only Changesets and dispatch `channel=rc` with both evidence
   SHAs empty. The PR advances `rc.N` to `rc.N+1`; qualify the new immutable candidate again. Feature-sized
   work waits for the next alpha train.
8. After the published RC passes Gate B, dispatch `channel=stable` with its candidate/evidence pair to create
   the deterministic stable PR. After merge, repeat with `expected_main_sha` equal to that stable commit to
   publish through `studio-stable` and npm `latest`.
9. The first Changeset after stable automatically enters a new alpha prerelease train. Until then, the alpha
   workflow reports `inactive` and succeeds. A patch after `0.1.0` opens `0.1.1-alpha.0`; subsequent version
   PRs increment the numeric alpha counter while Changeset intent controls the next semantic base.

Only the publish job can read `NPM_TOKEN`. Every publish rechecks the exact current `main`, immutable ancestry,
release claims, eight manifests/internal pins/lockfile, gate records and bundle authenticity; then it verifies
npm integrity/provenance, repairs the channel tag, and creates or verifies the source-bound GitHub release.
Partial publication and token-rotation retries are idempotent. Re-dispatch with the same immutable candidate and
evidence and the exact current `main` SHA; stale inputs fail closed.

Administrators must protect the `studio-rc` and `studio-stable` environments with required reviewers and a
`main`-only deployment policy. The workflow declaration names those boundaries; repository settings enforce
the human authorization. `NPM_TOKEN` needs publish and dist-tag rights for the `@kumwe` scope.

Today Gate A is not assessed and Gate B is blocked, so the workflow can prepare an RC but cannot truthfully
publish RC or stable. Sample evidence and target-only profiles never satisfy it.
