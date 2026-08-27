# Studio completion plan for Kumwe App Version 2

**Objective.** Complete and qualify Studio as Kumwe App's default contextual authoring surface without creating
a second product specification in this roadmap.

The [Studio product contract](../product-contract.md) is the sole authority for the target and stable
`STUDIO-PROD-001`–`015` identifiers. This file records implementation work and ordering only. Current
implementation, release, profile, and gate truth remains authoritative in [`STATUS.md`](STATUS.md); the joint
cross-repository boundary is in
[`docs/integration/version-two-joint-plan.md`](../integration/version-two-joint-plan.md).

## Fixed scope

Version 2 is the web authoring product. Dart and Flutter remain Version 3 targets and do not block this plan.
Kumwe App is authoritative through PHP application services, PHP HTTP endpoints, and PHP/Twig delivery. Studio
ships as compiled browser assets; production requires no Node.js, npm, Vite, or server-side JavaScript process.

The default supported create/edit path is Studio opened in the exact host-resource context. A legacy form may
remain only as a named migration, recovery, rollback, or unsupported-capability fallback. It does not redefine
the product target.

## Current baseline

| Item                       | Exact current truth                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                     | Current merged `main` is `829694efb25374d3b498f2d46856d2c39650728a`                                                                                         |
| Candidate                  | All eight checked-in packages and `studio-release.json` coordinate at `0.1.0-rc.1`                                                                          |
| Proposed profiles          | The release record names the fixed nine-profile Version 2 surface; eight mappings are executable and `authoring-web` remains target-only                    |
| Composed core host profile | `openStudioSession` currently loads and saves one Blueprint                                                                                                 |
| Lit shell                  | Separate alpha Blueprint shell with canvas/catalog/preview/media/resource primitives and read-only model projection; no coordinated Entry persistence       |
| Reference host             | Browser/Vite harness with an external block-control panel; not contextual host launch, production persistence, PHP authority, or zero-Node deployment proof |
| Gates                      | Gate A **Not assessed**; Gate B **Blocked**; no official stable or production-host support claim                                                            |

The release record's nine names freeze the candidate's intended profile surface. They are not reproduced
evidence and do not by themselves open the official npm `rc` channel.

## Completion ledger

| Product requirement | Repository-verified primitive                                                                    | Work still required for completion                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STUDIO-PROD-001`   | Host session configuration and browser element can receive host context                          | Extension-declared target resolves an exact existing/new resource and launches Studio directly from host create/edit                                            |
| `STUDIO-PROD-002`   | Empty Blueprint roots and reusable patterns can be supplied by a harness                         | Authorized blank and reusable-type starts through the real host, without pre-creating a Blueprint elsewhere                                                     |
| `STUDIO-PROD-003`   | Blueprint composition plus separate headless Model/Entry command primitives                      | One session/canvas for layout, field definition or binding, and Entry values                                                                                    |
| `STUDIO-PROD-004`   | Separate Model, Blueprint, and Entry protocol artifacts                                          | A host reusable type coordinates exact Model and Blueprint revisions while excluding Entry values                                                               |
| `STUDIO-PROD-005`   | Exact references and read-only model projection                                                  | Hydrate the selected reusable type and an empty/new or exact existing Entry without leaking prior values                                                        |
| `STUDIO-PROD-006`   | Blueprint optimistic-concurrency save                                                            | Separate save-item, save-as-new-type, and update-type-version transactions with visible scope/migration impact                                                  |
| `STUDIO-PROD-007`   | One standalone responsive shell layout                                                           | Preserve resource, selection, authority, locale, unsaved state, and return path across in-context and expanded states                                           |
| `STUDIO-PROD-008`   | Host-neutral configuration and canonical contribution runtime                                    | Canonical extension-declared authoring target with permitted resource/surface/mode and launch binding                                                           |
| `STUDIO-PROD-009`   | Canonical block, pattern, field-adapter, inspector, design-vocabulary, and migration generations | Prove target-scoped visibility plus install/activate/disable/reactivate/upgrade/recovery for blocks and field adapters in a real host                           |
| `STUDIO-PROD-010`   | Host ports, transport binding, renderer callbacks, and authorization boundaries                  | Kumwe App PHP application services and PHP HTTP endpoints implement every authoritative load/save/type/preview/media/workflow/publication effect                |
| `STUDIO-PROD-011`   | Build emits browser packages and renderer output                                                 | Production package/install/serve/preview/save/render path with zero Node.js/npm runtime or development server                                                   |
| `STUDIO-PROD-012`   | Standalone harness proves primitives can compose                                                 | Remove pre-creation, catalogue-screen, copy/paste, and manual reconciliation from the supported author journey                                                  |
| `STUDIO-PROD-013`   | Keyboard/outline parity, automated accessibility, responsive and reduced-motion lanes            | Complete contextual keyboard/touch/screen-reader/zoom/RTL/manual matrix, including fields, values, saves, and presentation changes                              |
| `STUDIO-PROD-014`   | Status/evidence machinery distinguishes implementation from acceptance                           | Keep Blueprint harness, RC metadata, profile claims, gates, and production support explicitly separate in every release surface                                 |
| `STUDIO-PROD-015`   | Existing E2E suites prove canvas, preview, renderer, media, and accessibility slices             | One exact real-host journey proves existing/new/blank/type flows, all saves, extension block+field adapter, PHP/Twig delivery, reopen, and zero production Node |

## Dependency-ordered work

### 1. Publish the missing contracts before code claims them

Define the canonical host-target declaration, coordinated session state, exact hydration, and explicit save
operations through the normal contract/schema/ADR/fixture workflow. Existing configuration and contribution
schemas remain authoritative until changed; prose does not invent a shipped shape.

Acceptance for this stage:

- an extension can declare where contextual Studio launch is permitted without embedding routes, PHP classes,
  callbacks, or credentials in portable artifacts;
- Model, Blueprint, and Entry coordinates and transaction boundaries remain explicit;
- a content-item save cannot silently mutate a reusable type; and
- every new operation has deterministic success, denial, conflict, retry, cancellation, and recovery vectors.

### 2. Compose the core and shell

Build the contextual session over the existing DOM-free command/session primitives and Lit shell:

1. resolve an exact existing/new resource from the host target;
2. hydrate Model, Blueprint, Entry, theme, policy, and contribution generation;
3. present layout, fields, bindings, and values together while enforcing artifact permissions;
4. support blank and reusable-type starts;
5. execute explicit item/new-type/type-version saves through host ports; and
6. preserve session state across in-context and expanded presentation.

The current single-Blueprint `openStudioSession` and read-only model projection remain truthful supported
primitives until this composed profile lands; they are not aliases for the target.

### 3. Complete extension targeting

Extend the owner-aware immutable contribution generation with the canonical authoring target. Prove that an
extension target admits only its authorized blocks, patterns, field adapters, inspectors, design intent, and
migrations on the declared resource/surface/mode. Disable, revocation, stale generation, trust failure, and
upgrade remove executable behavior without deleting Model, Blueprint, or Entry data.

### 4. Implement the Kumwe App adapter

Kumwe App maps the public target and ports onto its existing bounded contexts:

- PHP resolves identity, tenant/site, resource, content type, policy, revisions, workflow, and runtime
  generation;
- PHP application transactions authorize, validate, revision, audit, and persist item/type/type-version saves;
- PHP owns media, recovery, preview grants, and publication;
- PHP/Twig/KIS renders preview and public output from validated portable artifacts; and
- the administrator serves compiled Studio browser assets without production Node.js/npm.

App-specific owner/trust, presenter/Twig, service, route, database, and policy metadata stays in App host
bindings. It never enters generic Studio packages or canonical artifacts.

### 5. Qualify one exact candidate

1. Quarantine and verify the complete candidate family through the protected workflow.
2. Pin its exact release record and corpus digest atomically in Kumwe App.
3. Replay host, preview, model/binding, contribution, schema, media, renderer, security, and environment
   assertions through the real PHP/Twig adapter and an unrelated host/renderer where required.
4. Run `STUDIO-PROD-015` end to end, including blank/type hydration, empty values, item save/reopen,
   save-as-type, update-type-version, presentation continuity, extension block, field adapter, and public
   rendering.
5. Reproduce browser, database, accessibility, migration, restart, backup/restore, rollback, provenance,
   package-integrity, and zero-production-Node evidence independently.

A changed candidate requires a new coordinate and affected evidence. A workspace tree, mixed package set,
release-record label, or reference-host demo cannot substitute.

## Release and claim boundary

The active route is frozen RC quarantine → independently reproduced Gate A evidence → authorized official
`rc` → Gate B qualification → stable. The checked-in `0.1.0-rc.1` source is only the candidate at the start of
that route.

Completion requires all of the following at the same immutable candidate:

- the contextual authoring implementation and `authoring-web` assertions;
- the real Kumwe App PHP/Twig journey and an independent host replay;
- supported manual accessibility and production environment matrices;
- exact package/provenance/clean-consumer evidence;
- independently signed evidence and gate decisions; and
- truthful release notes and support boundaries.

Until those conditions pass, documentation must say Gate A **Not assessed**, Gate B **Blocked**, no supported
production host, no official stable release, and no completed contextual authoring product.
