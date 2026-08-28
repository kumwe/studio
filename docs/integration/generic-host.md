# Generic host integration guide

This guide describes how an unrelated application embeds Studio without importing Kumwe App-specific code. It is
both an implementation sequence and the basis of the generic-host conformance profile.

The default integration target is an exact host resource opened for contextual authoring, not a catalogue-level
Blueprint tool. The [Studio product contract](../product-contract.md) is the sole authority for that target.
The normal integration is configuration-first: serve the prebuilt browser module, emit one inert
`StudioDeploymentConfiguration` per mount, and call `mountStudio()` or the explicit `autoMountStudio()` scan.
That one path covers a backendless local canvas and a PHP/host-authoritative HTTP session. Lower-level adapter,
coordinator, and custom-element APIs remain advanced composition seams, not a prerequisite or competing
workflow.

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

## 2. Install one coordinate and deploy static assets

Consume all eight exact versions from the published `studio-release.json` and verify its corpus digest before
replaying conformance. Broad ranges, workspace links, independently selected package versions, and copied
first-party definitions are not a deployable integration.

Node.js, npm, and Vite belong only in a contributor, CI, build, test, or release environment. A consuming
project normally verifies and extracts the published prebuilt browser archive, copies that immutable directory
to a static document root, CDN, object store, or PHP public directory, and serves it directly. There is no
production install/start command, package-registry access, Node process, npm process, or Vite server.

Repository contributors can reproduce the static-delivery and zero-production-Node evidence with:

```bash
npm run build:static-host
```

It writes `examples/standalone-static-host/dist/`, containing the contextual authoring page, a public
no-JavaScript page and stylesheet, fingerprinted `assets/studio-*.js`/CSS files, Vite's
`build-manifest.json`, and `studio-assets.json` with integrity, size, and runtime declarations. That command is
for a trusted contributor/build environment, never a production host. A project may instead bundle the exact
published family through its own trusted build pipeline. It
MUST preserve the same rules: immutable fingerprinted assets, an auditable manifest, exact package-family
provenance, CSP-compatible module loading, and no production package manager. `serve.py` in the standalone
example is validation tooling, not a production dependency. This example directly composes a contextual shell;
it proves static asset delivery and the absent production toolchain, not the ordinary-element
`mountStudio()`/configuration path described below.

## 3. Resolve a contextual authoring target

An installed, trusted extension declares the host-owned `authoring-target` on which Studio is available. When an
authorized create or edit action selects that target, the host resolves the exact resource and launches Studio
without asking the author to pre-create or transfer a Blueprint (`STUDIO-PROD-001`, `008`, `012`). The target binds,
under host policy:

- the host resource kind and identity for create or edit;
- the exact reusable type, Model revision, Blueprint revision, Entry revision when editing, and compatible
  theme/design intent;
- active extension-owned blocks, patterns, field adapters, inspectors, design vocabulary, and migrations;
- permitted authoring and presentation states, save outcomes, and return destination; and
- the PHP or other authoritative host operations that load, validate, transact, preview, and render it.

The declaration conforms to canonical `AuthoringTargetDeclaration`. It is discovery metadata, never an
authorization token. Core and extension targets use the same resolution path. The host rechecks the exact
surface, resource type, create/edit intent, requested presentation, mode, required capabilities, and each
explicitly admitted contribution dependency before returning a resolution.

The host also declares protocol and capability versions plus finite limits. The resolved contextual session
identifies:

- session, actor and resource context using opaque identifiers;
- internal Model, Blueprint, and Content authority boundaries and session state; these are permissions inside
  one journey, not disconnected author-facing products;
- exact model, Blueprint, entry and theme revisions where applicable;
- allowed operation identifiers and field visibility;
- block, plugin and renderer inventory generations;
- locale, writing direction, time zone and display preferences;
- preview origin and policy;
- document, history, rich-text, media, query and plugin limits; and
- required versus optional capabilities.

Configuration is generated server-side or by another trusted host boundary. User-supplied configuration never
grants a capability.

### Emit configuration and mount Studio

One ordinary element is one Studio instance. With no configured transport, it opens the compiled first-party
catalogue as a blank in-memory page builder, performs zero network requests, and offers distinct project JSON
import/download and save-intent download actions:

```html
<div data-kumwe-studio></div>
<script type="module" src="/assets/start-studio.js"></script>
```

```js
// /assets/start-studio.js
import { autoMountStudio } from './studio-browser-<fingerprint>.js';

await autoMountStudio();
```

For HTTP operation, the server emits one inert `script[type="application/json"]` associated with the mount.
Its schema-valid deployment contains:

- `launch`: the exact target, create/edit intent, resource context, start source, and presentation;
- `session`: the complete resolved `StudioConfiguration` for the current display context and policy;
- `transport.routing`: either exact URLs keyed by supported operation or one exact dispatcher URL; and
- `transport.authentication`: same-origin session plus CSRF, or a bearer/custom-header projection with required
  `issuedAt`/`expiresAt`, `issuedAt <= now < expiresAt`, and a maximum positive 15-minute lifetime.

PHP can render the pair without inline executable JavaScript:

```php
<?= $deploymentEmitter->render('article-studio', 'article-studio-config', $deployment) ?>
```

The [PHP host reference](../../examples/php-authoring-host/README.md#emit-one-browser-deployment-configuration-per-mount)
provides the complete schema-valid construction and escaping rules. Another server language emits the same
JSON contract. The prebuilt start module is identical for every actor and resource: it reads no ambient route,
cookie value, hidden form, or application global.

An empty `data-kumwe-studio` value means local defaults. A non-empty value names the exact inert configuration
element for that target. Several pairs may appear on one page; every mount owns independent draft, history,
focus, lifecycle, and transport state. A configured hosted failure remains visible and never switches that
instance to local work.

The host may mount the same logical session inline or on a context-preserving expanded route. Presentation
changes do not reopen the resource or create another draft. The host listens for Studio's public change,
presentation, mode, and save-request events; it does not query or mutate the element's shadow DOM. Save requests
always follow plan, review/confirmation when required, and one explicit save operation.

Trusted live browser objects use `mountStudio(deployment, { hosted: … })` (or the same `hosted` option on
`autoMountStudio`) instead of replacing the shipped resolver. Use the factory form
`autoMountStudio({ hosted: (target, deployment) => ({ … }) })` for per-instance live objects. The bounded
options are authentication refresh, a precompiled field-control registry, server-consequence confirmation UI,
and the raw-byte transfer for a short-lived media grant. None may supply routes, permissions, resource
identity, or session data. Those remain in the inert deployment document and every advertised standard
operation must have its exact operation-map route. Studio automatically adapts configured `resource/search`
and browse-only `media/get` plus `media/list` to its existing controls; browse-only media disables byte intake.
When upload is advertised, Studio itself calls configured `media/authorize-upload`, `media/complete-upload`,
and `media/abort-upload`; the precompiled transfer sees only the validated grant, bytes, and grant-relative
offset, never local Studio session identity or lifecycle authority. Requested and granted byte bounds may not
exceed the exact resolved `limits.maxMediaUploadBytes`. The browser treats grant receipt as issuance and
requires `issuedAt <= now < expiresAt` with a maximum 15-minute lifetime. Header count/name/value bounds match
the grant schema. A terminal transfer or completion failure best-effort aborts the grant, clears it locally,
and reauthorization must return a fresh grant before retry. Until a separate file-upload flag exists, resolved
`clipboardMediaUpload` gates all file, paste, and drop byte intake. `externalMediaImport` must be enabled before
that capability may be advertised; the current first-party control still exposes no external-URL input.

Normal configured HTTP mounting rejects enabled preview because the current port renders or cancels an
already-staged digest but has no configured operation that receives and authorizes the complete draft. Taking
an opaque `StudioPreviewBinding.stage()` here would create a second endpoint track. A host that already owns a
complete isolated binding may use the advanced direct-composition API below, but that is not presented as the
normal configuration-first path. Unsupported enabled preview, partial media service claims, upload without a
grant transfer, or a capability/route mismatch rejects that mount and never activates local fallback. The
current Model needs no extra service bridge because the authoritative coordinated Model is part of
`authoring/start`.

The ordinary contextual mount consumes the complete authoring route family, `resource/search`, media
`get`/`list`, and the three upload lifecycle routes above. Media `upload-status` and `import-external`, plus
artifact, localization, model-discovery, permission, recovery, and telemetry ports, remain lower-level
`HostAdapter` operations until a first-party contextual surface adopts them. A capability advertises what the
PHP host can perform; it does not falsely claim that the current browser shell invokes an unfinished workflow.

Standalone local Studio uses the complete compiled first-party catalog and compatible starter patterns. A
hosted session instead exposes exactly its host-resolved block type/version/revision locks. Each lock must
resolve to the matching compiled first-party definition or to an extension block admitted for the resolved
target; extension blocks require both target admission and an exact session lock. Hosted patterns are only
target-admitted patterns whose exact block dependencies all match session locks. The opened Blueprint's
dependency locks must be an exact subset of that session catalog, and every node must use a session-locked
type/version. Missing, duplicate, stale, or mismatched locks reject the mount, with no full-catalog or
default-pattern fallback. The other declarative contribution families likewise come only from the
target-admitted immutable generation. Editor.js remains a private Studio implementation: the host supplies
canonical values and neutral services, never editor tools, plugin configuration, or editor-native JSON.

Applications that already own a live session may use the configured browser adapter,
`openContextualStudioSession`, and custom elements directly. That advanced path must consume the same exact
deployment routing/authentication values and preserve the same lifecycle. Production adapters accept only
explicit routing; conventional base-path expansion belongs exclusively to testkit fixtures. Integrations do
not infer `/ports/...` paths or manually assign detached snapshots to element properties.

## 4. Implement host ports and HTTP/AJAX endpoints

Transport is host-configured. A browser deployment names its exact HTTP routes and authentication projection;
it does not discover them from the page URL. An advanced embedder may instead implement an in-process API,
`postMessage`, desktop bridge, native channel, or direct `HostAdapter` if it preserves the same semantics.

| Port area     | Required behaviour                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target launch | Resolve an extension-declared target to one authorized create/edit context, exact artifact revisions, permitted presentation states, save outcomes, and deterministic return path |
| Session       | Negotiate protocol/profile/capability versions; create a generation; reject stale or incompatible sessions; cancel and close cleanly                                              |
| Resources     | Load exact revisions of models, Blueprints, entries, themes and contribution inventories; return structured not-found/denied/incompatible results                                 |
| Policy        | Supply only visible fields/resources and authorized operation IDs; reauthorize every host effect independently                                                                    |
| Validation    | Validate the complete proposed artifact against protocol, host domain, permissions, dependencies and limits; return stable field/node diagnostics                                 |
| Persistence   | Accept expected revision and idempotency key; transact validation, write, audit and revision creation; return normalized accepted state or conflict                               |
| Publication   | Authorize and validate publication separately from save; pin dependency revisions; return immutable publication identity                                                          |
| Preview       | Render authenticated draft data through trusted renderers; attach opaque node markers; pin origin/session/revision; report stale/failed state                                     |
| Media         | Search, browse, upload, process, select, describe and resolve stable media references under policy                                                                                |
| References    | Resolve allowed resource types and bounded queries without exposing hidden counts/fields or arbitrary host query syntax                                                           |
| Localization  | Resolve translation keys and formatting using the session locale; report missing keys deterministically                                                                           |
| Recovery      | Store/load/delete bounded recovery envelopes under actor/resource policy, encryption and expiry                                                                                   |
| Telemetry     | Accept only declared redacted events with consent and retention policy; authoring does not depend on telemetry success                                                            |

### Canonical HTTP/AJAX binding

An HTTP deployment chooses either:

- `operation-map`, whose closed object maps every advertised stable route such as
  `authoring/resolve-target` or `resource/search` to the host's exact URL; or
- `single-endpoint`, whose one exact URL receives every advertised operation and the fixed
  `X-Studio-Operation` route discriminator.

Those URLs are host choices. `/studio/ports/...` is a convenient reference-host layout, not a convention that
Studio derives or requires. `authoring/resolve-target` and `authoring/start` are required to open hosted
Studio; every other route is present only when the resolved session advertises that capability. An operation
map must exactly match those advertised operation capabilities. The single endpoint must reject any unknown or
mismatched discriminator. Missing optional routes disable their features rather than triggering URL synthesis.

The browser resolves target authority before creating drafts. Existing/edit launches then call start directly.
For create launches that advertise `from-type`, Studio queries `authoring/list-types` in the same mount and lets
the author choose blank or one exact authorized coordinate (including host-backed search and cursor paging)
before start. The deployment's create source is a preferred preselection, never permission. No second page,
pre-created definition, client-side catalogue filtering, or alternate endpoint track is involved.

Every configured call uses `POST`, `Content-Type: application/json`, and `Accept: application/json`. Reads also
use `POST`; resource contexts, revisions, and idempotency keys never enter URLs, access logs, referrers, or
caches. The body conforms to `host-request.schema.json`, success to `host-result.schema.json`, and failure to
`host-error.schema.json`. The closed route/capability registry is `host-operations.schema.json`;
[`authoring-http.schema.json`](../../schemas/authoring-http.schema.json) closes the exact
route/request/result pair for each of the seven contextual operations. The deployment runtime and its
configured browser adapter implement this client behavior.
`@kumwe/studio-testkit` supplies the executable reference responder and corpora for server conformance; it is
not a production server runtime. The
[`examples/php-authoring-host`](../../examples/php-authoring-host/README.md) reference binds the same closed
contract to PHP application-service interfaces without owning persistence or requiring Node/npm.

Every request `context` carries the exact `operationId`, selected `protocolVersion`, fresh `requestId`, opaque
`resourceContextKey`, and `sessionGeneration`. Retryable mutations also carry an `idempotencyKey`. Actor,
credential, CSRF evidence, site/organization authority, and the authoritative resource context are attached or
resolved by the trusted transport; the browser cannot grant them by writing JSON.

The contextual lifecycle has exactly these seven routes:

| Route                             | `arguments` member                            | Mutation | Authoritative result/obligation                                                                                                                           |
| --------------------------------- | --------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authoring/resolve-target`        | `request: AuthoringTargetResolveRequest`      | No       | Reauthorize target, complete resource context, intent, capabilities, dependencies, and presentation; return `AuthoringTargetResolution`                   |
| `authoring/list-types`            | `query: AuthoringTypeListQuery`               | No       | Return only authorized exact type summaries with opaque cursor pagination                                                                                 |
| `authoring/start`                 | `request: AuthoringStartRequest`              | Yes      | Idempotently allocate/load one coordinated snapshot; return exact Model/Blueprint/Entry/type coordinates and empty Entry values for a new from-type start |
| `authoring/plan-save`             | `intent: AuthoringSaveIntent`                 | No       | Validate expected coordinates and return affected artifacts, stable consequences, confirmation requirement, and host-bound plan identity                  |
| `authoring/save-item`             | `request: AuthoringSaveItemRequest`           | Yes      | Atomically save Entry plus only an explicitly permitted item Blueprint override; never mutate the reusable type                                           |
| `authoring/save-new-type-version` | `request: AuthoringSaveNewTypeVersionRequest` | Yes      | Atomically create coordinated Model/Blueprint/type successor revisions, validate migration/dependency impact, and exclude Entry values                    |
| `authoring/save-as-new-type`      | `request: AuthoringSaveAsNewTypeRequest`      | Yes      | Atomically create a new reusable type from Model/Blueprint drafts and policy, excluding Entry values                                                      |

All three save requests bind the reviewed plan reference and accepted consequence codes. Their expected type,
Model, Blueprint, and Entry coordinates live in the intent/plan rather than the envelope's single
`expectedRevision`; a host MUST reject any mismatch, unknown/invalidated/host-expired plan, altered draft,
changed authority, changed generation, or idempotency-key reuse for different intent. A successful save returns one normalized
`AuthoringSaveResult` carrying the reconciled complete session.

The remaining standard port routes are additive and capability-negotiated:

| Area             | Routes                                                                                                                                             | Host responsibility                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Artifact         | `artifact/dependencies`, `artifact/load`, `artifact/save`, `artifact/publish`, `artifact/unpublish`                                                | Single-artifact compatibility and separately authorized publication; never approximate a contextual multi-artifact save |
| Media            | `media/list`, `media/get`, `media/authorize-upload`, `media/complete-upload`, `media/abort-upload`, `media/upload-status`, `media/import-external` | Policy-filter catalogue, byte custody, scanning, processing, stable identity, SSRF-safe optional import, and audit      |
| Preview          | `preview/render`, `preview/cancel`                                                                                                                 | Authenticated staged-draft render/cancel keyed by digest, resource, generation, and attempt                             |
| Discovery/policy | `model/list`, `model/get`, `resource/search`, `permission/explain`, `permission/refresh`                                                           | Return already-authorized bounded projections; never rely on client-side post-filtering                                 |
| Support          | `localization/messages`, `recovery/load`, `recovery/store`, `recovery/discard`, `telemetry/emit`                                                   | Locale policy, protected recovery storage, and allowlisted redacted telemetry                                           |

Media bytes do not traverse the JSON port. `authorize-upload` returns a short-lived bounded HTTPS grant; the
browser transfers bytes to that destination, then calls `complete-upload`. Artifacts persist only stable media
references, never transfer URLs, filesystem paths, credentials, or raw bytes.

### Host application seams outside `HostAdapter`

The closed browser-port registry deliberately does not invent workflow, public-page, or webhook routes:

- **Workflow and publication** remain explicit host application commands. A host may expose its normal review,
  approve, schedule, publish, unpublish, and translation routes after an accepted Studio save. Generic
  `artifact/publish` and `artifact/unpublish` remain separate port operations; they never make save imply publish.
- **Public rendering** is a host delivery route such as a normal page/controller, not a Studio port. It loads
  accepted pinned artifacts and values and renders through `@kumwe/studio-renderer-web` or a conforming native
  renderer. Public output does not mount Studio and retains an operable no-JavaScript fallback.
- **Webhooks and integration events** originate only after the host transaction commits, preferably through a
  transactional outbox. Delivery is signed, versioned, idempotent, retried with bounds, auditable, and subject
  to host policy. Browser Studio never holds webhook secrets, destinations, retry state, or delivery authority.

These seams reuse the same accepted resource/type/artifact coordinates, actor/system context, runtime
generation, authorization, revision, audit, and idempotency rules. They do not create a second content model or
a private Studio protocol.

Each request carries a request ID, session generation, opaque resource-context key, cancellation signal where
the transport permits it, and an idempotency key for retryable mutation. Actor identity and server authority
come only from the verified session or short-lived credential. The same-origin configuration contains a CSRF
token but never the HttpOnly session-cookie value; token profiles contain only purpose-bound material with a
required issuance/expiry window of at most 15 minutes. Studio checks that window before every request, while the
host independently verifies protected token claims and authority. Authentication material is never copied into documents, command history, exports,
diagnostics, recovery envelopes, preview messages, or telemetry.

The legacy `openStudioSession` Blueprint handle and artifact routes remain supported bounded surfaces. They do
not replace, widen, or partially implement the contextual seven-operation transaction protocol.

### Authentication, CSRF, concurrency, and errors

- Authenticate through the host's established secure session cookie or purpose/audience-bound bearer
  credential. Never accept an actor, role, tenant, organization, permission, or session from Studio JSON as
  authentication evidence.
- For a cookie-authenticated browser, validate the CSRF token and exact allowed origin on port requests, enforce
  the framework's fetch-metadata policy, and use `Secure`, `HttpOnly`, and appropriate `SameSite` cookies.
  Credentialed wildcard CORS is forbidden. A cross-origin adapter needs an explicit allowlist and equivalent
  proof; it is not enabled by a target declaration.
- Validate content type, body byte/depth/member limits, the request schema, operation/capability match,
  protocol, session generation, resource-context binding, and current authority before dispatch. Unknown
  members fail closed.
- Scope accepted idempotency results by key, operation capability, resource context, session generation, and
  canonical intent. Return the original accepted result for an exact retry; reject reuse for changed intent.
  Keep records for at least the maximum client retry window and never charge a second mutation/rate-limit unit.
- Compare every expected coordinate inside the same transaction that writes and audits. A conflict returns the
  safe current revision/coordinates and leaves local work intact; silent last-write-wins and automatic overwrite
  are forbidden.
- Return canonical `HostPortError` values. Use `401 unauthenticated`, `403 forbidden`, `404 not-found`,
  `409 conflict`, `413 limit-exceeded`, `422 validation-failed`, `429 rate-limited`, `502/503/504 unavailable`,
  and safe `4xx`/`5xx` fallbacks as specified by the transport contract. Do not return stack traces, SQL,
  filesystem paths, credentials, private identifiers, or hidden-resource existence.
- Bound deadlines, cancellation, and server work independently. A client abort does not mean a transaction was
  rolled back; the idempotency key resolves an unknown outcome safely. The diagnostic
  `studio.host/stale-session-generation` invalidates the whole handle and requires a new handshake.

The authoring response applies the [security contract](../contracts/security.md): fingerprinted same-origin
modules, no `unsafe-eval`, Trusted Types where supported, bounded `connect-src`, no ambient third-party assets,
and restrictive base/form/object/frame policy. Preview uses a separate dedicated response policy and sandbox;
never weaken every administrator/public response merely to permit preview.

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

## 5. Preserve artifact separation

The host persists separate identities and revisions for:

- content/business model;
- Blueprint;
- entry or business record values;
- theme design profile; and
- contribution inventory generation.

A single transaction may update related drafts when the domain allows it, but the artifacts do not collapse
into one opaque JSON blob. A Blueprint field binding names a stable model field; it does not duplicate that
field's value. An entry contains values and explicitly permitted overrides; it does not contain renderer code.

Starting from a reusable type hydrates its exact Model and Blueprint revisions plus an empty or existing Entry,
as appropriate; it never copies values from another entry (`STUDIO-PROD-002`, `004`, `005`). Studio may display fields,
layout, bindings, and values on one canvas, but every proposed change retains its artifact target, base revision,
permission, validation, and migration consequences (`STUDIO-PROD-003`).

For a business aggregate, the host may expose a Studio entry projection while retaining relational domain
storage and transactional invariants. Studio commands must call application use cases; generic JSON is not an
authority to bypass business rules.

## 6. Build trusted rendering

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

### Bind the browser surface through advanced direct composition

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

## 7. Integrate extensions and themes

The host compiles one immutable owner-aware contribution generation from trusted plugin manifests. An
`authoring-target` is activated atomically with the six canonical payload families: `block-definition`,
`pattern`, `field-adapter`, `inspector`, `design-vocabulary`, and `migration`. Every declaration carries its
bounded owner, namespace, contract/semantic version, capability, compatibility, and dependency metadata.

The contextual target selects that generation; it does not copy contributions into a private palette. A
trusted extension may declare where its target is launched and the exact contribution dependencies that target
admits. `resolveAuthoringTarget` checks those dependencies and version ranges against the immutable generation;
unrelated active contributions are not returned merely because they share an owner or surface. Core and
extension targets resolve identically. Blocks and field adapters remain separate canonical kinds with their own
schemas and lifecycle (`STUDIO-PROD-008`, `009`).

- Collision, namespace, schema, dependency, or trust failure rejects the contribution before session use.
- A required missing contribution prevents write mode; a safe read-only recovery view remains possible.
- Disabling, uninstalling, or revoking a provider removes its targets and executable registrations from new
  resolution but preserves authored artifacts and owned data. Verified reactivation restores a newly compiled
  generation; a stale generation never becomes current again.
- Unresolved nodes remain identifiable and diagnosable; fallback rendering occurs only when declared.
- Declarative contributions are preferred. Executable plugins receive scoped APIs, never the host container.
- Themes expose semantic tokens, viewport roles and recipes, not raw CSS/classes/template source.

## 8. Handle save, conflict and recovery

The contextual surface distinguishes three user outcomes before confirmation (`STUDIO-PROD-006`):

1. save this Entry/content item without changing the reusable type;
2. save the current Model and Blueprint design as a new reusable type, excluding current Entry values; or
3. create a new version of the current reusable type with migration/dependent-entry impact made visible.

These are separate host-authorized transactions, even when one user action coordinates multiple artifact
writes. The host may commit related draft changes atomically, but no generic “save JSON” call may silently turn
an Entry save into a Model or Blueprint publication.

The contextual save intent sends the exact outcome-specific proposed drafts with:

- base/expected revision;
- session and contribution generation;
- idempotency key;
- dependency revision set; and
- the reviewed save-plan identity and accepted consequence codes on confirmation.

The host authorizes and validates again inside the durable transaction. It returns the accepted normalized
revision, a structured validation/policy error, or conflict data. Silent last-write-wins is not conforming.

Local recovery is explicit. A recovery envelope names its base revision, protocol and plugin inventory and is
bounded/checksummed. The host decides whether and how it is encrypted and stored. Reopen validates it against
current contracts before replay; incompatible commands do not run speculatively.

## 9. Accessibility, localization and policy reduction

The host supplies localized labels/catalogues and announces permission changes. A field hidden by policy must
not leak through palette entries, preview, outline, validation counts, clipboard, history, telemetry, resource
search, reference counts or error arguments.

The integration must preserve semantic landmarks, labels, focus order, keyboard commands, live regions,
contrast and reduced-motion preferences. Host chrome cannot make dragging the sole path or intercept Studio
shortcuts without an accessible alternative.

## 10. Production runtime boundary

Browser packages are compiled during build and release. A production deployment copies and serves only the
verified static output through its normal web/CDN path; it does not install an npm package on the server.
Fingerprint assets are immutable and long-cacheable, while HTML and asset manifests use controlled revalidation.
Deployment is atomic: HTML never names a partly copied asset generation, and rollback restores the complete
prior manifest/directory. Verify the declared integrity and size bounds before activation.

Content authors and operators do not run Vite, Node.js, npm, a package-registry client, or a server-side
JavaScript process. All authoritative effects stay in the host application's services and HTTP/API boundary
(`STUDIO-PROD-010`, `011`), and public delivery remains operable without Studio or authoring JavaScript. Kumwe
App's stricter PHP mapping is described in its playbook.

## 11. Lifecycle and compatibility

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

## 12. Generic-host acceptance

Gate B generic-host evidence proves:

- installation from published packages with no private repository paths;
- all required capabilities and explicit degradation when optional ones are absent;
- contextual launch from an extension-declared target with no pre-creation or manual handoff;
- Model/Blueprint/Entry/theme separation, exact reusable-type hydration, and empty values for a new Entry;
- fields, values, bindings, and layout in one session, with explicit Entry/new-type/new-type-version saves;
- create, edit, preview, conflict, publish, recover, and in-context/expanded presentation continuity;
- server and client rendering examples without reverse-parsing DOM;
- media completion/failure, extension target/block/field-adapter/theme lifecycle and unresolved-node behaviour;
- authorization reduction with no hidden-field or hidden-count leakage;
- accessibility, localization, RTL, mobile/touch and keyboard completion;
- migration, interrupted upgrade, rollback and old-document fixtures;
- security, performance and resource-limit matrices; and
- clean-room integration by a developer using only public documentation and packages;
- compiled-browser deployment with zero production Node.js/npm requirement; and
- the integrated acceptance journey in `STUDIO-PROD-015`, not a collection of disconnected harness demos.
