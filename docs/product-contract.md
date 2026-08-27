# Studio product contract

- Contract version: `STUDIO-PROD-1.0-draft`
- Status: normative product target; implementation and qualification remain incomplete

## Authority

This document is the sole normative authority for Studio's product intent and minimum end-to-end authoring
outcome. Other product, architecture, experience, integration, and roadmap documents may explain or plan this
contract, but they MUST NOT narrow, reorder, or redefine it.

Canonical schemas remain the sole authority for serialized shape, the normative documents in
[`docs/contracts/`](contracts/) remain the authority for protocol semantics and observable behaviour, and
[`docs/roadmap/STATUS.md`](roadmap/STATUS.md) remains the sole authority for implementation, conformance,
release, and gate status. A requirement in this document is not evidence that the corresponding behaviour has
landed.

Requirement identifiers are stable within `STUDIO-PROD-1`. A future contract that changes a requirement's
meaning MUST publish a new contract version and an explicit replacement mapping; it MUST NOT silently reuse an
identifier.

## Product boundary

Studio is a reusable, host-embeddable page builder and the contextual content-authoring surface for an
integrating host. In Kumwe App, Studio is the target authoring surface for managed content based on Kumwe
content types. It coordinates model, Blueprint, and entry work as one authoring journey while preserving their
separate identities, revisions, permissions, migrations, and publication boundaries.

The host remains authoritative for identity, authorization, content and business definitions, persistence,
workflow, revision, audit, media custody, preview, publication, and public rendering. Studio never becomes a
CMS, database, business-record store, or server-side JavaScript application.

Editor.js is Studio's private internal rich-text implementation. Hosts and extensions MUST interact only with
Studio's canonical rich-text contracts and controls; they MUST NOT configure Editor.js directly, import its
native state as a host contract, or persist dependency-native Editor.js data as authoritative content.

## Normative requirements

### Contextual authoring

- **`STUDIO-PROD-001` — Contextual authoring is the default.** Creating or editing managed content MUST offer
  Studio for that exact host resource in its normal content workflow. The host MAY embed Studio in the
  originating editor or continue from New/Edit content to a dedicated, context-preserving Studio URL. Studio
  MUST NOT appear as a first-class or top-level navigation workspace for ordinary authoring, and authors MUST
  NOT start there to find or reconnect the current item. Advanced reusable-type governance MAY exist as a
  separate administrative surface, but it is not the content-editor entry point.
- **`STUDIO-PROD-002` — Blank or reusable-type creation.** New content MUST be able to start either from an
  authorized blank canvas or from an existing Kumwe content type in the same launch flow. Selecting a content
  type MUST load its reusable structure, fields, bindings, authoring policy, and compatible design intent
  without copying values from a previous Entry.
- **`STUDIO-PROD-003` — Layout, typed fields, and Entry values in one session.** An authorized author MUST be
  able to arrange layout, insert and configure blocks, define or bind typed fields, and populate actual Entry
  values in one continuous Studio session. Model, Blueprint, and Content modes remain permission and
  artifact-authority boundaries inside that session; they are not prerequisite products or manual hand-off
  stages.
- **`STUDIO-PROD-004` — Reusable content types coordinate separate artifacts.** In host-facing product
  language, a Kumwe content type associates one exact Content Model revision, one exact Blueprint revision,
  and authoring policy. Studio MUST keep the Model and Blueprint separately identifiable, immutable when
  published, and independently governed even when the interface presents them as one reusable choice. The
  reusable content type MUST exclude every Entry's values.
- **`STUDIO-PROD-005` — Exact type-version resolution and value hydration.** Editing an existing item MUST
  resolve the exact reusable-content-type version and exact Model, Blueprint, and Entry revisions accepted for
  that item, then hydrate that Entry's values. Studio MUST NOT silently substitute a newer type version,
  reconstruct values from rendered output, or mix values from another Entry. Creating from a reusable type
  MUST instantiate empty Entry values unless explicit host-owned defaults apply.
- **`STUDIO-PROD-006` — Explicit save outcomes.** The interface MUST distinguish at least **save item**,
  **save new type version**, and **save as new type**. It MUST show the affected artifacts and consequences
  before confirmation, and reconcile the host's accepted revisions afterward. Save item MUST NOT silently
  mutate the reusable type; save new type version MUST create immutable successors under host migration and
  dependent-entry policy; save as new type MUST exclude current Entry values.

### Workspace presentation

- **`STUDIO-PROD-007` — Inline, minimized, maximized, and fullscreen continuity.** The same resource-bound
  authoring session MUST support the presentation states the host declares, including inline, minimized,
  maximized, and fullscreen where offered. Moving between states or a context-preserving route MUST retain the
  resource and artifact coordinates, selection, history, dirty and validation state, locale, session authority,
  unsaved work, and deterministic return context.
- **`STUDIO-PROD-008` — Generic core and extension Studio target declaration.** A host MUST use one generic
  target contract to declare every content resource for which Studio is available, whether the target is owned
  by the host core or an extension. A target declaration MUST identify its qualified target and resource
  context, create/edit eligibility, permitted authoring modes, presentation states, save outcomes, required
  capabilities, and contribution dependencies. Core and extension targets MUST enter the same deterministic,
  owner-aware resolution path; integrations MUST NOT hard-code a weaker one-off editor per content area.

### Contributions and reuse

- **`STUDIO-PROD-009` — Extension blocks, field adapters, and patterns follow the canonical lifecycle.**
  Extension contributions of all six canonical kinds—`block-definition`, `pattern`, `field-adapter`,
  `inspector`, `design-vocabulary`, and `migration`—MUST use Studio's existing registration, validation,
  capability, owner, activation, generation, disable, upgrade, uninstall, unresolved, and migration rules.
  Extension blocks, field controls, and reusable patterns MUST therefore compose through the same lifecycle as
  every other contribution. Active authorized contributions MUST appear only for resolved targets, surfaces,
  and modes that admit them. Disabling or removing an owner MUST preserve unresolved authored intent for
  diagnosis and migration rather than silently changing meaning.

### Host and runtime authority

- **`STUDIO-PROD-010` — Host authority and authoritative API operations.** Studio MUST request every durable
  effect through declared host ports and APIs. The host MUST independently authenticate, authorize, validate,
  transact, version, audit, and apply every load, create, save, type-definition, migration, workflow, media,
  preview, webhook, publication, and rendering operation. Kumwe App MUST implement those server operations in
  PHP application services exposed through PHP HTTP endpoints; browser JavaScript MUST NOT become a parallel
  server authority or bypass PHP policy and persistence.
- **`STUDIO-PROD-011` — Compiled browser delivery and zero production Node.js/npm.** Node.js and npm are
  contributor, build, test, and release tools only. Official Studio browser assets MUST be compiled before
  deployment. A production host, container, operator, or content author MUST NOT need Node.js, npm, Vite, a
  development server, or a server-side JavaScript process to install, start, operate, preview, save, publish,
  render, or deliver Studio-authored content. Public rendering MUST remain independent of the authoring runtime
  and preserve its declared no-JavaScript fallback.
- **`STUDIO-PROD-012` — No pre-creation, copy-paste, or manual reconciliation.** A host MUST NOT require an
  author to pre-create a Blueprint or content type elsewhere, copy composition or values between tools, visit a
  catalogue-level Studio page first, or repair accepted revisions manually across disconnected screens. Type
  selection, blank creation, conflicts, save results, and return navigation belong to the contextual flow.

### Accessible operation

- **`STUDIO-PROD-013` — Accessible keyboard and non-drag parity.** Every authoring operation permitted by the
  resolved session MUST have accessible pointer, keyboard, and explicit structural-control paths; touch and
  assistive-technology behavior MUST be provided where the target device requires it. Dragging MUST never be
  the only way to insert, move, configure, or remove content. Focus, announcements, directionality, zoom, and
  reflow MUST remain usable across the declared presentation states.

### Truthful delivery

- **`STUDIO-PROD-014` — Truthful capability and status labeling.** Documentation, UI labels, changelogs,
  release records, and readiness claims MUST distinguish product target, repository-verified primitive,
  integrated journey, published package, conformance claim, and accepted gate. A standalone Blueprint canvas,
  read-only Model projection, compiled shell, target declaration, or legacy editor fallback MUST NOT be
  described as completed contextual authoring. A fallback MAY remain for migration, recovery, unsupported
  capability, or rollback only when it is labeled as transitional or exceptional.

## Canonical acceptance journey

**`STUDIO-PROD-015` — Executable end-to-end acceptance.** A release or host integration MUST NOT claim this
product contract until the exact integrated system executes and records every step below as one acceptance
journey:

1. Start a clean production host whose runtime contains no Node.js or npm requirement.
2. Resolve one core target and one extension-owned target through the same declaration mechanism, then choose an
   existing item and open Studio directly in that item's normal content context.
3. Verify that the item hydrates its exact reusable-content-type, Model, Blueprint, and Entry revisions and
   actual values rather than the latest available type.
4. Change layout, add or configure a typed field, change its Entry value in the same session, choose save item,
   reopen the item, and observe every host-accepted revision without changing the reusable type.
5. Create an item from an existing reusable content type and receive its exact structure and fields with no
   previous Entry values.
6. Create an item from a blank canvas, insert layout and content blocks, add or bind authorized typed fields,
   and enter values without leaving Studio or pre-creating another artifact.
7. Choose save as new type, create another item from the accepted type, and receive its structure and fields
   with empty Entry values.
8. Choose save new type version and observe immutable successor revisions plus visible migration and
   dependent-entry consequences before confirmation.
9. Move through every declared inline, minimized, maximized, and fullscreen state without losing coordinates,
   selection, history, dirty state, validation, authority, unsaved work, or return context.
10. Activate authorized extension `block-definition`, `field-adapter`, and `pattern` contributions, use the
    contributed block and field control, save and render the result, then prove deterministic disable,
    unresolved, upgrade, and migration behavior.
11. Prove equivalent pointer, keyboard, structural-control, and required assistive-technology outcomes.
12. Record that every accepted durable effect passed through the authoritative host API and, for Kumwe App,
    through PHP application services and PHP HTTP endpoints.

## Current implementation relationship

This contract deliberately describes the required product, not the current implementation. At the time this
contract was introduced, the repository contained substantial standalone Blueprint, block, pattern, preview,
media, rich-text, renderer, model-command, and entry-command primitives, but its documented composed host
profile remained Blueprint-only and its model host port remained read-only. Those limitations are open work,
not an alternative interpretation of this contract. The exact current state and blockers belong only in
[`docs/roadmap/STATUS.md`](roadmap/STATUS.md).
