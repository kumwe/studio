# Package boundaries

Studio is distributed as an npm workspace of narrowly scoped packages. Package names describe public responsibility, not implementation layering shortcuts.

| Package                      | Responsibility                                                                                                      | Forbidden dependencies                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `@kumwe/studio-protocol`     | JSON Schemas, constants, compatibility vocabulary, and current handwritten draft TypeScript projections             | DOM, Lit, network, host frameworks                                          |
| `@kumwe/studio-core`         | Immutable state transitions, commands, history, registries, semantic validation, injected-fetch HTTP client adapter | DOM, Lit, ambient/global fetch, Node-only APIs, persistence implementations |
| `@kumwe/studio-elements`     | Reusable accessible Lit components and interaction primitives                                                       | Host-specific APIs, persistence                                             |
| `@kumwe/studio`              | Application shell, canvas overlays, palette, outline, inspector and mode coordination                               | Direct host storage or database access                                      |
| `@kumwe/studio-preview`      | Preview channel, marker protocol, viewport coordination and failure handling                                        | Template execution, host authorization                                      |
| `@kumwe/studio-rich-text`    | Bounded rich-text leaf integration and portable rich-text JSON contract                                             | Page layout ownership                                                       |
| `@kumwe/studio-media`        | Host-backed media browsing/upload UI and asset selection state                                                      | Media custody, public URL construction                                      |
| `@kumwe/studio-plugin-sdk`   | Scoped registrar, plugin types, schema helpers and development assertions                                           | Host container access                                                       |
| `@kumwe/studio-host-sdk`     | Port types, adapter helpers, session negotiation and error model                                                    | Concrete CMS routes or authentication                                       |
| `@kumwe/studio-renderer-kit` | Neutral render-plan types and renderer conformance fixtures                                                         | A mandatory production renderer                                             |
| `@kumwe/studio-testkit`      | Contract, keyboard, accessibility, plugin and host conformance suites                                               | Production code paths that bypass public contracts                          |
| `@kumwe/studio-collab-yjs`   | Optional collaboration adapter after base revision and command semantics stabilize                                  | Core requirement or authoritative storage                                   |

## Dependency direction

`studio-protocol` is the innermost package. `studio-core` depends only on protocol and explicitly approved
deterministic utilities. Its optional HTTP adapter is still an inward client boundary: the caller supplies the
fetch-like transport, exact routes, authentication projection, clocks, and factories, so core imports no DOM,
Node-only networking API, or host implementation. UI, preview, media, rich text, plugins, and higher-level host
composition depend inward. No inner package imports a UI or concrete server implementation.

The application shell composes packages but does not become a service locator. Hosts provide an immutable adapter object at session creation. Plugins receive a scoped registration object.

## Public exports

Every package must define explicit exports. Deep imports into private source paths are unsupported. Public types are exported separately where the package manager permits it. Browser packages publish ESM and type declarations; there is no CommonJS compatibility promise unless a release explicitly declares one. `studio-protocol` exports the complete canonical schema registry plus generated `Generated*` models and provenance metadata from its root; consumers do not deep-import the checked-in generated file.

Package side effects are prohibited except custom-element registration entry points whose names make registration explicit. Importing a protocol, core, SDK, or test package must not mutate globals.

## Release unit

All eight Version 2 npm packages use one Changesets fixed group and share a single Studio release coordinate.
The generated release record maps that exact coordinate to the tested schema epoch, document contract
revisions, wire protocol version, corpus digest, package versions, and evidence-backed profile claims; none
is inferred from a package major. Deployable hosts pin the exact release coordinate and verify its record.
They do not resolve compatible ranges or independently select package patch versions. Future separately
qualified package families, including Version 3 Dart artifacts, must be bound explicitly by a later release
record rather than inferred from the npm coordinate.

## Gate interpretation

Package names in this document define the target boundary. Gate A requires approved public contracts and executable cross-package conformance fixtures for the foundation packages. Gate B requires implemented packages, documented exports, reproducible releases, security provenance, and conformance evidence. Naming a package here does not claim its implementation exists.
