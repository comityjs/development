# @comity-dev/package-tools

## 0.2.2

### Patch Changes

- 764d1ab: simplify dependency sorting logic

## 0.2.1

### Patch Changes

- cc0160b: `comity-normalize-package-json` keeps export conditions in resolution order: `types` first, environment conditions (for example `node`) next, `default` last, and it orders nested condition objects the same way. Previously an environment condition at the same level as `default` was moved after `default`, which makes it unreachable. Legacy `import` / `require` branches still sort ahead of `types`. Output is deterministic.

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

## 0.1.1

### Patch Changes

- 0dd8fe4: Fix package tooling release workflow.
