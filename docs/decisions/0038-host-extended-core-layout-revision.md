# ADR 0038: A host-extended core layout family has its own derived revision

- Status: proposed
- Scope: core layout definition identity, hosted admission of host child types, `target.coreLayout`
- Amends: [ADR 0022](0022-core-layout-block-family.md), [ADR 0026](0026-production-block-catalog.md)

## Context

ADR 0022 lets a host add its content block types to the section, stack, grid, and columns slots and
replace the renderer requirement by passing options to `createCoreLayoutBlockDefinitions`. The factory
stamped `layout-<name>-r1` on every result whatever the options, and the first-party production catalog
(ADR 0026) published different bytes under the same revision. One `(type, version, revision)` therefore
named several byte sets, and a Blueprint lock no longer identified the definition it was validated against
([Blueprint contract](../contracts/blueprint.md#block-resolution)).

Hosted Studio also gave a host no voice: it always built the production catalog, so a host whose section
accepts its own blocks validated differently in the browser than on its server, and inserting or moving
those blocks into a section was refused. Sending a replacement definition fails activation as a duplicate
or cross-owner collision, and `studio.*` is reserved, so no host-side workaround is lawful.

## Decision

1. `createCoreLayoutBlockDefinitions(options)` derives each revision from the bytes its options produce:
   `layout-<name>-h<16 lowercase hex>`, where the hex is FNV-1a-64 over the canonical UTF-8 bytes of the
   four built definitions with `revision` left out. The slot allowlist is the sorted, unique union of the
   layout family and the host list, so the revision does not depend on list order; renderer requirements
   keep their given order. The factory refuses more than 64 listed entries (layout types included), a
   repeated entry, and any `studio.*` entry other than the four layout types. The digest is an equality
   key within a host's trusted catalog, not an integrity value.
2. The production catalog keeps the revisions it published in 0.1.0-beta.9, `layout-<name>-r1`, for its
   own unchanged bytes. No other byte set may carry them; the bare factory no longer does.
3. An authoring target may declare `coreLayout: {acceptedChildTypes, rendererRequirements?}`. When the
   started session's target carries it, hosted Studio replaces the four production layout definitions with
   the factory output for exactly those options. Every listed type other than the layout family must be a
   `block-definition` the target admits through a `required: true` contribution dependency; a `studio.*`
   type outside the layout family is refused. Listing a type puts it into the derived revision, so an
   optional dependency cannot quietly drop it: an optional or unresolved listed type fails the mount before
   anything is published. The member arrives in the server-authoritative start snapshot, never from the
   DOM. A host-core or an extension-owned target may carry it, and it grants nothing on its own: hosted
   policy still requires the host-authored session to lock the derived revisions exactly, and that lock is
   the host's composition mapping. A lock naming `r1` against an extended target fails closed. The schema
   refuses reserved `studio.*` entries; the dependency rule is semantic and checked at mount.
4. Hosts MUST NOT compute, hand-write, or reuse a Studio-derived revision, and MUST NOT re-declare a
   `studio.*` definition. A server-side host that needs the definitions materializes them from the exact
   pinned `@kumwe/studio-core` package at build time.
5. Because the digest covers the built bytes, a later release that changes the family's base bytes
   (property schema, message keys, slot bounds) changes every derived revision with them, so a derived
   revision never names two byte sets. A golden test pins the bare factory's bytes and revision so the
   change is visible in review.

## Consequences

- The bare factory and every host-extended family change revision once; the production catalog, its
  patterns, and every standalone document are byte-identical to 0.1.0-beta.9.
- A host that already locks `layout-<name>-r1` for its own extended bytes must regenerate its definitions
  from the package and migrate stored locks forward; the change is lock-only when its bytes already equal
  the factory output.
- A derived revision suits a fixed host list. The options are fixed when the host builds: adding a type
  is a new revision, regenerated definitions, and a lock migration, so a block activated at runtime cannot
  join layout slots until then. Dynamic extension sets wait for capability-based slot acceptance (Gate A,
  [block contract](../contracts/block.md#slots)).
- A production starter pattern whose block dependencies lock a production layout revision
  (`layout-<name>-r1`) cannot be admitted beside `coreLayout`; hosted policy refuses it because its
  dependency lock is unavailable. The layout-free starter patterns (FAQ, media gallery, pricing, and
  tabbed content) remain admissible.
- A host-extended family does not carry the production `design` presentation property or its control. A
  layout node that sets `design` under a production revision cannot move to the host-extended revision
  unchanged; the host's lock migration must drop or translate that property.
- No trust is widened: the extended slots accept only target-admitted host blocks, and renderer authority
  still comes only from the host's own requirements and locks.
- Accessibility and localization are unchanged: the four definitions keep their landmark and structural
  categories, keyboard contract, and message keys; only the slot allowlist, the renderer requirements,
  and the revision vary.

## Rejected alternatives

Extending the production catalog with host types was rejected: it forces the semantic-web renderer
requirement and the `design` presentation property on every host and widens browser acceptance to 41 types
a host may not render. Hashing only the options was rejected: a later change to the family's base bytes
would then reuse a revision for different bytes. A synchronous SHA-256 was rejected for size (about 1.3 KB
against about 150 bytes) because the key is not a security boundary. Caller-supplied digests were rejected
because the factory would have to trust them. An unimplemented "host composition mapping" that rewrites
ownership was rejected; the target member together with the host's exact session lock on the derived
revisions is that mapping.

## Implementation note

`packages/core/src/layout.ts`, `fnv.ts`, and `production.ts`; `schemas/authoring-target.schema.json` with
valid and invalid fixtures; `packages/studio-lit/src/hosted-runtime.ts`. Kumwe App and Producer re-pin
downstream.
