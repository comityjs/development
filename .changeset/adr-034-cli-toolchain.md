---
"@comity-dev/cli": patch
---

Re-release so `comity` resolves the ADR-034 flat-`dist/` build (`@comity-dev/build`) and the corrected export-condition normalizer (`@comity-dev/package-tools`). `@comity-dev/cli` pins its siblings to exact versions at publish time (`workspace:*`, see ADR-033 and WP-A4), so it must be re-released for consumers to receive them. No change to the CLI's own commands or API.
