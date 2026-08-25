# `@kumwe/studio-rich-text`

Status: pre-Gate-A foundation alpha. Its profile and extension surface remain subject to contract review.

A bounded editor adapter for structured-content leaf fields. It supplies a deliberate Studio tool profile and
validates portable JSON documents; it is not a second page-layout model. The browser implementation is private
to this package: consumers exchange canonical Studio values and do not configure, store, render, or migrate an
editor vendor's document format.

Hosts remain responsible for sanitation at trust boundaries and for rendering the stored JSON with
their own server-side presenter.
