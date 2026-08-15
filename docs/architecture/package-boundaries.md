# Package boundaries

Studio is distributed as an npm workspace of narrowly scoped packages. Package names describe public responsibility, not implementation layering shortcuts.

| Package                      | Responsibility                                                                                          | Forbidden dependencies                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `@kumwe/studio-protocol`     | JSON Schemas, constants, compatibility vocabulary, and current handwritten draft TypeScript projections | DOM, Lit, network, host frameworks                 |
| `@kumwe/studio-core`         | Immutable state transitions, commands, history, registries, semantic validation                         | DOM, Lit, HTTP, persistence                        |
| `@kumwe/studio-elements`     | Reusable accessible Lit components and interaction primitives                                           | Host-specific APIs, persistence                    |
| `@kumwe/studio`              | Application shell, canvas overlays, palette, outline, inspector and mode coordination                   | Direct host storage or database access             |
| `@kumwe/studio-preview`      | Preview channel, marker protocol, viewport coordination and failure handling                            | Template execution, host authorization             |
| `@kumwe/studio-rich-text`    | Bounded rich-text leaf integration and portable rich-text JSON contract                                 | Page layout ownership                              |
| `@kumwe/studio-media`        | Host-backed media browsing/upload UI and asset selection state                                          | Media custody, public URL construction             |
| `@kumwe/studio-plugin-sdk`   | Scoped registrar, plugin types, schema helpers and development assertions                               | Host container access                              |
| `@kumwe/studio-host-sdk`     | Port types, adapter helpers, session negotiation and error model                                        | Concrete CMS routes or authentication              |
| `@kumwe/studio-renderer-kit` | Neutral render-plan types and renderer conformance fixtures                                             | A mandatory production renderer                    |
| `@kumwe/studio-testkit`      | Contract, keyboard, accessibility, plugin and host conformance suites                                   | Production code paths that bypass public contracts |
| `@kumwe/studio-collab-yjs`   | Optional collaboration adapter after base revision and command semantics stabilize                      | Core requirement or authoritative storage          |

## Dependency direction

`studio-protocol` is the innermost package. `studio-core` depends only on protocol and explicitly approved deterministic utilities. UI, preview, media, rich text, plugins, and host adapters depend inward. No inner package imports a UI or host implementation.

The application shell composes packages but does not become a service locator. Hosts provide an immutable adapter object at session creation. Plugins receive a scoped registration object.

## Public exports

Every package must define explicit exports. Deep imports into private source paths are unsupported. Public types are exported separately where the package manager permits it. Browser packages publish ESM and type declarations; there is no CommonJS compatibility promise unless a release explicitly declares one.

Package side effects are prohibited except custom-element registration entry points whose names make registration explicit. Importing a protocol, core, SDK, or test package must not mutate globals.

## Release unit

All first-party packages use a coordinated release train. The release manifest maps each independently versioned package to the tested schema epoch, document contract revisions, and wire protocol versions; none is inferred from a package major. Packages may have different patch versions, but the release manifest records the tested set. A host should depend on compatible ranges and pin the resolved release set in deployable builds.

## Gate interpretation

Package names in this document define the target boundary. Gate A requires approved public contracts and executable cross-package conformance fixtures for the foundation packages. Gate B requires implemented packages, documented exports, reproducible releases, security provenance, and conformance evidence. Naming a package here does not claim its implementation exists.
