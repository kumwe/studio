# Studio browser deployment contract

This contract defines how a normal HTML page starts one or more compiled Studio instances, either as a local
standalone page builder or as a client of an authoritative HTTP host. The machine-readable input is
[`studio-deployment.schema.json`](../../schemas/studio-deployment.schema.json); canonical operation bodies and
results remain defined by [`authoring-http.schema.json`](../../schemas/authoring-http.schema.json).

The deployment document contains, but does not replace, the resolved session policy in
[`studio-config.schema.json`](../../schemas/studio-config.schema.json) for hosted operation. Neither document
grants server authority. The deployment tells the browser where and how to start, and the resolved
`session` supplies the PHP/host-authored actor, mode, session state, generation, permissions, limits, protocol,
resource context, and advertised host capabilities needed by the core before the first request. The later
`authoring/start` response supplies the server-accepted authoring snapshot and artifacts.

## Configuration-first mounting

One deployment is one bounded JSON object associated with one ordinary DOM element. `mount`, when present,
contains a CSS selector and MUST resolve to exactly one element in the containing document. It MAY be omitted
when an explicit element argument or the element associated with the JSON script already supplies the mount.
The config-only/script-only API requires `mount`; a missing target, invalid selector, or selector that resolves
more than once is an initialization error. Studio MUST NOT guess, append a replacement container, or mount into
the first match. Several same-class, no-ID elements can each use an explicit or associated empty configuration
without an ambiguous selector.

A host SHOULD emit the object in a non-executable `<script type="application/json">` element and associate that
script with its intended mount. The browser bootstrap MUST read only explicitly associated configuration
elements; it MUST NOT scan arbitrary scripts, infer an endpoint from page URLs, or treat data attributes as
permission. A declarative configuration element ID MUST be unique in the discovery scope and MUST be referenced
by exactly one mount target; sharing one deployment object across targets is invalid. The host MUST serialize
JSON safely for an HTML raw-text element, including escaping `<` so user
content cannot close the script element. Configuration is limited to 2,097,152 decoded UTF-8 bytes, JSON depth 16,
and the schema's member, array, string, URL, token, and selector bounds before any Studio instance is created.

Multiple configurations and mounts on one page are first-class. Each instance owns its draft, history,
selection, focus, lifecycle, local import/export state, transport state, and transient authentication material.
Disposing or failing one MUST NOT change, dispose, delay, or replace another, and a failed configured mount MUST
NOT become a standalone mount. Explicit discovery reports successful handles and per-target failures separately
so callers can dispose the successful set without losing failure diagnostics. A failure report MUST NOT copy or
echo the deployment document, authentication tokens, or session material; target, configuration-element ID,
phase, safe error, and optional instance correlation are sufficient. An optional `instanceId` is
correlation data only; reusing or changing it does not join sessions or grant access.

The optional `contractVersion` and `kind: "studio-deployment"` members allow an emitter to state the exact
contract explicitly. Omitting them selects the current version implemented by the loaded, exactly pinned
browser asset; it does not negotiate a newer contract.

## Minimal standalone defaults

An empty object is a complete valid deployment when the caller or associated element supplies the mount:

```json
{}
```

The following is the equivalent selector-driven form:

```json
{ "mount": "#studio-page" }
```

An absent `transport`, or an explicit `{ "kind": "standalone" }`, selects standalone behavior. Studio MUST NOT
make a host, authentication, discovery, or persistence request in this profile. Standalone forbids hosted
launch/session/contribution input and always resolves these local defaults:

| Setting               | Standalone default                                 |
| --------------------- | -------------------------------------------------- |
| Start                 | Blank                                              |
| Target                | Built-in standalone page target                    |
| Resource context      | A fresh local-only context scoped to this mount    |
| Initial mode          | Blueprint                                          |
| Initial presentation  | Inline                                             |
| Session state         | Editable                                           |
| Contributions         | The compiled, built-in block and pattern catalogue |
| Host type listing     | Disabled                                           |
| Durable save outcomes | None                                               |
| JSON import/download  | Enabled                                            |

The local context is an isolation and correlation identity, not a server resource. Standalone configuration
forbids `launch`, `session`, and `contributions` because the current local profile has one truthful meaning:
blank built-in authoring followed by explicit import when desired. Accepted configuration is never ignored, and
standalone values cannot be mistaken for host-authorized or durable session input.

Standalone keeps work in browser memory. It MUST expose two explicit, non-equivalent interchange operations:

- lossless project download/import uses the canonical `AuthoringSessionSnapshot` representation needed to
  reproduce the authored state; and
- save-intent download emits the exact canonical `AuthoringSaveIntent` that a selected host save operation
  would receive.

Import MUST validate contract versions, schema shape, limits, block/contribution admission, and semantic
invariants before replacing any current draft. It MUST NOT execute code or trust authority, endpoints, tokens,
permissions, actor identities, or host revisions found in an imported file. Download is not a durable save,
publication, workflow transition, or proof that a host will accept the intent.

## Hosted launch

`transport.kind: "http"` requires a complete `launch` and resolved `session`. `launch` fixes only:

- the qualified target, create/edit intent, and exact resource context;
- an exact existing source for edit, or the preferred initial blank/from-type choice for create;
- initial inline, minimized, maximized, or fullscreen presentation.

The resolved `session` is the one pre-request source for mode, editable/read-only state, actor, permissions,
limits, protocol, feature policy, blocks/plugins, and `hostCapabilities`. Its resource context MUST be
canonically equal to `launch.resourceContext`; a mismatch fails before any network request. The session's
protocol MUST be present in its host-capability protocol versions, and operation routing MUST agree with its
advertised port operations. Studio MUST NOT synthesize any missing session authority from browser defaults.

Launch and session values let Studio render an honest initial interface and form the canonical resolve/start
requests. They remain browser-readable, tamperable inputs rather than grants. The server MUST bind the
authenticated actor, authorize the target and resource, validate every request, and return the canonical
accepted target capabilities, artifacts, values, revisions, diagnostics, session generation, and contribution
generation. Studio MUST narrow its interface to that response. It MUST NOT widen a response to match the DOM
document or accept a modified deployment as authority.

An edit launch resolves its target and starts the exact configured existing source directly. A create launch
first resolves target authority in the same mount. If blank is its only authorized start, Studio starts it
directly. If `from-type` is authorized, Studio calls only the configured `authoring/list-types` route and renders
an accessible blank/exact-type chooser inside that mount, with host-backed search and opaque pagination. The
configured create source is only a preselection when it remains in the returned authorized set. Selecting an
exact type then issues one `authoring/start`; it does not visit another workspace, pre-create a definition, copy
artifacts, or fall back locally. Empty or refused type discovery remains an authoritative empty/failure result.

Content, field rules, dynamic block data, workflow state, and reusable-type catalogues come from canonical host
responses. An optional `contributions` bundle may bootstrap only the six safe declarative payloads:
`block-definition`, `pattern`, `field-adapter`, `inspector`, `design-vocabulary`, and `migration`. It contains a
bounded `generation` and payload array, never JavaScript, callbacks, markup injection, CSS, database access, or
executable migration/control code. Hosted Studio admits only payloads whose owner, ID, version, kind, and
dependency match the resolved target; the bundle generation MUST equal the `AuthoringSessionSnapshot` returned
by start. A mismatch fails closed. Executable custom controls remain precompiled registry injections governed by
host capability and extension lifecycle policy. A dynamic block declares typed ports and query or resource
bindings; the server resolves and authorizes their data through configured host ports.

## HTTP routing

Every configured host operation is `POST` with `Content-Type: application/json`, `Accept: application/json`, the
exact canonical request body, and the exact canonical result or host-error body. The closed route vocabulary is
defined once by [`host-operations.schema.json`](../../schemas/host-operations.schema.json). It covers artifact,
authoring, model, resource/dynamic data, preview, media, localization, permission, recovery, and telemetry ports.

An `operation-map` uses those stable route strings as keys and names an exact URL for each available operation,
for example `authoring/resolve-target`, `authoring/start`, `resource/search`, or `media/list`. Unknown keys are
invalid. Resolve-target and start are required for hosted opening. List-types and every other service are
optional; a configured save endpoint requires plan-save. The route set MUST equal the operation capabilities
advertised by `session.hostCapabilities`. Missing optional operations remain unavailable and their controls
remain disabled; an advertised operation without a route is invalid rather than silently synthesized.

A `single-endpoint` sends every operation advertised by `session.hostCapabilities` to its one URL. The body
remains the exact operation request; Studio adds `X-Studio-Operation` with the canonical stable route. The fixed header is a
dispatcher discriminator, not authentication, permission, or an alternate body schema. A server MUST reject an
unknown or mismatched value and validate the body against the selected operation before dispatch.

`authoring/list-types` is optional only for targets that do not offer `from-type`; a resolution that offers
`from-type` without the advertised/configured operation fails closed before start.

Endpoint URL strings are resolved against the containing document URL. Implementations MUST reject a URL that
is not HTTP(S), contains user information or a fragment, resolves outside a policy-approved origin, or conflicts
with browser security policy. Production endpoints MUST use HTTPS except for explicitly isolated loopback
development. The optional timeout defaults to 10,000 milliseconds and the bounded response limit defaults to
67,108,864 bytes. Implementations enforce both while consuming the response, not after buffering an unbounded
body.

Studio MUST NOT derive, probe, or synthesize an omitted endpoint. Once an endpoint is configured, network,
timeout, malformed response, 401, 403, 404, 409, 413, 422, 429, or server failure follows the canonical transport
and host-error rules. It MUST NOT retry a mutation without its original idempotency identity, switch to another
route, manufacture success, or fall back to standalone persistence.

## Authentication transport

Authentication configuration is evaluated for every request so a newly mounted configuration does not become a
permanent credential cache. The three supported serialized profiles are deliberately small:

### Same-origin session and CSRF

`same-origin-session` uses `credentials: "same-origin"`. The server's authentication session MUST remain in a
Secure, HttpOnly, appropriately scoped cookie; the cookie value MUST NOT appear in deployment JSON. The
configuration supplies only the CSRF header name and an unpredictable CSRF token. Studio sends that header on
every configured host POST. The server verifies the authenticated session, CSRF token, allowed origin or
same-site request metadata, resource context, and operation permission independently.

The endpoint MUST resolve to the document's origin. SameSite cookies and origin checks supplement rather than
replace the CSRF token. A missing, expired, or rejected token requires a fresh host-issued configuration/session;
Studio does not scrape a cookie, hidden form, or unrelated DOM node to repair it.

### Short-lived bearer token

`bearer-token` uses `credentials: "omit"` and sends `Authorization: Bearer <token>`. `issuedAt` and `expiresAt`
are required RFC 3339 instants. The closed browser-use rule is `issuedAt <= now < expiresAt`, with a strictly
positive lifetime no greater than 15 minutes. Studio rejects malformed, future-issued, expired, zero-length,
or overlong windows before making a request; serialized deployments have no implicit clock-skew grace period.
The token MUST be narrowly scoped to the intended audience, actor session, target/resource, and permitted
operations. A refresh requires an explicit host-controlled remount or a non-serialized runtime credential
provider, and refreshed material must satisfy the same window. No refresh credential belongs in DOM JSON.

### Short-lived custom header token

`header-token` also uses `credentials: "omit"`, requires the identical `issuedAt`/`expiresAt` window, and sends
the raw token under the declared header name. Runtime validation is case-insensitive and MUST reject
browser-controlled or transport-owned names,
including `Accept`, `Content-Type`, `Content-Length`, `Cookie`, `Host`, `Origin`, `Referer`,
`X-Studio-Operation`, and the connection/proxy forwarding header families. This profile exists for established
short-lived session-token conventions; it MUST NOT carry an API key or other durable secret.

The timestamps bound only whether Studio may project the browser-visible credential. They are not signed proof,
permission, or identity: the server independently verifies the token's protected issuance/expiry claims,
signature or entropy, audience, purpose, actor/session, resource, generation, revocation, and operation.

Bearer and custom-header deployments may use an explicitly allowed cross-origin HTTPS endpoint only when that
server's CORS policy names the exact embedding origin, methods, and headers. Wildcard credential policy is not
acceptable.

All three profiles are browser-visible and therefore depend on normal XSS defenses: trusted compiled assets,
strict output encoding, a restrictive Content Security Policy, dependency integrity, and no untrusted executable
plugins. Studio MUST NOT persist, include in undo/history, export, log, diagnose, echo, or send tokens anywhere
except the exact configured operation URL being called. This includes preview, media, resource, or telemetry only
when that operation is explicitly advertised and routed; credentials never flow to renderer frames, webhooks,
asset delivery URLs, upload-grant destinations, redirects, or unrelated origins.

## Server-authoritative round trip

The browser sequence is intentionally conventional:

1. Parse and validate the bounded deployment document, resolve exactly one mount, and compile local defaults or
   an HTTP transport.
2. For HTTP, verify the resolved session/launch context and route/capability agreement, then call
   resolve-target. Existing/edit launches start directly; create launches present authorized blank/exact-type
   choices in the same mount (calling list-types only when advertised) before one exact start.
3. Accept only canonical, schema-valid results whose target, resource context, session generation, operation ID,
   revisions, and capability bounds match the active instance.
4. Apply local commands for immediate authoring feedback while preserving canonical Model, Blueprint, Entry,
   block, rich-text, and save-intent formats.
5. Before a durable action, call plan-save and show the returned affected artifacts and consequences.
6. Submit the selected idempotent save request. Reconcile only the server-accepted revisions and diagnostics.

The PHP or other host chooses storage, authentication implementation, authorization, validation, transactions,
workflow, audit, outbox/webhook behavior, preview and public rendering. Studio chooses none of them. A PHP host
can route every operation through one controller or use a closed operation map; both are equivalent when they preserve
the canonical bodies, results, errors, idempotency, revision, and security semantics above.

## Failure and configuration changes

Invalid configuration fails closed before mounting. A host MAY display a safe localized initialization error,
but MUST NOT include token values, response bodies, internal URLs, stack traces, or policy details. `read-only`
disables mutation locally and the server still rejects mutation independently.

Changing mount, resource, target, start source, mode, session state, capability bounds, routing, or
authentication requires a new compiled deployment/session. It MUST NOT silently transplant dirty work or
credentials. Presentation changes within one admitted live session follow the separate continuity contract and
do not require a new deployment.
