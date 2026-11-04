# ADR-036 — Cross-Repository Comity Dependency Declaration Policy

> **Provenance:**
> - Canonical owner: comity-development
> - Raised by: Cross-Repository Dependency Policy Audit and Remediation Plan (Commerce / Comity boundary work, 2026-11-04)
> - First consumer: the Commerce Foundation (`commerce/docs/governance/package-dependency-policy.md` holds the Commerce-specific matrix)

**Status:** Proposed

## Context

Packages built outside comity-community (the Commerce Foundation is the first; comity-enterprise is a future one) consume
published `@comity/*` packages. The contracts they extend carry identity in two ways:

- **Runtime identity.** `BaseError` (`@comity/primitives`) is tested with `instanceof` by `toSafePayload`, `http-hono`, `http`,
  `auth`, `auth-jose`, `html` and `kernel`. Two copies break error mapping (`toSafePayload` → `code: "unknown"`).
  Value helpers (`success`, `failure`) are structural and carry no runtime identity.
- **Compile-time nominal identity.** Classes with `#private` fields are nominally typed: `Money`, `Currency`, `Price`
  (`@comity/pricing`), `ChannelId` (`@comity/organization`), `OrderId`, `Order` (`@comity/order`). Two installed copies make
  values non-assignable (TS2345). `Instant` and `BaseError` are structural at the type level.

Facts verified with pnpm 10.13.1 (isolated linker), Node 24, TypeScript 5.9.3 against published packages:

- A regular dependency with a caret range that does not intersect the application's copy installs a second instance.
- A peer dependency lets a consuming package share the application's copy, but an unmet or out-of-range peer **warns only**
  (`strict-peer-dependencies` is off by default) and the package then runs against the wrong version.
- Peers do not override exact versions that other Comity packages publish (ADR-033).
- `import type` is erased from JavaScript but **retained in `.d.ts`**; a dev-only type dependency breaks consumers (ADR-035).
- A workspace-linked library resolves its peer from **its own** devDependency, so the local graph can differ from the published one.
- Cross-repository `link:` makes the linked library resolve the Comity packages in **its own** repository, so the
  application ends with a second copy even at identical versions, with peers declared; `instanceof BaseError` is false. `file:<directory>` resolves in the consumer's graph and keeps one
  instance, but it is a hard-linked copy that goes stale when Comity's build deletes and recreates `dist`.
- `pnpm.overrides` pointing at a packed tarball collapses the duplicates, passes `strict-peer-dependencies=true`, and gives
  the same bytes that would be published.

Governance facts: dependency direction is Consumer → Comity only; `comity-validate` does not currently enforce ADR-008 for
cross-repository `@comity/*` edges (it classifies from in-repo packages only). Open Commerce governance decisions about the
repository, its namespace and `repository.type` are **not** decided here.

## Problem statement

There is no policy for how a package outside comity-community declares its Comity dependencies, how it develops against
unpublished Comity packages, or how it proves its published graph is sound. The two obvious blanket rules are both wrong:
"everything regular, caret" forks identity; "everything peer" over-constrains implementation-only edges and does not guarantee a
singleton.

## Decision

### 1. Declaration classes (per edge, evidence-based; no blanket rule)

| Class | Condition | Declaration |
|---|---|---|
| Identity-bearing or public-contract | The dependency's runtime value carries identity checked anywhere in the host graph, **or** its types appear in the package's published `.d.ts` and are nominal or shared with consumers | `peerDependencies` + `devDependencies` (exact tested version) |
| Implementation-only | Not referenced by any published `.d.ts`; no value crosses the package boundary; no identity check | `dependencies` |
| Type-only, internal | Referenced only by non-published code (tests, build) and absent from published declarations | `devDependencies` |
| Opt-in | Reached only through an opt-in non-root subpath | optional peer (`peerDependenciesMeta`) + `devDependencies` |
| Unused | Not imported | **No declaration.** Unused Comity dependencies are not declared |

`import type` is not sufficient to make a dependency dev-only: if any published `.d.ts` references the package, it must be
resolvable by consumers (ADR-035 enforces this).

Consequences of the classes:

- The classification is made **per package at implementation time** from the actual runtime imports, published declarations
  and identity requirements. A candidate list in a design document is provisional until then.
- It is **not** a rule that every `@comity/*` dependency is a peer, and it is **not** a rule that none are.
- This policy applies to packages outside comity-community. It does not change Comity's internal Core Module `dependencies`
  or the Technology Adapter dependency + peer pattern (`adapters.md` §13).

### 2. Version ranges

- Peer range: caret on the **lowest tested** Comity version (under 0.x, minor-locked, for example `^0.10.0`).
- Dev dependency: the exact tested version.
- A consumer package widens a peer range (for example across two minors) only after its verification passes on both.
- Release order: Comity first, then the consumer package.

### 3. Local development against unpublished Comity packages

- Use **locally packed Comity tarballs** (`pnpm pack` from the Comity package) and `pnpm.overrides` that point the Comity
  package names at those tarballs, when unpublished Comity changes are needed.
- **Do not use cross-repository `link:`** for any identity-bearing package.
- **`file:<directory>` is not the default workflow** (stale after rebuilds). It may be used for a quick experiment, with a reinstall after each rebuild.
- Overrides, `file:` and `link:` specifiers never appear in a released manifest; the clean-consumer verification rejects them
  in packed manifests.
- Each consuming repository documents how to refresh and verify its local tarballs (the Commerce procedure is in its governance document).

### 4. Consumer verification before publishing

A **clean-consumer verification** is required before publishing a package that depends on Comity. It must:

1. build and pack the packages;
2. install the **tarballs** in a fresh consumer directory (outside the workspace) with pnpm and
   `strict-peer-dependencies=true`;
3. compile the declarations with `skipLibCheck: false`;
4. verify that all external declaration references resolve (the ADR-035 engine, or its equivalent while unavailable);
5. verify runtime identity for the relevant packages (an error produced by the consumer package is an `instanceof BaseError`
   of the application's `@comity/primitives`);
6. verify that Comity error codes survive package boundaries (`toSafePayload(err).code` is the package's code, not `"unknown"`);
7. detect unintended duplicate installations of identity-bearing packages (exactly one installed copy and one resolved path per package).

The **initial official verification target** is **pnpm 10.13.x on Node 24+**. npm, Yarn, hoisted layouts, bundlers and
non-Node runtimes are **not** verified and no compatibility is claimed for them until verified separately.

### 5. Direction

The dependency direction is Consumer → Comity. Comity packages never depend on consuming repositories.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| All Comity dependencies regular, caret | Forks identity on any range mismatch (verified); two `BaseError` classes |
| All Comity dependencies peers | Over-constrains edges with no identity or public exposure; still not a singleton guarantee (warnings only; exact pins) |
| Type-only imports are always `devDependencies` | `import type` survives in `.d.ts`; consumers get TS2307 or silent `any` |
| Cross-repository `link:` for local development | Verified to duplicate identity-bearing packages even at equal versions |
| `file:` as the default local workflow | Verified to go stale after Comity rebuilds |
| Git submodule / vendored copy of Comity in the consumer | Out of scope; duplicates ownership; not evaluated |
| Pin Comity exact in the consumer | Forces consumers onto the same patch; does not prevent duplicates in the application |
| Define the policy only in the Commerce repository | The rules concern published Comity contracts and identity, apply to any external consumer, and need Comity-level ownership |

## Consequences

**Positive:** identity-bearing contracts share one copy where the application controls versions; consumers cannot be broken by dev-only
declaration dependencies; local development matches what will be published; the verification catches duplicates before release.

**Negative / trade-offs:**

- Under 0.x, every breaking Comity minor requires a consumer release to move or widen the peer range.
- Peer declarations transfer installation responsibility to the application (pnpm's `auto-install-peers` default helps; an application using
  `auto-install-peers=false` must declare them, or the library crashes at import: verified).
- Tarball-based local development has a pack → install loop per Comity change.
- Peers and carets do not guarantee a single instance; only the verification detects violations.

## Compatibility and migration

- No effect on existing Comity packages.
- Packages written before this ADR is accepted (none exist; Commerce is design-only) have nothing to migrate.
- The frozen Commerce manifest sketch (`07-package-architecture.md` §4) used `workspace:*` regular dependencies; it is
  annotated by the Commerce governance document and corrected under the Commerce freeze change control once this ADR is Accepted.

## Validation requirements

1. The clean-consumer verification (Decision 4) exists as an executable CI job in each consuming repository before its first publication.
2. For every consuming package, a dependency-class table (Decision 1) is reviewed against the **built** package, not only the design.
3. Peer and dev dependency ranges in packed manifests follow Decision 2.
4. A negative control: the verification fails on a deliberately duplicated install (for example two `@comity/primitives` versions) and on a dev-only declaration reference.

## Dependencies on other decisions

- **ADR-033:** exact pins published by Comity undermine any peer declaration; this policy is only reliable on releases published after ADR-033's coordinated release.
- **ADR-035:** the declaration resolvability check.
- **ADR-034:** defines the `require` behaviour that the verification exercises when a consumer promises CommonJS.
- **ADR-008:** unchanged; Core-to-Core registration for new Core packages remains per ADR-008.
- Open Commerce governance decisions (repository approval, namespace, `repository.type`) remain open and are not prerequisites for this policy.

## Open questions (require maintainer decision before this ADR is Accepted)

1. Whether the policy belongs at Comity level (proposed) or only in each consuming repository's governance.
2. The pnpm and Node verification target (pnpm 10.13.x, Node 24+ proposed).
3. Whether a consuming repository must promise CommonJS (requires ADR-034 acceptance for the verification step to include `require`).

## References

ADR-008, ADR-033, ADR-034, ADR-035; `adapters.md` §13; `development/docs/architecture/repository-ownership.md`;
`commerce/docs/governance/package-dependency-policy.md`; `commerce/docs/architecture/resolution/architecture-freeze-assessment.md` (open governance decisions).

## Scope

This ADR defines declaration classes, ranges, local development and verification for packages outside comity-community. It
does not create a repository, decide a namespace, or change any manifest.
