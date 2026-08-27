# Kumwe Studio project charter

## Mission

Kumwe Studio makes structured content authoring feel direct: create or open content in its host context, start
from a reusable content type or a blank canvas, define data, arrange reusable structure, bind fields, select safe
design intent, work with media, and populate values in one continuous experience without writing presentation
code. The result remains portable, governable, accessible, and renderable by the host's own technology.

[Kumwe App](https://github.com/kumwe/app) is the first and most demanding reference host—the hand for which the glove is made—but the glove has an explicit public protocol and may be worn by other systems.

## Problem

Traditional page builders commonly store presentation implementation details and bolt structured content on afterward. Schema editors, meanwhile, often separate data modeling, template construction, and content entry so completely that authors cannot see how their work becomes a real experience. Theme developers and editor developers then maintain incompatible assumptions.

Studio joins these concerns through contracts rather than by collapsing them:

- a content model describes values and constraints;
- a blueprint describes reusable semantic structure and typed bindings;
- an entry or record supplies values;
- a design profile describes what a host theme can safely render;
- a host adapter supplies authority, persistence, preview, media, and final rendering.

## Product promise

An authorized author can open Studio directly for new or existing content, place and rearrange blocks, create
responsive regions, define or bind schema fields, populate values, choose only design capabilities offered by
the active profile, select and describe media, preview the host's real rendering, and request explicit
host-authorized save outcomes. Another conforming client—including a future Flutter client—can understand the
same artifacts without executing web code.

The complete promise and minimum acceptance journey are normative in
[`product-contract.md`](product-contract.md). This charter describes the goal; it does not claim the current
runtime has completed that journey.

## Principles

1. **Structured before visual.** Visual actions produce typed, bounded, migratable artifacts.
2. **Host-rendered truth.** Preview and publication use host semantics; a browser approximation is never the authority.
3. **Freedom through protocol.** Lock-in is removed by stable schemas, fixtures, commands, and conformance tests—not by reimplementing every low-level primitive.
4. **Capabilities, not classes.** Blueprints store responsive and design intent; profiles map intent to a concrete theme.
5. **Extensions are lifecycle-aware.** Contributions have namespaced identities, owners, versions, capabilities, migrations, and deterministic missing-state behaviour.
6. **Accessibility is an invariant.** Pointer gestures are optional accelerators. Keyboard, assistive technology, reduced motion, localization, RTL, and non-drag operations are designed from the first contract.
7. **The host remains authoritative.** Authentication, authorization, workflows, concurrency, audit, persistence, media storage, and publication are not delegated to the editor.
8. **Portable by construction.** Canonical artifacts use bounded JSON. Version 2 verifies generated TypeScript models; Version 3 native profiles additionally verify generated Dart models against the same applicable corpus.
9. **Evidence precedes claims.** A gate, compatibility promise, security property, or conformance statement exists only with reproducible evidence.
10. **Grand vision, ordered delivery.** The complete system is designed up front, then implemented in dependency order without disguising partial work as a smaller product.

## Scope

Studio includes the portable protocol, deterministic core, Lit authoring application, block and pattern registries, inspectors, command history, preview coordination, bounded rich text, media orchestration, host contracts, migrations, conformance tooling, documentation, and reference integrations.

Studio does not become a CMS, database, DAM, identity provider, workflow engine, production renderer, arbitrary code sandbox, general CSS editor, or business-rule engine. It integrates with those authorities through explicit ports.

## Coordinated contextual authoring

Studio presents Model, Blueprint, and Content work as permission and artifact-authority boundaries inside one
contextual journey. An author may begin with an existing reusable type or an authorized blank canvas, coordinate
a content-model draft, arrange reusable presentation, and populate entry values without a manual handoff to a
different product surface. The host may implement expanded authoring on a context-preserving route, but Studio
must return to the originating content resource without copy-and-paste integration.

The artifacts do not collapse. Publishing or versioning a content model, Blueprint, or entry remains an
explicit, validated host transaction. Dragging a field-like block may offer an authorized model-draft change,
but it never silently mutates a published model or changes other entries.

## Success conditions

Gate A is reached when the public integration surface is completely declared, portable, reviewed, machine-checkable, and accompanied by conformance fixtures. It allows host teams to integrate against a stable foundation while deeper implementation continues.

Gate B is reached when that declared foundation is implemented, qualified, recoverable, accessible, secure, documented, portable across the SDKs required by the release's exact profile set, and shipped through a reproducible release process. Version 2 is web-only; Dart/Flutter profiles enter this condition in Version 3. The detailed conditions and current truth live in the roadmap documentation.
