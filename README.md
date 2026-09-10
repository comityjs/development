# comity-development

## What is this?

`comity-development` is the canonical governance repository for Comity-wide standards, architectural decisions, contributor conventions, and shared development infrastructure.

It owns the contracts that apply across **all** Comity repositories — Community, Enterprise, and any future repositories.

## Why does it exist?

Comity previously existed as a single monorepo (`comity-community`) that contained both runtime implementation and Comity-wide governance. As the project grows toward an Enterprise distribution, the governance layer must be independently owned so that:

- Community and Enterprise are **siblings**, neither owning the other
- Comity-wide standards have a single canonical owner
- Architectural decisions are made at the framework level, not the repository level
- Shared development tooling can evolve without coupling to runtime release cycles

## What it owns

| Concern                                                            | Status                                 |
| ------------------------------------------------------------------ | -------------------------------------- |
| Comity-wide standards (layering, contracts, coding, testing, etc.) | **Canonical owner** (future migration) |
| Comity-wide ADRs                                                   | **Canonical owner** (future migration) |
| Comity-wide contributor conventions                                | **Canonical owner**                    |
| Comity-wide AI/agent conventions                                   | **Canonical owner**                    |
| Shared development tooling (validators, CLI, scripts)              | **Future owner** (Phase 5+)            |
| Repository governance documentation                                | **Owner**                              |

## What it does NOT own

| Concern                                       | Owner                                    |
| --------------------------------------------- | ---------------------------------------- |
| Runtime package implementations (`@comity/*`) | `comity-community` / `comity-enterprise` |
| Community dependency graph                    | `comity-community`                       |
| Enterprise dependency graph                   | `comity-enterprise` (future)             |
| Community CI/release pipelines                | `comity-community`                       |
| Enterprise CI/release pipelines               | `comity-enterprise` (future)             |
| Community-specific documentation              | `comity-community`                       |
| Community migration/conformance state         | `comity-community`                       |

## Relationship to other repositories

```text
comity-development
        │
        ├── Comity-wide standards
        ├── Comity-wide architectural decisions
        ├── Comity-wide contributor / AI conventions
        └── Future shared development tooling
                 ▲
                 │
        ┌────────┴────────┐
        │                 │
comity-community   comity-enterprise
```

- **Community and Enterprise are siblings**. Neither owns the other.
- **`comity-development` owns the contracts** that both consume.
- **No dependency** exists between `comity-community` and `comity-enterprise`.
- **`@comity/*` remains the runtime package namespace** regardless of repository ownership.
- `comity-development` is **not a runtime layer** and does not publish runtime packages.

## Repository structure

```
comity-development/
├── README.md
├── AGENTS.md
├── CONTRIBUTING.md
├── docs/
│   ├── standards/
│   │   └── decisions/
│   ├── architecture/
│   └── ai/
└── .github/
    └── ...
```

This is a **governance/documentation repository**, not a runtime package repository. There are no `packages/`, `src/`, `cli/`, or runtime directories.

## Current state

This repository is the canonical governance source for Comity-wide standards,
architectural decisions, contributor conventions, and shared development tooling.

For the canonical repository ownership boundaries see
[`docs/architecture/repository-ownership.md`](docs/architecture/repository-ownership.md).

## License

MIT — see [LICENSE](./LICENSE).
