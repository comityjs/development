# @comity-dev/validate

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

### Patch Changes

- Updated dependencies [5c68c74]
  - @comity-dev/dependency-rules@0.2.0
  - @comity-dev/eslint-plugin@0.2.0
  - @comity-dev/schemas@0.2.0
  - @comity-dev/semgrep-rules@0.2.0

## 0.1.2

### Patch Changes

- 52e9012: Align the adapter-peers engine with `adapters.md` §13: peerDependencies are now permitted for the implemented Core Module, kernel packages, and consumed Core Modules declared in `dependencies` (the authoritative consumption signal). A consumed Core Module missing from `peerDependencies` is now reported as `ARCH-ADAPTER-PEER-003`.
- a3cc823: Add `SEMGREP_PYTHON` to select the Python interpreter used by the Semgrep engine. An explicit value is honored as-is; a set-but-missing value reports `TOOL-UNAVAILABLE` instead of silently falling back. Default resolution and `SEMGREP_BIN` behavior are unchanged.
- Updated dependencies [48ac91a]
- Updated dependencies [52e9012]
- Updated dependencies [a3cc823]
  - @comity-dev/semgrep-rules@0.1.2
  - @comity-dev/eslint-plugin@0.1.2

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
- Updated dependencies [bd0d03b]
  - @comity-dev/dependency-rules@0.1.1
  - @comity-dev/eslint-plugin@0.1.1
  - @comity-dev/schemas@0.1.1
  - @comity-dev/semgrep-rules@0.1.1
