# @comity-dev/semgrep-rules

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
- f9c0b1d: Scope `comity-no-static-state-in-core` and `comity-core-no-process-env` to
  production source by excluding test paths, matching the existing adapter and
  core rule scoping. Production static state and `process.env` reads remain
  detected.

## 0.2.1

### Patch Changes

- d68b1f1: Scope `comity-error-class-must-extend-base-error` and `comity-error-class-must-have-code-field` to production code. Both rules now exclude test paths (`**/*.test.ts`, `**/__tests__/**`) and `**/node_modules/**`, matching the established conventions of the adapter and core rules. The error-class contract in `errors.md` applies to production packages; test fixtures and mocks are out of scope. Production violations remain detectable.

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

## 0.1.2

### Patch Changes

- 48ac91a: Repair Semgrep rule semantics and scope. Top-level `pattern-not` shorthand is replaced with the verified `patterns:`-list form for `comity-error-class-must-have-code-field` and `comity-adapter-must-declare-implements`, so documented exclusions (stable `code` fields, constructor-bearing adapters) are honored. Remove the overbroad `extends $BASE` exclusion that negated `comity-error-class-must-extend-base-error`, and replace the inoperative docblock exclusion with an abstract-class exclusion. Exclude test paths (`**/*.test.ts`, `**/__tests__/**`) from `comity-adapter-no-raw-error-throw`, `comity-core-no-fs`, and `comity-core-no-fs-promises`.
- 52e9012: Retire `comity-adapter-must-declare-implements` per owner decision D1: no normative class-level `implements` or constructor requirement exists, and the package-level relationship is enforced by authoritative metadata and the adapter-peers engine. This supersedes the rule-shape repair described for this rule in the pending `olive-donkeys-fix` changeset; all other repairs in that changeset still apply.

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
