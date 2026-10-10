---
"@comity-dev/validate": patch
---

Fix Semgrep interpreter resolution: prefer the interpreter named by the semgrep executable's shebang line and verify every auto-discovered candidate actually ships the `semgrep` module, instead of running the scan with an unrelated system python that crashes with `ModuleNotFoundError` (previously misreported as `EXEC-ERROR`/`SEM-CRASH`). Execution-error results now carry an explanatory reason, and a validation run where a required tool is unavailable exits with the documented `TOOL_MISSING` code (3) instead of surfacing as PASS.
