# `@kumwe/studio-rich-text`

Status: pre-Gate-A foundation alpha. Its profile and extension surface remain subject to contract review.

A bounded Tiptap/ProseMirror adapter for rich-text leaf fields. It supplies a deliberate extension
set and validates portable JSON documents; it is not a second page-layout model.

Hosts remain responsible for sanitation at trust boundaries and for rendering the stored JSON with
their own server-side presenter.
