# Documentation map

This documentation separates normative requirements, architectural rationale, implementation guidance, programme state, and evidence. A future plan must never be read as an implemented guarantee.

| Area                                    | Purpose                                                 | Authority                   |
| --------------------------------------- | ------------------------------------------------------- | --------------------------- |
| [Contributing](../CONTRIBUTING.md)      | One setup, quality, change, and release path            | Working procedure           |
| [Product contract](product-contract.md) | Sole Studio product intent and acceptance requirements  | Normative product authority |
| [Project charter](project-charter.md)   | Mission, scope, principles, and success conditions      | Product-contract context    |
| [Glossary](glossary.md)                 | Stable vocabulary used across packages and integrations | Normative terminology       |
| [Architecture](architecture/README.md)  | System boundaries and responsibility model              | Normative where stated      |
| [Contracts](contracts/README.md)        | Observable portable behaviour                           | Normative                   |
| [Schemas](../schemas/README.md)         | Machine-readable artifact grammar and fixtures          | Normative                   |
| [Decisions](decisions/README.md)        | Accepted trade-offs and their consequences              | Architectural record        |
| [Experience](experience/README.md)      | Workspace wireframe, journeys, and interaction model    | Product specification       |
| [Roadmap](roadmap/README.md)            | Ordered six-month programme, Gates A and B              | Planned work                |
| [Status](roadmap/STATUS.md)             | Current gate and workstream state                       | Sole gate authority         |
| [Evidence](roadmap/evidence.md)         | Proof required to advance programme claims              | Normative gate policy       |
| [Integration](integration/README.md)    | Generic and Kumwe App-specific host responsibilities    | Implementer guidance        |
| [Portability](portability/README.md)    | Cross-language and Flutter strategy                     | Implementer guidance        |
| [Media](media/README.md)                | Media ownership and end-to-end experience               | Implementer guidance        |
| [Governance](governance/README.md)      | Compatibility, contribution, and release policy         | Project policy              |
| [Quality](quality/README.md)            | Qualification dimensions and test strategy              | Programme policy            |

Product behaviour begins with [`STUDIO-PROD-1.0-draft`](product-contract.md). Subordinate documents reference
its stable requirement IDs and must not create a second product track. Normative keywords have the meanings
defined in `contracts/normative-language.md`. If prose and a canonical schema conflict, the conflict is a
release blocker; neither silently overrides the other.
