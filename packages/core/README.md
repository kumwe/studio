# `@kumwe/studio-core`

Status: pre-Gate-A foundation alpha. The implemented kernel does not claim production completeness.

The framework-neutral state engine for Studio. It registers versioned blocks, validates blueprint
documents, applies typed commands without mutating caller-owned data, and maintains bounded
undo/redo history.

The package has no DOM dependency. Web Components, Flutter clients, command-line tools, and server
adapters can therefore share the same command and validation semantics through the protocol.
