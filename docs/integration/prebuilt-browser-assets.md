# Prebuilt Studio browser assets

The prebuilt browser output is the host-neutral, self-contained Studio ESM distribution. It is compiled during the
governed build and contains no actor, session, target, endpoint, content, or persistence configuration. A PHP,
Java, Go, static, or other host serves these files unchanged; a hosted deployment supplies its own authoritative
HTTP endpoints through per-mount configuration. Node.js, npm, Vite, and server-side JavaScript are not
production dependencies.

Read `studio-assets.json` first. It identifies the ESM entry point, exact Studio release and corpus digest, every
distributed file's size and SHA-256 integrity, the empty production-runtime requirement list, and the exact
same-origin HTTP Content Security Policy template. Verify the manifest and asset bytes before activating a
generation. Serve fingerprinted assets immutably, use a controlled revalidation policy for HTML/manifests, and
deploy/rollback one complete directory atomically.

Copy `studio-assets.json.release` unchanged into every emitted deployment object. The browser module carries a
release identity compiled from the same coordinated release record and compares both `version` and
`corpusManifestDigest` before resolving a selector, constructing a runtime, or making a request. That check
catches stale cached JavaScript paired with newly emitted host configuration without fetching the manifest in
the browser. Configless standalone mounting emits no deployment object and performs no manifest fetch.

The package copy is available at `@kumwe/studio/dist/browser/`; npm consumers may import the self-contained
module through `@kumwe/studio/browser-bundle`. RC and stable GitHub releases attach a deterministic
`studio-browser-<version>.tar` plus its detached SHA-256 file for hosts that do not consume npm packages.
The package directory and release archive also contain the deployment guide and contract, the complete local
JSON Schema closure for browser deployment and authoring HTTP, and the framework-neutral PHP reference. Every
one of those files is covered by `studio-assets.json`; none adds a production process or package installation.

The module has no registration or mounting side effect. A normal standalone HTML deployment needs only an
ordinary opted-in target and an explicit call from the host's external module:

```html
<div data-kumwe-studio></div>
<script type="module" src="./start-studio.js"></script>
```

```js
// start-studio.js
import { autoMountStudio } from './assets/studio-browser-<fingerprint>.js';

const report = await autoMountStudio();
// Later: await report.handles[0]?.dispose();
```

`autoMountStudio()` is opt-in: importing the browser module never scans the document. Its report contains every
successful handle and a per-target failure record; one failed target never disposes or prevents its siblings.
Failure records retain safe target/configuration-element/instance correlation but never copy the deployment
document or authentication material.
An empty
`data-kumwe-studio` attribute opens that exact element with standalone defaults, so several anonymous targets
may share a class without needing generated IDs. A non-empty attribute value is an element ID, not a selector
or URL, and must identify exactly one `script[type="application/json"]`; that ID must be referenced by exactly
one opted-in target. Because the data attribute already
supplies the associated target, the required JSON `mount` selector must resolve to that same target and to no
other element. Every emitted object also requires `kind: "studio-deployment"` and the exact manifest-copied
`release`; `{}` and `{ "mount": "…" }` are invalid host emissions. Multiple target/configuration pairs create isolated runtimes; disposing one does not
affect another. Hosts that already hold a target, parsed object, or script element may call `mountStudio` or
`mountStudioFromConfigElement` directly. `mountStudio(target)` is the zero-configuration local form;
zero-configuration means no JSON document. Configuration-only and script-only forms require a complete object.

For hosted operation, PHP or another host emits one complete inert
`StudioDeploymentConfiguration` beside every mount. The reference PHP emitter is used from a server template
like this:

```php
<?= $deploymentEmitter->render('article-studio', 'article-studio-config', $deployment) ?>
```

`$deployment` carries required `kind`, `mount`, exact `studio-assets.json.release`, plus the complete `launch`, host-resolved `session`, and HTTP `transport` required by
[`studio-deployment.schema.json`](../../schemas/studio-deployment.schema.json). The
[PHP authoring-host reference](../../examples/php-authoring-host/README.md#emit-one-browser-deployment-configuration-per-mount)
shows its schema-validated construction and the emitted `div`/inert JSON-script pair. The same external start module mounts both
local and hosted targets; it contains no resource-specific route, token, or session value.

The strict JSON parser rejects duplicate object members before its native JSON parse; it does not evaluate
text, load a configuration `src`, or infer a route. Configuration is rejected above 2,097,152 UTF-8 bytes or JSON
depth 16. When server-rendering the raw-text JSON block, escape at least `<` as `\u003C` (and conventionally
`>`, `&`, U+2028, and U+2029); HTML entity encoding is not JSON encoding. Serve the external start module under
the same pinned CSP/SRI policy as the browser asset. After schema validation, the bootstrap rejects any
deployment whose release identity differs from the one compiled into the loaded module.

## Exact Content Security Policy

For an archive and authoring operations served by the same PHP origin, emit the
`studio-assets.json.contentSecurityPolicy.headerTemplate` value after replacing its single
`{{STYLE_NONCE}}` token with a fresh base64-style nonce containing at least 128 bits of entropy:

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; require-trusted-types-for 'script'; trusted-types lit-html; style-src 'self' 'nonce-{{STYLE_NONCE}}'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'none'; frame-src 'none'; manifest-src 'none'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'
```

The manifest also records the inert configuration rule in machine-checkable form:
`script[type="application/json"]` requires neither a nonce nor a hash. Do not add one and do not relax
`script-src`: the block is data read through `textContent`, never executed. The external host start module and
the fingerprinted Studio ESM are admitted by `script-src 'self'` and remain integrity-checked through the
manifest/SRI values. The response nonce belongs on any trusted host/renderer `<style>` element emitted into
that document; it is not a durable deployment value and MUST NOT be copied into Studio JSON.

`connect-src 'self'` is exact for the normal same-origin session/CSRF PHP profile. If the archive is intentionally
served from a different origin, append only that origin to `script-src`. If a bearer/custom-header deployment
uses permitted cross-origin operation URLs, append the distinct exact HTTPS origins from those URLs to
`connect-src`; retain the contract's exact CORS allowlist. Add exact host-owned media origins to `img-src` or
`media-src` only when the admitted session needs them. Never use a wildcard, a scheme-wide source,
`unsafe-eval`, `unsafe-inline`, or a nonce on the inert JSON block. Preview frames keep a separate response
policy and are not enabled by this archive profile.

An omitted transport creates a blank, in-memory standalone page builder with JSON project import/download and
save-intent download; it performs no endpoint or authentication request. A configured HTTP deployment is
resolved only through the canonical deployment transport and never falls back to that local profile after a
host refusal. See the [Studio browser deployment contract](../contracts/studio-deployment.md) for the complete
routing, authentication, capability, and round-trip shape.

## Advanced composition API

An application that already owns a live session may use the lower-level configured HTTP adapter,
`openContextualStudioSession`, registration helpers, and custom elements directly. That is an advanced
composition seam, not a second deployment recipe. It must preserve the same canonical deployment, routing,
authentication, lifecycle, and save semantics; new hosts should use `mountStudio()` or `autoMountStudio()` and
must not manually copy detached snapshots into element properties. Production adapters accept explicit routing
configuration only; conventional base-path expansion belongs exclusively to testkit fixtures.

Never place a session-cookie value, durable credential, webhook secret, database coordinate, or executable
host policy in the browser configuration. The configured authentication projection proves request integrity;
PHP or another host still authenticates and reauthorizes every operation and owns validation, transactions,
revisions, audit, workflow, public rendering, outbox/webhooks, media, preview, and recovery.

For direct browser loading, apply the `integrity` value from `studio-assets.json` to the entry `<script>` or
`modulepreload` and set `crossorigin="anonymous"`. Use the manifest-published CSP profile above rather than a
second locally invented policy.
