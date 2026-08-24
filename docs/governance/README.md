# Project governance

Studio is a Kumwe-led open-source project whose public contracts are intended for unrelated hosts, clients,
themes and extensions. Governance protects that reuse: Kumwe App is the first reference host and product driver,
but a Kumwe App implementation shortcut cannot silently become a portable requirement.

## Sources of authority

When sources disagree, resolve the contradiction in this order:

1. canonical schemas and normative contracts;
2. accepted architecture decision records;
3. public compatibility and release policy;
4. conformance fixtures;
5. package code and generated SDKs;
6. examples and explanatory documentation.

The roadmap describes intended work, not implemented behaviour. [`../roadmap/STATUS.md`](../roadmap/STATUS.md)
is the only authority for Gate A/B status. No issue label, pull request, package name, example, or CI badge
overrides it.

## Roles and decision rights

| Role                             | Responsibility                                                                     | Decision authority                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Maintainer                       | Steward repository, contracts, releases, security and community process            | Merge routine changes; reject changes that violate accepted contracts      |
| Contract steward                 | Protect protocol, schemas, command semantics, diagnostics and SDK generation       | Approve public contract and compatibility classification                   |
| Architecture steward             | Protect dependency direction, host authority, plugin/render/media trust boundaries | Approve ADRs and consequential dependencies                                |
| Experience/accessibility steward | Protect authoring workflows, non-drag parity, localization and output assistance   | Approve interaction/a11y contract changes and manual evidence              |
| Security steward                 | Own threat model, disclosure, release risk and remediation evidence                | Block a release for unresolved security/privacy risk                       |
| Release manager                  | Assemble immutable release candidate and evidence                                  | Promote only a candidate that satisfies release policy and applicable gate |
| Host/profile owner               | Maintain one integration profile and its conformance adapter                       | Declare support for that profile; cannot weaken portable contracts         |
| Contributor                      | Propose, implement, test and document a bounded change                             | No unilateral public-contract or gate authority                            |

One person may hold multiple roles, but Gate A/B require independent reviewers as defined by the evidence
model. An automated contributor is a contributor, not a reviewer or release authority. AI-assisted changes
receive the same contract, test, security, provenance and human-review requirements as any other change.

## Change classes

Every pull request declares one class:

| Class                | Examples                                                                         | Required process                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Internal             | Refactor behind unchanged public behaviour, test speed, documentation correction | Normal review and full affected checks                                                                                                 |
| Additive public      | Optional property/capability, new command, new package export                    | Proposal, contract/schema/fixtures, compatibility classification, changeset, steward review                                            |
| Behaviour correction | Code or prose contradicts the existing contract                                  | Defect evidence, regression fixture, impact review; release note if consumers could depend on the defect                               |
| Deprecation          | Supported surface will be removed/replaced                                       | ADR/proposal, replacement and migration, diagnostics, published window, changeset                                                      |
| Breaking             | Required field/semantic change, removal, incompatible command or port            | New major/epoch plan, migration/adapter support, two steward approvals, release programme                                              |
| Security emergency   | Active vulnerability or unsafe dependency                                        | Private handling, security steward decision, minimum safe change, regression evidence, advisory; compatibility acceleration documented |

## Proposal and decision process

A change needs a public proposal before implementation when it introduces or changes:

- a protocol artifact, command, host port, capability, diagnostic or conformance profile;
- a package or public export;
- block/theme/plugin/media/rich-text lifecycle or trust behaviour;
- a portability guarantee or generated SDK;
- a consequential runtime dependency;
- a compatibility/deprecation/support commitment; or
- a security, privacy, accessibility, localization or recovery boundary.

The proposal states the problem, users/hosts affected, alternatives, observable contract, compatibility,
migration, failure behaviour, security/privacy, accessibility, localization, performance, portability and
evidence plan. It includes no implementation claim.

An architecture decision record captures a choice whose rationale must survive implementation. It contains
status, context, decision, alternatives, consequences, affected contracts, compatibility/security impact, and
supersession link. Reversing an accepted decision requires a superseding record; history is not rewritten.

## Review requirements

Public contract changes require:

1. contract-steward approval;
2. the relevant architecture/security/accessibility/host reviewer when that boundary changes;
3. schemas, generated types and valid/invalid/migration fixtures in the same change;
4. deterministic tests at the lowest boundary and conformance tests at the public boundary;
5. TypeScript impact and generated-source verification, plus Dart/Flutter impact when a Version 3 native profile is affected;
6. changeset and documentation for users, integrators and extension/theme authors; and
7. a clean compatibility report against every supported release/profile.

Self-approval is not sufficient for a public contract, release, security fix or gate decision. Review comments
that identify a contract contradiction remain unresolved until code, schema, fixtures and prose agree.

## Extension and ecosystem governance

- Namespaces are owner-scoped and collision-checked; package publication does not confer host trust.
- Declarative contributions are preferred. Executable plugins are an explicit host capability and security
  boundary.
- Core and first-party plugins use the same public registrar/conformance contracts as third parties.
- Examples may demonstrate only public APIs and may not carry special host privileges.
- Extension/theme compatibility is declared by ranges and fixtures, not by “works with latest.”
- Removal or trust revocation preserves artifacts and supplies actionable unresolved-node diagnostics.
- Registry/package names are verified before Gate A and reserved/published through release governance.

## Dependency and license governance

Studio is MIT licensed. Every production dependency must be license-compatible with MIT distribution and the
GPL-2.0-only Kumwe App consumer, actively maintained, justifiable against an internal implementation, and
isolated behind a boundary when it could otherwise own Studio's public model.

A consequential dependency proposal records:

- exact purpose and package(s) using it;
- license, provenance, maintainers, release activity and security history;
- bundle/runtime cost and supported environments;
- data, network, DOM/global and supply-chain behaviour;
- replacement/exit strategy and public-type leakage check; and
- lockfile, SBOM, vulnerability and update policy.

Lit may implement Web Components, Tiptap/ProseMirror may implement bounded rich-text editing, a drag primitive
may assist pointer mechanics, and Yjs may later implement collaboration. None becomes the Studio artifact,
command, host-port, theme or plugin contract.

## Security, privacy and conduct

Vulnerabilities use the private process in the repository security policy. Public issues, fixtures, traces and
evidence never include exploitable secrets, customer content, personal information or privileged preview/media
tokens. Maintainers coordinate disclosure and preserve enough public regression evidence to demonstrate the
contract without publishing harmful operational detail prematurely.

Participation follows the repository code of conduct. Technical disagreement is resolved through contracts,
evidence and recorded decisions rather than contributor status or implementation ownership.

## Gate and release authority

- Gate A is approved only against the evidence requirements in the roadmap and does not authorize a stable
  production claim.
- Gate B is approved only for an immutable release candidate and named support profiles.
- A release manager may stop promotion for any unreconciled artifact, missing evidence, provenance failure,
  undocumented compatibility change or supported-profile regression.
- A deadline, downstream integration, demonstration or already-published prerelease cannot waive a mandatory
  security, accessibility, data-integrity or compatibility criterion.

See [`compatibility.md`](compatibility.md), [`releases.md`](releases.md), and
[`../quality/README.md`](../quality/README.md).
