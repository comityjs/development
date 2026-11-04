# DESIGN — `declaration-dependencies` validation engine

**Status:** Draft — pending review. Accompanies **ADR-035** (Proposed). Design only: nothing in this document is implemented.
**Owner:** `@comity-dev/validate` (comity-development). **Date:** 2026-11-04.

This document specifies the engine decided in ADR-035 in enough detail for a later, separately authorised implementation task.
It documents a proposed engine, not current behaviour; the package README must not describe it until it exists.

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

`discover.ts` already supplies `Repository.packages[]` = `{ name, path, layer, manifest }`; the engine needs nothing more.
It deliberately skips packages not named `@comity/*` or `@comity-dev/*` (as `discover.ts` does today).

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

## 9. Behaviour on failure

Findings make the category fail (exit code `1`). A missing build — a declared `types` target that does not exist on disk — is not
a finding: the engine returns `status: "CONFIGURATION-ERROR"`, `executed: false`, `passed: false`, no findings, and a `reason`
naming the package and the missing target. `exitCodeForResult` maps `CONFIGURATION-ERROR` to exit code `2` (the existing
"configuration / discovery error (cannot run)" code in `exit-codes.ts`), so a missing build can never pass silently. `NOT-RUN` is
not used for this condition.

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

**Determinism:** two runs produce identical, sorted findings. **Integration:** `runValidation({ only: "declarations" })` returns the new category;
`exitCodeForResult` maps a failing declarations result to `1` and a `CONFIGURATION-ERROR` result to `2`.

**Regression (required by ADR-035):** against the current comity-community build the engine returns **zero** findings, matching the prototype
(54 packages, 537 declaration files, 443 external references). If the implementation reports any, it is investigated before any severity change.

## 11. Open items for reviewers

1. `optionalDependencies` / `bundledDependencies` handling (§5).
2. Whether `--only` accepts both `declarations` and `declaration-dependencies`.
3. Whether a later rule should verify that every reachable declaration file is included by the package's `files` field (not part of ADR-035).
