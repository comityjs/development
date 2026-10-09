---
"@comity-dev/semgrep-rules": patch
---

Repair Semgrep rule semantics and scope. Top-level `pattern-not` shorthand is replaced with the verified `patterns:`-list form for `comity-error-class-must-have-code-field` and `comity-adapter-must-declare-implements`, so documented exclusions (stable `code` fields, constructor-bearing adapters) are honored. Remove the overbroad `extends $BASE` exclusion that negated `comity-error-class-must-extend-base-error`, and replace the inoperative docblock exclusion with an abstract-class exclusion. Exclude test paths (`**/*.test.ts`, `**/__tests__/**`) from `comity-adapter-no-raw-error-throw`, `comity-core-no-fs`, and `comity-core-no-fs-promises`.
