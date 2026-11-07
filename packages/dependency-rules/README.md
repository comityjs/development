# @comity-dev/dependency-rules

## Purpose

Canonical dependency-cruiser rule generator for Comity layering. This package produces the JSON configuration consumed by the validator; it does **not** invoke dependency-cruiser itself.

## Scope

- Builds a deterministic `dependency-cruiser` config from repository-supplied facts (a `Map<packageName, layer>`).
- Encodes the canonical layering model:
  - `primitives` MUST NOT depend on any internal package.
  - `kernel` MAY only depend on `primitives`.
  - `composition` MAY only depend on `kernel` and `primitives`.
  - `core` MAY depend on `primitives`, `kernel`, `composition` (ADR-025) and other `core` modules. Core → Core edges are **not** restricted by the generated rules: the ADR-008 closed register is not enforced here.
  - Adapters: cross-adapter edges forbidden except Integration Adapter → Technology Adapter (ADR-007).
  - Primitives/Kernel/Composition MUST NOT depend on Core.

## How rules match code

dependency-cruiser matches `from.path` against each **module path** and `to.path` against each dependency's **resolved path**. It does not match package names, and its `prefix` option only affects report output. The generator therefore needs each package's directory:

```ts
buildDependencyRulesForRoot(classification, repoRoot, {
  packagePaths: { "@comity/kernel": "packages/kernel" }, // absolute or repo-relative
});
```

- `from` matches modules below the package directory (`^packages/kernel/`, with a trailing slash so `kernel-utils` is not matched) and never matches `dist/`, `coverage/` or `node_modules/`.
- `to` matches all three ways a workspace import can resolve: a path in the package directory, a path under `node_modules/<package name>/`, or the bare specifier when it cannot be resolved.
- `coverage/` is excluded from the cruise. `dist/` is kept, because workspace imports often resolve into it.
- Run dependency-cruiser with the repository root as its working directory so module paths are repository-relative.
- A package without an entry in `packagePaths` throws: a rule that cannot match anything is never emitted silently.
- `tsconfig.json` is passed to dependency-cruiser when present, so `paths` aliases resolve to source files.
- The generated configuration sets `tsPreCompilationDeps: true`, so type-only imports (`import type`, `import { type X }`, `export type … from`) are checked by the same rules as runtime imports. Without it dependency-cruiser omits them. Imports that TypeScript elides because they are unused are also seen.
- `packagePaths` is required by the type and at runtime. Core → `@comity/composition` is allowed (ADR-025); Core → Core edges are not restricted by these rules.
- Integration Adapter → Technology Adapter edges are allowed (ADR-007); every other adapter → adapter edge is forbidden. Imports within one package are never reported.

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
