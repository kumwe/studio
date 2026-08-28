# Host integration

Studio is embedded through a versioned host contract. It does not assume a CMS, database, server language,
HTTP framework, renderer, media store, identity provider, or publication workflow.

The product is contextual content authoring: create or edit an exact host resource, arrange its layout, define
or bind fields, and enter values in one continuous Studio journey. The sole authority for that outcome is the
[Studio product contract](../product-contract.md). The public target, session, save, host-port, shell, and
renderer contracts are host-neutral; the host supplies all authority and durable effects.

Start with:

- [`generic-host.md`](generic-host.md) for the implementation-neutral integration sequence and conformance
  obligations;
- [`kumwe-app.md`](kumwe-app.md) for the first-party Kumwe App profile;
- [`../../examples/php-authoring-host/README.md`](../../examples/php-authoring-host/README.md) for the executable,
  framework-neutral PHP boundary for all seven authoring operations;
- [`prebuilt-browser-assets.md`](prebuilt-browser-assets.md) for the host-neutral, integrity-pinned browser
  bundle and governed release archive;
- [`standalone-local.md`](standalone-local.md) for the backendless, in-browser workspace and its distinct
  project versus save-intent JSON downloads;
- [`../../examples/standalone-static-host/README.md`](../../examples/standalone-static-host/README.md) for the
  build-once/copy-only static-delivery and zero-production-Node evidence;
- [`../portability/README.md`](../portability/README.md) for language/runtime rules; and
- [`../media/README.md`](../media/README.md) for the media ownership boundary.

## One integration path

Every host follows this sequence. Kumwe App uses the same sequence with PHP application services and PHP HTTP
endpoints.

1. Pin one exact eight-package family and verify `studio-release.json` plus its corpus digest.
2. Build the browser bundle outside production, then deploy only immutable static assets. Production never installs or
   runs Node.js, npm, Vite, or a JavaScript application server.
3. Admit trusted `authoring-target` declarations and their six canonical contribution families into one immutable,
   owner-aware generation.
4. Resolve the exact create/edit resource and emit one inert `StudioDeploymentConfiguration` beside its ordinary
   mount. It contains the exact launch/session, operation URLs, authentication projection, and admitted
   declarative contributions; Studio never infers a base URL.
5. Call `mountStudio()` or the explicit `autoMountStudio()` scan from the prebuilt module. No transport means
   blank local Studio with zero network and JSON interchange; HTTP means the authoritative configured round
   trip with no local fallback. Several mounts remain independent.
6. Implement preview, media, resources, localization, recovery, workflow, publication, and public rendering through
   host-owned services. Webhooks are emitted by the host after accepted transactions, never by browser Studio.
7. Replay the public corpora through the real adapter and complete the `authoring-web`, security, accessibility,
   public-rendering, extension-lifecycle, and zero-production-Node acceptance lanes.

[`generic-host.md`](generic-host.md) is the complete implementation-neutral playbook, including the endpoint
map, launch/save sequence, browser boundary, and acceptance checklist. [`kumwe-app.md`](kumwe-app.md) maps the
same path onto Kumwe App's PHP services, extension generation, media, Twig/KIS rendering, workflow, and outbox.

## Current Studio-side integration surface

| Surface               | Public Studio-side implementation                                                                                                                                                       | Host obligation                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Browser deployment    | Bounded deployment schema, local defaults, configured HTTP runtime, explicit mount/auto-mount APIs, and isolated multi-mount lifecycle                                                  | Emit one inert per-mount document or intentionally omit transport; serve only verified prebuilt assets |
| Contextual protocol   | Canonical target, reusable type, session, and save schemas plus the seven-operation `AuthoringPort`                                                                                     | Resolve authorization and return exact, normalized Model/Blueprint/Entry coordinates                   |
| Headless coordination | `openContextualStudioSession` coordinates blank, from-type, and existing starts and all three save outcomes                                                                             | Implement every call atomically through the host's application boundary                                |
| Browser shell         | `<kumwe-studio-contextual>` composes Model, Blueprint, and Content and preserves inline/minimized/maximized/fullscreen state                                                            | Mount it for the exact resource, handle navigation/dirty-state policy, and never mutate its shadow DOM |
| Contributions         | `authoring-target` plus block, pattern, field-adapter, inspector, design-vocabulary, and migration declarations                                                                         | Admit only trusted owner/version-compatible declarations into one immutable generation                 |
| HTTP binding          | Canonical request/result/error schemas, closed operation registry, production browser adapter, portable core adapter, and testkit responder                                             | Supply the authoritative server endpoints; the testkit responder is reference/conformance code         |
| Media and preview     | Typed ports, state machines, origin-pinned preview protocol, and portable conformance vectors                                                                                           | Own bytes, identity, scanning, policy, draft staging, trusted rendering, and isolation                 |
| Public delivery       | Deterministic semantic renderer, scoped CSS, bounded enhancements, and no-JavaScript fallbacks                                                                                          | Serve authorized published data and assets independently of the authoring application                  |
| Static delivery       | The standalone static-host build proves fingerprinted asset delivery, public no-JavaScript output, and an integrity/runtime manifest; it does not exercise the canonical DOM mount path | Copy the built directory to a static/CDN/PHP public root; run no production package manager            |

The repository remains on the governed beta lane while qualification is completed. An implemented API, a green
repository, or a reference-host demonstration is not by itself an RC, host-support claim, or accepted profile.

## Cross-repository landing sequence

1. Complete and verify `STUDIO-PROD-001`–`015` on the governed beta-development lane.
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

A writable contextual Studio session requires:

1. session and capability negotiation;
2. identity and permission context;
3. contextual target resolution and exact model, Blueprint, entry and theme load;
4. validation and separate optimistic-concurrency transactions for entry save and reusable-type outcomes;
5. preview/render coordination;
6. localization;
7. structured diagnostics; and
8. explicit close/abandon and dirty-navigation policy in the host chrome.

Media, publication, extension discovery, recovery, collaboration, external references, telemetry, and offline
operation are negotiated capabilities. A mode that needs one of them fails session creation or becomes
explicitly read-only when the capability is absent; Studio does not emulate host authority. Local handle
disposal is not a server logout, lease release, recovery discard, or workflow transition.

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
