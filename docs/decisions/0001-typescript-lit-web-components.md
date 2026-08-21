# ADR 0001: Strict TypeScript and Lit Web Components

- Status: proposed
- Scope: browser authoring packages

## Context

Studio needs a rich browser authoring surface while remaining embeddable outside one application framework. Kumwe App already uses TypeScript, Vite and Lit. React-specific foundations would add a second application runtime and constrain reuse.

## Decision

Implement the browser runtime in strict TypeScript. Build public UI primitives as Lit-based Web Components. Keep the state/command core DOM-free. Publish ESM and type declarations through explicit package exports.

Use mature focused dependencies for solved concerns such as rich-text editing, immutable patches or drag mechanics, but keep them behind Studio-owned contracts. A dependency cannot become the persisted artifact format by accident.

## Consequences

Web standards improve embedding and allow non-Lit hosts to consume elements. The team owns accessibility and integration quality of custom elements. Framework-specific wrappers may be published separately but are not core dependencies.

Node.js is a build/test/release tool, not a required Kumwe App production runtime.
