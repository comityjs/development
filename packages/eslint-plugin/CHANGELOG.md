# @comity-dev/eslint-plugin

## 0.1.2

### Patch Changes

- a3cc823: Fix `no-date-in-core` false positive on the sanctioned time primitives: `Date` use under `packages/primitives/src/time/` is now exempt as documented, while `Date` construction elsewhere in Core remains forbidden. Filenames are normalized across platforms before classification.

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
