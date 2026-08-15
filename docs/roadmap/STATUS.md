# Programme status

**Updated:** 2026-08-15

This file describes work still to be delivered. It does not claim that documented contracts or planned tests
already exist in runtime code. Accepted work is recorded against immutable evidence and release history.

## Current position

| Item                              | Status                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Programme phase                   | Months 1–4 running concurrently: foundation completions, contract corpus, headless runtime, authoring shell                                                              |
| Gate A                            | Not assessed; the draft contract corpus and executable scaffolding have no accepted Gate A evidence bundle                                                               |
| Gate B                            | Blocked on Gate A and all implementation/qualification packages                                                                                                          |
| Published Studio packages         | None                                                                                                                                                                     |
| Supported production hosts        | None                                                                                                                                                                     |
| Supported protocol version        | None; the first contract release candidate is produced by `M2-08`                                                                                                        |
| Earliest durable host integration | After Gate A                                                                                                                                                             |
| Current authoritative activity    | Implement the contract corpus, deterministic core, contribution runtime, preview bridge, and authoring shell against the executable check lane; assemble Gate A evidence |

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
| 3      | `M3-01`–`M3-06` | Active       | Implementation running ahead of Gate A as unaccepted scaffolding   |
| 4      | `M4-01`–`M4-06` | Active       | Relevant Month 3 packages                                          |
| 5      | `M5-01`–`M5-06` | Planned      | Relevant Months 3 and 4 packages                                   |
| 6      | `M6-01`–`M6-06` | Planned      | Implemented web, Dart/Flutter, generic-host, and Kumwe profiles    |
| Gate B | 18 criteria     | Blocked      | Accepted `M6-06` evidence bundle                                   |

## Implementation board

Repository-verified increments per work package, with the scope that still blocks acceptance. States use
the programme vocabulary; `evidence-review` here means the implementation is complete against its
acceptance list and awaits an evidence bundle plus an independent reviewer.

| Package | State           | Delivered (see changelog)                                             | Still blocking acceptance                                             |
| ------- | --------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `M1-04` | evidence-review | Manifest schemas, validator, failing sample, environment matrix       | Reviewer reproduction; CI artifact retention                          |
| `M1-05` | active          | Secret scan, audit, SBOM, release train with provenance publishing    | Changeset enforcement                                                 |
| `M1-06` | active          | Keyboard reference and machine-checked requirement registry           | Automated accessibility lane; open items SR-017, SR-019, SR-020       |
| `M2-01` | active          | Negative corpus, scalar profiles, pattern schema, profile meta-schema | Provenance and unresolved-contribution schemas                        |
| `M2-02` | active          | Eleven-command canonical subset, 32 vectors, inverse commands         | Recipe and model-draft commands; restore command decision             |
| `M2-03` | active          | Plugin/theme projections, lifecycle vocabulary, contribution runtime  | Extension SDK surface; lifecycle fixtures beyond blocks               |
| `M2-04` | active          | Error taxonomy, typed ports, negotiation algorithm, ready handshake   | Session lifecycle vectors; recovery-envelope contract fixtures        |
| `M2-05` | active          | Rich-text grammar, upload-session lifecycle, crop semantic rule       | Renderer conformance fixtures; media policy vectors                   |
| `M2-06` | active          | Canonical serialization, schema digest manifest, scalar profiles      | Dart model generation and round-trip (`M3-06` not started)            |
| `M2-07` | active          | Negative corpus, secret lane, injection-rejection assertions          | Threat-mapped corpus per boundary; fuzz lane                          |
| `M3-01` | active          | Session, selection, migrations runner, canonical serialization        | Broader property/fuzz coverage                                        |
| `M3-02` | evidence-review | Transactional owner-aware runtime with immutable generations          | Reviewer reproduction; lifecycle fixtures for non-block contributions |
| `M3-03` | active          | In-memory host testbed with conflict/permission/disconnect drills     | Real-transport adapter exercises                                      |
| `M3-04` | active          | Responder, handshake, reload and teardown vocabulary                  | Render-marker geometry mapping                                        |
| `M4-01` | active          | Outline, viewport switcher, breadcrumb, diagnostics, save state       | Canvas drag enhancement; command palette                              |
| `M4-05` | active          | Keyboard parity for move/duplicate/delete, live region, focus rules   | Parity for bind/configure/resize; conflict-survival announcements     |
| `M5-01` | active          | Upload orchestration over the canonical session state machine         | Media browser UI; paste/drop capture; real host adapter exercises     |

## Next dependency-ordered actions

1. Accept the product vocabulary, first-release profiles, and artifact ownership in `M1-01`.
2. Derive the architecture/package boundaries (`M1-02`) and interaction/accessibility specification
   (`M1-06`) from that product boundary.
3. Establish public API governance (`M1-03`) before publishing any package or schema as stable.
4. Make evidence (`M1-04`) and development/release controls (`M1-05`) executable before contract work can
   claim completion.
5. Start Month 2 protocol packages only when their Month 1 dependencies carry reproducible acceptance
   evidence.

## Programme risks under active control

| Risk                                               | Consequence                                                      | Programme control                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Visual UI drives the protocol                      | Other hosts and Flutter become wrappers around browser internals | DOM-free core, language-neutral schemas, canonical fixtures, and Dart parity at Gates A/B                 |
| Contract freezes before real integration discovery | Hosts need incompatible changes immediately after Gate A         | Generic and Kumwe mapping reviews plus executable preview/media/persistence spikes before `M2-08`         |
| Six-month tempo weakens qualification              | A feature-rich but unsafe release is promoted                    | Dates never override criteria; Gate B requires independent evidence and cannot waive mandatory controls   |
| Theme freedom becomes stored CSS/code              | Security, portability, and template switching fail               | Bounded tokens/recipes, trusted renderers, closed schemas, and malicious-input fixtures                   |
| Extension removal breaks old documents             | Content loss or public failures                                  | Owner-aware registries, unresolved-node representation, declared fallback/migration, lifecycle tests      |
| Media scope is duplicated in every host            | Broken uploads, privacy, inconsistent asset identity             | Studio owns UX/port; host owns authoritative media service; stable media-reference contract               |
| TypeScript and Dart drift                          | Flutter becomes a second incompatible product                    | Generated models, canonical vectors, shared conformance profiles, and release compatibility matrix        |
| Kumwe-specific shortcuts enter public packages     | Generic reuse becomes fictional                                  | No Kumwe imports in Studio packages; second-host Gate B proof; Kumwe logic remains in its adapter         |
| Live preview weakens CSP or authorization          | Authoring session or protected data can leak                     | Same-origin/origin-pinned handshake, short-lived preview grants, authenticated render, negative CSP tests |
| Rich-text/editor HTML becomes canonical            | XSS, migration, and server-rendering failures                    | Bounded structured document, paste normalization, host sanitization, and renderer conformance             |

## Status maintenance

Every status update names the work-package identifier, exact commit, evidence-bundle identifier, new state,
blocking item if any, and reviewer. State changes without those fields are invalid. Accepted work is moved
from this active board into the release/evidence index rather than left as an unexplained tick mark.
