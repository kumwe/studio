# Programme status

**Updated:** 2026-08-24

This file describes work still to be delivered. It does not claim that documented contracts or planned tests
already exist in runtime code. Accepted work is recorded against immutable evidence and release history.

## Current position

| Item                              | Status                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme phase                   | Months 1–4 running concurrently: foundation completions, contract corpus, headless runtime, authoring shell                                                                                    |
| Gate A                            | Not assessed; the draft contract corpus and executable scaffolding have no accepted Gate A evidence bundle                                                                                     |
| Gate B                            | Blocked on Gate A and all implementation/qualification packages                                                                                                                                |
| Published Studio packages         | Seven alpha prereleases on the npm `alpha` dist-tag; none supported, none accepted by evidence review                                                                                          |
| Declared conformance profiles     | `host-baseline`, additive `host-baseline-v2`, `engine-core`, `media-policy`, `preview-identity-v1`, and `schema-property` declared and executable; renderer and authoring profiles are targets |
| Version 2 qualification target    | The six executable profiles above plus target `renderer-web` and `authoring-web`; no profile is currently claimed                                                                              |
| Version 3 targets                 | `engine-dart`, `renderer-flutter`, and `authoring-flutter`; their Dart/Flutter work does not block Version 2                                                                                   |
| Release channel                   | `alpha`. Promotion to `beta` needs a profile claim backed by reproduced evidence — see the road to beta below                                                                                  |
| Supported production hosts        | None                                                                                                                                                                                           |
| Supported protocol version        | None; the first contract release candidate is produced by `M2-08`                                                                                                                              |
| Earliest durable host integration | After Gate A                                                                                                                                                                                   |
| Current authoritative activity    | Implement the contract corpus, deterministic core, contribution runtime, preview bridge, and authoring shell against the executable check lane; assemble Gate A evidence                       |

Delivered, repository-verified increments are recorded in [`CHANGELOG.md`](../../CHANGELOG.md) and in the
implementation board below. A changelog entry means the behaviour exists and passes the check lane on a
clean clone; it does not mean a work package is accepted — acceptance still requires a reproduced evidence
bundle and an independent reviewer per the [evidence model](evidence.md).

## Gate summary

| Gate                                  | Criteria | Met | Partial | Not assessed | Decision     |
| ------------------------------------- | -------: | --: | ------: | -----------: | ------------ |
| A — integration contract established  |       14 |   0 |       0 |           14 | Not assessed |
| B — implemented, qualified, shippable |       18 |   0 |       0 |           18 | Blocked      |

Gate counts change only after evidence review. A documentation claim does not move these numbers.

## Six-month board

| Month  | Packages        | State        | Immediate dependency                                               |
| ------ | --------------- | ------------ | ------------------------------------------------------------------ |
| 1      | `M1-01`–`M1-06` | Active       | Reviewer reproduction of the delivered evidence and baseline lanes |
| 2      | `M2-01`–`M2-08` | Active       | Remaining contract scope below, then accepted Month 1 packages     |
| Gate A | 14 criteria     | Not assessed | Accepted `M2-08` evidence bundle                                   |
| 3      | `M3-01`–`M3-05` | Active       | Implementation running ahead of Gate A as unaccepted scaffolding   |
| V3     | `M3-06`         | Planned      | Ratified Version 3 Dart profile and the Version 2 DOM-free core    |
| 4      | `M4-01`–`M4-05` | Active       | Relevant Version 2 Month 3 packages                                |
| V3     | `M4-06`         | Planned      | `M3-06` and the Version 3 Flutter authoring profile                |
| 5      | `M5-01`–`M5-06` | Planned      | Relevant Months 3 and 4 packages                                   |
| 6      | `M6-01`–`M6-06` | Planned      | Implemented Version 2 web, generic-host, and Kumwe App profiles    |
| Gate B | 18 criteria     | Blocked      | Accepted `M6-06` evidence bundle                                   |

## Implementation board

Repository-verified increments per work package, with the scope that still blocks acceptance. States use
the programme vocabulary; `evidence-review` here means the implementation is complete against its
acceptance list and awaits an evidence bundle plus an independent reviewer.

| Package | State           | Delivered (see changelog)                                                                              | Still blocking acceptance                                               |
| ------- | --------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `M1-04` | evidence-review | Stable criterion registry; strict bundle/gate validator; safe complete bundle lane                     | First real bundle; independent human reproduction and durable retention |
| `M1-05` | evidence-review | Secret scan, audit, SBOM, release train, changeset gate                                                | Reviewer reproduction; first alpha publish not yet exercised            |
| `M1-06` | evidence-review | Registry with 25 obligations, zero open; automated WCAG lane                                           | Reviewer reproduction                                                   |
| `M2-01` | evidence-review | Full schema list, declaration payloads, property-profile meta-schema and vectors                       | Reviewer reproduction; independent cross-runtime profile replay         |
| `M2-02` | evidence-review | Sixteen-command subset; the Gate A vocabulary is complete                                              | Reviewer reproduction                                                   |
| `M2-03` | evidence-review | Runtime, authoring SDK, lifecycle fixtures across six canonical kinds                                  | Reviewer reproduction                                                   |
| `M2-04` | evidence-review | Taxonomy, ports, negotiation, handshake, published transport binding                                   | Reviewer reproduction                                                   |
| `M2-05` | evidence-review | Grammar, wire upload lifecycle, conformance corpus, policy vectors                                     | Reviewer reproduction                                                   |
| `M2-06` | active          | Canonical serialization with its portable corpus, digest manifest                                      | Generated TypeScript models and canonical round-trip                    |
| `M2-07` | evidence-review | Threat registry closed: 14 of 14 enforced with recorded residuals                                      | Reviewer reproduction                                                   |
| `M3-01` | evidence-review | Session, selection, migrations, canonical form; generative lanes                                       | Reviewer reproduction against the Version 2 TypeScript profile          |
| `M3-02` | evidence-review | Transactional owner-aware runtime with immutable generations                                           | Reviewer reproduction; lifecycle fixtures for non-block contributions   |
| `M3-03` | evidence-review | Testbed, HTTP adapter, and single-exchange plus stateful host corpora                                  | Independent replay and reviewer reproduction                            |
| `M3-04` | evidence-review | Responder, handshake, geometry, attempt-safe cancellation, portable identity corpus                    | Reviewer reproduction                                                   |
| `M3-05` | active          | All declaration kinds schema-backed, incl. design vocabulary, migrations                               | Kumwe App's Gate A contribution contract; its host adapter at Gate B    |
| `M4-02` | active          | Core section/stack/grid/columns, typed recipes/tokens, reference reflow, two-theme semantic resolution | Independent second-renderer replay and reviewer reproduction            |
| `M4-03` | evidence-review | Five modes, total table, mode-boundary vectors, per-slot markers                                       | Reviewer reproduction                                                   |
| `M4-01` | evidence-review | All specified regions: outline, viewports, breadcrumb, palette, drag                                   | Reviewer reproduction                                                   |
| `M4-05` | evidence-review | Full keyboard parity, announcements survive conflict and reload                                        | Reviewer reproduction                                                   |
| `M5-01` | active          | Upload orchestration over the canonical session state machine                                          | Media browser UI; paste/drop capture; real host adapter exercises       |
| `M3-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                     | Ratified `engine-dart` profile, generated models, cross-runtime replay  |
| `M4-06` | planned         | Version 3 target; no Version 2 deliverable claimed                                                     | `M3-06` and native Flutter authoring/renderer profiles                  |

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

The current contract wave makes the integration boundary implementable and provable from published artifacts
alone: named conformance profiles with the host assertion corpus, the transport binding and its
operation registry, the media upload lifecycle, the Gate A preview vocabulary, authorized mutations,
the remaining declaration payloads, canonical serialization as a corpus, and a digest-verified corpus
manifest. `studio.profile/schema-property` now adds the portable admission/instance corpus, stable
error taxonomy, aligned meta-schema and reference runner needed before a host freezes a contributed
property schema. Every published limit is pinned at and immediately over its boundary; combined depth,
reference fan-out, speculative diagnostic replay, distinct diagnostic bounding, and deterministic
cross-pass/root/reference precedence are executable assertions rather than implementation assumptions.
That implementation is repository-verifiable; it is not an accepted claim
until an independent runtime replay and evidence review are recorded. The next actions in dependency
order:

1. Independent non-TypeScript replay of `studio.profile/host-baseline-v2` and
   `studio.profile/schema-property`, followed by immutable evidence review. The host sequence schema
   now carries every timing/render precondition explicitly; repository verification is not acceptance.
2. Grid and column composition with the two-theme four-to-two-to-one proof, the remaining `M4-02`
   scope: real layout blocks with bounded column/span/collapse semantics, renderer support, the
   authoring path, and a second unrelated theme proven end to end.
3. The media browser surface with paste/drop capture and real host adapter exercises (`M5-01`).
4. Generated TypeScript models and canonical round-trip to complete `M2-06`, reviewer reproduction of
   the packages at evidence-review, the independent non-TypeScript replay of
   `studio.profile/schema-property`, and the first real evidence bundles — the gate on every profile
   claim and therefore on the beta channel.

## Road to beta

The [release policy](../governance/releases.md) defines `beta` as a feature-complete candidate for a
declared profile, with contract changes treated as release blockers. Three things gate the promotion,
and only the first is now in place:

1. **A declared, executable profile.** Done for the host boundary:
   [`studio.profile/host-baseline-v2`](../contracts/conformance-profiles.md) adds the stateful sequence
   assertion set without changing `host-baseline`. `engine-core`, `media-policy`, `preview-identity-v1`, and
   `schema-property` are declared against the command, media, preview-identity, and property-schema
   corpora. The renderer and authoring profiles remain targets — their assertion sets are not yet
   executable, so no package may advertise them.
2. **Feature-completeness against the profile a package advertises.** The reference host is complete
   against the executable v2 assertion set in the repository lane; the profile documents the two
   idempotency scope collision drills it does not yet prove portably. For an authoring package,
   feature-completeness additionally means the Month 4 and Month 5 authoring scope — grid and column
   composition, the media surface, and rich text — which is still active or planned.
3. **An evidence-backed claim.** A profile claim names the profile, the corpus version, and the commit
   it was replayed at, reproduced by an independent reviewer under the [evidence model](evidence.md).
   No evidence bundle has been reproduced yet, so no claim can currently be made.

Beta is therefore not blocked on Gate A ratification, but it is blocked on the same evidence discipline:
the fastest honest route is to independently replay v2, reproduce one evidence bundle, and
promote the packages whose profile is executable — protocol, core, and testkit — ahead of the authoring
shell, which cannot be feature-complete until its own profile is executable.

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
