# Accessibility and inclusive authoring standard

## Commitment

Studio defines and is governed by its own stronger inclusive-authoring standard in this contract. WCAG 2.2 AA outcomes for the authoring interface and reference output, and relevant ATAG 2.0 Level AA outcomes for author assistance, are mapped minimum floors—not the structure, ceiling, or product boundary. Studio additionally requires equivalent non-pointer authoring, reduced cognitive load, robust zoom/reflow, preservation of accessibility data, and evidence with real assistive technologies.

An implementation MUST NOT claim conformance from automated checks alone.

## Complete interaction equivalence

Every persistent canvas operation available through pointer drag/drop MUST also be available without dragging through the same command system:

- insert before, after or into a named slot;
- move before, after, into, out of and to an exact position;
- resize or change span at each responsive role;
- reorder roots and children;
- select, multi-select where supported, duplicate and remove;
- set properties, variants and bindings;
- undo, redo and inspect change consequences.

This list defines the complete product standard, not a claim that the foundation alpha exposes every operation. Gate A maps each ratified command to equivalent interactions and diagnostics; Gate B proves the supported task set end to end. An implementation cannot expose a pointer-only operation while deferring its non-pointer equivalent.

Keyboard operations use documented shortcuts and discoverable menus. They do not require memorizing shortcuts. Drag targets are not the only indicator of valid destinations.

## Focus and navigation

- The shell provides landmarks and skip links for palette, canvas, outline, inspector, diagnostics and preview.
- Focus order follows task order and remains stable when panels resize.
- Commands that open dialogs, delete nodes, change modes or rerender previews have defined focus restoration.
- Focus is never moved merely because a preview refreshes.
- Virtualized lists preserve semantic position, set size and keyboard navigation.
- Selection, focus and hover are distinct states with non-color indicators.
- Focus indicators meet at least WCAG 2.2 focus appearance requirements and remain visible over theme previews.

## Canvas semantics

The accessible representation of a Blueprint is the semantic outline/tree, not arbitrary visual geometry. It exposes block name, position, parent slot, locked state, issues and relevant content summary without leaking inaccessible values.

Tree interaction follows an established ARIA pattern only when fully implemented; otherwise a nested list with explicit action menus is preferred. Custom elements expose correct roles, names, states, descriptions and relationships through the accessibility tree.

## Visual and motor accessibility

- The complete shell supports 400% browser zoom and 320 CSS-pixel reflow without loss of functionality or two-dimensional page scrolling except the intentionally spatial preview.
- Canvas preview may scroll spatially, but every operation remains available in reflowing outline and inspector surfaces.
- Targets meet or exceed WCAG 2.2 target-size requirements, with larger defaults for frequent canvas controls.
- Pointer capture and drag have cancel paths; accidental movement has thresholds and undo.
- Color is never the sole signal. User interface contrast meets WCAG AA, including component boundaries and states.
- Motion respects `prefers-reduced-motion`; required status does not rely on animation.

## Cognitive accessibility

- Modes are named and visibly persistent; Model, Blueprint and Content mode changes cannot be confused.
- Destructive, publishing and lossy migration actions show scope and consequences in plain language.
- Inspector controls use theme/domain vocabulary rather than CSS jargon by default.
- Errors identify the affected node/field, reason, and an available remediation without clearing user input.
- The UI supports consistent undo, review-before-publish, autosave status and recovery status.
- Time limits are host-controlled, disclosed and extendable where security permits.

## Authoring accessible content

Studio actively assists authors:

- informative media requires equivalent text or a bound source; decorative media requires an explicit choice;
- heading structure, landmark uniqueness and link purpose receive document-wide diagnostics;
- interactive blocks declare accessible name, keyboard, focus and state requirements;
- captions, transcripts, language changes and table headers are prompted where applicable;
- contrast is checked against resolved theme tokens across interactive states;
- motion/autoplay choices are bounded and warnings are actionable;
- automated suggestions identify confidence and never silently replace human-authored alternatives.

Studio preserves accessibility information during copy, migration, theme switch and format conversion. It MUST NOT strip alternatives because a target renderer lacks a visual control.

## Preview accessibility

When the host supplies a preview frame, it has a descriptive title and a clear mechanism to enter and leave
it. An equivalently isolated non-frame surface has an equivalent accessible name and boundary. Studio
provides separate structure and diagnostics views so screen-reader users are not forced to navigate a fully
rendered page for every edit. Preview refreshes are announced politely without reading the page again; a
reload, teardown or failed render never moves focus.

Theme preview controls expose viewport role and dimensions textually. Responsive state is not conveyed only through visual width.

The measured visual canvas has an explicit edit/operate boundary. Its overlay is pointer-inert by default,
so preview links and controls keep their trusted renderer behavior. Edit mode is exposed by a native
pressed-state button and renders hover, selection and drop state with both shape/outline and textual status;
the SVG geometry itself is presentation-only to assistive technology. The semantic outline remains the
accessible canvas and enumerates the identical valid destinations in a native selector. The command palette
provides the same destination actions, so reordering and reparenting never require coordinate perception or
dragging.

Pointer movement uses an activation threshold and capture has two no-op cancellation paths:
`pointercancel` and document-level `Escape`. A cancelled gesture dispatches no command. Preview geometry
loss removes only the visual enhancement; selection, outline, inspector, validation and permitted commands
remain reachable. Automated keyboard/WCAG/CSP checks are release regressions, while the screen-reader,
touch, zoom, forced-color and RTL procedures in the evidence matrix remain mandatory manual qualification.

## Localization and disability intersections

The UI supports right-to-left direction, speech input, magnification, high-contrast/forced-color modes, increased text spacing, non-Latin input and locale changes. Shortcut design avoids collisions and supports remapping where platform conventions require it.

## Block and plugin requirements

Every block and UI plugin supplies:

- accessibility semantics and required author inputs;
- keyboard and focus behavior;
- high-contrast, zoom, reduced-motion and RTL behavior;
- output validation rules;
- automated fixtures and manual test instructions.

A plugin that fails authoring-UI requirements cannot be published as conformant. A block that cannot produce valid accessible output blocks publication unless the host explicitly records an authorized exception with visible impact; exceptions are never silently inherited.

## Evidence matrix

Gate B requires:

- automated semantic, contrast and keyboard regression tests;
- full keyboard task completion at desktop and narrow viewport;
- screen-reader tests with at least NVDA/Firefox, JAWS/Chrome, VoiceOver/Safari and TalkBack/Chrome for supported platforms;
- browser zoom, text spacing, forced colors, reduced motion, RTL and switch/voice-control scenarios;
- authoring assistance tests using representative invalid and accessible content;
- public output tests for every core block and theme recipe;
- documented findings, severity, remediation and release-blocking policy.

Manual evidence is repeated for every major release and for interaction changes that could affect assistive technology.
