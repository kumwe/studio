# Standalone static-delivery proof

This independent example proves the static-asset and zero-production-Node portion of `STUDIO-PROD-011`. The
contributor build bundles Studio into fingerprinted browser assets and pre-renders one public page. The
resulting directory contains no package manager, development server, server-side JavaScript process, or runtime
dependency manifest.

Build the deployable directory from the repository root:

```bash
npm run build:static-host
```

The command creates `examples/standalone-static-host/dist/` with:

- `index.html` and fingerprinted `assets/studio-*.js`/CSS for contextual browser authoring;
- `public.html` and `public.css`, rendered before deployment and usable with JavaScript disabled;
- `build-manifest.json`, the contributor-side bundler mapping; and
- `studio-assets.json`, which records every deployed file's bytes, SHA-256 digest, media type, role, release
  family, entry point, and empty production-runtime requirement list.

Copy the contents of `dist/` to any ordinary static document root, CDN origin, object store, or framework's
public-assets directory, including a nested URL path: every generated browser reference is relative. The
production host does not run an install, build, start, or preview command. It serves the already-built files
and implements authoritative load/save operations using its own documented host API boundary.

`serve.py` is a validation-only Python standard-library server, not a deployment dependency or recommended
production web server. The focused test launches it with a restricted executable path and requires Node.js,
npm, npx, and Vite to be unavailable:

```bash
npm run test:static-host
```

This proves static delivery, asset integrity, browser entry-point portability, and renderer independence. Its
authoring page directly composes a contextual custom element; it does not prove the canonical ordinary-element
`mountStudio()`/configuration path, isolated multiple mounts, authentication, persistence, publication, a PHP
implementation, the complete `authoring-web` profile, or the full `STUDIO-PROD-015` host journey.
