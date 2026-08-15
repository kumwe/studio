# Key authoring journeys

These journeys define end-to-end outcomes that roadmap increments and conformance scenarios must eventually prove.

## Create a reusable product experience

1. The host opens Studio with a product content model, design profile, policy snapshot, and supported capabilities.
2. The designer creates a blueprint draft from an approved product pattern.
3. The Library groups compatible fields and blocks. The designer inserts a product-summary block and binds title, price, and primary-image ports.
4. The designer inserts a collection region and chooses the profile's four/two/one responsive role.
5. A product-gallery block supplied by an active extension is placed into a permitted slot. Studio records its namespaced type, contract version, typed properties, and owner provenance—not its implementation code.
6. The price chooses an emphasized semantic recipe and currency formatter allowed by the host. Raw CSS and executable expressions are unavailable.
7. The host preview renders Twig, CSS, and progressive Lit behaviour using the draft bindings and representative data.
8. Studio validates locally for immediate guidance; the host validates authoritatively and either accepts the published immutable blueprint or returns stable node-addressed errors.
9. Content authors subsequently open Content mode. They edit product values and approved variants without accidentally changing the reusable blueprint.

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
