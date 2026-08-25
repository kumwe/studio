# Studio workflows

The workflows have distinct responsibilities. Running a qualification workflow never publishes a package,
and publishing an alpha never records a gate decision.
The canonical contributor and release sequence is [`CONTRIBUTING.md`](../../CONTRIBUTING.md); this file is the
Actions-screen synopsis.

| Workflow                                                     | Trigger                                                                     | Purpose                                                                                                                           | Publishes?        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **CI** (`ci.yml`)                                            | Pull requests and pushes                                                    | Repository quality, security, packaging, and browser checks                                                                       | No                |
| **Alpha release train** (`version-packages.yml`)             | Every push to `main`, or a manual recovery dispatch for an exact `main` SHA | Maintains the Changesets version PR; after that PR merges, publishes the coordinated eight-package alpha and verifies it from npm | Yes, `alpha` only |
| **Evidence bundle** (`evidence-bundle.yml`)                  | Manual, exact candidate SHA                                                 | Produces a pending evidence artifact for named criteria and profiles                                                              | No                |
| **Release readiness (publication disabled)** (`release.yml`) | Manual, exact candidate and later evidence SHAs                             | Exercises the strict draft Gate B evidence guard                                                                                  | No                |

## Release sequence

1. Normal feature changes merge with Changesets.
2. **Alpha release train** creates or updates the version PR.
3. Merging that version PR publishes all eight packages at one `alpha` coordinate and verifies the registry.
4. A host pins that exact coordinate and replays the declared conformance corpora.
5. **Evidence bundle** records qualification against immutable candidate commits; independent reproduction and
   human review remain separate required steps.
6. An evidence-backed RC promotion uses its own protected publisher. It must not reuse the alpha tag or treat
   the Gate B readiness workflow as a publisher.
7. Stable publication requires an accepted Gate B record for the exact candidate.

The `beta`, `rc`, and stable publishers remain intentionally unavailable until their documented evidence and
authorization guards are implemented and accepted. This prevents a channel name from overstating the support
or compatibility actually demonstrated by the package set.
