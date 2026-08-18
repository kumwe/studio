# Kumwe CMS integration playbook

Kumwe CMS is Studio's first reference host and the hand for which the glove is made. The integration is still
an adapter: public Studio packages contain no Kumwe PHP classes, database schema, routes, Twig names, KIS
internals, extension manifests, or authorization rules.

This playbook reflects the current Kumwe direction: Joomla Framework DI/events, Laminas/Mezzio delivery,
Doctrine DBAL, Twig server rendering, focused Lit enhancements, immutable versioned definitions, signed and
trusted extensions, owner-aware contributions, immutable runtime generations, strict public/admin/portal
boundaries, recovery isolation, revision/workflow/translation support, and bounded KIS customization.

The adapter is proven, not asserted. `vectors/host/` in `@kumwe/studio-testkit` is the executable
assertion set for [`studio.profile/host-baseline`](../contracts/conformance-profiles.md): language-neutral
JSON that a PHPUnit suite replays against the Kumwe adapter to prove the persistence and
optimistic-concurrency rules, the request-envelope guards, bounded queries, absence handling, authority
explanation and telemetry discipline. A stale write returning the safe current revision, and an error
that never discloses private resource existence, are corpus assertions rather than review opinions.
The controller layer has a published target as well: the
[host transport binding](../contracts/host-transport.md) fixes the `POST {baseUrl}/ports/{port}/{operation}`
route shape, the request and result bodies, and the status mapping in both directions, so the routes and
OpenAPI document Kumwe writes now do not become a breaking change later.

## Architectural covenant

The integration must preserve Kumwe's existing rules:

1. `ContainerFactory` remains the only composition root; Studio adapters receive dependencies by constructor.
2. Domain depends on nothing; application depends on domain; infrastructure and delivery depend inward.
3. CMS content and business records remain separate. Studio may present both but cannot turn relational
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
    arbitrary HTML/CSS/JavaScript, SQL, or hidden service calls.

## Target authoring model

Kumwe adds a versioned `ContentAuthoringDefinition` beside, not inside, the validation schema. Its supported
modes map to Studio as follows:

| Kumwe choice            | Studio session configuration                | Use                                                                                     |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Existing generated form | No Studio session                           | Current behaviour and recovery-safe fallback                                            |
| Model design            | `mode: model`                               | Authorized draft of a new immutable content-definition version                          |
| Reusable visual layout  | `mode: blueprint`                           | Designer binds stable fields and composition regions to a theme profile                 |
| Guided visual entry     | `mode: content`                             | Author fills bound fields in context without changing locked structure                  |
| Mixed structured/visual | `mode: content`, `composite: hybrid`        | Products/services retain typed business fields while designated regions use composition |
| Inspection/recovery     | appropriate mode, `sessionState: read-only` | Unsupported/missing contributions remain diagnosable without execution                  |

Existing content types default to the current form path. Enabling Studio creates a new authoring-definition
revision and, where structure changes, a new content-type/model revision with an explicit migration plan.
Studio never silently edits a published JSON Schema because a block was dragged onto the canvas.

For business records, the Studio entry is an authorized projection over the application service. Price,
quantity, tax, status, workflow, approvals and relationships remain in typed relational storage. A Blueprint
binding stores a stable field reference; save commands invoke Kumwe use cases and invariants.

## Port-to-Kumwe mapping

| Studio host area   | Kumwe implementation responsibility                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session/capability | Application service resolves site/organization, actor, surface, authoring mode, exact revisions, policy, limits and trusted runtime generation      |
| Models             | Existing immutable content types plus the business-definition runtime; adapters project only protocol-approved field metadata                       |
| Blueprints         | New versioned Blueprint aggregate/repository with ownership, translations where declared, revisions, migrations and dependency pins                 |
| Entries            | Existing content entry/revision/workflow services or typed business application services; never direct DBAL from handlers/templates                 |
| Policy             | Existing capability and record/field/action policy services filter before projection and independently enforce every command                        |
| Persistence        | Application commands use expected revision/ETag, idempotency, transaction and audit; accepted state is returned to Studio                           |
| Preview            | Dedicated authenticated authoring-preview use case renders the draft through active Twig/KIS/theme renderers with opaque node markers               |
| Delivery           | PHP presenters and Twig block renderers produce public/portal/admin output; focused Lit modules enhance only declared interactions                  |
| Contributions      | New Studio block/pattern/theme-profile contribution kinds extend the existing typed owner-aware SPI and immutable generation                        |
| Media              | Kumwe media service owns stable asset IDs, access, upload/processing, renditions, metadata, retention and audit; Studio supplies the UI/port client |
| Localization       | Kumwe catalogue and locale resolution supply UI/block strings; entry translation groups and fallback policy remain authoritative                    |
| References         | Policy-aware content/business application queries expose bounded reference/search contracts, never raw SQL or arbitrary DB filters                  |
| Recovery           | Current protected core renderer and recovery isolation remain available without installed extension or Studio execution                             |
| API/client         | REST/OpenAPI exposes the same authoring use cases and protocol schemas required by the future Dart/Flutter client                                   |

## Template and design-profile integration

Kumwe templates contribute a versioned Studio design profile that extends the KIS/template contract with:

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
- Kumwe application services supply authorized data.

## Live preview and CSP

Kumwe currently denies framing globally and permits same-origin scripts/styles under a strict CSP. Studio must
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
preview is not part of the Kumwe Gate B profile.

## Extension contribution shape

Studio contributions extend Kumwe's one contribution family. A block declaration includes:

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

Activation compiles one immutable generation. Disable/revocation removes executable renderers/assets/plugins;
stored Blueprint and entry data remains. The administrator shows an unresolved block with owner/version and a
diagnostic. Public rendering uses only an explicitly declared safe fallback; otherwise it suppresses the block
and emits an operator diagnostic without leaking content or crashing the page.

## Media integration

The complete media user experience belongs in Studio, while authoritative media operations belong in Kumwe.
Kumwe supplies a first-class media port supporting browse/search, upload session, streaming/progress,
cancel/retry, processing status, stable asset references, metadata, alternative/decorative text, captions,
focal points, renditions, replacement/versioning, permissions, lifecycle and audit.

The authoring document stores the stable media reference and presentation intent. It does not store a temporary
upload URL, filesystem path, raw byte payload, signed download URL, image-processing command, or private
metadata. Details and the ownership split are in [`../media/README.md`](../media/README.md).

## Existing code transition

Kumwe keeps the current generated content form, rich-text component and media picker operational until the new
path passes Gate B and content migration/rollback evidence. Integration proceeds additively:

1. add protocol and host ports without changing existing content-type behaviour;
2. add Blueprint/authoring-definition persistence and read-only diagnostics;
3. add authenticated preview and public Twig block rendering;
4. expose Studio only for explicitly opted-in authoring definitions;
5. prove save/revision/workflow/translation/permission/media/extension lifecycle;
6. migrate the reusable rich-text/media authoring UI into Studio packages while Kumwe adapters continue to
   own routes, security and persistence;
7. qualify old and new paths together; and
8. retire a legacy editor only after every stored form/content shape has a tested fallback or migration.

### Code that may move into Studio

- generic Lit rich-text authoring, media-selection UI, uploader interaction, canvas/outline/inspector controls;
- generic schema-to-control mapping, command/history/selection, preview bridge, protocol validation;
- host-neutral accessibility behaviours, design-token chooser and contribution authoring test kit.

### Code that remains in Kumwe

- content/business domain definitions, validation policy, repositories and workflows;
- authentication, authorization, step-up, CSRF, audit, transactions, ETags and idempotency;
- media storage/processing/retention and stable asset identity;
- Twig/KIS rendering, template activation, public navigation and site/portal/admin boundaries;
- extension trust/signing/install/upgrade/runtime generation/recovery;
- REST/OpenAPI, CLI, MCP and Flutter-facing application use cases; and
- database migrations, backup/restore and operational diagnostics.

## Kumwe integration phases

Durable work starts after Studio Gate A.

| Studio package  | Kumwe integration result                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `M3-05`         | Additive host-port, persistence, preview, policy and API seams; existing editors remain default         |
| `M5-06`         | Landing and product/service vertical slices using real extensions, themes, media, workflow and Twig     |
| `M6-01`–`M6-05` | Migration, security, accessibility, performance, release, restart, backup/restore and rollback evidence |
| Gate B          | Studio packages and the Kumwe profile are eligible for release/integration merge                        |

## Kumwe Gate B proof

The integration is not complete until evidence proves:

1. Existing form content remains readable/editable before, during and after opt-in.
2. A four-to-two-to-one landing layout renders through two compatible template profiles.
3. A reusable product/service Blueprint binds typed money, text, media and collection/reference fields without
   duplicating the business record into CMS JSON.
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
