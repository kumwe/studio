# Version 2 joint plan: Studio and Kumwe App

**Purpose.** Coordinate two repositories against one product contract without copying either repository's
internal roadmap into the other. The normative product outcome and stable requirement identifiers live only in
the [Studio product contract](../product-contract.md). Studio's current implementation and gate state live only
in [`docs/roadmap/STATUS.md`](../roadmap/STATUS.md). Kumwe App owns its implementation sequence in its own
repository.

| Boundary                        | Authority                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Product outcome                 | [`STUDIO-PROD-001`–`STUDIO-PROD-015`](../product-contract.md)                                                    |
| Studio implementation and gates | [`docs/roadmap/STATUS.md`](../roadmap/STATUS.md)                                                                 |
| Generic host mapping            | [`generic-host.md`](generic-host.md)                                                                             |
| Kumwe App mapping               | [`kumwe-app.md`](kumwe-app.md)                                                                                   |
| Kumwe App implementation detail | [`kumwe/app` Studio completion plan](https://github.com/kumwe/app/blob/master/docs/roadmap/studio-completion.md) |

This plan references those requirements; it does not restate or renumber them.

## Joint product outcome

Kumwe App launches Studio directly from an authorized managed-content create/edit target. The author can start
blank or from a reusable type, arrange layout, define or bind fields, enter values, preview, and choose an
explicit save outcome without a disconnected screen. Model, Blueprint, and Entry remain distinct artifacts and
revisions even though the interface coordinates them as one journey. Extension-declared targets admit trusted
blocks, patterns, field adapters, inspectors, design vocabulary, and migrations through the same immutable
owner-aware generation.

Kumwe App remains authoritative through PHP application services and PHP HTTP endpoints. Studio is deployed as
compiled browser assets; production installation, operation, preview, save, publication, and rendering require
no Node.js, npm, Vite, or server-side JavaScript process. These outcomes are governed by
`STUDIO-PROD-001`–`013`; truthful status and the executable acceptance journey are
`STUDIO-PROD-014`–`015`.

## Current coordinated checkpoint

| Area                  | Current truth                                                                                                                                                                                    | Required next state                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Studio source         | Governed beta development with contextual target/session/save contracts, headless coordinator, browser shell, extension-generation integration, HTTP reference binding, and static-host artifact | Finish repository verification and candidate-bound qualification without promoting unfinished work                        |
| Release record        | One coordinated beta family with no accepted profile claims                                                                                                                                      | Version the completed increment through Changesets; restore RC claims only through the governed evidence path             |
| Composed host session | Coordinates exact Model, Blueprint, Entry, reusable type, presentation, plan, and all three save outcomes                                                                                        | Replay through real persistent hosts and close selector-neutral/manual qualification                                      |
| Browser shell         | Contextual Model/Blueprint/Content surface with fields, values, canvas, controls, and presentation continuity                                                                                    | Complete supported browser/accessibility/security evidence against the exact candidate                                    |
| Contributions         | Canonical target plus six payload families activate atomically in an immutable owner-aware generation                                                                                            | Prove target/block/field-adapter disable, revoke, reactivation, upgrade, unresolved, and preservation lifecycle           |
| Static delivery       | Reproducible contextual/public static-host artifact with fingerprint/integrity/runtime manifests and no production start command                                                                 | Prove clean PHP/static deployment, CSP, rollback, and zero production Node/npm                                            |
| Kumwe App             | Complete public integration playbook and PHP endpoint/service boundary; runtime integration remains downstream                                                                                   | Implement and prove PHP authority, persistence, media, preview, workflow/outbox, Twig delivery, and exact browser journey |
| Gates                 | Status and evidence remain authoritative in `docs/roadmap/STATUS.md`                                                                                                                             | Accept independent candidate-bound evidence before official `rc`, stable, or production-support claims                    |

## Ownership split

| Studio owns                                                                                                                              | Kumwe App owns                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contextual authoring interaction, canvas, outline, inspector, fields/value presentation, accessibility, and deterministic local commands | Resource launch, identity, authorization, policy, exact artifact references, persistence, workflow, audit, publication, and recovery                  |
| Portable Model, Blueprint, Entry, binding, block, pattern, field-adapter, and target contracts                                           | PHP application services and PHP HTTP adapters implementing every authoritative operation                                                             |
| Capability negotiation, host-port semantics, canonical vectors, compiled browser package, and conformance assertions                     | Extension trust/install lifecycle, immutable generation admission, media custody, Twig/KIS rendering, database transactions, and operational rollback |
| No-JavaScript delivery semantics and public renderer corpus                                                                              | Production asset serving and public/portal/admin rendering with no Node.js/npm runtime                                                                |

Neither repository may fill a missing public contract with a private shape and then call that shape conformant.
Kumwe App implements the published contextual and host-transport shapes exactly and keeps host-only workflow,
renderer, binding, and webhook metadata outside portable Studio artifacts.

## Dependency-ordered landing sequence

### 1. Freeze the product boundary

- Treat `STUDIO-PROD-001`–`015` as the sole product requirement set.
- Keep canonical schemas authoritative for serialized shape and `docs/contracts/` authoritative for observable
  semantics.
- Add or change public APIs only through the contract/schema/ADR workflow; documentation does not invent shipped
  operations.

### 2. Complete and qualify the Studio contextual surface

- Maintain extension-declared target resolution and exact resource launch through the immutable generation.
- Maintain separate Model, Blueprint, and Entry state in one session with exact reusable-type hydration.
- Qualify layout, field definition/binding, and Entry values on the same canvas/inspector surface.
- Qualify explicit item-save, save-as-new-type, and update-type-version transactions.
- Prove resource identity, selection, authority, unsaved state, locale, and return path across in-context and
  expanded presentation.
- Prove every operation through pointer, keyboard, and explicit controls.

Repository implementation addresses `STUDIO-PROD-001`–`009`, `012`, and `013`; only the evidence and status
authorities may record those requirements as repository-verified or accepted.

### 3. Bind Kumwe App authority

- Resolve the extension-declared target through Kumwe App identity, site/organization, content type, resource,
  permissions, and immutable runtime generation.
- Implement load, validation, save/type-version, preview, media, workflow, publication, recovery, and audit in
  PHP application services exposed through PHP HTTP endpoints.
- Admit canonical target, block, pattern, and field-adapter declarations atomically with the owner-aware
  generation; disable/revoke without deleting stored artifacts.
- Render preview and public output through authenticated PHP/Twig/KIS paths and trusted focused enhancements.
- Copy and serve the compiled Studio browser assets without a production install step or Node.js/npm.

This is the host proof for `STUDIO-PROD-008`–`011`; TypeScript testbed behavior cannot substitute for it.

### 4. Pin and replay one candidate

1. Quarantine and verify the exact eight-package candidate through the governed release path.
2. Pin the complete release record and corpus digest atomically in Kumwe App.
3. Replay applicable host, preview, media, schema, binding, contribution, renderer, security, and environment
   assertions through the real PHP/Twig integration.
4. Run the complete `STUDIO-PROD-015` journey, including blank and reusable-type starts, empty-value hydration,
   all save outcomes, presentation continuity, an extension block, and a field adapter.
5. Reproduce accessibility, browser, database, migration, rollback, restart, backup/restore, and zero-production-
   Node conditions independently.

A fix changes the candidate coordinate and requires a deliberate re-pin and affected evidence replay. Workspace
links, copied packages, mixed prerelease versions, or an unverified release record are not substitutes.

## Claim boundary

Repository tests may prove primitives. A host browser journey may prove integration behavior. Release metadata
may freeze intended profiles. None alone opens an official channel or changes a gate.

The coordinated product remains unqualified until `STUDIO-PROD-015` passes against the exact candidate and real
host, the profile assertions are independently reproduced, Gate A is accepted, and Gate B qualification later
supports stable/production claims. Until then:

- call the active source and package family beta development until the governed promotion requirements pass;
- call the current UI a contextual Studio implementation, but do not call a host supported before real-host proof;
- call the reference host a harness, not a production host; and
- retain existing Kumwe App editors as explicit transitional fallback rather than redefining the target default.
