# @comity-dev/validate

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
