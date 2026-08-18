---
'@kumwe/studio-protocol': minor
'@kumwe/studio-core': minor
'@kumwe/studio-testkit': minor
---

The declaration surface a host freezes against is now complete and portable. The plugin manifest
accepts `design-vocabulary` and `migration` contribution kinds, each backed by a canonical schema
(`design-vocabulary.schema.json`, `migration.schema.json`) with wire types, examples, and negative
fixtures, so a host validates every composition declaration kind against a published schema instead
of a paraphrase. The command-vector schema carries an optional session `mode` with the
`mode-forbidden` expectation, and a mode-boundary corpus replays the editing-mode permission matrix
and the hybrid composition bounds through the session. The Blueprint authoring policy gains the
per-slot composition marker: a named slot may be declared composable on its own, bounded by
slot-level allowed blocks, and the hybrid gate enforces it.
