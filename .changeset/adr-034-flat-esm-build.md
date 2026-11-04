---
"@comity-dev/build": minor
---

ADR-034 (Amendment 1): `comity-build` now emits ESM JavaScript and TypeScript declarations side by side in one flat `dist/` directory (`dist/index.js` next to `dist/index.d.ts`) in a single compiler pass. It no longer creates `dist/esm`, `dist/types` or `dist/cjs`, and it removes `dist/` before every build so no obsolete tree survives. Source maps point to `../src/…`. Watch mode uses the same single pass.

Breaking for consumers of the tool's output layout (minor under 0.x): a package built with this version must point `main`, `types` and `exports` at `./dist/…` instead of `./dist/esm/…` and `./dist/types/…`.
