# Studio workflows

The workflows have distinct responsibilities and one release road. Running a qualification workflow never
publishes a package, and publishing a package never manufactures a gate decision.
The canonical contributor and release sequence is [`CONTRIBUTING.md`](../../CONTRIBUTING.md); this file is the
Actions-screen synopsis.

| Workflow                                             | Trigger                                                                 | Purpose                                                                                                                              | Publishes?                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| **CI** (`ci.yml`)                                    | Pull requests and pushes                                                | Repository quality, security, packaging, and browser checks                                                                          | No                          |
| **Alpha release train** (`version-packages.yml`)     | Every push to `main`, or manual recovery for exact `main`               | Maintains the coordinated Changesets alpha PR, publishes a merged alpha, pauses during RC, and opens the next train after stable     | `alpha` only                |
| **Evidence bundle** (`evidence-bundle.yml`)          | Manual, exact candidate SHA                                             | Produces class-scoped pending artifacts; authenticated intake, reproduction, review, and gate acceptance remain separate             | No                          |
| **Governed RC and stable promotion** (`release.yml`) | Manual, exact current `main` SHA plus the channel-specific inputs below | Creates promotion/correction PRs, quarantines an RC for evidence, or opens an evidence-qualified official channel through protection | Quarantine, `rc`, or stable |

## Release sequence

1. Normal feature changes merge with Changesets.
2. **Alpha release train** creates or updates the version PR.
3. Merging that version PR makes the next run publish all eight approved tarballs at one `alpha` coordinate and
   verify the registry. The Changesets action only maintains version PRs; it cannot publish packages, push Git
   tags, or create GitHub releases.
4. Dispatch **Governed RC and stable promotion** with current alpha `expected_main_sha`, `channel=rc`, empty
   `profiles` (which selects the exact fixed nine) or the exact fixed nine, and empty evidence SHAs. It creates
   `rc.1` metadata as a PR; any `alpha.N` resets to `rc.1` rather than carrying its counter forward. A blank
   first-RC profile input never means zero profiles or an inferred subset.
5. After that PR merges, dispatch promotion again at the exact RC `main` SHA with empty profiles and evidence
   SHAs. The protected `studio-rc` job publishes only to its `studio-stage-*` quarantine tag and proves exact
   provenance plus a credential-free clean npm install. It leaves `rc`, `latest`, Git tags, and GitHub releases
   untouched, and retains the staging tags for Gate A evidence.
6. Use **Evidence bundle** against that exact RC SHA. It creates a class-scoped pending bundle: executable
   classes run even when a criterion also needs manual/external input, and unavailable classes remain explicit
   and unclaimed. Add signed manual/external input only with
   `npm run evidence:assemble -- --pending <bundle-directory> --intake <intake.json>`; the closed assembler
   rechecks exact identities, artifacts, checksums, signatures, and the registered verifier without receiving
   credentials or fabricating human proof. Gate A criterion 13 necessarily runs the registered staged-registry
   install proof but still needs its independent manual class. Every class is required for acceptance.
   Independently reproduce and review the assembled bundles, commit accepted Gate A records later, and update
   `STATUS.md` through governance. Evidence bundle is not an alternative release button.
7. Dispatch promotion with the exact current evidence-bearing `main`, `channel=rc`, empty `profiles`, the RC
   `candidate_sha`, and later `gate_record_sha`. The protected `studio-rc` job publishes only if Gate A and all
   authenticity checks pass. It requires the full staged family to exist, then moves `rc`, creates/verifies the
   exact GitHub release, and removes the quarantine tag after success.
8. If an RC correction is necessary, add patch-only Changesets and dispatch `channel=rc` with both evidence
   SHAs empty. The PR advances `rc.N` to `rc.N+1`; qualify the new immutable candidate again. Feature-sized
   work waits for the next alpha train.
9. After the published RC passes Gate B, dispatch `channel=stable` with its candidate/evidence pair to create
   the deterministic stable PR. After merge, repeat with `expected_main_sha` equal to that stable commit to
   publish through `studio-stable` and npm `latest`.
10. The first Changeset after stable automatically enters a new alpha prerelease train. Until then, the alpha
    workflow reports `inactive` and succeeds. A patch after `0.1.0` opens `0.1.1-alpha.0`; subsequent version
    PRs increment the numeric alpha counter while Changeset intent controls the next semantic base.

The alpha workflow reads `NPM_TOKEN` from a repository Actions secret or an organization Actions secret whose
access includes `kumwe/studio`; it has no environment boundary, so an environment-only secret cannot reach it.
The protected RC/stable stage and official-publish jobs instead read the secret from `studio-rc` or
`studio-stable`. Actions variables do not satisfy a `secrets.NPM_TOKEN` lookup. Before authentication the
publishing jobs pack all eight packages once, retain those
exact `.tgz` files, and record their integrity and shasum. Every publish rechecks the exact current `main`,
immutable ancestry, release claims, eight manifests/internal pins/lockfile, latest gate records and STATUS, and
bundle authenticity. Missing packages upload directly from the retained tarballs under a version-scoped
`studio-stage-*` tag. An already-present registry version is skipped only when its bits equal the approved local
tarball and it has source-bound provenance; arbitrary integrity metadata is a hard failure. Only after all eight
packages verify does the job repair `alpha`, `rc`, or `latest`, verify the complete family again, create or
verify the exact GitHub release where applicable, and remove its staging tag. Alpha never assigns `latest`; it
removes only legacy prerelease `latest` drift and preserves a stable `latest`. Partial publication and
token-rotation retries are idempotent. Re-dispatch with the same immutable candidate and evidence and the exact
current `main` SHA; a superseded candidate, revoked gate, stale input, conflicting staging tag, or malformed
existing release fails closed.

| Administrative operation   | Required `NPM_TOKEN` location                                                       | Credential boundary                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Alpha publish or recovery  | Repository Actions secret, or organization Actions secret granted to `kumwe/studio` | Merged-`main` alpha publish job; variables and environment-only secrets do not work |
| RC quarantine/publication  | Protected `studio-rc` environment secret                                            | Approved RC stage/publication jobs only                                             |
| Stable publication         | Protected `studio-stable` environment secret                                        | Approved stable publication job only                                                |
| Pull request / preparation | None                                                                                | Never expose npm credentials to PR, versioning, or promotion-preparation jobs       |

Administrators must protect the `studio-rc` and `studio-stable` environments with required reviewers and a
`main`-only deployment policy. The workflow declaration names those boundaries; repository settings enforce
the human authorization. They must also configure a default-branch protection rule or ruleset for `main` that
requires pull-request review and the repository CI checks before governed RC/stable operation. Workflow YAML
cannot create either repository rule. `NPM_TOKEN` needs publish and dist-tag rights for the `@kumwe` scope.

Today Gate A is not assessed and Gate B is blocked, so the workflow can prepare and quarantine an RC for
evidence but cannot truthfully open the official `rc` channel or publish stable. Sample evidence and
target-only profiles never satisfy it.
