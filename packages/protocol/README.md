# `@kumwe/studio-protocol`

Status: pre-Gate-A foundation alpha. Its draft contracts may change and are not a supported protocol.

Serializable contracts shared by Studio hosts, renderers, extensions, and non-JavaScript clients.
The package deliberately contains no DOM or framework dependency. JSON Schemas are published under
the `schemas` export for authoritative validation outside TypeScript.

The initial contract covers blueprints, block definitions, design profiles, host capabilities,
commands, preview messages, media asset projections, and persisted media references. `MediaAsset`
describes host-owned library state; the smaller `MediaReference` is the portable value stored in an
artifact. Consumers validate the document's `contractVersion` and separately negotiate the SemVer
wire `protocolVersion`; neither value may be inferred from the other or from the `/studio/v1/`
schema epoch URI.
