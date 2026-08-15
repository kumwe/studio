# ADR 0005: Bounded semantic design language

- Status: proposed
- Scope: layout and appearance

## Context

Storing CSS classes or arbitrary style declarations couples content to one theme and permits inaccessible or unsafe output. Removing all appearance choices would make Studio too restrictive.

## Decision

Themes publish semantic tokens, viewport roles, recipes, patterns and permitted controls. Blueprints store intent such as `surface.raised`, `spacing.large`, a four-to-two-to-one grid policy, or `emphasis.price`. Trusted renderers map intent to HTML/CSS.

Portable artifacts do not store CSS selectors, declaration strings, framework class names or media queries.

## Consequences

Theme replacement becomes diagnosable and appearance remains coherent. Theme authors must define a rich public design profile and compatibility migrations. Arbitrary pixel-level positioning is outside the portable core unless a future bounded spatial-layout contract is ratified.
