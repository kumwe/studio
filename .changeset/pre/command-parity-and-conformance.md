---
'@kumwe/studio-protocol': minor
'@kumwe/studio-core': minor
'@kumwe/studio-preview': minor
'@kumwe/studio-rich-text': minor
'@kumwe/studio': minor
'@kumwe/studio-testkit': minor
---

Resolve the last open Gate A command-vocabulary items and extend the executable contract surface:
promote `restore-node` to a first-class batchable command with full-subtree duplicate validation
(now also enforced for `insert-node`), add the top-level `reset-inherited-property` command whose
inverse is a sorted batch of viewport-scoped `set-property` operations, add the preview marker
geometry and measurement channel with digest-bound stale handling, publish the rich-text renderer
conformance projection corpus through the testkit, make the inspector a keyboard-complete editor
with conflict-survival announcements, and enforce changesets plus an automated accessibility lane
in the delivery controls.
