# Studio architecture

This directory defines the architecture of Studio, a host-neutral visual composition system built with strict TypeScript and Lit. Studio lets a person model data, compose reusable blueprints, bind fields, author entries in context, and preview the result without storing executable HTML, CSS, JavaScript, template source, or host-specific class names in portable artifacts.

The architecture deliberately separates the reusable authoring product from any particular CMS, renderer, database, or application framework. Kumwe CMS is the reference host and the first integration target, but every host reaches Studio through the same public contracts.

## Reading order

1. [System context](system-context.md) explains responsibilities and trust boundaries.
2. [Artifact model](artifact-model.md) defines models, entries, blueprints, themes, blocks, and bindings.
3. [Runtime boundaries](runtime-boundaries.md) defines the authoring and rendering paths.
4. [Package boundaries](package-boundaries.md) assigns responsibilities to publishable packages.
5. [Portability](portability.md) explains browser, server, and Flutter interoperability.
6. [Quality model](quality-model.md) defines the architectural fitness targets.
7. [Contracts](../contracts/README.md) contains the normative wire and extension contracts.
8. [Architecture decisions](../decisions/README.md) records the reasons behind foundational choices.

## Architectural invariants

The following rules are non-negotiable:

- Portable artifacts are declarative, bounded, versioned JSON documents.
- Studio core is deterministic and independent of DOM, Lit, HTTP, storage, authentication, and host frameworks.
- The host owns identity, authorization, persistence, publication, media custody, secrets, template execution, and server-side validation.
- Studio never evaluates document-authored code or treats rendered DOM as the source of truth.
- Blocks, themes, plugins, and hosts negotiate explicit capabilities and contract versions.
- A public page does not require the Studio runtime.
- A visual operation has an equivalent keyboard and command-based operation.
- Host and plugin failures are isolated, observable, and recoverable without corrupting portable artifacts.
- Unknown data is preserved only where the owning contract explicitly provides a namespaced extension point; unknown executable behavior is never trusted.

## Delivery status

These documents and schemas establish the intended contracts. Package scaffolding may exist without implementing the complete contract; no host adapter or conformance claim is implied by a named package or interface. The project roadmap requires executable conformance before Gate A and production qualification before Gate B.
