# Comity Standard — Repository Conformance (Versioned Repositories)

> **Provenance:**
>
> - Canonical owner: comity-development
> - Governing decision: **ADR-029** (`docs/standards/decisions/ADR-029-repository-optimistic-concurrency.md`)
> - Implemented by: `@comity/primitives/testing` (`community/packages/primitives/src/testing/`)

## Status

**Approved** together with ADR-029 (see the acceptance record there). This standard changes no guarantee of ADR-029.

## 1. Purpose and division of responsibility

| Document                          | Owns                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ADR-029**                       | The architectural guarantees, the versioned `save` contract, the mandatory conformance **obligation**, the mandatory case **identifiers**, the capability-dependent TC-6 rule and the **evidence levels**.     |
| **This standard**                 | How conformance is exercised: kit interfaces, fixture lifecycle and cleanup, the behaviour of each case, capability declaration and unsupported-case reporting, adapter integration, and evidence reporting.   |
| **`@comity/primitives/testing`**  | The executable form. The **signatures** in `types.ts` are authoritative. This standard describes obligations on the members; it does not restate the signatures and is not a second definition of the contract. |

If this standard and ADR-029 disagree on a guarantee, ADR-029 wins and this standard is the defect.

## 2. The kit

- Entry point: `runVersionedRepositoryTests(adapter, framework, suiteName)` from `@comity/primitives/testing`; `ConformanceError` signals a broken precondition (a setup save that did not succeed, an unloadable record), never a contract violation.
- The kit has **no dependency** on a test framework, on `@comity/sql`, or on `@comity/order`. The consumer supplies a `TestFrameworkAdapter` (`describe`, `it`, `assert`, `assertEqual`, and optionally `skip`). The call returns a `ConformanceReport` (§5).
- It uses the real `Result` and `RepositoryError` types and classifies outcomes only from the `Result` discriminant and `error.meta.reason`; it does not use promise rejection or a parallel error vocabulary.
- The kit is the only shared conformance mechanism. Do not fork it per adapter and do not create a second package for it.

## 3. Obligations on the adapter

An adapter that claims support for versioned repository concurrency **SHALL** run the whole suite from its own test file and **SHALL NOT** skip, filter or weaken a mandatory case.

| Case      | Status                                | What it establishes                                                                                          |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **TC-1**  | mandatory                             | First persistence: supplied `0`, nothing stored → success, persisted version `1`.                            |
| **TC-1c** | mandatory                             | Concurrent creation of one identity: exactly one success, exactly one `conflict`, final version `1`.         |
| **TC-2a** | mandatory                             | No row, supplied ≠ `0` → `conflict`, no row created.                                                         |
| **TC-2b** | mandatory                             | Row exists, supplied `0` → `conflict`, stored row unchanged.                                                 |
| **TC-2c** | mandatory                             | An injected infrastructure failure keeps its own reason, is never `conflict`, persists nothing.              |
| **TC-3**  | mandatory                             | Supplied = stored → success, persisted version = supplied + 1 (exactly once).                                |
| **TC-4**  | mandatory                             | Stale update → `conflict`, stored row unchanged.                                                             |
| **TC-5**  | mandatory                             | Concurrent same-version updates: exactly one success, exactly one `conflict`, version advanced exactly once. |
| **TC-6**  | **capability-dependent** (§5)         | A stale multi-record save leaves **every** affected record unchanged.                                        |

The kit registers each applicable case as one test named `TC-<id>: …`.

Mapping to the ADR-029 decision table (§4.1) and guarantees (§4.3):

| Case  | Decision-table row(s)                           | Guarantee(s) exercised                                       |
| ----- | ----------------------------------------------- | ------------------------------------------------------------ |
| TC-1  | 1 (no stored, supplied `0` → insert, version 1) | 1                                                            |
| TC-1c | 1 concurrent; 3 (the loser sees the identity)   | 4                                                            |
| TC-2a | 2 (no stored, supplied ≠ `0` → conflict)        | —                                                            |
| TC-2b | 3 (stored, supplied `0` → conflict)             | —                                                            |
| TC-2c | outside the table                               | 7                                                            |
| TC-3  | 4 (supplied = stored → update, +1)              | 1                                                            |
| TC-4  | 5 (stale → conflict)                            | 2 (single record); observable part of 5 and 6                |
| TC-5  | 4 and 5 concurrently                            | 1 and 3; observable part of 5 and 6                          |
| TC-6  | 5 (multi-record)                                | 2 (multi-record); observable part of 5                       |

Guarantees 5 and 6 are only partly observable from outside, which is why §7 requires additional evidence for them.

### 3.1 Members the kit cannot work without

`createSharedFixture` (TC-1c, TC-5) and `createFailureInjectionFixture` (TC-2c) are **required members** of the adapter type. Their absence is a compile-time error in the consumer's test file; the kit performs no runtime check and registers no "missing support" test. An adapter that cannot provide them cannot claim conformance. `createMultiRecordAtomicityScenario` is the only optional member (§5).

## 4. Fixture lifecycle, isolation and cleanup

- **One fixture per test.** Every case obtains its own `TestFixture` (`createFixture()`), shared scope (`createSharedFixture()`), failure-injection fixture, or TC-6 scenario. Nothing is reused across cases, so no case observes state left by another and the suite is order-independent.
- **A fixture owns** a fresh repository instance, a fresh context (for example a unique tenant), and `readSnapshot` / `loadAggregate` bound to the same persistence as the repository. `loadAggregate` goes through the repository's public read path and returns an independent instance on every call.
- **Shared scope (TC-1c, TC-5).** `fixtureA` and `fixtureB` have separate repository instances and contexts over the **same** backing store (one map, or one database schema reached through separate connections), and the contexts must resolve to the same tenant (`getTenant` is compared by the kit before each concurrent case). Each scope has its own fresh `sharedIdentity` and is consumed by exactly one case. Concurrency must be real: the two saves are issued together (`Promise.all`); sequential execution is not conformance.
- **Failure injection (TC-2c).** `armSaveFailure()` makes exactly the next `save` fail with a representative infrastructure failure, injected **below** the repository (driver, client or store boundary) so the adapter's own error mapping is exercised. The fixture declares `expectedReason` (`service_unavailable`, `protocol_error` or `unknown`); the kit requires exactly that reason.
- **Cleanup.** Every scope and scenario exposes `dispose()`; the adapter drops what it created (a test schema, a map). Adapters that need a database follow the repository convention: an explicit opt-in such as `TEST_DATABASE_URL`, a dedicated database (never an application database), and a schema per test.

## 5. Capability declaration: TC-6

TC-6 applies only to a repository whose `save` writes a root **and** related records in one atomic operation.

- **Declared.** The adapter implements `createMultiRecordAtomicityScenario`. TC-6 then runs and is **mandatory for that adapter**: it saves a legitimately advanced aggregate, saves a retained stale aggregate, requires `conflict`, and requires `captureFullState()` after the stale save to equal the state after the advance (`statesEqual` must detect insertions, updates and deletions of every affected record, independent of ordering).
- **Not declared.** TC-6 is **not executed**, and it is never reported as passed. `runVersionedRepositoryTests` returns a machine-readable `ConformanceReport` in which TC-6 has `applicability: "unsupported"` (reason: multi-record atomicity not declared) and every mandatory case is `applicable`. If the framework adapter supplies the optional `skip(name, fn)` (for example `it.skip`), the kit also registers `TC-6: unsupported (multi-record atomicity not declared)` through it, so the runner shows it as **skipped**; if `skip` is absent nothing is registered. An empty test that a runner would count as passed is never registered.
- **Result vocabulary.** _passed_: an applicable case was executed and its assertions succeeded; _unsupported_: the capability is not declared and the case was not executed; _failed_: a declared capability did not satisfy the required behaviour. A multi-record adapter that omits the scenario does not satisfy the obligation.
- **Compatibility.** Kit versions up to the published `@comity/primitives@0.9.4` register an **empty** test for an undeclared TC-6, which runners show as passed; that test is not atomicity evidence and must not be counted as such. The `skip` member and the report are published in `@comity/primitives@0.9.5` and later. Adapters that declare TC-6 (both SQL adapters) are unaffected: their TC-6 is an executed test under every kit version.
- **Consequently,** an adapter that does not declare multi-record atomicity **SHALL** state "TC-6 unsupported: <reason>" in its evidence record (§8).

## 6. Cases outside the kit

The kit does not contain the following; ADR-029 requires them of every adapter and each adapter supplies them in its own tests.

- **Invalid supplied versions (ADR-029 §4.2).** `save` with a negative, fractional, `NaN`, infinite, beyond-safe-integer or `Number.MAX_SAFE_INTEGER` version returns `invalid_data` **before** any persistence operation, never `conflict`. The adapter test must assert both the reason and that nothing was persisted or queried for the write.
- **Conflict details (ADR-029 §3.3).** A `conflict` carries `suppliedVersion`; `storedVersion` is optional and non-authoritative, so a test may assert it when the adapter provides it but **MUST NOT** require it.
- **Schema invariants (SQL).** The version column is `NOT NULL`, constrained `>= 1`, with no default (ADR-029 §5).
- **Tenant isolation** where the repository is tenant-scoped.

## 7. Evidence beyond black-box cases (Guarantees 5 and 6)

A repository that reads then writes can pass every case under a benign schedule, and one that retries a conflict internally is indistinguishable from outside. The adapter therefore supplies evidence alongside the passing run. **G5** and **G6** below are ADR-029's evidence items for **Guarantees 5 and 6**; they are not the production gates of any application design.

- **G5, compare-and-set rather than read-then-write.** The executed persistence operation captured from a real run of TC-3 and TC-4 (the logged conditional statement carrying the version predicate and the increment, or the store's native CAS primitive), showing predicate and increment in one operation. A query plan or a description of what a statement "would" do is not evidence. Where `save` writes several rows, the transaction boundary that makes the root CAS and every child write commit or fail together, plus the TC-6 result. TC-1c and TC-5 executed against a real engine through independent connections.
- **G6, no transparent retry of a conflict.** The reviewed `save` path showing one conditional write attempt with no retry loop; confirmation that driver, client and middleware do not re-execute a write rejected by the version predicate; or a statement count from an integration run showing exactly one conditional write attempt per conflicting save. A caller-supplied client that retries is outside what any repository can detect and is recorded as a limitation.
- Black-box cases alone never prove Guarantee 5 or 6. A human review or sign-off of G6 is a governance step recorded separately; **the existence of review evidence is not a sign-off** (§8).

## 8. Reporting evidence

Source inspection alone is **not** evidence of conformance. Evidence is reproducible and is reported at one of these levels; a claim names its level and never borrows a higher one.

| Level                                          | Meaning                                                                                       | Example                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **L1: in-memory**                              | The suite runs against an in-process store.                                                   | `MemoryOrderRepository`                                                  |
| **L2: emulator**                               | The suite runs against an emulator of the engine.                                             | Miniflare/workerd D1. Never proof of production Cloudflare D1 behaviour. |
| **L3: real engine**                            | The suite runs against a real database engine, with real concurrent connections.              | PostgreSQL 16 through `pg`.                                              |
| **L4: production environment**                 | The behaviour is verified in the target production environment.                               | A dedicated production-like D1 database and Workers binding.             |

Each piece of evidence is one of: **(a)** automated tests executed in CI, with the workflow and command named; or **(b)** when CI cannot execute them, a **dated execution record** containing the database engine and version, the runtime and environment, the exact test names or files, the result, and the limitations. A claim is "verified by CI execution" only when a CI run is cited; a workflow file proves what CI is configured to run, not that it ran. Absence of a record is reported as "not verified", never filled in.

Reports use one vocabulary and never merge states: _architectural decision accepted_ · _implementation conforms_ · _adapter conformance evidence available (level)_ · _production verification complete_ · _gate pending_ · _gate deferred with explicit conditions_. Acceptance of ADR-029 is not conformance, and conformance at L1-L3 is not production verification.

## 9. Integration guidance and examples

- **In-memory.** `community/packages/order/src/repositories/__tests__/conformance.test.ts` runs the kit against `MemoryOrderRepository` (shared fixture over one store, failure injection through a faulty store) and adds the adapter-specific cases of §6.
- **SQL.** `commerce/adapters/order-sql/src/dialects/postgres/__tests__/conformance.test.ts` (real PostgreSQL) and `…/sqlite/__tests__/conformance.test.ts` (Miniflare D1) implement the same adapter contract: one schema per test, separate pools/connections for the shared scope, failure injection at the client boundary, and a TC-6 scenario.
- Aggregates are built **only** through the public hydration API (ADR-001); the kit never mutates read-only properties or bypasses the aggregate.
- An adapter's test file invokes `runVersionedRepositoryTests` exactly once per implementation and strategy.
