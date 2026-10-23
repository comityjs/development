---
"@comity-dev/semgrep-rules": patch
"@comity-dev/validate": patch
---

Remove the `comity-module-must-have-internal-marker` Semgrep rule, which could
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
