# Dependency and license evidence

## Scope

Studio-authored source is licensed under MIT. Third-party packages retain their own licenses. The lockfile is
the inventory authority for the exact dependency graph installed by a candidate; package manifests declare the
direct production edges, and generated per-package notice bundles record the reachable production closure.

The generated files are evidence, not legal conclusions. A release reviewer still checks whether the proposed
distribution, deployment and downstream combination is permitted. Updating a dependency invalidates the prior
inventory and requires regeneration and review.

## Browser editor boundary

`@editorjs/editorjs` 2.31.6 is the selected browser editing implementation and is published under Apache-2.0.
It is hidden behind Studio's rich-text editor factory and canonical codecs:

- Studio artifacts contain only Studio schema values;
- hosts do not configure or consume Editor.js tools or output data;
- Editor.js data is translated and validated before it crosses a Studio boundary;
- host renderers never execute or render Editor.js output directly; and
- removing or replacing Editor.js does not change the public artifact grammar.

This boundary limits implementation lock-in. It does not by itself decide license compatibility for every host
distribution.

## Kumwe App decision still required

Kumwe App currently declares `GPL-2.0-only`. Studio makes no compatibility claim for a Kumwe App distribution
that embeds or redistributes an Apache-2.0 Editor.js-bearing frontend. Before promotion, the project owner must
record a qualified rights/licensing decision and its exact distribution model. Possible designs can be assessed,
including a separately distributed Studio application, an approved license change or exception by all required
rights holders, or a different implementation dependency; listing an option here does not approve it.

Until that decision is recorded, the Studio candidate may be built and tested independently, but the affected
Kumwe App release claim remains blocked. No repository automation may silently relicense either project.

## Deterministic package evidence

Every publishable package includes:

- the repository MIT `LICENSE` for Studio-authored code;
- `THIRD_PARTY_NOTICES.md`, generated from the production dependency closure in `package-lock.json`; and
- the license text of each reachable third-party package under `third-party-licenses/`.

The package gate rejects missing, stale, ambiguously licensed or unpinned production dependencies. CI also emits
an SBOM and audits production dependencies. These controls complement one another: the SBOM is machine-readable
inventory, the package notice bundle travels with the tarball, and review records the distribution decision.

The generator never downloads license material. It reads the exact installed package represented by the
lockfile. A reviewed identity-, declared-license- and digest-pinned copy under
`evidence/third-party-licenses/` may supply immutable upstream evidence, including when a publisher omits its
license file from the npm archive; the notice names the exact upstream source. Curated evidence takes precedence
so a repackaged archive cannot silently change the license bundle. This makes `npm ci` followed by regeneration
reproducible and causes unavailable or changed license evidence to fail closed.
