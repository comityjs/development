# Dependency Remediation Roadmap — Comity / Commerce

**Status:** Proposed planning document. **Date:** 2026-11-04 (revised for architecture-owner decisions D-01…D-08, recorded in
`docs/standards/reviews/dependency-policy-decision-resolution.md`; updated the same day for the **formal maintainer acceptance of
ADR-033…036** and the **adoption of `release-review.md`**). **Owner:** comity-development.
**ADR-033, ADR-034, ADR-035 and ADR-036 are `Accepted` (2026-11-04); `release-review.md` is adopted (2026-11-04).** Acceptance and
adoption are **governance actions only — they authorise no work package.** The architecture-owner decisions D-01…D-08 likewise
authorise none.
**Authorisation:** documentation and planning only. **No source-code, manifest, build, CI, Changesets or validator change is authorised by this document or by the
ADRs it references.** Each work package below needs its own implementation task and the approvals listed in §8.

> **WP-C1 closure (2026-11-05).** WP-C1 is `COMPLETED`: implementation and verification evidence are recorded in
> `docs/standards/reviews/dependency-policy-decision-resolution.md` (B10 model; D-03/D-04/D-05 status). No other
> implementation work package was `AUTHORIZED` or `STARTED` at that closure.
>
> **WP-C2 authorisation (2026-11-05).** The architecture owner **AUTHORIZED WP-C2 under B10** on **2026-11-05**; the release
> owner **APPROVED the WP-C2 release scope** on the same date. The approvals are distinct and recorded in the decision-resolution
> record's B10 model. Neither authorises WP-C3 or later work.
>
> **WP-C2 release-execution authorization (2026-11-05).** The release owner **AUTHORIZED EXECUTION of the WP-C2 release** on
> **2026-11-05**, based on the approval given in the current project conversation on the same date. Authorized scope:
> `@comity-dev/validate@0.3.0`, `@comity-dev/cli@0.2.4` if the Changesets calculation still requires it, release tags through
> the established procedure, Community consumer and lockfile migration, stage-1 declaration validation in Community CI after
> `pnpm build`, and registry/consumer/build/validation/CI verification. No WP-C3, WP-C4, WP-D* or unrelated release is authorized.
> The release gate is **SATISFIED**; WP-C2 remains `STARTED` until publication, migration and CI activation are verified.

## 1. Decisions and where they are recorded

| Owner direction (2026-11-04) | Recorded in | Status |
|---|---|---|
| A. `workspace:^` for internal sibling references — scoped to **every published sibling dependency under Comity governance** (`@comity/*` in community, `@comity-dev/*` in development, and consuming repositories under ADR-036); coordinated patch release; Changesets peer-major cascade accepted as the default release strategy (D-01); mandatory `Version Packages` review, trigger-based (D-07) | ADR-033; `docs/standards/release-review.md` | **ADR-033 Accepted** (2026-11-04); **`release-review.md` Adopted** (2026-11-04) |
| B. One ESM build for **every** Comity package including CLI and `queue-pg-boss`; `import` and Node 24+ `require(esm)` resolve to it; stop `dist/cjs`; supersede ADR-022's distribution paragraph (D-02) | ADR-034; ADR-022 (partially superseded) | **ADR-034 Accepted** (2026-11-04); ADR-022 remains `Accepted` — definitive supersession pointer in place, historical text preserved. **Implementation VERIFIED COMPLETE on published tarballs** (2026-11-04); formal WP-B completion ratification and release semver class remain pending owner approval |
| C. `@comity-dev/validate`: stage 1 workspace declaration validation and stage 2 tarball validation (D-03); name-agnostic deterministic discovery (D-04); missing-build `CONFIGURATION-ERROR` and always-visible findings (D-05); `typescript` as runtime dependency | ADR-035; `packages/validate/docs/declaration-dependencies-design.md` | **ADR-035 Accepted** (2026-11-04, with severity `error` and `typescript` as a runtime dependency); design document Draft; **stage 1 (WP-C1) implementation COMPLETE and verified 2026-11-05; WP-C2 AUTHORIZED 2026-11-05 (release scope approved; release execution authorized 2026-11-05); stage 2 (WP-C3) not implemented** |
| D. Comity-wide dependency policy for packages outside community (peer + dev / dependencies / dev-only / none, per package), enforced locally per repository (D-08) | ADR-036; `commerce/docs/governance/package-dependency-policy.md` | **ADR-036 Accepted** (2026-11-04, verification baseline pnpm 12.16.1 / Node 24+); Commerce policy `Proposed` — **adoption AUTHORIZED** by the Commerce owner (B8(a), 2026-11-04); operative effect awaits **B8(b)** (repository/namespace/`repository.type`, still OPEN) and **WP-D1** (NOT AUTHORIZED) |
| E. Local development with packed tarballs and `pnpm.overrides` | ADR-036 §3; Commerce policy §6 | **ADR-036 Accepted**; documented policy only — not enforced, no job exists |
| F. Clean-consumer verification before publishing, **separate from** producer declaration/tarball validation (D-06) | ADR-036 §4; Commerce policy §7 | **ADR-036 Accepted**; documented policy only — no clean-consumer job exists in any repository |

**Facts that shaped the formalisation (verified 2026-11-04):**

- ADR-022's dual ESM/CJS paragraph is **scoped to the two CLI packages** and states it is independent of "the repository-wide CJS
  compatibility contract" (and that the CLI architecture does not require CJS). That contract is not an ADR; it is described in
  `community/docs/architecture/repository.md`, `community/SKILL.md` and `community/docs/.documentation/AGENT.md`. ADR-034 therefore
  supersedes ADR-022's paragraph (in part) **and** replaces the repository-wide convention, for every package including the CLI packages.
- **Terminology (ADR-034):** Comity supports ESM distribution (one ESM build) and Node 24+ `require(ESM)` compatibility; it does not support CommonJS modules or builds. The `require` condition resolves to the same ESM file as `import`; the old `dist/cjs` tree was CommonJS-syntax output evaluated as ESM, never a working CommonJS build.
- `@comity/queue-pg-boss` is the only community package with no `require` condition and no `main` (53 of 54 route `require` to `dist/cjs`);
  its docs describe a deliberate ESM-only workaround for the same defect. ADR-034 makes it conform to the uniform export map (no exception).
  The eight `@comity-dev/*` packages already have no `require` condition and no `dist/cjs`.
- ADR-010 requires gradual enforcement only for rules with migration backlog; the declaration rule has none (prototype: zero findings), so error severity is consistent with it.
- As of 2026-11-04 the local `community` checkout is `main` at `bc858d7` (merge of PR #15, publish workflow). Implementation branches start from this up-to-date `main`; WP-A1's baseline was re-counted against it.
- Changesets in comity-community assigns a **major** to every peer dependent when a peered package gets a minor/major release. A patch does not (verified). **D-01: the cascade is the accepted default**; a split release (`changeset version --ignore`) is not adopted and is possible only as a separately authorised pilot (it needs a script/workflow change and publishes an untested peer/dependent window).
- `require(esm)` loads all 123 export entries of the 54 packages with no warning on Node 24.0.0, 24.4.0 and 24.19.0. Bundlers and non-Node runtimes are untested.

## 2. Work packages

Sizes are relative (S/M/L). Priority: **P0** correctness blocker; **P1** required before Commerce package publication; **P2** preventive; **Independent** deliverable without blocking other work.

| ID | Work package | Repo | Priority | Size | Depends on | Acceptance |
|---|---|---|---|---|---|---|
| WP-0 | ~~Review and accept (or amend) ADR-033…036; record `release-review.md` adoption~~ **Complete 2026-11-04:** ADR-033…036 all `Accepted`; `release-review.md` adopted | development | **Done** | — | maintainers | Statuses updated by maintainers (not by agents) — done. **Acceptance authorises no other work package** |
| WP-A1 | Migrate sibling references to `workspace:^` (§3) | community | **P0** | M | WP-0 (ADR-033) | **Baseline VERIFIED on current main `bc858d7` (2026-11-04): 120 references in 50 packages = 94 `dependencies` + 26 `peerDependencies`; 2 sibling `devDependencies`; 0 exceptions; 0 `workspace:^`.** **Status: NOT AUTHORIZED (B10).** Exceptions listed; no `workspace:*` left in sibling `dependencies`/`peerDependencies` except recorded exceptions |
| WP-A2 | Coordinated patch release of every package with a sibling edge — **RELEASE APPROVED** (B6, release owner, 2026-11-04); scope and conditions **unchanged** | community | **P0** | M | WP-A1, release-review gate | Packed manifests carry `^<version>`; clean-consumer checks of ADR-033 pass. **Status: RELEASE APPROVED; implementation PENDING OWNER APPROVAL; NOT STARTED.** Execution is blocked by **WP-A1**, which is **NOT AUTHORIZED** (B10). The B6 approval covers this release activity only — not unrelated releases and no scope expansion |
| WP-A4 | Migrate the **7** `@comity-dev/*` sibling `dependencies` to `workspace:^` and release them (ADR-033 "Scope of the range rule": `cli` 3, `validate` 4) | development | P2, Independent | S | WP-0 (ADR-033) | Re-counted; no `workspace:*` left in `@comity-dev/*` sibling `dependencies` except recorded exceptions; packed manifests carry `^<version>`. **Not** a precondition of WP-A1 or WP-A2 |
| WP-B | Remove `dist/cjs`; one uniform ESM export map for **all** packages (flat `dist/`, `types` + `default`; ADR-034 Amendment 1) **including CLI packages and `queue-pg-boss`** (no exception); tests on tarballs; update docs, incl. `queue-pg-boss` docs and `runtime-support.md` §1–§3 | development (`comity-build`) + community (export maps) | **P0**, Independent | M | WP-0 (ADR-034) | ADR-034 validation requirements 1–5 pass on Node 24.0.0 and current 24.x for every package. **Status: implementation VERIFIED COMPLETE on all 54 published tarballs / 123 subpaths (2026-11-04); formal completion ratification PENDING OWNER APPROVAL; semver class PENDING RELEASE OWNER; releases PUBLISHED.** **A1 (CONFIRMED 2026-11-04): WP-B is a hard prerequisite — no Commerce package may be published before WP-B is completed.** WP-B must ensure the Commerce packages use the ESM-only distribution model required by ADR-034, and packaging and toolchain compatibility must be verified before the first publication. **The A1 confirmation does NOT authorise WP-B** (B10) |
| WP-C1 | Implement stage 1 workspace `declarations` engine, deterministic name-agnostic discovery, always-visible findings, and tests | development | P1, Independent | M | WP-0 (ADR-035) | Design §10 tests pass; **zero findings** on the current comity-community build, with total and reachable counts reported separately. **Status: COMPLETED 2026-11-05.** B10 authorization was granted 2026-11-04. Evidence: 25 design §10 tests; `pnpm type-check` pass; `pnpm --filter @comity-dev/validate test` 79/79 pass and full `pnpm test` pass; `pnpm self-validate` pass; Community validation pass with 54 packages / 537 declaration files (485 entry-reachable) / 0 findings / exit 0; `git diff --check` clean in all three repositories. Full command evidence is in the decision-resolution record's B10 model. |
| WP-C2 | Release `@comity-dev/validate` (minor); bump consumers; add stage 1 to CI after build | development, community | P1 | S | WP-C1 | CI runs the engine after `pnpm build`. **Status: RELEASE EXECUTION AUTHORIZED; STARTED 2026-11-05; NOT COMPLETED.** The architecture owner authorized WP-C2 under B10; the release owner approved the WP-C2 scope and then authorized release execution on 2026-11-05. Authorized scope: publish `@comity-dev/validate@0.3.0` and `@comity-dev/cli@0.2.4` if required, create release tags through the established procedure, migrate Community consumers and lockfile, activate stage-1 declaration validation in Community CI after `pnpm build`, and verify the registry/consumer/build/validation/CI workflow. The minor changeset for `@comity-dev/validate@0.3.0` remains the release input. |
| WP-C3 | Implement stage 2 `packed-surface` (tarball) validation (design §12); add to release CI before publication | development, community | P1 (before first Commerce publication) | M | WP-C1 | Design §12 tests pass; validates `files`/`exports` effects on real tarballs |
| WP-D1 | Adopt Commerce policy; amend 07 §4 sketch under freeze change control | commerce | P1 | S | ADR-036 `Accepted` (done); **B8(a)** adoption authorised (done); **B9** ADR-036 reference alignment (done) | **Status: NOT AUTHORIZED, NOT STARTED.** Adoption is authorised (B8a) and the two frozen documents' ADR-036 references are aligned (B9). The **`07 §4` manifest sketch is still uncorrected** — that change is **outside B9's authorised scope** and is proposed as **B9(b) / WP-D1**, **PENDING OWNER APPROVAL**. WP-D1 completion still requires the sketch correction plus **B10** authorisation |
| WP-D2 | Document local tarball workflow in the Commerce repository when it exists | commerce | P2 | S | Commerce repository approved | Procedure of policy §6 reproducible |
| WP-D3 | Commerce producer validation (stages 1–2 or equivalent script, run in the Commerce workspace) **and** a separate clean-consumer CI job (fresh directory; does not invoke the validator) | commerce | P1 (before first publication) | L | Commerce workspace; WP-C1/WP-C3 or equivalent script | Policy §7 jobs pass and their negative controls fail as designed |
| WP-DOC | Documentation corrections on acceptance (§6) | development, community | P2 | S | ADR acceptances | Docs state the implemented behaviour |
| WP-A3 | ~~Peer-major cascade decision~~ **Closed by D-01:** the cascade is the default. A split-release **pilot** (script/workflow change, real-graph rehearsal, window handling, published-combination verification) remains an optional, separately authorised future work package | development | Optional | — | separate authorisation | Not required for any other work package |
| WP-E | **pnpm 12.16.1 toolchain migration** — a **separate coordinated activity** across **all three** repositories (community, development, commerce). Eventual scope, as applicable: `packageManager` declarations; lockfiles; CI configurations; GitHub Actions and other workflows; scripts and build tooling; repository configuration; documentation; and **compatibility plus clean-install verification in every repository** | community, development, commerce | Independent | L | **Its own scoped work package and explicit B10 authorisation** | **Status: NOT AUTHORIZED, NOT STARTED — recorded only.** The user has confirmed pnpm 12.16.1 as the intended version and that all three repositories must eventually be migrated; **nothing was migrated by this record.** No manifest, lockfile, CI, workflow, script, tooling or source file was changed, and no dependency was installed. Both monorepos still pin `packageManager: pnpm@10.13.1` with lockfile v9.0; ADR-036 §4b records that the verification baseline (pnpm 12.16.1 / Node 24+) and the pinned toolchain differ until WP-E lands. **This roadmap entry does not authorise the migration** |

## 3. WP-A1 — migration scope (verified count)

Re-counted on current `community` main (`bc858d7`) on 2026-11-04: **94** sibling `dependencies` references and **26** sibling `peerDependencies` references = **120**, in **50** packages
across **54** packages total. All are `workspace:*`; none uses another protocol. Sibling `devDependencies` (2, in `cli-commander`) stay unchanged. Packages without sibling
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

`@comity-dev/*` references in comity-development (7 in `cli` and `validate`) are covered by ADR-033's scope extension (WP-A4, P2); they have no identity concern.

## 4. Sequencing

```text
WP-0 (acceptances) ─┬─► WP-A1 ─► [release-review gate] ─► WP-A2  ─┐
                    ├─► WP-B  (COMPLETED evidence; B7 proposed "shipped separately") ─┐
                    └─► WP-C1 ─► WP-C2 (Independent; guards A1/B)  │
ADR-036 accepted ───► WP-D1 ─► (Commerce repository approved) ─► WP-D2 ─► WP-D3 ─┐
WP-A2 ───────────────────────────────────────────────────────────────────────────┤
WP-B COMPLETED (A1: CONFIRMED hard prerequisite) ────────────────────────────────┴─► first Commerce publication
```

- **WP-C before or alongside WP-A1.** Stage 1 has zero baseline findings, so it blocks nothing, and it guards the next migration. Preferred order of implementation:
  **WP-C1 → WP-A1 → WP-A2**, delivered as separate PRs. WP-B is already implemented and published. Stage 2 (WP-C3) is needed before publications whose tarball surface must be validated and before the first Commerce publication.
- **WP-B is complete in evidence and shipped separately.** It touched `comity-build` and export maps only and shipped as a **patch** (ADR-034). B7's proposed closure is “not applicable: WP-B shipped separately”; release-owner confirmation remains pending.
- **WP-B is a hard prerequisite for the first Commerce publication (A1, CONFIRMED 2026-11-04).** **No Commerce package may be published
  before WP-B is completed.** WP-B must ensure the Commerce packages use the ESM-only distribution model required by ADR-034, and
  packaging and toolchain compatibility must be verified before the first publication. This constrains **only** the Commerce
  first-publication milestone: it does not gate WP-A, WP-B or WP-C from starting once authorised under B10, and **the confirmation
  itself authorises no work package**.
- **Coordinated release (WP-A2):** all packages with sibling edges in **one** `Version Packages` PR, patch only (a patch does not trigger the peer-major rule).
- **Phase A is not blocked.** The `@comity/order` extension (ADR-032, authorisation pending) needs none of these work packages. Publishing `@comity/order@0.10.0` after WP-A2
  is recommended so that it ships caret ranges; if it is published first, consumers rely on `pnpm.overrides` until the next release. Nothing here changes Phase A's authorisation status.
- **Prerequisites by milestone.**

| Milestone | Required work packages |
|---|---|
| Phase A (`@comity/order` implementation) | none of these |
| Commerce workspace scaffolding | repository, namespace and ownership decisions (freeze #1–#3); ADR-036 accepted |
| First Commerce package **publication** | **WP-B COMPLETED (A1 — CONFIRMED hard prerequisite)**, WP-A2, WP-C1/C2 and WP-C3 (or an equivalent producer-side script), WP-D1, WP-D3 (producer validation and a separate clean-consumer job). ADR-034 applies to every Comity package, so Commerce packages follow the same ESM-only contract and the `require` leg of the clean-consumer job is unconditional. **A1 was CONFIRMED by the architecture owner on 2026-11-04: no Commerce package may be published before WP-B is completed**; WP-B must ensure the Commerce packages use ADR-034's ESM-only distribution model, and packaging and toolchain compatibility must be verified before the first publication (decision-resolution record §3 A1) |
| Comity-wide package publication correctness | WP-A1/A2, WP-B, WP-C (C1–C3) |

## 5. Release plan detail

1. **WP-A2.** One changeset listing every package in §3 as `patch` (the explicit list is required because a sibling patch no longer cascades to `workspace:^` dependents).
   Review the generated PR under `release-review.md`; inspect packed manifests; run the clean-consumer checks of ADR-033; publish.
2. **WP-B.** A patch changeset per package whose export map changes (all 54 community packages, including `queue-pg-boss`), or a shared one. Validation per ADR-034 on packed tarballs before publishing.
3. **Recovery** (all): forward-only. Move the `latest` dist-tag back, `npm deprecate` the faulty versions, publish a corrective patch (ADR-033). Prepare the commands and message before merging the release PR.
4. **Old exact-pinned versions** remain on the registry; whether to deprecate them after WP-A2 is an owner decision (ADR-033 open question 4).

## 6. Documentation to correct on acceptance (not done now)

Standards and descriptive documents state current behaviour (`development/AGENTS.md`: "Documentation must never invent future APIs"), so they change when the decisions are
implemented or accepted, not before:

| Document | Correction | Trigger |
|---|---|---|
| `development/docs/standards/adapters.md` §13 | `workspace:*` examples and wording → `workspace:^`; range rule | **ADR-033 accepted — trigger met 2026-11-04; applied the same day.** §13 now states the accepted range rule **and** records that existing manifests still use `workspace:*` until WP-A1 migrates them, so the standard does not misdescribe current practice |
| `development/docs/standards/runtime-support.md` §1 | Node `require()` of the ESM build; verified Node range; limitations | **WP-B** (updated as part of WP-B, not before: the standard describes current practice) |
| `development/docs/standards/decisions/ADR-022-…md` | A conditional note is already present; on acceptance convert it to a final pointer (text otherwise unchanged; history preserved) | **ADR-034 accepted — DONE 2026-11-04.** Definitive pointer in place; ADR-022's historical text preserved and its status unchanged |
| `development/docs/standards/runtime-support.md` §2, §3 | Scope the Edge/Workers and browser claims to the `import` condition; state `require`/`main` is unverified outside Node; no Node 24 requirement is placed on Edge/Workers/browser consumers | **WP-B** (same; deliberately unchanged in the documentation-only closure) |
| `community/packages/queue-pg-boss/docs/overview.md`, `docs/conventions.md` | Remove the "ESM-only until the shared build emits scope markers" exception text | ADR-034 implemented |
| `community/docs/architecture/repository.md` (line 211), `community/SKILL.md` (line 132), `community/docs/.documentation/AGENT.md` (line 41) | Replace "dual ESM/CJS" wording | ADR-034 implemented |
| `development/docs/standards/architecture-validation.md` | Mention the declaration rule family | ADR-035 implemented |
| `development/packages/validate/README.md` | Document the new category | ADR-035 implemented |
| `commerce/docs/architecture/07-package-architecture.md` §4 | Correct the manifest sketch | **ADR-036 accepted — trigger met 2026-11-04.** Under the **B9** authorisation the document's **ADR-036 status reference has been aligned** to `Accepted`, marked `[CHANGE CONTROL — 2026-11-04, B9]` (the same authorisation aligned `resolution/architecture-freeze-assessment.md` §5 item 4 and logged the exercise in its §7). **The manifest sketch itself was NOT corrected** — that is outside B9's authorised scope and remains a separate freeze change-control action for WP-D1 |

## 7. Risks and compatibility summary

| Risk | Mitigation |
|---|---|
| A peered Core Module minor releases all its adapters as `1.0.0` | Accepted by D-01. `release-review.md` §5.1 requires each peer-driven major to be classified, labelled and explained in release notes (`1.0.0` is one-way); a split-release pilot is optional and separately authorised |
| Caret floors ratchet: consumers must move siblings together | Coordinated release; release notes |
| Old exact pins persist for mixed old/new graphs | Documented; `pnpm.overrides`; optional deprecation |
| Bundlers or non-Node runtimes relying on `dist/cjs` | Not claimed; optional smoke test; patch release with notes |
| Future top-level `await` breaks `require(esm)` | ADR-034 test 3 in CI |
| Validator misses ambient globals or installed duplicates | Documented limits; clean-consumer verification covers the rest |
| Commerce peer ranges too narrow under 0.x | Expected; widen only after verification on both minors |
| Implementing from the stale local checkout | Start from `origin/main` |

## 8. Approvals and decisions still required (none given by this document)

Architecture-owner decisions D-01…D-08 are recorded in `docs/standards/reviews/dependency-policy-decision-resolution.md`. **Formal
maintainer acceptance of ADR-033…036 and adoption of `release-review.md` occurred on 2026-11-04**; neither the architecture-owner
decisions nor that acceptance **authorises any work package**. Each outstanding item is classified in that record (A architecture-owner,
B maintainer governance, C implementation, D deferred) with its authority and latest decision point. In summary:

1. **Maintainer governance (B):** ~~formal acceptance of ADR-033, ADR-034, ADR-035, ADR-036; adoption of `release-review.md`; the
   pnpm/Node verification target~~ — **done 2026-11-04**. All four ADRs are `Accepted`, the standard is adopted, and the verification
   baseline is confirmed as **pnpm 12.16.1 / Node 24+** (superseding the earlier pnpm 10.13.x proposal). **Still outstanding:** the
   **semver class** of the ESM change (patch proposed) — decided at WP-B's release, not at acceptance.
2. **Release owner (B):** ~~the coordinated patch release (WP-A2)~~ — **APPROVED 2026-11-04 (B6)**; the release-owner gate for WP-A2 is
   **SATISFIED**, with scope and conditions preserved unchanged and no authorisation for unrelated releases or scope expansion. WP-A2 is
   **RELEASE APPROVED; implementation PENDING OWNER APPROVAL; NOT STARTED** — blocked by WP-A1, which is **NOT AUTHORIZED** (B10). **Still outstanding:** whether WP-B shares its
   release train (**B7**).
3. **Architecture owner (A):** ~~whether WP-B must precede the first Commerce package publication~~ — **CONFIRMED 2026-11-04 (A1): YES,
   WP-B is a hard prerequisite** (see §4 milestone table). No Commerce package may be published before WP-B is completed. **The
   confirmation does not authorise WP-B.**
4. **Commerce owner (B):** ~~ADR-036 adoption~~ — **AUTHORIZED 2026-11-04 (B8a)**; freeze change control for the ADR-036 reference
   alignment — **AUTHORIZED 2026-11-04 (B9**, narrow scope, executed in the two named frozen documents**)**. **Still outstanding:**
   repository, namespace and `repository.type` (**B8(b)**, freeze decisions #1–#3, unchanged by this work) and B9's `07 §4`
   **manifest-sketch** change control, which is outside B9's authorised scope.
5. **Implementation owners (C), within WP-C3:** tarball reading method (**C1**) remains open. WP-C1 choices C2–C4 and WP-B choices
   C5–C6 are settled/executed; no further decision is needed for WP-C1 or WP-B.
6. **Deferred (D):** deprecation of old exact-pinned versions (a registry-maintenance concern, decided after WP-A2 publishes; no
   schedule is proposed); a split-release pilot; extending `repository-ownership.md` to Commerce. ~~Extension of the range rule to
   `@comity-dev/*`~~ is **no longer deferred**: ADR-033's "Scope of the range rule" resolves it — Decision 1 applies to those 7
   published sibling references, because the verified evidence establishes no different release policy. Its migration is WP-A4.
7. **Separate implementation authorisation for each work package — B10 CONFIRMED 2026-11-04.** The **architecture owner** formally
   authorises each work package and approves its scope before execution; **repository maintainers** manage and verify repository changes
   within the approved scope; the **release owner** retains approval authority for release-specific activities; the **Commerce owner**
   retains approval authority for Commerce-specific activities. An `Accepted` ADR does **not** automatically authorise implementation of a
   work package. **As at this record WP-0 and WP-C1 are `COMPLETED`; WP-C2 is `AUTHORIZED` and `STARTED`; no other
   implementation work package is `AUTHORIZED` or `STARTED`.** WP-C1 was authorized 2026-11-04 and completed 2026-11-05. WP-C2 was
   authorized under B10 and its release scope was approved on 2026-11-05; the release owner authorized release execution on
   2026-11-05, so the release gate is satisfied and execution is `STARTED`. WP-B remains evidence-complete and published, with
   formal completion ratification pending owner approval. See the decision-resolution record's "B10 responsibility model".
8. **pnpm 12.16.1 toolchain migration (WP-E)** — recorded in §2 as a **separate coordinated activity** across all three repositories.
   pnpm 12.16.1 is confirmed as the intended version and all three repositories must eventually be migrated. **Status: NOT AUTHORIZED,
   NOT STARTED.** It requires its own scoped work package and explicit authorisation under B10. **Nothing was migrated by this document**,
   and no manifest, lockfile, CI, workflow, script or tooling file was changed.

## 9. Provenance and scope record

This section was rewritten on 2026-11-04. It replaces an earlier "scope confirmation" that described the Commerce *working tree* against
HEAD `40c187e`; that framing is obsolete (the changes were committed) and it attributed individual edits to tasks in a way Git cannot
corroborate. It does not infer authorship or intent, and it does not reconstruct history. It separates three kinds of statement.

### 9.1 Verifiable from current repository state

- Commerce `main` is at `6c01ab6`; its parent is `40c187e` ("architecture freeze"). `6c01ab6` is a **single commit** touching exactly six
  files: `docs/architecture/07-package-architecture.md`, `12-implementation-roadmap.md`, `README.md`,
  `resolution/architecture-freeze-assessment.md`, `resolution/final-freeze-report.md`, and the new `docs/governance/package-dependency-policy.md`
  (its only commit). All six are documentation.
- Between `40c187e` and `6c01ab6` the Phase A status text in the Commerce architecture documents changed from `READY TO START` to
  `DESIGN READY — IMPLEMENTATION AUTHORIZATION PENDING`, and the freeze assessment and final freeze report now carry a
  "Correction (2026-11-04)" note. The *content* of these changes is readable from `git show 6c01ab6`.
- Development `a208100` is a **single commit of eleven documentation files** (ADR-029, 030, 031, 032, 033, 034, 035, 036,
  `docs/standards/release-review.md`, this roadmap, the validator design document) under a message naming only ADR-035. Neither commit
  touches a manifest, lockfile, source, build, CI or Changesets file.
- The Phase A authorisation gate (ADR-032 `Proposed`, Order design `Draft — pending review`, Community sign-off) is verifiable from the
  current text of those documents, independently of who made which edit.
- A clean working tree (as of this revision: Commerce and Community clean; Development carrying this task's documentation changes) records
  only that the content was committed. **It does not establish provenance.**

### 9.2 Historical information that can only be partially reconstructed

- That the six Commerce files and the eleven Development files each changed together, in one commit each, about 22 seconds apart
  (Development 11:20:41, Commerce 11:21:03, 2026-11-04 +0100), is recoverable from commit metadata.
- The earlier version of this section asserted that two Commerce edits (the `07 §4` cross-reference and the governance-decision register
  entry pointing at ADR-036) belonged to the dependency-remediation work, and that the Phase A status edits were the freeze record's own
  correction. That classification is **retained here only as a prior prose assertion**. The current text of the freeze documents is
  consistent with it (they label the Phase A change a correction), but consistency of wording is not evidence of who or which pass
  made each edit or when.

### 9.3 Historical provenance that is no longer independently verifiable

- Which session, pass or author produced each individual hunk inside `6c01ab6` or `a208100`.
- Whether the Phase A status correction predated the dependency-policy work or was made during it (Git records commit time, not edit time;
  every file in a commit shares one timestamp).
- The order of edits in the working-tree period before the commits. Only the committed result is available; no record of the
  intermediate working-tree state is preserved in the repositories.
- The accuracy of any statement in earlier versions of this roadmap or in other documents about which task "created" or "did not make"
  a given change.
- The Development commit message does not describe its contents (it names ADR-035; four of the eleven files, ADR-029…032, are unrelated
  to the dependency policy).

**This limitation is permanent**: no available repository evidence can restore it, and none is guessed here. It affects only the
*auditability of the documentation work*; no architectural decision, ADR content or Phase A gate depends on it. The review documents
(`docs/standards/reviews/dependency-policy-maintainer-review.md` §9, `…-independent-review.md` §9, `…-decision-resolution.md`) state the same
limitation.

### 9.4 Scope of the dependency-remediation documentation

The documents produced by this remediation are ADR-033 to ADR-036, `release-review.md`, this roadmap, the validator design document, and the
Commerce package-dependency policy (plus revisions recorded in the decision-resolution record). No manifest, lockfile, source, build, CI,
Changesets or validator file was changed by the commits listed in §9.1 or, to date, by the documentation revisions; the only
non-Development documentation edits are the three descriptive Community documents and the Commerce policy named in the decision-resolution record.
