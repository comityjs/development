# ADR-034 — ESM-Only Distribution for All Comity Packages, with `require` Served by Node's `require(esm)`

> **Provenance:**
> - Canonical owner: comity-development
> - Runtime owner: comity-community (`@comity/*` export maps); build tool `@comity-dev/build`
> - Raised by: Cross-Repository Dependency Policy Audit and Remediation Plan (Commerce / Comity boundary work, 2026-11-04)
> - **Supersedes (in part):** ADR-022, section "ESM-First Source with Dual ESM/CJS Distribution" and the two Consequences lines that repeat it. Everything else in ADR-022 is unchanged. See "Relationship to ADR-022".
> - Architecture-owner decision D-02 (2026-11-04): a single ESM distribution for all Comity packages, including the CLI packages, with no package-specific CommonJS exception.
> - **Accepted:** 2026-11-04, by Comity maintainer decision. Accepted as written: ESM-only distribution for every Comity package
>   including the CLI packages; **no CommonJS build and no CommonJS compatibility promise**; `import` and Node 24+ `require(ESM)`
>   resolve to the **same** ESM artifact; Node's synchronous module-graph constraints explicitly documented; ADR-022 **partially
>   superseded** exactly as described in "Relationship to ADR-022" (ADR-022 remains `Accepted`, its historical text preserved).
>   **Acceptance does not authorise WP-B.** The semver class is confirmed at WP-B's release, and the export-map key shape and the
>   optional bundler smoke build remain WP-B implementation choices.

**Status:** Accepted — with **Amendment 1** (2026-11-04, implementation clarification: flat `dist/` layout; see "Amendment 1" below). The original decision text is preserved unchanged except for the pointer notes marked "[Amendment 1]".

## Context

### The existing defect (verified 2026-11-04)

Every published `@comity/*` package declares `"type": "module"` (required by the package-metadata schema) and ships two
builds. `comity-build` (`development/packages/build/src/bin/comity-build.ts`) runs `tsc` twice: once to `dist/esm`, and once
more with `--module CommonJS --moduleResolution node` to `dist/cjs`. The CommonJS output is emitted as **`.js`** files with
no `.cjs` extension and no nested `package.json`. In **53 of the 54** `community` packages the export map routes the `require`
condition to those files (for example `@comity/primitives`: `"require": { "types": "./dist/types/…", "default": "./dist/cjs/…/index.js" }`,
and `"main": "./dist/cjs/index.js"`).

Node decides a `.js` file's format from the nearest `package.json`, which is the package root (`type: module`). The
CommonJS output is therefore evaluated as ESM. Reproduced with Node 24.19.0, with a real `.cjs` consumer and the packages
as published on npm:

- `require("@comity/primitives")`, `"@comity/primitives/errors"`, `"@comity/primitives/result"`, `"@comity/pricing"`,
  `"@comity/order"` (0.9.1) and `"@comity/primitives/errors"` (0.9.0) all throw
  `ReferenceError: exports is not defined in ES module scope`.
- The types are shared: `require.types` and `import.types` point to the same `dist/types/**/*.d.ts`, which are also ESM-scoped.
  Under TypeScript `module: nodenext` a CommonJS consumer is accepted by the compiler while the runtime crashes.

`require()` of a Comity package under Node has therefore never worked in any published version checked (0.9.0, 0.9.1).

### The one package without a `require` condition: `@comity/queue-pg-boss` (verified)

`@comity/queue-pg-boss` is the only `community` package whose manifest has **no `require` condition and no `main`**
(`exports["."]` has only `import`). This is deliberate and documented: its `docs/overview.md` ("Module format") and
`docs/conventions.md` ("Packaging") state it is ESM-only *because* the shared build's CommonJS tree has no scope marker and
would publish an entry point that fails at runtime, and say CommonJS support "should return once the shared build emits scope
markers or the package is bundled; that is a packaging decision for review." It is therefore a package-specific exception that
exists only because of the defect above. `package-metadata.ts` requires neither `main` nor a `require` condition, so the
schema permits the divergence and no validator flags it. (ADR-022's "47 packages" count is also stale: there are 54.)

### Packages in comity-development (verified)

The eight `@comity-dev/*` packages (`build`, `cli`, `dependency-rules`, `eslint-plugin`, `package-tools`, `schemas`,
`semgrep-rules`, `validate`) have no `require` condition and no `dist/cjs` references in their `exports`. Four of them
(`build`, `cli`, `package-tools`, `validate`) declare `bin` entries. They are already single-ESM; this ADR records that as the
policy for them rather than changing them.

### Scope and rationale of ADR-022 (verified)

ADR-022 (Accepted) governs `@comity/cli` and `@comity/cli-commander`. Its dual-distribution paragraph states that "the CLI
architecture does not require CJS" and that dual distribution "is provided per repository convention"; it is "independent of
the repository-wide CJS compatibility contract. The existing 47 packages' dual ESM/CJS distribution remains unaffected."
The repository-wide convention is not written in an ADR. It appears only in descriptive documents:
`community/docs/architecture/repository.md` ("Dual ESM/CJS exports — `import` and `require` conditions"),
`community/SKILL.md` ("dual ESM/CJS bundles") and `community/docs/.documentation/AGENT.md` ("ESM and CommonJS entry conditions").
No standard, schema or validator rule requires a `require` condition (`package-metadata.ts` requires `type: module`,
`engines.node`, and `exports`). Superseding ADR-022's paragraph therefore removes a convention, not an architectural requirement.

### Runtime baseline

`runtime-support.md` §1 and every manifest declare Node `>=24.0.0`. Node 24 can load an ES module graph with `require()`
(`require(esm)`); that capability is not specific to Node 24 (it exists unflagged in earlier Node majors). The binding
constraint on Comity's `require` claim is its own `engines` floor, not a Node capability boundary at 24.

## Problem statement

1. The documented convention (dual ESM/CJS) is not what the published packages deliver: `require()` of a published package crashes, because the `dist/cjs` tree is evaluated as ESM.
2. A **working** dual build would be a worse design for this framework. Two physical builds mean two class definitions in
   one process. `BaseError` identity is checked with `instanceof` by `toSafePayload` and by `http-hono`, `http`, `auth`,
   `auth-jose`, `html` and `kernel`. Experiment: with a nested `{"type":"commonjs"}` marker (the obvious fix), `require` runs, but
   `require("@comity/primitives/errors").BaseError !== (await import("@comity/primitives/errors")).BaseError`, so an error
   created through one path fails `instanceof` through the other.
3. CommonJS-scoped declarations (`.d.cts` or a second type tree) would be needed to type the CJS path correctly.
4. The one package that avoided the defect did so by dropping `require` (a per-package exception), leaving the repository with
   two different export-map shapes for the same contract.

## Terminology (canonical)

Three different things must not be conflated. This ADR decides the first and the third and rejects the second.

| Capability | Policy |
|---|---|
| **ESM distribution** | Supported. Each package publishes a **single ESM build**; the JavaScript uses native `export`/`import` syntax |
| **CommonJS modules / builds** | **Not supported and not maintained.** No `dist/cjs`, no CommonJS-syntax output, no separate CommonJS entry point, no package-specific CommonJS exception. Comity is not "dual ESM/CJS" |
| **Node `require(ESM)` compatibility** | **Supported on Node 24+**, subject to Node's synchronous ESM loading rules. `require()` loads the package's **ESM** entry point; it does not load a CommonJS build. This is *compatibility*, not CommonJS support |

Illustration only (not authorisation to change any manifest; the existing `dist/esm` and `dist/types` layout is unchanged by this ADR) **[Amendment 1: the layout statement here is superseded by the flat `dist/` layout; the illustration's own `./dist/index.js` paths match the amended contract]**:

```jsonc
{
  "type": "module",
  "exports": {
    ".": {
      "import":  "./dist/index.js",   // ESM entry point
      "require": "./dist/index.js"    // the same ESM entry point, loaded by Node 24+ require(ESM)
    }
  }
}
```

`import` resolves to the ESM entry point; `require` resolves to the **same** ESM entry point; Node 24+ performs the ESM loading
through `require()`. The `require` condition names a resolution route, not a CommonJS artifact.

Limits of `require(ESM)`. It requires the whole module graph to load synchronously: a module using top-level `await` — in a package
or in any of its dependencies — cannot be loaded through `require()` (`ERR_REQUIRE_ASYNC_MODULE`). Compatibility therefore depends on the
package's actual dependency graph and runtime behaviour; it is not automatic for every ESM package. The Node 24+ requirement attaches to
`require(ESM)` (and to Node as the runtime), **not** to ESM consumption in general: consumers that `import` the package in browsers, Edge
or Workers runtimes carry no Node requirement from this ADR. Node runtime support and bundler resolution are separate matters; how a
bundler or non-Node runtime resolves the `require` condition or `main` is **unverified**.

Historical layout (what ADR-034 replaces). `dist/esm/index.js` and `dist/cjs/index.js` both existed, but the `dist/cjs` tree contained
CommonJS-**syntax** output (`exports`, `require`) emitted as `.js` files under a `"type": "module"` package, so Node evaluated it as
ESM and it failed (`exports is not defined in ES module scope`). It was never a functioning native CommonJS distribution, and the
old approach is not to be continued.

## Decision

1. **Universal policy: one ESM distribution for every Comity package.** All packages published under Comity governance —
   every `@comity/*` package in comity-community (including `@comity/cli` and `@comity/cli-commander`), every `@comity-dev/*`
   package, and any package published by a consuming repository under the Comity-wide policy (ADR-036) — ship a **single ESM
   build**. There is **no separate CommonJS build** and **no package-specific CommonJS exception**.
2. **One runtime implementation: the existing ESM build.** `comity-build` stops producing `dist/cjs` (the CommonJS pass in
   both build and watch mode). `dist/esm` and `dist/types` remain. **[Amendment 1: the output layout stated in this item and in item 3 is superseded by the flat `dist/` layout; the ESM-only decision itself is unchanged.]**
3. **Export-map strategy, uniform for every package.** For every exported subpath, `import` and `require` both resolve to the
   **same** `dist/esm` file and the **same** `dist/types` declaration:

   ```jsonc
   ".": {
     "import":  { "types": "./dist/types/index.d.ts", "default": "./dist/esm/index.js" },
     "require": { "types": "./dist/types/index.d.ts", "default": "./dist/esm/index.js" }
   }
   ```

   `main` becomes the ESM entry (`./dist/esm/index.js`); `module`, `types` and `typesVersions` are unchanged. **[Amendment 1: paths in this item are superseded: `main` is `./dist/index.js`, `types` is `./dist/index.d.ts`, the `module` field is dropped, and the two-condition shape above is replaced by `types` + `default`.]** Keeping both
   conditions preserves the current map shape and the `comity-normalize-package-json` condition order. A `types` + `default`
   collapse is equivalent and may be chosen at implementation time without changing this decision.
4. **`@comity/queue-pg-boss` is not an exception.** Its export map adopts the same shape (a `require` condition resolving to
   the same ESM file, and `main`), and its documentation that describes it as import-only is corrected at implementation. The
   exception's stated reason (a CommonJS tree that Node cannot load) no longer exists once no CommonJS tree is built. It is
   subject to the same validation requirements as every other package; if its `require` test fails, that is an implementation
   finding to resolve, not grounds for a new exception.
5. **CLI packages.** `@comity/cli` and `@comity/cli-commander` are ESM-only like every other package. Executables remain thin
   ESM entry points (`#!/usr/bin/env node` and `"type": "module"`), which Node 24 executes natively; no CLI package requires a
   CommonJS build. The `bin`-ownership rule of ADR-022 (the Application owns the executable) is unchanged.
6. **Runtime contract — three distinct statements, not one.**
   - **`import` (ESM-native):** the primary contract. Resolution and behaviour are unchanged by this ADR, in every environment
     that consumes ESM: Node, bundlers, Edge/Workers, browsers. Runtime claims for Edge/Workers and browser/client-only
     surfaces remain those of `runtime-support.md` §2/§3 and **do not depend on Node 24**.
   - **`require` (Node only):** supported only on Node.js **`>=24.0.0`**, matching `engines`, through `require(esm)`. Verified on
     Node 24.0.0, 24.4.0 and 24.19.0. No other runtime is claimed for the `require` condition.
   - **`engines.node`:** the baseline for Node runtimes and for tooling executing the packages in Node. It is not a requirement on
     Edge, Workers or browser runtimes, which do not execute through Node.
   - **`main` / `require` resolution outside Node is unverified.** Because `main` and `require` now point to ESM, a resolver that
     reads `main` rather than `exports` (older bundler configurations, `moduleResolution: node10`, some Workers build paths)
     receives ESM. This ADR makes no claim for that path outside Node. On acceptance, `runtime-support.md` §2 and §3 are scoped
     to the `import` condition and state that the `require`/`main` path is unverified outside Node; an optional bundler smoke
     build (Validation requirement 6) may narrow this, and is evidence, not a support claim.
7. **ESM graphs must stay synchronous.** `require(esm)` throws `ERR_REQUIRE_ASYNC_MODULE` for a module graph with
   top-level `await`. A test (to be written) must enforce this (Validation requirements).
8. **`require()` return shape.** `require(esm)` returns the module namespace; a module with a default export carries
   `__esModule: true`, `default`. Verified for `@comity/catalog/setup`: the shape `{ __esModule, default }` equals the previous
   TypeScript CommonJS emit.
9. **Preserved single identity.** With one build, `require` and `import` yield the same module instance and the same classes
   (`BaseError`), which is the property this decision exists to protect.
10. **Package contract wording.** Packages "expose ESM; Node 24+ `require()` resolves to the same ESM build". They do not
    "ship a CommonJS build". Standards and descriptive documents that say "dual ESM/CJS" are updated when this ADR is
    implemented (see roadmap §6); `runtime-support.md` §1 is worded as: "the supported range is Node ≥ 24 by `engines`;
    `require(esm)` is available in earlier Node majors, but Comity claims no runtime below its `engines` floor."

### Relationship to ADR-022

This ADR **supersedes in part** ADR-022 (following the `Supersedes:` convention of ADR-025). The superseded part is limited to the
paragraph "ESM-First Source with Dual ESM/CJS Distribution" and the Consequences lines that repeat it ("dual ESM/CJS
distribution is provided per repository convention"; "consistent with the repository dual-package convention"). The ESM-first
source, `"type": "module"`, package classification, dependency rules, Core and Adapter contracts and bin ownership of ADR-022
are unchanged, and ADR-022 remains Accepted. Because ADR-022's paragraph disclaims being the repository-wide contract, this ADR
**also** replaces the repository-wide dual-build convention in the descriptive documents listed in Context. ADR-022's historical
text is preserved: on acceptance it receives a pointer note and is otherwise not rewritten. **This ADR was Accepted on 2026-11-04;
ADR-022's conditional note has accordingly been converted to a definitive pointer, and ADR-022's original text remains the Accepted
record, unrewritten.** The superseding provisions are **not yet implemented** — `comity-build` still emits `dist/cjs` — and are
delivered by WP-B, which this acceptance does not authorise. **[Amendment 1: implementation status is updated below; this sentence records the state at acceptance.]**

## Amendment 1 — Flat `dist/` layout (implementation clarification)

> **Authority:** architecture-owner authorisation, 2026-11-04, to document the accepted implementation. This is an
> amendment to ADR-034, **not** a new ADR and **not** a reopening of the decision. ESM-only distribution, no CommonJS build,
> and `require(ESM)` compatibility on Node 24+ are unchanged. The original text above records the decision as accepted,
> including its statement that `dist/esm` and `dist/types` remain; that statement is **superseded as to layout only**, by the
> text below. The flat layout was **not** part of the original decision and this amendment does not claim it was.

**Current contract (supersedes the layout statements of Decision 2 and Decision 3):**

1. **ESM is the only distributed JavaScript module format.** No CommonJS build, no `.cjs`/`.cts` output and no
   package-specific exception (Decision 1, unchanged).
2. **One flat `dist/` directory.** `comity-build` emits runtime JavaScript and TypeScript declarations in a single compiler
   pass directly under `dist/`; a JavaScript module and its declaration sit side by side (`dist/index.js` next to
   `dist/index.d.ts`, `dist/errors/index.js` next to `dist/errors/index.d.ts`).
3. **No separate output trees.** There is no `dist/esm`, no `dist/types` and no `dist/cjs`. `comity-build` removes `dist/`
   before every build, so a repeated build cannot leave an obsolete tree behind.
4. **Declarations are `.d.ts`.** Packages are `"type": "module"`, so `.d.ts` files are ESM-scoped; no `.d.mts` or `.d.cts`
   files are emitted.
5. **Exports use `types` and `default`.** Each exported subpath is
   `{ "types": "./dist/<subpath>/index.d.ts", "default": "./dist/<subpath>/index.js" }`, with an environment condition (for
   example `node`) between them where a package genuinely needs one (`@comity/html-react` and `@comity/html-preact`
   `./streaming`). `main` is `./dist/index.js`, `types` is `./dist/index.d.ts`, the `module` field is not used, and
   `typesVersions` entries point at the flat declaration paths. `types` is first and `default` is last, because Node and
   TypeScript resolve conditions in object order.
6. **Separate `import` and `require` branches are not required** when both would resolve to the same ESM file. Node's
   `require` resolves through the `default` condition to the same file as `import`, so Decision 9 (one module instance, one
   set of classes) holds. This is the "`types` + `default` collapse" that Decision 3 already allowed at implementation time.
7. **`require(ESM)` is supported on Node 24+, subject to Node's synchronous module-graph limitation.** A graph containing
   top-level `await` fails with `ERR_REQUIRE_ASYNC_MODULE` (Decision 7, unchanged). This is `require(ESM)` compatibility and
   **not** universal CommonJS compatibility; Comity makes no CommonJS promise.
8. **Intentional package-specific export restrictions are preserved.** The set of public subpaths of every package is
   unchanged by the layout.

**Unchanged by this amendment:** Decisions 1, 4–10, the alternatives considered, the relationship to ADR-022, the semver
proposal (patch; see ADR-033 for the peer cascade that a non-patch release of a peered package would trigger), and the
validation requirements, except that "uniform `import`/`require` shape" in Validation requirement 5 reads "uniform
`types`/`default` shape" and every `dist/esm`/`dist/types` path in this document reads as the flat path.

**Implementation status (2026-11-04):** implemented and released in comity-development (`@comity-dev/build@0.3.0`,
`@comity-dev/package-tools@0.2.1`) and comity-community (54 package manifests; `@comity/primitives@0.9.2`,
`@comity/order@0.9.2`, `@comity/cli@0.9.2`, `@comity/cli-commander@0.9.2`, `@comity/queue-pg-boss@0.10.1`). Verified on
all 54 published tarballs (123 export subpaths; flat `dist/` only; every export target present) and in clean consumers on
Node 24.19.0 and 24.0.0 (`import` and `require(ESM)` resolve to the same file and the same export identity; zero Node
warnings), including `@comity/queue-pg-boss` and both CLI packages. A TypeScript clean-consumer fixture over the published
package set used for requirement 4 (18 subpaths across eight packages) passes under `nodenext` and `bundler` (`.mts`) and
`nodenext` (`.cts`) with `skipLibCheck: false`; the `node16` (`.cts`) leg fails with TS1479 as documented. **WP-B
completion ratification by the architecture owner and semver-class confirmation by the release owner remain pending.**
The text above under "Relationship to ADR-022" records the state at acceptance.

## Alternatives considered

| Alternative | Runtime `require` | Types for CJS | Same class under `require` and `import` | Rejected because |
|---|---|---|---|---|
| **Nested `dist/cjs/package.json` (`type: commonjs`)** | works | still ESM-scoped `.d.ts` (TS1479 under `node16`) | **no** (verified) | Reintroduces two classes in one process; the identity failure this work removes |
| **`.cjs` extensions** | works | needs `.d.cts` | no | `tsc` cannot emit `.cjs` from `.ts` without a renaming and specifier-rewriting post-processor; same dual-class hazard |
| **Remove the `require` condition (declare `require()` unsupported)** | `ERR_PACKAGE_PATH_NOT_EXPORTED` | n/a | n/a | Removes a capability consumers may expect when a working, cheaper path exists. This is what `queue-pg-boss` did locally; as a repository policy it would leave Node CJS consumers without support |
| **Keep a CJS exception for the CLI packages** | works only if the CLI keeps a second build | needs `.d.cts` | no | ADR-022 itself states the CLI architecture does not require CJS; a CLI exception preserves a second build and the dual-class hazard for no stated need |
| **Bundled dual output (tsup/esbuild)** | works | needs dual declarations | no, unless state is externalised | Adds a build dependency and a second implementation |
| **Keep the status quo** | crashes | wrong | n/a | The defect |

## Consequences

**Positive:** `require()` callers on Node 24+ (including CommonJS-syntax consumer code) work for the first time, through `require(ESM)`; one runtime copy, one `BaseError` class; one
declaration tree; one build pass fewer; smaller tarballs; one export-map shape for all packages (no `queue-pg-boss` divergence).

**Negative / trade-offs:**

- A TypeScript consumer in a CommonJS file under `moduleResolution: node16` still gets TS1479, because `node16` does not
  model `require(esm)`. `nodenext` is required for TypeScript code that Node runs as CommonJS (verified); `bundler` is
  validated in the acceptance fixture, not claimed here. `moduleResolution: node` (node10) ignores `exports` and resolves
  through `main`/`types`/`typesVersions`; it is not separately verified here.
- Top-level `await` becomes forbidden in any entry graph.
- Consumers on Node < 24 are outside the supported range (already the case through `engines`).

**Limitations (not claimed):** bundlers (webpack, Rollup, esbuild, Vite), Deno, Bun, Cloudflare Workers and other non-Node
runtimes were **not** tested for the `require` condition or for `main`. A bundler that previously parsed `dist/cjs` by syntax may
have worked unobserved; after this change it receives the ESM build. ESM `import` resolution is unchanged, so the `import`-path
claims of `runtime-support.md` §2/§3 are unaffected; they are scoped to that condition on acceptance (Decision 6).

## Compatibility and migration

- **ESM consumers:** unchanged files and types.
- **Node `require()` callers (including CommonJS-syntax consumer code):** failing → working on Node 24+, via `require(ESM)` loading the ESM entry point; no CommonJS build is involved.
- **Deep imports of `dist/cjs/...`:** already unreachable through `exports`; resolvers that ignore `exports` and read `main`
  receive the ESM entry.
- **`@comity/queue-pg-boss`:** gains the `require` condition and `main`, previously absent. This is additive and makes a
  previously failing entry resolvable (`ERR_PACKAGE_PATH_NOT_EXPORTED` today).
- **Semver (proposed):** **patch** for all packages — it makes a documented behaviour work and removes no working behaviour.
  Confirm at acceptance; also see ADR-033: shipping a *peered* package's change as a minor would trigger the peer-dependent
  major cascade documented there. (`queue-pg-boss` is not peered; its class may be confirmed separately.)
- **Release:** independent of ADR-033. If both are ready they may share one coordinated patch release; otherwise this ships
  alone. The decision is recorded in the roadmap and made by the release owner.
- **Migration steps (future implementation task, WP-B):** remove the CJS pass in `comity-build` (build and watch); rewrite
  `require.default` and `main` in each package, including `queue-pg-boss`; remove `dist/cjs` from outputs; correct the
  descriptive documents and `queue-pg-boss`'s own `docs/overview.md`/`docs/conventions.md`; add the tarball tests below.

## Validation requirements

Run against **packed tarballs installed in a clean consumer**, on Node 24.0.0 and the current 24.x:

1. For **every** package (including `@comity/cli`, `@comity/cli-commander` and `@comity/queue-pg-boss`) and every `exports`
   subpath: a `.cjs` file `require`s it and its export keys equal the ESM namespace's.
2. `require("@comity/primitives/errors").BaseError === (await import(...)).BaseError`; a `PricingError` obtained via `require`
   passes `instanceof` against the imported `BaseError`.
3. No entry throws `ERR_REQUIRE_ASYNC_MODULE`; no `ExperimentalWarning` on stderr.
4. TypeScript fixture, `skipLibCheck: false`: an `.mts` file passes under `nodenext` and `bundler`; a `.cts` file passes under
   `nodenext`; a `.cts` file under `node16` is documented as unsupported.
5. The tarball contains no `dist/cjs/`, every `exports` target exists in the tarball, and no package lacks the uniform
   `import`/`require` shape of Decision 3 (this check is the tarball validation of ADR-035; it does not exist yet).
6. Optional: one bundler smoke build, covering at least one browser/client-only surface of `runtime-support.md` §3. It is
   evidence, not a support claim, unless the result is recorded.

### Validation evidence already gathered (2026-11-04, scratchpad experiments, not repository artifacts)

- Published 0.9.0 and 0.9.1: `require` crashes (above).
- Variant "serve ESM to `require`", on copies of the published 0.9.1 packages: `require` works; `BaseError` identical.
- All **123** `exports[*].import` entries of all **54** local packages load via `require()` on Node 24.0.0, 24.4.0 and 24.19.0,
  with no top-level-await failure and **0 bytes** on stderr (no warnings). An independent review reproduced the runtime claims
  (crash today, identity under the proposal, `ERR_REQUIRE_ASYNC_MODULE`, zero stderr) on Node 24.19.0.
- Not verified: bundlers; Node versions other than the three above; `moduleResolution: bundler` under the fix; non-pnpm
  managers; `@comity/queue-pg-boss` under `require` (its own `import` entry is among the 123).

## Dependencies on other decisions

- Supersedes ADR-022 in part (above). Independent of ADR-033, ADR-035, ADR-036 for acceptance.
- ADR-035's declaration validation covers `types` targets of both conditions; with this decision they are identical. Its tarball
  validation (Decision 6 there) is what would enforce Validation requirement 5.
- ADR-036: the Comity-wide policy applies this ADR to packages published by consuming repositories. The `require` leg of the
  clean-consumer verification is unconditional once this ADR is accepted (a consumer package follows the same contract), rather
  than conditional on any CommonJS promise (Comity makes none; the leg tests `require(ESM)` compatibility).
- Requires, when this ADR is implemented: `runtime-support.md` §1 (wording above) and §2/§3 (scoped to the `import` condition).

## Acceptance status and remaining questions

**Accepted 2026-11-04** by Comity maintainer decision (see Provenance). No architectural question about this ADR's content
remains open: the distribution contract, its universality and the `queue-pg-boss` treatment are decided (D-02) and confirmed.

One **sequencing** decision outside this ADR has been **CONFIRMED** — resolution record **A1** (architecture owner, 2026-11-04): **WP-B must
be complete before the first Commerce package is published.** **No Commerce package may be published before WP-B is completed**; WP-B must
ensure the Commerce packages use the ESM-only distribution model this ADR requires; and packaging and toolchain compatibility must be
verified before the first publication. It was **not** decided by this ADR's acceptance — it is a separate architecture-owner decision, and
**it does not authorise WP-B**, which still requires its own authorisation under the B10 responsibility model. It blocks only the Commerce
first-publication milestone and shapes the design of WP-D3's `require` leg; it does not block WP-A, WP-B or WP-C from starting.

### Confirmed at acceptance

1. Formal acceptance of this ADR, including the **partial supersession of ADR-022** (see "Relationship to ADR-022"). ADR-022's
   conditional note has been converted to a **definitive pointer** and its historical text preserved; ADR-022 remains `Accepted`.
   **Acceptance authorises no work package:** WP-B requires its own implementation authorisation.

### Decided at release time — not a precondition of acceptance

2. **Semver class** (patch proposed; `queue-pg-boss` is not peered and may be classed separately). Authority: maintainers /
   release owner (roadmap §8.3). Required **before WP-B's release**, not before this ADR is accepted. See ADR-033: shipping a
   *peered* package's change as a minor would trigger the peer-dependent major cascade.

### Implementation choices — WP-B, not acceptance questions

3. Keep both `import`/`require` keys, or collapse to `types`/`default`. Decision 3 states the two are equivalent and that the
   collapse may be chosen at implementation time without changing the decision; the `comity-normalize-package-json` condition
   order must be preserved either way.
4. Whether to run the optional bundler smoke build (Validation requirement 6). It is evidence, not a support claim; the
   `runtime-support.md` §2/§3 scoping does not depend on it.

Resolved by the architecture owner (D-02): universality of the ESM-only policy including the CLI packages; the `queue-pg-boss`
treatment (no exception). WP-B completion ratification and the release semver class remain pending; the ADR itself is accepted.

## References

ADR-022 (superseded section); ADR-025 (supersession convention); `development/docs/standards/runtime-support.md`;
`community/docs/architecture/repository.md`; `community/packages/queue-pg-boss/docs/overview.md`;
`development/packages/build/src/bin/comity-build.ts`; `development/packages/schemas/src/schemas/package-metadata.ts`; ADR-033; ADR-035; ADR-036.

## Scope

This ADR decides the distribution format and export-map strategy. It changes no build configuration, export map or package.
