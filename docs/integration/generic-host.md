# Generic host integration guide

This guide describes how an unrelated application embeds Studio without importing Kumwe App-specific code. It is
both an implementation sequence and the basis of the generic-host conformance profile.

The adapter's obligations are executable: replay the canonical host conformance corpus published as
`vectors/host/` in `@kumwe/studio-testkit` to claim
[`studio.profile/host-baseline`](../contracts/conformance-profiles.md). The corpus is language-neutral
JSON, so a host proves persistence, optimistic concurrency, envelope negotiation, bounded queries,
absence handling, authority and telemetry discipline in its own test suite without executing Studio
code. Build against the corpus rather than against this prose alone. The server side has a published wire
shape too: routes, bodies and status mapping are normative in the
[host transport binding](../contracts/host-transport.md).

## 1. Establish host ownership

Before wiring UI, record where the host authoritatively stores and enforces:

- users, sessions, tenants/sites/organizations, roles and permissions;
- content or business definitions and their immutable revisions;
- Blueprints, entries, translations, workflow state and publication state;
- themes, trusted renderers, blocks, extensions and assets;
- media identity, bytes, metadata, processing and access policy;
- audit, idempotency, optimistic-concurrency tokens and recovery data; and
- localization catalogues, feature policy, rate/size limits, telemetry and retention.

An ownership gap is an integration blocker. Studio must not become an accidental database, identity system,
workflow engine, media store, renderer registry, or policy authority.

## 2. Select and publish a profile

The host declares protocol and capability versions plus finite limits. At minimum the resolved session
configuration identifies:

- session, actor and resource context using opaque identifiers;
- editing mode: `model`, `blueprint`, or `content`; composition: `single` or `hybrid`; and session state: `editable` or `read-only`;
- exact model, Blueprint, entry and theme revisions where applicable;
- allowed operation identifiers and field visibility;
- block, plugin and renderer inventory generations;
- locale, writing direction, time zone and display preferences;
- preview origin and policy;
- document, history, rich-text, media, query and plugin limits; and
- required versus optional capabilities.

Configuration is generated server-side or by another trusted host boundary. User-supplied configuration never
grants a capability.

### Install and bootstrap one Studio coordinate

Consume the exact eight versions in the published `studio-release.json`; verify its corpus digest before
replaying conformance. Broad ranges, workspace links, independently selected package versions, and copied
first-party definitions are not a deployable integration. The current candidate tree must first pass the
protected coordinated publish workflow; its checked-in staggered alpha record is not a substitute for npm
availability.

The browser host then starts from Studio's supported additive bootstrap rather than recreating the page-builder
catalog:

```ts
import {
  createStudioStandaloneSetup,
  defineKumweStudio,
  StudioAuthoringControlRegistry,
} from '@kumwe/studio';

defineKumweStudio();
const setup = createStudioStandaloneSetup(resolvedSession, {
  blockDefinitions: trustedExtensionBlocks,
  patterns: trustedExtensionPatterns,
});

studio.configuration = setup.configuration;
studio.patterns = setup.patterns;
studio.authoringControlRegistry = new StudioAuthoringControlRegistry({
  media: { provider: mediaProvider, uploadTransport },
});
```

The first-party 45 blocks and ten patterns lead deterministically; host contributions append only after their
owner, namespace, capability, and schema checks pass. Duplicate identities fail closed. Editor.js remains a
private Studio implementation selected by the registry: the host supplies canonical values and neutral
services, never editor tools, plugin configuration, or editor-native JSON.

## 3. Implement host ports

Transport is adapter-owned. HTTP, an in-process API, `postMessage`, a desktop bridge, or a native channel may
be used if it preserves the same semantics.

| Port area    | Required behaviour                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session      | Negotiate protocol/profile/capability versions; create a generation; reject stale or incompatible sessions; cancel and close cleanly                |
| Resources    | Load exact revisions of models, Blueprints, entries, themes and contribution inventories; return structured not-found/denied/incompatible results   |
| Policy       | Supply only visible fields/resources and authorized operation IDs; reauthorize every host effect independently                                      |
| Validation   | Validate the complete proposed artifact against protocol, host domain, permissions, dependencies and limits; return stable field/node diagnostics   |
| Persistence  | Accept expected revision and idempotency key; transact validation, write, audit and revision creation; return normalized accepted state or conflict |
| Publication  | Authorize and validate publication separately from save; pin dependency revisions; return immutable publication identity                            |
| Preview      | Render authenticated draft data through trusted renderers; attach opaque node markers; pin origin/session/revision; report stale/failed state       |
| Media        | Search, browse, upload, process, select, describe and resolve stable media references under policy                                                  |
| References   | Resolve allowed resource types and bounded queries without exposing hidden counts/fields or arbitrary host query syntax                             |
| Localization | Resolve translation keys and formatting using the session locale; report missing keys deterministically                                             |
| Recovery     | Store/load/delete bounded recovery envelopes under actor/resource policy, encryption and expiry                                                     |
| Telemetry    | Accept only declared redacted events with consent and retention policy; authoring does not depend on telemetry success                              |

Each request carries a request ID, session generation, actor/resource context, cancellation signal where the
transport permits it, and an idempotency key for retryable mutation. Sensitive credentials remain in the host
transport; they are never serialized into Studio configuration, documents, command history, diagnostics,
recovery envelopes, preview messages, or telemetry.

### Bind resource discovery

Advertise `studio.port/resource` and `studio.operation/resource.search` only
when the current session has a policy-filtered implementation. Adapt its
detached page value to `StudioResourceSearchService`, and supply a finite list
of resource types that the actor may browse. The browser passes an abort signal;
an adapter that cannot cancel transport work must still ignore superseded
results.

The service returns stable IDs and message references, not entities, database
coordinates, result totals, media URLs, or arbitrary metadata. Studio validates
each page and displays only safe labels. First-party content resource ports are
inspect-only. A host-contributed block must deliberately omit
`authoring.readOnly: true` before Studio can select or clear its canonical
`resource-reference`; every other binding source remains read-only.

## 4. Preserve artifact separation

The host persists separate identities and revisions for:

- content/business model;
- Blueprint;
- entry or business record values;
- theme design profile; and
- contribution inventory generation.

A single transaction may update related drafts when the domain allows it, but the artifacts do not collapse
into one opaque JSON blob. A Blueprint field binding names a stable model field; it does not duplicate that
field's value. An entry contains values and explicitly permitted overrides; it does not contain renderer code.

For a business aggregate, the host may expose a Studio entry projection while retaining relational domain
storage and transactional invariants. Studio commands must call application use cases; generic JSON is not an
authority to bypass business rules.

## 5. Build trusted rendering

The host maps validated block/theme contracts to trusted renderers. Rendering observes these rules:

1. Select renderer from a trusted, owner-aware registry.
2. Revalidate the artifact and pin exact dependency versions.
3. Resolve only authorized values and references.
4. Produce escaped, accessible output with bounded enhancement assets.
5. Add canonical draft-scoped node markers only in authoring preview, in Blueprint preorder with an exact map.
6. Never evaluate code, templates, selectors, SQL, or remote origins from an artifact.
7. Return structured render diagnostics without exposing secrets or hidden values.

The preview DOM is disposable. Studio uses markers for selection geometry but never scrapes it to recreate an
artifact. Production delivery must work without the Studio authoring packages.

`@kumwe/studio-renderer-web` is the portable first-party delivery implementation. A JavaScript delivery host
may call `renderStudioWeb` and install the returned trusted enhancement jobs with `enhanceStudioWeb`; a
server-side host may implement native templates instead. Both paths resolve media and dynamic bindings through
authorized host callbacks, preserve the no-JavaScript semantic fallback, and replay the same exhaustive
`conformance/renderer-web/` corpus. A server renderer does not translate Studio block names into a separate,
weaker semantic contract.

### Preview handshake

A browser preview bridge must:

- pin the expected origin and protocol version at both ends;
- use an authenticated, short-lived preview grant scoped to actor, resource and revision;
- reject wildcard origins, unsolicited messages, stale generations and replayed grants;
- validate every message shape and size;
- resolve, validate and canonically hash the complete staged draft before rendering;
- acknowledge updates with the rendered revision/checksum;
- isolate navigation, forms, downloads, pop-ups and external network access according to host policy;
- expose only the canonical current marker inventory and approved geometry/events, rejecting stale activation; and
- time out into a visible stale-preview state while outline/inspector editing remains available.

Cross-origin preview is deny-by-default and requires an explicit capability plus an equivalent security proof.

### Bind the browser surface

For `@kumwe/studio`, advertise `studio.port/preview` with both render and cancel operations, enable preview
in the resolved session, place the renderer surface in the element's `preview` slot, and assign one
`StudioPreviewBinding`:

```ts
studio.previewBinding = {
  client,
  async stage(draft, { signal }) {
    signal.throwIfAborted();
    const identity = await authenticatedDraftStore.stage(draft, sessionContext);
    signal.throwIfAborted();
    return identity;
  },
};
```

The host constructs `client` against the supplied same-origin frame (or an equivalently isolated mechanism)
with an unpredictable channel ID, exact origin and current session generation before assigning the binding.
The stage result contains `artifactId`, `draftRevision` and `draftDigest`; it contains no credential. The shell
owns request coalescing, ready/render ordering, supersession, viewport instructions and marker selection for
the lifetime of that binding. The host owns every authorization, staging, renderer and sandbox decision.

The canonical shell does not create a frame from a URL: URLs and sandbox grants are host policy, and creating
one before the client is pinned would open an unbound surface. Replacing a binding or session generation
tears down the old channel. Removing preview authority renders the textual fallback and does not create a
browser-storage or direct-rendering fallback.

## 6. Integrate extensions and themes

The host compiles one immutable contribution generation from trusted declarations. Every contribution carries
owner, namespace, contract version, semantic version, required capabilities, ordering, compatibility, fallback
and migration metadata.

- Collision, namespace, schema, dependency, or trust failure rejects the contribution before session use.
- A required missing contribution prevents write mode; a safe read-only recovery view remains possible.
- Disabling or revoking a provider removes executable registrations but preserves artifacts.
- Unresolved nodes remain identifiable and diagnosable; fallback rendering occurs only when declared.
- Declarative contributions are preferred. Executable plugins receive scoped APIs, never the host container.
- Themes expose semantic tokens, viewport roles and recipes, not raw CSS/classes/template source.

## 7. Handle save, conflict and recovery

Save sends the complete proposed state or a protocol-defined command batch with:

- base/expected revision;
- session and contribution generation;
- idempotency key;
- dependency revision set; and
- client validation result/checksum.

The host authorizes and validates again inside the durable transaction. It returns the accepted normalized
revision, a structured validation/policy error, or conflict data. Silent last-write-wins is not conforming.

Local recovery is explicit. A recovery envelope names its base revision, protocol and plugin inventory and is
bounded/checksummed. The host decides whether and how it is encrypted and stored. Reopen validates it against
current contracts before replay; incompatible commands do not run speculatively.

## 8. Accessibility, localization and policy reduction

The host supplies localized labels/catalogues and announces permission changes. A field hidden by policy must
not leak through palette entries, preview, outline, validation counts, clipboard, history, telemetry, resource
search, reference counts or error arguments.

The integration must preserve semantic landmarks, labels, focus order, keyboard commands, live regions,
contrast and reduced-motion preferences. Host chrome cannot make dragging the sole path or intercept Studio
shortcuts without an accessible alternative.

## 9. Lifecycle and compatibility

The host records Studio protocol/package versions with stored artifacts and follows the published
[compatibility policy](../governance/compatibility.md). Upgrade procedure:

1. verify package provenance and supported version range;
2. stage migration and compatibility report without mutating authoritative data;
3. back up or retain the old revision/generation;
4. transact the accepted migration under idempotency and audit;
5. compile the new contribution generation;
6. exercise preview, save, publication and delivery smoke tests; and
7. activate or roll back atomically.

A host must reject an unsupported downgrade rather than attempt to interpret newer artifacts.

## 10. Generic-host acceptance

Gate B generic-host evidence proves:

- installation from published packages with no private repository paths;
- all required capabilities and explicit degradation when optional ones are absent;
- model/Blueprint/entry/theme separation and exact revision loading;
- create, edit, preview, save, conflict, publish and recover workflows;
- server and client rendering examples without reverse-parsing DOM;
- media completion/failure, extension/theme lifecycle and unresolved-node behaviour;
- authorization reduction with no hidden-field or hidden-count leakage;
- accessibility, localization, RTL, mobile/touch and keyboard completion;
- migration, interrupted upgrade, rollback and old-document fixtures;
- security, performance and resource-limit matrices; and
- clean-room integration by a developer using only public documentation and packages.
