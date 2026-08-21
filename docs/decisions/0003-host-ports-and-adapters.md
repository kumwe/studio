# ADR 0003: Host ports and adapters

- Status: proposed
- Scope: embedding and authority

## Context

Studio must work with Kumwe App and other systems without importing their databases, service containers, routes, identity models or framework internals.

## Decision

All authoritative behavior crosses versioned, asynchronous host ports. Capabilities are negotiated per immutable session generation. The host owns authentication, authorization, persistence, models, resources, media, preview, publication, localization, recovery and telemetry policy.

The DOM-free core does not perform network calls. Plugins receive scoped SDK capabilities rather than the host adapter or service container.

## Consequences

Adapters add integration work but keep domain authority and security in the host. In-process JavaScript, HTTP and native bridges can implement the same contract. Errors, revision behavior, cancellation and limits require standardization.
