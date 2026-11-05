# DESIGN — `declaration-dependencies` validation engine

**Status:** Draft — pending review. Accompanies **ADR-035** (`Accepted` 2026-11-04). Design only: nothing in this document is implemented, and ADR-035's acceptance does **not** authorise WP-C1/C2/C3. Rule names and codes below remain proposed and are fixed at implementation.
Revised 2026-11-04 for architecture-owner decisions D-03 (two stages), D-04 (deterministic discovery) and D-05 (output).
Stage 1 (§1–§11) is the workspace declaration engine; stage 2, packed-surface validation, is specified in §12.
**Owner:** `@comity-dev/validate` (comity-development). **Date:** 2026-11-04.

This document specifies the engine decided in ADR-035 in enough detail for a later, separately authorised implementation task.
It documents proposed engines, not current behaviour; the package README must not describe them until they exist. In particular
the validator **does not currently inspect tarballs** and **does not currently use name-agnostic discovery**.

## 1. Responsibility

For every discovered package, verify that every **external module reference reachable from the package's published type
entry points** is satisfied by the package's published dependency declarations, so that a consumer's compiler can resolve it.

It does **not**: resolve external packages' installed contents; check runtime imports (ESLint/dependency-cruiser own that);
check file lists or tarballs; detect duplicate installed copies (consumer verification, ADR-036); check layering (ADR-008).

## 2. Placement and integration (verified against the current code)

| Concern | Change |
|---|---|
| New file | `src/engines/declaration-dependencies.ts` exporting `runDeclarationDependencies(repo: Repository): EngineResult` (synchronous, like `runAdapterPeers`; file reads via `node:fs`) |
| `src/run.ts` | Add `declarations: CategoryResult` to `RunResult["categories"]`; run it when `!only \|\| only === "declarations"` (alias `declaration-dependencies`); add its result to `violations` and to the `allExecuted` list |
| `src/format.ts` | Add the category to the label map (`adapterPeers: "Adapter peers"` is the model) and to both iteration paths |
| `src/bin/comity-validate.ts` | Add `declarations` to `--only` help text and the doc comment |
| Tests | `src/engines/__tests__/declaration-dependencies.test.ts` (convention: `engines/__tests__/adapter-peers.test.ts`, `semgrep.test.ts`) |
| `package.json` | Move `typescript` from `devDependencies` to `dependencies` (`^5.9.3`); no other new dependency |
| Stage | After `pnpm build` (Community CI: build → type-check → validate; development `self-validate` builds first) |

**Discovery (D-04).** The existing `discover.ts` supplies `Repository.packages[]` = `{ name, path, layer, manifest }` but
**skips any package not named `@comity/*` or `@comity-dev/*` without a diagnostic**, so a repository with another namespace would
be discovered empty and pass. The new categories therefore use a **separate discovery function** (`discoverPublishablePackages`,
proposed name) that: reads `comity.config.json` `packages.roots` (default `packages`, and says when the default was used);
enumerates every directory under each root with a readable `package.json`, sorted by path; applies **no name filter**; excludes
`"private": true` packages **with a recorded reason**. Zero-package semantics (ADR-035 Decision 5; deterministic from configuration):
roots that resolve to no package directory → **`CONFIGURATION-ERROR`** (exit 2, reason naming the roots; never PASS; an empty scope
is not supported by the config schema, which requires `minItems: 1`); packages present but all private → **`NOT-APPLICABLE`** with a
reason listing them, printed in normal output. The existing engines keep the current discovery until a separate review, because their
classification (ADR-026) assumes it. If name-agnostic discovery proves unsafe, the smallest explicit alternative is a recorded
list (`packages.include`) in `comity.config.json`; the hard-coded prefix is not the fallback. The Commerce package namespace is
not decided here. On the current trees the new discovery yields the same sets (community 54, development 8).

## 3. Inputs and outputs

**Inputs:** the `Repository` handle; for each package, `manifest` fields `name`, `exports`, `types`, `typesVersions`,
`dependencies`, `peerDependencies`, `peerDependenciesMeta`, `devDependencies`; the files under the declared `types` targets.

**Output:** an `EngineResult` (`tool: "declarations"`), `status: "PASS"` or `"FAIL"` (`"CONFIGURATION-ERROR"` for a missing build,
see §9), `executed: true` for a run that inspects declarations, with one `Finding` per violation (see §8). Findings are sorted by
package name, then file path, then specifier. A repository with no discovered package, or a package with no `types` entry, produces
no finding for that package. A package that declares a `types` target that does not exist produces a `CONFIGURATION-ERROR` (no finding).

## 4. Algorithm

For each package `P`:

1. **Entry points.** For each key `K` of `exports` (including `"."`), collect every string value reachable under **any**
   condition (`types`, `import`, `require`, `default`, nested) whose path ends in `.d.ts`, `.d.mts` or `.d.cts`. Add the top-level
   `types` string, and every target in `typesVersions`. Normalise paths relative to `P.path`. Keep the mapping
   `entryKey → {declaration files}`. Entries whose values are not declarations (for example `./package.json`) are ignored.
   If a declared declaration target does not exist on disk → `CONFIGURATION-ERROR` for `P` (see §9); stop analysing it.
2. **Reachability.** For each entry, breadth-first traverse **relative** references starting at its declaration file(s):
   `import`/`export … from`, `import x = require()`, `import("./x")` type nodes, `/// <reference path="./x" />`. Resolve a relative
   specifier `s` against the referencing file by trying, in order: `s` with a trailing `.js`/`.mjs`/`.cjs` replaced by
   `.d.ts`/`.d.mts`/`.d.cts`; `s + ".d.ts"`; `s + "/index.d.ts"`. An unresolvable relative reference is reported as `ARCH-DECL-DEP-000`
   (a broken internal declaration graph). Track, per file, the set of entry keys that reach it. Cycles are broken with a visited set.
3. **Extraction.** Parse each reachable file once with `ts.createSourceFile(file, text, ScriptTarget.Latest, true)` (no
   `Program`, no type checking, no installed-package resolution). Collect:
   - `ImportDeclaration` / `ExportDeclaration` with a string `moduleSpecifier`;
   - `ImportEqualsDeclaration` with an `ExternalModuleReference` (`import x = require("m")`);
   - `ImportTypeNode` with a string-literal argument (`import("m").T`; `tsc` inlines these into `.d.ts`);
   - `/// <reference types="m" />` directives (`sourceFile.typeReferenceDirectives`);
   - `ModuleDeclaration` with a string name **only when the file is a module** (has a top-level import/export), because then it is
     an augmentation that must resolve. In a script file `declare module "m" { … }` *declares* an ambient module and is not a
     dependency.
4. **Classification of each non-relative specifier `s`.** Let `pkgName(s)` = the first two segments for `@scope/name…`, else the first segment.
   - `s` starts with `node:` or `s` ∈ `module.builtinModules` → **allowed** (platform).
   - `pkgName(s) === P.name`: a **self-reference**; the subpath must match an `exports` key of `P` (exact, or a pattern key
     containing `*`); otherwise `ARCH-DECL-DEP-004`. Self-references are never dependency findings.
   - Declared-for-consumers set `D` = `dependencies ∪ peerDependencies` keys. `pkgName(s)` ∈ `D` → allowed, **unless** it is an optional peer
     (`peerDependenciesMeta[p].optional === true`) and not also in `dependencies`: then allowed only if **no** entry point that reaches the
     file is the root entry `"."`; otherwise `ARCH-DECL-DEP-003`.
   - `@types/<mapped>` ∈ `D`, where `<mapped>` is `name` for unscoped and `scope__name` for `@scope/name` → allowed.
   - `pkgName(s)` ∈ `devDependencies` and not in `D` → `ARCH-DECL-DEP-002`.
   - otherwise → `ARCH-DECL-DEP-001`.
5. **Same-repository sibling subpaths.** If `pkgName(s)` is a package in `repo.packages` and `s` has a subpath, the subpath must match an
   `exports` key of that package (exact or `*` pattern); otherwise `ARCH-DECL-DEP-005`. External packages' subpaths are **not** resolved.
6. **Deduplicate** findings per (package, file, specifier, rule); report the first entry key that reaches the file.

### Ownership and subpath resolution

Package ownership is textual (`pkgName`), never by filesystem walk or installed state. This keeps the engine deterministic and
independent of `node_modules`. The cost is that a misspelled external subpath is not detected; the clean-consumer
compilation (ADR-036) covers it.

## 5. Handling the specified classes

| Class | Treatment |
|---|---|
| `dependencies` | satisfies |
| `peerDependencies` (required) | satisfies |
| optional peer | satisfies only when every reaching entry is a non-root subpath; `-003` if reachable from `"."` |
| `devDependencies` only | `-002` |
| Node built-ins | allowed (no declaration needed in this engine) |
| relative declarations | followed for reachability; never reported |
| `import type` / inlined `import("m").T` / `declare module` / `reference types` | all counted: they are retained in the emitted `.d.ts` |

Not specified by the approved direction and left as **open items**: `optionalDependencies` and `bundledDependencies`. Proposed
default: they do **not** satisfy a reference (reported as `-001`, with a message naming the field), because installation is not
guaranteed. No current Comity package uses either.

## 6. False-positive control

- Only reachable declarations are inspected (stray emitted files are ignored).
- Script-file ambient `declare module` is not a dependency (see §4.3).
- Built-ins, self-references and `@types/*` equivalence are explicit.
- Test-only or dev-only types not reachable from an entry point are not reported.
- Prototype baseline: zero findings on the current build; the implementation must reproduce that (§10 regression test).

## 7. Known limits

- Ambient globals used without an import (`Buffer`, `NodeJS.*`) are invisible to specifier extraction. None exist in current declarations
  (the only textual hits are JSDoc comments).
- `node:*` references are allowed without checking that consumers have `@types/node`; this is an environment property.
- Duplicate **installed** copies and version-range correctness are graph properties, not manifest properties.
- `/// <reference lib="…">` directives are not analysed (ignored).

## 8. Error reporting

Each finding satisfies ADR-010 ("rule, package, edge, source document, remediation"). `Finding` fields: `tool: "declarations"`,
`rule`, `package`, `file` (path relative to the package), `keyword` (the specifier), `severity: "error"`, `source: "ADR-035"`,
`message`, `remediation`.

| Rule | Message (template) | Remediation |
|---|---|---|
| `ARCH-DECL-DEP-000` | `Package "{pkg}" has an unresolvable relative reference "{path}" in declaration "{file}" (reached via entry "{entry}"); the built declaration graph is broken` | Rebuild the package, or fix the relative import so it resolves to an emitted declaration |
| `ARCH-DECL-DEP-001` | `Package "{pkg}" exposes "{spec}" in published declarations ({file}, via entry "{entry}") but declares "{owner}" in neither dependencies nor peerDependencies` | Add `{owner}` as a peerDependency (nominal or shared types) or a dependency (private structural types) |
| `ARCH-DECL-DEP-002` | `… "{owner}" appears in published declarations but is only a devDependency; consumers get TS2307, or 'any' under skipLibCheck` | Move or add it to peerDependencies or dependencies |
| `ARCH-DECL-DEP-003` | `… optional peer "{owner}" is reachable from the root entry "."; consumers without it get unresolved types` | Make the peer required, or move the reference behind an opt-in subpath |
| `ARCH-DECL-DEP-004` | `… references "{spec}", which is not an exported subpath of "{pkg}"` | Export the subpath or fix the import |
| `ARCH-DECL-DEP-005` | `… references "{spec}", which is not an exported subpath of "{owner}"` | Import an exported subpath |

## 9. Behaviour on failure and output

Findings make the category fail (exit code `1`). A missing build — a declared `types` target that does not exist on disk — is not
a finding: the engine returns `status: "CONFIGURATION-ERROR"`, `executed: false`, `passed: false`, no findings, and a `reason`
naming the package and the missing target. `exitCodeForResult` maps `CONFIGURATION-ERROR` to exit code `2` (the existing
"configuration / discovery error (cannot run)" code in `exit-codes.ts`), so a missing build can never pass silently. `NOT-RUN` is
not used for this condition. Roots resolving to no package directory are also `CONFIGURATION-ERROR` (§2).

**Precedence.** Exit code 2 takes precedence over exit code 1 when configuration and validation errors both occur (this is the
existing `exitCodeForResult` behaviour).

**Findings are always visible (D-05).** Today `src/bin/comity-validate.ts` prints violations only when `--verbose` is set
(`if (!result.passed && args.verbose)`), for every category; a run that exits 2 therefore currently prints no violation detail by
default. The design requires that **all detected findings are printed in normal output**, with `--verbose` adding detail only, and
that the output states when exit 2 co-occurs with findings. This is a CLI-wide change (all categories) and a **new
implementation task**; the comment for code 2 in `exit-codes.ts` is amended to "may co-occur with violations". Nothing here is
implemented.

## 10. Test plan

Fixtures are created in temporary directories (`mkdtempSync(join(tmpdir(), "comity-decl-test-"))`), writing a `package.json` and
declaration files; the `Repository` handle is built as in `adapter-peers.test.ts`.

**Positive (no findings):** `import type { X } from "dep"` with `dep` in `dependencies`; required peer; `@types/foo` in `dependencies` for a reference to `foo`;
`@types/scope__name` for `@scope/name`; `node:fs/promises`; a self-reference to an exported subpath; an optional peer referenced only from `./redis`;
an unreachable `.d.ts` importing an undeclared package; a script-file `declare module "m" {}`; a relative cycle; a `*` pattern export matched by a self-reference.

**Negative:** `import type` of a devDependency (`-002`); `import("x").T` of an undeclared package (`-001`); `declare module "x"` augmentation in a module file (`-001`);
`/// <reference types="x" />` (`-001`); optional peer reachable from `"."` (`-003`); self-reference to a non-exported subpath (`-004`); a sibling subpath not exported
(`-005`); an unresolvable relative reference (`-000`); a package listed only in `optionalDependencies` (`-001`, proposed default).

**Configuration error:** a declared `types` target that does not exist produces `status: "CONFIGURATION-ERROR"` (no finding), and
`exitCodeForResult` maps it to exit code `2` — never a pass.

**Mixed run:** a declarations finding plus an unrelated `CONFIGURATION-ERROR` exits 2 **and** prints the finding without `--verbose`.
**Discovery:** a repository with an arbitrary package namespace is fully discovered; roots resolving to no packages is `CONFIGURATION-ERROR`;
all-private is `NOT-APPLICABLE` with a listed reason; private packages are excluded with a reason.
**Determinism:** two runs produce identical, sorted findings. **Integration:** `runValidation({ only: "declarations" })` returns the new category;
`exitCodeForResult` maps a failing declarations result to `1` and a `CONFIGURATION-ERROR` result to `2`.

**Regression (required by ADR-035):** against the current comity-community build the engine returns **zero** findings, matching the prototype
(54 packages, 537 declaration files, 443 external references). The baseline counts were independently reproduced from committed build
output; that reproduction was a textual superset (all files) and cannot discriminate the reachability filter or exercise
`-003`/`-004`/`-005`. The regression test therefore reports the **total** emitted file count and the **entry-reachable** file count
separately (recording explicitly if they are equal) and is justified as rule-set coverage. If the implementation reports any
finding, it is investigated before any severity change.

## 11. Open items for reviewers

1. `optionalDependencies` / `bundledDependencies` handling (§5).
2. Whether `--only` accepts both `declarations` and `declaration-dependencies`.
3. ~~Whether a later rule should verify that every reachable declaration file is included by the package's `files` field~~ — resolved
   by D-03: that is stage 2 (§12), not stage 1.
4. ~~How stage 2 reads tarball contents~~ — resolved in WP-C3 (decision **C1**): `pnpm pack` produces the tarball, the system `tar`
   lists and extracts it, and no new dependency is added (§12, "Implementation notes").
5. ~~Zero-package status~~ — settled as an implementation contract (ADR-035 Decision 5).

## 12. Stage 2 — packed-surface (tarball) validation (implemented in WP-C3; enforcement gated)

**Responsibility.** Validate the **actual published package surface**: the tarball produced by `pnpm pack` for each publishable
package, after build and before publication, in the **producer repository**. This is where the effect of the package `files` field,
`exports` and the packed manifest (after `workspace:` rewriting) becomes observable; stage 1 cannot see it.

**Inputs.** For each package from the discovery of §2: the tarball (file list and contents) and the packed `package.json` read **from
the tarball**. The working-tree `dist` is never read by stage 2.

**Checks (proposed codes; fixed at implementation).**

| Rule | Condition |
|---|---|
| `ARCH-PACK-001` | A target of `exports` (any condition), `main`, `module`, `types`, `typesVersions` or `bin` is **absent from the tarball** |
| `ARCH-PACK-002` | A relative declaration reachable from an entry is absent from the tarball |
| `ARCH-PACK-003` | Umbrella marker: the external-reference check of §4 was run on the tarball; the specific `ARCH-DECL-DEP-001…005` code identifies the violation, evaluated against the **packed manifest's** `dependencies`/`peerDependencies` |
| `ARCH-PACK-004` | The packed manifest contains `workspace:`, `file:` or `link:` in a dependency field |
| `ARCH-PACK-005` | A sibling dependency/peer is an exact pin without a recorded exception (ADR-033) |
| `ARCH-PACK-006` | ESM-only conformance (ADR-034): `dist/cjs/` present in the tarball, or `import` and `require` do not resolve to the same ESM artifact |

**Failure behaviour.** Same as §9: a failed `pnpm pack` or an unreadable tarball is `CONFIGURATION-ERROR` (`executed: false`,
`passed: false`, no finding, exit 2); an unavailable required tool follows the existing `TOOL-UNAVAILABLE` / exit 3 semantics;
findings are always printed.

**Not responsibilities of stage 2:** installing in a consumer, compiling consumer code, runtime identity, duplicate installed copies,
`strict-peer-dependencies`. Those belong to the **clean-consumer verification** (ADR-036 §4b), which runs in a fresh directory and
does **not** invoke this validator (it could discover nothing there).

**Integration.** A new category `packed-surface` in `RunResult["categories"]`, run when `!only || only === "packed-surface"`, added to
`violations` and to the `allExecuted` list (omission would silently pass), plus `format.ts` label and `--only` help. Stage 2 is
slower (it packs every publishable package) and runs before publication, not on every commit.

**Tests (at minimum).** An export target excluded by `files` → `-001`; a declaration excluded by `files` → `-002`; a dev-only
reference in a packed declaration → `ARCH-DECL-DEP-002`; `workspace:` in the packed manifest → `-004`; an exact sibling pin → `-005`;
`dist/cjs/` present → `-006`; failed pack → `CONFIGURATION-ERROR` exit 2.

**Implementation notes (WP-C3, 2026-11-05).**

*Tarball-reading mechanism (decision C1).* `pnpm pack --pack-destination <tmp>` produces the tarball in an isolated temporary
directory, and the system `tar` (`-tzf` to list, `-xOf` to extract a single member) reads it. **No new dependency.** `pnpm` is
already required by every producing repository and by the release workflows, and `pnpm pack` is the exact operation the release
performs, so the artifact under test is the artifact that would ship. `tar` is present on every supported CI image and avoids
adding a parser with its own security surface. The trade-off — a POSIX `tar` requirement — is reported as `TOOL-UNAVAILABLE`
(exit 3) when absent, exactly like `semgrep`. Entry names are validated before use: absolute paths, `..` traversal and members
outside the `package/` prefix are refused as `CONFIGURATION-ERROR`.

*`ARCH-PACK-003` is an umbrella marker, not an emitted finding.* Its condition is "the external-reference check of §4 was run on
the tarball"; emitting a finding for it would fail every package. The engine therefore performs that check (classification of
every external reference in the packed declarations against the **packed** manifest) and reports violations under their specific
`ARCH-DECL-DEP-001…005` code, while the run notes state that the packed-manifest external-reference check ran. This is exactly
what the stage-2 test expectations above describe (a dev-only reference in a packed declaration yields `ARCH-DECL-DEP-002`).

*`ARCH-PACK-005` exceptions* follow ADR-033 §4: a recorded justification in the package's `docs/conventions.md`. The engine accepts
a line that names the sibling and records an exception or justification; no machine format is imposed because ADR-033 does not
define one.

*Integration and enforcement.* The category is registered in `RunResult["categories"]` (`packedSurface`), in `format.ts` and in the
CLI help, and it runs when `--only=packed-surface` is selected. It is **deliberately not part of the default run**: it packs every
publishable package and it is a pre-publication check, so making it part of every `validate` invocation would slow every commit and
would have failed on the WP-A1/WP-A4 `workspace:*` exact pins that `pnpm pack` produced before those migrations. Both release
workflows run `validate:packed-surface` after `Build` and before the Changesets `Release` step, report-only until the repository variable
`COMITY_PACKED_SURFACE_ENFORCEMENT` is `true`. That variable is the enforcement activation lever and is **set in both repositories since
2026-11-05**, after WP-A1, WP-A4 and WP-B were complete and each stage-2 run reported 0 findings; the workflows branch on it, so no
workflow change was needed and local CLI behaviour is unchanged.

*Tests.* `packages/validate/src/engines/__tests__/packed-surface.test.ts` packs real tarballs for every rule (positive, negative,
multiple violations, determinism, failed pack, exit codes) and covers the two cases `pnpm pack` cannot produce — an unrewritten
`workspace:` specifier and a corrupted tarball — through `packedDependencySpecifierFindings` and `readTarball`.
