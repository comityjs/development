# ADR-029 — Repository Optimistic Concurrency: Versioned Aggregates and the `conflict` Reason

> **Provenance:**
> - Canonical owner: comity-development
> - Raised by: Commerce Foundation v0 prerequisite **C1** (`commerce/docs/architecture/resolution/`)

**Status:** Proposed

## Context

Comity repositories persist aggregate state through `save`. The only existing contract for `save` is the `@comity/order` remark that implementations
"MUST treat this as upsert: if the order id already exists the stored order is overwritten" (`order/src/contracts/order-repository.ts`). Every other
repository (`customer`, `identity`, `address`, `auth`, `inventory`) is silent on concurrent writers. The result is **last-write-wins**: two actors
that load the same aggregate and save different changes silently lose one of them.

`RepositoryErrorReason` has no way to express this failure. Its reasons are `invalid_data | access_denied | service_unavailable | protocol_error |
unknown` (`primitives/src/errors/repository.ts`); none describes "your copy is stale".

Last-write-wins is tolerable for low-stakes state. It is not tolerable for aggregates that carry money or rights (orders with payment facts,
entitlements, invoices, subscriptions): a lost write there is a financial or access defect, not a stale cache. The Commerce Foundation therefore
requires a concurrency mechanism before any such aggregate is persisted in production, and it cannot supply one itself because both the error
reason and the `save` semantics belong to Comity.

### Verified repository facts

- `RepositoryErrorReason` has no conflict reason; `REPOSITORY_ERROR_HTTP_STATUS` and `REPOSITORY_ERROR_MESSAGES` are exhaustive `Record`s over it.
- No repository contract in `community/packages/*/src/contracts` references a `version`. `save` returns `Promise<Result<void, RepositoryError>>` everywhere
  (`auth`, `address`, `identity`, `order`, `inventory`, `customer`).
- `@comity/primitives` defines no `Repository` interface; each Core Module owns its repository contract. `docs/standards/domain-modeling.md` §6–§8
  defines the shared conventions (minimal API, `Result<T, RepositoryError>`, not-found is not an error).
- `errors.md` §10: adding a `reason` is a MINOR bump.
- `@comity/sql` exposes `atomicBatch`/`SqlTransaction`; this ADR does not require its use.

## Problem statement

Define a portable optimistic-concurrency contract such that:

1. A stale write is detected and rejected rather than silently overwriting newer state.
2. The aggregate and the repository have separate, non-overlapping responsibilities.
3. Existing repositories and aggregates are unaffected until they opt in.
4. No persistence technology is prescribed.

## Decision

### 1. A new repository error reason: `conflict`

`RepositoryErrorReason` gains `conflict`. Message `"Conflict"`; HTTP hint `409` (a hint, per `errors.md` §5). `RepositoryError.code` becomes
`repository:conflict`. This is an additive change (MINOR). `conflict` means: *the write was rejected because the persisted state is not the state the
caller based the write on* (or, for an insert, because the identity already exists).

### 2. Opt-in "versioned aggregate" contract

An aggregate participates by declaring `version: number` in its `State` (`docs/standards/domain-modeling.md` §4). Participation is opt-in; aggregates
without `version` keep their present behaviour. The rules below apply only to repositories of participating aggregates ("versioned repositories").

`version` is persistence-concurrency metadata. It is not business data (it is absent from the aggregate's `Data`), not history (ADR-017), and not an
event (ADR-015).

### 3. Aggregate contract

1. `version` is a non-negative safe integer, read-only.
2. A newly created, **not yet persisted** aggregate has `version: 0`. `0` means "never persisted".
3. **Hydration** restores the persisted version **verbatim** (ADR-001: hydration performs no validation or normalisation).
4. The aggregate **never increments** its version, on any mutation, on any path. Only the repository does.
5. After a successful `save` the in-memory aggregate **keeps the version it had before the save** and is therefore stale. A caller that needs to write
   again must rehydrate (`getById`) or otherwise refresh the aggregate. `save` continues to return `Result<void, RepositoryError>`.

### 4. Repository contract (`save` on a versioned repository)

Let *supplied* be the aggregate's `version` and *stored* the persisted version for the same identity (within the same tenant/context scope the
repository already applies).

| Situation | Outcome |
|---|---|
| No stored record, supplied = `0` | **Insert**; stored becomes `1`; success |
| No stored record, supplied ≠ `0` | `repository:conflict`; nothing persisted |
| Stored record exists, supplied = `0` | `repository:conflict` (identity already exists); nothing persisted |
| Stored record exists, supplied = stored | **Update**; stored becomes supplied + 1; success |
| Stored record exists, supplied ≠ stored | `repository:conflict`; nothing persisted |

Guarantees (normative):

1. **Exactly one increment per successful save.** A save never increments by more than one and never without persisting.
2. **A failed save leaves persisted state unchanged**, including every row/document of a multi-part aggregate. The version check and the state write are
   one atomic unit.
3. **Concurrent writers with the same expected version:** at most one succeeds; every other receives `repository:conflict`.
4. **Concurrent creates of the same identity:** at most one succeeds; every other receives `repository:conflict`.
5. The check is **compare-and-set**, not read-then-write: an adapter that reads the version and then writes in separate, non-atomic steps does not
   conform.
6. A `repository:conflict` is **never retried inside the repository**. Whether to reload and retry is an application decision.
7. Infrastructure failures keep their existing reasons (`service_unavailable`, `protocol_error`, `unknown`); they never masquerade as `conflict`.

### 5. What the contract does not prescribe

Column type, conditional `UPDATE ... WHERE version = ?`, document-store conditional writes, locks, or any use of `atomicBatch`. Technology Adapters
choose the mechanism; the contract is the table and guarantees above. Adapters SHOULD ship against a shared conformance test suite covering the five
table rows and guarantees 2–4.

### 6. Responsibility split

| Concern | Owner |
|---|---|
| Carrying `version`, restoring it on hydration | Aggregate (Core Module) |
| Deciding to increment, comparing, atomicity, producing `conflict` | Repository implementation (Technology Adapter / Application) |
| Reload-and-retry, user-facing conflict handling | Application |
| Deciding what a business-level conflict means | Application / domain policy (not this ADR) |

## Alternatives considered

| Alternative | Reason rejected |
|---|---|
| Aggregate increments `version` on each mutation | N mutations in one unit of work would yield N increments with no relation to persistence; defeats "once per successful save" and lets a caller forge the expected version |
| `updatedAt` as the concurrency token | Clock-fragile; millisecond collisions and skew cause false accepts/conflicts; also forbidden as a trusted time source in domain logic |
| Pessimistic locks | Couples persistence to request lifetime; hostile to serverless and edge runtimes |
| Domain-level `stale_version` reason in each module | A second vocabulary for one failure; the repository is the layer that detects it |
| `saveWithVersion(aggregate, expected)` / `VersionedRepository<T>` | Two persistence methods for one aggregate; the aggregate already carries `version` (rejected in ADR-002's spirit: no new generic repository abstraction) |
| Make `save` return the new aggregate or new version | Changes the `Result<void, …>` signature of every repository; deferred (see Unresolved questions) |
| Keep last-write-wins | Silently loses concurrent changes; unacceptable for money and rights |

## Consequences

**Positive:** one error, one mechanism, one rule set; aggregates without `version` are untouched; the failure is explicit and testable.

**Negative:** versioned adapters need an atomic conditional write (not every store makes this trivial); callers must rehydrate after a save; every
versioned repository needs the conformance tests.

## Compatibility and migration

- Adding `conflict` is a MINOR change to `@comity/primitives` (`errors.md` §10). Exhaustive `Record<RepositoryErrorReason, …>` maps inside Comity
  (message, HTTP status) must gain the new key in the same change; external exhaustive switches over the reason become non-exhaustive (documented).
- No existing repository changes behaviour. `OrderRepository.save` keeps its upsert remark until `Order` adopts `version`; replacing that remark with
  §4 is part of the Order change that introduces `version` (Commerce Phase A), not part of accepting this ADR.
- `docs/standards/domain-modeling.md` §6 (repository contracts) and §8 (errors) gain a short "versioned repositories" paragraph at acceptance.
- `@comity/primitives` is the only package changed by the error reason. No ADR-008 edge is added.

## Affected packages and consumers

`@comity/primitives` (error reason); `@comity/order` and every future versioned aggregate (`entitlement`, `billing`, `subscription`); all Technology
Adapters that persist those aggregates. Commerce depends on this ADR for any persisted write path that mutates money or rights.

## Relationship to existing ADRs

- **ADR-001** (creation vs hydration): `version: 0` is the creation value; hydration restores verbatim.
- **ADR-002** (repository vs domain command): `save` still persists a transition decided elsewhere; the version check is a persistence concern and
  decides nothing about the transition.
- **ADR-017** (state vs history vs events): `version` is neither history nor an event.
- **ADR-013** (Order consolidation): unchanged; Order adopts `version` as a state field.

## Unresolved questions

1. Should `RepositoryError.details` carry the supplied and stored versions for diagnostics? (The existing `details` shape is `{ repository, operation }`.)
2. Should `save` eventually return the new version (or the refreshed aggregate) to spare a reload? Out of scope here because it changes every repository
   signature.
3. `remove` on a versioned aggregate: should it require the version? Deferred to the first versioned aggregate that exposes `remove` (Order exposes none).
4. Whether the conformance suite lives in `@comity/sql` testing utilities or in each adapter package.
