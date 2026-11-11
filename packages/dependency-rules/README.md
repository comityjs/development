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
- **Installed packages.** `installedPackages` lists classified packages that live in `node_modules` rather than in the repository, so they have no directory. They are matched as import **targets** only, by specifier and by their resolved `node_modules/<name>/` location (including pnpm's `.pnpm/<name>@<version>/node_modules/<name>/`), and are never the source of a rule. A name in both `packagePaths` and `installedPackages` is a workspace package. A layer that exists only as installed packages emits no rule.
- **Fail closed.** The catch-all of each layer rule also matches the resolved path of any installed Comity package (`node_modules/@comity/…`, `node_modules/@comity-dev/…`), so an installed package that is not in the classification is forbidden, not silently allowed.
- **Package `exports`.** The configuration sets `enhancedResolveOptions` to `ENHANCED_RESOLVE_OPTIONS` (`exportsFields: ["exports"]`, `conditionNames: ["import", "require", "node", "default", "types"]`). dependency-cruiser ignores `exports` unless told otherwise, which leaves subpath imports unresolved.
- **`comity-package-must-be-classified` (adapter sources).** Adapters have no layer catch-all, so a Comity import of an unknown package would match no rule. This rule rejects, from every file of every workspace adapter (tests included), any `@comity/*` or `@comity-dev/*` import whose package is not *known*: a workspace package, or a classified installed one (`installedPackages`). Resolved paths (hoisted and pnpm) and unresolved specifiers are both matched, for the root and every subpath. Only the Comity scopes are matched: other third-party packages keep their existing behaviour. Known names are handled by the layer rules and `comity-import-must-resolve`; the two never report the same import.
- **`comity-import-must-resolve`.** A Comity import that cannot be resolved has no path to match. The layer rules already report an unresolved specifier of a package the layer may not import; this rule reports the rest (an unresolved import of a package the layer *may* import, and any unresolved Comity import of an adapter), so nothing passes only because it was not resolved. It never duplicates a layer-rule finding.
- `tsconfig.json` is passed to dependency-cruiser when present, so `paths` aliases resolve to source files.
- The generated configuration sets `tsPreCompilationDeps: true`, so type-only imports (`import type`, `import { type X }`, `export type … from`) are checked by the same rules as runtime imports. Without it dependency-cruiser omits them. Imports that TypeScript elides because they are unused are also seen.
- `packagePaths` is required by the type and at runtime. Core → `@comity/composition` is allowed (ADR-025); Core → Core edges are not restricted by these rules.
- Integration Adapter → Technology Adapter edges are allowed (ADR-007); every other adapter → adapter edge is forbidden. Imports within one package are never reported.
- **Test-only exception.** A **test source** of a Technology Adapter may import an **installed** sibling adapter that the importing package declares in its `devDependencies`. A test source is a file under a `__tests__` directory or named `*.test.*` / `*.spec.*` (the same patterns `@comity-dev/eslint-plugin`'s `no-layer-violation` uses). The exemption is dependency-cruiser's `npm-dev` dependency type, read from the importing package's own manifest, so a peer-only, runtime-only or undeclared dependency is still reported. Production sources are never exempt, workspace adapters are never exempt (a test importing a workspace sibling is reported as before), an integration adapter has no exception, and Core → adapter edges (`contracts-never-depend-on-adapters`) have none either.

## Ownership

Owned by `comity-development`. Consumed by `@comity-dev/validate` which actually invokes dependency-cruiser.

## Public API

```ts
import {
  buildDependencyRules,
  buildDependencyRulesForRoot,
  ENHANCED_RESOLVE_OPTIONS,
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
