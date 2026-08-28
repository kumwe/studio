# Key authoring journeys

These journeys define target end-to-end outcomes that roadmap increments and conformance scenarios must prove.
Their sole normative source is the [product contract](../product-contract.md). The repository now implements
the Studio-side standalone/hosted mounts, contextual coordinator and shell, presentation state, contribution
admission, and save orchestration used by these journeys. It does not thereby claim that Kumwe App or another
real host has executed, persisted, rendered, and qualified the complete outcomes (`STUDIO-PROD-014` and
`STUDIO-PROD-015`).

## Mount standalone or connect an authoritative host

1. A normal HTML page loads the precompiled Studio browser assets and mounts explicit ordinary target elements
   with zero configuration or associates them with bounded `application/json` deployment configuration. Two
   instances on the same page remain isolated; neither discovers or shares the other's state or authority.
2. A zero-configuration element with no deployment document, or a complete release-bound standalone configuration,
   opens a blank standalone workspace with Studio's built-in blocks and patterns. It performs no network request and exposes canonical, lossless project JSON import/download plus an
   explicit save-intent JSON download; these local actions do not claim durable host persistence
   (`STUDIO-PROD-011` and `STUDIO-PROD-012`).
3. A hosted configuration identifies the exact target, resource context, start, initial mode and presentation,
   bounded capabilities, operation routing, and authentication transport. The server still authenticates,
   authorizes, validates, and accepts or rejects every operation independently (`STUDIO-PROD-010`).
4. A single endpoint receives the canonical operation name in `X-Studio-Operation`; an operation map names each
   available route independently. Request and response bodies retain their exact canonical schemas in both
   cases. Missing operations are disabled. A configured endpoint failure is shown and never becomes a local
   success.
5. Closing one mount disposes only that instance. Reopening standalone content requires an explicit import;
   reopening hosted content requires a fresh server-authorized launch.

## Open a core or extension target and keep one session

1. The host core or an extension declares an eligible content target through the same generic mechanism; that
   declaration grants no authority by itself (`STUDIO-PROD-008`).
2. From that target, the host authenticates the actor, resolves the exact item/type/revisions and permissions,
   and launches Studio in context (`STUDIO-PROD-001` and `STUDIO-PROD-010`).
3. The author chooses a host-authorized blank start or an exact reusable type version. The flow does not require
   a companion definition to be pre-created or serialized artifacts to be copied between tools
   (`STUDIO-PROD-002` and `STUDIO-PROD-012`).
4. The host presents the same logical session inline, then maximized or fullscreen. Selection, focus recovery,
   unsaved work, history, diagnostics, and preview context survive each presentation change
   (`STUDIO-PROD-007` and `STUDIO-PROD-013`).
5. Returning to host chrome neither saves nor discards implicitly.

## Create a reusable product experience

1. From an authorized product target, the host opens Studio with a blank coordinated definition or an exact
   reusable type, design profile, policy snapshot, and supported capabilities.
2. The designer works with separate Content Model and Blueprint drafts in the same contextual canvas, starting
   the Blueprint from an approved pattern when desired.
3. The Library groups compatible typed fields and blocks. The designer inserts a product-summary block, creates
   or selects the authorized title, price, and primary-image fields, and binds their ports. Pointer placement and
   drag are accelerators; equivalent keyboard and explicit controls remain complete.
4. The designer inserts a collection region and chooses the profile's four/two/one responsive role.
5. A product-gallery block supplied by an active extension is placed into a permitted slot. Studio records its namespaced type, contract version, typed properties, and owner provenance—not its implementation code.
6. The price chooses an emphasized semantic recipe and currency formatter allowed by the host. Raw CSS and executable expressions are unavailable.
7. The host preview renders Twig, CSS, and progressive Lit behaviour using the draft bindings and authorized
   contextual or representative values.
8. The designer explicitly chooses **Save as new type**. The request contains the separate Model and
   Blueprint drafts and excludes Entry values (`STUDIO-PROD-004` and `STUDIO-PROD-006`).
9. Studio validates locally for immediate guidance; the PHP host validates authoritatively and either creates
   the accepted definition revisions or returns stable field- and node-addressed errors.
10. Without copying content to another editor, an authorized author edits Entry values and approved variants in
    the same contextual workspace, then explicitly chooses **Save item**. Entry identity and revisions remain
    separate from the reusable type (`STUDIO-PROD-003`, `STUDIO-PROD-010`, and `STUDIO-PROD-012`).

## Edit an existing item against its exact type

1. The host resolves the selected item's exact Entry revision and exact reusable Model/Blueprint versions before
   values enter Studio (`STUDIO-PROD-005`).
2. The canvas hydrates authorized values beside their bound blocks and typed fields; it never guesses a newer or
   merely similar reusable type.
3. The author changes permitted values and layout regions without silently editing the reusable definition.
4. **Save item** sends the Entry intent through host validation, concurrency, workflow, audit, and revisioning.
5. If authorized design work is intentional, **Save new type version** is a separate choice that asks the host
   to create appropriate new Model and/or Blueprint successor revisions. It never includes the current Entry
   values or mutates an immutable published definition (`STUDIO-PROD-004`, `STUDIO-PROD-006`, and
   `STUDIO-PROD-010`).

## Build responsive columns without CSS

1. Insert a layout block with a repeatable `columns` slot.
2. Add four child regions using pointer, keyboard, or explicit Add controls.
3. Select a responsive recipe exposed by the active profile: four columns at `wide`, two at `medium`, one at `narrow`.
4. Adjust one child's semantic span only where the layout definition permits it.
5. Preview each profile-declared width and navigate the rendered reading order.
6. Publish only if visual order, DOM order, keyboard order, and no-JavaScript presentation remain coherent.

The blueprint stores semantic roles and ordered children. The theme may use CSS Grid, another layout technology, or a native Flutter projection while preserving the same declared intent.

## Select and prepare an image

1. A compatible image port opens the media experience through the host media provider.
2. The author searches or uploads according to host capability and permission. Upload progress, cancellation, retry, and processing state are explicit.
3. Studio receives a stable asset identity and safe metadata projection, never an assumption that a current delivery URL is permanent.
4. The author supplies usage-specific alt text or marks the usage decorative, selects an allowed focal point/crop intent, and reviews renditions.
5. The host validates access, media state, metadata, and usage policy on save. Publication may block while required processing or accessibility metadata is incomplete.
6. Replacing the underlying asset does not silently overwrite usage-specific meaning in unrelated entries.

## Recover from a disabled extension

1. A blueprint contains a block owned by an extension that becomes disabled, revoked, or incompatible.
2. Registry reconciliation removes the active implementation immediately.
3. Studio preserves the node and its typed data as an inert unresolved block. It identifies the owner, required version, affected bindings, and allowed recovery actions.
4. Preview and publication follow the host's declared fail-closed or trusted-fallback policy; Studio never downloads old executable code from the document.
5. Re-enabling a compatible contribution restores the authoring projection. A migration creates a new draft/version rather than rewriting a published artifact.

## Resolve a concurrent edit

1. A save request includes the draft base revision and an idempotency identity supplied by the host contract.
2. The host reports a structured conflict rather than accepting last-write-wins implicitly.
3. Studio retains local commands, fetches the authorized current projection, and shows node- or field-level differences where deterministic rebasing is unsafe.
4. The author chooses a permitted resolution, after which Studio submits a new explicit command sequence.
5. Audit and revision ownership remain with the host.
