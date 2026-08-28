# Portability

## Portability target

Studio separates portable documents and behavior from presentation technology. TypeScript and Lit provide the primary browser authoring experience, while JSON Schema and transport-neutral messages define interoperability with non-JavaScript hosts and clients.

## Portability layers

1. **Artifact portability.** Models, entries, blueprints, themes, definitions and media references are JSON documents governed by published schemas.
2. **Protocol portability.** Commands, host requests, preview messages, errors and capability negotiation are serializable messages.
3. **Behavior portability.** Deterministic command semantics and conformance fixtures let another implementation reproduce state transitions.
4. **UI portability.** Lit components are standards-based Web Components and can embed in any browser host that supports the published platform baseline.
5. **Renderer portability.** A host may render through Twig, another server engine, static generation, web components, or a native view system when it declares which block and theme contracts it supports.

## Flutter and native clients

Flutter and native clients are Version 3 targets. They remain part of the portability architecture but
are not Version 2 Gate A or Gate B dependencies.

Flutter must not embed the TypeScript state engine as an undocumented dependency. A Flutter integration has two legitimate modes:

- **Web authoring surface:** host the full Studio browser build in a hardened WebView with a typed native bridge. This delivers feature parity quickly while maintaining explicit protocol boundaries.
- **Native projection:** generate Dart models from the protocol schemas and implement a native renderer or authoring client against the same commands and host ports. Conformance fixtures prove equivalent semantics.

The WebView mode must enforce origin, navigation, message-source, file-access, clipboard, upload, and external-link policies. Sensitive host tokens must not be placed in URLs or persisted in web storage.

A native Flutter renderer may support a subset of blocks. Capability negotiation must prevent it from claiming edit or render support for unknown blocks. Unsupported content receives a structured diagnostic or host-approved fallback, never silent data loss.

## Host independence

The protocol must not expose Kumwe App route names, PHP classes, Twig template paths, SQL identifiers, or authorization implementation details. Kumwe App maps its own concepts to stable Studio vocabulary at the adapter boundary.

Likewise, Studio does not dictate that other hosts use revisions, workflows, or permission systems identical to Kumwe App. It requires observable guarantees—expected-revision saves, explicit publication, denied operations, stable identity and structured errors—without prescribing internal implementation.

## Data evolution

Schema artifacts are language-neutral. The Version 2 package now exports deterministic generated TypeScript
models for all 55 canonical schema roots and their 253 top-level reusable definitions. Their metadata records the generator
name/version, exact schema-manifest digest, schema epoch URI, document contract revision, and supported wire
protocol range. `npm run protocol:models:generate` reproduces the checked-in source and
`npm run protocol:models:check` rejects drift; the complete applicable positive corpus is schema-validated and
round-tripped through the generated map in the TypeScript test lane. A synthesized compiler test assigns every
manifest-listed applicable corpus literal directly to its filename-specific root model except the two intentional
maximum-JSON-depth schema-profile vectors. Those vectors exceed TypeScript 6's recursive comparison limit
(`TS2321`); the test names both, requires that diagnostic, and still schema-validates and round-trips the complete
manifest-derived inventory at runtime.

Generated TypeScript or future Dart types are conveniences and never supersede schemas or semantic
conformance fixtures. TypeScript cannot encode every JSON Schema refinement: patterns, numeric/string and
maximum array bounds, integer-ness, exact object closure, unique members, conditional/dependent requirements,
and exact `oneOf` exclusivity remain runtime schema obligations. The generator encodes `minItems` and
`prefixItems`, models open additional members without excluding valid objects, and fails closed on
`patternProperties`, whose regex-key intersection cannot be represented soundly. Version 3 applies the same
provenance and corpus rule to Dart bindings before a native profile is claimed.
