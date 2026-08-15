# Studio Schema Profile

## Purpose

Studio uses JSON Schema Draft 2020-12 for portable shape validation, but plugin- and host-supplied schemas execute inside a constrained **Studio Schema Profile**. Supporting Draft 2020-12 does not authorize every vocabulary, remote reference, regular expression, format assertion, or implementation extension.

## Allowed model

The profile supports bounded combinations of:

- scalar, array and object `type`;
- `const` and finite `enum`;
- closed `properties`, `required`, `additionalProperties`, `propertyNames` and `dependentRequired`;
- homogeneous `items` and bounded `prefixItems`;
- numeric, string, array and object minimum/maximum constraints;
- `allOf`, `anyOf`, `oneOf`, `not`, and bounded `if`/`then`/`else` composition;
- local `$defs` and approved `$ref` targets;
- annotations such as `title`, `description`, `default`, `examples`, `readOnly`, and `writeOnly`.

The exact machine-readable meta-schema is published as
[`schema-profile.schema.json`](../../schemas/schema-profile.schema.json); its `$defs/limits` member
carries the complexity limits, and a parity test pins them to the reference validator
(`STUDIO_SCHEMA_PROFILE_LIMITS` in `@kumwe/studio-core`). The profile remains draft until Gate A
ratification, and hosts MUST pin the validator and schema release used by a session.

## References

`$ref` is resolved from an in-memory registry assembled during session compilation. Allowed targets are the same document, canonical Studio schemas packaged with the release, or a trusted plugin schema whose ID and integrity appear in the active generation. Runtime network retrieval is prohibited. Relative paths cannot escape a package root.

Recursive schemas require an explicit host limit and are rejected when their evaluation graph or instance depth exceeds it. Cyclic reference loading that does not make bounded validation progress is rejected.

## Expressions and formats

Plugin-supplied `pattern`, `patternProperties`, `contentSchema`, custom code-generating keywords, implementation-specific transform keywords, and arbitrary `format` assertions are prohibited. Canonical schemas may use reviewed lexical patterns for protocol identifiers.

Domain validation uses a namespaced registered validator/operator with declared version, input/output type, deterministic behavior, limits, localization behavior and host implementation. A schema cannot embed JavaScript, SQL, template syntax or arbitrary expressions.

The profile publishes a finite registry for standard formats such as dates, times and safe identifiers. Unknown formats are a compilation error rather than silently treated as annotations.

## Complexity and denial-of-service controls

Session policy limits schema bytes, nodes, depth, references, alternatives, enum members and aggregate evaluation work. Schemas are compiled before registration and cached by integrity digest. A schema that exceeds budget rejects the whole owning contribution atomically.

Validation is cancellable where the runtime supports it. Catastrophic backtracking must not be possible through contributed validation data.

## JSON member safety

Every open canonical JSON object or map constrains member names. Generic JSON member names are non-empty, length-bounded, free of control characters, and cannot be `__proto__`, `prototype`, or `constructor`. Maps with a narrower local, stable-ID, or qualified-name vocabulary inherit the same forbidden-key rule where that vocabulary could otherwise admit one of those names.

This rule applies recursively to canonical `jsonValue` objects and to command, preview, property, parameter, argument, diagnostic, and validator maps. Studio implementations MUST create dictionaries without inherited prototypes or use equivalent safe-map structures and MUST NOT assign decoded members into application objects through an unsafe merge. Schema validation supplements those implementation controls; it does not make prototype-bearing JavaScript objects safe.

## Defaults and coercion

Defaults are explicit authoring suggestions. JSON Schema validation does not mutate instances, coerce scalar types, remove unknown properties, or apply defaults silently. A command that applies a default records the resulting value like any other edit.

## Host validation

Browser validation assists the author. The host repeats schema-profile and semantic validation with an implementation proven by shared conformance fixtures. Differences fail closed for save or publication and produce a compatibility diagnostic.
