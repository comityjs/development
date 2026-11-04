# ADR-036 — Cross-Repository Comity Dependency Declaration Policy

> **Provenance:**
> - Canonical owner: comity-development (policy text)
> - Raised by: Cross-Repository Dependency Policy Audit and Remediation Plan (Commerce / Comity boundary work, 2026-11-04)
> - First consumer: the Commerce Foundation (`commerce/docs/governance/package-dependency-policy.md` holds the Commerce-specific matrix)
> - Architecture-owner decisions D-06 (verification responsibilities) and D-08 (one policy, locally enforced), 2026-11-04.
> - **Accepted:** 2026-11-04, by Comity maintainer decision. Accepted as written: one **centralized** Comity-wide policy;
>   enforcement **local** to each repository; the documented-policy / implemented-enforcement distinction preserved; packed
>   tarballs for local cross-repository development; clean-consumer verification **separate** from producer validation. The
>   maintainer-confirmed **initial verification baseline is pnpm 12.16.1 on Node 24+** (see §4b). **Acceptance does not authorise
>   WP-D1/D2/D3**. Commerce adoption is a separate Commerce-owner action; it was **AUTHORIZED by the Commerce owner on 2026-11-04**
>   (decision B8(a), recorded in the decision-resolution record). That authorisation does **not** reopen or modify this ADR, and does not
>   authorise Commerce implementation work.

**Status:** Accepted

> **Enforcement status.** This ADR is a **documented policy**. It is not technically enforced anywhere: no clean-consumer job
> exists in any repository; no validator engine enforces cross-repository dependency direction (ADR-008 edges are not wired into
> `comity-validate` even in-repo); the declaration and tarball validation of ADR-035 are not implemented. See "Documented policy
> versus implemented enforcement".

## Context

Packages built outside comity-community (the Commerce Foundation is the first; comity-enterprise is a future one) consume
published `@comity/*` packages. The contracts they extend carry identity in two ways:

- **Runtime identity.** `BaseError` (`@comity/primitives`) is tested with `instanceof` by `toSafePayload`, `http-hono`, `http`,
  `auth`, `auth-jose`, `html` and `kernel`. Two copies break error mapping (`toSafePayload` → `code: "unknown"`).
  Value helpers (`success`, `failure`) are structural and carry no runtime identity.
- **Compile-time nominal identity.** Classes with `#private` fields are nominally typed: `Money`, `Currency`, `Price`
  (`@comity/pricing`), `ChannelId` (`@comity/organization`), `OrderId`, `Order` (`@comity/order`). Two installed copies make
  values non-assignable (TS2345). `Instant` and `BaseError` are structural at the type level.

Facts verified with pnpm 10.13.1 (isolated linker), Node 24, TypeScript 5.9.3 against published packages (the pnpm experiments
below were not independently re-run by the later review and are recorded as reported):

- A regular dependency with a caret range that does not intersect the application's copy installs a second instance.
- A peer dependency lets a consuming package share the application's copy, but an unmet or out-of-range peer **warns only**
  (`strict-peer-dependencies` is off by default) and the package then runs against the wrong version.
- Peers do not override exact versions that other Comity packages publish (ADR-033).
- `import type` is erased from JavaScript but **retained in `.d.ts`**; a dev-only type dependency breaks consumers (ADR-035).
- A workspace-linked library resolves its peer from **its own** devDependency, so the local graph can differ from the published one.
- Cross-repository `link:` makes the linked library resolve the Comity packages in **its own** repository, so the
  application ends with a second copy even at identical versions, with peers declared; `instanceof BaseError` is false. `file:<directory>`
  resolves in the consumer's graph and keeps one instance, but it is a hard-linked copy that goes stale when Comity's build deletes
  and recreates `dist`.
- `pnpm.overrides` pointing at a packed tarball collapses the duplicates, passes `strict-peer-dependencies=true`, and gives
  the same bytes that would be published.

Governance facts: dependency direction is Consumer → Comity only; `comity-validate` does not currently enforce ADR-008 for
cross-repository `@comity/*` edges. Open Commerce governance decisions about the repository, its namespace and
`repository.type` are **not** decided here. `development/docs/architecture/repository-ownership.md` assigns "Comity-wide
standards" and "Comity-wide ADRs" to comity-development; it does not mention Commerce, and it does not give Development
authority over another repository's CI.

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
resolvable by consumers (ADR-035 proposes to enforce this; not yet implemented).

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
- Under the Comity release policy (ADR-033), a minor of a peered Core Module is published together with its dependents (which
  take the Changesets major), so Comity's own published graph is internally consistent when a consumer verifies against it.

### 3. Local development against unpublished Comity packages

- Use **locally packed Comity tarballs** (`pnpm pack` from the Comity package) and `pnpm.overrides` that point the Comity
  package names at those tarballs, when unpublished Comity changes are needed.
- **Do not use cross-repository `link:`** for any identity-bearing package.
- **`file:<directory>` is not the default workflow** (stale after rebuilds). It may be used for a quick experiment, with a reinstall after each rebuild.
- Overrides, `file:` and `link:` specifiers never appear in a released manifest; producer tarball validation (ADR-035) and the
  clean-consumer verification reject them in packed manifests.
- Each consuming repository documents how to refresh and verify its local tarballs (the Commerce procedure is in its governance document).

### 4. Verification before publishing: two separate responsibilities (D-06)

Declaration validation and clean-consumer verification are **separate responsibilities with separate execution contexts**. Neither
is a step of the other.

**4a. Producer validation (in the producer repository, at its workspace root).** The repository that builds the package validates
its own output with the engines of ADR-035: **stage 1** (workspace declaration validation, after build) and **stage 2**
(packed-surface/tarball validation, before publication — the actual package surface including the `files` field, `exports` and
the packed manifest). These engines read the producer's own workspace and tarballs. They are **not** run in the consumer
installation: they require the producer's `comity.config.json`/package roots, and would discover nothing in a fresh consumer
directory.

**4b. Clean-consumer verification (in a fresh directory outside the workspace).** It installs the **packed or registry-equivalent**
packages and verifies what a consumer actually experiences. It must:

1. build and pack the packages (the package(s) under release and every Comity package whose copy must stay unique);
2. install the **tarballs** (and explicit `@comity/*` versions) in a fresh consumer directory outside the workspace with pnpm and
   `strict-peer-dependencies=true`, in two legs: the **floor** (lowest peer versions) and **latest in range**;
3. compile every exported subpath of every package under `moduleResolution: nodenext` (and `bundler`) with `skipLibCheck: false`.
   This is the consumer-side check that declaration references resolve; it uses the TypeScript compiler on the installed
   packages and **does not invoke the ADR-035 engines**;
4. verify runtime identity for the relevant packages (an error produced by the consumer package is an `instanceof BaseError`
   of the application's `@comity/primitives`);
5. verify that Comity error codes survive package boundaries (`toSafePayload(err).code` is the package's code, not `"unknown"`);
6. detect unintended duplicate installations of identity-bearing packages (exactly one installed copy and one resolved path per package);
7. verify `require()` of every exported subpath under Node 24+ and that the resulting `BaseError` is the same as the imported one
   (ADR-034 applies to every Comity package; this leg tests Node 24+ `require(ESM)` compatibility of the single ESM build and is not conditional on any CommonJS promise — Comity makes none).

**Registry-equivalent** means: every Comity package in the consumer installation comes from a packed tarball of the release
candidate set, with manifests exactly as they would be published (no `workspace:`, `file:` or `link:`), so that the installed graph
is the graph the registry would serve. After publication the same verification is repeated once against the registry itself.
Tarball overrides are allowed only inside this disposable verification directory, never in a released manifest.

The producer's stage 1 and stage 2 results are a **precondition** of 4b in the same pipeline, but remain different checks run
in different contexts. The **initial official verification baseline** is **pnpm 12.16.1 on Node 24+** (maintainer-confirmed at
acceptance, 2026-11-04). This is the toolchain the verification **runs against**. It is **not** a minimum-version guarantee for
consumers and **not** a compatibility policy: no pnpm version range is promised to consumers, and any future compatibility policy
is a separate decision. npm, Yarn, hoisted layouts,
bundlers and non-Node runtimes are **not** verified and no compatibility is claimed for them until verified separately.

**Baseline versus current repository pins (stated for accuracy at acceptance).** The `packageManager` field of comity-community and
comity-development still pins **`pnpm@10.13.1`** (lockfile v9.0), and the experiments recorded in this ADR's Context were run with
pnpm 10.13.1 — those historical records are deliberately unchanged. Aligning `packageManager` and the lockfiles with the 12.x
baseline is an **implementation task** within the pnpm 12 migration and is **not** authorised by this acceptance. Until it lands the
baseline and the pinned toolchain differ, so the verification job must install **pnpm 12.16.1 explicitly** rather than relying on
`packageManager`.

### 5. Direction

The dependency direction is Consumer → Comity. Comity packages never depend on consuming repositories. **This is documented
policy only**; see below.

### 6. One policy, local enforcement (D-08)

- **Policy ownership is centralized.** This ADR is the single Comity-wide dependency policy, owned by comity-development
  (`repository-ownership.md`: Comity-wide standards and ADRs).
- **Enforcement is local.** Each repository that publishes or consumes Comity packages implements and operates the producer
  validation (4a) and clean-consumer verification (4b) in **its own** CI and release process, and owns how it satisfies the
  requirement. comity-development does not operate, and this ADR does not assert authority over, another repository's CI.
- **The requirement is a publication precondition** that each repository applies in its own release process before its first
  publication and thereafter. A consuming repository adopts it through its own governance document (for Commerce:
  `commerce/docs/governance/package-dependency-policy.md`).
- `repository-ownership.md` covers Development, Community and Enterprise only; Commerce is not in it. This ADR cites it only for
  Development's ownership of Comity-wide standards. Extending the ownership document to Commerce is a separate decision that
  this ADR does not make.

### Documented policy versus implemented enforcement

| Element | Status today |
|---|---|
| Declaration classes, ranges, direction (§1, §2, §5) | **Documented policy.** Nothing checks them automatically |
| Cross-repository dependency direction (ADR-008) | **Documented policy.** `comity-validate` has no ADR-008 or cross-repository engine; the ADR-008 registered-edge machinery in `dependency-rules` is not wired into the validator (`depcruise.ts` does not pass `registeredCoreEdges`) |
| Declaration validation stages 1–2 (ADR-035) | **Accepted, not implemented** (WP-C1, WP-C3) |
| Clean-consumer verification (§4b) | **Accepted policy, not implemented, unowned** until a consuming repository builds its job (Commerce WP-D3, gated on open governance decisions) |
| Tarball local development (§3) | **Developer discipline** |

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| All Comity dependencies regular, caret | Forks identity on any range mismatch (verified); two `BaseError` classes |
| All Comity dependencies peers | Over-constrains edges with no identity or public exposure; still not a singleton guarantee (warnings only; exact pins) |
| Type-only imports are always `devDependencies` | `import type` survives in `.d.ts`; consumers get TS2307 or silent `any` |
| Cross-repository `link:` for local development | Verified to duplicate identity-bearing packages even at equal versions |
| `file:` as the default local workflow | Verified to go stale after Comity rebuilds |
| `pnpm.overrides` in a published consumer manifest | Overrides apply only to the root project of an installation; a library cannot publish them. They are a consumer-side mitigation (ADR-033) and a verification-directory tool (§4b), not a declaration strategy |
| Git submodule / vendored copy of Comity in the consumer | Out of scope; duplicates ownership; not evaluated |
| Pin Comity exact in the consumer | Forces consumers onto the same patch; does not prevent duplicates in the application |
| Define the policy only in the Commerce repository | The rules concern published Comity contracts and identity, apply to any external consumer, and need Comity-level ownership of the *text* |
| Run the ADR-035 engine inside the clean-consumer installation | It discovers producer workspaces and cannot discover packages in a consumer install (it would report no findings); consumer-side resolvability is checked by compiling with `skipLibCheck: false` |
| Development enforces the policy in other repositories | Development does not own their CI; enforcement is local (§6) |

## Consequences

**Positive:** identity-bearing contracts share one copy where the application controls versions; consumers cannot be broken by dev-only
declaration dependencies; local development matches what will be published; the verification catches duplicates before release; the
producer/consumer split means each check runs where it can actually run.

**Negative / trade-offs:**

- Under 0.x, every breaking Comity minor requires a consumer release to move or widen the peer range.
- Peer declarations transfer installation responsibility to the application (pnpm's `auto-install-peers` default helps; an application using
  `auto-install-peers=false` must declare them, or the library crashes at import: verified).
- Tarball-based local development has a pack → install loop per Comity change.
- Peers and carets do not guarantee a single instance; only the verification detects violations.
- Every consuming repository must build and maintain its own verification job; there is no shared enforcement.

## Compatibility and migration

- No effect on existing Comity packages.
- Packages written before this ADR is accepted (none exist; Commerce is design-only) have nothing to migrate.
- The frozen Commerce manifest sketch (`07-package-architecture.md` §4) used `workspace:*` regular dependencies; it is
  annotated by the Commerce governance document and corrected under the Commerce freeze change control once this ADR is Accepted.

## Validation requirements

1. The producer validation (4a) and the clean-consumer verification (4b) exist as executable CI jobs **in each consuming
   repository** before its first publication.
2. For every consuming package, a dependency-class table (Decision 1) is reviewed against the **built** package, not only the design.
3. Peer and dev dependency ranges in packed manifests follow Decision 2.
4. Negative controls: the clean-consumer verification fails on a deliberately duplicated install (for example two `@comity/primitives`
   versions) and on a dev-only declaration reference (via the `skipLibCheck: false` compile); producer validation fails on a `file:`
   specifier in a packed manifest.
5. The clean-consumer verification is exercised against an intermediate or release-candidate graph, so that its floor and
   latest-in-range legs use explicit versions and cannot fail merely because `latest` moved.

## Dependencies on other decisions

- **ADR-033:** exact pins published by Comity undermine any peer declaration; this policy is only reliable on releases published after
  ADR-033's coordinated release. The cascade default of ADR-033 keeps Comity's published graph aligned with the graph its CI tests.
- **ADR-035:** supplies the **producer-side** declaration and tarball validation. It is *not* executed inside the clean-consumer step.
- **ADR-034** (`Accepted` 2026-11-04): applies to every Comity package, so the `require` leg (4b step 7) is **unconditional**. It tests Node 24+ `require(ESM)` compatibility of the single ESM build; it is not conditional on any CommonJS promise, because Comity makes none.
- **ADR-008:** unchanged; Core-to-Core registration for new Core packages remains per ADR-008.
- Open Commerce governance decisions (repository approval, namespace, `repository.type`) remain open and are not prerequisites for this policy.

## Acceptance status and remaining questions

**Accepted 2026-11-04** by Comity maintainer decision (see Provenance). No architectural question about this ADR's content
remains open: declaration classes, ranges, local development, the producer/consumer split and the centralized-policy /
local-enforcement model are decided (D-06, D-08) and were confirmed at acceptance, together with the verification baseline below.

One **sequencing** decision outside this ADR has been **CONFIRMED** — resolution record **A1** (architecture owner, 2026-11-04): **WP-B
(ESM-only implementation) must be complete before the first Commerce package is published.** **No Commerce package may be published before
WP-B is completed**, and packaging and toolchain compatibility must be verified before the first publication. It was **not** decided by this
ADR's acceptance — it is a separate architecture-owner decision, and **it authorises no work package** (see the B10 responsibility model).
It does not block WP-D1; it blocks the Commerce first-publication milestone and shapes the design of WP-D3's `require` leg (a Commerce
package must itself ship the uniform export map and pass the unconditional `require` leg of §4b step 7).

### Confirmed at acceptance

1. **The initial official verification baseline is pnpm 12.16.1 on Node 24+**, confirmed by the maintainers on acceptance. This is
   the toolchain the policy's verification claims are made against; npm, Yarn, hoisted layouts, bundlers and non-Node runtimes are
   not verified and no compatibility is claimed for them (§4b). It is a **verification baseline**, not a consumer minimum-version
   guarantee. (An earlier draft proposed pnpm 10.13.x; that proposal is **superseded** — see §4b for the relationship to the
   `packageManager` pins, which are an implementation task.)

### Deferred — explicitly not a prerequisite for acceptance

2. Whether to extend `repository-ownership.md` to cover Commerce. A separate governance decision, not made here and not required
   by this ADR: §6 cites that document only for Development's ownership of Comity-wide standards, and this ADR asserts no
   authority over another repository's CI. Likewise the open Commerce governance decisions (repository approval, namespace,
   `repository.type`) are **not** prerequisites for this policy (see "Dependencies on other decisions").

Resolved by the architecture owner (D-06, D-08): Comity-wide scope; producer validation separate from clean-consumer verification;
local enforcement; tarballs for local development; registry-equivalent clean-consumer verification for final checks. Whether a
consumer promises CommonJS is no longer open: Comity supports ESM and Node 24+ `require(ESM)` compatibility, not CommonJS modules, and ADR-034's single ESM contract applies to every Comity package. Formal maintainer
acceptance remains pending.

## References

ADR-008, ADR-033, ADR-034, ADR-035; `adapters.md` §13; `development/docs/architecture/repository-ownership.md` (Development's ownership of
Comity-wide standards; does not cover Commerce); `commerce/docs/governance/package-dependency-policy.md`;
`commerce/docs/architecture/resolution/architecture-freeze-assessment.md` (open governance decisions).

## Scope

This ADR defines declaration classes, ranges, local development, verification responsibilities and enforcement responsibilities for
packages outside comity-community. It does not create a repository, decide a namespace, or change any manifest.
