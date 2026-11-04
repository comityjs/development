# Dependency Remediation Roadmap — Comity / Commerce

**Status:** Proposed planning document. **Date:** 2026-11-04. **Owner:** comity-development.
**Authorisation:** documentation and planning only. **No source-code, manifest, build, CI, Changesets or validator change is authorised by this document or by the
ADRs it references.** Each work package below needs its own implementation task and the approvals listed in §8.

## 1. Decisions and where they are recorded

| Owner direction (2026-11-04) | Recorded in | Status |
|---|---|---|
| A. `workspace:^` for internal sibling references; coordinated patch release; mandatory `Version Packages` review gate | ADR-033; `docs/standards/release-review.md` | Proposed |
| B. One ESM build serves `import` and Node `require`; stop `dist/cjs`; amend ADR-022's distribution paragraph | ADR-034 | Proposed |
| C. New `@comity-dev/validate` engine on built `.d.ts`; error severity; `typescript` as runtime dependency | ADR-035; `packages/validate/docs/declaration-dependencies-design.md` | Proposed / Draft |
| D. Commerce → Comity dependency policy (peer + dev / dependencies / dev-only / none, per package) | ADR-036 (Comity-wide); `commerce/docs/governance/package-dependency-policy.md` | Proposed |
| E. Local development with packed tarballs and `pnpm.overrides` | ADR-036 §3; Commerce policy §6 | Proposed |
| F. Clean-consumer verification before publishing | ADR-036 §4; Commerce policy §7 | Proposed |

**Facts that shaped the formalisation (verified 2026-11-04):**

- ADR-022's dual ESM/CJS paragraph is **scoped to the two CLI packages** and states it is independent of "the repository-wide CJS
  compatibility contract". That contract is not an ADR; it is stated in `community/docs/architecture/repository.md`, `community/SKILL.md` and
  `community/docs/.documentation/AGENT.md`. ADR-034 therefore amends ADR-022's paragraph **and** replaces the repository-wide convention.
- ADR-010 requires gradual enforcement only for rules with migration backlog; the declaration rule has none (prototype: zero findings), so error severity is consistent with it.
- `community` is on `feature/acl-casl-fields` at `0e2bb15`, **behind `origin/main`** (`3391f94`, which published `acl@0.9.2`, `acl-casl@0.10.0`). All implementation branches start from `origin/main`.
- Changesets in comity-community assigns a **major** to every peer dependent when a peered package gets a minor/major release. A patch does not (verified).
- `require(esm)` loads all 123 export entries of the 54 packages with no warning on Node 24.0.0, 24.4.0 and 24.19.0. Bundlers and non-Node runtimes are untested.

## 2. Work packages

Sizes are relative (S/M/L). Priority: **P0** correctness blocker; **P1** required before Commerce package publication; **P2** preventive; **Independent** deliverable without blocking other work.

| ID | Work package | Repo | Priority | Size | Depends on | Acceptance |
|---|---|---|---|---|---|---|
| WP-0 | Review and accept (or amend) ADR-033…036; record `release-review.md` adoption | development | P0 | M | maintainers | Statuses updated by maintainers (not by agents) |
| WP-A1 | Migrate sibling references to `workspace:^` (§3) | community | **P0** | M | WP-0 (ADR-033) | Re-counted from `origin/main`; exceptions listed; no `workspace:*` left in sibling `dependencies`/`peerDependencies` except recorded exceptions |
| WP-A2 | Coordinated patch release of every package with a sibling edge | community | **P0** | M | WP-A1, release-review gate | Packed manifests carry `^<version>`; clean-consumer checks of ADR-033 pass |
| WP-B | Remove `dist/cjs`; serve ESM to `require`; tests on tarballs; update docs | development (`comity-build`) + community (export maps) | **P0**, Independent | M | WP-0 (ADR-034) | ADR-034 validation requirements 1–5 pass on Node 24.0.0 and current 24.x |
| WP-C1 | Implement `declaration-dependencies` engine and tests | development | P1, Independent | M | WP-0 (ADR-035) | Design §10 tests pass; **zero findings** on the current comity-community build |
| WP-C2 | Release `@comity-dev/validate` (minor); bump consumers; add to CI after build | development, community | P1 | S | WP-C1 | CI runs the engine after `pnpm build` |
| WP-D1 | Adopt Commerce policy; amend 07 §4 sketch under freeze change control | commerce | P1 | S | ADR-036 accepted | Sketch corrected; freeze record updated |
| WP-D2 | Document local tarball workflow in the Commerce repository when it exists | commerce | P2 | S | Commerce repository approved | Procedure of policy §6 reproducible |
| WP-D3 | Commerce clean-consumer CI job | commerce | P1 (before first publication) | L | Commerce workspace, WP-C1 or equivalent script | Policy §7 job passes and its negative controls fail as designed |
| WP-DOC | Documentation corrections on acceptance (§6) | development, community | P2 | S | ADR acceptances | Docs state the implemented behaviour |
| WP-A3 | Peer-major cascade decision (escalation path of the gate) | development | P0 *when a peered Core Module needs a minor* | S | maintainers | Recorded decision (accept, split release, or separate design) |

## 3. WP-A1 — migration scope (verified count)

Counted on `origin/main` (`3391f94`) on 2026-11-04: **94** sibling `dependencies` references and **26** sibling `peerDependencies` references = **120**, in **50** packages
(19 with peer references). All are `workspace:*`; none uses another protocol. Sibling `devDependencies` (2, in `cli-commander`) stay unchanged. Packages without sibling
edges (`primitives`, `media`, `seo`, `graphql-builder`) are not touched.

The table is the **verification worklist**: each package's references are reviewed against its export map and conventions (exception test of ADR-033 Decision 4).
Expected result after publication of a coordinated patch where every sibling is at version V: `^V` for each listed reference.

| Package | Version at count | Sibling `dependencies` | Sibling `peerDependencies` | Layer |
|---|---|---|---|---|
| `@comity/acl-casl` | 0.10.0 | 2 | 1 | technology-adapter |
| `@comity/acl` | 0.9.2 | 1 | 0 | core |
| `@comity/address` | 0.9.1 | 2 | 0 | core |
| `@comity/auth-jose` | 0.9.1 | 4 | 2 | technology-adapter |
| `@comity/auth-tokens` | 0.9.1 | 2 | 0 | core |
| `@comity/auth` | 0.9.1 | 2 | 0 | core |
| `@comity/cache-kv` | 0.9.1 | 3 | 3 | technology-adapter |
| `@comity/cache-redis` | 0.9.1 | 3 | 3 | technology-adapter |
| `@comity/cache` | 0.9.1 | 2 | 0 | core |
| `@comity/catalog` | 0.9.1 | 3 | 0 | core |
| `@comity/cli-commander` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/cli` | 0.9.1 | 1 | 0 | core |
| `@comity/composition` | 0.9.1 | 2 | 0 | composition |
| `@comity/content` | 0.9.1 | 3 | 0 | core |
| `@comity/customer` | 0.9.1 | 3 | 0 | core |
| `@comity/geography` | 0.9.1 | 1 | 0 | core |
| `@comity/graphql-client-fetch` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/graphql-client-ws` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/graphql-client` | 0.9.1 | 2 | 0 | core |
| `@comity/html-preact` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/html-react` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/html` | 0.9.1 | 1 | 0 | core |
| `@comity/http-fetch` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/http-hono` | 0.9.1 | 3 | 3 | technology-adapter |
| `@comity/http` | 0.9.1 | 3 | 0 | core |
| `@comity/hydration-preact` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/hydration-react` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/hydration` | 0.9.1 | 1 | 0 | core |
| `@comity/i18n-typesafe` | 0.9.1 | 3 | 1 | technology-adapter |
| `@comity/i18n` | 0.9.1 | 2 | 0 | core |
| `@comity/identity` | 0.9.1 | 2 | 0 | core |
| `@comity/inventory` | 0.9.1 | 1 | 0 | core |
| `@comity/kernel` | 0.9.1 | 1 | 0 | kernel |
| `@comity/order` | 0.9.1 | 3 | 0 | core |
| `@comity/organization` | 0.9.1 | 1 | 0 | core |
| `@comity/payment` | 0.9.1 | 3 | 0 | core |
| `@comity/pricing` | 0.9.1 | 1 | 0 | core |
| `@comity/queue-pg-boss` | 0.10.0 | 2 | 1 | technology-adapter |
| `@comity/queue` | 0.10.0 | 1 | 0 | core |
| `@comity/router-path-to-regexp` | 0.9.1 | 1 | 1 | technology-adapter |
| `@comity/router` | 0.9.1 | 3 | 0 | core |
| `@comity/search` | 0.9.1 | 1 | 0 | core |
| `@comity/sql-drizzle` | 0.9.0 | 1 | 1 | technology-adapter |
| `@comity/sql-kysely` | 0.9.2 | 1 | 1 | technology-adapter |
| `@comity/sql` | 0.9.1 | 1 | 0 | core |
| `@comity/storage` | 0.9.1 | 2 | 0 | core |
| `@comity/storefront` | 0.9.1 | 6 | 0 | core |
| `@comity/taxonomy` | 0.9.1 | 3 | 0 | core |
| `@comity/validation-zod` | 0.9.1 | 2 | 1 | technology-adapter |
| `@comity/validation` | 0.9.1 | 1 | 0 | core |

`@comity-dev/*` references in comity-development (7 in `cli` and `validate`) may adopt the same rule (ADR-033 open question 3); they have no identity concern and are P2.

## 4. Sequencing

```text
WP-0 (acceptances) ─┬─► WP-A1 ─► [release-review gate] ─► WP-A2  ─┐
                    ├─► WP-B  (Independent; patch)  ───────────────┤  may share one release train with A2
                    └─► WP-C1 ─► WP-C2 (Independent; guards A1/B)  │
ADR-036 accepted ───► WP-D1 ─► (Commerce repository approved) ─► WP-D2 ─► WP-D3 ─► first Commerce publication
WP-A2 ─────────────────────────────────────────────────────────────► first Commerce publication
```

- **WP-C before or alongside WP-A1/WP-B.** It has zero current findings, so it blocks nothing, and it guards the other two. Preferred order of implementation:
  **WP-C1 → WP-A1 → WP-B**, delivered as separate PRs.
- **WP-B independent of WP-A.** It touches `comity-build` and export maps only. Ship it as a **patch** (ADR-034) to avoid the peer-major cascade. It may share one
  release train with WP-A2 if both pass their tarball verification; otherwise ship separately. This is the release owner's call.
- **Coordinated release (WP-A2):** all packages with sibling edges in **one** `Version Packages` PR, patch only (a patch does not trigger the peer-major rule).
- **Phase A is not blocked.** The `@comity/order` extension (ADR-032, authorisation pending) needs none of these work packages. Publishing `@comity/order@0.10.0` after WP-A2
  is recommended so that it ships caret ranges; if it is published first, consumers rely on `pnpm.overrides` until the next release. Nothing here changes Phase A's authorisation status.
- **Prerequisites by milestone.**

| Milestone | Required work packages |
|---|---|
| Phase A (`@comity/order` implementation) | none of these |
| Commerce workspace scaffolding | repository, namespace and ownership decisions (freeze #1–#3); ADR-036 accepted |
| First Commerce package **publication** | WP-A2, WP-C1/C2 (or equivalent script), WP-D1, WP-D3; WP-B only if Commerce promises CommonJS |
| Comity-wide package publication correctness | WP-A1/A2, WP-B, WP-C |

## 5. Release plan detail

1. **WP-A2.** One changeset listing every package in §3 as `patch` (the explicit list is required because a sibling patch no longer cascades to `workspace:^` dependents).
   Review the generated PR under `release-review.md`; inspect packed manifests; run the clean-consumer checks of ADR-033; publish.
2. **WP-B.** A patch changeset per package whose export map changes, or a shared one. Validation per ADR-034 on packed tarballs before publishing.
3. **Recovery** (all): forward-only. Move the `latest` dist-tag back, `npm deprecate` the faulty versions, publish a corrective patch (ADR-033). Prepare the commands and message before merging the release PR.
4. **Old exact-pinned versions** remain on the registry; whether to deprecate them after WP-A2 is an owner decision (ADR-033 open question 4).

## 6. Documentation to correct on acceptance (not done now)

Standards and descriptive documents state current behaviour (`development/AGENTS.md`: "Documentation must never invent future APIs"), so they change when the decisions are
implemented or accepted, not before:

| Document | Correction | Trigger |
|---|---|---|
| `development/docs/standards/adapters.md` §13 | `workspace:*` examples and wording → `workspace:^`; range rule | ADR-033 accepted |
| `development/docs/standards/runtime-support.md` §1 | Node `require()` of the ESM build; verified Node range; limitations | ADR-034 implemented |
| `development/docs/standards/decisions/ADR-022-…md` | One-line "Amended by ADR-034" pointer (text otherwise unchanged) | ADR-034 accepted |
| `community/docs/architecture/repository.md` (line 211), `community/SKILL.md` (line 132), `community/docs/.documentation/AGENT.md` (line 41) | Replace "dual ESM/CJS" wording | ADR-034 implemented |
| `development/docs/standards/architecture-validation.md` | Mention the declaration rule family | ADR-035 implemented |
| `development/packages/validate/README.md` | Document the new category | ADR-035 implemented |
| `commerce/docs/architecture/07-package-architecture.md` §4 | Correct the manifest sketch | ADR-036 accepted (note already added) |

## 7. Risks and compatibility summary

| Risk | Mitigation |
|---|---|
| A peered Core Module minor releases all its adapters as `1.0.0` | `release-review.md` §3.2 and §4 block it; escalate under WP-A3 |
| Caret floors ratchet: consumers must move siblings together | Coordinated release; release notes |
| Old exact pins persist for mixed old/new graphs | Documented; `pnpm.overrides`; optional deprecation |
| Bundlers or non-Node runtimes relying on `dist/cjs` | Not claimed; optional smoke test; patch release with notes |
| Future top-level `await` breaks `require(esm)` | ADR-034 test 3 in CI |
| Validator misses ambient globals or installed duplicates | Documented limits; clean-consumer verification covers the rest |
| Commerce peer ranges too narrow under 0.x | Expected; widen only after verification on both minors |
| Implementing from the stale local checkout | Start from `origin/main` |

## 8. Approvals still required (none given by this document)

1. Maintainer review and acceptance of ADR-033, ADR-034, ADR-035, ADR-036 and adoption of `release-review.md` (status changes are made by maintainers).
2. Release owner: the coordinated patch release; whether WP-B shares its release train; deprecation of exact-pinned versions.
3. Semver class of the ESM change (patch proposed).
4. How a peer-driven major is handled when a peered Core Module needs a minor (WP-A3).
5. Commerce owner: ADR-036 adoption; repository, namespace and ownership (freeze decisions #1–#3, unchanged by this work).
6. Separate implementation authorisation for each work package.

## 9. Scope confirmation

Created by this documentation task: ADR-033, ADR-034, ADR-035, ADR-036, `docs/standards/release-review.md`, this roadmap, the
validator design document, and the Commerce policy document.

The Commerce working tree (vs HEAD `40c187e`) is described below as it actually is, not reduced to "two minimal cross-reference
edits". The exact author/pass of each uncommitted change cannot be reconstructed from the working tree alone; where a change is a
documented correction, that is stated.

| File | Working-tree change (vs HEAD) |
|---|---|
| `docs/architecture/07-package-architecture.md` | §4 dependency-fields note pointing at the governance policy and ADR-036 (cross-reference) |
| `docs/architecture/12-implementation-roadmap.md` | Phase A status `READY TO START` → `DESIGN READY — IMPLEMENTATION AUTHORIZATION PENDING` |
| `docs/architecture/README.md` | Phase A status: implementation authorization pending (ADR-032 + DESIGN.md + Community review) |
| `docs/architecture/resolution/architecture-freeze-assessment.md` | Freeze-record Phase A authorization gate, plus the open governance-decision register #1–#6 (item #4 points at ADR-036 and the governance policy) |
| `docs/architecture/resolution/final-freeze-report.md` | Phase A status corrected to design-ready / authorization pending (header and §11) |
| `docs/governance/package-dependency-policy.md` (untracked) | New Commerce application of ADR-036 |

The dependency-remediation task's own Commerce edits are the cross-references: the 07 §4 note and the governance-decision register
(whose item #4 points at ADR-036 and the governance policy). The Phase A status changes in the README, implementation roadmap,
freeze assessment and final freeze report are the freeze record's own "Correction 2026-11-04" (an earlier text read
"Phase A: READY TO START"; that was premature because `@comity/order` is a Comity-owned, published Core Module). They are present
in the working tree but are not attributed to this documentation task.

Relative to HEAD, the Phase A authorisation status **is changed** (from `READY TO START` to `DESIGN READY — IMPLEMENTATION
AUTHORIZATION PENDING`); the earlier statement that it is "unchanged" was wrong. The Phase A governance status itself is preserved:
design-ready, not authorized to implement, gated on ADR-032 (Accepted) + DESIGN.md + Community review. ADR-022 and
ADR-029/030/031/032 are unchanged by this task; ADR-032 remains `Proposed`.

No manifest, lockfile, source, build or CI file, Changesets configuration or validator rule was changed.
