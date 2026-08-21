# ADR 0004: Preview through the trusted delivery renderer

- Status: proposed
- Scope: visual fidelity

## Context

CMS editors frequently approximate a template in JavaScript, causing the authoring canvas and published page to diverge.

## Decision

The reference preview sends the current draft to an authenticated host preview port and renders it with the same trusted block/theme renderer used for delivery, such as Kumwe App's Twig components. A sandboxed iframe returns opaque node markers and measurements to Studio.

Preview DOM is never persisted or scraped into an artifact. A host may declare an approximate renderer only with visible labeling and tested compatibility limits.

## Consequences

Preview matches public rendering and reuses template logic. It introduces request latency, cancellation, channel security and a dedicated same-origin framing policy. Outline and inspector editing must continue when preview is unavailable.
