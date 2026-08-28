---
'@kumwe/studio-protocol': minor
'@kumwe/studio-core': minor
'@kumwe/studio': minor
'@kumwe/studio-testkit': minor
---

Publish the exact contextual authoring HTTP/AJAX contract, a DOM- and Node-free HostAdapter client, a drop-in
compiled-browser binding, a fail-closed reference responder, and a language-neutral PHP-replayable transport
matrix. Authentication and CSRF stay in trusted transport metadata; contextual resources, coordinated
revisions, idempotency, results, and errors now have operation-specific schemas and conformance coverage.
The PHP browser reference now requires the exact `same-origin` / `cors` / `empty` Fetch Metadata tuple.

**BREAKING host integration change:** `host-error.schema.json` now permits `revision` only on a `conflict`,
and permits `retryAfterMilliseconds` only on a `rate-limited` or `unavailable` error whose `retryable` member
is `true`. Earlier schema digests accepted other combinations. A host that pins schema or corpus digests must
audit every error producer, update those bodies, and re-pin the schema and corpus manifest atomically; a new
configured HTTP client treats a formerly accepted combination as a malformed safe `internal` failure.
