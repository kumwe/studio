# Kumwe App integration playbook

[Kumwe App](https://github.com/kumwe/app) is Studio's first reference host and the hand for which the glove is made. The integration is still
an adapter: public Studio packages contain no Kumwe App PHP classes, database schema, routes, Twig names, KIS
internals, extension manifests, or authorization rules.

This playbook reflects the current Kumwe App direction: Joomla Framework DI/events, Laminas/Mezzio delivery,
Doctrine DBAL, Twig server rendering, focused Lit enhancements, immutable versioned definitions, signed and
trusted extensions, owner-aware contributions, immutable runtime generations, strict public/admin/portal
boundaries, recovery isolation, revision/workflow/translation support, and bounded KIS customization.

The target default is Studio opened directly for the exact managed-content resource being created or edited,
with layout, fields, bindings, and values available in one continuous authoring journey. The sole product
authority is the [Studio product contract](../product-contract.md); this playbook maps
`STUDIO-PROD-001`–`015` to Kumwe App without redefining them.

## Studio integration input

The Studio-side integration input includes the eight-package family, canonical contextual schemas and seven
authoring operations, `openContextualStudioSession`, `<kumwe-studio-contextual>`, 45 first-party blocks, ten
patterns, private Editor.js rich-text adapter, media/resource/preview controls, semantic web renderer, immutable
extension-generation runtime, static-host artifact, and portable conformance corpora. Kumwe App consumes these
through public contracts; it must not reproduce the catalog, expose Editor.js, fork renderer behavior, or
invent a second target/contribution protocol.

Studio remains on the governed beta lane while qualification is completed. The required landing order is:

1. merge and publish one exact eight-package Studio coordinate through the protected release train;
2. atomically pin all eight versions plus the release/corpus digests in Kumwe App;
3. replay the portable corpora through the real App adapters and Twig renderer; and
4. qualify the integrated browser, database, security, media, extension, migration, and rollback matrices.

Until the exact family has accepted qualification evidence, App work is an additive integration candidate
rather than a supported production dependency. Workspace tarballs, mixed prerelease versions, copied runtime,
and a green reference host are not substitutes for a published coordinate and reproduced host evidence.

The adapter is proven, not asserted. `vectors/host/` in `@kumwe/studio-testkit` is the executable
assertion set for [`studio.profile/host-baseline`](../contracts/conformance-profiles.md): language-neutral
JSON that a PHPUnit suite replays against the Kumwe App adapter to prove the persistence and
optimistic-concurrency rules, the request-envelope guards, bounded queries, absence handling, authority
explanation and telemetry discipline. A stale write returning the safe current revision, and an error
that never discloses private resource existence, are corpus assertions rather than review opinions.
Kumwe App integrations that rely on retry, rate-limit, and preview-cancellation guarantees replay the
additive `studio.profile/host-baseline-v2` sequence corpus as well. Its clock advances and renderer
completions are explicit JSON harness controls, so a PHPUnit implementation can reproduce them without
running the TypeScript testbed or inventing a transport route.
The controller layer has a published target as well: the
[host transport binding](../contracts/host-transport.md) fixes the operation names, canonical `POST` bodies,
results, errors, and status mapping, while per-mount configuration supplies Kumwe App's exact endpoint URLs.
The App may use one dispatcher or a closed operation map without changing an application service or wire body.
A vendored copy of the corpus
is verifiable rather than assumed: `corpus-manifest.json` carries the digest of every published fixture
and vector, so a stale or altered copy is detected before it changes what a conformance claim means.

## Architectural covenant

The integration must preserve Kumwe App's existing rules:

1. `ContainerFactory` remains the only composition root; Studio adapters receive dependencies by constructor.
2. Domain depends on nothing; application depends on domain; infrastructure and delivery depend inward.
3. Managed content and business records remain separate. Studio may present both but cannot turn relational
   business aggregates into EAV or untyped universal JSON.
4. Authorization is applied before fields, relations, counts, queries, previews and exports become visible.
5. Every mutation is authenticated, authorized, audited, transactional, concurrency-safe, and idempotent when
   retryable.
6. Trusted extension contributions compile into the existing immutable owner-aware runtime generation. Studio
   must not introduce a parallel extension registry.
7. Disable, uninstall, trust failure, revocation, stale generation and recovery mode remove executable
   contributions while preserving owned data.
8. Public, portal, administrator and recovery surfaces remain separate and deny-by-default.
9. Twig stays strict and auto-escaped; raw output is limited to presenter-guaranteed safe projections.
10. Documents use bounded typed ASTs and semantic KIS/theme choices, never stored executable code, raw Twig,
    unrestricted HTML/CSS, JavaScript, SQL, or hidden service calls. Allowed pasted HTML is normalized into
    Studio safe-markup structures, while scoped styles remain separately authorized renderer context.
11. Every authoritative Studio operation terminates in Kumwe App PHP application services and PHP HTTP
    endpoints; browser JavaScript never becomes a parallel server authority (`STUDIO-PROD-010`).
12. Studio ships as compiled browser assets. Production containers and operators require neither Node.js nor
    npm to install, start, preview, save, publish, or render (`STUDIO-PROD-011`).

## Contextual authoring target

An authorized Kumwe App extension declares the managed-content target on which Studio is available. The host
create/edit action resolves that target to the exact content resource, type/model revision, reusable Blueprint,
Entry revision when editing, design intent, active contribution generation, permissions, presentation state,
and deterministic return route. Studio opens from that action; the author does not pre-create a Blueprint,
visit a disconnected catalogue screen, or manually reconcile identifiers (`STUDIO-PROD-001`, `008`, `012`).

The canonical `authoring-target` declaration and its explicitly admitted block, pattern, field-adapter,
inspector, design-vocabulary, and migration dependencies activate atomically through the same immutable
owner-aware generation and lifecycle (`STUDIO-PROD-008`, `009`). Core and extension targets use identical
resolution; a declaration never grants permission or admits unrelated active contributions.

Within the contextual workspace, Model, Blueprint, and Entry remain separate versioned artifacts but appear as
one coordinated journey. Starting blank creates authorized empty structure and values; starting from a reusable
content type hydrates the exact Model and Blueprint revisions with empty values for a new Entry
(`STUDIO-PROD-002`, `004`, `005`). Layout, field definition/binding, and value entry share the canvas and
inspector under the resolved permissions (`STUDIO-PROD-003`).

Studio's public contextual coordinator and shell preserve these separate drafts and expose the three save
intentions. Kumwe App must prove the behavior through real PHP persistence, policy, extension lifecycle,
preview, media, workflow, Twig delivery, and supported-environment evidence before claiming the integrated
journey (`STUDIO-PROD-014`, `015`).

### Internal authority boundaries

Kumwe App adds a versioned `ContentAuthoringDefinition` beside, not inside, the validation schema. Its supported
modes remain internal permission/artifact boundaries rather than separate products or prerequisite screens:

| Kumwe App choice        | Studio session configuration                | Use                                                                                     |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Existing generated form | No Studio session                           | Current behaviour and recovery-safe fallback                                            |
| Model design            | `mode: model`                               | Authorized draft of a new immutable content-definition version                          |
| Reusable visual layout  | `mode: blueprint`                           | Designer binds stable fields and composition regions to a theme profile                 |
| Guided visual entry     | `mode: content`                             | Author fills bound fields in context without changing locked structure                  |
| Mixed structured/visual | `mode: content`, `composite: hybrid`        | Products/services retain typed business fields while designated regions use composition |
| Inspection/recovery     | appropriate mode, `sessionState: read-only` | Unsupported/missing contributions remain diagnosable without execution                  |

For each supported target, Studio becomes the default create/edit surface. The existing form remains a
transitional fallback for migration, recovery, rollback, or a capability the contextual target cannot yet
provide; it does not redefine the intended workflow. Enabling Studio creates a new authoring-definition revision
and, where structure changes, a new content-type/model revision with an explicit migration plan. Studio never
silently edits a published JSON Schema because a block was dragged onto the canvas.

### Explicit save outcomes

The workspace presents separate host transactions for saving the current item, saving the design as a new
content type, and creating a new version of the current type (`STUDIO-PROD-006`). A content-item save persists
Entry values and any permitted entry-scoped composition without silently mutating the reusable type. A type
save coordinates Model and Blueprint revisions but excludes the current Entry's values. A type-version save
shows migration and dependent-entry consequences before confirmation. Kumwe App authenticates, authorizes,
validates, transacts, revisions, and audits each result independently.

### AP-2 content projection coordinate

The current AP-2 implementation supplies the read-only Content half of the model port. It reaches definitions
through `ContentModelService` and entries through `ContentService`, applies disclosure before projection, and
validates every result against Studio's vendored schemas. It is not a model mutation or Studio-session
implementation, and it is not a published Studio release coordinate yet.

| Kumwe App Content fact        | Studio projection                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Content-type UUID             | `content-model:<lowercase UUID>`                                                     |
| Definition version `N`        | semantic version `0.0.N`                                                             |
| Immutable definition revision | `content-type-vN`                                                                    |
| Entry UUID                    | `content-entry:<lowercase UUID>`                                                     |
| Entry optimistic revision     | `content-entry-vN`                                                                   |
| Schema property `x`           | field ID `data_x`; the reversible source key remains in an App extension             |
| Array property                | `kind: collection`, `cardinality: many`, exact `itemKind`                            |
| Translation group             | `translationOf: content-translation:<UUID>`                                          |
| Workflow state                | portable lifecycle plus the exact reversible App state in `workflowState`/extensions |

AP-2 declares controls rather than asking Studio to infer them. Its portable controls are
`studio.control/single-line-text`, `studio.control/switch`, `studio.control/date`,
`studio.control/date-time`, `studio.control/select` and `studio.control/number`. App-specific controls are
`kumwe.app/media-reference`, `kumwe.app/email`, `kumwe.app/url`, `kumwe.app/uuid` and
`kumwe.app/schema-group`. Studio preserves those identifiers exactly; a namespaced control needs the App's
field-adapter contribution.

`projectBlueprintFieldBindings` consumes that exact coordinate through the read-only host-session model seam.
It does not inspect the App extension to rediscover storage, and it never writes a Content definition,
translation group, workflow state or field policy. If an AP-2 model revision removes or changes a bound field,
the Blueprint binding remains and Studio emits the corresponding stable diagnostic.

BusinessRecord is deliberately not part of AP-2. Its definitions, exact decimal/money/quantity values,
relationships, computed/encrypted fields and purpose-specific BusinessSecurity projection require a separate
application adapter. Reusing the Content projector or importing the two bounded contexts into each other is
not an allowed shortcut.

For business records, the Studio entry is an authorized projection over the application service. Price,
quantity, tax, status, workflow, approvals and relationships remain in typed relational storage. A Blueprint
binding stores a stable field reference; save commands invoke Kumwe App use cases and invariants.

## Studio-to-Kumwe App port mapping

| Studio host area   | Kumwe App implementation responsibility                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session/capability | Application service resolves site/organization, actor, surface, authoring mode, exact revisions, policy, limits and trusted runtime generation                                                              |
| Models             | AP-2 projects existing immutable Content types now; a later separate BusinessRecord adapter applies its own definition and BusinessSecurity rules                                                           |
| Blueprints         | New versioned Blueprint aggregate/repository with ownership, translations where declared, revisions, migrations and dependency pins                                                                         |
| Entries            | Existing content entry/revision/workflow services or typed business application services; never direct DBAL from handlers/templates                                                                         |
| Policy             | Existing capability and record/field/action policy services filter before projection and independently enforce every command                                                                                |
| Persistence        | Application commands use expected revision/ETag, idempotency, transaction and audit; accepted state is returned to Studio                                                                                   |
| Preview            | Dedicated authenticated authoring-preview use case renders the draft through active Twig/KIS/theme renderers with opaque node markers                                                                       |
| Delivery           | PHP presenters and Twig block renderers produce public/portal/admin output; focused Lit modules enhance only declared interactions                                                                          |
| Contributions      | Manifest 6 / SPI 4 admits the canonical authoring target plus blocks, patterns, field adapters, inspectors, design vocabulary, and migrations atomically into the existing owner-aware immutable generation |
| Media              | Kumwe App media service owns stable asset IDs, access, upload/processing, renditions, metadata, retention and audit; Studio supplies the UI/port client                                                     |
| Localization       | Kumwe App catalogue and locale resolution supply UI/block strings; entry translation groups and fallback policy remain authoritative                                                                        |
| References         | Policy-aware content/business application queries expose bounded reference/search contracts, never raw SQL or arbitrary DB filters                                                                          |
| Recovery           | Current protected core renderer and recovery isolation remain available without installed extension or Studio execution                                                                                     |
| API/client         | REST/OpenAPI exposes the same authoring use cases and protocol schemas required by the future Dart/Flutter client                                                                                           |

## PHP-emitted browser deployment

Kumwe App serves the verified prebuilt Studio ES module from its immutable public asset generation. For every
content area that should be editable, PHP renders the ordinary target element and one inert, schema-valid
`StudioDeploymentConfiguration`. The external start module calls `autoMountStudio()`; it contains no App
route, actor, permission, content, or persistence assumption.

The configuration is resolved only after Kumwe App's normal session authentication and target/resource policy
reduction. It supplies the exact launch, complete resolved `StudioConfiguration`, advertised capabilities,
operation routing, authentication projection, and optional target-admitted declarative contributions. Token
projections include required `issuedAt`/`expiresAt` instants with a current positive lifetime no greater than
15 minutes; PHP refuses to emit, and Studio refuses to send, malformed, future, expired, or overlong windows.
For the
normal same-origin profile, the authenticated session remains in a Secure HttpOnly cookie and only the current
CSRF header name/token enters inert JSON. PHP still authenticates and authorizes every request; DOM values are
never authority.

The reference implementation and full PHP construction are in
[`examples/php-authoring-host`](../../examples/php-authoring-host/README.md#emit-one-browser-deployment-configuration-per-mount).
Kumwe App replaces the reference services with its own application boundaries but preserves the emitter's
schema validation, raw-text JSON escaping, body bounds, launch/session context equality, and route/capability
agreement.

An administrator page can emit several independent Studio pairs, including targets contributed by extensions.
Each retains its own resource, draft, history, selection, lifecycle, and transport. An inline/maximized
presentation change preserves the same admitted contextual session; it does not create a disconnected editor.
If a page intentionally emits an empty opted-in target with no transport, Studio opens the built-in blank
local canvas, makes no server request, and can import/download project JSON. A configured HTTP failure never
falls back to that local profile.

## PHP HTTP endpoint and application-service map

Kumwe App gives Studio exact endpoint URLs through each deployment. An `operation-map` may point different
operations at different Mezzio/PSR-15 routes; a `single-endpoint` may point all calls at one dispatcher using
the fixed `X-Studio-Operation` discriminator. `/studio/ports/...` is a reasonable App route layout, not a path
that Studio infers. Every call is canonical `POST` JSON. “AJAX” means the browser uses `fetch` against this same
contract; it does not create a second API. The App's generated OpenAPI document references the vendored Studio
schemas, including the exact
[`authoring-http.schema.json`](../../schemas/authoring-http.schema.json) exchange definitions, rather than
paraphrasing them.

Delivery handlers are thin Mezzio/PSR-15 adapters. They parse a bounded JSON body, run the common
authentication/session, exact-origin/CSRF, rate/body-limit, protocol/generation, and correlation middleware,
then invoke one constructor-injected PHP application service. A handler never queries DBAL, resolves the
container dynamically, performs Twig rendering, owns business rules, or sequences independent repositories to
simulate an application transaction.

### Seven contextual operations

| Route and canonical argument                  | PHP application responsibility                                                                                                                                                                                         | Transaction/concurrency rule                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `authoring/resolve-target` — `request`        | Resolve the active core/extension target against actor, site/organization, surface, exact resource, create/edit intent, permissions, capabilities, presentation, and immutable contribution generation                 | Read snapshot; refuse mismatched context without disclosing a hidden resource                                                            |
| `authoring/list-types` — `query`              | Return policy-filtered exact reusable content-type summaries and opaque cursor                                                                                                                                         | Authorized query predicates apply before rows/counts; no client-side filtering                                                           |
| `authoring/start` — `request`                 | Idempotently allocate or load one contextual session and return exact Model/Blueprint/Entry/type documents, coordinates, policies, contributions, and return context                                                   | Persist any session/draft allocation and accepted idempotency result atomically; `from-type` copies no Entry values                      |
| `authoring/plan-save` — `intent`              | Revalidate full expected coordinates and proposed drafts; calculate affected artifacts, migration/dependent-entry/workflow consequences, confirmation need, and a short-lived plan reference bound to an intent digest | No durable content mutation; plan is actor/context/generation/revision bound and expires or invalidates on any relevant change           |
| `authoring/save-item` — `request`             | Save Entry values and only policy-permitted item composition, normalize through Content or BusinessRecord services, revise, audit, and return the complete reconciled session                                          | One DB transaction; compare all coordinates inside it; idempotency result, audit, and outbox commit with the write                       |
| `authoring/save-new-type-version` — `request` | Create immutable successor Model, Blueprint, and reusable-type revisions after compatibility/migration validation; never include Entry values                                                                          | One coordinated transaction or fail without partial publication; dependency and affected-entry consequences must match the accepted plan |
| `authoring/save-as-new-type` — `request`      | Allocate and persist a new reusable type from Model/Blueprint drafts and authoring policy; never include Entry values                                                                                                  | One coordinated transaction with collision-safe identities, ownership, audit, idempotency, and outbox                                    |

The save routes do not use the envelope's single `expectedRevision`; the accepted plan binds the complete type,
Model, Blueprint, and Entry coordinate set. The application service rejects a changed draft, stale coordinate,
expired plan, missing accepted consequence, policy reduction, stale runtime generation, or plan/key reuse for a
different intent. An exact retry returns the original normalized `AuthoringSaveResult` and does not duplicate a
revision, audit record, event, or webhook.

### Supporting Studio ports

| Routes                                                               | Existing or required PHP service boundary                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `media/list`, `media/get`                                            | Media catalogue query with policy filtering before results, labels, metadata, or counts                                                                                                    |
| `media/authorize-upload`                                             | Media application service checks actor/scope/purpose/type/size/quota and returns one short-lived HTTPS transfer grant before bytes move                                                    |
| `media/complete-upload`, `media/abort-upload`, `media/upload-status` | Verify received bytes, scan/process, mint or poll stable identity, release abandoned grants, and audit; JSON endpoints never receive file bytes                                            |
| `media/import-external`                                              | Disabled by default; hardened server fetcher revalidates every redirect/DNS result and enforces SSRF, timeout, type, and size policy                                                       |
| `preview/render`, `preview/cancel`                                   | Dedicated authenticated preview application service stages/loads the exact draft digest and renders through trusted PHP/Twig/KIS mappings; cancellation is attempt/session/resource scoped |
| `resource/search`, `model/list`, `model/get`                         | Content or BusinessRecord query services return bounded disclosure-safe projections; definitions remain separate bounded contexts                                                          |
| `permission/explain`, `permission/refresh`                           | Canonical policy service explains only safe reasons and rotates the session generation when authority changes                                                                              |
| `localization/messages`                                              | Host catalogue resolves allowed namespaces for the negotiated locale/fallback chain                                                                                                        |
| `recovery/load`, `recovery/store`, `recovery/discard`                | Protected encrypted/expiring recovery repository, separate from accepted content and unavailable in recovery isolation where policy forbids it                                             |
| `telemetry/emit`                                                     | Optional allowlisted, consent-aware, redacted event sink; authoring never depends on success                                                                                               |
| `artifact/*`                                                         | Single-artifact compatibility plus separately authorized publish/unpublish; never used to emulate the three contextual saves                                                               |

The normal mounted runtime validates the deployment, constructs the configured browser adapter, and resolves
the target. Existing edit launches start directly. Create launches use the same mounted surface to search and
page the policy-filtered reusable-type catalogue and choose blank or one exact type before start; the contextual
editor replaces that chooser in place. Its public return request carries only Kumwe App's opaque
`returnContext`, so PHP/application chrome retains dirty-work and navigation authority. Kumwe App does not
manually assign a detached snapshot to a custom element or derive a base URL in JavaScript.
`createBrowserHttpHostAdapter`,
`createHttpHostAdapter`, and `openContextualStudioSession` remain advanced/test composition seams for code that
already owns the session. Production adapters accept explicit routing configuration only; conventional
base-path expansion belongs exclusively to testkit fixtures.

`@kumwe/studio-testkit` supplies the executable reference responder and language-neutral corpora for PHPUnit
replay; it is not installed or run as a Kumwe App production service. The
[`examples/php-authoring-host`](../../examples/php-authoring-host/README.md) boundary is the executable PHP
starting point; Kumwe App must replace its example services with the real identity, policy, persistence,
transaction, workflow, renderer, and outbox authorities.

### Request pipeline and failure contract

Every request passes, in order, through:

1. method/content-type/body-byte/depth validation and a route from the closed operation registry;
2. the existing administrator or portal authentication boundary with secure session rotation/revocation;
3. exact allowed-origin, fetch-metadata, and CSRF validation for cookie-authenticated browser calls;
4. canonical envelope/argument schema validation and protocol/operation/capability matching;
5. authoritative lookup of `resourceContextKey`, session generation, actor, site/organization, surface, target,
   runtime generation, and current policy;
6. the application command/query with deadline, cancellation, transaction, idempotency, audit, and outbox rules;
7. canonical result/error serialization, correlation, safe logging, and security headers.

No submitted actor, permission, site, organization, scope, workflow state, target owner, generation, or return
URL grants authority. The resource-context key is opaque but not a bearer secret. Cookie-authenticated calls do
not use credentialed wildcard CORS. Resource keys, revisions, plan IDs, and idempotency keys remain in the JSON
body and never enter URLs or access-log query strings.

Map application failures to canonical `HostPortError`: unauthenticated `401`, forbidden `403`, non-enumerating
not-found `404`, conflict `409` with the safe current revision/coordinate, limit `413`, validation `422`, rate
limit `429` with a safe retry delay, dependency outage `502/503/504`, and safe internal fallback. Never emit
stack traces, SQL, database constraint names, filesystem paths, credentials, private record existence, hidden
field values, raw request bodies, or webhook/media secrets. `studio.host/stale-session-generation` invalidates
the full browser handle and forces a new launch.

### Workflow, publication, public rendering, and webhooks

These are Kumwe App application concerns outside the closed browser `HostAdapter` routes:

- **Workflow/publication:** accepted Studio save returns draft coordinates. Existing Content/BusinessRecord
  commands perform review, approval, scheduling, translation, publish, and unpublish with their own permission,
  step-up/approval, expected-version, audit, and idempotency rules. Save never silently publishes.
- **Public delivery:** a normal public/portal/admin PHP route loads the accepted Entry plus pinned Model,
  Blueprint, theme, renderer, media, and contribution generation. PHP presenters and strict auto-escaped Twig/KIS
  mappings emit semantic HTML and scoped assets; essential behavior works without Studio or client JavaScript.
- **Webhooks/integration events:** the save/type/publication transaction writes the existing transactional outbox
  with versioned event ID/type/schema, actor/system and site/organization context, aggregate coordinates,
  correlation/causation, sensitivity, and canonical payload checksum. Leased PHP workers deliver signed
  webhooks after commit with inbox/idempotency support, bounded retry/backoff, dead-letter/operator controls,
  replay authorization, and generation leases. The browser never sends a webhook or holds a webhook secret.

Handlers for those surfaces call the same PHP application services and policy runtime as Studio, REST/OpenAPI,
CLI, MCP, jobs, and events. Adapter parity is an architecture requirement: no rule may live only in a Studio
controller, Twig template, Lit component, webhook worker, or JavaScript client.

### Static assets and CSP

Build the exact Studio family in CI/release, copy only the verified standalone `dist/` output (or an equivalent
host build) into Kumwe App's immutable public asset generation, and deploy it atomically with
`studio-assets.json`/`build-manifest.json`. PHP serves the HTML/manifest and fingerprinted JS/CSS; no production
image installs Node.js, npm, Vite, or an npm registry client, and no server-side JavaScript process starts.

The authoring response permits only its fingerprinted same-origin assets, required same-origin port calls, and
explicitly predeclared media-transfer origins needed by host-owned upload grants; signed URLs never widen CSP
with a wildcard. It uses strict Trusted Types/CSP without `unsafe-eval` and retains the App's
base/form/object/frame restrictions.
The dedicated preview response alone permits same-origin framing and applies its own `frame-ancestors 'self'`,
no-store/no-index, sandbox, origin-pinned handshake, short-lived grant, and restricted navigation/form/pop-up/
download/network policy. Public, portal, administrator, and recovery responses do not weaken their framing policy
for Studio.

When the App owns identifier allocation for a `studio-insert-request`, it executes the resulting canonical
command and calls the shell's public `selectNode()` seam with the accepted node identifier. That keeps the
Inspector, outline, keyboard focus model and preview selection aligned with Studio-owned insert commands;
the host does not query or mutate the shell's shadow DOM.

## Template and design-profile integration

Kumwe App templates contribute a versioned Studio design profile that extends the KIS/template contract with:

- semantic viewport roles and inheritance;
- permitted grid spans and layout behaviours;
- color, type, space, size, surface, motion and emphasis tokens;
- block recipes and reusable patterns;
- supported block/version/renderer ranges;
- preview widths, labels and assets;
- accessibility constraints and compatibility evidence; and
- aliases/migrations for renamed tokens, recipes and viewports.

Blueprints store semantic choices such as `text.price.prominent`, not template classes or CSS declarations.
The selected template maps these choices to trusted Twig markup and package-scoped styles. Changing templates
first produces a compatibility report. Missing required block, recipe, token, viewport or renderer semantics
block publication until an explicit migration or compatible template is selected.

The active template, KIS and extension renderer retain their separate ownership:

- template supplies shell and design profile;
- KIS supplies public component and interaction contracts;
- extension supplies owned block schema, presenter/renderer and optional focused enhancement;
- Studio supplies visual authoring and typed intent; and
- Kumwe App application services supply authorized data.

## Live preview and CSP

Kumwe App currently denies framing globally and permits same-origin scripts/styles under a strict CSP. Studio must
not weaken that policy for the whole application.

Add a dedicated authoring-preview response with all of these properties:

- authenticated and authorized for one actor, resource, site/organization and draft revision;
- short-lived, single-purpose preview grant with replay protection;
- same-origin framing only (`frame-ancestors 'self'` and an equivalent frame policy);
- no-store caching and no indexing;
- same-origin assets from the active trusted runtime generation;
- sandbox restrictions that prevent uncontrolled navigation, forms, pop-ups and downloads;
- protocol-version/origin/session handshake and strict message schemas;
- opaque `data` markers mapping rendered regions to node IDs without exposing hidden field values; and
- automatic invalidation after permission, trust, theme, contribution or runtime-generation change.

Normal administrator, portal, public and recovery responses retain the stronger framing policy. Cross-origin
preview is not part of the Kumwe App Gate B profile.

## Extension contribution shape

Studio contributions extend Kumwe App's typed, owner-aware contribution system. An extension first declares
the host authoring target and the surfaces/modes on which its contributions are available; a block declaration
then includes:

- namespaced stable ID, owner and contract/semantic version;
- localized label/help/category keys and icon reference;
- closed property schema, field-binding ports and named slots;
- parent/child, count, depth, query and resource limits;
- required capabilities, surface and allowed authoring modes;
- supported theme/KIS/renderer ranges;
- trusted presenter/Twig renderer and declared immutable assets;
- optional focused Lit enhancement or schema-driven inspector;
- migration, compatibility, fallback and unresolved-node policy; and
- deterministic ordering and diagnostics.

Most blocks should be declarative and receive generated inspectors. Custom authoring code is an advanced,
signed capability. Provider code never receives the service container or mutates a registry during a request.

Activation atomically compiles targets and all admitted payloads into one immutable generation.
Disable/uninstall/revocation removes targets, executable renderers/assets/plugins, and contributions from new
resolution; stored Model, Blueprint, Entry, and owned host data remains. Verified reactivation creates a new
generation. The administrator shows an unresolved block with owner/version and a diagnostic. Public rendering
uses only an explicitly declared safe fallback; otherwise it suppresses the block and emits an operator
diagnostic without leaking content or crashing the page.

### Current Kumwe App contract reconciliation

Kumwe App's frozen manifest schema 5 / contribution SPI 3 paraphrases all six Studio contribution families
through host-native declarations: blocks, patterns, field controls, inspectors, design vocabularies, and
composition migrations. The block declaration's property map (`maximum_length`, per-property `required`,
`choice`, and host `reference` kinds) is one concrete mismatch, but it is not the only boundary to reconcile.
Those six legacy shapes are bounded Kumwe App contracts; they are not the canonical Studio
`block-definition`, `pattern`, `field-adapter`, `inspector`, `design-vocabulary`, and `migration` documents and
must not be described or consumed as though the formats were identical.

The correction is additive because Kumwe App's frozen generations are compatibility promises:

| Boundary               | Required treatment                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App manifest 5 / SPI 3 | Freeze the accepted manifest bytes, registrar API, runtime-generation behavior, and all six legacy declaration shapes unchanged.                                                                                                                                                      |
| App manifest 6 / SPI 4 | Add a new generation carrying canonical Studio `authoring-target`, `block-definition`, `pattern`, `field-adapter`, `inspector`, `design-vocabulary`, and `migration` resource documents; a block carries the complete canonical `propertySchema` rather than the legacy property map. |
| Host bindings          | Keep owner/trust, PHP presenter and Twig renderer bindings, application-service references, and content/media/business reference policy in separate Kumwe App-owned binding metadata; do not invent Studio or JSON Schema keywords for them.                                          |
| Exact validation       | Validate every resource against its matching published Studio schema, verify the vendored `corpus-manifest.json`, and replay every applicable corpus group, including `vectors/schema-profile/`, before claiming conformance.                                                         |
| Legacy adapter         | Translate a manifest 5 / SPI 3 declaration only when the complete mapping is deterministic and lossless. Fail closed and require an explicit manifest 6 / SPI 4 declaration when any canonical meaning would be inferred, defaulted, widened, or discarded.                           |
| Generation admission   | Admit all canonical resources and host bindings atomically into one immutable owner-aware generation; disagreement rejects the owning contribution rather than publishing a partial translation.                                                                                      |

Blocks and field adapters do not implicitly create a target, an active target admits only its declared
dependencies, and host binding metadata does not become portable Studio data.

Until manifest 6 / SPI 4, exact schema validation, target declaration, and corpus replay exist in Kumwe App, its composition
contribution Gate A item is an integration blocker rather than evidence that the Studio profile is implemented.
Studio does not weaken its portable schema contract to make the older host-specific declaration equivalent.

## Media integration

The complete media user experience belongs in Studio, while authoritative media operations belong in Kumwe App.
Kumwe App supplies a first-class media port supporting browse/search, upload session, streaming/progress,
cancel/retry, processing status, stable asset references, metadata, alternative/decorative text, captions,
focal points, renditions, replacement/versioning, permissions, lifecycle and audit.

Studio's candidate already supplies the reusable field controller and live authoring controls for those
workflows. The App adapter provides the authenticated `MediaProvider` and `MediaUploadTransport`; it does not
build a second picker or let the browser bypass the existing media application service.

The authoring document stores the stable media reference and presentation intent. It does not store a temporary
upload URL, filesystem path, raw byte payload, signed download URL, image-processing command, or private
metadata. Details and the ownership split are in [`../media/README.md`](../media/README.md).

## Existing code transition

Kumwe App keeps the current generated content form, rich-text component and media picker operational until the new
path passes Gate B and content migration/rollback evidence. Integration proceeds additively:

1. add protocol and host ports without changing existing content-type behaviour;
2. add Blueprint/authoring-definition persistence and read-only diagnostics;
3. add authenticated preview and public Twig block rendering;
4. make Studio the default create/edit surface for supported declared targets, with the old form retained only
   as the named transitional fallback;
5. prove save/revision/workflow/translation/permission/media/extension lifecycle;
6. bind Studio's shipped rich-text/media/resource controls to Kumwe App adapters while Kumwe App continues to
   own routes, security, persistence and policy; Editor.js remains private to Studio;
7. qualify old and new paths together; and
8. retire a legacy editor only after every stored form/content shape has a tested fallback or migration.

### Code that may move into Studio

- generic Lit rich-text authoring, media-selection UI, uploader interaction, canvas/outline/inspector controls;
- generic schema-to-control mapping, command/history/selection, preview bridge, protocol validation;
- host-neutral accessibility behaviours, design-token chooser and contribution authoring test kit.

### Code that remains in Kumwe App

- content/business domain definitions, validation policy, repositories and workflows;
- authentication, authorization, step-up, CSRF, audit, transactions, ETags and idempotency;
- media storage/processing/retention and stable asset identity;
- Twig/KIS rendering, template activation, public navigation and site/portal/admin boundaries;
- extension trust/signing/install/upgrade/runtime generation/recovery;
- REST/OpenAPI, CLI, MCP and Flutter-facing application use cases; and
- database migrations, backup/restore and operational diagnostics.

## Kumwe App integration phases

Production activation starts after Studio Gate A. Additive adapter work may proceed beforehand on coordinated
integration branches, but it remains a discovery/integration candidate and cannot become a supported runtime
dependency until the contract and exact release coordinate are accepted.

| Studio package  | Kumwe App integration result                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M3-05`         | Additive host-port, persistence, preview, policy and API seams; existing editors remain an explicitly transitional fallback while contextual coverage is incomplete |
| `M5-06`         | Landing and product/service vertical slices using real extensions, themes, media, workflow and Twig                                                                 |
| `M6-01`–`M6-05` | Migration, security, accessibility, performance, release, restart, backup/restore and rollback evidence                                                             |
| Gate B          | Studio packages and the Kumwe App profile are eligible for release/integration merge                                                                                |

## Kumwe App Gate B proof

The integration is not complete until evidence proves:

1. Existing form content remains readable/editable before, during and after opt-in.
2. A four-to-two-to-one landing layout renders through two compatible template profiles.
3. A reusable product/service Blueprint binds typed money, text, media and collection/reference fields without
   duplicating the business record into untyped application JSON.
4. An extension block installs disabled, activates, edits/renders, disables, becomes unresolved without data
   loss, reactivates, upgrades, and uninstalls with owned data preserved.
5. Administrator, portal, REST/OpenAPI and future Dart client use the same application semantics where the
   operation is exposed.
6. Save, revision, translation, workflow, publication, conflict, permission reduction, audit and recovery are
   exercised against real persistence.
7. Twig public output is accessible and usable without Studio or client-side rendering.
8. CSP, XSS, malicious artifact/theme/extension/media, stale preview and revoked-trust tests fail closed.
9. PHP/Twig and Lit assets remain deterministic, same-origin and bound to the trusted runtime generation.
10. Supported MariaDB/MySQL/PostgreSQL, desktop/mobile browser, localization, accessibility, backup/restore,
    restart, upgrade and rollback matrices are green.
11. Create/edit launches Studio from an extension-declared target, and supported inline/expanded presentation
    changes preserve resource identity, selection, authority, unsaved work, and return route.
12. Blank and reusable-type starts, exact empty-value hydration, layout plus field/value authoring, and all
    three explicit save outcomes complete without a disconnected screen or manual data transfer.
13. An extension-contributed block and field adapter participate in the same target/generation lifecycle.
14. The accepted PHP/Twig path starts from compiled assets and completes with zero production Node.js/npm
    requirement.
15. The exact integrated journey satisfies `STUDIO-PROD-015`; standalone harness evidence is insufficient.
