# Security policy

Kumwe Studio is in its foundation phase and has no production-ready release. Security reports are nevertheless handled as first-class engineering work.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature for this repository. Do not disclose suspected vulnerabilities in public issues, discussions, pull requests, test fixtures, or chat logs.

Include, where possible:

- the affected package, version, contract, and host configuration;
- a minimal reproduction using non-sensitive data;
- the expected and observed trust boundary;
- impact and plausible attack path;
- suggested mitigation, if known.

Do not access data you do not own, degrade a service, persist access, or test against a third-party deployment without permission.

## Scope and authority

Studio is an authoring client and portable protocol. A conforming host remains authoritative for authentication, authorization, validation, persistence, audit, publication, media access, extension trust, and final rendering. Browser-side checks are not security controls.

Particularly sensitive surfaces include:

- hostile or oversized documents and schemas;
- rich-text and URL sanitization;
- preview origin and message authentication;
- plugin and extension lifecycle changes;
- media upload, transformation, and metadata;
- command replay, concurrency, and migration;
- prototype pollution and unsafe object traversal;
- dependency provenance and release integrity.

The normative requirements are in [the security contract](docs/contracts/security.md). Supported-version commitments will be added before the first stable release. Until then, reports should target the latest commit on `main` and identify the tested revision.

## Disclosure process

Maintainers will acknowledge a usable report, reproduce and classify it, prepare a coordinated fix, add regression evidence, and publish an advisory when appropriate. Timelines depend on severity and the affected host boundary; reporters will receive progress updates through the private report.
