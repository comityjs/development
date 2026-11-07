---
"@comity-dev/eslint-plugin": patch
---

Align `no-layer-violation` with ADR-025 §5. Core Modules and Technology Adapters may now import `@comity/composition` (including `@comity/composition/setup`); both were wrongly reported before. The forbidden edges are unchanged and still reported: `kernel → composition`, `primitives → composition`, composition → any Core Module and every adapter/Core restriction, and composition-layer sources are still checked. Integration Adapter → composition is unchanged (still reported). Only reports are removed: no rule name, option, schema, export or dependency changed.
