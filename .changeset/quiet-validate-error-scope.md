---
"@comity-dev/validate": patch
---

Consume the rescoped error-class Semgrep rules: `comity-error-class-must-extend-base-error` and `comity-error-class-must-have-code-field` no longer scan test paths or `node_modules`. Validation output for repositories with test-local error fixtures changes accordingly; production findings are unaffected.
