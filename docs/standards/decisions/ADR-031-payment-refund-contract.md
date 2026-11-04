# ADR-031 — Payment Refund Contract

> **Provenance:**
> - Canonical owner: comity-development
> - Raised by: Commerce Foundation v0 prerequisite **C4** (`commerce/docs/architecture/resolution/`)

**Status:** Proposed

## Context

`@comity/payment` can initiate a payment and nothing else. There is no way to return money. The status vocabulary even forbids it: `PaymentStatus` is
`authorized | captured | failed | cancelled`, with the explicit note *"Do not add: pending, processing, refunded, expired. Those are provider-specific
or workflow states, not core outcomes"* (`payment/src/contracts/payment-outcome.ts`). Any application that sells goods or services therefore has no
portable way to refund a customer, and no place to record the result.

That vocabulary rule is correct for `PaymentStatus`: a refund is not a state of the original payment, it is a **separate money movement** that refers to
it. This ADR adds that movement as its own operation and outcome and leaves `PaymentStatus` untouched.

### Verified repository facts

- `PaymentProvider` exposes only `initiate`; `PaymentRequest` is `{ amount; reference? }`; `PaymentOutcome` is `{ paymentId?; amount; status; provider?;
  reference?; authorizedAt?; capturedAt? }`.
- `PaymentOutcome.paymentId` is optional ("if available").
- `Money` is a non-negative `bigint` of minor units with an embedded `Currency` (`pricing/src/value-objects/money.ts`); zero is representable.
- Provider declines are outcomes, not errors; `PaymentErrorReason` is `invalid_request | internal_error`.
- `OrderPaymentSnapshot` records payment facts as an owned mirror; Order does not import `@comity/payment`.
- ADR-030 (Proposed) defines the idempotency-key contract this ADR reuses.

## Problem statement

Define the minimal portable refund operation and outcome such that:

1. a full or partial refund of a captured payment can be requested and its result observed;
2. repeated and conflicting requests are safe;
3. the contract states only what a provider abstraction can uphold;
4. Commerce can later translate *confirmed* refund outcomes into its own append-only reversal facts without `@comity/payment` knowing anything about
   orders.

Out of scope: voiding/cancelling an authorization, chargebacks and disputes, payouts, fees, and the Commerce `Order.recordReversal` operation.

## Decision

### 1. A separate, optional port

Refunds are a **separate optional contract**, `PaymentRefundProvider`, not a new method on `PaymentProvider`:

```ts
interface PaymentRefundProvider {
  refund(request: RefundRequest): Promise<Result<RefundOutcome, PaymentError>>;
}
```

Reason: adding a method to `PaymentProvider` would break every implementer and force providers without refund support to fake one. An adapter that
supports both implements both interfaces.

### 2. `RefundRequest`

| Field | Rule |
|---|---|
| `paymentId: string` | Required. Identifies the original payment (as returned by `initiate`). A payment with no `paymentId` cannot be refunded through this contract |
| `amount: Money` | Required, **strictly positive**, in the payment's currency. Zero → `invalid_request` |
| `idempotencyKey: string` | Required; same format, scope, lifetime and conflict rules as ADR-030 |
| `reference?: string` | Optional opaque caller correlation, as in `PaymentRequest` |
| `reason?: string` | Optional, opaque, informational; **not** part of request equivalence |

There is no `full: boolean`. A *full* refund is a refund whose amount equals the amount still refundable; a *partial* refund is any smaller positive
amount. One representation avoids two ways to say the same thing.

### 3. `RefundOutcome` and states

```ts
type RefundStatus = "pending" | "succeeded" | "failed";

interface RefundOutcome {
  refundId?: string;      // provider-assigned identity of this refund
  paymentId: string;      // the original payment, echoed
  amount: Money;          // amount of THIS refund, same currency as the payment
  status: RefundStatus;
  provider?: string;
  reference?: string;     // echoed
  refundedAt?: Instant;   // when the refund succeeded, if known
}
```

- `succeeded` is the only **confirmed** outcome: money has been returned.
- `failed` is a provider decline, reported as an **outcome**, not an error (the existing convention).
- `pending` exists because refunds are commonly asynchronous. It is **not** confirmation. Resolving `pending` to `succeeded`/`failed` is provider-specific
  (see Unresolved questions); this ADR defines no polling or webhook abstraction.
- `PaymentStatus` is not changed. `refunded` is never a payment status.

### 4. Relationship to the original payment

A refund is a distinct entity keyed by `refundId`; it **references** the payment by `paymentId` and never mutates it. The original `PaymentOutcome`
stays as it was reported. A refund's currency MUST equal the payment's currency. The refundable amount is *captured amount − Σ(non-failed refunds)*;
this quantity is owned by the provider, which is the only party that knows it.

### 5. Idempotency, repeats and conflicts

- Same `idempotencyKey`, same request (`paymentId`, `amount`, `reference`): **no second refund**; return the original `RefundOutcome` (same `refundId`).
- Same key, **different** request: no refund; `PaymentError("idempotency_conflict")`, cause `request_mismatch` (ADR-030).
- Same key while the first is in flight: no second refund; wait-and-replay or `idempotency_conflict` with cause `in_progress`.
- **Different keys**, same amount: two independent refunds. This is required: two partial refunds of the same amount are legitimate, which is exactly why a
  key is needed instead of deduplicating on content.
- Over-refund: two different keys that together exceed the refundable amount are **rejected by the provider**; the adapter maps that to a `failed`
  outcome. Comity cannot enforce the cumulative bound because it holds no payment state.

### 6. Errors

No new reason is added beyond ADR-030's `idempotency_conflict`. Unknown `paymentId`, non-positive amount, currency mismatch detectable from the request
alone, or a malformed key are `invalid_request`; transport/provider infrastructure failures are `internal_error`. Provider business refusals (not
refundable, window elapsed, already fully refunded) are `failed` outcomes.

### 7. Guaranteed by the abstraction versus provider-specific

| Guaranteed by the contract | Provider-specific (documented per adapter) |
|---|---|
| Request/outcome shape; positive amount; same currency; required key | Refund window and eligibility |
| No duplicate refund for a repeated key (conformance obligation, ADR-030 §5) | Cumulative-limit enforcement and its error mapping |
| Partial and full refunds expressed by amount only | Whether refunds settle synchronously (`succeeded`) or `pending` |
| Refund references, never mutates, the payment | Fees, timing, payment-method restrictions, partial-refund support for a given method |

## Alternatives considered

| Alternative | Reason rejected |
|---|---|
| Add `refund` to `PaymentProvider` | Breaks all implementers; forces providers without refunds to stub it |
| Add `refunded` / `partially_refunded` to `PaymentStatus` | Contradicts the explicit vocabulary rule; a payment can have many refunds, which is not a single status |
| Negative `Money` as a refund | `Money` is non-negative by design; changes a primitives-level invariant for one use case |
| `full: boolean` flag | Second representation of the same fact; ambiguous if the remaining amount changed |
| Final-states-only outcome (`succeeded | failed`) | Cannot be honest for asynchronous providers; would force adapters to block or lie |
| Make Comity enforce the cumulative refund bound | Needs payment state Comity does not hold |
| Include a Commerce `recordReversal` design here | Wrong layer; Commerce records facts from confirmed outcomes and is specified in its own architecture |

## Consequences

**Positive:** refunds become portable and idempotent; `PaymentStatus` stays small; providers without refunds are unaffected; Commerce has a defined
source for confirmed reversal facts.

**Negative:** one more port and outcome type; `pending` leaves final resolution to provider-specific means until a status/webhook decision exists;
refundability by `paymentId` exposes the existing weakness that `PaymentOutcome.paymentId` is optional.

## Compatibility and migration

Purely additive for existing code: a new optional contract, new types, no change to `PaymentProvider`, `PaymentRequest`, `PaymentOutcome` or
`PaymentStatus`. It depends on ADR-030 for the key contract and on `idempotency_conflict`. No ADR-008 edge is added (`payment → pricing` already exists;
`Instant` comes from `@comity/primitives`).

## Affected packages and consumers

`@comity/payment` (new contract, types, reference in-memory implementation); future payment Technology Adapters; Commerce reversal workflows, which
**translate `succeeded` outcomes into append-only Order reversal facts** and remain gated until this ADR is accepted and implemented. Commerce's
`Order.recordReversal` requires a `paymentId` on every reversal, which this ADR's `paymentId` makes attributable.

## Relationship to existing ADRs

ADR-030 (key contract reused); ADR-013 (Order owns its snapshots and does not import `@comity/payment`); ADR-020 / ADR-021 (refund workflows,
including when and why to refund, belong to the application); `errors.md` §10 (additive reasons).

## Unresolved questions

1. **Resolving `pending`.** There is no status lookup or webhook abstraction. How does an application learn that a `pending` refund became `succeeded`
   or `failed`? Needed before any workflow depends on asynchronous providers.
2. **`PaymentOutcome.paymentId` optionality.** Refunds need it. Make it required for `authorized`/`captured` (a breaking, discriminated-type change),
   or document that payments without it are not refundable?
3. **Voiding an authorization** (`PaymentStatus: "cancelled"` has no operation that produces it). Separate decision.
4. Whether `RefundOutcome` should expose a normalised failure reason. Currently none, matching `PaymentOutcome`.
5. Whether refunds to a method different from the original are in scope (currently: no; the contract refunds the original payment).
