# Theme contract

## Purpose

A Studio theme is a portable design-language declaration plus renderer compatibility metadata. It allows authors to select meaningful, bounded design choices while the host template controls actual markup and CSS.

Theme manifests conform to [`theme.schema.json`](../../schemas/theme.schema.json).

## Current canonical manifest

The `0.1-draft` theme schema declares:

- stable identity, semantic version, revision, owner and contract version;
- supported output surfaces and renderer IDs;
- viewport roles and their ordering;
- token roles for color, typography, spacing, size, radius, shadow, motion and z-layer;
- block recipes and bounded design values;
- supported block contracts and version ranges;
- preview widths for viewport roles; and
- equivalent-meaning aliases for prior semantic names.

## Gate A manifest targets

Before Gate A can claim a complete theme integration contract, a later canonical schema in the draft epoch must add or deliberately resolve:

- reusable composition-pattern references and compatibility locks;
- bounded canvas presentation metadata beyond viewport preview widths;
- accessibility constraints, contrast evidence references and required-state coverage; and
- explicit migration declarations beyond equivalent-meaning aliases.

These groups are target requirements, not fields accepted by `theme.schema.json` in `0.1-draft`. A host or plugin may experiment through a namespaced extension schema, but cannot claim canonical theme conformance for those values.

Extension-offered design vocabulary and declared migrations have canonical homes outside the theme document: a plugin declares them as `design-vocabulary` and `migration` contributions whose payloads conform to [`design-vocabulary.schema.json`](../../schemas/design-vocabulary.schema.json) and [`migration.schema.json`](../../schemas/migration.schema.json) (ADR 0012). A theme adopts or remaps contributed vocabulary through its own declared controls and aliases; the contribution never obliges a theme, and `theme.schema.json` is unchanged.

## Semantic design values

Blueprints reference semantic names such as `color.surface.accent`, `spacing.section.large`, or `text.price.prominent`. A theme MUST NOT require a Blueprint to store raw CSS property names, class names, selectors, declaration strings, script, or template source.

Theme tokens intended for user choice include localized labels, categories and constraints. Internal renderer tokens may exist but MUST NOT be referenced by portable Blueprints unless promoted to the public design profile.

## Viewport roles

Viewport roles describe design states, not devices. A theme defines an ordered base role and optional broader roles, with preview widths for authoring. A host renderer maps roles to its media/container-query strategy. Changing preview width does not itself mutate the Blueprint.

Themes MUST define how responsive values inherit. Studio exposes explicit overrides and a way to reset to inherited values. It MUST NOT fabricate breakpoints absent from the theme.

## Size roles

Sizing intent is theme-remappable vocabulary, not stored measurement. A Blueprint node records at most one named size role per layout axis (`inline` or `block`), with responsive overrides per viewport role, instead of widths, column spans, or CSS fragments. The theme declares the available role names as choices of its `size-role` design controls and decides what each role means for a given block and renderer, so a redesign can remap what `half` or `full` resolves to — or carry a renamed role forward through an equivalent-meaning `choice` alias — without migrating stored documents. Whether a stored role names a declared choice is diagnostics-level validation surfaced during authoring and theme switching; the command layer requires only a bounded identifier.

The core layout family additionally requires the named controls `layout-alignment`, `layout-spacing`, `layout-visibility`, and, where applicable, `layout-direction` and `layout-collapse`. Their choices are token references from the closed layout vocabulary. A theme supporting a core layout block declares every control that block names; omission is a compatibility error. The numeric grid/column count remains a bounded semantic property rather than a theme token, while a trusted renderer decides how that count is expressed on its surface.

## Recipes

A recipe is a named combination of renderer behavior and allowed design choices for a block. In `0.1-draft`, it is versioned with its containing theme rather than carrying an independent version. Examples include `product-card`, `hero-split`, and `faq-bordered`. A recipe may narrow block properties and slot rules but may not expand authority beyond the block definition or host policy.

## Template integration

For server rendering, the host maps a theme and block pair to trusted renderer code, such as a Twig component. Renderer paths and executable source remain host/package metadata, not part of portable theme JSON delivered to untrusted authors.

The authoring preview SHOULD use the same renderer and design assets as delivery. If a theme supplies an approximate preview renderer, Studio MUST label the preview as approximate and Gate B conformance MUST test parity limits.

## Switching themes

Under `0.1-draft`, a switch report covers block versions, recipes, design controls, viewport roles, renderers and declared aliases. Gate A extends this report to canonical patterns, accessibility requirements and migrations after their manifest contracts are ratified. The actor explicitly accepts aliases or registered migrations. Missing required semantics block publication; Studio MUST NOT replace them with visually similar guesses.

## Theme security

Theme packages are executable supply-chain inputs when they contain renderers or assets. The host verifies provenance, trust, integrity and allowed asset policy. Portable theme manifests cannot grant permission to execute remote code, fetch arbitrary origins, weaken CSP, or expose private data.
