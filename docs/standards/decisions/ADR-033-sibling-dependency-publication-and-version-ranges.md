# ADR-033 — Sibling Dependency Publication and Version-Range Policy

> **Provenance:**
> - Canonical owner: comity-development
> - Runtime owner: comity-community (`@comity/*` manifests, release pipeline)
> - Raised by: Cross-Repository Dependency Policy Audit and Remediation Plan (Commerce / Comity boundary work, 2026-11-04)

**Status:** Proposed

## Context

Every `@comity/*` package that depends on a sibling package declares it with the pnpm protocol `workspace:*`. At publish
time (`changeset publish` runs `pnpm publish`) pnpm rewrites `workspace:*` to the sibling's **exact** version.

Verified on 2026-11-04 (local `community` at `0e2bb15`; `origin/main` at `3391f94` gives the same counts):

- **120** sibling references use `workspace:*`: **94** in `dependencies` and **26** in `peerDependencies`, across **50**
  packages (the 26 peer entries are in the **19** Technology Adapters that follow `adapters.md` §13). No sibling reference
  uses any other protocol form. Two sibling `devDependencies` entries (`cli-commander`) are also `workspace:*`.
- The registry shows the consequence. `@comity/order@0.9.1` depends on exactly `@comity/pricing 0.9.1`,
  `@comity/primitives 0.9.1`, `@comity/organization 0.9.1`. `@comity/http-hono@0.9.1` peers `@comity/primitives`, `http`
  and `composition` at the exact version `0.9.1`. `@comity/acl-casl@0.10.0` peers `@comity/acl` at exactly `0.9.2`.
- Packages are released **independently** (`.changeset/config.json`: `"fixed": []`, `"linked": []`), so versions already
  diverge (0.9.0, 0.9.1, 0.9.2, 0.10.0 coexist).
- `development/docs/standards/adapters.md` §13 allows `workspace:*` for Core Module peers and delegates conversion to
  "the repository's publishing/release process". It states no range policy.

## Problem statement

Exact published pins turn any version drift into duplicate package instances. Where a package carries runtime identity
(`BaseError` in `@comity/primitives`, checked with `instanceof` by `toSafePayload`, `http-hono`, `http`, `auth`,
`auth-jose`, `html`, `kernel`), a second copy changes behaviour: an error from one copy fails `instanceof` against the other
and `toSafePayload` reports `code: "unknown"`.

Reproduced with pnpm 10.13.1 against the real published packages:

| Consumer graph | Result |
|---|---|
| app `primitives@0.9.0` + `order@0.9.1` (pins `primitives 0.9.1`) | two `primitives` instances; `PricingError` is not a `BaseError` for the app; `toSafePayload` → `"unknown"` |
| app `primitives@0.9.0` + `http-hono@0.9.1` (exact peer `0.9.1`) | two `primitives` instances **inside Comity's own HTTP stack**: `http-hono` binds the app's 0.9.0 (peer unmet, a warning only) while `http`, `composition` and `kernel` keep 0.9.1 |
| a library that peers `primitives`/`pricing` plus the real `order@0.9.1` | still two `pricing` instances: the peer does not override `order`'s exact transitive pin |

`peerDependencies` declared by a consumer cannot repair exact pins published by Comity. The defect is in how Comity
publishes ranges, not only in how downstream packages declare dependencies.

## Decision

1. **Internal sibling references in `dependencies` and `peerDependencies` use `workspace:^`.** pnpm publishes it as
   `^<sibling version at publish time>`. This applies to `@comity/*` packages in comity-community. Under 0.x, `^0.9.1` means
   `>=0.9.1 <0.10.0`: patch drift is allowed; a sibling minor is a range break.
2. **`devDependencies` on siblings are unchanged** (`workspace:*`). They are not a published compatibility constraint.
3. **The dependency + peer pairing for Technology Adapters (`adapters.md` §13) is unchanged.** Only the range protocol
   changes. Converting Core Module `dependencies` into peers is **not** decided here and is not supported by the evidence.
4. **Exceptions** require a recorded justification in the package's `docs/conventions.md` and are limited to a package that
   depends on a sibling's **non-exported** implementation detail. None exist today (verified by manifest and export-map review).
5. **Package-by-package verification precedes the change.** The 120 references are the verified count at the date above;
   the migration re-counts from `origin/main` and lists every package, using the migration table in
   `docs/architecture/dependency-remediation-roadmap.md`. A package that fails verification is listed as an exception.
6. **Existing exact pins are corrected only by new releases.** One **coordinated patch release** publishes every package
   with sibling edges at the same time, so that the registry's latest versions carry caret ranges. Published versions are
   immutable: older versions keep their exact pins permanently.
7. **No guarantee of a single instance is claimed.** A caret range removes one common cause of duplicates. It does not
   prevent a consumer from pinning an older version, an out-of-range peer (pnpm warns and installs), or mixed old and new
   Comity versions. Detection belongs to the consumer verification required by ADR-036.
8. **`Version Packages` pull requests are reviewed under a mandatory gate**, defined in `docs/standards/release-review.md`.
   The gate covers peer-dependent version bumps and their rationale. This ADR does not change Changesets configuration or
   add automation; any such change is a separate design decision.

### The peer-dependent major bump (verified in the pinned Changesets version)

`@changesets/assemble-release-plan@6.0.10` (the version installed in comity-community) assigns a **major** bump to every
package that lists a changed package in `peerDependencies` whenever that package receives a **minor or major** release. This
happens for `workspace:*` and `workspace:^` alike, and for the `onlyUpdatePeerDependentsWhenOutOfRange: true` option
whenever the new version leaves the range, which a 0.x caret range does on every minor. Under 0.x, "major" means `1.0.0`.
A **patch** release of the peered package does not trigger it. In a synthetic workspace with the repository's
configuration, a patch of the base left `workspace:^` dependents unreleased and a minor released every peer dependent as
`1.0.0`.

Consequence for this ADR:

- The coordinated release in Decision 6 is a **patch**, so it does not trigger the major cascade.
- The next **minor** of a peered Core Module (for example `primitives`, `composition`, `http`, `sql`, `cache`, `queue`,
  `acl`) would release its adapters as `1.0.0`. This is not a change introduced by `workspace:^`; it exists today.
  The review gate in `release-review.md` exists to stop an unjustified cascade. Whether to accept it, split the release,
  or change Changesets behaviour is a decision the gate escalates; it is not decided here.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep `workspace:*` | Verified to publish exact pins that force duplicate instances regardless of how consumers declare dependencies |
| `workspace:~` | Equivalent to `^` under 0.x, but diverges from `^` semantics after 1.0; no benefit |
| `workspace:>=0.9.1 <1.0.0` style wide ranges | Claims cross-minor compatibility that 0.x semver does not promise; would also need to be maintained by hand |
| Lockstep versioning (`fixed` group) | Changes the release model for 54 packages; larger than the defect requires; an owner-level release-strategy decision |
| Convert all Core `dependencies` to peers | Not supported by the evidence; peers do not repair transitive exact pins (the third experiment above) |
| Enable `onlyUpdatePeerDependentsWhenOutOfRange` and rely on wide peer ranges | Changes Changesets behaviour and publishes unvalidated compatibility claims; explicitly out of scope |
| Consumer-only `pnpm.overrides` | A mitigation for already-published versions (see Compatibility), not a fix for future publication |

## Consequences

**Positive:** future releases stop forcing duplicates when siblings drift by patch; a sibling patch no longer cascades
patch releases to every dependent (verified: `workspace:^` dependents are not re-released); the range protocol is made explicit.

**Negative / trade-offs:**

- With `workspace:^`, a sibling patch no longer re-releases its dependents automatically. A change that requires
  dependents to adopt the new patch must list them in its changeset. The coordinated release therefore enumerates the
  packages explicitly.
- The published floor ratchets to the sibling version current at publish time, so consumers must upgrade sibling packages
  together past that floor.
- Dependents' ranges move with each sibling **minor**, so every 0.x minor of a depended-upon package forces dependent
  re-releases (as today).
- Old versions keep exact pins; see Compatibility.

## Compatibility and migration

| Consumer population | Outcome |
|---|---|
| Uses only versions published after the coordinated release | Caret ranges intersect on patch drift, so pnpm can dedupe. One instance is **not** guaranteed: an app pinned below a floor still gets two instances, and peers only warn |
| Uses only versions published before | Unchanged: exact pins, same duplication behaviour and same remedies as today |
| Mixes old and new (for example `order@0.9.1` with `pricing@0.9.2`) | **Duplicates persist** until the consumer moves to releases published with carets, or applies `pnpm.overrides`; verified to collapse the duplicates |

Migration, in order (detail and acceptance criteria in `docs/architecture/dependency-remediation-roadmap.md`):

1. Branch from `origin/main` (the local checkout may be behind it).
2. Change the verified references to `workspace:^`; re-count; list exceptions.
3. Add one changeset listing every publishable package with a sibling edge as `patch`.
4. Review the resulting `Version Packages` PR under `release-review.md`.
5. Verify packed tarballs and a clean consumer (Validation requirements) before publishing.

**Rollback / recovery.** Published versions cannot be relied on to be unpublishable. Recover forward: move the `latest`
dist-tag back to the previous version, `npm deprecate` the faulty versions with a message, and publish a corrective patch
(a source revert restores exact pins for future versions). Whether to deprecate the old exact-pinned versions after the
caret release is an owner decision.

## Validation requirements

1. **Tarball manifests:** after `pnpm pack` of every changed package, no `workspace:` specifier remains and every sibling
   dependency and peer is `^<released version>`.
2. **Clean consumer:** installing `@comity/order` and `@comity/http-hono` with a patch-newer `@comity/primitives` (packed
   locally) yields exactly one `@comity+primitives@` directory; a `PricingError` passes `instanceof BaseError` and
   `toSafePayload(e).code` is `pricing:…`.
3. **Regression of the reproduced failure:** the `http-hono` exact-peer graph shows no 0.9.1/0.9.2 split inside
   `http`, `kernel`, `composition`, `http-hono`.
4. **Release plan:** a dry run of `changeset version` on the release branch shows no package moving to `1.0.0` unintentionally
   (see `release-review.md`).

## Dependencies on other decisions

- **ADR-036** defines how consumers declare Comity dependencies and verify graphs; this ADR does not guarantee a single instance without it.
- **ADR-034** (ESM-only distribution) is independent. If both ship as patches they may share one release train, or ship separately (roadmap).
- **ADR-008** (Core-to-Core register) and `adapters.md` §13's peer requirement are unaffected. The `workspace:*` examples in
  `adapters.md` §13 are updated when this ADR is Accepted (not before; standards describe current practice).
- **ADR-022, ADR-029/030/031/032** are unaffected.

## Open questions (require maintainer decision before this ADR is Accepted)

1. Adoption of `workspace:^` and of the coordinated patch release (owner direction given; Accepted status requires maintainer review).
2. How a peer-driven `1.0.0` cascade is handled when a peered Core Module next needs a minor (escalated by the review gate).
3. Whether the `@comity-dev/*` workspace references in comity-development adopt the same rule (low priority; tooling has no identity concern).
4. Whether to deprecate the exact-pinned versions after the caret release.

## References

`development/docs/standards/adapters.md` §13; ADR-008; `community/.changeset/config.json`;
`docs/standards/release-review.md`; `docs/architecture/dependency-remediation-roadmap.md`; ADR-034, ADR-035, ADR-036.

## Scope

This ADR decides the published range protocol for internal sibling references and the existence of a release review gate.
It does not change any manifest, Changesets configuration, workflow, or published version.
