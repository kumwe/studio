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

The browser receives exact HTTP routing and authentication through one
[`StudioDeploymentConfiguration`](studio-deployment.md). This contract does not reserve an application URL
prefix or authorize route discovery. A missing transport selects the separate local profile and causes no
network call; once HTTP is configured, every response or refusal remains authoritative and never falls back to
local persistence.

The shapes are canonical: [`host-request.schema.json`](../../schemas/host-request.schema.json) for the
generic call body, [`host-result.schema.json`](../../schemas/host-result.schema.json) for a success body, and
[`host-error.schema.json`](../../schemas/host-error.schema.json) for a failure body. The operation vocabulary
is closed by [`host-operations.schema.json`](../../schemas/host-operations.schema.json). Contextual authoring
has the stricter, operation-specific
[`authoring-http.schema.json`](../../schemas/authoring-http.schema.json), which binds each of its seven routes
to the exact argument, capability, idempotency rule, and result. A PHP, Java, Go, or other host validates those
same JSON Schemas; no server-side TypeScript or Node.js implementation is implied.

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

## Contextual authoring operations

The registry and operation schema now close the complete contextual authoring transport vocabulary. Each
route accepts one exact request definition and returns one exact result definition:

| Route                             | Request definition          | Result definition          | State effect                                 |
| --------------------------------- | --------------------------- | -------------------------- | -------------------------------------------- |
| `authoring/resolve-target`        | `resolveTargetRequest`      | `resolveTargetResult`      | Read-only target authorization and discovery |
| `authoring/list-types`            | `listTypesRequest`          | `listTypesResult`          | Read-only authorized reusable-type listing   |
| `authoring/start`                 | `startRequest`              | `startResult`              | Idempotent contextual session creation       |
| `authoring/plan-save`             | `planSaveRequest`           | `planSaveResult`           | Read-only consequence and transaction plan   |
| `authoring/save-item`             | `saveItemRequest`           | `saveItemResult`           | Atomic Entry/item-composition transaction    |
| `authoring/save-new-type-version` | `saveNewTypeVersionRequest` | `saveNewTypeVersionResult` | Atomic coordinated successor transaction     |
| `authoring/save-as-new-type`      | `saveAsNewTypeRequest`      | `saveAsNewTypeResult`      | Atomic new reusable-type transaction         |

These operations are additive to the legacy single-artifact routes. A client or host MUST NOT overload
`artifact.save`, sequence independent artifact writes as if they were one transaction, or invent a private
Studio route for a declared target. Host navigation may launch the browser workspace, but target discovery
does not grant authority and never bypasses `resolve-target`/`start` (`STUDIO-PROD-008`, `STUDIO-PROD-010`,
`STUDIO-PROD-014`).

For all three saves, the reviewed plan reference is the complete required
`{ id, revision, successorContext }` object, not only its identity members. `successorContext` is a bounded
`returnContext` value minted by the host during planning. A successful response MUST echo that exact plan
reference and MUST put the same value in `session.presentation.returnContext`. The client adopts it only after
the complete save result passes schema and cross-document validation; a mismatch is a safe non-retryable
`internal` adapter-contract failure and does not advance the live session. Refused or cancelled saves likewise
retain the prior context.

## Configured route and method

Every call uses the exact URL declared by the deployment and this method/media type:

```text
POST <configured operation or dispatcher URL>
Content-Type: application/json
Accept: application/json
```

An `operation-map` binds each advertised registry route (`artifact/load`, `authoring/start`,
`resource/search`, and so on) to an exact URL. A `single-endpoint` binds all advertised operations to one URL
and sends the selected registry route in `X-Studio-Operation`. The header is a closed dispatcher discriminator,
not authentication and not another argument member. The server rejects an unknown/mismatched discriminator
before application dispatch.

The operation-map keys and capability identifiers remain registry-defined; the URL paths are host-defined.
`/ports/{port}/{operation}` is a useful reference implementation layout, not an inferred or mandatory path.
Every operation is a `POST`, including reads: the request envelope is a body, never a query string, because a
resource-context key in a URL leaks into logs, referrers and caches. A transport MUST NOT probe, derive, or
invent a URL for a missing operation.

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

`arguments` is absent for operations that take only the envelope. Contextual authoring always carries its
operation-specific argument wrapper. The host validates the exact operation schema before dispatching: a
structurally invalid envelope, the wrong `operationId`, an unsupported `protocolVersion`, a superseded
`sessionGeneration`, or an unexpected member is refused before the operation runs.

`resolve-target`, `list-types`, and `start` carry a complete `resourceContext` in their argument. Its `key`
MUST equal `context.resourceContextKey`; mismatch is `invalid-request` before resource lookup. The key is not a
credential. The host resolves it against the authenticated actor, target, surface, session generation, and
policy, then authorizes the exact resource without revealing whether an unauthorized resource exists.

Actor identity and authorization evidence are attached by the trusted transport — a session cookie, an
`Authorization` header, or a signed service credential — and never appear in the body. A client-supplied actor
value is display context and MUST NOT authenticate a request. Authentication and request-integrity checks run
before JSON dispatch; resource authorization, revision checks, and audit remain mandatory inside the invoked
host application service.

## Success response

A generic `2xx` response carries a `host-result.schema.json` body. Contextual authoring returns HTTP `200`
with its operation-specific result:

```json
{ "revision": "blueprints/landing-r8", "value": null }
```

`value` is always present; an operation that answers with nothing returns `null` rather than omitting the
member. `revision` is present for every operation the registry marks `expectsRevision`, carrying the revision
the host advanced to, so a client never re-reads to learn what it just wrote. Contextual authoring results do
not carry this single outer `revision`: their exact Model, Blueprint, Entry, reusable-type, plan, and session
coordinates are reconciled inside the normalized result. The plan's required successor return context is part
of that reconciliation, not navigation inferred from an HTTP location or route.

## Failure response

A non-`2xx` response SHOULD carry a `host-error.schema.json` body. When it does, the client surfaces
that error unchanged — this is how a host-authored category, its retry classification, and the safe
current revision on a conflict cross the transport intact. A client MUST NOT infer a category from the
status code when a canonical error body is present.

The optional `revision` is valid only for `conflict` and carries a safe current revision. The optional
`retryAfterMilliseconds` is valid only when `retryable` is true and the category is `rate-limited` or
`unavailable`. Bodies that combine those members with another category are malformed host errors and become a
safe client-side `internal` failure.

This is a closed compatibility boundary, not an additive annotation rule. The current
`host-error.schema.json` rejects combinations that an earlier schema digest accepted: any non-`conflict`
error carrying `revision`, and any retry delay whose category or `retryable` value does not satisfy the rule
above. A host moving to the current schema/corpus digest MUST migrate all error producers before activation;
continuing to emit a formerly valid combination is not backward-compatible with a client validating the new
digest.

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

Every mutating operation that a client may retry carries `context.idempotencyKey`. For contextual authoring it
is REQUIRED on `start` and all three save routes, and forbidden on the three read-only routes. The coordinated
save routes forbid the envelope's single `expectedRevision`: their plan and request bodies carry all exact
type, Model, Blueprint, and Entry coordinates. A host that has already accepted a key for that operation
returns the original outcome rather than applying the mutation twice. A retry after a transport failure is
expected and MUST NOT double-apply. Key scope, canonical intent preimage, in-flight coalescing, changed-intent
refusal, and failed-attempt removal remain exactly as defined by the host-adapter contract.

## Authentication, CSRF, and browser transports

Production HTTP is protected by TLS. Browser clients send JSON with `Accept: application/json` and
`Content-Type: application/json`; authentication and CSRF material stays in headers/cookies. Deployment
authentication has three closed profiles:

- `same-origin-session` sends `credentials: same-origin` plus the configured CSRF header. The session identifier
  remains in a secure HttpOnly, appropriately `SameSite` cookie and every endpoint must match the page origin.
  A modern Studio browser request carries the complete Fetch Metadata tuple `Sec-Fetch-Site: same-origin`,
  `Sec-Fetch-Mode: cors`, and `Sec-Fetch-Dest: empty`; a duplicate, partial, or different tuple is forbidden
  before session authentication. The reference browser verifier also rejects a missing tuple. A separately
  documented non-browser or legacy transport must use a different verifier and still enforce equivalent
  origin and CSRF integrity.
- `bearer-token` sends one bearer value with credentials omitted and requires an `issuedAt <= now < expiresAt`
  browser-use window whose positive duration is at most 15 minutes.
- `header-token` applies that same issuance/expiry window under an admitted non-browser-controlled header name,
  also with credentials omitted.

The token profiles are for narrow session credentials, never durable API keys or refresh tokens. Browser
Studio refuses malformed, future-issued, expired, zero-length, or overlong windows before network I/O; the
server independently verifies protected issuance/expiry claims, audience, purpose, actor,
resource, generation, revocation, and permission. A non-serialized runtime resolver may refresh short-lived
material for an advanced integration, but every result obeys the same bound. Missing authentication is `unauthenticated`; failed
CSRF/origin/service-integrity verification is `forbidden`. Neither failure reaches the port implementation.

Cross-origin credential use is opt-in, origin-allowlisted, and never combined with wildcard CORS. Preflight
handling is host infrastructure, not another Studio operation. The preview surface follows the separate
origin-pinned rules in the [preview contract](preview.md). The transport never places a resource-context key,
idempotency key, revision, credential, CSRF value, or authored document in a URL. Responses use JSON,
`Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`; hosts enforce a bounded request size before
schema validation.

For Kumwe App, Producer realizes these routes from one deliberately pinned Studio contract and dispatches them
into App-owned PHP application services. Producer translates the wire boundary but owns neither authority nor
storage. The Studio client is compiled browser code;
serving it and accepting these HTTP calls requires no production Node/npm process or package installation
(`STUDIO-PROD-010`, `STUDIO-PROD-011`). `@kumwe/studio-core` publishes the platform-neutral production
adapter, `@kumwe/studio` supplies its compiled-browser binding, and `@kumwe/studio-testkit` publishes the
reference responder and compatibility facade for conformance. A generic PHP host may implement the same
schemas and semantics directly, or consume a qualified Producer release, rather than running that responder in
production. Studio itself imports and special-cases neither path.

Workflow transitions, public rendering, and outbound webhooks are host-owned application seams. They are not
browser authoring ports and this binding does not invent routes for them. Studio may save content that the host
later publishes or announces, but it never bypasses host workflow authority (`STUDIO-PROD-012`).

## Proving the binding

A host proves this binding by claiming
[`studio.profile/host-baseline`](conformance-profiles.md): the corpus fixes the envelope guards, the
revision behaviour, and the error categories the table above transports. The binding itself adds route
and status obligations that the core HTTP client exercises against the testkit reference responder.

The normal prebuilt-browser mount consumes the deployment and constructs the configured HTTP adapter. The
lower-level `createHttpHostAdapter`, `createBrowserHttpHostAdapter`, and `createAuthoringHttpResponder` exports
in `@kumwe/studio-core`, `@kumwe/studio`, and `@kumwe/studio-testkit` exercise the exact contextual
request/result schema references, routing, security admission, resource-context equality, status mapping, safe
failures, and all seven authoring dispatches. Direct adapter/coordinator use is an advanced composition seam;
production adapters accept explicit routing configuration only. Conventional base-path expansion belongs to
testkit fixtures and must not define a host integration.

These are executable reference/client bindings, not a requirement to deploy JavaScript on a server and not by
themselves a complete `authoring-web` or product claim. Complete qualification still requires an independent
host replay and the end-to-end evidence required by `STUDIO-PROD-015`.

Adapter-authored safe diagnostics use the stable `studio.transport/http-*` message-key namespace. They never
include a URL, response body, credential, stack, or private transport reason.
