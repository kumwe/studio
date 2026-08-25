# ADR 0029: Govern advanced page controls behind Studio-owned seams

- **Status:** Proposed
- **Date:** 2026-08-25

## Context

A production page builder needs rich prose, source, equations, diagrams,
charts, drawings, media collections, exact money, and scoped styling. Directly
embedding each third-party editor or renderer contract into block definitions
would couple hosts to browser libraries, persist unsafe configuration, and make
other Studio integrations incompatible.

## Decision

Studio owns a closed authoring-control registry identified by qualified control
names. Controls receive canonical Studio values and return canonical Studio
values. Browser libraries are replaceable implementation details behind narrow
injected adapters. Named profiles choose bounded behavior and unknown profiles
fail closed.

Source is persisted as plain text; code, LaTeX, and Mermaid modes come from the
port profile. Charts, drawings, money, rich text, and media use their canonical
protocol documents or references. Active previews are trusted, lazy, abortable,
and never authoritative. Authored JavaScript, Editor.js output, Chart.js
configuration, Mermaid configuration, SVG source, asset bytes, delivery URLs,
and arbitrary CSS are not canonical values.

The scoped-style source control is intentionally a trusted host renderer input.
It compiles to the renderer's structured, node-bounded stylesheet and is not a
portable Blueprint property. Persisted presentation uses the bounded semantic
design language instead.

All controls enforce static-binding mutability, preserve the last valid value,
and expose labelled keyboard-operable controls. Media custody remains with host
ports; Studio owns the selection and upload experience. Drawing uses a native
SVG view with equivalent pointer and explicit coordinate/keyboard paths, while
table authoring uses a native text-only table. Both emit detached canonical
values through the same change seam, leaving undo/redo to Studio commands.

## Consequences

- Standalone Studio and embedded hosts mount the same controls through one API.
- Hosts do not import Editor.js or advanced renderer/editor types.
- Optional editors and previews can be replaced without artifact migrations.
- New profiles or canonical value shapes require contract and conformance work;
  a host cannot widen a control with arbitrary library options.

## Rejected alternatives

- Persisting editor output or library configuration was rejected because it is
  neither portable nor a stable public contract.
- Allowing raw authored JavaScript or unbounded CSS was rejected because it
  crosses the page's execution and isolation boundary.
- Requiring every host to invent controls was rejected because it would make
  Studio a schema toolkit rather than a complete portable page builder.
