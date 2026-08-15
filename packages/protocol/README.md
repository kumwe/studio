# `@kumwe/studio-protocol`

Status: pre-Gate-A foundation alpha. Its draft contracts may change and are not a supported protocol.

Serializable contracts shared by Studio hosts, renderers, extensions, and non-JavaScript clients.
The package deliberately contains no DOM or framework dependency. JSON Schemas are published under
the `schemas` export for authoritative validation outside TypeScript.

The initial contract covers blueprints, block definitions, design profiles, host capabilities,
commands and canonical command vectors, preview messages, host port errors, media asset
projections, persisted media references, media upload sessions, portable rich text, plugin
manifests, and entries. `MediaAsset` describes host-owned library state; the smaller
`MediaReference` is the portable value stored in an artifact. Consumers validate the document's
`contractVersion` and separately negotiate the SemVer wire `protocolVersion`; neither value may be
inferred from the other or from the `/studio/v1/` schema epoch URI.

Beyond document shapes, the package projects the host adapter surface (`HostAdapter` and its nine
typed ports sharing one request envelope), the stable host error taxonomy with the
`isHostPortError` guard, the extension lifecycle state vocabulary, and the preview message guard.
`schemas/manifest.json` records the schema epoch plus the file, canonical `$id`, and sha256 digest
of every published schema so generated SDKs can pin the exact corpus they were built against.
Canonical command vectors and the negative-fixture corpus ship through `@kumwe/studio-testkit`.
