# Programme status

**Updated:** 2026-08-26

This file distinguishes repository-verified implementation from accepted evidence and published release
coordinates. A runtime increment may be complete and green in the repository while its programme package,
profile, or release channel remains unaccepted. Accepted work is recorded only against immutable evidence and
release history.

## Current position

| Item                              | Status                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme phase                   | The Version 2 standalone page-builder/runtime wave is merged and repository-verified; coordinated prerelease publication, Core integration, profile completion, and qualification are in progress                                                                                                                                                                                              |
| Gate A                            | Not assessed; the implemented draft contract corpus has no accepted Gate A evidence bundle                                                                                                                                                                                                                                                                                                     |
| Gate B                            | Blocked on formal Gate A plus the remaining host, accessibility, performance, recovery, release-material, evidence, and independent-review qualification                                                                                                                                                                                                                                       |
| Published Studio packages         | npm remains an unsupported staggered baseline: seven of eight package names exist across `0.1.0-alpha.6`–`.8`, while `@kumwe/studio-renderer-web` is absent. Main's coordinated `alpha.9` metadata was not published; generated PR [#39](https://github.com/kumwe/studio/pull/39) advances the whole family to `0.1.0-alpha.10` before the authenticated retry                                 |
| Declared conformance profiles     | Eight profiles are declared and executable, including `renderer-web`; `authoring-web` remains a target because its complete real-shell assertion set and manual matrix are not yet present                                                                                                                                                                                                     |
| Version 2 qualification target    | The eight executable profiles plus target `authoring-web`; the current release record deliberately claims none                                                                                                                                                                                                                                                                                 |
| Version 3 targets                 | `engine-dart`, `renderer-flutter`, and `authoring-flutter`; their Dart/Flutter work does not block Version 2                                                                                                                                                                                                                                                                                   |
| Release channel                   | `alpha`. The implemented road is `alpha` → frozen RC quarantine → evidence-qualified `rc` → stable; quarantine is a nonofficial proof tag, and `beta` remains a conceptual policy tier with no separate workflow. The official `rc` channel still needs reproduced evidence and authorization                                                                                                  |
| Supported production hosts        | None                                                                                                                                                                                                                                                                                                                                                                                           |
| Supported protocol version        | None; runtime uses draft wire `0.1.0-draft.2`, while the first supported contract release candidate is produced by `M2-08`                                                                                                                                                                                                                                                                     |
| Earliest durable host integration | After Gate A                                                                                                                                                                                                                                                                                                                                                                                   |
| Current authoritative activity    | Complete the Gate A TypeScript corpus increment, let generated PR [#39](https://github.com/kumwe/studio/pull/39) absorb its Changeset, merge the reviewed whole-family `alpha.10` plan, publish after the npm-token rotation, advance App [PR #114](https://github.com/kumwe/app/pull/114) against that exact family, complete `authoring-web`, and assemble independently reproduced evidence |
| Repository verification baseline  | `d879252664d4752de06b83816f2d86ecf580ccd7`: PR #37's governed release controls and PR #38's renderer/rich-text corrections are merged on `main`; generated version PR [#39](https://github.com/kumwe/studio/pull/39) is based on this exact release-controls tree                                                                                                                              |
| Next package coordinate           | `0.1.0-alpha.10` through generated whole-family PR [#39](https://github.com/kumwe/studio/pull/39), refreshed to consume every pending Changeset before merge. Publication and verification start only from the exact merged `main`; the unpublished `alpha.9` metadata and staggered registry packages are not recovery candidates                                                             |

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

| Package | State           | Delivered (see changelog)                                                                                                                                                                                                                                                                                                   | Still blocking acceptance                                                                                                 |
| ------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `M1-04` | evidence-review | Stable criterion registry; strict bundle/gate validator; safe complete bundle lane                                                                                                                                                                                                                                          | First real bundle; independent human reproduction and durable retention                                                   |
| `M1-05` | evidence-review | Secret scan, audit, SBOM, governed alpha/RC/stable release road, retry-safe staging, coordinated `alpha.9` metadata, and generated `alpha.10` PR #39                                                                                                                                                                        | Reviewer reproduction; merge the refreshed version PR, then complete the first coordinated eight-package registry publish |
| `M1-06` | evidence-review | Registry with 30 obligations, zero open; automated WCAG lane                                                                                                                                                                                                                                                                | Reviewer reproduction                                                                                                     |
| `M2-01` | evidence-review | Full schema list, declaration payloads, property-profile meta-schema and vectors                                                                                                                                                                                                                                            | Reviewer reproduction; independent cross-runtime profile replay                                                           |
| `M2-02` | evidence-review | Sixteen-command subset; the Gate A vocabulary is complete                                                                                                                                                                                                                                                                   | Reviewer reproduction                                                                                                     |
| `M2-03` | evidence-review | Runtime, authoring SDK, lifecycle fixtures across six canonical kinds                                                                                                                                                                                                                                                       | Reviewer reproduction                                                                                                     |
| `M2-04` | evidence-review | Taxonomy, ports, negotiation, handshake, published transport binding                                                                                                                                                                                                                                                        | Reviewer reproduction                                                                                                     |
| `M2-05` | evidence-review | Grammar, wire upload lifecycle, conformance corpus, policy vectors                                                                                                                                                                                                                                                          | Reviewer reproduction                                                                                                     |
| `M2-06` | evidence-review | Canonical serialization; 47 generated TypeScript roots and 147 reusable definitions bound to exact manifest/epoch/revision/generator metadata; all 236 positive documents schema-validated/round-tripped; 234 exact-root literal assignments plus two explicit compiler-depth cases; deterministic cross-locale drift guard | First immutable Gate A evidence bundle, independent human reproduction, and review                                        |
| `M2-07` | evidence-review | Threat registry closed: 14 of 14 enforced with recorded residuals                                                                                                                                                                                                                                                           | Reviewer reproduction                                                                                                     |
| `M3-01` | evidence-review | Session, selection, migrations, canonical form; generative lanes                                                                                                                                                                                                                                                            | Reviewer reproduction against the Version 2 TypeScript profile                                                            |
| `M3-02` | evidence-review | Transactional owner-aware runtime with immutable generations                                                                                                                                                                                                                                                                | Reviewer reproduction; lifecycle fixtures for non-block contributions                                                     |
| `M3-03` | evidence-review | Testbed, HTTP adapter, and single-exchange plus stateful host corpora                                                                                                                                                                                                                                                       | Independent replay and reviewer reproduction                                                                              |
| `M3-04` | evidence-review | Responder, handshake, geometry, attempt-safe cancellation, portable identity corpus                                                                                                                                                                                                                                         | Reviewer reproduction                                                                                                     |
| `M3-05` | active          | All declaration kinds schema-backed, incl. design vocabulary, migrations                                                                                                                                                                                                                                                    | Kumwe App's Gate A contribution contract; its host adapter at Gate B                                                      |
| `M4-02` | evidence-review | Section/stack/grid/columns, responsive presentation intent, recipes, two-theme semantic resolution and browser 4→2→1 reflow                                                                                                                                                                                                 | Independent second-renderer replay and reviewer reproduction                                                              |
| `M4-03` | evidence-review | Five modes, total table, mode-boundary vectors, per-slot markers                                                                                                                                                                                                                                                            | Reviewer reproduction                                                                                                     |
| `M4-01` | active          | Full catalog/pattern palette, host-bound preview, measured SVG visual canvas, live controls, two-way selection and degraded fallback                                                                                                                                                                                        | Dedicated framed-CSP policy; complete `authoring-web` adapter/matrix; independent reviewer reproduction                   |
| `M4-04` | active          | Read-only model/resource sessions; exact field/control projection; portable binding corpus; policy-filtered resource browser                                                                                                                                                                                                | Published Kumwe App AP-2/resource replay; independent second-host reproduction                                            |
| `M4-05` | evidence-review | Measured reorder/reparent with identical outline/palette commands; tested no-op cancellation                                                                                                                                                                                                                                | Evidence bundle; manual AT/touch/zoom/RTL matrix; reviewer reproduction                                                   |
| `M5-01` | active          | Media field controller and shell controls cover browse/search/page/select/replace, paste/drop/upload, metadata, progress, cancellation, retry, ordering and orphan recovery                                                                                                                                                 | Real persistent host adapter, hostile-media and supported-browser evidence                                                |
| `M5-02` | active          | Private Editor.js adapter, first-party rich-text tools, Markdown and safe-HTML codecs, renderer projection, strict-CSP sink-free surface                                                                                                                                                                                    | Full paste/browser/server-renderer matrix; independent evidence; Kumwe App distribution-license decision                  |
| `M5-03` | evidence-review | Standalone 45-block catalog, ten patterns, schema-valid insertion defaults, complete semantic renderer, guided controls and exhaustive renderer corpus                                                                                                                                                                      | Independent PHP/Twig or second-renderer replay; complete `authoring-web` profile and reviewer reproduction                |
| `M3-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                                                                                                                                                                                                                                          | Ratified `engine-dart` profile, generated models, cross-runtime replay                                                    |
| `M4-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                                                                                                                                                                                                                                          | `M3-06` and native Flutter authoring/renderer profiles                                                                    |

### Latest state transition

| Package / integration item              | Implementation commit                      | Evidence bundle        | New state       | Blocking item                                                                                                                                                                                             | Reviewer   |
| --------------------------------------- | ------------------------------------------ | ---------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `M2-06` / `gate-a/09-typescript-corpus` | `4a0854a3507da52b789c4ba5cb4c05a67b41b4d8` | none — not yet created | evidence-review | Reproduce the cross-locale generated-source drift check, 234 exact-root assignments, two named `TS2321` depth boundaries, and 236-document schema-validated JSON round-trip in an immutable Gate A bundle | unassigned |
| `M4-01` / `ST-4`, `ST-7`                | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | active          | Complete the real-shell `authoring-web` assertion set, framed-host CSP proof, and manual AT/touch/zoom/RTL matrix                                                                                         | unassigned |
| `M4-02` / `ST-6`                        | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | evidence-review | Replay the responsive composition semantics in an independent renderer and reproduce the browser evidence                                                                                                 | unassigned |
| `M4-04` / `ST-8`                        | `97875bca2a858bb68ad33686dbb4b8689f38ef2f` | none — not yet created | active          | Replay the exact published package family through Kumwe App AP-2/resource adapters and an independent second host                                                                                         | unassigned |
| `M5-01`–`M5-03`                         | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | active          | Publish the family, prove real host media and PHP/Twig delivery, complete authoring qualification, resolve license distribution, and reproduce evidence                                                   | unassigned |

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
repository ships no Kumwe App-specific code. App [PR #114](https://github.com/kumwe/app/pull/114) is the
current integration branch and remains gated on an exact published Studio family rather than a workspace
snapshot. The consuming programme has a gate date, so a contract change here is measured against it.

## Next dependency-ordered actions

The candidate tree now contains the Studio-side page-building runtime rather than only contracts: all eight
packages, 45 first-party blocks, ten patterns, Editor.js behind a private canonical adapter, media/resource
controls, the measured canvas, and the semantic renderer with exhaustive portable vectors. Repository checks
prove that implementation snapshot; they do not publish it or accept a profile. The remaining actions are:

1. Let generated version PR [#39](https://github.com/kumwe/studio/pull/39) consume every pending Changeset and
   keep the whole family at its reviewed `0.1.0-alpha.10` coordinate. After that PR merges, the next exact
   current-`main` run must publish the retained approved tarballs under
   the quarantine tag, verify all eight package bits and provenance, repair `alpha`, and pass final registry
   verification. The rotated `NPM_TOKEN` is used only on this publication path. Kumwe App must not pin the
   unpublished `alpha.9` metadata, the existing staggered registry packages, a workspace tree, or a subset of
   packages in its place.
2. Advance App [PR #114](https://github.com/kumwe/app/pull/114) by atomically pinning that exact record and
   corpus digest, then replay the host, preview, media,
   binding, property-schema, and renderer corpora through its real Joomla/Mezzio/Doctrine/Twig adapters. App
   security, persistence, media, workflow, extension, and renderer behavior remains host-owned.
3. Complete the selector-neutral `authoring-web` assertion set and its production-shell browser adapter,
   including keyboard/pointer/explicit-control equivalence, save/conflict/recovery, media and resource
   failures, touch, RTL, 400% zoom/reflow, reduced motion, and manual assistive-technology evidence.
4. Replay `renderer-web` in Kumwe App's PHP/Twig path and an unrelated renderer, and replay the executable
   host/schema/binding profiles independently. Resolve the recorded Editor.js/Kumwe App distribution-license
   decision before claiming an affected integrated release.
5. Generate and merge the deterministic whole-family RC metadata PR, then run the protected exact-SHA
   quarantine operation. It may publish the frozen `rc.N` bytes only under their coordinate-scoped staging
   tag and must prove npm integrity, source provenance, both embedded records, and a clean credential-free
   install without moving `rc` or creating a GitHub release. Generate the first real content-addressed bundles
   against that exact candidate, obtain the required independent human reviews, ratify Gate A, and only then
   open the official immutable `rc` channel. There is no separate beta workflow.

## Profile qualification and the conceptual beta tier

The [release policy](../governance/releases.md) retains `beta` as a compatibility concept for a
feature-complete candidate against a declared profile. It is not an active publication channel: operators use
the one governed `alpha` → `rc` → stable lifecycle, and the RC guard enforces the same or stricter evidence
discipline. Three things gate that qualification, and only the first is now in place:

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

The conceptual beta tier is therefore not a separate shortcut or button. The active route is to publish the
coherent eight-package alpha family, independently replay its executable profiles, reproduce an acceptable
evidence bundle, and promote the exact family to RC only for claims that bundle supports. An `rc` label is
stricter, not a shortcut around that sequence.

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
