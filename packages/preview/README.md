# `@kumwe/studio-preview`

Status: pre-Gate-A foundation alpha. The channel is an executable contract spike, not a qualified adapter.

An exact-origin, typed request channel between Studio and a host-rendered preview surface. A host can
render Twig, Liquid, JSX, or another server template without teaching the canvas to reproduce its
markup. Wildcard target origins are rejected.

The channel handles correlation, timeouts, abort signals, protocol filtering, and disposal. The host
still owns authentication, authorization, CSP, sandboxing, and rendering.
