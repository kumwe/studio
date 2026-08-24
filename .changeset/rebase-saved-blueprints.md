---
'@kumwe/studio-core': patch
'@kumwe/studio': patch
---

Rebase every Blueprint history snapshot onto a host-accepted save revision without advancing local
state. The Lit shell now accepts the saved snapshot's optional state version, preserves its existing
history and selection, and reschedules preview staging with the exact rebased revision and digest while
newer edits remain dirty.
