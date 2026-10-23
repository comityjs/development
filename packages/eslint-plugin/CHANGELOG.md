# @comity-dev/eslint-plugin

## 0.3.0

### Minor Changes

- f9c0b1d: Add the `require-internal-marker` rule and enable it in the recommended set.
  The rule enforces the approved Contract B: production TypeScript sources under
  `packages/*/src/internal/**` and `packages/*/src/lazy/**` MUST declare an
  `@internal` JSDoc tag, either inline or as a conventional multiline docblock.
  Because the rule inspects real JSDoc comments through ESLint's source-code
  APIs, marker-like text in strings, template literals, tagged templates,
  regular-expression literals, line comments, ordinary block comments, and JSDoc
  prose does not satisfy it. It replaces the retired Semgrep rule
  `comity-module-must-have-internal-marker` and MUST ship in the same release
  cohort as the `@comity-dev/semgrep-rules` and `@comity-dev/validate` patches.

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

## 0.1.2

### Patch Changes

- a3cc823: Fix `no-date-in-core` false positive on the sanctioned time primitives: `Date` use under `packages/primitives/src/time/` is now exempt as documented, while `Date` construction elsewhere in Core remains forbidden. Filenames are normalized across platforms before classification.

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
