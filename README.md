# Kumwe Studio

[![npm beta][version-badge]][package]
[![Build][build-badge]][build]
[![License][license-badge]][license]

Kumwe Studio is a portable, schema-aware visual composition platform for building reusable blueprints and populating structured content without requiring authors to hand-code a page. Safe HTML import is normalized into Studio's bounded structural markup, styling is expressed through semantic presentation intent or a separately governed scoped-style boundary, and authored JavaScript or template code is never persisted.

Studio brings content models, visual layout, responsive behaviour, theme capabilities, media, extensions, and
host rendering into one authoring experience while keeping their contracts independently versioned. [Kumwe
App](https://github.com/kumwe/app) integrates Studio through [Kumwe
Producer](https://github.com/kumwe/producer), the published PHP realization library for an exact Studio pin. Neither Producer nor Kumwe App is a hard-coded Studio dependency.

The normative product target is the [Studio product contract](docs/product-contract.md): creating or editing
managed content opens Studio for that exact resource, where an authorized author can start from a blank canvas
or reusable content type and work with layout, fields, bindings, and values in one continuous journey. Model,
Blueprint, and entry artifacts remain separately versioned and host-authoritative even when the interface
presents them together.

> **Project status:** Studio is on its governed beta-development lane; the exact coordinated eight-package
> version is recorded in [`studio-release.json`](studio-release.json). The 45-block/ten-pattern catalog,
> private Editor.js adapter, semantic renderer, and contextual browser shell are implemented, but the release
> record deliberately claims no profiles. This is not an RC or production-support claim: Gate A remains not
> assessed, Gate B remains blocked, and no package or host is production-supported. The
> [status page](docs/roadmap/STATUS.md) is the only authority for gate progress; delivered increments are
> recorded in the [changelog](CHANGELOG.md).

The repository now implements the Studio-side contextual coordinator, Model/Blueprint/Entry browser shell,
three save intents, configuration-driven hosted transport, blank standalone mounting, and isolated multi-mount
lifecycle. Those components are still not a claim that Kumwe App or another real host has completed and
qualified the full journey: only accepted host integration and `STUDIO-PROD-015` evidence can make that claim.

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
  protocol/      Canonical schema copies, digest-bound generated TypeScript models, and runtime projections
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

1. Read the sole [Studio product contract](docs/product-contract.md), then the
   [project charter](docs/project-charter.md) and [glossary](docs/glossary.md).
2. Read the [architecture](docs/architecture/README.md) and [normative contracts](docs/contracts/README.md).
3. Walk through the [authoring experience](docs/experience/README.md) and its implementable workspace specification.
4. Check the [programme status](docs/roadmap/STATUS.md) and [dependency roadmap](docs/roadmap/README.md).
5. Choose the [generic host](docs/integration/generic-host.md) path, or the
   [Producer-backed Kumwe App](docs/integration/kumwe-app.md) path for the first-party PHP integration.
6. Follow [contribution requirements](CONTRIBUTING.md) and the repository instructions in [AGENTS.md](AGENTS.md).

## Published packages

The eight packages share one exact release. The badges track the npm `beta` channel; package
publication does not establish a conformance profile or supported production host. Use the
[coordinated release record](studio-release.json) and [published browser assets][releases] to
select and verify the same family throughout a deployment.

| Package                                                                                | Beta version                                                                                                                      | Responsibility                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [@kumwe/studio-core](https://www.npmjs.com/package/@kumwe/studio-core)                 | [![Beta](https://img.shields.io/npm/v/@kumwe/studio-core/beta)](https://www.npmjs.com/package/@kumwe/studio-core)                 | DOM-free state, commands and validation        |
| [@kumwe/studio-media](https://www.npmjs.com/package/@kumwe/studio-media)               | [![Beta](https://img.shields.io/npm/v/@kumwe/studio-media/beta)](https://www.npmjs.com/package/@kumwe/studio-media)               | Host-neutral media orchestration               |
| [@kumwe/studio-preview](https://www.npmjs.com/package/@kumwe/studio-preview)           | [![Beta](https://img.shields.io/npm/v/@kumwe/studio-preview/beta)](https://www.npmjs.com/package/@kumwe/studio-preview)           | Host preview messaging                         |
| [@kumwe/studio-protocol](https://www.npmjs.com/package/@kumwe/studio-protocol)         | [![Beta](https://img.shields.io/npm/v/@kumwe/studio-protocol/beta)](https://www.npmjs.com/package/@kumwe/studio-protocol)         | Portable schemas and generated models          |
| [@kumwe/studio-renderer-web](https://www.npmjs.com/package/@kumwe/studio-renderer-web) | [![Beta](https://img.shields.io/npm/v/@kumwe/studio-renderer-web/beta)](https://www.npmjs.com/package/@kumwe/studio-renderer-web) | Semantic rendering and progressive enhancement |
| [@kumwe/studio-rich-text](https://www.npmjs.com/package/@kumwe/studio-rich-text)       | [![Beta](https://img.shields.io/npm/v/@kumwe/studio-rich-text/beta)](https://www.npmjs.com/package/@kumwe/studio-rich-text)       | Bounded rich-text authoring                    |
| [@kumwe/studio](https://www.npmjs.com/package/@kumwe/studio)                           | [![Beta](https://img.shields.io/npm/v/@kumwe/studio/beta)](https://www.npmjs.com/package/@kumwe/studio)                           | Browser authoring application                  |
| [@kumwe/studio-testkit](https://www.npmjs.com/package/@kumwe/studio-testkit)           | [![Beta](https://img.shields.io/npm/v/@kumwe/studio-testkit/beta)](https://www.npmjs.com/package/@kumwe/studio-testkit)           | Portable fixtures and conformance assertions   |

For build-time evaluation, `npm install --save-exact @kumwe/studio@beta` resolves the current
beta to an exact dependency. Production hosts serve prebuilt assets and use their qualified release
pin. Producer 0.3.0 deliberately implements Studio `0.1.0-beta.3`; selecting a newer Studio family
requires the reviewed re-pin and host verification described in the [Core integration playbook](docs/integration/kumwe-app.md).

## Embed Studio

Studio has one browser-deployment path: serve the prebuilt ES module, identify one or more ordinary HTML
elements, and call the public mount API. Configuration chooses whether each mount is local or connected to an
authoritative host; the browser never infers a server route.

The smallest deployment is a backendless page builder:

```html
<div data-kumwe-studio></div>
<script type="module" src="/assets/start-studio.js"></script>
```

```js
// /assets/start-studio.js
import { autoMountStudio } from './assets/studio-browser-<fingerprint>.min.js';

await autoMountStudio();
```

With no transport configuration, Studio opens a blank in-memory project with the compiled first-party block
and pattern catalogue. It performs no network request and exposes separate project JSON import/download and
save-intent download actions. More than one opted-in element creates independent Studio instances.

“No configuration” is distinct from “bad configuration.” An opted-in empty mount, or a valid deployment that
omits transport (or explicitly selects `standalone`), receives those local defaults. A mount that names a
missing configuration element, or supplies duplicate-member, malformed, oversized, schema-invalid, ambiguous,
partial-HTTP, or route/capability-inconsistent configuration, fails initialization. Studio does not reinterpret
invalid hosted intent as absent configuration and does not open a local workspace as fallback.

For a connected deployment, PHP or another host emits one inert, schema-valid
`StudioDeploymentConfiguration` beside each mount. That document contains the exact launch and resolved session configuration,
operation URLs, authentication projection, and optional declarative contributions for that instance. Studio
uses only those declared URLs; the server remains authoritative for content disclosure, permission,
validation, persistence, revisions, workflow, rendering, and webhooks. A configured refusal or unavailable
route never becomes a browser-only save or standalone session.

Follow the [prebuilt browser asset guide](docs/integration/prebuilt-browser-assets.md) for mounting and the
[generic host guide](docs/integration/generic-host.md) or
[Kumwe App PHP playbook](docs/integration/kumwe-app.md) for an authoritative integration.

## Contributor development

### Production runtime boundary

Node.js and npm are contributor, build, test, and release tools only. Official browser assets are compiled
before deployment. A production host serves those assets and implements authoritative operations through its
own server application. Kumwe App binds Producer to PHP application services and HTTP endpoints; each
exact Studio/Producer pair requires host qualification. Production
operators and content authors do not install or run Node.js, npm, Vite, or another JavaScript server to use
Studio.

[`CONTRIBUTING.md`](CONTRIBUTING.md) is the authoritative bootstrap and qualification path. Use the pinned
Node.js 24 baseline and npm 11.9.0, PHP CLI 8.1 or newer, the locked dependencies, and Playwright Chromium,
then run the environment diagnostic before editing:

```bash
npm install --global npm@11.9.0
php --version
npm ci
npx playwright install chromium
npm run doctor
```

Submit changes after the single contributor gate passes:

```bash
npm run verify
```

The lockfile is authoritative. Do not replace exact protocol fixtures or weaken a failing gate to make a build
pass. Published web packages are browser ES modules; a production host is not required to run Node.js.

Optional usage after bootstrap: run the standalone reference host in development mode and open the URL Vite prints (normally
`http://localhost:5173`):

```bash
npm run dev
```

For an optional production-like local smoke test, build every package and serve the generated reference-host
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

[version-badge]: https://img.shields.io/npm/v/@kumwe/studio/beta
[package]: https://www.npmjs.com/package/@kumwe/studio
[build-badge]: https://github.com/kumwe/studio/actions/workflows/ci.yml/badge.svg?branch=main
[build]: https://github.com/kumwe/studio/actions/workflows/ci.yml?query=branch%3Amain
[license-badge]: https://img.shields.io/github/license/kumwe/studio
[license]: LICENSE
[releases]: https://github.com/kumwe/studio/releases
