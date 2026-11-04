# ADR-035 — Published Declaration Dependency Validation

> **Provenance:**
> - Canonical owner: comity-development
> - Implementation owner: `@comity-dev/validate` (comity-development)
> - Raised by: Cross-Repository Dependency Policy Audit and Remediation Plan (Commerce / Comity boundary work, 2026-11-04)
> - Detailed engine design: `development/packages/validate/docs/declaration-dependencies-design.md`
> - Architecture-owner decisions D-03 (two validation stages), D-04 (deterministic discovery) and D-05 (configuration errors and finding visibility), 2026-11-04.
> - **Accepted:** 2026-11-04, by Comity maintainer decision, with **two explicit maintainer decisions**: (1) initial validator
>   finding severity is **`error`**; (2) `typescript` is a runtime **`dependency`** of `@comity-dev/validate`, at the range
>   established in Decision 14 (`^5.9.3`). The Decision 9 guard is **preserved**: the implementation must reproduce the
>   zero-finding baseline on the current build, and if it reports any finding, that finding is triaged first and the severity
>   decision is revisited. **Acceptance does not authorise WP-C1/C2/C3**; how stage 2 reads tarballs remains a WP-C3
>   implementation choice.

**Status:** Accepted

> **Implementation status.** **Nothing in this ADR is implemented.** `@comity-dev/validate` has no declaration engine, no
> tarball validation, and no deterministic package discovery; its current `discover.ts` filters by name prefix. Every behaviour
> below is **decided but not implemented** and requires new implementation (WP-C1, WP-C3), which this ADR's acceptance does not
> authorise.

## Context

TypeScript retains `import type` references in emitted `.d.ts` files, although the same imports are erased from JavaScript.
A package whose published declarations reference another package, but which lists that package only in `devDependencies`
(or not at all), gives its consumers an unresolved module.

Verified with pnpm 10.13.1 and TypeScript 5.9.3 on a stand-in library:

- consumer `skipLibCheck: false` → **TS2307** (cannot find module);
- consumer `skipLibCheck: true` (Comity's own `community/tsconfig.json` setting) → the unresolved import silently becomes `any`:
  `const y: number = total("not money")` compiles. Type safety is lost without a diagnostic.

Comity's validator already checks a related manifest property: `runAdapterPeers`
(`development/packages/validate/src/engines/adapter-peers.ts`, rules `ARCH-ADAPTER-PEER-001…005`) checks peer declarations
of Technology Adapters from manifests. No engine inspects built declarations or tarballs. The repository-level validator contract
(ADR-010, ADR-026) requires stable rule codes, the involved package and edge, a source document, and a remediation hint.

A read-only baseline scan of the local build (built 2026-10-31) found: **54 packages, 537 `.d.ts` files, 443 external module
references, 0 undeclared, 0 dev-only, 0 Node built-in, 0 optional-peer references**. The same scan over the published `primitives`,
`pricing`, `organization` and `order` 0.9.1 tarballs found 53 files, 34 references, 0 findings. **The counting baseline was
independently reproduced** from committed build output (54 / 537 / 443 / 0 / 0, all files dated 2026-10-31; only a documentation
file changed in `community` since). Limits, kept explicit: that reproduction is a textual superset (all 537 files, not only those
reachable from an entry point) and does not exercise rules `-003`, `-004`, `-005` (`@comity/cache-redis`, the only package with
optional peers, references neither in its declarations, so `-003` has zero candidates). The full rule-set result is therefore not
yet established; the regression test below is what establishes it.

Two properties the original draft overstated or left open:

- **Workspace `dist/types` is not the published artifact.** The `files` field (community manifests: `["./dist", "!./dist/**/*.map"]`)
  and `exports`/`typesVersions` determine what the tarball contains. A declaration present in the workspace but excluded from the
  tarball, or an `exports` target not shipped, is invisible to a workspace-only check.
- **Discovery is incomplete for non-`@comity/*` names.** `discover.ts` skips any package whose name does not start with `@comity/`
  or `@comity-dev/`, with no diagnostic. A repository whose packages use another namespace (the Commerce namespace is an open
  governance decision) would be discovered as empty and pass.

## Problem statement

Nothing prevents a package from publishing declarations that reference an undeclared or dev-only package. The failure
appears in downstream compilation, or not at all under `skipLibCheck: true`. Commerce will publish packages whose public
contracts depend on Comity types, so the property must be checked before publication — on the artifact that is actually
published, and in repositories whose package names are not yet decided.

## Decision

### Two complementary validation stages (D-03)

1. **Stage 1 — Workspace declaration validation** (category `declarations`). Runs **after the build**, during development and in
   CI. It inspects the **built `.d.ts` declarations** of each package in the workspace and verifies that every external package
   reference reachable from an export entry point is satisfied by the package's published dependency declarations. It consumes
   `dist/types` as emitted, located through `exports`, `types` and `typesVersions`. It does **not** inspect tarballs and does
   not check the `files` field.
2. **Stage 2 — Packed-surface (tarball) validation** (category `packed-surface`). Runs in the **producer repository**, after the
   build and **before publication**, on the tarball that `pnpm pack` produces for each publishable package — the actual
   published package surface, including the effect of the `files` field, the packed `package.json` (after `workspace:`
   rewriting) and the `exports` map. It reads the **tarball's file list and contents**, never the working tree's `dist`. It
   verifies at least:
   - every target named by `exports` (all conditions), `main`, `module`, `types`, `typesVersions` and `bin` is **present in the tarball**
     (`ARCH-PACK-001`);
   - every relative declaration reachable from those entries is present in the tarball (`ARCH-PACK-002`);
   - every external declaration reference in the **tarball's** declarations is satisfied by the **packed manifest's**
     `dependencies`/`peerDependencies`, using the same algorithm and rules `ARCH-DECL-DEP-001…005` as stage 1 (`ARCH-PACK-003`
     is the umbrella reporting that the reference check ran on the tarball; the specific `ARCH-DECL-DEP-*` code identifies the violation);
   - the packed manifest contains no `workspace:`, `file:` or `link:` specifier in any dependency field (`ARCH-PACK-004`);
   - sibling `dependencies`/`peerDependencies` are not exact pins without a recorded exception (ADR-033) (`ARCH-PACK-005`);
   - ESM-only conformance (ADR-034): no `dist/cjs/` in the tarball, and `import` and `require` resolving to the same ESM artifact
     (`ARCH-PACK-006`).
   Rule names and numbering for stage 2 are proposed and are fixed in the design document at implementation.
   **Stage 2 does not** install the package in a consumer, compile consumer code, or test runtime identity or duplicate
   installations. Those are the **clean-consumer verification** of ADR-036, a separate responsibility with a separate execution
   context (D-06).
3. **The two stages are complementary and neither replaces the other.** Stage 1 is fast and localises a cause in workspace
   output; stage 2 sees the published surface; ADR-036's clean-consumer verification sees the consumer's installed graph.

### Deterministic package discovery (D-04)

4. **Discovery enumerates packages from declared package roots, not from a name prefix.** For the stage 1 and stage 2 engines,
   every directory directly under each root declared in `comity.config.json` (`packages.roots`; default `packages`) that has a
   readable `package.json` is discovered, in sorted path order. No namespace (`@comity/*`, `@comity-dev/*` or any other) is
   hard-coded. A discovered package with `"private": true` is not publishable and is **excluded with a recorded reason**, never
   silently. Verified: on the current `community` (54) and `development` (8) trees this yields the same sets as the current filter.
5. **No silent or misleading empty result — implementation contract.** The expected scope is deterministic from repository
   configuration: `comity.config.json` `packages.roots` (the schema requires at least one root; when the file is absent the default
   root `packages` applies, and the output states that the default was used).
   - Roots do not resolve to any directory with a readable `package.json` (missing, empty, or fully matched by `packages.exclude`)
     → `CONFIGURATION-ERROR` (exit 2), reason naming the roots. **Never PASS.** An *explicitly empty* scope is not supported by the
     current schema (`minItems: 1`), so `NOT-APPLICABLE` is **not available** for "no packages"; introducing such a declaration
     would be a separate schema change and is not decided here.
   - Packages exist but **all** are `"private": true` → `NOT-APPLICABLE` with a reason listing the private packages, printed in
     normal output (nothing publishable exists to validate; this is stated, not silent).
   - Some packages publishable → run; private ones are excluded with a recorded reason.
   This follows D-04 and D-05 and needs no new policy decision; it refines this ADR's earlier draft, which treated "all private"
   as `CONFIGURATION-ERROR`.
6. **Implementation constraint, not a silent change.** `discover.ts` is shared by the existing engines, whose classification
   (ADR-026) assumes the current name filter. The proposed discovery is therefore a **separate discovery function used by the
   new categories**, leaving the existing engines' discovery untouched until a separate review. If safe name-agnostic discovery
   cannot be implemented this way, the smallest explicit alternative is a recorded list in `comity.config.json`
   (for example `packages.include`) naming the packages in scope; the current hard-coded prefix filter must not be the fallback.
   **This ADR does not decide the Commerce package namespace.**

### Rule semantics (stage 1; stage 2 reuses them)

7. **Reference classification** (precise algorithm in the design document):

   | Reference found in reachable declarations | Result |
   |---|---|
   | Relative specifier | ignored (internal), but must resolve |
   | `node:*` or a Node built-in module | allowed platform type |
   | Package in `dependencies` | allowed |
   | Package in `peerDependencies` (not optional) | allowed |
   | `@types/<p>` in `dependencies` or `peerDependencies`, referencing `<p>` | allowed |
   | Optional peer, reached only from non-root, opt-in entry points | allowed |
   | Optional peer reached from the root entry point `"."` | **error** |
   | Package only in `devDependencies` | **error** (TS2307, or `any` under `skipLibCheck`) |
   | Package in no field | **error** |
   | Self-reference or sibling reference to a subpath that is not an exported subpath | **error** |

8. **Public, not exhaustive:** only declarations reachable from an export entry point count. Emitted-but-unreachable files are ignored.
9. **Severity: error from the first release.** ADR-010 requires gradual enforcement for rules that have migration backlog.
   This rule has none: the baseline found no violation in the current build. The implementation must reproduce that result on
   the current Comity build; if it reports any finding, that finding is triaged first and the severity decision is revisited.
10. **Stable rule codes**, in the `ARCH-` family: `ARCH-DECL-DEP-000` (unresolvable relative reference in the built declaration
    graph), `-001` (undeclared), `-002` (dev-only), `-003` (optional peer reachable from the root), `-004` (self-reference to a
    non-exported subpath), `-005` (sibling subpath not exported); stage 2 adds `ARCH-PACK-001…006` above.

### Configuration errors and output (D-05)

11. **A missing build target is a precondition failure, not a finding.** A declared `types` target (stage 1) or a declared entry
    target (stage 2 — missing from the **tarball** is `ARCH-PACK-001`, a finding; a missing **workspace build** is this case)
    that does not exist on disk makes the category report exactly:
    `status: "CONFIGURATION-ERROR"`, `executed: false`, `passed: false`, **no validation finding**, a `reason` naming the package
    and target, and the run exits **2**. It is **never** `NOT-RUN`. A check that cannot run must never pass. A failed `pnpm pack`
    (stage 2) is likewise `CONFIGURATION-ERROR`; an unavailable required tool follows the existing `TOOL-UNAVAILABLE` / exit 3 semantics.
12. **Exit-code precedence.** Exit code 2 takes precedence over exit code 1 when configuration and validation errors both occur.
    This matches the existing `exitCodeForResult`.
13. **Findings are always visible.** All detected findings are printed in **normal output**, independent of `--verbose`
    (`--verbose` adds detail only). Exit 2 may co-occur with findings and the output must say so. This is a **change from current
    behaviour**: `src/bin/comity-validate.ts` prints violations only when `--verbose` is set (`if (!result.passed && args.verbose)`),
    for every category; the change is therefore a CLI-wide implementation task, and the comment for exit code 2 in `exit-codes.ts`
    is amended to "may co-occur with violations".
14. **`typescript` becomes a runtime `dependency` of `@comity-dev/validate`** (`^5.9.3`) because the engine parses declarations
    with the compiler API. It is currently a `devDependency` of the validator and already a runtime `dependency` of
    `@comity-dev/package-tools`, which is the precedent. **Stage 2 additionally needs to read tarball contents**, which Node's
    standard library does not do. Whether that is a small dependency or an invocation of the system `tar` executable is an
    **implementation choice for WP-C3**, not a decision requiring further architecture-owner approval; it is made by the
    implementation owner within this ADR, evaluating portability (macOS/Linux/CI images, `tar` flavour differences), security
    (path traversal, link and special-file entries, size limits, supply-chain exposure of a new dependency), deterministic behaviour
    (stable ordering and results independent of host `tar`), error handling (mapping failures to `CONFIGURATION-ERROR`/`TOOL-UNAVAILABLE`)
    and CI environment compatibility. No choice is made or implied here (the statement "no other dependency is introduced" applies
    to stage 1 only).
15. **Placement:** the shared `@comity-dev/validate` package, not package-specific tooling, because the rule is
    repository-agnostic and Commerce packages need the same check. Whether `comity validate` can run in Commerce depends on the
    open repository-classification governance decisions (`repository.type`, ownership); the proposed discovery removes the
    *namespace* dependency, not that one. Until then an equivalent script implementing the same algorithm may be used.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Extend `adapter-peers` | It checks adapters' manifests only; this property applies to every package and to built output |
| Check source `import type` statements | Source imports differ from emitted declarations (inlined `import("x").T`, re-exports, augmentation); the published artifact is what consumers see |
| `dependency-cruiser` rules | It analyses source imports and layers; it does not see emitted declarations or manifest fields |
| Run `tsc` against a packed consumer only | Required as a separate gate (ADR-036), but slow, cannot localise the cause, and passes silently under `skipLibCheck: true` |
| Workspace validation only | Does not see the effect of `files`/`exports` on the tarball (D-03) |
| Tarball validation only | Slower to localise causes; both stages are wanted |
| Hard-coded `@comity/*` namespace filter | Silently discovers nothing for an undecided namespace (D-04) |
| Reject every external reference in declarations | Would forbid legitimate peers and dependencies |
| Report-only first (informational) | Unneeded: zero backlog |

## Consequences

**Positive:** undeclared or dev-only public declaration dependencies fail validation before publication; the failure names
package, file, entry point and remedy; `skipLibCheck` can no longer hide it for validated repositories; the published surface is
checked, not just the workspace output; repositories with undecided namespaces are not silently skipped.

**Negative / trade-offs:**

- Requires a build first; a missing declared target is a `CONFIGURATION-ERROR` (exit 2), not a finding and never a silent pass.
- Stage 2 requires packing every publishable package (cost scales with package count); it needs `pnpm` and tarball reading.
- Does not see ambient-global usage without an import (`Buffer`, `NodeJS.*`; none in current declarations) or detect
  duplicate **installed** copies of a package. Those are graph properties, covered by the clean-consumer verification (ADR-036).
- External packages' subpaths are not resolved; only same-repository siblings are checked.
- `@comity-dev/validate` gains a larger runtime install.
- Always-visible findings change the validator's default output for all categories.

## Compatibility and migration

- Existing findings, exit codes and categories change only by two additional categories and by findings visibility (Decision 13).
- Rollout: introduce stage 1 (WP-C1); run it on comity-community and comity-development (expected: zero findings); introduce
  stage 2 (WP-C3); release `@comity-dev/validate` as a minor; bump consumers' root `devDependencies`; add the stages to repository
  CI — stage 1 after `pnpm build`, stage 2 before publication. Enforcement is implemented **locally in each repository** (ADR-036).
- Commerce adopts it when its workspace exists; the namespace is not a dependency of this ADR.

## Validation requirements

The implementation tasks must provide, at minimum (full list in the design document):

1. Positive tests: dependency, required peer, `@types/p`, built-in, self-reference to an exported subpath, optional peer reached
   only from an opt-in subpath, unreachable declaration with an undeclared import.
2. Negative tests: dev-only reference; `import("x").T` type node; `declare module "x"` augmentation; optional peer reachable
   from `"."`; self-reference to a non-exported subpath; sibling subpath not exported.
3. Determinism: findings sorted by package, file, specifier; discovery order sorted.
4. **Regression test:** the stage 1 engine reports **zero** findings on the current comity-community build, reporting the **total**
   emitted `.d.ts` count and the **entry-reachable** count separately (they may be equal; say so) and the reference count. The
   regression test is justified as **rule-set coverage** of `-003`/`-004`/`-005` and of the reachability filter, which the
   textual baseline cannot discriminate (all 537 files yield 443 references).
5. **Configuration-error test:** a package whose declared `types` target does not exist makes the engine report
   `CONFIGURATION-ERROR` (no finding) and the run exit `2` (never `0`).
6. **Mixed-run test:** a run with a declarations finding and an unrelated `CONFIGURATION-ERROR` exits 2 **and** prints the finding
   without `--verbose`.
7. **Discovery tests:** a repository whose packages use an arbitrary namespace is fully discovered; roots resolving to no package
   directory report `CONFIGURATION-ERROR` and never PASS; an all-private repository reports `NOT-APPLICABLE` with the private packages
   listed; private packages are otherwise excluded with a reason.
8. **Stage 2 tests:** an export target excluded by `files` is `ARCH-PACK-001`; a declaration excluded by `files` is `ARCH-PACK-002`;
   a dev-only reference in a packed declaration is reported with its `ARCH-DECL-DEP-002`; a `workspace:` specifier in the packed
   manifest is `ARCH-PACK-004`; a failed pack is `CONFIGURATION-ERROR`.

## Dependencies on other decisions

- ADR-010 / ADR-026 (validator design and classification): this ADR adds engines within their contract.
- **ADR-036:** relies on stages 1 and 2 as **producer-side** validation. The clean-consumer verification does **not** invoke these
  engines (it installs artifacts in a fresh directory where they cannot discover anything); it verifies the consumer experience.
- ADR-034: with `require` and `import` sharing one declaration tree the engine checks one tree; stage 2 would enforce ADR-034's tarball
  conformance (`ARCH-PACK-006`).
- ADR-033: stage 2 would enforce ADR-033's packed-manifest requirements (`ARCH-PACK-004`, `-005`).

## Acceptance status and remaining questions

**Accepted 2026-11-04** by Comity maintainer decision (see Provenance). No architectural question remains open: the two-stage
model, discovery, rule semantics, configuration-error behaviour and output are decided (D-03, D-04, D-05).

### Confirmed at acceptance — the two explicit maintainer decisions

1. **Error severity from day one is `error`.** Supported by the independently reproduced zero-finding counting baseline and by
   ADR-010 (gradual enforcement is required only for rules with migration backlog; this rule has none). **The Decision 9 guard is
   preserved:** the implementation must reproduce that result on the current build, and if it reports any finding, that finding is
   triaged first and the severity decision is revisited.
2. **`typescript` becomes a runtime `dependency` of `@comity-dev/validate`** (`^5.9.3`, Decision 14). It enlarges the validator's
   runtime install; `@comity-dev/package-tools` is the existing precedent. **The manifest change itself is WP-C1 work and is not
   made by this acceptance.**

### Implementation choices — WP-C1 / WP-C3, not acceptance questions

3. ~~How stage 2 reads tarballs~~ — an **implementation choice for WP-C3** (criteria in Decision 14), not an acceptance question.
   No dependency or command is selected or implied by this ADR.
4. ~~Zero-discovered-packages status~~ — settled as an implementation contract in Decision 5.
5. Whether `optionalDependencies`/`bundledDependencies` satisfy a reference. Proposed default: **no**; none are used today. An
   implementation detail of WP-C1 within that default.

Resolved by the architecture owner (D-03, D-04, D-05): the two-stage model; name-agnostic deterministic discovery; the
missing-build semantics and always-visible findings. Formal maintainer acceptance remains pending.

## References

ADR-010, ADR-026; `development/packages/validate/src/engines/adapter-peers.ts`, `src/run.ts`, `src/discover.ts`,
`src/bin/comity-validate.ts`, `src/exit-codes.ts`; `development/packages/package-tools/package.json`; design document above; ADR-033, ADR-034, ADR-036.

## Scope

This ADR decides the existence, stages, placement, discovery model, rule semantics, severity, output and dependency of the
engines. It implements nothing.
