# Security and threat model

## Security objectives

Studio preserves confidentiality of host-authorized data, integrity of artifacts and commands, availability under bounded hostile input, and separation between authoring, preview, extension and public-delivery trust domains.

Studio is not an authentication, authorization, secret-storage, malware-scanning, or sandboxing authority. The host owns those controls and exposes only least-authority ports.

## Protected assets

- content, business values, translations and unpublished drafts;
- actor identity, permissions and session context;
- Blueprint, model, theme, plugin and dependency integrity;
- media binaries and metadata;
- trusted renderer and plugin execution;
- audit, revision and publication history;
- host availability and resource budgets.

## Threat actors

- an unauthorized or over-curious authenticated author;
- a malicious content value or imported artifact;
- a compromised or intentionally malicious plugin/theme package;
- a hostile preview document or cross-origin frame;
- a network attacker where transport is not correctly protected;
- a compromised dependency or package registry;
- accidental misuse by a privileged designer or operator.

## Principal threats and controls

| Threat                                    | Required controls                                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Stored or preview XSS                     | No document-authored code; contextual escaping; typed rich text; sanitization; strict CSP; isolated preview                   |
| Privilege escalation through UI/ports     | Capability plus permission checks; host authorization on every use case; no ambient container                                 |
| Data leakage through search/count/preview | Authorization inside host queries; field-level projection; privacy-safe diagnostics and telemetry                             |
| Prototype pollution/object confusion      | Schema validation; safe object creation; forbidden dangerous keys; no uncontrolled deep merge                                 |
| Resource exhaustion                       | Pre-decode byte limits; depth/count/size budgets; cancellation; rate limits; worker isolation where appropriate               |
| Malicious plugin                          | Provenance/integrity; explicit capabilities; atomic scoped registration; same-origin bundling; optional isolation; revocation |
| Preview channel spoofing                  | Exact origin/source/channel validation; unpredictable session IDs; sequence/digest checks; expiry                             |
| SSRF through media/embed                  | Host allowlists and hardened fetcher; no privileged browser fetch of author URLs                                              |
| Confused deputy                           | Resource-bound operations; opaque references; actor attached by trusted adapter; operation-specific authorization             |
| Stale-write corruption                    | Expected revisions, idempotency, conflict reporting, immutable accepted revisions                                             |
| Supply-chain substitution                 | Lockfiles, npm provenance, signatures/integrity, SBOM, reproducible builds, protected release workflow                        |
| Unsafe fallback                           | Explicit compatible fallback only; unknown behavior fails closed                                                              |

## Artifact safety

Artifacts MUST NOT contain executable JavaScript, template language, inline handlers, CSS declarations/selectors, SQL, arbitrary expressions, filesystem paths, credentials, access tokens, private URLs, or unbounded regular expressions. URLs are allowed only in schema-defined safe fields and validated against host policy.

Schemas use closed objects by default. Extension maps are namespaced, schema-registered and size-bounded. Parsing and validation happen before plugin dispatch. JSON duplicate member behavior must be deterministic and strict decoders SHOULD reject duplicates.

## Browser controls

- Production assets are bundled or integrity-pinned and served under a strict CSP without `unsafe-eval`.
- Trusted Types SHOULD be enforced where available; DOM injection uses reviewed sinks.
- Authentication material is not stored in artifact JSON, URLs, logs, plugin-visible state, or preview markers.
- Cross-window messages use explicit origins and source windows.
- Clipboard, drag/drop, file, link and paste inputs are treated as untrusted.
- External navigation is handed to the host and uses safe opener behavior.

### Content Security Policy baseline

Hosts MUST be able to embed the authoring shell under a policy at least as strict as the pinned
baseline below, which the reference host serves on every response and `e2e/specs/csp.spec.ts`
verifies verbatim (TH-013):

```
default-src 'none'; script-src 'self'; require-trusted-types-for 'script'; trusted-types lit-html; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'none'; worker-src 'none'; frame-src 'none'; manifest-src 'none'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'
```

The chrome runs without inline scripts, inline event handlers, inline styles, cross-origin
subresources, or string-to-code compilation under this baseline: core Blueprint and property
validation is interpreted (`packages/core/src/profile-validator.ts`), so no directive grants
`unsafe-eval`. Trusted Types is enforced with `lit-html` as the only allowed policy — the one Lit
creates to parse its static template strings; the shell registers no default policy and writes no
raw string to a governed sink.

## Plugin controls

Declarative plugins are preferred. Executable plugins cannot claim authority from their manifest and receive only a scoped SDK. Trust revocation invalidates affected sessions and generations. Extension diagnostics are core-owned so plugin code is unnecessary for inspection or removal.

A JavaScript realm is not a complete security sandbox. Hosts requiring execution of mutually untrusted third-party code must use a separately assessed process/frame isolation design or prohibit such code.

## Host controls

All mutations are authenticated, authorized, validated, concurrency-safe and audited. HTTP adapters use TLS, CSRF protection for cookie authentication, secure cookies, origin checks, request limits and safe error responses. Query authorization occurs before counts, pagination, joins, aggregation and projection.

StudioConfig resource-context keys and their scope/resource projections are non-secret routing context, never authentication or authorization evidence. They contain no credentials, grants, policy internals, or sensitive actor attributes. The trusted host resolves the key, binds it to the authenticated actor and session generation, and rejects altered, stale, unknown, or cross-session contexts before resource access.

## Media and rich text

Files are validated by content, scanned and processed by the host. Active formats receive dedicated policy. Rich-text JSON is rendered through allowlisted nodes/marks with contextual escaping; pasted HTML is sanitized or converted by a bounded importer and never retained as executable source.

Against SSRF through media or embeds, external source URLs MUST pass the canonical lexical URL policy in `@kumwe/studio-core` before any host fetch, as specified by the media contract's external-sources rules; DNS-rebinding defence and redirect re-validation remain hardened-fetcher obligations of the host.

## Privacy

Telemetry is optional, documented and data-minimized. It does not include field values, rich text, media contents, secrets, raw artifacts, private identifiers, search terms or unauthorized diagnostics by default. Correlation identifiers are scoped and rotated according to host policy.

## Security evidence

Gate A requires a reviewed data-flow model, capability matrix, schema limits, plugin trust policy, preview protocol and abuse-case suite specification. Gate B requires automated security tests, dependency and provenance evidence, CSP verification, fuzz/property testing for parsers and reducers, authorization tests, incident/revocation drills, and an independent security review plan.

Passing these controls is an engineering claim, not a claim of regulatory certification or invulnerability.
