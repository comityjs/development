# @comity-dev/validate

## 0.7.0

### Minor Changes

- ff4e82a: The `dependencies` category now resolves installed Comity packages through their `exports` maps and classifies them by layer, which removes false positives and closes a false-negative gap.

  Before, dependency-cruiser ignored package `exports`, so a subpath import such as `@comity/primitives/result` or `@comity/composition/setup` stayed an unresolved bare specifier and a Core Module importing it was reported as `DEP-core-only-kernel-primitives-or-core-peer`. A root import resolved into `node_modules` instead, matched no rule, and passed whatever its layer, so a Core Module importing an installed adapter was not detected.

  - `@comity-dev/dependency-rules`: the generated configuration sets `enhancedResolveOptions` (`exportsFields: ["exports"]`, conditions `import`, `require`, `node`, `default`, `types`; exported as `ENHANCED_RESOLVE_OPTIONS`). New option `installedPackages` lists classified packages that live in `node_modules`: they are matched as import targets, by specifier and by resolved path (hoisted and pnpm layouts), and are never rule sources. The catch-all of each layer rule now also matches the resolved path of any installed Comity package, so a package that is not classified fails closed. New rule `comity-import-must-resolve` reports a Comity import that cannot be resolved (not installed, subpath not exported, workspace package not built) when the layer rules would otherwise accept it. `no-cross-adapter-deps` allows one narrow exception, matching `no-layer-violation`: a test source of a Technology Adapter (`__tests__`, `*.test.*`, `*.spec.*`) may import an installed sibling adapter that the importing package declares in `devDependencies`; production sources, workspace adapters and non-dev declarations stay forbidden. Existing options and the meaning of every layer rule are unchanged; Core → Core edges remain outside the Core rule (ADR-008).
  - `@comity-dev/validate`: the `depcruise` engine classifies every installed `@comity/*` or `@comity-dev/*` package that a workspace package declares from the `comity.layer` of its installed manifest (the canonical field and layer list, validated against `@comity-dev/schemas`, including the scope boundary). A package that cannot be classified (missing or invalid layer, unreadable or mismatched manifest, conflicting copies, not installed, not declared) gets no layer and the finding states the reason. Workspace packages keep precedence over an installed copy of the same name.

  Consumers may see new findings that were previously invisible, for example a workspace adapter importing an installed adapter, or an import of a package that is not installed. Repositories that relied on unresolved allowed imports passing must install and build before validating.

### Patch Changes

- Updated dependencies [ff4e82a]
  - @comity-dev/dependency-rules@0.4.0

## 0.6.0

### Minor Changes

- 6657797: `adapter-peers` now supports the `peer-only` declaration model for `enterprise` repositories (package-dependency-policy §2): Technology Adapters declare the Core Module they implement and the Core Modules their production sources import as `peerDependencies`, with no Comity runtime dependency. `ARCH-ADAPTER-PEER-003` and `-004` read consumption from production imports, and the new `ARCH-ADAPTER-PEER-006` rejects a contract declared in both `dependencies` and `peerDependencies`. Repositories of every other type keep the paired `dependencies` + `peerDependencies` model unchanged.

### Patch Changes

- Updated dependencies [6657797]
  - @comity-dev/eslint-plugin@0.4.0

## 0.5.3

### Patch Changes

- Updated dependencies [df5a7b6]
  - @comity-dev/schemas@0.4.0

## 0.5.2

### Patch Changes

- Updated dependencies [b397c6a]
  - @comity-dev/schemas@0.3.0

## 0.5.1

### Patch Changes

- 62de6d9: Make the validator work in clean npm and pnpm consumers without installing its tools or ESLint configuration dependencies directly.

  - Executable resolution: `dependency-cruiser` and `eslint` are resolved from the validator's own dependency graph (`import.meta.resolve`, then the dependency's declared `bin`) and run with the current Node binary. The previous lookup of `<validate>/node_modules/.bin` failed under npm, where dependencies are hoisted, so the dependency and ESLint engines reported `TOOL-UNAVAILABLE`. Unresolvable tools remain `TOOL-UNAVAILABLE`, now with the reason.
  - ESLint configuration: `@comity-dev/eslint-plugin`, its `recommended` preset and `@typescript-eslint/parser` are resolved from the validator's own dependency graph instead of the validated repository's `node_modules`. Under pnpm they were not found unless the consumer had installed them directly, and the engine crashed with `ERR_MODULE_NOT_FOUND`.
  - Behavior change: ESLint now always runs with the plugin and parser versions this validator declares, not versions the consumer happens to install.
  - ESLint diagnostics: the crash finding kept only the first stderr line, which is blank for ESLint, hiding the cause. The full (bounded) stderr is now kept.
  - ESLint fail-closed: output that cannot be interpreted as ESLint's JSON result, including an exit code of 0 with empty or malformed output, was treated as zero findings and reported `PASS`. It is now `EXECUTION-ERROR`.
  - Semgrep: removed hardcoded developer-specific directories from the child `PATH`.
  - ESLint and Semgrep temporary files now use `os.tmpdir()` instead of `/tmp` and are removed on every path.

  The public API is unchanged. Repositories that previously reported `TOOL-UNAVAILABLE` (npm) or `EXECUTION-ERROR` (pnpm) for the dependency or ESLint engines will now report real results, which can include genuine findings.

## 0.5.0

### Minor Changes

- caf3bc7: Make the dependency-cruiser engine fail closed and read the real result schema.

  The engine read a top-level `violations` property that dependency-cruiser does not emit (it is `summary.violations`), treated unparseable output as "no findings", and decided success from the exit code, which the JSON reporter always sets to 0. Together this reported `PASS` with 0 findings regardless of the dependency graph.

  Why minor, not patch (0.x policy, `release-review.md`): this is a verdict change for the same input, not only a defect fix. Repositories that passed because nothing was evaluated can now `FAIL`, a repository without layered packages now reports `NOT-APPLICABLE` instead of `PASS`, and the engine requires `@comity-dev/dependency-rules` with `packagePaths` support. Consumers must expect their validation to start reporting real layering findings (including type-only imports) after upgrading.

  - The result is validated strictly (root, `modules`, `summary`, counters, violation entries, rule set applied). Findings come from `summary.violations` with source, target, rule and severity; only `error` severity fails.
  - Empty, malformed or unexpected output, crashes, start-up failures, signals and unexplained non-zero exits are `EXECUTION-ERROR`.
  - The engine fails if the generated rules were not applied or govern no cruised module, and runs from the repository root.

### Patch Changes

- Updated dependencies [caf3bc7]
  - @comity-dev/dependency-rules@0.3.0

## 0.4.1

### Patch Changes

- Publish caret sibling ranges instead of exact pins (WP-A4).

  The `@comity-dev/*` sibling references in `dependencies` now use `workspace:^`, so published
  manifests carry `^<sibling version>` instead of the exact pin that `pnpm` produced from
  `workspace:*`. No behaviour change.

## 0.4.0

### Minor Changes

- 026d0d4: Add stage-2 `packed-surface` tarball validation (ADR-035 D-03, design §12).

  `--only=packed-surface` packs every publishable package with `pnpm pack`, reads the resulting tarball with the system `tar`
  (no new dependency) and applies `ARCH-PACK-001…006` to the published surface: absent `exports` / `main` / `module` / `types` /
  `typesVersions` / `bin` targets, relative declarations missing from the tarball, external references evaluated against the
  packed manifest, unrewritten `workspace:` / `file:` / `link:` specifiers, exact sibling pins without a recorded ADR-033
  exception, and ESM-only conformance.

  The category is opt-in and runs in the release workflows after `Build` and before publication. Enforcement is report-only
  until the repository variable `COMITY_PACKED_SURFACE_ENFORCEMENT` is `true`, which is gated on WP-A1, WP-A4 and WP-B formal
  ratification.

## 0.3.0

### Minor Changes

- 1ebd835: Add stage 1 workspace declaration validation (ADR-035, WP-C1). The new `declarations` category (alias `declaration-dependencies`) checks every external module reference reachable from a package's published declaration entry points against its `dependencies` and `peerDependencies`, with deterministic name-agnostic package discovery and the `ARCH-DECL-DEP-000…005` rules. A missing build target is reported as `CONFIGURATION-ERROR` with exit code 2, never as a pass.

  This release also makes validation findings visible in normal output for every category without requiring `--verbose`, and adds `declarations` to `--only`. Existing categories and exit codes are unchanged apart from the always-visible findings behaviour approved in ADR-035 Decision 13.

## 0.2.3

### Patch Changes

- Updated dependencies [bc92680]
  - @comity-dev/semgrep-rules@0.2.3

## 0.2.2

### Patch Changes

- f9c0b1d: Remove the `comity-module-must-have-internal-marker` Semgrep rule, which could
  not inspect real JSDoc syntax (Semgrep strips comments from structural
  patterns) and therefore produced both false positives and false negatives. The
  approved Contract B (production sources under `src/internal/` and `src/lazy/`
  must declare an `@internal` JSDoc tag) is enforced instead by the shared ESLint
  rule `@comity-dev/require-internal-marker`, which MUST ship in the same release
  cohort. This changeset also bounds Semgrep scans with an overall timeout,
  process-group termination, and explicit execution-error reporting, and treats
  Semgrep `PartialParsing` warnings as an incomplete-analysis failure, so a file
  that was only partially parsed can no longer produce a passing result.
  Configuration errors now map to the documented exit code `2` (previously
  reported as `1`), and a category that did not execute because of a
  configuration error can no longer be accepted as a skipped category. The
  `--verbose` flag is now propagated to the Semgrep scan.
- Updated dependencies [f9c0b1d]
- Updated dependencies [f9c0b1d]
- Updated dependencies [f9c0b1d]
  - @comity-dev/eslint-plugin@0.3.0
  - @comity-dev/semgrep-rules@0.2.2

## 0.2.1

### Patch Changes

- ee5829f: Report the overall validation summary as `INCOMPLETE` instead of `PASS` when no violations were found but a required stage reports `TOOL-UNAVAILABLE`. Process exit codes are unchanged (`PASS` 0, `FAIL` 1, `TOOL_MISSING` 3); a genuine failure still reports `FAIL` and is never hidden by an unavailable tool.
- d68b1f1: Consume the rescoped error-class Semgrep rules: `comity-error-class-must-extend-base-error` and `comity-error-class-must-have-code-field` no longer scan test paths or `node_modules`. Validation output for repositories with test-local error fixtures changes accordingly; production findings are unaffected.
- d68b1f1: Fix Semgrep interpreter resolution: prefer the interpreter named by the semgrep executable's shebang line and verify every auto-discovered candidate actually ships the `semgrep` module, instead of running the scan with an unrelated system python that crashes with `ModuleNotFoundError` (previously misreported as `EXEC-ERROR`/`SEM-CRASH`). Execution-error results now carry an explanatory reason, and a validation run where a required tool is unavailable exits with the documented `TOOL_MISSING` code (3) instead of surfacing as PASS.
- Updated dependencies [d68b1f1]
  - @comity-dev/semgrep-rules@0.2.1

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

### Patch Changes

- Updated dependencies [5c68c74]
  - @comity-dev/dependency-rules@0.2.0
  - @comity-dev/eslint-plugin@0.2.0
  - @comity-dev/schemas@0.2.0
  - @comity-dev/semgrep-rules@0.2.0

## 0.1.2

### Patch Changes

- 52e9012: Align the adapter-peers engine with `adapters.md` §13: peerDependencies are now permitted for the implemented Core Module, kernel packages, and consumed Core Modules declared in `dependencies` (the authoritative consumption signal). A consumed Core Module missing from `peerDependencies` is now reported as `ARCH-ADAPTER-PEER-003`.
- a3cc823: Add `SEMGREP_PYTHON` to select the Python interpreter used by the Semgrep engine. An explicit value is honored as-is; a set-but-missing value reports `TOOL-UNAVAILABLE` instead of silently falling back. Default resolution and `SEMGREP_BIN` behavior are unchanged.
- Updated dependencies [48ac91a]
- Updated dependencies [52e9012]
- Updated dependencies [a3cc823]
  - @comity-dev/semgrep-rules@0.1.2
  - @comity-dev/eslint-plugin@0.1.2

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
- Updated dependencies [bd0d03b]
  - @comity-dev/dependency-rules@0.1.1
  - @comity-dev/eslint-plugin@0.1.1
  - @comity-dev/schemas@0.1.1
  - @comity-dev/semgrep-rules@0.1.1
