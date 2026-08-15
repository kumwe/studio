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

Flutter must not embed the TypeScript state engine as an undocumented dependency. A Flutter integration has two legitimate modes:

- **Web authoring surface:** host the full Studio browser build in a hardened WebView with a typed native bridge. This delivers feature parity quickly while maintaining explicit protocol boundaries.
- **Native projection:** generate Dart models from the protocol schemas and implement a native renderer or authoring client against the same commands and host ports. Conformance fixtures prove equivalent semantics.

The WebView mode must enforce origin, navigation, message-source, file-access, clipboard, upload, and external-link policies. Sensitive host tokens must not be placed in URLs or persisted in web storage.

A native Flutter renderer may support a subset of blocks. Capability negotiation must prevent it from claiming edit or render support for unknown blocks. Unsupported content receives a structured diagnostic or host-approved fallback, never silent data loss.

## Host independence

The protocol must not expose Kumwe route names, PHP classes, Twig template paths, SQL identifiers, or authorization implementation details. Kumwe maps its own concepts to stable Studio vocabulary at the adapter boundary.

Likewise, Studio does not dictate that other hosts use revisions, workflows, or permission systems identical to Kumwe. It requires observable guarantees—expected-revision saves, explicit publication, denied operations, stable identity and structured errors—without prescribing internal implementation.

## Data evolution

Schema artifacts are language-neutral. Generated TypeScript or Dart types, when introduced, are conveniences and never supersede schemas and semantic conformance fixtures. The current foundation alpha exposes a deliberately incomplete set of handwritten TypeScript draft projections; it does not claim schema-generated coverage. Gate A generated bindings must record the generator version, schema digest, schema epoch URI, and document contract revision from which they were produced.
