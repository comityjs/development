# ADR-030 — Payment Initiation Idempotency

> **Provenance:**
> - Canonical owner: comity-development
> - Raised by: Commerce Foundation v0 prerequisite **C3** (`commerce/docs/architecture/resolution/`)

**Status:** Proposed

## Context

`PaymentProvider.initiate(request)` is the only operation of `@comity/payment`. A `PaymentRequest` is `{ amount: Money; reference?: string }`, where
`reference` is documented as an *"opaque caller-owned reference (e.g., order ID, cart ID, idempotency key)"* (`payment/src/contracts/payment-request.ts`).
Nothing requires it, nothing specifies what a provider must do when it sees the same value twice, and the in-memory provider derives a deterministic
`paymentId` from `reference` without deduplicating anything.

A caller that retries after a timeout, a crash between `initiate` and persisting the outcome, a queue redelivery, or a renewal job re-run cannot know
whether the first attempt charged. Without a contract, the retry may charge twice. Webhook deduplication does not help: it deduplicates *notifications*,
not *initiations*.

### Verified repository facts

- `PaymentRequest.reference` is optional and unspecified; its JSDoc lists "idempotency key" only as an example.
- `PaymentOutcome.paymentId` is optional ("if available"); `PaymentStatus` is `authorized | captured | failed | cancelled`; a provider decline is an
  outcome with status `failed`, not an error.
- `PaymentErrorReason` is `invalid_request | internal_error`.
- `@comity/payment` depends on `@comity/pricing` (registered ADR-008 edge). Order records payment outcomes as owned snapshots and does not import
  `@comity/payment` (`OrderPaymentSnapshot` documentation).
- `@comity/payment` has no operation to look up a payment or its status.
- Providers differ: some offer a native idempotency key (typically a separate request header with a bounded retention window), others treat a merchant
  `reference` as a plain label.

## Problem statement

Define a stable, portable idempotency contract for payment initiation, suitable for checkout, subscription renewal and retries, that:

1. prevents a duplicate charge when the same attempt is submitted more than once;
2. promises only what a provider abstraction can honestly uphold;
3. keeps correlation (what the payment is for) separate from deduplication (is this the same attempt).

## Decision

### 1. A separate, required idempotency key

`PaymentRequest` gains a **required** `idempotencyKey: string`. `reference` stays an optional opaque correlation value with its present meaning.

Rationale: correlation and idempotency have different uniqueness rules (an order id is reused across several attempts; a key is unique per attempt)
and different failure semantics. Overloading `reference` would also silently change the meaning of every existing caller's value. A required field makes
a charging call without a key a compile-time error instead of a runtime hope.

### 2. Key format

Opaque string, 1–255 characters, no whitespace or control characters. A violating key is `PaymentError("invalid_request")`. The format is deliberately
conservative so every provider's native limit accommodates it. Callers derive keys deterministically from the business fact the attempt settles (for
Commerce: order id + attempt number, invoice id + period + attempt); a **retry** of the same attempt reuses the key, a **deliberate new attempt** uses a
new one.

### 3. Scope and lifetime

- **Scope:** `(provider binding, idempotencyKey)`. Keys are unique per `PaymentProvider` instance/merchant account, not globally and not across
  providers. Comity does not namespace keys; the caller does.
- **Lifetime:** at least the adapter's **documented retention window**. Every Technology Adapter MUST document it. The contract guarantees nothing
  beyond that window; a caller MUST NOT rely on a key after it expires.

### 4. Required behaviour

Let *request* mean the Comity-owned fields `amount` (value **and** currency) and `reference`.

| Situation | Required behaviour |
|---|---|
| Same key, same request, original attempt completed | **No new charge.** Return the original `PaymentOutcome` (same `paymentId`, same `status`) |
| Same key, same request, original attempt still in flight | **No second charge.** Either wait and return the same outcome, or fail with `idempotency_conflict` (cause `in_progress`) |
| Same key, **different** request | **No charge.** `PaymentError("idempotency_conflict")` (cause `request_mismatch`) |
| Same key after a **declined** attempt (`status: "failed"`) | Returns the same `failed` outcome. A new attempt after a decline MUST use a new key |
| Original attempt's outcome unknown (timeout, `internal_error`) | Retrying with the **same** key is the safe path; the provider resolves it per rows above |
| New key, same amount | A new, independent payment |

`idempotency_conflict` is one new `PaymentErrorReason` (HTTP hint 409) with a `details.cause` discriminator, instead of two reasons (`errors.md`
discourages reason explosion). `request_mismatch` is a caller bug and MUST NOT be retried; `in_progress` MAY be retried later with the same key.

### 5. What Comity guarantees versus what depends on the provider

| Guarantee | Held by |
|---|---|
| The key is required, well-formed, and passed to the adapter | Comity contract |
| Adapters MUST implement the table in §4 **or declare they cannot** | Comity contract (conformance obligation) |
| That a duplicate key never produces a second charge | The **provider** (or the adapter on top of the provider's native idempotency) |
| Retention window, replay of stored response, concurrent-request handling | Provider / adapter, documented per adapter |
| Persisting keys or outcomes | **Nobody in Comity.** Comity keeps no idempotency table; neither does Commerce |

A provider integration that has **no** native idempotency support cannot honestly implement `PaymentProvider`. An application may add its own durable
store in front of such a provider; Comity does not supply one and this ADR does not make it a Core responsibility. The reference
`MemoryPaymentProvider` SHOULD implement the table in §4 in memory (it is a test double, not a production guarantee) so applications can test retry
logic.

### 6. Relationship of outcome and identity

The same key always maps to the same `paymentId`. Callers can therefore treat `(provider, paymentId)` as the stable identity of the attempt's result.
This is what allows an Order to deduplicate its payment facts by `(paymentId, status)`.

## Alternatives considered

| Alternative | Reason rejected |
|---|---|
| Make `reference` required and give it idempotent semantics | Conflates correlation and deduplication; changes meaning for every existing caller; many providers treat a merchant reference as a label, not an idempotency key |
| Derive the key inside Comity from a hash of the request | Two legitimate identical payments (same amount, same reference) would collapse into one |
| Commerce wraps the port with its own idempotency table | A second provider abstraction and persistence concern in the wrong layer (ADR-020, ADR-021) |
| Optional `idempotencyKey` | Leaves the double-charge default; a charging call must not compile without it |
| Rely on webhook deduplication only | Does not prevent the first duplicate charge |
| Do nothing | Double charging on retry |

## Consequences

**Positive:** one portable rule; double-charge prevention becomes a provider/adapter conformance property rather than an application hope; checkout,
renewals and retries share one mechanism.

**Negative:** a breaking change to `PaymentRequest` (required field); adapters for providers without native idempotency are blocked or need an
application-side store; the retention window makes very late retries an application reconciliation problem.

## Compatibility and migration

- `@comity/payment` is `0.9.x`: adding a required field is a breaking change delivered as a minor bump with a migration note. No code consumer of
  `PaymentRequest` exists outside the package's own provider and tests in the current workspace (verify at implementation).
- `idempotency_conflict` is an additive reason (`errors.md` §10).
- `reference` is unchanged.

## Affected packages and consumers

`@comity/payment` (contract, errors, `MemoryPaymentProvider`); every future payment Technology Adapter; Commerce checkout, retry and renewal flows
(they pass a deterministic key per attempt). `@comity/order` is unaffected (it never imports `@comity/payment`).

## Relationship to existing ADRs

ADR-020 / ADR-021 (Accepted): retries and renewals are application workflows; the idempotency contract is a capability of the payment port, not a
workflow engine. ADR-013: Order owns its payment snapshots and stays decoupled. ADR-031 reuses this key contract for refunds.

## Unresolved questions

1. Should an adapter be able to advertise its retention window programmatically (metadata) rather than only in documentation?
2. Should adapters declare idempotency conformance as a capability flag so applications can fail fast at composition time?
3. `@comity/payment` has no status lookup. After the retention window, or when an outcome is genuinely unknown, there is no way to *ask* what happened.
   A lookup/reconciliation operation (or a webhook abstraction) is a separate decision.
4. Whether `PaymentOutcome.paymentId` should become required for `authorized`/`captured` (also needed by ADR-031).
