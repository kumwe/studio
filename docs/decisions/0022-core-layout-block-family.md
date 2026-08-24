# ADR 0022: Core layout blocks store bounded responsive intent

- Status: proposed
- Scope: portable section, stack, grid, and columns composition

## Context

Studio could store arbitrary block definitions and size roles, but it shipped no blocks from which a
page could actually be composed. The reference renderer demonstrated a section and an outer grid, while
the reusable runtime had no section, stack, grid, or columns definitions. Hosts therefore had to invent
layout property names, initial values, renderer requirements, and slot rules independently, defeating
portable composition and making a four-to-two-to-one page a demo convention rather than contract-backed
behavior.

The Blueprint must still contain no CSS, class name, media-query pixel, template fragment, or executable
value. Themes and trusted renderers remain responsible for concrete output, and a core block cannot grant
itself access to an arbitrary host renderer or arbitrary extension block.

## Decision

`@kumwe/studio-core` publishes one deterministic definition factory for four qualified block types:
`studio.core/section`, `studio.core/stack`, `studio.core/grid`, and `studio.core/columns`. Every definition
has a closed Studio-property-profile schema, an explicit ordered slot allowlist, bounded cardinality,
accessibility obligations, and explicit renderer requirements. The default allowlist contains the layout
family itself; a host adds its known content block types deliberately. The default renderer requirement is
the portable `studio.renderer/layout` capability, and a host can replace it only by passing its trusted
requirements into the factory. Empty renderer requirements and wildcard child admission are impossible.

The family uses bounded semantic properties: alignment, spacing, per-viewport visibility, stack direction,
grid/column count from one through twelve, and collapse behavior. Responsive values use the Blueprint's
existing property override map. `resolveCoreLayoutIntent` chooses an exact active-viewport override or the
base value, records that provenance, applies a documented semantic default without persisting noise, and
fails closed if a value is outside the block vocabulary or the active theme omits the corresponding
control or choice. It never generates markup or CSS.

The Lit shell consumes the same definitions. New layout nodes receive structural authoring policy, their
declared empty slots, and minimal bounded initial properties. A complete `ThemeDocument` may be supplied to
the shell; its viewports and controls feed typed selectors, responsive inheritance text, and recipes.
Recipes expand through the core's existing canonical operation generator and dispatch as one atomic batch.
Raw JSON editing remains a diagnostic/fallback surface, not the only path to layout semantics.

The reference renderer resolves the portable intent and maps it to its own bundled stylesheet. Its page
document remains semantic JSON: four-to-two-to-one reflow is `columns: 1` with `medium: 2` and `expanded: 4`
overrides, never viewport-specific markup.

## Consequences

Hosts can assemble a real nested page from a stable first-party vocabulary while retaining explicit control
over content types and trusted renderer capabilities. Theme replacement is diagnosable because required
control and choice omissions are errors rather than visual guesses. The same resolver is tested against two
independently owned themes, and the reference web renderer is exercised under the pinned CSP.

This decision does not make a DOM renderer authoritative, standardize CSS, or permit arbitrary positioning.
Direct manipulation and geometry-driven reparenting are governed separately by
[ADR 0025](0025-measured-preview-visual-canvas.md); the second independent renderer remains qualification
work.
