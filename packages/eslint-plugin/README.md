# @comity-dev/eslint-plugin

## Purpose

Reusable ESLint rules for Comity-wide source-code policy. This package owns the source-code lint policy that every Comity repository MUST apply consistently.

## Scope

Six rules, each addressing a Comity-wide concern:

| Rule                          | Concern                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-forbidden-deep-import`    | Disallow deep imports into another package's internals (`@comity/x/src/foo`, `@comity/x/internal/*`, `@comity/x/dist/*`, `@comity/x/lazy/*`). |
| `no-layer-violation`          | Forbid imports that violate Comity's canonical layering model.                                                                                |
| `no-date-in-core`             | Forbid `Date` in Core Modules (domain must be deterministic).                                                                                 |
| `no-crypto-in-core`           | Forbid `crypto` in Core Modules (domain must be deterministic).                                                                               |
| `no-forbidden-subpath-import` | Disallow imports from forbidden package subpaths (`utils`, `helpers`, `shared`, `internal`, `lazy`).                                          |
| `no-render-core-http-runtime` | Forbid render Core Modules from depending on HTTP runtime.                                                                                    |

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
