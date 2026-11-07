# @comity-dev/cli

## 0.2.8

### Patch Changes

- 8a5913f: Fix `comity validate` (and `comity build` / `comity normalize`) failing with `spawn .../node_modules/.bin/comity-validate ENOENT` when `@comity-dev/cli` is the only installed Comity package under pnpm. The CLI now resolves delegated executables from its own declared dependencies (`@comity-dev/validate`, `@comity-dev/build`, `@comity-dev/package-tools`) via their `bin` field instead of the consumer's root `node_modules/.bin`, runs them with the current Node binary, forwards termination signals, reports a signal-killed child as exit status 128 + signal number, and fails with an error that preserves the underlying cause when an executable cannot be resolved.
- Updated dependencies [62de6d9]
  - @comity-dev/validate@0.5.1

## 0.2.7

### Patch Changes

- Updated dependencies [caf3bc7]
  - @comity-dev/validate@0.5.0

## 0.2.6

### Patch Changes

- Publish caret sibling ranges instead of exact pins (WP-A4).

  The `@comity-dev/*` sibling references in `dependencies` now use `workspace:^`, so published
  manifests carry `^<sibling version>` instead of the exact pin that `pnpm` produced from
  `workspace:*`. No behaviour change.

- Updated dependencies
  - @comity-dev/validate@0.4.1

## 0.2.5

### Patch Changes

- Updated dependencies [026d0d4]
  - @comity-dev/validate@0.4.0

## 0.2.4

### Patch Changes

- Updated dependencies [1ebd835]
  - @comity-dev/validate@0.3.0

## 0.2.3

### Patch Changes

- cc0160b: Re-release so `comity` resolves the ADR-034 flat-`dist/` build (`@comity-dev/build`) and the corrected export-condition normalizer (`@comity-dev/package-tools`). `@comity-dev/cli` pins its siblings to exact versions at publish time (`workspace:*`, see ADR-033 and WP-A4), so it must be re-released for consumers to receive them. No change to the CLI's own commands or API.
- Updated dependencies [cc0160b]
- Updated dependencies [cc0160b]
  - @comity-dev/build@0.3.0
  - @comity-dev/package-tools@0.2.1
  - @comity-dev/validate@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [f9c0b1d]
  - @comity-dev/validate@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [ee5829f]
- Updated dependencies [d68b1f1]
- Updated dependencies [d68b1f1]
  - @comity-dev/validate@0.2.1

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

### Patch Changes

- Updated dependencies [5c68c74]
  - @comity-dev/build@0.2.0
  - @comity-dev/package-tools@0.2.0
  - @comity-dev/validate@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [52e9012]
- Updated dependencies [a3cc823]
  - @comity-dev/validate@0.1.2

## 0.1.2

### Patch Changes

- Updated dependencies [bd0d03b]
  - @comity-dev/build@0.1.1
  - @comity-dev/validate@0.1.1

## 0.1.1

### Patch Changes

- Updated dependencies [0dd8fe4]
  - @comity-dev/package-tools@0.1.1
