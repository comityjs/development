---
"@comity-dev/eslint-plugin": patch
---

Fix `no-date-in-core` false positive on the sanctioned time primitives: `Date` use under `packages/primitives/src/time/` is now exempt as documented, while `Date` construction elsewhere in Core remains forbidden. Filenames are normalized across platforms before classification.
