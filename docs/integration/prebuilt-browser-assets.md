# Prebuilt Studio browser assets

The prebuilt browser output is the host-neutral, self-contained Studio ESM distribution. It is compiled during the
governed build and contains no actor, session, target, endpoint, content, or persistence configuration. A PHP,
Java, Go, static, or other host serves these files unchanged; a hosted deployment supplies its own authoritative
HTTP endpoints through per-mount configuration. Node.js, npm, Vite, and server-side JavaScript are not
production dependencies.

Read `studio-assets.json` first. It identifies the ESM entry point, exact Studio release and corpus digest, every
distributed file's size and SHA-256 integrity, and the empty production-runtime requirement list. Verify the
manifest and asset bytes before activating a generation. Serve fingerprinted assets immutably, use a controlled
revalidation policy for HTML/manifests, and deploy/rollback one complete directory atomically.

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
supplies the target, that JSON may omit `mount`; when present, its selector must resolve to the same target and
to no other element. Multiple target/configuration pairs create isolated runtimes; disposing one does not
affect another. Hosts that already hold a target, parsed object, or script element may call `mountStudio` or
`mountStudioFromConfigElement` directly. `mountStudio(target)` is the zero-configuration local form;
configuration-only and script-only forms require their own `mount` selector.

For hosted operation, PHP or another host emits one complete inert
`StudioDeploymentConfiguration` beside every mount. The reference PHP emitter is used from a server template
like this:

```php
<?= $deploymentEmitter->render('article-studio', 'article-studio-config', $deployment) ?>
```

`$deployment` carries the complete `launch`, host-resolved `session`, and HTTP `transport` required by
[`studio-deployment.schema.json`](../../schemas/studio-deployment.schema.json). The
[PHP authoring-host reference](../../examples/php-authoring-host/README.md#emit-one-browser-deployment-configuration-per-mount)
shows its schema-validated construction and the emitted `div`/inert JSON-script pair. The same external start module mounts both
local and hosted targets; it contains no resource-specific route, token, or session value.

The strict JSON parser rejects duplicate object members before its native JSON parse; it does not evaluate
text, load a configuration `src`, or infer a route. Configuration is rejected above 2,097,152 UTF-8 bytes or JSON
depth 16. When server-rendering the raw-text JSON block, escape at least `<` as `\u003C` (and conventionally
`>`, `&`, U+2028, and U+2029); HTML entity encoding is not JSON encoding. Serve the external start module under
the same pinned CSP/SRI policy as the browser asset.

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
`modulepreload` and set `crossorigin="anonymous"`. Restrict CSP to the exact same-origin modules and required
host/media endpoints; do not enable `unsafe-eval` or wildcard script/connect origins.
