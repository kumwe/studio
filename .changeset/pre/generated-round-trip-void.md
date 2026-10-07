---
'@kumwe/studio-protocol': patch
---

Drop the no-op `void schemaFile;` statement from the generated `roundTripGeneratedProtocolModel` helper. The schema file argument only selects the model type, and the helper's behaviour is unchanged.
