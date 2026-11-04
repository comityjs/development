# ADR-034 — ESM-Only Build with `require` Served by Node's `require(esm)`

> **Provenance:**
> - Canonical owner: comity-development
> - Runtime owner: comity-community (`@comity/*` export maps); build tool `@comity-dev/build`
> - Raised by: Cross-Repository Dependency Policy Audit and Remediation Plan (Commerce / Comity boundary work, 2026-11-04)
> - **Amends:** ADR-022, section "ESM-First Source with Dual ESM/CJS Distribution" (and the two Consequences lines that repeat it). See "Relationship to ADR-022".

**Status:** Proposed

## Context

### The existing defect (verified 2026-11-04)

Every published `@comity/*` package declares `"type": "module"` (required by the package-metadata schema) and ships two
builds. `comity-build` (`development/packages/build/src/bin/comity-build.ts`) runs `tsc` twice: once to `dist/esm`, and once
more with `--module CommonJS --moduleResolution node` to `dist/cjs`. The CommonJS output is emitted as **`.js`** files with
no `.cjs` extension and no nested `package.json`. Every export map routes the `require` condition to those files
(for example `@comity/primitives`: `"require": { "types": "./dist/types/…", "default": "./dist/cjs/…/index.js" }`, and
`"main": "./dist/cjs/index.js"`).

Node decides a `.js` file's format from the nearest `package.json`, which is the package root (`type: module`). The
CommonJS output is therefore evaluated as ESM. Reproduced with Node 24.19.0, with a real `.cjs` consumer and the packages
as published on npm:

- `require("@comity/primitives")`, `"@comity/primitives/errors"`, `"@comity/primitives/result"`, `"@comity/pricing"`,
  `"@comity/order"` (0.9.1) and `"@comity/primitives/errors"` (0.9.0) all throw
  `ReferenceError: exports is not defined in ES module scope`.
- The types are shared: `require.types` and `import.types` point to the same `dist/types/**/*.d.ts`, which are also ESM-scoped.
  Under TypeScript `module: nodenext` a CommonJS consumer is accepted by the compiler while the runtime crashes.

`require()` of a Comity package under Node has therefore never worked in any published version checked (0.9.0, 0.9.1).

### Scope of ADR-022 (verified)

ADR-022 (Accepted) governs `@comity/cli` and `@comity/cli-commander`. Its dual-distribution paragraph is limited to those
two packages and states that it "is **independent of the repository-wide CJS compatibility contract**. The existing 47
packages' dual ESM/CJS distribution (`exports.require`) remains unaffected." The repository-wide convention is not written
in an ADR. It appears only in descriptive documents: `community/docs/architecture/repository.md` ("Dual ESM/CJS exports —
`import` and `require` conditions"), `community/SKILL.md` ("dual ESM/CJS bundles") and
`community/docs/.documentation/AGENT.md`. No standard, schema or validator rule requires a `require` condition
(`package-metadata.ts` requires `type: module`, `engines.node`, and `exports`).

### Runtime baseline

`runtime-support.md` §1 and every manifest declare Node `>=24.0.0`. Node 24 can load an ES module graph with `require()`
(`require(esm)`).

## Problem statement

1. The documented convention (dual ESM/CJS) is not what the published packages deliver: CommonJS consumption crashes.
2. A **working** dual build would be a worse design for this framework. Two physical builds mean two class definitions in
   one process. `BaseError` identity is checked with `instanceof` by `toSafePayload` and by `http-hono`, `http`, `auth`,
   `auth-jose`, `html` and `kernel`. Experiment: with a nested `{"type":"commonjs"}` marker (the obvious fix), `require` runs, but
   `require("@comity/primitives/errors").BaseError !== (await import("@comity/primitives/errors")).BaseError`, so an error
   created through one path fails `instanceof` through the other.
3. CommonJS-scoped declarations (`.d.cts` or a second type tree) would be needed to type the CJS path correctly.

## Decision

1. **One runtime implementation: the existing ESM build.** `comity-build` stops producing `dist/cjs` (the CommonJS pass in
   both build and watch mode). `dist/esm` and `dist/types` remain.
2. **Export-map strategy.** For every exported subpath, `import` and `require` both resolve to the **same** `dist/esm` file
   and the **same** `dist/types` declaration:

   ```jsonc
   ".": {
     "import":  { "types": "./dist/types/index.d.ts", "default": "./dist/esm/index.js" },
     "require": { "types": "./dist/types/index.d.ts", "default": "./dist/esm/index.js" }
   }
   ```

   `main` becomes the ESM entry (`./dist/esm/index.js`); `module`, `types` and `typesVersions` are unchanged. Keeping both
   conditions preserves the current map shape and the `comity-normalize-package-json` condition order. A `types` + `default`
   collapse is equivalent and may be chosen at implementation time without changing this decision.
3. **Supported runtime for `require`:** Node.js **`>=24.0.0`**, matching `engines`. Verified: Node 24.0.0, 24.4.0 and 24.19.0
   (see Validation evidence). No other runtime is claimed.
4. **ESM graphs must stay synchronous.** `require(esm)` throws `ERR_REQUIRE_ASYNC_MODULE` for a module graph with
   top-level `await`. A test enforces this (Validation requirements).
5. **`require()` return shape.** `require(esm)` returns the module namespace; a module with a default export carries
   `__esModule: true`, `default`. Verified for `@comity/catalog/setup`: the shape `{ __esModule, default }` equals the previous
   TypeScript CommonJS emit.
6. **Package contract wording.** Packages "expose ESM; Node 24+ `require()` resolves to the same ESM build". They do not
   "ship a CommonJS build". Standards and descriptive documents that say "dual ESM/CJS" are updated when this ADR is Accepted.

### Relationship to ADR-022

This ADR **amends** ADR-022. The amendment is limited to the paragraph "ESM-First Source with Dual ESM/CJS Distribution"
and the Consequences lines that repeat it ("dual ESM/CJS distribution is provided per repository convention"; "consistent
with the repository dual-package convention"). Everything else in ADR-022 (package classification, dependency rules, Core
and Adapter contracts, bin ownership) is unchanged. ADR-022 remains Accepted. Because ADR-022's paragraph disclaims being the
repository-wide contract, this ADR **also** replaces the repository-wide dual-build convention found in the descriptive
documents listed in Context. On acceptance, ADR-022 receives a one-line "Amended by ADR-034" pointer and the descriptive
documents are corrected; neither is done by this proposal.

## Alternatives considered

| Alternative | Runtime `require` | Types for CJS | Same class under `require` and `import` | Rejected because |
|---|---|---|---|---|
| **Nested `dist/cjs/package.json` (`type: commonjs`)** | works | still ESM-scoped `.d.ts` (TS1479 under `node16`) | **no** (verified) | Reintroduces two classes in one process; the identity failure this work removes |
| **`.cjs` extensions** | works | needs `.d.cts` | no | `tsc` cannot emit `.cjs` from `.ts` without a renaming and specifier-rewriting post-processor; same dual-class hazard |
| **Declare CJS unsupported (remove `require`)** | `ERR_PACKAGE_PATH_NOT_EXPORTED` | n/a | n/a | Contradicts the documented convention when a working, cheaper path exists; removes a capability consumers may expect |
| **Bundled dual output (tsup/esbuild)** | works | needs dual declarations | no, unless state is externalised | Adds a build dependency and a second implementation |
| **Keep the status quo** | crashes | wrong | n/a | The defect |

## Consequences

**Positive:** CommonJS consumers on Node 24+ work for the first time; one runtime copy, one `BaseError` class; one
declaration tree; one build pass fewer; smaller tarballs.

**Negative / trade-offs:**

- A TypeScript consumer in a CommonJS file under `moduleResolution: node16` still gets TS1479, because `node16` does not
  model `require(esm)`. `nodenext` is required for TypeScript code that Node runs as CommonJS (verified); `bundler` is
  validated in the acceptance fixture, not claimed here. This is accurate to the runtime behaviour.
  `moduleResolution: node` (node10) ignores `exports` and resolves through `main`/`types`/`typesVersions`; it is not
  separately verified here.
- Top-level `await` becomes forbidden in any entry graph.
- Consumers on Node < 24 are outside the supported range (already the case through `engines`).

**Limitations (not claimed):** bundlers (webpack, Rollup, esbuild, Vite), Deno, Bun, Cloudflare Workers and other
non-Node runtimes were **not** tested for the `require` condition. A bundler that previously parsed `dist/cjs` by syntax
may have worked unobserved; after this change it receives the ESM build. The existing ESM claims in `runtime-support.md` §2
are unaffected because ESM `import` resolution is unchanged.

## Compatibility and migration

- **ESM consumers:** unchanged files and types.
- **Node CJS consumers:** failing → working (Node 24+).
- **Deep imports of `dist/cjs/...`:** already unreachable through `exports`; resolvers that ignore `exports` and read `main`
  receive the ESM entry.
- **Semver (proposed):** **patch** — it makes a documented behaviour work and removes no working behaviour. Confirm at
  acceptance; also see ADR-033: shipping this as a minor would trigger the peer-dependent major cascade documented there.
- **Release:** independent of ADR-033. If both are ready they may share one coordinated patch release; otherwise this ships alone.
  The decision is recorded in the roadmap and made by the release owner.
- **Migration steps (future implementation task):** remove the CJS pass in `comity-build` (build and watch); rewrite
  `require.default` and `main` in each package; remove `dist/cjs` from outputs; correct the descriptive documents; add the
  tarball tests below.

## Validation requirements

Run against **packed tarballs installed in a clean consumer**, on Node 24.0.0 and the current 24.x:

1. For every package and every `exports` subpath: a `.cjs` file `require`s it and its export keys equal the ESM namespace's.
2. `require("@comity/primitives/errors").BaseError === (await import(...)).BaseError`; a `PricingError` obtained via `require`
   passes `instanceof` against the imported `BaseError`.
3. No entry throws `ERR_REQUIRE_ASYNC_MODULE`; no `ExperimentalWarning` on stderr.
4. TypeScript fixture, `skipLibCheck: false`: an `.mts` file passes under `nodenext` and `bundler`; a `.cts` file passes under
   `nodenext`; a `.cts` file under `node16` is documented as unsupported.
5. The tarball contains no `dist/cjs/`, and every `exports` target exists in the tarball.
6. Optional: one bundler smoke build, to narrow the bundler limitation. It is evidence, not a support claim, unless the
   result is recorded.

### Validation evidence already gathered (2026-11-04, scratchpad experiments, not repository artifacts)

- Published 0.9.0 and 0.9.1: `require` crashes (above).
- Variant "serve ESM to `require`", on copies of the published 0.9.1 packages: `require` works; `BaseError` identical.
- All **123** `exports[*].import` entries of all **54** local packages load via `require()` on Node 24.0.0, 24.4.0 and 24.19.0,
  with no top-level-await failure and **0 bytes** on stderr (no warnings).
- Not verified: bundlers; Node versions other than the three above; `moduleResolution: bundler` under the fix; non-pnpm managers.

## Dependencies on other decisions

- Amends ADR-022 (limited scope above). Independent of ADR-033, ADR-035, ADR-036.
- ADR-035's declaration validation covers `types` targets of both conditions; with this decision they are identical.
- Requires an update to `runtime-support.md` §1 on acceptance: the "`require()` of ESM" statement and its verified Node range.

## Open questions (require maintainer decision before this ADR is Accepted)

1. Confirmation of the semver class (patch proposed).
2. Keep both `import`/`require` keys, or collapse to `types`/`default` (equivalent).
3. Whether to run the optional bundler smoke test before acceptance, to document the limitation more precisely.

## References

ADR-022 (amended section); `development/docs/standards/runtime-support.md`; `community/docs/architecture/repository.md`;
`development/packages/build/src/bin/comity-build.ts`; `development/packages/schemas/src/schemas/package-metadata.ts`; ADR-033.

## Scope

This ADR decides the distribution format and export-map strategy. It changes no build configuration, export map or package.
