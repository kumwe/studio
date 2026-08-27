# Host transport binding

This binding is subordinate to the [Studio product contract](../product-contract.md). It implements part of
the host-authoritative boundary in `STUDIO-PROD-010`; it does not by itself implement the coordinated
contextual product journey.

## Purpose

The [host adapter contract](host-adapter.md) defines the ports, the request envelope, and the error
taxonomy as behaviour. This document binds them to a concrete HTTP transport, so a host can implement
the server side — routes, bodies, status codes — without reading any Studio source. A host is free to
implement a different transport (a native bridge, an in-process adapter); this binding is the one that
is normative when a host says it speaks Studio over HTTP.

The shapes are canonical: [`host-request.schema.json`](../../schemas/host-request.schema.json) for the
call body, [`host-result.schema.json`](../../schemas/host-result.schema.json) for a success body, and
[`host-error.schema.json`](../../schemas/host-error.schema.json) for a failure body. The operation
vocabulary is closed by [`host-operations.schema.json`](../../schemas/host-operations.schema.json).

## The three names of an operation

Every port operation carries exactly three identifiers, and the registry binds them one to one:

| Name          | Example                          | Used by                                     |
| ------------- | -------------------------------- | ------------------------------------------- |
| Typed method  | `artifact.load`                  | The client's port interface                 |
| Route segment | `artifact/load`                  | The transport                               |
| Capability id | `studio.operation/artifact.load` | `hostCapabilities` and the request envelope |

A host advertises the capability identifiers it implements; the capability document cannot name an
operation the registry does not define, so a host cannot advertise an operation that is not on the
wire. The registry also records, per operation, whether it mutates host state, whether it is
concurrency-protected through `expectedRevision`, and whether its port is required for an editable
session.

## Current binding versus target operations

The current closed registry transports the existing operations, and each artifact mutation addresses one
artifact at a time. It does **not** define a generic Studio target declaration, contextual session launch,
presentation handoff, model-definition write, coordinated Model/Blueprint/Entry transaction, **save new type
version**, or **save as new type** operation.
Those are required product outcomes, but they are not shipped transport capabilities (`STUDIO-PROD-006`
through `STUDIO-PROD-008`, `STUDIO-PROD-014`).

Before the target profile can claim HTTP support, reviewed additive contract work MUST define every new typed
method, route segment, capability identifier, argument, revision behavior, idempotency scope, response,
failure, and conformance vector. Until then, a client and host MUST NOT invent private Studio-port routes,
overload `artifact.save`, or treat a sequence of independent artifact requests as an atomic reusable-type save.
Normal host application navigation may launch the browser workspace, but it does not become a Studio port or
authority shortcut merely because a core surface or extension declares a Studio target
(`STUDIO-PROD-008`, `STUDIO-PROD-010`).

## Route and method

```
POST {baseUrl}/ports/{port}/{operation}
Content-Type: application/json
```

The path segments are the registry's `route` value. Every operation is a `POST`, including reads: the
request envelope is a body, never a query string, because a resource-context key in a URL leaks into
logs, referrers and caches. A transport MUST NOT invent additional routes for Studio ports.

## Request body

The body conforms to `host-request.schema.json`:

```json
{
  "arguments": { "id": "blueprints/landing", "version": "1.0.0" },
  "context": {
    "operationId": "studio.operation/artifact.load",
    "protocolVersion": "0.1.0-draft.2",
    "requestId": "requests/9f2c",
    "resourceContextKey": "contexts/site-4",
    "sessionGeneration": "session-r7"
  }
}
```

`arguments` is absent for operations that take only the envelope. The host validates the envelope
before dispatching: a structurally invalid envelope, an unsupported `protocolVersion`, or a superseded
`sessionGeneration` is refused before the operation runs.

Actor identity and authorization evidence are attached by the trusted transport — a session cookie, a
signed header, a service credential — and never appear in the body. A client-supplied actor value is
display context and MUST NOT authenticate a request.

## Success response

A `2xx` response carries a `host-result.schema.json` body:

```json
{ "revision": "blueprints/landing-r8", "value": null }
```

`value` is always present; an operation that answers with nothing returns `null` rather than omitting
the member. `revision` is present for every operation the registry marks `expectsRevision`, carrying
the revision the host advanced to, so a client never re-reads to learn what it just wrote.

## Failure response

A non-`2xx` response SHOULD carry a `host-error.schema.json` body. When it does, the client surfaces
that error unchanged — this is how a host-authored category, its retry classification, and the safe
current revision on a conflict cross the transport intact. A client MUST NOT infer a category from the
status code when a canonical error body is present.

When no canonical body is present, the client derives the category from the status:

| Status            | Category            |
| ----------------- | ------------------- |
| 401               | `unauthenticated`   |
| 403               | `forbidden`         |
| 404               | `not-found`         |
| 408               | `unavailable`       |
| 409               | `conflict`          |
| 413               | `limit-exceeded`    |
| 422               | `validation-failed` |
| 429               | `rate-limited`      |
| other 4xx         | `invalid-request`   |
| 502, 503, 504     | `unavailable`       |
| other 5xx         | `internal`          |
| transport refusal | `unavailable`       |
| deadline expiry   | `unavailable`       |
| unparseable body  | `internal`          |

A host emitting the canonical body SHOULD use the status that maps back to its category, so a client
that lost the body still classifies correctly. `retryable` is authoritative on the error document; a
client does not re-derive it from the status.

A malformed body — unparseable JSON, a result without `value`, or an error document the canonical
guard rejects — becomes `internal`. No client-side message ever echoes response bodies, addresses, or
underlying transport reasons.

## Concurrency and idempotency

Every operation the registry marks `expectsRevision` requires `context.expectedRevision`. When it does
not match the stored revision the host returns `conflict` **with the safe current revision** on the
error document, so the client resolves without a second read.

Every mutating operation that a client may retry carries `context.idempotencyKey`. A host that has
already accepted a key for that operation returns the original outcome rather than applying the
mutation twice. A retry after a transport failure is expected and MUST NOT double-apply.

## Cross-origin and browser transports

A browser transport applies CSRF or equivalent same-origin protection, and the preview surface follows
the separate origin-pinned rules in the [preview contract](preview.md). The transport never places the
resource-context key, an idempotency key, or a revision in a URL.

For Kumwe App, these routes terminate in PHP application services. The Studio client is compiled browser code;
serving it and accepting these HTTP calls requires no production Node/npm process or package installation
(`STUDIO-PROD-010`, `STUDIO-PROD-011`).

## Proving the binding

A host proves this binding by claiming
[`studio.profile/host-baseline`](conformance-profiles.md): the corpus fixes the envelope guards, the
revision behaviour, and the error categories the table above transports. The binding itself adds route
and status obligations that the reference HTTP client in `@kumwe/studio-testkit` exercises.

That proof does not cover the planned contextual save operations or the complete product journey. Those
outcomes require additive vectors and the executable end-to-end evidence required by `STUDIO-PROD-015`.
