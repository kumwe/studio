# Repository instructions

These instructions apply to every change in this repository, whether it is made by a person or an automated contributor.

Every task follows the single setup, change, verification, and release path in
[`CONTRIBUTING.md`](CONTRIBUTING.md). Read that file, the normative
[`Studio product contract`](docs/product-contract.md), and
[`docs/roadmap/STATUS.md`](docs/roadmap/STATUS.md) before editing. Do not invent an alternate bootstrap
command, quality gate, versioning route, release workflow, or product objective in an agent-specific file.

## Source of truth

1. [`docs/product-contract.md`](docs/product-contract.md) exclusively defines Studio's normative product
   intent and minimum end-to-end authoring outcome. It does not claim that the target is implemented.
2. Canonical schemas in `schemas/` exclusively define serialized shape; normative contracts in `docs/contracts/` define semantics and observable behaviour.
3. Architecture decision records in `docs/decisions/` explain why those contracts exist; their formal status
   records contract ratification, not whether a repository implementation has landed.
4. Package code implements the contracts; it must not silently redefine them.
5. `docs/roadmap/STATUS.md` is the sole authority for implementation, profile, release, Gate A, and Gate B
   status.

Shape and semantics overlap deliberately and must agree. When code, prose, schemas, or fixtures disagree, stop and resolve the contradiction; it blocks release, and no source silently overrides another outside its declared authority.

## Invariants

- Keep the protocol language-neutral and serializable as bounded JSON.
- Never persist ungoverned executable HTML, CSS, JavaScript, template code, SQL, callbacks, framework objects,
  or arbitrary expressions in a portable Studio artifact. Governed safe-markup and scoped-style values may
  cross only their explicit bounded renderer contracts; authored JavaScript remains excluded.
- Do not leak Lit, Editor.js, Ajv, drag-and-drop, or host-specific types through public protocol contracts.
- Keep `@kumwe/studio-core` independent of the DOM.
- Keep Studio a reusable standalone page builder. The renderer turns portable intent into deterministic HTML,
  scoped CSS, and trusted progressive-enhancement JavaScript with an operable no-JavaScript fallback; hosts do
  not need editor internals to render public pages.
- Preserve contextual authoring as the product goal: creating or editing host content opens Studio for that
  resource, without a copy-and-paste handoff or a prerequisite trip through a disconnected Blueprint screen.
- Keep Node.js and npm in contributor, build, test, and release environments only. A production host deploys
  prebuilt browser assets; it never needs a Node.js or npm runtime to operate Studio.
- Treat browser validation as authoring assistance; the host remains authoritative.
- Make every drag action possible with keyboard and explicit structural controls.
- Preserve deterministic command, migration, serialization, and validation behaviour.
- Add capability negotiation instead of assuming that every host implements every optional feature.
- Keep Kumwe App integration in adapters and documentation, not in the generic packages.
- Never mark a programme gate complete without linked, reproducible evidence.

## Change workflow

Before editing, identify the affected `STUDIO-PROD-*` requirements, contract, compatibility surface, threat
boundary, and conformance fixture. For a public behavioural change:

1. update or add the normative contract and architecture decision;
2. update the canonical JSON Schema and valid/invalid fixtures;
3. implement the behaviour without widening trust;
4. test deterministic TypeScript behaviour and portable fixtures;
5. document migration, compatibility, accessibility, and host impact;
6. add a changeset when a published package is affected.

Run the one repository verification entry point before requesting review:

```bash
npm run verify
```

Release work follows the same single lifecycle: automatic coordinated alpha increments, the manual governed
RC/stable workflow, and evidence bundles used only as supporting qualification records. The exact inputs,
correction path, next-alpha behavior, and recovery rules are in `CONTRIBUTING.md`; do not invent another
publisher or hand-edit any member of the eight-package version family.

Do not bypass checks, rewrite generated output by hand, weaken a schema to accept an unexplained fixture, or describe planned work as implemented.

## Dependency policy

Prefer small, actively maintained, license-compatible primitives behind internal adapters. A third-party dependency may assist an implementation but may not own the Studio document model. Record consequential choices in an ADR and update supply-chain evidence when dependencies change.

## Review focus

Reviewers should evaluate contract compatibility, determinism, host authority, extension lifecycle, accessibility, localization, security, portability, failure recovery, tests, and documentation—not only the happy-path interface.
