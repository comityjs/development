# Decision Resolution Record — Comity Dependency Policy

> **Date:** 2026-11-04 (closure pass; **formal maintainer acceptance recorded the same day**). **Nature:** records the architecture
> owner's decisions D-01…D-08, how the proposed documents were reconciled to them, and the classification of everything still outstanding.
> **Update — formal maintainer acceptance (2026-11-04, after the closure pass).** **ADR-033, ADR-034, ADR-035 and ADR-036 are now
> `Accepted`, and `release-review.md` is adopted.** ADR-032 remains `Proposed`; ADR-022 remains `Accepted` (partially superseded by
> ADR-034; historical text preserved, conditional note converted to a definitive pointer). Statements below that describe the four ADRs
> as `Proposed`, or acceptance/adoption as "not occurred", are the **closure-pass record** and are preserved as written; they are
> superseded by this update. Items **B1–B5 in §3 are closed**; every other classification in §3 stands unchanged.
> **Update — governance closure (2026-11-04, latest entry).** The user has confirmed/authorised **A1** (WP-B is a hard prerequisite for
> the first Commerce publication), **B6** (WP-A2 approved; release-owner gate satisfied), **B8** (Commerce adoption of the Comity
> dependency policy authorised), **B9** (freeze change control authorised, narrowly scoped to ADR-036 reference alignment in two named
> frozen documents) and **B10** (the work-package authorisation responsibility model). See the §3 rows and the "B10 responsibility model"
> subsection.
> **Still outstanding:** **B7** (whether WP-B shares WP-A2's release train), **B8(b)** (Commerce repository, namespace,
> `repository.type` — freeze #1–#3), **B9's** `07 §4` **manifest-sketch** change control, the ADR-034 **semver class**, and **B10
> authorisation for every other work package** (WP-C1 and WP-C2 completed 2026-11-05; WP-C3 remains unauthorized).
> **Update — final governance consolidation and implementation handoff (2026-11-04).** WP-B evidence is **VERIFIED COMPLETE** on
> all 54 published tarballs / 123 subpaths at Node 24.19.0 and 24.0.0; the releases are **PUBLISHED**. Formal WP-B completion
> ratification and the release semver class remain **PENDING OWNER APPROVAL** *(superseded 2026-11-05: WP-B `COMPLETED — FORMALLY
> RATIFIED`, semver `patch` — see the ratification update below)*. WP-A1's baseline is re-verified at 120 references
> in 50 packages (94 `dependencies` + 26 `peerDependencies`; 2 sibling `devDependencies`; 0 exceptions); WP-A1 remains **NOT
> AUTHORIZED** *(superseded 2026-11-05: WP-A1 authorized under B10 and implemented — see the WP-A1 update below)*, and WP-A2 remains
> **RELEASE APPROVED, NOT AUTHORIZED for implementation**. B8(b), B9(b), DR-05 #5, DR-05 #6,
> DR-07 and DR-09 remain **PENDING OWNER APPROVAL**. B7's proposed closure is “not applicable: WP-B shipped separately”, **CLOSED by the
> release owner on 2026-11-05**. The ADR-008 register data is now unambiguously canonical in comity-development; its schema
> `source` path was corrected and the data validates against the schema. **WP-C1 was `AUTHORIZED` under B10 by the architecture
> owner on 2026-11-04 (explicit confirmation in the current project conversation; scope: WP-C1 only) and is `COMPLETED` as of
> 2026-11-05 (see the closure update above). No other new work package
> is `AUTHORIZED` or `STARTED`; WP-B is evidence-complete and published, with formal completion ratification `PENDING OWNER APPROVAL`
> *(superseded 2026-11-05: `COMPLETED — FORMALLY RATIFIED`)*.**
> **Neither architecture-owner approval, maintainer acceptance, release approval nor Commerce authorisation is implementation
> authorisation. WP-C1 was `AUTHORIZED` under B10 and is now `COMPLETED`; no other new work package is `AUTHORIZED` or `STARTED`** — see the B10 model.
> This governance consolidation implemented nothing; WP-B's implementation and releases are recorded separately above.
> **Update — WP-C1 completion and closure (2026-11-05).** WP-C1 is **COMPLETED**. The architecture owner authorized it under B10 on
> 2026-11-04; implementation and verification were completed on 2026-11-05. The full command evidence is in the B10 completion
> record below. WP-C2 remained **NOT AUTHORIZED** and **NOT STARTED** at WP-C1 closure; WP-C1 completion did not authorize it. This
> closure changes no historical decision or approval.
> **Update — WP-C2 authorisation and release-scope approval (2026-11-05).** The architecture owner **AUTHORIZED WP-C2 implementation
> under B10** on **2026-11-05**, and the release owner **APPROVED the WP-C2 release scope** on **2026-11-05**. These are distinct
> approvals: B10 authorizes implementation; the release-owner approval covers the release scope only and does **not** authorize
> publication, tag creation or release execution. Both are recorded in the B10 model below.
> **Update — WP-C2 release-execution authorization (2026-11-05).** The release owner **AUTHORIZED EXECUTION of the WP-C2 release**
> on **2026-11-05**, based on the approval given in the current project conversation on the same date. This is additional to the
> B10 implementation authorization and the release-scope approval. Authorized scope: publish `@comity-dev/validate@0.3.0`;
> publish `@comity-dev/cli@0.2.4` if the Changesets calculation still requires it; create the corresponding release tags through
> the established procedure; update Community consumers and lockfile to the published packages; activate declaration validation
> stage 1 in Community CI after `pnpm build`; and perform registry, consumer, build, validation and CI verification. No later work
> package or unrelated release is authorized. The WP-C2 release gate is **SATISFIED** for this scope; status was `STARTED`
> until publication, Community migration and CI activation were verified. The completion update below supersedes that status.
> **Update — WP-C2 completion (2026-11-05).** WP-C2 is **COMPLETED**. Release execution published
> `@comity-dev/validate@0.3.0` and `@comity-dev/cli@0.2.4` through the established Changesets workflow at release commit
> `a403257`. Annotated tags `@comity-dev/validate@0.3.0` (`23bfae2`) and `@comity-dev/cli@0.2.4` (`8a1fd4e`) target that commit,
> and GitHub releases exist; registry versions, integrity and downloaded tarballs were verified. Community migrated to the
> published versions and merged PR #16 (`83c8dce`). Community CI run `42000652819` passed and its Validate step executed
> `Declarations` after `Build` with 54 publishable packages / 537 declaration files (485 entry-reachable) / 324 external
> references / 0 findings. Main CI run `42001013330` and Release run `42001013288` also passed; the Release run made no
> publication. The completion documentation merged as PR #21 (`b67aa0b`); Development PR CI `42001723228`, main CI
> `42001856842` and Release run `42001856844` also passed, with the Release run reporting no unpublished projects. A negative
> control on the installed validator failed with `ARCH-DECL-DEP-001` and exit 1. This update supersedes earlier `STARTED` status
> statements.
> **Update — WP-C3 authorisation, release approval and implementation (2026-11-05).** The architecture owner **AUTHORIZED WP-C3
> under B10** on **2026-11-05**, and the release owner **APPROVED the WP-C3 release scope** and **AUTHORIZED release execution** on
> the same date. Both are explicit confirmations in the current project conversation. Approved scope and exclusions are recorded in
> the B10 model below and in roadmap §4.1. **These approvals do not activate enforcement**: WP-A1 and WP-A4 gate a blocking stage-2 check and are
> incomplete (WP-B was ratified on 2026-11-05), so stage 2 runs in the release workflows in report-only mode.
> No WP-C4, WP-D* or unrelated release is authorized.
> **Update — WP-C3 completion (2026-11-05).** WP-C3 is **`COMPLETED`** and released. Stage-2 `packed-surface` (`ARCH-PACK-001…006`) is
> implemented with 18 real-tarball tests and design §12 "Implementation notes"; C1 is resolved as `pnpm pack` plus the system `tar`
> with no new dependency. The release workflow published `@comity-dev/validate@0.4.0` and the dependent `@comity-dev/cli@0.2.5` at
> commit `70c6b29`; tags point to that commit and GitHub releases exist. Both release workflows run `validate:packed-surface` after
> `Build` and before `Release`, report-only. Verification on Node 24.0.0 and 24.19.0 produced 7 findings on Development and 120 on
> Community, all `ARCH-PACK-005`, with stage 1 unchanged. **Enforcement remains inactive** — WP-A1, WP-A4 and WP-B formal
> ratification are outstanding (§6.1).
> **Update — WP-B formal completion ratification (2026-11-05).** The owner **RATIFIED WP-B / ADR-034 as `COMPLETED`** in an explicit
> statement in the current project conversation on **2026-11-05**, on the recorded and independently verified evidence, and confirmed
> that **no corrective WP-B2 is required**. The same statement **confirms the shipped semver class as `patch`** and **closes B7** as
> *"not applicable: WP-B shipped separately"*. Evidence basis: implementation commit `cc0160b`; `@comity-dev/build@0.3.0` and
> `@comity-dev/package-tools@0.2.1` (tags → `b279be7`, GitHub releases 2026-11-04T16:43, registry `latest`); Community
> `@comity/order@0.9.2`, `@comity/cli@0.9.2`, `@comity/queue-pg-boss@0.10.1` and the remaining 0.9.2 packages (tags → `3f68585`); the
> recorded verification of 54 published tarballs / 123 export subpaths at Node 24.19.0 and 24.0.0. Community release run `41875135341` is
> red in its `Release` step because of a **post-publication** failure (fixed by PR #15, `bc858d7`); the publication itself succeeded and
> the tags and registry state are unaffected. This supersedes the
> `PENDING OWNER APPROVAL` statements for WP-B completion, its semver class and B7. The ratification **authorises no other work
> package, no publication and no enforcement activation**: WP-A1, WP-A2, WP-A4, WP-C4 and WP-D* are unchanged, and stage-2
> enforcement remains inactive.
> **Update — WP-A1 authorisation (2026-11-05).** The architecture owner **AUTHORIZED WP-A1 under B10** on **2026-11-05** (explicit
> confirmation in the current project conversation). **Scope: the Community sibling-dependency remediation only** — `workspace:*` →
> `workspace:^` for `@comity/*` siblings in `dependencies` and `peerDependencies` (ADR-033 Decision 1), the 2 sibling
> `devDependencies` unchanged (Decision 2), no exception without a recorded justification, and a regenerated Community lockfile. The
> authorisation covers **implementation only**: **no release-owner scope/semver approval and no release-execution authorization are
> recorded for a WP-A1 release**, so no changeset, tag or publication is created until those approvals exist. WP-A4 and every other
> work package remain unauthorised by this record, and stage-2 enforcement is not activated.
> **Update — WP-A4 authorisation (2026-11-05).** The architecture owner **AUTHORIZED WP-A4 under B10** on **2026-11-05** (explicit
> confirmation in the current project conversation). **Scope: the Development sibling-dependency remediation only** — `workspace:*` →
> `workspace:^` for the **7** `@comity-dev/*` sibling specifiers in `dependencies` (`cli` 3, `validate` 4), no exception, and a
> regenerated Development lockfile; the root **private** `devDependency` on `@comity-dev/eslint-plugin` stays `workspace:*`
> (Decision 2). The authorisation covers **implementation only**: the release scope and semver are **not** approved and **no
> release-execution authorization is recorded**, so no changeset, tag or publication is created. WP-A1, WP-A2, WP-C4, WP-D*, Community,
> Commerce and stage-2 **enforcement activation** are excluded.
>
> **Update — final closure authorisation (2026-11-05).** In an explicit statement in the current project conversation the architecture
> owner and the release owner authorized the closure acts, recorded with the same five distinct approvals as roadmap header: WP-A1
> release (via WP-A2), **WP-A2 execution** for the 50-package patch-only coordinated release (B6 scope, the 4 edge-free packages
> excluded), **WP-A4 execution** for `@comity-dev/cli` + `@comity-dev/validate` (patch only), **push** of the Development `main`
> commits and the Community `wp-a1/sibling-ranges` branch, and **stage-2 enforcement activation** by setting the documented repository
> variable in `comityjs/development` and `comityjs/framework` only. The statement authorizes no other work package, no Commerce change,
> no out-of-scope package and no enforcement elsewhere; enforcing the check changes neither the rule set nor stage 1, and local CLI
> behaviour stays opt-in.
> **Evidence record:** `dependency-policy-independent-review.md` (IR-nn, unchanged) and `dependency-policy-maintainer-review.md`
> (original findings preserved; a post-resolution note at its top marks superseded statements).

## 1. Approved decisions and rationale

| ID | Decision (as approved) | Rationale |
|---|---|---|
| **D-01** | The Changesets peer-major cascade is the default release strategy. A peered package's minor releases its dependents as majors (`primitives` 0.9.1 → 0.10.0; adapters 0.9.x → `1.0.0`). No Changesets configuration change to suppress it; a split-release workflow only as a separately authorised future pilot. | A split needs `changeset version --ignore`, which the fixed `pnpm run version` script in `release.yml` cannot pass, and it publishes an untested peer/dependent window that ADR-036 records as a verified defect, while CI tests the new workspace version. The cascade keeps the published graph equal to the tested graph. Accepted cost: unnecessary-looking, irreversible `1.0.0`s. |
| **D-02** | Every Comity package is a single ESM distribution, including CLI packages: one ESM build, `import`, Node 24+ `require(ESM)` compatibility (loads the ESM entry point; not CommonJS support), no CommonJS build or CommonJS-syntax output, no per-package exception, one runtime identity. Supersedes the dual-distribution rationale; reconcile ADR-022. | A working dual build creates two `BaseError` classes (verified); the CJS build is currently broken anyway. ADR-022's own text says the CLI architecture does not require CJS and that dual distribution followed the repository convention, so superseding it removes a convention, not an architectural requirement. |
| **D-03** | Two validation stages: workspace declaration validation (dev/CI) and validation of the actual package tarball before publication (including `files` and `exports`). | Workspace `dist/types` is not the published artifact; only the tarball shows what `files`/`exports` ship. Not implemented. |
| **D-04** | Deterministic discovery of Comity packages; no hard-coded `@comity/*` filter; Commerce namespace not decided. | The current `discover.ts` filter silently discovers nothing for an undecided namespace and passes. |
| **D-05** | Missing build target → `CONFIGURATION-ERROR`, `executed: false`, `passed: false`, no finding, exit 2, never `NOT-RUN`; exit 2 outranks exit 1; **all findings in every category are printed in normal output without `--verbose`**. | Existing code already maps the missing-build case (verified); but findings print only with `--verbose` today, so a real violation can hide behind exit 2. |
| **D-06** | Declaration validator and clean-consumer test are separate responsibilities: the producer validates its declarations and package surface; the clean-consumer test installs the packed or registry-equivalent package and verifies the consumer experience. The validator is not required to discover packages in a consumer installation. | ADR-036 §4 step 4 required the engine to run in a fresh consumer directory where it discovers zero packages and passes (IR-05). |
| **D-07** | `release-review.md` is mandatory: a basic checklist for every `Version Packages` PR; full review when explicit, objectively checkable triggers apply. | A routine patch should not cost the same as a peered minor affecting many adapters. |
| **D-08** | One Comity-wide policy, centrally owned; enforcement local to each repository; cross-repository dependency direction remains documented policy until enforcement exists; packed tarballs for local development; registry-equivalent clean-consumer verification for final checks. | Development does not own other repositories' CI; `repository-ownership.md` does not mention Commerce; no cross-repository engine exists. |

**D-05 is an approved decision, not an open item.** Its implementation (the CLI-wide output change, the declaration categories' exit
behaviour) is ordinary work inside WP-C1; it needs no further authority beyond that work package's own authorisation.

## 2. Decision matrix

> **Statuses below reflect the WP-C1 closure (2026-11-05); historical status statements are preserved as written.** B-items marked
> ~~struck~~ are closed; the authoritative per-item outcomes are the §3 rows. **WP-C1 is `COMPLETED`; no other implementation work
> package is `AUTHORIZED` or `STARTED`** — every other one still needs B10 authorisation (see the "B10 responsibility model"
> subsection). WP-0 is complete; **WP-B is `COMPLETED — FORMALLY RATIFIED` (2026-11-05)**, with no corrective WP-B2 required, its
> semver class confirmed as `patch` and B7 closed (see the ratification update above).

| ID | Affected ADR(s) / documents | Documentation status | Implementation status | Remaining action |
|---|---|---|---|---|
| D-01 | ADR-033 (Decision 1 scope, "Scope of the range rule", Decision 9, cascade section); `release-review.md` §1, §5.1; roadmap (WP-A3 closed; WP-A4 added) | Reconciled; ADR-033 `Accepted`; `release-review.md` `Adopted` | None required (no config change); pilot is optional future work | ~~B1~~ **done**; ~~B5~~ **done**; ~~B6~~ **APPROVED** (WP-A2 gate satisfied); **WP-A1/WP-A2/WP-A4 authorisation (B10) outstanding** |
| D-02 | ADR-034 (rewritten); ADR-022 (definitive supersession pointer); `repository.md`, `SKILL.md`, `AGENT.md`; roadmap | Reconciled; descriptive docs state current behaviour plus pointer; `runtime-support.md` and `queue-pg-boss` docs updated with WP-B | **WP-B implementation VERIFIED COMPLETE on published tarballs (2026-11-04); releases PUBLISHED.** **`COMPLETED — FORMALLY RATIFIED` 2026-11-05**, semver `patch` confirmed | ~~B2~~ **done**; **A1 CONFIRMED** (WP-B is a hard prerequisite for the first Commerce publication); WP-B ratified 2026-11-05; B7 closed |
| D-03 | ADR-035 Decisions 1–3; design §12; roadmap WP-C1/C3 | Reconciled; ADR-035 `Accepted` | **WP-C1 and WP-C2 COMPLETE and verified (2026-11-05); stage 2 (WP-C3) not implemented.** | ~~B3~~ **done**; **WP-C1 and WP-C2 COMPLETED 2026-11-05; WP-C3 B10 authorization outstanding** |
| D-04 | ADR-035 Decisions 4–6; design §2 | Reconciled | **Implemented in WP-C1 and verified:** `discoverPublishablePackages` is used by the declarations engine; legacy `discoverRepository` is unchanged. | Implementation choices C2, C3 settled in WP-C1 |
| D-05 | ADR-035 Decisions 11–13; design §9 | Reconciled | **Implemented in WP-C1 and verified:** declaration engine, exit-2 mapping and always-visible findings are present and tested. | No further decision; WP-C2 completed 2026-11-05, WP-C3 remains unauthorized |
| D-06 | ADR-036 §4a/4b; ADR-035 dependencies; Commerce policy §7; roadmap WP-D3 | Reconciled | **None.** No clean-consumer job exists anywhere | Each consuming repository builds its own job (WP-D3 for Commerce; needs B10 and B8(b)) |
| D-07 | `release-review.md` (rewritten) | Reconciled; **`Adopted` 2026-11-04** | Manual standard; no automation | ~~B5~~ **done** (adopted); T6 calibration (C8) after first uses |
| D-08 | ADR-036 §6 and enforcement table; Commerce policy §7 | Reconciled; ADR-036 `Accepted` | Policy only | ~~B4~~ **done**; ~~B8(a)~~ **AUTHORIZED** (Commerce adoption); **WP-D1 authorisation (B10) outstanding**; B9's manifest-sketch change control outstanding |

## 3. Outstanding decisions — classified (exactly one category each)

> **Acceptance update (2026-11-04).** Items **B1, B2, B3, B4 and B5 are closed** by the formal maintainer acceptance of ADR-033…036
> and the adoption of `release-review.md`; each row records its outcome. The semver class inside B2 was **not** decided at acceptance
> and remains a release-time approval.
>
> **Governance-closure update (2026-11-04, later).** The user has explicitly confirmed/authorised **A1, B6, B8, B9 and B10**; each row
> records its outcome and its precise scope. **These are governance actions only.** Two scope limits matter and are recorded in the rows:
> **B8** authorises **Commerce adoption of the Comity dependency policy only** — the repository, namespace and `repository.type`
> decisions (freeze #1–#3) that the original B8 row also covered remain **OPEN**; and **B9** authorises **only** the alignment of stale
> ADR-036 status references in the two named frozen documents — the `07 §4` **manifest-sketch** correction is **not** authorised by it.
> **No work package was authorised, started or completed by these confirmations** (see B10).

**Categories.** **A** architecture-owner decision (changes approved architecture or release policy; must precede the relevant work
package or publication). **B** maintainer governance decision (ADR acceptance, adoption, repository governance, release approval).
**C** implementation decision (made by the implementation owner within the approved architecture, during the work package).
**D** deferred (does not block authorised documentation work or the next planned work package). Where an item could fit two, it is
classified by the nature of the decision first; D is used only for genuinely optional or later paths. "Authority" is stated only where a
document supports it; otherwise "not named in the documents".

### A. Architecture-owner decision required

| # | Question | Evidence and constraints | Authority | ADR / WP | Blocks | Latest point |
|---|---|---|---|---|---|---|
| ~~A1~~ **CONFIRMED** | Must WP-B (ESM-only implementation) be complete before the first Commerce package is published? — **CONFIRMED by the user (architecture owner) 2026-11-04: YES.** Option **(i)** is adopted and option (ii) is rejected: **WP-B is a hard prerequisite.** (1) **No Commerce package may be published before WP-B is completed.** (2) WP-B must ensure the Commerce packages use the **ESM-only distribution model required by ADR-034**. (3) **Packaging and toolchain compatibility must be verified before the first publication.** **This confirmation does NOT by itself authorise implementation of WP-B or any other work package** — each still requires explicit authorisation under B10. | Approved policy is D-02 (ESM-only for every Comity package). Implementation in existing Comity packages is **VERIFIED COMPLETE on published tarballs** (WP-B, 2026-11-04); all 54 community packages ship the flat ESM shape and `comity-build@0.3.0` emits it. A Commerce package must itself ship the uniform export map and pass the applicable `import`/TypeScript clean-consumer legs (Commerce policy §7b); `require` is tested only where the package graph is synchronously loadable. The previous roadmap rule "WP-B only if Commerce promises CommonJS" was already superseded by D-02. **Resolved by adopting (i); (ii) is not adopted.** | Architecture owner — **decided 2026-11-04** | ADR-034, ADR-036; WP-B, WP-D3; roadmap §4 | The Commerce **first-publication milestone** (it does not gate WP-A, WP-B or WP-C from starting once authorised) | **Decided.** WP-B authorisation (B10) **and** WP-B completion now precede the first Commerce publication; WP-D3's `require` leg is designed against the confirmed prerequisite |

### B. Maintainer governance decision required

| # | Question | Evidence and constraints | Authority | ADR / WP | Blocks | Latest point |
|---|---|---|---|---|---|---|
| ~~B1~~ **CLOSED** | Accept, amend or reject ADR-033 — **Accepted 2026-11-04** as written: Decision 1 scope (incl. `@comity-dev/*`), cascade default, coordinated patch release as a separate migration activity, split release only via a separately authorised pilot, **no deprecation schedule** | ADR-033 `Accepted` | Maintainers — **decided** | ADR-033 | WP-A1/WP-A2 still need their own implementation authorisation (B10); WP-A2 also needs B6 | Closed |
| ~~B2~~ **CLOSED (acceptance only)** | Accept ADR-034 — **Accepted 2026-11-04** as written, including the partial supersession of ADR-022. **The semver class was NOT decided at acceptance** (patch proposed; `queue-pg-boss` is not peered and may be classed separately); it remains a release-time approval | ADR-034 `Accepted`; ADR-022 pointer finalised; WP-B implementation VERIFIED COMPLETE; releases PUBLISHED | Maintainers — **decided**; semver class **CONFIRMED as `patch` on 2026-11-05** by the release owner | ADR-034 | WP-B formal completion ratification; semver confirmation | **Closed 2026-11-05:** WP-B ratified `COMPLETED`; semver `patch` confirmed |
| ~~B3~~ **CLOSED** | Accept ADR-035 — **Accepted 2026-11-04** with both points confirmed: severity **`error`** from day one (**Decision 9 guard preserved**) and `typescript` a runtime `dependency` of `@comity-dev/validate` (`^5.9.3`) | ADR Decisions 9 and 14; baseline counts independently reproduced | Maintainers — **decided** | ADR-035 | WP-C1 and WP-C2 are COMPLETED (2026-11-05); WP-C3 still needs B10 authorization; the `typescript` manifest change is implemented | Closed |
| ~~B4~~ **CLOSED** | Accept ADR-036 — **Accepted 2026-11-04**. **Toolchain correction:** the verification baseline is **pnpm 12.16.1 / Node 24+**, superseding the pnpm 10.13.x previously proposed; it is a verification baseline, **not** a consumer minimum-version guarantee | ADR §4b and "Confirmed at acceptance"; Commerce adoption remains separate | Maintainers — **decided**; Commerce owner for Commerce adoption (roadmap §8.5) | ADR-036 | WP-D1 still needs B10 and the freeze change control (B9) | Closed |
| ~~B5~~ **CLOSED** | Formally adopt `release-review.md` — **Adopted 2026-11-04**, effective on adoption. Mandatory for every `Version Packages` PR; full review only when triggers T1–T6 apply; WP-A2 the recommended pilot; T6 calibration (C8) unchanged | D-07 approved; the standard is now `Adopted` | Maintainers — **decided** | `release-review.md` | In force for WP-A2's `Version Packages` PR | Closed |
| ~~B6~~ **APPROVED** | Approve the coordinated patch release (WP-A2) — **APPROVED by the user (release owner) 2026-11-04.** The **release-owner approval gate for WP-A2 is SATISFIED**. The existing WP-A2 **scope and conditions are preserved unchanged** (roadmap §2 WP-A2, §5.1): all packages with sibling edges in **one** `Version Packages` PR, **patch only**; packed manifests carry `^<version>`; the clean-consumer checks of ADR-033 pass; the `release-review.md` gate applies. **This approval is not authorisation for unrelated release activities and is not a scope expansion.** | Roadmap §8.2; §5.1; `release-review.md` | Release owner — **decided** | ADR-033; WP-A2 | WP-A2 execution. **WP-A2 is RELEASE APPROVED but implementation PENDING OWNER APPROVAL and NOT STARTED**, and it still depends on **WP-A1**, which is **NOT AUTHORIZED** (B10) — so execution cannot begin until WP-A1 is authorised and completed | Gate satisfied 2026-11-04 |
| ~~B7~~ **CLOSED 2026-11-05** | Whether WP-B shares WP-A2's release train | **Evidence: WP-B is already released separately.** **Closure adopted by the release owner on 2026-11-05: “not applicable: WP-B shipped separately.”** Do not merge retrospectively; doing so would exceed B6's 50-package scope. | Release owner — **closed 2026-11-05** | WP-A2, WP-B | None; no new release work | Closed |
| ~~B8~~ **PARTIALLY CLOSED — adoption AUTHORIZED** | The original B8 row conflated two distinct Commerce-owner decisions; they are separated here. **(a) Commerce adoption of the Comity dependency policy — AUTHORIZED by the user (Commerce owner) 2026-11-04.** The Commerce owner has authorised adoption of the Comity dependency policy (`commerce/docs/governance/package-dependency-policy.md`) in the Commerce repository. This authorisation **does not reopen or modify any ADR already Accepted** in the Comity governance repositories, and **does not authorise unrelated Commerce implementation work**; only the documentation/governance changes required to reflect it were made. (b) Commerce repository, namespace and `repository.type` (freeze decisions #1–#3) — status: **PENDING OWNER APPROVAL**. The Commerce namespace stays undecided and `comity validate` in Commerce still depends on `repository.type`. | Commerce policy header, §1, §9; roadmap §8.4/§8.5 | Commerce owner — **(a) decided; (b) undecided** | Commerce policy §1, §9 | (a) satisfies WP-D1's adoption precondition (WP-D1 itself still needs B10 authorisation). (b) still blocks WP-D2, WP-D3 and Commerce scaffolding | (a) Authorised 2026-11-04; (b) before Commerce scaffolding |
| ~~B9~~ **AUTHORIZED (narrow scope)** | Freeze change control — **AUTHORIZED by the user 2026-11-04, strictly limited.** **Authorised scope:** aligning the **stale ADR-036 status references** with ADR-036's `Accepted` status in exactly two frozen documents — `commerce/docs/architecture/07-package-architecture.md` and `commerce/docs/architecture/resolution/architecture-freeze-assessment.md`. Historical context and rationale are preserved; no unrelated frozen architectural decision is modified; the freeze is **not** reopened; the change is traceable to this authorisation. **NOT authorised by this decision:** the `07 §4` **manifest-sketch** correction (the `workspace:*` sketch), any broader architecture change, and any other frozen content — those remain pending and require their own change control. **Executed** in the two named documents only; nothing else was touched. | Commerce policy §8; roadmap WP-D1; freeze assessment §7 "Change control after the freeze" | Commerce governance (freeze change control) — **decided** | WP-D1 | The ADR-036 reference alignment (**done**). The **manifest-sketch correction (B9(b)) remains PENDING OWNER APPROVAL** and still blocks WP-D1 completion | Authorised 2026-11-04 |
| ~~B10~~ **CONFIRMED** | Who authorises each work package's implementation task — **CONFIRMED by the user 2026-11-04.** The responsibility model below is now the governing rule. **An Accepted ADR does not automatically authorise implementation of a work package**; each work package still requires explicit authorisation under this model. | Roadmap §8.6/§8.7 previously left this unnamed; it is now stated | **Architecture owner** — see the model below | WP-A1…D3, WP-DOC, WP-E | Every work package | Before each package starts |

### B10 responsibility model — work-package authorisation (CONFIRMED 2026-11-04)

This is the governing rule for authorising work-package implementation. It resolves B10, which the documents previously left unnamed.

| Role | Authority |
|---|---|
| **Architecture owner** | **Formally authorises each work package and approves its scope before execution.** |
| **Repository maintainers** | Manage and verify repository changes **within the approved scope**. |
| **Release owner** | Retains approval authority for **release-specific** activities (e.g. B6 / WP-A2, B7 / release-train sharing). |
| **Commerce owner** | Retains approval authority for **Commerce-specific** activities (e.g. B8 / policy adoption, B9 / freeze change control). |

**Rule.** An `Accepted` ADR does **not** automatically authorise implementation of a work package. Each work package still requires
explicit authorisation by the architecture owner under this model.

**Statuses are distinct and must not be used interchangeably.** A work package moves `NOT AUTHORIZED` → `AUTHORIZED` → `STARTED` →
`COMPLETED`, and each transition is recorded separately. **Authorisation is not evidence of execution or completion.**

**Recorded work-package authorisation — WP-C1.** The architecture owner **AUTHORIZED WP-C1** under B10 on **2026-11-04**. The
authorisation source is an **explicit confirmation by the architecture owner in the current project conversation**. Scope: **WP-C1
only**, as defined by the WP-C1 row of `docs/architecture/dependency-remediation-roadmap.md`; implementation target
`@comity-dev/validate`. It does not authorise WP-C2, WP-C3, WP-C4, any WP-D package, CI wiring, release or publication. This paragraph
and the roadmap WP-C1 row are the authorisation record; no separate register is created.

**Recorded work-package completion — WP-C1.** WP-C1 reached **`COMPLETED` on 2026-11-05**. The B10 authorization above remains the
authority; this completion record adds evidence and does not expand it. Commands and results:

- `pnpm type-check` — pass (re-run 2026-11-05).
- `pnpm --filter @comity-dev/validate test` — 5 test files, **79 tests passed**, including **25 design §10 tests** (re-run
  2026-11-05); the full workspace `pnpm test` also passed in the implementation execution.
- `pnpm self-validate` — pass; declarations: **8 publishable packages, 46 declaration files (28 entry-reachable), 6 external
  references** (recorded from the implementation execution; build and validation completed).
- Community full validation via `node ../development/packages/validate/dist/bin/comity-validate.js --repo .` — **PASS**:
  **54 packages, 537 declaration files (485 entry-reachable), 0 findings, exit 0** (re-run 2026-11-05 as a declaration-only run
  with the same 54/537/485/0/PASS result; the full run was recorded during implementation).
- `git diff --check` — clean in development, community and commerce (re-run 2026-11-05).

Evidence references: `packages/validate/src/engines/declaration-dependencies.ts`; `src/discover.ts`
(`discoverPublishablePackages`); `src/run.ts`; `src/format.ts`; `src/bin/comity-validate.ts`; `src/exit-codes.ts`;
`src/engines/__tests__/declaration-dependencies.test.ts`; `packages/validate/package.json` and `pnpm-lock.yaml` (runtime
`typescript`); `packages/validate/README.md`. At WP-C1 closure, WP-C2 (release, consumer bump, CI rollout) and WP-C3 (stage 2)
were not implemented, and WP-C2 was `NOT AUTHORIZED` and `NOT STARTED`.

**Recorded work-package authorisation — WP-C2.** The architecture owner **AUTHORIZED WP-C2** under B10 on **2026-11-05**. The
authorisation source is an **explicit confirmation by the architecture owner in the current project conversation**. Scope: **WP-C2
only**, exactly as defined by the WP-C2 row of `docs/architecture/dependency-remediation-roadmap.md`: release
`@comity-dev/validate` as a minor, bump consumers, and add stage 1 to CI after build. This authorisation does not authorise WP-C3,
WP-C4, any WP-D package, publication, tag creation, release execution or unrelated CI expansion. This paragraph and the roadmap
WP-C2 row are the authorisation record; no separate register is created.

**Recorded release-owner scope approval — WP-C2.** The release owner **APPROVED the WP-C2 release scope** on **2026-11-05**. The
approval covers the WP-C2 release activity within the roadmap definition (the `@comity-dev/validate` minor and the consumer bump).
It is distinct from the B10 implementation authorisation and does **not** authorise publication, tag creation or release execution;
those remain outside the current task. This paragraph is the release-scope approval record.

**Recorded release-execution authorization — WP-C2.** The release owner **AUTHORIZED EXECUTION of the WP-C2 release** on
**2026-11-05**, based on the approval given in the current project conversation on the same date. This authorization is
additional to the B10 implementation authorization and the release-scope approval. Authorized scope: publish
`@comity-dev/validate@0.3.0`; publish `@comity-dev/cli@0.2.4` if the existing Changesets calculation still requires it; create
the corresponding release tags through the established release procedure; update Community consumers and lockfile to the
published packages; activate declaration validation stage 1 in Community CI after `pnpm build`; and perform all required
registry, consumer, build, validation and CI verification. This authorization does not cover WP-C3, WP-C4, WP-D* or unrelated
releases. The WP-C2 release gate is **SATISFIED** for this scope.

**WP-C2 implementation status (2026-11-05) — release execution authorized.** The minor changeset
`.changeset/declaration-dependencies-stage-1.md` is prepared; Changesets resolves it to `@comity-dev/validate@0.3.0` and an
automatic `@comity-dev/cli@0.2.4` patch. Development CI already runs stage 1 after `pnpm build` through `pnpm self-validate`, and
the built validator passes on the Development and Community workspaces. The Community consumer bump and CI activation are
authorized and follow registry publication. The completion record below supersedes the `STARTED` status.

**WP-C2 completion status (2026-11-05).** WP-C2 is **`COMPLETED`**. The Changesets release workflow published
`@comity-dev/validate@0.3.0` and the dependent `@comity-dev/cli@0.2.4` at Development commit `a403257`; annotated tags
`@comity-dev/validate@0.3.0` (`23bfae2`) and `@comity-dev/cli@0.2.4` (`8a1fd4e`) target that commit, and GitHub releases exist.
Registry tarballs were downloaded with `npm pack` and verified for ESM output, declarations and exports. Community merged the
consumer and lockfile migration as PR #16 (`83c8dce`). Community CI run `42000652819` passed, including `Build` before `Validate`;
the Declarations category reported 54 publishable packages / 537 declaration files (485 entry-reachable) / 324 external
references / 0 findings. Main CI run `42001013330` and Release run `42001013288` also passed; the Release run reported no new
packages to publish. Reported execution evidence, **not re-run in this documentation-only pass**: local `pnpm build`,
`pnpm type-check`, full `pnpm test` (212 files / 2,373 tests passed), ESLint with 0 errors, both normalization checks, and a negative
control on the installed validator that failed as designed with `ARCH-DECL-DEP-001` and exit 1. The CI run conclusions, tag
targets, releases, registry versions and tarballs cited in this paragraph were inspected directly.

**Recorded work-package authorisation — WP-A4.** The architecture owner **AUTHORIZED WP-A4** under B10 on **2026-11-05** (explicit
confirmation in the current project conversation). **Scope: the Development sibling-dependency remediation only** — the 7
`@comity-dev/*` sibling specifiers in `dependencies` (`cli` 3: `build`, `package-tools`, `validate`; `validate` 4: `schemas`,
`dependency-rules`, `eslint-plugin`, `semgrep-rules`) become `workspace:^` (ADR-033 Decision 1 / "Scope of the range rule"), no
exception is created, and the Development lockfile is regenerated. The root `package.json`'s sibling **`devDependency`** is a private
package field and stays `workspace:*` (Decision 2). **Not authorised by this record:** WP-A1 (already implemented), WP-A2, every other
work package, any Community or Commerce change, any publication, and any stage-2 enforcement activation.

**WP-A4 status.** `AUTHORIZED` under B10 on 2026-11-05 and **`IMPLEMENTED` the same day**; the release remains **gated** (no
release-owner scope/semver approval and no release-execution authorization recorded). Implementation evidence: on Development
`bd5daa4`, **7** declarations changed (`cli` 3, `validate` 4) from `workspace:*` to `workspace:^`; **0** exceptions; **0** sibling
`workspace:*` left in `dependencies`/`peerDependencies` (only the root private `devDependency` remains, Decision 2); the lockfile was
regenerated with identical package/snapshot/importers key sets (326 / 326 / 9 — no package added or removed and no resolution version
changed; pnpm re-keyed eslint peer suffixes and libc metadata as a consequence of the workspace-range change) and a
`--frozen-lockfile` install passes. Validation on Node 24.19.0: `pnpm build`, `pnpm type-check`, `pnpm test` (12 files / 165 tests),
`pnpm self-validate` **PASS** with the unchanged stage-1 baseline (8 / 47 / 28 / 6 / 0 findings), and stage-2 `packed-surface`
**PASS with 0 findings** (was 7). **Release scope proposal:** `@comity-dev/cli` and `@comity-dev/validate`, `patch`, following the
established dependency-first order (`build`, `package-tools`, `schemas`, `dependency-rules`, `eslint-plugin`, `semgrep-rules` are
already published and out of scope unless a dependent bump is required) — but **no approval is recorded, so no changeset, tag or
publication is created**.

**Recorded work-package authorisation — WP-A1.** The architecture owner **AUTHORIZED WP-A1** under B10 on **2026-11-05** (explicit
confirmation in the current project conversation). **Scope: the Community sibling-dependency remediation only** — replace the
`workspace:*` specifiers of `@comity/*` siblings in `dependencies` and `peerDependencies` with `workspace:^` (ADR-033 Decision 1), keep
the 2 sibling `devDependencies` on `workspace:*` (Decision 2), create no exception without a recorded justification in the package's
`docs/conventions.md` (Decision 4; none exist), and regenerate the Community lockfile (Decisions 5–6). **Not authorised by this record:**
WP-A4, every other work package, any Development or Commerce manifest change, any publication, and any stage-2 enforcement activation.
The release scope and semver are already approved under **B6** (2026-11-04: coordinated patch release, patch only, 50-package scope,
conditions unchanged), but **no explicit release-execution authorization is recorded** and WP-A2's own B10 implementation authorization
is outstanding, so the release remains **gated**: no changeset, tag, publication or Community consumer bump is created until those two
approvals are explicitly given.
See roadmap §2 WP-A1 and §8.7.

**Recorded work-package authorisation — WP-C3.** The architecture owner **AUTHORIZED WP-C3** under B10 on **2026-11-05**. The
source is an explicit confirmation by the architecture owner in the current project conversation. Scope: implement ADR-035 D-03
stage 2 (`packed-surface`, design §12, rules `ARCH-PACK-001…006`), its design §10 tests and negative fixtures, real packed-tarball
verification on Node 24.0.0 and the current 24.x, and the approved release-workflow integration. The authorisation does not cover
WP-C4, WP-D*, unrelated packages or releases, stage-1 behaviour changes, or any governance decision beyond the scope recorded here;
it does **not** activate enforcement.

**Recorded release-owner approval and release-execution authorization — WP-C3.** The release owner **APPROVED the WP-C3 release
scope** and **AUTHORIZED release execution** on **2026-11-05** (explicit confirmation in the current project conversation).
Authorized scope: release `@comity-dev/validate` as a minor together with any dependent package the existing Changesets calculation
requires, create the release tags and GitHub releases through the established procedure, and update Community consumers and lockfile
if the calculation requires it. Excluded: unrelated packages and releases, and any expansion of this scope. **Enforcement is not
authorized to become blocking** until the WP-A4 and WP-B formal-ratification gates are satisfied. **As of 2026-11-05 every gate is
satisfied** (WP-A1 and WP-A4 implemented, WP-B formally ratified); satisfying them authorises no activation, which remains a separate
explicit decision.

**WP-A1 status.** `AUTHORIZED` under B10 on 2026-11-05 and **`IMPLEMENTED` the same day**; the release remains **gated** (no
release-owner execution authorization). Implementation evidence: on Community `9dec3cc`, all **120** sibling
`dependencies`/`peerDependencies` specifiers were migrated from `workspace:*` to `workspace:^` (**94** `dependencies` + **26**
`peerDependencies`) across **50** packages; the **2** sibling `devDependencies` (`@comity/cli-commander` →
`@comity/kernel`, `@comity/primitives`) remain `workspace:*` per ADR-033 Decision 2; **0** exceptions were created and **0**
`workspace:*` remain in the approved fields; the Community lockfile was regenerated (94 specifier lines changed, no resolution or
graph change); `packages/queue-pg-boss/src/__tests__/public-api.test.ts` updated to assert the new protocol (the dependency + peer
pairing is unchanged). Validation: `pnpm install --frozen-lockfile` consistent, `pnpm build`, `pnpm type-check`, `pnpm test`
(212 files / 2,373 tests), ESLint 0 errors, both normalizers and Prettier clean, `comity validate` **PASS** with the unchanged stage-1
baseline (54 / 537 / 485 / 324 / 0), and stage-2 `packed-surface` **PASS with 0 findings** (was 120 `ARCH-PACK-005`).
**Release scope proposal:** the 50 packages carrying sibling edges, `patch`, per ADR-033 Decision 6 and roadmap §5.1 — B6 approved the
coordinated patch release scope on 2026-11-04, but **no explicit release-execution authorization is recorded** and WP-A2's own B10
implementation authorization is outstanding, so no changeset, tag or publication is created.

**WP-C3 status.** `COMPLETED`, verified and `RELEASED` on 2026-11-05 under the two records above. Its authoritative definition is
ADR-035 D-03 stage 2 (`packed-surface`, design §12, rules `ARCH-PACK-001…006`). Decision **C1** is resolved inside the work package:
`pnpm pack --pack-destination` produces the tarball and the system `tar` reads it — **no new dependency**. Stage-2 **enforcement**
prerequisites are **all satisfied** as of 2026-11-05 (WP-A1 and WP-A4 implemented, stage 2 reporting 0 findings in both
repositories; WP-B formally ratified); **activation remains a separate explicit decision** — see §6.1.

As at this record, **WP-0, WP-B, WP-C1, WP-C2 and WP-C3 are `COMPLETED`, and WP-A1 and WP-A4 are `AUTHORIZED` (B10, 2026-11-05),
implemented, with their releases gated; no other implementation work package is `AUTHORIZED` or `STARTED`**: B6 **approved** the WP-A2
*release activity* (release-owner gate satisfied) without authorising its implementation; A1
**confirmed** a *sequencing prerequisite* without authorising WP-B; B8 **authorised** *policy adoption* without authorising Commerce
implementation; B9 **authorised** a *narrow documentation change*, which was executed. WP-B is **`COMPLETED — FORMALLY RATIFIED`
(2026-11-05)**: implementation and releases verified, its semver class confirmed as `patch` and B7 closed. WP-C4 remains unauthorized.

### C. Implementation decision (within the approved architecture, during the work package)

| # | Question | Evidence and constraints | Owner | WP | Blocks | Latest point |
|---|---|---|---|---|---|---|
| C1 | **How stage 2 reads tarballs**: a dependency, or the system `tar` executable | See §4: requires evaluation of portability, security, deterministic behaviour, error handling, CI compatibility. **No choice is made or implied** | WP-C3 implementation owner | WP-C3 | WP-C3 only | During WP-C3 design |
| C2 | Zero-package discovery contract details | Settled contract in ADR-035 Decision 5: roots resolving to no package directory → `CONFIGURATION-ERROR`; all packages private → `NOT-APPLICABLE` with listed reason; an empty scope is not supported by the config schema (`minItems: 1`), so there is no legitimate "empty" case to pass. Distinguishable deterministically from configuration; no new policy needed | WP-C1 implementation owner | WP-C1 | WP-C1 only | During WP-C1 |
| C3 | Separate discovery function for the new categories vs changing shared `discover.ts` | ADR-035 Decision 6: the other engines' classification (ADR-026) assumes the name filter; they must not change silently. Smallest explicit alternative: `packages.include` | WP-C1 implementation owner | WP-C1 | WP-C1 only | During WP-C1 |
| C4 | `optionalDependencies` / `bundledDependencies` handling | Proposed default: do not satisfy a reference; none used today | WP-C1 implementation owner | WP-C1 | Nothing | During WP-C1 |
| C5 | Keep both `import`/`require` keys or collapse to `types`/`default` | ADR-034: equivalent; must keep `comity-normalize-package-json` condition order | WP-B implementation owner | WP-B | WP-B only | During WP-B |
| C6 | Run the optional bundler smoke build | ADR-034 Validation 6: evidence, not a support claim; the `runtime-support.md` scoping does not depend on it | WP-B implementation owner | WP-B | Nothing | During WP-B |
| C7 | WP-A1 execution: re-count on an up-to-date `main` containing `origin/main`, list exceptions, enumerate packages in the patch changeset | ADR-033 Decisions 4–6 and migration steps | WP-A1/A2 implementation owner | WP-A1, WP-A2 | WP-A1/A2 | During WP-A1/A2 |
| C8 | Calibrate trigger T6 (plan-size threshold) and the triggers from first uses | `release-review.md` §5.5 | Release reviewer / release owner | WP-A2 | Nothing | After the first uses |

### D. Deferred decision

| # | Question | Evidence and constraints | Authority | ADR / WP | Blocks | Latest point |
|---|---|---|---|---|---|---|
| D1 | Deprecate old exact-pinned versions after the caret release | Old versions keep exact pins permanently either way; deprecation only adds a registry warning | Release owner (roadmap §8.2) | ADR-033 Q4 | Nothing | After WP-A2 publishes |
| ~~D2~~ | ~~Whether the range rule covers `@comity-dev/*`~~ — **RESOLVED, no longer deferred** | See §5.3: the evidence establishes no different release policy, so ADR-033 Decision 1 applies. Migration is WP-A4 | Ratified by maintainers accepting ADR-033 (B1); no separate decision | ADR-033 "Scope of the range rule" | WP-A4 | Closed |
| D3 | A split-release pilot | D-01: only as a separately authorised future pilot; would itself change release policy (an A-category decision when proposed) | Not named; would require the architecture owner | ADR-033 | Nothing | Only if proposed |
| D4 | Extend `repository-ownership.md` to Commerce | It covers Development, Community and Enterprise only; ADR-036 makes no authority claim over other repositories | Maintainers | ADR-036 Q2 | Nothing | Only if wanted |
| D5 | An explicit "empty scope" declaration in `comity.config.json` | Current schema requires at least one root; not needed by C2 | Schema owner / maintainers | WP-C1 | Nothing | Only if a repository legitimately has no packages |
| D6 | Roadmap clarifications: §5.2 cross-reference to ADR-032's `Proposed` status | Documentation wording | Documentation owner (not named) | Roadmap | Nothing | At the next roadmap revision |

## 4. Implementation choices that do not require further architectural approval

These are made by the implementation owner during the stated work package, within the approved architecture. They are listed so they are
not mistaken for approvals.

- **WP-C3 tarball access (C1).** Introducing a tarball-reading dependency **or** invoking the system `tar` executable. The implementation must
  weigh: **portability** (macOS/Linux and CI images; `tar` flavour differences); **security** (path-traversal, symlink/hardlink and special-file
  entries, size limits, supply-chain exposure of a new dependency); **deterministic behaviour** (stable ordering and results independent of
  the host `tar`); **error handling** (mapping failures to `CONFIGURATION-ERROR` or `TOOL-UNAVAILABLE`, never PASS); and **CI environment
  compatibility**. **No dependency is selected or introduced here, and WP-C3 is not implemented.**
- Zero-package discovery details (C2), the discovery function (C3), `optionalDependencies` handling (C4), export-map key shape (C5), the
  bundler smoke build (C6), WP-A1/A2 execution details (C7), trigger calibration (C8).
- Implementation of D-05: always-visible findings (all categories) and exit-2 precedence; this is approved, not a choice.

## 5. Specific reviews

### 5.1 WP-B and the first Commerce publication
Recorded as **A1**: an architecture-owner decision because it changes release sequencing. **A1 is now CONFIRMED (2026-11-04): WP-B is a
hard prerequisite — no Commerce package may be published before WP-B is completed.** WP-B must ensure the Commerce packages use the
ESM-only distribution model required by ADR-034, and packaging and toolchain compatibility must be verified before the first
publication. The distinction between approved policy (D-02), implementation in existing packages (WP-B, **VERIFIED COMPLETE on
published tarballs, pending formal completion ratification**) and compliant publication of a new Commerce package is the basis of
that answer and is recorded in A1. **The confirmation did not authorise WP-B** (B10).

### 5.2 Zero discovered packages
The distinction **can** be made deterministically from repository configuration and is documented as an implementation contract (C2,
ADR-035 Decision 5, design §2): a configured-but-empty scope is `CONFIGURATION-ERROR` (never PASS); `NOT-APPLICABLE` is used only when packages
exist and all are private, with the private packages listed in normal output. The config schema (`minItems: 1`) offers no explicit empty scope,
so no legitimate "empty" case exists to pass; creating one would be a separate schema decision (D5). This needs **no new policy decision**.

### 5.3 `@comity-dev/*` ranges (D2)
Kept distinct: (a) **published sibling dependencies** — the 7 `@comity-dev/*` references in comity-development are `dependencies` with
`workspace:*` (`cli` 3, `validate` 4); (b) **development-only dependencies** — none of the 7 are `devDependencies`, and community's
`@comity-dev/*` entries are root `devDependencies` from the registry with caret ranges; (c) **peer dependencies** — none; (d) **a separate
release channel** — the packages are public 0.2.x versions with their own Changesets configuration; no separate channel exists in the repository
and none is invented. **Resolution (2026-11-04, acceptance-readiness pass):** the range rule **does** extend to the `@comity-dev/*`
published sibling dependencies. Item (d) is decisive: no separate release channel, range protocol, Changesets grouping or documented
exemption exists in either repository, and a different namespace is not evidence of a different policy, so the same publication policy
applies consistently. Recorded in ADR-033 "Scope of the range rule" and Decision 1; migration is roadmap **WP-A4** (P2, independent;
not a precondition of WP-A1/WP-A2). Kept explicit: the runtime-identity defect is verified for `@comity/*` only, and the extension
rests on publication-policy consistency, not on a reproduced identity failure in the tooling packages. Maintainers ratify the scope by
accepting ADR-033; **no separate decision is required**, so this item is no longer classified D.

### 5.4 Exact pins: policy, migration, release, cascade
Four separate things:
1. **Future policy** — `workspace:^` for published sibling `dependencies`/`peerDependencies` (ADR-033 Decision 1): needs formal acceptance (**B1**).
2. **Migration of existing references** — WP-A1: re-count, exceptions, edits (**C7**, execution detail; authorised per **B10**).
3. **Coordinated patch release** — WP-A2: release-owner approval (**B6**) and the `release-review.md` gate (**B5**); the patch does not trigger the cascade.
4. **Default cascade for future peered minors** — D-01, approved; no decision remains. **Existing published exact pins** are immutable: older
   versions keep them; whether to deprecate them is **D1**.

### 5.5 `runtime-support.md`
Leaving `runtime-support.md` unchanged is **intentional**. It is a standard that describes current practice (`development/AGENTS.md`: documentation
describes the current implementation); ADR-034 and the roadmap define the target. §1 wording and the §2/§3 scoping to the `import` condition
are scheduled **as part of WP-B** (roadmap §6) and are not made in this documentation-only closure.

## 6. Dependency map (what blocks what)

| Item | Must be settled before |
|---|---|
| ~~B1~~, ~~B5~~, ~~B6~~ **satisfied**; **B10 for WP-A2 outstanding** | WP-A1 → WP-A2. **WP-A1 is `AUTHORIZED` (B10, 2026-11-05) and implemented**, so its B10 gate is closed and its blocking condition on WP-A2 is cleared. **WP-A2 is RELEASE APPROVED but implementation PENDING OWNER APPROVAL and NOT STARTED**, and additionally requires an explicit release-execution authorization |
| ~~B1~~ (whose acceptance ratifies the `@comity-dev/*` scope) **satisfied**; **B10 satisfied 2026-11-05** | WP-A4 — independent of WP-A1/WP-A2; **`AUTHORIZED` (B10, 2026-11-05) and implemented**; release gated |
| ~~B2~~ **satisfied**; **WP-B `COMPLETED — FORMALLY RATIFIED` 2026-11-05**, releases PUBLISHED, semver `patch` confirmed; **B7 CLOSED 2026-11-05** | WP-B formal closure and B7 release-train record only. **A1 (confirmed) makes WP-B completion a hard prerequisite of the first Commerce publication** |
| ~~B3~~ **satisfied**; **WP-C1 and WP-C2 COMPLETED 2026-11-05**; **WP-C3 B10 outstanding**; C2–C4 settled in WP-C1, C1 open for WP-C3 | WP-C3 (C1 only for WP-C3) |
| ~~B4~~, ~~B8(a)~~ and the ~~B9~~ ADR-036-reference part **satisfied**; **B10 outstanding**; B9's manifest-sketch change control **outstanding** | WP-D1 |
| **B8(b)** (repository, namespace, `repository.type` — **still open**), WP-C1/C3 or equivalent | WP-D2/WP-D3, Commerce scaffolding |
| ~~**A1**~~ **CONFIRMED** | **Settled.** WP-B **completion** now precedes the "first Commerce package publication" milestone; WP-D3's `require` leg is designed against the confirmed prerequisite |
| WP-A2, **WP-B (A1: hard prerequisite)**, WP-C1/C2/C3, WP-D1, WP-D3 | First Commerce package publication (roadmap §4) |
| ADR-032 acceptance, Order design review, Community sign-off | Order Phase A (independent of all the above; none of WP-A/B/C is a prerequisite) |

No item above blocks the documentation-only work already done. **A1 is now confirmed** and does not block WP-A, WP-B or WP-C from starting
once authorised; it constrains only the **first Commerce publication** milestone, which now requires WP-B to be **completed** first.

### 6.1 WP-C3 implementation

**WP-C3 is `COMPLETED`, verified and `RELEASED` (2026-11-05)** under the B10 authorization and the release-owner approval and
release-execution authorization of the same date. It is ADR-035 D-03 stage 2 (`packed-surface`, design §12): it packs every
publishable package in the producer repository after build and before publication, reads the tarball and the packed manifest (never
the workspace `dist`), and applies `ARCH-PACK-001…006`. **C1 is resolved** as `pnpm pack --pack-destination` plus the system `tar`
(`-tzf`, `-xOf`) — **no new dependency**. `ARCH-PACK-003` is an umbrella marker: the packed-manifest external-reference check runs
and violations carry their `ARCH-DECL-DEP-001…005` code, so no finding is emitted for `-003` itself.

Evidence: `packages/validate/src/engines/packed-surface.ts`; registration in `run.ts` (`packedSurface` category), `format.ts` and the
CLI help; 18 real-tarball tests in `packages/validate/src/engines/__tests__/packed-surface.test.ts` (positive and negative coverage of
all six rules, multiple violations, determinism, failed pack, corrupted and unprefixed tarballs, exit codes 0/1/2); design §12
"Implementation notes"; package README. Local verification passed on **Node 24.0.0 and 24.19.0**: `pnpm build`, `pnpm type-check`,
`pnpm test` and `pnpm self-validate`, with **stage 1 unchanged** (Declarations PASS — 8 packages / 47 declaration files / 28
entry-reachable / 6 external references / 0 findings). Real packed-tarball verification: Development 8 tarballs → 7 findings,
Community 54 tarballs → 120 findings, **all `ARCH-PACK-005`** (the WP-A4 and WP-A1 exact pins) and **none** of `-001`, `-002`, `-004`,
`-006`; the run reproduces the stage-1 surface counts from the tarballs (Community 54 packages / 485 entry-reachable declarations /
324 external references).

Release evidence: `@comity-dev/validate@0.4.0` and the dependent `@comity-dev/cli@0.2.5` were published by release run `42040136600`
(step 7 `Validate packed surface` then step 8 `Release`, both `success`) at Development commit `70c6b29`; tags
`@comity-dev/validate@0.4.0` and `@comity-dev/cli@0.2.5` point to `70c6b29` and GitHub releases exist; registry integrity values are
`sha512-2vfg9RltRLHl1KmMw9LcZbwW3HA0fguQ18GtdvRuN2R6/xAfyaNCZsRclqYM9v0Sm+ZotGa7fcsIu8DB+Qmkmg==` (validate) and
`sha512-ZmbcGzL/13xPKJnvaybHrOowltubHyAaAgCL4LGtdGqwRsMZVIKfctOOOjkiGJnpIOameAHTDVWqjCKWO+kHqg==` (cli); the downloaded `0.4.0`
tarball contains `dist/engines/packed-surface.js` and its declarations. Implementation merged as PR #22 (`ad79985`, CI `42038993350`);
`Version Packages` merged as PR #23 (`70c6b29`, CI `42039836944`); the post-merge Release run `42039232994` created the version PR and
executed the stage-2 step report-only.

Release-workflow integration: `development/.github/workflows/release.yml` and `community/.github/workflows/release.yml` run
`pnpm validate:packed-surface` **after `Build` and before the Changesets `Release` step**. The step blocks publication when the
repository variable `COMITY_PACKED_SURFACE_ENFORCEMENT` is `true` and is report-only otherwise. The category is opt-in
(`--only=packed-surface`) and is not part of the default run.

Enforcement gates (**all satisfied 2026-11-05, activation not authorised**): WP-A1 migrated all 120 Community sibling references to
`workspace:^` and WP-A4 migrated the 7 Development `@comity-dev/*` sibling references, so neither repository packs exact sibling pins
and each stage-2 run reports **0 `ARCH-PACK-005` findings**; sibling `devDependencies` stay `workspace:*` (ADR-033 Decision 2). WP-B's
ESM-only implementation is verified, published and formally ratified, so `ARCH-PACK-006` passes. No gate therefore blocks activation.
**Activation itself is still not authorised**: `COMITY_PACKED_SURFACE_ENFORCEMENT` must stay unset, no workflow may be changed to
enforce, and enabling the check requires a separate explicit decision by the architecture and release owners. Remediation completion is
not enforcement authorisation.

## 7. F-02 historical provenance (consistent with roadmap §9)

The historical provenance gap is **unresolved and permanent**; nothing here reconstructs it. The rewritten roadmap §9 separates (1) facts verifiable
now (Commerce `6c01ab6` is one commit of six documentation files; Development `a208100` is one commit of eleven documentation files under a message
naming only ADR-035; neither touches a manifest, lockfile, source, CI or Changesets file; the Phase A gate is verifiable from current document
text), (2) information only partially reconstructable (the commit grouping and timestamps; an earlier prose classification of edits kept only as
a prior assertion), and (3) provenance no longer verifiable (per-hunk authorship, edit time and order, whether the Phase A correction predated the
dependency-policy work, the accuracy of earlier attributions). A clean working tree does not establish provenance. No decision depends on it.

## 8. Documentation updated, and deliberately unchanged

**Updated (documentation only):** Development — ADR-022 (conditional note only), ADR-033, ADR-034, ADR-035, ADR-036, `release-review.md`,
`packages/validate/docs/declaration-dependencies-design.md`, `docs/architecture/dependency-remediation-roadmap.md` (§8, §9 and table rows), this
record, and a post-resolution note in the maintainer review. Community — `docs/architecture/repository.md`, `SKILL.md`, `docs/.documentation/AGENT.md`.
Commerce — `docs/governance/package-dependency-policy.md` (the Commerce namespace stays **[OPEN]**).
**Updated by the acceptance-readiness pass (2026-11-04, documentation only):** ADR-033 (Decision 1 scope, new "Scope of the range
rule" section, "Acceptance status and remaining questions" replacing "Open questions", Scope); ADR-034, ADR-035, ADR-036 (the same
"Acceptance status" restructuring, separating maintainer acceptance from release-time approvals, implementation choices and deferred
items); the roadmap (§1 row A, §2 WP-A4, §8.6) and this record (§2 D-01 row, §3 D2, §5.3, §6). No ADR status was changed; all four
remain `Proposed`. No manifest, source, CI, workflow or Changesets file was touched, and nothing was implemented.
**Updated by the governance-closure pass (2026-11-04, documentation and governance only):** this record (header, §3 A1/B6/B8/B9/B10
rows, the new "B10 responsibility model" subsection, §5.1, §6, §8), the roadmap (§2 work-package rows and the new **WP-E**, §4 sequencing
and milestone table, §8), ADR-034 and ADR-036 (their A1 sequencing statements), and the Commerce policy (header, §8, §9). **Under the B9
authorisation only**, the two frozen Commerce documents received the ADR-036 reference alignment:
`commerce/docs/architecture/07-package-architecture.md` and `commerce/docs/architecture/resolution/architecture-freeze-assessment.md`.
**No work package was authorised, started or completed.** No manifest, source, lockfile, CI, workflow, script or tooling file was
touched, and the pnpm migration (**WP-E**) was **NOT STARTED**.
**Updated by the WP-C1 closure (2026-11-05, documentation only):** this record (header, D-03/D-04/D-05 status, the B10 completion
record, §6, §8 and §9), the roadmap (header, §1 row C, WP-C1/WP-C2 rows, §8.7), and the Community governance-handoff backlog. No
source, manifest, lockfile, CI, workflow, changeset, release, package or publication change was made. **WP-C1 is `COMPLETED`; WP-C2
remained `NOT AUTHORIZED` and `NOT STARTED` at that point.**
**Updated by the WP-C2 authorisation and release-gating pass (2026-11-05):** this record (header, D-03/D-05 status, B3 row,
B10 WP-C2 approval and status records, §6, §8 and §9), the roadmap (header, §1 row C, WP-C2 row, §8.7), the Community
governance-handoff status/backlog, and a new `.changeset/declaration-dependencies-stage-1.md`. The changeset is the only
implementation artifact; no package version, changelog, manifest, lockfile, CI workflow, release, tag or publication was
changed. **At that point WP-C2 was `AUTHORIZED` and `STARTED` but `NOT COMPLETED` because the Community consumer bump required
the published `@comity-dev/validate@0.3.0`; the completion update above supersedes that status.**
**Updated by the WP-C2 release-execution authorization (2026-11-05):** this record (header and B10 release-execution
authorization and status paragraph), the roadmap (header and WP-C2 row), and the Community governance-handoff status/backlog.
The release owner authorized the authorized-scope publication and release execution, including tag creation, Community consumer
migration and stage-1 CI activation. No package was published and no manifest, lockfile, CI workflow or tag was changed by this
authorization record; execution evidence follows in the completion update.
**Updated by the WP-C2 completion (2026-11-05):** this record (header, D-03/D-05 status, B10 completion status, §6, §8 and §9)
and the roadmap (header, §1 row C, WP-C2 row, §8.7) now record completion. The release workflow published
`@comity-dev/validate@0.3.0` and `@comity-dev/cli@0.2.4` at Development commit `a403257`; tags `23bfae2` and `8a1fd4e` target
it. Community PR #16 (`83c8dce`) migrated consumers and the lockfile. Community CI run `42000652819`, main CI run `42001013330`
and Release run `42001013288` passed; the release step reported no new packages to publish. No WP-C3, WP-C4, WP-D* or unrelated
release was started.
**Updated by the WP-C3 authorization, implementation and release (2026-11-05):** this record (header, B10 model, §6.1 and §9), the
roadmap (header, §1 row C, §2 WP-C3 row, §4.1 and §8.7) and the Community governance handoff (header, §D row 5, §E, §F.2, §G) record
the WP-C3 approvals, the implementation, the release and the enforcement gate. Changed by this pass: the stage-2 engine and its tests,
`run.ts` / `format.ts` / CLI registration, the design §12 implementation notes, the package README, the changeset, both release
workflows, both root `validate:packed-surface` scripts, and the Community consumer/lockfile bump. No ADR was changed, no unrelated
package or release was touched, and no unrelated working-tree modification was staged or committed. **WP-C3 is `COMPLETED`, verified
and `RELEASED`; stage-2 enforcement remains inactive** — since 2026-11-05 WP-A1 and WP-A4 are implemented and WP-B is ratified, so the
technical prerequisite is satisfied, while activation stays a separate explicit decision. The WP-A1/A4 counts
are a 2026-11-05 snapshot.

**Updated by the WP-C2 final closure and WP-C3 handoff (2026-11-05, documentation only):** this record (header, §6.1, completion
evidence and §9), the roadmap (header, §1 row C, §2 WP-C3 row, §4.1 and completion evidence) and the Community governance handoff
(header, §D WP-C3 row, §F.1, §F.2 and §G) recorded the WP-C2 closure evidence and the WP-C3 handoff. Independently inspected in that
pass: PR #16 (`83c8dce`) and PR #21 (`b67aa0b`), both annotated tag objects and their dereference to `a403257`, both GitHub releases,
the registry `latest` dist-tags and version lists, the downloaded tarballs, and CI runs `42000652819`, `42001013330`, `42001013288`,
`42001723228`, `42001856842` and `42001856844` (all `success`; the Community `ci` job's step order is `Build` → `Type-check` →
`Validate` → `Test`). Local build, type-check, test (2,373 tests), ESLint (0 errors), both normalization checks, the
`ARCH-DECL-DEP-001` negative control and the printed Declarations counts are execution-report evidence and were **not** re-run in that
documentation-only pass. That pass also removed unsupported draft statements that then described WP-C3 as authorized, implemented or
released: at that point no governance, repository, tag, release or registry record supported them. The later explicit approvals
recorded above supersede that status. No source, manifest, lockfile, CI, workflow, changeset, release, tag or publication change was
made in that pass, and no pre-existing uncommitted working-tree modification was staged or committed.
**Deliberately unchanged:** `runtime-support.md` (WP-B), `queue-pg-boss` package docs (WP-B), `repository-ownership.md` (D4), the independent
review (byte-identical), ADR-032, the Order design, and all Commerce freeze documents **except** the two ADR-036 reference alignments
authorised by B9 — in particular the `07 §4` **manifest sketch was NOT corrected**, because that change is outside B9's authorised scope.

## 9. ADR status: closure pass and formal acceptance

| Document | Before closure pass | After closure pass | After formal acceptance (2026-11-04) |
|---|---|---|---|
| ADR-022 | Accepted | Accepted (conditional note; text preserved) | **Accepted** — conditional note converted to a **definitive pointer** to ADR-034; historical text preserved, unrewritten |
| ADR-032 | Proposed | Proposed | Proposed (unchanged; not part of this work) |
| ADR-033 | Proposed | Proposed (contents revised) | **Accepted** — Decision 1 scope (incl. `@comity-dev/*`), cascade default, coordinated patch release as a separate activity, no deprecation schedule |
| ADR-034 | Proposed | Proposed (contents revised) | **Accepted** — ESM-only for every package; ADR-022 partially superseded. Semver class deferred to WP-B's release |
| ADR-035 | Proposed | Proposed (contents revised) | **Accepted** — severity `error` from day one (Decision 9 guard preserved); `typescript` a runtime `dependency` of `@comity-dev/validate` |
| ADR-036 | Proposed | Proposed (contents revised) | **Accepted** — verification baseline **pnpm 12.16.1 / Node 24+** (superseding the pnpm 10.13.x proposal) |
| `release-review.md` | Proposed | Proposed | **Adopted** — mandatory for every `Version Packages` PR; full review only on triggers T1–T6; WP-A2 the recommended pilot |

**Acceptance authorises no work package.** WP-A1, WP-A2, WP-A4, WP-B, WP-C3 and WP-D1/D2/D3 each still require their own
implementation authorisation (**B10**); WP-C1 was authorized under B10 on 2026-11-04 and is `COMPLETED` (2026-11-05); WP-C2 was
authorized under B10, its release scope was approved, and release execution was authorized on 2026-11-05; WP-C2 is
`COMPLETED` (2026-11-05). WP-A2 additionally requires release-owner approval (**B6**).

## 10. Unresolved contradictions that prevented closure

None. The one question that materially changes sequencing and that the approved decisions do not answer is recorded as **A1**; it is an open
decision, not a contradiction between documents.
