# Programme status

**Updated:** 2026-08-15

This file describes work still to be delivered. It does not claim that documented contracts or planned tests
already exist in runtime code. Accepted work is recorded against immutable evidence and release history.

## Current position

| Item                              | Status                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Programme phase                   | Month 1 — product and engineering foundation                                                               |
| Gate A                            | Not assessed; the draft contract corpus and executable scaffolding have no accepted Gate A evidence bundle |
| Gate B                            | Blocked on Gate A and all implementation/qualification packages                                            |
| Published Studio packages         | None                                                                                                       |
| Supported production hosts        | None                                                                                                       |
| Supported protocol version        | None; the first contract release candidate is produced by `M2-08`                                          |
| Earliest durable host integration | After Gate A                                                                                               |
| Current authoritative activity    | Establish repository, architecture, contracts, governance, quality system, and six-month programme         |

The repository currently establishes the delivery foundation only. Examples, schemas, package manifests, and
tests added during this foundation change are scaffolding unless executable evidence says otherwise.

## Gate summary

| Gate                                  | Criteria | Met | Partial | Not assessed | Decision     |
| ------------------------------------- | -------: | --: | ------: | -----------: | ------------ |
| A — integration contract established  |       14 |   0 |       0 |           14 | Not assessed |
| B — implemented, qualified, shippable |       18 |   0 |       0 |           18 | Blocked      |

Gate counts change only after evidence review. A documentation claim does not move these numbers.

## Six-month board

| Month  | Packages        | State        | Immediate dependency                                            |
| ------ | --------------- | ------------ | --------------------------------------------------------------- |
| 1      | `M1-01`–`M1-06` | Planned      | Repository foundation and assigned owners                       |
| 2      | `M2-01`–`M2-08` | Planned      | Accepted Month 1 packages                                       |
| Gate A | 14 criteria     | Not assessed | Accepted `M2-08` evidence bundle                                |
| 3      | `M3-01`–`M3-06` | Planned      | Gate A                                                          |
| 4      | `M4-01`–`M4-06` | Planned      | Relevant Month 3 packages                                       |
| 5      | `M5-01`–`M5-06` | Planned      | Relevant Months 3 and 4 packages                                |
| 6      | `M6-01`–`M6-06` | Planned      | Implemented web, Dart/Flutter, generic-host, and Kumwe profiles |
| Gate B | 18 criteria     | Blocked      | Accepted `M6-06` evidence bundle                                |

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
