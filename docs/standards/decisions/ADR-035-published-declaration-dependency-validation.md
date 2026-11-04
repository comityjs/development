# ADR-035 — Published Declaration Dependency Validation

> **Provenance:**
> - Canonical owner: comity-development
> - Implementation owner: `@comity-dev/validate` (comity-development)
> - Raised by: Cross-Repository Dependency Policy Audit and Remediation Plan (Commerce / Comity boundary work, 2026-11-04)
> - Detailed engine design: `development/packages/validate/docs/declaration-dependencies-design.md`

**Status:** Proposed

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
of Technology Adapters from manifests. No engine inspects built declarations. The repository-level validator contract
(ADR-010, ADR-026) requires stable rule codes, the involved package and edge, a source document, and a remediation hint.

A read-only prototype scanning the current local build (built 2026-10-31) found: **54 packages, 537 `.d.ts` files,
443 external module references, 0 undeclared, 0 dev-only, 0 Node built-in, 0 optional-peer references**. The same scan
over the published `primitives`, `pricing`, `organization` and `order` 0.9.1 tarballs found 53 files, 34 references, 0 findings.
Ambient-type hits (`NodeJS.`, `Buffer`, `process.`) in declarations are JSDoc comments only.

## Problem statement

Nothing prevents a package from publishing declarations that reference an undeclared or dev-only package. The failure
appears in downstream compilation, or not at all under `skipLibCheck: true`. Commerce will publish packages whose public
contracts depend on Comity types, so the property must be checked before publication.

## Decision

1. **Add a validation engine to `@comity-dev/validate`** that inspects the **built, publishable `.d.ts` declarations** of each
   package and verifies that every external package reference is satisfied by the package's published dependency declarations.
2. **Stage:** it runs **after the build**. It consumes `dist/types` as emitted, located through the package's `exports`,
   `types` and `typesVersions` entries. Packed-tarball verification (file lists, clean-consumer compilation) remains a
   separate, heavier check (ADR-033, ADR-034, ADR-036) and is not performed by this engine.
3. **Rule semantics** (precise algorithm in the design document):

   | Reference found in reachable declarations | Result |
   |---|---|
   | Relative specifier | ignored (internal) |
   | `node:*` or a Node built-in module | allowed platform type |
   | Package in `dependencies` | allowed |
   | Package in `peerDependencies` (not optional) | allowed |
   | `@types/<p>` in `dependencies` or `peerDependencies`, referencing `<p>` | allowed |
   | Optional peer, reached only from non-root, opt-in entry points | allowed |
   | Optional peer reached from the root entry point `"."` | **error** |
   | Package only in `devDependencies` | **error** (TS2307, or `any` under `skipLibCheck`) |
   | Package in no field | **error** |
   | Self-reference or sibling reference to a subpath that is not an exported subpath | **error** |

   A **missing build** (a declared `types` target that does not exist on disk) is not a reference finding: it is a
   precondition failure, reported as `CONFIGURATION-ERROR` (exit `2`) with no finding and never as `NOT-RUN`. A check that
   cannot run must never pass.

4. **Public, not exhaustive:** only declarations reachable from an export entry point count. Emitted-but-unreachable files are ignored.
5. **Severity: error from the first release.** ADR-010 requires gradual enforcement for rules that have migration backlog.
   This rule has none: the prototype found no violation in the current build. The implementation must reproduce that result on
   the current Comity build; if it reports any finding, that finding is triaged first and the severity decision is revisited.
6. **Stable rule codes**, in the `ARCH-` family used by the other engines:
   `ARCH-DECL-DEP-000` (unresolvable relative reference in the built declaration graph), `-001` (undeclared), `-002` (dev-only),
   `-003` (optional peer reachable from the root), `-004` (self-reference to a non-exported subpath), `-005` (sibling subpath not exported).
7. **`typescript` becomes a runtime `dependency` of `@comity-dev/validate`** (`^5.9.3`) because the engine parses declarations
   with the compiler API. It is currently a `devDependency` of the validator and already a runtime `dependency` of
   `@comity-dev/package-tools` (`comity-normalize-exports`), which is the precedent. No other dependency is introduced.
8. **Placement:** the shared `@comity-dev/validate` package, not package-specific tooling, because the rule is
   repository-agnostic and Commerce packages need the same check.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Extend `adapter-peers` | It checks adapters' manifests only; this property applies to every package and to built output |
| Check source `import type` statements | Source imports differ from emitted declarations (inlined `import("x").T`, re-exports, augmentation); the published artifact is what consumers see |
| `dependency-cruiser` rules | It analyses source imports and layers; it does not see emitted declarations or manifest fields |
| Run `tsc` against a packed consumer only | Required as a separate gate, but slow, cannot localise the cause, and passes silently under `skipLibCheck: true` |
| Reject every external reference in declarations | Would forbid legitimate peers and dependencies |
| Report-only first (informational) | Unneeded: zero backlog |
| New third-party parser or tarball library | Not necessary; the TypeScript compiler API suffices |

## Consequences

**Positive:** undeclared or dev-only public declaration dependencies fail validation before publication; the failure names
package, file, entry point and remedy; `skipLibCheck` can no longer hide it for validated repositories.

**Negative / trade-offs:**

- Requires a build first; a missing declared `types` target is a `CONFIGURATION-ERROR` (exit `2`), not a finding and never a
  silent pass.
- Does not see ambient-global usage without an import (`Buffer`, `NodeJS.*`; none in current declarations) or detect
  duplicate **installed** copies of a package. Those are graph properties, covered by the clean-consumer verification.
- External packages' subpaths are not resolved (no dependence on installed state); only same-repository siblings are checked.
- `@comity-dev/validate` gains a larger runtime install.

## Compatibility and migration

- No change to existing findings, exit codes or categories except an additional category.
- Rollout: introduce the engine; run it on comity-community and comity-development (expected: zero findings); release
  `@comity-dev/validate` as a minor; bump consumers' root `devDependencies`; add the engine to repository CI after `pnpm build`.
- Commerce adopts it when its workspace exists. Whether `comity validate` can run in Commerce depends on the open
  repository-classification governance decisions (`repository.type` and ownership). Until then an equivalent script,
  implementing the same algorithm, may be used.

## Validation requirements

The implementation task must provide, at minimum (full list in the design document):

1. Positive tests: dependency, required peer, `@types/p`, built-in, self-reference to an exported subpath, optional peer reached
   only from an opt-in subpath, unreachable declaration with an undeclared import.
2. Negative tests: dev-only reference; `import("x").T` type node; `declare module "x"` augmentation; optional peer reachable
   from `"."`; self-reference to a non-exported subpath; sibling subpath not exported.
3. Determinism: findings sorted by package, file, specifier.
4. **Regression test:** the engine reports **zero** findings on the current comity-community build, matching the prototype
   (54 packages, 537 files, 443 references).
5. **Configuration-error test:** a package whose declared `types` target does not exist makes the engine report
   `CONFIGURATION-ERROR` (no finding) and the run exit `2` (never `0`).

## Dependencies on other decisions

- ADR-010 / ADR-026 (validator design and classification): this ADR adds an engine within their contract.
- ADR-036 relies on this engine as the declaration check for downstream repositories.
- ADR-034: with `require` and `import` sharing one declaration tree, the engine checks one tree.
- No dependency on ADR-033.

## Open questions (require maintainer decision before this ADR is Accepted)

1. Error severity from day one (proposed, supported by the zero-finding baseline).
2. Moving `typescript` to `dependencies` of `@comity-dev/validate`.

## References

ADR-010, ADR-026; `development/packages/validate/src/engines/adapter-peers.ts`, `src/run.ts`, `src/discover.ts`;
`development/packages/package-tools/package.json`; design document above.

## Scope

This ADR decides the existence, stage, placement, rule semantics, severity and dependency of the engine. It implements nothing.
