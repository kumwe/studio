---
'@kumwe/studio-protocol': minor
'@kumwe/studio-testkit': minor
---

The media port gains its upload lifecycle. `authorize-upload`, `complete-upload`, `abort-upload`,
`upload-status` and `import-external` join `get` and `list`, so a host has operations to implement
where the contract previously described a lifecycle the wire could not express. Bytes never cross the
JSON port: `authorize-upload` applies host policy before any byte moves and returns a short-lived,
bounded grant naming an https destination the host controls, and the client transfers directly to it.
The host verifies what it received rather than trusting a declared media type, so an accepted asset may
still be processing or quarantined. Seven conformance vectors fix the authorization, completion,
abortion, status and external-import behaviour, including refusal of an oversized upload, a filename
carrying a path separator, and an external candidate resolving to a private address.
