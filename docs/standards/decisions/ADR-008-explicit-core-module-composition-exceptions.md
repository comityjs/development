# ADR-008 — Explicit Core Module Composition Exceptions

**Status:** Accepted

> **Amendment 1 — OD-8 formally incorporated (2026-11-06).** Status is unchanged (**Accepted**). The owner-approved
> `order → pricing` value-import exception is now recorded in both the closed register and the machine-readable register:
>
> 1. **Dependency — Value.** `order → pricing` is a **Value** import, limited to the public `PriceRecord` record
>    types (`PriceRecord`, `PriceCurrency`, `PriceModifierRecord`) and `combine`. No other edge is affected;
>    type-only remains the default for every other dependency.
> 2. **Register — INCORPORATED.** The machine-readable register records `"importKind": "value"` with the
>    `"value-import"` category, and the closed register classifies `order → pricing` as **Value**.
> 3. **Authorized scope — limited.** The surface is the public `PriceRecord` record types
>    (`PriceRecord`, `PriceCurrency`, `PriceModifierRecord`) and `combine` only; it does
>    **not** include `verify()`, the retained-semantics table, or an aggregate-side `from` API.
>
> Formal incorporation is complete. The value-import implementation was subsequently completed and released in
> `@comity/order@0.10.0` (with `@comity/pricing@0.10.0`); the earlier pre-implementation statement that it remained
> separately authorized, and that no manifest/dependency/source change had been made, is retained only as historical
> context and is superseded by that release. The authorized scope remains unchanged.

> **Amendment 2 — Fulfillment capability edges (2026-11-07).** Status is unchanged (**Accepted**). Two **type-only**
> Capability Exceptions are registered for the optional Commerce capability `@comity/fulfillment`:
> `fulfillment → order` and `fulfillment → organization`. The register grows from 17 to **19** edges. No other edge,
> classification or import kind changes. See "Amendment 2" below.

> **Amendment 3 — Entitlement capability edge (2026-11-08).** Status is unchanged (**Accepted**). One **type-only**
> Capability Exception is registered for the optional Commerce capability `@comity/entitlement`:
> `entitlement → organization`. The register grows from 19 to **20** edges and the Commerce edge budget from ≤ 9 to
> **≤ 10**. `schemaVersion` stays `1`. No other edge, classification or import kind changes. See "Amendment 3" below.

## Context

Comity Core Modules intentionally provide reusable capabilities.

The current dependency rule states:

> Core Modules MUST NOT depend on other Core Modules unless explicitly allowed.

During repository review, several Core-to-Core dependencies were identified in the codebase:

| Dependency              | Import kind                |
| ----------------------- | -------------------------- |
| `storefront → catalog`  | Value (DI tokens) + type   |
| `storefront → content`  | Type-only                  |
| `storefront → search`   | Type-only                  |
| `catalog → media`       | Type-only                  |
| `catalog → search`      | Type-only                  |
| `content → media`       | Type-only                  |
| `content → search`      | Type-only                  |
| `content → seo`         | Type-only                  |
| `address → validation`  | Type-only                  |
| `customer → validation` | Type-only                  |
| `customer → organization` | Type-only                |
| `identity → validation` | Type-only                  |
| `order → organization`  | Type-only                  |
| `auth-tokens → auth`    | Value (`AuthError`) + type |
| `router → http`         | Type-only                  |

> Historical record: the `catalog → search`, `content → search`, and
> `taxonomy → search` (listed above as identified during review) were
> removed in **Phase 15 (Search Contract Isolation)**. The closed
> register at the bottom of this ADR describes the post-Phase-15 state.

Revision 1 of this ADR framed these as legitimate "capability composition" and proposed a Capability Composition Test that could be read as **general permission** for Core Modules to depend on each other.

That framing is rejected. It weakens the layering model: "if a dependency satisfies a test, it may be added" inverts the architectural default, which is isolation.

This ADR reframes the intent:

> Core-to-Core dependencies remain forbidden by default. This ADR does NOT authorize Core Modules to depend on each other. It defines the exhaustive, closed list of approved exceptions.

Every dependency below is an **exception**, not a right. Removing any of them remains preferable to keeping them; the ADR's register only fixes the current state so the architecture is honest about what already exists.

## Decision

1. Core Modules remain a single architectural category. No second category ("Strategic Core", "Composable Core", etc.) is introduced.
2. The default dependency rule is unchanged: **Core Modules MUST NOT depend on other Core Modules unless explicitly allowed.**
3. This ADR is the exhaustive exception register. A Core-to-Core dependency not listed here is a violation and MUST be removed or justified by a new ADR.
4. The register classifies each current dependency as one of:

- Capability Exception
- Infrastructure Contract Exception
- Value-Import Exception
- Candidate for Removal

5. New Core-to-Core dependencies require an ADR before introduction. This ADR grants no standing permission.

### Title justification

Revision 1's title, "Explicit Core Module Composition Boundaries", implies the ADR draws a boundary around what composition is allowed. The intent is narrower: composition stays forbidden, and this document only lists approved exceptions.

The title is renamed to **"Explicit Core Module Composition Exceptions"** to match that intent. "Exceptions" makes the default (forbidden) visible in the title itself and prevents the ADR from being cited as general permission.

## Exception Acceptance Criteria

A dependency in the register is acceptable only if ALL of the following hold. These criteria are used to evaluate the register; they do not grant new dependencies.

1. **Capability ownership** — The consumed capability is owned by the depended module.
2. **Ownership direction** — The dependency direction follows ownership (a higher-level capability may reference a lower-level one; never the reverse).
3. **Required contract dependency** — The requirement is evaluated through architectural review, not by the dependency proposer. A dependency being useful or convenient is not sufficient. All new Core-to-Core dependencies require explicit ADR approval.
4. **No implementation coupling** — The dependency must not reach into the depended module's implementation internals.
5. **No cycles** — The depended module must not (transitively) depend on the consumer.
6. **Documented** — The dependency is recorded in this ADR.
7. **Type-only preferred** — Value imports require explicit justification and are listed as value-import exceptions.
8. **Contract surface isolation** — A Core Module MUST NOT expose another Core Module's specialized domain concepts in its own public contracts unless the dependency represents domain ownership. This avoids cases such as catalog contracts exposing search-specific models.

## Dependency Categories

### Capability Exceptions

Type-only references where a higher-level domain capability references a lower-level domain capability's contracts. Direction follows ownership; the reference is to the depended module's public contracts.

These are the closest to "legitimate composition," but they remain exceptions, not a right.

### Infrastructure Contract Exceptions

Type-only references to infrastructure contract types that currently live inside Core Modules (`@comity/http`). These exist because some infrastructure contracts (request, response, status codes, context) are hosted by Core Modules today.

These exceptions are **compatibility exceptions only**:

- they are not a preferred dependency pattern;
- they should not be replicated;
- extracting these contracts into a lower layer (e.g., `@comity/primitives` or a dedicated transport-contract package) may be considered in future ADRs.

### Candidates for Removal

Dependencies that fail one or more acceptance criteria and SHOULD be removed or refactored. They are kept in the register only because they currently exist and removal is a migration, not a decision.

#### Migration Status — Search Contract Isolation (Phase 15, completed)

| Dependency          | Status     | Resolution                              | Notes                                                                                  |
| ------------------- | ---------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| `catalog → search`  | **Resolved** | Phase 15                                | `ProductRepository.search()` removed; search via `SearchPort<ProductProjection>`.       |
| `taxonomy → search` | **Resolved** | Phase 15                                | `TaxonomyRepository.search()` removed; search via `SearchPort<TaxonomyModel>`.          |
| `content → search`  | **Resolved** | Phase 15                                | `PageRepository.search()` / `BlockRepository.search()` removed; search via `SearchPort`.|

#### Migration Plan: `catalog → search` (executed in Phase 15)

**Problem** (as originally recorded): `ProductRepository` embeds `SearchCriteriaModel` / `SearchResultModel` from `@comity/search` in its public contract, violating contract surface isolation (Acceptance Criterion 8). Search is a separate capability not owned by catalog.

**Migration Path** (breaking change, executed with major versions):

1. **Define Search contracts in `@comity/search`** — `SearchPort<TProjection>` (generic, projection-agnostic) and `SearchError`. Search MUST remain dependency-free of any domain module; the projection type stays owned by the consuming domain module.

2. **Update `ProductRepository`** (and `PageRepository`, `BlockRepository`, `TaxonomyRepository`) to remove the `search()` method. The domain repository contracts become pure read-projection ports (`getById`, `getBySlug`).

3. **Application/Composition layer** composes `ProductRepository` + `SearchPort<ProductProjection>` for search functionality (e.g., `DefaultSearchPageComposer` in `@comity/storefront`). This aligns with the capability composition model: the composition layer decides which capabilities to compose.

4. **Adapters** implementing the affected repositories no longer implement search logic. Search adapters implement `SearchPort<TProjection>`.

**Result**: the three edges are closed and MUST NOT be re-introduced. The register below no longer lists them; only `storefront → search` remains (approved capability exception).

---

## Dependency Register (closed list)

### Capability Exceptions

| Dependency              | Import kind | Justification                                                       |
| ----------------------- | ----------- | ------------------------------------------------------------------- |
| `storefront → catalog`  | Type-only   | Storefront references catalog domain contracts and models.          |
| `storefront → content`  | Type-only   | Storefront content page composer references content domain models.  |
| `storefront → search`   | Type-only   | Storefront search page contract references `SearchResultModel`.     |
| `storefront → taxonomy` | Type-only   | Storefront category composer references taxonomy domain contracts and models. |
| `catalog → media`       | Type-only   | Catalog entities reference `MediaModel` for product/brand media.               |
| `content → media`       | Type-only   | Content blocks/pages reference `MediaModel`.                        |
| `content → seo`         | Type-only   | Content pages reference `SeoModel`.                                 |
| `taxonomy → media`      | Type-only   | Taxonomy models reference `MediaModel` for category image.          |
| `order → pricing`       | Value       | `@comity/order` composes its order-level `PriceRecord` via the public `PriceRecord` type and `combine` (record composition, not calculation); the record type stays pricing-owned.            |
| `order → organization`  | Type-only   | Order contracts reference `ChannelId` for commercial channel scoping. |
| `fulfillment → order`   | Type-only   | Fulfillment references the committed order by `OrderId` and reuses the `OrderAddressSnapshot` contract for shipping recipients; it never holds an `Order` and imports no value from `@comity/order`. |
| `fulfillment → organization` | Type-only | Fulfillment repository contracts require `TenantId` for multi-tenant isolation, as order and customer repositories do. |
| `entitlement → organization` | Type-only | Entitlement repository contexts require the nominal `TenantId` for multi-tenant isolation, as order, customer and fulfillment repositories do. |
| `address → validation`  | Type-only   | Address validator consumes the shared `Validator` contract.         |
| `customer → validation` | Type-only   | Customer validator consumes the shared `Validator` contract.        |
| `customer → organization` | Type-only | Customer repository requires `TenantId` for multi-tenant isolation. |
| `identity → validation` | Type-only   | Identity validator consumes the shared `Validator` contract.        |
| `payment → pricing`     | Type-only   | Payment module uses `Money` value object from pricing for amount representation in `PaymentRequest` and `PaymentOutcome`. |

### Infrastructure Contract Exceptions

| Dependency          | Import kind | Justification                                                                                                                                                                                                                          |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router → http`     | Type-only   | Router contracts reference `HttpContext`, `HttpHandler`, `HttpMethod`. Compatibility exception; extraction candidate.                                                                                                                  |

### Value-Import Exceptions

| Dependency             | Import kind                                                     | Justification                                                                                                                           |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-tokens → auth`   | Value (`AuthError`) + type                                      | Token facade error surface normalizes `AuthError` at runtime.                                                                           |

### Amendment 1 — Owner-approved runtime value-import exception (OD-8)

> **Authority:** architecture-owner approval, 2026-11-05 (owner decision **OD-8**), limited to the exact scope recorded below
> and no wider. This is an amendment to ADR-008, **not** a new ADR and **not** a reopening of the exception model.
> Core-to-Core dependencies remain forbidden by default; type-only remains the default for every registered edge; no other edge
> is granted. The exception is **owner-approved** and **formally incorporated (2026-11-06)**: the register tables above
> classify `order → pricing` as **Value** and the machine-readable register records `"importKind": "value"`. See
> "Formal incorporation — completed" below.

**Approved scope — exactly one edge, one direction, one API surface:**

| Dependency | Approved import kind | Justification |
| --- | --- | --- |
| `order → pricing` | **Value**, limited to the public `PriceRecord` record types (`PriceRecord`, `PriceCurrency`, `PriceModifierRecord`) and `combine` | `@comity/order` composes its order-level `PriceRecord` from line records through `PriceRecord.combine(...)` and records the current pricing semantics identifier (ADR-014 §13–§14). This is a monetary-record composition, not a calculation, and it keeps O-7 maintained by construction instead of by a caller-supplied aggregate price. |

**What is NOT granted.** No value import of the retained-semantics table; no call to `PriceRecord.verify()` from `@comity/order`;
no access to any other `@comity/pricing` internal; no value import on any other edge; no widening of the 8-edge budget recorded
elsewhere; changes to a manifest, dependency or source import remain limited to the separately authorized
implementation, now released in `@comity/order@0.10.0`.

Assessment against the acceptance criteria (§ Exception Acceptance Criteria):

- **(1) Capability ownership** — pricing owns price composition and the historical record shape (ADR-014 §13–14); satisfied.
- **(2) Ownership direction** — `order` is the consumer of a lower-level value module; satisfied.
- **(3) Required contract dependency** — **evaluated and approved by the architecture owner (OD-8, 2026-11-05)**, on the scope
  above and no wider. This criterion is satisfied by that approval, not by the proposer's own assessment.
- **(4) No implementation coupling** — the import touches only the public `PriceRecord` surface. `@comity/order` never
  reads the retained-semantics table (ADR-014 §14.3) and never calls `verify()`. Satisfied by construction.
- **(5) No cycles** — `@comity/pricing` depends on `@comity/primitives` only; `pricing → order` stays forbidden (ADR-014
  §11). Satisfied.
- **(6) Documented** — this section. The machine-readable register
  (`decisions/data/adr-008-core-exception-register.json`) records the incorporated edge with `"importKind": "value"`
  and the additional `"value-import"` category; its `justification` records the `PriceRecord`/`combine` scope.
  `schemaVersion` remains `1`, and the existing `"capability"` category is preserved. The register therefore reflects
  the actual change; it no longer records an approved-but-not-incorporated state.
- **(7) Type-only preferred** — **satisfied as a documented value-import justification, granted by OD-8** for this edge only.
  The preference itself is unchanged: value imports remain disfavoured and require their own approval.
- **(8) Contract surface isolation** — `@comity/order` does not re-expose pricing concepts it does not own; the record
  type stays a pricing type in pricing's public API. Satisfied.

**Formal incorporation — completed (2026-11-06).** The three mechanical steps are done, so the register and this ADR agree:

1. The `order → pricing` row is annotated **Value** in the Capability Exceptions table — one row, not two.
2. The machine-readable edge in `decisions/data/adr-008-core-exception-register.json` records `"importKind": "value"` (not
   `"mixed"` — the edge is wholly value) and adds `"value-import"` to its `categories` alongside `"capability"`; `schemaVersion`
   stays `1` (additive within an allowed enum).
3. The incorporation is recorded in `## Migration` below, so the change from type-only to value is traceable as a decision and
   not as drift.

**Unchanged by this amendment:** the closed-register rule, the "one decision per file" rule, the type-only default, all other
registered edges, the Forbidden Patterns section, the dependency categories and the criteria themselves. This amendment grants
**one** value import on **one** edge; every other Core-to-Core dependency remains governed exactly as before, and no additional
exception may be inferred from it.

### Amendment 2 — Fulfillment capability edges

> **Authority:** architecture-owner decision OD-G1 (2026-11-07), limited to the two edges below. This is an amendment to
> ADR-008, **not** a new ADR and **not** a reopening of the exception model. Core-to-Core dependencies remain forbidden by
> default; type-only remains the default for every registered edge.

| Dependency | Import kind | Symbols | Justification |
| --- | --- | --- | --- |
| `fulfillment → order` | **Type-only** | `OrderId`, `OrderAddressSnapshot` (and `OrderAddressRole` where needed) | Fulfillment references the committed order by identity and reuses the shipping-address snapshot contract. |
| `fulfillment → organization` | **Type-only** | `TenantId` | Fulfillment repository contexts carry the nominal `TenantId`, as `OrderRepositoryContext` does. |

Assessment against the acceptance criteria:

- **(1) Capability ownership** — `order` owns `OrderId` and the address snapshot; `organization` owns `TenantId`.
- **(2) Ownership direction** — the optional obligation capability depends on the commitment and on a value module; neither depends back.
- **(3) Required contract dependency** — evaluated and approved by the architecture owner (OD-G1), not by the proposer.
- **(4) No implementation coupling** — only public contract symbols are referenced.
- **(5) No cycles** — `order` and `organization` do not depend on `fulfillment`; `fulfillment → order` stays one-way.
- **(6) Documented** — this section, the closed-register table above, and the machine-readable register
  (`decisions/data/adr-008-core-exception-register.json`, `schemaVersion` unchanged at `1`).
- **(7) Type-only preferred** — both edges are type-only. `OrderId` and `TenantId` are nominal classes: the
  `@comity/fulfillment` source MUST import them with `import type` and MUST NOT call `OrderId.create` or `TenantId.create`.
  Registration alone does not establish this; see "Enforcement limits".
- **(8) Contract surface isolation** — Fulfillment does not re-expose order or organization concepts it does not own.

**Edge budget.** The Commerce capability set sanctions 1 + 1 + 3 + 3 = 8 edges; T-1 (nominal `TenantId` in Fulfillment)
adds a ninth. The Commerce edge budget is raised from **≤ 8 to ≤ 9**. This amendment grants only the two edges above; every
other sanctioned Commerce edge (`billing`, `subscription`, `quote`) still requires its own registration with its capability's ADR.

**Enforcement limits.** No Comity validator evaluates this register today (the validator does not pass `registeredCoreEdges`),
and Commerce's local `commerce/no-unregistered-core-edge` rule checks registration, not import kind. Type-only is therefore a
**documented constraint**, not an enforced one, until type-only enforcement is configured.

### Amendment 3 — Entitlement capability edge

> **Authority:** architecture-owner decision **OD-G2** (2026-11-08), limited to the single edge below. This is an amendment to
> ADR-008, **not** a new ADR and **not** a reopening of the exception model. Core-to-Core dependencies remain forbidden by
> default; type-only remains the default for every registered edge.

| Dependency | Import kind | Symbols | Justification |
| --- | --- | --- | --- |
| `entitlement → organization` | **Type-only** | `TenantId` | Entitlement repository contexts carry the nominal `TenantId`, as `OrderRepositoryContext` and the Fulfillment repository context do. |

The edge originates from the approved Entitlement contract (`fulfillment-stage-3a-contract.md`, Revision 3A.4).

Assessment against the acceptance criteria:

- **(1) Capability ownership** — `organization` owns `TenantId`.
- **(2) Ownership direction** — the optional entitlement capability depends on a lower-level value module; `organization` does not depend back.
- **(3) Required contract dependency** — evaluated and approved by the architecture owner (OD-G2), not by the proposer.
- **(4) No implementation coupling** — only the public `TenantId` contract symbol is referenced.
- **(5) No cycles** — `organization` does not depend on `entitlement`.
- **(6) Documented** — this section, the closed-register table above, and the machine-readable register
  (`decisions/data/adr-008-core-exception-register.json`, `schemaVersion` unchanged at `1`).
- **(7) Type-only preferred** — the edge is type-only. `TenantId` is a nominal class: the `@comity/entitlement` source
  MUST import it with `import type` and MUST NOT call `TenantId.create` or import any runtime value from
  `@comity/organization`. Registration alone does not establish this; see "Enforcement limits" under Amendment 2.
- **(8) Contract surface isolation** — Entitlement does not re-expose organization concepts it does not own.

**Edge budget.** The Commerce edge budget is raised from **≤ 9 to ≤ 10** to admit this one edge. The register grows from
19 to **20** edges; `schemaVersion` remains **1** because this is a register-content change, not a schema-format change.
Every other sanctioned Commerce edge (`billing`, `subscription`, `quote`) still requires its own registration with its
capability's ADR.

**Rank adjustment (informative).** The machine-readable register and this ADR carry no rank field, so no rank is stored
or changed by this amendment. The intended arrangement is recorded here as architectural intent only: `organization` and
`pricing` rank 1; `entitlement` and `order` rank 2; `fulfillment`, `subscription`, `quote` and `billing` rank 3. The only
adjustment the new edge requires is that `entitlement` ranks above `organization`; `order` and all existing dependants are
not moved.

### Ownership notes

`@comity/auth` owns authentication error semantics. `@comity/auth-tokens` consumes those semantics because token handling is an authentication capability.

The dependency direction is intentional.

`@comity/auth` MUST NOT depend on `@comity/auth-tokens` to prevent cyclic ownership.

### Candidates for Removal

No active removal candidates.

The three search-shaped dependencies (`catalog → search`, `taxonomy → search`, `content → search`) that were registered as candidates for removal have been **removed in Phase 15 (Search Contract Isolation)**:

- `ProductRepository`, `PageRepository`, `BlockRepository`, `TaxonomyRepository` no longer expose `search()`.
- `@comity/search` owns the generic `SearchPort<TProjection>` and `SearchError`.
- The Application/Composition layer composes `ProductRepository` + `SearchPort<ProductProjection>` where search is required (e.g., `@comity/storefront`).

These edges are closed and MUST NOT be re-introduced. See the Migration Status table above for the executed plan.

### Explicitly NOT registered

The following were evaluated and REJECTED as exceptions:

| Dependency                         | Reason for rejection                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `catalog → storefront`             | Reverse ownership.                                                                            |
| `catalog → html`, `catalog → http` | Presentation/infrastructure leakage; domain capability must not reference delivery contracts. |
| `catalog → <adapter>`              | Core Module must not depend on an Adapter.                                                    |

### Planned future edges

The following edges were previously considered when a `@comity/checkout`
Core Module was imagined. That package does not exist; checkout is an
Application Layer workflow, not a Core Module.

- `checkout → catalog` — was intended as mapping `ProductProjection` into the
  order's owned product snapshot; the order already stores its own
  `OrderProductSnapshot` independently of the catalog.
- `checkout → pricing` — was intended as computing prices via `@comity/pricing`;
  the order already consumes `Money`/`Price` type-only (registered in
  ADR-008). No new `checkout → pricing` edge is required.
- `checkout → order` — was intended as reading and mutating `Order` through
  entity methods and repository; order mutations are now driven by the
  Application Layer, not a checkout package.
- `checkout → customer` — was intended as reading customer contracts to compose
  buyer data; the Application Layer loads customer facts and maps them into
  `OrderCustomerSnapshot` at order creation time.

These edges are **not** registered and must not be re-introduced. The
dependency graph documents compile-time module edges, not temporal
orchestration sequence.

---

## Forbidden Patterns (unchanged)

- Reverse ownership (`catalog → storefront`).
- Presentation leakage (`catalog → html`).
- Infrastructure leakage (`catalog → sql-kysely`, `content → <search adapter>`).
- Cross-adapter dependencies.
- New Core-to-Core dependencies not registered in this ADR.

## Consequences

**Positive:**

- The architectural default (isolation) is preserved and restated.
- The closed register makes every existing dependency auditable.
- Type-only vs value imports are distinguished, with value imports requiring explicit justification.
- Infrastructure contract exceptions are framed as compatibility, not a pattern, and marked as extraction candidates.

**Negative / Trade-offs:**

- The register fixes the current state; it does not remove the dependencies that remain.
- The former `catalog → search`, `content → search`, and `taxonomy → search` removal candidates were removed in Phase 15.
- Future legitimate composition requires an ADR each time — process overhead by design.

## Migration

- **No action required** for the Capability Exceptions.
- **OD-8 formally incorporated (2026-11-06) — `order → pricing` is now a value import.** The register row is
  changed from Type-only to **Value**, and the machine-readable register records `"importKind": "value"` with the
  `"value-import"` category, limited to the public `PriceRecord` record types (`PriceRecord`, `PriceCurrency`,
  `PriceModifierRecord`) and `combine` (record composition, not calculation). Formal OD-8 incorporation into ADR-008 was the prerequisite for implementation; this entry records
  that incorporation. Implementation was subsequently completed and released in `@comity/order@0.10.0`, within the
  same limited scope. The earlier statement that implementation remained separately authorized, and that no
  manifest/dependency/source change had been made, is historical pre-implementation guidance and is superseded by
  that release. This entry supersedes the pre-incorporation governance note at the top of this ADR.
- **Amendment 2 incorporated (2026-11-07)** — `fulfillment → order` and `fulfillment → organization` are registered as
  type-only Capability Exceptions in the closed register and in the machine-readable register (19 edges). The Commerce edge
  budget is raised from 8 to 9. `schemaVersion` stays `1`.
- **Amendment 3 incorporated (2026-11-08)** — `entitlement → organization` is registered as a type-only Capability
  Exception in the closed register and in the machine-readable register (20 edges). The Commerce edge budget is raised
  from 9 to 10. `schemaVersion` stays `1`. Authority: owner decision OD-G2.
- **Completed** — Search Contract Isolation (Phase 15). The Candidates for Removal `catalog → search`, `taxonomy → search`, `content → search` were removed: repository `search()` methods were relocated to the search-owned `SearchPort<TProjection>` contract in `@comity/search`, and the Application/Composition layer (e.g., `@comity/storefront`) composes `ProductRepository` + `SearchPort<ProductProjection>` where required.
- **Completed** — Phase 4 (HTML/Storefront HTTP decoupling). The Infrastructure Contract Exceptions `html → http` and `storefront → http` were removed: `@comity/html` returns rendering-only output (`HtmlOutput`) instead of `HttpResponse`, and `@comity/storefront` resolves context from a transport-neutral `StorefrontContextInput` instead of `HttpRequest`.
- Infrastructure Contract Exceptions remain registered in ADR-008 and are tracked as future extraction candidates. Any extraction work requires a dedicated ADR. Only `router → http` remains registered.
- **Enforce the closed register.** Repository architecture validation MUST verify:
  - every Core Module dependency edge exists in ADR-008;
  - unregistered Core-to-Core dependencies fail validation;
  - Adapter dependency rules are validated separately through ADR-007.

## Scope

This ADR concerns:

- the definition of the exception model;
- the closed dependency register;
- the classification of each existing Core-to-Core dependency.

This ADR does NOT concern:

- Adapter rules (Technology and Integration Adapters are unchanged);
- Kernel / Primitives rules;
- Application-layer rules;
- the internal implementation of any Core Module.

## References

- Canonical [`layering-policy.md`](../layering-policy.md) §2.2 — Core Modules MUST NOT depend on other Core Modules unless explicitly allowed.
- Canonical [`dependency-graph-policy.md`](../layering-policy.md) §8 (consolidated into `layering-policy.md`) — Layered dependency model and forbidden edges. The rendering/HTTP rule has been tightened in Phase 4: rendering modules no longer reference HTTP contract types (the former registered type-only references were removed).
- Canonical [`public-api.md`](../public-api.md) §1 — Package classification.
- Package manifests and `src/` import graph — dependency evidence (`packages/*/package.json`, `packages/*/src/**/*.ts`).
- ADR-007 — Integration Adapter category (unchanged; Integration Adapter dependencies are governed by ADR-007, not this ADR).
