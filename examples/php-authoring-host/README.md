# PHP contextual authoring host reference

This example is the framework-neutral PHP 8.1+ server boundary for Studio's seven contextual authoring HTTP
operations. It accepts the canonical JSON wire contract, performs transport admission before JSON dispatch,
validates exact schemas, and invokes host-owned application services. It has no npm, Node.js, JavaScript
server, database, framework, or persistence dependency.

It is an integration reference, not a CMS implementation and not evidence that `STUDIO-PROD-010` or
`STUDIO-PROD-015` is complete. A real host still has to supply identity, authorization, persistence,
transactions, revisions, audit, outbox/webhooks, workflow, preview, media, publication, rendering, and its
independent conformance replay.

## Closed route surface

The example responder may be mounted under any normalized host-owned prefix. Its operation-map helper emits
the resulting exact URLs into `StudioDeploymentConfiguration`; Studio never derives the prefix. Every call
uses `POST`, `Accept: application/json`, and `Content-Type: application/json`. Authentication and
request-integrity material stays in secure cookies or headers and never enters the JSON body.

| Route                             | Argument wrapper | Effect                                             |
| --------------------------------- | ---------------- | -------------------------------------------------- |
| `authoring/resolve-target`        | `request`        | Authorized target discovery                        |
| `authoring/list-types`            | `query`          | Authorized reusable-type listing                   |
| `authoring/start`                 | `request`        | Idempotent contextual session allocation/load      |
| `authoring/plan-save`             | `intent`         | Read-only consequence and transaction plan         |
| `authoring/save-item`             | `request`        | Atomic item/Entry transaction                      |
| `authoring/save-new-type-version` | `request`        | Atomic coordinated immutable successor transaction |
| `authoring/save-as-new-type`      | `request`        | Atomic new reusable-type transaction               |

The exact source is [`../../schemas/authoring-http.schema.json`](../../schemas/authoring-http.schema.json).
The responder uses its operation-specific request and result references and the canonical
`host-error.schema.json` error shape.

## What to implement

1. Implement `SchemaValidator` with a maintained JSON Schema draft 2020-12 library. Vendor the complete
   canonical `schemas/` tree at the exact Studio release coordinate, resolve its HTTPS identifiers locally,
   cache compiled schemas, and fail closed on resolution or evaluation errors.
2. Implement `TransportSecurityVerifier`. Authenticate the host session or signed service credential and
   verify CSRF plus exact-origin/fetch-metadata policy for ambient cookie calls. The verifier receives no body,
   so this boundary completes before JSON parsing. Return an opaque trusted principal; never authenticate a
   client-supplied actor.
3. Implement `AuthoringApplicationService` as thin adapters to host application use cases. Resolve and
   authorize the canonical resource context again inside those services. Do not query a database, render a
   template, or coordinate repositories in the HTTP responder.
4. Implement a `FailureMapper` for explicit domain exceptions. Map only safe messages and canonical
   categories. The default mapper preserves `HostFailure` and turns every unknown exception into a non-leaking
   `internal` response.
5. Construct `AuthoringResponder` in the host composition root and adapt the host framework's request and
   response objects. The supplied `public/index.php` is an optional traditional front controller; set
   `STUDIO_PHP_BOOTSTRAP` to an absolute, non-public composition-root file that returns the configured
   responder.

```php
<?php

use Kumwe\Studio\PhpAuthoringHost\AuthoringResponder;

return new AuthoringResponder(
    application: $authoringApplicationService,
    schemas: $studioSchemaValidator,
    security: $transportSecurityVerifier,
    failureMapper: $hostFailureMapper,
    routePrefix: '/studio/ports',
);
```

Production serves the already-built browser files and lets PHP emit the deployment document below. It does not
run npm, Vite, or a JavaScript server, and the browser never infers routes from the current page URL.

## Emit one browser deployment configuration per mount

PHP chooses whether a Studio instance is standalone or host-connected. It emits an inert
[`studio-deployment.schema.json`](../../schemas/studio-deployment.schema.json) document next to the target
`div`; the same compiled Studio module is served unchanged for every host, actor, resource, and page. The
session cookie, authorization evidence, database coordinates, and application services never enter the
document. The required hosted `session` is the complete resolved `StudioConfiguration`, including actor display
identity, a permission snapshot, protocol/generation, limits, and host capabilities. Those values make the UI
honest but remain advisory client inputs; the server never authenticates or authorizes from values echoed by
the browser.

`StudioDeploymentEmitter` validates the canonical schema, enforces the browser bootstrap's 2 MiB/depth-16
limits, checks that `mount` names the emitted target, and JSON-escapes `<`, `>`, `&`, quotes, U+2028, and U+2029.
The 2 MiB ceiling is deliberately large enough for the schema's 5,000 locked block references and 500
declarative contribution payloads while remaining a deterministic DOM/bootstrap allocation bound.
For hosted instances it also requires identical launch/session resource contexts and an operation map that
exactly equals the operations advertised by the resolved host capabilities. It deliberately emits no
executable inline JavaScript:

```php
<?php

use Kumwe\Studio\PhpAuthoringHost\AuthoringEndpointConfiguration;
use Kumwe\Studio\PhpAuthoringHost\StudioDeploymentEmitter;

$configuration = (object) [
    'contractVersion' => '0.1-draft',
    'kind' => 'studio-deployment',
    'instanceId' => 'studio/article-42',
    'mount' => '#article-studio',
    'launch' => (object) [
        'targetId' => 'example/article-editor',
        'intent' => 'edit',
        'resourceContext' => (object) [
            'key' => 'contexts/article-42',
            'surface' => 'example/administrator',
            'scopes' => [],
            'resource' => (object) ['type' => 'example/article', 'id' => 'articles/42'],
        ],
        'start' => (object) ['kind' => 'existing'],
        'initialPresentation' => 'maximized',
    ],
    // Complete, schema-valid studio-config.schema.json resolved by PHP for
    // this actor display context, resource, generation and host policy.
    'session' => $resolvedStudioConfiguration,
    'transport' => (object) [
        'kind' => 'http',
        'routing' => AuthoringEndpointConfiguration::operationMap(),
        'authentication' => (object) [
            'kind' => 'same-origin-session',
            'credentials' => 'same-origin',
            'csrf' => (object) [
                'headerName' => 'X-CSRF-Token',
                'token' => '<current-session-csrf-token>',
            ],
        ],
        'requestTimeoutMilliseconds' => 10_000,
        'maximumResponseBytes' => 8_388_608,
    ],
];

$emitter = new StudioDeploymentEmitter($studioSchemaValidator);
echo $emitter->render('article-studio', 'article-studio-config', $configuration);
```

The resolved `session` contains `contractVersion`, `protocolVersion`, session ID/generation, initial mode and
session state, actor display context, locale/preferences, the same resource context, advisory permissions,
artifact/block/plugin coordinates, exact host capabilities and implemented operations, every finite limit,
feature flags, and preview policy. PHP derives it only after its normal authentication, target/resource
authorization, contribution admission, and policy reduction. `launch.resourceContext` and
`session.resourceContext` must agree; the canonical resolve/start response may only narrow the configured
surface. A DOM edit to `actor`, `permissions`, `sessionState`, `hostCapabilities`, or any endpoint never widens
server authority.

When installed extensions contribute Studio tools, PHP may also include the optional owner-aware
`contributions` bundle: one immutable generation plus schema-valid block definitions, patterns, field adapters,
inspectors, design vocabularies, and migrations. PHP admits only trusted installed contributions for this
target/resource; the bundle contains declarative contracts, not callbacks, PHP objects, HTML/JavaScript, SQL,
or database credentials. Dynamic block values still travel through separately authorized host ports.

The resulting discovery pair is:

```html
<div id="article-studio" data-kumwe-studio="article-studio-config"></div>
<script id="article-studio-config" type="application/json">
  {...}
</script>
```

The external, fingerprinted browser module explicitly calls `autoMountStudio()` after it loads; there is no
load-time global mutation. `data-kumwe-studio` is the configuration element ID, while the document's `mount`
selector independently resolves and is required to identify exactly that paired `div`.

A page may render multiple independent pairs. Give every mount/configuration element a unique ID and call the
emitter once per pair. For example, the article editor above may coexist with a local scratch instance:

```php
echo $emitter->render(
    'scratch-studio',
    'scratch-studio-config',
    (object) ['mount' => '#scratch-studio'],
);
```

Omitting `transport` selects blank standalone authoring. Nothing is loaded or persisted by a server; JSON
import/export carries the same portable document shape used at the host boundary. Omitting one optional route
from a configured operation map disables that server capability. A request failure on a configured route is
authoritative and never silently falls back to browser-only storage or download.

## Endpoint map and canonical exchange

`AuthoringEndpointConfiguration::operationMap()` produces the exact deployment map below. Its shared default
is the same `/studio/ports` prefix used by `AuthoringResponder`; passing another normalized prefix to both is
an explicit host composition choice. Each
value is a same-origin URL reference and receives `POST`, `Accept: application/json`, `Content-Type:
application/json`, and the operation-specific canonical request body. Success and error bodies retain the
canonical formats linked above.

| Deployment route key              | Endpoint path                                   | Canonical argument |
| --------------------------------- | ----------------------------------------------- | ------------------ |
| `authoring/resolve-target`        | `/studio/ports/authoring/resolve-target`        | `request`          |
| `authoring/list-types`            | `/studio/ports/authoring/list-types`            | `query`            |
| `authoring/start`                 | `/studio/ports/authoring/start`                 | `request`          |
| `authoring/plan-save`             | `/studio/ports/authoring/plan-save`             | `intent`           |
| `authoring/save-item`             | `/studio/ports/authoring/save-item`             | `request`          |
| `authoring/save-new-type-version` | `/studio/ports/authoring/save-new-type-version` | `request`          |
| `authoring/save-as-new-type`      | `/studio/ports/authoring/save-as-new-type`      | `request`          |

The endpoint object uses canonical route strings as keys, not JavaScript method names. The deployment schema
closes the complete HostAdapter route vocabulary, so a real App may add only the model, artifact, media,
preview, resource, localization, recovery, permission, or telemetry routes it actually implements and
advertises. The PHP reference responder intentionally implements only the seven contextual authoring routes;
other configured URLs terminate in the App's corresponding authoritative services. Missing optional keys are
disabled capabilities, not inferred URL conventions.

A framework that prefers one dispatcher uses
`AuthoringEndpointConfiguration::singleEndpoint()`. Studio sends the unchanged canonical body
and adds `X-Studio-Operation: authoring/<operation>`; it never inserts an ad hoc action member into the JSON.
`AuthoringResponder` accepts both forms, so changing routing configuration does not change an application
service or persisted format.

## Session-cookie, CSRF, and optional token examples

For the normal same-origin PHP application, keep the established session ID in a `Secure`, `HttpOnly`,
appropriately `SameSite` cookie. Only the current CSRF token appears in deployment JSON. The browser sends
`credentials: same-origin` and the configured header on every attempt. The reference verifier resolves the
exact Origin and Fetch Metadata are rejected before any session or CSRF callback runs. Only then does the
reference verifier resolve the server-side session and current CSRF value. Production requires an HTTPS
origin and any explicit non-`same-origin` Fetch Metadata value fails closed:

```php
use Kumwe\Studio\PhpAuthoringHost\SameOriginSessionCsrfVerifier;

$transportSecurityVerifier = new SameOriginSessionCsrfVerifier(
    authenticateSession: fn ($input) => $sessions->authenticatedPrincipalFromCurrentRequest(),
    csrfTokenForSession: fn ($principal, $input) => $sessions->currentCsrfToken($principal),
    allowedOrigin: 'https://admin.example.test',
    csrfHeaderName: 'X-CSRF-Token',
);
```

Local development may opt in to an exact `http://localhost`, `http://127.0.0.1`, or `http://[::1]` origin
(with an optional port) using `allowHttpLoopbackForDevelopment: true`. The flag defaults to `false`, never
permits a non-loopback HTTP origin, and is not a production TLS exception. Absence of `Sec-Fetch-Site` remains
tolerated for older user agents; any supplied value other than `same-origin` is rejected.

The callbacks represent the framework/session layer; they are not business authorization. After transport
admission, every application service still resolves the non-secret resource-context key and independently
authorizes the authenticated principal for the exact read or mutation.

When ambient cookies are inappropriate, use a short-lived, purpose- and audience-bound credential. It is
DOM-visible, so it must expire quickly and must never be a reusable API key, password, refresh token, or signed
permission snapshot. The bearer deployment shape is:

```php
'authentication' => (object) [
    'kind' => 'bearer-token',
    'credentials' => 'omit',
    'token' => '<short-lived-studio-token>',
    'issuedAt' => '<token-issuance-rfc3339>',
    'expiresAt' => '<short-lived-token-expiry>',
],
```

Bind the server side with `ShortLivedTokenVerifier::bearer($authenticateToken)`. A custom header uses
`kind: header-token`, `credentials: omit`, `headerName`, `token`, `issuedAt`, and `expiresAt`, paired with
`ShortLivedTokenVerifier::header($authenticateToken, 'X-Studio-Session')`. The callback must validate expiry,
issuance, a maximum 15-minute protected lifetime, signature or sufficient random entropy, audience, purpose,
runtime/session generation, revocation, and resource scope before returning a trusted principal. The emitter
requires exact `issuedAt <= now < expiresAt` with positive duration no greater than 15 minutes, and Studio
rechecks it before every request. Deployment timestamps are not server proof.

Configurable CSRF and custom-token header names are capped at 100 ASCII token characters and reject
`Authorization`, `Cookie`, `Origin`, `X-Studio-Operation`, hop-by-hop/browser-owned names, and the
`Access-Control-`, `Proxy-`, `Sec-`, and `X-Forwarded-` prefixes. Bearer authentication is the only profile
that owns `Authorization`.

## Transaction, idempotency, and concurrency rules

`start` and all three saves require `context.idempotencyKey`. Read operations forbid it. The responder proves
presence/absence and passes the validated key through `AuthoringCallContext`; the application service must
bind it to authenticated actor, resource context, operation, runtime/session generation, and a canonical
intent digest. The accepted value, audit record, and outbox entries must commit in the same transaction as the
durable effect. An exact retry returns the original normalized value; changed intent conflicts; failed
attempts do not poison the key. A generic HTTP cache or separate middleware write cannot provide that
guarantee.

All seven contextual operations forbid the envelope's single `expectedRevision`. The plan and save payloads
carry the complete reusable-type, Model, Blueprint, Entry, generation, and intent coordinates. `planSave`
binds those coordinates and visible consequences to a short-lived plan reference. Each save application
service rechecks the plan, coordinates, policy, generation, digest, accepted consequences, and idempotency key
inside one transaction. A mismatch maps to a safe `conflict`; no partial type/Blueprint/Model/Entry write is
allowed.

Outbound webhooks are not browser authoring routes. Persist an outbox record with the accepted transaction,
then deliver asynchronously with host-owned signing, retry, deduplication, tenancy, and disclosure policy.

## Security and response behavior

The responder enforces a closed route table, exact `POST`, one JSON content type, a configurable byte limit,
a bounded JSON depth, authentication and request integrity before parsing, duplicate-free member names, exact
request schema validation, operation/capability equality, the negotiated protocol, contextual key equality,
and exact result validation. Every response is JSON with `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`. Unknown exceptions, schema-validator failures, invalid host results, and
JSON-encoding failures return a fixed safe `internal` error without exception text, request bodies,
credentials, resource identifiers, or filesystem details.

The host/web server remains responsible for TLS, secure/HTTP-only/SameSite cookies, proxy trust, duplicate
header rejection, CORS allowlists without wildcard credentials, rate/deadline controls, request logging
redaction, session rotation/revocation, and process-level memory limits. Resource keys, idempotency keys,
revisions, credentials, CSRF values, and authored data never belong in URLs or access logs.

## Run the dependency-free checks

From the repository root, the canonical PHP reference command verifies PHP 8.1+, lints both reference-host
and browser-host PHP sources, and runs this example's dependency-free unit suite:

```bash
npm run check:php-reference
```

No Composer packages are required. To run only this component while working in this directory:

```bash
php tests/run.php
```

or:

```bash
composer test
```

The checks exercise all seven dispatches, mapped and single-endpoint round trips, XSS-safe multi-mount
configuration emission, cookie/CSRF and token admission, schema-reference selection, security-before-parse,
duplicate-member rejection, route and content guards, idempotency and outer-revision rules, resource-context
equality, protocol refusal, bounded result/error mapping, and non-leaking failures. They are reference-boundary
tests, not a substitute for replaying the canonical corpus against the real host application and production
data boundaries.
