---
"@comity-dev/package-tools": patch
---

`comity-normalize-package-json` keeps export conditions in resolution order: `types` first, environment conditions (for example `node`) next, `default` last, and it orders nested condition objects the same way. Previously an environment condition at the same level as `default` was moved after `default`, which makes it unreachable. Legacy `import` / `require` branches still sort ahead of `types`. Output is deterministic.
