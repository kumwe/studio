# Studio reference host

This deliberately small, standalone Vite host exercises the current Lit authoring shell,
deterministic command path, viewport and theme projections, and the origin-pinned canonical preview
channel against a real reference renderer. It needs no external service and stores no user data.
Its bounded in-memory preview store validates complete drafts with `validateBlueprint` before hashing,
storing, and resolving them; keys include artifact ID, revision, and digest. The renderer recomputes
identity, verifies its node map against canonical preorder, and cooperates with render cancellation.
The block palette includes Studio's canonical section, stack, grid, and columns family. Grid and columns
nodes store one semantic column count plus viewport overrides, and the bundled renderer demonstrates the
same nested composition reflowing one, two, and four columns without document-authored CSS or markup.

From the repository root:

```bash
npm ci
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. To smoke-test the generated bundle under
the pinned Content Security Policy, run `npm start` instead.

The harness proves that the packages compose into a runnable local product slice. It does not claim a
production host profile: authentication, authorization, durable persistence, audit, media custody,
publication, and operational recovery belong to a real host such as Kumwe App and remain outside this
browser-only example.
