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

All calls use `POST {baseUrl}/ports/{route}`, `Accept: application/json`, and
`Content-Type: application/json`. Authentication and request-integrity material stays in secure cookies or
headers and never enters the JSON body.

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

Configure Studio's compiled browser adapter with the matching base URL (`/studio` above). Production serves
the already-built browser files and these PHP routes; it does not run npm, Vite, or a JavaScript server.

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
a bounded JSON depth, authentication and request integrity before parsing, exact request schema validation,
operation/capability equality, the negotiated protocol, contextual key equality, and exact result validation.
Every response is JSON with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Unknown exceptions,
schema-validator failures, invalid host results, and JSON-encoding failures return a fixed safe `internal`
error without exception text, request bodies, credentials, resource identifiers, or filesystem details.

The host/web server remains responsible for TLS, secure/HTTP-only/SameSite cookies, proxy trust, duplicate
header rejection, CORS allowlists without wildcard credentials, rate/deadline controls, request logging
redaction, session rotation/revocation, and process-level memory limits. Resource keys, idempotency keys,
revisions, credentials, CSRF values, and authored data never belong in URLs or access logs.

## Run the dependency-free checks

No Composer packages are required. With PHP available:

```bash
php tests/run.php
```

or:

```bash
composer test
```

The checks exercise all seven dispatches, schema-reference selection, security-before-parse, route and content
guards, idempotency and outer-revision rules, resource-context equality, protocol refusal, safe result/error
mapping, and non-leaking failures. They are reference-boundary tests, not a substitute for replaying the
canonical corpus against the real host application and production data boundaries.
