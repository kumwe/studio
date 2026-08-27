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

| Area                  | Current truth                                                                                                                                | Required next state                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Studio source         | Active beta development; checked-in `0.1.0-rc.1` is immutable abandoned-candidate provenance from `829694efb25374d3b498f2d46856d2c39650728a` | Generate one coordinated beta successor through Changesets; never stage or publish the abandoned coordinate   |
| Release record        | The abandoned record preserves nine withdrawn proposed profile claims                                                                        | Beta clears claims; a new RC may restore the fixed set only after all 15 requirements are repository-verified |
| Composed host session | Loads and saves one Blueprint                                                                                                                | Coordinate exact Model, Blueprint, and Entry context plus the explicit save transactions                      |
| Lit authoring shell   | Separate Blueprint-oriented surface with measured canvas, broad catalog, preview, media/resource controls, and read-only model projection    | Make it the contextual resource surface with fields and values, exact hydration, and presentation continuity  |
| Contributions         | Six canonical contribution kinds compile into an immutable owner-aware generation                                                            | Add the canonical extension-declared host target and prove block/field-adapter lifecycle in that target       |
| Kumwe App             | Host mapping and additive integration work remain candidates                                                                                 | Prove the PHP-authoritative adapters, persistence, Twig delivery, extension target, and exact browser journey |
| Gates                 | Gate A **Not assessed**; Gate B **Blocked**                                                                                                  | Accept independently reproduced evidence before official `rc`, stable, or production-support claims           |

The checked-in `0.1.0-rc.1` metadata is not the current maturity, MUST NOT be staged or published, and proves
neither npm availability nor host support.

## Ownership split

| Studio owns                                                                                                                              | Kumwe App owns                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contextual authoring interaction, canvas, outline, inspector, fields/value presentation, accessibility, and deterministic local commands | Resource launch, identity, authorization, policy, exact artifact references, persistence, workflow, audit, publication, and recovery                  |
| Portable Model, Blueprint, Entry, binding, block, pattern, field-adapter, and target contracts as they are added                         | PHP application services and PHP HTTP adapters implementing every authoritative operation                                                             |
| Capability negotiation, host-port semantics, canonical vectors, compiled browser package, and conformance assertions                     | Extension trust/install lifecycle, immutable generation admission, media custody, Twig/KIS rendering, database transactions, and operational rollback |
| No-JavaScript delivery semantics and public renderer corpus                                                                              | Production asset serving and public/portal/admin rendering with no Node.js/npm runtime                                                                |

Neither repository may fill a missing public contract with a private shape and then call that shape conformant.
Until Studio publishes the contextual target and coordinated transaction surfaces, Kumwe App may build an
explicitly provisional adapter but must keep it isolated and replaceable.

## Dependency-ordered landing sequence

### 1. Freeze the product boundary

- Treat `STUDIO-PROD-001`–`015` as the sole product requirement set.
- Keep canonical schemas authoritative for serialized shape and `docs/contracts/` authoritative for observable
  semantics.
- Add or change public APIs only through the contract/schema/ADR workflow; documentation does not invent shipped
  operations.

### 2. Complete the Studio contextual surface

- Add extension-declared authoring-target resolution and exact resource launch.
- Compose separate Model, Blueprint, and Entry state in one session with exact reusable-type hydration.
- Put layout, field definition/binding, and entry values on the same canvas/inspector surface.
- Add explicit item-save, save-as-new-type, and update-type-version transactions.
- Preserve resource identity, selection, authority, unsaved state, locale, and return path across in-context and
  expanded presentation.
- Keep every operation available through pointer, keyboard, and explicit controls.

This work closes the gaps tracked by `STUDIO-PROD-001`–`009`, `012`, and `013`; the current Blueprint shell does
not satisfy them by composition alone.

### 3. Bind Kumwe App authority

- Resolve the extension-declared target through Kumwe App identity, site/organization, content type, resource,
  permissions, and immutable runtime generation.
- Implement load, validation, save/type-version, preview, media, workflow, publication, recovery, and audit in
  PHP application services exposed through PHP HTTP endpoints.
- Admit canonical target, block, pattern, and field-adapter declarations atomically with the owner-aware
  generation; disable/revoke without deleting stored artifacts.
- Render preview and public output through authenticated PHP/Twig/KIS paths and trusted focused enhancements.
- Install and serve the compiled Studio browser assets without production Node.js/npm.

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

- call the active source beta development and the checked-in `0.1.0-rc.1` metadata abandoned provenance;
- call the current UI a Blueprint composition shell, not completed contextual content authoring;
- call the reference host a harness, not a production host; and
- retain existing Kumwe App editors as explicit transitional fallback rather than redefining the target default.
