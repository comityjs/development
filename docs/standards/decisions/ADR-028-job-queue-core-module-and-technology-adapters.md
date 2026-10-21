# ADR-028 — Job Queue Core Module and Technology Adapters

> **Provenance:**
> - Canonical owner: comity-development

**Status:** Accepted

## Context

Comity provides no job queue capability. An application that needs to defer work
— sending an email, rendering a document, calling a slow third-party API — must
either adopt a queue library directly inside application code or hide it behind
application-local abstractions no other package can reuse.

Adopting a queue library directly in the Application layer is a
dependency-direction defect. The Application becomes bound to one technology's
API surface, identifier type, retry vocabulary, and error model; replacing the
queue technology then requires rewriting application code.

Comity already resolves this class of problem for other technologies:

| Capability | Core Module | Technology Adapters |
| --- | --- | --- |
| HTTP | `@comity/http` | `@comity/http-hono`, `@comity/http-fetch` |
| SQL | `@comity/sql` | `@comity/sql-kysely` |
| Caching | `@comity/cache` | `@comity/cache-kv`, `@comity/cache-redis` |
| GraphQL | `@comity/graphql-client` | `@comity/graphql-client-fetch`, `@comity/graphql-client-ws` |
| Markup | `@comity/html` | `@comity/html-react`, `@comity/html-preact` |
| Command line | `@comity/cli` | `@comity/cli-commander` |

This ADR introduces the equivalent for job queues. It is modelled on **ADR-022
(CLI Core Module and Technology Adapter)**, the most recent precedent for adding
a Core Module together with its Technology Adapter.

### Problem statement

Define a technology-independent job queue capability such that:

1. Application code depends on Comity contracts and never on a queue library.
2. Any queue technology can be bound by a replaceable Technology Adapter.
3. The contract does not conceal differences in capability or guarantee between
   queue technologies.
4. No queue library and no queue-specific type enters the Core Module.
5. Worker startup and shutdown remain under Application control.

### Verified repository facts

These facts were verified against the checkout during preparation of this ADR.
They are recorded because several decisions below depend on them.

- All 51 runtime packages are `0.9.0`; every package is MIT-licensed; all
  declare `engines.node >= 24`.
- `comity.layer` classification in use: `primitives` (1), `kernel` (1),
  `composition` (1), `core` (31), `technology-adapter` (17),
  `integration-adapter` (0).
- `@comity/sql` exports `.`, `./errors`, `./observers` and depends only on
  `@comity/primitives`.
- `@comity/sql-kysely` (`technology-adapter`, `implements: "@comity/sql"`)
  exports only `.`; it has no module descriptor and registers nothing in the
  DI container; the Application calls `createKyselySqlClient`.
- `@comity/cli` exports `.`, `./errors` and depends only on
  `@comity/primitives`; `@comity/cli-commander` exports only `.` and is wired
  by the Application.
- `@comity/cache`, `@comity/storage` and `@comity/graphql-client` export
  `./setup` and therefore depend on `@comity/composition`.
- Eleven Core Modules declare `@comity/composition`; all eleven export
  `./setup`; the twenty Core Modules without `./setup` do not.
- The dependency-cruiser rule generated for Core Modules by
  `@comity-dev/dependency-rules` allows only `primitives`, `kernel` and Core
  peers — `composition` is not in that allow-list — yet the configured
  dependency gate currently reports zero violations for the repository.
- ADR-008 §Decision 5: "New Core-to-Core dependencies require an ADR before
  introduction."
- ADR-008's register contains no queue-related edge.
- Error-export convention, verified across all 31 Core Modules: 20 declare an
  `./errors` subpath, and each of those 20 exports its module error class from
  that subpath. Only 1 of the 31 — `@comity/cli` — exports an error class as a
  value from the root barrel; the other 30 do not. `@comity/search` re-exports its
  error from an internal `contracts/error` module through `./errors`, which is a
  file-layout detail rather than a different convention.
- `public-api.md` §3.1 lists `/errors` as an allowed sub-entrypoint path —
  "Custom error types | When the package defines domain errors" — while §2.1's
  list of what a Core Module root barrel MUST contain does not mention error
  classes.
- `community/docs/migrations/public-api.md` records `SearchError` as "Exported
  from the intentional `@comity/search/errors` subpath".
- `KernelError("invalid_lifecycle_state")` is the established reason for
  lifecycle misuse, disambiguated by `details.action` and `details.state`
  (`packages/kernel/src/kernel.ts` `#assertLifecycle`). The Kernel throws it from
  synchronous accessors, while `Kernel.seal()`, `start()` and `stop()` report
  through `Result`.
- No root barrel of any Core Module exports a per-operation options type; none of
  the queue-shaped contracts (`@comity/sql`, `@comity/cache`, `@comity/storage`)
  exposes a caller-supplied cancellation, retry, delay, priority, or
  deduplication option. `HttpContext.signal` is supplied by the transport, not
  passed by a caller to an operation.
- No queue, job, or worker capability exists anywhere in the repository; no
  queue library (`pg-boss`, `bullmq`, `bee-queue`, `imqueue`) is present in
  `pnpm-lock.yaml` or `node_modules`.
- `docs/.documentation/manifest.yaml` governs which public documents exist and
  requires a plan plus human approval before a new document is written.

## Architectural Constraints

This decision is constrained by existing, already-ratified rules. None is
relaxed here.

| Constraint | Source |
| --- | --- |
| Dependencies flow inward only; Core Modules MUST NOT depend on Adapters | `layering-policy.md` §2.2, §2.3 |
| Core Modules MUST NOT depend on other Core Modules unless registered in ADR-008 | `layering-policy.md` §2.2, ADR-008 §Decision 2-5 |
| A Technology Adapter implements exactly **one** Core Module and may depend on it | `adapters.md` §"Technology Adapters", `layering-policy.md` §2.3 |
| A Technology Adapter MUST declare every Core Module it consumes as a `peerDependency`; technology libraries are `peerDependencies` | `adapters.md` §"Core Module peer dependency" |
| A Technology Adapter MUST normalize external errors into module errors | `layering-policy.md` §2.3 |
| Adapters MUST NOT contain business, domain, or module logic | `adapters.md` §2 |
| All errors extend `BaseError`; `code` is `namespace:reason`; reasons are a finite union; one public error class per module | `errors.md` §2-§10 |
| `setup` MUST be pure, MUST NOT start servers, MUST NOT access environment globals; Modules MUST NOT control application startup or shutdown | `modules.md` §3, §5 |
| Application-owned wiring; raw `Kernel` is never passed to module capability registration; no child DI containers per execution context | ADR-025 §3, §14 |
| The Application owns the executable entry point | ADR-022 §"Bin/Executable Ownership" |
| Reliability is a declaration, not a property of a bus | ADR-016 |
| Core Modules MUST not use `Date`, `performance`, `crypto`, or `Math.random` except in the documented observational allow-list | `layering-policy.md` §7 |
| Core Modules expose contracts; implementations belong to Adapters or Applications | `AGENTS.md` "Contracts vs Implementations" |
| New abstractions are permitted only to enable dependency inversion, enable testability, or replace conditional dispatch with polymorphism | `AGENTS.md` "New Abstraction Criteria" |

## Decision

### D1 — Worker lifecycle ownership is Application-owned

The Application owns worker startup and shutdown.

- `@comity/queue` defines the worker contract. It does **not** start workers,
  schedules, poll loops, or any background processing.
- `@comity/queue` does **not** export a Composition module descriptor and does
  **not** provide a `./setup` subpath.
- Technology Adapters expose factories (or an equivalent infrastructure
  initialization API) that the Application calls.
- The Application decides when to create, start, and stop a worker. Resource
  teardown is adapter-owned (D9).

**Rationale.** A queue worker is a long-running background consumer, equivalent
in lifecycle terms to a server. `modules.md` §5 states that `setup` MUST NOT
start servers, and `modules.md` §3 states that Module Authors MUST NOT control
application startup or shutdown. Placing worker startup in a Composition
descriptor would therefore contradict a ratified standard. The Application-wired
factory is the established pattern for exactly this situation: `@comity/sql-kysely`
and `@comity/cli-commander` both export factories only, and ADR-022 assigns the
executable entry point to the Application.

**Consequence.** No `@comity/queue:configuring` hook is introduced. A module
descriptor would also require a DI token and a `ModuleMeta` dependency on
`@comity/composition`; D2 shows that no current requirement justifies either.

### D2 — Package classification and dependency boundary

`@comity/queue` is a **Core Module** classified as:

```json
"comity": { "layer": "core" }
```

| Aspect | Decision |
| --- | --- |
| Dependencies | `@comity/primitives` only |
| `peerDependencies` | none |
| `@comity/composition` | excluded |
| Other Core Modules | excluded — no Core-to-Core edge |
| `./setup` subpath | excluded |
| Queue libraries | excluded |
| `node:*` runtime imports | excluded |
| Public technology-native types | excluded |

**Rationale.** Shipping a Composition module descriptor — not being a Core
Module — is what requires `@comity/composition`. The distinction is:

- A **Core capability contract** is a set of interfaces, value semantics, and a
  module-owned error class that Technology Adapters and Applications implement.
  `@comity/sql`, `@comity/cli`, `@comity/search` and `@comity/validation` are
  contracts of this kind and depend only on `@comity/primitives`.
- A **Composition Module** is additionally an object satisfying `ModuleMeta`
  (`name`, `version`, `dependsOn`, `setup`) that `load()` resolves, orders,
  seals, and initializes. `@comity/cache`, `@comity/storage` and
  `@comity/graphql-client` ship that descriptor *in addition to* their contract.
  The descriptor is what pulls in `@comity/composition`.

`@comity/queue` needs to be the first kind and not the second. Its realization
is a factory call performed by the Application, not a service registered during
composition. No requirement of this decision needs `ModuleMeta`.

**Consequence.** No Core-to-Core dependency is introduced, so no ADR-008
register entry is required and ADR-008 §Decision 5 is not triggered.

**Documented conflict (not silently resolved).** The rule generated by
`@comity-dev/dependency-rules` for the `core` layer permits only `primitives`,
`kernel` and Core peers; `composition` is absent from that allow-list, yet eleven
Core Modules depend on `@comity/composition` and the configured dependency gate
reports zero violations. The rule text and the enforced behaviour therefore
disagree. This decision does not depend on that gap: by excluding
`@comity/composition` entirely, `@comity/queue` conforms to both readings. If a
future requirement makes a `./setup` descriptor necessary, the dependency-rule
discrepancy MUST be resolved first, through a separate change owned by
comity-development, and the dependency rule's allow-list and `LAYER_PROFILES`
comment updated accordingly.

### D3 — Error model and publication semantics

`@comity/queue` exposes **one** public error class, `QueueError`, extending
`BaseError`, with `code` of the form `` `queue:${QueueErrorReason}` `` and a
finite reason union. No second error class is introduced; `errors.md` §9 forbids
error-class explosion and requires a new `reason` on the module's single class
where the semantic meaning differs.

The reason set is derived from the distinctions this ADR must make, and from
nothing else:

| Required distinction | Reason | Why it is a distinct reason |
| --- | --- | --- |
| Adapter configuration is unusable | `invalid_configuration` | Recovery is to correct configuration; mirrors `SqlErrorReason` |
| The queue is not known to this adapter | `unknown_queue` | Recovery is to name the queue correctly, not to retry |
| The request itself is invalid | `invalid_request` | Rejected before publication; retrying unchanged cannot help |
| Publication refused — known negative outcome | `enqueue_rejected` | The technology did not accept the job |
| Publication outcome cannot be determined | `enqueue_outcome_unknown` | MUST remain distinguishable from a known failure (D5) |
| A handler failed during execution | `handler_failed` | Post-publication failure; distinct recovery from a publication failure |
| `start()` or `stop()` could not complete | `lifecycle_failed` | Operational failure; disambiguated by `details.operation` |
| An operation is not valid in the worker's current state | `invalid_lifecycle_state` | Lifecycle misuse; mirrors `KernelError("invalid_lifecycle_state")` |

`QueueErrorMeta` follows the `SqlErrorMeta` shape: `details.operation`
(`"enqueue" | "execute" | "start" | "stop"`), `details.adapter`, and a
non-canonical `details.retriable` that MUST NOT be used for application logic.
`meta.reason` is the machine-readable discriminator.

**Reasons deliberately reviewed and rejected.** Each of the following was
considered, found unreachable or redundant in the first version, and removed:

- **`unsupported_option`** — removed. The first version has no portable option
  surface a caller can request (D8), so no core operation can produce this
  reason. Retaining it would reserve an error for a hypothetical future option.
  It returns only if a genuine portable option is introduced by a later ADR.
- **A separate "not running" reason** — removed. Publication is not worker-scoped
  (a producer is neither started nor stopped by this contract), and `stop()` is
  specified as idempotent, so calling it on a worker that is not running resolves
  successfully rather than failing.
- **A separate "already running" reason** — folded into
  `invalid_lifecycle_state`. Both `start()` on a running worker and `start()` on
  a stopped worker are the same class of failure — a requested transition the
  state model does not allow — and the Kernel precedent uses one reason for all
  lifecycle misuse, disambiguated by details rather than by reason proliferation.

No reason is retained merely because a state machine has a state in which it is
unused.

**Error boundary.**

- Adapter-native errors are translated into `QueueError` inside the adapter.
  Technology-native error types MUST NOT escape an adapter's public API. This
  mirrors `mapSqlError` in `@comity/sql-kysely`, which is internal and maps abort
  signals and driver codes to `SqlErrorReason` values with `retriable` hints.
- Expected operational failures are returned as `Result` failures carrying
  `QueueError`.
- Every core operation in the first version reports failure through `Result`:
  `enqueue`, `start()`, and `stop()` resolve with a `QueueError` failure and never
  reject. This includes lifecycle misuse: `invalid_lifecycle_state` is returned,
  not thrown, because `start()` and `stop()` are asynchronous operations whose
  single failure channel is their `Result`. The Kernel's reason is reused, its
  surfacing is not: the Kernel throws from synchronous accessors
  (`services.define` after seal) while `Kernel.start()` and `Kernel.stop()` report
  through `Result`.
- The first version defines no guard or registration API, so no throw path
  exists. If a later version adds one, `errors.md` §"Guard/assert errors" applies:
  a documented guard MAY throw a `QueueError`, and a thrown value MUST extend
  `BaseError`. Raw `Error`, native runtime error subclasses, and thrown literals
  remain forbidden in every case.
- No parallel error-handling mechanism is introduced. `Result`, `BaseError`,
  `isSuccess`/`isFailure` and `toSafePayload` remain the only vocabulary.

**Publication semantics.** Four outcomes are distinct and must never be
conflated:

1. **Accepted** — `success`, wrapping an accepted job representation.
2. **Refused** — failure with `enqueue_rejected`; the technology did not accept
   the job.
3. **Indeterminate** — failure with `enqueue_outcome_unknown`.
4. **Failed after acceptance** — reported during execution as `handler_failed`,
   never as a publication failure.

A timeout or a connection loss during publication MUST NOT be reported as
`enqueue_rejected`. It MUST be reported as `enqueue_outcome_unknown`, because the
job may already have been accepted. Treating an indeterminate outcome as a
confirmed non-publication is the defect this reason exists to prevent.

### D4 — Queue and job identifiers

`@comity/queue` uses **semantic string aliases**, not value objects:

```ts
export type QueueName = string;
export type QueueJobId = string;
```

**Rationale.**

- The required properties of these identifiers are *prohibitions*, not
  invariants requiring enforcement at construction: technology-independent,
  opaque, no format requirement, no UUID requirement, no numeric requirement, no
  implied global uniqueness. A value object would add a class, a
  `Result`-returning factory, an `InvalidIdentifierError` dependency, and a
  serialization boundary, while enforcing at most non-emptiness.
- `AGENTS.md` "New Abstraction Criteria" permits a new abstraction only when it
  enables dependency inversion, enables testability, or replaces conditional
  dispatch with polymorphism. None applies to a non-empty string alias.
- Comity's identifier value objects (`OrderId`, `UserId`, `TenantId`) exist where
  a domain invariant must hold at construction. A queue name carries no such
  invariant.
- Precedent for string identifiers in capability contracts: `SqlQuery.statement`
  is `string`; `Cache.get(key: string)`; `Storage.get(key: string)`;
  `CliCommand.name` is `string`. Precedent for opaque boundary payloads:
  `CliCommandArgs = Record<string, unknown>`, which the CLI Core explicitly does
  not interpret.

**Non-guarantees (normative).** The contract does not require UUIDs, numeric
identifiers, or any particular serialization format. The contract does not imply
global uniqueness. A queue name identifies a queue within one configured queue
technology; a job identifier is unique within its queue for as long as the
technology retains it. Identifiers are opaque: the contract, and applications
using it, MUST NOT parse them or derive meaning from their structure.

**Serialization boundary.** An adapter MUST expose identifiers to the contract as
`string`, converting its technology's native identifier at the adapter boundary.
The technology's native identifier type MUST NOT appear in an adapter's public
API.

**Reopening condition.** Should a future requirement demand an enforced
invariant — for example a validated, non-empty queue name — a value object may be
introduced only as a deliberate, separately reviewed public API change with a
migration path for existing callers.

### D5 — Delivery and reliability guarantees

The contract MUST NOT promise exactly-once execution.

- Handler execution MAY be repeated. A job MAY be redelivered after a worker
  crash, an expired claim, a stalled-job recovery, or an interrupted shutdown.
- Applications MUST design handlers so that repeated invocation is harmless.
  Idempotence is an application responsibility, not a contract guarantee.
- No universal ordering guarantee exists.
- No deduplication guarantee exists. The contract offers no deduplication or
  idempotency-key option in its first version (see Contract Scope).
- Retry counts, retry delays, backoff shape, scheduling, priority,
  acknowledgment, and claim/visibility semantics remain technology-dependent and
  are not part of the portable contract.
- The contract exposes no operation that waits for execution.

**Meaning of a successful publication.** A `success` result from a publication
operation means the queue technology accepted the job, subject to that adapter's
documented persistence semantics. It does not mean the job was delivered, that a
handler ran, or that execution completed. A job MAY never execute.

| Outcome | Meaning |
| --- | --- |
| `success` | The technology accepted the job, per the adapter's documented persistence semantics |
| `enqueue_rejected` | The technology refused the job; treat it as not queued |
| `enqueue_outcome_unknown` | Acceptance cannot be determined; treat it as possibly queued |
| `handler_failed` (or adapter-reported execution failure) | The job was accepted and its execution failed |

Publication acceptance and subsequent execution are separate events with
separate error surfaces, and the contract MUST keep them separate.

**Scope boundary with ADR-016.** ADR-016 establishes that "reliability is a
declaration, not a property of the bus", that a `DomainEventPublisher` is an
Application-boundary contract, and that a broker-backed transport behind that
publisher is future work governed by ADR-007 and requiring its own ADR. This ADR
does not create a reliable event transport and does not satisfy ADR-016's future
work. `@comity/queue` is a **job execution capability**; it MUST NOT be presented
as a substitute for, or a component of, reliable business-event publication.

### D6 — Worker lifecycle semantics

The worker contract reuses two of the Kernel's lifecycle states — `running` and
`stopped` — and exposes two explicit transitions. It adds a `created` state,
because a worker is constructed before it can be started and has no equivalent of
the Kernel's `open` and `sealed` configuration phases:

- `start()` enables job consumption for that worker.
- a successful `stop()` prevents the worker from accepting additional work,
  allows in-flight handler invocations to settle, and resolves after they settle.

The core promises **only** that two-phase intent. It does not promise:

- forcible termination;
- a universal shutdown timeout;
- that `stop()` is bounded in time;
- that a job in flight during shutdown will not be redelivered;
- that a handler which ignores cancellation will be interrupted.

An adapter MUST document its actual shutdown behaviour, including whether the
technology offers a bound, whether a forced variant exists, and what happens to a
job that outlives the drain window. Differences observed in vendor documentation
(external evidence, not repository evidence; not a contract guarantee) are:

| Technology | Shutdown behaviour documented by the vendor |
| --- | --- |
| pg-boss | `stop()` stops background processing and polling workers and, by default, waits gracefully for active jobs; `offWork(name, { wait: false })` is the explicit non-waiting variant |
| BullMQ | `worker.close()` stops picking up new jobs and waits for current jobs to be processed or failed; the documentation states it does not time out by itself |
| Bee-Queue | `close(timeout?)` accepts an optional bound; stalled-job recovery requires the application to schedule `checkStalledJobs` |
| imqueue | `stop()` stops consuming only; `destroy()` releases connections and the watcher lock |

Because these differ, the portable promise is the two-phase intent plus the
adapter's documented limitation — not a uniform shutdown guarantee.

**Supported transitions.** The first version defines exactly one supported
sequence per worker instance:

```text
created ──start()──► running ──stop()──► stopped   (terminal)
   │
   └── stop() ──► stopped                          (terminal, idempotent)
```

| From | Operation | Outcome |
| --- | --- | --- |
| `created` | `start()` | Attempts to begin consumption; `success` moves the worker to `running`, otherwise failure `lifecycle_failed` (`operation: "start"`) |
| `created` | `stop()` | Idempotent; `success`, moves to `stopped`; nothing was consumed |
| `running` | `start()` | failure `invalid_lifecycle_state` |
| `running` | `stop()` | Stops accepting new work, drains in-flight handlers, `success` once they settle, moves to `stopped` |
| `stopped` | `stop()` | Idempotent; `success` |
| `stopped` | `start()` | failure `invalid_lifecycle_state` |

**Restart.** `stopped` is terminal for that worker instance. The first version
does not guarantee, and does not define, restart of a stopped worker. To consume
again, the Application creates a new worker through the adapter's factory. This
is a deliberate limit of the first version rather than a prohibition on the
capability: an adapter MAY be able to support restart, but it MUST NOT do so
through `start()` on a stopped worker, because that would contradict the state
table above. Re-opening restart as a portable guarantee requires a later ADR;
until then an adapter that offers it exposes it as documented, non-portable
behaviour.

**Shutdown failure.** `stop()` never rejects; it resolves with a `Result`. When
the adapter cannot confirm that in-flight work settled, it resolves with a
failure carrying `lifecycle_failed` and `details.operation: "stop"`. Neither half
of the two-phase guarantee is confirmed by such a failure: the adapter could not
confirm that acceptance stopped, and could not confirm that in-flight invocations
settled. After such a failure the contract makes no promise about the worker's
state: the caller MUST NOT rely on the worker for further consumption and SHOULD
create a new worker.
Further `stop()` calls remain safe to make, but they make no additional promise.
The contract does not define a shutdown deadline, so a `stop()` that never
resolves is a technology or handler defect rather than a contract violation.

**Ownership.** The Application creates workers, calls `start()`, and calls
`stop()` as part of its own shutdown sequence. Because `stop()` cannot promise
that an interrupted job will not run again, handler idempotence (D5) is a
requirement of the design, not a preference.

### D7 — Public exports follow the `/errors` convention

The root barrel exports the contracts only, as types:
`QueueName`, `QueueJobId`, `QueueJobData`, `QueueAcceptedJob`, `QueueJob`,
`QueueJobHandler`, `QueueProducer`, `QueueWorker`, `QueueWorkerConfig`.

`QueueError`, `QueueErrorReason` and `QueueErrorMeta` are exported from the
`./errors` sub-entrypoint, not from the root barrel.

**Rationale.** `public-api.md` §3.1 lists `/errors` as an allowed sub-entrypoint
for "Custom error types … when the package defines domain errors", and §2.1's
mandatory root-barrel contents for a Core Module do not include error classes.
The convention is near-universal in practice: 30 of the 31 Core Modules do not
export an error class from the root barrel, and the migration record explicitly
describes the search error as exported from "the intentional
`@comity/search/errors` subpath". `@comity/cli` is the single exception and is not
a reason to invent a second convention for a new package. Adding the error class
to the root barrel as well would create two import paths for one symbol with no
demonstrated requirement.

**Consequence.** `@comity/queue` declares exactly two subpaths, `.` and `./errors`
(plus `./package.json`). No other subpath is added without a concrete
requirement.

### D8 — The first version exposes no portable option surface

`enqueue` takes a queue name and a payload, and nothing else. There is no options
object, and therefore no cancellation signal, no retry configuration, no delay,
no priority, no deduplication key, and no technology-specific option in the
portable contract.

**Rationale.** An options object added "to reserve space" is an abstraction
without a consumer, which `AGENTS.md` "New Abstraction Criteria" forbids. It would
also have to be filled with semantics no single technology agrees on, and each
member would need a documented non-guarantee. Verifying the repository shows no
precedent to lean on: no queue-shaped contract exposes a caller-supplied
cancellation, retry, delay, priority or deduplication option, and
`HttpContext.signal` is supplied by the transport rather than passed by a caller.

**Where technology-specific configuration goes.** An adapter's own factory may
accept configuration — including per-technology publication defaults — without
making that configuration part of this contract, mirroring
`createKyselySqlClient(options)` in `@comity/sql-kysely`. An adapter MAY also
extend its own producer with additional, non-portable capability, provided it
remains assignable to `QueueProducer` and documents the addition as
non-portable. Application code that uses such an extension is, by definition, not
portable, which is the honest and visible outcome.

**Consequence.** With no portable option surface, no core operation can produce
`unsupported_option`; that reason is therefore not part of the reason union (D3).
An adapter MUST NOT silently ignore a technology option it cannot honour; it
simply has no portable options to honour in the first version.

### D9 — Resource disposal remains adapter-owned

The first version defines no portable disposal, close, or teardown operation.

**Rationale.** No portable obligation is demonstrated. The lifetime of a
connection, pool, or client belongs to the technology and to the adapter that
constructed it, and the technologies differ irreconcilably: pg-boss and BullMQ
manage their clients internally, while imqueue separates `stop()` from
`destroy()`. Adding a core `dispose()` would either be unenforceable or force a
teardown model onto adapters that do not need one. `@comity/sql` and
`@comity/cache` set the precedent: they define contracts with no disposal member
and leave resource ownership to the adapter and the Application.

**Distinction from `stop()`.** `stop()` governs *consumption*: it stops the worker
accepting new work and waits for in-flight handlers. It does not govern *resources*.
Stopping every worker does not necessarily release the technology's connections,
and disposing connections does not necessarily stop workers. The two concerns
stay separate and explicit.

**Consequence.** An adapter that needs explicit teardown exposes it as documented,
non-portable behaviour on its own factory result. The Application owns the
decision to call it, as part of the same shutdown sequence that calls `stop()`.



### Core Module

```text
@comity/queue
  comity.layer        : "core"
  license             : MIT
  dependencies        : { "@comity/primitives": "workspace:*" }
  peerDependencies    : none
  exports             : "." and "./errors" (D7)
  technology adapter dependencies : none
  queue library dependencies      : none
  module descriptor / "./setup"   : none
  background processing           : none
```

Dependency direction:

```text
Application
    ↓
@comity/queue-<technology>   (Technology Adapter)
    ↓
@comity/queue                (Core Module)
    ↓
@comity/primitives
```

The barrel policy is fixed by D7 and follows `@comity/sql`: contracts are exported
as types from the root barrel, and `QueueError` with its reason union and metadata
type is exported from `./errors`.

### Technology Adapters

Adapters are **not created by this ADR**. Candidate packages, for planning only:

- `@comity/queue-pg-boss`
- `@comity/queue-bullmq`
- `@comity/queue-bee-queue`

Each adapter MUST:

1. declare `"layer": "technology-adapter"` and
   `"implements": "@comity/queue"`;
2. declare `@comity/queue` in **both** `dependencies` and `peerDependencies`, and
   the queue technology library in `peerDependencies`, per `adapters.md`;
3. expose their own factory — accepting their own configuration type — that
   creates values typed by this Core Module's `QueueProducer` and `QueueWorker`
   contracts; no Composition module descriptor and no core-defined options type,
   unless a later ADR decides otherwise (D1, D2, D8);
4. translate technology-native errors into `QueueError`, keeping the mapping
   internal, on the pattern of `@comity/sql-kysely`'s internal `mapSqlError`;
5. not leak technology-native types through its portable public API, on the
   pattern of `@comity/sql-kysely`'s stated rule that its public API does not
   expose Kysely types;
6. keep technology-specific configuration and technology-specific capability on
   the adapter's own factory rather than in the portable contract, and document
   every such addition as non-portable (D8). An adapter whose producer carries a
   non-portable extension MUST remain assignable to `QueueProducer`. Silent
   acceptance of an option an adapter cannot honour is forbidden;
7. document its persistence semantics, its shutdown behaviour, and any
   restriction the technology imposes on payloads or identifiers;
8. be tested against the real queue technology, not against mocks, per
   `testing.md` §3.3 ("Adapters exist to test real integration");
9. contain no business, domain, or module logic.

### imqueue — excluded from initial adapter scope

The previous audit raised two concerns. Both are corroborated by vendor
documentation (`@imqueue/core` 3.5.4, `imqueue.org`):

- **Architectural mismatch.** `@imqueue` describes itself as a
  "message-queue RPC framework" in which "the queue name … is the service class
  name" and clients are generated from a running service. Its documented
  guarantees are request/response oriented ("Streaming none — request/response
  only"). It exposes no per-job retry policy, delayed-execution option, priority,
  deduplication, job state, batching, or dead-letter concept. A
  "register a handler for a queue" model — the shape this contract requires — is
  not part of its documented surface.
- **Licensing.** The vendor states the licence as "GPL-3.0-only, or a commercial
  licence for closed-source distribution". Every `@comity/*` package in this
  repository is MIT-licensed.

**Decision: imqueue is out of scope for the initial adapter set.** Reconsidering
it requires (a) an explicit maintainer licensing review concluding that
distribution is compatible, and (b) an architectural argument that the
contract's handler-registration model maps onto an RPC service model without
distortion. This ADR asserts neither. It is not a legal conclusion; it records an
unresolved governance concern and the decision to exclude rather than assume.

## Contract Scope

### In scope — the first version

| # | Responsibility | Contracted by |
| --- | --- | --- |
| 1 | Queue identification | `QueueName` |
| 2 | Job identification | `QueueJobId` |
| 3 | Publishing a job with an opaque, typed payload | `QueueProducer.enqueue(name, data)` |
| 4 | Returning an accepted job representation | `QueueAcceptedJob` |
| 5 | Defining a handler | `QueueJobHandler` |
| 6 | Registering a handler with a worker | `QueueWorkerConfig` |
| 7 | Starting and stopping a worker | `QueueWorker.start` / `QueueWorker.stop` |
| 8 | Reporting operational failures through the established error model | `QueueError` with `Result` |

Two supporting types exist to serve those responsibilities and carry no
additional behaviour: `QueueJobData` (the opaque payload constraint) and
`QueueJob` (the job as delivered to a handler).

The Core Module therefore exports exactly nine contract types, plus the three
error symbols on `./errors` (D7). The design specification fixes their
signatures. A type that cannot be traced to one of the eight responsibilities
above is out of scope by construction.

### Out of scope — explicitly excluded

| Excluded | Reason |
| --- | --- |
| Job scheduling and recurring jobs | No portable semantics; technologies differ (pg-boss scheduling, BullMQ job schedulers, Bee-Queue none) |
| Workflow orchestration, job dependencies, DAGs, flows | `architecture-principles.md` §11 places workflow composition in Applications and Integration Adapters |
| Universal queue administration (list, purge, pause, drain) | A large, technology-shaped surface with no portable meaning |
| Dashboard APIs | Operational tooling, not a contract |
| Batch processing | Only some technologies support it; pg-boss makes batching a handler-shape decision |
| Dead-letter management | Technology-specific and not portable |
| Priority scheduling | Not universally supported; Bee-Queue documents it as a non-feature |
| A universal retry policy | Retry counts and backoff differ per technology; a common policy would be a false guarantee |
| A universal deduplication contract | Three incompatible mechanisms exist; a common contract would over-promise |
| Exactly-once execution | Not deliverable over these technologies |
| Technology-specific options in core interfaces | Would couple the contract to one technology |
| Automatic worker startup | Contradicts D1, `modules.md` §5, and ADR-025 |
| A canonical in-memory queue implementation | Not required by any decision here, and easily mistaken for a guarantee |
| Observability APIs and event hooks | Deferrable; `@comity/sql/observers` shows a separate, type-only observer contract is the right shape when a real consumer exists |

Each excluded capability MAY be added later, either as a justified Core extension
under a new ADR or as a technology-specific API exposed by one adapter and
documented as non-portable. No future API is designed here.

## Rejected Alternatives

### A1 — A Composition Module descriptor with a `./setup` subpath

Rejected. It would require `@comity/queue` to depend on `@comity/composition`,
introduce a DI token, and — to be coherent — start or regulate a background
worker from module initialization. That contradicts `modules.md` §3 and §5 and
ADR-025 §14. It would also place the queue on the wrong side of the generated
Core dependency rule, which does not list `composition` as an allowed Core peer
(D2).

### A2 — A value object for `QueueName` and `QueueJobId`

Rejected. It adds a class, a `Result`-returning factory, and an
`InvalidIdentifierError` dependency while enforcing at most non-emptiness, and it
violates the "New Abstraction Criteria" test in `AGENTS.md`. Recorded as a
reopening condition in D4 rather than foreclosed.

### A3 — A capability-descriptor object (`QueueCapabilities`)

Rejected for the first version. Comity's established mechanism for a
technology-divergent capability is an optional member on the contract plus a
specific error reason when it is unavailable: `StorageStore.getSignedUrl?` with
`StorageError("signed_url_failed")`, and `GraphqlTransport.subscribe?` with
`GraphqlClientError("subscription_not_supported")`. A descriptor object would be
a new abstraction serving no verified consumer, and the first version has no
portable optional capability for it to describe at all (D8). Adapters document
their capability differences instead.

### A4 — A universal retry/delay/deduplication option set

Rejected. The three candidate technologies express these differently and with
different guarantees; imqueue expresses none of them. A single option shape would
promise portability that does not exist. Such configuration stays on the
adapter's own factory, where a technology's real semantics can be expressed
honestly (D8).

### A5 — Delivering this as an Application-level abstraction, or inside an existing Core Module

Rejected. An Application-level abstraction is not reusable and keeps the
dependency-direction defect it is meant to remove. Folding a queue capability
into an existing Core Module (for example `@comity/sql`) would put two
capabilities in one package and violate the single-responsibility rule in
`AGENTS.md` "Module Philosophy".

### A6 — Deferring the whole decision until a consumer exists

Rejected by the same reasoning as ADR-022: the capability is required, and the
cost of deciding late is that applications bind themselves to a queue library
first. ADR-015 §R7 (no speculative APIs) is respected by keeping this contract to
the eight responsibilities in scope rather than by postponing the boundary.

### A7 — An options object on `enqueue`, reserved for future needs

Rejected (D8). An options object with no member a caller can rely on is an
abstraction without a consumer, which `AGENTS.md` "New Abstraction Criteria"
forbids. The specific members considered and rejected for the first version were
`signal` (cancellation), retry configuration, delayed execution, priority, and a
deduplication key:

- `signal` had no demonstrated requirement, and its cited precedent does not hold
  on inspection: `HttpContext.signal` is supplied by the HTTP transport, not
  passed by a caller to an operation.
- Retry, delay, priority, and deduplication have no shared semantics across the
  candidate technologies; each would need its own documented non-guarantee, and
  imqueue supports none of them.

Removing this option surface is what makes `unsupported_option` unreachable, which
is why that reason was also removed (D3). A portable option may be added later
only under a new ADR that demonstrates a requirement and specifies its semantics.

### A8 — Core-defined producer/worker factory and technology aggregate

Rejected for the first version. An earlier draft defined `QueueTechnology`
(producer plus worker factory) and `QueueWorkerFactory` in the Core Module. Both
were removed: they carry no behaviour, and neither maps to any of the eight
in-scope responsibilities. Their only benefit was a single polymorphic call site
for creating workers, which the adapter-owned factory already provides — exactly
as `@comity/sql-kysely` exposes `createKyselySqlClient` without `@comity/sql`
defining a client-factory contract. Core owns the shapes the Application programs
against (`QueueProducer`, `QueueWorker`, `QueueWorkerConfig`); the adapter owns
construction.

## Consequences

**Positive**

- Application code depends on Comity contracts and stays independent of any
  queue library.
- Queue technology becomes replaceable without touching Application code, as
  HTTP, SQL, caching, GraphQL, rendering, and CLI already are.
- The Core Module acquires no queue dependency, no infrastructure
  initialization, no background processing, and no Core-to-Core edge.
- No ADR-008 register change is required.
- The contract states its non-guarantees explicitly, so capability differences
  between queue technologies surface as errors rather than as silent behaviour
  change.
- Worker lifecycle stays where `modules.md` and ADR-025 require it: the
  Application.

**Negative / trade-offs**

- The Application must perform wiring a module descriptor would have automated:
  constructing the technology, creating the worker, and connecting process
  shutdown (for example `SIGINT`/`SIGTERM`) to `worker.stop()`.
- The first version is deliberately small, so ad-hoc needs such as retries,
  delayed execution, and deduplication are not expressible at all through the
  portable contract; an adapter may expose them, but application code using them
  is not portable (D8).
- Technology-specific capability lives on each adapter's own factory, so two
  adapters may express the same idea differently; the difference stays visible
  rather than being normalized away.
- Callers see `string` identifiers with no compile-time protection against
  passing a job identifier where a queue name is expected.

## Risks and Limitations

| # | Risk | Mitigation recorded by this ADR |
| --- | --- | --- |
| 1 | The contract is shaped by one technology and becomes a false common denominator | Only the eight in-scope responsibilities are contracted; technology-specific capability stays on the adapter's own factory and is documented as non-portable (D8) |
| 2 | An indeterminate publication outcome is treated as a confirmed failure, producing duplicate or lost work | `enqueue_outcome_unknown` is a required reason, and D3 forbids reclassifying a timeout or connection loss as `enqueue_rejected` |
| 3 | Exactly-once is implied by retry or deduplication wording | D5 forbids exactly-once claims; deduplication is excluded from the first version |
| 4 | `stop()` is read as a delivery guarantee | D6 enumerates what `stop()` does not promise, including redelivery of an interrupted job |
| 5 | The contract is mistaken for ADR-016's reliable event transport | D5 states the scope boundary explicitly |
| 6 | A worker is started from module initialization because that would be convenient | D1, `modules.md` §5, and ADR-025 §14 forbid it |
| 7 | The Core Module acquires `@comity/composition` by imitation of other Core Modules | D2 records the Core-contract versus Composition-Module distinction and the documented rule/enforcement discrepancy |
| 8 | Technology-native types leak through an adapter's public API | Adapter requirement 5, and the `@comity/sql-kysely` precedent |
| 9 | Identifier format assumptions leak into application code | D4 makes identifiers opaque and forbids parsing them |
| 10 | `enqueue_outcome_unknown` is omitted because it is inconvenient for a first release | It is part of the required reason set in D3; removing it later would be a breaking semantic change |
| 11 | An excluded capability is re-added without review | Out-of-scope items require a new ADR or a documented, non-portable adapter API |
| 12 | An application depends on an adapter's non-portable extension and can no longer switch queue technologies | D8 requires every such extension to be documented as non-portable, and the Core Module exports no options surface that could imply otherwise |

**Known limitations of this ADR**

- It does not select a first adapter technology; that is the next decision, not
  this one.
- It does not resolve the dependency-rule discrepancy documented in D2.
- Capability differences are recorded from vendor documentation, not from
  executed integration tests; the first adapter must confirm them empirically.
- It fixes the export surface (D7) but not the exact JSDoc wording of each
  contract, which is an implementation detail.

## Testing and Migration Implications

**Testing.** Per `testing.md`:

- Core Module: unit tests with boundary mocks only for declared dependencies. The
  Core Module has exactly one declared dependency (`@comity/primitives`) and no
  runtime behaviour to mock; its tests are pure — error construction per reason,
  `code` shape, frozen `meta`, `Result` narrowing, and identifier opacity.
  Error tests MUST assert type, `code`, and `reason`, and MUST NOT assert exact
  messages (`testing.md` §11).
- Technology Adapter: integration tests against the real queue technology, never
  mocks (`testing.md` §3.3). Adapters need a running queue technology; no
  container-harness dependency exists in this repository and none is introduced
  by this decision.
- A reusable conformance suite for adapters is desirable but MUST NOT become a
  public subpath of `@comity/queue`, because `public-api.md` forbids non-contract
  helper exports and `src/internal/` is never exported. If it is built, it
  belongs in development tooling or in each adapter's own test tree.

**Migration.** None. The package does not exist; no existing contract, package,
or consumer is modified by this decision.

## References

- ADR-003 — HTTP Client Extraction
- ADR-007 — Multi-Context Adapter Architecture
- ADR-008 — Explicit Core Module Composition Exceptions
- ADR-015 — Domain Events Boundary
- ADR-016 — Event Publication Reliability Policy
- ADR-021 — Capability vs Workflow
- ADR-022 — CLI Core Module and Technology Adapter
- ADR-025 — Execution Context Composition via Application-Owned Wiring
- ADR-026 — Architecture Validator Authoritative Classification
- `layering-policy.md` — §2.2 Core Modules, §2.3 Adapters, §7 determinism, §8 minimal surface, §9 dependency graph rules
- `adapters.md` — adapter responsibilities, boundaries, packaging, Core Module peer dependency
- `errors.md` — `BaseError`, `namespace:reason`, finite reasons, error-explosion rule, versioning
- `modules.md` — Module Authors, metadata contract, setup semantics, promotion criteria
- `public-api.md` — package classification, root barrel rules, forbidden subpaths
- `testing.md` — testing by layer, mock policy, error testing
- `architecture-principles.md` — §11 capability vs workflow
- `repository-ownership.md` — ADR and standards ownership
- `AGENTS.md` — change classification, new abstraction criteria, contracts vs implementations, module philosophy

## Scope

This ADR governs:

- the classification of `@comity/queue` as a Core Module, and of
  `@comity/queue-<technology>` packages as Technology Adapters;
- the package and dependency boundaries of the Core Module, including the
  exclusion of `@comity/composition`, of queue libraries, and of a `./setup`
  subpath;
- the ownership of worker lifecycle by the Application;
- the public export surface of the Core Module, including the root barrel versus
  the `./errors` sub-entrypoint (D7);
- the decision that the first version exposes no portable option surface and no
  portable disposal operation (D8, D9);
- the error model, publication semantics, and the required reason set;
- the decision to use semantic string aliases for queue and job identifiers;
- the reliability guarantees and non-guarantees of the contract;
- worker `start()` and `stop()` semantics, their limits, and the supported
  lifecycle transitions;
- the required behaviour of Technology Adapters;
- the exclusion of imqueue from the initial adapter set;
- the initial scope of the contract and what is excluded.

This ADR does NOT govern:

- the choice, ordering, or implementation of any specific adapter;
- the internals of any queue technology, or its version support;
- an observability contract for queues;
- queue administration, scheduling, batching, or workflow capabilities;
- the addition of a portable option surface, worker restart after `stop()`, or a
  portable disposal operation — each requires a new ADR;
- reliable business-event publication (ADR-016, ADR-007);
- unrelated cleanup of existing packages, contracts, or documentation.

