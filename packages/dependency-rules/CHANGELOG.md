# @comity-dev/dependency-rules

## 0.4.1

### Patch Changes

- 6283449: Adapter sources no longer escape the `dependencies` category when they import a Comity package that is not classified.

  Layer rules for Core, Kernel, Composition and Primitives already rejected an unclassified Comity import, but adapters have no such catch-all, so an adapter importing a resolvable installed `@comity/*` package that no workspace package declares (including one that is only a transitive dependency) matched no rule and passed.

  - `@comity-dev/dependency-rules`: new rule `comity-package-must-be-classified` rejects, from every file of every workspace adapter, a `@comity/*` or `@comity-dev/*` import (resolved in a hoisted or pnpm layout, or unresolved; root or subpath) whose package is neither a workspace package nor a classified installed package. Other third-party packages are not matched. `comity-import-must-resolve` now covers known names only, so no import is reported twice.
  - `@comity-dev/validate`: findings for an undeclared package now state what is wrong from the manifest of the package that was actually resolved: installed with its version and layer but not declared, unclassifiable, or not installed. An undeclared package is never given a layer or treated as declared.

  Existing rules, the test-only sibling-adapter exception and Core → Core semantics are unchanged. Repositories whose adapters import a Comity package that no workspace package declares will now fail this check and must declare it.

## 0.4.0

### Minor Changes

- ff4e82a: The `dependencies` category now resolves installed Comity packages through their `exports` maps and classifies them by layer, which removes false positives and closes a false-negative gap.

  Before, dependency-cruiser ignored package `exports`, so a subpath import such as `@comity/primitives/result` or `@comity/composition/setup` stayed an unresolved bare specifier and a Core Module importing it was reported as `DEP-core-only-kernel-primitives-or-core-peer`. A root import resolved into `node_modules` instead, matched no rule, and passed whatever its layer, so a Core Module importing an installed adapter was not detected.

  - `@comity-dev/dependency-rules`: the generated configuration sets `enhancedResolveOptions` (`exportsFields: ["exports"]`, conditions `import`, `require`, `node`, `default`, `types`; exported as `ENHANCED_RESOLVE_OPTIONS`). New option `installedPackages` lists classified packages that live in `node_modules`: they are matched as import targets, by specifier and by resolved path (hoisted and pnpm layouts), and are never rule sources. The catch-all of each layer rule now also matches the resolved path of any installed Comity package, so a package that is not classified fails closed. New rule `comity-import-must-resolve` reports a Comity import that cannot be resolved (not installed, subpath not exported, workspace package not built) when the layer rules would otherwise accept it. `no-cross-adapter-deps` allows one narrow exception, matching `no-layer-violation`: a test source of a Technology Adapter (`__tests__`, `*.test.*`, `*.spec.*`) may import an installed sibling adapter that the importing package declares in `devDependencies`; production sources, workspace adapters and non-dev declarations stay forbidden. Existing options and the meaning of every layer rule are unchanged; Core → Core edges remain outside the Core rule (ADR-008).
  - `@comity-dev/validate`: the `depcruise` engine classifies every installed `@comity/*` or `@comity-dev/*` package that a workspace package declares from the `comity.layer` of its installed manifest (the canonical field and layer list, validated against `@comity-dev/schemas`, including the scope boundary). A package that cannot be classified (missing or invalid layer, unreadable or mismatched manifest, conflicting copies, not installed, not declared) gets no layer and the finding states the reason. Workspace packages keep precedence over an installed copy of the same name.

  Consumers may see new findings that were previously invisible, for example a workspace adapter importing an installed adapter, or an import of a package that is not installed. Repositories that relied on unresolved allowed imports passing must install and build before validating.

## 0.3.0

### Minor Changes

- caf3bc7: Generate dependency-cruiser rules that match real module paths, include type-only imports, and allow Core → Composition.

  **Breaking (0.x minor).** `buildDependencyRules` and `buildDependencyRulesForRoot` now require `options.packagePaths` (`Record<packageName, directory>`); the TypeScript type reflects this and a missing or incomplete value throws. The generated `from.path` / `to.path` expressions previously matched package names, which dependency-cruiser never evaluates against, so no rule could fire.

  **Migration.** Direct callers must pass the directory of every package, relative to the directory dependency-cruiser runs in (the repository root), or absolute for `buildDependencyRulesForRoot`:

  ```ts
  buildDependencyRulesForRoot(classification, repoRoot, {
    packagePaths: { "@comity/kernel": "packages/kernel" },
  });
  ```

  Run dependency-cruiser with the repository root as its working directory.

  Other changes:

  - Rules match module paths, `node_modules/<name>/` paths and unresolved bare specifiers. Generated output (`dist/`, `coverage/`, `node_modules/`) is never a rule source and `coverage/` is excluded from the cruise.
  - The generated configuration sets `tsPreCompilationDeps: true`, so type-only imports (`import type`, `import { type X }`, `export type … from`) are subject to the same layering policy as runtime imports.
  - Core Modules may depend on `@comity/composition` (ADR-025). This is no longer reported. Core → Core edges remain unrestricted by the generated rules; the ADR-008 closed register is not enforced here, and the rule description now says so.
  - Integration Adapter → Technology Adapter edges are allowed as documented (ADR-007); same-package imports are not reported.
  - `tsconfig.json` is passed to dependency-cruiser when present; `tsConfigFileName` passed to `buildDependencyRules` is now emitted (it was previously ignored).
  - `GENERATED_OUTPUT_PATTERN`, `EXCLUDED_FROM_CRUISE_PATTERN` and `normalizePackageDir` are exported from the `./build-config` subpath.

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
