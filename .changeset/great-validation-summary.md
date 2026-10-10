---
"@comity-dev/validate": patch
---

Report the overall validation summary as `INCOMPLETE` instead of `PASS` when no violations were found but a required stage reports `TOOL-UNAVAILABLE`. Process exit codes are unchanged (`PASS` 0, `FAIL` 1, `TOOL_MISSING` 3); a genuine failure still reports `FAIL` and is never hidden by an unavailable tool.
