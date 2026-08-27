# Studio Schema Profile

## Purpose

Studio uses JSON Schema Draft 2020-12 for portable shape validation, but plugin- and host-supplied schemas execute inside a constrained **Studio Schema Profile**. Supporting Draft 2020-12 does not authorize every vocabulary, remote reference, regular expression, format assertion, or implementation extension.

## Allowed model

`studio.profile/schema-property` is the executable prerelease profile for contributed block property
schemas. Its root is always `{ "type": "object", "additionalProperties": false }`; a contribution
cannot make its property bag open or replace it with a scalar root. Inside that root, the profile
supports bounded combinations of:

- scalar, array and object `type`;
- `const` and finite `enum`;
- closed `properties`, `required`, `additionalProperties`, `propertyNames` and `dependentRequired`;
- homogeneous `items` and bounded `prefixItems`;
- numeric, string, array and object minimum/maximum constraints;
- `allOf`, `anyOf`, `oneOf`, `not`, and bounded `if`/`then`/`else` composition;
- local `$defs` and same-document `$ref` targets;
- annotations such as `title`, `description`, `default`, `examples`, `readOnly`, and `writeOnly`.

The exact machine-readable meta-schema is published as
[`schema-profile.schema.json`](../../schemas/schema-profile.schema.json); its `$defs/limits` member
carries the complexity limits, and a parity test pins them to the reference validator
(`STUDIO_SCHEMA_PROFILE_LIMITS` in `@kumwe/studio-core`). The profile remains draft until Gate A
ratification, and hosts MUST pin the validator and schema release used by a session.

Admission failures use the closed codes `invalid-root`, `unsupported-keyword`,
`invalid-keyword-value`, `unsafe-member`, `limit-exceeded`, `invalid-reference`, and
`recursive-schema`, plus a JSON Pointer to the rejected schema location. Instance failures expose the
failing keyword and instance JSON Pointer. Human-readable messages are not conformance values.

For `multipleOf`, implementations compare exact base-10 coefficients and exponents from Studio's
canonical finite-number form. They MUST NOT use binary floating-point division or an epsilon. Thus
`4.02` is a multiple of `0.01`, while `4.021` and `0.30000000000000004` are not multiples of `0.01`
and `0.1` respectively.

## References

The property profile accepts `#` and `#/...` references only. Each reference is a valid JSON
Pointer into the same schema document, every target exists at admission time, and `~0`/`~1` are the
only pointer escapes. To avoid URI-library decoding differences, each raw token uses the ASCII subset
`A-Z a-z 0-9 . _ ! $ & ' ( ) * + , ; = : @ -` plus those two tilde escapes. Percent encoding,
raw `#` or `?`, whitespace, and non-ASCII token text are rejected; a definition requiring another
character cannot be referenced in this profile. A target must be a position the profile grammar
identifies as a schema; an existing container or annotation object such as `#/properties` is not a
schema target. Remote, absolute, relative-package, registry, anchor, and network references are
rejected. The reference graph must be acyclic; all direct and indirect recursion is rejected before a
contribution enters a generation. A future cross-document or recursive surface requires a separately
named profile and its own portable vectors rather than silently widening this one.

## Expressions and formats

Plugin-supplied `pattern`, `patternProperties`, `contentSchema`, custom code-generating keywords, implementation-specific transform keywords, and arbitrary `format` assertions are prohibited. Canonical schemas may use reviewed lexical patterns for protocol identifiers.

Domain validation uses a namespaced registered validator/operator with declared version, input/output type, deterministic behavior, limits, localization behavior and host implementation. A schema cannot embed JavaScript, SQL, template syntax or arbitrary expressions.

The property profile publishes no `format` keyword registry. Every `format`, including familiar
names such as `date` and `email`, is an unsupported keyword rather than an annotation whose behaviour
could differ by runtime.

## Complexity and denial-of-service controls

Session policy limits canonical schema bytes, nodes, depth, references, alternatives, enum members,
property-name arrays, annotations, and JSON container size. Every object or boolean schema position
counts as one schema node, including boolean members of composition arrays. JSON-valued annotations,
constants, and enum members allow at most 1,000 properties in each object and 10,000 entries in each
array; the separate depth limit remains authoritative. The schema-depth and JSON-value-depth ceilings
compose: a JSON-valued operand at depth 64 remains admissible inside a schema at depth 32. There is no
smaller implementation-specific combined-depth ceiling.

Schema bytes mean the exact canonical UTF-8 form defined by the portability contract, so insertion
order cannot change admission or an integrity digest. Implementations measure that byte budget before
sorting or compiling untrusted maps and stop as soon as the ceiling is crossed. Map cardinality is
also checked before member sorting. A schema that exceeds a budget rejects the whole owning
contribution atomically. Every published ceiling has one exact-boundary and one exact-plus-one vector;
the vector's `boundary` member names the limit, position, and measured value. Implementations may cache
a compiled schema only under the canonical-byte integrity digest and the exact profile/package
version.

Validation is cancellable where the runtime supports it. The reference interpreter memoizes a schema
verdict and its full deterministic diagnostic slice by schema identity, instance JSON Pointer, and
instance identity/value for one validation run. Exact duplicate diagnostics in that slice are
collapsed, but every distinct failure is retained and replayed. A cached failure therefore remains
diagnostic even when its first evaluation was a speculative composition check whose scratch
diagnostics were discarded.
Consequently an acyclic `$ref` graph is evaluated once per actual instance location instead of being
expanded exponentially through repeated composition branches; property-name checks at one object
location remain distinct by their string value. Catastrophic backtracking or exponential reference
fan-out must not be possible through contributed validation data.

Schema objects and schema maps are unordered JSON objects. Admission visits their members in ascending
UTF-16 code-unit order; this is also the first-diagnostic precedence when more than one member is
invalid. The rule includes root-closure checks, local-reference resolution, and recursive-dependency
traversal; a later semantic pass does not define a second ordering. Missing root `additionalProperties`
or `type` declarations participate at those virtual member positions. Across nested locations,
implementations compare JSON Pointer tokens from the root: object tokens use UTF-16 code-unit order,
array tokens use numeric index order, and a container precedes its descendants. Structural, reference,
recursion, and root-invariant candidates are arbitrated by that one order. Instance validation uses
the same order for object properties and instance member names.
Arrays retain their declared order except `required` and `dependentRequired` name arrays, whose JSON
Schema meaning is set-like and whose instance checks therefore use the same sorted order.

A reference failure is always located at the `$ref` member in the canonical schema document. Following
a forward or shared target does not synthesize an expansion path beneath the referring member. When
more than one reference is unresolved, or more than one reference edge participates in a dependency
cycle, the earliest actual `$ref` location under the ordering above is the portable diagnostic.

## JSON member safety

Every open canonical JSON object or map constrains member names. Generic JSON member names are non-empty, length-bounded, free of control characters, and cannot be `__proto__`, `prototype`, or `constructor`. Maps with a narrower local, stable-ID, or qualified-name vocabulary inherit the same forbidden-key rule where that vocabulary could otherwise admit one of those names.

An over-length member name is `limit-exceeded`; an empty, control-bearing, or reserved member name is
`unsafe-member`. Both diagnostics point to the member position (or to its index in a name array).

This rule applies recursively to canonical `jsonValue` objects and to command, preview, property, parameter, argument, diagnostic, and validator maps. Studio implementations MUST create dictionaries without inherited prototypes or use equivalent safe-map structures and MUST NOT assign decoded members into application objects through an unsafe merge. Schema validation supplements those implementation controls; it does not make prototype-bearing JavaScript objects safe.

## Defaults and coercion

Defaults are explicit authoring suggestions. JSON Schema validation does not mutate instances, coerce scalar types, remove unknown properties, or apply defaults silently. A command that applies a default records the resulting value like any other edit.

## Host validation

Browser validation assists the author. The host repeats schema-profile and semantic validation with an
implementation proven by the language-neutral vectors in `schemas/vectors/schema-profile/`, published
through `@kumwe/studio-testkit/vectors/schema-profile/*`. Replaying that exact corpus is the assertion
set for `studio.profile/schema-property`; the TypeScript reference runner is
`runSchemaProfileVector`. Differences fail closed for contribution activation, save, or publication
and produce a compatibility diagnostic.

## Compatibility, migration, and authoring impact

This is a prerelease correction to the property surface. A contribution whose root omitted
`additionalProperties: false`, used a scalar root, carried a cross-document or recursive reference, or
used `format` must migrate before activation; Studio does not rewrite that schema or discard existing
property data. Hosts pin the exact profile/corpus version, replay the corpus before freezing a
contribution generation, and fail the complete owning contribution atomically on disagreement.

The profile changes no rendered markup or interaction model directly. An authoring shell that exposes
an admission failure must map the stable code to a localized message, preserve focus, associate the
message with the affected extension or control, and offer a non-pointer remediation path. It must not
show a raw validator stack or make a schema pointer the only accessible name.
