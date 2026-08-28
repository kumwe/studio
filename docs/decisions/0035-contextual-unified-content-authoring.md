# ADR 0035: Contextual authoring coordinates separate artifacts in one product journey

- Status: proposed
- Scope: product workflow, coordinated authoring sessions, host authority, and production runtime boundary

## Context

Studio's product documentation had consistently described one workspace with Model, Blueprint, and Content
modes, but when this decision was recorded its bounded composed host profile loaded and persisted only an
existing Blueprint. Model projection was read-only, Entry and Model commands were not mounted as
Blueprint-shell controls, and reference journeys described designers preparing reusable Blueprints before
content authors subsequently populated Entries.

Those boundaries are honest descriptions of implemented increments, but they were also read as the intended
product workflow. That interpretation is wrong for Kumwe App. Studio is intended to become the contextual
authoring surface for managed content: an author opens the current content resource, starts from a reusable
content type or blank canvas, works with structure, fields, and values together, and selects an explicit save
outcome. Requiring a disconnected Blueprint screen, prior type preparation, or copy-and-paste handoff defeats
that purpose.

At the same time, collapsing content models, Blueprints, and entries into one untyped document would break
versioning, migration, authorization, reuse, and host authority. A unified experience must therefore coordinate
separate artifacts rather than erase their boundaries.

## Decision

The normative product target is defined only by
[`STUDIO-PROD-1.0-draft`](../product-contract.md). Studio will present contextual creation and editing as one
continuous authoring journey over separately identifiable content-model, Blueprint, and entry drafts.

The host-facing concept of a reusable Kumwe content type associates a content-model revision, a default
Blueprint revision, and authoring policy. Starting from that type creates or loads an entry with the reusable
structure and fields but without another entry's values. Starting blank creates an authorized draft context in
which layout, blocks, fields, bindings, and values may be coordinated. Saving an entry, saving the design as a
new content type, and creating a new content-type version are distinct, explicit host-authorized outcomes.
Each host save plan binds its accepted continuation through one required bounded `successorContext`; the
request and result echo that complete plan reference, and only a validated accepted result advances the
session's host return context to the exact planned value.

Studio may be embedded in the originating content screen or displayed through a context-preserving full-screen
route. Inline, minimized, maximized, and full-screen presentations are projections of the same resource-bound
authoring state, not different persistence workflows.

Host authority is unchanged. Studio requests effects through declared ports; the host authenticates,
authorizes, validates, persists, versions, audits, migrates, previews, and publishes. Kumwe App implements those
server effects through PHP application services and PHP HTTP endpoints. Node.js and npm remain build, test, and
release tools only; production deploys prebuilt browser assets and no server-side JavaScript authority.

Canonical contribution kinds remain `block-definition`, `pattern`, `field-adapter`, `inspector`,
`design-vocabulary`, and `migration`. Contextual authoring consumes their active owner-aware generation and
does not create a parallel extension system.

This decision establishes a target and compatibility direction. Implementation and qualification status remain
separate concerns governed by [`docs/roadmap/STATUS.md`](../roadmap/STATUS.md).

## Implementation relationship

The repository now includes the additive `openContextualStudioSession` coordinator, exact
blank/from-type/existing snapshots, separate Model/Blueprint/Entry draft state, the current Model-field and
Entry-value commands, a contextual Lit shell, four presentation states, and plan/submit/reconcile behavior for
the three explicit save outcomes, including exact host-successor-context adoption and mismatch refusal. The
configuration-driven browser runtime binds those components to exact host routes, while standalone mounting
supplies a blank built-in workspace without a host.

Those components implement the Studio side of this decision; they do not certify a Kumwe App adapter, complete
Model/Entry authoring breadth, host transaction and rendering behavior, the `authoring-web` profile, or the
`STUDIO-PROD-015` acceptance journey.

## Consequences

- The Blueprint-only handle remains a valid bounded implementation increment, but it is not the complete
  Studio product session.
- Read-only model projection remains valid for discovery and binding. The product additionally needs a
  separately authorized and concurrency-safe definition-draft path; read access must not be widened
  implicitly.
- Coordinated load/create/save contracts, revisions, idempotency, conflicts, history, recovery, migration, and
  atomicity must continue to preserve separate artifact identities; implementation evidence may not substitute
  for host acceptance.
- Save continuation is host authority: a refusal cannot advance return context, and Studio cannot replace the
  plan's bounded successor with a locally inferred route or stale prior result.
- Product and roadmap documents must identify legacy forms as migration/recovery fallbacks rather than the
  target default editor.
- Conformance and host acceptance must exercise the complete `STUDIO-PROD-015` journey, including a clean
  production runtime with no Node.js or npm requirement.
- Documentation must continue distinguishing product target from repository-verified implementation and
  accepted release evidence.

## Supersession

This record partially supersedes [ADR 0020](0020-blueprint-host-session-composition.md) only where its
Blueprint-only profile could be read as the complete product target. It does not invalidate that bounded
profile's implemented load/save and failure semantics.

This record partially supersedes [ADR 0024](0024-read-only-model-binding-projection.md) only where rejection of
model mutations could be read as forbidding a separately declared, authorized definition-draft capability.
Read-only projection itself and its fail-closed binding rules remain unchanged.

## Rejected alternatives

- A separate Studio catalogue or Blueprint screen as the required starting point was rejected because it
  creates a manual handoff instead of contextual content authoring.
- Silent model creation or publication during a drag operation was rejected because it hides scope and can
  alter other entries.
- One universal page JSON document was rejected because it collapses independently governed model, layout,
  entry, workflow, and migration authority.
- A Node.js production service was rejected because the host owns server authority and Kumwe App's backend
  boundary is PHP.
