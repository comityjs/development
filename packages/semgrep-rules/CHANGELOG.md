# @comity-dev/semgrep-rules

## 0.1.2

### Patch Changes

- 48ac91a: Repair Semgrep rule semantics and scope. Top-level `pattern-not` shorthand is replaced with the verified `patterns:`-list form for `comity-error-class-must-have-code-field` and `comity-adapter-must-declare-implements`, so documented exclusions (stable `code` fields, constructor-bearing adapters) are honored. Remove the overbroad `extends $BASE` exclusion that negated `comity-error-class-must-extend-base-error`, and replace the inoperative docblock exclusion with an abstract-class exclusion. Exclude test paths (`**/*.test.ts`, `**/__tests__/**`) from `comity-adapter-no-raw-error-throw`, `comity-core-no-fs`, and `comity-core-no-fs-promises`.
- 52e9012: Retire `comity-adapter-must-declare-implements` per owner decision D1: no normative class-level `implements` or constructor requirement exists, and the package-level relationship is enforced by authoritative metadata and the adapter-peers engine. This supersedes the rule-shape repair described for this rule in the pending `olive-donkeys-fix` changeset; all other repairs in that changeset still apply.

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
