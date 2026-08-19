# Portability contract

Studio is portable at four separate layers. A claim at one layer does not imply the others.

| Layer        | Portable unit                                                                | Proof                                                                           |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Artifact     | Models, Blueprints, entries, themes, rich text, media references             | Published language-neutral schemas plus valid/invalid/migration corpus          |
| Protocol     | Commands, host requests, preview messages, errors and capability negotiation | Canonical serialization and transport-neutral request/result fixtures           |
| Behaviour    | Validation, commands, history boundaries, migration and diagnostics          | Identical applicable state-transition vectors in TypeScript and Dart            |
| Presentation | Web Components, Flutter widgets, host renderers                              | Profile-specific UI/rendering conformance; never inferred from protocol support |

The TypeScript implementation is the reference implementation, not a second specification. Normative schemas,
semantics and canonical fixtures outrank generated types and runtime-specific convenience APIs.

## Runtime boundaries

- `@kumwe/studio-protocol` and the headless core do not import DOM, Lit, HTTP, storage, Node-only APIs, Kumwe,
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

First-party bindings are released as a tested set:

- TypeScript packages through npm;
- a generated Dart protocol package through pub.dev;
- a Dart headless command/host SDK;
- a Flutter authoring package and reference application; and
- conformance fixtures consumable without JavaScript tooling at runtime.

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

Gate A requires schemas, canonical rules, generated TypeScript/Dart models and shared fixture round-trip.
Gate B additionally requires:

1. TypeScript and Dart apply all commands in their supported profile to identical canonical results.
2. Migration and error outcomes match on valid, invalid, old-version and malicious fixtures.
3. npm and pub.dev packages install into clean, unrelated consumers.
4. Web and native Flutter authoring shells preserve unknown data and negotiate capabilities correctly.
5. A non-Kumwe host integrates from public packages and documentation alone.
6. A non-Twig renderer proves artifact/renderer independence for its declared block/theme profile.
7. Package/version manifests identify the exact tested cross-runtime set.

See [`dart-flutter.md`](dart-flutter.md) for the native plan and
[`../governance/compatibility.md`](../governance/compatibility.md) for evolution rules.
