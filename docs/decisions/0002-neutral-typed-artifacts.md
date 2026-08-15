# ADR 0002: Neutral typed artifacts are authoritative

- Status: proposed
- Scope: persisted data and public interoperability

## Context

Editor DOM, HTML/CSS output and third-party project formats create renderer lock-in, weaken validation and make native-client reuse difficult.

## Decision

Content models, entries, Blueprints, themes and definitions are bounded JSON artifacts governed by versioned JSON Schemas and semantic contracts. The command-applied artifact is authoritative during authoring; the host-accepted revision is authoritative after save. Rendered HTML, canvas DOM and dependency-specific state are rebuildable projections.

Artifacts contain no executable code or host template implementation details.

## Consequences

Hosts and renderers can be replaced, and Dart or other bindings can be generated. Studio must design migrations, compatibility checks and conformance fixtures early. Exact visual freedom is bounded by typed block and theme contracts rather than arbitrary CSS.
