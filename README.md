# Kumwe Studio

Kumwe Studio is a portable, schema-aware visual composition platform for building reusable blueprints and populating structured content without authoring HTML, CSS, JavaScript, or template code.

Studio brings content models, visual layout, responsive behaviour, theme capabilities, media, extensions, and host rendering into one authoring experience while keeping their contracts independently versioned. Kumwe CMS is the first reference host, not a hard-coded dependency.

> **Project status:** foundation programme. Contracts are intentionally unstable until Gate A. No package is production-ready until Gate B passes. The status page is the only authority for gate progress.

## Why Studio exists

Most page builders begin with HTML and CSS, then try to attach structured data later. Studio begins with typed data and produces a portable composition document that a host can validate, authorize, render, migrate, and expose through more than one client.

The same blueprint can therefore describe a content page, product presentation, service view, or another schema-bound experience without turning business records into page JSON or tying published content to a browser framework.

Studio owns:

- the language-neutral composition protocol;
- immutable blueprint and block contracts;
- deterministic commands, validation, history, and migrations;
- a Lit-based web authoring surface;
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

The Studio interface may edit coordinated drafts, but these artifacts never collapse into one untyped document. Published contracts contain no executable HTML, CSS, JavaScript, Twig, SQL, callbacks, or arbitrary expressions.

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
  protocol/      Canonical schema copies and handwritten draft TypeScript projections
  core/          DOM-free draft commands, validation, registry, and history foundations
  studio-lit/    Lit authoring shell, canvas, outline, palette, and inspector
  preview/       Versioned host-preview messaging and coordination
  rich-text/     Bounded rich-text integration
  media/         Host-neutral media contracts and authoring orchestration
  testkit/       Draft fixtures, builders, and the initial Blueprint assertion
examples/
  reference-host/ Experimental Lit-shell development harness
schemas/          Canonical JSON Schemas and portable fixtures
docs/             Normative architecture, contracts, integration, roadmap, and quality guidance
```

## Start here

1. Read the [project charter](docs/project-charter.md) and [glossary](docs/glossary.md).
2. Read the [architecture](docs/architecture/README.md) and [normative contracts](docs/contracts/README.md).
3. Walk through the [authoring experience](docs/experience/README.md) and its implementable workspace specification.
4. Check the [programme status](docs/roadmap/STATUS.md) and [dependency roadmap](docs/roadmap/README.md).
5. Choose the [generic host](docs/integration/generic-host.md) or [Kumwe CMS](docs/integration/kumwe-cms.md) integration path.
6. Follow [contribution requirements](CONTRIBUTING.md) and the repository instructions in [AGENTS.md](AGENTS.md).

## Local development

Kumwe Studio targets Node.js 24 or newer for development, build, test, and package publication. Published web packages are browser ES modules; a production host is not required to run Node.js.

```bash
npm install
npm run check
npm test
npm run build
```

The lockfile is authoritative. Do not replace exact protocol fixtures or weaken a failing gate to make a build pass.

## Gate model

**Gate A — Integration Contract Ready** permits host integration to begin. Every public artifact, command, provider, extension, preview, media, versioning, compatibility, security, accessibility, and SDK contract must be declared, machine-checkable, reviewed, and supported by conformance fixtures. Gate A does not claim that the complete product is implemented.

**Gate B — Production Foundation Ready** permits the first stable release. The declared foundation must be implemented across packages, qualified against reference and Kumwe hosts, portable through TypeScript and Dart contract suites, accessible, secure, recoverable, documented, and released from reproducible artifacts.

See the [six-month programme](docs/roadmap/README.md) for ordered work and exact evidence requirements.

## Portability

TypeScript and Lit provide the reference web implementation, not the storage format. Canonical JSON Schemas, fixtures, commands, errors, and capability negotiation are language-neutral. The target native Flutter profile will use generated Dart bindings and supply its own renderer/editor; embedding the Lit application is not the portability strategy.

See [portability](docs/portability/README.md) and the [Dart/Flutter plan](docs/portability/dart-flutter.md).

## Integration and extension model

Studio is configured through immutable documents and explicit host ports. Blocks, patterns, design profiles, media providers, preview providers, data sources, translation services, and policy snapshots enter through typed registries. A host decides which contributions are trusted and active.

Kumwe CMS will reconcile Studio contributions through its existing signed, owner-aware extension runtime. Other hosts may implement different trust mechanisms while satisfying the same Studio contract and conformance suite.

## Security and accessibility

Studio treats authored documents, extensions, previews, media metadata, and host responses as bounded inputs. The browser implementation never becomes the authority for access control or publication validation.

Accessibility is a product invariant for both the authoring interface and the output it helps create. Dragging is never the only operation; every structural action has a keyboard and non-drag equivalent. Studio maintains its own measurable authoring quality standard and maps relevant external standards without treating any single historical specification as the ceiling.

## Releases

Packages are independently publishable under the `@kumwe` npm scope but advance through one compatibility programme. Protocol compatibility, changesets, provenance, SBOMs, signed artifacts, deprecation windows, and generated SDK verification are required before stable release.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Report vulnerabilities through the process in [SECURITY.md](SECURITY.md); do not disclose them in public issues.

Kumwe Studio is available under the [MIT License](LICENSE).
