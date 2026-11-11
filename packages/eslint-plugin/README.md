# @comity-dev/eslint-plugin

## Purpose

Reusable ESLint rules for Comity-wide source-code policy. This package owns the source-code lint policy that every Comity repository MUST apply consistently.

## Scope

Seven rules, each addressing a Comity-wide concern:

| Rule                          | Concern                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-forbidden-deep-import`    | Disallow deep imports into another package's internals (`@comity/x/src/foo`, `@comity/x/internal/*`, `@comity/x/dist/*`, `@comity/x/lazy/*`). |
| `no-layer-violation`          | Forbid imports that violate Comity's canonical layering model.                                                                                |
| `no-date-in-core`             | Forbid `Date` in Core Modules (domain must be deterministic).                                                                                 |
| `no-crypto-in-core`           | Forbid `crypto` in Core Modules (domain must be deterministic).                                                                               |
| `no-forbidden-subpath-import` | Disallow imports from forbidden package subpaths (`utils`, `helpers`, `shared`, `internal`, `lazy`).                                          |
| `no-render-core-http-runtime` | Forbid render Core Modules from depending on HTTP runtime.                                                                                    |
| `require-internal-marker`     | Require an `@internal` JSDoc tag on production sources under `src/internal/` and `src/lazy/` (owner-approved Contract B).                     |

### `no-layer-violation` options

`sourceName` and `classification` are required. For Technology Adapters the consumer also supplies
`implements` (the Core Module the adapter implements) and, optionally, `consumes` (a map from
package name to the additional **Core Module** contracts the adapter consumes, `adapters.md` §13).
Only targets classified `core` are admitted through `implements` or `consumes`; an adapter, an
Integration Adapter or any other layer is never admitted, and no option exempts a layer. A
consumer derives `consumes` from the adapter's own manifest declarations; without it the rule
admits only the implemented Core Module. The optional `development` option (package name → the
Comity packages it declares as `devDependencies`) lets **test sources** of a Technology Adapter
(`__tests__`, `*.test.*`, `*.spec.*`) import those packages, for example a sibling SQL binding used
as an integration-test fixture; such imports never enter the published dependency graph, and
production sources never benefit from it.

### `no-date-in-core` and `no-crypto-in-core` options

Both rules scope by the package's **declared layer**, never by the `@comity/*` name prefix (a
Technology Adapter such as `@comity/sql-kysely` is a `@comity/*` package that legitimately touches
clocks, randomness and cryptography). They accept the same `sourceName` and `classification` as
`no-layer-violation`:

- `classification` supplied: the layer is `classification[sourceName]`. The rules apply to
  `primitives`, `kernel`, `composition` and `core`, and not to `technology-adapter`,
  `integration-adapter` or any other layer.
- Missing or invalid metadata (no `sourceName`, a source package absent from `classification`, a
  non-string layer, an empty classification) means the layer is unknown and the rule does not apply,
  as for `no-layer-violation`.
- `classification` not supplied: the rule falls back to its filename heuristic, as it always did
  without `sourceName`. `sourceName` alone no longer classifies a package.

## Ownership

Owned by `comity-development`. Consumed by Comity repositories (Community, Enterprise) via ESLint flat config.

## Public API

```ts
// Default export: the ESLint plugin (loaded into flat-config)
import comityPlugin from "@comity-dev/eslint-plugin";

// Root exports: stable identifier list and the recommended rule set
import { recommended, RULE_IDS } from "@comity-dev/eslint-plugin";
```

## Relationship to Comity Standards

- `architecture-validation.md` §4 — source-code lint policy.
- `public-api.md` §3.2 — forbidden subpath imports.
- `layering-policy.md` §8 — rendering core MUST NOT depend on HTTP runtime.
- `coding.md` — general style policy.

## Development

```bash
pnpm build
pnpm test
```
