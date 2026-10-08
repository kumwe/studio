---
'@kumwe/studio-protocol': minor
'@kumwe/studio-core': minor
'@kumwe/studio': minor
'@kumwe/studio-testkit': patch
---

Give a host-extended core layout family its own derived revision and let an authoring target supply the
family's options. `createCoreLayoutBlockDefinitions` now stamps `layout-<name>-h<16 hex>` derived from the
canonical bytes of the built family without its revision, and rejects more than 64 listed types (layout types
included), duplicates, and reserved `studio.*` types other than the layout family; the production catalog keeps
its published `layout-<name>-r1` bytes. The authoring-target schema gains the optional `coreLayout` member,
whose entries are layout types or names outside the reserved `studio.*` namespace (protocol models regenerated;
the testkit fixture and negative-fixture copies move with it). Hosted Studio replaces the four production layout
definitions with the target's family, requires every listed host type to be a resolved required block-definition
dependency of the target, and leaves exact lock matching unchanged. See ADR 0038.
