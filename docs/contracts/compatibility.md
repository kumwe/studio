# Compatibility contract

## Compatibility dimensions

Compatibility is a computed result across:

- schema epoch, document contract revision, and negotiated wire protocol version;
- Studio package release set;
- host ports and capabilities;
- content model and entry revisions;
- Blueprint block/dependency locks;
- theme tokens, recipes, viewports and renderers;
- plugin manifests and contribution versions;
- output surface;
- actor permissions and host policy.

A single matching version string cannot prove compatibility.

## Result classes

Every check yields one of:

- `compatible`: exact or range-supported with no changes;
- `compatible-with-aliases`: explicit semantic aliases preserve meaning;
- `migration-required`: a deterministic available migration can produce compatibility;
- `degraded-read-only`: data can be preserved and inspected but not safely edited or published;
- `incompatible`: required meaning or behavior cannot be preserved;
- `unknown`: evidence is missing and MUST be treated as incompatible for write/publication.

## Resolution algorithm

Implementations evaluate in deterministic order:

1. schema epoch, document contract revision, wire protocol, and artifact schema support;
2. integrity, owner, namespace and trust;
3. required host ports and capabilities;
4. dependency presence and version ranges;
5. model field and binding type compatibility;
6. block properties, slots, ports and migrations;
7. theme tokens, viewport roles and recipes;
8. renderer support for the target surface;
9. permissions, limits, security and accessibility publication policy.

All failures are collected where safe; the UI should not force one-failure-at-a-time repair.

## Unknown values

Readers preserve unknown fields only in explicit extension maps or when the applicable schema declares forward-compatible preservation. Unknown command types, block semantics, transforms, permissions, renderers or security policy are not executable. An implementation MUST NOT reinterpret an unknown value as a nearest known value.

## Compatibility reports

A report contains source and target inventories with digests, result class, stable issues, affected artifact locations, available migrations, data-loss classification, required actor decisions, and resulting dependency locks. The report itself is immutable evidence attached by the host to migration or publication records.

## Browser and platform support

The Studio UI publishes an explicit browser baseline based on web-platform capabilities, not user-agent sniffing. Unsupported environments receive a diagnostic and read-only/export path when possible. Polyfills are scoped, tested, and included only when they preserve security and accessibility.

## Release policy

Before 1.0, exact prerelease pinning is required. Gate A ratifies the first schema epoch and its supported document-revision and wire-version ranges. Gate B establishes the supported release window, deprecation period, browser matrix, Node build baseline, schema registry availability and independent implementation fixtures.

Deprecation includes a replacement, migration path, first-deprecated version, earliest-removal major and telemetry-free discovery method. Security removals may be faster and must be documented with operational guidance.
