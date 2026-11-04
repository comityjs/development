# Maintainer Review Package — Comity Dependency Policy (ADR-033 … ADR-036)

> **Status:** Review material, revision 2 (remediation after `dependency-policy-independent-review.md`). It accepts, rejects and
> changes nothing. All four ADRs are `Proposed`; `release-review.md` is `Proposed`. No statement here implies an ADR is accepted.
> **Prepared:** 2026-11-04. **Decisions belong to:** Comity maintainers.
> **Location rationale:** `docs/standards/` has no review folder; `decisions/` holds ADRs only and `docs/architecture/` holds the
> roadmap, so `docs/standards/reviews/` keeps review packages apart from the documents they review.
> **Evidence record:** the independent review (`IR-nn` below) is the full evidence record for every finding cited here.

Labels: **[FACT]** verified in current repository state · **[VERIFIED-IR]** reproduced by the independent review's experiments
(and, where stated, its artefacts inspected by me) · **[PROPOSED]** what an ADR proposes (not in force) · **[REC]** this package's
recommendation · **[DECISION]** awaiting a maintainer.

> **Post-resolution note (2026-11-04).** After this revision the architecture owner approved decisions D-01…D-08; they are recorded in
> `dependency-policy-decision-resolution.md`, which is authoritative where it differs from this document. This package is kept as the
> historical review: its findings and recommendations are unchanged, and the few statements that the resolution supersedes are marked
> **[Superseded]** in place. Architecture-owner approval is **not** formal maintainer acceptance of any ADR.
> **Terminology:** where this historical review says "CommonJS support", "CJS consumers" or "dual build", read: Comity supports ESM and Node 24+
> `require(ESM)` compatibility only; it does not support CommonJS modules, and `require` resolves to the same ESM artifact as `import` (see ADR-034
> "Terminology"). The old `dist/cjs` tree was CommonJS-syntax output that Node evaluated as ESM.
> The outstanding decisions are classified (A architecture-owner, B maintainer governance, C implementation, D deferred) in that record §3, which replaces the
> open-question list in §7 below.

> **Acceptance-readiness pass (2026-11-04, later than the resolution record).** ADR-033's `@comity-dev/*` scope question — which this
> package recommended **deferring** (§3, ADR-033 **[REC]** item 6) — is **resolved**: ADR-033 Decision 1 now applies to those 7 published
> sibling references, because the verified evidence establishes no different release policy (same pnpm `workspace:*` rewriting, same public
> independent-release Changesets model, no separate channel, grouping or exemption). See ADR-033 "Scope of the range rule" and resolution
> record §5.3; migration is roadmap **WP-A4**. **[Superseded]** applies to the "`@comity-dev/*` deferred" recommendation only — the
> "do not deprecate old exact-pinned versions now" recommendation **stands** (it is a deferred registry-maintenance concern, and no
> deprecation schedule is proposed). All four ADRs now carry an "Acceptance status and remaining questions" section that separates formal
> maintainer acceptance from release-time approvals, implementation choices and deferred items. All four ADRs remain `Proposed`; nothing
> was implemented and no ADR status was changed.

> **Formal acceptance (2026-11-04, latest entry).** Comity maintainers have since **Accepted ADR-033, ADR-034, ADR-035 and ADR-036** and
> **adopted `release-review.md`**. Statements in this package that describe the four ADRs as `Proposed` or awaiting acceptance — including
> the **[FACT]** in §0 and the **[REC]** verdicts in §3 — are the **historical review record** and are preserved as written; they are
> superseded by that acceptance. Recorded outcomes: **ADR-033** accepted with Decision 1's Comity-wide scope (incl. `@comity-dev/*`), the
> cascade default, and no deprecation schedule; **ADR-034** accepted with the partial supersession of ADR-022 (its conditional note now a
> definitive pointer, historical text preserved); **ADR-035** accepted with severity `error` from day one (Decision 9 guard preserved) and
> `typescript` as a runtime dependency of `@comity-dev/validate`; **ADR-036** accepted with the verification baseline **corrected to
> pnpm 12.16.1 / Node 24+** — the pnpm 10.13.x target stated in this package is **superseded**. `release-review.md` is adopted as mandatory
> for every `Version Packages` PR with trigger-tiered depth (T1–T6) and WP-A2 as the recommended pilot. **Acceptance authorised no work
> package:** WP-A1/A2/A4, WP-B, WP-C1/C2/C3 and WP-D1/D2/D3 each still require their own authorisation, release approvals remain
> outstanding, and architecture-owner decision **A1** remains open. Nothing was implemented.

## 0. Circulation verdict and evidence baseline

**Circulation verdict (revision 2): fit to circulate to maintainers.** The two findings that blocked circulation are corrected in
this revision: **IR-01** (the split-release procedure was not executable as described) and **IR-02** (its compatibility cost was
understated and conflicted with ADR-036) — see Decision B (§4). The F-02 provenance treatment (**IR-11**) is corrected in §9.
**No ADR is implementation-ready.** Nine P2 and five P3 findings remain open as conditions on the documents under review (§10);
none was fixed here, and the ADRs, roadmap, release standard and Commerce documents are unchanged.

| Repository | Branch | HEAD | Working tree |
|---|---|---|---|
| `community` | `feature/commerce` | `91f5de1` | clean |
| `development` | `feature/commerce` | `a208100` | only `docs/standards/reviews/` (untracked: this package and the independent review) |
| `commerce` | `main` | `6c01ab6` | clean |

- **[FACT]** ADR-033…036 exist under `development/docs/standards/decisions/`, all `Status: Proposed`. `release-review.md`, the
  declaration-dependencies design, the roadmap and Commerce `docs/governance/package-dependency-policy.md` exist and are committed.
- **[FACT]** ADR-033's counts hold on the current tree: 54 packages; **94** sibling `dependencies` + **26** `peerDependencies` = 120
  `workspace:*` references in **50** packages; 2 sibling `devDependencies` (`cli-commander`). `.changeset/config.json`: `fixed: []`,
  `linked: []`, `ignore: []`, `updateInternalDependencies: "patch"`.

## 1. Executive summary

**Problem.** Comity publishes sibling dependencies as exact versions (`workspace:*` → `0.9.1`), so version drift creates duplicate
installed copies of identity-bearing packages (`BaseError` in `@comity/primitives`; nominal `Money`/`Price`/`OrderId` types).
Duplicates make `instanceof BaseError` fail and `toSafePayload` return `"unknown"`. Separately, published packages route `require`
to `dist/cjs/*.js` files that Node loads as ESM, so `require("@comity/…")` crashes (ADR-034 reproduces this on 0.9.0/0.9.1; the
independent review reproduced it on Node 24.19.0). Nothing checks that published `.d.ts` files reference only declared dependencies
(ADR-035), and nothing says how a package outside `community` declares, develops against, and verifies its Comity dependencies (ADR-036).

**Why the four are related.** One defect class — *the published dependency graph is not what the design assumes* — attacked at four
points: how ranges are published (033), what `require` receives (034), what is checked before publishing (035), and how outside
consumers declare and prove their graph (036).

**If nothing is adopted.** New releases keep exact pins; outside packages cannot get a reliable singleton for `primitives`; CommonJS
consumers keep crashing; a dev-only type dependency in a published `.d.ts` stays undetectable (silent `any` under the
`skipLibCheck: true` that `community/tsconfig.json` uses).

**Proposed vs implemented.** Everything proposed is **[PROPOSED]**. Implemented today: exact pins, a `dist/cjs` build, no declaration
engine, no written cross-repository policy, no mandatory release review. No ADR text has been applied to any manifest, build tool,
validator or workflow.

**The release-strategy decision is not settled.** ADR-033's coordinated *patch* release does not trigger Changesets' peer-major
cascade, so ADR-033's core can proceed. But the next *minor* of any of **16** peered Core packages would release its peer dependents
as `1.0.0` under today's tooling. Avoiding that is possible only with a release-process change, and it trades a version-number cost
for a real compatibility window. Maintainers must choose (Decision B); this package recommends Option 1 as the default and
**does not describe the split procedure as established or supported**.

**Asked of maintainers:** six decisions (§4): per-ADR acceptance (A), the peer-major release strategy (B), the ESM-only contract (C),
missing-build behaviour (D), Comity-wide scope of ADR-036 (E), release-review governance (F).

## 2. ADR decision briefs

### Recommendation matrix (revision 2)

| ADR | Revision 1 | **Revision 2** | Why it changed / what remains |
|---|---|---|---|
| ADR-033 | Amend | **Accept with amendments — release strategy remains an unresolved maintainer decision** | IR-01/IR-02 invalidated the Option 2 recommendation; amendments are listed in the brief |
| ADR-034 | Accept | **Accept with amendments** | IR-03 (`queue-pg-boss`), IR-04 (normative Edge/Workers/browser claims), IR-15 |
| ADR-035 | Amend | **Accept with amendments (rationale replaced)** | Revision 1's "unreproducible baseline" rationale was wrong (IR-13); amendments now rest on IR-05…IR-08, IR-14 |
| ADR-036 | Amend | **Accept with amendments** | §4 step 4 cannot be performed by the ADR-035 engine as designed (IR-05); IR-09; version pinning |

### ADR-033 — Sibling dependency publication and version ranges

- **Decision requested.** Publish internal sibling `dependencies`/`peerDependencies` as `workspace:^` (→ `^<version at publish>`);
  keep sibling `devDependencies` at `workspace:*`; one coordinated patch release; a mandatory `Version Packages` review.
- **Problem.** Exact pins force duplicate instances; consumer-side peers cannot override a transitive exact pin (three reproduced graphs, one inside `http-hono`'s own stack).
- **Proposed solution.** Caret ranges; per-package verification of the 120 references; exceptions only for non-exported internals (none known); forward-only recovery.
- **Rationale.** The smallest change removing the one duplication cause Comity itself controls. **[VERIFIED-IR]** a sibling patch re-releases dependents under `workspace:*` and not under `workspace:^`; the mechanism is `getDependencyVersionRanges` plus `updateInternalDependents: "out-of-range"`.
- **Alternatives considered/rejected (ADR).** Keep `workspace:*`; `workspace:~`; wide ranges; lockstep `fixed`; all-peers; `onlyUpdatePeerDependentsWhenOutOfRange`; consumer-only overrides.
  **Omitted by the ADR (IR review §4.3), to be added with a stated reason:** (a) `workspace:^` for `dependencies` only, keeping `peerDependencies` at `workspace:*` — fixes the transitive-pin graph with no change to cascade behaviour (the cascade fires on any non-patch peer release regardless of range), but published peers stay exact; (b) a `fixed` group limited to the identity-bearing core instead of all 54.
- **Impact on published packages.** Old versions keep exact pins permanently; only releases after the coordinated patch carry carets. Mixed old/new graphs still duplicate until upgrade or `pnpm.overrides`.
- **Maintainers / consumers.** A sibling patch no longer re-releases dependents, so changesets must list dependents explicitly. Floors ratchet. The release review adds recurring effort.
- **Rollout.** WP-A1 → WP-A2 (one patch changeset for the 50 packages, reviewed under `release-review.md`, tarball + clean-consumer checks).
- **Risks / limits.** No single-instance guarantee (ADR Decision 7). **Release strategy for peered minors is unresolved** (Decision B): ADR-033's current text "not decided here" is accurate but leaves no owner or default.
  Benefit is real but narrow: every existing consumer stays on immutable exact pins until they upgrade. A maintainer could reasonably reject ADR-033 and rely on consumer-side detection; the counter-argument is that exact pins are the only duplication cause Comity controls, and one reproduced graph is duplication *inside* Comity's own HTTP stack.
- **[REC] Accept with amendments**, in this order of importance: (1) record Decision B's outcome in the peer-major section, or state explicitly that it is an open maintainer decision with the options and the default of §4B — not an unowned "not decided here"; (2) **IR-01/IR-02** — name the mechanism (`changeset version --ignore`) and the compatibility window if a split is ever adopted; add the tested-vs-published divergence to Consequences; (3) **IR-10** — correct line 15 and migration step 1 (the "branch from `origin/main`" instruction is now wrong: `community` is *ahead* of `origin/main`); (4) **IR-12** — list all 16 peered packages; (5) add the two omitted alternatives; (6) record owner answers to open questions 3 and 4 (recommended: `@comity-dev/*` deferred; do not deprecate old exact-pinned versions now). ADR-033's core (carets + patch release) does not depend on Decision B; Decision B is needed before the first peered-Core minor.
- **Maintainer decision:** ☐ Accept ☐ Accept with amendments ☐ Reject — notes: ______

### ADR-034 — ESM-only distribution; `require` served by `require(esm)`

- **Decision requested.** Stop emitting `dist/cjs`; map `import` and `require` to the same `dist/esm` and `dist/types`; support `require` only on Node ≥ 24.0.0; amend ADR-022's dual-distribution paragraph and replace the repository-wide dual-build convention.
- **Problem.** **[FACT]** `comity-build` runs a second `tsc` pass into `dist/cjs` (build and watch paths); `primitives` points `main`/`require` at `./dist/cjs/…` under `"type": "module"`. A "fixed" dual build creates two `BaseError` classes (**[VERIFIED-IR]**: the nested-marker alternative yields `!==`).
- **Proposed solution.** One implementation and declaration tree; synchronous ESM graphs (no top-level `await`), enforced by a tarball test.
- **Rationale.** **[VERIFIED-IR]** all seven runtime claims reproduce on Node 24.19.0 (crash today; identical `BaseError` under the proposal; `ERR_REQUIRE_ASYNC_MODULE` on top-level `await`; zero bytes on stderr).
- **Alternatives rejected.** Nested `commonjs` marker, `.cjs` (two classes); drop `require`; bundled dual output; status quo.
- **Impact on published packages.** Rewrite `require.default` and `main`; remove `dist/cjs`. **Correction (IR-03):** the ADR's "every package" premise is false — **53 of 54** manifests reference `dist/cjs`; `@comity/queue-pg-boss` has **no `require` condition and no `main`** (**[FACT]** re-checked), and `package-metadata.ts` requires neither, so no validator flags it. WP-B needs an explicit decision for it: adding a `require` condition would *extend* its published surface under a patch bump.
- **Maintainers / consumers.** ESM unchanged; Node CJS crash → works on Node ≥ 24; TypeScript `.cts` needs `nodenext`. Bundlers, Deno, Bun, Workers untested; no claim.
- **Rollout.** WP-B, independent of WP-A, proposed **patch**. Evidence is scratchpad-only (ADR) plus the independent review's own reproduction; neither is a repository artifact — re-run on tarballs.
- **Risks / limits.** **IR-04:** `runtime-support.md` is **normative** ("No package may claim a runtime it does not actually support"); §2 claims Edge/Workers and §3 names browser surfaces (`hydration`, `hydration-preact`, `hydration-react`) reached through bundlers. ADR-034 repoints `main` and removes `dist/cjs` yet scopes its documentation amendment to §1 only, while admitting bundlers are untested. Acceptance makes ADR-034 the authority for those claims. Also: top-level `await` becomes forbidden.
- **[REC] Accept with amendments — acceptance must include the scope corrections** (the ADR itself is not modified by this package): (1) **IR-03** — state the 53/54 population, decide `queue-pg-boss`'s treatment, correct ADR-022's "47 packages" when the pointer is added; (2) **IR-04** — either make the bundler smoke build (validation requirement 6) mandatory for at least one §3 browser surface, or scope `runtime-support.md` §2/§3 to the `import` condition and state the `require`/`main` path is unverified outside Node (the cheaper option is sufficient; neither is not); add §2/§3 to the roadmap §6 table; (3) **IR-15** — word the §1 amendment as "supported range is Node ≥ 24 by `engines`; `require(esm)` exists in earlier majors but no runtime below `engines` is claimed". Semver patch and keeping both `import`/`require` keys remain recommended.
- **Maintainer decision:** ☐ Accept ☐ Accept with amendments ☐ Reject — notes: ______

### ADR-035 — Published declaration dependency validation

- **Decision requested.** Add an `@comity-dev/validate` engine over built `.d.ts`, severity **error** from day one, rules `ARCH-DECL-DEP-000…005`, `typescript` moved to the validator's `dependencies`.
- **Problem.** A `.d.ts` importing a dev-only or undeclared package gives consumers TS2307, or silent `any` under `skipLibCheck: true`.
- **Proposed solution.** Static parse of declarations reachable from `exports`/`types`/`typesVersions`; no installed-package resolution; deterministic output.
- **Rationale.** **Revision 1 called the zero-finding baseline "unreproducible"; that was wrong (IR-13).** **[VERIFIED-IR]** 54 packages, 537 `.d.ts`, 443 references, 0 undeclared, 0 dev-only reproduce from committed build output (all dated 2026-10-31; only a docs file changed in `community` since). Severity-from-day-one is supported by ADR-010 (no backlog) and this reproduction. **Limits of that reproduction, kept explicit:** it is a textual superset (all 537 files, not entry-reachable ones) and does not exercise `-003`, `-004`, `-005` (`cache-redis` is the only package with optional peers and references neither, so `-003` has zero candidates). "The counting baseline is reproducible; the full rule-set result is not yet established."
- **Alternatives rejected.** Extend `adapter-peers`; source-import checks; dependency-cruiser; tarball-compile only; report-only.
- **Impact on published packages.** None expected.
- **Maintainers / consumers.** Larger validator install; CI step after `pnpm build`; validator minor release.
- **Rollout.** WP-C1 → WP-C2; independent of WP-A and WP-B.
- **Risks / limits (actual findings).**
  - **IR-05** — the engine cannot run where ADR-036 §4 step 4 puts it (see ADR-036).
  - **IR-06** — `discover.ts` skips any package not named `@comity/*`/`@comity-dev/*` and returns an empty, passing result silently; Commerce coverage is conditional on the **open** namespace decision.
  - **IR-07** — the engine validates the **built** `dist/types`, not the **packed** tarball; the `files` field is not checked. The ADR's title says "Published"; the packed-surface guarantee comes only from clean-consumer compilation (ADR-036 step 3). **The validator does not validate the actual published artifact.**
  - **IR-08** — exit 2 (cannot run) can co-occur with real findings, and `comity-validate.ts` prints violations only with `--verbose` (**[FACT]** line 100).
  - **IR-14** — the 443 figure does not discriminate the reachability filter (all 537 files give 443).
- **[REC] Accept with amendments (rationale replaced):** (1) a zero-discovered-packages run reports `NOT-APPLICABLE` with a reason naming the filter, never a silent PASS (IR-06) **[Superseded: the resolution refines this — roots resolving to no packages are `CONFIGURATION-ERROR`; `NOT-APPLICABLE` only when all packages are private, with the private packages listed; see ADR-035 Decision 5]**; record the namespace dependency; (2) state built-vs-packed scope in Decision 2 or the title; resolve design open item 3 as deferred to ADR-036 step 3 (IR-07); (3) always print findings and document that exit 2 may co-occur with violations; add a mixed-run test (IR-08); (4) the WP-C1 regression test asserts the **reachable** file count separately from the total, and is justified as **rule-set coverage** of `-003/-004/-005`, not as the sole basis for severity (IR-13/IR-14); (5) resolve design open item 1 as proposed (`optionalDependencies`/`bundledDependencies` do not satisfy a reference; none are used today).
- **Maintainer decision:** ☐ Accept ☐ Accept with amendments ☐ Reject — notes: ______

### ADR-036 — Cross-repository Comity dependency policy

- **Decision requested.** Comity-level policy for packages outside `community`: per-edge declaration classes; caret-on-lowest-tested peer ranges; local development via packed tarballs + `pnpm.overrides` (no cross-repository `link:`); mandatory clean-consumer verification before publishing; direction Consumer → Comity only.
- **Problem.** No written rule; both blanket rules are wrong; `link:` was reported to duplicate identity even at equal versions.
- **Proposed solution.** Evidence-based classification per package; a 7-step verification.
- **Rationale.** Rules concern published Comity contracts; Commerce's document is the first application. The pnpm experiments behind `link:`/`file:`/tarball are **[REPORTED]**, not independently re-run; the prohibition of `link:`/`file:`/overrides in released manifests is sound regardless.
- **Alternatives rejected.** Blanket regular/peer; type-only = dev; `link:`/`file:` defaults; exact pin; Commerce-only policy; submodule/vendoring (not evaluated). **Add a row** for `pnpm.overrides` in a published consumer manifest (consumer-side only, cannot be published by a library).
- **Impact on published packages.** None.
- **Maintainers / consumers.** Outside authors carry a pack→install loop and a CI job; under 0.x each breaking Comity minor requires a consumer release. Target: pnpm 10.13.x / Node 24+ only.
- **Rollout.** Documentation acceptance only; reliable only against Comity releases published after WP-A2.
- **Risks / limits.** **Documented policy, not technical enforcement** (Decision E).
  **IR-05 — unresolved mismatch.** §4 requires the verification to install tarballs "in a fresh consumer directory outside the workspace" and step 4 to verify declaration references with "the ADR-035 engine, or its equivalent". As designed, the engine reads `comity.config.json`, discovers `packages/` source roots and skips packages not named `@comity/*`/`@comity-dev/*`, and does not inspect tarballs; in a clean-consumer tree it discovers zero packages and reports 0 findings, PASS — a gate that looks enforced and checks nothing. ADR-036's dependency on ADR-035 is therefore not the soft "or equivalent" relationship revision 1 stated. **This package does not resolve the contradiction and does not redefine the validator.** A coherent solution must be chosen **before implementation**; the independent review's two candidates are (a) run the declaration check in the *source* repository against the built package, and rely on step 3 (`skipLibCheck: false` compile of the installed tarballs) for the published surface; or (b) require the equivalent script to accept an arbitrary package directory. Either way the engine must fail loudly on zero discovered packages (IR-06).
- **[REC] Accept with amendments:** (1) resolve IR-05 as above in §4 step 4 and in the roadmap's publication-gate row; (2) **IR-09** — add an enforcement-authority sentence ("a publication precondition applied by Comity maintainers when reviewing a consuming repository's first publication; it does not assert authority over another repository's CI"), and fix the `repository-ownership.md` reference, which does not mention Commerce; (3) pin versions explicitly in step 2 (floor and latest-in-range legs, as Commerce policy §7 already does): `strict-peer-dependencies=true` would otherwise fail during any release window that publishes a peered minor beside lagging adapters; (4) enforcement-status section; (5) settle open question 3: no consumer is promised CommonJS until ADR-034 is accepted and implemented.
- **Maintainer decision:** ☐ Accept ☐ Accept with amendments ☐ Reject — notes: ______

## 3. Cross-ADR interactions

| Relationship | Evidence | Consequence |
|---|---|---|
| 033 ↔ 034 | ADR-034 "independent of ADR-033"; both proposed as **patch** | May share a release train or ship separately (release owner). Shipping 034 as a *minor* would trigger the peer-major cascade, so semver class is part of 034's acceptance. |
| 033 → 036 | ADR-036 deps; Commerce policy §5 | 036's peer rules are reliable only against Comity releases published with carets. Accepting 036 does not require WP-A2; *Commerce publication* does. |
| 035 ↔ 036 | ADR-036 §4 step 4; ADR-035 Decision 2; `discover.ts` | **Not a soft dependency.** The engine as designed cannot run in the clean-consumer context 036 specifies (IR-05). Both ADRs can be accepted with amendments, but the execution context must be fixed before either is implemented against the other. |
| 034 → 036 | ADR-036 open question 3 | `require` verification applies only if a consumer promises CommonJS. |
| 035 ↔ 034 | ADR-035 deps | After 034, `import`/`require` share one `types` tree; the engine checks one tree. |
| 035 ↔ 033 | ADR-035 "no dependency" | None; 035 also guards WP-A1/WP-B manifest changes. |
| **033 ↔ 036 via Decision B** | ADR-036 Context/Consequences; IR-02 | A split release (Option 2) knowingly publishes the "warns only … runs against the wrong version" condition that ADR-036 records as a verified defect, and makes 036's `strict-peer-dependencies=true` verification fail during the window. Decision B and ADR-036 must be read together; Option 2 cannot be recommended while ignoring this. |
| 033 gate ↔ Decision B | `release-review.md` §3.2.4, §4 | The gate **blocks** a peered-Core minor whose dependents' handling is undecided. Its two remedies are "accept as a major" (executable today) or "split" (**not** executable today — IR-01). |

**Independent acceptance:** all four ADRs (acceptance is documentation). **Operational dependencies:** WP-A2 needs WP-A1 and the review gate; Commerce publication needs 036 + WP-A2 + a declaration check that actually runs (IR-05). **WP-B and WP-C can start once their own ADR is accepted, independent of WP-A.** Decision B is needed only before the first peered-Core minor, not before WP-A2.

## 4. Decision register

**A. ADR acceptance — four independent decisions.** Options: accept / accept with amendments / reject. **[REC]** per the matrix in §2. A rejection of one must not block the others except as §3 states.

### B. Release strategy for a peered-Core minor (peer-major cascade)

**1. What Changesets does by default [FACT + VERIFIED-IR].** `@changesets/assemble-release-plan@6.0.10` (`shouldBumpMajor`, ~lines 337–345): a package listing a changed package in `peerDependencies` is bumped **major** whenever that package receives a minor or major release, for `workspace:*` and `workspace:^` alike. `onlyUpdatePeerDependentsWhenOutOfRange` merely changes this to "when the new version leaves the range", which every 0.x caret minor does. Under 0.x a major is `1.0.0`. Exposure: **16** distinct peered Comity packages (`acl`, `auth`, `auth-tokens`, `cache`, `cli`, `composition`, `graphql-client`, `html`, `http`, `hydration`, `i18n`, `primitives`, `queue`, `router`, `sql`, `validation`; 26 peer references across 19 packages) — not the 7 ADR-033 illustrates. A patch of the peered package does **not** trigger it, so WP-A2 is unaffected. Experiment T2 (independent review; artefact inspected): a changeset naming only the peered package as `minor` yields `base` 0.10.0, `adapter` **1.0.0**. Naming fewer packages in a changeset cannot prevent it: dependents are computed from the dependency graph by `determineDependents()`.

**2. What a split requires [VERIFIED-IR].** The *outcome* is achievable: `changeset version --ignore <dependent packages>` releases the peered package alone (0.10.0) while dependents stay at 0.9.1; a later changeset then yields the dependent at **0.9.2** (not 1.0.0), publishing `^0.10.0` (T5; end state inspected in `/tmp/cs-exp/T5_ignore`, which is outside the repositories and not a repository artifact). `--ignore` is accepted because `.changeset/config.json` has `"ignore": []` (`@changesets/cli@2.31.1` rejects it only when the config array is non-empty) and the CLI requires every dependent of an ignored package also to be ignored.

**3. What must change in the current workflow [FACT].** `community/package.json` has `"version": "changeset version"` and `.github/workflows/release.yml` runs `changesets/action@v1` with `version: pnpm run version`. The action invokes that fixed script with no `--ignore`. A split therefore needs a dedicated script/workflow path (e.g. a separate `version` script or a run outside the action) or hand-editing the generated branch — which `release-review.md` §5 discourages ("the action regenerates it") and §5.3 forbids as a mid-PR Changesets-behaviour change. **Revision 1's statement that a split needs "no Changesets configuration change" is withdrawn.** The split is a **release-process change that must be authorised as one**. This package modifies no configuration or script.

**4. What a split costs in compatibility [VERIFIED-IR; contradicts a "warns only" framing].**
- After release 1 the registry holds `base@0.10.0` beside `adapter@0.9.1` whose published peer range is `^0.9.1` (`>=0.9.1 <0.10.0`). A consumer installing both gets an unmet peer — a **warning only** — and the adapter runs against a Comity minor it was never released or tested against. Under 0.x a minor may break.
- ADR-036's Context records exactly this condition as a **verified defect**: "an unmet or out-of-range peer warns only … and the package then runs against the wrong version". Peer warnings do not guarantee compatibility; they report a mismatch and install anyway. This package does not weaken that finding.
- **Workspace-tested vs registry-tested.** In the workspace `workspace:^` resolves to the *new* local version, so CI builds and tests `adapter` against `base@0.10.0`, while the registry's `adapter@0.9.1` claims support only for `^0.9.1`. What was tested and what is published diverge — the defect class this whole package exists to prevent. A strategy must therefore verify **the actual published package combination** (packed tarballs or registry installs of the exact versions consumers will receive), not the workspace graph.
- ADR-036's `strict-peer-dependencies=true` clean-consumer step fails against `latest` during the window, for a reason that is not a consumer defect.
- Avoiding a major cascade therefore does **not** automatically produce a safer release: it exchanges an unnecessary-looking version number for an under-tested published window. Conversely the cascade (Option 1) is not "wrong": its published graph is internally consistent (dependents and the new peer ship together with `^0.10.0` ranges) and its tested graph equals its published graph.

**5. Verified vs to-be-verified.**

| Verified (independent review) | **Not** verified; required before production adoption of any split |
|---|---|
| Cascade in source (6.0.10) and in a synthetic workspace (T2); patch does not trigger (T1) | The split on community's **real** workspace graph (19 adapters, 16 peered packages), not a 4-package synthetic one |
| `--ignore` yields the split and a 0.9.2 follow-up with `^0.10.0` ranges (T5) | How `changesets/action` behaves with a modified `version` script, a second `Version Packages` PR, and publish ordering (no topological-sort symbol was found in the pinned CLI; `release-review.md` §3.5.1 asserts ordering) |
| `--ignore` guard conditions (`ignore: []`; dependents must also be ignored) | Which package set must be passed to `--ignore` for a real peered minor |
| | A registry-equivalent clean-consumer test of the intermediate state, and the length/handling of the window |
| | `release-review.md` changes needed to record the window (§3.5) |

**Options compared.**

| | **Option 1 — Accept the cascade** | **Option 2 — Explicit split-release workflow** | **Option 3 — Change the release/versioning system** |
|---|---|---|---|
| What it is | Changesets default: peered-Core minor releases dependents as `1.0.0`, in the same plan | Peered package released alone via `changeset version --ignore <dependents>`; dependents follow in a second reviewed release | `fixed`/`linked` groups, or a different versioning tool/model |
| Benefits | No process change; executable today; published graph = tested graph (dependents and new peer ship together with consistent ranges); consistent with ADR-036 and with `release-review.md` §3.2.4's "accepted as a major" branch | No meaningless `1.0.0`; majors reserved for genuine adapter breaks | Could remove the cascade structurally (e.g. a scoped `fixed` group for the identity-bearing core) or add finer control |
| Costs | Up to 19 adapters jump to `1.0.0` for any of 16 peered minors without contract change; **1.0.0 is a semver stability signal that cannot be walked back**; consumer migration noise; every later breaking adapter change then needs a major | Needs a release-process change (script/workflow) and a second release every time; manual coordination | Highest: ADR-033 rejected lockstep for 54 packages as a release-model change; a scoped group still changes release semantics; a tool migration is large and ongoing |
| Compatibility risks | Low for the registry graph; high for consumer expectations of version meaning | **Real**: published window of untested adapter/peer combinations (§4); workspace-vs-registry divergence; strict-peer verification fails in the window | Depends on design; lockstep forces unrelated republishing; not evaluated here |
| Required implementation | None to proceed; record each cascade as a reviewed exception (`release-review.md` §5.2) and state in the release notes that the `1.0.0` is peer-driven | Authorised script/workflow change; real-graph dry run; window-handling and ordering rules; registry-equivalent verification; `release-review.md` §3.5 amendment | Separate design decision and owner approval (`release-review.md` §5.3); no evidence yet that simpler options are inadequate |
| Verification | `changeset version` dry run showing exactly the expected `1.0.0` set; packed-manifest and clean-consumer checks per `release-review.md` §3.4/§3.6 | All of the "not verified" column; install of the exact published combination with `strict-peer-dependencies=true` after release 1 and after release 2 | Prototype on the real graph; full release rehearsal |
| **Recommendation** | **Recommended default** | Not recommended now; **a candidate for a separately authorised pilot** if maintainers judge repeated peer-driven `1.0.0` unacceptable | **Not recommended**: no concrete evidence yet that Options 1–2 are inadequate |

**[REC] default: Option 1, applied deliberately.** Until a split workflow is authorised and piloted, a peered-Core minor ships with the cascade recorded as a release-owner-approved exception, with the peer-driven `1.0.0` stated openly in the changelog and release notes — including that `1.0.0` is a one-way change for those adapters. It is the only option executable with today's workflow whose tested and published graphs coincide. This **reverses revision 1**, whose Option 2 default rested on a procedure that was not executable (IR-01) and a cost description that was not accurate (IR-02). The recommendation is weak-to-moderate: the `1.0.0` cost is real. Maintainers should treat B as an explicit choice, and should note it is not urgent — it first matters when a peered Core needs a minor, not for WP-A1/WP-A2.

**[DECISION]** ☐ Option 1 (accept cascade) ☐ Option 2 (authorise a split-release workflow pilot) ☐ Option 3 ☐ other: ______ — and, if Option 2: ☐ authorise the release-process change ☐ require a real-graph dry run first.

**C. ESM-only contract.** Confirm: supported contract is ESM, with `require()` on Node ≥ 24.0.0 via `require(esm)`; no separate CommonJS build. **[VERIFIED-IR]** no package or consumer is promised a separate CJS build (`package-metadata.ts` does not require `main`/`require`; ADR-022's paragraph is scoped to the two CLI packages). Implications: Node CJS works on Node ≥ 24 (crashes today); TypeScript `.cts` needs `nodenext`; no top-level `await`; Node < 24, bundlers and non-Node runtimes outside the claim. **Confirmation is conditional on the ADR-034 scope corrections** (`queue-pg-boss`, `runtime-support.md` §2/§3). **[DECISION]** ☐ Confirm ☐ Confirm with scope corrections ☐ Revise.

**D. Missing-build behaviour.** **[Approved as D-05, including always-visible findings in every category; implementation is ordinary WP-C1 work, not an open decision.]** Proposed: `CONFIGURATION-ERROR`, `executed: false`, `passed: false`, no finding, exit **2**, never `NOT-RUN`.
- **[FACT] Consistent** across ADR-035, the design document (§3, §9, §10) and code (`exit-codes.ts` `CONFIG_ERROR = 2`; `run.ts` `categoryIsAcceptable` is false for an unexecuted `CONFIGURATION-ERROR`; `exitCodeForResult` maps it to 2; the Semgrep engine already returns this shape). The new category must be added to `allExecuted` in `run.ts` or it would silently pass (design §10 integration tests cover this).
- **IR-08 (open implementation condition).** Exit 2 outranks exit 1, so a run with real findings plus an unrelated missing build exits 2 ("cannot run"), and findings are printed only with `--verbose`. CI retry logic keyed on exit 2 can mask genuine findings. Keep the precedence; require findings always printed, document that exit 2 may co-occur with violations, add a mixed-run test.
- **[DECISION]** ☐ Confirm ☐ Confirm with IR-08 amendments ☐ Revise.

**E. Cross-repository scope of ADR-036.** Confirm Comity-level ownership, tarball + `pnpm.overrides` local development, and mandatory clean-consumer verification.
- **Enforcement status [FACT]: documentation only.** No ADR-036 verification job exists in any repository. `validate/src/engines/` contains `adapter-peers`, `depcruise`, `eslint`, `schema`, `semgrep` — no ADR-008 or cross-repository edge engine. `engines/depcruise.ts` calls `buildDependencyRulesForRoot(classification, repo.root)` without `registeredCoreEdges`, so the ADR-008 registered-exception path is not wired into the validator even in-repo (**[FACT]**, matches the independent review). `validate/dist` holds a stale ignored `core-register` build with no source — not evidence of a feature. ADR-035 is planned (no engine exists); the clean-consumer job is planned and unowned (Commerce WP-D3, gated on open freeze decisions #1–#3); tarball/overrides is developer discipline.
- **IR-09:** the ownership authority cited by ADR-036 (`repository-ownership.md`) does not mention Commerce. It supports Development owning Comity-wide *standards and ADRs*, but not compelling a CI job in a repository Development does not own; hence the "publication precondition" wording in §2.
- **Case for deferral, stated:** ADR-036 governs nothing that exists yet (Commerce is design-only). Counter: it justifies the shared placement of the ADR-035 engine and makes ADR-033's carets meaningful, and deferral leaves the frozen manifest sketch (`workspace:*` in `07 §4`) unannotated as wrong.
- **[DECISION]** ☐ Confirm Comity-wide ☐ Commerce-only ☐ Defer until the Commerce repository is approved ☐ Revise.

**F. Release-review governance.** **[Resolved by D-07: mandatory, with a basic checklist for every PR and a trigger-based full review; formal adoption remains a maintainer action (resolution record B5).]** `release-review.md` is manual and "takes effect when ADR-033 is Accepted".
**[REC]** Adopt as mandatory for every `Version Packages` PR, decided as its own item. The independent review recommends the **trigger-tiered** form instead of the full checklist on every release (full §3.2/§3.4–§3.6 only when a machine-checkable trigger is present — major/`1.0.0`, peer edge within the plan, range-protocol change, `exports`/`main`/`type`/`module`/`files` change, plan size ≥ 10, `workspace:`/`file:`/`link:` in a packed manifest; otherwise a one-line attestation; §3.1, §3.3 and all §4 blocking conditions always apply). Revision 1 recommended the full checklist; I now present both because the checklist has **no dry-run history** (IR-16): pilot it on WP-A2, record reviewer time and false alarms, then set the steady-state tier. Note that under Decision B Option 1 the gate's §3.2.4 remedy "split the release" is not executable today.
**[DECISION]** ☐ Mandatory, full checklist ☐ Mandatory, trigger-tiered ☐ Pilot on WP-A2 first, decide tier from evidence ☐ Advisory ☐ Reject.

## 5. Recommended implementation sequence (no dates, no estimates)

1. Maintainer review and acceptance of the ADRs (statuses changed by maintainers only). Decide A–F.
2. **WP-A1** — migrate sibling `dependencies`/`peerDependencies` to `workspace:^`; re-count; list exceptions. **Branch from the current main as the maintainers designate** — the documents' "branch from `origin/main`" instruction is stale (IR-10).
3. **WP-A2** — one coordinated **patch** release (does not trigger the cascade), reviewed under `release-review.md`; first pilot of the gate. Decision B is **not** required for this step.
4. **WP-B** — ESM-only distribution, after the ADR-034 scope corrections (`queue-pg-boss`, `runtime-support.md` §2/§3), tarball-tested on Node 24.0.0 and current 24.x.
5. **WP-C1/C2** — declaration engine, then release and CI wiring, after the ADR-035/036 amendments (IR-05…IR-08).
6. Commerce readiness reassessment.

**Before the first peered-Core minor:** Decision B must have been made; if Option 2, its process change and pilot precede that release.
**WP-B and WP-C can start once their own ADR is accepted, independent of WP-A.** The roadmap prefers WP-C1 before WP-A1/WP-B (it guards them and has no current findings); the order above is dependency-correct and maintainers may choose the roadmap's order.

## 6. Commerce and Phase A boundary

Separate from the four ADRs. Accepting ADR-033…036 **does not authorise** Commerce implementation or Order Phase A.

- Commerce readiness (first package *publication*) depends on ADR-036, the WP-A2 release, and a declaration check that **actually runs** — WP-C1 alone does not satisfy this while IR-05 is open, because ADR-036 places the check inside a clean-consumer job where the engine cannot run. The roadmap's publication row should name the artefact that performs it.
- ADR-034/WP-B is a Commerce prerequisite **only if** Commerce promises CommonJS. **[Superseded: D-02 makes the ESM-only contract universal, so the CommonJS condition no longer applies; whether WP-B must precede the first Commerce publication is open decision A1 in the resolution record, an architecture-owner decision not answered either way.]**
- **Phase A** remains gated by ADR-032 acceptance (**[FACT]** `Proposed`), review of `community/packages/order/docs/design.md` (**[FACT]** `Draft — pending review`), and Community sign-off. The roadmap states Phase A needs none of WP-A/B/C.
- Roadmap WP-D1 lists "ADR-036 accepted" as its dependency; amending the frozen `07 §4` sketch also requires the freeze's own change control (Commerce policy §8). Roadmap §5.2's recommendation to publish `@comity/order@0.10.0` after WP-A2 does not schedule Phase A and should cross-reference ADR-032's `Proposed` status.
- This package modifies no ADR-032, Order design, or Commerce freeze document.

## 7. Open questions and dissent

**[Superseded as a list: items 1–8 below are classified, with authority and latest decision point, in resolution record §3 — Decision B is settled by D-01; item 3 is implementation choice C6 and the `runtime-support.md` scoping is in ADR-034; item 4 (`queue-pg-boss`) is settled by D-02; item 5 (IR-05) is settled by D-06; item 6 is D-08/D4; item 7 is D-07/C8; item 8 is B2.]** Items requiring maintainer judgment (those resolved by the proposals are omitted):

1. **Decision B** — Option 1, an authorised Option 2 pilot, or other; and whether a real-graph dry run is a precondition for accepting ADR-033 (recommended: no — only for adopting Option 2).
2. **Deprecation of old exact-pinned versions** (ADR-033 Q4). Recommended: no.
3. **Bundler smoke build vs scoping `runtime-support.md` §2/§3** for ADR-034 (IR-04): which of the two.
4. **`queue-pg-boss`**: gain a `require` condition, or remain `import`-only and documented.
5. **IR-05 solution**: source-repository declaration check, or an arbitrary-directory equivalent script.
6. **Owner for the first clean-consumer job**, and enforcement authority over repositories Development does not own (IR-09).
7. **Release-review tiering** and its steady-state threshold (IR-16).
8. **Semver class of ADR-034.** Patch is defensible (documented behaviour starts working; `dist/cjs` was never exported) but a judgment call; adding `queue-pg-boss` a `require` condition extends its surface and should be decided separately.

**Dissent and weaknesses stated directly.** (a) ADR-033's benefit is narrower than its headline: it makes no single-instance guarantee, and its own matrix shows duplicates persist for every mixed old/new population — every existing consumer until they upgrade; rejecting it in favour of consumer-side detection is a credible position. (b) The controls in this package are largely manual or unbuilt; the only technical gate proposed is ADR-035, which covers declaration references, not duplicate installs and not the packed artifact. (c) ADR-036 governs no existing consumer. (d) Revision 1 of this package made two recommendations that independent review showed wrong (Option 2 default; "unreproducible baseline") — both are corrected above.

## 8. Discrepancies between earlier reports and current state

| Earlier statement | Current evidence |
|---|---|
| `community` on `feature/acl-casl-fields` at `0e2bb15`, behind `origin/main` (ADR-033, roadmap §1) | `feature/commerce` at `91f5de1`; `origin/main` (`3391f94`) is an **ancestor** — the checkout is *ahead* by one docs commit. Counts unchanged. **Revision 1 concluded "branch from `origin/main` remains correct practice"; that was wrong** (it would omit `91f5de1`); the instruction in ADR-033 step 1 and WP-A1 is stale (IR-10). |
| Commerce HEAD `40c187e` with uncommitted edits and an untracked policy document (roadmap §9); "Relative to HEAD the Phase A status is changed" | Commerce `main` at `6c01ab6`, clean, policy committed; the Phase A status change is now *in* HEAD, so §9's sentence has inverted (IR-10). |
| "F-01/F-02" (earlier reports) | Labels do not appear in any repository document. F-02 is treated in §9. |
| `validate` has no ADR-008 engine | Confirmed; stale ignored `dist/engines/core-register.*` has no source or history; ADR-008 registered edges are not wired into the validator even in-repo. |

## 9. Historical provenance limitations (F-02 / IR-11)

**F-02 is not resolved, and this package does not claim it is.** A clean Commerce working tree is not evidence of provenance; it
shows that the working-tree state was committed, not who or which pass produced each change.

**Independently verifiable from Git [FACT, re-checked]:**
- Commerce `6c01ab6` (Filippo Bovo, 2026-11-04 11:21:03 +0100) is a **single commit** of exactly six files: `07-package-architecture.md` (+7), `12-implementation-roadmap.md`, `README.md`, `architecture-freeze-assessment.md`, `final-freeze-report.md`, and the new `docs/governance/package-dependency-policy.md` (+176). `git log --all` for the policy file returns only `6c01ab6`. Parent is `40c187e`.
- The `12-implementation-roadmap.md` change in that commit is the Phase A status change from `READY TO START` to `DESIGN READY — IMPLEMENTATION AUTHORIZATION PENDING`.
- Development `a208100` (Filippo Bovo, 11:20:41, nineteen seconds earlier) is a **single commit of eleven files** — ADR-029, 030, 031, 032, 033, 034, 035, 036, `release-review.md`, the roadmap and the validator design document — under the message `feat: add ADR-035 for published declaration dependency validation`. Four of those files (ADR-029…032) are unrelated to the dependency policy; the message names only ADR-035.

**Documented assertions that Git cannot corroborate:** roadmap §9's distinction between the dependency-remediation task's own Commerce edits (the cross-references) and the freeze record's pre-existing "Correction 2026-11-04" (the Phase A status changes). It survives as **prose only**.

**No longer establishable by any available means:**
- Which pass, session or author produced each hunk inside `6c01ab6` or `a208100`.
- Whether the Phase A status correction predated the dependency-policy task or was made during it (Git records commit time, not edit time; all six files share one timestamp).
- The sequence of edits in the working-tree window before the commits.
- Whether roadmap §9's attribution is accurate.

**Why the clean working tree cannot repair this:** the pre-commit distinctions (modification times, hunk grouping against `40c187e` in the working tree) existed only until the files were committed together; committing flattened them into atomic changes, so the evidence gap is now permanent, not merely unresolved. Roadmap §9 says the author/pass "cannot be reconstructed from the working tree alone", which wrongly suggests another source exists; none does. It also does not note the Development-side commit.

**Effect on decisions:** none identified. The Phase A authorisation gate (ADR-032 `Proposed`, Order design `Draft`, Community sign-off) is verifiable from the documents' own current text and does not depend on who made the edit. Provenance affects only *auditability of this documentation work*. This package does not speculate about authorship or intent and does not reconstruct missing history. Recommended (separately authorised, not done here): add a provenance note to roadmap §9 and restate it relative to `40c187e`. **[Since done: roadmap §9 was rewritten on 2026-11-04 to separate verifiable facts, partially reconstructable information and no-longer-verifiable provenance. The limitation itself is unchanged and permanent; no history was reconstructed.]**

## 10. Finding register — all 16 independent findings

**Blocked circulation (resolved in this revision):** IR-01, IR-02 → Decision B (§4). **Corrected as documentation (this revision):** IR-11 → §9; IR-13 → ADR-035 brief.

| ID | Sev | Status here | Where / condition |
|---|---|---|---|
| IR-01 | P1 | **Addressed** | Decision B §4B.1–5; revision-1 claim withdrawn |
| IR-02 | P1 | **Addressed** | Decision B §4B.4; §3 (033↔036) |
| IR-03 | P2 | Open — implementation (WP-B) | ADR-034 brief; `queue-pg-boss` 53/54; ADR-022 "47" |
| IR-04 | P2 | Open — implementation (WP-B) | ADR-034 brief; `runtime-support.md` §2/§3 |
| IR-05 | P2 | Open — implementation | ADR-036 brief; §3; §6 |
| IR-06 | P2 | Open — implementation | ADR-035 brief; Commerce namespace filtering |
| IR-07 | P2 | Open — implementation | ADR-035 brief; published-artifact validation |
| IR-08 | P2 | Open — implementation | Decision D; exit-code reporting |
| IR-09 | P2 | Open — implementation | ADR-036 brief; Decision E; repository ownership |
| IR-10 | P2 | Open — before WP-A1 | Stale HEAD/branch references; §8; ADR-033 amendments |
| IR-11 | P2 | **Disclosed, not resolved** | §9 |
| IR-12 | P3 | Recorded here; ADR-033/roadmap list still to add | Decision B §4B.1 (16 packages) |
| IR-13 | P3 | **Corrected** | ADR-035 brief (rationale replaced) |
| IR-14 | P3 | Open — test design (WP-C1) | ADR-035 brief amendment (4) |
| IR-15 | P3 | Open — documentation | ADR-034 brief amendment (3) |
| IR-16 | P3 | Open — before steady-state adoption | Decision F |

Further independent-review items carried as conditions: trigger-tiered release review and its sub-amendments (evidence script, decoupled effective date, §3.2.1 as judgment, observed publication order in §3.5.1) — Decision F; WP-D1 freeze change control and roadmap §5.2 cross-reference — §6; `pnpm.overrides` alternatives row and strict-peer version pinning — ADR-036 brief. None is fixed by this package.
