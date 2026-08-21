# ADR 0007: Portable Flutter projection

- Status: proposed
- Scope: native clients

## Context

Kumwe App intends to support a fully native Flutter client. Coupling canonical Studio behavior to browser DOM or Lit would prevent native reuse, while duplicating unconstrained behavior would cause divergent artifacts.

## Decision

JSON Schemas, message contracts, command semantics and conformance fixtures are language-neutral. TypeScript implements the reference browser authoring experience. A Flutter client initially may embed Studio in a hardened WebView through the host protocol; a native implementation uses generated Dart models and must pass the same supported-capability fixtures.

Native renderers negotiate an explicit block/theme subset and never claim silent fallback.

## Consequences

Kumwe App can ship browser parity before a full native editor while preserving a credible native path. The project must publish stable schemas, fixtures and digests independently of npm types. WebView security and native-bridge policy become qualification requirements.
