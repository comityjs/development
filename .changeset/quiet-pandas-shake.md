---
"@comity-dev/validate": patch
---

Add `SEMGREP_PYTHON` to select the Python interpreter used by the Semgrep engine. An explicit value is honored as-is; a set-but-missing value reports `TOOL-UNAVAILABLE` instead of silently falling back. Default resolution and `SEMGREP_BIN` behavior are unchanged.
