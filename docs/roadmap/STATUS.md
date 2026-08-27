# Programme status

**Updated:** 2026-08-27

This file distinguishes repository-verified implementation from accepted evidence and published release
coordinates. A runtime increment may be complete and green in the repository while its programme package,
profile, or release channel remains unaccepted. Accepted work is recorded only against immutable evidence and
release history.

## Current position

| Item                              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme phase                   | The standalone Blueprint/page-builder primitives are merged and repository-verified. Contextual authoring is now the explicit product target, but coordinated Model/Blueprint/Entry authoring, extension-declared target launch, explicit type-save transactions, and workspace presentation continuity remain implementation work                                                                                                                   |
| Gate A                            | Not assessed; the implemented draft contract corpus has no accepted Gate A evidence bundle                                                                                                                                                                                                                                                                                                                                                           |
| Gate B                            | Blocked on formal Gate A plus the remaining host, accessibility, performance, recovery, release-material, evidence, and independent-review qualification                                                                                                                                                                                                                                                                                             |
| Published Studio packages         | No coordinated `beta`, official `rc`, or stable availability is claimed here. The checked-in `0.1.0-rc.1` family remains immutable abandoned-candidate metadata and MUST NOT be published or presented as the current maturity. The first runtime Changeset on the governed beta lane generates a new coordinated beta family and release record                                                                                                     |
| Declared conformance profiles     | The abandoned `0.1.0-rc.1` release record named all nine proposed Version 2 profile claims. That historical intent is not an accepted or current claim. Beta development resets proposed release claims; the complete fixed set is restored only when all product requirements are repository-verified and a new RC is prepared                                                                                                                      |
| Version 2 qualification target    | One fixed nine-profile RC/stable surface plus the integrated contextual journey in `STUDIO-PROD-015`. Official RC publication remains blocked until the target authoring profile is executable and all required evidence is reproduced and accepted                                                                                                                                                                                                  |
| Version 3 targets                 | `engine-dart`, `renderer-flutter`, and `authoring-flutter`; their Dart/Flutter work does not block Version 2                                                                                                                                                                                                                                                                                                                                         |
| Release channel                   | Product maturity is beta development. Checked-in manifests still preserve the abandoned `0.1.0-rc.1` coordinate until a publishable runtime Changeset causes the generated version PR to reset Changesets into beta. Only generated versioning may change manifests, lockfile, changelogs, prerelease state, or release records. The `rc` and stable channels are blocked                                                                            |
| Supported production hosts        | None                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Supported protocol version        | None; runtime uses draft wire `0.1.0-draft.2`, while the first supported contract release candidate is produced by `M2-08`                                                                                                                                                                                                                                                                                                                           |
| Earliest durable host integration | After Gate A                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Current authoritative activity    | Implement `STUDIO-PROD-001`–`013` against the existing primitives: contextual host-target launch, coordinated Model/Blueprint/Entry state, blank/type hydration, fields plus values, explicit save outcomes, presentation continuity, extension block/field-adapter lifecycle, PHP-authoritative Kumwe App adapters, and zero production Node.js/npm; then complete `authoring-web`, external/manual evidence, reviewer authority, and qualification |
| Repository verification baseline  | `829694efb25374d3b498f2d46856d2c39650728a` produced the coordinated `0.1.0-rc.1` metadata before the contextual product gap was accepted. That commit and coordinate remain immutable provenance, but the RC maturity decision is withdrawn. The current branch builds on its substantial primitives in the beta development lane; Gate A remains **Not assessed** and Gate B remains **Blocked**                                                    |
| Candidate package coordinate      | `0.1.0-rc.1` remains byte-coordinated historical source metadata only. It is abandoned, is not an active release candidate, and MUST NOT be staged or published. The next publishable runtime Changeset generates the beta coordinate across the full eight-package family; never hand-edit or overwrite the historical coordinate                                                                                                                   |

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

## Product-contract implementation gate

This closed inventory is the machine-checked RC maturity guard. `active` means implementation or its required
repository proof is incomplete. `repository-verified` may be recorded only when the exact product requirement
has an executable repository lane and the implementation board names its commit and remaining evidence work.
All 15 rows must be `repository-verified` before the governed workflow will prepare, correct, stage, or publish
an RC. That implementation guard is additional to Gate A and does not turn repository tests into accepted
conformance evidence.

<!-- studio-product-implementation:start -->

| Requirement       | Runtime state | Current proof or blocker                                                     |
| ----------------- | ------------- | ---------------------------------------------------------------------------- |
| `STUDIO-PROD-001` | `active`      | Contextual target launch is not yet repository-verified                      |
| `STUDIO-PROD-002` | `active`      | Blank and reusable-type creation is not yet repository-verified              |
| `STUDIO-PROD-003` | `active`      | One layout fields and values session is not yet repository-verified          |
| `STUDIO-PROD-004` | `active`      | Coordinated reusable type artifacts are not yet repository-verified          |
| `STUDIO-PROD-005` | `active`      | Exact revision hydration is not yet repository-verified                      |
| `STUDIO-PROD-006` | `active`      | Explicit save outcomes are not yet repository-verified                       |
| `STUDIO-PROD-007` | `active`      | Presentation continuity is not yet repository-verified                       |
| `STUDIO-PROD-008` | `active`      | Generic host and extension target declaration is not yet repository-verified |
| `STUDIO-PROD-009` | `active`      | Contextual contribution lifecycle is not yet repository-verified             |
| `STUDIO-PROD-010` | `active`      | Authoritative host operation replay is not yet repository-verified           |
| `STUDIO-PROD-011` | `active`      | Deployed zero-Node host proof is not yet repository-verified                 |
| `STUDIO-PROD-012` | `active`      | Integrated no-handoff journey is not yet repository-verified                 |
| `STUDIO-PROD-013` | `active`      | Integrated keyboard and non-drag parity is not yet repository-verified       |
| `STUDIO-PROD-014` | `active`      | Runtime capability labels remain to be verified with the completed surface   |
| `STUDIO-PROD-015` | `active`      | The complete executable acceptance journey has not landed                    |

<!-- studio-product-implementation:end -->

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

| Package | State           | Delivered (see changelog)                                                                                                                                                                                                                                                                                                   | Still blocking acceptance                                                                                                                                                                                                                  |
| ------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `M1-04` | evidence-review | Stable criterion registry; exact 60-class Gate A/B proof registry; versioned per-role schemas and deterministic internal lifecycle, reference-host, media/rich-text, TypeScript, reproducible-family, SBOM, and staged-registry producers; strict retained-output/candidate binding; protected current-main RC controller   | Activate reviewer keys plus repository/protected digests; authenticate App and other external inputs; perform registered manual/accessibility work; implement Gate B producers; independently reproduce, sign, retain, and accept evidence |
| `M1-05` | active          | Secret scan, audit, SBOM, retry-safe staged publication, immutable `0.1.0-rc.1` history, and fail-closed RC/stable controls                                                                                                                                                                                                 | Exercise the governed beta reset/version/publish lane; complete all 15 product requirements; then prepare a new RC and qualify it through protected evidence and review                                                                    |
| `M1-06` | evidence-review | Registry with 30 obligations, zero open; automated WCAG lane                                                                                                                                                                                                                                                                | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-01` | evidence-review | Full schema list, declaration payloads, property-profile meta-schema and vectors                                                                                                                                                                                                                                            | Reviewer reproduction; independent cross-runtime profile replay                                                                                                                                                                            |
| `M2-02` | evidence-review | Sixteen-command subset; the Gate A vocabulary is complete                                                                                                                                                                                                                                                                   | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-03` | evidence-review | Runtime, authoring SDK, lifecycle fixtures across six canonical kinds                                                                                                                                                                                                                                                       | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-04` | evidence-review | Taxonomy, ports, negotiation, handshake, published transport binding                                                                                                                                                                                                                                                        | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-05` | evidence-review | Grammar, wire upload lifecycle, conformance corpus, policy vectors                                                                                                                                                                                                                                                          | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-06` | evidence-review | Canonical serialization; 47 generated TypeScript roots and 147 reusable definitions bound to exact manifest/epoch/revision/generator metadata; all 236 positive documents schema-validated/round-tripped; 234 exact-root literal assignments plus two explicit compiler-depth cases; deterministic cross-locale drift guard | First immutable Gate A evidence bundle, independent human reproduction, and review                                                                                                                                                         |
| `M2-07` | evidence-review | Threat registry closed: 14 of 14 enforced with recorded residuals                                                                                                                                                                                                                                                           | Reviewer reproduction                                                                                                                                                                                                                      |
| `M3-01` | evidence-review | Session, selection, migrations, canonical form; generative lanes                                                                                                                                                                                                                                                            | Reviewer reproduction against the Version 2 TypeScript profile                                                                                                                                                                             |
| `M3-02` | evidence-review | Transactional owner-aware runtime with immutable generations                                                                                                                                                                                                                                                                | Reviewer reproduction; lifecycle fixtures for non-block contributions                                                                                                                                                                      |
| `M3-03` | evidence-review | Testbed, HTTP adapter, and single-exchange plus stateful host corpora                                                                                                                                                                                                                                                       | Independent replay and reviewer reproduction                                                                                                                                                                                               |
| `M3-04` | evidence-review | Responder, handshake, geometry, attempt-safe cancellation, portable identity corpus                                                                                                                                                                                                                                         | Reviewer reproduction                                                                                                                                                                                                                      |
| `M3-05` | active          | Six canonical contribution kinds are schema-backed, including field adapters, design vocabulary, and migrations                                                                                                                                                                                                             | Canonical extension-declared authoring target plus Kumwe App PHP-authoritative launch/host adapter and independent host replay (`STUDIO-PROD-008`–`010`)                                                                                   |
| `M4-02` | evidence-review | Section/stack/grid/columns, responsive presentation intent, recipes, two-theme semantic resolution and browser 4→2→1 reflow                                                                                                                                                                                                 | Independent second-renderer replay and reviewer reproduction                                                                                                                                                                               |
| `M4-03` | active          | Mode/permission boundary table, Blueprint commands, and headless Model/Entry command primitives                                                                                                                                                                                                                             | One composed Model/Blueprint/Entry session with layout, fields, and values plus explicit entry/type/type-version transactions (`STUDIO-PROD-003`, `004`, `006`)                                                                            |
| `M4-01` | active          | Full catalog/pattern palette, host-bound preview, measured SVG visual canvas, live controls, two-way selection and degraded fallback                                                                                                                                                                                        | Contextual resource launch, fields/values, inline/expanded presentation continuity, dedicated framed-CSP policy, complete `authoring-web`, and manual/accessibility evidence (`STUDIO-PROD-001`, `007`, `013`)                             |
| `M4-04` | active          | Read-only model/resource sessions; exact field/control projection; portable binding corpus; policy-filtered resource browser                                                                                                                                                                                                | Blank/from-type exact hydration, editable fields and Entry values, save-as/update-type transactions, Kumwe App replay, and independent second host (`STUDIO-PROD-002`–`006`)                                                               |
| `M4-05` | evidence-review | Measured reorder/reparent with identical outline/palette commands; tested no-op cancellation                                                                                                                                                                                                                                | Evidence bundle; manual AT/touch/zoom/RTL matrix; reviewer reproduction                                                                                                                                                                    |
| `M5-01` | active          | Media field controller and shell controls cover browse/search/page/select/replace, paste/drop/upload, metadata, progress, cancellation, retry, ordering and orphan recovery                                                                                                                                                 | Real persistent host adapter, hostile-media and supported-browser evidence                                                                                                                                                                 |
| `M5-02` | active          | Private Editor.js adapter, first-party rich-text tools, Markdown and safe-HTML codecs, renderer projection, strict-CSP sink-free surface                                                                                                                                                                                    | Full paste/browser/server-renderer matrix; independent evidence; Kumwe App distribution-license decision                                                                                                                                   |
| `M5-03` | active          | Standalone 45-block catalog, ten patterns, schema-valid insertion defaults, complete semantic renderer, guided controls and exhaustive renderer corpus                                                                                                                                                                      | Extension-targeted block and field-adapter journey, independent PHP/Twig or second-renderer replay, zero-production-Node deployment, complete `authoring-web`, and reviewer reproduction (`STUDIO-PROD-008`–`011`, `015`)                  |
| `M3-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                                                                                                                                                                                                                                          | Ratified `engine-dart` profile, generated models, cross-runtime replay                                                                                                                                                                     |
| `M4-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                                                                                                                                                                                                                                          | `M3-06` and native Flutter authoring/renderer profiles                                                                                                                                                                                     |

### Latest state transition

| Package / integration item                       | Implementation commit                      | Evidence bundle        | New state       | Blocking item                                                                                                                                                                                             | Reviewer   |
| ------------------------------------------------ | ------------------------------------------ | ---------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `M2-06` / `gate-a/09-typescript-corpus`          | `c55a99565aede83fff5b8097cba97d94dc2b006a` | none — not yet created | evidence-review | Reproduce the cross-locale generated-source drift check, 234 exact-root assignments, two named `TS2321` depth boundaries, and 236-document schema-validated JSON round-trip in an immutable Gate A bundle | unassigned |
| `M1-01` / `STUDIO-PROD-001`–`015`                | `829694efb25374d3b498f2d46856d2c39650728a` | none — not yet created | active          | Implement the contextual product gaps without treating the current Blueprint-only composed host profile as completion                                                                                     | unassigned |
| `M4-01` / `STUDIO-PROD-001`, `007`, `013`        | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | active          | Add contextual launch and presentation continuity; complete real-shell `authoring-web`, framed-host CSP, and manual AT/touch/zoom/RTL proof                                                               | unassigned |
| `M4-02` / `STUDIO-PROD-003`                      | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | evidence-review | Replay responsive composition independently, then integrate the same canvas with fields and values                                                                                                        | unassigned |
| `M4-04` / `STUDIO-PROD-002`–`006`                | `97875bca2a858bb68ad33686dbb4b8689f38ef2f` | none — not yet created | active          | Implement exact hydration, editable Entry values, and explicit save transactions; replay through Kumwe App and an independent second host                                                                 | unassigned |
| `M5-01`–`M5-03` / `STUDIO-PROD-008`–`011`, `015` | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | active          | Prove extension target/block/field-adapter lifecycle, real media, PHP/Twig delivery, zero production Node.js/npm, complete authoring qualification, and reproduce evidence                                | unassigned |

## Downstream integration commitments

The [Studio product contract](../product-contract.md), not a copied downstream roadmap, defines the integration
outcome. `M3-05`, `M5-06`, and Kumwe App map the same `STUDIO-PROD-001`–`015` identifiers: extension-declared
contextual launch, separate-but-coordinated Model/Blueprint/Entry state, exact hydration, explicit saves,
presentation continuity, trusted contributions, PHP host authority, zero production Node.js/npm, and one
executable end-to-end journey.

Kumwe App remains a real external dependency, but this repository ships no Kumwe App-specific code. The App
integration must pin an exact published Studio family and replay the public corpus through its real PHP/Twig
adapters. A workspace snapshot, provisional host-private target shape, or TypeScript testbed cannot satisfy that
commitment. The App keeps current editors only as transitional fallback while contextual Studio coverage is
incomplete.

## Next dependency-ordered actions

The candidate tree now contains the Studio-side page-building runtime rather than only contracts: all eight
packages, 45 first-party blocks, ten patterns, Editor.js behind a private canonical adapter, media/resource
controls, the measured canvas, and the semantic renderer with exhaustive portable vectors. Repository checks
prove that implementation snapshot; they do not publish it or accept a profile. The remaining actions are:

1. Implement the missing contextual contract surfaces without weakening current artifact boundaries: extension-
   declared target launch, coordinated Model/Blueprint/Entry session state, blank/from-type hydration, fields
   and values on the canvas, explicit item/new-type/type-version saves, and presentation continuity.
2. Bind those surfaces through Kumwe App's PHP application services and PHP HTTP endpoints. Admit target, block,
   and field-adapter contributions into the existing immutable owner-aware generation and serve only compiled
   browser assets, with zero production Node.js/npm.
3. Complete selector-neutral `authoring-web` assertions and the exact `STUDIO-PROD-015` integrated journey,
   including keyboard/pointer/explicit-control equivalence, conflict/recovery, media/resource failure, touch,
   RTL, 400% zoom/reflow, reduced motion, manual assistive-technology evidence, and all save outcomes.
4. Merge publishable runtime Changesets through the generated beta version PR. That operation exits the
   abandoned RC prerelease state, enters beta, resets unearned profile claims, regenerates the coordinated
   family, lockfile, changelogs, and release records, and publishes only after exact tarball/provenance checks.
5. Atomically pin the exact verified record/corpus in Kumwe App, replay host, preview, media, target,
   contribution, binding, property-schema, and renderer assertions through the real PHP/Twig integration, and
   replay applicable profiles in an independent host/renderer. Resolve the recorded Editor.js distribution-
   license decision before claiming an affected integrated release.
6. Activate the reviewed external reviewer authority, generate candidate-bound bundles, obtain independent
   signed reproduction, and accept Gate A before opening the official immutable `rc` channel. Gate B and stable
   remain blocked until the full production matrix and integrated journey are qualified. There is no separate
   beta workflow.

## Beta development and profile qualification

`beta` is now the active development-maturity channel for completing the integrated product. It is explicitly
incomplete, carries no compatibility, conformance, production, or support claim, and cannot authorize an RC.
The historical `0.1.0-rc.1` label is preserved but abandoned because its product maturity was overstated.
Three independent conditions still block a new RC:

1. **A declared, executable profile.** Done for eight of nine Version 2 boundaries:
   [`studio.profile/host-baseline-v2`](../contracts/conformance-profiles.md) adds the stateful sequence
   assertion set without changing `host-baseline`. `engine-core`, `media-policy`, `preview-identity-v1`, and
   `schema-property`, `binding-projection-v1`, and `renderer-web` are declared against the command, media,
   preview-identity, property-schema, and read-only model-binding corpora. The renderer and authoring
   packages are implemented, but `authoring-web` remains a target until its complete assertion set exists.
   No package may advertise any executable profile before accepted claim evidence names it.
2. **Feature-completeness against the profile a package advertises.** The reference host exercises the
   Blueprint-oriented repository lane but is not a contextual production host. The standalone catalog,
   responsive layout, renderer, rich text, media and resource-control implementations are present;
   authoring-package completeness still requires `STUDIO-PROD-001`–`013`, the complete `authoring-web` corpus,
   real host lifecycle lanes, and the supported manual accessibility matrix.
3. **An evidence-backed claim.** A profile claim names the profile, the corpus version, and the commit
   it was replayed at, reproduced by an independent reviewer under the [evidence model](evidence.md).
   No evidence bundle has been reproduced yet, so no claim can currently be made.

The governed beta lane is the sole package-development route. A new RC can be generated only after the
machine-checked implementation inventory records every `STUDIO-PROD-001`–`015` row as
`repository-verified`. Official RC publication remains separately blocked until Gate A supports the exact
candidate and complete fixed profile surface.

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
