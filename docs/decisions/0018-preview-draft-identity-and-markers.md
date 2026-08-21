# ADR 0018: Canonical preview draft identity and marker preorder

- Status: proposed
- Scope: preview digest preimage, render-attempt correlation, marker identity, and wire compatibility

## Context

The preview channel already carried a 64-character `draftDigest`, a marker list, and an optional
marker-to-node map, but it did not define the bytes hashed or the marker construction. The reference
host hashed `JSON.stringify(draft)`, so equivalent JSON objects could have different identities when
their member insertion order differed. Its renderer incremented a process-local marker counter that
survived renders, so the same draft did not reproduce the same marker inventory. Another runtime could
match the schema and still disagree byte for byte.

The optional map and broad stable-ID marker shape also left a trust gap. A renderer could omit map
entries, map two markers to one node, report a marker for a different draft, or announce an activation
for an invented or revoked region. Studio could not distinguish those cases from a current render.

Digest-only callback correlation left a second race: after timeout or retry, an earlier render of the
same artifact bytes could settle during a later request, including at a different viewport. A matching
digest could not identify the attempt. Disposal cleared accepted inventory but did not invalidate an
in-flight callback, so late settlement could republish the disposed render. Measurement requests also
accepted canonical-looking markers that were absent from the current inventory.

## Decision

The preview identity of a complete, schema-valid Studio artifact is lowercase hexadecimal SHA-256 over
exactly its canonical UTF-8 bytes as defined by the canonical serialization contract and corpus. No
prefix, envelope, context, viewport, BOM, or newline participates in the preimage. The authoritative
host resolves the exact artifact/revision/digest tuple within the authenticated session and resource
scope, validates it, recomputes the digest, and compares it before rendering. The digest identifies
state; it never grants authority and does not identify a render attempt.

Every render carries a session-unique request ID which `rendered` or `render-failed` echoes as its
correlation ID. Retries use new IDs even for the same digest and viewport. The responder gives the
callback an `AbortSignal` and captures a private generation. Supersession, matching disposal, reload,
teardown, and local disposal abort and invalidate that generation; settlement must match both request
ID and generation. Client abort and timeout trigger best-effort matching disposal after local
invalidation. Request IDs are never reused in one channel. The draft.2 message vocabulary is closed.

A rendered Blueprint uses markers of the form
`studio.preview/node/<draftDigest>/<ordinal>`. The ordinal is zero-based canonical decimal and follows
one preorder: root array order; node before descendants; slot names sorted by ascending UTF-16 code
unit; child array order. The inventory resets on every render and is bounded to 100000 nodes.

Every rendered response carries a required `markerMap` whose keys exactly equal the ordered marker
inventory and whose node IDs are unique. Grammar, embedded digest, contiguous order, map parity, and
uniqueness are validated before a response crosses the channel. These generic checks establish
payload-internal consistency; the authoritative renderer, which holds the validated draft, compares
the node mapping against the canonical traversal. Activation is accepted only for the
latest live inventory; render start, reload, matching draft disposal, and teardown revoke prior marker
authority.

Measurement requests name a non-empty subset of the current digest-bound inventory. Client and host
both reject a foreign or stale marker before invoking the measurer. The responder captures its current
digest and measurement generation before the callback. A same-digest rerender or viewport instruction
invalidates that generation; viewport invalidation occurs before listeners apply the new dimensions,
so the callback cannot publish stale pre-resize geometry.

These semantics are published as `studio.profile/preview-identity-v1` through
`preview-vector.schema.json` and `vectors/preview/`. Because existing `.1` peers accepted optional,
arbitrary markers, digest-only attempt correlation, and an unspecified digest preimage, the negotiated wire protocol advances from
`0.1.0-draft.1` to `0.1.0-draft.2`; an open `.1` channel is not upgraded in place.

## Consequences

TypeScript, Dart, PHP, and other hosts can reproduce one draft identity and marker inventory without
executing the reference renderer. Canonical identity makes member insertion order irrelevant, while
UTF-8 content and every complete artifact member remain significant. Stable preorder makes selection
and measurement reproducible without exposing values in marker strings.

Hosts must stage or load the complete draft, validate it, and recompute the digest rather than trust a
client key. The reference store validates both ingress and egress and keys defensive snapshots by
artifact, revision, and digest. Renderers must reset marker state per render, cooperate with abort
signals, and enumerate the Blueprint structure rather than the produced DOM. A renderer result that is internally inconsistent becomes the generic
`studio.preview/render-failed` outcome; private failure details still do not cross the channel.

The marker is deliberately not a stable document identifier across edits: changing any artifact byte
changes the digest and therefore revokes every old marker. Selection persists by Blueprint node ID and
is remapped after the next accepted render. This preserves keyboard, outline, and inspector operation
when preview is stale or unavailable.

## Rejected alternatives

Hashing `JSON.stringify` output was rejected because object insertion order is a runtime construction
detail rather than a portable artifact identity. Hashing an envelope containing actor, viewport, or
session was rejected because equal draft content would fragment across presentation context and the
digest could be mistaken for authority. Random or renderer-local markers were rejected because they
cannot be reproduced or checked by another runtime. Embedding raw node IDs in marker strings was
rejected because it makes DOM output carry durable document identities and leaves stale markers
indistinguishable; the exact map is the explicit, revocable association. Repairing incomplete marker
maps in the responder was rejected because it would hide a renderer conformance defect.

Using the digest as the render correlation ID was rejected because identical bytes are valid across
retries and viewports. Depending only on `AbortSignal` cooperation was rejected because third-party or
server callbacks can ignore cancellation; the private generation check is the fail-closed authority.
