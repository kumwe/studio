# Contributing to Kumwe Studio

Kumwe Studio welcomes contract proposals, implementations, documentation, design research, accessibility improvements, conformance fixtures, and host adapters. The project is contract-first: a polished interface does not justify an ambiguous or unsafe document model.

## Before opening a change

- Read the [project charter](docs/project-charter.md), [architecture](docs/architecture/README.md), and [contract index](docs/contracts/README.md).
- Check the [programme status](docs/roadmap/STATUS.md). A roadmap item is not evidence that a feature already exists.
- Search open issues and pull requests for overlapping work.
- Use a proposal issue for a new public contract, package, capability, dependency, or compatibility break.
- Use GitHub's private security reporting process for vulnerabilities; never open a public security issue.

## Development setup

Use Node.js 24 or newer and the package manager version declared by the repository.

```bash
npm install
npm run check
npm test
npm run build
```

The lockfile and canonical fixtures are part of the reviewed change. Production hosts consume built browser modules or language-neutral artifacts and are not required to run Node.js.

## Designing a change

A public feature normally needs all of the following:

- a normative statement using the terms defined in `docs/contracts/normative-language.md`;
- a JSON Schema change with valid and invalid fixtures;
- a compatibility classification and migration story;
- capability negotiation and deterministic failure behaviour;
- tests at the lowest package boundary plus integration or conformance tests;
- accessibility, localization, security, and non-JavaScript behaviour where applicable;
- documentation for both Studio users and host implementers;
- a changeset for every affected published package.

Protocols use additive evolution by default. Unknown required capabilities fail explicitly. Unknown optional metadata may be preserved only where the relevant contract says so. Published blueprints and versions are immutable.

## Package boundaries

- `protocol`: language-neutral types, schemas, identifiers, errors, and fixtures; no DOM or framework dependencies.
- `core`: deterministic state, commands, validation, registries, history, and migrations; no DOM.
- `studio-lit`: accessible Web Components and authoring coordination.
- `preview`: typed communication with a host-rendered preview.
- `rich-text`: bounded rich-text leaf editing; never a second page model.
- `media`: host-neutral media selection and usage metadata; no storage authority.
- `testkit`: reusable conformance support; it must test public contracts rather than private implementation details.

Host-specific code belongs in a host adapter or a separately versioned integration package.

## Pull requests

Keep commits intentional and explain:

1. the user or integrator problem;
2. the affected contract and package boundary;
3. compatibility and migration impact;
4. security and accessibility implications;
5. verification performed;
6. remaining limitations or deliberately deferred work.

Do not claim Gate A, Gate B, conformance, accessibility, security, or portability without the evidence required by `docs/roadmap/evidence.md`.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
