---
'@kumwe/studio-protocol': minor
'@kumwe/studio-testkit': minor
---

The host transport boundary is published rather than implied. A closed operation registry
(`host-operations.schema.json`) binds every port operation's three names — the typed method, the route
segment, and the capability identifier — one to one, and the capability document's port and operation
vocabularies now reference it, so a host can no longer advertise an operation that is not on the wire.
The request and result envelopes gain canonical schemas (`host-request.schema.json`,
`host-result.schema.json`), and the HTTP binding — route scheme, body shapes, and the bidirectional
category-to-status table — becomes the normative `docs/contracts/host-transport.md` instead of a comment
inside a test helper. A drift guard asserts the registry still covers exactly the typed port surface.
