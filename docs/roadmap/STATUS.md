# Programme status

**Updated:** 2026-08-27

This file distinguishes repository-verified implementation from accepted evidence and published release
coordinates. A runtime increment may be complete and green in the repository while its programme package,
profile, or release channel remains unaccepted. Accepted work is recorded only against immutable evidence and
release history.

## Current position

| Item                              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Programme phase                   | The configuration-driven browser deployment, isolated local defaults, exact hosted HTTP transport, contextual start/save coordinator, prebuilt browser archive, and reference PHP security boundary are repository-verified at `991ef44fe7a5e2702343b0db285f1d0c20bf69a2`. Product completion still requires the remaining composed authoring UI, extension lifecycle journey, preview staging protocol, real Kumwe App adapter, complete `authoring-web` journey, and external qualification                      |
| Gate A                            | Not assessed; the implemented draft contract corpus has no accepted Gate A evidence bundle                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Gate B                            | Blocked on formal Gate A plus the remaining host, accessibility, performance, recovery, release-material, evidence, and independent-review qualification                                                                                                                                                                                                                                                                                                                                                           |
| Published Studio packages         | The checked-in source family is coordinated at `0.1.0-beta.2`; this status file does not claim that npm publication has completed. The historical `0.1.0-rc.1` coordinate remains abandoned immutable provenance and MUST NOT be staged, published, or presented as current maturity. No official `rc` or stable availability is claimed                                                                                                                                                                           |
| Declared conformance profiles     | The generated `0.1.0-beta.2` release record truthfully carries no profile claims. The abandoned `0.1.0-rc.1` record named all nine proposed Version 2 profiles, but that historical intent is neither accepted nor current. The complete fixed set is restored only after all product requirements and all nine assertion sets are repository-executable and a new RC is prepared                                                                                                                                  |
| Version 2 qualification target    | One fixed nine-profile RC/stable surface plus the integrated contextual journey in `STUDIO-PROD-015`. Official RC publication remains blocked until the target authoring profile is executable and all required evidence is reproduced and accepted                                                                                                                                                                                                                                                                |
| Version 3 targets                 | `engine-dart`, `renderer-flutter`, and `authoring-flutter`; their Dart/Flutter work does not block Version 2                                                                                                                                                                                                                                                                                                                                                                                                       |
| Release channel                   | Product maturity is beta development at the generated `0.1.0-beta.2` source coordinate with empty profile claims. Only generated versioning may change manifests, lockfile, changelogs, prerelease state, or release records. The `rc` and stable channels remain blocked                                                                                                                                                                                                                                          |
| Supported production hosts        | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Supported protocol version        | None; runtime uses draft wire `0.1.0-draft.2`, while the first supported contract release candidate is produced by `M2-08`                                                                                                                                                                                                                                                                                                                                                                                         |
| Earliest durable host integration | After Gate A                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Current authoritative activity    | Finish the Studio-side composed authoring UI and protocol gaps against the landed configuration-first boundary: all three save outcomes, presentation continuity, declarative extension block/field-adapter lifecycle, preview-draft staging, external-media/status UX, and the complete `authoring-web` journey. Then bind the exact public archive and operation contract through Kumwe App PHP application services, with no production Node.js/npm, and obtain external/manual evidence and independent review |
| Repository verification baseline  | `991ef44fe7a5e2702343b0db285f1d0c20bf69a2` passes `npm run verify` for the configuration-driven browser/PHP increment: 1,290 Vitest tests, 179 script tests, 18 PHP reference tests, and 19 Playwright journeys. It remains the coordinated `0.1.0-beta.2` development family with no profile, host-support, gate, RC, or publication claim. Gate A remains **Not assessed** and Gate B remains **Blocked**                                                                                                        |
| Candidate package coordinate      | None. `0.1.0-beta.2` is the current coordinated development-source family, not an RC. Historical `0.1.0-rc.1` is abandoned and MUST NOT be staged or published. A new `rc.1` may be prepared only from a later product-complete numeric beta after every implementation row and all nine profile assertion sets are executable                                                                                                                                                                                     |

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

| Requirement       | Runtime state | Current proof or blocker                                                                                                                                                                               |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STUDIO-PROD-001` | `active`      | Generic PHP/browser resolve, list, and contextual start are verified; the real Kumwe App create/edit entry point and completed contextual UI remain                                                    |
| `STUDIO-PROD-002` | `active`      | Hosted blank/from-type start and blank standalone defaults are implemented; the completed interactive reusable-type creation journey remains                                                           |
| `STUDIO-PROD-003` | `active`      | Coordinated Model/Blueprint/Entry state and policy checks are implemented; the finished one-canvas layout, typed-field, and Entry-value UI remains                                                     |
| `STUDIO-PROD-004` | `active`      | Separate coordinated artifacts and no-Entry-value type payloads are contracted; all type-save UI and real host persistence paths remain                                                                |
| `STUDIO-PROD-005` | `active`      | Exact hosted snapshots are validated before exposure and generic PHP reopen is verified; reusable-type version replay through Kumwe App remains                                                        |
| `STUDIO-PROD-006` | `active`      | Plan, item-save, new-version, and new-type operations are exact host contracts; the complete three-outcome confirmation UI and real-host transactions remain                                           |
| `STUDIO-PROD-007` | `active`      | Resource and deterministic return context are preserved by the coordinator; full inline/minimized/maximized/fullscreen continuity remains                                                              |
| `STUDIO-PROD-008` | `active`      | Generic deployment and target resolution are implemented; the complete extension-declared target UI journey and Kumwe App contribution admission remain                                                |
| `STUDIO-PROD-009` | `active`      | Hosted catalog admission is exact and owner-aware; executable block/field-adapter/pattern disable, upgrade, unresolved, and migration journey remains                                                  |
| `STUDIO-PROD-010` | `active`      | Exact operation-map/single-endpoint transport plus PHP session/CSRF/token enforcement is verified; real Kumwe App application-service replay and preview staging remain                                |
| `STUDIO-PROD-011` | `active`      | Deterministic prebuilt ESM archive, static HTML mounting, two PHP-hosted mounts, and zero runtime Node/npm are verified; official publication and independent deployed-host/public-render proof remain |
| `STUDIO-PROD-012` | `active`      | Configless local JSON import/download and direct hosted resolve/start/save/reopen work without fallback; the complete no-handoff product journey remains                                               |
| `STUDIO-PROD-013` | `active`      | Existing controls pass automated accessibility checks; complete keyboard/non-drag, touch, AT, RTL, zoom, reflow, and presentation-state qualification remains                                          |
| `STUDIO-PROD-014` | `active`      | Beta, unsupported-host, no-profile, and fail-closed capability labels are truthful; the completed surface and external release material still require verification                                     |
| `STUDIO-PROD-015` | `active`      | Local/hosted multi-mount and real PHP hostile-path subsets are executable; the complete fourteen-step integrated acceptance journey has not landed                                                     |

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

| Package | State           | Delivered (see changelog)                                                                                                                                                                                                                                                                                                              | Still blocking acceptance                                                                                                                                                                                                                  |
| ------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `M1-04` | evidence-review | Stable criterion registry; exact 60-class Gate A/B proof registry; versioned per-role schemas and deterministic internal lifecycle, reference-host, media/rich-text, TypeScript, reproducible-family, SBOM, and staged-registry producers; strict retained-output/candidate binding; protected current-main RC controller              | Activate reviewer keys plus repository/protected digests; authenticate App and other external inputs; perform registered manual/accessibility work; implement Gate B producers; independently reproduce, sign, retain, and accept evidence |
| `M1-05` | active          | Secret scan, audit, SBOM, retry-safe staged publication, immutable `0.1.0-rc.1` history, fail-closed RC/stable controls, and the generated reset into coordinated `0.1.0-beta.2`                                                                                                                                                       | Complete all 15 product requirements and all nine executable profile assertion sets; confirm governed beta publication; then prepare a new RC and qualify it through protected evidence and review                                         |
| `M1-06` | evidence-review | Registry with 30 obligations, zero open; automated WCAG lane                                                                                                                                                                                                                                                                           | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-01` | evidence-review | Full schema list, declaration payloads, property-profile meta-schema and vectors                                                                                                                                                                                                                                                       | Reviewer reproduction; independent cross-runtime profile replay                                                                                                                                                                            |
| `M2-02` | evidence-review | Sixteen-command subset; the Gate A vocabulary is complete                                                                                                                                                                                                                                                                              | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-03` | evidence-review | Runtime, authoring SDK, lifecycle fixtures across six canonical kinds                                                                                                                                                                                                                                                                  | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-04` | evidence-review | Taxonomy, ports, negotiation, handshake, published transport binding                                                                                                                                                                                                                                                                   | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-05` | evidence-review | Grammar, wire upload lifecycle, conformance corpus, policy vectors                                                                                                                                                                                                                                                                     | Reviewer reproduction                                                                                                                                                                                                                      |
| `M2-06` | evidence-review | Canonical serialization; 55 generated TypeScript roots and 253 reusable definitions bound to exact manifest/epoch/revision/generator metadata; all 243 applicable positive documents schema-validated/round-tripped; 241 exact-root literal assignments plus two explicit compiler-depth cases; deterministic cross-locale drift guard | First immutable Gate A evidence bundle, independent human reproduction, and review                                                                                                                                                         |
| `M2-07` | evidence-review | Threat registry closed: 14 of 14 enforced with recorded residuals                                                                                                                                                                                                                                                                      | Reviewer reproduction                                                                                                                                                                                                                      |
| `M3-01` | evidence-review | Session, selection, migrations, canonical form; generative lanes                                                                                                                                                                                                                                                                       | Reviewer reproduction against the Version 2 TypeScript profile                                                                                                                                                                             |
| `M3-02` | evidence-review | Transactional owner-aware runtime with immutable generations                                                                                                                                                                                                                                                                           | Reviewer reproduction; lifecycle fixtures for non-block contributions                                                                                                                                                                      |
| `M3-03` | evidence-review | Testbed, HTTP adapter, and single-exchange plus stateful host corpora                                                                                                                                                                                                                                                                  | Independent replay and reviewer reproduction                                                                                                                                                                                               |
| `M3-04` | evidence-review | Responder, handshake, geometry, attempt-safe cancellation, portable identity corpus                                                                                                                                                                                                                                                    | Reviewer reproduction                                                                                                                                                                                                                      |
| `M3-05` | active          | Six canonical contribution kinds plus exact hosted catalog locks, target admission, and owner-aware generation are schema-backed and runtime-checked                                                                                                                                                                                   | Complete extension target/block/field-adapter disable-upgrade-migration journey plus Kumwe App PHP-authoritative adapter and independent host replay (`STUDIO-PROD-008`–`010`)                                                             |
| `M4-02` | evidence-review | Section/stack/grid/columns, responsive presentation intent, recipes, two-theme semantic resolution and browser 4→2→1 reflow                                                                                                                                                                                                            | Independent second-renderer replay and reviewer reproduction                                                                                                                                                                               |
| `M4-03` | active          | Mode/permission boundary, coordinated contextual snapshots, initial artifact validation, Blueprint commands, and Model/Entry command primitives                                                                                                                                                                                        | Complete one-canvas layout, fields, and values UX plus all item/type/type-version confirmation and reconciliation transactions (`STUDIO-PROD-003`, `004`, `006`)                                                                           |
| `M4-01` | active          | Full catalog/pattern palette, generic contextual resolve/list/start, browser multi-mount, measured SVG canvas, live controls, selection, local fallback, and hosted refusal isolation                                                                                                                                                  | Finish fields/values UI, full presentation continuity, preview staging, complete `authoring-web`, framed CSP, and manual/accessibility evidence (`STUDIO-PROD-001`, `007`, `013`)                                                          |
| `M4-04` | active          | Exact contextual snapshot hydration, initial Model/Blueprint/Entry policy validation, field/control projection, portable bindings, and policy-filtered resource browser                                                                                                                                                                | Complete editable fields/values and all type-save user journeys; replay exact reusable-type versions through Kumwe App and an independent second host (`STUDIO-PROD-002`–`006`)                                                            |
| `M4-05` | evidence-review | Measured reorder/reparent with identical outline/palette commands; tested no-op cancellation                                                                                                                                                                                                                                           | Evidence bundle; manual AT/touch/zoom/RTL matrix; reviewer reproduction                                                                                                                                                                    |
| `M5-01` | active          | Media controls plus configuration-driven resource queries and bounded upload grants cover browse/search/page/select/replace, paste/drop/upload, metadata, progress, cancellation, retry, ordering, orphan recovery, and hostile response handling                                                                                      | External-media import and upload-status first-party UI, real Kumwe App persistence, supported-browser evidence, and independent replay                                                                                                     |
| `M5-02` | active          | Private Editor.js adapter, first-party rich-text tools, Markdown and safe-HTML codecs, renderer projection, strict-CSP sink-free surface                                                                                                                                                                                               | Full paste/browser/server-renderer matrix; independent evidence; Kumwe App distribution-license decision                                                                                                                                   |
| `M5-03` | active          | Standalone 45-block catalog, ten patterns, isolated multi-mount defaults, lossless JSON import/download, deterministic prebuilt ESM archive, PHP deployment emitter, semantic renderer, guided controls, and exhaustive renderer corpus                                                                                                | Extension-targeted block/field-adapter journey, independent deployed PHP/Twig or second-renderer replay, complete `authoring-web`, official publication, and reviewer reproduction (`STUDIO-PROD-008`–`011`, `015`)                        |
| `M3-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                                                                                                                                                                                                                                                     | Ratified `engine-dart` profile, generated models, cross-runtime replay                                                                                                                                                                     |
| `M4-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                                                                                                                                                                                                                                                     | `M3-06` and native Flutter authoring/renderer profiles                                                                                                                                                                                     |

### Latest state transition

| Package / integration item                                                                            | Implementation commit                      | Evidence bundle        | New state       | Blocking item                                                                                                                                                                                             | Reviewer   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `M1-01`, `M3-05`, `M4-01`, `M4-03`, `M4-04`, `M5-01`, `M5-03` / configuration-first browser authoring | `991ef44fe7a5e2702343b0db285f1d0c20bf69a2` | none — not yet created | active          | Finish the composed UI, extension lifecycle, preview staging, complete `authoring-web`, Kumwe App PHP adapter, independent deployed-host replay, manual evidence, and reviewer reproduction               | unassigned |
| `M2-06` / `gate-a/09-typescript-corpus`                                                               | `991ef44fe7a5e2702343b0db285f1d0c20bf69a2` | none — not yet created | evidence-review | Reproduce the cross-locale generated-source drift check, 241 exact-root assignments, two named `TS2321` depth boundaries, and 243-document schema-validated JSON round-trip in an immutable Gate A bundle | unassigned |
| `M1-01` / `STUDIO-PROD-001`–`015`                                                                     | `829694efb25374d3b498f2d46856d2c39650728a` | none — not yet created | active          | Implement the contextual product gaps without treating the current Blueprint-only composed host profile as completion                                                                                     | unassigned |
| `M4-01` / `STUDIO-PROD-001`, `007`, `013`                                                             | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | active          | Add contextual launch and presentation continuity; complete real-shell `authoring-web`, framed-host CSP, and manual AT/touch/zoom/RTL proof                                                               | unassigned |
| `M4-02` / `STUDIO-PROD-003`                                                                           | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | evidence-review | Replay responsive composition independently, then integrate the same canvas with fields and values                                                                                                        | unassigned |
| `M4-04` / `STUDIO-PROD-002`–`006`                                                                     | `97875bca2a858bb68ad33686dbb4b8689f38ef2f` | none — not yet created | active          | Implement exact hydration, editable Entry values, and explicit save transactions; replay through Kumwe App and an independent second host                                                                 | unassigned |
| `M5-01`–`M5-03` / `STUDIO-PROD-008`–`011`, `015`                                                      | `dadb69a904ef774e974fc614832c5b6b01d1f6f1` | none — not yet created | active          | Prove extension target/block/field-adapter lifecycle, real media, PHP/Twig delivery, zero production Node.js/npm, complete authoring qualification, and reproduce evidence                                | unassigned |

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

The candidate tree now contains the Studio-side configuration-driven browser runtime rather than only
contracts: all eight packages, 45 first-party blocks, ten patterns, Editor.js behind a private canonical
adapter, isolated local defaults, exact hosted transport, contextual start/save coordination, bounded
media/resource services, a deterministic prebuilt browser archive, a PHP emitter/security reference, and real
browser-to-PHP qualification. Repository checks prove that implementation snapshot; they do not publish it,
qualify Kumwe App, accept a profile, or make an RC claim. The remaining actions are:

1. Finish the composed Studio authoring surface: one continuous layout/field/value experience, all three save
   confirmations and reconciliations, inline/minimized/maximized/fullscreen continuity, extension lifecycle
   UX, preview-draft staging, and the remaining external-media/status controls.
2. Complete selector-neutral `authoring-web` assertions and the exact `STUDIO-PROD-015` integrated journey,
   including extension disable/upgrade/migration, keyboard/pointer/explicit-control equivalence,
   conflict/recovery, media/resource failure, touch, RTL, 400% zoom/reflow, reduced motion, and manual
   assistive-technology evidence.
3. Merge and publish the qualified prebuilt beta browser archive through the governed beta workflow. Node.js
   and npm remain contributor/build/release inputs only; the archive and PHP integration must never require a
   production JavaScript server or client-side package installation.
4. Atomically pin that exact beta record, archive, schemas, and corpus in Kumwe App. Implement the published
   operation map through real PHP application services and PHP HTTP endpoints, emit one bounded deployment per
   content mount, and replay host, preview, media, target, contribution, binding, property-schema, renderer,
   conflict, authentication, and authorization behavior through the real PHP/Twig stack.
5. Replay the applicable profiles in an independent host/renderer and resolve the recorded Editor.js
   distribution-license decision before claiming an affected integrated release.
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
