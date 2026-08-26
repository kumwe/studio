# Portability contract

Studio is portable at four separate layers. A claim at one layer does not imply the others.

| Layer        | Portable unit                                                                | Proof                                                                                                      |
| ------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Artifact     | Models, Blueprints, entries, themes, rich text, media references             | Published language-neutral schemas plus valid/invalid/migration corpus                                     |
| Protocol     | Commands, host requests, preview messages, errors and capability negotiation | Canonical serialization and transport-neutral request/result fixtures                                      |
| Behaviour    | Validation, commands, history boundaries, migration and diagnostics          | Applicable state-transition vectors in TypeScript for Version 2; Dart parity for Version 3 native profiles |
| Presentation | Web Components, future Flutter widgets, host renderers                       | Profile-specific UI/rendering conformance; never inferred from protocol support                            |

The TypeScript implementation is the reference implementation, not a second specification. Normative schemas,
semantics and canonical fixtures outrank generated types and runtime-specific convenience APIs.

## Runtime boundaries

- `@kumwe/studio-protocol` and the headless core do not import DOM, Lit, HTTP, storage, Node-only APIs, Kumwe App,
  Twig, Flutter, or a host framework.
- Browser packages use standards-based ES modules and Web Components. Node is a build/test/release tool, not
  a required production server.
- Hosts may use PHP/Twig, another server language, static generation, Web Components, or native renderers.
- A renderer declares the exact block, theme and capability versions it supports.
- Unknown or incompatible content produces a structured diagnostic or declared fallback; it is never dropped
  silently and never coerced into executable markup.

## Canonical data rules

Cross-language documents and messages follow one canonical profile:

- UTF-8 JSON with Unicode text preserved and no executable values;
- object properties interpreted by name, with canonical serialization ordering defined for checksums
  and fixed as an executable corpus in [`schemas/vectors/canonical/`](../../schemas/vectors/canonical/);
- arrays retain semantic order;
- identifiers are opaque strings and never parsed for database or route meaning;
- exact decimal, money and quantity values use canonical strings, not binary floating point;
- dates and instants use the contract's explicit RFC 3339 profiles;
- absence and `null` are distinct only where a schema explicitly permits both;
- finite resource limits apply before recursive parsing or allocation;
- unknown fields are rejected in closed objects and preserved only in declared extension envelopes;
- errors contain stable codes, JSON-pointer/node paths, localization arguments and safe details; and
- checksums are computed over the specified canonical representation and algorithm/version.

Generated SDKs record the schema epoch, document contract revision, supported wire-protocol range, schema
digest, and generator version. Hand-edited generated files are not release inputs.

The Version 2 TypeScript projection is generated into `@kumwe/studio-protocol` from all 47 files in
`schemas/`. `GeneratedProtocolModelMap` supplies the filename-to-root-type mapping, while
`GENERATED_TYPESCRIPT_MODEL_METADATA` binds it to the exact schema-manifest bytes. The contract sync path
regenerates it; `contracts:check` performs a clean byte comparison and confirms the runtime schema registry
and manifest have the complete file set. The enclosing `npm run check` typecheck compiles the generated source,
and its test phase schema-validates and round-trips every applicable positive example, vector, conformance
fixture, corpus manifest, and release record.

That round-trip proves preservation across the TypeScript JSON boundary, not semantic validation. Consumers
must still apply the matching published schema and the normative behavior contracts. A TypeScript construct
that cannot soundly represent a refinement deliberately remains broader rather than falsely excluding valid
JSON; no generated root degenerates to an `any`/`unknown` placeholder.

The compiler phase also synthesizes direct filename-to-root assignments for 234 of the 236 corpus literals.
The two maximum-JSON-depth schema-profile vectors deliberately reach a TypeScript 6 recursive-comparison
limit; their named boundary test must produce `TS2321` until the compiler can compare them, while both remain
inside the all-document runtime schema and JSON-round-trip lane. This boundary is explicit and cannot silently
turn into a cast or placeholder.

## Capability negotiation

Every client/host pair negotiates:

- supported schema epochs and document contract revisions, plus a compatible wire-protocol semantic range;
- conformance profiles;
- artifact/command/port versions;
- block/theme/plugin inventory generation;
- authoring modes;
- rendering and preview capabilities;
- media, rich text, recovery, collaboration, offline and external-reference capabilities; and
- finite resource limits.

Required-capability mismatch prevents a writable session. Optional mismatch visibly removes or disables the
operation and records a diagnostic. A client must not save an artifact containing a construct it cannot
preserve losslessly.

## SDK policy

The Version 2 tested set contains:

- TypeScript packages through npm;
- conformance fixtures consumable without JavaScript tooling at runtime.

Version 3 adds, as a separately qualified target set:

- a generated Dart protocol package through pub.dev;
- a Dart headless command/host SDK; and
- a Flutter authoring package and reference application.

Each binding may use idiomatic APIs, but the wire model, state transitions, diagnostics and compatibility
outcomes remain equivalent. Language-only helpers are non-normative unless promoted through the contract
change process.

## Unsupported profiles

A native client may intentionally support a bounded profile. Its published manifest names unsupported block,
theme, plugin, renderer, collaboration or media capabilities. Read-only inspection may retain unknown data;
writable mode is forbidden when an operation could discard or corrupt it.

“Runs in a WebView” is a valid web-authoring deployment profile, not proof of native Flutter support. “Can
decode JSON” is artifact portability, not proof of command or authoring parity.

## Portability qualification

Version 2 Gate A requires schemas, canonical rules, generated TypeScript models, and canonical fixture
round-trip. Version 2 Gate B additionally requires:

1. TypeScript applies all commands in its supported profiles to the canonical results.
2. Migration and error outcomes match on valid, invalid, old-version and malicious fixtures.
3. The fixed npm release family installs into clean, unrelated consumers.
4. The web authoring shell preserves unknown data and negotiates capabilities correctly.
5. A host unrelated to Kumwe App integrates from public packages and documentation alone.
6. A non-Twig renderer proves artifact/renderer independence for its declared block/theme profile.
7. The release record identifies the exact tested package set and evidence-backed profile claims.

Version 3 qualification additionally requires TypeScript/Dart parity for the applicable command,
migration, serialization, and error corpus; clean pub.dev consumers; native Flutter preservation and
capability negotiation; and the native accessibility/device matrices. Those requirements remain
mandatory for a native claim and do not block Version 2.

See [`dart-flutter.md`](dart-flutter.md) for the native plan and
[`../governance/compatibility.md`](../governance/compatibility.md) for evolution rules.
