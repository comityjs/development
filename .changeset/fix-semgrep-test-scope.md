---
"@comity-dev/semgrep-rules": patch
---

Scope `comity-no-static-state-in-core` and `comity-core-no-process-env` to
production source by excluding test paths, matching the existing adapter and
core rule scoping. Production static state and `process.env` reads remain
detected.
