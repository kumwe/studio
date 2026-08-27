# Host integration

Studio is embedded through a versioned host contract. It does not assume a CMS, database, server language,
HTTP framework, renderer, media store, identity provider, or publication workflow.

The target product is contextual content authoring: create or edit an exact host resource, arrange its layout,
define or bind fields, and enter values in one continuous Studio journey. The sole authority for that outcome is
the [Studio product contract](../product-contract.md), especially `STUDIO-PROD-001`–`STUDIO-PROD-010`. This
guide maps that target onto host responsibilities; it does not turn a planned target into a shipped API.

Start with:

- [`generic-host.md`](generic-host.md) for the implementation-neutral integration sequence and conformance
  obligations;
- [`kumwe-app.md`](kumwe-app.md) for the first-party Kumwe App profile;
- [`../portability/README.md`](../portability/README.md) for language/runtime rules; and
- [`../media/README.md`](../media/README.md) for the media ownership boundary.

## Current Studio-side deliverable and gap

The integration candidate contains the runtime an embedding host consumes, not only a proposed API:

| Surface                 | Repository-verified implementation                                                                                                                                                    | Contextual-authoring gap                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blueprint composition   | 45 first-party block definitions, ten starter patterns, schema-valid insertion defaults, measured direct manipulation, and keyboard/outline/explicit-control parity                   | `openStudioSession` currently composes one Blueprint; it does not open and transact Model, Blueprint, and Entry together (`STUDIO-PROD-001`–`006`)                                         |
| Block-local controls    | Editor.js `2.31.6` behind Studio's private factory, first-party structured tools, canonical rich-text JSON, Markdown conversion, safe-HTML import, and a strict-CSP sink-free surface | The Lit shell remains a separate Blueprint-oriented surface with read-only model projection; these controls are not a coordinated accessible Entry-value editor (`STUDIO-PROD-003`, `013`) |
| Delivery                | `@kumwe/studio-renderer-web` semantic output for all 45 types, no-JavaScript fallbacks, disposable trusted enhancements, and an exhaustive portable renderer corpus                   | Kumwe App must still prove its PHP-authoritative path and compiled-browser deployment with zero production Node.js/npm (`STUDIO-PROD-010`, `011`)                                          |
| Host data               | Read-only model projection, policy-filtered resource discovery, canonical resource-reference selection for opted-in contributed ports, and host-authoritative binding resolution      | Contextual launch from an extension-declared host target, exact reusable-type hydration, entry persistence, and explicit type-save transactions are not composed (`STUDIO-PROD-002`–`006`) |
| Workspace presentation  | One standalone shell layout with host-bound preview and degraded structural fallback                                                                                                  | Inline/expanded continuity, including host-supported minimized, maximized, or full-screen states, remains target work (`STUDIO-PROD-007`)                                                  |
| Contribution generation | Owner-aware canonical block, pattern, field-adapter, inspector, design-vocabulary, and migration contributions                                                                        | The host-target declaration that selects where those contributions appear and launches the exact resource remains target work (`STUDIO-PROD-008`, `009`)                                   |
| Media                   | Studio-owned browse/upload/metadata/reorder/recovery controls over host-owned media providers and upload transports                                                                   | Real host custody, authorization, persistence, and audit remain unproved                                                                                                                   |

This is candidate implementation, not completed contextual authoring or a support claim. Exact current `main`
is `829694efb25374d3b498f2d46856d2c39650728a`; the checked-in coordinated family is
`0.1.0-rc.1`. Its release record names the fixed nine-profile product surface, but recording those proposed
claims is not reproduced conformance evidence and does not mean the official npm `rc` channel is open. Gate A
remains **Not assessed**, Gate B remains **Blocked**, and no production host is supported.

## Cross-repository landing sequence

1. Freeze and quarantine all eight exact `0.1.0-rc.1` packages from the reviewed candidate, then verify the
   registry copies against `studio-release.json`; do not treat the checked-in coordinate as npm availability.
2. In the host, update one exact release record and corpus digest atomically. Never combine an old Studio
   package with the new renderer, vendor workspace builds, or reconstruct the catalog inside the host.
3. Bind contextual resource launch, session, preview, media, resource, renderer, localization, contribution,
   and persistence seams to host-owned authority. The host never imports or configures Editor.js.
4. Replay every applicable portable corpus through the real host adapters and renderer, then run the
   integrated browser/security/accessibility/rollback matrix.
5. Promote a channel only for the exact immutable family whose profile evidence was accepted.

## Integration principle

Studio owns authoring intent and deterministic composition operations. The host owns authority and durable
effects. Kumwe App implements every authoritative effect through PHP application services and HTTP endpoints
(`STUDIO-PROD-010`); compiled browser assets require no Node.js or npm in production
(`STUDIO-PROD-011`).

| Studio owns                                           | Host owns                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Local command application and history                 | Authentication and authoritative authorization                 |
| Selection, canvas, outline, inspector and diagnostics | Content/business definitions and workflow policy               |
| Blueprint, entry and theme protocol validation        | Accepted revisions, persistence and transactions               |
| Capability-aware authoring behaviour                  | Capability grant and independent enforcement                   |
| Preview coordination and node selection               | Trusted rendering and preview data resolution                  |
| Media browsing/upload interaction                     | Media identity, storage, processing, access and retention      |
| Plugin/session registry compilation                   | Plugin trust, installation, ownership and lifecycle            |
| Portable recovery-envelope creation                   | Encryption, storage, expiry and authorization of recovery data |
| Localized diagnostic identifiers and arguments        | Translation catalogues, locale policy and host messages        |
| Telemetry events defined by the public contract       | Consent, collection, redaction, export and retention policy    |

Studio never treats a successful local command as a successful save or publish. Only an accepted host revision
makes a draft durable; only an authorized host publication makes it public.

## Required host capabilities

A writable Studio session requires ports for:

1. session and capability negotiation;
2. identity and permission context;
3. contextual target resolution and exact model, Blueprint, entry and theme load;
4. validation and separate optimistic-concurrency transactions for entry save and reusable-type outcomes;
5. preview/render coordination;
6. localization;
7. structured diagnostics; and
8. lifecycle/teardown.

Media, publication, model design, extension discovery, recovery, collaboration, external references,
telemetry, and offline operation are negotiated capabilities. A mode that needs one of them fails session
creation or becomes explicitly read-only when the capability is absent; Studio does not emulate host
authority.

## Integration and product claims

Conformance profile identifiers and executable assertions live only in
[the conformance-profile contract](../contracts/conformance-profiles.md). The contextual product acceptance
journey is `STUDIO-PROD-015`; profile labels, repository tests, a release-record entry, or this guide cannot
substitute for that integrated end-to-end proof. A host publishes only the profiles and capability versions it
has reproduced, and product language must not imply contextual authoring or production support before the
corresponding evidence is accepted (`STUDIO-PROD-014`).

## Gate relationship

Before Gate A, integrations are discovery spikes. Gate A permits durable integration against the frozen
release-candidate boundary. Gate B qualifies the published packages and named host profiles for release. See
the [delivery programme](../roadmap/README.md).

The cross-repository sequence for the first production integration is in
[`version-two-joint-plan.md`](version-two-joint-plan.md).
