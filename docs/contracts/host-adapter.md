# Host adapter contract

## Purpose

The host adapter is the only route from Studio to host-owned authority. It exposes typed asynchronous ports and a negotiated capability inventory. Studio core performs no network, authentication, storage, media, or template operations itself.

Host capability documents conform to [`host-capabilities.schema.json`](../../schemas/host-capabilities.schema.json).

## Session handshake

Before opening an artifact, host and Studio negotiate:

- supported document contract revisions and SemVer wire protocol versions within the selected schema epoch;
- host identity and deployment generation;
- supported ports and versions;
- actor/session context and permissions;
- limits and feature policy;
- block, theme, renderer and plugin inventories;
- locale, direction, time zone and formatting capabilities;
- offline, recovery and collaboration behavior.

Capabilities state technical support. Permissions state actor authority. Studio requires both.

Negotiation produces one resolved StudioConfig. Its `contractVersion` selects that configuration document's shape, while its `protocolVersion` is the one wire version selected from Studio support and `hostCapabilities.protocolVersions`. The schema epoch is identified by canonical schema `$id`; it is not transmitted as a substitute for either value. No common wire version or unsupported document revision prevents an editable session.

## Standard ports

| Port           | Responsibility                                                             |
| -------------- | -------------------------------------------------------------------------- |
| `artifact`     | Load, validate, save, version, publish, unpublish and inspect dependencies |
| `model`        | Discover models/fields and create or migrate authorized model drafts       |
| `resource`     | Search and resolve authorized resources and registered queries             |
| `preview`      | Render, cancel and diagnose authenticated previews                         |
| `media`        | Browse, upload, process, annotate and select stable media assets           |
| `localization` | Load message bundles and host display vocabularies                         |
| `permission`   | Explain or refresh scoped actor authority                                  |
| `recovery`     | Store, load and discard protected recovery envelopes                       |
| `telemetry`    | Emit allowlisted, redacted operational events when policy permits          |

Hosts MAY omit optional ports. A plugin cannot add host authority by declaring a required port.

## Request envelope

Every port operation carries a unique request ID, selected wire protocol version, session generation, operation ID, the opaque `resourceContext.key`, expected revision when mutating, idempotency key when retryable, locale, cancellation signal in-process, and trace context allowed by privacy policy. A transport MAY carry the bounded scope/resource projection for diagnostics or routing, but the host resolves and verifies the canonical context from the key rather than trusting client-supplied scope values.

Actor identity and authorization evidence are attached by the trusted adapter transport. Studio-supplied actor IDs are display/context values and MUST NOT authenticate a request.

The resource-context key is non-secret and non-bearer. It is bound to the authenticated actor, session generation, selected surface, and host policy at the trusted boundary. Changing context creates a new session generation; stale, altered, or cross-session keys are rejected without disclosing private resource existence.

## Response and errors

Success returns the accepted resource revision and normalized result. Failures use stable error categories:

- `invalid-request`
- `unauthenticated`
- `forbidden`
- `not-found`
- `conflict`
- `validation-failed`
- `incompatible`
- `limit-exceeded`
- `rate-limited`
- `unavailable`
- `cancelled`
- `internal`

Errors include a correlation ID, safe localized message key, retry classification, and structured field/node diagnostics where disclosure is authorized. Stack traces, SQL, secrets, filesystem paths, and private resource existence are not returned to untrusted clients.

## Mutation guarantees

A host mutation MUST be authenticated, authorized, schema- and domain-validated, audited according to host policy, concurrency-protected, and atomic for its declared unit. Retryable mutations require idempotency. Browser transports apply CSRF or equivalent same-origin protections.

## Query guarantees

Resource search, counts, facets, pagination, relations and projections enforce authorization inside the host query. Studio never post-filters unauthorized results. Opaque cursors are preferred over client-constructed offsets for mutable datasets.

## Reference implementation requirements

The Kumwe adapter must call application services rather than querying Doctrine, resolving the DI container dynamically, or putting business rules in TypeScript. Twig renderers remain server-side. Flutter and other hosts can implement the same behavior through HTTP or a native bridge.
