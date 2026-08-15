# `@kumwe/studio`

Status: pre-Gate-A foundation alpha. The shell demonstrates contract integration and is not a finished UX.

The Lit Web Component authoring shell for Studio. It renders a block palette, structural canvas,
selection inspector, and command history. Persistence, rendering, media, and permissions remain the
embedding host's responsibility; this alpha does not yet implement the canonical host-adapter API.

Importing the package has no registration side effect. Call `defineKumweStudio()` once, then use the
`<kumwe-studio>` custom element or register the class under a host-specific tag.
