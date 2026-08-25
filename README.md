# Kumwe Studio

Kumwe Studio is a portable, schema-aware visual composition platform for building reusable blueprints and populating structured content without requiring authors to hand-code a page. Safe HTML import is normalized into Studio's bounded structural markup, styling is expressed through semantic presentation intent or a separately governed scoped-style boundary, and authored JavaScript or template code is never persisted.

Studio brings content models, visual layout, responsive behaviour, theme capabilities, media, extensions, and host rendering into one authoring experience while keeping their contracts independently versioned. [Kumwe App](https://github.com/kumwe/app) is the first reference host, not a hard-coded dependency.

> **Project status:** integration-candidate implementation with the eight-package web family, 45-block/ten-pattern standalone catalog, private Editor.js rich-text adapter, semantic web renderer, and authoring shell present in the repository. Contracts remain intentionally unstable until Gate A, the current release record claims no profile, and no package is production-ready until Gate B passes. The [status page](docs/roadmap/STATUS.md) is the only authority for gate progress; delivered increments are recorded in the [changelog](CHANGELOG.md).

Version 2 qualifies the web integration only. Dart and native Flutter profiles remain Version 3 targets;
their deferral neither removes them from the architecture nor turns them into Version 2 gate blockers.

## Why Studio exists

Most page builders begin with HTML and CSS, then try to attach structured data later. Studio begins with typed data and produces a portable composition document that a host can validate, authorize, render, migrate, and expose through more than one client.

The same blueprint can therefore describe a content page, product presentation, service view, or another schema-bound experience without turning business records into page JSON or tying published content to a browser framework.

Studio owns:

- the language-neutral composition protocol;
- immutable blueprint and block contracts;
- deterministic commands, validation, history, and migrations;
- a Lit-based web authoring surface;
- the first-party page-building catalog, guided controls, and portable semantic web renderer;
- theme, extension, preview, media, and host-provider ports;
- conformance tooling for hosts, themes, blocks, and SDKs.

Hosts retain authority for authentication, authorization, persistence, audit, workflows, data access, publication, media storage, and final rendering.

## Core model

| Artifact        | Responsibility                                                                               |
| --------------- | -------------------------------------------------------------------------------------------- |
| Content model   | Fields, types, constraints, relations, localization, and policy metadata                     |
| Blueprint       | Reusable block tree, named slots, typed bindings, semantic appearance, and responsive intent |
| Entry or record | The actual content or business values                                                        |
| Design profile  | Theme-supported tokens, recipes, breakpoint roles, patterns, and renderer capabilities       |

The Studio interface may edit coordinated drafts, but these artifacts never collapse into one untyped document. Published contracts contain no executable JavaScript, Twig, SQL, callbacks, arbitrary expressions, or unrestricted HTML/CSS. Allowed pasted markup is parsed into bounded structural data, and allowed scoped styling remains separate trusted renderer context rather than executable Blueprint content.

## Product language

- **Studio** is the complete product.
- **Canvas** is the visual workspace.
- **Blueprint** is a reusable, versioned composition bound to a content model.
- **Model mode** changes a draft definition.
- **Blueprint mode** arranges and binds reusable presentation.
- **Content mode** populates values within the authority granted by the blueprint and host.

## Repository map

```text
packages/
  protocol/      Canonical schema copies, digest manifest, and TypeScript projections
  core/          DOM-free commands, session, contribution runtime, validation, canonical serialization
  studio-lit/    Lit authoring shell: canvas, outline, palette, inspector, live region
  preview/       Versioned host-preview messaging: client, host responder, handshake
  rich-text/     Bounded rich-text integration pinned to the canonical grammar
  media/         Host-neutral media contracts, orchestration, and semantic validation
  renderer-web/  Semantic HTML/CSS projection and disposable trusted enhancements
  testkit/       Fixtures, builders, command/media/host vectors, negative corpus, conformance assertions
examples/
  reference-host/ Experimental Lit-shell development harness
schemas/          Canonical JSON Schemas, examples, command/media/host sequence vectors, and negative fixtures
evidence/         Machine-checkable evidence bundles, schemas, and gate records
docs/             Normative architecture, contracts, integration, roadmap, and quality guidance
```

## Start here

1. Read the [project charter](docs/project-charter.md) and [glossary](docs/glossary.md).
2. Read the [architecture](docs/architecture/README.md) and [normative contracts](docs/contracts/README.md).
3. Walk through the [authoring experience](docs/experience/README.md) and its implementable workspace specification.
4. Check the [programme status](docs/roadmap/STATUS.md) and [dependency roadmap](docs/roadmap/README.md).
5. Choose the [generic host](docs/integration/generic-host.md) or [Kumwe App](docs/integration/kumwe-app.md) integration path.
6. Follow [contribution requirements](CONTRIBUTING.md) and the repository instructions in [AGENTS.md](AGENTS.md).

## Local development

Kumwe Studio targets Node.js 24 or newer for development, build, test, and package publication. Published web packages are browser ES modules; a production host is not required to run Node.js.

```bash
npm ci
npm run check
```

The lockfile is authoritative. Do not replace exact protocol fixtures or weaken a failing gate to make a build pass.

Run the standalone reference host in development mode and open the URL Vite prints (normally
`http://localhost:5173`):

```bash
npm run dev
```

For a production-like local smoke test, build every package and serve the generated reference-host
bundle with its pinned Content Security Policy:

```bash
npm start
```

The reference host demonstrates the complete first-party catalog, guided rich-text/media/drawing/table
controls, resource discovery, deterministic commands, theme-aware rendering, and canonical preview channel
without Kumwe App or another server. It is a development
harness and integration example, not a substitute for a host's authentication, policy, persistence,
media, audit, or publication services. See its [scope and limitations](examples/reference-host/README.md).

## Gate model

**Gate A — Integration Contract Ready** permits host integration to begin. Every public artifact, command, provider, extension, preview, media, versioning, compatibility, security, accessibility, and SDK contract must be declared, machine-checkable, reviewed, and supported by conformance fixtures. Gate A does not claim that the complete product is implemented.

**Gate B — Production Foundation Ready** permits the first stable Version 2 release. The declared web foundation must be implemented across packages, qualified against reference and Kumwe App hosts, portable through the TypeScript contract suite, accessible, secure, recoverable, documented, and released from reproducible artifacts. Dart/Flutter qualification applies when Version 3 claims those native profiles.

See the [six-month programme](docs/roadmap/README.md) for ordered work and exact evidence requirements.

## Portability

TypeScript and Lit provide the Version 2 web implementation, not the storage format. Canonical JSON Schemas, fixtures, commands, errors, and capability negotiation are language-neutral. The Version 3 native Flutter target will use generated Dart bindings and supply its own renderer/editor; embedding the Lit application is not proof of a native profile.

See [portability](docs/portability/README.md) and the [Dart/Flutter plan](docs/portability/dart-flutter.md).

## Integration and extension model

Studio is configured through immutable documents and explicit host ports. Blocks, patterns, design profiles, media providers, preview providers, data sources, translation services, and policy snapshots enter through typed registries. A host decides which contributions are trusted and active.

Kumwe App will reconcile Studio contributions through its existing signed, owner-aware extension runtime. Other hosts may implement different trust mechanisms while satisfying the same Studio contract and conformance suite.

## Security and accessibility

Studio treats authored documents, extensions, previews, media metadata, and host responses as bounded inputs. The browser implementation never becomes the authority for access control or publication validation.

Accessibility is a product invariant for both the authoring interface and the output it helps create. Dragging is never the only operation; every structural action has a keyboard and non-drag equivalent. Studio maintains its own measurable authoring quality standard and maps relevant external standards without treating any single historical specification as the ceiling.

## Releases

The eight `@kumwe` packages form one fixed release family. [`studio-release.json`](studio-release.json)
records the exact package versions, wire protocol, corpus digest, and evidence-backed profile claims and
ships byte-identically in protocol and testkit. The publish lane refuses a staggered family. Protocol
compatibility, changesets, provenance, SBOMs, signed artifacts, deprecation windows, and generated SDK
verification remain required before stable release.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Report vulnerabilities through the process in [SECURITY.md](SECURITY.md); do not disclose them in public issues.

Kumwe Studio is available under the [MIT License](LICENSE).
