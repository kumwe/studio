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

Schema validation is the first gate, not the last. The manifest must contain exactly one
`browser-module` asset and exactly one `enhancement-runtime` asset. After schema validation, consumers MUST
also reject duplicate asset paths and require `module.entryPoint` and `enhancementRuntime.entryPoint` to equal
the paths of their respective single role-bearing assets. Studio's archive builder applies those same semantic
checks before publication; Producer must apply them before admitting a deliberately re-pinned generation.

Copy `studio-assets.json.release` unchanged into every emitted deployment object. The browser module carries a
release identity compiled from the same coordinated release record and compares both `version` and
`corpusManifestDigest` before resolving a selector, constructing a runtime, or making a request. That check
catches stale cached JavaScript paired with newly emitted host configuration without fetching the manifest in
the browser. Configless standalone mounting emits no deployment object and performs no manifest fetch.

The package copy is available at `@kumwe/studio/dist/browser/`; npm consumers resolve its manifest through
`@kumwe/studio/browser-assets` or read `dist/browser/studio-assets.json` directly. There is deliberately no
fixed browser-module export: the manifest's content-hashed `module.entryPoint` is the only deployable authoring
module name. RC and stable GitHub releases attach a deterministic
`studio-browser-<version>-<archive-hash>.tar` plus its detached SHA-256 file for hosts that do not consume npm
packages.
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
import { autoMountStudio } from './assets/studio-browser-<fingerprint>.min.js';

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

## Two browser surfaces, two policies

The manifest governs two independent browser surfaces. They MUST NOT be treated as one bundle or one CSP
profile:

| Surface                    | Manifest selector                                                                                  | Loading model                                        | Policy source                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Contextual authoring       | `module.entryPoint`, bound to the one `assets[].role === "browser-module"` member                  | Host-controlled ES module; mounting is explicit      | `contentSecurityPolicy.headerTemplate`     |
| Published-page enhancement | `enhancementRuntime.entryPoint`, bound to the one `assets[].role === "enhancement-runtime"` member | Classic self-contained IIFE with `defer`; no imports | `enhancementRuntime.contentSecurityPolicy` |

The same manifest publishes `publicRenderer.style`, the exact server-rendered stylesheet materialization rule.
Its `outputSchema` names
`https://schemas.kumwe.org/studio/v1/studio-browser-assets.schema.json#/$defs/publicStyleAsset`, the normative
closed record a PHP host places in its immutable per-page delivery manifest.
Producer writes the renderer's canonical UTF-8 CSS bytes unchanged, derives the content-hashed `.min.css` name
and SRI with SHA-256, records the byte size, and refuses the 262,144-byte budget. The renderer-web corpus fixes
`htmlBytes`, `htmlSha256`, `cssBytes`, and `cssSha256` for every vector so PHP and TypeScript prove the same
canonical markup topology and stylesheet output. Its exact `publicStyleAsset` expectation additionally proves
that path, full content hash, SRI, bytes, budget, role, media type, and minification flag all bind those same
CSS bytes; validating the closed output shape alone is insufficient.

The authoring module may contact only configured host operations and needs the authoring policy below. The
published runtime never mounts Studio, reads an authoring configuration, contacts an endpoint, or creates a
Trusted Types policy. It enhances only renderer-emitted `data-studio-*` attributes. Loading one surface never
authorizes loading the other.

### Authoring surface CSP

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

### Published enhancement CSP and exact load

For the public enhancement runtime, preserve this exact manifest-recorded baseline:

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'
```

That value is `studio-assets.json.enhancementRuntime.contentSecurityPolicy`, not the authoring
`contentSecurityPolicy.headerTemplate`. It proves that the runtime itself needs no connection, inline script,
inline style, eval, or Trusted Types policy. A published response may append only the exact `style-src`,
`img-src`, `font-src`, or other content sources required by its server-rendered semantic page; those additions
must not weaken or replace the four runtime directives above. In particular, the public runtime does not
justify `unsafe-inline`, `unsafe-eval`, a wildcard source, `connect-src`, or `trusted-types lit-html`.

Select and verify the file entirely from the admitted manifest:

1. require exactly one `assets` member whose `role` is `enhancement-runtime`;
2. require its `path` to equal `enhancementRuntime.entryPoint`;
3. verify its recorded `bytes`, `budgetBytes`, `contentHash`, `integrity`, and `minified: true` against the
   immutable file before activation;
4. intersect the renderer result's `enhancements` with the manifest's closed `enhancementRuntime.enhancements`
   array; and
5. emit the following classic-script shape only when that intersection is non-empty.

```html
<script
  src="/immutable-studio/<manifest-selected enhancement-runtime path>"
  integrity="<matching assets member integrity>"
  crossorigin="anonymous"
  defer
></script>
```

Both placeholders MUST come from the same verified manifest member; a filename, digest, or integrity value
must never be reconstructed, guessed, or copied from another release. Do not add `type="module"`: the file's
manifest-fixed format is `iife`, and `defer` is its published loading contract. The runtime is safe to include
unconditionally, but the renderer's exact eight-family intersection is the sole contractual per-page need
signal and is the normal inclusion gate. An empty intersection requires omission. Producer computes that
signal from its conforming PHP renderer and returns it to the host; the host owns the final response and emits
this manifest-selected tag.

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
