# ADR 0026: A portable production block catalog is Studio-owned

- **Status:** Proposed
- **Date:** 2026-08-25

## Context

Studio must be useful without Kumwe App and must also let a host add database-backed content without
forking the page builder. Shipping only layout primitives makes every integrator invent incompatible
names, defaults, editor controls, and composition patterns. Shipping host entities in Studio would
couple the generic package to one application.

## Decision

Studio ships 45 host-neutral definitions and ten deterministic starter patterns. The catalog owns
responsive structure, ordinary content and media, progressive composites, rich source/data display,
and resource projection primitives. Each persisted node remains bounded JSON. Host data enters only
through standard `resource-reference` and `query-reference` bindings.

Port authoring metadata names a Studio control and optional semantic profile; it never names Editor.js,
Chart.js, Mermaid, KaTeX, a framework component, or host class. Resource/query projection ports are
read-only in Studio. The host authorizes their values and the trusted renderer resolves them.

The gallery definition owns both grid and slideshow presentations. Slideshow is progressive renderer
behavior over the same ordered media collection, not executable code in an artifact.

Cross-cutting visual options use one optional closed `design` intent and the
`studio.control/presentation` inspector contract. Blocks do not duplicate CSS-shaped property bags.
Background media remains a typed media port on a semantic cover block rather than a URL in this
intent.

## Consequences

- A new host can register one canonical catalog and extend it with namespaced contributions.
- The Studio shell can create schema-valid defaults without host-specific factories.
- The catalog does not imply that optional renderer adapters are installed or that a release gate has
  passed; those claims require their own executable evidence.
- Adding or changing a first-party type is a versioned compatibility change across definitions,
  patterns, renderer conformance, and insertion tests.

## Rejected alternatives

- A Core-only catalog was rejected because it prevents standalone reuse.
- Wildcard slots were rejected because they make compatibility and security non-deterministic.
- Persisting component props or library configuration was rejected because it leaks an implementation
  into the public document model.
