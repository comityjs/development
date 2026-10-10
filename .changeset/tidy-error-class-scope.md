---
"@comity-dev/semgrep-rules": patch
---

Scope `comity-error-class-must-extend-base-error` and `comity-error-class-must-have-code-field` to production code. Both rules now exclude test paths (`**/*.test.ts`, `**/__tests__/**`) and `**/node_modules/**`, matching the established conventions of the adapter and core rules. The error-class contract in `errors.md` applies to production packages; test fixtures and mocks are out of scope. Production violations remain detectable.
