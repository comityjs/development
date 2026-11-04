# Independent Adversarial Review — Comity Dependency Policy Maintainer Package

> **Nature:** independent review of `docs/standards/reviews/dependency-policy-maintainer-review.md` and the proposals it
> presents. It accepts, rejects and amends nothing. ADR-032, ADR-033, ADR-034, ADR-035, ADR-036, `release-review.md`, the
> validator design document, the remediation roadmap and every Commerce document remain exactly as they were.
> **Reviewer role:** independent principal architect / technical governance reviewer. **Date:** 2026-11-04.
> **Method:** every material claim in the review package was re-derived from repository evidence or reproduced by
> experiment. Nothing was accepted on the authority of the package under review.
> **Write scope:** this file only. No repository file, manifest, lockfile, source, test, CI or Changesets artefact was
> modified, staged or committed. All experiments ran in `/tmp` (`/tmp/cs-exp`, `/tmp/esm-exp`, `/tmp/declcount.mjs`).

Labels: **[VERIFIED]** independently reproduced by this review · **[CONFIRMED]** the package's claim matches repository
evidence · **[CONTRADICTED]** the package's claim does not match evidence · **[UNPROVABLE]** evidence is insufficient ·
**[REC]** this review's recommendation.

---

## 1. Executive verdict

**The maintainer package is substantially sound and fit to circulate after two one-paragraph corrections.** It is not
rubber-stampable, and it is not defective either.

The package's factual core survives adversarial testing unusually well. I independently reproduced **every** quantitative
claim I could test: 54 packages; 94 sibling `dependencies` + 26 `peerDependencies` = 120 `workspace:*` references in 50
packages; 2 sibling `devDependencies` in `cli-commander`; 19 peer-declaring packages; `fixed: []`, `linked: []`,
`updateInternalDependencies: "patch"`; 123 `exports[*].import` entries; 7 `@comity-dev/*` workspace references in `cli`
and `validate`; the 4 packages with no sibling edges. I confirmed the peer-major cascade in the pinned
`@changesets/assemble-release-plan@6.0.10` source **and** by running it. I reproduced ADR-034's seven runtime behaviours
on Node 24.19.0, including the exact `ReferenceError: exports is not defined in ES module scope` and the two-class
failure of the alternative it rejects. I reproduced ADR-035's entire baseline (54 / 537 / 443 / 0 / 0) from committed
build output.

**Two findings block circulation**, both in Decision B, and both are cheap to fix:

1. **IR-01 (P1).** The recommended split-release procedure is **not executable through the documented release path**. I
   ran the dry run the package says was never run. The *outcome* Option 2 promises is achievable — but only via
   `changeset version --ignore <pkg>…`, which cannot be reached through `changesets/action` without changing
   `community/package.json`'s `"version": "changeset version"` script or bypassing the action. The package recommends
   Option 2 **and** asserts "no Changesets configuration change". Those are not jointly satisfiable as written.
2. **IR-02 (P1).** The stated cost of Option 2 — "unmet peers warn only" — **materially understates a compatibility
   hazard that contradicts ADR-036.** After a split, the registry holds a peered package at a new 0.x minor beside
   adapters whose published peer range excludes it; consumers install them together with a warning and run untested
   combinations. ADR-036's own Context lists precisely that condition ("warns only … the package then runs against the
   wrong version") as a *verified defect*. Meanwhile the workspace resolves `workspace:^` to the **new** version, so CI
   tests a graph the registry does not publish. Maintainers are being asked to choose between options on inaccurate cost
   information.

**Three material disagreements** with the package, none of which reverses an ADR direction:

- **ADR-034 — I recommend *accept with amendments*, not *accept*.** Two unaddressed gaps: `@comity/queue-pg-boss` falsifies
  the ADR's "every published package ships two builds / every export map routes `require`" premise (it has no `require`
  condition and no `main`), and the amendment scope covers only `runtime-support.md` §1 while §2/§3 of that **normative**
  document affirmatively claim Edge/Workers and browser surfaces whose bundler resolution this change alters.
- **ADR-035 — the package's principal amendment rests on a false premise.** Its dissent item 4 says the zero-finding
  baseline is "an unreproducible number". It is not: all three figures and the zero-findings result reproduce today from
  committed build output. The amendments ADR-035 actually needs are different ones the package missed (IR-05, IR-06,
  IR-07, IR-08).
- **ADR-036 §4 step 4 is not satisfiable by the ADR-035 engine as designed.** The step must run in "a fresh consumer
  directory outside the workspace"; `discover.ts` requires a `comity.config.json` and skips any package not named
  `@comity/*` or `@comity-dev/*`. In a clean-consumer tree it discovers zero packages and returns 0 findings, PASS.

**F-02 is not resolved.** A clean Commerce working tree is not evidence of provenance — it is evidence that provenance was
flattened. All six files were committed together in `6c01ab6` at 11:21:03, and the Development commit `a208100` bundles
eleven files under a message naming only ADR-035. The distinction roadmap §9 draws between the dependency-policy task's
own edits and the freeze record's pre-existing correction is **now unrecoverable from git** and survives only as prose.
§9 does not say so, and its "working tree vs HEAD `40c187e`" framing is stale.

**On the governance question the package asks (Decision F):** mandatory for every `Version Packages` PR is
disproportionate as drafted. **[REC] mandatory but trigger-tiered** (§8).

No finding reaches P0. Nothing in the package claims technical enforcement that does not exist — its discipline on that
point is genuinely good and I confirmed it against source.

---

## 2. Review scope and verified repository state

### 2.1 Repository state at the time of this review (2026-11-04)

There is no git repository at `/Users/filippo/Projects/comity`; the three directories are independent repositories.

| Repository | Branch | HEAD | HEAD subject | Working tree |
|---|---|---|---|---|
| `community` | `feature/commerce` | `91f5de18307f445d95d1fb8f0c6dc8867b32cd6e` | `feat(order): add design document for Commerce Extension Phase A` (2026-11-04 11:22:32 +0100) | **clean** |
| `development` | `feature/commerce` | `a208100cf89995d56e46bf2cc4bb38bffdb85ec1` | `feat: add ADR-035 for published declaration dependency validation` (2026-11-04 11:20:41 +0100) | `?? docs/standards/reviews/` (untracked) |
| `commerce` | `main` | `6c01ab6365bd4a9d86cb964c3094401c0870f402` | `Update architecture documents for Phase A readiness and dependency policy clarification` (2026-11-04 11:21:03 +0100) | **clean** |

`community`: `origin/main` = `3391f94` and **is an ancestor of HEAD** — the checkout is *ahead* by one commit
(`packages/order/docs/design.md`, +142 lines, documentation only). `0e2bb15` exists and is an ancestor.
`commerce`: `40c187e` ("architecture freeze") exists and is the parent of HEAD.

### 2.2 State has changed since the review package was created — and the package noticed

The package's §0 evidence baseline is **accurate for the current tree**, and its §8 correctly records the drift from
earlier reports. This is worth stating plainly because it is the opposite of what one expects from a package written
against a moving tree: the three commits above landed at 11:20–11:22, the package was written at 11:31, and it reports
the post-commit state rather than the pre-commit state.

What the package did **not** notice is that the drift inverted two normative statements inside the documents under review
(IR-10), and that committing the Commerce changes destroyed the last recoverable provenance evidence (IR-11).

### 2.3 Documents reviewed (all committed unless noted)

| Document | Path | Status |
|---|---|---|
| Primary review package | `development/docs/standards/reviews/dependency-policy-maintainer-review.md` | untracked (25,219 bytes) |
| ADR-033 | `development/docs/standards/decisions/ADR-033-sibling-dependency-publication-and-version-ranges.md` | Proposed |
| ADR-034 | `development/docs/standards/decisions/ADR-034-esm-only-distribution-and-node-require.md` | Proposed |
| ADR-035 | `development/docs/standards/decisions/ADR-035-published-declaration-dependency-validation.md` | Proposed |
| ADR-036 | `development/docs/standards/decisions/ADR-036-cross-repository-comity-dependency-policy.md` | Proposed |
| ADR-032 (context only) | `development/docs/standards/decisions/ADR-032-order-aggregate-commerce-extension.md` | **Proposed** (line 8) |
| Release review standard | `development/docs/standards/release-review.md` | Proposed |
| Engine design | `development/packages/validate/docs/declaration-dependencies-design.md` | Draft — pending review |
| Roadmap | `development/docs/architecture/dependency-remediation-roadmap.md` | Proposed planning |
| Commerce policy | `commerce/docs/governance/package-dependency-policy.md` | Proposed |
| Order design (context only) | `community/packages/order/docs/design.md` | **Draft — pending review** |

### 2.4 Implementation and repository evidence inspected

`community`: all 54 `packages/*/package.json`; `.changeset/config.json`; `.changeset/` contents (only `config.json` — no
pending changesets); `.github/workflows/release.yml`; root `package.json` scripts; `tsconfig.json`;
`packages/{primitives,cache-redis,queue-pg-boss,cli-commander}/package.json`; `packages/*/dist/types/**` (537 files, all
dated 2026-10-31); `node_modules/.pnpm/@changesets+{assemble-release-plan@6.0.10, apply-release-plan@7.1.1,
config@3.1.4, cli@2.31.1}/**`.

`development`: `packages/validate/src/{run,discover,format,exit-codes}.ts`, `src/bin/comity-validate.ts`,
`src/engines/{adapter-peers,depcruise,eslint,schema,semgrep,types}.ts`, `packages/validate/package.json`,
`packages/validate/dist/engines/`, `packages/build/src/bin/comity-build.ts`,
`packages/schemas/src/schemas/{package-metadata,adr-008-register}.ts`, `packages/dependency-rules/src/*`,
`docs/standards/{runtime-support,adapters}.md`, `docs/architecture/repository-ownership.md`, ADR-022.

`commerce`: `docs/governance/package-dependency-policy.md`; full `git log`; `git show HEAD` (diff and stat).

### 2.5 Experiments performed (all outside the repositories)

| ID | Experiment | Purpose |
|---|---|---|
| **T1** | Synthetic workspace, community's exact Changesets config, `workspace:^`, changeset `base: patch` | Does a sibling patch re-release dependents? |
| **T2** | Same, changeset `base: minor` | Does the peer-major cascade fire? |
| **T3** | Same but `workspace:*`, changeset `base: patch` | Does today's protocol cascade on patch? |
| **T4** | `workspace:^`, `base: minor`, then manual reversion of dependents | Is a manual split mechanically possible? |
| **T5** | `workspace:^`, `changeset version --ignore <dependents>`, then a second release | Is a tool-supported split possible without a config change? |
| **E1** | Node 24.19.0 fixtures reproducing today's layout, ADR-034's proposal, the rejected nested-marker alternative, and a top-level-await graph | ADR-034's seven runtime claims |
| **E2** | Read-only scan of `community/packages/*/dist/types/**` | ADR-035's 54 / 537 / 443 / 0 / 0 baseline |

---

## 3. Findings, ordered by severity

Severity is applied sparingly. **P0** would mean a recommendation that causes harm if acted on as written; there is no
P0. **P1** means a maintainer would decide on materially wrong information, or a recommended procedure cannot be executed
as described. **P2** means a defect that must be corrected before implementation but not before circulation. **P3** means
accuracy or clarity.

| ID | Sev | Finding | Blocks |
|---|---|---|---|
| IR-01 | **P1** | Recommended split-release is not executable through the documented release path | **Circulation** |
| IR-02 | **P1** | Split-release cost understated; contradicts ADR-036's own defect list | **Circulation** |
| IR-03 | P2 | ADR-034's "every package" premise is false for `@comity/queue-pg-boss` | Implementation |
| IR-04 | P2 | ADR-034's amendment scope omits the normative Edge/Workers/browser claims | Implementation |
| IR-05 | P2 | ADR-036 §4 step 4 is not satisfiable by the ADR-035 engine as designed | Implementation |
| IR-06 | P2 | ADR-035's `@comity/*` discovery filter fails silently for an undecided Commerce namespace | Implementation |
| IR-07 | P2 | ADR-035 validates the built artifact, not the published artifact | Implementation |
| IR-08 | P2 | Configuration-error precedence suppresses findings without `--verbose` | Implementation |
| IR-09 | P2 | ADR-036's cited ownership authority does not cover Commerce | Implementation |
| IR-10 | P2 | Roadmap §9 / §1 and ADR-033 step 1 are stale; one instruction is now actively wrong | Implementation |
| IR-11 | P2 | F-02 provenance is unrecoverable from git and this is not documented | Documentation |
| IR-12 | P3 | Cascade exposure is 16 peered packages, not the 7 illustrated | Documentation |
| IR-13 | P3 | The package's "unreproducible baseline" dissent is materially overstated | Documentation |
| IR-14 | P3 | The 443 baseline does not discriminate the reachability filter | Implementation |
| IR-15 | P3 | ADR-034 frames `require(esm)` as Node-24-specific | Documentation |
| IR-16 | P3 | `release-review.md` has zero dry-run history | Documentation |

### IR-01 (P1) — The recommended split-release procedure is not executable through the documented release path

**Evidence.**

1. **[VERIFIED — T2]** A changeset naming *only* the peered package as `minor` automatically adds every peer dependent to
   the **same** release plan as `1.0.0`: `base` 0.9.1 → 0.10.0, `adapter` 0.9.1 → **1.0.0**, `plain` → 0.9.2,
   `app` → 0.9.2. The bump is computed by `determineDependents()` from the dependency graph, not from what the changeset
   lists. There is no "release only these packages" input.
2. **[VERIFIED — source]** `@changesets/assemble-release-plan@6.0.10` lines 337–345 (`shouldBumpMajor`):
   `depType === "peerDependencies" && nextRelease.type !== "none" && nextRelease.type !== "patch" &&
   (!onlyUpdatePeerDependentsWhenOutOfRange || !semverSatisfies(...))`. With `@changesets/config@3.1.4` defaults and
   community's config (no `___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH` block),
   `onlyUpdatePeerDependentsWhenOutOfRange` is `false` and `updateInternalDependents` is `"out-of-range"` (config source
   lines 355–356). **The package's reading of this is exactly right.**
3. **[VERIFIED — T5]** The mechanism that *does* achieve a split is `changeset version --ignore <pkg>…`: `base` → 0.10.0
   **alone**; `adapter`, `plain`, `app` all stay 0.9.1. The second release (changeset `adapter: patch`) then yields
   `adapter` → **0.9.2**, not `1.0.0`, with ranges publishing as `^0.10.0`. **The outcome Option 2 promises is real.**
4. **[VERIFIED — source]** `@changesets/cli@2.31.1` line 1523 rejects `--ignore` only when `config.ignore.length > 0`.
   Community's config has `"ignore": []`, so the flag is usable. Line 1562 requires that no non-skipped package depend on
   a skipped one; ignoring dependents rather than the base satisfies this.
5. **[VERIFIED]** `community/package.json` has `"version": "changeset version"`; `.github/workflows/release.yml` wires
   `changesets/action@v1` with `version: pnpm run version`. **The action invokes a fixed script with no `--ignore`.**
6. **[VERIFIED — T4]** Manual reversion of the generated release branch works mechanically, but `release-review.md` §5
   states "Manual edits to the generated release branch are discouraged; the action regenerates it."

**Why it matters.** Decision B reads "**[REC] Option 2 as the default procedure … no Changesets configuration change.**"
Maintainers will read that as "current tooling already supports this". It does not. Executing a split requires changing
the `version` script per release, or bypassing `changesets/action`, or hand-editing the generated branch.
`release-review.md` §5.3 says "A change to Changesets behaviour is **never** made inside a release PR", and ADR-033
Decision 8 says "This ADR does not change Changesets configuration or add automation". A procedure needing a per-release
script or workflow deviation is neither.

**Recommended correction.** Amend Decision B and ADR-033 to name the mechanism and its cost: *"Option 2 requires
`changeset version --ignore <dependent packages>`. Because `changesets/action` invokes the fixed `pnpm run version`
script, a split additionally requires a dedicated `version:split` script or a manual run outside the action. This is a
release-process change and must be authorised as one."* Retain the dry-run caveat, and record that **this review
performed it** (T5): the open question is no longer whether the outcome is achievable but whether the process change is
acceptable.

**Blocks:** maintainer circulation. Decision B is an explicit maintainer checkbox and the option cannot be executed as
described. The fix is one paragraph.

### IR-02 (P1) — The split-release cost is understated and contradicts ADR-036's own defect list

**Evidence.**

1. **[VERIFIED — T5, published-state simulation]** After release 1 the registry holds `base@0.10.0` alongside
   `adapter@0.9.1` whose published peer range is `^0.9.1` (`>=0.9.1 <0.10.0`). A consumer installing both receives an
   **unmet peer** — a warning only — and the adapter executes against `base@0.10.0`.
2. **[CONFIRMED]** Under 0.x semver a minor is *expected* to be able to break. ADR-033 line 50 says so itself: "Under 0.x,
   `^0.9.1` means `>=0.9.1 <0.10.0`: patch drift is allowed; a sibling minor is a range break."
3. **[CONTRADICTED]** ADR-036 Context records as *verified fact*: "an unmet or out-of-range peer **warns only**
   (`strict-peer-dependencies` is off by default) **and the package then runs against the wrong version**." Its
   Consequences repeat: "Peers and carets do not guarantee a single instance; only the verification detects violations."
   Decision B's cost cell reduces all of this to "unmet peers warn only".
4. **[VERIFIED — new; not in the package]** In the split state the *workspace* resolves `workspace:^` to the **new**
   version, so local CI builds and tests `adapter` against `base@0.10.0` while the registry says the shipped
   `adapter@0.9.1` supports `^0.9.1`. **What is tested and what is published diverge** — the exact defect class the
   package's own §1 names: "*the published dependency graph is not what the design assumes*".

**Why it matters.** Option 2 trades a cosmetically meaningless `1.0.0` for a real, silent, under-tested compatibility
window in published Comity packages. That may still be the right trade — a meaningless major has genuine costs too — but
it is a *different* trade than the one presented. Maintainers are told Option 2's downside is a warning message; in fact
its downside is that Comity knowingly publishes a graph in which an adapter can be installed against a Comity minor it
was never released or tested against, with no error. Framing that as "warn only" also puts Decision B in direct tension
with ADR-036, which the same package asks maintainers to accept.

**Recommended correction.** Replace the Option 2 cost cell with: *"For one release window the registry carries adapters
whose published peer range excludes the newly released peered version. Consumers installing both get an unmet peer
(warning only) and run an untested combination — the condition ADR-036 identifies as a defect. Additionally the workspace
resolves `workspace:^` to the new version, so CI tests a graph the registry does not publish. Mitigations: keep the window
short, sequence release 2 immediately, and state the window in both sets of release notes."* Add the tested-vs-published
divergence to ADR-033's Consequences and to `release-review.md` §3.5 so the reviewer must record the window.

**Blocks:** maintainer circulation, for the same reason as IR-01.

### IR-03 (P2) — ADR-034's "every package" premise is false for `@comity/queue-pg-boss`

**Evidence.** **[VERIFIED]** `community/packages/queue-pg-boss/package.json` has **no `require` condition and no `main`
field**; `exports["."]` contains only `import`. Across all 54 manifests, **53** reference `dist/cjs`; `queue-pg-boss` is
the sole exception. `packages/schemas/src/schemas/package-metadata.ts` line 33 requires only
`["name", "version", "type", "license", "engines", "exports"]` — **no `main`, no `require`** — so the exception is
schema-legal, not an oversight the validator would catch.

This contradicts ADR-034 Context: "**Every** published `@comity/*` package … ships two builds" and "**Every** export map
routes the `require` condition to those files", and its migration step "rewrite `require.default` and `main` in each
package". It also makes ADR-022's quoted figure stale: ADR-022 line 72 says "The existing **47** packages' dual ESM/CJS
distribution (`exports.require`) remains unaffected" — there are 54 today, and the property was never universal.

**Why it matters.** WP-B's worklist is derived from "every package". One package needs a different decision — gain a
`require` condition, or remain `import`-only and be documented as such. If the migration applies the ADR literally it will
either skip `queue-pg-boss` silently or add a `require` condition to a package that deliberately lacks one, changing its
published surface under a **patch** bump. `queue-pg-boss` is also at 0.10.0 while most packages are at 0.9.1, so it is
already an outlier.

**Recommended correction.** Amend ADR-034 Context to "53 of 54 published packages route `require` to `dist/cjs`;
`@comity/queue-pg-boss` declares no `require` condition and no `main`, and `package-metadata.ts` does not require
either." Add a migration decision for packages with no `require` condition, and correct the ADR-022 "47 packages"
cross-reference when the "Amended by ADR-034" pointer is added.

**Blocks:** implementation (WP-B), not circulation.

### IR-04 (P2) — ADR-034's amendment scope omits the normative Edge/Workers and browser claims

**Evidence.** **[VERIFIED]** `development/docs/standards/runtime-support.md` states it "is **normative** for publishing
and runtime-compatibility claims. No package may claim a runtime it does not actually support." §2 claims "Packages are
supported on Edge / Workers runtimes where the implementation uses WinterCG / Web APIs"; §3 names browser/client-only
surfaces (`@comity/hydration/client`, `@comity/hydration-preact`, `@comity/hydration-react`). Those surfaces reach
browsers through **bundlers**.

ADR-034 Limitations states bundlers, Deno, Bun and Workers were "**not** tested for the `require` condition" and warns
"A bundler that previously parsed `dist/cjs` by syntax may have worked unobserved; after this change it receives the ESM
build." Its Dependencies section requires "an update to `runtime-support.md` **§1**" only, and roadmap §6 likewise lists
only §1.

**Why it matters.** ADR-034 removes `dist/cjs` and repoints `main` from the CJS-syntax entry to the ESM entry. Any
resolver that respects `main` rather than `exports` — older bundler configurations, `moduleResolution: node10`, some
Workers build paths — changes what it receives for the very surfaces §2/§3 affirmatively claim. The ADR simultaneously
(a) admits bundlers are unverified and (b) scopes its documentation amendment to the Node section. The result is a
normative document that keeps an unqualified Edge/Workers/browser claim after a change its own author did not verify
against those runtimes. This is not a hypothetical: ADR-034 itself raises the possibility that a bundler "may have worked
unobserved".

**Recommended correction.** Either (a) extend ADR-034 validation requirement 6 from "optional" to a required bundler smoke
build covering at least one §3 browser surface, recording the result; or (b) scope §2/§3 of `runtime-support.md`
explicitly to the `import` condition and add a sentence stating that the `require`/`main` path is unverified outside Node.
Add §2 and §3 to the roadmap §6 correction table. Option (b) is cheaper and sufficient; doing neither is not.

**Blocks:** implementation (WP-B), not circulation.

### IR-05 (P2) — ADR-036 §4 step 4 is not satisfiable by the ADR-035 engine as designed

**Evidence.** **[CONFIRMED]** ADR-036 §4 requires the clean-consumer verification to install "the **tarballs** in a fresh
consumer directory (**outside the workspace**)", and step 4 is "verify that all external declaration references resolve
(the ADR-035 engine, or its equivalent while unavailable)".

**[VERIFIED]** `development/packages/validate/src/discover.ts`:
- line 56–67: reads `comity.config.json`, silently falling back to `{ packages: { roots: ["packages"] } }`;
- lines 107–108: **skips any package whose name does not start with `@comity/` or `@comity-dev/`**.

A fresh consumer directory contains installed tarballs under `node_modules`, no `packages/` source root and no
`comity.config.json`. `discoverRepository` therefore returns zero packages; the declarations engine would return
`executed: true`, 0 findings, **PASS**. The design document §2 confirms the engine "deliberately skips packages not named
`@comity/*` or `@comity-dev/*` (as `discover.ts` does today)" and §1 confirms it does **not** "check file lists or
tarballs".

The package's §3 interaction table asserts "036's declaration check is 035's engine 'or its equivalent while
unavailable'" and concludes "036 can be accepted without 035 implemented" — without testing whether the engine can run
where ADR-036 puts it.

**Why it matters.** ADR-036 Validation requirement 1 makes the verification "an executable CI job in each consuming
repository before its first publication". If step 4 silently passes on an empty discovery, the job reports green while
performing no declaration check at all. That is the worst failure mode available: a governance gate that looks enforced
and is not. It also means ADR-036's dependency on ADR-035 is not the soft "or its equivalent" relationship the package
describes — the two ADRs specify incompatible execution contexts.

**Recommended correction.** Amend ADR-036 §4 step 4 to state **where** the declaration check runs: in the *source*
repository against the built package (as ADR-035 specifies), with the clean-consumer job relying on step 3
(`skipLibCheck: false` compilation of the installed tarballs) for the published-surface check. Alternatively require the
equivalent script to accept an arbitrary package directory. Additionally require the engine to fail loudly when a
repository yields zero discovered packages (see IR-06).

**Blocks:** implementation, not circulation.

### IR-06 (P2) — ADR-035's discovery filter fails silently for an undecided Commerce namespace

**Evidence.** **[VERIFIED]** `discover.ts` lines 107–108 skip packages not named `@comity/*` or `@comity-dev/*`; there is
no diagnostic when the result is empty, and `run.ts` would report the category as executed with 0 findings — a **PASS**.

**[CONFIRMED]** ADR-035 Decision 8 justifies placement in the shared validator "because the rule is repository-agnostic
and **Commerce packages need the same check**". Commerce policy §1 marks the namespace **[OPEN]**: "Whether the definitive
namespace is `@comity/commerce-*` (open governance decision #2 in the freeze record) is not decided here". ADR-036
Context names "comity-enterprise" as a future consumer as well.

`@comity/commerce-*` matches the `@comity/` prefix and would work. **Any other namespace would not**, and the engine would
report zero findings and pass with no indication that it inspected nothing.

**Why it matters.** The ADR's stated justification for its placement is Commerce coverage, yet that coverage is
conditional on a governance decision that is explicitly open, and the failure mode is silent. A green validation run that
checked nothing is worse than no validation, because it produces the enforcement illusion the package elsewhere takes care
to avoid.

**Recommended correction.** Two amendments. (1) In ADR-035 or the design document, require that a run over a repository
yielding **zero** discovered packages be reported as `NOT-APPLICABLE` with a `reason` naming the filter, never as a silent
PASS. (2) Record the namespace dependency: ADR-035's Commerce coverage holds only while Commerce package names match
`@comity/*`; if freeze decision #2 selects another namespace, `discover.ts` must be widened as part of WP-D1.

**Blocks:** implementation, not circulation.

### IR-07 (P2) — ADR-035 validates the built artifact, not the published artifact

**Evidence.** **[CONFIRMED]** ADR-035 Decision 2: "it runs **after the build**. It consumes `dist/types` as emitted …
Packed-tarball verification (file lists, clean-consumer compilation) remains a separate, heavier check … and is **not**
performed by this engine." Design §11 open item 3 defers "whether a later rule should verify that every reachable
declaration file is included by the package's `files` field (not part of ADR-035)". Community manifests declare
`"files": ["./dist", "!./dist/**/*.map"]`.

The ADR is nonetheless titled "**Published** Declaration Dependency Validation", and the package's §2 brief gives the
rationale as "The **published artifact**, not source imports, is what consumers compile".

**Why it matters.** Precisely stated, the engine validates the **pre-pack build output**. A declaration that exists in
`dist/types` but is excluded from the tarball by `files`, or an `exports`/`typesVersions` target present in the workspace
but not shipped, is not detected. The distinction is small today (`./dist` is included wholesale) but it is the difference
between "the graph consumers compile is sound" and "the graph the build produced is sound" — and the ADR's title claims
the former. This also settles the question the review brief raises about the clean-consumer test: it is **complementary,
not redundant**, because it is the only check that sees the packed surface.

**Recommended correction.** Either retitle the ADR ("Built Declaration Dependency Validation") or add one sentence to
Decision 2: "The engine validates the build output, not the packed tarball; the `files` field is not checked, so the
packed-surface guarantee is provided by the clean-consumer verification (ADR-036), not here." Correct the package's §2
rationale wording to match. Resolve design open item 3 as "deferred, owned by ADR-036 step 3".

**Blocks:** implementation, not circulation.

### IR-08 (P2) — Configuration-error precedence suppresses findings without `--verbose`

**Evidence.** **[CONFIRMED]** `development/packages/validate/src/run.ts`, `exitCodeForResult`: when the run did not pass,
it returns `ExitCode.CONFIG_ERROR` (2) if **any** category status is `CONFIGURATION-ERROR`, otherwise `ExitCode.FAIL` (1).
So a declarations FAIL with findings, plus an unrelated missing build anywhere in the run, exits **2** — not 1.
`exit-codes.ts` documents 2 as "configuration / discovery error (**cannot run**)".

**[VERIFIED — new; not in the package]** `src/bin/comity-validate.ts` line 100:
`if (!result.passed && args.verbose) { console.log(formatViolations(result.violations)); }` — **violations are printed only
with `--verbose`**. `formatSummary` is always printed and carries per-category finding counts, so the information is not
entirely absent, but the individual findings are.

**Why it matters.** The package labels this precedence "Acceptable (cannot-run outranks failed), but maintainers should
know it." The precedence itself is defensible. What the package missed is the operational combination: a run that **did**
find real violations exits with the code documented as "cannot run", and by default prints no violation detail. Exit 2 is
the natural signal for a retryable infrastructure failure, so CI retry logic keyed on it can mask genuine findings, and an
on-call engineer reading "configuration error" will look for a broken build rather than at a policy violation.

**Recommended correction.** Keep exit 2 (the precedence is right) but amend the design document §9 to require: (a) findings
are always printed when present, independent of `--verbose`; (b) `exit-codes.ts`'s comment for code 2 is amended to "may
co-occur with violations"; (c) design §10 adds an integration test asserting that a mixed run exits 2 **and** still
reports the declarations findings. This is a documentation-and-test amendment, not a behaviour change.

**Blocks:** implementation, not circulation.

### IR-09 (P2) — ADR-036's cited ownership authority does not cover Commerce

**Evidence.** **[VERIFIED]** `development/docs/architecture/repository-ownership.md` — cited in ADR-036 References — has an
Ownership Matrix with columns **only** for Development, Community and Enterprise. **Commerce appears nowhere in the
document.** The matrix assigns "Comity-wide standards" and "Comity-wide ADRs" to Development as **Owner** (Community and
Enterprise as Consumer), which *does* support ADR-036's choice of Comity-level ownership for the rule itself. It also
assigns "Runtime implementation (`@comity/*`)", "Community dependency graph" and "Community CI/release" to **Community**,
and "Enterprise CI/release" to **Enterprise**.

ADR-036 Decision 4 mandates a verification job in each consuming repository and Validation requirement 1 makes it a
publication precondition. Its rejection of "Define the policy only in the Commerce repository" argues that "the rules
concern published Comity contracts and identity, apply to any external consumer, and need Comity-level ownership" — an
argument about **where the rule is written**, not about **who may compel a repository Development does not own to operate
a CI job**.

**Why it matters.** Two distinct gaps. First, the cited authority does not cover the first named consumer, so a maintainer
checking the ownership basis for a Comity-wide Commerce policy finds nothing. Second, the ADR asserts a Comity-level rule
whose only enforcement artifact lives in repositories outside Development's ownership, without saying what makes it
binding. The package's §4E correctly reports "documentation only, no ADR-036 verification job exists in any repository" —
but it does not examine whether Development *could* own that enforcement under the current ownership model.

**Recommended correction.** Add to ADR-036 an enforcement-authority sentence: "This policy is a **publication
precondition** applied by Comity maintainers when reviewing a consuming repository's first publication. It does not
assert authority over another repository's CI configuration; each consuming repository owns how it satisfies the
requirement." Either extend `repository-ownership.md` to include Commerce (a separate, separately authorised change) or
remove it from ADR-036's References and cite the freeze record instead.

**Blocks:** implementation, not circulation.

### IR-10 (P2) — Roadmap §9 / §1 and ADR-033 step 1 are stale; one instruction is now actively wrong

**Evidence.** **[VERIFIED]**

1. Roadmap §9: "The Commerce working tree (**vs HEAD `40c187e`**) is described below as it actually is", and "**Relative to
   HEAD**, the Phase A authorisation status **is changed** (from `READY TO START` to `DESIGN READY — IMPLEMENTATION
   AUTHORIZATION PENDING`)". Commerce HEAD is now `6c01ab6`; `git show HEAD --stat` lists exactly the six files §9
   tabulates, including the Phase A status change in `12-implementation-roadmap.md`. The tree is clean. **The status change
   is now *in* HEAD**, so "relative to HEAD … is changed" has inverted.
2. Roadmap §1 line 24: "`community` is on `feature/acl-casl-fields` at `0e2bb15`, **behind `origin/main`** (`3391f94`)".
   Actual: `feature/commerce` at `91f5de1`, and `git merge-base --is-ancestor origin/main HEAD` succeeds — community is
   **ahead**, not behind.
3. ADR-033 migration step 1 and roadmap WP-A1: "Branch from `origin/main` (**the local checkout may be behind it**)".
   Following this literally today creates a branch that **omits** the committed `91f5de1`. Harmless for manifests (that
   commit adds only `packages/order/docs/design.md`), but the parenthetical justification is false and the instruction is
   now wrong.
4. ADR-033 line 15: "Verified on 2026-11-04 (local `community` at `0e2bb15`; `origin/main` at `3391f94` gives the same
   counts)". Both refs are now ancestors; the counts still hold (I re-derived them from the current tree).

**Why it matters.** The package's §8 catches items 2 and 4 as drift and concludes "'Branch from `origin/main`' remains
correct practice". That conclusion is wrong now that the local branch is ahead of `origin/main`. Items 1 and 3 are not
caught at all. These are committed documents that implementation tasks will be executed from; WP-A1's acceptance criterion
literally reads "Re-counted from `origin/main`".

**Recommended correction.** Update ADR-033 line 15 and migration step 1, and roadmap §1 line 24 and §9, to the current
state: community `feature/commerce` at `91f5de1`, ahead of `origin/main` `3391f94`; branch from the **current main**, not
`origin/main`; Commerce `main` at `6c01ab6`, tree clean, the six §9 files committed. Restate §9's Phase A sentence in
past tense relative to `40c187e` and add "now committed in `6c01ab6`".

**Blocks:** implementation (WP-A1 acceptance criteria), not circulation.

### IR-11 (P2) — F-02 provenance is unrecoverable from git, and that is not documented

Full analysis in §9. Summary: committing the Commerce changes in a single commit **destroyed** the last recoverable
evidence for the distinction roadmap §9 draws, and §9 does not say so. **Blocks:** documentation only.

### IR-12 (P3) — Cascade exposure is 16 peered packages, not the 7 illustrated

**Evidence.** **[VERIFIED]** Counting `peerDependencies` keys starting `@comity/` across all 54 manifests gives **16**
distinct peered Comity packages: `acl`, `auth`, `auth-tokens`, `cache`, `cli`, `composition`, `graphql-client`, `html`,
`http`, `hydration`, `i18n`, `primitives`, `queue`, `router`, `sql`, `validation`. ADR-033 line 82 illustrates with
"(for example `primitives`, `composition`, `http`, `sql`, `cache`, `queue`, `acl`)" — 7 of the 16, all genuinely in the
set, and the wording is explicitly illustrative, so this is **not an error**. The package's Decision B brief repeats
"26 peer references across 19 adapters are exposed", which I confirm exactly (26 references, 19 peer-declaring packages).

**Why it matters.** Decision B's scope is a minor of **any of 16** packages, not 7. Maintainers sizing the frequency of
the cascade — and therefore how often the split procedure of IR-01 would be needed — will under-estimate it by roughly
half if they read only the example list.

**Recommended correction.** Record the full list of 16 in ADR-033 or roadmap §7, alongside the existing 26/19 figures.

**Blocks:** nothing. Documentation accuracy.

### IR-13 (P3) — The package's "unreproducible baseline" dissent is materially overstated

**Evidence.** **[VERIFIED — E2]** A read-only scan of `community/packages/*/dist/types/**` reproduces ADR-035's entire
baseline from committed build output:

| ADR-035 Context claim | Independent result |
|---|---|
| 54 packages | **54** packages with `dist/types` |
| 537 `.d.ts` files | **537** (`find packages/*/dist/types -name '*.d.ts' \| wc -l`) |
| build dated 2026-10-31 | **537 of 537** files timestamped **2026-10-31** |
| 443 external module references | **443** reference occurrences |
| 0 undeclared, 0 dev-only | **0**, **0** |

Two further checks: `@comity/cache-redis` is the **only** package with `peerDependenciesMeta` (`redis`, `ioredis`, both
optional) and its `dist/types` contains **no** reference to either — so `ARCH-DECL-DEP-003` has **zero candidates**. No
package uses `optionalDependencies` or `bundledDependencies`, so design open item 1 is moot today.

The build is still representative: `git diff 3391f94 HEAD` in community shows only `packages/order/docs/design.md` (+142)
— no source or manifest change since 2026-10-31.

**Why it matters.** The package's §2 ADR-035 brief calls this a "**Weakness:** the zero-finding baseline came from a
read-only prototype that is **not in the repository** … maintainers are accepting the severity on a number they cannot
reproduce from the repo", and dissent item 4 repeats it. Its **[REC]** amendment (1) for ADR-035 is to "state that the
severity decision is conditional on the regression test reproducing zero findings on a **fresh** build" — grounded in that
claim. The claim is wrong for the counting baseline, which reproduces today with a ~30-line read-only script.

**Honest qualification of my own result.** My scan is a **textual superset**: it reads every `.d.ts`, not only the
entry-reachable set, and it does not implement self-reference or sibling-subpath checks. It therefore does **not**
exercise `ARCH-DECL-DEP-003/-004/-005`. The correct statement is "the counting baseline is reproducible; the full
rule-set result is not yet" — not "the number is unreproducible". See IR-14.

**Recommended correction.** Correct dissent item 4 and ADR-035 amendment (1). Keep the regression test as a gate — it is
cheap and it is the only thing that exercises `-003/-004/-005` — but justify it as *rule-set* coverage, not as the sole
basis for the severity decision. Maintainers should not be asked to defer a severity decision on an
"unreproducible-evidence" ground that does not hold.

**Blocks:** nothing. Documentation accuracy — but it changes one of the package's four ADR amendments.

### IR-14 (P3) — The 443 baseline does not discriminate the reachability filter

**Evidence.** **[VERIFIED]** ADR-035 Decision 4 states "**Public, not exhaustive:** only declarations reachable from an
export entry point count. Emitted-but-unreachable files are ignored", and design §4.2 specifies a breadth-first traversal
from entry points. My scan counted **all** 537 files and obtained **exactly 443** — the same figure the ADR attributes to
the prototype.

**Why it matters.** Two readings, and the ADR cannot distinguish them: either every emitted declaration is reachable from
an entry point (plausible for a repository built by one normalising tool), or the prototype did **not** implement the
reachability filter and counted all files. If the second, a WP-C1 regression test written as "assert 443 references, 0
findings" would pass with or without reachability implemented — the acceptance criterion would not test the property
Decision 4 declares. Design §10's positive list does include "an unreachable `.d.ts` importing an undeclared package",
which would catch it at unit level, so the risk is contained; but the repository-level regression number carries no
information either way.

**Recommended correction.** Have WP-C1's regression test assert the **reachable file count** separately from the total
emitted count, and record both. If they are equal, say so explicitly — that is itself a useful fact about the build.

**Blocks:** implementation (test design), not circulation.

### IR-15 (P3) — ADR-034 frames `require(esm)` as Node-24-specific

**Evidence.** **[CONFIRMED]** ADR-034 Runtime baseline: "Node 24 can load an ES module graph with `require()`
(`require(esm)`)", and Decision 3 sets the supported runtime at `>=24.0.0` "matching `engines`". `runtime-support.md` §1
and all 54 manifests declare `engines.node: ">=24.0.0"` — both verified.

`require(esm)` is not a Node 24 feature; it has been available unflagged in earlier majors. The binding constraint is
Comity's own `engines` floor, not a Node capability boundary at 24.

**Why it matters.** No defect in the decision — 24 is the supported floor either way. But the phrasing reads as if 24 were
the enabling version, which will propagate into the `runtime-support.md` §1 amendment the ADR requires and could mislead a
future maintainer who lowers the `engines` floor and assumes `require` breaks below 24.

**Recommended correction.** Word the §1 amendment as: "the supported range is Node ≥24 by `engines`; `require(esm)` is
available in earlier majors but Comity claims no runtime below its `engines` floor."

**Blocks:** nothing. Documentation accuracy.

### IR-16 (P3) — `release-review.md` has zero dry-run history

**Evidence.** **[VERIFIED]** `community/.changeset/` contains only `config.json` — no pending changesets. The most recent
`Version Packages` merge in community is `6ddd6a3` (2026-10-31); in development, `2673a13` (2026-10-23). The standard is
`Proposed` and "takes effect when ADR-033 is Accepted".

**Why it matters.** Directly relevant to Decision F (§8). A mandatory checklist with no dry-run history has unknown cost
and unknown false-alarm rate. The package's Decision F brief notes the §3.4 cost (pack and inspect 50 packages for WP-A2)
but has no evidence about routine releases, because no routine release has run under the checklist.

**Recommended correction.** Adopt the checklist for WP-A2 as a **piloted** gate, record the actual reviewer time and
false-alarm count in the WP-A2 PR, and set the steady-state tier from that evidence (§8).

**Blocks:** nothing. Documentation accuracy.

---

## 4. ADR-033 assessment

**[REC] Accept with amendments.** Same verdict as the package, but the amendments differ and one of the package's
supporting conclusions is wrong.

### 4.1 What I verified independently

| ADR-033 claim | Result |
|---|---|
| 120 `workspace:*` sibling refs = 94 `dependencies` + 26 `peerDependencies`, in 50 packages | **[VERIFIED]** exactly 94 + 26 = 120, in 50 of 54 |
| 26 peer entries in 19 Technology Adapters | **[VERIFIED]** 26 refs, 19 peer-declaring packages |
| 2 sibling `devDependencies` in `cli-commander` | **[VERIFIED]** `@comity/kernel`, `@comity/primitives` — the only two in the repository |
| No sibling reference uses another protocol form | **[VERIFIED]** all 122 workspace refs are `workspace:*` |
| Packages released independently (`fixed: []`, `linked: []`) | **[VERIFIED]** |
| Versions already diverge | **[VERIFIED]** 0.9.0 ×4, 0.9.1 ×45, 0.9.2 ×2, 0.10.0 ×3 |
| `adapters.md` §13 permits `workspace:*` and delegates conversion | **[VERIFIED]** line 331 |
| Peer-major cascade in `assemble-release-plan@6.0.10` | **[VERIFIED]** source lines 337–345 **and** T2 |
| A patch of the peered package does not trigger it | **[VERIFIED]** T1 |
| `workspace:^` dependents are not re-released on a sibling patch | **[VERIFIED]** T1 — `adapter`/`plain`/`app` all stay 0.9.1 |
| Today (`workspace:*`) a sibling patch **does** cascade | **[VERIFIED]** T3 — all three go to 0.9.2 |

The last two rows matter most: they confirm ADR-033's Consequences describe a **real behavioural change**, not a
hypothetical one. The mechanism is `getDependencyVersionRanges` (lines 292–325), which normalises `workspace:*` to the
*exact old version* (source comment: "workspace:* actually means the current exact version, and not a wildcard") and
`workspace:^` to `^<oldVersion>`; with `updateInternalDependents: "out-of-range"` (the default), a patch is in-range for
`^` and out-of-range for an exact version. **The case for `workspace:^` is technically established.**

### 4.2 Where I disagree with the package

- **Decision B (IR-01, IR-02).** Recommended Option 2 is not executable as described, and its cost is understated in a way
  that contradicts ADR-036. The package's caveat is honest — it says plainly that it did not run the split. I ran it: the
  outcome is achievable (T5) but only through a mechanism the recommendation excludes.
- **"Branch from `origin/main`" (IR-10).** The package concludes this "remains correct practice". It does not: community is
  now *ahead* of `origin/main`.
- **Cascade scope (IR-12).** 16 peered packages, not the 7 illustrated.

### 4.3 Alternatives the package omitted

1. **`workspace:^` for `dependencies` only, keeping `peerDependencies` at `workspace:*`.** This fixes the transitive-pin
   problem (the ADR's third reproduced graph) while leaving the peer-major cascade untouched, since `shouldBumpMajor`
   fires on any non-patch release regardless of range. It would deliver most of the benefit with **no** change to cascade
   behaviour — and therefore no need for Decision B at all. It is weaker (published peers stay exact, so consumer-side
   peers still cannot dedupe against an adapter), but it is a strictly smaller change and deserves a row in the
   alternatives table with a stated rejection reason.
2. **A `fixed` group limited to the identity-bearing core** (`primitives` plus the packages whose types are nominal),
   rather than all 54. The ADR rejects `fixed` because it "changes the release model for 54 packages"; a scoped group
   changes it for perhaps six and targets the identity concern directly. This should be recorded as considered and
   rejected with a reason, not left unexamined.

### 4.4 Strongest argument against my own recommendation

**The benefit is genuinely narrow, and the package says so.** ADR-033 Decision 7 disclaims any single-instance guarantee,
and its own compatibility matrix shows duplicates persisting for every mixed old/new population — which, since published
versions are immutable, is *every existing consumer* until they upgrade. So this is a 50-package coordinated release plus
a permanent new release-review burden, to remove one of several duplicate causes, with the residual risk owned by a
verification job that does not exist anywhere (ADR-036/WP-D3). A maintainer could reasonably **reject** ADR-033 and invest
only in consumer-side detection, treating duplicates as a documented consumer responsibility.

I still recommend acceptance, for two reasons. First, exact published pins are the **only** cause of duplication that
Comity itself controls — every other cause lives in consumer graphs. Second, the ADR's second reproduced graph shows
duplication **inside Comity's own HTTP stack** (`http-hono` binding 0.9.0 while `http`, `composition` and `kernel` keep
0.9.1); that is a framework defect, not a consumer mistake, and no amount of consumer-side detection fixes it.

---

## 5. ADR-034 assessment

**[REC] Accept with amendments.** **This is a material disagreement with the package, which recommends plain "Accept".**

### 5.1 What I verified independently (E1, Node v24.19.0)

| # | ADR-034 claim | Result |
|---|---|---|
| 1 | Today's layout crashes under `require()` | **PASS** — reproduces verbatim: `ReferenceError: exports is not defined in ES module scope` |
| 2 | `import` and `require` both resolving to `dist/esm` makes `require()` work | **PASS** — keys `BaseError, __esModule, default` |
| 3 | `require(esm)` returns `{ __esModule: true, default }` (Decision 5) | **PASS** — `__esModule=true`, `default={"name":"fixed"}` |
| 4 | Class identity is preserved across `require`/`import` | **PASS** — `require('fixed').BaseError === (await import('fixed')).BaseError` |
| 5 | `instanceof` holds across the boundary | **PASS** |
| 6 | The rejected nested `{"type":"commonjs"}` marker creates two classes | **PASS** — confirms `!==`, so the rejection rationale is correct |
| 7 | Top-level `await` breaks `require(esm)` (Decision 4) | **PASS** — `ERR_REQUIRE_ASYNC_MODULE` |
| — | "0 bytes on stderr" (no `ExperimentalWarning`) | **PASS** — stderr captured separately: **0 bytes** |

Every runtime claim in the ADR reproduces. The `exports` structure in Decision 2 is correct as written: both conditions
resolve to the same ESM artifact and the same declaration target, so error-class identity and singleton behaviour are
preserved — which is the property the whole dependency-policy package exists to protect.

### 5.2 Why I do not recommend plain acceptance

Two gaps the package did not examine, both verified:

- **IR-03.** `@comity/queue-pg-boss` has **no `require` condition and no `main`** — falsifying the Context's "Every
  published `@comity/*` package … ships two builds" and "Every export map routes the `require` condition to those files",
  and leaving the migration step "rewrite `require.default` and `main` in each package" undefined for one package.
  `package-metadata.ts` requires neither field, so no validator would flag it.
- **IR-04.** The amendment scope covers `runtime-support.md` **§1 only**, while §2 and §3 of that **normative** document
  affirmatively claim Edge/Workers and browser/client-only surfaces whose bundler resolution this change alters — and the
  ADR itself states bundlers were "not tested, no claim" and that a bundler reading `dist/cjs` "may have worked
  unobserved".

Neither gap changes the direction of the decision; both are cheap to fix; both would otherwise be inherited by WP-B, which
implements from this ADR. IR-15 is a related wording point.

### 5.3 Consumer-contract clarity

Decision C asks maintainers to confirm "supported contract is ESM, with `require()` supported only on Node ≥ 24.0.0 via
`require(esm)`; no separate CommonJS build". I found **no published package or consumer promised a separate CommonJS
build**: `package-metadata.ts` requires only `["name","version","type","license","engines","exports"]`; ADR-022's
dual-distribution paragraph is scoped to `@comity/cli` and `@comity/cli-commander` and explicitly disclaims being the
repository-wide contract (verified at ADR-022 lines 63–72); the repository-wide convention appears only in descriptive
documents (`community/docs/architecture/repository.md`, `community/SKILL.md`,
`community/docs/.documentation/AGENT.md`), which the ADR correctly identifies. **The consumer contract is sufficiently
clear to accept**, subject to IR-03/IR-04.

On the semver question the package raises as open item 5 (shipping a changed `main`/`exports` as a patch): I agree with the
package that it is defensible but a judgment call. One addition — for `queue-pg-boss`, adding a `require` condition where
none existed would *extend* the published surface under a patch, which is a different question from repointing one, and
should be decided separately (IR-03).

### 5.4 Strongest argument against my own recommendation

**These are documentation defects, not decision defects.** The decision — one ESM build serving both conditions — is
correct, every alternative in the ADR's table is worse, and I verified the two most important rejections empirically
(rows 6 and 7). The ADR is `Proposed` and its Scope says it "changes no build configuration, export map or package". So
accepting now and fixing IR-03/IR-04 during WP-B is entirely defensible and avoids delaying a P0 correctness fix.

I still recommend "accept with amendments" because **acceptance is the moment this ADR becomes the authority for
`runtime-support.md`**. An authority that misstates its own package population and omits the normative runtime matrix from
its amendment scope will be implemented from, and the omission is far cheaper to fix before acceptance than after.

---

## 6. ADR-035 assessment

**[REC] Accept with amendments.** Same verdict as the package, but **for different reasons** — the package's principal
amendment rests on a premise I show to be false (IR-13), and the amendments actually needed are ones it missed.

### 6.1 Missing-build semantics — Decision D

The intended behaviour is `CONFIGURATION-ERROR`, `executed: false`, `passed: false`, no validation finding, exit code 2,
never `NOT-RUN`. **[CONFIRMED] consistent across all four locations:**

| Location | Evidence |
|---|---|
| ADR-035 | Decision 3 note ("reported as `CONFIGURATION-ERROR` (exit `2`) with no finding and never as `NOT-RUN`. A check that cannot run must never pass"); Consequences; Validation requirement 5 |
| Design document | §3, §4.1, §9, §10 |
| `exit-codes.ts` | `CONFIG_ERROR: 2`, documented as "configuration / discovery error (cannot run)" |
| `run.ts` | `categoryIsAcceptable` returns `false` for an unexecuted result unless status is `NOT-RUN` / `NOT-APPLICABLE` / `TOOL-UNAVAILABLE` — so an unexecuted `CONFIGURATION-ERROR` fails the run; `exitCodeForResult` maps any `CONFIGURATION-ERROR` category to 2 when the run did not pass |

The package's Decision D assessment is **accurate**, including its citation of the Semgrep precedent — I verified
`semgrep.ts` lines 561–568 return exactly that shape. The design's instruction to add the new category to `run.ts`'s
`allExecuted` list is also correct: `allExecuted = [depResult, eslintResult, semgrepResult, adapterResult]`, with
`metaResult`/`configResult` checked separately, so omission would indeed silently pass. **[REC] Confirm Decision D.**

### 6.2 Precedence when configuration and validation failures co-occur

**[CONFIRMED]** the precedence exists and is intentional in code: `exitCodeForResult` checks
`status === "CONFIGURATION-ERROR"` across **all** categories before falling back to `FAIL`. It is documented in design §9
but not called out in `exit-codes.ts`.

Is it operationally useful? **Partly, and the package's verdict is too generous.** The precedence itself is right — a run
that could not complete should not report a plain pass/fail. But the package missed the compounding factor (IR-08):
`bin/comity-validate.ts` line 100 prints violations **only with `--verbose`**. So the mixed case produces exit 2 (the code
documented as "cannot run") **and no violation detail by default**. Exit 2 is the natural trigger for CI retry logic, so a
real policy violation can be masked as an infrastructure flake. **[REC]** keep the precedence, but require findings always
to be printed and document that exit 2 may co-occur with violations.

### 6.3 Graph traversal, relative references, subpaths

**[CONFIRMED]** the design (§4) is coherent and appropriately conservative: BFS over relative references with the
`.js`→`.d.ts`, `+".d.ts"`, `+"/index.d.ts"` resolution order; unresolvable relative references reported as
`ARCH-DECL-DEP-000`; `ts.createSourceFile` only (no `Program`, no installed-state resolution), which is what makes the
engine deterministic; `ImportTypeNode`, `ImportEqualsDeclaration`, `typeReferenceDirectives` and module-file
`declare module` augmentations all counted; script-file ambient `declare module` correctly excluded. Package ownership is
textual (`pkgName`), never by filesystem walk.

**False-positive risk: low**, and I verified the two controls that matter most — `@comity/cache-redis` is the only package
with optional peers and references neither in its declarations, so `-003` has zero candidates; no package uses
`optionalDependencies`/`bundledDependencies`, so design open item 1 is moot today.

**False-negative risk: real but bounded.** External subpaths are not resolved (design §4.5, acknowledged); ambient globals
without an import are invisible (§7, acknowledged, none exist); **the `files` field is not checked** (IR-07); **external
repository namespaces are silently skipped** (IR-06).

### 6.4 Can it inspect the published surface?

**No.** It inspects workspace `dist/types` (IR-07), and it cannot run in a clean-consumer tree at all (IR-05). The
clean-consumer test is therefore **complementary, not redundant** — it is the only check that sees the packed surface and
the installed graph. The package does not pose this question directly; its §2 brief implicitly treats the engine as the
published-surface check, which overstates it.

### 6.5 Severity classification

Error-from-day-one is justified by ADR-010's rule (gradual enforcement only where there is migration backlog) and by a
zero-finding baseline that **I reproduced** (IR-13). **[REC] accept error severity**, with the regression test retained as
*rule-set* coverage rather than as the sole evidential basis. `community/tsconfig.json` does use `skipLibCheck: true`
(verified, line 35), so the silent-`any` failure mode the ADR describes is real for Comity's own repositories.

### 6.6 Strongest argument against my own recommendation

**My reproduction is a textual approximation, not the specified algorithm.** It scanned all 537 `.d.ts` rather than the
entry-reachable subset, and did not implement self-reference or sibling-subpath checks (`-004`/`-005`) or optional-peer
root reachability (`-003`). If the real engine's reachable set differs, the 443 figure will not match and the zero-finding
premise weakens. So the package's caution is not baseless — it is simply aimed at the wrong target. The defensible
statement is "the counting baseline is reproducible; the rule-set result is not yet established", and the regression test
should stay. I am not arguing for less rigour; I am arguing that the rigour should be pointed at `-003/-004/-005` rather
than at a number that already checks out.

---

## 7. ADR-036 assessment

**[REC] Accept with amendments.** Same verdict as the package, plus three amendments it missed.

### 7.1 Ownership boundaries and dependency direction

**[CONFIRMED]** `repository-ownership.md` assigns "Comity-wide standards" and "Comity-wide ADRs" to comity-development as
**Owner**, with Community and Enterprise as Consumers. A Comity-level dependency-declaration policy is therefore consistent
with the ownership model — the package's Decision E recommendation to confirm Comity-wide scope is **sound**.

**[VERIFIED]** Dependency direction Consumer → Comity is real and one-way: no `@comity/*` manifest references Commerce;
Commerce is design-only with no packages. ADR-036 Decision 5 states this correctly.

**But see IR-09:** the cited ownership document does not mention Commerce at all, and the ADR does not address how a
Comity-level rule binds a CI job in a repository Development does not own.

### 7.2 Package identity risks, `link:`/`file:`, tarballs

The ADR's evidence chain is internally consistent and matches the Commerce policy §6 restatement: `link:` resolves the
linked library's peers from **its own** repository (second copy even at equal versions); `file:<directory>` keeps one copy
but goes stale when Comity's build deletes and recreates `dist`; a packed tarball plus `pnpm.overrides` gives one instance,
passes `strict-peer-dependencies=true`, and installs the bytes that would be published. **I did not re-run these pnpm
experiments**; they are plausible, mutually corroborating across two documents, and not load-bearing for the acceptance
decision. **I record them as [REPORTED], not [VERIFIED]** — the one category in this review where I accept the package's
word. The recommendation to forbid `link:`/`file:`/`overrides` in released manifests is sound regardless of the
experimental detail.

One omission: the alternatives table does not consider **`pnpm.overrides` in a published consumer manifest** for
identity-bearing edges. Overrides are consumer-side and cannot be published by a library, so the omission is defensible —
but it should be a recorded row, since overrides are exactly the mechanism ADR-033 recommends to *consumers* as a
mitigation and a maintainer will ask why Commerce cannot use it.

### 7.3 Clean-consumer verification strategy

Seven steps, target fixed at pnpm 10.13.x / Node 24+, with explicit non-claims for npm, Yarn, hoisted layouts, bundlers
and non-Node runtimes. The design is good and the negative controls (deliberate duplicate, dev-only declaration reference)
are the right ones. Two problems:

- **Step 4 is not satisfiable by the ADR-035 engine as designed** (IR-05).
- **Step 2's `strict-peer-dependencies=true` will fail during exactly the split-release window that Decision B proposes to
  make the default procedure** (IR-02). Neither document mentions this interaction. If the verification job runs against
  Comity `latest` during a split window it fails for a reason that is not a Commerce defect. Commerce policy §7 step 4
  already installs "explicit `@comity/*` versions" in two legs (floor and latest-in-range), which mitigates this; ADR-036
  §4 should adopt the same wording rather than leaving the version selection implicit.

### 7.4 Relationship with ADR-008 and actual enforcement status

I verified the package's central enforcement claim and can state it more precisely, removing its hedge:

- **[VERIFIED]** `packages/validate/src/engines/` contains `adapter-peers`, `depcruise`, `eslint`, `schema`, `semgrep`,
  `types`. **There is no ADR-008 or cross-repository edge engine.**
- **[VERIFIED]** ADR-008 machinery exists and is partly wired: `packages/schemas/src/schemas/adr-008-register.ts` defines
  the register schema; `packages/dependency-rules/src/build-config.ts` (lines 72–73, 88, 203–210) accepts
  `registeredCoreEdges` and emits depcruise rules named `adr-008-edge-<from>-<to>`.
- **[VERIFIED — new]** `packages/validate/src/engines/depcruise.ts` calls
  `buildDependencyRulesForRoot(classification, repo.root)` — **two arguments only**. It never passes
  `registeredCoreEdges`, and the classification is built solely from `repo.packages` (in-repo, `@comity/*`-named). So the
  ADR-008 registered-exception path is **not wired into the validator even in-repo**.
- **[VERIFIED]** `validate/dist/engines/core-register.{js,d.ts}` exists; `git check-ignore -v` returns
  `.gitignore:7:dist/`; `git ls-files packages/validate/dist` is empty;
  `git log --all -- packages/validate/src/engines/core-register.ts` is empty; no source references it. **Stale ignored
  build output with no source and no history — not evidence of a feature, and no bearing on the enforcement assessment.**

**Conclusion: ADR-008 enforcement does not exist in the validator, in-repo or cross-repository.** The package's §4E
statement is correct and appropriately hedged; the hedge can now be removed. Its four-way distinction is the right frame
and I confirm each category: ADR-036 is **documented policy**; ADR-035 is **planned** (no engine exists); the
clean-consumer job is **planned and unowned** (Commerce WP-D3, gated on freeze decisions #1–#3); the tarball/overrides
workflow is **developer discipline**.

### 7.5 Strongest argument against my own recommendation

**ADR-036 governs nothing that exists.** Commerce is design-only: no repository (freeze decisions #1–#3 open), no
workspace, no packages, no CI, and an undecided namespace. Accepting a Comity-wide policy whose only named consumer cannot
yet be checked is arguably premature — a maintainer could reasonably **defer** ADR-036 until the Commerce repository is
approved and write it then against a real dependency graph with real declaration output to classify.

I recommend acceptance anyway for two reasons. First, ADR-036 constrains **Comity's own** behaviour as much as Commerce's:
it is the stated justification for placing the ADR-035 engine in the shared validator, and it is what makes ADR-033's
carets meaningful rather than decorative. Second, deferring leaves the frozen `07-package-architecture.md` §4 manifest
sketch (`"@comity/order": "workspace:*"`) unannotated as wrong, and Commerce scaffolding would inherit a specifier that
cannot resolve across repositories and that ADR-036 shows forks identity.

---

## 8. Release governance assessment

**Question:** is making `release-review.md` mandatory for every `Version Packages` PR proportionate and practical?

**[REC] Mandatory, but trigger-tiered.** I agree with the package that it should be mandatory and decided as its own item
rather than as a side effect of ADR-033. I disagree that the full checklist should apply to every release.

### 8.1 The proportionality problem

**[CONFIRMED]** §3.4 requires the reviewer to "build and pack **each package in the plan** and inspect the packed
`package.json`". For WP-A2 that is 50 packages. The package notes this cost and recommends permitting a script — correct,
but it addresses only the largest case. The deeper issue is that §3.2, §3.5 and §3.6 are **already conditional in
substance** (§3.2 applies "For every package in the plan that lists a changed package in `peerDependencies`"; §3.6 applies
"When the plan changes published sibling ranges or distribution"), while §3.1 and §3.3 are universal and cheap. A routine
two-package release with no peer edges and no range change would still owe a recorded checklist under a literal reading,
for items with nothing to check.

### 8.2 False alarms and major cascades

**[VERIFIED]** there is no pending changeset in `community/.changeset/` and the standard has never been exercised (IR-16),
so the false-alarm rate is unknown. What *is* known is that the cascade is broad: a minor of **any of 16** peered packages
releases its peer dependents as `1.0.0` (IR-12, T2). §4 makes "A peered Core Module minor or major in the plan with its
dependents' bump handling undecided" a **blocking** condition, and §3.2.4 requires the reviewer to "confirm explicitly how
its dependent adapters are handled: accepted as a major, or the release is split". Under IR-01 the second branch of that
choice is not currently executable — so a reviewer applying §4 faithfully would block every peered minor until the process
change is authorised. That is a correct outcome, but it means the standard as written will generate blocks whose remedy
does not yet exist.

### 8.3 Concrete recommendation

Adopt `release-review.md` with a **trigger tier**. Apply §3.1, §3.3 and all §4 blocking conditions to **every** release.
Apply §3.2, §3.4, §3.5 and §3.6 only when at least one objectively checkable trigger is present in the PR diff:

| # | Trigger (machine-checkable from the PR diff / packed manifests) |
|---|---|
| a | Any `major` bump, or any `0.x → 1.0.0` transition |
| b | Any package in the plan whose `peerDependencies` name another package also in the plan |
| c | Any change to a published sibling range or range protocol (`workspace:*` → `workspace:^`) |
| d | Any change to `exports`, `main`, `type`, `module` or `files` |
| e | Plan size ≥ 10 packages |
| f | Any `workspace:`, `file:` or `link:` specifier in a packed manifest (always blocking) |

When no trigger is present the reviewer records a one-line attestation: *"No trigger (a)–(f) present; §3.1 and §3.3
completed."* That keeps the governance objectively followable — applicability is determined from the diff, without judgment
— while removing the disproportionate cost on routine releases.

Three further amendments:

1. **Permit and name the evidence script** for §3.4, as the package recommends, and state that until §7's automation is
   separately authorised the reviewer runs it and attaches the output. The checklist remains the control.
2. **Decouple the effective date from ADR-033.** The standard currently "takes effect when ADR-033 is Accepted", yet §3.3
   (semver classification) and §3.5 (publication ordering) are useful regardless. The package already recommends deciding F
   as its own item; make the effective date follow that decision, not ADR-033.
3. **Pilot on WP-A2 and record the cost** (IR-16), then set the steady-state threshold for trigger (e) from evidence rather
   than from the guess of 10.

### 8.4 Can the governance be objectively followed?

Mostly yes, with two exceptions. §3.2.1 asks whether a major is "justified by actual incompatibility … or only by the
Changesets peer rule" — that requires reading the peered package's changelog and is judgment, not inspection; it should say
so and require the reviewer to name the specific changed or removed contract. §3.5.1 asks the reviewer to confirm that
"dependencies precede dependents in the intended publication order" — I could **not** verify from the pinned
`@changesets/cli@2.31.1` distribution that `changeset publish` topologically sorts (no such symbol appears in the bundled
CLI), so the standard should either cite the ordering guarantee or require the reviewer to record the order observed in the
publish log rather than assert it.

### 8.5 Strongest argument against my own recommendation

**Tiering adds a meta-decision.** A reviewer must first decide whether a trigger applies, and a mis-tiered release silently
loses §3.2/§3.4–§3.6 — precisely the sections that catch the defects this package exists to prevent. A blanket "always
mandatory" rule cannot be mis-applied that way, and its worst case is wasted effort rather than a missed defect. Given the
standard has no dry-run history (IR-16), the safer default is arguably the simpler one.

I still recommend tiering because the alternative's cost is unbounded: §3.4 at 50 packages, on every release, is the kind
of control that gets skipped under time pressure — and a control routinely skipped is worse than a narrower one actually
performed. Trigger (e) caps the worst case, and trigger (f) plus all §4 blocking conditions remain unconditional, so the
highest-consequence checks are never tiered away.

---

## 9. F-02 historical provenance assessment

### 9.1 What the labels are, and why they could not be found

The package's §8 reports that "the labels 'F-01'/'F-02' do not appear in any of the three repositories' documents, so they
could not be checked by name". **[VERIFIED]** — I searched all three repositories and found no `F-01`/`F-02` identifiers.
The package's handling is correct and honest: rather than invent a mapping, it states what it checked instead
(missing-build semantics and ADR-008 enforcement wording) and says that if the labels mean something else that must be
confirmed.

Reconstructing from the available reports: F-02 is a finding-ID from a prior independent review concerning **the accuracy of
the Commerce provenance record** — specifically whether the roadmap and freeze documentation correctly described what was
changed in the Commerce working tree during the dependency-policy work, what pre-existed, and what could be established
about authorship and sequence.

### 9.2 What the current evidence establishes

**[VERIFIED]** Commerce `6c01ab6` (Filippo Bovo, 2026-11-04 11:21:03 +0100) is a **single commit** whose stat is exactly
the six files roadmap §9 tabulates:

| File | Change in `6c01ab6` |
|---|---|
| `docs/architecture/07-package-architecture.md` | +7 |
| `docs/architecture/12-implementation-roadmap.md` | 6 lines changed |
| `docs/architecture/README.md` | 10 lines changed |
| `docs/architecture/resolution/architecture-freeze-assessment.md` | 61 lines changed |
| `docs/architecture/resolution/final-freeze-report.md` | 9 lines changed |
| `docs/governance/package-dependency-policy.md` | **+176 (new file)** |

`git log --all -- docs/governance/package-dependency-policy.md` returns **only** `6c01ab6`. `40c187e` ("architecture
freeze") is the parent and is an ancestor of HEAD.

**[VERIFIED]** the diff of `12-implementation-roadmap.md` in that commit is exactly the Phase A status change:
`**Status (2026-11-04): READY TO START**` → `**Status (2026-11-04): DESIGN READY — IMPLEMENTATION AUTHORIZATION
PENDING.**`, with the added gate naming ADR-032 acceptance, `community/packages/order/docs/design.md`, and Community
review.

**Also [VERIFIED]** on the Development side: `a208100` (11:20:41) is a single commit containing **eleven** files —
ADR-029, ADR-030, ADR-031, ADR-032, ADR-033, ADR-034, ADR-035, ADR-036, `release-review.md`, the roadmap and the
validator design document — under the commit message `feat: add ADR-035 for published declaration dependency validation`.

### 9.3 What can and cannot be established

**Can be established:**
- The six Commerce files changed together, in one commit, at 11:21:03 on 2026-11-04, authored by Filippo Bovo.
- The Phase A status text changed from `READY TO START` to `DESIGN READY — IMPLEMENTATION AUTHORIZATION PENDING` in that
  commit.
- The Commerce governance policy document was created in that commit and has no prior history.
- `40c187e` is the immediately preceding Commerce state.
- The Development dependency-policy documents were committed at 11:20:41, nineteen seconds before the Commerce commit.

**Cannot be established, by any available means:**
- Which pass, session or agent authored each individual hunk within `6c01ab6`.
- Whether the Phase A status correction **predated** the dependency-policy task or was made during it. Git records commit
  time, not edit time; all six files share one commit timestamp.
- The sequence of edits within the working-tree window that preceded the commit.
- Whether roadmap §9's attribution — "the dependency-remediation task's own Commerce edits are the cross-references …
  The Phase A status changes … are the freeze record's own 'Correction 2026-11-04' … not attributed to this documentation
  task" — is accurate. **It is a narrative claim with no corroborating artefact.**

### 9.4 Verdict on F-02

**F-02 is NOT resolved, and the reason is the opposite of what a clean working tree suggests.**

A clean Commerce tree is not evidence that provenance was established; it is evidence that the working-tree distinctions
were **flattened into a single commit**, which destroyed the last chance to reconstruct them. Before `6c01ab6` an examiner
could at least inspect modification times and hunk grouping in the working tree. After it, git presents six files as one
atomic change by one author at one instant.

To the package's credit, its §8 does state "Commerce `main` at `6c01ab6`, tree clean, policy document committed. Roadmap §9
is stale." That is accurate as far as it goes. What it does not do — and what this assessment requires — is state the
consequence: **the provenance limitation is now permanent, not merely unresolved.**

Is the limitation adequately documented? **Partly.** Roadmap §9 is genuinely good on substance: it refuses to reduce the
changes to "two minimal cross-reference edits", it draws the task-specific/pre-existing distinction explicitly, it states
that "the exact author/pass of each uncommitted change cannot be reconstructed from the working tree alone", and it
corrects its own earlier error ("the earlier statement that it is 'unchanged' was wrong"). That is unusually honest
provenance writing. But it fails on three points:

1. **It is stale** (IR-10): framed as "working tree vs HEAD `40c187e`", and it asserts "Relative to HEAD, the Phase A
   authorisation status **is changed**" — both now false, since the change is in HEAD.
2. **It does not say the distinction is unverifiable.** It says the author/pass "cannot be reconstructed from the working
   tree alone", which invites the reader to think another source might supply it. No other source exists: the commit is
   atomic.
3. **It does not record that the Development side has the same problem, and a worse one.** `a208100`'s message names only
   ADR-035 while committing eight ADRs and three other documents, four of which (ADR-029/030/031/032) are unrelated to the
   dependency-policy work. Anyone later auditing which documents this task produced will be misled by the commit message.

**Recommended correction.** Add a short provenance note to roadmap §9 (documentation-only, separately authorised)
recording: the six files were committed together in `6c01ab6`; the task-specific/pre-existing distinction rests on this
document's narrative and is **not verifiable from git**; and the Development documents were committed in `a208100`, whose
message names only ADR-035. Restate §9 in the past tense relative to `40c187e`. **Do not mark F-02 resolved.**

**Severity:** P2 (IR-11). Blocks documentation only — it does not block circulation, because the package's §8 does disclose
the current state accurately; but maintainers must not be told F-02 is closed.

---

## 10. Commerce and Phase A boundary assessment

### 10.1 Does the package keep the ADRs separate from Commerce implementation authorisation?

**Yes. [CONFIRMED]** The package's §6 is explicit and correct on every point:

- "Accepting ADR-033…036 **does not authorise** Commerce implementation or Order Phase A."
- Commerce readiness (first package *publication*) depends on ADR-036, the WP-A2 release, and WP-C or an equivalent
  declaration gate. **[VERIFIED]** against roadmap §4's milestone table and Commerce policy §7.
- "ADR-034/WP-B is a Commerce prerequisite **only if** Commerce promises CommonJS." **[VERIFIED]** against roadmap §4
  ("WP-B only if Commerce promises CommonJS") and Commerce policy §9 item 3.
- "Phase A remains gated by ADR-032 acceptance (**[FACT]** `Proposed`), review of
  `community/packages/order/docs/design.md` (**[FACT]** `Draft — pending review`), and Community sign-off." **[VERIFIED]**:
  ADR-032 line 8 reads `**Status:** Proposed`; the Order design document's header reads "**Status:** **Draft — pending
  review.** … It is **not** accepted and **not** implemented: no manifest, source file, test, or API change described here
  has been created. The current published package (0.9.1) is unchanged."
- "The roadmap states Phase A needs none of WP-A/B/C." **[VERIFIED]** at roadmap §4: "| Phase A (`@comity/order`
  implementation) | none of these |".
- "This review modifies no ADR-032, Order design, or Commerce freeze document." **[VERIFIED]** — none of those files appears
  in any working-tree change; all are committed and unmodified.

### 10.2 Accidental implication that acceptance authorises Commerce implementation?

I found **none** in the package. I found two places where a reader could infer more than is intended, both in the documents
under review rather than in the package:

1. **Roadmap §2 WP-D1** — "Adopt Commerce policy; amend 07 §4 sketch under freeze change control", dependency "ADR-036
   accepted". The dependency column reads as though ADR-036 acceptance were *sufficient* for WP-D1. It is not: amending a
   frozen document also requires the freeze's own change control, which Commerce policy §8 correctly states. WP-D1's
   Acceptance column ("Sketch corrected; freeze record updated") does not name the freeze change control as a gate.
2. **Roadmap §5.2** — "**Phase A is not blocked.** … Publishing `@comity/order@0.10.0` after WP-A2 is recommended so that it
   ships caret ranges". Correct and carefully worded ("Nothing here changes Phase A's authorisation status"), but it sits in
   a *release plan* section and could be read as scheduling a Phase A publication. It should cross-reference ADR-032's
   `Proposed` status in the same sentence.

Neither is a defect in the package. Both warrant a one-line clarification.

### 10.3 ADR-034 as a Commerce prerequisite

**[CONFIRMED]** the conditional framing is correct and correctly sourced. ADR-036 open question 3 asks exactly that
question; Commerce policy §7 step 8 makes the `require` assertions conditional ("If CommonJS is promised (ADR-034), also
`require` every subpath"); Commerce policy §9 item 3 lists it as open. The package's Decision E amendment — "settle open
question 3 by recording that no consumer is currently promised CommonJS until ADR-034 is accepted and implemented" — is
sound, and I verified there is no Commerce package that could promise anything today.

### 10.4 Readiness dependencies

**[CONFIRMED]** the package's dependency chain matches roadmap §4 exactly (Phase A: none; Commerce scaffolding: freeze
#1–#3 plus ADR-036; first Commerce publication: WP-A2, WP-C1/C2 or equivalent, WP-D1, WP-D3, WP-B only if CommonJS).

One addition the package does not make: **IR-05 means WP-C1 alone does not satisfy the publication gate.** The gate names
"WP-C1/C2 (or equivalent script)" for the declaration check, but ADR-036 places that check inside the clean-consumer job,
where the engine cannot run. Whichever way IR-05 is resolved, roadmap §4's publication row should name the artefact that
actually performs the declaration check.

---

## 11. Cross-document consistency findings

### 11.1 Claims I checked and found consistent

| Topic | Documents | Result |
|---|---|---|
| Package counts (54 / 50 / 120 / 94 / 26 / 2 / 19) | ADR-033 §Context, roadmap §3, package §0 | **[VERIFIED]** all exact |
| `@comity-dev/*` refs = 7 in `cli` + `validate` | roadmap §3 line 108, ADR-033 open question 3 | **[VERIFIED]** 3 + 4 = 7 |
| Packages without sibling edges | roadmap §3 line 50 | **[VERIFIED]** exactly `graphql-builder`, `media`, `primitives`, `seo` |
| `exports[*].import` entries = 123 across 54 | ADR-034 validation evidence | **[VERIFIED]** exactly 123 |
| Declaration baseline 54 / 537 / 443 / 0 / 0, build 2026-10-31 | ADR-035 §Context, design §10 | **[VERIFIED]** exact (E2) |
| Changesets peer-major behaviour | ADR-033 §"peer-dependent major bump", `release-review.md` §1, roadmap §1, package §4B | **[VERIFIED]** consistent with each other and with source + T1/T2/T3 |
| Missing-build semantics | ADR-035, design §3/§9/§10, `exit-codes.ts`, `run.ts`, package §4D | **[CONFIRMED]** consistent |
| Node runtime floor `>=24.0.0` | ADR-034, `runtime-support.md` §1, all 54 manifests, `release-review.md` §3.6, ADR-036 §4, Commerce policy §7 | **[VERIFIED]** consistent |
| Verification target pnpm 10.13.x / Node 24+ | ADR-036 §4, Commerce policy §7, `release-review.md` §3.6, roadmap | **[CONFIRMED]** consistent |
| ADR statuses all `Proposed` | four ADRs, roadmap §1, package §0 | **[VERIFIED]** |
| ADR-032 `Proposed`; Order design `Draft — pending review` | package §6, roadmap §5.2, Commerce `12-implementation-roadmap.md` | **[VERIFIED]** |
| Ownership: Development owns Comity-wide standards/ADRs | `repository-ownership.md`, ADR-036 provenance | **[CONFIRMED]** consistent |
| No ADR-008 / cross-repository engine | ADR-036 §Context, package §4E, `validate/src/engines/` | **[VERIFIED]** |
| Severity `error` from day one vs ADR-010 backlog rule | ADR-035 Decision 5, roadmap §1, design §6 | **[CONFIRMED]** consistent |


### 11.2 Contradictions and stale references

| # | Documents | Issue | Finding |
|---|---|---|---|
| C-1 | package §4B vs ADR-033 Decision 8 vs `release-review.md` §5.3 vs `community/package.json` + `release.yml` | Split-release recommended with "no Changesets configuration change", but no executable path exists without a script/workflow change | **IR-01** |
| C-2 | package §4B cost cell vs ADR-036 §Context/Consequences | "unmet peers warn only" presented as an acceptable cost; ADR-036 lists the same condition as a verified defect | **IR-02** |
| C-3 | ADR-034 §Context/migration vs `queue-pg-boss/package.json` vs `package-metadata.ts` | "Every package ships two builds / every export map routes `require`" vs one package with neither | **IR-03** |
| C-4 | ADR-022 line 72 ("47 packages") vs 54 packages today | Stale count quoted as verified scope by ADR-034 | **IR-03** |
| C-5 | ADR-034 Dependencies + roadmap §6 vs `runtime-support.md` §2/§3 | Amendment scoped to §1 only; §2/§3 make normative non-Node claims the change affects | **IR-04** |
| C-6 | ADR-036 §4 step 4 vs ADR-035 Decision 2 + design §1/§2 vs `discover.ts` | Declaration check specified inside a clean-consumer tree where the engine discovers nothing | **IR-05** |
| C-7 | ADR-035 Decision 8 vs Commerce policy §1 (namespace **[OPEN]**) vs `discover.ts` name filter | Commerce coverage asserted but conditional on an undecided namespace; silent failure mode | **IR-06** |
| C-8 | ADR-035 title + package §2 rationale vs ADR-035 Decision 2 + design §11 item 3 | "Published" vs built-not-packed | **IR-07** |
| C-9 | `run.ts` `exitCodeForResult` vs `exit-codes.ts` comment vs `bin/comity-validate.ts` line 100 | Exit 2 documented as "cannot run" but can co-occur with findings, which are not printed without `--verbose` | **IR-08** |
| C-10 | ADR-036 References vs `repository-ownership.md` | Cited ownership authority does not mention Commerce; enforcement authority over another repository's CI unaddressed | **IR-09** |
| C-11 | roadmap §9 + §1 line 24 vs ADR-033 line 15 + migration step 1 vs current HEADs | Commerce HEAD, community branch/position and the "branch from `origin/main`" instruction all stale; one now actively wrong | **IR-10** |
| C-12 | roadmap §9 vs Commerce `6c01ab6` vs Development `a208100` | Provenance framing stale; unverifiability not stated; Development commit message misleading | **IR-11** |
| C-13 | ADR-033 line 82 vs actual peered-package set | 7 illustrated vs 16 actual — illustrative wording, so not an error, but Decision B's scope is understated | **IR-12** |
| C-14 | package §2 ADR-035 "Weakness" + dissent item 4 vs reproducible build output | "unreproducible number" is false for the counting baseline | **IR-13** |
| C-15 | ADR-035 Decision 4 + design §4.2 vs the 443 figure | Reachability filter is not discriminated by the regression number | **IR-14** |
| C-16 | `release-review.md` §3.5.1 vs `@changesets/cli@2.31.1` | Publication ordering asserted; no topological-sort symbol found in the pinned CLI | §8.4 |
| C-17 | roadmap §2 WP-D1 dependency column vs Commerce policy §8 | ADR-036 acceptance presented as sufficient; the freeze change control is not named as a gate | §10.2 |

### 11.3 Statements accurate when written and now stale

All are in **committed** documents, so they will be read as current:

- ADR-033 line 15 — "local `community` at `0e2bb15`; `origin/main` at `3391f94`".
- ADR-033 migration step 1 — "Branch from `origin/main` (the local checkout may be behind it)".
- Roadmap §1 line 24 — "`community` is on `feature/acl-casl-fields` at `0e2bb15`, **behind `origin/main`**".
- Roadmap §9 — "Commerce working tree (vs HEAD `40c187e`)"; "Relative to HEAD, the Phase A authorisation status **is
  changed**"; the `package-dependency-policy.md` row marked "(untracked)".
- Roadmap WP-A1 acceptance — "Re-counted from `origin/main`".
- ADR-022 line 72 — "the existing 47 packages".

None of these invalidates a decision. All should be corrected before the corresponding work package starts, because
implementation tasks quote them as acceptance criteria.


---

## 12. Final recommendation matrix

| Item | Package's recommendation | **This review's recommendation** | Agreement | Blocking findings |
|---|---|---|---|---|
| **ADR-033** | Amend | **Accept with amendments** | Agree on verdict; amendments differ | IR-01, IR-02 (circulation); IR-10, IR-12 (impl./docs) |
| **ADR-034** | Accept | **Accept with amendments** | **Disagree** | IR-03, IR-04 (impl.); IR-15 (docs) |
| **ADR-035** | Amend | **Accept with amendments** | Agree on verdict; **disagree on grounds and on which amendments** | IR-05, IR-06, IR-07, IR-08 (impl.); IR-13, IR-14 (docs/test) |
| **ADR-036** | Amend | **Accept with amendments** | Agree; three further amendments | IR-05, IR-09 (impl.) |
| **Decision A** (per-ADR acceptance) | 033 amend, 034 accept, 035 amend, 036 amend | As above | Partial | — |
| **Decision B** (release strategy) | Option 2 default; Option 1 as recorded exception; no config change | **Option 2 remains the better outcome, but the recommendation must be re-issued:** name `changeset version --ignore`, disclose the script/workflow change it requires, disclose the compatibility window, and authorise the process change explicitly | **Disagree as written** | **IR-01, IR-02 (circulation)** |
| **Decision C** (ESM-only contract) | Confirm | **Confirm** | Agree | IR-04 must be resolved before WP-B |
| **Decision D** (missing-build behaviour) | Confirm | **Confirm**, plus the IR-08 amendments | Agree, with addition | IR-08 (impl.) |
| **Decision E** (Comity-wide scope of 036) | Confirm + enforcement-status section | **Confirm** + enforcement-status section + the IR-09 authority sentence | Agree, with addition | IR-09 (impl.) |
| **Decision F** (release-review governance) | Mandatory for every PR | **Mandatory but trigger-tiered** (§8.3) | **Disagree** | IR-16 (docs) |
| **F-02** | Implicitly closed (§8 notes roadmap §9 stale) | **Not resolved; the limitation is permanent** | **Disagree** | IR-11 (docs) |
| **Commerce / Phase A boundary** | Correctly separated | **Correctly separated** — no change required | Agree | — |

**No ADR is recommended for rejection or deferral.** For each, §4.4 / §5.4 / §6.6 / §7.5 states the strongest argument
against my own recommendation, including the credible case for *rejecting* ADR-033 outright and for *deferring* ADR-036.

### 12.1 Amendment counts per ADR

| ADR | Package's amendments | This review's amendments |
|---|---|---|
| ADR-033 | 2 (record Decision B outcome; record open questions 3/4) | 5 (package's 2, plus IR-01 mechanism, IR-02 cost, IR-10 staleness) + IR-12 |
| ADR-034 | 0 (accept; resolve open questions) | 3 (IR-03 population, IR-04 amendment scope, IR-15 wording) |
| ADR-035 | 2 (severity conditional on fresh-build regression; resolve design open item 1) | 5 (IR-05 execution context, IR-06 silent-empty, IR-07 built-vs-published, IR-08 output, IR-14 test) — and amendment (1) re-grounded per IR-13 |
| ADR-036 | 2 (enforcement-status section; settle open question 3) | 5 (package's 2, plus IR-05, IR-09, §7.3 version pinning) |


---

## 13. Required amendments before maintainer circulation

Only two findings block circulation. Both are in Decision B and both are one-paragraph fixes.

### 13.1 Must fix before circulation (P1)

**A-1 — Re-issue Decision B with the mechanism named (IR-01).**

In `dependency-policy-maintainer-review.md` §4 Decision B, replace the recommendation's closing clause "no Changesets
configuration change" with:

> Option 2 requires invoking `changeset version --ignore <dependent packages>`; it cannot be produced by naming fewer
> packages in a changeset, because `assemble-release-plan` computes peer-dependent majors from the dependency graph.
> Verified: `--ignore` is accepted because `.changeset/config.json` has `"ignore": []` (`@changesets/cli@2.31.1` rejects
> the flag only when the config array is non-empty). Because `changesets/action` invokes the fixed `pnpm run version`
> script, a split release additionally requires a dedicated `version:split` script or a manual `changeset version` run
> outside the action. **This is a release-process change and must be authorised as one**; it is not available from the
> current workflow. An independent dry run (2026-11-04) confirmed the outcome: the peered package reaches 0.10.0 alone,
> and the follow-up release bumps the adapter to 0.9.2 — not 1.0.0 — publishing `^0.10.0`.

Also add to ADR-033's peer-major section, replacing "it is not decided here" as the package already recommends, and to
`release-review.md` §5 as the package already recommends.

**A-2 — Restate the cost of Option 2 (IR-02).**

In the same section, replace the Option 2 cost cell ("Adapters' published peer ranges lag for one release window (unmet
peers warn only)") with:

> For one release window the registry carries adapters whose published peer range excludes the newly released peered
> version. Consumers installing both receive an unmet peer — a warning only — and run an untested combination: the exact
> condition ADR-036 records as a verified defect. Under 0.x a minor may break, so this is a compatibility risk, not a
> cosmetic warning. Separately, the workspace resolves `workspace:^` to the new version, so CI tests a graph the registry
> does not publish. Mitigations: keep the window as short as possible, sequence the second release immediately, and record
> the window in both sets of release notes and under `release-review.md` §3.5.

### 13.2 Recommended before circulation (cheap, non-blocking)

**A-3 — Correct dissent item 4 and ADR-035 amendment (1) (IR-13).** The ADR-035 baseline (54 / 537 / 443 / 0 / 0, build
2026-10-31) is reproducible today from committed build output. Reframe the regression test as *rule-set* coverage
(`-003/-004/-005`), not as the sole basis for the severity decision. This changes one of the package's four ADR
amendments, so it is worth fixing before maintainers read it.

**A-4 — Record the 16 peered packages (IR-12)** so maintainers size Decision B's frequency correctly.

**A-5 — Add a one-line F-02 status (§9.4)** stating that the finding is not resolved and that the provenance limitation is
now permanent because the Commerce changes were committed atomically in `6c01ab6`.

### 13.3 Must fix before implementation (P2, does not block circulation)

| # | Fix | Document(s) |
|---|---|---|
| B-1 | State the actual package population (53/54) and decide `queue-pg-boss`'s treatment (IR-03) | ADR-034 §Context, §Compatibility; roadmap §2 WP-B |
| B-2 | Extend the amendment scope to `runtime-support.md` §2/§3, or scope those claims to the `import` condition (IR-04) | ADR-034 §Dependencies; roadmap §6 |
| B-3 | State where the declaration check runs, and update the publication-gate row (IR-05) | ADR-036 §4 step 4; roadmap §4 |
| B-4 | Require `NOT-APPLICABLE` with a reason on zero discovered packages; record the namespace dependency (IR-06) | ADR-035 or design §2/§3; roadmap WP-D1 |
| B-5 | State built-vs-published scope; resolve design open item 3 (IR-07) | ADR-035 title or Decision 2; design §11 |
| B-6 | Always print findings; document that exit 2 may co-occur with violations; add the mixed-run test (IR-08) | design §9/§10; `exit-codes.ts` comment (at implementation) |
| B-7 | Add the enforcement-authority sentence; fix the `repository-ownership.md` reference (IR-09) | ADR-036 §Decision 4 / §References |
| B-8 | Correct all stale HEAD/branch references and the "branch from `origin/main`" instruction (IR-10, §11.3) | ADR-033 line 15 + step 1; roadmap §1 line 24, §9, WP-A1 |
| B-9 | Add the provenance note; do not mark F-02 resolved (IR-11) | roadmap §9 |

### 13.4 Before steady-state adoption of the release standard

| # | Fix | Document |
|---|---|---|
| C-1 | Add the trigger tier (§8.3) and the no-trigger attestation | `release-review.md` §3 |
| C-2 | Permit and name the §3.4 evidence script | `release-review.md` §3.4 |
| C-3 | Decouple the effective date from ADR-033 | `release-review.md` header |
| C-4 | Mark §3.2.1 as judgment and require the specific contract to be named | `release-review.md` §3.2 |
| C-5 | Require the observed publication order from the publish log, or cite the ordering guarantee (C-16) | `release-review.md` §3.5.1 |
| C-6 | Name the freeze change control as a WP-D1 gate (C-17) | roadmap §2 |


---

## 14. Evidence index

All paths are repository-relative. "§" refers to the section of this review that relies on the item.

### 14.1 `development` (branch `feature/commerce`, HEAD `a208100`)

| Path | Section(s) | Used for |
|---|---|---|
| `docs/standards/reviews/dependency-policy-maintainer-review.md` | all | The package under review (untracked) |
| `docs/standards/decisions/ADR-033-…md` — lines 15, 17–26, 48–67, 69–85, 87–97, 117–121, 123–134, 138–146, 156–161 | §4, §11 | Counts, Decision 8, peer-major section, alternatives, migration, validation |
| `docs/standards/decisions/ADR-034-…md` — lines 13–47, 59–84, 86–94, 96–104, 106–124, 126–138, 140–160, 162–166 | §5, §11 | Context, Decision 2/3/4/5, ADR-022 relationship, limitations, validation |
| `docs/standards/decisions/ADR-035-…md` — lines 28–31, 39–76, 90–111, 113–132, 134–137 | §6, §11 | Baseline, rule table, missing-build note, severity, codes |
| `docs/standards/decisions/ADR-036-…md` — lines 12–38, 47–106, 108–119, 121–139, 141–160 | §7, §10, §11 | Context, declaration classes, ranges, local dev, verification, direction |
| `docs/standards/decisions/ADR-032-…md` — line 8 | §10 | `**Status:** Proposed` |
| `docs/standards/decisions/ADR-022-…md` — lines 63–72, 155, 162 | §5, §11 | Dual-distribution scope; the stale "47 packages" |
| `docs/standards/release-review.md` — header, §1, §2, §3.1–§3.6, §4, §5, §6, §7 | §8, §11 | Checklist, blocking conditions, escalation |
| `packages/validate/docs/declaration-dependencies-design.md` — §1, §2, §3, §4.1–§4.5, §5, §6, §7, §8, §9, §10, §11 | §6, §11 | Algorithm, failure behaviour, test plan, open items |
| `docs/architecture/dependency-remediation-roadmap.md` — §1 (line 24), §2, §3 (lines 48–50, 108), §4, §5, §6, §7, §8, §9 | §10, §11, §9 | Work packages, counts, sequencing, provenance record |
| `docs/architecture/repository-ownership.md` — Ownership Matrix, Key Principles §1–§2 | §7, §11 | Ownership boundaries; absence of Commerce |
| `docs/standards/runtime-support.md` — §1, §2, §3 | §5, §11 | Normative runtime claims |
| `docs/standards/adapters.md` — §13 (line 331) | §4 | `workspace:*` permission and delegation |
| `packages/validate/src/run.ts` — `categoryIsAcceptable`, `allExecuted`, `exitCodeForResult` | §6 | Missing-build and precedence semantics |
| `packages/validate/src/exit-codes.ts` — `CONFIG_ERROR: 2` and its comment | §6 | Exit-code contract |
| `packages/validate/src/bin/comity-validate.ts` — line 100 | §6 | Findings printed only with `--verbose` |
| `packages/validate/src/discover.ts` — lines 56–67, 107–108 | §6, §7 | Config fallback; `@comity/*` name filter |
| `packages/validate/src/format.ts` — `FormatInput`, `CATEGORY_LABELS` | §6 | Fixed-shape categories |
| `packages/validate/src/engines/depcruise.ts` — `buildDependencyRulesForRoot(classification, repo.root)` | §7 | ADR-008 edges not passed |
| `packages/validate/src/engines/semgrep.ts` — lines 561–568 | §6 | `CONFIGURATION-ERROR` precedent |
| `packages/validate/src/engines/` (directory listing) | §7 | No ADR-008 / cross-repository engine |
| `packages/validate/dist/engines/core-register.{js,d.ts}` + `git check-ignore -v` + `git ls-files` + `git log --all` | §7 | Stale ignored build output, no source, no history |
| `packages/validate/package.json` — `files`, `dependencies`, `devDependencies`, `exports` | §6, §7 | `typescript` currently a devDependency |
| `packages/dependency-rules/src/build-config.ts` — lines 72–73, 88, 203–210 | §7 | `registeredCoreEdges` machinery |
| `packages/schemas/src/schemas/adr-008-register.ts` — header, schema | §7 | Register schema exists |
| `packages/schemas/src/schemas/package-metadata.ts` — line 33 | §5 | Required fields exclude `main`/`require` |
| `packages/build/src/bin/comity-build.ts` — lines 154–161, 230–237 | §5 | The CJS pass in build and watch |
| git: `log`, `show --stat a208100`, per-file `log` | §2, §9 | Commit contents and misleading message |


### 14.2 `community` (branch `feature/commerce`, HEAD `91f5de1`, clean)

| Path | Section(s) | Used for |
|---|---|---|
| `.changeset/config.json` | §4, §8 | `fixed: []`, `linked: []`, `updateInternalDependencies: "patch"`, `ignore: []` |
| `.changeset/` (directory listing) | §8 | Only `config.json` — no pending changesets |
| `.github/workflows/release.yml` | §8, §3 (IR-01) | `changesets/action@v1` with `version: pnpm run version` |
| root `package.json` — `scripts.version`, `scripts.release` | §3 (IR-01) | The fixed `changeset version` script |
| `tsconfig.json` — lines 7–8, 35 | §6 | `moduleResolution: bundler`, `skipLibCheck: true` |
| all 54 `packages/*/package.json` | §4, §5, §6, §11 | Counts, versions, `type`, `exports`, `files`, workspace refs, `peerDependenciesMeta` |
| `packages/primitives/package.json` | §5 | `main`/`require` → `dist/cjs` under `type: module` |
| `packages/queue-pg-boss/package.json` | §5 (IR-03) | No `require` condition, no `main` |
| `packages/cache-redis/package.json` + `packages/cache-redis/dist/types/**` | §6 (IR-13) | Only optional peers; no `redis`/`ioredis` declaration references |
| `packages/cli-commander/package.json` | §4 | The 2 sibling `devDependencies` |
| `packages/*/dist/types/**` (537 `.d.ts`, all dated 2026-10-31) | §6 (IR-13, IR-14) | Baseline reproduction |
| `packages/order/docs/design.md` — header | §10 | `Draft — pending review` |
| `node_modules/.pnpm/@changesets+assemble-release-plan@6.0.10/…/dist/changesets-assemble-release-plan.cjs.js` — lines 200–290 (`determineDependents`), 291–325 (`getDependencyVersionRanges`), 326–345 (`shouldBumpMajor`), 350–390, 540–600 | §3, §4 | Cascade mechanism and range normalisation |
| `node_modules/.pnpm/@changesets+config@3.1.4/…/dist/changesets-config.cjs.js` — lines 96, 225–226, 319–327, 347, 355–356 | §3, §4 | Defaults for `onlyUpdatePeerDependentsWhenOutOfRange` and `updateInternalDependents` |
| `node_modules/.pnpm/@changesets+cli@2.31.1/…/dist/changesets-cli.cjs.js` — lines 1349, 1407, 1515–1530, 1562, 1674–1675 | §3 (IR-01), §8 | `--ignore` flag, its guard, and the dependent guard |
| `node_modules/.pnpm/@changesets+apply-release-plan@7.1.1/…/dist/changesets-apply-release-plan.cjs.js` — lines 122–124, 189–273 | §4 | `workspace:` rewriting at publish |
| git: `log`, `show --stat 91f5de1`, `diff --stat 3391f94 HEAD`, `merge-base --is-ancestor origin/main HEAD` | §2, §6, §9, §11 | Ahead-of-`origin/main`; only a doc changed since the build |

### 14.3 `commerce` (branch `main`, HEAD `6c01ab6`, clean)

| Path | Section(s) | Used for |
|---|---|---|
| `docs/governance/package-dependency-policy.md` — §1, §2, §3, §4, §5, §6, §7, §8, §9 | §7, §10, §11 | Commerce application of ADR-036; open namespace; verification steps |
| git: `show --stat 6c01ab6`, `show 6c01ab6 -- docs/architecture/12-implementation-roadmap.md`, `log --all -- docs/governance/package-dependency-policy.md`, `log -1 40c187e`, `merge-base --is-ancestor` | §9, §11 | The atomic six-file commit; the Phase A status diff; provenance limits |

### 14.4 Experiment artefacts (outside all repositories; not committed anywhere)

| Artefact | Contents |
|---|---|
| `/tmp/cs-exp/setup.sh`, `/tmp/cs-exp/report.sh` | Synthetic workspace builder using community's exact `.changeset/config.json`; packages `@test/{base,adapter,plain,app}` |
| `/tmp/cs-exp/T1_caret_patch`, `T2_caret_minor`, `T3_star_patch` | Baseline cascade experiments (§4.1) |
| `/tmp/cs-exp/T4_split` | Manual-reversion split attempt (§3 IR-01) |
| `/tmp/cs-exp/T5_ignore` | `changeset version --ignore` split, plus the second release leg and a published-range simulation (§3 IR-01, IR-02) |
| `/tmp/esm-exp/{node_modules/{broken,fixed,dual,tlawait}, test.cjs, err.txt}` | ADR-034 runtime reproduction on Node v24.19.0, with stderr captured separately (§5.1) |
| `/tmp/declcount.mjs` | Read-only scan reproducing ADR-035's 54 / 537 / 443 / 0 / 0 baseline (§6, IR-13) |

---

## Closing statement

This review was strictly read-only. No ADR, standard, design document, roadmap, Commerce document, manifest, lockfile,
source file, test, CI configuration or Changesets configuration was modified, staged or committed in any of the three
repositories. The only file created is this report. All experiments ran under `/tmp`.

Final repository state, re-verified after writing this report:

| Repository | Branch | HEAD | Working tree |
|---|---|---|---|
| `community` | `feature/commerce` | `91f5de1` | clean |
| `development` | `feature/commerce` | `a208100` | `?? docs/standards/reviews/` (the pre-existing review package plus this report) |
| `commerce` | `main` | `6c01ab6` | clean |

**Verdict:** the maintainer package is substantially sound and fit to circulate after amendments A-1 and A-2 (§13.1). Its
factual core survived adversarial testing, including every quantitative claim I could reproduce and all seven of ADR-034's
runtime claims. Two P1 findings in Decision B must be corrected first, because maintainers would otherwise choose a release
strategy on an unexecutable procedure and an understated cost. Three material disagreements with the package are recorded in
§12: ADR-034 should be accepted *with amendments*, ADR-035's principal amendment rests on a false premise, and ADR-036 §4
step 4 cannot be satisfied by the ADR-035 engine as designed. F-02 is not resolved and must not be reported as closed.

