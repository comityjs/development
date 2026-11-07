---
"@comity-dev/dependency-rules": minor
---

Generate dependency-cruiser rules that match real module paths, include type-only imports, and allow Core → Composition.

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
