# Version 2 joint plan: Studio and Kumwe App

**Purpose.** One sequence across two repositories, so neither side builds against something the other
has not shipped. This document is the coordination contract; each repository's own plan holds its
detail.

|                    |                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio steps       | [`docs/roadmap/version-two-completion.md`](../roadmap/version-two-completion.md)                                                                  |
| Kumwe App steps    | [`kumwe/app` → `docs/roadmap/studio-completion.md`](https://github.com/kumwe/app/blob/master/docs/roadmap/studio-completion.md)                   |
| Division of labour | Kumwe App [ADR 0007](https://github.com/kumwe/app/blob/master/docs/roadmap/decisions/0007-studio-visual-composition-integration.md), decision D16 |

**The objective in one sentence.** An authorized Kumwe App administrator composes a page by direct
manipulation from typed, theme-bounded blocks bound to this platform's own content types, previews it
authenticated, and publishes it — with the composition stored as canonical JSON carrying no markup,
style or code.

---

## The scope decision this plan is built on

**Version 2 is the web interface.** Studio integrates into the Kumwe App administrator and is qualified
there. **Dart and Flutter parity is Version 3 scope**, needed when the App runs in a client and pages
must be composed there.

This has a consequence neither roadmap currently reflects: Studio's Gate A criterion 9 and Gate B
criteria 2, 3, 4 and 9 require Dart today, so as written they block a Version 2 the product deliberately
scopes without it. Studio's `ST-0` amends that before other work starts. Until it does, every Studio
step below is nominally blocked behind a criterion the product has decided to defer.

---

## Why the order matters

Five of the App's six open packages consume Studio behaviour that does not exist yet. The largest
single fact in this plan:

> **Nothing in Studio currently calls a host.** The nine ports, twenty-four operations, capability
> negotiation, the error taxonomy and a reference testbed all exist — but no public API binds a
> configuration to a `HostAdapter`, and the shell consumes neither. Kumwe App can implement every port
> perfectly and nothing will connect.

That is Studio `ST-2`, and it gates `S-C`, `S-D` and `S-E` on the App side.

The second fact: **Studio renders no preview surface** — zero frames; the shell only announces reload
and teardown. That gates `S-F`.

The third: **the canvas is a list of label chips**, and no layout blocks exist. That gates `S-G`, because
an embedded surface declared today would be declared against a shape about to change.

---

## Dependency matrix

| App package                      | Needs from Studio                                         | Can start when   |
| -------------------------------- | --------------------------------------------------------- | ---------------- |
| `S-B` pin and replay corpus      | `ST-1` release coordinate                                 | `ST-1` published |
| content-type projection (`AP-2`) | nothing beyond shipped schemas                            | **now**          |
| `S-C` identity and policy        | `ST-2` host-session binding                               | `ST-2` published |
| `S-D` persistence                | `ST-2`                                                    | `ST-2` published |
| `S-E` media                      | `ST-2`                                                    | `ST-2` published |
| `S-F` preview endpoint           | `ST-4` preview surface                                    | `ST-4` published |
| `S-G` embedded surface           | `ST-4`, `ST-5` modes, `ST-6` layout blocks, `ST-7` canvas | `ST-7` published |
| qualification (phase 7)          | `ST-9` message catalogue, `ST-11` ratified contract       | all of the above |

| Studio step                   | Needs from Kumwe App                       | Can start when        |
| ----------------------------- | ------------------------------------------ | --------------------- |
| `ST-3` all contribution kinds | nothing — the App already declares them    | **now**               |
| `ST-8` content-type binding   | `AP-2` projection through the `model` port | `AP-2` published      |
| `ST-11` ratification          | a second reviewer (see below)              | a second human exists |

---

## Milestones

### Milestone 1 — Wired

_Studio_ `ST-0` scope amendment, `ST-1` release coordinate, `ST-2` host-session binding, `ST-3` all
contribution kinds. _App_ `AP-1` full pin and corpus replay, `AP-2` content-type projection, then `S-C`,
`S-D`, `S-E`.

**Done when** a Kumwe App session opens through the real adapter, loads an artifact, edits it, saves
with an expected revision, survives a conflict by returning the safe revision, and invalidates on a
permission change — proved by the host conformance profiles rather than by hand-written expectations.

### Milestone 2 — Visible

_Studio_ `ST-4` preview surface, `ST-5` session modes, `ST-6` layout blocks and responsive vocabulary,
`ST-7` visual canvas and direct manipulation, `ST-8` binding to host content types. _App_ `S-F`
authenticated preview endpoint.

**Done when** an author composes a nested, responsive page by dragging, sees it render live through the
App's own template and theme path, and binds a block to a real content-type field — with every one of
those operations also achievable by keyboard.

### Milestone 3 — Shippable

_Studio_ `ST-9` message catalogue, `ST-10` evidence-lane repair, `ST-11` ratification and the `beta`
channel. _App_ `S-G` embedded surface, then phase 7 qualification: `P7-E` composition journey, `P7-C`
preview and media security, `P7-F` a contributed composition block in the proof portfolio, `P7-G` the
pinned release in the signed manifest.

**Done when** Gate B criterion 12 closes and `V2-STU-002`–`V2-STU-007` leave the App's ledger.

---

## The version pin protocol

1. Studio publishes a **release coordinate** naming all seven package versions, the wire version, the
   corpus digest and the claimed profiles (`ST-1`).
2. Kumwe App vendors that record with the corpus, pins every package exactly, and digest-verifies before
   any conformance run. A non-exact specifier fails its build.
3. A Studio fix reaches the App **only** as a deliberate re-pin: new versions, new digests, one changed
   pin record, in one change with its own evidence.
4. The App's signed release manifest records the exact coordinate the release qualified.

**A contract change while the App is mid-integration** is raised as a finding in both repositories
before it publishes. Studio does not weaken a portable contract to accommodate a host shape, and the App
does not paraphrase a canonical document to avoid a re-pin — that was the failure mode manifest 6 / SPI 4
was created to correct.

---

## What only a person can decide or do

1. **Gate acceptance needs a second human.** Studio's evidence model requires two reviewers, one
   independent of the work-package owners, and states an automated contributor is never a reviewer. The
   repository has one human author. No implementation removes this: without a second reviewer, Studio's
   Gate A cannot be accepted, and the App's Gate B criterion 12 rests on an unratified contract.
2. **Whether Version 2 ships against a ratified or a draft contract.** If Studio's Gate A cannot be
   accepted in time, the choice is to ship qualified against a pinned draft — honestly recorded — or to
   hold the release. Pinning exact versions makes the first option viable; it is still a decision.
3. **How much page-builder surface Version 2 needs.** `ST-6` and `ST-7` are the difference between an
   outline editor that works and a builder that feels like one. They are the largest remaining
   engineering effort on either side.

---

## Standing rules for both sides

- Studio owns the authoring experience and the protocol; Kumwe App owns the host adapter and every
  authoritative service behind it. An integration need that cannot be met through a public port is a
  finding against the boundary, raised in both repositories — never an inline workaround.
- Composition documents are artifacts the platform stores and versions; the platform never interprets or
  mutates their interior on a write path.
- No Kumwe App type, name or assumption enters a generic Studio package.
- Neither side claims a conformance profile without replaying the corpus at the pinned release.
