# Localization contract

## Goals

Studio is locale-aware without making persisted artifacts dependent on translated labels. Identifiers, command types, field paths, token names and diagnostic codes are locale-independent.

## Message references

Definitions store message references as `{ key, defaultMessage? }`. Keys are namespaced by owner. The optional default message supports safe diagnostics and development but is not an identifier and does not override a host translation.

Message formatting uses an ICU MessageFormat-compatible vocabulary with named parameters. Plugin parameters are schema-declared. Rich HTML messages are prohibited; structured links or emphasis use typed message parts rendered by trusted UI components.

## Locale negotiation

The host supplies requested locale, fallback chain, writing direction, time zone, calendar, numbering system, hour cycle, optional measurement-system preference, and available bundles. Studio reports the resolved locale and display preferences. Locale or display preferences can change without rebuilding persisted artifacts, but the UI MUST recompute direction, formatting and layout.

## Plugin bundles

Plugins declare bundled locales and integrity in their manifest. Bundles are finite, namespaced and loaded through an approved asset path. Missing translations fall back according to the session chain and generate development diagnostics, not broken identifiers.

## User content

Entry translation behavior comes from the content model. Studio distinguishes source, translated, inherited fallback, machine-suggested and stale-after-source-change values. Machine translation is a host capability, never an implicit network call.

## Bidirectionality

The authoring UI supports both left-to-right and right-to-left direction. Canvas geometry and directional icons adapt without changing logical tree order. Blocks containing bidirectional content expose preview and diagnostics for direction-sensitive output.

## Conformance

Gate B localization evidence includes pseudolocalization, long labels, missing messages, plural/select cases, non-Latin input, right-to-left UI, locale switching, time-zone boundaries, exact decimal formatting and screen-reader pronunciation checks.
