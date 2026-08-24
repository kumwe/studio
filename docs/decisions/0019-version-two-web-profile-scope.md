# ADR 0019: Version 2 qualifies the web profile set

- Status: proposed
- Scope: Version 2 gate criteria, conformance profiles, and Dart/Flutter sequencing

## Context

Studio's original six-month programme made TypeScript/Dart round-trip, a Dart headless SDK, a native
Flutter shell, and web/Flutter qualification simultaneous Gate A and Gate B obligations. Kumwe App's
Version 2 product scope is the administrator web interface. Keeping native client parity on that path
would make unrelated Dart and Flutter delivery block the web integration even though Version 2 neither
ships nor claims a native authoring client.

The language-neutral schemas, canonical data, host authority, deterministic commands, and capability
negotiation remain architectural invariants. Deferring a runtime profile must not turn the TypeScript
implementation into the storage format or weaken any web security, accessibility, integrity, release,
or evidence criterion.

## Decision

Version 2 qualifies the web profile set: `studio.profile/engine-core`,
`studio.profile/host-baseline`, `studio.profile/host-baseline-v2`,
`studio.profile/media-policy`, `studio.profile/preview-identity-v1`, and
`studio.profile/schema-property`, with `studio.profile/renderer-web` and
`studio.profile/authoring-web` added only after their executable assertion sets exist.

Version 2 Gate A requires generated TypeScript models to compile and round-trip the canonical corpus.
Version 2 Gate B requires the fixed npm release family, TypeScript core, Lit authoring shell, web
accessibility matrix, generic host, and Kumwe App integration to pass their applicable qualifications.

Version 3 targets `studio.profile/engine-dart`, `studio.profile/renderer-flutter`, and
`studio.profile/authoring-flutter`. Dart generation and cross-runtime parity, native rendering, Flutter
authoring/accessibility, pub.dev packaging, and native environment qualification remain mandatory
before a release can claim those profiles. They are not Version 2 gate criteria.

This record changes programme scope, not current truth. It does not accept either gate, approve a
profile claim, ratify the draft contract, or publish a coordinated release. Those actions still require
the repository's immutable evidence and independent review procedures.

## Consequences

Kumwe App can complete and qualify its Version 2 administrator integration without waiting for a
native client that it does not ship. Gate evidence becomes narrower and more precise: web claims prove
web behaviour, while a future Flutter claim must carry its own cross-runtime, accessibility, device,
packaging, and clean-consumer proof.

All canonical artifacts remain language-neutral. Version 2 changes that break portable semantics still
follow the compatibility process, and Version 3 must replay the same applicable corpus rather than
invent a Flutter-specific document or command model.

## Rejected alternatives

Holding Version 2 until Dart models, the Dart headless SDK, native Flutter authoring, and every native
qualification lane exist was rejected. It would couple a browser administrator release to an unshipped
client, delay real host feedback, and spend qualification effort on a profile Version 2 cannot honestly
claim. It would not make the web release safer; the web-specific gate criteria and independent evidence
remain mandatory under this decision.

Removing Dart and Flutter from the programme entirely was rejected because native portability remains a
product objective. Treating a hardened WebView as native parity was rejected because it proves the web
profile, not `engine-dart`, `renderer-flutter`, or `authoring-flutter`.
