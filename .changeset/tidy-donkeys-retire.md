---
"@comity-dev/semgrep-rules": patch
---

Retire `comity-adapter-must-declare-implements` per owner decision D1: no normative class-level `implements` or constructor requirement exists, and the package-level relationship is enforced by authoritative metadata and the adapter-peers engine. This supersedes the rule-shape repair described for this rule in the pending `olive-donkeys-fix` changeset; all other repairs in that changeset still apply.
