# Quality model

Studio quality is measured by externally observable guarantees, not feature count.

## Quality attributes

| Attribute            | Architectural response                                                                                    | Gate evidence                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Integrity            | Deterministic commands, revision checks, schema and semantic validation, immutable publication pins       | Golden transitions, conflict tests, corruption and recovery tests    |
| Security             | No document-authored code, least-authority ports, trusted plugin policy, isolated preview, bounded inputs | Threat tests, CSP evidence, dependency and supply-chain evidence     |
| Accessibility        | Complete non-pointer operation, semantic controls, author assistance, output diagnostics                  | Studio inclusive-authoring matrix, including mapped WCAG/ATAG floors |
| Portability          | JSON Schemas, message protocols, DOM-free core, conformance fixtures                                      | TypeScript and independent implementation round-trip evidence        |
| Extensibility        | Namespaced definitions, capability negotiation, scoped immutable registries                               | Third-party reference plugin and lifecycle tests                     |
| Replaceability       | Host adapters and renderer contracts, no canonical editor DOM or vendor project state                     | Alternative host and renderer proof                                  |
| Performance          | Incremental commands, virtualization, bounded artifacts, cancellable host ports                           | Scenario budgets on reference hardware                               |
| Resilience           | Recovery envelopes, preview degradation, plugin atomicity, explicit offline state                         | Crash, timeout, stale revision and plugin failure tests              |
| Internationalization | Message keys, locale negotiation, direction-aware UI, locale-independent artifacts                        | Pseudolocale, RTL, plural and locale-switch tests                    |
| Observability        | Correlation IDs, typed diagnostics, lifecycle events, privacy-aware telemetry                             | Trace fixtures and redaction tests                                   |

## Baseline budgets

The following targets guide design and become enforceable once the benchmark harness and reference hardware are ratified:

- A command affecting one node should update core state in under 16 ms at the 95th percentile for a 1,000-node blueprint.
- Selection and keyboard movement should remain responsive at 60 Hz without requiring full preview rendering.
- Initial interactive authoring shell should remain within an agreed compressed JavaScript and CSS budget; optional rich text, media, and plugin code loads on demand.
- Preview requests are cancellable, coalesced, and revision-labeled so stale responses cannot replace newer output.
- Default artifact limits are finite for node count, depth, property bytes, command batch size, media batch size and plugin registrations. Hosts may lower but not silently raise security-critical limits above protocol maxima.

These are target requirements, not claims of current performance. Gate B requires measured budgets and regression thresholds.

## Evidence hierarchy

1. Schema validation proves shape.
2. Semantic conformance proves invariant behavior.
3. Unit tests prove implementation details.
4. Integration tests prove host and plugin boundaries.
5. Browser and assistive-technology tests prove human interaction.
6. Security, recovery and performance exercises prove operational behavior.
7. Release provenance proves which sources and dependencies produced an artifact.

Documentation or screenshots cannot substitute for executable evidence.
