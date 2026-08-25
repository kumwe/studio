# Programme status

**Updated:** 2026-08-26

This file distinguishes repository-verified implementation from accepted evidence and published release
coordinates. A runtime increment may be complete and green in the repository while its programme package,
profile, or release channel remains unaccepted. Accepted work is recorded only against immutable evidence and
release history.

## Current position

| Item                              | Status                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme phase                   | The Version 2 standalone page-builder/runtime wave is merged and repository-verified; coordinated prerelease publication, Core integration, profile completion, and qualification are in progress               |
| Gate A                            | Not assessed; the implemented draft contract corpus has no accepted Gate A evidence bundle                                                                                                                      |
| Gate B                            | Blocked on formal Gate A plus the remaining host, accessibility, performance, recovery, release-material, evidence, and independent-review qualification                                                        |
| Published Studio packages         | The existing registry baseline is staggered alpha and unsupported. Merged `main` defines the complete eight-package family including `renderer-web`, but no new coordinated immutable family has been published |
| Declared conformance profiles     | Eight profiles are declared and executable, including `renderer-web`; `authoring-web` remains a target because its complete real-shell assertion set and manual matrix are not yet present                      |
| Version 2 qualification target    | The eight executable profiles plus target `authoring-web`; the current release record deliberately claims none                                                                                                  |
| Version 3 targets                 | `engine-dart`, `renderer-flutter`, and `authoring-flutter`; their Dart/Flutter work does not block Version 2                                                                                                    |
| Release channel                   | `alpha`. Merged `main` is the intended release-candidate implementation baseline, but not yet an npm `rc`; `beta`/`rc` promotion still needs reproduced evidence and channel authorization                      |
| Supported production hosts        | None                                                                                                                                                                                                            |
| Supported protocol version        | None; runtime uses draft wire `0.1.0-draft.2`, while the first supported contract release candidate is produced by `M2-08`                                                                                      |
| Earliest durable host integration | After Gate A                                                                                                                                                                                                    |
| Current authoritative activity    | Publish one coordinated eight-package coordinate, replay it in Kumwe App and a second host/renderer, complete `authoring-web`, resolve distribution licensing, and assemble independently reproduced evidence   |
| Repository verification baseline  | `97875bca2a858bb68ad33686dbb4b8689f38ef2f`: `npm run check` passes 1,022 Vitest assertions plus 25 Node tests; `npm run check:a11y` passes all 11 Chromium journeys                                             |
| Next package coordinate           | Changesets resolves all eight fixed-group packages to `0.1.0-alpha.9`; the version PR and registry publication have not yet completed                                                                           |

Delivered, repository-verified increments are recorded in [`CHANGELOG.md`](../../CHANGELOG.md) and in the
implementation board below. A changelog entry means the behaviour exists and passes the check lane on a
clean clone; it does not mean a work package is accepted — acceptance still requires a reproduced evidence
bundle and an independent reviewer per the [evidence model](evidence.md).

## Gate summary

| Gate                                  | Criteria | Met | Partial | Not assessed | Decision     |
| ------------------------------------- | -------: | --: | ------: | -----------: | ------------ |
| A — integration contract established  |       14 |   0 |       0 |           14 | Not assessed |
| B — implemented, qualified, shippable |       18 |   0 |       0 |           18 | Blocked      |

Gate counts change only after evidence review. A documentation claim does not move these numbers. The zeroes
in this table are evidence decisions, not an assertion that the runtime is absent; the implementation board
below records what the exact repository baseline already exercises.

## Six-month board

| Month  | Packages        | State        | Immediate dependency                                                    |
| ------ | --------------- | ------------ | ----------------------------------------------------------------------- |
| 1      | `M1-01`–`M1-06` | Active       | Reviewer reproduction of the delivered evidence and baseline lanes      |
| 2      | `M2-01`–`M2-08` | Active       | Remaining contract scope below, then accepted Month 1 packages          |
| Gate A | 14 criteria     | Not assessed | Accepted `M2-08` evidence bundle                                        |
| 3      | `M3-01`–`M3-05` | Active       | Implementation running ahead of Gate A as unaccepted scaffolding        |
| V3     | `M3-06`         | Planned      | Ratified Version 3 Dart profile and the Version 2 DOM-free core         |
| 4      | `M4-01`–`M4-05` | Active       | Relevant Version 2 Month 3 packages                                     |
| V3     | `M4-06`         | Planned      | `M3-06` and the Version 3 Flutter authoring profile                     |
| 5      | `M5-01`–`M5-06` | Active       | Media/rich-text/catalog runtime landed; ecosystem and host proof remain |
| 6      | `M6-01`–`M6-06` | Planned      | Implemented Version 2 web, generic-host, and Kumwe App profiles         |
| Gate B | 18 criteria     | Blocked      | Accepted `M6-06` evidence bundle                                        |

## Implementation board

Repository-verified increments per work package, with the scope that still blocks acceptance. States use
the programme vocabulary; `evidence-review` here means the implementation is complete against its
acceptance list and awaits an evidence bundle plus an independent reviewer.

| Package | State           | Delivered (see changelog)                                                                                                                                                   | Still blocking acceptance                                                                                  |
| ------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `M1-04` | evidence-review | Stable criterion registry; strict bundle/gate validator; safe complete bundle lane                                                                                          | First real bundle; independent human reproduction and durable retention                                    |
| `M1-05` | evidence-review | Secret scan, audit, SBOM, release train, changeset gate                                                                                                                     | Reviewer reproduction; first coordinated eight-package publish not yet exercised                           |
| `M1-06` | evidence-review | Registry with 30 obligations, zero open; automated WCAG lane                                                                                                                | Reviewer reproduction                                                                                      |
| `M2-01` | evidence-review | Full schema list, declaration payloads, property-profile meta-schema and vectors                                                                                            | Reviewer reproduction; independent cross-runtime profile replay                                            |
| `M2-02` | evidence-review | Sixteen-command subset; the Gate A vocabulary is complete                                                                                                                   | Reviewer reproduction                                                                                      |
| `M2-03` | evidence-review | Runtime, authoring SDK, lifecycle fixtures across six canonical kinds                                                                                                       | Reviewer reproduction                                                                                      |
| `M2-04` | evidence-review | Taxonomy, ports, negotiation, handshake, published transport binding                                                                                                        | Reviewer reproduction                                                                                      |
| `M2-05` | evidence-review | Grammar, wire upload lifecycle, conformance corpus, policy vectors                                                                                                          | Reviewer reproduction                                                                                      |
| `M2-06` | active          | Canonical serialization with its portable corpus, digest manifest                                                                                                           | Generated TypeScript models and canonical round-trip                                                       |
| `M2-07` | evidence-review | Threat registry closed: 14 of 14 enforced with recorded residuals                                                                                                           | Reviewer reproduction                                                                                      |
| `M3-01` | evidence-review | Session, selection, migrations, canonical form; generative lanes                                                                                                            | Reviewer reproduction against the Version 2 TypeScript profile                                             |
| `M3-02` | evidence-review | Transactional owner-aware runtime with immutable generations                                                                                                                | Reviewer reproduction; lifecycle fixtures for non-block contributions                                      |
| `M3-03` | evidence-review | Testbed, HTTP adapter, and single-exchange plus stateful host corpora                                                                                                       | Independent replay and reviewer reproduction                                                               |
| `M3-04` | evidence-review | Responder, handshake, geometry, attempt-safe cancellation, portable identity corpus                                                                                         | Reviewer reproduction                                                                                      |
| `M3-05` | active          | All declaration kinds schema-backed, incl. design vocabulary, migrations                                                                                                    | Kumwe App's Gate A contribution contract; its host adapter at Gate B                                       |
| `M4-02` | evidence-review | Section/stack/grid/columns, responsive presentation intent, recipes, two-theme semantic resolution and browser 4→2→1 reflow                                                 | Independent second-renderer replay and reviewer reproduction                                               |
| `M4-03` | evidence-review | Five modes, total table, mode-boundary vectors, per-slot markers                                                                                                            | Reviewer reproduction                                                                                      |
| `M4-01` | active          | Full catalog/pattern palette, host-bound preview, measured SVG visual canvas, live controls, two-way selection and degraded fallback                                        | Dedicated framed-CSP policy; complete `authoring-web` adapter/matrix; independent reviewer reproduction    |
| `M4-04` | active          | Read-only model/resource sessions; exact field/control projection; portable binding corpus; policy-filtered resource browser                                                | Published Kumwe App AP-2/resource replay; independent second-host reproduction                             |
| `M4-05` | evidence-review | Measured reorder/reparent with identical outline/palette commands; tested no-op cancellation                                                                                | Evidence bundle; manual AT/touch/zoom/RTL matrix; reviewer reproduction                                    |
| `M5-01` | active          | Media field controller and shell controls cover browse/search/page/select/replace, paste/drop/upload, metadata, progress, cancellation, retry, ordering and orphan recovery | Real persistent host adapter, hostile-media and supported-browser evidence                                 |
| `M5-02` | active          | Private Editor.js adapter, first-party rich-text tools, Markdown and safe-HTML codecs, renderer projection, strict-CSP sink-free surface                                    | Full paste/browser/server-renderer matrix; independent evidence; Kumwe App distribution-license decision   |
| `M5-03` | evidence-review | Standalone 45-block catalog, ten patterns, schema-valid insertion defaults, complete semantic renderer, guided controls and exhaustive renderer corpus                      | Independent PHP/Twig or second-renderer replay; complete `authoring-web` profile and reviewer reproduction |
| `M3-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                                                                                          | Ratified `engine-dart` profile, generated models, cross-runtime replay                                     |
| `M4-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                                                                                          | `M3-06` and native Flutter authoring/renderer profiles                                                     |

### Latest state transition

| Package / integration item | Implementation commit                      | Evidence bundle        | New state       | Blocking item                                                                                                                                           | Reviewer   |
| -------------------------- | ------------------------------------------ | ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `M4-01` / `ST-4`, `ST-7`   | `97875bca2a858bb68ad33686dbb4b8689f38ef2f` | none — not yet created | active          | Complete the real-shell `authoring-web` assertion set, framed-host CSP proof, and manual AT/touch/zoom/RTL matrix                                       | unassigned |
| `M4-02` / `ST-6`           | `97875bca2a858bb68ad33686dbb4b8689f38ef2f` | none — not yet created | evidence-review | Replay the responsive composition semantics in an independent renderer and reproduce the browser evidence                                               | unassigned |
| `M4-04` / `ST-8`           | `97875bca2a858bb68ad33686dbb4b8689f38ef2f` | none — not yet created | active          | Replay the exact published package family through Kumwe App AP-2/resource adapters and an independent second host                                       | unassigned |
| `M5-01`–`M5-03`            | `97875bca2a858bb68ad33686dbb4b8689f38ef2f` | none — not yet created | active          | Publish the family, prove real host media and PHP/Twig delivery, complete authoring qualification, resolve license distribution, and reproduce evidence | unassigned |

## Downstream integration commitments

[Kumwe App's](https://github.com/kumwe/app) programme now carries Studio as a named Version 2 deliverable, split across its two gates, and
that split places dated obligations on this repository. Its Gate A criterion freezes the contract an
extension declares composition contributions through, so the contribution kinds, the authoring SDK's
declaration shapes and the schema profile that bounds a contributed block's properties are what a host
freezes against — a change to those shapes after that freeze is a breaking change to published
extensions, not merely to this contract. Its Gate B criterion consumes the host ports, the canonical
corpus, the media policy vectors and the preview channel as they stand.

`M3-05` therefore tracks a real external dependency rather than a hypothetical one. Its acceptance is
unchanged: Kumwe App implements additive draft host ports without replacing its current editors, and this
repository ships no Kumwe App-specific code. What changed is that the consuming programme has a gate date,
so a contract change here is measured against it.

## Next dependency-ordered actions

The candidate tree now contains the Studio-side page-building runtime rather than only contracts: all eight
packages, 45 first-party blocks, ten patterns, Editor.js behind a private canonical adapter, media/resource
controls, the measured canvas, and the semantic renderer with exhaustive portable vectors. Repository checks
prove that implementation snapshot; they do not publish it or accept a profile. The remaining actions are:

1. Recover the alpha release workflow for merged baseline
   `97875bca2a858bb68ad33686dbb4b8689f38ef2f`, create and merge its Changesets version PR, and publish the
   predicted `0.1.0-alpha.9` eight-package coordinate. The version command must advance every package to the same coordinate, regenerate
   all three release-record copies, pack/install the family without workspace links, and pass the registry
   post-publication verifier. Kumwe App must not pin a workspace tree or a subset of packages in its place.
2. Atomically pin that exact record and corpus digest in Kumwe App, then replay the host, preview, media,
   binding, property-schema, and renderer corpora through its real Joomla/Mezzio/Doctrine/Twig adapters. App
   security, persistence, media, workflow, extension, and renderer behavior remains host-owned.
3. Complete the selector-neutral `authoring-web` assertion set and its production-shell browser adapter,
   including keyboard/pointer/explicit-control equivalence, save/conflict/recovery, media and resource
   failures, touch, RTL, 400% zoom/reflow, reduced motion, and manual assistive-technology evidence.
4. Replay `renderer-web` in Kumwe App's PHP/Twig path and an unrelated renderer, and replay the executable
   host/schema/binding profiles independently. Resolve the recorded Editor.js/Kumwe App distribution-license
   decision before claiming an affected integrated release.
5. Generate the first real content-addressed evidence bundles, obtain the required independent human reviews,
   ratify Gate A, and only then open an evidence-backed `beta` or immutable `rc` channel. The merged runtime
   baseline is the intended candidate implementation, but it is not itself an `rc` publication.

## Road to beta

The [release policy](../governance/releases.md) defines `beta` as a feature-complete candidate for a
declared profile, with contract changes treated as release blockers. Three things gate the promotion,
and only the first is now in place:

1. **A declared, executable profile.** Done for eight Version 2 boundaries:
   [`studio.profile/host-baseline-v2`](../contracts/conformance-profiles.md) adds the stateful sequence
   assertion set without changing `host-baseline`. `engine-core`, `media-policy`, `preview-identity-v1`, and
   `schema-property`, `binding-projection-v1`, and `renderer-web` are declared against the command, media,
   preview-identity, property-schema, and read-only model-binding corpora. The renderer and authoring
   packages are implemented, but `authoring-web` remains a target until its complete assertion set exists.
   No package may advertise any executable profile before accepted claim evidence names it.
2. **Feature-completeness against the profile a package advertises.** The reference host is complete
   against the executable v2 assertion set in the repository lane; the profile documents the two
   idempotency scope collision drills it does not yet prove portably. The standalone catalog, responsive
   layout, renderer, rich text, media and resource-control implementations are present; authoring-package
   feature-completeness still requires the complete `authoring-web` corpus, real host lifecycle lanes, and
   supported manual accessibility matrix.
3. **An evidence-backed claim.** A profile claim names the profile, the corpus version, and the commit
   it was replayed at, reproduced by an independent reviewer under the [evidence model](evidence.md).
   No evidence bundle has been reproduced yet, so no claim can currently be made.

Beta is therefore not blocked on Gate A ratification, but it is blocked on the same evidence discipline:
the fastest honest route is to publish the coherent eight-package family, independently replay its executable
profiles, reproduce an acceptable evidence bundle, and promote only the packages whose claims that bundle
actually supports. An `rc` label is stricter, not a shortcut around that sequence.

## Programme risks under active control

| Risk                                               | Consequence                                                   | Programme control                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Visual UI drives the protocol                      | Other hosts and future Flutter clients wrap browser internals | DOM-free core, language-neutral schemas, canonical fixtures, and profile-specific parity proof            |
| Contract freezes before real integration discovery | Hosts need incompatible changes immediately after Gate A      | Generic and Kumwe App mapping reviews plus executable preview/media/persistence spikes before `M2-08`     |
| Six-month tempo weakens qualification              | A feature-rich but unsafe release is promoted                 | Dates never override criteria; Gate B requires independent evidence and cannot waive mandatory controls   |
| Theme freedom becomes stored CSS/code              | Security, portability, and template switching fail            | Bounded tokens/recipes, trusted renderers, closed schemas, and malicious-input fixtures                   |
| Extension removal breaks old documents             | Content loss or public failures                               | Owner-aware registries, unresolved-node representation, declared fallback/migration, lifecycle tests      |
| Media scope is duplicated in every host            | Broken uploads, privacy, inconsistent asset identity          | Studio owns UX/port; host owns authoritative media service; stable media-reference contract               |
| TypeScript and Dart drift in Version 3             | Flutter becomes a second incompatible product                 | Generated models, canonical vectors, Version 3 conformance profiles, and release compatibility matrix     |
| Kumwe App-specific shortcuts enter public packages | Generic reuse becomes fictional                               | No Kumwe App imports in Studio packages; second-host Gate B proof; Kumwe App logic remains in its adapter |
| Live preview weakens CSP or authorization          | Authoring session or protected data can leak                  | Same-origin/origin-pinned handshake, short-lived preview grants, authenticated render, negative CSP tests |
| Rich-text/editor HTML becomes canonical            | XSS, migration, and server-rendering failures                 | Bounded structured document, paste normalization, host sanitization, and renderer conformance             |

## Status maintenance

Every status update names the work-package identifier, exact commit, evidence-bundle identifier, new state,
blocking item if any, and reviewer. State changes without those fields are invalid. Accepted work is moved
from this active board into the release/evidence index rather than left as an unexplained tick mark.
