# ADR-029 — Repository Optimistic Concurrency: Versioned Aggregates and the `conflict` Reason

> **Provenance:**
>
> - Canonical owner: comity-development
> - Raised by: Commerce Foundation v0 prerequisite **C1** (`commerce/docs/architecture/resolution/`)
> - **Accepted:** 2026-11-12, by architecture-owner decision, recorded on the owner's explicit authorization given in the ADR-029 finalization task (owner-approved decisions D1–D7 and D9 incorporated below). No separate approval artifact (named approver, meeting minutes) exists in the repository; this line records that authorization and nothing more. The ADR was `Proposed` from 2026-11-04 until this date, and an earlier uncommitted working-tree draft that read `Accepted` carried no approval record and is superseded by this text.
> - **What acceptance does not do.** It accepts an architectural decision. It does **not** establish that any implementation conforms, does **not** complete the evidence items G5 and G6 (§7), does **not** record a human sign-off, and does **not** close or alter any application production gate (for example Commerce C1). Those are separate states, kept separate in §7.
> - Detailed test mechanics live in `docs/standards/repository-conformance.md`, not here.

**Status:** Accepted

## Context

Comity repositories persist aggregate state through `save`. When this ADR was proposed (2026-11-04) the only existing contract for `save` was the `@comity/order` remark that implementations "MUST treat this as upsert: if the order id already exists the stored order is overwritten". Every other repository (`customer`, `identity`, `address`, `auth`, `inventory`) was silent on concurrent writers. The result is **last-write-wins**: two actors that load the same aggregate and save different changes silently lose one of them.

`RepositoryErrorReason` had no way to express this failure (`invalid_data | access_denied | service_unavailable | protocol_error | unknown`); none describes "your copy is stale".

Last-write-wins is tolerable for low-stakes state. It is not tolerable for aggregates that carry money or rights (orders with payment facts, entitlements, invoices, subscriptions): a lost write there is a financial or access defect, not a stale cache. The Commerce Foundation therefore requires a concurrency mechanism before any such aggregate is persisted in production, and it cannot supply one itself because both the error reason and the `save` semantics belong to Comity.

### Verified repository facts

State at the proposal (2026-11-04): no repository contract referenced a `version`; `save` returned `Promise<Result<void, RepositoryError>>` everywhere; `@comity/primitives` defines no `Repository` interface (each Core Module owns its repository contract; `docs/standards/domain-modeling.md` §6–§8 defines the shared conventions); `errors.md` §10 makes adding a `reason` a MINOR bump; `@comity/sql` exposes `atomicBatch`/`SqlTransaction` and this ADR does not require their use.

State verified at acceptance (2026-11-12, by source inspection):

- `RepositoryErrorReason` includes `conflict` and `RepositoryErrorMeta.details` carries optional `suppliedVersion` / `storedVersion` (`community/packages/primitives/src/errors/repository.ts`), published in `@comity/primitives` 0.9.4.
- The shared conformance kit is exported as `@comity/primitives/testing` (`runVersionedRepositoryTests`, `ConformanceError`, and the adapter interfaces).
- `OrderRepository.save` documents the versioned contract of §4 (`community/packages/order/src/contracts/order-repository.ts`); `MemoryOrderRepository` and the SQL adapter `@comity/order-sql` (`commerce/adapters/order-sql`, PostgreSQL and SQLite/D1 dialects) implement it.
- Whether those implementations **conform**, and at which evidence level, is not asserted here; see §7.

## Problem statement

Define a portable optimistic-concurrency contract such that:

1. A stale write is detected and rejected rather than silently overwriting newer state.
2. The aggregate and the repository have separate, non-overlapping responsibilities.
3. Existing repositories and aggregates are unaffected until they opt in.
4. No persistence technology is prescribed.

## Decision

### 1. A new repository error reason: `conflict`

`RepositoryErrorReason` gains `conflict`. Message `"Conflict"`; HTTP hint `409` (a hint, per `errors.md` §5). `RepositoryError.code` becomes `repository:conflict`. This is an additive change (MINOR; see Compatibility for the release actually made). `conflict` means: _the write was rejected because the persisted state is not the state the caller based the write on_ (or, for an insert, because the identity already exists).

### 2. Opt-in "versioned aggregate" contract

An aggregate participates by declaring `version: number` in its `State` (`docs/standards/domain-modeling.md` §4). Participation is opt-in; aggregates without `version` keep their present behaviour. The rules below apply only to repositories of participating aggregates ("versioned repositories"). `version` is persistence-concurrency metadata: not business data (absent from the aggregate's `Data`), not history (ADR-017), not an event (ADR-015).

### 3. Contracts of the aggregate, of `save`, and of the error

#### 3.1 Aggregate

1. `version` is a non-negative safe integer, read-only.
2. A newly created, **not yet persisted** aggregate has `version: 0`. `0` means "never persisted".
3. **Hydration** restores the persisted version **verbatim** (ADR-001: hydration performs no validation or normalisation).
4. The aggregate **never increments** its version, on any mutation, on any path. Only the repository does.

#### 3.2 `save` result and the in-memory aggregate

`save` returns `Result<void, RepositoryError>`; it does **not** return a replacement aggregate or the new version. After a successful `save` the in-memory aggregate **keeps the version it had before the save** and is therefore stale. A caller that needs the updated persisted version, or needs to write again, **reloads** the aggregate through the repository (`getById`).

#### 3.3 `RepositoryError.details` for a `conflict`

`details` retains the repository and operation context and carries:

- `suppliedVersion`: **always present**; the version the caller supplied.
- `storedVersion`: **optional, best-effort, non-authoritative.** It is a diagnostic observation only. An adapter may read it after the failed compare-and-set, so it can reflect a later state than existed when the CAS failed. Failing to obtain it MUST NOT replace, mask or alter the `conflict`. No adapter is required to perform an additional diagnostic read, and **no consumer may rely on `storedVersion` being present or base a correctness decision on it.**

The authoritative concurrency semantics are the table and guarantees of §4. `storedVersion` is not part of them.

### 4. Repository contract (`save` on a versioned repository)

Let _supplied_ be the aggregate's `version` and _stored_ the persisted version for the same identity (within the same tenant/context scope the repository already applies).

#### 4.1 Decision table

| Situation                               | Outcome                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| No stored record, supplied = `0`        | **Insert**; stored becomes `1`; success                            |
| No stored record, supplied ≠ `0`        | `repository:conflict`; nothing persisted                           |
| Stored record exists, supplied = `0`    | `repository:conflict` (identity already exists); nothing persisted |
| Stored record exists, supplied = stored | **Update**; stored becomes supplied + 1; success                   |
| Stored record exists, supplied ≠ stored | `repository:conflict`; nothing persisted                           |

#### 4.2 Invalid supplied versions

A supplied version that is not valid is rejected **before any persistence operation** with `repository:invalid_data`, never `conflict`. Invalid means: negative; fractional; `NaN`; positive or negative infinity; outside the safe-integer range; or **`Number.MAX_SAFE_INTEGER`**. `Number.MAX_SAFE_INTEGER` is rejected although it is a safe integer because a successful save would have to store `MAX_SAFE_INTEGER + 1`, which is not representable while preserving the safe-integer invariant; accepting it would permit a write that cannot be recorded.

The three classifications are distinct and never interchangeable:

| Input                                                  | Reason                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Invalid version                                        | `invalid_data`                                                  |
| Valid version that does not match the persisted state  | `conflict`                                                      |
| Infrastructure failure                                 | its own reason (`service_unavailable`, `protocol_error`, `unknown`) |

This is the behaviour of the existing implementations (`MemoryOrderRepository.save`, `SqlOrderRepository.save`) and their tests; it is recorded here as the contract, not introduced by it.

#### 4.3 Guarantees (normative)

1. **Exactly one increment per successful save.** A save never increments by more than one and never without persisting.
2. **A failed save leaves persisted state unchanged**, including every row/document of a multi-part aggregate. The version check and the state write are one atomic unit.
3. **Concurrent writers with the same expected version:** at most one succeeds; every other receives `repository:conflict`.
4. **Concurrent creates of the same identity:** at most one succeeds; every other receives `repository:conflict`.
5. The check is **compare-and-set**, not read-then-write: an adapter that reads the version and then writes in separate, non-atomic steps does not conform.
6. A `repository:conflict` is **never retried inside the repository**. Whether to reload and retry is an application decision.
7. Infrastructure failures keep their existing reasons; they never masquerade as `conflict`.

#### 4.4 `remove`

`remove` on a versioned aggregate, if exposed, SHOULD require the supplied version to match the stored version, otherwise `repository:conflict`, with the check and the deletion one atomic unit. Deferred to the first versioned aggregate that exposes `remove` (Order exposes none).

### 5. Persistence invariants and legacy data

**What the contract does not prescribe:** column type, conditional `UPDATE … WHERE version = ?`, document-store conditional writes, locks, or any use of `atomicBatch`. Technology Adapters choose the mechanism; the contract is §4.

**Fresh-schema invariants (relational adapters).** A new installation creates the persisted version as:

- `NOT NULL`;
- constrained `version >= 1` (`CHECK`);
- with **no database default** that supplies it.

The repository explicitly supplies `1` on the first successful save. The constraints guarantee the invariant without silently correcting an adapter that omits it, so such an omission surfaces as a constraint violation.

**Existing versionless data.** The invariants above describe fresh installations. If an adapter has data that predates versioning, that data MUST be given a valid version **before versioned repository operations are enabled** against it. This ADR does not define that migration: table names, column types and the statement are specific to each adapter's schema, so a concrete backfill belongs in that adapter's documentation, written against its actual schema. There is no universal backfill statement.

### 6. Mandatory adapter conformance

Every adapter claiming support for versioned repository concurrency **SHALL** execute the shared conformance suite of `@comity/primitives/testing`. The kit is implemented in the Primitives layer, has no dependency on `@comity/sql`, `@comity/order` or any test framework, and is not duplicated in a new package.

The following cases are **mandatory**: **TC-1, TC-1c, TC-2a, TC-2b, TC-2c, TC-3, TC-4, TC-5.** A mandatory case SHALL NOT be skipped, filtered or weakened because an existing adapter does not pass it.

**TC-6 (multi-record atomicity) is capability-dependent.** It is mandatory for an adapter that declares multi-record atomicity, that is, whose `save` writes a root and related records in one atomic operation. An adapter that does not declare it SHALL report that capability and TC-6 as **unsupported** in its evidence record.

The adapter also SHALL supply the cases the kit does not contain (invalid versions, §4.2). The behaviour of every case, the fixture lifecycle, capability declaration and reporting, and adapter integration are defined in **`docs/standards/repository-conformance.md`**; this ADR defines the obligation and the identifiers only.

### 7. Evidence requirements

Black-box cases cannot prove every guarantee: a repository that reads then writes may pass them under a benign schedule, and one that retries a conflict internally looks identical from outside. Conformance therefore also requires:

- **G5, evidence for Guarantee 5 (compare-and-set).** The executed persistence operation, from a real run, showing the version predicate and the increment in one operation; for multi-row saves, the transaction boundary; TC-1c and TC-5 run against a real engine through independent connections.
- **G6, evidence for Guarantee 6 (no transparent retry).** Review of the `save` path, or an equivalent statement-count test, showing a single conditional write attempt.

(G5 and G6 are this ADR's evidence items for Guarantees 5 and 6. They are not the production gates of any application design.)

**Evidence is reproducible and executable.** Acceptable evidence is **(a)** automated tests that assert the actual database operations and concurrency guarantees, executed in CI; or **(b)** when CI cannot execute them, a **dated execution record** stating the database engine and version, the runtime and environment, the exact tests, the result and the limitations. **Source inspection alone is insufficient** to establish G5.

Evidence is always stated at one of four levels, and a claim never borrows a higher one:

1. **in-memory** behaviour;
2. **emulator** conformance (for example Miniflare/workerd D1) — this may support adapter conformance at the emulator level and is **never** proof of production Cloudflare D1 behaviour;
3. **real-engine** conformance (for example PostgreSQL);
4. **production-environment** verification — a separate production-readiness activity, outside this ADR.

**Review is not sign-off.** Review evidence prepared by an author or an automated reviewer is not an independent human sign-off. A sign-off that has not been given remains **visibly pending**; a deferred requirement does not become optional. The vocabulary for reporting is fixed in the conformance standard (§8): _architectural decision accepted_, _implementation conforms_, _adapter conformance evidence available_, _production verification complete_, _gate pending_, _gate deferred with explicit conditions_.

This ADR records no evidence status. Evidence records live with each adapter.

### 8. Responsibility split

| Concern                                                           | Owner                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Carrying `version`, restoring it on hydration                     | Aggregate (Core Module)                                      |
| Deciding to increment, comparing, atomicity, producing `conflict` | Repository implementation (Technology Adapter / Application) |
| Reload-and-retry, user-facing conflict handling                   | Application                                                  |
| Deciding what a business-level conflict means                     | Application / domain policy (not this ADR)                   |
| Test mechanics and evidence reporting                             | `docs/standards/repository-conformance.md`                   |

## Alternatives considered

| Alternative                                                       | Reason rejected                                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregate increments `version` on each mutation                   | N mutations in one unit of work would yield N increments with no relation to persistence; defeats "once per successful save" and lets a caller forge the expected version |
| `updatedAt` as the concurrency token                              | Clock-fragile; millisecond collisions and skew cause false accepts/conflicts; also forbidden as a trusted time source in domain logic                                     |
| Pessimistic locks                                                 | Couples persistence to request lifetime; hostile to serverless and edge runtimes                                                                                          |
| Domain-level `stale_version` reason in each module                | A second vocabulary for one failure; the repository is the layer that detects it                                                                                          |
| `saveWithVersion(aggregate, expected)` / `VersionedRepository<T>` | Two persistence methods for one aggregate; the aggregate already carries `version` (rejected in ADR-002's spirit: no new generic repository abstraction)                  |
| Make `save` return the new aggregate or new version               | Changes the `Result<void, …>` signature of every repository; rejected (§3.2)                                                                                              |
| A separate package for the conformance kit                        | The kit needs only Primitives types and has no other dependency; `@comity/primitives/testing` already exists                                                              |
| Keep last-write-wins                                              | Silently loses concurrent changes; unacceptable for money and rights                                                                                                      |

## Consequences

**Positive:** one error, one mechanism, one rule set; aggregates without `version` are untouched; the failure is explicit and testable; conformance is mandatory and uniform.

**Negative:** versioned adapters need an atomic conditional write (not every store makes this trivial); callers must reload after a save; every versioned repository must run the conformance suite and keep evidence; `storedVersion` cannot be relied on for diagnostics.

## Compatibility and migration

- Adding `conflict` is a MINOR change to `@comity/primitives` under `errors.md` §10. **The published `@comity/primitives@0.9.4` was released as PATCH.** That is a documented deviation, ratified without a retroactive republish, in `docs/standards/reviews/2026-11-12-primitives-0.9.4-release-deviation.md`. Future additions of an error reason follow the MINOR rule.
- Exhaustive `Record<RepositoryErrorReason, …>` maps inside Comity (message, HTTP status) gain the new key in the same change; external exhaustive switches over the reason become non-exhaustive.
- Aggregates and repositories that do not opt in change nothing. `OrderRepository.save` adopted the contract of §4 when `Order` adopted `version`.
- `docs/standards/domain-modeling.md` §6 carries a short "versioned repositories" paragraph that links here.
- Legacy versionless data: see §5; adapter-specific instructions live in the adapter's documentation.
- `@comity/primitives` is the only package changed by the error reason and hosts the conformance kit. No ADR-008 edge is added.

## Affected packages and consumers

`@comity/primitives` (error reason, conformance kit); `@comity/order` and every future versioned aggregate (`entitlement`, `billing`, `subscription`); all Technology Adapters that persist those aggregates. Commerce depends on this ADR for any persisted write path that mutates money or rights.

## Relationship to existing ADRs

- **ADR-001** (creation vs hydration): `version: 0` is the creation value; hydration restores verbatim.
- **ADR-002** (repository vs domain command): `save` still persists a transition decided elsewhere; the version check is a persistence concern and decides nothing about the transition.
- **ADR-017** (state vs history vs events): `version` is neither history nor an event.
- **ADR-013** (Order consolidation): unchanged; Order adopts `version` as a state field.

## Resolved questions

1. **Should `RepositoryError.details` carry the versions?** `suppliedVersion` always; `storedVersion` optionally and non-authoritatively (§3.3).
2. **Should `save` return the new version or aggregate?** No. `save` keeps `Result<void, RepositoryError>`; callers reload (§3.2).
3. **`remove` on a versioned aggregate?** Deferred to the first versioned aggregate that exposes it (§4.4).
4. **Where does the conformance suite live?** `@comity/primitives/testing`; no new package (§6).
5. **Are invalid versions a conflict?** No: `invalid_data` before any persistence operation, `MAX_SAFE_INTEGER` included (§4.2).
6. **Is conformance optional?** No. Mandatory cases TC-1, TC-1c, TC-2a, TC-2b, TC-2c, TC-3, TC-4, TC-5; TC-6 for adapters declaring multi-record atomicity (§6).

## References

- `docs/standards/repository-conformance.md`: conformance mechanics and evidence reporting.
- `docs/standards/domain-modeling.md` §6, §8: repository contracts and errors.
- `docs/standards/errors.md` §10: error versioning rules.
- `docs/standards/reviews/2026-11-12-primitives-0.9.4-release-deviation.md`: release deviation record.
- `community/packages/primitives/src/errors/repository.ts`, `community/packages/primitives/src/testing/`: error reason and conformance kit.
- `community/packages/order/src/contracts/order-repository.ts`, `community/packages/order/src/repositories/memory.ts`: Order contract and in-memory implementation.
- `commerce/adapters/order-sql/`: SQL implementation and its evidence records.
