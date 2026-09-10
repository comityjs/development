# @comity-dev/dependency-rules

## Purpose

Canonical dependency-cruiser rule generator for Comity layering. This package produces the JSON configuration consumed by the validator; it does **not** invoke dependency-cruiser itself.

## Scope

- Builds a deterministic `dependency-cruiser` config from repository-supplied facts (a `Map<packageName, layer>`).
- Encodes the canonical layering model:
  - `primitives` MUST NOT depend on any internal package.
  - `kernel` MAY only depend on `primitives`.
  - `composition` MAY only depend on `kernel` and `primitives`.
  - `core` MAY depend on `primitives`, `kernel`, and other `core` modules (gated by ADR-008).
  - Adapters: cross-adapter edges forbidden except Integration Adapter → Technology Adapter (ADR-007).
  - Primitives/Kernel/Composition MUST NOT depend on Core.

## Ownership

Owned by `comity-development`. Consumed by `@comity-dev/validate` which actually invokes dependency-cruiser.

## Public API

```ts
import {
  buildDependencyRules,
  buildDependencyRulesForRoot,
  classifyByLayer,
  layerSetsFromPackages,
  LAYER_PROFILES,
  DEFAULT_REPOSITORY_FACTS,
} from "@comity-dev/dependency-rules";
```

A dedicated subpath exposes the rule builder:

```ts
import { buildDependencyRules } from "@comity-dev/dependency-rules/build-config";
```

## Relationship to Comity Standards

- `layering-policy.md` §2 — canonical layering model.
- `ADR-007` — adapter categories.
- `ADR-008` — Core-to-Core explicit exception register.
- `architecture-validation.md` §7 — dependency validation.

## Development

```bash
pnpm build
pnpm test
```
