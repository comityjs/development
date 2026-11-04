# @comity-dev/build

## 0.3.0

### Minor Changes

- cc0160b: ADR-034 (Amendment 1): `comity-build` now emits ESM JavaScript and TypeScript declarations side by side in one flat `dist/` directory (`dist/index.js` next to `dist/index.d.ts`) in a single compiler pass. It no longer creates `dist/esm`, `dist/types` or `dist/cjs`, and it removes `dist/` before every build so no obsolete tree survives. Source maps point to `../src/…`. Watch mode uses the same single pass.

  Breaking for consumers of the tool's output layout (minor under 0.x): a package built with this version must point `main`, `types` and `exports` at `./dist/…` instead of `./dist/esm/…` and `./dist/types/…`.

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
