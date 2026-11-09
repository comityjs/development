# ADR-030 — Payment Initiation Idempotency

> **Provenance:**
> - Canonical owner: comity-development
> - Raised by: Commerce Foundation v0 prerequisite **C3** (`commerce/docs/architecture/resolution/`)
> - **Revised in place (Payment design proposal revision 3).** Identity, number and status are unchanged. The original decision was written for a synchronous
>   `initiate` only. This revision widens the scope from payment *initiation* to **every payment command** (initiation, capture, cancellation; refunds via
>   ADR-031) with one key per operation invocation, adds the unknown-outcome rules and the P5 caller obligation, and closes Q1, Q2 and Q4 of the previous
>   text. The file name and title keep their original wording so existing references stay valid. The lifecycle these rules apply to is defined by
>   **ADR-037**; the ADRs are accepted together.

**Status:** Accepted

## Context

`PaymentProvider.initiate(request)` is the only operation of `@comity/payment`. A `PaymentRequest` is `{ amount: Money; reference?: string }`, where
`reference` is documented as an *"opaque caller-owned reference (e.g., order ID, cart ID, idempotency key)"* (`payment/src/contracts/payment-request.ts`).
Nothing requires it, nothing specifies what a provider must do when it sees the same value twice, and the in-memory provider derives a deterministic
`paymentId` from `reference` without deduplicating anything.

A caller that retries after a timeout, a crash between a command and persisting its outcome, a queue redelivery, or a renewal job re-run cannot know
whether the first attempt had an effect. Without a contract, the retry may charge twice. Webhook deduplication does not help: it deduplicates
*notifications*, not *commands*. ADR-037 adds capture and cancellation (and ADR-031 refunds), each of which has the same retry problem.

### Verified repository facts

- `PaymentRequest.reference` is optional and unspecified; its JSDoc lists "idempotency key" only as an example.
- `PaymentOutcome.paymentId` is optional ("if available"); `PaymentStatus` is `authorized | captured | failed | cancelled`; a provider decline is an
  outcome with status `failed`, not an error.
- `PaymentErrorReason` is `invalid_request | internal_error`.
- `@comity/payment` depends on `@comity/pricing` (registered ADR-008 edge). Order records payment outcomes as owned snapshots and does not import
  `@comity/payment` (`OrderPaymentSnapshot` documentation).
- `@comity/payment` has no operation to look up a payment or its status (added by ADR-037).
- Providers differ: some offer a native idempotency key (typically a separate request header with a bounded retention window), others treat a merchant
  `reference` as a plain label.
- No PSP has been selected in any Comity repository; provider retention windows are therefore **not** known facts.

## Problem statement

Define a stable, portable idempotency contract for payment commands, suitable for checkout, retries and later renewal, that:

1. prevents a duplicate effect (a second charge, capture, cancellation or refund) when the same operation is submitted more than once;
2. promises only what a provider abstraction can honestly uphold;
3. keeps correlation (what the payment is for) separate from deduplication (is this the same operation);
4. defines what an application MUST do when an outcome is unknown, so that a timeout is never mistaken for a failure.

## Decision

### 1. A separate, required idempotency key per operation invocation

Every payment command carries a **required** `idempotencyKey: string`: `PaymentRequest` (initiation), the capture request and the cancel request
(ADR-037), and `RefundRequest` (ADR-031). `reference` stays a caller correlation value (§2a).

**A key identifies one operation invocation, never a payment.** Distinct operations use distinct keys:

- initiation has its own key;
- **each** capture invocation, **each** cancellation invocation and **each individual refund** has its own key.

Keys MUST NOT be shared across operation kinds, and are unique across operation kinds within a provider binding. Reusing an initiation key for a capture or a
refund is a caller bug; an adapter that can detect it returns `idempotency_conflict` (cause `request_mismatch`).

Rationale: correlation and idempotency have different uniqueness rules (an order id is reused across attempts; a key is unique per operation) and
different failure semantics. A required field makes a charging call without a key a compile-time error. A single payment-level key would let an
initiation, a capture and a refund collide.

### 2. Retry versus new operation

- A **retry** of an existing operation reuses the **same key**. The caller MUST **persist the key before the call** and reuse exactly that key, with an
  identical request, on every retry of that operation.
- A **new operation** of the same kind uses a **new key** and a new application record. Examples: a second payment attempt after a decline; a second partial
  refund; a deliberate new capture after a definitive operation `failed`.
- A key MUST NOT be regenerated, derived from a counter that is not persisted, or derived from a clock to "retry".
- The application distinguishes the cases from its own persisted records, **before** calling: a same-key call must equal the persisted request snapshot;
  a mismatch is a caller bug (cause `request_mismatch`), never sent and never retried.

### 2a. Reference

`reference` is a **required** opaque caller correlation value on initiation (and on refunds, ADR-031). For initiation it is the application
`PaymentAttemptId` (ADR-037 §4), **not** an order id and **not** an idempotency key. Examples of "idempotency key" are removed from its documentation.

### 3. Key format and derivation

Opaque string, 1–255 characters, no whitespace or control characters. A violating key is `PaymentError("invalid_request")`. The format is deliberately
conservative so every provider's native limit accommodates it.

Callers derive keys deterministically from the business fact the operation settles. Recommended derivation (guidance, not a contract):

| Operation | Key |
|---|---|
| Initiation | `pay:{PaymentAttemptId}` (one key per attempt) |
| Capture | `capture:{PaymentAttemptId}:{n}` |
| Cancellation | `cancel:{PaymentAttemptId}:{n}` |
| Refund | `refund:{RefundAttemptId}` (one key per refund attempt, ADR-031) |

`n` starts at 1 and is incremented, **and persisted first**, only for a deliberate new capture or cancellation after a definitive operation `failed`.

### 4. Scope and lifetime

- **Scope:** `(provider binding, idempotencyKey)`. Keys are unique per binding (adapter plus merchant account), not globally and not across providers.
  Comity does not namespace keys; the caller does.
- **Lifetime:** at least the adapter's **documented retention window**, declared as data by the binding (`idempotencyRetentionSeconds`, ADR-037 rule C-8,
  which closes former Q1). Every Technology Adapter MUST document how it derives the value. The contract guarantees nothing beyond that window; a caller
  MUST NOT rely on a key after it expires.

### 5. Required behaviour

Let *request* mean the Comity-owned fields of the command. For initiation: `amount` (value **and** currency), `reference`, `capture` mode and `returnUrl`.
For a refund: `paymentId`, `amount` and `reference`, with `reason` excluded (ADR-031).

| Situation | Required behaviour |
|---|---|
| Same key, same request, original operation completed | **No second effect.** The provider replays the original result for the **same** `paymentId` (and the same `refundId` or `operationId` where applicable) |
| Same key, same request, original operation still in flight | **No second effect.** Either wait and return the same result, or fail with `idempotency_conflict` (cause `in_progress`), retryable with the same key |
| Same key, **different** request | **No effect.** `PaymentError("idempotency_conflict")` (cause `request_mismatch`). Never retried |
| Same key after a **declined** initiation (`state: "failed"`) | Returns the same `failed` result. A new attempt after a decline MUST use a new key |
| Original outcome unknown (timeout, `internal_error`) | See §6 |
| New key, same amount | A new, independent operation |

**A replay may report the original state.** A same-key replay returns the result the operation had when it was first accepted, which can be `pending` or
`requires_action` even if the payment has since progressed. A caller MUST NOT infer the **current** state from a replay; it uses lookup (ADR-037 §2). This
revises the earlier assumption that an initiation completes synchronously.

`idempotency_conflict` is one `PaymentErrorReason` (HTTP hint 409) with a `details.cause` discriminator (`request_mismatch` is a caller bug and MUST NOT be
retried; `in_progress` MAY be retried later with the same key).

### 6. Unknown outcomes and retention

1. A local timeout, `internal_error`, a lost response, or a crash between the call and recording its result leaves the **outcome unknown**. **A timeout is
   never proof that the provider-side operation failed.**
2. Within the retention window, retrying with the **same key and the same request** is the safe path; the provider resolves it per §5. Alternatively, when a
   `paymentId`, `operationId` or `refundId` is known, a lookup (ADR-037, ADR-031) is authoritative for the current state.
3. **After the retention window, the caller MUST NOT replay the operation** with the same key while its outcome is unknown: the provider may have forgotten
   the key and would execute a **new** operation. The attempt remains unresolved and is resolved by lookup or by attributed manual reconciliation
   (ADR-037 §6). Lookup **by reference** is deferred.
4. An unknown outcome of a payment initiation leaves its attempt **open**, which blocks a new attempt for the Order (§8).

### 7. What Comity guarantees versus what depends on the provider

| Guarantee | Held by |
|---|---|
| The key is required, well-formed, and passed to the adapter | Comity contract |
| Adapters MUST implement the table in §5 **or declare they cannot** (a binding with no native idempotency, `idempotencyRetentionSeconds` not `> 0`, cannot be composed: ADR-037 rule C-8) | Comity contract (conformance obligation) |
| That a duplicate key never produces a second effect | The **provider** (or the adapter on top of the provider's native idempotency) |
| Retention window, replay of stored response, concurrent-request handling | Provider / adapter, documented per adapter |
| Persisting keys, outcomes and attempt records | **The application's attempt store.** Comity keeps no idempotency table; neither does Commerce |

A provider integration that has **no** native idempotency support cannot honestly implement `PaymentProvider`. An application may add its own durable
store in front of such a provider; Comity does not supply one and this ADR does not make it a Core responsibility. The reference `MemoryPaymentProvider`
SHOULD implement the table in §5 in memory (it is a test double, not a production guarantee) so applications can test retry logic. **This ADR does not claim
durable idempotency without a durable implementation.**

### 7a. Adapter dependency boundary

An adapter implementing these commands has **no runtime dependency on `@comity/pricing`**. The `Money` values it must produce are built through a factory
injected at the composition boundary using the public Pricing APIs; type-only dependencies remain subject to the existing layering rules. The injected
factory is not part of the idempotency contract and changes none of its rules. The normative rule is ADR-037 §8a.

### 8. P5: at most one unresolved payment attempt per Order (caller obligation)

**P5 is an application-level invariant, not a Payment or Order domain rule.** The caller obligation is:

> An application MUST NOT start a new initiation (new `PaymentAttemptId`, new initiation key) for an Order while any previous payment attempt for that
> Order is unresolved, and MUST NOT create a new attempt for an Order that already has a successful (paid) attempt.

An attempt is **unresolved** from the moment its record is created (before the PSP call) until an authoritative result resolves it. A local timeout,
`internal_error`, a redirect return, elapsed time and Order cancellation do **not** resolve an attempt (ADR-037 §6 defines the attempt statuses, the
resolution classes and the authoritative results).

**Guarantees the attempt store MUST provide** (requirements on an application-owned store; Comity ships none):

| # | Guarantee |
|---|---|
| A1 | **Atomic conditional create:** insert an attempt for `(tenant, OrderId)` only if no attempt for that Order is unresolved or successful, as one atomic operation (for example a unique constraint over non-failed rows, or a per-order slot updated by compare-and-set). Of two concurrent creates exactly one succeeds; the loser returns the existing attempt |
| A2 | Version-checked status updates (ADR-029 / C1 semantics) that also enforce monotonic transitions: a terminal resolution never reopens |
| A3 | The record is persisted **before** the provider call, so a crash leaves an unresolved record, never no record |
| A4 | Uniqueness of `PaymentAttemptId`, of `(binding, idempotencyKey)` across all operation records, and of `(binding, paymentId)`; each provider-assigned identifier (`paymentId`, `operationId`, `refundId`) is set atomically if-absent **on the record of the one operation it identifies**. One payment attempt may have several operation records (initiation, capture and cancel invocations, refunds), each persisted before its call with its own operation type and key (ADR-037 §4 rule 2a) |

Without A1, two concurrent checkout requests can each create an attempt and a double charge becomes possible. Without A3 a crash can lose the key. In-memory
stores and Order's advisory `version` provide none of these guarantees across processes.

### 9. Production gate C3

**Acceptance and implementation of this ADR is the C3 gate** (`commerce/docs/architecture/12-implementation-roadmap.md`): **no production call of
`PaymentProvider.initiate`** (checkout charge, renewal charge or retry) may run before this ADR and ADR-037 are accepted and implemented. C3 does not by
itself permit persisted writes; those remain gated by C1 (ADR-029).

## Alternatives considered

| Alternative | Reason rejected |
|---|---|
| One idempotency key per payment (shared by initiation, capture, refund) | An initiation, a capture and several refunds would collide; legitimate repeated partial refunds could not be told apart from duplicates |
| Make `reference` required and give it idempotent semantics | Conflates correlation and deduplication; many providers treat a merchant reference as a label, not an idempotency key |
| Derive the key inside Comity from a hash of the request | Two legitimate identical payments (same amount, same reference) would collapse into one |
| Commerce wraps the port with its own idempotency table | A second provider abstraction and persistence concern in the wrong layer (ADR-020, ADR-021) |
| Optional `idempotencyKey` | Leaves the double-charge default; a charging call must not compile without it |
| Rely on webhook deduplication only | Does not prevent the first duplicate effect |
| Allow replay after the retention window | The provider may have forgotten the key and would create a new operation |
| Treat a timeout as failure and start a new attempt | Can double charge; the original may have succeeded |
| P5 inside the Payment domain contract | Payment holds no attempt state; the guarantee is a store atomicity property |
| Do nothing | Double charging on retry |

## Consequences

**Positive:** one portable rule across every command; double-effect prevention becomes a provider/adapter conformance property rather than an application
hope; unknown outcomes have an explicit, safe procedure; P5 makes concurrent or timed-out checkouts safe.

**Negative:** a breaking change to `PaymentRequest` (required `idempotencyKey` and `reference`); adapters for providers without native idempotency are blocked
or need an application-side store; the retention window makes very late retries a lookup or manual reconciliation problem; applications must build an
attempt store with A1–A4.

## Compatibility and migration

- `@comity/payment` is `0.9.x`: adding required fields is a breaking change delivered as a minor bump with a migration note. No code consumer of
  `PaymentRequest` exists outside the package's own provider and tests in the current workspace (verify at implementation).
- `idempotency_conflict` is an additive reason (`errors.md` §10).
- `reference` changes from optional to required with the clarified meaning of §2a; this is part of the same breaking change.

## Affected packages and consumers

`@comity/payment` (contract, errors, `MemoryPaymentProvider`); every future payment Technology Adapter; Commerce checkout, retry and refund flows and the
application-owned attempt store. `@comity/order` is unaffected structurally (it never imports `@comity/payment`).

## Relationship to existing ADRs

- **ADR-037** (companion, Accepted): lifecycle, capability rules (C-1 to C-10, including C-8 on retention), identifiers, attempt resolution and the
  webhook/reconciliation strategy. This ADR defines the keys; ADR-037 defines what they key.
- **ADR-031** (revised in place): reuses this key contract for each refund, with `RefundAttemptId` as the stable identity.
- **ADR-029** (unchanged): version-checked `save`, relied on by A2 and by the Order repository.
- **ADR-020 / ADR-021:** retries are application workflows; the idempotency contract is a capability of the payment port, not a workflow engine.
- **ADR-013 / ADR-032:** Order owns its payment snapshots and stays decoupled.

## Previously open questions

1. *Advertising the retention window programmatically:* **resolved**, as `idempotencyRetentionSeconds` on the binding descriptor (ADR-037 §5, rule C-8).
2. *Declaring idempotency conformance at composition:* **resolved**, by binding validation (ADR-037 §5; rule C-8).
3. *Status lookup / reconciliation:* **resolved** by ADR-037 (`retrieve`, `retrieveOperation`, ADR-031 `retrieveRefund`); lookup by reference remains deferred.
4. *`PaymentOutcome.paymentId` optionality:* **resolved**: required for `authorized` and `captured` (ADR-037 §3).

## Unresolved questions

1. The retention windows of the selected PSP are unknown until one is chosen (external dependency).
2. Lookup by `reference` after retention expiry is deferred.
