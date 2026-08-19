# ADR 0015: Host-issued upload grants

- Status: proposed
- Scope: media host port operations and the path bytes take to host storage

## Context

The media contract described a full upload lifecycle — request, authorize, transfer, verify, accept —
but the wire port carried only `get` and `list`. A host had nothing to implement: the upload state
machine existed inside `@kumwe/studio-media` against an in-package `MediaUploadTransport` interface
that was never part of the published contract, so every host would have invented its own upload
endpoint and Studio's upload UX would have bound to a different shape per host. The consuming
programme's media package had, literally, no operation to build.

The open question was how bytes cross the boundary. Routing them through the JSON port would keep one
transport to secure, but base64 inflates every transfer by a third, pushes large bodies through the
host's application tier, and makes resumable transfer a second protocol layered inside the first.

## Decision

The media port gains `authorize-upload`, `complete-upload`, `abort-upload`, `upload-status` and
`import-external`. Bytes do not cross the JSON port.

`authorize-upload` applies host policy before any byte moves and returns a grant: an opaque upload
identity, a short-lived absolute https destination the host controls, the method and any headers the
client sends verbatim, and the bounded transfer plan derived from host policy. The client transfers
directly to that destination. Custody, quotas, virus scanning and storage placement stay where the
host already implements them, and the port transport never carries a large body.

A grant is a capability scoped to one declared upload, not a credential: it expires, it authorizes
nothing else, and the client neither caches nor reuses it. `complete-upload` closes the transfer, and
the host verifies what it received rather than trusting the declared media type or checksum, so an
accepted identity may still be `processing` or `quarantined`.

## Consequences

A host implements upload against a published shape, and Studio's upload orchestration binds to that
shape once rather than per host. Policy rejection moves to authorization time, which is where the
canonical media policy vectors already place it, so an oversized or badly named upload is refused
before a transfer starts.

The transfer itself is deliberately outside the port contract: its wire details belong to the
destination the host issues. That means the conformance corpus proves authorization, completion,
abortion, status and import, but not the byte transfer, which a host proves through its own storage
tests. Hosts that cannot issue a direct destination are not served by this decision; adding a
chunk-through-the-port fallback later is additive and would be declared as a capability.

## Rejected alternatives

Chunking base64 through the JSON port was rejected for the size overhead and for forcing every byte
through the application tier. Leaving the transport interface inside `@kumwe/studio-media` was
rejected because an unpublished interface is not a contract a host can implement. Modelling the grant
as a long-lived credential was rejected: a grant that outlives its upload is a bearer token in
disguise.
