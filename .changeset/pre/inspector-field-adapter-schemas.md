---
'@kumwe/studio-protocol': minor
'@kumwe/studio-testkit': minor
---

The last two declaration kinds a host freezes against gain canonical payload schemas.
`inspector.schema.json` declares the block types a contributed panel applies to and whether it augments
or replaces the built-in inspector for them; `field-adapter.schema.json` declares the control
identifier a field's authoring metadata names, the field kinds it accepts, and the bounded option
schema an author configures it through. Both declare the capability their executable half requires, so
a declaration without one is inspectable but never executed. Every contribution kind a downstream Gate
A freeze names is now validated against a published schema rather than a paraphrase.
